# Phase 3 — Implementation Report

Date: 2026-08-17
Implements: `docs/architecture/implementation-plan.md` Phase 3 ("Today + workout execution,
outbox-first"), building on Phase 2 (programs/templates/prescriptions/blocks), which is closed per
[phase-2-remediation-verification.md](./phase-2-remediation-verification.md) ("READY FOR PHASE 3").
Base commit: `1818876`; this phase is an uncommitted working tree on `main` (all Phase 3 files are
new and untracked — see `git status`).
Author role: implementation only. This document is written by the implementer, not an independent
reviewer — see §8 for the explicit request that an independent review still happen.

## 1. What was implemented

The full Phase 3 vertical slice: Today resolution → start/resume/takeover a workout → log/edit/
delete sets (including ad-hoc exercises) → complete/discard → history with post-completion set
corrections — all routed through a single client-side outbox so writes commit locally before any
network round trip, online or not.

**Domain layer** (`src/domain/`):
- `schemas/prescriptionSnapshot.ts` — `PrescriptionSnapshot` (versioned, frozen copy of a
  prescription at the moment a session starts) + `wrapPrescriptionSnapshot()`/`STRATEGY_VERSIONS`.
- `sync/schema.ts` — `SyncOpEnvelope`/per-entity upsert & delete payload schemas
  (`workoutSessionUpsertPayloadSchema`, `sessionExerciseUpsertPayloadSchema`,
  `setLogUpsertPayloadSchema`, deletes), all `.strict()`. Parent-FK fields (`sessionId` on a
  session-exercise upsert, `sessionExerciseId` on a set-log upsert) are **required on every op**,
  including pure-field corrections — there is no "partial op" that omits the parent id.
- `progression/carryForward.ts` — `resolveCarryForwardLoadKg()`: last completed, non-deload
  session's first work-set load for the exercise, else `baselineLoadKg`, else `null`. Pure; the
  caller (today service) queries candidates and computes each one's first work-set load. This is
  the Phase 3 subset of `prescription-model.md` §4's chain — no Decision/recommendation layer
  (Phase 4).
- `scheduling/todayTemplate.ts` (+ `isoWeekday.ts`) — `resolveTodayTemplate()`: weekday-mode
  schedules resolve by matching `weekdays`; a schedule with **zero** `weekdays`-bearing entries is
  rotation mode (`index = completedSessionCountForBlock % schedule.length`).

**DB schema** (`src/db/schema/`): `workoutSessions.ts`, `sessionExercises.ts`, `setLogs.ts`. One
migration, `drizzle/0004_zippy_wolfsbane.sql` (see §2).

**Server services** (`src/server/`):
- `today/service.ts` — `buildTodayBundle()`: resolves today's template (or rest/no-schedule),
  computes carry-forward prefill per exercise, and reports the caller's current server-side
  `activeSession` (if any) so the client can detect a foreign-active session.
- `sync/service.ts` — `applySyncBatch()`: applies a batch of ops **one Postgres transaction per
  op** (not one for the whole batch), so an earlier op's writes are visible to a later op in the
  same batch (e.g. a session create followed by its session-exercise create) while a business-rule
  rejection of one op never rolls back ops already committed earlier in the batch. Enforces
  ownership (cross-user access → `not_found`, never a distinguishable "exists but not yours"),
  forward-only lifecycle transitions, one-in-progress-session-per-user, snapshot immutability (see
  §3), and row-level last-write-wins. Unclassified errors propagate and fail the whole HTTP request,
  relying on the client outbox's retry-is-safe idempotence rather than partial per-op recovery.
- `history/service.ts` — list (paginated, `before` cursor) and detail (exercises + sets, ordered)
  for completed/discarded sessions.

**API routes** (`src/app/api/`): `GET /api/today-bundle`, `POST /api/sync`, `GET /api/history`,
`GET /api/history/[id]`.

**Client sync layer** (`src/sync/`) — one IndexedDB database (`gym-app`, v1via `idb`), three
stores:
- `activeSession` — the in-progress session aggregate, the durable source of UI truth during a
  workout.
- `outbox` — append-only mutation queue (`outbox.ts`): FIFO by `createdAt`, exponential backoff
  with jitter (capped 60s), dead-lettered rows (`status: "dead"`) retained rather than dropped.
- `bundleCache` — last-fetched today-bundle, for offline Today.

`activeSession.ts` is the single write path: every mutator (start/log/edit/delete/skip/notes/
complete/discard) writes IndexedDB first, *then* enqueues the corresponding sync op, *then*
fire-and-forgets `flushOutbox()` — this holds online or offline, so there is exactly one code path
for "commit a fact," not an online path and a separate offline path. `flush.ts` drains the outbox
on reconnect (`online` event), on foreground (`visibilitychange`), on a 5s interval, and once on
install; a 401 leaves ops queued as-is (retained for re-auth) rather than dead-lettering them.
`activeSessionStore.ts` (Zustand) is a thin reactive mirror over `activeSession.ts` shared between
the Today and workout-execution pages.

**UI** (`src/app/(app)/`, `src/ui/`):
- `today/TodaySection.tsx` — loading/offline(cached)/error states; explicit resume-vs-takeover
  banner when the server holds an active session this device doesn't recognize (`hasForeignActive`)
  — never silently merged or discarded; separate in-progress banner when this device's own local
  session matches.
- `workout/WorkoutExecution.tsx` + `ExerciseCard.tsx` + `AddAdhocExercise.tsx` — phone-first set
  logging (kg/reps/RIR, prefilled from the last set logged this session or the snapshot's
  carry-forward prefill), skip/notes per exercise, ad-hoc exercise search+add, complete/discard
  with confirmation.
- `history/HistoryList.tsx` + `HistoryDetail.tsx` — paginated list, detail view with per-set
  edit/delete (`src/sync/corrections.ts`) allowed on completed sessions.

**Service worker**: `src/app/sw.ts`'s `runtimeCaching` extended to cover `/api/today-bundle` (see
§6 for the one behavioral fact this enabled that had to be verified with a production build, not
`pnpm dev`).

