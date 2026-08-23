# Phase 5.5 Light — Remediation

Date: 2026-08-23
Scope: the small remediation set from `docs/reviews/phase-5.5-light-review.md`
only. Catalog design and Phase 5 were not reopened; no muscle taxonomy work;
no new phase. Local work only — no commit, no push, no deploy, no production
access. Verification ran against the local Docker PostgreSQL 16
(`gym-app-db-1`, localhost:5432).

Preserved untouched, per instruction: `CLAUDE.md`, `HANDOFF.md` (deleted by
the prior pass), `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`,
`.claude/skills/`, `docs/reviews/pre-phase-6-muscle-taxonomy-evaluation.md`.
Left unchanged, per instruction: L-1 (redundant leg-curl entries), L-2
(pre-ledger bootstrap invariant), L-3 (empty-weight-no-longer-means-0 — this
belongs in the manual iPhone acceptance script, not a code change), L-6
(contribution-weight fallback is closed as part of item 2 below, since it's
in the same decimal-input class, but no new behavior beyond that), and every
other finding not named in the remediation instructions.

## 1. M-1 — `HistoryDetail.tsx` silent-0-kg correction (closed)

`src/ui/history/HistoryDetail.tsx`: the set-weight correction field switched
`type="number"` → `type="text" inputMode="decimal"`, using the existing
`sanitizeDecimalDraft`/`parseDecimalInput` helpers from `src/ui/decimalInput.ts`
(no new helper needed here). The Save handler now parses the weight before
calling `correctHistorySet` — previously `Number(weight)` with **no
validation at all**, so a comma-collapsed input silently wrote 0 kg into a
completed set with no possibility of visible error.

- A comma or dot decimal (`"82,5"`, `"82.5"`) parses correctly.
- Empty or unparseable input surfaces `"Weight is required."` and blocks the
  save — nothing is optimistically applied to local state and
  `correctHistorySet` is never called.
- An explicitly typed `0` still parses and saves (bodyweight sets stay
  valid).
- Added an `error` state to `HistorySetRow` (it had none before) to render
  the message, matching the pattern already used in `ExerciseCard`'s
  `SetRow`.

## 2. Same decimal-input class at the four remaining fields (closed)

Reused `sanitizeDecimalDraft`/`parseDecimalInput` from
`src/ui/decimalInput.ts` at each site; `targetRirShift` (a signed integer
field) was left as a plain `type="number"`/`Number(...)` field everywhere it
appears, per instruction.

- **`PrescriptionForm.baselineLoadKg`** (L-4) — switched to
  `type="text" inputMode="decimal"`. On submit: empty still means "no
  baseline" (`undefined` on create, `null` on edit — unchanged); a
  non-empty value that fails to parse, or falls outside `[0, MAX_BASELINE_LOAD_KG]`,
  now surfaces an inline error and blocks submit instead of silently clearing
  an existing baseline on edit.
- **`BlockForm` / `WeekOverrides` `setMultiplier`/`loadMultiplier`** (L-5) —
  both files switched to `type="text" inputMode="decimal"`. Added a small
  `parseOptionalMultiplier` helper (blank → `null`/"no override", parse
  failure or out-of-bounds → `"invalid"`) in each file, mirroring the
  domain schema's `positive().max(2)` bound so the client rejects before a
  round trip. Previously a comma collapsed the field to `""` at the DOM
  level itself, so the "was this left blank on purpose?" check silently
  treated an intended `0,9×` deload as "none" with no error at all.
- **`ContributionEditor` weight field** (L-6) — switched to
  `type="text" inputMode="decimal"`, sanitized onChange. Parsing moved into
  `ExerciseForm`'s `buildContributionsPayload`, which now returns either the
  built contributions or an `{ error }` result; a non-empty-but-unparseable
  weight blocks submission with `"Enter valid muscle contribution weights,
  or leave them blank."` instead of silently falling back to the role
  default.

## 3. L-7 — `loadStepKg` decimal-precision guard (closed)

- **Domain/API boundary**: `src/domain/exercises/schema.ts` —
  `.multipleOf(0.01)` added to `loadStepKg` in both `createExerciseSchema`
  and `updateExerciseSchema`. `exercises.load_step_kg` is `numeric(4,2)`, so
  this rejects anything the column would otherwise silently round (e.g.
  `1.234` → `1.23`) at the API boundary instead.
