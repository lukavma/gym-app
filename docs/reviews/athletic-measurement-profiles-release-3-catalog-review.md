# Athletic measurement profiles — Release 3 authored catalog: independent review (O-10(ii) gate)

Date: 2026-09-08
Reviewer: independent review pass, no implementation authority exercised.
Subject: `docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md` (untracked, 606 lines).
Repository state at review: branch `main`, `HEAD = 4865a02`, working tree carrying the pre-existing uncommitted changes plus the authoring document under review. **Nothing was modified, implemented, seeded, committed, pushed or deployed by this review; no database was contacted.** The authoring document was read only.

Binding upstream checked against: `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §16, §21.3, §24.3/§24.4, §14.4, §11.2, §11.4, §10.3, §7.1–7.3, O-4(i)/(ii), O-10(i), O-10(ii), O-12, A-14, A-17; `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md`; `docs/architecture/domain-model.md` §3; `docs/architecture/evidence-to-design.md` row 19.

---

## 0. Verdict

**REVISION REQUIRED.**

The authored list itself is sound. All ten entries were verified mechanically and by reading: exactly the ten O-10(i) slugs, shapes verbatim, leaf-only contributions, ≥ 1 primary each, no duplicate muscle within an entry, no rollup, no custom weight, no `loadStepKg`, `strengthEstimate` omitted throughout, explicit `volumeCounting: "off"` on all ten, valid names with no collision against the 93 existing entries. Nine of the ten entries are fully determined and I would approve them as written.

Three things block the gate as it stands:

1. **D-R3-1 is genuinely open** (§7). The author correctly escalates it, but it is the one decision O-10(ii) exists to gate: under readings (b) or (c) the `other-sled-drag` entry's `name` and all five contribution rows change. The authored list for that slug is therefore not yet approved-and-final, and the seed is ledger-gated — once seeded under the wrong reading, no later catalog edit reaches that user's row. **My recommendation is to accept the author's (a), "Backward Sled Drag", as written**; the reasoning in §7 is correct and the alternative readings are genuinely different exercises. This needs one word from the owner, not a redesign.
2. **M-1** — a `loadBasis` accounting error in the binding authoring rules (R-5, R-6) and repeated in the implementation checklist (§8.1). Followed literally, §8.1 instructs the implementer to omit `loadBasis` on `other-med-ball-slam`, which would seed `load_basis = 'unspecified'` in place of O-10(i)'s `'total'` — silently, without violating any CHECK.
3. **M-2** — the checklist misses an existing unit assertion that `bodyweight-shuttle-run` demonstrably breaks.

Both MEDIUMs are documentation fixes to the authoring document, not changes to the ten entries. Neither reopens the architecture.

---

## 1. What was verified, and how

### 1.1 Mechanical checks (all passed)

The `SeedCatalogExercise` block in §5 was extracted verbatim and checked programmatically:

| Check | Result |
| --- | --- |
| Entry count | 10 |
| Slugs match O-10(i) (§16) exactly, no extras, no omissions | pass |
| Profile / basis / counting cells identical to §16 | pass (verbatim, all ten) |
| `volumeCounting: "off"` present on every entry | 10/10 explicit; no `"auto"` anywhere |
| `strengthEstimate` present on any entry | 0 (single occurrence is in the header comment) |
| `loadStepKg` present | 0 |
| Contribution `weight` present | 0 (not expressible in `SeedContribution`, `exerciseCatalog.ts:10-13`) |
| ≥ 1 `primary` per entry | 10/10 (minimum 1, `other-sled-drag` / `other-farmers-carry` / `bodyweight-side-plank`) |
| Duplicate muscle within an entry | none |
| Contribution list length | 3–5 rows, within existing catalog density |
| Every `muscleGroupId` ∈ `LEAF_MUSCLE_GROUP_SLUGS` (`muscleGroups.ts:13-30`) | pass; no `back`, no invented slug |
| §4.11 summary table vs §5 literals, row for row | identical for all ten |
| Slug novelty against the 93 seeded slugs | all ten new |
| Name collision, case-insensitive, against all 93 names | none (`tests/unit/exerciseCatalog.test.ts:20`) |

### 1.2 Type conformance (§5 vs the real type)

`SeedCatalogExercise` is at `src/db/seed/exerciseCatalog.ts:15-51` — the citation is line-exact. Required members `slug`, `name`, `equipment`, `mechanics`, `contributions` are present on all ten; optional `laterality`, `measurementProfile`, `loadBasis`, `volumeCounting` are used within their declared unions. `equipment` values `other` / `dumbbell` / `bodyweight` are all in `EQUIPMENT_TYPES` (`schema.ts:21-28`); `mechanics` and `laterality` are valid; every profile is in `MEASUREMENT_PROFILES` and every basis in `LOAD_BASES` (`profile.ts:17-32`). Field ordering matches the file's existing convention (`laterality` after `mechanics`, as at `exerciseCatalog.ts:232`). **The literals typecheck against the actual type as written.**

`load_distance` permitting an optional `duration` (§4.1's "time is optional") and `load_reps` permitting an optional `rir` (§4.7) both check out against the `DIMENSIONS` table (`profile.ts:58-100`).

### 1.3 Seeder behaviour claims

Each resolution claim was checked against `src/db/seed/exercises.ts`:

- omitted `laterality` → `"bilateral"` (`:115`) ✔
- omitted `measurementProfile` → `DEFAULT_MEASUREMENT_PROFILE` (`:105`) ✔
- `loadBasis` resolution via `resolveLoadBasis` → `null` for a load-less profile, `'unspecified'` for an unclassified load-bearing one (`schema.ts:72-77`, `:106`) ✔
- omitted `volumeCounting` → `'auto'` for `load_reps`, `'off'` otherwise (`:107-108`) ✔ — which is exactly what makes §4.7's "load-bearing here" claim correct and the other nine's explicit `'off'` a reviewability measure rather than a behaviour change
- deterministic ids via `slugToUuid`/`seededExerciseId` (`:110`, `:180-182`) ✔
- arbiter-less `onConflictDoNothing` and contributions only for genuinely inserted rows (`:140-156`) ✔
- default weights primary `1` / secondary `0.5` applied by the seeder (`:155`, `schema.ts:86-89`) ✔

### 1.4 `strengthEstimate` omission (§6)

The refusal-order table is correct. `evaluateExerciseEligibility` (`src/domain/strength/eligibility.ts:48-62`) refuses on profile first, then `assistance` basis, then equipment, then the switch; `STRENGTH_ELIGIBLE_EQUIPMENT` is `barbell/dumbbell/cable/machine` (`src/domain/strength/constants.ts:137` — line-exact). Nine of the ten are refused at the profile check; `other-med-ball-slam` reaches and fails the equipment check. So `strengthEstimate: "off"` would be redundant on all ten **as specified**, and §16's "the structural gate decides" is satisfied. See L-4 for the one disclosure the section omits.

### 1.5 ADR-010 conformance

No new group, no rollup contribution, no hierarchy change; §24.4 lists ADR-010 as not amended by this work, and nothing in the authored list would amend it. §4.7's use of `lats` for the slam's shoulder-extension arc is a direct application of the ADR's own stated rule ("vertical pulls and shoulder-extension arcs → `lats`"). `traps` on the two carries is consistent with the ADR's "upper-trapezius shrug work" definition. `lower_back` as "Lower Back (Erectors)" with no oblique/QL leaf is stated accurately in §4.4.

### 1.6 Convention-vs-evidence framing

§3 is the strongest part of the document and is well aligned with `evidence-to-design.md` row 19, which explicitly forbids reading a leaf number as an anatomical-stimulus claim. The primary/secondary split is correctly labelled as EVIDENCE-004's tunable convention (`domain-model.md:79`). §4.5 and §4.6 close with explicit "this is a convention, not a measurement" disclaimers. One rationale departs from this (L-6).

### 1.7 Muscle assignments against the defined movement variants

Each entry was checked against its own §4 movement definition and against the nearest seeded precedent.

- **`other-sled-push`** — `quads`/`glutes` primary mirrors `barbell-back-squat` and `bodyweight-walking-lunge` exactly; `hamstrings` secondary matches the squat's own row. Excluding shoulders/triceps is argued, bounded and consistent with the carry family. Reasonable. See L-5 on `lower_back`.
- **`other-sled-drag`** — internally coherent *given* the backward-drag definition, and correctly non-redundant against the push. Contingent on D-R3-1.
- **`other-farmers-carry`** — byte-identical to `dumbbell-farmers-carry` (`exerciseCatalog.ts:672-676`); "one movement, one convention" is the right call and §4.3's argument for it is correct. Verified identical, row for row and role for role.
- **`dumbbell-suitcase-carry`** — promoting `abs` to primary is the substantive difference from the bilateral carry and is exactly the demand the asymmetric load creates; `lower_back` secondary is well justified given no QL/oblique leaf exists. Reasonable.
- **`bodyweight-sprint`** — hip-extension-dominant credit at speed is the mainstream coaching read and is correctly labelled a convention.
- **`bodyweight-shuttle-run`** — knee-extension promotion for repeated decel/re-accel is reasonable; `adductors` secondary for the lateral plant is defensible and is the only genuinely new leaf usage among the ten. See M-2.
- **`other-med-ball-slam`** — `abs` + `lats` primary is the standard read of a trunk-flexion/shoulder-extension throw and follows ADR-010's own arc rule. `triceps` secondary is the weakest single row in the ten (the elbow largely holds position and the throw is not triceps-driven), but it is within the coarse convention §3 describes and does not affect any number today. Acceptable.
- **`bodyweight-broad-jump` / `bodyweight-box-jump`** — the one-row difference (`hamstrings` on the horizontal jump only) is a deliberate, stated convention and reads correctly. The box jump's 3-row list is within existing density (`bodyweight-calf-raise` has one row).
- **`bodyweight-side-plank`** — mirrors the seeded `Plank` (`exerciseCatalog.ts:480-483`) including `isolation` mechanics, and `glutes` for the lateral-hold demand is the right single addition.

No entry credits a muscle the defined variant does not plausibly use, and no entry is missing a demand large enough to mislead the library read. **The assignments are approvable.**

### 1.8 Checklist coverage for seeding

§8.3–§8.7 correctly cover deterministic ids, fresh-database seeding with the exact column values, existing-user ledger-skip seeding, repeat-seed idempotence, and the five H1 preservation guarantees (edits, removed contribution, hard delete, name reuse, active-name collision). The pre-deploy production name-collision check (§8.5, last item) is the right operational call and correctly identifies the permanent consequence of the arbiter-less insert (`exercises.ts:140-144`: the slug is recorded as applied even when the row is skipped). §8.8's must-not-change list matches §21.3. §8.9 matches §24.3's "domain-model §3 **or** the catalog's own header comment" verbatim, and the §5 code block already contains a header comment that would discharge it. See M-2, L-1, L-2 and L-3 for the gaps.

---

## 2. Findings

### BLOCKING — open owner decision

**B-1 — D-R3-1 (`other-sled-drag`) is unresolved.** Entry: §4.2, §7, CR-1.

The document escalates this correctly and completely: three readings, their contribution sets, a recommendation with grounds, and an accurate statement that switching is a one-literal substitution touching nothing else (slug, equipment, mechanics, laterality, profile, basis and counting are identical under all three). That is exactly what an escalation should look like, and no criticism attaches to it.

But O-10(ii)'s gate approves "the authored, leaf-only list before any of the ten is seeded", and for this slug the list is conditional: readings (b) and (c) change the entry's name and all five contribution rows. The seed is ledger-gated (`exercises.ts:49-57`), so a row seeded under the wrong reading is never re-seeded — the owner would have to fix it by hand in the editor. The decision must land before implementation, not after.

**Recommendation: adopt (a), `Backward Sled Drag`, as authored.** §7's argument is correct — (b) largely duplicates `other-sled-push`'s assignment with the arms removed, and (a) is the only common lower-body sled variant that is knee-extension dominant, which is what earns the slug its place. Naming the entry for the direction is also right, since the athlete cannot see this document from the exercise page. One owner confirmation discharges B-1; no other change follows.

### MEDIUM

**M-1 — The `loadBasis` accounting is wrong in R-5, R-6 and §8.1, and §8.1 would seed a wrong value.** Entries: §2 R-5, §2 R-6, §8.1 (fourth item).

The ten split five/five, not four/six:

| Has a load field (`loadBasisRequired`, `profile.ts:112-119`) | No load field |
| --- | --- |
| `other-sled-push`, `other-sled-drag`, `other-farmers-carry`, `dumbbell-suitcase-carry` (`load_distance`) **and `other-med-ball-slam` (`load_reps`)** | `bodyweight-sprint`, `bodyweight-shuttle-run` (`distance_time`); `bodyweight-broad-jump`, `bodyweight-box-jump` (`reps`); `bodyweight-side-plank` (`duration`) |
| **5 entries** | **5 entries** |

- R-6 says *"Stated for the four `load_distance` entries; omitted for the six with no load field."* Both halves are wrong: `loadBasis` is stated for **five** entries (the slam carries `loadBasis: "total"` at §5 and §4.7, correctly), and only **five** have no load field.
- R-5 says *"For the six non-`load_reps` entries with no load field, and for the three `load_distance` entries…"* — the true split of the nine non-slam entries is **five** load-less and **four** `load_distance`.
- §8.1 repeats R-6 verbatim as a checklist item: *"`loadBasis` present on exactly the four `load_distance` entries; absent on the six with no load field."*

§8.1 is binding for the implementation. Followed literally it omits `loadBasis` on `other-med-ball-slam`, which `resolveLoadBasis` then resolves to `'unspecified'` rather than O-10(i)'s `'total'` (`schema.ts:72-77`). That violates no CHECK — `load_reps` requires the column to be non-null and `'unspecified'` satisfies it — so the defect seeds silently and, being ledger-gated, permanently for that user. It also puts the checklist in direct contradiction with §4.7, §4.11 and the §5 literal, all of which are correct.

Fix: restate R-5/R-6 and §8.1 as "present on the four `load_distance` entries **and on `other-med-ball-slam`**; absent on the five with no load field", and correct R-5's 6/3 to 5/4. No change to any entry.

**M-2 — The checklist misses a currently-passing assertion that `bodyweight-shuttle-run` breaks.** Entries: §4.6, §4.11, §8.2, §8.5.

`tests/unit/exerciseCatalog.test.ts:131-140` asserts adductor exclusivity:

```ts
const adductorSlugs = EXERCISE_CATALOG.filter((item) =>
  item.contributions.some((c) => c.muscleGroupId === "adductors"),
).map((item) => item.slug);
expect(adductorSlugs).toEqual(["machine-hip-adduction"]);
```

`bodyweight-shuttle-run` adds `adductors` secondary, so this assertion fails on the first implementation run. §4.6 and §4.11 both note that `adductors` "gains its second catalog home" without connecting that to the test, and §8.5 enumerates precisely which unit assertions must change — `:142` (93 → 103) and `:174` (widen the untouched-fields exemption) — but not `:131`.

The entry is not wrong: `adductors` is a leaf, and the exclusivity assertion is a Release-2 artefact recording "no other entry uses adductors *yet*", not an invariant. The checklist simply has to say so and instruct that `:131-140` be narrowed to the `machine-hip-adduction` half (name and single-row contribution) with the exclusivity clause dropped or re-expressed as `["machine-hip-adduction", "bodyweight-shuttle-run"]`.

### LOW

**L-1 — Trailing placement is a hard constraint, not a preference.** Entry: §5 (placement paragraph), §8.

§5 presents the new `// Athletic (Release 3)` block as "recommended", weighing reviewability against scattering. There is a harder reason: `tests/integration/reconcileContributions.integration.test.ts:28` derives `ORIGINAL_40_SLUGS = EXERCISE_CATALOG.slice(0, 40)`, a positional window. Filing the ten under their existing equipment groupings would shift that window and break the pre-v2 scenario assertions at `:191-195` (`updated === 7`, `noop === 7`) for reasons entirely unrelated to the change. Appending at the end is the only safe placement; §8 should carry it as a checklist constraint with this citation, not leave it as a presentational preference in §5.

