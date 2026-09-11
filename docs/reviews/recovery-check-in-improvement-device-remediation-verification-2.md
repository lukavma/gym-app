# PI-007 — Recovery check-in device remediation: independent reverification (2)

**Date:** 2026-09-11
**Verified document:** [recovery-check-in-improvement-device-remediation.md](recovery-check-in-improvement-device-remediation.md) — revision 2
**Closing:** [recovery-check-in-improvement-device-remediation-verification.md](recovery-check-in-improvement-device-remediation-verification.md) — B-1 (BLOCKER), M-1 (MEDIUM), L-1…L-3
**Tree:** `HEAD` = `c2d98c8`, working tree uncommitted; unchanged by this task except for this file (§7)
**Scope:** targeted reverification of the corrections, plus confirmation that the previously accepted behaviour survives them. Not a new architecture review; the owner's superseding device decision is not reopened. No source or earlier report edited. No commit, push, staging, deployment or production access.

---

## 1. Verdict

**All five findings are closed.** Every correction matches what the previous verification required,
and each was confirmed against the running application rather than against the report's account of
it. The blocker in particular was re-checked **at the network level** — not merely by reading back
stored values — because "sends no PATCH" is the claim that matters.

| # | Previous severity | Disposition |
|---|---|---|
| **B-1** | BLOCKER | **CLOSED** — §2. History now blocks the save, sends **zero** requests, preserves the draft and the stored value; correcting the draft saves; deliberate emptying still clears |
| **M-1** | MEDIUM | **CLOSED** — §3. Copy widened and rendered identically on both surfaces |
| **L-1** | LOW | **CLOSED** — §4.1. The new regression test genuinely detects the original defect |
| **L-2** | LOW | **CLOSED** — §4.2. A-4b [NC] and A-2b added, both meaningful |
| **L-3** | LOW | **CLOSED** — §5. Report wording now matches the diff exactly (1 insertion, 1 deletion) |

Two non-blocking observations are recorded in §6. Neither is attributable to this remediation and
neither blocks deployment; **O-1** is a pre-existing flake in a test this change never touched, which
is worth the owner's attention only because it sits inside the CI gate.

Physical iPhone acceptance remains pending after deployment (§6.3).

---

## 2. B-1 — CLOSED

### The fix, as implemented

The correction is exactly the narrow one the previous verification asked for, and it is factored
better than required — the condition was extracted into a shared predicate rather than duplicated:

```ts
// src/ui/recovery/SleepHoursField.tsx
export function isUnparseableSleepHoursDraft(value: number | null, draft: string): boolean {
  return draft !== "" && value === null;
}
```

