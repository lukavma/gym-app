# Phase 6 — Targeted Remediation: M-1, M-2, M-3

Status: remediation complete, locally verified. Not committed, not pushed, not deployed, no production access. Responds exactly to the three MEDIUM findings in `docs/reviews/phase-6-review.md` (unmodified — confirmed at the end of this document). The eleven LOW findings in that review are intentionally untouched, per the remediation task's explicit scope.

The reviewer's own verdict on the underlying code was unambiguous: *"Nothing I found is a production correctness defect."* All three findings are about the phase's **record and safety net**, not its behavior — so this pass changes documentation and test coverage only. No file under `src/` was modified in the final tree (the one exception — a deliberate, temporary, fully-reverted bypass of the advisory lock for the M-3 negative control — is documented in full below and confirmed absent from the final diff).

---

## M-1 — Implementation report brought up to date

**Exact change:** appended a dated "Post-review remediation (2026-08-24)" section to `docs/reviews/phase-6-implementation.md`, after the original 14:38 body (left untouched, as history) and before the Verdict. The addendum documents, for the first time:

1. The per-user `pg_advisory_xact_lock` in `upsertVolumeLandmark` (`src/server/volume/service.ts:271-276`) — its exact mechanism (two 32-bit signed ints derived from the final 64 bits of the user's UUID via `userVolumeLockKeys`), its transaction scope (first statement in the transaction; held until commit/rollback), why active-preset resolution deliberately happens *after* acquiring the lock (so a second concurrent caller observes the first caller's already-created duplicate instead of racing against stale pre-lock state), and why it is load-bearing rather than defensive (the read-then-write "is this still the builtin?" → "insert a duplicate" sequence is not atomic without it — proven with a real negative control in M-3 below).
2. RP General attachment inside `setupAccount` (`src/server/auth/service.ts:56-77`) — all three lifecycle cases: an account created after deploy-time seeding gets the builtin attached immediately at row-creation time (the real production order, and the case that was previously unhandled); an account created before any seed has run falls back to the seed's own null-only `UPDATE ... WHERE default_volume_preset_id IS NULL`; an already-set default is never reachable for overwrite by this path (`setupAccount` only ever fires once, before any default could exist) and the general "never overwrite a non-null default" invariant is enforced by the seed's own guard, independently tested.
3. Per-band provenance and note rendering in `MuscleRow.tsx` — the `Coaching heuristic ·` prefix on every rendered reference-band summary (not just the page-level caption), and per-row rendering of stored, deduplicated `note` text (the mechanism that actually surfaces the seeded Rear/Side-Delts combined-row caveat to the user).
4. The integration and E2E coverage added alongside those three changes: the new `auth.integration.test.ts` case, and the `volume.spec.ts` E2E assertions for the per-band label and the caveat note text.
5. Current test counts for the final tree (see "Test counts" below).

The file list, judgment calls (a new §7 on why the M-3 negative control is deliberately not a permanent test), verification section, top-of-file status line, and final verdict were all updated. The verdict is **READY FOR TARGETED REMEDIATION VERIFICATION**, matching this document.

`docs/reviews/phase-6-review.md` itself was not modified — confirmed in "Constraints confirmed" below.

---

## M-2 — `volume-model.md` §5 rule 6 corrected

**Exact change**, one clause, in `docs/architecture/volume-model.md` (rule 6 of §5, "Evidence framing rules for anything volume-related — Binding on UI copy and future features"):

Before:
> …the Unclassified Back term is shown whenever it is non-zero so the Back total is always explained by its parts.

After:
> …the Unclassified Back term is shown whenever it is non-zero so the **effective** Back total is always explained by its parts (effective Back = effective Lats + effective Upper Back + Unclassified Back — architecture-review M-3). Raw Back is a separately deduplicated per-set count and is not additive over raw Lats + raw Upper Back; the identity above holds for the effective series only.

