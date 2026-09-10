# Exercise catalog expansion — authored catalog specification (Catalog Expansion 1)

Date: 2026-09-09 (finalized the same day; revised the same day against the independent review)
Status: **Revised — all findings addressed; no owner decision remains.** Nothing implemented, seeded, committed, pushed or deployed. No database was contacted. ADR-010 is **not** amended by this document; §12.4 drafts the amendment for the implementation commit.

**Review answered:** `docs/reviews/exercise-catalog-expansion-review.md` (2026-09-09, verdict **REVISION REQUIRED**; H-1, H-2, M-1…M-4, L-1…L-10, and the new decision D-CE1-1). That document is not modified by this revision; §19 maps every finding to its change. The reviewer's technical traces were re-verified against the source at `HEAD` before being adopted — including the two that contradicted this document (L-1's `barbell-deadlift` primary and M-3's eligibility tally), both of which were confirmed against the code and corrected here.

**Nothing in the approved catalog changed.** The 24-entry manifest (§6), the `SeedCatalogExercise` literals (§10), the measurement shapes (§7), the deduplication (§8), the placement plan (§11.5) and the no-migration analysis (§12.5) are unchanged in substance; the review found no defect in any of them. What changed is the rollout analysis (§12.6), the operational controls (§16.7), one new bounded UI hardening (§12.8), and a set of rationale, footprint, assertion and wording corrections.
Repository state: branch `main`, `HEAD = 56ec000` ("feat: add athletic measurement profiles release 3 catalog"), working tree carrying the pre-existing uncommitted changes listed in §1.2, none of which this document touches.

**Owner selection (2026-09-09).** The owner selected all 21 candidates of the first draft, plus six further exercises "only where they are not already represented". §8 resolves those six: two are already seeded, one supersedes an existing candidate rather than adding to it, two are new, and one — Tibialis Raise — required a vocabulary decision.

**Owner decisions O-1…O-5 (2026-09-09) — all five accepted as recommended.** O-1: Kettlebell Swing is `other` equipment with `volumeCounting` `auto`. O-2: Cable Pallof Press is `load_reps`. O-3: Rack Pull stays generic, with the constant-pin-height convention documented on the entry. O-4: Power Clean keeps `strengthEstimate` `auto`. O-5: a `tibialis` leaf is added through a minimal ADR-010 amendment, and Tibialis Raise is included.

**Owner decision D-CE1-1 (2026-09-09) — accepted, option (a). A separate decision, not part of O-1…O-5.** The independent review established (H-2) that the stale-client rollout exposure had never been put to the owner: O-5 decided that the leaf and the exercise ship, and the hazard was derived afterwards, inside a section written after that decision. It has now been decided on its own terms:

> **One delivery on the unchanged deployment pipeline**, with (i) a **mandatory** client-update step — apply the update on every client used with the account and confirm "Tibialis (Shin)" is selectable in the contribution picker **before** the new exercise is opened or used; (ii) a **post-deployment read-only verification** that `bodyweight-tibialis-raise` holds exactly one `tibialis` primary contribution at weight 1.0 and **no `calves` contribution in either role**; and (iii) **forward hardening** of `ContributionEditor` and `contributionMuscleLabel` in the same delivery.

The review's options (b) — reordering the deploy workflow — and (c) — two releases — were both declined. All 24 additions and all five earlier decisions are unchanged by this. **Nothing in §6–§12 is pending; the six decisions are recorded as accepted in §13 and are not reopened below.**

### Scope boundary

Additive catalog entries using existing capabilities, **plus two bounded exceptions**: (1) the vocabulary change authorised by O-5 — one add-only leaf in `LEAF_MUSCLE_GROUP_SLUGS`, its display name, and the ADR-010 amendment that permits it; and (2) the UI hardening authorised by D-CE1-1(iii) — an unknown-slug fallback in `src/ui/exercises/ContributionEditor.tsx` and `src/ui/exercises/muscleGroupDisplay.ts`, specified in §12.8. That hardening is display-and-preservation only: it renders an unrecognised slug and keeps it round-tripping, **without** offering it to any other contribution row, without changing the rollup rules, and without broadening what the server accepts.

Everything else is unchanged and stays unchanged — no database migration (substantiated from the schema and the migration files in §12.5, not assumed), no equipment vocabulary change, no measurement-profile or `load_basis` semantics, no rollup, no hierarchy, no `kind` change, no RP landmark invention, no sync-contract or DTO change, no server-validation change, no progression, e1RM, volume, metrics or warm-up behaviour change, and no other UI change beyond what existing components render from the domain constant. The deployment pipeline is unchanged. The accepted Athletic Measurement Profiles architecture is not reopened, and no seeded entry is edited.

---

## 0. Summary

| | |
| --- | --- |
| Catalog today | **103** entries |
| Proposed additions | **24** |
| Catalog after this release | **127** |
| Muscle-group vocabulary | 17 leaves + 1 rollup → **18 leaves + 1 rollup** (O-5) |
| Owner-requested exercises deduplicated away | 3 of 6 (§8) |
| Database migration required | **No** — substantiated in §12.5 |
| Decisions | **Six, all accepted** — O-1…O-5 and D-CE1-1. None open |
| Bounded exceptions to "catalog only" | the `tibialis` leaf (O-5) and the unknown-slug UI fallback (D-CE1-1(iii), §12.8) |
| Verdict | READY FOR TARGETED CATALOG REVISION VERIFICATION |

**One delivery, one commit.** The vocabulary leaf and the exercise that depends on it ship together; §16.2 explains why that is a dependency *order* inside one release, already enforced by `runSeed`, and not a reason for a second release.

The gaps this batch closes, all identified from the catalog itself (§4): no frontal-plane lower-body movement (`adductors` was the thinnest leaf at 1 primary / 1 secondary and ends at 3 / 2), no unilateral hinge, no anti-rotation trunk movement, no static-grip entry, no dynamic anti-extension entry, the assisted dip missing beside the assisted pull-up, **`load_duration` with zero catalog entries**, `other` as the thinnest equipment category, no triple-extension pull, and **no anterior-shin coverage at all — neither an exercise nor a muscle to credit it to**.

---

## 1. Inputs and repository state

### 1.1 Read for this specification

| Source | What it fixed |
| --- | --- |
| `src/db/seed/exerciseCatalog.ts` (all 103 entries) | the actual catalog: slugs, names, equipment, mechanics, laterality, profiles, bases, counting, contributions |
| — the Release-3 block's approved movement definitions | the deduplication in §8, in particular `other-med-ball-slam` and `bodyweight-broad-jump` |
| `src/db/seed/exercises.ts:23-29`, `:49-57`, `:105-122`, `:125-161`, `:180-182` | deterministic ids (`slugToUuid`), the ledger skip, how omitted fields resolve, arbiter-less `onConflictDoNothing`, contributions only for genuinely inserted rows, `seededExerciseId` |
| `src/db/seed/index.ts` (`runSeed`) | the step order that makes O-5's dependency an intra-release ordering, not a release boundary (§16.2) |
| `src/db/seed/muscleGroups.ts` | the whole vocabulary seed: one upsert over `MUSCLE_GROUPS`, `display_name`/`position`/`kind` re-synced on every deploy |
| `src/db/seed/volumePresets.ts:24-32`, `:50-76`, `:130-190` | `RP_GENERAL_DESCRIPTION`, the 13-row `RP_ROWS` table, and the landmark upsert — the file O-5 touches beyond the vocabulary itself |
| `src/db/schema/muscleGroups.ts:8-27` | the table's **only** CHECK is on `kind`, built from `MUSCLE_GROUP_KINDS`; `id` is a bare `text` primary key with no value list |
| `src/db/schema/exerciseMuscleContributions.ts:22-35`, `src/db/schema/volumeLandmarks.ts:17-42` | both FKs reference `muscle_groups(id)` with `on delete restrict` and no enumerated values |
| `drizzle/0001_modern_blonde_phantom.sql:1-5`, `drizzle/0007_safe_triathlon.sql:1-2`, `drizzle/0008_great_metal_master.sql:34` | every DDL statement that has ever touched `muscle_groups` — the evidence for §12.5 |
| `src/domain/exercises/muscleGroups.ts:13-33`, `:47-49`, `:56-101` | the leaf list, the derived `MUSCLE_GROUPS`/`position`/`LEAF_MUSCLE_GROUPS`, the Zod enums and the type guards — what O-5 edits and what it gets for free |
| `src/domain/exercises/schema.ts:165-180` | `createContributionsListSchema`'s max length is `LEAF_MUSCLE_GROUP_SLUGS.length`, so it tracks the vocabulary automatically |
| `src/domain/volume/aggregate.ts:88`, `:105`, `:120`, `:133-155` | the aggregate seeds its leaf map from `LEAF_MUSCLE_GROUP_SLUGS` and its rollup logic from `ROLLUP_MEMBERS` — a new leaf appears with zeroes and joins no rollup |
| `src/ui/volume/VolumeScreen.tsx:38-39`, `:113-126`; `src/ui/metrics/VolumeCard.tsx:18-24`; `src/ui/exercises/ContributionEditor.tsx:50-69`; `src/ui/exercises/muscleGroupDisplay.ts` | every UI consumer, all of them iterating the domain constant — `landmarksFor` returns `[]` for a group with no landmark, which is how a band-less leaf already renders |
| `src/server/exercises/service.ts:418-435` | the `23503` path that fires when a contribution names a slug missing from `muscle_groups` — deliberately unmapped, and the reason vocabulary must be seeded before contributions |
| `src/domain/measurement/profile.ts`, `capabilities.ts`, `compatibility.ts` | the six profiles and the field matrix; volume is `load_reps` **or `reps`**; e1RM is `load_reps` + non-assistance; the scheme table |
| `src/domain/strength/eligibility.ts:48-62`, `constants.ts:137` | the profile → basis → equipment → switch refusal order; `STRENGTH_ELIGIBLE_EQUIPMENT = barbell, dumbbell, cable, machine` |
| `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` | the vocabulary, the mutation rules, and the two-stage-rollout reasoning §12.6 tests O-5 against |
| `docs/architecture/adr/ADR-011-…` | the e1RM structural gate, per-exercise series keyed on `exercises.id`, `strength_estimate` as a disable-only switch |
| `docs/architecture/domain-model.md:58`, `:61`; `volume-model.md:93`, `:123`; `data-model.md:47`, `:312` | the six documentation sentences that enumerate the vocabulary and must move with it (§12.4) |
| `docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md` §2–§9 | authoring rules R-1…R-11, the contributions-are-a-convention framing, R-10a's laterality rule, D-R3-1's "a declined reading is a new slug under its own gate" |
| — `…-release-3-catalog-review.md`, `…-catalog-revision-verification.md` | M-1's silent-`unspecified` trap, M-2's adductor assertion, L-1/L-2 fixture constraints |
| `docs/reviews/athletic-measurement-profiles-release-3-predeployment-check.md` | the production name-collision method and its result (97 rows, zero matches) |
| `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §7.2-7.3, §11.2, §11.4, §13.5, §16, §18.2, §21.3-21.4 | O-12's per-side convention, jumps-are-`reps`, the consumer matrix, the `volume_counting` switch, NC-12's `db:generate` no-op precedent, the athletic authoring rule, non-goals |
| `docs/input/product-ideas.md` (PI-003, PI-005) | the athletic use cases; the capability-defaults rules |
| `tests/unit/muscleGroups.test.ts`, `tests/unit/exerciseCatalog.test.ts`, `tests/unit/volumePresetsSeed.test.ts`, `tests/integration/seed.integration.test.ts`, `…/volumePresetsSeed.integration.test.ts`, `…/reconcileContributions.integration.test.ts`, `tests/e2e/muscleTaxonomyV2.spec.ts` | every assertion this release must extend or restate (§11.6, §12.3), read from the current files |

### 1.2 Working-tree state observed before authoring (preserved, untouched)

```
 M CLAUDE.md
 D HANDOFF.md
 M docs/input/product-ideas.md