**L-2 — The "full-92 pre-v2 user" fixtures drift in meaning.** Entry: §8 (not covered).

`tests/integration/reconcileContributions.integration.test.ts:161-163` and `:496-498` build the pre-v2 slug set as *every* catalog slug except `machine-hip-adduction`. After Release 3 that set silently includes the ten athletic slugs, i.e. a "pre-v2 user" who already owned a Backward Sled Drag. I traced this: nothing breaks — `insertPreV2CatalogEntry` (`:48-70`) inserts with column defaults, the reconcile counters stay `mapped/updated = 14`, and the post-seed length assertions are catalog-relative — but the fixture no longer reconstructs the state it claims to. Recommend the checklist add an explicit Release-3 exclusion alongside `machine-hip-adduction`.

**L-3 — §8.7 overstates existing per-entry test coverage.** Entry: §8.7 preamble.

"The Phase 1 H1 guarantees must hold for the ten exactly as for the 93 — each already has a test the new entries fall under." The cited tests operate on a specific exercise, not on the catalog as a whole: `:154`/`:172` use `EXERCISE_CATALOG[0]`, `:206`/`:241` use `barbell-back-squat`, `:259` uses a hard-deleted seeded name. The guarantees do hold for the ten, because the ledger skip is keyed on slug and is entirely slug-agnostic (`exercises.ts:49-93`) — but that is a mechanism argument, not the coverage the sentence claims. Either reword to "the mechanism is slug-agnostic, so the ten inherit the guarantee" or add one athletic-slug case (`bodyweight-box-jump` is already the A-14/A-17 witness and is the natural choice).

