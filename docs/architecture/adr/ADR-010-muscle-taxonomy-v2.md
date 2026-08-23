# ADR-010: Muscle taxonomy v2 — granular leaves, one derived rollup, state-predicated reconciliation

## Status

Accepted (2026-08-23) — product-owner approval recorded in `docs/reviews/pre-phase-6-muscle-taxonomy-rescope-plan.md`; evaluation in `docs/reviews/pre-phase-6-muscle-taxonomy-evaluation.md` (with its dated correction addendum). Supersedes domain-model §2's original "`back` is one group; a future split is additive" statement. Implements as the "Pre-Phase 6 — Muscle taxonomy v2" pass in `implementation-plan.md`.

## Context

Phase 6 (weekly volume) binds the muscle vocabulary into aggregation keys, seeded RP landmark rows, a hand-computed acceptance fixture, and the volume screen. At the time of this decision none of those exist: no `src/domain/volume`, no `volume_presets`/`volume_landmarks`, and no volume number has ever been rendered. The vocabulary is 15 flat groups, granular everywhere (three deltoid heads, traps, forearms, lower back) except `back`, which merges all lat and mid-back pulling — the region with the most weekly sets for a hypertrophy trainee and the one whose internal distribution (vertical vs. horizontal pulling) is the most common actionable read of a volume screen. The product owner asked whether to split it before Phase 6 or after.

Constraints that shaped the answer:

- Volume is a read-time interpretation under _current_ contribution weights (ADR-007); nothing snapshots muscle data (`PrescriptionSnapshot` carries none; verified). A taxonomy change therefore touches only `muscle_groups`, `exercise_muscle_contributions`, and (once they exist) `volume_landmarks` — never history.
- RP's landmark table (`docs/input/rp-volume-landmarks.md`) is flat and coarse: one "Back" row, separate Traps and Rear/Side Delts rows, no erector, forearm or adductor rows. Its numbers are coaching heuristics (GAP-01).
- Seeded exercises are identified by an id derived in application code (`seededExerciseId(userId, slug)`); catalog slugs are not persisted; names are mutable; the catalog ledger (`exercise_catalog_seed_log`) never re-touches applied rows (Phase 1 H1). User edits, removed contributions and hard deletes must survive any change.
- The deploy pipeline runs `db:migrate → db:seed → app deploy`, so seed-time data changes execute under the previous build.
- Phase 5.5 Light's remediated 92-entry catalog (remediation implementation complete; targeted closeout verification still pending at the time of this decision) has 14 entries carrying a `back` contribution (7 original, 7 new), all constrained to the 15-group vocabulary by design. **Taxonomy implementation is gated on a successful Phase 5.5 verification verdict**; if that verification changes a `back`-carrying slug, the mapping table below must be re-checked before Release 2.

## Decision

### Vocabulary

**17 leaves + exactly one rollup**, all rows of `muscle_groups`, distinguished by a new column `kind` (`'muscle' | 'rollup'`, default `'muscle'`):

- Leaves: `chest`, `lats` (new), `upper_back` (new — rhomboids / mid- and lower-trapezius region), `front_delts`, `side_delts`, `rear_delts`, `traps` (upper-trapezius shrug work), `biceps`, `triceps`, `forearms`, `abs`, `quads`, `hamstrings`, `glutes`, `adductors` (new), `calves`, `lower_back` (slug retained; displayed **"Lower Back (Erectors)"** — the spinal-erector / lower-back tracking bucket).
- Rollup: `back` ("Back") with members `lats` + `upper_back`, defined by a domain constant (`ROLLUP_MEMBERS`), not a table and not a `parent_id`. `traps`, `rear_delts`, `lower_back` are not members (RP treats them separately or not at all).
- Display sections (Back, Legs, Arms & Shoulders, Torso) are UI ordering only.
- Mutation rules: add-only; `kind` immutable; any further group, split, rollup or hierarchy requires amending this ADR.

### Contribution rules

- **Leaf-only for new rows.** Create rejects rollup slugs. Update — which replaces the whole contribution list — accepts a rollup slug only as carry-through of a row that already exists on that exercise. Consequently the app can never _create_ a direct `back` row after Release 1 (below); legacy rows can be kept, edited, removed, or reclassified.
- **Seeded partition convention.** Every seeded `back` row maps to exactly one of `lats` / `upper_back` per the authoritative table below, role and weight preserved, no sibling secondaries added. Users may add sibling secondaries, accepting that the rollup then exceeds RP's one-set-per-exercise counting.
- **No automatic inference** for user-created exercises: their direct `back` rows are never auto-remapped.

### Aggregation (binding detail in `volume-model.md` §2)

- `effective(back) = effective(lats) + effective(upper_back) + unclassifiedBack`, where `unclassifiedBack` is the weight contributed by legacy direct `back` rows.
- `raw(back)` counts a set at most once if it has a primary contribution on any member leaf or directly on the rollup.
- The UI renders `Back = Lats + Upper Back + Unclassified Back`, hiding the last term when zero. Nothing is persisted; no grand total exists, so no set is counted twice anywhere.
- RP "Back" landmarks attach to the `back` rollup only. `lats`, `upper_back`, `adductors`, `forearms`, `lower_back` receive no RP landmarks and display without a band or invented range.

