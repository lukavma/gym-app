# Set Groups (PI-012) Stage B — targeted remediation verification

**Date:** 2026-09-13
**Role:** targeted verification (fresh session; confirms the listed finding IDs only, does not re-review)
**Session:** `O-Max | P10 | Verification — PI-012 Set Groups Stage B Remediation`
**Model:** claude-opus-5 (1M context)
**Tree:** `583a9ab` (dirty) — Stage A + Stage B + the F-1…F-9 remediation, all uncommitted, alongside the
concurrent, unrelated PI-017 work (untouched here).
**Inputs read:** [set-groups-stage-b-review.md](set-groups-stage-b-review.md) §3 (the findings) and
[set-groups-stage-b-implementation.md](set-groups-stage-b-implementation.md) §12 (the remediation).
Architecture sections consulted only for specific questions
([set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) §6.2, §6.3, §11.4).
**Verdict:** see §9.

---

## 0. Summary

All nine findings are genuinely fixed, and the two HIGHs are fixed at the right layer. I reproduced
F-1's and F-3's originally-defective behaviours by re-executing their negative controls myself (one of
them through a real rebuild and server restart), confirmed F-2's read-time filter at both call sites
including the frozen-snapshot case, and added browser coverage for three F-1 guard interactions the
remediation's own test does not exercise — the own-log guard, warm-up immunity, and the genuinely-empty
fallback. Every one behaved correctly. The full suite is green on a first-run disposable database:
1419 unit, 506 + 17-skipped integration, **171 E2E, 0 failed**, seven gates at exit 0.

Two things need recording rather than blocking.

**V-1 (MEDIUM).** §12.2 justifies choosing a read-time filter over write-time supersession by asserting
that a pending record on a linked group becomes "permanently unreachable". It does not. The bail-out is
keyed on the group's **current** link status, and nothing ever supersedes the record while the group is
linked (the engine skips it, so `supersedePending` is never called for its key). I unlinked a group two
sessions after linking it: the stale record returned to the Today bundle, the card rendered
`Accept 102.5 kg`, and it became that group's prefill — while the athlete's actual last load in that
group was 95 kg. The **fix is still sound and is not reopened**; the argument for it is not, and the
resulting limitation was undisclosed. I have marked the claim withdrawn in place (§7).

**V-2 (LOW).** §12.7 discloses that `linkNotice` is wiped by any subsequent group-list mutation and sets
it aside as "out of the review's named scope". Judged on consequence rather than scope: that transience
substantially defeats F-6's own remedy, because the natural next action after clearing a link is to edit
something, and one keystroke on an unrelated field erases the warning. I reproduced exactly that. It
stays LOW only because the state it warns about remains inspectable — the group's own progression select
reappears showing "Same as exercise", which I also confirmed.

Neither is a blocker. §12.5.1's schedule-contamination account is sound as observation and over-stated
as inference; my own clean first-run full suite supplies the evidence its conclusion actually needed
(§6).

---

## 1. Scope

Confirms F-1…F-9 only. Stage A is inherited as verified from
[set-groups-stage-a-documentary-closeout-verification.md](set-groups-stage-a-documentary-closeout-verification.md)
§5 and was not re-reviewed; no Stage A regression evidence emerged that would warrant reopening it. The
Stage B representation itself (the flat `link` field, schema invariants, performed-basis rule, rounding,
the L-1 write-time gate) was found sound by the review and was not reopened here either.

I changed no product source and no product test file. The only repository files I wrote are this report
and three clearly-attributed documentary corrections to the implementation report (§7).

---

## 2. Environment, task-owned resources and pairing

Clean at the start: nothing listening on :3000, no `node` process, no `gymapp_t_*` database (so
`gymapp_t_sgbrem` had genuinely been dropped, as §12.8 claims).

| Resource | Created | Pairing proof |
|---|---|---|
| Database | `gymapp_t_sgbverif` — created, migrated to `0014`, `drizzle-kit check` clean, seeded twice, dropped at the end | before `smoke.spec.ts`: 0 users in `gymapp_t_sgbverif`, shared `gymapp` at 1 user / 1859 sessions. After the account was created **through the running server**: `gymapp_t_sgbverif` 1 user, shared `gymapp` still 1 / 1859 |
| App server | one production server (`pnpm build && pnpm start`) on :3000 bound to `gymapp_t_sgbverif`; rebuilt and restarted twice for NC-F1, stopped at the end | port free before each start; every listener stopped was confirmed to be this task's own |

