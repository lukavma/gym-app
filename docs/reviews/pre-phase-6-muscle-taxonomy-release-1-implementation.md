# Pre-Phase-6 Muscle Taxonomy v2 — Release 1 Implementation Report

Status: implementation complete, locally verified. Not committed, not pushed, not deployed.

## Scope

Implements Release 1 (capability release) of ADR-010 exactly as scoped in
`docs/architecture/implementation-plan.md`'s "Pre-Phase 6 — Muscle taxonomy
v2" section and the plan approved by the product owner (recorded in this
session's plan-mode approval). Schema/vocabulary/validation/UI capability
only — zero data-semantics change. The 92-exercise catalog and its 14
existing `back` contributions are untouched; no reconciliation, no catalog
remap, no `machine-hip-adduction`, no `reconcileContributions`, no Phase 6
volume code.

Precondition verified before starting: the Opus closeout session's commit
(`9a936b5`, "docs: rescope pre-phase-6 muscle taxonomy") had already landed
locally, carrying the governing docs (ADR-010, the architecture review, the
rescope trail) this implementation is built on.

## Files changed

Domain:
- `src/domain/exercises/muscleGroups.ts` — vocabulary v2 (17 leaves + 1
  rollup `back`), `LeafMuscleGroupSlug`/`RollupMuscleGroupSlug` types,
  `MUSCLE_GROUP_KINDS`, `ROLLUP_MEMBERS`, `leafMuscleGroupSlugSchema`,
  `isLeafMuscleGroupSlug`/`isRollupMuscleGroupSlug`, `LEAF_MUSCLE_GROUPS`.
- `src/domain/exercises/schema.ts` — create/update now use different-width
  contribution schemas (`createContributionsListSchema` = leaf-only,
  `updateContributionsListSchema` = full 18-slug vocabulary).

Schema/migration:
- `src/db/schema/muscleGroups.ts` — added `kind` column (`text not null
  default 'muscle'`) + `ck_muscle_groups_kind` CHECK constraint.
- `drizzle/0007_safe_triathlon.sql` (generated) — two purely-additive
  statements, nothing else.

Seed:
- `src/db/seed/muscleGroups.ts` — `seedMuscleGroups` upsert now syncs `kind`
  too. No other seed file changed.

Service:
- `src/server/exercises/service.ts` — new `RollupContributionNotCarriedError`;
  `updateExercise` gained a transactional carry-through check (submitted
  rollup slugs must already exist on the exercise, checked before the
  delete/reinsert, atomic with the rest of the update). `createExercise`
  unchanged — the leaf-only Zod schema fully covers create.

API:
- `src/app/api/exercises/[id]/route.ts` (PATCH) — maps
  `RollupContributionNotCarriedError` → `422 {error:"rollup_not_carried",
  muscleGroupId}`. POST route unchanged (Zod already 400s a `back` slug on
  create).

UI:
- `src/ui/exercises/ContributionEditor.tsx` — picker now offers exactly the
  17 leaves for new/changed rows; a row already holding a legacy rollup value
  keeps that value as a self-only extra option with an "Unclassified Back —
  pick Lats or Upper Back, or leave as-is." note; capacity check now uses a
  leaf-filtered used-count (`usedLeafSlugs.size < LEAF_MUSCLE_GROUP_SLUGS.length`),
  fixing architecture-review LOW #10 without the off-by-one a naive constant
  swap would introduce.
- `src/ui/exercises/muscleGroupDisplay.ts` (new) — shared
  `contributionMuscleLabel()`, prefixes "Unclassified " for a direct rollup
  contribution; used by both `ExerciseLibrary.tsx` and `ContributionEditor.tsx`.
- `src/ui/exercises/ExerciseLibrary.tsx` — uses the shared label helper.
- `src/ui/exercises/ExerciseForm.tsx` — new `422` branch with distinguishable
  copy, checked before the generic `400` branch.

Tests (new/modified):
- `tests/unit/muscleGroups.test.ts` (new) — vocabulary invariants.
- `tests/unit/exerciseSchema.test.ts` — create rejects `back`, accepts the 3
  new leaves; update still accepts `back` at the schema level (pins that
  carry-through is a service-layer concern).
- `tests/integration/seed.integration.test.ts` — 18-row seed with exactly one
  rollup, `kind` default/CHECK, seed idempotency including `kind` drift
  correction.
- `tests/integration/exercises.integration.test.ts` (new describe block) —
  create with the 3 new leaves; carry-through accepted; metadata-only edit
  leaves a legacy `back` row untouched; explicit reclassify accepted;
  introducing `back` where none existed rejected + atomic rollback proven;
  no-existence-leak preserved for the new error path.
- `tests/e2e/muscleTaxonomyV2.spec.ts` (new, phone viewport 390×844) — picker
  option set and 17-not-18 capacity cap; legacy seeded "Barbell Row" renders
  "Unclassified Back" and round-trips unchanged; a direct-DB-seeded legacy
  `back` row excludes Back from a freshly added row (coexistence) and can be
  explicitly reclassified to Lats, with UI cleanup via the existing Delete
  button.

User-owned files confirmed untouched throughout: `CLAUDE.md`, `HANDOFF.md`,
`HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`,
`tsconfig.tsbuildinfo`.

## Migration

