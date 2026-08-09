# Citation

Pelland, J. C., Remmert, J. F., Robinson, Z. P., Hinson, S., & Zourdos, M. C. (2024). The Resistance Training Dose-Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gain. *SportRχiv* [preprint, not peer reviewed]. Florida Atlantic University, Dept. of Exercise Science and Health Promotion. OSF pre-registration: https://osf.io/r958n; supplementary materials: https://osf.io/6z3xu. Last modified September 2024.

Source PDF:
`02_pelland_volume_frequency.pdf`

## Evidence type

Meta-analysis / meta-regression (multilevel, Bayesian dose-response meta-regression of RCT data). This is a **preprint posted to SportRχiv and explicitly labeled "not peer reviewed"** — treat as pre-publication evidence, not a peer-reviewed journal article.

## Research question

To model the continuous dose-response relationships between (1) weekly resistance-training (RT) set volume and muscle hypertrophy, (2) weekly set volume and muscle strength gain, (3) weekly training frequency and muscle hypertrophy, and (4) weekly training frequency and muscle strength gain — testing multiple functional forms (not just linear) and multiple ways of counting "indirect" (synergist) sets toward volume/frequency (classified as 'total', 'fractional', or 'direct').

## Population and evidence base

- 67 studies (2,058 participants) met inclusion criteria overall; PRISMA screening: 6,677 database records + 16 citation-search records → 6,515 after dedup → 135 after title/abstract screening → 67 included.
- Inclusion required: randomized experimental design (within- or between-group), dynamic RT with eccentric+concentric training, ≥4 weeks duration, healthy participants ≤70 years old, groups differing in set volume and/or frequency with load and proximity-to-failure controlled, and either direct site-specific hypertrophy measurement (ultrasound, CT, MRI, biopsy) or dynamic (≤10RM)/isometric/isokinetic strength measurement.
- Mean intervention duration: 10.42 ± 4.48 weeks. Mean participant age: 25.16 ± 5.22 years.
- 28 of the 67 studies used untrained participants; 39 used trained participants.
- Primary meta-regression models (using the 'fractional' quantification, the best-supported method — see below):
  - Hypertrophy models (volume and frequency): 35 studies, 220 effects, 1,032 participants.
  - Strength models (volume and frequency): 66 studies, 490 effects, 2,020 participants.
- Sex breakdown, geographic origin of studies, and specific age ranges beyond the mean/SD are not reported in the body of the paper.
- Quality: TESTEX scale mode score 12/15 (range 8–14/15); mode study-quality subscore 3/5 (range 1–5/5); mode study-reporting subscore 8/10 (range 4–10/10).

## Variables investigated

- **Weekly set volume** and **weekly training frequency**, each quantified three ways: 'direct' (only sets/sessions where the measured muscle was the primary force generator / the exact tested exercise), 'total' (all sets/sessions involving the muscle, indirect counted fully), and 'fractional' (indirect sets/sessions counted as 0.5). Bayes Factor comparisons were used to select the best-supported quantification method per outcome.
- **Muscle hypertrophy**: direct, site-specific measures only (ultrasound, CT, MRI, biopsy).
- **Muscle strength**: dynamic (up to 10RM), isometric, or isokinetic maximal strength.
- Covariates adjusted for in all models: intervention duration (weeks, continuous) and training status (trained/untrained, binary).
- Candidate functional forms tested for the dose-response curve: linear, restricted cubic spline (4 knots), linear-log, 2nd-order polynomial, square root, quadratic, reciprocal — best fit chosen via BIC-approximated Bayes Factor vs. an intercept-only model.
- Effect sizes reported as exponentiated response ratios (converted to % change) relative to a modeled dose of 0 (i.e., control-adjusted).

## Main findings

**Quantification method**: Bayes Factor comparisons favored 'fractional' (indirect sets = half weight) over 'total' and 'direct' for all four outcome/variable combinations (2×Log(BF) strong-to-very-strong in every case, e.g., frequency-hypertrophy fractional>total = 9.96, fractional>direct = 10.82; volume-strength fractional>total = 18.21, fractional>direct = 45.96). All headline results below use the 'fractional' method.

