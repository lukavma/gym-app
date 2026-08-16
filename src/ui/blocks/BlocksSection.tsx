"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BlockDto } from "./types";

type Status = "loading" | "ready" | "error";

interface BlocksSectionProps {
  programId: string;
}

const STATUS_LABELS: Record<BlockDto["status"], string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  abandoned: "Abandoned",
};

export function BlocksSection({ programId }: BlocksSectionProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [blocks, setBlocks] = useState<BlockDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/programs/${programId}/blocks`)
      .then((res) => res.json())
      .then((data: { blocks: BlockDto[] }) => {
        if (cancelled) return;
        setBlocks(data.blocks);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-50">Blocks</h2>
        <Link
          href={`/programs/${programId}/blocks/new`}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
        >
          + Start
        </Link>
      </header>

      {status === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {status === "error" && <p className="text-sm text-red-400">Failed to load blocks.</p>}
      {status === "ready" && blocks.length === 0 && (
        <p className="text-sm text-slate-400">No blocks yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {blocks.map((block) => (
          <li key={block.id}>
            <Link
              href={`/blocks/${block.id}`}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
            >
              <span className="text-base font-medium text-slate-50">{block.name}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {STATUS_LABELS[block.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
