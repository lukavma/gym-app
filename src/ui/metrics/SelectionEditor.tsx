"use client";

// Metrics dashboard v1 — `/metrics/exercises`, the selection editor (§9,
// §11.5, §12.2, §13). The only screen with writes: every state change
// before Save is local component state; nothing is written until Save.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateDto, EstimateIndexRowState, SelectionRowDto } from "@/domain/metrics/types";
import { METRICS_PAGE_COPY, refusalCopyForState } from "./copy";

const SELECTION_MAX = 5;

interface SelectionResponse {
  selection: SelectionRowDto[];
  candidates: CandidateDto[];
}

interface EditorRow {
  exerciseId: string;
  name: string;
  archived: boolean;
  state: EstimateIndexRowState;
}

// M-2 remediation — §11.5's stated purpose for `SelectionRowDto.state` is
// "so the editor can show why a row has no estimate"; only the two
// ineligibility states need a line (an empty selection or a stale-but-
// eligible row isn't a caveat the editor discloses — that's the dashboard's
// job). Returns `null` when there's nothing to disclose.
function editorStateNote(state: EstimateIndexRowState): string | null {
  if (state === "not_available" || state === "turned_off") return refusalCopyForState(state);
  return null;
}

export function SelectionEditor() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateDto[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [announcement, setAnnouncement] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/metrics/selection")
      .then(async (res) => {
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const json: SelectionResponse = await res.json();
        setRows(
          json.selection.map((row) => ({
            exerciseId: row.exerciseId,
            name: row.name,
            archived: row.archived,
            state: row.state,
          })),
        );
        setCandidates(json.candidates);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const availableCandidates = candidates.filter(
    (candidate) => !rows.some((row) => row.exerciseId === candidate.exerciseId),
  );

  const move = useCallback((index: number, direction: -1 | 1) => {
    setRows((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      setAnnouncement(`${moved!.name} is now ${target + 1} of ${next.length}`);
      return next;
    });
  }, []);

  const remove = useCallback((index: number) => {
    setRows((prev) => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (removed) setAnnouncement(`${removed.name} removed`);
      return next;
    });
  }, []);

  const add = useCallback(() => {
    const candidate = availableCandidates.find((c) => c.exerciseId === selectedCandidateId);
    if (!candidate || rows.length >= SELECTION_MAX) return;
    setRows((prev) => [
      // Candidates are, by construction, always structurally eligible and
      // not switched off (`queryCandidates` filters to exactly that) — the
      // real `state` is recomputed from the stored selection on next load;
      // "estimate" is a neutral placeholder that renders no caveat line
      // either way (`editorStateNote` returns null for it, same as
      // "no_current_estimate").
      ...prev,
      {
        exerciseId: candidate.exerciseId,
        name: candidate.name,
        archived: false,
        state: "estimate",
      },
    ]);
    setSelectedCandidateId("");
  }, [availableCandidates, selectedCandidateId, rows.length]);

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/metrics/selection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseIds: rows.map((row) => row.exerciseId) }),
      });
      if (!res.ok) {
        setSaveError(METRICS_PAGE_COPY.editorSaveGenericError);
        setSaving(false);
        return;
      }
      router.push("/metrics");
    } catch {
      setSaveError(METRICS_PAGE_COPY.editorOfflineSaveError);
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <p className="text-sm text-slate-400">{METRICS_PAGE_COPY.loading}</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-red-400">{METRICS_PAGE_COPY.loadFailed}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-slate-50">{METRICS_PAGE_COPY.editorHeading}</h1>
        <p className="text-sm text-slate-400">{METRICS_PAGE_COPY.editorCaption}</p>
      </header>

      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const note = editorStateNote(row.state);
          return (
            <li
              key={row.exerciseId}
              className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                {/* H-1 — `min-w-0` on every flex item in this row lets the
                    name truncate instead of forcing the row (and the page)
                    to overflow horizontally on a long exercise name. */}
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-100">
                  <span className="min-w-0 flex-1 truncate">
                    {index + 1}. {row.name}
                  </span>
                  {row.archived ? (
                    <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                      {METRICS_PAGE_COPY.editorArchivedBadge}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${row.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="min-h-11 min-w-11 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 disabled:opacity-40"
                  >
                    {METRICS_PAGE_COPY.editorMoveUp}
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${row.name} down`}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    className="min-h-11 min-w-11 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 disabled:opacity-40"
                  >
                    {METRICS_PAGE_COPY.editorMoveDown}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${row.name}`}
                    onClick={() => remove(index)}
                    className="min-h-11 min-w-11 rounded-lg border border-slate-700 px-3 text-sm text-slate-200"
                  >
                    {METRICS_PAGE_COPY.editorRemove}
                  </button>
                </span>
              </div>
              {/* M-2 — §11.5: SelectionRowDto.state exists "so the editor can
                  show why a row has no estimate"; only the two ineligible
                  states carry a disclosure line. */}
              {note ? <p className="text-xs text-slate-500">{note}</p> : null}
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {rows.length < SELECTION_MAX ? (
        availableCandidates.length > 0 ? (
          <div className="flex items-center gap-2">
            {/* H-1 — a native `<select>`'s intrinsic width is its WIDEST
                `<option>` (the longest candidate exercise name); without
                `min-w-0` on the label and `w-full` on the select, that
                intrinsic width forces this row, and the page, to overflow
                horizontally regardless of viewport. */}
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-slate-300">
              {METRICS_PAGE_COPY.editorAddLabel}
              <select
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-slate-50"
              >
                <option value="">—</option>
                {availableCandidates.map((candidate) => (
                  <option key={candidate.exerciseId} value={candidate.exerciseId}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={add}
              disabled={!selectedCandidateId}
              className="min-h-11 shrink-0 rounded-lg border border-slate-700 px-4 text-sm text-slate-200 disabled:opacity-40"
            >
              {METRICS_PAGE_COPY.editorAddButton}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">{METRICS_PAGE_COPY.editorEmptyCandidates}</p>
        )
      ) : (
        <p role="status" className="text-xs text-slate-400">
          {METRICS_PAGE_COPY.editorLimitMessage}
        </p>
      )}

      {saveError ? (
        <p role="alert" className="text-xs text-red-400">
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-11 w-full rounded-lg bg-slate-100 px-4 py-3 text-base font-medium text-slate-900 transition active:scale-[0.98] disabled:opacity-60"
        >
          {METRICS_PAGE_COPY.editorSaveButton}
        </button>
        <a
          href="/metrics"
          className="flex min-h-11 items-center justify-center text-sm text-slate-400 underline underline-offset-2"
        >
          {METRICS_PAGE_COPY.editorCancelLink}
        </a>
      </div>
    </div>
  );
}
