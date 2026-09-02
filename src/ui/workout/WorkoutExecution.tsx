"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveSessionStore } from "@/sync/activeSessionStore";
import { ExerciseCard } from "./ExerciseCard";
import { AddAdhocExercise } from "./AddAdhocExercise";
import { WarmupCardForSession } from "./WarmupCard";

interface WorkoutExecutionProps {
  // Supplied only by the offline app shell (src/ui/OfflineShell.tsx), which
  // needs full document navigations rather than client-side router pushes.
  navigate?: (href: string) => void;
}

export function WorkoutExecution({ navigate }: WorkoutExecutionProps) {
  const router = useRouter();
  const go = useCallback(
    (href: string) => (navigate ? navigate(href) : router.push(href)),
    [navigate, router],
  );
  const session = useActiveSessionStore((s) => s.session);
  const hydrated = useActiveSessionStore((s) => s.hydrated);
  const hydrate = useActiveSessionStore((s) => s.hydrate);
  const complete = useActiveSessionStore((s) => s.complete);
  const discard = useActiveSessionStore((s) => s.discard);
  const sessionBlocked = useActiveSessionStore((s) => s.sessionBlocked);
  const setSessionNotes = useActiveSessionStore((s) => s.setSessionNotes);
  const [busy, setBusy] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (session?.notes) setNotesOpen(true);
  }, [session?.id, session?.notes]);

  useEffect(() => {
    if (hydrated && !session) {
      if (navigate) navigate("/today");
      else router.replace("/today");
    }
  }, [hydrated, session, router, navigate]);

  if (!hydrated || !session) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  async function handleComplete() {
    if (!window.confirm("Complete this workout?")) return;
    setBusy(true);
    try {
      await complete();
      go("/today");
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    if (!window.confirm("Discard this workout? This can't be undone.")) return;
    setBusy(true);
    try {
      await discard();
      go("/today");
    } finally {
      setBusy(false);
    }
  }

  const exercises = session.exercises.slice().sort((a, b) => a.position - b.position);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-50">{session.templateName ?? "Workout"}</h1>
        {session.weekIndex !== null && (
          <p className="text-xs text-slate-400">
            Week {session.weekIndex}
            {session.isDeload ? " · deload" : ""}
          </p>
        )}
      </header>

      {/* Finding C — the old copy asserted a cause it cannot know ("it
          conflicts with a session on another device"), which is misleading in
          a single-account app (ADR-004) where the usual cause is that this
          session is no longer in progress server-side. State the fact and the
          consequence instead, including the consequence of discarding: sets
          that never synced are not in History and are lost with it. */}
      {sessionBlocked && (
        <p className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-300">
          The server rejected this workout&apos;s changes, so it can&apos;t sync anymore — usually
          because this session is no longer in progress there. Further changes are disabled.
          Discarding removes it from this device, and anything that never synced won&apos;t appear
          in History.
        </p>
      )}

      {/* Warm-up Routines v1 (evaluation §5) — above the exercises, below
          the header. Renders nothing at all unless this session froze linked
          routines at start, so the screen is byte-identical to before for
          every template that links none. */}
      <WarmupCardForSession session={session} disabled={sessionBlocked} />

      <ul className="flex flex-col gap-3">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            isDeload={session.isDeload}
            disabled={sessionBlocked}
          />
        ))}
      </ul>

      <AddAdhocExercise disabled={sessionBlocked} />

      <div>
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          disabled={sessionBlocked}
          className="text-xs text-slate-500 underline disabled:opacity-50"
        >
          {notesOpen ? "Hide workout notes" : "Add workout notes"}
        </button>
        {notesOpen && (
          <textarea
            defaultValue={session.notes ?? ""}
            disabled={sessionBlocked}
            onBlur={(e) =>
              void setSessionNotes(e.target.value.trim() === "" ? null : e.target.value)
            }
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400 disabled:opacity-50"
            rows={2}
          />
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleComplete}
          disabled={busy || sessionBlocked}
          className="w-full rounded-lg bg-slate-100 px-4 py-3 text-base font-medium text-slate-900 disabled:opacity-50"
        >
          Complete workout
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={busy}
          className="w-full rounded-lg border border-red-800 px-4 py-3 text-base font-medium text-red-300 disabled:opacity-50"
        >
          Discard workout
        </button>
      </div>
    </div>
  );
}
