# Phase 5.5 Light — Remediation Closeout Verification

Date: 2026-08-23
Verifier: targeted independent pass over
`docs/reviews/phase-5.5-light-remediation.md`
Scope: only the remediation claims requested in
`docs/reviews/phase-5.5-light-review.md`. Not another full Phase 5.5 review —
no broad catalog re-audit, no Phase 5 architecture re-examination.

No implementation file was modified. Two **test** files (`tests/e2e/helpers.ts`,
`tests/e2e/offline-cold-launch.spec.ts`) were temporarily mutated to run the
two discrimination experiments the brief explicitly requires, then restored
from pre-mutation copies and confirmed byte-identical by SHA-256:

| File | Hash before | Hash after restore |
|---|---|---|
| `tests/e2e/helpers.ts` | `A78BF0C5…AEC92` | `A78BF0C5…AEC92` ✅ |
| `tests/e2e/offline-cold-launch.spec.ts` | `32B519B2…05B3` | `32B519B2…05B3` ✅ |

All disposable probes (2 unit, 2 e2e) were deleted after use. Disposable
database `gymapp_rv55` created and dropped. The shared local dev Postgres
ends this session as it began: **92 exercises, 0 `in_progress` sessions**, no
probe rows left behind. No commit, push, deploy, or production access.

**Concurrent work preserved and ignored:** a Fable session modified
`docs/architecture/{data-model,domain-model,implementation-plan,volume-model}.md`
and added `docs/reviews/pre-phase-6-muscle-taxonomy-rescope-plan.md` during
this verification. Those files were neither read for verification purposes
nor written, staged, reset, or formatted.

---

## 1. History correction (M-1) — VERIFIED

Structural: `HistorySetRow`'s Save handler now parses before acting, and the
`weightKg === null` branch `return`s **above** `onSave(...)`. `onSave` is the
only caller of both `updateLocalSet` (local React state) and
`correctHistorySet` (outbox → PostgreSQL), so a blocked save touches neither.

Behavioral — driven in a real browser end to end (disposable spec: log a set,
complete the workout, open History, edit through five cases, reloading and
draining the outbox between each):

| Case | Result |
|---|---|
| `82,5` (comma) | renders `82.5 kg × 5`; **survives reload** — persisted exactly ✅ |
| `77.25` (dot) | renders `77.25 kg × 5`; survives reload ✅ |
| `abc` (unparseable) | `"Weight is required."` shown, save blocked ✅ |
| `""` (empty) | `"Weight is required."` shown, save blocked ✅ |
| after both invalid cases + reload | PostgreSQL still holds `82.5`; **zero** `0 kg × 5` rows ✅ |
| `0` (explicit) | saves, renders `0 kg × 5`, survives reload, no server rejection ✅ |

The decisive assertion is the post-reload one: History is served straight from
PostgreSQL, so "still 82.5 after an invalid save attempt" is proof that
neither the local optimistic path nor the outbox fired. The pre-remediation
`Number(weight)` would have written `0` on both invalid cases.

## 2. Remaining decimal fields — VERIFIED, with one gap

### `baselineLoadKg` (`PrescriptionForm`) — verified, one narrow float edge

Comma and dot both parse; empty still means "no baseline" (`undefined` on
create, `null` on edit) — the silent-clear-on-edit bug (L-4) is closed by the
explicit parse-then-validate block. Realistic invalid values are rejected by
`baselineLoadKgSchema` and surface visibly (the form's fetch-error branch
renders "Something went wrong. Please try again."). Verified against the real
schema:

| Value | Domain schema |
|---|---|
| 0, 0.25, 82.5, 100.25, 1000 | accepted ✅ |
| 82.3, 0.1, 100.234 | rejected ✅ (visible error) |
| **1.005, 82.501, 0.249, 1.001** | **accepted** — see LOW-2 |

### Block / week-override `setMultiplier`, `loadMultiplier` — verified

Both files switched to `type="text" inputMode="decimal"` with an identical
`parseOptionalMultiplier` (blank → no override; unparseable or outside
`(0, 2]` → visible inline error before any round trip), mirroring
`weekModifiersSchema`'s `z.number().positive().max(2)`. Verified: 0.5/0.9/1/2
accepted, 0/−0.5/2.01 rejected. These land in **jsonb**, not a `numeric`
column, so there is no silent-rounding surface here at all.

