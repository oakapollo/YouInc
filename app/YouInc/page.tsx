"use client";

import { applyTaxes, getUkOffsetMinutes, isMarketOpen, type DeltaKind } from "./rules";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./youinc.module.css";
import { useAuth } from "../providers";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, runTransaction, setDoc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";






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
  marketCapUC: number;
  tx: Tx[];
  goals: Goal[];
  goodHabits: GoodHabit[];
  badHabits: BadHabit[];
  addictions: Addiction[];


  // NEW: tracks the last hour-bucket we processed decay for (ms since epoch, floored to hour)
  lastDecayHourTs?: number;
};

type Candle = { t: number; o: number; h: number; l: number; c: number };

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    const next = entries.reduce<Record<string, unknown>>((acc, [k, v]) => {
      acc[k] = stripUndefined(v);
      return acc;
    }, {});
    return next as T;
  }
  return value;
}


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
// Expand lookback to cover historical tx so older candles are rendered from stored data.
const earliestTx = txAsc[0]?.ts ?? endBucket;
const earliestBucket = floorToBucket(earliestTx, bucketMs);
const computedBuckets = Math.max(1, Math.floor((endBucket - earliestBucket) / bucketMs) + 1);
const effectiveBuckets = Math.max(lookbackBuckets, computedBuckets);
const startBucket = endBucket - bucketMs * (effectiveBuckets - 1);

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

// --- UK hour-bucket helpers for decay (DST-safe via Europe/London offset) ---
const HOUR_MS = 60 * 60 * 1000;

function getUkWallMs(now: Date) {
  return now.getTime() + getUkOffsetMinutes(now) * 60 * 1000;
}

function ukWallMsToUtcMs(ukWallMs: number) {
  let guess = ukWallMs - getUkOffsetMinutes(new Date()) * 60 * 1000;
  for (let i = 0; i < 2; i += 1) {
    const offsetMinutes = getUkOffsetMinutes(new Date(guess));
    const nextGuess = ukWallMs - offsetMinutes * 60 * 1000;
    if (nextGuess === guess) break;
    guess = nextGuess;
  }
  return guess;
}

function getUkHourBucketStartMs(now = new Date()) {
  const ukNowMs = getUkWallMs(now);
  const bucketUkMs = Math.floor(ukNowMs / HOUR_MS) * HOUR_MS;
  return ukWallMsToUtcMs(bucketUkMs);
}

function getNextUkHourBucketStartMs(now = new Date()) {
  const ukNowMs = getUkWallMs(now);
  const bucketUkMs = Math.floor(ukNowMs / HOUR_MS) * HOUR_MS + HOUR_MS;
  return ukWallMsToUtcMs(bucketUkMs);
}

function countOpenBucketsBetween(lastBucketUtcMs: number, currentBucketUtcMs: number) {
  if (currentBucketUtcMs <= lastBucketUtcMs) return 0;

  const lastBucketUkMs = getUkWallMs(new Date(lastBucketUtcMs));
  const currentBucketUkMs = getUkWallMs(new Date(currentBucketUtcMs));
  let openBuckets = 0;

  for (let ukMs = lastBucketUkMs + HOUR_MS; ukMs <= currentBucketUkMs; ukMs += HOUR_MS) {
    const bucketUtcMs = ukWallMsToUtcMs(ukMs);
    if (isMarketOpen(new Date(bucketUtcMs))) {
      openBuckets += 1;
    }
  }

  return openBuckets;
}

