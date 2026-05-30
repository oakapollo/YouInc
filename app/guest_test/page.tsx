"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import styles from "./guest_test.module.css";

type TabKey = "good" | "bad" | "addictions" | "goals";
type ViewKey = "dashboard" | "stats";

type DemoItem = {
  title: string;
  note: string;
  hold: number;
  sold: number;
};

type DemoLog = {
  id: number;
  title: string;
  action: string;
  delta: number;
  time: string;
};

const TABS: { key: TabKey; label: string; count: number }[] = [
  { key: "good", label: "Good", count: 3 },
  { key: "bad", label: "Bad", count: 2 },
  { key: "addictions", label: "Addictions", count: 1 },
  { key: "goals", label: "Goals", count: 2 },
];

const TAB_COPY: Record<TabKey, { title: string; text: string }> = {
  good: { title: "Good Habits", text: "Reward the behaviours you want to repeat." },
  bad: { title: "Bad Habits", text: "Track slip-ups honestly and keep the feedback visible." },
  addictions: { title: "Addictions", text: "Use a stronger feedback loop for patterns that need extra attention." },
  goals: { title: "Goals", text: "Give meaningful outcomes a deadline and a bigger reward." },
};

const ITEMS: Record<TabKey, DemoItem[]> = {
  good: [
    { title: "Gym", note: "Strength training", hold: 100, sold: 50 },
    { title: "Running", note: "5 km or an interval session", hold: 80, sold: 40 },
    { title: "Meditation", note: "10 quiet minutes", hold: 40, sold: 20 },
  ],
  bad: [
    { title: "Take Away", note: "Unplanned delivery food", hold: 80, sold: 40 },
    { title: "Binge TV", note: "More than two episodes", hold: 60, sold: 30 },
  ],
  addictions: [{ title: "Doom scrolling", note: "Late-night social media", hold: 200, sold: 100 }],
  goals: [
    { title: "Run a 10K", note: "Target: 30 June", hold: 400, sold: 200 },
    { title: "Read 12 books", note: "Target: 31 December", hold: 400, sold: 200 },
  ],
};

const STARTING_LOGS: DemoLog[] = [
  { id: 1, title: "Meditation", action: "Good habit - Hold", delta: 40, time: "Today, 07:42" },
  { id: 2, title: "Gym", action: "Good habit - Hold", delta: 100, time: "Yesterday, 18:10" },
  { id: 3, title: "Take Away", action: "Bad habit - Sold", delta: -40, time: "Saturday, 20:35" },
];

const PRICE_POINTS = [1.0, 1.012, 1.006, 1.024, 1.042, 1.071, 1.058, 1.084, 1.112, 1.139, 1.126, 1.158];

const WEEKDAY_STATS = [
  { day: "Mon", growth: 0.34 },
  { day: "Tue", growth: 0.58 },
  { day: "Wed", growth: 1.42 },
  { day: "Thu", growth: 1.18 },
  { day: "Fri", growth: 0.12 },
  { day: "Sat", growth: -0.76 },
  { day: "Sun", growth: -0.43 },
];

const TOUR = [
  {
    title: "Welcome to YouInc",
    text: "This is your personal behaviour market. The choices you make move your price, so progress becomes visible.",
    target: "hero",
  },
  {
    title: "Your habits are positions",
    text: "Start with a few behaviours that matter. Hold means you followed through. Sold means you slipped.",
    target: "habits",
  },
  {
    title: "Log honestly",
    text: "Try a Hold or Sold button. The feedback is immediate, but the real value is building an honest history.",
    target: "actions",
  },
  {
    title: "Watch your trend",
    text: "Your chart turns individual choices into a visible direction. Look for the pattern, not a perfect day.",
    target: "chart",
  },
  {
    title: "Use Stats to notice patterns",
    text: "Stats groups your logs by weekday and behaviour. It helps you see where momentum usually builds or falls away.",
    target: "stats",
  },
  {
    title: "Midweek is strong. Weekends need a plan.",
    text: "This demo shows the useful kind of insight: Wednesday and Thursday perform best, while Saturday and Sunday drift down.",
    target: "weekday",
  },
  {
    title: "Make it yours",
    text: "Create an account when you are ready. Your own dashboard starts clean and learns from the actions you log.",
    target: "account",
  },
] as const;

