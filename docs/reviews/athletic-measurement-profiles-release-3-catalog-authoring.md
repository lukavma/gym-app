# Athletic measurement profiles — Release 3 authored catalog specification (O-10(ii) gate)

Date: 2026-09-08 (revised the same day against the independent review)
Status: **Revised — all ten entries settled; awaiting targeted revision verification.** Nothing is implemented or seeded by this document.
Repository state: branch `main`, `HEAD = 4865a02` ("feat: add athletic measurement profiles release 2"), working tree carrying the pre-existing uncommitted changes listed in §1.2, none of which this document touches.

Binding upstream: `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §16, §21.3, §24.3, and owner decisions O-4(i)/(ii), O-10(i), O-10(ii), O-12; `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md`.
Review answered: `docs/reviews/athletic-measurement-profiles-release-3-catalog-review.md` (verdict **REVISION REQUIRED**; B-1, M-1, M-2, L-1…L-8). That document is not modified by this revision; the finding-to-change map is §11.

**D-R3-1 is closed.** The owner accepted option **(a)** on 2026-09-08: `other-sled-drag` is the **backward** drag, named "Backward Sled Drag", with the backward-drag definition and contributions exactly as authored in §4.2. It is no longer pending, and B-1 is discharged. The other nine entry definitions are unchanged by this revision — the review approved them as written, and nothing below alters a name, a profile, a basis, a counting value, or a contribution row of any entry.

---

## 0. Purpose and standing

O-10(i) adopted ten Release-3 slugs and their measurement shapes; **their muscle contributions were deliberately not approved there.** O-10(ii) (accepted 2026-09-07) defers them to "a Release-3 gate that approves the authored, leaf-only list before any of the ten is seeded" (evaluation §16, §21.3, §22 O-10(ii)).

This document is the authored list that gate reviews. It supplies, for each of the ten adopted slugs: exact metadata, exact leaf-only contributions with roles, the movement definition the assignment is bound to, and the rationale — plus proposed `SeedCatalogExercise` object literals and an implementation/acceptance checklist for the release that will land them.

It has been through one independent review (verdict REVISION REQUIRED) and this revision. The ten entries were verified mechanically by that review and are unchanged; what changed is the sled-drag decision status (accepted, §7), two binding documentation defects in the authoring rules and checklist (M-1, M-2), and eight LOW clarifications. §11 maps each finding to its change.

Release 2 passed independent remediation verification (`docs/reviews/athletic-measurement-profiles-release-2-remediation-verification.md`), the deployed build reached the owner's iPhone, the owner reports it looks good, and the owner authorises proceeding to Release 3. **This is an owner authorisation to proceed, not an exhaustive A-25 acceptance-checklist run**; no per-item A-25 evidence is claimed here, and none was collected for this document.

### 0.1 Explicitly out of scope

No schema change, no migration, no sync-contract change, no UI change, no progression or e1RM change, nothing from Release 4 (evaluation §21.4). The accepted architecture is not reopened: the ten slugs, their profiles, their load bases and their `volumeCounting` values are taken verbatim from O-10(i) and are not re-argued below. No progression heuristic, landmark or default scheme is designed for any entry (N-3). No entry is implemented, seeded or committed by this document; no database was contacted.

---

## 1. Inputs and repository state

### 1.1 Read for this specification

| Source | What it fixed |
| --- | --- |
| `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §16 | minimum metadata per entry; the `volumeCounting` authoring rule; the ten adopted slugs and shapes; `strengthEstimate` omitted |
| — §7.1, §7.2, §7.3 | `load_basis` semantics (`total` / `per_hand`), the O-12 one-row-per-set unilateral convention, the jumps-are-`reps` rule |
| — §14.4 (R3 row), §21.3, §24.3, A-14, A-17 | clean-database seeding path, release contents, the Release-3 documentation amendment, the two catalog assertions |
| `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md` | leaf-only contributions for all new rows; the seeded-catalog leaf convention; no new group, rollup or hierarchy without amending the ADR |
| `src/domain/exercises/muscleGroups.ts:13-31` | the 17-leaf vocabulary this document may draw from; `back` is a rollup (`:33`) and is unavailable |
| `src/domain/exercises/schema.ts:86-89` | `DEFAULT_CONTRIBUTION_WEIGHT` — primary `1`, secondary `0.5`, applied by the seeder, never authored per entry |
| `src/domain/measurement/profile.ts:113-126` | `LOAD_BASIS_REQUIRED` / `loadBasisRequired` — which profiles have a load field at all (R-6, M-1) |
| `src/db/seed/exerciseCatalog.ts:15-51` | the exact `SeedCatalogExercise` type these literals must match |
| — `:470-484`, `:660-677`, `:1008-1033` | the two shape precedents (`bodyweight-plank`, `dumbbell-farmers-carry`) and the `// Other` section the new entries extend |
| `src/db/seed/exercises.ts:105-122`, `:140-161` | how omitted fields resolve, arbiter-less conflict handling, contributions only for genuinely inserted rows |
| — `:49-57` (the rule) / `:58` (`seedExerciseCatalogForUser`), `:110`, `:180-182` (`seededExerciseId`) | the ledger skip, the inline deterministic-id derivation, and the exported id helper |
| `src/domain/strength/eligibility.ts:48-62`, `src/domain/strength/constants.ts:137` | why omitting `strengthEstimate` is safe for all ten (§6) |
| `tests/unit/exerciseCatalog.test.ts`, `tests/integration/seed.integration.test.ts`, `tests/integration/reconcileContributions.integration.test.ts` | the existing assertions Release 3 must extend rather than break (§8) |

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

At the revision pass the tree additionally carried this document and the independent review, both untracked; the list above is otherwise unchanged.

This document adds exactly one new untracked file, `docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md`, and the revision edits only that file. No other file — report (the independent review included), source, test or configuration — is modified. Nothing is committed, pushed or deployed.

---

## 2. Authoring rules applied

These are the constraints every entry below satisfies; the review gate can check each entry against this list mechanically.

- **R-1 Vocabulary.** Contributions target only the 17 leaves of `LEAF_MUSCLE_GROUP_SLUGS` (`muscleGroups.ts:13-31`). No `back`, no invented group. ADR-010: a rollup slug can never be a *seeded* contribution, and any new group re-opens the ADR.
- **R-2 At least one primary.** Every entry carries ≥ 1 `primary` row (domain invariant, `schema.ts` `contributionsListSchemaFor`; asserted by `tests/unit/exerciseCatalog.test.ts:43`).
- **R-3 No duplicate muscle within an entry.** One row per (exercise, muscle).
- **R-4 Default weights only.** `SeedContribution` has no `weight` field; the seeder applies `DEFAULT_CONTRIBUTION_WEIGHT` (primary `1`, secondary `0.5`, `exercises.ts:155`). No custom weight is proposed, and none can be expressed in the catalog type.
- **R-5 Explicit `volumeCounting`.** All ten state `volumeCounting: "off"` explicitly, per §16's authoring rule (required by rule, not by type). For the **nine** non-`load_reps` entries — the four `load_distance` and the five with no load field — this equals the value the seeder would resolve anyway (`exercises.ts:107-108`), so it is written to make the fact reviewable in the catalog, not to change behaviour. For `other-med-ball-slam`, the one `load_reps` entry, it is load-bearing: the seeder's default there is `'auto'`, and the explicit `'off'` is what keeps slams out of hypertrophy volume — O-4(i)'s originating PI-005 example.
- **R-6 `loadBasis` iff the profile has a load field — a five/five split, not four/six.** `loadBasisRequired` is true for `load_reps`, `load_distance` and `load_duration` alike (`profile.ts:113-126`), so **five** of the ten carry a load field: the four `load_distance` entries **and `other-med-ball-slam` (`load_reps`, `loadBasis: "total"`)**. `loadBasis` is stated explicitly on all five. It is omitted on the **five** with no load field — `bodyweight-sprint` and `bodyweight-shuttle-run` (`distance_time`), `bodyweight-broad-jump` and `bodyweight-box-jump` (`reps`), `bodyweight-side-plank` (`duration`) — where it resolves to `null` and any explicit value would violate `ck_exercises_load_basis_presence` (the `bodyweight-plank` precedent, `exerciseCatalog.ts:475-478`).

  Omitting it on the slam would **not** raise an error: `resolveLoadBasis` (`schema.ts:72-77`) would resolve `'unspecified'`, which satisfies the CHECK while silently contradicting O-10(i)'s `total`, and the ledger would make that permanent for the user. §8.1 states the rule in the corrected form for exactly this reason.
