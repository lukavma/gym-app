"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import {
  WARMUP_ITEM_INSTRUCTION_MAX,
  WARMUP_ITEM_LABEL_MAX,
  WARMUP_ROUTINE_ITEMS_MAX,
  WARMUP_ROUTINE_NAME_MAX,
} from "@/domain/warmup/schema";
import type { WarmupRoutineDto } from "./types";

type Status = "loading" | "ready" | "submitting" | "not_found";

interface DraftItem {
  label: string;
  instruction: string;
}

interface WarmupRoutineFormProps {
  mode: "create" | "edit";
  routineId?: string;
}

function emptyItem(): DraftItem {
  return { label: "", instruction: "" };
}

// Warm-up Routines v1 — create/edit one routine and its ordered items.
//
// The whole routine (name + full item list) is submitted as ONE request
// (POST for create, PUT for edit): routine and items are a single
// transactional consistency boundary server-side (evaluation B-3), so the UI
// never issues per-item calls and can never leave a half-saved routine
// behind. Add/edit/remove/reorder are all just edits to this local draft
// until "Save".
export function WarmupRoutineForm({ mode, routineId }: WarmupRoutineFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(mode === "edit" ? "loading" : "ready");
  const [name, setName] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [linkedTemplateCount, setLinkedTemplateCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !routineId) return;
    let cancelled = false;
    fetch(`/api/warmup-routines/${routineId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setStatus("not_found");
          return;
        }
        if (!res.ok) throw new Error("request failed");
        const data: { routine: WarmupRoutineDto } = await res.json();
        if (cancelled) return;
        setName(data.routine.name);
        setItems(
          data.routine.items.length > 0
            ? data.routine.items.map((item) => ({
                label: item.label,
                instruction: item.instruction ?? "",
              }))
            : [emptyItem()],
        );
        setLinkedTemplateCount(data.routine.linkedTemplateCount);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load warm-up routine.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, routineId]);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    setItems((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = items.slice();
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);
    setItems(reordered);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName === "") {
      setError("Give the routine a name.");
      return;
    }
    // Blank rows are dropped rather than rejected — the form always shows one
    // empty row to type into, and an untouched trailing row is not an error.
    const payloadItems = items
      .map((item) => ({
        label: item.label.trim(),
        instruction: item.instruction.trim() === "" ? null : item.instruction.trim(),
      }))
      .filter((item) => item.label !== "");
    if (payloadItems.length === 0) {
      setError("Add at least one item.");
      return;
    }
    if (payloadItems.length > WARMUP_ROUTINE_ITEMS_MAX) {
      setError(`A routine can have at most ${WARMUP_ROUTINE_ITEMS_MAX} items.`);
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch(
        mode === "create" ? "/api/warmup-routines" : `/api/warmup-routines/${routineId}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName, items: payloadItems }),
        },
      );

      if (res.ok) {
        const data: { routine: WarmupRoutineDto } = await res.json();
        if (mode === "create") {
          router.push(`/warmup-routines/${data.routine.id}`);
          return;
        }
        setLinkedTemplateCount(data.routine.linkedTemplateCount);
        router.refresh();
        setStatus("ready");
        return;
      }

      if (res.status === 409) {
        setError("You already have a warm-up routine with this name.");
      } else if (res.status === 404) {
        setError("This warm-up routine no longer exists.");
      } else if (res.status === 400) {
        setError("Check the item labels and instructions — something is too long or empty.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setStatus("ready");
    } catch {
      setError("Network error. Warm-up routines can only be edited online.");
      setStatus("ready");
    }
  }

  async function handleDelete() {
    if (!routineId) return;
    const linkNote =
      linkedTemplateCount > 0
        ? ` It is linked to ${linkedTemplateCount} ${
            linkedTemplateCount === 1 ? "template" : "templates"
          }, and those links will be removed.`
        : "";
    if (!window.confirm(`Delete this warm-up routine?${linkNote} This can't be undone.`)) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/warmup-routines/${routineId}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        router.push("/programs");
        return;
      }
      setError("Failed to delete this warm-up routine.");
    } catch {
      setError("Network error. Warm-up routines can only be deleted online.");
    } finally {
      setDeleting(false);
    }
  }

  if (status === "loading") {
    return <p className="text-center text-sm text-slate-400">Loading…</p>;
  }
  if (status === "not_found") {
    return <p className="text-center text-sm text-slate-400">Warm-up routine not found.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-50">
        {mode === "create" ? "New warm-up routine" : "Edit warm-up routine"}
      </h1>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Name
        <input
          type="text"
          required
          maxLength={WARMUP_ROUTINE_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-50">Items</h2>
        <p className="text-xs text-slate-500">
          One line each — what to do, plus an optional dose or cue (for example &ldquo;Bike&rdquo; ·
          &ldquo;5 min easy&rdquo;).
        </p>

        <ul className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li
              key={index}
              className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3"
            >
              <div className="flex items-center gap-2">
                <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                  Item {index + 1}
                  <input
                    type="text"
                    aria-label={`Item ${index + 1} label`}
                    maxLength={WARMUP_ITEM_LABEL_MAX}
                    value={item.label}
                    onChange={(e) => updateItem(index, { label: e.target.value })}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
                  />
                </label>
                <div className="flex flex-col gap-1 pt-4">
                  <button
                    type="button"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move item ${index + 1} up`}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label={`Move item ${index + 1} down`}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Instruction (optional)
                <input
                  type="text"
                  aria-label={`Item ${index + 1} instruction`}
                  maxLength={WARMUP_ITEM_INSTRUCTION_MAX}
                  value={item.instruction}
                  onChange={(e) => updateItem(index, { instruction: e.target.value })}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
                />
              </label>

              <button
                type="button"
                onClick={() => removeItem(index)}
                disabled={items.length <= 1}
                aria-label={`Remove item ${index + 1}`}
                className="self-start text-xs text-red-400 underline disabled:opacity-30"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setItems((current) => [...current, emptyItem()])}
          disabled={items.length >= WARMUP_ROUTINE_ITEMS_MAX}
          className="rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-300 disabled:opacity-30"
        >
          + Add item
        </button>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting"
          ? "Saving…"
          : mode === "create"
            ? "Create routine"
            : "Save changes"}
      </Button>

      {mode === "edit" && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg border border-red-800 px-4 py-3 text-sm text-red-300 disabled:opacity-50"
        >
          Delete routine
        </button>
      )}
    </form>
  );
}