### Sum-preservation invariant

Because each seeded `back` row moves to exactly one member leaf with role and weight unchanged, and no other row changes:

> For every week, `effective(back)` and `raw(back)` computed after reconciliation equal the merged `back` series computed before it.

Leaf series (`lats`, `upper_back`) are therefore _deliberately re-interpreted for all history_ under the current convention (ADR-007) — they are fully populated backward, not "started today" — while the region total the user would have compared against RP is reproduced exactly. No as-of mapping is needed; OD-03 stays parked. Asserted at the row level in the taxonomy pass (per-exercise multiset of `(role, weight)` over `{lats, upper_back, back}` before/after) and at the aggregation level by the Phase 6 fixture.

### Reconciliation mechanism (identity without persisted slugs)

A SQL migration cannot safely select renamed seeded exercises: slugs are not stored, names are mutable, and reproducing the id hash in SQL would need pgcrypto. Both name matching and pgcrypto are rejected. Instead:

1. The schema migration adds only `muscle_groups.kind`. No data motion in SQL.
2. `runSeed` gains a step, ordered `seedMuscleGroups → reconcileContributions → seedExerciseCatalogForAllUsers` (so the target leaves exist for the FK, and old rows are handled before new entries seed). For every user and each mapped slug it derives the id with the existing `seededExerciseId(userId, slug)` helper and runs one conditional update:

   ```text
   UPDATE exercise_muscle_contributions
   SET    muscle_group_id = <target>, updated_at = now()
   WHERE  exercise_id = <derived id>
     AND  muscle_group_id = 'back'
     AND  EXISTS (SELECT 1 FROM exercises e
                  WHERE e.id = <derived id> AND e.user_id = <user> AND e.is_seeded = true)
     AND  NOT EXISTS (SELECT 1 FROM exercise_muscle_contributions t
                      WHERE t.exercise_id = <derived id> AND t.muscle_group_id = <target>)
   ```

   `role` and `weight` are not in the `SET`.

