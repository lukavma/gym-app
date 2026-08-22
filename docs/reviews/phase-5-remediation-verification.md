# Phase 5 — Targeted Remediation Verification (H-1, M-1)

Date: 2026-08-22
Scope: independent verification of `docs/reviews/phase-5-remediation.md`
against `docs/reviews/phase-5-review.md` findings **H-1** and **M-1** only.
The five deferred LOW findings were not reopened; the broad Phase 5 review
was not repeated.

Method: the remediation report and its tests were treated as claims. The
remediation diff and the surrounding code were read in full
(`deloadGuard.ts`, `today/service.ts`, `sync/activeSession.ts`,
`ExerciseCard.tsx`, `WorkoutExecution.tsx`, `TodaySection.tsx`,
`blocks/schema.ts`, `applyWeekModifiers.ts`, `setScheme.ts`, `BlockForm.tsx`,
`WeekOverrides.tsx`, and the new/changed tests). Behaviour was re-derived
with reviewer-written probes outside the repository (scratchpad
`phase5-remediation.review.test.ts` — **11 probes, 11/11 green**): the
server half runs through the real services and the real sync write path on
PGlite with a real `load-progression` evaluation; the client half runs the
real `src/sync/activeSession.ts` mutators (`startSession`, `logSet`,
`decideRecommendation`, `hydrateFromServer`) against an in-memory stand-in
for the IndexedDB layer (`@/sync/db` / `@/sync/flush` mocked), which is what
lets the "stale cached bundle" and "stale local active session" shapes be
exercised for real rather than only through the guard's unit test. GAP
probes assert the *observed* behaviour so the finding below is
reproducible. No implementation file was modified; nothing was committed,
pushed, deployed, or run against production.

---

## 1. Gates reproduced

| Gate | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | ✅ clean |
| Targeted unit (`deloadGuard`, `blockSchema`, `applyWeekModifiers`, `buildSnapshot`, `effectiveWeekModifiers`) | ✅ 5 files / 59 tests |
| Targeted integration (`progression`, `today`, `blockSummary`, `blockWeekOverrides`) | ✅ 4 files / 33 tests (21.6 s) |
| `pnpm exec playwright test tests/e2e/deload.spec.ts` (local Docker stack, fresh build) | ✅ **2 passed (37.5 s)** — the original override spec and the new load-progression H-1 spec |
| Local DB state before/after e2e | `block_week_overrides` empty, no pending recommendations left behind, port 3000 released |

---

## 2. H-1 — verified FIXED

### 2.1 What the probes establish (real `load-progression` rec, real sync path)

Original defect sequence from the review, re-run verbatim against the fixed
code (probe "fresh deload bundle carries no pending rec…"):

| Step | Observed |
|---|---|
| Week 1: 5×5 @ 100, RIR 2 through `applySyncBatch` | real rec `increase_load 102.5`, `pending` |
| Week 3 scheduled-deload bundle | `isDeload true`, `2×5`, RIR `2–4`, prefill **90**, `pendingRecommendation: null` — while the row still exists `pending` in `recommendations` |
| Client decision logic fed the deload entry | no `recommendationDecision` op can be built (nothing attached) |
| After create + exercise ops, `getActiveSession` (server-hydrated / cross-device shape) | `isDeload true`, `recommendation: null`, snapshot prefill 90 |
| Complete the deload (2 sets @ 90) | `recommendations` row **deep-equal** to its pre-deload state; no new row |
| Edit a set on the completed deload session (re-evaluation path) | row still deep-equal; nothing superseded |
| Week 4 bundle | `isDeload false`, prefill **100** (pre-deload source), `pendingRecommendation` = the same row id, target 102.5; `history` = `[deload, normal]` flagged |
| `getBlockSummary` (active, then completed) | `before 100 → after 100`, `hadDeloadSession true`, 2 sessions |
| Week 4 session logs 102.5 first set | implicit `accepted`, evaluated normally → new `pending 105`; summary `after 102.5` |

Additional server probes: a manual `deload` override with `{}` modifiers
(no target change) still suppresses the rec; switching that override to
`custom` restores the rec (custom weeks remain decidable — by design, not
reopened).

### 2.2 Client guards exercised for real

- **Stale cached deload bundle** (pre-fix shape: modifiers applied *and*
  `pendingRecommendation` attached, `isDeload: true`): `startSession` freezes
  `recommendation: null`; the first work set at 90 enqueues only a `setLog`
  op; explicit `accepted`/`modified` both throw "No pending recommendation";
  zero `recommendationDecision` ops in the outbox.
