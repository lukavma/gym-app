# Phase 5 — Block Lifecycle & Deloads: Implementation Report

Date: 2026-08-22
Scope: implementation-plan.md Phase 5 / mvp-scope.md F4. Local work only —
no commit, no push, no deploy, no production access. Verification ran
against the local Docker PostgreSQL 16 (`gym-app-db-1`, localhost:5432).

---

## 1. What was built

### Domain core (pure, isomorphic)

- `src/domain/scheduling/effectiveModifiers.ts` — `resolveEffectiveWeekModifiers(weekIndex,
  weeksPlanned, deload, overrides)`: the single precedence resolver
  (domain-model.md §5). A `block_week_overrides` row for the current week
  always wins over the block's scheduled `DeloadConfig` for that same week;
  `'last'` resolves against the block's *current* `weeksPlanned` (so
  extending a block moves it). Only `type: 'deload'` sets `isDeload = true`
  — an override of `type: 'custom'` still applies its modifiers to Today's
  targets but leaves the session fully evaluated, in history, and in the
  carry-forward chain.
- `src/domain/prescriptions/applyWeekModifiers.ts` — `applySetMultiplier`
  (floor, minimum 1 set), `applyTargetRirShift` (clamps each end
  independently to `[0, 10]`; two independent monotonic clamps can never
  invert the band), `applyLoadMultiplier` (multiply then round via the
  existing `roundToStepKg`).
- `src/domain/prescriptions/buildSnapshot.ts` — `buildPrescriptionSnapshotData`
  now takes `weekModifiers` and `loadStepKg`. Ordering matches
  prescription-model.md §4/§5 literally: `setMultiplier`/`targetRirShift`
  apply to the *static* scheme/RIR band first; the working-target chain
  (Decision → carry-forward → baseline) resolves next; `loadMultiplier`
  applies last, to the *resolved* prefill number, not to `baselineLoadKg`
  directly.

### Single authoritative resolution point

`buildTodayBundle()` (`src/server/today/service.ts`) is the only place
modifiers are ever computed: it resolves `weekIndex` → effective modifiers
once per bundle build, applies them per exercise, and sets `today.isDeload`
from the same result. Every `TodayBundleExerciseEntry` carries
`appliedModifiers` through to the client DTO
(`TodayBundleExerciseEntryDto`). `startSession()` (`src/sync/activeSession.ts`,
identical code path online and from the cached bundle offline) now freezes
`entry.appliedModifiers` verbatim instead of hardcoding `null` — no second
modifier computation exists anywhere, satisfying "cached/offline workout
start uses the already-resolved effective prescription."

### `block_week_overrides` (data-model.md §2.11)

- `src/db/schema/blockWeekOverrides.ts` — column-for-column: `id`,
  `block_id` FK CASCADE, `week_index smallint ck >= 1`, `type ck in
  ('deload','custom')`, `modifiers jsonb`, `note`, timestamps;
  `uq_week_override` unique `(block_id, week_index)`.
- Migration `drizzle/0006_abandoned_giant_man.sql` (new table only).
- `src/domain/blocks/schema.ts` — `createWeekOverrideSchema` /
  `updateWeekOverrideSchema` (weekIndex is immutable once created — change
  week by delete+recreate).
- `src/server/blocks/service.ts` — `listWeekOverrides`, `createWeekOverride`,
  `updateWeekOverride`, `deleteWeekOverride`. Ownership follows the same
  block→program→user chain as the rest of the file. Unlike schedule/deload,
  overrides are **not** locked to `status === 'planned'` (domain-model.md §5:
  "a manual deload is a WeekOverride inserted at any time").
- Plain online REST routes — `GET/POST /api/blocks/[id]/week-overrides`,
  `PATCH/DELETE /api/blocks/[id]/week-overrides/[overrideId]`. No sync-outbox
  involvement (planning-definition writes, like blocks/templates/prescriptions).

### Block completion summary + start-next-block

