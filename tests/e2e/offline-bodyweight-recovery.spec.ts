import { test, expect, type Page } from "@playwright/test";
import {
  login,
  ensureNoActiveSession,
  waitForOutboxDrained,
  waitForServiceWorkerReady,
  deleteAllRecoveryEntries,
} from "./helpers";

// phase-8-review.md MEDIUM-2 — offline bodyweight/recovery had zero
// unit/integration/E2E coverage, and none of the changed components
// (src/sync/dailyLogs.ts, src/domain/time/localDate.ts, dailyLogCache,
// RecoveryCheckInUnknownOfflineForm) were exercised by test:e2e:offline.
// This spec covers: offline bodyweight log surviving a refresh and
// converging on reconnect; the true unknown-offline recovery state (no live
// read, no same-day cache) converging through its touched-only merge; the
// account-vs-device timezone disagreement B-3 fixes (a deterministic
// UTC-instant + far-apart IANA zone pair, not incidental timing); and the
// unknown-account-timezone safe-surfacing state.
//
// Needs a seeded dev Postgres — see playwright.config.ts's `webServer`.

async function readOutboxPayloads(page: Page, entity: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (entity) => {
    const req = indexedDB.open("gym-app");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as unknown as Error);
    });
    try {
      const tx = db.transaction("outbox", "readonly");
      const all: { entity: string; payload: Record<string, unknown> }[] = await new Promise(
        (resolve, reject) => {
          const r = tx.objectStore("outbox").getAll();
          r.onsuccess = () =>
            resolve(r.result as { entity: string; payload: Record<string, unknown> }[]);
          r.onerror = () => reject(r.error as unknown as Error);
        },
      );
      return all.filter((op) => op.entity === entity).map((op) => op.payload);
    } finally {
      db.close();
    }
  }, entity);
}

async function hasDailyLogCacheEntry(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const req = indexedDB.open("gym-app");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as unknown as Error);
    });
    try {
      const record = await new Promise((resolve, reject) => {
        const r = db
          .transaction("dailyLogCache", "readonly")
          .objectStore("dailyLogCache")
          .get("recoveryToday");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error as unknown as Error);
      });
      return record !== undefined;
    } finally {
      db.close();
    }
  });
}

// RecoveryCheckIn's online effect (src/ui/recovery/RecoveryCheckIn.tsx)
// writes its confirmed read to dailyLogCache via a fire-and-forget
// `void setCachedRecoveryToday(...)`, AFTER the component has already
// re-rendered into "form"/"summary" — the header text common to every phase
// (including "loading") is visible well before that write lands. Clearing
// the cache before it's actually written would just have the delayed write
// silently repopulate it a moment later, defeating the whole point of this
// test. Poll for the real write instead of racing it.
async function waitForDailyLogCacheEntry(page: Page): Promise<void> {
  await expect.poll(() => hasDailyLogCacheEntry(page), { timeout: 10_000 }).toBe(true);
}

async function clearDailyLogCache(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const req = indexedDB.open("gym-app");
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as unknown as Error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("dailyLogCache", "readwrite");
        tx.objectStore("dailyLogCache").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error as unknown as Error);
      });
    } finally {
      db.close();
    }
  });
}

test.describe("offline bodyweight quick-log", () => {
  test("logging offline survives a refresh and converges to the server on reconnect", async ({
    page,
    context,
  }) => {
    await login(page);
    await waitForServiceWorkerReady(page);
    await ensureNoActiveSession(page);
    await page.reload(); // let the already-active SW take control of this page.
    await expect(page.getByLabel("Bodyweight (kg)")).toBeVisible();

    await context.setOffline(true);
    await page.getByLabel("Bodyweight (kg)").fill("77.4");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Saved.")).toHaveCount(0); // no stale success banner
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    await context.setOffline(false);
    await waitForOutboxDrained(page);

    const res = await page.request.get("/api/bodyweight");
    const { entries } = (await res.json()) as { entries: { weightKg: number; id: string }[] };
    const entry = entries.find((e) => e.weightKg === 77.4);
    expect(entry).toBeTruthy();

    // Clean up so later runs start fresh.
    await page.request.delete(`/api/bodyweight/${entry!.id}`);
  });
});

