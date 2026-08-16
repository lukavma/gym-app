# Phase 2 — Implementation Report

Date: 2026-08-16
Implements: `docs/architecture/implementation-plan.md` Phase 2 ("Programs / workout templates /
exercise prescriptions"), building on Phase 1 (exercise library), which is closed per
[phase-1-final-verification.md](./phase-1-final-verification.md).
Base commit: `f5b9b45`; this phase is an uncommitted working tree on `main`.
Author role: implementation only. This document is written by the implementer, not an independent
reviewer — see §8 for the explicit request that an independent review still happen.

## 1. What was implemented

The full Phase 2 vertical slice: programs → workout templates → exercise prescriptions, plus
training blocks (a program's scheduled, dated training cycles) that reference templates. Every
layer of the modular monolith got a slice: domain validation, Drizzle schema + migration, server
services, API routes, and mobile-first UI, reusing the Phase 1 exercise catalog as the leaf
reference for prescriptions.

**Domain layer** (`src/domain/`):
- `programs/schema.ts`, `templates/schema.ts` — `create`/`update` (`.strict()`) and
  `reorderTemplatesSchema`.
- `prescriptions/schema.ts` — `createPrescriptionSchema`/`updatePrescriptionSchema`,
  `reorderPrescriptionsSchema`, and `checkPrescriptionCompatibility()` (scheme × progression
  compatibility, invoked from the service layer rather than via `.superRefine()` because PATCH
  merges partial input onto existing DB state before it can be validated).
- `blocks/schema.ts` — `createBlockSchema`/`updateBlockSchema`, `scheduleEntryInputSchema`
  (per-entry `weekdays` for fixed-day scheduling, `null` for rotation mode).
- `schemes/setScheme.ts`, `schemes/rirBand.ts` — versioned JSONB envelopes (`{v:1, scheme:{...}}`)
  for `fixed`/`repRange` set schemes and RIR target bands, plus `formatScheme()` for display.
- `progression/registry.ts` — `STRATEGY_IDS` (`load-progression`, `rep-progression`, `manual`),
  `supportsScheme()`, `defaultConfigFor()`, and `resolveProgression()`, which classifies a
  prescription's progression config as `"heuristic"` (matches the exercise-derived default) or
  `"user_defined"` (anything else, including an omitted config — see §3).
- `scheduling/weekIndex.ts` — pure function `weekIndex(startDate, currentDate)`; weeks are derived
  from `start_date`, never persisted.

**DB schema** (`src/db/schema/`): `programs.ts`, `workoutTemplates.ts`, `exercisePrescriptions.ts`,
`blocks.ts`, `blockScheduleEntries.ts`. One migration, `drizzle/0003_chief_miracleman.sql` (see §2).

**Server services** (`src/server/`): `programs/service.ts`, `templates/service.ts`,
`prescriptions/service.ts`, `blocks/service.ts`, plus `time/userLocalDate.ts`
(`userLocalDateString(timezone, now)`, used to resolve a block's current week against the user's
`Europe/Ljubljana`-default timezone). Every service enforces the ownership chain rooted at
`programs.user_id` (§4).

**API routes** (`src/app/api/`): full CRUD + lifecycle/reorder actions for all four resources —
`programs`, `programs/[id]/templates` (+ `reorder`), `programs/[id]/blocks`, `templates/[id]`
(+ `archive`), `templates/[id]/prescriptions` (+ `reorder`), `prescriptions/[id]`, `blocks/[id]`
(+ `activate`/`complete`/`abandon`).

**UI** (`src/app/(app)/`, `src/ui/`): program list/create/detail, template create/detail (with
inline prescription list), prescription create/edit forms, block create/detail with lifecycle
controls. A `Programs` link was added to the app shell nav (`src/app/(app)/layout.tsx`).

## 2. Schema and migration changes

One new migration, `drizzle/0003_chief_miracleman.sql`, adding five tables:

| Table | Purpose | Key constraints |
|---|---|---|
| `programs` | Top of the ownership chain | `uq_programs_one_active` — partial unique index on `user_id` where `status = 'active'` (at most one active program per user) |
| `workout_templates` | Named, ordered templates within a program | `uq_templates_active_name` — partial unique index on `(program_id, lower(name))` where `archived_at is null` (scoped **per program**, not per user — the same name is allowed in two different programs owned by the same user); `position` persisted for deterministic ordering |
| `exercise_prescriptions` | An exercise slotted into a template with a scheme/progression | `uq_prescriptions_position` — unique `(template_id, position)`, **`DEFERRABLE INITIALLY DEFERRED`**; FK to `exercises` is `ON DELETE RESTRICT` (never cascades — an exercise referenced by a prescription cannot be hard-deleted); hard-deleted itself (no soft-delete) |
| `blocks` | A program's scheduled, dated training cycle | `uq_blocks_one_active` — partial unique index on `program_id` where `status = 'active'`; `uq_blocks_sequence` — unique `(program_id, sequence)`; `weeks_planned` CHECK between 1 and 16; `volume_preset_id` is a bare nullable `uuid` with **no FK** (see §6, D-02) |
| `block_schedule_entries` | Which template runs on which day(s) within a block | `uq_schedule_position` — unique `(block_id, position)`, **`DEFERRABLE INITIALLY DEFERRED`**; FK to `workout_templates` is `ON DELETE RESTRICT` |

`programs`/`workout_templates` use soft-delete (`archived_at`); `exercise_prescriptions` and
`block_schedule_entries` are hard-deleted (they're always rewritten wholesale on their parent's
update, so there's no history to preserve). `workout_templates` and `blocks` cascade-delete from
their parent (`program_id ... ON DELETE cascade`); `block_schedule_entries` cascade-deletes from
its parent `block_id` but RESTRICTs on `template_id`, matching the intent that deleting a block
never deletes a template, and a referenced template can't be deleted out from under a block.

**DEFERRABLE constraints.** `drizzle-kit` 0.44.2's pg-core `unique()` builder has no `.deferrable()`
API, so the two `DEFERRABLE INITIALLY DEFERRED` constraints required by `data-model.md`
(`uq_prescriptions_position`, `uq_schedule_position` — both needed so a reorder can swap positions
within one transaction without transiently colliding) were added by hand-editing the generated
migration SQL after `drizzle-kit generate`. `pnpm db:generate` was re-run afterward and reports
"No schema changes, nothing to migrate" — the hand-edit doesn't cause drift because
`drizzle-kit`'s SQL-vs-snapshot diff doesn't model `DEFERRABLE` at all, so nothing detects or fights
the hand edit either way. This mirrors the same approach already in use for the DB layer generally
(plain, reviewable, committed SQL files).

Migration applied cleanly against a real local PostgreSQL 16.14 instance (`pnpm db:migrate` →
"migrations applied successfully!"); `pnpm db:generate` against the same instance confirms zero
drift between the Drizzle TS schema and the committed migration files.

## 3. Important implementation decisions

- **Ownership-chain authorization, consistently asymmetric.** Every service checks ownership by
  walking up to `programs.user_id`. Helpers that check whether a *parent* belongs to the caller
  (`programBelongsToUser`, `templateBelongsToUser`, `getOwnedExercise`, `getOwnedProgram`) return
  `null`/`false` for cross-user access. Direct entity operations (`get`/`update`/`delete` on the
  entity itself) throw a domain `*NotFoundError` for cross-user access instead. This is deliberate,
  not inconsistent: list/create endpoints under a possibly-foreign parent resource have nothing to
  reveal by returning `null` (404-shaped), while an operation naming a specific entity ID that
  happens to belong to someone else is treated as "this ID doesn't exist for you" — both produce a
  404 to the caller, but the internal signaling differs by call site. Documented here because it's
  easy to get backwards when extending a service and was verified exactly, call site by call site,
  in the integration tests (see §5).
- **`resolveProgression()`'s classification is stricter than "omitted = accept the default."**
  `loadProgressionConfigSchema`'s `incrementKg` is `.optional()` with no `.default()`, so an omitted
  config leaves `incrementKg` as `undefined`, which `JSON.stringify`-drops it entirely — this does
  **not** deep-equal `defaultConfigFor()`'s output (which explicitly sets `incrementKg` from the
  exercise's `loadStepKg`). So omitting a `load-progression` config classifies as `"user_defined"`,
  not `"heuristic"`; only a config that explicitly restates the exercise-derived value classifies as
  `"heuristic"`. This was caught by re-reading the registry source before writing tests against it,
  not by a failing assertion — see the unit and integration tests for `load-progression` config
  classification.
- **Prescription compatibility validated in the service layer, not via Zod `.superRefine()`.**
  `updatePrescriptionSchema` accepts a partial patch; whether the *resulting* scheme/progression
  combination is compatible (e.g., `rep-progression` + a `fixed` scheme requires an explicit numeric
  `repCap`) can only be evaluated after merging the patch onto the existing row, so
  `checkPrescriptionCompatibility()` runs in `src/server/prescriptions/service.ts` after the merge,
  not inside the schema itself.
- **Weeks are derived, never persisted.** `weekIndex(startDate, currentDate)` is a pure function on
  `YYYY-MM-DD` strings (`floor(diffDays / 7) + 1`, 1-indexed, can be 0 or negative for dates before
  the block's start). The wall-clock `Date` is converted to the user's local calendar date via
  `userLocalDateString(timezone, now)` (`Intl.DateTimeFormat("en-CA", {timeZone, ...})`) before
  being passed in, so a block's "current week" is correct in the user's timezone, not the server's.
- **Block lifecycle** (`planned → active → completed | abandoned`) is centralized in one
  `transitionBlock()` helper in `src/server/blocks/service.ts` rather than duplicated per endpoint,
  so the valid-transition table lives in exactly one place. Schedule and deload fields are editable
  only while `status === 'planned'` (`BlockScheduleLockedError` otherwise); non-schedule fields
  (`weeksPlanned`, `name`, `goal`, `notes`) remain editable regardless of status, since none of them
  affect what's already been committed to the calendar.

## 4. Authorization and lifecycle behavior

- **One active program per user** (`uq_programs_one_active`), **one active block per program**
  (`uq_blocks_one_active`) — both enforced at the database level via partial unique indexes, not
  just in application code, so the invariant holds even under concurrent requests.
  `ProgramActiveConflictError`/`BlockActiveConflictError` surface the DB-level conflict as a typed
  domain error.
- **Template name uniqueness is per-program, not per-user** (`uq_templates_active_name` on
  `(program_id, lower(name))` where not archived) — the same user can have a "Push Day" template in
  two different programs simultaneously; only within one program is the name exclusive among active
  templates. Verified explicitly in `templates.integration.test.ts`.
- **Archiving a template is blocked while it's referenced by an *active* block's schedule**
  (`TemplateReferencedError`), but **allowed while referenced only by a *planned* (not-yet-started)
  block** — a planned block's schedule can still be edited to route around the archived template
  before it goes active; an active block's schedule is already locked (see §3), so archiving out
  from under it would silently orphan a day's workout.
- **Cross-user isolation** is enforced and tested at every layer of the hierarchy: program, template,
  prescription, and block — including list/create (return `null`/`false`), and update/delete/lifecycle
  transitions (throw `*NotFoundError`) — see §5 for exact test counts.
- **Prescription exercise references respect the Phase 1 exercise lifecycle**: creating a
  prescription against another user's exercise throws `PrescriptionExerciseNotFoundError`;
  against an archived (but owned) exercise throws `PrescriptionExerciseArchivedError`. The FK
  itself is `ON DELETE RESTRICT`, so even bypassing the service layer can't leave a prescription
  pointing at a hard-deleted exercise.
- **Reordering** (templates within a program, prescriptions within a template) validates that the
  submitted ID set exactly matches the current set before writing new positions
  (`TemplateReorderMismatchError`/`PrescriptionReorderMismatchError` otherwise), then persists new
  positions atomically. Prescription and block-schedule reordering additionally rely on the
  `DEFERRABLE` constraints from §2 so the write can pass through intermediate duplicate positions
  within one transaction.

## 5. Tests and verification results

**Unit tests** — 138/138 passing across 12 files (58 pre-existing from Phase 0/1, 80 new for
Phase 2):

| File | Tests | Covers |
|---|---|---|
| `rirBand.test.ts` | 8 | RIR band bounds (0–10, min ≤ max, integers), `DEFAULT_HYPERTROPHY_TARGET_RIR` |
| `setScheme.test.ts` | 16 | `fixed`/`repRange` bounds (sets 1–20, reps 1–100, span ≤30), `formatScheme()` en-dash formatting |
| `blockSchema.test.ts` | 19 | `createBlockSchema`/`updateBlockSchema` bounds, `.strict()` unknown-key rejection, `scheduleEntryInputSchema` weekday validation (dedup, range, count) |
| `progressionRegistry.test.ts` | 11 | `supportsScheme`, `defaultConfigFor`, `resolveProgression` classification (including the omitted-`incrementKg` case from §3) |
| `prescriptionSchema.test.ts` | 19 | `createPrescriptionSchema`/`updatePrescriptionSchema` bounds and strictness, `checkPrescriptionCompatibility` (repCap requirement) |
| `weekIndex.test.ts` | 7 | Week-boundary arithmetic, including negative indices before the start date |

**Integration tests** (PGlite) — 95/95 passing across 7 files (41 pre-existing from Phase 0/1, 54
new for Phase 2):

| File | Tests | Covers |
|---|---|---|
| `programs.integration.test.ts` | 12 | Active-by-default creation, one-active-per-user conflict and cross-user independence, archive/unarchive incl. unarchive-into-collision, list filtering, cross-user get/update |
| `templates.integration.test.ts` | 12 | Sequential positions, cross-user isolation, per-program (not per-user) name uniqueness, name reuse after archive, archive-blocked-by-active-block vs. archive-allowed-for-planned-block, reorder incl. mismatch rejection |
| `prescriptions.integration.test.ts` | 16 | Sequential positions, cross-user template/exercise handling, archived-exercise rejection, scheme × progression compatibility (both accept and reject paths), progression classification, PATCH merge-then-validate semantics and field preservation, cross-user update/delete/get, delete, reorder via the `DEFERRABLE` constraint incl. mismatch rejection |
| `blocks.integration.test.ts` | 14 | Schedule creation preserving order and per-entry weekdays, sequential `sequence` numbers, cross-user isolation, out-of-program and archived-template schedule rejection, one-active-block-per-program conflict, full `planned → active → completed` lifecycle, invalid-transition rejection, abandon from both `planned` and `active`, schedule-lock while non-planned vs. editable while planned, non-schedule fields editable regardless of status, cross-user lifecycle rejection, `currentWeekIndex` computed against an explicit clock across a week boundary |

**Full verification suite**, run against this working tree (Windows 11, Node 24, pnpm, vitest
3.2.7):

| Check | Command | Result |
|---|---|---|
| Lint (incl. boundary rules) | `pnpm lint` | **pass** |
| Format | `pnpm exec prettier --check .` | **pass** (after one round of `--write` on 3 files with pre-existing formatting drift) |
| Typecheck (app) | `npx tsc --noEmit -p tsconfig.json` | **pass** |
| Typecheck (service worker) | `pnpm typecheck:sw` | **pass** |
| Unit tests | `pnpm test:unit` | **pass — 138/138**, 12 files |
| Integration tests | `pnpm test:integration` | **pass — 95/95**, 7 files |
| Production build | `pnpm build` | **pass** — Next.js 15.5.23 standalone build, serwist service-worker bundling, all routes generated including every new Phase 2 page and API route |
| Migration drift | `pnpm db:generate` (against real Postgres) | **"No schema changes, nothing to migrate"** |
| Real PostgreSQL | `pnpm db:migrate` (against real Postgres) | **"migrations applied successfully!"** |

Real PostgreSQL 16.14 was reachable at `localhost:5432` for this session and used for both the
migration-drift check and the actual migration run — this was not skipped or simulated.

**UI** was exercised manually against the dev server (programs → templates → prescriptions →
blocks create/detail/lifecycle flows) before this report was written, per standing instructions to
verify UI changes in a browser rather than relying on typecheck/build alone.

## 6. Known limitations

- **No Playwright/e2e coverage was added for Phase 2 UI** — verification was manual (dev server) for
  the UI layer and automated (unit/integration) for domain/service logic, matching the pattern
  Phase 1 used.
- **`blocks.volume_preset_id` is inert in Phase 2** — the column exists (nullable `uuid`, no FK; see
  §2 and D-02 below) but nothing in Phase 2 reads or writes it. It's a forward-reference placeholder
  for Phase 6.
- **`planned_progression` on `blocks` is schema-only in this phase** — the column is `jsonb`,
  nullable, and unused by any Phase 2 code path; it exists per `data-model.md`'s `blocks` table
  shape but its evaluation logic is explicitly Phase 3+ scope (`progression evaluate()`) and was not
  built, per the task's scope guardrails.
- **No workout-session / performed-set model exists yet** — prescriptions describe what *should* be
  done; nothing in Phase 2 records what *was* done. This is intentional Phase 3 scope, not an
  oversight; see §8 for the compatibility shape this phase leaves behind.
- Phase 1's previously-deferred LOW findings (LOW-2 input-attribute mismatches, LOW-3 opaque
  archive-conflict UI copy, L2–L4) were left untouched, per the task's explicit instruction not to
  fix previously-deferred Phase 1 findings in this phase.

## 7. Architecture deviations

One new entry, `docs/architecture/deviations.md` D-02:

> **D-02: `blocks.volume_preset_id` FK target (`volume_presets`) doesn't exist yet in Phase 2.**
> `data-model.md` §2.9 specifies a real FK to `volume_presets`, but that table isn't created until
> Phase 6, so a real `REFERENCES` constraint would make the Phase 2 migration fail outright. The
> column is added now as a plain nullable `uuid` with no FK constraint; Phase 6 adds the constraint
> via `ALTER TABLE` once `volume_presets` exists. No Phase 2 code reads or writes the column.

No other conflicts between the implementation and the binding architecture docs
(`architecture-plan.md`, `implementation-plan.md`, `mvp-scope.md`, `data-model.md`,
`domain-model.md`, `prescription-model.md`) were found that required a deviation — the schema,
ownership model, and lifecycle rules described there matched what was built, including the details
that are easy to get wrong (per-program template-name scoping, `DEFERRABLE` reordering, RESTRICT vs.
CASCADE on the two exercise/template-referencing FKs).

## 8. Phase 3 handoff assumptions

Phase 3 (workout execution — performed sets, history, `evaluate()` progression logic) can build on:

- **`exercise_prescriptions` is the "what should happen" contract.** A performed-set/session model
  should reference `exercise_prescriptions.id` (and, transitively, the exercise via
  `exercise_prescriptions.exercise_id`) as its prescription-of-record. Because prescriptions are
  hard-deleted rather than archived, a future session/performed-set table referencing them will need
  its own decision about ON DELETE behavior if a prescription can be deleted after being performed
  against — Phase 2 does not need this because nothing yet references a prescription from below.
- **`resolveProgression()`'s `heuristic`/`user_defined` classification is exactly the signal
  `evaluate()` needs** to decide whether a progression config is safe to auto-advance
  (`heuristic`, i.e. still the exercise-derived default) versus something the user tuned by hand
  (`user_defined`, which `evaluate()` should presumably not silently override). This distinction was
  built for Phase 3 to consume, not for any Phase 2 behavior.
- **`weekIndex()` is the single source of truth for "what week is this block currently in."** Phase 3
  workout-session creation should call it the same way `getBlock()` does (userLocalDateString → pure
  function), rather than re-deriving week numbers independently.
- **`blocks.status` transitions are centralized in `transitionBlock()`** — if Phase 3 needs
  session-completion to trigger a block-completion side effect (e.g. auto-completing a block when
  its last scheduled week's sessions are all logged), that decision point already exists as one
  function rather than being scattered across route handlers.
- **Block schedule entries (`block_schedule_entries`) map a block+position to a template**, not
  directly to exercises — a workout session should be created against a schedule entry (which
  resolves to a template, which resolves to its ordered prescriptions), not against a template
  directly, to preserve "which day of this specific block" as distinct from "which template in
  general."

This document does not constitute a Phase 2 review. An independent review of this implementation is
requested before Phase 3 begins.
