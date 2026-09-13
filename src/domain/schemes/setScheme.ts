import { z } from "zod";
import { rirBandSchema, type RirBand } from "./rirBand";

// prescription-model.md §2 — MVP SetScheme variants, plus the athletic
// measurement profiles evaluation §9.1's two additive variants
// (distanceRounds/durationRounds), plus Set Groups Stage A's additive
// `groups` variant (set-groups-architecture-evaluation.md §4.2, revision 3,
// owner addendum §19 D-1). `perSet` and `fixedPlusAmrap` stay reserved,
// unimplemented and unsuperseded (§4.1/§16 item 1 — `groups` and `perSet`
// are complements: `groups` covers ordered runs of like sets with a range,
// `perSet` stays reserved for genuinely per-set variation).
export const SCHEME_TYPES = [
  "fixed",
  "repRange",
  "distanceRounds",
  "durationRounds",
  "groups",
] as const;
export type SchemeType = (typeof SCHEME_TYPES)[number];

const SETS_MIN = 1;
// Exported so callers that must produce a PrescriptionSnapshot-valid scheme
// outside this file (applyWeekModifiers.ts's setMultiplier clamp) share the
// exact same ceiling instead of duplicating the literal.
export const SETS_MAX = 20;
const REPS_MIN = 1;
const REPS_MAX = 100;
const REP_RANGE_MAX_SPAN = 30;

// §4.2/§13.4 R-13 — 1..4 ordered groups per slot; a label is display-only
// (1-24 chars, trimmed); a group's own baseline mirrors the slot-level
// baselineLoadKg bound (prescriptions/schema.ts's MAX_BASELINE_LOAD_KG) —
// duplicated as a literal here rather than imported, because
// domain/prescriptions/schema.ts already imports FROM this file
// (setSchemeEnvelopeSchema) and importing back would cycle.
export const GROUPS_MAX = 4;
const GROUP_LABEL_MAX = 24;
const GROUP_BASELINE_LOAD_KG_MAX = 1000;

// §4.2 — the group's stable identity: "generated once at authoring (short
// token), never derived from position or label, preserved across
// edits/reorders; unique within the scheme". The shape only bounds length —
// generation is the server's job (server/prescriptions/service.ts).
const setGroupKeySchema = z.string().min(1).max(40);

const setGroupRangeSchema = z
  .object({ min: z.number().int(), max: z.number().int() })
  .refine((r) => r.min <= r.max, { message: "min must be <= max", path: ["max"] });

// Stage B — `ref` is always a real, already-assigned group key on the stored/
// frozen shape (never an authoring-time index; see `groupLinkAuthoringSchema`
// below for that). Percent is integer 10-100, user-entered, no default (§19
// D-4, §6.2).
const groupLinkSchema = z.object({
  ref: setGroupKeySchema,
  percent: z.number().int().min(10).max(100),
});
export type GroupLink = z.infer<typeof groupLinkSchema>;

const setGroupSchema = z.object({
  key: setGroupKeySchema,
  label: z.string().trim().min(1).max(GROUP_LABEL_MAX),
  sets: setGroupRangeSchema
    .refine((r) => r.min >= SETS_MIN, { message: `min must be >= ${SETS_MIN}`, path: ["min"] })
    .refine((r) => r.max <= SETS_MAX, { message: `max must be <= ${SETS_MAX}`, path: ["max"] }),
  reps: setGroupRangeSchema
    .refine((r) => r.min >= REPS_MIN, { message: `min must be >= ${REPS_MIN}`, path: ["min"] })
    .refine((r) => r.max <= REPS_MAX, { message: `max must be <= ${REPS_MAX}`, path: ["max"] })
    .refine((r) => r.max - r.min <= REP_RANGE_MAX_SPAN, {
      message: `rep range span must be <= ${REP_RANGE_MAX_SPAN}`,
      path: ["max"],
    }),
  // §4.2 — overrides the slot band/baseline for this group; absent means the
  // slot-level value applies (prescriptions carry those separately, not on
  // the scheme itself).
  targetRir: rirBandSchema.optional(),
  baselineLoadKg: z.number().min(0).max(GROUP_BASELINE_LOAD_KG_MAX).multipleOf(0.25).optional(),
  // Stage B (set-groups-architecture-evaluation.md §6.5/§19 D-4/D-5) — a flat,
  // additive field alongside `baselineLoadKg`, deliberately NOT the nested
  // `load.mode` union §6.5 sketched (see stage-b-implementation.md §1: Stage A
  // never adopted that union for `baselineLoadKg` either, and introducing it
  // now for `link` alone would mean two different shapes for "how this
  // group's load is determined"). Absent means "independent group", Stage A's
  // unchanged behaviour. V1 is performed-basis only (§19 D-4 narrows the
  // reviewed two-basis proposal) — no `basis` field exists because there is
  // only ever one value it could hold. Cross-group invariants (one hop, no
  // chains/cycles, no forward/self reference) are validated by this schema's
  // own top-level `superRefine` below, ADR-008's one fenced exception to "no
  // references between fields".
  link: groupLinkSchema.optional(),
});
export type SetGroup = z.infer<typeof setGroupSchema>;

