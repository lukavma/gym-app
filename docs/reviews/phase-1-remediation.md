# Phase 1 Remediation — H1, M1, M2, L1

Date: 2026-08-16
Remediates: `docs/reviews/phase-1-review.md` (reviewed commit `f5b9b45`)

> **Superseded in part.** Independent verification
> ([phase-1-remediation-verification.md](./phase-1-remediation-verification.md))
> found H1 only **partially** fixed: the seed could still abort on a name
> collision and leave the deploy pipeline permanently blocked (MED-1), and this
> document's claim that the one-time bootstrap resurrection was unavoidable was
> wrong (LOW-1). Both are fixed in
> [phase-1-remediation-2.md](./phase-1-remediation-2.md). The H1 sections below
> have been corrected to describe the final behavior; M1, M2, and L1 stand as
> written and were verified fixed.

## Summary

Fixed all findings the review gated on before Phase 2 (H1, M1) plus the two
Phase-1-scoped follow-ups it flagged as easy to fold in (M2, L1). L2–L4 and
all other observations are deferred as the review itself recommended —
untouched.

## H1 — Production seed safety

**Root cause:** the catalog seed had no memory of what it had already
applied. It re-derived the full catalog every run and relied on
`onConflictDoNothing({ target: exercises.id })` to make re-inserts inert —
but that only works while the row still exists. A hard-deleted seeded
exercise leaves no row to conflict on, so it silently came back; and because
the contributions insert ran unconditionally for the whole catalog (not just
newly-inserted rows), any contribution a user had removed came back too.

**Fix:**

- New table `exercise_catalog_seed_log` (migration
  [0002_add_exercise_catalog_seed_log.sql](../../drizzle/0002_add_exercise_catalog_seed_log.sql),
  schema in [exerciseCatalogSeedLog.ts](../../src/db/schema/exerciseCatalogSeedLog.ts)):
  `(user_id, slug)` primary key, no FK to `exercises.id` by design — it must
  outlive the row it seeded, which is the whole point.
- [seedExerciseCatalogForUser](../../src/db/seed/exercises.ts) now:
  1. Reads which slugs are already logged for the user.
  2. Bootstraps the ledger for a user seeded before it existed — empty
     ledger plus at least one `is_seeded` row means the whole catalog was
     already applied, so every slug is recorded and nothing is inserted
     (added in remediation 2; see below).
  3. Filters the catalog down to slugs never applied before (`newItems`) —
     if none, it's a no-op.
  4. Inserts only `newItems`, with `.returning()` telling it which rows were
     genuinely inserted this run. The insert uses an **arbiter-less**
     `onConflictDoNothing()` so that a slug whose row is gone but whose name
     is held by an active exercise is skipped rather than aborting the
     transaction (corrected in remediation 2; this was `{ target:
     exercises.id }`, which is what MED-1 exploited).
  5. Inserts contributions only for exercises actually inserted this run.
  6. Logs every slug in `newItems` as applied, whether it was freshly
     inserted, already existed from before the ledger, or was skipped on
     conflict — this is what makes a hard-deleted seeded exercise stay gone:
     once logged, a slug is never reconsidered, regardless of whether its
     row still exists.
  7. All of the above runs inside one `db.transaction`, so a mid-run failure
     can't leave an exercise row inserted without its log entry.
- A slug already logged is **skipped entirely** — not just contribution-safe
  but also untouched at the row level, so renames, contribution-weight
  edits, and equipment/loadStepKg edits on seeded exercises all survive
  reseeding unconditionally.

**Bootstrap behavior (corrected).** This document originally disclosed that a
seeded exercise hard-deleted before the ledger's first deploy would be
recreated exactly once, and claimed that was unavoidable without production
audit history or manual data edits. That claim was wrong. `exercises.is_seeded`
is written only by this seed, and the pre-ledger seed applied the entire
catalog in one atomic statement — so a single surviving `is_seeded` row proves
the whole catalog was already applied to that user, and the ledger can be
bootstrapped from persisted state alone. The seed now does exactly that:
**pre-ledger hard deletes are no longer resurrected at all**, not even once.
See [phase-1-remediation-2.md](./phase-1-remediation-2.md) for the derivation,
the tests, and the two narrow states that remain ambiguous (a user who deleted
*every* seeded row, and a hypothetical release that grows the catalog before
migration 0002 first deploys).

