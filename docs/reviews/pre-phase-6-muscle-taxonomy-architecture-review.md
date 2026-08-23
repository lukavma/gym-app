# Pre-Phase-6 Muscle Taxonomy v2 — Independent Architecture Gate

Date: 2026-08-23
Reviewer: Claude Opus 5 — independent architecture gate, read-only.
Scope: internal consistency, reconciliation safety, two-release rollout, implementation readiness of the finalized taxonomy v2 rescope.
Inputs read: `adr/ADR-010-muscle-taxonomy-v2.md`; the taxonomy diffs in `domain-model.md`, `data-model.md`, `volume-model.md`, `implementation-plan.md`, `evidence-to-design.md` (plus the one-line `architecture-plan.md` index touch); `pre-phase-6-muscle-taxonomy-rescope.md`; the correction notice and §8a addendum of `pre-phase-6-muscle-taxonomy-evaluation.md`; and, for feasibility only, `src/domain/exercises/muscleGroups.ts`, `src/domain/exercises/schema.ts`, `src/db/schema/{muscleGroups,exercises,exerciseMuscleContributions}.ts`, `src/db/seed/{index,muscleGroups,exercises,exerciseCatalog}.ts`, `src/server/exercises/service.ts`, `src/ui/exercises/ContributionEditor.tsx`.
Not repeated (per instruction): the product evaluation, the literature review, the catalog audit, the Phase 5.5 Light review.
Constraints honoured: no accepted document or source file modified; no application test suite run; no production access; no commit, push, or deploy.

---

## 1. Summary

No BLOCKER and no HIGH finding. The model is internally coherent, the reconciliation mechanism is safe and genuinely state-predicated, the two-release rollout is correctly ordered, and every implementation claim I could check against source is true.

Four MEDIUM findings, all document-accuracy or reporting-completeness. **None of them lands in Release 1's deliverables**: M-1 and M-2 affect Release 2's reporting, M-3 affects the Phase 6 display spec, M-4 is a wrong justification clause that does not change any mapping row. Release 1 can be implemented as written.

## 2. What I verified against source

Recorded because ADR-010 sets its own bar at "compatibility proven, not assumed", and several of its load-bearing claims are checkable.

| Claim | Result |
|---|---|
| All 14 `back`-carrying slugs of the 92-entry catalog are in the mapping table | **Confirmed.** `src/db/seed/exerciseCatalog.ts` has exactly 92 unique slugs (the 93rd `slug:` match is the `SeedCatalogExercise` field declaration) and exactly 14 carry a `back` contribution. Slug names and roles match ADR-010 row for row — 12 primary, `barbell-deadlift` and `other-trap-bar-deadlift` secondary. 78 untouched. No adductor content anywhere ✓ |
| `seededExerciseId(userId, slug)` identifies renamed seeded exercises | **Confirmed.** `src/db/seed/exercises.ts:158`, SHA-1 over `exercise:<userId>:<slug>`, independent of `exercises.name` |
| The conditional update's columns exist | **Confirmed.** `exercise_muscle_contributions.updated_at` and `exercises.is_seeded` both exist; PK is `(exercise_id, muscle_group_id)`, FK to `muscle_groups` is `RESTRICT` |
| `runSeed` ordering is a small insertion | **Confirmed.** `src/db/seed/index.ts:15-17` is `seedMuscleGroups → seedExerciseCatalogForAllUsers`; `seedMuscleGroups` is already an upsert syncing `display_name`/`position`, so adding `kind` is one line |
| `kind` and the three new rows are invisible to the pre-Release-1 build | **Confirmed.** There is no runtime reader of `muscle_groups`: no `/api/muscle-groups` route, and the only code touching the table is the seed and the FK declaration. The editor and library read the `MUSCLE_GROUPS` domain constant, not the DB |
| The editor update path is delete-all-and-reinsert | **Confirmed.** `src/server/exercises/service.ts:232-245`. Carry-through is implementable by reading existing rows inside the same transaction |
| Name-collision → `noop`, custom exercise untouched | **Confirmed.** Arbiter-less `onConflictDoNothing` plus the ledger leaves no row at the derived id, so the `EXISTS (is_seeded)` guard fails ✓ |
| Nothing snapshots muscle data | **Confirmed.** `prescriptionSnapshot.ts` contains no muscle or contribution reference |
| The withdrawn "8 weeks" figure | **Confirmed.** `mvp-scope.md` F8 says "current and previous 4 weeks"; volume-model §6 now agrees. Evaluation T3 is closed |
| No stale "15 groups" statement | **Confirmed.** One residual mention, in the deliberately marked implementation-plan Phase 1 historical note |

