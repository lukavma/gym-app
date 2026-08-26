"use client";

import { useState } from "react";
import { RecoveryCheckIn } from "./RecoveryCheckIn";
import { RecoveryHistoryList } from "./RecoveryHistoryList";

export function RecoveryScreen() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-50">Recovery</h1>
      </header>
      {/* No `onDismiss` here — "dismiss forever" only applies to the Today
          card (TodaySection.tsx); this dedicated page always offers a
          check-in regardless of that preference. */}
      <RecoveryCheckIn onLogged={() => setRefreshKey((k) => k + 1)} />
      <RecoveryHistoryList key={refreshKey} />
    </div>
  );
}
