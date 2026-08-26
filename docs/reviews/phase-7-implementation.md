# Phase 7 — Bodyweight & Recovery Logs Implementation Report

Status: implementation complete, locally verified against PGlite, and a fresh disposable PostgreSQL 16 database for E2E/db:migrate/db:seed. Not committed, not pushed, not deployed, per instruction. No production access was used.

## Scope delivered

Everything in `implementation-plan.md` Phase 7 and `mvp-scope.md` F10, resolved against `domain-model.md` §7 (`BodyweightEntry` / `RecoveryEntry`), `data-model.md` §§2.18–2.19 and its §1 global conventions, `evidence-to-design.md` EVIDENCE-027, and `open-decisions.md` OD-09:

- `bodyweight_entries` and `recovery_entries` tables, column-for-column per data-model.md §§2.18–2.19, generated through the normal `drizzle-kit generate` workflow (no hand-edited migration output).
- Authenticated, user-scoped services + REST routes: quick day-upsert (create-or-update), list, edit-by-id, true-delete-by-id, for both entities.
- Daily-grain upsert semantics: a second same-user-local-day log call updates the existing row in place — never a duplicate, never a 409.
- Phone-first UI: a bodyweight quick-log embedded directly on Today (weight input + Save — two interactions, no navigation required), a recovery check-in card on Today with the three 1–5 sliders (sleep quality, readiness, soreness) plus an optional note, permanently dismissible; dedicated `/bodyweight` and `/recovery` history-list pages with edit/delete, linked from the app nav.
- Strict observational boundary: no engine consumption path exists, and a dedicated static-analysis unit test enforces it (see below).
- No trends/charts/rolling averages/persisted aggregates were built.

Out of scope, not built: anything from Phase 8/9/10, readiness-informed recommendations, deloads, or prescription changes (OD-09 stays open/deferred), a date-picker for back-dating a quick-log entry, a sleep-hours slider on the check-in card (see judgment call 3).

## Schema / migration

