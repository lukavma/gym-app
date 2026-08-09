# Product Evidence Boundaries

This document translates `docs/evidence/evidence-registry.md` into three explicit tiers, so that a future architecture/design phase can see, at a glance, which product behaviors rest directly on research findings versus which are reasonable extrapolations versus which should simply be left to the user. It does not propose specific UI, data models, or algorithms — only which category of justification is available for each underlying idea.

Every item in Category A cites the `EVIDENCE-XXX` ID(s) it rests on. Every item in Category B names the Category A principle(s) it is built from and is explicit that it is a heuristic, not itself a directly tested finding.

---

## A. Evidence-supported principles

These are backed by at least one, and often multiple converging, sources in the registry. "Evidence-supported" does not mean "certain" — see each linked item's confidence rating before treating any of these as beyond dispute.

1. **Resistance training improves both strength and hypertrophy compared to no training.** (`EVIDENCE-016`, `EVIDENCE-019`) — Moderate-to-High confidence for the top-line claim; this is the best-supported statement in the entire corpus.

2. **Weekly training volume (sets) has a positive, diminishing-returns relationship with both hypertrophy and strength.** More sets tend to help, up to a point, after which additional sets add progressively less. (`EVIDENCE-001`, `EVIDENCE-002`, `EVIDENCE-003`) — Moderate confidence. The exact shape and any hard ceiling are not established with precision. This pooled, cross-muscle-group relationship does not necessarily hold uniformly for every individual muscle: a smaller, muscle-specific meta-analysis found a high-volume (>20 sets/week) advantage for triceps brachii but not for quadriceps or biceps brachii (`EVIDENCE-028`) — Low-Moderate confidence, three muscles only, no low-volume comparison, unbounded high-volume category.

3. **Training frequency has a clear, meaningful positive relationship with strength gains, but only a weak, statistically uncertain (near-null) independent relationship with hypertrophy.** (`EVIDENCE-005`, `EVIDENCE-006`) — Moderate confidence for strength; Low confidence (but consistent across two independent sources) for the hypertrophy near-null.

4. **Training load matters for strength (heavier loads → more 1RM gain) but is largely interchangeable across low/moderate/high load zones for hypertrophy, provided training is taken close to failure.** This strength-vs-hypertrophy divergence is one of the best-corroborated findings in the corpus. (`EVIDENCE-008`, `EVIDENCE-009`, `EVIDENCE-010`) — Moderate confidence, corroborated by two independent peer-reviewed sources.

5. **Proximity to failure has a negligible relationship with strength gains, but trends toward a positive relationship with hypertrophy** — though the magnitude and robustness of the hypertrophy relationship is genuinely disputed between two sources in this corpus, and literal failure does not appear to be required for either outcome. (`EVIDENCE-011`, `EVIDENCE-012`, `EVIDENCE-013`, and the Robinson-vs-Refalo conflict note) — Low confidence throughout for the broad, continuous dose-response question; treat as a directional lean only. **Narrower claim, higher confidence:** a well-controlled within-participant RCT found training with a 1–2 RIR buffer produces hypertrophy statistically indistinguishable from training to failure, while producing less acute neuromuscular fatigue (`EVIDENCE-029`) — Moderate confidence at the claim level (three methodologically complementary sources — two meta-analytic, one experimental — now converge on "failure is not required," even though they still disagree on the shape of the fuller curve).

6. **Periodized training modestly benefits strength, but not hypertrophy, when volume is held equal.** Within strength outcomes specifically, linear periodization's edge over undulating periodization is confined to trained (not untrained) individuals. (`EVIDENCE-017`, `EVIDENCE-018`, `EVIDENCE-020`) — Moderate confidence, single source, effects modest and somewhat sensitivity-fragile.

7. **A single one-week period of complete training cessation ("deload") did not measurably affect hypertrophy but was associated with smaller strength gains, in one specific tested protocol** (young trained lifters, midpoint of a 9-week high-volume block). (`EVIDENCE-025`) — Moderate confidence, single RCT, narrow protocol, disclosed funding conflict of interest.

8. **Biasing exercise range of motion toward long muscle lengths is a reasonable default for hypertrophy**, and partial ROM emphasizing long muscle length can match or exceed full ROM for some (not necessarily all) muscles. (`EVIDENCE-022`) — Moderate confidence for the headline direction; Low confidence for muscle-specific claims (often 1–3 studies each).

9. **A broad range of repetition tempos (roughly 2–8 seconds per rep) supports similar hypertrophy outcomes**, with no clearly established advantage to biasing eccentric or concentric phase duration specifically. (`EVIDENCE-021`) — Moderate confidence per the source authors, though based on a narrative review with conflicting individual studies underneath.

