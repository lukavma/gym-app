import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { listHistorySessions } from "@/server/history/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const beforeParam = url.searchParams.get("before") ?? undefined;
  const limit = limitParam ? Number(limitParam) : undefined;
  if (limitParam !== null && (!Number.isFinite(limit) || limit === undefined)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // MEDIUM-6: `before` was passed straight through to `new Date(...)` in
  // the service layer — an unparseable value (`?before=not-a-date`) or an
  // out-of-range one (`?before=9999999999999999`) produced an Invalid Date
  // that then 500'd instead of failing validation here, same as `limit`
  // already does above.
  if (beforeParam !== undefined && Number.isNaN(new Date(beforeParam).getTime())) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const sessions = await listHistorySessions(getDb(), userId, { limit, before: beforeParam });
  return NextResponse.json({ sessions });
}
