export type StatsTimeframe = "1w" | "1m" | "1y" | "all";
export type BehaviourCategory = "good" | "bad" | "addiction";

export type Tx = {
  id: string;
  ts: number;
  deltaUC: number;
  label: string;
};

export type WeekdayGrowth = {
  dayIndex: number;
  label: string;
  shortLabel: string;
  averageGrowthPct: number;
  logCount: number;
};

export type BehaviourRow = {
  category: BehaviourCategory;
  title: string;
  count: number;
  mostLoggedDay: string;
};

export type StatsResult = {
  weekdayGrowth: WeekdayGrowth[];
  bestDays: WeekdayGrowth[];
  worstDays: WeekdayGrowth[];
  behaviourRows: BehaviourRow[];
  logCount: number;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getTimeframeStart(timeframe: StatsTimeframe, now = Date.now()) {
  if (timeframe === "all") return null;
  const days = timeframe === "1w" ? 7 : timeframe === "1m" ? 30 : 365;
  return now - days * 24 * 60 * 60 * 1000;
}

export function getCustomPeriodBounds(fromDate: string, toDate: string) {
  if (!isIsoDate(fromDate) || !isIsoDate(toDate)) return null;

  const startTs = getLondonDayStart(fromDate);
  const endExclusiveTs = getLondonDayStart(addUtcDays(toDate, 1));

  if (startTs >= endExclusiveTs) return null;
  return { startTs, endExclusiveTs };
}

export function buildStats(
  txDesc: Tx[],
  currentMarketCapUC: number,
  startTs: number | null,
  endExclusiveTs: number | null = null,
  now = Date.now(),
  skippedLogDates: string[] = []
): StatsResult {
  const txAsc = [...txDesc].sort((a, b) => a.ts - b.ts);
  let runningCapUC = Math.max(0, currentMarketCapUC - txAsc.reduce((total, tx) => total + tx.deltaUC, 0));
  const growthByDay = DAY_LABELS.map(() => ({ totalPct: 0, count: 0 }));
  const behaviourCounts = new Map<string, { category: BehaviourCategory; title: string; count: number; days: number[] }>();
  const closedDayEndTs = Math.min(endExclusiveTs ?? Number.POSITIVE_INFINITY, getLondonDayStart(getLondonDateKey(now)));
  const dailyCloseUC = new Map<string, number>();
  let logCount = 0;

  for (const tx of txAsc) {
    runningCapUC = Math.max(0, runningCapUC + tx.deltaUC);

    if (tx.ts < closedDayEndTs) {
      dailyCloseUC.set(getLondonDateKey(tx.ts), runningCapUC);
    }

    if ((startTs !== null && tx.ts < startTs) || (endExclusiveTs !== null && tx.ts >= endExclusiveTs)) continue;

    const dayIndex = getLondonDayIndex(tx.ts);
    logCount += 1;

    const behaviour = parseBehaviourLabel(tx.label);
    if (!behaviour) continue;

    const key = `${behaviour.category}:${behaviour.title.toLowerCase()}`;
    const current = behaviourCounts.get(key) ?? { ...behaviour, count: 0, days: Array(7).fill(0) };
    current.count += 1;
    current.days[dayIndex] += 1;
    behaviourCounts.set(key, current);
  }

  addClosedDayGrowth(growthByDay, dailyCloseUC, txAsc, currentMarketCapUC, startTs, closedDayEndTs, skippedLogDates);

  const weekdayGrowth = DAY_LABELS.map((label, dayIndex) => {
    const day = growthByDay[dayIndex];
    return {
      dayIndex,
      label,
      shortLabel: DAY_SHORT_LABELS[dayIndex],
      averageGrowthPct: day.count > 0 ? day.totalPct / day.count : 0,
      logCount: day.count,
    };
  });

  return {
    weekdayGrowth,
    bestDays: [...weekdayGrowth].filter((day) => day.logCount > 0).sort(compareGrowthDesc).slice(0, 2),
    worstDays: [...weekdayGrowth].filter((day) => day.logCount > 0).sort(compareGrowthAsc).slice(0, 2),
    behaviourRows: buildBehaviourRows(behaviourCounts),
    logCount,
  };
}

function addClosedDayGrowth(
  growthByDay: { totalPct: number; count: number }[],
  dailyCloseUC: Map<string, number>,
  txAsc: Tx[],
  currentMarketCapUC: number,
  startTs: number | null,
  closedDayEndTs: number,
  skippedLogDates: string[]
) {
  if (txAsc.length === 0) return;

  let previousCloseUC = Math.max(0, currentMarketCapUC - txAsc.reduce((total, tx) => total + tx.deltaUC, 0));
  let dateKey = getLondonDateKey(txAsc[0].ts);

  while (getLondonDayStart(dateKey) < closedDayEndTs) {
    const dayStartTs = getLondonDayStart(dateKey);
    const nextDateKey = addUtcDays(dateKey, 1);
    const dayEndTs = getLondonDayStart(nextDateKey);
    const closeUC = dailyCloseUC.get(dateKey) ?? previousCloseUC;

    if ((startTs === null || dayEndTs > startTs) && previousCloseUC > 0 && !skippedLogDates.includes(dateKey)) {
      const dayIndex = getLondonDayIndex(dayStartTs);
      growthByDay[dayIndex].totalPct += ((closeUC - previousCloseUC) / previousCloseUC) * 100;
      growthByDay[dayIndex].count += 1;
    }

    previousCloseUC = closeUC;
    dateKey = nextDateKey;
  }
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addUtcDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getLondonDayStart(value: string) {
  const utcMidnight = Date.parse(`${value}T00:00:00Z`);
  return utcMidnight - getLondonOffsetMinutes(new Date(utcMidnight)) * 60 * 1000;
}

export function getLondonDateKey(ts: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

function getLondonOffsetMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "shortOffset",
  }).formatToParts(now);
  const tz = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);

  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0));
}

export function parseBehaviourLabel(label: string) {
  const normalized = label.replace(/\s+\(taxed\)$/i, "");
  const match = normalized.match(/^(.*?) \((Good habit|Bad habit|Addiction) · (Hold|Sold)\)$/i);
  if (!match) return null;

  const categoryLabel = match[2].toLowerCase();
  const category: BehaviourCategory =
    categoryLabel === "good habit" ? "good" : categoryLabel === "bad habit" ? "bad" : "addiction";

  return { category, title: match[1].trim() };
}

function buildBehaviourRows(
  behaviourCounts: Map<string, { category: BehaviourCategory; title: string; count: number; days: number[] }>
) {
  const rows = Array.from(behaviourCounts.values()).map((row) => ({
    category: row.category,
    title: row.title,
    count: row.count,
    mostLoggedDay: DAY_LABELS[getHighestDayIndex(row.days)],
  }));

  return (["good", "bad", "addiction"] as BehaviourCategory[]).flatMap((category) =>
    rows
      .filter((row) => row.category === category)
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, 3)
  );
}

function getLondonDayIndex(ts: number) {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(new Date(ts));

  return DAY_SHORT_LABELS.indexOf(weekday);
}

function getHighestDayIndex(days: number[]) {
  return days.reduce((bestIndex, count, index) => (count > days[bestIndex] ? index : bestIndex), 0);
}

function compareGrowthDesc(a: WeekdayGrowth, b: WeekdayGrowth) {
  return b.averageGrowthPct - a.averageGrowthPct || a.dayIndex - b.dayIndex;
}

function compareGrowthAsc(a: WeekdayGrowth, b: WeekdayGrowth) {
  return a.averageGrowthPct - b.averageGrowthPct || a.dayIndex - b.dayIndex;
}
