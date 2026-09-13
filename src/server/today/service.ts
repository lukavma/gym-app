import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  blocks,
  blockScheduleEntries,
  blockWeekOverrides,
  exercisePrescriptions,
  exercises,
  programs,
  sessionExercises,
  setLogs,
  users,
  workoutSessions,
  workoutTemplates,
} from "@/db/schema";
import type { AppDb } from "@/db/client";
import { userLocalDateString } from "@/server/time/userLocalDate";
import { currentWeekIndex } from "@/domain/scheduling/weekIndex";
import { isoWeekday } from "@/domain/scheduling/isoWeekday";
import { resolveTodayTemplate } from "@/domain/scheduling/todayTemplate";
import { resolveEffectiveWeekModifiers } from "@/domain/scheduling/effectiveModifiers";
import {
  buildPrescriptionSnapshotData,
  type GroupSnapshotInputs,
} from "@/domain/prescriptions/buildSnapshot";
import { recommendationForDeload } from "@/domain/progression/deloadGuard";
import type { CarryForwardCandidate } from "@/domain/progression/carryForward";
import type { SetScheme, SetSchemeEnvelope } from "@/domain/schemes/setScheme";
import type { RirBand } from "@/domain/schemes/rirBand";
import type { ResolvedProgression } from "@/domain/progression/registry";
import type { DeloadConfig, WeekModifiers } from "@/domain/blocks/schema";
import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";
import {
  prescriptionSnapshotSchema,
  type Prefill,
  type PrescriptionSnapshot,
} from "@/domain/schemas/prescriptionSnapshot";
import {
  exerciseGroupKey,
  getLatestDecisionChosenByExercise,
  getPendingRecommendationsByExercise,
  getSessionRecommendationsByExercise,
  resolveGroupRecommendation,
  type RecommendationDto,
} from "@/server/progression/service";
import { listTemplateWarmupRoutines } from "@/server/warmupRoutines/service";

// Bounded lookback for "previous performance" / the future progression
// engine's history window (progression-engine.md §2's `history` input —
// only the window is populated here; `evaluate()` itself is Phase 4).
// pwa-offline-strategy.md §4 splits this into two roles sharing one fetched
// window: `previousPerformance` (last 3, non-deload) for display, and
// `history` (last 5) as the future engine's input. HISTORY_WINDOW must
// cover the larger of the two display limits.
const HISTORY_WINDOW = 8;
const HISTORY_DISPLAY_LIMIT = 5;
const PREVIOUS_PERFORMANCE_LIMIT = 3;

export interface HistorySetDto {
  setNumber: number;
  // §11.3 site #5 — display consumer: nullable to match `set_logs`'
  // post-0013 shape (I-13/H-12, a null is never coerced to `0`); rendered
  // through the same inline templates as today, which the athlete only ever
  // sees non-null in Release 1 since `load_reps` is the only reachable
  // profile through the app's own UI.
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  distanceM: number | null;
  durationS: number | null;
  isWarmup: boolean;
  // set-groups-architecture-evaluation.md §5.6 — needed by the offline
  // client's own per-group evaluation fallback (activeSession.ts), which
  // rebuilds engine history from these bundle-embedded sessions the same
  // way the server's own `getEngineHistory` does.
  groupKey: string | null;
}

export interface HistorySessionDto {
  sessionId: string;
  startedAt: string;
  isDeload: boolean;
  // What that session was prescribed (from its frozen snapshot) — the
  // offline client needs it to build PerformedExercise history entries for
  // fallback evaluation with the same inputs the server uses
  // (progression-engine.md §2/§5). Null for ad-hoc/unparseable snapshots.
  prescribed: { scheme: SetScheme; targetRir: RirBand | null } | null;
  sets: HistorySetDto[];
}

