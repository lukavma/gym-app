import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { createTemplateSchema } from "@/domain/templates/schema";
import {
  createTemplate,
  listTemplates,
  TemplateNameConflictError,
} from "@/server/templates/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  const { id } = await params;
  const results = await listTemplates(getDb(), userId, id, { includeArchived });
  if (results === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ templates: results });
}

export async function POST(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const template = await createTemplate(getDb(), userId, id, parsed.data);
    if (template === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    if (err instanceof TemplateNameConflictError) {
      return NextResponse.json({ error: "name_conflict" }, { status: 409 });
    }
    throw err;
  }
}
