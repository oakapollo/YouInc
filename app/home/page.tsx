"use client";

import Link from "next/link";
import React, { useEffect } from "react";
import styles from "./home.module.css";

const weekPattern = [
  { day: "Mon", value: 1.0, tone: "up", note: "Gym + meditation" },
  { day: "Tue", value: 1.4, tone: "up", note: "Run logged" },
  { day: "Wed", value: 1.9, tone: "up", note: "Strongest routine day" },
  { day: "Thu", value: 1.6, tone: "up", note: "Still clean" },
  { day: "Fri", value: -0.3, tone: "down", note: "Beer after work" },
  { day: "Sat", value: -1.1, tone: "down", note: "Night out" },
  { day: "Sun", value: -0.7, tone: "down", note: "Takeaway, low energy" },
];

const recoveryPattern = [
  { day: "Mon", value: 0.4, label: "Small reset" },
  { day: "Tue", value: 0.7, label: "Walk + cook" },
  { day: "Wed", value: 1.1, label: "Gym returns" },
  { day: "Thu", value: 1.2, label: "Better sleep" },
  { day: "Fri", value: 0.5, label: "One drink cap" },
  { day: "Sat", value: 0.2, label: "Planned meal" },
  { day: "Sun", value: 0.6, label: "Ready for Monday" },
];

const logs = [
  { time: "Mon 07:20", title: "Meditation", action: "Hold", delta: "+40 UC" },
  { time: "Wed 18:15", title: "Gym", action: "Hold", delta: "+100 UC" },
  { time: "Fri 22:40", title: "Beer", action: "Sold", delta: "-50 UC" },
  { time: "Sat 23:55", title: "Night out", action: "Sold", delta: "-80 UC" },
  { time: "Sun 14:10", title: "Take Away", action: "Sold", delta: "-40 UC" },
];

const insights = [
  "Your weekdays are not the problem. Your Friday trigger is.",
  "Saturday is not random. It is Friday's consequence.",
  "Sunday takeaway is not laziness. It is low energy plus no plan.",
];

