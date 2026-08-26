import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { getTodayRecoveryEntry } from "@/server/recovery/service";

export const runtime = "nodejs";

// phase-7-review.md HIGH-1 — lets the client read back today's user-local
// entry (or null) before ever rendering a check-in form, so it can tell
// "nothing logged yet" apart from "already logged" and never re-prompt the
// latter with synthetic defaults. "Today" is resolved server-side from the
// user's own timezone (`users.timezone`), never the client's clock.
export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const entry = await getTodayRecoveryEntry(getDb(), userId);
  return NextResponse.json({ entry });
}
