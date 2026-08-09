# Volume Model

Status: Final for MVP implementation. Companions: `domain-model.md` §8, `data-model.md`, `evidence-to-design.md`, source input `docs/input/rp-volume-landmarks.md`.

Defines how weekly per-muscle training volume is counted, aggregated, displayed against reference bands, and kept honest about what is science versus coaching heuristic.

---

## 1. Definitions

| Term | Definition |
|---|---|
| **Work set** | A logged `SetLog` with `isWarmup = false`, in a session that is not `discarded` |
| **Raw direct sets** (per muscle, per week) | Count of work sets of exercises where the muscle has a `primary` contribution |
| **Effective (fractional) sets** (per muscle, per week) | Σ over work sets of `contributionWeight(exercise, muscle)` |
| **Contribution weight** | Per (exercise, muscle) decimal in (0, 1]; defaults: primary 1.0, secondary 0.5 |

Both raw and effective are surfaced; effective is the primary display number, raw is the sanity anchor ("Chest: 14.0 effective · 12 direct").

**Status of the 0.5 default:** a *useful modeling convention* — fractional counting fit dose-response data best in one analysis (EVIDENCE-004), but 0.5 is a best-fitting statistical parameter from one dataset, not a biological constant. It is therefore stored as data on every contribution row (editable per exercise/muscle), never hard-coded in aggregation logic, and labeled `heuristic` wherever explained in UI.

---

## 2. Aggregation (derived, never persisted)

```text
weeklyVolume(weekStart, weekEnd):
  sets = work sets of non-discarded sessions with startedAt in [weekStart, weekEnd)
  for each set:
    for each contribution of set.exercise:
       effective[contribution.muscle] += contribution.weight
       if contribution.role == 'primary': raw[contribution.muscle] += 1
  return { per muscle: {effective, raw}, deloadWeek: any session flagged isDeload }
```

- Pure function in `src/domain/volume/`; inputs are plain rows, output is a report object. No caching in MVP — a week is a few hundred sets, microseconds of arithmetic; recomputing on demand can never go stale (see `architecture-plan.md` §derived-data).
- **Two bucketing modes**, both derived:
  - *Calendar week* (dashboard): user timezone, week starts Monday (setting).
  - *Block week* (block view): `[startDate + 7(n−1), startDate + 7n)` per block.
- Sets attribute to the week of their session's `startedAt` (a session spanning midnight stays in its start week — sessions are atomic for volume).
- Deload weeks render with a badge and are visually de-emphasized in trend charts, not excluded (they happened).
- Warmups excluded by definition; ad-hoc exercises count exactly like templated ones (volume cares about what was done, not why).

## 3. Historical consistency policy

Contribution weights are **not snapshotted per session**. All volume views — past and present — are computed under the *current* contribution configuration:

- Volume is an interpretation layer over SetLogs (the facts), not itself a fact. What must stay immutable is "5 sets of bench at 110 kg on 2026-08-07", and it does.
- One uniform convention across all weeks keeps trends internally comparable. Snapshotting would permanently mix conventions after any edit (week 12 counted with old weights, week 13 with new) — silently corrupting exactly the comparison volume exists to support.
- Editing a weight therefore visibly re-interprets all history at once, which is the honest behavior. The UI notes this on the edit screen ("changes how all weeks are counted").
- If per-era interpretation is ever genuinely needed, an additive contribution-history table enables "as-of" mode without migration (parked in `open-decisions.md`).

Decision record: `adr/ADR-007-historical-integrity.md`.

---

## 4. Volume presets and landmarks

### Model

```text
VolumePreset   { id, name, description, classification, sourceRef?, evidenceRefs?, isBuiltin, archivedAt? }
VolumeLandmark { presetId, muscleGroupId, key, valueMin?, valueMax?, openEnded, note? }
```

- `key` is a free string (`'mv' | 'mev' | 'mav' | 'mrv' | …`) — the schema does **not** bake in RP's four-landmark framework. An RP preset uses mv/mev/mav/mrv keys; a future "evidence reference band" preset can use a single `reference_band` key; a personalized preset can use `estimated_productive_range`. All without schema change.
- Single-value landmarks: `valueMin = valueMax`. Open-ended ceilings (RP "22+"): `valueMin = 22, openEnded = true, valueMax = null`.
- `classification: 'evidence_supported' | 'heuristic' | 'user_defined'` + optional `evidenceRefs` (registry IDs) — same vocabulary as progression rules (brief §33).

### Seeded presets

1. **RP General** — `classification: 'heuristic'`, `sourceRef: 'docs/input/rp-volume-landmarks.md'`, `isBuiltin: true`, immutable (customize = duplicate). Seeding caveats, documented in the preset description itself:
   - RP's "Rear/Side Delts" combined row seeds identical values onto both `rear_delts` and `side_delts`, with a note that RP counts them combined — a seeding approximation, user-editable.
   - RP's "Back" row maps to the single `back` muscle group (matching MVP granularity).
   - `forearms` and `lower_back` get no RP landmarks (RP table has none).
2. **Custom** — user-created from scratch or duplicated from RP (`classification: 'user_defined'`); per-muscle overrides = editing your own preset's landmark rows.

A block may reference one preset (`volumePresetId`) for its volume view; absent that, the dashboard uses the user's default preset (setting), or none — volume display works fine with zero presets.

### Display semantics (strictly non-coercive)

- Bands render as background zones on the weekly volume chart; current week's effective sets overlay them. Copy language: "reference range", never "target", "requirement", or "optimum".
- **No alerts, no auto-adjustment, no programming logic reads landmarks in MVP.** GAP-01 is explicit: per-muscle landmarks are not scientifically established, and an auto-MEV/MRV algorithm is blocked on evidence that does not exist. Landmarks are context for a human, full stop.
- The volume screen carries a one-line provenance caption: "RP General is a coaching preset (heuristic), not established science."

---

## 5. Evidence framing rules for anything volume-related

Binding on UI copy and future features:

1. Volume↔hypertrophy is a **diminishing-returns curve with no established ceiling** (EVIDENCE-001); volume↔strength plateaus functionally (EVIDENCE-002). Never present a specific set count as a validated cap or optimum.
2. The dose-response is a **pooled population average**; per-muscle response varies (EVIDENCE-028: triceps ≠ quads/biceps pattern). Per-muscle tracking is therefore useful; per-muscle *prescriptions* are not evidence-derivable.
3. Fractional counting is a defensible convention, weights are tunable parameters (EVIDENCE-004).
4. RP landmarks are coaching heuristics (GAP-01, `docs/input/rp-volume-landmarks.md` preamble) — labeled as such at every surface where they appear.
5. Frequency is displayed (sessions per muscle per week) as a *distribution* descriptor, never as a hypertrophy multiplier (EVIDENCE-006); for strength context it may be framed as a supported lever (EVIDENCE-005).

---

## 6. MVP scope of volume features

In: weekly effective + raw sets per muscle (current week + last 8 weeks trend), calendar and block bucketing, RP preset seed, custom presets, per-exercise contribution editing, provenance captions.

Out (post-MVP or blocked): volume-based recommendations, MEV/MRV auto-estimation (blocked on evidence — GAP-01), per-session volume pacing, muscle-group splits beyond the seeded 15 groups, as-of historical contribution interpretation.
