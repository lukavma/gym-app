import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { updateBlockSchema } from "@/domain/blocks/schema";
import {
  getBlock,
  updateBlock,
  BlockNotFoundError,
  BlockScheduleImmutableError,
  BlockScheduleTemplateArchivedError,
  BlockScheduleTemplateNotFoundError,
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
  const block = await getBlock(getDb(), userId, id);
  if (!block) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ block });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateBlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const block = await updateBlock(getDb(), userId, id, parsed.data);
    return NextResponse.json({ block });
  } catch (err) {
    if (err instanceof BlockNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof BlockScheduleImmutableError) {
      return NextResponse.json({ error: "schedule_immutable" }, { status: 409 });
    }
    if (err instanceof BlockScheduleTemplateNotFoundError) {
      return NextResponse.json({ error: "schedule_template_not_found" }, { status: 400 });
    }
    if (err instanceof BlockScheduleTemplateArchivedError) {
      return NextResponse.json({ error: "schedule_template_archived" }, { status: 400 });
    }
    throw err;
  }
}
