import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { replaceWarmupRoutineSchema } from "@/domain/warmup/schema";
import {
  deleteWarmupRoutine,
  getWarmupRoutine,
  replaceWarmupRoutine,
  WarmupRoutineNameConflictError,
  WarmupRoutineNotFoundError,
} from "@/server/warmupRoutines/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// A malformed `id` never reaches PostgreSQL as a `uuid` comparison — the
// service rejects it up front (see `isUuid` in @/domain/warmup/schema), so it
// answers 404 rather than surfacing SQLSTATE 22P02 as an unhandled 500.
export async function GET(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const routine = await getWarmupRoutine(getDb(), userId, id);
  if (!routine) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ routine });
}

// PUT, not PATCH: routine name + the full ordered item list are one
// consistency boundary, replaced as a unit (evaluation B-3). Item add/edit/
// remove/reorder are all this one call.
export async function PUT(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = replaceWarmupRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const routine = await replaceWarmupRoutine(getDb(), userId, id, parsed.data);
    return NextResponse.json({ routine });
  } catch (err) {
    if (err instanceof WarmupRoutineNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof WarmupRoutineNameConflictError) {
      return NextResponse.json({ error: "name_conflict" }, { status: 409 });
    }
    throw err;
  }
}

// Hard delete — items and every template association cascade away with the
// routine. There is no `referenced` 409 branch (unlike exercises): nothing
// historical can reference a routine, by construction.
export async function DELETE(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteWarmupRoutine(getDb(), userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof WarmupRoutineNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
