# Metrics Dashboard — Independent Architecture & Product Evaluation

Date: 2026-09-06 (revised 2026-09-06 against `docs/reviews/metrics-dashboard-architecture-review.md`, verified by `docs/reviews/metrics-dashboard-architecture-revision-verification.md`, then updated for the owner decisions below; revision log at the end)
Role: independent evaluation of a proposed post-MVP feature — a **read-only, mobile-first Metrics Dashboard** over the repository's already-implemented data (workout sessions, bodyweight, recovery, weekly muscle volume, Estimated 1RM Release A) — against the actual repository. Evaluation only — no source, schema, architecture-document, backlog, or review-file changes were made.
Evaluated repository state: `main` @ `1282795` (`feat: add estimated 1rm tracker`, pushed 2026-09-06), plus the pre-existing uncommitted working-tree changes (untouched; listed in Appendix C).
Related inputs: `mvp-scope.md` §2 item 1 ("Analytics dashboard"), `implementation-plan.md` Phase 9, `open-decisions.md` OD-04 / OD-09, ADR-011 (Release A tracker), PI-002 / PI-004 / PI-005 / PI-006 in `docs/input/product-ideas.md` (PI-005 names "add a read-only metrics dashboard from existing data" as the step after the tracker).

---

## Owner decision addendum — 2026-09-06

The owner reviewed this evaluation after its targeted architecture verification returned `VERIFIED — READY FOR OWNER DECISIONS`. The decisions below are **binding for dashboard v1**. They accept the evaluation's recommendations for O-1, O-2, O-4, O-5, O-6, O-9, O-10 and O-11 as written, and **modify O-3, O-7 and O-8**: the Current estimates card no longer lists every exercise with a current estimate automatically; the athlete explicitly selects up to five e1RM-compatible exercises, persisted account-side. §3, §4 (M-4), §6, §7, §9, §11, §12, §13, §14, §15, §16, §18, §19, §20 and §21 were revised for that change; every other verified section stands. Where an earlier passage of this document describes the automatic index, this addendum and the revised sections control.

- **O-1 — Navigation.** Add **Metrics** as a top-level destination after **History**. Keep Volume, Bodyweight and Recovery directly in the navigation. Measure the resulting navigation geometry at the required mobile viewports *before* completing the UI (§12.1); if the additional row pushes Today's primary workout action below the accepted viewport boundary, use the already-defined consolidation fallback rather than improvising a broader navigation redesign.
- **O-2 — Training range.** Eight account-local calendar weeks, one compact line per week.
- **O-3 — Strength exercise selection (owner-modified).** The card does not automatically list every exercise with a current estimate. The athlete explicitly selects up to **five** e1RM-compatible exercises. The selection is persisted account-side and works across devices; has a stable, user-defined order; is never automatically replaced or reordered by recency; affects only dashboard presentation, never e1RM eligibility or computation; may contain an eligible exercise that currently has no estimate, whose stable row then shows a clear "No current estimate" state; retains an already-selected exercise that is subsequently archived, showing the existing Archived badge; cannot newly add an exercise that is e1RM-ineligible or has `strength_estimate = 'off'`; may contain fewer than five exercises; and starts from an explicit empty-state/selection flow rather than silently choosing exercises. No drag-and-drop is required in v1; the simplest accessible way to establish or change the stored order is defined in §9.
- **O-4 — Tonnage.** Excluded from v1. Load semantics for bodyweight, per-hand dumbbell, machine, athletic and cross-exercise comparison are not recorded consistently; revisit only after Athletic Measurement Profiles.
- **O-5 — Recovery averages.** The ordinal 1–5 ratings are never averaged; they are shown as entered. Mean sleep hours is allowed as a ratio quantity and must display its own contributing-entry count.
- **O-6 — Volume landmarks.** Not duplicated on the dashboard. The weekly effective-set comparison is shown with a link to the Volume screen, where ranges and provenance live.
- **O-7 — Archived exercises.** An already-selected archived exercise stays on the dashboard, visibly badged; its history and current-estimate behaviour follow the verified tracker rules; it remains removable from the selection.
- **O-8 — Eligibility and missing-estimate behaviour (owner-modified).** The selection UI offers only exercises structurally compatible with e1RM and not switched off. A selected compatible exercise without sufficient current evidence remains visible with a per-row empty state. The previous global `trainedWithoutEstimateCount` footer and all of its query, DTO, invariant, copy and acceptance-criterion requirements are removed.
- **O-9 — Bodyweight change.** The difference between two seven-day means whose windows are 30 days apart, displaying the contributing-entry count of both means.
- **O-10 — Card order.** Fixed: 1 Current estimates, 2 Training, 3 Weekly volume, 4 Bodyweight, 5 Recovery. The dashboard is intentionally the primary discoverability surface for the e1RM tracker.
- **O-11 — Partial Phase 9.** The dashboard is approved as **Phase 9a**. OD-04 remains open; v1 uses only lightweight inline SVG sparklines, tables and text values. Interactive or general-purpose charts and the charting-library decision come after v1. Tonnage, recommendation statistics, full volume trend charts and History search/filter work remain deferred. The downstream architecture-document edits this requires are recorded as pre-code tasks in §20 step 0.

**Consequence of O-3/O-8 for the "nothing persisted" claim.** Dashboard *metrics* remain computed on read and are never persisted. The dashboard *configuration* — the ordered selection — is the one thing the feature writes: one additive, user-scoped relational table (§11.5, migration `0012`), written by plain online REST like every other definition, never through the outbox, IndexedDB, the service worker, the Today bundle or active-session sync. Every "no migration / no write path" sentence below is to be read with that single, named exception.

---

## 1. Verdict

**Build it — as one read-only metrics screen backed by one composed read-only endpoint, plus the smallest possible persisted selection of which exercises the estimates card shows (O-3), and nothing else.** Every number the dashboard needs is a pure function over tables that already exist (`workout_sessions`, `session_exercises`, `set_logs`, `bodyweight_entries`, `recovery_entries`, `exercises`, `exercise_muscle_contributions`) and over two pure modules that already exist (`src/domain/volume/aggregate.ts`, `src/domain/strength/report.ts`). No persisted aggregate, no cache, no sync-contract change, no Today-bundle change, and no service-worker change is required or justified. The only persistence the feature adds is **configuration, not derivation**: the athlete's ordered selection of up to five exercises for the estimates card (owner decision O-3), one additive user-scoped table with a relational, constraint-checked shape (§11.5) — because a selection that must survive devices and reloads cannot honestly live anywhere else. `data-model.md` §6's sizing (≈ 10k set rows per year) makes "computed on read" not merely acceptable but the only defensible design: a persisted aggregate would add a consistency liability to solve a performance problem that cannot exist at this scale.

The **one piece of truly necessary API work** is a single composed endpoint, `GET /api/metrics` (§11). Two of its five sections cannot be assembled from the existing endpoints at all: weekly session/work-set counts (no endpoint returns them — `/api/history` pages 20–100 sessions and counts warm-ups as sets, `listHistorySessions` in `src/server/history/service.ts`), and the **selected-exercise estimate rows** (the tracker is strictly per-exercise: `GET /api/exercises/[id]/strength` performs an all-time scan for one exercise, `queryFactRows` in `src/server/strength/service.ts`; a dashboard showing up to five selected exercises would issue up to five all-time scans, where one window-bounded, selection-bounded query suffices). The remaining three sections (volume, bodyweight, recovery) are composed server-side into the same response so that one `asOf` instant and one account-timezone "today" govern every card — the client-composition alternative cannot guarantee that across a midnight boundary (§11.4).

The dashboard is also the **discoverable central entry point for strength estimates** the brief asks for: today the tracker is reachable only from a per-row link in the exercise library, from the exercise edit form, and from the workout card of an exercise currently being trained (`src/ui/exercises/ExerciseLibrary.tsx`, `src/ui/exercises/ExerciseForm.tsx`, `src/ui/workout/ExerciseCard.tsx`), i.e. the athlete must already know which exercise to look at, or be mid-workout. The Current estimates card shows the athlete's own selection of up to five e1RM-compatible exercises in a stable, user-defined order — each row a current estimate or an explicit "No current estimate" state — and links each row to its existing detail page (§9, O-3).

