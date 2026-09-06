// Estimated 1RM tracker — the strength page's what-if calculator.
//
// Binding source: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`
// §15.1, Release A row: "what-if calculator (reps + RIR -> load from the
// current estimate with the same rules and codes)". §9.4 supplies the target
// effort bounds, §9.5 steps 5-8 the finite guard, the load-step floor and the
// required band, and §15.4 the codes.
//
// SCOPE, stated because it is the one place Release A brushes against
// Release B: this is NOT `suggestStartingLoad`. It has no tier, no basis
// selection, no consistency gate, no carry-forward or pending-recommendation
// interaction, and it never reaches a prefill, a decision or the outbox.
//
// Of §9.5's three caps it applies exactly one:
//
//   * step 2, the pooled cross-check, is an IDENTITY here — the calculator's
//     basis IS `currentE1RM`, so `raw` and `pooledTranslated` are the same
//     number and the comparison can never bind.
//   * step 3, the direct-evidence cap, is INAPPLICABLE — it caps at "the
//     heaviest basis group load", and the calculator selects no basis group.
//   * step 4, the global `UPWARD_LOAD_CAP_FACTOR` cap, IS applied. §9.5 says
//     it "applies to **every** tier (evaluation O-3 accepted)", and §15.1
//     specifies the calculator as working "with the same rules and codes".
//     Owner decision, 2026-09-06, on review finding F-2: the earlier reading
//     that scoped every cap to a suggestion is withdrawn for this one step.
//     `CAPPED_AT_RECENT_MAX_LOAD` is emitted when it binds, which is why that
//     code is Release-A-reachable while the other two cap codes are not.
//
// The cap basis is the heaviest ADMITTED group load among non-deload
// observations in the evidence window — the heaviest load the athlete has
// actually handled recently, on evidence this feature was willing to count.
// Excluded groups (sub-modal, implausible) never raise it, so a `1100 kg`
// typo cannot licence a bigger answer (I-13).

import {
  NOISE_SD_PCT,
  TARGET_RTF_CORE_MAX,
  TARGET_RTF_MAX,
  TARGET_RTF_MIN,
  UPWARD_LOAD_CAP_FACTOR,
} from "./constants";
import { ceilToStepKg, floorToStepKg, repMultiplier, round2 } from "./primitives";
import type { StrengthReasonCode } from "./reasonCodes";
import type { StrengthEstimate, StrengthWhatIf, StrengthWhatIfInput } from "./types";

export interface WhatIfArgs {
  input: StrengthWhatIfInput;
  estimate: StrengthEstimate;
  loadStepKg: number;
  // §9.5 step 4's cap basis. Null when no admitted group exists in the window
  // — in which case there is no `currentE1RM` either, so the calculator has
  // already refused before the cap could apply.
  windowMaxAdmittedLoadKg: number | null;
}

function refuse(
  input: StrengthWhatIfInput,
  targetRtf: number,
  reasonCodes: StrengthReasonCode[],
): StrengthWhatIf {
  return {
    status: "none",
    targetReps: input.reps,
    targetRir: input.rir,
    targetRtf,
    loadKg: null,
    rawLoadKg: null,
    bandKg: null,
    reasonCodes,
  };
}