// §4.2 — no top-level `sets` field, deliberately: `applySetMultiplier`
// (applyWeekModifiers.ts) reads `scheme.sets` directly for every other
// variant, so a `groups` member without one is a compile error there — the
// desired failure mode that forces every `scheme.sets` reader to switch
// exhaustively instead of silently mis-handling a fifth variant.
const groupsSchemeShape = z.object({
  type: z.literal("groups"),
  groups: z.array(setGroupSchema).min(1).max(GROUPS_MAX),
});

const fixedSchemeSchema = z.object({
  type: z.literal("fixed"),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX),
  reps: z.number().int().min(REPS_MIN).max(REPS_MAX),
});

const repRangeSchemeShape = z.object({
  type: z.literal("repRange"),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX),
  minReps: z.number().int().min(REPS_MIN).max(REPS_MAX),
  maxReps: z.number().int().min(REPS_MIN).max(REPS_MAX),
});

// §9.1 — distance/duration-basis exercises round-count instead of counting
// reps. 99999.99 m / 86400 s (24h) are the column ceilings (§8), not
// meaningful training values — the point is the numeric(*, 2) column can
// hold whatever's validated here.
const distanceRoundsSchemeSchema = z.object({
  type: z.literal("distanceRounds"),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX),
  distanceM: z.number().gt(0).max(99999.99).multipleOf(0.01),
});

const durationRoundsSchemeSchema = z.object({
  type: z.literal("durationRounds"),
  sets: z.number().int().min(SETS_MIN).max(SETS_MAX),
  durationS: z.number().gt(0).max(86400).multipleOf(0.01),
});

