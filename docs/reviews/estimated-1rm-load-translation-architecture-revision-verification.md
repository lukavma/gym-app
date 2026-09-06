# Estimated 1RM Tracker & Load Translation — Targeted Verification of the Architecture Revision

Date: 2026-09-05
Role: targeted, independent verification of `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` (below, **the revision**) against the two documents it claims to discharge. Verification only — no code, schema, migration, seed, test, evidence file, backlog entry, or existing report was created or modified. Nothing was committed, pushed, or deployed. No database was started or contacted.
Repository state read: `main` @ `7d6bc6c`, plus the uncommitted working tree.
Scope of change: **this file only.** See §11.

Documents verified against:

| Document | Short name | Role in this verification |
| --- | --- | --- |
| `docs/reviews/estimated-1rm-load-translation-architecture-review.md` (2026-09-04) | **the review** | The adversarial findings the revision claims to resolve: `RH-1…RH-4`, `RM-1…RM-13`, `RL-1…RL-15`, recommendations `RC-1…RC-29`, owner decisions `O-11…O-16`. |
| `docs/reviews/estimated-1rm-evidence-research.md` (2026-09-05) | **the research** | The evidence reconciliation: constant classifications `C-01…C-42`, negative results `Ø-1…Ø-11`, the §19 safe formula domain and the §20 architecture implications. |
| `docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md` (2026-09-04) | **the evaluation** | Read only where the revision claims to correct or supersede it. |

Identifiers used here: **VH-n** high, **VM-n** medium, **VL-n** low, **VC-n** confirmations. The revision's `V-n` / `I-n` / `A-n` / `K-n` / `O-n`, the review's `RH/RM/RL/RC/O-n`, and the research's `C-nn` / `Ø-n` always keep their own prefixes and always mean *theirs*.

**F-1 posture, as instructed.** The warm-up-set classification remediation is treated as a separate, in-flight remediation under its own verification. Its files were not read for content, not opened for review, not evaluated, and not touched. This document checks only the *interface* the revision asserts against it (§3, `V-0`) — that the revision depends on `isWarmup` being UI-writable and re-specifies nothing else. Any finding below that mentions warm-up classification is a finding about **the revision's text**, never about the remediation.

---

## 1. Verdict

# `VERIFIED — WITH REQUIRED CORRECTIONS`

**The revision genuinely discharges the review and the research.** All 33 review findings (`RH-1…RH-4`, `RM-1a/1b…RM-13`, `RL-1…RL-15`) carry a disposition, and every load-bearing disposition was checked against the section it names rather than taken on trust. Twelve of the research's thirteen §20 implications are adopted, the thirteenth is rejected with a sound stated reason, and the one place the revision departs from the research's §19 recommended domain turns out to be **correct and the research's recommendation incomplete** (VC-6). Every arithmetic fixture in §7 and §22 was independently reimplemented from the §5–§9 rule text alone and **reproduces exactly** — including the numbers the review had to correct in the evaluation.

The architecture is unchanged and remains right: a pure derivation over immutable `set_logs`, computed on read, no new fact, no sync entity, no persisted aggregate, no progression-engine change, advisory only.

**Two defects must be corrected before implementation.** Neither is architectural; both would surface on the first day of coding.

1. **VH-1 — `V-14` does not restrict suggestion candidates to *admitted* load groups.** Under the literal text, a group excluded from the observation as sub-modal (a historical unflagged ramp) is a valid direct-tier candidate. `I-13` closes the implausible-supra-modal half; nothing closes the sub-modal half. One clause fixes it.
2. **VH-2 — `A-9` and §12's monotonicity property are false as written.** Reproduced on the revision's own headline basis: in the direct tier, target RTF **4, 5, 6, 7 and 8 all emit 110.0 kg**. The property holds for the pre-cap `raw` value only; the emitted load is non-increasing, not strictly decreasing. `A-9` would fail as specified.

**Four medium items should be closed** (VM-1 the trim rule can certify agreement between two errors; VM-2 the carry-forward winner rule is re-implemented rather than reused; VM-3 `I-1` rests on an unstated but verifiable precondition; VM-4 the transitional consequence of unflagged historical ramps for the suppression gate is unstated), and **five low items** are corrections or one-line statements (VL-1…VL-5), including the fact that the revision uses **50 distinct reason codes without declaring the enum**, which leaves `I-14` and `A-19` without a referent.

**Binding separation is clean and is the strongest structural improvement over both predecessors.** §1.1 withdraws every earlier "binding" label with a named repository precedent, §2's tag legend distinguishes evidence from calibrated policy from unresolved owner input, `[E*]` is explicitly barred from user-facing copy and from row-20 citations, and §17 carries all twenty owner decisions as **open** with a recommended default each. The one gap is that three normative rules carry no tag at all (VL-3), contrary to §2's own rule.

**On implementation-readiness.** After VH-1 and VH-2 the design is implementable as written: every constant has a value, every threshold a derivation from one named constant, every refusal a code, and every fixture a reproducible number. The remaining blockers are the ones the revision itself names — the F-1 external gate, the owner addendum on O-1…O-20, `evidence-to-design.md` row 20, and the OD-06 amendment ADR — none of which a verifier decides.

---

## 2. Method

