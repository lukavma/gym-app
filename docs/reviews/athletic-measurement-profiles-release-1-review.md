# Athletic Exercise Measurement Profiles — Release 1 independent review (PI-005)

**Date:** 2026-09-07
**Reviewer:** independent, adversarial pass — no involvement in the implementation
**Tree under review:** the working tree at `main` `05982f6` + the uncommitted Release-1 change set (66 tracked modified files, 15 new untracked files, migration `0013`)
**Binding specification:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` (§21.1 defines Release 1; O-1…O-17 accepted 2026-09-07)
**Implementation report under review:** `docs/reviews/athletic-measurement-profiles-release-1-implementation.md`

**Method.** Every claim below was re-derived from the tree, not read out of the implementation report. Live verification ran against a **disposable PostgreSQL 16.14 container** (`mp-r1-review-a`, port 55433, `postgres:16`), never against the persistent `gym-app-db-1` (used for nothing at all in this pass) and never against production. Independent fixtures and scratch scripts lived entirely in the session scratchpad; **no file in the repository was created, modified or deleted by this review except this document** (`git status --porcelain` is byte-identical before and after: 89 entries, same set — §11). Critical sync mappings were exercised through the **real `applySyncBatch` service path**, not through raw `db.insert` probes. The full gate set (typecheck, typecheck:sw, lint, format:check, unit, integration, production build, full Playwright e2e) was re-run from scratch.

---

## 0. Verdict

**The product is sound.** Every schema object, constraint, cascade, gate, mapping and hard boundary that Release 1 claims is independently reproduced here, most of them with non-vacuity controls that I constructed myself. Migration `0013` is additive and provably non-reinterpreting on a realistic pre-`0013` fixture; the two composite foreign keys, the shape CHECK and the profile lock behave exactly as §8 specifies on real PostgreSQL 16; the H-17 poison-op mapping is genuinely load-bearing through the real service path; an ordinary athlete's behaviour is unchanged (112/112 e2e on a fresh database and a real production build). I found **no BLOCKER and no HIGH finding, and no product defect above LOW.**

**The record is not sound in three places, one of them material.** The implementation report's headline performance finding — "every percentile moved by roughly the same ~20 ms / ~100–110%" — compares this release against a **superseded baseline that the repository's own review lineage had already corrected**, and misattributes the difference to container warmth. Measured against the correct like-for-like baseline, this release shows **no performance regression at all**; my own warm re-runs disprove the warmth explanation, and an `EXPLAIN ANALYZE` A/B shows the one new join costs nothing measurable. Two of the eight §24.1 documentation amendments describe behaviour that does not ship — including a **binding** clause in the e1RM revision whose text is the direct opposite of the shipped test.

§24.1 makes those documentation amendments a Release-1 review-gate item that lands in the same commit as the code. Signing off deployment would mean committing a binding clause that contradicts its own test suite, plus a performance record that instructs the next maintainer to adopt a phantom regression into the architecture documents. That is a short, purely-textual remediation with two optional LOW code hardenings, and it requires no re-derivation of any of the evidence in §3 below.

**READY FOR REMEDIATION** (restated in full at §13).

---

## 1. Findings

Product defects are behaviour in the shipped artifact. Report / documentation / specification inaccuracies are defects of the record.

| Id | Severity | Kind | Finding |
| --- | --- | --- | --- |
| **M-1** | MEDIUM | report accuracy | §8's performance "finding" compares against a **4×-lighter, superseded fixture baseline** and reports a phantom ~100–110% regression; the "cold container" attribution is disproved by warm re-measurement. Against the correct baseline this release is **flat to slightly faster**. §8 and §11 instruct future editors to propagate the wrong number. (§5.1) |
| **L-1** | LOW | documentation accuracy | The amended **A-19** in `estimated-1rm-load-translation-architecture-revision.md` states the two new reason codes are "unreachable by any fixture in Release 1 … the reachability test's Release-1 run **excludes them by name**". The shipped test does the exact opposite: it adds two fixtures that reach both codes and asserts they are *not* Release-B-only. (§5.2) |
| **L-2** | LOW | documentation accuracy | The e1RM revision's §15.4 row gives the phrasing "Not available for this exercise's **tracking** type"; `src/ui/strength/copy.ts` ships "…**measurement** type". No test binds the two. (§5.3) |
| **L-3** | LOW | product | `updateExercise`'s new blanket `23503 → MeasurementProfileLockedError` mapping also swallows the `exercise_muscle_contributions.muscle_group_id` FK raised inside the same transaction, turning an unrelated contributions patch into **HTTP 409 `measurement_profile_locked`**. Reproduced. Unreachable on a fully seeded database. (§5.4) |
| **L-4** | LOW | product | `targetRepsPerSet` / `schemeMinReps` now **`throw`** on the two new scheme variants. The throw sits inside the sync completion transaction, so if the `supportsScheme` gate ever regressed the failure mode would be an H-17 whole-batch poison, not the fail-closed skip the surrounding code uses everywhere else. (§5.5) |
| **L-5** | LOW | documentation accuracy | `progression-engine.md`'s new boundary-rule heading is labelled **"(I-14, …)"** but states I-13; the body then correctly cites I-13. (§5.6) |
| **L-6** | LOW | documentation accuracy | `data-model.md` §2.4's new sentence opens "`measurement_profile` **and `load_basis`** are locked once the exercise is referenced…" and then says "`load_basis` alone stays editable". `load_basis` is never locked (proven, §3.6). (§5.6) |
| **L-7** | LOW | report accuracy | §7.2/§7.3's test counts ("44 tests", "all 45 tests") do not describe the shipped file, which contains **46**. The §12 gate counts are exact. §1's "15 new, untracked files … **and** one new migration pair. Total: **79**" double-counts the pair in prose (the pair is inside the 15; 64 + 15 = 79 is right), and its "2,347 lines" silently excludes the generated 3,143-line snapshot. (§9) |
| **L-8** | LOW | scope / report accuracy | The shipped `measurementSync.integration.test.ts` contains an **A-13** block. A-13 is scoped to Release 2 (§20 has no *(R1)* tag on it; §21.2 lists it). This is extra coverage of server behaviour Release 1 genuinely ships — **not** Release-2 product work — but it is outside §21.1's named list and the report's §9 acceptance table does not mention it. (§7) |
| **L-9** | LOW | specification accuracy | §21.6's "**No new queries**" is not literally true: `queryWorkSetContributionRows` gains one `INNER JOIN exercises`. Measured cost is nil (§5.1), but the sentence should not be carried forward as written. (§5.1) |
| **L-10** | LOW | specification accuracy | **NC-3's DB-layer half is unreachable as written.** §13.5 expects the service-bypassed path to fail the composite FK as `23503 → invalid_reference` "because the row carries the default profile". The implementation writes the *derived parent profile* explicitly, so a bypassed pre-check yields `23514 → invalid_measurement` instead. The implementation's behaviour is strictly safer and its tests navigate this correctly; the spec text is what is wrong. (§5.7) |
| **L-11** | LOW | specification accuracy | **NC-9 cannot be fully satisfied in Release 1.** §13.5 tags NC-9 R1, but its `buildClientRecommendationOps` clause needs the client aggregate to carry `measurement.profile` — a client-DTO widening O-7 excludes from R1. Correctly deferred by the implementation and disclosed in its §6; the spec's release tagging is what is inconsistent. Unobservable (§3.9). (§5.8) |
| **L-12** | LOW | product | Two disclosed, currently-unreachable seams: the client's own `ActiveSessionSetDto` (`src/sync/types.ts`) stays `number` while the server DTO is now `number \| null`; and `applySessionExerciseUpsert`'s **update** path can still change `exerciseId` without re-deriving `load_basis` (a cross-profile swap is blocked by the mirror FK; a same-profile swap leaves the old exercise's basis frozen). Both self-disclosed or out of §10.1's stated scope. (§5.9) |

Nothing in this list changes a single existing result, a single existing row, or anything an athlete can observe in Release 1.

---

## 2. What Release 1 was reviewed as

Per §21.1 and the task's own framing, Release 1 is the **dark foundation**: migration `0013`, the domain module, definition-world fields locked to `load_reps`, the read-side gates, the prescription write-side gate, and the *acceptance* side of every shared contract — with **no client emission, no client/IndexedDB DTO widening, no logging UI, no unlocked selectors, no editor variants, no seed reconcile, no Release-2 surfacing**. This review does not treat the absence of any of those as a defect. It does check that none of them leaked in.

---

## 3. Independently proven behaviour

Everything in this section is my own evidence, produced from my own fixtures and scripts, not accepted from the implementation report.

### 3.1 Schema, defaults, CHECKs, unique pairs, composite FKs — exact

Clean `0000 → 0013` on an empty `postgres:16` database succeeded. `information_schema` and `pg_constraint` were then read directly. Every object matches §8.1–§8.3 **term for term**:

- `exercises`: `measurement_profile text NOT NULL DEFAULT 'load_reps'`, `load_basis text NULL DEFAULT 'unspecified'`, `volume_counting text NOT NULL DEFAULT 'auto'`; `ck_exercises_measurement_profile` (the six values), `ck_exercises_load_basis`, `ck_exercises_load_basis_presence` (the exact `(profile IN (…)) = (load_basis IS NOT NULL)` equality), `ck_exercises_volume_counting`, `uq_exercises_id_profile UNIQUE (id, measurement_profile)`.
- `session_exercises`: the same two columns and three predicates, `uq_session_exercises_id_profile UNIQUE (id, measurement_profile)`, and `fk_session_exercises_exercise_profile FOREIGN KEY (exercise_id, measurement_profile) REFERENCES exercises(id, measurement_profile) ON DELETE RESTRICT`.
- `set_logs`: `weight_kg` and `reps` **nullable** (NOT NULL dropped), `distance_m numeric(7,2)`, `duration_s numeric(7,2)`, `measurement_profile text NOT NULL DEFAULT 'load_reps'`; `ck_set_logs_distance_m_range`, `ck_set_logs_duration_s_range`, `fk_set_logs_parent_profile … ON DELETE CASCADE`, and the six-branch `ck_set_logs_profile_shape` with `load_distance` deliberately carrying no `duration_s` clause (duration optional) and the four load-less/rep-less branches carrying `rir IS NULL`.
- **No separate profile-enum CHECK on `set_logs`** — §8.3's deliberate omission is honoured. I confirmed it is not a hole: `INSERT … measurement_profile = 'load_repz'` is refused `23514` by the shape CHECK's OR-chain, exactly as §8.3 predicts.

Defaults are **kept**, not dropped after backfill — the §14.5 rollback-safety rationale is intact in the catalog (verified in `information_schema.columns`) and stated in both `src/db/schema/exercises.ts` and `data-model.md`.

### 3.2 Migration of realistic pre-`0013` data — zero value change (I-2)

I built an independent pre-`0013` database: migrations `0000`–`0012` applied by hand, then registered in `drizzle.__drizzle_migrations` with their real content hashes and journal timestamps so that `pnpm db:migrate` would apply **only** the single remaining `0013` step (confirmed: 13 → 14 rows). Fixture: 4 exercises across barbell/bodyweight/dumbbell/machine, 1 program/template/prescription, 2 sessions (one completed, one in progress), 5 slots split template/ad-hoc (one skipped), and 11 `set_logs` rows including a warm-up, a legitimate **`0 kg` bodyweight set**, two null-`rir` rows, a fabricated-reps carry, and a **ceiling row** (`9999.99 kg × 100 reps @ RIR 10`).

Full row snapshots of every pre-existing column of `exercises`, `session_exercises`, `set_logs`, `exercise_prescriptions` and `workout_sessions` were taken before and after the `0013` step and diffed:

```
IDENTICAL: exercises
IDENTICAL: session_exercises
IDENTICAL: set_logs
IDENTICAL: prescriptions
IDENTICAL: sessions
```

Post-migration state: all 4 exercises `load_reps / unspecified / auto`; all 5 slots `load_reps / unspecified`; all 11 set rows `load_reps` with `distance_m` and `duration_s` null. **I-2 holds.** Re-running `pnpm db:migrate` is a no-op (I-11); `pnpm db:generate` reports *"No schema changes, nothing to migrate 😴"* (NC-12's drift half), and left the repository untouched.

### 3.3 Profile equality, the profile lock, and I-3's freeze — proven at the database

All on real PostgreSQL 16, each with a **non-vacuity control** (drop the constraint in a scratch database cloned from the fixture, re-run the identical statement, watch it succeed):

| Probe | Result | Non-vacuity control |
| --- | --- | --- |
| NC-5(a) set whose profile ≠ its parent slot's | `23503` on `fk_set_logs_parent_profile` | constraint dropped → `INSERT 0 1` |
| NC-5(b) slot whose profile ≠ its exercise's | `23503` on `fk_session_exercises_exercise_profile` | constraint dropped → `INSERT 0 1` |
| NC-5(c) `UPDATE exercises SET measurement_profile` with a slot present | `23503` — "still referenced from table session_exercises" | constraint dropped → `UPDATE 1` |
| I-3 `UPDATE session_exercises SET measurement_profile` with child sets | `23503` on `fk_set_logs_parent_profile` | — |
| I-3 same update on a **childless** slot | still `23503`, now on the mirror FK | — |
| NC-12 shape CHECK: `load_reps` row carrying a distance; `load_reps` row with null reps; unknown profile value | `23514` ×3 | constraint dropped → `INSERT 0 1` |
| `rir` on a `duration` row; `distance_time` missing its duration | `23514` ×2 | — |
| `ck_exercises_load_basis_presence` both directions | `23514` ×2 | constraint dropped → `UPDATE 1` |

**Cascade (§8.5):** on the realistic multi-row fixture, deleting one session removed its 3 slots and 8 sets while the sibling session kept its 2 slots and 3 sets. The new `ON DELETE CASCADE` composite FK never blocks the `session → session_exercises → set_logs` cascade. `RESTRICT` still refuses a hard delete of a referenced exercise.

**Numeric boundaries, with the SQLSTATE recorded rather than assumed:**

| Column | Ceiling accepted | One step past | SQLSTATE | Why |
| --- | --- | --- | --- | --- |
| `weight_kg` | `9999.99` ✓ | `10000.00`, `9999.995` | **`22003`** | `numeric(6,2)` precision, no upper CHECK on this pre-existing column |
| `distance_m` | `99999.99` ✓ | `100000.00` | **`22003`** | the CHECK ceiling coincides exactly with `numeric(7,2)`, so precision fires first |
| `distance_m` | — | `0` | **`23514`** | `ck_set_logs_distance_m_range` |
| `duration_s` | `86400` ✓ | `86400.01` | **`23514`** | `ck_set_logs_duration_s_range` (the column has precision headroom) |
| `duration_s` | — | `100000.00` | **`22003`** | past `numeric(7,2)` |

Dropping `ck_set_logs_duration_s_range` made `86400.01` succeed — proving it was the CHECK, not precision, that rejected it. This matches the implementation report's §2.4 empirical claim exactly.

### 3.4 Rollback and rolling-deploy compatibility — proven, not only argued

The implementation report explicitly says §14.5's rollback row was **not** independently re-derived. I derived it. Against the migrated `0013` schema I executed the *exact pre-`0013` column lists* a rolled-back build would use:

- `INSERT INTO exercises (… no new columns …)` → row lands `load_reps / unspecified / auto`, satisfying `ck_exercises_load_basis_presence`.
- `INSERT INTO session_exercises (… no new columns …)` → `load_reps / unspecified`, satisfying the mirror FK against a `load_reps` exercise.
- `INSERT INTO set_logs (… no new columns …)` ×2 (including a `0 kg` bodyweight row) → `load_reps`, distance/duration null, satisfying the shape CHECK.
- A pre-`0013` history correction (`UPDATE set_logs SET weight_kg, reps`) → applies.
- A pre-`0013` delete + renumber → applies.

**Release 1 → pre-`0013` is safe.** Separately, the one case §13.2/§14.3 require to *fail loudly* does: a pre-`0013` build inserting a slot for an exercise whose profile is no longer `load_reps` is refused `23503` by the mirror FK rather than freezing a wrong shape. The permanent-default rationale is therefore not merely stated — it is the mechanism that makes the safe row safe and the unsafe row loud.

### 3.5 The sync layer, through the real service path — 34/34

I drove **`applySyncBatch` itself** (not `db.insert`) against real PostgreSQL 16 from an out-of-repo script. All 34 assertions passed:

- **A-18 / §10.1 / I-14.** A missing `exerciseId` and a *foreign-owned* `exerciseId` each reject `invalid_reference` with no row written (the user-scoped select is real; the column default is never a fallback). A payload `measurementProfile` disagreeing with the live exercise rejects `measurement_profile_mismatch`. Exactly 3 rejections of 8 ops; 5 rows written.
- **NC-14, the load-bearing half.** A slot op carrying `loadBasis: "per_hand"` against an exercise whose live basis is `unspecified` **applies**, and the stored slot basis is `unspecified` — the payload's basis is genuinely never compared and never written. Absent keys derive silently. A `load_distance` exercise's slot derives `load_distance / total`; a `duration` exercise's slot derives `duration / NULL`.
- **NC-2.** A nine-key `load_reps` create applies and the stored row is identical in every pre-existing column (`weightKg`, `reps`, `rir`, `isWarmup`, `setNumber`, `notes`), plus `measurement_profile = 'load_reps'` and two nulls.
- **Profile-scoped creation-required fields.** A `duration` create carrying only `durationS` applies; a `load_distance` create with an optional `durationS` applies; a `reps` create with `rir` applies; a nine-key op on a `load_distance` slot rejects **`invalid_measurement`** (the forbidden `reps` wins over the merely-absent `distanceM`, per §13.2's rollout row); a `load_reps` create without `reps` rejects **`missing_required_fields`**. A later op in the same batch still applied — **no poison batch**.
- **I-8 / H-17, the critical one.** With `setLogPreCheck.isEffectiveSetRowValid` forced to `true` — simulating exactly the regression H-17 exists to prevent — a `load_reps` create with `reps: null` reached the real database, raised `ck_set_logs_profile_shape`'s real `23514`, and `applySyncBatch` **did not throw**: it returned `rejected: [{ reason: "invalid_measurement" }]`, wrote zero rows, and applied the trailing op. Since the pre-check was bypassed, the only code that can produce that outcome is the catch-block mapping — **the mapping is proven load-bearing, independently of the shipped test.**
- **The `22003` half.** I confirmed the implementation report's structural claim directly against the wire schema: `weightKg 9999.995`, `weightKg 10000`, `distanceM 100000` and `durationS 86400.01` are all refused by `setLogUpsertPayloadSchema.safeParse`. Every wire ceiling sits exactly at its column's storage ceiling, so no parsed payload can overflow. `22003` is unreachable below Zod; the raw-insert probe is the correct technique, not a shortcut.
- **Effective-row validation on update (§13.1).** `{durationS: null}` on `load_distance` applies; `{distanceM: null}` on the same slot rejects `invalid_measurement`; `{reps: null}` and `{distanceM: 20}` on `load_reps` both reject; the target row is byte-unchanged after each rejection.
- **§13.2's `laterDelete` row.** A shape-invalid create trailed by a delete of its own id is reported applied with nothing written.
- **I-3 through the service.** An `upsert` op carrying `measurementProfile: "load_reps"` and `loadBasis: "per_hand"` against an existing `load_distance / total` slot applies its `skipped` change and writes **neither** measurement column.

### 3.6 The definition world, through the real services — 17/17

Driven through `createExerciseSchema` + `createExercise` and `updateExercise` / `createPrescription` against real PostgreSQL 16:

- **§12.1 / I-9.** A body with no `measurementProfile` → `load_reps / unspecified / auto` (a cached pre-upgrade client still gets a normal row). `duration` → `loadBasis null`, `volumeCounting 'off'`. `reps` → `'off'` (O-4(ii)). `load_distance` + explicit `total` passes through. An explicit `loadBasis` on a load-less profile is a Zod issue (400), not an unmapped `23514`.
- **§10.3 lock, both halves.** Unreferenced → the profile change is **allowed** and the basis re-derived to null. Referenced by a `session_exercises` row → `MeasurementProfileLockedError` (409). Referenced by an `exercise_prescriptions` row **only** → the same error, from the service rule (the half with no FK behind it). The mirror FK's raw `23503` backstop is separately proven at the database level in §3.3.
- **§7.1.** A `loadBasis` edit is allowed with history on a load-bearing profile; on an unchanged load-less profile it is `LoadBasisNotSupportedError` (400 `load_basis_not_supported`) — a guard the spec does not name but which correctly closes what would otherwise be an unmapped `23514`. `volumeCounting` remains ordinary editable metadata.
- **§9.2 / §9.3 write-side gate (A-11a).** `fixed` on `load_distance` → `incompatible_prescription`; `distanceRounds` + `load-progression` → the strategy issue; `targetRir` on `load_distance` → rejected; `baselineLoadKg` on `reps` → rejected; `distanceRounds` + `manual` + `baselineLoadKg` on `load_distance` → **accepted**; `distanceRounds` on a `load_reps` exercise → rejected. This is what keeps a new variant out of every prescription — and therefore out of `recommendations.inputs.prescribed` (I-6) — while the schema already accepts it.

I also confirmed by construction that the two removals in `checkPrescriptionCompatibility` lose nothing: given §9.2's table, `(profile × scheme) ∧ (strategy × profile)` implies `(strategy × scheme)`, and for `load_reps` with a non-`manual` strategy the new composition returns exactly what the old vacuous `supportsScheme` returned — so **no existing prescription result changes**.

### 3.7 The read-side gates and the vocabulary

- `src/domain/measurement/profile.ts` reproduces §6.2's matrix cell for cell (including `load_distance`'s `duration: optional` and `rir: forbidden`); `compatibility.ts` reproduces §9.2's rows and columns; `capabilities.ts`'s three purpose-named predicates match §11.2's structural rules; `format.ts` renders all eight §15.4 lines plus O-8's `m:ss` secondary form, flooring to whole seconds.
- **I-10** is enforced by a real boundary suite with genuine negative controls: a discovered-inventory guard that fails if a fifth file appears, a zero-specifier assertion on `profile.ts` with an anti-vacuity witness, a transitive-closure walk, and a **synthetic forbidden edge** (`capabilities.ts → domain/strength`) proving the walker would catch a violation.
- **I-13, verified by my own sweep**, not by the report's: a repository-wide grep for `?? 0` / `?? 1` near any weight or rep value finds **no remaining coercion at any SQL→domain boundary**. Every surviving hit is an unrelated counter, a config default, or `rir ?? 0` inside the pre-existing RTF calculation. The three sites the implementation widened beyond the named list (`metrics/service.ts`, `metrics/selectionService.ts`, `blocks/service.ts`) each carried the identical landmine and are each fixed with the explicit-skip idiom.
- **NC-10 is genuinely load-bearing.** Its fixture deliberately contains a legitimate single (`140 × 1`) and a legitimate **`0 kg × 15` bodyweight set**, so a stray `?? 0` on the non-`load_reps` rows would be *distinguishable* in the output rather than blending in: the equality assertion compares whole `Map`s keyed by slot id, and coerced rows would add keys the stripped fixture does not have. The count assertion is a second, independent detector.
- **NC-9 is proven by non-invocation, not by absent output**: `evaluateLoadProgression` / `evaluateRepProgression` are wrapped in pass-through spies, a mixed session proves the `load_reps` slot still evaluates while the non-`load_reps` one does not, and every profile is exercised individually.
- **A-4's ordering** is tested with each earlier gate deliberately winning over failing later gates in both directions, and the two new codes are asserted **not** to be members of `RELEASE_B_ONLY_REASON_CODES` (confirmed by reading the constant).
- **The Metrics Training card shares zero code path with volume**: `TrainingSetRow` carries only `{ sessionId, isWarmup }` — no profile, no weight, no reps — so O-6's "counts every profile" is structurally true with no code change, and its caption is correctly left for Release 2.

### 3.8 The hard Release-1 boundaries — confirmed by diff, not by description

`git diff --stat` is **empty** for every one of: `src/sync`, `src/domain/sync/setDeletionOps.ts`, `src/domain/sync/payloadBuilders.ts`, `src/ui/workout`, `src/ui/history`, `src/db/seed`, `src/app/sw.ts`. A grep for `distanceM|durationS|measurementProfile|loadBasis|volumeCounting` across all of those plus `src/ui/metrics` returns **nothing**. `src/db/seed/reconcileMeasurementProfiles.ts` and `src/ui/measurement/` do not exist. `src/ui/metrics/copy.ts:37` still reads the pre-O-6 caption. `DB_VERSION` stays 2.

**A-17 (R1 row), verified independently:** on a fresh disposable database, `pnpm db:migrate` + account + `pnpm db:seed` inserts **all 93 catalog entries as `load_reps / unspecified / auto`**, Plank, Farmer's Carry and Assisted Pull-Up included, with no reconcile. A second `db:seed` produced a **byte-identical** content hash (reseed is a no-op).

The prescription editor's `EDITABLE_SCHEME_TYPES` is a local `["fixed","repRange"] as const satisfies readonly SchemeType[]` — it does not derive from the widened `SCHEME_TYPES`, so a future scheme addition cannot silently widen the dropdown. The exercise form's new profile `<select>` is `disabled` with a single option and is the **last** `<select>` in the form (`ContributionEditor` renders at line 343, the new control at 406), so the two Playwright specs that address `<select>`s by fixed index (`.nth(3)`, `.nth(5)`) cannot be renumbered — confirmed structurally and by the 112/112 run.

### 3.9 Ordinary athlete behaviour is unchanged

- **112/112 Playwright specs passed** (2.7 min, 32 spec files, 0 failed, 0 skipped) against a **fresh disposable PostgreSQL 16 database** and a real production build — including the legacy-cached-bundle specs, the offline/dead-letter/replay specs, and both exercise-form specs.
- The pre-existing `sync.integration.test.ts` (18 tests, including MEDIUM-1's V-1/V-2/V-3 supersession regressions) is **unmodified** and passes.
- **981/981** unit and **428/428** integration (16 skipped, the 5 opt-in real-Postgres concurrency suites) — identical to the report's counts, re-run by me from scratch.
- W-1's subsumption gate is unaffected in Release 1: `SESSION_EXERCISE_FIELDS` gained two keys, but the client builder that feeds it emits neither, so every same-id op group still has an identical key set. NC-1's server half asserts both lists by **exact equality with a mutation witness**. (The R-1 risk §19 names is armed and only closes when Release 2 makes the client emit the two keys unconditionally; that is the spec's own plan.)

One structural note for the record, not a defect: `evaluateSession`'s snapshot-based profile gate is **inert in Release 1**, because nothing writes `snapshot.measurement` yet (`buildPrescriptionSnapshotData` correctly does not, since that would be client emission). The live Release-1 gate is `mapWorkSetRows`. Both gates exist as §11.3 requires; NC-9 exercises the inert one with a synthetic snapshot, which is the only way it can be exercised now.

---

## 4. Gate results (independently re-run)

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | clean — *"All matched files use Prettier code style!"* |
| `pnpm test:unit` | **981/981**, 69 files |
| `pnpm test:integration` | **428 passed / 16 skipped**, 26 files passed + 5 skipped |
| `pnpm build` | succeeds, **40/40** static pages |
| `pnpm test:e2e` | **112/112**, 0 failed, 0 skipped, 2.7 min |
| `pnpm db:migrate` (clean `0000→0013`, then re-run) | applies, then idempotent |
| `pnpm db:generate` | *"No schema changes, nothing to migrate 😴"*; repository untouched |

Every count in the implementation report's §12 is confirmed exactly.

---

## 5. Findings in detail

### 5.1 M-1 — the §8 performance finding is a phantom regression (report accuracy)

The report compares this release's `min 35.98 / p50 38.86 / p95 42.03 / max 44.17 ms` against `min 17.16 / p50 18.45 / p95 20.93 / max 21.36 ms` from `metrics-dashboard-implementation.md:180`, concludes "every percentile moved by roughly the same ~20 ms / ~100–110%", and attributes the gap to measuring on "a cold, freshly-provisioned disposable container" versus "the long-warm persistent `gym-app-db-1`".

**The baseline is superseded.** The repository's own review lineage already corrected it. `metrics-dashboard-remediation.md` §L-10 records that the fixture generator used `EXERCISES_PER_SESSION = 2`, producing "7,800 set rows over 3 years instead of the ~31,200 the spec's own shape implies" — roughly **4× lighter** than the shape the 17.16/18.45/20.93/21.36 numbers were measured at. After the L-10 fix (the `EXERCISES_PER_SESSION = 8` now in the tree), the **same release** re-measured at the current 31,200-row shape:

| Source (all pre-`0013`, corrected fixture) | p95 |
| --- | --- |
| `metrics-dashboard-review.md` re-measurement | 44.97 ms |
| `metrics-dashboard-remediation.md` §L-10 (`gymapp_metricsperf_l10`) | **43.56 ms** |
| `metrics-dashboard-remediation-verification.md` §L-10 | 53.48 ms |

Against that like-for-like baseline, this release's **42.03 ms p95 is flat to slightly faster** — there is no regression to report.

**The warmth attribution is disproved.** I re-measured on my own container, then re-measured twice more on the *same, fully warm* database:

| Run | min | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| Mine, immediately after fixture insert | 33.75 | 41.34 | 47.67 | 54.54 |
| Mine, run 2 (fully warm) | 33.93 | 35.70 | 38.12 | 46.25 |
| Mine, run 3 (fully warm) | 32.08 | 34.77 | 36.77 | 37.77 |

Full warmth moves p50 by ~3 ms, not the ~17 ms the report's explanation needs. And the one structural change to a hot query costs nothing: `EXPLAIN ANALYZE` of `queryWorkSetContributionRows` with and without the new `INNER JOIN exercises`, on the 31,200-row fixture, gives **0.478 ms vs 0.538 ms** — the join is a memoized index scan on the new `uq_exercises_id_profile` index.

**Why this matters.** §21.6's "show no regression" is in fact satisfied; the report says it is not. §8 and §11 then instruct the next maintainer to carry the wrong figure into §21.6/§24.1 ("whoever next revises §21.6/§24.1's estimates should use this report's numbers", "so it isn't mistaken for 'no change at all'"). That would write a phantom 100% regression into the architecture record and could trigger optimisation work against nothing. This is the one finding above LOW.

The report's *other* §21.6 discrepancy is correct and I confirm it: the bundle `measurement` key adds **50–68 bytes** per entry (I measured 50 for `reps`/null and 68 for `load_distance`/`unspecified`), not §21.6's "roughly 40 bytes".

**L-9** rides along here: §21.6's "No new queries" should read "no new queries; one existing query gains an inner join whose measured cost is nil".

### 5.2 L-1 — the amended A-19 describes the opposite of what ships

`estimated-1rm-load-translation-architecture-revision.md` §21.2's amended A-19 now reads:

> `MEASUREMENT_PROFILE_UNSUPPORTED` and `LOAD_BASIS_UNSUPPORTED` are unreachable by any fixture in Release 1 … — the reachability test's Release-1 run **excludes them by name**, reachability is required from Release 2.

`tests/unit/strengthReasonCodes.test.ts` does the opposite. It **adds two fixtures** —

```ts
name: "a non-load_reps profile -> MEASUREMENT_PROFILE_UNSUPPORTED",
  exercise: { ...BARBELL, measurementProfile: "duration", loadBasis: null },
