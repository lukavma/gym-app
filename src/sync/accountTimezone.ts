import { getCachedBundle, setCachedBundle } from "./bundleCache";
import type { TodayBundleDto } from "./types";

// phase-8-remediation-verification.md §4/§12 (B-3, item 1) — a bundle
// cached by any pre-remediation build (or a legacy response replayed from
// the service worker's own `today-bundle` runtime cache) has no `timezone`
// field at all; typed `TodayBundleDto.timezone: string` promises a value
// that isn't actually guaranteed at runtime for a record read back out of
// IndexedDB or `fetch().json()`. An unvalidated `undefined` used to slip
// past `resolveTodayDate`'s `=== null` check straight into
// `Intl.DateTimeFormat`, which silently resolves `timeZone: undefined` to
// the JS runtime's own default — the device zone, exactly the defect B-3
// exists to eliminate. `unknown`, not the declared `string`, is what this
// value actually is at the boundary — applied identically to a cached
// record and a live-fetch response, since a legacy response served from the
// SW's runtime cache is indistinguishable from a genuine network response
// at this layer.
function readValidTimezone(bundle: TodayBundleDto): string | null {
  const timezone: unknown = bundle.timezone;
  return typeof timezone === "string" && timezone.length > 0 ? timezone : null;
}

// phase-8-review.md B-3 — the account's server-owned `users.timezone`, now
// shipped in the Today bundle (src/server/today/service.ts) and cached
// alongside it (src/sync/bundleCache.ts). This is the one place quick-logs
// (src/sync/dailyLogs.ts) resolve "today" from — never the device's own
// resolved zone, which can select a different calendar day than the
// account's whenever the two disagree, online or offline.
//
// Prefers the cached bundle (works offline, and avoids a network round trip
// entirely on the common path — TodaySection already fetches and caches the
// bundle on every Today visit, well before a quick-log save could happen).
// Falls back to a live fetch only when nothing is cached yet — a device that
// has never successfully loaded Today, e.g. navigating straight to
// /bodyweight or /recovery — so being online still resolves correctly
// without requiring a prior Today visit. Returns null only when neither
// source has an answer: callers must treat that as "we don't know what day
// it is," never substitute a guess.
export async function getAccountTimezone(): Promise<string | null> {
  const cached = await getCachedBundle();
  if (cached) {
    const timezone = readValidTimezone(cached.bundle);
    // A legacy/invalid cached bundle falls through to the live fetch below
    // instead of being returned — the whole point of the guard.
    if (timezone !== null) return timezone;
  }

  try {
    const res = await fetch("/api/today-bundle");
    if (!res.ok) return null;
    const data = (await res.json()) as TodayBundleDto;
    void setCachedBundle(data);
    return readValidTimezone(data);
  } catch {
    return null;
  }
}
