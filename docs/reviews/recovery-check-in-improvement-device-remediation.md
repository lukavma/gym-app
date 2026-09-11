# PI-007 — Recovery check-in: device remediation (Sleep hours input)

**Date:** 2026-09-11 (revision 2 — closes the findings from
[recovery-check-in-improvement-device-remediation-verification.md](recovery-check-in-improvement-device-remediation-verification.md),
verdict "REVISION REQUIRED")
**Follows:** [recovery-check-in-improvement-implementation.md](recovery-check-in-improvement-implementation.md),
[recovery-check-in-improvement-implementation-review.md](recovery-check-in-improvement-implementation-review.md)
("VERIFIED — READY FOR RECOVERY DEPLOYMENT"), deployed 2026-09-11 (commit `c2d98c8`)
**Trigger:** owner iPhone acceptance found a blocking input defect in the deployed Sleep hours
control; device acceptance remains open pending this fix
**Status:** the accepted persistent-input device fix (revision 1) is unchanged. This revision closes
one BLOCKER (B-1) and two MEDIUM/LOW findings the independent verification raised against it. No new
architecture evaluation performed (owner explicitly waived one — see §1)
**Tree:** based on `HEAD` = `c2d98c8`, working tree uncommitted; no commit, push, deployment or
production access performed by this task

---

## 0. Correction mapping (this revision)

| # | Severity | Finding (verification §3/§4.2/§5/§6) | Disposition |
|---|---|---|---|
| B-1 | BLOCKER | History silently persisted `null` from a non-empty unparseable draft, destroying stored data with no error | **Fixed** — `RecoveryHistoryList.tsx`'s `EditRow` now retains the draft `SleepHoursField` reports and refuses to save when it's non-empty but unparseable, without moving range/precision validation client-side. §1b |
| M-1 | MEDIUM | The invalid-draft error copy named only range/precision, which a non-numeric draft doesn't violate | **Fixed** — `sleepHoursRangeError` widened to "Enter sleep hours as a number between 0 and 24, to at most 2 decimals." §1b |
| L-1 | LOW (required alongside B-1) | No regression test covered History's unparseable-draft path | **Fixed** — new test in `phase7Remediation.spec.ts` §2 |
| L-2 | LOW | Focus-without-typing (touched semantics) and end-to-end zero entry were correct but untested | **Fixed** — two new tests in `recoveryCheckIn.spec.ts` §2 |
| L-3 | LOW | Report said "two stale comments" in `RecoveryCheckIn.tsx`; the diff changes one | **Corrected** — wording fixed below |

The accepted parts of revision 1 (removing the Clear button; the persistent always-mounted input;
16px text; unchanged viewport/zoom; A/B/C/D semantics; touched-only behaviour; Saved-notice reset;
History's out-of-range server rejection) are **unchanged** by this revision — see §5 for what
carries forward unedited.

---

## 1. Owner reproduction, confirmed cause, and the superseding decision

**Reproduction (owner, on device):** tap **Set** for Sleep hours → tap the newly displayed input →
iPhone zooms. Select the existing value and delete it → the input disappears and the keyboard
closes, preventing normal replacement of the value.

**Confirmed cause:** `SleepHoursField` rendered `UnsetField` (a `<div>`+button, not an `<input>`)
whenever `value === null`. Emptying the draft resolved the value to `null`, which swapped the
focused `<input>` out for that different element — the browser has nothing to keep focus on, so iOS
closes the keyboard. Separately, the input's own text size (`text-sm`, ~14px computed) is under
iOS Safari's 16px auto-zoom threshold, unlike `BodyweightQuickLog`'s `text-base` (16px) field, which
is what caused the zoom-on-focus.

**Owner-authorized correction (recorded here as the binding decision for Sleep hours going
forward):** replace the Set-gated interaction with a directly tappable, persistent optional input,
using `BodyweightQuickLog.tsx` as the interaction reference. This explicitly **supersedes** the
architecture evaluation's approved Set/default-7/input-unmount design *for Sleep hours only* — every
other binding distinction from that evaluation (the four states, the touched definition, validation
ownership, zero-is-valid, no migration) is preserved unchanged (§4). No new architecture evaluation
was performed or is needed, per the owner's explicit instruction; this document is the record of the
superseding decision and the evidence for it.

---

## 1b. B-1 — the regression the independent verification found, and the fix

Removing `SleepHoursField`'s draft-reset-and-unmount (§1) was correct — it was the iOS defect. But it
had a side effect the revision-1 report missed: at `c2d98c8`, typing a non-empty unparseable draft
(e.g. a lone `,`) *visibly* collapsed the field to **"Sleep hours: not set"** before the athlete ever
pressed Save. Removing that collapse removed the only signal the athlete had that their keystroke
hadn't registered as a number. Revision 1 added a compensating guard (`sleepHoursError`'s
`draft !== "" && value === null` branch) — but only to Today's two `save()`s. `RecoveryHistoryList`'s
`EditRow` discarded the `draft` argument entirely
(`onChange={(value) => setSleepHours(value)}`), so a `","` typed there had already become a legal
`null` before any save logic ran, and the server — correctly, since it never saw anything invalid —
accepted it as a deliberate clear. **The result: editing an entry with a stored sleep value plus
another metric, then mistyping the sleep-hours field, silently deleted the stored value with no error
shown anywhere.**

