"use client";

import { useEffect, useState } from "react";
import { userLocalDateString } from "@/domain/time/localDate";
import { getAccountTimezone } from "@/sync/accountTimezone";
import {
  logRecoveryToday,
  getCachedRecoveryToday,
  setCachedRecoveryToday,
  UnknownAccountTimezoneError,
} from "@/sync/dailyLogs";
import { dismissRecoveryCheckInForever } from "./dismissedPreference";
import { NullableSliderField } from "./NullableSliderField";
import type { RecoveryEntryDto } from "./types";

interface RecoveryCheckInProps {
  // Only the Today card offers "dismiss forever" — the dedicated /recovery
  // page always lets the user check in regardless of that preference.
  onDismiss?: () => void;
  onLogged?: (entry: RecoveryEntryDto) => void;
}

const NEUTRAL = 3;

type Phase =
  | { kind: "loading" }
  | { kind: "summary"; entry: RecoveryEntryDto }
  | { kind: "form"; entry: RecoveryEntryDto | null }
  // Phase 8 — offline, and no confirmed same-day read exists yet (neither a
  // live fetch nor a same-day dailyLogCache hit): we genuinely don't know
  // whether today already has an entry. Rendered by
  // RecoveryCheckInUnknownOfflineForm below, which never guesses a full row
  // — see its own comment for why. The account's timezone IS known in this
  // phase (see unknown-timezone below for the strictly worse case) — "today"
  // itself is a settled, correct value; only whether it already has an
  // entry is unknown.
  | { kind: "unknown-offline" }
  // phase-8-review.md B-3 — strictly worse than unknown-offline: this
  // device has no authoritative account timezone at all (never successfully
  // loaded Today, and no network available to ask now), so it cannot even
  // compute which calendar day "today" is. Rendered by
  // RecoveryCheckInUnknownTimezoneForm below, which offers no inputs at all
  // — there is no safe day to write a touched-only merge against either.
  | { kind: "unknown-timezone" };

// phase-7-review.md HIGH-1 — this card used to initialise every slider to a
// hardcoded neutral midpoint and submit wholesale on every save, with no
// idea whether today was already logged. A reload of an already-logged day
// re-prompted with 3/3/3 and one tap on Save replaced real observations
// with synthetic ones. It now reads back GET /api/recovery/today first
// (server-resolved via the user's own timezone — see
// src/server/recovery/service.ts's getTodayRecoveryEntry) and only ever
// shows a blank/neutral form for a day that genuinely has no entry yet. An
// already-logged day renders as a read-only summary of the *actual* stored
// values, with an explicit "Edit" tap required before any slider becomes
// editable — and editing pre-fills from the real entry, never from 3/3/3.
//
// Phase 8 — offline hardening: the GET above can now fail (no connectivity)
// without leaving the card stuck forever ("Couldn't check..." was a
// dead end). A failed fetch falls back to dailyLogCache's last CONFIRMED
// same-day read; only when neither source has an answer does it fall
// through to the unknown-offline form, which is deliberately built so it
// can never fabricate or overwrite a hidden real value (see that
// component's comment).
export function RecoveryCheckIn({ onDismiss, onLogged }: RecoveryCheckInProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // phase-8-review.md B-3 — "today" is the account's timezone, resolved
      // from the cached (or, failing that, freshly fetched) Today bundle,
      // never the device's own zone. If neither source has an answer, we
      // cannot safely compute today's date at all — not even for the
      // touched-only merge form, which still needs to know which day to
      // write to.
      const timezone = await getAccountTimezone();
      if (cancelled) return;
      if (timezone === null) {
        setPhase({ kind: "unknown-timezone" });
        return;
      }
      const today = userLocalDateString(timezone);

      fetch("/api/recovery/today")
        .then((res) => {
          if (!res.ok) throw new Error("request failed");
          return res.json() as Promise<{ entry: RecoveryEntryDto | null }>;
        })
        .then((data) => {
          if (cancelled) return;
          void setCachedRecoveryToday(data.entry?.date ?? today, data.entry);
          setPhase(
            data.entry ? { kind: "summary", entry: data.entry } : { kind: "form", entry: null },
          );
        })
        .catch(() => {
          if (cancelled) return;
          void (async () => {
            const cached = await getCachedRecoveryToday(today);
            if (cancelled) return;
            if (cached === undefined) {
              setPhase({ kind: "unknown-offline" });
            } else {
              setPhase(cached ? { kind: "summary", entry: cached } : { kind: "form", entry: null });
            }
          })();
        });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function dismissForever() {
    dismissRecoveryCheckInForever();
    onDismiss?.();
  }

  const header = (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-slate-50">How are you feeling today?</span>
      {onDismiss && (
        <button type="button" onClick={dismissForever} className="text-xs text-slate-500 underline">
          Don&apos;t ask again
        </button>
      )}
    </div>
  );

  if (phase.kind === "loading") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
        {header}
        <p className="text-xs text-slate-400">Checking today&apos;s entry…</p>
      </div>
    );
  }

  if (phase.kind === "unknown-timezone") {
    return <RecoveryCheckInUnknownTimezoneForm header={header} />;
  }

  if (phase.kind === "unknown-offline") {
    return <RecoveryCheckInUnknownOfflineForm header={header} />;
  }

  if (phase.kind === "summary") {
    const { entry } = phase;
    const parts = [
      entry.sleepHours !== null ? `Sleep ${entry.sleepHours}h` : null,
      entry.sleepQuality !== null ? `Sleep quality ${entry.sleepQuality}/5` : null,
      entry.readiness !== null ? `Readiness ${entry.readiness}/5` : null,
      entry.soreness !== null ? `Soreness ${entry.soreness}/5` : null,
    ].filter((part): part is string => part !== null);

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
        {header}
        <p className="text-sm text-emerald-400">Logged today: {parts.join(" · ")}</p>
        {entry.note && <p className="text-xs text-slate-400">{entry.note}</p>}
        <button
          type="button"
          onClick={() => setPhase({ kind: "form", entry })}
          className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300"
        >
          Edit today&apos;s check-in
        </button>
      </div>
    );
  }

  return (
    <RecoveryCheckInForm
      entry={phase.entry}
      header={header}
      onSaved={(entry) => {
        setPhase({ kind: "summary", entry });
        onLogged?.(entry);
      }}
      onCancel={phase.entry ? () => setPhase({ kind: "summary", entry: phase.entry! }) : undefined}
    />
  );
}

