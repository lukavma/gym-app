"use client";

import { useEffect, useState } from "react";
import { listDeadLetterOps, retryDeadLetterOp, discardDeadLetter } from "@/sync/outbox";
import { flushOutbox } from "@/sync/flush";
import type { OutboxOpRecord } from "@/sync/db";

// Phase 8 — the dedicated dead-letter screen (implementation-plan.md
// Phase 8 builds list: "dead-letter screen (inspect/retry/discard per op,
// discard double-confirmed)"). Every op here already failed with a
// server-classified business-rule rejection (never a network/auth failure —
// those stay pending and retry on their own, src/sync/flush.ts), so nothing
// on this screen runs automatically: a human decides, per op, whether to
// retry it unchanged or discard it after two explicit confirmations.
export function SyncIssuesScreen() {
  const [ops, setOps] = useState<OutboxOpRecord[] | null>(null);

  async function refresh() {
    setOps(await listDeadLetterOps());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function retry(opId: string) {
    await retryDeadLetterOp(opId);
    void flushOutbox();
    await refresh();
  }

  async function discard(opId: string) {
    await discardDeadLetter(opId);
    await refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-50">Sync issues</h1>
        <p className="mt-1 text-sm text-slate-400">
          Changes the server rejected outright (not a network problem — those retry on their own).
          Nothing here is ever deleted automatically.
        </p>
      </header>

      {ops === null && <p className="text-sm text-slate-400">Loading…</p>}
      {ops !== null && ops.length === 0 && (
        <p className="text-sm text-slate-400">No sync issues.</p>
      )}
      {ops?.map((op) => (
        <SyncIssueCard
          key={op.opId}
          op={op}
          onRetry={() => void retry(op.opId)}
          onDiscard={() => void discard(op.opId)}
        />
      ))}
    </div>
  );
}

function summarizePayload(op: OutboxOpRecord): string {
  const p = op.payload;
  switch (op.entity) {
    case "setLog": {
      const weight = typeof p.weightKg === "number" ? `${p.weightKg} kg` : "?";
      const reps = typeof p.reps === "number" ? `× ${p.reps}` : "";
      return `Set log — ${weight} ${reps}`.trim();
    }
    case "workoutSession":
      return "Workout session";
    case "sessionExercise":
      return "Session exercise";
    case "recommendation":
      return "Recommendation";
    case "recommendationDecision":
      return "Recommendation decision";
    case "bodyweightEntry": {
      const weight = typeof p.weightKg === "number" ? `${p.weightKg} kg` : "?";
      const date = typeof p.date === "string" ? p.date : "";
      return `Bodyweight — ${weight} on ${date}`.trim();
    }
    case "recoveryEntry": {
      const date = typeof p.date === "string" ? p.date : "";
      return `Recovery check-in on ${date}`.trim();
    }
    default:
      return op.entity;
  }
}

function SyncIssueCard({
  op,
  onRetry,
  onDiscard,
}: {
  op: OutboxOpRecord;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  return (
    <div
      data-testid="sync-issue-card"
      className="flex flex-col gap-2 rounded-lg border border-red-800 bg-red-950/40 px-4 py-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-50">{summarizePayload(op)}</span>
        <span className="text-xs text-slate-500">
          {op.tries} attempt{op.tries === 1 ? "" : "s"}
        </span>
      </div>
      <p className="text-xs text-red-300">
        {op.deadReason ? `Rejected: ${op.deadReason}` : "Rejected by the server."}
      </p>
      <p className="text-xs text-slate-500">Logged {new Date(op.createdAt).toLocaleString()}</p>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="self-start text-xs text-slate-400 underline"
      >
        {expanded ? "Hide details" : "Inspect"}
      </button>
      {expanded && (
        <pre className="overflow-x-auto rounded bg-slate-950 p-2 text-xs text-slate-300">
          {JSON.stringify(
            { entity: op.entity, operation: op.operation, payload: op.payload },
            null,
            2,
          )}
        </pre>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200"
        >
          Retry
        </button>
        {!confirmingDiscard ? (
          <button
            type="button"
            onClick={() => setConfirmingDiscard(true)}
            className="flex-1 rounded-lg border border-red-700 px-3 py-2 text-sm text-red-300"
          >
            Discard
          </button>
        ) : (
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 rounded-lg bg-red-800 px-3 py-2 text-sm font-medium text-red-50"
          >
            Confirm discard — permanent
          </button>
        )}
      </div>
      {confirmingDiscard && (
        <button
          type="button"
          onClick={() => setConfirmingDiscard(false)}
          className="self-start text-xs text-slate-500 underline"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
