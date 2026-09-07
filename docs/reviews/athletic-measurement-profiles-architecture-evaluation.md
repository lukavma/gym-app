# Athletic Exercise Measurement Profiles — architecture and product evaluation (PI-005)

**Date:** 2026-09-07 (revised 2026-09-07 after `docs/reviews/athletic-measurement-profiles-architecture-review.md`, correction log in §25; revised again 2026-09-07 after `docs/reviews/athletic-measurement-profiles-architecture-revision-verification.md` §6, second correction log in §26)
**Input:** `docs/input/product-ideas.md` PI-005 (lines 161–241)
**Baseline:** `main` at `05982f6` (metrics dashboard), migrations `0000`–`0012`
**Scope:** architecture only. No production code, migration, test, seed or documentation change outside this report. Nothing here is implemented.
**Settled decisions this report does not reopen:** ADR-006 (strategy registry), ADR-007 (snapshot-on-use / archive-only / current-convention volume), ADR-008 (versioned discriminated-union scheme), ADR-010 (muscle taxonomy v2), `docs/architecture/deviations.md` D-03 (arrival-order field patches), metrics dashboard O-3/O-8 (explicit selection of e1RM-compatible exercises). ADR-011 is **amended in two named clauses** by this report (§11.6; owner decision O-17 accepted 2026-09-07, option (a)); everything else in it stands.
**Owner decisions:** O-1 … O-17 were **accepted exactly as recommended on 2026-09-07** (§0.1). Every "recommended" outcome in this document is therefore binding; the §22 trade-off column is retained as rationale only.

---

## 0. Verdict

**Proceed, with a narrower model than PI-005 sketches.** "Measurement profile" is the right abstraction, but it must be a **closed enum on the exercise, frozen per session slot in typed columns, denormalised onto every set row and enforced by database constraints** — not a capability bag, not a JSON payload, and not a fourth value of `strength_estimate`. Six profiles cover every exercise class in the brief: `load_reps`, `reps`, `load_distance`, `distance_time`, `duration`, `load_duration` (the last is optional for v1, O-1). Load conventions (total / per hand / assistance / unspecified) are a second, orthogonal closed enum (`load_basis`) that exists only on profiles with a load field. Every automated consumer (progression strategies, Estimated 1RM, muscle volume, dashboard selection) derives its eligibility **structurally** from `(profile, load_basis, equipment)`; user switches can never enable an incompatible consumer. Existing data maps to `load_reps` / `unspecified` with no value changed and no reinterpretation.

Two composite foreign keys give the database, not the service layer, the last word: a set row's profile always equals its slot's, and a slot's frozen profile always equals its exercise's at the time the slot was written — which also makes the slot freeze and the exercise-profile lock database guarantees rather than conventions.

