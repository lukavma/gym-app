# Phase 2 Remediation Verification

Date: 2026-08-16
Verifies: [phase-2-remediation.md](./phase-2-remediation.md) against [phase-2-review.md](./phase-2-review.md) and the actual implementation
Reviewed state: uncommitted Phase 2 working tree (post-remediation) on top of `f5b9b45`

This is a targeted remediation verification, not a full Phase 2 re-review. No
repository files were modified except this report. Conclusions come from
reading the implementation and executing it — not from the remediation
document's own claims.

**Numbering.** The task brief's numbering shifts by one after H-1 relative to
the review's own: brief `H-1 / M-2 / M-3 / M-4` == review `H1 / M1 / M2 / M3`,
and brief `M-5` == review `M4`. This report uses the brief's numbering, with
the review's in parentheses on first use.

**Method.** Read `registry.ts`, `prescriptions/service.ts`, `blocks/service.ts`,
`weekIndex.ts`, `prescriptions/schema.ts`, `PrescriptionForm.tsx`,
`BlockForm.tsx`, the Drizzle schema files, migration `0003`, its snapshot, and
all four remediated test files; executed `resolveProgression()` directly with
the exact payloads the UI sends; ran the full verification suite; and verified
schema state against the **live PostgreSQL 16.14 instance** on `localhost:5432`
(`pg_constraint` introspection, `db:migrate`, `db:generate`).

---

## 1. H-1 (review H1) — Progression default classification: **CLOSED**

All five required conditions confirmed, empirically rather than from tests.