- `getBlockSummary(db, userId, blockId)` in `src/server/blocks/service.ts`,
  served at `GET /api/blocks/[id]/summary`. Derives on read, nothing
  persisted: `sessionsCompleted` (count of completed sessions for the
  block), `hadDeloadSession` (any completed session frozen `isDeload`), and
  per-exercise `beforeLoadKg`/`afterLoadKg` for every exercise scheduled in
  the block. *Before* = the block's earliest completed non-deload session's
  first work-set load; *after* = the same precedence Today uses (latest
  accepted/modified Decision for the exercise+block, via the already-exported
  `getLatestDecisionChosenByExercise`, else the latest completed non-deload
  session's load), both scoped to this block. Exercises never performed
  (non-deload) in the block are omitted.
- "Start next block" is a UI-only affordance, not a new endpoint:
  `src/ui/blocks/BlockSummary.tsx` links to
  `/programs/{programId}/blocks/new?fromBlockId={blockId}`;
  `BlockForm` (create mode) pre-fills `goal`/`schedule`/`weeksPlanned` from
  the source block and leaves `name`/`startDate`/`deload`/`notes` fresh. It
  goes through the existing `createBlock` service, which already guarantees
  a fresh id/sequence/dates/weeks with zero copied sessions, recommendations,
  or week overrides — verified by a dedicated integration test (§4).
- The summary always shows a fixed, non-coercive caveat line when
  `hadDeloadSession` is true (evidence-to-design.md decision 12 / B6): *"a
  temporary dip in load right after it is expected, not a sign of lost
  progress."* Not conditional on detecting a numeric dip — that would invent
  an unsupported heuristic.

### UI

- `src/ui/blocks/BlockForm.tsx` — the scheduled-deload checkbox now exposes
  editable `setMultiplier`/`loadMultiplier`/`targetRirShift` inputs
  (pre-filled with the domain-model heuristic examples 0.5/0.9/+2, each
  independently clearable). Previously this always submitted `modifiers:
  {}`, which was harmless only because nothing read it before Phase 5.
- `src/ui/blocks/WeekOverrides.tsx` (new) — list + add/remove UI for manual
  overrides, shown regardless of block status.
- `src/ui/blocks/BlockSummary.tsx` (new) — sessions-completed count,
  before→after table, the caveat line, and the "Start next block" link.
- `src/ui/today/TodaySection.tsx` / `src/ui/workout/WorkoutExecution.tsx` —
  a "· deload" suffix next to "Week N", reusing the badge convention already
  in `src/ui/history/HistoryList.tsx`/`HistoryDetail.tsx`.
- `src/ui/history/HistoryDetail.tsx` — renders a one-line summary of a
  session-exercise's frozen `appliedModifiers` when present
  (prescription-model.md §5: "history is self-explaining").

### Doc correction (authorized)

`prescription-model.md` §5's example text self-corrected mid-sentence
("...3×5 because deload 0.5× applied to 5×5 — wait, floor(5×0.5)=2...").
Replaced with a single correct example; no behavioral rule changed (floor,
minimum 1, was already stated correctly earlier in the same section).

---

## 2. Modifier / precedence semantics (as implemented)

1. A `block_week_overrides` row for the current `weekIndex` always wins over
   the block's scheduled `DeloadConfig` for that week.
2. `deload.weekIndex === 'last'` resolves against the block's *current*
   `weeksPlanned`, re-evaluated on every bundle build (extending a block
   moves "last" without touching the config; already-snapshotted sessions
   are unaffected since they froze their own `weekIndex`/`isDeload`).
3. `isDeload = true` only for a scheduled deload or an override of `type:
   'deload'`. `type: 'custom'` modifies targets without marking the session
   a deload — it is still evaluated, kept in history, and feeds carry-forward.
4. `setMultiplier`: `Math.max(1, Math.floor(sets * multiplier))`.
5. `targetRirShift`: shifts both ends, then clamps each end independently to
   `[0, 10]` — this can never invert the band.
6. `loadMultiplier`: applied to the *resolved* prefill (Decision →
   carry-forward → baseline chain), not to `baselineLoadKg` directly, then
   rounded to the exercise's `loadStepKg` via the existing `roundToStepKg`.
7. All three are frozen into the session's `PrescriptionSnapshot`
   (`scheme`, `targetRir`, `prefill`, `appliedModifiers`) exactly once at
   start, by the existing snapshot-on-use flow (ADR-007) — Phase 5 changed
   only what gets written into that snapshot, not the "exactly once"
   mechanism itself.

## 3. Judgment calls made (per the deviation protocol — none rise to a
formal `deviations.md` entry; all are interpretations within the specs)

- **Block-summary before/after source**: not defined by any doc. Reused the
  existing working-target machinery instead of inventing new logic (see §1).
- **Start-next-block pre-fill**: copies `goal`/`schedule`/`weeksPlanned`;
  resets `name`/`startDate`/`deload`/`notes`; never references week
  overrides. Implemented as a form pre-fill, not a new endpoint.
- **Custom-type overrides**: modify targets but are not deloads (see §2.3).
- **Post-deload caveat**: unconditional on `hadDeloadSession`, not on a
  detected numeric dip.

## 4. Migration / schema evidence

```
$ pnpm db:generate
16 tables ... block_week_overrides 8 columns 1 indexes 1 fks
[✓] Your SQL migration file ➜ drizzle\0006_abandoned_giant_man.sql

$ pnpm db:migrate
[✓] migrations applied successfully!

$ pnpm db:generate   (drift check, after migrate)
No schema changes, nothing to migrate 😴
```