`sleepHoursError` now delegates to it (Today's behaviour is bit-for-bit unchanged), and
[RecoveryHistoryList.tsx](../../src/ui/recovery/RecoveryHistoryList.tsx) retains the draft it was
previously discarding — `sleepHoursDraft` state initialised from `entry.sleepHours`, fed by the
two-argument `onChange` it already received — and checks the predicate at the top of `EditRow.save()`,
**before** the at-least-one-metric guard. Range and precision are deliberately absent from that
check, which is what keeps History's numeric validation server-side.

### Reproduction — network level

A stored value plus a second metric, with every mutating request to `/api/recovery*` recorded:

```
seed  POST /api/recovery { date: "2026-03-10", sleepHours: 8, soreness: 2 }
      /recovery → row → Edit   (input prefills "8")

draft ","      → error "Enter sleep hours as a number between 0 and 24, to at most 2 decimals."
                 input still shows ","      mutating requests: []
draft "."      → same error,  input still ".",      mutating requests: []
draft "1.2.3"  → same error,  input still "1.2.3",  mutating requests: []

stored after three blocked saves: { sleepHours: 8, soreness: 2 }     ← intact
```

**Zero requests were issued** on all three attempts — no PATCH is built, let alone sent. The draft is
preserved verbatim, the row stays in edit mode, and the athlete can fix it in place.

### The three follow-on behaviours the task named

| Check | Result |
|---|---|
| **Correcting the draft subsequently saves** | `fill("6.5")` → exactly one `PATCH /api/recovery/{id}` with body `{"sleepHours":6.5,…,"soreness":2,…}` → stored `6.5` |
| **Deliberately empty input still clears** | `fill("")` → one `PATCH` with `{"sleepHours":null,…}` → stored `null`, `soreness` still `2`. The clear gesture is unaffected by the guard |
| **History's range/precision stays server-side** | `"25"` → **PATCH is sent** → server 400 → generic `Save failed.` → stored still `8`. `"7.333"` → same. The client guard is genuinely narrower than `sleepHoursError`; it never took over range validation |

That last row is the discriminating one. It confirms the fix did what the previous verification
specified — refuse to *reinterpret uninterpretable text as a deliberate clear* — without absorbing
the validation the architecture left with the server. E-4 [NC] still passes unchanged, and the unit
suite pins `isUnparseableSleepHoursDraft(25, "25") === false` directly.

### Today, unchanged

Re-checked in state B (stored `8`, draft `","`): inline error shown, draft preserved as `","`,
nothing enqueued, stored value still `8`. Identical to revision 1's behaviour, as intended — the
predicate refactor moved no logic across the Today boundary.

### Edge the fix could plausibly have broken — checked

A stored `sleepHours: 0` is the classic truthiness trap for a new draft-tracking initialiser.
`EditRow`'s is `entry.sleepHours !== null ? String(entry.sleepHours) : ""`, so `0` prefills as
`"0"`, the predicate returns `false`, and an unchanged save round-trips: one PATCH, stored `0`
preserved. Confirmed end to end.

---

## 3. M-1 — CLOSED

`sleepHoursRangeError` is now:

> Enter sleep hours **as a number** between 0 and 24, to at most 2 decimals.

One shared constant in [copy.ts](../../src/ui/recovery/copy.ts), so both call sites move together.
Read back from the live DOM: Today's card and History's edit row both render exactly that string for
a `","` draft. The added clause is what makes the message describe the unparseable case rather than
only the two constraints such input does not violate.

The report's §7 discloses that the first full-suite run after this change failed because four
hardcoded copies of the **old** string remained in `recoveryCheckIn.spec.ts` (E-3 ×3, E-4 ×1), and
that all four were updated. Verified in the diff: all four now assert the new string, and E-4's
`toHaveCount(0)` assertion — which would otherwise have passed vacuously against a string that no
longer exists — was updated too. That is the correct handling of the one genuinely dangerous
assertion in that set.

---

## 4. L-1 and L-2 — CLOSED

### 4.1 L-1 — the History regression test detects the original defect

`phase7Remediation.spec.ts:404` is a real control, not a restatement. On a stored-`8`-plus-soreness
fixture it loops `","`, `"."`, `"1.2.3"`, and for each asserts the error is visible, the input still
holds the typed draft, and the input is still visible; then reads `/api/recovery` mid-test and
asserts `sleepHours` is **still 8** — which is precisely the assertion that fails on the pre-fix
code, where the value became `null`. It then proves the correction path (`6.5` saves) and that
deliberate emptying still clears, before cleaning up.

I confirmed it discriminates by construction: the mid-test `expect(…sleepHours).toBe(8)` is exactly
the value the original defect destroyed, and §2's request recording shows the block happens before
any network call.

### 4.2 L-2 — both behaviours now pinned

- **A-4b [NC]** — an A-4-shaped stale-read race in which the field is `click()`ed and `Tab`bed away
  from but never typed into. An out-of-band row with `sleepHours: 6` must survive the untouched save.
  Neither `click` nor `Tab` produces an `input` event, so `onChange` — and therefore
  `setSleepHoursTouched(true)` — never fires. This is the [NC]-grade control the previous
  verification asked for: a future refactor firing `onChange` on focus would break state A's omission
  rule, and without this test every other assertion would stay green.
- **A-2b** — entering `0` through the real UI: summary reads `Logged today: Sleep 0h`, stored value
  is `0`. Complements the `sleepHoursError(0, "0")` unit pin with the end-to-end path.

Both pass, and both reproduce the probe results from the previous verification.

---

## 5. L-3 and report accuracy — CLOSED

`RecoveryCheckIn.tsx`'s diff against `c2d98c8` is `1 1` (one insertion, one deletion) — a single
comment line. The report now says "one stale comment … (`git diff c2d98c8` shows a single changed
line)" in §2 and records the correction in §0. Matches.

