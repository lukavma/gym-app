"use client";

// Estimated 1RM tracker — `/exercises/[id]/strength` (revision §15.1, owner
// decision O-4).
//
// READ-ONLY. The screen fetches, renders, and offers a what-if calculator
// that re-fetches; it writes nothing, and it holds no domain arithmetic of
// its own — N-10 keeps every computation on the server in v1, so the
// calculator sends `whatIfReps` / `whatIfRir` to the endpoint and renders
// what comes back rather than dividing anything in the browser.
//
// Fetching follows the house convention (`VolumeScreen.tsx`): plain `fetch`
// with `useState`/`useEffect`/`useCallback`, no react-query (there is no
// provider anywhere in this app).

import { useCallback, useEffect, useState } from "react";
import { parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import { Sparkline } from "./Sparkline";
import { STRENGTH_PAGE_COPY, confidenceCopy, reasonCopy } from "./copy";
import {
  formatEstimate,
  formatGoverningSet,
  formatKg,
  formatLocalDate,
  formatSessionAge,
  formatTranslatedLoad,
} from "./format";
import type {
  ExerciseStrengthReportDto,
  ExerciseStrengthResponse,
  StrengthLoadGroupDto,
  StrengthObservationDto,
} from "./types";

type Status = "loading" | "ready" | "error" | "not_found";

interface StrengthScreenProps {
  exerciseId: string;
}

interface WhatIfQuery {
  reps: number;
  rir: number;
}

export function StrengthScreen({ exerciseId }: StrengthScreenProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ExerciseStrengthReportDto | null>(null);
  const [repsDraft, setRepsDraft] = useState("5");
  const [rirDraft, setRirDraft] = useState("2");
  const [whatIfQuery, setWhatIfQuery] = useState<WhatIfQuery | null>(null);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  const load = useCallback(
    (query: WhatIfQuery | null) => {
      let cancelled = false;
      setStatus((prev) => (prev === "ready" ? "ready" : "loading"));
      const params = new URLSearchParams();
      if (query) {
        params.set("whatIfReps", String(query.reps));
        params.set("whatIfRir", String(query.rir));
      }
      // `params.toString()` rather than `params.size` — the latter only
      // reached Safari in 17, and this app's target surface is an iPhone PWA.
      const search = params.toString();
      const suffix = search.length > 0 ? `?${search}` : "";
      fetch(`/api/exercises/${exerciseId}/strength${suffix}`)
        .then(async (res) => {
          if (cancelled) return;
          if (res.status === 404) {
            setStatus("not_found");
            return;
          }
          if (!res.ok) {
            setStatus("error");
            return;
          }
          const json: ExerciseStrengthResponse = await res.json();
          if (cancelled) return;
          setData(json.strength);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
      return () => {
        cancelled = true;
      };
    },
    [exerciseId],
  );

  useEffect(() => load(whatIfQuery), [load, whatIfQuery]);

  function handleWhatIf(event: React.FormEvent) {
    event.preventDefault();
    const reps = parseDecimalInput(repsDraft);
    const rir = parseDecimalInput(rirDraft);
    if (reps === null || !Number.isInteger(reps) || reps < 1 || reps > 100) {
      setWhatIfError("Enter a whole number of reps between 1 and 100.");
      return;
    }
    if (rir === null || !Number.isInteger(rir) || rir < 0 || rir > 10) {
      setWhatIfError("Enter a whole RIR between 0 and 10.");
      return;
    }
    setWhatIfError(null);
    setWhatIfQuery({ reps, rir });
  }

  if (status === "loading" && !data) {
    return <p className="text-sm text-slate-400">{STRENGTH_PAGE_COPY.loading}</p>;
  }
  if (status === "not_found") {
    return <p className="text-sm text-slate-400">{STRENGTH_PAGE_COPY.notFound}</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-red-400">{STRENGTH_PAGE_COPY.loadFailed}</p>;
  }
  if (!data) return null;

  const { estimate, exercise, observations, whatIf } = data;
  const loadStepKg = exercise.loadStepKg;
  const primaryReason = estimate.reasonCodes[0] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-slate-50">{STRENGTH_PAGE_COPY.heading}</h1>
        <p className="text-sm text-slate-300">{exercise.name}</p>
        {exercise.archivedAt ? (
          <p className="text-xs text-amber-400">
            This exercise is archived. Its history is still shown here.
          </p>
        ) : null}
      </header>

      {/* Current */}
      <section className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
        <span className="text-xs text-slate-400">{STRENGTH_PAGE_COPY.currentLabel}</span>
        {estimate.currentE1rmKg !== null ? (
          <>
            <span className="text-base font-semibold text-slate-50">
              {formatEstimate(estimate.currentE1rmKg, loadStepKg)}
            </span>
            <span className="text-xs text-slate-400">
              {confidenceCopy(estimate.confidence)}
              {primaryReason ? ` · ${reasonCopy(primaryReason)}` : ""}
            </span>
          </>
        ) : (
          <span className="text-sm text-slate-400">
            {primaryReason ? reasonCopy(primaryReason) : STRENGTH_PAGE_COPY.emptyTrend}
          </span>
        )}
        {/*
          The remaining reasons live INSIDE the Current card. Every one of them
          is a property of the pool — "Based on a single set" is a flag of a
          pool observation, not of `best` — and rendering them after the Best
          card put them directly under a date, where they read as a
          qualification of the all-time best (review F-7). The first reason is
          already shown beside the value above, so it is not repeated: every
          reason is disclosed exactly once.
        */}
        {estimate.reasonCodes.length > 1 ? (
          <ul className="flex flex-col gap-1 border-t border-slate-800 pt-2">
            {estimate.reasonCodes.slice(1).map((code) => (
              <li key={code} className="text-xs text-slate-500">
                {reasonCopy(code)}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-slate-500">{STRENGTH_PAGE_COPY.estimateDisclaimer}</p>
      </section>

      {/* Best */}
      {estimate.best ? (
        <section className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
          <span className="text-xs text-slate-400">{STRENGTH_PAGE_COPY.bestLabel}</span>
          <span className="text-base font-semibold text-slate-50">
            {formatEstimate(estimate.best.e1rmKg, loadStepKg)}
          </span>
          <span className="text-xs text-slate-400">
            {formatLocalDate(estimate.best.performedOn)}
            {estimate.best.unconfirmed ? ` · ${reasonCopy("BEST_UNCONFIRMED")}` : ""}
          </span>
        </section>
      ) : null}

      {/* What if */}
      <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
        <h2 className="text-sm font-medium text-slate-200">{STRENGTH_PAGE_COPY.whatIfLabel}</h2>
        {/*
          Every control here is at least 44 px tall — the iOS touch-target
          guideline the rest of the workout surface follows, and which the
          earlier 26 px inputs and 24 px button did not (review F-6). The
          two inputs sit in a grid rather than a flex row so they split the
          column evenly without `min-width: auto` pushing them past
          `max-w-sm`, and the button takes its own full-width row, which is
          what keeps the whole form inside 320 px as well as 390 px. The
          button is a plain element rather than the shared `Button` only
          because it needs no `active:scale` treatment; it copies that
          component's `px-4 py-3 text-base` sizing.
        */}
        <form className="flex flex-col gap-2" onSubmit={handleWhatIf}>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-300">
              {STRENGTH_PAGE_COPY.whatIfRepsLabel}
              <input
                type="text"
                inputMode="numeric"
                aria-label={STRENGTH_PAGE_COPY.whatIfRepsLabel}
                value={repsDraft}
                onChange={(e) => setRepsDraft(sanitizeDecimalDraft(e.target.value))}
                className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-300">
              {STRENGTH_PAGE_COPY.whatIfRirLabel}
              <input
                type="text"
                inputMode="numeric"
                aria-label={STRENGTH_PAGE_COPY.whatIfRirLabel}
                value={rirDraft}
                onChange={(e) => setRirDraft(sanitizeDecimalDraft(e.target.value))}
                className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              />
            </label>
          </div>
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-slate-100 px-4 py-3 text-base font-medium text-slate-900 transition active:scale-[0.98]"
          >
            {STRENGTH_PAGE_COPY.whatIfSubmit}
          </button>
        </form>
        {whatIfError ? (
          <p role="alert" className="text-xs text-red-400">
            {whatIfError}
          </p>
        ) : null}
        {whatIf ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">
              {STRENGTH_PAGE_COPY.whatIfResultLabel} · {whatIf.targetReps} reps @ RIR{" "}
              {whatIf.targetRir}
            </span>
            {whatIf.status === "ok" && whatIf.loadKg !== null && whatIf.bandKg ? (
              <span className="text-base font-semibold text-slate-50">
                {formatTranslatedLoad(whatIf.loadKg, whatIf.bandKg)}
              </span>
            ) : (
              <span className="text-sm text-slate-400">
                {whatIf.reasonCodes[0] ? reasonCopy(whatIf.reasonCodes[0]) : ""}
              </span>
            )}
            {whatIf.reasonCodes.map((code) => (
              <span key={code} className="text-xs text-slate-500">
                {reasonCopy(code)}
              </span>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-slate-500">{STRENGTH_PAGE_COPY.bandNote}</p>
      </section>

      {/* Trend */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-200">{STRENGTH_PAGE_COPY.trendLabel}</h2>
        <Sparkline
          label={STRENGTH_PAGE_COPY.sparklineLabel}
          points={[...observations]
            .reverse()
            .map((o) => ({ performedOn: o.performedOn, e1rmKg: o.e1rmKg, isDeload: o.isDeload }))}
        />
        {observations.length === 0 ? (
          <p className="text-sm text-slate-400">{STRENGTH_PAGE_COPY.emptyTrend}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {observations.map((observation) => (
              <TrendRow
                key={observation.sessionId}
                observation={observation}
                loadStepKg={loadStepKg}
              />
            ))}
          </ul>
        )}
        {estimate.staleObservationCount > 0 ? (
          <p className="text-xs text-slate-500">
            {estimate.staleObservationCount} earlier session
            {estimate.staleObservationCount === 1 ? "" : "s"} fall outside the 90-day window.
          </p>
        ) : null}
        {data.sessionsWithoutEligibleSets > 0 ? (
          <p className="text-xs text-slate-500">
            {data.sessionsWithoutEligibleSets} completed session
            {data.sessionsWithoutEligibleSets === 1 ? "" : "s"} had no eligible sets.
          </p>
        ) : null}
      </section>

      <footer className="flex flex-col gap-1 border-t border-slate-800 pt-3">
        <p className="text-xs text-slate-400">{STRENGTH_PAGE_COPY.freshness}</p>
        {estimate.latestPoolAgeDays !== null ? (
          <p className="text-xs text-slate-400">
            {STRENGTH_PAGE_COPY.latestSessionAgePrefix}{" "}
            {formatSessionAge(estimate.latestPoolAgeDays)}.
          </p>
        ) : null}
        <p className="text-xs text-slate-400">{STRENGTH_PAGE_COPY.unitConvention}</p>
        <p className="text-xs text-slate-400">{STRENGTH_PAGE_COPY.deloadNote}</p>
        <p className="text-xs text-slate-500">
          {STRENGTH_PAGE_COPY.algorithmLabel} {data.algorithm.id} v{data.algorithm.version}
        </p>
        <p className="text-xs text-slate-500">{STRENGTH_PAGE_COPY.footer}</p>
      </footer>
    </div>
  );
}

function TrendRow({
  observation,
  loadStepKg,
}: {
  observation: StrengthObservationDto;
  loadStepKg: number;
}) {
  const excluded = observation.groups.filter((group) => group.status !== "admitted");
  return (
    <li
      className={`flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 ${
        observation.isDeload ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{formatLocalDate(observation.performedOn)}</span>
        {observation.isDeload ? (
          <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">Deload</span>
        ) : null}
      </div>
      <span className="text-sm text-slate-300">
        {formatGoverningSet(
          observation.governingGroupLoadKg,
          observation.governingGroupReps,
          observation.governingGroupMedianRir,
        )}
      </span>
      <span className="text-sm font-medium text-slate-50">
        {formatEstimate(observation.e1rmKg, loadStepKg)}
      </span>
      {excluded.length > 0 ? (
        <span className="text-xs text-slate-500">
          {STRENGTH_PAGE_COPY.excludedGroupsLabel}: {excluded.map(describeGroup).join(" · ")}
        </span>
      ) : null}
      {observation.reasonCodes.map((code) => (
        <span key={code} className="text-xs text-slate-500">
          {reasonCopy(code)}
        </span>
      ))}
    </li>
  );
}

function describeGroup(group: StrengthLoadGroupDto): string {
  return `${formatKg(group.loadKg)} kg × ${group.modalReps} (${group.setCount})`;
}
