# Set Groups (PI-012) Stage A — targeted remediation verification

**Date:** 2026-09-13
**Tree:** `583a9ab` (dirty) — the uncommitted Stage A implementation after the targeted remediation pass
documented in [set-groups-stage-a-implementation.md](set-groups-stage-a-implementation.md) §12, plus the
concurrent work that lineage already lists. Working tree confirmed byte-identical before and after this
verification apart from this one new file (§6.1).
**Role:** independent verification (no implementation, no fixes, no staging, no commit, no push, no
deployment, no production access — none attempted; no Stage B work)
**Session:** `S7 | PI-012-A | Verification — Set Groups Stage A remediation`
**Model:** claude-opus-5 (1M context)
**Baseline:** the verified architecture —
[set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) revision 3 and its
[§19 owner decisions](set-groups-architecture-evaluation.md#19-owner-decisions--accepted-2026-09-12)
(§19 is a section of that **evaluation**, not of any review document) — together with the
[architecture review](set-groups-architecture-review.md), both
[revision](set-groups-architecture-revision-verification.md)
[verifications](set-groups-architecture-revision-verification-2.md), and my own
[Stage A review](set-groups-stage-a-review.md) whose M-1…M-6 / L-1…L-9 this pass addresses.
**Scope:** Stage A only. Stage A and Stage B remain a joint release; nothing here authorizes a standalone
Stage A deployment, a commit, a push, or device acceptance.
**Verdict:** see §8.

---

## 0. Summary

The remediation is, on substance, good work. Every one of the six MEDIUM and nine LOW findings was
actually addressed in source — not papered over — and I verified each one against the code and against
reproductions I wrote myself rather than against §12.1's disposition table. M-1, M-2, M-3, M-4, M-6, L-1,
L-2, L-4, L-5, L-6, L-7, L-8 and L-9 are all genuinely closed, several of them more thoroughly than my
dispositions asked for. M-3 in particular is closed properly: the index-addressed override resolves after
`assignGroupKeys`, a key-addressed override always wins, reorder keeps identity, and the transient shape
never reaches storage — all four verified directly against persisted rows.

Three things block approval.

- **V-2 (MEDIUM).** The new server change made for L-3 — forcing `patch.groupKey = null` while bypassing
  the `writable`/subsumption gate — **breaks replay idempotence**, the invariant that file states as its
  own contract and that the change-class matrix makes a required negative control for every sync-contract
  change. I reproduced it against real SQL: the identical batch applied twice leaves two different rows.
  The same mechanism discards a `groupKey` the batch legitimately carried. Not reachable from any shipped
  client today — every grouped-slot emitter pairs `isWarmup` with `groupKey` — but it is a regression of a
  previously-verified property, introduced in response to a LOW finding, and the new L-3 test covers only
  the single-op case that cannot expose it. The fix is two lines.
- **V-3 (MEDIUM, report accuracy).** §12.3.3's flake accounting is internally contradictory and its
  causal claim is unsupported. It says Set Groups' own tests "passed in every one of the five full runs"
  while the same section records `setGroupsOffline.spec.ts` failing on the second; and it labels that
  failure "established as pre-existing/environmental" on the strength of passing retries. The symptom it
  describes — a **dead-lettered** op — is terminal, so "load-sensitive timing margins" cannot explain it.
  I reproduced the *other* flake it cites (and it is genuinely unrelated), but `setGroupsOffline.spec.ts`
  passed 11/11 for me, so its cause is **unresolved**, not established.
- **V-1 (LOW).** M-1's rewrite introduced one new branch — "this group's key did not exist in that
  session" — that returns the historical entry still carrying the **raw `groups` scheme**, breaking the
  §5.4/NC-7 safety invariant. Inert today only because that branch also empties `workSets`.

Three further LOW report-accuracy items (V-4…V-6) cover M-4's executed-versus-inherited wording, M-5's
file list and chronology, and a handful of cross-reference errors.

---

## 1. Finding-by-finding disposition

Verified independently against source and reproductions. "Probe" = a throwaway script I wrote that
executes the shipped functions; outputs quoted in §3.

### MEDIUM

| ID | My disposition | Evidence |
|---|---|---|
| **M-1** | **CLOSED.** | `buildGroupHistory` now resolves a grouped historical entry's group **by key from that entry's own frozen `prescribed.scheme`**, windows with **that** group's `sets.min`, and takes its effective RIR as `historicalGroup.targetRir ?? entry.prescribed.targetRir` — never today's. Probe: the entry projects to `{fixed, sets:2, reps:5}` (its own frozen min) where today's group is `{fixed, sets:3, reps:5}`; the exact scenario that produced `decrease_load` 90 kg in my review now yields `hold` 100 kg. Verified for both triggers: a template edit **and** a real `applyWeekModifiersToPrescription({setMultiplier: 1.5})`-raised min. Effective RIR verified both ways (group override wins; absent override falls back to that entry's own slot band, not today's). Repo coverage matches: 5 new unit tests (`groupEvaluation.test.ts`, 26 total) plus the integration test "M-1 — a week-modifier-raised group min never retroactively fails an earlier session frozen at the original min". **One new LOW — see V-1.** |
| **M-2** | **CLOSED.** | New shared `hasEvaluableStrategy(snapshot)` in `groupEvaluation.ts` replaces the bare `strategyId !== "manual"` check at both sites — [`progression/service.ts:425`](../../src/server/progression/service.ts#L425) and [`activeSession.ts:974`](../../src/sync/activeSession.ts#L974) — so the two pre-filters can no longer diverge from `evaluateSession`'s own dispatch. Probes: manual slot + non-manual group override → evaluable; all-manual grouped slot → not evaluable; ungrouped manual slot → unchanged. Both halves of the "online and offline" requirement are covered by real-path tests, not by `evaluateSession` in isolation: an `activeSessionGroups.test.ts` case driving `startSession`/`logSet`/`completeSession` offline, and an integration case driving a real `applySyncBatch` completion. |
| **M-3** | **CLOSED, including the identity and transient-state concerns.** | `progressionInputSchema` gains `groupOverridesByIndex`; `toRawProgressionInput` resolves each index against the **post-`assignGroupKeys` submitted** scheme and merges it into the by-key map, with a key-addressed entry always winning (`if (!(key in groups))`). Verified against persisted rows by probe: (a) CREATE with slot rep-progression and **two fixed-rep groups** succeeds in **one save** with `repCap` 4 and 10 correctly attached — the exact dead end I reported; (b) the stored `progression` JSONB's top-level keys are `["config","groups","strategyId","classification"]` — `groupOverridesByIndex` is **absent** after create *and* after update, so no transient configuration persists; (c) UPDATE adding a third group by index attaches `repCap` 15 to the new key while the two key-addressed overrides keep 4 and 10 — **no misattachment**. Reorder identity is pinned by a real `updatePrescription` integration test with distinct per-group configs and swapped positions. The form addresses keyed groups by key and keyless drafts by index, so the client cannot produce a misattaching submission. Browser-level: both new authoring E2E tests pass (I ran them), and the create-mode one is precisely my scenario — slot Rep progression, two fixed-rep groups, both repCaps filled before any key exists, one "Add exercise" click, then the persisted values re-checked and round-tripped through a reload. |
| **M-4** | **CLOSED.** | `package.json`'s `test:e2e:offline` appends `tests/e2e/setGroups.spec.ts tests/e2e/setGroupsOffline.spec.ts` to the existing 15-file list, otherwise unchanged; `.github/workflows/ci.yml`'s `offline-e2e` job runs that same script, so CI coverage follows automatically. **I executed the actual command** (not a superset): 17 files, **39 tests, 39 passed**, with all five Set Groups tests present and named in the output. See V-4 for the report's wording. |
| **M-5** | **Mechanically CLOSED; the report's prose is wrong — see V-5.** | `pnpm format:check` is green on the full tree (exit 0), and green on each of the six files my review actually named, including the two specific over-width lines in `PrescriptionForm.tsx`, now wrapped. |
| **M-6** | **CLOSED.** | `formatScheme(scheme, slotTargetRir?)` renders each group's own effective band inline for the `groups` case only. Probe output is byte-identical to evaluation §11.2's worked example: `Top 1 × 2 @ RIR 2 · Back-off 2–3 × 6–8 @ RIR 2–3` (group override, then slot fallback). A non-`groups` scheme is byte-identical with and without the new argument; with no band available anywhere, nothing is appended. All three surfaces pass it through and suppress the old slot-wide suffix for grouped schemes only — [`ExerciseCard.tsx:438-444`](../../src/ui/workout/ExerciseCard.tsx#L438-L444), [`TodaySection.tsx:406-411`](../../src/ui/today/TodaySection.tsx#L406-L411), `HistoryDetail.tsx:168-171`. PI-018's `· Rest m:ss` clause is preserved in its original position. |

### LOW

| ID | My disposition | Evidence |
|---|---|---|
| **L-1** | **CLOSED.** | `buildClientRecommendationOps` now branches on `snapshot.scheme.type === "groups"` and applies `applyInSessionDecisionsToGroupPrefills` over `exercise.recommendations`, mirroring the server's `overlayInSessionDecisions`. The test is decisive on the right quantity: a pending 8→10 rep suggestion explicitly modified to **9** in-session, and the offline op's `inputs.derived.currentRepTarget` asserted to be **9**, not the frozen prefill's 8. |
| **L-2** | **CLOSED, with the no-double-shift property verified.** | New `applyTargetRirShiftToGroups` shifts only a group's **own** override. Probe with `targetRirShift: +2`: group A's own `{1,2}` → `{3,4}` (exactly once); group B, which has no override, stays `undefined` and inherits the shifted **slot** band `{3,5}` at resolution time — so neither group is shifted twice and neither is missed. Per-group clamping to `[0,10]` verified (`+20` → `{10,10}`). Closes the A-7 gap my acceptance table flagged. |
| **L-3** | **PARTIALLY CLOSED — the client and prefill halves are right; the new server change introduces V-2.** | Client: both `SetRow` (ExerciseCard) and `HistorySetRow` (HistoryDetail) submit `groupKey: isWarmup ? null : groupKey` for a grouped slot. Prefill: `groupPrefill` now filters `!s.isWarmup && s.groupKey === group.key`. Server single-op force: works — probe confirms a hand-crafted op pairing `isWarmup: true` with a real key stores `{isWarmup: true, groupKey: null}`, and a partial edit touching neither field leaves attribution intact. **But see V-2 for the subsumption/replay consequences of bypassing the gate.** |
| **L-4** | **CLOSED (report-only).** | §4 is corrected in place and is now accurate: two guards in `loadProgression.ts` (one in `isCompleted`, one at the top of `evaluateLoadProgression`) plus one exhaustiveness arm; `repProgression.ts`'s original one-guard-one-arm count was right. It also records that evaluation §10's "Not changed, deliberately" line is inaccurate, without editing that document — the correct handling. Both files' diffs are unchanged from my review (`git diff` hash stable) and `STRATEGY_VERSIONS` is still `{1,1,1}`. |
| **L-5** | **CLOSED.** | The C-1/D-6(a) integration test now asserts the bridged record's remapped `groupKey`, and M-4 additionally puts the browser-level bridge test into CI — both halves of my disposition. |
| **L-6** | **CLOSED, decisively.** | The new `activeSessionGroups.test.ts` case seeds a cached bundle containing one grouped historical session with both groups' sets `groupKey`-tagged, then asserts per-group `historyDepthUsed` of 1 and a resulting `decrease_load` — reachable only if the cached grouped history is read **and attributed per group**. The test's own comment records the decisiveness method (remove `setCachedBundle` → `historyDepthUsed` 0 and `hold`/`INSUFFICIENT_HISTORY`). |
| **L-7** | **ACCEPTED as Stage A behavior; invariant now pinned through BOTH paths.** | The new integration test completes a grouped session (two real pending rows), converts the slot back to ungrouped, asserts **both orphans still exist untouched** (genuinely inert, not silently cleaned up — D-6's "no rewrite"), then asserts neither `buildTodayBundle` (`pendingRecommendation` null, `pendingRecommendations` undefined) nor `getActiveSession` (`recommendation?.groupKey ?? null` null, `recommendations` undefined) ever surfaces a non-null-key record for the now-ungrouped slot. That is exactly the disposition I wrote, and no symmetric write-time supersede was added — correct for Stage A. |
| **L-8** | **Correctly kept explicit; not treated as fixed.** | §7.2's new paragraph and §12.1's row both state plainly that the index mapping addresses **draft** groups only and does not validate an already-keyed client-submitted key against the stored scheme, and is not claimed to. One addition of my own, inside the same trust boundary: `groupOverridesByIndex` submitted **without** a `scheme` patch resolves its indices against the **stored** group order, which is only meaningful relative to a submitted scheme. The form never does this, and a client that can forge indices can already forge keys, so this belongs under L-8's existing "future hardening" note rather than as a separate finding. |
| **L-9** | **CLOSED.** | Both specs replace per-test `try/finally` with a shared `test.afterEach` (its own timeout budget) plus a `beforeEach`-reset `owned: {templateId?, programInfo?}` tracker each test populates as it creates resources, so the hook only touches what that test owns. Schedule restore and discard are `.catch(() => undefined)`-guarded so one cleanup failure cannot abort the rest. Note: §12.1 cites "a deliberately induced mid-test failure during this pass's own debugging" as evidence — that is unreproducible from the report and should be labelled as such rather than quoted as verification; the structural change is what I am accepting, and it is correct. |

---

## 2. New findings

### V-2 (MEDIUM) — the L-3 server bypass breaks replay idempotence and can discard a legitimately carried `groupKey`

**Where.** [`src/server/sync/service.ts:1151-1181`](../../src/server/sync/service.ts#L1151-L1181) —
`applySetLogUpsert`'s update path.

**The mechanism.** `writable` is an intra-batch forward-subsumption set: for each op, fields that a
**later** op in the same batch also sets are removed, so a stale op never transiently writes a value the
later op immediately overwrites (the MEDIUM-1/V-2 remediation recorded at
[`service.ts:1096-1111`](../../src/server/sync/service.ts#L1096-L1111)). The invariant that machinery
exists to hold is stated in the same file at line ~780: *"same batch twice → identical DB,
implementation-plan §1.5"*, and the change-class matrix makes a replay-idempotence negative control
mandatory for every sync-contract change.

The new code computes

```ts
const effectiveIsWarmup = writable.has("isWarmup") ? payload.isWarmup : existingRow.setLog.isWarmup;
const groupKeyForcedNull = effectiveIsWarmup === true;
```

and then writes `patch.groupKey = null` **unconditionally** when that is true, outside the gate. But
`writable` excludes `isWarmup` *precisely when a later op in the batch is about to change it*, so the
fallback reads the **pre-batch** row value, not the batch-final one. The comment calls this "the EFFECTIVE
(post-patch) `isWarmup`"; it is the pre-batch value in exactly the case that matters. §12.1's
justification — *"a LATER op in the same batch that sets a real `groupKey` (paired with `isWarmup: false`)
still wins"* — is true only when the later op **also** carries `groupKey`. When it carries `isWarmup`
alone, convergence is affected.

**Reproduced** against real SQL (PGlite, real migrations, real `applySyncBatch`), with a grouped slot whose
set currently stands as a warm-up with no group, and a batch `[full-row {isWarmup: true, groupKey: top,
…}, partial {isWarmup: false}]`:

```text
FAIL  REPLAY - identical batch applied twice converges
      rejected1=[] rejected2=[]
      afterFirst={"isWarmup":false,"groupKey":null}
      afterSecond={"isWarmup":false,"groupKey":"ufmolt9p"}

FAIL  FIELD CONFLICT - batch-final isWarmup=false keeps the batch's groupKey
      rejected=[] final={"isWarmup":false,"groupKey":null}
      expected={"isWarmup":false,"groupKey":"f87rz4nf"}

PASS  CONTROL - a single op pairing isWarmup:true with a real groupKey clears it
      final={"isWarmup":true,"groupKey":null}
PASS  CONTROL - a partial edit touching neither field leaves groupKey intact
      final={"isWarmup":false,"groupKey":"kikz1ecf"}
```

Both ops are accepted (`rejected: []`) in both runs, so this is silent divergence, not a rejection. The two
controls passing confirm the fix still does what it was built for and does not disturb ordinary partial
edits — the defect is confined to the subsumption interaction.

**Reachability.** Not reachable from any shipped client today. Every emitter that can touch a grouped
slot's `isWarmup` also carries `groupKey`: `setLogFullRowOp` (`...(isGrouped ? { groupKey: set.groupKey ??
null } : {})`), `buildSetDeletionOps`' renumber upserts (same pattern), and both edit forms (`...(groupsScheme
? { groupKey: isWarmup ? null : groupKey } : {})`). A pre-Stage-A client cannot adopt a grouped session at
all. So there is **no user-facing impact now** — but the payload is legal under the server's own schema, the
property it breaks is load-bearing and previously verified, and Stage B adds new per-group write paths that
could easily emit the triggering shape.

**Why the existing test does not catch it.** The new L-3 integration test applies a **single** op, so
`laterUpsertFields` is `null`, `writable` is the op's own field set, and the bypass and the gate agree.
The case the bypass changes is never exercised.

**Required correction.** Make the force respect the batch's own view — skip it when a later op in the same
batch covers either field, which leaves those ops to establish the final state themselves:

```ts
const laterFields = supersession.laterUpsertFields;
const groupKeyForcedNull =
  effectiveIsWarmup === true && !laterFields?.has("isWarmup") && !laterFields?.has("groupKey");
```

With that, my probe 1 and 2 both pass (the later op sets `isWarmup: false`, the earlier op writes its own
`groupKey`, replay is identical) and both controls still pass. Then: add a regression test for the
subsumption case — the probe in §3.1 is a ready-made shape — and re-run the replay-idempotence negative
control the change class requires. Also correct the code comment, which currently asserts a property the
code does not have.

### V-1 (LOW) — M-1's new "key absent in that session" branch leaves a raw `groups` scheme in engine history

**Where.** [`groupEvaluation.ts:115`](../../src/domain/progression/groupEvaluation.ts#L115) —
`if (!historicalGroup) return { ...entry, workSets: [] };`

That early return empties `workSets` but leaves `entry.prescribed.scheme` as the **raw `groups` scheme**.
Evaluation §5.4 states the projected-scheme invariant as *required*, and NC-7 exists to guard it. Probe:

```text
FAIL  NC-7 - a history entry whose key is absent still carries a PROJECTED (never raw groups) scheme
      prescribed.scheme.type=groups; workSets=[]
```

It is inert today only because `entryQualifiesForStreak` short-circuits on `entry.workSets.length === 0`
before it reads the scheme — a second guard, not the one the design relies on. The pre-remediation code
always projected, so this is a narrow regression of the invariant rather than a pre-existing gap.
`groupEvaluation.test.ts`'s NC-7 test does not cover this branch.

**Required correction.** Return `{ ...entry, prescribed: null, workSets: [] }` — honest (there is no
faithful definition to judge that entry against) and it keeps `entryQualifiesForStreak`'s
`!entry.prescribed` path as the reason it does not count, rather than relying on the empty array. Extend
the NC-7 test to this branch.

### V-3 (MEDIUM, report accuracy) — §12.3.3's flake accounting is contradictory and its causal claim is unsupported

Four distinct problems, taking the task's items 1 and 2 together.

**(a) Internal contradiction.** §12.3.3 records that on the second full run `tests/e2e/setGroupsOffline.spec.ts`
"failed once with an unexpected dead-lettered outbox op after reconnecting", and then closes the same
bullet with "Set Groups' own 5 tests passed in every one of the five full runs executed during this
verification." Both cannot be true. The second claim is the one that is wrong.

**(b) The stated symptom cannot be a timing margin.** `waitForOutboxDrained`
([`tests/e2e/helpers.ts:122`](../../tests/e2e/helpers.ts#L122)) polls to
`{ pending: 0, dead: 0 }`. A `pending` count that has not yet reached zero is a timing margin; a **`dead`**
count is terminal — an op that dead-lettered was rejected by the server and no amount of additional
waiting clears it. So "consistent with load-sensitive timing margins in a long, fully-sequential
161-test browser suite" cannot explain a dead letter, and a passing retry establishes non-determinism, not
causation. In a sync-contract change under review, a dead-lettered op in the grouped offline completion
path is exactly the failure class B-2 described (`recommendation_conflict` on `uq_recs_one_pending`); it
may equally have been an ordering artefact of the shared E2E account (for example a stale in-progress
session producing `session_conflict`). Neither is established.

**(c) The co-occurring flake is real but misidentified — and it does not transfer.** I reproduced it
independently: across **6** `pnpm test:e2e:offline` runs on the final tree, one run failed with

```text
x  9 [chromium] › tests\e2e\offline-bodyweight-recovery.spec.ts:193:3 ›
     offline recovery check-in — true unknown-offline state ›
     no live read, no same-day cache: touching only sleep hours saves and converges
     on reconnect without fabricating the other three metrics
   Error: expect(locator).toBeVisible() failed — Timeout: 5000ms
   waiting for getByText(/Offline — can.t verify today.s check-in yet/)   [line 209]
```

That **is** a genuine, pre-existing, timing-driven flake in an untouched PI-007 spec (no recovery file
appears in `git status`), and my own reproduction now supports that part of the report independently, with
the real symptom (a 5 s visibility timeout). But the report calls it "`offline-bodyweight-recovery.spec.ts`'s
C-5 test" — C-5 is the separate test at line 282, which passed in the same run I captured. Having
mislabelled it, the report then generalises its "timing margins" explanation onto the Set Groups failure,
where per (b) it does not fit.

**(d) My reproduction attempts for the Set Groups failure.** `setGroupsOffline.spec.ts` passed **11/11**:
5 isolated runs and 6 runs inside the offline subset, all on the final tree against my own disposable
database. I could not reproduce it, and a deleted scratch log is not itself a defect — but absence of
reproduction is not a cause either.

**Required correction.** State in §12.3.3 that the `setGroupsOffline.spec.ts` dead-letter failure has an
**unresolved** cause: observed once, not reproduced since (11 further executions here), and explicitly not
explained by the timing-margin account that does fit the bodyweight flake. Remove the "passed in every one
of the five full runs" sentence. Fix the C-5 mislabelling. Then instrument rather than retry: have the
check capture the dead letter's `entity` and `reason` when it next occurs — the Sync issues screen already
shows both, and `readOutboxStatusCounts` can return reasons alongside counts — so the next occurrence is
diagnosable instead of re-litigated.

### V-4 (LOW, report accuracy) — M-4 claims a direct run that §12.3.3 says was not performed

§12.1's M-4 row says *"Run directly (`pnpm test:e2e:offline`, 17 files) — see §12.3"*. §12.3.3 says the
opposite: the full 39-file run is reused and *"re-running the 17-file subset separately would exercise
strictly less than what the full run already covers."* The **coverage inference is sound** — the 17 files
are a strict subset of the 39, same tree, same bootstrap — but the command was not executed, and M-4's
wording claims it was. *Required:* say "coverage inherited from the full run, command not separately
executed" in M-4, or quote a direct run. I executed it: 17 files, 39 tests, 39 passed, exit 0 (§3.2).

### V-5 (LOW, report accuracy) — M-5's named file list and its chronology are both wrong

The row is introduced as *"All six files the review identified"* and then names `groupEvaluation.ts`,
`setGroups.integration.test.ts`, `activeSessionGroups.test.ts`, `applyWeekModifiersGroups.test.ts`,
`groupEvaluation.test.ts`, `setSchemeGroups.test.ts`. My finding named
`src/ui/prescriptions/PrescriptionForm.tsx`, `tests/e2e/setGroups.spec.ts`,
`tests/e2e/setGroupsOffline.spec.ts`, `tests/integration/setGroups.integration.test.ts`,
`tests/unit/setGroups/activeSessionGroups.test.ts`, `tests/unit/setGroups/groupEvaluation.test.ts` — three
of six overlap. The row omits `PrescriptionForm.tsx` and both E2E specs, which were the clearest cases
(the two over-width lines I quoted were in `PrescriptionForm.tsx`), and adds three files I never named.
All six of mine *are* now clean, so the fix is complete; only the record is wrong.

The chronology is also unsupported: *"The prior report's green claim (§6.2) was accurate for the tree at
the moment it was written but this pass's own subsequent edits to those same files drifted them again
mid-pass."* I ran `format:check` on 2026-09-12, on the tree as it stood **before** this remediation pass
existed, and found those six files failing with genuine over-width drift that I quoted line by line. A
pass that began the following day cannot have caused a failure measured before it started. *Required:*
state plainly that §6.2's green claim was incorrect when written, and correct the file list. The
substantive outcome — a green gate on the final tree — is unaffected and is verified (§3.2).

### V-6 (LOW, report accuracy) — cross-reference and baseline-label errors

- §4's correction is headed *"Corrected 2025 targeted-remediation pass"*; the pass is dated 2026-09-13.
- §12.1's L-9 row cites **§12.3.2** for the E2E re-run; the E2E evidence is **§12.3.3**.
- §12's header calls the owner addendum *"the review's own §19 owner addendum"*. §19 is a section of
  `set-groups-architecture-evaluation.md`; no review document has a §19. Minor, but it is the binding
  baseline, so the citation should be exact.
- §12.2 lists `evaluationTarget.ts` as "read only, not modified this pass" — accurate for *this* pass, and
  worth keeping that qualifier, since the file **is** modified relative to `583a9ab` from the earlier pass.

Separately, §12.4's superseded statements check out: the two-save item is correctly marked closed by M-3,
and "add/remove/reorder still not covered at the browser level beyond add" is accurate — add is now
browser-covered, reorder identity is covered at the integration level (which addresses the
data-consequence half of my original disposition), and remove remains unit/integration only. §12.2's
manifest matches `git status` and the per-file test counts I measured exactly (§3.2).

---

## 3. Executed verification

### 3.1 Reproductions I wrote

Three throwaway scripts in the session scratchpad (outside the repository), executing the shipped
functions directly.

| Probe | Subject | Outcome |
|---|---|---|
| `syncBypass.mts` | Real `applySyncBatch` on a migrated PGlite database with a real grouped prescription/session fixture: replay of an identical batch, the `isWarmup`-subsumed field conflict, and two controls | 2 FAIL (V-2), 2 PASS — output quoted in §2 |
| `m1m2m6.mts` | `buildGroupHistory`, `evaluateLoadProgression`, `applyWeekModifiersToPrescription`, `formatScheme`, `hasEvaluableStrategy`, `resolvePrescriptionProgression`, `checkPrescriptionCompatibility` | 16/17 PASS; the one FAIL is V-1 |
| `m3persist.mts` | Real `createPrescription`/`updatePrescription` against a migrated database, inspecting the **persisted** `exercise_prescriptions.progression` JSONB | M-3 fully confirmed: one-save create, correct per-group `repCap`s, no transient key persisted, add-by-index without misattachment |

Key probe outputs:

```text
M-1  a grouped history entry is projected from ITS OWN frozen group
     got {"type":"fixed","sets":2,"reps":5}   own-frozen {"type":"fixed","sets":2,"reps":5}
                                             today's    {"type":"fixed","sets":3,"reps":5}
M-1  a raised current min no longer manufactures decrease_load
     action=hold target={"loadKg":100} reasons=["PRESCRIBED_REPS_NOT_COMPLETED"]
M-1  setMultiplier-raised min (min 2 -> 3) does not manufacture decrease_load     action=hold
M-1  effective RIR comes from the historical group's own override                {"min":1,"max":2}
M-1  effective RIR falls back to the historical entry's OWN slot band            {"min":4,"max":5}
M-2  manual slot + non-manual group override is evaluable                        true
M-2  all-manual grouped slot is NOT evaluable / ungrouped manual unchanged        false / false
M-6  rendered="Top 1 × 2 @ RIR 2 · Back-off 2–3 × 6–8 @ RIR 2–3"
M-6  non-groups scheme byte-identical with and without the new arg                "5 × 5" / "5 × 5"
L-2  group's own band shifted exactly once {"min":3,"max":4}; no-override group untouched,
     slot band {"min":3,"max":5}; +20 clamps to {"min":10,"max":10}

M-3  CREATE succeeded in ONE save (no PrescriptionCompatibilityError)
     persisted progression top-level keys: ["config","groups","strategyId","classification"]
     groupOverridesByIndex present in STORED progression? false
     per-group repCap: 4 and 10
     UPDATE add-by-index: new key repCap = 15; existing key-addressed caps = [4,10]
     groupOverridesByIndex present in STORED progression after update? false
```

### 3.2 Repository checks I executed

| # | Command / check | Result |
|---|---|---|
| 1 | `pnpm typecheck` | exit 0 |
| 2 | `pnpm typecheck:sw` | exit 0 |
| 3 | `pnpm lint` | exit 0 |
| 4 | `pnpm format:check` | **exit 0, "All matched files use Prettier code style!"** — M-5's mechanical fix verified |
| 5 | `pnpm exec prettier --check` on the six files my review named | all clean; the two over-width lines in `PrescriptionForm.tsx` now wrapped |
| 6 | `pnpm test:unit` | **96 files, 1364 tests, 0 failed** — matches §12.3.2 exactly |
| 7 | `pnpm exec vitest run tests/unit/setGroups` | **10 files, 123 tests** — per-file counts match §12.2 exactly (groupEvaluation 26, activeSessionGroups 9, setSchemeGroups 25, applyWeekModifiersGroups 8, groupSelection 13) |
| 8 | `pnpm test:integration` | **29 passed + 6 skipped files; 497 passed + 17 skipped tests, 0 failed** — matches §12.3.2 exactly; `setGroups.integration.test.ts` has 25 tests as claimed |
| 9 | Disposable Postgres `gymapp_rv_sga`: `db:migrate` → `db:seed` → `smoke.spec.ts` → `db:seed` → `tsx tests/e2e/seed.ts`, per `agent-workflow.md` §7 re-derived from `ci.yml` | all green; seed idempotent |
| 10 | **`pnpm test:e2e:offline` (the actual CI command)** | **17 files, 39 tests, 39 passed** — all five Set Groups tests present and named in the output (M-4) |
| 11 | `pnpm test:e2e:offline` ×5 further runs | 5 runs: 39, 38 (1 failed), 39, 39, 39 — the one failure is the reproduced pre-existing bodyweight-recovery flake quoted in V-3(c) |
| 12 | `pnpm exec playwright test tests/e2e/setGroupsOffline.spec.ts` ×5 isolated | 5/5 passed (34–35 s each) |
| 13 | Stage B absence: `grep -rn "percentOfGroup\|percentOfTop\|loadOffset" src/` | no matches |
| 14 | Strategy-file stability: `git diff` on `loadProgression.ts`/`repProgression.ts` | unchanged by this pass (same diff as at review time); `STRATEGY_VERSIONS` still `{1,1,1}` |
| 15 | `git status --porcelain` before and after | identical apart from this new report |

### 3.3 Inherited, not re-run — with reasons

- **Migration and schema evidence** (fresh migrate, `drizzle-kit check`, double seed, the gated
  `SET_RENUMBER_CONCURRENCY_DATABASE_URL` suite, the real-Postgres `uq_recs_one_pending` negative
  control). No migration, `drizzle/*` or `src/db/schema/*` file changed in this pass — confirmed by `git
  diff --stat` and by §12.2's manifest — so the evidence I executed for my own review on 2026-09-12
  stands. §12.3.2 draws the same distinction, correctly. I did re-apply the migrations to a fresh
  database as part of item 9 above, which re-confirms they still apply cleanly.
- **The full `pnpm test:e2e` suite (39 files / 161 tests).** I ran the 17-file offline subset six times
  plus the Set Groups specs five more times instead. That is the command the change class makes
  load-bearing for a sync change, it is the command M-4 is about, and it is where the disputed flake
  lives. Re-running the full 161-test suite would have duplicated §12.3.3's own evidence without
  addressing any open question. **One consequence I am explicit about:** because V-2's defect is not
  reachable from any shipped emitter, no E2E run — mine or the implementer's — could have exposed it; it
  took a hand-built batch against the service directly.
- **Device (iPhone) acceptance.** Out of scope for verification and not claimed.

### 3.4 Resources created and cleaned up

Created by this verification and **dropped**: Postgres database `gymapp_rv_sga` (on the local
`gym-app-db-1` container). Post-verification `pg_database` listing confirms it is gone; the five databases
from unrelated earlier tasks and `gymapp` itself were present before and after and were deliberately left
alone. A `node_modules` directory junction inside the scratchpad (needed so scratch scripts outside the
repository could resolve bare package imports) — removed. Scratch Playwright logs in `%TEMP%` — removed.
Scratch probes and `git status` snapshots remain in the session scratchpad, outside the repository.

**`.env.local` was not touched.** I set `DATABASE_URL` per shell invocation instead — which is also how
`ci.yml` does it, and it avoids mutating repository-adjacent configuration at all. §12.5's approach
(editing `.env.local`, hashing, restoring, re-hashing) is acceptable and was verifiably restored, but the
env-var approach removes the need for that ceremony; worth adopting next time. No secret was read,
printed or transmitted. The only repository file this verification creates is this report.

---

## 4. Remaining limitations

Carried forward, correctly disclosed by the implementer, and unchanged by this verification:

- **L-8 — client-supplied group-key trust.** Noted, not fixed, and explicitly not claimed to be fixed by
  M-3's index mapping. Single-user application, unreachable through the editor. My addition: indices
  submitted without a `scheme` patch resolve against the stored order — same trust boundary.
- **L-7 — reverse-conversion asymmetry.** Accepted for Stage A with the read-path invariant now pinned
  through both the bundle and the resume path. No symmetric write-time supersede, per my own disposition.
- **Browser-level group remove/reorder.** Add is now covered; reorder identity is covered at the
  integration level; remove remains unit/integration only. Acceptable for Stage A, and honestly stated.
- **No grouped-specific warm-up-then-reload E2E case.** Unchanged; low marginal value.
- **Stage B** fully excluded — verified by grep and by reading the scheme and editor surfaces.
- **Nothing committed, pushed, deployed, or device-accepted.** Everything lives in the local uncommitted
  tree.

New, from this verification:

- **V-2's fix needs its own replay-idempotence control re-run**, not just a unit test, because the
  property it restores is a batch-level one.
- **No automated test exercises the `writable`/subsumption interaction for `groupKey` at all.** Whatever
  shape V-2's correction takes, that gap should be closed, since Stage B will add write paths to the same
  field.

---

## 5. Verdict

The remediation closed M-1, M-2, M-3, M-4, M-6 and the nine LOW items on substance, and I verified each
against source and against reproductions rather than against the disposition table. M-1's rewrite is
faithful to ADR-007 in both directions now; M-3's one-save authoring works end to end with correct
override identity and no transient state in storage; M-4 puts both specs into the real CI command, which I
executed; M-6 renders exactly the band the architecture specified. That is a genuine, well-evidenced pass.

It does not clear, for three reasons. The change made for the *smallest* finding (L-3) introduced a
demonstrated regression of replay idempotence — a property this repository treats as load-bearing and
requires as a negative control for precisely this change class — and the test added alongside it cannot
expose the case it broke (V-2). M-1's rewrite left one branch violating the NC-7 safety invariant it was
otherwise restoring (V-1). And §12.3.3 reports an unresolved dead-lettered op in the grouped offline sync
path as established-environmental on the strength of passing retries, while simultaneously claiming no Set
Groups test ever failed (V-3) — a claim I can show is wrong, alongside a neighbouring flake I reproduced
and can show *is* genuinely unrelated.

All three are bounded. V-2 is a two-line predicate plus a test; V-1 is a one-line return plus a test
assertion; V-3 is a rewrite of one subsection plus instrumenting the dead-letter count so the next
occurrence is diagnosable. V-4…V-6 are report corrections. Stage A's architecture remains sound and a
good foundation for Stage B, exactly as my previous review concluded.

REVISION REQUIRED
