import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { reorderPrescriptionsSchema } from "@/domain/prescriptions/schema";
import {
  reorderPrescriptions,
  PrescriptionReorderMismatchError,
} from "@/server/prescriptions/service";

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
  const parsed = reorderPrescriptionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const prescriptions = await reorderPrescriptions(
      getDb(),
      userId,
      id,
      parsed.data.prescriptionIds,
    );
    if (prescriptions === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ prescriptions });
  } catch (err) {
    if (err instanceof PrescriptionReorderMismatchError) {
      return NextResponse.json({ error: "reorder_mismatch" }, { status: 400 });
    }
    throw err;
  }
}