- **R-7 `strengthEstimate` omitted** for all ten (§16: "the structural gate decides"). Verified safe in §6.
- **R-8 No `loadStepKg`.** Unchanged: derived by equipment (`DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT`).
- **R-9 Naming convention followed.** Existing catalog names carry an equipment prefix only for `barbell` / `dumbbell` / `cable` / `machine` entries; `bodyweight` and `other` entries are named plainly ("Plank", "Trap Bar Deadlift", "Landmine Press", "Walking Lunge"). No existing name uses parentheses, and the proposed names collide with no existing name case-insensitively (checked against all 93 current entries).
- **R-10 `laterality` written only when `unilateral`.** All 93 existing entries omit it for bilateral movements and the seeder defaults it (`exercises.ts:115`). The tables in §4 state the value for every entry regardless; the literals in §5 omit `bilateral` to match the file's convention.
- **R-10a Why the four alternating-gait entries are `bilateral`.** §16 fixes `unilateral` only for `dumbbell-suitcase-carry` and `bodyweight-side-plank`; the sled push, the sled drag, the sprint and the shuttle run are authored here, and all four load one leg at a time — the very property that made walking lunges `unilateral` under the L-9 precedent (`tests/unit/exerciseCatalog.test.ts:56-66`: they "load one leg at a time like the catalog's other single-leg variants"). They are nonetheless `bilateral`, because `laterality` in this app is not a claim about gait. Under O-12 (§7.2) `unilateral` carries a *recording* consequence: one set row holds **one side's** work, with both sides performed, and the athlete repeats the set for the other side. That is coherent for a lunge, a suitcase carry or a side plank, each of which is genuinely performed as a left round and a right round. A sprint or a sled push has no left round and no right round — one attempt is one whole set that uses both legs in alternation, so a "per-side" reading of its distance or time would be meaningless. Marking them `unilateral` would therefore invite a recording convention the movement cannot support. **No per-side rule is introduced for any of the ten**: O-12's whole-set/round semantics are used exactly as written, and the two `unilateral` entries follow it unchanged.
- **R-11 Contribution lists stay bounded.** Three to five rows per entry, matching the existing catalog's density. A carry does not accumulate a row for every muscle under isometric tension; a jump does not list the whole leg.

---

## 3. What the contributions do and do not claim

**This is a catalog convention, not a measurement.** Each list below answers one practical question — *when this exercise appears on the volume screen or in the library, which muscles should it be credited to, and at full or half weight?* — under the app's existing labelled heuristic (primary `1.0` / secondary `0.5`, EVIDENCE-004, `schema.ts:84-89`). It is not a claim about EMG amplitude, time under tension, hypertrophic stimulus, force contribution or injury prevention, and no such claim should be read into a `primary` label.

Three consequences the reviewer should hold the entries to:

1. **Consistency beats precision.** Where a movement resembles one already in the catalog, the entry mirrors the existing convention rather than inventing a better one (this is why `other-farmers-carry` matches `dumbbell-farmers-carry` exactly — §4.3).
2. **The role split is coarse by design.** `primary` means "this exercise is a reasonable way to credit work to this muscle"; `secondary` means "meaningfully involved, at half credit". There is no third tier, and the entries do not try to smuggle one in via long secondary lists.
3. **Seven of the ten cannot reach the volume screen at all.** `load_distance`, `distance_time` and `duration` sets are excluded by profile before contributions are consulted (evaluation §11.2). For those entries the contributions are effectively *library metadata* — what the athlete sees on the exercise page and filters by — not an aggregation input. They still must be right, but nothing numeric depends on them today. Only `other-med-ball-slam`, `bodyweight-broad-jump` and `bodyweight-box-jump` sit on volume-capable profiles, and all three are switched `off`.

---

## 4. The ten entries

Contribution notation: **P** = primary, **S** = secondary.

### 4.1 `other-sled-push`

| Field | Value |
| --- | --- |
| name | `Sled Push` |
| equipment | `other` |
| mechanics | `compound` |
| laterality | `bilateral` (omitted in the literal, R-10) |
| measurementProfile | `load_distance` |
| loadBasis | `total` |
| volumeCounting | `off` |

**Movement definition.** A loaded sled driven forward over ground with both hands fixed on high or low handles, torso inclined, alternating leg drive; the arms hold position and do not press. One set is one push over a recorded distance under a recorded sled load; time is optional (`load_distance` allows `duration`, evaluation §6.2). Handle height (high vs low) is not distinguished by the entry.

**Contributions.** `quads` P, `glutes` P, `hamstrings` S, `calves` S, `abs` S.

**Rationale.** The push is a repeated concentric leg drive, so the catalog credits knee extension and hip extension at full weight, exactly as it does for `barbell-back-squat` and `bodyweight-walking-lunge`. `hamstrings` and `calves` take half credit for their role in hip extension and ankle plantarflexion at push-off — the same secondary treatment the squat entry already uses for `hamstrings`. `abs` takes half credit for the braced torso. The shoulders and triceps are deliberately absent: they hold a fixed position rather than produce the movement, and adding them would make every carry- and sled-family entry accumulate upper-body rows the convention does not credit elsewhere.

**On trunk bracing, deliberately bounded (applies to §4.1, §4.2 and §4.4).** `barbell-back-squat` credits bracing as *both* `abs` and `lower_back` secondary; the two sled entries take `abs` only, while `dumbbell-suitcase-carry` takes `lower_back` as well. This is a deliberate split, not an inconsistency: the erector row is carried only where resisting spinal flexion or lateral flexion **is** a defining demand of the movement — under a loaded bar, or against an asymmetric hanging load — and not where the trunk simply stays rigid while the legs work. Extending the squat's full bracing pair to every athletic entry would give `lower_back` a half-credit row on most of the ten and quietly inflate a leaf that the volume screen reports without an RP reference band (ADR-010). Under R-11 the convention prefers the narrower assignment, so the sled family carries `abs` alone. **No contribution row is added or removed by this note** — the approved muscle lists of all ten entries stand exactly as reviewed; this records the reasoning the review asked for.