// prescription-model.md §6 — repRange additionally requires minReps <=
// maxReps and a span sanity cap. Applied via superRefine (not per-member
// .refine()) so the union stays a plain z.discriminatedUnion.
export const setSchemeSchema = z
  .discriminatedUnion("type", [
    fixedSchemeSchema,
    repRangeSchemeShape,
    distanceRoundsSchemeSchema,
    durationRoundsSchemeSchema,
    groupsSchemeShape,
  ])
  .superRefine((data, ctx) => {
    if (data.type === "repRange") {
      if (data.maxReps < data.minReps) {
        ctx.addIssue({ code: "custom", message: "maxReps must be >= minReps", path: ["maxReps"] });
        return;
      }
      if (data.maxReps - data.minReps > REP_RANGE_MAX_SPAN) {
        ctx.addIssue({
          code: "custom",
          message: `rep range span must be <= ${REP_RANGE_MAX_SPAN}`,
          path: ["maxReps"],
        });
      }
      return;
    }
    if (data.type !== "groups") return;
    // §4.2 invariants — unique keys, ordered array is the order, total `max`
    // sets <= SETS_MAX so a snapshot stays PrescriptionSnapshot-valid under
    // any setMultiplier.
    const seen = new Set<string>();
    data.groups.forEach((g, i) => {
      if (seen.has(g.key)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate group key "${g.key}"`,
          path: ["groups", i, "key"],
        });
      }
      seen.add(g.key);
    });
    const totalMax = data.groups.reduce((sum, g) => sum + g.sets.max, 0);
    if (totalMax > SETS_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `sum of group set-count maximums must be <= ${SETS_MAX}`,
        path: ["groups"],
      });
    }
    // Stage B — ADR-008's one fenced back-reference: `ref` must name an
    // EARLIER group (by array/slot order) that is itself unlinked (no
    // chains). Checked by array index, not by any stored "position" field —
    // the array order IS the slot order (§6.5).
    data.groups.forEach((g, i) => {
      if (!g.link) return;
      const refIndex = data.groups.findIndex((other) => other.key === g.link!.ref);
      if (refIndex === -1) {
        ctx.addIssue({
          code: "custom",
          message: `link references unknown group key "${g.link!.ref}"`,
          path: ["groups", i, "link", "ref"],
        });
        return;
      }
      if (refIndex >= i) {
        ctx.addIssue({
          code: "custom",
          message: "link must reference an earlier group in the same slot",
          path: ["groups", i, "link", "ref"],
        });
        return;
      }
      if (data.groups[refIndex]!.link) {
        ctx.addIssue({
          code: "custom",
          message: "link must reference an unlinked group (no chained links)",
          path: ["groups", i, "link", "ref"],
        });
      }
    });
  });

export type SetScheme = z.infer<typeof setSchemeSchema>;

// prescription-model.md §1/§2 — every persisted scheme is wrapped with its
// schema version. Version bumps only on breaking shape changes.
export const SCHEME_ENVELOPE_VERSION = 1;

export const setSchemeEnvelopeSchema = z.object({
  v: z.literal(SCHEME_ENVELOPE_VERSION),
  scheme: setSchemeSchema,
});

export type SetSchemeEnvelope = z.infer<typeof setSchemeEnvelopeSchema>;

export function wrapScheme(scheme: SetScheme): SetSchemeEnvelope {
  return { v: SCHEME_ENVELOPE_VERSION, scheme };
}

function formatRange(range: { min: number; max: number }): string {
  return range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
}

// A-2/M-6 — "Top 1 × 2 @ RIR 2 · Back-off 2–3 × 6–8 @ RIR 2–3" (evaluation
// §11.2's own worked example). `effectiveTargetRir` is the group's OWN
// override if it has one, else the slot's band, else `null` (rendering no
// RIR clause at all) — resolved by the caller (`formatScheme` below), never
// re-derived here.
function formatGroup(group: SetGroup, effectiveTargetRir: RirBand | null): string {
  const base = `${group.label} ${formatRange(group.sets)} × ${formatRange(group.reps)}`;
  return effectiveTargetRir ? `${base} @ RIR ${formatRange(effectiveTargetRir)}` : base;
}

// prescription-model.md §2 — "renders '5 × 5'" / "renders '3 × 8–12'".
// §9.1 — renders "4 × 20 m" / "3 × 60 s" for the two athletic variants.
// set-groups-architecture-evaluation.md §4.2/A-2 — "Top 1 × 2 · Back-off
// 2–3 × 6–8" for the additive `groups` variant. A switch (not an if/else) so
// a sixth variant fails to compile here instead of silently falling through
// to the wrong branch.
//
// M-6 (independent review) — `slotTargetRir` is used ONLY by the `groups`
// case, to resolve each group's OWN effective RIR band (`group.targetRir ??
// slotTargetRir`) and render it inline, per group — never a single slot-level
// band appended after the whole joined line, which is wrong for every group
// whose own band (or the slot's) differs from another's. The other four
// scheme types are completely unaffected by this parameter (every existing
// caller of `formatScheme(scheme)` with one argument keeps compiling and
// keeps producing byte-identical output — RIR for those types is, as before,
// the CALLER's own job to append).
export function formatScheme(scheme: SetScheme, slotTargetRir?: RirBand | null): string {
  switch (scheme.type) {
    case "fixed":
      return `${scheme.sets} × ${scheme.reps}`;
    case "repRange":
      return `${scheme.sets} × ${scheme.minReps}–${scheme.maxReps}`;
    case "distanceRounds":
      return `${scheme.sets} × ${scheme.distanceM} m`;
    case "durationRounds":
      return `${scheme.sets} × ${scheme.durationS} s`;
    case "groups":
      return scheme.groups
        .map((g) => formatGroup(g, g.targetRir ?? slotTargetRir ?? null))
        .join(" · ");
  }
}

export type GroupsScheme = Extract<SetScheme, { type: "groups" }>;

export function isGroupsScheme(scheme: SetScheme): scheme is GroupsScheme {
  return scheme.type === "groups";
}

// §5.4 — each group projects to a scheme the existing strategies already
// understand: fixed reps -> `fixed`; a rep range -> `repRange`; `sets =
// min` (the evaluation window is applied separately, at the work-set-array
// level — see evaluateSession.ts). Exported so both the engine
// (evaluateSession.ts) and config resolution (progression/registry.ts) share
// one projection.
export function projectGroup(group: SetGroup): SetScheme {
  return group.reps.min === group.reps.max
    ? { type: "fixed", sets: group.sets.min, reps: group.reps.min }
    : { type: "repRange", sets: group.sets.min, minReps: group.reps.min, maxReps: group.reps.max };
}

// --- Authoring input (server/prescriptions/service.ts manifest item 18) ---
//
// §4.2 — "the key is generated and not the label... generation is the
// server's job", so the shape a client SUBMITS when creating/updating a
// prescription allows a brand-new group to omit its key entirely (the
// server assigns one); every OTHER field is identical to the stored shape.
// A retained group always echoes its existing key back, which is what keeps
// keys "generated once at authoring... preserved across edits/reorders".
// Stage B — the authoring-only alternative to `groupLinkSchema`: exactly one
// of `ref` (an existing group's real, already-assigned key — survives
// reorder) or `refIndex` (a brand-new group with no key yet, addressed by its
// POSITIONAL INDEX in this same submitted `groups` array, mirroring
// `groupOverridesByIndex`'s established pattern in
// domain/prescriptions/schema.ts) must be set. `assignGroupKeys` below
// resolves `refIndex` onto that position's final, server-assigned key once
// every group in the array has one — this is what makes "create a reference
// group and a group linked to it in the same save" possible at all.
const groupLinkAuthoringSchema = z
  .object({
    ref: setGroupKeySchema.optional(),
    refIndex: z.number().int().min(0).optional(),
    percent: z.number().int().min(10).max(100),
  })
  .refine((l) => (l.ref === undefined) !== (l.refIndex === undefined), {
    message: "link must set exactly one of ref or refIndex",
    path: ["ref"],
  });
export type GroupLinkAuthoringInput = z.infer<typeof groupLinkAuthoringSchema>;

const setGroupAuthoringSchema = setGroupSchema.extend({
  key: setGroupKeySchema.optional(),
  link: groupLinkAuthoringSchema.optional(),
});

const groupsSchemeAuthoringShape = z.object({
  type: z.literal("groups"),
  groups: z.array(setGroupAuthoringSchema).min(1).max(GROUPS_MAX),
});

// Same discriminated union as `setSchemeSchema`, with only the `groups`
// member's key requirement relaxed — every other member and every other
// invariant (rep-range span, Σ max <= SETS_MAX) is identical, restated here
// because a `z.discriminatedUnion` cannot mix a relaxed and a strict member
// for the same `type` literal.
export const setSchemeAuthoringSchema = z
  .discriminatedUnion("type", [
    fixedSchemeSchema,
    repRangeSchemeShape,
    distanceRoundsSchemeSchema,
    durationRoundsSchemeSchema,
    groupsSchemeAuthoringShape,
  ])
  .superRefine((data, ctx) => {
    if (data.type === "repRange") {
      if (data.maxReps < data.minReps) {
        ctx.addIssue({ code: "custom", message: "maxReps must be >= minReps", path: ["maxReps"] });
        return;
      }
      if (data.maxReps - data.minReps > REP_RANGE_MAX_SPAN) {
        ctx.addIssue({
          code: "custom",
          message: `rep range span must be <= ${REP_RANGE_MAX_SPAN}`,
          path: ["maxReps"],
        });
      }
      return;
    }
    if (data.type !== "groups") return;
    const seen = new Set<string>();
    data.groups.forEach((g, i) => {
      if (g.key === undefined) return; // a brand-new group — nothing to collide with yet
      if (seen.has(g.key)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate group key "${g.key}"`,
          path: ["groups", i, "key"],
        });
      }
      seen.add(g.key);
    });
    const totalMax = data.groups.reduce((sum, g) => sum + g.sets.max, 0);
    if (totalMax > SETS_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `sum of group set-count maximums must be <= ${SETS_MAX}`,
        path: ["groups"],
      });
    }
    // Stage B — same invariant as `setSchemeSchema`'s superRefine, resolving
    // a `refIndex` directly and a `ref` by matching another entry's ALREADY-
    // ASSIGNED key (a brand-new group has none yet, so `ref` can never
    // legitimately point at one — only `refIndex` can).
    data.groups.forEach((g, i) => {
      if (!g.link) return;
      const targetIndex =
        g.link.refIndex !== undefined
          ? g.link.refIndex
          : data.groups.findIndex((other) => other.key !== undefined && other.key === g.link!.ref);
      if (targetIndex < 0 || targetIndex >= data.groups.length) {
        ctx.addIssue({
          code: "custom",
          message: "link references an unknown group",
          path: ["groups", i, "link"],
        });
        return;
      }
      if (targetIndex >= i) {
        ctx.addIssue({
          code: "custom",
          message: "link must reference an earlier group in the same slot",
          path: ["groups", i, "link"],
        });
        return;
      }
      if (data.groups[targetIndex]!.link) {
        ctx.addIssue({
          code: "custom",
          message: "link must reference an unlinked group (no chained links)",
          path: ["groups", i, "link"],
        });
      }
    });
  });

export type SetSchemeAuthoringInput = z.infer<typeof setSchemeAuthoringSchema>;

export const setSchemeAuthoringEnvelopeSchema = z.object({
  v: z.literal(SCHEME_ENVELOPE_VERSION),
  scheme: setSchemeAuthoringSchema,
});
export type SetSchemeAuthoringEnvelope = z.infer<typeof setSchemeAuthoringEnvelopeSchema>;

// R-14 — "keys are generated tokens... a future template copy regenerates
// keys." Short, URL-safe, collision-improbable within one scheme (at most 4
// groups) — matching the informal "short token" the design calls for, not
// cryptographic identity. Injectable generator for deterministic unit tests.
function defaultGroupKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Fills in a server-generated key for every group that omitted one; groups
// that already carry a key (retained across an edit) are returned
// byte-identical apart from that key. Pure apart from the injected
// generator, so key assignment is unit-testable without a database.
//
// Stage B — a second pass, over the now-fully-keyed array, resolves each
// group's `link.refIndex` (or `link.ref`, for a retained group whose
// reference already had a real key) onto the FINAL key at that array
// position, and strips the authoring-only `refIndex` field. The authoring
// schema's own `superRefine` already guarantees every `refIndex` is in range
// and points at an earlier position before this ever runs (both
// `createPrescriptionSchema`/`updatePrescriptionSchema` are `.safeParse`d at
// the API route layer before either service function reaches this call), so
// the resolution here is a plain, non-defensive lookup.
export function assignGroupKeys(
  scheme: SetSchemeAuthoringInput,
  newKey: () => string = defaultGroupKey,
): SetScheme {
  if (scheme.type !== "groups") return scheme;
  const keyed = scheme.groups.map((g) => ({ ...g, key: g.key ?? newKey() }));
  return {
    ...scheme,
    groups: keyed.map(({ link, ...rest }) => {
      if (!link) return rest;
      const ref = link.ref ?? keyed[link.refIndex!]!.key;
      return { ...rest, link: { ref, percent: link.percent } };
    }),
  };
}