?? .claude/skills/
?? HANDOFF(depracted).md
?? docs/reviews/repository-agent-workflow-evaluation.md
?? docs/reviews/repository-agent-workflow-review.md
?? docs/reviews/warmup-routines-evidence-research.md
?? gpt-handoff.md
?? gpt-memory.md
```

This document is the only file this pass creates or edits. No source file, no test, no backlog file, no architecture document, no ADR and no existing independent report is modified.

---

## 2. What the muscle assignments in this document claim

**Every contribution list below is a catalog convention, not a measurement.** It answers one question — *when this exercise appears in the library or on the volume screen, which muscles should it be credited to, at full or half weight?* — under the app's existing labelled heuristic (`primary` 1.0 / `secondary` 0.5, `DEFAULT_CONTRIBUTION_WEIGHT`, EVIDENCE-004). It is not a claim about EMG amplitude, force contribution, hypertrophic stimulus or injury prevention, and no such claim should be read into a `primary` label. This is the Release-3 gate's framing (§3 there), applied unchanged.

The same discipline governs O-5. Adding a `tibialis` leaf is a **vocabulary** decision — the app needs a name to credit dorsiflexion work to — not a claim that the anterior shin needs a particular weekly set count. It receives no RP landmark and no invented reference range (§12.2).

---

## 3. Constraints every entry satisfies

- **K-1 Leaf-only contributions** from `LEAF_MUSCLE_GROUP_SLUGS`; never `back`. The set is 18 leaves after O-5 and no other group is added.
- **K-2 At least one `primary`**, no repeated muscle within an entry.
- **K-3 Default weights only** — `SeedContribution` has no `weight` member; the seeder applies 1.0 / 0.5.
- **K-4 No `loadStepKg`** — not expressible in `SeedCatalogExercise`; derived from equipment (`barbell`/`cable`/`bodyweight`/`other` 2.5, `dumbbell` 2.0, `machine` 5.0) and editable per exercise afterwards.
- **K-5 `loadBasis` iff the profile has a load field** (`load_reps`, `load_distance`, `load_duration`). Omitting it on a load-bearing profile is silent: `resolveLoadBasis` yields `'unspecified'`, which satisfies `ck_exercises_load_basis_presence` while contradicting the intended value, and the ledger makes that permanent. M-1's trap; it applies to C-17.
- **K-6 The three profile fields are stated explicitly only where the entry needs a non-default value**, plus wherever §16's athletic authoring rule requires it. The ~90 existing ordinary `load_reps` entries omit all three and stay that way.
- **K-7 `strengthEstimate` is `'off'` only where the stored load cannot be fed to a 1RM equation** — an inverted assistance load, or fabricated reps for time/distance work. Otherwise omitted, and the structural gate decides. Release 3's athletic `volumeCounting: "off"` applies to this batch's athletic attempts (C-17, C-22) **by rule**, and to non-volume-capable profiles as documentation of a value the seeder resolves anyway; it is never applied by analogy to an ordinary strength entry.
- **K-8 Naming.** Equipment prefix for `barbell` / `dumbbell` / `cable` entries and for `machine` entries whose name is not the machine's own name; `bodyweight` and `other` entries named plainly. Machines that *are* the exercise take the existing "<Thing> Machine" form. No parentheses in any exercise name. (Muscle **display names** follow a different, existing convention — see §12.1.)
- **K-9 `laterality` written only when `unilateral`.** Under O-12 `unilateral` means **one set row holds one side's work, both sides performed**. Per R-10a: `unilateral` when the movement is genuinely performed as a left round and a right round; `bilateral` when it is symmetric or alternates sides *within* one attempt.

---

## 4. Coverage assessment (grounded in the actual catalog)

Figures derived directly from `src/db/seed/exerciseCatalog.ts` at `HEAD = 56ec000`.

### 4.1 Shape

**103 entries** — 56 compound / 47 isolation; 95 bilateral / 8 unilateral. After this release: **127** — 71 compound / 56 isolation; 113 bilateral / 14 unilateral.

### 4.2 Equipment

| Equipment | Before | After | Read |
| --- | --- | --- | --- |
| machine | 23 | 25 | thoroughly covered; remaining gaps are variants of entries already present |
| dumbbell | 21 | 28 | thoroughly covered in the sagittal plane; was thin unilaterally outside knee-dominant work |
| barbell | 19 | 22 | complete for the squat / hinge / press / row / curl families; had no explosive pull |
| cable | 18 | 19 | complete except anti-rotation |
| bodyweight | 16 | 23 | 10 strength + 6 athletic; had no grip, anti-extension or shin entry |
| **other** | **6** | **10** | was the thinnest, and is the only home for implements outside the four gym categories |

### 4.3 Muscle-leaf coverage (primary / secondary rows)

```
glutes 20/9   quads 17/3   chest 12/2   hamstrings 9/18   abs 9/10
front_delts 8/14   upper_back 7/2   triceps 7/15   forearms 6/13
lats 6/0   biceps 5/13   side_delts 4/6   rear_delts 4/10
calves 4/6   lower_back 3/7   traps 2/9   adductors 1/1
```

Every leaf has at least one primary. Three observations that shaped selection:

- **`adductors` 1/1 was the thinnest leaf by a wide margin**, and its single primary was a machine. The catalog had no frontal-plane movement at all; `bodyweight-shuttle-run` credited the leaf only as a side effect of change-of-direction. This batch adds `dumbbell-lateral-lunge` (P), `bodyweight-copenhagen-adduction-plank` (P) and `bodyweight-lateral-bound` (S), ending at **3 / 2**.
- **`lats` has six primaries and zero secondaries** — an artefact of the ADR-010 remap, not an invariant, but a convention this batch does not break casually (C-8's declined `lats` secondary).
- **There was no leaf for the anterior shin.** The 17 leaves covered no dorsiflexor, and `calves` is the triceps-surae bucket — the *antagonist* of a tibialis raise, not a coarse parent of it. O-5 adds `tibialis`, which ends at **1 / 0** via C-24.

### 4.4 Movement-pattern coverage

| Pattern | Coverage before | Closed by |
| --- | --- | --- |
| Squat (bilateral) | back / front / goblet / hack / smith / leg press | — complete |
| Squat (single-leg, sagittal) | Bulgarian split squat, step-up, walking lunge ×2 | — complete (C-13 is a further variant, selected) |
| **Squat (frontal plane)** | **none** | C-1 |
| Hinge (bilateral) | deadlift, sumo, RDL ×2, good morning, trap bar, pull-through, hip thrust ×2, glute bridge | — complete |
| **Hinge (unilateral)** | **none** | C-2 |
| **Hinge (ballistic)** | **none** | C-10 |
| **Hinge (partial ROM, own load scale)** | **none** | C-11 |
| Horizontal press | bench ×4, DB ×2, machine, pec deck, fly ×3, dip, push-up | — complete |
| Vertical press | OHP, push press, DB shoulder, Arnold, machine, landmine | — complete |
| Vertical pull | pull-up, chin-up, lat pulldown, assisted pull-up, straight-arm pulldown | C-4 (free-weight shoulder-extension arc) |
| Horizontal pull | barbell / Pendlay / DB / cable / machine / T-bar / inverted row | C-9 (bilateral, chest-supported) |
| Carry | farmer's ×2, suitcase | C-18 (static hold) |
| Trunk: flexion / rotation / extension / bracing | crunch ×2, sit-up, leg raise, woodchopper, back extension, plank ×2 | — complete |
| **Trunk: anti-rotation** | **none** | C-6 |
| **Trunk: anti-extension (dynamic)** | **none** | C-8 |
| **Grip (static)** | **none** | C-7, C-18 |
| Athletic: sprint / shuttle / jumps / sled / slam | Release 3 | C-15, C-16, C-17, C-22 |
| **Triple-extension pull** | **none** | C-12, C-14 |
| **Assistance-basis** | `machine-assisted-pull-up` only | C-5 |
| **Anterior shin** | **none, and no leaf to credit** | C-24 + O-5 (§12) |

### 4.5 Measurement-profile coverage

| Profile | Before | After |
| --- | --- | --- |
| `load_reps` | 92 | 109 |
| `load_distance` | 5 | 7 |
| `duration` | 2 | 5 |
| `distance_time` | 2 | 2 |
| `reps` | 2 | 3 |
| **`load_duration`** | **0** | **1** (C-18) |

`load_duration` has been fully supported since Release 2 — `durationRounds` prescriptions, the field matrix, the DB CHECK, the emitter — and has never had a catalog entry. C-18 is the first, which is a risk worth naming (RR-8).

### 4.6 What is *not* missing — declined by design

- **Weighted Pull-Up / Weighted Dip / Weighted Plank.** `bodyweight-pull-up` and `bodyweight-dip` are `load_reps`; added load goes in `weight_kg`, where `0` already means bodyweight-only.
- **Trap Bar Carry, Handle Carry, Kettlebell Carry.** `other-farmers-carry`'s approved definition is explicitly "farmer's handles, a trap bar, or any non-dumbbell implement".
- **Grip and angle variants** — wide/close/neutral pulldowns and rows, EZ-bar vs straight-bar curls, rope vs bar pushdowns, decline bench, seated vs standing overhead press, snatch-grip deadlift. Same recorded-fact shape, same muscle map, same equipment, and a load scale close enough that one series is not distorted. The app has no grip or angle field (§14).
- **Machine Preacher Curl, Machine Pec Fly, Smith Machine Overhead Press, leg-press calf raise, machine glute kickback.** Each duplicates an existing entry's pattern and muscle map on the same equipment class.
- **Reverse crunch, Russian twist, bicycle crunch, hollow hold.** Trunk flexion already has four entries; a hollow hold is `bodyweight-plank`'s convention in a different body position.
- **Single-arm cable row / single-arm pulldown.** `dumbbell-row` already carries the unilateral horizontal pull.
- **Rower, assault bike, jump rope, battle ropes.** Conditioning modalities with no natural boundary; a deliberate conditioning-logging decision, not this pass.
- **Medicine Ball Overhead Slam, Broad Jump.** Owner-requested; already seeded. §8.

---

## 5. Selection criteria

A separate catalog entry is justified when **at least one** holds:

1. **Recorded-fact shape differs** — a different measurement profile or load basis.
2. **Muscle map differs** materially from the nearest existing entry.
3. **Recording convention differs** — bilateral vs unilateral, where one set row means one side under O-12.
4. **Implement / equipment category differs**, giving a distinct load scale and a distinct history series.
5. **Load scale differs enough that one series would be distorted** by mixing the two — ADR-011's one-observation-per-session grouping keys on `exercises.id`, so a partial-ROM variant logged against its full-ROM parent corrupts that parent's e1RM series.

§8 applies the same criteria to the owner's six requested exercises: an entry satisfying none of them duplicates something already seeded, or a candidate already pending.

---

## 6. Slug / name manifest — the selected block

Appended as one contiguous block after the Release-3 athletic entries, occupying positions **104–127** of a 127-entry catalog. Candidate ids (`C-n`) are stable across drafts so review comments carry across; block order groups by equipment, matching the file's dominant convention.

| Pos | Id | Slug | Name | Equip. | Mech. | Lat. |
| --- | --- | --- | --- | --- | --- | --- |
| 104 | C-11 | `barbell-rack-pull` | Barbell Rack Pull | barbell | compound | bilateral |
| 105 | C-12 | `barbell-power-clean` | Barbell Power Clean | barbell | compound | bilateral |
| 106 | C-14 | `barbell-hang-clean` | Barbell Hang Clean | barbell | compound | bilateral |
| 107 | C-1 | `dumbbell-lateral-lunge` | Dumbbell Lateral Lunge | dumbbell | compound | **unilateral** |
| 108 | C-13 | `dumbbell-reverse-lunge` | Dumbbell Reverse Lunge | dumbbell | compound | **unilateral** |
| 109 | C-2 | `dumbbell-single-leg-romanian-deadlift` | Dumbbell Single-Leg Romanian Deadlift | dumbbell | compound | **unilateral** |
| 110 | C-9 | `dumbbell-chest-supported-row` | Dumbbell Chest-Supported Row | dumbbell | compound | bilateral |
| 111 | C-4 | `dumbbell-pullover` | Dumbbell Pullover | dumbbell | isolation | bilateral |
| 112 | C-20 | `dumbbell-thruster` | Dumbbell Thruster | dumbbell | compound | bilateral |
| 113 | C-18 | `dumbbell-farmers-hold` | Dumbbell Farmer's Hold | dumbbell | compound | bilateral |
| 114 | C-6 | `cable-pallof-press` | Cable Pallof Press | cable | isolation | **unilateral** |
| 115 | C-3 | `machine-hip-abduction` | Hip Abduction Machine | machine | isolation | bilateral |
| 116 | C-5 | `machine-assisted-dip` | Assisted Dip | machine | compound | bilateral |
| 117 | C-7 | `bodyweight-dead-hang` | Dead Hang | bodyweight | isolation | bilateral |
| 118 | C-8 | `bodyweight-ab-wheel-rollout` | Ab Wheel Rollout | bodyweight | isolation | bilateral |
| 119 | C-19 | `bodyweight-wall-sit` | Wall Sit | bodyweight | isolation | bilateral |
| 120 | C-21 | `bodyweight-nordic-curl` | Nordic Hamstring Curl | bodyweight | isolation | bilateral |
| 121 | C-22 | `bodyweight-lateral-bound` | Lateral Bound | bodyweight | compound | bilateral |
| 122 | C-23 | `bodyweight-copenhagen-adduction-plank` | Copenhagen Adduction Plank | bodyweight | isolation | **unilateral** |
| 123 | C-24 | `bodyweight-tibialis-raise` | Tibialis Raise | bodyweight | isolation | bilateral |
| 124 | C-10 | `other-kettlebell-swing` | Kettlebell Swing | other | compound | bilateral |
| 125 | C-15 | `other-forward-sled-drag` | Forward Sled Drag | other | compound | bilateral |
| 126 | C-16 | `other-sled-pull` | Hand-Over-Hand Sled Pull | other | compound | bilateral |
| 127 | C-17 | `other-med-ball-rotational-scoop-throw` | Medicine Ball Rotational Scoop Throw | other | compound | **unilateral** |

**24 entries** — 15 compound / 9 isolation, 18 bilateral / 6 unilateral.

---

## 7. Measurement shape manifest

| Id | Profile | `loadBasis` | `volumeCounting` | `strengthEstimate` | e1RM under the gate |
| --- | --- | --- | --- | --- | --- |
| C-11, C-12, C-14 | omit → `load_reps` | omit → `unspecified` | omit → `auto` | omit (O-4 accepted) | eligible |
| C-1, C-13, C-2, C-9, C-4, C-20 | omit → `load_reps` | omit → `unspecified` | omit → `auto` | omit | eligible |
| C-18 | **`load_duration`** | **`per_hand`** | **`off`** | omit | refused — profile |
| C-6 | omit → `load_reps` (O-2 accepted) | omit → `unspecified` | omit → `auto` | omit | eligible |
| C-3 | omit → `load_reps` | omit → `unspecified` | omit → `auto` | omit | eligible |
| C-5 | omit → `load_reps` | **`assistance`** | omit → `auto` | omit | refused — basis |
| C-7, C-19 | **`duration`** | — (no load field) | **`off`** | omit | refused — profile |
| C-8, C-21, C-24 | omit → `load_reps` | omit → `unspecified` | omit → `auto` | omit | refused — equipment |
| C-22 | **`reps`** | — (no load field) | **`off`** | omit | refused — profile |
| C-23 | **`duration`** | — (no load field) | **`off`** | omit | refused — profile |
| C-10 | omit → `load_reps` (O-1 accepted) | omit → `unspecified` | omit → `auto` (O-1 accepted) | omit | refused — equipment |
| C-15, C-16 | **`load_distance`** | **`total`** | **`off`** | omit | refused — profile |
| C-17 | **`load_reps`** | **`total`** | **`off`** | omit | refused — equipment |

Three notes the review should hold the batch to:

- **`volumeCounting: "off"` is load-bearing on exactly two entries** — C-17 (`load_reps`) and C-22 (`reps`), the two volume-capable profiles. Both are athletic attempts, so O-4(i)/(ii)'s rule applies *by rule*, not by analogy. On C-7, C-15, C-16, C-18, C-19 and C-23 the value equals what the seeder would resolve anyway and is written to make the fact reviewable in the catalog — R-5's own framing.
- **`loadBasis` is stated on exactly five entries** — C-5 (`assistance`), C-18 (`per_hand`), C-15, C-16 and C-17 (`total`) — the five whose profile has a load field. Omitting it on C-17 would raise no error and would silently seed `'unspecified'`; that is M-1's finding.
- **`strengthEstimate` is omitted on all 24. Thirteen are refused structurally; the other eleven are genuinely eligible**, which is intended and accepted under O-4. Refused: C-18 (profile `load_duration`), C-5 (basis `assistance`), C-7, C-19 and C-23 (`duration`), C-22 (`reps`), C-15 and C-16 (`load_distance`), C-8, C-21 and C-24 (equipment `bodyweight`), C-10 and C-17 (equipment `other`). Eligible: C-11, C-12, C-14, C-1, C-13, C-2, C-9, C-4, C-20, C-6, C-3. (Corrected from "ten … fourteen" — review M-3; re-counted against `eligibility.ts:48-62` and `STRENGTH_ELIGIBLE_EQUIPMENT`, and the eleven are the only entries that are both `load_reps` and barbell/dumbbell/cable/machine with a non-`assistance` basis.)

---

## 8. Deduplication — the owner's six requested exercises

Each requested exercise was checked against the seeded catalog and against the pending candidates, applying §5's criteria.

| Requested | Disposition | Evidence |
| --- | --- | --- |
| **Broad Jump** | **Already seeded — no candidate added.** | `bodyweight-broad-jump`, Release 3, position 101. Approved definition: "A maximal two-footed horizontal jump for distance, landing on both feet, reset between repetitions. The profile records **attempts**, not the distance jumped." That is the requested exercise exactly; `reps` / `volumeCounting: "off"` / glutes P, quads P, hamstrings S, calves S already stand. Untouched. |
| **Medicine Ball Overhead Slam** | **Already seeded — no candidate added.** | `other-med-ball-slam`, "Medicine Ball Slam", Release 3, position 100. Approved definition: "A medicine ball raised **overhead** with both hands and **thrown down to the floor** with a combined trunk-flexion and shoulder-extension action, caught or re-picked between repetitions." The requested overhead slam is that definition, not a variant of it; a second entry would satisfy none of §5's criteria. Untouched, and **not renamed** — the seeded row is ledger-applied and a catalog rename would not reach it anyway. |
| **Medicine Ball Rotational Scoop Throw** | **Supersedes pending candidate C-17 — no net addition.** | C-17 was drafted as a generic "Medicine Ball Rotational Throw", from which the scoop throw is not materially distinct under §5 — identical profile, basis, implement and load scale. C-17 is therefore **bound to the owner's named variant**: renamed "Medicine Ball Rotational Scoop Throw", re-slugged `other-med-ball-rotational-scoop-throw`, with its definition, laterality and contributions rewritten for the low-to-high scoop (§9). This follows D-R3-1's precedent — name the entry for the movement so the phone label matches the muscle map — and the re-slug is free because nothing is seeded yet. |
| **Lateral Bound** | **New candidate C-22.** | No frontal-plane jump existed. Distinct from `bodyweight-broad-jump` under criteria 2 and 3: sagittal two-footed take-off and landing vs frontal single-leg-to-single-leg, and a muscle map differing by one row (`adductors` S where the broad jump carries `hamstrings` S) — the same one-row discipline that separates the seeded broad jump from the box jump. |
| **Copenhagen Adduction Plank** | **New candidate C-23.** | No adduction-loaded isometric existed. Distinct from `bodyweight-side-plank` under criterion 2: same family and same profile, but the defining demand is hip adduction of the bottom leg rather than lateral trunk bracing, so the primary moves from `abs` to `adductors`. |
| **Tibialis Raise** | **New candidate C-24, included under accepted O-5.** | Not a duplicate of anything: `bodyweight-calf-raise` and the two machine calf raises train the antagonist. It needed a vocabulary decision, not a deduplication one — the 17-leaf set had no dorsiflexor to be primary on. O-5 is accepted, the `tibialis` leaf is specified in §12, and C-24 ships in the same delivery. |

**Net effect of the six requests: +3 entries in the block, one candidate rescoped, two already represented.**

---

## 9. Movement definitions and recording conventions

One definition per entry — what the contributions are authored against, and how a set row is to be read. **P** = primary, **S** = secondary. No definition below is changed from the owner-accepted text; O-1…O-4 are recorded here as accepted rather than pending.

### Barbell

**C-11 `barbell-rack-pull` — Barbell Rack Pull.** A deadlift begun from pins or blocks with the bar starting above the floor, locked out at the hip and returned to the pins. **Pin height is deliberately not modelled** (O-3 accepted: the entry stays generic) and must be kept constant for the load series and its e1RM estimate to mean anything; that convention is recorded in the entry's own catalog comment, which is where the athlete's reviewer will find it. Bilateral.
Contributions: `glutes` P, `lower_back` P, `upper_back` S, `traps` S, `forearms` S — **exactly `barbell-deadlift`'s list with the `hamstrings` primary removed, and nothing else changed.** `lower_back` is already primary on the deadlift (`exerciseCatalog.ts:85-97`), so no row is promoted here; the shortened range removing most of the hamstring demand is the entire difference. (Corrected — review L-1; the literal was always right, the rationale was not. The entry now rests on one dropped row, exactly as C-14 does, and is listed in §15 for that reason.)
Nearest existing: `barbell-deadlift`. Criterion 5 — rack-pull loads are a large multiple of the deadlift's, and logging both against one exercise corrupts ADR-011's modal-load grouping.

**C-12 `barbell-power-clean` — Barbell Power Clean.** Bar from the floor to a front-rack catch received above parallel; one repetition per pull, bar returned to the floor and reset between reps.
Contributions: `glutes` P, `hamstrings` P, `quads` S, `traps` S, `upper_back` S.
Nearest existing: `other-trap-bar-deadlift` — the same pull shape without acceleration or a catch. Criteria 2 and 5. `strengthEstimate` stays `auto` (O-4 accepted): the load and reps are both real, K-7's `'off'` rule does not reach it, and the disable-only toggle remains one tap away.

**C-14 `barbell-hang-clean` — Barbell Hang Clean.** As C-12 but each repetition begins from a hang at or above the knee, the bar never returning to the floor within a set.
Contributions: `glutes` P, `hamstrings` P, `traps` S, `upper_back` S — `quads` dropped, since there is no full first pull. That single-row difference from C-12 is the catalog's convention for the distinction.
Nearest existing: C-12. Criteria 2 and 5.

### Dumbbell

**C-1 `dumbbell-lateral-lunge` — Dumbbell Lateral Lunge.** From standing, a direct sideways step with hips pushed back, the stepping knee bending while the trailing leg stays extended, then a push back to the start. Dumbbells held at the sides or in a goblet position. **Unilateral: one set row records one side, both sides performed.**
Contributions: `adductors` P, `quads` P, `glutes` S.
Nearest existing: `dumbbell-bulgarian-split-squat` — same implement and laterality, purely sagittal, no adductor row. Criteria 2 and 3. `adductors` takes primary because the lengthened adduction of the trailing leg is the defining demand; `glutes` drops to half credit, the inverse of the split squat.

**C-13 `dumbbell-reverse-lunge` — Dumbbell Reverse Lunge.** A backward step into a lunge and a return to standing, dumbbells at the sides; no forward travel, unlike the seeded walking lunges. **Unilateral.**
Contributions: `quads` P, `glutes` P, `hamstrings` S — identical to `dumbbell-step-up` and `dumbbell-bulgarian-split-squat`: one movement family, one convention.
Nearest existing: `dumbbell-step-up`. Criterion 3 is thin here; the entry is selected on the owner's programming judgement rather than on a structural gap, and §15 records that.

**C-2 `dumbbell-single-leg-romanian-deadlift` — Dumbbell Single-Leg Romanian Deadlift.** A hip hinge on one supporting leg, torso and free leg descending together, dumbbells lowered toward the floor along the supporting leg. **Unilateral.**
Contributions: `hamstrings` P, `glutes` P, `lower_back` S — deliberately identical to `dumbbell-romanian-deadlift`, the `other-farmers-carry` precedent.
Nearest existing: `dumbbell-romanian-deadlift`. Criteria 3 and 5 — the per-leg load is roughly half.

**C-9 `dumbbell-chest-supported-row` — Dumbbell Chest-Supported Row.** Prone on an inclined bench with the chest supported, both arms rowing dumbbells simultaneously. Bilateral — the distinguishing property.
Contributions: `upper_back` P, `biceps` S, `rear_delts` S — identical to `dumbbell-row` and `machine-seated-row`.
Nearest existing: `dumbbell-row`, which is unilateral, so one row there records one side. Criterion 3 only, and this is the weakest justification in the batch (§15).

**C-4 `dumbbell-pullover` — Dumbbell Pullover.** Supine, one or two dumbbells held over the chest with near-extended arms, lowered in an arc behind the head and returned. Bilateral.
Contributions: `lats` P, `chest` S, `triceps` S. ADR-010's own rule sends shoulder-extension arcs to `lats`, so no rollup is involved; `chest` at half credit is the catalog's convention for the loaded stretched position, not a measured partition.
Nearest existing: `cable-straight-arm-pulldown` — cable, constant tension, different load scale and series. Criterion 4.

**C-20 `dumbbell-thruster` — Dumbbell Thruster.** Front-racked dumbbells, a full squat driving directly into an overhead press as one continuous repetition. Bilateral.
Contributions: `quads` P, `front_delts` P, `glutes` S, `triceps` S.
Nearest existing: `dumbbell-goblet-squat` plus `dumbbell-shoulder-press` — logging the thruster as those two entries would double its set count. Criterion 2.

**C-18 `dumbbell-farmers-hold` — Dumbbell Farmer's Hold.** A static hold with one dumbbell per hand at the sides, upright torso, **no travel**, held for a recorded time under a recorded per-hand load. Bilateral. `per_hand` records the load in one hand, both loaded.
Contributions: `forearms` P, `traps` S, `abs` S — mirroring `dumbbell-farmers-carry`.
Nearest existing: `dumbbell-farmers-carry`. Criterion 1 — the carry travels and records distance; this records time at a standstill, and it is the catalog's only `load_duration` entry.

### Cable

**C-6 `cable-pallof-press` — Cable Pallof Press.** Standing side-on to a cable at chest height, both hands at the sternum, pressing straight out and returning while resisting rotation toward the stack. **Unilateral: one set row records one side's reps — the stack on one side — with both sides performed.** Under O-2 (accepted) one set is a recorded number of presses at a recorded stack load.
Contributions: `abs` P — a single row, matching `cable-woodchopper`.
Nearest existing: `cable-woodchopper` — same equipment, opposite intent (producing rotation vs resisting it). The vocabulary has no oblique leaf, so both credit `abs` and the distinction is carried by the entry itself.
**Disclosed inconsistency.** `cable-woodchopper` is seeded `bilateral` even though it too is performed as a left round and a right round. That entry was authored in Phase 5.5 Light, before O-12 existed, and this document **does not propose changing it** — it is ledger-applied, so a catalog edit would never reach the seeded row. C-6 follows the current rule (K-9); the reviewer should expect the two entries to differ.

### Machine

**C-3 `machine-hip-abduction` — Hip Abduction Machine.** Seated on a hip machine with pads outside the thighs, driving the knees apart against the stack and returning under control. Bilateral.
Contributions: `glutes` P — a single row, mirroring `machine-hip-adduction`'s single `adductors` P. The vocabulary has no abductor leaf; adding one is **not** in this release's bounded vocabulary change (§12.7), so `glutes` is the correct existing target.
Nearest existing: `machine-hip-adduction` — opposite movement, different muscle. Criterion 2. Naming follows that entry's "<Thing> Machine" form (K-8).

**C-5 `machine-assisted-dip` — Assisted Dip.** A parallel-bar dip on an assistance machine, knees or feet on a counterweighted platform. **The logged load is the assistance**, a non-negative number whose meaning is inverted — a larger number is an easier set — which is why `loadBasis: "assistance"` is stated and the e1RM gate refuses it structurally. Profile stays `load_reps`: a rep is real here. Bilateral.
Contributions: `triceps` P, `chest` P, `front_delts` S — mirroring `bodyweight-dip`.
Nearest existing: `machine-assisted-pull-up` (same machine family, opposite pattern) and `bodyweight-dip` (same pattern, unassisted). Criteria 1 and 4.
**Deliberate difference from the legacy entry.** `machine-assisted-pull-up` also carries `strengthEstimate: "off"`, which evaluation §11.6 records as redundant with the basis and left in place only because it predates it. C-5 follows R-7 and omits it: the refusal fires on `LOAD_BASIS_UNSUPPORTED` before the switch is consulted, so behaviour is identical and only the toggle's position in the edit form differs.

### Bodyweight

**C-7 `bodyweight-dead-hang` — Dead Hang.** A hang from a pull-up bar with both hands, arms extended, feet clear of the floor, held for a recorded time. Bilateral. An added-load hang is a different profile and is not covered by this entry.
Contributions: `forearms` P, `traps` S — the carry convention minus the trunk row, since a hang has no bracing demand.
Nearest existing: `dumbbell-farmers-carry` — grip primary, but loaded travel over a distance. Criterion 1.

**C-8 `bodyweight-ab-wheel-rollout` — Ab Wheel Rollout.** From the knees or the feet, rolling the wheel forward until the torso approaches the floor while resisting lumbar extension, then returning. Recorded as reps at `0 kg`. Bilateral.
Contributions: `abs` P — a single row, matching `bodyweight-hanging-leg-raise`.
Nearest existing: `bodyweight-plank` (the isometric form) and `bodyweight-hanging-leg-raise` (dynamic flexion). Criterion 2.
Two calls recorded rather than escalated: equipment is `bodyweight` rather than `other` because the wheel adds no external load, and both categories are e1RM-refused with the same 2.5 kg step; a `lats` secondary was considered and declined, because the catalog has no `lats` secondary anywhere (§4.3) and R-11 prefers the narrower assignment.

**C-19 `bodyweight-wall-sit` — Wall Sit.** Back against a wall, thighs approximately parallel to the floor, held for a recorded time. Bilateral.
Contributions: `quads` P, `glutes` S.
Nearest existing: `bodyweight-plank` by shape, `machine-leg-extension` by muscle. Criterion 1.

**C-21 `bodyweight-nordic-curl` — Nordic Hamstring Curl.** Kneeling with the ankles anchored, lowering the torso forward under eccentric hamstring control and returning. Reps at `0 kg`. Bilateral.
Contributions: `hamstrings` P, `glutes` S.
Nearest existing: `machine-lying-leg-curl`. Criterion 4.

**C-22 `bodyweight-lateral-bound` — Lateral Bound.** A maximal sideways jump from one leg, landing on the opposite leg and stabilising before the next repetition. **The profile records attempts — the total number of ground contacts in the set, across both sides — not the distance covered**; jump distance is not a stored field in v1 (N-12, the same rule that makes the seeded Broad Jump a `reps` entry). The entry does not distinguish an alternating series from a single-direction series. **Bilateral under K-9 / R-10a:** a bounding set alternates sides *within* the attempt, so it has no left round and no right round, and marking it `unilateral` would invite a per-side recording convention the movement cannot support. No per-side field is introduced.
**How this differs from C-17, which alternates and is `unilateral`** (review L-5): the test is whether the alternation is *intrinsic to the movement* or merely a *scheduling choice*. A bound's alternation is intrinsic — the landing leg of one repetition is the take-off leg of the next, so a single-side bounding set is a different exercise, and one set genuinely spans both sides. A rotational scoop throw is complete on one side; performing it left-then-right is two interleaved rounds of the same one-sided movement, which is exactly what O-12's round convention exists to record. Stated so a later author derives the same rule from the pair rather than either of two.
Contributions: `glutes` P, `quads` P, `adductors` S, `calves` S — the seeded Broad Jump's list with `hamstrings` S replaced by `adductors` S, encoding the frontal-plane push-off and landing, following the convention `bodyweight-shuttle-run` already set for the lateral plant.
Nearest existing: `bodyweight-broad-jump`. Criteria 2 and 3. `volumeCounting: "off"` is load-bearing — `reps` is a volume-capable profile, and five maximal bounds are not five sets of quads.

**C-23 `bodyweight-copenhagen-adduction-plank` — Copenhagen Adduction Plank.** Side-lying with the top leg's inner ankle or knee supported on a bench and the bottom leg lifted so the body forms a straight line, held for a recorded time. **Per O-12, one set row records one side's hold with both sides performed** — the `bodyweight-side-plank` convention exactly. Unilateral. Short-lever (knee-supported) and long-lever (ankle-supported) versions are not distinguished, as the seeded Side Plank does not distinguish elevated, weighted or hip-dip variants.
Contributions: `adductors` P, `abs` S. Two rows, matching the seeded Plank's density.
Nearest existing: `bodyweight-side-plank` (`abs` P, `lower_back` S, `glutes` S) — same family, same profile, same laterality, but the defining demand is hip adduction rather than lateral trunk bracing, which moves the primary. Criterion 2. The catalog's only adduction-loaded isometric and the leaf's second primary.

**C-24 `bodyweight-tibialis-raise` — Tibialis Raise.** Standing with the heels on the floor or on a raised edge, or leaning back against a wall with the heels planted, lifting the toes and forefoot toward the shins through full dorsiflexion and lowering under control. Bilateral; recorded as reps at `0 kg`, with any added load (a plate on the toes, a tib bar) entered in `weight_kg` on the same `load_reps` profile.
Contributions: `tibialis` P — a single row, matching the density of the other single-purpose isolation entries (`machine-hip-adduction`, `bodyweight-hanging-leg-raise`, `cable-woodchopper`). **`calves` is deliberately absent, in either role**: the triceps surae is the antagonist of this movement, and crediting it would misreport the exercise in the library and add spurious calf sets to the weekly volume screen. That refusal is the whole reason O-5 exists.
Nearest existing: **none.** `bodyweight-calf-raise`, `machine-seated-calf-raise` and `machine-standing-calf-raise` are the opposing movement; no catalog entry trains dorsiflexion, and before O-5 no leaf could receive it. Criterion 2, in its strongest form.

### Other

**C-10 `other-kettlebell-swing` — Kettlebell Swing.** A two-hand hip-hinge swing to roughly chest height and back between the legs; the arms transmit and do not lift the bell. Bilateral. The recorded load is the bell's mass.
Contributions: `glutes` P, `hamstrings` P, `lower_back` S, `abs` S.
Nearest existing: `cable-pull-through` — the same hip-hinge-against-horizontal-resistance shape with a different implement, load scale and intent. Criterion 4.
Equipment is `other` and `volumeCounting` is `auto` (O-1 accepted, both halves): `EQUIPMENT_TYPES` has no kettlebell value and adding one is outside this release's bounded vocabulary change (§12.7), and the swing's stored facts are ordinary load-and-reps that the volume model counts as one set per muscle per week. Two consequences accepted with the decision — `other` is e1RM-refused by equipment, and the seeded `loadStepKg` is 2.5 kg rather than a kettlebell's 4 kg ladder, editable once per exercise but not settable from the catalog (K-4).

**C-15 `other-forward-sled-drag` — Forward Sled Drag.** Facing away from the sled with a harness or straps at the waist or shoulders, walking or running forward over a recorded distance under a recorded total sled load; time is optional. Bilateral (alternating gait, R-10a).
Contributions: `glutes` P, `quads` S, `hamstrings` S, `calves` S, `abs` S — the deliberate inverse of the seeded Backward Sled Drag's `quads` P / `glutes` S, and consistent with the Release-3 bounded trunk-bracing note (`abs` only, no erector row).
Nearest existing: `other-sled-drag` ("Backward Sled Drag"). **This is D-R3-1's declined reading (b)**, and the Release-3 gate recorded the disposition verbatim: "Should either later be wanted, it is a new catalog entry under its own slug and its own gate, not an edit to this one." `other-sled-drag` is untouched.

**C-16 `other-sled-pull` — Hand-Over-Hand Sled Pull.** Standing or seated, hauling a rope attached to a loaded sled hand over hand toward the athlete over a recorded distance under a recorded total load. Bilateral (the hands alternate within the attempt).
Contributions: `upper_back` P, `lats` P, `biceps` S, `forearms` S.
Nearest existing: `other-sled-drag`. **D-R3-1's declined reading (c)** — an upper-body pull that shares no muscle row with either sled entry, which is exactly why that gate refused to fold it into one slug. Criterion 2.

**C-17 `other-med-ball-rotational-scoop-throw` — Medicine Ball Rotational Scoop Throw.** Standing side-on to a wall, the ball held low at the outside hip in both hands; the hips and trunk rotate and extend to throw the ball up and across the body into the wall, the ball retrieved and reset between repetitions. One set is a recorded number of throws at a recorded ball mass (`total`). **Unilateral: one set row records one side's throws, both sides performed** — an alternating execution is logged as one row per side. RIR is optional on `load_reps` and is expected to be left blank.
Contributions: `abs` P, `glutes` S, `front_delts` S — trunk rotation is the defining demand, the hips drive the throw at half credit, and the low-to-high arc passes through the shoulders. No `chest` or `triceps` row: nothing is pressed.
Nearest existing: `other-med-ball-slam` — same implement, same profile and basis, an overhead-to-floor sagittal slam rather than a low-to-high transverse throw. The two share `abs` P **and `front_delts` S**, and differ on the remaining rows: the slam carries `lats` P and `triceps` S, this carries `glutes` S. Criterion 2 rests on that difference and on the plane of motion, not on disjointness. (Corrected — review L-2.)
`volumeCounting: "off"` is load-bearing (`load_reps`), and `loadBasis: "total"` **must** be stated — omitting it seeds `'unspecified'` silently (K-5).

---

## 10. Final proposed `SeedCatalogExercise` literals

Matching `src/db/seed/exerciseCatalog.ts:15-51` exactly. `strengthEstimate` is omitted throughout; `laterality` appears only where `unilateral`; no `loadStepKg` and no contribution `weight`, because neither is expressible in the type. The block is appended **after** the entire existing catalog including the Release-3 athletic block (§11.5).

```ts
  // Catalog Expansion 1 — docs/reviews/exercise-catalog-expansion-evaluation.md
  // (owner-selected 2026-09-09; owner decisions O-1…O-5 accepted the same day;
  // contributions approved at that document's independent review). NOT the
  // athletic "Release 4" of
  // athletic-measurement-profiles-architecture-evaluation.md §21.4, which is a
  // different, still-unstarted body of work.
  //
  // Authoring rule for this block: the three measurement fields are stated
  // explicitly ONLY where the entry needs a non-default value, or where §16's
  // athletic authoring rule requires it (other-med-ball-rotational-scoop-throw,
  // bodyweight-lateral-bound). Ordinary load_reps entries omit all three and
  // keep the ~90-entry default precedent. `strengthEstimate` is omitted
  // throughout — the structural gate in src/domain/strength/eligibility.ts
  // decides, and no entry here has an inverted or fabricated load that the
  // switch would need to carry.
  //
  // bodyweight-tibialis-raise depends on the `tibialis` leaf added by this
  // release's ADR-010 amendment (O-5). `runSeed` seeds muscle groups before
  // the exercise catalog, so the FK target always exists first.

  // Barbell
  {
    slug: "barbell-rack-pull",
    name: "Barbell Rack Pull",
    equipment: "barbell",
    mechanics: "compound",
    // Generic by decision (O-3): pin height is not modelled, and the entry
    // assumes a CONSTANT height — without that, neither the load series nor
    // its e1RM estimate means anything. A second height is a future slug.
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "lower_back", role: "primary" },
      { muscleGroupId: "upper_back", role: "secondary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    slug: "barbell-power-clean",
    name: "Barbell Power Clean",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "quads", role: "secondary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "upper_back", role: "secondary" },
    ],
  },
  {
    // From a hang at or above the knee — no full first pull, which is why
    // `quads` is absent here and present on the power clean.
    slug: "barbell-hang-clean",
    name: "Barbell Hang Clean",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "upper_back", role: "secondary" },
    ],
  },

  // Dumbbell
  {
    // The catalog's only frontal-plane lower-body movement, and the
    // adductors leaf's second primary. O-12: one row per set records ONE
    // side, both sides performed.
    slug: "dumbbell-lateral-lunge",
    name: "Dumbbell Lateral Lunge",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "adductors", role: "primary" },
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-reverse-lunge",
    name: "Dumbbell Reverse Lunge",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
    ],
  },
  {
    // The catalog's only unilateral hinge; contributions deliberately
    // identical to dumbbell-romanian-deadlift (one movement, one convention).
    slug: "dumbbell-single-leg-romanian-deadlift",
    name: "Dumbbell Single-Leg Romanian Deadlift",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
    ],
  },
  {
    // Bilateral by design — that is the whole distinction from the
    // unilateral dumbbell-row, whose contributions this mirrors exactly.
    slug: "dumbbell-chest-supported-row",
    name: "Dumbbell Chest-Supported Row",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "rear_delts", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-pullover",
    name: "Dumbbell Pullover",
    equipment: "dumbbell",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "chest", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    slug: "dumbbell-thruster",
    name: "Dumbbell Thruster",
    equipment: "dumbbell",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "front_delts", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    // The catalog's FIRST `load_duration` entry: a static hold, so load and
    // time, no distance and no reps. `loadBasis` is required by the profile
    // and is per hand, matching dumbbell-farmers-carry.
    slug: "dumbbell-farmers-hold",
    name: "Dumbbell Farmer's Hold",
    equipment: "dumbbell",
    mechanics: "compound",
    measurementProfile: "load_duration",
    loadBasis: "per_hand",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },

  // Cable
  {
    // Anti-rotation, the one trunk demand with no entry. `load_reps` by
    // decision (O-2). O-12: the stack is on one side per set row, both sides
    // performed — unlike the pre-O-12 cable-woodchopper, which is seeded
    // bilateral and is deliberately not changed here.
    slug: "cable-pallof-press",
    name: "Cable Pallof Press",
    equipment: "cable",
    mechanics: "isolation",
    laterality: "unilateral",
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },

  // Machine
  {
    // The mirror of machine-hip-adduction. The vocabulary has no abductor
    // leaf and this release does not add one (O-5 is bounded to `tibialis`),
    // so `glutes` is the target.
    slug: "machine-hip-abduction",
    name: "Hip Abduction Machine",
    equipment: "machine",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "glutes", role: "primary" }],
  },
  {
    // The logged load is the ASSISTANCE — inverted, so the e1RM gate refuses
    // it on basis. `strengthEstimate` is deliberately NOT set: unlike the
    // legacy machine-assisted-pull-up, which carries a now-redundant 'off'
    // predating the basis column, the structural refusal is sufficient (R-7).
    slug: "machine-assisted-dip",
    name: "Assisted Dip",
    equipment: "machine",
    mechanics: "compound",
    loadBasis: "assistance",
    contributions: [
      { muscleGroupId: "triceps", role: "primary" },
      { muscleGroupId: "chest", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },

  // Bodyweight
  {
    // `duration` has no load field, so `loadBasis` is omitted and resolves to
    // null — the bodyweight-plank precedent.
    slug: "bodyweight-dead-hang",
    name: "Dead Hang",
    equipment: "bodyweight",
    mechanics: "isolation",
    measurementProfile: "duration",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-ab-wheel-rollout",
    name: "Ab Wheel Rollout",
    equipment: "bodyweight",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "abs", role: "primary" }],
  },
  {
    slug: "bodyweight-wall-sit",
    name: "Wall Sit",
    equipment: "bodyweight",
    mechanics: "isolation",
    measurementProfile: "duration",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
  {
    slug: "bodyweight-nordic-curl",
    name: "Nordic Hamstring Curl",
    equipment: "bodyweight",
    mechanics: "isolation",
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
  {
    // Jumps record ATTEMPTS, not distance (N-12). The count is total ground
    // contacts across both sides: a bound alternates sides within the set, so
    // it has no left round and no right round and stays bilateral (R-10a).
    // `volumeCounting: "off"` is load-bearing — `reps` is volume-capable.
    slug: "bodyweight-lateral-bound",
    name: "Lateral Bound",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "reps",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "adductors", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
    ],
  },
  {
    // O-12 / §7.2, the bodyweight-side-plank convention: one row per set
    // records ONE side's hold, both sides performed. Short- and long-lever
    // versions are not distinguished.
    slug: "bodyweight-copenhagen-adduction-plank",
    name: "Copenhagen Adduction Plank",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: "unilateral",
    measurementProfile: "duration",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "adductors", role: "primary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // Requires the `tibialis` leaf added by this release's ADR-010 amendment
    // (O-5). `calves` is deliberately absent in EITHER role: the triceps
    // surae is this movement's ANTAGONIST, and crediting it would both
    // mislabel the exercise and add spurious calf sets to weekly volume.
    // Added load (a plate, a tib bar) goes in weight_kg on the same
    // load_reps profile, so no explicit measurement field is needed.
    slug: "bodyweight-tibialis-raise",
    name: "Tibialis Raise",
    equipment: "bodyweight",
    mechanics: "isolation",
    contributions: [{ muscleGroupId: "tibialis", role: "primary" }],
  },

  // Other
  {
    // Two-hand swing. Equipment `other` and volumeCounting left to the
    // `auto` default, both by decision (O-1): EQUIPMENT_TYPES has no
    // kettlebell value, and the swing's facts are ordinary load-and-reps.
    // Consequences: e1RM refuses on equipment, and loadStepKg seeds at the
    // `other` default of 2.5 kg.
    slug: "other-kettlebell-swing",
    name: "Kettlebell Swing",
    equipment: "other",
    mechanics: "compound",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // D-R3-1's declined reading (b), added as its own slug exactly as that
    // decision anticipated. `other-sled-drag` (Backward Sled Drag) is
    // untouched; this is the harness drag, hip-extension led — the inverse
    // emphasis of the backward drag.
    slug: "other-forward-sled-drag",
    name: "Forward Sled Drag",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_distance",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "secondary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // D-R3-1's declined reading (c): an upper-body haul that shares no
    // muscle row with either sled entry.
    slug: "other-sled-pull",
    name: "Hand-Over-Hand Sled Pull",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_distance",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "upper_back", role: "primary" },
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "biceps", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    // Low-to-high transverse throw against a wall — NOT the seeded
    // other-med-ball-slam, which is the overhead-to-floor sagittal slam.
    // O-12: one row per set records ONE side's throws, both sides performed.
    // `loadBasis: "total"` MUST be explicit: omitting it silently seeds
    // 'unspecified' (M-1). `volumeCounting: "off"` is load-bearing.
    slug: "other-med-ball-rotational-scoop-throw",
    name: "Medicine Ball Rotational Scoop Throw",
    equipment: "other",
    mechanics: "compound",
    laterality: "unilateral",
    measurementProfile: "load_reps",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "front_delts", role: "secondary" },
    ],
  },