export default function HomePage() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealed);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.orbOne} />
      <div className={styles.orbTwo} />

      <header className={styles.nav}>
        <Link className={styles.logo} href="/home">
          YouInc
        </Link>
        <div className={styles.navActions}>
          <Link href="/guest">Try Demo</Link>
          <Link className={styles.navPrimary} href="/register">
            Create account
          </Link>
        </div>
      </header>

      <section className={`${styles.hero} ${styles.reveal} ${styles.revealed}`} data-reveal>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>Habit tracker with a market brain</div>
          <h1>See the pattern behind your behaviour before it runs the week again.</h1>
          <p>
            YouInc turns your habits, slip-ups, goals, and addictions into a personal chart. Not to shame you. To show you the loop
            clearly enough that you can change it.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/guest">
              Try Demo
            </Link>
            <Link className={styles.secondaryCta} href="/register">
              Create an account
            </Link>
          </div>
        </div>

        <div className={styles.phoneMock} aria-label="YouInc demo dashboard">
          <div className={styles.mockTop}>
            <span>YOU</span>
            <strong>U$1.184</strong>
          </div>
          <MiniLineChart variant="hero" />
          <div className={styles.mockStats}>
            <span>Good +8</span>
            <span>Bad -3</span>
            <span>Clean streak +50%</span>
          </div>
          <div className={styles.mockLog}>
            <b>Gym</b>
            <span>Good habit · Hold</span>
            <strong>+100 UC</strong>
          </div>
          <div className={styles.mockLog}>
            <b>Beer</b>
            <span>Addiction · Sold</span>
            <strong className={styles.negative}>-50 UC</strong>
          </div>
        </div>
      </section>

      <section className={`${styles.strip} ${styles.reveal}`} data-reveal>
        <div>
          <strong>Track</strong>
          <span>Log what actually happened.</span>
        </div>
        <div>
          <strong>Notice</strong>
          <span>See which days pull you up or down.</span>
        </div>
        <div>
          <strong>Adjust</strong>
          <span>Use the data to change the next week.</span>
        </div>
      </section>

      <section className={styles.storyGrid}>
        <article className={`${styles.storyCard} ${styles.reveal}`} data-reveal>
          <div className={styles.kicker}>Pattern exposed</div>
          <h2>The weekend did not come out of nowhere.</h2>
          <p>
            In your head it can feel like Sunday just “went badly”. In the logs, you see the chain: strong habits all week, beer on
            Friday, out late Saturday, drained Sunday, takeaway becomes the easy button.
          </p>
          <PatternBars data={weekPattern} />
        </article>

        <article className={`${styles.logCard} ${styles.reveal}`} data-reveal>
          <div className={styles.cardHeader}>
            <div>
              <span>Logs</span>
              <h3>One week of evidence</h3>
            </div>
            <b>-0.82%</b>
          </div>
          <div className={styles.logs}>
            {logs.map((log) => (
              <div className={styles.logRow} key={`${log.time}-${log.title}`}>
                <span>{log.time}</span>
                <strong>{log.title}</strong>
                <em>{log.action}</em>
                <b className={log.delta.startsWith("-") ? styles.negative : ""}>{log.delta}</b>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={`${styles.insightSection} ${styles.reveal}`} data-reveal>
        <div className={styles.sectionCopy}>
          <div className={styles.kicker}>Self-awareness, but measurable</div>
          <h2>The app is not telling you who you are. It is showing you what repeats.</h2>
          <p>
            That is the useful part. Once the pattern is visible, the fix gets smaller: plan Friday, protect sleep, prep Sunday food,
            lower the damage before it becomes a whole weekend.
          </p>
        </div>
        <div className={styles.insightStack}>
          {insights.map((insight, index) => (
            <div className={styles.insight} key={insight}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{insight}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.comparison} ${styles.reveal}`} data-reveal>
        <div className={styles.sectionCopy}>
          <div className={styles.kicker}>The better version</div>
          <h2>Small effort still moves the line.</h2>
          <p>
            You do not need a perfect week. A one-drink cap, a planned meal, a short walk, or ten minutes of meditation all become
            visible. The chart rewards direction, not fantasy.
          </p>
        </div>
        <div className={styles.chartPair}>
          <div className={styles.chartPanel}>
            <span>Before</span>
            <MiniLineChart variant="messy" />
            <p>Strong midweek, then a weekend drop.</p>
          </div>
          <div className={styles.chartPanel}>
            <span>After</span>
            <MiniLineChart variant="better" />
            <p>Still human. Less damage. Faster recovery.</p>
          </div>
        </div>
        <PatternBars data={recoveryPattern} compact />
      </section>

      <section className={`${styles.finalCta} ${styles.reveal}`} data-reveal>
        <div>
          <div className={styles.kicker}>Try it with no pressure</div>
          <h2>Run the demo, feel the loop, then decide if you want your own data.</h2>
          <p>
            The demo lets you tap around first. Creating an account gives you your own private tracker, logs, charts, stats, and
            history.
          </p>
        </div>
        <div className={styles.finalActions}>
          <Link className={styles.primaryCta} href="/guest">
            Try Demo
          </Link>
          <Link className={styles.secondaryCta} href="/register">
            Create an account
          </Link>
        </div>
      </section>
    </main>
  );
}

function MiniLineChart({ variant }: { variant: "hero" | "messy" | "better" }) {
  const paths = {
    hero: "M4 150 C42 132 62 136 96 112 C128 88 150 96 178 70 C212 40 238 68 276 36",
    messy: "M4 96 C38 64 74 58 108 42 C140 28 158 60 184 86 C210 118 238 136 276 126",
    better: "M4 126 C38 112 72 96 108 88 C142 78 166 88 194 72 C226 54 246 62 276 44",
  };

  return (
    <svg className={styles.lineChart} viewBox="0 0 280 170" role="img" aria-label="Example progress chart">
      <path className={styles.gridLine} d="M4 136 H276" />
      <path className={styles.gridLine} d="M4 86 H276" />
      <path className={styles.gridLine} d="M4 36 H276" />
      <path className={styles.chartGlow} d={paths[variant]} />
      <path className={styles.chartLine} d={paths[variant]} />
      <circle className={styles.chartDot} cx="276" cy={variant === "messy" ? 126 : variant === "better" ? 44 : 36} r="5" />
    </svg>
  );
}

function PatternBars({ data, compact = false }: { data: { day: string; value: number; note?: string; label?: string }[]; compact?: boolean }) {
  return (
    <div className={`${styles.patternBars} ${compact ? styles.patternBarsCompact : ""}`}>
      {data.map((item) => {
        const height = Math.max(14, Math.abs(item.value) * 42);
        const positive = item.value >= 0;
        return (
          <div className={styles.patternDay} key={item.day}>
            <div className={styles.barTrack}>
              <i />
              <span
                className={positive ? styles.barPositive : styles.barNegative}
                style={{
                  height,
                  top: positive ? `calc(50% - ${height}px)` : "50%",
                }}
              />
            </div>
            <strong>{item.day}</strong>
            <em>{item.note ?? item.label}</em>
          </div>
        );
      })}
    </div>
  );
}