export interface TodayBundleExerciseEntry {
  prescriptionId: string;
  exerciseId: string;
  exerciseName: string;
  scheme: SetScheme;
  targetRir: RirBand | null;
  restSeconds: number | null;
  progression: ResolvedProgression;
  baselineLoadKg: number | null;
  loadStepKg: number;
  prefill: { loadKg: number | null; reps: number | null };
  // implementation-plan.md Phase 5 — the deload/WeekOverride modifiers
  // (if any) resolved for the block's current week and already baked into
  // `scheme`/`targetRir`/`prefill` above. Carried alongside so the client
  // can freeze the identical value into the session snapshot at start
  // (single authoritative resolution point — see buildTodayBundle).
  appliedModifiers: WeekModifiers | null;
  // pwa-offline-strategy.md §4 — the at-most-one pending recommendation for
  // this exercise in the active block, scoped to the NULL group key. Never
  // folded into `prefill` (a pending recommendation is not a Decision); the
  // UI shows it as the proposed target with accept/modify/reject. For an
  // ungrouped slot this is the whole story, byte-identical to before Stage A.
  pendingRecommendation: RecommendationDto | null;
  // set-groups-architecture-evaluation.md §5.3/§4.5 — one entry per group
  // that has a pending recommendation, present ONLY for a `groups` scheme.
  // Filtered to keys present in the CURRENT scheme (a removed group's
  // pending record is never surfaced here, §4.5); the first group's entry
  // additionally falls back to a pre-conversion null-key pending record
  // (C-1/D-6(a)) when its own key has none yet.
  pendingRecommendations?: RecommendationDto[];
  // set-groups-architecture-evaluation.md §5.3 — one resolved {loadKg, reps}
  // prefill per group key, present ONLY for a `groups` scheme; mirrors
  // `PrescriptionSnapshotData.groupPrefills`, carried here so `startSession`
  // (activeSession.ts) can freeze it verbatim.
  groupPrefills?: Record<string, Prefill>;
  previousPerformance: HistorySessionDto[];
  history: HistorySessionDto[];
  // §12.1 — read from the exercise row, optional on the wire (H-10) so a
  // cached pre-upgrade client's own bundle type (which has no such key)
  // keeps parsing identically; the server always populates it.
  measurement?: { profile: MeasurementProfile; loadBasis: LoadBasis | null };
  // workout-prescription-context-architecture-evaluation.md §4 — this slot's
  // `exercise_prescriptions.notes`, carried so `startSession` can freeze it
  // into the session snapshot (read-only "Program note:" on the workout
  // card). REQUIRED here, and the asymmetry with the client mirror
  // (TodayBundleExerciseEntryDto, where it is optional) is deliberate: H-10
  // constrains the CLIENT mirror only — a bundle cached before this feature
  // shipped genuinely has no such key — and says nothing about the server
  // type, which always has a value to give (`p.notes` is `string | null`,
  // never absent). Required here therefore makes a forgotten population site
  // a compile error, and matches the dominant shape on this interface
  // (`restSeconds`, `appliedModifiers`, `prefill` are all required).
  //
  // Carried straight from the prescription row, NOT through
  // `buildPrescriptionSnapshotData`: that builder's job is the week-modifier
  // and working-target derivation, and fields that are carried rather than
  // derived already bypass it (`measurement` below does the same). See the
  // architecture review's L-1.
  prescriptionNotes: string | null;
}

