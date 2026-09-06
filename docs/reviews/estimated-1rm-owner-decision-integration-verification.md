# Estimated 1RM — Owner Decision Integration: Independent Verification

Date: 2026-09-05
Role: independent verification of `docs/reviews/estimated-1rm-owner-decision-integration.md` (below, **the integration report**) **and of the repository changes it made**, against the fully verified architecture revision and the owner's acceptance of O-1…O-20. Every claim was checked against the files themselves and against the primary-source record in `docs/reviews/estimated-1rm-evidence-research.md` (below, **the research**), not against the integration report's own account. Verification only — nothing was remediated, no code was written, no owner question was decided, nothing was committed, pushed, or deployed; no database was contacted.
Scope of change: **this file only.** See §9.

---

## 1. Verdict

# `VERIFIED — WITH ONE GOVERNANCE QUALIFICATION`

**All seven confirmation points pass.** The twenty decisions are recorded exactly as §17 recommends and made binding by a dated addendum with a named repository precedent; no rule, constant, invariant, fixture, or acceptance criterion moved. The two-release structure and the direct-tier fallback survive intact and identically in three places. EVIDENCE-032…037 are **substantively accurate**: I re-checked every figure in all six items against the primary sources as retrieved in the research, and they match — including the three corrections that research made to the architecture review's citations (percentage error vs constant error, the ≤ 10-RTF subsample sizes, and the untrained-novice-women population), all of which survive into EVIDENCE-036's claim sentence. The rejected preprint is promoted nowhere and appears in `docs/evidence/` and `docs/architecture/` **only** in statements refusing it. `[E*]` → `[E]` upgrades were made only where a promoted item genuinely carries the rule, with the constants correctly split so that `[E]` never attaches to a number. ADR-011's amendment table matches O-9 and the revision's K-04/K-19; OD-06 has left the open table with a dated Notes entry; OD-04 remains open in the table and in the ADR. Only documentation changed — no file under `src/`, `drizzle/`, or `tests/` was touched, and the pre-existing working-tree changes are exactly as found.

**The qualification is about form, not content.** The task asked whether registry promotion is valid without locally normalized notes or primary PDFs. Measured against the repository's own written rules — not against the "Verification pass 3" label — the answer is:

> **EVIDENCE-032…037 are valid as *provisional* registry entries and are not yet a completed promotion.** They meet none of the four intake conditions the repository states for registry membership, and the repository has **no provisional tier** in which to hold them — so entries that have not been through the corpus pipeline are, at the point a design document cites them, indistinguishable from entries that have.

This is **not** an unjustified evidence upgrade. Every claim is true to its source, confidence is capped by retrieval status inside each item, contradicting and unpromoted sources are named, and the strongest possible escalation — user-facing "research shows" — is blocked outright by a copy rule that predates this pass and is enforced by `A-28`. But the promotion must not be recorded as finished. Four findings follow (§7); two are medium, two are low; **none is remediated here**, per instruction.

---

## 2. The evidentiary question, answered from the repository's rules

### 2.1 What the repository actually requires

Four written rules bear on registry intake. None is satisfied by this pass.

| # | Rule, verbatim or near | Where | Pass 3 |
| --- | --- | --- | --- |
| 1 | "This registry synthesizes the **14 normalized research notes** in `docs/research-notes/` by training concept" | `evidence-registry-reviewed.md:3` | ✗ six items synthesized from no note |
| 2 | "This directory contains one normalized evidence note **per paper in `docs/research/`** … so that downstream synthesis (`docs/evidence/`) can be built without re-reading the source PDFs" | `docs/research-notes/README.md:3` | ✗ no PDFs in `docs/research/`, no notes |
| 3 | "all four new papers were **read directly from source PDF (not reconstructed from any intermediate summary)**" — the standard pass 2 set for incremental additions | registry, Verification pass 2 | ✗ reconstructed from an intermediate summary |
| 4 | "**Corpus updates flow one way.** New papers → registry → boundaries/gaps revision → this map → design change." | `evidence-to-design.md:53` (§3 rule 4) | ✗ inverted — see G-3 |

Pass 3 states three of these departures plainly and does not state the fourth. The disclosure is genuinely good: it names the provenance of record, caps confidence per item, lists the twelve other sources it declined, and records the follow-up owed. It is the *status conferred*, not the honesty, that is the problem.

### 2.2 Why "provisional" is the right word, and why the repository cannot say it

