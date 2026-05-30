import assert from "node:assert/strict";
import test from "node:test";
import { applyTaxes, getUkOffsetMinutes, isMarketOpen, priceFromCapUC } from "./rules.ts";

test("priceFromCapUC converts credits into the displayed price", () => {
  assert.equal(priceFromCapUC(10000), 1);
  assert.equal(priceFromCapUC(34567), 3.4567);
});

test("applyTaxes leaves losses and goal gains unchanged", () => {
  assert.deepEqual(applyTaxes("decay", -5, 60000), { effectiveDeltaUC: -5, taxed: false });
  assert.deepEqual(applyTaxes("goal", 400, 60000), { effectiveDeltaUC: 400, taxed: false });
});

test("applyTaxes applies the existing progressive habit tax thresholds", () => {
  assert.deepEqual(applyTaxes("good", 100, 20000), { effectiveDeltaUC: 100, taxed: false });
  assert.deepEqual(applyTaxes("good", 100, 20001), { effectiveDeltaUC: 80, taxed: true });
  assert.deepEqual(applyTaxes("bad", 100, 30001), { effectiveDeltaUC: 75, taxed: true });
  assert.deepEqual(applyTaxes("good", 100, 50001), { effectiveDeltaUC: 50, taxed: true });
});

test("applyTaxes applies the existing addiction tax thresholds", () => {
  assert.deepEqual(applyTaxes("addiction", 200, 20001), { effectiveDeltaUC: 150, taxed: true });
  assert.deepEqual(applyTaxes("addiction", 200, 30001), { effectiveDeltaUC: 100, taxed: true });
  assert.deepEqual(applyTaxes("addiction", 200, 50001), { effectiveDeltaUC: 50, taxed: true });
});

test("London market hours remain closed from 04:00 through 11:59", () => {
  assert.equal(isMarketOpen(new Date("2026-01-15T03:00:00Z")), true);
  assert.equal(isMarketOpen(new Date("2026-01-15T04:00:00Z")), false);
  assert.equal(isMarketOpen(new Date("2026-01-15T11:59:00Z")), false);
  assert.equal(isMarketOpen(new Date("2026-01-15T12:00:00Z")), true);
});

test("London offset helper accounts for daylight saving time", () => {
  assert.equal(getUkOffsetMinutes(new Date("2026-01-15T12:00:00Z")), 0);
  assert.equal(getUkOffsetMinutes(new Date("2026-07-15T12:00:00Z")), 60);
});
