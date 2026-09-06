# Estimated 1RM Tracker & Load Translation — Architecture Revision

Date: 2026-09-05
Correction pass: 2026-09-05, applying §9 of `docs/reviews/estimated-1rm-load-translation-architecture-revision-verification.md` (below, **the verification**) in place; every change is logged in §25. Second correction pass: 2026-09-05, applying V2-M-1, V2-M-2, and V2-L-1…V2-L-3 of `docs/reviews/estimated-1rm-load-translation-architecture-revision-verification-2.md` (below, **the second verification**) — wording and precision only; no rule, threshold, invariant, boundary, or owner decision changed; logged in §25. This file remains the single authoritative specification.
Role: consolidating revision of the proposed post-MVP feature "Estimated 1RM Tracker and Load Translation". It supersedes the algorithmic and wiring content of the evaluation where the two differ; it does not edit, delete, or re-issue any earlier report. Revision only — no source, schema, migration, seed, test, architecture-document, evidence-file, or backlog change was made.
Repository state read: `main` @ `7d6bc6c` (`feat: add reusable warm-up routines`) plus the uncommitted working tree, which now contains the separate F-1 warm-up-set classification remediation (`src/ui/workout/ExerciseCard.tsx`, `src/ui/history/HistoryDetail.tsx`, `tests/e2e/warmupWorkout.spec.ts`, three new `warmupSetClassification` test files, and `docs/reviews/warmup-set-classification-remediation.md`). That work is accounted for in §3 and was not read for content beyond its report, not touched, and not re-specified here.
Scope of change: **this file only.** No database (local or production) was started or contacted. Nothing was committed, pushed, or deployed.

Inputs, and how each is treated:

| Document | Short name | Treated as |
| --- | --- | --- |
| `docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md` (2026-09-04) | **the evaluation** | The proposal being revised. Its section numbers (§n), identifiers (`B-n`, `I-n`, `A-n`, `O-n`, `D-n`, `X-n`, `N-n`, `R-n`, `RG-n`, `F-n`) are referenced with the prefix "evaluation". |
| `docs/reviews/estimated-1rm-load-translation-architecture-review.md` (2026-09-04) | **the review** | The adversarial findings to resolve. `RH-n` / `RM-n` / `RL-n` findings, `RC-n` recommended modifications, and its `O-11…O-16` owner decisions. |
| `docs/reviews/estimated-1rm-evidence-research.md` (2026-09-05) | **the research** | The evidence reconciliation. `E1-E-nn` external sources, `Ø-n` negative results, `C-nn` constant classifications. |
| `docs/architecture/evidence-to-design.md`, `open-decisions.md` (OD-06), `docs/evidence/*` | repository authority | The only sources a design document may cite for evidence (`evidence-to-design.md` §3 rule 4). |

Identifier conventions in this document: **V-n** revised rules (normative for verification), **I-n** invariants, **A-n** acceptance criteria, **O-n** owner decisions (numbering continues from the evaluation and review so cross-references stay stable), **D-n** deferred, **N-n** non-goals, **X-n** rejected, **K-n** constants. Every rule carries one of the classification tags in §2.

---

## 1. Verdict

# `ACCEPTED — BINDING FOR IMPLEMENTATION (owner addendum 2026-09-05)`

Previous verdicts, in order: `READY FOR TARGETED ARCHITECTURE VERIFICATION` → `READY FOR SECOND TARGETED ARCHITECTURE VERIFICATION` → `READY FOR FINAL ARCHITECTURE CONFIRMATION` → accepted.

The first targeted verification returned `VERIFIED — WITH REQUIRED CORRECTIONS`: every fixture reproduced and every finding was disposed, but two specification defects (VH-1, VH-2), four substantive gaps (VM-1…VM-4), and a set of editorial items stood between the document and implementation-readiness. All of them were closed in the first correction pass (§25). The second targeted verification returned `VERIFIED — ALL §9 ITEMS CLOSED` with two wording corrections (V2-M-1, V2-M-2) and three precision fixes (V2-L-1…V2-L-3), all in text the first correction pass had added; those are applied in the second correction pass (§25). Neither pass revisited anything listed as "unchanged and correct", altered a rule, threshold, invariant, or boundary, or decided an owner question.

The architecture the evaluation proposed and the review endorsed **stands**: a pure derivation over immutable `set_logs`, computed on read, with no new execution fact, no sync entity, no persisted aggregate, no progression-engine change, and an advisory-only suggestion. Nothing in the review or the research disturbs that shape. What changes is everything *inside* it:

1. **The suggestion can no longer author a fact.** It is suppressed whenever any pending recommendation exists (review RH-1, RM-11; O-11 recommended), so the implicit-decision path in `src/sync/activeSession.ts:468-493` can never receive a suggested load as a first work set while a recommendation is pending. "Use" fills an input; nothing else (§10.2).
2. **The target-reps rule is the prefill's rule**: `T = decisionChosen?.reps ?? schemeDefaultReps(scheme)` (review RH-2, `workingTargets.ts:43`), so the card falls silent for `repRange` prescriptions mid-block (§10.1).
3. **One translation path for every tier.** The direct tier no longer returns a raw modal load; every tier translates the basis to the target effort with the same formula, and direct evidence acts as an upward cap rather than as the answer (review RH-3, RC-3; §9.4).
4. **Competing observations are ranked by rep distance to the target and combined by a lower median of translated loads — never by rep count or load magnitude** (§9.3). The corrected arithmetic (review RL-1, RC-18) shows that under Epley, Brzycki, and Wathan the athlete's 12-rep session implies the *higher* e1RM while Lombardi and O'Conner reverse it, which is exactly why neither session may "win". Two observations that disagree by more than three noise units make the system **refuse** (§9.6).
5. **Every algorithmic constant is reconciled with the research** (§16): the source rep ceiling drops to `RTF_MAX = 12`; the rep-distance limit drops from 8 to a directional 4 (load down) / 3 (load up); every disagreement threshold is expressed as a multiple of one named noise constant (`NOISE_SD_PCT = 10`) and recalibrated so that it no longer fires on most healthy data; the session aggregator becomes set-count invariant; the top-set/back-off case is handled now rather than deferred.
6. **Warm-up classification is no longer this feature's problem.** The F-1 remediation is implemented in the working tree and awaiting its own targeted verification. This revision consumes `isWarmup` as the primary work-set classifier and demotes the modal-load rule to defence in depth (§3).

**Status 2026-09-05: accepted.** The owner-decision addendum below records acceptance of O-1…O-20 exactly as recommended; `evidence-to-design.md` row 20 and ADR-011 (the OD-06 amendment) exist; O-17 has been executed. The rules of this document are therefore **binding for implementation**. The one remaining gate is external: the F-1 warm-up-set remediation's own verification and commit (§3, V-0). §24 lists what the verifier checked.

### 1.1 Status of earlier "binding" claims — corrected

The evaluation labelled its §3 terminology "binding", its §18.1 invariants "binding for implementation and review", and its §21 items "Binding recommendations". The review's §13 listed items "safe to bind now". **None of these is binding, and none was ever accepted.** The repository's mechanism for making an evaluation binding is an explicit owner-decision addendum on the document (the precedent is `docs/reviews/warmup-routines-architecture-evaluation.md`, "Owner decision addendum — 2026-09-01", whose O-1/O-2 are recorded as "binding for the v1 implementation"). No such addendum exists for the e1RM lineage; evaluation O-1…O-10 and review O-11…O-16 are all open. The evaluation's `B-n` items were therefore recommendations, and several of them (`B-2`'s ceiling, `B-5`, `B-6`'s effort half, `B-7`) are superseded below.

The same applies to this document: its `V-n` rules are **normative for the targeted verification** — they are what the verifier checks the design against — and they become binding for implementation only through an owner addendum recorded on this file or an ADR. That addendum follows.

---

## Owner decision addendum — 2026-09-05

The owner reviewed this revision, the first targeted verification (`…-revision-verification.md`, `VERIFIED — WITH REQUIRED CORRECTIONS`, corrections applied in §25), and the second (`…-revision-verification-2.md`, `VERIFIED — ALL §9 ITEMS CLOSED`, precision fixes applied in §25.1), and **accepts O-1 through O-20 exactly as recommended in §17.** With this addendum the following are **binding for implementation** in the same sense as the warm-up routines evaluation's 2026-09-01 addendum: every `V-n` rule, every `I-n` invariant, every `K-n` constant and its value in §16, every `A-n` acceptance criterion in §21.2, the §9.6 refusal list, the §14 boundaries, the §15 copy rules and the §15.4 reason-code enum, and the deferred / non-goal / rejected lists in §19.

Decisions with a consequence worth restating:

- **O-1 — two releases, tracker first.** Release A (tracker) ships first; Release B (advisory starting suggestion) ships only after at least one block of Release A use and after the fire-rate prototype of §18 step 4(c). The direct-tier-only version remains the **fallback cut line** if Release B is ever reduced; it is **not** the selected scope.
- **O-9 — OD-06 amended, not resolved as continuity.** Recorded as `docs/architecture/adr/ADR-011-strength-estimation-and-load-translation.md` (2026-09-05): Epley kept with `f(1) = 1`; input `reps + reported RIR`; the "reps ≤ 12 for display" cap becomes the source admissibility ceiling `RTF ≤ 12` (unchanged number, changed role); a new target ceiling `RTF ≤ 15`; every value with a ±10 % band; a versioned `algorithm` id. OD-06 leaves `open-decisions.md`; **OD-04 stays open** (the trend is an inline SVG sparkline).
- **O-11 — suppress on any pending recommendation.** I-1 and A-18 hold by construction (V-23).
- **O-12 — source ceiling 12.** The extension to 15 is rejected on the source side; 15 applies to targets only (O-20).
- **O-17 — executed in substance 2026-09-05; status corrected 2026-09-06.** EVIDENCE-032…037 entered `docs/evidence/evidence-registry-reviewed.md` (new §13 and "Verification pass 3"), `docs/evidence/product-evidence-boundaries.md` (A13–A16, B12–B13), `docs/evidence/research-gaps.md` (GAP-07 narrowed; GAP-11, GAP-12 added), and `docs/architecture/evidence-to-design.md` row 20 — as **provisional registry entries**, because they did not go through the PDF/research-note intake every other item went through (integration verification G-1…G-3). The Fitbod-affiliated preprint (E1-E-20) is **not** promoted and may not be cited by any design document. **Every `[E]` upgrade this document had derived from the six items was reverted to `[E*]` on 2026-09-06**; `[E*]` now also denotes "backed by a provisional registry entry" (§2). No rule, constant, or decision changes as a result — every number here was already a convention. Full promotion, and any re-upgrade, waits on the closure condition recorded in the registry's "Verification pass 3".
- **O-16 / O-19 / O-20** — direct tier translates for effort with direct evidence as the upward cap; the top set governs a session when plausible, with a flag; target RTF 13–15 is allowed and flagged.
- **O-2, O-4, O-13, O-14, O-15, O-18** — column `strength_estimate` with the two-row reconcile; the `/exercises/[id]/strength` page; account-timezone calendar days; `best` off the bundle; archived exercises served; display on the `loadStepKg` grid with the band.
- **O-3, O-5, O-6, O-7, O-8, O-10** — 110 % cap on every tier; the warm-up toggle is the F-1 remediation's external gate; effort-matched missing-RIR policy with the homogeneity rule; split equipment verdict; `other` excluded; deload rows shown badged.

Nothing in this addendum changes a rule, threshold, invariant, boundary, fixture, or acceptance criterion. Implementation may start when the F-1 remediation has been verified and committed (V-0).

---

## 2. Classification legend

Every rule below carries exactly one primary tag. The tags are the four-tier hierarchy of `evidence-to-design.md` §1, extended with the three labels the research introduced (§5 there) and two bookkeeping labels.

| Tag | Meaning | Who may change it |
| --- | --- | --- |
| **[E]** evidence-supported | Backed by a source that is **in the repository registry** (`EVIDENCE-nnn`, `A/B/C-n`, `GAP-nn`). Shapes *what exists*; never attached to a specific number. | Owner, on new registry evidence |
| **[E*]** evidence-supported pending full promotion | Backed **either** by an external source the research retrieved (`E1-E-nn`) that is not in the registry, **or** by a **provisional** registry entry — EVIDENCE-032…037, which entered on 2026-09-05 outside the PDF/research-note intake (registry §13; closure condition in its "Verification pass 3"). In both cases the rule is treated as **[P]** for citation: the design may state the rationale, and row 20 may cite a provisional id only together with the marker "provisional". **Status (2026-09-06):** Nuzzo 2024 → EVIDENCE-032, Halperin 2022 → EVIDENCE-033, Grgic 2020 → EVIDENCE-034, Greig 2023 → EVIDENCE-035, Mayhew 2008 → EVIDENCE-036, Bosquet 2013 / Encarnação 2022 / Spiering 2021 → EVIDENCE-037 — all **provisional**; the `[E]` upgrades made on 2026-09-05 on their strength were **reverted to [E*]** (integration verification G-1). Tags resting on Reynolds 2006 (E1-E-05), Senna 2011 (E1-E-17), or the rejected preprint (E1-E-20) are also **[E*]**, with no registry entry at all. A tag may become **[E]** only when its registry item has completed intake. | Owner, via the registry |
| **[A]** arithmetic truth | Follows from the formula alone. Binding on the algorithm, says nothing about the body. | Nobody — it is either right or wrong |
| **[R]** repository convention | Verified in source; consistency with the rest of the codebase. | Owner, by changing the convention everywhere |
| **[P]** conservative product policy | Defensible judgment, not evidence. Must be labelled as a convention in copy and in row 20's "not justified" column. Where the research supplied a calibration, the policy is "a convention with a calibrated size". | Owner |
| **[O]** unresolved owner decision | Recommended default stated; not decided. Listed in §17. | Owner |
| **[D]** deferred | Not in v1; trigger stated. §19. | Owner |
| **[N]** non-goal | Not built, no trigger. §19. | Owner |

Rule for the reader: an **[E*]** tag is a promise of evidence, not evidence. Nothing tagged **[E*]** may appear in user-facing copy as "research shows".

---

## 3. The F-1 remediation — accounted for, not absorbed

`docs/reviews/warmup-set-classification-remediation.md` (2026-09-05) reports the warm-up toggle implemented in `ExerciseCard.tsx` and `HistoryDetail.tsx`, threaded into the existing `logSet` / `correctHistorySet` paths, with unit, integration, and e2e coverage, and a verdict of `READY FOR TARGETED VERIFICATION`. `git status` at the time of writing confirms those files are modified/untracked and uncommitted. This document's posture:

| Aspect | Position |
| --- | --- |
| Dependency | **V-0.** Release A (§4) is gated on the F-1 remediation being verified and committed. The gate is external to this feature; this document does not re-specify, re-test, or re-review the toggle. **[R]** |
| Primary classifier | `set_logs.is_warmup` is the primary work-set classifier for this feature, exactly as it already is for the engine (`progression/service.ts:125`), volume (`aggregate.ts:174`), and carry-forward (`today/service.ts:276`). **[R]** |
| Modal-load rule | Demoted from "the defence" to **defence in depth** (review RC-4, §9). It still removes back-off sets, drop sets, rest-pause fragments, and the `11 kg` typo; it is no longer claimed to substitute for marking. **[P]** |
| Backfill | None. Existing rows stay `false`, which is what they claim. Historical ramps the athlete never marks remain visible on the trend as `SUB_MODAL_SETS_EXCLUDED` or `IMPLAUSIBLE_SETS_EXCLUDED` rows and are editable from History (the remediation added that edit path). **[P]** |
| Review RH-4 | Its blast radius (carry-forward prefill, `isCompleted`, engine modal load, volume) is outside this feature and is addressed by the remediation. Its e1RM half (top-set understatement) is resolved by §7's group rule, not by the toggle. |
| Coupling in tests | This feature's acceptance suite (§21) must not modify the three `warmupSetClassification` test files; it may add fixtures that *use* `isWarmup = true` sets. |

One consequence must be stated plainly: **without the toggle in use, the estimator remains wrong on unflagged single-top-set days.** With the revised tie rule (§7.2, modal group ties break to the heaviest load) an unflagged `60×5, 80×5, 100×3, 140×3` session resolves to the 140 kg group; with the evaluation's earliest-index tie rule it resolved to 60 kg. The plausibility band then excludes nothing (the lighter groups are sub-modal, not supra-modal). This is the one place the revision improves the unflagged case; it is not a substitute for flagging.

---

## 4. Scope and shipping shape

**V-1 — Two releases, tracker first.** [P] (review O-1 MODIFY, recommended; O-1 remains open)

| Release | Contents | Wiring risk |
| --- | --- | --- |
| **A — Tracker** | `src/domain/strength/*` (observation, estimate), `src/server/strength/service.ts`, `GET /api/exercises/[id]/strength`, `/exercises/[id]/strength` page (current, best, trend, what-if calculator), `exercises.strength_estimate` column and edit-form toggle, `evidence-to-design.md` row 20, OD-06 amendment ADR. | None: read-only derivation; cannot touch prefill, decisions, or the outbox. Reviewable on domain fixtures. |
| **B — Advisory starting suggestion** | `suggestStartingLoad`, two optional bundle fields, device-local freeze at `startSession`, workout-card line with **Use**, batched bundle query. | Carries every High finding of the review; ships only after Release A has been used for at least one block (so the R-2 missing-RIR concern is judged on data) and after O-11 is decided. |

The research's framing point is recorded for the owner: the **direct tier** ("last time you did 6 reps here you used 60 kg") involves no formula and none of the ±10 % error, and is the most valuable single output. If Release B is ever cut down, the cut line is "direct tier only" — that is offered as an option under O-1, not chosen here.