test.describe("offline recovery check-in — true unknown-offline state", () => {
  test("no live read, no same-day cache: the touched-only merge form saves and converges on reconnect without ever fabricating a full row", async ({
    page,
    context,
  }) => {
    await login(page);
    await waitForServiceWorkerReady(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.reload();
    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await waitForDailyLogCacheEntry(page);

    // Simulate "this device's cached same-day recovery state is gone" (a
    // fresh cold client would have the same empty cache) while the SW/app
    // shell stays genuinely installed — the account timezone stays cached
    // from the reload above, so this is specifically the "no entry cache"
    // ambiguity, not the "no timezone at all" one (covered separately below).
    await clearDailyLogCache(page);
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByText(/Offline — can.t verify today.s check-in yet/)).toBeVisible();

    // Every metric starts as the nullable "not set" control (UnsetField) —
    // "not set" here means "not touched," never a fabricated 3/5 default
    // (RecoveryCheckInUnknownOfflineForm's whole point). Explicitly touch
    // readiness only.
    await page.getByRole("button", { name: "Set Readiness" }).click();
    const readiness = page.getByLabel("Readiness", { exact: true });
    await readiness.focus();
    await readiness.press("ArrowRight");
    await readiness.press("ArrowRight");
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(page.getByText(/Saved — will finish syncing/)).toBeVisible();

    await context.setOffline(false);
    await waitForOutboxDrained(page);

    const res = await page.request.get("/api/recovery/today");
    const { entry } = (await res.json()) as {
      entry: {
        readiness: number | null;
        sleepQuality: number | null;
        soreness: number | null;
      } | null;
    };
    // Only the touched field made it through — nothing else was fabricated.
    expect(entry?.readiness).toBe(5);
    expect(entry?.sleepQuality).toBeNull();
    expect(entry?.soreness).toBeNull();

    await deleteAllRecoveryEntries(page);
  });
});

test.describe("account vs device timezone disagreement (phase-8-review.md B-3)", () => {
  // A fixed instant where two real, far-apart IANA zones genuinely disagree
  // on the calendar day: Europe/Ljubljana (the seeded account's
  // users.timezone, CEST/UTC+2 in June) reads 2026-06-15 23:50 ->
  // "2026-06-15"; Pacific/Kiritimati (this test's DEVICE zone, UTC+14, no
  // DST) reads the SAME instant as 2026-06-16 11:50 -> "2026-06-16".
  const DIVERGENT_INSTANT = new Date("2026-06-15T21:50:00.000Z");
  const ACCOUNT_DAY = "2026-06-15";
  const DEVICE_DAY = "2026-06-16";

  test.use({ timezoneId: "Pacific/Kiritimati" });

  test("an offline bodyweight log is day-keyed to the account's timezone, never the browser's, at a UTC boundary where they disagree", async ({
    page,
    context,
  }) => {
    await login(page);
    await waitForServiceWorkerReady(page);
    await ensureNoActiveSession(page);
    await page.reload(); // caches the account timezone (Today bundle) while still online.

    await page.clock.setFixedTime(DIVERGENT_INSTANT);
    await context.setOffline(true);

    await page.getByLabel("Bodyweight (kg)").fill("81.2");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Saved.")).toBeVisible();

    const payloads = await readOutboxPayloads(page, "bodyweightEntry");
    const payload = payloads.find((p) => p.weightKg === 81.2);
    expect(payload?.date).toBe(ACCOUNT_DAY);
    expect(payload?.date).not.toBe(DEVICE_DAY);

    await context.setOffline(false);
    await waitForOutboxDrained(page);

    const res = await page.request.get("/api/bodyweight");
    const { entries } = (await res.json()) as {
      entries: { weightKg: number; date: string; id: string }[];
    };
    const entry = entries.find((e) => e.weightKg === 81.2);
    expect(entry?.date).toBe(ACCOUNT_DAY);

    await page.request.delete(`/api/bodyweight/${entry!.id}`);
  });
});

test.describe("unknown account timezone — safe surfacing (phase-8-review.md B-3)", () => {
  test("with no cached account timezone and no connectivity, the check-in surfaces an explicit unknown state instead of guessing a day", async ({
    page,
    context,
  }) => {
    await login(page);
    await waitForServiceWorkerReady(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);
    await page.goto("/recovery");
    await expect(page.getByText("How are you feeling today?")).toBeVisible();

    // Simulate a device that never obtained the account's timezone (the SW
    // and app shell are genuinely installed — a real cold-start device
    // would reach this same empty-cache state on its very first launch).
    await clearDailyLogCache(page);
    await page.evaluate(async () => {
      const req = indexedDB.open("gym-app");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error as unknown as Error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("bundleCache", "readwrite");
          tx.objectStore("bundleCache").clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error as unknown as Error);
        });
      } finally {
        db.close();
      }
    });

    await context.setOffline(true);
    await page.reload();

    await expect(
      page.getByText(/this device hasn.t learned the account.s timezone/i),
    ).toBeVisible();
    // No inputs offered — there is no day it would be safe to write to.
    await expect(page.getByLabel("Readiness", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save check-in" })).toHaveCount(0);

    await context.setOffline(false);
  });
});