The shared `gymapp` database was never migrated, seeded, written to or read by any suite in this task,
and reads `1 | 1859 | 433` (users | sessions | templates) both before and after — identical to the
figures the independent review recorded at its own close. No two suites, builds or Playwright
invocations overlapped.

---

## 3. Finding dispositions

| ID | Sev | Disposition | How I verified it |
|---|---|---|---|
| **F-1** | HIGH | **Fixed — confirmed** | NC-F1 **re-executed by me** through a real rebuild + server restart: with the new effect's guard replaced by an unconditional `return`, the remediation's own F-1 test fails with `Expected "112.5" Received "105"` — precisely the original defect. Restored byte-identical, rebuilt, 13/13 pass. Plus three guard interactions of my own (§4, V1a/V1b/V1c), all correct. |
| **F-2** | HIGH | **Fixed — confirmed, with residual V-1** | NC-F2 **re-executed by me**: disabling `if (isLinked) return undefined;` makes the integration test fail with the linked group's key back in the bundle. Both call sites carry `group.link !== undefined`; the render branch checks `group.link` before any `rec`. Frozen-snapshot semantics independently confirmed (§4, V3). Residual: V-1. |
| **F-3** | MEDIUM | **Fixed — confirmed** | Independently reproduced end to end (§4, V4): load a linked prescription, change only the **slot** strategy, save — succeeds, slot becomes `load-progression`, the linked group's override stays `manual`, the `link` survives. No untick/re-tick needed. Both halves of the fix (load-effect and submit-time) are present; the submit-time half alone is sufficient, which is the right defence-in-depth ordering. |
| **F-4** | MEDIUM | **Fixed — confirmed** | The actual contradictory sentence at `prescription-model.md` §2 is rewritten, not merely summarised elsewhere. A search for every stale formulation (`not yet built`, `reserved, additive extension`, ``load` field``, `only Stage A`) now returns **zero** hits in that file. |
| **F-5** | LOW | **Fixed — confirmed** | The corrected baselines (25 not 24; 13 not 9) and per-file additions match what I counted in the files themselves: 43 → 43 / 13 / 29 → 32 / 17, plus the new 8-test file. Arithmetic now closes: 1408 + 3 + 8 = **1419**; 505 + 1 = **506**; 165 + 6 = **171** — all three independently measured (§5). |
| **F-6** | LOW | **Fixed — confirmed, partially effective (V-2)** | The message does now name the progression consequence, and two E2E tests assert it. Its lifetime is the problem, not its wording — see V-2. |
| **F-7** | LOW | **Fixed — confirmed** | `fallbackLoadKg` is read from the same `groupPrefills[key]` the input itself falls back to, so the number shown cannot drift from the number used. Browser-confirmed in the genuinely-empty case (§4, V1c): the box empties and the note reads "…and this group has no carry-forward or baseline yet." |
| **F-8** | LOW | **Fixed — confirmed** | `sanitizeGroupLinks` is exported and directly unit-tested (8 tests) across all three invalidation causes plus the two edge cases, and two new browser tests cover removal and reference-becomes-linked. This closes the gap the review named. |
| **F-9** | LOW | **Fixed — confirmed** | The durable regression exists and is stronger than the one-off probe it replaces: it adds copy-forward across adoption. It ran as part of my own 171-test suite. The §7 row's attribution is now accurate — the original coverage is credited to the review's probe, not to inherited Stage A runs. |

---

## 4. Independent reproductions (task-owned probe, since deleted)

One throwaway Playwright spec, written for this task and removed afterwards. No product source or test
file was modified to run it.

| Probe | Question | Result |
|---|---|---|
| **V1a** | Does a **warm-up** in the reference group move the reference or trigger a spurious re-derivation? | **No.** After logging a warm-up at 200 kg, the note still reads `80% of Top (130 kg)` and the box holds the athlete's own 200 (ordinary copy-forward) — the new effect did not fire, because the derived proposal did not change. |
| **V1b** | Once the linked group has its **own** logged set, does a reference edit still move the box? | **No.** With 100 kg logged in Back-off and `dirty` deliberately cleared (chip away and back) to isolate the own-log guard from the dirty guard, editing the reference 130 → 160 leaves the box at **100** and the note at `Linked to 80% of Top (160 kg).` §6.2's "later sets copy the athlete's own load" is intact. |
| **V1c** | Deleting the reference when there is **no** carry-forward and **no** baseline — does the box empty, or keep a number from a deleted set? | **Empties.** Box → `""`, note → "…and this group has no carry-forward or baseline yet." (Asserted non-vacuously: the set row was proven present before the delete.) |
| **V2** | The filter is keyed on *current* link status — what happens on **unlink**? | **The stale record comes back.** See V-1 below. Reproduced three consecutive times. |
| **V3** | Does linking in the **template** mid-session retroactively strip a running session's decision surface? | **No.** Same device after a reload: 2 Accept buttons. Cross-device adoption into a cold context via "Resume here": 2 Accept buttons. §12.2's frozen-snapshot claim holds — the resume path reads `session_exercises.prescription`, not the live row. |
| **V4** | F-3, reproduced independently. | **Saves.** `slot=load-progression; back-off override=manual; link kept=true`. |
| **V5** | Does F-6's warning survive ordinary editing? | **No** — erased by one keystroke on an unrelated field. Mitigation present: the per-group strategy select is visible and shows the value warned about. See V-2. |

One behavioural note, **not** a finding against this remediation: tapping the chip of the
**already-selected** group is a no-op (React bails on an identical state value), so it neither
re-derives nor discards a dirty draft, despite §11.4's table describing a chip tap as always
re-deriving. This is pre-existing Stage A behaviour of the selection-keyed effect, unchanged by the
remediation and not among F-1…F-9. It matters only in that the escape hatch from a dirty draft on a
linked group is two taps (away and back), which is what the remediation's own F-1 test does.

---

## 5. Evidence executed here

All commands sequential, on the §2 pairing.

| # | Command | Result | Exit |
|---|---|---|---|
| 1 | `pnpm lint` | clean | 0 |
| 2 | `pnpm typecheck` | clean | 0 |
| 3 | `pnpm typecheck:sw` | clean | 0 |
| 4 | `pnpm format:check` | `All matched files use Prettier code style!` | 0 |
| 5 | `pnpm test:unit` | `Test Files 97 passed (97)` / `Tests 1419 passed (1419)` | 0 |
| 6 | `pnpm test:integration` | `Test Files 29 passed \| 6 skipped (35)` / `Tests 506 passed \| 17 skipped (523)` | 0 |
| 7 | `pnpm build` | production build completed | 0 |
| 8 | `CREATE DATABASE gymapp_t_sgbverif` | created | 0 |
| 9 | `pnpm db:migrate` | `migrations applied successfully!` (through `0014`) | 0 |
| 10 | `pnpm exec drizzle-kit check` | `Everything's fine` | 0 |
| 11 | `pnpm db:seed` ×2 | `Seed complete.`; second run `noop=14 conflicts=0` | 0 |
| 12 | `pnpm exec playwright test tests/e2e/smoke.spec.ts` | `1 passed` — and the §2 pairing proof | 0 |
| 13 | `pnpm tsx tests/e2e/seed.ts` | `E2E seed ready: user=… program=… template=… block=…` | 0 |
| 14 | `pnpm test:e2e` | **`171 passed (3.4m)`** — 39 spec files, 0 failed, 0 flaky, **first run on a fresh database** | 0 |
| 15 | `pnpm exec playwright test tests/e2e/setGroups.spec.ts` (after NC-F1 restore + rebuild) | `13 passed` | 0 |

All three suite figures match §12.6 exactly (1419 / 506 + 17 / 171).

### 5.1 Negative controls

Re-executed by me, with exact-byte backup, mutation, run, restore, and SHA-256 verification.

| Control | Command | Expected | Observed | Restored |
|---|---|---|---|---|
| **NC-F1** (re-executed) | replace the F-1 effect's guard with an unconditional `return`; `pnpm build`; restart the server; `playwright test tests/e2e/setGroups.spec.ts -g "F-1 — the linked group"` | the clean input stops following a reference edit | **Failed as expected** — `Expected "112.5" Received "105"` at `setGroups.spec.ts:935`, the original F-1 defect exactly | `identical` (sha `0a5c141f8ced3b35`); rebuilt; 13/13 pass |
| **NC-F2** (re-executed) | `if (isLinked)` → `if (false && isLinked)`; `vitest run … -t "linking a group that already holds a pending recommendation"` | the linked group's key returns to the bundle | **Failed as expected** — bundle keys `["4njuj1oy", + "dv47cf23"]` at `setGroups.integration.test.ts:2791` | `identical` (sha `924081da62b57321`) |
| **NC-F3** | *assessed, not re-executed* | — | The pre-fix failure was already independently reproduced by the review's own PROBE D (`HTTP 400 incompatible_prescription`), and the post-fix behaviour by my V4; together these bracket the control without a third rebuild cycle. Corroborated by the backup check below. | n/a |

**Independent corroboration that all three controls were real.** The three `%TEMP%` backup files the
remediation took before each mutation are still on disk. I hashed each against the current source:

```text
ExerciseCard.tsx      backup 0A5C141F8CED3B35  current 0A5C141F8CED3B35  identical
service.ts            backup 924081DA62B57321  current 924081DA62B57321  identical
PrescriptionForm.tsx  backup D460C45A164452C8  current D460C45A164452C8  identical
```

All three prefixes match the hashes §12.4 quotes. That establishes the restores were byte-perfect and
the quoted hashes are genuine — it does not by itself establish that the mutations were made, which is
why I re-executed two of the three.

---

## 6. §12.5.1's schedule-contamination account — what is supported and what is not

Separating observation from inference, as instructed.

**Supported.** The observation itself (two full runs, roughly twenty failures outside Set Groups,
reproducing identically — which does rule out ordinary flakiness). The diagnosis mechanism: an
un-hooked `applyScheduleOverride` in a throwaway diagnostic spec is a *sufficient* cause, because
Playwright is pinned to `workers: 1` against one account and one active block, and every one of the
named specs resolves Today through that block's schedule. The restoration: the SQL is quoted and was
followed by a confirming `SELECT`. The account is also correctly framed as this pass's own fault rather
than a product defect, and it was root-caused with a read-only query rather than by re-running until
green, which is the right instinct.

**Not established by that evidence alone.** The sentence *"fully confirming the schedule row was the
sole cause and that the affected suites were never actually broken by this pass's source changes."* A
clean run after repairing the data is *consistent with* sole causation but does not demonstrate it — the
data fix and "no source defect" are not separable by that single run. The primary evidence is also now
unrecoverable: `gymapp_t_sgbrem` has been dropped, so neither the bad state nor the restoration can be
re-examined by anyone.

**What I can add.** I ran the full suite once, on a **brand-new** disposable database, first attempt,
with no schedule surgery of any kind, against the same delivered tree: **171 passed, 0 failed.** That is
the evidence the conclusion needed, because it tests the delivered code rather than a repaired
environment. I also confirmed the delivered tree carries no `zzdiag-*` spec and that every delivered
spec calling `applyScheduleOverride` also calls `restoreSchedule` (`setGroups.spec.ts` and
`setGroupsOffline.spec.ts` through the shared `afterEach`; the other four inline). With that, the
conclusion stands; the wording should have been "not reproduced on a clean database, and no delivered
spec leaves a schedule override behind" rather than "fully confirming… sole cause".

**Kept separate: the historical Stage A dead letter.** The unresolved single `setGroupsOffline.spec.ts`
dead-letter observation from Stage A is a distinct matter from these environment failures and has
nothing to do with them. In my 171-test run that spec passed and `waitForOutboxDrained` threw nowhere in
the suite. That is one more non-reproduction on the tally; it narrows nothing, reopens nothing, and the
cause remains unresolved with its instrumentation live.

---

## 7. Findings of my own

### V-1 — MEDIUM — "permanently unreachable" is false; a stale pending record returns on unlink

§12.2 rejects write-time supersession partly on the grounds that *"a merely-pending record that becomes
permanently unreachable can never reach that path either."* The bail-out is keyed on the group's
**current** link status, so "permanently" does not hold, and nothing supersedes the record in the
meantime: `evaluateGroupedExercise` skips a linked group, so no result is produced for its key, so
`supersedePending` is never called for it — however many sessions are completed.

Reproduced in the browser, three consecutive runs:

```text
after session 1 (unlinked): [{Top: 142.5}, {Back-off: 102.5}]
while linked:               [{Top: 142.5}]                      <- F-2's fix working
after session 2 (linked, Back-off actually logged at 95 kg):
after UNLINK:               [{Top: 147.5}, {Back-off: 102.5}]    <- the session-1 record, back
on the card:                Accept buttons = ["Accept 147.5 kg", "Accept 102.5 kg"]
Back-off prefill:           "102.5"   (stale target; last ACTUAL Back-off load was 95)
```

So on unlink the athlete is offered, and prefilled with, a target computed two sessions earlier, while
Top's own record was correctly superseded in between. Once accepted it becomes an `accepted` row and can
then reach `groupPrefills` through `getLatestDecisionChosenByExercise` — the path §12.2 argues is
closed.

**Severity reasoning.** This is not a new defect *class*: a Stage A group switched to a `manual`
per-group override behaves the same way — the engine skips it, its pending record is never superseded,
and `resolveGroupRecommendation` has no manual bail-out at all, so the stale card simply shows
continuously. Stage B's link hides it while linked and unhides it on unlink. The remediation's chosen
fix shape is therefore still right, and §12.2's *other* reason for rejecting write-time supersession
(no reliable `blockId` to scope `supersedePending` against, since a template may be scheduled by more
than one block) is sound and would be a genuine scope expansion to solve. What is wrong is the claim of
permanence, and the fact that the resulting limitation is nowhere disclosed — not in §12.7's
limitations, not in the review's §8.3 carry-forward list.

**Action taken.** Not fixed (correctly outside a bounded remediation of F-1…F-9). I added a
clearly-attributed withdrawal pointer beside the sentence in §12.2 (§8 below) so it cannot be read as
current, and it should be carried forward as an open limitation alongside L-7 and L-8.

### V-2 — LOW — F-6's warning is erased by the next keystroke

`updateGroups` calls `setLinkNotice(...)` unconditionally on **every** group-list mutation, so the
notice is reset to `null` by the next one, including an unrelated edit to a different field of a
different group. Observed: after removing the reference group, the F-6 message appeared; after a single
change to `Sets max` on the surviving group, it was gone.

§12.7 records the transience but files it as "out of the review's named scope… worth a future LOW
finding if device acceptance surfaces it as a real confusion". Scope is an accurate statement about
authorisation and a poor reason to leave the consequence unranked, so, judging the consequence: the
flow F-6 exists to protect is *clear a link, then keep editing*, and in that exact flow the warning
usually does not survive to be read. F-6 is therefore fixed in wording and only partially effective in
practice.

It stays LOW because the state the notice warns about is not hidden: with `linkEnabled` false the
group's own "Progression strategy for this group" select is rendered again, showing "Same as exercise"
— confirmed in the same probe. The user can see the consequence in the form even after the sentence
about it disappears. A one-line fix exists (only clear the notice on a mutation that itself clears
nothing, or make it dismissible) but is outside this remediation's authorisation.

### V-3 — LOW — the F-1 test's delete guard is vacuous

`setGroups.spec.ts:972` asserts `expect(page.getByText("160 kg × 2", { exact: true })).toHaveCount(0)`
after deleting the reference set. `formatSetLine` renders a `load_reps` set with a non-null RIR as
`160 kg × 2 @ RIR 2`, so an **exact** match on `160 kg × 2` is zero before and after the delete — the
guard can never fail. I hit precisely this in my own first probe attempt, where it let a delete that
never happened pass unnoticed.

The test's conclusion is unaffected: the two assertions that follow (`weightInput` = `110` and the
fallback note) can only pass if the delete really occurred. But the guard would not catch a regression
in which the delete silently stopped working, which is what it was written for. A non-exact locator
(`li:not(:has(li))` filtered on `160 kg`, asserted `1` before and `0` after) fixes it.

