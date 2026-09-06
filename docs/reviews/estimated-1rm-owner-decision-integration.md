# Estimated 1RM — Owner Decision Integration Report

Date: 2026-09-05
Role: documentation integration only. Records the owner's acceptance of O-1…O-20 of `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` (below, **the revision**) exactly as recommended, and completes the documentation that acceptance required. No application code was written; no independent review or verification report was modified; no database was contacted; nothing was committed, pushed, or deployed.

---

## 1. Verdict

# `READY FOR TARGETED DOCUMENTATION VERIFICATION`

All six integration steps are done. The revision now carries a dated owner-decision addendum that makes its rules binding for implementation; `evidence-to-design.md` has row 20; EVIDENCE-032…037 are in the registry with matching boundaries, gaps, and map entries; the rejected preprint is not promoted anywhere; ADR-011 amends OD-06 and OD-06 has left `open-decisions.md`; OD-04 is untouched; `[E*]` tags were upgraded only where a promoted registry item genuinely supports the rule. The two-release structure (Release A tracker first, Release B advisory suggestion after one block) is preserved and restated as binding, with the direct-tier-only version recorded as a fallback cut line, not the selected scope.

One honesty note the verifier should weigh (§4): the six registry items were promoted from the research report's source assessments, not from PDFs held in `docs/research/`, and have no normalized `docs/research-notes/` notes yet. The registry says so in a "Verification pass 3" entry rather than presenting the items as if they had gone through passes 1–2's PDF re-opening.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` | **Owner decision addendum** inserted after §1.1 (accepts O-1…O-20 as recommended; rules binding; two releases; fallback cut line; O-9 → ADR-011; O-17 executed; OD-04 open). §1 status paragraph, §17 heading/preamble, §18 steps 2–3, and both verdict lines updated to the accepted status. `[E*]` upgrades and "not promoted" annotations per §3 below. §2 legend row for `[E*]` records the promotion mapping. §16 citation-discipline note lists the now-citable ids. V-26 cites EVIDENCE-033; V-27 cross-references GAP-11/12. Correction log §25.2 added. No rule, constant, invariant, fixture, or acceptance criterion changed. |
| `docs/architecture/evidence-to-design.md` | **Row 20** added (design decision, evidence basis, tier, not-justified column — including the recorded departures from row 5 and the EVIDENCE-014 citation ban). Row 18 annotated as superseded in detail by row 20 (tier unchanged). Header status and Sources line updated to EVIDENCE-001…037, A1–A16, B1–B13, GAP-01…12. |
| `docs/evidence/evidence-registry-reviewed.md` | New **§13 "Strength estimation, reps-to-failure prediction, and detraining"** with EVIDENCE-032 (Nuzzo 2024), -033 (Halperin 2022), -034 (Grgic 2020), -035 (Greig 2023), -036 (Mayhew 2008), -037 (Bosquet 2013 / Encarnação 2022 / Spiering 2021), each in the registry's ten-field format with confidence capped by retrieval status. **"Verification pass 3"** entry recording provenance, the explicit non-promotion of the preprint and of twelve other named sources, the follow-up owed (notes and PDFs), and the gaps affected. No existing item renumbered, removed, or edited. |
| `docs/evidence/product-evidence-boundaries.md` | Principles **A13–A16** (exercise-specific and individually variable reps–%1RM relation; ≈ ±10 % estimate error, ≈ 3× a measurement's; systematic RIR under-prediction with the 12-rep break and no training-status moderation — qualifying A10; slow continuous detraining). Heuristics **B12** (per-exercise, within-athlete, ≤ 12 RTF, banded, advisory-only estimation — structure evidence-supported, every number a convention) and **B13** (recency windows are freshness rules). |
| `docs/evidence/research-gaps.md` | **GAP-07** → Partially resolved (EVIDENCE-033's training-status and body-region null; sex half untouched). **GAP-11** added (`reps + RIR` in a 1RM equation unvalidated; post-set retrospective RIR accuracy unmeasured). **GAP-12** added (load translation between rep schemes and suggestion benefit have no direct literature). Summary table extended; pass note appended. GAP-09 unchanged by design. |
| `docs/architecture/adr/ADR-011-strength-estimation-and-load-translation.md` | **New.** Status Accepted (2026-09-05). Context, the two-release decision with the fallback cut line, the **OD-06 amendment table** (formula kept with `f(1) = 1`; input `reps + RIR`; "reps ≤ 12 for display" → source ceiling `RTF ≤ 12`; new target ceiling 15; required ±10 % band; versioned algorithm id; tracker ships as Release A ahead of Phase 9), structural rules, consequences, deferred items. OD-04 explicitly left open. |
| `docs/architecture/open-decisions.md` | OD-06 row **removed** from the open table per the file's own rule; a dated Notes entry records the resolution by amendment, the trigger, what changed, and that OD-04 is untouched. OD-04's "why still open" gains one sentence noting ADR-011's inline SVG sparkline does not decide it. |
| `docs/architecture/implementation-plan.md` | Phase 9 paragraph: "Resolve OD-04 + OD-06 first" → OD-06 resolved by ADR-011; the e1RM trend item is satisfied earlier by Release A and only re-hosted under the OD-04 choice. |
| `docs/architecture/architecture-plan.md` | ADR index entry `ADR-001…010` → `ADR-001…011` with a one-line description. |
| `docs/reviews/estimated-1rm-owner-decision-integration.md` | This file. |

Not changed: every other file. Specifically untouched: the evaluation, the review, the evidence research, both revision verification reports, `docs/input/`, `src/`, `drizzle/`, `tests/`, `CLAUDE.md`, `HANDOFF*`, `gpt-*.md`, `.claude/`. The F-1 warm-up-set classification remediation was **committed by another session during this pass** (`d9b9760 feat: add warm-up set classification`, followed by `c52b016 docs: record warm-up set device acceptance`); none of its files was touched here, and its commit discharges the revision's external gate V-0 (§4 item 7).

---

## 3. `[E*]` classification changes — what was upgraded and what was not

Rule applied: upgrade to `[E]` only where one of EVIDENCE-032…037 supports the rule; leave `[E*]` (treated as `[P]` for citation) wherever the tag rests on a source that was not promoted. `[E]` attaches to *what exists*, never to a specific number, so constants keep a `[P]` half for their value.

| Rule / constant | Before | After | Registry basis |
| --- | --- | --- | --- |
| Source ceiling `RTF ≤ 12` (§6.2, K-04) | `[E*]` | `[E]` / `[R]` | EVIDENCE-033 (β break above 12), EVIDENCE-036 (accuracy at ≤ 10) |
| `RTF_CORE_MAX = 10` (K-05) | `[E*]` | `[E]` | EVIDENCE-036 |
| `NOISE_SD_PCT` (K-03) | `[E*]` | `[E]` magnitude / `[P]` value | EVIDENCE-034/035/036, EVIDENCE-032 converted |
| Display band (V-13) | `[P]` with `[E*]` calibration | `[P]` grid with `[E]` band calibration | EVIDENCE-034/035/036 |
| `SAME_REPS_TOLERANCE` (K-13) and the direct tier's exemption from the pooled check (§9.5 step 2) | `[E*]` | `[E]` / `[A]` | EVIDENCE-032 |
| Freshness windows (V-11) | `[P]` | `[P]` durations; `[E]` principle | EVIDENCE-037 |
| Formula tie-break (V-24) | `[P]` | `[P]` with `[E]` for "among the best at ≤ 10 RTF" | EVIDENCE-036 |
| Pooled RIR under-prediction; no experience gradient (V-26) | research citation | `[E]` | EVIDENCE-033 |
| Heaviest-load tie rule's short-set advantage (§7.2) | `[E*]` | `[E]` for the short-set half; `[E*]` for set-order fatigue and R² decay | EVIDENCE-036; Senna 2011 / Reynolds 2006 not promoted |
| Cap's *need* (K-24) | `[P]` calibrated | `[P]` calibrated; `[E]` for the need | EVIDENCE-034/035/036 |
| **Unchanged `[E*]`, now marked "not promoted":** one observation per session and first-three-sets rule (§7.1, V-8, V-9, K-08, K-27, K-28) — Senna 2011; suggestion-only equipment cap (V-20, K-36) — the rejected preprint; external corroboration of bodyweight/assisted/timed exclusions (V-3, K-37) — the preprint and a negative search | `[E*]` | `[E*]` | none promoted |

No `[P]` rule was upgraded on the strength of the preprint. No copy rule changed; `[E*]` content still may not appear as "research shows".

---

## 4. Departures, caveats, and follow-ups the verifier should see

1. **Provenance of the six registry items.** Passes 1 and 2 of the registry re-opened source PDFs at page locations. This pass could not: the PDFs are not in `docs/research/` and no normalized notes exist. The items cite the research report's §6.1 (retrieval status per source) and §15 (its independent re-audit of the numbers the review had quoted). Confidence ratings reflect retrieval: EVIDENCE-037's three abstract-only sources are folded into one Moderate item. **Follow-up owed:** six normalized notes under `docs/research-notes/` and the PDFs under `docs/research/`. Recorded in the registry's "Verification pass 3" so it cannot be mistaken for the fuller passes.
2. **Not promoted, by decision:** the Fitbod-affiliated 2026 preprint (E1-E-20). Also not promoted, because no owner decision covered them: LeSuer 1997, Wood 2002, Reynolds 2006, Shimano 2006, Richens & Cleather 2014, Steele 2017, Remmert 2023, Banyard 2017, Senna 2011, Hickmott 2022, Huang 2025, Hoeger 1990. Where one qualifies a promoted item it is named inside that item as *not in this registry*. Rules in the revision that rested on Senna 2011 or Reynolds 2006 therefore stay `[E*]`.
3. **OD-06 was amended, not adopted as recorded.** The ADR's amendment table makes the deltas explicit (input, role of 12, new target ceiling 15, band, versioned id, earlier shipping). The number 12 is unchanged; its role changes from display cap to admissibility ceiling. This is what O-9 asked for.
4. **Two OD-06 cross-references** existed outside `docs/reviews/`: `open-decisions.md` (row removed, Notes entry added) and `implementation-plan.md:223` (Phase 9 precondition rewritten). `mvp-scope.md` §2 item 1 mentions Epley without naming OD-06 and stays consistent (Epley, computed on read, labelled estimate); it was not edited. `architecture-plan.md`'s ADR index was extended to 011.
5. **Evidence-to-design row 18** keeps its tier and text and gains a "superseded in detail by row 20" note rather than being rewritten, so the historical record of "no corpus basis at the time" stays visible.
6. **Nothing in the revision's algorithm moved.** Every `V-n`, `I-n`, `K-n` value, `A-n` criterion, fixture, refusal, and boundary reads exactly as the second verification reproduced it. The verifier can diff §25.2 against the body to confirm.
7. **The external gate is now discharged.** The revision (V-0, addendum) and ADR-011 gate Release A on the F-1 remediation being verified and committed. During this pass another session committed it (`d9b9760`) and recorded device acceptance (`c52b016`). The revision's wording ("implementation may start when…") is left as written because it is now simply true; the verifier may want to confirm `git log` shows both commits on `main`.

---

## 5. What the targeted documentation verification should check

1. The addendum accepts every one of O-1…O-20 as the §17 table recommends, adds no new decision, and changes no rule.
2. Every `[E]` upgrade in §3 above maps to a registry item whose claim actually supports the rule; every tag resting on an unpromoted source is still `[E*]`; the preprint is cited nowhere as evidence.
3. Row 20's evidence column contains only registry ids (EVIDENCE-nnn, A/B/C-n, GAP-nn, row numbers) and its not-justified column carries the departures and absences (row 5, EVIDENCE-014, GAP-11, GAP-12, detraining, benefit claims).
4. EVIDENCE-032…037 use the registry's ten-field format, record retrieval status, and cap confidence accordingly; "Verification pass 3" states the provenance departure plainly.
5. A13–A16 and B12–B13 cite only registry ids; A15 qualifies A10 rather than silently contradicting it; GAP-07's narrowing does not overstate (the sex half remains open); GAP-11/12 are framed as search results, not inferences.
6. ADR-011's amendment table matches O-9 and the revision's §16 K-04/K-19; OD-04 is untouched in `open-decisions.md` and in the ADR; OD-06 appears nowhere as still open.
7. `implementation-plan.md` and `architecture-plan.md` cross-references are consistent with ADR-011 and with Release A shipping the tracker before Phase 9.
8. `git status` shows only the nine files in §2 changed or added by this pass, plus the unrelated pre-existing and concurrent changes exactly as found.

---

## 6. Working-tree impact

Created: `docs/architecture/adr/ADR-011-strength-estimation-and-load-translation.md`, `docs/reviews/estimated-1rm-owner-decision-integration.md`. Modified: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`, `docs/architecture/evidence-to-design.md`, `docs/architecture/open-decisions.md`, `docs/architecture/implementation-plan.md`, `docs/architecture/architecture-plan.md`, `docs/evidence/evidence-registry-reviewed.md`, `docs/evidence/product-evidence-boundaries.md`, `docs/evidence/research-gaps.md`. Nothing else was created, modified, staged, formatted, reverted, or deleted. All unrelated pre-existing working-tree changes (`CLAUDE.md`, `HANDOFF.md` deleted, `docs/input/product-ideas.md`, the untracked review reports and owner files) are exactly as found; the F-1 remediation left the working tree by another session's commits, not by anything done here. No code was implemented; no commit, push, tag, deployment, or production access; no database, local or production, was started or contacted.

