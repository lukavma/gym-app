# Prescription Model

Status: Final for MVP implementation. Companions: `domain-model.md` §4/§6, `progression-engine.md`, `adr/ADR-008-prescription-representation.md`.

Defines how "what the athlete is expected to do" is represented: set/rep schemes, target RIR, load prescription, and the extensibility boundary. Design goal: representable middle ground between hard-coding `5×5` and inventing a training DSL.

---

## 1. Representation decision

A prescription's `scheme` is a **versioned discriminated union**, validated by Zod, persisted as JSON (`jsonb`):

- Discriminated unions are native to TypeScript: exhaustive `switch` on `type` gives compile-time coverage checks in the UI renderer, the progression strategies, and the completion evaluator.
- New scheme styles are **additive variants**, not schema migrations.
- It is data, not language: no expressions, no conditionals, no references between fields. The moment a scheme needs to "compute" something, that logic belongs in a progression strategy or a domain function, not in the scheme. This is the anti-DSL boundary.

Rejected alternatives (detail in ADR-008): normalized per-set rows (heavy for MVP, pushes polymorphism into SQL), free-text (unparseable), full DSL (speculative complexity, §40 of the task brief).

---

## 2. Scheme variants

### MVP variants

```ts
// schemaVersion: 1
type SetScheme = FixedScheme | RepRangeScheme;

interface FixedScheme {
  type: 'fixed';
  sets: number;          // int 1–20
  reps: number;          // int 1–100
}
// renders "5 × 5"

interface RepRangeScheme {
  type: 'repRange';
  sets: number;          // int 1–20
  minReps: number;       // int 1–100
  maxReps: number;       // int ≥ minReps
}
// renders "3 × 8–12"
```

Every persisted scheme is wrapped with its schema version: `{ v: 1, scheme: {...} }`. Version bumps only on breaking shape changes; readers keep a small upgrade function per version (expected to be rare — variants are additive).

### Athletic variants (measurement profiles, Release 1 schema / Release 2 editor)

Two additive variants for the non-`load_reps` measurement profiles (`athletic-measurement-profiles-architecture-evaluation.md` §9.1):

```ts
interface DistanceRoundsScheme {
  type: 'distanceRounds';
  sets: number;      // int 1–20
  distanceM: number; // > 0, ≤ 99999.99, multiple of 0.01
}
// renders "4 × 20 m"

interface DurationRoundsScheme {
  type: 'durationRounds';
  sets: number;      // int 1–20
  durationS: number; // > 0, ≤ 86400, multiple of 0.01
}
// renders "3 × 60 s"
```

`SCHEME_ENVELOPE_VERSION` stays `1` — additive variants do not bump it. **Schema-accepted in Release 1, offered in the editor starting Release 2**: `setSchemeSchema` and `formatScheme` ship in Release 1 so the shared domain module typechecks and a hand-built non-`load_reps` prescription (created through the API) is representable end to end, but the prescription editor does not offer either variant until Release 2.

### Set Groups (Stage A, `load_reps` only — `set-groups-architecture-evaluation.md`)

An additive variant for **ordered groups within one slot** (a top set plus back-offs, expressed generically — no exercise-specific logic):

```ts
interface SetGroup {
  key: string;             // stable, generated once at authoring, never re-derived; unique within the scheme
  label: string;           // display only, 1–24 chars trimmed ("Top", "Back-off")
  sets: { min: number; max: number };   // ints, 1 ≤ min ≤ max ≤ 20 (fixed count ⇔ min === max)
  reps: { min: number; max: number };   // ints, 1 ≤ min ≤ max ≤ 100, span ≤ 30
  targetRir?: RirBand;      // overrides the slot band for this group only
  baselineLoadKg?: number;  // overrides the slot baseline for this group only
  link?: { ref: string; percent: number };  // Stage B — see below
}
interface GroupsScheme { type: 'groups'; groups: SetGroup[]; }   // 1–4 groups; Σ sets.max ≤ 20
// renders "Top 1 × 2 · Back-off 2–3 × 6–8"
```

