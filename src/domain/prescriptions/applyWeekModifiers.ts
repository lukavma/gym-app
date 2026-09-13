import { SETS_MAX, type GroupsScheme, type SetScheme } from "../schemes/setScheme";
import type { RirBand } from "../schemes/rirBand";
import type { WeekModifiers } from "../blocks/schema";
import { roundToStepKg } from "../progression/loadHelpers";

function multipliedSetCount(sets: number, multiplier: number): number {
  return Math.min(SETS_MAX, Math.max(1, Math.floor(sets * multiplier)));
}

// set-groups-architecture-evaluation.md §8 "Block modifiers" — setMultiplier
// applies to each group's `min` and `max` independently (floor, min 1, keep
// `min <= max`), then the total is clamped so Σ max <= SETS_MAX — the same
// invariant setSchemeSchema's superRefine enforces on write, restated here so
// an effective (post-modifier) scheme is always valid too.
function applySetMultiplierToGroups(scheme: GroupsScheme, multiplier: number): GroupsScheme {
  const scaled = scheme.groups.map((g) => {
    const min = multipliedSetCount(g.sets.min, multiplier);
    const max = Math.max(min, multipliedSetCount(g.sets.max, multiplier));
    return { ...g, sets: { min, max } };
  });
  let totalMax = scaled.reduce((sum, g) => sum + g.sets.max, 0);
  if (totalMax > SETS_MAX) {
    // Clamp the last groups down first (their `max` is the least likely to
    // be load-bearing for the athlete's stated "top group first" ordering),
    // never below each group's own `min`.
    for (let i = scaled.length - 1; i >= 0 && totalMax > SETS_MAX; i--) {
      const g = scaled[i]!;
      const reducible = g.sets.max - g.sets.min;
      const reduceBy = Math.min(reducible, totalMax - SETS_MAX);
      if (reduceBy > 0) {
        g.sets = { ...g.sets, max: g.sets.max - reduceBy };
        totalMax -= reduceBy;
      }
    }
  }
  return { ...scheme, groups: scaled };
}

// prescription-model.md §5 — "setMultiplier rounds down, minimum 1 set."
// Applied to the prescription's own `sets` field, independent of any
// resolved working target (`fixed`/`repRange`/the two athletic variants all
// carry a top-level `sets`; `groups` does not — see applySetMultiplierToGroups
// above, the set-groups evaluation's required exhaustive-switch handling for
// the fifth-variant compile error prescription-model.md §2 calls for).
//
// M-1 remediation — weekModifiersSchema bounds setMultiplier to (0, 2] on
// write, but a block/override created before that bound existed can still
// hold an arbitrary stored value (it's read back with a cast, not
// re-validated — see buildTodayBundle). Clamping to SETS_MAX here, not just
// at the schema boundary, is what makes "effective modifier application
// always produces a PrescriptionSnapshot-valid scheme" (prescription-model.md
// §6: 1 <= sets <= 20) true regardless of when the config was written.
export function applySetMultiplier(scheme: SetScheme, multiplier: number | undefined): SetScheme {
  if (multiplier === undefined) return scheme;
  if (scheme.type === "groups") return applySetMultiplierToGroups(scheme, multiplier);
  const sets = multipliedSetCount(scheme.sets, multiplier);
  return { ...scheme, sets };
}

// prescription-model.md §3 — "Deload/week modifiers may shift the band
// (targetRirShift), clamped to [0, 10]." Clamping each end independently to
// the same interval is a monotonic transform, so it can never invert the
// band (min stays <= max) regardless of the shift's magnitude or sign.
export function applyTargetRirShift(
  band: RirBand | null,
  shift: number | undefined,
): RirBand | null {
  if (shift === undefined || band === null) return band;
  const clamp = (v: number) => Math.min(10, Math.max(0, v));
  return { min: clamp(band.min + shift), max: clamp(band.max + shift) };
}

// prescription-model.md §4 — "Deload loadMultiplier applies to the prefill
// at effective-prescription time, rounded to loadStepKg." Unlike
// setMultiplier/targetRirShift (which modify the static prescription shape),
// this applies to the already-resolved dynamic working-target number —
// decision, carry-forward, or baseline, whichever the chain produced.
export function applyLoadMultiplier(
  loadKg: number | null,
  multiplier: number | undefined,
  loadStepKg: number,
): number | null {
  if (multiplier === undefined || loadKg === null) return loadKg;
  return roundToStepKg(loadKg * multiplier, loadStepKg);
}

// L-2 (independent review) — a group's OWN `targetRir` override is a
// SEPARATE band from the slot's; without this, `targetRirShift` never
// reached it at all, leaving a group's own band unshifted while the slot
// (and every group WITHOUT its own override, which correctly inherits the
// slot's already-shifted band at resolution time via the existing
// `group.targetRir ?? snapshot.targetRir` fallback in
// `groupEvaluation.ts`/`buildSnapshot.ts`) moved. Shifting a group's own
// band here, exactly once, is what keeps that inheritance from double-
// shifting: a group with no override of its own is untouched by this
// function and picks up the shift ONLY through the slot's already-shifted
// value it falls back to.
function applyTargetRirShiftToGroups(scheme: SetScheme, shift: number | undefined): SetScheme {
  if (shift === undefined || scheme.type !== "groups") return scheme;
  return {
    ...scheme,
    groups: scheme.groups.map((g) => {
      if (!g.targetRir) return g;
      const shifted = applyTargetRirShift(g.targetRir, shift);
      return shifted ? { ...g, targetRir: shifted } : g;
    }),
  };
}

export function applyWeekModifiersToPrescription(
  scheme: SetScheme,
  targetRir: RirBand | null,
  modifiers: WeekModifiers | null,
): { scheme: SetScheme; targetRir: RirBand | null } {
  const multiplied = applySetMultiplier(scheme, modifiers?.setMultiplier);
  return {
    scheme: applyTargetRirShiftToGroups(multiplied, modifiers?.targetRirShift),
    targetRir: applyTargetRirShift(targetRir, modifiers?.targetRirShift),
  };
}
