# Pre-Phase-6 Muscle Taxonomy Evaluation

Date: 2026-08-23
Evaluator: Claude Fable 5 (architecture/product evaluation only — no implementation)
Baseline analyzed: committed Phase 5 state at `1559e8c` ("fix: allow schedule and deload edits on an active block"). A concurrent agent is implementing Phase 5.5 Light (exercise-catalog expansion + decimal load-step polish, explicitly constrained to the existing 15 muscle groups) in the working tree; everything below describes the committed baseline unless explicitly marked as concerning Phase 5.5. This report is the only repository write of this evaluation. No accepted architecture document has been modified.

> **Correction notice (2026-08-23):** after product-owner acceptance, two material errors in this report were found and corrected in **§8a (Addendum)** below. §7.1 step 3, §7.2 ("journaled migration", "Idempotency", "Rollback") and §6.2's `Back = Lats + Upper Back` identity are superseded in part by the addendum; the original text is left intact so the correction is visible. The binding versions of the corrected semantics are `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` and the amended architecture documents.

---

## 1. The actual problem

Phase 6 is the moment the muscle taxonomy stops being a labeling vocabulary and becomes the unit of analysis. Until now, muscle groups only tag exercises in the library. Phase 6 binds four new artifacts directly to `muscle_groups` rows: the volume aggregation keys (`src/domain/volume`), the seeded RP landmark rows (`volume_landmarks.muscle_group_id`), the hand-computed acceptance fixture (implementation-plan Phase 6, "Tests"), and the volume screen itself (mvp-scope F8).

The current taxonomy merges all lat and mid-back pulling into one `back` group. Every other region of programming interest is already split — the deltoids into three heads, traps and forearms and lower back separated out. `back` is the single coarse bucket left, and it is the bucket that receives the most training volume for a typical hypertrophy trainee. Once Phase 6 ships, the merged group is baked into a live screen, seeded landmark rows, and an acceptance fixture; splitting it afterwards becomes a migration of a feature in active use rather than a vocabulary edit ahead of one.

The question is therefore not "is finer granularity better?" in the abstract. It is: **which taxonomy should Phase 6 bake in, given that changing it costs roughly one small phase today and materially more after volume features exist?**

---

## 2. Current state: constraints and contradictions

### 2.1 Facts (committed baseline)

1. **15 seeded groups, text-slug PK, add-only.** `chest, back, front_delts, side_delts, rear_delts, traps, biceps, triceps, forearms, abs, quads, hamstrings, glutes, calves, lower_back` (domain-model §2; `src/domain/exercises/muscleGroups.ts`). The slug set is centralized in one domain constant that also feeds the Zod validation enum and the seed. `muscle_groups` rows are upserted from that constant on every deploy (`src/db/seed/muscleGroups.ts`) — additions are trivially safe and idempotent.
2. **Contributions are per (exercise, muscle) rows** with `role: primary|secondary`, `weight ∈ (0,1]`, ≥1 primary per exercise, PK `(exercise_id, muscle_group_id)`, FK `RESTRICT` to `muscle_groups` (data-model §2.5).
3. **Volume is a pure read-time derivation under current contribution weights.** Nothing snapshots muscle data: `PrescriptionSnapshot` contains exercise id/name, scheme, RIR, progression, modifiers, prefill — no contributions (`src/domain/schemas/prescriptionSnapshot.ts`, verified). Sessions and set logs never reference muscles. Persisted volume aggregates are prohibited (architecture-plan §7; data-model §5). ADR-007 explicitly licenses contribution edits as uniform reinterpretation of all history.
4. **No volume code exists at HEAD.** There is no `src/domain/volume/`, no `volume_presets` or `volume_landmarks` table, no volume screen. Phase 6 is unbuilt. **No volume number has ever been rendered to the user.**
5. **The landmark model is taxonomy-agnostic** (free `key` vocabulary, per-muscle rows), but the _seeding plan_ is taxonomy-specific: RP's "Back" row maps to the single `back` group, rear/side delts get duplicated values, `forearms` and `lower_back` get no landmarks (volume-model §4; implementation-plan Phase 6). Precedent therefore already exists for groups without landmarks.
6. **Seed preservation semantics forbid re-touching applied catalog rows.** The `exercise_catalog_seed_log` ledger means a slug once applied to a user is never touched again — not re-inserted, not given fresh contributions — preserving user edits, removed contributions, and hard deletes (Phase 1 review H1, remediation-2; `src/db/seed/exercises.ts`). Consequence: **a contribution re-mapping cannot ride on the seed. It must be a one-time migration.**
7. **Committed catalog: 40 movements.** Seven carry `back` contributions (6 primary: barbell/dumbbell/cable-seated/machine-seated rows, lat pulldown, pull-up; 1 secondary: deadlift). Four carry `lower_back` (deadlift primary; squat, RDL, plank secondary). No adductor content exists anywhere.
8. **UI surface is small.** The contribution editor is a flat single-select per row (`src/ui/exercises/ContributionEditor.tsx`); the library lists primary-muscle display names; there is no muscle filter yet.
9. **Production reality:** single user (the product owner), kg, iPhone; Phases 0–5 deployed; execution history spans only the weeks since Phase 3 went live. History volume is small, and — per fact 4 — has never been viewed through a volume lens.

