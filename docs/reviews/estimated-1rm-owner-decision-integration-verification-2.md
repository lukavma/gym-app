# Estimated 1RM — Owner Decision Integration: Second (Governance) Verification

Date: 2026-09-06
Role: targeted verification of §7 of `docs/reviews/estimated-1rm-owner-decision-integration.md` against G-1…G-4 of `docs/reviews/estimated-1rm-owner-decision-integration-verification.md`. Claims were checked against the files, not against §7's account. No finding was remediated; no owner question decided; no code written; nothing committed, pushed, or deployed; no database contacted.
Scope of change: **this file only.** See §5.

---

## 1. Verdict

# `VERIFIED — ALL FINDINGS CLOSED`

All four findings are closed, and closed at the level they were raised. `EVIDENCE-032`…`037` are now visibly provisional at **every** point of use I could find; all twelve `[E]` tags derived from them are back to `[E*]` with an explicit "(provisional)" marker; the three corpus-scope statements are true again and the notes inventory is once more the authority on what has been processed; the reverse-flow exception is recorded **at rule 4 itself** with a closure condition matching the registry's; and `EVIDENCE-037` no longer carries narrative-review numbers inside its claim.

**Nothing accepted or specified changed.** 39 constants with unchanged values, 14 invariants, 32 acceptance criteria, the tier limits (`far` = 4 down / 3 up), the consistency gate (unique consistent majority of ≥ 3), the 1.20 plausibility band, the 1.10 cap, the two-release structure and the direct-tier fallback, §17's twenty rows and its "all twenty accepted exactly as recommended" preamble, and ADR-011's amendment table are all identical to the versions the previous verifications confirmed. Every figure inside the six registry items is preserved. Only evidence *status* moved.

---

## 2. Closure of G-1…G-4

### G-1 — provisional status now exists and is visible at the point of use ✅

Verified at every location §7 claims, and I found no citation of a provisional id without a marker:

| Surface | State |
| --- | --- |
| Registry header (`:3`) | Names EVIDENCE-001…031 as the note-derived corpus and EVIDENCE-032…037 as "six **PROVISIONAL** items" |
| §13 | Retitled "— PROVISIONAL ITEMS"; all six item headers carry "(PROVISIONAL)"; each has a new **`Registry status`** field recording the intake gap, the retrieval status, and "Cite only as 'EVIDENCE-0nn (provisional)'" |
| `docs/research-notes/README.md` | New "Provisional registry sources — not yet processed" table with **eight** rows (correct — EVIDENCE-037 bundles three sources), each `Status = Provisional — PDF and note pending` |
| `product-evidence-boundaries.md` | Lead-in note before A13; A13–A16 each prefixed "(Provisional)"; B12–B13 prefixed "(Rests on provisional evidence)" with the dependency named in the "Built on" line |
| `research-gaps.md` | Header, GAP-07 status ("the narrowing is itself provisional until intake completes"), GAP-11's corpus line, the summary table row, and the pass note all marked |
| `evidence-to-design.md` | Sources line distinguishes "processed" from "**provisional**"; row 20 carries a `PROVISIONAL BASIS (2026-09-06)` marker |
| ADR-011 | Status section marks the items provisional **and** adds "**This decision does not depend on their final status**", justified three ways (every number is a labelled convention; structural choices are also defended on arithmetic and on the pre-existing EVIDENCE-014/025/029/030; the binding revision holds every derived tag at `[E*]`) |
| Revision | `[E*]` legend redefined to cover provisional registry entries; addendum's O-17 bullet corrected to "executed in substance 2026-09-05; status corrected 2026-09-06"; §16 citation-discipline note distinguishes unqualified from provisional ids; §25.3 logs the pass |

**All twelve `[E]` reversions confirmed individually** — §6.2's `RTF > 12` row, §7.2's heaviest-load tie rule, V-11, V-13, §9.5 step 2, V-24, V-26, and K-03/K-04/K-05/K-13/K-24 — each now reads `[E*] … (provisional)`. K-36 correctly stays `[E*]` (it rested on the refused preprint, never on a promoted item). A search for any surviving `[E]` attached to a provisional id returns only two hits, both correct: V-11's `[E]` is on `EVIDENCE-025 / B6`, which are **not** provisional; and §25.2's line is the 2026-09-05 changelog entry that §25.3 immediately reverses — a historical record, not a live tag.

### G-2 — all three corpus-scope statements are now accurate ✅

| Statement | Now reads | True? |
| --- | --- | --- |
| `evidence-registry-reviewed.md:3` | "14 normalized research notes … items EVIDENCE-001…031. It additionally holds six PROVISIONAL items, EVIDENCE-032…037 (§13)" | ✅ |
| `research-gaps.md:3` | "the 14 processed papers … plus, since 2026-09-05, the six **provisional** registry items … (eight sources not yet through PDF/note intake)" | ✅ |
| `docs/research-notes/README.md` | "**14/14 corpus papers processed**" plus the eight-row provisional table | ✅ — the file was previously untouched; it is now edited and is again the authority on what has and has not been processed |

