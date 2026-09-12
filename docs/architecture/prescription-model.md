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

### Reserved (post-MVP) variants — designed, not implemented

These exist to prove the union absorbs known future needs without rework. Do **not** implement in MVP.

```ts
interface PerSetScheme {        // different prescription per set; also covers top set + backoffs
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

Myo-reps, rest-pause, drop sets, clusters: each is one more variant with its own small shape when a concrete need exists. Percentage-based loading is **not** a scheme variant — it is a load prescription mode (§4), orthogonal to set/rep structure.

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
- No per-set target RIR in MVP (band applies to the exercise slot; `perSet` variant can carry per-set targets later).
- No tempo/ROM prescription fields in MVP: the corpus treats tempo as a broad permissive range (EVIDENCE-021) and technique/ROM guidance as thin (EVIDENCE-022/026); free-text `notes` carries cues. Adding structured fields later is additive.
