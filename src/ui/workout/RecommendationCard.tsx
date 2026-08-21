"use client";

import { useState } from "react";
import type { RecommendationDto } from "@/sync/types";
import type { ExplicitDecisionInput } from "@/sync/activeSession";
import type { RecommendationTarget } from "@/domain/progression/engine";
import { STRATEGY_DISPLAY_NAMES, type StrategyId } from "@/domain/progression/registry";
import {
  ACTION_COPY,
  CONFIDENCE_COPY,
  classificationCopy,
  formatTarget,
  reasonCopy,
} from "@/ui/recommendations/copy";

interface RecommendationCardProps {
  recommendation: RecommendationDto;
  disabled?: boolean;
  onDecide: (decision: ExplicitDecisionInput) => void;
}

function strategyLabel(rec: RecommendationDto): string {
  const name = STRATEGY_DISPLAY_NAMES[rec.strategyId as StrategyId] ?? rec.strategyId;
  return `${name} v${rec.strategyVersion}`;
}

function decidedBadge(rec: RecommendationDto): string {
  const chosen = formatTarget(rec.decision.chosen);
  switch (rec.decision.status) {
    case "accepted":
      return chosen ? `Accepted ${chosen}` : "Accepted";
    case "modified":
      return chosen ? `Changed to ${chosen}` : "Changed";
    case "rejected":
      return "Rejected — keeping previous target";
    default:
      return rec.decision.status;
  }
}

// progression-engine.md §7 — the recommendation card at next workout start:
// proposed target, plain-language reasons (mvp-scope F7: at least one is
// always visible), rule + honest classification label, confidence, and
// [Accept] [Keep previous] [Custom…]. Decision buttons disappear once the
// one-time decision exists (implicitly via the first work set, or here).
export function RecommendationCard({
  recommendation: rec,
  disabled = false,
  onDecide,
}: RecommendationCardProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customLoad, setCustomLoad] = useState(
    rec.target?.loadKg !== undefined ? String(rec.target.loadKg) : "",
  );
  const [customReps, setCustomReps] = useState(
    rec.target?.reps !== undefined ? String(rec.target.reps) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const pending = rec.decision.status === "pending";
  const targetText = formatTarget(rec.target);
  const actionable = pending && targetText !== null && rec.action !== "none";

  function submitCustom() {
    const chosen: RecommendationTarget = {};
    if (customLoad.trim() !== "") {
      const loadKg = Number(customLoad);
      if (!Number.isFinite(loadKg) || loadKg < 0) {
        setError("Weight must be 0 or more.");
        return;
      }
      chosen.loadKg = loadKg;
    }
    if (customReps.trim() !== "") {
      const reps = Number(customReps);
      if (!Number.isInteger(reps) || reps < 1) {
        setError("Reps must be a whole number of 1 or more.");
        return;
      }
      chosen.reps = reps;
    }
    if (chosen.loadKg === undefined && chosen.reps === undefined) {
      setError("Enter a weight or a rep target.");
      return;
    }
    setError(null);
    setCustomOpen(false);
    onDecide({ status: "modified", chosen });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-sky-900 bg-sky-950/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-sky-200">
          {ACTION_COPY[rec.action]}
          {targetText ? `: ${targetText}` : ""}
        </p>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          {CONFIDENCE_COPY[rec.confidence]} confidence
        </span>
      </div>

      <ul className="flex flex-wrap gap-1">
        {rec.reasonCodes.map((code) => (
          <li
            key={code}
            className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300"
          >
            {reasonCopy(code)}
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-slate-500">
        {strategyLabel(rec)} ({classificationCopy(rec.classification)})
      </p>

      {!pending && <p className="text-xs text-slate-300">{decidedBadge(rec)}</p>}

      {actionable && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide({ status: "accepted" })}
              className="rounded bg-sky-200 px-3 py-1.5 text-xs font-medium text-slate-900 disabled:opacity-50"
            >
              Accept{targetText ? ` ${targetText}` : ""}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDecide({ status: "rejected" })}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
            >
              Keep previous
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setCustomOpen((v) => !v)}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
            >
              Custom…
            </button>
          </div>
          {customOpen && (
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] text-slate-400">kg</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={customLoad}
                  onChange={(e) => setCustomLoad(e.target.value)}
                  disabled={disabled}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] text-slate-400">reps</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={customReps}
                  onChange={(e) => setCustomReps(e.target.value)}
                  disabled={disabled}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
                />
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={submitCustom}
                className="rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 disabled:opacity-50"
              >
                Use
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
