import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { updateExerciseSchema } from "@/domain/exercises/schema";
import {
  deleteExercise,
  getExercise,
  updateExercise,
  ExerciseNameConflictError,
  ExerciseNotFoundError,
  ExerciseReferencedError,
  RollupContributionNotCarriedError,
} from "@/server/exercises/service";

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
  const exercise = await getExercise(getDb(), userId, id);
  if (!exercise) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ exercise });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const exercise = await updateExercise(getDb(), userId, id, parsed.data);
    return NextResponse.json({ exercise });
  } catch (err) {
    if (err instanceof ExerciseNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof ExerciseNameConflictError) {
      return NextResponse.json({ error: "name_conflict" }, { status: 409 });
    }
    if (err instanceof RollupContributionNotCarriedError) {
      return NextResponse.json(
        { error: "rollup_not_carried", muscleGroupId: err.muscleGroupId },
        { status: 422 },
      );
    }
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteExercise(getDb(), userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ExerciseNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof ExerciseReferencedError) {
      return NextResponse.json({ error: "referenced" }, { status: 409 });
    }
    throw err;
  }
}
