"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TemplateDto } from "./types";

type Status = "loading" | "ready" | "error";

interface TemplatesSectionProps {
  programId: string;
}

export function TemplatesSection({ programId }: TemplatesSectionProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/programs/${programId}/templates`)
      .then((res) => res.json())
      .then((data: { templates: TemplateDto[] }) => {
        if (cancelled) return;
        setTemplates(data.templates);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= templates.length) return;
    const reordered = templates.slice();
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);
    setTemplates(reordered);
    setReordering(true);
    try {
      const res = await fetch(`/api/programs/${programId}/templates/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateIds: reordered.map((t) => t.id) }),
      });
      if (res.ok) {
        const data: { templates: TemplateDto[] } = await res.json();
        setTemplates(data.templates);
      }
    } finally {
      setReordering(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-50">Templates</h2>
        <Link
          href={`/programs/${programId}/templates/new`}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
        >
          + Add
        </Link>
      </header>

      {status === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {status === "error" && <p className="text-sm text-red-400">Failed to load templates.</p>}
      {status === "ready" && templates.length === 0 && (
        <p className="text-sm text-slate-400">No templates yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {templates.map((template, index) => (
          <li
            key={template.id}
            className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
          >
            <Link href={`/templates/${template.id}`} className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-medium text-slate-50">{template.name}</span>
                {template.archivedAt && (
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    Archived
                  </span>
                )}
              </div>
            </Link>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={reordering || index === 0}
                aria-label="Move up"
                className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={reordering || index === templates.length - 1}
                aria-label="Move down"
                className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