name: "an assistance load basis -> LOAD_BASIS_UNSUPPORTED",
  exercise: { ...BARBELL, loadBasis: "assistance" },
```

— with the comment "the code must still have a Release-A fixture, since it is no longer in `RELEASE_B_ONLY_REASON_CODES`", and the suite asserts *"the two new codes are Release-A-reachable, not Release-B-only"*. No name-based exclusion exists anywhere.

The code is the better choice — full reachability now, no carve-out to remember to remove in Release 2. The **binding document is what is wrong**, and it lands in the same commit as the test it misdescribes. Fix the text to say the codes are reachable by fixture in Release 1 and unobservable in product data until Release 2.

### 5.3 L-2 — copy phrasing mismatch between the amended §15.4 table and the shipped map

| Source | `MEASUREMENT_PROFILE_UNSUPPORTED` phrasing |
| --- | --- |
| `estimated-1rm-load-translation-architecture-revision.md` §15.4 (new row) | "Not available for this exercise's **tracking** type" |
| `src/ui/strength/copy.ts` (shipped) | "Not available for this exercise's **measurement** type" |

`strengthReasonCodes.test.ts` asserts membership in both directions but not the strings, so nothing catches the drift. "measurement" is the better word (it is the column's name and the feature's name); align the document to the code.

### 5.4 L-3 — `updateExercise`'s `23503` mapping is too broad (product)

`src/server/exercises/service.ts` now ends with:

```ts
// §10.3 backstop — the only FK a metadata PATCH can violate is the
// mirror `fk_session_exercises_exercise_profile` (userId is never
// patched here) …
if (isPostgresErrorCode(err, FOREIGN_KEY_VIOLATION)) throw new MeasurementProfileLockedError();
```

The comment's premise is not true. The same transaction also `INSERT`s into `exercise_muscle_contributions`, whose `muscle_group_id` carries its own `ON DELETE RESTRICT` FK to `muscle_groups`. **Reproduced** on a database whose taxonomy is incomplete: a `contributions`-only PATCH that parses cleanly through `updateExerciseSchema` produced

```
thrown: MeasurementProfileLockedError: Measurement profile is locked once the exercise is used in history or a template
mis-mapped ... (HTTP 409 measurement_profile_locked): true
```

on a request that never mentioned the measurement profile. Before this release the catch rethrew, yielding a 500 — also wrong, but not *confidently* wrong.

**Reachability is narrow.** `updateContributionsListSchema` restricts slugs to `MUSCLE_GROUP_SLUGS`, and a seeded database holds all of them (18 rows for 17 leaves + the `back` rollup), and the deploy pipeline runs `db:seed` before the app swap. So this needs a database whose taxonomy trails the code. **LOW**, but the fix is one line: scope the mapping to the mirror FK's constraint name, or move it inside the `input.measurementProfile !== undefined` branch.

### 5.5 L-4 — the two new strategy `throw`s are a latent poison-batch path (product)

To typecheck against the four-member union, `loadProgression.targetRepsPerSet` and `repProgression.schemeMinReps` gained:

```ts
throw new Error(`load-progression does not support ${scheme.type} schemes`);
```

These are correctly unreachable today: `evaluateSession` skips non-`load_reps` slots, then `supportsScheme(profile, strategyId, schemeType)` routes any incompatible scheme to `unsupportedSchemeDraft` before a strategy runs. But `evaluateSession` executes inside `applySyncBatch`'s completion transaction, and the catch there maps only PostgreSQL codes — a plain `Error` propagates and **fails the whole request**, which is precisely H-17's poison-batch shape. Every other unreachable branch on this path (`manual`, an unparseable config, a shape-mismatched row in `mapWorkSetRows`) fails closed with a `continue`. Aligning these two with that idiom — returning a sentinel the caller already handles, or narrowing the parameter type — would remove the class entirely. `src/domain/progression/repProgression.ts:53`'s `prefill.reps ?? schemeMinReps(scheme)` reaches the same throw and is worth including in the fix.

### 5.6 L-5, L-6 — two imprecise sentences in otherwise accurate amendments

- `progression-engine.md`: the new paragraph is headed **"SQL → domain boundary rule (I-14, athletic measurement profiles)"** but states I-13; its body then cites "§18.1 I-13" correctly. Swap the heading's id.
- `data-model.md` §2.4: "`measurement_profile` **and `load_basis`** are locked once the exercise is referenced by any `session_exercises` or `exercise_prescriptions` row (`409 measurement_profile_locked`, service rule for both …) — `load_basis` alone stays editable with history after that". `load_basis` is never locked, in code or at the database (proven in §3.6: a `per_hand` edit on a referenced exercise applies). The trailing clause rescues the sentence, but the opening reads as the opposite of the truth; drop `load_basis` from the first clause.

### 5.7 L-10 — NC-3's DB-layer expectation cannot happen through the real service

§13.5's NC-3 says that with the service check stubbed, "the same op fails the composite FK as `23503` → `invalid_reference`, **because the row carries the default profile**". It does not: `applySetLogUpsert` writes `measurementProfile: parentProfile`, the value derived from the parent slot, so a bypassed pre-check produces a *shape* violation (`23514 → invalid_measurement`), not an FK violation. I confirmed this through the real service in §3.5.

The implementation's behaviour is strictly safer than the spec assumed (the row can never disagree with its parent), and its tests reach the composite FK the only way that remains available — a raw `db.insert` that lets the column default apply. **The specification is what needs correcting**, not the code or the test.

### 5.8 L-11 — NC-9's client half is not implementable under O-7's Release-1 scope

§13.5 tags NC-9 as R1 and its text covers both `evaluateSession` **and** `buildClientRecommendationOps`. The second requires the client aggregate to carry `measurement.profile` — a client-DTO widening O-7 option (b) explicitly excludes from Release 1. The implementation deferred site 2 and said so plainly in its §6 site table. That is the right call and it is unobservable: the Release-1 client cannot produce a non-`load_reps` slot (the profile selector is locked, `validateSetInput` still requires reps, and the client's `ActiveSessionSetDto` has no nullable fields). Record the split in §13.5 the way NC-1's row already does ("R1 (server), R2 (client)").

### 5.9 L-12 — two disclosed, currently-unreachable seams

- **Client `ActiveSessionSetDto`.** `src/server/today/service.ts`'s DTO widened to `number | null`; the client mirror in the untouched `src/sync/types.ts` stays `number` and gained no `distanceM`/`durationS`. Self-disclosed in the report's §14. Unreachable in Release 1; must be closed by whichever Release-2 stage builds the athletic active-session UI.
- **`applySessionExerciseUpsert`'s update path.** It still writes `patch.exerciseId` from the payload with no user-scoped check and no re-derivation of `load_basis`. A cross-profile swap is refused `23503` by the mirror FK (mapped to `invalid_reference` — fails closed); a **same-profile** swap succeeds and leaves the old exercise's basis frozen on the slot. §10.1 and I-14 scope the derivation to *insert* only, so this is outside Release 1's stated contract, and in Release 1 every exercise is `load_reps / unspecified` so no basis can actually go stale. Worth an explicit line in `pwa-offline-strategy.md` §5 before Release 2 unlocks the basis selector.

---

## 6. Acceptance criteria and negative controls — audit

Each row records whether I could confirm the criterion is **genuinely load-bearing**, not merely present.

| Id | Verdict | Basis |
| --- | --- | --- |
| A-1 | load-bearing | type-level `satisfies` + runtime table; discovered-inventory guard fails on a fifth file |
| A-2 (R1 clauses) | load-bearing | per-profile required/optional/forbidden at domain, service and DB layers; ceilings and ceiling+0.01 with the **actual** SQLSTATE per column (§3.3) |
| A-3 | load-bearing | full §9.2 exhaustiveness test plus my own service-path proof of both issue kinds and all §9.3 rules (§3.6) |
| A-4 | load-bearing | ordering asserted with each later gate deliberately failing, both directions; the two codes proven absent from `RELEASE_B_ONLY_REASON_CODES` |
| A-5a | load-bearing | NC-1 exact-equality + mutation witness; NC-9 spy; NC-10 dual detector; NC-11 both switch directions |
| A-6a | load-bearing | all eight §15.4 lines plus `m:ss`; `formatScheme` is a `switch` so a fifth variant fails to compile |
| A-7 | load-bearing | snapshot with and without `measurement`; unknown-variant rejection |
| A-8 | **strongly** load-bearing | synthetic forbidden edge + zero-specifier anti-vacuity witness (§3.7) |
| A-9a | load-bearing | reproduced end to end through the real `applySyncBatch` (§3.5) |
| A-10 | load-bearing | reproduced through the real `createExercise`/`updateExercise`, both lock halves (§3.6) |
| A-11a | load-bearing | reproduced through the real `createPrescription`, all six cases (§3.6) |
| A-12 | load-bearing | bundle `measurement` per entry; `prefill.loadKg`/`prefill.reps` both null on a `durationRounds` slot; nullable history DTOs |
| A-14 | load-bearing | `load_distance` excluded; `reps` default-`off` then counting on `'auto'`; `'off'` excludes a `load_reps` exercise |
| A-17 (R1) | load-bearing | independently reseeded: 93/93 entries `load_reps / unspecified / auto`, reseed byte-identical (§3.8) |
| A-18 | load-bearing | all clauses reproduced through the real service (§3.5) |
| A-19 | load-bearing | NC-5 and NC-12 reproduced on real PostgreSQL 16 with five drop-and-retry controls (§3.3); `db:generate` no-drift |
| NC-1 | load-bearing (server half) | exact-equality with a mutation witness; client half correctly deferred to R2 per §13.5 |
| NC-2 | load-bearing | byte-identical row through the real service |
| NC-3 | load-bearing, **spec text wrong** | service half proven; DB half proven by raw insert — see L-10 |
| NC-4 | load-bearing | full matrix + boundary rows + the catch-block regression guard, which I re-proved independently (§3.5) |
| NC-5 | **strongly** load-bearing | both composite FKs, both lock directions, each with a drop-and-retry control |
| NC-9 | load-bearing (server half) | non-invocation by spy, mixed session, every profile — client half see L-11 |
| NC-10 | **strongly** load-bearing | fixture contains a legitimate single **and** a legitimate `0 kg` set, so coercion is detectable |
| NC-11 | load-bearing | `'auto'` on an incompatible profile still excludes in both the volume and strength directions |
| NC-12 | load-bearing | migration idempotent, `db:generate` no-op, shape CHECK proven non-vacuous |
| NC-14 | load-bearing | basis-changed-applies proven against the **stored** value through the real service, not just the result code |
| NC-6, NC-7, NC-8, NC-13 | correctly not attempted | Release-2 rows |

---

## 7. Scope audit — the 79 files

`git diff --stat` against `05982f6` reports exactly **66 files changed, 2,986 insertions(+), 391 deletions(-)**, matching the report's §1 figure. Two of the 66 — `CLAUDE.md` (a compaction-instructions block) and `docs/input/product-ideas.md` (PI-005 itself, the input to this work) — are pre-existing, user-owned working-tree changes; I inspected both diffs and neither contains implementation content. 64 + 15 untracked = **79**, as claimed. The 15 untracked files total 5,490 lines, of which 3,143 are the generated `0013_snapshot.json`; the remaining 2,347 is exactly the report's figure (see L-7 on the phrasing).

**No Release-2/3 work and no unrelated change is present.** Every boundary path diffs empty (§3.8); no reconcile file, no catalog edit, no measurement UI, no caption change, no client emission, no IndexedDB change, no service-worker change. The only scope observation is **L-8**: the new integration suite includes an A-13 block that §20/§21.2 scope to Release 2. It tests server behaviour Release 1 genuinely ships (history read, correction and delete-with-renumber on a `load_distance` slot, through the already-landed acceptance layer), so it is coverage, not product work — but the manifest and acceptance table should say so.

---

## 8. Documentation audit — the eight §24.1 amendments

| Document | Amendment | Accurate? |
| --- | --- | --- |
| `data-model.md` §2.4/§2.13/§2.14 | seven columns, two dropped NOT NULLs, two unique pairs, two composite FKs, the shape CHECK, the "no separate enum CHECK" note, permanent defaults, plus the previously-missing `strength_estimate` row | **Yes**, except the `load_basis` lock sentence — **L-6** |
| `domain-model.md` §7/§9/§10 | the one field the "all metadata mutable" policy excludes; I-1/I-3/I-13/I-14 added as invariants 11–14 | **Yes** — verified against the code, including the explicit "`loadBasis` and `volumeCounting` are **not** covered by this exception" |
| `volume-model.md` §1/§2 | the Work-set definition's profile and switch clauses, the `reps` default, the Training-card-is-a-separate-count note | **Yes** — matches `aggregate.ts` exactly |
| `prescription-model.md` §2/§6 | the two variants (schema R1 / editor R2), the §9.2 table, §9.3's field rules, the §9.4 deload note | **Yes** — the table matches `compatibility.ts` cell for cell |
| `progression-engine.md` §2/§5 | the profile precondition and the no-coercion boundary rule | **Yes**, except the heading's invariant id — **L-5** |
| `pwa-offline-strategy.md` §5 | profile-scoped emission (server R1 / client R2), the profile-only comparison with `loadBasis` ignored, the two new reject reasons | **Yes** — the strongest of the eight; it states the R1/R2 split explicitly |
| `estimated-1rm-…-revision.md` §9.6/§15.4/I-14/A-19 + §25.4 | the O-17 amendment, with an explicit disambiguation against that document's own unrelated "O-17" label | **No** — **L-1** (A-19) and **L-2** (§15.4 phrasing) |
| `ADR-011` deferred list | D-11 marked discharged, pointing at §11.5–§11.6 | **Yes** |

Six of eight are accurate. The disambiguation of the two colliding "O-17" labels is a genuinely careful touch and worth crediting.

---

## 9. Implementation-report claim audit

| Claim | Verdict |
| --- | --- |
| 66 tracked files, 2,986/391, 15 untracked, 79 total | **Confirmed** (phrasing nit: **L-7**) |
| Migration SQL is a term-for-term match to §8.1–§8.3 | **Confirmed** by direct catalog inspection |
| Hand-reorder was needed (`42830`) and changed no statement text | **Confirmed** — the ordering is §14.1's, and `db:generate` reports no drift |
| Physical column-add order on `set_logs` differs from §8.3's prose; semantically inert | **Confirmed** — no positional access anywhere; Drizzle addresses by name |
| Zero value change migrating realistic pre-`0013` data | **Confirmed independently** on my own fixture (§3.2) |
| Every composite FK, CHECK, cascade and boundary proven non-vacuous | **Confirmed independently** with my own drop-and-retry controls (§3.3) |
| §14.5 rollback row not independently re-derived | **Now derived** — and it holds (§3.4) |
| The `23514` catch-block mapping is load-bearing; the fix works | **Confirmed independently** through the real service path (§3.5) |
| `22003` is structurally unreachable via any parsed payload | **Confirmed** against the actual Zod bounds and column precisions |
| Client emitters untouched; nine hard boundaries intact | **Confirmed** by diff and grep (§3.8) |
| 981 / 428 / 112 / clean build (40/40) | **Confirmed exactly**, all re-run |
| Bundle delta 50–68 bytes, not §21.6's "roughly 40" | **Confirmed** (I measured 50 and 68 at the extremes) |
| "Every percentile moved ~20 ms / ~100–110%"; cold-container attribution | **Wrong on both counts** — **M-1** |
| 44 / 45 tests in the new sync suite | **Stale** — the shipped file has 46 (**L-7**) |
| No commit, push, tag, deploy; production never contacted | **Confirmed** — `git log` head is still `05982f6`, working tree unchanged |
| Cleanup: only `gym-app-db-1` remains; no scratch artifact in the repo | **Confirmed** for the implementation's containers, and for mine (§11) |

The report is unusually honest in most places — it volunteers the coverage gap it found and fixed, the physical-column-order nit, and the two seams in §14. M-1 is the one place where its self-criticism points at the wrong thing.

---

## 10. Remediation scope

Everything below is text except two optional one-line code changes. **None of it requires re-deriving any evidence in §3.**

1. **M-1.** Rewrite §8 of the implementation report against the corrected baseline (`metrics-dashboard-remediation.md` §L-10's 43.56 ms p95 at the 31,200-row shape, and its siblings' 44.97 / 53.48 ms), state that this release shows no regression, drop the cold-container attribution, and withdraw the instruction in §8/§11 to propagate the ~20 ms figure. Cite the `EXPLAIN` A/B if useful (0.478 vs 0.538 ms for the volume query with and without the new join).
2. **L-1.** Correct the amended A-19 in `estimated-1rm-load-translation-architecture-revision.md` to describe the shipped design: both codes are fixture-reachable in Release 1 and are deliberately not in `RELEASE_B_ONLY_REASON_CODES`; they remain unobservable in product data until Release 2.
3. **L-2.** Align §15.4's phrasing row to the shipped copy ("measurement type").
4. **L-5, L-6.** Fix the invariant id in `progression-engine.md`'s heading; drop `load_basis` from `data-model.md` §2.4's lock clause.
5. **L-7, L-8.** Correct the test counts and the file-arithmetic phrasing in the report; note the A-13 block as deliberate extra coverage.
6. **L-9, L-10, L-11.** Record the three specification corrections (one new join; NC-3's DB-layer expectation; NC-9's release split) wherever this lineage records spec corrections.
7. **L-3** *(optional, one line)*. Scope `updateExercise`'s `23503` mapping to the mirror FK's constraint name, or move it inside the `input.measurementProfile !== undefined` branch.
8. **L-4** *(optional)*. Replace the two strategy `throw`s with the fail-closed idiom the surrounding code already uses.
9. **L-12.** Note both seams in `pwa-offline-strategy.md` §5 so Release 2 inherits them explicitly.

---

## 11. Cleanup

- The single disposable container `mp-r1-review-a` (`postgres:16`, port 55433) and its databases (`clean0013`, `pre0013`, `nonvac`, `syncprobe`, `seedcheck`, `e2echeck`, `perfcheck`, `lockprobe`, `rollbackcheck`) were removed at the end of this pass; `docker ps -a` shows only the pre-existing persistent `gym-app-db-1`.
- **`gym-app-db-1` was never connected to by this review** — not for migration, not for seeding, not even for a schema diff. Production was never contacted.
- No Next.js server process survived: Playwright's own `webServer` was reaped, and `http://localhost:3000/api/health` refuses connections.
- Every scratch script, SQL file, fixture and snapshot lived under the session scratchpad. **`git status --porcelain` is identical before and after this review** — 89 entries, the same set, with `src/`, `tests/`, `drizzle/`, `scripts/` and `package.json` showing exactly the implementation's own changes and nothing else. The only file this review added to the repository is this document.

