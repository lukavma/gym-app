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

// Mirrors src/server/today/service.ts's response shapes by contract — the
// `sync` element cannot import `server` (eslint.config.mjs boundaries: only
// `domain`/`sync` are reachable from here), so client DTOs are declared
// locally, the same convention already used by src/ui/*/types.ts.

export interface HistorySetSummaryDto {
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number | null;
  isWarmup: boolean;
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
  // pwa-offline-strategy.md §4 splits what the single `history` array used
  // to serve into two roles: `previousPerformance` (last 3 non-deload
  // sessions, for display) and `history` (last 5, for the future
  // recommendation/progression engine's input window). Both share the same
  // per-session shape today; they're populated independently server-side
  // (see MEDIUM-5 in the Phase 3 review) so they can diverge later without
  // a DTO change.
  previousPerformance: HistorySessionSummaryDto[];
  history: HistorySessionSummaryDto[];
}

export interface ActiveSessionSetDto {
  id: string;
  setNumber: number;
  isWarmup: boolean;
  weightKg: number;
  reps: number;
  rir: number | null;
  loggedAt: string;
  notes: string | null;
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
  // decision is made (progression-engine.md §7). Null when none exists.
  recommendation: RecommendationDto | null;
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
