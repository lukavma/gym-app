import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { createExerciseSchema } from "@/domain/exercises/schema";
import {
  createExercise,
  listExercises,
  ExerciseNameConflictError,
} from "@/server/exercises/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  const results = await listExercises(getDb(), userId, { search, includeArchived });
  return NextResponse.json({ exercises: results });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const exercise = await createExercise(getDb(), userId, parsed.data);
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (err) {
    if (err instanceof ExerciseNameConflictError) {
      return NextResponse.json({ error: "name_conflict" }, { status: 409 });
    }
    throw err;
  }
}