`grep -rn "provisional" docs/evidence/ docs/architecture/` returns **nothing**. There is no provisional status, no `Status` value other than "Processed" in the notes inventory, and no marker on an `EVIDENCE-nnn` id. Meanwhile `evidence-to-design.md` §1 defines the top tier as "**Directly backed by registry entries**", and §3 rule 4 makes a registry id the *only* thing a design document may cite. So assigning the id **is** the upgrade: from the moment `EVIDENCE-032` exists, row 20, A13–A16, and B12–B13 may lean on it, and nothing at the point of use signals that it entered on a weaker footing than EVIDENCE-001…031.

That is the distinction the task asked for:

- **A valid provisional entry** would be one flagged at the point of use — a status marker on the id, a row in the notes inventory recording the source as unprocessed, and corpus-scope statements that admit it.
- **An unjustified evidence upgrade** would be one whose claims outrun their sources.

This pass produced neither cleanly. Its *content* is provisional-grade and honest; its *form* is full-status. The gap is procedural, cheap to close, and must not be marked done.

### 2.3 What bounds the risk

Three things, all verified, keep this from being serious:

1. **Confidence is capped inside each item** by retrieval status, and each "Important uncertainty" and "Unsafe inference" field is strong. EVIDENCE-037's three abstract-only sources are folded into one Moderate item rather than three.
2. **The copy rules block escalation.** `"research shows"`, `"accurate"`, `"precise"`, and `"scientifically"` are in the revision's §15.2 never-appear list for **all** strength copy — not only `[E*]` copy — and `A-28` asserts the string does not occur in `src/ui/strength/**`. So an `[E]` upgrade cannot reach a user as a stronger claim.
3. **Every number stays a convention.** Row 20's "Convention (every number)" clause and the `[E]`/`[P]` split in §16 keep `[E]` attached to *what exists*, never to a value — which is `evidence-to-design.md` §1's own rule.

---

## 3. Independent validation of EVIDENCE-032…037 against the primary sources

Checked figure by figure against the research's §6.1 source table and §7–§15, which record what was retrieved in full text and what was abstract-only.

| Item | Source | Checked | Result |
| --- | --- | --- | --- |
| **EVIDENCE-032** | Nuzzo 2024 (full text) | 952 / 7,289 / 452 / 269 and 898 / 6,970 / 425; SD 2.51 @ 80 %, 4.36 @ 60 %; leg press 13.1 [9.8–17.5] and 19.0 [14.2–25.5] vs bench 8.8 [7.7–10.1] and 14.1 [12.4–16.1]; the moderator sentence verbatim; spline preferred; 66 % male / 92 % < 59 / 60 % trained | **Accurate.** The derived "≈ 11 points exercise effect, an order of magnitude larger than moving across 70–90 % 1RM" matches the research's conversion. One trivial rounding: the derived scatter is stated "±7–9 points" where the computed values are ±6.7 and ±8.7 |
| **EVIDENCE-033** | Halperin 2022 (published abstract + full preprint) | 13 publications / 12 studies / n = 414 / 262 effect sizes; 0.95 reps [0.17, 1.73]; I² = 97.9 %; β 0.06 [0.04, 0.09] ≤ 12 vs β 0.47 [0.44, 0.49] > 12; proximity β −0.025 [−0.05, 0.0014]; training status β −0.006 [−0.02, 0.007]; between-participant SD 1.45 [0.99–2.12] | **Accurate.** The Steele 2017 qualification correctly records the pre-set-prediction and load–experience confounds |
| **EVIDENCE-034** | Grgic 2020 (full text) | 32 studies, n = 1,595, 1–10 days; median ICC 0.97, 92 % ≥ 0.90; median CV 4.2 %, range 0.5–12.1 %; stability across sex/age/body region/joint count/experience | **Accurate** |
| **EVIDENCE-035** | Greig 2023 (full text) | 26 / 641 and 20 / 434; SEE 9.8 % [7.4–12.2]; over-estimate 3.7 % [0.5–6.9]; the "direct assessment wherever possible" quotation | **Accurate.** Correctly labels the load–velocity → repetition transfer as "of magnitude, not of mechanism" |
| **EVIDENCE-036** | Mayhew 2008 (full text, 8 pp.) | n = 103 **untrained-to-novice college women**, 19.1 ± 1.2, free-weight bench press; **percentage** error +5.3 ± 11.0 → +0.5 ± 10.2 (n = 46) pre-training and +6.5 ± 12.5 → −0.7 ± 10.6 (n = 45) post; 57–67 % within ±2.3 kg on a 28–36 kg lift; `%1RM = 90.575·e^(−0.0152·reps)`, r² = 0.59; Brzycki ICC 0.24, +26.7 ± 101.7 % | **Accurate, and carries every correction.** The population sits in the claim sentence, the error is labelled *percentage* not *constant*, and both subsample sizes are given. The "Contradicted/qualified by" field records that Epley's 11–15-rep bias is roughly flat against EVIDENCE-032 and rising against this study's own curve — the disagreement, not a resolution |
| **EVIDENCE-037** | Bosquet 2013 / Encarnação 2022 / Spiering 2021 (**abstracts only**) | SMD −0.46 [−0.54, −0.37], 103 studies, continuous dose-response, larger > 65 and inactive; 20 trials, retention 16–24 wk, convergence 32–48 wk, "two trials in its strength meta-analysis"; 4–8 wk and up to 32 wk minimal dose | **Accurate**, retrieval status disclosed, confidence capped. See G-4 for the narrative-review issue |

