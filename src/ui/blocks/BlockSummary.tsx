"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BlockSummaryDto } from "./types";

type Status = "loading" | "ready" | "error";

interface BlockSummaryProps {
  blockId: string;
  programId: string;
  // Numeric summary only makes sense for a block that actually finished its
  // run (`status === 'completed'`) — an abandoned block still gets the
  // "Start next block" affordance, just not a progress readout.
  showSummary: boolean;
}

// evidence-to-design.md decision 12 / B6 — a fixed, non-coercive caveat: no
// claimed benefit, no "you should deload" framing, shown whenever the block
// included a deload session (not conditional on detecting an actual dip,
// which would invent a heuristic the evidence doesn't support).
const POST_DELOAD_CAVEAT =
  "This block included a deload week — a temporary dip in load right after it is expected, not a sign of lost progress.";

export function BlockSummary({ blockId, programId, showSummary }: BlockSummaryProps) {
  const [status, setStatus] = useState<Status>(showSummary ? "loading" : "ready");
  const [summary, setSummary] = useState<BlockSummaryDto | null>(null);

  useEffect(() => {
    if (!showSummary) return;
    let cancelled = false;
    fetch(`/api/blocks/${blockId}/summary`)
      .then((res) => res.json())
      .then((data: { summary: BlockSummaryDto }) => {
        if (cancelled) return;
        setSummary(data.summary);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [blockId, showSummary]);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-800 p-3">
      <h3 className="text-sm font-semibold text-slate-50">Block summary</h3>

      {showSummary && status === "loading" && <p className="text-xs text-slate-400">Loading…</p>}
      {showSummary && status === "error" && (
        <p className="text-xs text-red-400">Failed to load summary.</p>
      )}

      {showSummary && status === "ready" && summary && (
        <>
          <p className="text-sm text-slate-300">{summary.sessionsCompleted} sessions completed</p>

          {summary.exercises.length > 0 && (
            <ul className="flex flex-col gap-1">
              {summary.exercises.map((e) => (
                <li
                  key={e.exerciseId}
                  className="flex items-center justify-between text-sm text-slate-300"
                >
                  <span>{e.exerciseName}</span>
                  <span className="text-slate-400">
                    {e.beforeLoadKg} kg → {e.afterLoadKg} kg
                  </span>
                </li>
              ))}
            </ul>
          )}

          {summary.hadDeloadSession && (
            <p className="text-xs text-amber-400">{POST_DELOAD_CAVEAT}</p>
          )}
        </>
      )}

      <Link
        href={`/programs/${programId}/blocks/new?fromBlockId=${blockId}`}
        className="rounded-lg bg-slate-100 px-3 py-2 text-center text-sm font-medium text-slate-900"
      >
        Start next block
      </Link>
    </section>
  );
}
