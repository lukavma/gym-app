import { test, expect, type Page } from "@playwright/test";
import { formatSetLine } from "@/domain/measurement/format";
import { newId } from "@/domain/ids/uuidv7";
import {
  login,
  waitForOutboxDrained,
  ensureNoActiveSession,
  waitForServiceWorkerControl,
  createMeasurementExercise,
  createTemplateWithScheme,
  getActiveProgramInfo,
  applyScheduleOverride,
  restoreSchedule,
} from "./helpers";

// Phase 8 — required scenario: "rejected operation enters dead-letter
// without losing its payload", plus the dedicated dead-letter screen itself
// (inspect/retry/discard, discard double-confirmed, never silently
// deleted). Constructs a genuine server-side rejection using the
// already-implemented `session_conflict` path
// (uq_sessions_one_in_progress, src/server/sync/service.ts): device B
// starts its own session while offline and unaware device A's is still
// live, so B's queued "create session" op is rejected — not a network
// failure, a real business-rule rejection — once B reconnects.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

test("a rejected op dead-letters with its payload intact, supports inspect/discard-with-double-confirm/retry", async ({
  browser,
}) => {
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  try {
    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();

    await login(pageA);
    await ensureNoActiveSession(pageA);
    await pageA.getByRole("button", { name: "Start workout" }).click();
    await pageA.waitForURL(/\/today\/workout$/);
    await waitForOutboxDrained(pageA);

    // Device B: log in online (to get a cookie), then go offline before
    // ever checking for a foreign session — TodaySection's remote check
    // fails silently offline, so "Start workout" renders directly rather
    // than a conflict banner (same posture offline-sync.spec.ts relies on).
    await login(pageB);
    // Claim SW control (clientsClaim: false — a reload is required before
    // an offline navigation can be served from its precache at all).
    await waitForServiceWorkerControl(pageB);
    await deviceB.setOffline(true);
    await pageB.reload();
    await expect(pageB.getByRole("button", { name: "Start workout" })).toBeVisible();
    await pageB.getByRole("button", { name: "Start workout" }).click();
    await pageB.waitForURL(/\/today\/workout$/);

    await deviceB.setOffline(false);

    // The queued create-session op collides with A's genuinely still-live
    // session and dead-letters (session_conflict) — never a silent drop.
    await expect(pageB.getByText(/couldn't sync/)).toBeVisible({ timeout: 15_000 });
    await pageB.getByRole("link", { name: /Review/ }).click();
    await pageB.waitForURL(/\/sync-issues$/);

    const card = pageB.getByTestId("sync-issue-card").filter({ hasText: "Workout session" });
    await expect(card.getByText(/Rejected: session_conflict/)).toBeVisible();

    // Inspect: the full payload is visible, not just a summary.
    await card.getByRole("button", { name: "Inspect" }).click();
    const details = card.locator("pre");
    await expect(details).toContainText('"entity": "workoutSession"');
    await expect(details).toContainText('"status": "in_progress"');

    // Discard requires two explicit taps — never a single click.
    await card.getByRole("button", { name: "Discard" }).click();
    await expect(card.getByRole("button", { name: /Confirm discard/ })).toBeVisible();
    await expect(pageB.getByText("No sync issues.")).toHaveCount(0);
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByRole("button", { name: "Discard" })).toBeVisible();
    // Still present after cancelling — nothing was deleted.
    await expect(pageB.getByText(/Rejected: session_conflict/)).toBeVisible();

    // Resolve the underlying conflict — A discards its session, freeing
    // uq_sessions_one_in_progress — then Retry re-sends the SAME payload
    // (never altered) which now succeeds instead of re-rejecting.
    await pageA.bringToFront();
    pageA.once("dialog", (d) => void d.accept());
    await pageA.getByRole("button", { name: "Discard workout" }).click();
    await pageA.waitForURL(/\/today$/);
    await waitForOutboxDrained(pageA);

    await pageB.bringToFront();
    // Starting a session enqueues the workoutSession op AND its
    // sessionExercise op in the same batch (src/sync/activeSession.ts's
    // startSession) — the session op rejects with session_conflict, and
    // the session-exercise op (whose parent never got created) separately
    // rejects with not_found, so TWO ops dead-letter, not one. Retry the
    // session first — only once it exists server-side can its exercise's
    // retry succeed.
    await card.getByRole("button", { name: "Retry" }).click();
    const exerciseCard = pageB
      .getByTestId("sync-issue-card")
      .filter({ hasText: "Session exercise" });
    if (await exerciseCard.count()) {
      await exerciseCard.getByRole("button", { name: "Retry" }).click();
    }
    // Proof of REAL convergence, not just the screen's transient "no
    // longer dead" state (retrying flips status to pending immediately,
    // before the flush round-trip actually completes) — waitForOutboxDrained
    // polls IndexedDB directly and requires both pending:0 and dead:0.
    await waitForOutboxDrained(pageB);
    await pageB.reload();
    await expect(pageB.getByText("No sync issues.")).toBeVisible();

    // Device B's session is now genuinely in_progress server-side.
    const activeRes = await pageB.request.get("/api/active-session");
    const active = (await activeRes.json()) as { activeSession: { id: string } | null };
    expect(active.activeSession).not.toBeNull();

    await pageB.goto("/today/workout");
    pageB.once("dialog", (d) => void d.accept());
    await pageB.getByRole("button", { name: "Discard workout" }).click();
    await pageB.waitForURL(/\/today$/);
    await waitForOutboxDrained(pageB);
  } finally {
    await deviceA.close();
    await deviceB.close();
  }
});

// Athletic Measurement Profiles Release 2 (architecture-evaluation.md A-23,
// O-16) — a per-row (setLog) dead letter, distinct from the session-level
// `session_conflict` above: an old-client-shaped nine-key setLog op
// (id/sessionExerciseId/setNumber/isWarmup/weightKg/reps/rir/loggedAt/notes —
// exactly §14.5's "Release 2 -> pre-0013 build" rollback shape) is injected
// straight into the outbox against a REAL, already-synced `load_distance`
// round. `reps` is forbidden for `load_distance` (§6.2), so the server's
// effective-row validation (`isEffectiveSetRowValid`) rejects it as
// `invalid_measurement` — a genuine server rejection, not a network drop —
// and O-16 requires the card to mark that exact set, not just the sync-issues
// screen.
async function readActiveSessionSlotAndSet(
  page: Page,
): Promise<{ sessionExerciseId: string; setId: string; setNumber: number; loggedAt: string }> {
  return page.evaluate(async () => {
    const req = indexedDB.open("gym-app");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as unknown as Error);
    });
    try {
      const tx = db.transaction("activeSession", "readonly");
      const session: {
        exercises: { id: string; sets: { id: string; setNumber: number; loggedAt: string }[] }[];
      } = await new Promise((resolve, reject) => {
        const r = tx.objectStore("activeSession").get("current");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error as unknown as Error);
      });
      const exercise = session.exercises[0]!;
      const set = exercise.sets[0]!;
      return {
        sessionExerciseId: exercise.id,
        setId: set.id,
        setNumber: set.setNumber,
        loggedAt: set.loggedAt,
      };
    } finally {
      db.close();
    }
  });
}

