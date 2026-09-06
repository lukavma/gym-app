# ADR-011: Estimated 1RM tracker and advisory load translation — amendment of OD-06

## Status

Accepted (2026-09-05) — product-owner acceptance of owner decisions O-1…O-20 recorded in the owner-decision addendum of `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`, which is the **binding implementation specification** for this feature (its `V-n` rules, `I-n` invariants, `K-n` constants, `A-n` acceptance criteria, §14 boundaries, and §9.6 refusal list). This ADR records the architectural decision and **amends OD-06** (`open-decisions.md`), moving it out of the open list. OD-04 (charting library) remains open.

Lineage: evaluation `docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md` (2026-09-04) → adversarial review `…-architecture-review.md` (2026-09-04) → evidence research `docs/reviews/estimated-1rm-evidence-research.md` (2026-09-05) → revision (2026-09-05, corrected twice under `…-revision-verification.md` and `…-revision-verification-2.md`, the second returning `VERIFIED — ALL §9 ITEMS CLOSED`). Evidence traceability: `docs/architecture/evidence-to-design.md` row 20; registry items EVIDENCE-032…037 entered under O-17 as **provisional** entries (2026-09-06 governance correction — they have not completed the PDF/research-note intake; closure condition in the registry's "Verification pass 3"). **This decision does not depend on their final status:** every number in it is a labelled convention, every structural choice is also defended on arithmetic and on registry items EVIDENCE-014/025/029/030 that predate this feature, and the binding revision keeps every tag derived from the provisional items at `[E*]` until closure.

## Context

OD-06 (2026-08-09) parked the e1RM formula choice as a display convention for Phase 9 analytics with the recommended default "Epley (`w·(1+reps/30)`), computed on read, capped at reps ≤ 12 for display, always labeled 'estimate'; formula name stored with any displayed value context". Since then the owner asked for a post-MVP feature with two parts: an estimated-strength tracker (current estimate, historical best, trend) and a usable starting load after a repetition-scheme change. Three independent documents examined the proposal; the architecture they converged on is a pure derivation over immutable `set_logs`, computed on read, with no new execution fact, no sync entity, no persisted aggregate, no progression-engine change, and an advisory-only suggestion — consistent with `architecture-plan.md` §7 ("anything recomputable from facts is recomputed"), `data-model.md` §5 (e1RM explicitly not persisted), and ADR-007.

Constraints that shaped the decision:

- The evidence for any repetition-based 1RM equation is weak at the individual level (≈ ±10 % 1 SD, roughly three times a measured maximum's test–retest noise — EVIDENCE-034/035/036, provisional), the reps–%1RM relation is exercise-specific and individually variable (EVIDENCE-032, provisional), self-reported proximity to failure is systematically under-predicted and its error breaks upward above 12 repetitions to failure (EVIDENCE-033, provisional), and the composition `reps + reported RIR` inside a 1RM equation has never been validated (GAP-11). Nothing makes an advisory, labelled, per-exercise, within-athlete estimate unsafe; everything makes it imprecise.
- OD-06's input was plain `reps`; the feature needs `reps + reported RIR` to be meaningful at all, and that change reopens the decision rather than resolving it as continuity.
- `set_logs.is_warmup` is UI-writable only since the concurrent F-1 warm-up-set classification remediation; that remediation's own verification and commit is an external gate on Release A.
- The recommendation engine's implicit-decision path resolves a pending recommendation from the first work set; a suggested load must never enter it.

## Decision

### What is built (two releases)

- **Release A — Tracker:** `src/domain/strength/*` (pure), `src/server/strength/service.ts`, `GET /api/exercises/[id]/strength`, `/exercises/[id]/strength` page (current, best, trend, what-if), additive column `exercises.strength_estimate text not null default 'auto' check in ('auto','off')` with a one-shot reconcile setting `'off'` for the two seeded exercises whose load semantics are inverted or fabricated (assisted pull-up, farmer's carry), and the edit-form toggle.
- **Release B — Advisory starting suggestion:** after at least one block of tracker use. Two optional bundle fields, device-local freeze at session start, one batched observation query per bundle, a workout-card line with a **Use** action that fills the weight input and nothing else, hidden once a work set is logged.
- The direct-tier-only version ("last time you did N reps here you used X kg") is recorded as the **fallback cut line** for Release B if it is ever reduced. It is **not** the selected scope.

### Amendment of OD-06 (per O-9)

| OD-06 recorded default (2026-08-09) | Amended decision (2026-09-05) | Reason |
| --- | --- | --- |
| Epley `w·(1 + reps/30)` | Epley kept, with the **observed-single convention `f(1) = 1`** (Epley's raw `f(1) = 1.033` would inflate a true single by 3.3 %) | Continuity, closed-form inverse, determinism; the four classical equations are near-indistinguishable in within-athlete consistency and none is validated (EVIDENCE-036, provisional). The evaluation's "safest shape at high reps" justification is **withdrawn** — the true relation is a spline (EVIDENCE-032, provisional) |
| Input: plain `reps` | Input: **`RTF = reps + reported RIR`**, integer; missing RIR → `RTF = reps`, a flagged lower bound *on the estimate* (not on the athlete) | The feature is meaningless without effort; no reported value is altered, averaged, or inferred (B11, `progression-engine.md` §3) |
| "Capped at reps ≤ 12 for display" | **Source ceiling `RTF ≤ 12`** as an *admissibility* rule (11–12 degraded, > 12 excluded), not a display cap | EVIDENCE-033's eightfold error break above 12 repetitions and EVIDENCE-036's accuracy loss beyond ~10 (both provisional). The number 12 is unchanged from OD-06; its role changes from cosmetic to structural |
| — | **Target ceiling `RTF ≤ 15`** for a translated load (13–15 flagged as extended effort), refuse above | New. A high-RTF *target* divides by a too-large multiplier and errs light (conservative), the opposite sign of a high-RTF *source*; without it a 12-rep target with a 0–2 RIR band could never receive a suggestion |
| "Always labeled estimate" | Every value shown on the exercise's `loadStepKg` grid with a **required ±10 % band**; never a bare 1 kg figure | EVIDENCE-034/035/036 (provisional) — a 1 kg display is a precision claim the evidence does not license |
| "Formula name stored with any displayed value context" | `algorithm { id: "e1rm-epley-rir", version: 1, formula: "epley" }` on every DTO; version bumps on any behaviour change; historical charts recompute under the current version | Same intent, made concrete |
| Phase 9 timing | Tracker ships as Release A ahead of the Phase 9 dashboard; Phase 9's e1RM trend item is satisfied by it | The strength page is a separate read-only surface (like volume); OD-04 stays open — the trend is an inline SVG sparkline, not a charting-library decision |

### Structural rules (binding detail in the revision)

- **Per-exercise, within-athlete series only.** Observations key on `exercises.id`; never merged by name, muscle, or pattern. Eligible equipment: barbell, dumbbell, cable, machine ("as logged"); bodyweight and other excluded; `strength_estimate = 'off'` can only disable.
- **One observation per completed non-discarded session**, derived from load groups: modal group (most sets; ties → heaviest load), heavier groups admitted when within 1.20 × the modal group's e1RM, sub-modal groups excluded; group e1RM = lower median of the first three sets; the session value is the maximum admitted group e1RM (`TOP_SET_GOVERNS` when it is not the modal group). Set-count invariant beyond three sets.
- **Windows are calendar days in the account timezone** and are data-freshness rules (90 / 21 / 42), never detraining claims (EVIDENCE-037, provisional; its maintenance-dose figures are narrative context and are consumed by nothing here).
- **A named noise constant (`NOISE_SD_PCT = 10`)** from which every disagreement threshold derives (20 / 30 / 30 / 20 %); `BEST_UNCONFIRMED_PCT = 10`.
- **Suggestion ranking**: admitted candidate groups ranked by rep distance to `T = decisionChosen?.reps ?? schemeDefaultReps(scheme)` (the prefill's own rule), directional limits 4 load-down / 3 load-up, combined by a lower median of translated loads; direct evidence caps the answer upward; global cap 1.10 × heaviest recent working load; floor to `loadStepKg`; refusal on inconsistent evidence (no unique consistent majority of ≥ 3), on any pending recommendation, on a rep-compatible carry-forward, on deload sessions, beyond the distance limits, and outside target RTF 3–15.
- **Boundaries**: `recommendations`, `PrescriptionSnapshot`, the sync schema, the outbox vocabulary, and progression behaviour are unchanged; the single permitted touch in `src/domain/progression/*` is the additive `resolveCarryForwardCandidate` refactor of `carryForward.ts` with `resolveCarryForwardLoadKg` kept as a thin wrapper.

## Consequences

- e1RM appears in `evidence-to-design.md` as row 20; row 18's tier ("Convention") stands and is superseded in detail. Registry items EVIDENCE-032…037 exist as **provisional** entries (cited only with that marker; a temporary reverse-flow exception is recorded at `evidence-to-design.md` §3 rule 4 with its closure condition); the Fitbod-affiliated preprint is **not** promoted and may not be cited by any design document. The narrative-review maintenance-dose figures behind EVIDENCE-037 are context only and are consumed by nothing in this decision.
- OD-06 leaves `open-decisions.md`. OD-04 stays open; Phase 9's "resolve OD-06 first" precondition is discharged by this ADR (`implementation-plan.md` updated).
- Copy may never say "1RM" or "max" without "estimated", never "PR", never "recommendation" for a suggestion, never a detraining explanation, never a benefit claim (GAP-12), never "research shows" for anything the revision tags `[E*]`.
- Implementation remains gated on: the F-1 remediation's verification and commit; `evidence-to-design.md` row 20 (done); this ADR (done); the owner addendum (done). Release B is additionally gated on one block of Release A use and on the fire-rate prototype in the revision's §18 step 4(c).
- Deferred with triggers (revision §19): prefill promotion (D-1), recording "used suggestion" as a fact (D-2), `load_semantics` / bodyweight-inclusive estimates (D-3), `percent-1rm` (D-5), client-side computation (D-7), reconciliation with PI-005's measurement profile (D-11), recalibration of the group-position, plausibility, and refusal constants after one block of data (D-12).