**No claim outruns its source.** No figure is wrong. This is the strongest part of the pass.

---

## 4. Confirmation of the seven requested points

| # | Point | Result |
| --- | --- | --- |
| 1 | All 20 decisions recorded exactly as recommended, binding, no semantic drift | **Pass.** The addendum names all twenty, restates the eight with a consequence, and accepts them "exactly as recommended in §17". §17's preamble now reads "all twenty accepted exactly as recommended" and the table is retained as the record of what was declined. Spot-checked against §17's recommended defaults for O-1, O-9, O-11, O-12, O-16, O-19, O-20 — no drift. §17's recommended-default column is unchanged. The binding scope is enumerated (every `V-n`, `I-n`, `K-n` and its value, every `A-n`, the §9.6 refusal list, §14 boundaries, §15 copy rules, §15.4 enum, §19 lists), with the warm-up evaluation's 2026-09-01 addendum cited as the repository's own precedent for how an evaluation becomes binding |
| 2 | Two-release structure and direct-tier fallback preserved | **Pass.** Identical in three places — the addendum's O-1, ADR-011 §Decision line 26, and row 20's closing clause. All three say the direct-tier-only version is a **fallback cut line** "**not** the selected scope". Release B's gates (one block of Release A use, plus the §18 step 4(c) fire-rate prototype) are carried in both the addendum and the ADR |
| 3 | EVIDENCE-032…037 promoted accurately and consistently across registry, boundaries, gaps, and row 20 | **Pass on accuracy and consistency** (§3 above). Boundaries A13–A16 and B12–B13 cite only registry ids; **A15 explicitly qualifies A10** rather than silently contradicting it; A16 flags the abstract-only basis. GAP-07 is "Partially resolved" with the sex half explicitly left open; GAP-11 and GAP-12 are framed as search results and are marked architecture-blocking for *claims*. Row 20's evidence column contains only registry ids, and its not-justified column carries both recorded departures (row 5; the EVIDENCE-014 citation ban) and both new gaps. `evidence-to-design.md`'s header was updated to EVIDENCE-001…037 / A1–A16 / B1–B13 / GAP-01…12. **See G-1/G-2 for the status-and-scope qualification** |
| 4 | No unsupported source promoted, especially E1-E-20 | **Pass.** The preprint appears in `docs/evidence/` twice and in `docs/architecture/` once — every occurrence is a refusal ("deliberately **not** promoted… may be cited by no design document"). It is nowhere in the registry's item bodies, boundaries, gaps, or row 20's evidence column; row 20 names it only under "Not in the registry, used only as unregistered structural argument". The twelve other unpromoted sources are named, and where one qualifies a promoted item it is marked *not in this registry* inside that item |
| 5 | `[E*]` upgraded only where justified | **Pass.** Verified in the constants table: K-03 `[E]` magnitude / `[P]` value, K-04 `[E]`/`[R]`, K-05 `[E]`, K-13 `[E]`/`[A]`, K-24 `[P]` calibrated + `[E]` for the *need* — each split so `[E]` never attaches to a number, per `evidence-to-design.md` §1. Every retention verified too: **K-36 (the equipment suggestion cap) is still `[E*]`** — the one resting on the rejected preprint — as are the set-order-fatigue rules (Senna 2011) and the R²-decay corroboration (Reynolds 2006). §2's legend row records the full promotion mapping |
| 6 | ADR-011 amends OD-06; references consistent; OD-04 open | **Pass.** The amendment table's seven rows match O-9 and the revision's K-04/K-19: formula kept with `f(1) = 1`; input `reps + reported RIR`; "reps ≤ 12 for display" → source admissibility ceiling `RTF ≤ 12` (number unchanged, role changed); new target ceiling 15; required ±10 % band; versioned algorithm id; tracker ahead of Phase 9. All four OD-06 references outside `docs/reviews/` are consistent: `open-decisions.md` (row removed, dated Notes entry), `implementation-plan.md:223` ("OD-06 was resolved by amendment in ADR-011"), `architecture-plan.md` (index extended to ADR-011), and the ADR itself. **OD-04 remains in the open table**, with an added sentence noting the inline SVG sparkline does not decide it — and the ADR says the same |
| 7 | No implementation code or unrelated files changed | **Pass.** `git status` shows changes only under `docs/architecture/`, `docs/evidence/`, and `docs/reviews/` — exactly the nine files §2 of the integration report claims. Nothing under `src/`, `drizzle/`, or `tests/`. `CLAUDE.md`, `HANDOFF.md` (deleted), and `docs/input/product-ideas.md` carry only the pre-existing diffs present at the start of this lineage. The F-1 remediation left the tree by another session's commits (`d9b9760`, `c52b016`), not by this pass — and `d9b9760` contains three warm-up verification reports plus the source and test files, so the revision's external gate `V-0` is genuinely discharged |

