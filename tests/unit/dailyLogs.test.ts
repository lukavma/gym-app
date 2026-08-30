// phase-8-review.md B-3/MEDIUM-2 — the day-attribution defect and its fix,
// tested at the layer that actually resolves "today" for offline quick-logs:
// src/domain/time/localDate.ts's pure formatter, src/sync/accountTimezone.ts
// (cache-then-live-fetch resolution), and src/sync/dailyLogs.ts (the two
// mutators that consume it). Uses real IndexedDB (fake-indexeddb) for the
// bundle cache, exactly like production — not a mock of getIdb/bundleCache.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userLocalDateString } from "@/domain/time/localDate";
import { getAccountTimezone } from "@/sync/accountTimezone";
import { getCachedBundle, setCachedBundle } from "@/sync/bundleCache";
import {
  logBodyweightToday,
  logRecoveryToday,
  UnknownAccountTimezoneError,
} from "@/sync/dailyLogs";
import { listPendingOps } from "@/sync/outbox";
import type { TodayBundleDto } from "@/sync/types";

vi.mock("@/sync/flush", () => ({
  flushOutbox: vi.fn().mockResolvedValue({ attempted: 0, applied: 0, rejected: 0 }),
}));

function makeBundle(timezone: string): TodayBundleDto {
  return {
    today: { kind: "no_schedule" },
    activeSession: null,
    generatedAt: new Date().toISOString(),
    timezone,
  };
}

// A fixed instant where two real, far-apart IANA zones genuinely disagree
// on the calendar day — the exact shape of B-3's original defect. Ljubljana
// (CEST, UTC+2 in June) reads this as 2026-06-15 23:50 -> "2026-06-15";
// Kiritimati (UTC+14, no DST) reads the SAME instant as 2026-06-16 11:50 ->
// "2026-06-16".
const DIVERGENT_INSTANT = "2026-06-15T21:50:00.000Z";
const LJUBLJANA_DAY = "2026-06-15";
const KIRITIMATI_DAY = "2026-06-16";

describe("userLocalDateString (src/domain/time/localDate.ts)", () => {
  it("resolves the correct calendar day per timezone at a UTC-instant that straddles midnight in both", () => {
    const now = new Date(DIVERGENT_INSTANT);
    expect(userLocalDateString("Europe/Ljubljana", now)).toBe(LJUBLJANA_DAY);
    expect(userLocalDateString("Pacific/Kiritimati", now)).toBe(KIRITIMATI_DAY);
  });

  it("resolves a plain UTC instant at 22:30 to the next UTC day only for a zone ahead of UTC", () => {
    const now = new Date("2026-03-10T22:30:00.000Z");
    expect(userLocalDateString("UTC", now)).toBe("2026-03-10");
    expect(userLocalDateString("Pacific/Kiritimati", now)).toBe("2026-03-11");
  });
});

describe("getAccountTimezone (src/sync/accountTimezone.ts)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the cached bundle's timezone without any network call", async () => {
    await setCachedBundle(makeBundle("Europe/Ljubljana"));
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(getAccountTimezone()).resolves.toBe("Europe/Ljubljana");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to a live fetch and caches the result when nothing is cached yet", async () => {
    const db = await import("@/sync/db");
    await (await db.getIdb()).clear("bundleCache");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeBundle("America/New_York"),
    }) as unknown as typeof fetch;

    await expect(getAccountTimezone()).resolves.toBe("America/New_York");
    const cached = await getCachedBundle();
    expect(cached?.bundle.timezone).toBe("America/New_York");
  });

  it("returns null — never a guess — when nothing is cached and the live fetch fails", async () => {
    const db = await import("@/sync/db");
    await (await db.getIdb()).clear("bundleCache");

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    await expect(getAccountTimezone()).resolves.toBeNull();
  });

  // phase-8-remediation-verification.md §4/§12 (B-3, item 1) — the exact
  // upgrade-path shape: a `bundleCache` record written by any
  // pre-remediation build has no `timezone` field at all. `setCachedBundle`
  // always writes a well-formed `TodayBundleDto`, so this bypasses it and
  // writes the raw legacy shape directly, the same way a previous build's
  // `setCachedBundle` call actually would have.
  async function seedLegacyCachedBundle(shape: "missing" | "empty"): Promise<void> {
    const db = await import("@/sync/db");
    const idb = await db.getIdb();
    const legacyBundle: Record<string, unknown> = {
      today: { kind: "no_schedule" },
      activeSession: null,
      generatedAt: new Date().toISOString(),
    };
    if (shape === "empty") legacyBundle.timezone = "";
    await idb.put(
      "bundleCache",
      { bundle: legacyBundle, fetchedAt: new Date().toISOString() } as unknown as {
        bundle: TodayBundleDto;
        fetchedAt: string;
      },
      "current",
    );
  }

  it("treats a legacy cached bundle with no `timezone` field as invalid and falls through to a live fetch, never returning `undefined`", async () => {
    await seedLegacyCachedBundle("missing");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeBundle("America/New_York"),
    }) as unknown as typeof fetch;

    const result = await getAccountTimezone();
    expect(result).toBe("America/New_York");
    expect(result).not.toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("treats a legacy cached bundle with an empty-string `timezone` the same way — falls through, never returns it", async () => {
    await seedLegacyCachedBundle("empty");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeBundle("Pacific/Kiritimati"),
    }) as unknown as typeof fetch;

    await expect(getAccountTimezone()).resolves.toBe("Pacific/Kiritimati");
  });

  it("returns null — never `undefined`, never a device-zone guess — when both the cached bundle and the live-fetch response are legacy/invalid", async () => {
    await seedLegacyCachedBundle("missing");
    // Simulates a legacy response replayed from the service worker's own
    // `today-bundle` runtime cache: the fetch resolves ok with a body that
    // has no `timezone` field, exactly like a pre-remediation server would
    // have served.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        today: { kind: "no_schedule" },
        activeSession: null,
        generatedAt: new Date().toISOString(),
      }),
    }) as unknown as typeof fetch;

    const result = await getAccountTimezone();
    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });

  it("returns null when the live-fetch response has an empty-string `timezone`", async () => {
    await seedLegacyCachedBundle("empty");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        today: { kind: "no_schedule" },
        activeSession: null,
        generatedAt: new Date().toISOString(),
        timezone: "",
      }),
    }) as unknown as typeof fetch;

    await expect(getAccountTimezone()).resolves.toBeNull();
  });
});

