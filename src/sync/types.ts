import type { PrescriptionSnapshot } from "@/domain/schemas/prescriptionSnapshot";
import type { SetScheme } from "@/domain/schemes/setScheme";
import type { RirBand } from "@/domain/schemes/rirBand";
import type { ResolvedProgression } from "@/domain/progression/registry";
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
}
