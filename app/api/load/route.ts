import { NextResponse } from "next/server";
import { db } from "../../YouInc/firebaseAdmin";
export const runtime = "nodejs";

// Legacy compatibility route. The signed-in app uses users/{uid}/store/main directly.
// Keep this path stable until any existing single-user deployment has been migrated.
export async function GET(req: Request) {
  const key = req.headers.get("x-youinc-key");
  if (!process.env.YOUINC_SYNC_KEY || key !== process.env.YOUINC_SYNC_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const userId = "me";
  const snap = await db().doc(`users/${userId}/state/main`).get();

  if (!snap.exists) {
    return NextResponse.json({ ok: true, store: null });
  }

  const data = snap.data();
  return NextResponse.json({ ok: true, store: data?.store ?? null });
}