export interface ActiveSessionSetDto {
  id: string;
  setNumber: number;
  isWarmup: boolean;
  // Widened alongside `HistorySetDto` (§11.3 site #5's own rule, generalised
  // to this display DTO too — not itself a named site, but the identical
  // "map a set_logs row into a numeric field" shape): a null is never
  // coerced (I-13/H-12). Release 2 — the client's own mirror
  // (`src/sync/types.ts`'s `ActiveSessionSetDto`) is widened the same way.
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  // Release 2 remediation — this pair was missing here even though
  // `HistorySetDto` above already carries it; added to close the gap so a
  // non-`load_reps` active session's cross-device adopt/resume renders its
  // full row instead of silently dropping distance/duration.
  distanceM: number | null;
  durationS: number | null;
  loggedAt: string;
  notes: string | null;
  // set-groups-architecture-evaluation.md §4.4 — this was missing entirely
  // before this remediation pass: a cross-device adopt/resume of a grouped
  // session lost every set's group attribution (every row would render
  // unattributed, and `nextGroupSelection`'s recorded-count derivation on
  // the ADOPTING device would see zero sets in every group regardless of
  // what was actually logged). Mirrors `HistorySetDto.groupKey` above.
  groupKey: string | null;
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
  // The exercise's load increment — carried so decision matching and
  // steppers keep working after a cross-device adopt.
  loadStepKg: number | null;
  // The recommendation being decided at this workout (pending, or already
  // decided during this session) — carried so a cross-device adopt/resume
  // keeps the decision flow (progression-engine.md §7). Null when none.
  recommendation: RecommendationDto | null;
  // set-groups-architecture-evaluation.md §5.3 — the per-group sibling of
  // `recommendation` above, present only for a `groups` scheme; missing
  // entirely before this remediation pass (a cross-device adopt/resume of a
  // grouped, still-undecided session lost every group's recommendation).
  recommendations?: RecommendationDto[];
  // H-1 remediation (athletic-measurement-profiles-release-2-review.md §5.1)
  // — the slot's own FROZEN measurement shape, read from `session_exercises`'
  // typed `measurement_profile`/`load_basis` columns (already selected by
  // getActiveSession's `db.select().from(sessionExercises)`, just unused
  // before this fix). Mirrors `TodayBundleExerciseEntry.measurement` above,
  // but non-optional here: unlike a bundle, which can be served from a
  // pre-Release-2 cache, this DTO is always freshly built from the live DB
  // row, so there is no "old shape" case on the server side to tolerate.
  // Without this, a cross-device adopt or post-eviction resume of a
  // non-`load_reps` session fell back to the client's pre-upgrade default
  // (`load_reps`/`unspecified`) and rendered the wrong inputs.
  measurement: { profile: MeasurementProfile; loadBasis: LoadBasis | null };
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

// Warm-up Routines v1 (owner decision O-2) — the routine definitions the
// workout may offer, frozen client-side into the active-session aggregate at
// start. Only the resolved template's LINKED routines ride here, in link
// order; the user's wider library never does, because the in-workout
// switcher must never offer it.
//
// Items are pure text (`label` + optional `instruction`) and reference no
// exercise and no muscle group, so nothing here can reach the volume or
// progression pipelines (I-4).
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
      exercises: TodayBundleExerciseEntry[];
      // The template's curated warm-up routines, in link order. Empty when
      // the template links none — which is also how every bundle built
      // before this feature shipped reads to a client (see the tolerance
      // note on the client mirror in src/sync/types.ts).
      warmupRoutines: TodayWarmupRoutineDto[];
      // The id of the linked routine marked default, or null when the
      // template has links but no default (the compact-chooser case) or no
      // links at all.
      defaultWarmupRoutineId: string | null;
    }
  | { kind: "rest" }
  | { kind: "no_schedule" };

export interface TodayBundle {
  today: TodayResolutionDto;
  activeSession: ActiveSessionDto | null;
  generatedAt: string;
  // phase-8-review.md B-3 — the account's `users.timezone`, already fetched
  // below for this function's own day resolution. Exposing it here gives
  // offline quick-logs (bodyweight, recovery) a server-authoritative
  // timezone to cache and day-key against, instead of falling back to the
  // device's own resolved zone — which can select the wrong calendar day
  // whenever the two disagree (src/domain/time/localDate.ts).
  timezone: string;
}

interface HistorySessionExerciseRow {
  sessionExerciseId: string;
  sessionId: string;
  startedAt: Date;
  isDeload: boolean;
  prescribed: { scheme: SetScheme; targetRir: RirBand | null } | null;
  sets: HistorySetDto[];
}

function parseHistoryPrescribed(
  prescription: unknown,
): { scheme: SetScheme; targetRir: RirBand | null } | null {
  if (!prescription) return null;
  const parsed = prescriptionSnapshotSchema.safeParse(prescription);
  if (!parsed.success) return null;
  return { scheme: parsed.data.snapshot.scheme, targetRir: parsed.data.snapshot.targetRir };
}

