"use client";

import { applyTaxes, isMarketOpen, type DeltaKind } from "./rules";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./youinc.module.css";

type TabKey = "goals" | "good" | "bad" | "addictions";

type Goal = { id: string; title: string; expiry: string; createdAt: number };

type GoodHabit = {
  id: string;
  title: string;
  frequencyMode: "daily" | "weekly";
  daysOfWeek: number[];
  notes: string;
  createdAt: number;
};

type BadHabit = {
  id: string;
  title: string;
  expiryMode: "date" | "permanent";
  expiryDate?: string;
  createdAt: number;
};

type Addiction = { id: string; title: string; createdAt: number };

type Tx = { id: string; ts: number; deltaUC: number; label: string };

type Store = {
  marketCapUC: number; // 1000 UC = 1.000 U$
  tx: Tx[];
  goals: Goal[];
  goodHabits: GoodHabit[];
  badHabits: BadHabit[];
  addictions: Addiction[];
};

type Candle = { t: number; o: number; h: number; l: number; c: number };

const STORAGE_KEY = "youinc_v1_store";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDow(d: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] ?? "";
}

function floorToBucket(ts: number, bucketMs: number) {
  return Math.floor(ts / bucketMs) * bucketMs;
}

function buildCandles(startCapUC: number, txAsc: Tx[], bucketMs: number, lookbackBuckets: number): Candle[] {
  const now = Date.now();
  const endBucket = floorToBucket(now, bucketMs);
  const startBucket = endBucket - bucketMs * (lookbackBuckets - 1);

  // reverse-apply tx after startBucket to estimate cap at startBucket
  let capAtStart = startCapUC;
  for (const tx of txAsc) {
    if (tx.ts >= startBucket) capAtStart -= tx.deltaUC;
  }
  capAtStart = Math.max(0, capAtStart);

  const bucketMap = new Map<number, Tx[]>();
  for (const tx of txAsc) {
    const b = floorToBucket(tx.ts, bucketMs);
    if (b < startBucket || b > endBucket) continue;
    const arr = bucketMap.get(b) ?? [];
    arr.push(tx);
    bucketMap.set(b, arr);
  }

  const toPrice = (uc: number) => uc / 10000;

  const candles: Candle[] = [];
  let cap = capAtStart;

  for (let b = startBucket; b <= endBucket; b += bucketMs) {
    const bucketTx = (bucketMap.get(b) ?? []).sort((a, z) => a.ts - z.ts);

    const open = cap;
    let high = cap;
    let low = cap;

    for (const tx of bucketTx) {
      cap = Math.max(0, cap + tx.deltaUC);
      high = Math.max(high, cap);
      low = Math.min(low, cap);
    }

    const close = cap;

    candles.push({
      t: b,
      o: toPrice(open),
      h: toPrice(high),
      l: toPrice(low),
      c: toPrice(close),
    });
  }

  return candles;
}