### Contribution weights (`ContributionEditor` + `ExerciseForm`) — **GAP, see M-1(new)**

Comma and dot parse correctly, and a non-empty-but-unparseable weight now
blocks submit with a visible message — both L-6 claims hold. But a
**3-decimal weight passes every boundary and is silently rounded by
PostgreSQL**. See §5.

### Signed `targetRirShift` — VERIFIED UNCHANGED

Both occurrences (`BlockForm.tsx:651-652`, `WeekOverrides.tsx:84`) remain
`type="number"` with a bare `Number(...)`, untouched by the diff and
deliberately not routed through `sanitizeDecimalDraft` — correct, since that
helper strips the sign (`sanitizeDecimalDraft("-2") === "2"`, verified). The
schema still accepts −10…10 integers and rejects −11 and 1.5. Leaving this
field alone was the right call and it was left alone.

## 3. `loadStepKg` (L-7) — VERIFIED at both boundaries

Verified directly against the real UI guard expression
(`parseDecimalInput` + `decimalPlaceCount(raw) > 2` + bounds) and the real
`createExerciseSchema` / `updateExerciseSchema`:

| Input | UI guard | Domain schema |
|---|---|---|
| `0.25`, `0.5`, `1.25`, `2.5`, `99.99` | accepts ✅ | accepts ✅ |
| same five typed with a comma (`0,25` … `99,99`) | accepts ✅ | accepts ✅ |
| **`1.234`**, `1,234` | **rejects** ✅ | **rejects** ✅ |
| `1.005`, `0.005`, `99.995`, `2.501` | rejects ✅ | rejects ✅ |
| `100` (over ceiling), `0`, `-1.25` | — | rejects ✅ |

`1.005` matters: `decimalPlaceCount` counts on the raw string, so it is not
fooled by `1.005 * 100 !== 100.5` in IEEE 754. Zod's `multipleOf(0.01)` also
rejects it. Both guards are float-safe.

**"PostgreSQL never silently rounds a rejected value" — confirmed.** A
disposable-database probe establishes what the column would do if reached:
`numeric(4,2)` stores `1.234` as `1.23` and `2.501` as `2.50` (and errors on
`99.995`, which would round to 100.00 and overflow precision 4). None of these
can reach it: the UI blocks first, and the API/domain blocks independently if
the UI is bypassed.

## 4. Catalog (L-9) — VERIFIED

`git diff` on `src/db/seed/exerciseCatalog.ts` against the pre-Phase-5.5
baseline shows, beyond the append and the doc comment, exactly **four**
`laterality: "unilateral"` additions and **zero** deletions or modifications
anywhere in the original 40 entries.

Re-dumped all 92 entries and compared field-by-field against the dump taken
during the prior review. The **only** differences in the entire catalog:

- `barbell-walking-lunge`: `-` → `unilateral`
- `bodyweight-walking-lunge`: `-` → `unilateral`

Unilateral count went 4 → 6; every slug, name, equipment, mechanics, and
primary/secondary contribution list is otherwise byte-for-byte what it was.
No other accepted catalog entry changed.

## 5. Finding — one new gap, introduced by this pass

### M-1(new) — a 3-decimal muscle contribution weight is silently rounded by PostgreSQL

`ContributionEditor.tsx` lost `min="0" max="1" step="0.05"` when it moved to
`type="text"`. `ExerciseForm.buildContributionsPayload` added a
*parseability* check but **not** the `decimalPlaceCount` check it added for
`loadStepKg` twenty lines away, and `contributionInputSchema.weight`
(`src/domain/exercises/schema.ts:55`) is still `z.number().gt(0).lte(1)` with
no `.multipleOf(0.01)`. The column is `numeric(3,2)`.

**Proven end to end in a real browser**, not inferred: typing `0,555` into the
first contribution row's weight on `/exercises/new` is blocked by nothing —
the form submits, the exercise is created, and reopening it for edit shows the
weight as **`0.56`**. Disposable-database probe confirms the mechanism:
`numeric(3,2)` stores `0.555` → `0.56`, `0.005` → `0.01`, `0.9999` → `1.00`.
The `ck_emc_weight_range` check constraint does not help — the rounded values
all remain in `(0, 1]`.

This is a **regression introduced by this remediation**, not a pre-existing
hole. `ExerciseForm` is a real `<form onSubmit>` with a `type="submit"` button
and no `noValidate`, so the removed `step="0.05"` genuinely ran: the browser
previously blocked `0.555` with a native `stepMismatch` message. Nothing
blocks it now.

