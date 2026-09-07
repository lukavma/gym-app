import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { putSelectionInputSchema } from "@/domain/metrics/selection";
import {
  InvalidSelectionExerciseError,
  getSelection,
  replaceSelection,
} from "@/server/metrics/selectionService";

// Metrics dashboard v1 (docs/reviews/metrics-dashboard-architecture-evaluation.md
// §11.5) — the feature's one write path: idempotent full replacement of the
// athlete's ordered exercise selection. `NetworkOnly` under the existing
// catch-all like every other API GET/PUT.

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const result = await getSelection(getDb(), userId);
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = putSelectionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const selection = await replaceSelection(getDb(), userId, parsed.data.exerciseIds);
    return NextResponse.json({ selection });
  } catch (err) {
    if (err instanceof InvalidSelectionExerciseError) {
      return NextResponse.json(
        { error: "invalid_exercise", exerciseId: err.exerciseId },
        { status: 400 },
      );
    }
    throw err;
  }
}