**Tests added** (`tests/integration/seed.integration.test.ts`):

| # | Scenario | Test |
|---|---|---|
| 1 | Removed contribution stays removed | `reseeding does not resurrect a muscle contribution the user removed (Phase 1 review H1)` |
| 2 | Hard-deleted seeded exercise stays deleted | `reseeding does not resurrect a hard-deleted seeded exercise (Phase 1 review H1)` |
| 3 | Custom exercise reusing a freed seeded name doesn't break reseeding | `lets a custom exercise reuse a hard-deleted seeded name without breaking reseeding (Phase 1 review H1)` |
| 4 | Repeated normal seed is idempotent | pre-existing `reseeding the exercise catalog is idempotent (no duplicate rows)` (still passes unmodified) |
| 5 | User-edited seeded data isn't reverted | pre-existing rename test + new `reseeding never reverts a user-edited contribution weight (Phase 1 review H1)` |

Verification established that only rows 1 and 2 actually fail against the
pre-fix seed; rows 4 and 5 pass either way (regression guards, not proof), and
row 3 seeds first, so the slug is already logged and it never reaches the
collision it appears to cover — which is how MED-1 survived. Six further tests
added in remediation 2 close that gap, three of them verified to fail against
the pre-fix implementation.

## M1 — Unarchive name collision

**Fix:** [setExerciseArchived](../../src/server/exercises/service.ts) now
wraps its update in a try/catch identical to `createExercise`/`updateExercise`
— a `23505` unique-violation maps to `ExerciseNameConflictError`. The archive
route ([archive/route.ts](../../src/app/api/exercises/[id]/archive/route.ts))
catches that error and returns `409 { error: "name_conflict" }` instead of
letting it fall through to an unhandled 500.

**Test added** (`tests/integration/exercises.integration.test.ts`):
`throws ExerciseNameConflictError (not a raw DB error) when unarchiving into
an active name collision` — archives an exercise, creates a new active one
with the same freed name, then unarchives the original and asserts the
domain error (not a raw Postgres error) is thrown.

## M2 — loadStepKg UI

**Fix:** [ExerciseForm.tsx](../../src/ui/exercises/ExerciseForm.tsx) gained a
"Load step (kg)" number input between Laterality and the contribution
editor, following the same controlled-input pattern already used for
contribution weight (empty string = "use the default," here the
equipment-derived default rather than a role default). Edit mode populates
it from the fetched exercise's resolved `loadStepKg`; create mode leaves it
blank so the equipment default still applies. No domain, API, or persistence
change — purely wiring the UI to the existing `loadStepKg` field already
accepted by `createExerciseSchema`/`updateExerciseSchema`.

**Proof:** no dedicated UI test exists in this codebase (Phase 1's Playwright
e2e is deferred per the original review — no Docker in this environment
either); the field reuses `updateExerciseSchema`/`createExerciseSchema`,
which the L1 tests below exercise directly. Manually traced: the field reads
`ex.loadStepKg` on load and sends `Number(loadStepKg)` (or `undefined` when
blank) in the POST/PATCH payload, matching the route's existing
`createExerciseSchema`/`updateExerciseSchema` parsing.

## L1 — validation/schema mismatch

**Fix:** `exercises.load_step_kg` is `numeric(4,2)` (max storable value
`99.99`). Added `MAX_LOAD_STEP_KG = 99.99` in
[domain/exercises/schema.ts](../../src/domain/exercises/schema.ts) as the
single source of truth, and pointed `createExerciseSchema` and
`updateExerciseSchema`'s `loadStepKg` validation at it (was `.max(1000)`,
silently overflowing the column at DB-insert time for `[100, 1000)`). The
same constant now also caps the UI's `<input max=...>` (M2), so domain, API,
and UI agree with persistence.