### 2.2 Contradictions and tensions

- **T1 — "additive, not a migration of meaning" is only half true.** domain-model §2 claims a future lats/upper-back split is "additive, not a migration of meaning." That holds only for the degenerate path of adding leaves while leaving `back` populated — which forks the vocabulary (old exercises on `back`, new ones on leaves) and makes region totals incoherent. A real split requires re-pointing existing contribution rows: a data migration. A well-bounded one (see §7), but the accepted doc understates it.
- **T2 — the accepted scope currently prohibits the change.** volume-model §6 lists "muscle-group splits beyond the seeded 15 groups" as out of MVP scope. Doing the split before Phase 6 is a formal rescope requiring document amendments (implementation-plan §0.5 deviation discipline), not a silent deviation. This report treats that as a gate, and §7.3 lists the exact documents.
- **T3 — minor doc drift (unrelated, flagged in passing):** volume-model §6 says "current week + last 8 weeks trend"; mvp-scope F8 and implementation-plan Phase 6 say current + trailing 4 weeks. Resolve whenever Phase 6 docs are next touched.
- **T4 — the product owner's working notes already lean one way.** `gpt-memory.md` (untracked working note, not accepted architecture) directs resolving taxonomy granularity before Phase 6 "because the volume model will otherwise bake in the current coarse `back` group." This evaluation is the formalization of that note, not a discovery of it — and it independently reaches the same conclusion.

---

## 3. Triage of the requested taxonomy

| Requested item                        | Status against current 15                                      | Representation verdict                     |
| ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| Lats                                  | **True addition** (from `back` split)                          | Leaf muscle group                          |
| Upper Back / Rhomboids                | **True addition** (from `back` split)                          | Leaf muscle group                          |
| Traps                                 | Exists (`traps`)                                               | Leaf, unchanged                            |
| Spinal Erectors                       | Exists as `lower_back` — same tracking bucket, different label | Keep `lower_back` slug; label choice only  |
| Rear Delts                            | Exists (`rear_delts`)                                          | Leaf, unchanged                            |
| Quads / Hamstrings / Glutes / Calves  | All exist                                                      | Leaves, unchanged                          |
| Adductors                             | **True addition** — purely additive, no remap of anything      | Leaf muscle group                          |
| Biceps / Triceps / Front / Side Delts | All exist                                                      | Leaves, unchanged                          |
| "Back" (region)                       | Exists as the merged group                                     | Becomes the **one analytical rollup** (§6) |
| "Legs", "Arms/Shoulders" (regions)    | Do not exist as data                                           | Pure display sections — no data entity     |

Two structural observations fall out of the request itself:

1. **Rear Delts appears in both the "Back" and "Arms/shoulders" regions of the request.** That is correct training vocabulary — and it proves regions are _display groupings_, not partitions. A strict parent/child hierarchy (Option D) would force rear delts to pick one parent; the request's own shape argues against hierarchy.
2. Everything requested either already exists, is a label question (`lower_back`), or is one of exactly **three additions** (`lats`, `upper_back`, `adductors`) plus the disposition of `back`. Net target: **15 → 17 leaves + `back` retained as a rollup**, zero forced renames.

