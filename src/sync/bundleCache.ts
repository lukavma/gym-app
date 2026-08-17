import { getIdb, BUNDLE_CACHE_KEY } from "./db";
import type { TodayBundleDto } from "./types";

export interface CachedBundle {
  bundle: TodayBundleDto;
  fetchedAt: string;
}

export async function getCachedBundle(): Promise<CachedBundle | null> {
  const db = await getIdb();
  const record = await db.get("bundleCache", BUNDLE_CACHE_KEY);
  return record ?? null;
}

export async function setCachedBundle(bundle: TodayBundleDto): Promise<void> {
  const db = await getIdb();
  await db.put("bundleCache", { bundle, fetchedAt: new Date().toISOString() }, BUNDLE_CACHE_KEY);
}
