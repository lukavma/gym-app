# PI-007 — Recovery check-in completeness and scale clarity: architecture evaluation

**Date:** 2026-09-10
**Revision:** 2 — applies [independent review](recovery-check-in-improvement-architecture-review.md)
(B-1…B-5 blocking, A-1…A-6 advisory). Revision 1 was 2026-09-10, same day.
**Backlog item:** [PI-007](../BACKLOG.md#pi-007) — selected next small product improvement
**Status:** implementation-ready design, pending independent revision verification
**Scope authority:** owner-selected scope, recorded in §1

This is a small, bounded UI/sync change. The document is deliberately short: it records only the
evidence and decisions an implementer and an independent reviewer actually need. No implementation,
database access, commit, push or deployment was performed. The only file written by this task is
this one; the independent review, the workflow-optimization documents and all other concurrent work
are untouched.

§10 maps every review finding to its resolution.

---

## 1. Scope

**In scope (owner-selected):**

1. Optional sleep duration entered, edited and explicitly cleared directly in Today's recovery
   check-in — new entry, existing-entry edit, and the unknown-offline path.
2. Preserved nullable and touched-fields-only semantics: an omitted field stays unchanged, an
   explicit clear writes `null`, and the unknown-offline path still sends only what was touched.
3. Visible soreness terminology renamed to **Muscle soreness**.
4. Visible anchors on that control: `1 = None`, `3 = Moderate`, `5 = Very high`.
5. The stored 1–5 scale is unchanged.

**Explicitly out of scope:** reminders or push ([PI-014](../BACKLOG.md#pi-014)), rest timers
([PI-015](../BACKLOG.md#pi-015)), any readiness or recovery score, any progression-engine input, a
recovery-model change, a UI redesign, and any migration. Recovery stays collection-only
(`domain-model.md` §7, EVIDENCE-027).

**Deliberately not changed although adjacent:**

- **Sleep-quality and readiness get no anchors.** The owner-named anchors
  (`None`/`Moderate`/`Very high`) are soreness semantics and are meaningless for those two.
- **Recovery History's arbitrary-past-date path stays on plain online REST**, as designed
  ([dailyLogs.ts:31-38](../../src/sync/dailyLogs.ts#L31-L38)).
- **Recovery History's validation behaviour is unchanged (B-2 boundary).** Today an out-of-range
  History edit is sent to the server, rejected by `PATCH /api/recovery/{id}` with `400
  invalid_input` ([route.ts:25-31](../../src/app/api/recovery/[id]/route.ts#L25-L31)), and surfaced
  by [RecoveryHistoryList.tsx:138-145](../../src/ui/recovery/RecoveryHistoryList.tsx#L138-L145) as
  the generic **"Save failed."** — the handler maps only `no_metric` specially. That stays exactly
  as it is. The new pre-enqueue guard is required by Today's outbox path, which has no synchronous
  server response at all (§4.1); History has one, so it needs nothing. Giving History an inline
  range message is a reasonable follow-up, but it is **not this slice**, and §6/§8 are written so
  the extraction stays observationally inert for History.

**Concurrent work preserved.** Documentation closeout is running in parallel. `docs/STATUS.md`,
`docs/ROADMAP.md` and `docs/BACKLOG.md` are owned by the designated closeout editor and are **not**
edited by this task or by the implementation task; completed reports under `docs/reviews/` are dated
records and stay unchanged.

**Working-tree observations, dated — not current verification.** At revision 1 (2026-09-10, earlier)
`HEAD` was `355e381` with `CLAUDE.md` and `docs/input/product-ideas.md` modified. At this revision
(2026-09-10, later) `git status` was inspected before and after editing: `HEAD` is `a122855`, with
`CLAUDE.md` modified, `HANDOFF.md` deleted, `docs/BACKLOG.md` and `docs/ROADMAP.md` modified by the
closeout editor, plus the untracked closeout, workflow and review documents. Nothing outside this
file was altered. Neither snapshot should be re-asserted as current at implementation time —
re-inspect then.

---

## 2. Current behavior and the exact missing paths

### 2.1 What exists

Today's card and `/recovery` render the **same** component:
[TodaySection.tsx:333](../../src/ui/today/TodaySection.tsx#L333) and
[RecoveryScreen.tsx:18](../../src/ui/recovery/RecoveryScreen.tsx#L18) both mount
[RecoveryCheckIn.tsx](../../src/ui/recovery/RecoveryCheckIn.tsx). It resolves one of five phases
([RecoveryCheckIn.tsx:25-44](../../src/ui/recovery/RecoveryCheckIn.tsx#L25-L44)): `loading`,
`summary`, `form` (new **or** edit), `unknown-offline`, `unknown-timezone`.

Sleep duration is already **displayed** on Today — the summary line renders `Sleep {n}h` when the
stored value is non-null ([RecoveryCheckIn.tsx:153](../../src/ui/recovery/RecoveryCheckIn.tsx#L153)).
It is only **enterable** from Recovery History's `EditRow`
([RecoveryHistoryList.tsx:159-200](../../src/ui/recovery/RecoveryHistoryList.tsx#L159-L200)), which
uses a plain online `PATCH /api/recovery/{id}`
([RecoveryHistoryList.tsx:127](../../src/ui/recovery/RecoveryHistoryList.tsx#L127)) and therefore
does not work offline. This is exactly the "logging-flow and discoverability gap" PI-007 describes.

### 2.2 The missing paths, precisely

| # | Gap | Evidence |
|---|---|---|
| G-1 | `LogRecoveryTodayInput` has no `sleepHours` key, and `logRecoveryToday` never copies one into the outbox payload. **This is the single wire-level gap.** | [dailyLogs.ts:61-66](../../src/sync/dailyLogs.ts#L61-L66), [dailyLogs.ts:81-85](../../src/sync/dailyLogs.ts#L81-L85) |
| G-2 | The new-entry form renders three sliders and no sleep control. | [RecoveryCheckIn.tsx:289-298](../../src/ui/recovery/RecoveryCheckIn.tsx#L289-L298) |
| G-3 | The edit form renders three nullable sliders and no sleep control; `save()` sends exactly `{sleepQuality, readiness, soreness, note}`. | [RecoveryCheckIn.tsx:245-250](../../src/ui/recovery/RecoveryCheckIn.tsx#L245-L250), [:299-309](../../src/ui/recovery/RecoveryCheckIn.tsx#L299-L309) |
| G-4 | The optimistic post-save entry hard-copies the *old* `sleepHours`, so an edited value could never appear. | [RecoveryCheckIn.tsx:254](../../src/ui/recovery/RecoveryCheckIn.tsx#L254) |
| G-5 | The at-least-one-metric guard treats `entry.sleepHours` as an immutable constant — correct today, wrong the moment the field becomes editable. | [RecoveryCheckIn.tsx:224-231](../../src/ui/recovery/RecoveryCheckIn.tsx#L224-L231) |
| G-6 | `TouchedMetric` covers only the three sliders, so the unknown-offline form cannot carry a touched sleep value. | [RecoveryCheckIn.tsx:369](../../src/ui/recovery/RecoveryCheckIn.tsx#L369), [:387-424](../../src/ui/recovery/RecoveryCheckIn.tsx#L387-L424) |
| G-7 | No anchors exist anywhere: both slider components render the bare integer only. | [RecoveryCheckIn.tsx:494-521](../../src/ui/recovery/RecoveryCheckIn.tsx#L494-L521), [NullableSliderField.tsx:40-77](../../src/ui/recovery/NullableSliderField.tsx#L40-L77) |
| G-8 | "Soreness" appears at **eleven** user-visible strings: seven labels/summaries plus four error messages. | Labels/summaries: `RecoveryCheckIn.tsx:156, 297, 307, 459`; `RecoveryHistoryList.tsx:61, 204`; [metrics/copy.ts:90](../../src/ui/metrics/copy.ts#L90). Errors: `RecoveryCheckIn.tsx:231, 413`; `RecoveryHistoryList.tsx:121, 142` |

**Rename and ambiguity blast radius.** The label prop is also the slider's `aria-label` and drives
the Set/Clear buttons' accessible names (`Set ${label}` / `Clear ${label}`,
[NullableSliderField.tsx:11-38](../../src/ui/recovery/NullableSliderField.tsx#L11-L38)). Renaming
therefore changes accessible names and breaks existing Playwright assertions. Separately — and this
is **not** a rename — adding the sleep-hours control to Today makes two `Sleep hours` locators
ambiguous on `/recovery` for the first time, because that route mounts `RecoveryCheckIn` and
`RecoveryHistoryList` together ([RecoveryScreen.tsx:18-19](../../src/ui/recovery/RecoveryScreen.tsx#L18-L19)).
§6 carries the **complete** inventory of both classes, derived from a full search of `tests/` rather
than from the rename map alone.

---

## 3. Contract sufficiency — verified, no migration

Every layer below the client already carries `sleepHours`. Verified by reading each site
(citations re-checked at `a122855` for this revision):

| Layer | Evidence | Verdict |
|---|---|---|
| Table | `sleep_hours numeric(4,2)`, nullable, `ck … between 0 and 24` at [:39](../../src/db/schema/recoveryEntries.ts#L39), counts toward `ck_recovery_entries_has_metric` at [:43-46](../../src/db/schema/recoveryEntries.ts#L43-L46) — column at [:29](../../src/db/schema/recoveryEntries.ts#L29) | no change |
| Domain schema | `sleepHoursSchema`; `.nullable().optional()` in both the log and update schemas — [recovery/schema.ts:12,47,64](../../src/domain/recovery/schema.ts#L12) | no change |
| Outbox wire schema | `sleepHours: sleepHoursSchema.nullable().optional()` already present in the `.strict()` payload — [sync/schema.ts:219](../../src/domain/sync/schema.ts#L219) | no change |
| Sync apply | `applyRecoveryEntryUpsert` already forwards `payload.sleepHours` to `logRecovery` — [server/sync/service.ts:1411](../../src/server/sync/service.ts#L1411) | no change |
| Service | Presence-aware upsert already handles `sleepHours` in `insertValues` and conditionally in `updateSet` — [server/recovery/service.ts:148,156](../../src/server/recovery/service.ts#L148) | no change |
| DTO / cache | `RecoveryEntryDto.sleepHours`, `RecoveryEntrySnapshot.sleepHours` — [ui/recovery/types.ts:4](../../src/ui/recovery/types.ts#L4), [sync/types.ts:227](../../src/sync/types.ts#L227) | no change |

Because `recoveryEntryUpsertPayloadSchema` is `.strict()` **and already declares the key**, a client
that starts sending `sleepHours` needs no server-side or schema-side coordination at all.

**Measured schema behaviour — observation dated 2026-09-10**, not a standing guarantee. Run in an
isolated Node process against the repository's own `z.number().gte(0).lte(24).multipleOf(0.01)`,
with `zod` **3.25.76** installed (`package.json` declares `^3.24.1`); the independent review
reproduced the same table on the same tree:

```
7 OK · 7.5 OK · 7.25 OK · 7.33 OK · 0 OK · 24 OK
7.333 FAIL not_multiple_of · 7.9999 FAIL not_multiple_of · 24.5 FAIL too_big · -1 FAIL too_small
```

So fractional hours down to a hundredth are accepted; three or more decimals are rejected. `0` is a
legal stored value, which is why every emptiness check must test `=== null`, never falsiness.

> **Conclusion:** no migration, no server change, no API change, no IndexedDB `DB_VERSION` bump
> (`dailyLogCache` is schemaless and already carries the key). The change is confined to
> `src/sync/dailyLogs.ts`, `src/ui/recovery/**`, and one metrics copy string.

---

## 4. Interaction and copy

### 4.1 Sleep-hours control — exact reuse of the delivered History pattern

Reuse `EditRow`'s existing field verbatim, extracted into a shared `SleepHoursField` so the call
sites cannot drift on **labels, draft handling and the Set/Clear affordances**. Validation is
deliberately *not* part of that shared surface — see "ownership" below.

**One rule for draft resolution (B-1).** There is exactly one, and it is the delivered, already
tested one ([RecoveryHistoryList.tsx:184-196](../../src/ui/recovery/RecoveryHistoryList.tsx#L184-L196)):

- **Not set:** `UnsetField` renders `Sleep hours: not set` with a **Set** button. Tapping Set seeds
  `7` / draft `"7"`, the existing History default
  ([RecoveryHistoryList.tsx:163-164](../../src/ui/recovery/RecoveryHistoryList.tsx#L163-L164)).
  Leaving it alone is what "unset" means — nothing is fabricated, satisfying PI-007's "do not
  fabricate a default value".
- **Set:** `type="text"` + `inputMode="decimal"`, `sanitizeDecimalDraft` on change,
  `parseDecimalInput` for the value, with a **Clear** button.
- **An emptied or unparseable draft resolves to `null` = "not set".** The input then unmounts and
  the control reads `Sleep hours: not set`. This is a *clear*, not an error. `type="number"` is not
  used, for the documented iOS comma-decimal reason
  ([decimalInput.ts:1-5](../../src/ui/decimalInput.ts#L1-L5)).
- **The field resets `sleepHoursDraft` to `""` whenever the value resolves to `null`**, so retained
  text can never desynchronise from the visible "not set" state.

*Why the draft reset stays inert for History (B-2):* the only route back to a rendered input is
`onSet`, which already overwrites the draft with `"7"`
([RecoveryHistoryList.tsx:163-164](../../src/ui/recovery/RecoveryHistoryList.tsx#L163-L164)). The
reset is therefore unobservable in History — it forecloses a latent desync rather than changing
behaviour, which is what lets §8 step 2 keep its "inert extraction" claim.

**Pre-enqueue guard — scoped to a value that is actually set.**

```ts
if (sleepHours !== null && (sleepHours > 24 || decimalPlaceCount(sleepHoursDraft) > 2)) {
  // inline error, enqueue nothing
}
```

> `Enter sleep hours between 0 and 24, to at most 2 decimals.`

Deliberately **absent** from the guard:

- `parseDecimalInput(draft) === null` — an unparseable draft is already a clear (rule above), so
  treating it as an error would contradict the rendered state: the control would say **not set**
  while the save complained about the field's contents, with no way to dismiss the error except
  tapping Set and clearing again. This is why `BodyweightQuickLog`'s guard
  ([:28-34](../../src/ui/bodyweight/BodyweightQuickLog.tsx#L28-L34)) does not transfer — bodyweight
  is a mandatory value with no "unset" state; sleep hours is optional and has one.
- `value < 0` — unreachable. `DECIMAL_DRAFT_PATTERN = /[^0-9.,]/g`
  ([decimalInput.ts:7](../../src/ui/decimalInput.ts#L7)) strips `-` inside `sanitizeDecimalDraft`
  ([:11-13](../../src/ui/decimalInput.ts#L11-L13)), so no negative draft can exist.

Reachability of what remains, checked against the render rule:

| Draft | Resolves to | Rendered state | Guard |
|---|---|---|---|
| `25` | `25` | input shown, `25` | **fires** (> 24) |
| `7.333` | `7.333` | input shown | **fires** (`decimalPlaceCount` 3) |
| `7.5`, `0`, `24`, `6.75` | the number | input shown | passes |
| `abc` → sanitized `""` | `null` | `Sleep hours: not set` | not a guard case — a clear |
| `1.2.3` | `null` (`Number` → `NaN`) | `Sleep hours: not set` | not a guard case — a clear |
| `-5` → sanitized `5` | `5` | input shown, `5` | passes; negatives cannot occur |

**Validation ownership (B-2).** The guard lives in **each Today `save()`**, not inside
`SleepHoursField`. One implementation, no drift: `SleepHoursField.tsx` exports a pure
`sleepHoursError(value, draft): string | null` that the three Today forms call and History does not.
The reason the guard exists at all is asymmetric — Today writes through the outbox, which has **no
synchronous server response** to surface at entry time, whereas History's `PATCH` returns `400`
synchronously and already reports it (§1's boundary). `decimalPlaceCount` already exists
([decimalInput.ts:30](../../src/ui/decimalInput.ts#L30)) and the bounds mirror `sleepHoursSchema`
exactly (§3).

**False precision** is addressed by copy and control choice, not by silently rounding the athlete's
input: placeholder `hours`, helper text `e.g. 7.5`, no 0.01 stepper, no minutes field. The typed
value is never quantized.

**Accessible names.** Today's input uses the bare `aria-label="Sleep hours"` (the documented
bare-label convention,
[NullableSliderField.tsx:65-70](../../src/ui/recovery/NullableSliderField.tsx#L65-L70)); History's
keeps its existing `"Edit sleep hours"`. That asymmetry pays for itself immediately: it is why
`phase7Remediation.spec.ts:202` and `:361` — both `getByLabel("Edit sleep hours")` — stay
unambiguous on `/recovery` and need no edit (§6). The Set/Clear **button** names do collide across
the two cards; §6 records the container-scoping rule that resolves it.

### 4.2 Anchors on Muscle soreness

Both `SliderField` and `NullableSliderField` gain an optional `anchors?: [string, string, string]`
prop. When present, a three-cell legend renders beneath the track (`justify-between`, `text-xs`,
muted): `1 · None` / `3 · Moderate` / `5 · Very high`. The legend carries a `useId()` id, and the
range input gets `aria-describedby` pointing at it.

**Hook placement (A-2).** `NullableSliderField` returns `<UnsetField/>` before any hook runs
([:49-51](../../src/ui/recovery/NullableSliderField.tsx#L49-L51)). `useId()` must therefore be
called **above** that early return, or `react-hooks/rules-of-hooks` fails `pnpm lint`.

**Where the legend is actually visible (A-3).** `NullableSliderField` renders `UnsetField` — no
track, no legend — while the value is `null`. So on Today's **edit** form and the **unknown-offline**
form the anchors appear only after **Set** is tapped. They are always visible on the **new-entry**
form, which uses the non-nullable `SliderField`. §7's D-2 asserts against both cases explicitly
rather than assuming the legend is unconditional.

`aria-describedby` rather than `aria-valuetext`: the correct reason is that `aria-valuetext` would
force invented announcements for 2 and 4, which have no anchor. (It does **not** threaten
`getByLabel` — `aria-valuetext` replaces the announced *value*, not the accessible *name*, so
selectors would survive either choice. Revision 1 gave that as the primary rationale; it was wrong,
and the decision is unchanged.)

### 4.3 Rename map

| Site | From | To |
|---|---|---|
| `RecoveryCheckIn.tsx:156` (summary) | `Soreness {n}/5` | `Muscle soreness {n}/5` |
| `RecoveryCheckIn.tsx:297, 307, 459` (labels) | `Soreness` | `Muscle soreness` |
| `RecoveryHistoryList.tsx:61` (row) | ` · Soreness {n}/5` | ` · Muscle soreness {n}/5` |
| `RecoveryHistoryList.tsx:204` (label) | `Soreness` | `Muscle soreness` |
| `RecoveryCheckIn.tsx:231`, `RecoveryHistoryList.tsx:121, 142` | `…readiness, or soreness…` | `…readiness, or muscle soreness…` |
| `RecoveryCheckIn.tsx:413` | `Set at least one of sleep quality, readiness, or soreness first.` | `Set at least one of sleep hours, sleep quality, readiness, or muscle soreness first.` |
| `metrics/copy.ts:90` (column header) | `Soreness` | **unchanged — see below** |
| `metrics/copy.ts:81-82` (caption) | — | append ` The Soreness column is muscle soreness: 1 = none, 3 = moderate, 5 = very high.` |

**The Metrics column header keeps `"Soreness"` (B-5).** PI-007's criterion is qualified — "Rename the
visible metric to **Muscle soreness** *where space permits*" — and space does not permit here. The
metrics dashboard evaluation's own 320 px reference render (a **dated observation from that
document**, `metrics-dashboard-architecture-evaluation.md:463`, not a measurement taken by this
task) already breaks the current headers mid-word to fit five columns:

```
│ Day     Sleep h  Quality  Readi-  Sore-│  5 columns; long headers wrap
```

"Muscle soreness" is roughly 2.3× the header it replaces, in a right-aligned column of ~50 px in a
five-column `w-full` table ([RecoveryCard.tsx:30-48](../../src/ui/metrics/RecoveryCard.tsx#L30-L48)),
and that document's no-abbreviation rule (`:504`) forecloses shortening it. Page-overflow assertions
would not catch the result — a four-line wrapped header passes `scrollWidth <= innerWidth` while
looking broken, and that is all the existing metrics checks measure
([metrics.spec.ts:115-120](../../tests/e2e/metrics.spec.ts#L115-L120)).

PI-007's cross-surface requirement — "the same terminology and interpretation across Today, Recovery
history, and Metrics" — is met by the **caption**, which names the column, gives the term and states
the anchors. Terminology is therefore consistent in prose everywhere; only the space-constrained
column header stays compact, which is exactly what the qualifier licenses. The caption clause clears
every forbidden-token list in `tests/unit/metricsCopy.test.ts`
([:20-58](../../tests/unit/metricsCopy.test.ts#L20-L58)).

Column names, DTO keys, API field names and stored values are untouched. These are labels, not a
rescale.

---

## 5. Data flow

One wire path for every Today write, unchanged in shape: outbox → `POST /api/sync` →
`applyRecoveryEntryUpsert` → `logRecovery` (presence-aware `INSERT … ON CONFLICT DO UPDATE`, keyed on
`(user_id, date)`). Adding one more optional key to that payload changes nothing structural.

| State | Trigger | Sleep-hours rule |
|---|---|---|
| **A — confirmed new** | live `GET /api/recovery/today` returned `null`, or a same-day `dailyLogCache` hit is `null` | **untouched → omit the key; touched → send the resolved value** (number, or `null` if Set-then-cleared) |
| **B — confirmed existing** | Edit tapped from the summary | **always send explicitly**: the number, or `null` when cleared/emptied |
| **C — unknown offline** | no live read and no same-day cache | **touched-only**: omit unless touched; if touched, send the number or `null` |
| **D — unknown timezone** | no account timezone at all | unchanged — no inputs, no save, no sleep field |

**"Touched" is one definition across A and C (A-1).** Tapping **Set**, tapping **Clear**, or editing
the draft all make the field explicit for that save. A field that was set and then cleared before
Save therefore sends `null` — the athlete interacted with it and left it empty, and clearing is the
honest reading of that. Only a field never interacted with is omitted. States A and C consequently
share a single rule for this field, which is simpler than two and removes the gap revision 1 left
open (its state A said only "never set → omit; set → send the number", which classified
set-then-cleared nowhere).

**Why A omits rather than sending `null`.** On a genuine insert the stored outcome is identical
(`insertValues` coerces `undefined` → `null`,
[service.ts:148](../../src/server/recovery/service.ts#L148)). But the "no entry today" read can be
stale — another device may have logged in the interim, or an earlier op for the same day may still be
queued ahead of this one. Omitting preserves in that case; sending `null` would clear. Strictly safer
at zero cost. **§7's A-4 is the criterion that can actually fail if this is got wrong**; A-3 cannot
(§7). The three sliders keep their existing always-send behaviour, unchanged.

**Why B always sends.** This is the rule the card already applies to the other three metrics and the
reason is recorded in place
([RecoveryCheckIn.tsx:237-243](../../src/ui/recovery/RecoveryCheckIn.tsx#L237-L243)): this path only
runs from a confirmed known state. Sleep hours joins that rule rather than inventing a second one.
`savedEntry.sleepHours` must be read from the draft, fixing G-4.

**Why C is touched-only.** `TouchedMetric` widens to `"sleepHours" | "sleepQuality" | "readiness" |
"soreness"`. Untouched → the key is never in the payload → the server leaves whatever the day already
holds exactly as it is. This is the invariant the component's own comment
([RecoveryCheckIn.tsx:371-382](../../src/ui/recovery/RecoveryCheckIn.tsx#L371-L382)) exists to
protect, extended to a fourth field with no change in kind. `hasTouchedMetric`
([:408](../../src/ui/recovery/RecoveryCheckIn.tsx#L408)) gains the new field. Nothing is written to
`dailyLogCache` and no summary is shown from this path — unchanged
([:425-430](../../src/ui/recovery/RecoveryCheckIn.tsx#L425-L430)).

**The unknown-offline "Saved" notice must clear on sleep-hours edits (A-4).** That form resets
`saved` on every other input change — `touch()` at
[:404](../../src/ui/recovery/RecoveryCheckIn.tsx#L404) and the note field at
[:466-469](../../src/ui/recovery/RecoveryCheckIn.tsx#L466-L469). The sleep-hours field must call
`setSaved(false)` identically, or the card can display *"Saved — will finish syncing when back
online."* beside an edit that has not been enqueued.

**Replay and idempotency.** The op is a full presence-aware upsert; re-applying identical values is a
no-op, and the client-generated id is honoured only on first insert
([sync/schema.ts:187-196](../../src/domain/sync/schema.ts#L187-L196)). The existing integration tests
at `syncDailyLogs.integration.test.ts:112` ("only touches the fields present in the payload") and
`:136` ("an explicit null clears a field the caller actually touched") already prove the mechanism;
§6 adds the `sleepHours` instances of both.

**Rejection paths (accepted, not new).**

- *Business rule:* an op whose only touched metric is `sleepHours: null`, applied to a day with no
  other metric, raises `RecoveryEntryHasNoMetricError` (after the documented
  catch-and-retry-as-plain-`UPDATE`), the adapter returns
  `rejected(opId, "recoveryEntry", "no_metric")`, [flush.ts:113](../../src/sync/flush.ts#L113)
  dead-letters it, and `SyncStatusBanner` surfaces `1 change couldn't sync (no_metric)`. This is
  already the behaviour for a clear-only op on any of the three sliders; sleep hours inherits it
  unchanged. No client-side pre-block is added — that would diverge from the sliders, and a
  deliberate offline clear is legitimate.
- *Malformed value:* an out-of-range payload is rejected as `invalid_payload`
  ([server/sync/service.ts:1401-1402](../../src/server/sync/service.ts#L1401-L1402)) and
  dead-lettered. It does **not** `400` the whole batch or poison the queue — the op envelope keeps
  `payload` loose ([sync/schema.ts:51-56](../../src/domain/sync/schema.ts#L51-L56)) — and
  `SyncStatusBanner` does surface the count, so it is **not silent** (revision 1 overstated this as
  "silently dead-letter"). The precise reason the client guard is required is narrower and still
  decisive: there is **no synchronous response at entry time**, so without the guard the athlete
  gets no field-level error at the moment of typing and learns about it only as a sync issue later.

**Known, unchanged limitation.** State B can still overwrite a concurrent other-device write for a
field it explicitly sends. That is pre-existing and deliberate; sleep hours joins the same rule
rather than widening it in kind.

---

## 6. Proposed footprint

### Source — 5 edited, 2 new

| File | Change |
|---|---|
| `src/sync/dailyLogs.ts` | add `sleepHours?: number \| null` to `LogRecoveryTodayInput`; one `if (input.sleepHours !== undefined) payload.sleepHours = …` line (G-1) |
| `src/ui/recovery/SleepHoursField.tsx` **(new)** | the Set/Clear + decimal-draft field extracted from `EditRow`, with an `ariaLabel` prop and the resolve-to-null draft reset (§4.1). Also exports the pure `sleepHoursError(value, draft)` helper — **used by Today's three saves only, not applied internally**, so History's behaviour is unchanged (§1 boundary, B-2) |
| `src/ui/recovery/copy.ts` **(new)** | the shared recovery labels, anchors and error strings — eleven user-visible strings across three files (G-8); the `src/ui/metrics/copy.ts` precedent |
| `src/ui/recovery/NullableSliderField.tsx` | optional `anchors` prop → legend + `aria-describedby`, with `useId()` **above** the early return (A-2) |
| `src/ui/recovery/RecoveryCheckIn.tsx` | sleep field in all three forms; `sleepHoursError` in each `save()`; guard fix (G-5); `savedEntry` fix (G-4); `TouchedMetric` widening (G-6); `setSaved(false)` on sleep edits (A-4); anchors on the local `SliderField`; renames |
| `src/ui/recovery/RecoveryHistoryList.tsx` | use `SleepHoursField` (no validation change); soreness rename + anchors; error copy |
| `src/ui/metrics/copy.ts` | caption clause only — `recoveryColumnSoreness` stays `"Soreness"` (B-5) |

**Unchanged, and asserted so:** `src/db/**`, `drizzle/**`, `src/domain/recovery/**`,
`src/domain/sync/**`, `src/domain/metrics/**`, `src/server/**`, `src/app/api/**`.

### Tests

Derived from a full search of `tests/` for every `Sleep hours` / `sleep hours` locator and every
renamed string — not from the rename map alone (B-3).

| File | Change |
|---|---|
| `tests/unit/dailyLogs.test.ts` | +3: `sleepHours` omitted when `undefined`, sent when a number, sent as `null` when explicitly null; other keys unaffected |
| `tests/unit/recoverySchema.test.ts` | +2: `sleepHoursSchema` accepts `0 / 7.5 / 7.25 / 24`, rejects `-1 / 24.5 / 7.333` — pins the client guard's bounds to the shared schema |
| `tests/integration/syncDailyLogs.integration.test.ts` | +2: a `sleepHours`-only op preserves existing `sleepQuality`/`readiness`/`soreness`; a later `sleepHours: null` clears only that field |
| `tests/e2e/bodyweightRecovery.spec.ts` | rename at `:82, :92, :101`. Verified complete — nothing else in this spec is affected by the new control |
| `tests/e2e/phase7Remediation.spec.ts` | see the itemised table below |
| `tests/e2e/offline-bodyweight-recovery.spec.ts` | +2 (C-1, C-2); C-2 must seed its server-side `sleepQuality 4` **after** `deleteAllRecoveryEntries`, mirroring the existing readiness-only test at [:140-188](../../tests/e2e/offline-bodyweight-recovery.spec.ts#L140-L188) |
| `tests/e2e/recoveryCheckIn.spec.ts` **(new)** | new / edit / clear / stale-read race / validation / anchors / 320 px and 390 px layout |
| `tests/unit/metricsCopy.test.ts` | `:148-150` pins `recoveryCaption` by exact value, so appending the clause breaks it — update. `recoveryColumnSoreness` needs **no** change (B-5). The forbidden-token scan must stay green |

**`phase7Remediation.spec.ts` — complete inventory:**

| Line(s) | Class | Action |
|---|---|---|
| `:137, 148, 156, 258, 285` | rename | `Soreness` → `Muscle soreness` in summary/row assertions |
| `:201, 225, 292` | rename | `Soreness: not set` / `Soreness \d/5` → `Muscle soreness…` |
| `:276-277` | rename | `Clear Soreness` button name |
| `:211` | **rename — was missing in revision 1** | the error regex `/At least one of sleep hours, sleep quality, readiness, or soreness is required/` stops matching once §4.3 renames `RecoveryHistoryList.tsx:121,142` |
| `:322` | rename, inside the `:307` re-aim | `Soreness: not set` → `Muscle soreness: not set` |
| `:368` | **container scoping — a strict-mode break, not a rename** | `page.getByText("Sleep hours: not set")` is unscoped; that test goes to `/recovery` (`:356`) with today un-logged (its fixture is dated `2026-01-06`, `:353`), so the new-entry check-in card renders `Sleep hours: not set` **too** and the locator resolves to two nodes. Scope to the history `li` |
| `:207` | defensive scoping | `Clear Sleep hours` is unambiguous today (Today's new-entry field starts unset, so it renders `Set Sleep hours`), but scope it to the history row so a future seed change cannot silently break it |
| `:202, :361` | **no change** | `getByLabel("Edit sleep hours")` stays unique to History because Today's input uses the bare `aria-label="Sleep hours"` (§4.1) |

**Rule to record in the spec:** on `/recovery`, every assertion touching `Sleep hours: not set`,
`Set Sleep hours` or `Clear Sleep hours` must be container-scoped, because that route mounts the
check-in card and the history list together.

**The `:307` re-aim, assertion by assertion.** Its mechanism changes from *"the card never shows or
sends `sleepHours`"* to *"the card prefills the stored value and sends it back unchanged"*:

- `:317` `Logged today: Sleep 7.5h` — unchanged.
- `:319` Edit tap — unchanged.
- `:320-321` `Sleep quality: not set`, `Readiness: not set` — unchanged.
- `:322` `Soreness: not set` — renamed.
- **new** — assert the sleep-hours input is visible with value `7.5`.
- `:324-325` comment — rewrite; the old rationale ("never shown or edited by this card") is now false.
- `:326-327` unchanged save still yields `Logged today: Sleep 7.5h` — **unchanged, and this remains
  the preservation control.**

### Documents

This task writes only this file. At **implementation** time, the only architecture edit warranted is a
parenthetical on `docs/architecture/domain-model.md` §7's `RecoveryEntry` line recording that
`soreness` is displayed as "Muscle soreness", `1 = none … 5 = very high`, values unchanged.
`data-model.md` §2.19 needs no edit (no column changes). `docs/STATUS.md`, `docs/ROADMAP.md` and
`docs/BACKLOG.md` stay with the closeout editor; completed reports, including the independent review
of this document, stay unchanged.

---

## 7. Acceptance criteria and negative controls

Negative controls are marked **[NC]** — each one fails if the corresponding preservation guarantee
regresses, so a green suite is meaningful rather than vacuous.

**A — new entry and the stale-read race**

- **A-1** (E2E) No entry today: the card shows three sliders at 3 and `Sleep hours: not set`. Saving
  untouched stores `sleep_hours = null` with `sleepQuality/readiness/soreness = 3`.
- **A-2** (E2E) Tap **Set Sleep hours**, enter `7.5`, save → `GET /api/recovery/today` returns
  `sleepHours: 7.5`; the summary reads `Logged today: Sleep 7.5h · …`.
- **A-3** (Unit) `logRecoveryToday({ sleepQuality: 3, readiness: 3, soreness: 3 })` enqueues a
  payload with **no `sleepHours` key**. **Narrow coverage, stated honestly:** this pins the transport
  helper's omit-`undefined` behaviour ([dailyLogs.ts:82-85](../../src/sync/dailyLogs.ts#L82-L85))
  and **passes today unmodified**. It exercises no component, so it cannot fail if the card sends an
  explicit `null`. Keep it as a cheap regression pin on the helper — it is **not** a control for
  §5's state-A rule. A-4 is.
- **A-4** **[NC]** (E2E) **The state-A stale-read race — the control for §5's headline safety rule.**
  Render the card in state A on Today (no entry, `GET` returned `null`). Create the day's row out of
  band: `page.request.post("/api/recovery", { data: { sleepHours: 6 } })`. Save the card **without
  touching any field**. Drain the outbox. Assert `sleepHours` is still **6** and that
  `sleepQuality/readiness/soreness` are **3**. Fails if the card sends an explicit `null` for
  sleep hours; passes only if it omits the key.

**B — existing-entry edit and clear**

- **B-1** **[NC]** (E2E) Entry with `sleepHours 8`, `soreness 2`: open Edit — the field shows `8` —
  save with no change → still `8`, soreness still `2`.
- **B-2** (E2E) Same, change to `6.75` → stored `6.75`; the three 1–5 metrics unchanged.
- **B-3** (E2E) Same, tap **Clear Sleep hours** → `Sleep hours: not set` → save → `sleep_hours` is
  `null` **and** soreness is still `2`.
- **B-4** (E2E) `fill("")` on the field behaves identically to Clear: the input unmounts, the control
  reads `Sleep hours: not set`, and no validation error is shown (§4.1's single rule).
- **B-5** **[NC]** (E2E) Entry whose **only** metric is `sleepHours 8`: on Today's edit path, clearing
  it while all three sliders are "not set" shows
  `At least one of sleep hours, sleep quality, readiness, or muscle soreness is required.` and
  **enqueues nothing** — the G-5 guard fix.

**C — offline and replay**

- **C-1** (E2E offline) Unknown-offline form: touch **only** sleep hours (`Set` → `7.25`), save,
  reconnect, drain → `sleepHours 7.25`, the other three still `null`.
- **C-2** **[NC]** (E2E offline) After `deleteAllRecoveryEntries`, seed today with `sleepQuality 4`
  server-side; clear the daily-log cache, go offline, touch **only** sleep hours, save, reconnect →
  sleep hours stored **and** `sleepQuality` still `4`. The unknown-offline path must never clear a
  value it cannot see.
- **C-3** (Integration) Sequential same-date ops `{sleepQuality: 4}` then `{sleepHours: 7.5}` → both
  present; then `{sleepHours: null}` → sleep hours `null`, `sleepQuality` still `4`.
- **C-4** (Integration) Replaying an identical `{sleepHours: 7.5}` op converges: one row, same value,
  no duplicate.
- **C-5** (E2E offline) A touched-then-cleared sleep-hours-only op on a day with no other metric
  dead-letters as `no_metric` and is **visible** in the sync banner — documents the accepted
  rejection path and proves it is not silent.
- **C-6** (E2E offline) In the unknown-offline form, editing sleep hours after a save clears the
  `Saved — will finish syncing when back online.` notice (A-4).

**D — terminology without rescale**

- **D-1** (E2E) Today and Recovery history render `Muscle soreness`. Assert by **exact text / exact
  label match, not a substring scan** — the replacement string contains the substring `soreness`, so
  a substring assertion cannot distinguish the old label from the new one. On `/metrics`, assert the
  column header is exactly `Soreness` and that the caption contains the muscle-soreness sentence
  (B-5).
- **D-2** (E2E) Anchors: on the **new-entry** form the legend `1 · None` / `3 · Moderate` /
  `5 · Very high` is visible without interaction, and the slider's `aria-describedby` resolves to it.
  On the **edit** form the legend is absent while the metric is `null` and appears after tapping
  **Set Muscle soreness** (A-3 — `UnsetField` renders no track).
- **D-3** **[NC]** (E2E) The soreness input still has `min=1 max=5 step=1`, and a stored `2` renders
  as `2` — labels changed, scale did not.
- **D-4** **[NC]** (Integration) A pre-existing row with `soreness = 1` reads back as `1` through
  `GET /api/recovery`, `GET /api/recovery/today` and the metrics summary — no silent rescale.

**E — validation, layout, regression**

- **E-1** (E2E) `/today`, `/recovery`, `/metrics` at 320×568 and 390×844:
  `document.documentElement.scrollWidth <= innerWidth`; the metrics recovery table still has five
  columns with its existing headers. No rendered-header measurement is required, because B-5 keeps
  the header string unchanged.
- **E-2** (E2E) The field has `inputMode="decimal"` and typing `7,5` stores `7.5`.
- **E-3** **[NC]** (E2E) Both reachable guard cases: `25` and `7.333` each show
  `Enter sleep hours between 0 and 24, to at most 2 decimals.` and **enqueue nothing**. Both keep the
  input rendered (§4.1's reachability table), so the error points at a visible field.
- **E-4** **[NC]** (E2E) Recovery History's out-of-range behaviour is **unchanged**: entering `25` in
  the history edit row and saving still produces the generic `Save failed.` from the server's `400`,
  not the inline message — the §1 boundary, and the evidence that §8 step 2's extraction was inert.
- **E-5** **[NC]** (Boundary) `tests/unit/progressionBoundary.test.ts` stays green — its negative
  control asserts on the `src/ui/recovery` **prefix**
  ([:221-231](../../tests/unit/progressionBoundary.test.ts#L221-L231)), so the two new files under
  that directory neither break nor weaken it.
- **E-6** **[NC]** (E2E) `BodyweightQuickLog`, "Don't ask again", the unknown-timezone phase, and
  `/recovery` history edit/delete behave exactly as before.
- **E-7** Full suite green: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`,
  `pnpm test:e2e:offline`. `pnpm format:check` must be **no worse** than before — the pre-existing
  CRLF condition recorded in earlier reports is to be confirmed unchanged, not newly caused.

iPhone acceptance on the installed PWA remains a separate owner gate, per repository convention.

---

## 8. Implementation plan

1. **Wire gap first.** `src/sync/dailyLogs.ts` + its three unit tests (A-3). Independently verifiable
   before any UI exists.
2. **Extract `SleepHoursField`** from `RecoveryHistoryList`'s `EditRow`. The extraction is
   **observationally inert for History** and is required to stay so: the validation helper is
   exported but not applied internally (§4.1 ownership), and the draft reset is unreachable in
   History because `onSet` already overwrites the draft (§4.1). Re-run `phase7Remediation.spec.ts`
   before building on it; at this step it must pass **with no edits at all**, since neither the
   renames nor the new control exist yet.
3. **Add `anchors`** to `SliderField` / `NullableSliderField`, with `useId()` above the early return.
4. **`RecoveryCheckIn`:** new form, edit form (with the G-4 and G-5 fixes), unknown-offline form
   (G-6 touched widening, A-4 saved-notice reset), and `sleepHoursError` in each `save()`.
5. **Rename** across the recovery UI and the metrics caption; add `src/ui/recovery/copy.ts`.
6. **Test updates in the order of §6's inventory:** the `:368` container scoping and `:207`
   defensive scoping first (they are strict-mode breaks independent of the renames), then the rename
   updates, then the `:307` re-aim, then the new criteria — unit → integration → E2E → offline E2E.
7. **Full suite plus the 320/390 layout pass** (E-1), then hand to independent review; device
   acceptance is a separate owner gate.

No database access, no migration, no server or API edit, no commit, push or deployment.

---

## 9. Open decisions — none blocking

Each has a safe recommended default; the design is implementable as written if none is revisited.
The independent review endorsed all six, with D-4 qualified and D-6's rationale corrected — both
folded in below.

| # | Decision | Recommended default | Alternative |
|---|---|---|---|
| **D-1** | Control shape for fractional hours | **Decimal text field** — exact reuse of the delivered History control and `decimalInput` helpers; zero new input conventions | ± 0.25 stepper (more taps, new pattern); slider (implies a range the domain does not have) |
| **D-2** | Visible field label | **"Sleep hours"** — matches History's shipped label and the summary's `Sleep {n}h`; and the bare-`aria-label` asymmetry it enables keeps two existing locators unambiguous (§4.1) | "Sleep duration" (PI-007's prose) — would require renaming History too, widening the change for no user gain |
| **D-3** | Seed value when **Set** is tapped | **7**, the existing `EditRow` default — identical in kind to every `NullableSliderField` Set seeding `3`; PI-007's "do not fabricate a default" governs the *unset* state, which is preserved | Empty draft — one extra interaction every time, no safety gain |
| **D-4** | Metrics terminology | **Caption clause only; the column header stays `"Soreness"`** — PI-007's "where space permits" qualifier, evaluated against the dated 320 px reference render (§4.3, B-5) | Rename the header and add a rendered-header measurement at 320 px — more test surface for a header the cited evidence already shows at its limit |
| **D-5** | Shared `src/ui/recovery/copy.ts` | **Yes** — eleven user-visible strings across three files; the metrics `copy.ts` precedent exists | Inline strings — cheaper now, drifts later |
| **D-6** | Anchor exposure to assistive tech | **`aria-describedby` on a visible legend** — `aria-valuetext` would force invented announcements for 2 and 4, which have no anchor | `aria-valuetext` — note it would *not* break `getByLabel` (it replaces the announced value, not the name); the decision rests on the announcement problem alone |

No material owner choice blocks the design: the owner's scope already settled the field, the
semantics, the terminology, the anchors and the preserved 1–5 scale; §3 establishes that no schema or
contract question remains open; and every review finding resolved below is a routine engineering
choice inside the accepted scope.

---

## 10. Finding-to-resolution mapping

| Finding | Severity | Resolution | Where |
|---|---|---|---|
| **B-1** contradictory rules for an unparseable draft | HIGH | Single rule kept: empty/unparseable draft → `null` = not set, never an error. Guard scoped to `sleepHours !== null` and to `> 24` / `decimalPlaceCount > 2` only. `parseDecimalInput === null` and `value < 0` dropped — the latter unreachable because `sanitizeDecimalDraft` strips `-`. Draft resets to `""` on resolve-to-null. Reachability table added | §4.1 |
| **B-2** validation ownership; History behaviour | MEDIUM | Guard lives in **each Today `save()`** via an exported-but-not-internally-applied `sleepHoursError`. History's generic `Save failed.` is preserved and documented as an explicit boundary. §6 manifest, §8 step 2's inertness claim and new criterion E-4 reconciled | §1, §4.1, §6, §8, E-4 |
| **B-3** incomplete test inventory | MEDIUM | Full `tests/` search performed. Added `:211` (error copy) and `:368` (**strict-mode ambiguity, not a rename**); added `:207` defensive scoping; recorded that `:202`/`:361` need **no** change; container-scoping rule stated; the `:307` re-aim itemised assertion by assertion including `:320-322` | §2.2, §6 |
| **B-4** A-3 cannot detect the rule it claimed to prove | MEDIUM | New **A-4 [NC]** stale-read race criterion (state A → out-of-band `sleepHours: 6` → untouched save → drain → assert `6` survives and the three metrics are `3`). A-3 kept, relabelled, and its narrower coverage described accurately | §5, A-3, A-4 |
| **B-5** Metrics rename vs "where space permits" | MEDIUM | Header keeps `"Soreness"`; the caption carries the term and the anchors. PI-007's qualifier cited; the 320 px reference render cited as a **dated observation**. D-4, the rename map, the `metricsCopy` manifest entry, D-1 and E-1 all reconciled | §4.3, §6, D-1, D-4, E-1 |
| **A-1** set-then-clear undefined in state A | advisory | One "touched" definition across A and C: Set, Clear or edit makes the field explicit; only never-touched omits | §5 |
| **A-2** `useId()` and the early return | advisory | `useId()` specified above `NullableSliderField`'s `UnsetField` return, or `rules-of-hooks` fails lint | §4.2, §6, §8 step 3 |
| **A-3** anchors invisible while unset | advisory | Documented; D-2 now asserts the always-visible new-entry case **and** the after-**Set** edit case | §4.2, D-2 |
| **A-4** unknown-offline `Saved` notice | advisory | Sleep-hours edits must `setSaved(false)` like `touch()` and the note field; criterion C-6 added | §5, C-6 |
| **A-5** citation drift | advisory | `sync/schema.ts` corrected to **:219**. `metrics/copy.ts` caption pin added to the manifest. G-8's count corrected to **eleven**. Tree snapshots dated rather than re-asserted. **Not adopted:** the review's `recoveryEntries.ts` correction — re-checked at `a122855`, `:39` *is* the sleep-hours range check and `:41` is readiness; revision 1 was right. `ck_recovery_entries_has_metric` refined from `:45` to the more precise `:43-46` | §1, §2.2, §3 |
| **A-6** "silently dead-letter" overstated | advisory | Reworded: the banner does surface a count, so it is not silent; the decisive reason for the guard is the absence of any **synchronous response at entry time**. Batch-poisoning explicitly ruled out | §5 |
| **D-6** rationale error | advisory | Corrected: `aria-valuetext` replaces the announced **value**, not the accessible name, so `getByLabel` survives either way. Decision unchanged, resting on invented announcements for 2 and 4 | §4.2, D-6 |

Two review citations were **not** adopted, having been re-checked against the tree at `a122855`:
`recoveryEntries.ts` line numbers (above), and `decimalInput.ts:85-91` / `:79-83` — that file is 34
lines long, so those ranges do not exist. The review's *substance* on the second point is correct and
is applied: the `-`-stripping happens in `DECIMAL_DRAFT_PATTERN`
([decimalInput.ts:7](../../src/ui/decimalInput.ts#L7)) via `sanitizeDecimalDraft`
([:11-13](../../src/ui/decimalInput.ts#L11-L13)), which is what makes `value < 0` unreachable.

---

READY FOR INDEPENDENT RECOVERY ARCHITECTURE REVISION VERIFICATION
