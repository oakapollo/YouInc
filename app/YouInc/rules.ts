export type DeltaKind = "goal" | "good" | "bad" | "addiction" | "buy" | "decay";

export function priceFromCapUC(marketCapUC: number) {
  return marketCapUC / 10000;
}

export function applyTaxes(kind: DeltaKind, deltaUC: number, marketCapUC: number) {
  // tax only on gains
  if (deltaUC <= 0) return { effectiveDeltaUC: deltaUC, taxed: false };

  const price = priceFromCapUC(marketCapUC);

  let multiplier = 1;

  // >= 20.00 U$
  if (price >= 20.0) {
    if (kind === "addiction") multiplier = 0.25; // taxed 75%
    if (kind === "good" || kind === "bad") multiplier = 0.5; // taxed 50%
  }
  // >= 5.00 U$
  else if (price >= 5.0) {
    if (kind === "addiction") multiplier = 0.5; // taxed 50%
    if (kind === "good" || kind === "bad") multiplier = 0.75; // taxed 25%
  }

  const effectiveDeltaUC = Math.round(deltaUC * multiplier);
  return { effectiveDeltaUC, taxed: effectiveDeltaUC !== deltaUC };
}

// Flat window: 04:00–11:59 (UK local time)
export function isMarketOpen(now = new Date()) {
  const h = now.getHours();
  return !(h >= 4 && h < 12);
}