"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import type { TemplateDto } from "./types";
import { PrescriptionsSection } from "@/ui/prescriptions/PrescriptionsSection";

type Status = "loading" | "ready" | "submitting" | "not_found";

interface TemplateFormProps {
  mode: "create" | "edit";
  programId?: string;
  templateId?: string;
}

export function TemplateForm({ mode, programId, templateId }: TemplateFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(mode === "edit" ? "loading" : "ready");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !templateId) return;
    let cancelled = false;
    fetch(`/api/templates/${templateId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setStatus("not_found");
          return;
        }
        const data: { template: TemplateDto } = await res.json();
        if (cancelled) return;
        setName(data.template.name);
        setNotes(data.template.notes ?? "");
        setArchivedAt(data.template.archivedAt);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load template.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, templateId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const payload = {
      name,
      notes: notes.trim() === "" ? undefined : notes,
    };

    setStatus("submitting");
    try {
      const res = await fetch(
        mode === "create" ? `/api/programs/${programId}/templates` : `/api/templates/${templateId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const data: { template: TemplateDto } = await res.json();
        if (mode === "create") {
          router.push(`/templates/${data.template.id}`);
          return;
        }
        router.refresh();
        setStatus("ready");
        return;
      }

      if (res.status === 409) {
        setError("An active template with this name already exists in this program.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setStatus("ready");
    } catch {
      setError("Network error. Please try again.");
      setStatus("ready");
    }
  }

  async function handleArchiveToggle() {
    if (!templateId) return;
    setArchiving(true);
    try {
      const action = archivedAt ? "unarchive" : "archive";
      const res = await fetch(`/api/templates/${templateId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data: { template: TemplateDto } = await res.json();
        setArchivedAt(data.template.archivedAt);
      } else if (res.status === 409) {
        setError("This template is scheduled in an active block and can't be archived.");
      } else {
        setError("Failed to update archive status.");
      }
    } finally {
      setArchiving(false);
    }
  }

  if (status === "loading") {
    return <p className="text-center text-sm text-slate-400">Loading…</p>;
  }

  if (status === "not_found") {
    return <p className="text-center text-sm text-slate-400">Template not found.</p>;
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <h1 className="text-xl font-semibold text-slate-50">
          {mode === "create" ? "New template" : "Edit template"}
        </h1>

        {archivedAt && (
          <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-amber-400">
            This template is archived.
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" disabled={status === "submitting"}>
          {status === "submitting"
            ? "Saving…"
            : mode === "create"
              ? "Create template"
              : "Save changes"}
        </Button>

        {mode === "edit" && (
          <button
            type="button"
            onClick={handleArchiveToggle}
            disabled={archiving}
            className="rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-50"
          >
            {archivedAt ? "Unarchive" : "Archive"}
          </button>
        )}
      </form>

      {mode === "edit" && templateId && <PrescriptionsSection templateId={templateId} />}
    </div>
  );
}