- **UI feedback**: added `decimalPlaceCount(raw: string): number` to
  `src/ui/decimalInput.ts` — counts digits after the separator on the *raw
  draft string*, not the parsed float, so it can't be fooled by binary
  floating-point error (`1.005 * 100 !== 100.5` in IEEE 754). `ExerciseForm`
  now rejects `loadStepKg` with more than 2 decimal places client-side with
  a combined message before it ever reaches the API.
- Verified `0.25`, `0.5`, `1.25`, `2.5`, and `99.99` all still parse and pass
  both the client check and the new schema constraint (unit tests below).

## 4. L-9 — walking lunges marked unilateral (closed)

`src/db/seed/exerciseCatalog.ts`: `barbell-walking-lunge` and
`bodyweight-walking-lunge` (the two newly-added Phase 5.5 entries) now carry
`laterality: "unilateral"`, matching the catalog's other single-leg
variants (`dumbbell-bulgarian-split-squat`, `dumbbell-step-up`). No other
line in the accepted 92-entry catalog was touched — confirmed via `git diff`
(exactly these two additions).

## 5. Implementation report corrected

`docs/reviews/phase-5.5-light-implementation.md` corrected in place (as
inline notes, not rewritten history) at three points:

1. §3's deferred-components list — added a note that all five were
   subsequently closed here, and that the review escalated `HistoryDetail.tsx`
   specifically because it was the only one of the five with zero validation.
2. §5's E2E paragraph — corrected from "14 of 15, one pre-existing gap" to
   the review's actual finding: the suite is 15/15 green; the failure was a
   state-latched race in `ensureNoActiveSession`, not a persistent product or
   coverage gap (detail in §6 below).
3. §7's limitations bullets — "Four other components" corrected to "Five"
   (the sentence already listed five), and the `offline-cold-launch.spec.ts`
   bullet corrected to match the §5 fix.

## 6. E2E cleanup helper made deterministic

**Root cause (per the review):** `tests/e2e/helpers.ts`'s
`ensureNoActiveSession` probed the takeover button with a one-shot,
non-retrying `isVisible()` immediately after `login()` returned.
`TodaySection`'s loading gate renders nothing but "Loading…" — neither
"Start workout" nor "Discard it & start fresh" — until its
`remoteState.kind === "checking"` remote-session check resolves. A leftover
`in_progress` session in the shared local dev Postgres (residue from a prior
run) combined with that race to produce a deterministic 30s timeout in
`offline-cold-launch.spec.ts`, which is why a `git stash` re-run against the
unmodified codebase reproduced the same failure and looked
codebase-independent — it was actually the same leftover row plus the same
race, present either way.

**Fix (`tests/e2e/helpers.ts`):** `ensureNoActiveSession` now waits for
whichever of the two mutually-exclusive buttons actually renders —
`Promise.race([takeover.waitFor(), startWorkout.waitFor()])` — the same idiom
`login()` already uses for its own setup-vs-login branch, instead of sampling
the DOM once.

**Residue on failure (`tests/e2e/offline-cold-launch.spec.ts`):** this spec's
only in-progress-session cleanup lived in launch 4's success path, so a
failure in any earlier launch left the shared dev Postgres holding an
`in_progress` session for the next run to trip over. Added a `test.afterEach`
that runs only when the test did not pass, opens a fresh online context, logs
in, and calls `ensureNoActiveSession` to discard any leftover session;
errors inside it are swallowed so a cleanup failure can never mask the real
test failure. Not a suite redesign — one hook, reusing existing helpers.

**Regression coverage (`tests/e2e/ensureNoActiveSession.spec.ts`, new):**
reproduces the exact race by delaying `/api/active-session` via
`page.route()` and calling `ensureNoActiveSession` without first waiting for
the page to settle (unlike `login()`, whose own heading-wait is gated behind
the same check and so cannot return before the window this bug lived in has
already closed). **Verified this test actually catches the bug**: temporarily
reverted `ensureNoActiveSession` to the old one-shot `isVisible()` and
re-ran — it failed with exactly the predicted symptom (`Start workout` never
appears, the foreign-session banner does instead); restored the fix and
re-ran — it passes. Also verified the `afterEach` cleanup hook directly: a
temporary forced failure inside `offline-cold-launch.spec.ts` (immediately
after launch 1 creates the in-progress session) confirmed the hook fires and
leaves zero `in_progress` rows afterward; reverted.

