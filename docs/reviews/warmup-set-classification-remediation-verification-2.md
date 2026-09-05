# Warm-up Set Classification — Second-Target Verification (Appendix §12 vs. V-1…V-4)

Date: 2026-09-05
Role: independent second-target verification of **§12 only** — the follow-up addendum in `docs/reviews/warmup-set-classification-remediation.md` — against **V-1 through V-4** of `docs/reviews/warmup-set-classification-remediation-verification.md`, which this verifier authored.
Reviewed state: `main` @ `7d6bc6c` with the round-2 working tree.
Scope: the already-accepted F-1 remediation is **not reopened**; §1–§11 of the remediation report are out of scope except where §12 corrects them. Nothing was remediated. Every temporary control was restored byte-identically (§8).

Identifier conventions: **V-n** are the first verification's findings. **W-n** are this verification's new findings. **M-n** are mutation controls this verification applied and reverted.

---

## 1. Verdict

# `VERIFIED WITH ONE COVERAGE GAP`

**All three code fixes are correct.** V-1, V-2 and V-3 are genuinely resolved in production code, proved independently — not by re-running the remediation's tests, but by driving the real UI through a **real browser-process relaunch**, and by reading raw `set_logs` rows out of PostgreSQL. V-4's corrections are accurate on two of three items.

**One finding is material: W-1.** The V-2 regression test **cannot detect** a broken `SetRow` checkbox seed. Seeding it `useState(false)` instead of `useState(set.isWarmup)` passes all six tests in `warmupSetClassification.spec.ts` — while silently rewriting a warm-up set into a work set in the database on a weight-only edit. Confirmed end-to-end: `is_warmup` went `t → f` on a set the athlete never intended to reclassify. **The production code is correct; the test that guards it is not.** This is a coverage defect, not a behaviour defect, and it needs a two-line test change, not a code change.

| ID | Severity | Finding |
| --- | --- | --- |
| **W-1** | Medium | V-2's regression test is vacuous on the seeding path — a `useState(false)` seed passes 6/6 while silently corrupting `is_warmup` in the database |
| **W-2** | Low | §12's V-4 item 2 claim "The sentence is now accurate" is measurably still false in a narrow, data-affecting case |
| **W-3** | Low | §12's positional-index rationale names one at-risk spec; three specs carry that exposure, and only one was re-run as stated |
| **W-4** | Nitpick | §12's V-4 item 1 says "2 of 4 e2e **assertions**"; it was 2 of 4 **tests** |

Every count §12 claims reproduces exactly: typecheck / typecheck:sw / lint clean, `format:check` clean but for the pre-existing `sync/service.ts` CRLF warning, unit **557/557**, integration **301/301** + 15 pre-existing skips, full Playwright **96/96**.

---

## 2. V-1 — remount/reload toggle continuity: **CORRECT**

**The fix.** `useState(false)` → `useState(() => deriveWarmupToggleDefault(exercise))`, reading `exercise.sets.at(-1)?.isWarmup ?? false` (`ExerciseCard.tsx:49-51, 104`). No new persisted field, no sync-contract change — it re-reads data already synced and already rendered.

### 2.1 Proved independently, in both directions, across a real process relaunch

The remediation's own test uses `page.reload()`. V-1 named the PWA relaunch case, which is stronger: a new browser **process** with only IndexedDB surviving. An independent probe built a two-exercise session, killed the browser process, relaunched with a persistent profile, and measured:

| Assertion | Result |
| --- | --- |
| Exercise B's toggle is off while A's is on (same page, no reload) | **PASS** — false |
| A toggle on before relaunch | **PASS** — true |
| B toggle off before relaunch | **PASS** — false |
| **A toggle survives a PROCESS RELAUNCH (on)** | **PASS** — true |
| **B toggle survives a PROCESS RELAUNCH (off)** | **PASS** — false |
| A's post-relaunch set logged as warm-up (`W · 67.5 kg × 5 @ RIR 3`) | **PASS** |
| B's post-relaunch set logged as work (no `W ·`) | **PASS** |

Both directions hold, and they hold across a process boundary, not merely a soft reload.

