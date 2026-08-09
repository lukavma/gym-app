# MVP Scope

Status: Accepted (2026-08-09)
Role: the binding cut-line for the first shippable version. If a feature is not in §1, the coding agent must not build it in Phases 0–8 — even if a sibling document describes its future shape. Phase mapping lives in `implementation-plan.md`.

Guiding rule: the MVP is **a programmable training system with logging and progression intelligence** — not an analytics product, not a coaching platform. Everything in the MVP serves one loop: *plan a block → see today's targets → log sets with near-zero friction (offline-safe) → receive an explainable recommendation → decide → repeat*.

---

## 1. MVP (must ship)

Each feature carries one acceptance criterion — the test the coding agent must be able to demonstrate before calling the feature done. Detailed behavior is specified in the referenced documents; the criterion here is the bar, not the full spec.

| # | Feature | Acceptance criterion | Spec |
|---|---------|----------------------|------|
| F1 | **Single-account auth.** First-run setup creates the only account; login with email+password; 30-day rolling session; DB-backed login throttling. | With an empty `users` table the app offers setup; once the account exists, no registration path is reachable and a wrong-password burst triggers lockout. A weekly-used session never re-prompts for login inside 30 days. | ADR-004 |
| F2 | **Exercise library.** Seeded catalog + user-created exercises; per-exercise muscle contributions (primary 1.0 / secondary 0.5 defaults, editable); `loadStepKg`; optional `baselineLoadKg`; archive (no delete with history). | Creating a custom exercise with two muscle contributions takes under a minute on a phone; archiving hides it from all pickers while every historical session still renders it; hard delete is refused once a set references it. | domain-model §3 |
| F3 | **Programs & templates.** Programs containing ordered workout templates; prescriptions with `fixed` and `repRange` schemes, target-RIR band, progression strategy + config per exercise slot. | A full push/pull/legs program (6 templates) can be built entirely in the UI; an automated test proves that editing a template after a session was logged changes nothing in that session's stored content or rendering. | domain-model §4, prescription-model |
| F4 | **Training blocks.** Start a block from a program (goal, planned weeks, weekday schedule, optional scheduled deload); at most one active; derived current week; manual week overrides (e.g., unplanned deload); complete/abandon. | The block screen shows the correct derived week index for any date per the `floor((date−startDate)/7)+1` rule, and a deload week visibly modifies Today's targets (sets/load/RIR per the block's deload config). | domain-model §5–6 |
| F5 | **Today & workout execution.** Today shows the next scheduled workout with effective prescription and prefilled working targets; start/resume session; log set (weight, reps, optional RIR); edit/delete a set; add an unplanned exercise; skip an exercise; session notes; complete/abandon. | From an open session, confirming a correctly prefilled set is at most 3 taps; an in-progress session survives page refresh and full browser relaunch with zero lost sets. | domain-model §7, pwa-offline-strategy |
| F6 | **Offline-safe logging (outbox).** Active session is local-first in IndexedDB from the first implementation phase that logs sets; idempotent outbox flush; single-in-progress enforcement with takeover UX; unsyncable ops surfaced, never dropped. | A complete workout performed in airplane mode — including app kill and relaunch mid-session — appears fully and exactly once in Postgres after connectivity returns (Playwright-scripted; plus the sync test list in pwa-offline-strategy §12). | ADR-005, pwa-offline-strategy |
| F7 | **Progression engine v1.** Strategies `load-progression`, `rep-progression`, `manual`; deterministic evaluation on session completion; persisted recommendations with reason codes + confidence; accept / modify / reject, plus implicit accept via first logged work set; supersede on relevant edits while pending. | The §9 unit-test matrix in progression-engine.md passes; every visible recommendation shows at least one plain-language reason; rejecting a recommendation provably leaves prescription, template, and next targets unchanged. | ADR-006, progression-engine |
| F8 | **Weekly volume view.** Per-muscle effective fractional sets for the current and previous 4 weeks, compared against the active volume preset (RP seeded as a labeled heuristic); deload weeks badged; strictly informational tone. | Displayed numbers exactly match a hand-computed fixture (mixed primary/secondary contributions, 0.5 weighting); landmark lines carry their "coaching heuristic" label; no UI element demands or auto-applies volume changes. | volume-model |
| F9 | **Session history.** Chronological list + read-only detail rendered purely from session snapshots; minor post-completion set corrections (weight/reps/RIR). | A historical session renders completely correct after its source template is deleted and its exercise archived; correcting a set's weight afterwards does not resurrect or alter any decided recommendation. | ADR-007 |
| F10 | **Bodyweight & recovery quick logs.** Daily-grain bodyweight entries; optional recovery check-in (sleep quality, soreness, motivation). Collected, displayed as simple lists — **not consumed by the engine** (EVIDENCE-027). | Logging bodyweight is ≤2 interactions from Today; skipping recovery entry never blocks any flow; a code-level check confirms no engine input path reads these tables. | domain-model §7 |
| F11 | **Installable PWA shell.** Manifest, icons, Serwist-precached shell; Today + workout routes open offline from cache. | The app installs to the iOS home screen and, launched cold in airplane mode, reaches Today with the cached workout bundle. | ADR-005 |