The "History is server-validated, so it doesn't need this" reasoning in revision 1's §5 does not
survive contact with this case, because it conflates two different things `sleepHoursError` does:
range/precision checking (`value > 24`, `decimalPlaceCount(draft) > 2` — genuinely a number the
server can and does reject with a 400) and unparseable-draft detection (`draft !== "" && value ===
null` — by definition never reaches the server as a number at all, so there is nothing for the server
to reject). Only the client can tell "the athlete emptied this" apart from "the athlete typed
something that isn't a number yet". Range/precision can stay server-owned for History; this one case
cannot.

**Fix, scoped to exactly that gap:**

1. `src/ui/recovery/SleepHoursField.tsx` — the unparseable-draft condition was extracted into its own
   exported predicate, `isUnparseableSleepHoursDraft(value, draft)`, used by both `sleepHoursError`
   (Today, which additionally enforces range/precision) and by History's own check (which does not).
2. `src/ui/recovery/RecoveryHistoryList.tsx`'s `EditRow` — added a `sleepHoursDraft` state (mirroring
   the pattern `RecoveryCheckIn.tsx` already uses), wired `SleepHoursField`'s `onChange` to store both
   arguments, and added one guard at the top of `save()`, before the existing at-least-one-metric
   check: `if (isUnparseableSleepHoursDraft(sleepHours, sleepHoursDraft)) { setError(...); return; }`.
   **No `PATCH` is sent** when this fires — the check runs before `setSaving(true)` and before the
   `fetch` call, exactly mirroring how Today's `sleepHoursError` check already worked.
3. `src/ui/recovery/copy.ts` — `sleepHoursRangeError` widened (M-1) to **"Enter sleep hours as a
   number between 0 and 24, to at most 2 decimals."**, so the one shared message actually describes
   the unparseable case as well as the two numeric ones. Used by both call sites; no second string was
   added.