### 2.2 Per-exercise isolation: proved on the case the remediation's test cannot distinguish

`warmupSetClassification.spec.ts:159-161` proves isolation by adding a **fresh ad-hoc exercise with zero sets**, which returns `false` from any implementation — including a global one. The probe instead gave **both** exercises sets, one ending warm-up and one ending work, then relaunched: A came back on, B came back off. That distinguishes per-exercise derivation from a session-global flag; the remediation's test does not. Its assertion is not wrong, only weaker than it reads.

### 2.3 Mutation controls

| Control | Expected | Result |
| --- | --- | --- |
| **M-1** — revert to `useState(false)` | V-1 test fails | **FAILED as required** — `Expected: checked / Received: unchecked` at the reload assertion, the exact pre-fix symptom |
| **M-2** — `useState(() => exercise.sets.length > 0)` (a lazy "always on after a reload" fix) | V-1's **negative control** fails | **FAILED as required** — `Expected: not checked / Received: checked` at line 150 |

M-2 matters: it confirms the V-1 test's negative control is real. A fix that satisfied the first assertion for the wrong reason is caught.

---

## 3. V-2 — in-session reclassification: **CORRECT code, insufficient test (W-1)**

**The fix.** `SetRow`'s `onEdit` patch type gained `isWarmup?: boolean`; the edit form gained a checkbox seeded `useState(set.isWarmup)`, threaded into `onEdit({...})` (`ExerciseCard.tsx:300-306, 313, 360, 381-390`).

### 3.1 No field corruption — proved at the database, not the DOM

The remediation's test asserts rendered text (`W · 92.5 kg × 5`), which cannot see `rir`, `set_number` or `notes`. The probe logged sets **with RIR**, flipped set 1 warm-up → work → warm-up through two in-session `SetRow` edits, completed the workout, and read the raw rows:

```
        name        | set_number | is_warmup | weight_kg | reps | rir | notes
--------------------+------------+-----------+-----------+------+-----+--------
 Ab Crunch Machine  |          1 | f         |     31.50 |    9 |   2 | <null>
 Ab Crunch Machine  |          2 | f         |     36.50 |    9 |   2 | <null>
 Barbell Back Squat |          1 | t         |     42.50 |    8 |   4 | <null>   <- flipped twice
 Barbell Back Squat |          2 | t         |     57.50 |    6 |   3 | <null>
 Barbell Back Squat |          3 | t         |     67.50 |    5 |   3 | <null>
```

Set 1 returned to `is_warmup = t` with `42.50 / 8 / RIR 4 / set_number 1 / notes null` intact. **No field corruption, no renumbering, no RIR loss** across two round-trip reclassifications. The `editSet` → `Object.assign` → `setLogFullRowOp` full-row path holds.

### 3.2 Placement rationale: correct, and verified

`SetRow`'s inputs carry no aria-labels and are addressed positionally by index. The checkbox is placed **after** the weight/reps/RIR div, so input order stays weight(0), reps(1), rir(2), checkbox(3). Indices 0 and 1 are unshifted; confirmed green in the 96/96 run. §12's rationale is materially correct — but incomplete, see **W-3**.

### 3.3 W-1 — the V-2 test cannot detect a broken seed

**Mutation M-4:** seed the `SetRow` checkbox `useState(false)` instead of `useState(set.isWarmup)`. Everything else untouched.

**Result: 6 of 6 tests passed.** The mutation is invisible to the suite.

**Root cause.** `SetRow` is keyed `key={set.id}`, so re-opening the editor on the same row **does not remount it** — the local `isWarmup` state survives from the previous Save. The V-2 test's flow is: log a work set (stored `false` — the seed is coincidentally right) → flip to warm-up → re-open the *same mounted instance* (state carried over, not re-seeded) → flip back. The three assertions that read as "the editor seeds from the stored value" (lines 189, 198, 206) are therefore **vacuous**: they pass on within-instance carryover. The test never opens the editor on a **fresh mount** whose stored value is `true` — which is exactly the case V-2 exists to serve.

**The consequence is real, not theoretical.** A dedicated probe under M-4: log a warm-up set, relaunch the browser process, open that row's editor, change **only** the weight, save.

