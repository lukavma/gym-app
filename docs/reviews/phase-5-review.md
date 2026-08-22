# Phase 5 — Block Lifecycle & Deloads: Independent Review

Date: 2026-08-22
Reviewed state: uncommitted working tree on `main` (HEAD `8fd2dd1` + the
Phase 5 changes listed in `docs/reviews/phase-5-implementation.md`).
Scope: `implementation-plan.md` Phase 5 / `mvp-scope.md` F4, verified
against `data-model.md` §2.9–2.12/§4, `domain-model.md` §5–7/§9–10,
`prescription-model.md` §3–6, `progression-engine.md` (deload, history,
evaluation, §7 decisions), `volume-model.md` §1–3, `evidence-to-design.md`
decision 12, ADR-005–008, `open-decisions.md` OD-09, and the Phase 4 review.

Method: the implementation report and its shipped tests were treated as
claims. Every Phase 5 source file, the migration, and every new/changed test
were read in full; behaviour was then re-derived with reviewer-written
probes kept outside the repository (scratchpad `phase5.review.test.ts` —
**17 PGlite probes through the real services and the real sync write path,
17/17 green**; probes labelled DEFECT/GAP/LIMIT assert the *observed*
behaviour so each finding is reproducible), plus direct inspection of the
local Docker PostgreSQL 16 (`gym-app-db-1`). No implementation file was
modified; nothing was committed, pushed, deployed, or run against
production. The human iPhone pass is out of scope and not claimed.

---

## 1. Verdict summary

| Area | Result |
|---|---|
| `block_week_overrides` schema, migration, constraints, cascade | ✅ column-for-column `data-model.md` §2.11; live `\d` matches; `drizzle-kit check` "Everything's fine" (§2.1) |
| Scheduled numeric / `'last'` resolution, extension while active, overdue weeks | ✅ (§2.2) |
| Override precedence = complete replacement; `custom` ≠ deload | ✅ (§2.2) |
| Overrides created / edited / deleted on active & completed blocks; frozen sessions untouched | ✅ (§2.3) |
| Ownership isolation, uniqueness, immutability of `weekIndex` | ✅ with one LOW validation gap (§2.3, L-1) |
| Set floor/min-1, RIR clamp keeps a valid band, fractional step rounding | ✅ (§2.4) — but modifier *inputs* are unbounded (M-1) |
| One authoritative resolution path; exact snapshotting; cached/offline start freezes bundle values | ✅ (§2.5) with one LOW upgrade edge (L-4) |
| Server + client evaluation skip deload sessions; history flags deloads; carry-forward skips them | ✅ (§2.6) with one LOW window edge (L-2) |
| **Post-deload carry-forward selects the pre-deload source** | ❌ **fails whenever a pending recommendation exists (H-1)** |
| **Deload week visibly modifies the workout's load target (F4)** | ❌ **fails on the workout screen whenever a pending recommendation exists (H-1)** |
| History badges / `appliedModifiers` line from snapshot data | ✅ (§2.7) |
| Block summary counts, before→after, caveat copy; completion mutates nothing | ✅ derivation verified, with H-1 contaminating "after" and one LOW enumeration gap (§2.8, L-3) |
| Start-next-block: fresh state, nothing leaked | ✅ (§2.9) |
| No autoregulation, no Phase 6 volume code, no persisted aggregates | ✅ (§2.10) |

**One HIGH, one MEDIUM, five LOW. No BLOCKER.**

---

## 2. Verified behaviour (evidence)

### 2.1 Schema and migration

- `src/db/schema/blockWeekOverrides.ts` / `drizzle/0006_abandoned_giant_man.sql`
  match `data-model.md` §2.11 exactly (FK `ON DELETE CASCADE`, `ck week_index
  >= 1`, `ck type in ('deload','custom')`, `uq_week_override (block_id,
  week_index)`), plus a harmless `ix_block_week_overrides_block_id`.
- Local Docker PG16 `\d block_week_overrides` shows the same constraints;
  `drizzle.__drizzle_migrations` has 7 rows (0000–0006); `pnpm exec
  drizzle-kit check` → "Everything's fine"; the PGlite migrator applies the
  folder cleanly in every integration run. `is_deload` needed no migration
  (column existed since Phase 3).

### 2.2 Resolution semantics (`src/domain/scheduling/effectiveModifiers.ts`)