### 4.2 `other-sled-drag` — **direction accepted: backward (D-R3-1 (a), owner-accepted 2026-09-08)**

| Field | Value |
| --- | --- |
| name | `Backward Sled Drag` |
| equipment | `other` |
| mechanics | `compound` |
| laterality | `bilateral` |
| measurementProfile | `load_distance` |
| loadBasis | `total` |
| volumeCounting | `off` |

**Movement definition (accepted, binding for the entry).** The athlete faces the sled, holds two straps or handles with near-extended arms and an upright torso, and walks **backward**, driving through the front foot so the working leg extends the knee against the load. The arms transmit load and do not pull; there is no hand-over-hand action and no waist harness. One set is one drag over a recorded distance under a recorded sled load.

**Contributions.** `quads` P, `glutes` S, `calves` S, `abs` S, `forearms` S.

**Rationale.** Bounding the entry to the backward drag is what makes it non-redundant next to `other-sled-push`. The catalog's convention for the backward drag credits it as knee-extension led, with the hip taking less of the work than in a forward drive: `quads` alone is primary and `glutes` drops to half credit — the inverse emphasis of the push. `forearms` takes half credit because the straps are held for the whole distance, the same grip convention `dumbbell-farmers-carry` already uses (there at full credit, because grip *is* the carry). `abs` covers the braced torso against a horizontal pull, bounded to `abs` alone per §4.1's trunk-bracing note. **This is the catalog's convention for the movement, adopted so the drag and the push read differently in the library — not a measured claim about how the two variants distribute load** (§3, and the same hedge §4.5 and §4.6 carry). The two other common readings of "sled drag" — a forward harness drag and a hand-over-hand drag — assign differently and are deliberately **not** covered by this entry; §7 records the decision and the alternatives that were declined.

### 4.3 `other-farmers-carry`

| Field | Value |
| --- | --- |
| name | `Farmer's Carry` |
| equipment | `other` |
| mechanics | `compound` |
| laterality | `bilateral` |
| measurementProfile | `load_distance` |
| loadBasis | `per_hand` |
| volumeCounting | `off` |

**Movement definition.** A loaded carry with one implement in each hand — farmer's handles, a trap bar, or any non-dumbbell implement — carried at the sides with an upright torso over a recorded distance. `per_hand` records the load on **one** implement, both loaded (evaluation §7.1).

**Contributions.** `forearms` P, `traps` S, `abs` S.

**Rationale, and why it is identical to `dumbbell-farmers-carry`.** This is deliberately the *same list, in the same roles*, as the legacy `dumbbell-farmers-carry` entry (`exerciseCatalog.ts:672-676`). The two entries are the same movement performed with a different implement; they are kept distinct — as O-10(i) requires — because equipment, achievable load scale, and therefore the athlete's history series differ, **not** because the muscles credited differ. Assigning them different contributions would create two conflicting conventions for one movement pattern and would make the library read depend on which implement was to hand. `forearms` stays primary because grip is the limiting demand of a carry; `traps` and `abs` take half credit for shoulder-girdle support and trunk bracing. The distinction between the two entries is therefore preserved exactly where the evaluation places it — slug, name, equipment — and nowhere else.

### 4.4 `dumbbell-suitcase-carry`

| Field | Value |
| --- | --- |
| name | `Dumbbell Suitcase Carry` |
| equipment | `dumbbell` |
| mechanics | `compound` |
| laterality | **`unilateral`** |
| measurementProfile | `load_distance` |
| loadBasis | `per_hand` |
| volumeCounting | `off` |

**Movement definition.** A carry with a single dumbbell in one hand, held at the side, torso kept upright and square against the resulting lateral pull, over a recorded distance. Per O-12 and evaluation §7.2, **one set row records one side's distance with both sides performed** — the entry does not model sides separately, and `per_hand` here means the load in the single working hand.

**Contributions.** `abs` P, `forearms` P, `traps` S, `lower_back` S.

**Rationale.** The suitcase carry differs from the bilateral carry in exactly one respect the convention should reflect: the load is asymmetric, so resisting lateral trunk flexion is the defining demand rather than an incidental one. `abs` is therefore promoted to primary here where the bilateral carry credits it at half — that promotion is the entire reason this entry earns a place beside `other-farmers-carry`. `forearms` stays primary for the same grip reason. `traps` keeps half credit for the loaded-side shoulder girdle, and `lower_back` takes half credit for the erector work the bilateral carry does not demand. `lower_back` is the vocabulary's erector bucket ("Lower Back (Erectors)", ADR-010) and `abs` is its whole-trunk bucket; no oblique or quadratus leaf exists, and introducing one would re-open ADR-010 and is not proposed.

### 4.5 `bodyweight-sprint`

| Field | Value |
| --- | --- |
| name | `Sprint` |
| equipment | `bodyweight` |
| mechanics | `compound` |
| laterality | `bilateral` |
| measurementProfile | `distance_time` |
| loadBasis | — (no load field, R-6) |
| volumeCounting | `off` |

**Movement definition.** A maximal-effort linear run over a recorded distance, recorded with its elapsed time; both distance and time are required by the profile (evaluation §6.2), which is what makes an untimed sprint not an attempt (X-18). The entry covers flat unresisted running and does not distinguish acceleration from top-speed work, nor sled- or hill-resisted variants.

**Contributions.** `hamstrings` P, `glutes` P, `quads` S, `calves` S, `abs` S.

**Rationale.** At speed the stride is hip-extension dominant, so the catalog credits `glutes` and `hamstrings` at full weight and drops `quads` to half — the deliberate inverse of the jump and shuttle entries below, which are built around repeated knee-extension efforts from low speed. `calves` takes half credit for ground contact, `abs` for trunk rigidity at stride frequency. This split is a coaching convention adopted for internal consistency across the four running and jumping entries; it is not offered as a measured partition of sprint mechanics.

### 4.6 `bodyweight-shuttle-run`

| Field | Value |
| --- | --- |
| name | `Shuttle Run` |
| equipment | `bodyweight` |
| mechanics | `compound` |
| laterality | `bilateral` |
| measurementProfile | `distance_time` |
| loadBasis | — |
| volumeCounting | `off` |

**Movement definition.** A run over a recorded **total** distance including one or more changes of direction (e.g. 4 × 10 m), recorded with its elapsed time. The distance logged is the total covered, not the shuttle length; the entry does not model the number or angle of turns.

**Contributions.** `quads` P, `glutes` P, `hamstrings` S, `calves` S, `adductors` S.

**Rationale.** A shuttle is dominated by deceleration and re-acceleration from low speed rather than by top-speed stride, so knee extension joins hip extension at full credit — the distinction from `bodyweight-sprint` above. `adductors` takes half credit for the lateral plant and push-off at each turn; this is the only entry in the ten to credit `adductors`, and it gives the leaf a second catalog home besides `machine-hip-adduction` — which is why it is also the one entry that breaks a currently-passing unit assertion (§8.2, the `:131-140` item). `hamstrings` and `calves` take half credit for braking and ground contact. As with the sprint, this is a convention chosen so the two running entries read differently in the library, not a measured claim about change-of-direction mechanics.

### 4.7 `other-med-ball-slam`

| Field | Value |
| --- | --- |
| name | `Medicine Ball Slam` |
| equipment | `other` |
| mechanics | `compound` |
| laterality | `bilateral` |
| measurementProfile | `load_reps` |
| loadBasis | `total` |
| volumeCounting | **`off`** (load-bearing here — R-5) |

