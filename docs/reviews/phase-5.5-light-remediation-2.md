# Phase 5.5 Light — Micro-Remediation 2

Date: 2026-08-23
Scope: only M-1(new) and LOW-2 from
`docs/reviews/phase-5.5-light-remediation-verification.md`. Not another full
Phase 5.5 review or Phase 5 re-examination. L-1, L-2, L-3, and everything
else in that document is unchanged. The offline suite was not rerun (only
the targeted decimal-input e2e spec). Local work only — no commit, no push,
no deploy, no production access. Verification ran against the local Docker
PostgreSQL 16 (`gym-app-db-1`, localhost:5432).

Preserved untouched: `CLAUDE.md`, `HANDOFF.md` (already deleted by an
earlier pass), `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`,
`.claude/skills/`. Also preserved and ignored, per instruction: the
concurrent taxonomy documentation touched by another session during this
window (`docs/architecture/{architecture-plan,data-model,domain-model,
evidence-to-design,implementation-plan,volume-model}.md`,
`docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md`,
`docs/reviews/pre-phase-6-muscle-taxonomy-rescope{,-plan}.md`,
`docs/reviews/pre-phase-6-muscle-taxonomy-evaluation.md`) — none of these
were read for or affected by this remediation.

## 1. M-1(new) — contribution weight silent rounding (closed)

**Root cause:** `ContributionEditor.tsx` lost its native `step="0.05"` guard
when it moved to `type="text"` in the prior remediation; `ExerciseForm
.buildContributionsPayload` checked parseability but not decimal precision;
`contributionInputSchema.weight` had no `.multipleOf(...)`. A 3-decimal
weight (e.g. `0,555`) passed every layer and `exercise_muscle_contributions
.weight` (`numeric(3,2)`) silently rounded it to `0.56`.