Counts agree everywhere they appear: 17 leaves / 18 rows / 1 rollup / 2 members / 5 landmark-less leaves (2 pre-existing) / 14 mapped / 78 untouched — across ADR-010, domain-model §2, data-model §2.3, volume-model §1 and §4, implementation-plan Pre-Phase 6 and Phase 6, and the rescope closeout. Leaf/rollup terminology is used consistently; `kind` is the only mechanism and there is no `parent_id`, DAG, or membership table anywhere in the amended text.

**Sum preservation is mathematically sound.** Because PK `(exercise_id, muscle_group_id)` allows at most one `back` row per exercise, the partition is a bijection: `effective(back)` is preserved because each moved row keeps its weight and lands in a member leaf, and legacy rows land in `unclassifiedBack`, both of which the rollup re-adds. `raw(back)` is preserved because a single primary `back` row becomes a single primary member-leaf row, and the per-set dedupe caps the rollup at one. The secondary-hinge case (deadlift) contributes to neither raw series before or after. The defensive conflict case also preserves both series. The pseudocode in volume-model §2 cannot double count: the rollup increment sits in the per-set loop, and there is no grand total across groups.

**Idempotency is genuinely state-predicated** for every mapped slug. The predicate is consumed by the update itself, there is no ledger to desynchronize, a pre-taxonomy restore is re-reconciled automatically, and the `NOT EXISTS` guard makes the PK-changing update unable to raise a unique violation. Statement-snapshot semantics make the self-referencing subquery safe for what is in effect a PK-point update.

**RP landmarks cannot be attached to leaves accidentally.** Nothing exists to attach before Phase 6; the seed rule is stated in both data-model §2.17 and volume-model §4; `uq_landmark` prevents duplicate rows; and implementation-plan Phase 6 carries an integration assertion that the RP seed writes no landmark row for any rollup member leaf. A user attaching their own landmark to a leaf in their own preset is permitted and honest — bands are per-group display data, never summed.

**The rollout ordering is correct.** Release 1 is forward-compatible and reconciles nothing; Release 2's gate ("only after Release 1 is live and phone-verified") appears in ADR-010, implementation-plan and the closeout. The old-build compatibility analysis is accurate against the code, including the write-back race, and the residual interleaving race is stated rather than hidden. The rollback wording correctly distinguishes pre-leaf-write from post-leaf-write state in all four places it appears (ADR-010 Release 1 bullet and "Rollback and recovery", implementation-plan Release 1 rollback bullet, closeout §2 and §10.1) and correctly names the Release 1 phone-acceptance step as the action that closes the window. Fresh, partially seeded and fully seeded databases all converge, and the ledger-bootstrap branch in `seedExerciseCatalogForUser` does not interfere: it records slugs as applied without inserting, leaving the pre-existing `back` rows exactly where the reconciliation expects them.

**No Phase 6 implementation leaked in.** Release 1 and Release 2 deliverables are disjoint, each has its own acceptance gate, and the "Not yet (binding)" list explicitly excludes any volume UI, per-leaf landmarks, and a second rollup.

---

## 3. Findings

### M-1 — "Conflicts are unreachable by construction" is false, and contradicted inside ADR-010 itself

ADR-010 §"Reconciliation mechanism" step 4 states "Conflicts are unreachable by construction"; the evaluation addendum §8a.4 repeats it as "impossible by construction". The ADR's own deployment-scenario table labels the same path "(defensive)".

