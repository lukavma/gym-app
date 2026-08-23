# Pre-Phase-6 Muscle Taxonomy v2 — Decision Table and Document-Change Plan

Date: 2026-08-23
Status: **Approved 2026-08-23 (sections 1–5) with one required amendment — see §8. Superseded in detail by `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` and the closeout report.**
Author: Claude Fable 5 (architecture/documentation session; no source, schema, migration, seed, or test changes)
Predecessor: `docs/reviews/pre-phase-6-muscle-taxonomy-evaluation.md` (recommendation accepted in principle by the product owner: RESCOPE TAXONOMY BEFORE PHASE 6 using the bounded C-lite model)
Successor: `docs/reviews/pre-phase-6-muscle-taxonomy-rescope.md` (closeout report, written after the approved edits)

## 0. Preconditions verified

- Phase 5.5 Light remediation implementation is complete: `docs/reviews/phase-5.5-light-remediation.md` ends `READY FOR TARGETED CLOSEOUT VERIFICATION`; the targeted closeout verification itself is still pending, and taxonomy _implementation_ is gated on its successful verdict (documentation work is not). Its changes are uncommitted in the working tree and are preserved untouched.
- The final catalog (`src/db/seed/exerciseCatalog.ts`, working tree) has **92 entries** with exactly **14 `back`-carrying slugs** (7 original + 7 added by Phase 5.5) and 8 `lower_back` rows. No adductor content exists.
- Deploy pipeline order (`.github/workflows/deploy.yml`): `pnpm db:migrate` → `pnpm db:seed` → App Service deploy. `runSeed` currently runs `seedMuscleGroups` → `seedExerciseCatalogForAllUsers`.
- Seeded-exercise identity: ids are derived in application code by `seededExerciseId(userId, slug)` (SHA-1, v5-shaped); catalog slugs are **not** persisted on `exercises`; `exercise_catalog_seed_log` records `(user_id, slug)` only; `exercises.is_seeded` is written by the seed alone. `updateExercise` replaces contributions by delete-all-and-reinsert.

## 1. Final decision table

| #   | Item                         | Resolution                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Vocabulary                   | 17 leaves (the 14 existing non-`back` leaves + `lats`, `upper_back`, `adductors`) + `back` retained as the **single** rollup = 18 `muscle_groups` rows. No renames.                                                                                                                                                       |
| 2   | Rollup representation        | `muscle_groups.kind text NOT NULL DEFAULT 'muscle'`, check `('muscle','rollup')`. Membership (`back → [lats, upper_back]`) is a **domain constant**, not a table.                                                                                                                                                         |
| 3   | `lower_back`                 | Slug retained; display copy **"Lower Back (Erectors)"**; documented as the spinal-erector/lower-back tracking bucket.                                                                                                                                                                                                     |
| 4   | New contributions            | Leaf-only. A rollup slug is accepted in an **update** payload only if that exercise already has a row on that rollup (carry-through) — required because `updateExercise` is delete-all-and-reinsert; otherwise editing any field of a legacy exercise would force reclassification. Create payloads never accept rollups. |
| 5   | Legacy direct-`back` rows    | Left in place, readable, counted, surfaced as `unclassifiedBack`; the editor shows an explicit "Reclassify" affordance, never forces or infers.                                                                                                                                                                           |
| 6   | Aggregation                  | `Back effective = Σ leaf effective + unclassifiedBack`; `Back raw` = sets with ≥1 primary on any member leaf **or** direct `back`, counted once per set. UI shows `Back = Lats + Upper Back + Unclassified Back`; the unclassified term is hidden when zero.                                                              |
| 7   | Seeded defaults              | Partition — every `back` row moves to exactly one leaf, role and weight verbatim, no sibling secondaries added.                                                                                                                                                                                                           |
| 8   | Deadlift / trap-bar deadlift | `back` secondary → **`upper_back` secondary** (hinge-pattern isometric mid-back retention; keeps `lats` a clean vertical-pull signal; consistent with the existing `traps` secondary).                                                                                                                                    |
| 9   | Adductors                    | No retrofit to existing compounds. One honest catalog entry added in the same pass (`machine-hip-adduction`, adductors primary) so the leaf is not empty.                                                                                                                                                                 |
| 10  | RP landmarks                 | RP "Back" row → `back` rollup only. No landmarks for `lats`, `upper_back`, `adductors`, `forearms`, `lower_back`.                                                                                                                                                                                                         |
| 11  | Display sections             | Legs / Arms & Shoulders / Back / Torso are UI ordering only — no data hierarchy.                                                                                                                                                                                                                                          |
| 12  | Trend window                 | volume-model corrected to **trailing 4 weeks** (mvp-scope F8 and implementation-plan Phase 6 agree; no stronger authority found).                                                                                                                                                                                         |

## 2. Reconciliation mechanism (gap 1 of the evaluation)