**L-4 — §6's "as specified" caveat covers the wrong entry.** Entry: §6, closing paragraph.

§6 correctly flags that the slam's refusal depends on its `other` equipment and would disappear if that changed. The more reachable path is the mirror image, and is unflagged: `dumbbell-suitcase-carry` is `dumbbell` equipment with `per_hand` basis, and §10.3 permits a profile change on an exercise **not yet referenced by any `session_exercises` or `exercise_prescriptions` row**. Changed to `load_reps` before first use it passes the profile, basis and equipment gates in order, and with `strengthEstimate` omitted (→ `'auto'`, `exercises.ts:117`) it would begin producing an e1RM series — where its conceptual twin `dumbbell-farmers-carry` carries an explicit `strengthEstimate: "off"` and would not. §16 mandates the omission, so this is not a rule violation and not a reason to change the entry; it is a disclosure §6 should carry alongside the med-ball note.

**L-5 — Trunk bracing is credited asymmetrically across the ten.** Entries: §4.1, §4.2, §4.4.

The precedent §4.1 invokes, `barbell-back-squat`, credits bracing as **both** `abs` secondary and `lower_back` secondary (`exerciseCatalog.ts` squat entry). The sled push (inclined braced torso resisting a horizontal load) and the sled drag take `abs` only, while `dumbbell-suitcase-carry` does take `lower_back` secondary. R-11's boundedness rule makes each individual choice defensible, but the document invokes the squat convention for the sled push without noting that it is applying half of it. Either add the row or say in §4.1 why the erector row is deliberately not carried into the sled family.

