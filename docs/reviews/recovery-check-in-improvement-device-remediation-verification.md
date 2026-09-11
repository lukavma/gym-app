# PI-007 — Recovery check-in device remediation: independent verification

**Date:** 2026-09-11
**Verified document:** [recovery-check-in-improvement-device-remediation.md](recovery-check-in-improvement-device-remediation.md)
**Baselines used for unchanged invariants:** [recovery-check-in-improvement-implementation-review.md](recovery-check-in-improvement-implementation-review.md) ("VERIFIED — READY FOR RECOVERY DEPLOYMENT") and [recovery-check-in-improvement-architecture-evaluation.md](recovery-check-in-improvement-architecture-evaluation.md) revision 2
**Tree:** `HEAD` = `c2d98c8` (the deployed PI-007 commit), working tree uncommitted; unchanged by this task except for this file (§8)
**Scope:** the owner's device-remediation decision supersedes the evaluation's Set / default-7 / input-unmount interaction for Sleep hours only. That supersession is accepted here and is **not** reopened. Every other binding invariant was re-verified. No source or earlier report was edited. No commit, push, deployment or production access.

---

## 1. Verdict

**REVISION REQUIRED** — one blocker.

The device fix itself is correct and well built. The input is now directly tappable and persistent,
the same DOM node survives select-all + delete with focus intact, intermediate drafts are preserved,
the computed font size is 16px on both call sites, and no fabricated default remains. Every one of
the owner's interaction requirements is met **on Today**.

The blocker is the third reported deviation, which this verification was asked to investigate
specifically. **On Recovery History, a non-empty unparseable draft is silently converted to a
persisted `null`, destroying a stored sleep value with no error and no visual signal.** Worse, this
is a *regression introduced by this remediation*: before it, the same keystroke visibly collapsed the
field to "Sleep hours: not set" before the athlete pressed Save. The remediation removed that signal
without adding the guard that replaced it on Today.

| # | Severity | Finding |
|---|---|---|
| **B-1** | **BLOCKER** | History silently persists `null` from a non-empty unparseable draft, clearing stored data (§3) |
| M-1 | MEDIUM | The invalid-draft error copy describes only range and precision, neither of which the rejected input violates (§4.2) |
| L-1 | LOW | No regression test covers History's unparseable-draft path (§5) |
| L-2 | LOW | "Focus alone does not mark the field touched" and end-to-end entry of `0` are correct but untested (§5) |
| L-3 | LOW | §2 of the remediation report says "two stale comments" were corrected; the diff changes one (§6) |

Deviation 1 (removing Clear) is **accepted** — §4.1. Deviation 3 is **rejected** — §3.

---

## 2. What was verified as correct

### 2.1 Scope and containment

`git diff` against `c2d98c8` confirms the report's §2 manifest exactly: two source files, and
`src/ui/recovery/RecoveryCheckIn.tsx`'s change is genuinely non-functional (a single comment line,
`"not set"` → `"empty (null)"`). `src/ui/recovery/copy.ts`, `RecoveryHistoryList.tsx`,
`NullableSliderField.tsx`, `src/sync/dailyLogs.ts` and every server/API/domain file are untouched, as
claimed. No migration.

