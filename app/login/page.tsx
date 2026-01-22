// app/login/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth.module.css";
import { loginWithEmail } from "/lib/auth";
import { useAuth } from "/app/providers";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/YouInc");
    }
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const em = email.trim().toLowerCase();
    if (!em) return setError("Enter your email.");
    if (!password) return setError("Enter your password.");

    try {
      setBusy(true);
      await loginWithEmail({ email: em, password });
      router.replace("/YouInc");
    } catch (err: any) {
      const code = err?.code || "";
      if (code.includes("auth/invalid-credential")) setError("Wrong email or password.");
      else if (code.includes("auth/user-not-found")) setError("Account not found.");
      else if (code.includes("auth/wrong-password")) setError("Wrong email or password.");
      else if (code.includes("auth/too-many-requests"))
        setError("Too many attempts. Try again later.");
      else setError(err?.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Log in</h1>
          <p className={styles.sub}>
            Use the same account on any device — your data will sync.
          </p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>

        <div className={styles.footer}>
          <span>Don’t have an account?</span>
          <a className={styles.link} href="/register">
            Register
          </a>
        </div>
      </div>
    </div>
  );
}