Retained but unmentioned in the request: `chest`, `abs`, `forearms` — unchanged.

---

## 4. Options analysis

### Option A — Keep the flat 15 through MVP

- **Product value:** The weekly view cannot distinguish vertical from horizontal pulling. "Back: 20 effective" can hide 18 row-sets and 2 pulldown-sets — the single most common back-programming imbalance, and one of the few genuinely actionable reads a volume screen offers a hypertrophy trainee. Meanwhile side delts (an RP-combined row!) are already split. The asymmetry is hard to defend to the product's only user, who has already flagged it.
- **Honesty:** No new claims — honest by omission.
- **RP compatibility:** Cleanest — Back row → `back`, as specified.
- **History:** No change now; but the deliberate-reinterpretation license (ADR-007) gets more expensive to exercise with every week of Phase 6 usage: a later split lands on a live screen with weeks of viewed trend and user-edited landmark rows.
- **Cost:** Zero now. Later split costs everything in §7 **plus**: remapping `volume_landmarks` rows including the user's edited Back values (which leaf inherits an edited Back MEV? — no honest answer), rewriting the Phase 6 hand-computed fixture, reworking the volume screen grouping, re-accepting F8, a visible trend discontinuity in a screen in active use, and rework of Phase 9's per-muscle trend charts if deferred that far. Realistically 1.5–2× the pre-Phase-6 cost, plus product disruption that the pre-Phase-6 path avoids entirely.
- **Verdict:** Viable, ships Phase 6 fastest, and guarantees the expensive version of the same work later — the trigger is not hypothetical, it is the product owner's stated intent.

### Option B — Replace with a larger flat taxonomy (no rollups)

Adds the leaves but gives RP's Back landmarks nowhere honest to live. The two outcomes are both bad: drop the Back band entirely (the most-trained region loses its only reference range), or duplicate Back's MEV/MRV onto both `lats` and `upper_back` — false precision this task and the project's own evidence rules prohibit (RP's 10-set Back MEV is not 10+10). Option B is strictly dominated by Option C-lite, which costs one column and one domain constant more.

### Option C — Granular leaves + explicit analytical rollups (recommended, in a reduced form: **C-lite**)

Flat 17-leaf taxonomy plus **exactly one** data-anchored rollup: `back` = {`lats`, `upper_back`}. The existing `back` row survives with a new `kind: 'rollup'` marker; rollup membership is a domain constant (like the strategy registry — versioned code, not schema). Legs and Arms/Shoulders remain display sections with no data existence.

