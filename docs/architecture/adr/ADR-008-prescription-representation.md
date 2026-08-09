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
