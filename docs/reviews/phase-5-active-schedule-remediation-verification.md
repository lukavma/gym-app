# Phase 5 — Active-Block Schedule Remediation: Independent Verification

Date: 2026-08-23
Verifier: independent pass over the working-tree remediation described in
[`phase-5-active-schedule-remediation.md`](./phase-5-active-schedule-remediation.md).
Method: the remediation's own report and tests were treated as **claims, not
evidence**. Every behavioural assertion below was re-derived from
independently written probes — 51 service/DB probes through PGlite plus one
real-browser Chromium workflow at a 390×844 iPhone viewport against the local
production build and the Docker PostgreSQL 16 dev database (`gym-app-db-1`).

Nothing in `src/` was modified. During the verification pass itself nothing was
committed, pushed, deployed, or run against production. The two temporary probe
files were deleted after the run; `git status` was byte-for-byte what it was
before this pass began, and the
shared dev block's schedule was restored to its original single rotation
entry (verified by direct `psql` read, §8).

---

## 1. Verdict summary

| Required check | Outcome |
|---|---|
| 1. Lifecycle | ✅ verified independently |
| 2. Schedule invariants | ✅ verified independently (2 LOW defects in issue *paths*/*messages*, not in verdicts) |
| 3. Active-block editor | ✅ verified independently in a real browser at phone size |
| 4. Rotation continuation | ✅ verified independently, incl. 4 edge cases the shipped tests do not cover |
| 5. Block summary | ✅ verified independently |
| Static gates + shipped suites | ✅ all green, reproduced |

**Verdict: READY WITH ACCEPTED RESIDUALS** — findings in §5, residual risks in
§6, dispositions in §9.

The remediation's central behavioural claims are true. The corrected
lifecycle rule, the two-mode schedule validation, the last-performed-template
rotation anchor, the active-block editor, and the L-3 block-summary rewrite
all do what the report says they do, and the shipped tests genuinely exercise
them rather than asserting around them. The residuals are three
report-accuracy inaccuracies, two cosmetic validation-message/path defects
that no UI path can currently reach, and one out-of-scope UX behaviour change
on the block **creation** form. All six were subsequently accepted and closed
out (§9); the three accuracy defects were corrected in the documentation and
one test title, with no change to runtime behaviour.

---

## 2. Gates and suites reproduced

Re-run from a clean working tree after the probe files were removed.

| Gate | Result | Notes |
|---|---|---|
| `pnpm lint` | ✅ exit 0, no output | |
| `pnpm format:check` | ✅ "All matched files use Prettier code style!" | |
| `pnpm typecheck` | ✅ exit 0 | |
| `pnpm typecheck:sw` | ✅ exit 0 | |
| `pnpm test:unit` | ✅ **24 files / 299 tests passed** | matches the report |
| `pnpm test:integration` | ✅ **12 files / 154 tests passed** (79.1s) | matches the report |
| `pnpm test:e2e` | ✅ **13 passed (30.7s)** | matches the report; run against `pnpm build && pnpm start` + Docker PG16 |
| `pnpm build` | ✅ production build succeeds, no new routes | |
| `pnpm exec drizzle-kit check` | ✅ "Everything's fine" | against local Docker PG16 |
| `pnpm db:generate` drift check | ✅ **"No schema changes, nothing to migrate"**; `git status drizzle/` clean | no migration is required — confirmed, not assumed |

One correction to the report's framing: the **integration** suite runs on
PGlite (WASM Postgres, `tests/integration/testDb.ts`), not the Docker
PostgreSQL the report's header implies. The Docker instance is what the e2e
suite, the migration checks, and this verification's browser workflow ran
against. This does not weaken the result — the same migrations produce both
schemas — but the report's provenance sentence is imprecise.

---

## 3. Independent probes — what was actually run

Two throwaway files, written from scratch against the real services:

- `tests/integration/zzVerificationProbe.integration.test.ts` — **51 probes**,
  final run **51 passed**.
- `tests/e2e/zz-verification-probe.spec.ts` — one Chromium workflow at
  `viewport: { width: 390, height: 844 }`, **1 passed**, plus a small
  `zz-create-mode-check.spec.ts` probe for V-6.

Both are archived outside the repository and are **not** part of the change
set being verified.

### 3.1 Lifecycle (required check 1)

| Probe | Result |
|---|---|
| 1.1 `planned` block accepts a schedule edit and a deload edit | ✅ |
| 1.2 `active` block accepts schedule + deload edits, and the rows really land in `block_schedule_entries` (read back by position/template/weekdays) | ✅ |
| 1.3 `completed` **and** `abandoned` reject `schedule`, `deload: {...}` **and** `deload: null` with `BlockScheduleImmutableError`; a non-schedule field (`notes`) is still editable on a finished block | ✅ |
| 1.4 in-progress **and** completed sessions byte-identical after two successive schedule+deload edits | ✅ |
| 1.5 an edit changes only future Today resolution; the in-progress session keeps its own `template_id`/`template_name` | ✅ |

Probe 1.4 is deliberately stronger than the shipped equivalent. Rather than
comparing two selected rows, it dumps **every row of `workout_sessions`,
`session_exercises`, `set_logs` and `recommendations`** to JSON via a single
`json_agg` query, applies a schedule + deload edit, applies a second edit that
switches modes and clears the deload, and asserts string equality of the two
dumps. That covers `updated_at` drift, set logs and pending recommendations —
none of which the shipped test looks at. It passes: the edit path touches
`blocks` and `block_schedule_entries` only.

Corroborating structural evidence: `grep` over `src/` shows
`blockScheduleEntries` is written in exactly one module
([`src/server/blocks/service.ts`](../../src/server/blocks/service.ts)); the
sessions tables carry no FK to `block_schedule_entries` at all
([`src/db/schema/workoutSessions.ts`](../../src/db/schema/workoutSessions.ts)),
so schedule rows being deleted and re-inserted with fresh ids on every edit
cannot reach frozen history.

### 3.2 Schedule invariants (required check 2)

Twelve shapes, each asserted three ways — bare `scheduleInputSchema`, through
`updateBlockSchema`, and through `createBlockSchema` — so a shape cannot be
accepted on one write path and rejected on another:

| Shape | Verdict | Verified |
|---|---|---|
| pure fixed, one weekday per entry | accept | ✅ |
| one entry owning several distinct weekdays (Mon+Thu / Tue+Fri) | accept | ✅ |
| pure rotation | accept | ✅ |
| all 7 days across 7 entries | accept | ✅ |
| mixed (weekday entry first) | reject, `/one schedule mode/` | ✅ |
| mixed (rotation entry first) | reject, `/one schedule mode/` | ✅ |
| overlapping weekday across entries | reject, `"Tuesday is assigned to more than one workout…"` | ✅ |
| duplicate template, fixed | reject, `/scheduled more than once/` | ✅ |
| duplicate template, rotation | reject, `/scheduled more than once/` | ✅ |
| duplicate weekdays inside one entry | reject | ✅ |
| `weekdays: []` (rotation spelled as an empty array) | reject | ✅ |
| empty schedule | reject | ✅ |

**The write boundary cannot be bypassed through direct requests** — verified
against the running production server, not by reading code. Raw
`PATCH /api/blocks/{id}` requests issued outside the UI for *mixed*,
*mixed-reversed*, *overlapping*, *duplicate-template* and *empty-weekdays*
schedules each returned **400 `invalid_input`** carrying the precise message,
and a follow-up `GET` confirmed **nothing was persisted** each time. A
`POST /api/programs/{id}/blocks` with a mixed schedule was rejected
identically. The valid fixed-multi-day and rotation shapes were accepted on
the **already-active** block by raw request. Route coverage is complete:
`createBlockSchema`/`updateBlockSchema` are referenced from exactly two route
files, and `/api/sync`'s entity enum has no block or schedule entity, so there
is no third write path.

Two LOW defects surfaced here — see V-1 and V-2 in §7.

### 3.3 Active-block editor (required check 3)

One real Chromium session at 390×844, driving the shipped UI:

- **Add / remove** — `schedule-add-row` grows the list to four rows;
  `schedule-row-3-remove` removes it again. ✅
- **Retarget** — each row's `<select>` re-pointed to a different template. ✅
- **Reorder** — ↑/↓ move a row; `[A,B,C] → [B,C,A]` verified by reading the
  three selects back, and the boundary buttons are correctly disabled at each
  end. The reorder **persists**: `GET /api/blocks/{id}` returns the new
  position order. ✅
- **Weekdays** — per-row day toggles add and remove days; one row keeps two
  distinct days (`[1, 4]`) through a save/reload round-trip. ✅
- **Active-block banner** — *"Changes apply to workouts from today onward…"* is
  rendered on the active block. ✅
- **Mode switching is explicit and non-lossy** — the key claim, tested
  directly: set days on three rows in Fixed mode → switch to Rotation (pickers
  disappear, nothing saved) → switch back to Fixed → **every previously
  selected day is still `aria-pressed="true"`**. Then, separately, choosing
  Rotation *and saving* does drop the weekdays (`weekdays: null` in the DB),
  confirming the loss happens only on an explicit choice followed by an
  explicit save. ✅
- **Errors are visible and useful on a phone** — an overlapping-weekday save
  renders the error paragraph with the exact text *"Tuesday is assigned to
  more than one workout — each day can only belong to one entry."* Measured,
  not eyeballed: the error's bounding box is `width ≤ 390` and `x ≥ 0`, and
  `document.documentElement.scrollWidth ≤ clientWidth` — the page never
  scrolls sideways at iPhone width. The failed save persisted nothing. ✅
- **Legacy mixed-schedule handling** — reached the only way it can be: by
  connecting to Postgres directly and nulling one entry's `weekdays` behind
  the app's back. On reload the editor shows the amber banner, leaves
  **neither** mode preselected, renders **every** row's weekday picker, and
  leaves the blanked row's seven days all unpressed (nothing auto-picked).
  Saving without resolving the mix is refused with the mixed-mode message.
  `GET /api/today-bundle` still returns 200 on the mixed row (the resolver's
  defensive fallback holds). Correcting it in the UI and saving works. ✅

### 3.4 Rotation continuation (required check 4)

All driven through `buildTodayBundle` against real completed-session rows —
never through the pure resolver alone, so the service's anchor query is under
test too.

| Probe | Result |
|---|---|
| 3.1 no history → first entry | ✅ |
| 3.2 A→B→C→wrap to A | ✅ |
| 3.3 **skipped calendar days never advance rotation** (checked on +1, +4, +9 and +27 days — still B) | ✅ |
| 3.4 in-progress and `discarded` sessions do not advance rotation | ✅ |
| 3.5 **reorder** — `[A,B,C]` with B last-completed → C; reorder to `[C,A,B]` → wraps to C; reorder back → C | ✅ |
| 3.6 **add** — a new entry inserted directly after the anchor becomes next | ✅ |
| 3.7 **remove (non-anchor)** — continuation undisturbed | ✅ |
| 3.8 **remove (anchor)** — deterministic fallback to the **first** entry | ✅ |
| 3.9 **retarget** — swapping the anchor's template away also falls back to the first entry | ✅ |
| 3.10 edge: latest completed session with `template_id = NULL` → restarts at the first entry | ✅ (documented behaviour) |
| 3.11 edge: the anchor is the latest **started** session, not the latest **completed** one | ✅ (documented behaviour) |
| 3.12 edge: a completed session in a *different* block does not anchor this block | ✅ |
| 3.13 switching an active block rotation → fixed weekdays takes effect immediately (incl. `rest` on unassigned days) | ✅ |

Probes 3.5, 3.9, 3.10, 3.11 and 3.12 have no counterpart in the shipped
tests. Note the shipped integration test titled *"advances rotation from the
latest completed template **after reordering**…"* never actually reorders
anything — it adds and removes. The reorder behaviour is nonetheless correct;
the test title overstates its coverage (V-4).

### 3.5 Block summary (required check 5)

| Probe | Result |
|---|---|
| 4.1 removing a template from an **active** schedule keeps its performed exercise; the summary is identical again after the block is completed | ✅ |
| 4.2 retargeting an entry's template leaves the summary (ids, before/after loads) byte-identical | ✅ |
| 4.3 ad-hoc exercises (`source: 'adhoc'`, `prescription: null`) are represented and fall back to the live catalogue name; a skipped slot with no work set is excluded | ✅ |
| 4.4 the frozen snapshot name wins over a later exercise rename (rename applied by direct `UPDATE exercises`) | ✅ |
| 4.5 mid-block rename: the **earliest** performed snapshot's name is used | ✅ (documented behaviour) |
| 4.6 deload and non-completed sessions excluded from the exercise set; `sessionsCompleted`/`hadDeloadSession` still count deloads | ✅ |
| 4.7 an exercise scheduled but never performed is omitted | ✅ |

The snapshot-name preference is the right behaviour and matches the
convention already established for history rendering —
[`src/server/history/service.ts:209`](../../src/server/history/service.ts#L209)
does exactly `prescription?.snapshot.exerciseName ?? nameById.get(...) ?? ""`.
The remediation's citation of "ADR-007 §2" for it is wrong, though (V-3).

---

## 4. Design points confirmed correct

- **The lifecycle rule matches the spec.** `domain-model.md` §9 reads "Block
  config, schedule, deload | yes (future weeks)". The old
  `status !== 'planned'` gate contradicted it; the new
  `completed || abandoned` gate implements it. The pre-remediation comment
  conflated *session* snapshotting with *block* immutability, and the report
  is right to call that out.
- **The rotation anchor change is necessary, not cosmetic.**
  `completedCount % scheduleLength` is only sound while the array length is
  frozen. Once an active schedule is editable, adding one entry re-maps every
  future resolution. Anchoring on the last-performed template is the minimal
  correct fix and needs no new state — confirmed by probes 3.5–3.9.
- **Mode is still inferred from shape; no DB column was added.** Confirmed by
  `drizzle-kit check` + a clean `db:generate`.
- **Reordering offered in both modes** is harmless: probe 3.13 and the browser
  workflow both confirm fixed-mode resolution keys on weekdays only.
- **Overrides untouched.** `blockWeekOverrides.integration.test.ts`'s 8 cases
  re-ran unmodified and green.

---

## 5. Findings

### V-1 (LOW, correctness of a documented contract): Zod issue paths are doubled on every `validateScheduleShape` issue

`validateScheduleShape` hardcodes a leading `"schedule"` segment in each
`ctx.addIssue({ path: [...] })`. When the refinement runs under
`createBlockSchema`/`updateBlockSchema` — the only way the app ever uses it —
Zod prefixes the parent key as well, so the segment appears twice. Recorded
verbatim from the probe:

```
bare_overlap        [["schedule", 1, "weekdays"]]
update_overlap      [["schedule", "schedule", 1, "weekdays"]]
create_overlap      [["schedule", "schedule", 1, "weekdays"]]
update_dup          [["schedule", "schedule", 1, "templateId"]]
update_mixed        [["schedule", "schedule"]]
update_entry_dupdays[["schedule", 0, "weekdays"],           <- scheduleEntryInputSchema, correct
                     ["schedule", "schedule", 0, "weekdays"]] <- validateScheduleShape, doubled
```

The control case in the last row is the proof: the per-entry refinement inside
`scheduleEntryInputSchema`, which does *not* hardcode a prefix, produces the
correct `["schedule", 0, "weekdays"]`.

The remediation report §4 states the path is `["schedule"]` or
`["schedule", index, "weekdays" | "templateId"]` "for future field-level UI if
ever wanted". As shipped, that is not what a caller receives. **No user-visible
impact today** — `BlockForm` maps issues to `i.message` and joins them, never
reading `path`. The fix is one line per `addIssue` (drop the `"schedule"`
prefix); the correct verdicts and messages are unaffected either way.

### V-2 (LOW, message precision): the cross-entry overlap check also fires inside a single entry

A single entry with `weekdays: [1, 1]` produces two issues:

```
'weekdays must not contain duplicates'
'Monday is assigned to more than one workout — each day can only belong to one entry.'
```

The second is misleading — there is only one workout involved. `BlockForm`
de-duplicates by message text and joins, so an athlete would see both
sentences run together. **Unreachable through the UI**: the weekday control is
a toggle, which cannot produce a duplicate day. Only a hand-crafted request can
hit it, and that request is rejected regardless. Cosmetic.

### V-3 (LOW, report accuracy): the ADR-007 §2 citation for snapshot-name preference is wrong

Report §5 justifies preferring the frozen snapshot name as "the existing
stable-identity policy (ADR-007 §2)". ADR-007 §2 actually says the opposite
about names: *"history references `exercise_id` live; renames are safe (same
movement) … No name snapshots needed beyond the one in the prescription
snapshot."* The **behaviour is correct** and consistent with the codebase — the
real precedent is `src/server/history/service.ts:209`, and ADR-007 §1's
"history reads are self-contained" is the applicable clause. Only the citation
needs correcting.

### V-4 (LOW, report/test accuracy): a shipped test's title claims coverage it does not have

`tests/integration/today.integration.test.ts` — *"advances rotation from the
latest completed template **after reordering**, and falls back to the first
entry once that template is removed"* — never reorders. It adds and removes.
Reordering is genuinely correct (independently proven by probe 3.5), so this
is a naming defect, not a behaviour gap. Report §7 repeats the claim.

### V-5 (LOW, defence in depth): `updateBlock` has no schema-independent shape guard

Probe 2.z called `updateBlock` with a mixed schedule constructed to bypass
`scheduleInputSchema`; it persisted without complaint. **Unreachable over
HTTP** — both routes `safeParse` before calling the service, and there are
exactly two such routes — so this is not a live hole. Worth noting only
because the service already re-validates ownership, cross-program templates
and archived templates itself; shape is the one invariant it delegates
entirely to the caller.

### V-6 (LOW, out-of-scope behaviour change): block **creation** now defaults to Rotation with weekday pickers hidden

Measured in the browser on `/programs/{id}/blocks/new`:

```
CREATE-MODE default: fixed=false rotation=true
CREATE-MODE weekday pickers: default=0 afterClickingFixed=1
```

`scheduleMode` initialises to `"rotation"`, and `deriveScheduleMode` only runs
on the edit-load and copy-from-block paths — so plain creation never reaches
it. Before this pass, the create form always showed weekday pickers. The new
behaviour is a defensible "make the mode explicit" design and the toggle sits
directly above the rows, but it is a change to the **creation** path, whereas
the remediation's scope was **editing an active block**. Flagging so it is a
decision rather than a side effect.

### V-7 (informational, dev-hygiene): e2e specs leave archived fixture templates behind

The dev database now holds 12 archived `Upper A`/`Lower A`/`Upper B`/`Lower B`
templates from three prior runs of `active-schedule-edit.spec.ts` (each run
creates four and archives them in `finally`, but never removes them). Local
dev only; no product impact. Mentioned because the count grows monotonically
with every e2e run.

---

## 6. Residual risks

- **Offline stale-plan window (pre-existing family, newly reachable).**
  Schedule edits are online-only REST writes, while `/api/today-bundle` is
  served NetworkFirst (3s) with an IndexedDB `bundleCache` fallback. An
  athlete who edits the schedule and then goes offline before Today refetches
  will start the previously-cached template. This is the same family as the
  already-deferred L-4 and is inherent to the offline-first design — but
  active-schedule editing creates a new way to enter it. Not introduced by a
  defect in this remediation.
- **`assertScheduleTemplatesValid` runs outside `updateBlock`'s transaction**
  (pre-existing, unchanged by this pass): a template archived between the
  check and the insert would slip through. Single-account app; negligible.
- **Rotation anchor ordering** is `started_at desc`, so a session started
  earlier but completed later does not win the anchor (probe 3.11). For a
  single user completing sessions in order this is unobservable; it is a
  policy choice worth being aware of rather than a defect.
- **Mid-block exercise rename** shows the *earliest* performed snapshot name in
  the block summary (probe 4.5). Deterministic and defensible; just not
  specified anywhere.

---

## 7. Scope discipline observed

- Nothing under `src/` was modified during verification; `git status` matches
  its pre-verification state exactly.
- The shared dev block `01a00eb9-6dad-724b-862d-5372ce49b535` was restored to
  its original single rotation entry (`position 0`, `weekdays NULL`), verified
  by direct `psql` read after every browser run. All probe-created templates
  were archived.
- No production access at any point. The verification pass itself committed,
  pushed and deployed nothing; the §9 close-out commit that follows carries
  only documentation and one test description.
- Out-of-scope items in the brief (single-workout moves, occurrence/calendar
  modelling, multi-slot progression scoping, Phase 5.5 taxonomy, unrelated LOW
  findings) were not examined and are untouched.
- M-1a and L-1/L-2/L-4/L-5 remain deferred exactly as previously scoped.

---

## 8. Recommendation

Ship it. The behaviour is correct, the lifecycle now matches
`domain-model.md` §9, and the rotation and block-summary rewrites are sound
under independent probing — including several edge cases the remediation's own
tests do not reach.

---

## 9. Close-out (2026-08-23)

All six LOW residuals **accepted**; no further remediation cycle opened. The
close-out changed documentation and one test *description* only — **no runtime
behaviour, schema, migration, or production data was altered**, and no source
file under `src/` was modified after verification.

| ID | Disposition | What changed |
|---|---|---|
| V-1 | Accepted | Remediation report §4's Zod-`path` claim corrected to state the real, doubled paths, with the measured table. The `addIssue` prefix was **not** touched — that would be a runtime change. |
| V-2 | Accepted | No change; UI-unreachable (the weekday control is a toggle and cannot emit a duplicate day). |
| V-3 | Accepted | Remediation report §5 now cites [`src/server/history/service.ts:209`](../../src/server/history/service.ts#L209) and ADR-007 §1 instead of the inverted ADR-007 §2. |
| V-4 | Accepted | `today.integration.test.ts`'s case renamed to describe what it asserts, with a comment pointing at `todayTemplate.test.ts` for the reorder coverage it had claimed. |
| V-5 | Accepted | No change; HTTP-unreachable — both write routes `safeParse` before calling the service, and there are only two. |
| V-6 | **Accepted with recorded rationale** | Rotation-by-default on the block *creation* form is a deliberate decision, documented in remediation report §6.1: rotation preserves workout order when calendar days are missed (the sequence advances only on a completed session, so a skipped day defers rather than forfeits the workout), while Fixed weekdays stays an explicit one-tap alternative with no data loss either way. |
| V-7 | Informational | No change; local dev DB hygiene only. |

`README.md`'s Playwright/testing documentation was also brought in line with
the current workflow (dependency vs. one-time browser install, Docker Postgres
+ migrations prerequisite, `pnpm build && pnpm start` webServer, Chromium-only
scope, Chromium not replacing manual iPhone/Safari acceptance, no production
database, not part of CI).

§6's residual risks (offline stale-plan window, non-transactional template
check, `started_at` anchor ordering, earliest-snapshot naming) are accepted
and remain documented rather than fixed.

---

**READY WITH ACCEPTED RESIDUALS — CLOSED**
