import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireUserId } from "@/server/auth/session";
import { getMetricsDashboard } from "@/server/metrics/service";

// Metrics dashboard v1 (docs/reviews/metrics-dashboard-architecture-evaluation.md
// §11.1) — read-only, no query parameters in v1. `NetworkOnly` under the
// service worker via the existing catch-all (no `sw.ts` change).

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const metrics = await getMetricsDashboard(getDb(), userId);
  return NextResponse.json({ metrics });
}
