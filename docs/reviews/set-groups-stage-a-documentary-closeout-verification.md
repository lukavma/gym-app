# Set Groups (PI-012) Stage A — documentary closeout verification

**Date:** 2026-09-13
**Tree:** `583a9ab` (dirty) — Stage A with the §14 documentary corrections applied, alongside the
concurrent PI-017 repository-agent-workflow documents that lineage already lists.
**Role:** documentary closeout verification (no engineering checks re-run; three bounded citation fixes
made directly in the implementation report under this task's explicit authorization — §3)
**Session:** `S9 | PI-012-A | Closeout — documentary verification`
**Model:** claude-opus-5 (1M context)
**Inputs read:** [set-groups-stage-a-remediation-verification-2.md](set-groups-stage-a-remediation-verification-2.md)
§3 (the four required corrections) and [set-groups-stage-a-implementation.md](set-groups-stage-a-implementation.md)
§14 plus every passage §14 references (§12.1's L-3 row, §12.3.3, §13.1's V-3 row, §13.2, §13.4).
**Scope:** documentary only. The code and tests were independently verified in the two prior reports and
are not re-examined here; no closed finding is reopened. Stage A and Stage B remain a joint release.
**Verdict:** see §5.

---

## 0. Summary

All four documentary corrections are genuinely applied to the passages themselves, not merely asserted in
a table. §12.3.3 — the section that was untouched last round and was the sole blocker — now carries its
original wording quoted inside an explicitly superseded block, followed by a corrected account that
withdraws the environmental/timing-margin framing with the right reason, deletes the false
"five full runs" sentence outright, fixes the C-5 mislabelling by naming the actual test and line, and
states the single observation separately from the reproduction attempts with each attempt attributed to
whoever made it. The L-3 row quotes and retracts its disproved parenthetical and states the verified rule
in its place. §13.4 is retitled, says plainly "This is NOT the replay/subsumption evidence", and redirects
that claim to the integration tests and the executed negative control. §13.1's pointer to a nonexistent
correction block is gone, replaced by an honest note that the row summarises a correction living elsewhere.

I searched the document for every retracted phrase and confirmed each surviving occurrence is either inside
a passage marked superseded, or a "Finding" column describing the problem being corrected, or §14's own
record of what it changed — no live competing assertion remains, and every section cross-reference
resolves.

Three residual citation defects remained, all bounded and all of a kind this task authorizes me to fix
directly: a miscited section for the first verification's reproduction count (twice), one mischaracterised
run, and an opaque ad-hoc label. I corrected all three in the implementation report and recorded them
there as my own edits in a new §14.1, so the document does not read as though the remediation pass authored
them. Nothing else was changed: no source, test, configuration, database, build or suite.

---

## 1. The four required corrections

### 1.1 The original observation remains recorded, cause unresolved, attempts correctly attributed — MET

§12.3.3's bullet is now headed *"1 dead-lettered failure in `tests/e2e/setGroupsOffline.spec.ts`, observed
once, cause unresolved"*, and the corrected account states *"this is the one and only observed occurrence;
its cause is unresolved."* The observation itself is preserved, not erased by the correction — which was
the specific risk in §3.4 of my previous report.

Attribution is now exact, and in the right direction. The report claims for itself only the runs it made:
the second full run (where it was observed), the third, the final clean run, and §13.4's residual-pass run.
The further reproduction attempts are attributed to the two verification reports by name, with the
qualifier *"reported there as their own evidence, not re-executed or independently confirmed here"* — which
is the correct posture for an implementer citing someone else's evidence.

§13.2's limitations bullet matches: **"observed exactly once"** on the named run, **"Not reproduced
since"** in each subsequent run listed individually, then the verifications' combined 12 executions cited
separately. The phrase "not reproduced in any prior run", which erased the observation, is gone from the
document entirely.

The separation of the `offline-bodyweight-recovery.spec.ts` flake is also handled correctly: §12.3.3 now
calls it *"a SEPARATE matter, independently corroborated as pre-existing and load-sensitive across both
verification reports (three distinct tests in that file, each a visibility timeout, each passing in
isolation) — that explanation is specific to that spec and does not transfer to the still-unresolved Set
Groups dead-letter observation."* That is precisely the boundary the prior rounds established, stated
without over-reach in either direction.

### 1.2 The old L-3 convergence explanation is clearly superseded by V-2 — MET

§12.1's L-3 row now quotes the original parenthetical in full, marks it **"superseded by independent
verification V-2 (§13.1) and must not be read as a current description of the mechanism"**, names all
three of its clauses as disproved, and states the implemented rule in its place: the forcing decision
defers whenever a later op in the same batch touches `isWarmup` or `groupKey`, and is made by whichever op
is provably last to touch either field.

The row's evidence column is also corrected rather than left to imply more than it covers: the L-3
integration test is labelled *"(single-op case; §13.1's V-2 tests cover the multi-op/subsumption case this
row's original justification got wrong)"*. That closes the gap where a reader could have taken the L-3 test
as covering the subsumption interaction.

### 1.3 Replay/subsumption evidence points to the integration tests and negative control; E2E is browser/regression evidence — MET

§13.4's E2E subsection is retitled *"browser verification for V-3's changed diagnostics, plus a regression
check that neither fix disturbed the offline/PWA surface"*, with **"This is NOT the replay/subsumption
evidence"** in the heading itself. The correction block beneath the run output states that no E2E run could
exercise a defect unreachable from any shipped emitter, and redirects: *"The replay/subsumption evidence is
the real `applySyncBatch`/SQL integration coverage in §13.1's V-2 row and the four tests in §13.3, together
with the executed negative control described there."*

It then states what the E2E run does contribute — V-3's browser verification (`dead-letter.spec.ts:393`)
and a regression check on the sync/offline surface `applySetLogUpsert` sits inside. Both are real
contributions, correctly scoped. The self-contradiction is resolved by moving the claim rather than by
qualifying it after the fact.

### 1.4 No competing current claims or nonexistent correction references remain — MET

The nonexistent-block pointer is gone. §13.1's V-3 row now ends: *"**§12.3.3 itself, corrected in place** —
see that section directly; this row is a summary of what changed there, not the correction's location."*
The row also records honestly that the first attempt had not been applied at all, rather than quietly
fixing it.

Phrase-by-phrase audit of every retracted formulation:

| Retracted phrase | Surviving occurrences | Each one's status |
|---|---|---|
| "established as pre-existing" | 3 | 1 inside §12.3.3's superseded blockquote; 2 in §14's record of what it changed |
| "load-sensitive timing margins" | 4 | 1 in the superseded blockquote; 1 in §13.1's Finding column; 2 in §14's record |
| "passed in every one of the five full runs" | 2 | 1 in the superseded blockquote; 1 in §13.1's Finding column |
| "C-5" | 5 | 1 in §12.3.3's corrected account explaining the former mislabel; 1 Finding column; 3 in §14's record |
| "safe for batch convergence" | 2 | 1 in the L-3 row's own superseded quotation; 1 in §14's record |
| "not reproduced in any prior run" | 1 | §14's record only — gone from the live text |
| "see immediately below the un-corrected" | 1 | §14's record only — gone from the live text |
| "real batch replay/subsumption coverage" as a live claim | 0 as an assertion | only inside §13.4's own correction block, quoting the requirement it redirects |

No surviving occurrence is a live, uncorrected assertion. The superseded blockquote is unmistakably marked
(*"Superseded, retained for provenance only — do not rely on this paragraph"*), which is the §6.4 pattern I
pointed to as acceptable. Every `§`-reference appearing in §12.3.3, §13 and §14 resolves to a section that
exists.

---

## 2. What I did not re-examine

Per this task's instruction, and because the two prior reports already establish it on executed evidence:

- **V-1 and V-2's code and tests.** Verified in
  [remediation-verification-2](set-groups-stage-a-remediation-verification-2.md) §1–§2 with my own
  reproductions, a source-level negative control that reproduced each original defect, and a byte-identical
  restore. I confirmed only that the two verified lines are still present and unaltered
  ([`service.ts:1174-1175`](../../src/server/sync/service.ts#L1174-L1175),
  [`groupEvaluation.ts:129`](../../src/domain/progression/groupEvaluation.ts#L129)) — a two-line grep, not
  a re-verification.
- **V-3's diagnostics and browser coverage.** Verified previously, including the passing
  `dead-letter.spec.ts:393` run.
- **Every suite and gate.** Unit 1365, integration 501+17-skipped, the four quality gates, the offline
  subset and the bootstrap were all executed in the prior round on this same code; §14 changed no source,
  test or configuration file, and I confirmed that (`git status` delta unchanged; the only files I edited
  are markdown).
- **All M-1…M-6 / L-1…L-9 findings and the Stage A architecture.** Closed in the earlier reports; not
  reopened, and no new evidence arose that would warrant it.

No database was accessed, nothing was built, staged, committed, pushed or deployed.

---

## 3. Three citation fixes I made directly

These are **my own edits**, made under this task's explicit authorization for bounded documentary fixes.
They were not authored by the remediation pass and have not been independently reviewed by anyone else. I
recorded them in the implementation report itself, as a new §14.1 attributing them to me, so that document
is self-describing rather than appearing to have been written entirely by its own author.

1. **Miscited section, two places** (§12.3.3 and §13.2). Both cited the first verification's
   reproduction-attempt count as "§3.3(d)". That count is in that report's **§2, under V-3(d)**; its §3.3 is
   the "Inherited, not re-run" section. Corrected to `§2, V-3(d)` in both places.
2. **Mischaracterised run** (§12.3.3). The second verification's further execution was described as "1
   further full run". It was one run of the 17-file `test:e2e:offline` subset, not the full 39-file suite.
   Corrected to name the subset, and the citation repointed from "§0/§3.4" to **§4.1 item 10**, which is
   where that run is actually recorded. The combined total of 12 further executions is unchanged and
   correct.
3. **Opaque ad-hoc label** (§13.1's V-3 row). "Independent verification V-3(2)" replaced with an explicit
   document and section citation (`set-groups-stage-a-remediation-verification-2.md` §3.1), since "V-3(2)"
   is not a label defined anywhere.

Nothing substantive was altered: no disposition, no evidence claim, no count, no verdict. `prettier --check`
is clean on the edited file, and the `git status` delta is unchanged (the implementation report is
untracked, so in-file edits do not add a status entry).

I deliberately did **not** touch two things I noticed but judged correct as they stand: §13.4's reference to
"the four tests in §13.3" (§13.3's manifest does record them, so the pointer resolves), and §12.3.3's
retention of the false sentence inside its superseded blockquote (quoting withdrawn text under an explicit
do-not-rely marker is the provenance pattern I endorsed, not a surviving claim).

---

## 4. Dispositions

| ID | Disposition |
|---|---|
| **V-1** | **Closed.** Code and test verified in the prior round; §14 made no change to either. Untouched here. |
| **V-2** | **Closed.** Code, four regression tests and my own executed negative control verified in the prior round. §14's documentary work correctly stops claiming E2E as its evidence (§1.3) and correctly retracts the L-3 justification it disproved (§1.2). |
| **V-3** | **Closed — both halves.** The mechanism was already verified. The report correction, missing last round, is now genuinely applied to §12.3.3 itself: observation preserved, cause stated unresolved, framing withdrawn with the correct reason, false sentence deleted, C-5 mislabel fixed, attempts attributed per report (§1.1, §1.4). |
| **V-4** | **Closed.** M-4's row states inherited coverage; §12.3.3 and §13.4 agree; no competing claim of a direct run remains. |
| **V-5** | **Closed.** M-5's file list and chronology were corrected in the prior round and are unchanged — still accurate against what I measured on 2026-09-12. |
| **V-6** | **Closed.** The three real errors stay fixed (§4 heading date, L-9's §12.3.3 citation, §12's explicit naming of the architecture evaluation for §19); the fourth was correctly left alone. The three further citation defects found here are fixed in §3 above. |

---

## 5. Verdict

The documentary blockers are resolved. §12.3.3 — the one section that mattered and the one that had not
been touched — is corrected in place, in the form I specified: the original wording preserved under an
unambiguous supersession marker, the false sentence deleted rather than relabelled, the withdrawn framing
withdrawn for the right reason (a terminal `dead` count cannot be a timing margin), the mislabelled test
named correctly with its line number, and the single observation held separate from the reproduction
attempts with each attempt credited to whoever ran it. The L-3 row no longer offers a disproved mechanism
as current. §13.4 no longer claims evidence it cannot supply, and points instead at the integration
reproduction and negative control that genuinely carry V-2. The dead reference is gone, and no retracted
phrase survives anywhere as a live assertion.

The remaining defects were three citations, which I fixed directly and attributed to myself in the report's
new §14.1 rather than leaving them to another round. The record now matches the engineering, and the
engineering was independently verified over the two prior rounds — including a reproduction of the critical
batch behaviour and a negative control that reproduced each original defect before restoring the fix.

Two things carry forward unchanged and are honestly recorded in the report, not hidden: the
`setGroupsOffline.spec.ts` dead-letter observation's cause remains **unresolved**, now instrumented so the
next occurrence is diagnosable from the test's own output; and the previously accepted Stage A limitations
(L-7, L-8, browser-level group remove/reorder, the grouped warm-up-then-reload case) stand as accepted.
None is a Stage B blocker, and Stage B's implementation should treat the dead-letter instrumentation as
live: it writes to the same per-group sync field.

Stage A and Stage B remain a joint release. This closeout authorizes neither a standalone Stage A
deployment nor device acceptance, and no commit, push or deployment was made or attempted.

VERIFIED — READY FOR SET GROUPS STAGE B IMPLEMENTATION
