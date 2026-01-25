// app/register/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth.module.css";
import { registerWithEmail } from "@/lib/auth";
import { useAuth } from "@/app/providers";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/YouInc");
    }
  }, [loading, user, router]);

  function validate() {
    const em = email.trim().toLowerCase();
    if (!em) return "Enter your email.";
    if (!password) return "Create a password.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== password2) return "Passwords do not match.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const em = email.trim().toLowerCase();
    const v = validate();
    if (v) return setError(v);

    try {
      setBusy(true);
      await registerWithEmail({ email: em, password, displayName: displayName.trim() });
      router.replace("/YouInc");
    } catch (err: any) {
      const code = err?.code || "";
      if (code.includes("auth/email-already-in-use")) setError("Email already in use.");
      else if (code.includes("auth/invalid-email")) setError("Invalid email address.");
      else if (code.includes("auth/weak-password")) setError("Password is too weak.");
      else setError(err?.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Create account</h1>
          <p className={styles.sub}>This will create your own private YouInc space.</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.label}>
            Name (optional)
            <input
              className={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., Rihards"
              autoComplete="nickname"
            />
          </label>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          <label className={styles.label}>
            Confirm password
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="Repeat password"
            />
          </label>

          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <div className={styles.footer}>
          <span>Already have an account?</span>
          <a className={styles.link} href="/login">
            Log in
          </a>
        </div>
      </div>
    </div>
  );
}
