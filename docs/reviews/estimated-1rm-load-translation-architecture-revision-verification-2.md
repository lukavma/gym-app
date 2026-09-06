# Estimated 1RM Tracker & Load Translation — Second Targeted Verification of the Architecture Revision

Date: 2026-09-05
Role: second, narrowly scoped verification of `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` (below, **the revision**, as updated by its §25 correction pass) against **§9 of** `docs/reviews/estimated-1rm-load-translation-architecture-revision-verification.md` (below, **verification 1**). Verification only — no code, schema, migration, seed, test, evidence file, backlog entry, or existing report was created or modified. Nothing was committed, pushed, or deployed. No database was started or contacted.
Repository state read: `main` @ `7d6bc6c`, plus the uncommitted working tree.
Scope of change: **this file only.** See §7.

**Scope discipline, as instructed.** This pass checks exactly three things: (a) that each item in verification 1 §9 is closed by the change the revision's §25 claims for it; (b) that the document remains internally coherent after those changes; (c) that it remains implementation-ready. Anything verification 1 listed under **"Unchanged and correct — do not revisit"** was not re-audited; it was only checked for *collateral damage*, by re-reproducing the fixtures that exercise it. **No owner question is decided here, and none of the revision's twenty owner decisions was treated as settled.** The F-1 warm-up-set-classification remediation remains out of scope: its files were not read for content, evaluated, or touched.

Identifiers: **V2-M-n** / **V2-L-n** are findings *new to this pass*. `VH-n` / `VM-n` / `VL-n` are verification 1's. The revision's `V-n` / `I-n` / `A-n` / `K-n` / `O-n` are its own.

---

## 1. Verdict

# `VERIFIED — ALL §9 ITEMS CLOSED`
### two corrections required, both in text the correction pass itself added

**Every item in verification 1 §9 is closed.** All two blocking findings, all five "should fix" findings, and all six editorial items were checked against the section §25 names for them, and each change delivers what it claims. The two most consequential — the VH-1 candidate restriction and the VM-1 gate replacement — were re-derived independently rather than read: the new consistency gate was reimplemented from its own definition and reproduces **all six** of the revision's worked rows plus four adversarial cases of mine, including the `[130, 13, 14]` two-typo case that defeated the previous rule.

**No regression.** Every §22 fixture still reproduces exactly (110.0 / 102.5 / 90.0 / 95.0 / 115.0), the §7 observation fixtures are unchanged, the 39 constants and 20 owner decisions are intact, "None of these is decided" is preserved, and no owner decision was taken or added.

**Two corrections are required, and both are in newly written text rather than in any rule:**

1. **V2-M-1 — `A-31`'s first clause is factually wrong.** The criterion added to close VH-1 asserts that a session `60×5, 80×5, 100×3` + `3 × 110×8` "contributes **no** candidate" for a 5-rep target. Reproduced: the sub-modal `60/80/100` groups are correctly excluded, but the *admitted* `110×8` group has `modalReps = 8`, so `d = 3` load-up — a **`far`-tier candidate**. The session does contribute one, and `basisSessionIds` will name it whenever no nearer tier exists. As written the criterion fails; the hazard is that an implementer "fixes" it by suppressing the whole session, re-opening VH-1 from the other side.
2. **V2-M-2 — `V-19`'s "candidate basis" is undefined and collides with the document's own definition of "basis".** §9.2/§9.4/§9.5 use *basis* for the tier-selected groups, but V-19 runs "before tier selection", so it cannot mean that. Only one reading makes the new removal-and-re-selection language coherent, and the stricter gate makes the choice of reading decide whether the system refuses.

Neither changes a rule. Three low items (V2-L-1…V2-L-3) are precision fixes. **After V2-M-1 and V2-M-2 the document is implementation-ready**, gated only where it places its own gates: the F-1 external gate, an owner addendum on `O-1…O-20`, `evidence-to-design.md` row 20, and the OD-06 amendment ADR.

---

