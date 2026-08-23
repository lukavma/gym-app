# Pre-Phase-6 Muscle Taxonomy v2 — Release 1 Independent Review

Date: 2026-08-23
Reviewer: Claude Opus 5 — targeted independent review of the Release 1 diff.
Scope: scope separation, vocabulary/schema/migration, write invariants, UI, and one
clean-database E2E run.

Inputs read: `docs/reviews/pre-phase-6-muscle-taxonomy-release-1-implementation.md`;
ADR-010 Release 1 only; `implementation-plan.md` "Pre-Phase 6 — Muscle taxonomy v2"
Release 1; `docs/reviews/pre-phase-6-muscle-taxonomy-architecture-review.md`; the full
Release 1 diff (15 modified files + 5 new files).

Not repeated (per instruction): the taxonomy product evaluation, the Release 2 / Phase 6
design, the Phase 5 audit.

Constraints honoured: no implementation file modified; no commit, push, or deploy; no
production access. The working tree is byte-identical to its pre-review state (verified by
`git status` before and after). All verification ran against local Docker PostgreSQL 16 and
PGlite. One temporary probe test and one disposable database/worktree were created and
removed; see §7.

---

## 1. Summary

**No BLOCKER and no HIGH finding. No MEDIUM finding lands in Release 1's deliverables.**

Every Release 1 claim I could check independently is true. Scope separation holds exactly:
the catalog is untouched at 92 entries with all 14 direct-`back` contributions intact, and
none of the Release 2 / Phase 6 artifacts exist anywhere in the tree. The migration is
purely additive and drift-free, including from a brand-new database. The carry-through rule
holds under 16 independent probes at the service layer *and* through the real HTTP route
handlers, covering several cases the shipped tests do not reach.

On a fresh, disposable, migrated and seeded local PostgreSQL database the **entire E2E suite
passes 21/21**, including all three new Release 1 browser scenarios at a 390×844 phone
viewport. The two failures the implementation report flagged (`deload.spec.ts`,
`progression.spec.ts`) **disappear completely on clean state** — confirmed, with the exact
mechanism identified in §6. They are harness/fixture-state drift, not a Release 1 defect.

The single MEDIUM finding is a pre-existing rerun-safety defect in a *different* E2E spec,
proven identical on pre-Release-1 code by a controlled run against `HEAD` in an isolated
worktree. It is excluded from remediation by this review's own brief and does not gate
Release 1.

**Recommendation: proceed directly to deployment and manual iPhone acceptance. No further
verification cycle is warranted.**

---

## 2. Scope separation — verified

| Requirement | Result |
|---|---|
| Migration / vocabulary / capability only | **Confirmed.** The diff touches `src/domain/exercises/{muscleGroups,schema}.ts`, `src/db/schema/muscleGroups.ts`, `src/db/seed/muscleGroups.ts`, `src/server/exercises/service.ts`, `src/app/api/exercises/[id]/route.ts`, `src/ui/exercises/*`, plus tests and the generated migration. Nothing else |
| Catalog remains exactly 92 entries | **Confirmed.** `src/db/seed/exerciseCatalog.ts` is not in the diff at all. 92 `slug:` entries (the 93rd match is the `SeedCatalogExercise` field declaration). Live DB: `exercises where is_seeded = true` → 92, on both the dev database and a freshly seeded clean one |
| All 14 seeded direct-`back` contributions unchanged | **Confirmed.** `grep -c 'muscleGroupId: "back"'` → 14 in the catalog source. In a **freshly migrated and seeded** database: 12 `back` primary + 2 `back` secondary on seeded exercises — matching ADR-010's mapping table split row for row (12 primary, `barbell-deadlift` and `other-trap-bar-deadlift` secondary). Zero `lats` / `upper_back` / `adductors` rows on any seeded exercise |
| No reconciliation | **Confirmed.** `grep -rn reconcile src/ tests/` → zero hits. `runSeed` is still `seedMuscleGroups → seedExerciseCatalogForAllUsers`, unchanged |
| No catalog remapping | **Confirmed.** `grep -cE 'muscleGroupId: "(lats\|upper_back\|adductors)"'` in the catalog → 0 |
| No `machine-hip-adduction` entry | **Confirmed.** `grep -rn 'hip-adduction\|hip_adduction' src/` → zero hits |
| No volume aggregation | **Confirmed.** `ROLLUP_MEMBERS` is declared (a Release 1 deliverable per the plan) but has no consumer; the "Unclassified " prefix is a pure per-render string transform in `contributionMuscleLabel()`, nothing summed, bucketed, or persisted |
| No landmarks, no Release 2 reporting | **Confirmed.** No `volume_presets` / `volume_landmarks` table, no `src/domain/volume`, no reconciliation summary line anywhere |

