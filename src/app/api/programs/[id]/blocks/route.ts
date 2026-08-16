import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { createBlockSchema } from "@/domain/blocks/schema";
import {
  createBlock,
  listBlocks,
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
  const results = await listBlocks(getDb(), userId, id);
  if (results === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ blocks: results });
}

export async function POST(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createBlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const block = await createBlock(getDb(), userId, id, parsed.data);
    if (block === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ block }, { status: 201 });
  } catch (err) {
    if (err instanceof BlockScheduleTemplateNotFoundError) {
      return NextResponse.json({ error: "schedule_template_not_found" }, { status: 400 });
    }
    if (err instanceof BlockScheduleTemplateArchivedError) {
      return NextResponse.json({ error: "schedule_template_archived" }, { status: 400 });
    }
    throw err;
  }
}
