import assert from "node:assert/strict";
import test from "node:test";
import { buildStats, getTimeframeStart, parseBehaviourLabel, type Tx } from "./stats.ts";

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

  const stats = buildStats(tx, 10200, null);
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

  const stats = buildStats(tx, 10020, null);
  assert.deepEqual(stats.behaviourRows[0], { category: "good", title: "Read", count: 3, mostLoggedDay: "Monday" });
  assert.deepEqual(stats.behaviourRows[1], { category: "bad", title: "Sugar", count: 1, mostLoggedDay: "Monday" });
});

test("timeframe filtering keeps earlier transactions in the reconstructed price baseline", () => {
  const tx: Tx[] = [
    { id: "2", ts: tuesday, deltaUC: 100, label: "Read (Good habit · Hold)" },
    { id: "1", ts: monday, deltaUC: 100, label: "Read (Good habit · Hold)" },
  ];

  const stats = buildStats(tx, 10200, tuesday);
  assert.equal(stats.logCount, 1);
  assert.equal(stats.weekdayGrowth[2].averageGrowthPct, 100 / 101);
});

test("getTimeframeStart supports all filters", () => {
  const now = Date.parse("2026-05-30T12:00:00Z");
  assert.equal(getTimeframeStart("1w", now), now - 7 * 24 * 60 * 60 * 1000);
  assert.equal(getTimeframeStart("1m", now), now - 30 * 24 * 60 * 60 * 1000);
  assert.equal(getTimeframeStart("1y", now), now - 365 * 24 * 60 * 60 * 1000);
  assert.equal(getTimeframeStart("all", now), null);
});