**Chosen: conditional idempotent updates inside the seed pipeline; no reconciliation ledger.**

`runSeed` becomes `seedMuscleGroups → reconcileContributions → seedExerciseCatalogForAllUsers`. For each user and each of the 14 mapped slugs, the step computes the seeded id with the existing `seededExerciseId(userId, slug)` helper and issues:

```text
UPDATE exercise_muscle_contributions
SET    muscle_group_id = <target>
WHERE  exercise_id = <id>
  AND  muscle_group_id = 'back'
  AND  EXISTS (exercise with that id, this user_id, is_seeded = true)
  AND  NOT EXISTS (a row for this exercise on <target>)
```

Role and weight are not in the `SET`. No SQL hashing, no pgcrypto, no name matching.

A ledger is not merely unnecessary but worse: the desired end state is a predicate on the data ("no `back` row on a seeded exercise"), so the update is self-evidencing and re-runnable forever — including after a restore from a pre-taxonomy backup, where a ledger would wrongly report "already done". Post-taxonomy validation guarantees no new `back` rows can be created, so the step can never touch user-authored data. (Contrast: the Phase 1 catalog seed needs its ledger precisely because a _missing_ row cannot be distinguished from a deleted one.)

| Scenario                                    | Outcome                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing user, all 92 slugs applied         | 14 rows re-pointed (minus any the user removed); second deploy updates 0 rows — clean no-op                                                    |
| Existing user, only the old 40 applied      | 7 rows re-pointed, then the 52 new slugs seed from the updated (leaf-targeting) catalog                                                        |
| Fresh user / fresh database                 | No `back` rows ever exist; the catalog seeds leaves; reconciliation is a no-op                                                                 |
| Skipped / colliding seeded slug             | No seeded row with that id → nothing happens; the user's colliding custom exercise is untouched (its `back` row, if any, is Unclassified Back) |
| Renamed seeded exercise                     | Matched by deterministic id — reconciled                                                                                                       |
| Hard-deleted seeded exercise                | No row → nothing; ledger untouched → not resurrected                                                                                           |
| Edited weight/role on a seeded `back` row   | Carried verbatim to the target leaf                                                                                                            |
| Removed seeded `back` contribution          | No row → stays removed                                                                                                                         |
| Target leaf row already present (defensive) | `back` row left in place (visible as Unclassified Back) and logged — never merged, dropped, or double-written                                  |

Known caveat to document: the seed runs before the new build is live, so during the deploy window the old build briefly sees slugs it does not know (cosmetic; the same posture as migrate-before-deploy already accepted in implementation-plan §1.4). **Corrected by the approval amendment (§8): the window is not cosmetic — the old build's exercise editor fails on reconciled exercises and can write a new direct `back` row. A two-stage rollout is specified in ADR-010.**

## 3. Authoritative mapping — all 14 `back`-carrying slugs in the 92-entry catalog

| Slug                          | Current row      | Target                 |
| ----------------------------- | ---------------- | ---------------------- |
| `cable-lat-pulldown`          | `back` primary   | `lats` primary         |
| `bodyweight-pull-up`          | `back` primary   | `lats` primary         |
| `bodyweight-chin-up`          | `back` primary   | `lats` primary         |
| `machine-assisted-pull-up`    | `back` primary   | `lats` primary         |
| `cable-straight-arm-pulldown` | `back` primary   | `lats` primary         |
| `barbell-row`                 | `back` primary   | `upper_back` primary   |
| `dumbbell-row`                | `back` primary   | `upper_back` primary   |
| `cable-seated-row`            | `back` primary   | `upper_back` primary   |
| `machine-seated-row`          | `back` primary   | `upper_back` primary   |
| `barbell-pendlay-row`         | `back` primary   | `upper_back` primary   |
| `machine-t-bar-row`           | `back` primary   | `upper_back` primary   |
| `bodyweight-inverted-row`     | `back` primary   | `upper_back` primary   |
| `barbell-deadlift`            | `back` secondary | `upper_back` secondary |
| `other-trap-bar-deadlift`     | `back` secondary | `upper_back` secondary |

Rule: vertical pulls and shoulder-extension arcs → `lats`; horizontal rows → `upper_back`; hinge-family secondaries → `upper_back`. Role and weight are preserved in every row. The remaining 78 slugs carry no `back` row and are untouched.

## 4. Document-change plan