The deliberately small v1 (§3) is: **five cards on one screen** — Current estimates (per-exercise current estimate with band and confidence, recommended first — O-10), Training (8 calendar weeks of completed sessions and work sets, one line per week — O-2), Weekly volume (this week vs last week, effective sets per group, reusing the existing volume report unchanged), Bodyweight (latest, 7-day average, 30-day change, 90-day sparkline), Recovery (the last 7 days of the athlete's own check-ins, as entered). No range selectors, no charting library (OD-04 stays open), no tonnage (§10, O-4), no adherence percentage, no recovery averages of ordinal scales, no readiness score, no correlation of anything with anything.

What this evaluation **refuses** on evidence grounds is as important as what it builds: recovery data stays informational and visually separated (EVIDENCE-027, OD-09, §15–§16), no strength value is summed or ranked across exercises (ADR-011 "per-exercise, within-athlete series only"), no partial-week percentage comparisons, and no copy that presents a change in an estimate as a change in the athlete (ADR-011 copy rules, reused verbatim).

Size: **M** (one pure module, two services, three routes, one screen plus one small editor screen, one nav link, one additive migration, tests). Risk: low — the feature's only write path is the selection configuration (plain online REST, its own table), and it touches no execution-fact table, sync schema, engine, or volume code.

Per the repository's convention, nothing in this document is binding until an `## Owner decision addendum — <date>` is inserted at the top of this file recording which recommendations and which O-n answers the owner accepts.

---

## 2. What the repository actually is (evaluation base)

Facts below were verified in source, not taken from the architecture documents.

### 2.1 Data available to a read-only dashboard

| Source | What exists | Read path today | Conventions a dashboard inherits |
| --- | --- | --- | --- |
| `workout_sessions` / `session_exercises` / `set_logs` (`src/db/schema/*.ts`) | `status in (in_progress, completed, discarded)`, `started_at`/`completed_at` (client clock, `timestamptz`), `is_deload`, `template_name`, `week_index` snapshots; per set `is_warmup`, `weight_kg numeric(6,2)`, `reps`, `rir` nullable, `logged_at` | `GET /api/history?limit&before` → `HistorySessionListItem { id, templateName, weekIndex, isDeload, startedAt, completedAt, exerciseCount, setCount, notes }`, `completed` only, default 20 / max 100 per page, ordered `started_at desc` (`src/server/history/service.ts`) | `setCount` counts **all** set rows including warm-ups; date shown by `new Date(startedAt).toLocaleDateString()` in the **device** timezone (`src/ui/history/HistoryList.tsx`) |
| Weekly volume (`src/domain/volume/aggregate.ts`, `src/server/volume/service.ts`) | `WeekVolumeReport { startDate, endDateExclusive, isDeload, leaves: Record<leaf, {effective, raw}>, rollups: { back: {effective, raw, unclassified} } }` | `GET /api/volume` (no parameters) → `{ weeks: WeekVolumeReport[5], activePreset }`; `WEEK_COUNT = 5`, calendar weeks in `users.timezone` starting on `users.week_starts_on`, instants via `localDateToUtcInstant` | Counts every **non-discarded** session's work sets — an in-progress session's already-logged sets count (comment in `queryWorkSetContributionRows`); sets attribute to the week of the session's `started_at`; archived exercises are not filtered; `isDeload` is a per-week display flag ("any counted session flagged") |
| Estimated 1RM Release A (`src/domain/strength/*`, `src/server/strength/service.ts`) | `StrengthReport { eligible, estimate: { currentE1rmKg, best, confidence, reasonCodes, poolSessionIds, poolSpreadPct, latestPoolAgeDays, staleObservationCount, deloadObservationCount, algorithm, asOfLocalDate }, observations, sessionsWithoutEligibleSets, whatIf, algorithm }` | `GET /api/exercises/[id]/strength?asOf&whatIfReps&whatIfRir` → `{ strength: ExerciseStrengthReportDto }` (adds `exercise { id, name, equipment, laterality, loadStepKg, strengthEstimate, archivedAt }`, `asOf`, `asOfLocalDate`, `timezone`); 404 for a foreign or malformed id; **archived exercises are served** (O-15) | One **all-time** query per exercise (`queryFactRows`: no time bound, because `best` is all-time and `staleObservationCount` needs out-of-window rows); `completed` sessions only; window = `performedOn ∈ [asOf − 89, asOf]` in account-local calendar days (`EVIDENCE_WINDOW_DAYS = 90`, `src/domain/strength/estimate.ts`); `performedOn = userLocalDateString(timezone, startedAt)` — the session's start day, "matching the volume convention" |
| `bodyweight_entries` | `date` (account-local day, `uq_bodyweight_day (user_id, date)`), `weight_kg numeric(5,2)` 20–400, `note` | `GET /api/bodyweight` → `{ entries: BodyweightEntryRecord[] }`, **all rows**, `date desc`, no range/limit | Day-keyed; a second log on the same day updates in place; renders `{date}` verbatim (`YYYY-MM-DD`) and `{weightKg} kg` |
| `recovery_entries` | `date`, `sleep_hours numeric(4,2)` 0–24, `sleep_quality` / `readiness` / `soreness` `smallint` 1–5, each nullable, `ck_recovery_entries_has_metric` (≥ 1 metric) | `GET /api/recovery` → `{ entries }`, all rows, `date desc`; `GET /api/recovery/today` | Rendered as "Sleep 7h · Sleep quality 4/5 · Readiness 3/5 · Soreness 2/5", nulls omitted (`src/ui/recovery/RecoveryHistoryList.tsx`); the column is literally named `readiness` and is the athlete's own 1–5 rating — no derived score exists anywhere |
| `exercises` | `equipment` (barbell/dumbbell/machine/cable/bodyweight/other), `mechanics`, `laterality`, `load_step_kg`, `strength_estimate in ('auto','off')` (ADR-011 column), `archived_at` | `GET /api/exercises` with a "Show archived" toggle in the library; detail = the edit form | Archive = soft delete; history and strength never filter `archived_at`; only pickers do |
| `blocks` + `block_week_overrides` | `status`, `start_date`, `weeks_planned`, `deload` config, overrides `type in (deload, custom)` | `GET /api/blocks/[id]/summary` → `{ sessionsCompleted, hadDeloadSession, exercises: {exerciseId, exerciseName, beforeLoadKg, afterLoadKg}[] }` (`getBlockSummary`) | Derived week = `floor((date − startDate)/7) + 1`, computed in the account timezone at the server boundary (`src/domain/scheduling/weekIndex.ts`); `is_deload` is stamped on the session at start (snapshot), which is the only retrospective deload signal a session-level aggregate can rely on |
| `users` | `timezone` (default `Europe/Ljubljana`), `week_starts_on` (0–6, default 1 = Monday) | Read by every server service that buckets by day or week | Same helpers everywhere: `userLocalDateString`, `localDateToUtcInstant` (`src/server/time/userLocalDate.ts`) |

### 2.2 Client and PWA conventions a new read-only screen must follow

- **Fetching:** plain `fetch` in a client component with `useState`/`useEffect`/`useCallback`; there is no TanStack Query provider anywhere in the app despite `implementation-plan.md` §1.2 pinning it (comment in `src/ui/strength/StrengthScreen.tsx`: "no react-query (there is no provider anywhere in this app)"). Loading/error copy is a plain `<p>`: `Loading…` / `Failed to load volume.` (`VolumeScreen.tsx`), `Failed to load the strength estimate.` (`copy.ts`). A refetch keeps the previous data visible (`setStatus((prev) => (prev === "ready" ? "ready" : "loading"))`).
- **Service worker:** every same-origin `/api/*` GET other than `/api/auth/*` and `/api/today-bundle` is `NetworkOnly` (`src/app/sw.ts`, the HIGH-5 entry); HTML/RSC navigations are `NetworkFirst` with 24 h expiry; a cold offline document request falls back to the precached `/~offline` shell. `pwa-offline-strategy.md` §2 classifies "Browse full history, analytics, volume charts" as **online only**.
- **Staleness display precedent:** Today shows `Offline — showing cached data` / `Showing cached data` + ` as of ${new Date(cachedAt).toLocaleString()}` (`src/ui/today/TodaySection.tsx`), driven by the bundle's `generatedAt`.
- **Account timezone on the client:** `src/sync/accountTimezone.ts` caches `TodayBundle.timezone`; the quick-logs refuse to guess the day when it is unknown (phase-8 B-3). A server-composed dashboard never needs it — every day/week label arrives as an account-local `YYYY-MM-DD` string.
- **Date rendering:** account-local date strings are rendered with the no-`Z` parse `new Date(\`${date}T00:00:00\`)` so the day never shifts (`src/ui/strength/format.ts` `formatLocalDate`, `src/ui/volume/volumeDisplay.ts` `formatWeekRangeLabel`). History is the one screen that renders an instant in the device zone (Appendix B, F-4).
- **Visual system:** `max-w-sm` single column; cards `rounded-lg border border-slate-800 bg-slate-900 px-3 py-3`; `h1 text-xl font-semibold text-slate-50`, `h2 text-sm font-medium text-slate-200`; secondary text `text-xs text-slate-400/500`; deload badge `rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300` with the section at `opacity-60`; archived badge `rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400`; controls `min-h-11` (44 px); estimates always through `formatEstimate` → `≈ 140 kg (likely 125–155) est.`.
- **Sparkline precedent:** hand-written inline SVG, `aria-hidden="true"`, with the data also present as text; deload points drawn but not connected (`src/ui/strength/Sparkline.tsx`). OD-04 (charting library) is explicitly left open by it.
- **Navigation:** seven `<Link>`s in a `flex-wrap` row (`src/app/(app)/layout.tsx`), no active-route styling, no sticky behaviour (PI-004 is an open idea). Safe areas are handled once in `globals.css`.
- **Tests:** unit (Vitest, pure), integration (PGlite), e2e (Playwright, Chromium, phone viewport `390×844` in `strengthPage.spec.ts` / `volume.spec.ts`); feature boundaries are proven by import-graph tests with anti-vacuity witnesses (`tests/unit/strengthBoundary.test.ts`, `progressionBoundary.test.ts`), and copy rules by a banned-substring test (`strengthCopy.test.ts`).
- **ESLint layers:** `ui → domain | ui | sync`, `app → domain | ui | sync | app`, `server → domain | db | server`, `api → domain | server | api` (`eslint.config.mjs`). A metrics screen may therefore import the strength formatter and copy map from `@/ui/strength/*`, and a metrics service may call `getWeeklyVolumeReport` and `deriveStrengthReport` directly.

### 2.3 Load-bearing rules from the architecture package

- `architecture-plan.md` §7: "Weekly volume, rolling bodyweight averages, trends, e1RM, block week, completion stats, dashboard highlights — Derived — **no, computed on read**"; `data-model.md` §5 repeats it and adds "persisting them would create consistency liabilities with zero read-performance need at single-user scale".
- `implementation-plan.md` Phase 9: "All read-only derivations — **no new persisted aggregates** (architecture-plan §7 holds)". OD-04 (charting) is to be resolved "at the start of Phase 9"; Release A deliberately did not resolve it.
- EVIDENCE-027: the corpus "does not support any dose-response or prescriptive claims about recovery variables"; safe implication "Do not build recovery-variable features (e.g., 'your sleep affects your gains by X%')". OD-09: readiness-informed anything is evidence-blocked. `mvp-scope.md` F10: bodyweight/recovery are "collected, displayed as simple lists — not consumed by the engine", enforced by `progressionBoundary.test.ts`.
- `evidence-to-design.md` row 15: nothing auto-applies; "compliance scoring" is listed under what is *not* justified.
- ADR-011 / revision §15.2 copy rules (never "1RM"/"max" without "estimated", never "PR", never "recommendation" for a suggestion, never a detraining explanation, never "research shows", never a claim that the number is the athlete's strength); §14.1 archived exercises served; §8.2 windows are freshness rules; N-4 no cross-exercise inference; the bundle-field precedent (§14.3) "**current only** … `best` is served by the detail endpoint only, so the bundle never needs an all-time scan" and "one batched query … bounded by the window start instant".
- `volume-model.md` §4–§5: bands are "reference range", never "target"; frequency may be displayed "as a distribution descriptor, never as a hypertrophy multiplier"; landmarks are heuristic and captioned as such wherever shown.
- `mvp-scope.md` §3 refuses gamification/streaks/badges and nutrition tracking outright.

---

## 3. Scope of v1 and the user flow

### 3.1 In scope

Two routes (`/metrics`, and the small editor `/metrics/exercises`), one nav link **Metrics**, one composed read endpoint `GET /api/metrics`, one configuration endpoint pair `GET`/`PUT /api/metrics/selection`, one pure module `src/domain/metrics/`, two services under `src/server/metrics/`, one UI folder `src/ui/metrics/`, one additive migration (`0012`), tests. Five cards, in this fixed order (O-10):

1. **Current estimates** — the athlete's selected exercises (up to five, stable user-defined order, O-3): per row `≈ value (band) est.`, confidence and age of the most recent counted session, or the row's explicit "No current estimate" / refusal state; each row links to `/exercises/[id]/strength`; a "Choose exercises" link to the editor; an explicit empty state that starts the selection flow. First because it is the only card whose content is not one nav tap away — the feature's stated justification.
2. **Training** — the current calendar week plus the previous seven: completed sessions and work sets per week, one compact line per week (O-2), deload weeks badged.
3. **Weekly volume** — this week (so far) vs last week, effective sets per muscle group (leaves plus the `back` rollup line), only groups with volume in either week; link to `/volume`.
4. **Bodyweight** — latest entry, 7-day average, 30-day change, 90-day sparkline; link to `/bodyweight`.
5. **Recovery** — the last 7 days of check-ins as entered, days logged, mean sleep hours; link to `/recovery`.

Header: "Metrics", the account-local date the numbers are computed for, the timezone and week start, an "Updated HH:MM" line from `generatedAt`, and a **Refresh** control. The metrics screen itself has no other interactive element besides links; the editor screen `/metrics/exercises` is where the selection is changed (§9).

### 3.2 Explicitly excluded from v1 (each with its home in the ledger)

Tonnage (O-4, D-1); adherence / planned-vs-done (X-7); range selectors (D-3); volume landmarks on the dashboard (O-6); recommendation acceptance statistics (D-2); per-muscle frequency (D-12); recovery averages of 1–5 scales (O-5, D-6); any chart beyond an inline SVG sparkline (OD-04, O-11, D-4); anything on Today (D-9); offline availability (D-11); export; automatic or recency-based selection of the estimates card's exercises, drag-and-drop ordering, and any per-card configuration beyond the exercise selection (O-3, N-13, D-16, D-17).

### 3.3 Minimal user flow

1. Athlete opens the installed PWA → Today → taps **Metrics** in the navigation (a new eighth link; on the narrowest phones the existing `flex-wrap` nav may grow to a third row — measured in §12.1; PI-004 territory, unchanged here).
2. `/metrics` renders `Loading…`, then one `GET /api/metrics` populates all five cards at once. Header shows "Updated 07:41 · numbers for Sep 7, 2026 · weeks start Monday · Europe/Ljubljana".
3. **First visit:** the Current estimates card shows its empty state — `No exercises selected. Choose up to five compatible exercises.` — with the **Choose exercises** link. The athlete taps it → `/metrics/exercises`, adds exercises from a list that offers only compatible, non-archived, not-switched-off exercises (§9), orders them with **Move up** / **Move down**, taps **Save** → back on `/metrics` the card shows the selected rows in that order. The selection is stored account-side, so a second device shows the same rows.
4. Athlete taps a row in **Current estimates** (the first card) → the existing `/exercises/[id]/strength` page (current, best, trend, what-if). Back returns to `/metrics`; the App Router re-mounts the client component, so the screen passes through `Loading…` and fetches again (mount fetch — the house behaviour of every read screen). A selected exercise with no counted session in the window shows `No current estimate` in its stable row rather than disappearing.
5. Offline: a cold navigation lands on the existing offline shell's route notice (`/metrics needs a connection. …`); a warm page whose fetch rejects shows `Offline — metrics need a connection.`, or — if it already holds data from this visit — keeps it under `Offline — showing metrics as of 07:41.` Nothing is cached across launches.

The metrics screen writes nothing; the editor's **Save** is the feature's one write (a full replacement of the ordered selection, §11.5). No other settings.

---

## 4. Metric definitions (binding for implementation)

Notation: `asOf` = the server instant at request time; `D` = `asOfLocalDate = userLocalDateString(users.timezone, asOf)`; `W0` = the calendar week window containing `D` (`calendarWeekWindow(D, users.week_starts_on)`), `W1` the previous week, …; instants via `localDateToUtcInstant`. All rounding is to the display precision stated; the DTO carries unrounded numbers except where a rule says otherwise.

| # | Metric | Source rows | Aggregation rule | Range | Null / sparse behaviour |
| --- | --- | --- | --- | --- | --- |
| M-1 | Sessions per week | `workout_sessions` with `status = 'completed'`, `started_at ∈ [Wk.start, Wk.end)` **and** `started_at < instant(D + 1)` (the current window ends up to six days after `D`; a clock-skewed session dated tomorrow must not count as done). This future guard is **tracker parity** (the estimate pipeline drops observations after `asOf`), and a **deliberate divergence from Volume**, which has no such guard — disclosed in §8 and R-1, asserted by A-2 | count | `W0…W7` (8 windows, `[P]`) | A week with no sessions is `0`, never omitted; the current week is labelled "(so far)" |
| M-2 | Work sets per week | every `set_logs` row of a session that qualifies for M-1, delivered to the domain as `{ sessionId, isWarmup }` rows; the domain drops `isWarmup = true` and counts (the `aggregateVolume` precedent — the query never filters or counts warm-ups) | count | as M-1 | `0` when no sessions; in-progress sessions are **not** counted here (they are in M-5 — the existing volume convention; the difference is disclosed in the card caption and §8) |
| M-3 | Week deload flag | sessions counted in M-1 | `any(is_deload)` | as M-1 | false when no sessions |
| M-4 | Current-estimate row, one per **selected** exercise (O-3) | the athlete's stored selection (`dashboard_estimate_selections`, §11.5) joined to `exercises`; for each selected exercise its completed sessions with `started_at ∈ [instant(D − 89), instant(D + 1))` and their sets | `deriveStrengthReport({ exercise, sessions, asOfLocalDate: D })` per selected exercise, then project **only** `eligible`, the eligibility refusal code when `eligible = false`, `estimate.currentE1rmKg`, `estimate.confidence`, `estimate.latestPoolAgeDays`, `loadStepKg`, `archivedAt`; rows in the **stored `position` order** — never sorted by name, value or recency | 90 calendar days in the account timezone (the tracker's own `EVIDENCE_WINDOW_DAYS`) | Every selected exercise is a row, always. Row states: **estimate** (`currentE1rmKg !== null`); **no current estimate** (eligible, nothing counted in the window — only deload sessions, only excluded sets, or no sessions at all); **not available** (equipment later changed to bodyweight/other — `EXERCISE_CATEGORY_UNSUPPORTED`); **turned off** (`strength_estimate` later set to `'off'` — `EXERCISE_ESTIMATE_DISABLED`); each with the Archived badge when `archivedAt` is set (O-7). No selection → the card's selection empty state (§6). `best`, `staleObservationCount` and reason codes other than the eligibility refusal are **not** projected — with a window-bounded input they would be wrong (§11.2). The selection affects presentation only: the values are identical to the detail page's for the same rows (A-9) |
| M-5 | Effective sets per muscle group, this week and last week | the existing `getWeeklyVolumeReport` output, unchanged | `weeks[0]` and `weeks[1]` of the existing 5-week report; `leaves[g].effective` and `rollups.back.effective` (+ `unclassified` shown when non-zero) | `W0`, `W1` — the DTO carries **exactly these two weeks** (`weeks.slice(0, 2)`, the one authoritative shape; §11.1, A-11); `raw` travels but is not rendered (R-1) | Groups with `0` in both weeks are hidden; if every group is `0` the card says `No work sets this week or last week.`; `weeks[k].isDeload` badges the column header |
| M-6 | Bodyweight — latest | `bodyweight_entries` with `date ∈ [D − 89, D]` | max `date` | 90 days `[P]` — deliberately not all-time, so the card never reads beyond its own window; an entry older than 90 days is the Bodyweight screen's business | `null` → `No bodyweight logged in the last 90 days.` and the "Bodyweight log" link (a disclosed convention difference from `/bodyweight`, which lists everything — R-1; no count of older entries is fetched, RL-8) |
| M-7 | Bodyweight — 7-day average | entries with `date ∈ [D − 6, D]` | arithmetic mean of `weight_kg`, rounded to 0.1 kg; DTO carries `entryCount` | 7 days `[P]` | requires `entryCount ≥ 3` (`[P]`, a coverage floor, calibrated to nothing), else `null` rendered as `— (n of 7 days logged)` |
| M-8 | Bodyweight — 30-day change | M-7 minus the same mean over `date ∈ [D − 36, D − 30]` | difference, signed, rounded to 0.1 kg; DTO carries **both** entry counts and the display prints them (`(5 of 7 vs 6 of 7 days)`), labelled "change of 7-day averages, 30 days apart" — never "trend" | two 7-day windows 30 days apart (`30` is `[P]`) | `null` unless both windows have `≥ 3` entries; rendered `—` |
| M-9 | Bodyweight — 90-day series | entries with `date ∈ [D − 89, D]`, ascending | none (points as logged) | 90 days `[P]` | Sparkline draws **points only** at each entry's day index — no connecting line, so a gap is empty space rather than a segment that reads as interpolation; fewer than 2 entries → no sparkline. Text alternative prints the series' first, latest, lowest and highest values (§13) |
| M-10 | Recovery — last 7 days | `recovery_entries` with `date ∈ [D − 6, D]` | none (values as entered) | 7 days `[P]` | a day without an entry is a row of `—`; a null metric is `—` |
| M-11 | Recovery — days logged | rows of M-10 | count of rows with any entry | 7 days | `0 of 7` |
| M-12 | Recovery — mean sleep hours | rows of M-10 with `sleep_hours` non-null | arithmetic mean rounded to 0.1 h; DTO carries **its own** count, which the display prints (`mean sleep 7.1 h (2 of 7 days)`) — this count differs from M-11 whenever a check-in logs only ratings, the app's common shape | 7 days | `null` when no row has `sleep_hours` → line hidden |

Every window length and threshold above (8 weeks, 90 / 7 / 30 days, `≥ 3` entries) is a `[P]` product convention in ADR-011's labelling vocabulary — a data-coverage rule, calibrated to nothing physiological.

Rules that apply to every row above:

- **Only `user_id`, `status` and the time bounds are decided in SQL** for M-1/M-2/M-4; warm-up exclusion and the work-set count (M-2), eligibility and admissibility (M-4) and week/day bucketing are pure-domain decisions, provable by fixture (the volume and strength precedents: "filtered here (not by the caller) so the Work Set definition is a domain behavior"). §11.2 step 3 therefore projects rows, never a predicate on `is_warmup` and never a `count(*)`.
- **Discarded sessions never count** anywhere (domain-model §7).
- **Archived exercises count** in M-1/M-2/M-5 exactly as today (history and volume are archive-agnostic), and appear in M-4 **only when selected** (O-3/O-7), badged `Archived`, in whichever row state their facts give (§7, A-8).
- **No metric combines two sources.** Nothing divides, correlates, or overlays M-10–M-12 with M-1–M-9 (§16 I-7).
- **Future-dated rows are ignored by Training, Strength, Bodyweight and Recovery** — the tracker's I-6 principle ("observations after `asOf` contribute to nothing") applied to every section the dashboard computes itself. **Volume is the exception by design:** `getWeeklyVolumeReport` is reused unchanged and has no upper bound relative to today (its current-week window runs to the week's end), so a completed session dated tomorrow appears in the Volume card and not in the Training row. This is the intentional divergence §8 and R-1 disclose and A-2 asserts. Such rows can exist: `dateOnlySchema` (`src/domain/bodyweight/schema.ts`) validates a calendar date but not that it is in the past, and `POST /api/bodyweight` / `POST /api/recovery` accept an explicit `date`.

---

## 5. Time ranges and account-timezone semantics