Executed `resolveProgression()` against the exact payloads
[PrescriptionForm.tsx:124-137](../../src/ui/prescriptions/PrescriptionForm.tsx#L124-L137)
sends (`const config = {}`, only ever gaining `repCap`):

```text
load-progression, UI default path config {}      -> heuristic     incrementKg=2.5 present
load-progression, config omitted entirely        -> heuristic     incrementKg=2.5 present
load-progression, incrementKg: 5 (tuned)         -> user_defined  incrementKg=5
load-progression, incrementKg: 2.5 (== step)     -> heuristic
rep-progression + repRange, UI config {}         -> heuristic     repCap=12 present
rep-progression + repRange, explicit repCap: 12  -> heuristic
rep-progression + repRange, explicit repCap: 20  -> user_defined
rep-progression + fixed, UI config {repCap: 15}  -> user_defined
manual, UI config {}                             -> heuristic
```

| Required condition                                             | Result                                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default `load-progression` from the normal UI path → `heuristic` | **Confirmed.** `heuristic` on both `{}` and an omitted config, on both scheme types.                                                               |
| Genuinely customized config → `user_defined`                     | **Confirmed.** `incrementKg: 5` and `holdAtRirZero: false` both flip it; a diverging `repCap` flips it.                                             |
| Effective defaults materialized and persisted                    | **Confirmed.** [registry.ts:139](../../src/domain/progression/registry.ts#L139) builds `schema.parse({...defaultConfig, ...parsedConfig})` and *that* object is what `createPrescription`/`updatePrescription` write ([service.ts:174-201](../../src/server/prescriptions/service.ts#L174-L201), [:231-250](../../src/server/prescriptions/service.ts#L231-L250)). |
| Exercise-derived defaults such as `incrementKg` included          | **Confirmed.** `incrementKg` materializes from `exercise.loadStepKg`; the integration test asserts `config.incrementKg === 2.5` on the persisted row. |
| No incorrect classification can be frozen into Phase 3 snapshots  | **Confirmed.** See below.                                                                                                                          |

**No wrong provenance can leak forward.** `progression` has exactly two write
paths — `createPrescription` and `updatePrescription` — and both route through
`resolveProgression()`; no API route touches `@/db` directly (grep over
`src/app/api/`), and the `boundaries` lint rule enforces that. Additionally,
the live database holds **zero rows** in `exercise_prescriptions` (and zero in
`programs`/`workout_templates`/`blocks`/`block_schedule_entries`), and Phase 2
is undeployed — so no pre-fix misclassified row exists anywhere to be
back-filled or migrated. There is no historical cleanup to schedule.

**Classification is order-robust.** A user config supplied with keys in a
different order than the schema declares still classifies `heuristic`, because
the merged object is re-`parse()`d before comparison, restoring declared-key
order on both sides of `jsonEqual()`. The `JSON.stringify` comparison is
therefore safe, not incidentally correct.

**The two tests that encoded the wrong expectation are gone.** Review-flagged
`prescriptions.integration.test.ts` line 153 is now *"classifies the default
load-progression config (UI default path, config {}) as heuristic"*, and
`progressionRegistry.test.ts` line 41 is now the scheme-derived `repCap`
assertion. The unit suite carries a 10-case `resolveProgression` matrix.

## 2. M-2 (review M1) — Strategy default contract: **CLOSED**

| Required condition                                          | Result                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defaultConfigFor()` has sufficient prescription/scheme context | **Confirmed.** Signature is now `defaultConfigFor(strategyId, scheme: SetScheme, exercise: ExerciseLoadContext)` ([registry.ts:86-101](../../src/domain/progression/registry.ts#L86-L101)). Phase 2 has no `PrescriptionSnapshot` type yet; `scheme + exercise` is the subset of `defaultConfig(prescription, exercise)` (`progression-engine.md` §2) that every MVP default actually reads, and the code comment says so explicitly. |
| `repRange` derives `repCap` from `scheme.maxReps`             | **Confirmed.** `defaultConfigFor("rep-progression", repRange{8-12}, …).repCap === 12`, matching `progression-engine.md` line 171 verbatim: *"required for 'fixed' schemes; for 'repRange' = scheme.maxReps"*.       |
| Required/default values not treated as user customization      | **Confirmed for every case where a default exists.** An explicit `repCap: 12` on a `repRange{8-12}` scheme classifies `heuristic`, not `user_defined`. See note N1 for the `fixed` case, where the spec defines no default. |
| No Phase 3 evaluation behavior prematurely implemented         | **Confirmed.** No `evaluate()` anywhere in `src/` (only comments naming it as Phase 4 scope); no `session_exercises`/`set_logs`/`workout_sessions` table, schema file, migration, or route. `STRATEGY_CONFIG_SCHEMAS` still holds only schemas, `supportsScheme`, defaulting, and classification. |

`updatePrescription` additionally resolves `effectiveScheme` *before*
classifying, so a progression patch is judged against the scheme the row will
actually have — not a stale one. That is a real correctness improvement over
the pre-remediation code.

## 3. M-3 (review M2) — `currentWeekIndex`: **CLOSED**

The behavior matches the accepted architecture, and the "no clamp above
`weeksPlanned`" decision is **supported by the binding domain model, not a
regression**:

> `domain-model.md` §5, line 166 — "A block that runs past `weeksPlanned`
> stays active (calendar shows overdue) until the user completes or extends
> it — extension changes `weeksPlanned`; session snapshots keep old week
> indexes."

Leaving an active block's index unclamped *is* the overdue signal the domain
model requires. Clamping it would have contradicted the spec.

| Required condition                            | Result                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planned block → `null`                          | **Confirmed.** [weekIndex.ts:42](../../src/domain/scheduling/weekIndex.ts#L42); asserted for a planned block whose start date is in the future *and* one already past.        |
| Active block before start → valid bounded value | **Confirmed.** `Math.max(1, …)` floors it at 1; never 0 or negative.                                                                                                        |
| Active beyond `weeksPlanned` → per architecture | **Confirmed.** Unclamped, and the unit test asserts it equals the raw `weekIndex()` *and* is `> weeksPlanned`, so the intent is pinned against accidental future clamping.    |
| Completed/abandoned freeze on terminal date     | **Confirmed.** Reference date becomes `completedDate` (derived from `completedAt`), not the caller's clock. Integration test re-reads a completed block with a 2030 clock and asserts the value is unchanged. |
| No current-week value persisted                 | **Confirmed.** No column on `blocks` ([blocks.ts](../../src/db/schema/blocks.ts)); derived per read inside `toRecord()`, from the caller's `now`. `prescription-model.md` §4's "no persisted current working weight" and §5's "weeks are derived" both still hold. |
| Phase 3 can safely snapshot the week index      | **Confirmed.** Pure, deterministic, `Date`-free arithmetic on `YYYY-MM-DD` strings; the single timezone conversion happens at the server boundary ([userLocalDate.ts](../../src/server/time/userLocalDate.ts)), and `completedAt` is converted through the *same* timezone as `today`, so both sides of the comparison agree. A session started on an active block always snapshots a bounded integer ≥ 1. |

The layer placement is correct: the new function lives in
`src/domain/scheduling/`, not `server/`, so `boundaries` linting still passes.
`BlockRecord.currentWeekIndex` and `BlockDto.currentWeekIndex` are both now
`number | null`, and [BlockForm.tsx:235](../../src/ui/blocks/BlockForm.tsx#L235)
already guarded on `!== null`, so the UI cannot render "Week null".

One pre-existing integration test was corrected rather than deleted: *"computes
currentWeekIndex against the provided clock"* had asserted a numeric index for a
**never-activated** block — which is precisely the M-3 defect. It now activates
the block first and tests active-block progression, which is what it was
written to test. Renaming it was justified, not a weakening.

## 4. M-4 (review M3) — Deferrable migration workflow: **CLOSED**

| Required condition                        | Result                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable documentation exists                | **Confirmed.** New section *"Deferrable unique constraints need a manual migration patch"* in [README.md](../../README.md), in the local-development section immediately after the `db:generate`/`db:migrate` command table. README is tracked and evergreen; `HANDOFF.md` is session-scoped and self-declares that it is overwritten, so it was the wrong home. |
| Explains the Drizzle limitation correctly   | **Confirmed independently.** `drizzle/meta/0003_snapshot.json` models `uq_prescriptions_position` as `{name, nullsNotDistinct, columns}` — no `deferrable` field — and `drizzle-orm/pg-core/unique-constraint.d.ts` exposes no `.deferrable()` builder. Both halves of the README's claim hold. |
| Names the existing Phase 2 constraints      | **Confirmed.** `uq_prescriptions_position` on `exercise_prescriptions (template_id, position)` and `uq_schedule_position` on `block_schedule_entries (block_id, position)` — both listed in the table with their columns.   |
| Names the Phase 3 constraints               | **Confirmed against the spec.** `uq_session_exercise_position` (`data-model.md` §2.13, line 215) and `uq_set_number` (§2.14, line 232), both listed with table, columns, and "Phase 3 (planned)" marker.                    |
| No migration unnecessarily rewritten        | **Confirmed.** `drizzle/0003_chief_miracleman.sql` still carries its two `DEFERRABLE INITIALLY DEFERRED` clauses at lines 37 and 70, unchanged. `_journal.json`'s diff is pure append (`idx` 2 and 3); `0000`/`0001` untouched. |

**Verified live, not just on paper.** Introspecting the running PostgreSQL 16.14
instance:

```text
uq_blocks_sequence          table=blocks                  condeferrable=false condeferred=false
uq_prescriptions_position   table=exercise_prescriptions  condeferrable=true  condeferred=true
uq_schedule_position        table=block_schedule_entries  condeferrable=true  condeferred=true
```

Both intended constraints are genuinely `DEFERRABLE INITIALLY DEFERRED` in a
real database, and `uq_blocks_sequence` is correctly non-deferrable (blocks are
append-only). The README also explicitly instructs future contributors not to
"fix" this by redesigning the migration approach, which is the right guardrail
for the next agent-run phase.

## 5. Deferred findings — unchanged, none worsened

Verified by inspection; none were reopened.

| Finding                                                 | State                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **M-5** (review M4) — schedule-entry id churn on planned edits | Unchanged. `updateBlock` still deletes and re-inserts with fresh `newId()`s ([service.ts:343-361](../../src/server/blocks/service.ts#L343-L361)), still bounded by `BlockScheduleLockedError` ([:324-327](../../src/server/blocks/service.ts#L324-L327)). No block that can own sessions is affected. Risk unchanged. |
| **L1** — create schemas non-`.strict()`                    | Unchanged. `createPrescriptionSchema`/`createProgramSchema`/`createTemplateSchema`/`createBlockSchema` still strip; update schemas still `.strict()`. |
| **L2** — reorder arrays lack uniqueness refinement         | Unchanged. Still `z.array(z.string().uuid()).min(1)` for both reorder schemas.                                     |
| **L3** — `block_schedule_entries` has no timestamps         | Unchanged. No `createdAt`/`updatedAt` (matches `data-model.md` §2.10's explicit column list).                       |
| **L4** — dead `input.schedule.length > 0` branch            | Unchanged, still at [service.ts:348](../../src/server/blocks/service.ts#L348).                                     |
| **L5** — CI omits `typecheck:sw`                            | Unchanged. `ci.yml` runs lint → format:check → typecheck → test:unit → test:integration → build. Verified passing locally instead. |
| **L6** — `max(position)+1` without row locking              | Unchanged in all three services. Near-unreachable in a single-user app.                                            |

## 6. Regression status: **clean**

- **Phase 2 planning entities** — all four service suites pass in full
  (programs 12, templates 12, blocks, prescriptions), including cross-user
  isolation on every operation, the real 0↔1 reorder swap that exercises the
  deferred constraint, block lifecycle transitions, and the one-active
  partial uniques.
- **Phase 1 exercise behavior** — `exercises` and `seed` integration suites
  pass unchanged; `exerciseSchema` unit suite passes (24 tests). The
  archived-exercise rejection path is still exercised from the prescriptions
  suite. No Phase 1 remediation was reverted.
- **Architecture boundaries** — `eslint` (including `boundaries`) exits 0. The
  new `currentWeekIndex` sits in `src/domain/scheduling/` and imports nothing;
  no API route imports `@/db` directly.
- **Migrations/schema** — journal append-only (`idx` 0–3, monotonic); no
  migration file modified; `db:migrate` applies cleanly to real PostgreSQL;
  `db:generate` reports zero drift and emits nothing.
- **Build** — production standalone build succeeds, all routes emitted.
- **Progression classification tests** — 15 tests in
  `progressionRegistry.test.ts`, covering the full H-1 matrix.
- **Block week-index tests** — 15 tests in `weekIndex.test.ts` (7 raw
  `weekIndex` + 8 `currentWeekIndex`), plus 3 integration tests.

Test counts moved from the review's baseline of 138 unit / 95 integration to
150 / 97 — **+12 unit and +2 integration, with no test deleted** to make the
fix pass.

## 7. Test results

| Check                                | Result                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `pnpm lint` (incl. `boundaries`)     | **pass** (exit 0)                                                        |
| `pnpm exec prettier --check .`       | **pass** — "All matched files use Prettier code style!"                  |
| `pnpm typecheck`                     | **pass** (exit 0)                                                        |
| `pnpm typecheck:sw`                  | **pass** (exit 0)                                                        |
| `pnpm test:unit`                     | **pass — 150/150**, 12 files                                             |
| `pnpm test:integration`              | **pass — 97/97**, 7 files (PGlite, real `drizzle/` migrations)           |
| `pnpm build`                         | **pass** — standalone production build, all routes                       |
| `pnpm db:migrate` (**live** PG 16.14)| **pass** — "migrations applied successfully"                             |
| `pnpm db:generate` (**live** PG 16.14)| **pass** — "No schema changes, nothing to migrate", 11 tables            |
| `git status drizzle/` before ↔ after | **identical** (same hash) — no migration or snapshot emitted             |

**Live-PostgreSQL verification, not snapshot-only.** Unlike the remediation
document — which could only run the schema-vs-snapshot diff because Docker was
unavailable in that environment — this verification reached a real
**PostgreSQL 16.14** instance at `localhost:5432` with all 11 tables and 4
applied migrations. Both classes of check were run and are reported separately:

- *Snapshot-generation verification*: `db:generate` diffs the TS schema against
  `drizzle/meta/*.json` and needs no connection → zero changes.
- *Live-PostgreSQL verification*: `db:migrate` applied against the real server →
  clean; `pg_constraint` introspection → both deferrable constraints genuinely
  `condeferrable`/`condeferred` in the live catalog.

The remediation document's one listed "unresolved issue" (live `db:migrate`
unverified) is therefore now **resolved**.

## 8. New BLOCKER / HIGH findings: **none**

No new BLOCKER or HIGH finding. Four informational notes, none of which gate
Phase 3 and none of which need action now:

- **N1 (informational) — `rep-progression` + `fixed` still always classifies
  `user_defined`.** The review listed this under H1 ("a required field is not
  'tuning'"). The remediation consciously diverges on that sub-point:
  `progression-engine.md` line 171 says `repCap` is *"required for 'fixed'
  schemes"* while defining a default only for `repRange`, so on a `fixed`
  scheme there is no shipped default to compare against and the value is one
  the user genuinely typed into a required field. The reasoning is documented
  in the code and the remediation doc, and the classification is truthful under
  `domain-model.md` §4. Accepted as a defensible reading, not a residual
  defect — but it is a divergence from the review text, so it is flagged
  explicitly rather than buried.
- **N2 (informational) — the UI edit path resets non-`repCap` config knobs.**
  `PrescriptionForm` rebuilds `config` from scratch on every save and only ever
  re-adds `repCap`, so a config customized through the API (e.g.
  `decreasePercent`) would revert to defaults — and to `heuristic` — on the
  next UI save. Pre-existing behavior, unchanged by the remediation, and
  currently unreachable because the form exposes no other knob. Worth a test
  when Phase 4 grows the config form.
- **N3 (informational) — an API-only `PATCH` that changes `scheme` without
  `progression` leaves a scheme-derived `repCap` stale.** The UI always sends
  `progression`, so it re-resolves against the new scheme; only a hand-crafted
  API call can hit this. Classification stays truthful either way (the value
  was still system-derived, not user-chosen).
- **N4 (Phase 3/4 note) — resolve `deload.weekIndex: "last"` against
  `weeksPlanned`, not against the derived current week.** Now that an overdue
  active block legitimately reports week 9 of a 4-week block, `"last"` must
  mean `weeksPlanned`. Inherent to the accepted overdue model, not a defect in
  it. Deload is stored-but-unapplied in Phase 2, so nothing is wrong today.

## 9. Phase 3 readiness assessment

The review's only Phase 3 gate was H-1, with M-4 recommended as a
before-Phase-3 documentation task. Both are closed, and the two supporting
findings (M-2, M-3) closed with them.

Re-checking the readiness answers the review left qualified:

- **Q6 — "Is progression classification ready for deterministic Phase 3
  consumption?"** Was the one unclean answer. Now clean: pure, deterministic,
  clock-free, I/O-free, and it produces the *correct* value on the default
  path. `PrescriptionSnapshot` can copy `progression.{strategyId, config,
  classification}` directly, and `config` now carries the materialized
  `incrementKg`/`repCap` rather than requiring Phase 4 to re-derive them from
  the live exercise row.
- **Q8 — block lifecycle/state.** `currentWeekIndex` is now bounded and
  status-aware, so a session can snapshot `weekIndex` from it without
  post-processing. The clamp-at-snapshot workaround the review contemplated is
  no longer needed.
- **Q5 — ordering constraints across future migrations.** The hazard is now
  documented where the next contributor will land, with the two Phase 3
  constraint names spelled out.

Everything else the review cleared is untouched: no schema change, no migration
edit, no new table, no `evaluate()`, no session/execution surface, and the
planning/execution boundary is intact. `PrescriptionSnapshot` remains
constructible from Phase 2 data, `exercise_prescriptions` remains safe to
hard-delete under snapshot-on-use, and schedule-entry identities remain stable
once a block leaves `planned`.

Two items carry forward unchanged from the review and are **not** Phase 3
gates: the iPhone smoke test from the Definition of Done still has not been
performed, and Phase 2 remains uncommitted and undeployed.

## 10. Verdict

**READY FOR PHASE 3**

H-1, M-2, M-3, and M-4 are all closed, verified against the implementation and
by execution rather than by the remediation document's own account. M-5 and
L1–L6 remain deferred and unworsened. All eight project checks pass, schema
drift is zero against a **live PostgreSQL 16.14** instance, and both deferrable
constraints are confirmed in the live catalog. No BLOCKER or HIGH finding
remains or was introduced.
