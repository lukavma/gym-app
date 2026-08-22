import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { getBlockSummary } from "@/server/blocks/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const summary = await getBlockSummary(getDb(), userId, id);
  if (!summary) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ summary });
}
