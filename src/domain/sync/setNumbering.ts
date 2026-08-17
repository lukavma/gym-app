// Finding D — set numbering must stay contiguous after a deletion.
//
// `set_number` is user-visible ordering ("set 3 of 4"), not an identity, and
// migration 0004 made `uq_set_number` DEFERRABLE INITIALLY DEFERRED expressly
// so a renumbering pass could exist. Deleting set 2 of 1..4 used to leave
// 1,3,4 on the device and in PostgreSQL forever.
//
// Pure and structural (anything with an `id` and a `setNumber`) so it serves
// both the in-progress aggregate (ActiveSessionSetDto) and the history screen
// (HistorySetDetail), and so it is unit-testable in the node-only vitest
// environment, which has no IndexedDB.

export interface NumberedSet {
  id: string;
  setNumber: number;
}

export interface SetDeletionPlan<T extends NumberedSet> {
  // null when `setId` isn't in `sets` — the caller should then do nothing at
  // all rather than emit a delete op for a row that was already gone.
  deleted: T | null;
  // Every surviving set, ascending, renumbered to a contiguous 1..n.
  remaining: T[];
  // The subset of `remaining` whose number actually changed, in ASCENDING
  // order of the new number. That order is required, not cosmetic: the sync
  // API applies one DB transaction per op, so the deferred unique constraint
  // is checked at each op's own COMMIT. Emitting the delete first and then
  // ascending updates means every target number has already been vacated by
  // the preceding step (1,2,3,4 minus #2 → 3→2, then 4→3), so no single
  // transaction ever commits with a duplicate.
  renumbered: T[];
}

export function planSetDeletion<T extends NumberedSet>(
  sets: readonly T[],
  setId: string,
): SetDeletionPlan<T> {
  const deleted = sets.find((s) => s.id === setId) ?? null;
  const kept = sets.filter((s) => s.id !== setId).sort((a, b) => a.setNumber - b.setNumber);

  const remaining: T[] = [];
  const renumbered: T[] = [];
  kept.forEach((set, index) => {
    const setNumber = index + 1;
    if (set.setNumber === setNumber) {
      remaining.push(set);
      return;
    }
    const updated = { ...set, setNumber };
    remaining.push(updated);
    renumbered.push(updated);
  });

  return { deleted, remaining, renumbered };
}