This closes the gap the pre-Phase-6 architecture review's own M-3 named (`docs/reviews/pre-phase-6-muscle-taxonomy-architecture-review.md:76`): five passages needed the "effective series only" qualifier — `volume-model.md` §2, `ADR-010`'s "Aggregation" section, `domain-model.md` §8, `implementation-plan.md`'s Phase 6 build bullet, and `volume-model.md` §5 rule 6. The first four were corrected during the original Phase 6 implementation pass; §5 rule 6 — arguably the more load-bearing of the two `volume-model.md` passages, since §5 is the document's own binding-on-future-work section — was missed. The wording and structure of the fix matches the four earlier corrections exactly (same "effective series only" framing, same placement immediately adjacent to the original claim), so this is one clause added to an existing sentence, not a rewrite.

**No aggregation behavior changed.** The shipped UI copy (`src/ui/volume/VolumeScreen.tsx`) already states this correctly — the review confirmed it verbatim from the rendered DOM (§7.2 of the review). Only the binding architecture document's own text was stale.

---

## M-3 — Real-PostgreSQL concurrency coverage

### Why this needed a real-database test, not a better PGlite fixture

PGlite is a single in-process WASM Postgres backend. The reviewer measured this directly: `pg_backend_pid()` returns the same value for every query issued against a PGlite instance, `pg_stat_activity` has exactly one row, and two `db.transaction()` calls fired concurrently against it execute strictly in sequence — there is no interleaving for `pg_advisory_xact_lock` to prevent, so no PGlite fixture, however constructed, can distinguish "the lock works" from "the lock doesn't exist." The existing shipped test (`tests/integration/volumeLandmarks.integration.test.ts`, formerly named `"serializes concurrent first edits so one copy retains both values"`) passes identically with the lock physically removed from `upsertVolumeLandmark` — confirmed independently in this remediation pass, not just cited from the review.

This is not a new problem class for this codebase: `tests/integration/reconcileContributionsConcurrency.integration.test.ts` documents and solves the identical PGlite limitation for the Muscle Taxonomy v2 Release 2 reconciliation lock, via a real `node-postgres` `Pool` against a dedicated disposable database gated on its own opt-in environment variable. This remediation follows that precedent exactly rather than inventing a new pattern.

### The new fixture

`tests/integration/volumeLandmarksConcurrency.integration.test.ts`, gated on `VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL` — **deliberately not `DATABASE_URL`**, for the same two reasons the precedent establishes: CI sets `DATABASE_URL` to an unreachable placeholder (`postgresql://ci:ci@localhost:5432/ci`), so a plain "is it set" guard would not skip in CI and would red the quality gate; and this file's counter assertions ("exactly one user-owned preset exists") are only meaningful against a database dedicated to this one test, which the shared dev database must never be.

```
$env:VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/<disposable-db>"
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarksConcurrency.integration.test.ts
```

Unset (CI, and any ordinary `pnpm test:integration` run) → the whole `describe` block is skipped via `describe.skipIf(!CONCURRENCY_DATABASE_URL)`.

**Safety checks, mirroring the precedent exactly:**
- `beforeAll` throws (fails loudly, not flakily, not silently-wrong) if the target database already has any `users` rows or any non-builtin `volume_presets` rows — a database dedicated to this file starts with neither.
- A real `pg.Pool` (`max: 16`), not a single `Client` — `upsertVolumeLandmark` opens its own `db.transaction()` per call, so eight concurrent calls against one `Pool`-backed `db` genuinely check out (up to) eight separate PostgreSQL connections.
- `afterAll` deletes only this file's own rows (the user-owned preset via `volumePresets.userId`, cascading to its landmark rows, then the user row) and calls `pool.end()` in every case — verified live (see "Cleanup confirmation" below): the builtin RP General row is never touched.

