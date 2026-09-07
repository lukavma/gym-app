// Metrics dashboard v1 — the one shared amber "Deload" badge markup (§8),
// used by both the Training and Weekly volume cards so the two conventions
// M-1's remediation unified never drift apart again.

import { METRICS_PAGE_COPY } from "./copy";

export function DeloadBadge() {
  return (
    <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">
      {METRICS_PAGE_COPY.deloadBadge}
    </span>
  );
}