### G-3 — the reverse-flow exception is recorded at the rule, with a closure condition ✅

`evidence-to-design.md` §3 rule 4 now carries a sub-paragraph headed "**Temporary exception, recorded 2026-09-06 (open)**". It names the direction explicitly ("the flow ran design lineage → registry, the inverse of this rule"), names the provenance document, states that the items are therefore provisional, and defines closure as the registry's own condition — PDFs under `docs/research/`, normalized notes with `Processed` inventory rows, a numbered page-location re-verification pass, and the closing date written at the rule. It adds two standing prohibitions the finding did not ask for: no further item may enter by this route, and no design tag may be lifted to `[E]` on these six items. Cross-referenced from the registry's governance record and ADR-011.

### G-4 — EVIDENCE-037 no longer presents narrative numbers as dose-response evidence ✅

The item's **title and claim now stop** at the meta-analytic continuous decline and the systematic review's retention horizon. Spiering 2021's "4–8 weeks" and "up to 32 weeks" are moved to a separate **"Context only (narrative review — not a quantitative dose-response claim)"** field; `Supported by` splits the two evidentiary sources from the context source; confidence is stated per component (**Moderate** headline / **Low** retention / **N/A** minimal-dose). Downstream consumption is clean: A16 states the reframing and no longer carries the figures; B13 and V-11 both say the figures are context and are "cited for nothing"; ADR-011's structural-rules line says they "are consumed by nothing here".

---

## 3. No accepted decision, rule, or scope changed ✅

| Checked | Result |
| --- | --- |
| Constants | 39 `K-` rows; values unchanged (12, 10, 20/30/30/20, 1.20, 1.10, distances 1/3/2/4/3). Only the **tag column** moved |
| Invariants / acceptance criteria | 14 `I-n`, 32 `A-n` — same counts and content as verification 2 confirmed |
| Algorithm | Tier table `far` = d 4 load-down / 3 load-up; consistency gate "unique consistent majority of ≥ 3"; `DISAGREE_REFUSE_PCT` 30 — all unchanged |
| Owner decisions | §17 preamble still "**Status 2026-09-05: all twenty accepted exactly as recommended**"; 20 rows; recommended-default column untouched. The addendum's acceptance is unchanged — only its O-17 bullet gained the status correction |
| Scope | Two releases (tracker first, suggestion after one block) and the direct-tier **fallback cut line** identical in the addendum, ADR-011, and row 20 |
| ADR-011 | Amendment table's seven rows unchanged; **Status still "Accepted (2026-09-05)"** — the acceptance was not re-dated by a 2026-09-06 governance edit, which is correct |
| Registry item content | Every figure preserved: EVIDENCE-032 (952 / 7,289 / 898 / 2.51 / 4.36 / 13.1 / 8.8), EVIDENCE-033 (0.95 reps / 0.06 / 0.47 / 1.45), EVIDENCE-036 (103 untrained-to-novice college women / 5.3 ± 11.0 → 0.5 ± 10.2 / n = 46 / n = 45 / 57–67 % / ICC 0.24) |
| Preprint | Still refused everywhere; still cited by nothing |
| Files | Only documentation: the eight files §7 lists, plus this lineage's reports. Nothing under `src/`, `drizzle/`, or `tests/`. `CLAUDE.md`, `HANDOFF.md` (deleted), and `docs/input/product-ideas.md` carry only their pre-existing diffs |

---

## 4. Verdict restated

# `VERIFIED — ALL FINDINGS CLOSED`

G-1 through G-4 are closed, and the remediation stayed inside its own boundary: it changed what the documents claim about their evidence, not what the product does. The distinction the first verification asked for is now expressed in the repository itself — `EVIDENCE-032`…`037` are visibly provisional, their derived design tags sit at `[E*]`, and a dated closure condition exists at the rule they departed from.

**Outstanding by design, not a finding:** the closure condition itself — eight PDFs, eight normalized notes with `Processed` rows, a numbered page-location verification pass, and the dated closing of the rule-4 exception. Until then "(PROVISIONAL)" stays and no `[E*]` derived from these items may become `[E]`. That is an owner scheduling call, not a verification defect.

---

## 5. Working-tree impact

Created: `docs/reviews/estimated-1rm-owner-decision-integration-verification-2.md` (this file). **Nothing else was created, modified, staged, reverted, or deleted; no finding was remediated.**

All unrelated and concurrent changes preserved exactly as found — the pre-existing `CLAUDE.md`, `HANDOFF.md` (deleted) and `docs/input/product-ideas.md` diffs, the nine files of the 2026-09-05 integration pass plus `docs/research-notes/README.md` added by this remediation, and the untracked reports of this lineage. Files were opened read-only. No code was implemented; no commit, push, tag, deployment, or production access; no database was started or contacted.
