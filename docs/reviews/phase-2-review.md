# Phase 2 Review — Findings and Phase 3 Readiness

Date: 2026-08-16
Reviewed state: uncommitted Phase 2 working tree on top of `f5b9b45` (Implement Phase 1: exercise library, MVP F2)

I inspected the full Phase 2 implementation (Drizzle schema, hand-edited migration, domain, services, all 15 API routes, UI, tests, CI/CD), ran the complete verification suite including `db:migrate`/`db:generate` against a **real PostgreSQL 16 instance**, and empirically executed the progression registry and the create-schemas with the exact payloads the UI sends. Conclusions come from the implementation, not from `HANDOFF.md` or [phase-2-implementation.md](phase-2-implementation.md). Source of truth: the accepted architecture documents and the Phase 2 section of `implementation-plan.md`.

No repository files were modified during the review.

## 1. Findings (by severity)

### HIGH

**H1 — The default progression config is classified `user_defined` instead of `heuristic`, on the normal UI path.**

[src/domain/progression/registry.ts](../../src/domain/progression/registry.ts) declares `incrementKg: z.number().positive().optional()` with **no** `.default()`. So `schema.parse({})` omits the key entirely, while `defaultConfigFor()` materialises it from `exercise.loadStepKg`. `jsonEqual()` compares via `JSON.stringify`, so the two can never match. Executed against the exact payloads [src/ui/prescriptions/PrescriptionForm.tsx](../../src/ui/prescriptions/PrescriptionForm.tsx) sends:

```text
load-progression (UI default path, config {})    -> user_defined
rep-progression + repRange (UI sends {})         -> heuristic
rep-progression + fixed   (UI sends {repCap})    -> user_defined
manual (UI sends {})                             -> heuristic

parse({})          : {"progressRirGate":…,"holdAtRirZero":true,…}   ← no incrementKg
defaultConfigFor() : {"incrementKg":2.5,"progressRirGate":…,…}
```

The form builds `const config = {}` and only ever adds `repCap`; `load-progression` is the default-selected strategy. So **every load-progression prescription created through the app is labelled `user_defined` for a config the user never touched.**

This contradicts two binding statements:

- `domain-model.md` §4 — "Default classification for any shipped trigger rule: `heuristic`. When the user tunes config, it becomes `user_defined`."
- `implementation-plan.md` Phase 2 — "strategy selection + config form (Zod-validated, defaults classified `'heuristic'`)".

Why this is HIGH rather than cosmetic: `classification` is a field of `PrescriptionSnapshot` (`domain-model.md` §6), frozen into the session when the workout starts. Phase 3 is the phase that writes that snapshot. Every session created before this is fixed carries permanently wrong provenance in immutable history, and drives wrong user-facing copy ("you set this") forever. It will not self-correct: two tests assert the wrong outcome as intended behaviour — [tests/integration/prescriptions.integration.test.ts](../../tests/integration/prescriptions.integration.test.ts) line 153 and [tests/unit/progressionRegistry.test.ts](../../tests/unit/progressionRegistry.test.ts) line 41.

Two related consequences of the same root cause:

- The persisted config has **no `incrementKg` at all**, so Phase 4 must resolve the increment from the live exercise row. `EvaluationContext` does carry `exercise: { id, loadStepKg }` (`progression-engine.md` §2), so this is sanctioned and not an independent architecture violation — but the spec's `defaultConfig(prescription, exercise)` hook exists precisely to materialise it, and materialising fixes both problems in one change.
- `rep-progression` + `fixed` can **never** be `heuristic`, because `repCap` is mandatory for that pairing. A required field is not "tuning".

Fix scope: the comparison in `resolveProgression()` (fill from `defaultConfigFor()` before comparing, persist the materialised default), plus the two tests. Contained to Phase 2's own surface — no schema change, no migration.

### MEDIUM

**M1 — `defaultConfigFor()` is missing the prescription/scheme argument the strategy contract specifies.**
Spec (`progression-engine.md` §2): `defaultConfig(prescription: PrescriptionSnapshot, exercise: ExerciseRef): C`. Implementation: `defaultConfigFor(strategyId, exercise)`. Without the scheme, `repCap` cannot default to `scheme.maxReps` for `repRange` (`progression-engine.md` §4.2), and the rep-progression default is scheme-blind. Same root as H1; Phase 4 needs the corrected signature regardless.

