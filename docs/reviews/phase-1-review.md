# Phase 1 Review — Findings and Phase 2 Readiness

Date: 2026-08-15
Reviewed commit: `f5b9b45` (Implement Phase 1: exercise library, MVP F2)

I inspected the full implementation (schema, migration, seed, domain, service, API, UI, tests, CI/CD), ran the complete verification suite, and empirically probed the seed and archive edge cases against the same PGlite harness the integration tests use. Everything below the findings is evidence, not summary-of-summaries.

## 1. Findings (by severity)

### HIGH

**H1 — The catalog seed resets user deletions on every deploy, and can crash the deploy pipeline.**
[src/db/seed/exercises.ts](../../src/db/seed/exercises.ts) seeds by insert-if-absent per row (deterministic id from user+slug, `onConflictDoNothing`), with no memory of what was already applied. I confirmed all three consequences empirically against a migrated PGlite database:

- **Removed contributions resurrect.** Editing a seeded exercise's contributions in the UI does delete+reinsert; any muscle the user *removed* is re-added with the default weight on the next deploy, because the contributions insert runs for the entire catalog, not just newly inserted exercises (`src/db/seed/exercises.ts` lines 47–62). This silently reverts exactly the kind of contribution tuning the architecture encourages, and will silently change Phase 6 volume numbers. The existing seed test only covers renames, which are preserved — the gap is deletions.
- **Hard-deleted seeded exercises resurrect.** Deleting the seeded "Plank" (legal while it has no history) brings it back on the next deploy.
- **Deploy failure:** if a deleted seeded exercise's name was reused for a custom exercise, the reseed insert violates `uq_exercises_active_name` (the conflict target is only `id`, so the name-index violation throws), `pnpm db:seed` exits 1, and **every subsequent production deploy fails** until someone repairs prod data. It fails closed — no unsafe deploy happens — but the pipeline is bricked by a legitimate user action.

Note this is now live: Phase 1 is pushed (`f5b9b45` = origin/main), so the seed step runs on every future deploy. Fix is small and contained: only insert contributions for exercises actually inserted this run (`.returning()` on the exercises insert), and skip catalog seeding for a user who already has seeded rows (or track applied slugs); wrap the whole per-user seed in a transaction while there.

### MEDIUM

**M1 — Unarchive into an active name collision returns HTTP 500.**
Reusing a name after archiving is explicitly designed for (`uq_exercises_active_name` is partial on `archived_at IS NULL`), but the reverse path is unhandled: unarchiving the original when an active exercise now holds the name raises a raw unique violation — `setExerciseArchived` ([src/server/exercises/service.ts](../../src/server/exercises/service.ts) lines 257–272) has no 23505 mapping, unlike create/update — so the route 500s and the UI shows a generic failure. Confirmed empirically. Fix: map to `ExerciseNameConflictError` → 409 in the archive route.