```
logged as:                        W · 47.5 kg × 7 @ RIR 5
editor shows 'Warm-up set' as:    UNCHECKED        <- must be CHECKED
row now renders as:               50 kg × 7 @ RIR 5  <- the W · marker is gone
```

and in PostgreSQL:

```
 set_number | is_warmup | weight_kg | reps | rir
------------+-----------+-----------+------+-----
          1 | f         |     50.00 |    7 |   5
```

A warm-up set was silently reclassified as a work set by an edit that touched only the weight — feeding carry-forward, `repShortfall` and volume with a corrupted row, which is the F-1 defect class itself. The whole suite stayed green.

The same probe's assertion **"SetRow edit form seeds from the stored value"** returned `false` under M-4 and `true` on the shipped code, so the shipped behaviour is right — only the guard is missing.

**Fix (not applied):** add a remount between the flip and the re-open in the V-2 test — a `page.reload()` after the first Save, before line 196 — which makes the seeding assertions load-bearing. Two lines.

### 3.4 Mutation controls

| Control | Expected | Result |
| --- | --- | --- |
| **M-3** — drop `isWarmup` from `SetRow`'s `onEdit({...})` | V-2 test fails | **FAILED as required** — `W · 90 kg × 5` never appears |
| **M-4** — seed `useState(false)` instead of `set.isWarmup` | V-2 test should fail | **SURVIVED** — see W-1 |

---

## 4. V-3 — checklist locator: **CORRECT and complete**

**The fix.** `data-testid="warmup-checklist"` on the checklist `<ul>` (`WarmupCard.tsx:134`); `warmupChecklistCheckboxes(page)` is now `page.getByTestId("warmup-checklist").getByRole("checkbox")` (`warmupWorkout.spec.ts:177-179`).

### 4.1 Every assertion audited — no page-wide or DOM-order dependency survives

All **14** checkbox references in `warmupWorkout.spec.ts` route through the scoped helper, including `tickWarmupItem` (`:182`), which the first verification flagged as the carrier of nine undocumented DOM-order dependencies:

```
:182  warmupChecklistCheckboxes(page).nth(index).click()      (tickWarmupItem)
:313 :314 :315 :337 :371 :397 :421   .nth(n) assertions
:364 :391 :396                       absolute-count assertions
:698 :720 :723 :781                  offline / cross-device
```

A repository-wide grep confirms **zero** remaining `page.getByRole("checkbox")` in any spec — the single textual match is inside an explanatory comment. Because the indices are now resolved *inside* the checklist `<ul>`, `.nth(n)` no longer depends on the warm-up card rendering before the exercises list. The dependency the first verification recorded is genuinely gone, not merely relocated.

This also disarms the trap V-3 predicted: V-2's own change put a checkbox inside `ul.flex.flex-col.gap-1` — precisely the element the old CSS selector was matching. Had the selector not been replaced, V-2 would have re-broken those assertions.

### 4.2 Mutation controls

| Control | Expected | Result |
| --- | --- | --- |
| **M-5** — remove `data-testid` from `WarmupCard` | the spec fails loudly | **FAILED as required** — **10 of 14** tests fail; the testid is load-bearing across the whole file, matching the source audit |
| **M-6** — break auto-collapse (`{expanded && …}` → `{(expanded \|\| true) && …}`) with the testid in place | the scoped assertion still catches it | **FAILED as required** — `getByTestId('warmup-checklist').getByRole('checkbox')` · `Expected: 0 / Received: 3` |

M-6 is the decisive one: **exactly 3** — the checklist's own items, counting neither the set-entry control nor the new `SetRow` control on the same page. The locator retains full detection power while being immune to unrelated checkboxes. It is now correct **by construction**, not by the absence of a collision.

`data-testid` is inert markup; no Warm-up Routines behaviour changed. §12's claim on that point is accurate.

---

## 5. V-4 — are the documentation corrections accurate?