10. **Self-estimated RIR tends to be more accurate when reported close to failure than far from it**, and accuracy by sex, training experience, and exercise type remain contested/inconsistent across studies. (`EVIDENCE-014`) — Moderate confidence for the directional pattern; Low confidence for any specific accuracy moderator.

11. **Self-reported RIR carries real, non-trivial measurement error — typically under 1 repetition on average among experienced lifters under controlled conditions, but not zero.** (`EVIDENCE-030`, extending `EVIDENCE-014`) — Moderate confidence for "RIR is useful but imprecise"; this is distinct from, and should never be conflated with, a claim that RIR is an objectively precise measurement.

12. **Load progression (same rep target, increasing load) and repetition progression (same load, increasing reps), both taken to concentric failure, produce statistically indistinguishable strength and hypertrophy gains.** (`EVIDENCE-031`) — Moderate confidence; single RCT, untrained population, one exercise, 10 weeks — but a methodologically strong within-subject design and the corpus's first direct test of this specific comparison.

---

## B. Reasonable programming heuristics

These are **not themselves directly tested** by any paper in the corpus. Each is a plausible extrapolation built on top of one or more Category A principles, and should be presented to users/architects as a design choice informed by evidence — never as a directly proven finding in its own right.

1. **"Set a target RIR; adjust load in the next set/session if the target isn't met."**
   Built on: `EVIDENCE-015` (this is the dominant pattern observed across the RIR literature, not a validated superior method) + `EVIDENCE-014` (self-reported RIR is more trustworthy near failure). This is a reasonable autoregulation mechanism to offer, but should not be marketed as scientifically proven superior to fixed-load progression — the evidence for its superiority is a small number of individual studies with mixed comparative results.

2. **Weighting indirect/synergist-muscle involvement in compound exercises as a partial (not full, not zero) contribution to a muscle's weekly set count** (e.g., counting a synergist's involvement as roughly half a direct set).
   Built on: `EVIDENCE-004` (fractional counting was the best-fitting statistical model in one dose-response analysis). This is a defensible volume-tracking convention, not a validated physiological constant — the specific weighting fraction is a modeling choice from one dataset, not a directly measured biological quantity.

3. **Offering multiple load/rep-range pathways (e.g., moderate and heavy) as comparably valid options for a hypertrophy goal, while nudging toward moderate-to-heavy loads for a strength goal.**
   Built on: `EVIDENCE-008`, `EVIDENCE-009`, `EVIDENCE-010`. The "offer multiple valid hypertrophy pathways" part is well supported; the "nudge toward heavier loads for strength" part is supported for high/moderate vs. low load, but the specific high-vs-moderate edge for strength is only a statistical trend (not confirmed) — frame any such nudge as mild, not absolute.

4. **Treating training frequency primarily as a tool for distributing weekly volume into manageable sessions, rather than as an independent hypertrophy-boosting lever.**
   Built on: `EVIDENCE-006`. This reframes frequency's practical role (session-size management) in a way the underlying evidence supports, without overstating frequency's direct causal contribution to hypertrophy.

5. **Offering a structured progression/periodization scheme as a differentiating feature for strength-focused users, while treating periodization structure as a lower-priority/preference-level feature for hypertrophy-only users.**
   Built on: `EVIDENCE-017`, `EVIDENCE-018`, `EVIDENCE-020`. The strength benefit is real but modest and somewhat fragile (sensitivity-dependent); this should not be framed as a large or guaranteed improvement.

6. **Treating a post-deload (full rest week) dip in a tracked strength metric (e.g., a 1RM estimate) as an expected, non-alarming pattern rather than a sign of regression or program failure — while noting that continuous training likely preserves more strength progress than a complete-rest week.**
   Built on: `EVIDENCE-025`. This is extrapolated from a single RCT testing one narrow protocol (complete cessation, 1 week, midpoint of a 9-week block); it should not be generalized to reduced-volume-style deloads, other durations, or other timings, all of which were explicitly not tested by that study.

7. **Defaulting exercise-technique cues toward achieving a full or lengthened range of motion where safe and feasible, as a mild default rather than a strict requirement.**
   Built on: `EVIDENCE-022`. The evidence supports a general lean toward long-muscle-length ROM, not a rigid universal ROM rule — muscle-specific and muscle-head-specific exceptions exist even within the (thin) evidence base itself.

8. **Weighting low-RIR (e.g., 0–2) user-logged data more heavily than high-RIR (e.g., 5+) user-logged data when using self-reported effort to inform progression decisions.**
   Built on: `EVIDENCE-014`. This is a reasonable data-quality heuristic, not a precisely validated accuracy model — no consistent quantitative error margin exists in the underlying literature.