**What did not change:** History's numeric range/precision validation is still entirely server-side —
entering `25` in History still reaches the `PATCH`, still gets the server's `400`, and the row still
shows the generic `Save failed.` (re-verified, §7). `sleepHoursError` itself (Today's fuller guard) is
unchanged in shape, just built from the shared predicate now. Empty still means unset on both call
sites — the new check is `draft !== ""`, so a genuine clear is untouched.

---

## 2. What changed

### Source — revision 1: 2 files; revision 2 (this pass): +2 edited

| File | Change |
|---|---|
| `src/ui/recovery/SleepHoursField.tsx` | *(rev 1)* Rewritten. No more `UnsetField`/`ClearButton`/Set-Clear branching — a single, always-mounted `<input>` (the `BodyweightQuickLog` pattern), empty when unset, prefilled when not. `text-base` (≥16px computed) replaces `text-sm`. *(rev 2, B-1)* the unparseable-draft condition extracted into an exported `isUnparseableSleepHoursDraft(value, draft)` predicate, reused by `sleepHoursError` |
| `src/ui/recovery/RecoveryCheckIn.tsx` | *(rev 1)* Comment-only: one stale comment describing the old "not set" text state was corrected to describe the new empty-input state (`git diff c2d98c8` shows a single changed line). No functional change |
| `src/ui/recovery/RecoveryHistoryList.tsx` | *(rev 2, B-1)* `EditRow` now retains the `draft` `SleepHoursField` reports (`sleepHoursDraft` state) and refuses to save — no `PATCH` sent — when it's non-empty but unparseable, via the shared predicate. Numeric range/precision is untouched: still server-validated only. §1b |
| `src/ui/recovery/copy.ts` | *(rev 2, M-1)* `sleepHoursRangeError` widened to "Enter sleep hours as a number between 0 and 24, to at most 2 decimals." — one shared string, both call sites |

**Unchanged, and verified so:** `src/ui/recovery/NullableSliderField.tsx` (the 1–5 sliders keep their
existing Set/Clear/`UnsetField` interaction — explicitly out of scope, "no slider redesign"),
`src/sync/dailyLogs.ts`, every server/API/domain file, and any viewport/meta configuration (no
`layout.tsx`, `next.config.ts`, or manifest file was touched — pinch zoom and viewport restrictions
are exactly as they were).

### Tests — revision 1: 3 edited, 1 new; revision 2 (this pass): +2 edited

| File | Change |
|---|---|
| `tests/e2e/recoveryCheckIn.spec.ts` | *(rev 1)* Every "Set Sleep hours"/"Clear Sleep hours" interaction replaced with typing into or emptying the persistent input. Two tests repurposed as direct device-remediation regressions (B-4: the owner's exact select-all-and-delete reproduction; a new A-3b: an intermediate unparseable draft). E-3 gained a third case (a non-empty invalid draft). E-2 gained a computed-font-size assertion. *(rev 2, L-2)* two new tests: A-4b (focus without typing does not mark the field touched) and A-2b (entering `0` end to end). See §6 for the full mapping |
| `tests/e2e/phase7Remediation.spec.ts` | *(rev 1)* The two remaining "Clear Sleep hours" clicks and the one "Sleep hours: not set" + input-invisibility assertion replaced with emptying the input directly and asserting it stays visible and empty. *(rev 2, L-1)* one new test in the same describe block: History rejects `","`/`"."`/`"1.2.3"` on a stored-8-plus-soreness fixture, with no `PATCH`, then saves once corrected, then still clears deliberately when emptied |
| `tests/e2e/offline-bodyweight-recovery.spec.ts` | *(rev 1)* The four "Set Sleep hours" activations (C-1, C-2, C-5, C-6) replaced with direct input interaction; C-5's touched-then-cleared sequence now types a value then empties it, instead of tapping Set then Clear |
| `tests/unit/sleepHoursField.test.ts` | *(rev 1, new)* Pins `sleepHoursError`'s two branches directly: the pre-existing range/precision guard, and the non-empty-unparseable-draft branch, including zero-is-valid and empty-is-not-an-error. *(rev 2, B-1)* +4 tests pinning `isUnparseableSleepHoursDraft` directly (empty → false, `.`/`,`/`1.2.3` → true, a real number including `0` → false, an out-of-range number → false — range stays a separate concern) |

`tests/e2e/bodyweightRecovery.spec.ts` and `tests/integration/syncDailyLogs.integration.test.ts`
needed no change in either revision — neither references the old Set/Clear interaction, and this
remediation is UI-layer only.

### Documents

This file only. `docs/architecture/domain-model.md`, the architecture evaluation, its independent
review, its revision verification, the implementation report and its independent review are all
unchanged — this remediation supersedes one narrow interaction detail from the evaluation (§1) without
reopening or editing it.

---

## 3. Binding distinctions — preserved, and how

- **State A (confirmed new) — untouched omits, touched sends number or `null`.** Unchanged in
  `RecoveryCheckIn.tsx`: the payload still spreads
  `...(isNew ? (sleepHoursTouched ? { sleepHours } : {}) : { sleepHours })`. What changed is *how*
  `sleepHoursTouched` becomes `true` — previously a "Set" tap fired `onChange` even though nothing
  was typed (that tap is what fabricated the seed value of 7); now the field has no activation step
  at all, so `onChange` — and therefore `setSleepHoursTouched(true)` — only ever fires from the
  `<input>`'s own `onChange`, which only fires when its value actually changes. **Focus alone
  cannot trigger it.** No wiring change was needed in `RecoveryCheckIn.tsx` for this: the touched
  callback was always "whatever `SleepHoursField.onChange` reports," and the new component simply
  reports it more honestly.
- **State B (confirmed existing) — always explicit.** Unchanged: the edit branch's
  `: { sleepHours }` spread is unconditional.
- **State C (unknown offline) — touched-only.** Unchanged: `touchSleepHours` still sets the touched
  flag, the value, the draft and `setSaved(false)` together, driven by the same real-`onChange`-only
  signal as state A.
- **State D (unknown timezone) — unchanged.** Not touched by this remediation at all.
- **Zero is a valid value.** `sleepHoursError(0, "0")` is still `null` (no error) — verified directly
  by the new unit test. Every check remains `=== null`/`!== null`, never truthiness.
- **Optimistic state.** `RecoveryCheckIn.tsx`'s `savedEntry.sleepHours` still reads the live
  `sleepHours` state (the G-4 fix from the original implementation) — untouched by this remediation.
- **Saved-notice behaviour (A-4/C-6).** `touchSleepHours` still calls `setSaved(false)` on every real
  edit, identically to before.
- **Validation ownership (History vs. Today) — refined in revision 2.** Range/precision checking
  (`value > 24`, `decimalPlaceCount(draft) > 2`) is still exclusively Today's concern: `sleepHoursError`
  (the function that enforces it) is still called only from Today's two `save()`s, and History's
  `PATCH` still gets a synchronous 400 from the server for an out-of-range number — unchanged, and
  re-verified (E-4, and the new History regression test's `25` case is deliberately *not* added there,
  since that path is already covered). What revision 2 corrects is a narrower, separable concern:
  detecting a **non-empty draft that never became a number at all**. That case can never reach the
  server as anything invalid — `SleepHoursField` already resolves it to a legal `null` before any
  request body is built — so server-side validation is structurally incapable of catching it. Both
  Today (`sleepHoursError`) and History (`EditRow`'s own check) now call the same
  `isUnparseableSleepHoursDraft(value, draft)` predicate for this one case; only Today additionally
  layers range/precision on top.
- **A non-empty, unparseable draft is an explicit error, not a silent clear — on both Today and
  History.** The shared predicate:
  ```ts
  export function isUnparseableSleepHoursDraft(value: number | null, draft: string): boolean {
    return draft !== "" && value === null;
  }

  export function sleepHoursError(value: number | null, draft: string): string | null {
    if (isUnparseableSleepHoursDraft(value, draft)) return RECOVERY_COPY.sleepHoursRangeError;
    if (value !== null && (value > 24 || decimalPlaceCount(draft) > 2)) {
      return RECOVERY_COPY.sleepHoursRangeError;
    }
    return null;
  }
  ```
  "Empty means unset" is unchanged — an empty draft still resolves to `null` with no error on both
  call sites. What changes is a draft like `"."`, `","` or `"1.2.3"`: revision 1 fixed this for Today
  only; revision 2 closes the same gap in History's `EditRow`, which previously discarded the `draft`
  argument entirely and so had no way to distinguish "the athlete typed something unparseable" from
  "the athlete deliberately cleared this" — both resolved to `sleepHours: null` and were sent as such.
  The fix does **not** hand History range/precision validation — that would be a materially larger
  change than the defect required, and §1b's fix deliberately keeps it separable.

---

## 4. The new interaction, end to end

`SleepHoursField` is now:

```tsx
export function SleepHoursField({ value, onChange, ariaLabel }) {
  const [draft, setDraft] = useState(value !== null ? String(value) : "");
  return (
    <div>
      <span>Sleep hours</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder="hours"
        value={draft}
        onChange={(e) => {
          const sanitized = sanitizeDecimalDraft(e.target.value);
          setDraft(sanitized);
          onChange(parseDecimalInput(sanitized), sanitized);
        }}
        className="... text-base ..."
      />
      <span>e.g. 7.5</span>
    </div>
  );
}
```

- **No Set step, no fabricated default.** An unset field renders the same `<input>`, empty. A stored
  value prefills it. There is no path that seeds `7`.
  <br>Note (not a Sleep-hours behaviour change, but a visible side effect the original
  implementation review already recorded as L-6): the `placeholder="hours"` and `e.g. 7.5` helper
  text are part of this shared control and were already present on both Today and History before
  this remediation — unaffected by it.
- **Never unmounts.** The component has exactly one return statement. `value === null` and
  `value === 8` render the identical `<input>` element with a different `value`/`draft`; React never
  swaps element types, so the browser never loses the focused node, and iOS never has a reason to
  close the keyboard.
- **The draft is never force-reset except when genuinely empty.** The old code special-cased
  `parsed === null` to blank the draft (`parsed === null ? "" : sanitized`); the new code always sets
  `draft` to exactly what `sanitizeDecimalDraft` returns, so a mid-typing state like a lone `,` stays
  on screen instead of vanishing out from under the athlete's thumb.
- **`text-base` (16px computed, verified — §6 E-2).** iOS Safari auto-zooms on focus for any input
  under 16px computed font size; this is the actual mechanism behind the reported zoom, not the
  viewport meta tag, which is untouched.
- **No separate Clear affordance.** Emptying the input (select-all + delete, or `fill("")`) *is* the
  clear gesture now, matching "Empty means unset" and removing the redundant Set/Clear button pair
  entirely for this one field. The 1–5 sliders keep their own Set/Clear/`UnsetField` interaction
  unchanged (out of scope).
- **Applied identically to Today (all three forms) and Recovery History**, via the one shared
  component — no per-call-site branching was introduced.

---

## 5. Deviations and judgment calls

- **The Clear button was removed, not kept alongside the persistent input.** The task's regression
  checklist describes clearing as "select all → backspace," not a button tap, and `BodyweightQuickLog`
  has no such button either. Keeping a redundant affordance next to a fully-editable field would have
  added UI surface the instructions don't ask for. `RecoveryHistoryList.tsx` needed no change because
  it never referenced `ClearButton`/`UnsetField` directly — it always went through `SleepHoursField`.
- **The invalid-draft error reuses one shared copy string** rather than introducing a second. Revision
  2 widened it (M-1) so the same message actually covers the unparseable case honestly, rather than
  adding a distinct string just for History.
- **Revision 1 scoped the invalid-draft guard to Today only, reasoning that it belonged inside
  `sleepHoursError`'s existing Today-only ownership boundary — the independent verification found
  this wrong, and it was.** The judgment call was surfaced explicitly rather than silently made (revision
  1's own §5 said so), which is what let the verification catch and correct it before this reached the
  owner. The error in the original reasoning: it treated "validation ownership" as one indivisible
  thing, when `sleepHoursError` actually bundles two separable concerns — range/precision (genuinely
  Today+server-only, by design) and unparseable-draft detection (structurally client-only, on *both*
  surfaces, because the server never receives anything invalid to reject). Revision 2 (§1b, §3) keeps
  the first Today-only and extends the second to History via a shared predicate. This is recorded here
  rather than silently rewritten, since it's a real correction to a real mistake, not a restatement.
- **B-4 and a new A-3b were repurposed/added as the literal device-remediation regressions** (the
  owner's exact reproduction, and the intermediate-draft-preservation guarantee) rather than only
  patching the old Set/Clear-based tests to use `.fill()`. `.fill()` alone would have re-proven the
  *outcome* (clearing works) without ever exercising the specific *mechanism* that broke on-device
  (keyboard-driven select-then-delete, focus retention). B-3 still covers the plain "empty via `.fill()`
  → save → other metrics survive" path that the old test covered.

---

## 6. Regression verification — checklist to evidence

| Checklist item | Covered by | Result |
|---|---|---|
| An initially unset field accepts input with one tap | `recoveryCheckIn.spec.ts` A-2 (`.click()` once, then `.pressSequentially()`, no prior activation) | pass |
| Select all → Backspace leaves the same input visible, empty and focused; typing 7.5 afterwards succeeds without another activation | `recoveryCheckIn.spec.ts` B-4 (`ControlOrMeta+a`, `Backspace`, asserts visible/empty/**focused**, then types and saves) | pass |
| Ordinary decimal replacement | `recoveryCheckIn.spec.ts` B-2 (8 → 6.75) | pass |
| Intermediate drafts preserved, not force-reset | `recoveryCheckIn.spec.ts` A-3b (types a lone `,`, asserts the draft is still `,` — not `""` — before recovering to a valid value) | pass |
| Untouched omission | `recoveryCheckIn.spec.ts` A-1, A-4 [NC] (the stale-read race) | pass |
| Deliberate clearing | `recoveryCheckIn.spec.ts` B-3, B-5 [NC]; `phase7Remediation.spec.ts`'s two updated tests | pass |
| Invalid draft handling — Today | `recoveryCheckIn.spec.ts` E-3's third case (`"."` → same error, draft preserved, nothing enqueued); `tests/unit/sleepHoursField.test.ts` (`.`, `,`, `1.2.3`) | pass |
| Invalid draft handling — History (B-1) | `phase7Remediation.spec.ts`'s new test: stored `8` + `soreness: 2`, each of `","`/`"."`/`"1.2.3"` shows the error, no `PATCH`, stored value stays `8`; correcting the draft saves; a subsequent deliberate empty still clears | pass |
| Existing-value editing | `recoveryCheckIn.spec.ts` B-1, B-2 | pass |
| Unknown-offline preservation | `offline-bodyweight-recovery.spec.ts` C-1, C-2 [NC], C-5, C-6 (all four updated) | pass |
| 320/390px layouts | `recoveryCheckIn.spec.ts` E-1 (unchanged assertion, re-verified against the new input) | pass |
| Computed input font size | `recoveryCheckIn.spec.ts` E-2 (`getComputedStyle(el).fontSize >= 16`) | pass — 16px |
| Focus alone does not mark the field touched (L-2) | `recoveryCheckIn.spec.ts` A-4b [NC]: state A, out-of-band `sleepHours: 6`, input clicked + tabbed away with no typing, save → `6` survives, sliders `3` | pass |
| Entering `0` end to end (L-2) | `recoveryCheckIn.spec.ts` A-2b: types `0`, saves, summary reads `Sleep 0h`, `GET` confirms `sleepHours: 0` | pass |
| Set-based tests updated, preservation guarantees retained | `recoveryCheckIn.spec.ts` (all A/B/E groups), `phase7Remediation.spec.ts`, `offline-bodyweight-recovery.spec.ts` | done, see §2 |

**Explicit acknowledgement:** all of the above run in Playwright/Chromium against the real DOM and
CSS, which proves the *React component's* behaviour (no unmount, empty-vs-invalid handling, computed
font size) precisely. It does **not** and cannot establish actual iOS Safari keyboard or
auto-zoom behaviour on a physical device — that remains the owner's acceptance step (§8).

---

## 7. Commands run and results

### Revision 1 (superseded numbers, kept for history)

All commands run against a task-owned, disposable database (`gymapp_pi007_device_remediation`,
dropped at the end of that task).

| Command | Result |
|---|---|
| `pnpm test:unit` | 1204 passed, 0 failed |
| `pnpm test:integration` | 467 passed, 17 skipped, 0 failed |
| `playwright test` (full suite) | 151 passed, 0 failed |

### Revision 2 (this pass) — closing B-1/M-1/L-1/L-2/L-3

Per the task's instruction to follow verification §9's proportionate scope: the unit suite, one full
Playwright run (which supplies the four-affected-spec evidence), and lint/typecheck/format.
`pnpm test:integration` was not re-run — this correction, like revision 1, is UI-layer only (no
domain/server/schema file changed), and revision 1's own integration run already established the
baseline is unaffected. A fresh task-owned, disposable database (`gymapp_pi007_devreverify`, created
inside the already-running `gym-app-db-1` container, migrated, seeded, account bootstrapped via
`smoke.spec.ts`, Phase 3 fixtures via `tests/e2e/seed.ts`) was used for the Playwright runs; the
shared dev database `gymapp` was never written to.

| Command | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm format:check` | clean |
| `pnpm test:unit` | **1210 passed**, 0 failed (6 new, pinning `isUnparseableSleepHoursDraft` directly, in `tests/unit/sleepHoursField.test.ts`) |
| `pnpm build` | succeeded |
| `playwright test` (full suite, first run) | **152 passed, 2 failed** — both diagnosed below |
| `playwright test offline-bodyweight-recovery.spec.ts -g "C-5" --repeat-each=3` (isolated re-run) | **3 passed, 0 failed** |
| `playwright test` (full suite, second run, after the fix below) | **154 passed, 0 failed, 0 flaky** |

**Two failures on the first full run, both diagnosed and closed before the final green run:**

1. `recoveryCheckIn.spec.ts` E-3 failed on `getByText('Enter sleep hours between 0 and 24, to at most
   2 decimals.')` — a real miss: four hardcoded occurrences of the **old** error string in
   `recoveryCheckIn.spec.ts` (E-3's three assertions plus E-4's History check) were not updated when
   M-1 widened the copy in `src/ui/recovery/copy.ts`. Fixed by updating all four to the new string.
   This was a test-file oversight, not a defect in the M-1 source fix itself (which was applied once,
   correctly, in `copy.ts`).
2. `offline-bodyweight-recovery.spec.ts` C-5 failed waiting for the offline-unknown banner text after
   a `context.setOffline(true)` + `page.reload()`. **Confirmed as a pre-existing flake, unrelated to
   this change**: re-run in isolation 3/3 times immediately after, all passing; C-5 was not touched by
   this revision's source or test edits (its "Set Sleep hours" → direct-input rewrite was revision 1's
   change, unaffected here); and it passed cleanly in the second full run. Consistent with this class
   of test (`context.setOffline` + `page.reload()` + a text wait) being timing-sensitive under a long
   serial run rather than deterministically broken.

No other pre-existing or unrelated failures were observed at any point in either revision.

---

## 8. iPhone acceptance — what's left

Physical device acceptance is the owner's next step and is **not claimed here** — Playwright/Chromium
cannot establish real iOS Safari keyboard or zoom behaviour (§6). On the installed PWA:

1. Today, no check-in yet → tap the Sleep hours input once → confirm it accepts typed input
   immediately, with **no zoom**.
2. Type a value, save → reopen **Edit today's check-in** → confirm the field prefills the stored
   value.
3. In the input, select the existing text and delete it → confirm the input **stays visible and
   focused** (does not disappear, keyboard stays open) → type a replacement value with no extra tap.
4. Confirm "Muscle soreness" wording and the 1/3/5 anchors are unaffected (unchanged by this
   remediation).
5. Go offline, log a check-in including sleep hours → confirm the offline "Saved" notice → reconnect
   → confirm the value syncs correctly.
6. **(B-1 fix)** On Recovery History, edit an entry that has a stored sleep-hours value, type a stray
   character alone (e.g. a comma) into the field, and confirm an inline error appears and nothing is
   saved — the stored value must still be there after leaving and re-opening. Then correct the value
   and confirm Save succeeds, and separately confirm deliberately emptying the field still clears it.

---

## 9. Preservation and cleanup

`git status --porcelain` inspected before and after this revision — identical except for the files
listed in §2 and this document. All concurrent work (the workflow-optimization task's `README.md`,
`docs/evidence/**`, `docs/research-notes/**`, `playwright.config.ts`, `tests/e2e/seed.ts`,
`docs/process/**`, and its own `docs/reviews/repository-agent-workflow-*.md` reports, including the
ones that appeared mid-task) is untouched. The historical Recovery reports (architecture evaluation,
its review and revision verification, the implementation report and its independent review, revision
1 of this remediation report, and its independent verification) are unchanged — the verification
document is not edited by this task; its findings are closed here and in source. No commit, push,
deployment or production access occurred.

**Task-owned resources, and their disposal (this revision):**

| Resource | Disposal |
|---|---|
| Database `gymapp_pi007_devreverify` | created for this task; **dropped** — `pg_database` back to its prior state |
| `pnpm start` production server on :3000 | started for this task; **stopped** — port 3000 confirmed free |
| Docker container `gym-app-db-1` | **left running** — already up before this task began, not created by it |
| `.next` build output | left in place — gitignored derived artifact, rebuilt against the tree at hand |

Revision 1's own task-owned database (`gymapp_pi007_device_remediation`) and server were already
disposed of by that task; nothing from it was left behind to clean up here. The shared dev database
`gymapp` was never targeted by any command in this task (every migrate/seed/build/test command
explicitly exported `DATABASE_URL` pointing at the isolated database).

---

READY FOR INDEPENDENT RECOVERY DEVICE-REMEDIATION REVERIFICATION
