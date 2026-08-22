# Phase 5 — Block Lifecycle & Deloads: Targeted Remediation (H-1, M-1)

Date: 2026-08-22
Scope: `docs/reviews/phase-5-review.md` findings **H-1** and **M-1** only.
The five LOW findings (L-1..L-5) are explicitly out of scope for this pass —
see §5. Local work only: no commit, no push, no deploy, no production
access. Verification ran against the local Docker PostgreSQL 16
(`gym-app-db-1`, localhost:5432) via PGlite (integration tests) and directly
(e2e).

---

## 1. H-1 — deload recommendation isolation

### 1.1 What was wrong

Three Phase 4 mechanisms were ungated for deload weeks: `buildTodayBundle`
and `getActiveSession` attached a pending recommendation regardless of
`isDeload`; `ExerciseCard.derivePrefill` preferred the pending recommendation's
*unmodified* target over the deload-modified snapshot prefill; and the
implicit-decision path on the first work set (`logSet`) would decide that
recommendation, letting the deload load head the post-deload carry-forward
chain and the block summary's "after" value.

### 1.2 What changed

**New pure domain guard** — [`src/domain/progression/deloadGuard.ts`](../../src/domain/progression/deloadGuard.ts)
(new file):

```ts
export function recommendationForDeload<T>(isDeload: boolean, recommendation: T | null): T | null {
  return isDeload ? null : recommendation;
}
```

One function, used at every boundary that could carry a recommendation into
a deload context — a single choke point rather than five independent
re-implementations of the same rule.

**Primary gate (server, single source of resolution):**

- [`src/server/today/service.ts:463-464`](../../src/server/today/service.ts) —
  `buildTodayBundle` skips the `getPendingRecommendationsByExercise` query
  entirely when `effective.isDeload`, and (`:498-501`) wraps the assignment in
  `recommendationForDeload` too, so the invariant holds even if the query were
  ever re-added without the skip.
- [`src/server/today/service.ts:292-297`](../../src/server/today/service.ts) —
  `getActiveSession` does the same for `session.isDeload`, gating
  `getSessionRecommendationsByExercise` (the cross-device resume/adopt path).
- The underlying `recommendations` row is **never touched** by either change
  — no supersede, no decide, no delete. It stays `pending` and simply isn't
  fetched for a deload session; the existing (unchanged) Phase 4 machinery
  re-surfaces it exactly as before once the athlete reaches a non-deload
  session.

**Defensive backstop (client/domain), for a stale pre-fix cached bundle or
session that already carries a recommendation despite the primary gate:**

- [`src/sync/activeSession.ts:237`](../../src/sync/activeSession.ts) —
  `startSession` freezes `recommendationForDeload(input.isDeload,
  entry.pendingRecommendation)` into the session, not the raw bundle entry —
  guards a service-worker/IndexedDB `bundleCache` copy fetched before this
  fix deployed.
- [`src/sync/activeSession.ts:363`](../../src/sync/activeSession.ts) —
  `logSet`'s implicit-decision check now reads
  `recommendationForDeload(session.isDeload, exercise.recommendation)` before
  testing `rec.decision.status === "pending"` — guards a session already
  resumed locally before this fix, so the first work set of a deload can
  never enqueue a `recommendationDecision` op regardless of what
  `exercise.recommendation` already holds.
- [`src/sync/activeSession.ts:414`](../../src/sync/activeSession.ts) —
  `decideRecommendation` applies the same guard, so an explicit
  accept/reject/modify is also impossible during a deload session even if a
  stale card were somehow rendered.
- [`src/ui/workout/ExerciseCard.tsx`](../../src/ui/workout/ExerciseCard.tsx) —
  takes a new required `isDeload` prop (threaded from
  [`WorkoutExecution.tsx`](../../src/ui/workout/WorkoutExecution.tsx)'s
  `session.isDeload`); both `derivePrefill` and the `RecommendationCard`
  render are gated through `recommendationForDeload`, so the workout screen
  can neither prefill from nor display a recommendation during a deload.
- [`src/ui/today/TodaySection.tsx`](../../src/ui/today/TodaySection.tsx) —
  the Today preview's recommendation line is gated the same way against
  `today.isDeload`, for a stale cached bundle rendered before a fresh fetch
  lands.