**Volume → Hypertrophy**: Best-fit model = square root. R²marginal = 22.3%, R²conditional = 73.3%. Marginal slope positive with 100% posterior probability >0; β = 0.24% increase in hypertrophy per additional fractional weekly set [95% CrI: 0.15%, 0.33%], evaluated at the mean fractional volume of 12.25 sets/week. Diminishing returns present but **no clear plateau identified** — credible intervals widen substantially at higher volumes and remain compatible with multiple functional forms (including a later plateau or inverted-U). Author-derived "efficiency tiers" (Table 2A, relative to a smallest detectable effect size [SDES] of 2.05%): minimum effective dose ≈ 4 fractional sets/week; each subsequent detectable increment required progressively more added volume (~6 sets to next tier, then ~8.5, ~10.75, ~12.5); data were sparse beyond ~25+ fractional sets/week.

**Volume → Strength**: Best-fit model = reciprocal. R²marginal = 26.1%, R²conditional = 74.8%. Marginal slope positive, 100% probability >0; β = 0.21% increase in strength per additional fractional weekly set [95% CrI: 0.16%, 0.26%], at mean fractional volume 8.14 sets/week. Diminishing returns are "strong," with a functional plateau. Efficiency tiers (Table 2B, SDES = 3.96%): minimum effective dose ≈ 1 fractional set/week; tiers up to 2 sets, then 3–4 sets; beyond ~5 sets, additional volume did not consistently exceed the SDES.

**Frequency → Hypertrophy**: Best-fit model = reciprocal. R²marginal = 21.9%, R²conditional = 73.1%. Marginal slope positive but only 91.3% posterior probability >0; β = 0.32% per additional session [95% CrI: −0.14%, 0.82%] — **credible interval includes the null**. Authors characterize this as "compatible with negligible effects" and "inconsistent" across modeling approaches. Secondary direct-comparison-only models (two-stage meta-regression + contrast-based meta-analysis; 15 studies, 78 effects, 370 participants) confirmed compatibility with negligible effects.

**Frequency → Strength**: Best-fit model = reciprocal. R²marginal = 25.7%, R²conditional = 75.1%. Marginal slope positive, 100% probability >0; β = 3.27% per additional session [95% CrI: 2.74%, 3.84%] — **credible interval excludes the null**. Diminishing returns present. Example control-adjusted point estimates: frequency of 1 session/week/muscle = 12.72% [95% CrI: 10.57%, 15.05%]; frequency of 2 = 17.32% [95% CrI: 14.34%, 20.56%]; accelerating diminishing returns beyond that. Secondary direct-comparison-only models (27 studies, 148 effects, 700 participants) qualitatively confirmed this.

**Comparison to prior literature cited in the paper** (not this paper's own new data, but referenced for context): Ralston et al. (2017), >5 vs. ≤5 weekly sets and strength, SMD 0.18 [95% CI 0.06, 0.30], p=0.003; Schoenfeld et al. (2017), ≥9 vs. <9 sets/week and hypertrophy, ES 0.46 [0.21, 0.71] vs. 0.32 [0.19, 0.46], p=0.076 (non-significant); Schoenfeld et al. (2017) linear volume-hypertrophy slope of 0.38%/set (vs. this paper's 0.24%/set); Baz-Valle et al. (2020), 20+ vs 12-20 sets, triceps SMD −0.50 [−0.88, −0.11] p=0.01, biceps −0.10 [−0.46, 0.26] p=0.59, quadriceps −0.20 [−0.49, 0.10] p=0.19; Grgic et al. (2018) frequency-strength meta-regression frequency=1 ES 0.53 [0.13, 0.93] vs frequency=2 ES 0.80 [−0.25, 1.86], p=0.421 (non-significant).

## Strength / hypertrophy distinction

