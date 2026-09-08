import { create } from "zustand";
import * as activeSession from "./activeSession";
import { listDeadLetterOps } from "./outbox";
import { fetchRemoteActiveSession, isAdoptableRemoteSession } from "./remoteActiveSession";
import type {
  StartSessionInput,
  LogSetInput,
  EditSetPatch,
  ExplicitDecisionInput,
} from "./activeSession";
import type { ActiveSessionDto } from "./types";
import type { LoadBasis, MeasurementProfile } from "@/domain/measurement/profile";

// Finding C — the outcome of trying to adopt a session the server reported as
// in progress. `gone` means the server has freshly told us it is no longer
// in progress (completed, discarded, or replaced); `unreachable` means we
// could not ask. Neither ever results in a local session.
export type AdoptRemoteOutcome = "adopted" | "gone" | "unreachable";

// Thin reactive mirror over src/sync/activeSession.ts's IndexedDB-backed
// mutators, shared across the Today and workout-execution pages so both
// see the same in-progress session without prop-drilling or re-reading
// IndexedDB on every navigation. IndexedDB (via activeSession.ts) remains
// the durable source of truth — this store is rebuilt from it on hydrate()
// and after every mutation, never the other way around.
interface ActiveSessionState {
  session: ActiveSessionDto | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  start: (input: StartSessionInput) => Promise<void>;
  adoptRemote: (sessionId: string) => Promise<AdoptRemoteOutcome>;
  // H-2 remediation (athletic-measurement-profiles-release-2-review.md) —
  // `measurement` is optional purely as a defensive fallback (see
  // src/sync/activeSession.ts's own addAdhocExercise): every real caller
  // (AddAdhocExercise.tsx) has a full ExerciseDto in hand and always
  // supplies it, so the sync-layer default is never exercised on the normal
  // path.
  addAdhocExercise: (
    exerciseId: string,
    exerciseName: string,
    measurement?: { profile: MeasurementProfile; loadBasis: LoadBasis | null },
  ) => Promise<void>;
  setExerciseSkipped: (sessionExerciseId: string, skipped: boolean) => Promise<void>;
  setExerciseNotes: (sessionExerciseId: string, notes: string | null) => Promise<void>;
  logSet: (input: LogSetInput) => Promise<void>;
  decideRecommendation: (
    sessionExerciseId: string,
    decision: ExplicitDecisionInput,
  ) => Promise<void>;
  editSet: (sessionExerciseId: string, setId: string, patch: EditSetPatch) => Promise<void>;
  deleteSet: (sessionExerciseId: string, setId: string) => Promise<void>;
  setSessionNotes: (notes: string | null) => Promise<void>;
  // Warm-up Routines v1 — local-only session state. Same store shape as
  // every other action (mutate IndexedDB, mirror the result here), but the
  // underlying mutators enqueue no outbox ops, so none of these can produce
  // a sync effect (see src/sync/activeSession.ts).
  selectWarmupRoutine: (routineId: string | null) => Promise<void>;
  toggleWarmupItem: (index: number) => Promise<void>;
  setWarmupDismissed: (dismissed: boolean) => Promise<void>;
  complete: () => Promise<void>;
  discard: (sessionId?: string) => Promise<void>;
  // MEDIUM-9 — if the session's own workoutSession op dead-lettered (e.g. a
  // cross-device takeover the server rejected as a conflict), the local
  // session can never sync. Rather than speculative re-homing/merge
  // machinery, the UI just stops accepting further mutations and tells the
  // user to discard — discard's local effect (session removed) is the
  // escape hatch even if the discard op itself also dead-letters server-side.
  sessionBlocked: boolean;
  // O-16 (§13.4/§15.3 of the athletic-measurement-profiles evaluation) —
  // additive to the workoutSession-only `sessionBlocked` above, not a
  // replacement: a setLog/sessionExercise dead letter is per-row, not
  // session-fatal, so completion must stay possible (unlike `sessionBlocked`,
  // which disables Complete). `refusedSetLogIds` holds the `payload.id` of
  // every dead-lettered setLog op whose `payload.sessionExerciseId` names a
  // slot in the active session; `refusedSessionExerciseIds` holds the
  // `payload.id` of every dead-lettered sessionExercise op whose
  // `payload.sessionId` is the active session. Both are keyed by the row's
  // own id, not the op's opId, so the UI can match them directly against
  // `set.id` / `exercise.id` on the rendered card.
  refusedSetLogIds: ReadonlySet<string>;
  refusedSessionExerciseIds: ReadonlySet<string>;
  refreshSessionBlocked: () => Promise<void>;
}

