import type { ActiveSessionDto } from "./types";

// Finding C — the single source of truth for "is there a session in progress
// on the server right now".
//
// The today bundle used to carry `activeSession`, and that value reached the
// UI through two caches (the SW's `today-bundle` NetworkFirst cache and the
// IndexedDB bundle cache). Both can outlive the fact they describe: the
// device offered to resume a workout that PostgreSQL had already moved to
// `completed`. Remote active-session state is therefore read only here, from
// an endpoint the service worker routes NetworkOnly (src/app/sw.ts) and that
// answers `no-store` — if there is no network, this returns "unavailable"
// rather than something stale, and the UI hides remote resume/takeover.
export type RemoteActiveSessionResult =
  { status: "fresh"; activeSession: ActiveSessionDto | null } | { status: "unavailable" };

// `status` is deliberately widened from ActiveSessionDto's `"in_progress"`
// literal: the whole point of this endpoint is to CHECK that field at
// runtime, and a type assertion cannot. Anything else is treated as "no
// active session", not as an adoptable one.
type RemoteActiveSessionPayload = Omit<ActiveSessionDto, "status"> & { status: string };

// This request is NetworkOnly by design, so on a flaky connection it can hang
// for as long as the platform's default timeout — and Today waits for it
// before it can rule out a remote session. Bounded here instead: a check that
// hasn't answered by now is "unavailable", the same as being offline.
//
// SCOPE: this bounds RECEIPT OF THE RESPONSE HEADERS only. `clearTimeout`
// runs in the `finally` below as soon as `fetch` resolves, which is before
// `response.json()` reads the body — so a connection that returns headers and
// then stalls its body is NOT bounded, and TodaySection's loading gate stays
// on `remoteState: "checking"` ("Loading…") for as long as it stalls. Low
// probability for a small same-origin JSON body, and deliberately not fixed
// here (it would need the abort signal to stay armed across the body read),
// but it is not the same thing as "Today cannot hang".
//
// Neither the timeout nor the abort path has direct unit coverage:
// tests/unit/remoteActiveSession.test.ts covers a rejected fetch, which is a
// different failure. See R3/R4 in
// docs/reviews/phase-3-device-acceptance-remediation-verification.md.
const REMOTE_CHECK_TIMEOUT_MS = 4000;

export async function fetchRemoteActiveSession(): Promise<RemoteActiveSessionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_CHECK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("/api/active-session", {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
  // Includes 401 (expired cookie): unknown, never "nothing in progress".
  if (!response.ok) return { status: "unavailable" };

  let payload: { activeSession: RemoteActiveSessionPayload | null };
  try {
    payload = (await response.json()) as { activeSession: RemoteActiveSessionPayload | null };
  } catch {
    return { status: "unavailable" };
  }

  const remote = payload.activeSession ?? null;
  if (remote === null || remote.status !== "in_progress") {
    return { status: "fresh", activeSession: null };
  }
  return { status: "fresh", activeSession: { ...remote, status: "in_progress" } };
}

// Guard for the moment just before a remote session is written into
// IndexedDB as this device's own: the session the user was offered must
// still be the session the server has, and it must still be in progress.
// Pure, so it is unit-testable without IndexedDB.
export function isAdoptableRemoteSession(
  candidate: ActiveSessionDto | null,
  expectedSessionId: string,
): candidate is ActiveSessionDto {
  if (candidate === null) return false;
  if (candidate.id !== expectedSessionId) return false;
  return candidate.status === "in_progress";
}
