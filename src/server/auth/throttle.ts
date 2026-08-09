import { eq, inArray } from "drizzle-orm";
import { authThrottle } from "@/db/schema";
import type { AppDb } from "@/db/client";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 5;
const BASE_LOCKOUT_MS = 60 * 1000;
const MAX_LOCKOUT_MS = 60 * 60 * 1000;

export interface ThrottleState {
  failureCount: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
}

export interface ThrottleDecision {
  locked: boolean;
  retryAfterMs: number;
}

/** Pure: is this throttle row currently locked out, as of `now`? No IO. */
export function evaluateThrottle(state: ThrottleState | undefined, now: Date): ThrottleDecision {
  if (!state?.lockedUntil) return { locked: false, retryAfterMs: 0 };
  const retryAfterMs = state.lockedUntil.getTime() - now.getTime();
  return retryAfterMs > 0 ? { locked: true, retryAfterMs } : { locked: false, retryAfterMs: 0 };
}

/**
 * Pure: next throttle row state after one more failed attempt.
 * Fixed window + exponential backoff once the window's failure cap is hit.
 */
export function nextStateAfterFailure(state: ThrottleState | undefined, now: Date): ThrottleState {
  const windowExpired = !state || now.getTime() - state.windowStartedAt.getTime() > WINDOW_MS;
  const failureCount = windowExpired ? 1 : state.failureCount + 1;
  const windowStartedAt = windowExpired ? now : state.windowStartedAt;

  let lockedUntil: Date | null = null;
  if (failureCount >= MAX_FAILURES_PER_WINDOW) {
    const backoffMs = Math.min(
      BASE_LOCKOUT_MS * 2 ** (failureCount - MAX_FAILURES_PER_WINDOW),
      MAX_LOCKOUT_MS,
    );
    lockedUntil = new Date(now.getTime() + backoffMs);
  }

  return { failureCount, windowStartedAt, lockedUntil };
}

/** Worst-case (most locked) decision across the given identifiers (email + IP). */
export async function checkThrottle(
  db: AppDb,
  identifiers: string[],
  now: Date = new Date(),
): Promise<ThrottleDecision> {
  if (identifiers.length === 0) return { locked: false, retryAfterMs: 0 };
  const rows = await db
    .select()
    .from(authThrottle)
    .where(inArray(authThrottle.identifier, identifiers));

  let worst: ThrottleDecision = { locked: false, retryAfterMs: 0 };
  for (const row of rows) {
    const decision = evaluateThrottle(row, now);
    if (decision.retryAfterMs > worst.retryAfterMs) worst = decision;
  }
  return worst;
}

export async function recordFailure(
  db: AppDb,
  identifier: string,
  now: Date = new Date(),
): Promise<void> {
  const [existing] = await db
    .select()
    .from(authThrottle)
    .where(eq(authThrottle.identifier, identifier));
  const next = nextStateAfterFailure(existing, now);

  await db
    .insert(authThrottle)
    .values({ identifier, ...next })
    .onConflictDoUpdate({ target: authThrottle.identifier, set: next });
}

export async function resetThrottle(db: AppDb, identifier: string): Promise<void> {
  const cleared = { failureCount: 0, windowStartedAt: new Date(), lockedUntil: null };
  await db
    .insert(authThrottle)
    .values({ identifier, ...cleared })
    .onConflictDoUpdate({ target: authThrottle.identifier, set: cleared });
}