Reviewer probes through `buildTodayBundle` (not the pure function alone):

- Numeric scheduled deload on week 3 of 8: week 3 → `isDeload: true`, `5×5 →
  2×5`, RIR `0–2 → 2–4`, prefill `100 → 90`, `appliedModifiers` = the config.
  Week 1 → untouched, `appliedModifiers: null`.
- `'last'` on an 8-week **active** block: week 8 deload; week 9 (overdue,
  still active) not a deload; `updateBlock(weeksPlanned: 10)` is permitted
  while active (only schedule/deload are locked) and moves `'last'` → week 8
  no longer deload, week 10 deload. Matches domain-model §5 ("extension
  changes `weeksPlanned`").
- Override for the same week as the scheduled deload: **complete
  replacement**, not a merge — `custom {loadMultiplier 0.8}` over
  `{0.5, 0.9, +2}` yields 5 sets, RIR 0–2, prefill 80, `isDeload: false`. A
  `deload` override with `{}` marks the week a deload with unchanged targets.
  An override on another week leaves the scheduled deload in force.

### 2.3 Override lifecycle, ownership, uniqueness

- Create → Today flips immediately; PATCH `type/modifiers` → Today flips;
  DELETE → the scheduled deload resurfaces. A session started under an
  override keeps `is_deload`, `week_index`, the modified scheme/prefill and
  `appliedModifiers` after the override is deleted, replaced, and the block
  extended (`listHistorySessions`/`getHistorySessionDetail` read the
  snapshot columns/JSONB only).
- Overrides are accepted on a `completed` block (spec: "inserted at any
  time"); harmless — nothing resolves against a non-active block.
- Cross-user: list/create/update/delete/summary all 404 via the
  block→program→user chain; an override id from block A under block B's path
  is `BlockWeekOverrideNotFoundError` and nothing is mutated. Same week on two
  blocks is allowed; duplicate `(block, week)` → 23505 → 409 (`isPostgresErrorCode`
  walks `.cause`).
- `updateWeekOverrideSchema` is `.strict()` without `weekIndex` → 400, so the
  "delete+recreate to move a week" convention is enforced at the boundary.

### 2.4 Modifier math (`src/domain/prescriptions/applyWeekModifiers.ts`)

- `applySetMultiplier`: `floor`, min 1 — `1×0.01 → 1`, `3×0.99 → 2`,
  `5×0.5 → 2` (the corrected §5 example).
- `applyTargetRirShift`: each end clamped to [0, 10] independently —
  `{0,2}+9 → {9,10}`, `{0,2}−3 → {0,0}`, `{8,10}−10 → {0,0}`; a monotone
  clamp cannot invert the band (`rirBandSchema` would reject it on write).
- `applyLoadMultiplier` rounds via the existing `roundToStepKg` after the
  multiply: `97.5×0.9 @1.25 → 87.5`, `62.5×0.9 @0.5 → 56.5`, `30×0.5 @2 →
  16`, `102.5×0.9 @2.5 → 92.5`, `0.3×0.9 @0.1 → 0.3` (float-safe).
- Ordering in `buildSnapshot.ts`: set/RIR modifiers on the static scheme,
  then Decision → carry-forward → baseline, then `loadMultiplier` on the
  resolved number (shipped unit test + reviewer bundle probes agree).

### 2.5 Single resolution point and snapshotting

- `resolveEffectiveWeekModifiers` is called exactly once, in
  `buildTodayBundle` (`src/server/today/service.ts:401-430`); grep confirms
  no other caller. `today.isDeload` and every entry's
  `scheme/targetRir/prefill/appliedModifiers` come from that one result.
- Client `startSession` (`src/sync/activeSession.ts:95-110, 213-245`)
  freezes `bundle.today.weekIndex/isDeload` and `entry.appliedModifiers`
  verbatim — identical path online and from `bundleCache` offline; the
  server sync handler stores `isDeload`/`weekIndex` as sent and the snapshot
  JSONB is write-once. Verified end-to-end: a session started from a deload
  bundle lands with `is_deload = true`, `week_index = 3`, snapshot
  `scheme 2×5`, `prefill 90`, `appliedModifiers {0.5, 0.9, +2}`.
- The deload e2e (`tests/e2e/deload.spec.ts`) re-run by the reviewer against
  the local stack: **1 passed (38.4 s)** — badge on Today and on the started
  workout, modified sets in the bundle.

### 2.6 Engine integration

- `evaluateSession` returns `[]` for `isDeload` (`src/domain/progression/evaluateSession.ts:100`)
  — shared by the server completion path and the client offline path
  (`activeSession.ts:559-570`). Reviewer probe: a completed deload session
  produces no record, a pre-existing pending recommendation survives, and a
  set edit on the completed deload session does not supersede it.
- History for the next non-deload session carries the deload entry
  **flagged** (`history: [deload, normal]`), `previousPerformance` excludes
  it, and `load-progression` filters flagged entries (Phase 4 verified).
- Carry-forward (`carryForward.ts:25`) skips deload candidates: with a
  `manual` prescription the post-deload prefill is the pre-deload 100, not
  the deload 90 (control probe) — **this is the only configuration in which
  the spec'd behaviour holds; see H-1.**

### 2.7 History UI

`HistoryList`/`HistoryDetail` read `is_deload` from `workout_sessions` and
`appliedModifiers` from the frozen snapshot; neither consults the block.
`formatAppliedModifiers` renders the three axes; `{}` renders "Modified".

### 2.8 Block summary and completion

- `sessionsCompleted` counts completed sessions including deloads;
  `hadDeloadSession` from frozen `is_deload`; `before` = earliest completed
  **non-deload** session's first work-set load (a leading deload session is
  correctly skipped); `after` = latest accepted/modified Decision's
  `loadKg`, else the latest non-deload session's load.
- `completeBlock` updates only `blocks.status/completed_at/updated_at`:
  `workout_sessions`, `session_exercises`, `set_logs`,
  `block_week_overrides`, and `exercise_prescriptions` are deep-equal before
  and after completion + summary read (probe). Nothing is persisted by
  `getBlockSummary`.
- Caveat copy (`BlockSummary.tsx:22`) is unconditional on
  `hadDeloadSession`, non-coercive, and contains no benefit claim —
  consistent with evidence-to-design decision 12 / B6.

### 2.9 Start next block

`BlockForm` pre-fills `goal/schedule/weeksPlanned` only; `createBlock`
produces `planned`, `sequence + 1`, `deload: null`, zero overrides, zero
sessions, an empty summary; the old block's overrides remain. After
activation, Today resolves against the new block with `appliedModifiers:
null` and carries the exercise's load forward across blocks (history is per
exercise — expected).