## 2. Closure of every §9 item

| §9 item | Claimed in §25 | Verified | Status |
| --- | --- | --- | --- |
| **VH-1** candidates not restricted to admitted groups | V-14 restricted; "Admitted group" added to §5; I-13 widened; A-31 added | `V-14` now reads "the **admitted load groups** … A group its own observation excluded — sub-modal or implausible — is **never** a candidate, whatever its rep count", with both worked examples. §5 defines **Admitted group** as "never contribute to the session value **or to any suggestion basis**". `I-13` now covers *both* exclusion kinds and *both* destinations | **Closed** (see V2-M-1 for A-31's wording) |
| **VH-2** `A-9` / §12 monotonicity false | §12 restated as three properties; A-9 restated with the plateau fixture | §12 now states `rawLoadKg` strictly decreasing, emitted `loadKg` non-increasing with cap/floor plateaus, and disclosure by `tier`/`basisSessionIds`. The plateau table matches my independent computation digit for digit: RTF 4–8 all emit 110.0 while raw runs 122.94 / 119.43 / 116.11 / 112.97 / 110.00; RTF 9–12 emit 105.0 / 102.5 / 100.0 / 97.5. `A-9` tests all three | **Closed** |
| **VM-1** trim rule certifies two errors as agreeing | Replaced by a unique-consistent-majority-of-≥3 rule; §7.7 extended; §11, K-22, RM-4 aligned; A-32 added | Reimplemented and reproduced — see §3 | **Closed** |
| **VM-2** carry-forward winner rule duplicated | Shared `resolveCarryForwardCandidate`; `CarryForwardCandidate` gains optional `sessionId`/`repBasis`; V-2, I-3, §10.4, §14.5, A-14 aligned | `V-22` now requires the rep basis to come "**by the same function that selects the prefill's carry-forward winner** — never by a parallel re-derivation". The wrapper is specified as `resolveCarryForwardCandidate(...)?.firstWorkSetLoadKg ?? baselineLoadKg ?? null`; I checked it algebraically against the current implementation and it is behaviour-identical for every input, **including** the two edge cases that could have broken it (`firstWorkSetLoadKg === 0` survives `??`; `baselineLoadKg === null` falls through to `null`). `A-14` now asserts the equivalence over the existing fixtures — the right drift guard | **Closed** |
| **VM-3** `I-1` rests on an unstated precondition | V-23 states the gate input is the bundle's `pendingRecommendation`; I-1, §14.5, A-22, RH-1 aligned | `V-23` names the field, the two code sites (`activeSession.ts:276`, `:468`), and — crucially — adds the prohibition: "The strength service must **not** determine pendingness from its own `recommendations` query". §14.5 repeats it as a boundary rule, and `A-22` asserts the single-snapshot coupling per bundle entry | **Closed** |
| **VM-4** pre-toggle ramp consequence unstated | V-22 transitional paragraph; §18 step 4(c) | `V-22` now carries a full paragraph naming both failure directions (spurious suppression, spurious firing), bounding the blast radius to the gate, and stating when it ends. §18 step 4(c) now requires classifying each replay firing as "gate correct", "gate wrong", or "pre-toggle ramp basis" before drawing conclusions | **Closed** |
| **VL-4** 50 codes used, enum never declared | §15.4 declares 48 by level with emitters and phrasing; I-14 / A-19 reference it; `MIXED_LOADS` renamed; five non-members named | Machine-checked — see §4. Count is exactly 48; every member is used elsewhere in the document; the only §15.4-exclusive tokens are the five deliberately-named non-members; the `MIXED_LOADS` rename is complete (the one surviving occurrence is inside §25's own description of the rename) | **Closed** |
| **VL-1** load-up parenthetical | Corrected | Verified exactly: Epley 115.95, Brzycki 117.86, Lombardi **112.80**, O'Conner 114.68, Wathan 116.40, spread **4.4 %**, and the stated band `[102.5, 130.0]` recomputes | **Closed** |
| **VL-2** band vs emitted load on coarse grids | §9.5 step 8 and §15.3 copy rule | Both present; the worked case (`step 5.0`, raw 24.0 → emitted 20.0, band `[20.0, 30.0]`) matches my reproduction, and the copy rule now forbids re-centring the band on the shown load | **Closed** |
| **VL-3** three untagged rules | Tags added | `V-12` `[P]`/`[R]`, `V-14` `[P]`, `V-22` `[R]` — all present. §2's "every rule carries exactly one primary tag" is now true, with V-12's split tag explained per-clause | **Closed** |
| **VL-5** single-session confidence asymmetry | Rationale stated | §11 closes with a dedicated paragraph grounding it in the research's §9.3 ordering and adding a copy requirement ("based on one session") so the two words read as different claims | **Closed** |
| **VL-6** sub-modal group with higher e1RM | Stated with the `100×12` example | §7.3 paragraph 2 states it, names it "the deliberate mirror of §7.5", and gives the exact numbers (140.00 discarded, observation 135.67) | **Closed** |
| **V-17 dead branch** | Deleted; precondition stated | The Mixed row now reads "at least one group `rirComplete`, at least one not" and "the reduced basis always has ≥ 1 group by the row's own precondition". Unreachable branch gone | **Closed** |
| **Header / §1 / §24** | Correction-pass line, verdict, checklist item 8, working-tree impact | All four present; §24 item 8 enumerates the closures for a verifier, and items 1–7 are explicitly kept in force | **Closed** |

---

## 3. The new consistency gate, independently reproduced

`V-19`'s trim rule is replaced by: for `n ≥ 3` with raw spread > 30 %, find the **largest consistent subset** (contiguous runs of the sorted values whose own `spreadPct ≤ 30 %`); continue only if it has **≥ 3 members**, is a **strict majority** of `n`, and is **unique**; otherwise refuse.

Reimplemented from that definition alone and run against the revision's six worked rows plus four cases of mine:

| Consistency set | Raw spread | Largest consistent subset | Reproduced outcome | Revision says |
| --- | --- | --- | --- | --- |
| `[130, 132, 13]` | 91.5 % | `{130, 132}` size 2 | **refuse** | refuse ✓ |
| `[130, 13, 14]` | 835.7 % | `{13, 14}` size 2 | **refuse** | refuse ✓ — **VM-1 closed** |
| `[130, 132, 300]` | 128.8 % | `{130, 132}` size 2 | **refuse** | refuse ✓ |
| `[130, 131, 132, 13]` | 91.5 % | `{130, 131, 132}` size 3, majority of 4, unique | continue, outlier flagged | continue ✓ |
| `[130, 132, 13, 14]` | 850.0 % | tie at size 2 | **refuse** | refuse ✓ |
| `[130, 131, 132, 13, 14]` | 91.5 % | `{130, 131, 132}` size 3, majority of 5, unique | continue, outlier flagged | continue ✓ |
| `[130, 131, 132]` *(mine)* | 1.5 % | — (raw ≤ 30 %) | continue, no outlier code | consistent with `A-32` ✓ |
| `[136, 133, 180]` *(mine)* | 34.6 % | `{133, 136}` size 2 | **refuse** | the stated behaviour change ✓ |
| `[136, 180]` *(mine)* | 32.4 % | n = 2 rule | **refuse** | ✓ |
| `[139.33, 133.00]` *(§22 pool)* | 4.8 % | n = 2 rule | continue | ✓ — §22 unaffected |

The rule is well defined, deterministic, needs no centre estimate, and — the point of the change — **cannot be led by a low outlier**, because it never anchors on the lower median. Two further properties I checked and did not find stated anywhere, both benign and both in the right direction: adding a *good* observation can flip refuse → continue (3 consistent + 1 outlier at `n = 4` continues where 2 consistent + 1 outlier at `n = 3` refuses), and no case exists where adding a good observation flips continue → refuse.

**The cost is disclosed and correctly quantified.** §9.6 states plainly that every `n = 3` inconsistency now refuses, including a genuine-but-implausible high session such as `[136, 133, 180]`, and that the tracker is unaffected (`ESTIMATE_SPREAD_VERY_WIDE` at low confidence, session visible and editable). That is a `[P]` product judgment with its cost on the page, which is the right posture and not this pass's to second-guess. `OBSERVATION_OUTLIER_PRESENT` remains reachable only at `n ≥ 4`, and `A-32` covers exactly that case — so `I-14`/`A-19` reachability still holds.

One residual, correctly identified by the revision itself: `currentE1RM` is **not** recomputed after an outlier is removed from the candidate set, and §9.6 argues the residual effect is safe. The conclusion is right; see V2-L-3 for the mechanism it misdescribes.

---

## 4. Reason-code enum — machine-checked

`§15.4` declares the enum by level with an emitter and a phrasing for each. Checked three ways:

- **Count.** Observation 12 + estimate 10 + refusal 10 *(net of the two shared with the estimate level)* + informational 16 = **48**. The document's "Forty-eight distinct codes" is exact.
- **No used-but-undeclared code.** Extracted every backticked `SCREAMING_CASE` token in the document and subtracted the enum and the constants: nothing is left over. The one apparent survivor, `MIXED_LOADS`, occurs exactly once — inside §25's own sentence describing the rename — while §16 line 658 now correctly reads `MIXED_LOADS_IN_SESSION`. **The rename is complete.**
- **No declared-but-unused code.** Of the 53 tokens appearing in §15.4, exactly four appear *only* there: `REP_DISTANCE_FAR`, `NEARBY_POOLED_DISAGREE`, `PENDING_RECOMMENDATION_COMPATIBLE`, `SOURCE_CURRENT_ESTIMATE_TRANSLATED` — which are four of the five evaluation-era codes the section explicitly names as **non-members**. The fifth, `SESSION_SETS_INCONSISTENT`, also appears in §7.6 as a dropped code. So **all 48 members are exercised elsewhere in the document, and every §15.4-only token is a deliberate non-member.**

`I-14` and `A-19` now name §15.4 as their referent, and `A-19` adds a completeness test across the enum, the copy map, and the table. This is a better close than verification 1 asked for.

---

## 5. New findings

### V2-M-1 — `A-31`'s first clause is factually wrong (medium)

**Where:** §21.2 `A-31`, added to close VH-1.

> "a session `60×5, 80×5, 100×3` (unflagged) + `3 × 110×8` has a sub-modal `60×5` group; for a 5-rep target that session contributes **no** candidate and `basisSessionIds` does not name it."

Reproduced against the revision's own rules:

| Group | Sets | Status | `modalReps` | `d` vs `T = 5` | Direction | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| 60 | 1 | sub-modal → **excluded** | 5 | — | — | not a candidate ✓ |
| 80 | 1 | sub-modal → **excluded** | 5 | — | — | not a candidate ✓ |
| 100 | 1 | sub-modal → **excluded** | 3 | — | — | not a candidate ✓ |
| **110** | 3 | **modal → admitted** | **8** | **3** | load-up | **`far`** (load-up far = 3) |

The exclusion half is right and is what VH-1 asked for. But the session **does** contribute a candidate — the admitted `110×8` group at the `far` tier — and `basisSessionIds` **will** name it whenever no direct or nearby candidate exists elsewhere. The criterion is false as written.

The risk is not the failing test; it is the plausible wrong fix. An implementer chasing a green `A-31` could suppress the whole session rather than only its excluded groups, which would discard legitimate admitted evidence and re-open VH-1 from the other direction.

**Fix (wording only, no rule change):** "…the `60×5` group is not a candidate at any tier; for a 5-rep target the session's only candidate is the admitted `110×8` group at the `far` (load-up, `d = 3`) tier, and `basisSessionIds` names it only through that group — the emitted load derives from 110, never from 60."

### V2-M-2 — `V-19`'s "candidate basis" is undefined and collides with "basis" (medium)

**Where:** §9.6 `V-19`.

`V-19` opens: "Before tier selection, form `consistencySet` = distinct sessions in `pool ∪ candidate basis`". But **basis** is defined throughout §9.2, §9.4 and §9.5 as the *tier-selected* groups ("its basis is the up-to-three most recent candidate groups in that tier"), and V-19 runs *before* tier selection — so "candidate basis" cannot mean that. The same rule then uses two further terms for the same thing: "removed from the **candidate set**" and "re-selected from the remaining **candidates**".

The only self-consistent reading is *pool ∪ every session contributing at least one candidate group*. Under the alternative reading — the tier basis — the removal-and-re-selection step is circular, because tier selection would have to run first.

This ambiguity existed before the correction pass and was benign; the new rule makes it decide outcomes. Because the gate now refuses on every `n = 3` inconsistency, whether a distant `far`-tier session is counted in `consistencySet` can be the difference between a suggestion and a refusal:

> Pool `[136, 133]` (two sessions, consistent). A third session in the window has one candidate group at the `far` tier with an observation e1RM of 300. Under the "all candidate sessions" reading: `n = 3`, raw spread 125 %, largest consistent subset `{133, 136}` size 2 → **refuse**. Under the "tier basis" reading, with the direct tier non-empty: `n = 2`, spread 2.3 % → **continue**.

**Fix (one phrase):** replace "`pool ∪ candidate basis`" with "`pool ∪ the sessions contributing any candidate group (§9.1)`", and use "candidate set" consistently for the rest of the rule.

### V2-L-1 — `A-31`'s second clause is loose (low)

"for a 5-rep target the basis is the `110` group and the emitted load is ≤ 110 × 1.10". True, but satisfied by the **global** cap alone (121.0). The tight bound is the **direct-tier** cap: basis = the 110 group at `d = 0`, so the emitted load is ≤ **110.0**. As written the criterion would not catch a regression that dropped the direct-tier cap while keeping the global one — which is precisely the `RH-3` defect the direct cap exists to prevent. Assert `≤ 110.0`.

### V2-L-2 — `I-2`'s "for the suppression gate only" is now stale against `V-23` (low)

`I-2` still reads: "…and — for the suppression gate only — the `chosen`/`inputs` of the latest accepted/modified decision." After the correction pass, `V-23` and §14.5 both state that the decision read is for the **rep basis of a decision chain head**, and that the strength service must *never* query `recommendations` to decide pendingness. `I-2` is not wrong (the rep basis does feed the `CARRY_FORWARD_REP_COMPATIBLE` gate), but "suppression gate" is now the one phrase in the document that could be read as licensing exactly the query `V-23` bans — and VM-3 was raised because that coupling is easy to break. Reword to "for the decision chain head's rep basis only (V-22)".

### V2-L-3 — §9.6 misdescribes the high-outlier mechanism (low)

§9.6 justifies not recomputing `currentE1RM` after outlier removal with: "a low outlier left in the pool can only lower the suggestion further, and a high one only makes the cross-check non-binding". The low half is right. The high half is not: `currentE1RM` is the **lower median** of the pool, which is robust to a single high outlier at `n = 3` (and at `n = 2`, where it is the minimum) — so a high outlier leaves `currentE1RM` **unchanged**, and the pooled cross-check is *unaffected*, not "non-binding". The safety conclusion survives unaltered; only the stated mechanism is wrong, and it is the one sentence in the paragraph a reader would rely on.

---

## 6. Coherence and no-regression checks

| Check | Result |
| --- | --- |
| §22 target fixtures after the correction pass | 110.0 / 102.5 / 90.0 / 95.0 / 115.0 — **all reproduce exactly**, unchanged from verification 1 |
| §7 observation fixtures | Set-count invariance (139.33 at 3 and 5 sets), plausibility band 162.80 / 171.60, pyramid 160.00, +10.96 %, +9.09 % — unchanged |
| `V-2` / `I-3` vs the new `carryForward.ts` edit | Reconciled explicitly and scoped: V-2 now names "the single permitted touch", I-3 reads "behaviour-identical … the only edit is the additive `resolveCarryForwardCandidate`", §10.4 repeats it, and `A-29` (existing suites pass unmodified) plus `A-14` (wrapper equivalence) prove it. **No contradiction** |
| `A-27` boundary vs §14.5's new import permission | No conflict: `A-27` lists prohibitions for `src/server/strength/**` (`evaluateSession`, `loadProgression`, `repProgression`); §14.5 adds `resolveCarryForwardCandidate` as permitted and adds the new `recommendations`-query prohibition |
| §11 confidence table vs the new gate | The `SPREAD_LOW_PCT` row now reads "refuse, unless a unique consistent majority of ≥ 3 exists (§9.6) — then low with `OBSERVATION_OUTLIER_PRESENT`" — aligned |
| `K-22` vs §9.6 | "30 % (pairs; for n ≥ 3, refuse unless a unique consistent majority of ≥ 3 exists, §9.6)" — aligned |
| §20.1 dispositions for RH-1, RM-4, RM-7 | All three re-worded to name the verification findings they now also close (VM-3, VM-1, VM-2/VM-4) — aligned |
| Constants | 39 `K-` rows, unchanged |
| Owner decisions | 20 rows, `O-1…O-20`, "None of these is decided" preserved. **No owner decision taken; none added** |
| Items verification 1 marked "Unchanged and correct" | Not re-audited, per instruction. Checked only for collateral damage by re-reproducing the fixtures that exercise the tier hierarchy, both caps, the floor, and the one translation path: **none found** |
| Design-only status | `src/domain/strength` and `src/server/strength` still absent; no `strength_estimate` anywhere in `src/` or `drizzle/` |

**Implementation-readiness.** After V2-M-1 and V2-M-2 the document is implementable as written. Every constant has a value; every threshold derives from `NOISE_SD_PCT`; every refusal has a code; the code enum is closed and cross-tested; every fixture is reproducible; the one permitted edit outside the feature's own modules is scoped, behaviour-preserving, and covered by an equivalence test. The remaining gates are the ones the revision sets for itself and none of them belongs to a verifier: the F-1 remediation's own verification and commit, an owner addendum on `O-1…O-20`, `evidence-to-design.md` row 20, and the OD-06 amendment ADR.

---

## 7. Working-tree impact

Created: `docs/reviews/estimated-1rm-load-translation-architecture-revision-verification-2.md` (this file). **Nothing else was created, modified, staged, formatted, reverted, or deleted.**

Untouched: the revision and its §25 correction pass; verification 1; the review; the research; the evaluation; every other report in `docs/reviews/`; all of `src/`, `drizzle/`, `tests/`, `docs/architecture/`, `docs/evidence/`, and `docs/input/`; `CLAUDE.md`, `HANDOFF*`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/`.

**All unrelated working-tree changes preserved exactly as found**, including the concurrent F-1 warm-up-set-classification remediation, which was neither read for content, evaluated, nor modified. No repository source file was opened in this pass — every source claim relied on was verified in verification 1 §7.7 and is unchanged at `7d6bc6c`.

No code was implemented. No owner question was decided. No commit, push, tag, deployment, or production access. No database — local or production — was started or contacted.

Temporary artefacts: one Python script (`v2.py`) reimplementing the new consistency gate, the §22 target pipeline, the `A-31` tier derivation, and the five-convention spread, plus two shell inventories of the reason-code enum. All lived in the session scratchpad outside the repository and were deleted after use. No repository code was imported into them.

---

# `VERIFIED — ALL §9 ITEMS CLOSED` · two corrections required (V2-M-1, V2-M-2), three precision fixes (V2-L-1…V2-L-3)
