import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { archiveActionSchema } from "@/domain/exercises/schema";
import { setExerciseArchived, ExerciseNotFoundError } from "@/server/exercises/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const archiveRequestSchema = z.object({ action: archiveActionSchema });

export async function POST(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = archiveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const exercise = await setExerciseArchived(getDb(), userId, id, parsed.data.action);
    return NextResponse.json({ exercise });
  } catch (err) {
    if (err instanceof ExerciseNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