- **Product value:** Lat Pulldown and Chest-Supported Row produce distinguishable leaf data (`lats` vs `upper_back` primary) while the rollup row keeps the RP-comparable region total. The screen can show "Back 20 = Lats 6 + Upper Back 14" — the imbalance the merged group hides. Value lands at Phase 6, compounds at Phase 9.
- **Honesty:** The split is the same epistemic class as the existing chest/triceps 0.5 convention (evidence-to-design #6: weights are labeled conventions, editable, never biological constants). EVIDENCE-028 (regional non-uniformity of response) is the corpus's signal that per-muscle _tracking_ is useful; nothing supports per-leaf _landmarks_, so none are invented (GAP-01). Granularity stays at gym-programming vocabulary ("lats", "upper back") — the same level as the existing groups; no per-head splits. Contribution rows per exercise remain 1–5; fractional weights stay legible.
- **RP compatibility:** The RP table is itself flat, with separate Traps and Rear/Side Delts rows — RP's "Back" is lats + mid-back pulling. Landmarks attach to the rollup only; leaves get none (precedent: `forearms`, `lower_back` today). Double-counting is prevented by construction (§6.2). The "coaching heuristic" labeling is unchanged.
- **History:** With the sum-preserving mapping (§7.2), the rollup's historical series is _exactly identical_ to today's `back` series for all time, and leaf history is fully populated backward under the current-convention policy. Because no volume view has ever rendered, the reinterpretation is invisible by construction. No taxonomy versioning, no as-of mapping; OD-03 stays parked.
- **Cost:** One bounded pre-Phase-6 pass (§7): domain constant, one additive column, one data migration over ≤ ~50 contribution rows, catalog file update, editor validation tweak, tests. Phase 6 then builds once against the final taxonomy — its own size is unchanged.

### Option D — True parent/child hierarchy (`parent_id`)

Rejected. It buys nothing C-lite doesn't already provide and costs real complexity: (a) exactly one rollup is needed — the RP source data is flat, so there is nothing else to nest; (b) rear delts double-parents (the request itself lists it under two regions), so a single-parent tree is _wrong_, and a DAG is far worse; (c) hierarchy invites contributions at multiple levels, creating the double-count surface C-lite structurally avoids; (d) recursive aggregation and a two-level phone picker for a single-user MVP violates the project's anti-speculative-machinery ethos (architecture-plan §"explicitly rejected"). If a second genuine rollup ever appears, the C-lite domain constant extends to it without schema change — the hierarchy option loses even on its own future-proofing argument.

### A better option than the four listed?

The material improvement found is C-lite itself — Option C _reduced_: no rollup tables, no parent pointers, membership in domain code, and the pre-existing `back` row reused as the rollup anchor so that (a) RP seeding stays exactly as currently specified, (b) user-created `back` contributions remain valid without forced or fabricated remapping, and (c) rollback stays trivial. No option beyond that scope earns its complexity.

---

## 5. Option comparison

| Criterion                          | A: keep 15                             | B: flat replace            | **C-lite: leaves + 1 rollup**       | D: hierarchy           |
| ---------------------------------- | -------------------------------------- | -------------------------- | ----------------------------------- | ---------------------- |
| Pulldown vs row distinguishable    | No                                     | Yes                        | **Yes**                             | Yes                    |
| RP Back band retained honestly     | Yes (merged)                           | No (dropped or duplicated) | **Yes (on rollup)**                 | Yes (overbuilt)        |
| False-precision risk               | None                                   | High (leaf landmarks)      | **Low (labeled convention)**        | Medium (multi-level)   |
| Historical volume continuity       | n/a now; break later                   | Region total lost          | **Region series exactly invariant** | Depends on rules       |
| Schema change                      | None                                   | Group rows only            | **+1 column, +3 rows**              | +column +semantics     |
| Data migration                     | None now; larger later                 | Contribution remap         | **Contribution remap (bounded)**    | Remap + hierarchy fill |
| Phase 6 aggregation complexity     | Baseline                               | Baseline                   | **Baseline + one summed row**       | Recursive rollups      |
| Editing burden on phone            | Baseline                               | +2 dropdown options        | **+3 options, leaves only**         | Two-level picker       |
| Cost now                           | 0                                      | ~1 small phase             | **~1 small phase**                  | ~1 medium phase        |
| Cost if instead done after Phase 6 | 1.5–2× C-lite + live-screen disruption | same                       | —                                   | —                      |
| Fits single-user MVP ethos         | Yes                                    | Partly                     | **Yes**                             | No                     |

---

## 6. Recommended target model (C-lite)

### 6.1 Vocabulary

17 leaves + 1 rollup (18 `muscle_groups` rows):

- Unchanged leaves: `chest`, `front_delts`, `side_delts`, `rear_delts`, `traps`, `biceps`, `triceps`, `forearms`, `abs`, `quads`, `hamstrings`, `glutes`, `calves`, `lower_back`.
- New leaves: `lats` ("Lats"), `upper_back` ("Upper Back" — rhomboids/mid-traps region, convention documented), `adductors` ("Adductors").
- `back` ("Back") retained, `kind = 'rollup'`, members {`lats`, `upper_back`} defined in a domain constant. Contributions on rollups are rejected for **new** rows (service validation); **legacy** user rows pointing at `back` remain valid and are counted into the rollup directly (§7.2).
- `lower_back` keeps its slug and display name; it is documented as the spinal-erector bucket. A slug rename would force a PK/FK migration for zero analytical gain — declined. (The display name may say "Lower Back (Erectors)" if the product owner prefers; data-free choice.)
- Display sections on the volume screen ("Back", "Legs", "Arms & Shoulders", "Torso") are ordering/UI only, driven by `position` — no data entity, and a leaf (rear delts) may appear under whichever section the layout prefers.

### 6.2 Semantics

- **Partition convention (seeded defaults):** every existing `back` contribution maps to exactly one of {`lats`, `upper_back`}, preserving role and weight verbatim; no sibling secondaries are added by default. Consequences: the rollup's effective and raw series equal the historical `back` series _exactly, for all time_; RP Back landmark comparability is preserved to the set ("a row is one back set" — RP's own counting). Users may add sibling secondaries per exercise afterwards, accepting that the rollup then exceeds RP-style counting — their edit, labeled like every other weight edit.
- **Leaf numbers mean "sets directed at this muscle"** (a selection/distribution signal), not total anatomical stimulus — one caption on the volume screen, same register as the existing heuristic captions (volume-model §5).
- **Rollup aggregation:** computed at read time as the sum of member-leaf effective sets plus any legacy direct `back` contributions; raw direct sets dedupe per set (a set primary on both members counts once — impossible under partition defaults, possible after user edits). No persisted aggregates anywhere; architecture-plan §7 intact.
- **RP seeding (Phase 6, unchanged in mechanics):** Abs→`abs`, Back→`back` (rollup), Biceps, Triceps, Calves, Chest, Front Delts, Glutes, Hamstrings, Quads, Traps → their leaves; Rear/Side Delts → duplicated onto `rear_delts` + `side_delts` with the existing caveat note. **No RP rows** for `forearms`, `lower_back`, `lats`, `upper_back`, `adductors` — five landmark-less leaves where today's design already has two. Landmarks never attach to leaves of the Back rollup: the double-counting prohibition is structural, not editorial.

