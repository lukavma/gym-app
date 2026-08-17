import { getIdb, BUNDLE_CACHE_KEY } from "./db";
import type { TodayBundleDto } from "./types";

export interface CachedBundle {
  bundle: TodayBundleDto;
  fetchedAt: string;
}

// Finding C — the persisted bundle keeps the planning half (`today`), which
// is what makes an offline gym session possible, but never `activeSession`:
// a stored copy cannot know that the server has since completed or discarded
// that session, and treating it as live is what offered a finished workout
// for resume. Remote active-session state comes from
// src/sync/remoteActiveSession.ts only.
//
// Applied on read as well as on write, deliberately: devices in the field
// already hold a poisoned record, and sanitizing on read heals them on the
// next launch with no migration and no IndexedDB version bump.
function withoutActiveSession(bundle: TodayBundleDto): TodayBundleDto {
  if (bundle.activeSession === null) return bundle;
  return { ...bundle, activeSession: null };
}

export async function getCachedBundle(): Promise<CachedBundle | null> {
  const db = await getIdb();
  const record = await db.get("bundleCache", BUNDLE_CACHE_KEY);
  if (!record) return null;
  return { ...record, bundle: withoutActiveSession(record.bundle) };
}

export async function setCachedBundle(bundle: TodayBundleDto): Promise<void> {
  const db = await getIdb();
  await db.put(
    "bundleCache",
    { bundle: withoutActiveSession(bundle), fetchedAt: new Date().toISOString() },
    BUNDLE_CACHE_KEY,
  );
}