```

---

## 11. Mechanical consequences — catalog

### 11.1 Deterministic ids

Ids come from `slugToUuid("exercise:" + userId, slug)` (`exercises.ts:23-29`, `:110`), derived from the slug alone and **position-independent**. A new slug yields a new id; renaming an entry later never changes it. C-17's re-slug is free precisely because nothing has been seeded — after seeding, a re-slug would orphan the row and seed a duplicate, which is why the manifest must be final before the commit.

### 11.2 Ledger behaviour

`seedExerciseCatalogForUser` reads the user's applied slugs, filters the catalog to slugs never applied, inserts those, gives contributions only to rows the insert returned, and records every new slug — all in one transaction. Each of the 24 seeds **exactly once per user**, on the first `db:seed` after deploy. The 103 existing slugs are not touched, re-inserted or re-contributed, and the pre-ledger bootstrap branch is unreachable for this account. No exercise reconcile is needed or proposed: nothing about an existing row changes, and both reconcile constants (`STRENGTH_ESTIMATE_OFF_SLUGS`, `MEASUREMENT_PROFILE_RECONCILE_SLUGS`) are fixed legacy-slug lists that no new entry joins.

### 11.3 Preservation of user edits and deletions

Unchanged. The ledger skip is keyed on slug and entirely slug-agnostic (`EXERCISE_CATALOG.filter((item) => !applied.has(item.slug))`): an applied slug is skipped whether its row still exists, was edited, or was hard-deleted. The existing mechanism tests continue to prove this, none of them touching a new slug — edits survive a reseed (`seed.integration.test.ts:213`, `:231`), a removed contribution is not resurrected (`:265`), a hard-deleted seeded exercise is not resurrected (`:300`), and a custom exercise reusing a hard-deleted seeded name does not break reseeding (`:361`). Release 3 added an athletic-slug witness (`:323`) and a deterministic-id pin (`:343`); §16.4 copies that pattern onto one slug of this block.

### 11.4 Name collisions

The insert is arbiter-less `onConflictDoNothing()` (`exercises.ts:140-144`) against a partial unique index on `(user_id, lower(name)) where archived_at is null`. If an active exercise already carries a proposed name, Postgres silently skips that row **and the slug is still recorded as applied** — the entry is never seeded for that user again. A collision is not a retryable failure, which is why §16.6 keeps the production check as a pre-deployment gate.

### 11.5 Placement — appended, and the Release-3 assertion restated

The block is appended **after the entire existing catalog, including the Release-3 athletic block**, occupying positions 104–127. This is true append-only placement: each release's block follows the one it shipped after, which is the order a future reader will expect. Ordering the catalog around an incidental test form was rejected — the assertion, not the data, is what should change.

- `tests/integration/reconcileContributions.integration.test.ts:28` — `EXERCISE_CATALOG.slice(0, 40)` as `ORIGINAL_40_SLUGS`. **Unaffected by appending.**
- `tests/unit/exerciseCatalog.test.ts` — "is exactly the last ten catalog entries, in approved order, with every prior entry untouched", asserted with `slice(-10)`. **Restated**, preserving its meaning in full and strengthening it, because it pins the block's start rather than its distance from the end:

  ```ts
  it("is a contiguous block in approved order, immediately after the 93 pre-Release-3 entries", () => {
    const slugs = EXERCISE_CATALOG.map((item) => item.slug);
    const start = slugs.indexOf(RELEASE_3_ENTRIES[0]!.slug);
    expect(start).toBe(93);
    expect(slugs.slice(start, start + RELEASE_3_ENTRIES.length)).toEqual(
      RELEASE_3_ENTRIES.map((entry) => entry.slug),
    );
  });
  ```

  Nothing about Release 3's approved data changes; only the coordinate the assertion uses.

### 11.6 Test consequences — catalog

Verified against the current files.

| Site | Change | Note |
| --- | --- | --- |
| `tests/unit/exerciseCatalog.test.ts` — "is exactly 103 entries" | **103 → 127**, comment updated to name Catalog Expansion 1 | mechanical |
| — Release-3 "last ten" assertion | restate per §11.5 | meaning preserved, coverage strengthened |
| — "adds machine-hip-adduction … and adductors is used only by it and the shuttle run" | the expected set becomes the five slugs `machine-hip-adduction`, `bodyweight-shuttle-run`, `dumbbell-lateral-lunge`, `bodyweight-lateral-bound`, `bodyweight-copenhagen-adduction-plank`, asserted **order-insensitively** — compare as a `Set` (or sort both sides) and assert the length; the test is renamed again | **retain** `expect(entry?.name).toBe("Hip Adduction Machine")` and the single-row `adductors` primary assertion — that is the meaningful legacy coverage; only the exclusivity clause was ever a Release-2 artefact. **The order coupling is deliberately dropped** (review L-6): making a semantic assertion double as a block-order guard is the same positional brittleness §11.5 removes from the Release-3 `slice(-10)` form. Block order is carried by the dedicated `CATALOG_EXPANSION_1_ENTRIES` contiguity assertion, which is where it belongs |
| — "every other catalog entry still omits the three new fields" | add the **nine** entries that state one or more: `dumbbell-farmers-hold`, `machine-assisted-dip`, `bodyweight-dead-hang`, `bodyweight-wall-sit`, `bodyweight-lateral-bound`, `bodyweight-copenhagen-adduction-plank`, `other-forward-sled-drag`, `other-sled-pull`, `other-med-ball-rotational-scoop-throw` | exemption set 13 → 22; the test still proves **105** entries keep the default shape (it proved 90 before), so it does not lose meaning. C-24 is **not** exempted — it omits all three. Keep the exemption an explicit slug list; "skip anything that declares a field" would make it vacuous |
| — new: `CATALOG_EXPANSION_1_ENTRIES` | mirror the Release-3 block's own tests: per-entry exact metadata and contributions (`it.each`), a contiguous-block-at-index-103 assertion, `loadBasis` on exactly the five entries whose profile has a load field, `laterality: "unilateral"` on exactly the six of §6, `mechanics: "isolation"` on exactly the nine of §6, `volumeCounting` explicit on exactly the eight of §7, `strengthEstimate` undefined on all 24 | the Release-3 `describe` block is the template |
| — leaf-only assertion (`:247`) | **no change** — it checks membership in `LEAF_MUSCLE_GROUP_SLUGS`, which now contains `tibialis`, so C-24 passes without an exemption | the vocabulary change is what makes this true |
| `tests/integration/reconcileContributions.integration.test.ts:51` — `NOT_PRE_V2_SLUGS` | add the 24 new slugs alongside `machine-hip-adduction` and the Release-3 ten | fixture honesty (L-2): a "full-92 pre-v2 user" who already owned a Pallof Press is a state that never existed. Nothing fails today. Declare the list once per test file, as `RELEASE_3_ATHLETIC_SLUGS` already is |
| `tests/integration/seed.integration.test.ts` | one preservation witness on a new slug, plus stored-shape assertions for the new profiles | §16.4 |
| — everything else, and `reconcileMeasurementProfiles.integration.test.ts` | **no change** — catalog-relative (`EXERCISE_CATALOG.length`) and self-adjusting | — |
| Release-3 scoped assertions (`loadBasis` on five, unilateral on two, isolation on one, `volumeCounting` on ten) | **no change** — each filters by `RELEASE_3_ATHLETIC_SLUGS` before asserting | verified against the current test source |

### 11.7 Local name and slug check (performed for this specification)

Run against `src/db/seed/exerciseCatalog.ts` at `HEAD = 56ec000`, reproducing `uq_exercises_active_name`'s case-insensitive semantics over all 24 proposed slugs and names:

- 103 existing entries, 103 distinct lower-cased names.
- **All 24 slugs are new; all 24 names are distinct from every existing name case-insensitively, and from each other. Zero collisions.**
- Two substring near-misses, neither a unique-index collision (the index compares whole names): **"Assisted Dip"** contains "Dip" (`bodyweight-dip`), and **"Copenhagen Adduction Plank"** contains "Plank" (`bodyweight-plank`). Both read correctly in a searchable library.

Historical test fixtures were scanned for all 24 names. One hit: **"Ab Wheel Rollout"** at `tests/integration/metricsSelection.integration.test.ts:108`, in a test that seeds only muscle groups and never calls `seedExerciseCatalogForUser` — not a hazard. "Lateral Bound", "Copenhagen", "Tibialis" and "Scoop" appear nowhere in `tests/`. The hazard is real in principle: `strength.integration.test.ts` both calls `runSeed` and creates custom exercises by name, and a collision there would silently skip a seeded row and break the `EXERCISE_CATALOG.length` assertions. No proposed name triggers it.

**Production collision checking remains a pre-deployment gate** (§16.6), by the method of `athletic-measurement-profiles-release-3-predeployment-check.md`. That check covered the ten Release-3 names only; all 24 of this block are unchecked against the live account.

---

## 12. O-5 — the `tibialis` leaf, in full

Accepted 2026-09-09. This section is the reviewable design; it drafts the ADR amendment but does not apply it.

### 12.1 Exact specification

| Field | Value | Convention followed |
| --- | --- | --- |
| Slug | **`tibialis`** | Existing leaves use the plain anatomical or tracking-bucket noun (`chest`, `traps`, `quads`, `calves`, `adductors`, `lower_back`) rather than the precise anatomical name. `tibialis_anterior` was considered and rejected on that precedent — `lower_back` is the closest analogue, keeping the short slug and carrying the precision in the display name. |
| Display name | **"Tibialis (Shin)"** | Exactly the `lower_back` → "Lower Back (Erectors)" pattern: parenthetical clarification where the slug alone is ambiguous to a non-anatomist. (K-8's no-parentheses rule governs *exercise* names, not muscle display names — `MUSCLE_GROUP_DISPLAY_NAMES.lower_back` already uses them.) |
| `kind` | **`'muscle'`** | Every leaf is `'muscle'`; `'rollup'` remains `back` alone. Unchanged CHECK values, so `ck_muscle_groups_kind` is untouched. |
| Position | **18** | `MUSCLE_GROUPS` derives `position` as `index + 1` over `[...LEAF_MUSCLE_GROUP_SLUGS, ...ROLLUP_MUSCLE_GROUP_SLUGS]`. Appending `tibialis` last in the leaf list gives it 18 and moves **`back` from 18 to 19** — the only existing row whose `position` changes, and the seed upsert re-syncs it (`position: sql\`excluded.position\``). All 17 existing leaves keep positions 1–17 unchanged. |
| Rollup membership | **none** | `ROLLUP_MEMBERS.back` stays `["lats", "upper_back"]`. No second rollup, no hierarchy. |
| RP landmark | **none** | §12.2. |