- **Volume**: Both hypertrophy and strength show a positive, continuous, diminishing-returns dose-response with weekly set volume, but the diminishing returns are "considerably more pronounced" for strength (best-fit reciprocal model with an identifiable functional plateau) than for hypertrophy (best-fit square root model, no clear plateau, high uncertainty at higher volumes).
- **Frequency**: The two outcomes diverge. Frequency shows a positive, dose-response relationship with diminishing returns for **strength** (credible, null excluded). For **hypertrophy**, the effect is small, inconsistent across modeling approaches, and compatible with a null/negligible effect once volume is held constant.
- The authors hypothesize the frequency-strength effect may partly reflect a **motor learning/practice effect** on the specific strength test rather than (or in addition to) a physiological training-dose effect — "simply practicing the test provides a robust stimulus for strength gains" (citing Mattocks et al.). This confound is explicitly discussed and not resolved by the data. No endurance or other outcome was investigated in this paper.

## Practical interpretation

A cautious reader could conclude that, within the volume/frequency ranges represented in the pooled literature (roughly up to the low-to-mid 20s in fractional weekly sets and up to ~4–6 sessions/muscle/week), more weekly sets tend to be associated with more hypertrophy and more strength, with returns diminishing faster for strength than hypertrophy. Adding training frequency (holding volume constant) appears to matter more for strength than for hypertrophy in this dataset, though the hypertrophy result is weak enough that a true small effect cannot be ruled out. The specific "efficiency tier" volumes (e.g., "4 sets = minimum effective dose") are the authors' own interpretive construct built on an externally-derived detectability threshold (SDES) and should be treated as illustrative of the shape of diminishing returns, not as validated prescriptive breakpoints — the authors themselves caution that credible intervals at higher doses are compatible with several different curve shapes.

## Application relevance

- **Trackable variables**: weekly sets per muscle group and weekly training frequency per muscle group are both directly loggable in a workout tracker, matching this paper's core independent variables.
- **Visualization signal**: the paper's own dose-response curves (Figures 4–5) are natural candidates for a "diminishing returns" style chart (continuous curve with widening uncertainty band at higher doses) — this is more faithful to the evidence than a bucketed bar chart.
- **Heuristic seed (not a rule)**: the general pattern "more sets → more gains, with the gain-per-set shrinking as sets accumulate; this shrinkage is faster for strength-type goals than hypertrophy-type goals" could seed a soft, non-prescriptive heuristic or educational tooltip.
- **Not suitable for automated decision-making** as-is: modest explained variance (marginal R² 22–26%), wide/uncertain credible intervals at higher volumes, a preprint (not peer-reviewed) status, and an explicit author caveat that individual-level application "depends on many factors" all argue against hardcoding specific set/frequency thresholds (e.g., "do exactly N sets") into automated program logic.
- The "fractional" indirect-set counting convention (synergist sets = 0.5) is a modeling assumption from this paper, not an established measurement standard — if an app wants to sum "effective volume" across exercises hitting the same muscle as both prime mover and synergist, this paper is a candidate source for that idea, but it should be flagged as one specific research group's assumption.

## What this paper DOES support

- A continuous, positive, diminishing-returns relationship between weekly set volume and muscle hypertrophy (100% posterior probability of a positive slope; β = 0.24%/set, 95% CrI excludes 0).
- A continuous, positive, diminishing-returns relationship (with a functional plateau) between weekly set volume and muscle strength (100% posterior probability of a positive slope; β = 0.21%/set, 95% CrI excludes 0).
- A continuous, positive, diminishing-returns relationship between weekly training frequency and muscle strength (100% posterior probability of a positive slope; β = 3.27%/session, 95% CrI excludes 0).
- Evidence (Bayes Factors) that counting synergist/indirect sets as "half a set" ('fractional') fits the pooled data better than counting them fully or not at all, across all four outcome/variable analyses.
- A weak, statistically ambiguous signal that additional frequency may have a small positive effect on hypertrophy, with a credible interval that includes zero (91.3% posterior probability, not "significant" in a stricter sense) — i.e., compatibility with a negligible independent frequency effect on hypertrophy once volume is controlled.
- No evidence of small-study/publication bias by the authors' funnel-plot and bias-adjusted-estimate checks, and no consistent indication of larger-than-expected heterogeneity in secondary analyses.

## What this paper DOES NOT support

