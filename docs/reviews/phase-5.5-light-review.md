# Phase 5.5 Light — Independent Review

Date: 2026-08-23
Reviewer: independent pass over `docs/reviews/phase-5.5-light-implementation.md`
Scope: Phase 5.5 changes only. Phase 5 not reopened. Future taxonomy
architecture considered only for compatibility.

Method: everything below was re-derived from the diff and re-executed
locally. No shipped test count was accepted as behavioral proof. All DB
verification ran against a **disposable** database (`gymapp_review55`,
created and dropped during this review) on the local Docker Postgres 16, plus
read-only inspection of the shared local dev DB. No production access, no
commit, no push, no deploy. No implementation, schema, migration, or data
file was modified. User-owned and concurrent files (`CLAUDE.md`, `HANDOFF*`,
`gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`,
`docs/reviews/pre-phase-6-muscle-taxonomy-evaluation.md`) were read at most,
never written; the working tree is byte-identical to how it was found apart
from this file.

---

## 1. Catalog — verified

**Append-only.** Full-file diff against `HEAD:src/db/seed/exerciseCatalog.ts`
shows exactly two hunks: the 5-line doc comment (lines 21–25) and a pure
insertion after line 444 (`444a445,962`). Zero deletions or modifications
inside the original 40 entries — the first 40 objects are byte-identical.
The interface, imports, and closing of the array are unchanged.

**Structure.** A script over the compiled catalog (`tsx`, importing the real
module and the real Zod enums) returned:

| Check | Result |
|---|---|
| Total entries | 92 (40 + 52) |
| Duplicate slugs | none |
| Duplicate names (exact and case-insensitive) | none |
| Slug format `^[a-z0-9]+(-[a-z0-9]+)*$` | all pass |
| Invalid equipment / mechanics / laterality | none |
| Muscle-group slugs outside the canonical 15 | none |
| Entries without ≥1 primary | none |
| Duplicate muscle group within an entry | none |
| Empty contribution lists | none |
| Object keys present | only `slug, name, equipment, mechanics, laterality, contributions` |

The last row matters: no `loadStepKg` field was smuggled into any entry, so
the declared "override path left unused" is true in the data, not just in
prose.

**Equipment distribution** — all: barbell 19, dumbbell 20, cable 18, machine
22, bodyweight 11, other 2. New 52: barbell 9, dumbbell 8, cable 10, machine
16, bodyweight 7, other 2. Matches the report's table.

**Gap claims independently confirmed** against the original 40: `traps` had
zero primary contributions (only secondary on deadlift, rear-delt fly, face
pull); `calves` appeared in exactly one entry (`dumbbell-calf-raise`). Both
are now covered (traps 2 primary, calves 4 primary).

**Missing muscle groups.** No new entry requires a group outside the 15.
Specifically on Hip Adduction: `grep -i "adduct|abduct|thigh"` over the
catalog returns nothing, and no adductor/abductor machine, sumo-squat, or
Copenhagen-style entry was added. `barbell-sumo-deadlift` — the one addition
with a genuine adductor component — is mapped to
glutes/hamstrings primary + quads/lower_back/forearms secondary, which is a
defensible mapping inside the existing vocabulary and does not *require* a
group that does not exist. Nothing in the additions creates pressure to add
a muscle group before Phase 6.

**Pull/row variants all map to `back`.** Verified per entry:
`barbell-pendlay-row`, `cable-straight-arm-pulldown`, `machine-t-bar-row`,
`machine-assisted-pull-up`, `bodyweight-inverted-row` → `back` primary;
`bodyweight-chin-up` → `back` + `biceps` primary. No lats/rhomboid/lower-trap
invention. `cable-upright-row` is correctly *not* a back row (side_delts
primary, traps secondary).

**Anatomy spot-check.** Read all 52 primary/secondary assignments. All are
defensible; classifications are consistent with the pre-existing 40 (e.g.
`cable-reverse-curl` → forearms primary / biceps secondary mirrors the
existing `dumbbell-hammer-curl`; `barbell-close-grip-bench-press` → triceps
primary mirrors the existing `bodyweight-dip`).

