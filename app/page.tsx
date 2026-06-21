"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/YouInc");
  }, [router]);

  return (
    <main className="placeholderPage launchPage">
      <div className="placeholderCard launchCard">
        <img className="launchLogo" src="/apple-touch-icon.png" alt="YouInc" />
        <div className="placeholderKicker">YouInc</div>
        <h1>Opening your tracker...</h1>
        <p>Checking your session and getting the app ready.</p>
        <div className="launchSpinner" aria-hidden="true" />
        <a href="/YouInc">Open YouInc</a>
      </div>
    </main>
  );
}