- A single universal "optimal" weekly set number for hypertrophy or for strength — the paper explicitly presents continuous curves with growing uncertainty at higher doses, and states multiple functional forms (including plateau or inverted-U shapes) remain compatible with the data, especially beyond ~25 fractional sets/week for hypertrophy.
- Any RP-style MV/MEV/MAV/MRV framework or values — this paper does not use or validate that terminology; it is not part of this evidence base.
- A universal "minimum effective volume" applicable to individuals — the tiered "efficient dose" figures (Table 2A/2B) are derived from group-level, between-study point estimates compared to an externally sourced detectability threshold, not from individual-level dose-ranging data. The authors explicitly state individual-level application "depends on many factors."
- Conclusions about **per-session** volume or frequency (e.g., "3 sets per session is better than 5") — the analysis is on a **weekly** timescale only; the authors note this timescale choice is somewhat arbitrary and point to a separate, parallel paper (not this PDF) for per-session dose-response.
- Conclusions about long-term (multi-month/year) dose-response — mean intervention duration was only ~10 weeks.
- Claims about injury risk, overtraining, recovery capacity, psychological burnout, or long-term sustainability of high training volume/frequency — the authors explicitly say they "did not venture to describe potential indirect negative consequences of high RT dosage."
- Sex-specific, age-specific, or exercise-selection-specific prescriptive conclusions — such factors were only available as exploratory/underpowered interaction-moderator analyses, explicitly framed by the authors as hypothesis-generating only, not confirmatory.
- Endurance, power, or any outcome other than muscle hypertrophy and maximal strength.
- A confirmed causal, within-individual dose-ladder effect — see Confidence section below.

## Limitations

**Author-stated:**
- Findings are limited to the training contexts represented in the included studies (exercise selection, populations, etc.).
- Proximity-to-failure was inconsistently and often vaguely defined (only ~30% of hypertrophy effects had a clear momentary-failure definition despite 78.47% reporting some failure-related definition), limiting related moderator analyses.
- The analysis did not address potential negative consequences of higher dosage (injury, burnout, sustainability).
- Average intervention duration was short (10.42 ± 4.48 weeks).
- Analysis used *site-specific* training volume, not whole-body/overall RT volume; it is unclear whether site-specific dose-response is affected by concurrent overall training load.
- The weekly timescale for volume/frequency is an arbitrary choice; per-session dose-response is addressed in a separate, parallel project (referenced, not included in this PDF).
- The direct/indirect/'fractional' set classification process "was not wholly objective."
- Best-fit models remain statistically compatible with multiple functional forms (e.g., plateau, inverted-U), particularly given data sparsity at higher doses.
- Only 13 included studies had non-training control groups, and only 2 of those had hypertrophy measures, so the smallest-detectable-effect-size (SDES) threshold used to build the "efficiency tiers" was borrowed from an external dataset (Steele et al.) rather than derived from this analysis's own controls.
- Overall model fit is modest (marginal R² 22–26%), and the authors state this, combined with wide uncertainty intervals, means multiple dose-response shapes remain compatible with the data.
- The preprint itself is labeled "not peer reviewed."

**This reviewer's own methodological observations (not stated by the authors in these terms):**
- This is fundamentally a **between-study/between-arm dose-response synthesis**, not a single randomized dose-ranging trial. While many contributing primary studies did randomize participants to different volume/frequency arms, the pooled dose-response *curve* is fitted across many heterogeneous studies (different populations, exercises, measurement modalities, durations) — so unmeasured between-study confounding correlated with assigned dose cannot be fully excluded despite adjustment for duration and training status.
- Marginal R² (22–26%) is low relative to conditional R² (73–75%), meaning most of the variance is absorbed by random effects/study clustering rather than explained by the dose variable itself — the fixed dose-response signal, while directionally credible, explains only a modest share of total outcome variance.
- The 'fractional' (indirect sets = 0.5) weighting is a specific analytic assumption chosen because it fit best among the three tested options in this dataset — it is not an independently validated physiological constant.
- Measurement heterogeneity (ultrasound, MRI, CT, biopsy for hypertrophy; 1RM, isometric, isokinetic for strength) adds indirectness when combining effect sizes across such different instruments.

