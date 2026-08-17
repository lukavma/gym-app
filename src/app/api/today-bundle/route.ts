import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { buildTodayBundle } from "@/server/today/service";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const bundle = await buildTodayBundle(getDb(), userId);
  return NextResponse.json(bundle);
}