Two deliberate deferrals are correct and worth recording, because both are Release 2 items
that a reviewer might mistake for omissions:

- `src/db/seed/exerciseCatalog.ts` still types contributions as the wide `MuscleGroupSlug`,
  not `LeafMuscleGroupSlug`. Narrowing the catalog type is an explicit Release 2 deliverable
  ("the catalog contribution type is narrowed to leaf slugs"); doing it now would be
  impossible anyway, since the catalog still legitimately targets `back`.
- Architecture-review LOW #9 asked that `LeafMuscleGroupSlug` be *named* in the Release 1
  deliverables. It is introduced here and exported, which is what Release 2 needs.

One in-scope data effect is worth stating plainly rather than leaving implicit: because
`MUSCLE_GROUPS` derives `position` from array index and `back` moved to the end,
`seedMuscleGroups` rewrites `position` on 14 pre-existing rows and `display_name` on
`lower_back`. That is inside the plan's Release 1 vocabulary deliverable ("display names
incl. 'Lower Back (Erectors)', positions"), and it is harmless during the seed-before-deploy
window because **there is no runtime reader of `muscle_groups` at all** — I re-verified this
independently: the only code touching the table is `seedMuscleGroups` and the `RESTRICT` FK
declaration; the editor and library read the `MUSCLE_GROUPS` domain constant.

---

## 3. Vocabulary, schema and migration — verified

**Vocabulary.** `LEAF_MUSCLE_GROUP_SLUGS` is exactly the 17 leaves of ADR-010, in ADR order;
`ROLLUP_MUSCLE_GROUP_SLUGS` is exactly `["back"]`; `MUSCLE_GROUP_SLUGS` is their
concatenation (18). `MUSCLE_GROUP_DISPLAY_NAMES` is a *total* `Record<MuscleGroupSlug,
string>` — all 18 keys present, so no valid slug can produce `undefined` (see §5).

**`lower_back` consistency.** Slug retained, displayed `"Lower Back (Erectors)"`, `kind`
`'muscle'`, and **not** a member of `ROLLUP_MEMBERS.back` (`['lats', 'upper_back']` only) —
consistent across the domain constant, the unit test, and the live table. `traps` and
`rear_delts` are likewise leaves and non-members, as ADR-010 requires.

**`kind` default and CHECK.** Verified against real PostgreSQL, not only PGlite:

```
ck_muscle_groups_kind | CHECK ((kind = ANY (ARRAY['muscle'::text, 'rollup'::text])))
```

and the live 18-row table reads 17 `muscle` + 1 `rollup` (`back`), `lower_back` at position
17 displaying "Lower Back (Erectors)".

**Seed synchronization.** `seedMuscleGroups` upserts `kind` from `excluded.kind` alongside
`display_name` and `position`, so a drifted `kind` self-corrects on the next deploy — the
shipped integration test proves exactly that by flipping `back` to `kind='muscle'` and
reseeding.

**Migration contains only intended additive changes.** `drizzle/0007_safe_triathlon.sql` is
two statements — `ADD COLUMN "kind" text DEFAULT 'muscle' NOT NULL` and `ADD CONSTRAINT
"ck_muscle_groups_kind"`. I diffed the `0006` and `0007` snapshots structurally: **no table
added or removed, and the only changed table is `public.muscle_groups`**, whose only deltas
are the one new column and the one new check constraint. No other top-level key differs.

**Drizzle metadata is complete and drift-free.**

- `_journal.json` has contiguous entries `idx 0..7`, tags matching the eight `.sql` files
  one-to-one.
- `0007_snapshot.json`'s `prevId` chains to `0006_snapshot.json`'s `id`.
- `pnpm exec drizzle-kit check` → `Everything's fine`.
- Stronger than the implementation report's "no new migration generated": I applied the
  whole chain to a **brand-new empty database** and all 8 migrations landed cleanly, giving
  18 rows / 1 rollup / 17 leaves and the CHECK constraint. The migration path works from
  scratch, not only as an increment on an already-migrated dev database.

---

## 4. Write invariants — verified independently

The shipped tests pass on my machine as reported (`362/362` unit, `163/163` integration).
Because the brief asks for the carry-through rule to be checked through direct service/API
calls rather than only the shipped tests, I wrote a **temporary 16-case probe** exercising
`createExercise` / `updateExercise` directly *and* the real `POST /api/exercises` and `PATCH
/api/exercises/[id]` route handlers (with only `getDb` and `requireUserId` mocked, so Zod,
the service, the transaction and the error→status mapping all ran for real). **All 16
passed.** The probe was deleted afterwards.