**ADR-010's display sections are not a constraint on this choice** (review L-9). The Decision section says "Display sections (Back, Legs, Arms & Shoulders, Torso) are UI ordering only", which reads as something append-last would violate — but **nothing implements sections**: `src/ui/volume/VolumeScreen.tsx:113` and `src/ui/metrics/VolumeCard.tsx:18` both iterate `LEAF_MUSCLE_GROUPS` in plain array order, and no grouping component exists. The ADR sentence describes an intent that was never built, so append-last is consistent with the code as it stands; if sections are ever implemented, `tibialis` belongs in the Legs section and the array order becomes irrelevant.

**Display-order consequence, stated rather than hidden.** `VolumeScreen.tsx:113` and `VolumeCard.tsx:18` iterate `LEAF_MUSCLE_GROUPS` in array order, so Tibialis (Shin) renders **last**, after "Lower Back (Erectors)". Inserting it after `calves` instead would read better anatomically but would shift `lower_back`'s position as well; append-last was chosen because it matches ADR-010's own "add-only, appended" treatment of `back` and changes the fewest existing rows. Either is defensible; the reviewer should confirm the choice rather than assume it.

### 12.2 No RP landmark, and no invented band

`RP_ROWS` (`volumePresets.ts:50-76`) is an explicit 13-row table; a new leaf is simply absent from it, so `seedVolumePresets` writes no landmark for `tibialis`. That is the correct outcome and the existing behaviour for five leaves already: `VolumeScreen.tsx:38-39`'s `landmarksFor` returns `[]` for a group with no landmark rows, and `MuscleRow` renders volume with no reference band. RP's table has no shin row and inventing one would be exactly the "per-leaf landmark invention" that `volume-model.md:123` places out of scope.