### 2.10 Scope discipline

No `src/domain/volume/`; no new columns beyond the spec'd table; no
readiness/recovery inputs anywhere outside the reserved engine type; the
deload/override UI offers only user-set modifiers (OD-09 respected).

---

## 3. Findings

Severity: BLOCKER / HIGH / MEDIUM / LOW. (D) correctness defect, (G)
spec-interpretation or documentation gap, (T) test gap.

### H-1 (HIGH, D): a pending recommendation overrides the deload-modified load target and its decision leaks the deload load into post-deload carry-forward and the block summary

Three Phase 4 mechanisms were left ungated for deload weeks:

1. `buildTodayBundle` attaches `pendingRecommendation` regardless of
   `effective.isDeload` (`src/server/today/service.ts:449-487`), and
   `getActiveSession` does the same for adopted sessions (`:288`).
2. `ExerciseCard.derivePrefill` (`src/ui/workout/ExerciseCard.tsx:40-60`)
   prefers a pending recommendation's *unmodified* target over the snapshot
   prefill, so on the workout screen the first-set load reads **102.5** (the
   pre-deload rec) while the snapshot says **90** (100 × 0.9). Today's
   preview also prints "Increase load: 102.5 kg" under the deload-modified
   scheme (`src/ui/today/TodaySection.tsx:332`).
3. The implicit decision fires on the first work set of **any** session
   (`src/sync/activeSession.ts:352-373`), and the working-target chain head
   (`workingTargets.ts:41`, `getLatestDecisionChosenByExercise`) and the
   summary's "after" (`blocks/service.ts:707-708`) take the latest
   accepted/modified Decision with no notion of *which session* decided it.

