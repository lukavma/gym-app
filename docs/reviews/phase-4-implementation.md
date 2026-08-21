# Phase 4 — Progression Engine v1: Implementation Report

Date: 2026-08-21
Scope: implementation-plan.md Phase 4 / mvp-scope.md F7. Local work only —
no commit, no push, no deploy, no production access. Verification ran
against the local Docker PostgreSQL 16 (`gym-app-db-1`, localhost:5432).

---

## 1. What was built

### Domain core (`src/domain/progression/`, pure + isomorphic)

- `engine.ts` — progression-engine.md §2 contract types
  (`EvaluationContext`, `PerformedExercise`, `RecommendationDraft`,
  `InputsSummary`) and the single RIR helper `checkRir` (§3: null →
  `unknown`, band comparison only, never scalar arithmetic).
- `reasonCodes.ts` — the §6 reason-code enum (19 codes), the explainability
  API. Human phrasing lives in the UI (`src/ui/recommendations/copy.ts`).
- `loadHelpers.ts` — `roundToStepKg` (nearest step multiple, 2-decimal safe)
  and `modalWorkingLoad` (most frequent work-set weight; ties break to the
  earliest set; flags `mixed` per §8).
- `loadProgression.ts` — `load-progression@1` per §4.1: completion via
  shortfall vs. tolerance, failure streak over deload-skipped history
  (entries judged against their own snapshot scheme; null-prescribed entries
  break the streak), decrease-after-consecutive-failures, and the full
  met/below/unknown/above RIR branch including `holdAtRirZero`,
  `onMissingRir`, and the narrowed-gate SUSPECT path.
- `repProgression.ts` — `rep-progression@1` per §4.2: `currentTarget` from
  the executed prefill, every-set-at-target completion, the same gate
  handling, and `onCapReached` incl. `suggest_load_increase` (= double
  progression; ships config-only, default `hold`, not advertised in UI).
- `evaluateSession.ts` — the pure half of §5 orchestration, run identically
  by the server and the offline client: skips deload sessions (case 10),
  `manual`, skipped exercises, and null-prescription ad-hoc entries;
  defensive `UNSUPPORTED_SCHEME` for unknown scheme variants; §5 persist
  rule (`action ≠ 'none' || reasonCodes ≠ []`).
- `implicitDecision.ts` — §7 first-work-set decision (load comparison after
  `loadStepKg` rounding; accepted carries the full target as `chosen`,
  modified carries the actual load only).
- `workingTargets.ts` — prescription-model.md §4 chain with its Phase 4
  head: latest accepted/modified Decision's chosen values, then the Phase 3
  carry-forward chain; rejected decisions are transparent.