One consequence that is **not** a no-op: `RP_GENERAL_DESCRIPTION` (`volumePresets.ts:24-32`) names the landmark-less groups in user-visible copy — "RP has no row for Lats, Upper Back, Adductors, Forearms, or Lower Back (Erectors)". That sentence must gain Tibialis (Shin), or the preset description becomes wrong the moment the leaf exists. The description is re-upserted on every `db:seed`, so the fix propagates without a migration.

Users may still add their own landmark for the new leaf through the volume screen's existing edit affordance — `volume_landmarks.muscle_group_id` is an unconstrained FK to `muscle_groups(id)` — which is the pre-existing rule, not a new capability.

### 12.3 Implementation footprint

Everything below is derived unless listed as an edit. The `src/` and `tests/` sweep behind it covered every reference to `LEAF_MUSCLE_GROUP_SLUGS`, `MUSCLE_GROUP_SLUGS`, `MUSCLE_GROUPS`, `LEAF_MUSCLE_GROUPS`, `MUSCLE_GROUP_DISPLAY_NAMES` and `ROLLUP_MEMBERS`, and was independently reproduced by the review (§6.4 there) with no additional consumer found. **The earlier unqualified "this is the complete set" claim is withdrawn** (review M-4): it was accurate for `src/` and `tests/` and inaccurate for documentation, where two further files are maintained alongside the vocabulary. The documentation list below is now derived from ADR-010's own Consequences section, which records exactly which documents the v2 pass amended.

**Source — four files** (two for O-5, two for D-CE1-1(iii)):

1. `src/domain/exercises/muscleGroups.ts` — append `"tibialis"` to `LEAF_MUSCLE_GROUP_SLUGS`; add `tibialis: "Tibialis (Shin)"` to `MUSCLE_GROUP_DISPLAY_NAMES`; update the header comment's "17 leaves + 1 rollup" to "18 leaves + 1 rollup" and cite the amendment. The display-name entry is **type-enforced**: `MUSCLE_GROUP_DISPLAY_NAMES` is `Record<MuscleGroupSlug, string>`, so omitting it fails `pnpm typecheck` rather than shipping an `undefined` label.
2. `src/db/seed/volumePresets.ts` — the `RP_GENERAL_DESCRIPTION` sentence in §12.2. **No `RP_ROWS` entry.**
3. `src/ui/exercises/ContributionEditor.tsx` — the unknown-slug self-only option of §12.8.
4. `src/ui/exercises/muscleGroupDisplay.ts` — the unknown-slug label fallback of §12.8.

**Source — derived, zero edits (verified, not assumed):**

| Consumer | Why it needs no change |
| --- | --- |
| `MUSCLE_GROUP_SLUGS`, `MUSCLE_GROUPS`, `LEAF_MUSCLE_GROUPS`, `muscleGroupSlugSchema`, `leafMuscleGroupSlugSchema`, `isMuscleGroupSlug`/`isLeafMuscleGroupSlug`/`isRollupMuscleGroupSlug` | all computed from the two constants in the same file |
| `src/db/seed/muscleGroups.ts` | one upsert over `MUSCLE_GROUPS`; the new row inserts and `back`'s position updates in the same statement |
| `src/domain/exercises/schema.ts:165-180` | `createContributionsListSchema`'s `.max()` is `LEAF_MUSCLE_GROUP_SLUGS.length`, so the cap moves 17 → 18 by itself; `updateContributionsListSchema` likewise via `MUSCLE_GROUP_SLUGS.length` |
| `src/domain/volume/aggregate.ts:88`, `:120` | seeds its leaf map from `LEAF_MUSCLE_GROUP_SLUGS`; the new leaf appears with `{ effective: 0, raw: 0 }` and joins no rollup |
| `src/ui/volume/VolumeScreen.tsx:113`, `src/ui/metrics/VolumeCard.tsx:18` | iterate `LEAF_MUSCLE_GROUPS`; the card filters to groups with non-zero sets, so Tibialis appears there only once trained |
| `src/ui/exercises/ContributionEditor.tsx:54`, `:68` | option list and add-row cap both read the domain constants — *for the new leaf*. Both files are nonetheless **edited** under D-CE1-1(iii), for the unrelated unknown-slug case (§12.8) |
| `src/ui/exercises/muscleGroupDisplay.ts` | reads `MUSCLE_GROUP_DISPLAY_NAMES`; `tibialis` is a leaf, so no "Unclassified" prefix — same note as above |
| `src/server/**` | **no server module reads `muscle_groups` at runtime.** The only reference is the comment at `src/server/exercises/service.ts:428-431`, which documents the `23503` FK path for a slug missing from the table — the reason §16.2's ordering matters |
| `src/sync/**`, API routes | the vocabulary is compiled into the bundle from the domain constant; there is no muscle-group endpoint and no cached client copy to invalidate |

**Tests — five files:**

| File | Change |
| --- | --- |
| `tests/unit/muscleGroups.test.ts` | `EXPECTED_LEAVES` gains `"tibialis"` (last); `LEAF_MUSCLE_GROUP_SLUGS` 17 → 18; `MUSCLE_GROUP_SLUGS` 18 → 19; `MUSCLE_GROUPS.filter(kind === "muscle")` 17 → 18; `LEAF_MUSCLE_GROUPS` 17 → 18; a new `expect(MUSCLE_GROUP_DISPLAY_NAMES.tibialis).toBe("Tibialis (Shin)")`. **Four title/comment sites also move** (review L-8), all of which state the counts in prose: `:15` (header comment "vocabulary v2: 17 leaves + 1 rollup"), `:37` (title "has exactly 17 leaves and exactly 1 rollup, totaling 18 slugs"), `:52` (**leave this title verbatim** — its test asserts the fourteen display names that pre-date ADR-010, and `tibialis` is not one of them; the count of pre-existing leaves does not change and this row must not be renumbered), `:69` (title "has display names for the 3 new leaves and the back rollup" — **this is where the new `tibialis` assertion belongs**: either keep the title scoped to ADR-010's three and add a separate assertion beside it, or retitle to name the amendment's leaf too). The rollup assertions (`["back"]`, membership `["lats", "upper_back"]`) must **stay unchanged** — they are the guard that O-5 added a leaf and not a rollup |
| `tests/integration/seed.integration.test.ts` | `:87` comment and `:88` title "18 canonical muscle groups" → 19; `:99` `kind === "muscle"` 17 → 18. `:93`, `:94` and `:128` are `MUSCLE_GROUP_SLUGS`-relative and self-adjust |
| `tests/integration/volumePresetsSeed.integration.test.ts` | `NO_RP_ROW_LEAVES` (`:19`) gains `"tibialis"`; `:201`'s `expect(LEAF_MUSCLE_GROUP_SLUGS.length).toBe(17)` → 18 |
| `tests/unit/volumePresetsSeed.test.ts` | `NO_RP_ROW_LEAVES` (`:34`) gains `"tibialis"`. The description test's label mapping needs **no new branch**: it falls through to the slug itself, and "Tibialis (Shin)".toLowerCase() contains "tibialis" |
| `tests/e2e/muscleTaxonomyV2.spec.ts` | the hardcoded option-text list (`:47-66`) gains "Tibialis (Shin)" as the final option; the `leaves` array (`:69-87`) gains `"tibialis"`. **The cap is encoded at three number sites, not one** (review L-7): the test title at `:36` ("the add-row cap is 17 not 18") and the comment at `:88-90` ("the cap holds at exactly 17 leaves, not 16 (off-by-one) or 18 (the pre-fix full-vocabulary count)") — all of 17→18, 16→17 and 18→19 move together. **`:66`'s `expect(optionTexts).not.toContain("Back")` must be retained verbatim**: it still passes with "Tibialis (Shin)" appended, and it is the guard that O-5 added a leaf and not a rollup. This is the largest single test edit in O-5 and the one most likely to be missed, because it hardcodes the vocabulary twice and the cap three times |
| — same file, `:140-165` and `:195-225` | **must keep passing unchanged** — the legacy-rollup round-trip and reclassify specs, including both `not.toContain("undefined")` assertions and `:209`'s `expect(newRowOptions).not.toContain("Back")`. They are the pre-existing regression surface for §12.8's hardening (§12.8 NC-C, NC-D) |

**Documentation — six files, in the same commit.** Derived from ADR-010's Consequences section, which records that the v2 pass amended "domain-model §2, data-model §2.3/§2.5/§2.17/§4/§5, volume-model §1–6, implementation-plan (§1.4, Pre-Phase 6, Phase 6, §3), evidence-to-design #19" — so implementation-plan and evidence-to-design are maintained alongside the vocabulary, not frozen.

| File | Change |
| --- | --- |
| `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` | the amendment drafted in §12.4, whose supersession clause now also covers `:140`'s "five leaves display without reference bands" → six |
| `docs/architecture/domain-model.md:58`, `:61` | "**17 leaves + 1 rollup**" → 18; the leaf list gains `tibialis` |
| `docs/architecture/volume-model.md:93`, `:123` | the landmark-less list gains `tibialis`; "beyond vocabulary v2's 17 leaves + `back` rollup" → 18 |
| `docs/architecture/data-model.md:47`, `:312` | "18 rows = 17 leaves + the `back` rollup" → "19 rows = 18 leaves + the `back` rollup"; the landmark-less list gains `tibialis` |
| `docs/architecture/implementation-plan.md:166`, `:177`, `:179`, `:185` | **annotated, not rewritten.** These are completed-phase records ("`muscle_groups` becomes 18 rows", "the editor offers 17 leaves", "unit — vocabulary constants (18 rows …)", "built once against taxonomy v2 (17 leaves + `back` rollup)"). The file's own precedent for this is `:95`, which carries "superseded by taxonomy v2's 17 leaves + `back` rollup in the Pre-Phase 6 pass" rather than a silent edit of what that phase actually built. Each of the four gets the same treatment: a parenthetical "(superseded by ADR-010 Amendment 1 — 18 leaves; `muscle_groups` becomes 19 rows)". Rewriting them would falsify the record of what those phases shipped |
| `docs/architecture/evidence-to-design.md:45` (row 19) | one clause appended to the existing ADR-010 row recording the amendment. **No new evidence item and no new row**: `tibialis` is a labelling convention, and row 19 already carries the "leaf boundaries and the partition are coaching vocabulary, not corpus findings" framing that §2 relies on. Adding an evidence row would claim support this leaf does not have and does not need |

### 12.4 Draft ADR-010 amendment

To be appended to `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` in the implementation commit. It is written as an appended amendment rather than an edit of the body, so the accepted 2026-08-23 decision stays legible as it was taken.

