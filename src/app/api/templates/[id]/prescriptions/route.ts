import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { createPrescriptionSchema } from "@/domain/prescriptions/schema";
import {
  createPrescription,
  listPrescriptions,
  PrescriptionCompatibilityError,
  PrescriptionExerciseArchivedError,
  PrescriptionExerciseNotFoundError,
} from "@/server/prescriptions/service";

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
  const results = await listPrescriptions(getDb(), userId, id);
  if (results === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ prescriptions: results });
}

export async function POST(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createPrescriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const prescription = await createPrescription(getDb(), userId, id, parsed.data);
    if (prescription === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ prescription }, { status: 201 });
  } catch (err) {
    if (err instanceof PrescriptionExerciseNotFoundError) {
      return NextResponse.json({ error: "exercise_not_found" }, { status: 400 });
    }
    if (err instanceof PrescriptionExerciseArchivedError) {
      return NextResponse.json({ error: "exercise_archived" }, { status: 400 });
    }
    if (err instanceof PrescriptionCompatibilityError) {
      return NextResponse.json(
        { error: "incompatible_prescription", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }
}