async function getExerciseHistory(
  db: AppDb,
  userId: string,
  exerciseId: string,
): Promise<HistorySessionExerciseRow[]> {
  const rows = await db
    .select({
      sessionExerciseId: sessionExercises.id,
      sessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      isDeload: workoutSessions.isDeload,
      prescription: sessionExercises.prescription,
    })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(sessionExercises.sessionId, workoutSessions.id))
    .where(
      and(
        eq(sessionExercises.exerciseId, exerciseId),
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, "completed"),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(HISTORY_WINDOW);

  if (rows.length === 0) return [];

  const setRows = await db
    .select()
    .from(setLogs)
    .where(
      inArray(
        setLogs.sessionExerciseId,
        rows.map((r) => r.sessionExerciseId),
      ),
    )
    .orderBy(asc(setLogs.setNumber));

  const setsBySessionExercise = new Map<string, HistorySetDto[]>();
  for (const s of setRows) {
    const list = setsBySessionExercise.get(s.sessionExerciseId) ?? [];
    list.push({
      setNumber: s.setNumber,
      weightKg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
      distanceM: s.distanceM,
      durationS: s.durationS,
      isWarmup: s.isWarmup,
      groupKey: s.groupKey,
    });
    setsBySessionExercise.set(s.sessionExerciseId, list);
  }

  return rows.map((r) => ({
    sessionExerciseId: r.sessionExerciseId,
    sessionId: r.sessionId,
    startedAt: r.startedAt,
    isDeload: r.isDeload,
    prescribed: parseHistoryPrescribed(r.prescription),
    sets: setsBySessionExercise.get(r.sessionExerciseId) ?? [],
  }));
}

// set-groups-architecture-evaluation.md §5.6 reverse bridge — an UNGROUPED
// slot's own carry-forward chain reading a historical entry that was itself
// a `groups` scheme. "First group" is resolved from THAT ENTRY'S OWN frozen
// snapshot (`h.prescribed.scheme`) — never the current, ungrouped template,
// which has no group list to read at all — and only that group's sets are
// considered; every other group's sets are never pooled in (D-6's
// "no rewrite of historical rows": this changes only how an already-stored
// row is READ, not what is stored). An entry that was itself ungrouped (or
// unparseable) is unaffected — every one of its sets already belonged to the
// whole slot, exactly as before Stage A. Symmetric to
// `historySetsForGroupCarryForward`'s forward-direction bridge below.
function firstWorkSetForUngroupedCarryForward(
  h: HistorySessionExerciseRow,
): HistorySetDto | undefined {
  const scheme = h.prescribed?.scheme;
  if (scheme?.type === "groups") {
    const firstKey = scheme.groups[0]?.key;
    if (firstKey === undefined) return undefined;
    return h.sets.find((s) => !s.isWarmup && s.groupKey === firstKey);
  }
  return h.sets.find((s) => !s.isWarmup);
}

function toCarryForwardCandidate(h: HistorySessionExerciseRow): CarryForwardCandidate {
  const firstWorkSet = firstWorkSetForUngroupedCarryForward(h);
  return {
    status: "completed",
    isDeload: h.isDeload,
    startedAt: h.startedAt.toISOString(),
    firstWorkSetLoadKg: firstWorkSet ? firstWorkSet.weightKg : null,
  };
}

// set-groups-architecture-evaluation.md §5.3/§5.6 carry-forward row — "first
// work set WITH THAT KEY in the newest completed non-deload session"; the
// FIRST group additionally bridges an ungrouped historical session's sets
// (C-1/D-6(a) — that session was never grouped, so every one of its sets
// belonged to the whole slot). Mirrors
// `domain/progression/groupEvaluation.ts`'s `historySetsForGroup`, on this
// module's own display-row shape (`HistorySessionExerciseRow` carries
// `prescribed` and `HistorySetDto[]`, not `PerformedExercise`/`PerformedSet`)
// rather than sharing a cross-layer helper between `src/domain` and
// `src/server`.
function historySetsForGroupCarryForward(
  h: HistorySessionExerciseRow,
  groupKey: string,
  isFirstGroup: boolean,
): HistorySetDto[] {
  const scheme = h.prescribed?.scheme;
  if (!scheme) return [];
  if (scheme.type === "groups") return h.sets.filter((s) => s.groupKey === groupKey);
  return isFirstGroup ? h.sets : [];
}

