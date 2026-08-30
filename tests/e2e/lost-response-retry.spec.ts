import { test, expect } from "@playwright/test";
import { newId } from "@/domain/ids/uuidv7";
import { login, ensureNoActiveSession, waitForOutboxDrained } from "./helpers";

// phase-8-review.md B-2 — "make lost-response retries genuinely idempotent."
// duplicate-replay.spec.ts already proves the SEQUENTIAL replay case (the
// client's own flush loop resends an identical batch after the original
// fully completed) stays safe; this spec is the genuinely different case the
// review demanded: the server actually applies a create, but the client
// never sees the response (a real reconnect race — the app's own reconnect
// flow does a full page navigation that can tear down an in-flight fetch
// client-side while the server keeps processing it), so the SAME op
// (unchanged opId, same entity id) gets resent. Before the fix, the retry's
// plain INSERT hit the row the first delivery already created and was mapped
// to `set_number_conflict` exactly like a genuine different-id conflict —
// permanently dead-lettering an op that had already succeeded.
//
// `route.fetch()` performs the REAL request against the real server and
// waits for the REAL response (so the op genuinely finishes applying
// server-side) before this handler discards it via `route.abort()` instead
// of `route.fulfill()` — simulating the response being lost client-side
// after the server already committed it.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

test("a create whose response is lost client-side after the server already applied it converges on retry, not a dead letter", async ({
  page,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await waitForOutboxDrained(page);

  let sabotaged = false;
  await page.route("**/api/sync", async (route) => {
    if (sabotaged) {
      await route.continue();
      return;
    }
    sabotaged = true;
    const response = await route.fetch();
    await response.body();
    // The client never sees this response — the outbox op stays "pending"
    // and gets resent, unchanged, on the next flush attempt.
    await route.abort("failed");
  });

  await page.getByLabel("kg").fill("92.5");
  await page.getByLabel("reps").fill("6");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("92.5 kg × 6", { exact: true })).toBeVisible();

  // Must drain with ZERO dead letters — the whole point of the fix. Before
  // it, this op would sit dead-lettered forever (status "dead"), and this
  // poll would time out.
  await waitForOutboxDrained(page);
  await page.unroute("**/api/sync");

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);

  const historyList = (await (await page.request.get("/api/history?limit=1")).json()) as {
    sessions: { id: string }[];
  };
  const detail = (await (
    await page.request.get(`/api/history/${historyList.sessions[0]!.id}`)
  ).json()) as { session: { exercises: { sets: { weightKg: number; reps: number }[] }[] } };
  const sets = detail.session.exercises[0]!.sets;
  // Exactly once — the retried delivery converged onto the same row rather
  // than either duplicating it or getting rejected.
  expect(sets).toHaveLength(1);
  expect(sets[0]).toMatchObject({ weightKg: 92.5, reps: 6 });
});

// The B-2 fix's `onConflictDoNothing` targets the op's OWN id specifically —
// a genuinely different id claiming the same (sessionExerciseId, setNumber)
// slot must still hit the OTHER unique index and reject, uncaught by that
// narrow target. This drives the real /api/sync endpoint directly with a
// hand-built payload (not the UI, which has no way to force a same-slot,
// different-id collision) — the exact "different-id genuine uniqueness
// conflict" the task requires as a negative control alongside the
// lost-response case above.
test("a different id claiming an already-occupied set-number slot still rejects with set_number_conflict", async ({
  page,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL(/\/today\/workout$/);
  await waitForOutboxDrained(page);

  await page.getByLabel("kg").fill("100");
  await page.getByLabel("reps").fill("5");
  await page.getByRole("button", { name: "Log" }).click();
  await expect(page.getByText("100 kg × 5", { exact: true })).toBeVisible();
  await waitForOutboxDrained(page);

  const activeSessionRes = await page.request.get("/api/active-session");
  const { activeSession } = (await activeSessionRes.json()) as {
    activeSession: { exercises: { id: string; sets: { setNumber: number }[] }[] };
  };
  const exercise = activeSession.exercises[0]!;
  const occupiedSetNumber = exercise.sets[0]!.setNumber;

  // A brand-new id, never seen before, claiming the SAME (sessionExerciseId,
  // setNumber) — a genuine conflict, not a replay of anything.
  const conflictingOpId = newId();
  const res = await page.request.post("/api/sync", {
    headers: { "Content-Type": "application/json" },
    data: {
      ops: [
        {
          opId: conflictingOpId,
          entity: "setLog",
          operation: "upsert",
          payload: {
            id: newId(),
            sessionExerciseId: exercise.id,
            setNumber: occupiedSetNumber,
            weightKg: 999,
            reps: 1,
            loggedAt: new Date().toISOString(),
          },
        },
      ],
    },
  });
  const body = (await res.json()) as {
    applied: string[];
    rejected: { opId: string; entity: string; reason: string }[];
  };
  expect(body.applied).toEqual([]);
  expect(body.rejected).toEqual([
    { opId: conflictingOpId, entity: "setLog", reason: "set_number_conflict" },
  ]);

  // The genuine conflict must not have altered the original set.
  const stillThere = await page.request.get("/api/active-session");
  const { activeSession: after } = (await stillThere.json()) as {
    activeSession: { exercises: { sets: { setNumber: number; weightKg: number }[] }[] };
  };
  const originalSet = after.exercises[0]!.sets.find((s) => s.setNumber === occupiedSetNumber);
  expect(originalSet?.weightKg).toBe(100);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Complete workout" }).click();
  await page.waitForURL(/\/today$/);
  await waitForOutboxDrained(page);
});
