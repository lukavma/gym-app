# Estimated 1RM Tracker & Load Translation — Independent Evidence Research

Date: 2026-09-05
Role: independent evidence research for the proposed **Estimated 1RM Tracker and Load Translation** feature. Research only — no code, no schema, no implementation, no commit, no deployment, no production access.
Repository state read: `main` @ `7d6bc6c` (`feat: add reusable warm-up routines`), with the pre-existing uncommitted working tree left untouched. A second agent may have been working on the Warm-up Set Classification fix concurrently; nothing belonging to that work was read for content, touched, staged, formatted, reverted, or evaluated, and no claim in this document depends on it.
Scope of change: **this file only.** See §24.

Documents treated as *proposals to be tested*, never as authorities:

- `docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md` — below, **the evaluation**.
- `docs/reviews/estimated-1rm-load-translation-architecture-review.md` — below, **the review**.

Documents treated as *repository authority* on how evidence may be used:

- `docs/evidence/evidence-registry-reviewed.md` (EVIDENCE-001…031), `docs/evidence/product-evidence-boundaries.md` (A1–A12 / B1–B11 / C1–C7), `docs/evidence/research-gaps.md` (GAP-01…10), `docs/architecture/evidence-to-design.md` (the four-tier hierarchy and the §3 standing rules), `docs/architecture/open-decisions.md` (OD-06), `docs/architecture/implementation-plan.md:223` (Phase 9), `docs/input/product-ideas.md` (PI-001).

Identifier conventions: **`E1-E-nn`** = an external source retrieved and assessed here. **`Ø-n`** = a question searched for and *not* answered by anything found. **`RG-n`** = the evaluation's research gates. **`C-nn`** = a proposed algorithm constant (classified in §17). The evaluation's and the review's own identifiers keep their prefixes and always mean *theirs*, never this document's.

---

## 1. Executive conclusion

**The feature rests on a chain of four links, and they are not equally strong.**

| Link | Status |
| --- | --- |
| 1. A repetition-based equation converts (load, reps-to-failure) into an estimated 1RM | **Weak at the individual level, adequate at the group level.** Every classical equation is unvalidated for general use; between-individual scatter is ≈ ±10 % (1 SD) from four independent directions. No equation is validated above 10–12 reps to failure. |
| 2. `reps + reported RIR` is a usable stand-in for reps-to-failure | **Unvalidated as a composition, and the RIR half is measured under a different task than the app performs.** People under-predict reps to failure by ≈ 0.95 reps on average, and the error accumulates roughly **eight times faster once a set exceeds 12 reps to failure**. |
| 3. Comparing an athlete against *their own* history on *one* exercise cancels most of the damage | **Well supported, and it is the strongest thing in the design.** Exercise identity is the dominant moderator of the reps–%1RM relation and is worth roughly an order of magnitude more error than rep range. A per-exercise, within-athlete series is the correct unit. |
| 4. A translated load can be *prescribed* from that series | **Supported only at short rep distances.** Formula disagreement alone reaches 5 % at rep distance 3, 8–11 % at distance 4, and 17–19 % at distance 8 — larger than the entire upward cap the design relies on for safety. |

**Overall verdict: the feature may proceed as a clearly labelled convention, and the architecture's central structural choices are better supported than the evaluation itself claims — but three of its numeric rules are wrong in the non-conservative direction, and one whole family of thresholds is mis-calibrated against the actual noise in the data.**

The five findings that matter most, in order.

1. **`RTF_MAX = 15` should be `12`, and for a better reason than the review gives.** The review argues from Epley's high-rep formula bias. That argument is only half supported: against Mayhew's own fitted curve Epley's bias rises monotonically (−2.1 % at 5 reps → +8.2 % at 15), but against Nuzzo's meta-regression it is roughly flat across 70–90 % 1RM (+5.0 % → +6.7 % → +5.0 %). The *decisive* argument is independent of the formula: Halperin et al.'s meta-regression (E1-E-08) finds prediction error accumulating at β = 0.06 reps per repetition at ≤ 12 reps to failure and **β = 0.47 above 12** — an eightfold break, sitting exactly at the ceiling OD-06 already recorded. Set `RTF_MAX = 12`; cite RIR accuracy, not formula bias.

2. **`MAX_REP_DISTANCE = 8` is far too permissive, and the risk is directional.** Purely arithmetically (§13.3), translating across 8 reps makes the five classical formulas disagree by 17–19 % about the answer — nearly double the ≈ 10 % individual noise floor, and well beyond the 10 % upward cap that is supposed to contain exactly this failure. A limit of **4** puts formula disagreement at 7.5–10.8 %, i.e. about one noise unit. And the high-rep → low-rep direction is worse at equal distance (10.8 % vs 7.5 % at distance 4) *and* moves load upward, so it needs the tighter limit of the two.

3. **The percentage thresholds sit inside the ordinary noise band and will fire constantly on healthy data.** Against the only measured within-athlete, within-window dispersion of an Epley e1RM (SD(log) = 0.1026, E1-E-20): `NEARBY_POOLED_DISAGREE_PCT = 10` fires on ~51 % of well-behaved pairs, `POOL_SPREAD_MEDIUM_PCT = 10` on ~77 % of well-behaved triples, `PAIR_DISAGREE_PCT = 20` on ~21 %, and `BEST_UNCONFIRMED_PCT = 10` mislabels ~26 % of four-observation series. Even at the optimistic end — a 4.2 % CV, the median test–retest CV of a *directly measured* 1RM (E1-E-11) — the 10 % thresholds still fire on 11–21 % of clean data. These are not conservative rules; they are rules that make the confidence vocabulary uninformative and suppress suggestions capriciously.

4. **The session aggregator is not set-count invariant, so §7.4's "set count feeds confidence, not the value" is false.** Reproduced (§10.4): an athlete performing 110 kg × 5 with RIR falling 3, 3, 2, 2, 1 yields a session e1RM of **139.33 kg if they stop after three sets and 135.67 kg if they complete five** — same load, same reps, same per-set effort trajectory, −2.63 % purely from set count. Within-session repetition decline across sets is documented (E1-E-17), so this is systematic, not incidental. Its direction is conservative, but it makes the tracked trend a function of programming volume rather than of strength.

5. **"No confidence penalty for dumbbell / cable / machine" (O-7) is right for the tracker and wrong for the suggestion, and the review's defence of it confuses bias with variance.** A stable per-exercise multiplicative bias *does* cancel inside a within-athlete series — the review is correct about that, and it is the single best argument in either document. But rep-invariance *error* does not cancel, and rep-invariance error is exactly what the load-translation tier consumes. E1-E-20 measures it per equipment class: SD(log e1RM) = 0.0832 barbell, 0.1025 other, 0.1053 dumbbell, 0.1081 machine, **0.1196 cable** — cable is ~44 % noisier than barbell.

**What is genuinely well supported.** Per-exercise identity as the unit of comparison; never merging exercises; direct same-rep evidence out-ranking any formula conversion; treating a missing RIR as a lower bound (as an arithmetic property of the formula, not a claim about the athlete); refusing bodyweight, assisted, and time/distance work; refusing to present the number as measured strength; advisory-only with no auto-apply. Nothing found makes an advisory, labelled, per-exercise, within-athlete, never-auto-applied estimate **unsafe**. It makes it **imprecise** — and the design's own refusals are the mitigations the literature actually calls for.

**What no literature evaluates at all.** Whether a starting-load suggestion after a repetition-scheme change improves completion, RIR adherence, failed-set frequency, session quality, or confidence (RG-8, `Ø-6`). That is absence of evidence, not evidence of absence. It is not a reason to withhold the feature. It *is* a reason no copy may claim a benefit.

---

## 2. Search strategy and databases

### 2.1 Method

