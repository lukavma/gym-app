# Phase 7 — Second Targeted Remediation Verification

Verifier: independent verification pass 2. Date: 2026-08-26.
Subject: uncommitted working tree at `main` @ `8c09049`, after the follow-up dated 2026-08-26
in `docs/reviews/phase-7-remediation.md`.

Documents reviewed: `docs/reviews/phase-7-remediation-verification.md` (pass 1), the dated
follow-up section of `docs/reviews/phase-7-remediation.md`, and the actual follow-up diff.

Scope, as instructed: the one remaining MEDIUM-2 recurrence and its associated sleep-hours LOW,
plus focused regression on the six findings already closed in pass 1. Nothing else was
re-litigated.

No implementation file, existing report, or unrelated file was modified. Nothing was
remediated, committed, pushed or deployed. No production access. All work ran against a
disposable local PostgreSQL 16 database (`gymapp_rev7c`), created fresh and dropped within this
pass; the working tree was verified byte-identical to its pre-verification state afterwards.

---

## 1. Follow-up diff under review

Five files, exactly as the follow-up report states — no unreported changes:

| File | Change |
|---|---|
| `src/ui/recovery/NullableSliderField.tsx` | **new** — `NullableSliderField` / `UnsetField` / `ClearButton` extracted so both editing surfaces share one implementation; slider `aria-label` changed from `Edit {label}` to bare `{label}` |
| `src/ui/recovery/RecoveryCheckIn.tsx` | `RecoveryCheckInForm` splits `isNew` (neutral defaults) from editing an existing entry (initialised directly from `entry.x`, never `??`); existing-entry edits now submit via **`PATCH /api/recovery/[id]`** instead of the POST day-upsert; client-side at-least-one-metric guard now accounts for the off-card `sleepHours` |
| `src/ui/recovery/RecoveryHistoryList.tsx` | sleep-hours `onChange` now calls `setSleepHours(parseDecimalInput(draft))` unconditionally; "Set" seeds the text draft alongside the numeric value |
| `tests/e2e/phase7Remediation.spec.ts` | three new regression tests |
| `docs/reviews/phase-7-remediation.md` | dated follow-up section appended |

Nothing under `src/server/`, `src/domain/`, `drizzle/`, `src/app/(app)/layout.tsx`,
`src/domain/progression` or `src/server/progression` was touched. `pnpm db:generate` reports no
drift. `docs/architecture/` has no diff at all.

---

## 2. The MEDIUM-2 recurrence — **CLOSED**

### 2.1 The reported chain, reproduced UI-only

I re-ran the exact sequence from pass 1, using only ordinary UI actions — no API shortcuts for
any step that a user performs:

| Step | Result |
|---|---|
| 1. New check-in from Today, defaults, Save | `{sq: 3, rd: 3, so: 3}` |
| 2. `/recovery` → Edit → **Clear** Sleep quality + Soreness → Save | `{sq: null, rd: 3, so: null}` |
| 3. Today summary | `Logged today: Readiness 3/5` — cleared metrics correctly omitted |
| 4. "Edit today's check-in" | `Sleep quality: not set`, `Soreness: not set`; **only one slider rendered**, `Readiness=3` |
| 5. Save without changing anything | **`{sq: null, rd: 3, so: null}`** — cleared metrics remain null |

The defect does not reproduce. Summary after save still reads exactly `Logged today: Readiness
3/5`, and the row count stays at one.

**Negative control on the detector.** A "no fabrication" result is only meaningful if the same
instrument would report fabrication when it exists. Immediately after step 5 I induced the
defect deliberately (`PATCH {sleepQuality: 3, soreness: 3}`) and the same assertion reported
`sq=3 so=3`. The detector is sensitive; the clean result is not vacuous.

### 2.2 New check-in may default to 3/3/3; an existing entry never fabricates

Both halves verified in the DOM, not inferred:

- **Brand-new check-in** (no entry for today): three sliders rendered at
  `Sleep quality=3 Readiness=3 Soreness=3`, zero "not set" rows. This is permitted and present.
- **Existing entry with nulls**: cleared metrics render `… : not set` with no slider at all.
- **Existing entry fully populated** (`5/4/2`): all three sliders pre-fill `Sleep quality=5
  Readiness=4 Soreness=2` — the real stored values, not neutral defaults.

**Negative control on the renderer.** An entry whose metrics are genuinely `3` (not null)
renders three sliders at 3 with zero "not set" rows. So "not set" and "slider at 3" are
genuinely distinguishable in the DOM, which is what makes the assertions above load-bearing.