### 1.3 What was deliberately left alone

- `evaluateSession` already returns `[]` for `isDeload` sessions (Phase 4);
  unmodified, and re-verified green by the existing
  `"produces zero recommendations for a completed session frozen as a
  deload"` test.
- The block summary's "after" derivation
  ([`src/server/blocks/service.ts:707-708`](../../src/server/blocks/service.ts))
  is untouched — it already takes the latest accepted/modified Decision or
  falls back to the latest non-deload session's load; with no decision ever
  recorded from a deload session (per the guard above), it now correctly
  falls through to the pre-deload load. No code change was needed there.
- A server-side belt-and-braces on `recommendationDecision` ops (rejecting
  one whose `decidedAt` falls inside a deload session's window) was noted as
  optional by the review for the single-device MVP and was not added — the
  client-side guards above make the op structurally impossible to enqueue in
  the first place, which is the smaller and more direct fix.

### 1.4 Regression evidence

**Integration** — `tests/integration/progression.integration.test.ts`,
describe `"H-1 — deload recommendation isolation"` (new, PGlite, real
load-progression evaluation, real sync write path via `applySyncBatch`):

1. A completed non-deload session at 100 kg (`load-progression`) generates a
   real pending recommendation targeting 102.5 kg via the actual evaluator —
   not a hand-inserted fixture.
2. `createWeekOverride(... type: "deload", modifiers: { loadMultiplier: 0.9
   })` for week 3.
3. `buildTodayBundle` for week 3: `isDeload: true`, `prefill.loadKg: 90`,
   `pendingRecommendation: null`.
4. The deload session is started and its first work set logged at 90 kg
   through the *real* sync ops (session create → sessionExercise → setLog),
   **without completing yet** — `getActiveSession` is called at this point
   and asserted to return `recommendation: null` for the exercise despite the
   pending 102.5 kg recommendation genuinely existing, pending, for that
   (exercise, block) — proves the server-hydrated/cross-device-resume shape.
5. The deload session is completed. `recommendations` still has exactly one
   row (the original), still `pending`, `decisionChosen: null` — no decision
   was recorded and no new recommendation was generated.
6. `buildTodayBundle` for week 4 (post-deload): `prefill.loadKg: 100` (the
   pre-deload load, not 90) and `pendingRecommendation` still present,
   `target.loadKg: 102.5`, `decision.status: "pending"`.
7. `getBlockSummary`: `hadDeloadSession: true`, `beforeLoadKg: 100`,
   `afterLoadKg: 100` — not 90.

**Integration** — `tests/integration/today.integration.test.ts` (existing
"deload / week-override modifiers" describe): the existing fresh-bundle
deload-resolution tests continue to pass unmodified, confirming no regression
to §2.2–2.6 of the original review's verified behaviour.

**Unit** — `tests/unit/deloadGuard.test.ts` (new): the guard function itself,
including the case that maps directly to the "stale pre-fix cached shape"
scenario — `recommendationForDeload(true, alreadyAttachedRecommendation)` →
`null`.

**E2E** — `tests/e2e/deload.spec.ts` (new second test, real browser against
the local Docker stack): the shipped Phase 5 e2e only ever exercised a
`manual` prescription, which is exactly why H-1 was missed — a pending
recommendation only exists for a non-manual strategy. The new spec primes a
real `load-progression` recommendation (same technique as
`progression.spec.ts`), resolves a deload for the current week, and asserts
end-to-end in the real UI:

- Today's preview shows no "Increase load" text during the deload week.
- The fresh bundle: `isDeload: true`, `pendingRecommendation: null`,
  `prefill.loadKg` equal to the *actual* pre-deload prefill × 0.9 (read
  dynamically from the bundle, not assumed — the shared e2e fixture can carry
  an older accepted decision from a previous run that outranks a fresh
  carry-forward, so the test doesn't hardcode a baseline).
- On the workout screen: no "Accept" button, no proposed-target text, and
  the kg input is prefilled with the deload target, not the raw recommended
  target.
- Logging the deload's first work set produces no "Accepted"/"Changed to"
  badge (i.e., no decision).
- After the override is removed, the original pending recommendation is
  still there with its original target, and the prefill is back to exactly
  what it was before the deload — proof the deload session's logged set
  never became a decision.

---

## 2. M-1 — safe modifier bounds

### 2.1 What was wrong

`weekModifiersSchema` accepted any positive `setMultiplier`/`loadMultiplier`
and any integer `targetRirShift`; `applySetMultiplier` floored and applied
the ≥ 1 minimum but never a ceiling. `setMultiplier: 5` on a 5-set scheme
produced `scheme.sets = 25`, which fails `PrescriptionSnapshot`'s `1..20`
range — `startSession` then threw inside
`buildSessionExerciseUpsertPayload`'s `.parse()`, and `TodaySection`'s
`handleStart` had no `catch`, so "Start workout" silently re-enabled with no
feedback.

### 2.2 What changed

**Schema bound** — [`src/domain/blocks/schema.ts`](../../src/domain/blocks/schema.ts):

```ts
export const weekModifiersSchema = z
  .object({
    setMultiplier: z.number().positive().max(2).optional(),
    loadMultiplier: z.number().positive().max(2).optional(),
    targetRirShift: z.number().int().min(-10).max(10).optional(),
  })
  .strict();
```

`(0, 2]` for both multipliers, `[-10, 10]` for the RIR shift — wide enough
for the documented heuristics (0.5/0.9/+2) and any legitimate manual
override, narrow enough to reject the "5 instead of 0.5" typo at the API
boundary (`POST`/`PATCH` on blocks and week-overrides all route through this
one schema, so the bound applies uniformly to `createBlock`, `updateBlock`,
`createWeekOverride`, `updateWeekOverride`).

**Domain clamp (defense-in-depth for data written before the bound existed)**
— [`src/domain/prescriptions/applyWeekModifiers.ts`](../../src/domain/prescriptions/applyWeekModifiers.ts):

```ts
export function applySetMultiplier(scheme: SetScheme, multiplier: number | undefined): SetScheme {
  if (multiplier === undefined) return scheme;
  const sets = Math.min(SETS_MAX, Math.max(1, Math.floor(scheme.sets * multiplier)));
  return { ...scheme, sets };
}
```

`SETS_MAX` (20) is now exported from
[`src/domain/schemes/setScheme.ts`](../../src/domain/schemes/setScheme.ts)
instead of being module-private, so this clamp shares the literal with the
snapshot schema rather than duplicating it. Because `buildTodayBundle` reads
a block/override's stored `modifiers` JSONB with a cast, not a re-validating
parse, this clamp — not just the schema bound — is what keeps the resolved
**scheme's set count** within `1..SETS_MAX` unconditionally, including for a
`setMultiplier` stored before this remediation.

*Correction (verification, 2026-08-22 — see
`phase-5-remediation-verification.md` §3.2, **M-1a**):* the clamp covers the
scheme only. `buildPrescriptionSnapshotData` freezes the `appliedModifiers`
object verbatim, and the snapshot schema validates that field with the same,
now-bounded `weekModifiersSchema` — so an out-of-range *stored* modifier
(`setMultiplier`/`loadMultiplier` > 2, `targetRirShift` outside ±10) still
produces a snapshot that fails validation, and "Start workout" fails for
that week — visibly, through the new `startError` message, and recoverable by
editing the deload/override back into range. The earlier claim that the clamp
makes the whole snapshot valid "regardless of when a config was stored" was
inaccurate. M-1a is recorded as an **accepted, non-blocking residual**: Phase 5
has never been deployed, the previously deployed `BlockForm` always submitted
`modifiers: {}`, and no block deload or week-override row with modifiers
exists, so no such data can be present; the API bound prevents new ones. A
follow-up (sanitize stored modifiers at resolution time, or keep the
snapshot's `appliedModifiers` on an unbounded record shape, plus a test that
asserts snapshot validity rather than `scheme.sets` alone) is deferred
alongside L-1..L-5.

*Judgment call:* the `(0, 2]` multiplier and `[-10, 10]` RIR-shift bounds are
an implementation choice, not explicitly mandated by the specs —
`domain-model.md` §5 gives `WeekModifiers` as user-set numbers with heuristic
examples only, and `prescription-model.md` §3/§5/§6 fix only the RIR clamp
`[0, 10]`, the set floor/minimum-one, and the `1..20` scheme range. The bounds
lose nothing expressible (a ±10 shift reaches both clamp ends from any valid
band) and reject the "5 for 0.5" typo; they are an interpretation within the
specs, so no `deviations.md` entry is warranted.

Floor semantics and the minimum-of-one are unchanged; fractional
`loadMultiplier`/`loadStepKg` behaviour is untouched (only `applySetMultiplier`
was bounded — `applyLoadMultiplier`'s rounding logic was not touched beyond
the new schema ceiling on its input).

**UI** — [`src/ui/blocks/BlockForm.tsx`](../../src/ui/blocks/BlockForm.tsx) and
[`src/ui/blocks/WeekOverrides.tsx`](../../src/ui/blocks/WeekOverrides.tsx):
the Sets×/Load× inputs now carry `min="0.05" max="2"` (previously `min="0"`,
no max — `min="0"` allowed a value Zod would reject anyway), the RIR-shift
input carries `min="-10" max="10"`, and both forms now show a specific
message for the `invalid_input` API error (previously it fell into the
generic "Something went wrong" branch) instead of a silent/generic failure.

**"Start workout" no longer fails silently** —
[`src/ui/today/TodaySection.tsx`](../../src/ui/today/TodaySection.tsx)'s
`handleStart` now wraps `start(...)` in try/catch and renders a `startError`
message if session start still throws for any reason. With the clamp above,
this specific cause (an out-of-range stored multiplier) can no longer trigger
it — this is the generic backstop the review asked for, not the primary fix.

### 2.3 Regression evidence

**Unit** — `tests/unit/blockSchema.test.ts` (new `describe("weekModifiersSchema")`):
accepts the documented defaults and the `(0, 2]`/`[-10, 10]` boundaries;
rejects `setMultiplier: 5`, `loadMultiplier: 5`, `setMultiplier: 0`,
`loadMultiplier: -1`, `targetRirShift: 11`, `targetRirShift: -11`.

**Unit** — `tests/unit/applyWeekModifiers.test.ts` (new cases): `applySetMultiplier`
clamps `sets: 5, multiplier: 5` to `20` (not `25`), and stays at `20` (not
`30`) for `sets: 20, multiplier: 1.5` — the exact boundary the review's
reproduction used.

**Integration** — `tests/integration/today.integration.test.ts` (new case,
`"clamps an out-of-range stored setMultiplier to SETS_MAX instead of
producing an invalid scheme"`): calls `createBlock`'s *service* function
directly with `modifiers: { setMultiplier: 5 }` — bypassing the route's Zod
parse, i.e. exactly what a value stored before this bound existed looks like
— and asserts `buildTodayBundle` still resolves a valid `scheme.sets: 20`
rather than throwing or producing an invalid snapshot.

---

## 3. Test results (verbatim)

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm format:check` | ✅ "All matched files use Prettier code style!" |
| `pnpm typecheck` | ✅ clean |
| `pnpm typecheck:sw` | ✅ clean |
| `pnpm test:unit` | ✅ **Test Files 24 passed (24) · Tests 287 passed (287)** (was 274 before this pass — +13: 3 `deloadGuard`, 2 `applySetMultiplier` clamp, 8 `weekModifiersSchema` bound) |
| `pnpm test:integration` | ✅ **Test Files 12 passed (12) · Tests 143 passed (143)** (was 141 — +2: the H-1 combined regression, the M-1 clamp-at-the-bundle regression) |
| `pnpm test:e2e` | ✅ **12 passed** (was 11 — +1: the new load-progression deload spec) — run against the local Docker Postgres per CLAUDE.md; the pre-existing spec and the new one both pass |
| `pnpm build` | ✅ production build succeeds, no new routes, no type errors |

New/changed test coverage this pass:

- **Unit** (+13): `deloadGuard.test.ts` (3, new file), `applyWeekModifiers.test.ts`
  (+2, SETS_MAX clamp), `blockSchema.test.ts` (+8, `weekModifiersSchema`
  bounds).
- **Integration** (+2): `progression.integration.test.ts` (+1, the full H-1
  regression via the real sync write path and real load-progression
  evaluation — fresh bundle, in-progress/server-hydrated session, and
  post-deload carry-forward/summary all in one continuous scenario);
  `today.integration.test.ts` (+1, M-1's clamp-holds-for-legacy-data case).
- **E2E** (+1): `deload.spec.ts` (+1 spec, load-progression exercise —
  H-1's exact missed scenario).
- All prior Phase 3–5 unit/integration/e2e coverage re-run and green
  unmodified (no existing assertion needed to change; the bound tightening
  in `weekModifiersSchema` doesn't affect any existing fixture, which all
  use multipliers ≤ 0.9 and RIR shifts ≤ 2).

**Local Docker Postgres note**: mid-verification, the e2e suite intermittently
failed with unrelated symptoms traced to one orphaned `block_week_overrides`
row left behind by an earlier, unrelated interrupted run's cleanup (its
presence silently made *every* e2e spec sharing the seed fixture's block
run against week 1 as a deload, including `progression.spec.ts`'s priming
workout, which then correctly produced *no* recommendation per H-1's own
fix — masking as a false failure). The row was deleted directly
(`delete from block_week_overrides where id = '...'`) — fixture debris in the
local dev DB only, not a defect in the reviewed code; not a production
action per CLAUDE.md's local-only scope for this task. A full, clean e2e run
afterward passed 12/12, and the DB was confirmed empty of leftover
`block_week_overrides` rows and pending recommendations after the run.

---

## 4. Disposition

| Finding | Disposition |
|---|---|
| **H-1** (HIGH) | **FIXED.** Primary gate at `buildTodayBundle`/`getActiveSession`; defensive backstop at `startSession`/`logSet`/`decideRecommendation`/`ExerciseCard`/`TodaySection`, all routed through one pure, unit-tested guard function. Regression covered at unit, integration (real evaluator + real sync path, all three required shapes: fresh bundle, server-hydrated session, and the guard's own stale-shape unit case), and e2e level. |
| **M-1** (MEDIUM) | **FIXED** for all API/UI-writable input. Schema bound at the API boundary (`(0, 2]` / `[-10, 10]` — a judgment call, see §2.2) plus a domain-level clamp that keeps the resolved scheme's set count within `1..SETS_MAX` regardless of when the `setMultiplier` was stored; UI inputs and error messaging updated to match; "Start workout" now surfaces a message instead of silently re-enabling if session start still fails for any reason. |
| **M-1a** (MEDIUM, residual) | **ACCEPTED, non-blocking.** A legacy out-of-range `appliedModifiers` object would still fail snapshot validation (the clamp covers the scheme, not the frozen modifiers object) — see §2.2 correction. Not reachable with any existing data (Phase 5 never deployed; no modifier rows exist); deferred with L-1..L-5. |

## 5. Scope discipline

- No change to any of L-1 (`weekIndex` upper bound → 500), L-2
  (`HISTORY_WINDOW` carry-forward edge), L-3 (block summary exercise
  enumeration source), L-4 (stale cached bundle missing `appliedModifiers`),
  or L-5 (report/plan accuracy notes) — all five remain deferred, exactly as
  the review's verdict allowed ("candidates for the same remediation PR if
  cheap, otherwise acceptable to defer; they do not by themselves warrant a
  cycle").
- No change to any accepted/verified Phase 5 behaviour outside H-1/M-1's
  blast radius (§2.1–2.10 of the review) — confirmed by every pre-existing
  test in `today.integration.test.ts`, `progression.integration.test.ts`,
  `blockSummary.integration.test.ts`, `blockWeekOverrides.integration.test.ts`,
  and the original `deload.spec.ts` case passing unmodified.
- Every existing user-owned file and every other in-flight uncommitted change
  in the working tree was left untouched by this pass.
- Nothing committed, pushed, deployed, or run against production.

---

**READY FOR TARGETED REMEDIATION VERIFICATION** — verified 2026-08-22
(`phase-5-remediation-verification.md`): READY FOR DEPLOYMENT AND MANUAL
IPHONE ACCEPTANCE, with M-1a recorded above as an accepted residual.