**L-6 — One rationale is stated as mechanical fact rather than as convention.** Entry: §4.2.

"Backward dragging is knee-extension dominant with the hip working far less than in a forward drive" is asserted flatly, where the parallel claims in §4.5 and §4.6 are explicitly closed with "a convention chosen so the two entries read differently, not a measured claim". Given §3's framing and `evidence-to-design.md` row 19's prohibition on anatomical-stimulus claims, §4.2 should hedge the same way. This matters slightly more than usual because the same claim carries the D-R3-1 recommendation.

**L-7 — Bilateral laterality on the alternating-gait entries is unargued against the L-9 precedent.** Entries: §4.1, §4.2, §4.5, §4.6, R-10.

§16 fixes `unilateral` only for `dumbbell-suitcase-carry` and `bodyweight-side-plank`; the other eight are authored here. `tests/unit/exerciseCatalog.test.ts:56-66` records the L-9 precedent that walking lunges were made `unilateral` because they "load one leg at a time like the catalog's other single-leg variants". Sled push/drag, sprint and shuttle run also load one leg at a time. Bilateral is nonetheless correct, because under O-12 `unilateral` means "one row records one side's distance with both sides performed", which is meaningless for a run — but R-10 discusses only the write-it-when-unilateral convention and never states this. One sentence would close it.