Cross-cutting MVP constraints: kg only (`open-decisions.md` OD-01); phone-first layouts for every MVP screen; definitions editable online only; all times/dates handled per data-model conventions.

## 2. Post-MVP (planned, deliberately deferred)

Ordered roughly by expected value. Nothing here may leak into Phases 0–8 "because it was easy".

1. **Analytics dashboard** — e1RM trends (Epley, computed on read, labeled estimate), tonnage, per-muscle volume trend charts, recommendation acceptance stats. (Phases 9–10; charting choice in OD-04.)
2. **Richer schemes** — `perSet`, `fixedPlusAmrap` (top-set/backoff, AMRAP), `percent1RM`/`absolute` load modes. Reserved shapes already specified in prescription-model §2.
3. **Additional strategy configs as shipped presets** — e.g., double progression preset (mechanism already exists as `rep-progression` with `onCapReached: 'suggest_load_increase'`; MVP ships it off by default).
4. **Multiple named volume presets + switching** — MVP ships the seeded RP preset with editable landmark values; creating/comparing whole presets comes later.
5. **JSON data export + automated `pg_dump` workflow** (Phase 10; Flexible Server automated backups + PITR cover the interim).
6. **Quality-of-life during workouts** — rest timer (OD-05), plate calculator, warm-up set suggestions.
7. **Passkey login** (OD-10), **Web Push reminders** (OD-08).
8. **Exercise merge/dedupe tool** (OD-11); **as-of contribution-weight history** (OD-03).
9. **Autoregulated deloads and readiness-informed recommendations** — explicitly evidence-gated (GAP-05, EVIDENCE-027); recovery data collected from MVP day one so a future feature has history to work with.

## 3. Explicitly out of scope (not "later" — "no")

| Item | Why refused |
|---|---|
| Multi-user, coaching, sharing, social features | Single-user product definition; auth and schema deliberately assume one human (ADR-004). |
| AI/ML/LLM-generated programming or predictions | No evidence basis; violates determinism + explainability requirements (brief §35, ADR-006). |
| Nutrition, supplementation, diet tracking | Different product. |
| Cardio/endurance programming | Out of product definition; a session note suffices. |
| Wearable / HealthKit / velocity-tracking integrations | Hardware surface with no evidence-backed consumer in this system. |
| Tempo and ROM prescription fields | Evidence says preference-level (EVIDENCE-021/022, C2); prescription-model §7 refuses the fields to keep schemes small. |
| Automatic MEV/MRV calculators or auto-adjusted volume targets | Blocked by GAP-01: no evidence supports computing per-muscle landmarks. Landmarks stay editable reference lines. |
| Silent RIR "correction"/calibration algorithms | B11 forbids treating reported RIR as correctable signal; bands + confidence degradation only. |
| Native app-store builds, Capacitor wrappers | PWA is the requirement; ADR-005 rejected wrappers. |
| Real-time multi-device sync, CRDTs, sync engines | Single-user, single-active-device model; LWW + takeover is the whole story (ADR-005). |
| Gamification, streaks, badges | Motivation model of this product is the training data itself. |
| Public API / third-party integrations | No consumer exists. |

## 4. MVP ≠ small forever

The MVP cut is aggressive because the architecture already reserves the growth paths (scheme variants, strategy registry, preset vocabulary, recovery slot in `EvaluationContext`). Deferring a feature costs a phase later — it does not cost a redesign. That asymmetry is the reason to keep the first version small.