describe("logBodyweightToday / logRecoveryToday (src/sync/dailyLogs.ts)", () => {
  beforeEach(() => {
    // Only `Date` is faked — fake-indexeddb schedules its own internal task
    // queue via `setImmediate`, which must keep running on the real event
    // loop or every IndexedDB operation below would hang forever waiting on
    // a virtual timer nothing ever advances.
    vi.useFakeTimers({ now: new Date(DIVERGENT_INSTANT), toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("day-keys a bodyweight log to the cached ACCOUNT timezone's day, not any device notion of today", async () => {
    await setCachedBundle(makeBundle("Europe/Ljubljana"));

    const { date } = await logBodyweightToday({ weightKg: 82 });
    expect(date).toBe(LJUBLJANA_DAY);
    expect(date).not.toBe(KIRITIMATI_DAY);

    const pending = await listPendingOps();
    const op = pending.find((p) => p.entity === "bodyweightEntry" && p.payload.date === date);
    expect(op).toBeTruthy();
  });

  it("day-keys a recovery log to the cached ACCOUNT timezone's day", async () => {
    await setCachedBundle(makeBundle("Pacific/Kiritimati"));

    const { date } = await logRecoveryToday({ readiness: 4 });
    expect(date).toBe(KIRITIMATI_DAY);

    const pending = await listPendingOps();
    const op = pending.find((p) => p.entity === "recoveryEntry" && p.payload.date === date);
    expect(op).toBeTruthy();
  });

  it("throws UnknownAccountTimezoneError instead of guessing a day, when no timezone is resolvable", async () => {
    const db = await import("@/sync/db");
    await (await db.getIdb()).clear("bundleCache");
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    const before = (await listPendingOps()).length;
    await expect(logBodyweightToday({ weightKg: 80 })).rejects.toBeInstanceOf(
      UnknownAccountTimezoneError,
    );
    await expect(logRecoveryToday({ readiness: 3 })).rejects.toBeInstanceOf(
      UnknownAccountTimezoneError,
    );
    // Neither call reached enqueueOp — nothing was queued to sync under a
    // guessed day.
    expect((await listPendingOps()).length).toBe(before);
  });

  // phase-8-remediation-verification.md §4/§12 (B-3, item 1) — the real
  // upgrade path: an already-installed pre-remediation build left a
  // `bundleCache` record with no `timezone` field, and this device is
  // offline (no live fetch to self-heal from). Before this fix, `undefined`
  // slipped past `resolveTodayDate`'s `=== null` guard into
  // `Intl.DateTimeFormat`, which silently resolved to the device's own
  // zone (KIRITIMATI_DAY here) instead of throwing — exactly the write that
  // destroyed a real stored entry in the independent verification pass.
  it("throws UnknownAccountTimezoneError — never resolves to the device zone — for the exact pre-remediation legacy bundleCache shape (no `timezone` field), offline", async () => {
    const db = await import("@/sync/db");
    const idb = await db.getIdb();
    await idb.put(
      "bundleCache",
      {
        bundle: {
          today: { kind: "no_schedule" },
          activeSession: null,
          generatedAt: new Date().toISOString(),
        } as unknown as TodayBundleDto,
        fetchedAt: new Date().toISOString(),
      },
      "current",
    );
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    const before = (await listPendingOps()).length;
    await expect(
      logRecoveryToday({ readiness: 5, sleepQuality: 5, soreness: 5 }),
    ).rejects.toBeInstanceOf(UnknownAccountTimezoneError);
    await expect(logBodyweightToday({ weightKg: 80 })).rejects.toBeInstanceOf(
      UnknownAccountTimezoneError,
    );
    // Nothing was enqueued under a guessed day — neither call reached
    // enqueueOp (other tests in this file share the same fake-indexeddb
    // outbox store, so a count comparison, not a content scan, is what's
    // actually reliable here).
    expect((await listPendingOps()).length).toBe(before);
  });
});
