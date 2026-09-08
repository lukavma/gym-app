import { useActiveSessionStore } from "@/sync/activeSessionStore";

// M-2 (athletic-measurement-profiles-release-2-review.md) — extracted out of
// WorkoutExecution.tsx's handleComplete so this race-sensitive step is unit
// testable without rendering React (this repo's unit-test toolchain has no
// jsdom/@testing-library/react — see tests/unit/sync/handleCompleteRefusedCount.test.ts).
//
// refusedSetLogIds/refusedSessionExerciseIds (src/sync/activeSessionStore.ts)
// are only ever refreshed by hydrate(), adoptRemote(), and
// SyncStatusBanner's 5-second poll — a rejection flush.ts just recorded can
// still be a poll tick away from reflected in a hook-bound render snapshot.
// Always await a real refreshSessionBlocked() here and read the POST-refresh
// state straight off the store via getState() — never a
// `useActiveSessionStore((s) => s.refusedSetLogIds)`-style hook value, which
// would still be the calling render's stale snapshot — so a caller deciding
// whether to warn about dropped sets never acts on stale state regardless of
// poll timing.
export async function getRefusedCountAfterRefresh(): Promise<number> {
  await useActiveSessionStore.getState().refreshSessionBlocked();
  const state = useActiveSessionStore.getState();
  return state.refusedSetLogIds.size + state.refusedSessionExerciseIds.size;
}