Searching ran 2026-09-05 against PubMed/MEDLINE (directly and via the Europe PMC REST API, which was the reliable route once PubMed's own pages returned only a cookie interstitial), PubMed Central, Springer Nature Link, Wiley Online Library, Taylor & Francis Online, ScienceDirect, MDPI, PeerJ, Termedia (*Biology of Sport*), Semantic Scholar, SportRxiv, arXiv, and open web search restricted afterwards by the source rules in §3.

Four passes:

1. **Anchor pass.** Retrieve, in full where possible, the three external sources the review names and builds conclusions on (Mayhew 2008, Nuzzo 2024, Wood 2002), plus the two it names in passing (LeSuer 1997, Remmert 2023).
2. **Question pass.** One targeted search set per primary question in the brief: formula accuracy; RIR accuracy and its composition with an equation; individual variability in reps at %1RM; within- and between-session reliability of maximal strength and of estimated maximal strength; detraining time course; equipment and load semantics; load-translation and load-prescription outcomes.
3. **Contradiction pass.** For every conclusion that looked settled, an explicit search for the opposing finding — e.g. after Nuzzo's sex null, a search for sex differences in repetitions at a given %1RM; after the 2025 autoregulation network meta-analysis, a search for the 2022 meta-analysis that reached a different conclusion.
4. **Negative pass.** Explicit searches designed to *fail*, recorded in §6.3, so that "no evidence exists" is a search result rather than an inference.

Retrieval preferred the publisher or PMC record. Where a PDF was retrieved, it was read page by page (Mayhew 2008 in full, eight pages; Grgic 2020 front matter; Halperin's SportRxiv preprint; the E1-E-20 preprint in full, twenty pages) rather than summarised from a landing page. Where only an abstract could be obtained, the source is marked *abstract only* in §6 and no claim rests on unretrieved internals.

### 2.2 Independent verification performed

Numbers were not taken on trust from either internal document.

- The evaluation's §6.1 multiplier table was **recomputed from the equations** for r ∈ {1, 3, 5, 8, 10, 12, 15, 20}, and the five equation forms were checked against their canonical tabulation in Mayhew 2008 Table 2 (§7.1).
- Both worked translations (110 × 5 → 12 reps; 95 × 12 → 5 reps) were recomputed for all five formulas.
- The RIR error-propagation series was recomputed.
- The set-count sensitivity of the lower-median rule was reproduced from the evaluation's §7.2 primitives.
- The percentage thresholds were simulated against a measured noise distribution (200 000 draws per cell, plus a closed-form normal check for the pair case).
- Epley's bias was computed against **two** independent empirical reference curves — Mayhew 2008's own fitted curve and Nuzzo 2024's published point estimates — precisely because a single reference would have hidden their disagreement.
- The reachability of the 15 % session-spread flag was enumerated exhaustively over RTF ranges.

All scratch scripts lived in the session scratchpad and were deleted (§24).

---

## 3. Inclusion and exclusion criteria

Applied unchanged from `docs/reviews/warmup-routines-evidence-research.md` §2.2, which this document treats as the repository's established standard.

**Included:** systematic reviews, meta-analyses, meta-regressions, individual-participant-data meta-analyses, randomised controlled and crossover trials, dedicated measurement/validation studies, and reliability studies. Peer-reviewed narrative reviews only for mechanism or context, never for a numeric claim.

**Included with an explicit flag:** exactly one preprint, **E1-E-20**, and one preprint *version* of an otherwise published paper (Halperin's SportRxiv manuscript, read for the moderator coefficients its published abstract compresses; the published version's abstract was retrieved separately and agrees). E1-E-20 is included because it is the only source in existence that measures the quantities this feature actually needs — the within-athlete dispersion of a classically computed e1RM, stratified by equipment class, on real training-log data from a consumer app. It is also the source with the most obvious conflict of interest, and §4 says so.

**Excluded:** general fitness sites, coaching blogs, certification-body material, search-engine answer summaries, calculator sites, and tradition. Two widely repeated practitioner beliefs are named in §7 *only in order to classify them*: that Epley/Brzycki are "standard" (they originate in a poundage chart in a university training manual and a practitioner article in *JOPERD* respectively, neither accompanied by an empirical derivation) and that "reps ≤ 10 is the valid range" (a recommendation repeated across the literature, whose empirical basis is Mayhew's and Reynolds' data rather than an independent test).

**One classification note.** Following `evidence-to-design.md` §3 rule 4, **nothing in this document may be cited by a design document until it enters `docs/evidence/evidence-registry-reviewed.md`.** This research does not add registry rows — §21 proposes candidates and stops there. The review observed the same boundary and was right to.

---

## 4. Limitations

Read these before using any conclusion below.

1. **No source studies this feature.** Not one retrieved study evaluates an app-computed, RIR-adjusted, per-exercise, within-athlete e1RM series, or a load translated from one. Every conclusion below is transferred from an adjacent question, and the transfer is stated each time.

2. **The populations do not match the user.** The single-user context here is an experienced adult training in kilograms. The formula-accuracy literature is built on college students: Mayhew 2008 is 103 untrained-to-novice **women** aged 19.1 ± 1.2; LeSuer 1997 is 67 untrained college students; Wood 2002 is 49 **sedentary adults aged 53.6 ± 3.3**; Reynolds 2006 is 70 participants aged 18–69; Shimano 2006 is 16 men; Richens & Cleather 2014 is 16 athletes. Nuzzo 2024's pooled sample is 66 % male, 92 % under 59, 60 % resistance-trained. GAP-09's caution — that dose-response findings in this corpus are male-skewed and young-adult-skewed — applies to this literature with equal force, and in the case of Mayhew 2008 it applies *inverted* (female-only), which is a different limitation, not an absent one.

3. **E1-E-20 is a preprint by a single author employed by the company whose proprietary data it analyses, and it has no ground truth.** Its criterion is *internal consistency* — whether different (weight, reps) pairs from the same person on the same exercise within 14 days map to the same estimate. It therefore says nothing whatever about absolute accuracy: a formula that overestimated everyone by 10 % would score perfectly. Every use of it below is a use of *relative structure* (rep-invariance, equipment-stratified dispersion, the shape of the load dependence), never of absolute correctness. It has not been peer reviewed. If it is later refuted, the conclusions that lean on it are §12's equipment tiering and §10's noise-floor calibration; the rest stands.

4. **Group means are not individual predictions, and this document keeps them apart.** Mayhew 2008 reports that most equations were "not significantly different from actual 1RM" on average — while only **57–67 % of individuals** were within ±2.3 kg of their prediction on a 28–36 kg bench press. The mean is fine and the individual is not, and every accuracy statement below is labelled as one or the other.

5. **Cross-sectional prediction accuracy and longitudinal within-athlete tracking are different questions with different answers**, and the design needs the second more than the first. Only one retrieved source (E1-E-20) addresses the second directly, and only through the consistency proxy described above. Mayhew 2008 touches it — the ICC between *change* in predicted and *change* in actual 1RM ranged from −0.09 to 0.95 across the fourteen equations, i.e. some equations tracked change well and some tracked it not at all — and that spread is itself a warning that tracking quality does not follow from prediction quality.

6. **Measured-1RM validation and prediction of future repetition performance are also different questions.** The load-translation feature needs the second ("if I put this weight on the bar, how many reps will they get?"). Almost the entire literature answers the first. The only sources bearing directly on the second are Nuzzo 2024 (population distribution of reps at a given %1RM) and Halperin 2022 (how well people themselves predict it).

7. **Two sources could not be retrieved in full.** Wood 2002 (publisher paywall, HTTP 403 from Taylor & Francis and an empty Semantic Scholar record) is characterised from its indexed abstract and metadata only; the review's specific four-exercise claim about it is therefore recorded as **not independently verified**, not as refuted. Hoeger 1990 likewise: design and sample verified, per-exercise repetition values not.

8. **The threshold calibration in §10.5 is a normal-approximation simulation on a log scale**, using a dispersion measured on a different population under a different aggregation rule. It is a *scale* argument — "these thresholds are inside the noise" — and should not be read as a precise false-positive rate for this user.

9. **This document does not re-verify the repository.** Where a repository fact is stated it is quoted from the evaluation or the review and attributed; where the two disagree the disagreement is noted rather than adjudicated. Adjudicating repository facts was the review's job.

10. **Nothing here is a clinical, medical, or injury-risk claim.** GAP-10 stands: the corpus has no variable-specific injury-risk evidence, and no source retrieved here supplies any. The word "safety" below always means "will this suggestion be too heavy to complete", never "will this hurt someone".

---

## 5. Evidence hierarchy

`evidence-to-design.md` §1's four tiers are used unchanged:

| Tier | Meaning |
| --- | --- |
| **Evidence-supported principle** | Directly backed by retrieved sources; shapes *what exists*, never attached to a concrete numeric rule. |
| **Programming heuristic** | Plausible extrapolation from a supported principle; not itself tested. |
| **Configurable product rule** | A concrete setting the user can change. |
| **User-specific observation** | What this user actually logged; never auto-promoted into a rule. |

This topic needs three additional labels, in the spirit of the warm-up research's §3.2:

- **Arithmetic truth** — follows from the equations alone, independent of any study. Much of §7 and all of §13.3 is this. An arithmetic truth is not evidence about the body; it is evidence about the algorithm, and it is fully binding on the algorithm.
- **Measured-in-the-wild** — a quantity measured on real training-log data rather than in a laboratory (only E1-E-20). Externally valid for logging conditions, internally weak on ground truth. Never sufficient alone.
- **Convention with a calibrated size** — a number the evidence cannot choose, but whose *magnitude* can be sanity-checked against a measured quantity. `UPWARD_LOAD_CAP_FACTOR = 1.1` is the clearest example: the evidence cannot pick 1.1, but it can say that 1.1 is about one standard deviation of the estimation error, which is a defensible place to cap an excursion, whereas 1.5 would not be.

Confidence ratings used in §6: **High** (multiple converging high-quality syntheses), **Moderate** (one strong synthesis, or converging primary studies), **Low** (single study, small sample, or indirect), **Very low** (preprint, or heavily transferred).

---

## 6. Source table

### 6.1 Retrieved and assessed

| ID | Source | Design / sample | Retrieved | Confidence | What it is used for here |
| --- | --- | --- | --- | --- | --- |
| **E1-E-01** | Mayhew JL, Johnson BD, LaMonte MJ, Lauber D, Kemmler W. *Accuracy of prediction equations for determining one repetition maximum bench press in women before and after resistance training.* J Strength Cond Res. 2008;22(5):1570–1577. PMID [18714230](https://pubmed.ncbi.nlm.nih.gov/18714230/) | 14 equations vs measured 1RM; **n = 103 untrained-to-novice college women**, age 19.1 ± 1.2 y; free-weight bench press; RTF at randomly assigned 60–90 % 1RM; pre- and post-12-week training | **Full text, 8 pp.** ([PDF](https://www.unm.edu/~rrobergs/478PredictionAccuracy.pdf)) | Moderate | Epley/Welday bias and scatter; the ≤ 10 RTF restriction; curvilinearity; Brzycki's high-rep failure; group-vs-individual accuracy |
| **E1-E-02** | Nuzzo JL, Pinto MD, Nosaka K, Steele J. *Maximal Number of Repetitions at Percentages of the One Repetition Maximum: A Meta-Regression and Moderator Analysis of Sex, Age, Training Status, and Exercise.* Sports Med. 2024;54(2):303–321. doi:[10.1007/s40279-023-01937-7](https://doi.org/10.1007/s40279-023-01937-7) · [PMC10933212](https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212/) | Bayesian meta-regression; 952 RTF tests, 7 289 individuals, 452 groups, 269 studies (898 / 6 970 / 425 analysed) | Full text | **High** | Individual variability at %1RM; exercise as dominant moderator; sex/age/training-status nulls; spline vs linear model form |
| **E1-E-03** | LeSuer DA, McCormick JH, Mayhew JL, Wasserstein RL, Arnold MD. *The Accuracy of Prediction Equations for Estimating 1-RM Performance in the Bench Press, Squat, and Deadlift.* J Strength Cond Res. 1997;11(4):211–213. ([record](https://journals.lww.com/nsca-jscr/abstract/1997/11000/the_accuracy_of_prediction_equations_for.1.aspx)) | 7 equations, 3 lifts; n = 67 untrained college students (40 M / 27 F) | Abstract | Moderate | Nearly all equations biased; exercise-dependent direction (all underestimated deadlift) |
| **E1-E-04** | Wood TM, Maddalozzo GF, Harter RA. *Accuracy of Seven Equations for Predicting 1-RM Performance of Apparently Healthy, Sedentary Older Adults.* Meas Phys Educ Exerc Sci. 2002;6(2):67–94. doi:[10.1207/S15327841MPEE0602_1](https://doi.org/10.1207/S15327841MPEE0602_1) | 7 equations, 10 exercises on Hammer Strength Iso-Lateral plate-loaded machines; **n = 49 sedentary adults (26 M / 23 F), age 53.6 ± 3.3 y** | **Abstract/metadata only — paywalled, HTTP 403** | Low | Machine-exercise heterogeneity; population caveat the review omits |
| **E1-E-05** | Reynolds JM, Gordon TJ, Robergs RA. *Prediction of one repetition maximum strength from multiple repetition maximum testing and anthropometry.* J Strength Cond Res. 2006;20(3):584–592. PMID [16937972](https://pubmed.ncbi.nlm.nih.gov/16937972/) | 1, 5, 10, 20RM on flat barbell bench press and plate-loaded leg press; n = 70, ages 18–69 | Abstract | Moderate | Prediction accuracy decays with source rep count; decays faster on leg press |
| **E1-E-06** | Shimano T, Kraemer WJ, Spiering BA, et al. *Relationship between the number of repetitions and selected percentages of one repetition maximum in free weight exercises in trained and untrained men.* J Strength Cond Res. 2006;20(4):819–823. PMID [17194239](https://pubmed.ncbi.nlm.nih.gov/17194239/) | Sets to failure at 60/80/90 % 1RM; back squat, bench press, arm curl; 8 trained + 8 untrained men | Abstract | Low–Moderate | Exercise (muscle mass) drives reps at a given %1RM; training status barely does |
| **E1-E-07** | Richens B, Cleather DJ. *The relationship between the number of repetitions performed at given intensities is different in endurance and strength trained athletes.* Biol Sport. 2014;31(2):157–161. doi:[10.5604/20831862.1099047](https://doi.org/10.5604/20831862.1099047) · PMID [24899782](https://pubmed.ncbi.nlm.nih.gov/24899782/) | Leg press RTF at 70/80/90 % 1RM; 8 weightlifters vs 8 endurance runners | Abstract | Low | Training background can double reps at a given %1RM; the gap collapses at 90 % |
| **E1-E-08** | Halperin I, Malleron T, Har-Nir I, Androulakis-Korakakis P, Wolf M, Fisher J, Steele J. *Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis.* Sports Med. 2022;52(2):377–390. doi:[10.1007/s40279-021-01559-x](https://doi.org/10.1007/s40279-021-01559-x) · PMID 34542869. Preprint doi:[10.31236/osf.io/x256f](https://doi.org/10.31236/osf.io/x256f) | Multilevel meta-analysis; 13 publications / 12 studies, **n = 414**, 262 effect sizes in 12 clusters | Published abstract + **full preprint** | **High** | Pooled under-prediction; the > 12-rep error break; proximity, set-number, training-status and body-region moderators; between-participant SD |
| **E1-E-09** | Steele J, Endres A, Fisher J, Gentil P, Giessing J. *Ability to predict repetitions to momentary failure is not perfectly accurate, though improves with resistance training experience.* PeerJ. 2017;5:e4105. doi:[10.7717/peerj.4105](https://doi.org/10.7717/peerj.4105) · [PMC5712461](https://pmc.ncbi.nlm.nih.gov/articles/PMC5712461/) | n = 141 (72 M / 69 F), 5 selectorized machines + sit-up, five experience strata; **predictions made *before* the set** | Full text | Moderate | The origin of the "novices are 4–5 reps out" figure — and its design confounds |
| **E1-E-10** | Remmert JF, Laurson KR, Zourdos MC. *Accuracy of Predicted Intraset Repetitions in Reserve (RIR) in Single- and Multi-Joint Resistance Exercises Among Trained and Untrained Men and Women.* Percept Mot Skills. 2023;130(3):1239–1254. doi:[10.1177/00315125231169868](https://doi.org/10.1177/00315125231169868) · PMID [37036795](https://pubmed.ncbi.nlm.nih.gov/37036795/) | n = 58 (27 M / 31 F), machine biceps curl / triceps pushdown / seated row, 4 sets to failure at 72.5 % 1RM, intraset RIR calls from 5 RIR down | Full abstract | Moderate | Proximity-to-failure and set-number effects are real; **sex, training experience and RIR-rating experience are not** |
| **E1-E-11** | Grgic J, Lazinica B, Schoenfeld BJ, Pedisic Z. *Test–Retest Reliability of the One-Repetition Maximum (1RM) Strength Assessment: a Systematic Review.* Sports Med Open. 2020;6:31. doi:[10.1186/s40798-020-00260-z](https://doi.org/10.1186/s40798-020-00260-z) | 32 studies, pooled n = 1 595; 1–10 days between test and retest | Full text (front matter + results) | **High** | The reliability ceiling of a *measured* 1RM: median ICC 0.97, **median CV 4.2 %** (range 0.5–12.1 %), stable across sex, age, body region, joint count and experience |
| **E1-E-12** | Banyard HG, Nosaka K, Haff GG. *Reliability and Validity of the Load–Velocity Relationship to Predict the 1RM Back Squat.* J Strength Cond Res. 2017;31(7):1897–1904. PMID [27669192](https://pubmed.ncbi.nlm.nih.gov/27669192/) | 17 strength-trained men, three 1RM sessions | Abstract | Moderate | Measured 1RM CV 2.1 % vs **predicted 1RM CV 5.7 %**; authors' explicit conclusion that a predicted 1RM "cannot accurately modify sessional training loads" |
| **E1-E-13** | Greig L, Aspe RR, Hall A, Comfort P, Cooper K, Swinton PA. *The Predictive Validity of Individualised Load–Velocity Relationships for Predicting 1RM: A Systematic Review and Individual Participant Data Meta-analysis.* Sports Med. 2023;53(9):1693–1708. doi:[10.1007/s40279-023-01854-9](https://doi.org/10.1007/s40279-023-01854-9) · [PMC10432349](https://pmc.ncbi.nlm.nih.gov/articles/PMC10432349/) | IPD meta-analysis; 26 studies / 641 participants (20 / 434 in meta-analyses) | Full text | **High** | Best-case individual-level error of *any* estimated 1RM method: pooled **SEE 9.8 % [7.4–12.2]**, mean overestimation 3.7 % [0.5–6.9]; "incorporate direct assessment of 1RM wherever possible" |
| **E1-E-14** | Bosquet L, Berryman N, Dupuy O, et al. *Effect of training cessation on muscular performance: A meta-analysis.* Scand J Med Sci Sports. 2013;23(3):e140–e149. doi:[10.1111/sms.12047](https://doi.org/10.1111/sms.12047) · PMID [23347054](https://pubmed.ncbi.nlm.nih.gov/23347054/) | Meta-analysis; 103 of 284 screened studies | Abstract | Moderate | Maximal force SMD −0.46 [−0.54, −0.37] with a **continuous** dose–response in cessation duration; larger in > 65 y and in inactive people |
| **E1-E-15** | Encarnação IGA, Viana RB, Soares SRS, Freitas ED, de Lira CAB, Ferreira-Junior JB. *Effects of Detraining on Muscle Strength and Hypertrophy Induced by Resistance Training: A Systematic Review.* Muscles. 2022;1(1):1–15. doi:[10.3390/muscles1010001](https://doi.org/10.3390/muscles1010001) | 20 trials qualitatively; 2 in the strength meta-analysis | Abstract | Low | Training-induced strength retained vs non-exercise control at **16–24 weeks** of detraining; gone by 32–48 weeks |
| **E1-E-16** | Spiering BA, Mujika I, Sharp MA, Foulis SA. *Maintaining Physical Performance: The Minimal Dose of Exercise Needed to Preserve Endurance and Strength Over Time.* J Strength Cond Res. 2021;35(5):1449–1458. doi:[10.1519/JSC.0000000000003964](https://doi.org/10.1519/JSC.0000000000003964) | Narrative review | Abstract | Low (narrative) | Strength maintained 4–8 weeks on reduced volume/frequency **if intensity is preserved**; up to 32 weeks on a minimal dose |
| **E1-E-17** | Senna G, Willardson JM, de Salles BF, et al. *The Effect of Rest Interval Length on Multi and Single-Joint Exercise Performance and Perceived Exertion.* J Strength Cond Res. 2011;25(11):3157–3162. doi:[10.1519/JSC.0b013e318212e23b](https://doi.org/10.1519/JSC.0b013e318212e23b) | 15 trained men; bench press, leg press, chest fly, leg extension; 1 / 3 / 5 min rest | Abstract | Moderate | Repetition performance declines **from set 2** at 1-min rest and **from set 3** at 3–5 min; RPE rises across sets |
| **E1-E-18** | Hickmott LM, Chilibeck PD, Shaw KA, Butcher SJ. *The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy: A Systematic Review and Meta-Analysis.* Sports Med Open. 2022;8:9. doi:[10.1186/s40798-021-00404-9](https://doi.org/10.1186/s40798-021-00404-9) · [PMC8762534](https://pmc.ncbi.nlm.nih.gov/articles/PMC8762534/) | 15 studies / 441 participants (load autoregulation: 6 studies, 133 participants) | Full text | Moderate | **No significant difference** between autoregulated and percentage-based load prescription for 1RM (MD 2.07 kg [−0.32, 4.46], p = 0.09, SMD 0.21) |
| **E1-E-19** | Huang Z, Sun J, Li D, Chen C, Wang D. *Autoregulated resistance training for maximal strength enhancement: A systematic review and network meta-analysis.* J Exerc Sci Fit. 2025;23(4):360–369. doi:[10.1016/j.jesf.2025.07.006](https://doi.org/10.1016/j.jesf.2025.07.006) · PMID [40791980](https://pubmed.ncbi.nlm.nih.gov/40791980/) | Network meta-analysis; APRE vs RPE vs VBRT vs percentage-based | Full abstract | Low–Moderate | Autoregulation ranks above percentage-based (SUCRA), **but for back squat 1RM "no moderate/large effect sizes were observed between interventions"** — the ranking is not backed by credible pairwise differences there |
| **E1-E-20** | *(PREPRINT — NOT PEER REVIEWED)* Marzagão T. *A Weight-Dependent 1RM Prediction Equation Optimized on 303,494 Near-Failure Sets Across 388 Exercises.* arXiv:[2603.17495](https://arxiv.org/abs/2603.17495), 18 Mar 2026; also SportRxiv. **Author affiliation: Fitbod, Inc. — the data are the employer's.** | 303 494 near-failure sets, 135 730 (user, exercise, 14-day) tuples, 14 966 users (79.9 % male, mean age 35.0, range 18–82), 388 exercises; **no measured 1RM anywhere** — criterion is internal consistency | Full text, 20 pp. | **Very low** (preprint, single author, COI, no ground truth) | Within-athlete e1RM dispersion overall and **by equipment class**; load-dependence of the conversion factor; explicit exclusion rationale for bodyweight/assisted/timed work; the per-hand vs total logging-convention problem |
| **E1-E-21** | Hoeger WWK, Hopkins DR, Barette SL, Hale DF. *Relationship between repetitions and selected percentages of one repetition maximum: a comparison between untrained and trained males and females.* J Appl Sport Sci Res. 1990;4(2):47–54. ([record](https://journals.lww.com/nsca-jscr/abstract/1990/05000/relationship_between_repetitions_and_selected.4.aspx)) | 91 subjects (untrained M 38 / F 40, trained M 25 / F 26), 7 lifts at 40/60/80 % 1RM | Abstract; **per-exercise values not verified** | Low | Exercise-dependence of reps at %1RM; a significant **sex** difference, in tension with E1-E-02 |

### 6.2 Repository corpus entries relied on (unchanged, not re-derived)

`EVIDENCE-014` (RIR accuracy better near failure; moderators contested) · `EVIDENCE-025` (one-week cessation: no hypertrophy cost, some strength cost) · `EVIDENCE-029` (1–2 RIR ≈ failure for hypertrophy) · `EVIDENCE-030` (Refalo 2024: absolute RIR error 0.40 reps at 1-RIR, 0.90 at 3-RIR, combined **0.65 ± 0.78**, statistically equivalent across targets) · `EVIDENCE-031` · `B6`, `B8`, `B11` · `GAP-05`, `GAP-07`, `GAP-09`, `GAP-10` · `evidence-to-design.md` rows 4, 5, 18.

### 6.3 Searched and not found (`Ø`)

Each of these was an explicit, targeted search, not an inference from silence.

| ID | Question | Result |
| --- | --- | --- |
| **Ø-1** | A study substituting `(reps performed + self-reported RIR)` into any 1RM equation and validating the result against a measured 1RM | **None found.** The two halves are validated separately; the composition is not. Confirms the evaluation's RG-2 framing and the review's assessment. |
| **Ø-2** | Any measurement of the accuracy of a **retrospective, post-set** RIR report | **None found.** Every paradigm retrieved is a *pre-set* prediction (E1-E-09) or an *intra-set* call-out (EVIDENCE-030, E1-E-10). The app logs a post-set retrospective value. This is a distinct, unstudied task and neither internal document notices it. |
| **Ø-3** | A systematic review or meta-analysis of **repetition-based** 1RM prediction equation accuracy | **None found.** The two syntheses that exist address the load–velocity method (E1-E-13) and the reps-to-failure *prediction* task (E1-E-08). The repetition-equation literature has never been pooled. |
| **Ø-4** | Validation of any 1RM equation for **cable** exercises | **None found in peer-reviewed literature.** The only quantitative datum anywhere is E1-E-20's preprint stratification. |
| **Ø-5** | 1RM estimation for **bodyweight, weighted-bodyweight, or assisted** movements | **None found.** E1-E-20 excluded them by design, giving the same reason the evaluation gives: the logged number is added or counter-load, not total resistance. Convergent judgment, not evidence. |
| **Ø-6** | Whether a starting-load suggestion after a **repetition-scheme change** improves completion, RIR adherence, failed-set frequency, session quality, safety or confidence | **None found.** RG-8 is unanswerable from the literature today. |
| **Ø-7** | A **smallest worthwhile change** for an *estimated* 1RM | **None found.** One exists for the measured 1RM by implication (E1-E-11's 4.2 % median CV; E1-E-12's 2.1 %), but nothing defines a meaningful change in an estimate. |
| **Ø-8** | How many sessions are needed for a **stable** estimated 1RM | **None found.** No source evaluates 1, 3, 5 or any other session count. |
| **Ø-9** | Evidence for a **21-day, 42-day or 90-day** strength-recency boundary | **None found.** The detraining literature is a continuous dose–response (E1-E-14) with no threshold anywhere near these values. |
| **Ø-10** | Evidence on **translating a training load between repetition schemes** and its effect on subsequent performance | **None found.** The entire load-translation half of the feature has no direct literature. |
| **Ø-11** | Whether an e1RM computed from **later, fatigued sets** should be corrected for set order | **None found.** Set-order decline is well documented (E1-E-17); no prediction equation accounts for it, and E1-E-20 states this explicitly as an open gap. |

---

## 7. Formula comparison

### 7.1 Provenance — and it is worse than "convention"

`evidence-to-design.md` row 18 already classifies e1RM as **"Convention (heuristic, no corpus backing)"**. The external literature makes that classification *more* correct, not less. E1-E-20's literature review — corroborated by Mayhew 2008's own Table 2, which tabulates all fourteen equations with their sources — records that:

- **Epley (1985)** originated in a poundage chart in a resistance-training manual at the University of Nebraska, not a peer-reviewed study, and was later back-fitted from that chart. Mayhew 2008 tabulates the same equation under **Welday (1988)**, from *Scholastic Coach*, as `1RM = (RTF × 0.0333) × RepWt + RepWt` — arithmetically identical to `w(1 + r/30)` to four decimal places.
- **Brzycki (1993)** appeared in *JOPERD*, a practitioner journal, with no empirical derivation.
- **Lander, O'Conner, Lombardi and Wathen** come from practitioner manuals and textbook chapters (Wathen's from Baechle's *Essentials of Strength Training and Conditioning*).
- **Mayhew (1992)** is the exception: fitted to 435 college students on the bench press.

So of the five equations the evaluation compares, **four have no published derivation at all**, and the fifth was fitted to one exercise in one population. Choosing among them is not choosing among competing scientific models; it is choosing among competing coaching conventions. That materially strengthens OD-06's original instinct — pick one, name it, label it, and make switching honest — and it removes any basis for the phrase "the safest shape".

### 7.2 The multiplier table — independently recomputed

Multiplier `f(r)` with `e1RM = w × f(r)`. Computed from the equation forms, each of which was checked against Mayhew 2008 Table 2.

| r | Epley `1+r/30` | Brzycki `36/(37−r)` | Lombardi `r^0.10` | O'Conner `1+0.025r` | Wathan `100/(48.8+53.8e^(−0.075r))` | Mayhew `100/(52.2+41.9e^(−0.055r))` | Lander `1/(1.013−0.0267123r)` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.0333 | 1.0000 | 1.0000 | 1.0250 | 1.0130 | 1.0886 | 1.0139 |
| 3 | 1.1000 | 1.0588 | 1.1161 | 1.0750 | 1.0898 | 1.1399 | 1.0720 |
| 5 | 1.1667 | 1.1250 | 1.1746 | 1.1250 | 1.1658 | 1.1901 | 1.1371 |
| 8 | 1.2667 | 1.2414 | 1.2311 | 1.2000 | 1.2767 | 1.2629 | 1.2511 |
| 10 | 1.3333 | 1.3333 | 1.2589 | 1.2500 | 1.3475 | 1.3093 | 1.3407 |
| 12 | 1.4000 | 1.4400 | 1.2821 | 1.3000 | 1.4150 | 1.3540 | 1.4441 |
| 15 | 1.5000 | 1.6364 | 1.3110 | 1.3750 | 1.5091 | 1.4172 | 1.6331 |
| 20 | 1.6667 | 2.1176 | 1.3493 | 1.5000 | 1.6446 | 1.5118 | 2.0888 |

**Verification results.**

- The evaluation's Epley, Brzycki, Lombardi and O'Conner columns are **correct at all eight rows.**
- The evaluation's Wathan column is **wrong at five of eight rows**: r = 3 (doc 1.091, computed 1.090), r = 8 (1.281 vs **1.277**), r = 12 (1.412 vs **1.415**), r = 15 (1.508 vs 1.509), r = 20 (1.639 vs **1.645**). This confirms the review's RL-3 and extends it by one row: the review counted four wrong values and characterised r = 15 as "1.508/1.509"; at three decimal places it is 1.509, so five of eight differ, three materially. **The review's own recomputed column is correct.**
- The evaluation's five equation *forms* all match their canonical tabulation in Mayhew 2008 Table 2. This is a genuine positive: the document transcribed the equations correctly even where it mis-evaluated one of them.
- Both worked translations reproduce exactly. 110 × 5 → 12 reps: Epley 91.67, Brzycki 85.94, Lombardi 100.78, O'Conner 95.19 (Wathan 90.63). 95 × 12 → 5 reps: Epley 114.00, Brzycki 121.60, Lombardi 103.69, O'Conner 109.78 (Wathan 115.30).
- One uncaught slip in the evaluation: §6.1 states "the athlete's own ratio in the brief is 95/110 = 0.860". It is **0.8636**. The conclusion drawn from it (that the athlete's own ratio falls between O'Conner's 0.8654 and Epley's 0.8333) survives, and the review quotes the correct value.

**The evaluation's headline conclusion — "no formula is uniformly conservative" — is arithmetically sound and is the strongest single argument in either internal document.** Brzycki is the most conservative when translating downward in load and the most aggressive when translating upward; Lombardi and O'Conner flatten and reverse the ordering above r ≈ 10. Conservatism cannot come from the formula.

### 7.3 Accuracy, bias and typical error — what the studies measured

| Question | Answer | Sources |
| --- | --- | --- |
| Is any equation unbiased? | **No, not generally.** LeSuer 1997: on the bench press all but two of seven equations differed significantly from zero; on the squat all but one; **on the deadlift every equation significantly underestimated**. Mayhew 2008 full range: only 3 of 14 differed significantly on average — but see the individual-level row. | E1-E-01, E1-E-03 |
| What is the *individual*-level error? | **≈ ±10 % (1 SD), from four independent directions.** Mayhew 2008 % Error SD 10.2–12.5 % across restrictions and time points, with only **57–67 % of individuals within ±2.3 kg** on a 28–36 kg lift under the *best* equation. Greig 2023 pooled **SEE 9.8 % [7.4–12.2]** for the best-studied alternative method. Nuzzo 2024's between-individual rep SD converted through Epley gives ±6.7 percentage points at 80 % 1RM and ±8.7 at 60 % (1 SD). E1-E-20's within-athlete, within-14-day SD(log e1RM) is 0.1026 under Epley. | E1-E-01, E1-E-02, E1-E-13, E1-E-20 |
| Does restricting to ≤ 10 reps help? | **It nearly removes the bias and barely touches the scatter.** Welday/Epley in Mayhew 2008, pre-training: full range +5.3 ± 11.0 % → ≤ 10 RTF **+0.5 ± 10.2 %**. Post-training: +6.5 ± 12.5 % → **−0.7 ± 10.6 %**. Reynolds 2006 independently: R² for predicting 1RM was 0.993 / 0.976 / 0.955 (chest press) and 0.974 / 0.933 / 0.915 (leg press) from 5RM / 10RM / 20RM. | E1-E-01, E1-E-05 |
| Is the true relation linear? | **No.** Mayhew 2008 fitted `%1RM = 90.575 · e^(−0.0152·reps)`, r² = 0.59, and describes "a substantial curvilinear nature… over a wide range of repetitions". Nuzzo 2024 tested model forms formally: "Fit statistics favored the natural cubic spline model and Bayes factors indicated that there was **strong evidence** favoring the natural cubic spline model as being a more probable description of the data generating process **compared with all other models**" — which includes the linear and simple exponential forms of every classical equation. | E1-E-01, E1-E-02 |
| Is the conversion factor constant across loads? | **Probably not.** E1-E-20 (preprint) finds the optimal rep-to-1RM factor `k` rises with absolute load — ≈ 8 at 10 kg, ≈ 12 at 25 kg, ≈ 16 at 55–70 kg, ≈ 20 at 150 kg — against Epley's fixed 30, Wathen's and Mayhew's effective ≈ 29, and Brzycki's 36. Allowing `k` to vary with load accounted for **91 %** of its improvement in within-athlete consistency. Treat as a hypothesis: the criterion has no ground truth, and load is a proxy for exercise type. | E1-E-20 |
| Which equation should be chosen? | **The evidence does not choose.** Under the only within-athlete consistency comparison that exists, the four classical benchmarks are nearly indistinguishable — SD(log 1RM) 0.1021 (Wathen), 0.1026 (Epley), 0.1028 (Brzycki), 0.1084 (Mayhew), a spread of under 6 %. In Mayhew 2008's ≤ 10-RTF analysis, Welday/Epley was one of only four equations (with Cummings & Finn, Mayhew and Wathen) whose predictions were not significantly different from actual 1RM at **either** time point. Epley is a defensible choice — on continuity with OD-06, closed-form invertibility and determinism, exactly as the evaluation argues. | E1-E-01, E1-E-20 |
| Where does Brzycki fail? | **Catastrophically above ~12 reps**, because of the pole at r = 37. Mayhew 2008, full range, pre-training: constant error **+7.2 ± 23.7 kg**, % Error **+26.7 ± 101.7 %**, ICC **0.24** — the worst equation of the fourteen alongside Lander (+6.3 ± 16.8 kg, ICC 0.40, also a reciprocal-linear form). Restricted to ≤ 10 RTF, Brzycki becomes one of the *best*. This is decisive empirical support for the evaluation's warning that Brzycki "diverges above 10 (singular at r = 37)". | E1-E-01 |

### 7.4 Bias by repetition range: two reference curves, two different answers

The review's RM-13 asserts that Epley "systematically overestimates as reps grow". Tested against both available empirical reference curves:

**Against Mayhew 2008's own fitted curve** (`%1RM = 90.575·e^(−0.0152r)`), Epley's implied error is `%1RM(r) × (1 + r/30) − 1`:

| reps | 5 | 10 | 15 | 20 | 25 | 30 |
| --- | --- | --- | --- | --- | --- | --- |
| Epley error | **−2.1 %** | **+3.7 %** | **+8.2 %** | **+11.4 %** | +13.6 % | +14.8 % |

Monotonically increasing, and it reproduces Mayhew's observed pattern (full-range mean +5.3 %, ≤ 10 RTF +0.5 %). **This supports RM-13.**

**Against Nuzzo 2024's published point estimates** (main model ≈ 5 reps at 90 %, ≈ 10 at 80 %, ≈ 15 at 70 % 1RM):

| load | 90 % 1RM (5 reps) | 80 % 1RM (10 reps) | 70 % 1RM (15 reps) |
| --- | --- | --- | --- |
| Epley error | **+5.0 %** | **+6.7 %** | **+5.0 %** |

Essentially **flat**. **This does not support RM-13** over the band in question.

**Resolution.** The two best available reference curves agree that Epley carries a positive bias of several per cent in the 8–15 rep region and disagree about whether it *grows* there. Mayhew's curve is fitted to 103 novice women on one exercise with r² = 0.59 and is extrapolated at its low-rep end; Nuzzo's is a spline over 269 studies. The honest statement is: **Epley's positive bias in the 11–15 band is real and of order 5–8 %, but the claim that it grows steeply with reps inside that band is supported by one reference curve and contradicted by the other.** The review is directionally defensible and overstated, and — critically — the number it quotes for the effect (+5.3 %) is a whole-sample % error, not a bias measured inside the 11–15 band. §19 gives the argument that does survive.

### 7.5 Sex, age, training status, and free weights versus machines

| Moderator | Finding | Confidence |
| --- | --- | --- |
| **Exercise** | **The dominant moderator, by an order of magnitude.** Nuzzo 2024: "more repetitions were evident in the leg press than bench press across the loading spectrum, thus separate REPS ~ %1RM tables were developed for these two exercises" — leg press 13.1 [9.8–17.5] and 19.0 [14.2–25.5] reps at 80 % and 70 % 1RM; bench press 8.8 [7.7–10.1] and 14.1 [12.4–16.1]. Converted through Epley, that is an over-estimate of **+3.5 % on the bench press and +14.9 % on the leg press at 80 % 1RM** — an ~11-percentage-point exercise effect against a ~1.7-point effect of moving from 70 % to 90 % 1RM. Corroborated by Shimano 2006 (back squat > bench press > arm curl at 60 % 1RM), LeSuer 1997 (every equation underestimated the deadlift), and Reynolds 2006 (accuracy decays faster on leg press than chest press). | **High** |
| **Sex** | **Contested, and the best evidence is null at the loads this app uses.** Nuzzo 2024, verbatim: "sex, age, and training status did not clearly moderate the REPS ~ %1RM relationship". Against that, Hoeger 1990 found a significant sex difference across seven lifts, and single-joint / light-load studies find women completing more repetitions at the same relative load. Nuzzo's null is pooled and load-weighted toward 60–90 % 1RM. **Do not claim "sex makes no difference"; claim "the best synthesis found no clear moderation over the load range this feature uses".** | Moderate for the null; Low for the difference |
| **Age** | No clear moderation in Nuzzo 2024. But 92 % of its sample was under 59, and E1-E-04's older, sedentary sample is exactly where equations were found to behave inconsistently. GAP-09 stands. | Low–Moderate |
| **Training status** | **Little to no effect on the reps–%1RM relation** (Nuzzo 2024; Shimano 2006 found no difference except bench press at 90 % 1RM) — but *sporting background* can double it (Richens & Cleather 2014: at 70 % 1RM leg press, endurance runners 39.9 ± 17.6 reps vs weightlifters 17.9 ± 2.8; at 80 %, 19.8 ± 6.4 vs 11.8 ± 2.7; at 90 % the difference was not significant, 10.8 ± 3.9 vs 7.0 ± 2.1). Note the SDs: this is the clearest single demonstration that individual scatter **collapses as load rises**. | Moderate |
| **Free weights vs machines** | **Thin and mixed; no general equivalence claim is supportable.** E1-E-04 applied seven equations across ten plate-loaded machine exercises and reported heterogeneous agreement — but in 49 *sedentary adults aged 53.6*, and its specifics could not be retrieved. Nuzzo's decisive bench-vs-leg-press split is itself partly a free-weight-vs-machine split. The only quantitative equipment stratification anywhere is E1-E-20's, in §12. | Low |
| **Above 10–12 reps to failure** | **No equation is validated there.** Mayhew 2008 explicitly: "Many RTF prediction equations… have a tendency to significantly overestimate 1RM bench press when the repetition range is [wide]. This tendency was apparent for some of the equations in the current study, **especially the linear ones**… Previous recommendations have suggested that a repetition range of no more than 10 produces better predictions." Where a wide range is unavoidable, Mayhew's own exponential form and Tucker's load-and-rep form performed best in that sample — "less bad", not validated. | **High** |

---

## 8. RIR-adjustment evidence

This is the weakest link and deserves the most precision.

### 8.1 The composition is unvalidated — and the two halves are not even measured the same way

**`Ø-1`: no peer-reviewed study substitutes `(reps performed + self-reported RIR)` into a 1RM equation and validates the result against a measured 1RM.** The evaluation says exactly this in §6.2 and RG-2, the review confirms it, and this research confirms it independently.

**`Ø-2` is new and neither internal document notices it.** The RIR half is not merely noisy; it is measured under a *different task* from the one the app performs:

| Paradigm | What is asked | Source | Error |
| --- | --- | --- | --- |
| **Pre-set prediction** | "Before you start, how many can you do?" | E1-E-09 (Steele 2017) | Under-prediction 1.3–6.4 reps depending on experience stratum; SEM 2.64–3.38 reps |
| **Intra-set call-out** | "Say when you are at 3 RIR" / "call your RIR on every rep from 5 RIR down" | EVIDENCE-030 (Refalo 2024); E1-E-10 (Remmert 2023) | Absolute error 0.40 reps at 1-RIR, 0.90 at 3-RIR, **0.65 ± 0.78 combined**; statistically equivalent across targets |
| **Post-set retrospective report** | "That set is finished — how many did you have left?" | **`Ø-2` — none found** | Unknown |

The app logs the third. Its error is bounded below by the second (the athlete has just performed the set, which should help) and probably above by the first, but no one has measured it. **This should be stated in the design as a named unknown, not folded into EVIDENCE-030's numbers.**

### 8.2 Accuracy at 0–2, 3–4, and 5+

| RIR band | What the evidence says |
| --- | --- |
| **0–2** | Best-measured region. EVIDENCE-030: absolute error **0.40 ± 0.68 reps** at a 1-RIR target in experienced lifters. Directionally, accuracy improves closer to failure — E1-E-08's meta-regression β = −0.025 [−0.05, 0.0014] (a small effect whose interval just includes zero); E1-E-10 found a significant main effect of proximity to failure (p < 0.01). |
| **3–4** | EVIDENCE-030: **0.90 ± 0.81 reps** at a 3-RIR target — worse in point estimate, but **formal equivalence testing found no meaningful difference from 1-RIR within a ±1-rep bound**. That registry entry's *Unsafe inference* clause is explicit: "Do NOT… assume accuracy is uniformly better very close to failure than a few reps out — this specific study found no statistically confirmed difference there." Nothing retrieved here overturns that. |
| **5+** | **Essentially unmeasured, and no evidence supports a discontinuity at 5.** E1-E-10 elicited calls from 5 RIR downward and reports a monotone proximity effect, not a cliff. E1-E-08's moderator is continuous. B8's "5+" is an *illustrative* example inside a weighting heuristic, and `evidence-to-design.md` row 5 lists "**discarding high-RIR data entirely**" in its *not-justified* column. |
| **Between people** | E1-E-08: between-participant SD of predictive accuracy = **1.45 reps [0.99–2.12]**. The authors call this "minimal"; for this feature it is not. A person-specific RIR bias of ±1.45 reps is ±3.5–4.4 % of e1RM — **systematic, per-person, and therefore largely cancelling inside a within-athlete trend while remaining fully present in the absolute number.** This is a strong, quantitative argument for the design's within-athlete framing and against ever presenting the absolute value as a strength measure. |

### 8.3 Systematic direction, and whether missing RIR is honestly a lower bound

**Direction.** E1-E-08's pooled estimate: people **under-predict** reps to task failure by **0.95 repetitions [0.17, 1.73]**, with very high heterogeneity (I² = 97.9 %). E1-E-09 agrees in direction across all five experience strata. EVIDENCE-030 found a small raw under-prediction (−0.17 ± 1.00 reps) in a controlled intra-set paradigm.

Applied to this design: an athlete who reports RIR 2 was, on average, closer to 3. `RTF = reps + RIR` therefore **under**-states true reps-to-failure on average, which pushes the e1RM **down** — the conservative direction. That reassurance is sound, but it comes from the pooled estimate, not from an experience gradient (§8.4).

**Missing RIR as a lower bound.** Treating a missing RIR as 0 gives `RTF = reps`. Since RIR is non-negative by construction and the schema forbids logging a failed rep (`reps ≥ 1`), `f(reps) ≤ f(reps + RIR_true)` always. So:

> **A missing RIR is honestly a lower bound *on the Epley estimate*. It is not a lower bound on the athlete's true 1RM**, because the formula itself carries a positive bias of roughly +3 % to +15 % depending on exercise (§7.4–7.5).

That distinction must appear in the copy rule. "At least X kg" is a claim about the formula's output; "your 1RM is at least X kg" is a claim about the athlete, and the evidence does not license it. Independently, E1-E-20 records the same reasoning from the other side: "If some sets had substantial repetitions in reserve, the 1RM estimates derived from them would be systematically biased downward."

**Mixing reported and missing RIR in one basis.** No evidence bears on this directly, but the structural argument is clean and it favours the evaluation's own O-6 instinct: a lower-bound observation and a band-max target RIR are two independent conservatisms applied to the same number, and stacking them produces a suggestion that is conservative by an unquantified and non-reproducible amount. The review's RM-12 identifies the same defect. **Do not pool observations with different RIR-completeness into one basis; prefer a homogeneous basis, and if none exists, say so rather than mixing.**

### 8.4 Is degrading RIR 3–4, or excluding RIR ≥ 5, evidence-backed?

**Neither is evidence-backed. Both can be defensible product judgments, and they must be labelled that way.**

- **Degrading 3–4** — the review's RM-1b is **correct**. The evaluation cites EVIDENCE-014 for it; EVIDENCE-030, which the registry itself calls "the corpus's most methodologically rigorous single source specifically on RIR measurement accuracy", tested exactly 1-RIR against 3-RIR and found them **statistically equivalent**. External evidence does not rescue the citation: E1-E-08's proximity coefficient is small with an interval touching zero, and E1-E-10's effect is a main effect across a 5→0 RIR sweep, not a 2-versus-3 cliff. Degrading 3–4 is a reasonable conservatism. Citing EVIDENCE-014 for it is not.
- **Excluding ≥ 5** — the review's RM-1a is **correct**: this is the named unsafe inference in `evidence-to-design.md` row 5, not an application of B8, which says *weight*, not *discard*. Nothing external supports a discontinuity at 5.

  **One argument does partially rescue the rule, and it is worth recording because it changes with `RTF_MAX`.** With `RTF_MAX = 12`, an RIR ≥ 5 set only survives the rep ceiling if `reps ≤ 7`. So the RIR ≥ 5 exclusion bites exactly on low-rep, far-from-failure sets — the longest extrapolations, where the athlete is furthest from the region where RIR has ever been measured. Framed that way it is a coherent *domain* rule rather than a *data-quality* rule, and it should be justified as such: "we do not extrapolate from sets that far from failure", not "we do not trust RIR ≥ 5".

### 8.5 Error propagation, verified

Recomputed independently; the evaluation's §6.2 series is **correct**. One repetition of RIR error changes an Epley e1RM by:

| RTF | 3 | 5 | 7 | 10 | 12 | 14 | 15 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| per +1 rep | 3.03 % | 2.86 % | 2.70 % | 2.50 % | 2.38 % | 2.27 % | 2.22 % |

Combined with EVIDENCE-030's 0.40–0.90 rep absolute error, the RIR channel alone contributes roughly **±1 % to ±2.5 %** of e1RM for a well-behaved near-failure set — smaller than the ≈ 10 % total individual scatter, and comparable to one `loadStepKg` on a 100 kg lift. The evaluation's inference from this ("round to load steps, display nothing finer") is sound. It is also, notably, *not* the dominant error term: formula misspecification and between-individual variation are much larger. Any design copy that attributes the imprecision mainly to RIR would be wrong.

### 8.6 The 12-rep break — the single most actionable RIR finding

E1-E-08's meta-regression stratified prediction error by the number of repetitions actually performed to task failure:

> "…prediction accuracy slightly improved when the predictions were made closer to set failure (β = −0.025 [95 % CIs = −0.05 to 0.0014]) and **when the number of performed to task-failure was lower (≤ 12 repetitions, β = 0.06 [95 % CIs = 0.04 to 0.09]; > 12 repetitions, β = 0.47 [95 % CIs = 0.44 to 0.49])**."

Each additional repetition adds 0.06 reps of prediction error below the 12-rep line and **0.47 above it** — roughly an eightfold change in slope, with both intervals excluding zero, in a pooled sample of 414 participants. This is the strongest quantitative evidence retrieved anywhere in this research for a repetition ceiling, it lands exactly on OD-06's recorded value of 12, and it applies to the *RIR* half of the composition rather than the formula half — which is precisely the half the evaluation admits is unvalidated. §19 builds the recommended domain on it.

---

## 9. Rep-range and exercise-specific variability

### 9.1 How large is the individual variability?

Nuzzo 2024, verbatim: "at 80 % 1RM, the estimate for the SD about the point estimate is **2.51 repetitions**, whereas at 60 % 1RM the estimate is **4.36 repetitions**", and "SDs also increase as %1RM decreases".

Converted through Epley, a ±1 SD band in repetitions is a band in implied e1RM of:

| Load | Mean reps | SD (reps) | Implied e1RM span (±1 SD) |
| --- | --- | --- | --- |
| 80 % 1RM | ≈ 10 | 2.51 | 1.000 – 1.134 × true 1RM (**±6.7 percentage points**) |
| 60 % 1RM | ≈ 20 | 4.36 | 0.913 – 1.087 × true 1RM (**±8.7 percentage points**) |

A 95 % band is roughly ±13–17 %. Richens & Cleather 2014 shows the same collapse-with-load from a different angle: at 70 % 1RM leg press the between-athlete SD was 17.6 reps in one group; at 90 % it was 3.9.

**Consequence for the design: the pooled `currentE1RM` is a quantity with a ±10 % (1 SD) individual band, being displayed to 1 kg.** `E1RM_DISPLAY_ROUND_KG = 1` renders a 135.67 kg estimate as "136 kg" when its 1 SD uncertainty is ≈ ±14 kg. That is a precision claim the evidence does not license. §20 recommends a coarser display grid or an explicit band.

### 9.2 Is exercise identity the dominant moderator?

**Yes, and by roughly an order of magnitude.** From §7.5's conversion: at 80 % 1RM, Epley over-estimates by **+3.5 % on the bench press and +14.9 % on the leg press** — an ~11-point exercise effect — against a ~1.7-point effect of moving from 70 % to 90 % 1RM on the pooled curve. Nuzzo declined to publish sex- or age-specific tables and *did* publish exercise-specific ones. Shimano 2006 attributes the effect to the amount of muscle mass engaged. E1-E-20's whole contribution is a load-dependent conversion factor whose author interprets load as "a statistical proxy for exercise type, equipment category, and muscle group".

**This is the strongest empirical support the design has, and it is stronger than either internal document claims.** It says:

1. A per-exercise, within-athlete series is not merely a convenience — it is the only unit in which the dominant error term is constant and therefore cancels.
2. Cross-exercise inference (the evaluation's N-4 ban) is not conservatism; it is a correctness requirement.
3. A single global formula constant is guaranteed to be wrong for most exercises, and the design's response — never comparing across exercises — is the correct response to that.

### 9.3 Should direct same-rep performance outrank generic conversion?

**Yes, decisively, and this is the best-supported rule in the entire proposal.**

At rep distance 0 the formula does not enter at all. At distance ≤ 1 the five classical formulas disagree by at most **1.4 %** about the translated load (§13.3) — far inside the ≈ 10 % individual band and inside one `loadStepKg` on most lifts. The moment the design falls back on a formula, it re-imports the full exercise-identity error of §9.2 (±11 points between two common exercises) and the full individual scatter of §9.1 (±10 %, 1 SD).

So `SAME_REPS_TOLERANCE = 1` and the direct tier's "use the modal load, no formula, no RIR adjustment" are the correct architecture. **The one place this rule needs care is the effort dimension**: the direct tier compares repetition counts and ignores RIR entirely, so a 12-rep-to-failure source can govern a 12-rep-at-RIR-3 target. That is the review's RH-3, and the evidence sharpens it — 3 reps of RIR is ~7 % of e1RM (§8.5), which is comparable to a whole tier's worth of formula error. **Rep-matching without effort-matching is not "direct evidence"; it is direct evidence about a different set.**

### 9.4 Are the ±1 and 2–3 rep tiers defensible?

The *tiering* is defensible; the *boundaries* are convention with a now-measurable cost. §13.3 quantifies each tier's formula-disagreement cost: distance ≤ 1 → ≤ 1.4 %; distance 2 → ≤ 3.1 %; distance 3 → 5.2 %. Both tiers stay below half the individual noise floor, so both are sound choices. The evidence cannot pick 1 versus 2, or 3 versus 4 — but it can now say that the *marginal* cost of widening "nearby" from 3 to 4 is a jump from 5.2 % to 7.5–10.8 %, which is where formula choice starts to matter as much as everything else. That is a real decision boundary and it is a better place to stop than distance 8.

### 9.5 Is high-rep-to-low-rep translation systematically riskier?

**Yes, for two independent reasons, and this is a finding neither internal document states.**

1. **Arithmetically, the formulas disagree more in that direction at equal distance.** Translating a 12-rep source down to lower-rep targets: distance 4 → **10.8 %** spread; distance 6 → 14.5 %. Translating a 5-rep source up to higher-rep targets: distance 4 → **7.5 %**; distance 6 → 12.9 %. (§13.3.)
2. **The error moves load upward.** A downward translation error produces a set that is too light — self-correcting within a session or two through the existing engine. An upward translation error produces a set that is too heavy — a failed set, at a heavier absolute load, which is exactly the event the upward cap exists to prevent.

Additionally, high-rep sources are the ones most affected by §8.6's 12-rep RIR break and by §7.4's formula bias, so a high-rep source is a *worse* source before the direction penalty is applied at all.

**Recommendation: the rep-distance limit should be directional** — tighter for high-rep source → low-rep target than the reverse. This is an arithmetic truth plus a risk-asymmetry judgment, not an empirical finding, and should be labelled as such.

---

## 10. Session and between-session reliability

### 10.1 The reliability ceiling

| Quantity | Typical error | Source |
| --- | --- | --- |
| **Measured** 1RM, test–retest 1–10 days | median **CV 4.2 %** (range 0.5–12.1 %), median ICC 0.97, 92 % of ICCs ≥ 0.90 — and stable across training experience, familiarisation count, single- vs multi-joint, upper vs lower body, sex and age | E1-E-11 (32 studies, n = 1 595) |
| **Measured** 1RM back squat, 3 sessions, strength-trained men | **CV 2.1 %**, ICC 0.99, SEM 2.9 kg on 140.3 kg | E1-E-12 |
| **Predicted** 1RM (load–velocity, best method) | **CV 5.7 %** reliability, SEE 10.6 kg / CV 7.4 % validity | E1-E-12 |
| **Predicted** 1RM (load–velocity, pooled IPD) | **SEE 9.8 % [7.4–12.2]**, mean overestimate 3.7 % [0.5–6.9] | E1-E-13 |
| **Predicted** 1RM (repetition equation, within-athlete, within 14 days, real logs) | **SD(log) 0.1026 ≈ 10.8 %** under Epley | E1-E-20 (preprint) |

**The load-bearing comparison: a *measured* 1RM varies by ~2–4 %; an *estimated* one by ~6–11 %.** Estimation roughly triples the noise. E1-E-12's authors state the consequence explicitly for their method — the prediction "cannot accurately modify sessional training loads because of large variability" — and E1-E-13's conclude "Practitioners should incorporate direct assessment of 1RM wherever possible."

Those conclusions are about velocity-based estimation, not repetition-based, and they are about elite-precision use cases rather than an advisory card. They do not forbid this feature. **They do forbid presenting the estimate as if it had the precision of a measurement, and they are the reason the design's "advisory, never auto-applied" boundary is the right one.**

### 10.2 Within-session variation and set order

E1-E-17 (15 trained men): repetition performance declined significantly between sets **starting at set 2** with 1-minute rest and **at set 3** with 3- and 5-minute rest, with RPE rising across sets in every condition. E1-E-20 states the modelling consequence plainly: "a set performed third in a sequence with 90 seconds of rest carries different information about maximal capacity than a first set performed with full recovery. **No existing 1RM prediction equation accounts for set order or accumulated within-session fatigue.**"

So within-session sets are **not** independent observations of the same quantity. They are a decaying sequence. Two consequences follow.

### 10.3 Is "one observation per session" right?

**Yes.** Treating a session's sets as one observation is the correct response to E1-E-17: they are correlated by fatigue and pooling them across sessions as if independent would understate uncertainty. The design's choice is well founded. The question is *which* statistic collapses them.

### 10.4 The lower median is not set-count invariant — reproduced

The evaluation's §7.4 states that with the lower median, "set count feeds confidence, not the value". **That is false under monotone within-session fatigue.** Reproduced from the evaluation's own §7.2 primitives, for 110 kg × 5 with RIR falling 3, 3, 2, 2, 1:

| Sets completed | Set e1RMs (kg) | Lower median |
| --- | --- | --- |
| 1 | 139.33 | **139.33** |
| 2 | 139.33, 139.33 | **139.33** |
| 3 | 139.33, 139.33, 135.67 | **139.33** |
| 4 | + 135.67 | **135.67** |
| 5 | + 132.00 | **135.67** |

Same load, same reps, same per-set effort trajectory: **139.33 kg for a three-set session, 135.67 kg for a five-set session — a −2.63 % difference produced entirely by set count.** With a longer taper (RIR 4, 4, 3, 3, 2, 2, 1, 0) the value steps down at sets 4 and 8. Because the lower median walks down a decaying sequence as that sequence lengthens, the tracked trend becomes partly a function of programmed volume.

Direction is conservative, which is why this is a defect rather than a hazard. But it means:

- a block that adds a set will show an apparent strength *decline*;
- a deload week that cuts sets will show an apparent strength *increase* (on top of being excluded anyway);
- the "current vs best" comparison is contaminated by set-count history.

**Fix, and it is small.** Make the session statistic depend on a fixed number of positions rather than all of them — e.g. the lower median of the **first up to three** qualifying sets at the modal load. That keeps outlier robustness (n = 3 still rejects one bad set), keeps the sub-modal exclusion, keeps the spread flag, and makes the value invariant to everything the athlete does after set 3. It is also better aligned with what a 1RM attempt measures: fresh capacity.

### 10.5 The disagreement thresholds are inside the noise band

Simulating well-behaved data (log-normal, no true change, 200 000 draws per cell) at four assumed dispersions — the lower end being a directly measured 1RM's median CV (E1-E-11) and the upper end the measured within-athlete e1RM dispersion (E1-E-20):

| SD(log e1RM) | pair spread > 10 % | pair spread > 20 % | 3-obs spread > 10 % | 3-obs spread > 20 % | best "unconfirmed" (4 obs) |
| --- | --- | --- | --- | --- | --- |
| 0.042 (measured-1RM CV, E1-E-11) | 11 % | 0 % | 21 % | 0 % | 1 % |
| 0.060 | 26 % | 3 % | 46 % | 5 % | 7 % |
| 0.080 | 40 % | 11 % | 65 % | 18 % | 16 % |
| **0.1026 (measured e1RM, E1-E-20)** | **51 %** | **21 %** | **77 %** | **35 %** | **26 %** |

Reading this against the proposed constants:

- **`NEARBY_POOLED_DISAGREE_PCT = 10`** — fires on 11–51 % of well-behaved pairs. At the realistic end it is a coin flip. It caps confidence at `low` and substitutes the lower of two numbers, so half the time it degrades a perfectly good suggestion.
- **`POOL_SPREAD_MEDIUM_PCT = 10`** — fires on 21–77 % of well-behaved triples. At the realistic end, `current` is capped at `medium` almost always, and the confidence vocabulary carries no information.
- **`POOL_SPREAD_LOW_PCT = 20`** and **`PAIR_DISAGREE_PCT = 20`** — fire on 0–35 % and 0–21 %. `PAIR_DISAGREE_PCT` **suppresses the suggestion entirely**; at the realistic end, one two-observation case in five is refused for nothing but ordinary noise.
- **`BEST_UNCONFIRMED_PCT = 10`** — mislabels 1–26 % of genuine bests. This is the best-calibrated of the family, because 10 % is about one SD and "one SD clear of the field" is a reasonable definition of *unconfirmed*.

**The honest caveat.** E1-E-20's 0.1026 is measured across tuples that deliberately mix rep counts and weights, so it bundles formula misspecification with true performance variation. For observations at *similar* rep counts it is an over-estimate. But `currentE1RM` is defined in the evaluation's §8 to pool **"all eligible rep ranges"** — which is exactly E1-E-20's tuple construction — so for that quantity 0.1026 is the right reference, and even the conservative 0.042 row shows the 10 % thresholds firing on 11–21 % of clean data.

**Recommendation.** Either raise the disagreement thresholds to roughly **2 SD of the reference noise** (≈ 25–30 % for a pair, ≈ 30–35 % for a triple) so that firing actually means something, or — better — stop expressing them as fixed percentages and express them as multiples of a named, documented noise constant, so that a future recalibration is a one-line change with a stated basis. `BEST_UNCONFIRMED_PCT = 10` can stay.

### 10.6 The 15 % session-spread flag is nearly unreachable

`SESSION_SETS_INCONSISTENT` fires when `(max − min) / median > 15 %` across a session's eligible sets. At a constant load, the only thing that varies is `RTF = reps + RIR`, and each rep of RTF is worth 2.2–3.0 % (§8.5). Enumerating exhaustively: **the flag requires an RTF range of at least 6 across the session's modal-load sets** (7 once the lowest RTF reaches 8). Realistic trajectories do not reach it:

| Session (110 kg × 5) | Spread | Flag at 15 % |
| --- | --- | --- |
| RIR 2, 2, 2 | 0.00 % | no |
| RIR 3, 2, 1 | 5.40 % | no |
| RIR 3, 3, 2, 2, 1 | 5.40 % | no |
| RIR 4, 3, 2, 1, 0 | 10.81 % | no |
| RIR 5, 4, 3, 2, 1 | 10.53 % | no |

So at a constant load the flag is effectively dead; it will fire almost exclusively when loads are mixed, which already has its own flag (`MIXED_LOADS_IN_SESSION`). This is an *evidence-derived* instance of the same family of defects the review found by code inspection (RM-4, RM-5, unreachable reason codes). Either lower the threshold to around **8–10 %** — where it would distinguish a hard taper (RIR 4→0) from a controlled session — or drop it and let `MIXED_LOADS_IN_SESSION` carry the signal.

### 10.7 Top sets versus back-off sets

The evaluation's §7.5 example D (140 × 3 @ RIR 1, then 3 × 110 × 8) resolves to a session observation of **143.00** while the top set implies **158.67** — the modal-load rule discards the top set as sub-modal. The review's RH-4 flags this as a 22 % understatement on top-set days. The evidence adds a second, independent reason it is wrong:

**The top set is the *most accurate* observation available, and the modal rule discards precisely it.** Reynolds 2006: R² for predicting 1RM was 0.993 (chest press) and 0.974 (leg press) from a 5RM, falling to 0.955 and 0.915 from a 20RM. Mayhew 2008: restricting to ≤ 10 RTF nearly eliminates bias. E1-E-17: the top set, performed first, is the least fatigue-contaminated. On a top-set/back-off day the design throws away the lowest-rep, freshest, least-biased observation and keeps the highest-rep, most-fatigued, most-biased one.

**Recommendation:** when a session contains a distinct heavier low-rep set followed by lighter higher-rep sets, either take the *maximum* of the qualifying sets' e1RMs with an explicit flag, or emit two observations (a top-set observation and a back-off observation) and let the tier selection choose. Do not silently prefer the back-off. The evaluation already anticipates revisiting this when `perSet` schemes arrive (its D-4); the evidence says it is wrong *now*, not later.

### 10.8 How many sessions are needed?

**`Ø-8`: no source evaluates this.** What can be said arithmetically: with per-observation SD ≈ 10 %, the standard error of a three-observation median is roughly 6–7 %; of a five-observation median roughly 5 %. Three is the minimum count at which a median can reject a single outlier, which is the evaluation's stated reason and remains the only defensible one. Note also E1-E-20's window-size analysis — dispersion was 0.1034 at 7 days, 0.1028 at 14, 0.1043 at 28 — meaning **true strength change over four weeks is small relative to observation noise.** Pooling over weeks costs almost nothing in staleness and buys real precision. That is a mild argument for pooling *more* than three sessions, not fewer.

---

## 11. Recency and detraining evidence

### 11.1 What the literature establishes

| Finding | Source |
| --- | --- |
| Training cessation reduces maximal force, SMD **−0.46 [−0.54, −0.37]**, with a **continuous dose–response** between decline and cessation duration; effect larger in adults > 65 and in previously inactive people than in recreational athletes | E1-E-14 (103 studies) |
| Training-induced strength gains were **retained versus non-exercise controls through 16–24 weeks** of detraining, and had converged with controls by 32–48 weeks | E1-E-15 (20 trials) |
| Strength can be **maintained for 4–8 weeks on reduced volume and frequency provided intensity is preserved**, and for up to 32 weeks on a minimal dose — intensity being the key variable | E1-E-16 (narrative review) |
| One week of complete cessation: no measurable hypertrophy cost, some strength cost, in one narrow protocol | `EVIDENCE-025` / B6 |

### 11.2 Are 21, 42 and 90 days supported?

**No. `Ø-9`: nothing in the literature identifies a threshold at, or anywhere near, 21, 42 or 90 days.** The decay is continuous and slow. Every retrieved source points the same way: over the horizons these constants cover, a resistance-trained adult's strength changes *less* than the ±10 % noise in the estimate itself.

That has a specific and slightly uncomfortable implication for the design's framing:

> **Over a 90-day window, observation noise dominates real strength change.** E1-E-20 measured near-identical dispersion at 7, 14 and 28 days; the detraining literature says meaningful loss takes months of cessation. So the 90-day window is not primarily a *staleness* control — it is a *sample* control. Presenting it to the user as "your estimate expires because you might have detrained" would be a claim the evidence does not support. Presenting it as "we only look at the last three months of training" is honest and needs no science at all.

Similarly, the 21/42-day confidence tiers are not measuring physiological decay. What they actually measure is *how long it has been since we had evidence*, which is a data-freshness statement. It should be worded as one.

### 11.3 Physiology versus a product freshness rule

| | |
| --- | --- |
| **Physiological evidence supports** | that strength decays slowly and continuously after cessation; that reduced training with preserved intensity holds it for 4–8 weeks and beyond; that a post-deload dip is expected (`EVIDENCE-025`, B6 — and B6 explicitly names "a tracked strength metric (e.g. a 1RM estimate)", so the corpus already anticipates this exact framing) |
| **Physiological evidence does not support** | any specific threshold; any decay function; any per-day weighting; any claim that a 90-day-old estimate is *wrong* rather than merely *unrefreshed* |
| **A product freshness rule is a legitimate, independent thing** | It answers "how old may the evidence be before we stop asserting a current value?", which is a product question about honesty, not a physiological question. It needs no evidential basis — only an honest label. |

**Verdict: keep the windows; relabel them.** Drop any detraining rationale from the copy and from the design document's justification. Say "based on the last 90 days of training" and "most recent session 6 weeks ago", not "your strength may have declined".

### 11.4 Calendar days versus rolling instants

The review's RM-3 argues the 90/21/42-day windows should be **account-timezone calendar dates**, matching the repository's established convention (PI-002; `started_at` doubles as the training date), rather than rolling instants that flip a boundary session in or out depending on the hour of the fetch.

**The evidence makes this an easy call, and strengthens it.** Because none of the three durations has any physiological basis, there is *no* cost to snapping them to calendar boundaries — there is no true quantity being approximated whose fidelity would suffer. Meanwhile the benefit is real and matters more here than in most features: this is a *derived-on-read* value with no persisted state, so a non-deterministic window means the same underlying facts can produce two different displayed estimates within one day, with no user-visible cause. **Calendar-day boundaries are preferable even though the durations themselves stay heuristic — and precisely because they do.**

---

## 12. Equipment-specific findings

### 12.1 The measured stratification

E1-E-20 (preprint) reports within-athlete, within-14-day dispersion of a classically computed e1RM stratified by equipment class inferred from exercise names:

| Equipment | Exercises | Tuples | Mean weight | SD(log e1RM), classical equation | Relative to barbell |
| --- | --- | --- | --- | --- | --- |
| Barbell | 81 | 27 583 | 61.8 kg | **0.0832** | — |
| Other | 115 | 27 961 | 49.7 kg | 0.1025 | +23 % |
| Dumbbell | 99 | 35 151 | 17.3 kg | 0.1053 | +27 % |
| Machine | 43 | 25 371 | 51.5 kg | 0.1081 | +30 % |
| **Cable** | 50 | 19 664 | 30.2 kg | **0.1196** | **+44 %** |

The author's own interpretation is that this tracks mean load rather than equipment *per se* — light exercises have a steeper rep-to-1RM curve than the classical fixed conversion factor assumes, and cable and dumbbell exercises are light. Note also the deliberate check the author reports: if logging conventions (stack settings, per-hand dumbbells) were driving the pattern, machines and cables would diverge from each other; they do not, both landing where their mean weights predict.

### 12.2 Within-athlete trends versus absolute prediction — the distinction that resolves O-7

This is the distinction that decides the equipment question, and it is the one place where the review's reasoning goes wrong.

- **A stable per-exercise multiplicative bias cancels in a within-athlete trend.** If every e1RM on the cable row is 12 % high, every week, then week-over-week ratios, the "current vs best" comparison, and the direction of the trend are all unaffected. **The review is right, and O-7 is correct for the tracker.** E1-E-20 makes the same argument from the other side: "This does not affect within-exercise comparisons — all tuples in our analysis compare sets from the same user on the same exercise."
- **Rep-invariance error does not cancel.** It is the error made when the *same* athlete on the *same* exercise produces different e1RM estimates from different (weight, reps) combinations — which is exactly the quantity in §12.1's table, and exactly the quantity the load-translation tier consumes when it converts a 12-rep observation into a 5-rep prescription. **Here the review's inference is wrong**: a bias argument does not license ignoring a variance difference, and the variance difference is 44 % between cable and barbell.

**Verdict on O-7: split it.** No confidence penalty for the **estimate/trend** on dumbbell, cable, machine or unilateral work — that is well founded. A confidence penalty (or a tighter rep-distance limit) for a **translated suggestion** on cable, dumbbell and machine exercises — that is what the only available measurement says.

### 12.3 What cannot be supported without richer measurement semantics

Each of these is a case where the logged number does not mean what the formula assumes it means. None can be rescued by better statistics.

| Case | Status | Basis |
| --- | --- | --- |
| **Bodyweight and weighted bodyweight** | **Exclusion supported.** The logged number is added load only, so it is not monotone in total resistance and the rep–load relation is undefined without a bodyweight join and a leverage fraction. | E1-E-20 excluded "bodyweight and assisted exercises (e.g., pull-ups, dips, assisted chin-ups; for these exercises, the recorded weight reflects only the *added* weight, not the total resistance the user is working against, making 1RM estimation ambiguous)" — independent convergence with the evaluation's D-3, and `Ø-5` found nothing supporting inclusion |
| **Assisted movements** | **Exclusion supported, and required.** On an assisted machine a *larger* logged number means an *easier* set — the relation is inverted, not merely offset. No equation can consume that. This holds regardless of the sign-convention dispute between the evaluation (§4.3, "sign-inverted load") and the review (RL-7, which found no such convention in the repository and notes a non-negativity check makes it impossible): whichever is true of the code, the *semantics* are inverted and the exercise must be excluded. | Same as above |
| **Per-hand versus total dumbbell load** | **Unmodellable; harmless within one exercise, fatal across exercises or if the convention changes.** E1-E-20 documents the same problem in the same words and resolves it the same way: conventions "are consistent within and across users by design of the app's interface, but they mean that the absolute weight values reflect different things for different equipment types. This does not affect within-exercise comparisons." | E1-E-20 |
| **Changing machine or cable configurations** | **Unsupportable.** A stack setting "is not directly comparable across manufacturers" (E1-E-20), and neither is the same machine after a pulley or seat change. Because the design's entire defence is that a *stable* per-exercise bias cancels, a configuration change silently breaks the one assumption the feature rests on — and nothing in the data can detect it. | E1-E-20; §12.2 |
| **Time- or distance-based work (PI-005, Plank, Farmer's Carry)** | **Exclusion supported.** E1-E-20 excluded "non-resistance exercises (cardio, mobility, and timed exercises, which do not involve the kind of load–repetition tradeoff that 1RM equations describe)". | E1-E-20 |
| **Unilateral exercises** | **Eligible "as logged", same as dumbbells.** No evidence bears on it directly; the within-exercise-convention argument applies unchanged. | §12.2 |

**One consequence worth stating explicitly.** The design has no way to detect a convention change (per-hand → total, a new machine, a pulley height change). The only honest mitigations are (a) the per-exercise on/off switch the evaluation already proposes (O-2), and (b) copy that never claims comparability beyond "the unit you log". Neither is evidence; both are necessary.

---

## 13. Load-translation evidence

### 13.1 Direct evidence: there is none

**`Ø-10`: no retrieved source studies translating a load between repetition schemes.** Everything in this section is either arithmetic (§13.3) or transferred from adjacent questions.

### 13.2 The nearest empirical evidence, and it is genuinely mixed

Two syntheses ask the closest available question — does adjusting load from performance/effort feedback beat a fixed percentage prescription?

- **E1-E-18 (Hickmott 2022, 6 load-autoregulation studies, 133 participants): no significant difference.** MD 2.07 kg [−0.32, 4.46], p = 0.09, SMD 0.21 for 1RM strength.
- **E1-E-19 (Huang 2025 network meta-analysis): autoregulation ranks above percentage-based** by SUCRA (back squat: APRE 93.0 %, RPE 66.8 %, VBRT 27.0 %, PBRT 13.2 %) — **but for the back squat "no moderate/large effect sizes were observed between interventions"**, i.e. the ranking is not backed by credible pairwise differences on that lift. For the bench press the difference was credible (PBRT vs APRE SMD −0.83 [−1.22, −0.44]).

**Honest reading: adjusting load from the athlete's own recent performance is, at best, modestly better than a fixed percentage prescription, and two syntheses disagree about whether the difference is real.** These do not test this feature — they test multi-week programming methods, not a one-off starting-load card after a scheme change. They are worth one sentence of context and nothing more. Notably, **they weakly support the design's *architecture* rather than its numbers**: using the athlete's own recent evidence is at least as good as a percentage table, which is precisely the "within-athlete history over generic conversion" principle of §9.

### 13.3 Cross-formula disagreement as a measurable proxy for translation uncertainty

Because no study measures translation error directly, the cleanest available bound is arithmetic: **how much does the answer depend on which convention you picked?** If five equally unvalidated conventions disagree by 19 %, then at least 19 % of the answer is arbitrary, whatever the physiology.

Translating a 100 kg source, spread of translated load across Epley / Brzycki / Lombardi / O'Conner / Wathan:

| Rep distance | Low-rep source → higher-rep target (source RTF 5) | High-rep source → lower-rep target (source RTF 12) |
| --- | --- | --- |
| 0 | 0.0 % | 0.0 % |
| 1 | 1.4 % | — |
| 2 | 3.1 % | 5.9 % |
| 3 | 5.2 % | — |
| 4 | 7.5 % | **10.8 %** |
| 5 | 10.1 % | — |
| 6 | 12.9 % | **14.5 %** |
| 7 | 16.0 % | 15.9 % |
| 8 | **19.2 %** | **16.7 %** |
| 9 | 22.7 % | 16.8 % |
| 10 | 26.4 % | — |

Benchmarked against the ≈ 10 % individual noise floor of §10.1 and the 10 % upward cap:

- **Distance ≤ 1** (the direct tier): ≤ 1.4 %. Formula choice is irrelevant. **Excellent.**
- **Distance 2–3** (the nearby tier): ≤ 5.2 % / 5.9 %. Half the noise floor. **Sound.**
- **Distance 4–5**: 7.5–10.8 %. Formula choice now matters as much as everything else combined. **A defensible outer limit.**
- **Distance 6** (`FAR_REP_DISTANCE`, "confidence low"): 12.9–14.5 %. Already exceeds the entire upward cap. Confidence labelling does not fix an arbitrary number.
- **Distance 8** (`MAX_REP_DISTANCE`): **16.7–19.2 %.** The choice of convention alone moves the suggestion by nearly a fifth. **Not defensible at any confidence label.**

**This is the single most actionable arithmetic result in this research.** `MAX_REP_DISTANCE` should be about **4**, not 8.

### 13.4 The proposed conservative measures, one at a time

| Rule | Verdict | Basis |
| --- | --- | --- |
| **Round the suggested load *down* to `loadStepKg`** | **Supported in direction, with one interaction to watch.** Rounding down is free conservatism when the step is small relative to the load. It is not free on light machine work: with the `machine` default step of 5.0 kg, a 20 kg suggestion can be floored by up to **25 %**, a 40 kg one by 12.5 %. And light exercises are exactly where the formula is least trustworthy (§12.1), so the two conservatisms stack. Consider capping the floor discount (e.g. floor, but never by more than ~5 % — fall back to nearest below that). | Arithmetic; E1-E-20 |
| **Upward cap at 110 % of the heaviest recent working load** | **Need and direction: supported. Value: convention — but with a defensible calibration.** The need is established by the individual-level error: ≈ ±10 % (1 SD) from four sources, so an uncapped translation *will* sometimes emit a load 10–20 % too heavy, and error is multiplicative in load, so on a heavy compound that is a real failed-set event. 1.10 is about **one SD of the estimation error** — capping an excursion at one noise unit is a coherent choice, and a far better justification than "it seemed conservative". The exact number remains a product judgment; its *order of magnitude* is now defensible. **The cap must apply to every tier**, including the direct tier, which the review found bypasses it (RH-3). | E1-E-01, E1-E-02, E1-E-13, E1-E-20 |
| **Refuse targets near maximal effort (`TARGET_RTF_MIN = 3`)** | **Supported in direction; the value is convention.** At RTF < 3 the multiplier is within 10 % of 1, the extrapolation is minimal, and the consequence of an error is a near-maximal attempt from an advisory card. Refusing is right. Nothing sets 3 rather than 2 or 4. | Judgment; §7.2 |
| **Refuse large rep-distance translations** | **Supported, and the current limit is too loose.** See §13.3. | Arithmetic |
| **Return one suggested load rather than a range** | **A defensible product judgment, in tension with the evidence.** The honest object is a band of roughly ±10 % (1 SD). A single number is a usability choice; the evaluation's proposed secondary line ("≈ 92.5–97.5 kg depending on effort") is the right mitigation and should be treated as **required copy**, not optional. What must *not* happen is a single number presented with no uncertainty cue at all. | E1-E-02, E1-E-13 |
| **Use the target RIR band's maximum** | **Supported in direction; convention in size.** Band max → lighter start → conservative. Note it is worth real load: 3 reps of RIR is ≈ 7 % of e1RM (§8.5), i.e. most of the upward cap's headroom, applied in the safe direction. | Arithmetic |
| **Effort-matched translation when source RIR is missing** | **Supported, and correctly reasoned in the evaluation.** Using a lower-bound basis *and* a band-max target RIR double-discounts. Matching effort (RIR 0 on both sides) removes one of the two. The evaluation's O-6 gets this right; the review's RM-12 correctly identifies where the design then violates it on a mixed basis. | Arithmetic; §8.3 |

---

## 14. Direct answers to RG-1 … RG-8

### RG-1 — Accuracy of Epley versus alternatives by rep range, exercise, and training status; is any equation defensible above 10 reps to failure?

**Partially answerable, and the answer is "no equation is defensible above 10–12 reps to failure".**

- **By rep range.** Restricting to ≤ 10 reps to failure nearly eliminates *bias* (Welday/Epley +5.3 % → +0.5 % pre-training; +6.5 % → −0.7 % post-training) and barely touches *scatter* (11.0 % → 10.2 %; 12.5 % → 10.6 %) — E1-E-01. Independently, prediction R² decays from 0.993/0.974 at 5RM to 0.955/0.915 at 20RM — E1-E-05.
- **By exercise.** Dominant. ~11 percentage points between bench press and leg press at 80 % 1RM, versus ~1.7 points across the whole 70–90 % 1RM range (§7.5). Every equation underestimated the deadlift (E1-E-03).
- **Free weights vs machines.** Thin, mixed, and the one machine-specific study is in sedentary adults aged 53.6 (E1-E-04). No equivalence claim is supportable.
- **Training status.** Little effect on the reps–%1RM relation (E1-E-02, E1-E-06) — but sporting background can double repetitions at 70–80 % 1RM (E1-E-07).
- **Above 10 reps.** **No.** Mayhew states the field recommendation explicitly and identifies the linear equations as the worst offenders. Brzycki is catastrophic there (ICC 0.24 over the full range). Where a wide range is unavoidable, exponential forms held up better — "less bad", not validated.
- **Epley specifically.** Defensible as a *choice among conventions*: it was one of only four equations in Mayhew's ≤ 10-RTF analysis not significantly different from actual 1RM at either time point, and the four classical benchmarks are near-indistinguishable in within-athlete consistency (spread < 6 %). It is **not** defensible as "the safest shape at high reps" — the true relation is a spline, not a line (E1-E-02), and the optimal conversion factor varies with load (E1-E-20).
- **Group means are not individual predictions**, and this gate must be answered at the individual level: 57–67 % of individuals within ±2.3 kg under the best equation (E1-E-01); pooled SEE 9.8 % (E1-E-13).

### RG-2 — Validity of `reps + reported RIR` as reps-to-failure for 1RM prediction

**Unvalidated (`Ø-1`), and the RIR half is measured under a different task from the one the app performs (`Ø-2`).**

- The composition has never been tested against a measured 1RM.
- Error propagation is forced by the formula at 2.2–3.0 % of e1RM per rep of RIR error (§8.5, verified).
- The pooled RIR error direction is **under**-prediction of reps to failure by 0.95 reps [0.17, 1.73] (E1-E-08), which biases e1RM **down** — conservative.
- Between-person systematic bias is SD 1.45 reps [0.99–2.12] (E1-E-08) ≈ ±3.5–4.4 % of e1RM — **person-constant, therefore largely cancelling within an athlete's own series and fully present in the absolute number.**
- **Does the error differ at RIR 3–4?** EVIDENCE-030 found 1-RIR and 3-RIR **statistically equivalent** within ±1 rep. E1-E-08's proximity effect is small with an interval touching zero; E1-E-10 found a significant proximity main effect. **Directionally yes, statistically not confirmed.** EVIDENCE-014 must not be cited as if it settled this.
- **It does differ sharply by set length:** β = 0.06 at ≤ 12 reps to failure versus **β = 0.47 above 12** (E1-E-08). This is the finding the gate should be closed on.

### RG-3 — Individual variability of the reps-at-%1RM relationship: how large, and does it justify the direct/nearby tiers?

**Large, exercise-dominated, and yes — emphatically.**

Between-individual SD is 2.51 reps at 80 % 1RM and 4.36 at 60 % (E1-E-02), i.e. ±6.7 to ±8.7 percentage points of implied e1RM at 1 SD, growing as load falls. Sporting background can double repetition capacity at 70–80 % 1RM (E1-E-07). Exercise identity is the only clear moderator and is worth ~11 percentage points between two common lifts (§7.5).

**This justifies the tier hierarchy more strongly than the evaluation claims.** Direct same-rep evidence bypasses every one of these error sources; the nearby tier costs ≤ 5–6 % of formula disagreement; the remote tier re-imports the lot. The hierarchy is not a nicety — it is the mechanism by which the design avoids the literature's largest error terms.

### RG-4 — Strength decay after inactivity, to ground the 90-day expiry and the age tiers

**The decay is real, continuous, and slow — and it grounds nothing at 21, 42 or 90 days (`Ø-9`).**

Maximal force SMD −0.46 with a continuous duration dose–response (E1-E-14); gains retained versus controls through 16–24 weeks of detraining (E1-E-15); strength maintained 4–8 weeks and beyond on reduced volume with preserved intensity (E1-E-16). Over the horizons these constants cover, real change is smaller than the estimate's own ±10 % noise. **Keep the windows as a data-freshness rule, relabel them, and drop the detraining rationale from the justification and the copy.** Prefer calendar-day boundaries (§11.4): there is no physiological quantity being approximated, so determinism is free.

### RG-5 — Minimum sessions and session-to-session variability of an RIR-adjusted e1RM, to ground the three-session median and the 10/20 % thresholds

**The variability is now quantified. The thresholds do not survive it, and the session count is unstudied (`Ø-8`).**

- Measured 1RM: median CV 4.2 % (E1-E-11); 2.1 % in one strength-trained squat sample (E1-E-12).
- Estimated 1RM: CV 5.7 % (E1-E-12), SEE 9.8 % (E1-E-13), within-athlete SD(log) 0.1026 (E1-E-20).
- **Against that noise floor, `NEARBY_POOLED_DISAGREE_PCT = 10` fires on ~51 % of well-behaved pairs, `POOL_SPREAD_MEDIUM_PCT = 10` on ~77 % of well-behaved triples, and `PAIR_DISAGREE_PCT = 20` suppresses ~21 % of them outright** (§10.5). Even at the most optimistic dispersion the 10 % thresholds fire on 11–21 % of clean data. Recalibrate to ~2 SD, or express them as multiples of a documented noise constant.
- Three sessions is defensible only on the stated grounds (minimum count for a median to reject one outlier). E1-E-20's flat 7-/14-/28-day dispersion mildly favours pooling *more*.
- **Additionally: the lower median is not set-count invariant** (§10.4), which contradicts §7.4's own claim and makes the trend partly a function of programmed volume.

### RG-6 — Do machine and cable rep-load relationships behave like free-weight ones?

**No, and there is now a number.**

Within-athlete e1RM dispersion under a classical equation: barbell 0.0832, other 0.1025, dumbbell 0.1053, machine 0.1081, **cable 0.1196** (E1-E-20). Cable is ~44 % noisier than barbell, machine ~30 %, dumbbell ~27 %. Nuzzo's decisive bench-vs-leg-press split is itself partly a free-weight/machine split, and E1-E-04 found heterogeneous equation agreement across ten machine exercises (in sedentary older adults).

**But this does not require separate domains — it requires a split verdict on O-7.** A stable per-exercise bias cancels in the within-athlete *trend*, so no confidence penalty is needed there. Rep-invariance *variance* does not cancel and is what the *suggestion* consumes, so a penalty (or a tighter rep-distance limit) is warranted there. See §12.2.

### RG-7 — Sex- and age-specific differences in the reps-to-%1RM relationship

**The best synthesis found no clear moderation; older and smaller studies disagree; the narrowed copy rule is the right resolution.**

Nuzzo 2024, verbatim: "sex, age, and training status did not clearly moderate the REPS ~ %1RM relationship" — and the authors declined to publish sex- or age-specific tables while publishing exercise-specific ones. Against that: Hoeger 1990 found a significant sex difference across seven lifts, and single-joint/light-load studies find women completing more repetitions at the same relative load. 1RM test–retest reliability is stable across sex and age (E1-E-11), and RIR accuracy shows no sex effect (E1-E-10, p = 0.917) and no training-experience effect (E1-E-10 p = 0.462; E1-E-08 β = −0.006 [−0.02, 0.007]).

**Verdict.** The review's proposal to narrow RG-7 to a copy rule — "this does not generalise beyond your own history" — is correct and should be adopted. But do not upgrade this into "sex makes no difference": Nuzzo's null is pooled and load-weighted, and GAP-09 stands. In a single-user app the point is largely moot, which is itself the best argument for the copy rule.

### RG-8 — Do starting-load suggestions after a scheme change improve session quality?

**Unknown. No study exists (`Ø-6`).**

The nearest evidence is the autoregulation literature, and it is mixed: no significant difference for load autoregulation versus percentage-based prescription in one meta-analysis (E1-E-18, MD 2.07 kg [−0.32, 4.46]); a favourable SUCRA ranking in a network meta-analysis whose back-squat comparison showed no moderate or large effects between interventions (E1-E-19). Neither tests a starting-load card after a rep-scheme change, neither measures completion, RIR adherence, failed-set frequency, or confidence, and neither can close this gate.

**Absence of evidence is not evidence of no value.** The correct response is the evaluation's own: ship it as an advisory convention, claim nothing, and — as its RG-8 already proposes — let the owner run a before/after comparison on their own data once suggestions are recorded. That is an n-of-1 observation, not evidence, and must never be promoted past `user-specific observation` in the four-tier hierarchy.

---

## 15. Audit of the architecture review's literature claims

The review's §10.1 is careful, honestly caveated, and mostly correct — notably including its own statement that these sources "may not be cited in a design document until they enter the registry", which is the right boundary and was observed. Eight claims were audited; **four verified, three verified-with-material-corrections, one partially unverifiable.** Two additional errors were found in claims the audit list did not name.

### 15.1 Mayhew et al. 2008 — numbers correct, four attribution errors, one population omission

**Claim:** "Epley (as Welday) was tested by Mayhew et al. 2008 (n = 103, bench press, RTF 2–30): constant error **+5.3 ± 11.0 %** over the full range, falling to **+0.5 ± 10.2 %** when restricted to RTF ≤ 10."

**Verdict: the two numbers are correct and correctly paired, but four things around them are wrong.**

1. **They are "% Error", not "constant error".** The paper reports both, and they are different columns with different units. Welday's *constant error* is **+1.4 ± 4.2 kg** (full range) and **+0.1 ± 2.8 kg** (RTF ≤ 10).
2. **Both are pre-training values only.** Post-training: **+6.5 ± 12.5 %** (full range) and **−0.7 ± 10.6 %** (RTF ≤ 10). The restricted post-training value is a slight *under*-estimate, which the review's framing would not predict.
3. **The ≤ 10-RTF analysis is a subsample, not n = 103**: n = 46 pre-training and n = 45 post-training.
4. **The population is omitted entirely.** This is 103 **untrained-to-novice college women**, mean age 19.1 ± 1.2, whose resistance-training background "ranged from never having used weights to infrequent training over the previous 2 years", performing a free-weight bench press only. The review uses it as the general anchor for "Epley across rep ranges". `evidence-to-design.md` §3 rule 1 and GAP-09 exist to catch exactly this.
5. Minor: "RTF 2–30" is the union of two ranges — pre-training 2–20, post-training 1–30.

**What survives, and it is the load-bearing part:** the derived conclusion that restricting the domain nearly eliminates bias while barely touching between-individual scatter is **verified** in both time points (11.0 → 10.2 %; 12.5 → 10.6 %), and "≈ ±20 % for a 95 % interval on one athlete" follows arithmetically (1.96 × 10.2 = 20.0 %).

**Three facts in this paper the review missed, all of which help the design:**

- Welday/Epley was one of only **four** equations (with Cummings & Finn, Mayhew and Wathen) producing predictions not significantly different from actual 1RM at *either* time point in the ≤ 10-RTF analysis. Epley is not the weak choice the review's framing implies.
- **Brzycki over the full range was catastrophic** — constant error +7.2 ± 23.7 kg, % Error +26.7 ± 101.7 %, ICC **0.24** — as was Lander, the other reciprocal-linear form. This is direct empirical confirmation of the evaluation's warning about Brzycki's pole, and it is a stronger argument against Brzycki than anything in either internal document.
- **The group-versus-individual gap is stark and is exactly what this task asked to preserve:** most equations were "not significantly different" on average, while only 57–67 % of individuals fell within ±2.3 kg of their own prediction.

### 15.2 Nuzzo et al. 2024 — verified, and understated

**Claim:** meta-regression of 952 RTF tests, ≈ 7 289 individuals, 269 studies; exercise the only meaningful moderator; separate bench/leg-press tables; sex, age and training status had little influence; between-individual SD grows as load falls.

**Verdict: VERIFIED in every particular.** Counts confirmed (952 tests / 7 289 individuals / 452 groups / 269 studies; 898 / 6 970 / 425 analysed). Moderator conclusion verbatim: "sex, age, and training status did not clearly moderate the REPS ~ %1RM relationship; thus, estimates… can be applied to most individuals and most exercises." Exercise split verbatim: leg press 13.1 [9.8–17.5] and 19.0 [14.2–25.5] at 80 % and 70 % 1RM, bench press 8.8 [7.7–10.1] and 14.1 [12.4–16.1]. SD verbatim: 2.51 reps at 80 % 1RM, 4.36 at 60 %.

**Two refinements, both of which strengthen the review's own conclusion:**

- The review does not use Nuzzo's model-form result, which is the **single most direct empirical refutation of "Epley's linear shape is the safest for the extended band"**: "Fit statistics favored the natural cubic spline model and Bayes factors indicated that there was strong evidence favoring the natural cubic spline model as being a more probable description of the data generating process compared with all other models."
- "Exercise was the only meaningful moderator" understates the magnitude. Converted through Epley, the exercise effect is **~11 percentage points** of e1RM bias at 80 % 1RM (bench +3.5 %, leg press +14.9 %), versus ~1.7 points across 70–90 % 1RM. Exercise identity is not merely the only moderator; it is roughly an order of magnitude larger than rep range.

### 15.3 Wood et al. 2002 — partially verified; one material omission; specifics not independently confirmable

**Claim:** "applied seven equations across ten machine exercises and found chest press, incline chest press, shoulder press and leg extension **lacked similarity across all equations**."

**Verdict: the study, the seven equations and the ten machine exercises are confirmed. The specific four-exercise claim could not be verified. One material population fact is omitted.**

Confirmed: Wood TM, Maddalozzo GF, Harter RA, *Measurement in Physical Education and Exercise Science* 6(2):67–94, 2002, doi:10.1207/S15327841MPEE0602_1; seven equations; ten exercises (biceps curl, chest press, high lat pull, incline chest press, leg curl, leg extension, low lat pull, leg press, shoulder press, triceps extension) on **Hammer Strength Iso-Lateral plate-loaded** machines.

Omitted by the review: the sample is **49 apparently healthy *sedentary* adults (26 M / 23 F), mean age 53.6 ± 3.3 years.** That is not the population this feature serves, and the omission matters more here than usual because the review uses this source to make a general claim about machines.

Not verified: the full text is paywalled (HTTP 403 from the publisher; the Semantic Scholar record returned empty). The four-exercise "lacked similarity" claim is therefore recorded as **not independently verified** — not as refuted. The broader conclusion it is used for ("machines behave like free weights is not supported") is independently supported by E1-E-02's bench/leg-press split and E1-E-20's equipment stratification, so the review's conclusion stands on other legs.

Also worth noting: Hammer Strength Iso-Lateral machines are **plate-loaded and independently loaded per side** — arguably the *most* barbell-like machine family there is. Using this study as the general machine reference, without saying so, understates rather than overstates the machine problem.

### 15.4 "Epley's increasing high-rep bias" — direction defensible, universality overstated, and the argument is not the strongest available

**Claim (RM-13):** the reps–%1RM relation is curvilinear while Epley is linear, so Epley "systematically overestimates as reps grow"; Mayhew's measured bias for Epley goes from +0.5 % (RTF ≤ 10) to +5.3 % (RTF 2–30); therefore the RTF 11–15 extension is non-conservative.

**Verdict: the premise about curvilinearity is verified twice over; the bias-growth claim is supported by one reference curve and contradicted by the other; the quoted number is being used for something it does not measure; the conclusion is right for a different reason.**

- **Curvilinearity: verified twice.** Mayhew's own Figure 4 (`%1RM = 90.575·e^(−0.0152·reps)`, r² = 0.59, described as "a substantial curvilinear nature") and Nuzzo's formal spline preference over all other model forms.
- **Bias growth: contested.** Against Mayhew's fitted curve Epley's bias rises monotonically (−2.1 % at 5 reps → +3.7 % at 10 → **+8.2 % at 15** → +11.4 % at 20). Against Nuzzo's point estimates it is roughly flat over the relevant band (+5.0 % → +6.7 % → +5.0 %). Both curves agree there *is* a positive bias of order 5–8 % in the 11–15 region; they disagree about whether it grows there. (§7.4.)
- **The quoted number does not measure the 11–15 band.** +5.3 % is the whole-sample pre-training % error over RTF 2–20; +0.5 % is the ≤ 10-RTF subsample. The difference between them is not "the bias of RTF 11–15"; it is the difference between two overlapping samples, one of which includes everything from 11 to 30.
- **The "mildest high-rep growth among the non-flat formulas" justification in the evaluation is genuinely wrong**, and the review is right to attack it: the qualifier carves out exactly the flatter shapes (Lombardi 1.311 and O'Conner 1.375 at r = 15, versus Epley's 1.500) that the spline result says are closer to the truth. But it is wrong because *no* classical shape is right, not because Epley is uniquely bad.

**The conclusion `RTF_MAX = 12` is correct, and there is a far stronger argument for it that the review does not use:** E1-E-08's meta-regression shows RIR prediction error accumulating eight times faster above 12 repetitions to failure (β 0.06 → 0.47, both intervals excluding zero, n = 414). That argument is about the *unvalidated* half of the composition, it is meta-analytic rather than derived from one novice-female sample, and it lands exactly on OD-06's recorded ceiling. **Adopt `RTF_MAX = 12`; re-base the justification on E1-E-08.**

### 15.5 "Exercise identity as the main moderator" — verified and understated

See §15.2. **VERIFIED**, and worth roughly an order of magnitude more than the review claims.

### 15.6 "Approximately ±10 % individual scatter" — verified, and unusually well corroborated

**VERIFIED**, from four independent directions that the review cites only one of:

| Source | Estimate | Kind |
| --- | --- | --- |
| Mayhew 2008 | % Error SD 10.2–12.5 % | Direct, vs measured 1RM, novice women, bench press |
| Nuzzo 2024, converted through Epley | ±6.7 pts at 80 % 1RM, ±8.7 at 60 % (1 SD) | Derived from population rep variability |
| Greig 2023 | pooled SEE **9.8 % [7.4–12.2]** | IPD meta-analysis, different estimation method |
| E1-E-20 | within-athlete SD(log) **0.1026** | Measured in the wild, preprint |

Four methods, four populations, one number. This is the best-corroborated quantitative fact in the whole topic, and the review's derived "≈ ±20 % for a 95 % interval on one athlete" follows arithmetically. It should be treated as the design's **named noise constant** (§20).

### 15.7 "Lack of direct validation for `reps + RIR`" — verified, and understated in a way that matters

**VERIFIED** (`Ø-1`). The review is right that no study validates the composition.

**It is worse than the review says (`Ø-2`):** no study measures the accuracy of a **retrospective, post-set RIR report** at all. Every measurement paradigm in the literature is a pre-set prediction (E1-E-09) or an intra-set call-out (EVIDENCE-030, E1-E-10). The app logs the third kind. So the composition is unvalidated *and* the RIR term's error model is imported from a different task.

### 15.8 "Machines versus free weights" — first half verified, derived conclusion half wrong

**Claim:** "Mixed and thin; 'machines behave like free weights' is not supported… No evidence found for cables specifically" — and the derived conclusion that "**O-7's decision to allow dumbbell/cable/machine without a confidence penalty is better supported than the evaluation itself claims** — a per-exercise bias that never leaves its exercise is not an accuracy problem."

**Verdict: the characterisation is verified; the derived conclusion is right for the tracker and wrong for the suggestion.**

- "No evidence for cables" was true of the peer-reviewed literature and remains so (`Ø-4`). It is no longer true of the literature as a whole: E1-E-20 stratifies by equipment and reports cable at SD(log) 0.1196 versus barbell 0.0832.
- The review's reasoning **conflates bias with variance**. "A per-exercise bias that never leaves its exercise is not an accuracy problem" is correct — for the trend. It is not correct for the *suggestion*, which consumes rep-invariance error, which is variance, which does not cancel, and which is 44 % larger on cables than on barbells.
- The review is nevertheless right about the deeper point, and it is the best argument in either document: within-exercise, within-athlete comparison is what makes an unvalidated formula usable at all. E1-E-20 states the identical argument independently.

### 15.9 Two errors outside the audit list

**(a) "Remmert 2023 MAE ≈ 0.65 ± 0.78 reps in trained lifters, far worse in novices — 4–5 reps of underprediction." Three errors in one sentence.**

- **0.65 ± 0.78 is not Remmert 2023.** It is Refalo et al. 2024 — which is the repository's own **EVIDENCE-030** ("combined absolute accuracy 0.65 ± 0.78 reps"), 24 resistance-trained participants, bench press at 75 % 1RM. The review cites an external source for a number its own corpus already holds.
- **Remmert 2023 is a different study with a different design and, on this point, the opposite finding.** n = 58 (27 men, 31 women), machine biceps curl / triceps pushdown / seated row, four sets to failure at 72.5 % 1RM, intraset RIR calls from 5 RIR down. Verbatim: "no covariates of sex (p = 0.917), **training experience (p = 0.462)** nor experience rating RIR significantly affected RIRDIFF".
- **"Far worse in novices" is contradicted by the best available evidence.** E1-E-08's meta-regression: "participants training status did not seem to influence prediction accuracy (β = −0.006 repetitions [95 % CIs = −0.02 to 0.007])". The 4–5-rep novice figure is E1-E-09 (Steele 2017), whose authors themselves flag two design limitations: predictions were made **before** the set ("participants may be able to make better predictions during the gestalt experience of actually performing the exercise") and participants used their own current training loads, which rose with experience — confounding load with experience.

**Why it matters.** The review's reassurance that "Novice RIR error is *systematically* under-reported, which biases e1RM downward — the conservative direction" is doing real work in its safety argument. The *direction* survives, on E1-E-08's pooled −0.95-rep under-prediction, which applies to everyone. The *experience gradient* does not, and leaning on it reproduces exactly the error GAP-07 and EVIDENCE-014 warn about: treating a contested moderator as settled.

**(b) "Hackett 2012 r ≥ 0.93" — not independently verified.** Not retrieved in this research; recorded as unverified rather than disputed.

### 15.10 Two review claims independently confirmed

- **"LeSuer et al. 1997 found nearly all equations significantly biased" — VERIFIED.** Bench press: significantly different from zero in all but two of seven equations. Squat: all but one. Deadlift: **all** significantly underestimated. (67 untrained college students, 40 M / 27 F.) The deadlift result — every convention biased in the same direction on one lift — is a stronger exercise-identity datum than the review makes of it.
- **"It softens RG-7… Nuzzo found little sex or age influence" — VERIFIED**, with the §14/RG-7 caveat that Hoeger 1990 and light-load single-joint studies disagree, so the correct output is a narrowed copy rule, not a claim that sex has no effect.

### 15.11 Arithmetic in both documents, re-verified

| Item | Verdict |
| --- | --- |
| Evaluation §6.1 Epley / Brzycki / Lombardi / O'Conner columns | **Correct**, all eight rows |
| Evaluation §6.1 Wathan column | **Wrong at five of eight rows** (r = 3, 8, 12, 15, 20); three materially. Confirms RL-3 and extends it by one row |
| Review §5.1 recomputed Wathan column | **Correct** |
| Both worked translations (110 × 5 → 12; 95 × 12 → 5) | **Correct in both documents** |
| Evaluation §6.1 "95/110 = 0.860" | **Wrong; 0.8636.** Uncaught by the review, which quotes the correct value. Conclusion unaffected |
| Evaluation §6.2 RIR error propagation (3.0/2.9/2.7/2.5/2.3 %) | **Correct** |
| Review RL-2: §12.4's `139.33 / f(7) = 119.4` should be **112.97** | **Confirmed** (119.43 is `139.33 / f(5)`) |
| The five equation forms in the evaluation vs their canonical tabulation in Mayhew 2008 Table 2 | **All five match** |

---

## 16. Evidence-backed principles

Statements that survive as **evidence-supported principles** under `evidence-to-design.md` §1 — shaping *what exists*, never attached to a concrete numeric rule.

1. **The relationship between repetitions and %1RM is exercise-specific, and exercise is its dominant moderator.** (E1-E-02 High; E1-E-06, E1-E-03, E1-E-05 corroborating.) → Per-exercise identity is the unit of comparison; cross-exercise inference is forbidden.
2. **Between-individual variation in that relationship is large and grows as load falls.** (E1-E-02 High; E1-E-07.) → A population conversion cannot substitute for the athlete's own history.
3. **An estimated 1RM carries individual-level error of roughly ±10 % (1 SD).** (E1-E-01, E1-E-02, E1-E-13 High; E1-E-20 corroborating.) → The number is never a measurement, is never displayed at a precision finer than its noise, and never auto-applies.
4. **An estimated 1RM is roughly three times less reliable than a measured one.** (E1-E-11 median CV 4.2 % vs E1-E-12 predicted CV 5.7 % and E1-E-13 SEE 9.8 %.) → Prescribing directly from an estimate requires a cap and a floor; both E1-E-12's and E1-E-13's authors say so in their own conclusions.
5. **Prediction accuracy degrades as the source set lengthens, and no equation is validated above 10–12 reps to failure.** (E1-E-01 High; E1-E-05.) → A repetition ceiling is required.
6. **Self-reported proximity to failure carries real, non-trivial error, systematically in the under-prediction direction, and that error accumulates far faster above 12 repetitions to failure.** (E1-E-08 High; EVIDENCE-030; E1-E-09; E1-E-10.) → The ceiling belongs at 12, and the systematic direction is the conservative one.
7. **RIR accuracy is not established to differ by sex or training experience.** (E1-E-08 β = −0.006 [−0.02, 0.007]; E1-E-10 p = 0.462 / 0.917; GAP-07.) → No demographic or experience trust-weighting, in either direction. This confirms the evaluation's N-6 and corrects the review's rationale for it.
8. **Repetition performance declines across sets within a session.** (E1-E-17 Moderate.) → Sets within a session are one correlated observation, not several independent ones; and a session statistic must not depend on how many sets were performed.
9. **Strength decays slowly and continuously after training cessation, over months rather than weeks.** (E1-E-14 Moderate; E1-E-15; E1-E-16; EVIDENCE-025/B6.) → Recency windows are data-freshness rules, not physiological ones, and must be worded as such.
10. **A stable per-exercise multiplicative bias cancels in a within-athlete comparison; per-observation variance does not.** (Arithmetic, corroborated by E1-E-20's within-exercise design rationale.) → The trend is more trustworthy than the level, and the level is more trustworthy than any translation.

---

## 17. Classification of every proposed algorithm constant

Classes, as required: **evidence-supported** · **indirectly supported** · **conservative product judgment** · **unsupported heuristic** · **contradicted** · **unresolved**.

| ID | Constant / rule | Class | Basis and note |
| --- | --- | --- | --- |
| **C-01** | `STRENGTH_ALGORITHM = epley` | **Conservative product judgment** | No equation is validated; the four classical benchmarks are near-indistinguishable in within-athlete consistency (spread < 6 %, E1-E-20); Epley was among the four best in Mayhew's ≤ 10-RTF analysis. Continuity with OD-06 is a legitimate reason. The *justification wording* "mildest high-rep growth… the safest shape" is **contradicted** (E1-E-02 spline; E1-E-20 load-dependent k) and must be removed |
| **C-02** | `f(1) = 1` convention | **Conservative product judgment** — and a good one | Epley's raw `f(1) = 1.0333` is a pure artefact of a chart-derived formula; an observed single should not be extrapolated |
| **C-03** | `RTF_CORE_MAX = 10` | **Indirectly supported** | E1-E-01 (+5.3 % → +0.5 % bias on restriction; the field recommendation is stated in the paper); E1-E-05 (R² 0.993 → 0.955 from 5RM to 20RM) |
| **C-04** | `RTF_MAX = 15` | **Contradicted** | E1-E-08: RIR error accumulates ~8× faster above 12 reps to failure (β 0.06 → 0.47). Departs from OD-06's recorded ≤ 12 in the less-safe direction. **Set to 12** (§19) |
| **C-05** | `RIR_NEAR_FAILURE_MAX = 2` (0–2 full standing) | **Indirectly supported** in direction; boundary is convention | EVIDENCE-030 (0.40 vs 0.90 reps), E1-E-10 (significant proximity main effect), E1-E-08 (β = −0.025, interval touching zero). Nothing sets the cut at 2 |
| **C-06** | `RIR_ELIGIBLE_MAX = 4`, i.e. RIR ≥ 5 excluded | **Conservative product judgment** that departs from `evidence-to-design.md` row 5 | Row 5 lists "discarding high-RIR data entirely" as *not justified*; B8 says *weight*, not discard. No evidence supports a discontinuity at 5. Re-justify as a **domain** rule (§8.4): with `RTF_MAX = 12` it only excludes low-rep, far-from-failure sets — the longest extrapolations |
| **C-07** | RIR 3–4 degraded | **Conservative product judgment**; the cited basis is **contradicted** | EVIDENCE-030 found 1-RIR and 3-RIR statistically equivalent and explicitly forbids the inference EVIDENCE-014 is cited for. Confirms review RM-1b. Keep the rule, change the citation |
| **C-08** | `EVIDENCE_WINDOW_DAYS = 90` | **Unsupported heuristic**, not contradicted | `Ø-9`. Detraining is continuous over months (E1-E-14/15/16), so 90 days is not wrong — it is simply unpinned. Relabel as a data-freshness rule |
| **C-09** | `CURRENT_SESSION_COUNT = 3` | **Indirectly supported** | `Ø-8` for the number itself. Three is the minimum for a median to reject one outlier. E1-E-20's flat 7-/14-/28-day dispersion mildly favours pooling more, not fewer |
| **C-10** | `RECENT_DAYS_HIGH = 21` | **Unsupported heuristic** | `Ø-9`. Reword as freshness, prefer calendar days (§11.4) |
| **C-11** | `RECENT_DAYS_MEDIUM = 42` | **Unsupported heuristic** | As C-10 |
| **C-12** | `SAME_REPS_TOLERANCE = 1` | **Evidence-supported** in principle; the value is well chosen | §9.3: direct same-rep evidence bypasses every large error source. At distance ≤ 1 the five formulas disagree by ≤ 1.4 % — inside one `loadStepKg` on most lifts. The best-supported rule in the design |
| **C-13** | `NEARBY_REPS_TOLERANCE = 3` | **Indirectly supported** | Formula disagreement ≤ 5.2 % at distance 3 — half the noise floor. A sound outer edge for a "nearby" tier |
| **C-14** | `FAR_REP_DISTANCE = 6` (confidence → low) | **Unsupported heuristic**, and too permissive | 12.9–14.5 % formula disagreement at distance 6 — already beyond the entire upward cap. A confidence label does not fix an arbitrary number |
| **C-15** | `MAX_REP_DISTANCE = 8` | **Contradicted** | 16.7–19.2 % formula disagreement (§13.3), ~2× the noise floor. **Reduce to ~4, and make it directional** (§9.5) |
| **C-16** | `TARGET_RTF_MIN = 3` | **Conservative product judgment** | Direction right (never suggest a near-maximal target from an advisory card); nothing sets 3 |
| **C-17** | `SESSION_SPREAD_FLAG_PCT = 15` | **Contradicted** as calibrated | §10.6: at a constant load this requires an RTF range of ≥ 6 across the session's sets and is effectively unreachable for realistic RIR trajectories (max 10.8 %). Lower to ~8–10 % or drop it |
| **C-18** | `POOL_SPREAD_MEDIUM_PCT = 10` | **Contradicted** as calibrated | Fires on ~77 % of well-behaved triples at the measured noise level; 21 % even at a measured-1RM CV. Makes `medium` the default and the vocabulary uninformative |
| **C-19** | `POOL_SPREAD_LOW_PCT = 20` | **Unresolved**, leaning mis-calibrated | Fires on ~35 % of well-behaved triples at the measured noise level, 0 % at the optimistic one. Depends on which dispersion applies to *pooled mixed-rep* observations — and by the evaluation's §8 definition, the higher one does |
| **C-20** | `PAIR_DISAGREE_PCT = 20` (suppresses the suggestion) | **Contradicted** as calibrated | Fires on ~21 % of well-behaved pairs. This one *refuses to answer*, so mis-calibration has a direct product cost |
| **C-21** | `NEARBY_POOLED_DISAGREE_PCT = 10` | **Contradicted** as calibrated | ~51 % of well-behaved pairs — a coin flip |
| **C-22** | `UPWARD_LOAD_CAP_FACTOR = 1.1` | **Indirectly supported** — a convention with a calibrated size | The *need* is evidence-supported (±10 % individual error, multiplicative in load; E1-E-12 and E1-E-13 both warn against prescribing from an estimate). 1.10 ≈ 1 SD of that error, which is a coherent place to cap an excursion. Must apply to **every** tier, including direct (review RH-3) |
| **C-23** | `BEST_UNCONFIRMED_PCT = 10` | **Indirectly supported** | The best-calibrated threshold in the set: 10 % ≈ 1 SD, and "one SD clear of the field" is a defensible definition of unconfirmed. Mislabels ~26 % at the pessimistic dispersion, ~1 % at the optimistic one |
| **C-24** | `E1RM_DISPLAY_ROUND_KG = 1` | **Contradicted** | Displays 1 kg resolution on a quantity whose 1 SD uncertainty is ≈ ±10 % (≈ ±14 kg at 136 kg) — a precision claim the evidence does not license (§9.1). Use a coarser grid or show a band |
| **C-25** | Lower median of qualifying work sets | **Contradicted** as specified | §10.4: not set-count invariant, so §7.4's "set count feeds confidence, not the value" is false. Fix by fixing the position window (first up to three modal-load sets) |
| **C-26** | One observation per session | **Evidence-supported** | E1-E-17: within-session sets are a fatigue-decayed correlated sequence, not independent observations |
| **C-27** | Sub-modal sets excluded (modal working load) | **Indirectly supported**, with a documented failure mode | Right for ramps and drop sets. Wrong on top-set/back-off days, where it discards the lowest-rep, freshest, least-biased observation — the most accurate one available (E1-E-05, E1-E-01, E1-E-17). See §10.7 |
| **C-28** | Missing RIR → `RTF = reps`, lower bound | **Evidence-supported** as an arithmetic property, with a required caveat | `f(reps) ≤ f(reps + RIR_true)` always. It is a lower bound **on the Epley estimate**, not on the athlete's 1RM — the formula's own +3 % to +15 % bias sits underneath. E1-E-20 reasons identically. The copy must not conflate the two |
| **C-29** | Mixed reported/missing-RIR basis | **Contradicted** by the design's own O-6 reasoning | Stacks a lower-bound basis with a band-max target RIR: two independent conservatisms of unquantified size. Confirms review RM-12. Prefer a homogeneous basis; refuse rather than mix |
| **C-30** | Target RIR = band `max` | **Conservative product judgment**, direction supported | Worth ~2.4 % of e1RM per rep of reserve (§8.5), applied in the safe direction |
| **C-31** | Effort-matched translation (RIR 0 both sides) when the basis has no RIR | **Indirectly supported** | Removes one of two stacked discounts; the evaluation's O-6 reasoning is correct |
| **C-32** | Downward rounding to `loadStepKg` | **Conservative product judgment**, with an interaction | Free conservatism at heavy loads; up to **25 %** on a 20 kg `machine` suggestion at the 5.0 kg default step, and light exercises are where the formula is worst (§12.1). Consider capping the discount |
| **C-33** | One suggested load, not a range | **Conservative product judgment**, in tension with the evidence | The honest object is a ±10 % band. The proposed secondary "≈ 92.5–97.5 kg" line should be **required**, not optional |
| **C-34** | Deloads excluded from `current`/`best`, badged on the trend | **Indirectly supported** | `EVIDENCE-025` / B6, which explicitly names "a tracked strength metric (e.g. a 1RM estimate)" |
| **C-35** | `barbell` / `dumbbell` / `cable` / `machine` eligible; no confidence penalty (O-7) | **Split verdict.** Trend: **indirectly supported**. Suggestion: **contradicted** | §12.2. Bias cancels within an athlete; rep-invariance variance does not, and it is +27 % to +44 % over barbell for dumbbell/machine/cable (E1-E-20) |
| **C-36** | `bodyweight` and `other` not eligible | **Indirectly supported** | E1-E-20 excluded bodyweight and assisted work for the same stated reason; `Ø-5` found nothing supporting inclusion |
| **C-37** | Assisted movements excluded | **Evidence-supported** in substance | The load→difficulty relation is inverted, not offset. Holds whichever side of the evaluation/review sign-convention dispute is right about the code |
| **C-38** | Time/distance work excluded (PI-005) | **Indirectly supported** | E1-E-20 excluded timed exercises as lacking the load–repetition trade-off equations describe |
| **C-39** | `weightKg = 0` sets excluded | **Indirectly supported** | Same semantics problem as C-36 |
| **C-40** | Unilateral eligible "as logged" | **Unresolved** | No evidence either way; the within-exercise-convention argument (§12.2) applies unchanged |
| **C-41** | Advisory only, never auto-applied, never a strategy trigger | **Evidence-supported** | E1-E-12 ("cannot accurately modify sessional training loads") and E1-E-13 ("incorporate direct assessment wherever possible") are the two nearest authorial conclusions, and both point here. Also `evidence-to-design.md` row 15 |
| **C-42** | Never presented as measured strength | **Evidence-supported** | ±10 % individual error from four directions; `evidence-to-design.md` row 18's not-justified column |

---

## 18. Defensible but unsupported product heuristics

These are fine to ship **provided they are labelled as conventions and no copy implies otherwise**: C-02, C-06 (re-justified per §8.4), C-07 (re-cited), C-08, C-09, C-10, C-11, C-16, C-19, C-22, C-23, C-30, C-31, C-32, C-33, C-40.

The standing rule from `evidence-to-design.md` §3.2 applies with full force: **the "what the evidence does NOT justify" column is load-bearing.** For this feature the not-justified list is unusually long and unusually important:

- that the number is the athlete's strength;
- that a change in it is a change in strength (it is a change in the estimate, whose noise is ~3× the measurement's);
- that the suggested load is *correct* rather than *plausible*;
- that any threshold, window, distance or cap is calibrated to anything;
- that RIR accuracy differs by sex or experience;
- that a 90-day-old estimate is stale because the athlete detrained;
- that any of it generalises past this athlete on this exercise under this logging convention.

---

## 19. Recommended safe formula domain

| Parameter | Recommended | Basis |
| --- | --- | --- |
| **Formula** | Epley, `f(1) = 1`, unchanged — but re-justified | No equation is validated; the classical four are near-indistinguishable in within-athlete consistency; Epley was among the best in the ≤ 10-RTF analysis; continuity with OD-06 is a legitimate tiebreak. **Delete "the safest shape at high reps"** — E1-E-02's spline result and E1-E-20's load-dependent conversion factor both contradict it |
| **Observation RTF domain** | **1 – 12**, with **1 – 10** full standing and **11 – 12** degraded | Ceiling from E1-E-08's β break above 12 reps to failure, corroborated by E1-E-01 (bias) and E1-E-05 (R² decay), and matching OD-06's recorded ≤ 12 |
| **RTF 13+** | **Excluded** | No equation validated there; RIR error accumulates ~8× faster; this is also what removes PI-001's `8 kg × 90` |
| **RIR domain** | 0–2 full standing; 3–4 degraded (re-cited); ≥ 5 excluded as a **domain** rule, not a data-quality rule | §8.4; the exclusion only bites at `reps ≤ 7` once the ceiling is 12 |
| **Target RTF domain** | **3 – 12** | Lower bound unchanged (never suggest a near-maximal target); upper bound follows the observation ceiling |
| **Rep distance — low-rep source → higher-rep target** | ≤ 1 full standing; 2–3 nearby; **4 maximum**, at low confidence | §13.3: formula disagreement 1.4 % / ≤ 5.2 % / 7.5 % — the last is about one noise unit |
| **Rep distance — high-rep source → lower-rep target** | ≤ 1 full standing; 2 nearby; **3 maximum**, at low confidence | §9.5: at equal distance the disagreement is larger (10.8 % at distance 4) *and* the error adds load |
| **Beyond those distances** | **No suggestion**, with an honest reason code | At distance 8 the convention alone moves the answer 17–19 % |
| **Display** | e1RM rounded to a grid coarser than 1 kg, or shown with an explicit band | §9.1 |

**What this costs.** Dropping `RTF_MAX` from 15 to 12 loses 12-rep sets at RIR ≥ 1 and 11-rep sets at RIR ≥ 2 — a real cost for a hypertrophy block trained at RIR 2–3. Dropping `MAX_REP_DISTANCE` from 8 to 4 means a 5-rep block following a 12-rep block gets **no** suggestion. Both costs are real, and both are the point: those are exactly the cases where the answer would have been mostly arbitrary. A refusal with an honest reason is a better product than a confident wrong number, and the design already has the machinery (`status: "none"` with reason codes) to deliver it.

---

## 20. Implications for the revised architecture

Ordered by how much they change. **None require a different architecture** — the pure-derivation, computed-on-read, no-new-fact, no-sync-entity shape is right and the evidence does not disturb it.

1. **Adopt a named noise constant and derive the thresholds from it.** The ≈ 10 % (1 SD) individual error is the best-corroborated fact in the topic (§15.6). Express `POOL_SPREAD_*`, `PAIR_DISAGREE_PCT`, `NEARBY_POOLED_DISAGREE_PCT` and `BEST_UNCONFIRMED_PCT` as multiples of it (e.g. 1 SD, 2 SD) rather than as free percentages. Then a recalibration is a one-line change with a stated basis, and the current values' problem — firing on 21–77 % of clean data — becomes visible in the code instead of hidden in it.
2. **`RTF_MAX = 12`, cited to E1-E-08, not to Epley's bias.** This also resolves the review's RL-13 (re-opening OD-06) by *not* re-opening it.
3. **`MAX_REP_DISTANCE ≈ 4`, directional** (3 for high-rep → low-rep). `FAR_REP_DISTANCE` becomes redundant and can go.
4. **Make the session observation set-count invariant** — lower median of the *first up to three* qualifying modal-load sets. Small change; removes a systematic artefact; makes §7.4's claim true instead of false.
5. **Split O-7.** No confidence penalty for the estimate/trend on dumbbell/cable/machine/unilateral. A confidence penalty *or* a one-step-tighter rep-distance limit for a *suggestion* on cable, dumbbell and machine exercises.
6. **Handle the top-set/back-off case now, not at `perSet`.** Either take the maximum of qualifying sets with an explicit flag, or emit two observations. Do not silently prefer the back-off (§10.7).
7. **Relabel the recency windows as data freshness**, drop the detraining rationale from justification and copy, and prefer account-timezone calendar-day boundaries (§11.4) — which also resolves the review's RM-3 at zero evidential cost.
8. **Apply the upward cap to every tier**, including direct (review RH-3), and re-justify 1.10 as "about one standard deviation of the estimation error" rather than as a bare heuristic.
9. **Fix the display precision** (C-24) and make the secondary range line required rather than optional (C-33).
10. **Cap the floor-rounding discount** on light machine and cable work (C-32).
11. **Lower or remove `SESSION_SPREAD_FLAG_PCT`** (C-17) — as calibrated it is effectively unreachable at a constant load.
12. **Add `Ø-2` to the design's own honesty ledger.** The design should state, in the same breath as EVIDENCE-030's numbers, that the app logs a *post-set retrospective* RIR and that this specific task's accuracy has never been measured.
13. **Re-cite, do not re-rule, C-06 and C-07.** Both rules can stand; both citations must change. This is what the review's RM-1 asks for and the external literature confirms it.

**Two things the evidence says the design got right and should not weaken.** The tier hierarchy (§9.3, the best-supported element) and the refusal set — advisory only, never auto-applied, never a strategy trigger, never presented as measured strength (§16 items 3–4, C-41, C-42). These are not conservatism; they are the two mitigations the source authors themselves recommend.

---

## 21. Evidence-registry promotion candidates

**This research does not add registry rows.** `evidence-to-design.md` §3 rule 4 requires new papers to flow registry → boundaries/gaps → map → design, and nothing here may be cited by a design document until that happens. What follows is a proposal for the owner, in registry format, and nothing more.

| Proposed ID | Source | Proposed claim | Proposed confidence | Proposed unsafe inference |
| --- | --- | --- | --- | --- |
| EVIDENCE-032 | E1-E-02 Nuzzo 2024 | The number of repetitions achievable at a given %1RM varies substantially between individuals, grows more variable as load falls, and is moderated by exercise but not clearly by sex, age or training status | **Moderate–High** (269 studies, 7 289 individuals; observational pooling; predominantly male, < 59 y) | Do NOT use the population tables to predict an individual's repetitions; do NOT read the sex/age nulls as "no difference exists"; do NOT extend the exercise-specific tables beyond bench press and leg press |
| EVIDENCE-033 | E1-E-08 Halperin 2022 | People under-predict repetitions to task failure by ≈ 0.95 reps on average, with large heterogeneity; accuracy is not clearly moderated by training status or body region; error accumulates far faster once a set exceeds 12 repetitions to failure | **Moderate–High** (12 studies, 414 participants; I² = 97.9 %) | Do NOT treat the 12-rep break as a validated hard boundary; do NOT apply the pooled estimate to any individual; do NOT read it as covering *post-set retrospective* RIR reports, which no study has measured |
| EVIDENCE-034 | E1-E-11 Grgic 2020 | A directly measured 1RM has good-to-excellent test–retest reliability (median ICC 0.97, median CV 4.2 %), stable across sex, age, body region, joint count and training experience | **High** (32 studies, n = 1 595) | Do NOT transfer this reliability to an *estimated* 1RM; the estimate is roughly three times noisier |
| EVIDENCE-035 | E1-E-13 Greig 2023 | An individualised, model-based 1RM estimate carries a pooled standard error of ≈ 9.8 % of 1RM and a mean over-estimate of ≈ 3.7 %; the authors recommend direct assessment where precision matters | **High** (IPD meta-analysis, 434 participants in analyses) | Do NOT transfer the numbers to repetition-based estimation as if identical; do NOT read "useful for monitoring" as "useful for prescribing" |
| EVIDENCE-036 | E1-E-01 Mayhew 2008 | Repetition-based 1RM equations are substantially more accurate when the source set is ≤ 10 repetitions to failure; restricting the domain nearly removes group-level bias but leaves ≈ ±10 % between-individual scatter | **Moderate** (n = 103; **untrained-to-novice college women; free-weight bench press only**) | Do NOT generalise to men, trained lifters, other exercises, or machines; do NOT read group-level "not significantly different" as individual-level accuracy |
| EVIDENCE-037 | E1-E-14 / E1-E-15 / E1-E-16 | Maximal strength declines continuously and slowly after training cessation, is retained versus non-training controls for months, and is maintained for weeks on reduced volume provided intensity is preserved | **Moderate** | Do NOT derive any threshold; the relationship is continuous and no study identifies a boundary at 21, 42 or 90 days |
| — (**do not promote yet**) | E1-E-20 Marzagão preprint | Within-athlete, within-window dispersion of a classically computed e1RM is ≈ 10 % and is materially larger for cable, dumbbell and machine work than for barbell work | **Very low** | **Not registry-eligible as it stands**: preprint, single author, undisclosed-by-default employer conflict (the data are the employer's), and an internal-consistency criterion with no measured 1RM anywhere. Revisit if peer-reviewed. Its findings are used in this document only as *relative structure*, never as accuracy |

Corresponding gap updates the owner may wish to consider — again, proposed only: **GAP-07** can record that two newer sources (E1-E-08, E1-E-10) now find *no* training-experience moderation of RIR accuracy, narrowing but not closing the contest; **GAP-09** is unchanged and still stands.

---

## 22. Remaining evidence gaps

Ranked by how much they would change the design if closed.

1. **`Ø-1` — the composition.** No validation of `(reps + reported RIR)` against a measured 1RM. Closing this would move the whole feature from convention to heuristic. **Architecture-blocking? No** — the feature ships as a labelled convention regardless. **Claim-blocking? Yes**, for any wording stronger than "estimate".
2. **`Ø-2` — the retrospective RIR report.** Nobody has measured the accuracy of the exact thing this app logs. This is a small, cheap, publishable study and the most under-appreciated gap in the topic.
3. **`Ø-10` — load translation.** The entire second half of the feature has no direct literature. Even a single crossover study (translate a load, measure completion and RIR adherence) would be the first.
4. **`Ø-6` — does a starting-load suggestion help?** RG-8. Unanswerable today.
5. **`Ø-3` — no synthesis of repetition-equation accuracy.** The primary studies exist and have never been pooled. Until they are, every statement about "which equation is best" rests on individual small studies in narrow populations.
6. **`Ø-11` — set-order correction.** Every equation treats sets as independent; E1-E-17 shows they are not; E1-E-20 names this as an open gap. Directly relevant to §10.4 and §10.7.
7. **`Ø-8` / `Ø-7` — session count and smallest worthwhile change for an estimate.** These are the two quantities the aggregation and threshold rules most need, and neither exists.
8. **`Ø-4` / `Ø-5` — cables, assisted and weighted-bodyweight work.** Only a preprint speaks to cables; nothing speaks to the others except by exclusion.
9. **Sex, age and equipment interactions with equation accuracy.** GAP-09 unchanged. The one machine-specific validation study is in sedentary adults aged 53.6.
10. **Whether within-athlete *trend* accuracy follows from cross-sectional prediction accuracy.** Mayhew 2008's ICCs between change-in-predicted and change-in-actual ranged from **−0.09 to 0.95** across fourteen equations — a warning that a good predictor is not automatically a good tracker, and the design needs the tracker.

---

## 23. Recommendation

> **Implementation may proceed as a clearly labelled convention** — with the domain and calibration corrections in §19 and §20 applied first, and with `evidence-to-design.md` row 20 written before any code, as the evaluation itself requires.

The reasoning, stated plainly.

**Why it may proceed.** The evidence does not make an advisory, per-exercise, within-athlete, never-auto-applied estimate unsafe; it makes it imprecise, and imprecision is a labelling problem. Every mitigation the source authors themselves recommend is already in the design: do not prescribe from an estimate without a cap (E1-E-12, E1-E-13), do not present it as a measurement (E1-E-01's group-vs-individual gap), do not compare across exercises (E1-E-02), do not automate on it (`evidence-to-design.md` row 15). The design's structural choices are not merely defensible — the two largest error terms in the literature, exercise identity and per-person systematic bias, are precisely the two that a per-exercise, within-athlete series cancels. That is a better foundation than the evaluation claims for itself.

**What must change first.** Three rules are wrong in the non-conservative direction and one family is mis-calibrated: `RTF_MAX = 15` → 12; `MAX_REP_DISTANCE = 8` → ~4 and directional; the disagreement thresholds, which fire on 21–77 % of well-behaved data; and the set-count-dependent session aggregator. None of these is architectural. All four are constants and a statistic.

**What must never be claimed.** That the number is strength. That its movement is strength change. That any threshold is calibrated to anything. That RIR accuracy varies by who you are. That an old estimate expired because you detrained. That the suggestion is right rather than plausible.

**One framing point for the owner.** The most useful thing this feature produces is almost certainly *not* the estimated 1RM. It is the **direct tier** — "last time you did 6 reps on this exercise you used 60 kg" — which involves no formula, no RIR arithmetic, no population conversion, and none of the ±10 % error that dominates everything else in this document. That tier is evidence-supported in principle (§9.3, C-12) and would be worth shipping even if every other tier were cut. If a smaller v1 is ever wanted, that is where the cut line is.

---

## 24. Working-tree impact

Created: `docs/reviews/estimated-1rm-evidence-research.md` (this file). **Nothing else was created, modified, staged, formatted, or deleted.**

Explicitly not touched, per the task's instructions:

- `docs/evidence/evidence-registry-reviewed.md`, `docs/evidence/product-evidence-boundaries.md`, `docs/evidence/research-gaps.md`
- `docs/architecture/evidence-to-design.md`, `docs/architecture/open-decisions.md`, `docs/architecture/implementation-plan.md`
- `docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md`, `docs/reviews/estimated-1rm-load-translation-architecture-review.md`
- `docs/input/product-ideas.md`
- any source file, migration, test, or configuration
- the pre-existing uncommitted working-tree changes listed in this session's opening git status, and any change belonging to the concurrent Warm-up Set Classification work

No code was implemented. No commit, push, tag, deployment, or production access was performed. No production service was started. The local Docker PostgreSQL instance was not started or contacted.

Temporary research artefacts — four Python verification scripts (`e1rm_check.py`, `setcount.py`, `calib.py`, `calib2.py`), four downloaded PDFs, and their extracted page images — lived only in the session scratchpad and the tool-results cache outside the repository, and were deleted after use. None was ever inside `c:\DEV\gym-app`.

---

## 25. Full source list

Peer-reviewed, in the order introduced.

1. Mayhew JL, Johnson BD, LaMonte MJ, Lauber D, Kemmler W. Accuracy of prediction equations for determining one repetition maximum bench press in women before and after resistance training. *J Strength Cond Res.* 2008;22(5):1570–1577. PMID 18714230. https://pubmed.ncbi.nlm.nih.gov/18714230/
2. Nuzzo JL, Pinto MD, Nosaka K, Steele J. Maximal Number of Repetitions at Percentages of the One Repetition Maximum: A Meta-Regression and Moderator Analysis of Sex, Age, Training Status, and Exercise. *Sports Med.* 2024;54(2):303–321. https://doi.org/10.1007/s40279-023-01937-7
3. LeSuer DA, McCormick JH, Mayhew JL, Wasserstein RL, Arnold MD. The Accuracy of Prediction Equations for Estimating 1-RM Performance in the Bench Press, Squat, and Deadlift. *J Strength Cond Res.* 1997;11(4):211–213.
4. Wood TM, Maddalozzo GF, Harter RA. Accuracy of Seven Equations for Predicting 1-RM Performance of Apparently Healthy, Sedentary Older Adults. *Meas Phys Educ Exerc Sci.* 2002;6(2):67–94. https://doi.org/10.1207/S15327841MPEE0602_1
5. Reynolds JM, Gordon TJ, Robergs RA. Prediction of one repetition maximum strength from multiple repetition maximum testing and anthropometry. *J Strength Cond Res.* 2006;20(3):584–592. PMID 16937972.
6. Shimano T, Kraemer WJ, Spiering BA, et al. Relationship between the number of repetitions and selected percentages of one repetition maximum in free weight exercises in trained and untrained men. *J Strength Cond Res.* 2006;20(4):819–823. PMID 17194239.
7. Richens B, Cleather DJ. The relationship between the number of repetitions performed at given intensities is different in endurance and strength trained athletes. *Biol Sport.* 2014;31(2):157–161. https://doi.org/10.5604/20831862.1099047
8. Halperin I, Malleron T, Har-Nir I, Androulakis-Korakakis P, Wolf M, Fisher J, Steele J. Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. *Sports Med.* 2022;52(2):377–390. https://doi.org/10.1007/s40279-021-01559-x (preprint: https://doi.org/10.31236/osf.io/x256f)
9. Steele J, Endres A, Fisher J, Gentil P, Giessing J. Ability to predict repetitions to momentary failure is not perfectly accurate, though improves with resistance training experience. *PeerJ.* 2017;5:e4105. https://doi.org/10.7717/peerj.4105
10. Remmert JF, Laurson KR, Zourdos MC. Accuracy of Predicted Intraset Repetitions in Reserve (RIR) in Single- and Multi-Joint Resistance Exercises Among Trained and Untrained Men and Women. *Percept Mot Skills.* 2023;130(3):1239–1254. https://doi.org/10.1177/00315125231169868
11. Grgic J, Lazinica B, Schoenfeld BJ, Pedisic Z. Test–Retest Reliability of the One-Repetition Maximum (1RM) Strength Assessment: a Systematic Review. *Sports Med Open.* 2020;6:31. https://doi.org/10.1186/s40798-020-00260-z
12. Banyard HG, Nosaka K, Haff GG. Reliability and Validity of the Load–Velocity Relationship to Predict the 1RM Back Squat. *J Strength Cond Res.* 2017;31(7):1897–1904. PMID 27669192.
13. Greig L, Aspe RR, Hall A, Comfort P, Cooper K, Swinton PA. The Predictive Validity of Individualised Load–Velocity Relationships for Predicting 1RM: A Systematic Review and Individual Participant Data Meta-analysis. *Sports Med.* 2023;53(9):1693–1708. https://doi.org/10.1007/s40279-023-01854-9
14. Bosquet L, Berryman N, Dupuy O, et al. Effect of training cessation on muscular performance: A meta-analysis. *Scand J Med Sci Sports.* 2013;23(3):e140–e149. https://doi.org/10.1111/sms.12047
15. Encarnação IGA, Viana RB, Soares SRS, Freitas ED, de Lira CAB, Ferreira-Junior JB. Effects of Detraining on Muscle Strength and Hypertrophy Induced by Resistance Training: A Systematic Review. *Muscles.* 2022;1(1):1–15. https://doi.org/10.3390/muscles1010001
16. Spiering BA, Mujika I, Sharp MA, Foulis SA. Maintaining Physical Performance: The Minimal Dose of Exercise Needed to Preserve Endurance and Strength Over Time. *J Strength Cond Res.* 2021;35(5):1449–1458. https://doi.org/10.1519/JSC.0000000000003964
17. Senna G, Willardson JM, de Salles BF, et al. The Effect of Rest Interval Length on Multi and Single-Joint Exercise Performance and Perceived Exertion. *J Strength Cond Res.* 2011;25(11):3157–3162. https://doi.org/10.1519/JSC.0b013e318212e23b
18. Hickmott LM, Chilibeck PD, Shaw KA, Butcher SJ. The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy: A Systematic Review and Meta-Analysis. *Sports Med Open.* 2022;8:9. https://doi.org/10.1186/s40798-021-00404-9
19. Huang Z, Sun J, Li D, Chen C, Wang D. Autoregulated resistance training for maximal strength enhancement: A systematic review and network meta-analysis. *J Exerc Sci Fit.* 2025;23(4):360–369. https://doi.org/10.1016/j.jesf.2025.07.006
20. Hoeger WWK, Hopkins DR, Barette SL, Hale DF. Relationship between repetitions and selected percentages of one repetition maximum: a comparison between untrained and trained males and females. *J Appl Sport Sci Res.* 1990;4(2):47–54. *(abstract only; per-exercise values not independently verified)*

**Not peer reviewed — flagged throughout:**

21. Marzagão T. A Weight-Dependent 1RM Prediction Equation Optimized on 303,494 Near-Failure Sets Across 388 Exercises. **Preprint**, arXiv:2603.17495, 18 March 2026; also SportRxiv. https://arxiv.org/abs/2603.17495 — author affiliation Fitbod, Inc.; the analysed data are the employer's; no measured 1RM is used anywhere in the study.

**Named but not retrieved, and therefore not relied upon for any numeric claim:** Zourdos et al. 2016 (the RIR-based RPE scale, named for provenance only); Hackett et al. 2012 (the review's "r ≥ 0.93" claim — unverified); Mayhew et al. 1992; Epley 1985; Brzycki 1993; Lombardi 1989; O'Conner et al. 1989; Wathen 1994; Lander 1985 — all six equation sources are known only through their tabulation in source 1 (Table 2) and the literature review of source 21, which is itself the basis for §7.1's provenance statement.