It is also the exact defect class L-7 named — the one this pass was closing —
reopened in a field the same pass touched, and it misses the brief's own
acceptance criterion for this field ("invalid values surface visibly").

**Impact is genuinely small**, and should be read that way: contribution
weights are optional (blank → the role default), have no consumer today
beyond storage and redisplay, are bounded to `(0, 1]` by a DB constraint, and
the error introduced is ≤0.005. Nothing about the training log, set weights,
`loadStepKg`, progression, or deload math is affected. **The fix is two lines
that already exist elsewhere in the same files**: add
`decimalPlaceCount(row.weight) > 2` to the guard in
`buildContributionsPayload`, and `.multipleOf(0.01)` to
`contributionInputSchema.weight`.

### LOW-2 — `baselineLoadKg`'s 0.25-grid refine has a ±0.005 float band

`baselineLoadKgSchema`'s `Math.round(v * 100) % 25 === 0` accepts any value
within ±0.005 of the 0.25 grid: `1.005`, `82.501`, `0.249`, and `1.001` all
pass, then `numeric(6,2)` rounds them (`1.005` → `1.01`, `82.501` → `82.50`,
`0.249` → `0.25`). This is a **pre-existing** domain-schema bug, not
introduced here — but the removed `step="0.25"` used to block it in the
browser, so this pass made it reachable. Practical consequence is negligible:
the band is narrower than the column's own precision and the stored value is
the grid point the user was aiming at. Realistic wrong input (`82.3`, `0.1`,
`100.234`) is still rejected with a visible error. Worth a `decimalPlaceCount`
guard alongside the M-1(new) fix; not worth a pass of its own.

### LOW-3 — the new regression spec has no failure cleanup of its own

`ensureNoActiveSession.spec.ts` starts a workout on "device A" and relies on
device B's takeover to discard it. On a **passing** run that happens and zero
`in_progress` rows remain (verified). On a **failing** run it leaves one
behind (observed directly during the §6 discrimination experiment) — the same
residue pattern `offline-cold-launch.spec.ts` just gained an `afterEach` to
prevent. This is now **harmless**, and I verified that rather than assuming
it: with a real leftover `in_progress` row present, `offline-cold-launch.spec.ts`
passed in 8.7s (§6). Noted only as an asymmetry, not a defect.

### Informational

A 400 from the prescriptions API renders the generic "Something went wrong.
Please try again." The requirement (invalid values surface visibly) is met;
the message just isn't specific. The client check mirrors the `[0, 1000]`
bound but not the 0.25-grid rule.

## 6. E2E harness — VERIFIED, all four experiments

**(a) The delayed active-session race, against the fixed helper.**
`ensureNoActiveSession.spec.ts` passes in 5.6 s, exercising its own 2 s
`/api/active-session` route delay, and leaves 0 `in_progress` rows.

**(b) The regression test discriminates the old behavior — proven, not
assumed.** I reverted `ensureNoActiveSession` in `tests/e2e/helpers.ts` to the
pre-fix one-shot `await takeover.isVisible().catch(() => false)` and re-ran:

```
Error: expect(locator).toBeVisible() failed
  - waiting for getByRole('button', { name: 'Start workout' })
  Error: element(s) not found
1 failed
```

Exactly the predicted symptom — the helper returns having done nothing and the
foreign-session banner renders where "Start workout" should be. Restored the
fix (hash-verified) and it passes again. The test genuinely fails against the
old implementation and passes against the new one.

**(c) The real-world failure mode is gone.** The precise scenario that
produced the original 30 s timeout in the prior review —
`offline-cold-launch.spec.ts` run in isolation with a leftover `in_progress`
session in the shared dev Postgres — now **passes in 8.7 s** and leaves 0
`in_progress` rows. (The leftover row was real, left by experiment (b)'s
failing run, not injected.)

**(d) Forced early failure → cleanup leaves zero `in_progress` sessions.** I
injected `throw new Error("RV-FORCED-FAILURE…")` into
`offline-cold-launch.spec.ts` immediately after launch 1 logs its set and
drains the outbox — i.e. with a genuine `in_progress` session on the server
and every later launch skipped:

```
BEFORE: 0 in_progress
Error: RV-FORCED-FAILURE: verifying afterEach cleanup leaves no in_progress row
1 failed
AFTER:  0 in_progress
```

