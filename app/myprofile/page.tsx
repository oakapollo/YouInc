"use client";

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import React, { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../providers";
import { db } from "../../lib/firebase";
import { logout } from "../../lib/auth";
import styles from "./profile.module.css";

const EMPTY_STORE = {
  marketCapUC: 10000,
  tx: [],
  goals: [],
  goodHabits: [],
  badHabits: [],
  addictions: [],
};

export default function MyProfilePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (user) setUsername(user.displayName ?? "");
  }, [user]);

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const nextUsername = username.trim();
    if (!nextUsername) {
      setError("Enter a username before saving.");
      return;
    }

    setSavingUsername(true);
    setError(null);
    setNotice(null);

    try {
      await updateProfile(user, { displayName: nextUsername });
      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: nextUsername,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setUsername(nextUsername);
      setNotice("Username updated.");
    } catch (saveError) {
      console.error("Username update failed:", saveError);
      setError("We couldn't update your username. Check your connection and try again.");
    } finally {
      setSavingUsername(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError(null);

    try {
      await logout();
      router.replace("/login");
    } catch (logoutError) {
      console.error("Logout failed:", logoutError);
      setError("We couldn't log you out. Check your connection and try again.");
      setLoggingOut(false);
    }
  }

  async function hardReset() {
    if (!user) return;

    setResetting(true);
    setError(null);
    setNotice(null);

    try {
      await setDoc(doc(db, "users", user.uid, "store", "main"), EMPTY_STORE);
      localStorage.removeItem("youinc_v1_store");
      setShowResetConfirm(false);
      setNotice("Your behaviour data has been reset. You are starting fresh.");
    } catch (resetError) {
      console.error("Hard reset failed:", resetError);
      setError("We couldn't reset your data. Nothing has been changed. Check your connection and try again.");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingCard}>Loading your profile...</div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className={styles.page}>
      {showResetConfirm ? (
        <div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className={styles.confirmBox}>
            <div className={styles.kicker}>Confirm hard reset</div>
            <h2 id="reset-title">Start over from zero?</h2>
            <p>
              This permanently removes your logs, goals, habits, addictions, and progress history. Your account and
              username will stay active.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.secondaryButton} disabled={resetting} onClick={() => setShowResetConfirm(false)} type="button">
                Cancel
              </button>
              <button className={styles.dangerButton} disabled={resetting} onClick={hardReset} type="button">
                {resetting ? "Resetting..." : "Yes, hard reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>YouInc account</div>
            <h1>My Profile</h1>
            <p>Manage your account identity and choose when to start fresh.</p>
          </div>
          <a className={styles.backLink} href="/YouInc">
            Back to dashboard
          </a>
        </header>

        {notice ? <div className={styles.notice}>{notice}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <h2>Profile</h2>
              <p>Your username is shown at the top of your dashboard.</p>
            </div>
            <span>{user.email}</span>
          </div>

          <form className={styles.form} onSubmit={saveUsername}>
            <label>
              Username
              <input
                autoComplete="nickname"
                maxLength={48}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Your username"
                value={username}
              />
            </label>
            <button className={styles.primaryButton} disabled={savingUsername || !username.trim()} type="submit">
              {savingUsername ? "Saving..." : "Save username"}
            </button>
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.actionRow}>
            <div>
              <h2>Log out</h2>
              <p>Leave this account and return to the login screen.</p>
            </div>
            <button className={styles.secondaryButton} disabled={loggingOut} onClick={handleLogout} type="button">
              {loggingOut ? "Logging out..." : "Log Out"}
            </button>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.dangerPanel}`}>
          <div className={styles.actionRow}>
            <div>
              <div className={styles.dangerKicker}>Danger zone</div>
              <h2>Hard reset</h2>
              <p>Wipe your behaviour data and return your account to its starting point.</p>
            </div>
            <button className={styles.dangerButton} onClick={() => setShowResetConfirm(true)} type="button">
              Hard Reset
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
