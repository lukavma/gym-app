// Warm-up Routines v1 — the pure state machine behind the in-workout card
// (evaluation §6.3's lifecycle table).
//
// Everything here is a total function over plain data: no IndexedDB, no
// fetch, no clock, no ids. src/sync/activeSession.ts owns persistence and
// calls into these; the UI owns rendering and calls into these. That split
// is what makes "switching a routine resets the checklist", "skip is
// reversible", and "auto-collapse when done" testable without a browser.
//
// This module is a leaf: it imports nothing. Nothing progression-, volume-
// or sync-related is reachable from it — asserted in
// tests/unit/warmupBoundary.test.ts.

export interface WarmupItemState {
  label: string;
  instruction: string | null;
}

export interface WarmupRoutineState {
  id: string;
  name: string;
  items: WarmupItemState[];
}

export interface WarmupSessionState {
  routines: WarmupRoutineState[];
  selectedRoutineId: string | null;
  done: boolean[];
  dismissed: boolean;
}

export interface WarmupFreezeInput {
  routines: WarmupRoutineState[];
  defaultRoutineId: string | null;
}

function doneArrayFor(routines: WarmupRoutineState[], selectedRoutineId: string | null): boolean[] {
  const routine = routines.find((r) => r.id === selectedRoutineId);
  return routine ? routine.items.map(() => false) : [];
}

// Called once, at session start, from the bundle's linked routines.
//
// Returns null — not an empty state — when the template links nothing, so
// "no warm-up card" is representable as the absence of the whole field and
// is indistinguishable from a pre-feature aggregate (R-2). A default that
// isn't in the linked set is ignored rather than trusted: a stale cached
// bundle can carry one, and inventing a selection the switcher can't undo
// would be worse than starting with the compact chooser.
export function freezeWarmupState(input: WarmupFreezeInput): WarmupSessionState | null {
  if (input.routines.length === 0) return null;
  const selectedRoutineId =
    input.defaultRoutineId !== null &&
    input.routines.some((routine) => routine.id === input.defaultRoutineId)
      ? input.defaultRoutineId
      : null;
  return {
    routines: input.routines,
    selectedRoutineId,
    done: doneArrayFor(input.routines, selectedRoutineId),
    dismissed: false,
  };
}

// Switching resets progress deterministically (evaluation §6.3, R-9):
// `done` is rebuilt from the newly selected routine's item count, so it can
// never be left mismatched against the checklist being rendered. Selecting
// the routine that is already selected still resets — "start this one over"
// is the only sensible reading of tapping it, and it keeps the function a
// pure map from (state, id) to state with no history dependence.
export function selectWarmupRoutine(
  state: WarmupSessionState,
  routineId: string | null,
): WarmupSessionState {
  const exists = routineId === null || state.routines.some((routine) => routine.id === routineId);
  const nextId = exists ? routineId : state.selectedRoutineId;
  return {
    ...state,
    selectedRoutineId: nextId,
    done: doneArrayFor(state.routines, nextId),
  };
}

// Ticking and un-ticking are the same operation; an out-of-range index is a
// no-op rather than a throw (a stale render can only ever address an index
// the current routine no longer has).
export function toggleWarmupItem(state: WarmupSessionState, index: number): WarmupSessionState {
  if (!Number.isInteger(index) || index < 0 || index >= state.done.length) return state;
  const done = state.done.slice();
  done[index] = !done[index];
  return { ...state, done };
}

// Skip / undo-skip. Deliberately never clears `done`: undoing a skip must
// bring the checklist back exactly as it was, and a skipped-then-completed
// workout leaves no trace of either way round.
export function setWarmupDismissed(
  state: WarmupSessionState,
  dismissed: boolean,
): WarmupSessionState {
  return { ...state, dismissed };
}

export function selectedWarmupRoutine(state: WarmupSessionState): WarmupRoutineState | null {
  return state.routines.find((routine) => routine.id === state.selectedRoutineId) ?? null;
}

// "All items checked" — false when nothing is selected or the routine is
// empty, so an empty checklist never reads as a finished one.
export function isWarmupChecklistComplete(state: WarmupSessionState): boolean {
  const routine = selectedWarmupRoutine(state);
  if (!routine || routine.items.length === 0) return false;
  if (state.done.length !== routine.items.length) return false;
  return state.done.every(Boolean);
}