---

## 12. What this review credits

Independently proven, not taken on trust: the exact schema and every constraint; zero value change on realistic pre-`0013` data; both composite foreign keys and both directions of the profile lock, each with a non-vacuity control I built myself; the cascade behaviour on a multi-row fixture; the real SQLSTATE per numeric boundary; the H-17 poison-op mapping exercised through the real `applySyncBatch` with the JS pre-check forced open; the profile-only slot comparison with the payload `loadBasis` genuinely ignored; the profile-scoped creation-required fields and effective-row validation on both create and update; both halves of the §10.3 lock through the real services; the full §9.2/§9.3 prescription gate; the seed's Release-1 behaviour and reseed idempotence; the nine hard boundaries by diff and grep; and 112/112 e2e on a fresh database and a real production build.

Two design decisions deserve particular credit. **Writing the derived parent profile explicitly on every set insert** (rather than relying on the column default) is stronger than the specification assumed and is what makes NC-3's DB-layer expectation obsolete. And **the `setLogPreCheck` holder-object seam**, added to close a real coverage gap the implementation's own audit found, is the minimal correct pattern for this codebase's test transform — I reproduced its behaviour independently and confirmed the mapping it protects is genuinely load-bearing.

---

## 13. Verdict

Release 1 is, as an artifact, correct and safe. No BLOCKER, no HIGH, and no product defect above LOW; both LOW product findings are unreachable through any path an athlete or the deploy pipeline can take. The migration is additive and non-reinterpreting, the database has the last word exactly where §8 says it should, the poison-op class H-17 exists to prevent is genuinely closed, and nothing an athlete can observe has changed.

What blocks a clean sign-off is the record, and §24.1 makes the record part of this release: the commit as it stands would carry a **binding clause in the e1RM revision that states the opposite of its own shipped test**, a copy phrasing the code does not use, two imprecise invariant statements, and an implementation report whose headline performance finding reports a regression that the repository's own review lineage already disproved — while instructing the next maintainer to write that phantom into the architecture documents. All of it is textual, all of it is scoped in §10, and none of it requires re-running any verification in this document.

**READY FOR REMEDIATION**