**V-2 — Nothing in either release enters `recommendations`, `PrescriptionSnapshot`, `src/domain/sync/schema.ts`, `src/server/sync/service.ts`, or the outbox op vocabulary, and nothing changes the behaviour of `src/domain/progression/*`.** [R] (evaluation B-8/I-1 sync half, review §13 — the only part of the evaluation the review found safe to bind; still unbound, still correct.) The single permitted touch inside `src/domain/progression/*` is the additive, behaviour-preserving refactor of `carryForward.ts` required by V-22 (the verification's VM-2): a new exported `resolveCarryForwardCandidate` returning the winning candidate, with `resolveCarryForwardLoadKg` kept as a thin wrapper with an unchanged signature and result, and `CarryForwardCandidate` extended with optional `sessionId` and `repBasis` fields. No strategy, config, reason code, evaluation input, or engine output changes; A-29 proves it by running the existing suites unmodified.

---

## 5. Terminology (revised)

| Term | Definition |
| --- | --- |
| **RTF** (reps to failure) | `reps + (rir ?? 0)`, integer. With RIR missing it is a lower bound **on the Epley estimate**, not on the athlete's 1RM (research §8.3; copy rule §15.3). |
| **Set e1RM** | `round2(weightKg × f(RTF))`, `f(1) = 1`, `f(r) = 1 + r/30` for `r ≥ 2`. A per-set intermediate; never displayed alone. |
| **Eligible set** | Passes §6.2: not warm-up, load > 0, RIR ≤ 4 or null, RTF ≤ 12. |
| **Load group** | The eligible sets of one session at one exact `weightKg`, in set-number order. Carries `loadKg`, `setCount`, `modalReps` (mode of reps, ties → lowest), `medianRir` (lower median of reported RIR among its first three sets, null if none), `rirComplete` (all of its first three sets report RIR), `e1rmKg`, flags. |
| **Modal group** | The load group with the most eligible sets; ties → the **heaviest** load (§7.2). |
| **Sub-modal / supra-modal group** | A group lighter / heavier than the modal group. Sub-modal groups are excluded; supra-modal groups are admitted only when plausible (§7.3). |
| **Admitted group** | The modal group plus every plausible supra-modal group. Excluded groups (sub-modal or implausible) stay on the observation as provenance only; they never contribute to the session value **or to any suggestion basis** (V-14, I-13). |
| **Group e1RM** | Lower median of the set e1RMs of the group's **first up to three** sets (`GROUP_SET_POSITIONS`). Set-count invariant beyond three (§7.4). |
| **Observation** | One completed, non-discarded session's contribution for one exercise: `{sessionId, performedOn (local date), isDeload, groups[], governingGroupLoadKg, e1rmKg, flags, excludedSetCounts}`. `e1rmKg` = the governing group's e1RM (§7.5). |
| **Lower median** | Sort ascending; take index `floor((n − 1) / 2)`. Integer-preserving, conservative for even `n`; robust to one high outlier for `n ≥ 3` and **not** robust to a low outlier (review P10c; stated, not hidden). |
| **Evidence window** | Non-deload observations whose `performedOn` lies within the last `EVIDENCE_WINDOW_DAYS` **calendar days in the account timezone**, ending on `asOf`'s local date inclusive (§8.1). |
| **Pool** | The most recent `CURRENT_SESSION_COUNT` observations in the evidence window. |
| **currentE1RM** | Lower median of the pool's `e1rmKg`; null when the pool is empty. |
| **bestE1RM** | Maximum `e1rmKg` over all non-deload observations with `performedOn ≤ asOf` (ties → earliest). "Unconfirmed" when no other non-deload observation is within `BEST_UNCONFIRMED_PCT` of it. |
| **Target reps (T)** | `decisionChosen?.reps ?? schemeDefaultReps(scheme)` — **identical to `workingTargets.ts:43`**. Supplied to the pure module as data. |
| **Rep basis** of a source | A load group's `modalReps`; for a recommendation/decision, `chosen.reps ?? schemeDefaultReps(inputs.prescribed.scheme)`. |
| **Direction** of a translation | *Load-down* when the source has fewer reps than T (the translated load is lighter); *load-up* when the source has more reps than T (the translated load is heavier). |
| **Tier** | `direct` (rep distance ≤ 1), `nearby` (2–3 load-down, 2 load-up), `far` (4 load-down, 3 load-up). Nothing beyond (§9.2). |
| **Noise constant** | `NOISE_SD_PCT = 10`: one standard deviation of individual e1RM estimation error, the best-corroborated number in the topic (research §15.6). Every percentage threshold is a stated multiple of it. |
| **Starting suggestion** | Advisory `{status, loadKg, rawLoadKg, bandKg, tier, confidence, reasonCodes, basis}` for the first work set of today's prescription. Never a fact, never a recommendation. |
| **Algorithm** | `{ id: "e1rm-epley-rir", version: 1, formula: "epley" }` on every DTO. This revision *is* version 1; the evaluation's version was never implemented. |

---

## 6. Admissibility rules (final)

Applied in the pure domain, not SQL (the volume precedent). The server query bounds by user, exercise, and `status = 'completed'` only.

### 6.1 Exercise level

**V-3.** An exercise is eligible when **both** hold: its current `equipment` is one of `barbell`, `dumbbell`, `cable`, `machine`; and `strength_estimate ≠ 'off'` (§14.4). `'auto'` means "eligible **if** the category allows" — the switch can only disable, never enable (review O-2 modification 4). [P] for the category list ([E*] for the exclusions: research C-36/C-37/C-38 — E1-E-20 excluded bodyweight, assisted, and timed work for the same stated reasons; `Ø-5` found nothing supporting inclusion. E1-E-20 is not promoted (O-17), so this stays a convention for citation.)

| Category | v1 | Note |
| --- | --- | --- |
| `barbell` | Eligible | |
| `dumbbell`, `cable`, `machine` | Eligible "as logged" | Per-hand vs total, stack scale, sled tare are unmodelled. Comparisons only ever happen within one `exercises.id`, so a **stable** convention cancels (research §12.2, the best-supported argument in either document). A **change** of convention cannot be detected by anything in the data — the only mitigations are the `'off'` switch and copy that never claims comparability beyond "the unit you log" (§15.3). |
| `bodyweight`, `other` | Not eligible | `bodyweight` needs a bodyweight join and a leverage fraction (D-3); `other` has no load semantics. |
| Assisted movements (e.g. the seeded Assisted Pull-Up, `equipment: "machine"`) | Must be `'off'` | The assistance load is stored as an ordinary non-negative number whose **meaning is inverted and unmodelled** (a larger number is an easier set); no equation can consume it. The evaluation's "sign-inverted load" was wrong (review RL-7; `ck_set_logs_weight_kg_nonneg` forbids a negative load). |
| Time/distance work (Farmer's Carry, Plank; PI-005) | Must be `'off'` / not eligible | Reps are fabricated. PI-005's future measurement profile may become the structural gate and supersede the switch (D-11). |
| `laterality = unilateral` | Eligible "as logged" | No evidence either way (research C-40); the within-exercise argument applies unchanged. |

`equipment` is an **eligibility gate**, not a reinterpretation weight (review RC-25): editing it makes a whole series appear or vanish on the next read. Nothing is lost — flipping it back restores the series — but the design says so rather than borrowing ADR-007 mechanism 3 as a precedent (that mechanism covers dimensionless contribution weights only).

### 6.2 Set level

**V-4.** [P] unless marked.

| Case | Rule | Flag / count |
| --- | --- | --- |
| `isWarmup = true` | Excluded | `excludedSetCounts.warmup` |
| `weightKg = 0` | Excluded (`data-model.md:230`: 0 = bodyweight-only) | `ZERO_LOAD_SETS_EXCLUDED` |
| `rir` null | Eligible; `RTF = reps` (lower bound on the estimate) | `RIR_MISSING_LOWER_BOUND` [A] |
| `rir` 0–2 | Eligible, full standing | — |
| `rir` 3–4 | Eligible, degraded | `RIR_MODERATE_RANGE` — **a conservative policy, not an evidence finding.** EVIDENCE-030 found 1-RIR and 3-RIR statistically equivalent within ±1 rep and forbids inferring otherwise; EVIDENCE-014 must not be cited for this rule (review RM-1b, research C-07). |
| `rir` ≥ 5 | Excluded | `HIGH_RIR_SETS_EXCLUDED` — **a domain rule that departs from `evidence-to-design.md` row 5** ("discarding high-RIR data entirely" is listed as not justified) and from B8 (which says *weight*, not discard). Re-justified per research §8.4: with `RTF_MAX = 12` this exclusion bites only when `reps ≤ 7`, i.e. on low-rep sets far from failure — the longest extrapolations, furthest from where RIR accuracy has ever been measured. Row 20 must record the departure (review RC-15). |
| RTF 1–10 | Eligible, core | — |
| RTF 11–12 | Eligible, degraded | `EXTENDED_REP_RANGE` |
| RTF > 12 | **Excluded** | `HIGH_REP_SETS_EXCLUDED` — `RTF_MAX = 12` (§16 K-04). Matches OD-06's recorded ceiling (now ADR-011); removes PI-001's `8 kg × 90`. [E*] EVIDENCE-033 (provisional; RIR prediction error accumulates ~8× faster above 12 reps to failure); [E*] EVIDENCE-036 (provisional; equation bias nearly removed at ≤ 10 RTF; linear equations over-estimate most at high reps); [E*] E1-E-05 (R² decay from 5RM to 20RM — not in the registry). |
| Load below the modal group | Excluded (ramp, back-off, drop set; defence in depth) | `SUB_MODAL_SETS_EXCLUDED` |
| Load above the modal group, implausible | Excluded (§7.3) | `IMPLAUSIBLE_SETS_EXCLUDED` |
| Edited or deleted set | Recomputed on the next read | — |

Cost of the ceiling, stated honestly: a 12-rep set logged at RIR 1 (RTF 13) or an 11-rep set at RIR 2 is dropped. For a hypertrophy block trained at RIR 2–3 with 12-rep sets, the tracker will have fewer observations than the evaluation implied. The research (§19) accepts this cost explicitly; so does this revision.

### 6.3 Session level

**V-5.** [R] consistent with history and the engine.

| Case | Rule |
| --- | --- |
| `completed` | Eligible |
| `in_progress` | Excluded — the estimate never moves during a workout (N-5) |
| `discarded` | Excluded |
| `isDeload = true` | Observation computed and shown badged on the trend; excluded from pool, current, best, and every suggestion basis (`DELOAD_SESSION` on the observation; `DELOAD_SESSIONS_EXCLUDED` on the estimate when any exist) [E] EVIDENCE-025 / B6 |
| Ad-hoc slot, incomplete prescription, `custom` week | Eligible — an observation needs facts, not a prescription |
| Zero eligible sets | No observation; counted in `sessionsWithoutEligibleSets` |

### 6.4 The data model cannot distinguish (unchanged from evaluation §4.3, one correction)

AMRAP/failure/drop/rest-pause/cluster markers, failed attempts (`reps ≥ 1`), weighted or assisted bodyweight, per-hand vs total, time/distance work, correction-vs-original, and the calendar day (PI-002) remain unmodelled. Each is handled by exclusion or labelling, never inference. Correction: the "sign-inverted load" claim is withdrawn (§6.1).

---

## 7. Session observation — aggregation

### 7.1 Why one observation per session

Within-session sets are a fatigue-decayed, correlated sequence, not independent observations (research §10.2–10.3, [E*] E1-E-17 — Senna 2011, not promoted under O-17). One observation per session is kept ([E*] research C-26). What changes is the statistic.

### 7.2 Load groups and the modal group

**V-6.** Eligible sets are partitioned into load groups by exact `weightKg`. The **modal group** has the most sets; **ties break to the heaviest load**. [P]

Why heaviest, not earliest: this feature has its own helper and does not touch the engine's `modalWorkingLoad` (`loadHelpers.ts:27-42`, ties → earliest, unchanged). For the engine, "the first work set is conventionally the working weight". For a strength estimate the freshest, heaviest, lowest-rep set is the least biased observation available ([E*] EVIDENCE-036 (provisional) for the short-set accuracy advantage; [E*] E1-E-05 and E1-E-17 for the R² decay and set-order fatigue — not in the registry), so when nothing repeats — an ascending pyramid, a single top set after an unflagged ramp — the heaviest group anchors the session. Trade-off accepted and stated: in a two-set session with one order-of-magnitude typo (`110×5, 1100×5`) the typo anchors; it is visible on the trend, editable, and labelled "unconfirmed" as `best` (§8.3).

### 7.3 Sub-modal exclusion and the plausibility band for supra-modal groups

**V-7.** Sub-modal groups are excluded (`SUB_MODAL_SETS_EXCLUDED`). A supra-modal group is **admitted** when its group e1RM is at most `PLAUSIBILITY_FACTOR × (modal group e1RM)` with `PLAUSIBILITY_FACTOR = 1 + 2 × NOISE_SD_PCT / 100 = 1.20`; otherwise it is excluded with `IMPLAUSIBLE_SETS_EXCLUDED`. [P] — a convention with a calibrated size (two noise units).

The admission filter is by **load**, not by implied e1RM. A sub-modal group whose e1RM exceeds the modal group's is still discarded: `100×12 @ RIR 0` (140.00) logged alongside `3 × 110×5 @ RIR 2` (135.67) yields an observation of 135.67, because a lighter group is presumed to be a ramp, back-off, or drop set regardless of what it implies. This is the deliberate mirror of §7.5's "do not silently prefer the back-off": heavier evidence may govern when plausible, lighter evidence never does. Stated so that it is a known consequence, not a surprise.

| Session | Groups | Result |
| --- | --- | --- |
| 4 × `110×5 @ RIR 2` + `1100×5 @ RIR 2` | 110 (4 sets, e1RM 135.67); 1100 (1 set, 1356.67) | 1356.67 > 135.67 × 1.20 = 162.80 → **excluded**, `IMPLAUSIBLE_SETS_EXCLUDED`; observation 135.67 |
| `140×3 @ RIR 1`, then 3 × `110×8 @ RIR 1,1,0` (top set + back-off) | 110 (3 sets: 143.00, 143.00, 139.33 → 143.00); 140 (1 set: 158.67) | 158.67 ≤ 143.00 × 1.20 = 171.60 (+11.0 %) → **admitted**; §7.5 makes it govern |
| Ascending pyramid `100/110/120 × 8 @ RIR 2` | all counts 1 → modal = 120 (heaviest); 100 and 110 sub-modal | Observation = 160.00 (the 120 kg group); `SUB_MODAL_SETS_EXCLUDED` |
| `110×5 ×3 @ RIR 2` with one set typed `120` | 110 (2 sets, 135.67); 120 (1 set, 148.00) | 148.00 ≤ 162.80 → admitted and governs (+9.1 %). **Known limitation:** a within-noise typo is indistinguishable from a real heavier set; the design does not pretend otherwise. |

### 7.4 Group e1RM — set-count invariant

**V-8.** Group e1RM = lower median of the set e1RMs of the group's **first up to three sets** in set-number order (`GROUP_SET_POSITIONS = 3`). Sets 4+ of a group do not enter the value; they enter `setCount` only. [E*] research §10.4 / E1-E-17.

Reproduced from the research: `110×5` with RIR falling `3, 3, 2, 2, 1`:

| Sets completed | Set e1RMs | Evaluation (all sets) | **Revision (first three)** |
| --- | --- | --- | --- |
| 3 | 139.33, 139.33, 135.67 | 139.33 | **139.33** |
| 5 | + 135.67, 132.00 | 135.67 (−2.63 %) | **139.33** |

The evaluation's §7.4 claim "set count feeds confidence, not the value" is now true by construction instead of false. The value depends on set *order*: the first three sets are the freshest, which is what a 1RM estimate should measure.

### 7.5 The governing group and the session value

**V-9.** Among admitted groups (modal + plausible supra-modal), the observation's `e1rmKg` is the **maximum group e1RM**. When the governing group is not the modal group, flag `TOP_SET_GOVERNS` (confidence ≤ medium). [E*] research §10.7 ("do not silently prefer the back-off"; [P] for choosing "max with a flag" over "two observations").

Straight-set sessions (one group) reduce to the lower median of the first three sets — identical to the evaluation for `n ≤ 3`. The top-set example above yields 158.67 (evaluation: 143.00, a 10 % understatement). `groups[]` is retained on the observation so the suggestion's direct tier can find the `140×3` group when a 3-rep target arrives (§9.1).

### 7.6 Flags carried by an observation

`RIR_MISSING_LOWER_BOUND`, `RIR_MODERATE_RANGE`, `EXTENDED_REP_RANGE` (from any set of an admitted group's first three), `MIXED_LOADS_IN_SESSION` (more than one admitted group), `TOP_SET_GOVERNS`, `SINGLE_SET_GROUP` (governing group has one set), `DELOAD_SESSION`, plus `excludedSetCounts {warmup, zeroLoad, highRir, highRep, subModal, implausible}` from which the `*_SETS_EXCLUDED` codes are derived — so every exclusion code is reachable (review RM-5, RC-9).

**Dropped:** `SESSION_SETS_INCONSISTENT`. At a constant load a 15 % spread needs an RTF range ≥ 6 across the group's sets and is effectively unreachable (research §10.6); with the first-three rule even a 10 % threshold is rarely reached, and the mixed-load signal already has `MIXED_LOADS_IN_SESSION` / `TOP_SET_GOVERNS`. Fewer codes, all reachable.

**Dropped:** `bestSetE1rmKg` as displayed provenance (review RL-15). Provenance is `groups[]`, where an excluded 1356.67 kg group appears *as excluded*.

### 7.7 Lower median asymmetry (stated)

The lower median is robust to one **high** outlier for `n ≥ 3` and is **not** robust to a low one: `[130, 132, 13]` → 130 (review P10c). A mistyped-low session drags the current estimate one rank; a mistyped-high one does not. The low point is visible on the trend and editable. Copy must not claim "outlier-proof". [A]

The same asymmetry is why the suggestion's consistency gate (§9.6) does **not** use the lower median to identify outliers: a trim anchored on the lower median of `[130, 13, 14]` would discard the 130 and certify the two errors as agreeing with each other. The gate instead looks for a consistent majority of at least three, and refuses when the data cannot tell one valid value from two mutually consistent errors.

---

## 8. Current and best — multi-session aggregation

### 8.1 Time semantics

**V-10.** All windows and ages are **calendar days in the account timezone**, computed at the server boundary with `userLocalDateString` / `localDateToUtcInstant` (`src/server/time/userLocalDate.ts`, the convention `volume/service.ts:230-243` already uses). The server passes each observation's `performedOn` (YYYY-MM-DD) and `asOfLocalDate` into the pure module; the pure module never sees an instant or a timezone. [R] (review RM-3, RC-7; research §11.4 — no physiological quantity is being approximated, so snapping to calendar boundaries is free.)

- Window: `performedOn ∈ [asOfLocalDate − (EVIDENCE_WINDOW_DAYS − 1), asOfLocalDate]`.
- Age: whole calendar days between `performedOn` and `asOfLocalDate`.
- Ordering tiebreak everywhere: `(performedOn, startedAt instant, sessionId)` (review RM-6, RC-10).
- Precondition stated: every ISO instant string the server compares is produced by `toISOString()` (UTC `Z`); the module compares epoch milliseconds, never strings.
- **PI-002 forward compatibility:** when an editable training date ships, `performedOn` becomes that user-owned fact; the window, trend axis, and ages move with it in one algorithm-version bump; "computed from `set_logs` alone" becomes "from `set_logs` plus the session's training date". Recorded here so it is a planned change, not a surprise.

### 8.2 Freshness, not physiology

**V-11.** `EVIDENCE_WINDOW_DAYS = 90`, `FRESH_DAYS_HIGH = 21`, `FRESH_DAYS_MEDIUM = 42` are **data-freshness rules**. No detraining rationale may appear in the design justification or in copy ("based on the last 90 days of training", never "your strength may have declined"). [P] for the three durations (`Ø-9`: nothing identifies a threshold near these values); [E*] EVIDENCE-037 (provisional) for the principle that strength decays continuously and slowly over months, which is why the windows can only be freshness rules (B13). EVIDENCE-037's maintenance-dose figures are narrative context and are cited for nothing here. [E] EVIDENCE-025 / B6 remain the basis only for framing a post-deload dip as expected.

### 8.3 Derivation

**V-12.** [P] for the session count and the unconfirmed threshold; [R] for the `asOf` bound and the ordering tiebreak.

- `pool` = the most recent `CURRENT_SESSION_COUNT = 3` non-deload observations in the window, after the `asOf` bound. `currentE1RM` = lower median of their `e1rmKg`. Null when empty.
- `bestE1RM` = max over non-deload observations with `performedOn ≤ asOfLocalDate` (review RM-2, RC-6: the `asOf` bound applies to `best` too). `staleObservationCount` counts only **past** observations outside the window.
- **Unconfirmed** when no other non-deload past observation has `e1rmKg ≥ best × (1 − BEST_UNCONFIRMED_PCT / 100)`. [P] calibrated: 10 % ≈ one noise unit, the best-calibrated threshold in the family (research C-23).
- `current ≤ best` holds by construction (the pool is a subset of the population `best` ranges over).
- Three sessions: the minimum count at which a median rejects one outlier (`Ø-8`: no evidence for any count). D-10 keeps the widening trigger; the research's flat 7/14/28-day dispersion mildly favours widening later.
- Everything recomputes on read; edits move current and best alike.

### 8.4 Estimate-level reason codes and confidence

`deriveEstimate` returns `reasonCodes` (review RM-4: the evaluation's `deriveEstimate` had no carrier). Codes: `NO_ELIGIBLE_SETS`, `NO_RECENT_EVIDENCE`, `SINGLE_SESSION_EVIDENCE`, `TWO_SESSION_EVIDENCE`, `EVIDENCE_AGING`, `EVIDENCE_OLD`, `ESTIMATE_SPREAD_WIDE`, `ESTIMATE_SPREAD_VERY_WIDE`, `BEST_UNCONFIRMED`, `DELOAD_SESSIONS_EXCLUDED`, plus each distinct flag of any pool observation. Confidence per §11.

### 8.5 Display precision

**V-13.** The e1RM is displayed on the exercise's `loadStepKg` grid (nearest), **always** followed by a ±`NOISE_SD_PCT` band rounded outward to the same grid: `≈ 140 kg (likely 125–155)` for 139.33 on a 2.5 kg step. A bare 1 kg value is a precision claim the evidence does not license (research C-24 — contradicted; §9.1 there). [P] for the grid, with [E*] calibration of the band: the provisional EVIDENCE-034/035/036 put an estimated 1RM's individual error at ≈ ±10 % (1 SD), about three times a measured maximum's test–retest variation. The band is required copy, not optional (research C-33).

---

## 9. Source selection and load translation — how competing observations are ranked

This section answers the brief's central question. The rule that is **not** encoded: "lower reps + heavier weight wins". Under Epley, Brzycki, and Wathan the athlete's `95×12` session implies a *higher* e1RM than `110×5` at equal RIR; under Lombardi and O'Conner it implies a lower one, O'Conner by under 1.4 % (review §5.2, RC-18 — the evaluation's "under every formula" was wrong). The two sessions are, within the noise, expressions of the same athlete. Neither wins; the **target** decides which evidence is closest, and the evidence closest to the target is combined conservatively.

### 9.1 Candidates

**V-14.** [P] Candidates are the **admitted load groups** (the modal group plus every plausible supra-modal group, §7.3) of non-deload observations in the evidence window, after `asOf`. A group its own observation excluded — sub-modal or implausible — is **never** a candidate, whatever its rep count: a historical unflagged `60×5` ramp group is not direct evidence for a 5-rep target, and a `1100×5` typo group is not direct evidence for anything (the verification's VH-1). Using groups means a top-set/back-off session contributes `140×3` and `110×8` as separate rep bases (§7.5). A group's rep basis is its `modalReps`; its effort is `medianRir` / `rirComplete`.

### 9.2 Ranking — rep distance to the target, directional

**V-15.** Let `d = |modalReps − T|` and direction = load-down if `modalReps < T`, load-up if `modalReps > T`.

| Tier | Load-down (source fewer reps → lighter target) | Load-up (source more reps → heavier target) | Confidence cap |
| --- | --- | --- | --- |
| `direct` | d ≤ 1 | d ≤ 1 | — |
| `nearby` | d = 2–3 | d = 2 | medium |
| `far` | d = 4 | d = 3 | low |
| none | d ≥ 5 → not a candidate | d ≥ 4 → not a candidate | `REP_DISTANCE_TOO_FAR` when no candidate exists |

The first non-empty tier governs; its basis is the up-to-three most recent candidate groups in that tier (one group per session — if a session has two groups in the same tier, the closer one; ties → the heavier). [A] for the tier costs (research §13.3: cross-formula disagreement ≤ 1.4 % at d ≤ 1, ≤ 5.9 % at d ≤ 3, 7.5 % / 10.8 % at d = 4 load-down / load-up, 17–19 % at d = 8); [P] for the exact boundaries; the **directionality** is an arithmetic truth (load-up disagrees more at equal distance) plus a risk asymmetry (a too-light start is corrected by the engine in a session or two; a too-heavy start is a failed set at a heavier absolute load) — research §9.5.

`MAX_REP_DISTANCE = 8` and `FAR_REP_DISTANCE = 6` are gone (research C-14, C-15: contradicted). The evaluation's "remote" tier (pooled `currentE1RM` translated across any distance) is gone with them: beyond the limits the system **refuses**.

### 9.3 Combining within a tier

**V-16.** Each basis group is translated individually (§9.5) and the suggestion's raw load is the **lower median of the translated loads**. Not the most recent, not the heaviest, not the lowest-rep. [P]

This replaces the evaluation's "most recent same-rep observation's modal load", which the review showed to be non-monotone (T = 3 → 60 kg, T = 4 → 120 kg on one dataset). Under the revision that dataset is refused outright by §9.6 (its two observations, `120×4` → 136.00 and `60×2` → 64.00, disagree by 112 %). Where evidence is consistent, a one-rep change in `T` changes the basis membership at a tier boundary and may change the load; §12 replaces the evaluation's unprovable global monotonicity property with a provable local one.

### 9.4 Effort: target RIR and basis homogeneity

**V-17.**

| Basis | Target RTF | Code |
| --- | --- | --- |
| Every basis group `rirComplete` and a band exists | `T + band.max` | `TARGET_RIR_FROM_BAND_MAX` [P] direction supported: band max → lighter start; worth ≈ 2.4 % of e1RM per rep of reserve |
| Every basis group `rirComplete`, no band | `T + lowerMedian(basis medianRir)` | `TARGET_RIR_FROM_RECENT_EFFORT` |
| No basis group `rirComplete` | `T` (effort-matched: RIR 0 on both sides) | `TARGET_RIR_EFFORT_MATCHED` [A] — avoids stacking a lower-bound basis with a band-max discount (evaluation O-6 accepted; research C-31) |
| Mixed (at least one group `rirComplete`, at least one not) | Reduce the basis to its `rirComplete` groups (drop the others) and apply the first or second row; the reduced basis always has ≥ 1 group by the row's own precondition | `MIXED_RIR_BASIS_REDUCED`, confidence ≤ medium (review RM-12, RC-14; research C-29 — never mix) |

Target RTF bounds: `TARGET_RTF_MIN = 3` (never suggest a near-maximal target from an advisory card; [P]); `TARGET_RTF_CORE_MAX = 12`; `TARGET_RTF_MAX = 15` with `EXTENDED_TARGET_EFFORT` (confidence ≤ medium) for 13–15; above 15 → `TARGET_OUTSIDE_FORMULA_DOMAIN`.

Why the target ceiling (15) is higher than the source ceiling (12): both reference curves in the research show Epley's multiplier is **too large** in the 11–15 rep region (it over-estimates 1RM from high-rep sets). Dividing an e1RM by a too-large `f(targetRTF)` yields a **too-light** load. So a high-RTF *target* errs in the conservative direction while a high-RTF *source* errs in the non-conservative direction. [A] for the direction; [P] for 15. Without this, a 12-rep target with a 0–2 RIR band (RTF 14) could never receive a suggestion.

### 9.5 Translation, caps, rounding — one path for every tier

**V-18.** For each basis group: `translated_i = round2(groupE1rm_i / f(targetRTF))`. Then, in order:

1. `raw = lowerMedian(translated_i)`.
2. **Pooled cross-check** (nearby and far tiers only): `pooledTranslated = currentE1RM / f(targetRTF)`; if `raw > pooledTranslated × (1 + TIER_VS_POOLED_DISAGREE_PCT/100)` (20 %), set `raw = pooledTranslated`, code `POOLED_ESTIMATE_LOWER_USED`, confidence low. Only ever lowers. Direct evidence is exempt because it outranks any pooled conversion ([E*] EVIDENCE-032 (provisional) — a population conversion re-imports the exercise-identity and individual-variability error that same-rep evidence bypasses; [A] ≤ 1.4 % cross-formula disagreement at distance ≤ 1; research §9.3, the best-supported rule in the design).
3. **Direct-tier cap**: in the direct tier, `raw = min(raw, max basis group loadKg)` with `DIRECT_EVIDENCE_CAPS_LOAD` when it binds. A lighter target effort can never produce a load heavier than the athlete actually lifted at those reps (review RC-3; the effort-blind 7.1 % over-prescription of RH-3 is gone: `95×12 @ RIR 0` translated to 12 reps @ RIR 2–3 yields 88.67–90.68, not 95).
4. **Global cap**: `raw = min(raw, UPWARD_LOAD_CAP_FACTOR × heaviest admitted group load in the window)` with `CAPPED_AT_RECENT_MAX_LOAD`, confidence low. `UPWARD_LOAD_CAP_FACTOR = 1 + NOISE_SD_PCT/100 = 1.10` — about one standard deviation of estimation error, which is a coherent place to cap an excursion (research C-22). Applies to **every** tier (evaluation O-3 accepted).
5. **Finite guard**: non-finite or ≤ 0 `raw` → `none` (`BELOW_MINIMUM_LOAD`; review RL-11).
6. **Floor** to `loadStepKg` (`floorToStepKg`), `ROUNDED_DOWN_TO_LOAD_STEP` when it changes the value. Floor, never nearest; `roundToStepKg` stays the engine's rule. On light machine work the floor can remove up to 25 % at the 5 kg default step (research C-32); accepted — a too-light start costs nothing but a session, the raw value is shown in the band text, and `loadStepKg` is user-editable. Capping the floor discount is rejected (X-12).
7. Floored load ≤ 0 → `none` (`BELOW_MINIMUM_LOAD`).
8. `bandKg` = `[floorToStepKg(raw × (1 − NOISE_SD_PCT/100)), ceilToStepKg(raw × (1 + NOISE_SD_PCT/100))]` — required secondary copy. The band brackets the **raw translation**, not the emitted (floored) load. On a coarse grid the emitted load can therefore equal the band's lower bound — `loadStepKg = 5.0`, raw 24.0 → emitted 20.0, band `[20.0, 30.0]`, rendered "≈ 20 kg (likely 20–30)". The band can never invert (`floorToStepKg(0.9 × raw) ≤ floorToStepKg(raw)` always); this is the visible face of the floor discount X-12 declined to cap, and §15.3 says so in the copy rule.

Operation order is normative so that server and any future client output are byte-identical. `floorToStepKg`'s `1e-9` epsilon is retained and its consequence stated: for sub-cent inputs the floor can exceed the raw value by less than 0.01 kg (review RL-12); after `round2` this is immaterial, and "rounding never increases" is asserted only for `round2` inputs.

### 9.6 Consistency gate — when the system must refuse

**V-19.** Before tier selection, form the **candidate set** = every admitted group that is a candidate under §9.1–§9.2 (any tier), and `consistencySet` = distinct sessions in `pool ∪ the sessions contributing any candidate group (§9.1)`, with their observation `e1rmKg`. "Candidate set" is used for this collection throughout the rule; "basis" keeps its §9.2 meaning (the tier-selected groups), which does not exist yet when the gate runs. A session whose only candidate is a `far`-tier group is therefore in `consistencySet` even when a nearer tier would govern — which, under the n = 3 rule below, can be the difference between a suggestion and a refusal (the second verification's V2-M-2), and is intended: inconsistent evidence anywhere in the candidate set undermines the estimate.

| n | Rule | Outcome |
| --- | --- | --- |
| 1 | no gate | — |
| 2 | `spreadPct > DISAGREE_REFUSE_PCT` (3 × noise = 30 %) | **refuse**, `OBSERVATIONS_DISAGREE` |
| ≥ 3 | raw `spreadPct ≤ 30 %` | continue |
| ≥ 3 | raw spread > 30 %: find the **largest consistent subset** (defined below). Continue only if it has **≥ 3 members**, is a **strict majority** of n, and is **unique** | if all three hold: continue with every session outside that subset removed from the candidate set, `OBSERVATION_OUTLIER_PRESENT`, confidence low; otherwise **refuse**, `OBSERVATIONS_DISAGREE` |

**Largest consistent subset.** Sort the values ascending; every contiguous run whose own `spreadPct ≤ 30 %` is a consistent subset; take the run(s) of greatest size. "Unique" means exactly one run of that size exists. The rule is deterministic and needs no centre estimate, so it does not inherit the lower median's downward fragility (§7.7).

Why the majority must be at least three: with n = 3 a 2-versus-1 split is structurally ambiguous — `[130, 132, 13]` (one low typo) and `[130, 13, 14]` (two mutually consistent typos, one valid session) look identical to any rule that trusts the larger side, and the earlier trim-relative-to-the-lower-median rule certified the two typos as agreeing (the verification's VM-1). Two independent errors that happen to agree are plausible; three are not. So a consistent set of two is never trusted over a dissenting one, and the gate **refuses** whenever the observations cannot distinguish one valid value from two consistent errors. [P] — a conservative rule; the cost is that a pool of three containing any single gross outlier (including a genuine but implausible high session such as `[136, 133, 180]`) now refuses the suggestion rather than proceeding at low confidence. The tracker is unaffected: it never refuses, it shows `ESTIMATE_SPREAD_VERY_WIDE` at low confidence, and the outlying session is visible and editable.

| Consistency set (e1RM) | Largest consistent subset | Outcome |
| --- | --- | --- |
| `[130, 132, 13]` | `{130, 132}` — size 2 | **refuse** |
| `[130, 13, 14]` | `{13, 14}` — size 2 | **refuse** (previously: continue from a 13–14 kg basis) |
| `[130, 132, 300]` | `{130, 132}` — size 2 | **refuse** |
| `[130, 131, 132, 13]` | `{130, 131, 132}` — size 3, majority of 4, unique | continue; the 13 session leaves the candidate set; `OBSERVATION_OUTLIER_PRESENT`, low |
| `[130, 132, 13, 14]` | `{130, 132}` and `{13, 14}` — tie at size 2 | **refuse** |
| `[130, 131, 132, 13, 14]` | `{130, 131, 132}` — size 3, majority of 5, unique | continue, flagged, low |

When a session is removed from the candidate set, the tier basis is re-selected from the remaining candidate set (§9.2). `currentE1RM` is a tracker quantity and is **not** recomputed for the pooled cross-check (§9.5 step 2). A low outlier left in the pool lowers `currentE1RM` (the lower median is not robust downward, §7.7) and so can only lower the suggestion further; a high outlier leaves `currentE1RM` **unchanged**, because the lower median of a pool of three is robust to a single high value and at n = 2 it is the minimum, so the cross-check is unaffected. The residual effect is therefore in the safe direction in both cases and is stated here rather than engineered away (the second verification's V2-L-3 corrected the earlier description of the high-outlier mechanism).

The gate runs **before** the direct-tier return (review RM-4, RC-8: the evaluation's pair check sat after the early return and never fired for direct evidence). Calibration: the evaluation's 20 % pair threshold refused ~21 % of well-behaved pairs at the measured noise level (research §10.5); the research recommends roughly 2–3 SD, and 30 % is three noise units. The exact false-refusal rate at 30 % was not simulated there and is not claimed here — still a product judgment, now with a stated basis. [P] calibrated.

**Complete refusal list** — the suggestion is `status: "none"` with the first-listed code when any of these holds, and the UI renders the corresponding honest line (§15.1):

1. `EXERCISE_CATEGORY_UNSUPPORTED`, `EXERCISE_ESTIMATE_DISABLED` (§6.1)
2. `DELOAD_SESSION_NO_SUGGESTION` — `todayIsDeload` is an **input** of the pure function (review RM-9, RC-12), so I-7 is provable in one unit test
3. `PENDING_RECOMMENDATION_PRESENT` — any pending recommendation for the exercise (§10.2)
4. `CARRY_FORWARD_REP_COMPATIBLE` (§10.1)
5. `NO_ELIGIBLE_SETS`, `NO_RECENT_EVIDENCE`
6. `OBSERVATIONS_DISAGREE`
7. `REP_DISTANCE_TOO_FAR`
8. `TARGET_NEAR_MAXIMAL_NOT_SUGGESTED` (target RTF < 3), `TARGET_OUTSIDE_FORMULA_DOMAIN` (target RTF > 15)
9. `BELOW_MINIMUM_LOAD`

A refusal with an honest reason is a better product than a confident arbitrary number; the research's §19 accepts that a 5-rep block after a 12-rep block therefore gets **no** suggestion.

### 9.7 Equipment and the suggestion (research's split verdict on O-7)

**V-20.** No confidence penalty for the **tracker** on dumbbell/cable/machine/unilateral work — a stable per-exercise bias cancels in a within-athlete trend. For a **suggestion** on `cable`, `dumbbell`, or `machine`, confidence is capped at medium with `EQUIPMENT_TRANSLATION_NOISIER` — rep-invariance *variance* does not cancel and is what translation consumes. [E*] research §12.2 / E1-E-20 (preprint, very low confidence, **not promoted under O-17**, used for relative structure only — a penalty, not a number in copy; for citation this cap is a [P] convention). The tighter-rep-distance alternative was not chosen because the directional limits are already tight (X-13).

---

## 10. Firing condition, precedence, and the progression boundary

### 10.1 Target reps and the carry-forward rep basis

**V-21.** `T = decisionChosen?.reps ?? schemeDefaultReps(scheme)`, computed by the server from the same inputs `buildPrescriptionSnapshotData` already receives, and passed to the pure module as `targetReps`. [R] `workingTargets.ts:43` (review RH-2, RC-2).

**V-22.** [R] The carry-forward **rep basis** is produced by the server from data it already loads, without a new query, and **by the same function that selects the prefill's carry-forward winner** — never by a parallel re-derivation of that rule (the verification's VM-2). `carryForward.ts` gains `resolveCarryForwardCandidate(candidates): CarryForwardCandidate | null`, which applies the existing filter and ordering and returns the winning candidate; `resolveCarryForwardLoadKg` becomes `resolveCarryForwardCandidate(...)?.firstWorkSetLoadKg ?? baselineLoadKg ?? null` with its signature and every existing result unchanged. `CarryForwardCandidate` gains optional `sessionId` and `repBasis`; `toCarryForwardCandidate` (`today/service.ts:275-283`) fills `repBasis` in the same place it computes `firstWorkSetLoadKg`, from the same `h.sets` rows. Verified in source that the rows carry `reps`, `rir`, `isWarmup`, and `setNumber` (`today/service.ts:237-255`), so no new query is needed.

| Chain head (`resolveWorkingTargets`) | Rep basis | Suppression |
| --- | --- | --- |
| Decision `chosen.loadKg` (latest accepted/modified for `(exercise, block)`, `progression/service.ts:408-437`) | `chosen.reps ?? schemeDefaultReps(inputs.prescribed.scheme)` read from the decision's own recommendation row | suppress when `|basis − T| ≤ 1` |
| History: the candidate returned by `resolveCarryForwardCandidate` (most recent completed non-deload session with a non-warm-up set, among the last `HISTORY_WINDOW = 8`) | that candidate's `repBasis` = mode of `reps` (ties → lowest) among the session's non-warm-up sets at the **first work set's load** — the load the prefill actually shows — computed in `toCarryForwardCandidate` from the `getExerciseHistory` rows the bundle already holds | suppress when `|basis − T| ≤ 1` |
| `baselineLoadKg` | null | no suppression; informational `CARRY_FORWARD_NO_REP_BASIS` |
| none | null | no suppression |

This resolves review RM-7: the input exists, its population is the carry-forward's own (no window mismatch, because the basis describes the *prefill*, not the estimate), the null behaviour is stated, and there is one selection rule with one implementation (A-14 tests the shared function). With the F-1 toggle in use, the first work set is a work set.

**Transitional consequence (the verification's VM-4).** §3 commits to no backfill, so for every session logged **before** the warm-up toggle existed, the "first work set" is the first *ramp* set and `repBasis` is the ramp's rep count — the same mechanism review RH-4 documented for the prefill itself (60 kg instead of 110 kg). During the transition the gate therefore compares `T` against a ramp's reps for any pre-toggle carry-forward winner inside the 8-session window: a spurious suppression when the ramp's reps happen to lie within 1 of `T`, or a spurious firing when they do not on a session that was actually rep-compatible. The direction of the resulting suggestion remains bounded by every cap in §9.5; the *gate* is what is wrong, and only until the pre-toggle sessions age out of the carry-forward window or the athlete reclassifies their ramps from History. No behaviour is added to compensate; the interim is disclosed here and in §18 step 4(c).

### 10.2 No coexistence with a pending recommendation

**V-23.** When `pendingRecommendation` is non-null for the exercise (after `recommendationForDeload`), the suggestion is `none` with `PENDING_RECOMMENDATION_PRESENT`, regardless of rep compatibility. [P] (review RC-1 option (a); O-11 recommended default.)

**Gate input, stated as a precondition (the verification's VM-3).** The gate's input **is** `TodayBundleExerciseEntry.pendingRecommendation` — the value `buildTodayBundle` has already passed through `recommendationForDeload` and the very value `startSession` freezes into the device-local aggregate (`activeSession.ts:276`) and `logSet` reads when deciding whether to author an implicit decision (`:468`). The strength service must **not** determine pendingness from its own `recommendations` query: both fields must come from one bundle snapshot, so that the suggestion and the frozen recommendation can never disagree, including across a stale cached bundle or an offline completion. `src/server/strength/**` reads a decision row's `chosen`/`inputs` only to compute the *rep basis* of a decision chain head (V-22), never to decide whether a recommendation is pending (§14.5). A-22 asserts the single-snapshot coupling.

Consequences: `resolveImplicitDecision` can never see a suggested load as the first work set while a recommendation is pending, so I-1 ("nothing enters the outbox") and A-18 become true; the two-numbers-one-card problem (RM-11) cannot arise; the rep-incompatible pending recommendation is served by the recommendation card's own "for N-rep sets" line. When an **accepted or modified decision** heads the chain and is rep-incompatible with T, the card *is* shown; logging then enqueues only a `setLog` op because the decision is not pending. The interaction with `roundToStepKg` (review RC-13) is therefore moot: no implicit decision can involve a suggested load.

### 10.3 Precedence table (revised)

| Situation | Prefill (unchanged chain) | Recommendation card | Starting-suggestion line |
| --- | --- | --- | --- |
| Any pending rec | as today | shown, governs | **suppressed** (`PENDING_RECOMMENDATION_PRESENT`) |
| No pending rec; carry-forward or decision rep-compatible with T | as today | — | suppressed (`CARRY_FORWARD_REP_COMPATIBLE`) |
| No pending rec; rep-incompatible carry-forward (scheme changed) | carry-forward, visible and labelled | — | **shown** with tier/confidence/band/reasons and **Use** |
| Decision heads the chain, rep-incompatible | decision's load | — | shown; copy names the decision's rep basis |
| Baseline / no history | baseline or empty | — | `none` or shown per evidence; baseline carries no rep basis |
| `repRange` prescription mid-block under rep-progression | decision `chosen.reps` = T | — | suppressed every session (RH-2 fixed) |
| Deload week / session | modified prefill | blanked | `none` (`DELOAD_SESSION_NO_SUGGESTION`) |
| First work set logged this session | last set | — | **hidden** (review RC-16) — the number has served its only purpose |
| Old cached bundle / pre-upgrade aggregate lacking the field | as today | as today | nothing rendered (optional field; review RL-14) |

### 10.4 Boundary with progression

- `recommendations`, strategy configs, `InputsSummary`, `HISTORY_DISPLAY_LIMIT`, `ENGINE_HISTORY_CAP`, and `historyDepthUsed` are unchanged, and `src/domain/progression/*` is behaviour-identical (I-3): the only edit is V-22's additive `resolveCarryForwardCandidate` refactor of `carryForward.ts`, whose existing function keeps its signature and results. The engine's offline 5-session slice stays byte-identical; W-1 is not re-opened.
- The feature reads facts only, never `recommendations` for evidence (the rep basis of a *decision* is read for the gate, not as strength evidence — stated explicitly so the import-graph test can allow that one read in `src/server/strength/**` while forbidding `evaluateSession`, the strategies, and any write).
- No feedback loop: the athlete's actual reps and RIR — not the suggested number — become the next evidence; a too-light start yields RIR ≥ 5 (excluded) or high RTF (excluded, ≤ 12), so easy sessions cannot lower the estimate; the one degradation path is missing RIR everywhere (R-2), disclosed by `RIR_MISSING_LOWER_BOUND` and confidence ≤ medium.
- Prescribed set count does not enter the initial load; sets 2..S are the engine's completion criterion.

---

## 11. Confidence model

`confidence = min(caps)`, starting at `high`. The vocabulary is `high | medium | low`. Every threshold is a multiple of `NOISE_SD_PCT`.

| Input | Estimate | Suggestion |
| --- | --- | --- |
| Basis/pool sessions = 2 | medium | medium |
| Basis/pool sessions = 1 | low | medium |
| Latest basis age > `FRESH_DAYS_HIGH` (21 calendar days) | medium | medium |
| Latest basis age > `FRESH_DAYS_MEDIUM` (42) | low | low |
| Pool / consistency spread > `SPREAD_MEDIUM_PCT` (2 × noise = 20 %) | medium | medium |
| Pool / consistency spread > `SPREAD_LOW_PCT` (3 × noise = 30 %) | low | refuse, unless a unique consistent majority of ≥ 3 exists (§9.6) — then low with `OBSERVATION_OUTLIER_PRESENT` |
| Any basis flag: `RIR_MISSING_LOWER_BOUND`, `RIR_MODERATE_RANGE`, `EXTENDED_REP_RANGE`, `MIXED_LOADS_IN_SESSION`, `TOP_SET_GOVERNS`, `SINGLE_SET_GROUP` | medium | medium |
| Tier `nearby` | — | medium |
| Tier `far` | — | low |
| Non-direct tier in the load-up direction (`TRANSLATION_UPWARD_IN_LOAD`) | — | medium |
| `EXTENDED_TARGET_EFFORT` (target RTF 13–15) | — | medium |
| `MIXED_RIR_BASIS_REDUCED` | — | medium |
| `POOLED_ESTIMATE_LOWER_USED`, `CAPPED_AT_RECENT_MAX_LOAD` | — | low |
| Equipment `cable` / `dumbbell` / `machine` (`EQUIPMENT_TRANSLATION_NOISIER`) | — | medium |

`high` for a suggestion therefore requires: barbell, direct tier, ≥ 3 direct basis sessions with the latest ≤ 21 days old, spread ≤ 20 %, every basis set with RIR reported ≤ 2 and RTF ≤ 10, target RTF ≤ 12, no cap binding. Deliberately hard, and — unlike the evaluation's 10 % thresholds, which made `medium` the default on ~77 % of healthy triples (research §10.5) — reachable on consistent data.

Spread is `(max − min) / lowerMedian`: a *range* relative to a low centre, systematically larger than a dispersion measure (review §8). Stated so that "≤ 20 %" is read correctly.

**Why one session is `low` for the estimate but `medium` for a suggestion.** The same single session can render as two confidence words on two surfaces on the same day, and that is intended: a single same-rep session is direct evidence for a **load** ("last time you did 5s here you used 110 kg" — no formula, none of the ±10 % error), but it is one noisy observation of a **1RM**, which is a formula output. The asymmetry is the research's §9.3 ordering (direct same-rep evidence outranks any conversion) applied to confidence, and the copy for the estimate must say "based on one session" so the two words are read as different claims, not as an inconsistency.

---

## 12. Determinism and monotonicity

**I-5 (revised).** Same inputs + same `asOfLocalDate` + same algorithm version ⇒ byte-identical output; input order is irrelevant because every sort has the full `(performedOn, startedAt, sessionId)` tiebreak and set order comes from `setNumber`.

**Monotonicity, restated honestly.** The evaluation's implied global property "suggested load non-increasing in T" is not provable under any tiered design and is withdrawn. The provable properties are:

1. Holding the basis fixed, the **pre-cap translated value `rawLoadKg`** is strictly decreasing in `targetRTF` (because `f` is increasing).
2. Holding the basis fixed, the **emitted `loadKg`** is **non-increasing** in `targetRTF`, with plateaus wherever the direct-tier cap, the global cap, or the load-step floor binds. On the §22 headline basis (A = 139.33, direct cap 110, step 2.5) target RTF 4, 5, 6, 7, and 8 all emit 110.0 while `rawLoadKg` falls 122.94 → 110.00; RTF 9–12 then emit 105.0, 102.5, 100.0, 97.5. The plateau is correct and desirable — direct evidence should cap the answer — and the earlier "strictly decreasing" wording described `rawLoadKg`, not the emitted load (the verification's VH-2).
3. Every non-monotone step in the emitted load across adjacent `T` values is disclosed by a change of `tier` or `basisSessionIds` in the DTO.

A-9 tests all three.

---

## 13. Formula and RIR handling (reconciled)

**V-24 — Formula.** Epley, `f(1) = 1`, `f(r) = 1 + r/30`; algorithm id `e1rm-epley-rir` v1. [P] (research C-01: no equation is validated; the four classical benchmarks are near-indistinguishable in within-athlete consistency; Epley/Welday was among the four equations not significantly different from measured 1RM in the ≤ 10-RTF analysis — [E*] EVIDENCE-036 (provisional); continuity with OD-06 (now amended by ADR-011), closed-form inverse, and determinism are legitimate tie-breaks.) **Deleted justification:** "the mildest high-rep growth among the non-flat formulas — the safest shape for the extended band" (evaluation §6.3). The true relation is a spline that flattens at high reps; Epley's linearity is the shape that over-estimates most predictably there (review RM-13; research §7.4, §15.4). `f(1) = 1` remains a good convention (research C-02).

**V-25 — Provenance stated in row 20.** Four of the five compared equations have no published derivation; choosing among them is choosing among coaching conventions (research §7.1). `evidence-to-design.md` row 18's tier ("Convention, heuristic, no corpus backing") is *more* correct in the light of the literature, not less.

**V-26 — RIR.** `RTF = reps + RIR`, integer; no reported value is altered, averaged, corrected, or inferred (I-9; `progression-engine.md` §3 doctrine; B11). Domain: 0–2 full, 3–4 degraded [P], ≥ 5 excluded as a domain rule [P, departs from row 5]. Missing RIR → lower bound on the **estimate** [A]. The pooled RIR error direction is under-prediction (people report fewer reps in reserve than they have), which pushes the e1RM **down** — the conservative direction — but that reassurance rests on a pooled estimate that applies to everyone ([E*] EVIDENCE-033 (provisional): under-prediction 0.95 reps [0.17, 1.73]), **not** on any experience gradient ([E*] EVIDENCE-033 (provisional): training status β = −0.006 [−0.02, 0.007]; research §15.9: "far worse in novices" is contradicted by the best synthesis; no demographic or experience trust-weighting, N-6, GAP-07 as narrowed 2026-09-05).

**V-27 — Honesty ledger entry (new).** The app logs a **post-set, retrospective** RIR. Every RIR-accuracy measurement in the literature is a pre-set prediction or an intra-set call-out; the accuracy of the retrospective report has never been measured (research `Ø-2`). Row 20 says so in the same breath as EVIDENCE-030's numbers, and the composition `(reps + reported RIR)` inside a 1RM equation has never been validated against a measured 1RM (`Ø-1`, evaluation RG-2). Both absences are now recorded as **GAP-11** in `docs/evidence/research-gaps.md`; the translation half's absence is **GAP-12**.

**V-28 — Error propagation (verified arithmetic).** One rep of RTF error moves the e1RM by +3.0 % at RTF 3, +2.9 % at 5, +2.7 % at 7, +2.5 % at 10, +2.4 % at 12. With EVIDENCE-030's 0.40–0.90-rep error, RIR contributes roughly ±1–2.5 % — smaller than the ≈ 10 % individual scatter, comparable to one `loadStepKg` on a 100 kg lift. Copy must not attribute the imprecision mainly to RIR; formula misspecification and individual variation dominate.

---

## 14. Boundaries with the rest of the repository

### 14.1 History

Read-only over `set_logs`, `session_exercises`, `workout_sessions`, `exercises`. The history screen is unchanged; the new page is a separate read-only surface (like volume). Edits and deletions recompute on the next read; renumbering after a delete (`setDeletionOps.ts:50-92`) changes nothing here. Archived exercises: the strength endpoint **serves** them (history is archive-agnostic by design: neither the Today bundle nor history filters `archivedAt`) — O-15 recommended default, open.

### 14.2 Volume

No coupling in either direction. Weekly volume neither consumes nor is consumed by strength; the import-graph test asserts both directions.

### 14.3 Offline and sync

- **Server-side computation only in v1** [R]: the client holds at most 5 sessions per scheduled exercise and no all-time series; a client computation would diverge. The pure module lives in `src/domain/strength/` so a client caller remains possible (D-7).
- **Bundle fields**: `strengthEstimate?` (**current only** — `{ currentE1rmKg, confidence, reasonCodes[0..], algorithm, asOf }`) and `startingSuggestion?` on `TodayBundleExerciseEntry`; declared on the server, mirrored **optional** on the client (`src/sync/types.ts` tolerance rule). `best` is served by the detail endpoint only, so the bundle never needs an all-time scan — O-14 recommended default, open.
- **One batched query per bundle** [R] (review RM-8, RC-11): observations for **all** prescribed exercise ids in one `inArray` query bounded by the window start instant (the `getWorkSetsByExercise` pattern, `progression/service.ts:122-126`), never inside the per-prescription `for` loop (`today/service.ts:512-552`). Prototyping step 1 in §18 measures current bundle latency before anything is added.
- **Freeze at `startSession`**: the suggestion is copied into the device-local active-session aggregate (the `freezeWarmupState` precedent, `activeSession.ts:296`), never into any payload builder; it dies with the aggregate; cross-device adopt loses it (the warm-up O-3 limitation). Hidden once a work set is logged for that exercise (§10.3).
- **Staleness**: the IDB bundle cache has no TTL (`bundleCache.ts`) and the SW caches the bundle for 24 h `NetworkFirst`/3 s (`src/app/sw.ts:253-269`). The card shows "as of <generatedAt>"; an un-synced session completed offline is not in the estimate until convergence — disclosed, not fixed (review §7.3 items 1–2). A stale suggestion can only mislead in the direction of an out-of-date number; it cannot write anything.
- **Zero impact** on `SYNC_ENTITIES`, op schemas, `MAX_OPS_PER_BATCH`, replay, dedupe. W-1 is not re-opened.
- The exercise strength page and the detail endpoint are `NetworkOnly` like every other API GET (`sw.ts:278-286`).

### 14.4 Data model

| Change | Kind | Notes |
| --- | --- | --- |
| `exercises.strength_estimate text not null default 'auto' check in ('auto','off')` | additive column, planning world, mutable, not snapshotted | Enum over boolean (leaves room for D-3 / D-11 values) — review O-2 accepted with modifications |
| One-shot reconcile in the same migration: `'off'` for the two seeded rows (`machine-assisted-pull-up`, `dumbbell-farmers-carry`) via their deterministic `slugToUuid` ids | migration | The seed is insert-if-absent (`db/seed/exercises.ts:45-56`), so a seed-level default never reaches existing rows |
| `strengthEstimate` added to `updateExerciseSchema` (currently `.strict()`, so it would be rejected) and routed through the user-scoped `updateExercise` | domain + server | Required, not optional |
| `GET /api/exercises/[id]/strength?asOf=` | new read endpoint | Ownership `and(eq(exercises.id, id), eq(exercises.userId, userId))` → 404 otherwise (`server/exercises/service.ts:167-171` pattern); `asOf` parsed as ISO, invalid → 400, **future clamped to server now** and echoed as the effective `asOf` (so RM-2 is not user-triggerable); archived served (O-15) |
| **No** change to `set_logs`, `session_exercises`, `workout_sessions`, `recommendations`, `PrescriptionSnapshot` (`v` stays 1), `SYNC_ENTITIES`, op schemas, `InputsSummary` | — | I-1, I-3 |

PI-005 note: a future `strength_reps` measurement profile may become the structural eligibility gate and narrow or supersede `strength_estimate`. The column is kept for v1 because PI-005 is a cross-cutting redesign with its own architecture gate; the two must not accumulate overlapping metadata — D-11 records the reconciliation trigger.

### 14.5 Module layout and boundary tests

- `src/domain/strength/**` imports only `src/domain/strength/**` plus **type-only** imports from `src/domain/schemes/**` (`RirBand`, `SetScheme`). It does **not** import `src/domain/progression/**` — `T` and `loadStepKg` arrive as data; it has its own grouping helper.
- `src/domain/progression/**` does not import `src/domain/strength/**`.
- `src/server/strength/**` does not import `evaluateSession`, `loadProgression`, `repProgression`, or write to `recommendations`; it may read a decision's `chosen`/`inputs` for the **rep basis** of a decision chain head (V-22) and may import `carryForward.ts`'s `resolveCarryForwardCandidate`. It must **not** query `recommendations` to decide whether one is pending — that input is the bundle's `pendingRecommendation` field (V-23).
- Enforced by a transitive import-graph test in the `tests/unit/progressionBoundary.test.ts` style with anti-vacuity assertions. ESLint alone does not enforce this: `{ from: "server", allow: ["domain","db","server"] }` permits the forbidden import (review §6).

---

## 15. UI and copy

### 15.1 Surfaces

| Surface | Release | Shows |
| --- | --- | --- |
| `/exercises/[id]/strength` (new route; linked from the library row and the workout card) | A | Current (grid value + band + confidence + first reason), best (grid value + date + "unconfirmed"), trend list of observations (date, governing `load × reps @ RIR`, ≈ e1RM, flags; deload rows badged and greyed; excluded groups shown as excluded), inline SVG sparkline (OD-04 stays open, N-7), what-if calculator (reps + RIR → load from the current estimate with the same rules and codes), footer with algorithm id/version and "Estimates only — not tested maxes." |
| Workout execution card | B | One line under the prescription when a suggestion exists: "Starting suggestion ≈ 100 kg (likely 90–110) · medium · estimated from sessions at nearby rep counts" with **Use** and a disclosure of all reason codes. When `none` on an eligible exercise with a rep-incompatible prefill: one muted line naming the reason ("Prefilled 110 kg comes from a 5-rep session; no estimate for 12 reps yet" / "Recent sessions disagree too much"). Hidden after the first work set. Visually distinct from `RecommendationCard`. |
| Today, template editor, recommendation card | — | Nothing in v1 (D-8, D-9). |

### 15.2 Copy rules

Must never appear: "1RM" or "max" without "estimated"; "PR"/"personal record" for an estimated value; any invitation to test a max; "predicted", "will lift", "you can lift"; an unqualified decimal; "recommendation"/"recommended" for a suggestion; "accurate", "precise", "scientifically", "research shows"; any detraining explanation of a window ("your strength may have declined"); any claim that the estimate is the athlete's strength or that a change in it is a change in strength; any attribution of imprecision mainly to RIR.

Structural rule: every rendered value passes through one formatter (`formatEstimate`) that applies the grid, prepends "≈", appends the band and "est." — a value cannot reach the screen without its label.

### 15.3 New copy requirements from the research and review

- **Lower-bound wording** (research §8.3): "at least ≈ X kg *by this estimate* (RIR not logged)" — a claim about the formula's output, never "your 1RM is at least X".
- **Unit convention** (review O-7): the page states "in the numbers you log for this exercise".
- **Freshness wording** (§8.2): "based on the last 90 days of training", "most recent session 6 weeks ago".
- **Band required** (§8.5, §9.5): every current, best, and suggestion shows its ±10 % band. For a suggestion the band brackets the **raw translation**, not the floored load, so on a coarse grid the shown load can sit at the band's lower edge ("≈ 20 kg (likely 20–30)"); the copy may not re-centre the band on the shown load.
- **Refusal lines** for every code in §9.6.
- **"Post-deload dips are expected"** may be used (B6 / EVIDENCE-025 — the one evidence-backed sentence).

### 15.4 Reason-code enum and copy map

`src/domain/strength/reasonCodes.ts` declares exactly the codes below, grouped by the level that emits them. This table is the referent for I-14 and A-19 (the verification's VL-4): every member must be emitted by at least one fixture, and no code may be used anywhere in this document, in code, or in copy that is not listed here. Phrasing is owned by `src/ui/strength/copy.ts`; the column here fixes the meaning, not the final wording.

**Observation level** (flags on one session's observation; the six `*_SETS_EXCLUDED` codes are derived from `excludedSetCounts`; warm-up sets are counted but carry no code):

| Code | Emitted when | Phrasing |
| --- | --- | --- |
| `ZERO_LOAD_SETS_EXCLUDED` | `excludedSetCounts.zeroLoad > 0` | "0 kg sets not used" |
| `HIGH_RIR_SETS_EXCLUDED` | `excludedSetCounts.highRir > 0` | "Sets at RIR 5+ not used" |
| `HIGH_REP_SETS_EXCLUDED` | `excludedSetCounts.highRep > 0` | "Sets beyond 12 reps to failure not used" |
| `SUB_MODAL_SETS_EXCLUDED` | `excludedSetCounts.subModal > 0` | "Lighter sets treated as warm-up or back-off" |
| `IMPLAUSIBLE_SETS_EXCLUDED` | `excludedSetCounts.implausible > 0` | "A much heavier set was left out as implausible" |
| `RIR_MISSING_LOWER_BOUND` | any first-three set of an admitted group lacks RIR | "RIR not logged — a lower bound by this estimate" |
| `RIR_MODERATE_RANGE` | any such set has RIR 3–4 | "Some sets were far from failure" |
| `EXTENDED_REP_RANGE` | any such set has RTF 11–12 | "High-rep sets used — less precise" |
| `MIXED_LOADS_IN_SESSION` | more than one admitted group | "Mixed loads in a session" |
| `TOP_SET_GOVERNS` | governing group ≠ modal group | "Based on the heavier set" |
| `SINGLE_SET_GROUP` | governing group has one set | "Based on a single set" |
| `DELOAD_SESSION` | `isDeload` | "Deload session — shown, not counted" |

**Estimate level** (`deriveEstimate`; plus every distinct observation-level flag of any pool observation, propagated once):

| Code | Emitted when | Phrasing |
| --- | --- | --- |
| `NO_ELIGIBLE_SETS` | no observation exists | "No eligible sets yet" |
| `NO_RECENT_EVIDENCE` | observations exist, none in the window | "No sessions in the last 90 days" |
| `SINGLE_SESSION_EVIDENCE` / `TWO_SESSION_EVIDENCE` | pool size 1 / 2 | "Based on one session" / "Based on two sessions" |
| `EVIDENCE_AGING` / `EVIDENCE_OLD` | latest pool session 22–42 / 43–90 days old | "Most recent session N weeks ago" |
| `ESTIMATE_SPREAD_WIDE` / `ESTIMATE_SPREAD_VERY_WIDE` | pool spread > 20 % / > 30 % | "Recent sessions vary" / "Recent sessions vary a lot" |
| `BEST_UNCONFIRMED` | no other observation within 10 % of `best` | "Unconfirmed — no second session near it" |
| `DELOAD_SESSIONS_EXCLUDED` | any deload observation exists | "Deload sessions not counted" |

**Suggestion level — refusal** (`status: "none"`; the first-listed code is primary, in §9.6's order):

| Code | Emitted when | Phrasing |
| --- | --- | --- |
| `EXERCISE_CATEGORY_UNSUPPORTED` | equipment not barbell/dumbbell/cable/machine | "Not available for this equipment type" |
| `EXERCISE_ESTIMATE_DISABLED` | `strength_estimate = 'off'` | "Strength estimate turned off for this exercise" |
| `DELOAD_SESSION_NO_SUGGESTION` | `todayIsDeload` | (line not shown) |
| `PENDING_RECOMMENDATION_PRESENT` | bundle `pendingRecommendation ≠ null` | (line not shown; the recommendation card governs) |
| `CARRY_FORWARD_REP_COMPATIBLE` | carry-forward rep basis within 1 of `T` | (line not shown) |
| `NO_ELIGIBLE_SETS` / `NO_RECENT_EVIDENCE` | as at estimate level | "No estimate for N reps yet" |
| `OBSERVATIONS_DISAGREE` | §9.6 gate refuses | "Recent sessions disagree too much" |
| `REP_DISTANCE_TOO_FAR` | no admitted group within the directional limits | "No logged rep range close enough to N reps" |
| `TARGET_NEAR_MAXIMAL_NOT_SUGGESTED` | target RTF < 3 | "No suggestion for near-maximal targets" |
| `TARGET_OUTSIDE_FORMULA_DOMAIN` | target RTF > 15 | "Target reps and reserve too high to estimate" |
| `BELOW_MINIMUM_LOAD` | non-finite or ≤ 0 raw or floored load | (line not shown) |

**Suggestion level — informational** (`status: "ok"`; plus every distinct observation-level flag of any basis group's observation, propagated once):

| Code | Emitted when | Phrasing |
| --- | --- | --- |
| `SOURCE_DIRECT_SAME_REPS` / `SOURCE_NEARBY_REPS_TRANSLATED` / `SOURCE_FAR_REPS_TRANSLATED` | tier direct / nearby / far | "From your recent N-rep sessions" / "Estimated from nearby rep counts" / "Estimated from a distant rep count" |
| `TRANSLATION_UPWARD_IN_LOAD` | non-direct tier, load-up direction | "Translated to a heavier load than logged" |
| `OBSERVATION_OUTLIER_PRESENT` | §9.6 continued with a session removed | "One recent session was left out as an outlier" |
| `MIXED_RIR_BASIS_REDUCED` | basis reduced to `rirComplete` groups | "Only sessions with RIR logged were used" |
| `TARGET_RIR_FROM_BAND_MAX` / `TARGET_RIR_FROM_RECENT_EFFORT` / `TARGET_RIR_EFFORT_MATCHED` | §9.4 rows 1 / 2 / 3 | "Assumes RIR n" / "Assumes your recent effort" / "Assumes the same effort as logged" |
| `EXTENDED_TARGET_EFFORT` | target RTF 13–15 | "Target reserve is beyond the usual range — likely light" |
| `POOLED_ESTIMATE_LOWER_USED` | §9.5 step 2 bound | "Lowered to match your overall estimate" |
| `DIRECT_EVIDENCE_CAPS_LOAD` | §9.5 step 3 bound | "Capped at the load you actually lifted for these reps" |
| `CAPPED_AT_RECENT_MAX_LOAD` | §9.5 step 4 bound | "Capped near your heaviest recent working load" |
| `ROUNDED_DOWN_TO_LOAD_STEP` | floor changed the value | "Rounded down to the load step" |
| `EQUIPMENT_TRANSLATION_NOISIER` | cable / dumbbell / machine | "Less precise on this equipment type" |
| `CARRY_FORWARD_NO_REP_BASIS` | chain head is a baseline or empty | "Prefilled load is a baseline, not from a session" |

Forty-eight distinct codes. `SESSION_SETS_INCONSISTENT`, `REP_DISTANCE_FAR`, `NEARBY_POOLED_DISAGREE`, `PENDING_RECOMMENDATION_COMPATIBLE`, and `SOURCE_CURRENT_ESTIMATE_TRANSLATED` from the evaluation are **not** members and must not be re-introduced.

---

## 16. Constants — final values and reconciliation with the research

`src/domain/strength/constants.ts`. Every value is labelled with its tag; the research's `C-nn` id is given where it classified the constant.

| K | Constant | Evaluation | **Revision** | Tag | Reconciliation |
| --- | --- | --- | --- | --- | --- |
| K-01 | `STRENGTH_ALGORITHM` | epley v1 | epley v1 | [P] | C-01: keep formula, delete "safest shape" justification |
| K-02 | `f(1) = 1` | yes | yes | [P] | C-02 |
| K-03 | `NOISE_SD_PCT` | — | **10** | [E*] magnitude / [P] value | Research §15.6: four independent directions give ≈ ±10 % (1 SD); the named constant every threshold below derives from. **Provisional registry basis (entered 2026-09-05, status corrected 2026-09-06):** EVIDENCE-034 (measured-1RM CV ≈ 4 %), EVIDENCE-035 (estimate SEE 9.8 %), EVIDENCE-036 (±10.2–12.5 % scatter), EVIDENCE-032 converted through Epley (±6.7–8.7 points) — all provisional. The *existence and order of magnitude* are [E*] until intake closes; choosing exactly 10 remains a calibrated convention |
| K-04 | `RTF_MAX` (source) | 15 | **12** | [E*] / [R] | C-04 contradicted; EVIDENCE-033 (provisional) β break above 12 reps to failure; EVIDENCE-036 (provisional) accuracy loss beyond ~10; matches OD-06's number (ADR-011 amends its role) |
| K-05 | `RTF_CORE_MAX` | 10 | 10 | [E*] | C-03: EVIDENCE-036 (provisional; bias +5.3 % → +0.5 % on restriction to ≤ 10 RTF); E1-E-05 corroborates, not in the registry |
| K-06 | `RIR_NEAR_FAILURE_MAX` | 2 | 2 | [P] | C-05: direction supported, boundary is convention |
| K-07 | `RIR_ELIGIBLE_MAX` | 4 | 4 | [P] departs from row 5 | C-06: re-justified as a domain rule (§6.2) |
| K-08 | `GROUP_SET_POSITIONS` | — (all sets) | **3** | [E*] | C-25 contradicted → fixed-position rule (§7.4) |
| K-09 | `PLAUSIBILITY_FACTOR` | — | **1.20** (1 + 2 × noise) | [P] calibrated | New; §7.3 |
| K-10 | `EVIDENCE_WINDOW_DAYS` | 90 (instant) | 90 (**calendar, account tz**) | [P] | C-08 unpinned, relabelled freshness; RM-3 |
| K-11 | `CURRENT_SESSION_COUNT` | 3 | 3 | [P] | C-09; D-10 widening trigger kept |
| K-12 | `FRESH_DAYS_HIGH` / `FRESH_DAYS_MEDIUM` | 21 / 42 | 21 / 42 (calendar) | [P] | C-10/C-11 relabelled freshness |
| K-13 | `SAME_REPS_TOLERANCE` | 1 | 1 | [E*] / [A] | C-12: the best-supported rule — same-rep evidence bypasses the exercise-identity and individual-variability error the provisional EVIDENCE-032 quantifies; ≤ 1.4 % formula disagreement at distance ≤ 1 is arithmetic |
| K-14 | `NEARBY_REPS_MAX_DOWN` (load-down) | 3 | 3 | [P] / [A] | C-13: ≤ 5.2 % disagreement |
| K-15 | `NEARBY_REPS_MAX_UP` (load-up) | 3 | **2** | [P] / [A] | Research §9.5 directional: 5.9 % at d = 2 load-up |
| K-16 | `MAX_REP_DISTANCE_DOWN` (load-down) | 8 | **4** (far tier, low) | [A] | C-15 contradicted: 7.5 % at d = 4, 19.2 % at d = 8 |
| K-17 | `MAX_REP_DISTANCE_UP` (load-up) | 8 | **3** (far tier, low) | [A] | Research §9.5: 10.8 % at d = 4 load-up **and** the error adds load |
| — | `FAR_REP_DISTANCE` | 6 | **removed** | — | C-14 redundant once distances are capped at 4/3 |
| K-18 | `TARGET_RTF_MIN` | 3 | 3 | [P] | C-16 |
| K-19 | `TARGET_RTF_CORE_MAX` / `TARGET_RTF_MAX` | 15 | **12 / 15** (13–15 flagged) | [A] / [P] | §9.4: target-side error is conservative in direction |
| — | `SESSION_SPREAD_FLAG_PCT` | 15 | **removed** | — | C-17 contradicted (unreachable); signal carried by `MIXED_LOADS_IN_SESSION` / `TOP_SET_GOVERNS` |
| K-20 | `SPREAD_MEDIUM_PCT` | 10 | **20** (2 × noise) | [P] calibrated | C-18 contradicted: 10 % fired on ~77 % of healthy triples |
| K-21 | `SPREAD_LOW_PCT` | 20 | **30** (3 × noise) | [P] calibrated | C-19 unresolved → 3 SD |
| K-22 | `DISAGREE_REFUSE_PCT` | 20 (pairs) | **30** (pairs; for n ≥ 3, refuse unless a unique consistent majority of ≥ 3 exists, §9.6) | [P] calibrated | C-20 contradicted: 20 % refused ~21 % of healthy pairs |
| K-23 | `TIER_VS_POOLED_DISAGREE_PCT` | 10 | **20** (2 × noise); direct tier exempt | [P] calibrated | C-21 contradicted: 10 % was a coin flip |
| K-24 | `UPWARD_LOAD_CAP_FACTOR` | 1.10 | 1.10 (**every tier**) | [P] calibrated; [E*] for the need | C-22: ≈ 1 SD; the *need* for a cap is the provisional EVIDENCE-035 (authors recommend direct assessment where precision matters) and EVIDENCE-034/036 (≈ 3× measurement noise); RH-3's direct-tier bypass closed |
| K-25 | `BEST_UNCONFIRMED_PCT` | 10 | 10 | [P] calibrated | C-23: the best-calibrated threshold in the family |
| K-26 | `E1RM_DISPLAY_ROUND_KG` | 1 | **exercise `loadStepKg` grid + required ±10 % band** | [P] | C-24 contradicted |
| K-27 | Lower median of working sets | all sets | **max over admitted groups of (lower median of first three)** | [E*] / [P] | C-25, C-27 (§7) |
| K-28 | One observation per session | yes | yes (with `groups[]`) | [E*] | C-26 |
| K-29 | Missing RIR → lower bound | yes | yes, **on the estimate** | [A] | C-28 with the required caveat |
| K-30 | Mixed RIR basis | `some()` → band | **homogeneous basis or effort-matched** | [A] | C-29; RM-12 |
| K-31 | Target RIR = band max | yes | yes | [P] | C-30 |
| K-32 | Effort-matched when no RIR | yes | yes | [A] | C-31 |
| K-33 | Floor to `loadStepKg` | yes | yes (no discount cap) | [P] | C-32: interaction stated, cap rejected (X-12) |
| K-34 | One value, not a range | yes | one value **plus a required band** | [P] | C-33 |
| K-35 | Deloads badged, excluded | yes | yes | [E] | C-34 (EVIDENCE-025 / B6) |
| K-36 | Equipment eligibility, no penalty | yes | **split**: tracker no penalty; suggestion cap medium | [E*] | C-35 split verdict (§9.7) |
| K-37 | `bodyweight`/`other`/assisted/timed excluded | yes | yes | [E*] / [P] | C-36–C-39 |
| K-38 | Unilateral "as logged" | yes | yes | [P] | C-40 unresolved |
| K-39 | Advisory only; never a strategy trigger; never a measured max | yes | yes | [E] row 15, row 18 | C-41, C-42 — the two mitigations the source authors themselves recommend |

Citation discipline for row 20 (written 2026-09-05, corrected 2026-09-06): only registry ids may appear in the design's evidence column — EVIDENCE-014/025/029/030 without qualification, and EVIDENCE-032…037 **only with the marker "provisional"** (they entered outside the PDF/research-note intake; registry §13); B6/B8/B11 and B12/B13 (the latter two rest on provisional items); GAP-07 (narrowed, provisionally), GAP-09, GAP-10, and GAP-11/GAP-12; rows 4/5/15/18. Every [E*] tag above — whether it rests on a provisional registry item or on a source with no registry entry (K-08, K-27, K-28 on Senna 2011; K-36, K-37 on the rejected preprint; the E1-E-05 corroborations) — is written into row 20 as a convention or as provisional evidence, never as settled evidence.

---

## 17. Owner decisions — consolidated

**Status 2026-09-05: all twenty accepted exactly as recommended** — see the owner decision addendum after §1.1. The table is retained as the record of what was decided, the alternative that was declined, and what each decision gated. O-17 has been executed in substance (registry EVIDENCE-032…037 entered as **provisional** items pending PDF/research-note intake — status corrected 2026-09-06; the preprint not promoted); O-9 is recorded as ADR-011.

| O | Question | Recommended default (this document assumes it) | Alternative | Blocks |
| --- | --- | --- | --- | --- |
| O-1 | v1 shape | **Two releases**: tracker (A), then advisory suggestion (B) after one block of tracker use (§4). Option recorded: B could ship direct tier only. | Ship together (evaluation B-1) | Release A |
| O-2 | `exercises.strength_estimate` | **Accept**: text enum `'auto' \| 'off'`, default `'auto'`, one-shot reconcile for the two seeded rows, `updateExerciseSchema` addition, `'off'` can only disable (§14.4) | Ship without; the two seeded exercises show meaningless estimates | Release A |
| O-3 | 110 % cap | **Accept**, every tier (§9.5) | Uncapped | Release B |
| O-4 | Placement | **Accept** `/exercises/[id]/strength`; toggle in the edit form; no Today change | Embed in edit form | Release A |
| O-5 | Warm-up toggle | **Resolved outside this task** — implemented as the F-1 remediation; its verification and commit is Release A's external gate (§3) | — | Release A (external) |
| O-6 | Missing-RIR policy | **Accept** effort-matched lower bound with the homogeneity rule (§9.4) | Assume the band's minimum (X-7) | Release B |
| O-7 | Dumbbell/cable/machine/unilateral | **Accept, split** (§9.7): no tracker penalty; suggestion confidence ≤ medium | Exclude until D-3; or no penalty anywhere | Release A (tracker part), B |
| O-8 | `other` equipment | **Exclude** | Eligible at low confidence | Release A |
| O-9 | OD-06 | **Amend, not "resolve as continuity"**: record input change (`reps + RIR`), `f(1) = 1`, source ceiling 12 (unchanged from OD-06), target ceiling 15 (new), date and trigger, in an ADR; leave OD-04 open | Treat B-2 as a resolution | Release A |
| O-10 | Deload rows on the page | **Show, badged** | Hide | Release A |
| O-11 | Suggestion with a pending recommendation | **Suppress on any pending recommendation** (§10.2) | Allow, and accept that Use can author a Decision — requires rewriting I-1/A-18 and a precedence rule | Release B |
| O-12 | Source RTF ceiling | **12** (reject the extension to 15) | 15 | Release A |
| O-13 | Window semantics | **Account-timezone calendar days** | Rolling instants | Release A |
| O-14 | Bundle `best` | **Bundle carries `current` only; `best` on the detail endpoint** | All-time best in the bundle (an all-time scan on the hot path) | Release B |
| O-15 | Archived exercises | **Serve** the strength page (history is archive-agnostic) | 404 | Release A |
| O-16 | Direct tier translates for effort | **Yes** (§9.5 step 3): translate, then cap at the heaviest basis load — the trade is that the card may show a load *lighter* than the athlete's last same-rep load when today's target asks for more reserve | Return the raw modal load (evaluation) | Release B |
| **O-17** | Evidence-registry promotion | **Promote** the research's EVIDENCE-032…037 candidates (research §21) through registry → boundaries/gaps → map, **before** any [E*] tag is upgraded; do **not** promote E1-E-20 (preprint, single author, employer conflict, no ground truth) | Leave all [E*] as [P] indefinitely | Nothing (labels only) |
| **O-18** | Display grid | **Exercise `loadStepKg` grid + band** (§8.5) | Fixed 2.5 kg grid + band; or 1 kg + band | Release A |
| **O-19** | Top-set rule | **Max over plausible admitted groups with `TOP_SET_GOVERNS`** (§7.5) | Two observations per session; or keep the diluting lower median until `perSet` (evaluation D-4) | Release A |
| **O-20** | Target RTF extension | **Allow 13–15 flagged** (§9.4) | Refuse above 12 — then a 12-rep target with a 0–2 band never gets a suggestion | Release B |

---

## 18. Prerequisites and implementation sequence (revised; not started)

1. **External gate**: F-1 remediation verified and committed (§3).
2. **Owner addendum** on this file recording O-1…O-20 — **done 2026-09-05** (addendum after §1.1); the rules are binding.
3. **Documents before code**: `evidence-to-design.md` row 20 (basis: EVIDENCE-014/030 for the noise model only; B6/EVIDENCE-025 for deload framing; not justified: presenting as strength, sub-rep precision, any threshold as calibrated, RIR accuracy by demographics, detraining rationale, generalisation beyond this athlete/exercise/convention; departures: row 5 for RIR ≥ 5; `Ø-2` honesty entry). OD-06 amendment ADR (O-9). O-17 registry promotion. — **All done 2026-09-05:** row 20 written; ADR-011 created and OD-06 moved out of `open-decisions.md`; EVIDENCE-032…037 entered as **provisional** registry items (status corrected 2026-09-06) with A13–A16, B12–B13, GAP-11–12; the preprint not promoted; full promotion waits on the registry's closure condition.
4. **Prototyping (no research needed)**: (a) measure current Today-bundle latency on the local Docker database with a realistic catalogue before adding the batched query; (b) run the revised algorithm over the athlete's real `set_logs` locally and inspect every session where `IMPLAUSIBLE_SETS_EXCLUDED`, `TOP_SET_GOVERNS`, or `SUB_MODAL_SETS_EXCLUDED` fires; (c) after Release A, replay a full block and count how often the suggestion *would* have fired — more than once per scheme change means the gate is still wrong. The replay necessarily runs over pre-toggle history, where the carry-forward rep basis is a ramp's rep count for every unflagged session (V-22, transitional consequence); classify each firing as "gate correct", "gate wrong", or "pre-toggle ramp basis" before drawing any conclusion, otherwise a correct gate can be measured as broken or a broken one as correct.
5. **Release A**: O-2 migration verified on local PostgreSQL 16; `src/domain/strength/` (constants, primitives, eligibility, groups, observation, estimate, reason codes) with the §7/§8 fixtures as unit tests; boundary test; server service + endpoint + page + formatter. Independent review of the numbers against real history before device use.
6. **Release B** (after one block of A): `suggestStartingLoad`, bundle fields, batched query, `sync/types.ts` mirror, aggregate freeze, hide-after-first-set, card with Use; A-criteria of §21 tagged (B).
7. **Device acceptance** on the iPhone PWA: 5×5 → 3×12 and back; `repRange` block under rep-progression (card must stay silent); offline cold launch with an old cached bundle; deload week; an exercise switched off; a top-set/back-off session; a session with the warm-up toggle used.
8. **Observation period** before any D-1/D-2/D-5 discussion.

---

## 19. Deferred, non-goals, rejected

**Deferred (with triggers)** — D-1…D-10 as in the evaluation §22 stand, with these changes: **D-4** (top-set aggregation at `perSet`) is **closed** — handled now (§7.5); **D-11 (new)** reconcile `strength_estimate` with PI-005's measurement profile when PI-005's architecture pass runs; **D-12 (new)** revisit `GROUP_SET_POSITIONS`, the plausibility factor, and the 30 % refusal threshold after one block of tracker data (they are calibrated against external populations, not this athlete).

**Non-goals** — N-1…N-8 as in the evaluation §18.3 stand: no `percent-1rm` strategy; no persisted estimate or "used suggestion" fact; no bodyweight/assisted/`other` estimates; no cross-exercise inference or merge; no live in-session PR hints; no RIR correction or demographic weighting; no charting library decision; no change to PI-001. Added: **N-9** no copy claims a benefit of the suggestion (research `Ø-6` / RG-8: no study exists); **N-10** no client-side computation in v1.

**Rejected** — X-1…X-11 as in the evaluation §22 stand. Added: **X-12** capping the floor-rounding discount (would round up on light loads — the one direction the design refuses); **X-13** a tighter rep-distance limit for non-barbell equipment (the directional limits are already tight; a confidence cap carries the same information); **X-14** a remote/pooled translation tier beyond distance 4/3 (17–19 % of the answer would be arbitrary); **X-15** "most recent same-rep load wins" as the direct tier (non-monotone, effort-blind); **X-16** any global monotonicity guarantee (unprovable under tiers; replaced by the local property in §12).

---

## 20. Finding-disposition tables

### 20.1 Review findings (every RH / RM / RL)

| Finding | Disposition | Where |
| --- | --- | --- |
| **RH-1** Use + pending rec authors a Decision; I-1/A-18 false | **Resolved**: suppress on any pending rec (RC-1a); the gate reads the bundle's `pendingRecommendation`, the same value the aggregate freezes (the verification's VM-3); I-1, A-18 restored; O-11 open with this as the recommended default | §10.2, I-1, A-22 |
| **RH-2** `T` ignores `decision.chosen.reps`; gate never fires on rep ranges | **Resolved**: `T = decisionChosen?.reps ?? schemeDefaultReps` (RC-2); fixture required | §10.1, A-13 |
| **RH-3** Direct tier non-monotone, effort-blind, unfloored, uncapped | **Resolved**: one translation path for all tiers; direct evidence caps upward; floor and 110 % cap apply everywhere (RC-3); non-monotone dataset now refused by the consistency gate; global monotonicity claim withdrawn (X-16) | §9.3–9.5, §12, A-10, A-11 |
| **RH-4** F-1 larger than stated; modal defence fails on top-set days | **Resolved outside** (F-1 remediation, external gate) + **resolved here**: modal rule demoted to defence in depth (RC-4); tie → heaviest; plausibility band; top set governs | §3, §7 |
| **RM-1a** RIR ≥ 5 exclusion presented as B8-backed | **Resolved**: relabelled a domain rule that departs from row 5; departure recorded in row 20 (RC-15) | §6.2, §16 K-07 |
| **RM-1b** RIR 3–4 degradation cites EVIDENCE-014 against EVIDENCE-030 | **Resolved**: relabelled a conservative policy; EVIDENCE-014 not cited for it (RC-15) | §6.2, K-06 |
| **RM-2** `best` ignores `asOf`; future observations counted stale | **Resolved**: `asOf` bounds `best`; stale counts past only; `?asOf=` clamped non-future (RC-6) | §8.3, §14.4, A-6 |
| **RM-3** Instant windows vs calendar convention; string comparison; PI-002 | **Resolved**: account-timezone calendar days; epoch comparison; UTC precondition; PI-002 posture (RC-7); O-13 open with this default | §8.1, A-7 |
| **RM-4** `OBSERVATIONS_DISAGREE` unreachable from direct tier; no estimate reason codes | **Resolved**: gate runs before tier selection over pool ∪ basis; for n ≥ 3 it continues only on a unique consistent majority of ≥ 3, otherwise refuses (RC-8; corrected per the verification's VM-1); `deriveEstimate` returns codes | §9.6, §8.4, A-8, A-32 |
| **RM-5** 8 unreachable codes; `DELOAD_SESSION` undeclared | **Resolved**: exclusion counts on the observation feed every `*_SETS_EXCLUDED` code; estimate carrier added; one deload spelling per level; unreachable codes deleted; reachability test (RC-9) | §7.6, §8.4, §9.6, A-19 |
| **RM-6** Order dependence on equal `performedAt` | **Resolved**: `(performedOn, startedAt, sessionId)` tiebreak everywhere (RC-10) | §8.1, A-5 |
| **RM-7** `carryForward.repBasis` does not exist; population mismatch | **Resolved**: rep basis produced by the shared `resolveCarryForwardCandidate` from the carry-forward's own history rows / decision row; null behaviour and the pre-toggle transitional consequence stated (RC-5; the verification's VM-2, VM-4) | §10.1, A-14 |
| **RM-8** Bundle cost understated (N+1, all-time scan, 3 s timeout) | **Resolved**: one batched window query; `best` off the bundle (RC-11); latency measured first; O-14 open with this default | §14.3, §18 step 4, A-24 |
| **RM-9** I-7's deload guard has no home in the pure module | **Resolved**: `todayIsDeload` is an input (RC-12) | §9.6, I-7, A-12 |
| **RM-10** I-8 false: direct loads not floored | **Resolved**: floor applies to every tier; I-8 reworded (RC-13) | §9.5, I-8 |
| **RM-11** Two competing numbers, accept-then-Use divergence | **Resolved** by RH-1's suppression; hide after first work set (RC-16) | §10.2–10.3 |
| **RM-12** Mixed RIR basis double-discounts | **Resolved**: homogeneous basis or effort-matched (RC-14) | §9.4, A-16 |
| **RM-13** RTF 11–15 extension non-conservative; departs from OD-06 | **Resolved**: `RTF_MAX = 12` (RC-29), re-based on E1-E-08 per the research rather than on Epley's bias; O-12 open with this default; target-side ceiling separately reasoned | §6.2, §9.4, K-04, K-19 |
| **RL-1** "Under every formula" contradiction | **Corrected** (RC-18) | §9 lead |
| **RL-2** `139.33 / f(7) = 119.4` | **Corrected**: 112.97 (RC-19); the corrected fixture still supports the cap | §22 fixture 5×5 |
| **RL-3** Wathan column | **Superseded**: this document prints no Wathan column; the research's recomputed column (§7.2 there) is the reference | — |
| **RL-4** Mixed-RIR fixtures vs "uniform RIR" premise | **Corrected**: every fixture in §22 states its sets and RIR explicitly (RC-21) | §22 |
| **RL-5** Example E lists two values where four result | **Corrected** (RC-22) | §22 |
| **RL-6** Two deload code spellings | **Resolved**: `DELOAD_SESSION` (observation), `DELOAD_SESSIONS_EXCLUDED` (estimate), `DELOAD_SESSION_NO_SUGGESTION` (suggestion) — three levels, one concept, distinct carriers | §7.6, §8.4, §9.6 |
| **RL-7** "Sign-inverted load" unsupported and impossible | **Corrected**: inverted, unmodelled semantics; exclusion stands (RC-23) | §6.1 |
| **RL-8** `prescription-model.md` §7 mis-cited | **Corrected**: only `:159` is cited, for "no plate-math/equipment inventory modeling" | §6.1 |
| **RL-9** Citation drift (`:494-532`, `src/sw.ts`) | **Corrected**: `progression/service.ts:408-437` + `workingTargets.ts:39-45`; `src/app/sw.ts:253-269, 278-286` (RC-24) | §10.1, §14.3 |
| **RL-10** Endpoint ownership / archived posture unstated | **Resolved**: ownership rule, 404, archived served (O-15), acceptance criteria (RC-17) | §14.4, A-25 |
| **RL-11** Non-finite inputs return `ok` | **Resolved**: finite guard before the DTO (RC-28) | §9.5 step 5, A-18 |
| **RL-12** Epsilon can increase sub-cent values | **Stated**: "never increases" asserted for `round2` inputs only | §9.5 |
| **RL-13** B-2 re-opens OD-06 inside O-9 | **Resolved**: explicit amendment ADR (O-9); source ceiling unchanged at 12, so the ceiling half no longer re-opens anything | §17 O-9 |
| **RL-14** Pre-upgrade aggregate lacks the field | **Resolved**: optional field; card renders nothing; acceptance criterion | §10.3, A-23 |
| **RL-15** `bestSetE1rmKg` absurd provenance | **Resolved**: field dropped; `groups[]` shows excluded groups as excluded | §7.6 |

### 20.2 Review owner decisions O-1…O-16 and evaluation O-1…O-10

Consolidated in §17 with status **open** and a recommended default for each.

### 20.3 Research headline findings and §20 implications

| Research item | Disposition | Where |
| --- | --- | --- |
| 1. `RTF_MAX` 15 → 12, cited to E1-E-08 | **Adopted** | §6.2, K-04 |
| 2. `MAX_REP_DISTANCE` 8 → ~4, directional | **Adopted**: 4 load-down / 3 load-up; `FAR_REP_DISTANCE` removed | §9.2, K-16/K-17 |
| 3. Thresholds inside the noise band | **Adopted**: named noise constant; 20 / 30 / 30 / 20 %; `BEST_UNCONFIRMED_PCT` kept at 10 | §11, §16 |
| 4. Aggregator not set-count invariant | **Adopted**: first up to three sets per group | §7.4 |
| 5. O-7 split (tracker vs suggestion) | **Adopted** | §9.7 |
| §20-6 Top-set/back-off now, not at `perSet` | **Adopted**: max over plausible admitted groups with a flag (O-19) | §7.5 |
| §20-7 Relabel windows as freshness; calendar days | **Adopted** | §8.1–8.2 |
| §20-8 Cap applies to every tier; re-justify 1.10 as ≈ 1 SD | **Adopted** | §9.5 |
| §20-9 Display precision; band required | **Adopted** (O-18) | §8.5 |
| §20-10 Cap the floor discount | **Rejected** (X-12) with reason | §9.5 step 6 |
| §20-11 Lower or remove the session-spread flag | **Removed** | §7.6 |
| §20-12 `Ø-2` honesty ledger | **Adopted** | §13 V-27 |
| §20-13 Re-cite C-06 / C-07 | **Adopted** | §6.2 |
| §7.1 provenance ("worse than convention") | **Adopted** into row 20 wording | §13 V-25 |
| §8.3 lower bound is on the estimate | **Adopted** as a copy rule | §15.3 |
| §13.4 one value vs range | **Adopted**: value + required band | §9.5 step 8 |
| §15.9 no experience gradient in RIR error | **Adopted**: conservatism argument rests on the pooled direction only | §13 V-26 |
| §21 registry promotion candidates | **Owner decision** O-17 | §17 |
| §23 "direct tier is the cut line" | **Recorded** as an O-1 option | §4 |
| C-01…C-42 | Each reconciled in §16 | §16 |

---

## 21. Invariants and acceptance criteria (implementation-ready)

### 21.1 Invariants

- **I-1** Nothing produced by this feature is persisted server-side or enters the outbox. Because a suggestion is never shown while a recommendation is pending — and because the suppression gate and the frozen aggregate recommendation are read from the **same** bundle snapshot field (V-23) — logging a suggested load can enqueue only a `setLog` op. `SYNC_ENTITIES` and every op schema are byte-identical before and after.
- **I-2** The feature reads `set_logs`, `session_exercises`, `workout_sessions`, `exercises`, and — for the decision chain head's rep basis only (V-22) — the `chosen`/`inputs` of the latest accepted/modified decision. It never reads `recommendations` as strength evidence, never queries it to decide whether a recommendation is pending (V-23), and never writes it. Enforced by an import-graph test (§14.5).
- **I-3** `src/domain/progression/*` is behaviour-identical: no strategy, config, reason code, evaluation input, or `InputsSummary` field is added or changed; `HISTORY_DISPLAY_LIMIT` and `ENGINE_HISTORY_CAP` are untouched; the only edit is the additive `resolveCarryForwardCandidate` in `carryForward.ts`, with `resolveCarryForwardLoadKg` returning exactly what it returns today for every input.
- **I-4** Every DTO carries `algorithm {id, version, formula}`; any behaviour change bumps `version`.
- **I-5** Same inputs + same `asOfLocalDate` + same version ⇒ byte-identical output, for any input permutation.
- **I-6** `currentE1RM ≤ bestE1RM` whenever both exist; deload observations contribute to neither, nor to any suggestion basis; observations after `asOf` contribute to nothing.
- **I-7** `suggestStartingLoad` returns `none` when `todayIsDeload`, when any pending recommendation exists, when the carry-forward rep basis is within 1 of `T`, for ineligible exercises, for target RTF outside `[3, 15]`, when no candidate is within the directional rep-distance limits, and when the consistency gate fails — each provable in one unit test of the pure function.
- **I-8** Every emitted suggestion load is on the `loadStepKg` grid (floored), ≤ 1.10 × the heaviest admitted group load in the window, and in the direct tier ≤ the heaviest basis group load.
- **I-9** No reported RIR is altered, averaged into a decimal, inferred from a prescription, or weighted by any athlete attribute; missing RIR is a flagged lower bound on the estimate.
- **I-10** Every displayed value carries the "estimated" label and its band; no UI string presents an estimate as a tested max, a recommendation, or a research finding.
- **I-11** The prefill chain, `PrescriptionSnapshot`, `resolveImplicitDecision`, and `recommendationForDeload` are unchanged; **Use** writes to the weight input only.
- **I-12** A session's `e1rmKg` is invariant to any set logged after the third set of its governing group.
- **I-13** A group excluded from its observation — sub-modal, or supra-modal more than 20 % above the modal group's e1RM — never contributes to the session value or to any suggestion basis.
- **I-14** Every member of the reason-code enum declared in §15.4 is emitted by at least one fixture, and no code outside that enum is emitted anywhere.

### 21.2 Acceptance criteria

Tags: (Domain) fixtures, (Integration) PGlite, (Wire) contract, (UI) Chromium 390×844, (Boundary) import graph/grep, (A)/(B) release.

- **A-1** (Domain, A) `setE1rm(110, 5..8) = 128.33 / 132.00 / 135.67 / 139.33`; `setE1rm(95, 12) = 133.00`; `setE1rm(100, 1) = 100`.
- **A-2** (Domain, A) `95×12 @ RIR 1` (RTF 13) and `@ RIR 2` (RTF 14) are excluded with `HIGH_REP_SETS_EXCLUDED`; `@ RIR 0` is eligible with `EXTENDED_REP_RANGE`; `rir = 5` → `HIGH_RIR_SETS_EXCLUDED`; `rir = 4` eligible with `RIR_MODERATE_RANGE`; `weightKg = 0` → `ZERO_LOAD_SETS_EXCLUDED`; `isWarmup = true` → counted, not flagged.
- **A-3** (Domain, A) Session `110×5 RIR 3,3,2,2,1` → 139.33 whether 3 or 5 sets are logged (I-12); with RIR `2,2,2` → 135.67.
- **A-4** (Domain, A) Top set `140×3 @ RIR 1` + `3 × 110×8 @ RIR 1,1,0` → observation 158.67, `TOP_SET_GOVERNS`, `MIXED_LOADS_IN_SESSION`, two groups; `4 × 110×5 @ RIR 2` + `1100×5 @ RIR 2` → 135.67 with `IMPLAUSIBLE_SETS_EXCLUDED` (count 1); `110×5 ×4` + `11×5` → 135.67 with `SUB_MODAL_SETS_EXCLUDED`; `100/110/120 × 8 @ RIR 2` → 160.00 (heaviest tie-break).
- **A-5** (Domain, A) Two observations with equal `performedOn` and `startedAt` in swapped input order produce identical estimate and suggestion output.
- **A-6** (Domain, A) An observation dated after `asOf` affects neither `current`, `best`, `staleObservationCount`, nor any suggestion.
- **A-7** (Domain, A) Window and age fixtures are expressed in local dates: a session on `asOfLocalDate − 89` is in; `− 90` is out; the result does not depend on any instant.
- **A-8** (Domain, A) `[136,133,139,128]` → current 133; `[136,180]` → 136, `ESTIMATE_SPREAD_VERY_WIDE`, best 180 unconfirmed; `[136,133,180]` → 136, best 180 unconfirmed; `[130,132,13]` → 130 (asymmetry stated in the fixture name).
- **A-9** (Domain, B) With a fixed basis: (a) `rawLoadKg` strictly decreases as target RTF increases; (b) the emitted `loadKg` is non-increasing, and on basis A (139.33, direct cap 110, step 2.5) target RTF 4–8 all emit 110.0 while `rawLoadKg` runs 122.94, 119.43, 116.11, 112.97, 110.00, then RTF 9–12 emit 105.0, 102.5, 100.0, 97.5; (c) across `T` values the DTO's `tier` or `basisSessionIds` changes wherever the emitted load is non-monotone.
- **A-10** (Domain, B) `heavy 3×4@120 @ RIR 0` (day 290) + `light 3×2@60 @ RIR 0` (day 295): every target `T ∈ 1..6` → `none`, `OBSERVATIONS_DISAGREE`.
- **A-11** (Domain, B) Basis `3×12@95 @ RIR 0`, target 12 reps band 0–3 → `133 / f(15) = 88.67` → 87.5 (floor 2.5), `EXTENDED_TARGET_EFFORT`; band 0–2 → 90.68 → 90.0; the raw load never exceeds 95 (I-8).
- **A-12** (Domain, B) `todayIsDeload = true` → `none`, `DELOAD_SESSION_NO_SUGGESTION`, regardless of evidence.
- **A-13** (Domain, B) `repRange {8,12}` prescription, decision `chosen.reps = 11`, three sessions at 11 reps: `T = 11`, carry-forward rep basis 11 → `none`, `CARRY_FORWARD_REP_COMPATIBLE`; with `decisionChosen = null` and the same history, `T = 8` and the carry-forward rep basis is 11 → suggestion emitted (the gate is the prefill's rule, and the fixture proves which rule is in force).
- **A-14** (Integration, B) `buildTodayBundle` produces `carryForwardRepBasis` = the `repBasis` of the candidate returned by the shared `resolveCarryForwardCandidate` (mode of reps at the first work set's load of that session); null for a baseline chain head; the decision chain head yields `chosen.reps ?? schemeDefaultReps(inputs.prescribed.scheme)`. A unit test on `carryForward.ts` asserts `resolveCarryForwardLoadKg(c, b) === (resolveCarryForwardCandidate(c)?.firstWorkSetLoadKg ?? b)` over the existing carry-forward fixtures.
- **A-15** (Domain, B) Any pending recommendation → `none`, `PENDING_RECOMMENDATION_PRESENT`, even when rep-incompatible.
- **A-16** (Domain, B) Basis of three groups where one lacks RIR → basis reduced to the two RIR-complete groups, `MIXED_RIR_BASIS_REDUCED`, band max used; basis with no RIR anywhere → `TARGET_RIR_EFFORT_MATCHED`, target RTF = `T`.
- **A-17** (Domain, B) §22 fixtures reproduce exactly: 5×5 → 110.0 (`DIRECT_EVIDENCE_CAPS_LOAD`); 3×8 → 102.5 (nearby); 3×12 (band 0–2) → 90.0 (direct); single-source B → 5×5 `REP_DISTANCE_TOO_FAR`; single-source A → 3×12 `REP_DISTANCE_TOO_FAR`; `110×8 @ RIR 1` → 5 reps band 0–2 → 115.0 (far, low, `TRANSLATION_UPWARD_IN_LOAD`).
- **A-18** (Domain, B) A non-finite `e1rmKg` or `loadStepKg ≤ 0` degrades to `none` / exact-value rounding without a non-finite `loadKg` ever reaching the DTO.
- **A-19** (Domain, A+B) A reachability test asserts every member of the §15.4 reason-code enum appears in at least one fixture's output, and a completeness test asserts the enum, the copy map in `src/ui/strength/copy.ts`, and the §15.4 table have identical membership.
- **A-20** (Integration, A) Editing a historical set's weight or `isWarmup` through the sync path changes the next `GET /api/exercises/[id]/strength`; deleting a set removes or changes its group; no table other than `set_logs` (and `updated_at` on renumbered siblings) changes.
- **A-21** (Integration, A) Completing a session performs no read or write by the strength service (query log).
- **A-22** (UI, B) Tapping **Use** fills the weight input only; logging that set enqueues exactly one `setLog` op; the suggestion line is hidden after that set. (Integration) For every bundle entry, `startingSuggestion.status === "ok"` implies `pendingRecommendation === null` in the **same** entry, and the aggregate frozen at `startSession` carries both values from that one entry.
- **A-23** (UI, B) A cached bundle and a resumed aggregate lacking the new fields render and start a session without error (the Phase 5 L-4 class).
- **A-24** (Integration, B) `buildTodayBundle` issues exactly one observation query for all prescribed exercises (query count asserted), and its latency delta against the measured baseline is recorded in the implementation report.
- **A-25** (Integration, A) `GET /api/exercises/[id]/strength` returns 404 for another user's exercise, serves an archived one, rejects an unparsable `asOf`, and clamps a future `asOf` to now with the effective value echoed.
- **A-26** (Wire, A+B) `SYNC_ENTITIES`, all op schemas, and `MAX_OPS_PER_BATCH` are byte-identical to `7d6bc6c`; reconnect-idempotence and lost-response e2e suites pass unchanged.
- **A-27** (Boundary, A) `src/domain/strength/**` imports only itself and type-only `src/domain/schemes/**`; `src/domain/progression/**` does not import `src/domain/strength/**`; `src/server/strength/**` does not import `evaluateSession`/`loadProgression`/`repProgression`; grep of `src/` and `drizzle/` finds no column storing e1RM, suggestion, or confidence.
- **A-28** (UI, A) Every rendered estimate string contains "≈", "est.", and a band; the strings "PR", "personal record", bare "1RM", "recommend", "research shows", and "declin" do not occur in `src/ui/strength/**`.
- **A-29** (Negative control, A+B) `tests/unit/progressionMatrix.test.ts`, the `workingTargets`/`carryForward` suites, and the three `warmupSetClassification` suites pass **without modification**.
- **A-30** (Negative control, A) `strength_estimate = 'off'` on an exercise with rich history → `EXERCISE_ESTIMATE_DISABLED` everywhere; `equipment = 'bodyweight'` with `'auto'` → `EXERCISE_CATEGORY_UNSUPPORTED` (the switch cannot enable).
- **A-31** (Domain, B) Excluded groups are never candidates: a session `60×5, 80×5, 100×3` (unflagged) + `3 × 110×8` has sub-modal `60`, `80`, and `100` groups, all excluded; the `60×5` group is not a candidate at any tier. For a 5-rep target the session's **only** candidate is the admitted `110×8` group at the `far` (load-up, `d = 3`) tier, and `basisSessionIds` names the session only through that group — the emitted load derives from 110, never from 60. A session `4 × 110×5` + `1100×5` has an implausible `1100` group; for a 5-rep target the basis is the `110` group at `d = 0` and the emitted load is ≤ **110.0** (the direct-tier cap, §9.5 step 3 — not merely ≤ 121.0 from the global cap).
- **A-32** (Domain, B) Consistency gate: pools `[130, 132, 13]`, `[130, 13, 14]`, `[130, 132, 300]`, and `[130, 132, 13, 14]` (all as observation e1RMs in the consistency set) → `none`, `OBSERVATIONS_DISAGREE`; `[130, 131, 132, 13]` → continues with the 13 session absent from `basisSessionIds`, `OBSERVATION_OUTLIER_PRESENT`, confidence low; `[130, 131, 132]` → continues with no outlier code.

---

## 22. Worked fixtures (corrected and recomputed)

Fixture: one week contains session **A** (`5×5 @ 110 kg`, RIR `3, 3, 2, 2, 1`, Monday) and session **B** (`3×12 @ 95 kg`, RIR `2, 1, 0`, Thursday); barbell, `loadStepKg` 2.5, both completed, non-deload, in window, no pending recommendation, carry-forward from B (rep basis 12). Every RIR is stated; nothing is "assumed uniform" (review RL-4).

**Observations.** A: one group (110, 5 sets); first three set e1RMs `139.33, 139.33, 135.67` → **139.33**, `RIR_MODERATE_RANGE`. B: sets 1–2 are RTF 14 and 13 → `HIGH_REP_SETS_EXCLUDED` (2); one group (95, 1 set: RTF 12 → **133.00**), `EXTENDED_REP_RANGE`, `SINGLE_SET_GROUP`. Pool `[139.33, 133.00]` → current **133.00**, spread 4.8 %, best 139.33 (A), confirmed (133.00 ≥ 0.9 × 139.33). Display: "≈ 132.5 kg (likely 117.5–147.5) · medium · based on two sessions".

Under Epley the 12-rep session's *set-level* e1RM at equal RIR is higher than the 5-rep session's (RIR 0: 133.00 vs 128.33); Brzycki and Wathan agree, Lombardi and O'Conner reverse it. Neither wins: the pool takes the lower median.

**Targets** (band 0–2 unless stated; consistency set = {A, B}, spread 4.8 %, passes):

| Target | Candidates and distances | Tier / basis | Target RTF | Raw | Caps | Result | Codes / confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5×5 | A d = 0; B d = 7 load-up → not a candidate | direct / A | 7 | 139.33 / 1.2333 = **112.97** (review RC-19: not 119.4) | direct cap 110 | **110.0** | `SOURCE_DIRECT_SAME_REPS`, `TARGET_RIR_FROM_BAND_MAX`, `DIRECT_EVIDENCE_CAPS_LOAD`; medium (1 session, `RIR_MODERATE_RANGE`) |
| 3×8 | A d = 3 load-down → nearby; B d = 4 load-up → not a candidate | nearby / A | 10 | 139.33 / 1.3333 = 104.50 | pooled 133/1.3333 = 99.75 × 1.2 = 119.7, not binding; global 121, not binding | **102.5** | `SOURCE_NEARBY_REPS_TRANSLATED`, `TARGET_RIR_FROM_BAND_MAX`, `ROUNDED_DOWN_TO_LOAD_STEP`; medium |
| 3×12 | B d = 0; A d = 7 load-down → not a candidate | direct / B | 14 (extended) | 133.00 / 1.4667 = 90.68 | direct cap 95, not binding | **90.0** | `SOURCE_DIRECT_SAME_REPS`, `EXTENDED_TARGET_EFFORT`, `ROUNDED_DOWN_TO_LOAD_STEP`; medium (`EXTENDED_REP_RANGE`, `SINGLE_SET_GROUP`) — the evaluation returned 95 here and over-prescribed relative to the requested reserve |
| 3×12, sources without RIR (A: reps 5 ×5; B: reps 12 ×3, all RTF 12 eligible) | as above | direct / B (group 95, 3 sets → 133.00) | 12 (effort-matched) | 133.00 / 1.4 = 95.00 | direct cap 95 | **95.0** | `TARGET_RIR_EFFORT_MATCHED`, `RIR_MISSING_LOWER_BOUND`; medium |
| 3×8, A without RIR (`128.33`) | A d = 3 | nearby / A | 8 (effort-matched) | 128.33 / 1.2667 = 101.31 | — | **100.0** | `TARGET_RIR_EFFORT_MATCHED`, `RIR_MISSING_LOWER_BOUND`; medium |
| 3×9 | A d = 4 load-down → far; B d = 3 load-up → far | far / A and B (same tier; both admitted) | 11 | A: 139.33/1.3667 = 101.95; B: 133.00/1.3667 = 97.32 → lower median of two = **97.32** | pooled 133/1.3667 = 97.32, equal, not binding; global 121, not binding | floor(97.32, 2.5) = **95.0** | `SOURCE_FAR_REPS_TRANSLATED`, `TRANSLATION_UPWARD_IN_LOAD` (B), `ROUNDED_DOWN_TO_LOAD_STEP`; **low** |

**Single-source variants.** Only B: target 5×5 → d = 7 load-up → **`REP_DISTANCE_TOO_FAR`** (the evaluation emitted 102.5 at low confidence; the research §19 accepts this refusal as the point). Only A: target 3×12 → d = 7 load-down → **`REP_DISTANCE_TOO_FAR`**.

**Load-up at the limit.** Basis `3 × 110×8 @ RIR 1` (143.00), target 5 reps band 0–2 (RTF 7), d = 3 load-up → far tier: 143.00 / 1.2333 = 115.95; global cap 121 not binding; floor → **115.0**, `TRANSLATION_UPWARD_IN_LOAD`, **low**. Across the five conventions the same translation gives Epley 115.95, Brzycki 117.86, Lombardi 112.80, O'Conner 114.68, Wathan 116.40 — a 4.4 % spread, every value inside the band shown (`[102.5, 130.0]`).

**Refusal.** `3×4 @ 120 RIR 0` (136.00) five days before `3×2 @ 60 RIR 0` (64.00): pool spread 112.5 % → every target `none`, `OBSERVATIONS_DISAGREE`. The evaluation's design returned 60 kg for T = 3 and 120 kg for T = 4 from the same data.

**Set-count invariance.** A logged as 3 sets → 139.33; as 5 sets → 139.33 (evaluation: 139.33 vs 135.67).

**Top set.** `140×3 @ RIR 1` + `3 × 110×8 @ RIR 1,1,0` → 158.67, `TOP_SET_GOVERNS` (evaluation: 143.00). A later 3-rep target finds the 140 kg group as direct evidence.

**PI-001 cases.** `8 kg × 90` alone → RTF 90 → no observation (`HIGH_REP_SETS_EXCLUDED` 1, `sessionsWithoutEligibleSets` 1). `1100 × 5` among four `110 × 5` → `IMPLAUSIBLE_SETS_EXCLUDED`, observation 135.67. `1100 × 5` alone → observation 1356.67, best "unconfirmed", visibly absurd, editable; no `bestSetE1rmKg` line exists to double the absurdity. `11 × 5` among `110 × 5` → `SUB_MODAL_SETS_EXCLUDED`.

---

## 23. Corrections to the evaluation carried into this revision

Each was a wrong or unsupported statement in the evaluation; none is repeated here.

1. "Under every formula the 12-rep session implies the higher e1RM" → under Epley, Brzycki, Wathan; Lombardi and O'Conner reverse it (RC-18).
2. `139.33 / f(7) = 119.4` → 112.97 (RC-19).
3. The Wathan multiplier column had five wrong rows → not reprinted; the research's column is the reference (RC-20).
4. `95/110 = 0.860` → 0.8636 (research §7.2).
5. §7.5 example E lists two set e1RMs → four (RC-22).
6. §12.5 mixed the uniform-RIR premise with mixed-RIR sessions → every fixture states its RIR (RC-21).
7. "Assisted Pull-Up … sign-inverted load" → inverted, unmodelled semantics; a negative load is impossible (RC-23).
8. `prescription-model.md` §7 cited for plate-loaded/selectorized/tare wording it does not contain → `:159` only (RC-23).
9. `progression/service.ts:494-532` for decision → carry-forward → `:408-437` + `workingTargets.ts:39-45`; `src/sw.ts` → `src/app/sw.ts` (RC-24).
10. ADR-007 mechanism 3 as the precedent for reinterpreting `equipment` → an analogy for `loadStepKg` rounding only; `equipment` is an eligibility gate (RC-25).
11. "The estimator defends itself structurally (modal-load rule)" against unflagged ramps → defence in depth only; F-1 fixed separately (RC-4).
12. "`T = schemeDefaultReps` — the same rule the prefill uses" → the prefill's rule is `decisionChosen?.reps ?? schemeDefaultReps` (RC-2).
13. "Never a fact / nothing enters the outbox" while showing the card beside a pending recommendation → suppression on any pending recommendation (RC-1).
14. "Set count feeds confidence, not the value" → false under the all-sets lower median; true under the first-three rule (research §10.4).
15. "The mildest high-rep growth … the safest shape for the extended band" → deleted (RM-13, research §15.4).
16. "RIR 3–4 degraded (EVIDENCE-014)" and "RIR ≥ 5 excluded (B8)" → conservative policies; the first must not cite EVIDENCE-014; the second departs from row 5 (RM-1).
17. The lower median presented as outlier-robust without qualification → robust upward only (RC-26).
18. The 1100 kg fixture omitted its flags and its 1356.67 kg provenance → provenance field dropped; flags stated (RC-27).
19. "The bundle already runs one history query per prescribed exercise" → two, in a sequential loop (RM-8).
20. `prescription` "the 90-day expiry … detraining" framing (R-5, §8) → data freshness (research §11).
21. Every "binding" label → recommendation (§1.1).

---

## 24. Verification guidance and working-tree impact

**What the final architecture confirmation should check** (design-level; no code exists yet). Items 1–7 are the first verification's checklist and remain in force; item 8 covers the first correction pass; item 9 covers the second:

1. Every review finding in §20.1 has a disposition that the corresponding section actually delivers — in particular RH-1 (§10.2), RH-2 (§10.1), RH-3 (§9.3–9.5), RM-4 (§9.6 order), RM-7 (§10.1 table), RM-9 (`todayIsDeload` input).
2. Every constant in §16 matches its use in §6–§11, and every threshold is expressed as the stated multiple of `NOISE_SD_PCT`.
3. The §22 fixtures reproduce from the §5–§9 rules alone (an independent reimplementation, as the review did for the evaluation).
4. No rule tagged **[E*]** is cited as evidence anywhere in §15's copy rules or in the row-20 sketch of §18 step 3.
5. The refusal list in §9.6 is complete against every `none` branch implied by §6–§10.
6. Nothing in §3 re-specifies or depends on the internals of the F-1 remediation beyond `isWarmup` being UI-writable.
7. §17's recommended defaults are the ones the rest of the document is written to, and the alternatives are stated where a different choice would change the design.
8. Each §25 correction closes the verification finding it names: V-14 admits only admitted groups and I-13/A-31 cover both exclusion kinds (VH-1); §12/A-9 state strict decrease for `rawLoadKg` and non-increase for `loadKg` with the plateau fixture (VH-2); the §9.6 gate refuses every n = 3 inconsistency and the `[130, 13, 14]` case, and A-32 reproduces (VM-1); V-22 consumes `resolveCarryForwardCandidate` and I-3/V-2 are consistent with that one additive refactor (VM-2); V-23/I-1/A-22 bind the gate to the bundle's `pendingRecommendation` (VM-3); the pre-toggle transitional consequence appears in V-22 and §18 step 4(c) (VM-4); §15.4 declares the enum every code in this document belongs to (VL-4); and the editorial items VL-1, VL-2, VL-3, VL-5, VL-6, and the V-17 dead branch read as the verification specified.
9. Each second-pass correction is wording only and reads as the second verification specified: A-31 distinguishes the excluded `60/80/100` groups from the session's admitted `110×8` `far`-tier candidate and asserts the direct-tier bound of 110.0 (V2-M-1, V2-L-1); V-19 defines `consistencySet` over every session contributing any candidate group and uses "candidate set" consistently (V2-M-2); I-2 licenses the decision read for the chain head's rep basis only (V2-L-2); §9.6 describes the high-outlier mechanism as leaving `currentE1RM` unchanged (V2-L-3). No algorithm, rule, threshold, invariant, boundary, or owner decision differs from the version the second verification reproduced.

**Working-tree impact.** Created (2026-09-05): `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` (this file), then updated in place by the two correction passes recorded in §25. Nothing else was created, modified, staged, formatted, reverted, or deleted in any pass. The three input reports and both verification reports are untouched. The pre-existing and concurrent uncommitted changes — `CLAUDE.md`, `HANDOFF.md` (deleted), `docs/input/product-ideas.md`, the F-1 remediation files (`src/ui/workout/ExerciseCard.tsx`, `src/ui/history/HistoryDetail.tsx`, `tests/e2e/warmupWorkout.spec.ts`, `tests/unit|integration|e2e/warmupSetClassification*`), `docs/reviews/warmup-set-classification-remediation.md`, `docs/reviews/repository-agent-workflow-*.md`, `docs/reviews/warmup-routines-evidence-research.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md` — are exactly as found. A scratch arithmetic script (`fixtures.mjs`) used to recompute every number in §7, §9, §11, and §22 lived in the session scratchpad outside the repository. No database was started or contacted; production was not accessed; nothing was committed, pushed, or deployed.

---

## 25. Correction log (2026-09-05)

Applied from §9 of `docs/reviews/estimated-1rm-load-translation-architecture-revision-verification.md`. Nothing listed there under "Unchanged and correct" was revisited; no owner decision was taken; no production code was written; neither review report was modified.

| Finding | Change | Where |
| --- | --- | --- |
| **VH-1** | V-14 restricted to **admitted** load groups; "Admitted group" added to §5; I-13 widened to sub-modal exclusion and to "any suggestion basis"; fixture A-31 added | §5, §9.1, I-13, A-31 |
| **VH-2** | §12 restated: `rawLoadKg` strictly decreasing, emitted `loadKg` non-increasing with cap/floor plateaus, non-monotone steps disclosed; A-9 restated with the RTF 4–8 plateau fixture | §12, A-9 |
| **VM-1** | Trim-relative-to-lower-median rule replaced by a **unique consistent majority of ≥ 3** rule that refuses whenever the observations cannot distinguish one valid value from two mutually consistent errors; every n = 3 inconsistency now refuses; worked table and A-32 added; §7.7 extended; §11 row, K-22, and the RM-4 disposition aligned | §7.7, §9.6, §11, §16 K-22, §20.1, A-32 |
| **VM-2** | V-22 consumes a new shared `resolveCarryForwardCandidate` in `carryForward.ts` (additive; `resolveCarryForwardLoadKg` unchanged in signature and result); `CarryForwardCandidate` gains optional `sessionId`/`repBasis`; V-2, I-3, §10.4, §14.5, A-14, and the RM-7 disposition aligned | §4 V-2, §10.1, §10.4, §14.5, I-3, A-14, §20.1 |
| **VM-3** | V-23 states the gate input is the bundle's `pendingRecommendation` (post-`recommendationForDeload`), the same value the aggregate freezes; the strength service may not decide pendingness from its own query; I-1, §14.5, A-22, and the RH-1 disposition aligned | §10.2, §14.5, I-1, A-22, §20.1 |
| **VM-4** | Pre-toggle transitional consequence for the suppression gate stated in V-22; §18 step 4(c) requires classifying replay firings before drawing conclusions | §10.1, §18 |
| **VL-4** | §15.4 declares the 48-member reason-code enum by level with emitters and phrasing; I-14 and A-19 now reference it; `MIXED_LOADS` → `MIXED_LOADS_IN_SESSION` in §16; five evaluation-era codes named as non-members | §15.4, §16, I-14, A-19 |
| **VL-1** | Load-up parenthetical corrected: Epley 115.95, Brzycki 117.86, Lombardi 112.80, O'Conner 114.68, Wathan 116.40; 4.4 % spread | §22 |
| **VL-2** | Band brackets the raw translation, not the floored load; coarse-grid example stated in §9.5 step 8 and as a copy rule | §9.5, §15.3 |
| **VL-3** | Tags added: V-12 [P]/[R], V-14 [P], V-22 [R] | §8.3, §9.1, §10.1 |
| **VL-5** | Rationale for the single-session confidence asymmetry (low for the estimate, medium for a suggestion) stated | §11 |
| **VL-6** | Sub-modal group with a higher e1RM is discarded by load, not by implied e1RM — stated with the `100×12` example | §7.3 |
| V-17 dead branch | "if fewer than one remains" fallback deleted; the Mixed row's precondition stated | §9.4 |
| Header, §1, §24 | Correction-pass line in the header; verdict updated; verification checklist item 8; working-tree impact updated | header, §1, §24 |

### 25.1 Second correction pass (2026-09-05)

Applied from §5 of `docs/reviews/estimated-1rm-load-translation-architecture-revision-verification-2.md`. Wording and precision only: no algorithm, rule, threshold, invariant, boundary, or owner decision was altered; neither verification report was modified.

| Finding | Change | Where |
| --- | --- | --- |
| **V2-M-1** | A-31's first clause corrected: the excluded `60/80/100` groups are not candidates at any tier, but the session's admitted `110×8` group **is** a `far` (load-up, `d = 3`) candidate for a 5-rep target and `basisSessionIds` names the session only through it; the emitted load derives from 110, never from 60 | A-31 |
| **V2-M-2** | V-19 now defines the **candidate set** (every admitted candidate group, any tier) and `consistencySet` = `pool ∪ the sessions contributing any candidate group (§9.1)`; "candidate set" used consistently; "basis" reserved for the tier-selected groups; the worked consequence (a `far`-only session can turn a suggestion into a refusal) stated as intended | §9.6 |
| **V2-L-1** | A-31's second clause tightened from "≤ 110 × 1.10" to "≤ 110.0" (the direct-tier cap, not the global cap) | A-31 |
| **V2-L-2** | I-2 reworded: the decision read is "for the decision chain head's rep basis only (V-22)" and never to decide pendingness (V-23) | I-2 |
| **V2-L-3** | §9.6 residual paragraph corrected: a high outlier leaves `currentE1RM` unchanged (lower median robust to one high value at n = 3; minimum at n = 2), so the cross-check is unaffected rather than "non-binding"; the safety conclusion is unchanged | §9.6 |
| Header, §1, §24 | Second-pass line in the header; verdict updated; confirmation checklist item 9; working-tree impact updated | header, §1, §24 |

### 25.2 Owner acceptance and documentation integration (2026-09-05)

No rule, threshold, invariant, boundary, fixture, or acceptance criterion changed. Every edit below is a status, tag, or cross-reference change; the integration report is `docs/reviews/estimated-1rm-owner-decision-integration.md`.

| Change | Where |
| --- | --- |
| Owner decision addendum recording acceptance of O-1…O-20 exactly as recommended; rules declared binding; two-release structure and the direct-tier fallback cut line restated | after §1.1 |
| §1 status paragraph: gates discharged except the external F-1 gate; §17 heading and preamble: all twenty accepted; §18 steps 2–3 marked done | §1, §17, §18 |
| `[E*]` → `[E]` **only** where a promoted registry item supports the rule: RTF ceiling (EVIDENCE-033/036), short-set accuracy in the tie rule (EVIDENCE-036), band calibration (EVIDENCE-034/035/036), direct-evidence exemption from the pooled check (EVIDENCE-032), freshness-not-physiology (EVIDENCE-037), formula tie-break (EVIDENCE-036), pooled RIR under-prediction and the training-status null (EVIDENCE-033), K-03 magnitude, K-04, K-05, K-13, K-24's need | §6.2, §7.2, §8.2, §8.5, §9.5, §13, §16 |
| `[E*]` retained, marked "not promoted": everything resting on Reynolds 2006 (E1-E-05), Senna 2011 (E1-E-17), or the rejected preprint (E1-E-20) — set-order fatigue (§7.1, V-8, V-9, K-08, K-27, K-28), the equipment-specific suggestion cap (V-20, K-36), the bodyweight/assisted/timed exclusions' external corroboration (V-3, K-37) | §6.1, §7, §9.7, §16 |
| §2 legend row for `[E*]` records the promotion mapping and which sources remain unpromoted; §16 citation-discipline note lists the registry ids now citable | §2, §16 |
| V-27 cross-references GAP-11/GAP-12; V-26 cites EVIDENCE-033 | §13 |
| Verdict lines updated from "ready for final architecture confirmation" to the accepted status | §1, end |

### 25.3 Governance correction — provisional registry status (2026-09-06)

Applied from `docs/reviews/estimated-1rm-owner-decision-integration-verification.md` G-1…G-4. **No accepted owner decision, rule, algorithm, threshold, invariant, boundary, fixture, acceptance criterion, or implementation scope changed.** The correction is to evidence *status* and its bookkeeping only.

| Change | Where |
| --- | --- |
| Every `[E]` tag derived on 2026-09-05 from EVIDENCE-032…037 reverted to `[E*]` with the marker "(provisional)": the RTF ceiling row, the heaviest-load tie rule, V-11, V-13, §9.5 step 2, V-24, V-26, K-03, K-04, K-05, K-13, K-24 | §6.2, §7.2, §8.2, §8.5, §9.5, §13, §16 |
| §2 legend: `[E*]` redefined to cover provisional registry entries as well as unregistered sources; the 2026-09-05 mapping retained with the reverted status; the closure condition named | §2 |
| Addendum O-17 bullet: "executed in substance; status corrected"; full promotion and any re-upgrade wait on the registry's closure condition | addendum |
| §16 citation-discipline note: provisional ids citable only with the marker | §16 |
| V-11: EVIDENCE-037's maintenance-dose figures declared narrative context, cited for nothing | §8.2 |

---

# `ACCEPTED — BINDING FOR IMPLEMENTATION (owner addendum 2026-09-05; F-1 gate discharged; evidence items EVIDENCE-032…037 provisional pending intake)`
