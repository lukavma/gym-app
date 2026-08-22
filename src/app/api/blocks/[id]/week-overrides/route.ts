import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { createWeekOverrideSchema } from "@/domain/blocks/schema";
import {
  createWeekOverride,
  listWeekOverrides,
  BlockNotFoundError,
  BlockWeekOverrideDuplicateError,
} from "@/server/blocks/service";

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
  try {
    const overrides = await listWeekOverrides(getDb(), userId, id);
    return NextResponse.json({ overrides });
  } catch (err) {
    if (err instanceof BlockNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createWeekOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const override = await createWeekOverride(getDb(), userId, id, parsed.data);
    return NextResponse.json({ override }, { status: 201 });
  } catch (err) {
    if (err instanceof BlockNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof BlockWeekOverrideDuplicateError) {
      return NextResponse.json({ error: "week_override_conflict" }, { status: 409 });
    }
    throw err;
  }
}