export default function GuestTestPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewKey>("dashboard");
  const [activeTab, setActiveTab] = useState<TabKey>("good");
  const [tourStep, setTourStep] = useState(0);
  const [tourOpen, setTourOpen] = useState(true);
  const [marketCap, setMarketCap] = useState(11580);
  const [logs, setLogs] = useState(STARTING_LOGS);
  const [flash, setFlash] = useState<string | null>(null);

  const tour = TOUR[tourStep];
  const activeItems = ITEMS[activeTab];
  const price = marketCap / 10000;
  const chartPoints = useMemo(() => [...PRICE_POINTS, price], [price]);

  useEffect(() => {
    if (!tourOpen) return;
    if (tour.target === "stats" || tour.target === "weekday") setView("stats");
    if (tour.target === "hero" || tour.target === "habits" || tour.target === "actions" || tour.target === "chart") {
      setView("dashboard");
    }
  }, [tour.target, tourOpen]);

  function highlight(target: string) {
    return tourOpen && tour.target === target ? styles.tourTarget : "";
  }

  function advanceTour() {
    if (tourStep === TOUR.length - 1) {
      setTourOpen(false);
      return;
    }
    setTourStep((step) => step + 1);
  }

  function logAction(item: DemoItem, action: "Hold" | "Sold") {
    const delta = action === "Hold" ? item.hold : -item.sold;
    setMarketCap((current) => Math.max(0, current + delta));
    setLogs((current) => [
      { id: Date.now(), title: item.title, action: `${TAB_COPY[activeTab].title} - ${action}`, delta, time: "Just now" },
      ...current,
    ]);
    setFlash(`${item.title} logged ${delta >= 0 ? "+" : ""}${delta} UC`);
    window.setTimeout(() => setFlash(null), 1800);
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {flash ? <div className={styles.flash}>{flash}</div> : null}

        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>You Inc.</div>
            <h1>Demo Trader</h1>
            <p>Your behaviour dashboard, priced like a market.</p>
          </div>
          <button className={`${styles.accountButton} ${highlight("account")}`} onClick={() => router.push("/register")} type="button">
            Create account
          </button>
        </header>

        <nav className={styles.viewTabs} aria-label="Demo pages">
          <button className={view === "dashboard" ? styles.viewTabActive : ""} onClick={() => setView("dashboard")} type="button">
            Dashboard
          </button>
          <button
            className={`${view === "stats" ? styles.viewTabActive : ""} ${highlight("stats")}`}
            onClick={() => setView("stats")}
            type="button"
          >
            Stats
          </button>
        </nav>

        {view === "dashboard" ? (
          <>
            <section className={`${styles.hero} ${highlight("hero")}`}>
              <div>
                <span>Market cap</span>
                <strong>{marketCap.toLocaleString()} UC</strong>
              </div>
              <div>
                <span>Price</span>
                <strong>U${price.toFixed(3)}</strong>
              </div>
              <div>
                <span>30-day movement</span>
                <strong className={styles.positive}>+15.8%</strong>
              </div>
            </section>

            <section className={`${styles.section} ${highlight("habits")}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>{TAB_COPY[activeTab].title}</h2>
                  <p>{TAB_COPY[activeTab].text}</p>
                </div>
                <button type="button">+ Add entry</button>
              </div>

              <div className={styles.metricTabs}>
                {TABS.map((tab) => (
                  <button
                    className={activeTab === tab.key ? styles.metricTabActive : ""}
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    type="button"
                  >
                    <span>{tab.label}</span>
                    <strong>{tab.count}</strong>
                  </button>
                ))}
              </div>

              <div className={styles.itemList}>
                {activeItems.map((item, index) => (
                  <article className={`${styles.itemCard} ${index === 0 ? highlight("actions") : ""}`} key={item.title}>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.note}</p>
                    </div>
                    <div className={styles.itemActions}>
                      <button className={styles.holdButton} onClick={() => logAction(item, "Hold")} type="button">
                        Hold <b>+{item.hold}</b>
                      </button>
                      <button className={styles.soldButton} onClick={() => logAction(item, "Sold")} type="button">
                        Sold <b>-{item.sold}</b>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={`${styles.section} ${highlight("chart")}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Price chart</h2>
                  <p>Your logged behaviour creates the trend.</p>
                </div>
                <div className={styles.chartFilters}>
                  <button className={styles.chartFilterActive} type="button">1M</button>
                  <button type="button">3M</button>
                  <button type="button">ALL</button>
                </div>
              </div>
              <DemoLineChart points={chartPoints} />
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Recent logs</h2>
                  <p>The evidence behind your price.</p>
                </div>
              </div>
              <div className={styles.logList}>
                {logs.slice(0, 5).map((log) => (
                  <div className={styles.logRow} key={log.id}>
                    <div>
                      <strong>{log.title}</strong>
                      <span>{log.action} · {log.time}</span>
                    </div>
                    <b className={log.delta >= 0 ? styles.positive : styles.negative}>
                      {log.delta >= 0 ? "+" : ""}{log.delta} UC
                    </b>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <DemoStats highlight={highlight("weekday")} />
        )}
      </div>

      {tourOpen ? (
        <aside className={styles.tourCard} role="dialog" aria-label="YouInc tutorial">
          <div className={styles.tourProgress}>
            <span>Quick tour</span>
            <b>{tourStep + 1} / {TOUR.length}</b>
          </div>
          <h2>{tour.title}</h2>
          <p>{tour.text}</p>
          <div className={styles.tourActions}>
            <button className={styles.skipButton} onClick={() => setTourOpen(false)} type="button">Skip tour</button>
            <button className={styles.nextButton} onClick={advanceTour} type="button">
              {tourStep === TOUR.length - 1 ? "Explore demo" : "Next"}
            </button>
          </div>
        </aside>
      ) : (
        <button className={styles.restartTour} onClick={() => { setTourStep(0); setTourOpen(true); }} type="button">
          Restart tour
        </button>
      )}
    </main>
  );
}

function DemoLineChart({ points }: { points: number[] }) {
  const width = 900;
  const height = 220;
  const min = Math.min(...points) - 0.01;
  const max = Math.max(...points) + 0.01;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / (max - min)) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className={styles.chart}>
      <svg aria-label="Demo price trend" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <path className={styles.chartArea} d={`${path} L ${width} ${height} L 0 ${height} Z`} />
        <path className={styles.chartLine} d={path} />
      </svg>
      <div className={styles.chartLabels}><span>30 days ago</span><span>Today</span></div>
    </div>
  );
}

function DemoStats({ highlight }: { highlight: string }) {
  const scale = Math.max(...WEEKDAY_STATS.map((day) => Math.abs(day.growth)));

  return (
    <>
      <section className={`${styles.section} ${highlight}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Average growth by day</h2>
            <p>Demo data showing where momentum usually builds and slips.</p>
          </div>
          <span className={styles.demoBadge}>Demo data</span>
        </div>
        <div className={styles.insightGrid}>
          <div><span>Top growth days</span><strong className={styles.positive}>Wednesday +1.42%</strong><strong className={styles.positive}>Thursday +1.18%</strong></div>
          <div><span>Lowest growth days</span><strong className={styles.negative}>Saturday -0.76%</strong><strong className={styles.negative}>Sunday -0.43%</strong></div>
        </div>
        <div className={styles.weekdayChart}>
          <div className={styles.zeroLabel}>0%</div>
          {WEEKDAY_STATS.map((day) => (
            <div className={styles.weekdayRow} key={day.day}>
              <b>{day.day}</b>
              <div><i /><span className={day.growth >= 0 ? styles.dayPositive : styles.dayNegative} style={{ width: `${Math.abs(day.growth / scale) * 50}%`, [day.growth >= 0 ? "left" : "right"]: "50%" }} /></div>
              <strong className={day.growth >= 0 ? styles.positive : styles.negative}>{day.growth >= 0 ? "+" : ""}{day.growth.toFixed(2)}%</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Most logged behaviours</h2><p>A realistic preview of the patterns your own history will reveal.</p></div></div>
        <DemoTable title="Good habits" rows={[["Gym", "18", "Wednesday"], ["Meditation", "15", "Thursday"], ["Running", "11", "Wednesday"]]} />
        <DemoTable title="Bad habits" rows={[["Take Away", "6", "Saturday"], ["Binge TV", "4", "Sunday"]]} />
        <DemoTable title="Addictions" rows={[["Doom scrolling", "5", "Sunday"]]} />
      </section>
    </>
  );
}

function DemoTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className={styles.tableBlock}>
      <h3>{title}</h3>
      <div className={styles.table}>
        <div className={styles.tableHead}><span>Behaviour</span><span>Logs</span><span>Most active day</span></div>
        {rows.map((row) => <div className={styles.tableRow} key={row[0]}><strong>{row[0]}</strong><span>{row[1]}</span><span>{row[2]}</span></div>)}
      </div>
    </div>
  );
}
