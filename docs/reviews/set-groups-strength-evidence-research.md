# Ordered Set Groups (Top Set + Back-offs) — Strength Evidence Research

**Date:** 2026-09-11
**Tree:** cb33264 (dirty — dirty paths pre-existed this task and were not touched: `CLAUDE.md`, `HANDOFF.md` (deleted), `README.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/architecture/domain-model.md`, `docs/architecture/prescription-model.md`, `docs/architecture/pwa-offline-strategy.md`, `docs/evidence/product-evidence-boundaries.md`, `docs/evidence/research-gaps.md`, `docs/research-notes/README.md`, `docs/research-notes/refalo-2024-rir-vs-failure.md`, `package.json`, `playwright.config.ts`, `src/domain/measurement/format.ts`, `src/domain/schemas/prescriptionSnapshot.ts`, `src/server/today/service.ts`, `src/sync/activeSession.ts`, `src/sync/types.ts`, `src/ui/workout/ExerciseCard.tsx`, `tests/e2e/seed.ts`, `tests/integration/sync.integration.test.ts`, `tests/integration/today.integration.test.ts`, `tests/unit/activeSessionPayloads.test.ts`, `tests/unit/measurement/format.test.ts`, `tests/unit/prescriptionSnapshot.test.ts`, `tests/unit/sync/rollbackCompatibility.test.ts`; untracked: `.claude/skills/`, `HANDOFF(depracted).md`, `docs/process/`, the Tuchscherer PDF under `docs/research/`, nine `docs/reviews/*.md` files, `gpt-handoff.md`, `gpt-memory.md`, three test files)
**Role:** evaluation (evidence research sub-task for the PI-012 architecture evaluation; research only — no code, no schema, no registry promotion, no commit)
**Session:** CF51-RES | PI-012 | Evidence research — Ordered Set Groups (top set + back-offs)
**Model:** claude-fable-5-1
**Task/gate:** [PI-012](../BACKLOG.md#pi-012) (Set Groups; linked top-set/back-offs deferred) — research input to the separately authored architecture report; touches [PI-013](../BACKLOG.md#pi-013) only where load derivation is discussed
**Authorization boundary:** none of commit / push / deploy / production / database. No database was opened. No package was installed. No server was started.
**Files touched:** this file only (`docs/reviews/set-groups-strength-evidence-research.md`). The supplied PDF `docs/research/The Reactive Training Manual_ Developing Your Own Custom-Michael Tuchscherer-2008.pdf` was read and left unchanged and unstaged.
**Verdict:** n/a (research report; the architecture author owns the verdict on representation)
**Cites:** `docs/reviews/estimated-1rm-evidence-research.md` §2–§4 (search method and inclusion standard reused), §6.1 rows E1-E-02, E1-E-08, E1-E-17, E1-E-18, E1-E-19 (not re-derived); `docs/evidence/evidence-registry-reviewed.md` §4–§7 (EVIDENCE-008…011, 015, 016–018, 029–031; provisional EVIDENCE-032/033); `docs/evidence/product-evidence-boundaries.md` A4, A5, A12, B1, B3, B9, B10, C7; `docs/evidence/research-gaps.md` GAP-02, GAP-03, GAP-12; `docs/research-notes/README.md` (inventory of the 14 processed papers)

Identifier conventions: **`SG-E-nn`** = an external source retrieved and assessed here. **`RTM p.N`** = a printed book page of the Tuchscherer manual, always paired with its 1-based PDF page as `(PDF k)`. **`Ø-n`** = a question searched for and *not* answered by anything found. Registry identifiers (`EVIDENCE-nnn`, `A/B/C-n`, `GAP-nn`) keep their repository meaning. Prior-report identifiers `E1-E-nn` mean *that* report's rows.

---

## 1. Executive conclusion

**Direct evidence.** No randomised or otherwise controlled trial comparing an ordered "top set + back-off" structure against straight sets, against percentage-of-1RM back-offs, or against any other set structure with maximal-strength outcomes in trained lifters was found by this bounded search (§3; Ø-1 and Ø-6 in §5.3). The search found one study that comes close and nothing closer:

- **SG-E-01** (Androulakis-Korakakis et al. 2021, Study 3): in 16 male intermediate–advanced powerlifters, six weeks of one daily single @ RPE 9–9.5 **plus two back-off triples at 80 % of that single's load** produced a modal powerlifting-total gain of **+33.7 kg (95 % HDI 24.3–44.1)** versus **+11.4 kg (0.8–19.5)** for the single alone. This is evidence that *adding back-off work to a very-low-volume heavy single* helps; it is **not** evidence that a top-set/back-off arrangement beats an equal-volume straight-set arrangement, because no such arm existed. Quasi-randomised, n = 8 per group, exploratory Bayesian analysis, all male.
- **SG-E-04** (Helms et al. 2018, JSCR) *uses* exactly the structure the owner describes — top set at a target RIR-based RPE, optional second top set, back-offs at 2/4/6 % below the top set until an "RPE stop" — in 12 nationally qualified powerlifters, but measures only how much volume the rule produces over three weeks. No strength comparison.
- **SG-E-09** (Larsen et al. 2021, systematic review) states the negative explicitly as of August 2020: "no studies have investigated the effects of RPE stops on 1-RM compared to a fixed volume programme." Nothing retrieved here for 2021–2026 overturns that.

**Indirect evidence** is real but does not converge on a design: heavier loads favour 1RM gains (EVIDENCE-009/010, already in the registry; a strength-first block before hypertrophy work outperformed hypertrophy-only work in SG-E-13); RIR/RPE-based load selection is *at least as* effective as percentage-of-1RM prescription and *possibly* slightly better (SG-E-05 small non-significant advantage; SG-E-06 significant advantage in an unsupervised trial; SG-E-10 pooled null at p = 0.09; SG-E-11 ranks autoregulation above percentages but with "no moderate/large effect sizes" on the squat); performance-based within-session load adjustment (APRE, SG-E-07) beat linear periodisation in one non-randomised two-season football cohort with volume unmatched; mixed repetition ranges across days equal a constant range (SG-E-12).

**Practitioner rationale.** The Tuchscherer manual (§7) is legible at every inspected page and says something more specific — and more conditional — than "80 % back-offs". Its RPE scale is RIR-anchored (RTM p.15: 10 = no reps left, 9 = one rep left, 8 = "2-4 reps left"), its per-set percentage chart is explicitly "only … a guide, not to attempt to derive a max" (RTM p.16), and its post-top-set work is governed by a **fatigue stop** (stop when strength visibly declines within the session, RTM p.18–21) or a **fatigue percent** (drop 3–10 % from the day's heaviest "initial" set and stop when *that reduced load* reaches RPE 10 for the same reps, inside a time cap, RTM p.55–58). Neither is a fixed "2×6–8 at 80 %" rule; the manual does not use the phrase "top set" or "back-off" anywhere inspected, and the closest fixed-drop example it gives is wave loading at "usually 20–50 pounds" below a heavy triple, about which it says "It may work for you – it may not" (RTM p.37). The manual's publication year is not printed on any inspected page; 2008 is corroborated only by Larsen et al. 2021 citing "Tuchscherer (2008)" for the RIR-anchored scale (§7.1).

**Unresolved.** Whether back-offs should be derived from the day's performed top set or planned from a percentage of 1RM (Ø-1); which percentage, if any, is best (Ø-2); how many groups or back-off sets (Ø-3); what progression rule should link groups (Ø-4); and whether RPE-stop / fatigue-stop volume rules change 1RM outcomes versus fixed set counts (Ø-5).

**For the builder (§11).** Everything the evidence and the practice literature actually do — independent RIR-banded groups, groups whose load is a user-chosen percentage or offset of another group's *planned or performed* load, a set-count *range* on the top group (Helms' "second top set if the RPE was too low"), an optional per-group stop rule — is legitimate to *represent*. Nothing found justifies an evidence-derived *default* percentage, group count, or cross-group progression rule; the one trial-tested value (80 % of a near-maximal single, for triples at RPE ≈ 6–7) is a single small study at one top-set intensity and would be a *labelled example*, not a default. Percentage-of-top-set and a RIR band are not interchangeable prescriptions: three published reps-at-%1RM references disagree by several RIR about what "80 % of an RIR-2 double for 6–8 reps" feels like (§10), so which one governs a set must stay user-defined. PI-012's V1 choice — independent groups, no percentage derivation — is fully consistent with the evidence; nothing found makes linked derivation necessary, and nothing found makes it wrong.

---

## 2. What the processed corpus already answers, and the questions that remained

The 14 processed papers and the provisional items were read through their notes and the registry, not re-derived. The following registry facts bear on set groups and were **not** searched again:

| Already answered | Registry item | Bearing on set groups |
|---|---|---|
| Heavier loads produce greater 1RM gain; the high-vs-moderate edge is a trend (P ≈ 0.07), not confirmed | EVIDENCE-009, -010 (Lopez 2021; ACSM 2026) | Rationale for a heavy group at all; no rationale for a specific split |
| Proximity to failure has a negligible relationship with strength gain | EVIDENCE-011 (Robinson 2023, preprint) | A back-off group at RIR 2–3 is not disadvantaged for strength by its RIR |
| 1–2 RIR ≈ failure for hypertrophy, with less fatigue | EVIDENCE-029; B10 | Back-off RIR bands are defensible for hypertrophy aims without failure |
| RIR self-report is useful but ±1 rep noisy; under-prediction ≈ 1 rep; error breaks upward above 12 reps to failure | EVIDENCE-030, -033 (prov.), A15 | Any RIR-triggered stop or progression rule must tolerate ±1 rep |
| "Target RIR, adjust load if missed" is the dominant pattern, not validated as superior | EVIDENCE-015; B1 | Per-group autoregulation is a heuristic, not a proven method |
| Load progression ≈ repetition progression (to failure, untrained) | EVIDENCE-031; B9, C7 | Per-group progression strategy should be selectable, not fixed |
| Periodisation: small strength benefit; UP > LP in trained lifters | EVIDENCE-017, -018 (Moesgaard 2022) | Varying load across sessions is weakly supported; no block-length support |
| Volume → strength: diminishing returns, plateau ≈ 5 fractional sets/week | EVIDENCE-002 (Pelland, preprint) | Population-level context for group counts; not a per-session rule |
| Reps at a given %1RM vary between individuals (SD 2.51 reps at 80 %) and by exercise | EVIDENCE-032 (prov.) | A percentage-derived back-off does not land on a fixed RIR |
| Autoregulated vs percentage-based load prescription is mixed | `estimated-1rm-evidence-research.md` E1-E-18, E1-E-19; GAP-12 | Re-used here (SG-E-10, SG-E-11), not re-derived |

**Questions that remained** (the brief's Q1–Q4, restated as what the corpus lacks):

- **Q1 (direct).** Any controlled study of a top-set + back-off structure with 1RM outcomes in trained lifters.
- **Q2 (indirect, new/specific).** Additional moderate-load volume *after* heavy sets; RIR-based-RPE autoregulation trials beyond the two single studies Bastos cites secondhand; mixed repetition ranges.
- **Q3 (comparative).** Back-offs derived from the day's performed top set versus fixed percentage-of-1RM prescription, or other performance-based adjustment (APRE).
- **Q4 (parameters).** Evidence for particular percentages of the top set, group counts, or progression rules.

---

## 3. Search strategy

### 3.1 Date, engines, routes

Searched **2026-09-11**. Engines and routes actually used: the general web-search tool (nine query strings, below); the **Europe PMC REST API** (`/europepmc/webservices/rest/search?query=EXT_ID:<pmid> AND SRC:MED&resultType=core`) for verbatim abstracts once PubMed's own pages returned only a cookie interstitial (the same fallback the prior report used); **PubMed Central** (one full text retrieved, one blocked by reCAPTCHA); **Frontiers** (two full texts); **MDPI** (403); **Journal of Strength and Conditioning Research / LWW** (403); **ScienceDirect** (402); the **Semantic Scholar Graph API** (two records, abstracts elided by the publisher); the **St Mary's University repository** (accepted-manuscript PDF, read page by page); the **PeerJ** PDF (read page by page); **SciELO** (one abstract); and the **Reactive Training Systems store blog** mirror (one article; `articles.reactivetrainingsystems.com` did not resolve).

### 3.2 Search strings (verbatim)

1. `"top set" "back-off sets" strength powerlifting randomized study`
2. `Mann 2010 autoregulatory progressive resistance exercise APRE vs linear periodization college football strength`
3. `Helms 2018 RPE vs percentage-based load prescription powerlifters 8 weeks strength`
4. `Graham Cleather 2021 autoregulation by repetitions in reserve strength gains 12 weeks fixed loading`
5. `Larsen 2021 velocity-based training vs percentage-based powerlifters autoregulation Frontiers`
6. `Shattock Tee 2022 autoregulation vs traditional periodization RPE velocity strength power`
7. `Carvalho 2022 varying repetition ranges within week hypertrophy strength trained`
8. `autoregulation resistance training systematic review meta-analysis strength Hickmott OR Larsen OR Zhang 2022 2024 2025`
9. `Androulakis-Korakakis 2020 reduced volume "daily max" training powerlifters single RPE 9 back-off sets 80% strength`
10. `Zourdos 2016 novel resistance training-specific rating of perceived exertion scale measuring repetitions in reserve JSCR`
11. `Zourdos 2016 efficacy of daily one-repetition maximum training well-trained powerlifters weightlifters case series Nutricion Hospitalaria`
12. `Schoenfeld 2016 effects of varied versus constant loading zones on muscular adaptations in trained men`
13. `Carvalho 2021 "Is stronger better" strength phase followed by hypertrophy phase resistance-trained men Research in Sports Medicine`
14. `Reactive Training Systems Tuchscherer "fatigue percents" article OR "emerging strategies" OR "RPE chart" site:reactivetrainingsystems.com OR articles.reactivetrainingsystems.com`
15. `Helms 2017 self-rated accuracy of RPE-based load prescription in powerlifters JSCR single RPE 8 back-off`
16. `heavy single OR "heavy set" potentiation subsequent lighter sets repetitions performance resistance-trained "post-activation performance enhancement" back-off`
17. `"back-off sets" OR "back off sets" OR "backoff sets" resistance training randomized 1RM strength 2023 OR 2024 OR 2025 OR 2026`

### 3.3 Passes

1. **Direct pass** (strings 1, 9, 11, 17): any trial or case series using a heavy top set/single followed by back-off sets, with a strength outcome.
2. **Named-source pass** (2–8, 10, 12, 13, 15): the sources the brief named, each retrieved to abstract or full text and re-checked against the summaries the search engine offered — two of those summaries were wrong (§3.5) and were corrected from the primary record.
3. **Practitioner pass** (14): the manual's own later restatement of fatigue percents.
4. **Recency pass** (17): 2023–2026 for any new direct trial. None found.
5. **Negative pass**: the Ø-items in §5.3 are recorded as search results, not inferences.

### 3.4 Access limitations

- PubMed article pages: cookie interstitial on every attempt; replaced by Europe PMC REST (verbatim abstracts) — no claim rests on a PubMed page.
- `PMC6162635` (daily-max pilot): reCAPTCHA; its abstract was taken verbatim from Europe PMC instead, and the MDPI mirror returned 403. Per-participant numbers below are therefore **abstract-level only**.
- Shattock & Tee 2022: LWW 403; abstract from Europe PMC and Semantic Scholar. Whether the RPE arm used the RIR-anchored scale is **not verifiable from the abstract**; Larsen et al. 2021 classify it under "RIR and RIR-based RPE" and that classification is relied on with that caveat.
- Huang et al. 2025 NMA: ScienceDirect 402; abstract verbatim from Europe PMC (PMC12336695 exists but was not fetched). Study/participant counts are **not reported here** because they are not in the abstract.
- Androulakis-Korakakis et al. 2021: Frontiers full text was fetched and summarised by the fetch tool rather than read page by page; the Study 3/4 numbers below are as the summariser reported them and are flagged **"fetch-summary"**. They agree with the abstract-level recommendation sentence quoted from the PMC copy, which was retrieved separately.
- Graham & Cleather 2021, Larsen et al. 2021, and Mann et al. 2010 were read **page by page** from locally saved PDFs (accepted manuscript; publisher PDF; publisher PDF respectively).
- `articles.reactivetrainingsystems.com`: DNS failure; the store mirror served the same article (dated 15 June 2016). Its stopping-condition wording was summarised by the fetch tool, not read verbatim, and is marked so.

### 3.5 Corrections made to search-engine summaries

Two engine summaries were materially wrong and are recorded so nobody downstream inherits them:

- The engine summarised Zourdos et al. 2016 as "10 RPE = 1 RIR; 9 RPE = 2 RIR". The verbatim abstract says **"RPE-10 = 0-RIR, RPE-9 = 1-RIR, and so forth"** (SG-E-14).
- The engine summarised Larsen et al. 2021 as possibly a Frontiers paper on powerlifters; it is a **PeerJ** systematic review of 14 studies (SG-E-09).

---

## 4. Inclusion and exclusion criteria

Applied unchanged from `docs/reviews/estimated-1rm-evidence-research.md` §3.

**Included as material evidence:** controlled trials (randomised or quasi-randomised), crossover trials, systematic reviews, meta-analyses and network meta-analyses, dedicated measurement studies, and — only because the direct question has so little literature — one pilot study and one case series in competitive lifters, each labelled by design. Trained or athletic populations preferred; untrained populations admitted only where no trained alternative exists.

**Included as practitioner rationale, never as evidence:** the Tuchscherer manual and one RTS article by the same author.

**Excluded:** coaching blogs and product guides surfaced by strings 1 and 17 (Stronglifts, Andy Baker, BarBend, SET FOR SET, Arvo, Harvesting Strength) — recorded in §5.2 only to show what the "back-off" web consists of; the PAPE/post-activation literature (acute power output after a heavy set is a different question from chronic strength adaptation to a set structure); intra-set cluster / rest-pause trials (the brief forbids equating ordinary set groups with cluster training; one such trial in powerlifters is listed as excluded so the distinction is visible); a ResearchGate-only record "Utility of Back-Off Sets: An Overview" whose venue and content could not be verified — **unverified, not relied on**.

**Standing rule.** Nothing here may be cited by a design document until it enters the registry (`docs/architecture/evidence-to-design.md` §3 rule 4). This report adds no registry rows; §12 lists what it does not do.

---

## 5. Candidate sources considered

### 5.1 Retrieved and assessed

| ID | Source | Design / population | Retrieval | Disposition |
|---|---|---|---|---|
| **SG-E-01** | Androulakis-Korakakis P, Michalopoulos N, Fisher JP, Keogh J, Loenneke JP, Helms E, Wolf M, Nuckols G, Steele J. *The Minimum Effective Training Dose Required for 1RM Strength in Powerlifters.* Front Sports Act Living. 2021;3:713655. doi:[10.3389/fspor.2021.713655](https://doi.org/10.3389/fspor.2021.713655) · [PMC8435792](https://pmc.ncbi.nlm.nih.gov/articles/PMC8435792/) | Five linked studies; Studies 3–4 are 6-week quasi-randomised interventions in male powerlifters (n = 16; n = 9) | PMC full text (recommendation sentences verbatim) + Frontiers full text (fetch-summary) | **Included — nearest to direct** |
| **SG-E-02** | Androulakis-Korakakis P, Fisher JP, Kolokotronis P, Gentil P, Steele J. *Reduced Volume 'Daily Max' Training Compared to Higher Volume Periodized Training in Powerlifters Preparing for Competition—A Pilot Study.* Sports (Basel). 2018;6(3):86. doi:[10.3390/sports6030086](https://doi.org/10.3390/sports6030086) · PMC6162635 | Pilot, 10 competitive powerlifters, 10 weeks, no inferential statistics | Abstract verbatim (Europe PMC) | Included — context for SG-E-01 (single with **no** back-offs) |
| **SG-E-03** | Zourdos MC, Dolan C, Quiles JM, et al. *Efficacy of daily one-repetition maximum training in well-trained powerlifters and weightlifters: a case series.* Nutr Hosp. 2016;33(2):437–443. doi:[10.20960/nh.129](https://doi.org/10.20960/nh.129) | Case series, n = 3, 37 consecutive days | Abstract (SciELO) | Included — only source using back-offs at a stated **percentage of the day's max** (85 % / 90 %) |
| **SG-E-04** | Helms ER, Cross MR, Brown SR, Storey A, Cronin J, Zourdos MC. *Rating of Perceived Exertion as a Method of Volume Autoregulation Within a Periodized Program.* J Strength Cond Res. 2018;32(6):1627–1636. doi:[10.1519/JSC.0000000000002032](https://doi.org/10.1519/JSC.0000000000002032) | Within-subject, 12 nationally qualified powerlifters, 3 weeks; volume outcome only | Abstract verbatim (Europe PMC); protocol corroborated by SG-E-09 p.4 | Included — the structure itself, no strength comparison |
| **SG-E-05** | Helms ER, Byrnes RK, Cooke DM, et al. *RPE vs. Percentage 1RM Loading in Periodized Programs Matched for Sets and Repetitions.* Front Physiol. 2018;9:247. doi:[10.3389/fphys.2018.00247](https://doi.org/10.3389/fphys.2018.00247) | RCT, 21 trained men, 8 weeks, DUP | Frontiers full text | Included — RIR-based RPE vs %1RM |
| **SG-E-06** | Graham T, Cleather DJ. *Autoregulation by "Repetitions in Reserve" Leads to Greater Improvements in Strength Over a 12-Week Training Program Than Fixed Loading.* J Strength Cond Res. 2021;35(9):2451–2456. doi:[10.1519/JSC.0000000000003164](https://doi.org/10.1519/JSC.0000000000003164) | Registered RCT, 31 trained men, 12 weeks, unsupervised | Accepted manuscript, 12 pp. read | Included — RIR vs %1RM |
| **SG-E-07** | Mann JB, Thyfault JP, Ivey PA, Sayers SP. *The Effect of Autoregulatory Progressive Resistance Exercise vs. Linear Periodization on Strength Improvement in College Athletes.* J Strength Cond Res. 2010;24(7):1718–1723. doi:[10.1519/JSC.0b013e3181def4a6](https://doi.org/10.1519/JSC.0b013e3181def4a6) | Retrospective two-season cohort comparison (not randomised), 23 D-I football players, 6 weeks | Publisher PDF, 3 pp. read | Included — APRE (within-session performance-based adjustment) |
| **SG-E-08** | Shattock K, Tee JC. *Autoregulation in Resistance Training: A Comparison of Subjective Versus Objective Methods.* J Strength Cond Res. 2022;36(3):641–648. doi:[10.1519/JSC.0000000000003530](https://doi.org/10.1519/JSC.0000000000003530) · PMID 32058357 | Randomised crossover, 20 amateur rugby players, 2 × 6 weeks | Abstract (Europe PMC, Semantic Scholar); per-group table via SG-E-09 | Included — RPE vs velocity autoregulation |
| **SG-E-09** | Larsen S, Kristiansen E, van den Tillaar R. *Effects of subjective and objective autoregulation methods for intensity and volume on enhancing maximal strength during resistance-training interventions: a systematic review.* PeerJ. 2021;9:e10663. doi:[10.7717/peerj.10663](https://doi.org/10.7717/peerj.10663) · PMC7810043 | Systematic review, 14 studies / 30 groups / 356 participants, search to Aug 2020, narrative (no pooling) | Publisher PDF, 14 of 30 pp. read | Included — the explicit "no RPE-stop vs fixed-volume study" statement; the Tuchscherer (2008) attribution |
| **SG-E-10** | Hickmott LM, Chilibeck PD, Shaw KA, Butcher SJ. *The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy: A Systematic Review and Meta-Analysis.* Sports Med Open. 2022;8:9. doi:[10.1186/s40798-021-00404-9](https://doi.org/10.1186/s40798-021-00404-9) · PMC8762534 | Meta-analysis, 15 studies / 441 participants, trained only | PMC full text | Included — same as prior report's E1-E-18; not re-derived |
| **SG-E-11** | Huang Z, Sun J, Li D, Chen C, Wang D. *Autoregulated resistance training for maximal strength enhancement: A systematic review and network meta-analysis.* J Exerc Sci Fit. 2025;23(4):360–369. doi:[10.1016/j.jesf.2025.07.006](https://doi.org/10.1016/j.jesf.2025.07.006) · PMID 40791980 · PMC12336695 | Network meta-analysis, APRE / RPE / VBRT / percentage-based | Abstract verbatim (Europe PMC) | Included with the prior report's Low–Moderate rating (E1-E-19) |
| **SG-E-12** | Schoenfeld BJ, Contreras B, Ogborn D, Galpin A, Krieger J, Sonmez GT. *Effects of Varied Versus Constant Loading Zones on Muscular Adaptations in Trained Men.* Int J Sports Med. 2016;37(6):442–447. doi:[10.1055/s-0035-1569369](https://doi.org/10.1055/s-0035-1569369) | RCT, 19 trained men, 8 weeks | Abstract verbatim (Europe PMC) | Included — mixed rep ranges across days |
| **SG-E-13** | Carvalho L, Junior RM, Truffi G, Serra A, Sander R, De Souza EO, Barroso R. *Is stronger better? Influence of a strength phase followed by a hypertrophy phase on muscular adaptations in resistance-trained men.* Res Sports Med. 2021;29(6):536–546. doi:[10.1080/15438627.2020.1853546](https://doi.org/10.1080/15438627.2020.1853546) | RCT, 26 trained men, 8 weeks | Abstract verbatim (Europe PMC) | Included — heavy-first sequencing (between blocks, not within session) |
| **SG-E-14** | Zourdos MC, Klemp A, Dolan C, et al. *Novel Resistance Training-Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve.* J Strength Cond Res. 2016;30(1):267–275. doi:[10.1519/JSC.0000000000001049](https://doi.org/10.1519/JSC.0000000000001049) | Cross-sectional validation, n = 29 | Abstract verbatim (Europe PMC) | Included — the scale definition the brief asks to distinguish |
| **SG-E-15** | Helms ER, Brown SR, Cross MR, Storey A, Cronin J, Zourdos MC. *Self-Rated Accuracy of Rating of Perceived Exertion-Based Load Prescription in Powerlifters.* J Strength Cond Res. 2017;31(10):2938–2943. doi:[10.1519/JSC.0000000000002097](https://doi.org/10.1519/JSC.0000000000002097) | Within-subject, 12 powerlifters, 3 weeks | Abstract verbatim (Europe PMC) | Included — accuracy of *selecting a load to hit a target RPE* (the top-set task) |
| **SG-E-16** | Tuchscherer M. *The Reactive Training Manual: Developing Your Own Custom Training Program for Powerlifting.* Self-published; year not printed on any inspected page (2008 per filename and per SG-E-09's citation; 2009 per PDF creation metadata reported by the brief — not publication evidence). 43-page scan, no text layer. | Practitioner manual | Local scan, 30 of 43 PDF pages inspected (§7) | Included as **practitioner rationale** |
| **SG-E-17** | Tuchscherer M. *Fatigue Percents Revisited.* Reactive Training Systems, 15 June 2016. [store mirror](https://store.reactivetrainingsystems.com/blogs/advanced-concepts/fatigue-percents-revisited) (original at `articles.reactivetrainingsystems.com/2016/06/15/fatigue-percents-revisited/` did not resolve) | Practitioner article | Fetch-summary | Included as **practitioner rationale** (author's later restatement) |

### 5.2 Considered and excluded

| Source | Why excluded |
|---|---|
| *The effect of resistance training set configuration on strength and muscular performance adaptations in male powerlifters* (PMC8041766; 24 powerlifters, cluster vs traditional sets, 8 weeks; similar 1RM changes) | Intra-set cluster configuration — the brief forbids equating it with ordinary set groups. Listed so the distinction is explicit. |
| Carvalho L, Moriggi Junior R, Barreira J, Schoenfeld BJ, Orazem J, Barroso R. 2022 volume-matched load meta-analysis (Appl Physiol Nutr Metab) | Load-zone comparison already covered by EVIDENCE-008/009 (Lopez 2021); not a mixed-range study. The brief's "Carvalho 2022 varying rep ranges" resolved to SG-E-13 (2021, block sequencing) — no within-week mixed-range Carvalho study was found. |
| Zourdos MC et al. 2016, *Modified daily undulating periodization model produces greater performance than a traditional configuration in powerlifters* (JSCR) | Surfaced by string 11; DUP ordering, not a set-group question; not retrieved. |
| PAPE / post-activation potentiation sources (PMC11475006, PMC12213354, PMC5820625, coaching pages) | Acute power output minutes after a heavy set; not chronic strength adaptation to a set structure. |
| "Utility of Back-Off Sets: An Overview" (ResearchGate record 350137998) | Venue and content unverifiable — **unverified, not relied on**. |
| Stronglifts, Andy Baker, BarBend, SET FOR SET, Arvo, Harvesting Strength pages | Coaching/product content; recorded only as evidence that "drop 10–30 % for 2–3 back-off sets at RPE 7–9" is a widespread *convention*, which is not evidence. |
| ACSM 2026 news page ("Landmark 2026 Resistance Training Guidelines") | The position stand itself is already processed (`acsm-2026-resistance-training-position-stand.md`); the news page adds nothing. |
| McNamara & Stearne 2010; Colquhoun et al. 2017 (flexible non-linear periodisation) | Session-selection autoregulation, not load or set structure; known only through SG-E-06 and SG-E-09; not retrieved. |

### 5.3 Searched and not found (`Ø`)

| Ø | Question | Result |
|---|---|---|
| **Ø-1** | A controlled comparison of back-offs derived from the **day's performed top set** versus back-offs prescribed as a **fixed percentage of 1RM** | **None found.** Every retrieved protocol that had back-offs derived them from the day's performance (SG-E-01 80 % of the single; SG-E-03 85/90 % of the daily 1RM; SG-E-04 2/4/6 % below the top set). No arm used fixed-%1RM back-offs as a comparator. The nearest is session-level autoregulated vs percentage prescription (SG-E-05, -06, -10, -11), which is mixed. |
| **Ø-2** | Evidence for a **particular percentage** of the top-set load | **None beyond one tested value.** 80 % of a RPE 9–9.5 single (SG-E-01) is the only value tested against an alternative, and the alternative was "no back-offs". 85/90 % (SG-E-03) is uncontrolled. |
| **Ø-3** | Evidence for a **number of groups or of back-off sets** | **None.** Tested arrangements: 1 + 2 (SG-E-01), 1 + 5 (SG-E-03), 1–2 + RPE-stop (SG-E-04). No dose comparison. |
| **Ø-4** | A **progression rule linking groups** (e.g., raise back-offs when the top set progresses) | **None.** Not studied anywhere retrieved. |
| **Ø-5** | RPE-stop / fatigue-stop **volume autoregulation vs fixed set counts with 1RM outcomes** | **None.** SG-E-09 states this explicitly (p.4); nothing 2021–2026 found. |
| **Ø-6** | A top-set/back-off **vs equal-volume straight sets** trial | **None found.** |
| **Ø-7** | Any 2023–2026 direct trial (string 17) | **None found**; string 17 returned coaching content only. |

---

## 6. Per-study evidence records

Each record states population, size, duration, comparison, strength outcomes as reported, uncertainty, and the link. "Fetch-summary" marks numbers reported by the fetch tool's summariser rather than read from a page.

### SG-E-01 — Androulakis-Korakakis et al. 2021 (minimum effective dose; Studies 3 and 4)

- **Population / status:** male competitive powerlifters; Study 3 intermediate–advanced (Wilks ≈ 347 both groups); Study 4 beginner–intermediate (Wilks ≈ 310–322). Fetch-summary.
- **Size:** Study 3 n = 16 (8 MAX, 8 MAX+back-off); Study 4 n = 9 (5 MAX+back-off, 4 AMRAP) after seven COVID-related dropouts. Fetch-summary.
- **Duration / frequency:** 6 training weeks (8 with testing); squat days 1 and 3, bench all three days, deadlift day 2 ("2-3-1").
- **Protocols:** MAX = one single @ RPE 9–9.5 per session. MAX+back-off = that single **plus two sets of three repetitions at 80 % of the single's load**, reported RPE ≈ 6–7 (the authors describe them as "~2–4 RIR"). AMRAP (Study 4) = one set as many reps as possible at 70 % 1RM to RPE 9–9.5 (mean reps SQ 13.1 ± 1.9, BP 16.7 ± 2, DL 11.5 ± 2). Fetch-summary.
- **Strength outcomes (powerlifting total, Bayesian modal change with 95 % HDI):** Study 3 — MAX **+11.4 kg (0.8–19.5)**, 6.3 % probability of exceeding the meaningful-change threshold; MAX+back-off **+33.7 kg (24.3–44.1)**, 99.6 %. Study 4 — MAX+back-off **+26.8 kg (17.3–41.6)**, 98.1 %; AMRAP **+15.3 kg (3.4–31.3)**, 41.4 %. Fetch-summary.
- **Author recommendation (verbatim, PMC copy):** "PL athletes looking to train with a METD approach can do so by performing ~3–6 working sets of 1–5 repetitions each week, with these sets spread across 1–3 sessions per week per powerlift, using loads above 80% 1RM at a Rate of Perceived Exertion (RPE) of 7.5–9.5 for 6–12 weeks and expect to gain strength." And: "the addition of 2–3 back-off sets at ~80% of the single repetitions load, may produce greater gains over 6 weeks while following a 2-3-1 squat-bench press-deadlift weekly training frequency."
- **Uncertainty / limitations:** quasi-randomised by strength stratification; 8 and 4–5 per group; exploratory Bayesian estimation with "highly unstable local descriptions" (authors' words per fetch-summary); all male; the back-off arm did ≈ 600 % more repetitions per session than MAX by this report's own count (1 rep vs 1 + 2×3 = 7 reps; not a figure the study reports), so **volume and structure are confounded** — the study cannot say whether the *arrangement* (heavy single first) mattered or only the added sets; Study 4 has no MAX-only arm.
- **What it supports:** adding two back-off triples at 80 % of a near-maximal single to an otherwise single-set programme is associated with a materially larger 6-week total gain in trained male powerlifters. **What it does not support:** superiority over straight sets, over other percentages, over percentage-of-1RM back-offs, or any specific back-off count.
- **Classification:** nearest-to-direct; **Indirect** for the owner's question (no straight-set or fixed-%1RM comparator).

### SG-E-02 — Androulakis-Korakakis et al. 2018 (daily-max pilot)

- **Population / size / duration:** 10 competitive powerlifters; 10 weeks to the Greek IPF-affiliate nationals; MAX (single sets of single reps @ RPE 9–9.5, **no back-offs**) vs PER (periodised, 70–93 % 1RM, taper).
- **Outcomes (abstract, verbatim figures):** PER total +2 %, +6.5 %, 0 (P1–P3). MAX competition total +4.8 %, +4.2 %, −0.5 %, −3.4 %, −5 % (P1–P5); MAX peri-training total +3.6 %, +4.2 %, +4.5 %, +1.8 %, −1.2 %.
- **Uncertainty:** pilot, no inferential statistics, unequal groups, competition-day totals include attempt selection.
- **Bearing:** shows why SG-E-01 added back-offs — singles alone were unreliable at competition. **Indirect / context.**

### SG-E-03 — Zourdos et al. 2016 (daily 1RM case series)

- **Population / size / duration:** 2 powerlifters (28 y, 34 y) and 1 weightlifter (19 y), ≥ 5 y squat experience; 37 consecutive days.
- **Protocol:** daily 1RM back squat **followed by 5 volume sets of 3 at 85 % or 2 at 90 % of the daily 1RM** (days 1–35); day 36 one set at 85 % of day-1 1RM; day 37 1RM test.
- **Outcomes:** P1 +5 kg (2.3 %) day 1→37, +12.5 kg (5.8 %) to peak; P2 +13.5 kg (10.8 %); P3 +21.0 kg (9.5 %); all with significant time–1RM correlations (p < 0.05).
- **Uncertainty:** n = 3, no control, daily maximal testing confounds testing practice with training.
- **Bearing:** the only source found that expresses back-offs as a **percentage of the day's performed max** — 85–90 % for doubles/triples — and it is uncontrolled. **Indirect (weak).**

### SG-E-04 — Helms et al. 2018 (RPE stops; JSCR)

- **Population / size / duration:** 12 nationally qualified powerlifters (9 men, 3 women; 26 ± 7 y); 3 weeks; squat, bench, deadlift 3×/week in hypertrophy → power → strength order.
- **Structure (verbatim):** "Each session subjects performed an initial top set for a prescribed number of repetitions at a target RPE. A second top set was performed if the RPE score was too low, then subsequent back-off sets at a reduced load were performed for the same number of repetitions. When the prescribed RPE was reached or exceeded, sets stopped; known as an 'RPE stop.' The percentage load reduction for back-off sets changed weekly: there were 2, 4, or 6% RPE stop reductions from the top set."
- **Outcome (volume only):** weekly combined relative volume load (sets × reps × %1RM) 2 % = 74.6 ± 22.3; 4 % = 88.4 ± 23.8; 6 % = 114.4 ± 33.4 (p < 0.001). "it does seem that volume can be effectively autoregulated using RPE stops".
- **Uncertainty:** no strength outcome; 3 weeks; the RPE scale is the RIR-based one (companion paper SG-E-15 says so explicitly).
- **Bearing:** the owner's structure — a top group with a set-count range of 1–2, then back-offs at a small percentage below the *performed* top set with a stop rule — exists in the literature and behaves predictably for volume. **Indirect (structure exists; outcome untested).**

### SG-E-05 — Helms et al. 2018 (RPE vs %1RM; Frontiers)

- **Population / size / duration:** 21 resistance-trained men (22.4 ± 3.4 y; ≥ 2 y; squat ≥ 1.5× and bench ≥ 1.25× body mass); 8 weeks DUP (8 / 6 / 2–4 reps on Mon/Wed/Fri, 2–3 sets); 1RMG n = 11 (percentage of pre-test 1RM) vs RPEG n = 10 (self-selected loads to RIR-based RPE targets per SG-E-14).
- **Outcomes:** squat 1RM +13.9 ± 5.9 vs **+17.1 ± 5.4 kg** (p = 0.32); bench +9.6 ± 5.4 vs +10.7 ± 3.3 kg (p = 0.52); combined +23.6 ± 10.4 vs +27.8 ± 7.9 kg (p = 0.38). Between-group ES (90 % CL): squat 0.50 ± 0.63 (79 % chance RPEG advantage), bench 0.28 ± 0.73 (57 %), combined 0.48 ± 0.68 (72 %). RPEG trained at higher average RPE (squat 7.2 vs 6.5, p = 0.04; bench 7.3 vs 5.8, p < 0.001) and higher bench relative intensity (84.1 vs 78.7 %, p < 0.001; squat 79.7 vs 78.7 %, p = 0.49).
- **Uncertainty / author limitations:** percentages may have been conservative; RPEG did more bench volume at higher intensity (confound); 8 weeks; individual responsiveness unexplored. No between-group difference reached significance.
- **Classification:** **Indirect** — RIR-based-RPE load selection was at least as effective as %1RM, with a small, non-significant lean in its favour.

### SG-E-06 — Graham & Cleather 2021 (RIR vs fixed loading)

- **Population / size / duration:** 31 strength-trained men (≥ 2 y, ≥ 2×/week; FL n = 16, age 28.3 ± 5.6, 1RM FS 111.3 ± 19.6 / BS 129.1 ± 21.3 kg; AR n = 15, 27.9 ± 5.3, FS 120.7 ± 26.3 / BS 141.2 ± 29.4 kg); registered (researchregistry2046); randomised; 12 weeks, 2×/week (front squat day 1, back squat day 2); **unsupervised**, adherence by weekly e-mail and logbooks.
- **Prescription (Table 2):** Phase 1 (wk 1–4) 3×10 — FL 65 / 67.5 / 70 / 72.5 % vs AR 4 / 3 / 2 / 1 RIR; Phase 2 (wk 5–8) 4×5 — FL 77.5 / 80 / 82.5 / 87.5 % vs AR 4 / 3 / 2 / 1 RIR; Phase 3 (wk 9–12) 3×3 — FL 87.5 / 90 / 92.5 / 95 % vs AR 2 / 1 / 0 / MAX. RIR targets were chosen from a Baechle & Earle reps-at-%1RM table so that intensity was "theoretically the same". Scale: plain **RIR** ("one RIR means the athlete could have completed one more repetition"), not the RPE-10 scale.
- **Outcomes (abstract, verbatim):** "FS: AR +11.7%, FL +8.3%, p = 0.004, ηp² = 0.255; BS: AR +10.8%, FL +7.1%, p = 0.006, ηp² = 0.233". AR trained at greater average weekly intensity (FS 83.2 ± 13.3 vs 80.4 ± 10.0 %, p < 0.001; BS 83.6 ± 12.7 vs 80.4 ± 10.0 %, p = 0.006).
- **Uncertainty:** unsupervised (the authors and SG-E-09 both flag it); the AR advantage is entangled with the AR group lifting heavier; no confidence intervals on the percentage differences in the abstract; 12 weeks.
- **Classification:** **Indirect** — the strongest single positive result for RIR-based load selection over fixed %1RM, in trained men, with a supervision caveat.

### SG-E-07 — Mann et al. 2010 (APRE vs linear periodisation)

- **Design (read from the paper):** retrospective comparison of two **consecutive off-season cohorts** — LP trained in 2004, APRE in 2005 — "trained by the same training staff"; **not randomised**; no attempt to match volume or intensity; IRB-approved retrospective analysis. 23 D-I football players (APRE n = 12, training age 2.9 ± 0.7 y; LP n = 11, 2.43 ± 0.7 y); 6 weeks pre-season.
- **APRE protocol (Table 2, 6RM version):** set 1 10 reps @ 50 % of the anticipated 6RM; set 2 6 reps @ 75 %; set 3 max reps @ 100 % of the anticipated 6RM; set 4 load adjusted from set-3 reps (0–2 reps: −5 to −10 lb; 3–4: 0 to −5; 5–7: no change; 8–12: +5 to +10; > 13: +10 to +15), and the set-4 result sets the next week's load.
- **Outcomes (abstract, verbatim):** bench press 1RM change **APRE 93.4 ± 103 N vs LP −0.40 ± 49.6 N (ANOVA F = 7.1, p = 0.02)**; estimated squat 1RM **192.7 ± 199 N vs 37.2 ± 155 N (F = 4.1, p = 0.05)**; repetitions at 225 lb 3.17 ± 2.86 vs −0.09 ± 2.40 (ANCOVA F = 6.8, p = 0.02). Effect sizes per SG-E-09 Table 1: APRE back squat 0.66 (+10 %), bench 0.83 (+7.1 %); LP 0.19 (+1.8 %) and 0 (−0.1 %).
- **Uncertainty:** different years, different athletes, unmatched volume, 1RMs *estimated* from ≤ 5-rep sets, huge SDs (bench SD > mean).
- **Bearing:** APRE is the classic **performance-of-an-earlier-set-sets-the-load-of-a-later-set** rule — the only trial-tested *cross-set dependency* found. Its superiority claim is weak evidence.
- **Classification:** **Indirect (weak)**.

### SG-E-08 — Shattock & Tee 2022 (RPE vs velocity)

- **Population / size / duration:** 20 amateur rugby union players; randomised crossover; two 6-week blocks; volume matched, intensity equivalent but prescribed by velocity (VB) or RPE.
- **Outcomes (abstract, magnitude-based inference):** CMJ VB "most likely +8.2, ±1.1 %" vs RPE "likely +3.8, ±0.9 %"; back squat VB "most likely +7.5, ±1.5 %" vs RPE "possibly +3.5, ±1.8 %"; bench VB "most likely +7.7, ±2.1 %" vs RPE "possibly +3.8, ±0.9 %"; sprints trivial. VB advantage: CMJ likely 4.2 ± 1.2 %, squat likely 3.7 ± 1.5 %, bench possibly 3.7 ± 1.5 %.
- **Uncertainty:** magnitude-based inference rather than NHST; whether the RPE arm used the RIR-anchored scale is not stated in the abstract (SG-E-09 classes it as RIR-based RPE); rugby players, not powerlifters.
- **Classification:** **Indirect** — RPE autoregulation worked; objective velocity worked better in this sample. Velocity is out of the app's scope.

### SG-E-09 — Larsen et al. 2021 (systematic review)

- **Scope:** 14 studies, 30 groups, 356 participants; 3 RIR/RIR-based-RPE, 1 APRE, 2 flexible non-linear periodisation, 3 velocity-target, 6 velocity-loss studies; search to August 2020; narrative synthesis with per-study Cohen's d.
- **Findings relevant here:** "All autoregulation training protocols resulted in an increase in 1-RM, from small ES to large ES." RIR/RPE groups on the back squat: two groups with ES 0.5–0.8, two < 0.5; front squat ES 0.51 (SG-E-06). The review attributes the discrepancy between SG-E-05 (not significant) and SG-E-06 (significant) to intervention length (8 vs 12 weeks) and to the different scales (RIR-based RPE with a 9.5 vs plain RIR) — speculation, labelled so by the authors.
- **Negative statement (p.4, verbatim):** "no studies have investigated the effects of RPE stops on 1-RM compared to a fixed volume programme."
- **Manual attribution (p.3):** "in Tuchscherer (2008), modified the Borg CR10 RPE scale, whereby RPE was determined by how many repetitions in reserve (RIR) the participant felt he or she had left before reaching failure." This is the only independent dating of SG-E-16 found.
- **Classification:** **Indirect** (review); the Ø-5 negative is a search result.

### SG-E-10 — Hickmott et al. 2022 (meta-analysis)

Re-used from the prior report (E1-E-18) and confirmed from the PMC full text: trained participants only; load autoregulation (6 studies) vs standardised — **MD 2.07 kg [95 % CI −0.32, 4.46], p = 0.09, SMD 0.21**; RPE/RIR subgroup MD 3.15 kg [−0.14, 6.45], p = 0.06, SMD 0.30; VBT subgroup MD 0.88 kg [−2.59, 4.34], p = 0.62, SMD 0.10. Volume autoregulation by velocity-loss threshold: ≤ 25 % vs > 25 % VL favoured strength, MD 2.32 kg [0.33, 4.31], p = 0.02, SMD 0.23; > 25 % VL favoured hypertrophy, MD 0.61 cm² [0.05, 1.16], p = 0.03. RPE/RIR primary studies: SG-E-06, SG-E-05, Arede et al. (youth). Conclusion (verbatim): "Autoregulated and standardized load prescription produced similar improvements in strength." **Classification: Indirect — the pooled answer to "RIR-based vs percentage-based" is a null with a lean.**

### SG-E-11 — Huang et al. 2025 (network meta-analysis)

Abstract verbatim: back squat — "no moderate/large effect sizes were observed between interventions"; SUCRA APRE 93.0 %, RPE 66.8 %, VBRT 27.0 %, PBRT 13.2 %. Bench press — "PBRT demonstrated a large effect vs APRE (SMD = −0.83, −1.22 to −0.44), while RPE showed a moderate effect vs APRE (SMD = −0.76, −1.70 to 0.19)"; SUCRA APRE 97.1 %, VBRT 57.1 %, RPE 29.9 %, PBRT 15.9 %. Conclusion claims APRE, VBRT and RPE "were significantly more effective than PBRT". **Uncertainty:** the squat ranking is not backed by credible pairwise differences; the bench APRE effect must rest heavily on SG-E-07, which is non-randomised; study counts not in the abstract. The prior report's Low–Moderate rating stands. **Classification: Indirect.**

### SG-E-12 — Schoenfeld et al. 2016 (varied vs constant loading)

19 trained men, 8 weeks; CONSTANT 8–12 RM every day vs VARIED 2–4 RM (day 1), 8–12 RM (day 2), 20–30 RM (day 3). "no differences noted between groups"; ES favoured VARIED for bench 1RM (0.80 vs 0.57), elbow-flexor thickness (0.72 vs 0.57), elbow-extensor thickness (0.77 vs 0.48), endurance (1.91 vs 1.28). **Bearing:** mixing rep ranges *across days* is not worse than a constant range and may be marginally better; nothing about mixing ranges *within a session*. **Classification: Indirect.**

### SG-E-13 — Carvalho et al. 2021 (strength phase then hypertrophy phase)

26 resistance-trained men; STHT = 3 weeks 4×1–3 RM then 5 weeks 4×8–12 RM vs HT = 8 weeks 4×8–12 RM. STHT greater vastus lateralis thickness (p = 0.049; 95 % CI 0.15–3.2 %; d = 0.81), back squat 1RM (p = 0.015; 1.5–13 %; d = 1.05), leg press (p = 0.044; 0.16–9.9 %; d = 0.79). **Bearing:** heavy-first *sequencing across blocks* helped strength and size in trained men; it is not a within-session top-set result. **Classification: Indirect.**

### SG-E-14 — Zourdos et al. 2016 (RIR-based RPE scale)

n = 29 (15 experienced, 5.2 ± 3.5 y; 14 novice, 0.4 ± 0.6 y); 1RM squat then singles at 60 / 75 / 90 % and 8 reps at 70 %. **Definition (verbatim):** "Subjects reported an RPE value that corresponded to an RIR value (RPE-10 = 0-RIR, RPE-9 = 1-RIR, and so forth)." Velocity–RPE r = −0.88 (experienced), −0.77 (novice). Experienced lifters rated 1RM higher (p = 0.023). "The RIR-based RPE scale is a practical method to regulate daily training load". **Classification: definition / measurement.**

### SG-E-15 — Helms et al. 2017 (load-selection accuracy in powerlifters)

12 powerlifters (9 M, 3 F, 18–49 y); 3 weeks; hypertrophy 8 reps @ RPE 8, power 2 @ 8, strength 3 @ 9; loads self-selected to hit the target. Mean absolute |reported − target| RPE **0.33 ± 0.28** (range 0.22–0.44). Bench closer to target for 3 @ 9 than 2 @ 8 (p = 0.05); squat power accuracy improved from week 1 (−0.46 ± 0.69) to week 3 (0.08 ± 0.29, p = 0.03). "It seems that powerlifters can accurately select loads to reach a prescribed RPE." **Bearing:** the *top-set task* — pick a load that lands at RPE 8–9 for 1–3 reps — is performed by experienced lifters to within about a third of an RPE point on average, which is inside the ±1-rep noise already in the registry (EVIDENCE-030). **Classification: Indirect (measurement).**

---

## 7. The Tuchscherer manual — what it actually says

### 7.1 Publication details and page mapping

- **Title page (RTM p.2, PDF 2):** "THE REACTIVE TRAINING SYSTEM — By Mike Tuchscherer". Cover (PDF 1): "The Reactive Training Manual — Developing Your Own Custom Training Program for Powerlifting — by Michael Tuchscherer". **No copyright page, ISBN, publisher, or year appears on any inspected page** (PDF 1–4, 41–43 inspected for this purpose; the back cover carries two testimonials and a small code that is not a date). Dating: the introduction says "After USAPL Collegiate Nationals in 2006, a few of my teammates … and I, developed, and began doing Reactive Training" (RTM p.4, PDF 3), so ≥ 2006; the filename says 2008; SG-E-09 cites "Tuchscherer (2008)"; the brief reports PDF creation metadata of 2009, which is not publication evidence. **Publication year: 2008, uncertain — corroborated by one independent citation only.**
- **Mapping (derived and verified):** PDF page 1 = front cover; PDF page 43 = back cover; for 2 ≤ k ≤ 42, **PDF page k holds printed pages 2k−3 (left) and 2k−2 (right)**. Verified against the printed folios at PDF 2 (1–2), 3 (3–4), 4 (5–6), 8 (13–14), 10 (17–18), 12 (21–22), 28 (53–54), 30 (57–58), 32 (61–62), 41 (79–80), 42 (81–82); no deviation found. Contents-page targets resolve as: RPEs p.14 → PDF 8; Fatigue Stops p.18 → PDF 10; Tracking p.22 → PDF 12; Fatigue Percents Part One p.54 → PDF 28 (chapter heading actually on p.55, PDF 29); Part Two p.58 → PDF 30 (heading actually on p.59, PDF 31); Programming Your Training Cycle p.62 → PDF 32 (heading on p.63, PDF 33). The printed contents list is therefore off by one page for chapters 11–13 relative to where the headings sit.
- **Pages inspected:** PDF 1–33 and 41–43 (printed 1–64 and 79–82 plus covers). **Not inspected:** PDF 34–40 (printed 65–78: remainder of Chapter 13, Chapter 14 "Goal Setting, PRs, and Progress", Chapter 15 "Extra Workouts"). Nothing below cites them.
- **Legibility:** every inspected page was fully legible at the Read tool's rendering; the gutter darkens on PDF 27–29 (printed 51–56) without obscuring text; the two RPE-chart tables (p.16) and the two fatigue tables (p.55, p.61) were read cell by cell. No illegible passage was encountered, so no citation below rests on inference from a gap. OCR was not available and was not used.

### 7.2 Who the manual is for

"RTS is not for beginners. It was designed specifically to take intermediate lifters and bring them through to an advanced stage of training." (RTM p.5, PDF 4). The base template alternates 3-week **Volume** and **Intensity** blocks (RTM p.10–11, PDF 6–7); a MesoCycle is one of each (RTM p.11).

### 7.3 How the manual defines RPE — RIR-anchored, integer scale

RTM p.14–15 (PDF 8–9):

> "10- Maximal. No reps left in the tank.
> 9- Last rep is tough, but still 1 rep left in the tank.
> 8- Weight is too heavy to maintain fast bar speed, but is not a struggle. 2-4 reps left.
> 7- Weight moves quickly when maximal force is applied to the weight. 'Speed weight'
> 6- Light speed work. Moves quickly with moderate force.
> 5- Most warm-up weights.
> 4- Recovery. Usually 20+ rep sets. …
> RPEs below 4 are not important."

"An easy way to gauge the RPE of a set is to ask yourself how many more reps you could've done with a particular weight." (p.15). The scale is **RIR-anchored at 10 and 9** (0 and 1 RIR) and **band-anchored at 8** ("2-4 reps left"); 7 and below are bar-speed descriptions, not RIR. **No half-points (9.5, 8.5) appear in the manual**; those belong to the later RTS material and to SG-E-14's descendants. The manual's rationale for RPE over percentages is the daily-readiness argument (p.14): percentages "are very limited in how accurate they can be… The longer you go in a training cycle, the less accurate they become".

**Difference from the Zourdos scale (SG-E-14):** same anchors at 10 and 9; Zourdos makes 8 = 2 RIR, 7 = 3 RIR ("and so forth"), whereas the manual makes 8 a 2–4-rep band and 7 a speed descriptor. An app mapping RTM's "8" to a single RIR value would be inventing precision the source does not have.

### 7.4 The RPE-to-percentage chart — a guide, not a load calculator

RTM p.16 (PDF 9), transcribed from the image and checked cell by cell:

| RPE | 12 reps | 10 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 62 | 66 | 71 | 74 | 77 | 80 | 85 | 90 | 95 | 100 |
| 9 | 60 | 64 | 68 | 71 | 74 | 77 | 80 | 85 | 90 | 95 |
| 8 | 58 | 62 | 66 | 68 | 71 | 74 | 77 | 80 | 85 | 90 |
| 7 | 56 | 60 | 64 | 66 | 68 | 71 | 74 | 77 | 80 | 85 |

The author's own framing (p.16): "a chart that I developed that **roughly** correlates an RPE and rep range to a percentage. **It should only be used as a guide, not to attempt to derive a max.**" And: "80% is where peak force is produced. Be careful with how much time you spend in the 90%+ area. The closer you are to the upper right corner, the more accurate the chart is." Chapter 4 then uses it to estimate a 1RM ("425 / .80") with the caveat "this way of 'estimating your 1RM' is not totally accurate, and is not without error (sometimes significant error). … Just use it as a way to see overall trends" (RTM p.22, PDF 12), and to compute "average intensity" per set against that estimate (RTM p.24, PDF 13: "315x3 @9 … corresponds to 85%… 315/85% = 370… a set at 275, the intensity will be 275/370 = 74%").

### 7.5 Protocols — how "top set" work is expressed

The manual never uses "top set" or "back-off". Its Intensity-block protocols (RTM p.11, p.17, p.20) are "1 to 3 Rep Max", "3x3 @9-10", "4x2 @9-10", "4 to 5x1 @9-10" — later rewritten without set counts as "Triples @9-10 / Doubles @9-10 / Singles @9-10" once fatigue stops are introduced (p.20). Volume-block examples: "6x3 @8-9", "5x5 @9-10", "8x2 @6-7 then work up to 1x2 @8-9". The heaviest set of a day is called the **"initial"** (p.56–57).

### 7.6 Fatigue Stops (Chapter 3, RTM p.18–21, PDF 10–11) — a stop rule, not a load rule

"A Fatigue Stop is a way of telling when you have done an amount of volume to stimulate your muscles for the day." (p.18). "You need to throw out the notion of counting sets" (p.18). "When there is a downward trend in your strength levels, then you have reached your Fatigue Stop." (p.19). Worked examples (p.19): triples @ 8–9 — "You do 3 sets [at 315] and they are an 8. Then you do one more set and it is a 9. You've hit your Fatigue Stop"; or 315 @ 8 → 355 @ 9 → "If you do one more set at 355 and it is a 10, then you've hit your Fatigue Stop. If you drop back to 315 and it is now a 9 also, you've hit your Fatigue Stop." "A Fatigue Stop is when your strength is now decreasing within a workout. Oftentimes, you see this through your RPEs." (p.20). Result: "there are no numbers of sets for any of the protocols except the end of speed work… you will now auto-regulate your own volume based on the fatigue you are inducing" (p.20). Recap (p.21): "you don't count sets, you work at the specified reps and RPE until you begin to fatigue, then you move on."

What this is: a **per-exercise stop condition driven by RPE drift at constant load (or on a drop-back)**, applied to the *same* reps-and-RPE protocol — the subsequent sets are not a differently-prescribed group. What it is not: a percentage back-off.

### 7.7 Fatigue Percents (Chapters 11–12, RTM p.55–62, PDF 29–32) — a *measured* drop from the day's initial, with a stop, inside a time cap

Table (p.55, PDF 29): Very High Stress **10 %** fatigue (30–35 min); High **7 %** (25–28 min); Medium **5 %** (20–22 min); Low **3 %** (18–20 min); Deload **0 %** (15–18 min). "these percentages hold true with any of the templates provided in this manual, or any template that has 6 exercises for both upper body push muscles and lower body muscles in each week" (p.55); for other slot counts, scale by 6 / slots (p.59, PDF 31: "5% * 6 slots = 30% per week for bench. Divide that by the 4 slots… ~9%").

Worked example (p.56, PDF 29), verbatim: "let's assume that the protocol you picked for this example was Triples @ 9-10 RPE. You know that you want to do High Stress, which is 7% fatigue. Now your work sets start… 385x3 @9 / 405x3 @9 / 425x3 @10 which is as high as you will go for today. This set represents your 'initial'. You take 7% of this weight (425*0.07 = 29) and subtract it from your initial. That leaves you with 395-ish. **This tells you that when 395x3 becomes a 10 RPE, then you have achieved a 7% fatigue drop and you are done with this exercise.**" Then "415x3 @10 (see, fatigue is setting in) / 405x3 @10 / 395x3 @10 (this is your stopping point. You are done)". Second example (p.57, PDF 30): "395x3 @9 / 395x3 @10 (again, you're done)".

Author's commentary (p.57): "In the first example, you slowly work down the weight. This method will achieve the fatigue faster (usually), so it is better when used for Intensity-Focused Blocks. In the second example, you dropped the weight down all at once and did more Volume at the lower Intensity (naturally, this is better for Volume Blocks). **Both ways can be effective, so be sure to include both.** Also remember that when the time runs out, you're done with that exercise, regardless of where you're at!" "set your initial before the half way point of your time" (p.57). Time limits exist because without them "the Fatigue Percents become much less accurate" (p.57). Prerequisite: "Start using this method… when you have been doing Fatigue Stops for 7-9 months" (p.58). Individual adjustment: "If you don't feel fully recovered, then adjust the percent down by 1-2% per workout until you do feel recovered" (p.60, PDF 31).

**Alternative measurement by repetition loss (p.61, PDF 32),** transcribed cell by cell — "NL for Initial" = reps on the initial set; columns = 1 / 2 / 3 reps fewer on a later set at the same load and RPE:

| Reps on initial | 1 rep less | 2 reps less | 3 reps less |
|---|---|---|---|
| 1 | 5 % | | |
| 2 | 5 % | 10 % | |
| 3 | 4 % | 8 % | 12 % |
| 4 | 4 % | 8 % | 12 % |
| 5 | 3 % | 6 % | 9 % |
| 6 | 3 % | 6 % | 9 % |
| 7 | 3 % | 6 % | 9 % |
| 8 | 2.5 % | 5 % | 7.5 % |
| 9 | 2.5 % | 5 % | 7.5 % |
| 10 | 2 % | 4 % | 6 % |
| 11 | 2 % | 4 % | 6 % |
| 12 | 2 % | 4 % | 6 % |

"this is for equal RPEs also. If you did your first set with 500 for a triple at a 9 RPE, then your second set was 500 for a triple at a 10 RPE, you should be able to infer a 1 rep drop (due to the very definition of the RPEs)" (p.61–62).

**So, precisely:** a fatigue percent is (a) chosen from a stress level, (b) measured as a percentage **of the initial's load** (2008 manual) — or, per SG-E-17, of the **estimated 1RM** derived from each set's load/reps/RPE (2016 restatement) — (c) reached either by working the load down until the reduced load hits RPE 10 for the same reps, or by dropping once and repeating until RPE 10, or (2016) by holding load and dropping reps, and (d) capped by a time limit. **It is not "do N sets at X % of the top set."** The percentage is a *fatigue target that determines when to stop*, and the load drops are the lifter's means of getting there.

### 7.8 The one fixed-drop pattern the manual gives — and its own verdict

Wave loading (RTM p.37, PDF 20): "Work up to a heavy weight (let's say a triple @ 9 RPE), then drop the weight back (usually 20-50 pounds) and work back up over the course of two or three sets. You should be able to add some weight (10+ pounds) on your initial set point, again, barring fatigue's interference. I've seen a few nationally ranked weightlifters set PRs with this method. The Powerlifters I have trained have met varied levels of success with this method. **It may work for you – it may not. Give it a try and see.**"

### 7.9 Later RTS restatement (SG-E-17, fetch-summary)

"Fatigue Percents Revisited" (15 June 2016) redefines the reference as the **estimated 1RM** ("it is possible to reasonably estimate a 1RM on most sets given the load, number of reps, and RPE of the set"), lists three ways to reach the target after the initial — **load drop** ("drop the bar weight by the specified percentage"), **repeats** ("repeat the same load and reps on subsequent sets. As fatigue rises, your RPE will also rise"), **rep drops** ("keep the load on the bar the same and reduce the number of reps") — uses 5 % as its running example, and states the limitation "This method is limited by how accurate you can be with a certain RPE." The exact stopping-condition sentence was not read verbatim and is not quoted.

### 7.10 Evidence status of the manual

Practitioner methodology by a competitive powerlifter-coach, written for intermediate-to-advanced powerlifters, with no controlled comparison anywhere in it; the back-cover testimonials (Eric Talmant, Mark Bell) and the author's own totals are **not causal evidence**. Its RPE definition is the historical origin of the RIR-anchored RPE scale later formalised by SG-E-14 (per SG-E-09), which is the one place the manual and the research literature are the same lineage.

---

## 8. Answers to Q1–Q4, with classification

| # | Question | Answer | Classification |
|---|---|---|---|
| Q1 | Direct evidence for top-set + back-off structures and maximal strength in trained lifters | **None found that is controlled against a structural alternative (bounded search, §3; §5.3 Ø-1, Ø-6).** SG-E-01 shows *adding* 2×3 @ 80 % of a near-max single beats the single alone (n = 8/8, quasi-randomised, volume-confounded); SG-E-03 shows daily max + 5 back-offs at 85–90 % of the daily max raised squat 1RM in 3 lifters (uncontrolled); SG-E-04 shows the structure is usable and its volume responds to the drop percentage (no strength outcome); SG-E-09 records no RPE-stop-vs-fixed-volume study. | **Unresolved** for the structural question; **Indirect** support that back-off work after a heavy set is productive |
| Q2a | Heavier-load exposure (beyond Lopez) | SG-E-13: a 3-week 4×1–3 RM phase before hypertrophy work outperformed 8 weeks of hypertrophy work for both 1RM (d = 1.05) and thickness (d = 0.81) in trained men. SG-E-01/02: heavy singles alone give small, unreliable gains in 6–10 weeks. | **Indirect** (EVIDENCE-009 remains the primary basis) |
| Q2b | Additional moderate-load volume after heavy sets | SG-E-01 (the +22 kg difference between MAX and MAX+back-off); EVIDENCE-002 (volume → strength, plateau ≈ 5 fractional sets/week) and ACSM's ~2–3 sets/exercise plateau are the population-level context. | **Indirect** |
| Q2c | RIR/RPE autoregulation of load | SG-E-05 (small, n.s. lean), SG-E-06 (significant, unsupervised), SG-E-08 (works; velocity better), SG-E-10 (pooled null, p = 0.09; RPE/RIR p = 0.06), SG-E-11 (ranks above percentages; no credible squat pairwise effect), SG-E-09 (all methods raise 1RM). | **Indirect — mixed; "at least as good, possibly slightly better"** |
| Q2d | Mixed repetition ranges | SG-E-12: varied-across-days = constant, ES lean to varied; SG-E-13: heavy block first > hypertrophy only. No within-session mixed-range trial found. | **Indirect** |
| Q3 | Back-offs from the day's performed top set vs fixed %1RM vs other approaches | **Ø-1: no direct comparison.** All retrieved back-off protocols derive from the day's performance. APRE (SG-E-07) is the only trial-tested cross-set dependency and is non-randomised. Session-level autoregulated vs percentage evidence is mixed (Q2c). | **Unresolved**; APRE **Indirect (weak)** |
| Q4a | Particular percentages of the top set | 80 % of an RPE 9–9.5 single for 2×3 at RPE ≈ 6–7 (SG-E-01) is the only tested value; 85/90 % of a daily 1RM for 5×3 / 5×2 (SG-E-03, uncontrolled); 2/4/6 % below the top set with an RPE stop (SG-E-04, volume only); 3–10 % fatigue-percent drops (SG-E-16, practitioner); 20–50 lb wave drop (SG-E-16, practitioner, self-described as hit-or-miss); "10–30 %" (coaching pages, not evidence). | **Unresolved** (Ø-2); one **Indirect** data point |
| Q4b | Group counts / back-off set counts | Ø-3. Tested: 1 + 2, 1 + 5, 1–2 + stop. | **Unresolved** |
| Q4c | Progression rules | Ø-4 for cross-group rules. Per-group: EVIDENCE-031/B9 (load vs rep progression equivalent); EVIDENCE-015/B1 (target RIR, adjust load — a pattern, not validated). | **Unresolved** for linked rules; per-group choice **Indirect** |

---

## 9. Conflicts between the manual and the research, and which governs

| # | Manual position | Research position | Governing evidence and why |
|---|---|---|---|
| 1 | RPE-based loading is *better* than percentage programs because percentages cannot track daily and cyclical readiness (RTM p.14) | Pooled comparison is null with a lean (SG-E-10: MD 2.07 kg, p = 0.09); one 12-week RCT positive (SG-E-06), one 8-week RCT not significant (SG-E-05); NMA ranking favours autoregulation without credible squat pairwise effects (SG-E-11) | **Research governs**: RIR-based load selection may be *represented* as a first-class option and described as "at least as effective, possibly slightly better"; it may **not** be described as proven superior. The manual's rationale is retained as practitioner rationale for *why* a user might prefer it. |
| 2 | The RPE chart maps reps × RPE to %1RM (RTM p.16), with the author's own "guide only" caveat | Reps at a %1RM vary between individuals (SD 2.51 reps at 80 %) and by exercise (EVIDENCE-032, provisional); three reference tables disagree by several RIR (§10) | **Research governs, and the manual agrees with itself here**: the chart must never be used by the app to derive one group's load from another's RIR silently. |
| 3 | Do not count sets; stop on fatigue (RTM p.18–21) or at a fatigue percent (p.55–58) | RPE-stop volume rules change volume predictably (SG-E-04) but have never been tested for 1RM against fixed set counts (SG-E-09, Ø-5); velocity-loss volume rules: ≤ 25 % VL favours strength (SG-E-10) — a different instrument | **Unresolved; neither governs.** A stop rule is legitimate to represent (it exists in the literature and in practice) but carries no outcome evidence; a fixed set count is equally legitimate. RIR noise of ±1 rep (EVIDENCE-030, A15) means a stop keyed to "RPE hits 10" will fire early or late by about a rep. |
| 4 | Fatigue percents of 3–10 % tied to stress levels and time caps (RTM p.55) | No study tests fatigue percents; the closest structure (SG-E-04) used 2/4/6 % drops *as a prescription* rather than as a measured fatigue target | **Practitioner rationale only.** Must not seed a default. |
| 5 | The system is for intermediate–advanced lifters, not beginners (RTM p.5) | RIR accuracy is not clearly moderated by training status in the best pooled synthesis (EVIDENCE-033, provisional) but experienced lifters rate maximal efforts higher/more precisely (SG-E-14, p = 0.023) and practised powerlifters hit a target RPE within ≈ 0.33 (SG-E-15) | **Not load-bearing** for a single-user app whose owner is experienced; recorded for completeness. |
| 6 | An estimated 1RM from the chart is "not without error (sometimes significant error)… use it… to see overall trends" (RTM p.22) | ≈ ±10 % individual error on any estimated 1RM (A14, provisional) | **Agreement.** Consistent with ADR-011's advisory-only estimate. |
| 7 | 3-week Volume / Intensity block alternation (RTM p.10–11) | Periodisation gives a small, fragile strength benefit; undulating > linear only in trained lifters (EVIDENCE-017/018); no block length evidenced | **Research governs the claim size**: variation is weakly supported; the 3-week figure is practitioner convention. Outside PI-012 V1 scope ("no new mesocycle logic"). |

No case was found where a credible, directly relevant study *contradicts* the manual's method outright — the manual's substantive rules (fatigue stops, fatigue percents, wave loading) simply have **no** outcome evidence for or against them. Where the manual makes a comparative claim (row 1), the research is mixed and governs the wording.

---

## 10. Arithmetic on the owner's example — labelled as arithmetic, not evidence

The owner's example: top group 1 × 2 @ RIR 2; back-off group 2 × 6–8 @ RIR 2–3, "optionally at 80 % of the top-set load". Three published reps-at-%1RM references give three different answers to whether those two specifications agree. Each row converts the top double @ RIR 2 (≈ a 4RM) into %1RM, takes 80 % of it, and asks what a set of 6–8 at that load would feel like.

| Reference | Double @ RIR 2 as %1RM | 80 % of that | 6–8 reps @ RIR 2–3 as %1RM | Implied RIR for 6–8 reps at the derived load |
|---|---|---|---|---|
| RTS chart (RTM p.16; 2 reps @ RPE 8 = 85 %; 6 @ RPE 8 = 71 %, 8 @ RPE 7 = 64 %) | 85 % | **68 %** | 64–71 % | ≈ 2–3 RIR — **consistent** |
| Epley (1RM = w·(1 + r/30); 4RM = 88.2 %; 8RM = 78.9 %; 11RM = 73.2 %) | 88.2 % | **70.6 %** | 73–79 % | ≈ 4–5 RIR — **lighter than the band** |
| Nuzzo et al. 2024 pooled points (E1-E-02: ≈ 5 reps @ 90 %, ≈ 10 @ 80 %, ≈ 15 @ 70 %; SD 2.51 reps at 80 %) | ≈ 90 % (4RM ≈ 88–90 %) | **≈ 71–72 %** | ≈ 78–85 % (8–11RM) | ≈ 6–9 RIR, ± 2–4 reps individually — **much lighter than the band** |

For comparison, SG-E-01's tested pairing was 80 % of an RPE 9–9.5 single (≈ 96–98 % 1RM under any table) → ≈ 77–78 % 1RM for triples, which the lifters rated RPE ≈ 6–7 (3–4 RIR) — between the Epley and Nuzzo predictions.

**What this shows** (and all it shows): a percentage-of-top-set rule and a RIR band are **two different prescriptions** that coincide only under one particular table, and the between-individual scatter (EVIDENCE-032) is wider than the gap between the tables. A builder that lets the user specify both must decide — or, better, let the user decide — which one governs the set when they disagree, and must not silently "correct" one from the other. This is the same conclusion `estimated-1rm-evidence-research.md` §13 reached for load translation, arrived at from the set-group side.

---

## 11. Translation for the builder

### 11.1 What the builder should be able to REPRESENT (legitimate use supported by evidence or documented practice)

| Capability | Basis | Status of basis |
|---|---|---|
| An ordered list of groups within one exercise prescription, each with its own set count **or set-count range**, rep target or range, and target RIR band | SG-E-04 (top set, optional second top set, back-offs), SG-E-01 (1 + 2), SG-E-03 (1 + 5), SG-E-06 (single RIR-banded groups per phase); PI-012 owner scope | Structure exists in trials and practice |
| A top group with set-count range 1–2 ("a second top set was performed if the RPE score was too low") | SG-E-04 verbatim | Practice in nationally qualified powerlifters, no outcome |
| A group's load basis being **independent** (V1) | SG-E-06 (each session's load chosen to a RIR target with no cross-set link) | Trial-tested |
| A group's load basis being **derived** from another group's **performed** load by a user-entered percentage (deferred beyond V1) | SG-E-01 (80 % of the performed single), SG-E-03 (85 / 90 % of the daily 1RM), SG-E-04 (2 / 4 / 6 % below the performed top set) | Trial-tested as *protocols*, not as *better than alternatives* |
| … or from a **planned** load / absolute offset | Wave loading (RTM p.37: 20–50 lb below a heavy triple); coaching convention | Practitioner only |
| An optional per-group **stop rule** keyed to reported RIR/RPE ("stop when a set reaches RIR 0", "stop when RPE exceeds the band") | SG-E-04 RPE stop; RTM fatigue stop (p.18–21) and fatigue percent (p.55–58); SG-E-17 | Practice; volume behaviour measured (SG-E-04); no 1RM outcome (Ø-5) |
| A **per-group progression strategy**, selectable (load progression, rep progression, RIR-target adjustment) | EVIDENCE-031 / B9 / C7; EVIDENCE-015 / B1 | Registry |
| Recording which group a logged set belongs to, so that per-group evidence is not pooled | Implied by every protocol above (top-set RPE and back-off RPE are different quantities) | Design consequence, not evidence |
| Explicitly **not** intra-set cluster / rest-pause structures | Brief; excluded PMC8041766 | Scope rule |

Limited evidence is **not** a blocker for any of these: each is either trial-tested as a protocol, a documented practice in qualified lifters, or a registry-backed strategy choice. Representing them asserts nothing about superiority.

### 11.2 What could justify a SUGGESTED DEFAULT

- **Percentage of the top set:** **no evidence-derived default.** One tested value (80 % of a near-maximal single, for triples at RPE ≈ 6–7) from one 8-per-group quasi-randomised study at one top-set intensity; the coaching "10–30 %" range is convention. If the product wants a worked example it must be labelled "example, practitioner convention", not "recommended".
- **Group count / back-off set count:** **no evidence-derived default** (Ø-3). Population-level context only: strength volume plateaus around 2–3 sets per exercise (ACSM 2026 citing Swinton) and ≈ 5 fractional sets/week (EVIDENCE-002, preprint).
- **RIR bands:** no set-group-specific default. Existing registry framing already applies per group: RIR is not a strength lever (EVIDENCE-011), 0–2 RIR is a defensible hypertrophy framing (B10), any RIR-keyed rule must tolerate ±1 rep (B11).
- **Cross-group progression rule:** **no evidence-derived default** (Ø-4).
- **Load basis (independent vs derived; planned vs performed):** **no evidence-derived default** (Ø-1). PI-012's V1 choice of independent groups is evidence-consistent; a later derived basis would also be evidence-consistent; nothing distinguishes them empirically.
- **Stop rule on/off:** **no evidence-derived default** (Ø-5). Off (fixed counts) and on (RPE stop) are both practised.

### 11.3 What should remain USER-DEFINED

The percentage or offset and its rounding; whether a derived load references the planned or the performed top set, and what happens when the top set is skipped, failed, or repeated; the number of groups and the set count / range of each; each group's rep range and RIR band; which specification governs when a derived percentage and a RIR band disagree (§10); each group's progression strategy; whether a stop rule is active and its threshold; block placement (the manual's Volume/Intensity distinction is a user's programming choice, outside PI-012 V1). None of these has a research-determined value, and several have documented practitioner alternatives that contradict each other (fixed drop vs fatigue-measured drop vs repeats).

### 11.4 Copy boundaries

No in-app text may say that top-set/back-off programming, RIR-based load selection, percentage-derived back-offs, or RPE/fatigue stops **improve** strength outcomes relative to alternatives. Permitted: "a common way to structure heavy work", "used in studies of powerlifters", "adjusts to how the top set went today". This mirrors GAP-12's boundary for load translation.

---

## 12. Not done / not claimed

- **No registry promotion.** No `EVIDENCE-` row, no research note, no change to `docs/evidence/*`, `docs/research-notes/*`, `docs/BACKLOG.md`, `docs/ROADMAP.md`, or `docs/STATUS.md`. §5.1 sources are candidates only; SG-E-10 and SG-E-11 were already recorded as candidates by the prior report (E1-E-18/19) and remain unpromoted.
- **No note written for the manual**, and no OCR or transcription of it beyond the passages quoted; PDF pages 34–40 (printed 65–78) were not inspected.
- **No full-text, page-by-page read** of SG-E-01, SG-E-04, SG-E-05, SG-E-08, SG-E-10, SG-E-11, SG-E-12, SG-E-13, SG-E-14, SG-E-15, SG-E-17 — abstracts and fetch-summaries as marked in §3.4 and §6. Before any of these enters the registry, the numbers marked "fetch-summary" (SG-E-01 Study 3/4 in particular) must be re-checked against the paper at page locations.
- **Not searched:** velocity-based prescription as a design option (out of the app's measurement scope); intra-set cluster/rest-pause; PAPE; hypertrophy outcomes of set structures; injury risk of heavy singles (GAP-10 stands); youth, older, or clinical populations; non-English literature; grey literature beyond the two RTS documents; the Zourdos 2016 DUP-ordering paper; the "Emerging Strategies" RTS material (only "Fatigue Percents Revisited" was retrieved).
- **Not verified:** the manual's publication year beyond one independent citation; whether SG-E-08's RPE arm used the RIR-anchored scale; SG-E-17's exact stopping-condition wording; study and participant counts inside SG-E-11.
- **Not claimed:** any "optimal" structure, percentage, count, or progression rule; any superiority of the owner's proposed structure; any inference about the owner's own response.
- **Not run:** any quality gate. The change class is documentation-only and `docs/` is listed in `.prettierignore`, so per `agent-workflow.md` §5 no `format:check` applies to this file. No test, build, lint, or database command was executed.

---

## 13. Drop what you created, list what you did not

- **Created in the repository:** `docs/reviews/set-groups-strength-evidence-research.md` (this file) — kept, unstaged.
- **Created in the session scratchpad:** the directory `…\scratchpad\research\` was created at the start for page renders; no file was ever written into it (the Read tool rendered pages directly), and it was removed after this report was written.
- **Left behind by the fetch tool, outside the repository:** three PDFs saved automatically under the harness's tool-results directory (`webfetch-…-as4jof.pdf` = Graham & Cleather accepted manuscript; `webfetch-…-zcc20w.pdf` = Larsen et al. 2021 PeerJ; `webfetch-…-voop5j.pdf` = Mann et al. 2010). They are harness artefacts, not repository files; left in place because the harness owns that directory.
- **Not created:** no disposable database (none needed — no `gymapp_t_*`), no scratch script, no OCR output, no note, no registry row.
- **Untouched:** `docs/research/The Reactive Training Manual_ Developing Your Own Custom-Michael Tuchscherer-2008.pdf` — 6,043,652 bytes, last modified 2026-09-11 23:24:45 before and after this task; still untracked and unstaged. Every pre-existing dirty path in the header is untouched.

---

## 14. Full source list

1. Androulakis-Korakakis P, Michalopoulos N, Fisher JP, Keogh J, Loenneke JP, Helms E, Wolf M, Nuckols G, Steele J. The Minimum Effective Training Dose Required for 1RM Strength in Powerlifters. *Front Sports Act Living.* 2021;3:713655. https://doi.org/10.3389/fspor.2021.713655
2. Androulakis-Korakakis P, Fisher JP, Kolokotronis P, Gentil P, Steele J. Reduced Volume 'Daily Max' Training Compared to Higher Volume Periodized Training in Powerlifters Preparing for Competition—A Pilot Study. *Sports (Basel).* 2018;6(3):86. https://doi.org/10.3390/sports6030086
3. Zourdos MC, Dolan C, Quiles JM, et al. Efficacy of daily one-repetition maximum training in well-trained powerlifters and weightlifters: a case series. *Nutr Hosp.* 2016;33(2):437–443. https://doi.org/10.20960/nh.129
4. Helms ER, Cross MR, Brown SR, Storey A, Cronin J, Zourdos MC. Rating of Perceived Exertion as a Method of Volume Autoregulation Within a Periodized Program. *J Strength Cond Res.* 2018;32(6):1627–1636. https://doi.org/10.1519/JSC.0000000000002032
5. Helms ER, Byrnes RK, Cooke DM, et al. RPE vs. Percentage 1RM Loading in Periodized Programs Matched for Sets and Repetitions. *Front Physiol.* 2018;9:247. https://doi.org/10.3389/fphys.2018.00247
6. Graham T, Cleather DJ. Autoregulation by "Repetitions in Reserve" Leads to Greater Improvements in Strength Over a 12-Week Training Program Than Fixed Loading. *J Strength Cond Res.* 2021;35(9):2451–2456. https://doi.org/10.1519/JSC.0000000000003164 (accepted manuscript: https://research.stmarys.ac.uk/id/eprint/3067/)
7. Mann JB, Thyfault JP, Ivey PA, Sayers SP. The Effect of Autoregulatory Progressive Resistance Exercise vs. Linear Periodization on Strength Improvement in College Athletes. *J Strength Cond Res.* 2010;24(7):1718–1723. https://doi.org/10.1519/JSC.0b013e3181def4a6
8. Shattock K, Tee JC. Autoregulation in Resistance Training: A Comparison of Subjective Versus Objective Methods. *J Strength Cond Res.* 2022;36(3):641–648. https://doi.org/10.1519/JSC.0000000000003530
9. Larsen S, Kristiansen E, van den Tillaar R. Effects of subjective and objective autoregulation methods for intensity and volume on enhancing maximal strength during resistance-training interventions: a systematic review. *PeerJ.* 2021;9:e10663. https://doi.org/10.7717/peerj.10663
10. Hickmott LM, Chilibeck PD, Shaw KA, Butcher SJ. The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy: A Systematic Review and Meta-Analysis. *Sports Med Open.* 2022;8:9. https://doi.org/10.1186/s40798-021-00404-9
11. Huang Z, Sun J, Li D, Chen C, Wang D. Autoregulated resistance training for maximal strength enhancement: A systematic review and network meta-analysis. *J Exerc Sci Fit.* 2025;23(4):360–369. https://doi.org/10.1016/j.jesf.2025.07.006
12. Schoenfeld BJ, Contreras B, Ogborn D, Galpin A, Krieger J, Sonmez GT. Effects of Varied Versus Constant Loading Zones on Muscular Adaptations in Trained Men. *Int J Sports Med.* 2016;37(6):442–447. https://doi.org/10.1055/s-0035-1569369
13. Carvalho L, Junior RM, Truffi G, Serra A, Sander R, De Souza EO, Barroso R. Is stronger better? Influence of a strength phase followed by a hypertrophy phase on muscular adaptations in resistance-trained men. *Res Sports Med.* 2021;29(6):536–546. https://doi.org/10.1080/15438627.2020.1853546
14. Zourdos MC, Klemp A, Dolan C, et al. Novel Resistance Training-Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve. *J Strength Cond Res.* 2016;30(1):267–275. https://doi.org/10.1519/JSC.0000000000001049
15. Helms ER, Brown SR, Cross MR, Storey A, Cronin J, Zourdos MC. Self-Rated Accuracy of Rating of Perceived Exertion-Based Load Prescription in Powerlifters. *J Strength Cond Res.* 2017;31(10):2938–2943. https://doi.org/10.1519/JSC.0000000000002097
16. Tuchscherer M. *The Reactive Training Manual: Developing Your Own Custom Training Program for Powerlifting.* Self-published, c. 2008 (year uncertain; see §7.1). Local scan: `docs/research/The Reactive Training Manual_ Developing Your Own Custom-Michael Tuchscherer-2008.pdf`.
17. Tuchscherer M. Fatigue Percents Revisited. Reactive Training Systems, 15 June 2016. https://store.reactivetrainingsystems.com/blogs/advanced-concepts/fatigue-percents-revisited
18. Nuzzo JL, Pinto MD, Nosaka K, Steele J. Maximal Number of Repetitions at Percentages of the One Repetition Maximum: A Meta-Regression and Moderator Analysis of Sex, Age, Training Status, and Exercise. *Sports Med.* 2024;54(2):303–321. https://doi.org/10.1007/s40279-023-01937-7 — used in §10 only, via the prior report's E1-E-02 / the provisional EVIDENCE-032; not re-retrieved.

Repository documents relied on (not re-derived): `docs/reviews/estimated-1rm-evidence-research.md`; `docs/evidence/evidence-registry-reviewed.md`; `docs/evidence/product-evidence-boundaries.md`; `docs/evidence/research-gaps.md`; `docs/research-notes/README.md` and the ten notes named in the brief; `docs/BACKLOG.md` §PI-012, §PI-013; `docs/process/agent-workflow.md`; `docs/process/templates/report-header.md`.

---

## 15. Revision 2026-09-12 — corrections from the independent review

Source: `set-groups-architecture-review.md` §2, findings L-6 / L-7 / L-8. One line per correction:

- **L-6 (§1 "Direct evidence", §8 Q1 row):** both absolute statements reworded to the bounded form the `Ø` table (§5.3) already uses — no such trial *was found by this bounded search* (§3), rather than an assertion that none exists; substance unchanged.
- **L-7 (§7.3, §7.4):** the scan citations for printed pp.15–16 corrected from "(PDF 8)" to "(PDF 8–9)" in §7.3 (which also draws on p.14, PDF 8) and "(PDF 9)" in §7.4, per the mapping verified in §7.1; re-checked read-only against the scan: PDF 8 = printed 13–14 (Chapter 2 opens on p.14), PDF 9 = printed 15–16 (the RPE scale list and the forty-cell RPE/percentage chart). No quoted text or chart cell changed; the §7.1 contents-target note ("RPEs p.14 → PDF 8") was already correct and is unchanged.
- **L-8 (§6 SG-E-01, "Uncertainty / limitations"):** "≈ 600 % more volume" relabelled as this report's own per-session repetition arithmetic (1 rep vs 1 + 2×3 = 7 reps), not a figure the study reports, consistent with §10's labelling discipline.

No other content of this report changed. No new literature search was run; nothing was promoted into `docs/evidence/*`; no `docs/research-notes/*` file was edited. The PDF under `docs/research/` was opened read-only for the L-7 check and is unchanged and unstaged.