---

## 7. Recommendation: formally rescope and implement taxonomy v2 before Phase 6

**RESCOPE TAXONOMY BEFORE PHASE 6**, as the bounded C-lite pass below — inserted between Phase 5.5 Light and Phase 6, after Phase 5.5 merges.

**Why now beats deferring — the four decisive asymmetries:**

1. **Nothing downstream exists yet.** No volume code, tables, landmark rows, fixture, or screen. Every one of those artifacts binds to the taxonomy; built after the change, they are built once. Built before it, every one is rework.
2. **The reinterpretation window is open and closes at Phase 6.** ADR-007's current-convention policy makes the remap invisible today (no volume view has ever rendered) and guarantees leaf history populates backward. After Phase 6, the same change visibly rewrites a screen in daily use and touches user-edited landmark rows with no honest inheritance rule.
3. **The migration is at its lifetime minimum.** ~50 seeded contribution rows plus a handful of user-created exercises, one user, no landmark rows, sum-preserving by construction. Every later week adds user exercises, contribution edits, and (post-Phase-6) edited landmarks to migrate around.
4. **The trigger for the deferred version already fired.** The product owner has stated the intent (T4). "Defer" here does not mean "maybe never"; it means "definitely later, at 1.5–2× cost plus live-product disruption." When deferral no longer buys option value, its only remaining benefit is schedule — and the schedule cost is about one small phase in a personal product with no external deadline, where the quality of the volume feature is the point of Phase 6.

**Why the losing option (A: keep 15) is not preferred:** it optimizes Phase 6's start date by days while committing the project to the strictly worse version of certain future work, and it ships the volume feature — the MVP's analytical centerpiece — unable to answer the one distribution question (vertical vs horizontal pulling) its primary user already asks. Its honesty advantage is nil (C-lite invents no claims), and its cost advantage is negative over any horizon that includes the split actually happening.

This is not "BLOCKED ON PRODUCT DECISION": the open items in §7.4 are implementation-detail approvals inside the recommended direction, not forks that could reverse it.

### 7.1 Bounded pre-Phase-6 sequence ("taxonomy v2" pass, size S–M)

