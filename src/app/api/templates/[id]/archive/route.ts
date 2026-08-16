import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { templateArchiveActionSchema } from "@/domain/templates/schema";
import {
  setTemplateArchived,
  TemplateNotFoundError,
  TemplateReferencedError,
} from "@/server/templates/service";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const archiveRequestSchema = z.object({ action: templateArchiveActionSchema });

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
    const template = await setTemplateArchived(getDb(), userId, id, parsed.data.action);
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof TemplateNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof TemplateReferencedError) {
      return NextResponse.json({ error: "referenced" }, { status: 409 });
    }
    throw err;
  }
}