## 2. Schema and migration changes

One new migration, `drizzle/0004_zippy_wolfsbane.sql`, adding three tables:

| Table | Purpose | Key constraints |
|---|---|---|
| `workout_sessions` | One in-progress/completed/discarded workout | `uq_sessions_one_in_progress` — partial unique index on `user_id` where `status = 'in_progress'` (at most one in-progress session per user, DB-enforced); `ck_sessions_status` CHECK; FKs to `blocks`/`workout_templates` are `ON DELETE SET NULL` (a session survives its plan being deleted) |
| `session_exercises` | An exercise slotted into a session, with its frozen `prescription` snapshot | `uq_session_exercise_position` — unique `(session_id, position)`, **`DEFERRABLE INITIALLY DEFERRED`**; `ck_session_exercises_source` CHECK (`template`\|`adhoc`); FK to `exercises` is `ON DELETE RESTRICT`; cascades from `session_id` |
| `set_logs` | A single logged set | `uq_set_number` — unique `(session_exercise_id, set_number)`, **`DEFERRABLE INITIALLY DEFERRED`**; CHECKs on `set_number >= 1`, `weight_kg >= 0`, `reps` 1–100, `rir` 0–10; cascades from `session_exercise_id` |

Same pattern as Phase 2: `drizzle-kit` 0.44.2 has no `.deferrable()` builder API, so the two
`DEFERRABLE INITIALLY DEFERRED` constraints (needed so a client can send a full-row replace of a
session's exercises/sets without transiently colliding on position/set-number within one
transaction) were hand-added to the generated migration SQL. `pnpm db:generate` afterward reports
"No schema changes, nothing to migrate" — drizzle-kit's diff doesn't model `DEFERRABLE`, so the
hand-edit causes no drift.

Migration applied cleanly against real local PostgreSQL 16 (`pnpm db:migrate` →
"migrations applied successfully!"). Live constraint inspection against the same instance (via
`psql` in the `gym-app-db-1` container):

```
 conname                       | contype | condeferrable | condeferred
 uq_session_exercise_position  | u       | t             | t
 uq_set_number                 | u       | t             | t
```

and `\d workout_sessions` confirms `uq_sessions_one_in_progress` exists as a plain **immediate**
partial unique btree index (`UNIQUE, btree (user_id) WHERE status = 'in_progress'`) — not
accidentally made deferrable, which would have defeated the point of a same-transaction conflict
check.

## 3. Important implementation decisions

- **Snapshot-on-use is enforced at the write layer, not just at creation time.** Every scheduled
  exercise's `PrescriptionSnapshot` is frozen once, at session start (`startSession()` in
  `activeSession.ts`), never lazily. To make this an actual guarantee rather than a client-side
  convention, `applySessionExerciseUpsert()` in `src/server/sync/service.ts` **silently ignores any
  `prescription` field on an update path**, whether present in the payload or not — a
  session-exercise's snapshot can only ever be set on its first (create) upsert. Verified directly:
  the integration suite's immutability test mutates the *live* prescription row via
  `updatePrescription()`, then sends a session-exercise upsert carrying a *different* snapshot in
  its payload attempting to smuggle a new snapshot through, and asserts the DB row's `prescription`
  is unchanged while the other field in the same op (`skipped`) did land.