**Stage B — percentage-linked group loads (`set-groups-architecture-evaluation.md` §6, owner addendum
§19 D-4/D-5).** A group's optional `link` names an earlier, itself-**unlinked** group of the same slot
plus a user-entered `percent` (integer 10–100, no default): the linked group's first-set proposal is
`roundToStepKg(referenceLoadKg × percent / 100, loadStepKg)` (existing nearest-step, half-up rounding,
unmodified), where `referenceLoadKg` is the **highest actually-logged non-warm-up load** attributed to
the reference group in the **current session** — V1 is performed-basis only, per §19 D-4, which narrows
the evaluation's reviewed two-basis (`performed`/`prescribed`) proposal to this one; no `basis` field
exists on the shipped shape because there is only ever one legal value. Later sets in the linked group
copy the athlete's own previous logged load in that group through the pre-existing copy-forward rule —
the link only ever supplies the first one. No reference work set yet falls back to the linked group's
own carry-forward, then `baselineLoadKg`, then empty (the identical §4 chain every other group already
follows), with a visible UI explanation. A manual override never rewrites the saved percentage. A group
with a `link` must resolve to `progression.strategyId === 'manual'` (checked by
`checkPrescriptionCompatibility`; the editor never offers another strategy for it) — a linked group
therefore never competes with an independent recommendation.

**Reconciling with the earlier sketch:** §6.5 originally proposed generalising `baselineLoadKg` into a
`GroupLoad` union (`{mode: 'carryForward', baselineKg?}` | `{mode: 'percentOfGroup', ref, percent,
basis}`). Stage A never adopted that union for `baselineLoadKg` — it shipped it as the flat field shown
above. Stage B follows the same precedent: `link` is a second flat, additive, optional field, not a
`load.mode` wrapper around both. `baselineLoadKg` keeps its existing meaning unchanged and continues to
serve as the linked group's own fallback baseline exactly as the evaluation intended, just addressed
through the existing field rather than a `carryForward` union member.

The link is a **stable-key back-reference between fields of the same scheme** — the one fenced
exception ADR-008 draws to "no references between fields" (§1); it is resolved by one pure client
function of `(frozen snapshot, current session's sets, loadStepKg)`, never by the server at logging
time, and lives inside `scheme.groups[]` so Stage A's existing snapshot freeze (ADR-007) already
covers it with no separate freezing mechanism. Authoring a link to a group created in the **same** save
(no server-assigned key yet) addresses that group by its positional index in the submitted array,
resolved onto the real key exactly once `assignGroupKeys` has run — the identical pattern
`progression.groupOverridesByIndex` already established for per-group progression overrides (§5.3).

No top-level `sets` field, deliberately: every reader that switches on `scheme.sets` for the other four
variants must handle `groups` explicitly instead of falling through (a compile error, not a runtime
surprise). A single-group scheme is how a set-count **range** on an ordinary slot ("2–3 × 5") becomes
representable, without a fifth ranged variant.

Each group **projects** to the existing `fixed`/`repRange` shape the unmodified `load-progression`/
`rep-progression` strategies already understand (fixed reps → `fixed`; a rep range → `repRange`, `sets =
group.sets.min`); a work set carries an additive, nullable `groupKey` (`set_logs.group_key`) recording
which group it was logged against — `null` on an ungrouped slot, and also `null` for a work set inside a
grouped session the athlete hasn't attributed (excluded from every group's evaluation, still counted for
volume/e1RM). Attribution is a stored fact, never an ordinal partition of `set_number` — the failure modes
of ordinal partitioning (a skipped top set, a mid-list deletion) are exactly what a stable key exists to
avoid. Independent per-group progression, the evaluation window (the first `sets.min` recorded sets, in
order — never the best-performing ones), and the full per-group storage/sync-contract shape are specified
in `progression-engine.md` and `set-groups-architecture-evaluation.md`. Both stages are implemented:
independent per-group progression (Stage A) and the percentage-linked back-off (Stage B, above) — the
latter as the flat, additive `link` field on the group entry itself, not a `load.mode` wrapper.

### Reserved (post-MVP) variants — designed, not implemented

These exist to prove the union absorbs known future needs without rework. Do **not** implement in MVP.

```ts
interface PerSetScheme {        // a different prescription for each individual set
  type: 'perSet';
  sets: Array<{
    tag?: 'top' | 'backoff' | 'work';
    reps: { type: 'fixed'; reps: number } | { type: 'range'; min: number; max: number } | { type: 'amrap' };
    loadOffset?: { type: 'percentOfTop'; percent: number } | { type: 'absoluteKg'; deltaKg: number };
  }>;
}

interface AmrapScheme {         // straight sets, last set AMRAP (progression trigger source)
  type: 'fixedPlusAmrap';
  sets: number; reps: number;   // fixed sets, final set AMRAP with `reps` as minimum
}
```

`perSet` and `groups` (above) are **complements, not rivals** (`set-groups-architecture-evaluation.md`
§4.1/M-4): `groups` covers ordered *runs* of like sets with a range and stays reserved for genuinely
per-set variation that a range can't express — `perSet` enumerates every set individually (no set-count
range is representable) and its identity is positional (the same skipped/deleted-set ambiguity a stored
group key exists to avoid). `perSet` stays reserved, unimplemented, and is not superseded by `groups`.