**L-8 — Minor citation drift.** Entries: §1.1 source table, §6, §8.5.

Nearly every line citation in the document is exact — I spot-checked `exerciseCatalog.ts:15-51`, `:470-484`, `:660-677`, `muscleGroups.ts:14-32`, `schema.ts:86-89`, `exercises.ts:105-122`/`:107-108`/`:110`/`:115`/`:140-144`/`:155`, `constants.ts:137`, and every cited test line, all correct. Three drift by a line or two: `eligibility.ts:49-64` (the function is `:48-62`); `exercises.ts:53-58` for the ledger skip (the comment is `:49-57`, the function opens at `:58`); and `exercises.ts:110` cited for `seededExerciseId` (that line is the inline `slugToUuid` call — `seededExerciseId` is exported at `:180-182`). Cosmetic; noted only because the rest of the document's citations are reliable enough to be trusted without re-checking.

---

## 3. Gate assessment

| O-10(ii) gate requirement | Status |
| --- | --- |
| An authored list exists, per entry, before any of the ten is seeded | Yes |
| Leaf-only contributions (ADR-010) | Yes — verified mechanically, all 10 |
| ≥ 1 primary per entry, no duplicate muscle | Yes — verified mechanically, all 10 |
| Existing vocabulary and default weights only; no new group, no custom weight | Yes |
| Exactly the ten O-10(i) slugs with their shapes verbatim | Yes |
| Explicit `volumeCounting`; `strengthEstimate` omitted per §16 | Yes |
| Metadata (name, equipment, mechanics, laterality, basis) valid and convention-following | Yes — one unargued convention choice, L-7 |
| Literals match the real `SeedCatalogExercise` type | Yes |
| Implementation checklist covers deterministic and idempotent seeding, fresh and existing users, edits and deletions preserved | Substantially — with M-1, M-2, L-1, L-2, L-3 outstanding |
| Every entry's assignment settled, or escalated with a recommendation | Escalated correctly, **but not settled** — B-1 |

Nine of the ten entries are approvable exactly as written. The gate cannot close while one entry's name and full contribution list depend on an unanswered question, and while the binding checklist contains an item (M-1) that would seed a value contradicting O-10(i).

## 4. What closes this out

1. **Owner answers D-R3-1.** Recommended answer: **(a) Backward Sled Drag**, as authored. If the owner picks (b) or (c), substitute the §7 table's row into §4.2, §4.11 and the §5 literal, and update the entry's `name`; nothing else changes.
2. **Fix M-1** — correct the five/five `loadBasis` split in R-5, R-6 and §8.1 so `other-med-ball-slam` is named as carrying `loadBasis: "total"`.
3. **Fix M-2** — add `tests/unit/exerciseCatalog.test.ts:131-140` to the §8.5 test-change list.
4. **Fold in the LOWs** at the author's discretion; L-1 is the one I would not skip, since it prevents an unrelated integration failure.

None of this requires re-authoring an entry, re-opening the architecture, or a second review of the muscle assignments. Re-review scope after revision is §2, §6, §7 and §8 only.

---

REVISION REQUIRED
