# Estimated 1RM Tracker & Load Translation — Independent Architecture & Algorithm Evaluation

Date: 2026-09-04
Role: independent evaluation of the proposed post-MVP feature "Estimated 1RM Tracker and Load Translation" against the actual repository. Evaluation only — no source, schema, migration, architecture-document, evidence-file, or backlog changes were made.
Evaluated repository state: `main` @ `7d6bc6c` (`feat: add reusable warm-up routines`), plus the pre-existing uncommitted working-tree changes (`CLAUDE.md` modified, `HANDOFF.md` deleted, `docs/input/product-ideas.md` modified; untracked `.claude/skills/`, `HANDOFF(depracted).md`, `docs/reviews/warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md`) — all untouched.
Scope of change: this file only. The local Docker PostgreSQL was not running and was not started; every fact below was verified in source and documents, not in a database. Production was not accessed.
Related existing decisions: OD-06 (e1RM formula, `docs/architecture/open-decisions.md`), OD-04 (chart library), `evidence-to-design.md` row 18 (e1RM is a convention with no corpus backing), `mvp-scope.md` §2 item 1 (Phase 9 e1RM trends), PI-001 (`docs/input/product-ideas.md`).

Identifier conventions used here, matching the warm-up evaluation: **B-n** binding recommendations, **I-n** invariants, **N-n** non-goals, **D-n** deferred (with trigger), **X-n** rejected, **O-n** owner decisions, **R-n** risks, **A-n** acceptance criteria, **RG-n** research-gate questions, **F-n** repository findings. Evidence is cited by registry ID (`EVIDENCE-nnn`, `A/B/C-n`, `GAP-nn`) only; no paper is cited directly (`evidence-to-design.md` §3 rule 4).

---

## 1. Verdict and recommended initial scope

**The feature is worth building, and the smallest coherent version is the tracker plus an _advisory_ starting suggestion, shipped together but structurally isolated from the progression engine.** Everything the athlete asked for — an estimated strength trend, a separate historical best and current estimate, and a usable starting weight after a rep-scheme change — is a pure derivation over immutable set logs. It needs no new execution fact, no sync entity, no persisted aggregate, no engine change, and no snapshot change. That is the strongest guarantee this architecture offers, and it should be kept.

Three things in the proposal must change, and one pre-existing repository gap must be either fixed or explicitly accepted before the numbers can be honest:

1. **Load translation must not enter the prefill chain or the recommendation table in v1.** It is a labeled "starting suggestion" card with a one-tap "Use" action. It fires only when the existing carry-forward source is rep-incompatible with today's target (or absent), it never writes anything, and it is self-limiting: after one session at the new scheme, direct evidence exists and the ordinary engine governs (§14).
2. **Conservatism cannot be delivered by formula choice.** No candidate equation is uniformly conservative — Brzycki is the most conservative for low→high rep translation and the most aggressive for high→low (§5). Conservatism is delivered structurally instead: rep-specific evidence outranks conversion, downward rounding to `loadStepKg`, an upward-extrapolation cap, expiry of stale evidence, and confidence degradation (§10).
3. **The historical best must be a session-level record, not a single-set record, and it needs no confirmation state machine.** A session lower-median plus an "unconfirmed" display label when the best stands more than 10 % above every other observation gives the protection the principles ask for without a persisted quarantine state (§8, §11).
4. **F-1 — `set_logs.is_warmup` is unwritable from the UI** (`src/ui/workout/ExerciseCard.tsx:111` passes only weight/reps/RIR; `HistoryDetail` exposes the same three). Every set the app has ever written is `is_warmup = false`, so the canonical "work set" filter is currently a no-op and typed-in warm-up ramps are indistinguishable from work sets. The estimator defends itself structurally (modal-load working-set rule, §7), but the owner must either add a warm-up toggle to set entry (recommended, O-5) or accept that ramps are treated as work sets everywhere, including the progression engine.

Where automation becomes too risky, in order of increasing danger: (a) silently replacing the prefill with a translated load; (b) auto-deciding a recommendation from a translated load; (c) a `percent-1rm` strategy keyed to the estimate (`evidence-to-design.md` row 18 names this as the failure mode to avoid); (d) any estimate that adjusts, corrects, or trusts RIR beyond an integer offset with degraded confidence (B11); (e) cross-exercise inference of any kind. v1 does none of these.

### 1.1 Principles from the brief — kept, sharpened, or replaced