### V-4 — LOW — two inaccurate statements in §12.8, corrected in place

Both are the kind the task authorises me to fix directly; both are **my own edits**, recorded here and
marked as such in the implementation report, and **not independently reviewed by anyone else**:

1. **"Created and dropped" versus backups left in `%TEMP%`.** The heading claimed the three negative-control
   backups were dropped; the bullet underneath said they were "left in `%TEMP%`". They were still there
   when I checked (and I used them, in §5.1, to corroborate the restores). I split the heading so the
   three backups sit under "Created and left in place (outside the repository)" and the two deleted
   diagnostic specs stay under "Created and dropped".
2. **"the only file this task is authorised to modify."** That is carried over from the original pass's
   report-only cleanup section (§11), where it was correct. It contradicts §12.3's own manifest: a
   bounded remediation of F-1…F-9 necessarily changed five source files, four test files and one
   architecture document. Reworded to say so.

Nothing substantive was altered: no disposition, no evidence claim, no count, no verdict.

---

## 8. Documentary edits I made

Three, all in `docs/reviews/set-groups-stage-b-implementation.md`, each carrying an inline HTML comment
naming this report, the finding, and the fact that it is my own unreviewed edit:

1. **§12.2** — a withdrawal pointer beside the "permanently unreachable" sentence (V-1). The sentence is
   left in place for provenance under an explicit do-not-rely marker, the pattern this lineage already
   uses; the fix it justifies is explicitly *not* reopened.