## Confidence

**Moderate**, with the important caveat that confidence in the **frequency→hypertrophy** finding specifically should be treated as **Low** (credible interval crosses null). Justification: This is a pre-registered, methodologically sophisticated Bayesian multilevel meta-regression with a reasonably large evidence base (67 RCTs, 2,058 participants) that explicitly tested multiple functional forms rather than assuming linearity, checked for publication/small-study bias (none found), and cross-validated its primary models against independent contrast-based and two-stage approaches (directionally consistent in all cases). These are strengths. Working against higher confidence: it is an unreviewed preprint; primary-study quality was only moderate (modal TESTEX 12/15, modal quality subscore 3/5); the dose-response is built from pooled between-study comparisons rather than a single controlled dose-ranging experiment, so it is best read as strong observational/quasi-experimental synthesis rather than a definitive causal dose-response curve; marginal R² was modest (22–26%); credible intervals widen substantially at higher doses and for frequency-hypertrophy specifically include the null; and the core "fractional" set-counting method is itself a data-driven assumption rather than an independently established measurement standard. The volume→hypertrophy, volume→strength, and frequency→strength findings are reasonably consistent and directionally robust across the paper's sensitivity analyses, supporting Moderate confidence in the *direction* of those three relationships even though precise magnitudes and higher-dose behavior remain uncertain.

## Relevant source locations

- Abstract / headline results: p. 2
- Prior meta-analyses cited for context (Ralston 2017, Schoenfeld 2017, Baz-Valle 2020): p. 3
- Inclusion criteria: p. 5
- Search strategy / PRISMA search terms: p. 5
- Total/Fractional/Direct classification definitions: p. 6–7
- Table 1A (exercises counted direct/indirect for hypertrophy): p. 8
- Table 1B (exercises counted indirect for strength): p. 9
- Statistical methods, effect-size formulas (SMC, RR): p. 10–11
- Candidate functional forms list (linear, spline, log-linear, polynomial, sqrt, quadratic, reciprocal): p. 11
- Two-stage / contrast-based verification methods, Bayes Factor methodology: p. 13–14
- PRISMA flow numbers (6,677→6,515→135→67): p. 14–15; Figure 1 (PRISMA diagram): p. 16
- Quality assessment (TESTEX mode 12/15): p. 15
- Study characteristics (67 studies, 2,058 participants, 10.42±4.48 wks, age 25.16±5.22, 28 untrained/39 trained): p. 15
- Figure 2 (raincloud plots of volume/frequency/reps/rest/failure distributions): p. 17
- 4.4 Quantification method Bayes Factor comparisons: p. 18; Figure 3 (BF matrices): p. 19
- 4.5.1 Frequency–Hypertrophy result (β=0.32%, 91.3% probability): p. 20
- 4.5.2 Frequency–Strength result (β=3.27%, 100% probability): p. 20
- Figure 4 (frequency dose-response curves, hypertrophy and strength): p. 22 (approx.)
- 4.6.1 Volume–Hypertrophy result (β=0.24%, square-root model): p. 21
- 4.6.2 Volume–Strength result (β=0.21%, reciprocal model): p. 21–22
- Figure 5 (volume dose-response curves): p. 23
- Table 2A (hypertrophy efficiency tiers) and Table 2B (strength efficiency tiers): p. 24
- Discussion 5.2 (Frequency & Hypertrophy, mechanistic MPS discussion): p. 25–26
- Discussion 5.3 (Frequency & Strength, Grgic comparison, learning-effect hypothesis): p. 27–28
- Discussion 5.4 (Volume & Hypertrophy, Schoenfeld 0.38%/set comparison): p. 28–29
- Discussion 5.5 (Volume & Strength, Ralston comparison, powerlifter learning-effect study): p. 29–30
- Discussion 5.6 Limitations & Considerations: p. 30–32
- 6 Conclusions: p. 32
- References: p. 34–45 (numbered list; key citations e.g. Schoenfeld 2017 [ref 1], Ralston 2017 [ref 7], Grgic 2018 [ref 17], Baz-Valle 2022 [ref 5])