---

## 5. Findings

### G-1 (Medium) — provisional entries recorded at full status; the repository has no way to say "provisional"

EVIDENCE-032…037 satisfy none of the four intake conditions in §2.1, and `grep provisional` across `docs/evidence/` and `docs/architecture/` returns nothing. The only trace of their weaker footing is the "Verification pass 3" narrative at the **end** of the registry and the per-item "No normalized research note yet" line inside each `Supported by` field. Neither is visible at the point of use: a future reader of row 20, A13–A16, or B12–B13 sees `EVIDENCE-032` and, under `evidence-to-design.md` §1, is entitled to treat it as "Directly backed by registry entries" — the same standing as EVIDENCE-001…031, which were read from PDFs at cited page locations.

The content does not justify a downgrade; the *bookkeeping* does not yet justify full status. Recorded, not remediated.

### G-2 (Medium) — three corpus-scope statements now misstate the corpus, two of them in files this pass edited

| Statement | File | Edited by this pass? | Status |
| --- | --- | --- | --- |
| "synthesizes the **14 normalized research notes** in `docs/research-notes/`" | `evidence-registry-reviewed.md:3` | **Yes** (§13 and pass 3 added) | Now false — six items are synthesized from no note |
| "the current **14-paper corpus** (`docs/research-notes/`)" | `research-gaps.md:3` | **Yes** (GAP-07/11/12 changed) | Now false — GAP-11/12 derive from sources outside that corpus |
| "**14/14 papers processed**", inventory table, `Status` column | `docs/research-notes/README.md` | **No — untouched** | No row for any of the six sources; no record of the follow-up owed |

The pass updated `evidence-to-design.md`'s header to the new ranges but left these three. The third is the most consequential: `evidence-registry-reviewed.md:3` points a reader at the notes inventory as the authority on what has been processed, and that inventory has no trace of the six sources or of the six notes and PDFs now owed.

### G-3 (Low) — the direction of the corpus flow is inverted, and this is the one departure pass 3 does not state

`evidence-to-design.md` §3 rule 4: "**Corpus updates flow one way.** New papers → registry → boundaries/gaps revision → this map → design change. Design documents never cite papers directly; they cite EVIDENCE/GAP/B/C IDs so the interpretation layer stays single-sourced."

The provenance of record for EVIDENCE-032…037 is `docs/reviews/estimated-1rm-evidence-research.md` — a document in the **design lineage**, written to serve this feature. The corpus now cites the design lineage rather than the reverse, so the interpretation layer is no longer single-sourced from the corpus for these six items. Pass 3 discloses the missing notes and PDFs; it does not name this rule or this inversion.

The practical risk is low — the research is an independent evidence review that re-audited the architecture review's citations rather than a document arguing for a design — but rule 4 exists precisely to stop feature documents from feeding the corpus, and the exception should be named where the rule is stated.

### G-4 (Low) — EVIDENCE-037 takes quantitative dose-response numbers from a narrative review

`docs/research-notes/README.md` records the repository's posture on this class of source: narrative and scoping reviews without pooled effect sizes are "useful for context and directional signal, **not for quantitative dose-response claims**." EVIDENCE-037's claim includes "strength can be maintained for **4–8 weeks** on reduced volume and frequency if intensity is preserved, and for **up to 32 weeks** on a minimal dose" — sourced to Spiering 2021, a narrative review retrieved as an abstract.