**Fix:**
- `src/ui/exercises/ExerciseForm.tsx` — `buildContributionsPayload` now
  rejects `decimalPlaceCount(row.weight) > 2` alongside the existing
  parse-failure check, both surfacing the same existing message ("Enter
  valid muscle contribution weights, or leave them blank."). Reuses the
  `decimalPlaceCount` helper already added for `loadStepKg` — no new helper.
- `src/domain/exercises/schema.ts` — `contributionInputSchema.weight` gained
  `.multipleOf(0.01)`, independently enforcing the same precision at the
  domain/API boundary (mirrors `loadStepKg`'s existing `.multipleOf(0.01)`).
- Comma/dot parsing, blank → role-default, and valid values in `(0, 1]` are
  all unchanged — only precision is newly rejected.

**Proof, not inference — a real browser against real Postgres:**

| Step | Result |
|---|---|
| Typed `0,555` into the first contribution row, clicked Create | Blocked: inline error shown, page stays on `/exercises/new`, **no request sent** |
| Typed `0,55`, clicked Create | Exercise created; reopened for edit | field reads back exactly `0.55` |

**Discrimination check (temporarily reverted both guards, then restored):**
with the pre-fix code, the same steps let `0,555` through — the exercise was
created and a direct SQL check showed `exercise_muscle_contributions.weight
= 0.56`, exactly the rounding the verification report predicted. The new
e2e test fails against that code (`element(s) not found` waiting for the
error) and passes against the fix. Leftover row deleted; both guards
restored (`git diff` confirms only the intended two hunks).

## 2. LOW-2 — `baselineLoadKg`'s float-band grid hole (closed)

**Root cause:** `baselineLoadKgSchema`'s `.refine((v) => Math.round(v * 100)
% 25 === 0, ...)` did the modulo check on raw floating-point arithmetic. `v *
100` for `v = 1.005` is itself already imprecise (IEEE 754), so `1.005`,
`82.501`, `0.249`, and `1.001` all passed the refine and were then rounded
by the `numeric(6,2)` column (`1.005` → `1.01`, confirmed below). The
`step="0.25"` native guard that used to catch this in the browser was
removed when the field moved to `type="text"` in the prior remediation.

**Fix:**
- `src/domain/prescriptions/schema.ts` — replaced the custom refine with
  `.multipleOf(0.25)`. Zod's `multipleOf` compares on the values' decimal
  *string* representation rather than raw float arithmetic — the same
  mechanism already proven float-safe for `loadStepKg`'s
  `.multipleOf(0.01)` — so it correctly rejects all four float-noise values
  while still accepting every exact grid point.
- `src/ui/prescriptions/PrescriptionForm.tsx` — added the same raw
  `decimalPlaceCount(baselineLoadKg) > 2` guard used for `loadStepKg` and
  the contribution weight, rejecting the common float-noise case (3+
  decimals) before any round trip. Blank-means-no-baseline (create:
  `undefined`, edit: `null`) and comma/dot parsing are unchanged.

**Values checked directly against the real schema:**

| Value | Result |
|---|---|
| `0`, `0.25`, `1.25`, `82.5`, `100.25`, `1000` | accepted ✅ |
| `1.005`, `82.501`, `0.249`, `1.001` (float noise near the grid) | **rejected** ✅ |
| `82.3`, `0.1`, `100.234` (realistic wrong input) | rejected ✅ (unchanged) |

**Proof in a real browser against real Postgres:** typed `1,005` into
`PrescriptionForm`'s baseline field on the seeded e2e template — blocked
with a visible "…with at most 2 decimal places" error, no navigation, no
request. Typed `82,5` — created; fetched the prescription back via the API
in the same authenticated session and it read exactly `82.5`.

**Discrimination check (temporarily reverted both guards, then restored):**
with the pre-fix code, `1,005` was silently accepted and a direct SQL check
showed the prescription's `baseline_load_kg = 1.01` — exactly LOW-2's
predicted rounding. The new e2e test fails against that code and passes
against the fix. Leftover row deleted; both guards restored (`git diff`
confirms only the intended two hunks in each file).

## 3. Test coverage added

- `tests/unit/exerciseSchema.test.ts` — `contributionInputSchema` (via
  `createExerciseSchema`/`updateExerciseSchema`): rejects `weight: 0.555`,
  accepts `weight: 0.55` and confirms it round-trips unrounded through
  `.parse()`.
- `tests/unit/prescriptionSchema.test.ts` — `createPrescriptionSchema`:
  `it.each` over the four float-noise rejections (`1.005`, `82.501`,
  `0.249`, `1.001`) and the six accepted grid values (`0`, `0.25`, `1.25`,
  `82.5`, `100.25`, `1000`).
- `tests/e2e/exerciseDecimalInput.spec.ts` — two new tests (real browser,
  phone viewport, real Postgres): the contribution-weight round trip and
  the `baselineLoadKg` round trip described above, each proving both the
  visible-rejection half and the exact-persistence half. A small
  `findE2eTemplateId` helper resolves the seeded template id via the API
  (same session as `page`) rather than clicking through Programs →
  Templates, since that navigation chain isn't what these tests are about.
  Both new tests clean up what they create (delete the exercise /
  prescription) so reruns don't accumulate rows.

Not added: component-level (RTL) tests — this repo has no such test
infrastructure (confirmed in the prior remediation pass), so UI-layer proof
comes from the e2e specs above, consistent with how M-1 and L-7 were proven
in the prior two passes.

## 4. Checks run

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean (run as a quick supplementary check; not requested) |
| `pnpm test:unit` (full suite, ripple-effect check) | **349 passed, 0 failed** (27 files — 336 baseline + 13 new: 3 in `exerciseSchema.test.ts`, 10 in `prescriptionSchema.test.ts`) |
| Targeted unit files alone | `exerciseSchema.test.ts` 35, `prescriptionSchema.test.ts` 29, `decimalInput.test.ts` 12 — **76 passed** |
| `tests/integration/exercises.integration.test.ts` | **18 passed** |
| `tests/integration/prescriptions.integration.test.ts` | **16 passed** |
| `pnpm test:e2e tests/e2e/exerciseDecimalInput.spec.ts` (targeted decimal-input spec) | **4 passed** (2 pre-existing + 2 new) |
| `pnpm build` | clean, 25 routes, SW bundled — run because real `src/` application code (not just tests) was touched |

**Database state:** verified `0` `in_progress` workout_sessions and no
stray created rows before and after every e2e run and every discrimination
experiment; any residue from the discrimination reverts (the intentionally
rounded `0.56` exercise, the intentionally rounded `1.01` prescription) was
deleted by direct SQL immediately after confirming it, before restoring the
fix.

**One unrelated, pre-existing observation, not investigated or fixed (out
of scope):** `exerciseDecimalInput.spec.ts`'s original "a comma-typed set
weight during a workout" test discards its workout without calling
`waitForOutboxDrained` first; on at least one run this session it left a
stray `in_progress` session (cleaned up via SQL). This test predates this
pass and this task's scope is limited to M-1(new)/LOW-2 — noted here rather
than silently worked around, not fixed.

## 5. Verdict

Both items from the closeout verification are closed and proven end to end,
not just by reading the diff:

- **M-1(new)** — `0,555` is rejected before any network request (client
  guard) and independently by the domain schema if bypassed; `0,55` persists
  exactly as `0.55`. Verified the pre-fix code actually produces the
  predicted `0.56` rounding, then confirmed the fix prevents it.
- **LOW-2** — `1,005`/`82.501`/`0.249`/`1.001` are all rejected at both the
  raw-draft UI guard and the domain schema; the valid grid (`0`…`1000` in
  0.25 steps) still passes. Verified the pre-fix code actually produces the
  predicted `1.01` rounding, then confirmed the fix prevents it.

All requested checks are green: lint, format, typecheck, the affected unit
and integration suites, and the targeted e2e spec. `pnpm build` also passed.
No schema/migration change was needed or made (both fixes are validation-only:
a zod `.multipleOf`/`.refine` swap and two UI-side digit checks — no
`src/db/schema/` file touched). No commit, push, deploy, or production
access.

**READY FOR FINAL CLOSEOUT CHECK**