export default function YouIncPage() {
  const [tab, setTab] = useState<TabKey>("goals");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tf, setTf] = useState<"1m" | "1h" | "4h" | "1d">("1d");

  const [isBuyOpen, setIsBuyOpen] = useState(false);
  const [buyActivity, setBuyActivity] = useState("");

  const [store, setStore] = useState<Store>({
    marketCapUC: 10000, // 10000 UC = 1.000 U$
    tx: [],
    goals: [],
    goodHabits: [],
    badHabits: [],
    addictions: [],
  });

  // ------- Modal form state -------
  const [goalTitle, setGoalTitle] = useState("");
  const [goalExpiry, setGoalExpiry] = useState(todayISO());

  const [goodTitle, setGoodTitle] = useState("");
  const [goodFrequencyMode, setGoodFrequencyMode] = useState<"daily" | "weekly">("daily");
  const [goodDays, setGoodDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [goodNotes, setGoodNotes] = useState("");

  const [badTitle, setBadTitle] = useState("");
  const [badExpiryMode, setBadExpiryMode] = useState<"date" | "permanent">("date");
  const [badExpiryDate, setBadExpiryDate] = useState(todayISO());

  const [addictionTitle, setAddictionTitle] = useState("");

  // ⏱️ Real-time tick (needed for 1m chart to "move" even without actions)
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ------- persistence -------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Store;
      if (!parsed || typeof parsed.marketCapUC !== "number") return;

      setStore({
        marketCapUC: parsed.marketCapUC ?? 10000,
        tx: Array.isArray(parsed.tx) ? parsed.tx : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        goodHabits: Array.isArray(parsed.goodHabits) ? parsed.goodHabits : [],
        badHabits: Array.isArray(parsed.badHabits) ? parsed.badHabits : [],
        addictions: Array.isArray(parsed.addictions) ? parsed.addictions : [],
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore
    }
  }, [store]);

  // ------- taxed market cap updates + transactions -------
  const applyDelta = React.useCallback((kind: DeltaKind, label: string, deltaUC: number) => {
    setStore((s) => {
      const { effectiveDeltaUC, taxed } = applyTaxes(kind, deltaUC, s.marketCapUC);

      const nextCap = Math.max(0, s.marketCapUC + effectiveDeltaUC);
      const tx: Tx = {
        id: uid(),
        ts: Date.now(),
        deltaUC: effectiveDeltaUC,
        label: taxed ? `${label} (taxed)` : label,
      };

      return { ...s, marketCapUC: nextCap, tx: [tx, ...s.tx].slice(0, 2000) };
    });
  }, []);

  // 🧊 Decay (TEST): -5 UC every 10 seconds, except market closed hours
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
    function runHourlyDecayTick() {
      // Only decay when market is open (your rules.ts defines 04:00–11:59 as CLOSED)
      if (!isMarketOpen(new Date())) return;
      applyDelta("decay", "Decay", -5);
    }
  
    function schedule() {
      const now = new Date();
  
      // ms until the next exact hour (e.g. 14:00:00.000)
      const msToNextHour =
        (60 - now.getMinutes()) * 60_000 -
        now.getSeconds() * 1_000 -
        now.getMilliseconds();
  
      timeoutId = setTimeout(() => {
        // First tick exactly on the hour
        runHourlyDecayTick();
  
        // Then every hour on the hour
        intervalId = setInterval(runHourlyDecayTick, 60 * 60 * 1000);
      }, msToNextHour);
    }
  
    schedule();
  
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [applyDelta]);

  function submitBuyActivity() {
    const a = buyActivity.trim();
    if (!a) return;

    applyDelta("buy", `BUY: ${a}`, +25);
    setBuyActivity("");
    setIsBuyOpen(false);
  }

  // ------- derived -------
  const price = useMemo(() => store.marketCapUC / 10000, [store.marketCapUC]);

  const txAsc = useMemo(() => [...store.tx].sort((a, b) => a.ts - b.ts), [store.tx]);

  const candles = useMemo(() => {
    if (tf === "1m") return buildCandles(store.marketCapUC, txAsc, 60 * 1000, 120);
    if (tf === "1h") return buildCandles(store.marketCapUC, txAsc, 60 * 60 * 1000, 48);
    if (tf === "4h") return buildCandles(store.marketCapUC, txAsc, 4 * 60 * 60 * 1000, 42);
    return buildCandles(store.marketCapUC, txAsc, 24 * 60 * 60 * 1000, 60);
  }, [tf, store.marketCapUC, txAsc, nowTick]);

  const tfChangePct = useMemo(() => {
    if (!candles || candles.length < 2) return 0;
  
    const first = candles[0];
    const last = candles[candles.length - 1];
  
    const base = first.o || 0;
    if (base <= 0) return 0;
  
    return ((last.c - base) / base) * 100;
  }, [candles]);
  
  const tfChangeLabel = useMemo(() => {
    const sign = tfChangePct > 0 ? "+" : "";
    return `${sign}${tfChangePct.toFixed(2)}%`;
  }, [tfChangePct]);
  
  const tfChangeIsUp = tfChangePct >= 0;

  // ------- helpers -------
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const modalTitle = useMemo(() => {
    if (tab === "goals") return "Add Goal";
    if (tab === "good") return "Add Good Habit";
    if (tab === "bad") return "Add Bad Habit";
    return "Add Addiction";
  }, [tab]);

  function resetFormForTab(nextTab: TabKey) {
    if (nextTab === "goals") {
      setGoalTitle("");
      setGoalExpiry(todayISO());
    } else if (nextTab === "good") {
      setGoodTitle("");
      setGoodFrequencyMode("daily");
      setGoodDays([1, 2, 3, 4, 5]);
      setGoodNotes("");
    } else if (nextTab === "bad") {
      setBadTitle("");
      setBadExpiryMode("date");
      setBadExpiryDate(todayISO());
    } else {
      setAddictionTitle("");
    }
  }

  function switchTab(next: TabKey) {
    setTab(next);
    setIsModalOpen(false);
    resetFormForTab(next);
  }

  function toggleDow(day: number) {
    setGoodDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  function canSubmit() {
    if (tab === "goals") return goalTitle.trim().length > 0 && !!goalExpiry;
    if (tab === "good") {
      if (goodTitle.trim().length === 0) return false;
      if (goodFrequencyMode === "weekly" && goodDays.length === 0) return false;
      return true;
    }
    if (tab === "bad") {
      if (badTitle.trim().length === 0) return false;
      if (badExpiryMode === "date" && !badExpiryDate) return false;
      return true;
    }
    return addictionTitle.trim().length > 0;
  }

  function submit() {
    if (!canSubmit()) return;

    if (tab === "goals") {
      const item: Goal = { id: uid(), title: goalTitle.trim(), expiry: goalExpiry, createdAt: Date.now() };
      setStore((s) => ({ ...s, goals: [item, ...s.goals] }));
      closeModal();
      resetFormForTab("goals");
      return;
    }

    if (tab === "good") {
      const item: GoodHabit = {
        id: uid(),
        title: goodTitle.trim(),
        frequencyMode: goodFrequencyMode,
        daysOfWeek: goodFrequencyMode === "daily" ? [0, 1, 2, 3, 4, 5, 6] : goodDays,
        notes: goodNotes.trim(),
        createdAt: Date.now(),
      };
      setStore((s) => ({ ...s, goodHabits: [item, ...s.goodHabits] }));
      closeModal();
      resetFormForTab("good");
      return;
    }

    if (tab === "bad") {
      const item: BadHabit = {
        id: uid(),
        title: badTitle.trim(),
        expiryMode: badExpiryMode,
        expiryDate: badExpiryMode === "date" ? badExpiryDate : undefined,
        createdAt: Date.now(),
      };
      setStore((s) => ({ ...s, badHabits: [item, ...s.badHabits] }));
      closeModal();
      resetFormForTab("bad");
      return;
    }

    const item: Addiction = { id: uid(), title: addictionTitle.trim(), createdAt: Date.now() };
    setStore((s) => ({ ...s, addictions: [item, ...s.addictions] }));
    closeModal();
    resetFormForTab("addictions");
  }

  function removeItem(kind: TabKey, id: string) {
    if (kind === "goals") setStore((s) => ({ ...s, goals: s.goals.filter((x) => x.id !== id) }));
    if (kind === "good") setStore((s) => ({ ...s, goodHabits: s.goodHabits.filter((x) => x.id !== id) }));
    if (kind === "bad") setStore((s) => ({ ...s, badHabits: s.badHabits.filter((x) => x.id !== id) }));
    if (kind === "addictions") setStore((s) => ({ ...s, addictions: s.addictions.filter((x) => x.id !== id) }));
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
              <div className={styles.title}>YouInc</div>
              <div className={styles.subTitle}>You are the stock.</div>
            </div>
          </div>

          <button className={styles.addBtn} onClick={openModal} type="button">
            <span className={styles.addPlus}>＋</span>
            Add
          </button>
        </header>

        <nav className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "goals" ? styles.tabActive : ""}`} onClick={() => switchTab("goals")} type="button">
            Goals
          </button>
          <button className={`${styles.tab} ${tab === "good" ? styles.tabActive : ""}`} onClick={() => switchTab("good")} type="button">
            Good Habits
          </button>
          <button className={`${styles.tab} ${tab === "bad" ? styles.tabActive : ""}`} onClick={() => switchTab("bad")} type="button">
            Bad Habits
          </button>
          <button
            className={`${styles.tab} ${tab === "addictions" ? styles.tabActive : ""}`}
            onClick={() => switchTab("addictions")}
            type="button"
          >
            Addictions
          </button>
        </nav>

        {/* TAB CONTENT */}
        <section className={styles.panel}>
          {tab === "goals" && (
            <div className={styles.list}>
              {store.goals.length === 0 ? (
                <EmptyState text="No goals yet. Add one and give it an expiry date." />
              ) : (
                store.goals.map((g) => (
                  <div key={g.id} className={styles.card}>
                    <div className={styles.cardMain}>
                      <div className={styles.cardTitle}>{g.title}</div>
                      <div className={styles.metaRow}>
                        <span className={styles.metaPill}>Expiry: {g.expiry}</span>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={styles.actionPrimary} onClick={() => applyDelta("goal", "Goal complete", +400)} type="button">
                        Complete <span className={styles.delta}>+400 UC</span>
                      </button>
                      <button className={styles.actionDanger} onClick={() => applyDelta("goal", "Goal failed", -200)} type="button">
                        Failed <span className={styles.delta}>-200 UC</span>
                      </button>
                      <button className={styles.iconBtn} onClick={() => removeItem("goals", g.id)} title="Remove" type="button">
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "good" && (
            <div className={styles.list}>
              {store.goodHabits.length === 0 ? (
                <EmptyState text="No good habits yet. Add a habit and choose frequency." />
              ) : (
                store.goodHabits.map((h) => (
                  <div key={h.id} className={styles.card}>
                    <div className={styles.cardMain}>
                      <div className={styles.cardTitle}>{h.title}</div>
                      <div className={styles.metaRow}>
                        <span className={styles.metaPill}>
                          {h.frequencyMode === "daily" ? "Every day" : `Days: ${h.daysOfWeek.map(formatDow).join(", ")}`}
                        </span>
                        {h.notes ? <span className={styles.metaNote}>{h.notes}</span> : null}
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={styles.actionPrimary} onClick={() => applyDelta("good", "Good habit hold", +100)} type="button">
                        Hold <span className={styles.delta}>+100 UC</span>
                      </button>
                      <button className={styles.actionDanger} onClick={() => applyDelta("good", "Good habit sold", -50)} type="button">
                        Sold <span className={styles.delta}>-50 UC</span>
                      </button>
                      <button className={styles.iconBtn} onClick={() => removeItem("good", h.id)} title="Remove" type="button">
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "bad" && (
            <div className={styles.list}>
              {store.badHabits.length === 0 ? (
                <EmptyState text="No bad habits yet. Add one and set an expiry date (or permanent)." />
              ) : (
                store.badHabits.map((b) => (
                  <div key={b.id} className={styles.card}>
                    <div className={styles.cardMain}>
                      <div className={styles.cardTitle}>{b.title}</div>
                      <div className={styles.metaRow}>
                        <span className={styles.metaPill}>{b.expiryMode === "permanent" ? "Permanent" : `Expiry: ${b.expiryDate}`}</span>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={styles.actionPrimary} onClick={() => applyDelta("bad", "Bad habit hold", +100)} type="button">
                        Hold <span className={styles.delta}>+100 UC</span>
                      </button>
                      <button className={styles.actionDanger} onClick={() => applyDelta("bad", "Bad habit sold", -50)} type="button">
                        Sold <span className={styles.delta}>-50 UC</span>
                      </button>
                      <button className={styles.iconBtn} onClick={() => removeItem("bad", b.id)} title="Remove" type="button">
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "addictions" && (
            <div className={styles.list}>
              {store.addictions.length === 0 ? (
                <EmptyState text="No addictions tracked yet. Add one and start stacking clean days." />
              ) : (
                store.addictions.map((a) => (
                  <div key={a.id} className={styles.card}>
                    <div className={styles.cardMain}>
                      <div className={styles.cardTitle}>{a.title}</div>
                      <div className={styles.metaRow}>
                        <span className={styles.metaPill}>No expiry</span>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={styles.actionPrimary} onClick={() => applyDelta("addiction", "Addiction hold", +200)} type="button">
                        Hold <span className={styles.delta}>+200 UC</span>
                      </button>
                      <button className={styles.actionDanger} onClick={() => applyDelta("addiction", "Addiction sold", -100)} type="button">
                        Sold <span className={styles.delta}>-100 UC</span>
                      </button>
                      <button className={styles.iconBtn} onClick={() => removeItem("addictions", a.id)} title="Remove" type="button">
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* CHART BELOW PANEL */}
        <section className={styles.topStats}>
          <div className={styles.statBlock}>
            <div className={styles.statLabel}>Market Cap</div>
            <div className={styles.statValue}>{store.marketCapUC.toLocaleString()} UC</div>
          </div>

          <div className={styles.statBlock}>
  <div className={styles.statLabel}>Price</div>

  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
    <div className={styles.statValue}>U${price.toFixed(3)}</div>

    <span
      className={styles.metaPill}
      style={{
        borderColor: tfChangeIsUp ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)",
        color: tfChangeIsUp ? "rgba(167,243,208,1)" : "rgba(253,164,175,1)",
        background: tfChangeIsUp ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
      }}
      title={`Change over ${tf.toUpperCase()}`}
    >
      {tfChangeLabel}
    </span>
  </div>
</div>

          <div className={styles.tfRow}>
            {/* BUY */}
            <button
              className={styles.actionPrimary}
              type="button"
              onClick={() => setIsBuyOpen((v) => !v)}
              title="Log a one-off productive activity"
            >
              BUY <span className={styles.delta}>+25 UC</span>
            </button>

            {/* TF buttons */}
            <button className={`${styles.tfBtn} ${tf === "1m" ? styles.tfBtnOn : ""}`} onClick={() => setTf("1m")} type="button">
              1M
            </button>
            <button className={`${styles.tfBtn} ${tf === "1h" ? styles.tfBtnOn : ""}`} onClick={() => setTf("1h")} type="button">
              1H
            </button>
            <button className={`${styles.tfBtn} ${tf === "4h" ? styles.tfBtnOn : ""}`} onClick={() => setTf("4h")} type="button">
              4H
            </button>
            <button className={`${styles.tfBtn} ${tf === "1d" ? styles.tfBtnOn : ""}`} onClick={() => setTf("1d")} type="button">
              1D
            </button>
          </div>
        </section>

        {isBuyOpen && (
          <div className={styles.helperBox} style={{ marginBottom: 12 }}>
            <div className={styles.helperTitle}>Open a position</div>
            <div className={styles.helperText}>Log a one-off productive activity (not a habit yet).</div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                className={styles.input}
                value={buyActivity}
                onChange={(e) => setBuyActivity(e.target.value)}
                placeholder="Activity e.g. Running, Camping, Meditation"
                style={{ marginTop: 0, flex: "1 1 260px" }}
              />

              <button className={styles.primaryBtn} type="button" onClick={submitBuyActivity} disabled={!buyActivity.trim()}>
                Completed <span className={styles.delta}>+25 UC</span>
              </button>

              <button className={styles.ghostBtn} type="button" onClick={() => setIsBuyOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}

        <CandleChart data={candles} />

        {/* MODAL */}
        {isModalOpen && (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>{modalTitle}</div>
                <button className={styles.iconBtn} onClick={closeModal} aria-label="Close modal" type="button">
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                {tab === "goals" && (
                  <div className={styles.form}>
                    <label className={styles.label}>
                      Goal
                      <input className={styles.input} value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} autoFocus />
                    </label>

                    <label className={styles.label}>
                      Expiry date
                      <input className={styles.input} type="date" value={goalExpiry} onChange={(e) => setGoalExpiry(e.target.value)} />
                    </label>
                  </div>
                )}

                {tab === "good" && (
                  <div className={styles.form}>
                    <label className={styles.label}>
                      Habit
                      <input className={styles.input} value={goodTitle} onChange={(e) => setGoodTitle(e.target.value)} autoFocus />
                    </label>

                    <div className={styles.row2}>
                      <label className={styles.label}>
                        Frequency
                        <select className={styles.input} value={goodFrequencyMode} onChange={(e) => setGoodFrequencyMode(e.target.value as any)}>
                          <option value="daily">Every day</option>
                          <option value="weekly">Pick days</option>
                        </select>
                      </label>

                      <label className={styles.label}>
                        Notes
                        <input className={styles.input} value={goodNotes} onChange={(e) => setGoodNotes(e.target.value)} placeholder="optional" />
                      </label>
                    </div>

                    {goodFrequencyMode === "weekly" && (
                      <div className={styles.dowRow}>
                        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                          <button
                            key={d}
                            type="button"
                            className={`${styles.dowPill} ${goodDays.includes(d) ? styles.dowPillOn : ""}`}
                            onClick={() => toggleDow(d)}
                          >
                            {formatDow(d)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "bad" && (
                  <div className={styles.form}>
                    <label className={styles.label}>
                      Bad Habit
                      <input className={styles.input} value={badTitle} onChange={(e) => setBadTitle(e.target.value)} autoFocus />
                    </label>

                    <div className={styles.row2}>
                      <label className={styles.label}>
                        Expiry
                        <select className={styles.input} value={badExpiryMode} onChange={(e) => setBadExpiryMode(e.target.value as any)}>
                          <option value="date">Pick date</option>
                          <option value="permanent">Permanent</option>
                        </select>
                      </label>

                      {badExpiryMode === "date" ? (
                        <label className={styles.label}>
                          Expiry date
                          <input className={styles.input} type="date" value={badExpiryDate} onChange={(e) => setBadExpiryDate(e.target.value)} />
                        </label>
                      ) : (
                        <div className={styles.helperBox}>
                          <div className={styles.helperTitle}>Permanent</div>
                          <div className={styles.helperText}>No expiry date. You’re tracking it long-term.</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === "addictions" && (
                  <div className={styles.form}>
                    <label className={styles.label}>
                      Addiction
                      <input className={styles.input} value={addictionTitle} onChange={(e) => setAddictionTitle(e.target.value)} autoFocus />
                    </label>

                    <div className={styles.helperBox}>
                      <div className={styles.helperTitle}>No expiry</div>
                      <div className={styles.helperText}>Tracked continuously. “Hold” = clean day. “Sold” = relapse.</div>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.ghostBtn} onClick={closeModal} type="button">
                  Cancel
                </button>
                <button className={styles.primaryBtn} onClick={submit} disabled={!canSubmit()} type="button">
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- CHART ---------------- */

function CandleChart({ data }: { data: Candle[] }) {
  const [hover, setHover] = useState<Candle | null>(null);

  const padding = { top: 12, right: 14, bottom: 24, left: 44 };
  const w = 1000;
  const h = 320;

  const { min, max } = useMemo(() => {
    if (!data.length) return { min: 0.9, max: 1.1 };
    let mn = Infinity;
    let mx = -Infinity;
    for (const d of data) {
      mn = Math.min(mn, d.l);
      mx = Math.max(mx, d.h);
    }
    if (mn === mx) {
      const bump = mn * 0.02 + 0.01;
      return { min: mn - bump, max: mx + bump };
    }
    const pad = (mx - mn) * 0.08;
    return { min: mn - pad, max: mx + pad };
  }, [data]);

  const yToPx = (v: number) => {
    const usable = h - padding.top - padding.bottom;
    const t = (v - min) / (max - min || 1);
    return h - padding.bottom - t * usable;
  };

  const usableW = w - padding.left - padding.right;
  const n = data.length;
  const step = usableW / Math.max(1, n);
  const bodyW = Math.max(3, Math.min(12, step * 0.55));
  const pxX = (i: number) => padding.left + i * step + step / 2;

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => min + ((max - min) * i) / yTicks);

  return (
    <div className={styles.chartWrap}>
      {!data.length ? (
        <div style={{ padding: 12, opacity: 0.7, fontSize: 13 }}>
          No activity yet — hit Complete / Hold buttons to print candles.
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: 280, display: "block" }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const t = (x / rect.width) * w;
            const i = Math.max(0, Math.min(n - 1, Math.floor((t - padding.left) / step)));
            setHover(data[i] ?? null);
          }}
        >
          <rect x="0" y="0" width={w} height={h} rx="24" fill="rgba(0,0,0,0.10)" />

          {/* grid + y labels */}
          {tickVals.map((v, i) => {
            const yy = yToPx(v);
            return (
              <g key={i}>
                <line x1={padding.left} x2={w - padding.right} y1={yy} y2={yy} stroke="rgba(255,255,255,0.06)" />
                <text x={padding.left - 10} y={yy + 4} textAnchor="end" fontSize="12" fill="rgba(255,255,255,0.45)">
                  {v.toFixed(3)}
                </text>
              </g>
            );
          })}

          {/* candles */}
          {data.map((d, i) => {
            const x = pxX(i);
            const yO = yToPx(d.o);
            const yC = yToPx(d.c);
            const yH = yToPx(d.h);
            const yL = yToPx(d.l);

            const up = d.c >= d.o;
            const stroke = up ? "rgba(52,211,153,0.95)" : "rgba(251,113,133,0.95)";
            const fill = up ? "rgba(52,211,153,0.55)" : "rgba(251,113,133,0.55)";

            const top = Math.min(yO, yC);
            const bot = Math.max(yO, yC);
            const bodyH = Math.max(2, bot - top);

            return (
              <g key={d.t}>
                <line x1={x} x2={x} y1={yH} y2={yL} stroke={stroke} strokeWidth={2} opacity={0.85} />
                <rect x={x - bodyW / 2} y={top} width={bodyW} height={bodyH} rx={3} fill={fill} stroke={stroke} strokeWidth={1} />
              </g>
            );
          })}

          {/* sparse bottom labels */}
          {data.map((d, i) => {
            const every = Math.max(1, Math.floor(n / 6));
            if (i % every !== 0 && i !== n - 1) return null;
            const x = pxX(i);
            const dd = new Date(d.t);
            const label = `${dd.getMonth() + 1}/${dd.getDate()}`;
            return (
              <text key={`lbl-${d.t}`} x={x} y={h - 6} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.35)">
                {label}
              </text>
            );
          })}
        </svg>
      )}

      {hover ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          O {hover.o.toFixed(3)} · H {hover.h.toFixed(3)} · L {hover.l.toFixed(3)} · C {hover.c.toFixed(3)}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>◎</div>
      <div className={styles.emptyText}>{text}</div>
    </div>
  );
}