Confirmed the hook did real work rather than the throw preceding session
creation: the newest `workout_sessions` row is timestamped at that run and its
status is `discarded`. Spec restored (hash-verified).

**(e) Reruns.**

| Run | Result |
|---|---|
| `exerciseDecimalInput` + `ensureNoActiveSession` + `offline-cold-launch` | **4 passed** (46.1 s) |
| **Full suite** (`npx playwright test`) | **16 passed, 0 failed** (1.1 m) |
| `in_progress` rows after the full suite | **0** |

## 7. Implementation-report corrections — VERIFIED ACCURATE

All three corrections in `docs/reviews/phase-5.5-light-implementation.md` are
present, correctly placed as inline notes rather than rewritten history, and
factually right:

1. **§3 deferred list** — the note accurately states that the review escalated
   `HistoryDetail.tsx` because it was the only one of the five with zero
   validation, and that all five were subsequently closed. Matches the review.
2. **§5 E2E** — "14 of 15, one pre-existing failure" is corrected to 15/15
   green with an accurate account of the state-latched
   `ensureNoActiveSession` race, including why the `git stash` check looked
   like proof of a codebase-independent gap. Matches my findings exactly, and
   the word "pre-existing" was correctly struck from the original sentence
   rather than left standing beside the correction.
3. **§7 limitations** — "Four" → "Five" (with the original struck), and the
   `offline-cold-launch.spec.ts` bullet struck through with an accurate
   replacement.

