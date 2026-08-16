"use client";

import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers";
import { db } from "../../lib/firebase";
import styles from "./savings.module.css";

type Expense = {
  id: string;
  name: string;
  budget: number;
  spent: number;
  paid: boolean;
};

type MonthData = {
  income: number;
  expenses: Expense[];
};

type SavingsStore = {
  months: Record<string, MonthData>;
};

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getCurrentMonthKey() {
  const now = new Date();
  return String(now.getFullYear()) + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return String(date.getFullYear()) + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function asAmount(value: string) {
  const next = Number(value);
  if (!Number.isFinite(next) || next < 0) return 0;
  return Math.round(next);
}

function emptyMonth(): MonthData {
  return { income: 0, expenses: [] };
}

function normalizeMonth(value: unknown): MonthData {
  if (!value || typeof value !== "object") return emptyMonth();
  const data = value as Partial<MonthData>;
  return {
    income: typeof data.income === "number" ? data.income : 0,
    expenses: Array.isArray(data.expenses)
      ? data.expenses.map((expense) => ({
          id: typeof expense.id === "string" ? expense.id : uid(),
          name: typeof expense.name === "string" ? expense.name : "",
          budget: typeof expense.budget === "number" ? expense.budget : 0,
          spent: typeof expense.spent === "number" ? expense.spent : 0,
          paid: Boolean(expense.paid),
        }))
      : [],
  };
}

export default function SavingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey);
  const [store, setStore] = useState<SavingsStore>({ months: {} });
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uidSafe = user?.uid ?? "";
  const savingsDocRef = useMemo(() => {
    if (!uidSafe) return null;
    return doc(db, "users", uidSafe, "savings", "main");
  }, [uidSafe]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!savingsDocRef) return;

    setHydrated(false);
    setError(null);

    const unsubscribe = onSnapshot(
      savingsDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          const firstMonth = emptyMonth();
          setStore({ months: { [selectedMonth]: firstMonth } });
          setDoc(
            savingsDocRef,
            {
              months: { [selectedMonth]: firstMonth },
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ).catch((saveError) => {
            console.error("Failed to create savings document:", saveError);
            setError("Savings could not be created yet. Check your connection and try again.");
          });
        } else {
          const data = snapshot.data() as Partial<SavingsStore>;
          const months = Object.entries(data.months ?? {}).reduce<Record<string, MonthData>>((acc, [key, value]) => {
            acc[key] = normalizeMonth(value);
            return acc;
          }, {});
          setStore({ months });
        }

        setHydrated(true);
      },
      (snapshotError) => {
        console.error("Savings snapshot failed:", snapshotError);
        setHydrated(true);
        setError("Savings could not load. Check your connection and try again.");
      }
    );

    return () => unsubscribe();
  }, [savingsDocRef, selectedMonth]);

  const monthData = useMemo(() => {
    return normalizeMonth(store.months[selectedMonth]);
  }, [selectedMonth, store.months]);

  const previousMonthKey = shiftMonth(selectedMonth, -1);
  const previousMonth = store.months[previousMonthKey];

  const summary = useMemo(() => {
    const totalBudget = monthData.expenses.reduce((sum, expense) => sum + expense.budget, 0);
    const totalSpent = monthData.expenses.reduce((sum, expense) => sum + expense.spent, 0);
    return {
      totalBudget,
      totalSpent,
      remainingBudget: totalBudget - totalSpent,
      saved: monthData.income - totalSpent,
    };
  }, [monthData]);

  function persistMonth(monthKey: string, nextMonth: MonthData) {
    setStore((current) => ({
      months: {
        ...current.months,
        [monthKey]: nextMonth,
      },
    }));

    if (!savingsDocRef) return;

    setSaving(true);
    setError(null);
    setDoc(
      savingsDocRef,
      {
        months: { [monthKey]: nextMonth },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
      .catch((saveError) => {
        console.error("Failed to save savings:", saveError);
        setError("That change is on screen, but it did not save. Try again in a moment.");
      })
      .finally(() => setSaving(false));
  }

  function updateSelectedMonth(mutator: (current: MonthData) => MonthData) {
    persistMonth(selectedMonth, mutator(monthData));
  }

  function addExpense() {
    updateSelectedMonth((current) => ({
      ...current,
      expenses: [
        ...current.expenses,
        {
          id: uid(),
          name: "",
          budget: 0,
          spent: 0,
          paid: false,
        },
      ],
    }));
  }

  function updateExpense(id: string, patch: Partial<Expense>) {
    updateSelectedMonth((current) => ({
      ...current,
      expenses: current.expenses.map((expense) => {
        if (expense.id !== id) return expense;
        const next = { ...expense, ...patch };
        if (patch.paid === true) next.spent = next.budget;
        if (patch.budget !== undefined && next.paid) next.spent = next.budget;
        return next;
      }),
    }));
  }

  function deleteExpense(id: string) {
    updateSelectedMonth((current) => ({
      ...current,
      expenses: current.expenses.filter((expense) => expense.id !== id),
    }));
  }

  function copyPreviousMonth() {
    if (!previousMonth?.expenses?.length) return;
    persistMonth(selectedMonth, {
      ...monthData,
      expenses: previousMonth.expenses.map((expense) => ({
        id: uid(),
        name: expense.name,
        budget: expense.budget,
        spent: 0,
        paid: false,
      })),
    });
  }

  if (loading || !user || !hydrated) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingPanel}>
          <span className={styles.spinner} />
          <p>Loading savings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <a className={styles.backLink} href="/YouInc">
            Back to dashboard
          </a>
          <h1>Savings</h1>
          <p>Plan each month, tick off paid expenses, and see what is actually saved.</p>
        </div>
        <div className={styles.status}>{saving ? "Saving..." : "Saved"}</div>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.toolbar}>
        <button type="button" className={styles.navButton} onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}>
          Prev
        </button>
        <label className={styles.monthPicker}>
          <span>Month</span>
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value || getCurrentMonthKey())} />
        </label>
        <button type="button" className={styles.navButton} onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}>
          Next
        </button>
        <button type="button" className={styles.copyButton} onClick={copyPreviousMonth} disabled={!previousMonth?.expenses?.length}>
          Copy previous month
        </button>
      </section>

      <section className={styles.summaryGrid} aria-label="Monthly summary">
        <div className={styles.summaryTile}>
          <span>Income</span>
          <strong>{money.format(monthData.income)}</strong>
        </div>
        <div className={styles.summaryTile}>
          <span>Budgeted</span>
          <strong>{money.format(summary.totalBudget)}</strong>
        </div>
        <div className={styles.summaryTile}>
          <span>Spent</span>
          <strong>{money.format(summary.totalSpent)}</strong>
        </div>
        <div className={styles.summaryTile}>
          <span>Saved</span>
          <strong className={summary.saved >= 0 ? styles.positive : styles.negative}>{money.format(summary.saved)}</strong>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{monthLabel(selectedMonth)}</h2>
            <p>Remaining budget: {money.format(summary.remainingBudget)}</p>
          </div>
          <button type="button" className={styles.primaryButton} onClick={addExpense}>
            Add expense
          </button>
        </div>

        <label className={styles.incomeRow}>
          <span>Monthly income</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={monthData.income || ""}
            onChange={(event) =>
              updateSelectedMonth((current) => ({
                ...current,
                income: asAmount(event.target.value),
              }))
            }
            placeholder="0"
          />
        </label>

        <div className={styles.tableWrap}>
          <table className={styles.expenseTable}>
            <thead>
              <tr>
                <th>Expense</th>
                <th>Budget</th>
                <th>Spent</th>
                <th>Done</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {monthData.expenses.length ? (
                monthData.expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td data-label="Expense">
                      <input
                        className={styles.nameInput}
                        value={expense.name}
                        onChange={(event) => updateExpense(expense.id, { name: event.target.value })}
                        placeholder="Rent, groceries, phone..."
                      />
                    </td>
                    <td data-label="Budget">
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={expense.budget || ""}
                        onChange={(event) => updateExpense(expense.id, { budget: asAmount(event.target.value) })}
                        placeholder="0"
                      />
                    </td>
                    <td data-label="Spent">
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={expense.spent || ""}
                        onChange={(event) => updateExpense(expense.id, { spent: asAmount(event.target.value), paid: false })}
                        placeholder="0"
                      />
                    </td>
                    <td data-label="Done">
                      <label className={styles.checkboxCell}>
                        <input
                          type="checkbox"
                          checked={expense.paid}
                          onChange={(event) => updateExpense(expense.id, { paid: event.target.checked })}
                        />
                      </label>
                    </td>
                    <td>
                      <button type="button" className={styles.deleteButton} onClick={() => deleteExpense(expense.id)} aria-label="Delete expense">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className={styles.emptyState}>No expenses yet. Add one or copy the previous month.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