export function computeWhatIf({
  input,
  estimate,
  loadStepKg,
  windowMaxAdmittedLoadKg,
}: WhatIfArgs): StrengthWhatIf {
  const targetRtf = input.reps + input.rir;

  // No estimate, no answer — and the honest reason is the estimate's own
  // primary code, not a second vocabulary invented here.
  if (estimate.currentE1rmKg === null) {
    const primary = estimate.reasonCodes.find(
      (code) =>
        code === "EXERCISE_CATEGORY_UNSUPPORTED" ||
        code === "EXERCISE_ESTIMATE_DISABLED" ||
        code === "NO_ELIGIBLE_SETS" ||
        code === "NO_RECENT_EVIDENCE",
    );
    return refuse(input, targetRtf, [primary ?? "NO_ELIGIBLE_SETS"]);
  }

  // §9.4 — `TARGET_RTF_MIN = 3`: an advisory surface never translates to a
  // near-maximal target.
  if (targetRtf < TARGET_RTF_MIN) {
    return refuse(input, targetRtf, ["TARGET_NEAR_MAXIMAL_NOT_SUGGESTED"]);
  }
  // §9.4 — the TARGET ceiling (15) is higher than the SOURCE ceiling (12)
  // because a high-RTF target divides by a multiplier Epley makes too large,
  // so it errs LIGHT — the conservative direction, the opposite sign of a
  // high-RTF source. Above 15 the target leaves the formula's usable domain.
  if (targetRtf > TARGET_RTF_MAX) {
    return refuse(input, targetRtf, ["TARGET_OUTSIDE_FORMULA_DOMAIN"]);
  }

  const codes: StrengthReasonCode[] = [];
  if (targetRtf > TARGET_RTF_CORE_MAX) codes.push("EXTENDED_TARGET_EFFORT");

  // §9.5 — divide the (already rounded) estimate by the target multiplier;
  // the grid rounding is always the last step.
  //
  // `rawLoadKg` on the DTO stays the PRE-CAP translation, because §12 names it
  // exactly that ("the pre-cap translated value `rawLoadKg` is strictly
  // decreasing in `targetRTF`") and A-9's plateau fixture prints it that way.
  // The cap below reassigns the working value, as §9.5's step sequence does.
  const rawLoadKg = round2(estimate.currentE1rmKg / repMultiplier(targetRtf));
  let raw = rawLoadKg;

  // §9.5 step 4 — the global cap, at `UPWARD_LOAD_CAP_FACTOR` (1.10, one noise
  // unit) times the heaviest admitted group load in the window. Compared
  // UNROUNDED, for the same reason as the plausibility ceiling (R-1) and the
  // two thresholds of review F-1: §9.5 defines no rounding here, and rounding
  // a ceiling before comparing it can only ever admit something the rule
  // excludes.
  if (windowMaxAdmittedLoadKg !== null && windowMaxAdmittedLoadKg > 0) {
    const cap = windowMaxAdmittedLoadKg * UPWARD_LOAD_CAP_FACTOR;
    if (raw > cap) {
      raw = round2(cap);
      codes.push("CAPPED_AT_RECENT_MAX_LOAD");
    }
  }

  // §9.5 step 5 — the finite guard, before anything reaches a DTO (RL-11).
  if (!Number.isFinite(raw) || raw <= 0) {
    return refuse(input, targetRtf, ["BELOW_MINIMUM_LOAD"]);
  }

  // §9.5 step 6 — FLOOR to `loadStepKg`, never nearest. On light machine work
  // the floor can remove up to 25 % at the 5 kg default step; that cost is
  // accepted (X-12 rejected capping it) because a too-light number costs a
  // session and the raw value stays visible in the band.
  const loadKg = floorToStepKg(raw, loadStepKg);
  if (!Number.isFinite(loadKg) || loadKg <= 0) {
    return refuse(input, targetRtf, ["BELOW_MINIMUM_LOAD"]);
  }
  if (loadKg !== raw) codes.push("ROUNDED_DOWN_TO_LOAD_STEP");

  // §9.5 step 8 — the band brackets the translation as the cap left it, not
  // the emitted (floored) load, and is required copy rather than optional. On
  // a coarse grid the emitted load can therefore sit exactly on the band's
  // lower edge (`loadStepKg = 5`, raw 24 -> "≈ 20 kg (likely 20–30)"); §15.3
  // forbids re-centring the band on the shown load to tidy that up.
  const bandKg: [number, number] = [
    floorToStepKg(raw * (1 - NOISE_SD_PCT / 100), loadStepKg),
    ceilToStepKg(raw * (1 + NOISE_SD_PCT / 100), loadStepKg),
  ];

  return {
    status: "ok",
    targetReps: input.reps,
    targetRir: input.rir,
    targetRtf,
    loadKg,
    rawLoadKg,
    bandKg,
    reasonCodes: codes,
  };
}