Mitigated on three counts and therefore low: confidence is Moderate, "Important uncertainty" says the minimal-dose conclusions are narrative, and "Unsafe inference" forbids deriving any threshold. Nothing in the design consumes the numbers — A16 and B13 use the item only for the restraint claim that recency windows are freshness rules. But the README's posture is stated about specific papers rather than as a universal rule, so this is a precedent crossed, not a rule broken.

---

## 6. Points checked and found clean

- **No rule moved.** Spot-checked the revision's §16 constants, §9.6 refusal list, §12 monotonicity properties, §21 invariants and acceptance criteria, and §22 fixtures against the version the second verification reproduced: identical. The addendum's closing sentence ("Nothing in this addendum changes a rule, threshold, invariant, boundary, fixture, or acceptance criterion") is true.
- **Row 18 was annotated, not rewritten** — its tier and original text stand, with a "superseded in detail by row 20" note, so the historical record of "no corpus basis at the time of writing" stays visible. Correct choice.
- **GAP-09 unchanged**, as intended: EVIDENCE-032's sex/age null is pooled and load-weighted, and both the registry item and A13 say so rather than claiming the gap closed.
- **GAP-07's narrowing does not overstate.** Marked "Partially resolved", crediting only the training-status and limb-type halves; the sex half remains open.
- **The unsafe-inference columns are strong** across all six items and forbid exactly the misuses this feature could invite: population tables to predict an individual, 12 as a validated boundary, transferring measured-1RM reliability to an estimate, deriving a day threshold from detraining, generalising Mayhew beyond novice women.
- **`mvp-scope.md` was correctly left alone** — it names Epley without naming OD-06 and stays consistent with the amended decision.

---

## 7. Verdict restated

# `VERIFIED — WITH ONE GOVERNANCE QUALIFICATION`

All seven confirmation points pass. The twenty decisions are bound without drift; the two-release structure and direct-tier fallback are intact; the six registry items are accurate against their primary sources and carry the research's own corrections; the rejected preprint is refused everywhere; `[E*]` upgrades are disciplined and the preprint-dependent tags were correctly left alone; ADR-011 amends OD-06 cleanly with OD-04 preserved; and only documentation changed.

**EVIDENCE-032…037 should be treated as valid provisional registry entries and recorded as such — not as a completed promotion.** They are content-accurate and honestly disclosed, and the copy rules block any escalation to the user; but they entered outside the corpus intake pipeline, the repository has no provisional status to hold them in, and three corpus-scope statements now misstate what the corpus contains. Until the six notes and PDFs land, O-17 is executed in substance and open in bookkeeping.

Nothing above was remediated. Whether to add a provisional status, correct the three scope statements, and schedule the six notes is an owner call, not a verifier's.

---

## 8. Method

Read the integration report, then verified its claims against the files rather than against it: the registry's header, §13, and all three verification passes; `docs/research-notes/README.md`; `product-evidence-boundaries.md` A13–A16 / B12–B13; `research-gaps.md` GAP-07 / 11 / 12 and its summary table; `evidence-to-design.md` header, row 18, row 20, and §3 rule 4; ADR-011 in full; `open-decisions.md`; `implementation-plan.md:223`; `architecture-plan.md`'s ADR index; and the revision's addendum, §2 legend, §15.2 copy rules, §16 constants, §17 preamble, and §25.2. Cross-checked every figure in EVIDENCE-032…037 against the research's §6.1 source table and §7–§15. Ran targeted greps for the preprint, for `provisional`, for OD-06 and OD-04, and for the `[E*]` retentions. Confirmed the F-1 gate by inspecting `d9b9760`'s contents. No scratch scripts were needed and none was created.

---

## 9. Working-tree impact

Created: `docs/reviews/estimated-1rm-owner-decision-integration-verification.md` (this file). **Nothing else was created, modified, staged, formatted, reverted, or deleted.** No finding was remediated.

Untouched: the integration report; the revision and both of its verifications; the review; the research; the evaluation; ADR-011; every file under `docs/evidence/`, `docs/architecture/`, `docs/input/`, `src/`, `drizzle/`, and `tests/`; `CLAUDE.md`, `HANDOFF*`, `gpt-*.md`, `.claude/`.

**All unrelated and concurrent changes preserved exactly as found**, including the pre-existing `CLAUDE.md`, `HANDOFF.md` (deleted) and `docs/input/product-ideas.md` diffs, the nine files this integration pass changed, and the untracked reports from the earlier lineage. The F-1 warm-up-set-classification work is committed (`d9b9760`, `c52b016`) and was inspected read-only, via `git show --stat`, solely to confirm the external gate.

No code was implemented. No owner question was decided. No commit, push, tag, deployment, or production access. No database — local or production — was started or contacted.