---

## 7. Remediation of the integration verification's findings (2026-09-06)

`docs/reviews/estimated-1rm-owner-decision-integration-verification.md` returned `VERIFIED — WITH ONE GOVERNANCE QUALIFICATION`: content accurate, decisions bound without drift, but EVIDENCE-032…037 recorded at full status when the repository's own intake rules make them provisional, plus three misstatements of corpus scope, an unrecorded inversion of the one-way corpus flow, and narrative-review numbers inside a claim. All four findings are remediated below. **Nothing accepted, decided, or specified changed:** no owner decision, no algorithm, no threshold, no invariant, no boundary, no implementation scope. Only evidence *status* and its bookkeeping moved.

| Finding | Remediation | Where |
| --- | --- | --- |
| **G-1** (Medium) — provisional entries recorded at full status; no way to say "provisional" | A provisional status now exists and is visible at every point of use. **Registry:** header states that 032…037 are provisional; §13 retitled "PROVISIONAL ITEMS" with a status paragraph; each of the six item headers carries "(PROVISIONAL)" and a new `Registry status` field; a governance record under "Verification pass 3" defines the status and its **closure condition** (PDFs stored, normalized notes with `Processed` inventory rows, a numbered page-location re-verification pass, and the rule-4 exception closed with a date). **Notes inventory:** new "Provisional registry sources — not yet processed" table listing all eight sources with `Status = Provisional — PDF and note pending`. **Boundaries:** A13–A16 and B12–B13 marked "(Provisional)" / "(Rests on provisional evidence)" with a lead-in note. **Gaps:** header, GAP-07 status, and the pass note say the narrowing and the new gaps inherit provisional status. **Map:** Sources line and row 20 carry a "PROVISIONAL BASIS" marker. **ADR-011:** status and consequences state the items are provisional and that the decision does not depend on their final status. **Revision:** every `[E]` upgrade made on 2026-09-05 from these items **reverted to `[E*]`** (twelve locations), the `[E*]` legend redefined to include provisional entries, the addendum's O-17 bullet corrected to "executed in substance; status corrected", the citation-discipline note updated, and §25.3 logged | registry header, §13, pass 3; `docs/research-notes/README.md`; boundaries A13–A16, B12–B13; gaps header, GAP-07, pass note; `evidence-to-design.md` Sources, row 20; ADR-011 Status/Consequences; revision §2, §6.2, §7.2, §8.2, §8.5, §9.5, §13, §16, addendum, §25.3 |
| **G-2** (Medium) — three corpus-scope statements misstate the corpus | `evidence-registry-reviewed.md:3` now reads "14 normalized research notes … items EVIDENCE-001…031 … additionally six PROVISIONAL items EVIDENCE-032…037"; `research-gaps.md:3` now names the 14 processed papers plus the six provisional items and their eight unprocessed sources; `docs/research-notes/README.md` now says "14/14 **corpus** papers processed" and carries the provisional-sources table, so the inventory is once again the authority on what has and has not been processed | registry line 3; gaps line 3; notes README |
| **G-3** (Low) — one-way corpus flow inverted and unstated | A **temporary exception** is recorded at `evidence-to-design.md` §3 rule 4 itself: the six items' provenance of record is a design-lineage document, the flow ran design → registry, the items are therefore provisional, no further item may enter by this route, no design tag may be lifted to `[E]` on their strength, and the exception **closes** only when the registry's closure condition is met in full and the closing date is written at the rule. The registry's governance record and ADR-011 cross-reference it | `evidence-to-design.md` §3 rule 4; registry pass 3; ADR-011 |
| **G-4** (Low) — EVIDENCE-037 takes quantitative numbers from a narrative review | EVIDENCE-037 reframed: title and claim now end at the meta-analytic continuous decline and the systematic review's retention horizon; Spiering 2021's "4–8 weeks" and "32 weeks" moved to a **"Context only (narrative review — not a quantitative dose-response claim)"** line with no evidentiary weight; confidence re-stated per component (Moderate / Low / N-A); unsafe inference forbids citing either figure as evidence. Downstream: A16 no longer states the maintenance-dose finding; B13 and the revision's V-11 say the figures are context cited for nothing; ADR-011 says nothing in the decision consumes them. The notes inventory's narrative-review posture is restated as general, not paper-specific | registry EVIDENCE-037; boundaries A16, B13; revision V-11; ADR-011; notes README |

