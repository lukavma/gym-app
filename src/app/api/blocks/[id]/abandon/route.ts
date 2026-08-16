import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import {
  abandonBlock,
  BlockInvalidTransitionError,
  BlockNotFoundError,
} from "@/server/blocks/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const block = await abandonBlock(getDb(), userId, id);
    return NextResponse.json({ block });
  } catch (err) {
    if (err instanceof BlockNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof BlockInvalidTransitionError) {
      return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
    }
    throw err;
  }
}
