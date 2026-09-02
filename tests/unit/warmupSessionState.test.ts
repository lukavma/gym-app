import { describe, expect, it } from "vitest";
import {
  freezeWarmupState,
  isWarmupChecklistComplete,
  selectWarmupRoutine,
  selectedWarmupRoutine,
  setWarmupDismissed,
  toggleWarmupItem,
  type WarmupRoutineState,
  type WarmupSessionState,
} from "@/domain/warmup/session";

// Warm-up Routines v1 — the card's state machine (evaluation §6.3), tested
// as pure data with no IndexedDB, no store and no React involved.

const upper: WarmupRoutineState = {
  id: "routine-upper",
  name: "Upper Standard",
  items: [
    { label: "Bike", instruction: "5 min easy" },
    { label: "Band external rotation", instruction: "2x15 light" },
    { label: "Scap pull-ups", instruction: null },
  ],
};

const shoulders: WarmupRoutineState = {
  id: "routine-shoulders",
  name: "Shoulder Prep",
  items: [{ label: "Horizontal rotation", instruction: "10 controlled reps" }],
};

function frozen(defaultRoutineId: string | null = upper.id): WarmupSessionState {
  const state = freezeWarmupState({ routines: [upper, shoulders], defaultRoutineId });
  if (!state) throw new Error("expected a frozen warm-up state");
  return state;
}

describe("freezeWarmupState (start of session)", () => {
  it("returns null when the template links no routines — the absence of the field IS 'no card'", () => {
    expect(freezeWarmupState({ routines: [], defaultRoutineId: null })).toBeNull();
    expect(freezeWarmupState({ routines: [], defaultRoutineId: upper.id })).toBeNull();
  });

  it("selects the default and sizes `done` to that routine's items", () => {
    const state = frozen();
    expect(state.selectedRoutineId).toBe(upper.id);
    expect(state.done).toEqual([false, false, false]);
    expect(state.dismissed).toBe(false);
  });

  it("selects nothing when there is no default — the compact chooser case", () => {
    const state = frozen(null);
    expect(state.selectedRoutineId).toBeNull();
    expect(state.done).toEqual([]);
    expect(selectedWarmupRoutine(state)).toBeNull();
  });

  it("ignores a default that is not among the linked routines (a stale cached bundle can carry one)", () => {
    const state = freezeWarmupState({
      routines: [upper],
      defaultRoutineId: "routine-that-was-unlinked",
    });
    expect(state?.selectedRoutineId).toBeNull();
    expect(state?.done).toEqual([]);
  });

  it("freezes the routine definitions verbatim, so later definition edits cannot reach a running session", () => {
    const state = frozen();
    expect(state.routines).toEqual([upper, shoulders]);
  });
});

describe("selectWarmupRoutine", () => {
  it("switching resets the checklist deterministically and resizes `done` to the new routine", () => {
    let state = toggleWarmupItem(frozen(), 0);
    state = toggleWarmupItem(state, 1);
    expect(state.done).toEqual([true, true, false]);

    state = selectWarmupRoutine(state, shoulders.id);
    expect(state.selectedRoutineId).toBe(shoulders.id);
    expect(state.done).toEqual([false]);
  });

  it("switching back does NOT restore the previous ticks — progress is per selection, not remembered", () => {
    let state = toggleWarmupItem(frozen(), 0);
    state = selectWarmupRoutine(state, shoulders.id);
    state = selectWarmupRoutine(state, upper.id);
    expect(state.done).toEqual([false, false, false]);
  });

  it("clearing the selection empties the checklist", () => {
    const state = selectWarmupRoutine(frozen(), null);
    expect(state.selectedRoutineId).toBeNull();
    expect(state.done).toEqual([]);
  });

  it("ignores an id that is not linked to this session (O-2: only linked routines are selectable)", () => {
    const state = selectWarmupRoutine(frozen(), "routine-from-another-template");
    expect(state.selectedRoutineId).toBe(upper.id);
    expect(state.done).toEqual([false, false, false]);
  });

  it("never mutates the input state", () => {
    const before = frozen();
    const snapshot = structuredClone(before);
    selectWarmupRoutine(before, shoulders.id);
    expect(before).toEqual(snapshot);
  });
});

describe("toggleWarmupItem", () => {
  it("ticks and un-ticks the same index", () => {
    const state = frozen();
    expect(toggleWarmupItem(state, 1).done).toEqual([false, true, false]);
    expect(toggleWarmupItem(toggleWarmupItem(state, 1), 1).done).toEqual([false, false, false]);
  });

  it("is a no-op for an out-of-range or non-integer index", () => {
    const state = frozen();
    expect(toggleWarmupItem(state, -1)).toBe(state);
    expect(toggleWarmupItem(state, 3)).toBe(state);
    expect(toggleWarmupItem(state, 1.5)).toBe(state);
  });
});

describe("setWarmupDismissed (skip / undo)", () => {
  it("skipping is reversible and preserves the ticks underneath it", () => {
    let state = toggleWarmupItem(frozen(), 2);
    state = setWarmupDismissed(state, true);
    expect(state.dismissed).toBe(true);
    expect(state.done).toEqual([false, false, true]);

    state = setWarmupDismissed(state, false);
    expect(state.dismissed).toBe(false);
    expect(state.done).toEqual([false, false, true]);
    expect(state.selectedRoutineId).toBe(upper.id);
  });
});

describe("isWarmupChecklistComplete (one of the two auto-collapse triggers)", () => {
  it("is false until every item is checked", () => {
    let state = frozen();
    expect(isWarmupChecklistComplete(state)).toBe(false);
    state = toggleWarmupItem(state, 0);
    state = toggleWarmupItem(state, 1);
    expect(isWarmupChecklistComplete(state)).toBe(false);
    state = toggleWarmupItem(state, 2);
    expect(isWarmupChecklistComplete(state)).toBe(true);
  });

  it("is false when nothing is selected — an empty checklist never reads as a finished one", () => {
    expect(isWarmupChecklistComplete(frozen(null))).toBe(false);
  });

  it("is false when `done` and the selected routine's items disagree (defensive against a doctored aggregate)", () => {
    const state: WarmupSessionState = { ...frozen(), done: [true] };
    expect(isWarmupChecklistComplete(state)).toBe(false);
  });

  it("switching after completing resets it to incomplete", () => {
    let state = frozen();
    state = toggleWarmupItem(toggleWarmupItem(toggleWarmupItem(state, 0), 1), 2);
    expect(isWarmupChecklistComplete(state)).toBe(true);
    state = selectWarmupRoutine(state, shoulders.id);
    expect(isWarmupChecklistComplete(state)).toBe(false);
  });
});