Myo-reps, rest-pause, drop sets, true intra-set clusters: each is one more variant with its own small shape when a concrete need exists — none is introduced implicitly by Set Groups (a "cluster heavy double" is read as a named top group of one set, nothing more). Percentage-based loading is **not** a scheme variant — it is a load prescription mode (§4), orthogonal to set/rep structure, except for the one fenced back-reference Set Groups Stage B implements (§4).

### Compatibility rule

Progression strategies declare which scheme types they support (`supportsScheme(type)`). The prescription editor only offers compatible strategies; the engine returns `action: 'none'` with reason `UNSUPPORTED_SCHEME` if it ever encounters a mismatch (defensive, should be unreachable).

| | `fixed` | `repRange` | `perSet` (future) |
|---|---|---|---|
| `load-progression` | ✅ | ✅ (progress when all sets ≥ minReps… config) | later |
| `rep-progression` | ✅ (cap required in config) | ✅ (cap = maxReps) | later |
| `manual` | ✅ | ✅ | ✅ |

**Profile × scheme × strategy compatibility** (measurement profiles; `athletic-measurement-profiles-architecture-evaluation.md` §9.2). `profileSupportsScheme` / `strategySupportsProfile` (`src/domain/measurement/compatibility.ts`) gate this independently of the scheme-only table above; `checkPrescriptionCompatibility` takes the profile as a third argument and reports both issue kinds.

| Profile | `fixed` | `repRange` | `distanceRounds` | `durationRounds` | `load-progression` | `rep-progression` | `manual` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `load_reps` | ✓ | ✓ | – | – | ✓ | ✓ | ✓ |
| `reps` | ✓ | ✓ | – | – | – | – (v1) | ✓ |
| `load_distance` | – | – | ✓ | – | – | – | ✓ |
| `distance_time` | – | – | ✓ | – | – | – | ✓ |
| `duration` | – | – | – | ✓ | – | – | ✓ |
| `load_duration` | – | – | – | ✓ | – | – | ✓ |

The `reps` profile is **manual-only for progression in v1**: every strategy's output is persisted through `inputsSummarySchema` / `performedSetSchema`, which require a non-nullable `weightKg`; a `reps`-profile set has `weight_kg = null`, so rep-progression for `reps` is deferred to a later release that is allowed to widen those schemas.

---

## 3. Target RIR

`targetRir` is always an **integer band**, never a scalar:

```ts
interface RirBand { min: number; max: number }   // ints, 0 ≤ min ≤ max ≤ 10
```

- Display: `RIR 0–2` (band), or `RIR 2` when min = max — but even a collapsed band is *interpreted* with tolerance by strategies (see `progression-engine.md` §RIR).
- Default for hypertrophy-goal templates: `{min: 0, max: 2}` — a labeled heuristic (boundaries B10, informed by EVIDENCE-029 which tested the 1–2 RIR neighborhood; the band is deliberately wider than any claimed precision).
- Optional. Prescriptions without a target RIR are fully supported; logging RIR remains optional regardless.
- Deload/week modifiers may shift the band (`targetRirShift`), clamped to [0, 10].

---

## 4. Load prescription

MVP load model: **carry-forward with optional baseline.**

```text
prefill load for exercise E in today's workout =
  1. chosen values of latest recommendation Decision for (E, current block)   — if any
  2. else last completed non-deload session's first work-set load for E      — if any
  3. else prescription.baselineLoadKg                                        — if set
  4. else empty (user types the first load)
```

- There is deliberately **no persisted "current working weight"** on the prescription — the latest Decision (a source-of-truth user choice) plus history fully determines it. This removes a whole class of state-drift bugs.
- `loadStepKg` on the exercise defines rounding for recommendations and the +/- steppers (barbell 2.5, dumbbell 2.0, machine 5.0 defaults; per-exercise editable).
- Deload `loadMultiplier` applies to the prefill at effective-prescription time, rounded to `loadStepKg`; snapshotted like everything else.

Post-MVP load modes (reserved, orthogonal to scheme):

```ts
type LoadPrescription =
  | { mode: 'carryForward'; baselineKg?: number }        // MVP — the only implemented mode
  | { mode: 'percent1RM'; percent: number; ref: 'e1RM' } // future: needs an e1RM definition first (open-decisions.md)
  | { mode: 'absolute'; kg: number };                    // future: fixed programming
```

MVP persists only `baselineLoadKg`; introducing `LoadPrescription` later is an additive JSON field on the prescription.