**M2 — `currentWeekIndex` is unclamped and computed for terminal-status blocks.**
[src/server/blocks/service.ts](../../src/server/blocks/service.ts) `toRecord()` computes it unconditionally from today's date. A block completed in January reports a week number that grows forever; a 4-week block still active reports `9`; a future-dated planned block reports `0` or negative. [src/ui/blocks/BlockForm.tsx](../../src/ui/blocks/BlockForm.tsx) renders it for `active` **and** `completed`. Deriving rather than persisting is correct per `data-model.md` §5 — the gap is bounding and gating the display. Phase-3-relevant: sessions snapshot `weekIndex` at start, and a deload configured as `weekIndex: "last"` can never match an out-of-range week.

**M3 — The `DEFERRABLE` hand-edit is a recurring migration hazard with no durable workflow record.**
Confirmed directly: drizzle-kit's snapshot models unique constraints as `{name, nullsNotDistinct, columns}` — there is **no `deferrable` field**. Today's zero-drift result is therefore genuine, not luck (verified against real PostgreSQL, §2). The hazard is future: any change that drops and recreates `uq_prescriptions_position` or `uq_schedule_position` emits plain `UNIQUE(...)` and silently downgrades them.

Real mitigations exist — `db:push` is not in `package.json`, and [tests/integration/testDb.ts](../../tests/integration/testDb.ts) applies the real `drizzle/` folder, so the 0↔1 swap in `prescriptions.integration.test.ts` would fail loudly. But the schedule-entry constraint has **no** equivalent net (nothing needs deferral there — `updateBlock` deletes-then-inserts), and the workflow is recorded only in code comments and the implementer's own review doc. There is no `CLAUDE.md`, and `HANDOFF.md` does not mention it. This matters now because `data-model.md` §2.13/§2.14 specify **two more** deferrable constraints for Phase 3 tables (`uq_session_exercise_position`, `uq_set_number`) — the next phase hits this same manual step.

**M4 — Editing a planned block regenerates every schedule-entry id.**
`updateBlock` deletes all entries and re-inserts with fresh `newId()`s, and `BlockForm` re-sends `schedule` on every save while the block is planned — so renaming a block churns all entry identities. Bounded by the lifecycle lock: entries freeze the moment the block leaves `planned`, so no block that can own sessions is affected. That containment is why this is MEDIUM, not HIGH.

### LOW

- **L1** — All four create schemas silently strip unknown keys; only the update schemas are `.strict()`. Verified empirically for `createProgramSchema`, `createTemplateSchema`, `createBlockSchema`, `createPrescriptionSchema`. [phase-2-implementation.md](phase-2-implementation.md) §1 claims "create/update (`.strict()`)" — inaccurate for create. Impact is limited to defence-in-depth; Zod strips, so nothing unknown reaches the DB.
- **L2** — Reorder arrays have no uniqueness refinement. `[a,a,b]` against `{a,b}` passes the Set-size comparison and leaves positions `1,2` instead of `0,1`. Ordering stays correct; positions merely go non-contiguous.
- **L3** — `block_schedule_entries` has no `created_at`/`updated_at`, against `data-model.md` §1's "on **every table**". §2.10's explicit column list omits them, so the implementation matches the more specific spec.
- **L4** — Dead branch in `updateBlock`: `input.schedule.length > 0` is always true given `.min(1)`.
- **L5** — CI runs lint, format, typecheck, unit, integration, build — but **not** `pnpm typecheck:sw`.
- **L6** — `createTemplate`/`createPrescription` compute `max(position)+1` without row locking. Two concurrent creates could collide; for prescriptions the deferred unique fires at COMMIT with no 23505 handler → 500 rather than a typed error. Near-unreachable in a single-user app.

### Checked and cleared (not defects)

`workout_templates` correctly has no position unique — `data-model.md` §2.7 doesn't specify one, and the schema file documents why. `uq_blocks_sequence` being non-deferrable is correct — blocks are append-only, never reordered. Deleting a prescription leaves a position gap, which is harmless and normalised by the next reorder. Ownership is enforced in the services (not merely by middleware): every child operation resolves through `exercise_prescriptions → workout_templates → programs.user_id` or `blocks → programs.user_id`, foreign ids return `null`/404 without leaking existence, and reorder cannot touch another user's rows.

## 2. Verification results