async function injectIncompatibleSetLogOp(
  page: Page,
  input: { sessionExerciseId: string; setId: string; setNumber: number; loggedAt: string },
): Promise<void> {
  // `syncOpEnvelopeSchema.opId` is `uuidv7Schema`, not a general UUID — a
  // plain `crypto.randomUUID()` (v4) fails that check at the /api/sync
  // envelope layer, before the op is ever individually classified, which
  // backs off the WHOLE batch instead of dead-lettering this one op (the op
  // sits "pending" forever, indistinguishable from a network outage). Using
  // `newId()` here is what actually reaches the per-op `invalid_measurement`
  // path this test is about.
  const opId = newId();
  await page.evaluate(
    async (evalInput: {
      sessionExerciseId: string;
      setId: string;
      setNumber: number;
      loggedAt: string;
      opId: string;
    }) => {
      const req = indexedDB.open("gym-app");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error as unknown as Error);
      });
      try {
        const record = {
          opId: evalInput.opId,
          entity: "setLog" as const,
          operation: "upsert" as const,
          // The exact pre-Release-2 nine-key shape — weightKg matches the
          // real row's already-synced value (60), so the ONLY thing wrong
          // with this op is the forbidden `reps` key, which is the whole
          // point: an old client sending its old shape against a slot whose
          // frozen profile has since moved on.
          payload: {
            id: evalInput.setId,
            sessionExerciseId: evalInput.sessionExerciseId,
            setNumber: evalInput.setNumber,
            isWarmup: false,
            weightKg: 60,
            reps: 5,
            rir: null,
            loggedAt: evalInput.loggedAt,
            notes: null,
          },
          createdAt: new Date().toISOString(),
          tries: 0,
          status: "pending" as const,
        };
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("outbox", "readwrite");
          tx.objectStore("outbox").put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error as unknown as Error);
        });
      } finally {
        db.close();
      }
    },
    { ...input, opId },
  );
}