- **The sync payload schema requires parent-FK fields on every op, including corrections.**
  `sessionExerciseUpsertPayloadSchema.sessionId` and `setLogUpsertPayloadSchema.sessionExerciseId`
  are `uuidv7Schema` (required), not optional — a "just change one field" correction op still
  carries its full parent chain. This was hit and fixed while writing the new integration tests
  (four payloads initially omitted the required parent id and were rejected as `invalid_payload`);
  documented here so it isn't rediscovered the same way in Phase 4.
- **One Postgres transaction per op, not one per batch.** `applySyncBatch()` deliberately commits
  each op independently so that an earlier op's writes are visible to a later op in the *same*
  batch (a session-create followed immediately by its session-exercise-creates, which is exactly
  what `startSession()` enqueues), while a rejected op doesn't roll back ops that already committed
  earlier in the batch. The client's outbox is safe to retry regardless, since every upsert is
  idempotent by client-generated id.
- **Resume vs. takeover is always explicit, never automatic.** `TodaySection.tsx` computes
  `hasForeignActive = remote !== null && (local === null || local.id !== remote.id)` — if the
  server holds an in-progress session this device doesn't locally recognize (cold client, or a
  different device's session), the user is shown a banner with two explicit actions ("Resume here"
  adopts the server's copy verbatim via `hydrateFromServer()`; "Discard it & start fresh" sends an
  explicit discard op for that session's id) — there is no silent merge and no silent discard.
- **Rotation-mode template scheduling is deliberately deterministic**, used both for real
  single-schedule-entry blocks and as the basis for e2e seeding: a schedule with no `weekdays`
  entries resolves by `completedSessionCountForBlock % schedule.length`, so a block with exactly one
  schedule entry always resolves to that template regardless of calendar day.
- **Post-completion set corrections are allowed by design** (`domain-model.md` §7): `editSet`/
  `deleteSet` on the *active* session's own sets always succeeds since the client only ever mutates
  a session it holds locally (by definition still `in_progress`); post-completion corrections go
  through a dedicated history path (`src/sync/corrections.ts` → the same sync-op mechanism) instead
  of the active-session path, and the server explicitly locks structural changes (new exercises,
  new sets) on a non-`in_progress` session while still permitting corrections to existing set rows.

## 4. Authorization, lifecycle, and sync semantics

- **Ownership never leaks existence.** A sync op naming another user's session/session-exercise/
  set-log id is rejected `not_found`, identical to the shape of "this id doesn't exist" — verified
  by a hijack test that patches another user's session notes, a session-exercise's `skipped` field,
  and a set's `weightKg`, and confirms the original rows are untouched.
- **Lifecycle transitions are forward-only.** `completed → in_progress` is rejected
  `invalid_lifecycle_transition`; once `completed` or `discarded`, new session-exercises/set-logs
  are rejected `session_locked`, and set-log deletes on a discarded session are likewise
  `session_locked` — but corrections (existing set-log field updates) on a `completed` session are
  still applied.
- **Position/set-number conflicts are ordinary rejections, not thrown errors.** A second
  session-exercise at an already-used `position`, or a second set at an already-used `set_number`
  for the same exercise, comes back as `position_conflict`/`set_number_conflict` in the batch
  response rather than failing the whole request.
- **At most one in-progress session per user is DB-enforced** (`uq_sessions_one_in_progress`), not
  just checked in application code — a second concurrent session-create is rejected
  `session_conflict`; discarding the first then retrying the second (unmodified) succeeds.
- **Idempotent replay**: replaying an identical batch twice converges to the same DB state — no
  duplicate rows, same field values — verified directly by applying the same session+
  session-exercise+set-log creation batch twice and diffing the DB before/after.

## 5. Tests and verification results

**Unit tests** — 170/170 passing across 14 files (149 pre-existing from Phase 0–2, 21 new for
Phase 3):