| Check                                | Result                                                    |
| ------------------------------------ | --------------------------------------------------------- |
| `pnpm lint` (incl. `boundaries`)     | pass (exit 0)                                              |
| `pnpm exec prettier --check .`       | pass (exit 0)                                              |
| `pnpm typecheck`                     | pass (exit 0)                                              |
| `pnpm typecheck:sw`                  | pass (exit 0)                                              |
| `pnpm test:unit`                     | pass — 138/138, 12 files                                   |
| `pnpm test:integration`              | pass — 95/95, 7 files (PGlite, real migrations)            |
| `pnpm build`                         | pass (exit 0)                                              |
| `pnpm db:migrate` (real PostgreSQL)  | pass — "migrations applied successfully"                   |
| `pnpm db:generate` (real PostgreSQL) | pass — "No schema changes, nothing to migrate", 11 tables  |

**Schema drift is genuinely zero.** Verified against a live PostgreSQL 16 instance, not PGlite. No migration file or snapshot was created by `db:generate`; `git status` is byte-identical before and after (57 entries, same hash).

Test substance, not count. The Phase 2 suites cover the areas that matter: cross-user isolation is asserted on _every_ operation of all four services (create/list/get/update/delete/reorder/lifecycle); ordering includes a real 0↔1 swap that genuinely exercises the deferred constraint; block lifecycle covers all valid transitions plus invalid ones from every terminal state; week-index boundaries include day 6, day 7, day 14, a month boundary, day −1, and a negative index; exercise-archive interaction and archived-template rejection are both covered; the one-active-block and one-active-program partial uniques are covered; scheme bounds hit every limit named in the plan (sets 20, reps 100, span 30, `maxReps === minReps`).

Two real coverage gaps: nothing exercises `uq_schedule_position`'s deferrability (M3), and no test asserts `currentWeekIndex` past `weeksPlanned` or on a completed block (M2). The classification tests exist but encode the wrong expectation (H1).

## 3. Phase 0/1 regression status

Clean. Phase 2 touched twelve pre-existing files, and all twelve diffs are Phase 1 remediation artefacts rather than Phase 2 side-effects: the `MAX_LOAD_STEP_KG = 99.99` ceiling aligned to `numeric(4,2)` (Phase 1 L1), a 409 `ExerciseNameConflictError` path on unarchive (Phase 1 M1), the catalog seed-log table and rewritten seed (Phase 1 H1), and a `/programs` nav link. Auth and middleware are untouched. Exercise APIs and lifecycle still work — the archived-exercise rejection path is exercised from the prescriptions suite. Migrations are append-only: the journal has four entries, `idx` 0–3, monotonic timestamps, no rewrites of `0000`/`0001`. Boundary linting passes with the Phase 2 layers added. The deploy workflow ordering is safe — `quality` gate → build → migrate → seed → deploy, with the DB firewall closed via `if: always()`. No Phase 1 remediation was reverted.

## 4. Phase 2 acceptance-criteria status

| Criterion                                                            | Status                                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Five tables with specified constraints/indexes                        | Met — all partial uniques, both DEFERRABLE constraints, both RESTRICT FKs, all CHECKs present in `0003_chief_miracleman.sql` |
| Prescription editor: `fixed`/`repRange` versioned envelope            | Met                                                                                                                         |
| Target-RIR band                                                       | Met                                                                                                                         |
| Strategy selection + config form, **defaults classified `heuristic`** | Partial — strategy selection works; the only editable knob is `repCap`, and defaults are classified `user_defined` (**H1**)  |
| Ordered template/prescription reordering via deferrable uniques       | Met — reorder genuinely depends on the deferred constraint                                                                  |
| Block start flow, `weeksPlanned` 1–16, deload stored-but-unapplied    | Met                                                                                                                         |
| One-active-block + activate/complete/abandon                          | Met                                                                                                                         |
| Derived current-week display                                          | Met with a caveat (**M2**)                                                                                                  |
| Full PPL program buildable on the phone                               | Met — large touch targets, `max-w-sm` single column, `inputMode="numeric"`, `type="date"`, arrow-button reordering           |
| Nothing from Phase 3+ implemented                                     | Met — no session/execution table, no `evaluate()`                                                                           |

The phone criterion is structurally satisfied; the "buildable under real conditions" judgement still needs the iPhone smoke test from the Definition of Done.

## 5. Phase 3 readiness assessment