1. Read the revision in full (837 lines), then the review's §4.3–§4.4, §11 (`RC-1…RC-29`), §12 (`O-11…O-16`) and §13, and the research's §19–§21.
2. **Reimplemented the revised algorithm from §5–§9 text alone**, in Python, outside the repository, importing nothing from the codebase: set e1RM, load grouping, modal-group selection with the heaviest tie-break, the plausibility band, `GROUP_SET_POSITIONS`, governing-group selection, pool/current/best, directional tier assignment, per-group translation, the lower median of translated loads, the pooled cross-check, both caps, the finite guard, floor-to-step, and the band. Every number in §7.3, §7.4, §7.5, §8.5 and §22 was recomputed and compared.
3. **Re-derived the tier-cost table independently** (cross-formula disagreement across Epley/Brzycki/Lombardi/O'Conner/Wathan) at the revision's *new* boundaries, including the one distance the research never tabulated (`d = 3` load-up).
4. **Stress-tested** the seven areas named in the task with adversarial inputs: sparse data (n = 1), single and double outliers, coarse load grids, order-of-magnitude typos in every group position, sub-modal groups with higher e1RM than the modal group, and the direct-tier cap plateau.
5. **Spot-verified the repository claims** the revision's resolutions depend on — the active-session recommendation lifecycle, the carry-forward candidate shape, `getExerciseHistory`'s returned rows, `HISTORY_WINDOW`, `userLocalDateString` / `localDateToUtcInstant`, `updateExerciseSchema`'s strictness, and the ESLint boundary rule — because several dispositions are only true if those claims are.
6. Checked that no strength code exists yet (`src/domain/strength`, `src/server/strength`, and any `strength_estimate` occurrence in `src/` or `drizzle/`): **none does**, so the revision is design-only as it claims.

Scratch scripts lived in the session scratchpad outside the repository and were deleted (§11).

---

## 3. Independent reproduction of every fixture

Reimplemented from the rule text, not from the fixture table.

### 3.1 §7 — session observations

| Fixture | Revision | Reproduced | ✓ |
| --- | --- | --- | --- |
| `110×5` RIR 3,3,2,2,1 — first three set e1RMs | 139.33, 139.33, 135.67 → 139.33 | identical | ✓ |
| Same session logged as 3 sets vs 5 sets | 139.33 both | 139.33 both — **set-count invariance holds** | ✓ |
| Same session, RIR 2,2,2 | 135.67 | 135.67 | ✓ |
| `3×12 @ 95` RIR 2,1,0 — sets 1–2 excluded (RTF 14, 13) | one group, 133.00 | identical, `HIGH_REP_SETS_EXCLUDED` count 2 | ✓ |
| Plausibility band, `4 × 110×5` + `1100×5` | 135.67 vs 1356.67; band 162.80 → excluded | 135.67 / 1356.67 / 162.80 → excluded | ✓ |
| Top set `140×3 @ RIR 1` + `3 × 110×8 @ RIR 1,1,0` | 143.00 / 158.67; band 171.60 → admitted, +11.0 % | 143.00 / 158.67 / 171.60, **+10.96 %** | ✓ |
| Ascending pyramid `100/110/120 × 8 @ RIR 2` | 160.00 (heaviest tie-break) | 133.33 / 146.67 / **160.00** | ✓ |
| `110×5 ×2` + one set typed `120` | admitted, governs, +9.1 % | 135.67 / 148.00, **+9.09 %** | ✓ |

### 3.2 §22 — the target table

Basis A = 139.33 @ 110 kg (5 reps), B = 133.00 @ 95 kg (12 reps); `loadStepKg` 2.5; target RIR band 0–2 unless stated. Pool `[139.33, 133.00]` → current **133.00**, spread **4.76 %** (revision: "4.8 %"), best 139.33 confirmed.

| Target | Revision | Reproduced (raw → caps → emitted) | ✓ |
| --- | --- | --- | --- |
| 5×5 | 110.0, raw 112.97, `DIRECT_EVIDENCE_CAPS_LOAD` | 112.97 → direct cap **110.0** binds → 110.0 | ✓ |
| 3×8 | 102.5, raw 104.50, nearby | 104.50; pooled cross-check 99.75 × 1.2 = 119.7 not binding; global 121 not binding → 102.5 | ✓ |
| 3×12 | 90.0, raw 90.68, direct, `EXTENDED_TARGET_EFFORT` | 90.68; direct cap 95 not binding → 90.0 | ✓ |
| 3×9 | 95.0, raw 97.32, far, both sessions in basis | translated `[101.95, 97.32]` → lower median **97.32**; pooled 97.32 equal, not binding → 95.0 | ✓ |
| 3×12, no RIR anywhere | 95.0, effort-matched | 95.00; direct cap 95 → 95.0 | ✓ |
| 3×8, A without RIR | 100.0, raw 101.31 | 128.33 / f(8) = **101.31** → 100.0 | ✓ |
| Load-up at the limit (`3 × 110×8 @ RIR 1` → 5 reps) | 115.0, raw 115.95, far, low | 143.00 / f(7) = **115.95**; global 121 not binding → 115.0 | ✓ |
| Display of current | "≈ 132.5 kg (likely 117.5–147.5)" | nearest-2.5 of 133.00 = 132.5; band `[117.5, 147.5]` | ✓ |
| §8.5 display example (139.33) | "≈ 140 kg (likely 125–155)" | 140.0; band `[125.0, 155.0]` | ✓ |
| Refusal fixture `120×4` / `60×2` @ RIR 0 | 136.00 / 64.00, spread 112.5 % → refuse | identical; **and robust to the RIR assumption** — at RIR 2 the pair is 144.00 / 68.00, spread 111.8 %, still refused | ✓ |
| `A-11` (`3×12@95 RIR 0`, band 0–3 / 0–2) | 88.67 → 87.5; 90.68 → 90.0 | identical | ✓ |
| `A-8` estimate fixtures | 133 / 136 / 136 / 130 | identical, including the `[130,132,13]` low-outlier case | ✓ |

**Every fixture in the revision reproduces exactly.** This is a materially better result than the review obtained against the evaluation, where four table values, two worked intermediates and one worked example were wrong. The one exception is VL-1 below, which is a rounding slip in a parenthetical, not in a fixture result.

### 3.3 Tier costs at the revision's *new* boundaries

Recomputed cross-formula disagreement (five classical equations), which is what `K-14…K-17` are calibrated against:

| Distance | Load-down (source has fewer reps) | Load-up (source has more reps) |
| --- | --- | --- |
| 1 | 1.4 % | 3.1 % |
| 2 | 3.1 % | **5.9 %** ← `NEARBY_REPS_MAX_UP = 2` |
| 3 | **5.2 %** ← `NEARBY_REPS_MAX_DOWN = 3` | **8.5 %** ← `MAX_REP_DISTANCE_UP = 3` |
| 4 | **7.5 %** ← `MAX_REP_DISTANCE_DOWN = 4` | 10.8 % |
| 5 | 10.1 % | — |

The revision's cited figures (5.9 % at `d = 2` up, 5.2 % at `d = 3` down, 7.5 % at `d = 4` down, 10.8 % at `d = 4` up) all reproduce. **The one number neither the research nor the revision tabulated is `d = 3` load-up at 8.5 %** — and it lands exactly where the calibration principle wants it. Both `far` limits (down 4 → 7.5 %, up 3 → 8.5 %) sit just under one noise unit, and the first excluded distances (down 5 → 10.1 %, up 4 → 10.8 %) sit just over it. **The 4/3 directional split is not arbitrary; it is the correct pair given the design's own stated rule, and the asymmetry falls out of the arithmetic rather than being imposed on it.**

---

## 4. High findings — must be corrected before implementation

### VH-1 — `V-14` does not restrict candidates to *admitted* groups; an excluded ramp group is a valid direct-tier source

**Where:** §9.1 `V-14`, against §7.3 `V-7`, §7.6 and `I-13`.

`V-14` reads: "Candidates are **load groups** (not sessions) from non-deload observations in the evidence window, after `asOf`." It never says *admitted* groups. §7.6 deliberately retains excluded groups on the observation ("`groups[]`, where an excluded 1356.67 kg group appears *as excluded*"), so the candidate pool the text points at demonstrably contains excluded groups.

`I-13` closes half the hole — "A supra-modal group more than 20 % above the modal group's e1RM never contributes" — but **nothing covers sub-modal groups**, and sub-modal is where the realistic damage lives, because §3 commits to **no backfill**: every pre-toggle session's ramp sets remain unflagged sub-modal groups inside the 90-day window.

Two consequences, verified against the rules as written:

- **Sub-modal (the common case).** A historical `60×5` ramp group is `d = 0` from a 5-rep target and therefore a *direct-tier* candidate. Inside one session the §9.2 tie rule ("if a session has two groups in the same tier, the closer one; ties → the heavier") protects — the 110 kg work group wins. **Across sessions it does not**: a session whose only 5-rep group is a ramp contributes that ramp to the up-to-three direct basis, dragging the lower median of translated loads down and naming the ramp in the provenance. The consistency gate cannot catch it, because §9.6 forms `consistencySet` from *observation* `e1rmKg`, and the observation correctly excluded that group. Direction is safe (too light); the evidence line is not.
- **Supra-modal (rarer, and the reason to fix it in the rule and not only in the invariant).** Without `I-13` a `1100×5` typo group is a direct candidate for a 5-rep target: translated 1100.0, direct cap `max basis group loadKg` = 1100 (no help), global cap 1.1 × heaviest **admitted** group = 121 → emitted **120.0**, presented as `direct` evidence at up to `medium` confidence, from a session whose own observation correctly excluded the typo. `I-13` forbids this — but an implementer follows `V-14`, and an invariant that contradicts the rule it constrains is exactly the class of defect the review's `RM-4` and `RM-5` were about.

**Fix (one clause, no design change):** amend `V-14` to "candidates are the **admitted** load groups (modal plus plausible supra-modal) of non-deload observations…", and widen `I-13` to "a group excluded from its observation never contributes to any suggestion basis". Add a fixture: a session whose 5-rep group is sub-modal must not appear in a 5-rep target's basis.

### VH-2 — `A-9` and §12's monotonicity property are false for the emitted load

**Where:** §12, `A-9`.

§12 states: "*holding the basis fixed, the translated load is strictly decreasing in `targetRTF`* (because `f` is increasing)". `A-9` operationalises it: "With a fixed basis, the translated load strictly decreases as target RTF increases."

That is true of the **pre-cap** value and false of the **emitted** one, because §9.5 applies two constant caps and then a floor. Reproduced on the revision's own headline basis (A = 139.33, direct tier, direct cap 110.0, step 2.5):

| target RTF | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw | 122.94 | 119.43 | 116.11 | 112.97 | 110.00 | 107.18 | 104.50 | 101.95 | 99.52 |
| after direct cap | 110.00 | 110.00 | 110.00 | 110.00 | 110.00 | 107.18 | 104.50 | 101.95 | 99.52 |
| **emitted** | **110.0** | **110.0** | **110.0** | **110.0** | **110.0** | 105.0 | 102.5 | 100.0 | 97.5 |

**Five consecutive target-RTF values emit an identical load.** `A-9` as written fails on the very first fixture an implementer would build from §22's own 5×5 row. Flooring adds further plateaus independently of the caps.

This is not a design error — the plateau is *correct and desirable* (direct evidence should cap the answer). It is a specification error: the withdrawal of the evaluation's global monotonicity claim (`X-16`) was right, and the replacement property was stated one step too strongly.

**Fix:** restate §12 as "the pre-cap translated value `raw` is strictly decreasing in `targetRTF`; the **emitted** load is non-increasing, with plateaus wherever a cap or the load-step floor binds", and restate `A-9` to assert (a) strict decrease of `rawLoadKg`, (b) non-increase of `loadKg`, and (c) that every non-monotone step across `T` is disclosed by a change of `tier` or `basisSessionIds`. All three are testable; the current wording is not.

---

## 5. Medium findings — should be closed

### VM-1 — the consistency gate's trim rule can certify agreement between two errors

**Where:** §9.6 `V-19`, row `n ≥ 3`.

The rule removes "the one value farthest from the lower median" and re-tests. Because the *lower median* of a three-value set moves with the outliers, a pool with **two** bad values trims away the **good** one. Reproduced:

| Pool | Lower median | Raw spread | Trim removes | Trimmed spread | Outcome |
| --- | --- | --- | --- | --- | --- |
| `[130, 132, 13]` | 130 | 91.5 % | 13 | 1.5 % | continue, `OBSERVATION_OUTLIER_PRESENT` ✓ correct |
| `[130, 132, 300]` | 132 | 128.8 % | 300 | 1.5 % | continue, flagged ✓ correct |
| **`[130, 13, 14]`** | **14** | 835.7 % | **130** | **7.7 %** | **continue, flagged** ✗ |

In the third case the gate discards the only legitimate observation, declares the two typos consistent with each other, and proceeds to translate from a 13–14 kg basis. The direction is safe — the caps are upward-only, so the result is an absurdly light suggestion at `low` confidence — but §9.6's stated purpose ("the disagreement is not one outlier") is exactly inverted, and `currentE1RM` (14) is equally poisoned, so the pooled cross-check offers no second opinion.

Note this is a **pre-existing property of the lower median**, which §7.7 honestly documents as "not robust to a low outlier" for the *session* value; §9.6 then builds a trim rule on top of it without inheriting the caveat.

**Fix options, cheapest first:** (a) trim relative to the pool's *median of absolute deviations* rather than the lower median; (b) require the retained set to contain the pool's maximum, so a trim can never keep only the bottom of the distribution; (c) accept it and say so in §7.7's asymmetry note, extending it explicitly to §9.6. Any of the three is adequate; leaving the rule with a purpose statement it does not deliver is not.

### VM-2 — `V-22` re-implements the carry-forward winner rule instead of reusing it

**Where:** §10.1 `V-22`, disposition of `RM-7`.

Verified in source: `CarryForwardCandidate` (`src/domain/progression/carryForward.ts:13-18`) carries exactly `{status, isDeload, startedAt, firstWorkSetLoadKg}` — **no reps, no session id** — and `resolveCarryForwardLoadKg` (`:20-33`) returns a **load**, not the winning candidate. So the rep basis cannot be read off the existing chain; it must re-derive the winner ("most recent completed non-deload session with a non-warm-up set, among the last `HISTORY_WINDOW = 8`") a second time.

**The feasibility half of `RM-7` is genuinely resolved** — and this was worth checking, because the review said the input "cannot be produced by the existing chain". It can: `getExerciseHistory` returns `HISTORY_WINDOW = 8` sessions with full set rows including `reps` (`src/server/today/service.ts:47`, `:51-57`, `:237-255`), and `toCarryForwardCandidate` (`:275-283`) takes `h.sets.find((s) => !s.isWarmup)`, exactly as `V-22` describes. No new query is needed, and `V-22`'s population objection is answered: the basis describes the *prefill*, so it draws on the prefill's own 8-session candidate set rather than the estimate's 90-day window.

What is left is a **duplicated selection rule** in two places that must stay in step — the precise failure mode the review catalogued repeatedly elsewhere (`RM-6` ordering, `RL-6` two spellings, `RL-9` citation drift).

**Fix:** have `carryForward.ts` expose the winning candidate (e.g. `resolveCarryForwardCandidate` returning the candidate, with `resolveCarryForwardLoadKg` as a thin wrapper), extend `CarryForwardCandidate` with the rep basis computed at the same place `firstWorkSetLoadKg` is, and have `V-22` consume it. One rule, one implementation, and `A-14` then tests the shared function rather than a parallel one.

### VM-3 — `I-1`'s restoration is sound, but rests on a precondition the revision does not state

**Where:** §10.2 `V-23`, §9.6 refusal 3, `I-1`, `A-15`, `A-22`.

I traced the mechanism rather than accepting the disposition, because `I-1` is the invariant `RH-1` falsified.

**It holds.** `startSession` freezes the recommendation into the device-local aggregate — `recommendation: recommendationForDeload(input.isDeload, entry.pendingRecommendation)` (`src/sync/activeSession.ts:276`, with the comment at `:267` "The pending recommendation rides into the session verbatim") — and `logSet` reads that same frozen field when deciding whether to author an implicit decision (`:468`). So **if the suppression gate is evaluated against the same `TodayBundleExerciseEntry.pendingRecommendation` that the aggregate freezes, the gate and `resolveImplicitDecision` can never disagree**, including across a stale cached bundle:

| Bundle snapshot | `startingSuggestion` | Frozen `recommendation` | `logSet` behaviour |
| --- | --- | --- | --- |
| No pending rec at build time | present | `null` | `rec` is null → no implicit decision ✓ |
| Pending rec at build time | `none` (`PENDING_RECOMMENDATION_PRESENT`) | present | no suggestion to Use ✓ |

The two fields always travel from one snapshot, so the stale-bundle and offline-completion cases are safe as well.

**The precondition is not written down.** §9.6 says only "any pending recommendation for the exercise". An implementer who computed the gate inside `src/server/strength/service.ts` from its own `recommendations` query — which §14.5 explicitly permits, since `src/server/strength/**` "may read a decision's `chosen`/`inputs` for the gate" — would decouple the two and re-open `RH-1` through a race inside a single bundle build.

**Fix:** state in `V-23` that the gate input **is** `TodayBundleExerciseEntry.pendingRecommendation` (post-`recommendationForDeload`), the same value the aggregate freezes; and add to `A-22` an assertion that the suggestion and the frozen recommendation come from one snapshot.

### VM-4 — the transitional consequence of unflagged historical ramps for the suppression gate is unstated

**Where:** §10.1 `V-22`, against §3's no-backfill commitment.

`V-22` derives the rep basis from "non-warm-up sets at the **first work set's load**". For any session logged **before** the warm-up toggle existed, that is the first *ramp* set's load and its reps — the same mechanism the review documented for the carry-forward prefill (`RH-4`: prefill 60 kg instead of 110 kg on a ramped session). §3 commits to no backfill, so this persists for every pre-toggle session inside the carry-forward's 8-session window.

The suppression gate therefore compares `T` against a **ramp's** rep count during the transition, producing either a spurious suppression (ramp reps happen to sit within 1 of `T`) or a spurious firing (they do not, on a session that was actually rep-compatible). The revision's single line — "With the F-1 toggle in use, the first work set is a work set" — states the end state but not the interim.

This also lands on §18 step 4(c), the fire-rate prototype ("replay a full block and count how often the suggestion *would* have fired — more than once per scheme change means the gate is still wrong"), which will necessarily run against exactly this pre-toggle history. Without the caveat, a correct gate can be measured as broken, or a broken one as correct.

**Fix:** one sentence in `V-22` and one in §18 step 4(c). No behaviour change. (This is a statement about the revision's text; it is not a finding about the F-1 remediation, which is out of scope here.)

---

## 6. Low findings

**VL-1 — §22's "Load-up at the limit" parenthetical is slightly off.** The revision states "Under Brzycki the same translation gives 117.9, under Lombardi 112.7 — a 4.6 % convention spread". Recomputed across all five formulas for `110×8 @ RIR 1` (RTF 9) → target RTF 7: Epley **115.95**, Brzycki **117.86**, Lombardi **112.80**, O'Conner **114.68**, Wathan **116.40** — a **4.4 %** spread, and Lombardi is 112.80 not 112.7. Immaterial to the conclusion (every value sits inside the shown band `[102.5, 130.0]`), but the revision claims every number was recomputed, and this is the same class of slip the review's `RL-2` charged against the evaluation.

**VL-2 — the emitted load can equal its own band's lower bound on coarse grids.** §9.5 computes `bandKg` from `raw` while the primary number is `floorToStepKg(raw)`. At `loadStepKg = 5.0`: raw 24.0 → emitted **20.0**, band **[20.0, 30.0]**; raw 29.9 → emitted **25.0**, band **[25.0, 35.0]**. The card then reads "≈ 20 kg (likely 20–30)". The band can never *invert* (`floorToStep(0.9·raw) ≤ floorToStep(raw)` always), so this is cosmetic — but it is the visible face of the floor-discount interaction that `X-12` declined to fix, and it is worst exactly where the discount is worst. Either centre the band on the emitted value, or say in §15.3 that the band brackets the raw translation rather than the shown load.

**VL-3 — three normative rules carry no classification tag, contrary to §2's own rule.** §2 states "Every rule below carries exactly one primary tag." **`V-12`** (§8.3, the current/best derivation), **`V-14`** (§9.1, candidate definition — the rule at issue in VH-1) and **`V-22`** (§10.1, the carry-forward rep basis) carry none. Given that the tag is precisely what separates evidence-backed from calibrated-policy from owner-decidable — the separation this verification was asked to confirm — the three gaps should be filled. On the evidence in the revision the natural tags are `[P]` for `V-12`, `[P]` for `V-14`, and `[R]` for `V-22`.

**VL-4 — 50 distinct reason codes are used and none of the document declares the enum.** Counted across §6–§11, §15 and §22: 50 distinct codes. §8.4 declares only the ten estimate-level ones; §9.6 lists thirteen refusal codes; §7.6 lists observation flags; the remainder appear only inline in prose, tables and fixtures. But `I-14` asserts "Every **declared** reason code is emitted by at least one fixture" and `A-19` asserts "every member of the strength reason-code **enum**" — and no enum is declared, so neither has a referent. The evaluation had one (its §11.2); the revision dropped it while fixing `RM-5`'s reachability. This is the inverse of `RM-5` (used-but-undeclared rather than declared-but-unreachable) and it blocks the reachability test the review specifically asked for in `RC-9`. **Fix:** add one table listing every code by level (observation / estimate / suggestion / refusal), which also lets §15's copy map be checked for completeness. One naming slip to fold in: §16 refers to `MIXED_LOADS` where every other occurrence is `MIXED_LOADS_IN_SESSION` — the `RL-6` failure mode in miniature.

**VL-5 — a single-session basis is `medium` for a suggestion but `low` for the estimate, with no stated rationale.** §11's table caps "Basis/pool sessions = 1" at `low` for the estimate and `medium` for the suggestion. On the same day, the same one session therefore renders as two different confidence words on two surfaces. The asymmetry is *defensible* — direct same-rep evidence is stronger for a **load** than for a **1RM**, which is the research's §9.3 point and the design's own best-supported principle — but it is unstated, and an unexplained inconsistency in a feature whose whole value proposition is honest labelling will read as a bug. One sentence.

**VL-6 — a sub-modal group whose e1RM exceeds the modal group's is silently discarded.** Example: `100×12 @ RIR 0` (140.00) alongside `3 × 110×5 @ RIR 2` (135.67). The 100 kg group is sub-modal → excluded, so the observation is 135.67 even though the discarded group implies more. This is conservative and consistent with "sub-modal = presumed ramp, back-off or drop set", but it is the exact mirror of §7.5's stated principle ("do not silently prefer the back-off"), and §7 asserts the max-over-admitted-groups rule without noting that the admission filter is by **load**, not by implied e1RM. One sentence in §7.3.

---

## 7. Stress tests, by the area named in the task

### 7.1 Source selection

**Verified sound.** Ranking is by rep distance to the target, directionally, with the first non-empty tier governing — never by rep count, load magnitude, or recency. The evaluation's "most recent same-rep observation's modal load" (the review's `RH-3` non-monotone rule) is gone, and the review's own counter-dataset is now refused outright rather than answered inconsistently (§3.2 above; the refusal is robust to the RIR assumption the revision had to make to reconstruct it).

Two properties worth recording because they are consequences, not defects: **(a) rep proximity beats recency absolutely** — an 89-day-old direct-tier group outranks three fresh nearby ones. This is the research's §9.3 ordering and is bounded by the 90-day window and disclosed by the age confidence caps, so it is correct, but it is not stated. **(b) The direct-tier cap uses `max basis group loadKg`**, so with basis groups at 100 kg and 110 kg the emitted load may exceed the lighter one. Intended and correct ("the athlete really lifted 110 at those reps"), also unstated.

The one genuine gap is **VH-1**.

### 7.2 RIR handling

**Verified sound and evidence-consistent.** `RTF = reps + RIR` with no value altered, averaged, or inferred (`I-9`); 0–2 full standing; 3–4 degraded and correctly **re-labelled a conservative policy with EVIDENCE-014 removed as its citation** (the review's `RM-1b`, the research's `C-07`); ≥ 5 excluded and correctly re-labelled a **domain** rule that departs from `evidence-to-design.md` row 5, with the departure routed into row 20 (`RM-1a`, `C-06`) and re-justified on the sound ground that with `RTF_MAX = 12` it bites only at `reps ≤ 7`.

Three things the revision gets right that neither predecessor did:

- **`V-27`** adds the research's `Ø-2` honesty entry: the app logs a *post-set retrospective* RIR, and no study has ever measured that task's accuracy. This is the single most under-appreciated gap in the topic and the revision is the first document in the lineage to carry it.
- **`V-26`** removes the experience-gradient reassurance the review had leaned on (the research's §15.9 correction) and rests the conservative-direction argument on the pooled under-prediction alone, which applies to everyone.
- **`V-28`**'s error-propagation series reproduces, and the copy rule forbidding attribution of the imprecision mainly to RIR is retained.

Basis homogeneity (`V-17`) correctly resolves `RM-12` / `C-29`: a mixed basis is reduced to its RIR-complete groups rather than mixing a lower-bound basis with a band-max discount. **One dead branch:** the "Mixed" row's fallback "if fewer than one remains, fall to the third row" is unreachable, because that row is entered only when *some* group is RIR-complete, so the reduced basis always retains ≥ 1. Delete it or restate the precondition.

### 7.3 Uncertainty and refusal behaviour

**Verified sound, and the strongest improvement in the document.** Every threshold now derives from one named constant (`NOISE_SD_PCT = 10`), which is the research's §20 item 1 and makes future recalibration a one-line change with a stated basis. The recalibrations are faithful to the research's simulation: 10 % → 20 % (`SPREAD_MEDIUM_PCT`, which fired on ~77 % of healthy triples), 20 % → 30 % (`DISAGREE_REFUSE_PCT`, which refused ~21 % of healthy pairs), 10 % → 20 % (`TIER_VS_POOLED_DISAGREE_PCT`, a coin flip), and `BEST_UNCONFIRMED_PCT` correctly **kept** at 10 as the one well-calibrated member of the family.

The refusal list (§9.6) is ordered, complete against every `none` branch implied by §6–§10, and explicitly precedence-bearing ("the first-listed code"). I checked the ordering against `A-10`, which asserts `OBSERVATIONS_DISAGREE` for `T ∈ 1..6` on a dataset where low `T` would otherwise trip `TARGET_NEAR_MAXIMAL_NOT_SUGGESTED`: the gate is item 6 and the target-RTF check item 8, so `A-10` is satisfiable as written. ✓

§11's honesty note that spread is a *range over a low centre* and therefore systematically larger than a dispersion measure is a real and easily-missed point, correctly stated.

The gap is **VM-1**.

### 7.4 Competing observations

**Verified sound.** The §9 lead correctly encodes the corrected arithmetic (`RL-1` / `RC-18`): under Epley, Brzycki and Wathan the 12-rep session implies the *higher* e1RM; Lombardi and O'Conner reverse it. Neither session "wins"; the target decides which evidence is closest and the lower median of **translated** loads combines within the tier — not the most recent, not the heaviest, not the lowest-rep. Reproduced on the 3×9 target, where A and B are both admitted at the `far` tier and the lower median takes B's 97.32 over A's 101.95. ✓

The pooled cross-check only ever lowers, and correctly exempts the direct tier — which is the research's §9.3 ordering applied consistently.

One design consequence worth stating: **§9.6 forms `consistencySet` from *observation* `e1rmKg` while §9.5 translates from *group* e1RMs.** On a top-set/back-off session those differ (158.67 vs 143.00), so the gate can check a session-level value that no basis group actually used. Benign — the gate is a coarse sanity check, not a precision instrument — but the mismatch is unstated and interacts with VH-1.

### 7.5 Rounding

**Verified sound.** Floor-to-step everywhere (`RM-10` / `I-8` closed), `roundToStepKg` left as the engine's rule, the `1e-9` epsilon retained with its sub-cent consequence stated and "never increases" correctly narrowed to `round2` inputs (`RL-12`). Display moves off the 1 kg grid to the exercise's `loadStepKg` with a **required** ±10 % band (`C-24`, `C-33`), and both worked display examples reproduce exactly.

`X-12`'s rejection of a floor-discount cap is **reasoned and legitimate**: capping the discount means sometimes rounding *up*, which is the one direction the design refuses. That is a fair answer to the research's §20 item 10, which proposed a fallback-to-nearest the revision is entitled to decline. The residue is VL-2.

### 7.6 Sparse and outlier data

| Case | Behaviour | Verdict |
| --- | --- | --- |
| One observation, direct tier | Gate skipped (`n = 1`); confidence capped `medium`; suggestion emitted | Sound |
| Order-of-magnitude typo among four good sets | `IMPLAUSIBLE_SETS_EXCLUDED`; observation 135.67 | Sound ✓ reproduced |
| Typo as one of **two** sets (`110×5`, `1100×5`) | Tie → heaviest → the typo becomes the modal group and anchors; 110 becomes sub-modal | **Disclosed** in §7.2 and labelled "unconfirmed" as `best`. Accepted trade |
| Within-noise typo (`120` among `110×5`) | Admitted, governs, +9.09 % | **Disclosed** in §7.3 as a known limitation |
| Single low outlier in the pool | Lower median shifts one rank; trim rule flags it | Sound ✓ reproduced |
| **Two** low outliers in the pool | Trim removes the *good* value; gate reports agreement | **VM-1** |
| Sub-modal group with higher e1RM | Silently discarded | **VL-6** |
| Non-finite / ≤ 0 | `BELOW_MINIMUM_LOAD` before the DTO (`RL-11` closed) | Sound |
| PI-001 `8 kg × 90` | `HIGH_REP_SETS_EXCLUDED`, no observation | Sound ✓ reproduced |

The revision is notably honest about the cases it cannot fix — §7.2's two-set typo and §7.3's within-noise typo are both stated as accepted trades rather than hidden, which is the right posture.

### 7.7 Integration boundaries

Every boundary claim the dispositions depend on was spot-verified in source:

| Claim | Verified | Result |
| --- | --- | --- |
| `startSession` freezes the pending recommendation into the aggregate; `logSet` reads that frozen field | `activeSession.ts:267, 276, 468` | ✓ — and this is what makes `I-1` airtight (VM-3) |
| `HISTORY_WINDOW = 8`; history rows carry `reps`, `rir`, `isWarmup`, `setNumber` | `today/service.ts:47, 51-57, 237-255` | ✓ — `V-22` needs no new query |
| `toCarryForwardCandidate` takes the first non-warm-up set | `today/service.ts:275-283` | ✓ — but returns no reps (VM-2) |
| `userLocalDateString` / `localDateToUtcInstant` exist at the cited path | `src/server/time/userLocalDate.ts:6, 53` | ✓ — `V-10` is implementable as cited |
| `updateExerciseSchema` is strict and would reject `strengthEstimate` | `src/domain/exercises/schema.ts:160-174` | ✓ — the required addition is correctly identified |
| ESLint alone does not enforce the strength↛progression boundary | `eslint.config.mjs:42` — `{ from: "server", allow: ["domain","db","server"] }` | ✓ — §14.5's dedicated import-graph test is genuinely required, not belt-and-braces |
| No strength code exists yet | `src/domain/strength`, `src/server/strength` absent; no `strength_estimate` in `src/` or `drizzle/` | ✓ — design-only, as claimed |

`V-2`'s zero-touch boundary (no progression, recommendations, snapshot, sync schema, outbox change) is consistent throughout, and `A-26`'s byte-identical assertion against `7d6bc6c` is the right way to test it. The bundle-cost resolution (`RM-8`) — one batched `inArray` query for all prescribed exercises, `best` moved off the hot path, latency measured **before** anything is added — is correct and correctly sequenced.

---

## 8. Confirmations

**VC-1 — every review finding is disposed, and the load-bearing dispositions deliver.** All 33 (`RH-1…4`, `RM-1a/1b`, `RM-2…13`, `RL-1…15`) appear in §20.1. Spot-verified against the sections they name: `RH-1` → §10.2 plus the freeze coupling (VM-3); `RH-2` → `V-21` matches `workingTargets.ts:43` exactly, and `A-13` is constructed so it proves *which* rule is in force rather than merely that a rule exists; `RH-3` → one translation path, direct evidence as an upward cap, floor and 110 % cap on every tier, and the review's own counter-dataset now refused; `RH-4` → the top-set half resolved here by `V-9`, the rest correctly assigned to the F-1 gate; `RM-4` → gate moved ahead of tier selection and `deriveEstimate` given a code carrier; `RM-9` → `todayIsDeload` is a pure-function input; `RM-2` → `asOf` bounds `best` and stale counts only past observations.

**VC-2 — the research is adopted faithfully, and the one rejection is reasoned.** Twelve of thirteen §20 implications adopted; §20-10 (cap the floor discount) rejected with a valid reason (`X-12`). The five headline findings are all adopted. The `C-01…C-42` reconciliation in §16 was checked row by row against the research's classifications and is accurate — including the harder calls (`C-19` "unresolved" → 3 SD rather than being claimed as contradicted; `C-23` kept at 10 as the best-calibrated member; `C-35` split rather than adopted wholesale).

**VC-3 — every fixture reproduces exactly** from the rule text alone (§3). Given that the review found four wrong table values, two wrong intermediates and one wrong worked example in the evaluation, and this verification found one rounding slip in a parenthetical (VL-1), the arithmetic discipline is a step change.

**VC-4 — the corrections list (§23) is complete and accurate.** All 21 items match what the review and the research actually said, including the two the research added independently (`95/110 = 0.8636`, and the withdrawal of the "safest shape at high reps" justification).

**VC-5 — binding, policy and owner input are cleanly separated.** §1.1's withdrawal of every earlier "binding" label is correct and, importantly, is grounded in a *named repository precedent* (the warm-up evaluation's owner-decision addendum) rather than asserted. §2's `[E]` / `[E*]` / `[A]` / `[R]` / `[P]` / `[O]` / `[D]` / `[N]` legend does real work, and the `[E*]` rule — "a promise of evidence, not evidence… nothing tagged `[E*]` may appear in user-facing copy as 'research shows'" — is exactly the discipline `evidence-to-design.md` §3 rule 4 requires, applied without being asked. §17 carries all twenty owner decisions as open with a recommended default and a named blocker each. The only gap is VL-3's three untagged rules.

**VC-6 — the target-RTF ceiling deviates from the research's §19 and the deviation is correct.** The research recommended a target RTF domain of 3–12; the revision uses 3–15 with 13–15 flagged. I verified the stated justification and it holds: both empirical reference curves in the research put Epley's multiplier **above** truth at 13–15 reps (+8.2 % against Mayhew's fitted curve, +5.0 % against Nuzzo's), and the target-side operation is `e1RM / f(targetRTF)` — so a too-large `f` yields a too-**light** load. **Source-side and target-side ceilings genuinely have opposite error signs**, and the research's §19 collapsed them into one number without noticing. The revision is right and the research was incomplete on this point; `O-20` correctly exposes it as an owner decision anyway.

**VC-7 — the directional rep-distance split is better calibrated than either source document establishes.** §3.3: both `far` limits sit at 7.5–8.5 % cross-formula disagreement and both first-excluded distances at 10.1–10.8 %, i.e. the boundary tracks one noise unit in both directions. The 4/3 asymmetry falls out of the arithmetic rather than being imposed on it.

**VC-8 — `F-1` is accounted for, not absorbed.** §3 depends only on `isWarmup` being UI-writable, demotes the modal rule to defence in depth, states the no-backfill consequence, forbids this feature's tests from touching the three `warmupSetClassification` suites (`A-29`), and gates Release A on the remediation's own verification (`V-0`). Nothing in the revision re-specifies, re-tests or re-reviews that work. The interface is the right one and the boundary is respected.

---

## 9. Required corrections, consolidated

**Before implementation (blocking):**

1. **VH-1** — `V-14`: restrict candidates to **admitted** groups; widen `I-13` to cover sub-modal exclusion; add the fixture.
2. **VH-2** — §12 and `A-9`: state strict decrease for `rawLoadKg` and non-increase for the emitted `loadKg`, plus the disclosure clause.

**Before implementation (should):**

3. **VM-1** — §9.6: make the trim rule robust to two outliers, or inherit §7.7's asymmetry caveat explicitly.
4. **VM-2** — `V-22`: expose the winning carry-forward candidate from `carryForward.ts` instead of re-deriving the selection rule.
5. **VM-3** — `V-23` / `A-22`: state that the gate reads `TodayBundleExerciseEntry.pendingRecommendation`, the same value the aggregate freezes.
6. **VM-4** — `V-22` and §18 step 4(c): state the pre-toggle-history consequence for the gate and for the fire-rate prototype.
7. **VL-4** — add the reason-code enum table, so `I-14` and `A-19` have a referent; unify `MIXED_LOADS` → `MIXED_LOADS_IN_SESSION`.

**Editorial:** VL-1 (4.4 % / 112.80), VL-2 (band vs emitted load on coarse grids), VL-3 (tag `V-12`, `V-14`, `V-22`), VL-5 (state the single-session confidence asymmetry), VL-6 (state the sub-modal-discards-higher-e1RM case), and the dead "fewer than one remains" branch in `V-17`.

**Unchanged and correct — do not revisit:** the two-release shape; the tier hierarchy and its directional limits; `RTF_MAX = 12`; the noise-constant derivation of every threshold; `GROUP_SET_POSITIONS = 3`; the plausibility band; the top-set rule; calendar-day windows; the split O-7 verdict; the freshness relabelling; the caps; the required band; every refusal; the copy rules; `N-9`'s ban on claiming a benefit; and the entire §14 boundary set.

---

## 10. Verdict restated

# `VERIFIED — WITH REQUIRED CORRECTIONS`

The revision is a faithful, arithmetically sound consolidation of the review and the research. Its numbers reproduce, its dispositions deliver, its classification discipline is correct, and it improves on the research in one place (VC-6). Two specification defects (VH-1, VH-2) and four substantive gaps (VM-1…VM-4) stand between it and implementation-readiness; none requires an architectural change, and all six are corrections of a clause or a criterion rather than of a rule.

Implementation remains gated where the revision itself places the gates — the F-1 remediation's own verification and commit, an owner addendum on `O-1…O-20`, `evidence-to-design.md` row 20, and the OD-06 amendment ADR. **This verification decides none of those**, and recommends no owner decision.

---

## 11. Working-tree impact

Created: `docs/reviews/estimated-1rm-load-translation-architecture-revision-verification.md` (this file). **Nothing else was created, modified, staged, formatted, reverted, or deleted.**

Explicitly untouched: the revision, the review, the research, and the evaluation under verification; every other report in `docs/reviews/`; all of `src/`, `drizzle/`, `tests/`, `docs/architecture/`, `docs/evidence/`, and `docs/input/`; `CLAUDE.md`, `HANDOFF*`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/`.

**All unrelated working-tree changes preserved exactly as found**, including the concurrent F-1 warm-up-set-classification remediation (`src/ui/workout/ExerciseCard.tsx`, `src/ui/history/HistoryDetail.tsx`, `tests/e2e/warmupWorkout.spec.ts`, the three new `warmupSetClassification` suites, and `docs/reviews/warmup-set-classification-remediation.md`), which was neither read for content, evaluated, nor modified. That remediation was still in flight during this verification and its own file set moved between the start and end of this session; the list above is what `git status` reported at the end, and nothing in it was touched here. Files opened read-only for the source verification in §7.7 were `src/sync/activeSession.ts`, `src/server/today/service.ts`, `src/domain/progression/carryForward.ts`, `src/domain/exercises/schema.ts`, `src/server/time/userLocalDate.ts`, and `eslint.config.mjs`; none was edited.

No code was implemented. No commit, push, tag, deployment, or production access. No database — local or production — was started or contacted.

Temporary verification artefacts: two Python scripts (`rev.py`, a from-scratch reimplementation of §5–§9 used to reproduce every fixture in §3.1–§3.2 and the monotonicity table in VH-2; `spread.py`, the tier-cost and stress-case harness behind §3.3, VM-1, VL-1 and VL-2). Both lived in the session scratchpad outside the repository and were deleted after use. No repository code was imported into either.
