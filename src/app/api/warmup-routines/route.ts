import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { createWarmupRoutineSchema } from "@/domain/warmup/schema";
import {
  createWarmupRoutine,
  listWarmupRoutines,
  WarmupRoutineNameConflictError,
} from "@/server/warmupRoutines/service";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const routines = await listWarmupRoutines(getDb(), userId);
  return NextResponse.json({ routines });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createWarmupRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const routine = await createWarmupRoutine(getDb(), userId, parsed.data);
    return NextResponse.json({ routine }, { status: 201 });
  } catch (err) {
    if (err instanceof WarmupRoutineNameConflictError) {
      return NextResponse.json({ error: "name_conflict" }, { status: 409 });
    }
    throw err;
  }
}
