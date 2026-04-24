"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../YouInc/youinc.module.css";

type TabKey = "goals" | "good" | "bad" | "addictions";
type Timeframe = "1d" | "3d" | "1w" | "1m";
type Tx = { id: string; ts: number; deltaUC: number; label: string };
type GoodHabit = { id: string; title: string; frequencyMode: "daily"; daysOfWeek: number[]; notes: string; createdAt: number };
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
  | "final";

const SECTION_ORDER: TabKey[] = ["goals", "good", "bad", "addictions"];
const SECTION_TITLES: Record<TabKey, string> = {
  goals: "Goals",
  good: "Good Habits",
  bad: "Bad Habits",
  addictions: "Addictions",
};
const SECTION_SUBTITLES: Record<TabKey, string> = {
  goals: "Bigger targets with deadlines.",
  good: "Reward consistency and build momentum.",
  bad: "Track habits you want to stop feeding.",
  addictions: "Monitor relapses with stronger penalties.",
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
    return { t: start, o: priceFromCap(open), h: priceFromCap(high), l: priceFromCap(low), c: priceFromCap(cap), tx: bucketTx };
  });
}

export default function GuestPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("good-tab");
  const [tab, setTab] = useState<TabKey>("goals");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [goodTitle, setGoodTitle] = useState("Log my habits");
  const [goodHabits, setGoodHabits] = useState<GoodHabit[]>([]);
  const [marketCapUC, setMarketCapUC] = useState(10000);
  const [tx, setTx] = useState<Tx[]>([]);
  const [tf, setTf] = useState<Timeframe>("1d");
  const [isBuyOpen, setIsBuyOpen] = useState(false);
  const [buyActivity, setBuyActivity] = useState("Do 5 push ups. Seriously, do it.");
  const [selected, setSelected] = useState<Candle | null>(null);
  const [showMetricHelp, setShowMetricHelp] = useState(false);

  const tabsRef = useRef<HTMLDivElement | null>(null);
  const addEntryRef = useRef<HTMLButtonElement | null>(null);
  const goodListRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const tfRef = useRef<HTMLDivElement | null>(null);
  const buyRef = useRef<HTMLButtonElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);

  const price = marketCapUC / 10000;
  const candles = useMemo(() => buildCandles(marketCapUC, tx, tf), [marketCapUC, tx, tf]);
  const latestCandle = candles[candles.length - 1] ?? null;

  function scrollTo(ref: React.RefObject<HTMLElement | null>) {
    window.setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }

  function applyDelta(label: string, deltaUC: number) {
    const entry = { id: uid(), ts: Date.now(), deltaUC, label };
    setTx((prev) => [entry, ...prev].slice(0, 500));
    setMarketCapUC((prev) => Math.max(0, prev + deltaUC));
  }

  function pickGoodTab() {
    setTab("good");
    setStep("add-entry");
    scrollTo(addEntryRef);
  }

  function openEntry() {
    setTab("good");
    setGoodTitle("Log my habits");
    setIsModalOpen(true);
    setStep("modal-add");
  }

  function addHabit() {
    const item: GoodHabit = {
      id: uid(),
      title: goodTitle.trim() || "Log my habits",
      frequencyMode: "daily",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      notes: "Guest onboarding example",
      createdAt: Date.now(),
    };
    setGoodHabits([item]);
    setIsModalOpen(false);
    setStep("hold");
    scrollTo(goodListRef);
  }

  function holdHabit(habit: GoodHabit) {
    applyDelta(`${habit.title} (Good habit · Hold)`, 100);
    setTf("1d");
    setStep("chart-day");
    scrollTo(chartRef);
  }

  function acknowledgeDayChart() {
    setStep("tf-info");
    scrollTo(tfRef);
  }

  function acknowledgeTfInfo() {
    setStep("buy-open");
    scrollTo(buyRef);
  }

  function openBuy() {
    setIsBuyOpen(true);
    setBuyActivity("Do 5 push ups. Seriously, do it.");
    setStep("buy-complete");
    scrollTo(chartRef);
  }

  function completeBuy() {
    applyDelta(`BUY: ${buyActivity.trim() || "Do 5 push ups"}`, 25);
    setIsBuyOpen(false);
    setStep("tap-candle");
    scrollTo(chartRef);
  }

  function selectCandle(candle: Candle) {
    setSelected(candle);
    if (step === "tap-candle") {
      setStep("details");
      setShowMetricHelp(true);
      scrollTo(detailsRef);
    }
  }

  function finishMetricHelp() {
    setShowMetricHelp(false);
    setStep("final");
  }

  function isHighlight(target: Step) {
    return step === target ? styles.guestPulse : "";
  }

  return (
    <div className={styles.page}>
      <div className={styles.glowA} />
      <div className={styles.glowB} />
      <div className={styles.glowC} />

      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.logo} />
            <div className={styles.brandText}>
              <div className={styles.eyebrow}>You Inc. Guest Mode</div>
              <div className={styles.title}>You are the stock.</div>
              <div className={styles.subTitle}>Try the loop before creating an account.</div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <a className={styles.secondaryBtn} href="/login">Login</a>
            <button ref={addEntryRef} className={`${styles.addBtn} ${isHighlight("add-entry")}`} onClick={openEntry} type="button">
              <span className={styles.addPlus}>＋</span>
              Add entry
            </button>
          </div>
        </header>

        <section className={styles.heroCard}>
          <div className={styles.heroCopy}>
            <div className={styles.heroTitle}>This is a guided demo, not your real account yet.</div>
            <div className={styles.heroText}>Follow the highlighted buttons. You’ll add a habit, log it, read the candle, then create your own account.</div>
          </div>
          <div className={styles.heroStats}>
            <div className={`${styles.heroStat} ${styles.heroStat_positive}`}><span>Market Cap</span><strong>{marketCapUC.toLocaleString()} UC</strong></div>
            <div className={styles.heroStat}><span>Price</span><strong>U${price.toFixed(3)}</strong></div>
            <div className={styles.heroStat}><span>Entries</span><strong>{tx.length}</strong></div>
            <div className={`${styles.heroStat} ${styles.heroStat_warning}`}><span>Mode</span><strong>Guest</strong></div>
          </div>
        </section>

        <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label="Guest onboarding sections">
          {SECTION_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`${styles.tab} ${tab === key ? styles.tabActive : ""} ${key === "good" ? isHighlight("good-tab") : ""}`}
              onClick={() => (key === "good" && step === "good-tab" ? pickGoodTab() : setTab(key))}
            >
              <span>{SECTION_TITLES[key]}</span>
              <small>{SECTION_SUBTITLES[key]}</small>
            </button>
          ))}
        </div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderCopy}>
              <div className={styles.panelHeaderTitle}>{SECTION_TITLES[tab]}</div>
              <div className={styles.panelHeaderText}>{SECTION_SUBTITLES[tab]}</div>
            </div>
          </div>

          {tab !== "good" ? (
            <EmptyState text="This demo focuses on Good Habits first. Tap Good Habits to continue." />
          ) : (
            <div ref={goodListRef} className={styles.list}>
              {goodHabits.length === 0 ? (
                <EmptyState text="No good habits yet. Tap Add entry to create your first one." />
              ) : (
                goodHabits.map((h) => (
                  <div key={h.id} className={styles.card}>
                    <div className={styles.cardMain}>
                      <div className={styles.cardTitle}>{h.title}</div>
                      <div className={styles.metaRow}>
                        <span className={styles.metaPill}>Every day</span>
                        <span className={styles.metaNote}>{h.notes}</span>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={`${styles.actionPrimary} ${isHighlight("hold")}`} onClick={() => holdHabit(h)} type="button">
                        Hold <span className={styles.delta}>+100 UC</span>
                      </button>
                      <button className={styles.actionDanger} type="button">Sold <span className={styles.delta}>-50 UC</span></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <section ref={chartRef} className={styles.chartIntro}>
          <div>
            <div className={styles.chartIntroTitle}>Your chart</div>
            <div className={styles.chartIntroText}>Your actions become candles. Better behaviour pushes the price up.</div>
          </div>
          <div ref={tfRef} className={`${styles.tfRow} ${isHighlight("tf-info")}`}>
            <button ref={buyRef} className={`${styles.actionPrimary} ${isHighlight("buy-open")}`} onClick={openBuy} type="button">BUY <span className={styles.delta}>+25 UC</span></button>
            {(["1d", "3d", "1w", "1m"] as Timeframe[]).map((key) => (
              <button key={key} className={`${styles.tfBtn} ${tf === key ? styles.tfBtnOn : ""}`} onClick={() => setTf(key)} type="button">{key.toUpperCase()}</button>
            ))}
          </div>
        </section>

        {step === "chart-day" ? (
          <GuideBox title="Each candlestick = 1 day" text="Green means your close price ended higher than the open. Red means it ended lower." button="OK" onClick={acknowledgeDayChart} />
        ) : null}

        {step === "tf-info" ? (
          <GuideBox title="Change the view" text="1D, 3D, 1W, and 1M change how much time one candle represents." button="OK" onClick={acknowledgeTfInfo} />
        ) : null}

        {isBuyOpen ? (
          <div className={styles.helperBox} style={{ marginBottom: 12 }}>
            <div className={styles.helperTitle}>Open a position</div>
            <div className={styles.helperText}>One-off productive action. This is separate from recurring habits.</div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input className={styles.input} value={buyActivity} onChange={(e) => setBuyActivity(e.target.value)} style={{ marginTop: 0, flex: "1 1 260px" }} />
              <button className={`${styles.primaryBtn} ${isHighlight("buy-complete")}`} type="button" onClick={completeBuy}>Completed <span className={styles.delta}>+25 UC</span></button>
            </div>
          </div>
        ) : null}

        <MiniCandleChart candles={candles} selected={selected} latest={latestCandle} shouldPulse={step === "tap-candle"} onSelect={selectCandle} />

        {step === "tap-candle" ? (
          <GuideBox title="Tap the latest candle" text="Every candle can show what you logged inside that time period." button="I’ll tap it" onClick={() => scrollTo(chartRef)} />
        ) : null}

        <section ref={detailsRef} className={`${styles.detailsPanel} ${styles.detailsPanelOpen}`}>
          <div className={styles.detailsHeader}>
            <div>
              <div className={styles.detailsTitle}>Candle Details</div>
              <div className={styles.detailsRange}>{selected ? new Date(selected.t).toLocaleString() : "Tap a candle to inspect it."}</div>
            </div>
            {showMetricHelp ? <button className={styles.primaryBtn} onClick={finishMetricHelp} type="button">Got it</button> : null}
          </div>

          <div className={styles.detailsBody}>
            <div className={styles.detailsStats}>
              <Metric label="Open" value={selected ? `U$${selected.o.toFixed(3)}` : "—"} help={showMetricHelp ? "Starting price for this candle." : undefined} />
              <Metric label="High" value={selected ? `U$${selected.h.toFixed(3)}` : "—"} help={showMetricHelp ? "Highest price reached during this candle." : undefined} />
              <Metric label="Low" value={selected ? `U$${selected.l.toFixed(3)}` : "—"} help={showMetricHelp ? "Lowest price reached during this candle." : undefined} />
              <Metric label="Close" value={selected ? `U$${selected.c.toFixed(3)}` : "—"} help={showMetricHelp ? "Final price at the end of this candle." : undefined} />
              <Metric label="MarketCap" value={`${marketCapUC.toLocaleString()} UC`} help={showMetricHelp ? "Your main score. Actions add or remove UC." : undefined} />
            </div>

            <div className={styles.txList}>
              {(selected?.tx.length ? selected.tx : tx.slice(0, 4)).map((entry) => (
                <div key={entry.id} className={styles.txItem}>
                  <div><div className={styles.txTitle}>{entry.label}</div><div className={styles.txTime}>{new Date(entry.ts).toLocaleTimeString()}</div></div>
                  <div className={`${styles.txDelta} ${entry.deltaUC >= 0 ? styles.txPositive : styles.txNegative}`}>{entry.deltaUC > 0 ? "+" : ""}{entry.deltaUC} UC</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {step === "final" ? (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalHeader}><div className={styles.modalTitle}>Are you ready?</div></div>
              <div className={styles.modalBody}>
                <div className={styles.helperText} style={{ fontSize: 15, lineHeight: 1.7 }}>
                  Stop guessing whether you’re improving. Track the signal, cut the noise, and make your next candle count.
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.primaryBtn} onClick={() => router.push("/register")} type="button">Let&apos;s get started</button>
              </div>
            </div>
          </div>
        ) : null}

        {isModalOpen ? (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>Add Good Habit</div>
                <button className={styles.iconBtn} onClick={() => setIsModalOpen(false)} aria-label="Close modal" type="button">✕</button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.form}>
                  <label className={styles.label}>Habit<input className={styles.input} value={goodTitle} onChange={(e) => setGoodTitle(e.target.value)} autoFocus /></label>
                  <div className={styles.row2}>
                    <label className={styles.label}>Frequency<select className={styles.input} value="daily" disabled><option>Every day</option></select></label>
                    <label className={styles.label}>Notes<input className={styles.input} value="tracking habits is also a habit" readOnly /></label>
                  </div>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.ghostBtn} onClick={() => setIsModalOpen(false)} type="button">Cancel</button>
                <button className={`${styles.primaryBtn} ${isHighlight("modal-add")}`} onClick={addHabit} disabled={!goodTitle.trim()} type="button">Add</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.empty}><div className={styles.emptyIcon}>◇</div><div className={styles.emptyText}>{text}</div></div>;
}

function GuideBox({ title, text, button, onClick }: { title: string; text: string; button: string; onClick: () => void }) {
  return (
    <div className={styles.guestGuideBox}>
      <div><div className={styles.helperTitle}>{title}</div><div className={styles.helperText}>{text}</div></div>
      <button className={styles.primaryBtn} onClick={onClick} type="button">{button}</button>
    </div>
  );
}

function Metric({ label, value, help }: { label: string; value: string; help?: string }) {
  return <div className={help ? styles.guestMetricHelp : ""}><span>{label}</span><strong>{value}</strong>{help ? <small>{help}</small> : null}</div>;
}

function MiniCandleChart({ candles, selected, latest, shouldPulse, onSelect }: { candles: Candle[]; selected: Candle | null; latest: Candle | null; shouldPulse: boolean; onSelect: (c: Candle) => void }) {
  const w = 1000;
  const h = 320;
  const padding = { top: 18, right: 18, bottom: 28, left: 50 };
  const vals = candles.flatMap((c) => [c.h, c.l]);
  const min = Math.min(...vals, 0.95);
  const max = Math.max(...vals, 1.05);
  const span = Math.max(0.001, max - min);
  const xStep = (w - padding.left - padding.right) / Math.max(1, candles.length);
  const y = (v: number) => padding.top + ((max - v) / span) * (h - padding.top - padding.bottom);

  return (
    <div className={styles.chartWrap}>
      {shouldPulse ? <div className={styles.guestPointer}>Tap this candle ↓</div> : null}
      <svg className={styles.chartSvg} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Guest candlestick chart">
        <line x1={padding.left} x2={w - padding.right} y1={h - padding.bottom} y2={h - padding.bottom} stroke="rgba(255,255,255,0.12)" />
        {candles.map((c, i) => {
          const x = padding.left + i * xStep + xStep / 2;
          const bodyTop = y(Math.max(c.o, c.c));
          const bodyBottom = y(Math.min(c.o, c.c));
          const bodyH = Math.max(4, bodyBottom - bodyTop);
          const up = c.c >= c.o;
          const isLatest = latest?.t === c.t;
          const isSelected = selected?.t === c.t;
          return (
            <g key={c.t} onClick={() => onSelect(c)} style={{ cursor: "pointer" }} className={shouldPulse && isLatest ? styles.guestCandlePulse : undefined}>
              <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={up ? "rgba(52,211,153,0.95)" : "rgba(251,113,133,0.95)"} strokeWidth={2} />
              <rect x={x - Math.min(14, xStep * 0.35)} y={bodyTop} width={Math.min(28, xStep * 0.7)} height={bodyH} rx={4} fill={up ? "rgba(52,211,153,0.78)" : "rgba(251,113,133,0.78)"} stroke={isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.15)"} />
              <rect x={x - xStep / 2} y={0} width={xStep} height={h} fill="transparent" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