| Proposed principle                                                                  | Verdict       | Resulting rule                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lower reps plus higher weight must not automatically win                            | Kept          | In the worked case the 12-rep session implies the _higher_ e1RM under every formula (§12); neither session "wins" — the target's rep distance selects the governing tier, and the pooled estimate is a lower median.                                |
| Recent evidence close to the requested rep range outranks a remote-range conversion | Kept          | Lexicographic tiers: direct (±1 rep) → nearby (2–3 reps) → remote (pooled current estimate). A nearby estimate that disagrees with the pooled estimate by >10 % is replaced by the lower of the two (§9).                                           |
| e1RM primarily translates when no sufficiently specific anchor exists               | Sharpened     | The suggestion is emitted only when the carry-forward source (or the pending recommendation's rep basis) is ≥2 reps away from today's target. Otherwise the feature is silent (§10, §14).                                                           |
| Sets from one session are correlated                                                | Strengthened  | One observation per session, never one per set. Set count feeds confidence only (§7).                                                                                                                                                              |
| Repeated consistent sets raise confidence, not the estimate                         | Kept          | Session value = lower median of qualifying set e1RMs; count and spread enter the confidence model (§7, §11).                                                                                                                                        |
| One unusually high observation must not dominate the current estimate               | Kept          | Current estimate = lower median of the last three qualifying non-deload sessions inside a 90-day window (§8).                                                                                                                                      |
| Historical best and current estimate are separate concepts                          | Kept          | `bestE1RM` = max over session observations (all time, deloads excluded); `currentE1RM` = windowed lower median. Invariant `current ≤ best` holds by construction (§8).                                                                              |
| Conservative, transparent, deterministic, versioned                                 | Sharpened     | Plus: never persisted, never read back, never a fact. Every DTO carries `algorithm {id, version, formula}` and ordered reason codes (§13).                                                                                                          |
| Never present an estimate as a tested 1RM                                           | Kept          | Copy rules and refusal list in §16.                                                                                                                                                                                                                |
| Suspicious input must not silently corrupt future estimates                         | Sharpened     | Structural per-set eligibility + robust medians + "unconfirmed" labeling; no quarantine state (§11). PI-001 stays an entry-time guard.                                                                                                              |
| _(new)_ Direction-dependent conservatism                                            | Added         | Rounding is downward; upward extrapolation (to fewer reps than any recent evidence) is capped at 110 % of the heaviest recent working load (§10).                                                                                                   |
| _(new)_ Prescribed set count does not enter the initial load                        | Added         | Set count affects later fatigue and the engine's completion check, not the first work-set load (§9).                                                                                                                                               |
| _(new)_ Stale evidence expires; the best never does                                 | Added         | No current estimate or suggestion from evidence older than 90 days; the best keeps its date (§8).                                                                                                                                                  |

---

## 2. Repository integration map

Facts below were verified in source. The map answers "how do completed sets become recommendations today", and then states exactly where the new feature reads and where it must not touch.

### 2.1 Today's pipeline: set → recommendation → next workout

| Stage                    | What happens                                                                                                                                                                                                                    | Where                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Set entered              | Three fields (`kg`, `reps`, `RIR`); weight required (0 allowed), RIR optional, no warm-up toggle, no AMRAP/failure marker                                                                                                        | `src/ui/workout/ExerciseCard.tsx:188-229`                                                                        |
| Local commit             | Aggregate + outbox op written in one IndexedDB transaction; first non-warm-up set resolves a pending recommendation implicitly (load equality after `roundToStepKg`)                                                             | `src/sync/activeSession.ts:460-495`, `src/domain/progression/implicitDecision.ts:25-47`                          |
| Wire                     | Seven sync entities; `setLog` upsert payload `weightKg 0–9999.99`, `reps 1–100`, `rir 0–10 \| null`, `isWarmup`; the outbox is the only write path for execution facts                                                          | `src/domain/sync/schema.ts:17-33, 99-115`                                                                        |
| Completion               | `workoutSession` upsert with `status: "completed"`; evaluation runs inside that transaction, only on a real `in_progress → completed` transition                                                                                 | `src/server/sync/service.ts:507-519`                                                                             |
| Context assembly         | Work sets = `is_warmup = false` in SQL; history = same exercise, `status = 'completed'`, `startedAt <` evaluated session, newest first, cap 5; loadStepKg from `exercises`                                                       | `src/server/progression/service.ts:41, 116-188`                                                                  |
| Pure evaluation          | `evaluateSession` → strategy (`load-progression` / `rep-progression`); deload sessions return `[]`; manual/ad-hoc/skipped are skipped; modal working load guards typos                                                           | `src/domain/progression/evaluateSession.ts:97-163`, `loadProgression.ts`, `repProgression.ts`, `loadHelpers.ts` |
| Persist                  | Supersede pending for `(exercise, block)`, insert `recommendations` row with frozen `config`/`inputs`/`reasonCodes`/`strategyVersion`; `uq_recs_one_pending`                                                                    | `src/server/progression/service.ts:355-375`, `src/db/schema/recommendations.ts:71-76`                            |
| Offline completion       | Client runs the identical `evaluateSession` against the cached bundle's 5-session `history`, enqueues `recommendation` ops _before_ the completion op; server dedupes by `sourceSessionExerciseId`                               | `src/sync/activeSession.ts:633-740`, `src/server/progression/service.ts:281-298`                                 |
| Next workout (prefill)   | `resolveWorkingTargets`: latest accepted/modified decision for `(exercise, block)` → last completed non-deload session's first work-set load → `baselineLoadKg` → null. A pending recommendation never enters the prefill        | `src/domain/progression/workingTargets.ts:33-45`, `carryForward.ts:20-33`, `buildSnapshot.ts:32-33`             |
| Next workout (card)      | Bundle carries `pendingRecommendation` per exercise (blanked on deload weeks); card offers Accept / Keep / Custom; `derivePrefill` prefers the last logged set, then the rec target, then modified chosen, then snapshot prefill | `src/server/today/service.ts:505-545`, `src/ui/workout/RecommendationCard.tsx`, `ExerciseCard.tsx:47-71`         |
| Decision → carry-forward | Decisions are write-once; `chosen` heads the next chain; rejected decisions are transparent; set edits re-evaluate only while pending                                                                                            | `src/server/sync/service.ts:1042-1085`, `progression/service.ts:494-532`                                         |

Feedback-loop protections already present: history is built from `set_logs` only (never from `recommendations`); next targets derive from the actual modal load, not from the previous target; only `chosen.reps` of an in-session decision is overlaid into the evaluation context (`evaluationTarget.ts:22-32`); recovery/bodyweight non-consumption is enforced by an import-graph test (`tests/unit/progressionBoundary.test.ts`).

### 2.2 Three existing "which sets qualify" postures

| Consumer                          | Session filter                                                    | Set filter                                      | Deload                                            |
| --------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Session history                   | `status = 'completed'` (`history/service.ts:17,78,146`)           | none                                            | shown, badged                                     |
| Weekly volume                     | `status != 'discarded'` in SQL (`volume/service.ts:203-207`)      | `!isWarmup` in the pure domain (`aggregate.ts:170-174`) | counted, badged (`aggregate.ts:157`)              |
| Progression engine                | `status = 'completed'`, strictly earlier `startedAt`              | `is_warmup = false` in SQL (`progression/service.ts:125`) | not evaluated; skipped in streaks                 |
| Carry-forward prefill             | completed, non-deload, has a non-warm-up first set (`carryForward.ts:24-32`) | first non-warm-up set                           | excluded                                          |

The new feature must state its own posture explicitly; it does in §4: completed sessions only (like history and the engine), warm-ups and sub-modal sets excluded in the pure domain (like volume's placement of the rule), deloads excluded from current/best/suggestion (like carry-forward) but shown badged in the trend (like volume).

### 2.3 Where the feature touches the repository

| Touch                                                                                                                    | Kind                          | Constraint honored                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reads `set_logs`, `session_exercises`, `workout_sessions`, `exercises` (equipment, loadStepKg, new `strength_estimate`)   | read-only                     | ADR-007 mechanism 3 (current-convention derivation)                                                                                                                                           |
| New pure module `src/domain/strength/*`                                                                                  | domain (imports domain only)  | `eslint.config.mjs:40` boundary; isomorphic by construction                                                                                                                                   |
| New `src/server/strength/service.ts` + `GET /api/exercises/[id]/strength`                                                | server + api                  | derived, computed on read (`architecture-plan.md:118`, `data-model.md:388`)                                                                                                                   |
| Two optional fields on `TodayBundleExerciseEntry`: `strengthEstimate`, `startingSuggestion`                              | bundle DTO (server + client mirror) | declared twice and optional on the client (`src/sync/types.ts:217-227` tolerance rule)                                                                                                        |
| Client-local copy of `startingSuggestion` frozen into the active-session aggregate at `startSession`                     | device-local only             | never enters a payload builder; identical posture to warm-up checklist state (warm-up evaluation B-5)                                                                                          |
| Workout card (advisory) and exercise strength page                                                                       | ui                            | copy rules §16                                                                                                                                                                                |
| One additive planning-world column `exercises.strength_estimate` (O-2)                                                   | schema (definition table)     | online CRUD only; not snapshotted; mutable like `equipment`                                                                                                                                   |
| **Not touched**: `src/domain/progression/*`, `recommendations`, `PrescriptionSnapshot`, `src/domain/sync/schema.ts`, `src/server/sync/service.ts`, outbox op vocabulary, `evaluateSession` inputs | —                             | W-1 (`mvp-v1-remediation-verification-2.md` §6.1) stays closed by not touching the sync contract; `historyDepthUsed` stays evaluation-neutral because `HISTORY_DISPLAY_LIMIT` is not widened |

---

## 3. Domain terminology

| Term                                     | Definition (binding)                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reps to failure (RTF)**                | `reps + (rir ?? 0)` for one set. Integer. With a missing RIR it is a lower bound and the set is flagged `RIR_MISSING_LOWER_BOUND`.                                                                                                                                                                                                             |
| **Set e1RM**                             | `weightKg × f(RTF)` where `f(1) = 1` and `f(r) = 1 + r/30` for `r ≥ 2` (Epley with the observed-single exception, §5). A per-set intermediate; never displayed on its own except as provenance of the best.                                                                                                                                    |
| **Eligible set**                         | A set that passes the per-set rules of §4 (not warm-up, load > 0, RIR ≤ 4 or null, RTF ≤ 15).                                                                                                                                                                                                                                                 |
| **Working sets**                         | Eligible sets whose load is ≥ the modal working load of the eligible sets (`modalWorkingLoad`, `loadHelpers.ts:27-42`). Defends against unflagged warm-up ramps (F-1) and back-off/drop sets.                                                                                                                                                 |
| **Observation**                          | One completed, non-discarded session's contribution for one exercise: `{sessionId, performedAt, isDeload, modalLoadKg, modalReps, medianRir, e1rmKg, bestSetE1rmKg, workingSetCount, flags}`. `e1rmKg` = lower median of working-set e1RMs.                                                                                                     |
| **Lower median**                         | Sort ascending; take index `floor((n − 1) / 2)`. For even `n` this is the lower of the two middle values — conservative and integer-preserving (no averaging, per `progression-engine.md` §3 doctrine).                                                                                                                                        |
| **Evidence window**                      | Observations with `performedAt` in `[asOf − 90 days, asOf]`, non-deload.                                                                                                                                                                                                                                                                      |
| **currentE1RM**                          | Lower median of the `e1rmKg` of the most recent three observations in the evidence window. Null when the window is empty.                                                                                                                                                                                                                     |
| **bestE1RM**                             | Maximum `e1rmKg` over all non-deload observations, all time (ties → earliest). "Unconfirmed" when no other non-deload observation has `e1rmKg ≥ 0.90 × best`.                                                                                                                                                                                  |
| **Target reps (T)**                      | `schemeDefaultReps(scheme)`: `reps` for `fixed`, `minReps` for `repRange` (`workingTargets.ts:29-31`) — the same rule the prefill uses.                                                                                                                                                                                                        |
| **Rep basis** of a source                | `modalReps` of an observation; `chosen.reps ?? schemeDefaultReps(inputs.prescribed.scheme)` of a recommendation/decision.                                                                                                                                                                                                                     |
| **Rep-compatible**                       | `\|repBasis − T\| ≤ 1`.                                                                                                                                                                                                                                                                                                                       |
| **Carry-forward source**                 | The session (or decision) whose load the existing chain would prefill today (`resolveWorkingTargets`).                                                                                                                                                                                                                                        |
| **Tier**                                 | `direct` (rep-compatible observation exists in the window), `nearby` (2–3 reps away), `remote` (≥4 reps away; pooled `currentE1RM`).                                                                                                                                                                                                          |
| **Starting suggestion**                  | An advisory `{loadKg, tier, confidence, reasonCodes, basis}` for the _first work set_ of today's prescription, emitted only when the carry-forward source is rep-incompatible or absent. Never a fact, never a recommendation.                                                                                                                 |
| **Algorithm**                            | `{ id: "e1rm-epley-rir", version: 1, formula: "epley" }`, carried on every DTO; bumped on any behavior change.                                                                                                                                                                                                                                |
| **Estimated**                            | Every number this feature shows is prefixed or suffixed with "estimated"/"est."/"≈". "1RM" never appears without "estimated".                                                                                                                                                                                                                  |

---

## 4. Eligibility rules

Normative. Rules are applied in the pure domain (`src/domain/strength/eligibility.ts`), not in SQL, so each is provable against a fixture (the volume precedent, `aggregate.ts:170-173`). The server query only bounds by exercise, user, and `status = 'completed'`.

### 4.1 Session-level

| Case                                                     | Rule                                                                                          | Reason code (when it matters)        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------ |
| `completed`                                              | Eligible                                                                                      | —                                    |
| `in_progress`                                            | Excluded (the estimate never moves during a workout; no live "PR" hints in v1)                | —                                    |
| `discarded`                                              | Excluded, consistent with `domain-model.md` §7                                                | —                                    |
| `isDeload = true`                                        | Observation is computed and shown badged on the trend; excluded from current, best, suggestion | `DELOAD_SESSIONS_EXCLUDED`           |
| Ad-hoc slot (`prescription = null`)                      | Eligible — an observation needs facts, not a prescription                                     | —                                    |
| Incomplete prescription (fewer sets than prescribed)     | Eligible — completion is the engine's concern, not strength evidence                          | —                                    |
| Session with zero eligible sets                          | No observation                                                                                | `NO_ELIGIBLE_SETS`                   |
| `custom` week override (`effectiveModifiers.ts:17-19`)   | Eligible (it is not a deload)                                                                 | —                                    |

### 4.2 Set-level

| Case                                                  | Rule                                                                                                                             | Reason code / flag                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `isWarmup = true`                                     | Excluded                                                                                                                         | —                                                |
| `weightKg = 0`                                        | Excluded (on a loaded exercise it is a bodyweight-only or forgotten entry; `data-model.md:230`)                                  | `ZERO_LOAD_SETS_EXCLUDED`                        |
| `rir` null                                            | Eligible; RTF = reps (lower bound)                                                                                                | `RIR_MISSING_LOWER_BOUND` (observation, confidence ≤ medium) |
| `rir` 0–2                                             | Eligible, full standing                                                                                                          | —                                                |
| `rir` 3–4                                             | Eligible, degraded (EVIDENCE-014: accuracy worse far from failure; B8)                                                            | `RIR_MODERATE_RANGE` (confidence ≤ medium)       |
| `rir` ≥ 5                                             | Excluded (B8's own "5+" example)                                                                                                 | `HIGH_RIR_SETS_EXCLUDED`                         |
| RTF 1–10                                              | Eligible, core domain                                                                                                             | —                                                |
| RTF 11–15                                             | Eligible, degraded (OD-06 caps display at 12; the extension to 15 exists so 12-rep sets at RIR 1–3 are not thrown away)          | `EXTENDED_REP_RANGE` (confidence ≤ medium)       |
| RTF > 15                                              | Excluded — outside any defensible formula domain; this alone removes PI-001's `8 kg × 90`                                        | `HIGH_REP_SETS_EXCLUDED`                         |
| Load below the modal working load of eligible sets    | Excluded from the observation (presumed ramp or back-off; F-1)                                                                   | `SUB_MODAL_SETS_EXCLUDED`                        |
| Mixed loads among working sets                        | Eligible; flagged                                                                                                                | `MIXED_LOADS_IN_SESSION`                         |
| Working-set e1RM spread `(max − min)/median > 15 %`   | Eligible; flagged                                                                                                                | `SESSION_SETS_INCONSISTENT` (confidence ≤ medium) |
| Edited set (any time, including after completion)     | Recomputed on the next read — nothing to invalidate                                                                              | —                                                |
| Deleted set                                           | Same                                                                                                                             | —                                                |

### 4.3 Cases the data model cannot distinguish honestly (F-2)

Verified absent, not merely unused (`src/db/schema/setLogs.ts:30-42`; `src/db/schema/exercises.ts:31-45`):

- **AMRAP, to-failure, drop set, rest-pause, myo-reps, cluster** — no flag, no scheme variant (`SCHEME_TYPES = ["fixed","repRange"]`; `fixedPlusAmrap`/`perSet` reserved only). RIR 0 is the only failure signal. A drop set appears as a descending-load set and is removed by the modal-load rule; rest-pause appears as many short sets and is treated as ordinary sets.
- **A failed rep attempt** — `reps ≥ 1` (`ck_set_logs_reps_range`), so a 0-rep failure cannot be logged at all.
- **Weighted bodyweight, assisted movements, bodyweight fraction** — `weight_kg` is one scalar; "0 = bodyweight-only" is a one-line documentation convention (`data-model.md:230`); Assisted Pull-Up is `equipment: "machine"` with sign-inverted load (`exerciseCatalog.ts:865-875`).
- **Dumbbell per-hand vs. total; unilateral side** — no field; the `kg` label carries no qualifier (`ExerciseCard.tsx:188-198`); `laterality` describes the movement, not the logged number (six catalog rows are unilateral; two-implement lifts are `bilateral`).
- **Time- or distance-based work** (Plank, Farmer's Carry) — reps 1–100 must be fabricated.
- **Whether a set was a correction or an original entry** — `updated_at` is rewritten by renumbering after a delete (`setDeletionOps.ts:50-92`); no audit copy exists (`domain-model.md:226`).
- **The calendar day a session belongs to** — `started_at` doubles as training date (PI-002); the trend inherits this.

Each of these is handled by exclusion (category rules, §4.2) or by honest labeling (§16), never by inference.

---

## 5. Exercise and load compatibility

### 5.1 Category rules (v1)

`equipment` is a display taxonomy, not a load taxonomy (F-2), and it is mutable and not snapshotted (`domain/exercises/schema.ts:155-159`; `PrescriptionSnapshot` carries only `exerciseId` + `exerciseName`). The rules below therefore use the _current_ exercise row — the same current-convention reinterpretation ADR-007 accepts for contribution weights — plus one new explicit per-exercise switch (O-2).

| Category                             | v1 eligibility | Rationale                                                                                                                                                                                                                 |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `barbell`                            | Eligible       | External load, additive, well-behaved.                                                                                                                                                                                    |
| `dumbbell`                           | Eligible, "as logged" | Per-hand vs. total is unknown but consistent within one exercise; the estimate is explicitly "in the unit you log". Confidence is not penalized (O-7). Farmer's Carry is excluded via the per-exercise switch.        |
| `cable`                              | Eligible, "as logged" | Stack numbers are machine-specific; comparisons only ever happen within one exercise identity.                                                                                                                             |
| `machine`                            | Eligible, "as logged" | Plate-loaded vs. selectorized and sled/lever tare are unmodeled (`prescription-model.md` §7) — harmless within one exercise. Assisted Pull-Up must be switched off (sign-inverted load).                                   |
| `bodyweight`                         | Not eligible   | External-load e1RM of a pull-up (0 kg or belt load only) is not a strength measure; would require a bodyweight join and a leverage fraction (D-3).                                                                         |
| `other`                              | Not eligible   | Unknown load semantics (landmine leverage, bands). Re-classify to a supported equipment type if a fixed-mass implement is meant (O-8).                                                                                     |
| `laterality = unilateral`            | Eligible, "as logged" | Per-side logging convention is the user's; the estimate is per logged set.                                                                                                                                                |
| Zero-load exercise (Plank)           | Not eligible   | All sets are `weightKg = 0` → no eligible sets; `bodyweight` anyway.                                                                                                                                                      |
| Same exercise in several templates/programs | One series | Observations key on `exercises.id` only (like history and the engine, which are template-agnostic — `progression/service.ts:156-163`).                                                                                    |
| Separate variants (Back vs. Front Squat, Smith vs. barbell) | Separate series | Exercise identity = `exercises.id`; never merged by name, muscle, or movement pattern (`domain-model.md` §3 identity policy; OD-11 is the only merge path).                                                                 |

### 5.2 Kilograms and `loadStepKg`

- All computation is in kg (OD-01). `loadStepKg` (`numeric(4,2)`, > 0, defaults barbell 2.5 / dumbbell 2.0 / machine 5.0 / cable 2.5) is the rounding grid for the suggested load and the comparison grid for "the athlete used the suggestion" (same rule as the implicit decision, `implicitDecision.ts:35`).
- The suggested load is rounded **down** to `loadStepKg` (§10). The e1RM itself is displayed rounded to the nearest 1 kg; it is not on the load grid because it is not a load to lift.
- `loadStepKg` is mutable; a later change re-rounds future suggestions only (nothing persisted).

---

## 6. Formula comparison and evidence status

### 6.1 Mathematical properties (arithmetic, not empirical)

Multiplier `f(r)` such that `e1RM = w × f(r)`, `r` = reps to failure:

| r   | Epley `1 + r/30` | Brzycki `36/(37 − r)` | Lombardi `r^0.10` | O'Conner `1 + 0.025r` | Wathan `100/(48.8 + 53.8e^(−0.075r))` |
| --- | ---------------- | --------------------- | ----------------- | --------------------- | ------------------------------------- |
| 1   | 1.033            | 1.000                 | 1.000             | 1.025                 | 1.013                                 |
| 3   | 1.100            | 1.059                 | 1.116             | 1.075                 | 1.091                                 |
| 5   | 1.167            | 1.125                 | 1.175             | 1.125                 | 1.166                                 |
| 8   | 1.267            | 1.241                 | 1.231             | 1.200                 | 1.281                                 |
| 10  | 1.333            | 1.333                 | 1.259             | 1.250                 | 1.347                                 |
| 12  | 1.400            | 1.440                 | 1.282             | 1.300                 | 1.412                                 |
| 15  | 1.500            | 1.636                 | 1.311             | 1.375                 | 1.508                                 |
| 20  | 1.667            | 2.118                 | 1.349             | 1.500                 | 1.639                                 |

Observations that matter for translation (a ratio `f(r_source)/f(r_target)`, so absolute level is irrelevant):

- Epley and Brzycki coincide at r = 10; Brzycki is lower below 10 and diverges above (singular at r = 37). Lombardi and O'Conner are flat at high reps; Wathan tracks Epley closely.
- **No formula is uniformly conservative.** Translating 110 kg × 5 → 12 reps (same RIR): Epley 91.7, Brzycki 85.9, Lombardi 100.8, O'Conner 95.2 — Brzycki is the most conservative. Translating 95 kg × 12 → 5 reps: Epley 114.0, Brzycki 121.6, Lombardi 103.7, O'Conner 109.8 — Brzycki is the most aggressive. The athlete's own ratio in the brief is 95/110 = 0.860, between O'Conner (0.865) and Epley (0.833). Conservatism therefore has to come from the surrounding rules (§10), not the formula.
- Epley's raw `f(1) = 1.033` would inflate an observed single at RIR 0 by 3.3 %. The chosen convention sets `f(1) = 1` (an observed single is not extrapolated). The inverse is defined identically, so `translate(e1RM, 1) = e1RM` — but a target with RTF < 3 is never suggested anyway (§10).

### 6.2 RIR adjustment: `RTF = reps + RIR`

- Error propagation (arithmetic): one rep of RIR error changes the Epley e1RM by +3.0 % at RTF 3, +2.9 % at RTF 5, +2.7 % at RTF 7, +2.5 % at RTF 10, +2.3 % at RTF 14. EVIDENCE-030 reports mean absolute RIR error of 0.40–0.90 reps for experienced lifters at 1–3 RIR targets, so a typical set carries roughly ±1–3 % e1RM noise from RIR alone — comparable to one `loadStepKg` on a 100 kg lift. This is why outputs are rounded to load steps and the e1RM to 1 kg, and why nothing finer is ever displayed.
- Evidence status: EVIDENCE-014/030 and A10/A11 support "RIR is useful but imprecise"; B8 supports weighting near-failure reports more; B11 permits approximate use and forbids correction. The integer offset here alters no reported value, averages nothing, and degrades confidence by RIR magnitude and missingness — consistent with the `progression-engine.md` §3 doctrine. Whether `reps + RIR` predicts true reps-to-failure well enough for a 1RM equation is **not** in the corpus (RG-2).
- Domain: RIR 0–4 eligible (3–4 degraded); ≥5 excluded (§4.2). Missing RIR → lower bound, flagged, confidence ≤ medium; in translation, a basis without reported RIR is translated effort-matched (RIR 0 on both sides), not against the prescribed band (§10, O-6).

### 6.3 Decision

**Epley, RIR-adjusted, `f(1) = 1`, RTF domain 1–15 (core 1–10), algorithm id `e1rm-epley-rir` v1.** Reasons, in order: (1) it is the recorded default of OD-06 and Phase 9 (`implementation-plan.md:223`), so the choice is continuity, not popularity; (2) linear in reps, closed-form inverse, no singularity, and the mildest high-rep growth among the non-flat formulas — the safest shape for the extended 11–15 band; (3) the translation ratio is a rational function whose determinism is trivial to test byte-for-byte.

Evidence status of the whole feature: **Convention (heuristic, no corpus backing)** — the tier already assigned by `evidence-to-design.md` row 18. The implementer must add a row 20 there when building (basis: EVIDENCE-014/030 for the noise model only; not justified: sub-rep precision, exercise-specific accuracy, any strategy trigger, presenting as measured strength). Formula choice is **not** exercise-specific in v1 (RG-1); the algorithm id carries the formula name so a later switch is honest (OD-06 wording).

---

## 7. Session aggregation — and §6 exact algorithm, pseudocode

The pure module is `src/domain/strength/`. Everything below is data-in/data-out: no clock, no IO, no randomness. `asOf` arrives as data (the bundle's `generatedAt` or the request time).

### 7.1 Constants (`src/domain/strength/constants.ts`) — all labeled heuristic

```ts
export const STRENGTH_ALGORITHM = { id: "e1rm-epley-rir", version: 1, formula: "epley" } as const;
export const RTF_CORE_MAX = 10;            // full standing
export const RTF_MAX = 15;                 // eligibility ceiling
export const RIR_NEAR_FAILURE_MAX = 2;     // 0–2 full standing
export const RIR_ELIGIBLE_MAX = 4;         // 3–4 degraded; ≥5 excluded
export const EVIDENCE_WINDOW_DAYS = 90;
export const CURRENT_SESSION_COUNT = 3;
export const RECENT_DAYS_HIGH = 21;        // most recent basis age for "high"
export const RECENT_DAYS_MEDIUM = 42;
export const SAME_REPS_TOLERANCE = 1;
export const NEARBY_REPS_TOLERANCE = 3;
export const FAR_REP_DISTANCE = 6;         // confidence low
export const MAX_REP_DISTANCE = 8;         // no suggestion beyond
export const TARGET_RTF_MIN = 3;           // never suggest near-maximal targets
export const SESSION_SPREAD_FLAG_PCT = 15;
export const POOL_SPREAD_MEDIUM_PCT = 10;
export const POOL_SPREAD_LOW_PCT = 20;
export const PAIR_DISAGREE_PCT = 20;       // n = 2 and wider → no suggestion
export const NEARBY_POOLED_DISAGREE_PCT = 10;
export const UPWARD_LOAD_CAP_FACTOR = 1.1;
export const BEST_UNCONFIRMED_PCT = 10;
export const E1RM_DISPLAY_ROUND_KG = 1;
```

### 7.2 Primitives

```ts
export function repMultiplier(rtf: number): number {          // f(r)
  return rtf <= 1 ? 1 : 1 + rtf / 30;
}
export function setE1rm(weightKg: number, rtf: number): number {
  return round2(weightKg * repMultiplier(rtf));               // round2 = Math.round(x*100)/100 (loadHelpers.ts convention)
}
export function lowerMedian(values: readonly number[]): number {  // values non-empty
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}
export function floorToStepKg(loadKg: number, stepKg: number): number {
  if (stepKg <= 0) return round2(loadKg);
  return round2(Math.floor(loadKg / stepKg + 1e-9) * stepKg);
}
export function spreadPct(values: readonly number[]): number {   // relative to the lower median
  const m = lowerMedian(values);
  return m <= 0 ? 0 : round2(((Math.max(...values) - Math.min(...values)) / m) * 100);
}
```

Operation order is normative: `setE1rm` rounds once; medians operate on rounded set values; translation divides the (already rounded) basis e1RM by `repMultiplier(targetRtf)`; rounding to the load step is the last step. This makes server and (any future) client output byte-identical.

### 7.3 Set eligibility and the session observation

```ts
interface SetInput { setNumber: number; isWarmup: boolean; weightKg: number; reps: number; rir: number | null }
interface SessionInput { sessionId: string; startedAt: string; status: "in_progress"|"completed"|"discarded"; isDeload: boolean; sets: SetInput[] }

function classifySet(s: SetInput): { eligible: true; rtf: number; flags: Flag[] } | { eligible: false; reason: Flag } {
  if (s.isWarmup) return { eligible: false, reason: "WARMUP" };
  if (s.weightKg <= 0) return { eligible: false, reason: "ZERO_LOAD_SETS_EXCLUDED" };
  if (s.rir !== null && s.rir > RIR_ELIGIBLE_MAX) return { eligible: false, reason: "HIGH_RIR_SETS_EXCLUDED" };
  const rtf = s.reps + (s.rir ?? 0);
  if (rtf > RTF_MAX) return { eligible: false, reason: "HIGH_REP_SETS_EXCLUDED" };
  const flags: Flag[] = [];
  if (s.rir === null) flags.push("RIR_MISSING_LOWER_BOUND");
  else if (s.rir > RIR_NEAR_FAILURE_MAX) flags.push("RIR_MODERATE_RANGE");
  if (rtf > RTF_CORE_MAX) flags.push("EXTENDED_REP_RANGE");
  return { eligible: true, rtf, flags };
}

export function buildObservation(session: SessionInput): Observation | null {
  if (session.status !== "completed") return null;
  const eligible = session.sets
    .slice().sort((a, b) => a.setNumber - b.setNumber)
    .map((s) => ({ s, c: classifySet(s) }))
    .filter((x): x is { s: SetInput; c: Extract<ReturnType<typeof classifySet>, { eligible: true }> } => x.c.eligible);
  if (eligible.length === 0) return null;                      // NO_ELIGIBLE_SETS

  const { loadKg: modal, mixed } = modalWorkingLoad(eligible.map((x) => x.s));   // existing helper, ties → earliest
  const working = eligible.filter((x) => x.s.weightKg >= modal);
  const flags = new Set<Flag>();
  if (working.length < eligible.length) flags.add("SUB_MODAL_SETS_EXCLUDED");
  if (mixed && new Set(working.map((x) => x.s.weightKg)).size > 1) flags.add("MIXED_LOADS_IN_SESSION");
  for (const x of working) for (const f of x.c.flags) flags.add(f);
  if (session.isDeload) flags.add("DELOAD_SESSION");

  const values = working.map((x) => setE1rm(x.s.weightKg, x.c.rtf));
  const e1rmKg = lowerMedian(values);
  if (spreadPct(values) > SESSION_SPREAD_FLAG_PCT) flags.add("SESSION_SETS_INCONSISTENT");
  const reported = working.map((x) => x.s.rir).filter((r): r is number => r !== null);

  return {
    sessionId: session.sessionId, performedAt: session.startedAt, isDeload: session.isDeload,
    modalLoadKg: modal,
    modalReps: modeLowestTie(working.map((x) => x.s.reps)),
    medianRir: reported.length ? lowerMedian(reported) : null,
    e1rmKg, bestSetE1rmKg: Math.max(...values),
    workingSetCount: working.length, eligibleSetCount: eligible.length, totalSetCount: session.sets.length,
    flags: [...flags],
  };
}
```

`modeLowestTie` = most frequent value, ties → the lowest value (conservative rep basis).

### 7.4 Why lower median, and what was compared

| Candidate                                  | Verdict for the session value | Reason                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highest set e1RM                           | Rejected (used only as provenance `bestSetE1rmKg`) | One wrong set wins forever; rewards the freshest set's over-reported RIR (EVIDENCE-014).                                                                                                                 |
| First qualifying set                       | Rejected                      | Single-set variance; first-set RIR is reported furthest from failure; typo in set 1 is unguarded.                                                                                                       |
| Plain median (upper or averaged)           | Rejected                      | Averaging two middle values invents a decimal that no set produced; upper median is less conservative.                                                                                                  |
| **Lower median of working sets**           | **Chosen**                    | Robust to one outlier for n ≥ 3, conservative for even n, integer-preserving; RIR-adjusted values already normalize fatigue (falling RIR across sets); set count feeds confidence, not the value.       |
| Weighted median (per-set weights)          | Rejected                      | Fake precision inside a session; flags plus confidence carry the same information without weights.                                                                                                      |
| Median of the strongest half               | Rejected                      | Marginally less conservative for n = 5, identical for n ≤ 3 (the common case), and harder to explain.                                                                                                   |
| Consistency-aware (spread flag)            | Adopted as a flag             | `SESSION_SETS_INCONSISTENT` at >15 % spread caps confidence; it does not alter the value.                                                                                                                |

### 7.5 Worked session examples (Epley, `f(1)=1`)

| Session                                          | Set e1RMs (kg)                        | Lower median | Max   | Spread | Flags                                             |
| ------------------------------------------------ | ------------------------------------- | ------------ | ----- | ------ | ------------------------------------------------- |
| A: 5×5 @ 110, RIR 3,3,2,2,1                      | 139.33, 139.33, 135.67, 135.67, 132.00 | **135.67**   | 139.33 | 5.4 % | `RIR_MODERATE_RANGE`                               |
| B: 3×12 @ 95, RIR 2,1,0                          | 139.33, 136.17, 133.00                | **136.17**   | 139.33 | 4.7 % | `EXTENDED_REP_RANGE` (set 1: RTF 14)               |
| C: 5×5 @ 110, no RIR, reps 5,5,5,4,4             | 128.33 ×3, 124.67 ×2                  | **128.33**   | 128.33 | 2.9 % | `RIR_MISSING_LOWER_BOUND`                          |
| D: 140×3 @ RIR 1, then 3 × 110×8 @ RIR 1,1,0     | 158.67, 143.00, 143.00, 139.33        | **143.00**   | 158.67 | 13.5 % | `MIXED_LOADS_IN_SESSION`                          |
| E: 5×5 @ 110 RIR 2 with set 2 typed as 11 kg     | 135.67, 135.67 (11 kg set sub-modal → excluded) | **135.67** | 135.67 | 0 %   | `SUB_MODAL_SETS_EXCLUDED`                          |
| F: ramp 60×5, 80×5, 100×3, then 5×5 @ 110 RIR 2 (no warm-up flags, F-1) | working = the five 110 kg sets → 135.67 ×5 | **135.67** | 135.67 | 0 % | `SUB_MODAL_SETS_EXCLUDED`                       |

Example D shows the deliberate dilution of a top set by the session median: the record keeps `bestSetE1rmKg = 158.67` as provenance, but the observation is 143. When a `perSet` (top set + back-off) scheme is implemented, this rule must be revisited (D-4).

---

## 8. Current and best estimate derivation

```ts
export function deriveEstimate(obs: readonly Observation[], asOf: string): StrengthEstimate {
  const chrono = [...obs].sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.sessionId.localeCompare(b.sessionId));
  const nonDeload = chrono.filter((o) => !o.isDeload);

  // best — all time, session level, deloads excluded
  let best: Observation | null = null;
  for (const o of nonDeload) if (!best || o.e1rmKg > best.e1rmKg) best = o;      // strict > keeps the earliest on ties
  const bestUnconfirmed = best !== null && !nonDeload.some((o) => o !== best && o.e1rmKg >= best.e1rmKg * (1 - BEST_UNCONFIRMED_PCT / 100));

  // current — windowed, most recent three, lower median
  const windowStart = addDays(asOf, -EVIDENCE_WINDOW_DAYS);
  const recent = nonDeload.filter((o) => o.performedAt >= windowStart && o.performedAt <= asOf);
  const basis = recent.slice(-CURRENT_SESSION_COUNT);
  const current = basis.length === 0 ? null : {
    e1rmKg: lowerMedian(basis.map((o) => o.e1rmKg)),
    basisSessionIds: basis.map((o) => o.sessionId),
    spreadPct: spreadPct(basis.map((o) => o.e1rmKg)),
    mostRecentAgeDays: daysBetween(basis[basis.length - 1]!.performedAt, asOf),
    ...confidenceForEstimate(basis, asOf),                                   // §11
  };
  return { asOf, algorithm: STRENGTH_ALGORITHM, best: best && { ...best, unconfirmed: bestUnconfirmed }, current,
           staleObservationCount: nonDeload.length - recent.length };
}
```

Design answers, one per question in the brief:

- **Time horizon / number of sessions.** 90 days and the most recent three. Three is the smallest count where one outlier cannot be the median; a longer window lags real strength changes (weeks, not months). Both are constants, labeled heuristic (RG-4).
- **Recency weighting or decay.** None. Recency is handled by the window and by "most recent three", and by confidence tiers on the age of the latest basis session (≤21 d / ≤42 d / ≤90 d). Fractional age weights were rejected as fake precision (X-3).
- **Robust median vs. weighted average.** Lower median. Weighted averages are dominated by one wrong value.
- **Conflicting rep ranges.** All eligible rep ranges pool into `currentE1RM`; the lower median resolves conflict conservatively. Rep specificity is handled at translation time, not in the estimate (§9).
- **Minimum evidence.** One observation yields an estimate at **low** confidence; nothing is hidden, everything is labeled.
- **Detraining / inactivity.** After 90 days without a qualifying session the current estimate is null and the UI shows "no current estimate — last estimate ≈ X kg on <date>". EVIDENCE-025/B6 support framing post-deload dips as expected; the horizon itself is a heuristic (RG-4).
- **Historical edits.** Everything recomputes on read. A corrected typo lowers or raises current and best alike; that is honest.
- **May estimates decrease?** Current: yes, whenever the window or the last three change. Best: only when facts are edited or deleted. `current ≤ best` always holds (the median of a subset never exceeds the global maximum).
- **Does an estimated PR need confirmation?** No persisted state. The best is labeled "unconfirmed" while no other observation is within 10 % of it; the current estimate is unaffected by design. This replaces the proposal's implied quarantine (X-5).

---

## 9. Rep-specific source selection

Definitions (binding):

- **Same**: `|modalReps − T| ≤ 1` (a 6-rep session is direct evidence for a 5-rep target).
- **Nearby**: `2 ≤ |modalReps − T| ≤ 3`.
- **Remote**: `|modalReps − T| ≥ 4`; the pooled `currentE1RM` translates. `≥ 6` caps confidence at low; `> 8` for _every_ observation in the window → no suggestion.
- **Inadequate**: no observation in the window; or two observations disagreeing by more than 20 %; or the target's RTF outside `[3, 15]`; or rep distance > 8; or the floored load ≤ 0.

Hierarchy, evaluated in order, first non-empty tier governs:

1. **Direct** — up to three most recent same-rep observations in the window. Suggested load = the most recent one's `modalLoadKg`, no formula, no RIR adjustment (the engine takes it from there). Confidence from count, age, spread of their e1RMs, and flags.
2. **Nearby** — up to three most recent nearby observations. Basis e1RM = lower median of their `e1rmKg`. If it differs from the pooled `currentE1RM` by more than 10 %, the lower of the two is used and `NEARBY_POOLED_DISAGREE` caps confidence at low.
3. **Remote** — basis = `currentE1RM` (§8). Confidence ≤ medium; ≤ low at rep distance ≥ 6.
4. **None** — `status: "none"` with the reason codes; the UI shows an honest "insufficient evidence" line (§16).

**Prescribed set count.** It does not enter the initial load. The first work set is what the suggestion targets; sets 2..S are the engine's completion criterion (`isCompleted`, `loadProgression.ts:36-41`) and the athlete's fatigue management. A high set count with a too-heavy start is corrected by the next evaluation (`PRESCRIBED_REPS_NOT_COMPLETED` → hold), which is the existing, tested loop.

---

## 10. Load-translation algorithm

```ts
interface TranslationInput {
  exercise: { id: string; equipment: Equipment; loadStepKg: number; strengthEstimate: "auto" | "off" };
  prescription: { scheme: SetScheme; targetRir: RirBand | null };
  carryForward: { loadKg: number | null; repBasis: number | null; origin: "decision"|"history"|"baseline"|"none" };
  pendingRecommendationRepBasis: number | null;
  observations: readonly Observation[];   // all for this exercise (server passes the window; extra rows are harmless)
  asOf: string;
}

export function suggestStartingLoad(i: TranslationInput): StartingSuggestion {
  const none = (codes: ReasonCode[]) => ({ status: "none" as const, loadKg: null, tier: null, confidence: null, reasonCodes: codes, ... });
  if (i.exercise.strengthEstimate === "off") return none(["EXERCISE_ESTIMATE_DISABLED"]);
  if (!["barbell","dumbbell","cable","machine"].includes(i.exercise.equipment)) return none(["EXERCISE_CATEGORY_UNSUPPORTED"]);

  const T = schemeDefaultReps(i.prescription.scheme);                       // existing rule
  if (i.carryForward.repBasis !== null && Math.abs(i.carryForward.repBasis - T) <= SAME_REPS_TOLERANCE)
    return none(["CARRY_FORWARD_REP_COMPATIBLE"]);                          // feature is silent
  if (i.pendingRecommendationRepBasis !== null && Math.abs(i.pendingRecommendationRepBasis - T) <= SAME_REPS_TOLERANCE)
    return none(["PENDING_RECOMMENDATION_COMPATIBLE"]);

  const windowStart = addDays(i.asOf, -EVIDENCE_WINDOW_DAYS);
  const all = i.observations.filter((o) => !o.isDeload);
  const recent = all.filter((o) => o.performedAt >= windowStart && o.performedAt <= i.asOf)
                    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  if (recent.length === 0) return none(all.length ? ["NO_RECENT_EVIDENCE"] : ["NO_ELIGIBLE_SETS"]);

  const dist = (o: Observation) => Math.abs(o.modalReps - T);
  const direct = recent.filter((o) => dist(o) <= SAME_REPS_TOLERANCE).slice(-3);
  if (direct.length > 0) {
    const src = direct[direct.length - 1]!;
    return finish({ tier: "direct", loadKg: src.modalLoadKg, basis: direct, codes: ["SOURCE_DIRECT_SAME_REPS"], capped: false, rawLoadKg: src.modalLoadKg });
  }

  const nearby = recent.filter((o) => dist(o) >= 2 && dist(o) <= NEARBY_REPS_TOLERANCE).slice(-3);
  const pooled = recent.slice(-CURRENT_SESSION_COUNT);
  const pooledE1rm = lowerMedian(pooled.map((o) => o.e1rmKg));
  let tier: "nearby" | "remote", basis: Observation[], e1rm: number, codes: ReasonCode[] = [];
  if (nearby.length > 0) {
    tier = "nearby"; basis = nearby; e1rm = lowerMedian(nearby.map((o) => o.e1rmKg)); codes.push("SOURCE_NEARBY_REPS_TRANSLATED");
    if (Math.abs(e1rm - pooledE1rm) / pooledE1rm * 100 > NEARBY_POOLED_DISAGREE_PCT) { e1rm = Math.min(e1rm, pooledE1rm); codes.push("NEARBY_POOLED_DISAGREE"); }
  } else {
    const minDist = Math.min(...recent.map(dist));
    if (minDist > MAX_REP_DISTANCE) return none(["REP_DISTANCE_TOO_FAR"]);
    tier = "remote"; basis = pooled; e1rm = pooledE1rm; codes.push("SOURCE_CURRENT_ESTIMATE_TRANSLATED");
    if (minDist >= FAR_REP_DISTANCE) codes.push("REP_DISTANCE_FAR");
  }
  if (basis.length === 2 && spreadPct(basis.map((o) => o.e1rmKg)) > PAIR_DISAGREE_PCT) return none(["OBSERVATIONS_DISAGREE"]);

  // target effort: band max (conservative) when the basis reported RIR; effort-matched lower bound otherwise
  const basisHasRir = basis.some((o) => o.medianRir !== null);
  const basisMedianRir = lowerMedianOrNull(basis.map((o) => o.medianRir).filter((r): r is number => r !== null));
  const targetRir = basisHasRir ? (i.prescription.targetRir?.max ?? basisMedianRir ?? 0) : 0;
  codes.push(basisHasRir ? (i.prescription.targetRir ? "TARGET_RIR_FROM_BAND_MAX" : "TARGET_RIR_FROM_RECENT_EFFORT") : "TARGET_RIR_EFFORT_MATCHED");
  const targetRtf = T + targetRir;
  if (targetRtf < TARGET_RTF_MIN) return none(["TARGET_NEAR_MAXIMAL_NOT_SUGGESTED"]);
  if (targetRtf > RTF_MAX) return none(["TARGET_OUTSIDE_FORMULA_DOMAIN"]);

  let raw = round2(e1rm / repMultiplier(targetRtf));
  const cap = round2(Math.max(...recent.map((o) => o.modalLoadKg)) * UPWARD_LOAD_CAP_FACTOR);
  let capped = false;
  if (raw > cap) { raw = cap; capped = true; codes.push("CAPPED_AT_RECENT_MAX_LOAD"); }
  return finish({ tier, loadKg: floorToStepKg(raw, i.exercise.loadStepKg), basis, codes, capped, rawLoadKg: raw, e1rm, targetRir });
}
```

`finish` appends `ROUNDED_DOWN_TO_LOAD_STEP` when the floored load differs from the raw value, returns `none(["BELOW_MINIMUM_LOAD"])` when the floored load is ≤ 0, computes confidence per §11, and fills `basis` provenance (session ids, basis e1RM, source load/reps for the direct tier, raw and cap loads).

Resolutions the brief asked for:

- **Target reps and rep ranges.** `T = schemeDefaultReps` — `minReps` for a range, exactly as the prefill's reps default. A range's upper bound is not used (starting at the bottom of the range is the conservative reading and matches rep-progression's `currentTarget`).
- **Target RIR.** The band's `max` when the basis reported RIR (heavier reserve → lighter start); the basis's own median RIR when there is no band; effort-matched RIR 0 on both sides when the basis has no RIR (avoids double discounting a lower-bound estimate — O-6).
- **Set count.** Ignored (§9).
- **Rounding.** Floor to `loadStepKg`, never nearest. `roundToStepKg` (nearest, half up) stays the engine's rule; the two helpers coexist with distinct names.
- **Maximum adjustment.** (a) Rep distance ≤ 8; (b) target RTF in `[3, 15]`; (c) upward cap at 110 % of the heaviest recent working load (O-3). There is no cap on downward translation beyond the formula itself, because a too-light start is corrected within a session or two by the engine.
- **Conflict with direct recent performance.** Impossible by construction: direct evidence is tier 1 and pre-empts translation.
- **One value or a range.** One floored value. The card may show the raw range `[band.max → band.min]` as secondary text ("≈ 92.5–97.5 kg depending on effort"); the primary value is always the conservative end. No range is stored.
- **When nothing is emitted.** Every `none` branch above, plus the two suppression branches (rep-compatible carry-forward or pending recommendation). The DTO still travels with `status: "none"` and its reason codes so the UI can say why.

---

## 11. Confidence model and reason codes

### 11.1 Confidence — a small ordered vocabulary, computed by caps

`confidence = min(caps...)` over the applicable rows; start at `high`. Applies to `current` (estimate) and to a suggestion; the "tier" rows apply to suggestions only.

| Input                                                 | Cap        |
| ----------------------------------------------------- | ---------- |
| Basis sessions = 2                                    | medium     |
| Basis sessions = 1                                    | low (estimate) / medium (direct-tier suggestion, which is one observed load) |
| Age of most recent basis session > 21 days            | medium     |
| Age > 42 days                                         | low        |
| Basis spread > 10 %                                   | medium     |
| Basis spread > 20 %                                   | low        |
| Any basis observation flagged `RIR_MISSING_LOWER_BOUND`, `RIR_MODERATE_RANGE`, `EXTENDED_REP_RANGE`, `SESSION_SETS_INCONSISTENT`, or `MIXED_LOADS_IN_SESSION` | medium |
| Tier `nearby` or `remote`                             | medium     |
| Tier `remote` with rep distance ≥ 6                   | low        |
| `NEARBY_POOLED_DISAGREE`                              | low        |
| `CAPPED_AT_RECENT_MAX_LOAD`                           | low        |

`high` therefore requires ≥3 basis sessions, the latest ≤21 days old, spread ≤10 %, all RIR reported and ≤2, all RTF ≤10, and (for a suggestion) the direct tier. This is deliberately hard to reach.

### 11.2 Reason codes (`src/domain/strength/reasonCodes.ts`, a separate enum from the engine's)

| Code                                   | Meaning                                                                       | UI phrasing (owned by `src/ui/strength/copy.ts`)                          |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `EXERCISE_CATEGORY_UNSUPPORTED`        | equipment not in barbell/dumbbell/cable/machine                               | "Strength estimates aren't available for this equipment type"            |
| `EXERCISE_ESTIMATE_DISABLED`           | `strength_estimate = 'off'`                                                    | "Strength estimate turned off for this exercise"                          |
| `NO_ELIGIBLE_SETS`                     | no observation at all                                                          | "No eligible sets yet"                                                    |
| `NO_RECENT_EVIDENCE`                   | observations exist but none within 90 days                                     | "No sessions in the last 90 days"                                         |
| `SINGLE_SESSION_EVIDENCE` / `TWO_SESSION_EVIDENCE` | basis count                                                        | "Based on one session" / "Based on two sessions"                          |
| `EVIDENCE_AGING` / `EVIDENCE_OLD`      | latest basis 22–42 d / 43–90 d                                                 | "Most recent session N weeks ago"                                         |
| `OBSERVATIONS_DISAGREE`                | two sessions > 20 % apart → none                                               | "Recent sessions disagree too much"                                       |
| `RIR_MISSING_LOWER_BOUND`              | some basis sets had no RIR                                                     | "RIR not logged — estimate is a lower bound"                              |
| `RIR_MODERATE_RANGE`                   | RIR 3–4 used                                                                   | "Some sets were far from failure"                                         |
| `HIGH_RIR_SETS_EXCLUDED`               | sets with RIR ≥ 5 dropped                                                      | "Sets at RIR 5+ not used"                                                 |
| `EXTENDED_REP_RANGE`                   | RTF 11–15 used                                                                 | "High-rep sets used — less precise"                                       |
| `HIGH_REP_SETS_EXCLUDED`               | RTF > 15 dropped                                                               | "Sets beyond 15 reps to failure not used"                                 |
| `ZERO_LOAD_SETS_EXCLUDED`              | 0 kg sets dropped                                                              | "0 kg sets not used"                                                      |
| `SUB_MODAL_SETS_EXCLUDED`              | lighter-than-working-load sets dropped                                         | "Lighter sets treated as warm-up"                                         |
| `MIXED_LOADS_IN_SESSION`               | working sets at more than one load                                             | "Mixed loads in a session"                                                |
| `SESSION_SETS_INCONSISTENT`            | within-session spread > 15 %                                                   | "Sets in one session vary a lot"                                          |
| `DELOAD_SESSIONS_EXCLUDED`             | deload observations present but not used                                       | "Deload sessions not counted"                                             |
| `CARRY_FORWARD_REP_COMPATIBLE`         | suggestion suppressed; prefill already rep-specific                            | (card not shown)                                                          |
| `PENDING_RECOMMENDATION_COMPATIBLE`    | suggestion suppressed; a rep-compatible recommendation is pending              | (card not shown)                                                          |
| `SOURCE_DIRECT_SAME_REPS`              | tier 1                                                                         | "From your most recent N-rep session"                                     |
| `SOURCE_NEARBY_REPS_TRANSLATED`        | tier 2                                                                         | "Estimated from sessions at nearby rep counts"                            |
| `SOURCE_CURRENT_ESTIMATE_TRANSLATED`   | tier 3                                                                         | "Estimated from your current strength estimate"                           |
| `NEARBY_POOLED_DISAGREE`               | lower of the two used                                                          | "Nearby-rep and overall estimates disagree — using the lower"             |
| `REP_DISTANCE_FAR` / `REP_DISTANCE_TOO_FAR` | ≥6 / >8 reps away                                                         | "Far from any logged rep range" / (none)                                  |
| `TARGET_NEAR_MAXIMAL_NOT_SUGGESTED`    | target RTF < 3                                                                 | "No suggestion for near-maximal targets"                                  |
| `TARGET_OUTSIDE_FORMULA_DOMAIN`        | target RTF > 15                                                                | "Target rep count too high to estimate"                                   |
| `TARGET_RIR_FROM_BAND_MAX` / `TARGET_RIR_FROM_RECENT_EFFORT` / `TARGET_RIR_EFFORT_MATCHED` | which effort assumption was used | "Assumes RIR n" / "Assumes your recent effort" / "Assumes the same effort as logged" |
| `CAPPED_AT_RECENT_MAX_LOAD`            | cap applied                                                                    | "Capped near your heaviest recent working load"                           |
| `ROUNDED_DOWN_TO_LOAD_STEP`            | floor applied                                                                  | "Rounded down to the load step"                                           |
| `BELOW_MINIMUM_LOAD`                   | floored to ≤ 0                                                                 | (none)                                                                    |

Codes are ordered most-important-first, as in the engine (`reasonCodes.ts:1-5`); the UI must render at least the first code of any shown value (mvp-scope F7's "every visible recommendation shows at least one plain-language reason", applied here to estimates).

### 11.3 PI-001 integration

PI-001 (entry-time "Are you sure?") and this feature are complementary and must stay separate: PI-001 protects the facts at entry; this feature protects derived numbers from the facts that got through.

| PI-001 question                                   | Answer for v1                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Weight/rep swaps (`8 × 90`)                       | Structurally excluded: RTF 90 > 15. The 90-rep set never reaches an observation; the session becomes `NO_ELIGIBLE_SETS` if it was the only set.                                                                                       |
| Order-of-magnitude (`1100 × 5`, `11 × 5`)         | `11 × 5` beside `110 × 5` sets is sub-modal → excluded (example E). `1100 × 5` in a session of 110s is above modal → included → session e1RM lower median of `[135.67 ×4, 1356.67]` = 135.67; the best is unaffected; if it were the only set, the observation is 1356.67 and the best becomes "unconfirmed" and visibly absurd — and the set is editable in history. |
| Unusually large changes                           | The current estimate is a lower median of three; one session cannot move it more than one rank. The best is labeled unconfirmed.                                                                                                      |
| Confirmation before affecting estimates           | Not in v1. PI-001's "Log anyway" leaves no persisted trace, so the estimator cannot know; it treats every fact equally and relies on robustness plus labeling.                                                                         |
| Confirmed outliers remain eligible?               | Yes. A confirmed genuine PR is real evidence; the "unconfirmed" label clears when a second session comes within 10 %.                                                                                                                 |
| Quarantine vs. exclusion                          | **Exclusion only**, by deterministic per-set rules. Quarantine would need a persisted state ("confirmed", "suppressed") — a new fact on the execution path, rejected for v1 (X-5). If PI-001 is built, its comparison baseline may use this feature's `currentE1RM` as an additional signal (D-6), never the reverse. |

---

## 12. Worked fixtures — 110 × 5 versus 95 × 12

Fixture: one week contains session A (5×5 @ 110 kg, Monday) and session B (3×12 @ 95 kg, Thursday), same exercise (barbell, `loadStepKg` 2.5), both completed, non-deload, within the window; RIR assumed uniform per session for the tables. Next week's prescription is one of 5×5, 3×8, 3×12 with target RIR band 0–2 (so `targetRir = 2`).

### 12.1 Set-level e1RM by reported RIR (kg)

| Source          | RIR 0 (RTF)   | RIR 1         | RIR 2         | RIR 3         |
| --------------- | ------------- | ------------- | ------------- | ------------- |
| 110 × 5         | 128.33 (5)    | 132.00 (6)    | 135.67 (7)    | 139.33 (8)    |
| 95 × 12         | 133.00 (12)   | 136.17 (13)   | 139.33 (14)   | 142.50 (15)   |

Under every formula in §6.1 the 12-rep session implies the higher e1RM (Epley +3.7 kg at equal RIR; Brzycki +13 to +19 kg; only the flat Lombardi/O'Conner reverse it). Lower reps plus heavier weight therefore does **not** win — and should not: at equal RIR both are plausible expressions of the same athlete, and the pooled lower median (`128.33`, `132.00`, `135.67`, `139.33` at RIR 0/1/2/3) picks the 5-rep session's value precisely because it is the lower one.

### 12.2 Which source governs each target (target RIR 2 unless stated)

| Target | Rep distances (A: 5, B: 12) | Tier         | Basis                                  | Raw load                                     | Floored (2.5) | Confidence (RIR reported, both ≤ 4 days old) |
| ------ | --------------------------- | ------------ | -------------------------------------- | -------------------------------------------- | ------------- | -------------------------------------------- |
| 5×5    | A: 0, B: 7                  | **direct**   | A's modal load                         | 110.0 (no formula)                           | **110.0**     | medium (one direct session; `RIR_MODERATE_RANGE` if A had RIR 3s) |
| 3×12   | A: 7, B: 0                  | **direct**   | B's modal load                         | 95.0 (no formula)                            | **95.0**      | medium (one direct session; `EXTENDED_REP_RANGE`) |
| 3×8    | A: 3, B: 4                  | **nearby**   | A only (B is remote at distance 4)     | e1RM(A) / f(10): RIR 2 → 135.67/1.3333 = 101.75 | **100.0**     | medium (nearby, single session)              |

Cross-check for 3×8: the pooled estimate is `lowerMedian([135.67, 139.33]) = 135.67` (RIR 2) → the same 101.75, so `NEARBY_POOLED_DISAGREE` does not fire (0 % apart). Cap: `max(110, 95) × 1.10 = 121` — not binding.

The 3×8 suggestion across plausible RIR readings of the sources:

| Source RIR (both) | Nearby basis e1RM (A) | Target RIR 0 | Target RIR 1 | Target RIR 2 (band max, used) |
| ----------------- | --------------------- | ------------ | ------------ | ----------------------------- |
| 0                 | 128.33                | 101.3 → 100  | 98.7 → 97.5  | 96.3 → **95**                 |
| 1                 | 132.00                | 104.2 → 102.5 | 101.5 → 100 | 99.0 → **97.5**               |
| 2                 | 135.67                | 107.1 → 105  | 104.4 → 102.5 | 101.8 → **100**             |
| 3                 | 139.33                | 110.0 → 110  | 107.2 → 105  | 104.5 → **102.5**             |

And if the sources had **no RIR** (effort-matched rule): basis 128.33 (lower bound), target RIR 0 → 101.3 → **100**, flagged `RIR_MISSING_LOWER_BOUND`, `TARGET_RIR_EFFORT_MATCHED`, confidence medium.

### 12.3 The distinctions the brief asked for

| Dimension            | 5×5 target                                    | 3×8 target                                              | 3×12 target                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| Target specificity   | A is exact                                    | A is nearest (3 away); B is 4 away                      | B is exact                                   |
| Estimated strength   | irrelevant — no formula used                  | 135.67 (A, RIR 2); pooled agrees                        | irrelevant — no formula used                 |
| Reliability          | one observed load; RIR 3s degrade             | single nearby session; formula extrapolation (3 reps)   | one observed load; RTF 14 is extended range  |
| Session fatigue      | absorbed by RIR-adjusted median               | same                                                    | same                                         |
| Recency              | ≤ 21 days → no cap                            | same                                                    | same                                         |
| Confidence           | medium                                        | medium                                                  | medium                                       |
| Suppressed when      | last session was A (carry-forward compatible) | never suppressed by A or B (both ≥ 2 away)              | last session was B                           |

### 12.4 Single-source variants (only one session exists)

| Only session | Target 5×5, RIR 2                                                                 | Result                                                                   |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| B (95 × 12)  | remote (distance 7 ≥ 6); e1RM 139.33 / f(7) = 119.4; cap 95 × 1.10 = 104.5 → 102.5 | **102.5**, low confidence, `CAPPED_AT_RECENT_MAX_LOAD`, `REP_DISTANCE_FAR` |
| A (110 × 5)  | target 3×12, RIR 2: nearby? distance 7 → remote; 135.67 / f(14) = 92.5; cap 121    | **92.5**, low confidence (`REP_DISTANCE_FAR`)                            |

The cap in the first row deliberately under-shoots the athlete's real 5-rep load (110) by 7.5 kg; the engine's `increase_load` recovers that in three sessions, whereas an over-shoot on a 5-rep set is a failed set (O-3).

### 12.5 Estimate-level fixtures

- Best: after A and B (RIR 2): `best = 136.17` (B, session lower median) — but with RIR 3 on A, best = 139.33 (A). Unconfirmed? Other observation 135.67 ≥ 0.9 × 139.33 = 125.4 → confirmed.
- Current after four weekly sessions `[136, 133, 139, 128]` (oldest first, all within 90 d): basis = last three `[133, 139, 128]` → lower median **133**.
- Two sessions `[136, 180]`: current = 136 (lower), spread 32 % → `OBSERVATIONS_DISAGREE`: no suggestion; estimate shown at low confidence; best 180 labeled unconfirmed.
- Three sessions `[136, 133, 180]`: current **136**; best 180 unconfirmed. `[136, 133, 12.8]` (typo session): current **133**; the typo session shows on the trend as an obvious low point and is editable.

---

## 13. Persistence and versioning decision

**Computed on read. No cache table, no derived column, no snapshot field, no new fact.**

| Option                                     | Verdict     | Reason                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calculation on demand                      | **Chosen**  | `architecture-plan.md:118`, `data-model.md:388`, `implementation-plan.md:223` already place e1RM here; ADR-007 mechanism 3 is the precedent. Scale: ≈10k set rows/year (`data-model.md` §6); a per-exercise series is a few hundred rows for years of training; the bundle already runs one history query per prescribed exercise (`today/service.ts:515`). |
| Caching (memory/table)                     | Rejected    | No measured read-performance need; would inherit the re-evaluation obligations recommendations have on set edits (`sync/service.ts:862-884, 932-939`) and D-03's accepted arrival-order risk on the post-completion correction path.                                                    |
| Versioned derived observations (table)     | Rejected    | Would be the second persisted derived artifact; recommendations earn theirs by carrying a user Decision (`architecture-plan.md:120`). A suggestion has no decision in v1.                                                                                                              |
| Compute only after session completion      | Adopted as an eligibility rule, not a persistence event | Observations use completed sessions only; nothing runs inside the completion transaction.                                                                                                                                                                              |
| Recompute after historical edits           | Free        | On-read derivation makes every edit immediately visible on the next read.                                                                                                                                                                                                              |

**Historical charts recompute under the current algorithm version.** Nothing is preserved from earlier versions, for the same reason volume uses one convention for all history: uniform convention keeps a trend comparable (ADR-007 mechanism 3; `volume-model.md` §3). Each DTO carries `algorithm {id, version, formula}`; a bump changes every displayed number at once and the UI states the version in the page footer. If a future version records used suggestions as facts (D-2), those facts freeze the version they were produced under — exactly as recommendations freeze `strategyVersion`.

Auditability: a displayed value is reproducible from `set_logs` + the algorithm version + `asOf`; the detail endpoint returns the observations and basis session ids that produced it.

---

## 14. Progression integration and precedence

**v1 position: outside progression, advisory, self-limiting.** The suggestion is not a recommendation (no `recommendations` row, no decision, no reason codes from the engine's enum), not a strategy input, and not a prefill mutation. Among the brief's options: "appear as separate informational guidance" now; "initialize weight only after a meaningful prescription change" is exactly its firing condition, but the initialization is by the athlete's tap, not by the system; "ordinary recommendation" and "input to a strategy" are deferred with triggers (D-1, D-5).

### 14.1 Precedence table

| Situation                                                                                     | Prefill (unchanged chain)                                    | Recommendation card                                  | Starting-suggestion card                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Pending rec, rep-compatible with T                                                            | decision/history as today                                    | shown, governs                                       | **suppressed** (`PENDING_RECOMMENDATION_COMPATIBLE`)                                                                     |
| Pending rec whose rep basis is ≥ 2 from T (scheme changed after the source session)          | as today (rec target is not in the prefill; carry-forward may be rep-incompatible) | shown, with an added line "for N-rep sets"           | shown when the carry-forward source is rep-incompatible; copy names both                                                  |
| No pending rec; carry-forward source rep-compatible                                           | carry-forward                                                | —                                                    | suppressed (`CARRY_FORWARD_REP_COMPATIBLE`)                                                                               |
| No pending rec; carry-forward source rep-incompatible (target reps changed)                   | carry-forward (possibly wrong for T — visible, labeled)      | —                                                    | **shown** with tier/confidence/reasons and a one-tap "Use"                                                                |
| Decision heads the chain but its rep basis is ≥ 2 from T                                      | decision's chosen load (as today)                            | —                                                    | shown; copy: "Prefilled load comes from a 5-rep decision"                                                                |
| Exercise newly added to a template, history elsewhere                                         | carry-forward finds it (history is template-agnostic)        | none (decisions are block-scoped)                    | shown only if that history is rep-incompatible                                                                            |
| No matching history at all                                                                    | baseline or empty                                            | —                                                    | `none` with `NO_ELIGIBLE_SETS`; a muted "no estimate yet" line only if the exercise is eligible                          |
| Offline recommendation not yet converged                                                      | as today                                                     | client-computed rec shown from local aggregate       | the bundle-time suggestion is shown as-of `generatedAt`; after convergence and refetch it may become suppressed          |
| Historical sets edited after the bundle was built                                             | next bundle recomputes                                       | pending recs re-evaluate (existing)                  | recomputed on the next bundle; the in-session copy is frozen for the workout (advisory only)                              |
| Deload week / deload session                                                                  | modified prefill                                             | blanked (`recommendationForDeload`)                  | **blanked** by the same guard pattern — a deload week must not start from a translated full-load estimate               |

### 14.2 Why no feedback loop

The suggestion reads facts (`set_logs`) and never reads `recommendations` or itself; it is never written; the athlete's actual reps and RIR — not the suggested number — become the next evidence. A too-heavy start yields low RIR or missed reps (lower e1RM, engine hold); a too-light start yields RIR ≥ 5 (excluded) or RTF > 15 (excluded), so easy sessions cannot _lower_ the estimate, and after the first session at the new scheme the carry-forward source is rep-compatible and the suggestion falls silent. The one genuine degradation path is missing RIR everywhere (§15, R-2), where the estimate tracks the prescription rather than capacity; it is disclosed by `RIR_MISSING_LOWER_BOUND` and medium confidence, and the engine's `reps_only` progression is unaffected.

### 14.3 Recorded interactions with existing rules

- The rep-compatibility gate is evaluated from `inputs.prescribed.scheme` and `decision.chosen.reps` of persisted records — no new field.
- `recommendationForDeload` (`deloadGuard.ts:14-16`) is the template for the suggestion's deload guard: applied in `buildTodayBundle`, at `startSession`, and in the card.
- `historyDepthUsed` and `HISTORY_DISPLAY_LIMIT` are untouched; the server computes the suggestion from its own bounded query, so the engine's offline history slice stays byte-identical.

---

## 15. Offline and sync design

- **Server-side computation only in v1.** The client holds at most 5 sessions per today-scheduled exercise (`HISTORY_DISPLAY_LIMIT`), no cross-exercise history, no all-time series; a client computation would diverge from the server's (window vs. 5-session cap) and violate determinism across environments. Putting the pure module in `src/domain/strength/` keeps client computation _possible_ later (D-7) without a rewrite.
- **What Today carries.** Two optional per-exercise fields: `strengthEstimate` (current + best, compact) and `startingSuggestion` (full DTO with reason codes). Declared in `src/server/today/service.ts` and mirrored optionally in `src/sync/types.ts` (the L-4 tolerance rule). Absent fields (old cached bundles) render as "no estimate".
- **Cached/offline display.** The bundle is cached in IDB without TTL (`bundleCache.ts`) and by the SW for 24 h; the card shows "as of <generatedAt>" like the existing stale banner. At `startSession` the suggestion is frozen into the device-local aggregate (like warm-up checklist state) so it survives refresh and relaunch; it is not synced and dies with the aggregate. Cross-device adopt loses it (the same accepted limitation as warm-up O-3).
- **Shared-domain implementation.** The math is one pure module; the server is the only caller in v1. If a client caller is added, the bundle must carry the full observation window, not raw sets, to keep outputs identical.
- **Outbox and replay.** Zero impact: no new entity, no new op, no payload field. `SYNC_ENTITIES` unchanged (`domain/sync/schema.ts:25-33`); W-1 is not re-opened.
- **Before/after convergence.** Before: the suggestion reflects the server's facts at bundle time (pending offline edits not included). After: the next bundle fetch recomputes. Neither state can corrupt anything because nothing is written.
- **New sync entity necessary?** No. "Used the suggestion" is observable post hoc (first work set equals the floored suggestion) and is not recorded in v1 (D-2).
- **Exercise strength page** is online-only, like history and volume (`pwa-offline-strategy.md` §2 capability matrix); `NetworkOnly` in the SW like every other API GET (`sw.ts:278-286`).

---

## 16. UI proposal

### 16.1 Surfaces

| Surface                                           | Shows                                                                                                                                                                                                                  | Notes                                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exercise strength page** `/exercises/[id]/strength` (new route, linked from the library row and from the workout card) | Header: "Estimated 1RM" with current (≈ kg, confidence, first reason) and estimated best (≈ kg, date, "unconfirmed" when applicable). Trend: chronological list of observations (date, `modal × reps @ RIR`, ≈ e1RM, flags; deload rows badged and greyed) plus an inline SVG sparkline (no chart library; OD-04 stays open). "What-if" calculator: reps + RIR inputs → estimated load from the current estimate, same rules and reason codes as the suggestion, no cap suppression hidden. Footer: algorithm id/version and the sentence "Estimates only — not tested maxes." | The `/exercises/[id]` edit form is untouched; the new `strength_estimate` toggle lives in the form (O-2).                                       |
| **Workout execution card**                        | When a suggestion exists: a compact line under the prescription — "Starting suggestion ≈ 100 kg · medium · estimated from sessions at nearby rep counts" with **Use** (fills the weight input) and a disclosure of all reason codes. When `none` on an eligible exercise with a rep-incompatible prefill: one muted line, e.g. "Prefilled 110 kg comes from a 5-rep session; no estimate for 12 reps yet". | Card visually distinct from `RecommendationCard`; never labeled "recommendation"; hidden on deload sessions.                                    |
| **Today**                                         | Nothing new in v1 (O-4); optionally a tiny "est." marker next to an exercise whose card will show a suggestion (D-8).                                                                                                    | Keeps the one-tap Start unchanged.                                                                                                              |
| **Template / prescription editing**               | Nothing in v1. A future "expected starting load for this scheme" preview would use the same endpoint (D-9).                                                                                                             |                                                                                                                                                 |
| **Progression review (recommendation card)**      | No change except the rep-basis line when a pending rec's basis differs from today's target (§14.1).                                                                                                                     |                                                                                                                                                 |

### 16.2 Copy rules

Must never appear: "1RM" or "max" without "estimated"; "PR" or "personal record" for an estimated value; any invitation to test a max; "predicted", "will lift", "you can lift"; unqualified decimals (≈ 135.67 kg); the word "recommendation" or "recommended" for a suggestion; "accurate", "precise", "scientifically".

Acceptable: "estimated 1RM (e1RM)", "≈ 136 kg", "estimated best", "starting suggestion", "based on N sessions", "lower bound (RIR not logged)", "estimates only — a convention, not a measurement", "post-deload dips are expected" (B6/EVIDENCE-025).

Structural rule: every rendered value is produced by one formatter (`formatEstimate`) that prepends "≈" and appends "est." — a value cannot reach the screen without the label, the way `reasonCopy` guarantees a phrase for every code.

---

## 17. Data-model impact

| Change                                                                                                 | Kind                                       | Migration | Sync | Snapshot |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------- | ---- | -------- |
| `exercises.strength_estimate text not null default 'auto' check in ('auto','off')` (O-2)               | planning-world metadata, mutable, not snapshotted (like `equipment`) | one additive file | none | none     |
| Seed: `off` for `machine-assisted-pull-up` and `dumbbell-farmers-carry` on _new_ inserts; existing rows are left to the user's toggle (the seed is insert-if-absent, `db/seed/exercises.ts`) or to a Release-2-style reconcile step (owner's choice) | seed catalog                               | —         | —    | —        |
| Bundle DTO: `strengthEstimate?`, `startingSuggestion?` on `TodayBundleExerciseEntry`                   | wire (GET only), optional on the client    | —         | none | none     |
| Client aggregate: `startingSuggestion?` per exercise, frozen at `startSession`                         | IDB only; no op payload                    | IDB store version unchanged (additive optional field) | none | none |
| `GET /api/exercises/[id]/strength?asOf=` → `StrengthEstimateDto` with `observations[]`                 | new read endpoint                          | —         | —    | —        |
| **No** change to `set_logs`, `session_exercises`, `workout_sessions`, `recommendations`, `PrescriptionSnapshot` (`v` stays 1), `SYNC_ENTITIES`, op schemas, `InputsSummary` | —                                          | —         | —    | —        |

Optional, deferred: a `load_semantics` column (per-hand/total, assistance, bodyweight-plus-external) is the honest long-term answer to F-2 but is not required for v1's math (D-3).

---

## 18. Invariants, risks, and non-goals

### 18.1 Invariants (binding for implementation and review)

- **I-1** Nothing produced by this feature is persisted server-side or enters the outbox; `SYNC_ENTITIES` and every op schema are byte-identical before and after.
- **I-2** The feature reads `set_logs`, `session_exercises`, `workout_sessions`, `exercises` only — never `recommendations`; enforced by an import-graph test in the style of `tests/unit/progressionBoundary.test.ts`.
- **I-3** `src/domain/progression/*` is unchanged; no strategy, config schema, reason code, or `InputsSummary` field is added.
- **I-4** Every DTO carries `algorithm {id, version, formula}`; any behavior change bumps `version`.
- **I-5** Same inputs + same `asOf` + same version ⇒ byte-identical output (no clock, no randomness, fixed operation order).
- **I-6** `currentE1RM ≤ bestE1RM` whenever both exist; deload observations never contribute to either or to a suggestion.
- **I-7** A suggestion is emitted only when the carry-forward source and any pending recommendation are rep-incompatible with today's target; it is never emitted for `bodyweight`/`other` equipment, for `strength_estimate = 'off'`, for target RTF outside `[3, 15]`, for rep distance > 8, or on a deload session.
- **I-8** Suggested loads are floored to `loadStepKg` and never exceed 110 % of the heaviest working load in the evidence window.
- **I-9** No reported RIR is altered, averaged into a decimal, or inferred from a prescription; missing RIR is a flagged lower bound.
- **I-10** Every displayed value carries the "estimated" label; no UI string presents an estimate as a tested max or as a recommendation.
- **I-11** The prefill chain (`resolveWorkingTargets`) and `PrescriptionSnapshot` are unchanged in v1; "Use" only fills the input.

### 18.2 Risks

| ID  | Risk                                                                                                   | Mitigation                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | Unflagged warm-up ramps (F-1) drag session estimates down                                              | Modal-load working-set rule; O-5 adds the warm-up toggle; `SUB_MODAL_SETS_EXCLUDED` is visible in the trend.                                          |
| R-2 | Missing RIR makes the estimate a lower bound that tracks the prescription (downward drift on rep-capped schemes) | Flag + confidence ≤ medium; effort-matched translation; copy nudges "log RIR to improve estimates"; the engine progresses independently.              |
| R-3 | Subjective RIR (±1 rep, EVIDENCE-030; worse far from failure, EVIDENCE-014)                           | RIR ≥ 5 excluded, 3–4 degraded; rounding to load steps; 1 kg display rounding; B8/B11 posture.                                                         |
| R-4 | Rapid strength change (novice, return from layoff) lags a three-session median                        | Direct tier uses the latest same-rep load; the engine's per-session steps dominate anyway; the window resets after 90 days.                             |
| R-5 | Training gap / detraining                                                                              | Null current estimate after 90 days; "last estimate on <date>" copy; B6 framing.                                                                       |
| R-6 | Pain or injury — athlete is weaker than the estimate                                                   | The suggestion is advisory and floored; copy "start lighter if unsure"; nothing auto-applies. Not a medical feature (no claims).                       |
| R-7 | Unstable load semantics (dumbbell per-hand switch, machine change, `equipment` edited)                 | Per-exercise series only; `strength_estimate = 'off'` switch; `MIXED_LOADS`/spread flags surface inconsistency; no cross-exercise inference.           |
| R-8 | Tiny datasets                                                                                          | One session → low confidence; two disagreeing → no suggestion; honest "insufficient evidence" states.                                                  |
| R-9 | Extrapolation outside reliable rep ranges                                                              | RTF domain 1–15, core ≤ 10; rep distance ≤ 8, ≥ 6 low; target RTF ≥ 3.                                                                                  |
| R-10 | Aggressive rounding on small loads (2.5 kg step on a 15 kg estimate = 17 %)                            | Floor to step; below-minimum guard; owner may set a smaller `loadStepKg` per exercise (already editable).                                              |
| R-11 | Recommendation feedback loops                                                                          | I-2, I-11, §14.2.                                                                                                                                       |
| R-12 | Old estimates becoming self-reinforcing                                                                | 90-day expiry; the best never feeds translation; only facts feed the estimate.                                                                          |
| R-13 | Bundle staleness (no IDB TTL)                                                                          | "as of" copy; suggestion recomputed on every online Today load.                                                                                          |
| R-14 | Two vocabularies of reason codes confuse readers                                                       | Separate enums, separate copy maps, distinct card styling; the suggestion never uses the word "recommendation".                                         |

### 18.3 Non-goals (v1)

- **N-1** No `percent-1rm` strategy, no `percent1RM` load mode, no strategy input from the estimate.
- **N-2** No persisted estimate, suggestion, or "used suggestion" fact.
- **N-3** No bodyweight, assisted, or `other`-equipment estimates; no bodyweight join.
- **N-4** No cross-exercise inference, no exercise-family ratios, no merge by name or muscle.
- **N-5** No live in-session "you just set a PR" hints; the estimate moves only after completion.
- **N-6** No RIR correction, calibration, or trust-weighting by demographics (GAP-07).
- **N-7** No charting library decision (OD-04 stays open; inline SVG only).
- **N-8** No change to PI-001's design; no entry-time blocking based on the estimate.

---

## 19. Acceptance criteria and negative controls

Each is a demonstrable test; tags: (Domain) plain fixtures, (Integration) PGlite, (Wire) contract, (UI) Chromium at 390×844, (Boundary) import graph / grep.

- **A-1** (Domain) The §12.1 table reproduces exactly for RIR 0–3 (both sources), and `setE1rm(100, 1) === 100`.
- **A-2** (Domain) Session examples A–F in §7.5 produce the stated lower medians, maxima, spreads, and flags; the 11 kg set in E and the ramp sets in F are excluded with `SUB_MODAL_SETS_EXCLUDED`.
- **A-3** (Domain) A set with `isWarmup = true`, `weightKg = 0`, `rir = 5`, or RTF 16 never contributes; a set with `rir = 4` or RTF 15 contributes with the right flag.
- **A-4** (Domain) The §12.2 targets yield 110 / 100 / 95 with tiers direct / nearby / direct; §12.4 yields 102.5 with `CAPPED_AT_RECENT_MAX_LOAD` and 92.5 with `REP_DISTANCE_FAR`.
- **A-5** (Domain) Current estimate: `[136,133,139,128]` → 133; `[136,180]` → 136 with `OBSERVATIONS_DISAGREE` and no suggestion; `[136,133,180]` → 136 and best 180 unconfirmed; `[136,133,12.8]` → 133.
- **A-6** (Domain) Determinism: identical inputs evaluated twice are deep-equal; a permuted input order yields identical output.
- **A-7** (Domain) A deload observation is present in `observations[]` with `DELOAD_SESSION`, absent from best/current/suggestion.
- **A-8** (Domain) A suggestion is `none` with `CARRY_FORWARD_REP_COMPATIBLE` when the carry-forward rep basis is within 1 of T, and with `PENDING_RECOMMENDATION_COMPATIBLE` when a compatible pending rec exists; both suppressions are lifted when the basis is 2 away.
- **A-9** (Domain) Target RTF 2 (1 rep @ RIR 1) → `TARGET_NEAR_MAXIMAL_NOT_SUGGESTED`; target 20 reps @ RIR 0 → `TARGET_OUTSIDE_FORMULA_DOMAIN`; rep distance 9 → `REP_DISTANCE_TOO_FAR`.
- **A-10** (Domain) Missing RIR on the basis → effort-matched (RIR 0 both sides) even when the band is 0–2; reported RIR → band max used.
- **A-11** (Integration) Editing a historical set's weight through the sync path changes the next `GET /api/exercises/[id]/strength` response; deleting it removes the observation; no table other than `set_logs` (and `updated_at` on renumbered siblings) changes.
- **A-12** (Integration) `buildTodayBundle` emits `startingSuggestion` only for the rep-incompatible case and never on a deload week; `getActiveSession` is unchanged.
- **A-13** (Integration) Completing a session does not insert, update, or read any row outside the existing evaluation path (query log shows no `recommendations` read by the strength service).
- **A-14** (Wire) `SYNC_ENTITIES`, all op schemas, and `MAX_OPS_PER_BATCH` are byte-identical to `7d6bc6c`; the reconnect-idempotence and lost-response e2e suites still pass unchanged.
- **A-15** (Boundary) `src/domain/strength/**` imports only `src/domain/**`; `src/server/strength/**` does not import `src/domain/progression/{evaluateSession,loadProgression,repProgression}` or the `recommendations` schema; `src/domain/progression/**` does not import `src/domain/strength/**`.
- **A-16** (Boundary) A grep of `src/` and `drizzle/` shows no table or column storing e1RM, suggestion, or confidence.
- **A-17** (UI) Every rendered estimate string contains "≈" and "est."; the strings "PR", "personal record", and bare "1RM" do not occur in `src/ui/strength/**`.
- **A-18** (UI) Tapping **Use** fills the weight input only; logging that set produces an ordinary `setLog` op; no other op is enqueued.
- **A-19** (UI) With an old cached bundle lacking the new fields, the workout screen renders and starts a session without error (the Phase 5 L-4 regression class).
- **A-20** (Negative control) The Phase 4 progression matrix (`tests/unit/progressionMatrix.test.ts`) and `workingTargets`/`carryForward` suites pass without modification.
- **A-21** (Negative control) `strength_estimate = 'off'` on an exercise with rich history yields `EXERCISE_ESTIMATE_DISABLED` everywhere and no card.

---

## 20. Implementation sequence

1. **Prerequisites (small, independent).** (a) O-2 column + migration verified on local Docker PostgreSQL 16, exercise form toggle, seed defaults. (b) O-5 warm-up toggle in set entry and history edit (schema and sync already support `isWarmup`; only `ExerciseCard`/`HistoryDetail` change). (c) Add `evidence-to-design.md` row 20 and resolve OD-06 in `open-decisions.md` (formula + `f(1)=1` convention + RTF domain), recording the date and trigger.
2. **Domain module** `src/domain/strength/` (constants, primitives, eligibility, observation, estimate, suggestion, reason codes) with the §7.5/§12 fixtures as unit tests (A-1…A-10) and the boundary test (A-15).
3. **Server service + endpoint + exercise strength page** (tracker only): `src/server/strength/service.ts`, `GET /api/exercises/[id]/strength`, `/exercises/[id]/strength` route, copy map, formatter (A-11, A-16, A-17). Review gate: independent review of the numbers against real logged history on the dev database before any device use.
4. **Bundle fields + workout card** (advisory suggestion): `buildTodayBundle` additions, `sync/types.ts` mirror, aggregate freeze at `startSession`, deload guard, card with **Use** (A-12, A-13, A-14, A-18, A-19).
5. **Device acceptance** on the iPhone PWA: rep-scheme change scenario (5×5 → 3×12 and back), offline cold launch with an old cached bundle, deload week, an exercise switched off.
6. **Observation period** before any v2 item (D-1, D-2, D-5): at least one full block of real use with the suggestion card, so the feedback-loop and R-2 concerns are judged on data.

Size estimate: S for steps 1–2, M for 3–4 combined; no execution-fact or sync surface is touched, so the review load is on the domain fixtures, not on convergence.

---

## 21. Binding recommendations

- **B-1** v1 = informational tracker (current + best + trend + what-if) **and** an advisory starting suggestion, shipped together, isolated from progression (§1, §14).
- **B-2** Formula: Epley with `f(1) = 1`, RTF = reps + RIR, RTF domain 1–15 (core ≤ 10), RIR 0–4 eligible (3–4 degraded), ≥ 5 excluded; algorithm id `e1rm-epley-rir` v1 carried on every DTO (§6).
- **B-3** One observation per completed non-discarded session: lower median of working-set e1RMs, working sets = eligible sets at or above the modal load (§7).
- **B-4** `currentE1RM` = lower median of the most recent three non-deload observations within 90 days; `bestE1RM` = all-time max of non-deload observations with an "unconfirmed" label at >10 % above every other observation (§8).
- **B-5** Suggestion tiers direct (±1) → nearby (2–3) → remote (pooled); nearby/pooled disagreement >10 % takes the lower; no suggestion beyond rep distance 8, outside target RTF 3–15, for two observations >20 % apart, or on deload (§9, §10).
- **B-6** Target effort = band max when the basis reported RIR, otherwise effort-matched RIR 0 on both sides; floor to `loadStepKg`; cap at 110 % of the heaviest recent working load (§10).
- **B-7** Suggestion fires only when the carry-forward source and any pending recommendation are rep-incompatible; it is a card with a **Use** tap; the prefill chain, snapshots, recommendations, and decisions are untouched (§14).
- **B-8** Computed on read, server-side; two optional bundle fields; device-local freeze at session start; no cache, no table, no sync entity (§13, §15).
- **B-9** Eligible equipment: barbell, dumbbell, cable, machine; per-exercise `strength_estimate` switch; `bodyweight` and `other` excluded (§5).
- **B-10** Separate reason-code enum and copy map; the §11 confidence caps; "estimated" on every value; the §16.2 refusal list.
- **B-11** Deload sessions are shown badged on the trend and excluded from current, best, and suggestion; a deload week/session never shows a suggestion.

---

## 22. Deferred and rejected alternatives

### Deferred (with triggers)

- **D-1** Promote the suggestion into the prefill chain with a rep-compatibility gate on decisions and carry-forward (a `prefillSource` field on the snapshot, version bump). Trigger: after one block of real use, the athlete reports overriding the rep-incompatible prefill on most scheme changes.
- **D-2** Record "used suggestion" as a fact (a decision-like record) for longitudinal analysis. Trigger: D-1, or a Phase 9 dashboard need; requires a sync-contract change and a W-1 re-check.
- **D-3** `exercises.load_semantics` (per-hand/total, assistance, bodyweight-plus-external) and bodyweight-inclusive estimates via `bodyweight_entries`. Trigger: the athlete wants pull-up/dip tracking.
- **D-4** Top-set/back-off aware aggregation when the `perSet` scheme ships.
- **D-5** `percent-1rm` strategy or `percent1RM` load mode. Trigger: owner demand plus an explicit evidence-to-design row acknowledging it is heuristic; requires the registry-dispatch refactor noted in §2 (the "zero engine changes" claim in `progression-engine.md` §4 is currently aspirational).
- **D-6** PI-001 using `currentE1RM` as an additional plausibility baseline. Trigger: PI-001 implementation.
- **D-7** Client-side computation for offline what-if. Trigger: real offline need; the bundle would then carry the observation window.
- **D-8** Today-screen "est." marker; **D-9** template-editor preview of the expected starting load for a scheme. Trigger: UI feedback.
- **D-10** Widening the current-estimate basis from three to five sessions. Trigger: the three-session median proves visibly jumpy in real use.

### Rejected (and why)

- **X-1** Writing translated loads into the prefill/snapshot silently — violates "recommend, don't rewrite" and hides an estimate behind a fact-looking number (§14).
- **X-2** Emitting the suggestion as a `recommendations` row — would need a strategy id, enter the decision flow, the deload guard, supersession, and the offline dedupe path; a suggestion has no decision in v1.
- **X-3** Fractional recency weights / weighted medians / exponential decay — fake precision; the window and count do the same job explainably.
- **X-4** Set-level best (max single set) — one wrong entry becomes the record forever.
- **X-5** Quarantine state for suspicious observations — needs a persisted flag, i.e. a new fact; PI-001 plus robustness plus labeling suffice.
- **X-6** Brzycki (or any formula) chosen for "conservatism" — direction-dependent, and diverges at high reps (§6).
- **X-7** Assuming the prescribed RIR band for sets with missing RIR — invents a report; B11.
- **X-8** Per-exercise or per-equipment formula selection — no corpus basis (RG-1).
- **X-9** A cache table or precomputed series — no scale need; inherits invalidation obligations.
- **X-10** Merging exercises by name/muscle for more evidence — identity policy; OD-11.
- **X-11** Using in-progress sessions — live estimates encourage max-chasing and make the number move under the athlete's feet.

---

## 23. Owner decisions still required

- **O-1** Confirm v1 scope = tracker + advisory suggestion (B-1), rather than tracker only.
- **O-2** Accept the additive `exercises.strength_estimate` column (recommended) versus shipping without it (Assisted Pull-Up and Farmer's Carry would then show meaningless estimates).
- **O-3** Accept the upward cap at 110 % of the heaviest recent working load (recommended) versus uncapped translation to fewer reps (§12.4 shows the trade: 102.5 vs. 112.5 for a true 110).
- **O-4** Placement: new `/exercises/[id]/strength` page linked from the library and the workout card (recommended) versus embedding in the edit form; no Today changes in v1.
- **O-5** Add the warm-up toggle to set entry as a prerequisite (recommended; F-1 also affects the engine and volume today) versus accept ramps-as-work-sets with the modal-load defense only.
- **O-6** Missing-RIR policy: effort-matched lower bound (recommended) versus assuming the band's minimum (X-7).
- **O-7** Dumbbell/cable/machine/unilateral: eligible "as logged" without confidence penalty (recommended) versus excluded until D-3.
- **O-8** `other` equipment: excluded (recommended) versus eligible with low confidence.
- **O-9** Resolve OD-06 now with B-2 and leave OD-04 open (inline SVG), or resolve both.
- **O-10** Whether the exercise strength page should list deload observations (recommended: yes, badged) or hide them.

---

## 24. Research questions architecture alone cannot answer

Each is a gate for a _claim_, not for the build: v1 ships as a labeled convention regardless; these decide whether any stronger wording or any automation (D-1, D-5) may follow. Sources must meet the standard of `docs/reviews/warmup-routines-evidence-research.md` §2.2 and enter the registry before a design document may cite them.

- **RG-1** Accuracy of Epley versus alternatives by rep range (≤5, 6–10, 11–15), exercise (upper vs. lower, free weight vs. machine), and training status; whether any equation is defensible above 10 reps to failure.
- **RG-2** Validity of `reps + reported RIR` as reps-to-failure for 1RM prediction: does the ±0.4–0.9-rep error (EVIDENCE-030) compound with equation error, and does it differ at RIR 3–4 (EVIDENCE-014)?
- **RG-3** Individual variability of the reps-at-%1RM relationship (Robinson's note that reps at a load are "highly individual"): how large is it, and does it justify the direct/nearby tiers over a pooled conversion?
- **RG-4** Strength decay time course after inactivity in trained adults (beyond EVIDENCE-025's single one-week cessation), to ground the 90-day expiry and the age tiers.
- **RG-5** Minimum number of sessions and typical session-to-session variability of an RIR-adjusted e1RM, to ground the three-session median and the 10/20 % agreement thresholds.
- **RG-6** Whether machine and cable rep-load relationships behave like free-weight ones, or need separate domains.
- **RG-7** Sex- and age-specific differences (GAP-09) in the reps-to-%1RM relationship — required before any copy generalizes beyond "your own history".
- **RG-8** Whether starting-load suggestions after a scheme change improve session quality (completion, RIR adherence) versus carry-forward — an in-app before/after comparison the owner can run on their own data once D-2 records suggestions.

---

## Appendix A — Question-by-question index

| Brief question                        | Answered in                                  |
| ------------------------------------- | -------------------------------------------- |
| 1 Product scope                       | §1, §14, §21 B-1, O-1                        |
| 2 Eligible data                       | §4                                           |
| 3 Exercise and load compatibility     | §5, §17, D-3, O-2, O-7, O-8                  |
| 4 Set-level e1RM                      | §6, §7.2                                     |
| 5 Session-level aggregation           | §7                                           |
| 6 Current versus best                 | §8                                           |
| 7 Rep-range specificity               | §9                                           |
| 8 Load translation                    | §10                                          |
| 9 Multiple sources                    | §12                                          |
| 10 Confidence and outliers, PI-001    | §11                                          |
| 11 Persistence and recomputation      | §13                                          |
| 12 Progression integration            | §14                                          |
| 13 Offline and synchronization        | §15                                          |
| 14 UI and terminology                 | §16, §3                                      |
| 15 Failure modes                      | §18.2, §4.3, §14.2                           |

## Appendix B — Repository findings recorded during the evaluation (not fixed here)

- **F-1** `set_logs.is_warmup` is never set by any UI path; all sets are work sets to every consumer (`ExerciseCard.tsx:111`, `HistoryDetail.tsx`); see O-5.
- **F-2** Load semantics are not modeled: no per-hand/total, assistance, bodyweight-inclusion, or time-based fields; `equipment` is mutable and not snapshotted (§4.3, §5).
- **F-3** The catalog has 93 entries; code comments say "~90" and "52 additions" (actually 53), ADR-010 says 92 — documentation drift only.
- **F-4** `previousPerformance` in the bundle is unread by any UI component (`sync/types.ts:100`); harmless, but a candidate for removal or reuse.
- **F-5** `DELOAD_SESSION_NOT_EVALUATED` is declared and phrased but never emitted (`evaluateSession.ts:100` returns before any draft) — cosmetic.
- **F-6** `progression-engine.md` §4's "zero engine/schema changes" for a future `percent-1rm` strategy is aspirational: dispatch is a hard-coded two-member `if/else` and five registries plus the `strategy_id` check would need touching (relevant to D-5 only).

## Appendix C — Working-tree impact

Created: `docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md` (this file). Nothing else was created, modified, or deleted; the pre-existing uncommitted changes listed in the header are untouched. No commit, push, deployment, or production access was performed. A scratch script used to verify the arithmetic in §6, §7.5, and §12 lived only in the session scratchpad and is not part of the repository.