`drizzle/0007_safe_triathlon.sql`, generated normally via `pnpm db:generate`
(no manual patch):

```sql
ALTER TABLE "muscle_groups" ADD COLUMN "kind" text DEFAULT 'muscle' NOT NULL;
ALTER TABLE "muscle_groups" ADD CONSTRAINT "ck_muscle_groups_kind" CHECK ("muscle_groups"."kind" in ('muscle', 'rollup'));
```

Applied via `pnpm db:migrate` against local Docker PostgreSQL 16
(`gym-app-db-1`, already running/healthy). `pnpm db:seed` run twice; second
run confirmed a no-op (row counts unchanged). `pnpm db:generate` re-run after
migrate+seed produced "No schema changes, nothing to migrate" — no drift.

## Live PostgreSQL verification

`muscle_groups` (18 rows, exactly one rollup, `lower_back` display updated):

```
     id      |  kind  |     display_name      | position
-------------+--------+-----------------------+----------
 chest       | muscle | Chest                 |        1
 lats        | muscle | Lats                  |        2
 upper_back  | muscle | Upper Back            |        3
 ...
 lower_back  | muscle | Lower Back (Erectors) |       17
 back        | rollup | Back                  |       18
(18 rows)
```

Catalog unchanged:
- `exercises WHERE is_seeded = true` → 92 (single e2e user).
- Direct `back` contributions on seeded exercises → 14 (unchanged from
  pre-Release-1 baseline, all still on `back`, none remapped).
- `kind='bogus'` insert rejected by the CHECK constraint; an insert omitting
  `kind` defaults to `'muscle'` (both proven in
  `tests/integration/seed.integration.test.ts`, run against a real PGlite
  migration, not mocked).

## Test results

- `pnpm lint` — clean.
- `pnpm format:check` — clean.
- `pnpm typecheck` — clean.
- `pnpm typecheck:sw` — clean.
- `pnpm test:unit` — **362/362 passed** (28 files), including the new
  `muscleGroups.test.ts` (8 tests) and expanded `exerciseSchema.test.ts` (40
  tests, +5 new).
- `pnpm test:integration` — **163/163 passed** (12 files) against PGlite +
  the real generated migration, including `exercises.integration.test.ts`
  (24 tests, +7 new) and `seed.integration.test.ts` (18 tests, +4 new).
- `pnpm build` — succeeds.
- `pnpm test:e2e` — **19/21 passed**. All 3 new
  `muscleTaxonomyV2.spec.ts` tests pass. 2 failures, both pre-existing and
  unrelated to this change (see below).

### Pre-existing e2e failures (not caused by this change)

`deload.spec.ts` (`a pending recommendation from a load-progression exercise
is hidden and inert during a deload week`) and `progression.spec.ts`
(`completion → recommendation → implicit accept via first set →
carry-forward`) both fail with `Expected: 65, Received: 60` — the
progression engine's post-completion recommendation stayed at the priming
weight (60 kg) instead of proposing `60 + loadStepKg`. This is unrelated to
muscle taxonomy: both specs exercise the load-progression engine against the
same fixed, persistent e2e account/exercise (`tests/e2e/seed.ts`), which
accumulates real session/decision history across every local e2e run ever
executed against this dev database. Both specs' own header comments already
flag this exact fragility mode ("the shared e2e fixture's exercise may
already carry an older accepted..."; "Rerun-safe by construction: the
priming workout logs a fixed 60 kg, which implicitly decides any stale
pending recommendation a previous run left behind..."), and this run's
accumulated history has apparently drifted past what that self-repair
assumes. Confirmed unrelated by:
- Re-running both specs in isolation (not just inside the full suite) —
  identical deterministic failure, ruling out cross-spec ordering effects
  from this session's other runs.
- No code-path overlap: this change touches only
  `src/domain/exercises`, `src/db/schema/muscleGroups.ts`,
  `src/db/seed/muscleGroups.ts`, `src/server/exercises`,
  `src/app/api/exercises`, and `src/ui/exercises`; progression evaluation
  lives entirely outside those paths.
- Direct DB inspection after a failing run: the shared e2e fixture exercise
  and its historical sets/decisions are exactly what these tests' own
  documented risk describes — a pre-existing, environment-only issue from
  running e2e repeatedly against a persistent (never-reset) dev database,
  not a regression introduced by Release 1.

This is flagged for awareness, not treated as a Release 1 blocker — it
predates this change and Release 1 touches none of the code these tests
exercise.

## Release 2 / Phase 6 exclusions (confirmed, not implemented)

- No change to any of the 92 catalog exercise definitions or their 14
  existing `back` rows.
- No remapping of any catalog `back` contribution.
- No `machine-hip-adduction` catalog entry.
- No `reconcileContributions` function anywhere; `runSeed` order unchanged
  (`seedMuscleGroups → seedExerciseCatalogForAllUsers`).
- No Unclassified Back volume aggregation — the "Unclassified " label is a
  pure per-render string transform, nothing summed/bucketed/persisted.
- No Phase 6 volume code or UI, no landmarks, no Release 2 reporting, no
  hierarchy/rollup DB tables or `parent_id`.

## Verdict

**READY FOR INDEPENDENT RELEASE 1 REVIEW**

Not committed, not pushed, not deployed, per instruction. Release 1 requires
independent review and explicit deployment approval before any of that
happens.
