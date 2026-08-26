import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { logRecoveryInputSchema } from "@/domain/recovery/schema";
import { listRecoveryEntries, logRecovery } from "@/server/recovery/service";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const entries = await listRecoveryEntries(getDb(), userId);
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = logRecoveryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const entry = await logRecovery(getDb(), userId, parsed.data);
  return NextResponse.json({ entry }, { status: 201 });
}