### 2.3 sleepHours-only entries edited from Today

An entry with `sleepHours: 7.5` and all three 1–5 metrics genuinely null:

- Today summary shows `Logged today: Sleep 7.5h`.
- The edit form renders **all three as "not set"** and **zero sliders**.
- An unchanged Save preserves `{sh: 7.5, sq: null, rd: null, so: null}` — nothing fabricated.
- An explicit "Set Readiness" tap is honoured (`rd: 3`) while `sleepHours` stays 7.5 and the
  other two stay null — a deliberate user action, which is the correct distinction.
- Clearing that last slider again is **allowed**, because the preserved off-card `sleepHours`
  still satisfies `ck_recovery_entries_has_metric` — the client guard correctly accounts for a
  field the card cannot display.
- Conversely, on an entry with **no** `sleepHours`, clearing the only metric is blocked with a
  visible "At least one of sleep hours, sleep quality, readiness, or soreness is required" and
  nothing is written.

### 2.4 Today's PATCH path — ownership, nullables, notes, sleepHours

The card now submits existing-entry edits through `PATCH /api/recovery/[id]`. That is a new
caller of an existing endpoint, so I re-tested it directly.

**Ownership, with real cross-user ids.** I seeded a *second* user directly in the database with
their own recovery and bodyweight entries, then attacked those real ids from the authenticated
session using the exact payload shape the Today card now sends:

| Request | Result |
|---|---|
| `PATCH /api/recovery/{foreign id}` (card's payload) | **404** `{"error":"not_found"}` |
| `DELETE /api/recovery/{foreign id}` | **404** |
| `PATCH /api/bodyweight/{foreign id}` | **404** |
| `DELETE /api/bodyweight/{foreign id}` | **404** |
| `GET /api/recovery/today` | `entry: null` — foreign row not leaked |
| `GET /api/recovery` / `/api/bodyweight` | foreign entries absent from both lists |

**Negative control:** the identical `PATCH` and `DELETE` against this user's *own* entry return
200 and 204. The 404s are ownership scoping, not a broken route.

**Field semantics through PATCH**, on an entry with every field populated
(`sh 6.25, sq 5, rd 4, so 2, note "original note"`):

- Editing only the note → `{note: "edited note", sh: 6.25, sq: 5, rd: 4, so: 2}` — `sleepHours`,
  which the card cannot display, is preserved because the card omits the key.
- Emptying the note → `note: null`, `sleepHours` still 6.25 — a deliberate clear, as designed.
- No duplicate row is created by the PATCH path.

---

## 3. The sleep-hours LOW — **CLOSED**

The pass-1 defect was that emptying the text box displayed `""` while Save silently wrote the
old value.

- Emptying the box now immediately switches the control to **`Sleep hours: not set`** — there is
  no longer a blank box holding a stale number — and saving persists `sleepHours: null`
  (verified `{sh: null, so: 2}` on an entry that also carried a soreness value, so the clear was
  legal).
- When `sleepHours` is the **only** metric, the same action is **correctly blocked** with the
  at-least-one-metric error and nothing is written (`sh` stays 8). Both branches of the
  instruction's "persists null, or is correctly blocked" are satisfied.
- The companion round trip works: **Clear → Set** seeds the visible draft to `"7"` and saving
  then stores exactly `7` — the latent gap where the box showed blank while the value was
  already 7 is gone.
- Ordinary editing is unaffected: retyping `6.5` persists 6.5, and a comma decimal separator
  (`7,25`, the iOS non-US-locale case this codebase deliberately handles) parses to 7.25 rather
  than being dropped.

Observation, not a finding: because an unparseable draft now maps to `null`, the text input is
replaced by the "not set" control the moment the field is emptied. That is self-consistent with
the new model and recoverable via "Set", and it is what makes the clear actually persist.

---

## 4. Regression on the six findings closed in pass 1 — all still closed

`RecoveryCheckIn.tsx` changed in this follow-up and the card's rendered height changed with it,
so HIGH-1 and the geometry findings were re-proven from scratch rather than assumed. 39/39
independent assertions passed.

**BLOCKER-1** — at 375×667, 390×664, 390×844 and 430×844, across all seven routes: zero
document-level horizontal overflow, all 7 nav links geometrically on-screen.

**HIGH-2** — with the recovery card confirmed in its tallest three-slider state during the
measurement, "Start workout" bottom is 344 px at every viewport, and the bodyweight quick-log
bottom is 455 px — both above the fold even at 375×667 and 390×664.

**HIGH-1** — the original destructive sequence re-run end to end: log 5/5/5 + note → reload →
**no blank form** (0 "Save check-in" buttons), summary shows the real values → edit pre-fills
`5/5/5` not `3/3/3` → unchanged save preserves 5/5/5 and the note, one row. The read-back
failure path still holds under all three modes (network abort, HTTP 500, malformed JSON body,
each confirmed intercepted): no destructive form, no sliders, explicit error shown, stored entry
untouched.

**HIGH-3** — this follow-up added a new module *inside* a forbidden directory
(`src/ui/recovery/NullableSliderField.tsx`), so the boundary was re-walked independently: 65
modules from 8 roots, no forbidden module reachable, walk confirmed non-vacuous via the
`src/db/schema/index.ts` witness. Negative controls all still fire — the walker detects the new
module when something imports it, detects `TodaySection.tsx`'s real edges, and resolves and
traverses all seven previously-missed import forms plus a two-barrel multi-hop chain, while not
following lookalike string literals. The shipped `progressionBoundary.test.ts` (12 tests) passes
alongside.

**MEDIUM-1** — presence semantics on the untouched POST day-upsert: a same-day re-log with only
`{readiness: 3}` preserves `sleepHours 7.5`, `sleepQuality 4` and the note; explicit nulls clear
deliberately; a note-only POST returns 400 from the schema, never a 500.

**MEDIUM-3** — `2026-13-45`, `2026-02-30`, `2026-02-29`, `2026-04-31`, `2026-00-10` and
`2026-01-00` all return **400** through the live route, never 500. Negative control: the real
leap date `2028-02-29` is accepted (201).

**LOW findings not expanded.** `BodyweightQuickLog` still starts empty with no read-back (LOW-1
untouched), `docs/architecture/` is unmodified (LOW-3, LOW-4), input sizing is unchanged
(LOW-5), and no product scope was added.

**Shipped suites, re-run independently**: `test:unit` 459/459 · `test:integration` 241 passed +
5 skipped (246 total) · `test:e2e` **45/45** · `typecheck`, `typecheck:sw`, `lint`,
`format:check` clean · `db:generate` no drift. All match the follow-up report, including its
corrected integration-count phrasing.

---

## 5. Verifier's own corrections

Two mid-run failures in this pass were my instrumentation, not the product, and are recorded so
the result is not overstated:

1. An ad-hoc `div`-selection heuristic returned empty slider/"not set" arrays, producing five
   spurious failures while every corresponding *data* assertion passed. Re-run with page-level
   locators (on `/today` the recovery card is the only thing rendering range inputs): all 9
   rendering assertions pass.
2. A page-level `getByRole("button", { name: "Save" })` also matched the check-in card's "Save
   check-in" button, so one Clear→Set round-trip clicked the wrong control. Re-run scoped to the
   history `<ul>` with `exact: true`: all 7 assertions pass.

Both were re-tested to a definitive result rather than left ambiguous.

Related observation: the `aria-label` change from `Edit {label}` to bare `{label}` means that on
`/recovery`, when today's entry is open in the history editor while the check-in card is also in
edit mode, two sliders can share an accessible name. Nothing in the suite or my probes broke on
it, and it is outside this pass's scope — noted only so it is on the record.

---

## 6. Assessment

The follow-up is a clean, minimal fix that addresses the root cause rather than the symptom.
Extracting `NullableSliderField` into a shared module means the two recovery-metric editing
surfaces can no longer drift apart — which is exactly how the recurrence happened in the first
place, one surface being written without the null-handling the other already had. The switch
from POST-upsert to PATCH for existing-entry edits is the right call and well-reasoned: the day-
upsert schema requires a numeric metric because there is no prior row to merge into, so a
clears-only edit relying on a preserved `sleepHours` genuinely needed the merge-aware endpoint.
Extending the client-side guard to account for the off-card `sleepHours` closes the matching
gap, and I confirmed both directions of it.

The sleep-hours fix is likewise complete rather than minimal — it also repaired the Clear→Set
draft-seeding gap in the same code path, which I verified independently.

The distinction the original finding turned on is now explicit in the code and observable in the
DOM: a brand-new check-in may default to a neutral midpoint because nothing exists to preserve,
while an existing entry's `null` is carried through as `null` and only an explicit "Set" tap
changes it. All seven originally scoped findings and the associated LOW are closed, all
previously-proven areas re-verified, and nothing regressed.

---

## Verdict

**VERIFIED — READY FOR DEVICE ACCEPTANCE**
