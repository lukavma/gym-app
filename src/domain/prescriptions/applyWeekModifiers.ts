import { SETS_MAX, type SetScheme } from "../schemes/setScheme";
import type { RirBand } from "../schemes/rirBand";
import type { WeekModifiers } from "../blocks/schema";
import { roundToStepKg } from "../progression/loadHelpers";

// prescription-model.md §5 — "setMultiplier rounds down, minimum 1 set."
// Applied to the prescription's own `sets` field, independent of any
// resolved working target (both `fixed` and `repRange` schemes carry `sets`).
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
  const sets = Math.min(SETS_MAX, Math.max(1, Math.floor(scheme.sets * multiplier)));
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

export function applyWeekModifiersToPrescription(
  scheme: SetScheme,
  targetRir: RirBand | null,
  modifiers: WeekModifiers | null,
): { scheme: SetScheme; targetRir: RirBand | null } {
  return {
    scheme: applySetMultiplier(scheme, modifiers?.setMultiplier),
    targetRir: applyTargetRirShift(targetRir, modifiers?.targetRirShift),
  };
}