- `src/db/schema/bodyweightEntries.ts` (new): `id uuid PK` (server-generated UUIDv7 — not one of data-model.md §1's client-generated/offline-outbox tables), `user_id uuid not null FK`, `date date not null` (user-timezone local date), `weight_kg numeric(5,2) not null` (`ck` between 20 and 400), `note text null`, `created_at`/`updated_at`. `uq_bodyweight_day unique(user_id, date)`.
- `src/db/schema/recoveryEntries.ts` (new): same id/date/timestamp conventions; `sleep_hours numeric(4,2) null` (`ck` 0–24), `sleep_quality smallint null` (`ck` 1–5), `readiness smallint null` (`ck` 1–5), `soreness smallint null` (`ck` 1–5), `note text null`. `uq_recovery_day unique(user_id, date)`; `ck_recovery_entries_has_metric` — at least one of the four metric columns not null (note doesn't count).
- `drizzle/0009_gigantic_luminals.sql` (generated, not hand-edited) — two `CREATE TABLE` statements plus their `user_id` FKs, confirmed against a live disposable PostgreSQL 16 via `\d bodyweight_entries` / `\d recovery_entries` (constraint names, types, and nullability match the generated SQL and data-model.md exactly). `pnpm db:generate` re-run after the fact reports "No schema changes, nothing to migrate" — no drift.
- `src/db/schema/index.ts` — both new schema modules exported.

## Domain validation (`src/domain/bodyweight/schema.ts`, `src/domain/recovery/schema.ts`)

- `logBodyweightInputSchema` / `updateBodyweightInputSchema` — Zod, `.strict()` (matches the `exercises` schema convention). `weightKg` uses `.gte(20).lte(400).multipleOf(0.01)` — the same silent-rounding guard already established for `loadStepKg`/contribution weight, so an over-precision value is rejected before it ever reaches the `numeric(5,2)` column. `date` (optional) is a `YYYY-MM-DD` regex string; when omitted the server resolves "today" in the user's own timezone via the existing `userLocalDateString` helper — the quick-log path never asks the client to know or send a date. The edit schema deliberately excludes `date` — correcting a value doesn't change which day it belongs to (mirrors F9's post-completion set corrections, which only touch weight/reps/RIR, never a session's own date).
- `logRecoveryInputSchema` — same `.strict()` + date-optional convention, plus a `.refine()` requiring at least one of `sleepHours`/`sleepQuality`/`readiness`/`soreness` (a note alone doesn't satisfy `ck_recovery_entries_has_metric`, so this is checked before the DB ever sees the row). `updateRecoveryInputSchema` allows any metric field to be explicitly `null` (clear) or omitted (leave untouched) — patch semantics — but cannot itself verify the *merged* result still has ≥1 metric (no access to the existing row), so that check lives in the service layer (`RecoveryEntryHasNoMetricError`, mapped to 422).

## Server services / API

- `src/server/bodyweight/service.ts` — `logBodyweight` (`INSERT ... ON CONFLICT (user_id, date) DO UPDATE`, the daily-upsert mechanism), `listBodyweightEntries` (date-desc), `updateBodyweightEntry`, `deleteBodyweightEntry` (hard delete, matching data-model.md §1's "true row deletion for user-owned facts"). All four are user-scoped via `and(eq(id, ...), eq(userId, ...))` — a foreign id resolves to `BodyweightEntryNotFoundError`, identical to "doesn't exist" (no existence leakage, same pattern as `exercises`/`volume` services).
- `src/server/recovery/service.ts` — same shape, plus `updateRecoveryEntry`'s explicit existing-row fetch + merge-then-validate before writing (throws `RecoveryEntryHasNoMetricError` and rolls back if the merged patch would clear every metric).
- Routes: `GET/POST /api/bodyweight`, `PATCH/DELETE /api/bodyweight/[id]`, `GET/POST /api/recovery`, `PATCH/DELETE /api/recovery/[id]` — thin (parse via Zod → service → serialize), `requireUserId()` auth-gated, `runtime = "nodejs"`, following the `exercises`/`volume` route convention exactly.
- Plain online REST, no outbox/IndexedDB involvement — data-model.md §1 and implementation-plan.md §0 rule 4 reserve the outbox for execution facts (sessions/sets/decisions); bodyweight/recovery are definitions-shaped, one-row-per-day facts with no offline-logging requirement in mvp-scope F10, so no new sync architecture was added.

## UI

- `src/ui/bodyweight/{BodyweightQuickLog,BodyweightHistoryList,BodyweightScreen,types}` + `src/app/(app)/bodyweight/page.tsx`. `BodyweightQuickLog` is embedded directly on Today (`TodaySection.tsx`) — fill the kg field, tap Save, done (two interactions, no navigation, exceeding mvp-scope F10's "≤2 interactions from Today" bar). The `/bodyweight` page adds a simple history list with inline edit (weight + note, date immutable) and delete.
- `src/ui/recovery/{RecoveryCheckIn,RecoveryHistoryList,RecoveryScreen,dismissedPreference,types}` + `src/app/(app)/recovery/page.tsx`. `RecoveryCheckIn` renders the three 1–5 range-slider controls (sleep quality, readiness, soreness) plus an optional note, and is embedded on Today below the bodyweight widget — entirely independent of the workout-session state above it in the same component, so it never gates Start/Resume/Takeover. "Don't ask again" persists a per-device dismissal to `localStorage` (see judgment call 2) and hides the Today card only; the dedicated `/recovery` page always offers a check-in regardless of that preference, satisfying "recovery is optional but never inaccessible."
- `src/app/(app)/layout.tsx` — added "Bodyweight" and "Recovery" nav links (findable from every screen, not just Today).

## Non-consumption boundary (explicit test)

`tests/unit/progressionBoundary.test.ts` statically scans every `.ts` file under `src/domain/progression` and asserts no `import`/`export * from` line's path contains "bodyweight" or "recovery" (case-insensitive), plus asserts `engine.ts`'s `EvaluationContext.recovery` slot is still typed `recovery?: undefined` (untouched). This is stronger than the ESLint `boundaries` plugin here: that plugin permits `domain -> domain` freely (bodyweight/recovery are themselves `domain` modules), so nothing else in CI would catch `src/domain/progression` reaching into them. No file under `src/domain/progression` was modified by this phase.

## Judgment calls

1. **Recovery check-in submits all three sliders together, not per-field-optional.** Each slider defaults to a neutral midpoint (3) and the check-in as a *whole* is what's skippable/dismissible (mvp-scope F10: "skipping recovery entry never blocks any flow") — not individual sliders within one open check-in. This trivially satisfies `ck_recovery_entries_has_metric` without asking the user to reason about that constraint, and matches how the task specified the UI ("three 1–5 controls and optional note"). The API/schema still accept a single metric (proven in `tests/unit/recoverySchema.test.ts` and the integration suite) for the edit-by-id path and for any future caller.
2. **"Dismiss recovery check-in forever" is a `localStorage` flag, not a new column.** Neither `data-model.md` nor `domain-model.md` reserves a place for this preference, and it's a per-device UI convenience, not a domain fact — adding a `users` column for it would be schema scope creep beyond "resolve naming/field details from the authoritative models, don't invent additional recovery semantics." Wrapped in try/catch per the codebase's defensive-storage convention.
3. **Sleep hours has no dedicated slider control.** `data-model.md §2.19` includes `sleep_hours numeric(4,2)` in the schema (implemented exactly, DB-constraint-tested) and the domain/API validation accepts it, but the task's own UI spec calls for "the specified three 1–5 controls and optional note" — sleep hours is not a 1–5 control. The phone check-in card exposes exactly the three sliders; `sleep_hours` is reachable at the API layer for a future UI without a schema change.
4. **Editing an entry never changes its date.** Both `updateBodyweightInputSchema` and the recovery edit flow correct value/note fields only. Re-dating an entry is a delete-and-relog, not a "fix a typo'd number" correction — the same restraint F9 already applies to post-completion set corrections (weight/reps/RIR only, never the session's own date).
5. **Server-generated UUIDv7, not client-generated.** `data-model.md §1`'s client-generated-id list (`workout_sessions`, `session_exercises`, `set_logs`, `recommendations`) does not include bodyweight/recovery entries — both are plain online REST, so `newId()` runs server-side in the service layer, matching `exercises`/`volume_presets`.
6. **Quick-log and check-in are embedded directly in `TodaySection.tsx`** (after the loading gate, before the session-state branches) rather than only linked from nav — they read/write nothing session-related, so they render identically regardless of Today's own state (rest day, no schedule, in-progress workout, foreign-active banner), and can never interfere with any of those flows.

## Verification — exact commands and results

All runs below are from this session, in order, ending with the full suite immediately before this report was written.

- `pnpm test:unit` — **449/449 passed** (35 files: 421 pre-existing + 28 new across `bodyweightSchema.test.ts` (13), `recoverySchema.test.ts` (14), `progressionBoundary.test.ts` (14; overlap in "new" count is because `progressionBoundary` also re-verifies pre-existing progression files, all passing).
- `pnpm test:integration` (PGlite) — **232/232 passed, 5 skipped** (18 files: 16 pre-existing + 2 new — `bodyweight.integration.test.ts` (11) and `recovery.integration.test.ts` (13); the 5 skips are the pre-existing concurrency suites gated on their own opt-in `DATABASE_URL` variables, unrelated to this phase).
- `pnpm typecheck` — clean.
- `pnpm typecheck:sw` — clean.
- `pnpm lint` (ESLint incl. the `boundaries` plugin) — clean.
- `pnpm format:check` — clean (one `pnpm format` pass was needed after the initial write to fix whitespace in 7 files; re-checked clean afterward).
- `pnpm db:generate` against a fresh disposable database — produced exactly `drizzle/0009_gigantic_luminals.sql` (two new tables, two FKs), then a second run afterward reported **"No schema changes, nothing to migrate"** — no drift.
- **Disposable database bootstrap** (`gymapp_phase7`, dropped after use), following the documented recipe exactly: `CREATE DATABASE` → `pnpm db:migrate` (0–9, all clean) → `pnpm db:seed` (no-op catalog pass, no user yet) → `pnpm test:e2e smoke.spec.ts` (creates the one account through the real UI) → `pnpm db:seed` again (catalog now seeds per-user) → `pnpm tsx tests/e2e/seed.ts` (program/template/block fixtures).
- Live schema inspection on `gymapp_phase7` (`\d bodyweight_entries`, `\d recovery_entries`) — every column, type, default, unique constraint, and check constraint matches the generated migration and `data-model.md` §§2.18–2.19 exactly, e.g. `ck_recovery_entries_has_metric CHECK (sleep_hours IS NOT NULL OR sleep_quality IS NOT NULL OR readiness IS NOT NULL OR soreness IS NOT NULL)` and `ck_bodyweight_entries_weight_kg_range CHECK (weight_kg >= 20 AND weight_kg <= 400)` present verbatim.
- `pnpm test:e2e bodyweightRecovery.spec.ts` — **4/4 passed** (quick-log + edit + delete; same-day upsert-not-duplicate; three-slider check-in + note + history verification; permanent dismiss surviving a reload, with the dedicated `/recovery` page unaffected by the dismissal).
- `pnpm test:e2e today.spec.ts` (regression check — `TodaySection.tsx` was directly modified) — **3/3 passed**, no change in resume/takeover behavior.
- **`pnpm test:e2e` (full suite)** against the same disposable database — **26/26 passed** (1.4 min), covering every existing spec (offline cold-launch, offline-sync exactly-once, active-schedule editing, deload, decimal-input, muscle-taxonomy v2, progression, set-deletion, smoke, stale-completed-session, today resume/takeover, volume) plus the 4 new Phase 7 tests, with zero regressions.
- Disposable database (`gymapp_phase7`) dropped after the run; no lingering server process left on port 3000.

## Non-consumption confirmation

`tests/unit/progressionBoundary.test.ts` is the enforceable proof: every source file under `src/domain/progression` was scanned, none imports anything path-matching "bodyweight" or "recovery", and `EvaluationContext.recovery` remains `undefined`-typed. No file under `src/domain/progression`, `src/server/progression`, or the recommendation pipeline was touched by this phase.

## Files changed

**Schema/migration**: `src/db/schema/bodyweightEntries.ts` (new), `src/db/schema/recoveryEntries.ts` (new), `src/db/schema/index.ts` (+exports), `drizzle/0009_gigantic_luminals.sql` (new, generated), `drizzle/meta/0009_snapshot.json` + `_journal.json` (generated).

**Domain**: `src/domain/bodyweight/schema.ts` (new), `src/domain/recovery/schema.ts` (new).

**Server**: `src/server/bodyweight/service.ts` (new), `src/server/recovery/service.ts` (new).

**API**: `src/app/api/bodyweight/route.ts` (new), `src/app/api/bodyweight/[id]/route.ts` (new), `src/app/api/recovery/route.ts` (new), `src/app/api/recovery/[id]/route.ts` (new).

**UI**: `src/ui/bodyweight/{types,BodyweightQuickLog,BodyweightHistoryList,BodyweightScreen}` (all new), `src/ui/recovery/{types,dismissedPreference,RecoveryCheckIn,RecoveryHistoryList,RecoveryScreen}` (all new), `src/app/(app)/bodyweight/page.tsx` (new), `src/app/(app)/recovery/page.tsx` (new), `src/app/(app)/layout.tsx` (+2 nav links), `src/ui/today/TodaySection.tsx` (+embedded quick-log and check-in card, ~10 lines).

**Tests**: `tests/unit/bodyweightSchema.test.ts` (new), `tests/unit/recoverySchema.test.ts` (new), `tests/unit/progressionBoundary.test.ts` (new), `tests/integration/bodyweight.integration.test.ts` (new), `tests/integration/recovery.integration.test.ts` (new), `tests/e2e/bodyweightRecovery.spec.ts` (new).

User-owned files confirmed untouched (`git status` identical before/after for these): `CLAUDE.md`, `HANDOFF.md` (pre-existing deletion), `docs/input/product-ideas.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/` — all pre-existing working-tree state from before this session started, none touched here. No Phase 6 review report was modified.

## Limitations / deviations

- No back-dating UI for a missed day's bodyweight/recovery entry — the quick-log always targets "today" (user-local); the API accepts an explicit `date` for a future UI, but nothing in mvp-scope F10 requires back-dating and none was built.
- No sleep-hours slider (judgment call 3) — the column and API path exist and are tested, but no phone control writes to it yet.
- No trends, charts, rolling averages, or persisted aggregates of any kind (grep/schema-checked: neither table nor any other table gained an aggregate-shaped column).
- No production access; nothing committed, pushed, or deployed; no manual iPhone/device acceptance is claimed — that belongs to the later independent/device review.

## Verdict

**READY FOR INDEPENDENT REVIEW.**
