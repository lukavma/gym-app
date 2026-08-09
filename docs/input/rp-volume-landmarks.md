# RP Volume Landmarks

## Purpose

This file contains resistance-training volume landmarks derived from the Renaissance Periodization (RP) training framework.

These values are included as a **coaching/framework preset** for the application and must NOT be treated as universal physiological thresholds or as equivalent to findings from peer-reviewed scientific literature.

The research corpus in `docs/research/` and the derived evidence files in `docs/evidence/` are the authoritative sources for evidence-supported claims.

The application may later expose these values as:

- an optional RP-style preset
- configurable reference ranges
- starting points for individualization
- visual context for weekly training volume

They should not be hard-coded as universal training rules.

---

# Terminology

## MV — Maintenance Volume

Approximate weekly training volume thought to be sufficient to maintain existing muscular development.

## MEV — Minimum Effective Volume

Approximate minimum weekly volume thought to produce meaningful adaptation.

## MAV — Maximum Adaptive Volume

A proposed range of weekly volume within which productive adaptation is expected to occur for many trainees.

## MRV — Maximum Recoverable Volume

Approximate weekly training volume beyond which recovery may become increasingly difficult.

These terms are part of the RP programming framework.

They should be considered **heuristic concepts rather than precisely established biological thresholds**.

---

# Volume Landmarks

| Muscle Group | MV | MEV | MAV | MRV | Suggested Frequency | Suggested Loading |
|---|---:|---:|---:|---:|---:|---|
| Abs | 0 | 0 | 16–20 | 25+ | 3–5x/week | 8–20 reps |
| Back | 8 | 10 | 14–22 | 25+ | 2–4x/week | 6–20 reps |
| Biceps | 5 | 8 | 14–20 | 26+ | 2–6x/week | 8–15 reps |
| Triceps | 4 | 6 | 10–14 | 18+ | 2–4x/week | 6–15 reps pressing; 10–20 reps extensions |
| Calves | 6 | 8 | 12–16 | 20+ | 2–4x/week | 60–70% 1RM |
| Chest | 8 | 10 | 12–20 | 22+ | 1.5–3x/week | 8–12 reps |
| Front Delts | 0 | 0 | 6–8 | 12+ | 1–2x/week | 6–10 reps |
| Glutes | 0 | 0 | 4–12 | 16+ | 2–3x/week | 8–12 reps |
| Hamstrings | 4 | 6 | 10–16 | 20+ | 2–3x/week | 70–85% 1RM |
| Quads | 6 | 8 | 12–18 | 20+ | 1.5–3x/week | 8–15 reps |
| Rear / Side Delts | 0 | 8 | 16–22 | 26+ | 2–6x/week | 10–12 reps |
| Traps | 0 | 0 | 12–20 | 26+ | 2–6x/week | 10–20 reps |

---

# Interpretation Rules

## Volume

All volume values represent approximate **weekly hard-set counts**.

Values written as `25+`, `22+`, etc. should be interpreted as an approximate lower boundary rather than an exact upper physiological limit.

For example:

`Chest MRV = 22+`

should NOT be interpreted as:

> 21 sets are recoverable and 22 sets are not.

Instead it represents an approximate coaching reference indicating that weekly volume around or above this level may become difficult to recover from for many trainees.

---

# Frequency

Frequency represents suggested weekly exposure to a muscle group.

Examples:

- `2–4x` = approximately two to four training exposures per week
- `1.5–3x` = approximately three exposures every two weeks through three exposures per week

Frequency should not necessarily be interpreted as an independent driver of hypertrophy.

It may primarily be useful for distributing weekly volume and managing per-session fatigue.

The scientific evidence layer should determine what claims the application may make regarding frequency.

---

# Loading

The loading column is included as an RP-style programming recommendation.

Entries may use either:

- repetition ranges
- percentage of 1RM
- exercise-context-dependent repetition ranges

Examples:

### Triceps

Pressing movements:

`6–15 reps`

Isolation / extension movements:

`10–20 reps`

### Hamstrings

Suggested loading:

`70–85% 1RM`

These should remain configurable and must not be interpreted as exclusive hypertrophy-producing ranges.

---

# Future Application Representation

A possible normalized representation could distinguish the source from scientific evidence:

```json
{
  "muscleGroup": "Chest",
  "source": "rp_volume_landmarks",
  "type": "coaching_preset",
  "volume": {
    "mv": 8,
    "mev": 10,
    "mav": {
      "min": 12,
      "max": 20
    },
    "mrv": {
      "threshold": 22,
      "openEnded": true
    }
  },
  "frequency": {
    "min": 1.5,
    "max": 3
  },
  "loading": {
    "type": "repRange",
    "minReps": 8,
    "maxReps": 12
  }
}
```

The eventual architecture should determine the actual storage format.

This file defines domain input only and should not dictate the database schema.

---

# Direct and Indirect Sets

The values in this document do not define how compound exercises should be attributed to multiple muscle groups.

For example, this file does not prescribe whether five sets of bench press should count as:

- 5 chest sets only
- 5 chest + 5 triceps sets
- 5 chest + fractional triceps/front-delt sets

Set attribution should be determined separately using the scientific evidence corpus and application design decisions.

If fractional-set accounting is implemented, it should remain distinguishable from the original RP landmark values.

---

# Individualization

These landmarks should eventually function as **starting references rather than permanent personalized targets**.

Longitudinal user data may provide more useful information about an individual's response to training, including:

- performance trends
- RIR trends
- recovery
- adherence
- soreness
- workload tolerance
- progression rate

The application should therefore be architected so that generic presets can later coexist with individualized estimates.

---

# Evidence Boundary

Do not use this file as evidence for claims such as:

- 12–20 chest sets is universally optimal
- 22 chest sets is a universal MRV
- every trainee requires at least MEV to grow
- reaching MAV is necessary for optimal hypertrophy
- training above MRV necessarily causes regression
- the listed repetition ranges are the only effective ranges
- the listed frequencies are physiologically optimal

Any such claim must instead be evaluated against the scientific research corpus.