| Invariant | Probe | Result |
|---|---|---|
| Create accepts leaves, rejects `back` | R1, R2 | `back` → 400; `lats`+`upper_back`+`adductors` → 201 |
| Metadata-only update preserves legacy `back` | R5 | `PATCH {notes}` → 200, the `back` row is still there |
| Full update may carry `back` when it existed before | R4, P1, P2 | 200; row survives; **role and weight may be edited while carrying through** (`primary/1.0` → `secondary/0.75`); **adding a sibling leaf alongside the carried `back` row is accepted** — this is the architecture review's M-1 path, and it behaves exactly as M-1 predicts |
| Introducing `back` where absent is rejected atomically | R3, P4 | 422 `{error:"rollup_not_carried", muscleGroupId:"back"}`. P4 goes further than the shipped test: it submits `name`, `equipment`, `mechanics`, `laterality`, `loadStepKg` **and** `notes` in the same rejected call and asserts the exercise row is **byte-identical afterwards, `updated_at` included** — the whole transaction rolls back, not just the contribution swap |
| The rule is *state*-based, not history-based | P3 | After `back` is reclassified away, a later update trying to re-add it is rejected. "Once had it" does not count |
| Explicit reclassification to `lats` / `upper_back` succeeds | R6, P7 | 200; the `back` row is gone; works identically on a `is_seeded = true` exercise |
| Ownership / no-existence-leak intact | R7, R8, P5 | Non-owner → **404**, never 422. Unauthenticated → **401**, never 422. Another user's legacy `back` row does not satisfy carry-through for my exercise |
| No partial write on a malformed payload | R9 | Duplicate `back` rows → 400 at Zod, contribution rows unchanged |
| Archived exercises behave the same | P6 | Carry-through works on an archived legacy exercise |

The ordering in `updateExercise` is correct for all of these: the ownership check runs
first, then the metadata patch, then the rollup check — and because the rollup check throws
*before* the delete/reinsert, and everything is inside one `db.transaction`, a rejection
leaves no trace. The catch block re-throws `RollupContributionNotCarriedError` ahead of the
`UNIQUE_VIOLATION` mapping, so it can never be mis-reported as a 409.

The `422` status choice is right and the copy is distinguishable: `ExerciseForm` checks
`409 → 422 → 400`, so the rollup message is never shadowed by the generic contribution
message.

---

## 5. UI — verified

Checked statically and in a real browser at 390×844.

- **New rows offer exactly the 17 leaves.** `options` is `LEAF_MUSCLE_GROUPS` unless the row
  *currently holds* a rollup value, in which case that single value is prepended as a
  self-only extra. A new row has `muscleGroupId === ""`, so it can only ever see leaves. The
  e2e spec asserts the full rendered option-text list, in order, and that it does not
  contain "Back".
- **`back` is never selectable for a new row.** Proven in the coexistence test: with a
  legacy `back` row present on the same form, a freshly added row's picker still excludes
  Back while the legacy row's own picker keeps it.
- **Legacy `back` renders as "Unclassified Back"** in both render sites, via the shared
  `contributionMuscleLabel()`, plus the amber "Unclassified Back — pick Lats or Upper Back,
  or leave as-is." note in the editor.
- **Preserve / remove / reclassify all work.** Round-tripping a seeded "Barbell Row" through
  "Save changes" leaves it as Unclassified Back; explicit reclassification to Lats persists
  and the note disappears; the ✕ button removes the row.
- **Capacity uses selectable leaves, not all 18.** `usedLeafSlugs.size <
  LEAF_MUSCLE_GROUP_SLUGS.length` counts only leaf-valued rows, so a legacy rollup row does
  not consume leaf headroom. This is the correct fix for architecture-review LOW #10, and
  the e2e spec pins the cap at **exactly 17** by adding and filling all 17 leaves one at a
  time — which would fail at 16 (the naive off-by-one) and at 18 (the pre-fix constant).
  The bound also agrees with the Zod maxima: create ≤ 17 leaves, update ≤ 18 (17 leaves plus
  one carried rollup row).
- **No valid slug renders as `undefined` on a phone viewport.** There are exactly two render
  sites for a muscle label (`ExerciseLibrary`, `ContributionEditor`), both routed through
  `contributionMuscleLabel()`, which indexes a total 18-key record. Belt and braces: the
  e2e spec asserts `innerText` contains no "undefined" after both the legacy-render and the
  reclassify paths.

---

## 6. E2E — clean-database determination

### Result

