import assert from "node:assert/strict";
import test from "node:test";
import { buildStats, getCustomPeriodBounds, getTimeframeStart, parseBehaviourLabel, type Tx } from "./stats.ts";

const monday = Date.parse("2026-05-25T12:00:00Z");
const tuesday = Date.parse("2026-05-26T12:00:00Z");
const wednesday = Date.parse("2026-05-27T12:00:00Z");

test("parseBehaviourLabel recognizes existing behaviour labels and ignores resets", () => {
  assert.deepEqual(parseBehaviourLabel("Reading (Good habit · Hold)"), { category: "good", title: "Reading" });
  assert.deepEqual(parseBehaviourLabel("Smoking (Addiction · Sold) (taxed)"), { category: "addiction", title: "Smoking" });
  assert.equal(parseBehaviourLabel("Smoking (Addiction · Reset charges)"), null);
  assert.equal(parseBehaviourLabel("BUY: Walk"), null);
});

test("buildStats reconstructs percentage movement and ranks weekdays", () => {
  const tx: Tx[] = [
    { id: "3", ts: wednesday, deltaUC: 300, label: "Run (Good habit · Hold)" },
    { id: "2", ts: tuesday, deltaUC: -200, label: "Sugar (Bad habit · Sold)" },
    { id: "1", ts: monday, deltaUC: 100, label: "Run (Good habit · Hold)" },
  ];

  const stats = buildStats(tx, 10200, null, null, Date.parse("2026-05-28T12:00:00Z"));
  assert.equal(stats.logCount, 3);
  assert.equal(stats.weekdayGrowth[1].averageGrowthPct, 1);
  assert.ok(stats.weekdayGrowth[2].averageGrowthPct < 0);
  assert.equal(stats.bestDays[0].label, "Wednesday");
  assert.equal(stats.worstDays[0].label, "Tuesday");
});

test("buildStats returns top three behaviours per category with the most active weekday", () => {
  const tx: Tx[] = [
    { id: "4", ts: tuesday, deltaUC: 10, label: "Read (Good habit · Hold)" },
    { id: "3", ts: monday + 1000, deltaUC: 10, label: "Read (Good habit · Hold)" },
    { id: "2", ts: monday, deltaUC: 10, label: "Read (Good habit · Hold)" },
    { id: "1", ts: monday, deltaUC: -10, label: "Sugar (Bad habit · Sold)" },
  ];

  const stats = buildStats(tx, 10020, null, null, Date.parse("2026-05-28T12:00:00Z"));
  assert.deepEqual(stats.behaviourRows[0], { category: "good", title: "Read", count: 3, mostLoggedDay: "Monday" });
  assert.deepEqual(stats.behaviourRows[1], { category: "bad", title: "Sugar", count: 1, mostLoggedDay: "Monday" });
});

test("weekday growth uses the daily close compared with the previous daily close", () => {
  const tx: Tx[] = [
    { id: "3", ts: tuesday + 1000, deltaUC: 100, label: "Read (Good habit · Hold)" },
    { id: "2", ts: tuesday, deltaUC: 100, label: "Read (Good habit · Hold)" },
    { id: "1", ts: monday, deltaUC: 100, label: "Read (Good habit · Hold)" },
  ];

  const stats = buildStats(tx, 10300, null, null, Date.parse("2026-05-28T12:00:00Z"));
  assert.equal(stats.logCount, 3);
  assert.equal(stats.weekdayGrowth[1].averageGrowthPct, 1);
  assert.equal(stats.weekdayGrowth[2].averageGrowthPct, 200 / 101);
});

test("weekday growth excludes the current London day until its candle closes", () => {
  const tx: Tx[] = [
    { id: "2", ts: tuesday, deltaUC: 100, label: "Read (Good habit · Hold)" },
    { id: "1", ts: monday, deltaUC: 100, label: "Read (Good habit · Hold)" },
  ];

  const stats = buildStats(tx, 10200, null, null, Date.parse("2026-05-26T18:00:00Z"));
  assert.equal(stats.logCount, 2);
  assert.equal(stats.weekdayGrowth[1].averageGrowthPct, 1);
  assert.equal(stats.weekdayGrowth[2].logCount, 0);
});

test("custom period filtering includes both selected London calendar days", () => {
  const bounds = getCustomPeriodBounds("2026-05-26", "2026-05-26");
  assert.deepEqual(bounds, {
    startTs: Date.parse("2026-05-25T23:00:00Z"),
    endExclusiveTs: Date.parse("2026-05-26T23:00:00Z"),
  });

  const tx: Tx[] = [
    { id: "3", ts: Date.parse("2026-05-26T23:00:00Z"), deltaUC: 100, label: "Read (Good habit · Hold)" },
    { id: "2", ts: Date.parse("2026-05-26T12:00:00Z"), deltaUC: 100, label: "Read (Good habit · Hold)" },
    { id: "1", ts: Date.parse("2026-05-25T22:59:59Z"), deltaUC: 100, label: "Read (Good habit · Hold)" },
  ];

  assert.equal(buildStats(tx, 10300, bounds.startTs, bounds.endExclusiveTs, Date.parse("2026-05-28T12:00:00Z")).logCount, 1);
});

test("custom period bounds reject missing dates and reversed ranges", () => {
  assert.equal(getCustomPeriodBounds("", "2026-05-26"), null);
  assert.equal(getCustomPeriodBounds("2026-05-27", "2026-05-26"), null);
  assert.equal(getCustomPeriodBounds("2026-02-31", "2026-03-02"), null);
});

test("getTimeframeStart supports all filters", () => {
  const now = Date.parse("2026-05-30T12:00:00Z");
  assert.equal(getTimeframeStart("1w", now), now - 7 * 24 * 60 * 60 * 1000);
  assert.equal(getTimeframeStart("1m", now), now - 30 * 24 * 60 * 60 * 1000);
  assert.equal(getTimeframeStart("1y", now), now - 365 * 24 * 60 * 60 * 1000);
  assert.equal(getTimeframeStart("all", now), null);
});