> ## Amendment 1 (2026-09-09) — add-only leaf: `tibialis`
>
> **Status:** Accepted. Owner decision O-5 of `docs/reviews/exercise-catalog-expansion-evaluation.md`, taken with that document's Catalog Expansion 1 selection. Exercised under this ADR's own "Mutation rules: add-only" clause, which requires an amendment for any further group.
>
> **Context.** Catalog Expansion 1 adds a Tibialis Raise. The v2 vocabulary has no leaf for the anterior shin: `calves` is the triceps-surae bucket and is this movement's *antagonist*, so crediting it would misreport the exercise in the library and add spurious calf sets to the weekly volume screen. The domain requires at least one primary leaf per exercise, and the constraint binds the athlete's own create flow identically — the exercise form offers only the leaf vocabulary. The gap is therefore in the vocabulary, not in the catalog.
>
> **Decision.** Add one leaf, `tibialis`, display name "Tibialis (Shin)", `kind = 'muscle'`, position 18 (appended last in the leaf list, moving the `back` rollup from position 18 to 19). It joins no rollup: `ROLLUP_MEMBERS.back` remains `["lats", "upper_back"]`. The vocabulary becomes **18 leaves + 1 rollup**.
>
> **What this supersedes, exactly.** Three statements of the original decision, and no others:
>
> 1. The Vocabulary section's "**17 leaves + exactly one rollup**" → 18 leaves + exactly one rollup, with `tibialis` added to the leaf list.
> 2. The Consequences section's "The volume screen shows 17 leaf rows plus the Back reconciliation line" → 18 leaf rows.
> 3. The same sentence's "**five leaves display without reference bands** (two already did)" → **six** — `lats`, `upper_back`, `adductors`, `forearms`, `lower_back` and now `tibialis`.
>
> The Rejected-alternatives entry "**Single deploy** — disproved against the live build's editor paths; replaced by two ordinary releases rather than pipeline changes or flags" is **not** superseded and remains correct for the case it decided: the v2 pass reconciled 14 pre-existing exercises whose editor could write `back` rows back over reconciled data, and rejecting a single deploy for that was right. This amendment ships a single deploy over the same editor path in a materially different case — one brand-new row, nothing reconciled, no existing contribution changed, and no write-back surface — and that difference was put to the owner and decided explicitly as **D-CE1-1**, option (a), rather than inherited from the earlier rejection. Every other sentence of this ADR stands as written.
>
> **No landmark.** RP's table has no shin row, so `tibialis` receives none and renders without a reference band — the treatment `lats`, `upper_back`, `adductors`, `forearms` and `lower_back` already have. `RP_GENERAL_DESCRIPTION`'s list of landmark-less groups is updated with it. No range is invented.
>
> **No migration.** `muscle_groups` is seeded reference data with a bare `text` primary key; its only CHECK constrains `kind`, and both referencing foreign keys enumerate no values. The row is created by `seedMuscleGroups`'s existing upsert on the next `db:seed`. This is the property the original Context section relied on — "seeded reference data (not a hard-coded DB enum) so future groups are additive" — now exercised for the first time.
>
> **No reconciliation, and no reinterpretation of history.** Nothing is remapped. No existing contribution row changes, so the sum-preservation reasoning of the original decision does not engage: every muscle's series before and after this amendment is identical, and the new leaf's series begins empty and is populated only by contributions created after it exists.
>
> **Rollout.** One release, on the unchanged pipeline, **per owner decision D-CE1-1 option (a)** — recorded in §13 of the expansion specification, not asserted here. No server module reads `muscle_groups` at runtime, so the new row is invisible to the pre-deploy server. Two exposures follow, analysed in that specification's §12.6 and **not** claimed to be self-correcting:
>
> - an **old-server** window, bounded by the App Service deployment step of a single workflow job, in which a save of the new exercise is rejected;
> - a **stale-client** window that is **unbounded by design** — `skipWaiting: false` makes activation a deliberate tap — in which the new exercise's muscle picker appears unset and a save can persist a wrong muscle that the post-deploy server accepts.
>
> D-CE1-1's three controls answer these: a mandatory client-update-and-confirm step on every client used with the account, a post-deployment read-only verification of the entry's contributions, and forward hardening of the contribution editor so the next amendment does not reproduce the picker failure. The comparison with this ADR's own two-stage rollout is one of magnitude and is argued in the supersession note above; it is not a claim that the exposure is nil.
>
> **Scope of this amendment.** Exactly one leaf. It is not a precedent for a second rollup, a hierarchy, a `kind` change, or bulk vocabulary growth; an abductor or oblique leaf would need its own amendment on its own evidence.

### 12.5 Why no database migration — substantiated from the code

Not assumed. Four independent facts, each checkable:

1. **The table's primary key is free text.** `drizzle/0001_modern_blonde_phantom.sql:1-5` creates `muscle_groups` as `("id" text PRIMARY KEY NOT NULL, "display_name" text NOT NULL, "position" smallint NOT NULL)`. There is no Postgres enum type and no CHECK on `id`.
2. **The only CHECK on the table constrains `kind`, not the slug set.** `src/db/schema/muscleGroups.ts:25` builds `ck_muscle_groups_kind` from `MUSCLE_GROUP_KINDS`, and `drizzle/0007_safe_triathlon.sql:2` is its DDL: `CHECK ("muscle_groups"."kind" in ('muscle', 'rollup'))`. Adding a leaf changes neither `MUSCLE_GROUP_KINDS` nor any `kind` value. **This is the decisive contrast with the app's other vocabularies:** `src/db/schema/exercises.ts:72-99` builds CHECK constraints from `EQUIPMENT_TYPES`, `MECHANICS_TYPES`, `LATERALITY_TYPES`, `MEASUREMENT_PROFILES`, `LOAD_BASES` and `VOLUME_COUNTING_MODES` via the same `checkInList` helper — which is exactly why adding a kettlebell equipment value (O-1) *would* require a migration and adding a muscle leaf does not.
3. **No referencing constraint enumerates values.** `exercise_muscle_contributions.muscle_group_id` (`src/db/schema/exerciseMuscleContributions.ts:22-26`, DDL at `drizzle/0001:40`) and `volume_landmarks.muscle_group_id` (`src/db/schema/volumeLandmarks.ts:24-26`, DDL at `drizzle/0008:34`) are plain FKs to `muscle_groups(id)` with `on delete restrict`. A new parent row satisfies them trivially.
4. **No migration has ever inserted a muscle-group row.** `muscle_groups` appears in exactly three migration files — `0001` (CREATE TABLE + the contributions FK), `0007` (the `kind` column and its CHECK), `0008` (the landmarks FK) — and none contains an `INSERT`. The 18 rows exist solely because `seedMuscleGroups` upserts them from the domain constant on every deploy. ADR-010 established this deliberately: "The schema migration adds only `muscle_groups.kind`. No data motion in SQL."

**Therefore `pnpm db:generate` must produce no new migration file.** That is a verification step, not an assumption — §16.4 runs it and asserts the no-op, following the NC-12 `db:generate` precedent from the athletic evaluation §13.5. If it *does* emit a file, something in this analysis is wrong and the implementation stops.

What *is* required instead of a migration is **seed order**, which already holds: see §16.2.

### 12.6 Rollout exposure — two separate windows

Rewritten in full against the independent review's trace (H-1), which was re-verified line by line against the source at `HEAD` before adoption. The earlier version of this section analysed one window, named the other in a single clause, and described the failure mode incorrectly in both branches. **The word "accepted" has been removed from this section**: what is accepted is D-CE1-1 option (a), the owner's decision on how to control the exposure, not the exposure itself (H-2).

The pipeline (`.github/workflows/deploy.yml:105-123`) runs `db:migrate → db:seed → Deploy to Azure App Service` inside one job, so `db:seed` completes under the **previous** application build. From that moment the database holds a `tibialis` muscle group and a seeded Tibialis Raise whose only contribution targets it, while two different pieces of 17-leaf code may still be running. They are not the same window and do not have the same duration.

#### Window A — old server, new data. Short, bounded, loud.

Lasts from the end of the seed step to the end of the App Service deployment step of the same workflow job.

- **Reads are safe.** `src/server/exercises/service.ts:151` casts (`row.muscleGroupId as MuscleGroupSlug`) rather than parsing, so serving a `tibialis` row cannot 500. `src/domain/volume/aggregate.ts:107-118` matches a row against `isLeafMuscleGroupSlug` then `isRollupMuscleGroupSlug`; an unrecognised slug matches neither and is dropped — no crash, no fabricated key, only an undercount for the seconds the window lasts.
- **Writes fail, and fail confusingly.** `updateContributionsListSchema` is built from `muscleGroupSlugSchema` (`src/domain/exercises/schema.ts:177-180`), so a PATCH carrying `tibialis` is a 400 — and `ExerciseForm.tsx:295` renders it as "Please check the muscle contributions: at least one primary is required", which is not what went wrong. In this window the athlete also cannot save *any* edit to that exercise — name, notes, load step — because the whole contribution array round-trips through the same validation.

#### Window B — stale client, new server. Unbounded, silent, and the one that matters.

This is the window the earlier version named in one clause and never analysed.

**It is unbounded by deliberate policy, not by deploy duration.** `src/app/sw.ts:339-340` sets `skipWaiting: false` and `clientsClaim: false` — "Never auto-activate a new SW mid-session — activation is user-triggered" (pwa-offline-strategy.md §8). The only trigger is the athlete tapping "Update available — tap to refresh" (`src/ui/ServiceWorkerUpdater.tsx:50-59`). A stale bundle therefore persists across sessions indefinitely, at the athlete's discretion. **"For the length of one deploy" was false for the client and is withdrawn.**

**Rendering: blank, never the literal string.** `ExerciseLibrary.tsx:98-101` maps `contributionMuscleLabel` over the primary contributions and `.join(", ")`s them; `muscleGroupDisplay.ts:11-14` returns `MUSCLE_GROUP_DISPLAY_NAMES[muscleGroupId]`, which is `undefined` for `tibialis` despite the declared `: string` return type. `Array.prototype.join` renders `undefined` as `""`, so the row's muscle line is **empty**. The "literal-`undefined`" alternative offered earlier is unreachable and is withdrawn (review L-3). Two existing e2e assertions already pin this class of symptom (`muscleTaxonomyV2.spec.ts:156`, `:222`).

**An untouched save preserves `tibialis` — the earlier "silent substitution" claim was wrong.** `ExerciseForm.tsx:158-165` seeds React state directly from the DTO, so the row holds `"tibialis"`. `ContributionEditor.tsx:64-69` builds options from `LEAF_MUSCLE_GROUPS` and special-cases only `isRollupMuscleGroupSlug`, so on a 17-leaf bundle no option matches; React then selects the first non-disabled option, which is `<option value="">Select muscle…</option>` (`:79`). But no `change` event fires, React state still holds `"tibialis"`, and `buildContributionsPayload` (`ExerciseForm.tsx:184-186`) skips only `""` — the payload is built from state, not from the DOM. So an untouched save round-trips `tibialis` correctly.

**The real hazard is a user-induced substitution, and it is worse than the one previously described.** The picker does not merely lack a label: it reads "Select muscle…", which is indistinguishable from a genuinely unset row. The nearest plausible option in the visible list is **Calves** — the exact muscle C-24 and the §12.4 amendment exist to keep off this entry. Against the **new** server that PATCH is well-formed and valid, so it is accepted with no 400 and no warning; nothing distinguishes it from a deliberate edit. Nothing corrects it afterwards: no reconcile touches a new slug (§11.2), and the ledger has already recorded it. The weekly volume screen would then report the spurious calf sets the amendment forbids, permanently, until the athlete noticed and re-edited.

**A genuine bound: there is no offline or replay path for this.** `SYNC_ENTITIES` (`src/domain/sync/schema.ts:33-41`) is `workoutSession, sessionExercise, setLog, recommendation, recommendationDecision, bodyweightEntry, recoveryEntry` — **there is no `exercise` entity**, and a grep across `src/sync/**` returns no reference to muscle groups or contributions at all. The exercise edit path is a direct `fetch` PATCH (`ExerciseForm.tsx:265-275`), never enqueued. A wrong muscle therefore cannot be queued offline, cannot be replayed, and cannot arrive later from a device that has been shut in a drawer: it requires a deliberate online save while the stale bundle is running.

#### Why no code in this commit can close Window B

**The vulnerable artefact is the bundle already installed on the device.** The code that misbehaves predates this commit, so nothing shipped in it can reach that code — this is a real constraint, not a preference, and it is why §12.8's hardening is described as *forward* protection rather than a fix. The controls that do apply are operational, and D-CE1-1(i)/(ii) make them mandatory steps rather than a caveat: force the client update and confirm the new vocabulary is live **before** the new exercise is opened, then verify the stored contributions afterwards. §16.7 carries both as numbered steps.

**"Do not edit Tibialis Raise until the app update is applied" is withdrawn as a mitigation.** It relied on the athlete knowing which exercise was risky and why, at a moment when nothing on screen says so, and it left the failure undetected if ignored. It is replaced by the D-CE1-1 controls.

#### Why this does not justify a second release

ADR-010's two-stage rollout existed because the live build could write `back` rows back over **reconciled data** and reject saves across the whole reconciled set — a data-integrity hazard spanning 14 pre-existing exercises with history. Here nothing is reconciled, no existing row changes, no exercise with history is touched, and the hazard requires a deliberate edit-and-save on one brand-new row. The magnitude argument stands; what changed is that it is now the owner's explicit decision (D-CE1-1) rather than a residual absorbed by O-5, and that the residual is made **detectable** by D-CE1-1(ii) rather than merely tolerated.

### 12.7 Bounded, and what it is not

The vocabulary change is exactly one leaf. It does **not** license: a second rollup, a hierarchy or `parent_id`, a `kind` value, an abductor leaf (C-3 still credits `glutes`), an oblique leaf (C-6, C-17 and C-23 still credit `abs`), a rotator-cuff leaf, or an equipment-vocabulary value (C-10 is still `other`). Each of those remains where §14 leaves it: reopenable only under its own amendment and its own evidence.

The UI hardening of §12.8 is bounded in the same way: it changes how an **unrecognised** slug is displayed and preserved, and nothing else. It adds no vocabulary, offers no new value to any contribution row, and does not touch validation on either side of the wire.

### 12.8 Forward hardening — unknown-slug handling (D-CE1-1(iii))

**What is wrong today.** `ContributionEditor.tsx:64-69` special-cases exactly one value the option list cannot show — a rollup slug — and renders it as a **self-only option**, so it "stays visible/editable without ever being offered to a different (new or leaf) row". That mechanism is right; it is simply not general. Any slug that is neither a known leaf nor a known rollup falls through to an option list that cannot represent it, and React selects the first non-disabled option — "Select muscle…", which reads as *unset*. `muscleGroupDisplay.ts:11-14` compounds it: it declares `: string` but returns `MUSCLE_GROUP_DISPLAY_NAMES[muscleGroupId]`, which is `undefined` outside the compiled record. The compiler cannot catch this, because the parameter is typed `MuscleGroupSlug` while the runtime value arrives through a cast at `src/server/exercises/service.ts:151`.

**The change.** Generalise the existing rollup mechanism to any unrecognised value, and give the label helper a fallback:

1. `ContributionEditor.tsx` — replace the rollup-only special case with: *if the row's current value is non-empty and is not in `LEAF_MUSCLE_GROUPS`, prepend it as a **self-only** option*. A known rollup keeps its existing `MuscleGroupDefinition` and its "Unclassified …" label; an unrecognised slug is shown with the fallback label from (2). The option list for every **other** row is untouched.
2. `muscleGroupDisplay.ts` — `contributionMuscleLabel` returns `MUSCLE_GROUP_DISPLAY_NAMES[slug] ?? slug`, keeping the `isRollupMuscleGroupSlug` "Unclassified " prefix exactly where it already applies. A future unknown slug then renders as its raw slug — visibly *set*, visibly unfamiliar — instead of blank.

About ten lines across two files.

**What it explicitly does not do:**

- **It does not offer an unknown slug to any other contribution row.** The self-only scoping is the whole point, and it is the same guarantee `back` already has (`muscleTaxonomyV2.spec.ts:209` is the existing proof).
- **It does not broaden server acceptance.** `createContributionsListSchema` still rejects anything outside the leaf enum and `updateContributionsListSchema` still rejects anything outside the full enum; a stale client that preserves and re-submits an unknown slug to an *old* server still gets a 400. The fallback governs display and round-tripping, not validity.
- **It does not change the rollup rules.** Leaf-only creation, rollup carry-through on update, and the "Unclassified Back" copy are all unchanged.
- **It does not help Window B.** The stale bundle predates this code (§12.6). Its value is entirely forward: on the *next* vocabulary addition — which ADR-010's add-only mutation rule makes a matter of when, and which O-5 now precedents — a stale client will show the raw slug rather than an apparently-empty picker, so the athlete is not invited to substitute a wrong muscle. Shipping it alongside the amendment that creates the precedent is the proportionate response.

**Regression and negative controls** (required, and additional to the existing suite):

| Id | Control | Why |
| --- | --- | --- |
| NC-A | Given a contribution row holding a slug in neither `LEAF_MUSCLE_GROUP_SLUGS` nor `ROLLUP_MUSCLE_GROUP_SLUGS`, the picker shows that slug as its selected option — **never** "Select muscle…", never blank — and `contributionMuscleLabel` returns the raw slug | the fallback's primary claim |
| NC-B | **Round-trip preservation:** loading that exercise and saving without touching the picker submits the same slug it loaded — asserted on the payload, not the DOM | the property that makes the fallback safe rather than merely cosmetic |
| NC-C | A **newly added** row on the same form offers neither the unknown slug nor `back` | the self-only scoping; extends `muscleTaxonomyV2.spec.ts:209`'s existing coexistence proof rather than replacing it |
| NC-D | The existing rollup specs pass **unchanged**: `muscleTaxonomyV2.spec.ts:140-165` (a legacy `back` row round-trips an untouched save and still renders "Unclassified Back") and `:195-225` (reclassify to Lats works; the row then shows "Lats" and not "Unclassified"), including both `not.toContain("undefined")` assertions | proves the generalisation did not alter the rollup path it was derived from |
| NC-E | `contributionMuscleLabel` still prefixes "Unclassified " for a rollup slug and **not** for an unknown one | the fallback must not turn every unknown slug into a pseudo-rollup |
| NC-F | Server validation is unchanged: create with an unknown slug → 400; update introducing an unknown slug → 400; update carrying through an existing rollup row → accepted | the explicit negative control on "does not broaden server acceptance" |