function RecoveryCheckInForm({
  entry,
  header,
  onSaved,
  onCancel,
}: {
  entry: RecoveryEntryDto | null;
  header: React.ReactNode;
  onSaved: (entry: RecoveryEntryDto) => void;
  onCancel?: () => void;
}) {
  const isNew = entry === null;
  // phase-7-remediation-verification.md MEDIUM-2 (recurrence) — a brand-new
  // check-in has nothing to preserve, so defaulting all three sliders to a
  // neutral midpoint is a starting point for a new observation, not a
  // stand-in for one that already exists. Editing an *existing* entry must
  // never coalesce a genuinely null metric to that default — `entry.x` is
  // read exactly as stored (`??` would treat a real `null` the same as
  // "absent" and reintroduce the fabrication bug this is fixing).
  const [sleepQuality, setSleepQuality] = useState<number | null>(
    isNew ? NEUTRAL : entry.sleepQuality,
  );
  const [readiness, setReadiness] = useState<number | null>(isNew ? NEUTRAL : entry.readiness);
  const [soreness, setSoreness] = useState<number | null>(isNew ? NEUTRAL : entry.soreness);
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);

    // Editing an existing entry: `sleepHours` is preserved untouched (this
    // card has no control for it), so "at least one metric" must account
    // for it too — a user could clear every slider this card shows and
    // still leave a perfectly valid row because sleepHours already
    // satisfies ck_recovery_entries_has_metric.
    if (
      !isNew &&
      entry.sleepHours === null &&
      sleepQuality === null &&
      readiness === null &&
      soreness === null
    ) {
      setError("At least one of sleep hours, sleep quality, readiness, or soreness is required.");
      return;
    }

    setSaving(true);
    try {
      // Phase 8 — goes through the offline outbox (src/sync/dailyLogs.ts)
      // instead of fetch(/api/recovery). `sleepQuality`/`readiness`/
      // `soreness`/`note` are always sent explicitly here (never omitted) —
      // same as the pre-Phase-8 behavior this preserves — because this
      // code path only ever runs from a CONFIRMED known state (a live GET,
      // or a same-day dailyLogCache hit), so there's no hidden-row risk to
      // guard against; that guard lives in the unknown-offline form below.
      const noteValue = note.trim() === "" ? null : note.trim();
      const { id: generatedId, date } = await logRecoveryToday({
        sleepQuality,
        readiness,
        soreness,
        note: noteValue,
      });
      const savedEntry: RecoveryEntryDto = {
        id: isNew ? generatedId : entry.id,
        date: isNew ? date : entry.date,
        sleepHours: isNew ? null : entry.sleepHours,
        sleepQuality,
        readiness,
        soreness,
        note: noteValue,
      };
      // phase-8-review.md MEDIUM-3 — dailyLogCache's own contract
      // (src/sync/db.ts) is CONFIRMED state only, never a guess. This op has
      // only been enqueued, not yet applied server-side (the outbox may not
      // even have flushed it yet, offline) — so it is not confirmed, and
      // `id: generatedId` for the isNew case is a speculative client id the
      // server only honors if this row doesn't already exist elsewhere
      // (e.g. logged from another device in the interim). Caching it now
      // would risk stamping a wrong id/state as if verified. `onSaved`
      // still updates THIS component's own in-memory phase immediately —
      // that's the optimistic view, held only for this render lifetime,
      // never persisted as confirmed — and the next successful read (a
      // fresh mount, or reconnect) repopulates the durable cache with the
      // real server-confirmed row.
      onSaved(savedEntry);
    } catch (err) {
      setError(
        err instanceof UnknownAccountTimezoneError
          ? "Can't save yet — this device hasn't learned the account's timezone. Connect online once, then try again."
          : "Couldn't save — try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
      {header}

      {isNew ? (
        <>
          <SliderField
            label="Sleep quality"
            value={sleepQuality ?? NEUTRAL}
            onChange={setSleepQuality}
          />
          <SliderField label="Readiness" value={readiness ?? NEUTRAL} onChange={setReadiness} />
          <SliderField label="Soreness" value={soreness ?? NEUTRAL} onChange={setSoreness} />
        </>
      ) : (
        <>
          <NullableSliderField
            label="Sleep quality"
            value={sleepQuality}
            onChange={setSleepQuality}
          />
          <NullableSliderField label="Readiness" value={readiness} onChange={setReadiness} />
          <NullableSliderField label="Soreness" value={soreness} onChange={setSoreness} />
        </>
      )}

      <input
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
      />

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save check-in"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// phase-8-review.md B-3 — strictly worse than the unknown-offline case
// below: this device has no authoritative account timezone at all, so it
// cannot compute which calendar day "today" even is. Offers no inputs and no
// save action — there is no day it would be safe to write a touched-only
// merge against either, and `logRecoveryToday` would just reject with
// UnknownAccountTimezoneError regardless of what was entered. Resolves on
// its own the next time this component mounts with connectivity (a fresh
// Today bundle fetch caches the account's timezone) or once any other part
// of the app has successfully loaded Today.
function RecoveryCheckInUnknownTimezoneForm({ header }: { header: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
      {header}
      <p className="text-xs text-amber-400">
        Can&apos;t check in yet — this device hasn&apos;t learned the account&apos;s timezone.
        Connect online once (opening Today is enough), then come back.
      </p>
    </div>
  );
}

type TouchedMetric = "sleepQuality" | "readiness" | "soreness";

// Phase 8 — the true offline-cold-start case: no live read, no same-day
// cache. We do not know whether today already has an entry, so we can never
// safely assume either "no entry" (would fabricate a full row of defaults
// on top of real hidden values) or "an entry with these fields null" (would
// silently drop real hidden values by explicitly clearing them). The one
// safe move is to track which fields the user actually *touched* this
// session and send only those — the server's presence-aware upsert
// (logRecovery, src/server/recovery/service.ts) leaves every other field
// exactly as it already is, whatever that turns out to be. This is why
// every slider here is the nullable variant seeded at null (not the
// NEUTRAL=3 default the definitely-new form above uses) — "not set" here
// means "not sent", not "confirmed absent".
function RecoveryCheckInUnknownOfflineForm({ header }: { header: React.ReactNode }) {
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [touched, setTouched] = useState<Record<TouchedMetric, boolean>>({
    sleepQuality: false,
    readiness: false,
    soreness: false,
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function touch<T extends TouchedMetric>(
    metric: T,
    setter: (value: number | null) => void,
  ): (value: number | null) => void {
    return (value) => {
      setTouched((t) => ({ ...t, [metric]: true }));
      setter(value);
      setSaved(false);
    };
  }

  const hasTouchedMetric = touched.sleepQuality || touched.readiness || touched.soreness;

  async function save() {
    setError(null);
    if (!hasTouchedMetric) {
      setError("Set at least one of sleep quality, readiness, or soreness first.");
      return;
    }
    setSaving(true);
    try {
      const noteValue = note.trim();
      await logRecoveryToday({
        ...(touched.sleepQuality ? { sleepQuality } : {}),
        ...(touched.readiness ? { readiness } : {}),
        ...(touched.soreness ? { soreness } : {}),
        ...(noteValue !== "" ? { note: noteValue } : {}),
      });
      // Deliberately not written to dailyLogCache and not surfaced as a
      // confirmed summary — untouched fields may still hold a real value
      // this device can't see yet. The true state becomes visible (and
      // this card switches to the normal summary/edit flow) the next time
      // a read succeeds, online or from that read's own cache write.
      setSaved(true);
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4">
      {header}
      <p className="text-xs text-amber-400">
        Offline — can&apos;t verify today&apos;s check-in yet. Only what you set below will be
        saved; it&apos;ll be merged with today&apos;s entry once you&apos;re back online.
      </p>

      <NullableSliderField
        label="Sleep quality"
        value={sleepQuality}
        onChange={touch("sleepQuality", setSleepQuality)}
      />
      <NullableSliderField
        label="Readiness"
        value={readiness}
        onChange={touch("readiness", setReadiness)}
      />
      <NullableSliderField
        label="Soreness"
        value={soreness}
        onChange={touch("soreness", setSoreness)}
      />

      <input
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
      />

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-xs text-emerald-400">Saved — will finish syncing when back online.</p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save check-in"}
      </button>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-slate-200">{value}</span>
      </span>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-100"
      />
    </label>
  );
}