**Padding.** No meaningless variants. Cross-equipment repeats (barbell vs
bodyweight walking lunge, barbell vs dumbbell shrug, three lateral raises)
follow the convention already established by the original 40 and are
genuinely different loading. See LOW-1 for the one real redundancy.

**No taxonomy work.** `src/domain/exercises/muscleGroups.ts` is unmodified;
`MUSCLE_GROUP_SLUGS` is still the same 15 with no hierarchy, aliases, or
rollups. No new domain file. Confirmed clean.

**Verdict: §1 requirements met.**

---

## 2. Seed safety — verified against real Postgres

The seeding code (`src/db/seed/exercises.ts`) is unmodified by this pass —
only the data array it reads changed. Rather than trust that, I built an
end-to-end probe on a **fresh disposable database** (`gymapp_review55`,
migrated with `pnpm db:migrate`, dropped afterwards), reconstructed a user in
the *pre-5.5 state* (the original 40 entries from `git show HEAD:` with real
ids, contributions, and ledger rows), applied five user mutations, then ran
the real `runSeed` twice through the real `pg` driver.

Mutations applied before reseeding:
1. renamed `barbell-back-squat` → "MY RENAMED SQUAT";
2. edited `barbell-bench-press.loadStepKg` 2.5 → 1.25;
3. deleted the `traps` contribution from `barbell-deadlift`;
4. edited the `back` contribution weight on `barbell-deadlift` 0.5 → 0.75;
5. hard-deleted `bodyweight-plank`;
6. created a *custom* exercise named "Hack Squat", colliding with the
   incoming new slug `machine-hack-squat`.

Observed:

| | before seed | after seed 1 | after seed 2 |
|---|---|---|---|
| exercises | 40 | **91** | 91 |
| ledger rows | 40 | 92 | 92 |
| distinct ledger slugs | 40 | 92 | 92 |
| contribution rows | 103 | 215 | 215 |
| duplicate `(exercise, muscle)` rows | 0 | **0** | **0** |
| duplicate active names | 0 | **0** | **0** |

- **Additions reach an already-seeded user exactly once.** 51 of the 52 new
  slugs inserted in a single pass; the second run was a byte-identical no-op
  (`idempotent: true`). Every newly inserted exercise received its
  contributions (`newExercisesWithoutContribs: []`).
- **Rename preserved** — still "MY RENAMED SQUAT" after both reseeds.
- **Edited load step preserved** — still `1.25`, and typed `number`.
- **Edited / removed contributions preserved** — the `traps` row stayed
  deleted, the `back` weight stayed `0.75`. Nothing was re-inserted.
- **Hard delete stays deleted** — `bodyweight-plank` was not resurrected.
- **Name collision does not block unrelated additions** — the only missing
  new slug is `machine-hack-squat`; the user's custom "Hack Squat" row is
  untouched (`isSeeded: false`, `loadStepKg: 7.5`), and the other 51
  additions all landed. This is the arbiter-less `onConflictDoNothing`
  behaving as documented.
- **No duplicate ledger entries** — 92 rows, 92 distinct slugs, covering all
  92 catalog slugs.

**Numeric round-trip over the real driver** (not PGlite): setting
`loadStepKg = 0.25` and reading back gives `0.25` as a JS `number` with
`=== 0.25` true, while the raw `pg` result is the string `"0.25"`. Drizzle's
`numeric(..., { mode: "number" })` column does the lossless conversion, as
the report claims. The 92-entry catalog also seeded cleanly onto a
freshly-migrated schema, which is stronger evidence than a drift check.

**Verdict: §2 requirements met.** One pre-existing observation, not a 5.5
defect, recorded as LOW-2.

---

## 3. Decimal input — verified, with a deferred gap that matters

### The defect and the fix

The diagnosis is correct. `<input type="number">` collapses `.value` to `""`
for a comma decimal, and the two consequences the report names are real:
`ExerciseForm` silently substituted the equipment default, and `ExerciseCard`
turned `Number("") === 0` into a **silently logged 0 kg set** that
`validateSetInput` accepts (0 is legitimate for bodyweight). Confirmed by
reading `validateSetInput` (`ExerciseCard.tsx:29-38`) — it rejects
`weightKg < 0` but not `0`.