- **One clock.** The service computes `asOf` once, derives `D`, and passes `D` and the instant windows into every section, so all five cards describe the same account-local "today" even if the request straddles midnight in the account timezone. This is the decisive argument for server composition over five client fetches (§11.4).
- **Calendar weeks**, not block weeks, anchored on `users.week_starts_on` — the "dashboard" mode `volume-model.md` §2 already names. Block weeks stay on the block screen; the dashboard does not need a block to exist. (No history DTO carries `blockId` and no endpoint lists a user's blocks across programs, so block-week labelling is not available from the read surface anyway — and is not needed.)
- **No settings surface exists** for either column: `users.timezone` and `users.week_starts_on` are column defaults (`Europe/Ljubljana`, Monday) that nothing in the application writes — no setup step, route, UI, or seed touches them (`volume-model.md` §2's "week starts Monday (setting)" is aspirational; `docs/reviews/mvp-v1-independent-review.md` records "No settings screen"). The dashboard reads them exactly as volume does and adds no settings UI (N-1).
- **Sessions attribute to the account-local day of `started_at`** (M-1/M-2/M-4), exactly as volume and the tracker do today. A session spanning midnight stays in its start week. PI-002 (editable training date) would change this rule for every consumer at once; this dashboard is one more consumer to add to PI-002's audit list (Appendix B, F-9). The dashboard must not invent its own date rule (e.g. "day of the last work set") in the meantime — that would make Metrics disagree with History and Volume.
- **Bodyweight and recovery are already day-keyed** in the account timezone at write time (`logBodyweight` / `logRecovery` resolve `userLocalDateString`; the offline path caches `TodayBundle.timezone`). The dashboard compares `date` strings to `D` with no conversion.
- **DST:** week windows are seven calendar days; their instants come from the existing two-pass `localDateToUtcInstant`, which handles the offset change; a week containing a transition is 167 or 169 hours and that is correct.
- **Timezone change:** if `users.timezone` is ever edited, every bucket is reinterpreted on the next read and facts are untouched — the same "interpretation layer" policy as contribution weights (`volume-model.md` §3). No migration, no backfill.
- **Client rendering:** every date in the DTO is an account-local `YYYY-MM-DD` string or a UTC instant. Day and week labels use the no-`Z` parse (`formatLocalDate`, `formatWeekRangeLabel`); only `generatedAt` is rendered as a local time-of-day ("Updated 07:41"), because it is an instant. The header states the timezone and week start explicitly so a traveller sees why "today" may differ from the phone's calendar.
- **`asOf` is not a query parameter in v1.** The service takes `now: Date` (the volume/strength pattern) so integration tests pin it; the route always uses server now. Adding `?asOf=` later is additive (the strength route's clamp-to-now rule would apply).

---

## 6. Sparse and null data

- **New account / empty tables:** every card renders its own empty copy; no card fabricates zeros for bodyweight or recovery; Training shows eight weeks of `0 sessions · 0 work sets` because the calendar exists even when training does not.
- **Weeks with no sessions** (holiday, illness): `0`, listed, un-badged. No "streak broken" language (mvp-scope §3).
- **Partial current week:** always labelled "(so far)"; no percentage or arrow compares it with a full week (§10).
- **Bodyweight gaps:** the sparkline spaces points by day, so a 10-day gap is visible; the 7-day average needs three entries to exist and always prints its count; the 30-day change needs both windows.
- **Recovery gaps and nulls:** a day row of `—`; a null metric cell of `—`; never a default value (the phase-7 MEDIUM-2 lesson: fabricated `3`s).
- **Strength (selected rows never disappear):** a selected exercise without a current estimate keeps its stable row and shows `No current estimate` (the detail page explains why — the codes live there); a selected exercise that later became structurally ineligible or switched off shows the tracker's own refusal line (`Not available for this equipment type` / `Strength estimate turned off for this exercise`, reused from `@/ui/strength/copy`) and stays removable in the editor. There is no global count of unlisted exercises (O-8). **Empty state** (no selection — every first visit): `No exercises selected. Choose up to five compatible exercises.` followed by the **Choose exercises** link; the disclaimer footer is still rendered. **Editor empty candidate list** (no compatible exercise exists at all): `No compatible exercises yet. Estimates are available for barbell, dumbbell, cable and machine exercises.`
- **Volume:** groups with zero in both weeks are hidden to keep the card short; the `Back` reconciliation line appears only when `back.effective > 0` and shows `Unclassified Back` only when non-zero (the Volume screen's rule).
- **Session with no sets** (completed with zero logged sets): counts as a session in M-1 with `0` work sets — a fact, not an anomaly.

---

## 7. Archived exercises

- **Counts:** archived exercises' historical sets count in Training and Volume exactly as they do on the Volume screen today (`queryWorkSetContributionRows` does not filter `archived_at`). Archiving is a picker-visibility decision, not a history edit (F2 acceptance in `mvp-scope.md`).
- **Current estimates (O-7):** an already-selected exercise that is subsequently archived **stays** in the selection and on the card, with the library's `Archived` badge; its row keeps following the tracker's rules (the detail page serves archived exercises, ADR-011 O-15, and already says `This exercise is archived. Its history is still shown here.`), so it shows an estimate while its window holds counted sessions and `No current estimate` afterwards. It is removable in the editor. The editor's candidate list **never offers** an archived exercise (archive = picker visibility, the F2 rule), and the write contract rejects an archived exercise that is not already in the stored selection (§11.5). Un-archiving simply makes it offerable again; nothing on the selection changes.
- **Names:** the card shows the exercise's **current** name (identity policy, `domain-model.md` §3), matching the library and the detail page. Training/Volume never show exercise names.
- **Never un-archived by the dashboard:** neither screen can change `archived_at`, `strength_estimate`, or any exercise column; the editor writes only selection rows (§16 I-1).

---

## 8. Deload presentation

- **Signal:** `workout_sessions.is_deload`, stamped at session start (snapshot); no reader re-derives deload status from block config or week overrides, and the dashboard must not start.
- **Two meanings of one badge, both disclosed.** The word "Deload" appears on two cards with two definitions, because the two cards inherit two conventions: the Training row's badge (M-3) means *a completed session counted in this week, dated no later than today, was flagged*; the Volume column's badge (`WeekVolumeReport.isDeload`) means *a work-set contribution row of any non-discarded session in this week — in-progress or future-dated included — was flagged*. They agree in every ordinary week and diverge in exactly these cases, each of which A-2/A-11 fix with a fixture:
  - a **deload session with no work sets** (or only exercises without contribution rows) badges Training, not Volume;
  - an **in-progress deload session** — which can be arbitrarily old, since `uq_sessions_one_in_progress` permits one long-lived row — badges Volume (and adds its sets to Volume's numbers), not Training, in whichever week its `started_at` falls;
  - a **completed deload session dated after today** badges Volume, not Training (the future guard, M-1).
  The shared word is kept deliberately: a second label ("Deload (logged)" vs "Deload (planned)") would need explaining on a card that has no room for it, and the Training caption "Completed workouts only." already names the rule that produces every one of the three cases. The Volume caption gains "Includes the workout in progress." so both conventions are stated on the screen.
- **Training and Volume:** the week row / column header carries the existing badge (`Deload`, amber) and the row is de-emphasised (`opacity-60`), and the numbers stay — "deload weeks render with a badge and are visually de-emphasized in trend charts, not excluded (they happened)" (`volume-model.md` §2).
- **Strength:** the tracker already excludes deload observations from `current` by construction; the index inherits that. The card shows no sessions, so the tracker's `deloadNote` ("Deload sessions are **shown** but not counted. A dip after one is expected.") would be false on this screen in its first clause and referent-less in its second — there is no series, delta or arrow on the card for a "dip" to be seen in (RL-9). The card therefore carries the metrics-owned sentence `Deload sessions are not counted.` and nothing more; the evidence-backed dip sentence stays on the detail page, where the trend actually is.
- **Bodyweight / Recovery:** no deload notion; nothing is annotated.
- **What is not built:** no "recovery from deload" narrative, no comparison of the week after a deload against the week before, no reduced-volume-style vs cessation distinction (GAP-05).

---

## 9. The strength entry point (discoverability)

Today's discovery paths to the tracker are per-exercise: Exercises → row → "Strength estimate", the edit form's "View strength estimate", and the workout card's link while that exercise is being logged. None gives the athlete a place where *their* lifts are visible together. The dashboard adds a central, athlete-curated path (O-3, O-10):

- The **Current estimates** card (the heading itself carries the word "Current", so a row can never be read as a best — R-6) shows the athlete's selected exercises — at most five, in the stored order, never re-sorted — one row per exercise: name (+ `Archived` badge), then either `≈ 140 kg (likely 125–155) est.` via the existing `formatEstimate` (grid + band, never a bare number) with `high confidence · 3 days ago` via `formatSessionAge(latestPoolAgeDays)`, or the row's state line (`No current estimate`, or the reused refusal copy for a now-ineligible / switched-off exercise). The row is one `<Link>` of at least 44 px height to `/exercises/[id]/strength`.
- A card-level link **Choose exercises** goes to the editor `/metrics/exercises`; the library keeps its per-row strength links (unchanged), and the nav keeps its Exercises link, so nothing selectable is unreachable.
- **The editor** (`src/ui/metrics/SelectionEditor.tsx`, route `src/app/(app)/metrics/exercises/page.tsx`) is the simplest accessible ordering UI without drag-and-drop: an ordered list of the selected exercises, each row with three ≥ 44 px buttons — **Move up**, **Move down**, **Remove** (accessible names `Move <name> up` etc., disabled at the ends and announced as such); below it a native `<select>` of candidates (compatible, not switched off, not archived, not already selected — supplied by the server, §11.5) with an **Add** button, disabled with the message `Five exercises is the limit.` once five are listed; a **Save** button that submits the whole ordered list as one replacement (§11.5) and returns to `/metrics`; a **Cancel** link. Position is the list index after Save — there is no separate "position" input. Every state change before Save is local component state; nothing is written until Save.
- The card footer renders, in this order: `STRENGTH_PAGE_COPY.freshness` ("Based on the last 90 days of training."), `estimateDisclaimer` ("An estimate from your logged sets, not a measured value. Treat a change as a change in the estimate."), `bandNote` ("The range is a ±10 % convention, not a measured error."), a metrics-owned unit line adapted from `unitConvention` for a multi-exercise list ("In the numbers you log for each exercise — per hand, per stack, as entered." — the card lists barbell, dumbbell, machine and cable exercises side by side, so the caveat matters more here than on the single-exercise page), the metrics-owned deload sentence (§8, "Deload sessions are not counted."), and `footer` ("Estimates only — not tested maxes."). The algorithm stamp (`e1rm-epley-rir v1`) is shown once so a screenshot remains attributable (I-4 of the tracker). Every sentence that the tracker renders unconditionally beside a band is therefore present here too.
- **What the card deliberately does not show:** `best` (all-time; would force an all-time scan per exercise on every dashboard load and is one tap away), reason codes other than the eligibility refusal (the detail page discloses every one exactly once), a sparkline per row, deltas or arrows between sessions, any ordering by value or recency, any sum or "total", and any exercise the athlete did not select.
- **The selection never touches the estimate.** `deriveStrengthReport` receives the same inputs whether or not an exercise is selected; the stored rows decide only which reports are computed and in which order they are rendered (I-13, A-9).

This satisfies ADR-011 §15.1's "linked from the library row" without touching the workout card (Release B territory) and keeps `src/ui/strength/**` unchanged, which keeps `strengthPage.spec.ts` and `strengthCopy.test.ts` as negative controls.

---

## 10. Useful descriptive comparisons vs misleading analytics

The line this evaluation draws: a comparison is *useful* when both sides are the same fact type, computed under one convention, over comparable windows, and shown with its uncertainty or count; it is *misleading* when the sides differ in convention, window completeness, or measurement noise, or when the layout implies a cause.

| Shown in v1 (useful, descriptive) | Why it is honest |
| --- | --- |
| Sessions and work sets per calendar week, eight weeks, deloads badged | Counts under one convention; every week exists; the partial week is labelled |
| Effective sets per group, this week (so far) vs last week | Same convention (current contribution weights) on both sides; the Volume screen shows the same numbers |
| Per-exercise current estimate with band, confidence, and data age | The tracker's own rules; within-athlete, within-exercise; the band is required copy |
| Bodyweight 7-day average with its entry count; 30-day change of two 7-day averages | Averaging suppresses day-to-day noise; the count discloses coverage; the change compares like with like |
| Recovery entries as entered, days logged, mean sleep hours | Raw facts and a within-field mean of a ratio-scale quantity |

| Excluded (misleading, or evidence-forbidden) | Why | Ledger |
| --- | --- | --- |
| Tonnage (Σ weight × reps) per week or session | Mixes load semantics the data model does not record — `0 kg` bodyweight sets, per-hand dumbbell loads, machine stacks (ADR-011 D-3, PI-005, tracker F-2); falls when reps fall even as load rises; not comparable across weeks whose exercise mix changed | O-4, D-1 |
| Percentage change of the current (partial) week vs last week | Compares a partial window with a full one | non-goal N-3 |
| "Adherence" / planned-vs-done / completion % | `evidence-to-design.md` row 15 lists compliance scoring as not justified; rotation-mode schedules have no "planned per week" at all (`resolveTodayTemplate`) | X-7 |
| A "total strength" / sum, average, or ranking of e1RM across exercises; "strongest lift" | Per-exercise, within-athlete series only; the reps–%1RM relation is exercise-specific (EVIDENCE-032, provisional); ADR-011 N-4 | X-8 |
| e1RM week-over-week % or trend arrows | The tracker's noise convention is ±10 % (K-03: the value is a product convention, the magnitude rests on **provisional** EVIDENCE-034…036 and describes individual estimation error, not session-to-session variation); an arrow would present that noise as a change in strength (I-10 of the tracker) | N-3 |
| Volume "% of MRV" progress bars or landmark-relative colouring | Reference range, never target (`volume-model.md` §4); GAP-01 | X-9 |
| 5-week volume averages or "volume trend" | Averages over deload and zero weeks describe nothing; the trend chart is Phase 9's charting decision | D-4 |
| Any readiness score, sleep debt, recovery index; averages of 1–5 ratings | EVIDENCE-027; OD-09; an average of ordinal ratings reads as a score | X-5, O-5 |
| Recovery vs training or strength overlays, correlations, "on days you slept < 6 h…" | n-of-1 uncontrolled data cannot support a causal or even correlational claim; EVIDENCE-027's explicit unsafe inference | X-6 |
| Bodyweight vs strength or volume ("weight up, estimate up") | Same reason | X-6 |
| Streaks, badges, "best week", "PR" | mvp-scope §3; ADR-011 copy rules | X-10 |
| Session duration averages | `started_at` is the Start tap and includes warm-up routines by design (warm-up evaluation §7); a duration average would reward early starts | D-13 |

---

## 11. API and query design

### 11.1 The read endpoint

`GET /api/metrics` — authenticated (`requireUserId`, 401 otherwise), no query parameters in v1, `runtime = "nodejs"`, `NetworkOnly` under the service worker by the existing catch-all (no `sw.ts` change). Read-only: no POST/PATCH/DELETE on this route. Response `{ metrics: MetricsDashboardDto }`. The configuration endpoints are in §11.5.

```ts
// src/domain/metrics/types.ts — pure data contract, nothing persisted
export interface MetricsDashboardDto {
  generatedAt: string;          // ISO instant (server now)
  asOf: string;                 // same instant, echoed (future ?asOf= would clamp here)
  asOfLocalDate: string;        // YYYY-MM-DD in the account timezone
  timezone: string;             // users.timezone
  weekStartsOn: number;         // users.week_starts_on (0–6)
  training: {
    weeks: {                    // index 0 = current week, 8 entries
      startDate: string; endDateExclusive: string;
      sessionsCompleted: number; workSets: number; isDeload: boolean;
    }[];
  };
  strength: {
    windowDays: 90;
    algorithm: { id: "e1rm-epley-rir"; version: 1; formula: "epley" };
    selection: {                // the stored selection, in stored position order; 0..5 rows
      exerciseId: string; name: string; equipment: string; archived: boolean;
      position: number;         // 1..5, the stored value
      loadStepKg: number;
      state: "estimate" | "no_current_estimate" | "not_available" | "turned_off";
      currentE1rmKg: number | null;               // non-null iff state === "estimate"
      confidence: "high" | "medium" | "low" | null;
      latestPoolAgeDays: number | null;
    }[];
  };
  volume: {
    weeks: WeekVolumeReport[];  // exactly weeks[0..1] of the existing report, verbatim (activePreset omitted)
  };
  bodyweight: {
    latest: { date: string; weightKg: number } | null;
    sevenDayAverage: { kg: number; entryCount: number } | null;   // null when entryCount < 3
    sevenDayEntryCount: number;
    thirtyDayChange: { kg: number; currentEntryCount: number; priorEntryCount: number } | null;
    series: { date: string; weightKg: number }[];                 // ascending, ≤ 90 points
  };
  recovery: {
    days: {                     // 7 entries, ascending, D − 6 … D
      date: string;
      entry: { sleepHours: number | null; sleepQuality: number | null;
               readiness: number | null; soreness: number | null } | null;
    }[];
    daysLogged: number;
    meanSleepHours: { hours: number; count: number } | null;      // count = rows with sleepHours, printed
  };
}
```

`WeekVolumeReport` is the existing type from `@/domain/volume/aggregate` — re-used, not redefined. Because the DTO lives in `src/domain/metrics/types.ts`, and `ui` may import `domain`, the screen imports the type directly: **no hand-mirrored copy** (the history/strength mirrors exist only because those DTOs are declared in `server`, which `ui` may not import).

### 11.2 Query plan (bounded; with a non-empty selection 11 statements minimum, 13 typical, 15 worst case — one fewer when the selection is empty; no all-time scan)

| Step | Statement | Bound | Index | Expected rows (heavy user) |
| --- | --- | --- | --- | --- |
| 1 | `users` → `timezone`, `week_starts_on` | pk | — | 1 |
| 2 | `workout_sessions` where `user_id`, `status = 'completed'`, `started_at ∈ [W7.start, min(W0.end, instant(D + 1)))` → `id, started_at, is_deload` | 8 weeks | `ix_sessions_user_started` | ≈ 40 |
| 3 | `set_logs ⋈ session_exercises` where `session_id ∈ (step 2)` → `session_id, is_warmup` **rows** (no `is_warmup` predicate, no `count`) — the domain drops warm-ups and counts (M-2, the `aggregateVolume` precedent) | id list from step 2 | `ix_session_exercises_session_id`, `ix_set_logs_session_exercise` | ≈ 1,600 rows |
| 4–7 | `getWeeklyVolumeReport(db, userId, now)` unchanged: its own `users` read, one fact join over 5 weeks, and sequential preset resolution — 4 statements minimum (the `users` read, the fact join, the `programs` read, and then either the `users.default_volume_preset_id` read or a `blocks` read — one of the two always runs), 6 typical (default preset, no active program), 8 maximum (a block preset id that fails to resolve, then the default) | 5 weeks | as today | ≈ 2,400 join rows (one row per set × contribution row; ≈ 2.2 contributions per exercise on the local catalogue) — the widest statement of the request together with step 8 |
| 8 | `dashboard_estimate_selections ⋈ exercises` where `selections.user_id = :userId` **and `exercises.user_id = :userId`**, `ORDER BY position` → `exercise_id, position, name, equipment, load_step_kg, strength_estimate, archived_at`. Ownership is in the WHERE clause on **both** tables, never a post-fetch check (the tracker's rule, ADR-011 review RL-10) | ≤ 5 rows | pk `(user_id, exercise_id)` | 0–5 |
| 9 | Only when step 8 returned rows: `session_exercises ⋈ workout_sessions ⟕ set_logs` where `workout_sessions.user_id`, `status = 'completed'`, `started_at ∈ [instant(D − 89), instant(D + 1))`, **and `session_exercises.exercise_id ∈ (step 8 ids)`**, **`ORDER BY exercise_id, started_at, position, set_number`** — the order is part of the contract (I-11), not an implementation note | 90 days × ≤ 5 exercises | `ix_session_exercises_exercise` now serves the `exercise_id` predicate; `ix_sessions_user_started` the time bound; `ix_set_logs_session_exercise` the join | ≈ 300–800 (5 exercises × ≈ 13 weeks × sets) |
| 10 | `bodyweight_entries` where `user_id`, `date ∈ [D − 89, D]`, ascending (one statement; the former older-entry count is dropped, RL-8) | 90 days | `uq_bodyweight_day` | ≤ 90 |
| 11 | `recovery_entries` where `user_id`, `date ∈ [D − 6, D]` | 7 days | `uq_recovery_day` | ≤ 7 |

Step 9's window bound is exact, not approximate, for every zone whose DST transitions happen away from midnight (the scope `localDateToUtcInstant`'s own comment claims — every zone this app is likely to see): `performedOn` is derived from `started_at` in the same timezone, so every session with `performedOn ∈ [D − 89, D]` has `started_at ∈ [instant(D − 89), instant(D + 1))` and vice versa (verified against the helpers for `Europe/Ljubljana`: the instants one millisecond either side of each bound format to the adjacent days). Volume uses the same helper, so parity with the Volume screen holds in any zone. This is the "one batched query … bounded by the window start instant" that ADR-011 §14.3 prescribes for Release B's bundle field; v1 keeps the helper inside `src/server/metrics/` so `src/server/strength/**` stays byte-identical (its boundary tests remain negative controls), and records lifting it into the strength server module as D-8 for Release B.

**Why the index projects `current` only.** `deriveStrengthReport` over a window-bounded session set returns a `best` computed over that window and `staleObservationCount = 0`, and may emit `BEST_UNCONFIRMED` or omit `DELOAD_SESSIONS_EXCLUDED` differently from the all-time detail page. `currentE1rmKg`, `confidence`, and `latestPoolAgeDays` depend only on in-window observations (pool = last three non-deload observations in window; confidence caps = pool size, spread, freshness), so they are **identical** to the detail page's for the same fact rows — acceptance criterion A-9 proves it with one fixture derived both ways. Everything else stays off the index (the O-14 precedent).

**Steps 4–7 reuse the volume service byte-identically**, including its redundant `users` read and the preset resolution the card does not render. The cost is up to six trivial single-row statements; the benefit is the invariant "Metrics' volume numbers are the Volume screen's numbers" holding by construction rather than by test. No option is added to `getWeeklyVolumeReport` in v1 — `src/server/volume/service.ts` is on the must-not-change list (§20) and is a root of two existing boundary suites; trimming the preset reads is recorded as D-15. The service returns five weeks; the metrics service forwards `weeks.slice(0, 2)`.

**Step 9 is filtered by the selection, not by eligibility.** The selection is the cost control (at most five exercises); eligibility is still decided by the domain gate (`evaluateExerciseEligibility`) per selected exercise, exactly as the detail endpoint does today, which is how a selected exercise whose equipment or `strength_estimate` changed after selection lands in its `not_available` / `turned_off` state without a second copy of the rule in SQL. When the selection is empty, step 9 is skipped and `strength.selection` is `[]`.

### 11.3 Performance boundaries (binding)

- **No statement is unbounded in time**; the widest window is 90 days. Growth over years is therefore zero for this endpoint — the reason no aggregate table, materialised view, or cache is needed (`data-model.md` §6: ≈ 10k set rows/year; the widest step, the volume fact join, touches ≈ 2,400 rows).
- **Statement count** is asserted as an **exact number per fixture shape**, never as an inequality — a `≤ N` ceiling silently tolerates one or two stray statements on every reachable branch and, worse, does not catch the N+1 it exists to catch (a per-exercise fact scan sharing one metadata lookup lands at `12 + N` and passes a loose ceiling for small N). Non-volume statements are 7 with a non-empty selection (steps 1, 2, 3, 8, 9, 10, 11) and 6 with an empty one (step 9 skipped); the volume service contributes 4/5/6/6/7/8 by branch, so with a non-empty selection the totals are **11** (no active program, no default preset), 12, **13** (default preset, no active program — the common case), 13, 14, **15** (block preset id that does not resolve, then the default — unreachable through the application), and one fewer each with an empty selection. A-12 pins 11 and 13 on two named fixtures with five selected exercises, 10 and 12 with an empty selection, and proves selection-size independence with a one-exercise fixture. The **boundedness clause** of A-12 is the load-bearing half against an N+1: the tracker's own `queryFactRows` has no time bound by design, so any per-exercise reuse of it fails that clause on the first exercise. The metrics service adds no `users` read of its own beyond step 1. No statement-logging helper exists in `tests/integration/` today; the natural attachment point is the `drizzle(client, { schema })` call in `tests/integration/testDb.ts`, which accepts drizzle's `logger` option — a `createTestDb({ log })` variant that records every SQL string is a ten-line addition and becomes reusable for Release B's own statement-count criterion.
- **No writes**: the same log contains no `INSERT`/`UPDATE`/`DELETE` for a dashboard request.
- **Latency**: the implementation report records the measured server time of `getMetricsDashboard` against a fixture with 3 years of heavy-user data on the machine it is actually measured on — the local Docker PostgreSQL 16 on the development machine. The budget is stated **for that machine**: p95 ≤ 100 ms server time locally, taken as a proxy for the 300 ms p95 that would be acceptable on the production B1/B1ms pair; no claim about production hardware is made from a local run, and a local miss is informative rather than alarming. If the local budget is missed, the remedies are (in order) a covering index on `set_logs (session_exercise_id, is_warmup)`, splitting steps 3 and 9 into two round trips, and *only then* a discussion of derived storage. **The first remedy is a migration**, so B-3's "exactly one additive migration, `0012`" holds unconditionally only while the budget is met — which the sizing argument expects; a covering index would be a second, performance-only migration, still storing nothing derived (I-2).
- **Response size**: ≈ 5–15 KB uncompressed; no pagination.
- **Selection write path**: `PUT /api/metrics/selection` is one transaction of 1 lock statement + 1 or 2 validation reads + 1 delete + 1 insert (§11.5); it runs only on the editor's Save, never on a dashboard load, and its statement count is not an acceptance criterion.
- **Client**: one request per mount, per **Refresh** tap, and per visibility regain; no throttle, no timers, no polling. The visibility refetch is a **new** client behaviour, not an inherited one — `visibilitychange` occurs once in `src/`, in the outbox flusher — and an unthrottled listener issues one full request per foregrounding, including rapid app-switching; accepted because the request is bounded and the user can see "Updated HH:MM" change (RL-13).

### 11.4 Alternatives considered

- **Client composition from the five existing endpoints** (`/api/history`, `/api/volume`, `/api/bodyweight`, `/api/recovery`, `/api/exercises/[id]/strength` × N): rejected. It needs N all-time strength scans, cannot produce M-1/M-2 (history counts warm-ups and pages by 20), fetches all bodyweight/recovery rows ever, and lets each card compute "today" at a different instant. Five loading states on one phone screen is also worse UX (X-2).
- **Extending `/api/today-bundle`**: rejected. The bundle is the offline lifeline, cached in IndexedDB and by the service worker; dashboard data would bloat every Today load and every cache and would be served stale offline with no benefit (X-3).
- **A persisted `metrics_snapshots` table or materialised view**: rejected on `architecture-plan.md` §7 and the sizing above; nothing to prove because nothing is slow (X-1).
- **Reusing `listHistorySessions` for M-1/M-2**: rejected; it counts warm-up rows and is paged (X-11).
- **Storing the selection anywhere but a relational, user-scoped table** (`localStorage`, an IndexedDB preference, a JSON array column on `users`, or a third value of `exercises.strength_estimate`): rejected (X-14…X-17, §11.5) — the first two do not cross devices, the JSON bag cannot enforce the five-row limit, per-exercise ownership, or FK integrity, and overloading `strength_estimate` would couple a presentation choice to the eligibility switch O-3 says it must never touch.

### 11.5 The selection: persistence model and configuration contract (O-3 / O-8)

**What it is.** Dashboard *configuration*: which of the athlete's e1RM-compatible exercises the Current estimates card shows, and in what order. It is the only thing the feature writes. It is not a fact, not a snapshot, not derived, and not consumed by anything but `GET /api/metrics` and the editor.

**Schema (migration `0012`, additive; `src/db/schema/dashboardEstimateSelections.ts`, exported through the schema barrel).**

| Column | Type | Constraints |
| --- | --- | --- |
| `user_id` | uuid | FK → `users` (`ON DELETE CASCADE`), not null |
| `exercise_id` | uuid | FK → `exercises` **`ON DELETE CASCADE`**, not null — the selection is presentation config, so hard-deleting an exercise (allowed only when it has no history) removes its row; the remaining rows keep their positions and render in order (gaps are fine on read) |
| `position` | smallint | not null, `ck_dashboard_estimate_selections_position` `between 1 and 5` |
| `created_at` / `updated_at` | timestamptz | house convention |

Primary key `(user_id, exercise_id)`; `uq_dashboard_estimate_selections_position` unique `(user_id, position)`. The check plus the unique constraint make **more than five rows per user impossible at the database level**, independent of any service rule; there is no deferrable constraint because the write contract replaces the whole list inside one transaction (delete, then insert), so no swap ever violates uniqueness mid-transaction. No `id` column: the pair is the identity, exactly like `exercise_muscle_contributions`. No column stores an estimate, a name, or an eligibility flag — those are read live (I-2, I-13). Rows are never created by the seed, by account setup, or by any migration backfill: **the initial state is empty for every account**, including the existing one, so the athlete's first visit is the selection flow O-3 requires.

**Read contract.** The dashboard reads the selection inside `GET /api/metrics` (§11.2 step 8). The editor reads `GET /api/metrics/selection` → `{ selection: SelectionRowDto[], candidates: CandidateDto[] }` where `SelectionRowDto = { exerciseId, name, archived, position, state }` (state as in §11.1, so the editor can show why a row has no estimate) and `CandidateDto = { exerciseId, name, equipment }` lists every exercise of the user that `evaluateExerciseEligibility` accepts (`STRENGTH_ELIGIBLE_EQUIPMENT`, `strength_estimate = 'auto'`), is **not archived**, and is not already selected — ordered by case-folded name then id. Two statements (the selection join, and the user's exercises). Both endpoints are `NetworkOnly` under the existing catch-all.

**Write contract — idempotent full replacement.** `PUT /api/metrics/selection` with body `{ exerciseIds: string[] }`, validated by `putSelectionInputSchema` in `src/domain/metrics/selection.ts`: an array of 0–5 UUID strings, `.strict()`, no duplicates (a `refine`). Semantics: *the stored selection becomes exactly this list, positions 1..n in array order.* The same body applied twice yields the same rows (the second application rewrites identical rows; `updated_at` moves — that is the only difference, and it is not part of any read DTO). An empty array clears the selection. There is no PATCH, no per-row endpoint, no "move" operation on the wire: ordering is expressed by array order only, which is what makes replays and retries safe. Response `200 { selection }` (the stored rows, as the read contract returns them); `400 invalid_input` for a malformed body; `400 { error: "invalid_exercise", exerciseId }` when any id fails the rule below. `401` unauthenticated.

**Validation (server, in the write transaction).** For each submitted id, in order: the exercise must exist **and belong to the caller** (`eq(exercises.userId, userId)` — a foreign id is indistinguishable from a missing one, the RL-10 rule); it must pass `evaluateExerciseEligibility` (structurally compatible equipment, `strength_estimate = 'auto'`); and, if it is **not** already in the caller's stored selection, it must not be archived. An already-stored exercise is accepted even if it has since been archived, switched off, or had its equipment changed — that is how O-3's "retains an already-selected exercise" and the `turned_off` / `not_available` row states arise; the only way such an exercise leaves the selection is the athlete removing it (or the exercise being hard-deleted, which cascades). The five-item limit is enforced three times: Zod (`max(5)`), the check constraint, and the unique position index.

**Concurrency — two devices editing.** The write runs inside one transaction that first takes the two-int form `pg_advisory_xact_lock(namespace, userKey)` — a fixed metrics namespace integer, and a per-user 32-bit key derived from the user id the way `userVolumeLockKeys` in `src/server/volume/service.ts` derives its second key. (That helper derives *both* ints from the UUID, so it cannot simply be reused with "a different constant"; the metrics variant takes a constant first key so the two features can never contend on the same lock pair.) It then validates, deletes the user's rows, and inserts the new ones. Validation reads the submitted exercises and the caller's currently-stored selection (for the already-stored exemption) — one statement as a single left join, or two; no criterion asserts the write-path statement count, so either is acceptable (§11.3). Two concurrent PUTs serialise; **the later one wins as a whole list** — never a merge, never an interleaving of positions (the unique index would reject any such state). Each device re-reads the list on its next dashboard load or editor open; the editor shows the stored list at open time and a **Save** overwrites it. This is the LWW posture the app already takes for definitions (ADR-005), applied to a five-row list the athlete can see and re-save in seconds; a conflict banner is not built (D-18).

**Behaviour when a selected exercise changes.**

| Event | Selection row | Card row |
| --- | --- | --- |
| Archived | kept | badge `Archived`; estimate or `No current estimate` per the tracker (O-7) |
| `strength_estimate` set to `'off'` | kept | `Strength estimate turned off for this exercise` (`turned_off`) |
| Equipment changed to bodyweight/`other` | kept | `Not available for this equipment type` (`not_available`) |
| Loses its current estimate (window ages out, only deloads) | kept | `No current estimate` (`no_current_estimate`) |
| Un-archived / switched back on / equipment restored | kept | recomputed on the next read; nothing written |
| Hard-deleted (no history) | removed by `ON DELETE CASCADE` | gone; other rows keep their positions |
| User row deleted | removed by cascade | — |

**What the selection is not.** It is not in `SYNC_ENTITIES`, not in any outbox op, not in IndexedDB, not in the service-worker cache, not in `TodayBundle`, and not in the active-session aggregate (`/metrics` and its editor are online-only). It carries no snapshot of anything: a rename shows the new name, an archive shows the badge, a deletion removes the row — all on the next read.

---

## 12. Navigation and mobile layout

### 12.1 Navigation

- Add **Metrics** to the nav in `src/app/(app)/layout.tsx` after **History** (O-1). With the existing `flex-wrap`, eight `text-sm` links may need a third row on the narrowest widths and nothing overflows horizontally — but this is **measured, not assumed**, and measured *before* the UI work is finished. What `tests/e2e/phase7Remediation.spec.ts` actually does: its bounding-box loop over the seven link names runs on `/today` only, across four viewports (375×667, 390×664, 390×844, 430×844); its per-route loop visits six routes and asserts only `scrollWidth` and the visibility of the "Recovery" link. Adding "Metrics" to the name list is one edit and extends the `/today` bounding-box check to the new link; `/metrics` is **not** covered by that spec — A-17 covers it. The spec's HIGH-2 assertion (Today's **Start workout** within the initial 375×667 / 390×664 viewport with the recovery card visible) is re-run, because a third nav row pushes Today's content down by one line plus `gap-y-2`. If HIGH-2 fails at 375 px, O-1's consolidation variant is the fallback, not a nav restyle. No active-route styling is added (none exists; PI-004 owns that). The nav links themselves stay their current ~20 px text height; the 44 px rule below applies to the dashboard's own links.
- Volume, Bodyweight and Recovery **stay** top-level in v1; each dashboard card links to its detail screen. Demoting them under Metrics is a later, separate decision (O-1, D-9).
- No link from Today, no dashboard highlights on Today (D-9): Today's bundle and offline posture stay untouched.

### 12.2 Wireframe (390 px; `max-w-sm` single column; every card `rounded-lg border border-slate-800 bg-slate-900`)

```text
┌────────────────────────────────────────┐
│ Today  History  Metrics  Exercises     │  nav (flex-wrap, unchanged style)
│ Programs  Volume  Bodyweight  Recovery │
├────────────────────────────────────────┤
│ Metrics                                │  h1
│ Updated 07:41 · numbers for Sep 7, 2026│  text-xs slate-400, role=status
│ Weeks start Monday · Europe/Ljubljana  │
│ Refresh                                │  button, min-h-11
├────────────────────────────────────────┤
│ Current estimates     Choose exercises │  h2 + card link (first card, O-10)
│ Back Squat                             │  rows in stored order; each = one
│ ≈ 140 kg (likely 125–155) est.         │  Link, min-h-11
│ high confidence · 3 days ago           │
│ Bench Press                 [Archived] │
│ ≈ 100 kg (likely 90–110) est.          │
│ medium confidence · 2 weeks ago        │
│ Romanian Deadlift                      │
│ No current estimate                    │  per-row empty state (O-3/O-8)
│ …up to five rows…                      │
│ Based on the last 90 days of training. │  reused STRENGTH_PAGE_COPY
│ An estimate from your logged sets, not │  (estimateDisclaimer)
│ a measured value. Treat a change as a  │
│ change in the estimate.                │
│ The range is a ±10 % convention, not a │  (bandNote)
│ measured error.                        │
│ In the numbers you log for each        │  metrics-owned unit line
│ exercise — per hand, per stack, as     │
│ entered.                               │
│ Deload sessions are not counted.       │  metrics-owned deload line
│ Estimates only — not tested maxes.     │  (footer)
│ Algorithm e1rm-epley-rir v1            │
├────────────────────────────────────────┤
│ Training                  Full history │  h2 + card link (min-h-11)
│ Sep 7 – Sep 13 (so far) · 1 session ·  │  one line per week, text-xs (O-2);
│ 18 work sets                           │  wraps only when the badge/"(so far)"
│ Aug 31 – Sep 6 · 4 sessions · 71 work sets
│ Aug 24 – Aug 30 [Deload] · 3 sessions ·│  row opacity-60
│ 40 work sets                           │
│ …five more weeks…                      │
│ Completed workouts only. Warm-up sets  │  caption text-xs slate-500
│ not counted.                           │
├────────────────────────────────────────┤
│ Weekly volume            Volume screen │
│ Effective sets   This week   Last week │  3-column grid, header row
│                  (so far)     [Deload] │
│ Chest              6          12.5     │  bare round2 values, as /volume
│ Back               4          11       │
│   = Lats 2.5 + Upper Back 1.5          │  reconciliation, effective only
│ Quads              8           9       │
│ …groups with volume in either week…    │
│ Under current contribution weights.    │  caption
│ Includes the workout in progress.      │  (the Volume convention, §8)
│ Reference ranges are on the Volume     │
│ screen.                                │
├────────────────────────────────────────┤
│ Bodyweight              Bodyweight log │
│ 82.4 kg   latest · Sep 6               │  text-base font-semibold
│ 82.1 kg   7-day average (5 of 7 days)  │
│ −0.6 kg   change of 7-day averages,    │
│           30 days apart                │
│           (5 of 7 vs 6 of 7 days)      │
│ · ·  · · ·   ·  · · ·  points, 90 days │  inline SVG aria-hidden, x = day,
│ 90 days · 41 entries · first 81.0 kg · │  no connecting line (M-9)
│ latest 82.4 kg · lowest 80.9 · highest │  text alternative (§13)
│ 83.2                                   │
├────────────────────────────────────────┤
│ Recovery                  Recovery log │
│ Your own check-ins, as entered. Not    │  caption, always visible
│ used by the progression engine or any  │
│ suggestion, and not compared with      │
│ training here.                         │
│ Day     Sleep h  Quality  Readi-  Sore-│  5 columns; long headers wrap
│                           ness    ness │
│ Sep 1     7.5      4        3       2  │
│ Sep 2      —       —        —       —  │
│ Sep 3     6        3        —       4  │
│ …                                      │
│ Logged 5 of the last 7 days · mean     │
│ sleep 7.1 h (2 of 7 days)              │  the mean's own count (M-12)
└────────────────────────────────────────┘
```

Editor `/metrics/exercises` (same shell; the only screen with writes):

```text
┌────────────────────────────────────────┐
│ Dashboard exercises                    │  h1
│ Up to five compatible exercises, in    │  caption
│ the order you want them.              │
│ 1 Back Squat            Up  Down  Remove│  each control ≥ 44 px, aria-label
│ 2 Bench Press [Archived] Up  Down  Remove│  "Move Bench Press down" etc.;
│ 3 Romanian Deadlift     Up  Down  Remove│  Up disabled on row 1, Down on last
│ [ Choose an exercise…          ▾ ] Add │  native <select> of candidates
│ Five exercises is the limit.           │  only when 5 rows are listed
│ Save                                   │  primary button, min-h-11
│ Cancel                                 │  link back to /metrics
└────────────────────────────────────────┘
```

Layout rules: the page body never scrolls horizontally at 320–430 px (content column = 358 px at 390 px and 288 px at 320 px after `main`'s `px-4`; a card's `px-3` leaves 334 / 264 px). The Training list renders each week as **one compact `text-xs` line** — `Aug 31 – Sep 6 · 4 sessions · 71 work sets` fits 264 px — and lets only the current week's "(so far)" and a deload badge wrap the line (O-2); eight rows plus the caption then take roughly 200 px instead of 330 px. The two tables use fixed column counts (3 and 5) with `text-xs`, `tabular-nums` (a **new** utility in this codebase — 0 occurrences today — introduced here for numeric columns), and header cells that wrap rather than abbreviate. Card-level links are plain words distinct from the nav's link names ("Choose exercises", "Full history", "Volume screen", "Bodyweight log", "Recovery log"); because Playwright matches accessible names by **substring** (the repository says so at length in `ExerciseLibrary.tsx`), "History" still matches "Full history" — so the binding locator rule for every metrics spec is `getByRole("link", { name, exact: true })`, and the distinct names are what make `exact: true` unambiguous; no glyphs. Card order is fixed (Current estimates, Training, Weekly volume, Bodyweight, Recovery — recovery last and visually separated by its own caption; O-10). Every link and button inside the cards is ≥ 44 px tall. Dates use the existing formatters only: week labels via `formatWeekRangeLabel` ("Sep 7 – Sep 13"), single days via the same no-`Z` parse with `{ month: "short", day: "numeric" }` ("Sep 6") and, in the header, `formatLocalDate` ("Sep 7, 2026"); no weekday names. Volume prints the aggregate's `round2` values exactly as `/volume` does (`14`, `12.5`), never a forced `.0`. No animation.

---

## 13. Accessibility

- **Structure:** one `h1` ("Metrics"), one `h2` per card, tables with `<th scope="col">`/`<th scope="row">` for the volume and recovery grids; the Training list is a `<ul>`.
- **Text first:** every number that drives a reading is text. The sparkline is `aria-hidden="true"`; unlike the strength page, whose observation list renders every plotted point as text, the metrics card has no list, so its text alternative is a **summary line** — entry count, first, latest, lowest and highest value (§12.2) — and the individual daily points exist only as pixels (RL-1, accepted: the 90 values are one tap away on `/bodyweight`). Colour is never the only carrier: the deload badge says "Deload", the archived badge says "Archived", the partial week says "(so far)".
- **Editor:** the selected list is an ordered `<ol>`; each row's three buttons carry explicit accessible names (`Move Back Squat up`, `Move Back Squat down`, `Remove Back Squat`) and are `disabled` (not hidden) at the ends, so a screen reader hears why nothing moved; after a move, focus stays on the pressed button and a `role="status"` line announces `Back Squat is now 2 of 3`; the candidate `<select>` has a visible `<label>` ("Add an exercise"); the limit message is `role="status"`; Save errors (`invalid_exercise`, network) are `role="alert"`. No drag-and-drop, no pointer-only affordance.
- **Links:** each estimate row is one `<Link>` whose accessible name is the exercise name followed by the estimate or state text (one link per row, name first). Because Playwright matches accessible names by substring, the new spec must create its fixture exercises with timestamp-suffixed names (the strength spec's pattern) so "Bench Press" cannot match "Incline Bench Press". Card-level link names are distinct from the nav's ("Choose exercises", "Full history", "Volume screen", "Bodyweight log", "Recovery log") for the same reason, and every metrics spec locates them with `exact: true`.
- **Status messages:** the header's "Updated …" and the offline/error lines sit in an element with `role="status"` (`aria-live="polite"`) so a screen reader hears a refetch complete or fail; loading uses the house `Loading…` paragraph.
- **Numbers:** `tabular-nums` on numeric columns; the en dash in bands and week ranges is kept (the existing formatters).
- **Focus and motion:** browser default `focus-visible` rings are not suppressed; no transitions except the existing `active:scale` on the shared button if one is used; no auto-refresh that steals focus (refetch keeps scroll position and does not re-mount the tree).
- **Reduced data:** at 320 px the volume and recovery tables remain 3 and 5 columns; abbreviations "Qual." and "Ready." are avoided — headers wrap instead.

---

## 14. Offline and staleness behaviour

- **Capability class:** online only — `pwa-offline-strategy.md` §2's row for analytics; this evaluation adds no offline promise and no IndexedDB store. Rationale: the dashboard's only offline value would be a stale copy of numbers that are one tap from the screens the athlete can already open online; the cost would be a fourth IDB store, a staleness policy, and a cache invalidation story tied to the outbox — for a screen no one opens on the gym floor.
- **Warm start offline** (page already open, connection lost): the fetch rejects (`NetworkOnly`) → the existing data stays, the status line reads `Offline — showing metrics as of 07:41.` (the Today wording pattern).
- **Cold open offline:** a document navigation to `/metrics` with no network resolves to the precached offline shell, whose existing route notice reads `/metrics needs a connection. Today's workout and everything already logged on this device stay available offline.` (`src/ui/OfflineShell.tsx` allow-lists only `/`, `/today`, `/today/workout` and the shell path) — no dashboard code runs and nothing is added there. If the page document happens to be served from the `NetworkFirst` page cache but the data fetch rejects, the screen shows `Offline — metrics need a connection.` plus the nav. The data never comes from a cache.
- **Refetch triggers:** mount (which is also what an in-app Back produces — the App Router re-mounts the segment; `visibilitychange` does not fire on in-app navigation); a **Refresh** button in the header; and `visibilitychange` → `visible` (the PWA is foregrounded; iOS keeps pages alive for days). No throttle, no timers, no polling, no background fetch (iOS has none).
- **Un-synced facts — an honest race, not a guarantee:** the outbox flusher is wired to the same `visibilitychange` event, so on foregrounding the metrics request and the sync flush start in the same tick and the response may not include a session the flush is still applying. The dashboard does not try to order itself after the flusher (that would need a change in `src/sync/flush.ts`, which is on the must-not-change list); instead the **Refresh** button is the user-controlled catch-up, the "Updated HH:MM" line makes the moment explicit, and A-24 is worded "after reconnect and a Refresh tap". The global `SyncStatusBanner` reports dead letters and auth state, not a pending count, so it is not a mitigation here; a "changes waiting to sync" line is D-11's territory.
- **Service-worker update:** unchanged (`ServiceWorkerUpdater`); the dashboard is not part of any update-gated flow.
- **The editor is online-only too:** `GET`/`PUT /api/metrics/selection` are `NetworkOnly`; a Save while offline fails with `Couldn't save — you're offline.` (`role="alert"`) and keeps the unsaved list on screen for a retry; nothing is queued, nothing enters the outbox or IndexedDB, and a cold offline navigation to `/metrics/exercises` lands on the offline shell's route notice like any other non-Today route.
- **Login expiry and error bodies:** the screen checks `res.ok` before parsing — the existing read screens do not (F-11), so a 401/500 JSON body reaches their render as data — and a 401 renders `Failed to load metrics.` with the app's ordinary re-login path; nothing is cached to leak.

---

## 15. Copy rules (binding; enforced by `tests/unit/metricsCopy.test.ts`)

Every user-facing string of the metrics screen lives in `src/ui/metrics/copy.ts` (the strength convention) so one test can scan it. Strings reused from `@/ui/strength/copy` are imported, never re-typed. The rules are split by how they are enforced, so that the test can actually pass:

**Lexical bans — enforced by `metricsCopy.test.ts`, in two scopes so that ordinary React code can be written.** The strength template's `readableSource` strips comments and SCREAMING_SNAKE identifiers only; camelCase identifiers, component names and JSX attributes survive, so words that are also code vocabulary must not be scanned over source.
- *Scanned over copy strings **and** the comment-stripped source of `src/ui/metrics/**`:* case-sensitive `PR`, `1RM` (so `e1rm-epley-rir` in the algorithm stamp passes, exactly as it passes the strength test), and case-insensitive `personal record`, `recommend`, `research`, `predict`, `improv`, `declin`, `streak`, `adherence`, `compliance`, `correlat`, `sleep debt`, `ready to train`, and the glyphs `↑ ↓ ▲ ▼ → ›`.
- *Scanned over copy strings only* (they collide with `event.target`, the `Deload`/`Archived` badge components, and similar identifiers): `badge`, `target`, `score`, `trend`, `goal`, `fatigue`, `affect`, `impact`, `because`, `caused`, `recovered`, `optimal`.
- The **copy-string surface** is `allCopyStrings()` in `src/ui/metrics/copy.ts`, which must include, **by value**, every sentence imported from `@/ui/strength/copy` that the card renders (`freshness`, `estimateDisclaimer`, `bandNote`, `footer`) — a substring scan cannot see an imported constant otherwise, and the "must appear" assertions below depend on it. The strings are imported and re-exported into that array, never re-typed.
No required or reused sentence contains any banned substring (checked: the reused footer's "maxes" is not banned — `max` is not on any list, matching the strength precedent; the Recovery caption says "progression engine", not "recommendations").

**Semantic rules — enforced by review, not by the scanner:** "max" only inside the reused footer; "record" never as a noun for a value; "progress" never as a claim; no percentage next to a landmark or between two weeks; no sentence that attributes a number to the athlete's strength, fitness, recovery or fatigue.

**Must appear (also asserted by the test):** "(so far)" on the current week; "Completed workouts only. Warm-up sets not counted." on Training; "Under current contribution weights." on Volume; "Includes the workout in progress." on Volume; "Your own check-ins, as entered. Not used by the progression engine or any suggestion, and not compared with training here." on Recovery, and the mean-sleep line's own count in the form `(n of 7 days)` (M-12); on Current estimates the reused `freshness`, `estimateDisclaimer`, `bandNote`, `footer`, the metrics-owned unit and deload lines (§9), the per-row state `No current estimate`, the reused refusal lines for `not_available` / `turned_off` (imported by value from `@/ui/strength/copy`'s reason map), and the selection empty-state sentence (§6); in the editor `Up to five compatible exercises, in the order you want them.`, `Five exercises is the limit.`, `Couldn't save — you're offline.`; the timezone and week start in the header.

Two words are allowed only in their existing senses: "Readiness" as the column header for the athlete's own rating (the existing field label), and "Deload" as the badge.

---

## 16. Invariants (binding for implementation and review)

- **I-1 Metrics are read-only; configuration is the one write.** `GET /api/metrics` writes nothing. The feature's only write is `PUT /api/metrics/selection`, which touches exactly one table, `dashboard_estimate_selections`, through plain online REST (the definition-CRUD path of `implementation-plan.md` ground rule 4) — never the outbox, never IndexedDB, never the service worker. `SYNC_ENTITIES`, every op schema, `MAX_OPS_PER_BATCH`, `src/app/sw.ts`, and the Today bundle DTO are byte-identical before and after.
- **I-2 No persisted derivation.** No table, column, materialised view, or cache holds any dashboard number; every request recomputes from facts. The selection table holds `(user_id, exercise_id, position)` and nothing derived — no estimate, name, eligibility flag or snapshot. Enforced in the spirit of `strengthBoundary.test.ts`'s column claim but scoped to what the invariant is actually about — **declared column names**, not file text: the test extracts every column name from `src/db/schema/**` (the first string argument of each Drizzle column builder) and every column of a `CREATE TABLE` / `ADD COLUMN` statement in `drizzle/*.sql`, and applies to those names the patterns `/tonnage/i`, `/work_?sets?/i`, `/sessions?_(per|count)/i`, `/(rolling|seven_day|thirty_day|avg|average|mean)_/i`, `/e1rm_?(kg|value)/i`, `/snapshot_(kg|count)/i` — with an anti-vacuity witness proving each pattern fires on a synthetic column (`numeric("tonnage_kg")`, `numeric("seven_day_avg_kg")`) and a negative control proving none fires on the schema **as it stands after migration `0012`**. The selection table's columns — `user_id`, `exercise_id`, `position`, `created_at`, `updated_at` — pass, and table names are outside the pattern set on purpose: a table-name pattern such as `/dashboard/i` would fire on the very table O-3 requires and was dropped for that reason (OM-1).
- **I-3 Reuse, not re-derivation.** Volume numbers come from `getWeeklyVolumeReport` unchanged and are printed as the Volume screen prints them (bare `round2` values); strength numbers come from `deriveStrengthReport` unchanged; the estimate string comes from `formatEstimate`. For the same fact rows and `asOf`, the dashboard's two volume weeks equal `weeks[0..1]` of the Volume screen's report (field for field) and the dashboard's `currentE1rmKg`/`confidence`/`latestPoolAgeDays` equal the detail page's.
- **I-4 One clock.** Every section of one response is computed from one `asOf` and one `asOfLocalDate`; the DTO carries both plus `timezone` and `weekStartsOn`.
- **I-5 Bounded reads.** No statement issued by the endpoint is unbounded in time; the widest window is 90 calendar days; the strength fact query is additionally bounded to the ≤ 5 selected exercises; no per-exercise loop issues queries.
- **I-6 Convention parity, with one named divergence.** Sessions bucket by the account-local day of `started_at`, weeks start on `users.week_starts_on`, discarded sessions never count, warm-up sets never count as work sets, archived exercises' history counts — exactly as History/Volume/Strength do today, and the dashboard introduces no week or eligibility rule of its own. On **which sessions count**, the dashboard's own sections (Training, Strength, Bodyweight, Recovery) follow the **tracker's** rule — completed only, nothing dated after today — while the Volume card follows the **Volume screen's** rule — every non-discarded session in the window, in-progress and future-dated included — because it reuses that report unchanged. The two rules are both pre-existing; the dashboard puts them on one screen and says so (§8, R-1, A-2).
- **I-7 Recovery stays informational.** The only derived values over `recovery_entries` are a count of days logged and a mean of `sleep_hours`; no value combines two recovery fields, or any recovery field with any training, volume, strength, or bodyweight value; no recovery value is rendered inside a training, volume, strength, or bodyweight card or chart; the Recovery card carries its caption unconditionally. The 1–5 scales carry no labelled direction anywhere in the app (F-13), so the card renders bare numbers with no colour, icon, sort, or threshold that would assert which end is "good".
- **I-8 Engine untouched.** `src/domain/progression/**`, `src/server/progression/**`, and `recommendations` are neither imported by nor import any metrics module; `progressionBoundary.test.ts` and `strengthBoundary.test.ts` pass unmodified.
- **I-9 Per-exercise only.** No strength value is summed, averaged, ranked, or compared across exercises; rows render in the athlete's stored order, never by value or recency.
- **I-10 Labelled uncertainty.** Every estimate string contains "≈", a band, and "est."; every average carries its entry count; the current week carries "(so far)"; no percentage change is displayed anywhere.
- **I-11 Determinism.** Same fact rows + same `now` + same user settings ⇒ byte-identical DTO. For the training, bodyweight, recovery and volume sections this holds for **any** input row order (they are folds and `some()`s). For the estimate rows it holds for fact rows **delivered in step 9's `ORDER BY exercise_id, started_at, position, set_number`**, which is therefore part of the binding contract (row order on the card is the stored `position`, independent of this): the reused strength pipeline sorts sets by `set_number` with a stable sort, and the one ambiguous case — the same exercise at two positions in one session, which `uq_session_exercise_position (session_id, position)` permits — is resolved by that SQL order exactly as the tracker's own service resolves it.
- **I-12 Boundaries.** `src/domain/metrics/**` imports only itself plus `@/domain/volume/aggregate` (types), `@/domain/strength/report`/`types` (the pure entry point and types), `@/domain/volume/weekBuckets`, and `@/domain/strength/primitives` (`calendarDaysBetween`); `src/server/metrics/**` imports `@/server/volume/service` (`getWeeklyVolumeReport` only), `@/server/time/userLocalDate`, `@/db/schema`, and the domain modules — never `@/server/progression/*`, `@/server/sync/*`, `@/server/today/*`, or `evaluateSession`. No metrics file imports anything from `src/domain/bodyweight`, `src/domain/recovery`, `src/server/bodyweight`, `src/server/recovery`, `src/ui/bodyweight`, or `src/ui/recovery` — the six directories `progressionBoundary.test.ts` forbids to the engine: bodyweight and recovery rows are read through the `@/db/schema` barrel and the DTO types are declared in the metrics module, so the non-consumption story stays as simple for the dashboard as it is for the engine. The repository's import walker treats type-only imports as edges, so this holds for `import type` too. No metrics file path matches `/strength/i` or `/warmup/i` (F-16). `src/domain/metrics/selection.ts` may import `evaluateExerciseEligibility` and `STRENGTH_ELIGIBLE_EQUIPMENT` from `src/domain/strength/**` (the one eligibility rule, never copied); `src/server/metrics/selectionService.ts` writes only `dashboard_estimate_selections`. Enforced by `tests/unit/metricsBoundary.test.ts` in the strength-boundary template (discovered inventory, anti-vacuity witnesses, synthetic-edge controls).
- **I-13 The selection is presentation only.** For any exercise and any fact rows, `deriveStrengthReport`'s inputs and outputs are identical whether the exercise is selected, unselected, or selected at a different position; the stored rows decide only which reports are computed and rendered and in what order. The selection is never read by the tracker, the progression engine, volume, the Today bundle, or sync, and never written by anything but `PUT /api/metrics/selection` and the two cascades (§11.5). The card never adds, drops, or reorders a row on its own.

---

## 17. Non-goals (v1)

- **N-1** No range selectors, filters, or per-user dashboard settings.
- **N-2** No charting library; inline SVG sparkline for bodyweight only. OD-04 stays open and is *not* pre-empted by this feature.
- **N-3** No percentage changes, deltas, arrows, or trend lines on any card.
- **N-4** No cross-exercise strength aggregate, ranking, or comparison; no `best` on the index.
- **N-5** No tonnage, duration, or "intensity" metrics.
- **N-6** No adherence, completion, compliance, streak, or badge.
- **N-7** No readiness score, recovery index, composite of recovery fields, correlation, overlay, or narrative linking recovery/bodyweight to training or strength.
- **N-8** No recommendation acceptance statistics (reads `recommendations`; Phase 9 proper).
- **N-9** No offline availability or client cache; no bundle field; no Today highlight.
- **N-10** No new inputs of any kind — no nutrition (refused outright by `mvp-scope.md` §3), no new recovery fields (D-14 records them as ideas only).
- **N-11** No changes to `/api/history`, `/api/volume`, `/api/bodyweight`, `/api/recovery`, `/api/exercises/[id]/strength`, their services, or their screens.
- **N-12** No export (Phase 10).
- **N-13** No automatic, suggested, or recency-based population of the estimates card; no drag-and-drop; no per-card configuration beyond the exercise selection; no selection of more than five; no conflict UI for two-device edits (D-18).

---

## 18. Risks

- **R-1 Convention drift between screens.** History shows all set rows as "sets" and renders dates in the device zone (F-4, F-5); the dashboard shows work sets and account-local dates. The Volume card omits the `raw` ("N direct") figure `/volume` prints beside every group (RL-7). The Bodyweight card reads only 90 days while `/bodyweight` lists everything (M-6). Mitigation: the captions state the rules; the differences are recorded here and, where they belong to History, as findings for that screen, not papered over by the dashboard.
- **R-2 Session-set asymmetry between Training/Strength and Volume — intentional.** Volume counts every non-discarded session's sets, so an **in-progress** session and a completed session **dated after today** both appear in the Volume card; Training and the estimate index count completed sessions dated no later than today. A dashboard opened mid-workout can show "2 sessions" beside a volume column that already includes the third; a clock-skewed session dated tomorrow shows in Volume only. Mitigation: captions "Completed workouts only." and "Includes the workout in progress."; the asymmetry is the existing volume convention, the future guard is the existing tracker convention, and changing either is out of scope (X-11). A-2 asserts both directions.
- **R-3 Midnight and travel.** A session started at 23:40 account-local is in that day's week even if finished the next; a phone in another timezone shows "today" differently from the header. Mitigation: header states the timezone; convention parity (I-6); PI-002 is the place to change the rule.
- **R-4 Nav crowding.** Eight links may need a third row on the narrowest phones; the exact breakpoint is measured by the extended BLOCKER-1 spec (§12.1), and Today's HIGH-2 first-viewport assertion is the guard. Mitigation: accepted for v1 if HIGH-2 holds; otherwise O-1's consolidation variant; PI-004 gains a stronger trigger either way.
- **R-5 Copy drift.** New strings on a screen that mixes evidence-sensitive vocabularies (estimate, volume, recovery). Mitigation: one copy module, one banned-substring test, reuse of the tracker's sentences.
- **R-6 Misreading "current" as "best" or as strength.** Mitigation: the card heading is "Current estimates", band always present, the tracker's disclaimer sentences in the footer, no arrows; `best` only on the detail page.
- **R-7 Stale page in a long-lived PWA tab, and the flush race (§14).** Mitigation: refetch on visibility plus a Refresh button; "Updated HH:MM" always visible.
- **R-8 Selection-table integrity drift.** The three-layer five-row limit and the ownership predicates are the whole defence of a table that anything with database access could write. Mitigation: A-28's direct-SQL constraint witness and A-26's foreign-row read test prove the database and the read path each hold on their own; the card is bounded to ≤ 5 rows regardless of how many exercises are trained, so there is no growth risk to manage.
- **R-9 Volume service changes.** A future change to `getWeeklyVolumeReport` (e.g. PI-002's training date) propagates automatically — the intended coupling — but the dashboard's e2e fixture must be maintained alongside `volume.spec.ts`.
- **R-10 Performance surprise on B1ms.** Steps 4–7's fact join and step 3 are the widest statements (≈ 2,400 and ≈ 1,600 rows); the selection-bounded fact query (step 9) is ≈ 300–800. Mitigation: the measured-latency acceptance criterion and the ordered remedies in §11.3, none of which is storage.
- **R-12 The first write path in the feature.** `PUT /api/metrics/selection` is the only mutation; a bug there can at worst corrupt a five-row presentation list the athlete can re-save in seconds — it cannot touch facts. Mitigation: full-replacement semantics, three-layer limit enforcement, ownership in every WHERE clause, and the A-26…A-33 suite.
- **R-13 Two-device overwrite.** Two editors saved from two devices produce whichever list was saved last, whole. Mitigation: serialised by the advisory lock so no interleaving is possible; the editor always opens on the stored list; disclosed as N-13/D-18 rather than solved.
- **R-14 A selected row that "went quiet".** A row showing `No current estimate` for months (exercise dropped from the program) is honest but stale-looking. Mitigation: the row keeps `Remove` one tap away; the card never removes it itself (O-3).
- **R-11 Recovery card read as advice.** A grid of sleep and soreness next to training numbers invites the athlete to draw lines the app refuses to draw. Mitigation: the card is last, separated, and captioned; no shared axis or colour scale with any other card; I-7.

---

## 19. Acceptance criteria and negative controls

Tags: (Domain) Vitest fixtures over the pure module; (Integration) PGlite; (Wire) contract; (UI) Chromium at 390×844 and 320×568; (Boundary) import graph / grep; (Device) iPhone installed PWA, recorded in a device-acceptance note per the repository convention.

- **A-1** (Domain) Eight calendar-week windows for `D = 2026-09-06`, `weekStartsOn = 1` start on `2026-08-31, 08-24, …, 07-13`; with `weekStartsOn = 0` on `2026-09-06, 08-30, …`; a session at `2026-09-06T21:30:00Z` (23:30 in `Europe/Ljubljana`) lands in the week starting `2026-08-31`; with `users.timezone = 'Pacific/Kiritimati'` and `D` derived from the same instant (local day `2026-09-07`), the session lands in the week starting `2026-09-07`; with `D` held at `2026-09-06` it is a future session and counts in neither `training` nor `strength` (it still counts in `volume` — A-2).
- **A-2** (Domain + Integration) A week with no sessions yields `{ sessionsCompleted: 0, workSets: 0, isDeload: false }` and is present in the array; a completed session with zero sets counts as 1 session / 0 work sets; the domain receives `{ sessionId, isWarmup }` rows and excludes `isWarmup = true` from `workSets` (a fixture with warm-up rows proves it — the query hands them over unfiltered); a deload session flags the week. **Divergence fixtures (Integration):** (i) a completed deload session with no work sets → Training row badged, Volume column for that week not badged; (ii) an in-progress deload session with work sets, `started_at` in `W1` → Volume column `W1` badged and its sets counted in `volume`, Training row `W1` neither badged nor counting it; (iii) a completed session with `started_at` two days after `D` inside `W0` → present in `volume.weeks[0]`, absent from `training.weeks[0]` and from `strength`. Each of the three is asserted as a divergence, not denied.
- **A-3** (Domain) In-progress and discarded sessions contribute nothing to `training` or `strength` (the fixture includes both).
- **A-4** (Domain) Bodyweight: entries on 5 of 7 days → `sevenDayAverage.kg` = the mean of those 5 rounded to 0.1 and `entryCount = 5`; 2 of 7 → `null` with `sevenDayEntryCount = 2`; the 30-day change equals the difference of the two 7-day means, carries both entry counts, and is `null` when either window has fewer than 3 entries; a future-dated entry (`date > D`) is ignored everywhere; `series` is ascending and excludes dates before `D − 89`.
- **A-5** (Domain) Recovery: 7 day rows always present; a missing day → `entry: null`; a null metric stays `null`; `daysLogged` counts rows with an entry; `meanSleepHours` averages only non-null `sleepHours`, carries **its own count** (a fixture with five check-ins of which two have `sleepHours` → `daysLogged = 5`, `meanSleepHours.count = 2`), and is `null` when none exist.
- **A-6** (Domain) Determinism, split by section (I-11): (a) shuffling the input rows of the training, bodyweight, recovery and volume sections yields a byte-identical DTO; (b) for the estimate rows, re-ordering fact rows **within** the same `(exercise_id, started_at, position, set_number)` key — i.e. genuinely equal keys — yields a byte-identical DTO, and shuffling the selection rows themselves changes nothing because they are re-ordered by stored `position`; (c) a fixture with the **same exercise at two positions in one session** proves *why* the fact order is binding: shuffling those rows across positions changes the observation, while rows delivered in step 9's `ORDER BY` do not.
- **A-7** (Domain) Estimate rows: a selected eligible exercise with three in-window non-deload observations yields `state: "estimate"` with the tracker's `currentE1rmKg`; a selected eligible exercise whose only in-window session is a deload, or which has no in-window session, yields `state: "no_current_estimate"` with `currentE1rmKg: null` and keeps its position; a selected exercise now with `equipment = 'bodyweight'` yields `not_available`, one with `strength_estimate = 'off'` yields `turned_off`; rows are emitted in stored `position` order for every permutation of the input (never re-sorted); an empty selection yields `[]` and no strength fact query (A-12).
- **A-8** (Domain) A selected archived exercise → its row with `archived: true` and whichever state its facts give; an unselected exercise, archived or not, with any history → no row.
- **A-9** (Domain, I-3) For a fixture of 12 sessions across 200 days, `deriveStrengthReport(all sessions).estimate.{currentE1rmKg, confidence, latestPoolAgeDays}` equals the index row derived from only the in-window sessions — for `D` values that place 0, 1, 2, 3 and 5 observations in the window.
- **A-10** (Integration + UI) `getMetricsDashboard(db, userId, now)` on PGlite returns the full DTO shape for the fixture user with `generatedAt`/`asOf` the same instant and `asOfLocalDate`/`timezone` matching the user row (route handlers obtain their pool from `getDb()` and cannot be pointed at PGlite, so the route itself is covered by e2e: an unauthenticated `page.request.get('/api/metrics')` → 401, an authenticated one → 200 with `metrics` present — the existing precedent for route-level checks).
- **A-11** (Integration, I-3) `metrics.volume.weeks` has length 2 and deep-equals `getWeeklyVolumeReport(db, userId, now).weeks.slice(0, 2)` for the same `now`, on a fixture that includes an **in-progress deload session** (its sets and its badge appear in `volume`, not in `training` — asserted, not hidden).
- **A-12** (Integration, I-5) With a logging `createTestDb` variant (§11.3; the recorder is reset after `migrate()` so only the call under test is counted), the statement count for one `getMetricsDashboard` call is **exactly**: **11** on fixture A (no active program, no default preset, **five selected** exercises each with completed in-window sessions) and **13** on fixture B (a default preset, no active program, five selected) — no inequality; **10** and **12** on the same fixtures with the selection cleared; and exactly 11 / 13 again on fixtures identical to A / B but with **one** selected exercise (selection-size independence — the property a per-exercise loop cannot have). Boundedness clause: every statement that reads `workout_sessions`, `set_logs`, `bodyweight_entries` or `recovery_entries` is bounded either by a `started_at`/`date` predicate in its own text or by an id list produced by such a bounded statement (step 3); the `users`, `programs`, `blocks`, `volume_presets`, `volume_landmarks` and `exercises`-by-id reads are exempt. Step 9's text contains `user_id` (RM-6).
- **A-13** (Integration, I-1) The same log for one `getMetricsDashboard` call contains no `INSERT`, `UPDATE`, or `DELETE`; `SYNC_ENTITIES` and all op schemas are byte-identical to `1282795`; the log for one `replaceSelection` call contains writes to `dashboard_estimate_selections` **only**.
- **A-14** (Integration) A session started at `23:30` account-local on the last day of week `W1` is counted in `W1`, not `W0`; a bodyweight entry dated `D` is "latest" even if its `created_at` is older than another entry dated `D − 1` (date, not receipt time, orders entries).
- **A-15** (Integration) Editing a historical set's weight or `is_warmup` through the sync path changes the next `GET /api/metrics` (`workSets`, volume, or the index) — computed on read, no cache.
- **A-16** (Wire) The screen imports `MetricsDashboardDto` from `@/domain/metrics/types` — there is no hand-mirrored UI copy to drift (§11.1); the integration test round-trips **the service's return value** through `JSON.parse(JSON.stringify(...))` and checks it against the same type with a `satisfies` assertion (the route cannot be executed on PGlite — A-10; its envelope `{ metrics }` is checked by e2e).
- **A-17** (UI) At 390×844 and 320×568: `document.documentElement.scrollWidth <= viewport width`; every link and button **inside the cards** ≥ 44 px tall (the nav is measured by its own extended spec, §12.1); exactly one `h1` and five `h2`s; the sparkline SVG has `aria-hidden="true"` and a following text line; the volume and recovery tables have column headers; with an empty selection the Current estimates card shows `No exercises selected. Choose up to five compatible exercises.` and the **Choose exercises** link; with a selected exercise that has no in-window sessions its row shows `No current estimate` in its stored position.
- **A-18** (UI) Tapping an estimate row navigates to `/exercises/[id]/strength` and shows the same `≈ … est.` string as the row; **Choose exercises** navigates to `/metrics/exercises`.
- **A-19** (UI) Offline states via `context.setOffline(true)` — the method the repository's own offline specs use, because `page.route` does not intercept fetches issued by the controlling service worker (which is active under e2e: the SW is disabled only in development and Playwright runs the production build). Three cases: (i) **cold navigation** offline to `/metrics` → the precached offline shell's route notice, `/metrics needs a connection. …` (no dashboard code runs); (ii) **warm page, no data yet** — the page document was served, the data fetch rejects → `Offline — metrics need a connection.`; (iii) **warm page with data** — after a successful load, going offline and tapping **Refresh** keeps the numbers under `Offline — showing metrics as of …`.
- **A-20** (UI) Copy test in the strength template: no lexical ban of §15 occurs in `copy.ts` strings or in the comment-stripped source of `src/ui/metrics/**`; every required sentence occurs; every estimate string on the page contains "≈", "(likely", and "est." (the tracker's own A-28 pattern in ADR-011's numbering — not this document's A-28).
- **A-21** (Boundary, I-8, I-12) `tests/unit/metricsBoundary.test.ts`: the metrics inventory is complete; `src/domain/progression/**` and `src/server/progression/**` never reach any metrics file; metrics never reaches `evaluateSession`, `loadProgression`, `repProgression`, `src/server/sync/**`, `src/server/today/**`, or the `recommendations` schema symbol; a synthetic edge `server/metrics/service.ts → server/recovery/service.ts` is detected as forbidden (the metrics service reads `recovery_entries` through the schema barrel, never through the recovery service — so the I-7 guarantee is a read of raw rows with no service logic); a synthetic edge from `domain/progression/engine.ts → domain/metrics/*` is detected.
- **A-22** (Negative control) `volume.spec.ts`, `strengthPage.spec.ts`, `bodyweightRecovery.spec.ts`, `offline-bodyweight-recovery.spec.ts`, `strengthBoundary.test.ts`, `warmupBoundary.test.ts`, `progressionBoundary.test.ts`, `strengthCopy.test.ts`, and the progression matrix pass **without modification**; `phase7Remediation.spec.ts` passes with exactly one change — "Metrics" added to its link list (§12.1); `git diff --stat 1282795 -- src/ui/strength src/server/strength src/domain/strength src/server/volume src/domain/volume src/server/history src/domain/sync src/server/sync src/sync src/app/sw.ts` is empty, and `drizzle/` differs from `1282795` by exactly the new `0012_*.sql` plus its journal/snapshot entries (no applied migration edited).
- **A-23** *Withdrawn* — it needed a "before" snapshot that cannot be captured after implementation starts, and A-22's `git diff --stat 1282795 -- src/server/today` gate is the stronger, cheaper form of the same guarantee (RL-12). Numbering is kept so the review's references stay valid.
- **A-24** (Device) On the iPhone PWA: Metrics reachable from the nav in one tap; no horizontal overflow; the strength row opens the detail page and Back returns with numbers intact; airplane mode on the open page then Refresh shows the offline line with the numbers still visible; a workout completed offline appears in Training after reconnect and a Refresh tap; the account's "today" is shown correctly late in the evening.
- **A-25** (Performance) The implementation report records the measured server time of `getMetricsDashboard` against the 3-year heavy-user fixture (§20 step 2 — a generator, not a checked-in dump) on the local Docker PostgreSQL 16, names the machine, and states pass/fail against the **local** budget (p95 ≤ 100 ms, §11.3); it makes no claim about production hardware. Prerequisite: `pnpm db:migrate` to 0011 locally (F-17).
- **A-26** (Integration, ownership) `replaceSelection` with an exercise id owned by another user, or a random UUID, → `invalid_exercise` naming that id, and the stored selection is unchanged (the transaction rolled back); `GET /api/metrics/selection` and step 8 never return another user's rows even when a foreign `exercise_id` is inserted directly into the table.
- **A-27** (Integration, ordering) `replaceSelection([c, a, b])` stores positions 1, 2, 3 in that order; `getMetricsDashboard(...).strength.selection` returns `c, a, b` regardless of name, value, or recency; `replaceSelection([b, a, c])` afterwards reorders without any row surviving at a stale position.
- **A-28** (Integration, limits) six ids → `invalid_input` (Zod), nothing written; a duplicate id → `invalid_input`; five ids → stored; direct SQL insertion of a sixth row fails on the check constraint or the unique position index (the constraint witness).
- **A-29** (Integration, eligibility) a bodyweight exercise, an `'off'` exercise, or an archived exercise **not already selected** → `invalid_exercise`; an archived, `'off'`, or equipment-changed exercise **already stored** is accepted on re-submission and renders its `archived` / `turned_off` / `not_available` state (§11.5 table).
- **A-30** (Integration, idempotence) the same body twice → identical rows both times (only `updated_at` changes); `[]` clears the selection; a re-submission after a clear restores it.
- **A-31** (Integration, concurrency) two `replaceSelection` calls with different lists started concurrently (the `recoveryConcurrency` test pattern) end with exactly one of the two lists stored whole — never a mix — and both calls resolve without error.
- **A-32** (Integration, cascade + cross-device read-back) hard-deleting a selected exercise that has no history removes its row and leaves the others at their positions; a selection written by one call is returned by a fresh `getMetricsDashboard` and by `getSelection` with identical order (the cross-device case has no client state to differ).
- **A-33** (UI) The editor at 390×844 and 320×568: Up/Down/Remove are ≥ 44 px, correctly disabled at the ends, and re-announce position; adding a sixth is impossible and the limit message is shown; Save writes once, returns to `/metrics`, and the card reflects the new order; Cancel writes nothing; going offline (`context.setOffline(true)`) before Save shows `Couldn't save — you're offline.` with the list intact.
- **A-34** (Negative control) With the selection cleared, `getMetricsDashboard` issues no strength fact query and `strength.selection` is `[]`; with five selected, `deriveStrengthReport`'s output for each equals the detail endpoint's `current` for the same rows (A-9 re-run through the selection path).

---

## 20. Implementation sequence

One implementation pass, one independent review, remediation and verification as needed, then device acceptance — the post-taxonomy lean workflow. Size M.

0. **Pre-code documentation tasks required by O-11** (owner-approved edits, done before code, not applied by this evaluation): `implementation-plan.md` gains a "Phase 9a — Metrics dashboard v1" line recording the partial phase, that OD-04 stays open, and the four deferred Phase 9 deliverables; `open-decisions.md` OD-04 gains the note that Phase 9a shipped inline SVG only and the decision point moves to "start of Phase 9b (charts)"; `mvp-scope.md` §2 item 1 drops tonnage from the dashboard's first cut (F-7, O-4); `data-model.md` gains §2.20 `dashboard_estimate_selections` (column-level authority, from §11.5); `pwa-offline-strategy.md` §2 names Metrics and its editor as online-only; `evidence-to-design.md` gains a row for "descriptive metrics display" whose not-justified column names the exclusions of §10 (the convention for any science-adjacent feature — the estimate rows inherit row 20, the recovery card inherits EVIDENCE-027's row); `README.md` route list; PI-002's consumer audit list gains "metrics dashboard" and "estimated 1RM tracker". These are the **only** documentation edits before device acceptance; step 5 holds the one edit that must wait.
0b. **Migration `0012`** — `dashboard_estimate_selections` per §11.5 via `drizzle-kit generate`; no deferrable constraint, so no manual patch; verified against the local Docker PostgreSQL 16 after `pnpm db:migrate` brings it to 0011 first (F-17). No seed, no backfill.
1. **Domain** — `src/domain/metrics/{types,training,bodyweight,recovery,estimateIndex,selection,index}.ts` (`selection.ts`: `putSelectionInputSchema`, the candidate filter built on `evaluateExerciseEligibility`, `SELECTION_MAX = 5`): pure functions over plain rows (`aggregateTrainingWeeks(sessions, windows)`, `summarizeBodyweight(entries, D)`, `summarizeRecovery(entries, D)`, `projectEstimateIndex(reportsByExercise)`), reusing `calendarWeekWindows`, `deriveStrengthReport`, `calendarDaysBetween`. Fixtures A-1…A-9. **Naming rules (two, both undocumented constraints of existing tests):** (1) no metrics file path may contain `strength` or `warmup` (case-insensitive) — `strengthBoundary.test.ts` and `warmupBoundary.test.ts` discover their feature inventories by path regex over `src/` (F-16); hence `estimateIndex`, not `strengthIndex`. (2) Because the copy scanner's source scope (§15) strips only comments and SCREAMING_SNAKE identifiers, no identifier, component name, prop or JSX attribute in `src/ui/metrics/**` may contain a source-scoped banned substring (`recommend`, `research`, `predict`, `improv`, `declin`, `streak`, `adherence`, `compliance`, `correlat`); the words that ordinary React code needs (`target`, `badge`, `score`, `trend`, `goal`, `fatigue`, …) are deliberately copy-scoped only, so `event.target` and a `DeloadBadge` component are fine.
2. **Server** — `src/server/metrics/service.ts` (`getMetricsDashboard(db, userId, now)`): the §11.2 plan, `getWeeklyVolumeReport` reused, the selection-bounded estimate query kept local; `src/server/metrics/selectionService.ts` (`getSelection`, `replaceSelection` with the advisory-lock transaction, §11.5); routes `src/app/api/metrics/route.ts` and `src/app/api/metrics/selection/route.ts` (`GET`, `PUT`). Integration tests A-10…A-15 and A-26…A-32 with a logging `createTestDb` variant. **Also in this step:** a fixture generator (`scripts/` or the test folder; a `tsx` script, the scratch-script gotchas apply) that inserts three years of heavy-user rows (≈ 5 sessions/week × 8 exercises × 5 sets, plus daily bodyweight and recovery) into a throwaway local database for A-25 — it does not exist today and A-25 cannot run without it; it is not checked in as a dump.
3. **UI** — `src/ui/metrics/{MetricsScreen,TrainingCard,EstimatesCard,VolumeCard,BodyweightCard,RecoveryCard,SelectionEditor,Sparkline,copy,format}.tsx|ts` (same naming rule: `EstimatesCard`, not `StrengthCard`; no `types.ts` — the screens import the domain DTOs); `src/app/(app)/metrics/page.tsx` and `src/app/(app)/metrics/exercises/page.tsx`; the nav link. The bodyweight `Sparkline` is a sibling of the strength one with **two behavioural differences**: `x` is the entry's day index in `[D − 89, D]` (so a gap is visible spacing, M-9), not the point index the strength component uses; and it draws **circles only, no `polyline`** — the strength component's connecting line across a 10-day gap would read as interpolation (RL-2); no deload semantics. Duplicated on purpose so `src/ui/strength/**` stays untouched (D-7 records the shared component for OD-04 time). Copy test A-20, boundary test A-21.
4. **E2E** — `tests/e2e/metrics.spec.ts` at 390×844 and 320×568 (A-17…A-19, A-33; the spec establishes its own selection through the editor and clears it in `finally`). Fixtures are created **by the spec itself** with timestamp-suffixed exercise names and past-dated sessions/entries (the `strengthPage.spec.ts` pattern), and deleted in `finally`: `tests/e2e/seed.ts` stays unchanged (it seeds no sessions, bodyweight or recovery rows), and nothing is written on "today" because `bodyweightRecovery.spec.ts` asserts a clean slate for the single account on today's date. `phase7Remediation.spec.ts` gains "Metrics" in its link list (§12.1).
5. **Docs after device acceptance** (one edit, separate and owner-approved): PI-004's trigger note in `docs/input/product-ideas.md`, which records the nav geometry actually measured on the device in step 4 / A-24 and therefore cannot be written earlier. Everything else is step 0.

**Files that must NOT change** (review gate): everything under `src/domain/progression`, `src/domain/sync`, `src/server/sync`, `src/sync`, `src/domain/strength`, `src/server/strength`, `src/ui/strength`, `src/domain/volume`, `src/server/volume`, `src/server/history`, `src/server/today`, `src/app/sw.ts`, `next.config.ts`, any applied migration (`0000`–`0011`). `drizzle/` gains exactly the generated `0012` files; `src/db/schema/index.ts` gains exactly one export.

**Independent-review focus:** I-3 equality proven by A-9/A-11 rather than by reading; I-7 read against the rendered DOM (no recovery value inside another card); A-12's bound check actually inspects SQL text; the offline states exercised against a blocked route, not a mocked `navigator.onLine`; the nav at 320 px; copy test coverage of every string including formatted ones.

Suggested session titles per the established convention: `S5-XH | Post-P08 | Implementation — Metrics Dashboard v1` and `O-Max | Post-P08 | Review — Metrics Dashboard v1`.

---

## 21. Decision ledger

### Binding recommendations for v1

- **B-1** One metrics screen `/metrics` plus the selection editor `/metrics/exercises`, one nav link **Metrics**, one read endpoint `GET /api/metrics`, one configuration pair `GET`/`PUT /api/metrics/selection`, five fixed cards in the order Current estimates, Training, Volume, Bodyweight, Recovery (O-10, binding).
- **B-2** Server-composed response with one `asOf`; account-timezone calendar weeks and days; the §4 metric table is the definition of record.
- **B-3** No persisted aggregate, no cache, no IDB store, no sync change, no bundle change, no `sw.ts` change (I-1, I-2); exactly one additive migration, `0012`, for the selection table (§11.5), which stores configuration only.
- **B-4** Volume via `getWeeklyVolumeReport` unchanged; strength via `deriveStrengthReport` unchanged over a window-bounded batched query; estimate strings via `formatEstimate`; the tracker's disclaimer sentences reused verbatim plus two metrics-owned lines (§9) (I-3).
- **B-5** The Current estimates card shows the athlete's selected exercises (≤ 5) in stored order, each with `current` + band, confidence and data age, or its explicit `No current estimate` / refusal state; links to the detail page; `best` and other reason codes stay on the detail page; a selection empty state that starts the editor flow (O-3, O-8, I-9, I-13, N-4).
- **B-10** The selection is one relational, user-scoped table with a check-constrained `position`, a unique `(user_id, position)`, cascade on exercise deletion, full-replacement `PUT` semantics under a per-user advisory lock, server-side eligibility validation, and no presence anywhere in the offline stack (§11.5).
- **B-6** Recovery is the last card, captioned unconditionally, and combines nothing (I-7); the only derived recovery values are days logged and mean sleep hours.
- **B-7** No percentage changes, arrows, trend lines, sums, rankings, adherence, tonnage, or landmarks on the dashboard (N-3…N-6, O-4, O-6).
- **B-8** Online only; warm-start offline keeps the data with an "as of" line; refetch on mount, Refresh and visibility (§14).
- **B-9** Boundary test, copy test, statement-count and no-write assertions, phone-viewport e2e, device acceptance (§19).

### Deferred (with triggers)

- **D-1** Tonnage per week/session. Trigger: a load-semantics model (PI-005 measurement profiles or ADR-011 D-3 `load_semantics`) that makes `weight_kg × reps` comparable across exercises.
- **D-2** Recommendation acceptance/modification statistics. Trigger: Phase 9 proper; needs its own read of `recommendations` and its own boundary claim.
- **D-3** Range selector (12 / 26 / 52 weeks; 180-day bodyweight). Trigger: one block of dashboard use and a stated need; the endpoint gains `?weeks=`, the queries stay bounded.
- **D-4** Volume trend chart (5-week bars) and any chart beyond a sparkline. Trigger: OD-04 resolved at Phase 9 start.
- **D-5** Bodyweight 30-day trend line (regression slope). Trigger: ≥ 60 entries and an explicit noise convention for the slope's uncertainty, without which the number is a claim of precision.
- **D-6** Averages of the 1–5 recovery ratings, labelled "average of your ratings". Trigger: owner request; must remain within a single field and carry its count.
- **D-7** A shared `src/ui/Sparkline.tsx` replacing the strength and metrics copies. Trigger: OD-04.
- **D-8** Lifting the window-bounded batched strength query into `src/server/strength/` for Release B's bundle field. Trigger: Release B implementation (its A-24 needs exactly this query).
- **D-9** A Today "Metrics" shortcut or a highlights strip; demoting Volume/Bodyweight/Recovery under Metrics. Trigger: device use showing the nav is the friction, and PI-004's design.
- **D-10** Consuming PI-002's training date (when it lands) for M-1/M-2/M-4 bucketing. Trigger: PI-002 implementation; the dashboard changes nothing until then (I-6).
- **D-11** Offline availability (IDB snapshot of the last response) or a "changes waiting to sync" line. Trigger: an actual offline use case for metrics, which the capability matrix does not foresee.
- **D-12** Per-muscle weekly frequency ("sessions per muscle per week" as a distribution descriptor, `volume-model.md` §5 rule 5). Trigger: owner interest; it needs per-set session grouping in the volume aggregate.
- **D-13** Session duration statistics. Trigger: a definition that excludes warm-up routine time (warm-up evaluation D-6) and a use. Note the data caveat: the sync path accepts a `completed` session with a null `completed_at` and never checks `completed_at ≥ started_at` (F-14), so a duration metric would first need a validity rule.
- **D-15** An additive `{ includePreset: false }` option on `getWeeklyVolumeReport` to drop up to four single-row statements per dashboard request. Trigger: A-25 misses its budget and the statement log shows the preset reads matter — which it will not at this scale.
- **D-16** Drag-and-drop ordering in the editor. Trigger: the athlete finds Up/Down slow with five rows; must keep the button path as the accessible equivalent.
- **D-17** Suggested candidates (e.g. "most trained this block") shown *inside the editor* as suggestions the athlete taps to add — never auto-applied to the card. Trigger: owner request; N-13 forbids auto-population, not suggestions.
- **D-18** A two-device conflict notice for the selection. Trigger: an observed overwrite that mattered; until then LWW on a five-row list the athlete can see is enough.
- **D-14** New recovery inputs as ideas only (resting heart rate, stress rating, HRV import): recorded here so the brief's "unless recorded as deferred ideas" is satisfied without a backlog edit. Trigger: registry evidence for the input (EVIDENCE-027 currently records none) **and** an owner decision; any such input would still be collection-only (OD-09).

### Rejected alternatives (and why)

- **X-1** Persisted `metrics_snapshots` / materialised views / server cache — no performance need exists (`data-model.md` §6); adds consistency liabilities (`architecture-plan.md` §7).
- **X-2** Client composition from five existing endpoints — N all-time strength scans, no weekly session aggregates, five loading states, five "todays".
- **X-3** Extending `/api/today-bundle` — bloats the offline lifeline and both caches for a screen not used offline.
- **X-4** Choosing a charting library now — OD-04 is Phase 9's decision; Release A's precedent is inline SVG.
- **X-5** Any readiness/recovery score — EVIDENCE-027, OD-09.
- **X-6** Correlation or overlay panels (sleep vs estimate, bodyweight vs volume) — n-of-1 uncontrolled data; EVIDENCE-027's unsafe inference.
- **X-7** Adherence / planned-vs-done — row 15 compliance scoring; rotation schedules have no weekly plan.
- **X-8** Cross-exercise strength totals or rankings — per-exercise within-athlete only (ADR-011 N-4; EVIDENCE-032 provisional).
- **X-9** Landmark progress bars / "% of MRV" — target framing (`volume-model.md` §4); GAP-01.
- **X-10** Streaks, badges, "best week", "PR" — `mvp-scope.md` §3; ADR-011 copy rules.
- **X-11** Changing the Volume service's in-progress convention or reusing `listHistorySessions` for counts — out of scope; the former is an accepted convention, the latter counts warm-ups.
- **X-12** An all-time strength index (showing `best` per exercise) — one all-time scan per exercise per dashboard load; the O-14 precedent keeps `best` on the detail endpoint.
- **X-13** A generic "date range" API (`?from&to`) in v1 — invites unbounded scans; the fixed windows are the performance boundary.
- **X-14** Storing the selection in `localStorage` or an IndexedDB preference — does not cross devices (O-3 requires it), and IndexedDB is the offline workout's store, which the online-only dashboard must not enter.
- **X-15** A JSON array column on `users` — cannot enforce the five-row limit, per-row ownership, or the FK to `exercises`; a deleted exercise would linger as a dangling id.
- **X-16** A third `exercises.strength_estimate` value ("dashboard") — couples presentation to the eligibility switch O-3 says the selection must never affect, and cannot express order.
- **X-17** Carrying the selection in `TodayBundle` or the active-session aggregate — no offline consumer exists, and it would put configuration into the caches the offline stack guards.
- **X-18** Per-row PATCH / "move" endpoints — order would then depend on request arrival, which a retry could scramble; full replacement is the only idempotent form.

### Product decisions — decided by the owner (addendum of 2026-09-06)

All eleven are decided; the entries below are kept as the record of what was asked and recommended. Where the owner modified the recommendation (O-3, O-7, O-8), the addendum at the top of this document is the binding text.

- **O-1** Nav placement: **Metrics** after **History** (recommended), and Volume/Bodyweight/Recovery stay top-level in v1 — or Metrics replaces them as the single entry with the three screens reachable only from cards (smaller nav, longer path to quick logs). Note the precedent: the warm-up evaluation's O-4 deliberately avoided an eighth top-level item by placing routine management under Programs; a dashboard is a destination in its own right, so this evaluation recommends the eighth link, but the owner may prefer the consolidation variant to hold the nav at seven.
- **O-2** Training range and row shape: 8 calendar weeks, **one compact line per week** (recommended; two mesocycle halves in ≈ 200 px, so the card below it stays near the first viewport) vs 12 weeks, or 8 weeks with the earlier two-line rows.
- **O-3** *(as asked)* Strength index ordering: alphabetical (recommended; stable positions) vs most-recent-session first. **Owner-modified:** neither — the card shows an explicit athlete-curated selection of up to five compatible exercises in a user-defined, persisted order (addendum; §9, §11.5).
- **O-4** Confirm tonnage is excluded from v1 (recommended) despite `mvp-scope.md` §2 / Phase 9 listing it — or include it with a caption naming the load-semantics caveat.
- **O-5** Confirm no averages of the 1–5 recovery ratings in v1 (recommended); mean sleep hours only.
- **O-6** Confirm no volume landmarks/bands on the dashboard (recommended; the Volume screen carries them with their provenance caption) — or show the band text per group with the same caption repeated.
- **O-7** *(as asked)* Archived exercises with a current estimate listed and badged (recommended) vs hidden. **Owner-modified:** an already-selected archived exercise stays, badged, removable (addendum; §7).
- **O-8** *(as asked)* Whether a global footer count of unlisted exercises includes permanently ineligible ones. **Owner-modified:** the footer count is removed entirely; the selection UI offers only compatible, not-switched-off exercises, and a selected exercise without current evidence shows a per-row empty state (addendum; §6, §9).
- **O-9** 30-day bodyweight change defined as the difference of two 7-day averages 30 days apart (recommended) vs latest-entry-minus-entry-30-days-ago (noisier) vs omitted.
- **O-10** Card order: **Current estimates first, Training second** (recommended — it is the only card whose content is not one nav tap away, and the feature's stated justification is its discoverability; at the repository's tight 390×664 measurement viewport a Training card above it would push the first estimate row to or below the fold) vs Training first. If the owner prefers Training first, A-17 gains a measured assertion in HIGH-2's style: the first estimate row's `boundingBox().y + height ≤ 664` at 390×664.
- **O-11** Partial Phase 9 before OD-04 (RL-14): `implementation-plan.md` Phase 9 opens with "Resolve OD-04 (default Recharts) first" and `open-decisions.md` sets OD-04's decision point at the start of Phase 9; this dashboard builds part of Phase 9 while leaving OD-04 open (inline SVG only) and defers four of Phase 9's five named deliverables. Recommended: approve it as an owner-recorded **partial phase ("Phase 9a")** with OD-04 explicitly still open and the plan/OD-04/`mvp-scope.md` edits of §20 step 0 — vs resolving OD-04 first and building the charts with it, vs declining the partial phase. This is a sequencing decision the plan reserves for the owner; the evaluation does not make it.

---

## 22. Modifications recommended to the implicit proposal (summary)

The brief and the architecture package's Phase 9 sketch together imply "an analytics dashboard: e1RM trends, tonnage, per-muscle volume trend charts, recommendation acceptance stats, history search + filters". This evaluation narrows it:

- **M-1** Replace "e1RM trends per exercise" with a **current-estimate index** linking to the existing trend page; the trend already ships (Release A) and re-hosting it under a charting library is OD-04's job, not v1's.
- **M-2** Drop **tonnage** until load semantics exist (O-4, D-1).
- **M-3** Replace "per-muscle volume trend chart" with **this week vs last week** effective sets, reusing the existing report; the chart waits for OD-04 (D-4).
- **M-4** Drop **recommendation acceptance stats** from the dashboard's first cut (D-2).
- **M-5** Drop **history search + filters** — they belong to the History screen, not a metrics surface.
- **M-6** Add **bodyweight** (7-day average, 30-day change, sparkline) and **recovery** (last 7 days as entered), which the Phase 9 sketch omitted but the brief requires, with recovery constrained to informational display (I-7).
- **M-7** Add the **strength entry point** requirement explicitly (the Current estimates card, athlete-curated per O-3, plus its "Choose exercises" link and per-row links to the tracker).
- **M-8** Make **server composition with one clock** a requirement, not an implementation choice (I-4).

---

## Appendix A — Question-by-question index

| Brief requirement | Answered in |
| --- | --- |
| Inspect the repository before proposing | §2 |
| Discoverable central entry point for strength estimates | §9, §12.2, B-5 |
| Deliberately small v1 — exact metrics | §3, §4 (M-1…M-12) |
| Aggregation rules | §4, §11.2 |
| Time ranges | §4, §5, O-2 |
| Account-timezone semantics | §5, A-1, A-14 |
| Sparse / null data | §6, A-4, A-5 |
| Archived exercises | §7, A-8, O-7 |
| Deload presentation | §8 |
| Navigation | §12.1, O-1 |
| Mobile layout | §12.2, A-17 |
| Accessibility | §13, A-17 |
| Offline / staleness | §14, A-19, A-24 |
| Query / performance boundaries | §11.2, §11.3, I-5, A-12, A-25 |
| Computed-on-read, existing schemas, necessary API work | §1, §11, I-2, X-1…X-3 |
| Recovery informational; no readiness score / correlations / coaching / progression changes / causal claims | §10, §15, I-7, I-8, X-5, X-6 |
| Nutrition and new recovery inputs | N-10, D-14 |
| Minimal user flow | §3.3 |
| Metric-definition table | §4 |
| Wireframe-level layout | §12.2 |
| Invariants | §16 |
| Non-goals | §17 |
| Risks | §18 |
| Acceptance criteria | §19 |
| Implementation sequence | §20 |
| Owner decisions | §21 (O-1…O-11) |
| Useful vs misleading comparisons | §10 |

## Appendix B — Repository findings recorded during the evaluation (not fixed here)

- **F-1** `GET /api/bodyweight` and `GET /api/recovery` return every row ever logged with no range or limit (`listBodyweightEntries`, `listRecoveryEntries`). Harmless at single-user scale; the dashboard does not reuse them.
- **F-2** `README.md` still states "Volume tracking (Phase 6) is not yet built" and "Phases 0–5 … deployed" although Phases 6–8, the MVP v1 acceptance, warm-up routines, and Release A have shipped — documentation drift.
- **F-3** `implementation-plan.md` §1.2 pins "TanStack Query (server state)"; no `QueryClientProvider` exists and the house convention is plain `fetch` (`StrengthScreen.tsx` comment). Drift, not a defect.
- **F-4** `HistoryList.tsx` renders `new Date(s.startedAt).toLocaleDateString()` and `HistoryDetail.tsx` renders `toLocaleString()`, both in the **device** timezone, while Volume and Strength render account-local dates. A session started at 00:30 account-local shows a different date in History than in Volume/Metrics on a phone set to another zone.
- **F-5** `HistorySessionListItem.setCount` counts warm-up rows as sets; the label "sets" on the History list therefore differs from the dashboard's "work sets".
- **F-6** Volume counts an in-progress session's logged sets (documented convention); History, the tracker, and the proposed Training card count completed sessions only. Accepted asymmetry; disclosed in copy (R-2).
- **F-7** `mvp-scope.md` §2 item 1 and `implementation-plan.md` Phase 9 list tonnage; this evaluation recommends deferring it (O-4/D-1) — the two documents will need an owner-approved edit if O-4 is accepted.
- **F-8** `pwa-offline-strategy.md` §2's capability row for analytics is consistent with this design; it may name Metrics explicitly after acceptance.
- **F-9** PI-002's consumer audit list ("history, weekly volume, scheduling, progression, exports, and offline sync") will need "metrics dashboard" and "estimated 1RM tracker" added — both key sessions by `started_at`.
- **F-10** `exercises` has no index on `archived_at` and none is needed; the dashboard never filters by it.
- **F-11** `HistoryList.tsx`, `VolumeScreen.tsx`, `BodyweightHistoryList.tsx` and `RecoveryHistoryList.tsx` call `res.json()` without checking `res.ok`; a 401 or 500 JSON body is stored as data and either renders as an empty list or throws at render (`data.weeks.map`). The metrics screen must not copy this.
- **F-12** `mvp-scope.md` F10 describes recovery fields as "sleep quality, soreness, motivation"; the schema and UI have `sleep_hours`, `sleep_quality`, `readiness`, `soreness` — documentation drift.
- **F-13** The 1–5 recovery scales are shown as bare numbers with no labelled direction anywhere (`RecoveryCheckIn.tsx`, `NullableSliderField.tsx`); nothing states whether soreness 5 is "very sore". Any future display that colours or ranks these values would first need the labels.
- **F-14** The sync write path accepts `status: 'completed'` with `completedAt` absent or null, allows `completedAt` before `startedAt` while in progress, and patches `startedAt` on an in-progress session despite a code comment calling it immutable (`src/server/sync/service.ts`); no DB constraint ties `completed_at` to `status`. The real client always sends consistent values, but any duration metric must treat these columns as unvalidated (D-13).
- **F-15** `users.timezone` and `users.week_starts_on` have no writer anywhere in the application (§5); `volume-model.md` §2's "(setting)" describes an aspiration.
- **F-16** Two suites discover feature inventories by path regex over `src/`: `strengthBoundary.test.ts` fails outright on any `/strength/i` file outside its five known directories plus the seed reconcile; `warmupBoundary.test.ts` instead auto-roots every `/warmup/i` file and walks it, so a metrics file so named would be treated as warm-up code and fail that suite's forbidden-import claims (it imports the volume service). Either way the practical rule is the same — an undocumented naming constraint on every future feature (§20 step 1).
- **F-17** The local development database (`gymapp` in the `gym-app` compose project) has migrations through `0010` applied; `0011_happy_celestials.sql` (the `strength_estimate` column) is not yet applied locally, so the strength page and any metrics implementation need `pnpm db:migrate` first. Production state was not inspected.

## Appendix D — Revision log (2026-09-06, against `metrics-dashboard-architecture-review.md`)

Every §7 item of the review is resolved in place; the five-card / read-only / one-endpoint design, the boundaries confirmed in the review's §4, and the no-migration / no-cache posture are unchanged. Owner decisions were re-worded, not made.

| Item | Resolution |
| --- | --- |
| RH-1 | Option (b), deliberate divergence: M-1's future guard kept as tracker parity; I-6 restated with the named divergence; A-1 reworded ("counts in neither `training` nor `strength`"); §4 rule, §8, R-1/R-2 and a new A-2 divergence fixture (iii) state it |
| RH-2 | Option (a): step 3 projects `{ session_id, is_warmup }` rows; the domain filters and counts (M-2, §4 rule, A-2) |
| RM-1 | §4 M-5 now specifies the single two-week DTO; `raw` travels unrendered |
| RM-2 | Exact counts per fixture (11 / 13), ≥ 5 in-window exercises, exercise-count-independence fixture, "no headroom" sentence replaced; totals recomputed after RL-8 |
| RM-3 | I-11 restated around step 8's `ORDER BY` (now contractual in §11.2); A-6 split (a)/(b)/(c) with the duplicate-exercise fixture |
| RM-4 | §8 states both deload meanings and all three divergence cases; A-11's fixture is an in-progress deload; shared word kept with a stated rationale and a Volume caption |
| RM-5 | Mean-sleep line prints its own count (M-12, wireframe, §15 must-appear, A-5) |
| RM-6 | Step 9 carries `user_id = :userId` with the tracker's rationale; A-12 checks it |
| RM-7 | §15 split into source-scoped and copy-scoped bans; re-export-by-value requirement stated; identifier naming rule added to §20 step 1 |
| RM-8 | Budget restated for the measured machine (local p95 ≤ 100 ms as proxy); first remedy named as a migration; A-25 reworded |
| RL-1 | Text alternative is a summary (count, first, latest, lowest, highest); "every number is text" softened |
| RL-2 | Points only, no `polyline` (M-9, §20 step 3) |
| RL-3 | A-16 decodes the service's return value |
| RL-4 | A-19 split into cold / warm-empty / warm-with-data |
| RL-5 | `exact: true` made the binding locator rule |
| RL-6 | §12.1 describes `phase7Remediation.spec.ts` as it is; `/metrics` covered by A-17 |
| RL-7 | `raw` omission added to R-1 |
| RL-8 | `olderEntryCount` and its statement dropped; M-6 empty state simplified |
| RL-9 | Deload sentence reduced to "Deload sessions are not counted." |
| RL-10 | `[P]` labels on every window and threshold (§4) |
| RL-11 | I-2 given named patterns, an anti-vacuity witness and a negative control |
| RL-12 | A-23 withdrawn in favour of A-22 |
| RL-13 | Visibility refetch labelled new, with its cost stated (§11.3) |
| RL-14 | O-11 added; §20 step 5 names the "Phase 9a" edit |
| RL-15 | "always run" corrected (§11.2 steps 4–7) |
| RL-16 | 2.4 → ≈ 2.2 |
| RL-17 | `tabular-nums` labelled new (§12.2) |
| O-2 / O-10 | Defaults updated as instructed (one line per week; Current estimates first), left to the owner |

No Low is retained open.

### Revision 2 — 2026-09-06, owner decisions (after `metrics-dashboard-architecture-revision-verification.md` returned VERIFIED)

| Change | Where |
| --- | --- |
| Dated owner-decision addendum inserted at the top; O-1…O-11 binding; O-3, O-7, O-8 owner-modified | addendum, §21 |
| Automatic estimate index replaced by an athlete-curated selection of ≤ 5 compatible exercises with a stable stored order; `trainedWithoutEstimateCount`, its footer line, query clause, DTO field, copy and criteria removed | §1, §3, §4 M-4, §6, §7, §9, §11.1, §12.2, §15, A-7, A-8, A-17, A-18 |
| Persistence model for the selection: `dashboard_estimate_selections` (migration `0012`), constraints, ownership, cascade, empty initial state, read/write contracts, idempotent full replacement, validation, advisory-lock concurrency, change-behaviour table, offline exclusion | new §11.5; §11.4 additions; I-1, I-2, I-5, I-12, new I-13 |
| Query plan: selection join is step 8, strength facts bounded by selected ids are step 9 (skipped when empty); exact statement counts restated (11/13 with a selection, 10/12 empty; selection-size independence) | §11.2, §11.3, A-12, A-13 |
| Editor UI (`/metrics/exercises`): Move up / Move down / Remove buttons, native select + Add, Save = one replacement; accessibility and offline behaviour | §9, §12.2, §13, §14 |
| New criteria A-26…A-34 (ownership, ordering, limits, eligibility, idempotence, concurrency, cascade + cross-device read-back, editor UI, negative control); must-not-change list allows exactly `0012` and one schema-barrel export | §19, §20 |
| Ledger: B-1, B-3, B-5 revised; B-10, N-13, R-12…R-14, D-16…D-18, X-14…X-18 added; O-11 pre-code documentation tasks listed as §20 step 0 | §17, §18, §20, §21 |
| Untouched by design: metric algorithms (M-1…M-3, M-5…M-12), timezone semantics, volume semantics, recovery posture, the five-card structure, and every finding the verification confirmed | — |

### Correction log — 2026-09-06, against `metrics-dashboard-owner-modification-verification.md` (REVISION REQUIRED: OM-1 Medium, OM-2…OM-8 Low)

| Item | Correction |
| --- | --- |
| OM-1 | I-2's enforcement re-scoped to **declared column names** (schema builders and migration DDL), the table-name pattern `/dashboard/i` dropped and `/metrics?_/i` replaced by `/e1rm_?(kg\|value)/i`; the negative control is stated against the schema **after** `0012`; witnesses named. The invariant's substance is unchanged |
| OM-2 | §4's archived-exercise rule now reads "appear in M-4 only when selected (O-3/O-7)", consistent with M-4, §7 and A-8 |
| OM-3 | §20 step 5 folded into step 0 (which now carries the evidence-to-design row's description); step 5 keeps only PI-004's post-acceptance trigger note; O-11's ledger entry repointed to step 0 |
| OM-4 | R-8 restated as selection-table integrity drift (the automatic-index growth risk no longer exists) |
| OM-5 | R-10 and §11.3 row counts corrected to the renumbered plan (steps 4–7 ≈ 2,400, step 3 ≈ 1,600, step 9 ≈ 300–800) |
| OM-6 | §11.3's "no migration boundary" reworded against B-3's `0012` |
| OM-7 | §13's card-link list uses "Choose exercises"; the `exact: true` rule restated there |
| OM-8 | A-20's A-28 reference qualified as the tracker's; A-25 moved back before A-26 |
| 5.1 / 5.2 (non-blocking) | §11.5 states the two-int advisory-lock derivation explicitly (fixed namespace + per-user key, not a reuse of `userVolumeLockKeys`); §11.3/§11.5 state that validation is one or two reads and that the write-path count is not a criterion |
| 5.3 | Carried forward unchanged by choice, as before |

## Appendix C — Working-tree impact

Created: `docs/reviews/metrics-dashboard-architecture-evaluation.md` (this file), revised in place on 2026-09-06 against the independent review, again for the owner-decision addendum, and again against the owner-modification verification; none of the review or verification reports was modified. Nothing else was created, modified, or deleted. The pre-existing uncommitted changes at evaluation time — `CLAUDE.md` (modified), `HANDOFF.md` (deleted) with `HANDOFF(depracted).md` (untracked), `docs/input/product-ideas.md` (modified), `.claude/skills/` (untracked), `docs/reviews/repository-agent-workflow-evaluation.md`, `docs/reviews/repository-agent-workflow-review.md`, `docs/reviews/warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md` (untracked) — are untouched. No commit, push, deployment, migration, or production access was performed. Repository inspection was read-only.