0. **Gate:** Phase 5.5 Light merged and verified. (Sequencing, not a change request — §8.)
1. **Docs pass** (§7.3) — amend the binding documents; product owner approves §7.4 decisions. No code until this lands.
2. **Vocabulary:** extend the domain constant (17 leaves + rollup metadata + display sections/positions); additive migration for `muscle_groups.kind`; seed upsert adds `lats`, `upper_back`, `adductors` and marks `back` as rollup.
3. **Data migration (one-time, journaled — not a seed):** re-point contributions per the approved mapping table (§7.2) covering every applied catalog slug including Phase 5.5's new ones; leave user-created rows on `back` untouched and flagged.
4. **Catalog file:** flip seeded definitions from `back` to leaf slugs so fresh installs are born correct (existing users are covered by step 3; the ledger keeps the two paths from overlapping).
5. **App surface:** contribution editor and service validation accept leaves only for new rows (legacy rollup rows render with a "reclassify?" nudge); library display unchanged mechanically.
6. **Tests + review:** per §7.5, then the project's standard independent review → remediation → verification gate.
7. **Deploy** (migration runs once via the normal CI release step), manual phone check; then start Phase 6 against the final taxonomy.

Explicit "not yet" list for the pass (binding): no `parent_id`, no landmark values for any new leaf, no muscle filters, no as-of history (OD-03 stays parked), no additional rollups, no retro-adding contributions to any existing exercise beyond the 1:1 remap.

### 7.2 Migration semantics

- **Rule:** for every existing contribution row on `back`, if the exercise is a seeded catalog row, `UPDATE` its `muscle_group_id` to the approved leaf, preserving `role` and `weight` verbatim. One row in, one row out; nothing inserted, nothing deleted. PK collisions are impossible (the target slugs did not previously exist). Preservation guarantees from Phase 1 extend naturally: user-edited weights/roles ride along; user-removed contributions have no row and stay removed; hard-deleted exercises have no rows and stay deleted.
- **Proposed mapping (product owner approves each row; Phase 5.5 slugs appended before implementation):** lat pulldown → `lats` P; pull-up → `lats` P; barbell/dumbbell/cable-seated/machine-seated rows → `upper_back` P; deadlift `back` S → `upper_back` S (scapular/mid-back retention; `lats` S equally defensible — flagged).
- **User-created exercises are never auto-remapped.** Rows on `back` stay valid (the rollup row persists), keep counting into the rollup, and are flagged in the editor for optional manual reclassification. No fabricated mapping, no dead "unclassified" state, and — single user — the backlog is a one-sitting cleanup at most. The migration logs the affected exercise names for the report.
- **`lower_back` rows: untouched.** `adductors`: referenced only by new catalog entries going forward; no retrofit (§7.4-5).
- **Idempotency:** drizzle migration journal guarantees once-per-database; the seed remains idempotent independently; re-running the seed never resurrects or re-touches anything (unchanged ledger semantics).
- **Rollback:** the inverse mapping (`lats`/`upper_back` → `back`) is mechanically derivable from the forward table and safe until post-migration contribution edits accumulate; beyond that window, Flexible Server PITR (7-day) covers catastrophe. Landmarks are unaffected in either direction (none exist yet; later ones attach to the surviving `back` row).

### 7.3 Binding documents that must change before implementation

1. `docs/architecture/domain-model.md` §2 (slug list, rollup concept, corrected "additive" claim per T1) and §9 (MuscleGroup row).
2. `docs/architecture/volume-model.md` §4 (RP mapping: Back → rollup; landmark-less leaves list) and §6 (remove/replace the "no splits beyond 15" Out-item — this is the formal rescope).
3. `docs/architecture/data-model.md` §2.3 (`kind` column) and a §2.5 note (leaf-only validation for new contribution rows).
4. `docs/architecture/implementation-plan.md` — insert the taxonomy pass between Phases 5.5 and 6; reword the Phase 6 "merged back" caveat to the rollup semantics.
5. `docs/architecture/evidence-to-design.md` — new row for the back split + partition convention (tier: programming heuristic; not-justified column: per-leaf landmarks, anatomical stimulus claims), per its own standing rule 1.
6. Recommended: a short `adr/ADR-010-muscle-taxonomy-v2.md` capturing the decision, the partition convention, and the sum-preservation invariant. `mvp-scope.md` F8 and `open-decisions.md` need no change.