`src/ui/decimalInput.ts` is a correct minimal fix. I re-derived its behavior
with 24 adversarial cases of my own (run, then removed):

| Input | Result | Assessment |
|---|---|---|
| `"1,25"`, `"82,5"`, `"2,5"` | 1.25 / 82.5 / 2.5 | comma normalized ✅ |
| `"0"` | `0` | legitimate zero, **not** null ✅ |
| `""`, `"   "` | `null` | distinct from zero ✅ |
| `"1,2,5"`, `"1.2,5"`, `"1,25.5"` | `null` | repeated/mixed separators rejected, not misread ✅ |
| `"1.234,5"` (EU thousands), `"1,234.5"` (US thousands) | `null` | rejected rather than silently misread ✅ |
| `","`, `"."`, `".."`, `",,"` | `null` | ✅ |
| `"2,"`, `",5"` | 2 / 0.5 | mid-typing states parse sensibly ✅ |
| `"abc"`, `"Infinity"`, `"NaN"` | `null` | ✅ |
| paste `"82,5 kg"` → sanitize → parse | 82.5 | pasted input handled ✅ |

Rejecting on ambiguity (returning `null` and surfacing an error) rather than
guessing is the right call for a weight field.

`sanitizeDecimalDraft` is a whitelist (`[^0-9.,]` stripped), so it also drops
the sign, `e`, and spaces. Two theoretical consequences: a pasted
`"1 234,5"` becomes 1234.5 and `"1e3"` becomes 13. Both are contrived for a
kg field, both are visible in the input before submit, and stripping the sign
is desirable here. Not defects.

### Canonical numbers reach API, persistence, snapshots, progression

Verified along the whole path, not just at the helper:

- **UI → API**: normalization happens before `JSON.stringify`, so only
  period-decimal JS numbers are serialized. Confirmed by reading the three
  submit paths.
- **API → persistence**: `createExerciseSchema` / `updateExerciseSchema` use
  plain `z.number()` (no `.int()`, no coercion). `exercises.load_step_kg` is
  `numeric(4,2)` with `mode: "number"`. Round-trip verified twice — through
  PGlite (`exercises.integration.test.ts`, create 1.25 → update 0.25 →
  re-read → list) and, independently, through the real `pg` driver in §2.
- **Snapshots**: `buildSnapshot.ts:67` feeds `loadStepKg` into
  `applyLoadMultiplier` → `roundToStepKg`; no `Math.round`-to-whole-kg
  anywhere in the path.
- **Progression**: `loadProgression.ts:70`, `repProgression.ts:153-157`,
  `registry.ts:93`, `evaluateSession.ts:141` all read the exercise's
  `loadStepKg` straight from the column. I confirmed
  `roundToStepKg(parseDecimalInput("82,5"), 2.5) === 82.5`,
  `…("1,25"), 1.25) === 1.25`, `…("0,25"), 0.25) === 0.25`,
  `…("100,25"), 0.25) === 100.25`.
- **Implicit-decision `===` comparison**: safe, and for a stronger reason
  than the report gives. `roundToStepKg` ends in `round2` (`Math.round(x*100)/100`)
  and `weightKg` comes from a `numeric(6,2)` column, so both sides of the
  `===` in `implicitDecision.ts:35` are normalized to two decimals. It cannot
  false-negative for *any* practical step, not only the four exact binary
  fractions.
- **Real browser**: `tests/e2e/exerciseDecimalInput.spec.ts` types `1,25`
  into the create form on a 390×844 viewport and re-reads `1.25` from the
  persisted record, and types `82,5` in a workout and reads back
  `82.5 kg × 5`. Both pass. These would have failed pre-fix.

### Bodyweight zero

Typed `0` and prefilled `0` both parse to `0` and pass `validateSetInput` —
no regression there. But there **is** a behavior change the report does not
name: an *empty* weight field previously logged 0 kg (`Number("") === 0`) and
now blocks with "Weight is required.". For a bodyweight exercise with no
baseline and no prior sets, `derivePrefill` leaves the field empty, so the
first bodyweight set of an exercise now requires explicitly typing `0`. This
is the correct trade — silent 0 was the defect — but it is a visible change
worth putting in front of the iPhone acceptance run. Recorded as LOW-3.