1. **Can a workout session safely originate from the current block/schedule/template model?** Yes. `blocks → block_schedule_entries → workout_templates → exercise_prescriptions` is complete and ownership-resolvable from `programs.user_id` in every direction.
2. **Can a session snapshot its prescription without relying on mutable planning rows afterwards?** Yes, structurally. Every field `PrescriptionSnapshot` needs is present and readable: `exerciseId`, exercise name, `scheme`, `targetRir`, `restSeconds`, `progression.{strategyId,config,classification}`, `baselineLoadKg`. Caveat: `strategyVersion` is not in the stored `progression` JSONB (Phase 3 supplies it from the registry, which is correct), and H1 means `config` currently lacks `incrementKg`.
3. **Are `exercise_prescriptions` safe to hard-delete under snapshot-on-use?** Yes — this is not a defect. Snapshot-on-use means the session copies meaning at start and never dereferences the prescription again. `data-model.md` §2.12 confirms it: `workout_sessions` has no prescription FK, and `blockId`/`templateId` are nullable `SET NULL` lineage-only. Deleting a prescription cannot alter any completed session. This is exactly the "preserve meaning without preserving the source row" case.
4. **Are schedule-entry identities stable enough for session provenance?** Yes, with a caveat. Entries are stable once the block leaves `planned` — `BlockScheduleLockedError` guarantees it, and it is tested. While planned they churn on every save (M4), but a planned block cannot have sessions. Note that [phase-2-implementation.md](phase-2-implementation.md) §8 advises creating sessions _against a schedule entry_; that conflicts with `data-model.md` §2.12, which carries meaning via `template_name`/`week_index`/`is_deload` snapshots and has no `schedule_entry_id` column. **Follow the data model, not the handoff note.**
5. **Are ordering constraints safe and maintainable across future migrations?** Yes today, with a documented risk — see M3.
6. **Is progression classification ready for deterministic Phase 3 consumption?** Mechanically yes (pure, deterministic, no clock, no I/O) — but it produces the wrong value on the default path (H1). This is the one readiness answer that is not clean. No recommendation behaviour is prematurely implemented: there is no `evaluate()`, correctly deferred to Phase 4.
7. **Can Phase 3 add session/exercise/set tables without redesigning Phase 2 schema?** Yes. No Phase 2 schema change is required. New tables reference `blocks`/`workout_templates` as nullable `SET NULL` lineage only.
8. **Is block lifecycle/state sufficient for workout execution?** Yes. `planned → active → completed | abandoned` is complete, the one-active invariant is DB-enforced via a partial unique, and the schedule lock provides exactly the immutability guarantee sessions need. `currentWeekIndex` needs bounding (M2). Date handling is sound: `weekIndex()` is pure string arithmetic with no `Date` objects, and the timezone is applied once at the server boundary via `Intl.DateTimeFormat("en-CA", { timeZone })`.
9. **Is D-02 safe to carry until Phase 6?** Yes — confirmed repo-wide. `volume_preset_id` appears in exactly four places: the column definition, the read record type, the UI DTO type, and the migration. No create or update schema accepts it, and all four create schemas strip unknown keys, so no API can write it. Every row will be `NULL`, so adding `REFERENCES volume_presets(id) ON DELETE SET NULL` in Phase 6 validates trivially.
10. **Any Phase 2 debt that compounds once workout history exists?** One: H1. Every other finding is fixable at any time with no historical consequence. H1 is the only one whose cost is permanent from the first session write.

**No mutable "current workout state" has leaked into planning entities.** `blocks` holds only definition plus lifecycle; there is no persisted current week, no persisted working weight (`prescription-model.md` §4's "deliberately no persisted current working weight" holds), and no session pointer. The planning/execution boundary is intact.

## 6. Safe to defer

L1 through L6, plus M4 (bounded by the lifecycle lock) and M1 if H1's fix is scoped narrowly — though fixing them together is less work than fixing them apart. M2 is safe to defer past Phase 3 only if Phase 3 clamps `weekIndex` at snapshot time rather than trusting the derived value.

## 7. Verdict

**READY AFTER MINOR FIXES**

The foundation is sound: schema, constraints, migration, ownership enforcement, lifecycle, and the planning/execution boundary all hold up under inspection, and all ten readiness questions answer favourably on structure. Zero schema drift is verified against real PostgreSQL, and all nine project checks pass.

The gate is H1, and it must close before Phase 3 writes its first `PrescriptionSnapshot` — not before Phase 3 begins. It is a correction to one comparison in `resolveProgression()` plus two test expectations; no schema change, no migration, no architectural rework. Fixing M1 in the same change is the natural scope. M3 warrants one paragraph in a durable contributor doc before Phase 3 adds its own deferrable constraints.
