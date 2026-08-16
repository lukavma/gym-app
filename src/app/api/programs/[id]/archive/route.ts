import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { programArchiveActionSchema } from "@/domain/programs/schema";
import {
  setProgramArchived,
  ProgramActiveConflictError,
  ProgramNotFoundError,
} from "@/server/programs/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const archiveRequestSchema = z.object({ action: programArchiveActionSchema });

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
    const program = await setProgramArchived(getDb(), userId, id, parsed.data.action);
    return NextResponse.json({ program });
  } catch (err) {
    if (err instanceof ProgramNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof ProgramActiveConflictError) {
      return NextResponse.json({ error: "active_program_exists" }, { status: 409 });
    }
    throw err;
  }
}
