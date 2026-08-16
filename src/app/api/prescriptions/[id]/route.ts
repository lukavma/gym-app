import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { updatePrescriptionSchema } from "@/domain/prescriptions/schema";
import {
  deletePrescription,
  getPrescription,
  updatePrescription,
  PrescriptionCompatibilityError,
  PrescriptionExerciseArchivedError,
  PrescriptionExerciseNotFoundError,
  PrescriptionNotFoundError,
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
  const prescription = await getPrescription(getDb(), userId, id);
  if (!prescription) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ prescription });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updatePrescriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const prescription = await updatePrescription(getDb(), userId, id, parsed.data);
    return NextResponse.json({ prescription });
  } catch (err) {
    if (err instanceof PrescriptionNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
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

export async function DELETE(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deletePrescription(getDb(), userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof PrescriptionNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