// The exact O-16 copy from src/ui/workout/ExerciseCard.tsx's exported
// `NOT_SAVED_COPY` — hardcoded here (not imported) because that module is a
// "use client" component that pulls in `next/link` and JSX, which Playwright's
// own (non-Next) module loader cannot resolve; every other spec in this
// directory asserts exact app copy the same way, by literal string, never by
// importing a UI component.
const NOT_SAVED_COPY = "Not saved - see Sync issues.";

async function readInjectedOutboxRecord(
  page: Page,
  setId: string,
): Promise<{ status: string; payload: Record<string, unknown>; deadReason?: string } | null> {
  return page.evaluate(async (setId) => {
    const req = indexedDB.open("gym-app");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as unknown as Error);
    });
    try {
      const tx = db.transaction("outbox", "readonly");
      const all: {
        entity: string;
        payload: Record<string, unknown>;
        status: string;
        deadReason?: string;
      }[] = await new Promise((resolve, reject) => {
        const r = tx.objectStore("outbox").getAll();
        r.onsuccess = () => resolve(r.result as never);
        r.onerror = () => reject(r.error as unknown as Error);
      });
      const match = all.find(
        (op) => op.entity === "setLog" && op.payload.id === setId && op.payload.reps === 5,
      );
      return match
        ? { status: match.status, payload: match.payload, deadReason: match.deadReason }
        : null;
    } finally {
      db.close();
    }
  }, setId);
}

test("an injected incompatible setLog op on a load_distance slot dead-letters with its payload intact and marks the card per O-16", async ({
  page,
}) => {
  await login(page);
  await ensureNoActiveSession(page);

  const unique = `E2E MP Dead Letter Sled ${Date.now()}`;
  const programInfo = await getActiveProgramInfo(page);
  const exercise = await createMeasurementExercise(page, {
    name: unique,
    equipment: "other",
    measurementProfile: "load_distance",
    loadBasis: "total",
  });
  const templateId = await createTemplateWithScheme(
    page,
    programInfo.programId,
    exercise.id,
    unique,
    {
      v: 1,
      scheme: { type: "distanceRounds", sets: 4, distanceM: 20 },
    },
  );

  try {
    await applyScheduleOverride(page, programInfo.blockId, templateId);
    await page.goto("/today");
    await ensureNoActiveSession(page);

    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    const line = formatSetLine("load_distance", "total", {
      weightKg: 60,
      reps: null,
      rir: null,
      distanceM: 20,
      durationS: 12.4,
    });
    await page.getByLabel("Weight in kilograms").fill("60");
    await page.getByLabel("Distance in metres").fill("20");
    await page.getByLabel("Time in seconds").fill("12.4");
    await page.getByRole("button", { name: "Log" }).click();
    await expect(page.getByText(line, { exact: true })).toBeVisible();
    await waitForOutboxDrained(page);

    const slotAndSet = await readActiveSessionSlotAndSet(page);
    await injectIncompatibleSetLogOp(page, slotAndSet);

    // The global 5 s flush interval (src/sync/flush.ts's installFlushTriggers)
    // picks the injected op up on its own — no explicit trigger needed —
    // and it must land as "dead", never silently retried forever (the
    // server's rejection is permanent: `reps` is structurally forbidden for
    // `load_distance` regardless of how many times it's resent).
    await expect
      .poll(async () => (await readInjectedOutboxRecord(page, slotAndSet.setId))?.status, {
        timeout: 20_000,
      })
      .toBe("dead");

    // Payload survives intact — never sanitized, mutated or dropped on
    // rejection (the sync-issues "Inspect" contract, extended to this
    // per-row case).
    const deadRecord = await readInjectedOutboxRecord(page, slotAndSet.setId);
    expect(deadRecord?.payload).toMatchObject({
      id: slotAndSet.setId,
      sessionExerciseId: slotAndSet.sessionExerciseId,
      weightKg: 60,
      reps: 5,
      rir: null,
    });
    // The reason itself must be the specific classification the server's
    // effective-row validation produced (`invalid_measurement`) — not merely
    // "some rejection" — so this test would notice if the server's reason
    // ever drifted to a confusable neighbour like `invalid_payload` or
    // `invalid_reference`.
    expect(deadRecord?.deadReason).toBe("invalid_measurement");

    // O-16 — the card itself visibly marks the refused set (not only the
    // /sync-issues screen), inside that exact set's own row. The marker
    // (SetRow's `refused && <span>NOT_SAVED_COPY</span>`) renders as a text
    // SIBLING of the formatted line inside the same <span>, which is exactly
    // why `getByText(line, { exact: true })` can no longer be the anchor
    // here — that span's own aggregated text is now the line plus the
    // marker concatenated, not the line alone. Anchor on the row containing
    // the marker instead, and prove the ORIGINAL round's real values are
    // still inside that same row (untouched by the rejected correction),
    // via substring containment rather than an exact whole-line match.
    // `li:not(:has(li))` restricts to LEAF <li>s (the individual set rows),
    // excluding the exercise's own outer <li> which also (transitively)
    // "has" this text — same idiom offline-set-edit-delete.spec.ts's
    // `editingRow` uses for the identical nested-<li> ambiguity.
    const markedRow = page.locator("li:not(:has(li))").filter({ hasText: NOT_SAVED_COPY });
    await expect(markedRow).toBeVisible({ timeout: 20_000 });
    await expect(markedRow).toContainText("60 kg");
    await expect(markedRow).toContainText("20 m");
    await expect(markedRow).toContainText("12.4 s");
  } finally {
    await page.goto("/today/workout").catch(() => undefined);
    const discardButton = page.getByRole("button", { name: "Discard workout" });
    if (await discardButton.isVisible().catch(() => false)) {
      page.once("dialog", (d) => void d.accept());
      await discardButton.click();
      await page.waitForURL(/\/today$/).catch(() => undefined);
    }
    await restoreSchedule(page, programInfo.blockId, programInfo.originalSchedulePayload);
    await page.request
      .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
      .catch(() => undefined);
  }
});

