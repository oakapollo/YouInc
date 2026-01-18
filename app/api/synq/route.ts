import { NextResponse } from "next/server";
import { db } from "@/app/YouInc/firebaseAdmin";

export const runtime = "nodejs"; // IMPORTANT: firebase-admin needs node runtime

export async function POST(req: Request) {
  try {
    const key = req.headers.get("x-youinc-key");
    if (!process.env.YOUINC_SYNC_KEY || key !== process.env.YOUINC_SYNC_KEY) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const store = body?.store;

    if (!store || typeof store.marketCapUC !== "number") {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }

    // For now: single-user (you). Later we’ll use auth userId.
    const userId = "me";

    const firestore = db();

    // 1) Save snapshot of entire store (overwrite)
    await firestore.doc(`users/${userId}/state/main`).set(
      {
        store,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // 2) Optionally append tx (only the newest one to reduce writes)
    // store.tx is newest-first in our app
    const latestTx = Array.isArray(store.tx) && store.tx.length ? store.tx[0] : null;
    if (latestTx?.id) {
      await firestore.doc(`users/${userId}/tx/${latestTx.id}`).set(latestTx, { merge: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "server_error" },
      { status: 500 }
    );
  }
}