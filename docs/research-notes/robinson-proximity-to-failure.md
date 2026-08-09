# Citation

Robinson ZP, Pelland JC, Remmert JF, Refalo MC, Jukic I, Steele J, Zourdos MC (2023). *Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions.* SportRxiv preprint (part of the Society for Transparency, Openness and Replication in Kinesiology, STORK). Last modified November 2023. Not peer reviewed. Supplementary materials: https://osf.io/7knsj/

Source PDF:
`docs/research/03_robinson_proximity_failure.pdf`

## Evidence type

Exploratory (not pre-registered, no systematic search) meta-analysis using a series of multi-level, multi-model dose-response meta-regressions. **Preprint — not peer reviewed.**

## Research question

"How far from failure should someone train to optimize muscle hypertrophy and strength gain?" — i.e., what is the continuous dose-response relationship between estimated repetitions-in-reserve (RIR) at set termination and (a) maximal strength gain and (b) muscle hypertrophy, treating proximity to failure as a continuous rather than categorical variable.

## Population and evidence base

- 55 studies total (list in supplementary file 0). Studies were gathered from prior relevant meta-analyses plus additional studies known to/found by the authors — **not a full systematic search**.
- Strength models: 243 effects from 55 studies. Hypertrophy models: 140 effects from 26 studies.
- Mean participant age 27.83 ± 12.84 years (wide SD implies a broad age range across pooled studies); mean intervention duration 8.28 ± 2.35 weeks.
- Training status included as a binary covariate (trained vs untrained) in all models; exact per-model N split not reported in the text.
- Sex not broken out numerically in the main text (not reported).
- For strength-model effects: mode/average training variables were 6 sets/week (9.58 ± 4.48), 75% 1RM (72.06 ± 13.27%), 2.23 ± 0.48 sessions/week. For hypertrophy-model effects: mode 6 sets/week (9.69 ± 4.61), 85% 1RM (72.27 ± 14.53%), 2.08 ± 0.39 sessions/week.
- Studies included: direct to-failure vs not-to-failure comparisons, velocity-loss (VL) threshold studies, studies reporting RIR directly, studies reporting load/reps allowing RIR back-calculation, and alternative set-structure studies (cluster, rest-redistribution, rest-pause).

## Variables investigated

Proximity to failure, operationalized as **estimated RIR** (continuous, 0–23 range in the dataset; not self-reported in almost all studies but back-calculated via prediction equations, direct RIR-to-failure subtraction, or velocity-loss regression equations). Outcomes: maximal strength (isometric, isotonic, or isokinetic) and muscle hypertrophy (ultrasound, MRI, etc.), each analyzed as standardized mean change (SMC) and as an exponentiated response ratio (RR, % change). Covariates adjusted for in all models: load per set, method of volume equating (set- or repetition-equated), intervention duration (weeks), and training status.

## Main findings

**Strength outcomes (243 effects, 55 studies):**
- Best-fit model (SMC): linear-log. R²marginal = 12.29%, R²conditional = 78.66%. Marginal slope β = 0.003 (95% CI: −0.012, 0.018; 95% PI: −0.675, 0.682) — CI contains null; interpreted as negligible.
- Best-fit model (RR): linear. R²marginal = 29.04%, R²conditional = 59.41%. β = −0.059 (95% CI: −0.304, 0.186; 95% PI: −12.944, 14.732) — CI contains null; negligible.
- Sensitivity analysis restricted to <10 RIR effects (232 effects/54 studies for SMC; similar for RR): results essentially unchanged — SMC β = 0.004 (95% CI: −0.014, 0.022); RR β = −0.011 (95% CI: −0.411, 0.39). Still null.
- Conclusion: strength gains were similar across a wide range of RIR (0–23) once load, duration, volume-equating method, and training status were adjusted for.

**Hypertrophy outcomes (140 effects, 26 studies):**
- Best-fit model (SMC): linear. R²marginal = 19.2%, R²conditional = 72.09%. β = −0.019 (95% CI: −0.035, −0.004; 95% PI: −0.551, 0.513) — **CI excludes null**; negative slope = hypertrophy increases as RIR decreases (i.e., closer to failure).
- Best-fit model (RR): linear. R²marginal = 26.38%, R²conditional = 64%. β = −0.48 (95% CI: −0.78, −0.179; 95% PI: −9.811, 9.817) — CI excludes null; same direction.
- Sensitivity analysis (<10 RIR, 137 effects/26 studies): SMC β = −0.023 (95% CI: −0.042, −0.004); RR β = −0.544 (95% CI: −0.929, −0.158). Direction and significance preserved.
- Conclusion: muscle hypertrophy shows a continuous, roughly linear increase as sets are terminated closer to failure, across the observed RIR range.