| Item | Claim | Verdict |
| --- | --- | --- |
| **1** | §6's headline negative control exercises the store's pre-existing `?? false` default and "passes unchanged even with the entire production diff reverted"; the correct evidence is the first verification's mutation testing | **ACCURATE.** `tests/unit/warmupSetClassification.test.ts` imports only `@/sync/activeSession` — no UI module — so no UI change can affect it. See **W-4** for a wording nitpick |
| **2** | §4's "stays on until the athlete explicitly turns it off themselves" was false across a remount; "The sentence is now accurate" | **OVERSTATED** — see **W-2** |
| **3** | §6's outcome 11 claimed workout-screen reload coverage that no test asserted; it is now asserted | **ACCURATE.** `warmupSetClassification.spec.ts:138-141` reloads `/today/workout` and asserts both the toggle state and a `W ·` marker rendered after the reload. (It proves the pre-reload marker survived only indirectly — the toggle can only be checked if the stored flag survived — but the claim as written holds) |

### 5.1 W-2 — item 2 is still not literally true

The V-1 fix derives from the last **logged** set. A toggle state the athlete has set but not yet committed to a set is persisted nowhere, so it does not survive a remount. Measured on the shipped code:

```
case 1 — checked, zero sets logged, before reload: true
case 1 — after reload:                             false
case 2 — checked after a work set, before reload:  true
case 2 — after reload:                             false
case 2 — the set the athlete believed was a warm-up logged as: 40 kg × 12
```

Case 2 is the material one: after a work set the athlete checks the toggle intending a back-off or second ramp, the app is reloaded before they press Log, and the next set is silently recorded as a work set — the same failure mode as V-1, in a narrower window (it requires a remount inside the gap between checking the box and logging).

This is **much narrower** than the original V-1, which fired mid-ramp on the common path, and no already-logged data is at risk. It does not warrant reopening the fix. It does mean §12's sentence should read "it now survives a remount whenever the athlete has already logged at least one set at that classification", not "the sentence is now accurate".

### 5.2 W-3 — the positional-index rationale under-counts the exposed specs

§12's V-2 entry names `tests/e2e/offline-set-edit-delete.spec.ts` as the reason for placing the checkbox last, and its verification-run list re-ran that spec alone. Two further specs address the same `SetRow` edit inputs positionally and carry identical exposure:

- `tests/e2e/reconnect-batch-idempotence.spec.ts:83` — `editing.locator("input").nth(0).fill("101")`
- `tests/e2e/transient-failure-fifo.spec.ts:75` — `row.locator("input").nth(0).fill("65")`

The placement decision was correct, so all three pass (confirmed in the 96/96 full run). The rationale is right; the stated evidence is one third of it. Worth naming all three where the reasoning is recorded, since that comment is what a future editor will read before moving the control.

### 5.3 W-4 — wording

§12's V-4 item 1 states the first verification found "2 of 4 e2e **assertions**" failing. It was 2 of 4 **tests** (and 1 of 4 for `HistoryDetail`). The counts are right; the noun is not.

---

## 6. Verification runs

All on the restored, byte-identical tree unless stated.

| Check | Result | §12 claimed |
| --- | --- | --- |
| `pnpm typecheck` | clean | clean ✓ |
| `pnpm typecheck:sw` | clean | clean ✓ |
| `pnpm lint` | clean | clean ✓ |
| `pnpm format:check` | one pre-existing `src/server/sync/service.ts` CRLF warning, untouched by this diff | same ✓ |
| `pnpm test:unit` | **557/557**, 43 files | 557/557 ✓ |
| `pnpm test:integration` | **301/301**, 15 skipped, 22 run + 4 skipped files | 301/301 + 15 ✓ |
| `warmupSetClassification.spec.ts` | **6/6** | 6/6 ✓ |
| `warmupWorkout.spec.ts` | **14/14** | 14/14 ✓ |
| Full Playwright, all 30 specs | **96/96** (run twice: baseline and post-restoration) | 96/96 ✓ |

Environment: the repository's own local Docker PostgreSQL 16 (`gym-app-db-1`, `localhost:5432`) per `CLAUDE.md`, a production build (`pnpm build && pnpm start`), Chromium. Production was never accessed. `DATABASE_URL` must be exported in the **runner's** environment for `muscleTaxonomyV2.spec.ts` and `volume.spec.ts`; without it those three tests error on environment, not on code — a harness detail, not a defect, and the same one noted in the first verification.