function toGroupCarryForwardCandidate(
  h: HistorySessionExerciseRow,
  groupKey: string,
  isFirstGroup: boolean,
): CarryForwardCandidate {
  const matching = historySetsForGroupCarryForward(h, groupKey, isFirstGroup);
  const firstWorkSet = matching.find((s) => !s.isWarmup);
  return {
    status: "completed",
    isDeload: h.isDeload,
    startedAt: h.startedAt.toISOString(),
    firstWorkSetLoadKg: firstWorkSet ? firstWorkSet.weightKg : null,
  };
}

function toHistoryDto(h: HistorySessionExerciseRow): HistorySessionDto {
  return {
    sessionId: h.sessionId,
    startedAt: h.startedAt.toISOString(),
    isDeload: h.isDeload,
    prescribed: h.prescribed,
    sets: h.sets,
  };
}

// Exported for `/api/active-session` (Finding C), which serves this on its
// own so the client can read live active-session state without going through
// the cacheable today bundle. `status` is hard-coded `"in_progress"` below
// because the query only ever selects in-progress rows — a completed or
// discarded session is simply absent, i.e. `null`.
export async function getActiveSession(
  db: AppDb,
  userId: string,
): Promise<ActiveSessionDto | null> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.status, "in_progress")));
  if (!session) return null;

  const exerciseRows = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, session.id))
    .orderBy(asc(sessionExercises.position));

  const exerciseIds = exerciseRows.map((e) => e.exerciseId);
  const exerciseNameRows = exerciseIds.length
    ? await db
        .select({ id: exercises.id, name: exercises.name, loadStepKg: exercises.loadStepKg })
        .from(exercises)
        .where(inArray(exercises.id, exerciseIds))
    : [];
  const nameById = new Map(exerciseNameRows.map((e) => [e.id, e.name]));
  const loadStepById = new Map(exerciseNameRows.map((e) => [e.id, e.loadStepKg]));

  // H-1 remediation — a deload session must never surface a recommendation
  // to decide, cross-device resume included; skip the query entirely rather
  // than fetch-then-discard (see recommendationForDeload.ts).
  const recommendationByExercise = session.isDeload
    ? new Map<string, RecommendationDto>()
    : await getSessionRecommendationsByExercise(
        db,
        userId,
        { id: session.id, blockId: session.blockId },
        exerciseIds,
      );

  const sessionExerciseIds = exerciseRows.map((e) => e.id);
  const setRows = sessionExerciseIds.length
    ? await db
        .select()
        .from(setLogs)
        .where(inArray(setLogs.sessionExerciseId, sessionExerciseIds))
        .orderBy(asc(setLogs.setNumber))
    : [];
  const setsBySessionExercise = new Map<string, ActiveSessionSetDto[]>();
  for (const s of setRows) {
    const list = setsBySessionExercise.get(s.sessionExerciseId) ?? [];
    list.push({
      id: s.id,
      setNumber: s.setNumber,
      isWarmup: s.isWarmup,
      weightKg: s.weightKg,
      reps: s.reps,
      rir: s.rir,
      distanceM: s.distanceM,
      durationS: s.durationS,
      loggedAt: s.loggedAt.toISOString(),
      notes: s.notes,
      groupKey: s.groupKey,
    });
    setsBySessionExercise.set(s.sessionExerciseId, list);
  }

  return {
    id: session.id,
    blockId: session.blockId,
    templateId: session.templateId,
    templateName: session.templateName,
    weekIndex: session.weekIndex,
    isDeload: session.isDeload,
    status: "in_progress",
    startedAt: session.startedAt.toISOString(),
    clientId: session.clientId,
    notes: session.notes,
    exercises: exerciseRows.map((e) => {
      // set-groups-architecture-evaluation.md §5.3/§5.6 — this was the
      // second real bug this remediation pass found via a browser-level
      // test: `.get(e.exerciseId)` here never matched
      // `getSessionRecommendationsByExercise`'s own `exerciseGroupKey`-keyed
      // map (whose null-group key is `"<exerciseId>:"`, WITH a trailing
      // colon, never bare `exerciseId`) — cross-device resume of an
      // IN-PROGRESS session's pending/decided recommendation was silently
      // always `null`, for every exercise (grouped or not), regardless of
      // what actually existed. Fixed by keying the lookup the same way
      // every other consumer in this file already does.
      const prescriptionSnapshot = e.prescription as PrescriptionSnapshot | null;
      const scheme = prescriptionSnapshot?.snapshot.scheme;
      let recommendations: RecommendationDto[] | undefined;
      if (scheme?.type === "groups") {
        recommendations = scheme.groups
          .map((group, index) =>
            recommendationForDeload(
              session.isDeload,
              resolveGroupRecommendation(
                recommendationByExercise,
                e.exerciseId,
                group.key,
                index === 0,
                group.link !== undefined,
              ) ?? null,
            ),
          )
          .filter((r): r is RecommendationDto => r !== null);
      }
      return {
        id: e.id,
        exerciseId: e.exerciseId,
        exerciseName: nameById.get(e.exerciseId) ?? "",
        position: e.position,
        source: e.source as "template" | "adhoc",
        prescription: prescriptionSnapshot,
        skipped: e.skipped,
        notes: e.notes,
        loadStepKg: loadStepById.get(e.exerciseId) ?? null,
        recommendation: recommendationForDeload(
          session.isDeload,
          recommendationByExercise.get(exerciseGroupKey(e.exerciseId, null)) ?? null,
        ),
        ...(recommendations !== undefined ? { recommendations } : {}),
        // H-1 remediation — the slot's own frozen profile/load basis, already
        // selected above as `e.measurementProfile`/`e.loadBasis`; previously
        // dropped on the floor here, which is exactly what left a resumed
        // non-`load_reps` session with no `measurement` to adopt.
        measurement: {
          profile: e.measurementProfile as MeasurementProfile,
          loadBasis: e.loadBasis as LoadBasis | null,
        },
        sets: setsBySessionExercise.get(e.id) ?? [],
      };
    }),
  };
}