export default function YouIncPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ✅ ALL HOOKS MUST RUN EVERY RENDER — so all useState go BEFORE any early return

  const [tab, setTab] = useState<TabKey>("goals");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tf, setTf] = useState<"4h" | "8h" | "1d" | "1w">("1d");
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

  const [storeError, setStoreError] = useState<string | null>(null);
  const [hydrateAttempt, setHydrateAttempt] = useState(0);
  const uidSafe = user?.uid ?? "";

  const storeDocRef = useMemo(() => {
    if (!uidSafe) return null;
    return doc(db, "users", uidSafe, "store", "main");
  }, [uidSafe]);

  const hydratedRef = useRef(false); // got at least one snapshot
  const suppressWriteRef = useRef(true); // block writes until hydrated
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decayInitRef = useRef(false);
  const decayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const interval = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);


  // ✅ redirect effect is fine (it runs after hooks are declared)
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // ✅ reset refs when uid changes (login/logout)
  useEffect(() => {
    hydratedRef.current = false;
    suppressWriteRef.current = true;
    decayInitRef.current = false;

    if (writeTimerRef.current) {
      clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
  }, [uidSafe]);

  // ✅ Firestore: hydrate + live subscribe
  useEffect(() => {
    if (!storeDocRef) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    setStoreError(null);

    (async () => {
      try {
        // If doc doesn't exist yet, optionally migrate localStorage once
        const snap = await getDoc(storeDocRef);
        if (!snap.exists()) {
          try {
            const raw = localStorage.getItem("youinc_v1_store");
            if (raw) {
              const parsed = JSON.parse(raw);
              await setDoc(storeDocRef, parsed, { merge: true });
              localStorage.removeItem("youinc_v1_store");
            } else {
              // create base doc so it's visible immediately
              await setDoc(
                storeDocRef,
                {
                  marketCapUC: 10000,
                  tx: [],
                  goals: [],
                  goodHabits: [],
                  badHabits: [],
                  addictions: [],
                } satisfies Store,
                { merge: true }
              );
            }
          } catch {}
        }

        if (cancelled) return;

        unsub = onSnapshot(
          storeDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as Partial<Store>;

              setStore((prev) => ({
                marketCapUC: typeof data.marketCapUC === "number" ? data.marketCapUC : prev.marketCapUC,
                tx: Array.isArray(data.tx) ? (data.tx as Tx[]) : prev.tx,
                goals: Array.isArray(data.goals) ? (data.goals as Goal[]) : prev.goals,
                goodHabits: Array.isArray(data.goodHabits) ? (data.goodHabits as GoodHabit[]) : prev.goodHabits,
                badHabits: Array.isArray(data.badHabits) ? (data.badHabits as BadHabit[]) : prev.badHabits,
                addictions: Array.isArray(data.addictions) ? (data.addictions as Addiction[]) : prev.addictions,
                lastDecayHourTs: typeof data.lastDecayHourTs === "number" ? data.lastDecayHourTs : prev.lastDecayHourTs,
              }));
            }

            hydratedRef.current = true;
            suppressWriteRef.current = false;
            setStoreError(null);
          },
          (err) => {
            console.error("onSnapshot error:", err);
            hydratedRef.current = false;
            suppressWriteRef.current = true;
            setStoreError("We couldn't load your data. We'll keep retrying.");
            if (!cancelled) {
              retryTimer = setTimeout(() => setHydrateAttempt((v) => v + 1), 3000);
            }
          }
        );
      } catch (e) {
        console.error("Firestore hydrate failed:", e);
        hydratedRef.current = true;
        suppressWriteRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [storeDocRef, hydrateAttempt]);


  // (rest of your component continues here...)


  // ------- persistence -------



  // ------- taxed market cap updates + transactions -------
function applyDelta(kind: DeltaKind, label: string, deltaUC: number) {
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
}


  const runDecayCatchUp = useCallback(async () => {
    const now = new Date();
    const currentBucketMs = getUkHourBucketStartMs(now);

    if (storeDocRef) {
      try {
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(storeDocRef);
          const data = (snap.exists() ? snap.data() : {}) as Partial<Store>;

          const lastBucketMs = typeof data.lastDecayHourTs === "number" ? data.lastDecayHourTs : undefined;
          const marketCapUC = typeof data.marketCapUC === "number" ? data.marketCapUC : 10000;
          const tx = Array.isArray(data.tx) ? (data.tx as Tx[]) : [];

          if (lastBucketMs === undefined) {
            transaction.set(storeDocRef, { lastDecayHourTs: currentBucketMs }, { merge: true });
            return;
          }

          const openBuckets = countOpenBucketsBetween(lastBucketMs, currentBucketMs);
          const update: Partial<Store> = { lastDecayHourTs: currentBucketMs };

          if (openBuckets > 0) {
            const deltaUC = -5 * openBuckets;
            const { effectiveDeltaUC } = applyTaxes("decay", deltaUC, marketCapUC);
            const nextCap = Math.max(0, marketCapUC + effectiveDeltaUC);
            const decayTx: Tx = {
              id: uid(),
              ts: Date.now(),
              deltaUC: effectiveDeltaUC,
              label: `Decay x${openBuckets}`,
            };

            update.marketCapUC = nextCap;
            update.tx = [decayTx, ...tx].slice(0, 2000);
          }

          transaction.set(storeDocRef, stripUndefined(update), { merge: true });
        });
        return;
      } catch (error) {
        console.error("Decay transaction failed:", error);
      }
    }

    setStore((prev) => {
      const lastBucketMs = prev.lastDecayHourTs;
      if (lastBucketMs === undefined) {
        return { ...prev, lastDecayHourTs: currentBucketMs };
      }

      const openBuckets = countOpenBucketsBetween(lastBucketMs, currentBucketMs);
      const nextState: Store = { ...prev, lastDecayHourTs: currentBucketMs };

      if (openBuckets > 0) {
        const deltaUC = -5 * openBuckets;
        const { effectiveDeltaUC } = applyTaxes("decay", deltaUC, prev.marketCapUC);
        const decayTx: Tx = {
          id: uid(),
          ts: Date.now(),
          deltaUC: effectiveDeltaUC,
          label: `Decay x${openBuckets}`,
        };

        nextState.marketCapUC = Math.max(0, prev.marketCapUC + effectiveDeltaUC);
        nextState.tx = [decayTx, ...prev.tx].slice(0, 2000);
      }

      return nextState;
    });
  }, [storeDocRef]);

  // 🧊 Decay scheduler: run once after hydration and after every UK-hour boundary
  useEffect(() => {
    if (loading || !user) return;

    let cancelled = false;

    const scheduleNextTick = () => {
      if (decayTimerRef.current) {
        clearTimeout(decayTimerRef.current);
      }
      const now = new Date();
      const nextBoundaryMs = getNextUkHourBucketStartMs(now);
      const delay = Math.max(0, nextBoundaryMs - now.getTime() + 2000);

      decayTimerRef.current = setTimeout(async () => {
        if (cancelled) return;
        await runDecayCatchUp();
        scheduleNextTick();
      }, delay);
    };

    if (!decayInitRef.current) {
      decayInitRef.current = true;
      void runDecayCatchUp();
    }

    scheduleNextTick();

    return () => {
      cancelled = true;
      if (decayTimerRef.current) {
        clearTimeout(decayTimerRef.current);
        decayTimerRef.current = null;
      }
    };
  }, [loading, runDecayCatchUp, user]);

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
    if (tf === "4h") return buildCandles(store.marketCapUC, txAsc, 4 * 60 * 60 * 1000, 90);
    if (tf === "8h") return buildCandles(store.marketCapUC, txAsc, 8 * 60 * 60 * 1000, 90);
    if (tf === "1w") return buildCandles(store.marketCapUC, txAsc, 7 * 24 * 60 * 60 * 1000, 26);
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

  // ✅ Firestore: debounced write
  useEffect(() => {
    if (!storeDocRef) return;
    if (!hydratedRef.current) return;
    if (suppressWriteRef.current) return;

    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);

    writeTimerRef.current = setTimeout(async () => {
      try {
        const cleanStore = stripUndefined(store);
        await setDoc(storeDocRef, cleanStore, { merge: true });
      } catch (e) {
        console.error("Failed to write store:", e);
      }
    }, 600);

    return () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    };
  }, [store, storeDocRef]);

  // ✅ NOW early returns are safe (ALL hooks above always ran)
  if (loading) {
    return <div className={styles.page}>Loading…</div>;
  }
  if (!user) {
    return null;
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
        expiryDate: badExpiryMode === "date" ? badExpiryDate : null,
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
            <div className={styles.title}>{user?.displayName ?? user?.email?.split("@")[0] ?? "You"}</div>
              <div className={styles.subTitle}>{user?.displayName ?? user?.email?.split("@")[0] ?? "You"}</div>    
                      </div>
          </div>

          <div className={styles.headerActions}>
            <a className={styles.secondaryBtn} href="/logout">
              Switch account
            </a>
            <button className={styles.addBtn} onClick={openModal} type="button">
              <span className={styles.addPlus}>＋</span>
              Add
            </button>
          </div>
        </header>

        {storeError ? <div className={styles.syncWarning}>{storeError}</div> : null}
        
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
            <button className={`${styles.tfBtn} ${tf === "4h" ? styles.tfBtnOn : ""}`} onClick={() => setTf("4h")} type="button">
              4H
            </button>
            <button className={`${styles.tfBtn} ${tf === "8h" ? styles.tfBtnOn : ""}`} onClick={() => setTf("8h")} type="button">
              8H
            </button>
            <button className={`${styles.tfBtn} ${tf === "1d" ? styles.tfBtnOn : ""}`} onClick={() => setTf("1d")} type="button">
              1D
            </button>
            <button className={`${styles.tfBtn} ${tf === "1w" ? styles.tfBtnOn : ""}`} onClick={() => setTf("1w")} type="button">
              1W
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

<CandleChart data={candles} tx={store.tx} timeframe={tf} />


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
function CandleChart({ data, tx, timeframe }: { data: Candle[]; tx: Tx[]; timeframe: "4h" | "8h" | "1d" | "1w" }) {


  const [hover, setHover] = useState<Candle | null>(null);

  const [tooltip, setTooltip] = useState<{ candle: Candle; x: number; y: number } | null>(null);
  const [selectedCandleKey, setSelectedCandleKey] = useState<number | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  // Viewport state: how many candles are visible + how far we are panned from the latest candle.
  const [viewport, setViewport] = useState({ visibleCount: 90, offsetFromRight: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointerStateRef = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    isPanning: false,
    panPointerId: null as number | null,
    startX: 0,
    startY: 0,
    startOffset: 0,
    longPressTimer: null as ReturnType<typeof setTimeout> | null,
    pinchStartDistance: 0,
    pinchStartVisible: 0,
  });
  const [chartWidth, setChartWidth] = useState(1000);

  const padding = { top: 12, right: 14, bottom: 24, left: 44 };
  const w = 1000;
  const h = 320;
  const candleWidthRatio = 0.7;
  const minCandleWidth = 3;
  const maxCandleWidth = 18;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const bucketMs = useMemo(() => {
    if (timeframe === "4h") return 4 * 60 * 60 * 1000;
    if (timeframe === "8h") return 8 * 60 * 60 * 1000;
    if (timeframe === "1w") return 7 * 24 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
  }, [timeframe]);

  const txByBucket = useMemo(() => {
    const map = new Map<number, Tx[]>();
    for (const entry of tx) {
      const bucket = floorToBucket(entry.ts, bucketMs);
      const list = map.get(bucket) ?? [];
      list.push(entry);
      map.set(bucket, list);
    }
    return map;
  }, [bucketMs, tx]);

  const usablePx = Math.max(1, chartWidth - padding.left - padding.right);
  const minVisible = Math.max(20, Math.ceil(usablePx / (maxCandleWidth / candleWidthRatio)));
  const maxVisible = Math.max(minVisible, Math.min(250, Math.floor(usablePx / (minCandleWidth / candleWidthRatio))));

  const clampVisibleCount = useCallback(
    (count: number) => {
      if (!data.length) return 0;
      const clamped = Math.max(minVisible, Math.min(maxVisible, Math.round(count)));
      return Math.min(data.length, clamped);
    },
    [data.length, maxVisible, minVisible]
  );

  const visibleState = useMemo(() => {
    if (!data.length) {
      return { visibleData: [], startIndex: 0, visibleCount: 0, offsetFromRight: 0 };
    }
    const nextCount = clampVisibleCount(viewport.visibleCount);
    const maxOffset = Math.max(0, data.length - nextCount);
    const nextOffset = autoFollow ? 0 : Math.max(0, Math.min(maxOffset, viewport.offsetFromRight));
    const startIndex = Math.max(0, data.length - nextCount - nextOffset);
    return {
      visibleData: data.slice(startIndex, startIndex + nextCount),
      startIndex,
      visibleCount: nextCount,
      offsetFromRight: nextOffset,
    };
  }, [autoFollow, clampVisibleCount, data, viewport.offsetFromRight, viewport.visibleCount]);

  useEffect(() => {
    setViewport((prev) => {
      const nextCount = clampVisibleCount(prev.visibleCount);
      const maxOffset = Math.max(0, data.length - nextCount);
      const nextOffset = autoFollow ? 0 : Math.max(0, Math.min(maxOffset, prev.offsetFromRight));
      if (prev.visibleCount === nextCount && prev.offsetFromRight === nextOffset) return prev;
      return { visibleCount: nextCount, offsetFromRight: nextOffset };
    });
  }, [autoFollow, clampVisibleCount, data.length]);

  const { visibleData, startIndex, visibleCount } = visibleState;

  const { min, max } = useMemo(() => {
    if (!visibleData.length) return { min: 0.9, max: 1.1 };
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
  }, [visibleData]);

  const yToPx = (v: number) => {
    const usable = h - padding.top - padding.bottom;
    const t = (v - min) / (max - min || 1);
    return h - padding.bottom - t * usable;
  };

  const usableW = w - padding.left - padding.right;
  const step = usableW / Math.max(1, visibleCount || 1);
  const bodyW = Math.max(minCandleWidth, Math.min(maxCandleWidth, step * candleWidthRatio));
  const pxX = (i: number) => padding.left + i * step + step / 2;

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => min + ((max - min) * i) / yTicks);

  const londonDateTime = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  const londonTime = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  const selectedCandle = useMemo(
    () => (selectedCandleKey ? data.find((c) => c.t === selectedCandleKey) ?? null : null),
    [data, selectedCandleKey]
  );

  // Candle selection filtering: use the timeframe bucket to collect tx for the selected candle.
  const selectedTx = useMemo(() => {
    if (!selectedCandleKey) return [];
    const list = txByBucket.get(selectedCandleKey) ?? [];
    return [...list].sort((a, b) => b.ts - a.ts);
  }, [selectedCandleKey, txByBucket]);

  const setTooltipForEvent = useCallback(
    (candle: Candle, clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setTooltip({
        candle,
        x: Math.min(rect.width - 8, Math.max(8, clientX - rect.left)),
        y: Math.min(rect.height - 8, Math.max(8, clientY - rect.top)),
      });
    },
    []
  );

  const getIndexFromClientX = useCallback(
    (clientX: number) => {
      if (!svgRef.current || !visibleData.length) return 0;
      const rect = svgRef.current.getBoundingClientRect();
      const localX = clientX - rect.left;
      const t = (localX / rect.width) * w;
      const localIndex = Math.max(0, Math.min(visibleData.length - 1, Math.floor((t - padding.left) / step)));
      return startIndex + localIndex;
    },
    [startIndex, step, visibleData.length]
  );

  const zoomTo = useCallback(
    (nextVisibleCount: number, pivotIndex: number) => {
      setViewport((prev) => {
        if (!data.length) return prev;
        const clampedNext = clampVisibleCount(nextVisibleCount);
        if (!clampedNext) return prev;

        const currentCount = clampVisibleCount(prev.visibleCount);
        const currentMaxOffset = Math.max(0, data.length - currentCount);
        const currentOffset = autoFollow ? 0 : Math.max(0, Math.min(currentMaxOffset, prev.offsetFromRight));
        const currentStart = Math.max(0, data.length - currentCount - currentOffset);
        const safePivot = Math.max(0, Math.min(data.length - 1, pivotIndex));
        const pivotRatio = currentCount ? (safePivot - currentStart) / currentCount : 0.5;
        const nextStart = Math.round(safePivot - pivotRatio * clampedNext);
        const nextMaxOffset = Math.max(0, data.length - clampedNext);
        const nextOffset = Math.max(0, Math.min(nextMaxOffset, data.length - clampedNext - nextStart));
        return { visibleCount: clampedNext, offsetFromRight: autoFollow ? 0 : nextOffset };
      });
    },
    [autoFollow, clampVisibleCount, data.length]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      if (!data.length) return;
      event.preventDefault();
      const pivot = getIndexFromClientX(event.clientX);
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const stepPx = rect.width / Math.max(1, visibleCount || 1);
        const deltaCandles = event.deltaX / stepPx;
        setAutoFollow(false);
        setViewport((prev) => ({ ...prev, offsetFromRight: prev.offsetFromRight + deltaCandles }));
        return;
      }

      const zoomFactor = Math.exp(event.deltaY * 0.002);
      zoomTo(Math.round(visibleCount * zoomFactor), pivot);
    },
    [data.length, getIndexFromClientX, visibleCount, zoomTo]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!data.length) return;
      const state = pointerStateRef.current;
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (state.pointers.size === 2) {
        const points = Array.from(state.pointers.values());
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        state.pinchStartDistance = Math.hypot(dx, dy);
        state.pinchStartVisible = visibleCount;
      }

      state.startX = event.clientX;
      state.startY = event.clientY;
      state.panPointerId = event.pointerId;
      state.isPanning = false;
      state.startOffset = viewport.offsetFromRight;

      if (event.pointerType !== "mouse") {
        if (state.longPressTimer) clearTimeout(state.longPressTimer);
        state.longPressTimer = setTimeout(() => {
          const index = getIndexFromClientX(event.clientX);
          const candle = data[index];
          if (candle) {
            setSelectedCandleKey(candle.t);
            setTooltipForEvent(candle, event.clientX, event.clientY);
          }
        }, 380);
      }
    },
    [data, getIndexFromClientX, setTooltipForEvent, viewport.offsetFromRight, visibleCount]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      // Pan/zoom logic: horizontal drag pans (offsetFromRight), two-finger pinch scales visibleCount.
      if (!data.length) return;
      const state = pointerStateRef.current;
      if (!state.pointers.has(event.pointerId)) return;
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (state.pointers.size === 2) {
        event.preventDefault();
        const [p1, p2] = Array.from(state.pointers.values());
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const scale = state.pinchStartDistance ? state.pinchStartDistance / dist : 1;
        const midpointX = (p1.x + p2.x) / 2;
        const pivotIndex = getIndexFromClientX(midpointX);
        zoomTo(Math.round(state.pinchStartVisible * scale), pivotIndex);
        return;
      }

      if (event.pointerType === "mouse") {
        const index = getIndexFromClientX(event.clientX);
        const candle = data[index];
        if (candle) {
          setHover(candle);
          setTooltipForEvent(candle, event.clientX, event.clientY);
        }
      } else if (!state.isPanning) {
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          state.isPanning = true;
          setAutoFollow(false);
          if (svgRef.current) {
            svgRef.current.setPointerCapture(event.pointerId);
          }
        } else if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          if (state.longPressTimer) clearTimeout(state.longPressTimer);
        }
      }

      if (state.isPanning && svgRef.current) {
        event.preventDefault();
        const rect = svgRef.current.getBoundingClientRect();
        const stepPx = rect.width / Math.max(1, visibleCount || 1);
        const dx = event.clientX - state.startX;
        const deltaCandles = dx / stepPx;
        setViewport((prev) => ({ ...prev, offsetFromRight: state.startOffset + deltaCandles }));
      }
    },
    [data, getIndexFromClientX, setTooltipForEvent, visibleCount, zoomTo]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const state = pointerStateRef.current;
      if (state.longPressTimer) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }

      const wasPanning = state.isPanning;
      state.pointers.delete(event.pointerId);
      if (state.panPointerId === event.pointerId) {
        state.isPanning = false;
        state.panPointerId = null;
      }
      if (svgRef.current) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }

      if (!wasPanning && event.pointerType !== "mouse") {
        const index = getIndexFromClientX(event.clientX);
        const candle = data[index];
        if (candle) {
          setSelectedCandleKey(candle.t);
          setTooltipForEvent(candle, event.clientX, event.clientY);
        }
      }
    },
    [data, getIndexFromClientX, setTooltipForEvent]
  );

  const handlePointerLeave = useCallback(() => {
    setHover(null);
    setTooltip(null);
  }, []);

  const handleZoomButton = useCallback(
    (direction: "in" | "out") => {
      if (!data.length) return;
      const pivot = startIndex + Math.floor(visibleData.length / 2);
      const factor = direction === "in" ? 0.8 : 1.2;
      zoomTo(Math.round(visibleCount * factor), pivot);
    },
    [data.length, startIndex, visibleCount, visibleData.length, zoomTo]
  );

  const resetView = useCallback(() => {
    setAutoFollow(true);
    setViewport({ visibleCount: 90, offsetFromRight: 0 });
  }, []);

  const renderTooltip = tooltip?.candle ?? hover;
  const tooltipEvents = renderTooltip ? txByBucket.get(renderTooltip.t)?.length ?? 0 : 0;

  const detailRange = useMemo(() => {
    if (!selectedCandle) return null;
    const start = selectedCandle.t;
    const end = start + bucketMs;
    return { start, end };
  }, [bucketMs, selectedCandle]);

  const formatTxLabel = (label: string, deltaUC: number) => {
    const match = label.match(/^(.*)\s\(([^)]+)\)$/);
    if (match) return { title: match[1], action: match[2] };
    if (deltaUC > 0) return { title: label, action: "Hold" };
    if (deltaUC < 0) return { title: label, action: "Sold" };
    return { title: label, action: "Flat" };
  };


  return (
    <div className={styles.chartSection}>
      <div className={styles.chartControls}>
        <div className={styles.chartBtnRow}>
          <button className={styles.chartBtn} type="button" onClick={() => handleZoomButton("out")} aria-label="Zoom out">
            −
          </button>
          <button className={styles.chartBtn} type="button" onClick={() => handleZoomButton("in")} aria-label="Zoom in">
            +
          </button>
          <button className={styles.chartBtn} type="button" onClick={resetView} aria-label="Reset view">
            Reset
          </button>
        </div>
        <label className={styles.autoFollow}>
          <input
            type="checkbox"
            checked={autoFollow}
            onChange={(event) => setAutoFollow(event.target.checked)}
          />
          Auto-follow latest
        </label>
      </div>

      <div className={styles.chartWrap} ref={containerRef}>
        {!data.length ? (
          <div style={{ padding: 12, opacity: 0.7, fontSize: 13 }}>
            No activity yet — hit Complete / Hold buttons to print candles.
          </div>
        ) : (
          <svg
            ref={svgRef}
            className={styles.chartSvg}
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: 280, display: "block" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onWheel={handleWheel}
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
            {visibleData.map((d, i) => {
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
                <g key={d.t} opacity={selectedCandleKey === d.t ? 1 : 0.92}>
                  <line x1={x} x2={x} y1={yH} y2={yL} stroke={stroke} strokeWidth={2} opacity={0.85} />
                  <rect x={x - bodyW / 2} y={top} width={bodyW} height={bodyH} rx={3} fill={fill} stroke={stroke} strokeWidth={1} />
                </g>
              );
            })}

            {/* sparse bottom labels */}
            {visibleData.map((d, i) => {
              const every = Math.max(1, Math.floor(visibleData.length / 6));
              if (i % every !== 0 && i !== visibleData.length - 1) return null;
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

    {renderTooltip ? (
      <div className={styles.chartTooltip} style={{ left: tooltip?.x ?? 24, top: tooltip?.y ?? 24 }}>
        <div className={styles.tooltipTitle}>O/H/L/C</div>
        <div className={styles.tooltipValue}>
          {renderTooltip.o.toFixed(3)} · {renderTooltip.h.toFixed(3)} · {renderTooltip.l.toFixed(3)} · {renderTooltip.c.toFixed(3)}
        </div>
        <div className={styles.tooltipMeta}>{tooltipEvents} events</div>
      </div>
    ) : null}
  </div>

  <div className={`${styles.detailsPanel} ${selectedCandle ? styles.detailsPanelOpen : ""}`}>
    <div className={styles.detailsHeader}>
      <div>
        <div className={styles.detailsTitle}>Candle Details</div>
        {selectedCandle && detailRange ? (
          <div className={styles.detailsRange}>
            {londonDateTime.format(new Date(detailRange.start))} – {londonDateTime.format(new Date(detailRange.end))}
          </div>
        ) : (
          <div className={styles.detailsRange}>Tap a candle to inspect what happened.</div>
        )}
      </div>
      {selectedCandle ? (
        <button className={styles.iconBtn} type="button" onClick={() => setSelectedCandleKey(null)}>
          ✕
        </button>
      ) : null}
        </div>
        {selectedCandle ? (
          <div className={styles.detailsBody}>
            <div className={styles.detailsStats}>
              <div>
                <span>Open</span>
                <strong>U${selectedCandle.o.toFixed(3)}</strong>
              </div>
              <div>
                <span>High</span>
                <strong>U${selectedCandle.h.toFixed(3)}</strong>
              </div>
              <div>
                <span>Low</span>
                <strong>U${selectedCandle.l.toFixed(3)}</strong>
              </div>
              <div>
                <span>Close</span>
                <strong>U${selectedCandle.c.toFixed(3)}</strong>
              </div>
              <div>
                <span>MarketCap</span>
                <strong>{Math.round(selectedCandle.c * 10000).toLocaleString()} UC</strong>
              </div>
            </div>

            <div className={styles.txList}>
              {selectedTx.length ? (
                selectedTx.map((entry) => {
                  const { title, action } = formatTxLabel(entry.label, entry.deltaUC);
                  const isUp = entry.deltaUC > 0;
                  const isDown = entry.deltaUC < 0;
                  const deltaLabel = `${entry.deltaUC >= 0 ? "+" : ""}${entry.deltaUC} UC`;
                  return (
                    <div key={entry.id} className={styles.txItem}>
                      <div>
                        <div className={styles.txTitle}>
                          {title} <span className={styles.txAction}>({action})</span>
                        </div>
                        <div className={styles.txTime}>{londonTime.format(new Date(entry.ts))}</div>
                      </div>
                      <div className={`${styles.txDelta} ${isUp ? styles.txPositive : isDown ? styles.txNegative : styles.txNeutral}`}>
                        {deltaLabel}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyTx}>No activity logged in this candle.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
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