**What did not change, deliberately.** The six items' claims, figures, confidence caps, "Contradicted/qualified by", and "Unsafe inference" fields (the verification found every figure accurate); the owner addendum's acceptance of O-1…O-20; ADR-011's amendment table; the two-release structure and the direct-tier fallback; every `V-n`, `K-n`, `I-n`, `A-n`, fixture, and refusal in the revision; the refusal of the preprint; the F-1 gate's discharge. The verifier's own observation stands: because every number in the design was already a convention and the copy rules already forbid "research shows" for all strength copy, reverting the tags changes what the documents *claim about their evidence*, not what the product does.

**Files changed in this remediation:** `docs/evidence/evidence-registry-reviewed.md`, `docs/research-notes/README.md`, `docs/evidence/research-gaps.md`, `docs/evidence/product-evidence-boundaries.md`, `docs/architecture/evidence-to-design.md`, `docs/architecture/adr/ADR-011-strength-estimation-and-load-translation.md`, `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`, and this report. Neither verification report was modified. No code, no commit, no database.

**Closure owed (unchanged in substance from §4 item 1, now with a defined gate):** store the eight PDFs under `docs/research/` (recording any paywall limitation), write eight normalized notes and `Processed` inventory rows, run a numbered registry verification pass against page locations, and date-close the rule-4 exception. Only then may "(PROVISIONAL)" be removed and any `[E*]` derived from these items become `[E]`.

**What the targeted governance verification should check:** (1) "provisional" is visible at every point a provisional id is cited — registry header, §13, six item headers, notes inventory, A13–A16, B12–B13, gaps header and GAP-07/11/12, `evidence-to-design.md` Sources and row 20, ADR-011, the revision's legend, addendum, tags, and §16 note; (2) no `[E]` tag in the revision rests on EVIDENCE-032…037; (3) the three corpus-scope statements are now true; (4) the rule-4 exception is recorded at the rule with a closure condition matching the registry's; (5) EVIDENCE-037's claim contains no narrative-review number and A16/B13/V-11 consume none; (6) no accepted decision, rule, threshold, invariant, boundary, or scope differs from the version the integration verification confirmed.

---

# `READY FOR TARGETED GOVERNANCE VERIFICATION`

*(Previous verdict, 2026-09-05: `READY FOR TARGETED DOCUMENTATION VERIFICATION` — verified with one governance qualification, remediated above.)*
