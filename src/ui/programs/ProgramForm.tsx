"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import type { ProgramDto } from "./types";
import { TemplatesSection } from "@/ui/templates/TemplatesSection";
import { BlocksSection } from "@/ui/blocks/BlocksSection";

type Status = "loading" | "ready" | "submitting" | "not_found";

interface ProgramFormProps {
  mode: "create" | "edit";
  programId?: string;
}

export function ProgramForm({ mode, programId }: ProgramFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(mode === "edit" ? "loading" : "ready");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [programStatus, setProgramStatus] = useState<ProgramDto["status"]>("active");
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !programId) return;
    let cancelled = false;
    fetch(`/api/programs/${programId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setStatus("not_found");
          return;
        }
        const data: { program: ProgramDto } = await res.json();
        if (cancelled) return;
        setName(data.program.name);
        setDescription(data.program.description ?? "");
        setProgramStatus(data.program.status);
        setArchivedAt(data.program.archivedAt);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load program.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, programId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const payload = {
      name,
      description: description.trim() === "" ? undefined : description,
    };

    setStatus("submitting");
    try {
      const res = await fetch(mode === "create" ? "/api/programs" : `/api/programs/${programId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data: { program: ProgramDto } = await res.json();
        if (mode === "create") {
          router.push(`/programs/${data.program.id}`);
          return;
        }
        router.refresh();
        setStatus("ready");
        return;
      }

      if (res.status === 409) {
        setError("An active program already exists. Archive it before creating a new one.");
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
    if (!programId) return;
    setArchiving(true);
    try {
      const action = archivedAt ? "unarchive" : "archive";
      const res = await fetch(`/api/programs/${programId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data: { program: ProgramDto } = await res.json();
        setArchivedAt(data.program.archivedAt);
        setProgramStatus(data.program.status);
      } else if (res.status === 409) {
        setError("An active program already exists. Archive it first.");
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
    return <p className="text-center text-sm text-slate-400">Program not found.</p>;
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <h1 className="text-xl font-semibold text-slate-50">
          {mode === "create" ? "New program" : "Edit program"}
        </h1>

        {programStatus === "archived" && (
          <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-amber-400">
            This program is archived.
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
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
              ? "Create program"
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

      {mode === "edit" && programId && (
        <>
          <TemplatesSection programId={programId} />
          <BlocksSection programId={programId} />
        </>
      )}
    </div>
  );
}