### Classification of the five deferred components

The report's prose says "Four other components" and then lists five (§7);
there are five. Classified by real risk:

| Component | Field | Comma behavior today | Severity |
|---|---|---|---|
| **`HistoryDetail.tsx`** (`:180`, save at `:196`) | logged set `weightKg` | `Number("")` → **silently rewrites a completed set to 0 kg**, with **no validation at all** before `correctHistorySet` | **MEDIUM — see M-1** |
| `PrescriptionForm.tsx` (`:346`) | `baselineLoadKg` | collapses to `""` → `emptyOr` yields `undefined` on create, **`null` on edit** — silently *clears* an existing baseline | LOW-4 |
| `BlockForm.tsx` (`:600`,`:614`), `WeekOverrides.tsx` (`:162`,`:176`) | deload `setMultiplier` / `loadMultiplier` | collapses to `""` → treated as "none", silently dropping the intended override | LOW-5 |
| `ContributionEditor.tsx` (`:85`) | contribution weight 0–1 | collapses to `""` → falls back to the role default | LOW-6 |

The remaining `type="number"` inputs in the three *fixed* files
(`ExerciseCard` reps/RIR, `RecommendationCard` reps) are integer fields where
a comma is not a valid separator; they collapse to `""` → `Number("") === 0`,
which `validateSetInput` **rejects** (`reps < 1`). Visible error, no silent
corruption. Correctly left alone.

**Does any deferred path block Phase 5.5 closure?** Strictly by the named
scope (create/edit exercise UI + workout controls), no — history correction
is a different screen. But `HistoryDetail` is the same silent-zero corruption,
on the same field (`setLogs.weightKg`), reachable by the same keystroke, on
the same device the pass exists to protect, and it is the *only* remaining
path that writes a wrong number without telling the user. It should not ship
into the iPhone acceptance run unfixed. That is a small remediation, not a
blocker on the work already done.

---

## 4. E2E failure — the report's conclusion is wrong

I reran `offline-cold-launch.spec.ts` independently. Findings:

1. **First isolated run: reproduced.** 30 s timeout, same as reported.
2. **Located the hang from the trace.** It is in **launch 1 (online setup)**,
   not in any offline launch: `ensureNoActiveSession(page)` returns, then the
   spec's own `getByRole("button", { name: "Start workout" }).click()`
   (`offline-cold-launch.spec.ts:128`) never resolves. No service worker,
   cache, or offline behavior is exercised before the timeout.