The smallest safe first release is a **dark foundation**: migration `0013`, the domain module, the definition-world fields locked to `load_reps`, the read-side gates, the prescription write-side gate, and — O-7 option (b), accepted — the *acceptance* side of every contract widening (the sync payload schemas, the two new scheme variants in `setSchemeSchema`, the snapshot's `measurement` key) while the client still emits today's shapes and the editor offers nothing new. Logging UI, client emission of the new fields, the seed reconcile and the prescription-editor variants follow in Release 2; the seeded athletic catalog in Release 3. Distance/time progression, rep-progression for the `reps` profile, personal records and new metrics are explicitly deferred.

The pass discharges ADR-011's **D-11**: `strength_estimate` survives, narrowed to a disable-only override layered on the structural gate; it does **not** absorb profile values.

### 0.1 Owner-decision addendum (2026-09-07)

The owner accepted every decision in §22 **exactly as recommended**, after the second targeted verification returned `VERIFIED — READY FOR OWNER DECISIONS`. The accepted outcomes below are **binding for implementation**; the §22 table keeps the alternatives and trade-offs as rationale. Where this document previously said "recommended", "proposed", "if O-nn" or "unless O-nn", the accepted outcome now applies unconditionally; the integration record is `docs/reviews/athletic-measurement-profiles-owner-decision-integration.md`.

| Id | Accepted outcome (binding) | Where it binds |
| --- | --- | --- |
| O-1 | `load_duration` is in the v1 vocabulary; six profiles | §5.3, §6.2, §8.3, §9.2 |
| O-2 | `load_basis` ships in Release 1 (columns on `exercises` and `session_exercises`) | §7.1, §8.1, §8.2, §21.1 |
| O-3 | `measurement_profile` is locked once any slot or prescription references the exercise; create a new exercise to change it | §10.3, I-3 |
| O-4(i) | `exercises.volume_counting text NOT NULL DEFAULT 'auto' CHECK IN ('auto','off')` exists in v1 | §8.1, §11.4 |
| O-4(ii) | Creation default of `volume_counting` is `'off'` for the `reps` profile and `'auto'` for `load_reps` | §11.4, NC-11, A-14 |
| O-5 | The seeded-exercise reconcile runs in the **Release-2 seed step** (unreferenced Plank → `duration`, unreferenced Farmer's Carry → `load_distance`/`per_hand`, referenced carry → `volume_counting = 'off'`, assisted pull-up → `assistance`), with its disclosed deploy window | §14.3, §14.4, §21.2, R-9 |
| O-6 | The Metrics Training card counts every non-warm-up attempt of every profile; caption becomes `Completed workouts only. Warm-up sets not counted. Every exercise type counts as a set.` | §11.2, A-16, §24 |
| O-7 | Release 1 is option **(b)**: migration, domain module, definition-world fields locked to `load_reps`, read-side and write-side gates, and acceptance-side widening of every shared contract — **no client emission, no new UI** | §21.1, §14.5, NC-13 |
| O-8 | Duration is entered in seconds (decimals allowed); values ≥ 60 s additionally display as `m:ss`; storage is always seconds | §15.3, §15.5 |
| O-9 | No derived speed or pace is displayed in v1 | §6.2, §15.4, N-4 |
| O-10(i) | The ten Release-3 slugs and measurement shapes in §16 are adopted | §16, §21.3 |
| O-10(ii) | Their muscle contributions are **not** approved here; a Release-3 authored-list gate approves them before seeding | §16, §21.3 |
| O-11 | Optional RIR is allowed on the `reps` profile | §5.3, §6.2 |
| O-12 | One set row per set for bilateral and unilateral exercises alike; no per-side field; convention stated in copy | §7.2, N-11 |
| O-13 | Set payloads are **profile-scoped full rows**: profile-independent keys plus every key the frozen profile permits; forbidden keys omitted | §12.3, I-7, NC-1, §14.5 |
| O-14 | The mirror composite FK `session_exercises (exercise_id, measurement_profile) → exercises (id, measurement_profile)` is added in migration `0013` | §8.1, §8.2, I-3, NC-5 |
| O-15 | `weightKg` wire precision is **unchanged** in v1 (no `multipleOf`); the two new fields carry `multipleOf(0.01)` with input guards | §6.1, §12.2, §15.3, A-2 |
| O-16 | The active-session blocked/banner/completion-confirm mechanism is extended to refused `setLog` and `sessionExercise` operations of the active session | §13.4, §15.3, A-23, A-25 |
| O-17 | Option **(a)**: `MEASUREMENT_PROFILE_UNSUPPORTED` and `LOAD_BASIS_UNSUPPORTED` join the closed strength reason-code enum, and the tracker's refusal order becomes **profile → load basis → equipment → switch**; the e1RM revision's §9.6 and §15.4 / I-14 / A-19 are amended accordingly, effective with the Release-1 commit that changes `eligibility.ts` and `reasonCodes.ts` (§24) | §11.3, §11.6, A-4, A-15, §24 |

---

## 1. Method

Inspected: every table in `src/db/schema/*`, migrations `drizzle/0000`–`0012`, the domain modules under `src/domain/{exercises,prescriptions,schemas,schemes,progression,strength,volume,metrics,sync,warmup}`, the server services for exercises, prescriptions, templates, today, sync, history, progression, strength, volume, metrics and warm-up routines, the client sync stack `src/sync/*`, the service worker `src/app/sw.ts`, the workout / prescription / exercise / history / strength / metrics UI, the seed catalog and reconcile scripts, ESLint boundaries, the three test tiers, `.github/workflows/deploy.yml`, and the ADRs, architecture documents and review lineage cited below. Three read-only research passes produced the sync, consumer and UI traces; every claim below was re-checked against the file and line it cites. The independent review additionally probed §8's DDL on the local Docker PostgreSQL 16 instance; its fixture results are incorporated where they changed the design. Line numbers are as of `05982f6`.

"Current" means observed in the repository today. "Proposed" means this report's design. The two are kept in separate sections.

---

## 2. Repository inventory and dependency map (current)

### 2.1 Facts and definitions

| Table (schema file) | Columns that assume `load + reps + RIR` | Integrity today |
| --- | --- | --- |
| `exercises` (`src/db/schema/exercises.ts:29-72`) | `equipment` (6 values, `:60`), `mechanics`, `laterality` `bilateral|unilateral` (`:40,62-65`), `load_step_kg numeric(4,2) > 0` (`:41,66`), `strength_estimate text in ('auto','off')` (`:47,67-70`) | partial unique active name; RESTRICT from prescriptions, session_exercises, recommendations |
| `exercise_prescriptions` (`src/db/schema/exercisePrescriptions.ts:32-59`) | `scheme jsonb` = `{v:1, scheme: fixed|repRange}` (`src/domain/schemes/setScheme.ts:6,53-60`), `target_rir jsonb`, `baseline_load_kg numeric(6,2) >= 0`, `progression jsonb` | deferrable unique position (hand-appended SQL, `:20-31`) |
| `session_exercises` (`src/db/schema/sessionExercises.ts:27-51`) | `prescription jsonb` = PrescriptionSnapshot v1, **null for ad-hoc** (`:17-21`); no measurement metadata at all; `exercise_id` is a plain RESTRICT FK (`:34-36`) | RESTRICT to exercise; CASCADE from session |
| `set_logs` (`src/db/schema/setLogs.ts:27-52`) | `weight_kg numeric(6,2) NOT NULL >= 0` (`:36,48`; `data-model.md` §2.14 "0 = bodyweight-only"), `reps smallint NOT NULL 1..100` (`:37,49`), `rir 0..10 null` (`:38,50`), `is_warmup`, `set_number` | `uq_set_number` deferrable; a rep-less row is **unrepresentable** |
| `recommendations` (`src/db/schema/recommendations.ts:32-100`) | `target jsonb` = `{loadKg?, reps?}` strict (`src/domain/schemas/recommendation.ts:37-43`), `inputs.workSets[]` = `{weightKg: number >= 0, reps: int >= 1, rir}` strict, neither nullable (`:45-51`), `action in (increase_load, decrease_load, hold, increase_reps, none)` (`:87`); reason codes closed by `reasonCodeSchema = z.enum(REASON_CODES)` (`src/domain/progression/reasonCodes.ts:6-26`) | — |
| `dashboard_estimate_selections` (`src/db/schema/dashboardEstimateSelections.ts`) | rows allowed only for e1RM-compatible exercises via `isSelectionEligible` (`src/domain/metrics/selection.ts:37-41`) | CASCADE on exercise hard delete |

`docs/architecture/data-model.md` §2.4 does not list `strength_estimate`; the column exists only in `src/db/schema/exercises.ts:47` and `drizzle/0011_happy_celestials.sql`. §24 lists this alongside the amendments this design itself requires.

### 2.2 Snapshot shape (current)

`PrescriptionSnapshot` v1 (`src/domain/schemas/prescriptionSnapshot.ts:13-48`): `{ v: 1, snapshot: { exerciseId, exerciseName, scheme, targetRir, restSeconds, progression{strategyId, strategyVersion, config, classification}, appliedModifiers, prefill{ loadKg: number|null, reps: int|null } } }`. `prescriptionSnapshotDataSchema` is a plain `z.object` (not `.strict()`), so **unknown keys are stripped, not rejected**. Built by `buildPrescriptionSnapshotData` (`src/domain/prescriptions/buildSnapshot.ts:34-71`); written on insert only (`src/server/sync/service.ts:548-553,637`).

### 2.3 Consumers of a set row (current)

| Consumer | Reads | Warm-up handling | What breaks on a non-rep set |
| --- | --- | --- | --- |
| Progression engine (`src/domain/progression/engine.ts:19-23` `PerformedSet{weightKg,reps,rir}`) | `getWorkSetsByExercise` (`src/server/progression/service.ts:117-131`) maps rows to `PerformedSet` **before** `evaluateSession` runs, for the evaluated session and the `getEngineHistory` window (`:141-188`); `is_warmup = false` in SQL, ordered by set number | SQL | `modalWorkingLoad` (`loadHelpers.ts:27-42`), shortfall / `completed` (`loadProgression.ts:28-41`, `repProgression.ts:72`) assume numeric load and reps; only `supportsScheme` (`registry.ts:70-72`, `evaluateSession.ts:114-118`) and `manual` (`evaluateSession.ts:110`) stop evaluation; `unsupportedSchemeDraft` (`evaluateSession.ts:69-93`) still embeds `inputs.workSets` |
| Carry-forward / prefill | `firstWorkSet.weightKg` (`src/server/today/service.ts:275-283`), `resolveWorkingTargets` (`workingTargets.ts:33-45`), `schemeDefaultReps` (`:29-31`, two-member switch) | domain | needs numeric `weightKg`; `schemeDefaultReps` does not compile against a wider union |
| Implicit first-set decision | `firstWorkSet.weightKg === roundToStepKg(target.loadKg)` (`implicitDecision.ts:33-44`) | domain | load-only comparison |
| Client-side offline evaluation | `buildClientRecommendationOps` reads `{weightKg,reps,rir}` (`src/sync/activeSession.ts:663,678`) | domain | shares `evaluateSession` with the server; maps sets itself |
| Muscle volume | `WorkSetContributionRow{setId, isWarmup, muscleGroupId, role, weight}` (`src/domain/volume/aggregate.ts:24-35,170-175`); `queryWorkSetContributionRows` has **no per-exercise exclusion** (`src/server/volume/service.ts:177-215`) | domain | nothing breaks; every set counts — Plank and Farmer's Carry already count today |
| e1RM tracker | `StrengthSetInput{setNumber,isWarmup,weightKg,reps,rir}` (`src/domain/strength/types.ts:26-32`), coalesced `weightKg ?? 0` at `src/server/strength/service.ts:190-194`; `evaluateExerciseEligibility` (`eligibility.ts:29-37`, equipment then switch, "category code wins") then `classifySet` (`:69-78`) | domain | `weightKg <= 0` → `zeroLoad`; series keyed on `exercises.id` |
| Metrics dashboard | Training card counts non-warm-up sets (`src/domain/metrics/training.ts:41-44`); estimates card reuses the tracker (`estimateIndex.ts:48-56`); volume card reuses volume | domain | as above |
| History | `HistorySetDetail{id,setNumber,isWarmup,weightKg,reps,rir,loggedAt,notes}` (`src/server/history/service.ts:34-43,172-193`); rendered `"{weightKg} kg × {reps}"` (`src/ui/history/HistoryDetail.tsx:255-261`) | — | fabricated line |
| Today bundle | `HistorySetDto{setNumber,weightKg,reps,rir,isWarmup}` (`src/server/today/service.ts:51-57`); previous performance = last 3 non-deload completed sessions (`:546-551`) | — | fabricated line |
| Workout card | `validateSetInput` requires `reps >= 1` and checks range only (`src/ui/workout/ExerciseCard.tsx:26-40`); `parseDecimalInput` accepts any finite float (`src/ui/decimalInput.ts:17-22`); prefill `{loadKg, reps}` (`:60-84`); set line `:423-429` | — | cannot log without reps |

### 2.4 Sync stack (current)

- Wire: `setLogUpsertPayloadSchema` (`src/domain/sync/schema.ts:99-112`) — `.strict()`, `weightKg` has **no** `multipleOf` (`:105`), `weightKg`/`reps` optional-but-not-nullable, `rir` nullable; delete `{id}` (`:114`). No `.passthrough()` anywhere in the file. Envelope `payload: z.record(z.string(), z.unknown())` (`:43-48`).
- Client emitters: `setLogFullRowOp` enumerates nine keys (`src/sync/activeSession.ts:215-232`) and is used by both `logSet` and `editSet` (`:570-579` — `EditSetPatch` mutates the local set, then a full row goes on the wire); `HistorySetCorrectionPatch` (`src/sync/corrections.ts:6-12`) is the **only partial set op** and bypasses the builder (`:30`); renumber upserts enumerate fields in `buildSetDeletionOps` (`src/domain/sync/setDeletionOps.ts:17-24,77-87`); `workoutSessionFullRowOp` (`activeSession.ts:145-172`) and `sessionExerciseFullRowOp` (`:175-190`) are the other two full-row builders.
- Server replay (`src/server/sync/service.ts`): one transaction per op in arrival order (`:28-42`) and an unexpected error fails the whole request (`:36-42`); `SET_LOG_FIELDS` hard-coded (`:168-177`); `computeSupersession` (`:196-241`) + `canExcuseViaSupersession` (`:250-261`) — called for `workoutSession` (`:397`) and `sessionExercise` (`:582`) only, **never for `setLog`**; `applySetLogUpsert` uses `laterDelete` (V-1) and `writable` (V-2) instead (`:722-896`); create requires `sessionExerciseId, setNumber, weightKg, reps, loggedAt` all `!== undefined` (`:767-775`); insert `onConflictDoNothing` (`:810`); `applySessionExerciseUpsert` (`:568-690`) never reads `exercises` and never checks caller ownership of `exerciseId` — only the FK constrains it; only `23505`/`23503` are mapped (`:887-894`) — `23514` (check violation) and `22003` (numeric overflow) escape as unexpected errors.
- Local: IndexedDB `DB_VERSION = 2` (`src/sync/db.ts:18-19`), schemaless stores (`src/sync/types.ts:174`), `ActiveSessionSetDto` (`:104-113`), tolerance rule for bundle fields (`:218-227`), `bundleCache` without version or TTL (`src/sync/bundleCache.ts`), SW caches `/api/today-bundle` 24 h NetworkFirst (`src/app/sw.ts:253-269`) and every other API GET `NetworkOnly` (`:278-286`), `skipWaiting: false` (`:335-341`). `refreshSessionBlocked` raises `sessionBlocked` only for `workoutSession` dead letters (`src/sync/activeSessionStore.ts:141-152`); a `setLog` dead letter shows only on the sync-issues screen. **No bundle version, no client-version header, no stale-client rejection exists.**
- Deploy: `.github/workflows/deploy.yml` runs `db:migrate` (`:106`), then `db:seed` (`:109`), then the App Service deploy (`:121`) — the seed step executes while the **previous build is still serving**.

### 2.5 Definitions and seeding (current)

- `createExerciseSchema` ends in `.transform()` and strips unknown keys (`src/domain/exercises/schema.ts:143-162`); `updateExerciseSchema` is `.strict()` (`:170-192`); `updateExercise` patches `equipment`, `loadStepKg`, `strengthEstimate` with **no history guard** (`src/server/exercises/service.ts:234-241`); hard delete relies on FK `23503` → `ExerciseReferencedError` (`:317-329`).
- Seed: `slugToUuid` SHA-1 ids (`src/db/seed/exercises.ts:20-27`), ledger insert-if-absent (`:46-51,55-149`), catalog item shape `{slug,name,equipment,mechanics,laterality?,strengthEstimate?,contributions}` (`src/db/seed/exerciseCatalog.ts:14-32`), state-predicated reconcile (`src/db/seed/reconcileStrengthEstimates.ts:37-48,85-89`). Athletic-adjacent entries: `bodyweight-plank` (`:451-454`, `strength_estimate` left `'auto'`, excluded only by the equipment gate), `dumbbell-farmers-carry` (`:635-641`, `'off'`), `machine-assisted-pull-up` (`:878-886`, `'off'`). No sled, sprint, throw or jump entries.
- ESLint boundaries (`eslint.config.mjs:36-53`): `domain → domain` only; `ui → domain, ui, sync`; `server → domain, db, server`; `boundaries/elements` matches `src/domain`, so a new `src/domain/measurement` directory needs no ESLint change.
- No export surface exists (no route under `src/app/api` serialises history for download); PI-005's mention of exports is a no-op for this repository.

### 2.6 Tests (current)

Unit (`vitest.config.ts`, 63 files) — pure logic. Integration (`vitest.integration.config.ts:3-6`, 33 files) — **PGlite, not server PostgreSQL**; five `*Concurrency.integration.test.ts` suites opt into Docker PostgreSQL through `*_CONCURRENCY_DATABASE_URL` (e.g. `tests/integration/recoveryConcurrency.integration.test.ts:39`). E2E (`playwright.config.ts:29-31`) — Desktop Chrome, with per-spec 390×844 and 320×568 viewports (`tests/e2e/metrics.spec.ts:88,117`); three specs (`offline-set-edit-delete`, `reconnect-batch-idempotence`, `transient-failure-fifo`) address the set row's inputs by index. Sync-resilience specs are enumerated in §13.5.

---

## 3. Lifecycle trace (current)

1. **Definition.** `POST /api/exercises` → `createExercise` (`src/server/exercises/service.ts:179-218`); `strength_estimate` takes the column default. Metadata is mutable at any time (`domain-model.md` §9); only identity and `is_seeded` are fixed.
2. **Prescription.** `POST /api/templates/[id]/prescriptions` → `checkPrescriptionCompatibility` (`src/domain/prescriptions/schema.ts:70-84`) → `resolveProgression` (`registry.ts:130-144`) → row with `{v:1, scheme}`, `baseline_load_kg`, `progression`.
3. **Template.** Templates hold no set data; archive only, no DELETE route (`src/app/api/templates/[id]/route.ts`).
4. **Bundle.** `getTodayBundle` assembles `TodayBundleExerciseEntry` (`src/server/today/service.ts:71-95`) with scheme, prefill, `loadStepKg`, `previousPerformance`, `history`, `pendingRecommendation`; cached in IndexedDB and the SW. `/api/exercises` and `/api/history` are never cached.
5. **Snapshot.** `startSession` (`src/sync/activeSession.ts:252-316`) freezes each entry through `sessionExerciseFullRowOp` (`:173`); ad-hoc add sends `prescription: null` (`:377`). The server writes the snapshot on insert only (`sync/service.ts:637`).
6. **Set log.** `logSet` (`:440-499`) → `setLogFullRowOp` → outbox + aggregate in one IndexedDB transaction (`src/sync/db.ts:181-197`) → `flushOutbox` batches of 50 (`src/sync/flush.ts:11`) → `applySetLogUpsert` (`sync/service.ts:722-896`).
7. **Correction.** `correctHistorySet` partial op (`src/sync/corrections.ts:21-33`); server `writable` merge; `setLogUpdateChangesEvaluationInputs` (`:702-713`) decides re-evaluation.
8. **Deletion.** `buildSetDeletionOps` → delete + ascending full-row renumber upserts (`setNumbering.ts:42-63`, `setDeletionOps.ts:50-92`).
9. **Progression.** `evaluateCompletedSession` inside the completion transaction (`sync/service.ts:512-521`); offline, `buildClientRecommendationOps` computes the same drafts (`activeSession.ts:633-724`).
10. **Volume, e1RM, Metrics, History.** Read-only derivations per §2.3.
11. **Exercise deletion.** RESTRICT with history (`domain-model.md` §10 invariant 4); CASCADE to contributions and dashboard selections when history is absent.

---

## 4. Invariants and compatibility hazards this design must respect

| Id | Source | Rule |
| --- | --- | --- |
| H-1 | ADR-007 decision 1; `domain-model.md` §10 inv. 2–3 | Snapshots written exactly once; completed sessions' structure immutable, values editable, never re-snapshotted |
| H-2 | ADR-007 decision 2; inv. 4 | Exercises with history are archive-only; history references `exercise_id` live; repurposing forbidden by convention |
| H-3 | ADR-007 decision 3 | Muscle volume is a current-convention interpretation of immutable set logs, recomputed for all time |
| H-4 | ADR-008 | Schemes are a closed discriminated union, pure data, additive variants, `{v, scheme}` envelope; strategies declare compatibility; the editor offers only valid pairs |
| H-5 | ADR-006; `prescriptionSnapshot.ts:54-63` | Any strategy behaviour change bumps its version |
| H-6 | ADR-011 structural rules; revision §14.4 | `recommendations`, `PrescriptionSnapshot` (`v` = 1), sync schema, outbox vocabulary and progression behaviour unchanged by e1RM; `strength_estimate` and PI-005 "must not accumulate overlapping metadata" (D-11) |
| H-7 | `mvp-v1-remediation-verification-2.md` §6.1 (W-1, open) | The `workoutSession` / `sessionExercise` supersession gate requires full field subsumption; "adding a field … or introducing one builder that omits a field, silently re-opens MEDIUM-1 with no test covering the difference". W-1 does **not** govern `setLog`, which never reaches `canExcuseViaSupersession` |
| H-8 | same, §6.2 (W-2) | `laterDelete` short-circuits validation in the absent-row branch; only `invalid_payload` still rejects |
| H-9 | `deviations.md` D-03 | Arrival-order conditional field patches; absent = do not write, null = clear; no client timestamp; never partially introduce LWW |
| H-10 | `src/sync/types.ts:218-227`; warm-up evaluation R-1 | New bundle fields must be optional on the client; cached pre-upgrade bundles keep being served (Phase 5 L-4 precedent) |
| H-11 | `setNumbering.ts:20-38` | Renumbering relies on per-op transactions and ascending order, not on the deferrable constraint |
| H-12 | `data-model.md` §2.14; `eligibility.ts:54-56` | `weight_kg = 0` is legal data meaning "bodyweight-only"; no existing row's meaning may change; **a null load is never coerced to 0** |
| H-13 | Metrics I-2 (`tests/unit/metricsBoundary.test.ts:316-321` column patterns) | No persisted derivation; `distance_m`, `duration_s`, `measurement_profile`, `load_basis`, `volume_counting` match none of the patterns |
| H-14 | Metrics I-13, O-3 | The selection is presentation only; an already-stored row is retained even if the exercise later becomes ineligible |
| H-15 | revision §14.5; `progressionBoundary`, `strengthBoundary`, `metricsBoundary` tests | Import-graph boundaries between `domain/strength`, `domain/progression`, `domain/metrics`; a new shared module must be importable by all three without a forbidden edge |
| H-16 | e1RM revision owner addendum (§9.6 ordered refusal list, §15.4 reason-code enum, I-14) | The tracker's refusal order and its closed reason-code enum are binding; extending or reordering them requires an explicit amendment (§11.6) |
| H-17 | `src/server/sync/service.ts:36-42`, `src/sync/flush.ts:115-123` | Any SQLSTATE the replay does not map fails the whole request; the client retains the batch and retries forever — a poison batch |

---

## 5. Domain vocabulary (proposed)

### 5.1 Is "measurement profile" the right abstraction?

Yes, with one qualification: the profile must describe **only the recorded shape of one attempt** — which fields a set row carries — and nothing else. PI-005 correctly separates it from movement intent (`power`, `explosive`) and from downstream capabilities. This report keeps three concepts apart:

| Concept | Where it lives | Mutable? | Snapshotted? |
| --- | --- | --- | --- |
| **Measurement profile** — the closed shape of a logged attempt | `exercises.measurement_profile`; frozen into `session_exercises.measurement_profile`; denormalised onto `set_logs.measurement_profile` | only while the exercise is unreferenced (§10.3) — enforced by the database for slots, by the service for prescriptions | yes, typed columns |
| **Load basis** — what the kg number means when a load exists | `exercises.load_basis`; frozen into `session_exercises.load_basis` | yes, with UI notice (a gate, not a reinterpretation) | yes |
| **Intent** — power, hypertrophy, conditioning | not modelled in v1; `movement_pattern` (free slug) stays the only intent-adjacent field | — | — |
| **Capabilities** — e1RM, progression, volume, PR | derived functions of `(profile, load_basis, equipment)` plus per-exercise switches that can never enable an incompatible consumer (§11) | switches yes | switches no (planning world) |

### 5.2 Representation comparison

| Option | Assessment | Verdict |
| --- | --- | --- |
| **A. Closed enum on the exercise + typed nullable columns on `set_logs` + per-profile CHECK** | One value per exercise; every UI, engine and query branches on a finite set; the database proves each row's field set; SQL-queryable; extension = new enum value + new CHECK branch + migration. Matches the house pattern (`equipment`, `laterality`, `strength_estimate` are text enums with `checkInList` CHECKs). | **Selected** |
| B. Constrained dimension/capability model (`has_load`, `has_reps`, `has_distance`, `has_duration`) | 16 combinations, most meaningless; required-vs-optional still needs a second rule table; UI and engines still enumerate the valid combinations, i.e. the enum again with weaker integrity. Useful only as a **derived** function of the profile (§6.4). | Rejected as storage |
| C. Typed relational columns without a discriminator (infer the shape from nulls) | A row with `weight_kg` and `distance_m` is ambiguous; nothing stops a carry from acquiring reps; nothing to freeze; consumers cannot fail closed on a shape they cannot name. | Rejected |
| D. Versioned JSON payload on `set_logs` (`measurement jsonb {v, kind, …}`) | Loses CHECKs, numeric precision, indexability and plain SQL; every consumer parses JSON per row; `set_logs` is the one fact table with no JSONB, on purpose. JSONB stays where ADR-008 put it: prescriptions and snapshots. | Rejected for facts |
| E. Unrestricted JSON bag / arbitrary field combinations | Excluded by PI-005 and by ADR-008's anti-DSL line. | Rejected |

### 5.3 The closed vocabulary

PI-005's candidate names are not adopted as written. `strength_reps` names an intent, and the same shape records a med-ball slam where no strength claim exists; `reps_only` and `timed_distance` mix naming styles. Profiles are named purely by the dimensions they require, joined by `_`:

| Profile | Required | Optional | Exercise classes from the task |
| --- | --- | --- | --- |
| `load_reps` | load, reps | RIR | conventional barbell/dumbbell/machine/cable; bodyweight and assisted (through `load_basis`); implement load + reps where e1RM is inappropriate (med-ball slam/throw — a *capability* difference, not a shape difference) |
| `reps` | reps | RIR (O-11, accepted) | jumps, plyometrics, reps-only bodyweight drills where load is never recorded |
| `load_distance` | load, distance | duration | sled push/pull/drag, farmer / suitcase carry |
| `distance_time` | distance, duration | — | sprint, shuttle run |
| `duration` | duration | — | plank and other isometrics, unloaded holds |
| `load_duration` | load, duration | — | weighted plank, loaded hold (O-1, accepted) |

**Recording conventions.** For `distance_time` and `load_distance`, `distance_m` is the **total metres covered in the round** — a 5 × 10 m shuttle is one round of 50 m, not five rounds; the scheme's `distanceM` target follows the same convention.

**Shapes deliberately without a profile in v1** (each would be an additive profile later, none is designed here): reps inside a fixed time window (max push-ups in 60 s — log as `reps` with the window in the prescription notes, or as `duration`; neither records both facts); a loaded sprint (weighted-vest shuttle — log as `distance_time`, the load is not recorded); jump height or throw distance (`reps` records the attempts only); `power_reps` or any intent-named profile.

---

## 6. Profile / field compatibility matrix (proposed)

### 6.1 Fields, units, precision, bounds

| Field | Column | Unit | Type / precision | Bounds (storage = wire) | Zero | Null |
| --- | --- | --- | --- | --- | --- | --- |
| load | `weight_kg` (existing) | kg | `numeric(6,2)`; wire `min(0).max(9999.99)`; **no `multipleOf` on the wire in v1** (O-15, accepted: the column keeps rounding a third decimal silently exactly as today; a later tightening must ship with its input guard) | `>= 0`, `<= 9999.99` | legal (bodyweight-only, empty sled) | forbidden where required; **must be null** where forbidden |
| reps | `reps` (existing) | count | `smallint` | `1..100` | forbidden (existing CHECK) | forbidden where required; must be null where forbidden |
| RIR | `rir` (existing) | count | `smallint` | `0..10` | legal | optional on `load_reps` / `reps`; must be null on the other four |
| distance | `distance_m` (new) | metres | `numeric(7,2)`; wire `.gt(0).max(99999.99).multipleOf(0.01)` | `> 0 and <= 99999.99` — the column's exact storage ceiling | forbidden (a zero-distance round is not an attempt) | required on `load_distance`, `distance_time`; must be null elsewhere |
| duration | `duration_s` (new) | seconds | `numeric(7,2)`; wire `.gt(0).max(86400).multipleOf(0.01)` | `> 0 and <= 86400` (fits `numeric(7,2)`, whose ceiling is 99999.99) | forbidden | required on `distance_time`, `duration`, `load_duration`; optional on `load_distance`; must be null on `load_reps`, `reps` |

Every wire ceiling is **provably at or below the column's storage ceiling** — the house convention `weight_kg numeric(6,2)` / wire `9999.99` is followed exactly: `numeric(7,2)` stores at most `99999.99`, so a `100000` bound would be unreachable and the boundary value would raise SQLSTATE `22003` (numeric field overflow), not a CHECK violation. Rounding is covered by the same equality: a value that would round *up* into overflow (`99999.995`, `9999.995`) already exceeds the wire `.max` and is refused by Zod; nonetheless `22003` is mapped (§12.2, I-8) so that no numeric edge reached below the Zod layer can ever fail a batch. `numeric(7,2)` gives 0.01 m and 0.01 s, enough for a hand-timed sprint and a tape-measured carry without false precision; the two new inputs get a `decimalPlaceCount <= 2` guard at the input (`src/ui/decimalInput.ts:30-34` already exists) in the same release as their wire `multipleOf(0.01)`, so a three-decimal entry is refused at the keyboard, never at the wire. Units are metric only in v1; no unit column, no conversion (N-8). "Forbidden means null" because a consumer that does not know the profile must still be able to read the row unambiguously; a non-null in a forbidden column is an integrity violation, not extra information.

### 6.2 The matrix

`R` required, `O` optional, `–` must be null.

| Profile | `weight_kg` | `reps` | `rir` | `distance_m` | `duration_s` | Derived, never stored |
| --- | --- | --- | --- | --- | --- | --- |
| `load_reps` | R | R | O | – | – | e1RM when eligible, RTF |
| `reps` | – | R | O | – | – | — |
| `load_distance` | R | – | – | R | O | speed is derivable when duration is present; **not displayed in v1** (O-9, accepted) |
| `distance_time` | – | – | – | R | R | speed is derivable; **not displayed in v1** (O-9, accepted) |
| `duration` | – | – | – | – | R | — |
| `load_duration` | R | – | – | – | R | — |

`is_warmup`, `set_number`, `logged_at`, `notes` are profile-independent and unchanged.

### 6.3 Existing data under the matrix

Every existing `set_logs` row has non-null `weight_kg` and `reps` and (after migration) null `distance_m`/`duration_s`, so every row satisfies the `load_reps` branch without any value change. This is what makes §14 non-reinterpreting.

### 6.4 Derived dimension set

A pure function `dimensionsOf(profile): { load: 'required'|'forbidden', reps: …, rir: 'optional'|'forbidden', distance: …, duration: 'required'|'optional'|'forbidden' }` in `src/domain/measurement/profile.ts` is the single source for the UI renderer, the Zod refinement, the server validation, the client emitter's permitted-key set (§12.3) and the generated CHECK text (built the way `checkInList` is). Option B's idea survives here, as a derivation.

---

## 7. Load basis, assisted and unilateral semantics (proposed)

### 7.1 `load_basis`

Applies only to profiles with a load field (`load_reps`, `load_distance`, `load_duration`). Closed vocabulary:

| Value | Meaning of `weight_kg` | Display | e1RM |
| --- | --- | --- | --- |
| `total` | total external load (barbell, machine stack, cable stack, sled load, trap bar); `0` = none | `kg` | eligible, subject to equipment and switch |
| `per_hand` | load per implement, both hands loaded (dumbbell pair, farmer's carry); `0` = none | `kg/hand` | eligible "as logged", exactly as dumbbell loads are treated by the tracker today; the only equipment-specific adjustment in the strength module is `SUGGESTION_NOISIER_EQUIPMENT` (`src/domain/strength/constants.ts:143`), which lowers **Release B suggestion confidence** only and states "the tracker takes no penalty" |
| `assistance` | assistance applied; larger = easier (assisted pull-up / dip machine, band) | `kg assist` | **structurally ineligible** |
| `unspecified` | as entered; convention not recorded (every migrated row, and any exercise the athlete has not classified) | `kg` (today's label) | eligible exactly as today |

Rules: **no arithmetic is ever applied to `weight_kg` because of `load_basis`** in v1 — no doubling of per-hand loads, no bodyweight addition, no sign inversion. It is a label and a gate. Bodyweight-inclusive estimation remains ADR-011 D-3; this column is the `load_semantics` hook D-3 names, so D-3 needs no further schema. `unspecified` is deliberately permanent: a retroactive guess would be inference from equipment, which PI-005 forbids and which is genuinely ambiguous (`dumbbell` covers a goblet squat and a pair of rows; `machine` covers stack machines and the assisted pull-up; the current copy already concedes "per hand, per stack, as entered", `src/ui/strength/copy.ts:135`).

### 7.2 Unilateral / per-side

`exercises.laterality` stays and is not extended. Convention, stated in copy: for a unilateral exercise one set row records **one side's reps / distance / duration with both sides performed**; one row per set, not per side. Suitcase carries follow the same convention. A `side` column on `set_logs` is rejected for v1: it doubles set counts for volume, changes `set_number` semantics and needs a decision on whether asymmetries are facts (N-11). **O-12 accepted:** one row per set for bilateral and unilateral exercises alike, no per-side field, convention stated in copy.

### 7.3 Bodyweight and assisted exercises under the model

- A push-up logged today as `0 kg × 12` stays `load_reps` / `unspecified` (or `total` once classified). Weighted variants keep recording added load. Meaning unchanged (H-12).
- Assisted pull-up: `load_reps` / `assistance`; the seeded row is reconciled to `assistance` in Release 2 (§14.3); its `strength_estimate = 'off'` becomes redundant and is left in place. Its rendered refusal changes from `EXERCISE_ESTIMATE_DISABLED` to `LOAD_BASIS_UNSUPPORTED` at that point (§11.6, A-15).
- A jumps exercise without a load input: `reps`.

---

## 8. Schema and integrity (proposed, exact)

All changes are additive, in one generated migration `0013` with hand-appended statements where drizzle-kit cannot express them (precedent: `exercisePrescriptions.ts:20-31`). Column defaults are kept **permanently** for rollback safety (§14.5); the application always writes the columns explicitly.

### 8.1 `exercises`

```sql
ALTER TABLE exercises ADD COLUMN measurement_profile text NOT NULL DEFAULT 'load_reps';
ALTER TABLE exercises ADD COLUMN load_basis text DEFAULT 'unspecified';
ALTER TABLE exercises ADD COLUMN volume_counting text NOT NULL DEFAULT 'auto';          -- O-4(i)
ALTER TABLE exercises ADD CONSTRAINT ck_exercises_measurement_profile
  CHECK (measurement_profile IN ('load_reps','reps','load_distance','distance_time','duration','load_duration'));
ALTER TABLE exercises ADD CONSTRAINT ck_exercises_load_basis
  CHECK (load_basis IS NULL OR load_basis IN ('total','per_hand','assistance','unspecified'));
ALTER TABLE exercises ADD CONSTRAINT ck_exercises_load_basis_presence
  CHECK ((measurement_profile IN ('load_reps','load_distance','load_duration')) = (load_basis IS NOT NULL));
ALTER TABLE exercises ADD CONSTRAINT ck_exercises_volume_counting CHECK (volume_counting IN ('auto','off'));
ALTER TABLE exercises ADD CONSTRAINT uq_exercises_id_profile UNIQUE (id, measurement_profile);   -- O-14, target of §8.2's mirror FK
```

`load_step_kg` stays `NOT NULL > 0` for every profile: it still rounds the load prefill on `load_distance` / `load_duration`, and making it nullable would touch `defaultConfigFor` (`registry.ts:86-101`) for no gain. `strength_estimate` is unchanged (§11.5). Drizzle: `text(...).notNull().default(...)` plus `checkInList` over `MEASUREMENT_PROFILES`, `LOAD_BASES`, `VOLUME_COUNTING_MODES` exported by `src/domain/measurement/profile.ts` — a zero-import module for the same reason as `estimateMode.ts:1-9`.

### 8.2 `session_exercises`

```sql
ALTER TABLE session_exercises ADD COLUMN measurement_profile text NOT NULL DEFAULT 'load_reps';
ALTER TABLE session_exercises ADD COLUMN load_basis text DEFAULT 'unspecified';
-- ck_session_exercises_measurement_profile, ck_session_exercises_load_basis,
-- ck_session_exercises_load_basis_presence: same three predicates as exercises
ALTER TABLE session_exercises ADD CONSTRAINT uq_session_exercises_id_profile UNIQUE (id, measurement_profile);
ALTER TABLE session_exercises ADD CONSTRAINT fk_session_exercises_exercise_profile              -- O-14 (mirror FK)
  FOREIGN KEY (exercise_id, measurement_profile) REFERENCES exercises (id, measurement_profile) ON DELETE RESTRICT;
```

The unique pair is the target of §8.3's composite FK. The **mirror FK** (O-14, accepted) proves at the database level that a slot's frozen profile equals its exercise's profile at the time the slot is written, and — because a referenced `(id, measurement_profile)` pair cannot change while a slot points at it — turns the `session_exercises` half of §10.3's lock into a database guarantee: `UPDATE exercises SET measurement_profile = …` with any slot present fails with `23503`. It is `RESTRICT` like the existing `exercise_id` FK, so hard delete of a referenced exercise stays impossible and hard delete of an unreferenced one is unaffected. Its second purpose is rollout safety: an older build that writes a slot with the column default `load_reps` for an exercise whose profile is no longer `load_reps` **fails loudly** instead of freezing a wrong shape (§13.2, §14.3). These two columns are the frozen profile of the slot (H-1) and exist independently of `prescription`, so ad-hoc slots (`prescription = null`) are covered.

### 8.3 `set_logs`

```sql
ALTER TABLE set_logs ADD COLUMN measurement_profile text NOT NULL DEFAULT 'load_reps';
ALTER TABLE set_logs ALTER COLUMN weight_kg DROP NOT NULL;
ALTER TABLE set_logs ALTER COLUMN reps DROP NOT NULL;
ALTER TABLE set_logs ADD COLUMN distance_m numeric(7,2);
ALTER TABLE set_logs ADD COLUMN duration_s numeric(7,2);
ALTER TABLE set_logs ADD CONSTRAINT ck_set_logs_distance_m_range CHECK (distance_m > 0 AND distance_m <= 99999.99);
ALTER TABLE set_logs ADD CONSTRAINT ck_set_logs_duration_s_range CHECK (duration_s > 0 AND duration_s <= 86400);
ALTER TABLE set_logs ADD CONSTRAINT fk_set_logs_parent_profile
  FOREIGN KEY (session_exercise_id, measurement_profile)
  REFERENCES session_exercises (id, measurement_profile) ON DELETE CASCADE;
ALTER TABLE set_logs ADD CONSTRAINT ck_set_logs_profile_shape CHECK (
     (measurement_profile = 'load_reps'     AND weight_kg IS NOT NULL AND reps IS NOT NULL AND distance_m IS NULL     AND duration_s IS NULL)
  OR (measurement_profile = 'reps'          AND weight_kg IS NULL     AND reps IS NOT NULL AND distance_m IS NULL     AND duration_s IS NULL)
  OR (measurement_profile = 'load_distance' AND weight_kg IS NOT NULL AND reps IS NULL     AND distance_m IS NOT NULL AND rir IS NULL)
  OR (measurement_profile = 'distance_time' AND weight_kg IS NULL     AND reps IS NULL     AND distance_m IS NOT NULL AND duration_s IS NOT NULL AND rir IS NULL)
  OR (measurement_profile = 'duration'      AND weight_kg IS NULL     AND reps IS NULL     AND distance_m IS NULL     AND duration_s IS NOT NULL AND rir IS NULL)
  OR (measurement_profile = 'load_duration' AND weight_kg IS NOT NULL AND reps IS NULL     AND distance_m IS NULL     AND duration_s IS NOT NULL AND rir IS NULL)
);
```

Existing CHECKs (`weight_kg >= 0`, `reps between 1 and 100`, `rir between 0 and 10`) stay and pass on null. The existing plain CASCADE FK to `session_exercises.id` also stays; the composite FK adds the database-level guarantee that **a set's profile always equals its parent's**, and — verified by the review's probe — that a parent slot's `measurement_profile` **cannot be updated while child rows exist** (`23503`), so I-3's freeze is a database property. Because the profile is on the row, the shape CHECK is single-table and PostgreSQL enforces it on every insert and update — the `writable` field-patch path cannot produce a mixed row even if the service validation regresses. **`set_logs` deliberately carries no separate profile-enum CHECK**: membership is enforced transitively by the shape CHECK's OR-chain (an unknown value matches no branch) and by the composite FK; a later reader should not "fix" the omission. Drizzle expresses both composite FKs with `foreignKey({ columns, foreignColumns })` from `drizzle-orm/pg-core` (not yet used in this schema; the generated SQL must be checked once, NC-12).

Index: none new on `set_logs`; `ix_set_logs_session_exercise (session_exercise_id, set_number)` serves every read path, and profile filtering happens in the domain (§11.3).

### 8.4 `exercise_prescriptions`

No column change. `scheme` gains two additive variants (§9). `baseline_load_kg` keeps its meaning for `load_distance` / `load_duration` and is rejected by validation for `reps`, `distance_time` and `duration` (§9.3).

### 8.5 Ownership, cascades, deletion

Unchanged: `exercises.user_id` ownership; RESTRICT from `session_exercises` (both FKs), `exercise_prescriptions`, `recommendations`; CASCADE `session → session_exercises → set_logs` (the set-level composite FK is `ON DELETE CASCADE`, so it never blocks the parent cascade — verified by the review's probe); hard delete of an unreferenced exercise cascades to contributions and dashboard selections. No soft delete on facts.

### 8.6 Does "set" remain the generic ordered attempt?

Yes. `set_logs` keeps its name, `set_number`, `uq_set_number`, renumbering and the deferrable constraint. The noun shown to the athlete is profile-dependent (`Set` for `load_reps` / `reps`, `Round` for the distance and duration profiles, §15.3); the storage noun is not. A successor table was rejected (X-3).

### 8.7 Versioning

- `PrescriptionSnapshot` stays `v = 1`: the change is additive (one optional `measurement` key, stripped by old parsers, plus new scheme variants). A bump would make every old client fail on every new snapshot, including plain `load_reps` ones (§13.2, X-7). Both the `measurement` key and the two scheme variants ship in **Release 1** as acceptance-only widening of the shared domain module (§21.1): `src/domain/schemes/setScheme.ts` and `src/domain/schemas/prescriptionSnapshot.ts` are imported by server, sync and UI alike, so "server-side only" is not available for them — the editor simply does not offer the variants until Release 2.
- `SCHEME_ENVELOPE_VERSION` stays 1 (ADR-008: additive variants do not bump).
- No strategy version changes (H-5): no strategy's behaviour changes; profiles are refused before a strategy runs (§11.3).
- e1RM `algorithm.version` unchanged: arithmetic untouched; the eligibility gate gains two refusal codes under an explicit amendment (§11.6).

---

## 9. Prescription model changes (proposed)

### 9.1 Scheme variants

Two additive variants in `setSchemeSchema` (`src/domain/schemes/setScheme.ts`), keeping the anti-DSL line:

```ts
{ type: "distanceRounds", sets: int 1..20, distanceM: number > 0 <= 99999.99, multipleOf 0.01 }
{ type: "durationRounds", sets: int 1..20, durationS: number > 0 <= 86400, multipleOf 0.01 }
```

`fixed` and `repRange` unchanged. `formatScheme` renders `4 × 20 m` and `3 × 60 s`. Reserved `perSet` / `fixedPlusAmrap` stay reserved and untouched.

### 9.2 Profile × scheme × strategy compatibility

| Profile | `fixed` | `repRange` | `distanceRounds` | `durationRounds` | `load-progression` | `rep-progression` | `manual` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `load_reps` | ✓ | ✓ | – | – | ✓ (fixed, repRange) | ✓ (fixed + repCap, repRange) | ✓ |
| `reps` | ✓ | ✓ | – | – | – | – (v1; N-13) | ✓ |
| `load_distance` | – | – | ✓ | – | – | – | ✓ |
| `distance_time` | – | – | ✓ | – | – | – | ✓ |
| `duration` | – | – | – | ✓ | – | – | ✓ |
| `load_duration` | – | – | – | ✓ | – | – | ✓ |

**Why `rep-progression` is `load_reps`-only in v1.** Every strategy's output is persisted through `inputsSummarySchema` / `performedSetSchema` (`recommendation.ts:45-78`, strict, `weightKg: number >= 0` not nullable) and `derived.workingLoadKg` from `modalWorkingLoad`. A `reps`-profile set has `weight_kg = null`; the only ways to run rep-progression on it are to widen those schemas (forbidden by I-6 in v1) or to coerce the null to `0` (forbidden by I-13). Rep-progression for `reps` is therefore deferred to the release that is allowed to widen `InputsSummary` (N-13). In v1 the `reps` profile is `manual`-only.

`supportsScheme(strategyId, schemeType)` (`registry.ts:70-72`) becomes a real table instead of ignoring its first argument; `profileSupportsScheme(profile, schemeType)` and `strategySupportsProfile(strategyId, profile)` live in `src/domain/measurement/compatibility.ts`. `checkPrescriptionCompatibility` (`src/domain/prescriptions/schema.ts:70-84`) takes the profile as a third argument and reports both `"<profile> does not support <scheme> schemes"` and `"<strategy> does not support <profile>"`; the route keeps returning `400 incompatible_prescription` with the issues list (`src/app/api/templates/[id]/prescriptions/route.ts:62-68`). Because the service validates the **effective** combination on PATCH, changing `exerciseId` to an exercise of a different profile is caught too.

Progression modes: PI-005's `none | manual | strategy` collapses onto today's registry. `manual` already means "no evaluation, no recommendation" (`evaluateSession.ts:110`); a separate `none` would be a second spelling of the same state (X-10). Progression stays on the prescription (`exercise_prescriptions.progression`), which is where PI-005 wants it.

### 9.3 Other prescription fields by profile

| Field | `load_reps` | `reps` | `load_distance` | `distance_time` | `duration` | `load_duration` |
| --- | --- | --- | --- | --- | --- | --- |
| `targetRir` | O | O | rejected | rejected | rejected | rejected |
| `baselineLoadKg` | O | rejected | O | rejected | rejected | O |
| `restSeconds` | O | O | O | O | O | O |

### 9.4 Snapshot contents, prefill and deload

`prescriptionSnapshotDataSchema` gains one optional key: `measurement?: { profile: MeasurementProfile; loadBasis: LoadBasis | null }`. `prefill` is unchanged in shape: `loadKg` (carry-forward or baseline, rounded to `loadStepKg`, load multiplier applied) for load profiles and `null` otherwise; `reps` for rep profiles and `null` otherwise. The concrete site: `schemeDefaultReps` (`src/domain/progression/workingTargets.ts:29-31`) is a two-member switch that will not compile against a four-member union; it widens to `number | null`, returning `null` for `distanceRounds` / `durationRounds`, and `resolveWorkingTargets` (`:33-45`) carries the null through (A-12). Distance and duration prefill come from the scheme target in the UI and are not snapshotted twice.

**Deload semantics for the new variants, stated explicitly.** `setMultiplier` applies to `sets` of all four scheme types (`applySetMultiplier` is written `{ ...scheme, sets }` and is generic — no code change); `loadMultiplier` applies to `prefill.loadKg` where it exists; `targetRirShift` only where a band exists. **Nothing reduces `distanceM` or `durationS`**: a deload week on a sled push is a sets-and-load deload while `appliedModifiers` records the full modifier set. This is deliberate for v1 (distance/duration modifiers would be a new modifier vocabulary, N-13); the history view shows the applied modifiers as today so the reading is unambiguous.

The typed columns on `session_exercises` (§8.2) are authoritative for the slot's **profile and basis** — both are the server-derived values at insert (§10.1). The snapshot copy keeps history rendering self-contained (ADR-007 consequence 1) and lets the engine input carry the profile without a join; its `measurement.loadBasis` records what the athlete saw at session start and **carries no authority** — after a permitted basis edit that lands between freeze and flush it may differ from the column, and nothing reads it (the e1RM gate is exercise-level and `evaluateSession` reads only `measurement.profile`).

---

## 10. Lifecycle and snapshot semantics (proposed)

### 10.1 Session start (template slots) and the server-side derivation

The bundle entry carries `measurement: { profile, loadBasis }` read from the exercise row. `startSession` freezes it into the snapshot's `measurement` key **and** into two new optional keys on the `sessionExercise` payload, `measurementProfile` and `loadBasis` (§12.2 — X-8 is reversed; see §10.2 for why). On `sessionExercise` insert the server:

1. **derives** the slot's `measurement_profile` / `load_basis` with a **user-scoped** `SELECT … FROM exercises WHERE id = payload.exerciseId AND user_id = callerId`; a missing or foreign exercise rejects the op as `invalid_reference` — the column's `NOT NULL DEFAULT 'load_reps'` is never used as a fallback (the mirror FK would also refuse a wrong value, but the service must not rely on reaching it);
2. **compares only `measurementProfile`**: when the payload carries it and it differs from the derived profile the op rejects as `measurement_profile_mismatch`; when absent (an older client) it derives silently, and the mirror FK still guarantees the frozen value equals the exercise's. **The payload's `loadBasis` is ignored on insert**: the slot's `load_basis` is always the value derived from the live exercise row. The key stays on the payload, always emitted by `sessionExerciseFullRowOp`, purely so that builder's key set is fixed (§12.3, W-1 subsumption) — it carries no authority. Rationale: `load_basis` is deliberately **not** locked (§10.3 — an edit with history is permitted, and it is excluded from the mirror FK for that reason), so a basis that changed between an offline session start and the outbox flush is an ordinary, permitted event that must apply, not a disagreement; only the profile determines the row shape and only the profile is locked (V-1 negative control: NC-14).

For template slots a **profile** disagreement needs an exercise whose profile changed after the bundle was cached, which §10.3 forbids once a prescription references it — so for template slots the rejection is a safety net. For ad-hoc slots it is a real path (§10.2). A **basis** change after the bundle was cached is permitted for both slot kinds and simply results in the slot freezing the newer basis.

### 10.2 Ad-hoc slots

Same derivation and the same profile-only comparison. Here the comparison is load-bearing: an exercise stays unlocked until its first slot or prescription row **lands on the server**, so the sequence *create exercise → ad-hoc add (op queued) → go offline → edit the profile on another device or tab → reconnect* would otherwise freeze the slot with the **new** profile while the device had logged sets against the old shape. With the payload keys the server rejects the slot op (`measurement_profile_mismatch`), the dependent set ops reject (`not_found` parent), the athlete is told (§13.4, O-16) and nothing is silently mis-shaped. Locking the exercise at first ad-hoc add would not cover this case, because the edit happens before the server has seen the add. The search result (`GET /api/exercises?search=`, NetworkOnly) carries `measurement`, so the card renders the right inputs immediately and the aggregate stores it for offline use.

### 10.3 Profile changes on an existing exercise

**Blocked once the exercise is referenced by any `session_exercises` or `exercise_prescriptions` row** (`409 measurement_profile_locked`); allowed before that. The `session_exercises` half is a **database guarantee** through the mirror FK (§8.2); the `exercise_prescriptions` half is a service rule. Rationale: snapshots already protect stored rows (H-1), but every per-exercise series — previous performance, carry-forward, e1RM observations, dashboard rows — is keyed on `exercises.id` (ADR-011: "per-exercise series only"), and mixing shapes inside one series makes "last time" and "best" meaningless. Changing the shape is repurposing, which ADR-007 forbids by convention; this makes it a hard rule for the one field where it matters. The athlete creates a new exercise and archives the old one; no clone tool in v1 (O-3).

`load_basis` edits stay allowed with history, exactly like `equipment` today (`eligibility.ts:16-18`: a gate, not a reinterpretation weight), with a UI notice that future sessions and estimates are affected while past sessions keep their frozen label. `volume_counting` edits are current-convention (H-3), flagged like contribution-weight edits.

### 10.4 Completed sessions and corrections

Structure immutable, values editable (H-1). A correction may change any field the frozen profile permits and may clear an optional field (`duration_s` on `load_distance`) with an explicit `null`; it may never change the profile or introduce a forbidden field — rejected by the server before write and by the CHECK after.

### 10.5 Deletion

Unchanged cascade graph (§8.5).

---

## 11. Capability and consumer matrix (proposed)

### 11.1 Principle

Every capability is a pure function `capability(profile, loadBasis, equipment, switches) → { enabled, reasonCode? }` in `src/domain/measurement/capabilities.ts`. Structural refusals come first and cannot be overridden; per-exercise switches are evaluated last and can never enable a structurally incompatible consumer. For a compatible profile a switch may take either value — PI-005's rule is "overrides may disable compatible behaviour but must not enable an incompatible engine", and turning volume counting on for a `reps` exercise is a compatible enable.

### 11.2 Matrix

| Consumer | Structural rule | Per-exercise switch | Level | Historical sessions |
| --- | --- | --- | --- | --- |
| **e1RM Release A tracker** | `profile = load_reps` AND `load_basis ≠ assistance` AND `equipment ∈ {barbell,dumbbell,cable,machine}` | `strength_estimate = 'off'` (existing, disable-only) | exercise | series filtered by the **frozen** slot profile at the SQL→domain boundary (I-13); identical output for every existing exercise |
| **e1RM Release B suggestion** | same gate; the card fills the weight input only on a `load_reps` slot | same | exercise | n/a |
| **load-progression** | `profile = load_reps` AND scheme ∈ {fixed, repRange} | choose `manual` | prescription | `evaluateSession` skips any slot whose frozen profile is not `load_reps` by `continue` — no row, no draft (§11.3) |
| **rep-progression** | `profile = load_reps` AND scheme ∈ {fixed, repRange} (v1; `reps` deferred, N-13) | choose `manual` | prescription | same |
| **manual / no progression** | always | — | prescription | — |
| **future distance/time progression, rep-progression for `reps`** | not designed; register as new or extended strategies declaring the relevant scheme variants, together with the `InputsSummary` widening they need (ADR-006 registration, I-6 amendment at that time) | — | prescription | — |
| **muscle-volume aggregation** | `profile ∈ {load_reps, reps}` | `volume_counting`: `'auto'` = count when structurally compatible, `'off'` = never; **creation default is `'auto'` for `load_reps` and `'off'` for `reps`** (O-4(i)/(ii), accepted) | exercise | profile from the frozen slot column; the switch is current-convention (H-3) |
| **Metrics Training card** | counts every non-warm-up attempt of every profile (activity, not volume) — O-6 accepted; the card caption becomes `Completed workouts only. Warm-up sets not counted. Every exercise type counts as a set.` (replacing `src/ui/metrics/copy.ts:37`) | — | — | — |
| **Metrics Current-estimates selection** | reuses the e1RM structural gate (`isSelectionEligible`, with `measurementProfile` and `loadBasis` threaded through `selectionService.ts`) | — | — | stored rows retained (H-14), shown `not_available` |
| **Descriptive history / previous performance** | always; rendered by profile | — | — | frozen profile |
| **Profile-appropriate personal records** | possible for every profile (heaviest ball, most reps, longest carry, fastest sprint) — **deferred** (N-4) | — | — | — |

### 11.3 Where the gate is applied, and the SQL→domain boundary rule

Domain, not SQL — the established convention for warm-up exclusion, eligibility and admissibility (`metrics-dashboard-architecture-evaluation.md:143`). Because `weight_kg` and `reps` become nullable, **every place that maps a set row into a numeric domain type must exclude rows whose frozen slot profile that consumer cannot consume *before* mapping, and must never coerce a null load or rep count to `0` or `1`** (I-13; H-12 — a fabricated `0 kg` would land in `classifySet`'s `zeroLoad` bucket and in `modalWorkingLoad`). The sites:

| # | Site | Rule |
| --- | --- | --- |
| 1 | `getWorkSetsByExercise` (`src/server/progression/service.ts:117-131`) and the `getEngineHistory` window (`:141-188`) | select `session_exercises.measurement_profile` with the rows; keep only `load_reps` slots; map the rest to no `PerformedSet` at all. `evaluateSession` additionally reads `snapshot.measurement?.profile ?? 'load_reps'` and `continue`s for anything else — the same silent skip `manual` (`:110`) and an unparseable config (`:122`) already take. **No draft, no row, no new reason code**; `unsupportedSchemeDraft` stays reserved for scheme/strategy mismatch |
| 2 | `buildClientRecommendationOps` (`src/sync/activeSession.ts:633-724`, mapping at `:663,678`) | same filter on the aggregate's `measurement.profile` before building `PerformedSet`; the client and server evaluations converge because both skip the slot |
| 3 | strength `queryFactRows` (`src/server/strength/service.ts:92-114,190-194`) | keep only `load_reps` slots, and **replace** the `weightKg ?? 0` coalesce with an explicit null skip beside the existing `if (row.setNumber === null) continue;` (`:190`) — `row.weightKg` becomes `number | null` while `StrengthSetInput.weightKg` stays `number` (`types.ts:26-32`), and a `WHERE` clause or `.filter()` does not narrow the type, so the skip is what makes it compile without a cast; a null load never reaches `StrengthSetInput` |
| 4 | `queryWorkSetContributionRows` (`src/server/volume/service.ts:177-215`) → `WorkSetContributionRow` | project `measurementProfile` and `volumeCounting`; `aggregate.ts:170-175` filters on them beside `isWarmup` — the profile filter lives in the domain like the warm-up filter, and the row type carries no load or rep numbers at all |
| 5 | `toHistoryDto` / `toCarryForwardCandidate` (`src/server/today/service.ts:51-57,275-283`) and `HistorySetDetail` (`src/server/history/service.ts:172-193`) | display consumers: rows are **not** excluded, the DTO fields are typed `number | null` and rendered by `formatSetLine` (§15.4); `firstWorkSetLoadKg` is `firstWorkSet?.weightKg ?? null` (null when the profile has no load), never `0` |

`StrengthExerciseInput` gains `measurementProfile` and `loadBasis`; `evaluateExerciseEligibility` checks profile → basis → equipment → switch and returns `MEASUREMENT_PROFILE_UNSUPPORTED` / `LOAD_BASIS_UNSUPPORTED` (O-17 option (a), accepted; §11.6; mapped in `src/ui/strength/copy.ts` and in `estimateIndex.ts`'s `stateFor` → `not_available`). `PerformedSet`, `performedSetSchema`, `InputsSummary` and `REASON_CODES` **do not change** (H-6, I-6): the engine only ever receives `load_reps` sets and never emits a profile-related code.

### 11.4 `volume_counting` switch (O-4)

`exercises.volume_counting` (`'auto' | 'off'`), mirroring `strength_estimate`'s form placement (`src/domain/exercises/schema.ts:178-186`) but with a **profile-dependent creation default**: the service sets `'auto'` for `load_reps` and `'off'` for `reps` when the create payload omits it (the column default stays `'auto'` for old-build inserts, which are all `load_reps`). `'auto'` on a structurally incompatible profile still excludes (NC-11). Rationale for defaulting `reps` closed: intent is deliberately not modelled (§5.1), so the profile alone cannot separate an athletic jump from a bodyweight push-up set; PI-005 requires athletic attempts to be excluded by default and profile defaults to fail closed; and an athlete enabling counting for a push-up exercise is a permitted compatible enable. Placed on the exercise, not the prescription: volume is a per-muscle interpretation of history under current convention (H-3), and a per-prescription flag would make one exercise count in one template and not another for the same muscles — the mixed-convention corruption ADR-007 rejects (X-11). PI-005's Med Ball Slam example is satisfied by `load_reps` + `volume_counting = 'off'` + `manual`; e1RM is off structurally when its equipment is `other`, or by the switch otherwise. The legacy referenced `dumbbell-farmers-carry`, which stays `load_reps` forever with its fabricated reps, gets `volume_counting = 'off'` in the Release 2 reconcile (§14.3) — a current-convention change of the same class as a contribution-weight edit, and the only way those reps stop counting as hypertrophy sets.

### 11.5 Does `strength_estimate` survive?

**Survives, narrowed.** It remains the athlete's disable-only override (`'auto' | 'off'`), evaluated after the structural gate. It does **not** gain profile values: `estimateMode.ts:11-14` reserved room "for D-11", but putting a shape into an override column recreates the overlapping-metadata problem revision §14.4 warns against and would let the switch express an incompatible state (X-1). The one-shot reconcile stays; the `'off'` on the seeded Farmer's Carry becomes redundant once its profile is `load_distance` and is left as is. D-11 is discharged by this section.

### 11.6 Amendment of ADR-011 / the e1RM revision (explicit; owner decision O-17 accepted, option (a))

Two binding clauses of the owner-accepted e1RM revision are amended by this design, in the way ADR-011 itself amended OD-06. **O-17 was accepted as written on 2026-09-07 (option (a))**; the amendment takes effect with the Release-1 commit that changes `src/domain/strength/eligibility.ts` and `src/domain/strength/reasonCodes.ts`, and the document amendments in §24 land in that same commit. The two rejected options are retained in O-17 as rationale only.

| Clause | Before | After | Reason |
| --- | --- | --- | --- |
| §15.4 reason-code enum; I-14 ("no code outside that enum is emitted anywhere"); acceptance A-19 | closed enum | **two additions**: `MEASUREMENT_PROFILE_UNSUPPORTED`, `LOAD_BASIS_UNSUPPORTED`, placed in `SUGGESTION_REFUSAL_REASON_CODES` (`src/domain/strength/reasonCodes.ts:57-59`) directly beside the two existing exercise-level codes `EXERCISE_CATEGORY_UNSUPPORTED` / `EXERCISE_ESTIMATE_DISABLED` — that group already holds the exercise-level refusals despite its "suggestion" name, and no new group is introduced; both codes are excluded from `RELEASE_B_ONLY_REASON_CODES` (`:118`) | a `duration` Plank refused for its **shape** is a truer explanation than refusal for its equipment category |
| §9.6 ordered refusal list; `evaluateExerciseEligibility` comment "category code wins" (`eligibility.ts:26-28`) | equipment → switch | **profile → basis → equipment → switch** | same; the profile is the more fundamental fact |

Consequences (binding): the assisted pull-up's rendered refusal changes from `EXERCISE_ESTIMATE_DISABLED` to `LOAD_BASIS_UNSUPPORTED` when its basis is reconciled in Release 2 (A-15 asserts both sides); the strength page copy map gains two lines; the dashboard's `not_available` row state covers four codes instead of one; in Release 1 the new codes and ordering exist in code but are unobservable, because no non-`load_reps` exercise and no `assistance` basis exists until Release 2. The e1RM revision document and ADR-011's deferred list (D-11) are updated in the Release-1 commit (§24). The rejected options — keep "category code wins" and place the two new codes after equipment; or add no codes and refuse under the existing `EXERCISE_CATEGORY_UNSUPPORTED` — would have left the structural gate identical and changed only which copy line the athlete sees; A-4 and A-15 are written against option (a).

---

## 12. API and sync-contract changes (proposed)

### 12.1 REST (definition world)

| Surface | Change |
| --- | --- |
| `createExerciseSchema` | `measurementProfile: measurementProfileSchema.default('load_reps')` and `loadBasis: loadBasisSchema.optional()` resolved in the `.transform()` to `'unspecified'` for load profiles and `null` otherwise — **optional with defaults**, matching `laterality.default("bilateral")` and the column defaults, so a cached pre-upgrade client posting today's body still gets `201`; `volumeCounting` **not** on create — the service applies the profile-dependent default (§11.4) |
| `updateExerciseSchema` (strict) | `measurementProfile`, `loadBasis`, `volumeCounting` optional keys; service enforces §10.3 → `409 measurement_profile_locked` (the mirror FK's `23503` is mapped to the same error as a backstop) |
| `ExerciseDto` / `ExerciseRecord` | `measurementProfile`, `loadBasis`, `volumeCounting` |
| `GET /api/exercises?search=` | carries the three fields (ad-hoc add needs the profile) |
| `createPrescriptionSchema` / `updatePrescriptionSchema` | envelope accepts the two variants; `checkPrescriptionCompatibility(scheme, progression, profile)`; §9.3 rules → `400 incompatible_prescription` |
| `GET /api/today-bundle` | `TodayBundleExerciseEntry.measurement?` (optional on the client, H-10); `HistorySetDto` gains `distanceM`, `durationS` (`number|null`); `weightKg`/`reps` widen to `number|null` |
| `GET /api/history/[id]` | `HistorySetDetail` same widening; exercise detail gains `measurement` from the typed columns |
| `GET /api/exercises/[id]/strength` | `exercise.measurementProfile`, `exercise.loadBasis`; two new refusal codes (§11.6) |
| `GET /api/metrics` / `PUT /api/metrics/selection` | `not_available` also covers the profile/basis refusals; candidate list and write validation use the same gate with the two fields threaded through |

### 12.2 Sync (execution world)

Two payload schemas change, both staying `.strict()`.

`setLogUpsertPayloadSchema` (`src/domain/sync/schema.ts:99-112`):

```ts
weightKg:  z.number().min(0).max(9999.99).nullable().optional(),            // no multipleOf in v1 (O-15, accepted)
reps:      z.number().int().min(1).max(100).nullable().optional(),
rir:       (unchanged)
distanceM: z.number().gt(0).max(99999.99).multipleOf(0.01).nullable().optional(),
durationS: z.number().gt(0).max(86400).multipleOf(0.01).nullable().optional(),
```

`sessionExerciseUpsertPayloadSchema` (`:85-96`): `measurementProfile: measurementProfileSchema.optional()`, `loadBasis: loadBasisSchema.nullable().optional()`. `measurementProfile` is read on insert only (compared, §10.1) and ignored on update like `prescription`; `loadBasis` is **validated for shape but never read** — it exists only to keep the full-row builder's key set fixed (§12.3), and the slot's basis is always derived from the exercise row (§10.1, I-14).

**Reject-reason vocabulary.** `SyncRejectReason` (`src/server/sync/service.ts:44-58`) gains exactly two members: `invalid_measurement` (a set op whose effective row violates its slot's profile or bounds, or a mapped `23514`/`22003`) and `measurement_profile_mismatch` (a `sessionExercise` insert whose payload profile disagrees with the exercise row). Both are dead-letter reasons: they surface as `deadReason` on the sync-issues screen exactly like the existing members, and — under O-16 — on the active-session card and banner (§13.4). No existing member changes meaning; `invalid_reference` continues to cover the composite-FK `23503` case.

Presence semantics stay D-03's: **absent = do not write; null = explicit clear**. Server rules for a set op:

- **Creation-required fields become profile-scoped**: `sessionExerciseId`, `setNumber`, `loggedAt` plus `required(dimensionsOf(parent.measurement_profile))` — the current hard-coded `weightKg`/`reps` gate (`sync/service.ts:767-775`) is replaced, so a `duration` create carrying only `durationS` is complete and a `load_reps` create still needs load and reps.
- The **effective row** (§13.1) is validated against the parent's frozen profile before any write; a null on a required field, a non-null on a forbidden field, a clear that leaves a required field null, or a value outside the profile's bounds rejects with `invalid_measurement` (dead letter, payload intact).
- Backstop mapping: `23514` (check violation) **and `22003` (numeric overflow)** → `invalid_measurement`; `23503` on the composite FKs → `invalid_reference` as today. Today `23514` and `22003` are unmapped and would fail the whole batch (H-17) — the poison-op regression I-8 forbids.

Unchanged: `SYNC_ENTITIES`, `SYNC_OPERATIONS`, `MAX_OPS_PER_BATCH`, the envelope, `workoutSessionUpsertPayloadSchema`, the recommendation and decision payloads, delete payloads.

### 12.3 The emission rule (O-13) and the full-row builders

**Binding rule (O-13, accepted) — profile-scoped full rows.** `setLogFullRowOp` (`activeSession.ts:215-232`), the renumber upserts in `buildSetDeletionOps` (`setDeletionOps.ts:77-87`) and `SetLogRowFields` (`:17-24`) emit the profile-independent keys (`id`, `sessionExerciseId`, `setNumber`, `isWarmup`, `loggedAt`, `notes`) plus **every key the frozen profile permits** — required and optional, with `null` for an optional value that is absent — and **omit forbidden keys**. The permitted set comes from `dimensionsOf` (§6.4). For `load_reps` this is exactly today's nine keys, byte for byte. Never conditional within a profile.

Why this and not always-emit-eleven-keys: (a) a `load_reps` op stays parseable by the previous build's `.strict()` schema, which is what keeps rollback and the Release-1/Release-2 window safe (§14.5); (b) D-03's presence semantics remain intact — an absent forbidden key means "not written", which is also the stored truth; (c) the server's creation-required gate and effective-row validation receive a complete row for the profile, so `null !== undefined` continues to satisfy the required-fields check for load-less profiles (the review's clean-check dependency, now stated). The alternative and its cost are in O-13.

**This rule is not a W-1 control.** W-1 (H-7) concerns `canExcuseViaSupersession`, which `applySetLogUpsert` never calls; a key-short `setLog` op produces ordinary "absent means do not write" behaviour, not a rejection. The rationale for a fixed per-profile key set is presence semantics and validation completeness, as above. The real W-1 builders are `workoutSessionFullRowOp` (`activeSession.ts:145-172`) and `sessionExerciseFullRowOp` (`:175-190`); the latter gains the two optional keys of §12.2 and must **always** emit them — `loadBasis` included, even though the server ignores its value on insert (§10.1) — so its key set stays fixed and every same-id group it produces remains fully subsumed. `SESSION_EXERCISE_FIELDS` (`sync/service.ts:159-167`) gains both keys; `isCreateAnchoredSessionExercise` (`:560-566`) is unchanged.

Concrete checklist: `SET_LOG_FIELDS` (`:168-177`) gains `distanceM`, `durationS`; `setLogUpdateChangesEvaluationInputs` (`:702-713`) gains both (harmless); `correctHistorySet` stays the one partial emitter and **must** go through a builder (`buildSetLogCorrectionPayload`) that parses against the schema, closing the "never schema-parsed client-side" gap at `corrections.ts:30`; NC-1 asserts the key set of **all three** full-row builders — per profile for `setLog` — with a mutation witness. NC-1 is a genuine W-1 control for the two entities W-1 governs and a presence-semantics control for `setLog`; it does not by itself close W-1, which remains open in its own lineage.

### 12.4 IndexedDB

`ActiveSessionSetDto` gains `distanceM`, `durationS` and widens `weightKg`/`reps` to `number | null`; `ActiveSessionExerciseDto` gains `measurement`. `DB_VERSION` stays 2 (schemaless stores, `types.ts:174`). **Hydration normalises** pre-upgrade aggregates (`measurement ?? { profile: 'load_reps', loadBasis: 'unspecified' }`; set keys per the profile's permitted set) — the `bundleCache` "sanitise on read" precedent — so an in-progress session that straddles the deploy emits complete profile-scoped rows.

---

## 13. Offline, concurrency and idempotence analysis

### 13.1 Deterministic replay

Per-op transactions in arrival order (H-9) are unchanged. For a set op the server now: parses (strict) → resolves the parent slot and its frozen profile → computes the **effective row** (existing row patched by this op's writable fields, or the creation fields) → validates the effective row against `dimensionsOf(profile)` and the bounds → writes. Validating the effective row rather than the op is what makes a partial correction (`{id, sessionExerciseId, durationS: null}`) deterministic under V-2's `writable` exclusion: the same batch replayed yields the same effective rows and the same accept/reject decisions. Shape validity depends only on the profile, so any field-wise merge of two rows valid under one frozen profile is valid — D-03's field-level merge cannot produce a shape-invalid row. Nothing depends on wall-clock or client version.

### 13.2 Rollout cases

"Old client" = pre-upgrade JS still active because `skipWaiting: false`; "old bundle" = SW or IndexedDB copy served after deploy; "R1"/"R2" = the builds of §21.

| Case | Behaviour | Fails closed? |
| --- | --- | --- |
| New client, old cached bundle (no `measurement`) | typed optional; absent → `load_reps` / `unspecified`, same as every existing exercise; session starts and logs identically | yes (identical) |
| Old client, new bundle, only `load_reps` exercises | extra `measurement` key ignored by typed reads and stripped by the snapshot `z.object`; server derives the slot profile; nine-key set ops accepted, new columns default null | yes (identical) |
| Old client, new bundle with a `distanceRounds` / `durationRounds` prescription | old `setSchemeSchema` rejects the variant inside `.parse()` → `startSession` throws before any op is enqueued; nothing written anywhere; the UI shows "Update the app to start this workout" | yes |
| Old client ad-hoc-adds a new-profile exercise | server derives the true profile (mirror FK agrees); the old client's `{weightKg, reps}` set ops fail the service check → `invalid_measurement` dead letters with payload intact; the slot is created empty; the athlete is told (§13.4) | yes |
| Old client `POST /api/exercises` with today's body | `measurementProfile` defaults to `load_reps`, `loadBasis` to `unspecified` → `201` (§12.1) | yes (identical) |
| Old client (pre-`0013`) writes a slot for an exercise whose profile is no longer `load_reps` (only possible during a deploy window after a Release-2 reconcile) | the slot insert takes the default `load_reps` and **fails the mirror FK** (`23503`) — the session_exercise op dead-letters instead of freezing a wrong shape | yes |
| New client mid-session at deploy (aggregate lacks new keys) | normalised on hydrate (§12.4) | yes |
| Ad-hoc slot whose exercise **profile** was edited elsewhere before the queued add op reached the server | `measurement_profile_mismatch` on the slot op; its set ops reject `not_found`; athlete told | yes |
| Template or ad-hoc slot whose exercise **load basis** was edited (a permitted edit, §10.3) between an offline session start and the outbox flush | the slot op **applies**; the payload `loadBasis` is ignored and the slot freezes the basis derived from the live exercise row; every set op applies; history shows the newer basis label for that session (NC-14) | n/a — not a failure |
| Duplicate / lost-response replay of a profile-scoped create | `onConflictDoNothing` then update path with `writable = ∅` → no-op, as today (`sync.integration.test.ts:517`, `:1004`) | yes |
| Shape-invalid create **trailed by a delete of its own id** in the same batch | W-2's `laterDelete` short-circuit (H-8) runs before validation → reported `applied`, nothing written, final state identical; NC-3's `invalid_measurement` expectation applies to the un-trailed case only | yes (as shipped) |
| Renumber after delete on a `load_distance` slot | profile-scoped renumber upserts carry distance/duration; ascending order unchanged (H-11) | yes |
| Two devices editing `durationS` and `weightKg` of one completed set | D-03 field merge, unchanged residual risk; effective-row validation guarantees the merged row is still shape-valid | as today |
| Takeover / discard | unchanged (`{id, status: 'discarded'}` never touches set fields) | as today |

### 13.3 Deliberately not added

- No bundle version or hash: the tolerance rule (H-10) plus "absent means legacy" covers every case above; a version would force a refresh policy the app does not have (X-13).
- No client-version header or protocol negotiation on `/api/sync`: strict parsing plus effective-row validation already reject everything an old client could send that the schema cannot represent.
- No timestamp / LWW work (H-9).

### 13.4 What the athlete sees when a set is refused (O-16)

"Dead letter with payload intact" is not "fail closed with clear UI guidance" (PI-005): today `refreshSessionBlocked` (`src/sync/activeSessionStore.ts:141-152`) raises `sessionBlocked` only for `workoutSession` dead letters; a `setLog` dead letter stays visible in the local aggregate until `completeSession` discards the aggregate, and survives only as a sync-issues row. **Binding (O-16, accepted):** the same mechanism is extended additively in Release 2 — a `setLog` or `sessionExercise` dead letter whose row belongs to the active session marks that set / slot "Not saved — see Sync issues" on the card and shows the existing banner; completion stays possible but confirms that unsaved sets will be dropped from the aggregate. `refreshSessionBlocked` therefore matches `setLog` / `sessionExercise` dead letters by `payload.sessionExerciseId` / `payload.sessionId` against the active session in addition to today's `workoutSession` match. The rejected alternative (silent loss with a sync-issues row only) is retained in O-16 as rationale. A-23 and A-25 assert what the athlete sees, not only that the dead letter exists.

### 13.5 Negative controls (must exist before the release that ships each mechanism)

| Id | Control | Tier | Release |
| --- | --- | --- | --- |
| NC-1 | Key set of `workoutSessionFullRowOp`, `sessionExerciseFullRowOp` (with the two new keys) and `setLogFullRowOp` / renumber upserts (per profile, ≡ profile-independent keys ∪ permitted keys); mutation witness on each | unit | R1 (server keys), R2 (client emission) |
| NC-2 | A nine-key (pre-upgrade) create op on a `load_reps` slot applies and yields a row **identical in every pre-existing column** to today's fixture (the row additionally carries `measurement_profile = 'load_reps'` and two nulls) | integration (PGlite) | R1 |
| NC-3 | A nine-key create op on a `load_distance` slot → `invalid_measurement` **from the service layer** (asserted by layer: the service check fires before any SQL; with the service's own shape/bounds pre-check stubbed out — not the derivation that writes the row's profile — the op still carries the parent slot's correctly-derived profile, so it instead fails the shape CHECK as `23514` → `invalid_measurement`, not the composite FK: reaching the composite FK's `23503` → `invalid_reference` requires bypassing the derivation too, e.g. a raw insert that lets the column default apply — see §28, L-10), zero writes, no batch failure, later ops in the batch still apply | integration | R1 |
| NC-4 | Every (profile × forbidden field non-null) and (profile × required field null) combination rejected by the service **and**, with the service check stubbed out, by `ck_set_logs_profile_shape` mapped to `invalid_measurement`; **plus a boundary row per numeric column**: exact ceiling accepted (`9999.99`, `99999.99`, `86400`), ceiling + 0.01 refused as `invalid_measurement`, and a value that rounds into overflow (e.g. `9999.995` on `weight_kg` injected below the Zod layer) refused as `invalid_measurement` via the `22003` mapping — never as a request failure | integration + real PostgreSQL | R1 |
| NC-5 | Set-level composite FK: inserting a set whose profile differs from its parent's fails `23503`; **mirror FK**: inserting a slot whose profile differs from its exercise's fails `23503`, and `UPDATE exercises SET measurement_profile` with a slot present fails `23503`; controls: with each constraint dropped in a scratch DB the corresponding statement succeeds | real PostgreSQL | R1 |
| NC-6 | Full reconnect batch with distance/duration sets replayed three times → zero rejections, identical rows (extends `sync.integration.test.ts:517`) | integration | R2 |
| NC-7 | Partial correction `{durationS: null}` on `load_distance` applies; `{distanceM: null}` on the same slot rejects; `{reps: null}` on `load_reps` rejects; full-row edit trailed by a partial correction preserves omitted fields (extends `:1004`) | integration | R2 |
| NC-8 | Old cached bundle fixture (no `measurement`, no `distanceM`) starts a session and logs a set whose op equals a pre-upgrade recording | unit (fake-indexeddb) + e2e | R2 |
| NC-9 | `evaluateSession` on a snapshot with `measurement.profile ≠ load_reps` and a non-manual strategy: **no recommendation row is written, no draft is returned, no strategy is called** (spy), and the same holds for `buildClientRecommendationOps`; the `load_reps` slots of the same session are evaluated normally | unit | R1 (server `evaluateSession`); R2 (client `buildClientRecommendationOps`, which needs the client aggregate to carry `measurement.profile` — a DTO widening O-7 excludes from R1, so this clause cannot be satisfied until Release 2; see §28, L-11) |
| NC-10 | e1RM / volume / metrics / progression-history fixtures with mixed-profile sessions: (a) output for the full mixed fixture **equals** the output for the same fixture with every non-`load_reps` slot removed — the load-bearing detector, since a `duration` set mapped as `0 kg` would change `modalWorkingLoad`, `classifySet` and the volume count; (b) the number of mapped domain rows (`PerformedSet`, `StrengthSetInput`, `WorkSetContributionRow`) **equals** the count of non-warm-up rows on `load_reps` slots in the fixture; the fixture's `load_reps` rows include a legitimate single and a legitimate `0 kg` bodyweight set so (a) and (b) are not vacuous on realistic data (I-13) | unit | R1 |
| NC-11 | `strength_estimate = 'auto'` on a `load_distance` exercise still refuses (`MEASUREMENT_PROFILE_UNSUPPORTED` first); `volume_counting = 'auto'` on `load_distance` still excludes; a `reps` exercise created without `volumeCounting` is stored `'off'` and excluded; the same exercise set to `'auto'` counts | unit + integration | R1 |
| NC-12 | Migration chain `0000..0013` on an empty database and on a prod-shaped fixture: idempotent re-run, `pnpm db:generate` reports no drift; before the shape constraint is added, `count(*)` of set rows violating the predicate is 0 **and the check is proven non-vacuous** by a deliberately broken control row in a scratch database that makes the count 1 | real PostgreSQL | R1 |
| NC-13 | A batch of new-build **`load_reps`** set ops and session-exercise ops parsed against the **previous** build's `setLogUpsertPayloadSchema` / `sessionExerciseUpsertPayloadSchema` (frozen copies in the test): under profile-scoped emission the set ops parse; the session-exercise ops parse only against the R1 schema (which accepts the keys) and fail against the pre-`0013` schema — asserting exactly the rollback matrix of §14.5 for the option O-7/O-13 select | unit | R2 |
| NC-14 | Two queued `sessionExercise` inserts against exercises edited after the client froze them: one whose exercise **load basis** changed (`unspecified` → `per_hand`) **applies**, the slot's `load_basis` equals the live exercise row's value, and its subsequent set ops apply; one whose exercise **profile** changed (only possible on an unreferenced exercise) rejects `measurement_profile_mismatch`, its set ops reject `not_found`, and nothing is written; a third insert without either key derives both silently. Mutation witness: making the comparison include `loadBasis` turns the first case into a rejection and fails the test | integration (PGlite) | R1 |

---

## 14. Migration and backward-compatibility plan

### 14.1 Migration `0013` (generated, then hand-edited like `0003`/`0006`)

Order inside the file: `exercises` columns + CHECKs + unique pair → `session_exercises` columns + CHECKs + unique pair + mirror FK → `set_logs` drop-NOT-NULL, new columns, range CHECKs, composite FK, shape CHECK. Every `ADD COLUMN … NOT NULL DEFAULT` back-fills in place (PostgreSQL 11+ stores the default in the catalog; no table rewrite). The only genuine backfill is implicit: `load_basis DEFAULT 'unspecified'` on all three tables, correct because every existing row is `load_reps`. **No `UPDATE`/`DELETE` statement.** Production tables are small (single account); the volume-report sizing fixture (`scripts/metricsPerformanceFixture.ts`) is the scale to test against. Because every column carries a default and every existing row satisfies every new constraint, the migration is safe to run while the previous build is still serving — which is the deploy order (`deploy.yml:106,121`).

Drizzle: the two composite FKs and any CHECK drizzle-kit renders with parameter placeholders are verified in the generated SQL and hand-corrected where needed, recorded in the migration comment as the existing files do. `drizzle/meta/0013_snapshot.json` must match the TS schema; `pnpm db:generate` afterwards must be a no-op (NC-12).

### 14.2 Mapping of existing data (no meaning change)

| Existing row | Becomes | Why the meaning is unchanged |
| --- | --- | --- |
| every `exercises` row | `measurement_profile = load_reps`, `load_basis = unspecified`, `volume_counting = auto` | every exercise is logged as load + reps today; the kg convention was never recorded |
| every `exercise_prescriptions` row | untouched (`fixed`/`repRange` remain valid for `load_reps`) | — |
| every `session_exercises` row | `load_reps` / `unspecified` typed columns; `prescription` JSON untouched (readers treat a missing `measurement` as `load_reps`) | — |
| every `set_logs` row | `measurement_profile = load_reps`; `weight_kg`, `reps`, `rir` unchanged; new columns null | satisfies the `load_reps` branch by construction |
| every `recommendations` row | untouched | — |
| Farmer's Carry history logged as `X kg × N` | stays `load_reps` forever (frozen); the athlete's entered reps are preserved, not converted | conversion would be destructive reinterpretation |

### 14.3 Seed reconcile — Release 2 only (`src/db/seed/reconcileMeasurementProfiles.ts`, same pattern as `reconcileStrengthEstimates.ts`)

**Release 1 ships no measurement reconcile.** A profile conversion in Release 1 would produce two seeded exercises that no Release-1 client can prescribe or log (the editor offers no `durationRounds` scheme and the card renders `kg · reps · RIR`), and the deploy order (`db:seed` before the app swap) would run it while the previous build still serves. The reconcile therefore ships with the release that ships the logging UI (§21.2) and is gated on that release's acceptance (O-5). It is deterministic, idempotent, id-keyed through `seededExerciseId(userId, slug)` and **state-predicated**:

| Slug | Target | Predicate |
| --- | --- | --- |
| `machine-assisted-pull-up` | `load_basis = assistance` | `is_seeded AND load_basis = 'unspecified'` — allowed with history (a gate); changes its rendered refusal (§11.6) |
| `dumbbell-farmers-carry` | `measurement_profile = load_distance`, `load_basis = per_hand` | `is_seeded AND measurement_profile = 'load_reps' AND NOT EXISTS session_exercises AND NOT EXISTS exercise_prescriptions` — unreferenced only |
| `dumbbell-farmers-carry` (referenced) | `volume_counting = 'off'` | `is_seeded AND measurement_profile = 'load_reps' AND volume_counting = 'auto' AND EXISTS session_exercises` — current-convention (H-3), so allowed with history; the fabricated reps stop counting |
| `bodyweight-plank` | `measurement_profile = duration` | same unreferenced predicate as the carry |

**Deploy window for Release 2.** The reconcile runs in the seed step while the Release-1 build still serves. Release 1 already derives slot profiles server-side and validates set shapes, so during that window an ad-hoc add of Plank from the Release-1 client creates a `duration` slot and its `kg · reps` set ops are refused `invalid_measurement`; the mirror FK guarantees no mis-frozen slot. The window lasts the App Service swap and is disclosed, not mitigated. **O-5 accepted:** the reconcile runs in the Release-2 seed step as described; the post-deploy one-shot and the never-convert alternatives are retained in O-5 as rationale only.

### 14.4 Clean-database path, per release

| Release | `pnpm db:migrate` from `0000` | `pnpm db:seed` on the fresh account | Reconcile |
| --- | --- | --- | --- |
| R1 | runs `0013`; defaults are no-ops on empty tables | catalog **unchanged**: every entry inserts as `load_reps` / `unspecified` / `volume_counting = 'auto'`, including Plank and Farmer's Carry | none (not shipped) |
| R2 | same | the existing catalog entries for `bodyweight-plank`, `dumbbell-farmers-carry` and `machine-assisted-pull-up` gain **explicit** `measurementProfile` / `loadBasis` / `volumeCounting` in `exerciseCatalog.ts`, so a fresh seed inserts them correctly shaped | runs after seeding and finds nothing to do on a clean database; on an existing database it converts the unreferenced rows and flips the referenced carry's counting |
| R3 | same | new athletic entries (§16) with explicit profile, basis and counting | none new |

`tests/integration/testDb.ts` already migrates from the folder, so PGlite suites pick `0013` up automatically; NC-12 adds the real-PostgreSQL run through the existing opt-in env-var pattern.

### 14.5 Rollback and compatibility (rewritten against the real mechanisms)

The previous build's `setLogUpsertPayloadSchema` is `.strict()`; the client is **not** downgraded when the server is (`skipWaiting: false`). Rollback safety therefore depends entirely on what the updated client emits and on which build is serving. Under the accepted O-7 option (b) and O-13 profile-scoped emission the matrix is binding:

| Rollback | Effect | Verdict |
| --- | --- | --- |
| Release 1 → pre-`0013` build (schema stays at `0013`) | The old build inserts without the new columns; defaults fill `load_reps` / null; both composite FKs hold because every slot and exercise is `load_reps`; the Release-1 client emits today's shapes. No loss, no wedge. | **safe** |
| Release 2 → Release 1 | The Release-1 build accepts the widened set and session-exercise schemas, the two scheme variants in `setSchemeSchema` and the snapshot `measurement` key (all shipped in R1 as acceptance, §21.1), derives slot profiles, validates shapes and maps `23514`/`22003`. `load_reps` ops are byte-identical to today's; new-profile ops parse and are stored correctly. Because the Release-1 `setSchemeSchema` already knows `distanceRounds` / `durationRounds`, a template holding such a prescription still **starts** (`buildSessionExerciseUpsertPayload` → `prescriptionSnapshotSchema.parse` succeeds; `buildTodayBundle` never validated the stored scheme anyway, `today/service.ts:519`); the Release-1 workout card cannot render or log its rounds and the Release-1 editor cannot create or edit such prescriptions, so already-logged athletic sets are read-only until roll-forward. Feature degradation, no failed start, no loss. **This row is only true because R1 ships the widened scheme schema** — with the schema held back, the R2 → R1 case would be §13.2's "old client, new bundle with a `distanceRounds` prescription": the builder throws and the workout cannot start. | **safe for data; feature-degraded** |
| Release 2 → pre-`0013` build (schema stays at `0013`) | (a) Every op carrying a new key — all non-`load_reps` set ops and every session-exercise op, which now always carries `measurementProfile`/`loadBasis` — fails `.strict()` → `invalid_payload` → **permanent dead letter**; a session started on the updated client cannot sync its slots at all, and `completeSession` discards the aggregate, so those sets are lost. (b) The old build's history-correction UI renders a `duration` row as `null kg × null` and invites an edit that raises an unmapped `23514` → the whole batch fails → the outbox retries forever. | **unsupported** — recovery is roll-forward to Release 1 or later, never a second-step rollback |
| Under O-13 always-emit instead of profile-scoped | Every set op, including plain `load_reps`, carries `distanceM: null` / `durationS: null` → any rollback to a build whose schema lacks the keys dead-letters **every** set logged in the window, not only athletic ones. | the cost O-13 must weigh |
| Schema rollback | Not designed; dropping the columns would be destructive once data exists, and no down migration exists for `0000`–`0012` either. | — |

Production is untouched by this pass; `0013` runs through the same deploy path as `0011`/`0012`; no manual DML.

---

## 15. Mobile user flows (proposed)

### 15.1 Exercise create / edit

Profile select (default `load_reps`) directly under Equipment. When the profile has a load field, a Load basis select appears (`Total load`, `Per hand`, `Assistance`; the edit form also shows `Unspecified (as entered)` for migrated exercises); otherwise it is hidden and sent as null. On edit, the profile select is disabled with "Used in history or a template — create a new exercise to change how it is measured" once the lock (§10.3) applies. `Strength estimate` and `Volume counting` selects stay edit-only; `Volume counting` shows its profile-dependent default and is **replaced by a static line** ("Not available for this measurement profile") when the structural gate already refuses, as is `Strength estimate`, so the athlete never sees an enabling control for an incompatible engine. In Release 1 the profile select is present but locked to `load_reps` (§21.1).

### 15.2 Prescription editor

The scheme select offers only the variants compatible with the exercise's profile (H-4); the strategy select offers only compatible strategies (for `reps` exercises that is `manual` in v1); server `issues` are still rendered as today. Field set per §9.3: the RIR-band checkbox and baseline load are hidden where rejected. Distance `m` and duration `s` inputs are text + `inputMode="decimal"` through `sanitizeDecimalDraft` / `parseDecimalInput` with a `decimalPlaceCount <= 2` guard. Summary lines `4 × 20 m`, `3 × 60 s`.

### 15.3 Workout card (≤ 3 inputs in every profile)

| Profile | Row | Noun | Copy-forward | Prefill |
| --- | --- | --- | --- | --- |
| `load_reps` | `kg` · `reps` · `RIR` (unchanged) | Set | last set's kg + reps; RIR cleared (unchanged) | snapshot prefill / recommendation (unchanged) |
| `reps` | `reps` · `RIR` | Set | last set's reps | scheme reps |
| `load_distance` | `kg` · `m` · `s (optional)` | Round | kg + m; `s` cleared | `prefill.loadKg`, scheme `distanceM` |
| `distance_time` | `m` · `s` | Round | m; `s` cleared | scheme `distanceM` |
| `duration` | `s` | Round | `s` copied (holds are usually repeated) | scheme `durationS` |
| `load_duration` | `kg` · `s` | Round | kg + s | `prefill.loadKg`, scheme `durationS` |

- Every input gains an `aria-label` (`Weight in kilograms`, `Repetitions`, `Reps in reserve`, `Distance in metres`, `Time in seconds`); the visible short unit label stays. The three e2e specs that address inputs positionally keep working because column order for `load_reps` is unchanged.
- `validateSetInput` gains the profile's required/optional rules and a `decimalPlaceCount <= 2` guard on `m` and `s`; `kg` keeps today's range-only validation (O-15, accepted), so nothing the card accepts can be refused at the wire for precision.
- Duration display (O-8, accepted): the input is seconds with up to two decimals; a logged or prefilled value ≥ 60 s is additionally shown as `m:ss` beside the seconds figure (`90 s · 1:30`); storage and the wire are always seconds.
- Warm-up toggle available in every profile (a light sled push is a warm-up round); every consumer ignores warm-ups as today.
- Partial attempts: log what happened (15 m of a prescribed 20 m; 40 s of a 60 s hold). No `partial` / `failed` flag; the prescribed target is visible on the card and in history through the snapshot scheme, so the shortfall is readable without a new fact (N-5).
- Optional time on `load_distance`: placeholder `—` like RIR today; omitted → null.
- A refused set is marked on the card per §13.4 / O-16.
- Validation copy in the tone of `RecommendationCard.tsx:84`: "Enter a distance in metres", "Enter a time in seconds".
- The `Strength estimate` link renders only when the structural gate passes.
- Narrow phones: the current three-column row fits at 320 px inside `max-w-sm`; no profile needs a fourth column, and the RIR column is dropped where forbidden, so the widest new row (`kg · m · s`) has today's budget.

### 15.4 Previous performance and history

One shared pure formatter `formatSetLine(profile, loadBasis, set)` in `src/domain/measurement/format.ts` replaces the inline templates (`ExerciseCard.tsx:423-429`, `HistoryDetail.tsx:255-261`, bundle-rendered previous sets):

`80 kg × 8 @ RIR 2` · `30 kg/hand × 8` · `35 kg assist × 8` · `12 reps` · `60 kg · 20 m · 12.4 s` · `40 m · 5.62 s` · `45 s` · `20 kg · 45 s`

`formatGoverningSet` in `src/ui/strength/format.ts` stays load-only (it only ever sees `load_reps`). History detail shows the frozen profile and basis labels from the typed columns; the correction form renders the same profile-specific inputs as the card with the same decimal guard. No derived speed or pace is shown anywhere in v1 (O-9, accepted); nothing derived is stored (H-13).

### 15.5 Units

kg / m / s, fixed. No preference, no conversion, no imperial input (N-8). Duration is entered in seconds with decimals; values ≥ 60 s are additionally displayed as `m:ss` (O-8, accepted); storage is always seconds.

---

## 16. Athletic catalog expansion (Release 3, separated from the foundation)

Minimum metadata per catalog entry before any athletic movement is seeded: `slug`, `name`, `equipment` (existing vocabulary — sleds and med-balls `other`, carries `dumbbell` or `other`, sprints / jumps / planks `bodyweight`), `mechanics`, `laterality`, **`measurementProfile`**, **`loadBasis`** (required iff the profile has load), **`volumeCounting`**, `contributions` (≥ 1 primary leaf, ADR-010, authored and reviewed per entry). `strengthEstimate` is omitted: the structural gate decides. No `loadStepKg` (unchanged: by equipment).

**Scope of "required" for `volumeCounting`.** The `SeedCatalogExercise` type keeps `volumeCounting?` **optional**, following the `strengthEstimate?` precedent (`exerciseCatalog.ts:14-32`); an omitted value means the service's profile-dependent default (§11.4). It is **required by authoring rule, not by type, for every new athletic entry added in Release 3** — the ten below all state it explicitly, and every athletic `load_reps` / `reps` entry states `'off'`. The ~90 existing `load_reps` catalog entries are **not** touched: they keep the optional/default precedent unless individually converted. The only existing entries that gain explicit values are the three legacy ones in the Release-2 catalog edit (§14.4). A unit test in Release 3 asserts that every catalog entry whose slug is in the athletic list carries an explicit `volumeCounting`.

Seeding stays deterministic and idempotent through the ledger and `slugToUuid`; new slugs are new catalog items. The ten slugs and shapes **adopted under O-10(i)** (binding for Release 3): `other-sled-push` (`load_distance`/`total`), `other-sled-drag` (`load_distance`/`total`), `other-farmers-carry` (`load_distance`/`per_hand`; distinct from the legacy `dumbbell-farmers-carry`), `dumbbell-suitcase-carry` (`load_distance`/`per_hand`, unilateral), `bodyweight-sprint` (`distance_time`), `bodyweight-shuttle-run` (`distance_time`), `other-med-ball-slam` (`load_reps`/`total`, `volumeCounting: off`), `bodyweight-broad-jump` (`reps`, `volumeCounting: off`), `bodyweight-box-jump` (`reps`, `volumeCounting: off`), `bodyweight-side-plank` (`duration`, unilateral). Their muscle contributions are **not** supplied here; O-10(ii) (accepted) defers them to a Release-3 gate that approves the authored, leaf-only list before any of the ten is seeded. No progression heuristics, landmarks or default schemes are designed for any of them (N-3).

---

## 17. Rejected alternatives

| Id | Alternative | Reason |
| --- | --- | --- |
| X-1 | Profile values inside `strength_estimate` (the reserved D-11 room) | Mixes shape with override; an override column could then express an impossible enabling state (§11.5) |
| X-2 | Capability booleans on the exercise (`e1rm`, `progression`, `volume`) | PI-005 rejects it; combinable into invalid states; capabilities are derivable (§11.1) |
| X-3 | New `attempt_logs` table for non-rep profiles | Splits one ordered list into two tables; duplicates renumbering, sync, corrections, history; every consumer joins twice |
| X-4 | `measurement jsonb` on `set_logs` | Facts lose CHECK, precision, indexability, plain SQL (§5.2 D) |
| X-5 | Per-profile fact tables (`carry_logs`, `sprint_logs`) | X-3 multiplied by the profile count |
| X-6 | Infer `load_basis` from `equipment` at migration | Forbidden by PI-005; `dumbbell`/`machine` are genuinely ambiguous (§7.1) |
| X-7 | Bump `PrescriptionSnapshot` to `v = 2` | Breaks every old client on every new snapshot instead of only on new-profile ones (§8.7, §13.2) |
| X-8 | *(withdrawn)* Never send the profile on the `sessionExercise` payload | Withdrawn: the ad-hoc offline-edit case (§10.2) needs the client's frozen profile for the server to detect disagreement; the keys are optional, always emitted by the fixed-shape builder, and covered by NC-1 |
| X-9 | Allow profile change with history because snapshots protect rows | Breaks every per-exercise series (§10.3) |
| X-10 | A `none` progression mode beside `manual` | Same state twice (§9.2) |
| X-11 | Volume override on the prescription | Mixed counting conventions for one muscle across templates (§11.4) |
| X-12 | Per-side set rows for unilateral exercises | Doubles set counts, changes `set_number` semantics (§7.2) |
| X-13 | Bundle version / client-version header | Not needed by any case in §13.2; imposes a refresh policy the app does not have |
| X-14 | Storing derived speed / pace | Violates the no-persisted-derivation posture (H-13) and PI-005's "not stored twice" |
| X-15 | Making `load_step_kg` nullable for load-less profiles | Touches `defaultConfigFor` and prefill rounding for no user-visible benefit (§8.1) |
| X-16 | Converting the seeded Farmer's Carry regardless of history | Destructive reinterpretation of logged rows (§14.3) |
| X-17 | Unit preference / imperial storage | Out of scope for a single kg-first user; conversion is a later display concern (N-8) |
| X-18 | `distance` profile with optional load and optional time instead of `load_distance` + `distance_time` | A sprint without a time is not an attempt, a carry without a time is; one profile cannot express both required-ness rules |
| X-19 | A persisted `UNSUPPORTED_MEASUREMENT_PROFILE` recommendation draft for non-`load_reps` slots | Unwritable without widening `performedSetSchema` / `InputsSummary` and the closed `REASON_CODES`; `continue` matches `manual` and unparseable-config behaviour and there is nothing to tell the athlete about an exercise the engine was never allowed to evaluate (§11.3) |
| X-20 | Rep-progression on the `reps` profile in v1 | Needs `weightKg` nullable in `performedSetSchema` or a `0` coercion; deferred (§9.2, N-13) |
| X-21 | Locking the exercise profile at first ad-hoc add instead of carrying it on the payload | Does not cover an edit made before the queued add reaches the server (§10.2) |
| X-22 | `distance_m numeric(8,2)` to allow 100 km | No use case; `99999.99` m already allows a 99.99 km carry and keeps the wire bound equal to the storage ceiling (§6.1) |

---

## 18. Binding invariants and non-goals

### 18.1 Invariants (proposed as binding for implementation)

- **I-1** A set row's field set is decided by its `measurement_profile` alone; the database proves it (`ck_set_logs_profile_shape`) and the row's profile equals its parent slot's (composite FK).
- **I-2** No existing set, prescription, snapshot or recommendation row changes value or meaning; every existing row maps to `load_reps` / `unspecified`.
- **I-3** A slot's profile and basis are frozen at session start (or ad-hoc add) in typed columns and never updated. The **profile** freeze is enforced by the database (the set-level composite FK refuses a parent update with children present); the **basis** freeze is a service rule (no update path writes `session_exercises.load_basis`; the payload key is never read, §12.2) — `load_basis` is in no constraint because the exercise-level basis must stay editable. The slot's profile equals its exercise's at write time and the exercise's profile cannot change while any slot references it — enforced by the mirror FK (O-14, accepted); the `exercise_prescriptions` half of the lock is a service rule (O-3, accepted).
- **I-4** No arithmetic is applied to `weight_kg` because of `load_basis`; no value is derived and stored.
- **I-5** Every automated consumer refuses structurally before consulting any per-exercise switch; a switch can never enable a structurally incompatible consumer, and for a compatible profile it may take either value.
- **I-6** `recommendations`, its Zod schemas (`performedSetSchema`, `inputsSummarySchema`, `recommendationTargetSchema`), `REASON_CODES`, strategy versions, e1RM constants and algorithm version, `SYNC_ENTITIES`, `SYNC_OPERATIONS`, `MAX_OPS_PER_BATCH`, the envelope, `workoutSessionUpsertPayloadSchema`, and the recommendation, decision and delete payload schemas are unchanged. The only payload schemas that change are `setLogUpsertPayloadSchema` and `sessionExerciseUpsertPayloadSchema` (§12.2); the only change to the reject vocabulary is the two added `SyncRejectReason` members `invalid_measurement` and `measurement_profile_mismatch` (§12.2), both dead-letter reasons.
- **I-7** Every full-row emitter carries a fixed key set — `workoutSessionFullRowOp` and `sessionExerciseFullRowOp` their complete field lists, `setLogFullRowOp` and the renumber upserts the profile-independent keys plus the frozen profile's permitted keys (O-13); a test proves it for all three (NC-1).
- **I-8** The server validates the effective row against the profile and the bounds before writing, and maps `23514` and `22003` to `invalid_measurement`; every wire ceiling is at or below its column's storage ceiling; no op can fail a whole batch by CHECK violation or numeric overflow.
- **I-9** Client bundle and aggregate reads treat an absent `measurement` as `load_reps` / `unspecified`; no new required client field; no new required REST field (`createExerciseSchema` defaults).
- **I-10** `src/domain/measurement/**` imports nothing outside itself; `domain/strength`, `domain/progression`, `domain/volume`, `domain/metrics` may import it; it may not import any of them. The three boundary tests are extended accordingly.
- **I-11** Migration `0013` is additive, keeps its defaults, contains no `UPDATE`/`DELETE`, and re-runs idempotently; the seed reconcile is state-predicated, id-keyed, and ships in Release 2, never in Release 1.
- **I-12** The word "set" in storage and code is profile-independent; only copy varies.
- **I-13** At every SQL→domain boundary that produces a numeric domain input (`getWorkSetsByExercise` and the engine history window, `buildClientRecommendationOps`, the strength `queryFactRows`, `queryWorkSetContributionRows`), rows whose frozen slot profile the consumer cannot consume are excluded **before** mapping, and a null load or rep count is never coerced to `0` or `1`; display DTOs (`HistorySetDto`, `HistorySetDetail`, `ActiveSessionSetDto`) carry `number | null` instead. `evaluateSession` skips non-`load_reps` slots by `continue`, producing no row.
- **I-14** The slot-profile derivation on `sessionExercise` insert is a user-scoped select; a missing or foreign exercise rejects `invalid_reference`; the column default is never a fallback; a payload `measurementProfile` that disagrees rejects `measurement_profile_mismatch`; the payload `loadBasis` is **never compared and never written** — the slot's basis is always the live exercise row's value at insert.

### 18.2 Non-goals (deferred, with the trigger that would reopen each)

- **N-1** Velocity / power / bar-speed sensors — no profile; reopen with a device-integration requirement.
- **N-2** GPS or wearable import — no ingestion path; reopen with a concrete source.
- **N-3** Automatic coaching, progression heuristics or landmarks for athletic profiles — reopen as a strategy design with its own evidence gate (ADR-006 registration).
- **N-4** Personal records / bests per profile — reopen after one block of athletic logging; design on read only (H-13).
- **N-5** Partial / failed attempt flags — reopen if history review shows shortfall is not readable from target + actual.
- **N-6** Cross-profile rankings, scores, or conversions between load, reps, distance, time and "volume" — permanently out; no evidence basis.
- **N-7** Calorie or energy estimation — out.
- **N-8** Unit preferences, imperial storage, conversion — reopen with a second user or an explicit request.
- **N-9** Custom formulas or user-defined profiles — out (ADR-008 anti-DSL line).
- **N-10** Recovery / readiness logic — untouched; the recovery module never reads set rows.
- **N-11** Per-side facts for unilateral work — reopen with an asymmetry-tracking requirement.
- **N-12** Jump-height / throw-distance profiles, reps-in-fixed-time, loaded sprints — additive later; not designed (§5.3).
- **N-13** Distance/time progression strategies, rep-progression for the `reps` profile, distance/duration deload modifiers, and Metrics cards for athletic profiles — Release 4 candidates, each with its own evaluation and, where needed, an explicit I-6 amendment.
- **N-14** e1RM Release B — not part of this work; §21.5 states when it becomes safe.
- **N-15** Export surfaces — none exist in the repository; nothing to design.

---

## 19. Risks, ranked

| Rank | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R-1 | A key-short or key-variable full-row builder breaks presence semantics for `setLog`, or re-opens W-1 / MEDIUM-1 (H-7) for `workoutSession` / `sessionExercise` once `sessionExerciseFullRowOp` gains two keys | High | I-7 + NC-1 across all three builders; hydration normalisation; correction builder |
| R-2 | An unmapped SQLSTATE (`23514`, `22003`) poisons an outbox batch (whole request fails, infinite retry, H-17) | High | I-8 + NC-3 / NC-4 boundary rows; wire ceilings equal storage ceilings |
| R-3 | Rollback from Release 2 to a pre-`0013` build loses athletic sets and can wedge the outbox (§14.5) | High if attempted | declared unsupported; O-7 option (b) makes Release 2 → Release 1 safe; NC-13 |
| R-4 | Composite-FK / CHECK semantics differ between PGlite and server PostgreSQL | Medium | NC-5, NC-12 on Docker PostgreSQL via the `*_CONCURRENCY_DATABASE_URL` pattern |
| R-5 | Old JS after deploy fails at `startSession` on a new-profile template with an unhandled throw and no message | Medium | surface the parse failure as "Update the app to start this workout"; the ServiceWorkerUpdater prompt; A-25 |
| R-6 | A migrated `load_reps` exercise the athlete wants as `load_distance` (Farmer's Carry with history) cannot be converted; two exercises for one movement | Medium (product) | explicit copy, distinct catalog slug, `volume_counting = 'off'` for the legacy row, O-5 |
| R-7 | A `?? 0` coalesce survives at a SQL→domain boundary and fabricates a bodyweight-only set | Medium | I-13 (explicit null skip, §11.3 site 3); NC-10's output-equality and mapped-row-count assertions |
| R-8 | Drizzle renders a composite FK or the long CHECK incorrectly; snapshot drift after hand edits | Medium | NC-12 `db:generate` no-op check; precedent comments |
| R-9 | The Release-2 deploy window (reconcile before swap) exposes Plank / Farmer's Carry to a Release-1 client for a few minutes | Low (accepted under O-5) | server-side validation refuses shape-wrong sets; mirror FK; disclosed in the Release-2 implementation report |
| R-10 | `unspecified` basis lingers on every migrated exercise | Low (display only) | edit-form nudge; no behaviour depends on it |
| R-11 | Bundle size growth per exercise entry | Low | two short fields; measured in the implementation report |

---

## 20. Acceptance criteria

Unit (`tests/unit`):
- **A-1** `dimensionsOf` is exhaustive over `MEASUREMENT_PROFILES` and every field (type-level `satisfies` plus a runtime table test).
- **A-2** Set validation: for each profile, every required / optional / forbidden case of §6.2 accepts or rejects as tabulated, including zero and null; per numeric column the exact ceiling is accepted and ceiling + 0.01 rejected; a three-decimal `m` or `s` entry is refused by `validateSetInput` at the input, while a three-decimal `kg` entry is still accepted and rounded by the column exactly as today (O-15, accepted).
- **A-3** `profileSupportsScheme`, `strategySupportsProfile` and `supportsScheme` reproduce §9.2 completely (including `reps` → `manual` only, and the `distanceRounds` / `durationRounds` columns — executable in Release 1 because R1 ships the widened `setSchemeSchema`, §21.1); `checkPrescriptionCompatibility` reports both issue kinds; §9.3 field rules. *(R1)*
- **A-4** `evaluateExerciseEligibility` ordering profile → basis → equipment → switch, each code tested with the later gates deliberately failing too; both new codes are members of `STRENGTH_REASON_CODES` and not of `RELEASE_B_ONLY_REASON_CODES`.
- **A-5a** NC-1 (the two W-1 builders and the server key lists), NC-9, NC-10, NC-11 (unit halves). *(R1)*
- **A-5b** NC-1 (client `setLog` emission per profile), NC-13. *(R2)*
- **A-6a** `formatScheme` renders the two new variants (`4 × 20 m`, `3 × 60 s`) and still renders `fixed` / `repRange` unchanged — required in Release 1 because the four-member union makes the current fall-through branch (`setScheme.ts:69-72`) fail `pnpm typecheck`; `formatSetLine` in `src/domain/measurement/format.ts` renders the eight example lines of §15.4 and the `m:ss` secondary form for durations ≥ 60 s (O-8). *(R1)*
- **A-6b** The workout card, history detail and previous-performance rows render those lines through the shared formatters, never through an inline template. *(R2)*
- **A-7** Snapshot parse: a v1 snapshot without `measurement` parses and is treated as `load_reps`; one with `measurement` round-trips; an unknown scheme variant is rejected.
- **A-8** Boundary tests extended for `src/domain/measurement/**` (I-10) with anti-vacuity witnesses.

Integration (PGlite):
- **A-9a** NC-2, NC-3, NC-4 (service half), NC-14. *(R1)*
- **A-9b** NC-6, NC-7. *(R2)*
- **A-10** Exercise create/update: `POST` without `measurementProfile` → `load_reps` / `unspecified`; basis presence rule; lock returns 409 once referenced (and the mirror FK's `23503` maps to the same error when the service check is stubbed); `load_basis` edit allowed with history; `volume_counting` profile-dependent default and both values on a compatible profile.
- **A-11a** Prescription write-side gate, through the API: on a `load_reps` exercise every existing pair behaves as today; a `distanceRounds` / `durationRounds` scheme on a `load_reps` exercise → `400 incompatible_prescription`; on a hand-built non-`load_reps` exercise (created through the API, since the R1 selector is locked) only the §9.2 pairs succeed, `targetRir` / `baselineLoadKg` are rejected per §9.3, and a PATCH changing `exerciseId` across profiles is caught. This is what makes §21.1's "no prescription can be created with a new variant" true and keeps a `distanceRounds` scheme out of `recommendations.inputs.prescribed` (I-6). *(R1)*
- **A-11b** The same rules surfaced through the editor: the scheme and strategy selects offer only compatible options, and server `issues` render as today. *(R2)*
- **A-12** Today bundle: `measurement` per entry; history DTOs carry nulls and new fields; carry-forward on `load_distance` uses the first non-warm-up round's load; `prefill.loadKg` and `prefill.reps` are null where the profile or the scheme variant has no such dimension (`schemeDefaultReps` returns null for `distanceRounds` / `durationRounds` — executable in R1 because the variants exist in the schema; the fixture inserts such a prescription row directly, since the R1 editor does not offer it). *(R1)*
- **A-13** History read / correct / delete on a `load_distance` slot; renumbering preserves distance and duration.
- **A-14** Volume: `load_distance` sets excluded; a **hand-built `reps` exercise** (created through `createExercise` without `volumeCounting`, so it takes the profile-dependent default — no seeded slug, since no athletic catalog entry exists before R3) is excluded by default; the same exercise set to `'auto'` counts; `volume_counting = 'off'` excludes a `load_reps` exercise; every other number unchanged against existing fixtures. *(R1)* In R3, A-17 additionally asserts the seeded `bodyweight-box-jump` carries `'off'`.
- **A-15** Strength: `load_distance` and `assistance` refuse with the new codes; the Release-2 reconcile is idempotent and state-predicated; **the assisted pull-up's refusal code is `EXERCISE_ESTIMATE_DISABLED` before the reconcile and `LOAD_BASIS_UNSUPPORTED` after it** (asserted on both sides); every other existing strength fixture unchanged.
- **A-16** Metrics: selection rejects new-profile exercises; retained rows show `not_available`; Training-card rule per O-6.
- **A-17** Seed, per release (§14.4): in R1 a fresh seed inserts every catalog entry as `load_reps`; in R2 the three legacy entries seed with their explicit values and the reconcile is a no-op on a clean database and converts only unreferenced rows on a populated one; in R3 the new entries seed with explicit profile, basis and counting; reseed is a no-op in every release.
- **A-18** Sync: `sessionExercise` upsert with a foreign or missing `exerciseId` → `invalid_reference`, no row; with a disagreeing `measurementProfile` → `measurement_profile_mismatch`; with a disagreeing `loadBasis` only → **applies**, and the stored slot basis equals the live exercise row's (NC-14); without the keys → derived silently; profile-scoped creation-required fields (a `duration` create without `weightKg` applies; a `load_reps` create without `reps` → `missing_required_fields`); both new reject reasons appear as `deadReason` on the sync-issues screen. *(R1)*

Real PostgreSQL (Docker, opt-in env var, same pattern as the concurrency suites):
- **A-19** NC-5, NC-12; `pnpm db:migrate` on a prod-shaped dump then `pnpm db:generate` → no drift.
- **A-20** Concurrent renumbering on a `load_distance` slot under the deferrable constraint and both composite FKs (extend the PG concurrency suites).

E2E (Playwright, 390×844 and 320×568):
- **A-21** Create a sled push (`load_distance`/`total`), prescribe `4 × 20 m`, log three rounds (one without time), edit one, delete one, complete; history shows the §15.4 lines and the frozen labels.
- **A-22** Sprint (`distance_time`) and plank (`duration`) flows; RIR column absent; `document.documentElement.scrollWidth <= viewport width`.
- **A-23** Offline: log new-profile rounds offline, reload, reconnect → exactly-once convergence (extend `offline-sync.spec.ts`); an injected nine-key op on a `load_distance` slot dead-letters with payload intact **and the card marks the set per O-16** (extend `dead-letter.spec.ts`).
- **A-24** Legacy cached bundle (fixture without `measurement`) starts and logs a `load_reps` session identically (extend the legacy-bundle pattern in `offline-bodyweight-recovery.spec.ts`).

Device (iPhone, the existing acceptance-checklist format):
- **A-25** The A-21 / A-22 flows on the phone: keyboard type per input (decimal for kg / m / s, numeric for reps / RIR), tap targets ≥ 44 px, VoiceOver reads each input's accessible name, the update prompt appears for a stale service worker, and a refused set is visibly marked per O-16.

---

## 21. Phased delivery and review sequence

### 21.1 Release 1 — foundation, dark (O-7 option (b), accepted)

Ships: migration `0013` (all columns, CHECKs, both composite FKs, defaults kept); `src/domain/measurement/*` (vocabulary, dimensions, compatibility, capabilities, format); `createExerciseSchema` / `updateExerciseSchema` fields with defaults, the §10.3 lock and the profile-dependent `volume_counting` default; the **profile selector present but locked to `load_reps`** and **no new scheme variant offered in the editor**; the read-side gates (I-13 boundaries, the eligibility gate with O-17's accepted codes and ordering, volume filter); the **prescription write-side gate** — `checkPrescriptionCompatibility`'s profile argument, `createPrescriptionSchema` / `updatePrescriptionSchema` acceptance of the two variants, `supportsScheme` as a real table, and §9.3's per-profile field rules — which is what keeps a new variant out of every prescription and every `recommendations.inputs.prescribed` while the schema already accepts it; server-side slot-profile derivation with the user-scoped select and the profile-only comparison (I-14); **acceptance-side widening of every shared contract**: the `setLog` and `sessionExercise` payload schemas with profile-scoped creation-required fields, effective-row validation and the `23514`/`22003` mapping; the two scheme variants in `setSchemeSchema` with `formatScheme` extended to render them (the widened union does not typecheck otherwise); the snapshot `measurement` key in `prescriptionSnapshotDataSchema`; `schemeDefaultReps` widened to `number | null` — all of these live in `src/domain/**`, which server, sync and UI import alike, so they reach the client bundle too, while the client's emitters, DTO types, IndexedDB shapes and the editor's offered options are unchanged; `formatSetLine` in the new domain module; boundary tests; NC-1 (the two W-1 builders and the server key lists), NC-2…NC-5, NC-9…NC-12, NC-14; A-1…A-4, A-5a, A-6a, A-7, A-8, A-9a, A-10, A-11a, A-12, A-14, A-17 (R1 row), A-18, A-19.

Does **not** ship: client emission of any new key, DTO widening on the client, the seed reconcile, catalog edits, scheme variants **in the editor**, logging UI. Every existing unit / integration / e2e suite passes unmodified except for DTO-shape fixtures. **What an athlete can observe in Release 1: nothing** — every exercise is `load_reps`, every gate returns today's answer, every set op is byte-identical, no prescription can be created with a new variant, and no refusal code changes (the assisted pull-up's basis is still `unspecified`, and O-17's placement only matters once a non-`load_reps` exercise exists).

Must-not-change: everything in I-6.

Review gate: independent review of the migration on Docker PostgreSQL, the mirror-FK and boundary-row probes, NC-13's rollback matrix, and the byte-identical bundle / replay controls.

### 21.2 Release 2 — profile-aware prescription, logging, history, offline, reconcile

Ships: client emission per O-13 with hydration normalisation; `ActiveSessionSetDto` / bundle / history DTO widening on the client; the scheme variants **offered in the editor** (the schema already knows them from R1); the unlocked profile and basis selects; workout card and history renderers per §15 with the decimal guards; the correction builder; the O-16 refusal surfacing (accepted); the O-6 Training-card caption (accepted — this is the first release in which a non-`load_reps` attempt can exist); the Release-2 catalog edit for the three legacy entries and the seed reconcile (§14.3, O-5 accepted, with its disclosed deploy window); NC-6, NC-7, NC-8, NC-13, NC-1's client half; A-5b, A-6b, A-9b, A-11b, A-13, A-15, A-16, A-17 (R2 row), A-20…A-25. Must-not-change: schema (no migration), the server-side sync contract (already landed), engine, tracker arithmetic.

Review gate: device acceptance on iPhone, offline specs, accessible names, the reconcile's before/after refusal-code assertion.

### 21.3 Release 3 — seeded athletic catalog

Catalog entries per §16 (the ten slugs and shapes adopted under O-10(i); their muscle contributions approved at the Release-3 authored-list gate — O-10(ii) accepted — so no entry is seeded before its contributions pass that gate); A-17 (R3 row). Must-not-change: schema, sync, consumers.

### 21.4 Release 4 — later, each with its own evaluation

Distance/time strategies and rep-progression for `reps` (with the `InputsSummary` widening and an explicit I-6 amendment), distance/duration deload modifiers, profile-appropriate records, dashboard cards, D-3 bodyweight-inclusive estimation on top of `load_basis`.

### 21.5 When e1RM Release B becomes safe

After Release 1 is deployed and verified. Release B's suggestion then reads the same structural gate (`evaluateExerciseEligibility` with profile and basis) and can only fill the weight input on a `load_reps` slot; its own gate (one block of tracker use, fire-rate prototype) is unchanged. Shipping Release B **before** Release 1 would leave it keyed on equipment alone and able to suggest a load for a carry; shipping it between Release 1 and 2 is fine.

### 21.6 Performance

One existing query gains a join, whose measured cost is nil (§28, L-9): `queryWorkSetContributionRows` gains an `INNER JOIN exercises` to project `volume_counting`, measured at `0.478 ms` vs `0.538 ms` without it — an index scan against the new `uq_exercises_id_profile` index. Otherwise: two small unique indexes; two nullable numeric columns; a few extra projected columns in existing queries; the bundle grows by roughly 40 bytes per exercise entry. The implementation report should re-run `scripts/metricsPerformanceFixture.ts` and the dashboard latency measurement in the same local-Docker terms the dashboard evaluation used, and show no regression.

---

## 22. Owner decisions — all accepted as recommended on 2026-09-07

Every row below was **accepted exactly as its recommendation states** (§0.1). The "Recommendation" column is therefore the binding outcome; the "Trade-off" column and the alternatives named in the "Decision" column are retained as historical rationale and are not open.

| Id | Decision (alternatives retained as rationale) | Recommendation = accepted outcome | Trade-off (rationale) |
| --- | --- | --- | --- |
| O-1 | Include `load_duration` in the v1 vocabulary (six profiles) or ship five and add it later | Include | One more CHECK branch and card layout now, versus a second migration and CHECK rewrite later; weighted holds are common |
| O-2 | Include `load_basis` in Release 1 or defer it to ADR-011 D-3 | Include now | The frozen slot column is the expensive half; deferring means widening twice. Cost: one more select and a permanent `unspecified` value |
| O-3 | Lock the profile once referenced (create a new exercise to change it) versus allow with a warning | Lock | Protects every per-exercise series; with O-14 half of it is a database guarantee; price is R-6 |
| O-4(i) | Add the exercise-level `volume_counting` switch in v1 | Add | Needed for the PI-005 med-ball example and for the legacy carry; same pattern as `strength_estimate` |
| O-4(ii) | Creation default of `volume_counting` for the `reps` profile: `'off'` (fail closed; athlete may enable per exercise) or `'auto'` | `'off'` | PI-005 requires athletic attempts excluded by default and intent is not modelled, so a jump and a push-up share the profile; the cost is one extra tap for athletes who want bodyweight `reps` exercises counted |
| O-5 | The seeded-exercise profile reconcile: run it in Release 2 (unreferenced Plank / Farmer's Carry converted, referenced carry gets `volume_counting = 'off'`, assisted pull-up gets `assistance`) inside the seed step with its disclosed deploy window; run it as a post-deploy one-shot; or never convert seeded rows and rely on new catalog slugs only | Release 2, seed step | Seed-step keeps the established pipeline and the window is minutes on a single-user app; post-deploy one-shot removes the window at the cost of a new deploy step; never-convert leaves a mis-shaped Plank in every fresh account until R3 |
| O-6 | Metrics Training card: count every non-warm-up attempt of every profile, or only `load_reps` / `reps` | Count all; caption becomes `Completed workouts only. Warm-up sets not counted. Every exercise type counts as a set.` | "Work sets" is an activity count there; excluding rounds makes a sled session look like a rest day. Counterpoint: the current caption implies resistance sets, and `volume-model.md` §1's "Work set" wording is touched either way (§24) |
| O-7 | Release 1 shape: (a) columns-only dark; (b) columns + **server-side** contract acceptance dark, client emission in Release 2; (c) combined foundation + UI | (b) | (a): Release 2 → Release 1 rollback dead-letters every session-exercise op and every athletic set op (the R1 server's schemas are strict and lack the keys); (b): Release 2 → Release 1 is data-safe and feature-degraded, R1 → pre-`0013` is safe, and the server-side acceptance is exercised by NC-2…NC-4 and by unchanged production `load_reps` traffic; (c): any rollback is to a pre-`0013` build, which is BLOCKER-3 in full (§14.5) |
| O-8 | Duration entry and display: seconds only, or seconds entry with `m:ss` display ≥ 60 s | Seconds entry, `m:ss` secondary display | Seconds keeps one input and no parser; `m:ss` helps long holds. A `m:ss` *input* is rejected for v1 either way |
| O-9 | Show derived speed for the distance profiles in history detail | No in v1 | Facts only keeps the surface honest; speed is one division away and needs no schema change later |
| O-10(i) | Adopt the ten Release-3 slugs and shapes in §16 | Adopt | Answerable now; shapes are fixed by §5.3 |
| O-10(ii) | Approve each entry's muscle contributions (ADR-010: authored, leaf-only, reviewed) | Defer to a Release-3 gate with the authored list in hand | The main cost of the catalog is invisible until the contributions are written |
| O-11 | Allow optional RIR on the `reps` profile | Allow | Push-ups and dips to a rep target have real RIR; jumps leave it blank. Forbidding it would need a seventh profile |
| O-12 | Unilateral convention: one row per set (both sides), stated in copy, no per-side field | Adopt | Zero schema; asymmetry tracking deferred (N-11) |
| O-13 | Emission rule for the set payload: profile-scoped full rows (omit forbidden keys) or always emit all eleven keys with nulls | Profile-scoped | Profile-scoped keeps every `load_reps` op byte-identical to today's, which is what makes any rollback safe for conventional logging and keeps D-03 presence semantics; always-emit makes every set op unparseable by any build whose schema lacks the keys (§14.5) for a uniformity that `setLog`'s replay path (which never uses the W-1 gate) does not need |
| O-14 | Add the mirror composite FK `session_exercises (exercise_id, measurement_profile) → exercises (id, measurement_profile)` | Add | Makes slot↔exercise agreement and the slot half of the profile lock database guarantees and makes an old build's mis-frozen slot fail loudly during a deploy window; cost is one unique index on `exercises` and one more constraint drizzle must render correctly (NC-12) |
| O-15 | Tighten `weightKg` to two decimals on the wire (`multipleOf(0.01)`) — and if so, ship the matching `validateSetInput` / history-correction guard in the same release — or leave the wire rule unchanged (the column rounds silently, as today) | Leave unchanged in v1 | Tightening without the guard turns today's accepted `62.505` into a permanent dead letter; with the guard it is a small UI change plus e2e coverage, but it is unrelated to profiles and can ship separately |
| O-16 | What the athlete sees when a set or slot op is refused: extend the blocked/banner mechanism to `setLog` / `sessionExercise` dead letters of the active session (card mark + banner + completion confirm), or accept silent loss with a sync-issues row only | Extend | PI-005 asks for clear UI guidance on fail-closed; the change is additive to `refreshSessionBlocked`; the alternative must be documented as accepted loss |
| O-17 | The §11.6 amendment of ADR-011 / the e1RM revision: (a) accept as written — add `MEASUREMENT_PROFILE_UNSUPPORTED` and `LOAD_BASIS_UNSUPPORTED` to the closed enum and reorder the refusal list to profile → basis → equipment → switch; (b) add the two codes but keep "category code wins" (equipment → profile → basis → switch); (c) add no codes — refuse profile-ineligible and assistance exercises under the existing `EXERCISE_CATEGORY_UNSUPPORTED` | (a) | (a) gives the truest explanation (a `duration` Plank is refused for its shape, not its equipment) at the cost of amending two owner-accepted binding clauses (§9.6 order, §15.4 enum / I-14 / A-19); (b) keeps the accepted order but shows "equipment" copy for a bodyweight sled-free Plank only when equipment also fails, and the shape code otherwise — two amendments of one clause; (c) amends nothing but tells the athlete "not available for this equipment type" for a barbell-equipment carry, which is false. The structural gate is identical under all three; only copy and the enum differ |

---

## 23. Summary of what changes and what does not

Changes: three tables gain typed enum columns and two unique pairs; `session_exercises` gains a mirror composite FK to `exercises`; `set_logs` gains two nullable numeric columns and drops two NOT NULLs behind a shape CHECK and a composite FK; `setSchemeSchema` gains two variants; `PrescriptionSnapshot` gains one optional key at `v = 1`; `setLogUpsertPayloadSchema` gains two nullable-optional keys and widens two, `sessionExerciseUpsertPayloadSchema` gains two optional keys; the replay maps two more SQLSTATEs and validates effective rows; one new domain module; eligibility gates and no-coercion boundaries in progression, strength, volume, metrics and today; two new tracker refusal codes and the profile → basis → equipment → switch order under an explicit ADR-011 amendment (O-17, accepted); profile-specific inputs and lines in the workout, prescription, history and exercise forms; a Release-2 seed reconcile and catalog edit and, later, a catalog extension.

Does not change: any existing row's value; `recommendations`, its schemas and its reason-code enum; any strategy or the tracker's arithmetic; the sync entities, operations, envelope, batch size, replay order, idempotence mechanism and supersession-gate semantics; the IndexedDB version; service-worker caching; warm-up routines; recovery; the dashboard selection table.

---

## 24. Documentation checklist, by release (binding)

The production-state architecture documents are **not** updated by this evaluation or by the owner-decision integration. Each amendment below lands **in the same commit as the code it describes**, in the release named, and is a review-gate item for that release. Nothing in this table is done today.

### 24.1 Release 1 commit (migration `0013`, domain module, gates, acceptance-side widening)

| Document | Amendment | Decision it records |
| --- | --- | --- |
| `docs/architecture/data-model.md` §2.4, §2.13, §2.14 | three tables, seven new columns (`strength_estimate` is also missing from §2.4 today), two dropped NOT NULLs, two unique pairs, two composite FKs, the shape CHECK, the "no separate enum CHECK on `set_logs`" note, the permanent defaults | O-1, O-2, O-4(i), O-14 |
| `docs/architecture/domain-model.md` §7, §9, §10 | the mutability table gains the one field the "all metadata mutable" policy does not apply to (`measurement_profile`, locked once referenced — database-enforced for slots, service-enforced for prescriptions); §10 gains I-1, I-3, I-13 and I-14 as invariants | O-3, O-14 |
| `docs/architecture/volume-model.md` §1 (the "Work set" definition, `:13`) and §2 (aggregation pseudocode) | Work set = `isWarmup = false`, session not `discarded`, **and** the slot's frozen `measurement_profile ∈ {load_reps, reps}` **and** the exercise's `volume_counting = 'auto'`; the `reps` creation default `'off'`; a note that the Metrics Training card's "work sets" is an activity count over every profile (its caption changes in Release 2) | O-4(i), O-4(ii), O-6 |
| `docs/architecture/prescription-model.md` §2, §6 | the two scheme variants (schema-accepted in R1, editor-offered in R2), the profile × scheme × strategy table (§9.2, `reps` manual-only), §9.3's field rules, the deload note (§9.4) | O-1, O-11 |
| `docs/architecture/progression-engine.md` §2, §5 | the profile precondition on evaluation (`continue` for non-`load_reps` slots) and the boundary rule (I-13) | — |
| `docs/architecture/pwa-offline-strategy.md` §5 | the profile-scoped full-row rule (O-13; server acceptance in R1, client emission in R2), the profile-only slot comparison with `loadBasis` ignored on insert, and the two new sync reject reasons | O-13 |
| `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` §9.6, §15.4, I-14, A-19; `docs/architecture/adr/ADR-011-…` deferred list | **the O-17 amendment becomes effective here**: §9.6's refusal order becomes profile → load basis → equipment → switch; §15.4's enum gains `MEASUREMENT_PROFILE_UNSUPPORTED` and `LOAD_BASIS_UNSUPPORTED`; I-14 and A-19 are re-scoped to the extended enum; ADR-011's D-11 is marked discharged with a pointer to this document's §11.5–§11.6. The amendment lands in the same commit as `src/domain/strength/eligibility.ts` / `reasonCodes.ts`; it is unobservable to the athlete until Release 2 | O-17 |

### 24.2 Release 2 commit (client emission, UI, reconcile)

| Document | Amendment | Decision it records |
| --- | --- | --- |
| `docs/architecture/pwa-offline-strategy.md` §2 capability matrix, §5 | profile-aware logging offline; the refused-op surfacing on the active session (banner, card mark, completion confirm) | O-13, O-16 |
| `docs/architecture/deviations.md` | record the Release-2 seed-step reconcile deploy window (§14.3) as an accepted, disclosed exposure with revisit trigger "a second account or a deploy pipeline with a post-swap step" | O-5 |
| `docs/architecture/volume-model.md` §1 note; `src/ui/metrics/copy.ts:37` | the Training-card caption `Completed workouts only. Warm-up sets not counted. Every exercise type counts as a set.` | O-6 |
| `docs/architecture/data-model.md` §2.4 note | the seeded reconcile outcomes (assisted pull-up `assistance`; unreferenced Plank / Farmer's Carry converted; referenced carry `volume_counting = 'off'`) | O-5 |

### 24.3 Release 3 commit (athletic catalog)

| Document | Amendment | Decision it records |
| --- | --- | --- |
| `docs/architecture/domain-model.md` §3 or the catalog's own header comment | the authoring rule: every athletic catalog entry carries explicit `measurementProfile`, `loadBasis` (where the profile has load) and `volumeCounting`; the ten adopted slugs and shapes; the contributions approved at the authored-list gate | O-10(i), O-10(ii) |

### 24.4 Not amended by this work

`docs/architecture/adr/ADR-006`, `ADR-007`, `ADR-008`, `ADR-010`; `deviations.md` D-03; the metrics dashboard evaluation's O-3/O-8. `docs/architecture/open-decisions.md` gains no entry: every decision this work needed is recorded in §22 and closed.

---

## 25. Correction log (2026-09-07)

Applied from `docs/reviews/athletic-measurement-profiles-architecture-review.md`. The independently validated core — closed profile enum, frozen slot columns, shape CHECK, set-level composite FK — is unchanged.

| Finding | Root correction | Sections touched |
| --- | --- | --- |
| BLOCKER-1 | `distance_m` bound set to the column's storage ceiling `99999.99` in DDL, wire and scheme variant; `22003` mapped to `invalid_measurement`; boundary rows per numeric column added | §6.1, §8.3, §9.1, §12.2, I-8, NC-4, A-2, X-22, H-17, R-2 |
| BLOCKER-2 | Profile-changing reconcile removed from Release 1 and moved to Release 2 with its deploy window disclosed; mirror composite FK `session_exercises → exercises` added (O-14); clean-database outcome stated per release; O-5 re-posed | §8.1, §8.2, §8.5, §10.3, §13.2, §14.1, §14.3, §14.4, §21.1, §21.2, I-3, I-11, NC-5, A-10, A-17, O-5, O-14, R-9 |
| BLOCKER-3 | §14.5 rewritten against the real rollback mechanisms; emission rule promoted to O-13 with profile-scoped full rows recommended; profile-scoped creation-required fields; NC-13 added | §12.2, §12.3, §14.5, I-7, NC-13, O-13, R-3 |
| HIGH-1 | Volume default for `reps` fails closed (creation default `'off'`, O-4 split); `volumeCounting` required on every R3 `load_reps`/`reps` entry and `'off'` for all athletic entries; referenced legacy carry gets `volume_counting = 'off'` in the reconcile; default case tested | §11.1, §11.2, §11.4, §14.3, §16, I-5, NC-11, A-14, O-4(i)/(ii) |
| HIGH-2 | Progression refuses non-`load_reps` slots by `continue` (no draft, no row, no new code); rep-progression restricted to `load_reps` in v1; SQL→domain no-coercion boundary rule stated with its five sites (I-13); NC-9 asserts the outcome | §2.3, §9.2, §11.2, §11.3, I-6, I-13, NC-9, NC-10, X-19, X-20, N-13, R-7 |
| HIGH-3 | `weightKg` wire rule left unchanged (no `multipleOf`) pending O-15; decimal guards required at the input for the two new fields; §6.1 no longer calls the wire rule "unchanged" while changing it | §6.1, §12.2, §15.2, §15.3, A-2, O-15 |
| HIGH-4 | Release 1 re-scoped (no client emission, no reconcile, no DTO widening; server-side acceptance only); its "nothing visible" claim made true; O-7 re-posed three ways with the rollback cost per option | §0, §21.1, §21.2, O-7 |
| MEDIUM-1 | W-1 misattribution removed: `setLog` never reaches the supersession gate; §12.3 and R-1 restated; NC-1 extended to all three full-row builders | §2.4, H-7, §12.3, NC-1, R-1 |
| MEDIUM-2 | `measurementProfile` / `loadBasis` optional with defaults on create; definition-world row added to the rollout table | §12.1, §13.2, I-9, A-10 |
| MEDIUM-3 | Explicit amendment of the e1RM revision's §9.6 order, §15.4 enum, I-14 and A-19; code placement decided; A-15 corrected to assert the assisted pull-up's before/after codes | header, H-16, §7.3, §11.6, A-4, A-15, §24 |
| MEDIUM-4 | Documentation obligations enumerated, including the normative `volume-model.md` §1 change | §24 |
| MEDIUM-5 | X-8 withdrawn: the client's frozen profile travels on the `sessionExercise` payload (optional keys, always emitted) so the server can reject a disagreement on ad-hoc slots; §10.1's unreachability argument narrowed to template slots | §10.1, §10.2, §12.2, §12.3, §13.2, X-8, X-21, A-18 |
| MEDIUM-6 | Refusal surfacing designed and posed as O-16; A-23/A-25 assert what the athlete sees | §13.4, §15.3, A-23, A-25, O-16 |
| MEDIUM-7 | Derivation specified as a user-scoped select; missing or foreign exercise → `invalid_reference`; default never a fallback | §10.1, I-14, A-18 |
| LOW-1 | `SUGGESTION_NOISIER_EQUIPMENT` named correctly and scoped to Release B suggestion confidence | §7.1 |
| LOW-2 | Catalog line reference `:878-886`; `EditSetPatch` described as a local mutation feeding `setLogFullRowOp` | §2.4, §2.5 |
| LOW-3 | NC-2 reworded to "identical in every pre-existing column" | NC-2 |
| LOW-4 | Absence of a separate profile-enum CHECK on `set_logs` stated as deliberate | §8.3 |
| LOW-5 | Deload semantics for the new variants stated | §9.4, N-13 |
| LOW-6 | `schemeDefaultReps` widening named as the site | §2.3, §9.4, A-12 |
| LOW-7 | No export surface exists; stated | §2.5, N-15 |
| LOW-8 | W-2 `laterDelete`-trailed shape-invalid create row added to the rollout table | §13.2 |
| LOW-9 | Excluded shapes enumerated; shuttle-run distance convention stated | §5.3, N-12 |
| LOW-10 | NC-3 asserts which layer rejected | NC-3 |
| Review §8 table | NC-12 non-vacuity witness; A-12 null prefill for the new variants; A-17 per release; O-6 caption text supplied; O-10 split | NC-12, A-12, A-17, O-6, O-10 |

---

## 26. Second correction log (2026-09-07)

Applied from `docs/reviews/athletic-measurement-profiles-architecture-revision-verification.md` §6. No previously verified architecture changed; every owner decision remains undecided; O-17 was added.

| Finding | Correction | Sections touched |
| --- | --- | --- |
| V-1 (HIGH) | The `sessionExercise` insert compares **only** `measurementProfile`; the `loadBasis` payload key is kept (always emitted, fixed key set for W-1 subsumption) but its value is ignored on insert and the slot's basis is derived from the live exercise row; stale-basis-applies versus stale-profile-rejects negative control added (NC-14) with a mutation witness; rollout table gains the permitted-basis-edit row | §10.1, §10.2, §12.2, §12.3, §13.2, NC-14, I-14, A-9a, A-18 |
| V-2 (MEDIUM) | Release 1 ships the widened `setSchemeSchema` and the snapshot `measurement` key as acceptance-only widening of the shared domain module (they cannot be server-side only); the editor offers no new variant until Release 2; §21.1's "no new scheme variant" corrected to "in the editor"; §14.5's Release 2 → Release 1 row rewritten to show the workout still starts and to state that the row is true only because the schema ships in R1 | §0, §8.7, §14.5, §21.1, §21.2 |
| V-3 (MEDIUM) | A-5 split into A-5a (R1) / A-5b (R2); A-9 split into A-9a (R1) / A-9b (R2); A-3 and A-12 annotated R1 with the reason they are executable there; A-14 uses a hand-built `reps` exercise instead of a Release-3 seeded slug; §21.1 / §21.2 criterion lists re-pointed | A-3, A-5a/b, A-9a/b, A-12, A-14, §21.1, §21.2 |
| V-4 (MEDIUM) | O-17 added (accept the §11.6 amendment as written / keep "category code wins" / add no codes) with recommendation and trade-offs; §11.6 retitled "proposed", cross-referenced to O-17 and its alternatives; header, §21.1 and §24 aligned | header, §11.6, §21.1, §24, O-17 |
| V-5 (LOW) | §13.4 → A-23 / A-25; R-5 → A-25 | §13.4, R-5 |
| V-6 (LOW) | NC-10's "no `0` load or `1` rep" clause replaced by a mapped-row-count equality and an explicit non-vacuity requirement (fixture includes a legitimate single and a `0 kg` bodyweight set); the output-equality assertion kept as the load-bearing detector | NC-10 |
| V-7 (LOW) | §11.3 site 3 reworded: replace the `?? 0` coalesce with an explicit null skip beside the existing `setNumber` skip, with the type reason | §11.3 |
| V-8 (LOW) | `volumeCounting` stays optional on `SeedCatalogExercise` (the `strengthEstimate?` precedent); it is required by authoring rule for every new athletic entry in Release 3 and for the three legacy entries in Release 2; existing `load_reps` entries untouched; a Release-3 unit test asserts the rule | §16 |
| V-9 (LOW) | The two additions to `SyncRejectReason` (`invalid_measurement`, `measurement_profile_mismatch`) recorded with their dead-letter surfacing | §12.2, I-6, A-18 |

---

## 27. Owner-decision integration log (2026-09-07)

Recorded after `docs/reviews/athletic-measurement-profiles-architecture-revision-verification-2.md` returned `VERIFIED — READY FOR OWNER DECISIONS`. The owner accepted O-1 … O-17 exactly as recommended; the integration record is `docs/reviews/athletic-measurement-profiles-owner-decision-integration.md`.

| Change | Sections touched |
| --- | --- |
| Owner-decision addendum added; header states acceptance; §22 retitled and its recommendation column declared binding | header, §0.1, §22 |
| Every "recommended" / "proposed" / "if O-nn" / "unless O-nn" clause replaced by the accepted outcome; rejected alternatives retained as rationale | §0, §5.3, §6.1, §6.2, §7.2, §8.2, §11.2, §11.3, §11.4, §11.6, §12.2, §12.3, §13.4, §14.3, §14.5, §15.3, §15.5, §16, §21.1, §21.2, §21.3, §23, R-9, A-2 |
| §24 rewritten as a release-specific documentation checklist; the O-17 amendment of ADR-011 / the e1RM revision becomes effective in the Release-1 commit that changes `eligibility.ts` / `reasonCodes.ts`, unobservable until Release 2 | §24 |
| Second verification's pre-implementation corrections applied so the specification is implementable as written: W-1 (A-6 and A-11 split into R1/R2 halves; the prescription write-side gate and `formatScheme` / `schemeDefaultReps` widening named in §21.1's ships list), W-2 (I-3 attributes the basis freeze to the service rule and the profile freeze to the FK), W-3 (§9.4: typed columns authoritative for profile **and** basis; the snapshot's `loadBasis` carries no authority), W-4 (O-17 markers at §11.3 and §23) | A-6a/b, A-11a/b, §21.1, §21.2, I-3, §9.4, §11.3, §23 |
| O-6 caption and O-16 surfacing assigned to Release 2 (the first release in which a non-`load_reps` attempt can exist); O-8 `m:ss` secondary display specified on the card | §15.3, §21.2 |

## 28. Release-1 review correction log (2026-09-07)

Applied from `docs/reviews/athletic-measurement-profiles-release-1-review.md` §10 (L-9, L-10, L-11), found during the independent review of the Release-1 implementation this specification's §21.1 defines. **No owner decision, rule, DDL, invariant, acceptance criterion, or Release boundary changed.** Each correction brings this specification's descriptive text into agreement with what the (independently verified, unchanged) implementation actually does; none of them required any code, test, or design change.

| Finding | Correction | Sections touched |
| --- | --- | --- |
| L-9 | §21.6's "no new queries" was not literally true: `queryWorkSetContributionRows` gains one `INNER JOIN exercises` to project `volume_counting`. Measured cost is nil (`0.478 ms` vs `0.538 ms`, an index scan against `uq_exercises_id_profile`) — the verdict is unaffected, the sentence is now precise | §21.6 |
| L-10 | NC-3's DB-layer clause assumed a service-bypassed op would fail the composite FK "because the row carries the default profile." It does not: the implementation writes the derived parent profile explicitly on every set insert, so a bypassed *pre-check* still carries the correct profile and instead fails the shape CHECK (`23514`) — reaching the FK requires bypassing the derivation too. The implementation's behaviour is strictly safer than this row assumed; its own tests already reach the FK the only way that remains available | §13.5 NC-3 |
| L-11 | NC-9 was tagged R1 in full, but its `buildClientRecommendationOps` clause needs the client aggregate to carry `measurement.profile` — a client-DTO widening O-7 explicitly excludes from Release 1. The implementation correctly deferred that half and disclosed it in its own report. The row now carries the same "R1 (server), R2 (client)" split NC-1's row already uses | §13.5 NC-9 |

**READY FOR TARGETED OWNER-DECISION INTEGRATION VERIFICATION**