**Set Groups Stage A** generalises this per group: a group's own optional `baselineLoadKg` (§2) is step 3
of the identical chain, read *before* the slot's own baseline — the group's carry-forward candidates are
its own history plus, for the **first** group only, an existing ungrouped slot's pre-conversion history
(the C-1/D-6 bridge; every other group starts with no automatic legacy attribution).

**Set Groups Stage B** adds one more prefill source, spliced in ahead of the recommendation/decision
step for a group carrying a `link` (§2): its first-set proposal is the reference group's highest
logged work-set load this session × the user-entered percent, rounded to `loadStepKg` — never the
reference's *prescribed* value (V1 is performed-basis only, §19 D-4) and never multiplied by
`loadMultiplier` a second time (the logged figure already reflects whatever was actually lifted, deload
included). This is the one fenced exception to "no references between fields" (§1) — validated at the
schema boundary, non-transitive, one hop only.

---

## 5. Effective prescription & snapshot flow

```text
ExercisePrescription (template, mutable)
        │  ⊕ plannedProgression[weekIndex]     (post-MVP content)
        │  ⊕ deload / WeekOverride modifiers   (setMultiplier → ceil? no: floor, min 1 set; targetRirShift; loadMultiplier)
        │  ⊕ working targets (Decision / history / baseline)
        ▼
EffectivePrescription (pure derivation, never persisted)
        ▼  session start
PrescriptionSnapshot (frozen into SessionExercise.prescription)
```

Rules:
- `setMultiplier` rounds **down**, minimum 1 set (0.5 × 5 sets → 2 sets). Heuristic default, editable per block.
- Snapshot contains the *modified* scheme plus `appliedModifiers` so history is self-explaining (e.g. "5 sets → 2 sets because 0.5× deload applied").
- Ad-hoc exercises added mid-session get either `prescription: null` (free logging) or a minimal inline scheme chosen in one tap (e.g. `3 × 8–12` quick presets).

---

## 6. Validation invariants

- `fixed`: 1 ≤ sets ≤ 20, 1 ≤ reps ≤ 100.
- `repRange`: additionally minReps ≤ maxReps, and (maxReps − minReps) ≤ 30 (sanity).
- `RirBand`: ints, 0 ≤ min ≤ max ≤ 10.
- `baselineLoadKg`: 0 ≤ x ≤ 1000, multiple of 0.25.
- Scheme JSON failing validation is rejected at the API boundary (400) and impossible to produce from the UI. Snapshots are validated on write; on read they are trusted (they were valid when written; version upgraders handle old shapes).

**Other prescription fields by profile** (`athletic-measurement-profiles-architecture-evaluation.md` §9.3): `O` = optional and accepted, `rejected` = a `400 incompatible_prescription` issue.

| Field | `load_reps` | `reps` | `load_distance` | `distance_time` | `duration` | `load_duration` |
| --- | --- | --- | --- | --- | --- | --- |
| `targetRir` | O | O | rejected | rejected | rejected | rejected |
| `baselineLoadKg` | O | rejected | O | rejected | rejected | O |
| `restSeconds` | O | O | O | O | O | O |
| `notes` | O | O | O | O | O | O |

`notes` is profile-independent and rejected by nothing. Since PI-018 it also reaches the frozen `PrescriptionSnapshot` as `prescriptionNotes` and is displayed read-only on the workout card; the row exists so this matrix reads as complete rather than as silence about a field that now travels with the session.

**Deload semantics for the athletic variants, stated explicitly** (§9.4): `setMultiplier` applies to `sets` of all four scheme types identically; `loadMultiplier` applies to `prefill.loadKg` where the profile has one; `targetRirShift` only where a target-RIR band exists. **Nothing in v1 reduces `distanceM` or `durationS`** — a deload week on a distance or duration scheme is a sets-and-load deload only, with `appliedModifiers` recording the full modifier set so history stays unambiguous.

---

## 7. Extensibility boundary (what this model refuses to do)

- No conditional logic in schemes ("if last week was X do Y") — that is strategy territory.
- No cross-exercise references ("same weight as squat") — out of scope entirely.
- No plate-math/equipment inventory modeling in MVP (`loadStepKg` is the entire concession).
- No per-set target RIR in MVP. Set Groups Stage A relaxes "no per-set target" to **no per-group** — a group's `targetRir` overrides the slot band for that group only (§2); the `perSet` variant remains the only path to a genuinely per-set target, and stays reserved.
- No tempo/ROM prescription fields in MVP: the corpus treats tempo as a broad permissive range (EVIDENCE-021) and technique/ROM guidance as thin (EVIDENCE-022/026); free-text `notes` carries cues. Adding structured fields later is additive.
