"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../YouInc/youinc.module.css";

type TabKey = "goals" | "good" | "bad" | "addictions";
type Timeframe = "1d" | "3d" | "1w" | "1m";
type Tx = { id: string; ts: number; deltaUC: number; label: string };
type DemoItem = { id: string; title: string; notes: string; createdAt: number; holdUC: number; soldUC: number };
type Candle = { t: number; o: number; h: number; l: number; c: number; tx: Tx[] };

type Step =
  | "good-tab"
  | "add-entry"
  | "modal-add"
  | "hold"
  | "chart-day"
  | "tf-info"
  | "buy-open"
  | "buy-complete"
  | "tap-candle"
  | "details"
  | "bad-tab"
  | "bad-add-entry"
  | "bad-modal-add"
  | "bad-reach"
  | "bad-popup"
  | "bad-sold"
  | "goals-tab"
  | "goal-add-entry"
  | "goal-modal-add"
  | "goal-reach"
  | "goal-hold"
  | "goal-chart"
  | "goal-details"
  | "final";

const SECTION_ORDER: TabKey[] = ["goals", "good", "bad", "addictions"];
const INTENSITY_LEVELS = [
  { hold: 10, sold: -10 },
  { hold: 20, sold: -10 },
  { hold: 40, sold: -20 },
  { hold: 80, sold: -40 },
  { hold: 100, sold: -50 },
];
const SECTION_TITLES: Record<TabKey, string> = {
  goals: "Goals",
  good: "Good Habits",
  bad: "Bad Habits",
  addictions: "Addictions",
};
const SECTION_SUBTITLES: Record<TabKey, string> = {
  goals: "Big targets that move your chart.",
  good: "Reward consistency and build momentum.",
  bad: "Log behaviour you want to stop feeding.",
  addictions: "Be honest when the strongest patterns pull back.",
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function dayStart(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function timeframeMs(tf: Timeframe) {
  if (tf === "3d") return 3 * 86400000;
  if (tf === "1w") return 7 * 86400000;
  if (tf === "1m") return 30 * 86400000;
  return 86400000;
}

function bucketStart(ts: number, tf: Timeframe) {
  const ms = timeframeMs(tf);
  if (tf === "1d") return dayStart(ts);
  return Math.floor(ts / ms) * ms;
}

function priceFromCap(capUC: number) {
  return capUC / 10000;
}

function buildCandles(currentCapUC: number, txDesc: Tx[], tf: Timeframe): Candle[] {
  const now = Date.now();
  const count = tf === "1m" ? 12 : tf === "1w" ? 16 : tf === "3d" ? 24 : 30;
  const ms = timeframeMs(tf);
  const end = bucketStart(now, tf);
  const starts = Array.from({ length: count }, (_, i) => end - (count - 1 - i) * ms);
  const txAsc = [...txDesc].sort((a, b) => a.ts - b.ts);

  let cap = currentCapUC;
  for (const tx of txAsc) {
    if (tx.ts >= starts[0]) cap -= tx.deltaUC;
  }
  cap = Math.max(0, cap);

  return starts.map((start) => {
    const endOfBucket = start + ms;
    const bucketTx = txAsc.filter((tx) => tx.ts >= start && tx.ts < endOfBucket);
    const open = cap;
    let high = cap;
    let low = cap;

    for (const tx of bucketTx) {
      cap = Math.max(0, cap + tx.deltaUC);
      high = Math.max(high, cap);
      low = Math.min(low, cap);
    }

    return {
      t: start,
      o: priceFromCap(open),
      h: priceFromCap(high),
      l: priceFromCap(low),
      c: priceFromCap(cap),
      tx: bucketTx,
    };
  });
}

function periodWord(tf: Timeframe) {
  if (tf === "1w") return "week";
  if (tf === "1m") return "month";
  if (tf === "3d") return "3 days";
  return "day";
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function GuestPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("good-tab");
  const [tab, setTab] = useState<TabKey>("goals");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<TabKey>("good");
  const [entryTitle, setEntryTitle] = useState("Log my habits");
  const [modalIntensityIndex, setModalIntensityIndex] = useState(4);
  const [items, setItems] = useState<Record<TabKey, DemoItem[]>>({ goals: [], good: [], bad: [], addictions: [] });
  const [marketCapUC, setMarketCapUC] = useState(10000);
  const [tx, setTx] = useState<Tx[]>([]);
  const [tf, setTf] = useState<Timeframe>("1d");
  const [tfTouched, setTfTouched] = useState(false);
  const [isBuyOpen, setIsBuyOpen] = useState(false);
  const [buyActivity, setBuyActivity] = useState("Do 5 push ups. Seriously, do it.");
  const [selected, setSelected] = useState<Candle | null>(null);
  const [showBadPopup, setShowBadPopup] = useState(false);
  const [showGoalMessage, setShowGoalMessage] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [visibleZone, setVisibleZone] = useState<"top" | "list" | "chart" | "details">("top");
  const [logFlash, setLogFlash] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(false);

  const tabsRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);

  const price = marketCapUC / 10000;
  const candles = useMemo(() => buildCandles(marketCapUC, tx, tf), [marketCapUC, tx, tf]);
  const latestCandle = candles[candles.length - 1] ?? null;
  const selectedIndex = selected ? candles.findIndex((c) => c.t === selected.t) : -1;
  const previous = selectedIndex > 0 ? candles[selectedIndex - 1] : null;
  const selectedMove = selected && previous ? selected.c - previous.c : 0;
  const selectedPct = selected && previous && previous.c !== 0 ? (selectedMove / previous.c) * 100 : 0;
  const isSelectedUp = selectedMove >= 0;
  const selectedPeriodLabel = periodWord(tf);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIntroDone(true);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const targets = [
      { name: "top" as const, ref: tabsRef },
      { name: "list" as const, ref: listRef },
      { name: "chart" as const, ref: chartRef },
      { name: "details" as const, ref: detailsRef },
    ];

    const onScroll = () => {
      const midpoint = window.innerHeight * 0.45;
      let best = targets[0].name;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const target of targets) {
        const el = target.ref.current;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top - midpoint);
        if (distance < bestDistance) {
          best = target.name;
          bestDistance = distance;
        }
      }
      setVisibleZone(best);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  function flash(message: string) {
    setLogFlash(message);
    window.setTimeout(() => setLogFlash(null), 1800);
  }

  function applyDelta(label: string, deltaUC: number) {
    const entry = { id: uid(), ts: Date.now(), deltaUC, label };
    setTx((prev) => [entry, ...prev].slice(0, 500));
    setMarketCapUC((prev) => Math.max(0, prev + deltaUC));
    flash(`${deltaUC > 0 ? "+" : ""}${deltaUC} UC logged`);
  }

  function openEntry(kind: TabKey) {
    setModalKind(kind);
    setTab(kind);

    if (kind === "good") {
      setEntryTitle("Log my habits");
      setModalIntensityIndex(4);
      setStep("modal-add");
    } else if (kind === "bad") {
      setEntryTitle("Bad Habit");
      setModalIntensityIndex(4);
      setStep("bad-modal-add");
    } else if (kind === "goals") {
      setEntryTitle("Start Tracking my Progress");
      setModalIntensityIndex(4);
      setStep("goal-modal-add");
    } else {
      setEntryTitle("Addiction Trigger");
      setModalIntensityIndex(4);
    }

    setIsModalOpen(true);
  }

  function addEntry() {
    const title = entryTitle.trim() || SECTION_TITLES[modalKind];
    const intensity = INTENSITY_LEVELS[modalIntensityIndex] ?? INTENSITY_LEVELS[4];
    const item: DemoItem = {
      id: uid(),
      title,
      notes: modalKind === "goals" ? "Your first big win" : modalKind === "bad" ? "Honesty beats hiding" : "Demo entry",
      createdAt: Date.now(),
      holdUC: modalKind === "goals" ? 400 : intensity.hold,
      soldUC: modalKind === "goals" ? -200 : intensity.sold,
    };

    setItems((prev) => ({ ...prev, [modalKind]: [item] }));
    setIsModalOpen(false);

    if (modalKind === "good") setStep("hold");
    if (modalKind === "bad") {
      setShowBadPopup(true);
      setStep("bad-popup");
    }
    if (modalKind === "goals") setStep("goal-hold");
  }

  function handleTabClick(key: TabKey) {
    setTab(key);

    if (key === "good" && step === "good-tab") setStep("add-entry");
    if (key === "bad" && step === "bad-tab") setStep("bad-add-entry");
    if (key === "goals" && step === "goals-tab") setStep("goal-add-entry");
    if (key === "bad" && step === "bad-reach") {
      setShowBadPopup(true);
      setStep("bad-popup");
    }
    if (key === "goals" && step === "goal-reach") setStep("goal-hold");
  }

  function holdGood(item: DemoItem) {
    applyDelta(`${item.title} · Good habit`, item.holdUC);
    setTf("1d");
    setTfTouched(false);
    setStep("chart-day");
  }

  function soldBad(item: DemoItem) {
    applyDelta(`${item.title} · Bad habit`, item.soldUC);
    setStep("goals-tab");
  }

  function holdGoal(item: DemoItem) {
    applyDelta(`${item.title} · Goal complete`, 400);
    setTf("1d");
    setTfTouched(false);
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 2200);
    setStep("goal-chart");
    setShowGoalMessage(true);
  }

  function openBuy() {
    setIsBuyOpen(true);
    setBuyActivity("Do 5 push ups. Seriously, do it.");
    setStep("buy-complete");
  }

  function completeBuy() {
    applyDelta(`BUY: ${buyActivity.trim() || "Do 5 push ups"}`, 25);
    setIsBuyOpen(false);
    setStep("tap-candle");
  }

  function selectCandle(candle: Candle) {
    setSelected(candle);
    if (step === "tap-candle") setStep("details");
    if (step === "goal-chart") {
      setStep("goal-details");
      window.setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }
  }

  function continueAfterBreakdown() {
    if (step === "goal-details") {
      setStep("final");
      return;
    }
    setStep("bad-tab");
  }

  function closeBadPopup() {
    setShowBadPopup(false);
    setStep("bad-sold");
  }

  function isHighlight(target: Step) {
    return step === target ? styles.guestPulse : "";
  }

  function activeAddHighlight() {
    if (step === "add-entry" || step === "bad-add-entry" || step === "goal-add-entry") return styles.guestPulse;
    return "";
  }

  function bottomPrompt() {
    if (step === "hold" && visibleZone !== "list") return "Scroll to your Good Habits list, then tap Hold.";
    if (step === "chart-day" && visibleZone !== "chart") return "Scroll to your chart to see what changed.";
    if (step === "tf-info" && visibleZone !== "chart") return "Scroll to the chart controls and try the time views.";
    if (step === "buy-open" && visibleZone !== "chart") return "Scroll to the chart controls, then tap BUY +25 UC.";
    if (step === "tap-candle" && visibleZone !== "chart") return "Scroll to the chart and tap the highlighted point.";
    if (step === "details" && visibleZone !== "details") return "Scroll to the Progress Breakdown below the chart.";
    if (step === "goal-details" && visibleZone !== "details") return "Taking you to Progress Breakdown.";
    if (step === "bad-tab" || step === "bad-add-entry") return "Go back to the top cards and open Bad Habits.";
    if (step === "bad-reach") return "Scroll to the top cards, then switch to Bad Habits.";
    if (step === "bad-sold" && visibleZone !== "list") return "Scroll to your Bad Habits list, then tap Sold.";
    if (step === "goals-tab" || step === "goal-add-entry") return "Go back to the top cards and open Goals.";
    if (step === "goal-hold" && visibleZone !== "list") return "Scroll to your Goals list, then complete your first goal.";
    if (step === "goal-chart" && visibleZone !== "chart") return "Scroll to the chart, then tap the highlighted point.";
    return null;
  }

  const prompt = bottomPrompt();
  const coach = tutorialCoach(step, visibleZone);

  return (
    <div className={styles.page}>
      {!introDone ? (
        <div className={styles.introOverlay} aria-hidden="true">
          <div className={styles.introLogo}>
            <span className={styles.introLeft}>&gt;---</span>
            <span className={styles.introName}>You Inc.</span>
            <span className={styles.introRight}>---&lt;</span>
          </div>
        </div>
      ) : null}

      <div className={styles.glowA} />
      <div className={styles.glowB} />
      <div className={styles.glowC} />

      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.logo} />
            <div className={styles.brandText}>
              <div className={styles.eyebrow}>You Inc.</div>
              <div className={styles.title}>This is your first chart.</div>
              <div className={styles.subTitle}>Every honest action moves the price of you.</div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <a className={styles.secondaryBtn} href="/login">Login</a>
          </div>
        </header>

        <section className={styles.heroCard}>
          <div className={styles.heroCopy}>
            <div className={styles.heroTitle}>Start where you are. Log what you do. Watch the signal change.</div>
            <div className={styles.heroText}>This is a guided first run. Treat it like your own account: add habits, log honest wins and slips, then decide whether you want to keep your chart going.</div>
          </div>
          <div ref={tabsRef} className={styles.heroStats} aria-label="Choose what you want to add">
            {SECTION_ORDER.map((key) => {
              const pulse =
                (key === "good" && step === "good-tab") ||
                (key === "bad" && (step === "bad-tab" || step === "bad-reach")) ||
                (key === "goals" && step === "goals-tab");

              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.heroStat} ${tab === key ? styles.heroStatActive : ""} ${pulse ? styles.guestPulse : ""}`}
                  onClick={() => handleTabClick(key)}
                  aria-pressed={tab === key}
                >
                  <span>{key === "good" ? "Good" : key === "bad" ? "Bad" : SECTION_TITLES[key]}</span>
                  <strong>{items[key].length}</strong>
                  <small>{tab === key ? "Selected" : "Tap to select"}</small>
                </button>
              );
            })}
          </div>
        </section>

        <div className={styles.guestAddEntryRow}>
          <button className={`${styles.addBtn} ${activeAddHighlight()}`} onClick={() => openEntry(tab)} type="button" aria-label={`Add entry to ${SECTION_TITLES[tab]}`}>
            <span className={styles.addPlus}>＋</span>
            Add entry
          </button>
        </div>

        <section ref={listRef} className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderCopy}>
              <div className={styles.panelHeaderTitle}>{SECTION_TITLES[tab]}</div>
              <div className={styles.panelHeaderText}>{SECTION_SUBTITLES[tab]}</div>
            </div>
          </div>

          <div className={styles.list}>
            {items[tab].length === 0 ? (
              <EmptyState text={emptyText(tab, step)} />
            ) : (
              items[tab].map((item) => (
                <DemoCard
                  key={item.id}
                  item={item}
                  tab={tab}
                  holdHighlight={(tab === "good" && step === "hold") || (tab === "goals" && step === "goal-hold")}
                  soldHighlight={tab === "bad" && step === "bad-sold"}
                  onGoodHold={() => holdGood(item)}
                  onBadSold={() => soldBad(item)}
                  onGoalHold={() => holdGoal(item)}
                />
              ))
            )}
          </div>
        </section>

        <section ref={chartRef} className={styles.chartIntro}>
          <div>
            <div className={styles.chartIntroTitle}>Your chart</div>
            <div className={styles.chartIntroText}>Your choices turn into price movement. Green is progress. Red is feedback.</div>
          </div>
          <div className={styles.tfRow}>
            <button className={`${styles.actionPrimary} ${isHighlight("buy-open")}`} onClick={openBuy} type="button">BUY <span className={styles.delta}>+25 UC</span></button>
            {(["1d", "3d", "1w", "1m"] as Timeframe[]).map((key) => (
              <button
                key={key}
                className={`${styles.tfBtn} ${tf === key ? styles.tfBtnOn : ""} ${step === "tf-info" && !tfTouched ? styles.guestPulse : ""}`}
                onClick={() => {
                  setTf(key);
                  if (step === "tf-info") setTfTouched(true);
                }}
                type="button"
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        {step === "chart-day" && visibleZone === "chart" ? (
          <GuideBox title="One point = one day" text="This view shows daily movement, so you can see how today changed your price." button="OK" pulseButton onClick={() => setStep("tf-info")} />
        ) : null}

        {step === "tf-info" && visibleZone === "chart" ? (
          <GuideBox title="Change the view" text="Tap 1D, 3D, 1W, or 1M to see your progress over different periods." button="OK" pulseButton={tfTouched} onClick={() => { if (tfTouched) setStep("buy-open"); }} />
        ) : null}

        {isBuyOpen ? (
          <div className={styles.helperBox} style={{ marginBottom: 12 }}>
            <div className={styles.helperTitle}>Open a position</div>
            <div className={styles.helperText}>A quick action you can do right now. Tiny wins still move the chart.</div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input className={styles.input} value={buyActivity} onChange={(e) => setBuyActivity(e.target.value)} style={{ marginTop: 0, flex: "1 1 260px" }} />
              <button className={`${styles.primaryBtn} ${isHighlight("buy-complete")}`} type="button" onClick={completeBuy}>Completed <span className={styles.delta}>+25 UC</span></button>
            </div>
          </div>
        ) : null}

        <MiniCandleChart candles={candles} selected={selected} latest={latestCandle} shouldPulse={step === "tap-candle" || step === "goal-chart"} pointerText="👇" onSelect={selectCandle} />

        {step === "tap-candle" && visibleZone === "chart" ? (
          <GuideBox title="Tap the point first" text="👇 Tap the highlighted point on the chart." button="Tap the point" onClick={() => undefined} />
        ) : null}

        {showGoalMessage && step === "goal-chart" && visibleZone === "chart" ? (
          <GuideBox title="Completing goals boosts your chart." text="👇 Tap the highlighted point to see what changed." button="Tap the point" onClick={() => undefined} />
        ) : null}

        <section ref={detailsRef} className={`${styles.detailsPanel} ${styles.detailsPanelOpen}`}>
          <div className={styles.detailsHeader}>
            <div>
              <div className={styles.detailsTitle}>Progress breakdown</div>
              <div className={styles.detailsRange}>{selected ? new Date(selected.t).toLocaleString() : "Tap the chart to inspect a point."}</div>
            </div>
            {(step === "details" || step === "goal-details") ? <button className={`${styles.primaryBtn} ${styles.guestPulse}`} onClick={continueAfterBreakdown} type="button">Got it</button> : null}
          </div>

          <div className={styles.detailsBody}>
            {step === "details" ? (
              <div className={styles.guestInlineTip}>View your logs for the chosen {selectedPeriodLabel} and the percentage change from the previous {selectedPeriodLabel}. Then tap Got it.</div>
            ) : null}
            {step === "goal-details" ? (
              <div className={styles.guestInlineTip}>This is your Progress Breakdown. It shows what you logged, how your price changed, and why consistency matters. The key is not being perfect — it is being honest enough to keep the signal real.</div>
            ) : null}
            <div className={styles.guestPerformanceBox}>
              <div>
                <span>Price</span>
                <strong>{selected ? formatMoney(selected.c) : "—"}</strong>
              </div>
              <div>
                <span>{selected ? (isSelectedUp ? "Up" : "Down") : "Change"}</span>
                <strong className={selected ? (isSelectedUp ? styles.txPositive : styles.txNegative) : ""}>
                  {selected && previous ? `${isSelectedUp ? "+" : ""}${formatMoney(Math.abs(selectedMove))}` : "—"}
                </strong>
              </div>
              <div>
                <span>From previous {periodWord(tf)}</span>
                <strong className={selected ? (isSelectedUp ? styles.txPositive : styles.txNegative) : ""}>
                  {selected && previous ? `${selectedPct >= 0 ? "+" : ""}${selectedPct.toFixed(2)}%` : "—"}
                </strong>
              </div>
            </div>

            <div className={styles.txList}>
              {(selected?.tx.length ? selected.tx : tx.slice(0, 4)).map((entry) => (
                <div key={entry.id} className={styles.txItem}>
                  <div><div className={styles.txTitle}>{entry.label}</div><div className={styles.txTime}>{new Date(entry.ts).toLocaleTimeString()}</div></div>
                  <div className={`${styles.txDelta} ${entry.deltaUC >= 0 ? styles.txPositive : styles.txNegative}`}>{entry.deltaUC > 0 ? "+" : ""}{entry.deltaUC} UC</div>
                </div>
              ))}
              {!tx.length ? <div className={styles.emptyTx}>Your logged actions will appear here.</div> : null}
            </div>
          </div>
        </section>

        {showBadPopup ? (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalHeader}><div className={styles.modalTitle}>Honesty keeps the chart real.</div></div>
              <div className={styles.modalBody}>
                <div className={styles.helperText} style={{ fontSize: 15, lineHeight: 1.7 }}>
                  Some days your discipline slips, and that is okay. The point is not to pretend. Log it, learn from it, and keep moving.
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className={`${styles.primaryBtn} ${styles.guestPulse}`} onClick={closeBadPopup} type="button">Close</button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "final" ? (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalHeader}><div className={styles.modalTitle}>Ready to keep the chart going?</div></div>
              <div className={styles.modalBody}>
                <div className={styles.helperText} style={{ fontSize: 15, lineHeight: 1.7 }}>
                  You have seen the loop: log honestly, watch the signal change, and build momentum one day at a time. Create your account and keep your chart alive.
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className={`${styles.primaryBtn} ${styles.guestPulse}`} onClick={() => router.push("/register")} type="button">Create my account</button>
              </div>
            </div>
          </div>
        ) : null}

        {isModalOpen ? (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Add {SECTION_TITLES[modalKind].slice(0, -1)}</div>
                <button className={styles.iconBtn} onClick={() => setIsModalOpen(false)} aria-label="Close modal" type="button">✕</button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.form}>
                  <label className={styles.label}>{modalKind === "goals" ? "Goal" : modalKind === "bad" ? "Bad habit" : "Habit"}<input className={styles.input} value={entryTitle} onChange={(e) => setEntryTitle(e.target.value)} /></label>
                  <div className={styles.row2}>
                    <label className={styles.label}>Type<input className={styles.input} value={SECTION_TITLES[modalKind]} readOnly /></label>
                    <label className={styles.label}>Notes<input className={styles.input} value={modalKind === "bad" ? "honesty beats hiding" : modalKind === "goals" ? "make progress visible" : "tracking habits is also a habit"} readOnly /></label>
                  </div>

                  {(modalKind === "good" || modalKind === "bad") ? (
                    <div className={styles.intensityBox}>
                      <div className={styles.helperTitle}>Adjust intensity</div>
                      <div className={styles.helperText}>
                        Smaller habits do not need the same reward as massive habits. Set the reward and penalty to what feels fair.
                      </div>
                      <div className={styles.previewActions}>
                        <span className={styles.previewHold}>Hold <span className={styles.delta}>+{INTENSITY_LEVELS[modalIntensityIndex].hold} UC</span></span>
                        <span className={styles.previewSold}>Sold <span className={styles.delta}>{INTENSITY_LEVELS[modalIntensityIndex].sold} UC</span></span>
                      </div>
                      <label className={styles.intensityLabel}>
                        Reward level: +{INTENSITY_LEVELS[modalIntensityIndex].hold} / {INTENSITY_LEVELS[modalIntensityIndex].sold} UC
                        <input
                          className={`${styles.intensitySlider} ${step === "modal-add" && modalKind === "good" && modalIntensityIndex !== 1 ? styles.guestPulse : ""}`}
                          type="range"
                          min="0"
                          max={INTENSITY_LEVELS.length - 1}
                          step="1"
                          value={modalIntensityIndex}
                          onChange={(e) => setModalIntensityIndex(Number(e.target.value))}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.ghostBtn} onClick={() => setIsModalOpen(false)} type="button">Cancel</button>
                <button
                  className={`${styles.primaryBtn} ${(
                    (step === "modal-add" && modalKind === "good" && modalIntensityIndex === 1) ||
                    step === "bad-modal-add" ||
                    step === "goal-modal-add"
                  ) ? styles.guestPulse : ""}`}
                  onClick={addEntry}
                  disabled={!entryTitle.trim()}
                  type="button"
                >Add</button>
              </div>
            </div>
          </div>
        ) : null}

        {coach ? <TutorialCoach title={coach.title} text={coach.text} /> : null}
        {prompt ? <div className={styles.guestBottomBar}>{prompt}</div> : null}
        {logFlash ? <div className={styles.logFlash}><span className={styles.logFlashDot}>✓</span>{logFlash}</div> : null}
        {celebrate ? <GoalCelebration /> : null}
      </div>
    </div>
  );
}

function tutorialCoach(step: Step, visibleZone: "top" | "list" | "chart" | "details") {
  if (step === "bad-modal-add" || step === "goal-modal-add" || step === "bad-popup" || step === "final") return null;
  if (step === "good-tab") return { title: "Your first signal starts here", text: "Tap the Good card. Start with one small action you want to repeat." };
  if (step === "add-entry") return { title: "Name the habit", text: "Tap Add entry. I already filled it in so you can feel the flow, not fight the form." };
  if (step === "modal-add") return { title: "Set the intensity", text: "Some habits are easier or smaller. Drag the reward level to +20 / -10 UC, then tap Add." };
  if (step === "hold") return { title: "Log the win", text: "Scroll to the habit and tap Hold. That tells your chart you showed up today." };
  if (step === "chart-day" && visibleZone !== "chart") return { title: "Now watch it move", text: "Scroll to the chart. Your action has already changed the price." };
  if (step === "tf-info" && visibleZone !== "chart") return { title: "Try the time views", text: "Scroll to the chart controls. 1D, 3D, 1W and 1M show different progress windows." };
  if (step === "buy-open") return { title: "Tiny action, real movement", text: "Tap BUY +25 UC. This is for a quick action you can do right now." };
  if (step === "buy-complete") return { title: "Do it, then log it", text: "The task is already filled in. Complete it and watch the chart respond." };
  if (step === "tap-candle") return { title: "Pick the latest point", text: "👇 Tap the highlighted point on the chart. The lines show what you selected." };
  if (step === "details" && visibleZone !== "details") return { title: "Read the result", text: "Scroll to the breakdown. You’ll see the price and the change from the previous period." };
  if (step === "bad-tab") return { title: "Now add honesty", text: "Tap the Bad card. Progress is not only wins — it is also telling the truth." };
  if (step === "bad-add-entry") return { title: "Track the pattern", text: "Tap Add entry. I filled in a simple bad habit so you can log the slip honestly." };
  if (step === "bad-reach") return { title: "Open Bad Habits", text: "Tap the Bad card again to continue." };
  if (step === "bad-sold") return { title: "Log the slip", text: "Tap Sold -50 UC. No drama. Just honest feedback." };
  if (step === "goals-tab") return { title: "Now finish with a real boost", text: "Tap the Goals card. Goals are the big moves that push your chart higher." };
  if (step === "goal-add-entry") return { title: "Create the goal", text: "Tap Add entry. I filled in your first goal for you." };
  if (step === "goal-hold") return { title: "Complete the goal", text: "Tap Complete +400 UC. This one should feel bigger because goals are supposed to matter." };
  if (step === "goal-chart" && visibleZone !== "chart") return { title: "Look at the jump", text: "Scroll to the chart, then tap the highlighted point 👇." };
  if (step === "goal-details" && visibleZone !== "details") return { title: "Progress Breakdown", text: "Here you will see what you logged and how the selected period changed." };
  return null;
}

function TutorialCoach({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.guestCoachCard} role="status" aria-live="polite">
      <div className={styles.guestCoachKicker}>First run</div>
      <div className={styles.guestCoachTitle}>{title}</div>
      <div className={styles.guestCoachText}>{text}</div>
    </div>
  );
}

function emptyText(tab: TabKey, step: Step) {
  if (tab === "good" && step === "add-entry") return "Tap Add entry to create your first good habit.";
  if (tab === "bad" && step === "bad-add-entry") return "Tap Add entry to create a bad habit you want to track honestly.";
  if (tab === "goals" && step === "goal-add-entry") return "Tap Add entry to create your first goal.";
  return "Nothing here yet. Use Add entry when this section is highlighted.";
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.empty}><div className={styles.emptyIcon}>◇</div><div className={styles.emptyText}>{text}</div></div>;
}

function GuideBox({ title, text, button, onClick, pulseButton = true }: { title: string; text: string; button: string; onClick: () => void; pulseButton?: boolean }) {
  return (
    <div className={styles.guestGuideBox}>
      <div><div className={styles.helperTitle}>{title}</div><div className={styles.helperText}>{text}</div></div>
      <button className={`${styles.primaryBtn} ${pulseButton ? styles.guestPulse : ""}`} onClick={onClick} type="button">{button}</button>
    </div>
  );
}

function DemoCard({
  item,
  tab,
  holdHighlight,
  soldHighlight,
  onGoodHold,
  onBadSold,
  onGoalHold,
}: {
  item: DemoItem;
  tab: TabKey;
  holdHighlight: boolean;
  soldHighlight: boolean;
  onGoodHold: () => void;
  onBadSold: () => void;
  onGoalHold: () => void;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardMain}>
        <div className={styles.cardTitle}>{item.title}</div>
        <div className={styles.metaRow}>
          <span className={styles.metaPill}>{tab === "goals" ? "Goal" : tab === "bad" ? "Pattern" : "Every day"}</span>
          <span className={styles.metaNote}>{item.notes}</span>
        </div>
      </div>
      <div className={styles.cardActions}>
        {tab === "goals" ? (
          <button className={`${styles.actionPrimary} ${holdHighlight ? styles.guestPulse : ""}`} onClick={onGoalHold} type="button">Complete <span className={styles.delta}>+{item.holdUC} UC</span></button>
        ) : tab === "bad" ? (
          <>
            <button className={styles.actionPrimary} type="button">Hold <span className={styles.delta}>+{item.holdUC} UC</span></button>
            <button className={`${styles.actionDanger} ${soldHighlight ? styles.guestPulse : ""}`} onClick={onBadSold} type="button">Sold <span className={styles.delta}>{item.soldUC} UC</span></button>
          </>
        ) : (
          <>
            <button className={`${styles.actionPrimary} ${holdHighlight ? styles.guestPulse : ""}`} onClick={onGoodHold} type="button">Hold <span className={styles.delta}>+{item.holdUC} UC</span></button>
            <button className={styles.actionDanger} type="button">Sold <span className={styles.delta}>{item.soldUC} UC</span></button>
          </>
        )}
      </div>
    </div>
  );
}

function GoalCelebration() {
  return (
    <div className={styles.goalCelebration} aria-hidden="true">
      <div className={styles.goalBurst}>+400 UC</div>
      {Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ "--i": i } as React.CSSProperties} />)}
    </div>
  );
}

function MiniCandleChart({ candles, selected, latest, shouldPulse, pointerText, onSelect }: { candles: Candle[]; selected: Candle | null; latest: Candle | null; shouldPulse: boolean; pointerText: string; onSelect: (c: Candle) => void }) {
  const [hovered, setHovered] = useState<Candle | null>(null);
  const w = 1000;
  const h = 320;
  const padding = { top: 18, right: 18, bottom: 28, left: 50 };
  const vals = candles.flatMap((c) => [c.h, c.l]);
  const min = Math.min(...vals, 0.95);
  const max = Math.max(...vals, 1.05);
  const span = Math.max(0.001, max - min);
  const xStep = (w - padding.left - padding.right) / Math.max(1, candles.length);
  const y = (v: number) => padding.top + ((max - v) / span) * (h - padding.top - padding.bottom);
  const active = hovered ?? selected;
  const activeIndex = active ? candles.findIndex((c) => c.t === active.t) : -1;
  const activeX = activeIndex >= 0 ? padding.left + activeIndex * xStep + xStep / 2 : null;
  const activeY = active ? y(active.c) : null;
  const latestIndex = latest ? candles.findIndex((c) => c.t === latest.t) : -1;
  const pointerX = latestIndex >= 0 ? padding.left + latestIndex * xStep + xStep / 2 : w * 0.78;
  const pointerY = latest ? y(latest.h) : h * 0.35;
  const pointerGroupY = Math.max(padding.top + 42, pointerY - 54);

  return (
    <div className={styles.chartWrap}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Guest progress chart" onMouseLeave={() => setHovered(null)}>
        <line x1={padding.left} x2={w - padding.right} y1={h - padding.bottom} y2={h - padding.bottom} stroke="rgba(255,255,255,0.12)" />

        {activeX !== null && activeY !== null ? (
          <g className={styles.chartCrosshair}>
            <line x1={activeX} x2={activeX} y1={padding.top} y2={h - padding.bottom} />
            <line x1={padding.left} x2={w - padding.right} y1={activeY} y2={activeY} />
          </g>
        ) : null}

        {candles.map((c, i) => {
          const x = padding.left + i * xStep + xStep / 2;
          const bodyTop = y(Math.max(c.o, c.c));
          const bodyBottom = y(Math.min(c.o, c.c));
          const bodyH = Math.max(4, bodyBottom - bodyTop);
          const up = c.c >= c.o;
          const isLatest = latest?.t === c.t;
          const isSelected = selected?.t === c.t;
          const isHovered = hovered?.t === c.t;

          return (
            <g
              key={c.t}
              onClick={() => onSelect(c)}
              onMouseEnter={() => setHovered(c)}
              onTouchStart={() => setHovered(c)}
              style={{ cursor: "pointer" }}
              className={`${shouldPulse && isLatest ? styles.guestCandlePulse : ""} ${isSelected ? styles.selectedChartPoint : ""}`}
            >
              <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={up ? "rgba(52,211,153,0.95)" : "rgba(251,113,133,0.95)"} strokeWidth={isSelected ? 4 : 2} />
              <rect x={x - Math.min(14, xStep * 0.35)} y={bodyTop} width={Math.min(28, xStep * 0.7)} height={bodyH} rx={4} fill={up ? "rgba(52,211,153,0.78)" : "rgba(251,113,133,0.78)"} stroke={isSelected || isHovered ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.15)"} strokeWidth={isSelected ? 3 : 1} />
              {isSelected ? <circle cx={x} cy={y(c.c)} r={8} fill="rgba(255,255,255,0.95)" /> : null}
              <rect x={x - xStep / 2} y={0} width={xStep} height={h} fill="transparent" />
            </g>
          );
        })}

        {shouldPulse ? (
          <g transform={`translate(${pointerX}, ${pointerGroupY})`} aria-hidden="true">
            <g className={styles.guestSvgPointer}>
              <text className={styles.guestSvgPointerLabel} x="0" y="0" textAnchor="middle">Tap</text>
              <text className={styles.guestSvgPointerEmoji} x="0" y="36" textAnchor="middle">{pointerText}</text>
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