3. **No reconciliation ledger.** The desired end state is a predicate on the data ("no `back` row on a seeded exercise"), so the update is self-evidencing: the first run re-points rows, every later run updates zero rows, and a database restored from a pre-taxonomy backup is reconciled again automatically — a ledger would wrongly report that work as done. (The Phase 1 catalog seed needs its ledger because a _missing_ row cannot be distinguished from a deleted one; here no such ambiguity exists.)
4. **Reporting is mandatory.** One summary line per run in deployment output: `taxonomy-v2 reconciliation: users=N mapped=M updated=U noop=K conflicts=C customDirectBack=D`. `noop` = seeded row missing or no `back` row (already reconciled, removed, hard-deleted, never applied, or name-collided). `conflicts` = a row on the target leaf already exists — the `back` row is left in place (it shows as Unclassified Back) and reported on its own line with user id, slug, exercise id and target in GitHub Actions `::warning::` format so it appears as a run annotation. `customDirectBack` = user-created exercises still holding a direct `back` row (informational, for the owner's manual reclassification). Conflicts are unreachable by construction; if one appears it is never silent and never fails the deploy, because the resulting state is honest and resolvable in the editor.
5. The catalog definitions switch to the leaf slugs so fresh databases and not-yet-applied entries seed correctly; the catalog contribution type is narrowed to leaves.

### Authoritative mapping (all 14 `back`-carrying slugs of the 92-entry catalog)

| Catalog slug                  | Current row      | Target                 |
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

Rule: vertical pulls and shoulder-extension arcs → `lats`; horizontal rows → `upper_back`; hinge-family isometric mid-back involvement (deadlift, trap-bar deadlift) → `upper_back`, keeping `lats` a clean vertical-pull signal and matching the `traps` secondary those entries already carry. The remaining 78 catalog slugs carry no `back` row and are untouched. This table is binding for the implementation; a row may change only by amending this ADR.

### Two-stage rollout (compatibility proven, not assumed)

Against the build live at the time of this decision, a single deploy is **not** safe: its `PATCH /api/exercises/:id` validates contributions with the 15-slug enum (any save of a reconciled exercise fails with a 400 and a misleading message), its editor's unmatched `<select>` lets the user re-save with `back` — which the delete-all-and-reinsert update writes as a new direct `back` row, undoing the reconciliation — and its library renders the literal text `undefined` for reclassified primaries. Today/workout/history never read contributions, and `kind` is invisible to that build (no runtime reader of `muscle_groups`). Therefore:

- **Release 1 — capability:** `kind` migration; 18-row vocabulary seed; read compatibility; leaf-only creation validation with legacy carry-through; reclassify affordance. Catalog unchanged; no reconciliation. After this release the live app cannot write a new direct `back` row — and it _can_ write leaf rows, which makes Release 1 the point of no return for app rollback (see "Rollback and recovery").
- **Release 2 — data:** catalog remap + `machine-hip-adduction`; reconciliation with reporting. Its seed runs under Release 1, which reads every slug and cannot reintroduce `back`. Residual race: a user who opens a legacy exercise before the reconciliation commits and saves it within the seconds of the seed step may carry its `back` row through; the next seed run reconciles it and the counts show it. Accepted.

Leaf-only enforcement sits in Release 1 deliberately: it is the precondition that makes Release 2's window provably safe. No deployment infrastructure, feature flag, or pipeline reordering is added.

Deployment scenarios (Release 2 seed):

| Scenario                                    | Outcome                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing user, all 92 slugs applied         | up to 14 rows re-pointed; later deploys `updated=0`                                                                                                  |
| Existing user, only the original 40 applied | 7 rows re-pointed, then the 52 newer slugs (+ `machine-hip-adduction`) seed from the leaf-targeting catalog                                          |
| Fresh user / fresh database                 | no `back` rows ever exist; catalog seeds leaves; `updated=0`                                                                                         |
| Seeded slug skipped by a name collision     | no seeded row for that id → `noop`; the user's custom exercise is untouched (a `back` row on it is Unclassified Back, counted in `customDirectBack`) |
| Renamed seeded exercise                     | matched by deterministic id → reconciled                                                                                                             |
| Hard-deleted seeded exercise                | no row → `noop`; ledger untouched → never resurrected                                                                                                |
| Edited weight / role on a seeded `back` row | carried verbatim to the target leaf                                                                                                                  |
| Removed seeded `back` contribution          | no row → `noop`; stays removed                                                                                                                       |
| Target leaf row already present (defensive) | `back` row left in place, reported as a conflict; never merged, dropped, or double-written                                                           |

### Rollback and recovery

- **Release 1 is the point of no return for app rollback, not Release 2.** Release 1 already permits creating and reclassifying contributions onto `lats` / `upper_back`, and the pre-Release-1 build rejects those slugs on write and misrenders them on read (the 15-slug enum — see the proof above). Rolling back to the pre-Release-1 build is therefore safe **only while no leaf contribution has been written**: the schema column and the three new `muscle_groups` rows alone are harmless to that build, which never reads the table at runtime. The Release 1 phone-acceptance step itself ("a new pull can be created on Lats / Upper Back") writes a leaf row and closes that window. After phone acceptance, or after any leaf write, rollback below Release 1 is **unsupported** — roll _forward_ by default.
- After Release 2, the same rule holds and the state is honest under Release 1 or any later build. If a data reversal of the seeded remap is ever required, it is the same state-predicated mechanism with the mapping inverted and scoped to seeded ids (never a SQL migration); user rows on the new leaves remain valid under any v2 build.
- Catastrophe path only: Flexible Server PITR (7-day) — never a routine rollback tool, since it discards every set logged after the restore point.
- Landmarks are unaffected in every direction: none exist before Phase 6, and later ones attach to the surviving `back` row.

## Alternatives considered

- **Keep the 15-group vocabulary through MVP** — ships Phase 6 a little sooner and then guarantees the same work later at 1.5–2× cost against a live screen, user-edited Back landmark rows with no honest inheritance rule, and a visible trend discontinuity; the owner had already stated the intent to split, so deferral bought no option value.
- **Flat 17 with no rollup** — drops RP's Back band or duplicates it onto both leaves; both dishonest. Strictly dominated by one column plus one constant.
- **`parent_id` hierarchy / DAG / rollup tables** — one real rollup does not justify recursive aggregation, multi-level contributions (the double-count surface this decision avoids), or a two-level phone picker; rear delts would need two parents; RP's own table is flat.
- **Journaled SQL data migration** (the evaluation's original proposal) — impossible without reproducing the id hash in SQL or matching mutable names; replaced by the application-code reconciliation above.
- **Reconciliation ledger** — strictly less robust than state-predicated idempotency for a step whose end state is expressible as a predicate (restore-safety).
- **Single deploy** — disproved against the live build's editor paths; replaced by two ordinary releases rather than pipeline changes or flags.
- **Automatic remap of user-created `back` rows by name or pattern** — fabrication; replaced by visible Unclassified Back plus manual reclassification.

## Consequences

- Phase 6 is built once against the final vocabulary; its fixture includes a rollup case, a legacy direct-`back` case, and a raw-deduplication case, and asserts the sum-preservation invariant.
- Exercise creation on a phone gains three dropdown options and loses one (`back`); creating a pull means choosing Lats or Upper Back — the same single choice as before.
- The volume screen shows 17 leaf rows plus the Back reconciliation line; five leaves display without reference bands (two already did).
- The seed pipeline prints a reconciliation summary on every deploy; `conflicts=0` and `customDirectBack` are the owner's reclassification backlog.
- domain-model §2, data-model §2.3/§2.5/§2.17/§4/§5, volume-model §1–6, implementation-plan (§1.4, Pre-Phase 6, Phase 6, §3), evidence-to-design #19 were amended in the same pass; mvp-scope and open-decisions needed no change.
- Any further taxonomy change — a second rollup, another split, sub-heads — re-opens this ADR rather than a seed file.
