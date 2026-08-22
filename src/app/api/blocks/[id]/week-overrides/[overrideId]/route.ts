import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { updateWeekOverrideSchema } from "@/domain/blocks/schema";
import {
  deleteWeekOverride,
  updateWeekOverride,
  BlockNotFoundError,
  BlockWeekOverrideNotFoundError,
} from "@/server/blocks/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string; overrideId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateWeekOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id, overrideId } = await params;
  try {
    const override = await updateWeekOverride(getDb(), userId, id, overrideId, parsed.data);
    return NextResponse.json({ override });
  } catch (err) {
    if (err instanceof BlockNotFoundError || err instanceof BlockWeekOverrideNotFoundError) {
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

  const { id, overrideId } = await params;
  try {
    await deleteWeekOverride(getDb(), userId, id, overrideId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BlockNotFoundError || err instanceof BlockWeekOverrideNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