// phase-8-remediation-verification.md §4/§12 (B-3, item 1) — the gap the
// two describe blocks above don't cover: a `bundleCache` record that
// EXISTS but is legacy-shaped (written by any pre-remediation build, with
// no `timezone` field at all — not an empty store, which is what "unknown
// account timezone — safe surfacing" above already exercises). Before the
// fix, `getAccountTimezone()` returned that record's `undefined` timezone
// as-is, which slipped past `resolveTodayDate`'s `=== null` guard into
// `Intl.DateTimeFormat`'s device-zone default — reproduced by the
// independent verification pass as a real recovery entry silently
// overwritten on the wrong (device) calendar day. `getIdb()`'s IndexedDB
// schema (src/sync/db.ts) is untouched by this fix, so writing the legacy
// shape directly into the real `bundleCache` store — the same store a real
// upgraded client would already hold it in — exercises the real upgrade
// path, not a mock.
test.describe("legacy pre-remediation Today bundle — B-3 upgrade path regression (phase-8-remediation-verification.md §4/§12)", () => {
  // Same divergent-instant pair the "account vs device timezone
  // disagreement" describe block above uses: Europe/Ljubljana (the seeded
  // account's users.timezone) reads this instant as 2026-06-15; this
  // block's device zone, Pacific/Kiritimati (UTC+14, no DST), reads the
  // SAME instant as 2026-06-16.
  const DIVERGENT_INSTANT = new Date("2026-06-15T21:50:00.000Z");
  const ACCOUNT_DAY = "2026-06-15";
  const DEVICE_DAY = "2026-06-16";

  test.use({ timezoneId: "Pacific/Kiritimati" });

  async function seedLegacyBundleCache(page: Page, shape: "missing" | "empty"): Promise<void> {
    await page.evaluate(async (shape) => {
      const req = indexedDB.open("gym-app");
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error as unknown as Error);
      });
      try {
        const bundle: Record<string, unknown> = {
          today: { kind: "no_schedule" },
          activeSession: null,
          generatedAt: new Date().toISOString(),
        };
        if (shape === "empty") bundle.timezone = "";
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("bundleCache", "readwrite");
          tx.objectStore("bundleCache").put(
            { bundle, fetchedAt: new Date().toISOString() },
            "current",
          );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error as unknown as Error);
        });
      } finally {
        db.close();
      }
    }, shape);
  }

  // login() always lands on /today first, and TodaySection re-caches a
  // fresh, valid bundle on every Today load regardless of this fix — the
  // one thing that actually exercises getAccountTimezone()'s OWN live-fetch
  // fallback (as opposed to a coincidental heal from an unrelated code
  // path) is a device arriving directly at /bodyweight or /recovery
  // without going through /today at all — precisely the case the function's
  // own doc comment names ("navigating straight to /bodyweight or
  // /recovery"). The legacy bundle is (re-)seeded immediately before that
  // direct navigation, after any earlier /today visit this test needed for
  // setup — an initial verification run that instead reloaded /today
  // passed identically whether or not the fix was present, because
  // TodaySection's own fetch silently healed the cache first regardless of
  // any guard.

  test("online, arriving directly at /bodyweight without visiting Today first: a legacy cached bundle self-heals via the live fetch — the write lands on the account day", async ({
    page,
  }) => {
    await login(page);
    await waitForServiceWorkerReady(page);
    await ensureNoActiveSession(page);

    await seedLegacyBundleCache(page, "missing");
    await page.goto("/bodyweight");
    await expect(page.getByLabel("Bodyweight (kg)")).toBeVisible();
    await page.clock.setFixedTime(DIVERGENT_INSTANT);

    await page.getByLabel("Bodyweight (kg)").fill("83.5");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await waitForOutboxDrained(page);

    const bwRes = await page.request.get("/api/bodyweight");
    const { entries: bwEntries } = (await bwRes.json()) as {
      entries: { weightKg: number; date: string; id: string }[];
    };
    // Scoped by date as well as weight (phase-8-remediation-verification.md
    // §9 LOW-4's exact fragility: a weight-only lookup can match a stale row
    // left on a different date by an earlier/unrelated run against the same
    // long-lived table) — the whole point of this assertion is which DATE
    // the write landed on, so the query must not itself be blind to date.
    const accountDayEntry = bwEntries.find((e) => e.weightKg === 83.5 && e.date === ACCOUNT_DAY);
    expect(accountDayEntry).toBeTruthy();
    expect(bwEntries.some((e) => e.weightKg === 83.5 && e.date === DEVICE_DAY)).toBe(false);

    for (const e of bwEntries.filter((e) => e.weightKg === 83.5)) {
      await page.request.delete(`/api/bodyweight/${e.id}`);
    }
  });

  test("online, arriving directly at /recovery without visiting Today first: a legacy cached bundle self-heals via the live fetch — the write lands on the account day, and a pre-existing device-day entry is untouched", async ({
    page,
  }) => {
    await login(page);
    await waitForServiceWorkerReady(page);
    await ensureNoActiveSession(page);
    await deleteAllRecoveryEntries(page);

    // A real, deliberate device-day entry — exactly the shape the
    // independent verification pass reproduced being destroyed (a real
    // stored row with a distinguishing note, on the day the DEVICE, not the
    // account, would compute as "today").
    const seedRes = await page.request.post("/api/recovery", {
      data: { date: DEVICE_DAY, sleepQuality: 5, readiness: 5, soreness: 5, note: "real entry" },
    });
    expect(seedRes.ok()).toBe(true);
    const { entry: seededEntry } = (await seedRes.json()) as {
      entry: {
        id: string;
        date: string;
        sleepQuality: number | null;
        readiness: number | null;
        soreness: number | null;
        note: string | null;
      };
    };

    await seedLegacyBundleCache(page, "missing");
    await page.goto("/recovery");
    await expect(page.getByText("How are you feeling today?")).toBeVisible();
    await page.clock.setFixedTime(DIVERGENT_INSTANT);

    await expect(page.getByRole("button", { name: "Save check-in" })).toBeVisible();
    await page.getByRole("button", { name: "Save check-in" }).click();
    await expect(page.getByText(/^Logged today:/)).toBeVisible();
    await waitForOutboxDrained(page);

    const recRes = await page.request.get("/api/recovery");
    const { entries: recEntries } = (await recRes.json()) as {
      entries: {
        id: string;
        date: string;
        sleepQuality: number | null;
        readiness: number | null;
        soreness: number | null;
        note: string | null;
      }[];
    };
    const accountDayEntry = recEntries.find((e) => e.date === ACCOUNT_DAY);
    expect(accountDayEntry).toBeTruthy();
    expect(accountDayEntry?.date).not.toBe(DEVICE_DAY);

    // The pre-existing device-day entry is untouched — byte-identical to
    // what was seeded, not overwritten with neutral defaults or a cleared
    // note (the original BLOCKER-3 failure mode).
    const deviceDayEntry = recEntries.find((e) => e.id === seededEntry.id);
    expect(deviceDayEntry).toEqual(seededEntry);

    await deleteAllRecoveryEntries(page);
  });

  for (const shape of ["missing", "empty"] as const) {
    test(`offline: a legacy cached bundle with a${shape === "empty" ? "n empty-string" : " missing"} \`timezone\` field surfaces the unknown-timezone state — no inputs offered, no outbox operation or database mutation occurs`, async ({
      page,
      context,
    }) => {
      await login(page);
      await waitForServiceWorkerReady(page);
      await ensureNoActiveSession(page);
      await deleteAllRecoveryEntries(page);
      // Stays on /today (BodyweightQuickLog and RecoveryCheckIn are both
      // rendered there) — a fresh navigation to /bodyweight or /recovery
      // would need its own document served offline, which nothing in this
      // test primes into the SW's page cache.
      await expect(page.getByText("How are you feeling today?")).toBeVisible();

      await clearDailyLogCache(page);
      await seedLegacyBundleCache(page, shape);

      await context.setOffline(true);
      await page.reload();

      await expect(
        page.getByText(/Can.t check in yet — this device hasn.t learned/i),
      ).toBeVisible();
      await expect(page.getByLabel("Readiness", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save check-in" })).toHaveCount(0);

      // Bodyweight has no phase gate of its own — attempting a save must
      // still be rejected before anything is written.
      await expect(page.getByLabel("Bodyweight (kg)")).toBeVisible();
      await page.getByLabel("Bodyweight (kg)").fill("91.1");
      await page.getByRole("button", { name: "Save" }).first().click();
      await expect(page.getByText(/Can.t save yet — this device hasn.t learned/i)).toBeVisible();

      const payloads = await readOutboxPayloads(page, "bodyweightEntry");
      expect(payloads.some((p) => p.weightKg === 91.1)).toBe(false);
      expect(await hasDailyLogCacheEntry(page)).toBe(false);

      await context.setOffline(false);
    });
  }

  // phase-8-remediation-verification.md §4 — the independent verification
  // pass could not reach this vector through a real service-worker cache
  // either ("the service worker answered /api/today-bundle from its own
  // today-bundle runtime cache with a current body, so the stripped
  // response never reached the client... unproven"): a service worker
  // controlling the page issues its own fetch for /api/today-bundle inside
  // its fetch handler, which page-/context-level route interception cannot
  // reliably substitute a response for. `readValidTimezone` in
  // src/sync/accountTimezone.ts applies the identical guard to the
  // live-fetch branch regardless of what served the response — the code has
  // no way to distinguish a genuine network reply from one the SW answered
  // out of its own cache, so tests/unit/dailyLogs.test.ts's "returns null …
  // when both the cached bundle and the live-fetch response are
  // legacy/invalid" (mocking `fetch` directly, the same boundary this code
  // actually reads through) is the faithful regression coverage for this
  // exact requirement.
});
