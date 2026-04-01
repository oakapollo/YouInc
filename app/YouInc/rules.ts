export type DeltaKind = "goal" | "good" | "bad" | "addiction" | "buy" | "decay";

export function priceFromCapUC(marketCapUC: number) {
  return marketCapUC / 10000;
}

export function applyTaxes(kind: DeltaKind, deltaUC: number, marketCapUC: number) {
  // Tax only applies to positive gains.
  // Negative deltas (including decay and "sold" actions) stay unchanged.
  if (deltaUC <= 0) {
    return { effectiveDeltaUC: deltaUC, taxed: false };
  }

  // Goals remain tax-free.
  if (kind === "goal") {
    return { effectiveDeltaUC: deltaUC, taxed: false };
  }

  const price = priceFromCapUC(marketCapUC);
  let multiplier = 1;

  // Price > 5.00
  // Good Habits: 50% tax  => keep 50%
  // Bad Habits: 50% tax   => keep 50%
  // Addictions: 75% tax   => keep 25%
  if (price > 5) {
    if (kind === "good" || kind === "bad") multiplier = 0.5;
    if (kind === "addiction") multiplier = 0.25;
  }
  // Price > 3.00
  // Good Habits: 25% tax  => keep 75%
  // Bad Habits: 25% tax   => keep 75%
  // Addictions: 50% tax   => keep 50%
  else if (price > 3) {
    if (kind === "good" || kind === "bad") multiplier = 0.75;
    if (kind === "addiction") multiplier = 0.5;
  }
  // Price > 2.00
  // Good Habits: 20% tax  => keep 80%
  // Bad Habits: 20% tax   => keep 80%
  // Addictions: 25% tax   => keep 75%
  else if (price > 2) {
    if (kind === "good" || kind === "bad") multiplier = 0.8;
    if (kind === "addiction") multiplier = 0.75;
  }

  const effectiveDeltaUC = Math.round(deltaUC * multiplier);
  return {
    effectiveDeltaUC,
    taxed: effectiveDeltaUC !== deltaUC,
  };
}

export function getUkHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Europe/London",
    }).format(now)
  );
}

export function getUkOffsetMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "shortOffset",
  }).formatToParts(now);

  const tz = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);

  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);

  return sign * (hours * 60 + minutes);
}

export function isMarketOpen(now = new Date()) {
  const h = getUkHour(now);
  return !(h >= 4 && h < 12);
}