**Moderator/interaction findings (qualitative, reduced precision):**
- Strength: upper-body outcomes showed a more positive RIR slope than lower-body; multi-joint-only programs showed a more positive slope than mixed multi-/single-joint programs; within-participant designs showed a more positive slope than between-participant designs (in some models).
- Hypertrophy: programs without progressive overload (n=5) showed a positive slope while those with progressive overload (n=135) showed a negative slope; within-participant designs showed a less-negative/positive slope vs. between-participant designs.
- Method of volume equating (set- vs. repetition-equated) did not meaningfully alter either dose-response relationship.

## Strength / hypertrophy distinction

Explicitly separated as the paper's central finding: the dose-response relationship between RIR and outcome **differs by outcome type**. Strength gain (1RM/isometric/isokinetic) showed a negligible relationship with RIR across all best-fit models. Muscle hypertrophy showed a consistent (negative slope = closer-to-failure = more growth) relationship across all best-fit models and the sensitivity analysis. No endurance or power outcomes were examined.

## Practical interpretation

The authors propose that load is a better predictor of strength than proximity to failure, since force production declines as sets approach failure while it scales with load — meaning "load-mediated" changes in RIR (e.g., training near 1RM) matter more for strength than "intra-set-fatigue-mediated" changes in RIR (e.g., grinding out low-load sets to failure). For hypertrophy, the authors invoke Henneman's size principle/motor unit recruitment as a plausible mechanism by which training closer to failure recruits higher-threshold, higher-hypertrophy-potential fibers independent of load. The authors caution that quality of overall model fit was "modest" and uncertainty intervals were wide, meaning many dose-response shapes remain compatible with the data.

## Application relevance

- RIR is a directly trackable, loggable variable (repetitions in reserve at set termination) — a natural fit for a workout tracker's per-set logging UI.
- Could seed a *directional* heuristic/recommendation signal: for hypertrophy-oriented programming, trending toward lower RIR (closer to failure) is supported as a continuous lever; for strength-oriented programming, RIR is not a strongly supported lever — load/intensity should likely take priority in any recommendation logic.
- The wide prediction intervals and modest R² mean this is **not suitable** for computing a precise "optimal RIR number" or auto-adjusting load/reps based on a specific RIR target with any real precision. Best used for coarse-grained defaults/messaging ("training closer to failure trends toward more growth"), not exact thresholds.
- Because RIR here was *estimated*, not measured, app designs should not assume the analysis validates any particular RIR self-report or autoregulation instrument's accuracy.

## What this paper DOES support

- A continuous (non-categorical) framing of proximity to failure is analytically tractable and preferred over failure/non-failure dichotomies.
- A negligible dose-response relationship between estimated RIR and strength gain across 0–23 RIR, when load and duration are controlled.
- A modest but directionally consistent (across all model specifications and the <10 RIR sensitivity analysis) trend toward greater hypertrophy as RIR decreases.

## What this paper DOES NOT support

- An exact RIR threshold or cutoff at which hypertrophy or strength outcomes change qualitatively — relationships are continuous and uncertainty intervals are wide.
- A causal claim, since RIR was not experimentally manipulated in most cases but reconstructed after the fact from unrelated study designs (to-failure vs. not, velocity-loss studies, alternative set structures) using indirect estimation procedures.
- A universal recommendation to always train to failure or never train to failure.
- Generalization to synergist muscles or regional (proximal/middle/distal) hypertrophy — the analysis focuses on prime-mover, whole-muscle-average hypertrophy.
- Individual-level prescription — the authors explicitly warn that population-average relationships (as elsewhere in the RT literature, e.g., Damas et al. on volume) may not hold for a given individual.
- Extrapolation outside the observed ranges of volume, load, frequency, and duration in the underlying studies (see Figure 1).

## Limitations

