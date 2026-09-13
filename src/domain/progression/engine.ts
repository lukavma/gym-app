import type { SetScheme } from "../schemes/setScheme";
import type { RirBand } from "../schemes/rirBand";
import type { ReasonCode } from "./reasonCodes";

// progression-engine.md §2 — the pure evaluation contract. Everything here
// is data-in/data-out: no Date.now(), no randomness, no IO. Same inputs +
// same strategy version ⇒ same output, byte for byte (§9 case 13).

export type RecommendationAction =
  "increase_load" | "decrease_load" | "hold" | "increase_reps" | "none";

export type Confidence = "low" | "medium" | "high";

export interface RecommendationTarget {
  loadKg?: number;
  reps?: number;
}

export interface PerformedSet {
  weightKg: number;
  reps: number;
  rir: number | null;
  // set-groups-architecture-evaluation.md §4.4 — the group this set is
  // attributed to on a grouped slot; `null`/absent on an ungrouped slot, and
  // also `null` for an unattributed work set inside a grouped session (rule
  // 3 — excluded from every group's evaluation, still counted elsewhere).
  groupKey?: string | null;
}

// progression-engine.md §2 Inputs — one historical (or current) performance
// of an exercise. `workSets` excludes warmups (filtered upstream by the
// context assembler) and is ordered by set number.
export interface PerformedExercise {
  sessionId: string;
  performedAt: string; // ISO — data, not a clock
  isDeload: boolean;
  prescribed: { scheme: SetScheme; targetRir?: RirBand } | null;
  workSets: PerformedSet[];
}

export interface EvaluationBlockContext {
  weekIndex?: number;
  isDeload: boolean;
  goal?: "hypertrophy" | "strength" | "general";
}

// The slice of the PrescriptionSnapshot the strategies actually consume —
// structurally satisfied by PrescriptionSnapshotData ("as executed THIS
// session, post-modifiers"). `prefill.reps` is the session's executed rep
// target (rep-progression's `currentTarget` source).
export interface EvaluationPrescription {
  scheme: SetScheme;
  targetRir: RirBand | null;
  prefill: { loadKg: number | null; reps: number | null };
}

export interface EvaluationContext {
  prescription: EvaluationPrescription;
  performance: PerformedExercise;
  // Same exercise, completed non-discarded sessions strictly before the
  // evaluated one, most recent first, capped (default 5), deloads flagged.
  history: PerformedExercise[];
  block: EvaluationBlockContext | null;
  exercise: { id: string; loadStepKg: number };
  // RESERVED — always undefined in MVP (EVIDENCE-027: no evidence basis to
  // program from sleep/readiness). The slot exists so future strategies can
  // consume it without an interface change.
  recovery?: undefined;
}

// set-groups-architecture-evaluation.md §5.4 — "required whenever the
// record is per-group (absent means 'ungrouped slot')".
export interface InputsSummaryGroup {
  key: string;
  label: string;
  setsMin: number;
  setsMax: number;
}

// progression-engine.md §6 — the frozen facts a persisted recommendation
// carries forever. `derived.mixedLoads` is additive to the §6 interface,
// mandated by §8's "Mixed loads within work sets → modal load used; flagged
// in inputs; confidence medium". `prescribed.group` and `extraWorkSets` are
// set-groups-architecture-evaluation.md §5.4/§5.5's additive keys, omitted
// entirely (never `undefined`, never `[]`) on every ungrouped record — see
// `inputsSummarySchema`'s comment for the binding emission rule (rev. 3,
// V-1).
export interface InputsSummary {
  prescribed: { scheme: SetScheme; targetRir?: RirBand; group?: InputsSummaryGroup };
  // §5.5 — the evaluation WINDOW (the first `sets.min` recorded sets, in
  // set-number order) for a per-group record; the whole recorded set list
  // for an ungrouped record (unchanged meaning).
  workSets: PerformedSet[];
  // §5.5 — recorded sets after the window; present (possibly `[]`) on every
  // per-group record, omitted entirely on every ungrouped one.
  extraWorkSets?: PerformedSet[];
  derived: {
    setsCompleted: number;
    prescribedSets: number;
    finalSetRir: number | null;
    workingLoadKg: number;
    currentRepTarget?: number;
    mixedLoads?: boolean;
  };
  historyDepthUsed: number;
}

export interface RecommendationDraft {
  action: RecommendationAction;
  target?: RecommendationTarget;
  reasonCodes: ReasonCode[]; // ordered, primary first — the explanation IS these codes
  inputs: InputsSummary;
  confidence: Confidence;
}

// progression-engine.md §3 — every RIR comparison goes through this one
// helper; strategies MUST branch on 'unknown' explicitly.
export type RirCheck = "met" | "below" | "above" | "unknown";

export function checkRir(reported: number | null, gate: RirBand): RirCheck {
  if (reported === null) return "unknown";
  if (reported < gate.min) return "below";
  if (reported > gate.max) return "above";
  return "met";
}