Consequence, reproduced through the real sync path (probe "DEFECT PROBE:
the pre-deload pending recommendation rides into the deload bundle…"):

| Step | Observed |
|---|---|
| Week 1, load-progression, 5×5 @ 100, RIR 2 | rec `increase_load 102.5`, pending |
| Week 3 deload bundle | `isDeload true`, prefill 90 ✅ — **and** `pendingRecommendation.target = 102.5` |
| Athlete lifts the deload load 90 | client emits `modified {loadKg: 90}` (`resolveImplicitDecision` output asserted) |
| Week 4 (post-deload) prefill | **90** — spec'd: 100 (pre-deload source) |
| `getBlockSummary` after completion | `before 100 → after 90`, `hadDeloadSession: true` |

The variant where the athlete taps through the 102.5 prefill "accepts" the
full-load target inside the deload (the deload `loadMultiplier` is simply
never applied to what they see), and the control with a `manual`
prescription behaves correctly — which is why none of the shipped tests
caught it: every Phase 5 deload test uses `manual` or never completes a
non-deload session first, so no pending recommendation ever exists in a
deload week.

Why HIGH: it breaks both Phase 5 acceptance lines in the ordinary case (any
non-manual prescription after its first completed session): F4's "deload
week visibly modifies Today's targets (… load …)" is false on the workout
screen, and the plan's integration requirement "post-deload session carries
forward from *pre*-deload loads" is false whenever the pending rec is
decided during the deload. The B6 caveat then describes a dip the app
manufactured itself. No data is lost or rewritten, so not a BLOCKER.

Suggested remediation (smallest consistent fix): treat a deload week as
decision-free — `buildTodayBundle` sets `pendingRecommendation: null` when
`effective.isDeload` (the record stays `pending` server-side and reappears
on the next non-deload workout; nothing is superseded), and
`getActiveSession` does the same when `session.isDeload`. Add an
integration test for "pending rec + scheduled deload week" asserting the
bundle omits the rec and the post-deload prefill is the pre-deload load,
and extend the e2e to a `load-progression` exercise. A server-side
belt-and-braces (ignore or reject a `recommendationDecision` op whose
`decidedAt` falls inside a deload session's window) is optional for the
single-device MVP. Note the related non-deload case: for a `custom`
override with a `loadMultiplier`, `derivePrefill` likewise shows the raw rec
target rather than the multiplied one — a decision there is legitimate (custom
weeks are evaluated and carried forward), but the display ignores the
modifier; acceptable to document rather than fix now.

### M-1 (MEDIUM, D): modifier inputs are unbounded, so a plausible typo produces a scheme the snapshot contract rejects and the workout silently cannot start

`weekModifiersSchema` accepts any positive `setMultiplier`/`loadMultiplier`
and any integer `targetRirShift` (`src/domain/blocks/schema.ts:33-35`);
`applySetMultiplier` floors and applies the ≥ 1 minimum but never the
`SETS_MAX = 20` ceiling (`applyWeekModifiers.ts:11`). Entering `5` where the
pre-filled default reads `0.5` (both UIs: `BlockForm.tsx:468`,
`WeekOverrides.tsx:163`) on a 5-set scheme yields `scheme.sets = 25` in the
bundle (probe), which violates prescription-model §6 ("1 ≤ sets ≤ 20"). On
"Start workout", `buildSessionExerciseUpsertPayload` throws inside
`startSession` before anything is written, `handleStart` has no `catch`
(`TodaySection.tsx:164`), so the button merely re-enables — no message, no
session, every week the override/deload covers. The server rejects the same
payload with `invalid_payload` (probe). Both inputs also allow `0` (HTML
`min="0"`), which Zod rejects with the generic error.

Fix: bound the schema (e.g. `setMultiplier` and `loadMultiplier` in `(0, 2]`,
`targetRirShift` in `[-10, 10]`) **and** clamp `applySetMultiplier` to
`SETS_MAX` so the snapshot invariant holds regardless of stored config;
`min` on the inputs should exclude 0. Add a unit case for the clamp and a
schema test for the bounds.

### L-1 (LOW, D): `weekIndex` above `smallint` surfaces as a 500

`createWeekOverrideSchema.weekIndex` is `int().min(1)` with no upper bound
(`blocks/schema.ts:87`); `40000` passes Zod and fails in PostgreSQL with
`22003` (probe), which the route does not map → 500 instead of 400. Add
`.max(…)` (16 matches `weeksPlanned`; a larger cap is fine since overdue
weeks are legal).

### L-2 (LOW, D): ≥ 8 consecutive deload sessions of one exercise exhaust the carry-forward window

`HISTORY_WINDOW = 8` (`today/service.ts:45`) is applied in SQL *before* the
non-deload filter in `resolveCarryForwardLoadKg`. Two manual deload weeks at
4 sessions/week for the same exercise (probe: 8 deload sessions after one
normal session at 100, baseline 60) make the next prefill fall back to the
baseline (60), not the last non-deload load (100). Unusual but reachable
with overrides; filter deloads in the query (or widen the window) for the
carry-forward candidate set.

### L-3 (LOW, G): block summary enumerates exercises from the *current* template prescriptions

`getBlockSummary` lists exercises via `block_schedule_entries →
exercise_prescriptions` (`blocks/service.ts:634-640`) — mutable planning
data. Deleting (or replacing) a prescription after the block drops that
exercise from a completed block's summary even though its sessions and
snapshots remain (probe); ad-hoc exercises never appear. Enumerating from
the block's `session_exercises` (the snapshot carries `exerciseName`) would
make the summary self-contained like the rest of history.

### L-4 (LOW, D): a cached pre-Phase-5 bundle cannot start a workout offline until refreshed

`buildSnapshotFromBundleEntry` copies `entry.appliedModifiers`
(`activeSession.ts:108`); a bundle cached by the previous build has no such
key, so the snapshot fails `weekModifiersSchema.nullable()` (required, not
optional) and `startSession` throws (probe). Only the "first launch after
the deploy is offline" path is affected; once Today loads online the cache
is overwritten. `entry.appliedModifiers ?? null` closes it.

### L-5 (LOW, G/T): report and plan accuracy

- The report's known limitation ("only the load axis of `loadMultiplier` is
  exercised end-to-end") is inverted: `deload.spec.ts:39` uses
  `{ setMultiplier: 0.5 }` and asserts only `scheme.sets` and the badge —
  neither load nor RIR is asserted in the e2e.
- The plan's e2e line is "scheduled deload week renders modified Today
  targets"; the spec exercises a manual *override* (the seed block has no
  deload and schedule/deload are locked once active). Scheduled resolution
  is covered at unit/integration level, so this is a test-list deviation,
  not a behavioural gap.
- The report's "zero copied sessions, recommendations, or week overrides —
  verified by a dedicated integration test" is backed only by the
  override-isolation test; sessions/recommendations were verified here (§2.9).

### Observations (no action)

- A stale cached bundle started offline across a week boundary freezes the
  cached week's `isDeload`/modifiers — inside pwa-offline-strategy §4's
  accepted staleness.
- `isDeload`/`weekIndex` on the session op are client-asserted and trusted,
  exactly like the rest of the snapshot — by design (ADR-007).
- `getBlockSummary` runs two queries per exercise; fine for one user.
- Phase 4 M-1/L-1..L-5 were not re-examined and are still parked for Phase 8
  per the implementation instruction.
- The authorised `prescription-model.md` §5 wording fix is correct and
  changes no rule.

---

## 4. Reproduction notes

- Shipped gates reproduced: `pnpm test:unit` 23 files / 274 tests;
  `pnpm test:integration` 12 files / 141 tests (74.8 s); `pnpm typecheck`,
  `pnpm typecheck:sw`, `pnpm lint`, `pnpm format:check` clean; `pnpm exec
  drizzle-kit check` "Everything's fine"; `pnpm exec playwright test
  tests/e2e/deload.spec.ts` → 1 passed (38.4 s) against the local Docker DB
  (override removed in `finally`; local data restored).
- Reviewer suite: scratchpad `vitest.review.config.ts` (alias `@/` → `src/`,
  repo `tests/integration/setup.ts`, PGlite) + `phase5.review.test.ts`, run
  with `pnpm exec vitest run --config <scratchpad>/vitest.review.config.ts
  --root <scratchpad>` → 17/17 (10.4 s). Each DEFECT/GAP/LIMIT probe asserts
  the observed value quoted in §3.
- Docker: `gym-app-db-1` healthy; `\d block_week_overrides` and migration
  rows recorded in §2.1; `block_week_overrides` is empty locally (the e2e
  cleans up after itself).

---

## 5. Verdict

**READY FOR REMEDIATION.**

H-1 must be fixed before deployment: with any non-manual prescription the
deload week's load target is not what the athlete sees, and the deload load
can become the post-deload working target. M-1 should be fixed in the same
pass (small, contained). L-1..L-5 are candidates for the same remediation
PR if cheap, otherwise acceptable to defer; they do not by themselves
warrant a cycle.