9. **Offering both load-based progression and repetition-based progression as selectable, interchangeable overload strategies, rather than defaulting to load progression as "the" correct method.**
   Built on: `EVIDENCE-031` (both schemes, taken to failure, produced statistically indistinguishable strength and hypertrophy outcomes in a controlled RCT). This is an architecture/strategy-level heuristic — "support multiple progression strategies" — not itself a tested finding. It must be kept distinct from a specific automated *trigger rule* such as "increase load by 2.5kg once all prescribed reps are completed with ≥2 RIR": that kind of numeric, condition-based rule is a heuristic invention layered on top of evidence-supported concepts (progression exists, RIR can be tracked), not something any paper in this corpus tests or validates. Evidence-supported ≠ the specific trigger threshold; only the general viability of multiple progression strategies is evidence-supported.

10. **Defaulting hypertrophy-focused programming toward a 0–2 RIR target range rather than mandating training to literal momentary failure.**
    Built on: `EVIDENCE-029` (1–2 RIR produced hypertrophy statistically indistinguishable from failure, with less acute fatigue) + `EVIDENCE-013`/conflict note (failure itself does not appear necessary). This is a reasonable default framing, not a claim that 0–2 RIR is precisely optimal — only that it is a defensible, evidence-consistent choice within the narrow band actually tested (failure vs. 1–2 RIR), not a validated point-optimum across the full RIR range.

11. **Treating a user-entered RIR value as an approximate signal (expect roughly ±1 rep of typical noise) rather than an exact input, anywhere it feeds downstream logic (progression suggestions, volume calculations, effort tracking).**
    Built on: `EVIDENCE-030` (dedicated accuracy study: absolute error 0.40–0.90 reps depending on target, even among highly experienced lifters under best-case conditions) and `EVIDENCE-014`. This is a data-handling/tolerance heuristic — it argues for architectural tolerance of RIR noise, not for a specific numeric correction algorithm, and should not be read as license to silently "correct" a user's reported value by a fixed offset.

---

## C. User-configurable preferences

For these variables, the evidence base shows no clear performance difference between the available options (within the ranges actually tested) — so the product should let users choose based on preference, enjoyment, equipment access, or convenience, without asserting that one choice is scientifically superior.

1. **Training load / rep range for a hypertrophy-only goal.** Low, moderate, and high loads performed to failure show statistically similar hypertrophy outcomes. (`EVIDENCE-008`) Users can choose based on joint comfort, equipment access, or personal preference (e.g., avoiding very heavy loads if fatigue-averse; avoiding very light/high-rep sets if they find them unpleasant).

2. **Repetition tempo within roughly 2–8 seconds per rep, for hypertrophy purposes.** No consistent advantage to biasing eccentric vs. concentric duration. (`EVIDENCE-021`) Users can select a tempo that feels sustainable and controllable.

3. **Periodization model (linear vs. undulating) for untrained users, or for hypertrophy-only goals generally.** No significant hypertrophy difference between models; the (modest) strength advantage for linear periodization was specific to trained individuals only. (`EVIDENCE-018`, `EVIDENCE-020`) Untrained/beginner users or hypertrophy-focused users can pick either model freely.

4. **Deload timing/frequency for hypertrophy-focused users specifically.** No hypertrophy harm was detected from a full rest week in the one tested protocol. (`EVIDENCE-025`) Users training primarily for hypertrophy can be given flexibility here. (Note: this is *not* extended to strength-focused users in the same unqualified way — see heuristic B6 above, which recommends flagging the strength trade-off rather than presenting it as a fully free choice.)

5. **Exercise-specific kinematic choices (grip width, stance, foot position) beyond the single documented calf foot-position exception.** No meaningful hypertrophy-outcome evidence exists to prefer one kinematic variant over another for most exercises. (`EVIDENCE-026`) These should be presented as comfort/injury-history/biomechanics-convention choices, not as hypertrophy-optimized recommendations.

6. **Strict vs. non-strict (momentum-assisted) technique.** No literature at all — direct or indirect — evaluates this against hypertrophy outcomes. (`EVIDENCE-023`) This is entirely a matter of general safety convention and personal choice, not evidence-based hypertrophy optimization.

7. **Progression scheme — load progression (fixed reps, increasing load) vs. repetition progression (fixed load, increasing reps) — when both are taken to concentric failure.** A controlled within-subject RCT found no significant difference in strength or hypertrophy outcomes between the two schemes. (`EVIDENCE-031`) Users (or a default preset) can choose based on preference — e.g., equipment granularity (fine-grained loadable plates vs. coarse jumps), preference for chasing rep PRs vs. load PRs, or session variety — without asserting one scheme is scientifically superior. (Note: this single-study finding is specific to failure-based training taken to concentric failure; it has not been tested under a non-failure/RIR-based regime.)