I re-derived the rest of the report's §2 manifest from `git status`/`git diff` rather than reading
it: **4 source files** (`SleepHoursField.tsx`, `RecoveryCheckIn.tsx`, `RecoveryHistoryList.tsx`,
`copy.ts`) and **4 test files** (three E2E specs plus the new unit file) — no more, no less.
`NullableSliderField.tsx`, `src/sync/dailyLogs.ts`, every server/API/domain file, `layout.tsx` and
`next.config.ts` are untouched, as claimed. `ClearButton`/`UnsetField` are **not** left as dead
exports: both are still used by `NullableSliderField` itself for the 1–5 sliders, which keep their
Set/Clear interaction per scope.

§9's preservation claims are accurate: my own verification document is byte-unchanged and still ends
in `REVISION REQUIRED`, the historical Recovery reports are untouched, and revision 1's task-owned
database is gone from `pg_database`.

---

## 6. Observations — non-blocking

### 6.1 O-1 (LOW, pre-existing, not attributable to this change) — a flaky unknown-offline test

Across four serial runs of the four affected specs, one test failed twice:

```
offline-bodyweight-recovery.spec.ts:137
  "no live read, no same-day cache: the touched-only merge form saves and converges
   on reconnect without ever fabricating a full row"

Error: expect(locator).toBeVisible() failed
Locator: getByText(/Offline — can.t verify today.s check-in yet/)
Timeout: 5000ms — element(s) not found
```

It is **not touched by either revision** of this remediation: all four hunks in that file's diff sit
at lines 210, 258, 299 and 343 (C-1, C-2, C-5, C-6), and this test is the pre-existing readiness-only
case with no sleep-hours interaction at all. In isolation it is stable — 5/5 with `--repeat-each=5`,
and the whole spec 39/39 with `--repeat-each=3` — so it is load/timing-sensitive under a long serial
run (a `context.setOffline(true)` + `page.reload()` followed by a 5 s text wait, dependent on service
worker readiness), not deterministically broken.

This is the same class the remediation report itself diagnosed for C-5 in its §7, and its diagnosis
was correct. Recording it here because `offline-bodyweight-recovery.spec.ts` is inside CI's
`test:e2e:offline` gate, so the flake can redden CI on an unrelated change. **It is not a reason to
hold this remediation** — worth a separate, bounded look at that assertion's wait strategy.

### 6.2 O-2 (trivial) — one internally inconsistent count in the report

§2 describes the unit additions as "+4 tests" while §7 says "6 new". Both are defensible: the block
declares four `it`s, one of which is an `it.each` over three drafts, yielding six cases. The observed
unit total (1204 → **1210**) confirms six. No action needed beyond awareness.

### 6.3 Not established by any check here

No browser check in this reverification — or in the remediation's own evidence — establishes physical
iOS Safari behaviour. Chromium proves the component never unmounts, that focus is retained on the
same DOM node, that the computed font size is 16px and that the viewport imposes no zoom restriction;
it cannot prove that iOS therefore keeps the keyboard open or declines to auto-zoom. The report's own
§6 acknowledgement of this is accurate. **Physical iPhone acceptance remains pending after
deployment.**

---

## 7. Accepted behaviour and A/B/C/D invariants — still intact

The concern with a fix that adds per-keystroke state to `EditRow` is that it could reintroduce the
remount the whole remediation exists to prevent. It does not. Re-checked on **both** call sites by
tagging the live `<input>` with a `dataset` marker *before* select-all + Backspace:

| Surface | Same DOM node | Empty | Focused | Computed font | Types after, no re-tap |
|---|---|---|---|---|---|
| Today (edit form) | yes | yes | yes | 16px | `7.5` |
| History (`EditRow`) | yes | yes | yes | 16px | `7.5` |

Viewport meta read from the live page is unchanged: `width=device-width, initial-scale=1,
viewport-fit=cover` — no `maximum-scale`, no `user-scalable`.

The four states are intact, evidenced by the green affected-spec runs:

- **A** — A-1, A-2, A-2b, A-3b, A-4 [NC] (stale-read race), A-4b [NC] (focus-only) all pass.
- **B** — B-1 [NC] through B-5 [NC] pass, including the owner's select-all-and-delete reproduction
  and the at-least-one-metric guard.