Against a **freshly created, migrated and seeded disposable local PostgreSQL 16 database**
(`gymapp_r1review`, dropped afterwards; the dev `gymapp` database was never written to), with
the Release 1 production build:

```
Running 21 tests using 1 worker
...
  21 passed (43.8s)
```

All three `muscleTaxonomyV2.spec.ts` scenarios pass, and — the point of the exercise — so do
both specs the implementation report flagged:

- `deload.spec.ts` › *a pending recommendation from a load-progression exercise is hidden and
  inert during a deload week* — **passes on clean state** (also verified in isolation on its
  own pristine database).
- `progression.spec.ts` › *completion → recommendation → implicit accept via first set →
  carry-forward* — **passes on clean state** (also verified in isolation).

**Classification: the reported failures are harness / fixture-state drift, not a Release 1
defect.** This is now established by evidence rather than inference.

### Why they fail on the shared dev database

Read-only inspection of `gymapp` shows the exact mechanism behind the reported
`Expected: 65, Received: 60`:

- `tests/e2e/seed.ts` binds its fixture prescription with an **unordered `select … limit 1`**
  over the user's exercises, so which exercise the fixture points at is not stable across
  databases. On the shared dev DB it is **Ab Crunch Machine** (`load_step_kg = 5.00` →
  `expectedTarget = 60 + 5 = 65`); on a clean DB it is **Barbell Back Squat**
  (`load_step_kg = 2.50`).
- That dev-DB fixture exercise carries **45 logged sets spanning 60.00–112.50 kg**. The
  spec's documented rerun-safety argument ("the priming workout logs a fixed 60 kg, which
  implicitly decides any stale pending recommendation") neutralises a stale *pending
  recommendation*; it does not neutralise accumulated *set history*, which is what the
  load-progression engine reads.
- Consequently the engine's latest recommendations for it are `action = 'hold'` with
  `target = 60` — precisely "Expected 65, Received 60". The historical rows from when the
  fixture pointed at Barbell Back Squat show the shape the spec expects
  (`increase_load`, target `62.5`).

Accumulated state, shared dev DB vs. a clean database carrying one full suite run:

| | `gymapp` (shared dev) | clean disposable DB |
|---|---|---|
| workout sessions | 345 | 21 |
| set logs | 434 | 27 |
| recommendations | 44 | 4 |
| prescriptions | 53 | 5 |
| workout templates | 56 | 5 |

There is also **zero code coupling**: nothing under `src/domain/progression/` or
`src/server/progression/` imports any module the Release 1 diff touches, and nothing the
diff touches references progression. `/api/active-session` and `/api/today-bundle` are
served by `src/server/today/service.ts`, which imports none of the changed modules either.

Per the brief, I did **not** fix or redesign the shared E2E harness.

---

## 7. Findings

### MEDIUM-1 — `active-schedule-edit.spec.ts` passes only once per database; pre-existing, not Release 1

**Not a Release 1 defect, and explicitly outside this review's remediation scope.** Recorded
because I hit it while establishing the clean-state baseline and because it will keep
producing false failures.

The spec passes on its **first** run against a given database and fails on **every
subsequent** run, at step 8 (`expect(afterEditSession).toEqual(beforeEditSession)` — the
in-progress session picks up extra template-sourced exercises).

Proven identical on both code versions by a controlled A/B, each with its own freshly
created database:

| Code | Pristine DB, run #1 | Same DB, run #2 | run #3 |
|---|---|---|---|
| Release 1 (working tree) | **pass** | fail | — |
| Pre-Release-1 (`HEAD` = `9a936b5`, isolated `git worktree`, own build, own DB) | **pass** | fail | fail |

The mechanism is a resource leak in the spec: it creates four templates (`Upper A`,
`Lower A`, `Upper B`, `Lower B`) per run and restores only the *schedule* in its `finally`,
never the templates. Two runs left 2 copies of each on the disposable DB; the shared dev
database holds **13 copies of each**, from 13 prior runs.

An earlier observation of mine that pointed the other way — Release 1 failing on what looked
like a pristine database — turned out to be an artifact of reusing a long-lived `next start`
process across `DROP DATABASE` cycles. With a freshly started server the A/B above is clean
and unambiguous. I am recording that explicitly so the result is not re-derived incorrectly
later.

**Correct before:** whenever the E2E harness is next revisited. Suggested minimal fix (not
applied): delete `tempTemplateIds` in the existing `finally`, alongside the schedule
restore. No effect on Release 1.

### No BLOCKER, no HIGH, and no MEDIUM in Release 1's deliverables