The unreachability claim does not hold. Release 1's rules are: create rejects rollup slugs; update accepts a rollup slug **only as carry-through of a row that already exists on that exercise**. Neither rule constrains the *other* rows in the same update. So during the Release 1 → Release 2 window a user can open a seeded `cable-lat-pulldown`, carry its `back` row through, and add a `lats` contribution — an ordinary two-tap editor action. Release 2 then finds a row on the target leaf and reports a conflict.

Consequences are benign and the mechanism handles the state correctly (the `back` row is left in place, becomes Unclassified Back, and sum preservation still holds). Two things follow that the documents should say:

- The claim must be downgraded to what the design actually guarantees: conflicts are *unreachable through the reconciliation itself and through creation*, and reachable only by a deliberate user edit that adds the target leaf while keeping the legacy row.
- A conflict is **sticky**. Its predicate is never consumed, so every subsequent deploy re-emits the same `::warning::` line until the user resolves it in the editor. That is defensible behaviour, but Release 2's acceptance gate ("`conflicts=0`, or every conflict explained") should say that an unresolved conflict is expected to recur rather than reading as a one-time anomaly.

**Correct before:** Release 2 implementation and its report. No effect on Release 1.

### M-2 — Reconciliation and reporting are scoped to the 14 mapped slugs, so a `back` row on any other seeded exercise is invisible to all four counters

ADR-010 states the end-state predicate as "no `back` row on a seeded exercise", but the mechanism iterates only the 14 mapped slugs, and the four reported counts partition as: `updated`/`noop`/`conflicts` per *mapped* slug, and `customDirectBack` over *user-created* (`is_seeded = false`) exercises.

Nothing covers a direct `back` row on a seeded exercise that is not one of the 14 — reachable today, because the pre-v2 editor let any exercise take any of the 15 slugs, so a `back` secondary added by hand to (say) a seeded press or carry is a plausible state for this account. Such a row is not re-pointed, not counted anywhere, and permanently falsifies the stated predicate, while the deploy output reports a clean run.

The volume model stays correct — the row is counted as Unclassified Back, and both `effective(back)` and `raw(back)` are preserved exactly — so this is a completeness gap in the reporting contract and the predicate wording, not a data-integrity problem. The fix is cheap: either widen `customDirectBack` to "any exercise still holding a direct `back` row, split by `is_seeded`", or add one `seededDirectBackUnmapped` count. The owner's reclassification backlog is otherwise incomplete by construction.

**Correct before:** Release 2 implementation. No effect on Release 1.

### M-3 — The `Back = Lats + Upper Back + Unclassified Back` line is an *effective*-series identity, but is specified unqualified

ADR-010 ("Aggregation"), volume-model §2 and §5 rule 6, domain-model §8 and implementation-plan Phase 6 all specify the reconciliation line without saying which series it applies to. volume-model §1 requires both series to be surfaced ("Both raw and effective are surfaced; effective is the primary display number, raw is the sanity anchor"), and Phase 6 renders "per group", which includes the rollup.

For raw sets the identity is false by design: `raw(back)` is deduplicated per set, so whenever an exercise is primary on both members it is strictly less than `raw(lats) + raw(upper_back)`. This is not a corner case the docs treat as unlikely — domain-model §3 explicitly permits users to add sibling contributions, and the Phase 6 fixture is *required* to contain "an exercise primary on both `lats` and `upper_back` to prove raw deduplication". A user in that state sees a Back row whose raw number does not equal the sum of its displayed parts, with nothing on screen explaining it.

The underlying model is right; the display rule is under-specified. One clause is enough: state that the reconciliation line reports the effective series, and that raw Back is a deduplicated per-set count which may be lower than the sum of its members.

**Correct before:** Phase 6 build. No effect on Release 1 or Release 2.

### M-4 — ADR-010's mapping rationale is factually wrong for `other-trap-bar-deadlift`

