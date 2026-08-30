import { test, expect } from "@playwright/test";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// Phase 8 — required scenario: "duplicate outbox replay/idempotence", at
// the Playwright level (tests/integration/sync.integration.test.ts already
// proves this at the API layer; the task asks for e2e coverage too). Every
// `POST /api/sync` batch the app itself sends during a normal online
// workout is captured via route interception (real traffic, not a
// hand-built payload) and immediately resent a second time, right after the
// original — proving natural id-keyed-upsert idempotency
// (pwa-offline-strategy.md §5) holds against the exact bytes the client
// actually produces.
//
// Replaying each batch immediately (not accumulating every batch across the
// whole session and resending them all at the very end) matters: an EARLY
// batch (session create, status in_progress) resent AFTER a LATER batch has
// already moved the session to `completed` is correctly rejected
// (invalid_lifecycle_transition, src/server/sync/service.ts) — that's the
// forward-only lifecycle invariant working as intended, not the duplicate-
// replay scenario this spec is about.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

test("replaying each /api/sync batch a second time, immediately, never duplicates or alters server state", async ({
  page,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  const replayResults: { applied: string[]; rejected: unknown[] }[] = [];
  await page.route("**/api/sync", async (route) => {
    const body = route.request().postData();
    // `route.fetch()` performs the real request and waits for its response
    // — unlike `route.continue()`, which hands off to the network without
    // waiting — so the replay below only fires once the original has fully
    // committed. This is deliberately the SEQUENTIAL replay case (the
    // client's own flush loop never overlaps two POSTs — pwa-offline-
    // strategy.md §5's single `flushing` guard — so this is the only replay
    // shape the client itself could ever produce); the genuinely concurrent
    // case — two deliveries of the same create racing each other, e.g. a
    // reconnect tearing down an in-flight request client-side while the
    // server keeps applying it — is covered separately by
    // lost-response-retry.spec.ts. phase-8-review.md B-2 — every create
    // path (workoutSession/sessionExercise/setLog) is now safe under BOTH
    // shapes via `onConflictDoNothing` (src/server/sync/service.ts); this
    // spec only ever exercised the sequential one.
    const response = await route.fetch();
    await route.fulfill({ response });
    if (!body) return;
    const res = await page.request.post("/api/sync", {
      headers: { "Content-Type": "application/json" },
      data: body,
    });
    replayResults.push((await res.json()) as { applied: string[]; rejected: unknown[] });
  });

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await waitForOutboxDrained(page);

  await page.getByLabel("kg").fill("90");
  await page.getByLabel("reps").fill("7");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("90 kg × 7", { exact: true })).toBeVisible();
  await waitForOutboxDrained(page);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);

  await page.unroute("**/api/sync");
  expect(replayResults.length).toBeGreaterThan(0);
  for (const result of replayResults) {
    expect(result.rejected).toEqual([]);
  }

  const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
    sessions: { id: string }[];
  };
  const detail = (await (
    await page.request.get(`/api/history/${historyList.sessions[0]!.id}`)
  ).json()) as { session: { exercises: { sets: { weightKg: number; reps: number }[] }[] } };
  const sets = detail.session.exercises[0]!.sets;
  // Exactly once — the immediate replay must not have inserted a duplicate
  // set row.
  expect(sets).toHaveLength(1);
  expect(sets[0]).toMatchObject({ weightKg: 90, reps: 7 });
});