## 8. Checks rerun independently

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm format:check` | clean |
| `pnpm test:unit` | **336 passed, 0 failed** (27 files) — matches the report |
| `pnpm test:integration` | **155 passed, 0 failed** (12 files) — matches |
| `pnpm build` | clean, all routes compiled |
| `npx playwright test` (full) | **16 passed, 0 failed** — matches |
| Disposable unit probes (boundary acceptance, 48 assertions) | as reported in §2–§3 |
| Disposable e2e probes (history correction, contribution precision) | as reported in §1, §5 |

**Schema/migrations:** `git status src/db/schema/` is empty — this pass
touches no schema file, so drift is impossible. `pnpm db:generate` was
deliberately **not** run, since it can write a migration file; the stronger
non-mutating evidence is used instead.

---

## 9. Verdict

Every item the remediation set out to close is genuinely closed, and each was
verified behaviorally rather than by reading the diff:

- **M-1 (history correction)** — comma and dot persist exactly through
  PostgreSQL; empty and unparseable input block the save and mutate neither
  local state nor the database; explicit `0` stays valid. Closed.
- **`baselineLoadKg`, deload/override multipliers, contribution parsing** —
  comma/dot work, invalid input surfaces visibly, the silent-clear and
  silent-drop bugs are gone. `targetRirShift` correctly untouched.
- **L-7 (`loadStepKg`)** — 0.25/0.5/1.25/2.5/99.99 pass both boundaries;
  1.234 is rejected at the UI *and* independently at the API/domain boundary;
  the value never reaches PostgreSQL, so nothing is silently rounded. Both
  guards are float-safe. Closed.
- **L-9 (walking lunges)** — exactly two entries changed, both to
  `unilateral`, nothing else in the 92-entry catalog touched. Closed.
- **E2E harness** — the race fix works, the regression test provably
  discriminates the old behavior, the failure-cleanup hook provably fires, and
  the original real-world failure no longer reproduces. Full suite 16/16.
- **Report corrections** — accurate.

One item stands in the way, and it is small and well-defined: **M-1(new)**.
In removing `step="0.05"` from the contribution-weight input, this pass
reopened, at that field, the exact silent-PostgreSQL-rounding defect it was
closing at `loadStepKg` — `0,555` is accepted by the UI, accepted by the
domain schema, and stored as `0.56`, verified end to end in a browser. The
brief's acceptance criterion for this field is that invalid values surface
visibly; here nothing surfaces at all.

The impact is minor — an optional field, no consumer today, ≤0.005 of error,
nothing touching weights or progression — and the fix is two lines that
already exist in the same two files for `loadStepKg`. But it is a regression
of the pass's own defect class, in the pass's own scope, and closing it (with
LOW-2's guard alongside, if cheap) is the last thing between this work and
deployment. Nothing else needs to change.

**REMEDIATION REQUIRED**

---

# Final Closeout — Micro-Remediation 2

Date: 2026-08-23
Verifies: `docs/reviews/phase-5.5-light-remediation-2.md` only (M-1(new) and
LOW-2). No previous Phase 5.5 or taxonomy finding was reopened. The full
suite was deliberately not rerun, per instruction.

No implementation file was modified. The four guards were temporarily
reverted to run the discrimination experiment, then restored from
pre-mutation copies and confirmed byte-identical by SHA-256:

| File | Hash before | Hash after restore |
|---|---|---|
| `src/domain/exercises/schema.ts` | `AE5AF9E4…ABB2` | `AE5AF9E4…ABB2` ✅ |
| `src/domain/prescriptions/schema.ts` | `B5E0EAC1…47FD` | `B5E0EAC1…47FD` ✅ |
| `src/ui/exercises/ExerciseForm.tsx` | `88F1F46C…5647` | `88F1F46C…5647` ✅ |
| `src/ui/prescriptions/PrescriptionForm.tsx` | `91C37642…24A3` | `91C37642…24A3` ✅ |

Disposable probes (1 unit, 1 e2e) deleted after use. The shared local dev
Postgres begins and ends this pass at an identical baseline —
**92 exercises / 45 prescriptions / 220 contributions / 0 `in_progress`
sessions** — with contribution weights still only `0.50` and `1.00` and zero
non-null `baseline_load_kg`. All concurrent taxonomy documents
(`docs/architecture/{architecture-plan,data-model,domain-model,evidence-to-design,implementation-plan,volume-model}.md`,
`docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md`, and the four
`docs/reviews/pre-phase-6-muscle-taxonomy-*.md` files) and all user-owned
files are untouched. No commit, push, deploy, or production access.

## FC1 — Contribution weight: VERIFIED

**Domain boundary** (41-assertion disposable probe against the real
`createExerciseSchema` / `updateExerciseSchema`):

| Case | Result |
|---|---|
| `0,55` and `0.55` | parse to `0.55`; accepted by create **and** update; `.parse()` returns exactly `0.55`, unrounded ✅ |
| `0,555` and `0.555` | rejected by the UI guard **and**, independently, by both schemas ✅ |
| `0.005`, `0.9999`, `0.101`, `0.125` | rejected at the domain boundary ✅ |
| `0.01, 0.05, 0.1, 0.5, 0.55, 0.75, 0.99, 1` | all accepted, values preserved exactly ✅ |
| blank | role default applied — `1` primary, `0.5` secondary ✅ |
| `0`, `1.01`, `-0.5` | still rejected (bounds unchanged) ✅ |

**Real UI + real PostgreSQL** (disposable spec that records every mutating
`/api/*` request, so "rejected before submit" is proven by request count, not
merely by the absence of navigation):

- `0,555` → visible inline error, still on `/exercises/new`, **0 mutating
  requests**. Identical for `0.555`. No request, no optimistic mutation, no
  database write.
- `0,55` → created, reopened for edit, field reads back exactly **`0.55`**
  (not `0.56`). Identical for `0.55`.
- Blank weight → the created exercise's contribution comes back with
  `weight: 1`, the primary role default.
- Row counts and the set of distinct stored weights are unchanged afterwards.

## FC2 — `baselineLoadKg`: VERIFIED

**Domain boundary** — all six valid values accepted by the create **and**
update schema; all six invalid values rejected by both:

| Verdict | Values |
|---|---|
| Accepted | `0`, `0.25`, `1.25`, `82.5`, `100.25`, `1000` ✅ |
| Rejected | `1.005`, `82.501`, `0.249`, `1.001`, `82.3`, `100.234` ✅ |

Ceiling (`1000.25`) and floor (`-0.25`) unchanged. Blank semantics unchanged:
create omits the field entirely, edit sends explicit `null`.

**Real UI + real PostgreSQL:**

- All eight float-noise drafts — `1,005`/`1.005`, `82,501`/`82.501`,
  `0,249`/`0.249`, `1,001`/`1.001` — produced a visible "at most 2 decimal
  places" error with **0 mutating requests** each. Same for `100,234`.
- `82,3` has only one decimal, so it correctly passes the client digit guard,
  POSTs once, and is rejected by the domain schema with a visible error and
  **no row created** — the value never reaches PostgreSQL, which is the
  requirement.
- All six valid values persisted and read back exactly, across both
  separators: `0` → `0`, `0,25` → `0.25`, `1.25` → `1.25`, `82,5` → `82.5`,
  `100.25` → `100.25`, `1000` → `1000`.
- Blank on **create** → `baselineLoadKg: null`. Blank on **edit** of an
  existing `82.5` baseline → cleared to `null`. Both unchanged.
- After cleanup, zero non-null `baseline_load_kg` rows remain.

## Discrimination — the new tests genuinely catch the pre-fix behavior

Both guard layers were reverted (schema `.multipleOf` removed / the old
float refine restored, and both `decimalPlaceCount` UI checks removed), then
the shipped tests were run unchanged:

**Unit — exactly the six new precision tests fail, and only those:**

```
× createExerciseSchema > rejects a contribution weight with more than 2 decimal places
× updateExerciseSchema > rejects a replacement contribution weight ... (M-1(new))
× createPrescriptionSchema > rejects a baselineLoadKg of 1.005  (float-noise near the 0.25 grid)
× createPrescriptionSchema > rejects a baselineLoadKg of 82.501 (float-noise near the 0.25 grid)
× createPrescriptionSchema > rejects a baselineLoadKg of 0.249  (float-noise near the 0.25 grid)
× createPrescriptionSchema > rejects a baselineLoadKg of 1.001  (float-noise near the 0.25 grid)
Tests  6 failed | 58 passed (64)
```

The 58 passing tests include every accept-case, so the new assertions are
targeted rather than blanket.

**E2E — both new tests fail with the predicted symptom** (`element(s) not
found — waiting for locator('p[role="alert"]')`): no error renders because
the value is accepted and the form navigates away.

**And the corruption is real, not just a missing message.** The failing runs
left behind exactly what the closeout report predicted, confirmed by direct
SQL:

```
exercise_muscle_contributions.weight  = 0.56   (typed 0,555)
exercise_prescriptions.baseline_load_kg = 1.01 (typed 1,005)
```

Both stray rows were deleted immediately, the guards restored (hash-verified
above), and the same shipped tests re-run green.

## Checks rerun (targeted only, per instruction)

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm format:check` | clean |
| `exerciseSchema` + `prescriptionSchema` + `decimalInput` unit tests | **76 passed, 0 failed** — matches the report |
| `exercises` + `prescriptions` integration tests | **34 passed, 0 failed** (18 + 16) — matches |
| `tests/e2e/exerciseDecimalInput.spec.ts` | **4 passed, 0 failed** — matches |
| Disposable domain probe (41 assertions) | all as expected |
| Disposable UI/Postgres probe (request-counting) | all as expected |

Full unit, integration, and e2e suites were **not** rerun, as instructed.

## Data-compatibility note (no action needed)

Swapping the refine for `.multipleOf(0.25)` also tightens the **update**
path, so a stored off-grid baseline would now be rejected on a later edit.
Checked: the local dev database holds **zero** non-null `baseline_load_kg`
values and only `0.50` / `1.00` contribution weights, so nothing existing is
invalidated. No deployed build could have created an off-grid baseline
either — before the prior remediation the field's native `step="0.25"`
blocked it in the browser, and the float-noise path only became reachable in
that (never-deployed) pass. No migration or data fix is required.

## Verdict

Both items are closed and independently proven end to end — through the real
form, the real domain boundary, and real PostgreSQL — not by reading the
diff:

- **M-1(new)** — `0,555` and `0.555` are rejected before a single byte leaves
  the browser and, independently, by the domain schema if the client is
  bypassed; `0,55` and `0.55` persist as exactly `0.55`; blank still selects
  the role default. The pre-fix code was shown to actually write `0.56`, and
  the fix prevents it.
- **LOW-2** — all six invalid baselines are rejected and never reach
  PostgreSQL; all six valid grid values persist exactly, with either
  separator; blank create/edit semantics are unchanged. The pre-fix code was
  shown to actually write `1.01`, and the fix prevents it.

The new tests were confirmed to fail against the pre-fix implementation and
pass against the fix, at both the unit and e2e layers. Every targeted check
is green. No new findings, and no previously accepted finding is affected.

Manual iPhone acceptance of the full Phase 5.5 Light pass remains pending and
is not substituted by anything in this document — including the
already-recorded L-3 item (an empty weight field no longer logs 0 kg; a
bodyweight set now needs an explicit `0`), which belongs in that script.

**READY FOR DEPLOYMENT AND MANUAL IPHONE ACCEPTANCE**
