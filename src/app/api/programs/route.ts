import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { createProgramSchema } from "@/domain/programs/schema";
import { createProgram, listPrograms, ProgramActiveConflictError } from "@/server/programs/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  const results = await listPrograms(getDb(), userId, { includeArchived });
  return NextResponse.json({ programs: results });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createProgramSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const program = await createProgram(getDb(), userId, parsed.data);
    return NextResponse.json({ program }, { status: 201 });
  } catch (err) {
    if (err instanceof ProgramActiveConflictError) {
      return NextResponse.json({ error: "active_program_exists" }, { status: 409 });
    }
    throw err;
  }
}
