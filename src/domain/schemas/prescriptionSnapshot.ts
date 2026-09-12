import { z } from "zod";
import { setSchemeSchema } from "../schemes/setScheme";
import { rirBandSchema } from "../schemes/rirBand";
import { strategyIdSchema, type StrategyId } from "../progression/registry";
import { weekModifiersSchema } from "../blocks/schema";
import { LOAD_BASES, MEASUREMENT_PROFILES } from "../measurement/profile";

// measurement-profiles-architecture-evaluation.md §9.4/§5.3 — `profile.ts`
// is deliberately zero-import/framework-agnostic (I-10) and exports no Zod
// schemas of its own, so the snapshot's Zod schema is built here from its
// plain-TS vocabulary tuples rather than duplicating the enum values as
// string literals.
const measurementProfileSchema = z.enum(MEASUREMENT_PROFILES);
const loadBasisSchema = z.enum(LOAD_BASES);

// domain-model.md §6 — PrescriptionSnapshot, frozen into
// `session_exercises.prescription` exactly once at session start
// (ADR-007 snapshot-on-use). Versioned per ADR-007's "snapshot JSONB shapes
// need versioned Zod schemas with upgrade functions" — bump
// PRESCRIPTION_SNAPSHOT_VERSION and add an upgrade path if the shape ever
// changes; existing rows are never rewritten.
export const PRESCRIPTION_SNAPSHOT_VERSION = 1;

const prefillSchema = z.object({
  loadKg: z.number().min(0).nullable(),
  reps: z.number().int().min(1).nullable(),
});
export type Prefill = z.infer<typeof prefillSchema>;

const snapshotProgressionSchema = z.object({
  strategyId: strategyIdSchema,
  strategyVersion: z.number().int().positive(),
  config: z.record(z.string(), z.unknown()),
  classification: z.enum(["heuristic", "user_defined"]),
});

export const prescriptionSnapshotDataSchema = z.object({
  exerciseId: z.string().uuid(),
  exerciseName: z.string(),
  scheme: setSchemeSchema,
  targetRir: rirBandSchema.nullable(),
  restSeconds: z.number().int().positive().nullable(),
  progression: snapshotProgressionSchema,
  // implementation-plan.md Phase 5 — the resolved deload/WeekOverride
  // modifiers (if any) already baked into `scheme`/`targetRir`/`prefill`
  // above, carried alongside so history stays self-explaining
  // (prescription-model.md §5). Null when no modifiers applied.
  appliedModifiers: weekModifiersSchema.nullable(),
  prefill: prefillSchema,
  // §9.4 — additive, optional: a v1 snapshot written before this release has
  // no `measurement` key and must still parse (A-7). §10.1 — this is the
  // slot's frozen profile/basis; `loadBasis` here carries no authority (only
  // `session_exercises.load_basis` does) and is not consulted by
  // `evaluateSession`, which reads only `.profile`.
  measurement: z
    .object({
      profile: measurementProfileSchema,
      loadBasis: loadBasisSchema.nullable(),
    })
    .optional(),
  // workout-prescription-context-architecture-evaluation.md §3.3/§7 — the
  // program's own `exercise_prescriptions.notes` for this slot, frozen here
  // at session start and read-only for the rest of the workout. Named
  // `prescriptionNotes`, not `notes`, because the card renders it one
  // dereference away from `session_exercises.notes` (the editable session
  // note) — a `string | null` collision no type checker would catch (§4).
  //
  // Additive and OPTIONAL, exactly like `measurement` above: a v1 snapshot
  // written before this release has no such key and must still parse
  // unchanged, so `v` stays 1 and no upgrader exists (ADR-008). Absent means
  // "this session never froze a note" and must never be reconstructed from
  // the current program definition (§7 C-1).
  //
  // Declaring it here is load-bearing, not cosmetic (§2 R-B): the snapshot
  // travels to the server inside `sessionExerciseUpsertPayloadSchema`'s
  // `prescription` field, and `buildSessionExerciseUpsertPayload` `.parse()`s
  // that payload — Zod 3's `z.object` STRIPS undeclared keys silently, so a
  // note absent from this schema would live on in the local IndexedDB
  // aggregate (never parsed) while vanishing from the wire, with no error
  // anywhere. tests/unit/activeSessionPayloads.test.ts pins that.
  //
  // No `.trim()`: a transform here would rewrite historical values on read.
  // The write path already trims (`domain/prescriptions/schema.ts`).
  prescriptionNotes: z.string().max(2000).nullable().optional(),
});
export type PrescriptionSnapshotData = z.infer<typeof prescriptionSnapshotDataSchema>;

export const prescriptionSnapshotSchema = z.object({
  v: z.literal(PRESCRIPTION_SNAPSHOT_VERSION),
  snapshot: prescriptionSnapshotDataSchema,
});
export type PrescriptionSnapshot = z.infer<typeof prescriptionSnapshotSchema>;

export function wrapPrescriptionSnapshot(snapshot: PrescriptionSnapshotData): PrescriptionSnapshot {
  return { v: PRESCRIPTION_SNAPSHOT_VERSION, snapshot };
}

// progression-engine.md §2 — every strategy carries a `version` that "bumps
// on ANY behavior change." Phase 4 hasn't implemented `evaluate()` for any
// strategy yet (progression-engine.md is Phase 4 scope), so every shipped
// strategy is still at its first version; bump the relevant entry here the
// day a strategy's evaluate() behavior first changes.
export const STRATEGY_VERSIONS: Record<StrategyId, number> = {
  "load-progression": 1,
  "rep-progression": 1,
  manual: 1,
};