## 7. Test and verification results (all rerun locally, this session)

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm test:unit` | **336 passed, 0 failed** (27 files — 322 baseline + 14 new: `decimalPlaceCount` (4), `loadStepKg` precision (6), `loadStepKg` precision on update (2), walking-lunge laterality (2)) |
| `pnpm test:integration` (PGlite) | **155 passed, 0 failed** (12 files — unchanged from baseline; this pass touched no schema/service code the integration suite exercises beyond what was already covered) |
| `pnpm test:e2e` (full suite, local Postgres) | **16 passed, 0 failed** (15 baseline specs + new `ensureNoActiveSession.spec.ts`) — run twice for determinism, plus `offline-cold-launch.spec.ts` + `ensureNoActiveSession.spec.ts` run in isolation; all green |
| `pnpm build` | clean, 25 routes, SW bundled |
| `pnpm db:generate` | **"No schema changes, nothing to migrate"** — confirms no migration was needed; this pass touches no `src/db/schema/` file |

**Database state:** verified zero `in_progress` workout_sessions rows before
and after every e2e run in this session (direct SQL against the shared local
dev Postgres), including after the intentional failure-injection runs used
to verify the regression test and the cleanup hook.

## 8. Files changed (this remediation pass only)

- `src/ui/decimalInput.ts` — added `decimalPlaceCount`.
- `src/domain/exercises/schema.ts` — `.multipleOf(0.01)` on `loadStepKg`.
- `src/ui/exercises/ExerciseForm.tsx` — precision check; contribution-weight
  parse/validate moved out of a bare `Number(...)`.
- `src/ui/exercises/ContributionEditor.tsx` — decimal input class fix.
- `src/ui/history/HistoryDetail.tsx` — M-1 fix.
- `src/ui/prescriptions/PrescriptionForm.tsx` — L-4 fix.
- `src/ui/blocks/BlockForm.tsx`, `src/ui/blocks/WeekOverrides.tsx` — L-5 fix.
- `src/db/seed/exerciseCatalog.ts` — L-9 fix (2 lines, laterality only).
- `tests/e2e/helpers.ts` — `ensureNoActiveSession` race fix.
- `tests/e2e/offline-cold-launch.spec.ts` — failure-cleanup `afterEach`.
- `tests/e2e/ensureNoActiveSession.spec.ts` (new) — regression coverage.
- `tests/unit/decimalInput.test.ts`, `tests/unit/exerciseSchema.test.ts`,
  `tests/unit/exerciseCatalog.test.ts` — regression coverage for items 2–4.
- `docs/reviews/phase-5.5-light-implementation.md` — corrections (item 5).

Not touched: any file under `src/db/schema/`, `src/db/seed/exercises.ts`
(seeding mechanism), `src/domain/exercises/muscleGroups.ts`, any of the
92 pre-existing catalog entries' contributions, or any of the six files
explicitly listed as preserved above.

## 9. Verdict

All required fixes from `docs/reviews/phase-5.5-light-review.md` are closed:
M-1, the decimal-input class at the four remaining fields, L-7, and L-9. The
implementation report is corrected. The e2e cleanup helper is deterministic,
with regression coverage that was verified to actually fail against the old
implementation and pass against the fix, and the residue-on-failure path was
verified directly with a forced failure. Every requested check is green
against local Docker Postgres; no schema drift; no production access; no
commit, push, or deploy performed.

L-1, L-2, L-3, and all other findings not named in the remediation
instructions are unchanged, as directed. L-3 remains a manual iPhone
acceptance script item, not a code change. Manual iPhone acceptance of the
full Phase 5.5 Light pass (catalog + decimal fixes + this remediation)
remains pending and is not substituted by anything in this document.

**READY FOR TARGETED CLOSEOUT VERIFICATION**