**Tests added/updated** (`tests/unit/exerciseSchema.test.ts`):
- `rejects a loadStepKg above the numeric(4,2) column ceiling (Phase 1 review L1)` (100 now rejected; the old test asserted 1001, which no longer proves anything since 100–1000 used to incorrectly pass)
- `accepts a loadStepKg at the numeric(4,2) column ceiling` (99.99 accepted)

## Verification results

All run locally against the working tree after remediation:

| Check | Result |
|---|---|
| `pnpm lint` | pass |
| `pnpm format:check` | pass (after `prettier --write` on the one reformatted file) |
| `pnpm typecheck` | pass |
| `pnpm typecheck:sw` | pass |
| `pnpm test:unit` | **58/58 pass** (57 baseline + 1 new L1 boundary test) |
| `pnpm test:integration` | **35/35 pass** (30 baseline + 5 new: 4 H1 + 1 M1) |
| `pnpm build` | pass (standalone production build, all 15 routes) |

These are this session's results and were independently reproduced. Counts moved
after remediation 2 (integration is now 41/41); see
[phase-1-remediation-2.md](./phase-1-remediation-2.md) for the current suite.

`pnpm db:generate` was run to produce the migration; `pnpm db:migrate` /
`pnpm db:seed` against a live Postgres were **not** run in this environment
(no Docker available here either, same limitation the original review
noted). The migration was validated the same way `0000`/`0001` are validated
in CI: the PGlite integration harness runs the real migration files
end-to-end, and all seed/exercise integration tests pass against the
post-migration schema.

## Production / deploy implications

- One new migration (`0002_add_exercise_catalog_seed_log.sql`), purely
  additive (`CREATE TABLE` + one FK) — no existing table altered, no data
  migration, safe to run against a live database with existing rows.
- Deploy order (migrate → seed → deploy) is unchanged; a seed failure still
  aborts before the app deploys.
- First deploy after this ships: for every existing user with at least one
  `is_seeded` row, the whole catalog is backfilled into the new log with **no
  data changes at all** — nothing inserted, nothing touched, and slugs
  hard-deleted before this fix stay deleted (see H1's corrected bootstrap
  behavior above). A user with no `is_seeded` rows is treated as new and gets
  the full catalog.
- No production data was manually altered as part of this remediation.

## Review closure

- **H1 — Production seed safety: PARTIALLY FIXED here, completed in
  remediation 2.** The ledger closed resurrection-on-every-deploy, but the
  id-targeted conflict arbiter left the name-collision deploy-brick path open
  (verification MED-1). Fixed in
  [phase-1-remediation-2.md](./phase-1-remediation-2.md) along with the
  bootstrap resurrection.
- **M1 — Unarchive name collision: FIXED.** Proven by
  `throws ExerciseNameConflictError (not a raw DB error) when unarchiving
  into an active name collision` in `exercises.integration.test.ts`.
- **M2 — loadStepKg UI: FIXED.** `loadStepKg` is now a first-class field in
  `ExerciseForm.tsx`, using the existing domain/API representation
  unchanged.
- **L1 — validation/schema mismatch: FIXED.** Proven by the two new/updated
  boundary tests in `exerciseSchema.test.ts`; `MAX_LOAD_STEP_KG` is now the
  single shared ceiling across domain, API, UI, and (already) persistence.
- **L2, L3, L4 and all other review observations: DEFERRED AS APPROVED** —
  not touched, per the remediation brief's explicit scope limit.

## Unresolved issues

- ~~H1's one-time bootstrap edge case — not fixable without manual production
  data changes.~~ **Incorrect; resolved.** It was fixable from persisted state
  and now is — see [phase-1-remediation-2.md](./phase-1-remediation-2.md).
- `pnpm db:migrate` / `pnpm db:seed` were not exercised against a real
  Postgres in this environment (no Docker here); recommend a human confirm
  the migration + seed run cleanly against a real database (or the actual
  deploy pipeline) before or during the next deploy, same as any other
  migration.

## Status

**VERIFIED — H1 PARTIALLY FIXED, COMPLETED IN REMEDIATION 2**

Superseded by [phase-1-remediation-2.md](./phase-1-remediation-2.md) for H1;
M1, M2, and L1 were verified fixed as described above.