2. **§12.8** — the "Created and dropped" heading split (V-4.1).
3. **§12.8** — the "only file this task is authorised to modify" bullet (V-4.2).

`docs/` is `.prettierignore`d, so no `format:check` applies to these (agent-workflow §5's documentation
row excludes ignored files); `pnpm format:check` on the whole tree is green regardless (§5, gate 4).

---

## 9. Verdict

The two HIGH findings that blocked the gate are fixed at the correct layers and I reproduced both the
pre-fix defects (by re-executing their negative controls) and the post-fix behaviour (by my own probes),
rather than accepting the remediation's account of either. F-3 through F-9 are fixed and verified,
including the three F-1 guard interactions the remediation's own test leaves uncovered, the frozen-session
semantics F-2's fix depends on, and the honest-fallback text F-7 promises. Every suite is green on an
isolated pairing, with the E2E suite green on its first run against a brand-new database — which is also
the evidence §12.5.1's conclusion was missing.

What remains is one MEDIUM that is a defect of *justification and disclosure* rather than of the fix
(V-1: the stale record's return on unlink, a pre-existing behaviour class that the remediation
mis-described as impossible — now marked withdrawn and carried forward as an open limitation), and three
LOWs (V-2's short-lived warning, V-3's vacuous guard, V-4's two corrected sentences). None prevents the
next gate under agent-workflow §4, and none is a product defect in the linked-load feature itself.

**VERIFIED — READY FOR SET GROUPS A+B RELEASE CLOSEOUT**

Carried forward, open, and consciously accepted: **V-1** (stale pending record returns on unlink; no
supersession path for a non-evaluating group — alongside the pre-existing Stage A `manual`-group case),
**V-2**, **V-3**, plus the inherited **L-7** (reverse-conversion pending-record asymmetry), **L-8**
(`assignGroupKeys` trusting a client-supplied key, widened slightly by `link.ref`), and the general
Stage A group add/remove/reorder browser-coverage gap. The historical `setGroupsOffline.spec.ts`
dead-letter remains unresolved and instrumented, unchanged.

A+B remain one release. This verdict authorises neither a standalone Stage A nor a standalone Stage B
deployment, and no commit, push or deployment was made or attempted. **Physical iPhone device acceptance
is still outstanding** and has no substitute.

---

## 10. Drop what you created, list what you did not

**Created and dropped:**

- Database `gymapp_t_sgbverif` — created, migrated, seeded twice, used for every gate, probe and
  negative control here, then `DROP DATABASE`d. `SELECT datname … LIKE 'gymapp_t_%'` returns no rows.
- One production app server on :3000 bound to it — started, restarted twice for NC-F1, stopped. Port
  confirmed free afterwards. No other server was started or stopped.
- `tests/e2e/verifyProbeStageB.spec.ts` — temporary task-owned probe spec; deleted, `git status` shows
  no trace.
- `test-results/` — Playwright artefacts from the probes; removed.
- Two negative-control mutations (`src/ui/workout/ExerciseCard.tsx`,
  `src/server/progression/service.ts`) — restored byte-for-byte, SHA-256 verified, and the restored tree
  re-verified green (§5, gate 15).

**Created and left in place (outside the repository):**

- My own two backup files (`ncf1.bak`, `ncf2.bak`) in this session's scratchpad directory, plus the
  suite logs. Outside the repo, session-scoped.

**Created and deliberately left behind:**

- This report, and the three attributed documentary corrections in
  `docs/reviews/set-groups-stage-b-implementation.md` (§8) — uncommitted, like the rest of the Set
  Groups lineage.

**Not created, not dropped, deliberately untouched:**

- The shared `gymapp` database — never written to; `1 | 1859 | 433` before and after; its `0014`
  migration left as-is.
- The remediation pass's three `%TEMP%` backup files — not mine to delete; I read them for the §5.1
  corroboration and left them exactly as found.
- The five pre-existing `gymapp_*` disposable databases from earlier tasks, the `gym-app-db-1`
  container (already running, left running), every earlier report in the Set Groups lineage, and all
  concurrent PI-017 work.