The rule beneath the mapping table justifies routing the hinge secondaries to `upper_back` as "matching the `traps` secondary those entries already carry". `barbell-deadlift` does carry `traps` secondary; `other-trap-bar-deadlift` does not — its contributions are `glutes` primary, `quads` primary, `hamstrings` secondary, `back` secondary, `forearms` secondary.

No mapping row changes: the primary rule ("hinge-family isometric mid-back involvement → `upper_back`, keeping `lats` a clean vertical-pull signal") stands on its own and both targets remain correct. The hazard is forward-looking — the table is declared binding and a future hinge entry mapped by the stated rationale would be classified against a premise that is false for half the existing examples. Drop the clause or scope it to `barbell-deadlift`.

**Correct before:** any amendment that adds a hinge entry. No effect on either release.

---

## 4. Verdict

**READY FOR TAXONOMY V2 RELEASE 1 IMPLEMENTATION**

No BLOCKER, no HIGH. Release 1's deliverables — the `kind` migration, the 18-row vocabulary, read compatibility, leaf-only creation with legacy carry-through, and the reclassify affordance — are internally consistent, feasible against the code as it stands, and unaffected by every finding above. Proceed directly, subject only to the existing gate on a successful Phase 5.5 Light closeout verification verdict (which, per ADR-010 Context, also requires re-checking the mapping table if that verification alters any `back`-carrying slug — none of the 14 changed as of this review).

Carry M-1 and M-2 into the Release 2 implementation task, M-3 into the Phase 6 build, and M-4 whenever ADR-010 is next touched. None requires re-approval of the accepted model.

---

## Appendix — LOW / editorial (no remediation recommended)

1. `muscle_groups.kind` uses the value `'muscle'` for what every document calls a "leaf"; the column value and the prose vocabulary differ.
2. The row-level sum-preservation assertion is phrased asymmetrically — multiset over `{lats, upper_back, back}` *after* versus multiset over `{back}` *before*. Correct for the pre-v2 fixture it is written against; the symmetric form over the same three slugs on both sides is strictly more general and also passes the conflict path.
3. "The app can never *create* a direct `back` row after Release 1" is true of the service, not of the seed: Release 1 deliberately leaves the catalog on `back`, so a fresh or partially applied user seeded during the Release 1 window still receives `back` rows, which Release 2 then reconciles.
4. Carry-through physically re-inserts the legacy row (delete-all-and-reinsert), refreshing its `updated_at`. "Never created" is a semantic statement about the slug appearing on an exercise that lacked it, not a literal statement about row lifetime.
5. Placing `reconcileContributions` before `seedExerciseCatalogForAllUsers` is defensive rather than load-bearing — both orders converge in every tabulated scenario. Only "after `seedMuscleGroups`" is required, by the `RESTRICT` FK.
6. The sum-preservation invariant's baseline reads best as "immediately before the reconciliation", not "pre-v2": leaf rows a user writes during the Release 1 → 2 window legitimately change Back totals, and that is a user edit, not a reconciliation effect.
7. Nothing mechanically prevents Release 2 from deploying without Release 1 — it is a process gate. Acceptable at single-user scale with a two-deploy sequence under one owner.
8. The transaction scope of `reconcileContributions` is unspecified. Per-statement idempotency makes both choices safe; worth one sentence in the implementation report.
9. Release 2 narrows the catalog contribution type to leaf slugs, which needs a `LeafMuscleGroupSlug` type that Release 1 must introduce for its own validation rule. Naming it in the Release 1 deliverables would make the split cleaner.
10. `ContributionEditor.tsx:38` caps additions with `usedSlugs.size < MUSCLE_GROUPS.length`. After Release 1 that constant is 18 while only 17 slugs are selectable, so the picker must distinguish the full vocabulary from the selectable leaf set in two places, not one.
11. implementation-plan Phase 1 still reads "seed catalog (~40 common movements)" in present-tense "Builds" prose while carrying a v1/v2 historical note in the same sentence; the catalog is now 92 entries. Deliberately historical, but the sentence mixes tenses.
