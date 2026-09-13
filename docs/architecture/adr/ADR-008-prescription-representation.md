# ADR-008: Exercise prescription representation — versioned discriminated-union JSON

## Status
Accepted (2026-08-09)

## Context
Prescriptions must express `5×5` and `3×8–12` today and absorb top-set/backoff, AMRAP, per-set variation, myo-reps, percentage loading later — without either hard-coding rep schemes or building a training DSL (brief §11, §40). The representation must survive in historical snapshots for years.

## Decision
`ExercisePrescription.scheme` is a **discriminated union**, defined and validated by Zod in `src/domain`, persisted as versioned JSONB (`{v: 1, scheme}`):

- MVP variants: `fixed {sets, reps}`, `repRange {sets, minReps, maxReps}`.
- Future styles are **additive variants** (`perSet`, `fixedPlusAmrap`, …) — designed as reserved shapes in `prescription-model.md` §2 to prove the union absorbs them, but not implemented.
- Schemes are **pure data**: no expressions, conditionals, or cross-references. Anything that "computes" belongs to progression strategies or domain functions — this is the anti-DSL line.
- Strategies declare scheme compatibility (`supportsScheme`); the editor offers only valid pairs.
- Target RIR is a separate integer-band field; load prescription is a separate concern (carry-forward + optional baseline in MVP, reserved `percent1RM`/`absolute` modes later).

## Alternatives considered
- **Normalized per-set rows (`prescription_sets` table)** — relationally pure and SQL-queryable per set, but forces every scheme style into rows+flags, makes template editing multi-row transactional, and we never query prescriptions by set structure. Becomes attractive only if per-set programming turns central; migration path exists (`perSet` variant ≙ rows).
- **Columns on the prescription row (`sets`, `min_reps`, `max_reps`, `style` flag)** — the hard-coded path; every new style is a migration + nullable-column sprawl.
- **Full scheme DSL / expression language** — maximal flexibility nobody asked for; parsing, validation, versioning, and UI complexity explode (brief §40 names this exact trap).
- **Free-text prescriptions** — human-flexible, machine-useless (no completion evaluation, no progression triggers).

## Consequences
- New scheme styles: add a Zod variant + UI renderer + strategy support declarations — no migrations.
- Exhaustive `switch` on `scheme.type` gives compile-time coverage as variants grow.
- JSONB contents are opaque to SQL — accepted; no query need exists (see data-model §1 JSONB policy).
- Snapshot longevity handled by the `v` field + per-version upgrade functions on read.

## Amendment 1 (2026-09-13) — one fenced back-reference for Set Groups Stage B

**Context.** Set Groups Stage B (`set-groups-architecture-evaluation.md` §6.5, owner addendum §19 D-5)
needs a percentage-linked back-off group's load to be computed from an **earlier group of the same
scheme** — the first genuine case, since this ADR was accepted, of one field of a scheme needing to
name another.

**Decision.** This ADR's "no references between fields" line (Decision, above) is amended with exactly
one fenced exception, not a general mechanism:

- A `groups`-scheme group MAY carry `link: { ref: string; percent: number }`, where `ref` names
  another group **of the same scheme** by its stable key.
- **One hop only, no chains, no cycles:** the referenced group must itself carry no `link`. A group
  linked to a linked group is rejected outright, not resolved transitively.
- **One direction only:** `ref` must name a group that appears **earlier** in the scheme's own group
  order. No self-reference, no forward reference.
- **No cross-scheme, no cross-slot, no cross-exercise reference** — structurally impossible in any
  case, since a scheme's `groups` array only ever contains that one slot's own groups.
- **Validated entirely at the schema boundary** (`domain/schemes/setScheme.ts`'s `superRefine`, on both
  the stored and authoring shapes) — never interpreted, never evaluated as an expression. The reference
  is resolved by exactly **one pure domain function**, client-side, from `(frozen snapshot, current
  session's sets, loadStepKg)` — never a query, never server logic, never anything resembling a formula
  language over scheme fields.
- **Precedent already on record:** `prescription-model.md` §2's reserved `perSet.sets[].loadOffset`
  shape (`{type: 'percentOfTop', percent}`) already sketched a percentage-of-top load living inside a
  scheme entry; this amendment is the same shape of idea, now implemented for `groups`, with the
  reference made explicit and fenced rather than positional (`perSet`'s "top" is convention; `groups`'
  `ref` is a named key, validated to exist and to resolve to exactly one, unlinked, earlier group).

**What this does not open up.** No arbitrary dependency graph, no multi-hop resolution, no reference
between two different prescriptions or exercises, no reference that survives a group being deleted
without being explicitly cleared (the editor clears an invalidated link visibly rather than silently
retargeting it, and the schema rejects a dangling one regardless). Every other scheme variant, and
every other field of `groups` itself, remains reference-free.
