import type { PrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";
import type { SetScheme } from "@/domain/schemes/setScheme";
import type { RirBand } from "@/domain/schemes/rirBand";
import type { ResolvedProgression } from "@/domain/progression/registry";
import type { WeekModifiers } from "@/domain/blocks/schema";
import type {
  WarmupItemState,
  WarmupRoutineState,
  WarmupSessionState,
} from "@/domain/warmup/session";
import type {
  InputsSummary,
  RecommendationAction,
  RecommendationTarget,
} from "@/domain/progression/engine";
import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";

// Mirrors src/server/today/service.ts's response shapes by contract — the
// `sync` element cannot import `server` (eslint.config.mjs boundaries: only
// `domain`/`sync` are reachable from here), so client DTOs are declared
// locally, the same convention already used by src/ui/*/types.ts.

export interface HistorySetSummaryDto {
  setNumber: number;
  // Release 2 (athletic-measurement-profiles-architecture-evaluation.md
  // §21.2) — widened to number|null and to carry distanceM/durationS,
  // mirroring src/server/today/service.ts's HistorySetDto (§11.3 site #5's
  // "a null is never coerced" rule, generalised to this embedded-history
  // shape too). Every existing `load_reps` value stays a plain number; only
  // the new profiles ever produce a null here.
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
  isWarmup: boolean;
  // set-groups-architecture-evaluation.md §5.6 — needed by the offline
  // client's own per-group evaluation fallback. Optional here (unlike the
  // server's own mirror) so a bundle cached before this release, which has
  // no such key on its embedded history sets, still parses — every group's
  // history is then empty for an offline completion until the next
  // successful bundle fetch (self-healing, §5.3's stated degradation).
  groupKey?: string | null;
}

export interface HistorySessionSummaryDto {
  sessionId: string;
  startedAt: string;
  isDeload: boolean;
  // The session's own prescribed scheme/RIR band from its frozen snapshot —
  // what the offline fallback evaluation needs to build engine history
  // entries identical to the server's (progression-engine.md §2/§5).
  prescribed: { scheme: SetScheme; targetRir: RirBand | null } | null;
  sets: HistorySetSummaryDto[];
}

// Mirror of src/server/progression/service.ts's RecommendationDto (same
// contract-mirroring convention as the rest of this file).
export interface RecommendationDecisionDto {
  status: "pending" | "accepted" | "modified" | "rejected" | "superseded";
  chosen: RecommendationTarget | null;
  decidedAt: string | null;
  source: "explicit" | "implicit_first_set" | null;
}

export interface RecommendationDto {
  id: string;
  exerciseId: string;
  blockId: string | null;
  sourceSessionId: string;
  strategyId: string;
  strategyVersion: number;
  classification: "evidence_supported" | "heuristic" | "user_defined";
  action: RecommendationAction;
  target: RecommendationTarget | null;
  reasonCodes: string[];
  confidence: "low" | "medium" | "high";
  inputs: InputsSummary;
  computedBy: "server" | "client";
  createdAt: string;
  decision: RecommendationDecisionDto;
  // set-groups-architecture-evaluation.md §5.3 — the group this record
  // belongs to; `null` for an ungrouped slot. Optional here (unlike the
  // server's own mirror) so a bundle/session cached before this release
  // still parses; absent reads exactly like `null`.
  groupKey?: string | null;
}

export interface TodayBundleExerciseEntryDto {
  prescriptionId: string;
  exerciseId: string;
  exerciseName: string;
  scheme: SetScheme;
  targetRir: RirBand | null;
  restSeconds: number | null;
  progression: ResolvedProgression;
  baselineLoadKg: number | null;
  // pwa-offline-strategy.md §4 "exercises metadata (loadStepKg…)" — the
  // exercise's own load increment, threaded through unchanged from
  // `exercises.load_step_kg` so the UI can round/step prefills without a
  // second round trip.
  loadStepKg: number;
  prefill: { loadKg: number | null; reps: number | null };
  // implementation-plan.md Phase 5 — the resolved deload/WeekOverride
  // modifiers already baked into `scheme`/`targetRir`/`prefill` above. The
  // client never recomputes modifiers itself — it freezes exactly this
  // value into the session snapshot at start, online or from the cached
  // bundle offline (single authoritative resolution point, server-side).
  appliedModifiers: WeekModifiers | null;
  // pwa-offline-strategy.md §4 — the at-most-one pending recommendation for
  // this exercise in the active block. Shown as the proposed target with
  // accept/modify/reject; never folded into `prefill` (not a Decision yet).
  pendingRecommendation: RecommendationDto | null;
  // set-groups-architecture-evaluation.md §5.3 — one entry per group with a
  // pending recommendation, present only for a `groups` scheme. Optional
  // (unlike the server's own mirror) for the same pre-upgrade-cache
  // tolerance every additive bundle key on this interface already has.
  pendingRecommendations?: RecommendationDto[];
  // set-groups-architecture-evaluation.md §5.3 — one resolved prefill per
  // group key, present only for a `groups` scheme.
  groupPrefills?: Record<string, { loadKg: number | null; reps: number | null }>;
  // pwa-offline-strategy.md §4 splits what the single `history` array used
  // to serve into two roles: `previousPerformance` (last 3 non-deload
  // sessions, for display) and `history` (last 5, for the future
  // recommendation/progression engine's input window). Both share the same
  // per-session shape today; they're populated independently server-side
  // (see MEDIUM-5 in the Phase 3 review) so they can diverge later without
  // a DTO change.
  previousPerformance: HistorySessionSummaryDto[];
  history: HistorySessionSummaryDto[];
  // athletic-measurement-profiles-architecture-evaluation.md §12.1 — read
  // from the exercise row. Optional here for the same H-10 reason the
  // server's own mirror (src/server/today/service.ts's
  // TodayBundleExerciseEntry) types it optional: a bundle cached (SW or
  // IndexedDB `bundleCache`) before this feature shipped has no such key at
  // all, and must keep parsing identically. The server always populates it
  // on a live response; `startSession` (activeSession.ts) is what defaults
  // an absent value when freezing it into `ActiveSessionExerciseDto.measurement`.
  measurement?: { profile: MeasurementProfile; loadBasis: LoadBasis | null };
  // workout-prescription-context-architecture-evaluation.md §4/§7 C-2 — this
  // slot's program note (`exercise_prescriptions.notes`), frozen into the
  // session snapshot at `startSession` and shown read-only on the workout
  // card as "Program note:". OPTIONAL here while the server's own mirror
  // (src/server/today/service.ts's TodayBundleExerciseEntry) declares it
  // required, and that asymmetry is the point — the same mandatory tolerance
  // rule warm-up routines follow (warmup evaluation §8.1, R-1): both the
  // service worker's `today-bundle` cache and the IndexedDB `bundleCache`
  // keep serving pre-upgrade copies after deploy, which have no such key at
  // all, and the Phase 5 L-4 regression (a cached bundle lacking
  // `appliedModifiers` made offline start throw) is exactly what assuming
  // otherwise costs. Absent means "no note to show", never an error — and it
  // is never backfilled from the current program definition (C-1).
  prescriptionNotes?: string | null;
}

export interface ActiveSessionSetDto {
  id: string;
  setNumber: number;
  isWarmup: boolean;
  // Release 2 (athletic-measurement-profiles-architecture-evaluation.md
  // §21.2) — widened to number|null and to carry distanceM/durationS, the
  // client mirror of the server's ActiveSessionSetDto (src/server/today/
  // service.ts, itself mirroring HistorySetDto's §11.3 site #5 rule: a null
  // is never coerced to 0). A pre-upgrade cached aggregate has plain
  // numbers here and no distanceM/durationS keys at all;
  // normalizeActiveSession in src/sync/activeSession.ts (the bundleCache
  // "sanitise on read" precedent) fills the new keys with null on every
  // read, never touching the existing values.
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
  loggedAt: string;
  notes: string | null;
  // set-groups-architecture-evaluation.md §4.4 — the group this set is
  // attributed to on a grouped slot; `null`/absent on an ungrouped slot or
  // for an unattributed set. Optional so a pre-upgrade aggregate (no such
  // key at all) still parses; `normalizeActiveSession` fills it with `null`
  // on read, same precedent as `distanceM`/`durationS`.
  groupKey?: string | null;
}

export interface ActiveSessionExerciseDto {
  id: string;
  exerciseId: string;
  exerciseName: string;
  position: number;
  source: "template" | "adhoc";
  prescription: PrescriptionSnapshot | null;
  skipped: boolean;
  notes: string | null;
  // The exercise's load increment, carried from the bundle entry (or the
  // server's active-session DTO) so decision matching and steppers work
  // offline. Null only for ad-hoc exercises added without metadata.
  loadStepKg: number | null;
  // The recommendation being decided at this workout — copied from the
  // bundle's pendingRecommendation at session start, updated locally when a
  // decision is made (progression-engine.md §7). Null when none exists. For
  // a grouped slot this is the null-key (pre-conversion legacy) entry only,
  // if any — see `recommendations` below for the per-group ones.
  recommendation: RecommendationDto | null;
  // set-groups-architecture-evaluation.md §5.3 — one recommendation per
  // group with a pending/decided record this session, present only for a
  // `groups` scheme; updated locally the same way `recommendation` is.
  recommendations?: RecommendationDto[];
  // Release 2 (athletic-measurement-profiles-architecture-evaluation.md
  // §21.2, §12.1) — the slot's measurement profile/load basis, FROZEN once
  // at `startSession` from the bundle entry's own `measurement` (never
  // re-derived live from the current exercise row afterward, same
  // snapshot-on-use discipline as `prescription` — ADR-007). A pre-upgrade
  // cached aggregate has no such key; normalizeActiveSession defaults it to
  // `{ profile: "load_reps", loadBasis: "unspecified" }`
  // (DEFAULT_MEASUREMENT_PROFILE / DEFAULT_LOAD_BASIS_FOR_LOAD_PROFILE),
  // exactly what every pre-Release-2 row already was.
  measurement: { profile: MeasurementProfile; loadBasis: LoadBasis | null };
  sets: ActiveSessionSetDto[];
}

// Warm-up Routines v1 — client-only session state. NEVER mirrored into any
// sync payload, and there is no column, JSONB field or sync entity anywhere
// that could receive it (evaluation §6.1, I-1/I-2/I-5).
//
// It survives reload, iOS process kill and same-device resume purely because
// it rides inside the existing IndexedDB active-session aggregate, written
// through the same `commitSessionMutation` transaction as everything else —
// with `ops: []`, so nothing is ever enqueued for the wire. It ceases to
// exist when the aggregate is deleted at completion/discard (M-5), and a
// server-hydrated DTO (cross-device adopt) simply lacks it (O-3).
// Aliases, not re-declarations: the shape and every transition over it live
// in @/domain/warmup/session (pure, unit-testable without IndexedDB), and
// this layer only decides where it is stored. `routines` is frozen once at
// startSession from the bundle's linked routines, so a mid-session
// rename/delete/relink never mutates a running workout (snapshot-on-use in
// spirit, ADR-007 — but with no persistence obligation, because no
// historical fact is created). `selectedRoutineId` is null when the template
// has links but no default (the compact chooser); `done` is parallel to the
// selected routine's items and resets on every switch; `dismissed` is a
// per-session, reversible skip that is forgotten with the session.
export type ActiveSessionWarmupItemDto = WarmupItemState;
export type ActiveSessionWarmupRoutineDto = WarmupRoutineState;
export type ActiveSessionWarmupDto = WarmupSessionState;

export interface ActiveSessionDto {
  id: string;
  blockId: string | null;
  templateId: string | null;
  templateName: string | null;
  weekIndex: number | null;
  isDeload: boolean;
  status: "in_progress";
  startedAt: string;
  clientId: string | null;
  notes: string | null;
  exercises: ActiveSessionExerciseDto[];
  // Optional on purpose, in both directions: an aggregate written before
  // this feature shipped has no `warmup` (R-2), and a DTO hydrated from the
  // server never will (the server has nothing to put there). Absent means
  // "no card", never an error — and no IndexedDB DB_VERSION bump is needed,
  // since object stores are schemaless.
  warmup?: ActiveSessionWarmupDto | null;
}

// Phase 8 — mirrors src/ui/recovery/types.ts's RecoveryEntryDto by the same
// contract-mirroring convention noted at the top of this file (`sync` can't
// import `ui`, per eslint.config.mjs boundaries). Used only by
// src/sync/dailyLogs.ts's dailyLogCache read/write, not by the sync
// envelope itself (that's recoveryEntryUpsertPayloadSchema in
// @/domain/sync/schema).
export interface RecoveryEntrySnapshot {
  id: string;
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  readiness: number | null;
  soreness: number | null;
  note: string | null;
}

// Warm-up Routines v1 — mirrors the server's TodayWarmupRoutineDto.
export interface TodayWarmupRoutineItemDto {
  label: string;
  instruction: string | null;
}

export interface TodayWarmupRoutineDto {
  id: string;
  name: string;
  items: TodayWarmupRoutineItemDto[];
}

export type TodayResolutionDto =
  | {
      kind: "scheduled";
      blockId: string;
      templateId: string;
      templateName: string;
      weekIndex: number | null;
      isDeload: boolean;
      exercises: TodayBundleExerciseEntryDto[];
      // Warm-up Routines v1 — OPTIONAL here while the server type declares
      // them required, and that asymmetry is the point (evaluation §8.1's
      // mandatory tolerance rule, R-1). Both the service worker's
      // `today-bundle` cache and the IndexedDB `bundleCache` will keep
      // serving pre-upgrade copies after deploy, and the Phase 5 L-4
      // regression (a cached bundle lacking `appliedModifiers` made offline
      // start throw) is exactly what happens when a client assumes a new
      // bundle field exists. Typing them optional makes every read site
      // handle absence at compile time; absent means "no warm-up card", not
      // an error.
      warmupRoutines?: TodayWarmupRoutineDto[];
      defaultWarmupRoutineId?: string | null;
    }
  | { kind: "rest" }
  | { kind: "no_schedule" };

export interface TodayBundleDto {
  today: TodayResolutionDto;
  // Finding C — do NOT read this on the client. It is still served on a live
  // response (removing it from the API would change verified Phase 3
  // behaviour), but every cached representation of this bundle has it forced
  // to null, on both the SW side (src/app/sw.ts) and the IndexedDB side
  // (src/sync/bundleCache.ts), because a cached copy cannot know the session
  // has since been completed or discarded. Remote active-session state comes
  // from src/sync/remoteActiveSession.ts, which is never cached.
  activeSession: ActiveSessionDto | null;
  // ISO timestamp set server-side at bundle-assembly time (HIGH-5/MEDIUM-5
  // in the Phase 3 review) — the client compares this against "now" (or
  // against a `bundleCache` entry's own fetchedAt) to explicitly show
  // staleness rather than inferring it from a thrown fetch, since the SW's
  // NetworkFirst/3s strategy for `/api/today-bundle` can resolve 200 from
  // its own cache without the fetch ever throwing.
  generatedAt: string;
  // phase-8-review.md B-3 — the account's `users.timezone`, server-resolved.
  // See src/sync/accountTimezone.ts for how quick-logs consume it.
  timezone: string;
}