**Movement definition.** A medicine ball raised overhead with both hands and thrown down to the floor with a combined trunk-flexion and shoulder-extension action, caught or re-picked between repetitions. One set is a recorded number of slams at a recorded ball mass (`total`). RIR is optional on `load_reps` and is expected to be left blank.

**Contributions.** `abs` P, `lats` P, `front_delts` S, `triceps` S.

**Rationale.** The downward action is trunk flexion plus shoulder extension, so `abs` and `lats` carry full credit; `lats` is a leaf under ADR-010 and is the correct target for a shoulder-extension arc (the ADR's own rule: "vertical pulls and shoulder-extension arcs → `lats`"), so no rollup row is involved. `front_delts` takes half credit for the overhead reach and `triceps` for the elbow position through the throw. **`volumeCounting: "off"` is the point of this entry**: it is the only one of the ten on a volume-capable profile with a genuinely rep-like set, and PI-005's originating complaint is precisely that ten slams should not read as ten hypertrophy sets of abs and lats. The switch, not the contributions, is what enforces that (evaluation §11.4, O-4(i)).

### 4.8 `bodyweight-broad-jump`

| Field | Value |
| --- | --- |
| name | `Broad Jump` |
| equipment | `bodyweight` |
| mechanics | `compound` |
| laterality | `bilateral` |
| measurementProfile | `reps` |
| loadBasis | — |
| volumeCounting | **`off`** (load-bearing — R-5) |

**Movement definition.** A maximal two-footed horizontal jump for distance, landing on both feet, reset between repetitions. The profile records **attempts**, not the distance jumped: per O-10(i) this is a `reps` entry, so jump distance is not a stored field in v1 (a distance-per-attempt record is Release-4 territory, N-3 / §21.4).

**Contributions.** `glutes` P, `quads` P, `hamstrings` S, `calves` S.

**Rationale.** A horizontal jump is a combined hip- and knee-extension effort, credited at full weight to both, with `hamstrings` at half credit for the horizontal hip-extension component that distinguishes it from the vertical jump below, and `calves` at half credit for plantarflexion at take-off. `volumeCounting: "off"` is what stops five maximal jumps from reading as five sets of quads — O-4(ii)'s accepted "athletic attempts excluded by default" rule made concrete for a seeded slug.

### 4.9 `bodyweight-box-jump`

| Field | Value |
| --- | --- |
| name | `Box Jump` |
| equipment | `bodyweight` |
| mechanics | `compound` |
| laterality | `bilateral` |
| measurementProfile | `reps` |
| loadBasis | — |
| volumeCounting | **`off`** (load-bearing — R-5) |

**Movement definition.** A two-footed jump onto a raised box, landing on both feet, stepping down and resetting between repetitions. Box height is not a stored field; the profile records attempts.

**Contributions.** `quads` P, `glutes` P, `calves` S.

**Rationale.** The vertical jump is credited to knee and hip extension at full weight and plantarflexion at half. It deliberately carries **no** `hamstrings` row, which is the single-row difference from `bodyweight-broad-jump` and encodes the catalog's convention that the horizontal jump asks more of hip extension through range. A three-row list is well within existing catalog density (`bodyweight-calf-raise` has one). This entry is A-14's and A-17's named R3 witness: the seeded row must carry `volume_counting = 'off'`.

### 4.10 `bodyweight-side-plank`

| Field | Value |
| --- | --- |
| name | `Side Plank` |
| equipment | `bodyweight` |
| mechanics | **`isolation`** |
| laterality | **`unilateral`** |
| measurementProfile | `duration` |
| loadBasis | — |
| volumeCounting | `off` |

**Movement definition.** An isometric hold on one forearm and the side of the foot (or knee), hips lifted, body in a straight line, held for a recorded time. Per O-12 and §7.2, **one set row records one side's hold time with both sides performed**; the entry does not model sides separately. Elevated, weighted and hip-dip variants are not distinguished.

**Contributions.** `abs` P, `lower_back` S, `glutes` S.

**Rationale.** This mirrors the seeded `Plank` (`abs` primary, `lower_back` secondary, `exerciseCatalog.ts:480-483`) — same family, same convention, `isolation` mechanics like its bilateral counterpart — and adds `glutes` at half credit for the hip-abduction and hip-position demand the lateral hold introduces and the front plank does not. As with the front plank, `duration` carries no load field, so `loadBasis` is omitted and resolves to `null`.

### 4.11 Summary

| Slug | Name | Equip. | Mech. | Lat. | Profile | Basis | Vol. | Contributions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `other-sled-push` | Sled Push | other | compound | bilateral | `load_distance` | `total` | `off` | quads P, glutes P, hamstrings S, calves S, abs S |
| `other-sled-drag` | Backward Sled Drag | other | compound | bilateral | `load_distance` | `total` | `off` | quads P, glutes S, calves S, abs S, forearms S |
| `other-farmers-carry` | Farmer's Carry | other | compound | bilateral | `load_distance` | `per_hand` | `off` | forearms P, traps S, abs S |
| `dumbbell-suitcase-carry` | Dumbbell Suitcase Carry | dumbbell | compound | **unilateral** | `load_distance` | `per_hand` | `off` | abs P, forearms P, traps S, lower_back S |
| `bodyweight-sprint` | Sprint | bodyweight | compound | bilateral | `distance_time` | — | `off` | hamstrings P, glutes P, quads S, calves S, abs S |
| `bodyweight-shuttle-run` | Shuttle Run | bodyweight | compound | bilateral | `distance_time` | — | `off` | quads P, glutes P, hamstrings S, calves S, adductors S |
| `other-med-ball-slam` | Medicine Ball Slam | other | compound | bilateral | `load_reps` | `total` | `off` | abs P, lats P, front_delts S, triceps S |
| `bodyweight-broad-jump` | Broad Jump | bodyweight | compound | bilateral | `reps` | — | `off` | glutes P, quads P, hamstrings S, calves S |
| `bodyweight-box-jump` | Box Jump | bodyweight | compound | bilateral | `reps` | — | `off` | quads P, glutes P, calves S |
| `bodyweight-side-plank` | Side Plank | bodyweight | **isolation** | **unilateral** | `duration` | — | `off` | abs P, lower_back S, glutes S |

Every profile / basis / counting cell above is O-10(i) verbatim. No new leaf is introduced by the ten; `adductors` gains its second catalog entry.

---

## 5. Proposed `SeedCatalogExercise` object literals

Matching `src/db/seed/exerciseCatalog.ts:15-51` exactly. `strengthEstimate` is omitted throughout (R-7, §6); `laterality` is written only where `unilateral` (R-10, R-10a); no `loadStepKg` and no contribution `weight` appear, because neither is expressible in this type.

**Placement is a constraint, not a preference: the block must be appended after the entire existing catalog.** `tests/integration/reconcileContributions.integration.test.ts:28` derives `ORIGINAL_40_SLUGS = EXERCISE_CATALOG.slice(0, 40)` — a positional window over the array, resting on the file's existing order (its comment notes the "Phase 5.5 Light — 52 additions" marker sits after exactly 40 entries). Filing the ten under their existing equipment groupings would shift entries across that boundary and break the pre-v2 scenario assertions at `:194-195` (`updated === 7`, `noop === 7`) for reasons wholly unrelated to this change. Appending the ten as one trailing `// Athletic (Release 3)` block is therefore the only safe placement — and it happens also to be the most readable one, keeping the ten together and the §16 authoring rule visible where it applies. §8.1 carries this as a checklist item.

```ts
  // Athletic (Release 3) — athletic-measurement-profiles-architecture-evaluation.md
  // §16, O-10(i) (slugs and shapes) and O-10(ii) (contributions, approved at
  // the Release-3 authored-list gate:
  // docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md).
  //
  // Authoring rule for every entry in this block: explicit `measurementProfile`,
  // explicit `loadBasis` iff the profile has a load field, and explicit
  // `volumeCounting`. `strengthEstimate` is deliberately omitted — the
  // structural gate in `src/domain/strength/eligibility.ts` refuses all ten on
  // profile, basis or equipment, so the switch has nothing to add.
  {
    slug: "other-sled-push",
    name: "Sled Push",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_distance",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // Bounded to the BACKWARD drag (facing the sled, walking backwards, arms
    // straight, no hand-over-hand) — the definition these contributions are
    // authored against, accepted by the owner as D-R3-1 (a). A forward
    // harness drag is a different exercise and assigns differently; see the
    // authoring document §4.2 and §7.
    slug: "other-sled-drag",
    name: "Backward Sled Drag",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_distance",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
      { muscleGroupId: "forearms", role: "secondary" },
    ],
  },
  {
    // Deliberately distinct from `dumbbell-farmers-carry` (implement, load
    // scale and history series), with deliberately IDENTICAL contributions:
    // same movement, one convention.
    slug: "other-farmers-carry",
    name: "Farmer's Carry",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_distance",
    loadBasis: "per_hand",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // O-12 / §7.2: one row per set records ONE side, both sides performed.
    slug: "dumbbell-suitcase-carry",
    name: "Dumbbell Suitcase Carry",
    equipment: "dumbbell",
    mechanics: "compound",
    laterality: "unilateral",
    measurementProfile: "load_distance",
    loadBasis: "per_hand",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "forearms", role: "primary" },
      { muscleGroupId: "traps", role: "secondary" },
      { muscleGroupId: "lower_back", role: "secondary" },
    ],
  },
  {
    // `distance_time` has no load field, so `loadBasis` is omitted and
    // resolves to null — the `bodyweight-plank` precedent.
    slug: "bodyweight-sprint",
    name: "Sprint",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "distance_time",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "hamstrings", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "abs", role: "secondary" },
    ],
  },
  {
    // Distance logged is the TOTAL covered, not the shuttle length.
    slug: "bodyweight-shuttle-run",
    name: "Shuttle Run",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "distance_time",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
      { muscleGroupId: "adductors", role: "secondary" },
    ],
  },
  {
    // The PI-005 example for O-4(i): a rep-like `load_reps` set that must not
    // count as hypertrophy volume. `volumeCounting: "off"` is load-bearing
    // here, unlike on the entries whose profile excludes them anyway.
    slug: "other-med-ball-slam",
    name: "Medicine Ball Slam",
    equipment: "other",
    mechanics: "compound",
    measurementProfile: "load_reps",
    loadBasis: "total",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "lats", role: "primary" },
      { muscleGroupId: "front_delts", role: "secondary" },
      { muscleGroupId: "triceps", role: "secondary" },
    ],
  },
  {
    // `reps` records ATTEMPTS; jump distance is not a stored field in v1.
    slug: "bodyweight-broad-jump",
    name: "Broad Jump",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "reps",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "hamstrings", role: "secondary" },
      { muscleGroupId: "calves", role: "secondary" },
    ],
  },
  {
    // A-14 / A-17 (R3) name this slug as the witness that a seeded `reps`
    // athletic entry carries `volume_counting = 'off'`.
    slug: "bodyweight-box-jump",
    name: "Box Jump",
    equipment: "bodyweight",
    mechanics: "compound",
    measurementProfile: "reps",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "quads", role: "primary" },
      { muscleGroupId: "glutes", role: "primary" },
      { muscleGroupId: "calves", role: "secondary" },
    ],
  },
  {
    // Mirrors the seeded `Plank` convention (abs primary, lower_back
    // secondary) and adds glutes for the lateral hold. O-12: one row per set
    // records one side, both sides performed.
    slug: "bodyweight-side-plank",
    name: "Side Plank",
    equipment: "bodyweight",
    mechanics: "isolation",
    laterality: "unilateral",
    measurementProfile: "duration",
    volumeCounting: "off",
    contributions: [
      { muscleGroupId: "abs", role: "primary" },
      { muscleGroupId: "lower_back", role: "secondary" },
      { muscleGroupId: "glutes", role: "secondary" },
    ],
  },
```

---

## 6. Why omitting `strengthEstimate` is safe for all ten

§16 specifies the omission and says "the structural gate decides". Checked against `evaluateExerciseEligibility` (`src/domain/strength/eligibility.ts:48-62`), whose refusal order is profile → basis → equipment → switch (O-17, accepted):

| Slug | First failing check | Reason code rendered |
| --- | --- | --- |
| `other-sled-push`, `other-sled-drag`, `other-farmers-carry`, `dumbbell-suitcase-carry` | profile ≠ `load_reps` (`load_distance`) | `MEASUREMENT_PROFILE_UNSUPPORTED` |
| `bodyweight-sprint`, `bodyweight-shuttle-run` | profile ≠ `load_reps` (`distance_time`) | `MEASUREMENT_PROFILE_UNSUPPORTED` |
| `bodyweight-broad-jump`, `bodyweight-box-jump` | profile ≠ `load_reps` (`reps`) | `MEASUREMENT_PROFILE_UNSUPPORTED` |
| `bodyweight-side-plank` | profile ≠ `load_reps` (`duration`) | `MEASUREMENT_PROFILE_UNSUPPORTED` |
| `other-med-ball-slam` | profile passes, basis `total` passes, **equipment `other` ∉ `STRENGTH_ELIGIBLE_EQUIPMENT`** (`constants.ts:137` = barbell / dumbbell / cable / machine) | `EXERCISE_CATEGORY_UNSUPPORTED` |

The only entry that reaches the equipment check is the med-ball slam, and `other` is refused there. So no seeded athletic entry can produce an e1RM series **as seeded**, and `strengthEstimate: "off"` would be redundant on all ten — the same redundancy §7.3 notes for the assisted pull-up.

**Two disclosures, since every refusal above rests on a field the athlete can edit.** Neither is a rule violation, neither changes an entry, and §16's omission mandate is followed in both cases:

1. **`other-med-ball-slam` depends on its equipment.** Its refusal is the equipment check alone. Changed to `dumbbell`, `cable`, `machine` or `barbell` it would pass all four gates and begin producing an e1RM series from slam loads.
2. **`dumbbell-suitcase-carry` depends on its profile, and that profile is editable until first use** — the more reachable of the two. §10.3 locks `measurement_profile` only once the exercise is *referenced* by a `session_exercises` or `exercise_prescriptions` row; before that the change is permitted. Set to `load_reps` before first use, the carry passes the profile check, passes the basis check (`per_hand` is not `assistance`), passes the equipment check (`dumbbell` is eligible), and — with `strengthEstimate` omitted, so the column takes its `'auto'` default (`exercises.ts:117`) — would begin producing an e1RM series. Its conceptual twin `dumbbell-farmers-carry` carries an explicit `strengthEstimate: "off"` (`exerciseCatalog.ts:666`) and would not.

**`strengthEstimate` stays omitted on all ten regardless**, because §16 mandates it and the structural gate does decide correctly for every entry *as specified*. What these two disclose is that the gate's verdict is a function of editable metadata, not a permanent property of the slug — the same read-time-gate behaviour `eligibility.ts:26-30` already documents for `equipment`, `measurementProfile` and `loadBasis` ("editing it makes a whole series appear or vanish on the next read… flipping it back restores the series"). Nothing is lost in either case, and no data is reinterpreted. If the owner later decides a suitcase carry must never yield an e1RM even after a deliberate profile change, that is a catalog amendment adding `strengthEstimate: "off"` to the entry — it would contradict §16's omission rule as written, so it needs its own owner decision and is **not** proposed here.

---

## 7. D-R3-1 — which movement `other-sled-drag` denotes: **ACCEPTED, option (a)**

**Status: closed.** The owner accepted option **(a)** on 2026-09-08 — `other-sled-drag` is the **backward** drag, named **"Backward Sled Drag"**, with the definition and contributions authored in §4.2. The independent review's B-1 recommended exactly this outcome and is discharged. Nothing in this entry is pending, and no alternative below is live.

The decision existed because "sled drag" names at least three movements with materially different assignments while the catalog holds one entry:

| Reading | Movement | Contributions |
| --- | --- | --- |
| **(a) Backward drag — ACCEPTED** | Facing the sled, walking backwards, straps held with straight arms, knee-extension led | `quads` P, `glutes` S, `calves` S, `abs` S, `forearms` S |
| (b) Forward harness drag — declined | Waist or shoulder harness, walking or running forward, hip-extension led | *(not authored)* |
| (c) Hand-over-hand drag — declined | Seated or standing, hauling the strap in by hand | *(not authored)* |

**Grounds for (a).** It is the reading that makes the entry non-redundant beside `other-sled-push`: under the catalog's conventions (b) would credit nearly the same muscles as the push with the arms removed, giving the library two near-duplicate entries, while (a) is the common lower-body sled variant the catalog treats as knee-extension led. Naming the entry for the direction keeps the phone label consistent with the muscle map, which matters precisely because the athlete cannot see this document from the exercise page. Readings (b) and (c) are not wrong descriptions of *a* sled drag — they are different exercises, and the owner's choice is which one this slug denotes. Should either later be wanted, it is a new catalog entry under its own slug and its own gate, not an edit to this one; the seed is ledger-gated (`exercises.ts:49-57`), so a re-pointing of `other-sled-drag` after seeding would never reach an already-seeded row.

**Everything else in this document was an authoring call, deliberately not escalated, and the review approved all of them.** For the record, the three that came closest and the grounds on which they were settled: `other-farmers-carry` mirroring `dumbbell-farmers-carry` exactly (§4.3 — one movement, one convention); the sprint/shuttle hip-versus-knee split (§4.5–4.6 — chosen for internal consistency across the running and jumping entries, not from measurement); and `glutes` on the side plank (§4.10 — the one row that distinguishes it from the front plank). The bounded trunk-bracing assignment (§4.1) and the bilateral metadata on the alternating-gait entries (R-10a) were added to this revision for the same reason: both are convention choices the reader is entitled to see argued.

**No decision remains open in this document.** All ten entries are settled.

---

## 8. Implementation and acceptance checklist (Release 3)

For the implementation that follows this gate. Nothing here is done yet.

### 8.1 Exact metadata

- [ ] All ten entries appear in `EXERCISE_CATALOG` with the exact `slug`, `name`, `equipment`, `mechanics`, `laterality`, `measurementProfile`, `loadBasis` and `volumeCounting` of §4.11 / §5 — profile, basis and counting matching O-10(i) verbatim. `other-sled-drag` is named **"Backward Sled Drag"** per the accepted D-R3-1 (a).
- [ ] **The athletic block is appended after the entire existing catalog** — the last ten elements of `EXERCISE_CATALOG`, in the §5 order, with no existing entry moved. `tests/integration/reconcileContributions.integration.test.ts:28` takes `EXERCISE_CATALOG.slice(0, 40)` as `ORIGINAL_40_SLUGS`, and its scenario assertions at `:194-195` (`updated === 7`, `noop === 7`) depend on that positional window (L-1).
- [ ] `laterality: "unilateral"` on exactly `dumbbell-suitcase-carry` and `bodyweight-side-plank`; every other new entry omits it and takes the seeder's `bilateral` default (R-10, R-10a).
- [ ] `mechanics: "isolation"` on exactly `bodyweight-side-plank`; the other nine are `compound`.
- [ ] **`loadBasis` present on all five entries whose profile has a load field** — the four `load_distance` entries **and `other-med-ball-slam`, which carries `loadBasis: "total"`** — and absent on the five with no load field (`bodyweight-sprint`, `bodyweight-shuttle-run`, `bodyweight-broad-jump`, `bodyweight-box-jump`, `bodyweight-side-plank`), where an explicit value would be rejected by `ck_exercises_load_basis_presence`. Omitting it on the slam raises no error and silently seeds `'unspecified'` instead of O-10(i)'s `total` (R-6).
- [ ] Verify in the seeded rows, not only in the literal: `load_basis = 'total'` for `other-med-ball-slam`, `other-sled-push` and `other-sled-drag`; `'per_hand'` for `other-farmers-carry` and `dumbbell-suitcase-carry`; `NULL` for the other five.
- [ ] `volumeCounting: "off"` stated **explicitly** on all ten (§16 authoring rule), with the new unit test §16 names asserting it for every slug in the athletic list.
- [ ] `strengthEstimate` omitted on all ten; `loadStepKg` absent (by equipment, unchanged).
- [ ] No `weight` on any contribution — not expressible in `SeedContribution`, and the seeder applies `DEFAULT_CONTRIBUTION_WEIGHT`.

### 8.2 Valid contributions

- [ ] Every contribution targets a slug in `LEAF_MUSCLE_GROUP_SLUGS`; no `back`, no new group (ADR-010). Covered by the existing leaf-only assertion, `tests/unit/exerciseCatalog.test.ts:71`.
- [ ] Every entry has ≥ 1 `primary` and no repeated muscle group within an entry — the existing assertions at `:43` and `:49` extend to the new entries automatically.
- [ ] `tests/unit/exerciseCatalog.test.ts:20` (names unique case-insensitively) passes: "Farmer's Carry" must not collide with "Dumbbell Farmer's Carry", and no new name collides with any of the 93 existing ones.
- [ ] Contribution multisets match §4 row for row, per slug.
- [ ] **The adductor-exclusivity assertion must be updated: `tests/unit/exerciseCatalog.test.ts:131-140`**, `it("adds machine-hip-adduction with adductors primary, and no other entry uses adductors")`. `bodyweight-shuttle-run` adds `adductors` secondary, so its final `expect(adductorSlugs).toEqual(["machine-hip-adduction"])` fails on the first implementation run. The exclusivity clause is a Release-2 artefact recording "no other entry uses adductors *yet*", not an invariant — `adductors` is an ordinary leaf. Update it to the **exact expected set, in catalog order**:

  ```ts
  expect(adductorSlugs).toEqual(["machine-hip-adduction", "bodyweight-shuttle-run"]);
  ```

  This order follows from the §8.1 placement rule (the athletic block is appended last, so `machine-hip-adduction` precedes it), which makes the assertion a second, incidental guard on that placement. **Retain the rest of the test's meaningful assertions unchanged** — `expect(entry?.name).toBe("Hip Adduction Machine")` and `expect(entry?.contributions).toEqual([{ muscleGroupId: "adductors", role: "primary" }])` at `:132-134` still hold and must not be weakened or deleted. Rename the test to drop "and no other entry uses adductors" (e.g. "…and adductors is used only by it and the shuttle run"), so the name matches what it now proves.

### 8.3 Deterministic ids

- [ ] Ids come from the unchanged `slugToUuid` derivation the seeder applies inline (`src/db/seed/exercises.ts:110`) and the exported `seededExerciseId` helper tests use (`:180-182`) — no new id mechanism, no persisted slug.
- [ ] Reseeding produces the same ten ids for the same user; an integration assertion pins at least one (e.g. `bodyweight-box-jump`) across two runs.

### 8.4 Fresh-database seeding

- [ ] `pnpm db:seed` on a clean local Docker PostgreSQL inserts all ten with the exact `measurement_profile`, `load_basis` and `volume_counting` values of §4.11, and `load_basis IS NULL` for the five load-less entries — the §14.4 R3 row and A-17's R3 assertion.
- [ ] A-14's R3 assertion: the seeded `bodyweight-box-jump` row carries `volume_counting = 'off'`.
- [ ] Each of the ten receives exactly its authored contribution rows, with weight `1` for primary and `0.5` for secondary.
- [ ] `reconcileMeasurementProfiles` remains a no-op on the fresh database; no new reconcile ships in Release 3 (§14.4, "Reconcile: none new").

### 8.5 Existing-user seeding

- [ ] On a database whose ledger already holds the 93 applied slugs, exactly the ten new slugs are inserted and recorded; no existing row is touched, re-inserted or given fresh contributions (the ledger skip, stated at `exercises.ts:49-57` and implemented by `seedExerciseCatalogForUser` from `:58`).
- [ ] Catalog length assertion updated: `tests/unit/exerciseCatalog.test.ts:142` currently asserts exactly 93 and must become 103, with its comment updated to name the Release-3 addition.
- [ ] `tests/unit/exerciseCatalog.test.ts:174` ("every other catalog entry still omits the three new fields") must be widened to exempt the ten athletic slugs, and must still prove the remaining ~90 `load_reps` entries stay untouched (§16: they keep the optional/default precedent).
- [ ] **The "full-92 pre-v2 user" fixtures must exclude the ten R3 slugs.** `tests/integration/reconcileContributions.integration.test.ts:161-163` and `:496-498` build the pre-v2 slug set as *every* catalog slug except `machine-hip-adduction`. After Release 3 that set silently includes the ten athletic slugs — i.e. a "pre-v2 user" who already owned a Backward Sled Drag, a state that never existed. Nothing breaks today (`insertPreV2CatalogEntry`, `:48-70`, inserts with column defaults; the reconcile counters stay `mapped`/`updated` = 14; the post-seed length assertions are catalog-relative), so this is fixture honesty rather than a failure: exclude the Release-3 slugs alongside `machine-hip-adduction` in both places, ideally from one shared exported constant so a Release-4 addition cannot reintroduce the drift (L-2).
- [ ] **Name-collision check before deploy.** The insert is arbiter-less `onConflictDoNothing` (`exercises.ts:140-144`): if the owner has already hand-created an active exercise named "Sprint", "Box Jump", "Broad Jump", "Side Plank", "Farmer's Carry", "Shuttle Run", "Sled Push", "Backward Sled Drag", "Medicine Ball Slam" or "Dumbbell Suitcase Carry", that seed row is silently skipped **and the slug is still recorded as applied**, so the catalog entry is never seeded for that user again. Verify the production account's exercise names against the ten before deploying, and adjust the catalog name (not the slug) if one collides.

### 8.6 Repeat-seed idempotence

- [ ] A second `pnpm db:seed` immediately after the first inserts nothing, updates nothing and adds no contribution rows for the ten (`tests/integration/seed.integration.test.ts:143` extends to them).
- [ ] The whole per-user seed remains one transaction; a failure leaves neither an exercise row without its ledger entry nor the reverse (`:438`).

### 8.7 Preservation of user edits and deletions

The Phase 1 H1 guarantees must hold for the ten exactly as for the 93. **The existing tests establish the mechanism, not per-entry coverage of the ten**, and the distinction matters for what this checklist can claim: each cited test exercises one specific catalog entry, not the catalog as a whole — `:154` uses `EXERCISE_CATALOG[0]`, `:172` and `:206` use `barbell-back-squat`, `:241` and `:259` use `bodyweight-plank`. None of them touches an athletic slug. The guarantees nonetheless do hold for the ten, because the ledger skip is keyed on slug and is entirely slug-agnostic (`exercises.ts:58-93`, decisively the filter `EXERCISE_CATALOG.filter((item) => !applied.has(item.slug))` at `:93`): a recorded slug is skipped whether its row still exists, was edited, or was hard-deleted, and nothing in that path branches on which slug it is. That is a **mechanism argument**, and it is sufficient; it is not evidence about these ten entries specifically.

Existing mechanism coverage — must keep passing, unchanged, with no athletic entry involved:

- [ ] An edit to a seeded exercise survives a reseed — `seed.integration.test.ts:154` (`EXERCISE_CATALOG[0]`), `:172` (`barbell-back-squat`).
- [ ] A contribution the user removed is **not** resurrected — `:206` (`barbell-back-squat`).
- [ ] A hard-deleted seeded exercise is **not** resurrected — `:241` (`bodyweight-plank`).
- [ ] A custom exercise reusing a hard-deleted seeded name does not break reseeding — `:259` (`bodyweight-plank`).
- [ ] A new catalog slug colliding with an active custom name is skipped without blocking the other new slugs — `:353`. This is the mechanism §8.5's last item asks the owner to check for in production.

Additional athletic witness — the one new preservation case Release 3 should add, so the claim above rests on evidence and not on the mechanism argument alone:

- [ ] One athletic-slug preservation case using **`bodyweight-box-jump`** (already the A-14 / A-17 witness, so the fixture is shared): seed it, edit it or hard-delete it, reseed, and assert the edit survives or the row is not resurrected. One case is enough — the ledger path is slug-agnostic, so repeating it for all ten would add no information.

### 8.8 Must-not-change (evaluation §21.3)

- [ ] No migration, no schema change, no file added under `drizzle/`.
- [ ] No sync-contract, emitter, DTO or IndexedDB change.
- [ ] No consumer change: progression, strength/e1RM, volume, metrics, warm-up and recovery untouched.
- [ ] No UI change beyond what the new library rows render with existing components.
- [ ] No new reconcile script.

### 8.9 Documentation, in the same commit (§24.3)

- [ ] `docs/architecture/domain-model.md` §3 **or** the catalog's own header comment records the authoring rule (explicit `measurementProfile`, `loadBasis` where the profile has load, `volumeCounting` for every athletic entry), the ten adopted slugs and shapes, and that the contributions were approved at this authored-list gate — recording O-10(i) and O-10(ii). The §5 code block above places that comment in the catalog; if the owner prefers `domain-model.md`, the same three facts go there instead.
- [ ] This document is cited from the implementation report as the gate that discharged O-10(ii).

---

## 9. Residual risks

| Id | Risk | Disposition |
| --- | --- | --- |
| CR-1 | ~~The sled-drag entry ships under a reading the owner did not intend~~ | **Closed.** D-R3-1 accepted as (a) on 2026-09-08 (§7); the entry is the backward drag, named "Backward Sled Drag". A forward-harness or hand-over-hand drag, if ever wanted, is a new slug under its own gate |
| CR-2 | A production name collision silently and permanently skips an entry | §8.5's pre-deploy name check; the mechanism itself is correct and tested (`seed.integration.test.ts:353`), so this is an operational check, not a code fix |
| CR-3 | The contributions are read as physiological claims | §3 states the convention framing; the rationale in every §4 entry is written in those terms |
| CR-4 | `other-farmers-carry` and `dumbbell-farmers-carry` look like duplicates in the library | Intended and required by O-10(i); they differ by implement, equipment, load scale and history series, and §4.3 records why the contributions are deliberately identical |
| CR-5 | `reps`-profile jumps invite a distance-per-attempt expectation the profile cannot store | Stated in §4.8; a distance-per-attempt record is Release 4 (N-3, §21.4), not a Release-3 change |
| CR-6 | A permitted pre-reference profile change makes `dumbbell-suitcase-carry` e1RM-eligible, where `dumbbell-farmers-carry` stays refused | Disclosed in §6; `strengthEstimate` stays omitted per §16, and the gate is read-time and reversible. Adding `strengthEstimate: "off"` would contradict §16 and needs its own owner decision — not proposed |
| CR-7 | A future catalog addition re-introduces the fixture drift L-1 and L-2 describe | §8.1's append-last constraint and §8.5's shared-exclusion-constant recommendation; both are checklist items, neither is enforced by a test today |

---

## 10. Verdict

The ten adopted slugs are specified in full: exact metadata, leaf-only contributions with roles and at least one primary each, existing vocabulary and default weights only, no rollup contribution, no custom weight, no new muscle group. `strengthEstimate` is omitted, shown safe against the structural gate, and the two editable-metadata paths that could change that verdict are disclosed. The distinction between `other-farmers-carry` and `dumbbell-farmers-carry` is preserved. **D-R3-1 is closed — `other-sled-drag` is the backward drag, "Backward Sled Drag", accepted by the owner as option (a) — so no decision remains open and all ten entries are settled.** The nine entries the review approved are unchanged.

The two MEDIUM defects are corrected: the `loadBasis` split is stated as five loaded / five load-less throughout, with `other-med-ball-slam`'s `total` named explicitly in the binding checklist (M-1), and the adductor-exclusivity assertion is identified with its exact expected set (M-2). All eight LOWs are folded in, including the append-last placement constraint (L-1) that prevents an unrelated integration failure.

Nothing was implemented, seeded, committed, pushed or deployed, no database was contacted, no file other than this one was modified — the independent review is untouched — and the accepted architecture was not reopened.

---

## 11. Revision log — finding to change

Against `docs/reviews/athletic-measurement-profiles-release-3-catalog-review.md` (2026-09-08, REVISION REQUIRED). No entry's name, equipment, mechanics, laterality, profile, basis, counting or contribution list changed in this revision, with the single exception of `other-sled-drag`'s status moving from recommended to accepted — its authored values are identical.

| Finding | Change made | Where |
| --- | --- | --- |
| **B-1** — D-R3-1 unresolved | Owner accepted option (a). §7 rewritten as a closed decision with the declined readings retained as rationale; §4.2 heading and name de-conditionalised; §5 literal comment records the acceptance; CR-1 closed; header and §10 state that nothing is pending | header, §4.2, §5, §7, CR-1, §10 |
| **M-1** — `loadBasis` counted 4/6, and §8.1 would seed `'unspecified'` on the slam | R-6 rewritten as an explicit five/five split naming `other-med-ball-slam`'s `total`, with the silent-failure mechanism stated; R-5's "six/three" corrected to nine non-`load_reps` entries versus the one `load_reps` entry; §8.1's checklist item corrected and a per-column seeded-value verification added | R-5, R-6, §8.1 |
| **M-2** — missed adductor-exclusivity assertion | New §8.2 item naming `tests/unit/exerciseCatalog.test.ts:131-140`, the exact expected set `["machine-hip-adduction", "bodyweight-shuttle-run"]` in catalog order, an instruction to retain the name and single-row contribution assertions at `:132-134`, and a test rename; §4.6 cross-references it | §4.6, §8.2 |
| **L-1** — trailing placement is a hard constraint | §5's placement paragraph rewritten as a constraint citing `reconcileContributions.integration.test.ts:28` and `:194-195`; promoted to a §8.1 checklist item | §5, §8.1 |
| **L-2** — full-92 pre-v2 fixtures drift | New §8.5 item requiring the ten R3 slugs be excluded at `:161-163` and `:496-498`, preferably via one shared constant; states that nothing breaks today | §8.5 |
| **L-3** — §8.7 overstated per-entry coverage | Preamble rewritten to separate existing **mechanism** coverage (with the actual exercise each test uses) from the slug-agnostic ledger argument, and one additional athletic witness (`bodyweight-box-jump`) added as its own checklist item | §8.7 |
| **L-4** — `as specified` caveat covered the wrong entry | §6 gains both disclosures: the slam's equipment dependence and the suitcase carry's permitted pre-reference profile change, with `strengthEstimate` kept omitted per §16 and the "would need its own owner decision" boundary stated; CR-6 added | §6, CR-6 |
| **L-5** — trunk bracing credited asymmetrically | New bounded-assignment note under §4.1 explaining why the erector row is carried only where anti-flexion is a defining demand; §4.2 references it. **No contribution row added or removed** | §4.1, §4.2 |
| **L-6** — backward-drag rationale stated as mechanical fact | §4.2's rationale reframed as the catalog's convention with an explicit "not a measured claim" hedge, matching §4.5 and §4.6 | §4.2 |
| **L-7** — bilateral laterality unargued against the L-9 precedent | New rule R-10a: the L-9 walking-lunge precedent is acknowledged, and `bilateral` is justified through O-12's whole-set/round semantics — a run has no left round and no right round. No per-side recording rule is introduced | §2 R-10a |
| **L-8** — citation drift | `eligibility.ts:49-64` → `:48-62`; the ledger skip `exercises.ts:53-58` → `:49-57` (rule) / `:58` (function) / `:93` (filter); `seededExerciseId` correctly at `:180-182` with `:110` kept for the inline derivation; `muscleGroups.ts:14-32` → `:13-31`; `profile.ts:113-126` added for `loadBasisRequired`; `eligibility.ts:26-30`, `exerciseCatalog.ts:666`, `exercises.ts:117` added and verified | §1.1, §6, §8.3, §8.5 |

Re-review scope, per the review's §4: **§2, §6, §7 and §8**. §3, §4 (other than §4.1's added note, §4.2's status and framing, and §4.6's cross-reference), §5's literals and §9 are unchanged in substance.

READY FOR TARGETED CATALOG REVISION VERIFICATION