export async function buildTodayBundle(
  db: AppDb,
  userId: string,
  now: Date = new Date(),
): Promise<TodayBundle> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  const timezone = user?.timezone ?? "UTC";
  const today = userLocalDateString(timezone, now);
  const weekday = isoWeekday(today);

  let todayDto: TodayResolutionDto = { kind: "no_schedule" };

  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")));

  if (program) {
    const [block] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.programId, program.id), eq(blocks.status, "active")));

    if (block) {
      const scheduleRows = await db
        .select()
        .from(blockScheduleEntries)
        .where(eq(blockScheduleEntries.blockId, block.id));

      // Active-schedule remediation — rotation resolution anchors on the
      // *template* of the most recently completed session, not a count
      // against the current schedule length (todayTemplate.ts's header
      // comment explains why counting breaks once the schedule can change
      // under an active block).
      const [latestCompletedSession] = await db
        .select({ templateId: workoutSessions.templateId })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.blockId, block.id), eq(workoutSessions.status, "completed")))
        .orderBy(desc(workoutSessions.startedAt))
        .limit(1);
      const latestCompletedTemplateId = latestCompletedSession?.templateId ?? null;

      const resolution = resolveTodayTemplate(
        scheduleRows.map((r) => ({
          templateId: r.templateId,
          position: r.position,
          weekdays: r.weekdays,
        })),
        latestCompletedTemplateId,
        weekday,
      );

      if (resolution.kind === "scheduled") {
        const [template] = await db
          .select()
          .from(workoutTemplates)
          .where(eq(workoutTemplates.id, resolution.templateId));

        if (template) {
          const weekIdx = currentWeekIndex("active", block.startDate, today, null);

          // implementation-plan.md Phase 5 — the single point where
          // scheduled-deload-vs-WeekOverride precedence is resolved
          // (domain-model.md §5: a manual override for this week always
          // wins over a scheduled deload for the same week).
          const overrideRows =
            weekIdx !== null
              ? await db
                  .select()
                  .from(blockWeekOverrides)
                  .where(eq(blockWeekOverrides.blockId, block.id))
              : [];
          const effective =
            weekIdx !== null
              ? resolveEffectiveWeekModifiers(
                  weekIdx,
                  block.weeksPlanned,
                  block.deload as DeloadConfig | null,
                  overrideRows.map((r) => ({
                    weekIndex: r.weekIndex,
                    type: r.type as "deload" | "custom",
                    modifiers: r.modifiers as WeekModifiers,
                  })),
                )
              : { isDeload: false, modifiers: null };

          const prescriptionRows = await db
            .select()
            .from(exercisePrescriptions)
            .where(eq(exercisePrescriptions.templateId, template.id))
            .orderBy(asc(exercisePrescriptions.position));

          const exerciseIds = prescriptionRows.map((p) => p.exerciseId);
          const exerciseRows = exerciseIds.length
            ? await db.select().from(exercises).where(inArray(exercises.id, exerciseIds))
            : [];
          const exerciseById = new Map(exerciseRows.map((e) => [e.id, e]));

          // Phase 4 — decisions head the working-target chain
          // (prescription-model.md §4 step 1), and each exercise carries its
          // pending recommendation into the bundle (pwa-offline-strategy §4).
          const decisionChosenByExercise = await getLatestDecisionChosenByExercise(
            db,
            userId,
            block.id,
            exerciseIds,
          );
          // H-1 remediation — a deload week must never surface a pending
          // recommendation (it would let the athlete decide, implicitly or
          // explicitly, an unmodified target inside a deload week — see
          // docs/reviews/phase-5-review.md H-1). The record itself is
          // untouched; it simply isn't fetched for a deload week's bundle.
          const pendingByExercise = effective.isDeload
            ? new Map<string, RecommendationDto>()
            : await getPendingRecommendationsByExercise(db, userId, block.id, exerciseIds);

          const entries: TodayBundleExerciseEntry[] = [];
          for (const p of prescriptionRows) {
            const exercise = exerciseById.get(p.exerciseId);
            if (!exercise) continue; // exercise_id is RESTRICT, shouldn't happen
            const history = await getExerciseHistory(db, userId, p.exerciseId);
            const scheme = (p.scheme as SetSchemeEnvelope).scheme;

            // set-groups-architecture-evaluation.md §5.3 — one
            // GroupSnapshotInputs per group, keyed by group key, with the
            // C-1/D-6(a) bridge applied to the FIRST group's candidate list
            // only (§5.6).
            let groupInputs: Map<string, GroupSnapshotInputs> | undefined;
            if (scheme.type === "groups") {
              groupInputs = new Map();
              scheme.groups.forEach((group, index) => {
                const isFirstGroup = index === 0;
                const candidates = history.map((h) =>
                  toGroupCarryForwardCandidate(h, group.key, isFirstGroup),
                );
                const decisionChosen =
                  decisionChosenByExercise.get(exerciseGroupKey(p.exerciseId, group.key)) ??
                  (isFirstGroup
                    ? (decisionChosenByExercise.get(exerciseGroupKey(p.exerciseId, null)) ?? null)
                    : null);
                groupInputs!.set(group.key, { carryForwardCandidates: candidates, decisionChosen });
              });
            }

            const snapshotData = buildPrescriptionSnapshotData(
              { id: exercise.id, name: exercise.name },
              {
                scheme,
                targetRir: p.targetRir as RirBand | null,
                restSeconds: p.restSeconds,
                progression: p.progression as ResolvedProgression,
                baselineLoadKg: p.baselineLoadKg,
              },
              history.map(toCarryForwardCandidate),
              decisionChosenByExercise.get(exerciseGroupKey(p.exerciseId, null)) ?? null,
              effective.modifiers,
              exercise.loadStepKg,
              groupInputs,
            );

            // set-groups-architecture-evaluation.md §4.5/§5.3 — filtered to
            // keys present in the CURRENT scheme (a removed group's pending
            // record is never surfaced, §4.5's removed-group filter), with
            // the first group falling back to a pre-conversion null-key
            // pending record (C-1/D-6(a)).
            let pendingRecommendations: RecommendationDto[] | undefined;
            if (scheme.type === "groups") {
              pendingRecommendations = [];
              scheme.groups.forEach((group, index) => {
                const rec = resolveGroupRecommendation(
                  pendingByExercise,
                  p.exerciseId,
                  group.key,
                  index === 0,
                  group.link !== undefined,
                );
                if (rec) pendingRecommendations!.push(rec);
              });
            }

            entries.push({
              prescriptionId: p.id,
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              scheme: snapshotData.scheme,
              targetRir: snapshotData.targetRir,
              restSeconds: snapshotData.restSeconds,
              progression: p.progression as ResolvedProgression,
              baselineLoadKg: p.baselineLoadKg,
              loadStepKg: exercise.loadStepKg,
              prefill: snapshotData.prefill,
              appliedModifiers: snapshotData.appliedModifiers,
              pendingRecommendation: recommendationForDeload(
                effective.isDeload,
                pendingByExercise.get(exerciseGroupKey(p.exerciseId, null)) ?? null,
              ),
              ...(pendingRecommendations !== undefined
                ? { pendingRecommendations: effective.isDeload ? [] : pendingRecommendations }
                : {}),
              ...(snapshotData.groupPrefills ? { groupPrefills: snapshotData.groupPrefills } : {}),
              previousPerformance: history
                .filter((h) => !h.isDeload)
                .slice(0, PREVIOUS_PERFORMANCE_LIMIT)
                .map(toHistoryDto),
              history: history.slice(0, HISTORY_DISPLAY_LIMIT).map(toHistoryDto),
              measurement: {
                profile: exercise.measurementProfile as MeasurementProfile,
                loadBasis: exercise.loadBasis as LoadBasis | null,
              },
              // Read per prescription ROW, so two slots of the same exercise
              // in one template keep their own instructions (C-6) — the
              // `*ByExercise` maps above are keyed by exerciseId, this is
              // not. Verbatim: the prescription note is not derived, not
              // modified by week modifiers, and not trimmed again here.
              prescriptionNotes: p.notes,
            });
          }

          // Warm-up Routines v1 (O-2) — only what this template links, in
          // link order. Read through the ownership-checked service call so
          // the bundle can never widen access beyond what the REST surface
          // would allow; `null` is impossible here (the template was reached
          // through this user's own active program) but is handled as "no
          // routines" rather than asserted away.
          const warmupLinks = (await listTemplateWarmupRoutines(db, userId, template.id)) ?? [];
          const warmupRoutines: TodayWarmupRoutineDto[] = warmupLinks.map((link) => ({
            id: link.routineId,
            name: link.name,
            items: link.items.map((item) => ({
              label: item.label,
              instruction: item.instruction,
            })),
          }));
          const defaultWarmupRoutineId =
            warmupLinks.find((link) => link.isDefault)?.routineId ?? null;

          todayDto = {
            kind: "scheduled",
            blockId: block.id,
            templateId: template.id,
            templateName: template.name,
            weekIndex: weekIdx,
            isDeload: effective.isDeload,
            exercises: entries,
            warmupRoutines,
            defaultWarmupRoutineId,
          };
        }
      } else {
        todayDto = resolution;
      }
    }
  }

  const activeSession = await getActiveSession(db, userId);

  return { today: todayDto, activeSession, generatedAt: now.toISOString(), timezone };
}