The architecture review's four MEDIUMs (M-1…M-4) all remain correctly out of Release 1, and
M-1's premise is now empirically confirmed: I verified by direct service call (probe P2) that
a user *can* carry a legacy `back` row through while adding a `lats` sibling in the same
update, which is the state Release 2 will report as a conflict. Nothing to do in Release 1;
carry it into the Release 2 task as that review already recommended.

### Non-blocking observations (LOW — must not delay Release 1)

1. **Reclassification is one-way inside an editing session.** `currentRollup` is derived from
   the row's *current* value, so the moment the user picks a leaf, "Unclassified Back"
   disappears from that row's options. Recovering from a mis-tap means leaving the form
   without saving and re-opening it (losing other unsaved edits on that form). This is the
   intended one-way door — the design's whole point is that `back` is never newly created —
   and it loses no data. Worth knowing during iPhone acceptance: **don't save; reload to
   restore.**
2. **Concurrent-update race.** Under READ COMMITTED, two simultaneous saves of the *same*
   exercise could in principle let a carried-through `back` row be re-inserted after a
   concurrent update removed it. It requires two saves of one exercise within milliseconds
   on a single-user app, it self-heals (reclassify again), Release 2's reconciliation is
   state-predicated and would simply re-handle it, and ADR-010 already accepts a strictly
   broader residual race for the Release 2 window. It is also not a new class of problem:
   `updateExercise` is last-write-wins for every other field already.
3. **`contributionMuscleLabel()` has no fallback** for a slug outside the union. Unreachable
   today (the FK targets `muscle_groups`, which only ever receives the 18 seeded rows, and
   all 15 v1 slugs are a subset of v2's 18) and forbidden by ADR-010's add-only mutation
   rule. It is exactly the shape that made the pre-Release-1 build render the literal text
   `undefined`, so a one-line `?? muscleGroupId` would be cheap insurance if the file is
   touched again.
4. **The create-path 400 copy** ("at least one primary is required") would be misleading for
   a `back` payload — unreachable through the UI, which never offers `back` on create.
5. **`checkInList` is now duplicated in a third schema file.** Pre-existing convention,
   correctly documented with a pointer to the original; not worth a shared helper on its own.

---

## 8. Independent verification log

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm format:check` | clean — "All matched files use Prettier code style!" |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm test:unit` | **362/362 passed** (28 files) |
| `pnpm test:integration` | **163/163 passed** (12 files) |
| Temporary 16-case service + route-handler probe | **16/16 passed**, then deleted |
| `pnpm build` | succeeds |
| `pnpm exec drizzle-kit check` | `Everything's fine` |
| Full migration chain on a brand-new database | 8/8 applied; 18 rows / 1 rollup / 17 leaves / CHECK present |
| Snapshot `0006` → `0007` structural diff | only `public.muscle_groups`; one column + one check constraint |
| Live PostgreSQL vocabulary + catalog state | 18 groups, 1 rollup, 92 seeded exercises, 14 direct `back` rows (12 primary / 2 secondary) |
| `pnpm test:e2e` on a pristine disposable database | **21/21 passed** |
| Pre-Release-1 control run (`HEAD` worktree, own DB, own build) | used only to classify MEDIUM-1 |

**Environment hygiene.** Created and removed: `tests/integration/zz-review-probe.integration.test.ts`,
databases `gymapp_r1review` and `gymapp_r1control`, and the git worktree
`C:\tmp\gymapp-r1control`. The dev database `gymapp` was **read-only** throughout — inspected
with `SELECT` only, never migrated, seeded, or written by a test run. `git status` is
identical to its pre-review state; every user-owned file (`CLAUDE.md`, `HANDOFF.md`,
`HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`) is untouched.

---

## 9. Verdict

**READY FOR RELEASE 1 DEPLOYMENT AND MANUAL IPHONE ACCEPTANCE**

No BLOCKER, no HIGH, and no MEDIUM inside Release 1's deliverables. The one MEDIUM is a
pre-existing E2E-harness rerun-safety defect, proven identical on pre-Release-1 code and
excluded from remediation by this review's brief; it is not a Release 1 residual.

**Proceed directly — no further verification cycle is warranted.** The implementation
report's own two flagged E2E failures are now positively explained and shown to vanish on
clean state, so nothing remains open that another round could close.

Two reminders carried from the accepted design, not findings:

- Release 1 is the **point of no return for app rollback**. The phone-acceptance step ("a new
  pull can be created on Lats / Upper Back") writes a leaf contribution and closes the
  rollback window. Roll forward by default from that moment; PITR is for catastrophe only.
- Release 2 remains gated on Release 1 being live **and** phone-verified, and should carry
  architecture-review M-1 and M-2 into its implementation task.
