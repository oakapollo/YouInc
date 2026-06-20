"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/YouInc");
  }, [router]);

  return (
    <main className="placeholderPage">
      <div className="placeholderCard">
        <div className="placeholderKicker">YouInc</div>
        <h1>Opening your dashboard...</h1>
        <p>If this takes a moment, continue to the app manually.</p>
        <a href="/YouInc">Open YouInc</a>
      </div>
    </main>
  );
}