export const useActiveSessionStore = create<ActiveSessionState>((set, get) => ({
  session: null,
  hydrated: false,
  hydrate: async () => {
    const session = await activeSession.getLocalActiveSession();
    set({ session, hydrated: true });
    await get().refreshSessionBlocked();
  },
  start: async (input) => {
    const session = await activeSession.startSession(input);
    set({ session, hydrated: true });
  },
  // Takes an id, not a session object, on purpose: the caller is not allowed
  // to supply the state that gets adopted. Whatever the UI was displaying
  // (necessarily some snapshot fetched earlier), the row that lands in
  // IndexedDB is re-read from the server here, immediately before the write,
  // and only if it is still that same session and still in progress.
  adoptRemote: async (sessionId) => {
    const live = await fetchRemoteActiveSession();
    if (live.status !== "fresh") return "unreachable";
    if (!isAdoptableRemoteSession(live.activeSession, sessionId)) return "gone";
    await activeSession.hydrateFromServer(live.activeSession);
    // Athletic Measurement Profiles Release 2 regression fix, updated for
    // H-1 (athletic-measurement-profiles-release-2-review.md §5.1) — the
    // server's own ActiveSessionExerciseDto (src/server/today/service.ts)
    // now always populates `measurement` for a live response, but this
    // in-memory store state is set from the RAW `live.activeSession`
    // object, not from what was just written to IndexedDB, and it is what
    // ExerciseCard/HistoryDetail actually render from. Normalizing here too
    // keeps this path tolerant of a genuinely old/stale remote value (the
    // same reason `hydrateFromServer` normalizes before its own write) —
    // without it, a raw pre-upgrade remote object would still crash with
    // "Cannot read properties of undefined (reading 'profile')" even though
    // a live server response no longer needs the default. Reuse the same
    // `normalizeActiveSession` the IndexedDB write already applies, so the
    // two never disagree.
    set({ session: activeSession.normalizeActiveSession(live.activeSession), hydrated: true });
    await get().refreshSessionBlocked();
    return "adopted";
  },
  addAdhocExercise: async (exerciseId, exerciseName, measurement) => {
    const session = await activeSession.addAdhocExercise(exerciseId, exerciseName, measurement);
    set({ session });
  },
  setExerciseSkipped: async (sessionExerciseId, skipped) => {
    const session = await activeSession.setExerciseSkipped(sessionExerciseId, skipped);
    set({ session });
  },
  setExerciseNotes: async (sessionExerciseId, notes) => {
    const session = await activeSession.setExerciseNotes(sessionExerciseId, notes);
    set({ session });
  },
  logSet: async (input) => {
    const session = await activeSession.logSet(input);
    set({ session });
  },
  decideRecommendation: async (sessionExerciseId, decision) => {
    const session = await activeSession.decideRecommendation(sessionExerciseId, decision);
    set({ session });
  },
  editSet: async (sessionExerciseId, setId, patch) => {
    const session = await activeSession.editSet(sessionExerciseId, setId, patch);
    set({ session });
  },
  deleteSet: async (sessionExerciseId, setId) => {
    const session = await activeSession.deleteSet(sessionExerciseId, setId);
    set({ session });
  },
  setSessionNotes: async (notes) => {
    const session = await activeSession.setSessionNotes(notes);
    set({ session });
  },
  selectWarmupRoutine: async (routineId) => {
    const session = await activeSession.selectWarmupRoutine(routineId);
    set({ session });
  },
  toggleWarmupItem: async (index) => {
    const session = await activeSession.toggleWarmupItem(index);
    set({ session });
  },
  setWarmupDismissed: async (dismissed) => {
    const session = await activeSession.setWarmupDismissed(dismissed);
    set({ session });
  },
  complete: async () => {
    await activeSession.completeSession();
    set({
      session: null,
      sessionBlocked: false,
      refusedSetLogIds: new Set(),
      refusedSessionExerciseIds: new Set(),
    });
  },
  discard: async (sessionId) => {
    const current = get().session;
    await activeSession.discardSession(sessionId);
    if (!sessionId || current?.id === sessionId) {
      set({
        session: null,
        sessionBlocked: false,
        refusedSetLogIds: new Set(),
        refusedSessionExerciseIds: new Set(),
      });
    }
  },
  sessionBlocked: false,
  refusedSetLogIds: new Set(),
  refusedSessionExerciseIds: new Set(),
  refreshSessionBlocked: async () => {
    const session = get().session;
    if (!session) {
      set({
        sessionBlocked: false,
        refusedSetLogIds: new Set(),
        refusedSessionExerciseIds: new Set(),
      });
      return;
    }
    const deadLetters = await listDeadLetterOps();
    const blocked = deadLetters.some(
      (op) => op.entity === "workoutSession" && op.payload.id === session.id,
    );
    // O-16 — additive matching, same dead-letter list, two more entities.
    // `sessionExerciseIds` is the active session's own slot ids, exactly
    // what a setLog op's `payload.sessionExerciseId` must name for that
    // dead-lettered set to belong to THIS session (not some other, e.g.
    // already-completed, session's leftover dead letter).
    const sessionExerciseIds = new Set(session.exercises.map((exercise) => exercise.id));
    const refusedSetLogIds = new Set<string>(
      deadLetters
        .filter(
          (op) =>
            op.entity === "setLog" &&
            typeof op.payload.sessionExerciseId === "string" &&
            sessionExerciseIds.has(op.payload.sessionExerciseId) &&
            typeof op.payload.id === "string",
        )
        .map((op) => op.payload.id as string),
    );
    const refusedSessionExerciseIds = new Set<string>(
      deadLetters
        .filter(
          (op) =>
            op.entity === "sessionExercise" &&
            op.payload.sessionId === session.id &&
            typeof op.payload.id === "string",
        )
        .map((op) => op.payload.id as string),
    );
    set({ sessionBlocked: blocked, refusedSetLogIds, refusedSessionExerciseIds });
  },
}));