| File | Tests | Covers |
|---|---|---|
| `carryForward.test.ts` | 11 | `resolveCarryForwardLoadKg` ordering (most-recent-first), deload exclusion, non-completed exclusion, baseline fallback, null fallback |
| `todayTemplate.test.ts` | 9 (updated from Phase 2's version) | Weekday-mode matching, rotation-mode index arithmetic including the single-entry-always-resolves case |

**Integration tests** (PGlite) — 104/104 passing across 8 files (97 pre-existing from Phase 0–2, 7
new for Phase 3, all in `sync.integration.test.ts`):

| Test | Covers |
|---|---|
| Idempotent replay | Identical batch applied twice converges to the same DB state |
| Snapshot immutability | A session-exercise's frozen `prescription` survives both a replay and a later mutation of the *live* prescription row; a smuggled-in new snapshot on an update op is ignored |
| Single-in-progress + takeover | Second concurrent session rejected `session_conflict`; discard then retry succeeds |
| Cross-user ownership | Hijack attempts on another user's session/session-exercise/set-log all rejected `not_found`; original data unchanged |
| Lifecycle + corrections | Forward-only transitions, `session_locked` on structural changes to a completed session, corrections to existing sets still allowed |
| Discarded-session locking | Set-log corrections and deletes on a discarded session rejected `session_locked` |
| Position/set-number conflicts | Rejected as ordinary batch-response entries (`position_conflict`/`set_number_conflict`), not thrown errors |

**E2E tests** (Playwright, local-only, real Postgres) — 5/5 passing across 3 files (1 pre-existing
smoke test, 4 new for Phase 3):

| File | Test | Covers |
|---|---|---|
| `offline-sync.spec.ts` | Logging sets fully offline survives a reload and syncs exactly once on reconnect | `context.setOffline(true)` → log a set → hard `page.reload()` while still offline (real relaunch, not a soft nav) → set still visible from IndexedDB → log a second set → reconnect → outbox drains automatically → complete the workout → history shows exactly 2 sets, each exactly once |
| `today.spec.ts` | Same-device reload persistence | A started workout with a logged set survives a page reload and shows as "Continue workout" on Today |
| `today.spec.ts` | Cross-device resume | A second browser context (same account) sees the foreign-active banner and "Resume here" adopts the same session, including its already-synced set |
| `today.spec.ts` | Cross-device takeover | A second browser context discards the first device's in-progress session via "Discard it & start fresh" and lands on a fresh Today |
| `smoke.spec.ts` (pre-existing) | Setup-or-login reaches an authenticated Today shell | Unmodified from Phase 0 |

Precondition: `tests/e2e/seed.ts` (new, idempotent — safe to re-run against an already-seeded dev
DB) creates an active program/block/template/prescription for the fixed e2e account
(`e2e-smoke@example.com`, reused from Phase 0's smoke test, ADR-004 single-account) using a
rotation-mode single-schedule-entry block so "today" resolves deterministically regardless of which
calendar day the suite runs on.

**Offline e2e requires a production build, not `pnpm dev`.** `next.config.ts` disables the service
worker in development (`disable: process.env.NODE_ENV === "development"`), so a hard page reload
while genuinely offline can only be served by the SW's precached/runtime-cached shell, which does
not exist under `pnpm dev`. `playwright.config.ts`'s `webServer.reuseExistingServer: true` was used
as-is (no config edit) by starting `pnpm build && pnpm start` on `:3000` by hand first; Playwright
then reused that already-running server instead of spawning `pnpm dev`. All 5 e2e tests, including
the pre-existing `smoke.spec.ts`, ran against this production server in one `pnpm test:e2e`
invocation. `Complete workout` in the offline test is deliberately clicked *after* reconnecting
(not while still offline) — `completeSession()` itself is outbox-first and would queue fine
offline, but the subsequent client-side `router.push("/today")` transition's behavior under
connectivity loss is a separate Next.js SPA-routing concern, not the outbox/data-integrity
guarantee this test exists to prove.

Independently verified against the real database (not just the green Playwright report) — after
the e2e run, the four sessions the specs created for the e2e account were exactly as expected:

| Session | Status | Set count |
|---|---|---|
| offline-sync.spec.ts | `completed` | **2** (no duplicates from the offline replay) |
| today.spec.ts, same-device reload | `discarded` | 1 |
| today.spec.ts, cross-device resume | `discarded` | 1 |
| today.spec.ts, cross-device takeover | `discarded` | 0 |

**Full verification suite**, run against this working tree (Windows 11, Node 24, pnpm, vitest
3.2.7, Playwright 1.62.1):

| Check | Command | Result |
|---|---|---|
| Lint (incl. boundary rules) | `pnpm lint` | **pass** |
| Format | `pnpm format:check` | **fails only on the pre-existing untracked `gpt-handoff.md`** (not edited, per standing instruction); all Phase 3 files pass after one round of `prettier --write` on files with pre-existing formatting drift |
| Typecheck (app) | `pnpm typecheck` | **pass** |
| Typecheck (service worker) | `pnpm typecheck:sw` | **pass** |
| Unit tests | `pnpm test:unit` | **pass — 170/170**, 14 files |
| Integration tests | `pnpm test:integration` | **pass — 104/104**, 8 files (against real Postgres-backed PGlite) |
| E2E tests | `pnpm test:e2e` | **pass — 5/5**, 3 files (against a production build reusing `pnpm start`, real local Postgres) |
| Production build | `pnpm build` | **pass** — Next.js 15.5.23, serwist service-worker bundling, all routes generated including every new Phase 3 page and API route |
| Migration drift | `pnpm db:generate` (against real Postgres) | **"No schema changes, nothing to migrate"** |
| Real PostgreSQL migration | `pnpm db:migrate` (against real Postgres) | **"migrations applied successfully!"** |
| Live constraint verification | `psql` against `gym-app-db-1` | **confirmed** — both `DEFERRABLE INITIALLY DEFERRED` constraints present and deferred; `uq_sessions_one_in_progress` present and immediate (§2) |

Real PostgreSQL 16 was reachable at `localhost:5432` (Docker Compose service `db`) for this session
and used for the integration suite's underlying migrations, the e2e suite, the migration-drift
check, and the actual migration run — none of this was skipped or simulated. Production
(Azure Database for PostgreSQL) was not touched at any point.

## 6. Known limitations and deferred work

- **No recommendation/evaluation/Decision layer** — Phase 3 carry-forward
  (`resolveCarryForwardLoadKg`) is a pure prefill convenience, not a progression decision; the full
  `evaluate()`/Decision model is explicit Phase 4 scope, per the task's guardrails.
- **No automatic load/progression changes, deload modifiers, volume math, or recovery-driven
  behavior** — none of this was built, per the task's explicit out-of-scope list.
- **No CRDT or general multi-device merging** — the resume/takeover model is intentionally binary
  (adopt the server's copy verbatim, or discard it) rather than field-level merge. A device whose
  local session is discarded by another device does not learn this proactively; it still shows
  "Continue workout" from its stale local copy until it next interacts with that session (at which
  point the server will reject the op) or explicitly reloads a `hasForeignActive` state. This
  matches "never silent merge/discard" but means a truly seamless multi-device experience is still
  Phase-4-or-later scope.
- **No offline definition editing / offline full-history support** — the Today bundle and active
  session are cached for offline use; editing programs/templates/prescriptions or browsing full
  history requires connectivity, per the task's explicit scope.
- **No rest-timer expansion** — out of scope, not built.
- **E2E offline coverage requires a production build**, as documented in §5 — this is a harness
  constraint of the local Playwright convention (SW disabled in `pnpm dev`), not a gap in the app's
  actual offline behavior; `pnpm test:e2e` run against plain `pnpm dev` will fail
  `offline-sync.spec.ts`'s reload-while-offline step for that documented, expected reason.
- **Ad-hoc exercises have no prescription snapshot** (`prescription: null`) — this is intentional
  (there is nothing to snapshot for an exercise not on the plan), but means ad-hoc sets have no
  target scheme/RIR band to display, only free-form logging.

## 7. Architecture deviations

None. No contradiction between implementation reality and the accepted specs
(`architecture-plan.md`, `implementation-plan.md`, `mvp-scope.md`, `data-model.md`,
`domain-model.md`, `prescription-model.md`, `pwa-offline-strategy.md`, ADR-005/007) was found that
required recording a deviation in `docs/architecture/deviations.md` or `open-decisions.md`.

## 8. Manual acceptance — pending

The real-device (iPhone, gym) acceptance test described in the original brief has **not** been
performed and is not claimed here. Everything in §5 was verified by automated tooling (unit,
integration, e2e) and direct database/constraint inspection against a real local PostgreSQL
instance — not by hand on the actual target device. This should happen before Phase 3 is considered
fully closed, alongside the independent review requested below.

## 9. Recommended next session

**"O-Max | P03 | Review — Workout Execution"**

## Verdict

**READY FOR INDEPENDENT REVIEW.**

This document does not constitute a Phase 3 review. An independent review of this implementation —
plus the manual iPhone/gym acceptance pass noted in §8 — is requested before Phase 4 begins.