**Author-stated:**
- Not pre-registered; not a systematic search (studies were pooled from prior meta-analyses plus ad hoc additions).
- RIR was almost never self-reported in the underlying studies; it was *estimated* via prediction equations, load/rep subtraction, or velocity-loss regressions — accuracy of these estimations is explicitly stated as unknown, and the number of repetitions possible at a given load is described as "highly individual."
- Set-to-set fatigue (RIR decreasing across sets within a session, unless load is adjusted) and progressive overload over the course of a program (RIR drifting if load isn't increased) were not adequately accounted for, potentially biasing RIR estimates in both directions depending on the study.
- RIR was averaged per group, discarding within-program variability (e.g., an average RIR of 2 could reflect uniformly 2-RIR sets or a mix of 1- and 3-RIR sets).
- Overall model fit was "modest" and uncertainty intervals wide — "many dose-response shapes are compatible with the current analysis."
- Analysis predominantly reflects prime-mover, whole-muscle-average hypertrophy; few studies examined synergist muscles or regional hypertrophy.
- Findings should not be extrapolated beyond the volumes/loads/frequencies/durations actually observed in the included studies.
- Population-average relationships may not hold at the individual level (citing Damas et al. as a contrasting example in the volume literature).

**Agent-assessed (not stated by authors):** As a preprint, this has not undergone peer review, which independently lowers confidence relative to a published, reviewed meta-analysis. The reliance on indirect/estimated RIR (rather than directly measured or self-reported RIR) compounds the well-documented difficulty of measuring proximity-to-failure accurately in this literature.

## Confidence

**Low.** This is an unregistered, non-systematic, exploratory meta-analysis of a proxy variable (estimated, not measured or self-reported, RIR) reconstructed post hoc across highly heterogeneous original study designs (to-failure trials, velocity-loss trials, alternative set-structure trials). It is a preprint, not peer reviewed. Model fit was modest (R²marginal generally 12–29%) and prediction intervals for individual data points were very wide, meaning substantial uncertainty remains about the true shape of the relationship for any given case. The hypertrophy finding is at least *consistent* in direction across four model specifications (SMC/RR × primary/sensitivity analysis) and low observation-level heterogeneity in some models, which is a point in its favor, but the strength null finding could reflect true absence of effect, opposing mechanisms canceling out (as the authors themselves discuss), or simply insufficient power/precision at the extremes of the RIR range.

## Relevant source locations

- Abstract: p.1. Introduction/rationale for continuous RIR: pp.2–4.
- Methods, RIR estimation procedures (5 subgroups, special cases): pp.4–8.
- Statistical model structure (6 functional forms compared via BIC/Bayes factors): pp.9–10.
- Study characteristics (55 studies, age, duration, volume/load/frequency): p.11, Figure 1 p.12.
- Strength outcomes and figures: pp.12–14 (Figures 2–3).
- Hypertrophy outcomes and figures: pp.14–16 (Figures 4–5).
- Sensitivity analyses (<10 RIR): pp.16–19 (Figures 6–9).
- Interacting moderators: pp.20–21.
- Discussion (specificity/force production, fatigue, mechanistic support): pp.22–27.
- Limitations and considerations: pp.28–29.
- Conclusion: pp.29–30. Reference list: pp.30–45.

## Cross-reference note

Both papers investigate proximity to failure and muscle hypertrophy and reach a broadly compatible headline conclusion — training closer to failure tends to favor hypertrophy — but they get there through materially different methods and only partially agree on shape and certainty. Robinson models RIR as a **continuous, estimated** variable across a heterogeneous pool of 55 studies (to-failure trials, velocity-loss trials, alternative set-structure trials) and finds an apparently **linear**, monotonic increase in hypertrophy as RIR approaches zero, with no plateau or reversal. Refalo (Sports Medicine, 2023 — see companion note) instead compares **discrete categories** (momentary failure vs. non-failure, other set-failure definitions vs. non-failure, high vs. moderate velocity loss) across 15 studies and reports point estimates that are **not strictly monotonic** — e.g., "set failure" (ES=0.46) numerically exceeds "momentary muscular failure" (ES=0.41) — leading Refalo to propose a **non-linear/plateauing** relationship, explicitly stating that closer proximity to failure does not always yield greater hypertrophy. This is a genuine disagreement in the shape of the dose-response curve (continuous-linear vs. non-linear/plateauing), not merely a difference in emphasis, and neither paper's confidence intervals are tight enough to fully arbitrate it — Refalo's adjacent-category CIs overlap substantially, and Robinson's prediction intervals are wide. Robinson additionally examines strength (finding a negligible RIR relationship), a question Refalo's hypertrophy-only review does not address at all. Robinson is the newer, broader analysis in scope (both outcomes, continuous dose-response, 55 studies) but is an unreviewed preprint with a non-systematic search; Refalo is a peer-reviewed, PRISMA-guided systematic review with lower per-study risk of bias reporting, but a smaller, hypertrophy-only evidence base. Neither should be treated as superseding the other — they address the same underlying question from different angles and their disagreement on curve shape should be treated as unresolved.