- **Stale local active session** (`hydrateFromServer` of a pre-fix session
  with `recommendation` attached and `isDeload: true`): first work set
  logged *at the rec target itself* (102.5) still enqueues only a `setLog`
  op; the local rec stays `pending` and untouched; explicit reject throws;
  `recommendationForDeload(true, …)` — the same function `ExerciseCard`
  and `TodaySection` render through — returns `null`.
- **Control** (identical rec, `isDeload: false`): first set at 102.5 enqueues
  `accepted {102.5}` as before — Phase 4 behaviour preserved outside deloads.

### 2.3 UI gating (by reading; e2e confirms the rendered outcome)

`ExerciseCard` takes `isDeload` from `session.isDeload`
(`WorkoutExecution.tsx`), and both `derivePrefill` and the
`RecommendationCard` render go through `recommendationForDeload`;
`handleDecide` reads the gated value. `TodaySection` gates the preview line
the same way. The new e2e asserts, in the real browser, no "Increase load"
text on Today, no Accept button and the deload prefill in the kg input on
the workout screen, no Accepted/Changed badge after the first set, and the
rec + prefill byte-identical after the override is removed.

### 2.4 Consistency across layers

Every gate keys on the same `isDeload` value, propagated along one path:
`effective.isDeload` → `today.isDeload` → `startSession(input.isDeload)` →
`session.isDeload` (frozen, synced, and read back by `getActiveSession`).
Server, sync client, and UI therefore agree for fresh bundles, cached
bundles (stale across a week boundary included — all layers follow the
cached week), hydrated sessions, and `custom` weeks (all layers pass the rec
through). No layer re-derives deload status independently.

### 2.5 Residual (observation, not a defect in the fix)

The guard is client-side only: the server still accepts a
`recommendationDecision` op during a deload session if an *unfixed* client
sent one (probe "RESIDUAL PROBE" — accepted, `modified {90}`, post-deload
prefill 90). The fixed client cannot construct that op in any of the three
shapes above, so for the single-device MVP this is the "optional
belt-and-braces" the review already scoped as optional. Worth a one-line
server check if multi-device ever becomes real.

**H-1 disposition: FIXED** — all eight verification points in the task
brief hold.

---

## 3. M-1 — verified FIXED for all data the API/UI can write; one gap in the claimed legacy-data defense

### 3.1 Verified

- **Boundaries** (`weekModifiersSchema`): `2`/`0.05`/`0.0001` multipliers and
  `±10` shift accepted; `2.0001`, `2.5`, `0`, `-0.5`, `5`, `±11`, `1.5` (shift),
  `NaN`, `Infinity`, unknown keys all rejected with a path-addressed issue
  (`["modifiers","setMultiplier"]`). `createBlockSchema` and
  `createWeekOverrideSchema` both route through it; the routes map a parse
  failure to `400 invalid_input`, and `BlockForm`/`WeekOverrides` now render a
  specific message for that error; inputs carry `min="0.05" max="2"` /
  `min="-10" max="10"`.
- **Clamp** (`applySetMultiplier`): `5×5 → 20`, `20×2 → 20`, `20×1 → 20`,
  `10×2 → 20`, `10×1.95 → 19`, `5×0.05 → 1`, `Infinity → 20`; floor and min-1
  unchanged; `repRange` fields preserved. The clamp is **load-bearing for
  in-bound data**: 20 sets × 2 (schema-valid) → 40 → 20, snapshot valid,
  session starts and completes through the sync path (probe).
- **Boundary values through the bundle**: ×2 on 10 sets → 20 sets, ×2 load
  → 200, shift +10 → `{10,10}`; ×0.05 → 1 set, load 5, shift −10 → `{0,0}`;
  payload builder accepts the snapshot.
- **Rounding unchanged**: `97.5×0.9 @1.25 → 87.5`, `62.5×0.9 @0.5 → 56.5`,
  `30×0.5 @2 → 16`, `102.5×0.9 @2.5 → 92.5`, `0.3×0.9 @0.1 → 0.3`,
  `101.25×1.1 @1.25 → 111.25`.
- **"Start workout" no longer fails silently**: `handleStart` catches and
  renders a `role="alert"` message (read; not exercisable by e2e without
  invalid data, which the API now refuses).

### 3.2 M-1a (MEDIUM, D — defense-in-depth gap + inaccurate report claim + test gap)

The remediation states the clamp makes effective modifier application
"always produce a PrescriptionSnapshot-valid scheme … regardless of when the
config was written". The *scheme* is indeed clamped — but
`buildPrescriptionSnapshotData` freezes `appliedModifiers` **verbatim**
(`src/domain/prescriptions/buildSnapshot.ts:64`), and the snapshot schema
validates that field with the **same, now-bounded** `weekModifiersSchema`
(`src/domain/schemas/prescriptionSnapshot.ts:39`). For a stored
out-of-range value the snapshot as a whole is therefore still invalid:

| Stored (via service, bypassing Zod) | Bundle | `buildSessionExerciseUpsertPayload` |
|---|---|---|
| block deload `{setMultiplier: 5}` on 5 sets | `sets 20` ✅, `appliedModifiers {setMultiplier: 5}` | **throws** `too_big … appliedModifiers.setMultiplier` |
| override `{loadMultiplier: 3}` | prefill 300 | **throws** (`loadMultiplier`) |
| override `{targetRirShift: 25}` | RIR `{10,10}` ✅ | **throws** (`targetRirShift`) |

Server-side the same payload is `invalid_payload`. So for such rows "Start
workout" still fails — now *visibly*, via the new `startError` message
(which does correctly point at the deload/override settings), and editing
the override back into range through the API recovers (probe). The shipped
M-1 integration test asserts only `scheme.sets === 20` at the bundle, not
snapshot validity, which is why this was not caught.

Why MEDIUM and not deploy-blocking: no such row can exist from anything the
shipped product ever wrote — the deployed `BlockForm` (HEAD `f50be14`)
always submitted `modifiers: {}`, Phase 5 itself has never been deployed, and
the local dev DB holds no block deload and no override at all. The only way
to hold an out-of-range value is a hand-crafted API call made before this
bound (production was not inspected — not permitted — so that is asserted
from the code history, not from data). After deployment the bound closes the
door for new data, and the failure mode for a hypothetical legacy row is a
visible, self-recoverable error rather than silence.

Recommended follow-up (small; fold into the L-1..L-5 pass or the next phase,
no cycle needed now): sanitize stored modifiers at resolution time (clamp
each axis into the schema range before applying *and* freezing — keeps
`appliedModifiers` consistent with what actually ran), or alternatively keep
the snapshot's `appliedModifiers` on the unbounded historical record shape;
either way, change the M-1 integration test to assert
`prescriptionSnapshotSchema.safeParse(wrapPrescriptionSnapshot(entry…)).success`
rather than `scheme.sets` alone, and correct the sentence in
`phase-5-remediation.md` §2.2.

### 3.3 The `(0, 2]` / `[-10, 10]` ceiling — judgment call, compatible with the accepted model

No binding document mandates a ceiling: `domain-model.md` §5 gives
`WeekModifiers` as user-set numbers with heuristic *examples* (0.5 / 0.9 /
+2), `prescription-model.md` §3/§5 fix only the RIR clamp `[0,10]` and the
set floor/min-1, and §6 bounds the resulting scheme (`1 ≤ sets ≤ 20`). A
`[-10, 10]` shift can reach both clamp ends from any valid band, so nothing
expressible is lost; `(0, 2]` comfortably covers every documented deload
heuristic and any plausible `custom` week, while rejecting the "5 for 0.5"
typo. It is an interpretation within the specs, not a contradiction — it
should be recorded as a judgment call in the Phase 5 report's §3 list (it
currently lives only in a code comment and the remediation report); no
`deviations.md` entry is warranted.

**M-1 disposition: FIXED** for the defect as reported (UI/API-reachable
input) — with M-1a recorded as a MEDIUM follow-up on the legacy-data claim.

---

## 4. Reproduction notes

- Reviewer suite: scratchpad `vitest.review.config.ts` + `phase5-remediation.review.test.ts`;
  `pnpm exec vitest run --config <scratchpad>/vitest.review.config.ts --root <scratchpad> phase5-remediation`
  → 11/11 (5.9 s). The two GAP/RESIDUAL probes assert the observed values
  quoted above.
- Shipped gates as in §1; e2e ran with Docker `gym-app-db-1` healthy and the
  seed fixture, the spec's own `finally` blocks restored the strategy flip
  and removed the override.

---

## 5. Verdict

**READY FOR DEPLOYMENT AND MANUAL IPHONE ACCEPTANCE.**

H-1 is fixed and proven at every required shape (fresh bundle, server-
hydrated session, stale cached bundle, stale local session), with the
recommendation row untouched, no evaluation of the deload, post-deload
carry-forward and summary on the pre-deload source, and the rec
resurfacing correctly. M-1 is fixed for everything the API/UI can write. The
one remaining item (M-1a) is a MEDIUM defense-in-depth gap with no reachable
data today and a visible, recoverable failure mode — it does not warrant a
further remediation cycle before deployment.
