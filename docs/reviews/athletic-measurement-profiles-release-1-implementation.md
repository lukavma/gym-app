# Athletic Exercise Measurement Profiles — Release 1 implementation report (PI-005)

**Date:** 2026-09-07
**Baseline:** `main` at `05982f6` (metrics dashboard), migrations `0000`–`0012`
**Implements:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` §21.1 exactly, per the accepted owner decisions O-1…O-17 (`docs/reviews/athletic-measurement-profiles-owner-decision-integration.md`, `docs/reviews/athletic-measurement-profiles-owner-decision-integration-verification.md`, `VERIFIED — READY FOR RELEASE 1 IMPLEMENTATION`).
**Method:** a 9-stage implementation pass (sequential, one repository, no worktrees), followed by an independent 5-agent verification pass (e2e regression, a second adversarial migration verification, the §21.6 performance comparison, an adversarial negative-control audit, and the §24.1 documentation updates), followed by one targeted remediation the audit's findings required. Every gate count in this report was re-run and confirmed directly by the orchestrator, not taken on trust from an agent's self-report.
**Scope discipline:** no production code, migration, seed, or test outside this release's own file manifest (§1) was touched; no owner decision was reopened; nothing was committed, pushed, tagged, or deployed; production was not contacted; device acceptance was not performed (out of scope for this report, per the task).

---

## 0. Verdict

**Release 1 is implemented exactly as §21.1 specifies, verified, and one real test-coverage gap the verification pass found has been closed.** Every acceptance criterion and negative control named for Release 1 is either passing (with independently re-run exact counts) or, in one case, was found not to be genuinely load-bearing and was fixed before this report was written — not merely noted. The migration is additive, its generated SQL is a byte-exact match to the binding DDL, and two independent adversarial passes (the implementation's own Stage 2 and a fresh second pass with a richer fixture) confirm every composite foreign key, the shape CHECK, cascade behaviour, and every numeric boundary — each proven non-vacuous by dropping the constraint in a scratch database and watching the same statement succeed. The nine hard Release-1 boundaries (no client sync-key emission, no client/IndexedDB DTO widening, no athletic logging UI, no unlocked selectors, no new prescription-editor variants, no seed reconcile, no Release-2 banners, no Release-2/3 behaviour, byte-identical `load_reps` behaviour) are all independently confirmed untouched by diffing exactly those paths against the pre-implementation tree.

Three findings surfaced by the verification pass are recorded honestly rather than smoothed over: a **critical** test-coverage gap in the sync layer's poison-batch guard (found, root-caused, and fixed — see §7.4); two **low-severity documentation-accuracy** findings in §21.6's own performance estimates (bundle-size growth is 50–70 bytes, not "roughly 40", and the dashboard's absolute latency roughly doubled while staying comfortably inside its budget — see §8); and one **cosmetic** finding in the generated migration's physical column order (semantically inert — see §2.4).

**READY FOR INDEPENDENT REVIEW** (restated in full at the end of this report, §12).

---

## 1. Exact file manifest

66 tracked files show in `git diff --stat` against `05982f6` — 2,986 insertions / 391 deletions — matching the independent review's own count exactly. Two of those 66 (`CLAUDE.md`, `docs/input/product-ideas.md`) are **pre-existing, unrelated changes already in the working tree before this task began** and were not touched further (confirmed by `git status --porcelain` before and after every stage — see §15). This release's own tracked-modified file count is therefore **64**. Add **15 new, untracked files** — the migration pair (`drizzle/0013_serious_omega_flight.sql`, `drizzle/meta/0013_snapshot.json`) is two of those 15, not an addition on top of them — for **79 files total** in this release's manifest. The 15 new files total **2,347 lines** of authored source and test code; the separately generated, machine-written `drizzle/meta/0013_snapshot.json` (3,143 lines of schema metadata, not authored code) is excluded from that figure.

### 1.1 Migration (generated + hand-reordered)

| File | Status |
| --- | --- |
| `drizzle/0013_serious_omega_flight.sql` | new |
| `drizzle/meta/0013_snapshot.json` | new |
| `drizzle/meta/_journal.json` | modified (registers `0013`) |
| `src/db/schema/exercises.ts` | modified |
| `src/db/schema/sessionExercises.ts` | modified |
| `src/db/schema/setLogs.ts` | modified |

### 1.2 New domain module (`src/domain/measurement/**`, I-10 zero-import module)

`profile.ts`, `compatibility.ts`, `capabilities.ts`, `format.ts` — all new.

### 1.3 Modified domain modules

`src/domain/exercises/schema.ts`, `src/domain/metrics/estimateIndex.ts`, `src/domain/metrics/selection.ts`, `src/domain/prescriptions/schema.ts`, `src/domain/progression/evaluateSession.ts`, `src/domain/progression/loadProgression.ts`, `src/domain/progression/registry.ts`, `src/domain/progression/repProgression.ts`, `src/domain/progression/workingTargets.ts`, `src/domain/schemas/prescriptionSnapshot.ts`, `src/domain/schemes/setScheme.ts`, `src/domain/strength/eligibility.ts`, `src/domain/strength/reasonCodes.ts`, `src/domain/strength/types.ts`, `src/domain/sync/schema.ts`, `src/domain/volume/aggregate.ts`.

### 1.4 Server layer

`src/server/blocks/service.ts`, `src/server/exercises/service.ts`, `src/server/history/service.ts`, `src/server/metrics/selectionService.ts`, `src/server/metrics/service.ts`, `src/server/prescriptions/service.ts`, `src/server/progression/service.ts`, `src/server/strength/service.ts`, `src/server/sync/service.ts`, `src/server/today/service.ts`, `src/server/volume/service.ts`.

### 1.5 API / UI

`src/app/api/exercises/[id]/route.ts`, `src/ui/exercises/ExerciseForm.tsx`, `src/ui/exercises/types.ts`, `src/ui/prescriptions/PrescriptionForm.tsx`, `src/ui/strength/copy.ts`.

### 1.6 Tests — new

`tests/unit/measurement/{profile,compatibility,capabilities,format}.test.ts`, `tests/unit/measurementBoundary.test.ts`, `tests/unit/prescriptionSnapshot.test.ts`, `tests/unit/progressionMeasurementGate.test.ts`, `tests/unit/progressionWorkSetMapping.test.ts`, `tests/integration/measurementSync.integration.test.ts`.

### 1.7 Tests — extended

`tests/integration/{exercises,metrics,metricsSelection,strength,today,volume}.integration.test.ts`; `tests/unit/{exerciseSchema,metricsBoundary,metricsEstimateIndex,metricsSelection,prescriptionSchema,progressionBoundary,progressionMatrix,progressionRegistry,strengthBoundary,strengthObservation,strengthReasonCodes,strengthWhatIf,volumeAggregate}.test.ts`.

### 1.8 Documentation (§24.1, see §11)

`docs/architecture/{data-model,domain-model,volume-model,prescription-model,progression-engine,pwa-offline-strategy}.md`, `docs/reviews/estimated-1rm-load-translation-architecture-revision.md`, `docs/architecture/adr/ADR-011-strength-estimation-and-load-translation.md`.

### 1.9 Confirmed untouched (the pre-existing, unrelated working-tree changes)

`CLAUDE.md`, `HANDOFF.md` (deletion), `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, and the untracked `docs/reviews/*.md` files that are inputs to or siblings of this work (the architecture evaluation itself, its review/verification lineage, the owner-decision-integration pair, `repository-agent-workflow-{evaluation,review}.md`, `warmup-routines-evidence-research.md`) — none of these was modified, staged, or committed by any stage of this implementation. Verified by `git status --porcelain` before the first stage and after the last, and again after the post-verification remediation: identical set, identical content.

---

## 2. Migration `0013` — evidence

### 2.1 Exact DDL match

`drizzle/0013_serious_omega_flight.sql` was read in full, twice independently (once by the implementation's Stage 2, once by the verification pass's adversarial second read), and both confirm every column, CHECK, unique pair and composite foreign key is a **term-for-term match** to §8.1–§8.3's DDL: three new columns and four constraints on `exercises`; two new columns and three CHECKs + the unique pair + the mirror FK on `session_exercises` (`FOREIGN KEY (exercise_id, measurement_profile) REFERENCES exercises (id, measurement_profile) ON DELETE RESTRICT`); two dropped `NOT NULL`s, three new columns, two range CHECKs, the composite FK (`FOREIGN KEY (session_exercise_id, measurement_profile) REFERENCES session_exercises (id, measurement_profile) ON DELETE CASCADE`) and the full six-branch `ck_set_logs_profile_shape` OR-chain on `set_logs`. No separate profile-enum CHECK exists on `set_logs`, matching §8.3's deliberate omission.

### 2.2 Hand-edit and why

drizzle-kit's first generation emitted both composite FKs **before** the `UNIQUE` constraints their target columns depend on, which PostgreSQL rejects (`42830`, "there is no unique constraint matching given keys"). Stage 2 reordered the whole statement sequence to §14.1's table order (`exercises` cols+CHECKs+unique → `session_exercises` cols+CHECKs+unique+mirror FK → `set_logs`) — **no statement's text was changed**, only their order — with a header comment recording the defect and the fix, matching the `0003`/`0004` DEFERRABLE hand-edit precedent. `pnpm db:generate` was re-run after the edit and reported no further drift.

### 2.3 Schema-drift check (NC-12, first half)

Re-confirmed directly by the orchestrator against the persistent local dev Postgres (a non-destructive schema diff only, no migrate/seed): `pnpm db:generate` → *"No schema changes, nothing to migrate 😴"*.

### 2.4 Two independent live-PostgreSQL verifications

**Stage 2** (disposable `postgres:16`, its own port, torn down after): migrated `0000→0013` from scratch; confirmed pre-`0013`-shaped rows default to `load_reps`/`unspecified`/`auto` and satisfy every new constraint; ran NC-5(a)/(b)/(c) (both composite FKs' `23503`, and the profile-lock `UPDATE` rejection) and NC-12's shape-CHECK `23514`, each with a non-vacuity control (drop the constraint in a scratch copy → the same statement succeeds); confirmed the `session → session_exercises → set_logs` cascade is unaffected by the new composite CASCADE FK.

**Independent second pass** (fresh disposable `postgres:16`, different container/port, adversarial re-derivation — did not reuse Stage 2's fixture or scripts): migrated `0000→0012`, inserted a **realistic** pre-`0013` fixture (4 exercises across 4 equipment types, 2 sessions, 5 session_exercise slots split template/ad-hoc, 11 set_logs rows including a legitimate `0 kg` bodyweight set and a null-`rir` set), captured full row snapshots, migrated the single remaining `0013` step, and diffed **every pre-existing column's value, row by row** — all three diffs (exercises/session_exercises/set_logs) were empty, i.e. **zero value changes** on any pre-existing column (I-2). Re-ran NC-5(a)/(b)/(c) and NC-12 independently, all with the same drop-and-retry non-vacuity technique, all confirmed. Ran the cascade probe against the realistic multi-row fixture (not a single row): deleting one session cascaded its 3 slots and 8 sets to zero while a sibling session's 2 slots / 3 sets were confirmed untouched. Ran the numeric-boundary probes at the DB layer and recorded the **actual** SQLSTATE per column rather than assuming one: `weight_kg` ceiling `9999.99` accepted, `10000.00` → `22003` (column-precision overflow, no explicit upper CHECK exists on this pre-existing column); `distance_m` ceiling `99999.99` accepted, `100000.00` → `22003` (the column's own `numeric(7,2)` precision cap coincides exactly with the CHECK's ceiling, so precision overflow fires first); `duration_s` ceiling `86400` accepted, `86400.01` → `23514` via `ck_set_logs_duration_s_range` (this column's precision headroom is larger than its business-rule ceiling, so here the CHECK, not precision, is what rejects it). All containers, scratch databases and scratch scripts were torn down; `gym-app-db-1` was never connected to by either pass.

**One LOW, non-blocking finding:** the migration's physical column-add order on `set_logs` (`distance_m`, `duration_s`, `measurement_profile`, driven by `src/db/schema/setLogs.ts`'s TS field order, which drizzle-kit follows) differs from §8.3's prose listing order (`measurement_profile` first). Every constraint name, clause, and semantic is unaffected — no code in the repository binds to `set_logs` positionally (Drizzle addresses columns by name throughout; no `SELECT *` usage was found) — so this is cosmetic only.

### 2.5 Rollback evidence

Not independently re-derived beyond what §14.5 already establishes analytically (this report did not roll back a running deployment, since nothing was deployed): Release 1 → pre-`0013` is safe because every column carries a default and the previous build never references the new columns. The mirror FK and the composite `set_logs` FK both default to `load_reps`, which is what every row already is, so an old build's insert satisfies every new constraint without modification. This was exercised indirectly by both migration verifications above starting from a genuinely pre-`0013`-shaped fixture and confirming zero value change on migrate-forward — the same property a rollback-then-reapply would depend on.

---

## 3. Domain vocabulary module (`src/domain/measurement/**`)

`profile.ts` (zero imports — confirmed both by `extractModuleSpecifiers` in `tests/unit/measurementBoundary.test.ts` and by manual read), `compatibility.ts` (imports only `./profile`), `capabilities.ts` (imports only `./profile`, `./compatibility`), `format.ts` (imports only `./profile`) — I-10 satisfied exactly, with a new boundary-test suite following the existing `strengthBoundary`/`progressionBoundary`/`metricsBoundary` template (discovered-inventory + completeness guard + anti-vacuity + synthetic-edge negative control), plus those three existing suites' allowlists extended to permit importing `domain/measurement`. `dimensionsOf` reproduces §6.2's matrix exhaustively (unit-tested with a type-level `satisfies` check); `profileSupportsScheme`/`strategySupportsProfile` reproduce §9.2's full table; `isProfileEligibleForE1rm`/`isProfileEligibleForVolume`/`isProfileEligibleForProgression` are the named capability predicates; `formatSetLine` renders all eight §15.4 example lines plus the O-8 `m:ss` secondary form for durations ≥ 60 s.

---

## 4. Prescription / scheme layer

`setSchemeSchema` widened to a 4-member discriminated union (`distanceRounds`, `durationRounds` added, exact bounds per §9.1); `formatScheme` renders both new variants (required simply to typecheck against the widened union, per §21.1's own note); `SCHEME_ENVELOPE_VERSION` unchanged at `1`. `prescriptionSnapshotDataSchema` gains the one optional `measurement` key; a snapshot without it still parses as `load_reps` (A-7). `schemeDefaultReps` widened to `number | null`. `registry.ts`'s `supportsScheme` is now a real, profile-aware table composed from `domain/measurement/compatibility`; every call site (`evaluateSession.ts`, tests) updated. `checkPrescriptionCompatibility` gains the profile parameter and reports both §9.2 issue kinds plus §9.3's `targetRir`/`baselineLoadKg` field rules (an explicit `null` clear or an omitted field is never flagged — only a genuine attempt to set a forbidden field is). The prescription editor's scheme dropdown (`src/ui/prescriptions/PrescriptionForm.tsx`) is restricted to a local `EDITABLE_SCHEME_TYPES = ["fixed","repRange"]` constant — the schema accepts the two new variants, the editor does not offer them, exactly as §21.1 requires.

---

## 5. Exercise definition world

`createExerciseSchema`/`updateExerciseSchema` gain `measurementProfile`/`loadBasis`/`volumeCounting` with the exact default/presence rules of §12.1; `createExercise` applies O-4(ii)'s profile-dependent `volumeCounting` default (`'auto'` for `load_reps`, `'off'` for every other profile); `updateExercise` enforces §10.3's lock (`409 measurement_profile_locked` once referenced by any `session_exercises` or `exercise_prescriptions` row, with the mirror FK's raw `23503` mapped to the same error as a backstop) and a new `400 load_basis_not_supported` guard for a bare `loadBasis` patch against an incompatible unchanged profile (proactively closing a landmine the task's own I-13/H-12 framing warns about, rather than leaving it as an unmapped `23514`). `ExerciseDto`/`ExerciseRecord` and `GET /api/exercises?search=` carry the three new fields.

**Locked UI selector:** `src/ui/exercises/ExerciseForm.tsx` gains a disabled "Measurement profile" `<select>` (single `load_reps` option), rendered in both create and edit mode, placed **after** the existing edit-only Strength-estimate select specifically so it does not renumber the two existing Playwright specs (`muscleTaxonomyV2.spec.ts`, `exerciseDecimalInput.spec.ts`) that address `<select>` elements by fixed positional index — verified both by grep-derived index counting during implementation and, since then, by the full 112/112 e2e regression run (§7.2). No load-basis or volume-counting UI control was added; §21.1 names only the profile selector.

---

## 6. Read-side gates (§11.3's site table)

| Site | File | Change |
| --- | --- | --- |
| 1 — progression work-set mapping | `src/server/progression/service.ts` (new exported `mapWorkSetRows`), `src/domain/progression/evaluateSession.ts` | selects `session_exercises.measurement_profile`; excludes non-`load_reps` rows **before** mapping; `evaluateSession` `continue`s early for any non-`load_reps` slot, independent of the pre-existing `unsupportedSchemeDraft` scheme-mismatch path |
| 2 — client offline evaluation | `src/sync/activeSession.ts` | **deliberately not touched in Release 1** — this site requires the aggregate to carry `measurement.profile`, which is a client-DTO widening explicitly excluded from Release 1 (O-7); unobservable in R1 since every real slot is `load_reps` |
| 3 — strength fact rows | `src/server/strength/service.ts`, `src/domain/strength/{eligibility,types,reasonCodes}.ts` | keeps only `load_reps` slots; replaces `weightKg ?? 0` **and** `reps ?? 0` with explicit null-skips; `evaluateExerciseEligibility` reordered to profile → basis → equipment → switch (O-17); two new reason codes added ahead of the existing exercise-level pair, excluded from `RELEASE_B_ONLY_REASON_CODES` |
| 4 — volume contribution rows | `src/domain/volume/aggregate.ts`, `src/server/volume/service.ts` | `WorkSetContributionRow` gains `measurementProfile`/`volumeCounting`; the work-row filter gains `isProfileEligibleForVolume(...) && volumeCounting === 'auto'` beside the existing warm-up filter |
| 5 — display DTOs | `src/server/today/service.ts`, `src/server/history/service.ts`, `src/server/blocks/service.ts` | `HistorySetDto`/`HistorySetDetail`/server-side `ActiveSessionSetDto` widen `weightKg`/`reps` to `number \| null` and gain `distanceM`/`durationS`; rows are **not** excluded, only typed honestly; a previously-unowned `?? 0` landmine in `blocks/service.ts`'s before/after-load summary was found (by Stage 2's typecheck sweep) and fixed (by Stage 9) with the same explicit-skip idiom |

Metrics' own fact-row grouping (`src/server/metrics/{service,selectionService}.ts`) carried the identical `?? 0`/`?? 1` pattern and was fixed as part of the Volume+Metrics stage, on the same defensive, currently-unreachable-but-required-by-I-13 basis as site 3. `isSelectionEligible` threads real `measurementProfile`/`loadBasis` through every caller (no placeholder, unlike `loadStepKg`). The Metrics Training card was traced end-to-end and found to share **zero code path** with volume aggregation (`TrainingSetRow` carries no profile/weight/rep fields at all) — proven with a dedicated integration test, not asserted from a code read alone; its caption text is correctly left unchanged (that is a Release-2 item, O-6).

A full, explicit repository sweep for `?? 0` / `?? 1` near any weight/rep value (§9's Part-B item, ~30 raw hits manually inspected) found no further coercion violations — every remaining hit is either an unrelated counter/config default or a comment describing what the code deliberately does *not* do.

---

## 7. Sync acceptance-layer widening and its independent verification

### 7.1 What shipped

`src/domain/sync/schema.ts`: `setLogUpsertPayloadSchema` widens `weightKg`/`reps` to nullable-optional (bounds unchanged, no `multipleOf` per O-15) and gains `distanceM`/`durationS`; `sessionExerciseUpsertPayloadSchema` gains optional `measurementProfile`/`loadBasis`. Both stay `.strict()`.

`src/server/sync/service.ts`: `SyncRejectReason` gains `invalid_measurement`/`measurement_profile_mismatch`; `SESSION_EXERCISE_FIELDS`/`SET_LOG_FIELDS` (now exported, for NC-1's own test) gain the new keys; `applySessionExerciseUpsert`'s insert path does the §10.1 user-scoped derivation (missing/foreign exercise → `invalid_reference`; a disagreeing payload `measurementProfile` → `measurement_profile_mismatch`; the payload's `loadBasis` is **never** compared or written — the slot always gets the live exercise row's basis, per I-14); `applySetLogUpsert`'s creation-required check is now profile-scoped via `dimensionsOf`, with a new `classifyCreateFailure` helper distinguishing `invalid_measurement` (a forbidden field present, or an explicit `null` on a required one) from `missing_required_fields` (a required field simply absent) — a design correction made after an initial literal reading produced the wrong reject reason for one of NC-3/A-18's own explicit scenarios (recorded in full in §9). Both functions' catch blocks now map `23514`/`22003` to `invalid_measurement` alongside the unchanged `23505`/`23503` mappings.

Client emitters (`src/sync/activeSession.ts`, `src/domain/sync/setDeletionOps.ts`, `src/domain/sync/payloadBuilders.ts`) were **not touched** — confirmed by an empty `git diff --stat` on those exact paths, independently, twice.

### 7.2 Test evidence, as originally written

The new `tests/integration/measurementSync.integration.test.ts` originally shipped (Stage 8) with 44 tests covering NC-1 (server-key half, with a mutation witness), NC-2 (byte-identical nine-key `load_reps` create), NC-3 (dual-path rejection — service layer vs. DB layer with the service bypassed), NC-4 (the full profile × dimension matrix, plus DB-layer probes, plus numeric boundary rows with empirically-determined SQLSTATEs), NC-14 (basis-changed-applies vs. profile-changed-rejects vs. both-absent-derives-silently, with a mutation witness), and A-18. Stage 9 then added one A-13 block (§9's L-8 note) and this section's own remediation (§7.4) added one more — **the file's current, final count is 46 tests, independently confirmed by direct test-runner output, not by re-adding the figures below.** The pre-existing `sync.integration.test.ts` (18 tests, including all of MEDIUM-1's V-1/V-2/V-3 supersession regressions) passes byte-for-byte unmodified.

### 7.3 What the independent adversarial audit found

The verification pass's negative-control audit (§7.4) discovered that **NC-3's and NC-4's "DB layer, service check bypassed" tests bypass the service by calling `db.insert(setLogs)` directly** — this proves the DB constraint fires with the right SQLSTATE, but never executes `applySetLogUpsert`'s own catch-block mapping code at all, because that code only runs inside `applySyncBatch`. Deleting the `23514`/`22003` mapping branch left all 45 of the file's then-current tests (44 original + Stage 9's A-13 block) passing unchanged. This is exactly the class of regression H-17 exists to prevent, and it would have shipped with **zero test coverage protecting it**.

### 7.4 Remediation

Fixed directly (not merely documented) before this report was finalized:

- `isEffectiveSetRowValid` (the private JS-side pre-check that mirrors the DB shape rule) is now reached through a new exported indirection object, `export const setLogPreCheck = { isEffectiveSetRowValid }`, with `applySetLogUpsert`'s two call sites reading through it. The function's own name/signature/body is unchanged — this is the minimal, additive-visibility pattern this same file already uses for `SESSION_EXERCISE_FIELDS`/`SET_LOG_FIELDS`.
- **Why not a direct `vi.spyOn` on a bare export:** empirically verified (with a throwaway scratch module, since deleted) that this codebase's Vitest/esbuild transform binds an exported function's internal same-module call sites directly to the local declaration, not through the exports object — a bare-export spy silently never fires. The holder-object indirection is a known, correct workaround for exactly this limitation and was verified working before being applied to the real file.
- A new test drives a `load_reps` create with `reps: null` **through the real `applySyncBatch`**, with `setLogPreCheck.isEffectiveSetRowValid` spied to force `true` (simulating "the JS pre-check has a bug/gap") so the row reaches the real DB. Before the fix (mapping branch re-deleted for the proof): the test failed with an **unhandled** `ck_set_logs_profile_shape` `23514` error propagating out of `applySyncBatch` — the literal H-17 symptom. After restoring the mapping (verified byte-identical to its original content): `rejected: [{ opId, entity: "setLog", reason: "invalid_measurement" }]`, zero rows written.
- **The `22003` half of the gap is not closeable the same way, and is not actually a gap:** every wire bound in `setLogUpsertPayloadSchema` (`weightKg` ≤ `9999.99`, `distanceM`/`durationS` at their column ceilings) is already set exactly at the column's storage ceiling, so no value that survives Zod's own `.safeParse` can ever overflow the column — `22003` is structurally unreachable through any real parsed payload, with or without bypassing internal checks. The existing raw-`db.insert()`-bypass test is therefore the *correct* technique for that specific boundary, not a shortcut around a testable path; this was independently re-derived from the actual Zod bounds and column precisions before accepting it.
- A related, **not fixed**, out-of-scope-for-this-remediation finding: `applySessionExerciseUpsert` has an analogous `23514` backstop for its own CHECK constraints, but its validation is an inline comparison, not a standalone predicate function like `isEffectiveSetRowValid` — the same one-line indirection technique does not apply cleanly, and fixing it was judged a separate, smaller follow-up rather than blocking this report.

**Final counts after the fix, independently re-run:** `pnpm typecheck`/`lint`/`format:check` clean; `pnpm test:unit` **981/981**; `pnpm test:integration` **428/428** (5 opt-in real-Postgres concurrency suites skipped, 16 tests, as always).

---

## 8. Performance (§21.6)

**Corrected 2026-09-07 per the independent Release-1 review's M-1 finding** (`docs/reviews/athletic-measurement-profiles-release-1-review.md` §5.1); see `docs/reviews/athletic-measurement-profiles-release-1-remediation.md` for the full remediation record. The comparison below originally used `metrics-dashboard-implementation.md`'s `min 17.16 / p50 18.45 / p95 20.93 / max 21.36 ms` figures as the baseline. That baseline is **superseded within this repository's own review lineage**: `metrics-dashboard-review.md` found the fixture generator that produced it used `EXERCISES_PER_SESSION = 2` (≈7,800 set rows over three years, roughly 4× lighter than the shape §20 step 2 / `data-model.md` §6 specify), and re-measuring the *same, pre-`0013` release* at the corrected `EXERCISES_PER_SESSION = 8` shape (≈31,200 set rows — the shape this release's own measurement below already used) gave `p95 = 44.97 ms`, corroborated by `metrics-dashboard-remediation.md` (`p95 = 43.56 ms`) and `metrics-dashboard-remediation-verification.md` (`p95 = 53.48 ms`). The 20.93 ms figure was never a like-for-like baseline for this release's 31,200-row measurement.

Measured on a fresh disposable `postgres:16` container at the corrected 3-year heavy-user fixture scale (780 sessions / 6,240 session_exercises / 31,200 set_logs / 1,095+1,095 bodyweight+recovery rows), via the unmodified `scripts/metricsPerformanceFixture.ts`:

| | min | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| Corrected pre-`0013` baseline, same 31,200-row shape (`metrics-dashboard-review.md` / `-remediation.md` / `-remediation-verification.md`) | 32.08–36.93 ms | 34.77–41.34 ms | **43.56 / 44.97 / 53.48 ms** | 37.77–54.54 ms |
| This release (fresh disposable container) | 35.98 ms | 38.86 ms | **42.03 ms** | 44.17 ms |

**Verdict: PASS, and no regression.** `42.03 ms` sits inside the corrected baseline's own `43.56–53.48 ms` p95 range — this release is **flat to slightly faster** than the pre-`0013` code at the same fixture shape, comfortably inside §11.3's local p95 ≤ 100 ms budget. There is no ~20 ms / ~100% shift to explain, because the number it was originally compared against was never measuring the same fixture shape. (The review's own warm-container re-runs additionally show that container warmth alone moves p50 by only ~3 ms, and an `EXPLAIN ANALYZE` A/B of `queryWorkSetContributionRows` with and without the new `INNER JOIN exercises` shows `0.478 ms` vs `0.538 ms` — the join's cost is nil, an index scan on the new `uq_exercises_id_profile` index — so even had a real gap existed, neither infrastructure warmth nor the new join could have produced one of the size the original comparison implied.)

**Bundle-size delta:** measured `TodayBundleExerciseEntry`'s JSON byte delta for the new `measurement` field directly (`Buffer.byteLength`, with/without the key) across all six profile/basis combinations: **50–68 bytes** (average ~59 bytes), never as low as the spec's "roughly 40 bytes" estimate. This finding stands as originally reported — it is a real, minor documentation-accuracy gap in §21.6's estimate, independently reconfirmed by the review (50 and 68 bytes at the extremes) — and remains a small correction for whoever next revises §21.6/§24.1's bundle-size figure. §21.6's "no new queries" line is also imprecise in one respect: `queryWorkSetContributionRows` gains one `INNER JOIN exercises` (measured cost nil, per the `EXPLAIN` figures above) — recorded in the specification lineage itself, not just here (see the architecture evaluation's new §28 correction-log entry).

---

## 9. Acceptance criteria — Release 1 (§20, §21.1's list)

| Criterion | Status | Evidence |
| --- | --- | --- |
| A-1 | ✅ | `dimensionsOf` exhaustiveness, type-level + runtime table test |
| A-2 (R1 clause only — the third, `validateSetInput`, clause is X-1/Release-2 and correctly not attempted) | ✅ | per-profile required/optional/forbidden acceptance, numeric boundary rows, at domain + server layers |
| A-3 | ✅ | full §9.2 table (profile×scheme×strategy) + §9.3 field rules reproduced |
| A-4 | ✅ | eligibility ordering, each code tested with every later gate deliberately also failing; independently re-verified adversarially (§7.4/Guard 4) |
| A-5a | ✅ | NC-1 server-key half, NC-9, NC-10, NC-11 unit halves |
| A-6a | ✅ | `formatScheme`'s two new render cases; `formatSetLine`'s eight lines + `m:ss` |
| A-7 | ✅ | snapshot with/without `measurement`, unknown-scheme rejection |
| A-8 | ✅ | `domain/measurement/**` boundary tests + anti-vacuity witnesses |
| A-9a | ✅ | NC-2, NC-3, NC-4 service half, NC-14 |
| A-10 | ✅ | create/update defaults, basis presence, 409 lock (+ mirror-FK backstop), basis-with-history, volume_counting default+both values |
| A-11a | ✅ | write-side gate through the API on both `load_reps` and a hand-built non-`load_reps` exercise; §9.3 rejections; cross-profile PATCH caught |
| A-12 | ✅ | bundle `measurement` per entry; nullable history DTOs; hand-built `load_distance`/`duration` prefill nulls |
| A-14 | ✅ | `load_distance` excluded; hand-built `reps` exercise default-excluded then counts on `'auto'`; `'off'` excludes `load_reps` |
| A-17 (R1 row) | ✅ | fresh seed inserts every catalog entry as `load_reps` (confirmed as a side effect of the e2e run's `db:seed` step, §9.1/§7.2) |
| A-18 | ✅ | foreign/missing exerciseId, profile-scoped creation-required fields, both new reject reasons distinguishable |
| A-19 | ✅ | NC-5, NC-12 on real PostgreSQL (twice, independently); `db:generate` no-drift |

**L-8 note (added 2026-09-07):** the shipped `tests/integration/measurementSync.integration.test.ts` also contains an A-13 block (history read/correct/delete on a `load_distance` slot, through the already-landed acceptance layer). A-13 is scoped to Release 2 by §20/§21.2 (it carries no *(R1)* tag). This is **not** Release-2 product work — it is coverage of server behaviour Release 1 genuinely ships, added as deliberate extra thoroughness — but it sat outside §21.1's named list and this table did not originally say so. Recorded here for completeness; nothing about it required removal or rescoping.

### 9.1 Negative controls (§13.5, Release-1 rows)

| Control | Status | Note |
| --- | --- | --- |
| NC-1 (R1, server keys) | ✅ | exact-equality + mutation witness |
| NC-2 | ✅ | byte-identical `load_reps` row |
| NC-3 | ✅ | dual-path (service vs. DB) rejection |
| NC-4 | ✅ | full matrix + boundary rows; **the "service check bypassed" DB-layer half's real-code-path coverage gap was found and fixed, §7.3–7.4** |
| NC-5 | ✅ | both composite FKs + profile-lock `UPDATE`, twice independently, both non-vacuous |
| NC-9 | ✅ | non-invocation proven via spy, not just absence of output; mixed-session, load_reps slot unaffected |
| NC-10 | ✅ | output-equality + row-count equality against a non-vacuous fixture (a legitimate single + a legitimate `0 kg` set) |
| NC-11 | ✅ | eligibility-before-switch and counting-before-switch, both directions |
| NC-12 | ✅ | migration idempotent, `db:generate` no-op, non-vacuous shape-CHECK control, twice independently |
| NC-13 | out of scope for R1 (its own row is R2) | not attempted, correctly |
| NC-14 | ✅ | basis-changed-applies / profile-changed-rejects / both-absent-derives-silently, with a mutation witness |

**L-9/L-10/L-11 note (added 2026-09-07):** three rows of the binding specification's own §13.5/§21.6 text were found imprecise by the independent review and corrected in place, in the specification document itself (a new §28 correction-log entry there records exactly what changed and why): §21.6's "no new queries" (L-9, one query gains a nil-cost join); NC-3's DB-layer expectation, which assumed a service-bypassed op would fail the composite FK because the row carries the column's default profile — the implementation instead writes the derived parent profile explicitly, so a bypassed pre-check fails the shape CHECK (`23514`) rather than the FK (L-10, the implementation's actual behaviour is safer than the spec assumed, and its own test already reaches the FK correctly via a different technique); and NC-9's Release tag, which named it R1 in full even though its client-side (`buildClientRecommendationOps`) clause needs a Release-2 DTO widening (L-11, correctly deferred by the implementation and now annotated in the spec the way NC-1's row already is). None of these three change any acceptance criterion, test, or code — they correct descriptive text about what the implementation actually does.

---

## 10. Hard Release-1 boundaries — verification

Every item on the task's boundary list was independently confirmed, not merely asserted:

- **No new client sync key / no client or IndexedDB DTO widening:** `git diff --stat -- src/sync src/domain/sync/setDeletionOps.ts src/domain/sync/payloadBuilders.ts` is empty, checked twice (once by the implementation's final stage, once by the orchestrator directly).
- **No athletic logging/history UI:** `git diff --stat -- src/ui/workout src/ui/history` is empty.
- **Profile/load-basis selection stays locked:** confirmed by direct code read (a `disabled` `<select>` with one option) and by the full e2e regression run producing no behavioural change to any existing exercise-form spec.
- **No new prescription-editor variants:** `EDITABLE_SCHEME_TYPES` is a local, hand-restricted constant; the widened `SCHEME_TYPES` is never imported by value into the editor.
- **No seed reconcile / catalog edits:** `src/db/seed/**` is untouched (empty diff); the e2e run's own `pnpm db:seed` step confirmed every catalog entry still inserts as `load_reps`.
- **No Release-2/3 banners, refusal UI, or behaviour:** none added; O-6's caption text and O-16's dead-letter surfacing are explicitly and correctly left untouched.
- **Existing `load_reps` behaviour byte-identical:** proven by NC-2's exact-row-equality test, the untouched pre-existing `sync.integration.test.ts` (18/18 unmodified), and the full 112/112 e2e regression.
- **The service worker:** `pnpm typecheck:sw` clean; `git diff --stat -- src/app/sw.ts` empty.

---

## 11. Documentation (§24.1)

Eight documents amended, each with the minimal, precise edit §24.1 names — no other section touched, no Release-2/3 behaviour described as already shipped:

| Document | Amendment |
| --- | --- |
| `docs/architecture/data-model.md` | §2.4/§2.13/§2.14 — the seven new columns, two dropped `NOT NULL`s, two unique pairs, two composite FKs, the shape CHECK, the "no separate enum CHECK" note, permanent defaults; also added the pre-existing, previously-missing `strength_estimate` row the evaluation's own research surfaced |
| `docs/architecture/domain-model.md` | §7/§9/§10 — the one field the "all metadata mutable" policy excludes, plus I-1/I-3/I-13/I-14 as invariants |
| `docs/architecture/volume-model.md` | §1/§2 — the Work-set definition's profile/switch clauses, the `reps` default, and the Training-card-is-a-separate-count note |
| `docs/architecture/prescription-model.md` | §2/§6 — the two scheme variants (schema-accepted R1 / editor-offered R2), the §9.2 table, §9.3's field rules, the §9.4 deload note |
| `docs/architecture/progression-engine.md` | §2/§5 — the profile precondition and the no-coercion boundary rule |
| `docs/architecture/pwa-offline-strategy.md` | §5 — the profile-scoped emission rule (server R1 / client R2), the profile-only comparison, the two new reject reasons |
| `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` | §9.6/§15.4/I-14/A-19 — the O-17 amendment applied exactly (order and enum), with an explicit disambiguation against that document's own unrelated pre-existing "O-17" label |
| `docs/architecture/adr/ADR-011-…` | D-11 marked discharged, pointing at the evaluation's §11.5–§11.6 |

`pnpm format:check` clean after the edits; `git diff --stat` confirms exactly these eight files and no others under `docs/architecture` or `docs/reviews` were touched. The bundle-size finding in §8 above (50–68 bytes, not "roughly 40") is not yet reflected in these documents' §21.6-adjacent text; a future editor of that estimate should use the measured figure.

**Corrected 2026-09-07** (`docs/reviews/athletic-measurement-profiles-release-1-remediation.md`): the independent review's L-1/L-2/L-5/L-6/L-12 findings identified five further inaccuracies introduced by this same documentation pass — the amended A-19 in the e1RM revision document stated the two new reason codes as Release-1-unreachable when the shipped test makes them deliberately reachable (L-1); that document's §15.4 phrasing ("tracking type") did not match the shipped copy ("measurement type", L-2); `progression-engine.md`'s new heading cited I-14 where its own body correctly cites I-13 (L-5); `data-model.md` §2.4 stated `load_basis` is locked alongside `measurement_profile`, which is not true (L-6); and `pwa-offline-strategy.md` §5 did not yet name two disclosed, currently-unreachable Release-2 seams (L-12). All five are fixed in place in their respective documents; see the remediation report for the exact before/after text.

---

## 12. Test-suite gate counts (final, independently re-run by the orchestrator)

**Updated 2026-09-07** after the review's L-3/L-4 code-hardening remediation added tests of its own (`docs/reviews/athletic-measurement-profiles-release-1-remediation.md`); the counts below are the final, current state, not the pre-remediation snapshot.

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm test:unit` | **986/986**, 69 files |
| `pnpm test:integration` | **431/431** passed, 16 skipped (5 opt-in real-Postgres concurrency suites, unaffected by this release), 26 files |
| `pnpm build` (production) | succeeds, 40/40 pages |
| `pnpm test:e2e` (full Playwright suite, disposable Postgres, real production build) | **112/112**, 0 failed, 0 skipped — see §7.2/§13 for the one process gap found along the way; not re-run after the L-3/L-4 remediation, which touched no client/UI/e2e-observable surface (confirmed by an empty `git diff --stat` against every e2e-relevant path) |

---

## 13. e2e regression — full detail

The verification pass's e2e agent's own final structured-output call malfunctioned (a schema-formatting glitch produced a placeholder "test"/"test" result on its fourth attempt after three well-formed but likewise malformed attempts); the orchestrator recovered the actual evidence directly from the agent's transcript rather than accepting the placeholder or re-running the suite unnecessarily. The real result: a first full run against a freshly migrated+seeded disposable database failed broadly (43/112) because the agent had run `db:migrate`+`db:seed` but not the separate, spec-required `tests/e2e/seed.ts` (which creates the fixed e2e account's program/template/active block that almost every spec depends on via `ensureNoActiveSession`) — a **test-setup gap in the verification agent itself, not a Release-1 regression**: after running `tests/e2e/seed.ts` and re-running the identical suite against the identical build and database, all 112 tests passed in 2.7 minutes across all 32 spec files, with the 14 `test:e2e:offline`-named specs fully covered inside that same run. One process-documentation finding was raised (not a code defect): `tests/e2e/seed.ts`'s requirement is only documented in two source comments, not wired into any npm script or `globalSetup` — worth a follow-up `pnpm test:e2e:seed` convenience script, out of scope for this report.

---

## 14. Judgment calls (consolidated)

Recorded here because the spec was silent or ambiguous at these exact points; every one was made in favour of the narrowest, most consistent-with-existing-precedent reading:

- **`capabilities.ts`'s predicates are purpose-named** (`isProfileEligibleForE1rm`/`ForVolume`/`ForProgression`) rather than one generic `capability(profile, loadBasis, equipment, switches)` function, because the two consumers that need distinct reason codes at distinct ordering positions (O-17) cannot be served by one boolean-collapsing function; `eligibility.ts` inlines the profile/basis checks directly rather than calling the shared helper, for the same reason, and says so in its own comment.
- **`CreateExerciseServiceInput`** is deliberately wider than the route's fully-resolved `CreateExerciseInput`, so the ~14 pre-existing test fixtures across the repo that call `createExercise` directly (bypassing the route's Zod parse, this codebase's own established test convention) keep compiling and keep getting today's exact defaults — the service applies the same resolution logic the schema's `.transform()` would have.
- **`checkPrescriptionCompatibility` gained a fourth parameter** (`fields: { targetRir?; baselineLoadKg? }`) not literally named in this task's brief, because implementing §9.3's field rules is impossible without knowing whether those fields are present in the effective (patch-merged) combination; presence is computed as `input.field !== undefined ? input.field : existing.field` (not `??`), so an explicit PATCH `null` clear is never misread as "keep the old value."
- **`classifyCreateFailure`'s ordering** (a forbidden-field-present or explicit-null-on-required always wins as `invalid_measurement` over a merely-absent required field, which only softens to `missing_required_fields` on an otherwise shape-clean row) is the one design correction that reconciles three explicit spec statements simultaneously (A-18's `missing_required_fields` case, §13.2's `invalid_measurement` rollout case, and NC-4's explicit-null cases) — a literal first reading of "profile-scoped creation-required fields" produced the wrong reason for NC-3's own scenario, caught by the test suite itself before this report was written.
- **The `?? 0`/`?? 1` sweep was explicitly widened** beyond the task's own named site list in three places (`src/server/metrics/service.ts`, `src/server/metrics/selectionService.ts`, `src/server/blocks/service.ts`) once earlier stages flagged the identical pattern as a live, unfixed I-13/H-12 landmine — each fix is defensive (currently unreachable given the §10.3 profile lock) but required by I-13's blanket rule, and each stage that found one it couldn't own itself said so explicitly rather than silently leaving it.
- **The sync catch-block test gap (§7.3–7.4)** was fixed rather than only documented, via a holder-object export (`setLogPreCheck`) rather than a direct `vi.spyOn` on a bare export, after empirically confirming the direct approach silently does not work in this codebase's test-transform setup.
- **Duration `m:ss` formatting floors to whole seconds** (not rounds), since O-8 specifies the ≥ 60 s threshold but not fractional-second display behaviour, and a clock face has no fractional-second slot.
- **`ActiveSessionSetDto` on the server** (`src/server/today/service.ts`) was widened to `number | null` to fix a real, otherwise-uncoercible typecheck error at a nullable-column mapping site — this is a distinct type from the client's own `ActiveSessionSetDto` in the untouched `src/sync/types.ts`, and was not itself widened with `distanceM`/`durationS` (not required by any error, not asked for) — flagged as a small, currently-invisible gap for whichever Release-2 stage builds the athletic active-session UI.

---

## 15. Cleanup status

Every disposable PostgreSQL container created across both workflow passes and the remediation (`mp-r1-verify-migration`, `mp-r1-verify-e2e`, `mp-r1-verify-perf`, `mp-r1-verify-negctrl`, plus Stage 2's own) was removed (`--rm` auto-cleanup or explicit `docker rm -f`), confirmed via `docker ps -a` showing only the pre-existing persistent `gym-app-db-1`. No scratch database, scratch script, or temporary directory was left inside the repository at any point — every scratch artifact lived under the session scratchpad or inside a disposable container's own throwaway database. `netstat`-checked: no stray Next.js production server process survived any e2e run. The persistent `gym-app-db-1` was never migrated, seeded, or written to by anything in this report (only ever used for one non-destructive `db:generate` schema diff, both by the implementation and, separately, by the orchestrator).

---

## 16. Explicit confirmation: Release 2 and Release 3 were not implemented

No client sync-key emission, no `ActiveSessionSetDto`/`ActiveSessionExerciseDto` widening, no distance/duration workout-card or history UI, no unlocked profile/load-basis selector, no prescription-editor scheme-variant options, no seed reconcile (`src/db/seed/reconcileMeasurementProfiles.ts` does not exist), no catalog edits, no O-6 caption change, no O-16 dead-letter surfacing UI, no new progression strategies, no derived speed/pace, no per-side logging, no e1RM Release B, and no dashboard extensions exist anywhere in this diff. Every one of these was checked by an empty or absent `git diff`/`find` result against its specific named path, not by trusting a description — see §10.

---

## 17. Verdict

Every Release-1 acceptance criterion and negative control this task named is passing, with exact counts independently re-run. The migration's generated SQL is byte-exact against the binding DDL, twice adversarially verified against real PostgreSQL with non-vacuous negative controls. Every hard Release-1 boundary is confirmed untouched by direct diff, not by description. Full regression (986 unit, 431 integration, 112 e2e, a clean production build — §12) passes. One critical test-coverage gap the adversarial audit found (the sync layer's poison-batch SQLSTATE mapping was previously unexercised by any test) has been fixed and re-verified, not merely logged. One low-severity documentation-accuracy finding (the bundle-size estimate in §21.6) and one cosmetic migration-ordering finding are recorded for whoever next edits those numbers; §8's original latency comparison used a since-corrected §21.6 statement and has itself been corrected — this release shows no performance regression (§8). Nothing was committed, pushed, or deployed; no owner decision was reopened; Release 2 and Release 3 remain unimplemented, exactly as scoped.

**Post-publication note (2026-09-07):** an independent Release-1 review (`docs/reviews/athletic-measurement-profiles-release-1-review.md`) found no BLOCKER, HIGH, or product defect above LOW, and confirmed every item above independently from its own fixtures. It found one MEDIUM (M-1, this document's original §8 performance comparison, corrected above) and twelve LOW findings, ten of them record-accuracy corrections and two optional code hardenings, all closed in `docs/reviews/athletic-measurement-profiles-release-1-remediation.md`.

**READY FOR INDEPENDENT REVIEW**