test("V-3 (independent verification) — waitForOutboxDrained's failure diagnostics name the dead-lettered op's entity and reason", async ({
  page,
}) => {
  // Reuses the exact same deterministic dead-letter mechanism as the test
  // above (an injected `reps` field on a `load_distance` slot, always
  // rejected `invalid_measurement`) — that rejection itself is already
  // proven there; this test is ONLY about whether waitForOutboxDrained's
  // own failure output, once it inevitably observes that dead letter, names
  // the offending entity and reason rather than a bare count mismatch.
  await login(page);
  await ensureNoActiveSession(page);

  const unique = `E2E V-3 Diagnostics ${Date.now()}`;
  const programInfo = await getActiveProgramInfo(page);
  const exercise = await createMeasurementExercise(page, {
    name: unique,
    equipment: "other",
    measurementProfile: "load_distance",
    loadBasis: "total",
  });
  const templateId = await createTemplateWithScheme(
    page,
    programInfo.programId,
    exercise.id,
    unique,
    {
      v: 1,
      scheme: { type: "distanceRounds", sets: 4, distanceM: 20 },
    },
  );

  try {
    await applyScheduleOverride(page, programInfo.blockId, templateId);
    await page.goto("/today");
    await ensureNoActiveSession(page);

    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL(/\/today\/workout$/);

    await page.getByLabel("Weight in kilograms").fill("60");
    await page.getByLabel("Distance in metres").fill("20");
    await page.getByLabel("Time in seconds").fill("12.4");
    await page.getByRole("button", { name: "Log" }).click();
    await waitForOutboxDrained(page);

    const slotAndSet = await readActiveSessionSlotAndSet(page);
    await injectIncompatibleSetLogOp(page, slotAndSet);
    await expect
      .poll(async () => (await readInjectedOutboxRecord(page, slotAndSet.setId))?.status, {
        timeout: 20_000,
      })
      .toBe("dead");

    // The zero-dead-letter assertion inside waitForOutboxDrained is
    // unchanged and still fails here — this only checks what the thrown
    // error NOW says.
    let caught: unknown;
    try {
      await waitForOutboxDrained(page, 2_000);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("setLog");
    expect(message).toContain("invalid_measurement");
  } finally {
    await page.goto("/today/workout").catch(() => undefined);
    const discardButton = page.getByRole("button", { name: "Discard workout" });
    if (await discardButton.isVisible().catch(() => false)) {
      page.once("dialog", (d) => void d.accept());
      await discardButton.click();
      await page.waitForURL(/\/today$/).catch(() => undefined);
    }
    await restoreSchedule(page, programInfo.blockId, programInfo.originalSchedulePayload);
    await page.request
      .post(`/api/templates/${templateId}/archive`, { data: { action: "archive" } })
      .catch(() => undefined);
  }
});
