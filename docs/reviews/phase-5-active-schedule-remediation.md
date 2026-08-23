# Phase 5 — Active-Block Schedule Editing: Field Remediation

Date: 2026-08-22
Scope: a real-iPhone acceptance defect found after Phase 5 (deploy commit
`defccb0`, migration 0006 applied to production): once a block is `active`,
its schedule could not be edited at all — a `BlockScheduleLockedError` fired
for any `schedule`/`deload` change the moment a block left `planned`. This
contradicts `domain-model.md` §9 ("Block config, schedule, deload | yes
(future weeks)") and its lifecycle line ("Block config, schedule, and
deload remain mutable for future workouts while existing sessions retain
their historical meaning through snapshots"). Implementation and verification
were local-only, with no production access at any point, against the local
Docker PostgreSQL 16 (`gym-app-db-1`, localhost:5432) and PGlite. See §10 for
the close-out.

---

## 1. Corrected lifecycle semantics

**Before:** `updateBlock` threw `BlockScheduleLockedError` for any
`schedule`/`deload` change once `status !== 'planned'` — i.e. the moment a
block was activated, its schedule and deload froze for the rest of its
life. Existing schedule-editing UI text and comments described this as
intentional ("schedule/deload are snapshotted into sessions once a block is
running"), which conflated *session* snapshotting with *block*
immutability — two different things.

**After:** schedule and deload stay mutable for as long as the block is
still running (`planned` or `active`); only a *finished* block
(`completed`/`abandoned`) locks them, because there are no more future weeks
left for an edit to apply to.

- `BlockScheduleLockedError` renamed to
  [`BlockScheduleImmutableError`](../../src/server/blocks/service.ts) and
  redefined: `touchesSchedule && (status === 'completed' || status ===
  'abandoned')` — was `touchesSchedule && status !== 'planned'`.
- API error code `schedule_locked` → `schedule_immutable` (409); the route
  ([`src/app/api/blocks/[id]/route.ts`](../../src/app/api/blocks/[id]/route.ts))
  and the UI's error-message mapping
  ([`src/ui/blocks/BlockForm.tsx`](../../src/ui/blocks/BlockForm.tsx)) were
  updated together. Nothing was deployed under the old contract, so no
  compatibility shim was needed.
- `BlockForm`'s `locked` predicate changed from `status !== 'planned'` to
  `status === 'completed' || status === 'abandoned'`; the schedule editor,
  the weekday pickers, add/remove/reorder controls, and the deload section
  are now all rendered (and postable) on a `planned` **or** `active` block.
- All ownership, cross-program-template, archived-template,
  non-empty-schedule, position-ordering, and transactional guarantees from
  Phase 5 are unchanged — only the status gate moved. Overrides
  (`block_week_overrides`) were already editable "at any time" per
  `domain-model.md` §5 and remain untouched.
- Planning edits (`updateBlock`, week overrides) remain plain online REST
  operations, never execution-outbox operations — no change to that write
  path.

## 2. Fixed vs. rotation schedule modes

No DB column was added for "mode" — it is still inferred from shape, same
convention `domain/scheduling/todayTemplate.ts` already used. What changed
is that a schedule's *shape* is now validated at the write boundary instead
of silently tolerated:

- **Fixed weekdays**: every entry has ≥1 weekday. A template may own
  multiple distinct weekdays in one entry (e.g. Upper A on Mon+Thu) — this
  was already representable in the schema and needed no change; a four-day
  Upper A / Lower A / Upper B / Lower B schedule (four entries, one weekday
  each) and a two-template Upper/Lower-on-multiple-days schedule (two
  entries, several weekdays each) are both accepted.
- **Rotation**: no entry has weekdays; entry `position` order is the
  sequence.
- **Mixed** (some entries with weekdays, some without) is now **rejected**
  at the schema boundary
  ([`scheduleInputSchema`](../../src/domain/blocks/schema.ts), applied to
  both `createBlockSchema.schedule` and `updateBlockSchema.schedule`) —
  previously `todayTemplate.ts` silently resolved a mixed schedule as
  "weekday mode wins", which is exactly the kind of guess the remediation
  brief called out as unacceptable.
- **Overlapping weekdays** across different entries are rejected — same
  schema pass, one issue per offending day, naming the day
  (`"Tuesday is assigned to more than one workout…"`).
- **Duplicate template entries** are rejected — the same template cannot
  appear in two schedule entries; repeated fixed days must live in one
  entry's `weekdays` array.
- All three checks return **Zod issues with phone-readable messages**, not
  generic "invalid schedule" text; `BlockForm`'s error handling now surfaces
  the schema issue messages directly (`body.issues.map(i => i.message)`)
  instead of a hardcoded modifier-bounds string, so the UI shows the exact
  reason (mixed mode, which day, or which template) rather than a dead end.
- **Switching modes is deliberate, not lossy**: `BlockForm` keeps a
  `scheduleMode` state (`"fixed" | "rotation" | "mixed"`) independent of
  each row's `weekdays` array. Clicking "Rotation order" hides the weekday
  pickers but does **not** clear the underlying per-row weekday state —
  switching back to "Fixed weekdays" before saving restores exactly what
  was there. `weekdays` are only actually dropped from the request payload
  at submit time, and only because the athlete explicitly chose Rotation
  order and then explicitly saved.
- **Malformed legacy data** (a schedule that is already mixed when loaded —
  unreachable from anything the shipped product could write before this
  fix, since the app itself is unreleased, but defended anyway): `BlockForm`
  derives an explicit third mode, `"mixed"`, shows a visible warning
  banner, and renders every row's weekday picker so the athlete can see and
  correct it — it is never silently normalized, auto-picked, or dropped.
  `todayTemplate.ts`'s resolver keeps its old defensive fallback (weekday
  mode wins) purely so a legacy mixed row can never make a *read* throw;
  the UI is where correction actually happens.

## 3. Rotation-continuation rule

**Before:** `resolveTodayTemplate` took `completedSessionCountForBlock`
and picked `sorted[count % sorted.length]` — a count-against-current-length
formula that was only ever safe because the schedule itself was immutable.
The moment a block's schedule can change while active, this modulo breaks:
adding or removing an entry silently reshuffles which template "next"
means, with no relationship to what was actually last performed.

**After:** [`resolveTodayTemplate`](../../src/domain/scheduling/todayTemplate.ts)
takes `latestCompletedTemplateId: string | null` instead of a count, and:

1. If no session has ever completed for the block, resolve the first entry
   (by `position`).
2. Otherwise, find the latest completed session's `templateId` in the
   *current* ordered schedule.
   - If found at index `i`, resolve the entry at `(i + 1) % length` —
     cyclic continuation from where the athlete actually left off.
   - If not found (the entry was removed, or its template was swapped for
     a different one), resolve the first entry.

This is a single pure function with explicit inputs, still unit-tested
comprehensively (below) — no history lookback, no hidden state.
`src/server/today/service.ts` now fetches the most recently **completed**
session's `template_id` (lineage FK, `order by started_at desc limit 1`)
once per bundle build and passes it straight through; the previous
`count(*)` query is gone.

Consequence: adding, removing, or reordering rotation entries produces an
*explainable* next workout — "continue from what you last did, or start
over from the top if that's gone" — rather than a jump that depends on the
new array's length.

## 4. Validation behavior

- Overlapping weekday assignments are now **impossible to persist** via
  `createBlock`/`updateBlock` (both route through `scheduleInputSchema`),
  so `resolveTodayTemplate`'s weekday-mode branch — which takes the first
  match — can no longer silently paper over a real conflict for any
  schedule written after this fix.
- Every rejection carries a precise, phone-readable message and a Zod
  `path`; today `BlockForm` just joins and displays the message text.

  **Corrected after verification** (V-1 in
  [`phase-5-active-schedule-remediation-verification.md`](./phase-5-active-schedule-remediation-verification.md)):
  an earlier draft of this section claimed the path was `["schedule"]` or
  `["schedule", index, "weekdays" | "templateId"]`. It is not.
  `validateScheduleShape` hardcodes a leading `"schedule"` segment, and Zod
  prepends the parent key again when the refinement runs under
  `createBlockSchema`/`updateBlockSchema` — the only way the app uses it — so
  the segment is **doubled**. Measured verbatim:

  | Input | Actual `issues[].path` |
  |---|---|
  | `updateBlockSchema`, overlapping weekdays | `["schedule", "schedule", 1, "weekdays"]` |
  | `createBlockSchema`, overlapping weekdays | `["schedule", "schedule", 1, "weekdays"]` |
  | `updateBlockSchema`, duplicate template | `["schedule", "schedule", 1, "templateId"]` |
  | `updateBlockSchema`, mixed mode | `["schedule", "schedule"]` |
  | `scheduleEntryInputSchema`'s own per-entry issue (control) | `["schedule", 0, "weekdays"]` |

  The verdicts and the message text are correct and unaffected; only `path`
  is wrong. `BlockForm` reads `i.message` and never `path`, so there is no
  user-visible impact today. **Accepted as-is** — a future field-level UI
  must drop the hardcoded prefix from `validateScheduleShape`'s three
  `ctx.addIssue` calls first.
- `weekModifiersSchema`'s existing `(0, 2]` / `[-10, 10]` bounds (M-1,
  prior remediation) are untouched and unaffected by this pass.