- **C** — C-1, C-2 [NC], C-5, C-6 pass, and again 3× under `--repeat-each`.
- **D** — D-1 through D-4 [NC] pass; the unknown-timezone cases are untouched and pass.

---

## 8. Evidence

### Executed by this reverification

Environment: a task-owned disposable database `gymapp_pi007_rv2` created inside the already-running
`gym-app-db-1` container, then the documented CI bootstrap order — `db:migrate` → `db:seed` →
`pnpm build` → `pnpm start` on :3000 → `smoke.spec.ts` → `db:seed` → `tsx tests/e2e/seed.ts`.
Targeting was confirmed before any destructive spec ran (`/setup` answered 200 with the setup form on
a database holding 0 users).

| Command | Result |
|---|---|
| `pnpm lint` | clean, exit 0 |
| `pnpm typecheck` | clean, exit 0 |
| `pnpm format:check` | `All matched files use Prettier code style!` |
| `pnpm test:unit` | **1210 passed** / 84 files, 0 failed — reproduces the report's figure exactly |
| `pnpm build` | succeeded |
| affected specs (`recoveryCheckIn` + `phase7Remediation` + `offline-bodyweight-recovery` + `bodyweightRecovery`), run 1 | 54 passed, 1 failed (identity not captured) |
| run 2 | **55 passed**, 0 failed |
| run 3 | **55 passed**, 0 failed |
| run 4 | 54 passed, 1 failed — captured: the O-1 flake at `offline-bodyweight-recovery.spec.ts:137` |
| `offline-bodyweight-recovery.spec.ts --repeat-each=3` | **39 passed**, 0 failed |
| that test alone, `--repeat-each=5` | **5 passed**, 0 failed |

Six browser probes (R1–R6) were run against the live production build with `playwright-core`, writing
no repository file: R1/R1b/R1c (History unparseable → no request, correction, deliberate clear), R2
(range/precision still server-side), R3 (Today unchanged), R4 (DOM-node identity and font size on both
surfaces), R5 (stored `0` edge), R6 (copy rendered on both surfaces). Outputs are quoted inline above.

Per the task's instruction, broad testing was not repeated: `pnpm test:integration` was not re-run
(the correction touches no domain, server or schema file, and revision 1 established that baseline),
and the report's own full-suite run — 154 passed, 0 failed, 0 flaky on its second pass — is used as
the full-suite evidence. The four affected specs were run directly here instead, four times.

### Inherited, not reproduced

- The report's revision-1 numbers (§7's superseded table) and its `pnpm test:integration` run.
- Its full-suite figures; my four runs of the affected subset are consistent with them, including the
  same flake class the report disclosed.

---

## 9. Preservation and cleanup

`git status --porcelain` captured before and after is **identical except for this file**. `HEAD`
stayed at `c2d98c8`. No source file, earlier report, architecture document, STATUS, ROADMAP, BACKLOG
or workflow file was edited — including the previous verification document, whose findings are closed
here rather than in it.

All concurrent workflow work is intact and untouched: `README.md`, `docs/evidence/**`,
`docs/research-notes/**`, `docs/process/**`, `playwright.config.ts`, `tests/e2e/seed.ts`, and the
`docs/reviews/repository-agent-workflow-*.md` set.

| Resource created by this task | Disposal |
|---|---|
| Database `gymapp_pi007_rv2` | **dropped**; `pg_database` back to its prior nine entries |
| `pnpm start` server on :3000 | **stopped**; port confirmed free |
| Docker container `gym-app-db-1` | **left running** — up before this task began, not created by it |
| `.next` | rebuilt against the tree at hand; gitignored derived artifact, nothing else was on :3000 |
| `test-results/` | Playwright's gitignored artifact dir; the failed run's trace was cleared by the subsequent runs, leaving only `.last-run.json` |
| Probe scripts | session scratchpad only |

The shared dev database `gymapp` was never targeted and was re-checked at the end in its prior state
(1 user, 0 recovery entries). No production access, staging, commit, push or deployment.

---

VERIFIED — READY FOR RECOVERY REMEDIATION DEPLOYMENT