### 7.4 Decisions requiring product-owner approval

1. Final leaf set and display order (17 as specified; `lower_back` display label).
2. The per-slug mapping table, including Phase 5.5's new pull slugs (one flagged ambiguity: deadlift).
3. Partition vs overlapping defaults for the back leaves (recommended: partition).
4. User-created `back` exercises: leave-and-flag (recommended) vs a one-time manual pre-classification sitting.
5. Adductors retrofit to existing compounds: none (recommended) vs adding secondaries to squat/leg-press variants.
6. Whether the rollup row also displays raw direct sets (recommended: yes, per-set deduped).

### 7.5 Acceptance tests and rollback verification

- **Sum-preservation invariant (the load-bearing test):** for a fixture with mixed historical sessions, weekly effective and raw series for the `back` rollup after migration ≡ the merged `back` series before, for every week. Also spot-verified against a copy of production data locally during review.
- Seed idempotency re-run (existing suite) plus: migration preserves an edited weight, does not resurrect a removed contribution or hard-deleted exercise, leaves user-created `back` rows untouched, and is a no-op on second application.
- Validation: new contribution rows on `back` rejected; legacy rows still readable and counted.
- Editor/library render 17 leaves correctly on the phone (manual iPhone check per project DoD).
- Phase 6's hand-computed fixture is then authored once against the final taxonomy, including one rollup case with a legacy direct-`back` contribution.
- Rollback rehearsal: apply inverse mapping on a local copy and re-assert the old fixture.

---

## 8. Concurrent Phase 5.5 Light

**Phase 5.5 Light can land unchanged.** Its 15-group constraint is correct for its scope: new catalog entries mapping pulls to `back` are precisely covered by the migration's mapping table, provided that table is authored _after_ 5.5 merges and covers its slugs (sequencing handled in §7.1 step 0). Decimal load-step polish is orthogonal. Nothing in this evaluation asks 5.5 to change, pause, or rework.

Catalog choices Phase 5.5 should avoid because they would prejudice the taxonomy (or create avoidable cleanup):

1. **Do not seed an exercise whose only honest primary is missing from the 15** — concretely, a Hip Adduction machine (would force a false `glutes`/`quads` primary). Defer that single entry to the taxonomy pass. (Hip _Abduction_ → `glutes` primary is fine — glute med is the abductor. Back Extension → `lower_back` primary is fine.)
2. **Do not fake granularity with duplicate pseudo-variants** ("Lat-Focused Row" vs "Row") or by encoding region intent in names/notes — the split arrives as data, not naming.
3. **Keep back-side pulls on `back` primary** — do not creatively promote `traps`/`rear_delts` to primary on rows to pre-differentiate them; that would distort both today's counting and the remap.
4. Optional but helpful: set `movement_pattern` consistently on new pulls (`vertical_pull` / `horizontal_pull`) — it makes the mapping table mechanically derivable. Stable slugs are already required and assumed.

---

## 8a. Addendum (2026-08-23) — corrections after product-owner acceptance

The product owner accepted the recommendation and the C-lite model in principle, then identified two material gaps. Both are corrected here; the original sections above are deliberately left as written. The authoritative statements now live in ADR-010 and the amended architecture documents; this addendum records what changed and why.

### 8a.1 Correction 1 — the migration mechanism in §7.1 step 3 and §7.2 was wrong

**What the report claimed:** a "one-time, journaled" SQL/data migration that re-points seeded contributions "per the approved mapping table", with idempotency guaranteed by the drizzle migration journal.

**Why it was wrong:** catalog slugs are not persisted on `exercises`; seeded exercise ids are derived in application code (`seededExerciseId(userId, slug)` in `src/db/seed/exercises.ts`, SHA-1 based) and `exercise_catalog_seed_log` records `(user_id, slug)` only; exercise names are mutable. A plain Drizzle SQL migration therefore cannot select renamed seeded exercises by slug without reproducing the hash in SQL (pgcrypto) or matching on mutable names — both rejected.

**Corrected mechanism (binding text in ADR-010 §"Decision" and implementation-plan "Pre-Phase 6"):**

