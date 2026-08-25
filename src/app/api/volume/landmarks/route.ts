import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { upsertVolumeLandmarkInputSchema } from "@/domain/volume/schema";
import { NoActivePresetError, upsertVolumeLandmark } from "@/server/volume/service";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = upsertVolumeLandmarkInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const preset = await upsertVolumeLandmark(getDb(), userId, parsed.data);
    return NextResponse.json({ preset });
  } catch (err) {
    if (err instanceof NoActivePresetError) {
      return NextResponse.json({ error: "no_active_preset" }, { status: 409 });
    }
    throw err;
  }
}
