// phase-8-review.md MEDIUM-4 — before this fix, getIdb() (src/sync/db.ts)
// had no `blocked`/`blocking` handlers: a second, already-open connection on
// an older schema version made a new connection's upgrade transaction block
// forever with no error, no timeout, nothing observable — every IndexedDB
// read/write via getIdb() just silently never resolved. This drives the
// REAL exported getIdb() against real (fake-indexeddb-backed, not mocked)
// multi-connection version-conflict behavior, proving both halves of the
// fix with two genuinely independent connections each way — not just that
// the callbacks are wired, but that they produce the required observable
// effects.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DB_NAME = "gym-app";
// db.ts's real DB_VERSION isn't exported (no test-only surface needed for
// production code); it has been 2 since Phase 8 and only ever moves up, so
// any version below it (1) is a valid "genuinely older connection" for
// these tests regardless of the current exact value.
const OLDER_VERSION = 1;
const NEWER_VERSION = 999;

beforeEach(() => {
  // Fresh IndexedDB AND a fresh module graph per test — db.ts memoizes its
  // connection at module scope (getIdb()'s own `dbPromise`), matching
  // production's real single-connection-per-tab behavior, which would
  // otherwise leak across these two tests: a database version, once
  // upgraded, can never be reopened at a lower version.
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
});

describe("IndexedDB upgrade blocked/blocking (phase-8-review.md MEDIUM-4)", () => {
  it("v1 (older, already open) blocks v2's (getIdb()'s) upgrade — reports blocked, then closing v1 lets it proceed", async () => {
    // Both dynamically imported in the same post-reset module graph, so
    // db.ts's own internal `import { useIdbUpgradeStore }` resolves to this
    // exact instance rather than one from a stale, pre-reset graph.
    const { getIdb } = await import("@/sync/db");
    const { useIdbUpgradeStore } = await import("@/sync/idbUpgradeStore");

    // v1 — an older connection, already open, that does NOT close itself on
    // `blocking` (deliberately: this is what makes v2's `blocked` state
    // reliably observable rather than racing a near-instant auto-close).
    const v1 = await openDB(DB_NAME, OLDER_VERSION, { upgrade() {} });

    expect(useIdbUpgradeStore.getState().blocked).toBe(false);

    // v2 — this device's real connection, via the actual production
    // getIdb(), which wants the current (higher) DB_VERSION and is blocked
    // by v1 still being open.
    const v2Promise = getIdb();

    await vi.waitFor(
      () => {
        expect(useIdbUpgradeStore.getState().blocked).toBe(true);
      },
      { timeout: 2000 },
    );

    // Closing v1 is what unblocks v2's upgrade — proving "closing v1 allows
    // the upgrade ... to continue," not just that v2's request eventually
    // gives up or times out.
    v1.close();

    const v2 = await v2Promise;
    expect(v2).toBeTruthy();
    await vi.waitFor(() => {
      expect(useIdbUpgradeStore.getState().blocked).toBe(false);
    });
  });

  it("getIdb()'s own connection, when it blocks a newer version elsewhere, closes itself so that upgrade — and this device's queued outbox work — can proceed", async () => {
    const { getIdb } = await import("@/sync/db");

    // This device's connection, already open and idle (representing normal
    // steady-state — queued outbox ops already committed to IndexedDB,
    // nothing pending on this specific call).
    const v1 = await getIdb();

    let upgraded = false;
    // A newer version opening elsewhere (another tab that already reloaded
    // after an app update, or — for this test — simply a second real
    // client at a higher version). Without `blocking` closing v1, this
    // would hang forever exactly like the review's finding describes.
    const v2 = await openDB(DB_NAME, NEWER_VERSION, {
      upgrade() {
        upgraded = true;
      },
    });

    expect(upgraded).toBe(true);
    v2.close();

    // v1 must have actually closed itself (not merely fired the callback)
    // — attempting a transaction on a closed connection throws
    // synchronously. This device's next reload/reopen (the standard
    // SW-update-reload flow already in place for a newer app version) is
    // what would pick up the new schema from there; the point proven here
    // is that v1 didn't sit open forever silently blocking v2 the way the
    // review's finding described.
    expect(() => v1.transaction("outbox", "readonly")).toThrow();
  });
});