**Forced interleaving.** Eight concurrent `upsertVolumeLandmark` calls, each editing a distinct `(muscleGroupId, key)` pair (`chest/mev`, `quads/mev`, `biceps/mev`, `triceps/mav`, `calves/mrv`, `abs/mv`, `hamstrings/mev`, `glutes/mav`) so that "every distinct edited value survives" is a meaningful, per-value assertion rather than eight writers racing to set the same cell. All eight are fired via `Promise.allSettled` against separate pool connections — genuine concurrent dispatch, not a sleep- or timing-based simulation. The lock's own blocking semantics (`pg_advisory_xact_lock` blocks the caller until the lock is free, held for the whole transaction) are what make the *result* deterministic regardless of the exact OS/network interleaving that actually occurs — asserting "the correct outcome holds no matter how these eight genuinely-concurrent requests interleave" is the correctness property the lock exists to provide, and is a stronger claim than pinning one specific interleaving and asserting only that.

The test asserts, in one run: all eight resolve without rejection; exactly one user-owned preset exists afterward (no orphans); that preset carries the builtin's full 52 rows plus all eight edited values, each with its submitted value intact; the builtin RP General preset row and its 52 landmark rows are byte-identical before and after (deep-equality, not just a row count); the user's `default_volume_preset_id` points at the one surviving copy; and a subsequent `getWeeklyVolumeReport` read exposes every one of the eight edits.

### Proving the test can actually detect the defect (negative control)

Per the remediation task's explicit requirement, the test's power to fail was demonstrated before trusting it to pass — not assumed.

**Procedure**, performed once, live, against a freshly migrated disposable database (`gymapp_volconc`), and fully reverted afterward:

1. `src/server/volume/service.ts`'s two lock lines were commented out in place (the `userVolumeLockKeys` call and the `pg_advisory_xact_lock` execute), leaving every other line — including active-preset resolution, the duplicate-insert path, and the repointing logic — untouched.
2. The disposable database was reset to empty-of-users (`DELETE FROM volume_landmarks; DELETE FROM volume_presets; DELETE FROM users;` — the builtin RP General row and its 52 landmarks are recreated by the test's own `beforeAll` seeding on the next run).
3. The new test was run against this lock-bypassed code:

```
$ VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL=postgres://gymapp:gymapp@localhost:5432/gymapp_volconc \
  pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarksConcurrency.integration.test.ts

 ❯ tests/integration/volumeLandmarksConcurrency.integration.test.ts (1 test | 1 failed)
   × upsertVolumeLandmark concurrency (real PostgreSQL) > resolves all concurrent first edits successfully, ...
     → expected [ { …(11) }, { …(11) }, …(5) ] to have a length of 1 but got 7

 Test Files  1 failed (1)
      Tests  1 failed (1)
```

**Result: the test fails, and fails on exactly the assertion the finding is about** — `ownedPresets` had length **7**, not 1: eight concurrent first-edit requests, with no lock serializing them, produced **seven separate orphan `volume_presets` rows** instead of one shared copy (one pair of the eight apparently landed close enough in real time to converge naturally; the other seven each independently observed "still builtin" and created their own duplicate — consistent with, if not numerically identical to, the reviewer's own independently-reproduced 8-orphan/7-lost-values result in `docs/reviews/phase-6-review.md` §5.5; exact counts under a genuine race are not required to match run-to-run, only the *defect class* — duplicate presets, lost edits — needs to reproduce, and it did). The remainder of the test's assertions (value survival, builtin immutability, default-slot repointing) never ran, because the length assertion is the second one in the file and failed first — the defect is caught at the earliest possible point.

**Restoration:** the two commented-out lines were restored exactly (`git diff`-equivalent confirmed byte-identical to the pre-negative-control content — the file is untracked, so this was verified by direct comparison against the content captured before the edit, not `git diff`). The disposable database was reset to empty-of-users again, and the test was re-run:

```
$ VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL=postgres://gymapp:gymapp@localhost:5432/gymapp_volconc \
  pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarksConcurrency.integration.test.ts

 ✓ tests/integration/volumeLandmarksConcurrency.integration.test.ts (1 test) 178ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Repeated twice more (fresh empty-of-users state each time) for confidence against non-determinism in either direction — **3/3 passed** with the lock present, matching the single failing run with it absent. `gymapp_volconc` was dropped after this phase of verification.

**The negative control itself is not part of the shipped tree.** Per the remediation task's own instruction ("outside the final tree"), bypassing production code to make a test fail on purpose is not something that belongs in the repository — a test that only proves its own power by disabling the feature it protects, left in place, is itself a latent footgun (someone could "fix" a false-red CI run by leaving the bypass in). The shipped file tests the current, correct, lock-present code; this section is the permanent record of the one-time proof that it would have caught the regression.

### The existing PGlite test — reframed, not removed

`tests/integration/volumeLandmarks.integration.test.ts`'s pre-existing case was renamed from `"serializes concurrent first edits so one copy retains both values"` to `"converges sequential first-edit calls on one copy (not a concurrency/lock proof — see volumeLandmarksConcurrency.integration.test.ts)"`, with an explanatory comment (PGlite's single-backend behavior, confirmed directly, and a pointer to the real coverage). Its assertions are unchanged — it still legitimately proves that two "first edit of the builtin" calls converge on one copy rather than each independently duplicating, which is a real, worth-keeping property of the duplicate-on-first-edit logic under sequential retry; it simply no longer claims to be a concurrency or lock proof, which it never was.

---

## Why no production behavior needed redesign

The reviewer's finding was explicit and is reaffirmed here independently: the lock, the `setupAccount` attachment, and the `MuscleRow` provenance rendering are all correct as shipped — verified by the reviewer against real PostgreSQL with an adversarial negative control (§5.5 of the review), and reverified independently in this pass with an equivalent negative control (above). Redesigning a mechanism the review already proved correct, in response to a finding about documentation and test coverage, would be scope creep the remediation task explicitly forbids ("Do not change the production locking mechanism unless the new test reveals a real defect… Do not redesign or replace the existing advisory lock, fresh-account initialization, or provenance rendering"). The new test did not reveal a defect — it reproduced, on demand, the exact defect the lock was already known to prevent, then confirmed the lock prevents it.

---

## Test counts

**Ordinary run** (no opt-in concurrency variables set — this is what CI and any developer running `pnpm test:integration` sees):

| Suite | Result |
|---|---|
| `pnpm test:unit` | **408 passed** (32 files) — unchanged, no unit test touched |
| `pnpm test:integration` | **208 passed, 5 skipped** (16 passed files, 2 skipped files, 18 total) |

The skip count moved from the review's observed 4 to 5: `reconcileContributionsConcurrency.integration.test.ts` (4 tests, pre-existing) plus the new `volumeLandmarksConcurrency.integration.test.ts` (1 test), both correctly `skipIf`-skipped without their dedicated opt-in variables.

**Opt-in run**, `VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL` set against a freshly migrated disposable database:

| Suite | Result |
|---|---|
| `tests/integration/volumeLandmarksConcurrency.integration.test.ts` | **1 passed** |

Run three times against a freshly-reset database for confidence (see negative-control section) — 3/3 passed each time.

**Specifically requested command:**

```
$ pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarks.integration.test.ts
 ✓ tests/integration/volumeLandmarks.integration.test.ts (10 tests) 5.4-7.0s
   ✓ ... converges sequential first-edit calls on one copy (not a concurrency/lock proof — see volumeLandmarksConcurrency.integration.test.ts) ...
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Full verification results

| Command | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | clean (after `pnpm format` on the one newly-added test file — auto-formatting only, no logic change) |
| `pnpm build` | succeeds; `/volume`, `/api/volume`, `/api/volume/landmarks` all still present in the route manifest |
| `pnpm test:unit` | 408/408 passed |
| `pnpm test:integration` (ordinary) | 208 passed, 5 skipped |
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarks.integration.test.ts` | 10/10 passed |
| `VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL=... pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarksConcurrency.integration.test.ts` | 1/1 passed (×3 runs) |

Full Playwright was not rerun, per the remediation task's own instruction — this pass changes documentation and test coverage only, not browser-observable behavior. No production or UI code path was touched (the one temporary exception — the negative control — was fully reverted and independently reverified, above), so that assumption held and did not need reassessing.

## Disposable-database cleanup confirmation

Two disposable databases were used and dropped:

- `gymapp_volconc` — created, migrated from empty, used for the positive run, the negative-control run (lock bypassed), the restoration re-verification (×3), then dropped: `DROP DATABASE gymapp_volconc;` — confirmed via `SELECT datname FROM pg_database WHERE datname LIKE 'gymapp%'` no longer listing it.
- `gymapp_p6remediation` — created fresh, migrated from empty, used for the single final recorded run (below), then dropped the same way.

Final recorded run, on the fully clean `gymapp_p6remediation`, migrated from empty:

```
$ pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarksConcurrency.integration.test.ts
 ✓ tests/integration/volumeLandmarksConcurrency.integration.test.ts (1 test) 180ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Post-test live inspection of `gymapp_p6remediation` (before dropping it), confirming `afterAll` cleanup left exactly the expected state:

```
 user_count
------------
          0
(1 row)

 preset_count
--------------
            1
(1 row)

 is_builtin | count
------------+-------
 t          |     1
(1 row)
```

Zero users, exactly one preset remaining — the untouched builtin RP General row. No orphan preset, no leftover test user.

The shared local development database (`gymapp`) was not written to by any part of this remediation.

## Constraints confirmed

- **LOW findings intentionally untouched.** All eleven LOW findings in `docs/reviews/phase-6-review.md` (L-1 through L-11) — timezone conversion, landmark numeric bounds, preset-description rendering, tap-target sizing, five-card editor duplication, seed timestamp behavior, RP lookup by name, sum-preservation planning text/deviation tracking, `null+` rendering, validation error wording, exercise-catalog setup behavior — are unmodified. No file touched by this remediation intersects any of them.
- **`docs/reviews/phase-6-review.md` was not modified.** Confirmed both by not editing it at any point in this session and by its absence from the file list below.
- **User-owned files untouched:** `CLAUDE.md`, `HANDOFF.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/` — none appear in this remediation's file list.
- **No commit, push, deploy, reset, clean, or production access** at any point.
- **One unrelated, externally-made change observed and left untouched:** `docs/input/product-ideas.md` went from empty to containing one backlog entry ("PI-001 — Suspicious set-entry confirmation") during this session, made by something other than this remediation (never opened, read, or referenced by any tool call in this session's history). Not part of Phase 6, not touched, not reverted — flagged here for transparency per the instruction to record `git status --porcelain` before and after and account for every difference.

## Files changed

- `tests/integration/volumeLandmarksConcurrency.integration.test.ts` — new (M-3).
- `tests/integration/volumeLandmarks.integration.test.ts` — one test renamed and reframed with an explanatory comment; assertions unchanged (M-3).
- `docs/architecture/volume-model.md` — §5 rule 6, one clause added (M-2).
- `docs/reviews/phase-6-implementation.md` — dated addendum appended; status line and verdict updated (M-1).
- `docs/reviews/phase-6-remediation.md` — this document, new.

`src/server/volume/service.ts` is **not** in this list — its content in the final tree is byte-identical to its content before this remediation session began (the negative control's temporary edit was fully reverted; confirmed by direct content comparison and by a clean `pnpm typecheck`/`pnpm lint` pass immediately after restoration).

`git status --porcelain` recorded at the start of this remediation session and again at the end are identical apart from: the five files above, plus the one unrelated external change to `docs/input/product-ideas.md` noted above.

## Verdict

**READY FOR TARGETED REMEDIATION VERIFICATION.**