---

## 7. What was checked and found sound

- The three fixes are additive and narrow: `git diff --stat -- src/ tests/` is 4 files, 122 insertions, 20 deletions across both rounds combined.
- No schema, migration, sync schema, entity type, server sync semantics, progression algorithm, volume algorithm, recommendation-decision semantics, or Warm-up Routines behaviour was changed. `data-testid` is inert.
- §12 appends rather than rewriting §1–§11, and says so — the superseded counts above it are left in place with corrections recorded below. That is the right choice for an audit trail.
- §12 discloses its own iteration failure (an `editingRow` helper bug scoped through `card.getByRole` instead of `card.page().getByRole`). The shipped helper at `warmupSetClassification.spec.ts:39-43` uses the corrected idiom, matching `offline-set-edit-delete.spec.ts:38-42`.
- The first verification's report was not modified; it is byte-identical to what was written.

---

## 8. Cleanup and working-tree state

Six mutation controls (M-1…M-6) were applied one at a time, each with a full rebuild, and reverted from byte copies. SHA-256 before and after:

| File | Hash (identical before and after) |
| --- | --- |
| `src/ui/workout/ExerciseCard.tsx` | `7D360143…458C` |
| `src/ui/workout/WarmupCard.tsx` | `54D85B63…A186` |
| `src/ui/history/HistoryDetail.tsx` | `688E856E…8C76` |
| `tests/e2e/warmupWorkout.spec.ts` | `3D824D38…2BBB` |
| `tests/e2e/warmupSetClassification.spec.ts` | `42FFA1A1…4AFA` |

`git diff --stat -- src/ tests/` is again exactly `4 files changed, 122 insertions(+), 20 deletions(-)`, and the full suite is green on the restored tree. Every unrelated and concurrent change was left untouched, including files that appeared during this session from concurrent work (`docs/reviews/estimated-1rm-load-translation-architecture-revision.md`, `…-revision-verification.md`, `…-revision-verification-2.md`, `docs/reviews/repository-agent-workflow-review.md`) and the user-owned `CLAUDE.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`.

All probe scripts were written to the session scratchpad, never to the repository. No background server process remains. Nothing was committed, pushed, or deployed.

**Disclosed dev-database side effects.** Playwright runs and UI probes create sessions in the local dev PostgreSQL, as every e2e run against it does by design. Three probe sessions were deliberately completed to read their raw rows: `01a071d1-1182-7d37-b71f-3b43bebcceed` (§3.1 integrity evidence), `01a0722f-f0ae-71f6-a3d6-b41f87639c6a` and `01a07230-bb34-7eb7-b08a-0899ef043b7b` (§3.3, produced **under mutation M-4** — the second contains a deliberately corrupted row and should be deleted or ignored). All are safe to delete. Production was never touched.

---

## 9. Recommendation

**Accept §12.** V-1, V-2 and V-3 are correctly fixed; V-4's corrections are accurate but for one overstatement.

Before this is considered closed, one change is worth making:

1. **W-1 — required.** Add a remount (`page.reload()`) between the first Save and the re-open in the V-2 test, so its three seeding assertions stop passing on within-instance state carryover. Today a `useState(false)` seed silently corrupts `is_warmup` in the database and the suite stays green. Two lines; no production change.

Optional, documentation only:

2. **W-2** — soften §12's "The sentence is now accurate" to name the residual: the toggle survives a remount only once at least one set has been logged at that classification.
3. **W-3** — name all three positionally-addressing specs in the `SetRow` placement comment, not one.
4. **W-4** — "assertions" → "tests".

Unchanged from the first verification and still open: no physical-device pass. V-1's fix is specifically about relaunch behaviour, which Chromium emulation models but a real backgrounded iOS PWA does not always match — an on-device run of a warm-up ramp interrupted by an app switch remains the highest-value manual check.

---

`VERIFIED WITH ONE COVERAGE GAP` — all three code fixes correct; W-1 requires a two-line test change before closure.
