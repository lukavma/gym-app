# ADR-007: Historical integrity — snapshot-on-use, stable identities, current-convention volume

## Status
Accepted (2026-08-09)

## Context
Templates, prescriptions, exercises, contribution weights, strategies, and presets are all mutable — yet a logged session from last year must keep meaning exactly what it meant. Blanket answers (version every table; or event-source everything) cost far more than this app's needs.

## Decision
Three mechanisms, chosen per data class:

1. **Snapshot-on-use** for everything a session *executed against*: at workout start, each exercise slot freezes a `PrescriptionSnapshot` JSONB (scheme post-modifiers, target RIR, strategy id+version+config+classification, applied week/deload modifiers, exercise name, prefill) into `session_exercises.prescription`; the session freezes `template_name`, `week_index`, `is_deload`. Template/block FKs on sessions are lineage-only (`SET NULL`) — interpretation never needs them. Recommendations likewise freeze config + inputs.
2. **Stable identity + archive-only** for exercises: history references `exercise_id` live; renames are safe (same movement), repurposing is forbidden by convention, deletion with history is impossible (`RESTRICT`) — archive instead. No name snapshots needed beyond the one in the prescription snapshot.
3. **Current-convention derivation** for muscle-contribution weights: per-muscle volume is an *interpretation* of immutable SetLogs, recomputed under the current weights for all time. Uniform convention keeps week-to-week trends comparable — snapshotting weights would permanently mix counting conventions after any edit, corrupting the comparison volume exists for. Edits are flagged in UI as re-interpreting history; an additive as-of history table remains possible later.

No definition-version tables. No event sourcing. No soft-delete on facts.

## Alternatives considered
- **Versioned definition tables (template_versions etc.)** — SQL-queryable lineage, but doubles the planning schema and write paths for a query ("sessions on template v3") the product never asks; snapshots answer the real question ("what was prescribed *that day*") directly.
- **Event sourcing** — perfect audit, wildly disproportionate machinery (projections, replay, upcasting) for a single-user logger.
- **FK-to-mutable-rows without snapshots** — the failure mode this ADR exists to prevent: editing `5×5 → 4×8` would silently rewrite every historical session's meaning.
- **Snapshot contribution weights per session** — superficially "more historical", actually worse (mixed conventions across weeks); rejected with rationale in `volume-model.md` §3.

## Consequences
- History reads are self-contained (no joins to definitions needed to render a past session).
- Snapshot JSONB shapes need versioned Zod schemas with upgrade functions (cheap; shapes change rarely).
- "Bulk-fix a typo in every historical prescription" is deliberately hard — correct behavior for records.
- Contribution-weight edits change derived volume everywhere, by design and with UI notice.
