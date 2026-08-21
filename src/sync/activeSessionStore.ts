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
  addAdhocExercise: (exerciseId: string, exerciseName: string) => Promise<void>;
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
  complete: () => Promise<void>;
  discard: (sessionId?: string) => Promise<void>;
  // MEDIUM-9 — if the session's own workoutSession op dead-lettered (e.g. a
  // cross-device takeover the server rejected as a conflict), the local
  // session can never sync. Rather than speculative re-homing/merge
  // machinery, the UI just stops accepting further mutations and tells the
  // user to discard — discard's local effect (session removed) is the
  // escape hatch even if the discard op itself also dead-letters server-side.
  sessionBlocked: boolean;
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
    set({ session: live.activeSession, hydrated: true });
    await get().refreshSessionBlocked();
    return "adopted";
  },
  addAdhocExercise: async (exerciseId, exerciseName) => {
    const session = await activeSession.addAdhocExercise(exerciseId, exerciseName);
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
  complete: async () => {
    await activeSession.completeSession();
    set({ session: null, sessionBlocked: false });
  },
  discard: async (sessionId) => {
    const current = get().session;
    await activeSession.discardSession(sessionId);
    if (!sessionId || current?.id === sessionId) set({ session: null, sessionBlocked: false });
  },
  sessionBlocked: false,
  refreshSessionBlocked: async () => {
    const session = get().session;
    if (!session) {
      set({ sessionBlocked: false });
      return;
    }
    const deadLetters = await listDeadLetterOps();
    const blocked = deadLetters.some(
      (op) => op.entity === "workoutSession" && op.payload.id === session.id,
    );
    set({ sessionBlocked: blocked });
  },
}));
