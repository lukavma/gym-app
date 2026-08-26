import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { updateBodyweightInputSchema } from "@/domain/bodyweight/schema";
import {
  BodyweightEntryNotFoundError,
  deleteBodyweightEntry,
  updateBodyweightEntry,
} from "@/server/bodyweight/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateBodyweightInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const entry = await updateBodyweightEntry(getDb(), userId, id, parsed.data);
    return NextResponse.json({ entry });
  } catch (err) {
    if (err instanceof BodyweightEntryNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
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
    await deleteBodyweightEntry(getDb(), userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof BodyweightEntryNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