- A schema migration adds only vocabulary/kind support (`muscle_groups.kind`). No data motion in SQL.
- Reconciliation is an application-code step in the normal seed pipeline, after muscle groups are seeded and before the catalog seed: for each user and each mapped slug it derives the seeded id with the existing helper and runs a conditional update restricted to `exercise_id = <derived id> AND user_id = <user> AND is_seeded = true AND muscle_group_id = 'back' AND NOT EXISTS (row on the target leaf)`. Role and weight are not touched.
- **No reconciliation ledger.** The end state is a predicate on the data ("no `back` row on a seeded exercise"), so the update is self-evidencing: the first run re-points rows, every later run updates zero rows, and a restore from a pre-taxonomy backup is reconciled again automatically — which a ledger would wrongly skip. The Phase 1 catalog seed needs its ledger precisely because a missing row cannot be distinguished from a deleted one; here the distinction is unnecessary.
- The step reports counts in deployment output — `updated`, `noop` (seeded row missing or no `back` row: already reconciled, removed, deleted, never applied, or name-collided), `conflicts` (target leaf row already present; the `back` row is left in place as Unclassified Back and reported with identifiers) — plus an informational count of user-created exercises still holding a direct `back` row.
- The catalog definitions are updated to the new leaves so fresh and not-yet-applied entries seed correctly; Phase 5.5's seven new `back`-carrying slugs are covered by the authoritative 14-row mapping in ADR-010.
- "Rollback" in §7.2 is re-stated: the inverse is the same conditional-update mechanism with the mapping reversed, scoped to seeded ids, never a SQL migration; PITR remains the catastrophe path.

### 8a.2 Correction 2 — `Back = Lats + Upper Back` (§6.2) is not always true

Because user-created exercises may keep a direct `back` contribution (deliberately never auto-remapped), the rollup total is `Back = Lats + Upper Back + Unclassified Back`. The honest model, now binding in volume-model §2 and ADR-010:

- new contributions cannot target a rollup; an existing direct rollup row may be carried through an edit (the editor uses delete-all-and-reinsert) but never introduced;
- legacy direct-`back` rows stay readable and count toward the Back total, exposed separately as `unclassifiedBack`;
- the volume UI shows the reconciliation line and hides the unclassified term when it is zero;
- the exercise editor offers explicit manual reclassification without forcing or fabricating a choice;
- no direct contribution is silently discarded or double-counted.

### 8a.3 Correction 3 — the deploy compatibility window is not cosmetic; two-stage rollout

The plan document (`pre-phase-6-muscle-taxonomy-rescope-plan.md` §2) called the migrate → seed/reconcile → deploy window "cosmetic". Checking the live build's actual paths disproved that: `PATCH /api/exercises/:id` validates contributions against the 15-slug enum, so editing any field of a reconciled exercise would fail with a misleading 400, and the editor's unmatched select lets the user re-save the exercise with `back`, undoing the reconciliation. Today/workout/history are unaffected (no contribution readers outside the exercises service) and `kind` is invisible to the old build, but the editor failure and the write-back race are real. ADR-010 and the implementation plan therefore specify a **two-stage rollout**: a capability release (schema, vocabulary, read compatibility, leaf-only creation validation with legacy carry-through, reclassify affordance; no reconciliation, catalog unchanged) followed by a data release (catalog remap, reconciliation with count reporting, `machine-hip-adduction`) that runs its seed under a live build that provably cannot write new `back` rows.

### 8a.4 Revised cost/risk

- Work: roughly unchanged overall. Removed: the SQL data migration. Added: the reconciliation step with reporting, the carry-through validation rule, the Unclassified Back aggregation term and UI line, the reclassify affordance, and one extra (small) deployment. Net: still S–M, but two deploys instead of one.
- Risk: lower than the original plan. Identity is by deterministic id (no renamed-exercise misses, no name matching), idempotency is state-derived (restore-safe), conflicts are impossible by construction and visible if they ever occur, and the two-stage rollout removes the only window in which old code could corrupt new data semantics.
- The verdict and the recommendation are unchanged.

---

## 9. Verdict

**RESCOPE TAXONOMY BEFORE PHASE 6**
