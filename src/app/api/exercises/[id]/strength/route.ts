import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { parseStrengthQuery } from "@/domain/strength/query";
import { getExerciseStrengthReport } from "@/server/strength/service";

// Estimated 1RM tracker — the read endpoint (revision §14.4, owner decision
// O-4). Read-only: there is no POST/PATCH/DELETE here, and the estimate is
// computed on read every time. `NetworkOnly` under the service worker like
// every other API GET (`src/app/sw.ts`).

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
  const query = parseStrengthQuery(url.searchParams);
  if (!query.ok) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { id } = await params;
  const report = await getExerciseStrengthReport(getDb(), userId, id, {
    asOf: query.value.asOf ? new Date(query.value.asOf) : undefined,
    whatIf:
      query.value.whatIfReps !== undefined && query.value.whatIfRir !== undefined
        ? { reps: query.value.whatIfReps, rir: query.value.whatIfRir }
        : null,
  });
  // A foreign-owned or missing id are indistinguishable — no existence
  // leakage (review RL-10). An ARCHIVED exercise is served (O-15): history is
  // archive-agnostic by design, so its estimate stays readable.
  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ strength: report });
}
