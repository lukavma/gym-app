import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { reorderTemplatesSchema } from "@/domain/templates/schema";
import { reorderTemplates, TemplateReorderMismatchError } from "@/server/templates/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reorderTemplatesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const templates = await reorderTemplates(getDb(), userId, id, parsed.data.templateIds);
    if (templates === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ templates });
  } catch (err) {
    if (err instanceof TemplateReorderMismatchError) {
      return NextResponse.json({ error: "reorder_mismatch" }, { status: 400 });
    }
    throw err;
  }
}