3. **Root cause: leftover state + a racy helper.** The shared local dev
   Postgres held an `in_progress` workout session from 13:09 (residue of the
   implementation session's own e2e run). While a foreign session exists,
   `TodaySection.tsx` renders the resume/takeover block and **does not render
   "Start workout" at all** (`:262-300`, `:378` — gated on
   `!hasForeignActive`). `ensureNoActiveSession` (`helpers.ts:43-49`) probes
   with a **non-retrying `isVisible()`**, which can fire while the page is
   still in its `remoteState.kind === "checking"` → "Loading…" gate
   (`TodaySection.tsx:146`), see the takeover button as absent, and return —
   after which the spec waits 30 s for a button that will never render.
4. **Deterministically reproduced.** I injected a single `in_progress`
   `workout_sessions` row into the local dev DB and the spec failed
   identically; I removed it and the spec passed. (The injected row was
   deleted; the dev DB now has zero `in_progress` sessions, as found.)
5. **The spec passes.** From clean state it passes both in isolation
   (8.5 s) and in the full suite.

**Full suite result: `npx playwright test` → 15 passed (58.3 s). Zero
failures.**

So the classification is: **test-harness issue (a race in
`ensureNoActiveSession`) latched by environmental leftover state** — not a
product defect, not a baseline defect, and not caused by this diff. The
report is right that it is unrelated to Phase 5.5; it is wrong that it is a
persistent pre-existing failure and "a real gap in this local environment's
e2e coverage". Because the spec's own launch-4 cleanup only runs on success,
a single failure leaves the `in_progress` row behind and the failure
self-perpetuates — which is exactly what the report's `git stash` experiment
re-observed, and why it looked codebase-independent. The e2e suite is green.
Not expanded into Phase 8 remediation; `helpers.ts` untouched.

---

## 5. Independent test / check results

Everything rerun by me, not taken from the report:

| Check | Result |
|---|---|
| `pnpm test:unit` | **322 passed, 0 failed** (27 files) |
| `pnpm test:integration` (PGlite) | **155 passed, 0 failed** (12 files) |
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm format:check` | clean |
| `pnpm build` (via Playwright `webServer`) | clean, server started |
| `npx playwright test` (full e2e) | **15 passed, 0 failed** |
| Ad-hoc catalog structure probe (92 entries, 11 invariants) | all clean |
| Ad-hoc decimal probe (24 adversarial cases) | all as expected |
| Ad-hoc seed probe, disposable Postgres, real `pg` driver | all assertions passed |

Counts match the report exactly, and the behavior behind them was
independently re-derived rather than inferred from the counts.

**Schema/migrations:** the diff touches no file under `src/db/schema/`, so
drift cannot have been introduced. `pnpm db:migrate` applied the full journal
cleanly to a brand-new database and the 92-entry catalog seeded onto it. No
migration needed — confirmed.

**Test quality note:** `tests/unit/exerciseCatalog.test.ts` asserts structure
generically (`>= 80` entries, uniqueness, enums, ≥1 primary, no intra-entry
duplicates) rather than hardcoding 92, which is the right shape — a future
addition is validated automatically. It does not pin the original 40 against
edits; not required, but see LOW-7.

---

## 6. Findings

### MEDIUM

**M-1 — `HistoryDetail.tsx` still silently rewrites a logged set to 0 kg on
comma entry.**
`src/ui/history/HistoryDetail.tsx:180` is `type="number"`, and the save
handler at `:196` does `weightKg: Number(weight)` with **no validation
whatsoever** before calling `correctHistorySet`. A comma-typed correction
collapses to `""` → `0`, writes 0 kg into a completed set, and that value
feeds the next progression evaluation. This is the identical defect class,
severity, and blast radius as the `ExerciseCard` bug this pass was chartered
to fix — the only remaining path in the app that persists a wrong weight
silently. Outside the named trace scope, correctly documented as deferred,
but it should be closed with the same two-line change (`parseDecimalInput` +
`type="text" inputMode="decimal"`) before the iPhone acceptance run rather
than after.

### LOW

**L-1 — Redundant leg-curl entries.** The pre-existing generic
`machine-leg-curl` ("Leg Curl") now coexists with the new
`machine-seated-leg-curl` and `machine-lying-leg-curl`. Seated vs lying are
genuinely different machines, so this is not padding, but the generic entry
is now ambiguous. Not fixable retroactively (already seeded to the user, who
can archive it). Worth avoiding the pattern in future additions.

**L-2 — Pre-ledger bootstrap would over-record against a 92-entry catalog.**
`seedExerciseCatalogForUser` (`exercises.ts:76-89`) records **all** of
`EXERCISE_CATALOG` as applied without inserting anything when a user has an
empty ledger but an `is_seeded` row. With the catalog now at 92, that branch
would mark all 52 additions as applied while inserting none — permanently
withholding them from that user. Pre-existing logic, **not** introduced by
this pass, and unreachable in practice: the branch fires at most once per
user, and the local dev account already carries 92 ledger rows (verified),
implying production's single account was bootstrapped long ago. Recording the
invariant so a future catalog expansion does not trip over it.

**L-3 — Empty weight no longer means 0.** Behavior change on bodyweight-only
exercises: the first set now requires explicitly typing `0`. Intentional and
correct, but the report claims "no regression to bodyweight zero handling"
without naming it. Put it in the iPhone acceptance script; consider
prefilling `0` for `bodyweight` equipment, or hinting "enter 0 for
bodyweight" in the error copy.

**L-4 — `PrescriptionForm.baselineLoadKg` clears on comma in edit mode.**
`emptyOr(mode, …)` returns `null` on edit for a collapsed field, so a
comma-typed baseline silently *removes* the existing one rather than
preserving it.

**L-5 — Deload multipliers silently drop on comma.** `BlockForm.tsx:600/614`
and `WeekOverrides.tsx:162/176` collapse to "none", so an intended
`0,9× load` deload becomes no override at all.

**L-6 — `ContributionEditor` weight falls back to the role default on comma.**
Lowest impact of the five (0.5 vs an intended 0.55).

**L-7 — `step="0.25"` removal drops the only decimal-precision guard on
`loadStepKg`.** `ExerciseForm` correctly replaced `min`/`max` with an explicit
bounds check, but the removed `step="0.25"` was also the browser's native
block on submitting e.g. `1.234`. Zod is plain `z.number().gt(0).max(99.99)`
with no precision constraint, so `1.234` now reaches a `numeric(4,2)` column
and is silently stored as `1.23`. Harmless to progression math (`round2`
normalizes both sides of every comparison) and self-evident after reload, but
it is a small silent-mutation path that did not exist before. Server-side
`.multipleOf(0.01)` or a client digit check would close it.

**L-8 — Report accuracy.** Two corrections for the closure artifact:
§5's E2E paragraph (the suite is 15/15 green; the failure is a state-latched
harness race, not a persistent product/coverage gap), and §7's "Four other
components" preceding a list of five.

**L-9 — Walking lunges are `bilateral`.** `barbell-walking-lunge` and
`bodyweight-walking-lunge` default to bilateral while the pre-existing
`dumbbell-bulgarian-split-squat` and the new `dumbbell-step-up` are
`unilateral`. Purely cosmetic today (grep confirms `laterality` has no
consumer beyond persistence and the form), user-editable, but it may matter
once Phase 6 counts volume.

### Not findings

- Adductor coverage: no addition requires Hip Adduction. Nothing here forces
  a taxonomy change before Phase 6.
- Obliques (`cable-woodchopper` → `abs`) and soleus/gastrocnemius (seated vs
  standing calf raise → `calves`) are folded into the existing umbrella
  groups, consistent with the pre-existing `cable-crunch`. This is the flat
  taxonomy's known limitation, correctly *not* addressed here.
- `machine-t-bar-row` classified as `machine` is debatable (landmine/plate-
  loaded), but plate-loaded T-bar machines exist and the field is
  user-editable.
- The name-collision slug is recorded in the ledger and never reconsidered,
  so the user will never receive a seeded "Hack Squat" even if they later
  rename their custom one. Documented pre-existing design ("the user's row
  always wins"), not a 5.5 regression.

---

## 7. Compatibility with the future taxonomy (bounded)

Checked only for compatibility, per instruction. The 52 additions use the
canonical 15 slugs with the same 1.0/0.5 role defaults and no per-entry
weights, so they carry no assumptions a hierarchical taxonomy would have to
unwind. Every added row/pull maps to `back`, so a future lats/mid-back split
has exactly one flat set of rows to reinterpret rather than a partially
migrated one. Nothing in this pass constrains Phase 6.

---

## 8. Verdict

The implementation is sound. The catalog expansion is genuinely append-only
and structurally clean; the seed behavior meets every stated requirement
under real Postgres with real user mutations, including the collision case;
the decimal fix is correct, correctly scoped, and proven end-to-end from
keystroke to progression math. No redesign is warranted and nothing needs to
be reverted.

Two things stand between this and closeout, both small:

1. **M-1** — close the identical silent-0-kg defect in `HistoryDetail.tsx`.
   It is the last path in the app that persists a wrong weight without
   telling the user, and it is reachable by the same keystroke on the same
   phone this pass exists to protect.
2. **L-8** — correct the report's E2E section. The e2e suite is 15/15 green;
   the failure is a state-latched race in `ensureNoActiveSession`, not a
   persistent product defect or a coverage gap. Closing on an inaccurate
   verification record is the part that actually matters.

L-1 through L-7 and L-9 are informational; none need action before closeout,
though L-4/L-5 are worth scheduling as a single follow-up with M-1 since they
share one two-line fix.

Manual iPhone acceptance remains pending and is not substituted by anything
in this review.

**READY FOR SMALL REMEDIATION**
