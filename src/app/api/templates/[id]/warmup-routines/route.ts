import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { setTemplateWarmupRoutinesSchema } from "@/domain/warmup/schema";
import {
  listTemplateWarmupRoutines,
  setTemplateWarmupRoutines,
  WarmupRoutineAssociationConflictError,
  WarmupRoutineDefaultNotLinkedError,
  WarmupRoutineLinkTargetNotFoundError,
} from "@/server/warmupRoutines/service";

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
  const links = await listTemplateWarmupRoutines(getDb(), userId, id);
  if (links === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ links });
}

// PUT: the template's ENTIRE curated association set, replaced atomically.
// `routineIds` order is the link order; an empty array clears the set. This
// is also how a default is set, changed or cleared — there is no separate
// default endpoint, so "the default is one of the linked routines" can never
// be violated by two requests interleaving.
export async function PUT(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = setTemplateWarmupRoutinesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const links = await setTemplateWarmupRoutines(getDb(), userId, id, parsed.data);
    if (links === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ links });
  } catch (err) {
    if (err instanceof WarmupRoutineLinkTargetNotFoundError) {
      return NextResponse.json({ error: "routine_not_found" }, { status: 400 });
    }
    if (err instanceof WarmupRoutineDefaultNotLinkedError) {
      return NextResponse.json({ error: "default_not_linked" }, { status: 400 });
    }
    // warmup-routines-review.md MEDIUM-1 — a concurrent change to this
    // template's associations is a retryable 409, never an unmapped driver
    // error escaping as a 500. The service's anchor-row lock makes the
    // replacement-vs-replacement race unreachable; this still covers the
    // routine-hard-deleted-mid-request case and any future residual.
    if (err instanceof WarmupRoutineAssociationConflictError) {
      return NextResponse.json({ error: "association_conflict" }, { status: 409 });
    }
    throw err;
  }
}