**Viewport/zoom restrictions are untouched and were never restrictive.**
[layout.tsx:23-28](../../src/app/layout.tsx#L23-L28) is `width: "device-width"`, `initialScale: 1`,
`viewportFit: "cover"` — no `maximumScale`, no `userScalable: false`. Read back from the live page:
`width=device-width, initial-scale=1, viewport-fit=cover`. `git status` shows no change under
`src/app` or to `next.config.ts`. Pinch zoom remains available.

**The BodyweightQuickLog claim is literal, not approximate.** The new input's className is
character-for-character identical to
[BodyweightQuickLog.tsx:67](../../src/ui/bodyweight/BodyweightQuickLog.tsx#L67):
`w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base text-slate-50 outline-none focus:border-slate-400`.

### 2.2 Owner-required interaction behaviour — reproduced

| Requirement | Evidence |
|---|---|
| Initially unset input is **directly editable** | A-2 clicks once and `pressSequentially`s with no activation step — pass. Probes P5/P6 did the same and stored the result |
| Select-all → Backspace leaves the **same DOM input** mounted, empty, focused | **Probe P3**: tagged the element with `dataset.probeMark = "same-node-42"` *before* the gesture; afterwards `markSurvived: "same-node-42"`, `value: ""`, `isActiveElement: true`, `tag: "INPUT"`. React never swapped the node. This is stronger than B-4, which asserts visible/empty/focused but not node identity |
| Entering `7.5` then works **without another activation** | P3 typed straight into the still-focused node → `"7.5"`; B-4 does the same and saves `Sleep 7.5h · Muscle soreness 2/5` |
| **Intermediate decimal drafts survive typing** | **Probe P5**: keystroke-by-keystroke drafts were exactly `["7", "7.", "7.5"]` — no force-reset. A-3b covers the lone `","` case |
| **No fabricated default** | No path seeds `7`; A-1 asserts the field is `""` on a fresh card |
| Existing values prefill | B-1/B-2; P1 showed `8` prefilled on the edit form |
| Emptying **deliberately** clears | B-3, B-5, `phase7Remediation.spec.ts:350` — all pass |
| **Zero remains valid** | **Probe P6**, end to end through the UI: typed `0` → stored `sleepHours: 0` → summary `"Logged today: Sleep 0h · …"`. Not truthiness-collapsed anywhere |
| **Focus alone does not mark the field touched** | **Probe P4**, the decisive form: state A, out-of-band row created with `sleepHours: 6`, then the input was *clicked and blurred without typing*, then saved. Result `sleepHours: 6`, sliders `3` — the key was omitted, so focus did not set `sleepHoursTouched`. Mechanism confirmed in source: the flag is only ever set from the `<input>`'s own `onChange` |
| Computed font size ≥ 16px | **16px** on Today's card (P3, and Q4 on `/recovery`) **and** on History's `Edit sleep hours` (P7, Q4). E-2's own assertion also passes |

### 2.3 Preserved invariants from the approved architecture

- **State A untouched omission** — A-4 [NC] passes; P4 additionally proves focus does not defeat it.
- **State B explicit value / explicit null** — B-1, B-2, B-3 pass; the `: { sleepHours }` spread is
  unchanged in source.
- **State C touched-only** — C-1 and C-2 [NC] pass with the new direct-input gesture; C-5's
  touched-then-cleared op still dead-letters visibly as `no_metric`.
- **State D (unknown timezone)** — untouched; both legacy-bundle unknown-timezone tests pass.
- **Optimistic state** — `savedEntry.sleepHours` still reads live state; B-4's post-save summary
  proves it.
- **Saved-notice reset** — C-6 passes with the new `fill("7")` edit.
- **Validation ownership** — `sleepHoursError` is still called only from Today's two `save()`s. This
  is preserved *as written*, and §3 explains why preserving it in this form is nevertheless the
  blocker.

---

## 3. B-1 (BLOCKER) — History silently persists `null` from a non-empty unparseable draft

### Reproduction

Local run, isolated database, production build (§7). A recovery entry with a stored sleep value **and
at least one other metric**:

```
seed   POST /api/recovery { date: "2026-02-03", sleepHours: 8, soreness: 2 }
       /recovery → history row → Edit
       focus "Edit sleep hours" → Ctrl/Cmd+A → type ","
       input displays ","            (non-empty, exactly as typed)
       click Save
result inline errors: []                        ← no error at all
       row now reads "2026-02-03 · Muscle soreness 2/5"
       stored: { sleepHours: null, soreness: 2 }   ← the 8 is gone
```

Confirmed for every unparseable non-empty draft tested — `","`, `"."`, `"1.2.3"` — each displayed
verbatim in the input, each saved with **no error** and `sleepHours = null` (probe Q2).

### Why the "server owns History's validation" argument does not hold here

The remediation's §5 defends the Today-only scoping by citing History's server-validated boundary.
That boundary is real for *range* errors, and it still works — probe Q3, same fixture, draft `"25"`:
the `PATCH` returns 400 and the row shows `Save failed.`, with the stored `8` intact.

But it cannot apply to this class of input, because **the server never sees anything invalid**.
`RecoveryHistoryList`'s `EditRow` holds only the parsed value
([:155-158](../../src/ui/recovery/RecoveryHistoryList.tsx#L155-L158),
`onChange={(value) => setSleepHours(value)}` — the `draft` argument is discarded), so `","` has
already become a perfectly legal `null` by the time the request is built. The server correctly
accepts it as a deliberate clear. Server-side validation is structurally incapable of catching a
client-side misinterpretation; only the client can distinguish "the athlete emptied this" from "the
athlete typed something that isn't a number yet".

### Why this is a regression, not an inherited gap

At `c2d98c8` — the deployed build — `SleepHoursField` force-reset the draft and returned a different
element as soon as the value resolved to `null`:

```tsx
// git show c2d98c8:src/ui/recovery/SleepHoursField.tsx
const nextDraft = parsed === null ? "" : sanitized;   // draft blanked
...
if (value === null) {
  return <UnsetField label={RECOVERY_COPY.sleepHoursLabel} onSet={…} />;   // "Sleep hours: not set"
}
```

So typing `","` in History used to collapse the control to a visible **"Sleep hours: not set"** state
*before* Save. The clear was still applied on save, but it was announced — the athlete could see the
field was no longer holding a value. The remediation deliberately removed both the draft reset and
the unmount (correctly — they are the iOS defect), and added the compensating
`draft !== "" && value === null` guard **only to `sleepHoursError`, which History does not call**.
The net effect on History is that a visible clear became a silent one.

The blast radius is bounded but real: when sleep hours is the entry's *only* metric, `EditRow`'s
at-least-one-metric guard incidentally blocks the save and the value survives (probe Q1). Data is
lost only when the entry carries another metric — which is the common case for a filled-in day.

### Required correction

Make the non-empty-unparseable case an error on **both** call sites, reusing the helper that already
exists. In `RecoveryHistoryList.tsx`'s `EditRow`:

1. Keep the draft the component already reports — change
   `onChange={(value) => setSleepHours(value)}` to also store the second argument
   (`(value, draft) => { setSleepHours(value); setSleepHoursDraft(draft); }`).
2. In `save()`, before the `PATCH`, refuse to send when `sleepHoursDraft !== "" && sleepHours === null`.

**This does not hand History the range/precision validation the architecture deliberately left
server-side.** The two are separable, and the distinction is worth stating in whatever document
records the fix: the server keeps owning *"is this number in range"* (`25` → 400 → `Save failed.`,
unchanged, E-4 and Q3 both still pass); the client only refuses to **silently reinterpret
uninterpretable text as a deliberate clear**. If the implementer prefers the full helper,
calling `sleepHoursError(sleepHours, sleepHoursDraft)` also closes it, at the cost of moving range
validation client-side for History — a larger change than the defect requires, and one that would
need E-4 re-aimed.

A regression test must accompany the fix (§5, L-1).

---

## 4. The other two reported deviations

### 4.1 Deviation 1 — removing the Clear button: **ACCEPTED**

The owner's condition was that emptying provide "an accessible, reliable clear gesture without losing
focus". Verified:

- **Reliable and focus-preserving** — probe P3: the same DOM node survives select-all + Backspace,
  stays focused, and accepts the replacement immediately. No remount, no re-tap.
- **Accessible** — probe Q5: the control is a plain enabled `<input type="text">` with
  `aria-label="Sleep hours"` (History: `"Edit sleep hours"`), `inputmode="decimal"`, not readonly and
  not disabled. Clearing a text field is the standard platform gesture for keyboard, touch and
  assistive-technology users alike. No `Set Sleep hours` / `Clear Sleep hours` buttons remain
  anywhere on the page.
- It matches `BodyweightQuickLog`, which the owner named as the reference and which likewise has no
  Clear button.

*Advisory only (no action required):* the field's only hint text is `e.g. 7.5`, so "empty means
unset" is discoverable by trying it rather than by being told. That is the same affordance level the
owner's reference control has, so it is in scope as approved.

### 4.2 Deviation 2 — reusing `sleepHoursRangeError` for invalid drafts: **M-1, MEDIUM**

The owner required that the copy "reasonably describe unparseable as well as out-of-range input". The
message shown for `","`, `"."` and `"1.2.3"` is:

> Enter sleep hours between 0 and 24, to at most 2 decimals.

It is actionable — it states what valid input looks like — but it names only the two constraints the
rejected input does **not** violate. For `"1.2.3"` in particular the message actively misleads: the
text is within 0–24 by appearance and has a decimal part, so an athlete reading it has no way to
learn that the problem is that the text is not a number at all.

**Required correction (fix alongside B-1):** widen the string so it covers the unparseable case, e.g.

> Enter sleep hours as a number between 0 and 24, to at most 2 decimals.

Three words, one constant in `src/ui/recovery/copy.ts`, and the existing `metricsCopy`-style
assertions are unaffected. The decision to avoid a second string is otherwise sound and should be
kept.

---

## 5. Regression coverage

The updated tests are meaningful, not merely re-pointed. B-4 was rewritten into the owner's literal
reproduction (keyboard select-all, `Backspace`, then assertions on visible/empty/**focused** and
immediate replacement) rather than a `fill("")` that would have re-proven only the outcome; A-3b is a
genuinely new guarantee (draft preservation); E-2 gained the computed-font-size assertion; E-3 gained
the invalid-draft case; and `tests/unit/sleepHoursField.test.ts` pins both `sleepHoursError` branches
including zero-is-valid and empty-is-not-an-error. That is the right shape.

Gaps:

- **L-1 (LOW → becomes required with B-1).** Nothing covers History with a non-empty unparseable
  draft. The suite is fully green while the defect in §3 is present, which is why it reached this
  review. The fix needs a test at the `phase7Remediation.spec.ts:350` fixture: stored `8` plus a
  second metric, type `","`, Save, assert the stored value is **still 8** and that an error is shown.
- **L-2 (LOW).** Two owner-checklist behaviours are correct but untested: focus-without-typing must
  not mark the field touched (probe P4), and entering `0` through the UI must store `0` (probe P6).
  Both are cheap to add — P4's shape in particular is a real [NC]-grade control, since a future
  refactor that fired `onChange` on focus would silently break state A's omission rule with every
  existing test still green.

---

## 6. Report accuracy

The remediation report is honest and largely precise. Two notes:

- **L-3 (LOW).** §2 says `RecoveryCheckIn.tsx` had "two stale comments" corrected; the diff contains
  one changed comment line. The "comment-only, no functional change" claim itself is correct.
- **Credit where due.** §5 does *not* hide the History scoping decision — it states the alternative
  reading explicitly and says it is "flagging this explicitly for the reviewer rather than silently
  picking a side". That is the right way to surface a judgment call. The call itself is wrong (§3),
  but it was surfaced, not buried.
- §6's "Explicit acknowledgement" that Chromium cannot establish iOS Safari keyboard or auto-zoom
  behaviour is accurate and is repeated here (§7).

---

## 7. Evidence

### Executed by this verification

Environment: a task-owned disposable database `gymapp_pi007_devverify` created inside the
already-running `gym-app-db-1` container, then the documented CI bootstrap order — `db:migrate` →
`db:seed` → `pnpm build` → `pnpm start` on :3000 → `smoke.spec.ts` (account) → `db:seed` →
`tsx tests/e2e/seed.ts`. Targeting was confirmed before any destructive spec ran (`/setup` answered
200 with the setup form; the isolated DB held 0 users while the shared dev DB held 1).

| Command | Result |
|---|---|
| `pnpm lint` | clean, exit 0 |
| `pnpm typecheck` | clean, exit 0 |
| `pnpm format:check` | `All matched files use Prettier code style!` |
| `pnpm test:unit` | **1204 passed** / 84 files, 0 failed (incl. the 11 new `sleepHoursField` tests) |
| `pnpm build` | succeeded |
| `playwright test recoveryCheckIn + phase7Remediation + offline-bodyweight-recovery + bodyweightRecovery` | **52 passed**, 0 failed |

Scope was kept proportionate per the task: the four specs that exercise the changed component, plus
the full unit suite. The full 151-test Playwright run and `pnpm test:integration` are **inherited from
the remediation report, not reproduced** — this is a UI-layer change with no integration surface, and
no unresolved concern pointed at the rest of the suite. The unit count (1204) reproduces the report's
figure exactly.

Seven browser probes were run against the live production build with `playwright-core`, writing no
repository file: P1 (Today + `","`), P2 (History + `","` — the blocker), P3 (DOM node identity /
focus / font size), P4 (focus does not mark touched), P5 (intermediate drafts), P6 (zero end to end),
P7 + Q4 (font size on both call sites, viewport meta), plus Q1–Q3 and Q5 characterising the blocker's
blast radius and the accessibility of the clear gesture. Their outputs are quoted inline above.

### Explicitly not established

**No browser check performed here proves physical iPhone behaviour.** Chromium at a 390×844 viewport
can prove the React component never unmounts, that focus is retained, that the computed font size is
16px and that the viewport meta imposes no zoom restriction — it cannot prove that iOS Safari
therefore keeps the keyboard open or declines to auto-zoom. Physical device acceptance remains the
owner's step **after** the B-1 fix is deployed.

---

## 8. Preservation and cleanup

`git status --porcelain` captured before and after is **identical except for this file**. `HEAD`
stayed at `c2d98c8`. All concurrent workflow work is intact and untouched: `README.md`,
`docs/evidence/**`, `docs/research-notes/**`, `docs/process/**`, `playwright.config.ts`,
`tests/e2e/seed.ts`, and the `docs/reviews/repository-agent-workflow-*.md` set (including
`repository-agent-workflow-first-slice-implementation.md` and `-review.md`, which appeared from that
task). No source file, architecture document, earlier report, STATUS, ROADMAP, BACKLOG or workflow
file was edited.

| Resource created by this task | Disposal |
|---|---|
| Database `gymapp_pi007_devverify` | **dropped**; `pg_database` back to its prior nine entries |
| `pnpm start` server on :3000 | **stopped**; port confirmed free |
| Docker container `gym-app-db-1` | **left running** — up 19 hours before this task began, not created by it |
| `.next` | rebuilt against the tree at hand; gitignored derived artifact, nothing was running on :3000 at the time |
| Probe scripts | session scratchpad only |

The shared dev database `gymapp` was never targeted and was re-checked at the end in its prior state
(1 user, 0 recovery entries). No production access.

---

## 9. What closing this needs

1. Fix **B-1** (§3) — stop History converting a non-empty unparseable draft into a persisted `null`,
   without moving range validation client-side.
2. Fix **M-1** (§4.2) — widen the invalid-draft copy to cover unparseable input.
3. Add the **L-1** regression test; **L-2**'s two tests are recommended alongside it.
4. Re-run the four affected specs plus the unit suite; the full Playwright suite once, since B-1's fix
   touches a shared save path.
5. Physical iPhone acceptance, after deployment, per §7.

---

REVISION REQUIRED
