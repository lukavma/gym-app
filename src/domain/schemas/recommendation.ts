import { z } from "zod";
import { setSchemeSchema } from "../schemes/setScheme";
import { rirBandSchema } from "../schemes/rirBand";
import { REASON_CODES } from "../progression/reasonCodes";

// progression-engine.md §6 — the persisted, self-describing Recommendation
// shapes, shared by the sync op contract (client-computed recs + decisions),
// the server's bundle serialization, and the client DTOs. A record must stay
// renderable and auditable years later without the strategy code existing —
// hence frozen config, inputs, and ordered reason codes.

export const RECOMMENDATION_ACTIONS = [
  "increase_load",
  "decrease_load",
  "hold",
  "increase_reps",
  "none",
] as const;
export type RecommendationActionValue = (typeof RECOMMENDATION_ACTIONS)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export const DECISION_STATUSES = [
  "pending",
  "accepted",
  "modified",
  "rejected",
  "superseded",
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const DECISION_SOURCES = ["explicit", "implicit_first_set"] as const;
export type DecisionSource = (typeof DECISION_SOURCES)[number];

export const reasonCodeSchema = z.enum(REASON_CODES);

export const recommendationTargetSchema = z
  .object({
    loadKg: z.number().min(0).max(9999.99).optional(),
    reps: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export type RecommendationTargetValue = z.infer<typeof recommendationTargetSchema>;

const performedSetSchema = z
  .object({
    weightKg: z.number().min(0),
    reps: z.number().int().min(1).max(100),
    rir: z.number().int().min(0).max(10).nullable(),
  })
  .strict();

// set-groups-architecture-evaluation.md §5.4 — "required whenever the record
// is per-group (absent means 'ungrouped slot')". `setsMin`/`setsMax` record
// where the evaluation window fell (§5.5), so a reviewer years later can see
// why the split is where it is without re-deriving it from the scheme.
const inputsGroupSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    setsMin: z.number().int().min(1),
    setsMax: z.number().int().min(1),
  })
  .strict();

// progression-engine.md §6 InputsSummary. `derived.mixedLoads` is additive
// (mandated by §8's "flagged in inputs"); `currentRepTarget` is present for
// rep-progression evaluations. `prescribed.group` and `extraWorkSets` are
// set-groups-architecture-evaluation.md §5.4/§5.5's additive keys — rev. 3
// V-1's binding emission rule: both are **omitted entirely — not
// `undefined`, not `[]`** — from every ungrouped record, so the
// client-computed `recommendation` op for an ungrouped slot stays
// byte-identical to today's (A-10/NC-9). The requirement is enforced at the
// builder level (evaluateSession.ts), not by a conditional Zod shape — this
// stays a plain strict object with two optional additions.
export const inputsSummarySchema = z
  .object({
    prescribed: z
      .object({
        scheme: setSchemeSchema,
        targetRir: rirBandSchema.optional(),
        group: inputsGroupSchema.optional(),
      })
      .strict(),
    workSets: z.array(performedSetSchema),
    extraWorkSets: z.array(performedSetSchema).optional(),
    derived: z
      .object({
        setsCompleted: z.number().int().min(0),
        prescribedSets: z.number().int().min(0),
        finalSetRir: z.number().int().min(0).max(10).nullable(),
        workingLoadKg: z.number().min(0),
        currentRepTarget: z.number().int().min(1).optional(),
        mixedLoads: z.boolean().optional(),
      })
      .strict(),
    historyDepthUsed: z.number().int().min(0),
  })
  .strict();
export type InputsSummaryValue = z.infer<typeof inputsSummarySchema>;

// Shipped strategy instances are never 'evidence_supported' (EVIDENCE-031 /
// boundaries B9) — the DB check allows the value for architecture-level
// completeness, but nothing writable may carry it.
export const recommendationClassificationSchema = z.enum(["heuristic", "user_defined"]);

export const recommendationDecisionSchema = z
  .object({
    status: z.enum(DECISION_STATUSES),
    chosen: recommendationTargetSchema.nullable(),
    decidedAt: z.string().datetime({ offset: true }).nullable(),
    source: z.enum(DECISION_SOURCES).nullable(),
  })
  .strict();
export type RecommendationDecisionValue = z.infer<typeof recommendationDecisionSchema>;