## 5. Historical integrity and block-summary correction (L-3)

Promoted from `docs/reviews/phase-5-review.md`'s L-3 finding, now directly
reachable once an active schedule can be edited.

**Before:** `getBlockSummary` enumerated exercises via
`block_schedule_entries → exercise_prescriptions` — the block's *current*
mutable planning data. Removing or replacing a scheduled template made its
already-performed exercises vanish from a completed block's summary, even
though the sessions and their frozen snapshots were untouched.

**After:** `getBlockSummary`
([`src/server/blocks/service.ts`](../../src/server/blocks/service.ts))
enumerates exercises from `session_exercises` joined to the block's
completed, non-deload sessions — what was **actually performed**, never
what is currently scheduled:

- Removing a template from an active (or since-completed) block's schedule
  no longer removes its previously performed exercises from the eventual
  summary.
- Ad-hoc exercises (`source: 'adhoc'`, which never had a prescription to
  enumerate from under the old query) are now included for free, as long as
  a work set was actually logged.
- Exercise display name prefers the **frozen `PrescriptionSnapshot`'s**
  `exerciseName` (what was true when the athlete performed it) and falls
  back to the exercise's current name only when no snapshot exists (ad-hoc
  entries) — matching the convention `getSessionDetail` already uses for
  history rendering,
  [`src/server/history/service.ts:209`](../../src/server/history/service.ts#L209)
  (`prescription?.snapshot.exerciseName ?? nameById.get(e.exerciseId) ?? ""`),
  under ADR-007 §1's "history reads are self-contained" mechanism.

  **Corrected after verification** (V-3): an earlier draft cited this as "the
  existing stable-identity policy (ADR-007 §2)". That citation was inverted —
  ADR-007 §2 says the opposite about names ("history references `exercise_id`
  live; renames are safe (same movement) … No name snapshots needed beyond
  the one in the prescription snapshot"). The behaviour is right and matches
  the history service; only the citation was wrong.
- The established before/after target derivation (before = earliest
  completed non-deload session's first work-set load; after = latest
  accepted/modified Decision, else latest completed non-deload session's
  load) is **unchanged** — only the *set of exercises* the loop runs over
  changed, not the per-exercise math.
- No new persisted aggregate was introduced; the no-persisted-aggregates
  rule (`data-model.md` §5, `architecture-plan.md` §7) holds — everything is
  still derived on read.

Schedule and deload edits never touch `workout_sessions`, `session_exercises`,
`set_logs`, `recommendations`, or their JSONB snapshots — verified directly
(§7).

## 6. Active-block editing UX

`BlockForm` now offers, on a `planned` **or** `active` block:

- add another schedule entry, remove an entry, change its template
  (existing controls, now reachable while active);
- add/remove weekdays per entry (weekday toggle row, shown in Fixed and
  Mixed mode);
- reorder entries (new ↑/↓ buttons per row — works in either mode, though
  it only changes resolution in Rotation mode);
- switch explicitly between Fixed weekdays and Rotation order (new
  segmented control, `data-testid="schedule-mode-fixed"` /
  `"schedule-mode-rotation"`);
- save, reload, and see the persisted result (plain REST `PATCH
  /api/blocks/[id]`, same as before — just no longer gated on `planned`).

A banner is shown whenever the schedule editor is open on an `active`
block: *"Changes apply to workouts from today onward. A workout already in
progress keeps its original plan."* Scheduled-deload configuration follows
the identical rule (editable on `planned`/`active`, locked on
`completed`/`abandoned`); manual `WeekOverride` behavior — already editable
"at any time" — is untouched.

In-progress-session isolation is a pre-existing guarantee, not new code:
`updateBlock`'s transaction only ever writes to `blocks` and
`block_schedule_entries`; it has no path that touches `workout_sessions` /
`session_exercises` / their JSONB snapshots. This was re-verified directly,
not just assumed (§7, §8's e2e step 8).

### 6.1 Rotation is the default mode for a newly created block — accepted

`scheduleMode` initialises to `"rotation"`, and `deriveScheduleMode` only
runs on the edit-load and copy-from-block paths, so the **block creation**
form (`/programs/[id]/blocks/new`) opens in Rotation order with the weekday
pickers hidden until the athlete taps "Fixed weekdays". Measured in a real
browser during verification (V-6):

```
CREATE-MODE default: fixed=false rotation=true
CREATE-MODE weekday pickers: default=0 afterClickingFixed=1
```

Before this pass the create form always rendered the weekday pickers. This
is a real behaviour change on a path outside the remediation's stated scope
(editing an *active* block), so it is recorded here as a deliberate,
**accepted** decision rather than left as a side effect.

**Rationale:** rotation preserves workout order when calendar days are
missed. A rotation schedule advances only on a completed session (§3), so a
skipped day pushes the whole sequence forward instead of dropping a workout
— the athlete always gets the next workout they actually owe, which is the
behaviour a single-user training log wants by default. A fixed-weekday
schedule, by contrast, silently *forfeits* a missed day: Tuesday's workout
simply does not happen and Wednesday resolves to Wednesday's entry.

**Fixed weekdays remains an explicit, equal alternative** — one tap on the
segmented control directly above the schedule rows, with no data loss in
either direction (§2, "Switching modes is deliberate, not lossy"). Nothing
about the default constrains a block that wants fixed days.

## 7. Test results (verbatim)

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm format:check` | ✅ "All matched files use Prettier code style!" |
| `pnpm typecheck` | ✅ clean |
| `pnpm typecheck:sw` | ✅ clean |
| `pnpm test:unit` | ✅ **Test Files 24 passed (24) · Tests 299 passed (299)** |
| `pnpm test:integration` | ✅ **Test Files 12 passed (12) · Tests 154 passed (154)** |
| `pnpm test:e2e` | ✅ **13 passed (~1.1m)**, incl. the new `active-schedule-edit.spec.ts` and all prior Phase 3–5 specs unchanged |
| `pnpm build` | ✅ production build succeeds; no new routes |
| `pnpm exec drizzle-kit check` (local Docker PG16) | ✅ "Everything's fine" |
| `pnpm db:generate` drift check | ✅ **"No schema changes, nothing to migrate"** — no migration required by this remediation |

New/changed test coverage:

- **Unit** —
  [`tests/unit/todayTemplate.test.ts`](../../tests/unit/todayTemplate.test.ts)
  (rewritten for the new resolver signature, 14 cases): fixed-weekday
  resolution, one template with multiple distinct weekdays, rotation from
  no completed session, rotation from the latest completed template,
  wrap-around, a newly added entry resolved correctly, reordering resolved
  explainably, a removed latest-completed template falling back to the
  first entry, and single-entry-schedule invariance.
  [`tests/unit/blockSchema.test.ts`](../../tests/unit/blockSchema.test.ts)
  (new `scheduleInputSchema` describe, 6 cases): mixed mode rejected,
  overlapping weekdays rejected (with message assertions), duplicate
  templates rejected (both fixed and rotation shapes), one template with
  multiple weekdays accepted, pure fixed and pure rotation schedules
  accepted.
- **Integration** —
  [`tests/integration/blocks.integration.test.ts`](../../tests/integration/blocks.integration.test.ts):
  replaced the old "throws `BlockScheduleLockedError` once active" test with
  `BlockScheduleImmutableError` on `completed`/`abandoned`; added
  full-schedule-editor-on-an-active-block (add/remove/change
  template/move weekdays/reorder/switch to rotation), scheduled-deload
  edit on an active block, cross-program/archived-template rejection on an
  active block, ownership isolation for `updateBlock`, and two session-
  snapshot-immutability tests (in-progress and completed sessions,
  byte-identical after schedule+deload edits).
  [`tests/integration/blockSummary.integration.test.ts`](../../tests/integration/blockSummary.integration.test.ts):
  added the L-3 regression (a template removed from an active schedule
  keeps its performed exercise in the summary), an ad-hoc-exercise
  inclusion case, and a frozen-snapshot-name-preferred-over-current-name
  case.
  [`tests/integration/today.integration.test.ts`](../../tests/integration/today.integration.test.ts):
  added a fixed-schedule-edit-changes-Today-resolution case and a
  rotation-continuation-then-removal-falls-back-to-first case, both driven
  through `updateBlock` on an already-active block.
- **E2E** —
  [`tests/e2e/active-schedule-edit.spec.ts`](../../tests/e2e/active-schedule-edit.spec.ts)
  (new, phone-sized Chromium): builds a real four-day Upper A / Lower A /
  Upper B / Lower B fixed-weekday schedule on the shared seed block (already
  active), opens the real block editor, moves today's weekday from one
  entry to another, saves, reloads, confirms the change persisted and is
  visible, confirms `/api/today-bundle` now resolves the newly assigned
  template for the tested (actual, real-clock) day, confirms a workout
  started *before* the edit is byte-identical on `/api/active-session`
  *after* the edit, then exercises a real overlapping-weekday validation
  error in the browser (visible error banner, nothing persisted). The app
  enforces at most one active program/block per user (ADR-004, single
  account) — like `deload.spec.ts`'s week-override dance, this spec
  temporarily reshapes the shared block's schedule and restores the exact
  original in `finally` (verified directly against the DB: schedule
  restored to its original single rotation entry, all four temporary
  templates archived, both after a failing dry run and after the passing
  run).

## 8. Known limitations and deferred open points

- **M-1a** (from `phase-5-remediation-verification.md` §3.2): a
  hand-crafted, pre-bound out-of-range stored modifier would still fail
  snapshot validation rather than the scheme alone. Unrelated to this
  remediation's blast radius; still deferred.
- **L-1, L-2, L-4, L-5** (from `phase-5-review.md`): `weekIndex` upper
  bound on overrides, the 8-session carry-forward window edge case, a
  stale pre-Phase-5 cached bundle missing `appliedModifiers`, and
  report/plan accuracy notes. None touched by this pass; all remain
  deferred exactly as previously scoped.
- **Explicitly out of scope for this remediation** (per the task brief, and
  confirmed untouched): moving a single workout for one date/week,
  missed-workout/catch-up modeling, schedule occurrence tables or
  per-week overrides beyond the existing `WeekOverride`, changing
  recommendation/carry-forward scope from `(exercise, block)`, independent
  progression tracks for the same exercise across templates, exercise
  taxonomy/catalog changes, Phase 6 volume work, same-day repeat-workout
  policy, unrelated Phase 4/5/8 findings, and speculative calendar
  architecture.
- The `todayTemplate.ts` weekday-mode resolver keeps a defensive
  "any-entry-with-weekdays-wins" fallback for a schedule that is *already*
  mixed in the database (impossible to write going forward, but a read
  path must never throw on data written before this fix — moot in
  practice since Phase 5 was never deployed and no such row can exist).
  This is a read-time safety net, not a second source of truth for mode —
  the UI is where correction actually happens (§2).
- Reordering entries is offered unconditionally (both modes) rather than
  only in Rotation mode, matching the brief's "reorder rotation entries"
  requirement while keeping one code path; it is a harmless no-op for
  Today resolution in Fixed mode, where only weekdays matter.

## 9. Scope discipline

- No migration: `pnpm db:generate` reports no schema drift; no DB mode
  column was added, exactly as instructed.
- No change to Phase 5's deload-modifier math, the H-1/M-1 remediation, or
  any of `blockWeekOverrides.integration.test.ts`'s 8 passing cases — all
  re-run unmodified and green.
- No change to any user-owned or unrelated working-tree file (`CLAUDE.md`,
  the `HANDOFF.md` rename/deletion, `gpt-handoff.md`, `gpt-memory.md`,
  `.claude/skills/`).
- Nothing run against production.

---

## 10. Close-out

Independently verified —
[`phase-5-active-schedule-remediation-verification.md`](./phase-5-active-schedule-remediation-verification.md)
(**READY WITH ACCEPTED RESIDUALS**): 51 service/DB probes plus a real
Chromium workflow at a 390×844 iPhone viewport, written without reusing this
remediation's own tests, reproduced every behavioural claim above.

All six LOW residuals (V-1 … V-6, plus the informational V-7) are
**accepted**. No further remediation cycle is opened. This close-out changed
documentation and one test *description* only — no runtime behaviour, schema,
migration, or production data was touched:

| ID | Residual | Disposition |
|---|---|---|
| V-1 | Doubled Zod issue `path` segment | Accepted; §4's claim corrected to state the real paths |
| V-2 | Cross-entry overlap message also fires for a duplicate day inside one entry | Accepted; UI-unreachable (weekday control is a toggle) |
| V-3 | Inverted ADR-007 §2 citation | Accepted; §5 now cites `src/server/history/service.ts:209` / ADR-007 §1 |
| V-4 | `today.integration.test.ts` case titled "after reordering" never reorders | Accepted; test renamed to describe what it asserts (reorder resolution is covered by `todayTemplate.test.ts`) |
| V-5 | `updateBlock` has no shape guard independent of the schema | Accepted; HTTP-unreachable, both routes `safeParse` first |
| V-6 | Rotation is the default on the block **creation** form | Accepted with rationale — §6.1 |
| V-7 | e2e specs leave archived fixture templates in the dev DB | Informational; local dev only |

**CLOSED — ACCEPTED WITH RESIDUALS**
