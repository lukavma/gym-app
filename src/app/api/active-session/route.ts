import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { getActiveSession } from "@/server/today/service";

export const runtime = "nodejs";

// Finding C — live active-session state, split out of `/api/today-bundle`
// precisely so it can never be served from a cache. The service worker routes
// it NetworkOnly (src/app/sw.ts) and `no-store` keeps the browser's own HTTP
// cache out of it too: offline, this request fails, and the client then hides
// remote resume/takeover instead of acting on a stale claim.
export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const activeSession = await getActiveSession(getDb(), userId);
  return NextResponse.json(
    { activeSession, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
