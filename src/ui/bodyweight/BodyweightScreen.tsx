"use client";

import { useState } from "react";
import { BodyweightHistoryList } from "./BodyweightHistoryList";
import { BodyweightQuickLog } from "./BodyweightQuickLog";

export function BodyweightScreen() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-50">Bodyweight</h1>
      </header>
      <BodyweightQuickLog onLogged={() => setRefreshKey((k) => k + 1)} />
      <BodyweightHistoryList key={refreshKey} />
    </div>
  );
}
