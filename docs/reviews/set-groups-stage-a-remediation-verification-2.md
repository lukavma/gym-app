# Set Groups (PI-012) Stage A — residual remediation verification (V-1…V-6)

**Date:** 2026-09-13
**Tree:** `583a9ab` (dirty) — Stage A plus the residual remediation recorded in
[set-groups-stage-a-implementation.md](set-groups-stage-a-implementation.md) §13, alongside the concurrent
workflow work that lineage already lists. Tree confirmed byte-identical before and after apart from this
one new file (§4.4).
**Role:** independent verification (no implementation edits, no Stage B, no staging, no commit, no push,
no deployment, no production access — none attempted)
**Session:** `S8 | PI-012-A | Verification — Stage A residual V-1…V-6`
**Model:** claude-opus-5 (1M context)
**Under verification:** §13 of the implementation report, against
[set-groups-stage-a-remediation-verification.md](set-groups-stage-a-remediation-verification.md) §2 (V-1…V-6).
**Scope:** Stage A and Stage B remain a joint release. Nothing here authorizes a standalone Stage A
deployment or claims device acceptance.
**Verdict:** see §5.

---

## 0. Summary

Both code defects are genuinely fixed, and the fixes are better than the minimum I asked for. V-2's
predicate matches my recommended correction exactly, its comment now states the real mechanism instead of
the false one, and the inductive soundness argument it gives holds — I checked its load-bearing premise
(that `existingRow` is re-read per op, inside that op's own transaction) against the code rather than
taking it on trust. V-1 returns `prescribed: null` as specified. Both carry discriminating regression
tests, and I re-ran my own reproductions plus my own source-level negative control to confirm the tests
detect the original defects rather than merely passing.

V-3 is **half done, and the half that is missing is the finding itself.** The mechanism — dead-letter
diagnostics plus real browser coverage — is implemented well and I verified it passes in a browser. But
V-3 was a *report-accuracy* finding, and §12.3.3 is **not corrected**. Every sentence §13.1's V-3 row
claims to have removed or fixed is still there verbatim: the false "Set Groups' own 5 tests passed in every
one of the five full runs", the "established as pre-existing/environmental" framing, the "consistent with
load-sensitive timing margins" causal claim, and the C-5 mislabelling. The word "unresolved" appears
nowhere in §12.3.3. The row even points the reader to a correction block that does not exist ("see
immediately below the un-corrected original text in that section"). A reader who opens the section holding
the E2E evidence gets the discredited account, with the disposition table elsewhere asserting otherwise.

§12.1's **L-3 row** has the same problem in miniature: it still justifies the bypass as *"safe for batch
convergence — ops apply strictly in order in separate transactions, so a later explicit write still wins,
and replay is deterministic"* — the exact claim V-2 disproved and the code no longer relies on.

V-4, V-5 and V-6 are correctly and accurately closed.

One factual gain worth recording: across two verification sessions I have now reproduced
`offline-bodyweight-recovery.spec.ts`'s flakiness three times on three different tests in that file, each
a visibility timeout, each passing in isolation. That independently substantiates "pre-existing,
load-sensitive, unrelated" **for that spec** — and makes it clearer still that the same explanation cannot
be transferred to the `setGroupsOffline.spec.ts` dead-letter observation, which remains unreproduced after
12 executions across both sessions.

---

## 1. V-1…V-6 dispositions

| ID | Disposition | Basis |
|---|---|---|
| **V-2** | **CLOSED.** | [`service.ts:1168-1176`](../../src/server/sync/service.ts#L1168-L1176) implements exactly the predicate I specified: `effectiveIsWarmup === true && !laterFields?.has("isWarmup") && !laterFields?.has("groupKey")`. The misleading comment is replaced by one that states the actual mechanism. **The inductive argument is sound, and I checked its premise:** `applySetLogUpsert` opens its own `db.transaction` per op and `selectExisting()` is called inside it, so a later op's `existingRow` read reflects every earlier op's committed write — which is what makes the last toucher's decision correct. **My own reproduction** (the unchanged probe from my previous verification) now passes 4/4 where it previously failed 2: replay converges (`{isWarmup:false, groupKey:"qohji2y2"}` both runs) and the batch's legitimate `groupKey` survives, with both pre-existing controls still green. See §2 for the four regression tests and my independent negative control. |
| **V-1** | **CLOSED.** | [`groupEvaluation.ts:113-130`](../../src/domain/progression/groupEvaluation.ts#L113-L130) now returns `{ ...entry, prescribed: null, workSets: [] }` for a grouped historical entry with no matching key, with a comment explaining why `entryQualifiesForStreak`'s own `!entry.prescribed` check — not the incidental empty-array guard — is the correct reason the entry never counts. My NC-7 probe, which previously failed on this branch, now passes. The new test (`groupEvaluation.test.ts`, 27/27 — I ran it) asserts **both** `prescribed` is `null` and `workSets` is `[]`, and its comment records that the original NC-7 test only covered the legacy bridge path. NC-7 now covers the branch. |
| **V-3** | **NOT CLOSED.** Mechanism done; the report correction that was the finding is missing. | **Done and verified:** `readOutboxDeadLetters` reads only `status`, `entity` and `deadReason` — no payload, no credential, no header — and `waitForOutboxDrained` keeps the identical assertion (`expect.poll(...).toEqual({pending:0, dead:0})`, same timeout, same retries), augments **only** the failure path, re-throws the original error untouched when there are no dead letters (`if (deadLetters.length === 0) throw err;`), and wraps the diagnostic read in `.catch(() => [])` so it can never mask the real failure. Browser coverage is meaningful and **passes**: `dead-letter.spec.ts:393` drives the file's own deterministic `invalid_measurement` rejection, polls until the op's status is genuinely `dead`, then asserts the thrown message contains both `setLog` and `invalid_measurement` — confirmed in my own run (7.7 s). **Missing:** §12.3.3 is untouched. See §3.1. |
| **V-4** | **CLOSED.** | §12.1's M-4 row now states plainly that it previously claimed a direct run while §12.3.3 said otherwise — *"a genuine internal contradiction, not a wording nuance"* — and that the 17-file coverage is **inherited** from the full `pnpm test:e2e` run. §12.3.3's own "re-running the 17-file subset separately would exercise strictly less" sentence is consistent with that, so no competing claim remains on this point. The distinction between executed and inherited is now drawn correctly. |
| **V-5** | **CLOSED.** | §12.1's M-5 row now names the six files my review actually found (`PrescriptionForm.tsx`, both E2E specs, `setGroups.integration.test.ts`, `activeSessionGroups.test.ts`, `groupEvaluation.test.ts`), states explicitly which three it had wrongly included and which three it had omitted, and replaces the chronology with the accurate one: §6.2's green claim *"was simply incorrect when it was written, not correct-then-drifted by this pass's own later edits."* That matches what I measured on 2026-09-12. `format:check` green on the full tree (I re-ran it). |
| **V-6** | **CLOSED — all three real errors, and the fourth correctly left alone.** | §4's heading now reads 2026-09-13 with the year correction attributed. §12.1's L-9 row now cites §12.3.3 with a note explaining that §12.3.2 is the unit/integration section. §12's header now names `docs/reviews/set-groups-architecture-evaluation.md` explicitly rather than "the review." §12.2's `evaluationTarget.ts` qualifier is unchanged, which is right — it is accurate for that pass. |

---

## 2. V-2's regression tests and negative control

**The four tests** (`tests/integration/setGroups.integration.test.ts`, new `describe("V-2 …")` block) cover
the mechanism properly, not just the headline:

1. *The review's own reproduction.* Establishes the pre-batch state `{isWarmup: true, groupKey: null}`
   explicitly, applies the conflict batch (full-row op with `isWarmup: true` + a real `groupKey`, then a
   partial op touching only `isWarmup: false`), asserts the DB row is `{isWarmup: false, groupKey:
   backoffKey}`, then replays the identical batch and asserts the row is unchanged — both halves of V-2 in
   one test, asserted against SQL rather than return values.
2. A partial edit touching neither field leaves the existing `groupKey` untouched.
3. **A later op governing only `groupKey`, never `isWarmup`** — the case the inductive argument actually
   rests on. The earlier op defers, and the later op's own (accurate, post-commit) `existingRow` read
   forces `null` over its own attempted write, so the invariant still holds even though neither op alone
   owns both facts. This is the test that makes the deferral safe rather than merely convenient, and I had
   not asked for it.
4. A later op governing both fields wins outright, with no forcing needed from the earlier op.

**Negative control — executed independently.** I backed up `src/server/sync/service.ts` byte-for-byte
(SHA-256 recorded), reverted the predicate to the pre-fix single line `effectiveIsWarmup === true`, and ran
both instruments:

```text
my probe:   FAIL  REPLAY - identical batch applied twice converges
            FAIL  FIELD CONFLICT - batch-final isWarmup=false keeps the batch's groupKey
            PASS  CONTROL - single op pairing isWarmup:true with a real groupKey clears it
            PASS  CONTROL - partial edit touching neither field leaves groupKey intact

repo suite: ×  V-2 > the review's own reproduction …            (failed)
            ✓  V-2 > partial edit touching neither field …
            ✓  V-2 > later op governing ONLY groupKey …
            ✓  V-2 > later op governing BOTH …
            Tests  1 failed | 3 passed | 25 skipped (29)
```

Then restored and re-verified: SHA-256 identical to the backup, `pnpm typecheck` exit 0, and the whole
`setGroups.integration.test.ts` file 29/29.

**Does the control meaningfully detect the defect?** Yes. The one test that fails is the one that encodes
the defect, and it fails on the right thing (`groupKey: null` instead of the batch's real key, and the two
runs disagreeing). §13.1's account of this — one failing, three passing "because they exercise scenarios
where the old and new logic happen to agree" — is accurate; I confirmed it rather than inheriting it. One
honest caveat: the discriminating power sits in a single test, so that test is the whole guard. That is
inherent to how narrow the defect is, not a flaw in the suite, but it is worth knowing before anyone
refactors that block.

---

## 3. Remaining report inconsistencies

### 3.1 §12.3.3 is not corrected — V-3's report half is outstanding

§13.1's V-3 row asserts three specific edits. None was made. Verified by direct search of the document:

| Claim in §13.1's V-3 row | Actual state of §12.3.3 |
|---|---|
| "removes the false 'passed in every one of the five full runs' sentence" | **Still present, verbatim**, at line 1091 — the only other occurrence in the document is the V-3 row quoting it |
| "now states plainly that the … failure has an **unresolved** cause" | The word **"unresolved" does not appear in §12.3.3 at all** — only in §13.1's row and §13.2 |
| "fixes the mislabelling (the reproduced flake is the touching-only-sleep-hours test, not C-5)" | **"C-5 test" still present**, at line 1083 |
| "§12.3.3 corrected in place (see immediately below the un-corrected original text in that section)" | There is no correction block; §12.3.3 ends and §12.4 begins |

So §12.3.3 still presents, as its current and only account: *"1 apparent failure that did not reproduce —
**established as pre-existing/environmental**, not a Set Groups defect"* and *"consistent with
load-sensitive timing margins."* That is precisely what V-3 found unsupportable for a terminal `dead`
count, and it is now in direct conflict with §13.2's own statement that the cause "remains genuinely
unresolved."

**Required correction.** Edit §12.3.3 itself — remove the false sentence, delete or explicitly retract the
"established as pre-existing/environmental" and "timing margins" framing for the `setGroupsOffline.spec.ts`
failure, fix "C-5" to name the touching-only-sleep-hours test, and state the cause as unresolved. If the
original text is to be retained for provenance, mark it unmistakably superseded in place (the pattern §6.4
already uses: *"superseded by §6.3; retained for provenance"*), with the correction above it, not merely
asserted in a table two sections later.

### 3.2 §12.1's L-3 row still carries the disproved justification

The row reads: *"bypassing the ordinary `writable`/subsumption gate for that one field (safe for batch
convergence — ops apply strictly in order in separate transactions, so a later explicit write still wins,
and replay is deterministic)."* All three clauses of that parenthetical are what V-2 disproved, and the
code no longer relies on any of them — it now defers precisely because a later write does *not* always
win. Left as written, it is a competing current explanation of the same mechanism. *Required:* annotate the
L-3 row as superseded by V-2, or replace the parenthetical with the actual rule.

### 3.3 §13.4 mislabels the E2E run as the replay/subsumption evidence

§13.4's heading reads *"Full end-to-end suite — real batch replay/subsumption coverage plus the required
browser verification"*, and its body states *"This single run **is** the required 'batch
replay/subsumption coverage' for the E2E layer"* — while conceding in the same sentence that V-2's defect
"is not reachable from any shipped emitter, so no E2E run … could exercise it; the real coverage for V-2 is
the integration suite." A run that cannot exercise the behavior is not evidence for it, however it is
qualified afterwards.

This matters because it is the only place the residual pass names its replay/subsumption evidence, and it
names the wrong artifact. **The integration reproduction is the relevant evidence** — and it is strong: four
tests against real `applySyncBatch` and real SQL, with an executed negative control (§2). The E2E run's
genuine contributions are separate and real: V-3's browser verification, and a regression check that the
`applySetLogUpsert` change did not disturb the offline/PWA surface.

*Required:* retitle §13.4's E2E subsection as browser verification plus regression coverage, and point the
replay/subsumption claim at §13.1's V-2 row and its integration tests.

### 3.4 "Not reproduced in any prior run" erases the observation it is about

§13.2 reads *"Not reproduced in this pass's own full run (§13.4) or in any prior run across this report's
history."* The failure **was** observed in a prior run — the second full run of the §12 pass — which is the
entire reason the item exists. §13.1's *"observed once, not reproduced since"* is the correct form, but it
is then muddied by "across every run in this repository's own history including this pass's own full run
below."

*Required:* state it as one unambiguous sentence separating the observation from the reproduction attempts,
e.g. *"Observed once, in the second full `pnpm test:e2e` run of the §12 pass. Not reproduced in any run
since: the two subsequent full runs in §12.3.3, this pass's full run in §13.4, and 12 executions in the
two independent verifications."* The count is now mine to supply: 11 in my first verification (5 isolated
+ 6 within the offline subset) plus 1 here, all passing.

---

## 4. Verification I executed, and what I inherited

### 4.1 Executed

| # | Check | Result |
|---|---|---|
| 1 | `pnpm typecheck` / `typecheck:sw` / `lint` / `format:check` | all exit 0; `format:check` clean on the full tree |
| 2 | `pnpm test:unit` | **1365 passed, 0 failed** — matches §13.4 exactly (+1 over §12's 1364) |
| 3 | `pnpm test:integration` | **501 passed, 17 skipped, 0 failed** — matches §13.4 exactly (+4 over §12's 497) |
| 4 | `pnpm exec vitest run tests/unit/setGroups/groupEvaluation.test.ts` | **27/27** (V-1) |
| 5 | `pnpm exec vitest run … setGroups.integration.test.ts` (whole file) | **29/29** (V-2's 4 included) |
| 6 | My own V-2 reproduction probe (real `applySyncBatch`, real SQL), unchanged from the previous verification | **4/4 PASS** — previously 2 FAIL |
| 7 | My own NC-7 probe on the missing-historical-group branch | **PASS** — previously FAIL |
| 8 | **Source-level negative control**, V-2 predicate reverted: my probe + the repo's V-2 block | 2 probe failures returned; exactly 1 of 4 repo tests failed (the primary reproduction) — see §2 |
| 9 | Restore integrity | SHA-256 identical to the pre-control backup; `typecheck` 0; file 29/29 |
| 10 | Disposable Postgres `gymapp_rv2_sga`, CI bootstrap per `agent-workflow.md` §7, then `pnpm test:e2e:offline` (17 files) | **38 passed, 2 failed** — `dead-letter.spec.ts:393` (V-3's new test) **passed in 7.7 s**; all 5 Set Groups tests passed; both failures in `offline-bodyweight-recovery.spec.ts` (lines 137, 282) |
| 11 | `offline-bodyweight-recovery.spec.ts` in isolation | 12 passed, 1 failed — **137 and 282 both pass**; line 193 fails instead, with `expect(locator).toBeVisible() … element(s) not found` |
| 12 | `git status --porcelain` before and after | identical apart from this report |

On item 10/11: the two failures are **not** in `waitForOutboxDrained` and not in the new diagnostics path —
C-5 (line 282), the test that deliberately dead-letters and therefore exercises the changed helper hardest,
passes in isolation and failed only under subset load. The shared-helper change is not implicated. Across
my two sessions this spec has now failed on three different tests (193, 137, 282), always a visibility
timeout, always passing in isolation: a genuinely pre-existing, load-sensitive flake, unrelated to Set
Groups, and independently substantiated now rather than asserted. It also means §13.4's "162 passed, 0
failed" is a true statement about one run, not a stable property of the suite.

### 4.2 Inherited explicitly, with reasons

- **Migration and schema evidence.** No migration, `drizzle/*` or `src/db/schema/*` file is touched by
  V-1…V-6 — confirmed by `git diff --stat` and by §13.3's manifest, which I checked against `git status`.
  The evidence I executed for my Stage A review (fresh migrate, `drizzle-kit check`, double seed, the
  gated set-renumber concurrency suite, the real-Postgres `uq_recs_one_pending` control) stands. I did
  re-apply the migrations to a fresh database as part of item 10's bootstrap, which re-confirms they apply
  cleanly.
- **The full 39-file `pnpm test:e2e` run (§13.4, 162 tests).** I ran the 17-file offline subset instead,
  which contains `dead-letter.spec.ts` (V-3's new coverage), both Set Groups specs, and the offline/PWA
  surface the `applySetLogUpsert` change could disturb. Re-running the other 22 files would repeat
  unaffected checks; per §3.3, they are not the evidence for V-2 in any case.
- **Everything already closed in M-1…M-6 / L-1…L-9.** Re-verified in my previous report; V-1…V-6 touched
  only `groupEvaluation.ts`'s one branch, `service.ts`'s one predicate, two E2E test files and report
  prose, so the rest is unaffected. The unit and integration totals in items 2–3 confirm no collateral
  regression.

### 4.3 Carried-forward limitations — unchanged

L-8 (client-supplied group-key trust, noted not fixed), L-7 (reverse-conversion asymmetry, accepted with
the read-path invariant pinned), browser-level group remove/reorder (add covered, reorder
integration-covered, remove unit/integration only), no grouped-specific warm-up-then-reload E2E case, and
Stage B fully excluded. §13.2 states each correctly. The `setGroupsOffline.spec.ts` dead-letter cause
remains unresolved, now instrumented for its next occurrence — the right call, and the instrumentation
works.

Also correctly closed by this pass: my previous report's standing gap — *"no automated test exercises the
`writable`/subsumption interaction for `groupKey` at all"* — is closed by V-2's four tests.

### 4.4 Resources

Created and removed: disposable Postgres `gymapp_rv2_sga` (dropped; `pg_database` re-checked — the five
databases from unrelated earlier sessions and `gymapp` itself untouched); a scratchpad `node_modules`
junction needed so out-of-repo probes could resolve bare imports; a scratch Playwright log in `%TEMP%`; the
`service.ts` backup and its hash file, removed after restore was confirmed. `.env.local` not touched —
`DATABASE_URL` was set per shell invocation, as §13.4 also now does. One source file was mutated for the
negative control and restored byte-identically (§2). No secret read, printed or transmitted. The only
repository file this verification creates is this report; the independent reports, the implementation
report and the concurrent workflow documents are unmodified.

---

## 5. Verdict

V-1 and V-2 are closed on evidence I generated myself, including a negative control that reproduces each
original defect and a check of the inductive argument's premise against the code. V-4, V-5 and V-6 are
closed accurately — V-5 in particular now states the chronology correctly rather than defending it. V-3's
mechanism is closed and its browser coverage is real and passing.

What blocks approval is narrow and entirely documentary: **§12.3.3 was never corrected.** The section that
holds the Stage A E2E evidence still asserts, as its current account, that the `setGroupsOffline.spec.ts`
dead-letter failure was "established as pre-existing/environmental" and "consistent with load-sensitive
timing margins", still contains the false "passed in every one of the five full runs" sentence, and still
mislabels the co-occurring flake as C-5 — while §13.1 claims all three were fixed and points to a
correction block that does not exist. §12.1's L-3 row likewise still offers the batch-convergence
justification V-2 disproved. §13.4 names the E2E run as the replay/subsumption evidence it cannot be, and
§13.2's "not reproduced in any prior run" erases the one run in which it was observed.

None of this requires further engineering. It is four passages of prose: correct §12.3.3 in place (or mark
it superseded in the way §6.4 already models), annotate the L-3 row, retitle §13.4's E2E subsection and
repoint the replay/subsumption claim at the integration tests, and restate the reproduction history in one
unambiguous sentence. The code is ready; the record is not, and the record is what the next reader will
rely on.

REVISION REQUIRED