- `evaluationTarget.ts` — overlays an in-session decision's chosen reps onto
  the snapshot prefill when assembling the evaluation context ("as executed
  THIS session"); snapshots themselves are never rewritten.
- `registry.ts` unchanged in its Phase 2/3 exports; strategy wiring lives in
  `evaluateSession.ts` (avoids a runtime import cycle registry ↔ strategy
  modules; the plan had placed the map on the registry — same contract,
  different file).
- `src/domain/schemas/recommendation.ts` — shared Zod for the persisted
  shapes (target, inputs summary, decision, enums).

### Schema + migration

- `src/db/schema/recommendations.ts` — data-model.md §2.15 column-for-column
  (embedded one-time decision columns; FKs: exercise RESTRICT, block SET
  NULL, source session/session-exercise CASCADE) with `ix_recs_exercise`,
  `ix_recs_pending`, and `uq_recs_one_pending` — the partial unique
  expression index on `(exercise_id, coalesce(block_id, zero-uuid)) WHERE
  decision_status = 'pending'`. drizzle-kit generated the coalesce
  expression natively; no hand-edited SQL.
- Migration `drizzle/0005_sloppy_tigra.sql` (new table only). Applied to
  local Docker Postgres; `pnpm db:generate` afterwards reports no drift.

### Sync contract (outbox-first — the only execution-fact write path)

- `src/domain/sync/schema.ts` — two new entities: `recommendation` (full-row
  create for client-computed recs; `computedBy` pinned to `'client'`; born
  pending) and `recommendationDecision` (one-time append: status
  accepted/modified/rejected, chosen, client-clock `decidedAt`, source).
  Schema-typed builders added in `payloadBuilders.ts`.
- `src/server/sync/service.ts` —
  - completion hook: an actual `in_progress → completed` transition runs
    `evaluateCompletedSession` **inside the same per-op transaction**
    (atomic with the transition; replayed completions are no-ops upstream
    and never re-evaluate);
  - supersede-on-relevant-edit: set-log upserts/deletes on completed
    sessions call `reevaluateForSourceSessionExercise` — only when the edit
    actually changes evaluation inputs (set number/warmup/weight/reps/RIR),
    so byte-identical replays and notes-only touches stay idempotent;
  - `recommendation` handler: replay-by-id no-op; source ownership +
    referential consistency checks; supersede-before-insert; new reject
    reasons `recommendation_conflict` / `decision_conflict`;
  - `recommendationDecision` handler: pending → append once; identical
    replay converges; conflicting decision or decision on a superseded
    record dead-letters (`decision_conflict`), never silently rewrites.
- `src/server/progression/service.ts` — context assembly (history = same
  exercise, completed, `started_at` strictly before the evaluated session,
  cap 5, each entry with its snapshot's prescribed scheme + work sets),
  block goal lookup, in-session decision rep overlay, supersede-and-insert
  persistence (`computed_by: 'server'`), plus the bundle/decision query
  helpers and `RecommendationDto` serialization.

### Bundle, prefill, active session (`src/server/today/service.ts`)

- History entries now carry `prescribed` (scheme + RIR band from each
  session's frozen snapshot) so the offline client evaluates with the same
  inputs as the server.
- Each bundle exercise entry carries `pendingRecommendation`; the pending
  rec never leaks into the snapshot prefill (it is not a Decision).
- Prefill is decision-aware: `buildSnapshot.ts` now takes the latest
  accepted/modified decision's chosen values and resolves working targets
  through `workingTargets.ts`.
- `getActiveSession` carries per-exercise `recommendation` + `loadStepKg`
  so cross-device adopt/resume keeps the decision flow.

### Client (`src/sync/`)

- `activeSession.ts` — `startSession` copies the pending rec into the local
  aggregate; `logSet` resolves the implicit decision on the first work set
  and commits the decision op **in the same IndexedDB transaction** as the
  set; new `decideRecommendation` (explicit accept / keep previous /
  custom); `completeSession` runs the client fallback evaluation when
  `navigator.onLine === false`, enqueueing rec ops **ahead of** the
  completion op (FIFO delivers them first; the server's completion
  evaluation skips exercises that already have a rec for that session
  exercise, so offline completions never produce duplicate records).
- `types.ts` — client mirrors of the new DTOs; `activeSessionStore.ts`
  exposes `decideRecommendation`.

### UI

- `src/ui/workout/RecommendationCard.tsx` — action + target, reason chips
  (≥1 plain-language reason always visible — F7), strategy + honest
  classification label ("heuristic — not a scientific threshold"),
  confidence, `[Accept] [Keep previous] [Custom…]` while pending, decided
  badge afterwards; `action: 'none'` records render informational-only.
- `src/ui/recommendations/copy.ts` — the full reason-code → copy map
  (compile-enforced completeness; unknown future codes fall back to the raw
  identifier so old records stay renderable forever).
- `ExerciseCard.tsx` — input prefill priority: last set this session →
  pending/accepted rec target → explicit-modify chosen → snapshot prefill
  (also the post-reject fallback).
- `TodaySection.tsx` — informational pending-rec line on the preview.

---

## 2. Key decisions (surfaced, not silent)

1. **`InputsSummary.derived.mixedLoads`** — additive to the §6 interface;
   §8 mandates mixed loads be "flagged in inputs" (confidence capped at
   medium).
2. **Rep-target overlay from in-session decisions** — §4.2 reads the target
   "from snapshot prefill"; §2 defines the context as the prescription "as
   executed THIS session". An accepted rep rec changes what was executed
   against, so the assemblers overlay chosen reps; pure strategies still
   read `prefill.reps`, snapshots are never rewritten, and rep progression
   advances one rep per earned session instead of lagging the frozen
   snapshot.
3. **Client fallback trigger** = `navigator.onLine === false` at completion
   (pwa-offline-strategy §2/§10 "if completing offline"). If the heuristic
   is ever wrong, §5's sanctioned fallback applies: prefill falls back to
   carry-forward, nothing is fabricated, and the recommendation appears
   when the completion op lands server-side.
4. **Client rec ops precede the completion op** in the outbox; the server
   accepts a client rec for an owned session in any status and dedupes its
   own completion evaluation per source session exercise. Offline
   completions therefore converge to exactly one record per exercise.
5. **Decisions on superseded records** (cross-device race) dead-letter as
   `decision_conflict` — surfaced in the sync-issues path, never silent.
6. **Rejected decisions are transparent to the carry-forward chain**; using
   them to blank the chain could change the next target, violating F7's
   "rejecting leaves next targets unchanged".
7. **Supersede-on-*relevant*-edit** — re-evaluation fires only when a set
   edit changes evaluation inputs (number/warmup/weight/reps/RIR); replays
   and notes-only updates do not churn records (required for batch-replay
   idempotence).
8. **Modal-load tie-break** = earliest logged work set (deterministic).
9. **`recommendations.created_at`** stores the client's evaluation time for
   client-computed records (a client-clock event time, consistent with
   `started_at`/`logged_at`); server receipt remains on `updated_at`.
10. **§4.2's shorthand `RIR_IN_PROGRESS_ZONE`** maps to the §6 enum's
    canonical `FINAL_SET_RIR_IN_PROGRESS_ZONE` (the §6 table is the stable
    vocabulary).
11. **`fixed` scheme + rep-progression with no `repCap`** is treated as
    uncapped — the config field is documented "required for fixed" but
    Phase 2's `defaultConfigFor` deliberately leaves it a user choice; an
    uncapped rep ladder is the least-surprise defensive reading.
12. **Corrupt snapshot config** (fails its Zod schema at evaluation time —
    should be unreachable) skips that exercise rather than failing the
    completion op; nothing is evaluated against unvalidated config.
13. **Strategy wiring lives in `evaluateSession.ts`**, not `registry.ts`
    (avoids a runtime import cycle); `strategy_version` records the registry
    version of the code that ran (all MVP strategies are v1).

## 3. Non-code repo changes

- `.prettierignore` — added `CLAUDE.md`, `gpt-memory.md`, `gpt-handoff.md`,
  `HANDOFF(depracted).md`: `pnpm format:check` must pass while those
  user-owned files must not be reformatted (explicit instruction). No
  user-owned file was modified.

## 4. Verification (exact commands, local Docker Postgres 16 only)

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm format:check` | ✅ "All matched files use Prettier code style!" |
| `pnpm typecheck` | ✅ clean |
| `pnpm typecheck:sw` | ✅ clean |
| `pnpm test:unit` | ✅ **Test Files 20 passed (20) · Tests 247 passed (247)** |
| `pnpm test:integration` | ✅ **Test Files 10 passed (10) · Tests 125 passed (125)** |
| `pnpm test:e2e` | ✅ **10 passed (56.2s)** — incl. the new `progression.spec.ts` and all Phase 3 offline/sync/takeover specs unchanged |
| `pnpm build` | ✅ production build succeeds |
| `pnpm db:migrate` (local Docker PG16) | ✅ "migrations applied successfully!" (`0005_sloppy_tigra.sql`) |
| `pnpm db:generate` drift check | ✅ "No schema changes, nothing to migrate" |
| Live `uq_recs_one_pending` check | ✅ see below |

Live constraint verification (psql in `gym-app-db-1`, all inside a rolled-
back transaction — zero leftover rows confirmed):

```text
=== expect ERROR: second pending for same (exercise, block) ===
ERROR:  duplicate key value violates unique constraint "uq_recs_one_pending"
DETAIL:  Key (exercise_id, COALESCE(block_id, '00000000-…'::uuid))=(…ab, …ad) already exists.
=== expect ERROR: second pending in the null-block slot ===
ERROR:  duplicate key value violates unique constraint "uq_recs_one_pending"
DETAIL:  Key (exercise_id, COALESCE(block_id, '00000000-…'::uuid))=(…ab, 00000000-0000-0000-0000-000000000000) already exists.
=== expect OK: pending insert after supersede ===
INSERT 0 1
leftover_test_rows = 0
```

New test coverage:

- **Unit** — `progressionMatrix.test.ts`: all 14 §9 cases literally, plus
  `checkRir` bands, rounding, modal-load tie-break + mixed-load flag,
  `NO_WORK_SETS_LOGGED`, `INSUFFICIENT_HISTORY`, deload streak skipping,
  and the `evaluateSession` skip rules; `implicitDecision.test.ts`;
  `workingTargets.test.ts`. (35 new tests.)
- **Integration** — `progression.integration.test.ts` (12 tests): server
  evaluation on completion with frozen config/inputs; batch-replay
  idempotence (no rec churn); supersede via next session; live
  `uq_recs_one_pending` under PGlite too (incl. null-block slot);
  supersede-on-edit and on-delete while pending; no recomputation after a
  decision; one-time decision append (identical replay converges,
  conflicting decision → `decision_conflict`, unknown → `not_found`);
  reject leaves the `exercise_prescriptions` row byte-identical and the
  next bundle prefill unchanged; accepted chosen values head the bundle
  prefill; pending rec rides the bundle without touching the prefill;
  client-computed rec dedupe.
- **E2E** — `progression.spec.ts`: complete workout → recommendation with
  plain-language reason on Today and the next workout → prefill equals the
  recommended target → first work set implicitly accepts → accepted target
  is the next carry-forward baseline. Rerun-safe (priming workout) and
  restores the seed's `manual` strategy afterwards.

## 5. Known limitations

- Block `goal` is not in the cached bundle, so client-fallback contexts omit
  it; v1 strategies never read `goal`, so client and server evaluations stay
  equivalent. Must be revisited if a future strategy consumes block context.
- The client fallback only triggers on `navigator.onLine === false`; a lying
  `onLine` (captive portal) defers the recommendation to whenever the
  completion op syncs (spec-sanctioned fallback, §5).
- If consecutive sessions are completed fully offline, the second session's
  bundle-cached history/pending-rec may predate the first — recommendations
  still converge server-side; only the offline card can be stale (staleness
  is an accepted bundle property, pwa-offline-strategy §4).
- Decision UI exists in the active workout only (per §7 "at next workout
  start"); Today shows an informational preview.
- `manual@1` remains what it is specified to be: no evaluation, no records.

## 6. Deviations

No new entries for `docs/architecture/deviations.md`: every judgment call in
§2 is an interpretation within the specs' stated intent, not a contradiction
between binding documents. D-03 (arrival-order field patches) is unchanged
and untouched by this phase; decision/recommendation ops are new op types
with their own explicit conflict semantics, not amendments to that contract.

## 7. Pending manual acceptance

- Real-iPhone pass (installed PWA): recommendation card renders, accept /
  keep previous / custom work with gym gloves-level tap targets, implicit
  accept fires on the first logged set, offline completion produces a
  client-computed recommendation after reconnect.
- Deploy + independent review remain outside this phase's authorization.

---

**READY FOR INDEPENDENT REVIEW**