**M2 — `loadStepKg` is not settable or editable in the UI.**
mvp-scope F2 lists `loadStepKg` as part of the exercise-library feature and Phase 4 rounding will consume it, but [src/ui/exercises/ExerciseForm.tsx](../../src/ui/exercises/ExerciseForm.tsx) has no input for it — creates always get the equipment default, and it can only be changed via direct API call. (`movementPattern` is likewise API-only, but it's spec-optional.) Additive fix, no schema or API work needed.

### LOW

- **L1** — Zod allows `loadStepKg` up to 1000 but the column is `numeric(4,2)` (max 99.99); values in [100, 1000] pass validation and then 500 on DB overflow ([src/domain/exercises/schema.ts](../../src/domain/exercises/schema.ts) line 91).
- **L2** — Notes can't be cleared from the edit form: emptying the field sends `undefined` ("no change") instead of `null` (`ExerciseForm.tsx` line 98), though the API supports `null`.
- **L3** — List search doesn't escape `%`/`_` in the ILIKE pattern (`src/server/exercises/service.ts` line 140). Parameterized, so no injection — just odd matches for literal wildcard searches.
- **L4** — Contribution lists are returned without an ORDER BY, so display order can vary between fetches.

## 2. Verification results

All run locally against the current main (`f5b9b45`), all green: lint (including boundary rules), Prettier check, both typechecks (app + service worker), **57/57 unit tests**, **30/30 integration tests**, and the production standalone build. The handoff's claims check out exactly.

Tests are substantive, not coverage padding: the plan's three required Phase 1 integration cases all exist and assert the right things — archive hides from the default list but the record stays readable; contribution weight bounds (0 < w ≤ 1) plus the no-primary, duplicate-muscle, and unknown-slug rejections; and delete-with-history → `ExerciseReferencedError` asserted through the FK RESTRICT backstop using a stand-in history table, exactly as the plan prescribed for a phase with no real history tables. Cross-user scoping and name-reuse-after-archive are also covered.

Not verifiable here: Playwright e2e (needs Docker Postgres; no Docker in the review environment — CI intentionally excludes it too) and on-phone UI verification. Production probes: `/api/health` returns ok, `/api/exercises` returns 401 unauthenticated, `/exercises` redirects to `/login`. Deploy-run success itself could not be confirmed directly (no `gh` in the review environment), but the push is 3 days old and prod is healthy.

## 3. Phase 0 regression status

Clean. The Phase 1 commit touched Phase 0 surface minimally and safely: [src/server/auth/session.ts](../../src/server/auth/session.ts) only gained `requireUserId` (defense-in-depth on top of middleware, which is unchanged); migration `0000` is untouched and the journal is append-only; CI gates are identical; the deploy workflow gained only the seed step, ordered migrate → seed → deploy so any failure aborts before the app deploys; no new secrets and the SESSION_SECRET placeholder pattern is preserved; the service worker, manifest, and Today shell are untouched; every exercise query is user-scoped and auth/throttle/setup-lockout tests still pass.

## 4. Phase 1 acceptance-criteria status (mvp-scope F2)

- **Verified now:** custom exercise with two contributions created through the API/service stack (integration-tested end to end below the browser); contribution validation; archive hides from the default listing (the only picker that exists) while the record stays fully readable; hard delete refused with 409 once something references the exercise (via the RESTRICT fixture); seeds rerun idempotently for the tested paths (no duplicates, renames preserved).
- **Structurally ready:** "archiving hides it from all pickers" for future pickers — `listExercises` excludes archived by default, so Phase 2's prescription editor inherits correct behavior; "every historical session still renders it" — archive preserves the row and RESTRICT semantics are proven, but sessions don't exist yet.
- **Deferred to Phase 3:** the real set-log-references-exercise 409, per the plan's own note.
- **Pending human step:** the "under a minute on a phone" UI criterion needs the iPhone smoke test from the Definition of Done; it cannot be demonstrated from the review environment.

## 5. Phase 2 readiness assessment

1. **Identity stability** — Yes. Server-generated UUIDv7 for custom, deterministic per-user ids for seeded; rename keeps identity per the identity policy; nothing regenerates ids.
2. **Archive/delete semantics** — Yes. Archive is reversible and preserves rows; delete maps FK violations to 409, proven against a RESTRICT reference; `exercise_prescriptions` FK RESTRICT (data-model §2.8) will slot in without changes. H1's resurrection quirk is a seed problem, not a lifecycle-model problem.
3. **Muscle contributions** — Yes. Per-row role + editable weight with DB checks, one row per (exercise, muscle), ≥1 primary enforced — exactly the current-convention volume model's input shape. H1(a) must be fixed so user tuning actually sticks.
4. **`loadStepKg` / `baselineLoadKg` semantics** — Yes. `loadStepKg` is purely a per-exercise increment. `baselineLoadKg` correctly does not exist on `Exercise` (deviation D-01 resolved the doc drift), so it cannot drift into mutable "current load" state; Phase 2 adds it on `exercise_prescriptions` where the specs place it.
5. **Templates referencing exercises** — Yes, plain FK reference; no schema redesign needed.
6. **Boundaries** — Yes. domain is pure (the documented uuidv7 exception is sound — Phase 3's offline client needs the same generator), db→domain, server→db+domain, api→server, ui/app never touch db/server; all lint-enforced and passing. The route→Zod→service→serialize pattern is the right template for Phase 2 CRUD.
7. **Migrations and seeds** — Migrations yes: generated SQL matches data-model §2.3–2.5 column-for-column, journal is clean, integration tests run the real migrations. Seeds: safe only after H1 is fixed.
8. **Compounding debt** — Only H1 compounds (more deploys, more user edits at risk, and Phase 6 volume math inherits silently altered contributions). Everything else is additive polish.

## 6. Safe to defer

M2 (loadStepKg UI — needed by Phase 4 at the latest), L1–L4, movementPattern UI, the service-layer pre-delete reference check (meaningful only when Phase 3 tables exist; the FK backstop already produces correct 409s), and e2e coverage for the exercise UI (the plan's own e2e gate arrives with Phase 3's offline scenarios).

## 7. Verdict

**READY AFTER MINOR FIXES**

The exercise model, lifecycle semantics, schema, and boundaries are a sound foundation — nothing in Phase 1 forces rework later. The one gate is H1: fix the seed's insert-if-absent logic (and ideally M1's unarchive 409 alongside) before Phase 2 begins its deploy cadence. Both are small, contained changes with obvious tests; nothing architectural needs to move.
