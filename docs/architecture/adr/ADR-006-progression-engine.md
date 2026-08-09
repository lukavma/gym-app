# ADR-006: Progression architecture — versioned pure-strategy registry + persisted recommendation records

## Status
Accepted (2026-08-09)

## Context
Progression intelligence is the product's core value, but the science establishes only that *multiple progression strategies are viable* (EVIDENCE-031) — no specific trigger/increment is validated (boundaries B9, GAP-03). Requirements: deterministic, explainable, overridable, testable without UI/DB/network, extensible to new strategies, honest about evidence status.

## Decision
- **Strategies are code**: a registry of versioned pure functions (`id`, `version`, `configSchema`, `evaluate(ctx, config) → draft`) in `src/domain/progression`. MVP ships `load-progression`, `rep-progression`, `manual`.
- **Configuration is data**: per-prescription Zod-validated JSON (thresholds, increments, missing-RIR policy), user-editable, carrying a `classification` (`heuristic` for shipped defaults, `user_defined` once tuned; `evidence_supported` unreachable for concrete triggers by design).
- **Results are records**: every evaluation persists a self-describing `Recommendation` (strategy id+version, config snapshot, inputs summary, action/target, ordered reason codes, confidence label) with a one-time-append user **Decision** (accepted/modified/rejected, chosen values, explicit or implicit-via-first-set).
- Recommendations **never mutate the plan**; the latest Decision is the next session's working target. RIR is consumed only through integer-band checks with explicit `unknown` handling (`progression-engine.md` §3).

## Alternatives considered
- **Rules engine / DB-stored rule definitions** — user-authored arbitrary rules aren't a requirement; interpreting rule-data at runtime destroys compile-time exhaustiveness and trivial unit testing. Config-on-code-strategies covers real tuning needs.
- **Auto-apply progressions (mutate prescription on success)** — simpler UX plumbing but violates "recommend, don't rewrite", loses override telemetry, and makes history reconstruction harder.
- **Store only the decision, not the recommendation** — loses explainability audit and the recommended-vs-chosen longitudinal signal that future personalization needs.
- **ML/statistical models** — no evidence basis, not explainable, explicitly out of scope (brief §35).

## Consequences
- Engine is unit-testable with plain fixtures; the §37 test matrix runs in milliseconds.
- New strategies are additive registry entries; behavior changes require a version bump (enforced by review convention + changelog in the strategy file).
- Old strategy code is not retained; historical records remain interpretable because they freeze config + inputs + reasons (determinism claims are per-version).
- Supersede bookkeeping (one pending rec per exercise/block) is the small price of persistence; enforced by partial unique index.