Live psql verification (all inside rolled-back transactions — zero leftover
rows):

```
=== expect OK: first override for week 1 ===          INSERT 0 1
=== expect ERROR: duplicate (block, week) ===          ERROR: duplicate key value violates
                                                        unique constraint "uq_week_override"
=== expect ERROR: week_index < 1 ===                   ERROR: violates check constraint
                                                        "ck_block_week_overrides_week_index"
=== expect ERROR: bad type ===                         ERROR: violates check constraint
                                                        "ck_block_week_overrides_type"
=== expect OK: valid override ===                      INSERT 0 1
=== expect CASCADE: deleting the block removes it ===  DELETE 1; remaining_overrides = 0
```

## 5. Test results (verbatim)

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm format:check` | ✅ "All matched files use Prettier code style!" |
| `pnpm typecheck` | ✅ clean |
| `pnpm typecheck:sw` | ✅ clean |
| `pnpm test:unit` | ✅ **Test Files 23 passed (23) · Tests 274 passed (274)** |
| `pnpm test:integration` | ✅ **Test Files 12 passed (12) · Tests 141 passed (141)** |
| `pnpm test:e2e` | ✅ **11 passed (1.2m)** — incl. the new `deload.spec.ts` and all Phase 3/4 offline/sync/takeover/progression specs unchanged |
| `pnpm build` | ✅ production build succeeds; new `/api/blocks/[id]/summary` and `/api/blocks/[id]/week-overrides[/…]` routes present |
| `pnpm db:migrate` (local Docker PG16) | ✅ "migrations applied successfully!" (`0006_abandoned_giant_man.sql`) |
| `pnpm db:generate` drift check | ✅ "No schema changes, nothing to migrate" |
| Live constraint verification | ✅ see §4 |

New test coverage:

- **Unit** — `effectiveWeekModifiers.test.ts` (7): override-vs-scheduled
  precedence, `'last'` resolution against `weeksPlanned`, custom-type
  non-deload, no-match. `applyWeekModifiers.test.ts` (15): setMultiplier
  floor/minimum-1, targetRirShift clamping at both extremes, loadMultiplier
  rounding. `buildSnapshot.test.ts` (5): modifiers flow into
  `appliedModifiers`/scheme/targetRir/prefill in the correct order.
- **Integration** — `blockWeekOverrides.integration.test.ts` (8): CRUD,
  ownership, duplicate-week rejection, editable regardless of block status,
  isolation from a second block. `blockSummary.integration.test.ts` (3):
  sessions-completed count, before→after derivation, `hadDeloadSession`,
  omission of never-performed exercises, cross-user 404. `today.integration
  .test.ts` (+4): scheduled deload modifies the bundle and sets `isDeload`;
  no effect on a non-matching week; a manual override precedes the
  scheduled deload for the same week; carry-forward skips a deload session
  and uses the latest pre-deload load. `progression.integration.test.ts`
  (+1): a session frozen `isDeload: true` produces zero recommendations.
- **E2E** — `deload.spec.ts`: reads the shared seed block's current week,
  creates a real deload week override via the REST API, reloads Today,
  asserts the modified scheme/RIR/load and the "· deload" badge, starts and
  discards the workout to confirm the badge carries into the frozen session,
  then deletes the override in `finally` to restore the shared fixture.

## 6. Known limitations

- Only the load axis of `loadMultiplier` is exercised end-to-end in the e2e
  spec (set/RIR axes are covered at the unit/integration level); a full
  three-axis e2e assertion was judged redundant given the integration
  coverage already proves the combination.
- `WeekOverrides`/`BlockSummary` UI components are simple, unstyled-beyond-
  the-existing-Tailwind-primitives forms — no drag-reorder or bulk editing;
  matches the size/scope of the rest of the block UI.
- Phase 4 review's M-1 and its LOW findings (L-1..L-5) are unchanged and
  still accepted for Phase 8, per this phase's explicit instruction not to
  opportunistically remediate them.

## 7. Deviations

None. Every judgment call in §3 is an interpretation within the specs'
stated intent, not a contradiction between binding documents.
`docs/architecture/deviations.md` needs no new entry.

## 8. Pending manual acceptance

- Real-iPhone pass (installed PWA): deload badge renders on Today and the
  active workout; the deload week's modified sets/load/RIR are visible and
  usable with gym-gloves-level tap targets; week-override add/remove and the
  block summary + "Start next block" flow work end-to-end on-device.
- Deploy + independent review remain outside this phase's authorization.

---

**READY FOR INDEPENDENT REVIEW**
