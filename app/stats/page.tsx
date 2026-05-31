"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../providers";
import { db } from "../../lib/firebase";
import styles from "../YouInc/youinc.module.css";
import {
  buildStats,
  getCustomPeriodBounds,
  getLondonDateKey,
  getLondonDayStart,
  getTimeframeStart,
  type BehaviourCategory,
  type StatsResult,
  type StatsTimeframe,
  type Tx,
} from "./stats";

const TIMEFRAMES: StatsTimeframe[] = ["1w", "1m", "1y", "all"];

const EMPTY_STATS: StatsResult = {
  weekdayGrowth: [],
  bestDays: [],
  worstDays: [],
  behaviourRows: [],
  logCount: 0,
};

export default function StatsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [timeframe, setTimeframe] = useState<StatsTimeframe>("1m");
  const [customPeriodOpen, setCustomPeriodOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tx, setTx] = useState<Tx[]>([]);
  const [marketCapUC, setMarketCapUC] = useState(10000);
  const [skippedLogDates, setSkippedLogDates] = useState<string[]>([]);
  const [repairDate, setRepairDate] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [showMissedDate, setShowMissedDate] = useState(false);
  const [stats, setStats] = useState<StatsResult>(EMPTY_STATS);
  const [dataLoading, setDataLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customBounds = useMemo(() => getCustomPeriodBounds(customFrom, customTo), [customFrom, customTo]);
  const todayLondon = getLondonDateKey(Date.now());
  const yesterdayLondon = getLondonDateKey(getLondonDayStart(todayLondon) - 1);
  const selectedDayTx = useMemo(() => {
    if (!repairDate) return [];
    const start = getLondonDayStart(repairDate);
    const end = getLondonDayStart(getNextDateKey(repairDate));
    return tx.filter((entry) => entry.ts >= start && entry.ts < end).sort((a, b) => b.ts - a.ts);
  }, [repairDate, tx]);
  const selectedBehaviourTx = useMemo(() => selectedDayTx.filter((entry) => !isDecayTx(entry)), [selectedDayTx]);
  const selectedDateSkipped = skippedLogDates.includes(repairDate);
  const missedLogs = Boolean(repairDate) && selectedBehaviourTx.length === 0 && !selectedDateSkipped;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRepairDate(params.get("repair") || yesterdayLondon);
  }, [yesterdayLondon]);

  useEffect(() => {
    setShowMissedDate(false);
  }, [repairDate]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;

    setDataLoading(true);
    setError(null);

    return onSnapshot(
      doc(db, "users", user.uid, "store", "main"),
      (snapshot) => {
        const data = snapshot.data();
        setTx(Array.isArray(data?.tx) ? (data.tx as Tx[]) : []);
        setMarketCapUC(typeof data?.marketCapUC === "number" ? data.marketCapUC : 10000);
        setSkippedLogDates(Array.isArray(data?.skippedLogDates) ? (data.skippedLogDates as string[]) : []);
        setDataLoading(false);
      },
      (snapshotError) => {
        console.error("Stats snapshot failed:", snapshotError);
        setError("We couldn't load your stats. Check your connection and try again.");
        setDataLoading(false);
      }
    );
  }, [user]);

  useEffect(() => {
    if (dataLoading) return;

    if (customPeriodOpen && !customBounds) {
      setStats(EMPTY_STATS);
      setProcessing(false);
      return;
    }

    setProcessing(true);
    const timer = window.setTimeout(() => {
      const startTs = customPeriodOpen ? customBounds?.startTs ?? null : getTimeframeStart(timeframe);
      const endExclusiveTs = customPeriodOpen ? customBounds?.endExclusiveTs ?? null : null;
      setStats(buildStats(tx, marketCapUC, startTs, endExclusiveTs, Date.now(), skippedLogDates));
      setProcessing(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [customBounds, customPeriodOpen, dataLoading, marketCapUC, skippedLogDates, timeframe, tx]);

  async function skipSelectedDate() {
    if (!user || !repairDate) return;
    setSkipping(true);
    setError(null);

    try {
      const nextSkippedDates = Array.from(new Set([...skippedLogDates, repairDate])).sort();
      await setDoc(doc(db, "users", user.uid, "store", "main"), { skippedLogDates: nextSkippedDates }, { merge: true });
    } catch (skipError) {
      console.error("Skipping missed logs failed:", skipError);
      setError("We couldn't skip that date. Check your connection and try again.");
    } finally {
      setSkipping(false);
    }
  }

  const chartScale = useMemo(
    () => Math.max(0.01, ...stats.weekdayGrowth.map((day) => Math.abs(day.averageGrowthPct))),
    [stats.weekdayGrowth]
  );

  if (authLoading || dataLoading) {
    return <StatsLoading text="Loading your behaviour logs..." />;
  }

  if (!user) return null;

  return (
    <main className={styles.page}>
      <div className={styles.statsShell}>
        <header className={styles.statsHeader}>
          <div>
            <div className={styles.statsEyebrow}>YouInc analytics</div>
            <h1 className={styles.statsTitle}>Stats</h1>
            <p className={styles.statsSubtitle}>Your behaviour patterns, calculated from your logged actions.</p>
          </div>
          <a className={styles.statsBackLink} href="/YouInc">
            Back to dashboard
          </a>
        </header>

        <div className={styles.statsToolbar} aria-label="Stats timeframe">
          {TIMEFRAMES.map((option) => (
            <button
              className={`${styles.statsTfBtn} ${timeframe === option ? styles.statsTfBtnActive : ""}`}
              key={option}
              onClick={() => {
                setCustomPeriodOpen(false);
                setTimeframe(option);
              }}
              type="button"
            >
              {option.toUpperCase()}
            </button>
          ))}
          <button
            className={`${styles.statsTfBtn} ${customPeriodOpen ? styles.statsTfBtnActive : ""}`}
            onClick={() => setCustomPeriodOpen(true)}
            type="button"
          >
            Custom period
          </button>
        </div>

        {customPeriodOpen ? (
          <div className={styles.statsCustomPeriod}>
            <label>
              From
              <input max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} type="date" value={customFrom} />
            </label>
            <label>
              To
              <input min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} type="date" value={customTo} />
            </label>
            {!customBounds ? <span>Choose a valid start and end date.</span> : null}
          </div>
        ) : null}

        {error ? <div className={styles.syncWarning}>{error}</div> : null}

        {processing ? (
          <div className={styles.statsProcessing} role="status">
            <span className={styles.statsSpinner} />
            Processing your logs...
          </div>
        ) : null}

        <section className={styles.statsPanel}>
          <div className={styles.statsPanelHeader}>
            <div>
              <h2>Average growth by day</h2>
              <p>Average close-to-close daily price movement, grouped by London weekday.</p>
            </div>
            <span>{stats.logCount} logs</span>
          </div>

          {stats.logCount === 0 ? (
            <StatsEmpty text="No behaviour logs in this timeframe yet." />
          ) : (
            <>
              <div className={styles.statsHighlights}>
                <DayHighlights title="Top growth days" days={stats.bestDays} positive />
                <DayHighlights title="Lowest growth days" days={stats.worstDays} />
              </div>

              <div className={styles.weekdayChart}>
                <div className={styles.weekdayChartAxis}>0%</div>
                {stats.weekdayGrowth.map((day) => (
                  <div className={styles.weekdayChartRow} key={day.dayIndex}>
                    <span className={styles.weekdayChartLabel}>{day.shortLabel}</span>
                    <div className={styles.weekdayChartTrack}>
                      <span className={styles.weekdayChartZero} />
                      {day.averageGrowthPct !== 0 ? (
                        <span
                          className={`${styles.weekdayChartBar} ${
                            day.averageGrowthPct > 0 ? styles.weekdayChartBarPositive : styles.weekdayChartBarNegative
                          }`}
                          style={{
                            width: `${Math.max(2, (Math.abs(day.averageGrowthPct) / chartScale) * 50)}%`,
                            [day.averageGrowthPct > 0 ? "left" : "right"]: "50%",
                          }}
                        />
                      ) : null}
                    </div>
                    <strong className={day.averageGrowthPct >= 0 ? styles.statsPositive : styles.statsNegative}>
                      {formatPercent(day.averageGrowthPct)}
                    </strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className={styles.statsPanel}>
          <div className={styles.statsPanelHeader}>
            <div>
              <h2>Most logged behaviours</h2>
              <p>Your three most frequently logged items in each category.</p>
            </div>
          </div>
          <BehaviourTable category="good" title="Good habits" rows={stats.behaviourRows} />
          <BehaviourTable category="bad" title="Bad habits" rows={stats.behaviourRows} />
          <BehaviourTable category="addiction" title="Addictions" rows={stats.behaviourRows} />
        </section>

        <section className={styles.statsPanel}>
          <div className={styles.statsPanelHeader}>
            <div>
              <h2>Edit previous logs</h2>
              <p>Review a past day, add anything you missed, or skip a day with no behaviour logs.</p>
            </div>
          </div>

          <div className={styles.repairToolbar}>
            <label>
              Date
              <input max={yesterdayLondon} onChange={(event) => setRepairDate(event.target.value)} type="date" value={repairDate} />
            </label>
            {repairDate ? (
              <a className={styles.repairAddButton} href={`/YouInc?backfill=${repairDate}`}>
                Add logs
              </a>
            ) : null}
            {missedLogs ? (
              <button className={styles.repairSkipButton} disabled={skipping} onClick={skipSelectedDate} type="button">
                {skipping ? "Skipping..." : "Skip"}
              </button>
            ) : null}
          </div>

          {repairDate ? (
            <div className={styles.repairSummary}>
              <div>
                <strong>{formatRepairDate(repairDate)}</strong>
                <span>{selectedBehaviourTx.length} behaviour logs</span>
              </div>
              {missedLogs ? (
                <button className={styles.missedLogsBadge} onClick={() => setShowMissedDate((current) => !current)} type="button">
                  Missed Logs
                </button>
              ) : null}
              {selectedDateSkipped ? <span className={styles.skippedLogsBadge}>Skipped</span> : null}
            </div>
          ) : null}

          {missedLogs && showMissedDate ? <div className={styles.missedLogsDetail}>Logs were missed on {formatRepairDate(repairDate)}.</div> : null}

          <details className={styles.repairLogs}>
            <summary>Show logs</summary>
            {selectedDayTx.length ? (
              <div className={styles.repairLogList}>
                {selectedDayTx.map((entry) => (
                  <div className={styles.repairLogItem} key={entry.id}>
                    <div>
                      <strong>{entry.label}</strong>
                      <span>{formatLondonTime(entry.ts)}</span>
                    </div>
                    <b className={entry.deltaUC >= 0 ? styles.statsPositive : styles.statsNegative}>
                      {entry.deltaUC >= 0 ? "+" : ""}
                      {entry.deltaUC} UC
                    </b>
                  </div>
                ))}
              </div>
            ) : (
              <StatsEmpty text="No logs saved for this day." />
            )}
          </details>
        </section>
      </div>
    </main>
  );
}

function StatsLoading({ text }: { text: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.statsLoading}>
        <span className={styles.statsSpinner} />
        <div>{text}</div>
      </div>
    </main>
  );
}

function StatsEmpty({ text }: { text: string }) {
  return <div className={styles.statsEmpty}>{text}</div>;
}

function DayHighlights({
  title,
  days,
  positive = false,
}: {
  title: string;
  days: StatsResult["bestDays"];
  positive?: boolean;
}) {
  return (
    <div className={styles.statsHighlightCard}>
      <span>{title}</span>
      <div>
        {days.map((day) => (
          <strong className={positive ? styles.statsPositive : styles.statsNegative} key={day.dayIndex}>
            {day.label} {formatPercent(day.averageGrowthPct)}
          </strong>
        ))}
      </div>
    </div>
  );
}

function BehaviourTable({
  category,
  title,
  rows,
}: {
  category: BehaviourCategory;
  title: string;
  rows: StatsResult["behaviourRows"];
}) {
  const visibleRows = rows.filter((row) => row.category === category);

  return (
    <div className={styles.behaviourTableBlock}>
      <h3>{title}</h3>
      {visibleRows.length === 0 ? (
        <StatsEmpty text={`No ${title.toLowerCase()} logged in this timeframe.`} />
      ) : (
        <div className={styles.behaviourTable}>
          <div className={`${styles.behaviourTableRow} ${styles.behaviourTableHead}`}>
            <span>Behaviour</span>
            <span>Logs</span>
            <span>Most active day</span>
          </div>
          {visibleRows.map((row) => (
            <div className={styles.behaviourTableRow} key={`${row.category}-${row.title}`}>
              <strong>{row.title}</strong>
              <span>{row.count}</span>
              <span>{row.mostLoggedDay}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}%`;
}

function getNextDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function isDecayTx(tx: Tx) {
  return /^Decay x\d+$/i.test(tx.label);
}

function formatRepairDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(getLondonDayStart(dateKey) + 12 * 60 * 60 * 1000));
}

function formatLondonTime(ts: number) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}