| File                                                     | Change                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/reviews/pre-phase-6-muscle-taxonomy-evaluation.md` | Dated addendum plus a pointer at the top: corrected mechanism (§7.2 "journaled SQL migration" was wrong — slugs are not persisted and ids are app-derived), Unclassified Back semantics (§6.2 overstated `Back = Lats + Upper Back`), revised cost/risk. Original text left intact — no silent rewrite.                                                 |
| `docs/architecture/domain-model.md`                      | §2 rewrite (final vocabulary, leaf vs rollup, `kind`, membership constant, mutation rules, corrected "purely additive" claim, `lower_back` clarification); §3 contribution invariant; §8 rollup/unclassified; §9 row; §10 invariant 5 extended (keeps the "ten invariants" count intact).                                                               |
| `docs/architecture/data-model.md`                        | §2.3 `kind`; §2.5 leaf-only rule + carry-through + reconciliation note; §2.17 rollup attachment note; §4 table row; §5 rollup totals and `unclassifiedBack` never persisted.                                                                                                                                                                            |
| `docs/architecture/volume-model.md`                      | §1 definitions; §2 leaf + rollup aggregation with `unclassifiedBack` and per-set raw dedupe; §3 sum-preservation note; §4 RP Back → rollup, landmark-less leaves; §5 new framing rule; §6 remove "no splits beyond 15", fix 8-week → trailing 4 weeks.                                                                                                  |
| `docs/architecture/implementation-plan.md`               | §1.4 seeds sentence extended (state-predicated reconciliation steps); new **"Pre-Phase 6 — Muscle Taxonomy v2 (size S–M)"** between Phase 5 and Phase 6 (builds, reconciliation sequence, tests including the Phase 5.5 review's mutation harness, acceptance, exclusions); Phase 6 consumes the leaf/rollup model; §3 dependency line. No renumbering. |
| `docs/architecture/evidence-to-design.md`                | New row 19: the split and partition as a labeled modeling heuristic; the not-justified column prohibits per-leaf RP landmark invention and anatomical-stimulus claims.                                                                                                                                                                                  |
| `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md`    | New, in ADR-007 house style: context, options, decision, sum-preservation invariant, identity/reconciliation mechanism, Unclassified Back behavior, authoritative mapping table, deployment scenarios, rollback/recovery expectations.                                                                                                                  |
| `docs/reviews/pre-phase-6-muscle-taxonomy-rescope.md`    | New closeout report.                                                                                                                                                                                                                                                                                                                                    |

## 5. Deliberately unchanged

- `docs/architecture/mvp-scope.md` — F2/F8 wording remains true ("per-muscle", editable defaults, hand-computed fixture); the "no splits beyond 15" exclusion lives only in volume-model §6.
- `docs/architecture/open-decisions.md` — OD-03 (as-of contribution history) stays parked unchanged; the sum-preservation invariant removes any as-of need, recorded in ADR-010 and the closeout rather than by editing the register.
- `docs/architecture/deviations.md` — this is an accepted architecture rescope; no unresolved contradiction was found.
- Every user-owned file (`CLAUDE.md`, HANDOFF changes, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`) and every Phase 5.5 Light working-tree file.
- Prettier will be run only on the documentation files this pass owns. No application test suite run for a documentation-only pass. No production access, commit, push, or deploy.

## 6. Expected closeout verdict

Barring surprises during the edits: **READY FOR INDEPENDENT ARCHITECTURE REVIEW**.

## 7. Approval

Sections 1–5 approved by the product owner on 2026-08-23, explicitly including: the 17 leaves + `back` rollup model; "Lower Back (Erectors)"; partitioned seeded mappings; `upper_back` for the deadlift / trap-bar deadlift secondaries; no compound adductor retrofit; `machine-hip-adduction` as the first honest adductor entry; legacy direct Back as visible Unclassified Back; conditional idempotent reconciliation without a ledger; the complete 14-slug mapping table.

## 8. Required amendment (approved together with sections 1–5)

1. **Prove the deploy compatibility window instead of calling it cosmetic.** Verified against the live build's actual paths (`src/domain/exercises/schema.ts`, `src/app/api/exercises/**`, `src/server/exercises/service.ts`, `src/ui/exercises/*`): the old build's `PATCH /api/exercises/:id` rejects `lats`/`upper_back` with a 400 (editing any field of a reconciled exercise is blocked, with a misleading message); the editor's unmatched `<select>` lets the user re-save with `back`, which the delete-all-and-reinsert update path writes as a new direct `back` row — undoing the reconciliation; the library renders the literal text `undefined` for reclassified primaries; Today/workout/history are unaffected (no contribution readers outside the exercises service); `kind` is invisible to the old build (no runtime reader of `muscle_groups`). **Not provably safe → two-stage rollout**: a capability release (schema, vocabulary, read compatibility, leaf-only creation validation with legacy carry-through, reclassify affordance; no reconciliation; catalog unchanged), then a data release (catalog remap, reconciliation, `machine-hip-adduction`) whose seed runs under a live build that cannot write new `back` rows. Leaf-only creation enforcement is placed in the capability release deliberately — it is the precondition that makes the data release's seed window safe. No deployment infrastructure is added.
2. **Reconciliation reporting.** The step must print counts for updated rows, already-reconciled/missing rows, and target-leaf conflicts left as Unclassified Back; conflicts are reported with identifiers in deployment output and never silently ignored.

Binding text: ADR-010 and the amended architecture documents listed in §4.