NC-A, NC-B and NC-E are unit-level; NC-C and NC-D are e2e; NC-F is integration, against the existing exercise-service tests.

---

## 13. Owner decisions — all accepted

Recorded for the reviewer. Inclusion of all 24 entries and all six decisions below are settled; none is reopened by this document. **D-CE1-1 is deliberately listed apart from O-1…O-5**: those five were taken with the selection, while D-CE1-1 was raised by the independent review (H-2) after establishing that this document had recorded the rollout exposure as "accepted under O-5" when no owner had in fact decided it. O-5 decided that the leaf and the exercise ship; it did not decide how to control a hazard derived afterwards.

| Id | Decision | Accepted outcome | Where it lands |
| --- | --- | --- | --- |
| **O-1** | Kettlebell Swing: equipment and volume counting | **`other` equipment; `volumeCounting` omitted → `auto`.** A kettlebell is not a dumbbell and its load ladder differs; the swing's facts are ordinary load-and-reps, and the volume model counts sets per muscle per week. Accepted consequences: e1RM refused on equipment, `loadStepKg` seeds at 2.5 kg, editable per exercise | C-10 (§9, §10) |
| **O-2** | Cable Pallof Press: profile | **`load_reps`**, all three measurement fields omitted. Timed loaded holds are served by C-18 | C-6 (§9, §10) |
| **O-3** | Barbell Rack Pull: pin height | **Generic entry**, with the constant-pin-height convention documented in the entry's catalog comment. A second height would be a future slug | C-11 (§9, §10) |
| **O-4** | Barbell Power Clean: `strengthEstimate` | **Omitted → `auto`.** K-7's `'off'` rule covers inverted and fabricated loads only; a clean's load and reps are real. No new `'off'` precedent is created, and the disable-only toggle stays one tap away | C-12 (§7, §9) |
| **O-5** | Tibialis Raise: the missing leaf | **Add a `tibialis` leaf via a minimal ADR-010 amendment, then include the exercise.** Full design, footprint, amendment draft and migration analysis in §12. **This decision covers the vocabulary and the inclusion only** — the rollout control is D-CE1-1 | C-24 + §12 |
| **D-CE1-1** | How to control the stale-client wrong-muscle write window (§12.6, Window B) | **Option (a).** One delivery, one commit, **deployment pipeline unchanged**, with three controls: **(i)** a mandatory post-deploy step to apply the client update and confirm "Tibialis (Shin)" is selectable in the contribution picker **before** the new exercise is opened or used — **on every client used with the account**, not just the phone; **(ii)** a post-deployment **read-only** verification that `bodyweight-tibialis-raise` holds exactly one `tibialis` primary contribution at weight 1.0 and no `calves` contribution in either role; **(iii)** the forward hardening of `ContributionEditor` and `contributionMuscleLabel` in the same delivery. The review's option (b) — reordering the deploy workflow to `db:migrate → deploy → db:seed` — and option (c) — two releases — are both **declined**: (b) closes only the short Window A while leaving Window B to (i) anyway, and changes a shared pipeline for a one-off; (c) contradicts the accepted one-delivery scope and spends a deploy cycle on one brand-new row with no history | §12.6, §12.8, §16.3, §16.7 |

---

## 14. Deferred — candidates that would need a further capability

| Deferred | What it would need | Trigger |
| --- | --- | --- |
| Kettlebell as an equipment value | `EQUIPMENT_TYPES` + `DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT` + UI copy — **and a migration**, because `ck_exercises_equipment` is built from that list (§12.5 fact 2) | enough kettlebell entries that `other` becomes misleading; explicitly declined under O-1 |
| An abductor, oblique or rotator-cuff leaf | an ADR-010 amendment of its own — the mechanism O-5 now precedents, but not the decision | a volume-screen need the 18 leaves cannot express |
| Jump height, throw distance, bound distance, sprint splits per attempt | a new profile or a per-attempt measured field | N-12 / N-13, athletic Release 4. C-22 records attempts only and introduces no distance field |
| Per-side facts on unilateral entries | a set-row shape change | N-11. The six unilateral entries here use O-12's existing round convention and add nothing |
| Grip / stance / tempo / pin height as structured metadata | a field on the exercise. `exercises.movement_pattern` exists on the row and in the create API, but `SeedCatalogExercise` has no member for it, so every seeded row is `movement_pattern = null`; adding it is a seeder change, not a catalog edit | a filtering or warm-up-mapping need — PI-003's exercise → warm-up item mapping is the likely first; O-3 is the immediate case that would benefit |
| Contribution weights other than 1.0 / 0.5 | a `weight` member on `SeedContribution` | evidence that the two-tier convention misleads |
| An RP-style landmark for `tibialis` | a source that has one | none exists; §12.2 |
| Progression strategies, landmarks or default schemes for any new entry | ADR-006 registration with its own evidence gate | N-3 |
| Profile-appropriate records | read-side design | N-4, after a block of logging |
| Conditioning modalities (rower, bike, rope) | a boundary decision about what belongs in the training log | a deliberate conditioning-logging pass |

---

## 15. Entries the reviewer should press hardest

Recorded so the independent review does not have to find them:

- **C-9 Dumbbell Chest-Supported Row** differs from `dumbbell-row` in laterality and trunk support alone, and its contributions are deliberately identical. It rests on criterion 3 only.
- **C-13 Dumbbell Reverse Lunge** is a third sagittal single-leg variant beside the Bulgarian split squat and the step-up, with contributions identical to both. Selected on programming judgement, not on a structural gap.
- **C-11 Barbell Rack Pull** rests on a single dropped contribution row — `barbell-deadlift`'s list minus `hamstrings` — exactly as C-14 does. Its case is criterion 5 (load scale, and the e1RM series it would corrupt), not the muscle map. Added here after review L-1 corrected the "promoted `lower_back`" rationale.
- **C-14 Barbell Hang Clean** is justified by a single dropped contribution row and a different starting position.
- **C-6's `unilateral` marking** deliberately diverges from the seeded, pre-O-12 `cable-woodchopper`. §9 states why and declines to change the seeded entry.
- **C-4's `chest` secondary** and **C-17's `glutes` secondary** are convention calls with no measurement behind them (§2).
- **C-8's declined `lats` secondary** keeps a zero-secondary leaf at zero; a consistency choice, not a claim that the lats are uninvolved.
- **§12.1's append-last position** for `tibialis` puts it after "Lower Back (Erectors)" on the volume screen. Defensible, but a deliberate choice with a visible consequence.
- **§12.5's no-migration conclusion** is the single most load-bearing claim in this document. It is checkable in four independent ways and is verified mechanically in §16.4; if `db:generate` emits a file, stop.

---

## 16. Implementation and acceptance — one release

### 16.1 Order of work

1. ~~Independent catalog review~~ — **done** (`exercise-catalog-expansion-review.md`, REVISION REQUIRED), and answered by this revision. Next is **targeted revision verification** of the §19 scope only; the manifest, literals, deduplication, placement and migration analysis were found sound and need not be re-derived.
2. **Implementation, one commit** (§16.3). No second authoring pass and no further owner decision: O-1…O-5 and D-CE1-1 are all accepted.
3. **Verification** (§16.4), **independent review of the implementation**, remediation and verification if the verdict requires it.
4. **Pre-deployment name-collision gate** (§16.6), then the **deployment checklist** (§16.7 — including the two mandatory D-CE1-1 controls) and device acceptance (§16.8).

### 16.2 Dependency order is not a release boundary

C-24 references `tibialis`, and `exercise_muscle_contributions.muscle_group_id` is an FK, so the vocabulary row must exist before the contribution is inserted. **`runSeed` already guarantees exactly that inside a single `db:seed`:** `seedMuscleGroups → seedVolumePresets → reconcileContributions → seedExerciseCatalogForAllUsers → reconcileStrengthEstimates → reconcileMeasurementProfiles` (`src/db/seed/index.ts`). The muscle group is upserted in step 1; the catalog inserts C-24 in step 4 of the same run. Nothing needs to be split across deploys, and the failure mode if the order were ever changed is a `23503` the exercise service deliberately leaves unmapped (`src/server/exercises/service.ts:428-431`) — loud, not silent.

The only cross-release concern is the rollout exposure of §12.6 — which does **not** warrant a second release, but **not because it is minor**. Its Window B is unbounded and its worst case is a silent, permanent wrong write; what makes one release the right answer is magnitude against ADR-010's two-stage case (one brand-new row, nothing reconciled, no exercise with history touched), plus the D-CE1-1 controls that remove the window operationally and make an escape detectable. That is an owner decision, recorded in §13 — not a property of the exposure. **Any characterisation of it as cosmetic or read-only is withdrawn** (§12.6). This is the distinction the reviewer should check: the vocabulary-before-catalog dependency is an ordering constraint inside one seed run, and it is *separately* true that the rollout hazard between two builds is real and is controlled rather than absent.

### 16.3 The commit

- `src/db/seed/exerciseCatalog.ts` — the §10 block, appended per §11.5, with the header comment shown.
- `src/domain/exercises/muscleGroups.ts` and `src/db/seed/volumePresets.ts` — the two O-5 edits of §12.3.
- `src/ui/exercises/ContributionEditor.tsx` and `src/ui/exercises/muscleGroupDisplay.ts` — the D-CE1-1(iii) hardening of §12.8.
- The five test files of §12.3, the catalog test sites of §11.6, and the six new controls NC-A…NC-F of §12.8.
- `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` (the §12.4 amendment) and the **five** other documents of §12.3 — domain-model, volume-model, data-model, implementation-plan (annotated) and evidence-to-design.
- **Not in this commit:** any migration, any file under `drizzle/`, any schema, sync, DTO, server-validation, progression, e1RM, volume, metrics or warm-up change, any deployment-workflow change, any new reconcile, any change to a seeded catalog entry, any other muscle group, any equipment value, and any UI change beyond the two files named above.

### 16.4 Verification, on the local Docker PostgreSQL — never production

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, unit suite, integration suite, and the `muscleTaxonomyV2` e2e spec.
- **The six §12.8 controls NC-A…NC-F**, including NC-D's requirement that `muscleTaxonomyV2.spec.ts:140-165` and `:195-225` pass unchanged.
- **`pnpm db:generate` produces no new migration file** — the §12.5 claim, checked rather than asserted. A generated file stops the implementation.
- On a clean database, `pnpm db:seed`:
  - `muscle_groups` holds **19** rows, exactly one `kind = 'rollup'` (`back`, position 19) and 18 `kind = 'muscle'`, with `tibialis` present as "Tibialis (Shin)" at position 18;
  - `volume_landmarks` holds **no** row for `tibialis` (extending the existing `NO_RP_ROW_LEAVES` assertion), and the RP General description names it among the landmark-less groups;
  - the catalog inserts 24 rows and, per slug, the stored `measurement_profile`, `load_basis` — `'assistance'` for `machine-assisted-dip`; `'per_hand'` for `dumbbell-farmers-hold`; `'total'` for `other-forward-sled-drag`, `other-sled-pull` and `other-med-ball-rotational-scoop-throw`; `'unspecified'` for the fifteen ordinary `load_reps` entries; **`NULL` for `bodyweight-dead-hang`, `bodyweight-wall-sit`, `bodyweight-lateral-bound` and `bodyweight-copenhagen-adduction-plank`** — and `volume_counting`, plus contribution weights 1.0 / 0.5;
  - `bodyweight-tibialis-raise` carries exactly one contribution, `tibialis` primary, weight 1.0, **and no `calves` row in either role**.
- A second immediate `db:seed` inserts and updates nothing **in the vocabulary row set and the catalog** — deliberately scoped, because the seed is upsert-based elsewhere (see the next item).
- **Existing-user path:** on a database already carrying the 103 slugs and the 18-row vocabulary, one `db:seed` inserts exactly the `tibialis` row, updates `back`'s position 18 → 19, and inserts exactly the 24 new exercises with their contributions. **Assert *value* equality, not statement counts** (review L-4): `seedMuscleGroups` (`src/db/seed/muscleGroups.ts:18-25`) re-upserts every vocabulary row on every run, and `seedVolumePresets` (`volumePresets.ts:158-179`) re-upserts all 52 landmark rows and touches `volume_presets.updated_at` on every deploy — that is pre-existing, correct behaviour and is not what this release must prove. What must be asserted is that **no existing exercise, contribution or landmark row's values change**, compared before and after; "touches no row" would either over-claim idempotence or fail a check that was never the point.
- **History and existing series unchanged:** no contribution row for any pre-existing exercise changes, so every muscle's weekly volume series is identical before and after — assert on at least one seeded exercise with contributions and one week of the aggregate.
- Deterministic-id stability across two runs for at least one new slug.
- One preservation witness on a new slug (edit it, reseed, assert the edit survives; hard-delete it, reseed, assert it is not resurrected), copying `seed.integration.test.ts:323` and `:343`.
- `reconcileMeasurementProfiles` and `reconcileStrengthEstimates` remain no-ops on the fresh database.

### 16.5 Display validation

- The volume screen lists 18 leaf rows plus the Back reconciliation line; **Tibialis (Shin) renders with no reference band and no invented range**, exactly as Lats, Upper Back, Adductors, Forearms and Lower Back (Erectors) already do.
- The exercise-create contribution picker offers 18 leaves, never `back`, and its add-row cap is 18 — the `muscleTaxonomyV2` spec, updated per §12.3.
- Tibialis Raise's exercise page shows "Tibialis (Shin)" as its only muscle, with no calf credit anywhere.

### 16.6 Pre-deployment gate

Production exercise-name collision check for **all 24 names**, read-only, by the method and boundaries of `athletic-measurement-profiles-release-3-predeployment-check.md`. A collision is resolved by changing the catalog *name*, never the slug.

### 16.7 Deployment checklist (D-CE1-1 controls, mandatory and ordered)

The pipeline is **unchanged**: `db:migrate → db:seed → Deploy to Azure App Service`, one workflow job (`.github/workflows/deploy.yml:105-123`). `db:migrate` is expected to apply nothing new. The steps below are not advisory — steps 3 and 5 are the two operational controls the owner accepted as D-CE1-1(i) and (ii), and they exist because **no code in this commit can protect a bundle that was installed before it** (§12.6).

1. **Merge and let the workflow run to completion.** Window A (old server, new data — §12.6) opens at the end of the seed step and closes when the App Service deployment step finishes. Do not use the app during it.
2. **Confirm the seed landed.** Read-only: 19 `muscle_groups` rows with `tibialis` present at position 18 and `back` at 19; 24 new exercise rows and 24 new ledger entries for the account.
3. **Force the client update on *every* client used with this account, before opening the Exercise Library or Tibialis Raise.** For each one: open the app, tap **"Update available — tap to refresh"**, then open the exercise-create form and confirm the contribution picker offers **"Tibialis (Shin)"**. Only when the picker shows it is that client out of Window B. **Enumerate the clients rather than assuming there is one** — a single-account app does not imply a single installed client, and each installed PWA or browser profile holds its own service worker and its own cached bundle. At minimum: the installed iPhone PWA, plus any desktop or laptop browser, any second browser profile, and any tablet the account has been signed into. A client that is not updated stays in Window B indefinitely (`skipWaiting: false`), whatever the other clients show.
4. **Only then** proceed to device acceptance (§16.8).
5. **Post-deployment read-only verification of the entry Window B is riskiest for.** After acceptance, confirm against production that `bodyweight-tibialis-raise` holds **exactly one contribution — `tibialis`, primary, weight 1.0 — and no `calves` row in either role**. Read-only, by the method and boundaries of the Release-3 pre-deployment check (`BEGIN TRANSACTION READ ONLY`, no writes, temporary firewall rule removed afterwards). This is the only step that would detect a substitution if one happened: nothing in the system distinguishes a wrong-muscle save from a deliberate edit, and no reconcile corrects it (§12.6).

If step 5 finds a `calves` row, the fix is a manual edit in the exercise form on an updated client — the data is not corrupt, only wrong — and the implementation report should record it, because it would mean step 3 was performed incompletely on some client.

### 16.8 Device acceptance on the iPhone

Performed **after** §16.7 step 3 has confirmed "Tibialis (Shin)" is selectable on that client. Covering each shape this release puts in front of the athlete for the first time:

- a `load_duration` prescription and set — `Dumbbell Farmer's Hold` is the **first catalog entry ever to use that profile** (RR-8), so the `durationRounds` prescription editor, the workout card, history and offline replay are all exercised live for the first time;
- a `duration` entry outside the plank family (`Dead Hang`);
- a `reps` athletic entry (`Lateral Bound`), confirming it does not appear on the weekly volume screen;
- the assistance refusal on `Assisted Dip`'s Strength page (`LOAD_BASIS_UNSUPPORTED`, not an estimate);
- a `unilateral` round on `Copenhagen Adduction Plank` and on `Medicine Ball Rotational Scoop Throw`;
- **`Tibialis Raise` logged as an ordinary set, its muscle reading "Tibialis (Shin)" (never blank), and the volume screen showing a Tibialis row with volume and no reference band.** Open its edit form and confirm the picker shows Tibialis (Shin) as *selected* — not "Select muscle…" — which is the direct visual check that this client is out of Window B;
- **`Hip Abduction Machine` is the entry that was picked**, not `Hip Adduction Machine` (review L-10): the two names differ by one letter in a scrolling phone list, the owner already owns the adduction entry, and the two credit opposite muscles (`glutes` vs `adductors`). Confirm the muscle shown, not just the name;
- the new entries visible and searchable in the library.

---

## 17. Residual risks

| Id | Risk | Disposition |
| --- | --- | --- |
| RR-1 | A proposed name collides with an exercise created in production since the Release-3 check → silent, permanent skip | §16.6, now covering 24 names rather than ten; the mechanism is correct and tested (`seed.integration.test.ts:455`) |
| RR-2 | C-11 / C-12 / C-14 produce e1RM series where an Epley extrapolation is weakly meaningful | Disclosed in §9; accepted under O-4, with the disable-only toggle one tap away and no new `'off'` precedent invented |
| RR-3 | The contribution lists are read as physiological claims | §2's framing, carried into every §9 rationale; §12.2 applies the same discipline to the new leaf |
| RR-4 | 24 entries plus a vocabulary change in one release is a larger single change than any previous catalog pass | Contained by the facts that nothing existing is modified, the ledger seeds each slug once, the vocabulary change is add-only with no reconciliation, and §11.6 / §12.3 enumerate every affected assertion. The review gate is the control |
| RR-5 | C-10 seeds with a 2.5 kg load step that suits no kettlebell ladder | Accepted under O-1; one edit in the exercise form after seeding |
| RR-6 | Catalog growth 103 → 127 lengthens the exercise list on the phone | The library has a search field (`ExerciseLibrary.tsx:55-57`) |
| RR-7 | A later batch reintroduces the placement or pre-v2-fixture drift | §11.5 and §11.6; the restated Release-3 assertion now pins the block's start index, detecting an insertion the old `slice(-10)` form would have missed |
| RR-8 | **`load_duration` reaches a real device for the first time** via C-18 — implemented and unit-tested since Release 2 but never exercised by a seeded exercise | §16.8's first acceptance item. No code change is proposed; if the path proves broken, that is a Release-2 defect this release surfaces rather than causes |
| RR-9 | C-17's `loadBasis: "total"` is dropped during implementation and silently seeds `'unspecified'` | Called out in §7, in the literal's own comment and in §16.4's per-slug assertion — M-1's finding, applied |
| RR-10 | **A stale client can persist a wrong muscle on Tibialis Raise, and the post-deploy server accepts it.** Its picker reads "Select muscle…" — indistinguishable from unset — and the nearest plausible option is `Calves`, the one muscle the amendment exists to keep off the entry. The window is **unbounded**: `skipWaiting: false` makes the update a deliberate tap, so it is not the length of a deploy | Rewritten in §12.6 against the review's trace. **Not** described as read-only or self-correcting: reads are safe and an *untouched* save round-trips `tibialis` correctly, but a *touched* save is a silent, permanent wrong write that no reconcile corrects. Controlled by D-CE1-1: §16.7 step 3 (force the update on every client and confirm the picker, before the entry is opened) removes the window; §16.7 step 5 (post-deploy read-only contribution check) makes an escape detectable; §12.8 hardens the picker for the next amendment. Bounded by the absence of any exercise sync entity — the wrong write cannot be queued offline or replayed (§12.6) |
| RR-11 | **Step 3 is performed on some clients and not others.** A single-account app does not imply a single installed client; each installed PWA and browser profile caches its own bundle and holds its own service worker | §16.7 step 3 requires enumerating every client used with the account rather than assuming the iPhone is the only one. §16.7 step 5 is the backstop that detects the consequence if one is missed |
| RR-12 | **The §12.8 hardening is mistaken for a fix for this release.** It is not: the vulnerable bundle predates the commit | Stated in §12.6 and §12.8 explicitly. Its value is forward — the next vocabulary addition, which ADR-010's add-only rule makes a matter of when |
| RR-13 | The `muscleTaxonomyV2` e2e spec hardcodes the vocabulary twice **and the add-row cap three times**, and is the likeliest missed edit | Named explicitly in §12.3 with every line site, after review L-7 found the third and fourth number sites the earlier version omitted |
| RR-14 | The §12.8 hardening generalises the rollup mechanism and silently changes rollup behaviour | NC-D pins the two existing rollup e2e specs as must-pass-unchanged; NC-E pins the "Unclassified " prefix to rollups only; NC-F pins server validation |

---

## 18. Verdict

All 21 first-draft candidates are selected, and the owner's six further requests resolve to **+3 new entries** (`Lateral Bound`, `Copenhagen Adduction Plank`, `Tibialis Raise`), **one rescoped candidate** (C-17 bound to the rotational scoop throw, renamed and re-slugged) and **two already represented** (`Broad Jump` and `Medicine Ball Overhead Slam`, seeded verbatim and untouched). The result is one release of **24 entries**, taking the catalog from 103 to 127, appended as a single contiguous block with no existing entry moved, edited or reordered.

**Six owner decisions are accepted and recorded in §13** — O-1…O-5 with the selection, and **D-CE1-1 separately**, after the independent review established that the rollout exposure had been recorded as accepted under O-5 when no owner had decided it. Nothing in this specification is pending.

O-5's vocabulary change is designed in full in §12: slug `tibialis`, display name "Tibialis (Shin)", `kind = 'muscle'`, position 18 with `back` moving to 19, no rollup membership, no RP landmark and no invented band. Its footprint is four source files (two for the leaf, two for D-CE1-1(iii)'s hardening), five test files plus six new controls, and six documents; every other consumer — the seed upsert, the Zod schemas and their length caps, the volume aggregate, the remaining UI consumers, the server and the sync stack — derives from the two domain constants and needs no edit, which was verified by sweeping every reference and independently reproduced by the review. **No database migration is required**, substantiated from four independent facts about the schema and the migration history — the review confirmed all four and added a fifth from the drizzle snapshot — then re-checked mechanically by a `db:generate` no-op in §16.4, with the explicit contrast that a kettlebell equipment value *would* need one because equipment feeds a CHECK and muscle slugs do not.

The single-release plan holds, and the rollout analysis behind it has been rewritten rather than defended. The vocabulary-before-catalog dependency is an ordering already enforced inside `runSeed`, not a release boundary. The exposure is **two windows, not one**: a short, loud old-server window bounded by the deployment step, and an **unbounded** stale-client window created by the deliberate `skipWaiting: false` policy. In the second, reads are safe and an untouched save round-trips correctly, but the picker reads as *unset* and invites a `calves` substitution the post-deploy server would accept silently and permanently. Nothing shipped in this commit can protect a bundle installed before it; the controls are therefore operational and mandatory (§16.7 steps 3 and 5, applied to **every** client used with the account), with the §12.8 hardening shipped as forward protection for the next amendment. "Read-only", "self-correcting" and "the length of one deploy" no longer appear as claims anywhere in this document — only in §12.6, §16.2, RR-10 and §19 as the withdrawals themselves. (§16.2 was the one site the first revision's sweep missed; it was found by the targeted verification as R-1 and corrected in the second pass — §19.1.)

Every entry is authored in full — exact metadata, movement definition, recording convention, leaf-only contributions with at least one primary, nearest existing entry and the criterion it satisfies — with final `SeedCatalogExercise` literals in §10 and an exact slug/name manifest in §6, all unchanged by this revision. The local name and slug check is clean at 24 of 24. Beyond O-5's bounded leaf and D-CE1-1(iii)'s bounded UI fallback, no schema, equipment vocabulary, measurement semantics, rollup, hierarchy, server-validation, pipeline, progression or calculation change is proposed; the accepted Athletic Measurement Profiles architecture is untouched, and the two sled entries added here are the declined readings that gate explicitly routed to new slugs.

Nothing was implemented, seeded, committed, pushed or deployed; no database was contacted; ADR-010 was not amended; no source file, test, backlog file, architecture document or existing independent report — the review included — was modified.

---

## 19. Revision log — finding to change

Against `docs/reviews/exercise-catalog-expansion-review.md` (2026-09-09, REVISION REQUIRED). **No entry's slug, name, equipment, mechanics, laterality, profile, basis, counting or contribution list changed in this revision**, and the §10 literals are unchanged except for C-11's and C-17's rationale prose, which the review corrected without touching their contributions. Each of the reviewer's own technical traces was re-verified against the source at `HEAD` before adoption; all were confirmed, including the two that contradicted this document.

| Finding | Change made | Where |
| --- | --- | --- |
| **H-1** — the wrong window analysed; failure mode wrong in both branches | §12.6 rewritten in full: two separate windows; Window A bounded by the deployment step; Window B **unbounded** by `skipWaiting: false` (`sw.ts:339-340`, `ServiceWorkerUpdater.tsx:50-59`); rendering corrected to **blank, never literal `undefined`** (`join` semantics); the write path corrected — untouched saves **preserve** `tibialis` because the payload is built from React state (`ExerciseForm.tsx:158-165`, `:184-186`), and the real hazard is an apparently-unset picker inviting a `calves` substitution the new server accepts; the offline/replay bound added (no `exercise` entity in `SYNC_ENTITIES`, direct `fetch` PATCH, nothing enqueueable) | §12.6 |
| **H-1** (2) | "read-only", "self-correcting" and "the length of one deploy" removed from §12.6, RR-10, §18, the §12.4 amendment's Rollout paragraph **and §16.2** (the last of these missed on the first pass and corrected in the second — see §19.1 R-1); read-path safety is now scoped explicitly to reads | §12.4, §12.6, §16.2, §17, §18 |
| **H-2** — RR-10 recorded as accepted with no owner decision | "accepted" struck from §12.6, RR-10 and §18; **D-CE1-1 added as a distinct accepted decision** in the header and §13, explicitly separated from O-1…O-5, with O-5's row narrowed to vocabulary-and-inclusion; the amendment's Rollout paragraph now **cites** D-CE1-1 instead of asserting acceptance, so ADR-010 cannot inherit an unowned claim | header, §12.4, §12.6, §13, §17, §18 |
| **M-1** — the remedy is operational; the genuine blocker was unstated | §12.6 now states plainly that the vulnerable artefact is the already-installed bundle and no code in this commit can reach it; "do not edit Tibialis Raise until the app update is applied" **withdrawn** as a mitigation; §16.7 rewritten as an ordered **deployment checklist** with the two controls as numbered mandatory steps — and step 3 extended beyond the review's own framing to **every client used with the account**, since one account does not imply one installed client (new RR-11) | §12.6, §16.7, §16.8, §17 |
| **M-2** — unknown-slug degradation; ~10-line fix belongs in this commit | New **§12.8** specifies the self-only unknown-slug option and the `?? slug` label fallback, with explicit non-goals (no new row offers, no rollup change, no broadened server acceptance) and six controls NC-A…NC-F covering the fallback, round-trip preservation and existing rollup behaviour; both files added to §12.3 and §16.3; the **Scope boundary** amended to name the exception | Scope boundary, §12.3, §12.7, §12.8, §16.3, §16.4, §17 |
| **M-3** — eligibility tally wrong | §7 corrected to **13 refused / 11 eligible**, with both lists enumerated and re-counted against `eligibility.ts:48-62` | §7 |
| **M-4** — documentation footprint incomplete | The unqualified "complete set" claim withdrawn; list extended from four to **six** documents — `implementation-plan.md:166/:177/:179/:185` **annotated** rather than rewritten (the `:95` precedent, preserving what those phases actually shipped) and `evidence-to-design.md:45` row 19 gaining one clause with **no new evidence row**; §12.4's supersession clause now enumerates all three ADR-010 sentences it supersedes, including `:140`'s "five leaves" → six, and records that the Rejected-alternatives "single deploy" entry is **not** superseded but decided around by D-CE1-1 | §12.3, §12.4 |
| **L-1** — "`lower_back` promoted" is false | Corrected: `barbell-deadlift` already carries `lower_back` **primary**, so C-11 is that list minus `hamstrings` and nothing else; C-11 added to §15 | §9 (C-11), §15 |
| **L-2** — "disjoint" is wrong | Corrected: C-17 and the slam share `abs` **and `front_delts`**; criterion 2 restated on the differing rows and the plane of motion | §9 (C-17) |
| **L-3** — literal-`undefined` unreachable | That branch removed; §12.6 states blank only, with the `join` reason | §12.6 |
| **L-4** — "touches no row" is loose | §16.4 rescoped to **value equality**, naming the two upserts (`muscleGroups.ts:18-25`, `volumePresets.ts:158-179`) that legitimately rewrite rows every run; the second-seed assertion kept scoped to the vocabulary row set and catalog | §16.4 |
| **L-5** — R-10a applied in opposite directions | One paragraph added distinguishing intrinsic alternation (C-22, one set spans both sides) from interleaved rounds of a one-sided movement (C-17) | §9 (C-22) |
| **L-6** — `adductorSlugs` doubles as an order guard | The assertion is now **order-insensitive** (set or sorted comparison plus length); block order left to the dedicated contiguity test | §11.6 |
| **L-7** — e2e edit under-specified | All three cap sites named (`:36` title, `:88-90` comment; 17→18, 16→17, 18→19), and `:66`'s `not.toContain("Back")` marked retain-verbatim; the two rollup specs added as must-pass-unchanged | §12.3 |
| **L-8** — four title/comment sites omitted | `tests/unit/muscleGroups.test.ts:15`, `:37`, `:52` (14 → 15 pre-existing leaves), `:69` added | §12.3 |
| **L-9** — display sections read as a constraint | One paragraph in §12.1: nothing implements sections — both consumers iterate `LEAF_MUSCLE_GROUPS` in array order — so append-last is consistent with the code, and `tibialis` would belong to Legs if sections were ever built | §12.1 |
| **L-10** — abduction/adduction one-letter confusion | Device-acceptance item added: confirm the **muscle** shown, not just the name | §16.8 |

Re-review scope: the header, §0, §7, §9 (C-11, C-17, C-22 only), §11.6, §12.1, §12.3, §12.4, §12.6, §12.7, §12.8, §13, §15, §16.1, §16.2, §16.3, §16.4, §16.7, §16.8, §17 and §18. **§6's manifest, §10's literals, §8's deduplication, §11.5's placement plan and §12.5's migration analysis are unchanged** and were found sound by the review.

### 19.1 Second revision — against the targeted verification

Against `docs/reviews/exercise-catalog-expansion-revision-verification.md` (2026-09-09, REVISION REQUIRED — narrowly; sixteen of seventeen items closed, three residuals). That document is not modified by this pass. All three residuals were re-verified against the source before correction; all three were confirmed. **No catalog content is touched by this pass** — the manifest, the literals, the shapes, the controls and the ADR amendment draft are all unchanged.

| Residual | Change made | Where |
| --- | --- | --- |
| **R-1** — §16.2 still justified the single release by calling the exposure "cosmetic and read-only", the one surviving instance of the language H-1(2) required withdrawn, contradicting §12.6, RR-10 and §18's own completeness claim | The paragraph's **conclusion is unchanged** (one release is still right) but its **justification is replaced**: magnitude against ADR-010's two-stage case plus the D-CE1-1 controls, with the cosmetic/read-only characterisation explicitly withdrawn in place. §19's H-1(2) row and the re-review scope above now include §16.2, so the sweep's boundary is recorded rather than implied. The verifier's point that a false self-audit is worse than none is accepted: §18's completeness claim is now true | §16.2, §19 |
| **R-2** — §0's verdict row was stale | Aligned with §19's closing marker | §0 |
| **R-3** — §12.3's `:52` sub-instruction ("→ 15") was wrong and conflicted with the `:69` note in the same cell | Withdrawn. Verified against `tests/unit/muscleGroups.test.ts:52-67`: that test asserts the **fourteen** display names pre-dating ADR-010, and `tibialis` is not among them, so the count of pre-existing leaves does not change and the title is now marked **leave verbatim**. The `tibialis` display-name assertion is directed to the `:69` group, resolving the conflict. This was an error introduced by the L-8 fix, not a pre-existing one | §12.3 |

The verifier's three §6 observations need no change and are recorded as read: the ±1 line-range drift weakens nothing (NC-D pins whole specs, and every content-named anchor is exact); §12.8 item 1's "replace the rollup-only special case" is already guarded by the sentence that follows it and by NC-D/NC-E, and the implementation report should confirm the amber "Unclassified Back" note survived; §12.1's "the reviewer should confirm the choice" is now a historical sentence and harmless.

READY FOR TARGETED CATALOG REVISION VERIFICATION
