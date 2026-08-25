import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { getWeeklyVolumeReport } from "@/server/volume/service";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const report = await getWeeklyVolumeReport(getDb(), userId);
  return NextResponse.json(report);
}
