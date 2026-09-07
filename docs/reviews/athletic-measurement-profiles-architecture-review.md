# Athletic Exercise Measurement Profiles — independent architecture review (PI-005)

**Date:** 2026-09-07
**Under review:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` (776 lines, dated 2026-09-07)
**Baseline traced:** working tree at `05982f6` (metrics dashboard), migrations `0000`–`0012`
**Reviewer stance:** adversarial and independent. Every claim below was re-derived from the repository, the shipped migrations and a live PostgreSQL probe — not from PI-005 and not from the evaluation's own citations. Where the evaluation is right I say so and stop; where it is wrong I give the file, the line and the mechanism.
**Scope discipline:** no production code, migration, test, seed, architecture document, ADR or existing review was modified by this pass. The only file this pass creates is this one. Nothing was committed, pushed or deployed; production was not contacted.

---

## 0. Verdict

**REVISION REQUIRED.**

The abstraction is right, the vocabulary is right, and the integrity model is better than the brief asked for — the composite foreign key genuinely proves at the database level both that a set's shape matches its slot and that a slot's frozen profile can never be edited afterwards (verified, §2.3). Roughly eighty percent of this document is implementable as written.

It cannot go to owner decisions yet because three defects would produce lost or wrong data if built as specified, and because four of the twelve owner decisions are mis-posed or unanswerable in their current form:

- the exact DDL in §8.3 specifies a bound its own column type cannot store, and the resulting error class is the one unmapped SQLSTATE that wedges the outbox permanently (**BLOCKER-1**);
- Release 1 ships a seed reconcile that converts two seeded exercises to profiles the Release-1 client cannot log, and the deploy pipeline runs that reconcile *before* the app is swapped (**BLOCKER-2**);
- §14.5's rollback analysis is materially wrong: the mandated always-emit rule makes every set op unparseable by the previous build, and every one of them becomes a permanent dead letter (**BLOCKER-3**).

Two further defects (HIGH-1, HIGH-2) are product-design errors rather than mechanics: the volume default fails **open** for exactly the athletic movements PI-005 said must default closed, and the "fail-closed progression" path produces a recommendation record that the schemas the evaluation calls unchanged cannot store.

None of this is fatal to the design. Every correction below is local; none requires a different model.

---

## 1. Method

Independently inspected, in this order and without reference to the evaluation's line numbers until afterwards: `src/db/schema/{exercises,sessionExercises,setLogs,recommendations}.ts`; `drizzle/0011`, `drizzle/0012` and the migration meta layout; `src/domain/{sync,schemas,schemes,progression,strength,volume,metrics,exercises,prescriptions}`; `src/server/{sync,progression,volume,today,history,exercises}/service.ts`; `src/sync/{activeSession,corrections,flush,db,bundleCache,types,activeSessionStore}.ts`; `src/app/sw.ts`; `src/ui/{workout/ExerciseCard,history/HistoryDetail,strength/copy,decimalInput}`; `src/db/seed/*`; `eslint.config.mjs`; `tests/unit/metricsBoundary.test.ts`; the integration and e2e inventories; `.github/workflows/deploy.yml`; and the ADRs, architecture documents and review lineage the evaluation cites as binding.

Constraint behaviour was not reasoned about on paper. A scratch schema reproducing §8.1–§8.3's exact DDL was built on the **local Docker PostgreSQL 16 instance** (`gym-app-db-1`, `localhost:5432`), loaded with eleven adversarial fixtures and twelve negative controls, and dropped again; a second probe confirmed the SQLSTATEs. Both scratch schemas were verified gone (`select nspname from pg_namespace where nspname like 'pi005%'` → empty). Production was not touched.

"The evaluation" means the document under review. "The design" means what that document proposes. Line references are to the working tree at `05982f6`.

---

## 2. What the evaluation gets right

This is not a courtesy section — each item below was independently checked and is load-bearing for the corrections that follow.

### 2.1 The abstraction and the vocabulary

**Correct.** A closed enum on the exercise, frozen per slot, denormalised onto the set row, with per-profile CHECKs, is the right representation, and §5.2's rejection of the capability-bag (B), discriminator-less (C) and JSONB (D/E) alternatives is sound. `set_logs` is indeed the one fact table with no JSONB, and ADR-008 confines versioned JSON to prescriptions and snapshots.

The six profiles cover every class PI-005 names, with no invalid combination reachable:

| PI-005 class | Profile | Verified |
|---|---|---|
| Sled push / pull / drag | `load_distance` (duration optional) | fixture F3, F4 |
| Farmer / suitcase carry | `load_distance` | F3 |
| Sprint / shuttle run | `distance_time` | F5 |
| Med ball slam / throw | `load_reps` + capability switches | paper (see HIGH-1) |
| Jumps / plyometrics | `reps` | F8 |
| Plank / isometrics | `duration` | F6 |
| (additive) weighted hold | `load_duration` | F7 |

Refusing `power_reps` as a profile (§5.3) is exactly what PI-005 asked for: intent is not a measurement. Naming profiles after their dimensions rather than after `strength_reps` is a genuine improvement on the brief's own candidate list, and the reasoning — that the same shape records a med-ball slam where no strength claim exists — is correct.

X-18's justification for splitting `load_distance` from `distance_time` (one profile cannot express both required-ness rules) is right and I could not construct a counterexample.

### 2.2 `load_basis` as a label and a gate, never arithmetic

**Correct and important.** I-4's "no arithmetic is applied to `weight_kg` because of `load_basis`" is the only defensible v1 rule: doubling a `per_hand` load or inverting an `assistance` load would reinterpret stored facts, which ADR-007 forbids. Making `unspecified` permanent rather than back-filling it from `equipment` (X-6) is right for the reason given — `dumbbell` covers a goblet squat and a pair of rows, and `src/ui/strength/copy.ts:135` already concedes the ambiguity in shipped copy.

### 2.3 The composite foreign key does more than the evaluation claims

Probed against real PostgreSQL, `fk_set_logs_parent_profile` delivers three properties, only two of which §8.3 claims:

| Probe | Result | Consequence |
|---|---|---|
| Insert a set whose `measurement_profile` differs from its parent slot's | `23503` | Set↔slot agreement is proved by the database (claimed) |
| `UPDATE session_exercises SET measurement_profile = …` while child rows exist | `23503` — *"update or delete on table … violates foreign key constraint"* | **I-3's "frozen … never updated" is enforced by the database, not only by convention.** The evaluation does not claim this; it should |
| `DELETE` the parent slot | cascade fires, zero orphans | The composite FK never blocks the existing `session → session_exercises → set_logs` cascade (claimed) |

That second row is a real strength of the design and deserves to be stated as an invariant rather than left as a side effect.

### 2.4 Existing data and existing meaning

**Correct.** Every current `set_logs` row satisfies the `load_reps` branch by construction, so §14.2's "no value changed, no meaning changed" holds. Two specific hazards are handled correctly:

- **`weight_kg = 0` stays legal** in both `load_reps` and `load_distance` (fixtures F2 and F4 both inserted cleanly). `data-model.md:230` — "0 = bodyweight-only" — is preserved, and H-12 is respected.
- **Freezing the profile on the slot, not reading it live from the exercise, protects history.** A Plank that becomes `duration` in Release 2 keeps its *old* `load_reps` sets counting in volume and rendering as `kg × reps`, because both consumers read the frozen slot column. This is the correct answer to PI-005's "so later exercise edits cannot reinterpret historical logs", and it is the reason the design can afford to change the volume rule at all.

### 2.5 The offline reasoning is sound where it is checked

I walked all four replay orderings of a full-row-plus-partial batch against `applySetLogUpsert` (`src/server/sync/service.ts:722-896`) and confirm §13.1's determinism claim. Two mechanisms make it work, and the evaluation identifies both:

- the create path writes the whole payload; the update path writes only `writable` (V-2), and the excluded fields are precisely the ones a later op will set — so first application and replay converge on identical rows;
- **shape validity depends only on the profile**, so any field-wise merge of two rows valid under the same frozen profile is itself valid. That is what makes D-03's field-level merge (`deviations.md` D-03, "residual risk being carried") unable to produce a shape-invalid row under concurrent multi-device correction. §13.2's last row is right, and for the right reason.

### 2.6 Smaller things, all verified

- `PrescriptionSnapshot` stays `v = 1` (X-7). Correct: `prescriptionSnapshotDataSchema` is a plain `z.object`, not `.strict()`, so an old parser strips an unknown `measurement` key rather than rejecting the snapshot. Bumping to `v = 2` really would break old clients on *every* new snapshot.
- `applyWeekModifiers.ts` needs **no** change at all: `applySetMultiplier` is written as `{ ...scheme, sets }` and is generic over any variant carrying `sets`. The evaluation says "no new branch beyond reading `sets`" — in fact zero.
- The e2e positional-index hazard is correctly identified and avoided. Three specs (`offline-set-edit-delete`, `reconnect-batch-idempotence`, `transient-failure-fifo`) address the set row's inputs by index because they carry no accessible names; keeping the `load_reps` column order unchanged is what keeps them green. The in-repo comment at `ExerciseCard.tsx:419-427` says so explicitly.
- `src/domain/measurement/**` needs no ESLint change: `boundaries/elements` matches on `src/domain`, and `domain → domain` is already allowed. R-10 is correctly rated Low.
- H-13 holds: `tests/unit/metricsBoundary.test.ts:316-321`'s `COLUMN_PATTERNS` are `/tonnage/i`, `/work_?sets?/i`, `/e1rm_?(kg|value)/i` and two others; `distance_m`, `duration_s`, `measurement_profile`, `load_basis` and `volume_counting` match none.
- Deploy ordering favours the design: `.github/workflows/deploy.yml` runs `db:migrate` (line 106) then `db:seed` (109) then the App Service deploy (121). An additive migration whose columns all carry defaults is therefore safe for the still-running previous build — which is exactly why §8's "keep the defaults permanently" is the right call. (The *seed* step in that same window is not safe; see BLOCKER-2.)
- Citation accuracy is unusually high. I spot-checked about twenty-five file/line references; two are wrong (§5, LOW-1/LOW-2) and the rest land within a line or two.

---

## 3. Independent lifecycle trace

The chain, re-derived, with what the design changes and what it misses at each hop. Items in **bold** are where a finding lands.

1. **Exercise definition** — `POST /api/exercises` → `createExercise` (`src/server/exercises/service.ts:179-218`). `createExerciseSchema` (`src/domain/exercises/schema.ts:143-160`) ends in `.transform()`, so it strips unknown keys rather than rejecting them; `updateExerciseSchema` is `.strict()` and has **no history guard** (`service.ts:234-241` patches `equipment`, `loadStepKg`, `strengthEstimate` unconditionally). **MEDIUM-2** (required create field breaks stale clients).
2. **Prescription** — `checkPrescriptionCompatibility(scheme, progression)` (`src/domain/prescriptions/schema.ts:70-84`) is service-layer precisely so PATCH can validate the *effective* merged combination; `exerciseId` is patchable (`updatePrescriptionSchema:44`), so §9.2's third argument does catch a cross-profile exercise swap. Correct as designed.
3. **Template** → **bundle** — `TodayBundleExerciseEntry` (`src/server/today/service.ts:71-95`); `/api/today-bundle` is the *only* API GET the service worker caches (`sw.ts:250-269`, NetworkFirst/3s, 24 h); every other API GET including `/api/exercises` and `/api/history` is `NetworkOnly` (`sw.ts:270-285`). The evaluation's NetworkOnly claim for the exercise search is correct, and it means history detail can never be served stale — one hazard fewer than the design allows for.
4. **Session start / snapshot** — `startSession` (`src/sync/activeSession.ts:252-316`) freezes each entry; the server writes `prescription` on insert only (`sync/service.ts:637`, and the update path deliberately ignores it, `:548-553`). Ad-hoc slots send `prescription: null` (`activeSession.ts:377`). **MEDIUM-5** (ad-hoc slots have no profile-agreement check at all).
5. **Set log** — `logSet` → `setLogFullRowOp` (`activeSession.ts:215-232`, nine keys) → outbox → `flushOutbox` (batches of 50) → `applySetLogUpsert`. `editSet` also emits a **full row**, not a patch — `EditSetPatch` mutates the local aggregate and then `setLogFullRowOp(exercise.id, set)` goes on the wire (`activeSession.ts:570-579`). **BLOCKER-3**, **HIGH-3**.
6. **Offline outbox / replay** — one transaction per op in arrival order; `onConflictDoNothing` then update; `writable` exclusion; only `23505` and `23503` are mapped (`sync/service.ts:887-894`), everything else propagates and fails the whole request by design (`:36-42`). **BLOCKER-1**.
7. **History correction / deletion** — `correctHistorySet` (`src/sync/corrections.ts:21-33`) is the one partial emitter and the one that bypasses `buildSetLogUpsertPayload`; deletion goes through `buildSetDeletionOps` → delete + ascending full-row renumber upserts, with `SetLogRowFields` (`setDeletionOps.ts:17-24`) requiring `weightKg: number` and `reps: number`. Correctly identified.
8. **Progression** — `getWorkSetsByExercise` (`src/server/progression/service.ts:117-131`) maps rows to `PerformedSet{weightKg, reps, rir}` **before** `evaluateSession` sees them, for both the evaluated session and the cross-session history window. **HIGH-2**.
9. **Volume** — `queryWorkSetContributionRows` (`src/server/volume/service.ts:177-215`) has no per-exercise exclusion; `aggregateVolume` filters `isWarmup` only (`aggregate.ts:167-175`). Plank and Farmer's Carry do count today, as claimed. **HIGH-1**.
10. **Estimated 1RM** — `evaluateExerciseEligibility` (`eligibility.ts:29-37`) is equipment → switch, with "the category code wins" stated in the comment above it and in the binding revision's §9.6 ordered refusal list. **MEDIUM-3**.
11. **Metrics dashboard** — `isSelectionEligible` (`selection.ts:37-41`) reuses that function with a placeholder `loadStepKg`; it will need the two new fields threaded through the selection service. Training card counts every non-warm-up row (`training.ts:41-44`). O-6 is a real decision, but under-specified (§7).

---

## 4. Adversarial fixtures

Eleven positive fixtures and twelve negative controls, run against §8's exact DDL on local PostgreSQL 16. Only the last three rows are paper fixtures (they sit above the database layer).

| # | Fixture | Expected | Observed |
|---|---|---|---|
| F1 | Conventional lift, `load_reps`, 80 kg × 8 @ RIR 2 | accept | accept |
| F2 | Bodyweight push-up, `load_reps`, **0 kg** × 12 | accept (H-12) | accept |
| F3 | Sled push, `load_distance`/`total`, 60 kg · 20 m, no time | accept | accept |
| F4 | Empty sled, `load_distance`, **0 kg** · 20 m · 12.40 s | accept | accept |
| F5 | Sprint, `distance_time`, 40 m · 5.62 s | accept | accept |
| F6 | Plank, `duration`, 45 s | accept | accept |
| F7 | Weighted plank, `load_duration`, 20 kg · 45 s | accept | accept |
| F8 | Box jump, `reps`, 5 | accept | accept |
| N1 | Old nine-key client op (`weightKg`, `reps`) onto a `load_distance` slot | reject | reject — **`23503`, not `23514`** (the composite FK fires first, because the op carries the default profile). Maps to `invalid_reference` today, not `invalid_measurement`. NC-3 must expect this |
| N2 | Shape-valid `duration` row under a `load_distance` parent | reject | `23503` |
| N3 | RIR on a carry | reject | `23514` |
| N4 | `distance_m = 100000`, the design's own CHECK ceiling | reject as `23514` | **`22003` numeric field overflow — unmapped.** See BLOCKER-1 |
| N5 | `duration_s = 86400`, the design's own ceiling | accept | accept (fits `numeric(7,2)`) |
| N6 | Correction clearing required `distance_m` on `load_distance` | reject | `23514` |
| N7 | Correction clearing **optional** `duration_s` on `load_distance` | accept | accept |
| N8 | Post-rollback old build writing `weight_kg`/`reps` onto a `duration` row | reject | `23514` — unmapped in the *old* build → 500 → whole batch fails. See BLOCKER-3 |
| N9 | Unknown profile value (`jump_height`) on `set_logs` | reject | `23514` (the shape CHECK's OR-chain rejects it; no separate enum CHECK is needed on `set_logs`, and none is specified — deliberate, but say so) |
| N10 | `distance_time` slot carrying a `load_basis` | reject | `23514` `ck_se_lb_presence` — the presence rule is exclusive in both directions |
| N11 | Parent slot profile UPDATE with children present | reject | `23503` — freeze enforced by the database |
| P1 | Med ball slam, `load_reps`/`total`, equipment `other`, `volume_counting` default `auto` | should not count as a hypertrophy work set | **counts** — HIGH-1 |
| P2 | Broad jump / box jump, `reps`, seeded per §16 | should not count | **counts** — HIGH-1 |
| P3 | Legacy cached bundle (no `measurement`) starting a `load_reps` session | identical to today | identical — correct, and A-23 tests it |

---

## 5. Findings

### BLOCKER-1 — `distance_m numeric(7,2)` cannot store the bound its own CHECK declares, and the resulting error wedges the outbox

*Class: product-design / correctness defect in the exact DDL the owner is being asked to approve.*

§8.3 specifies:

```sql
distance_m numeric(7,2)
CHECK (distance_m > 0 AND distance_m <= 100000)
```

and §12.2 mirrors it on the wire as `z.number().gt(0).max(100000).multipleOf(0.01)`.

`numeric(7,2)` holds at most **99999.99** — precision 7 with scale 2 leaves five integer digits. Confirmed on the local instance:

```
select 99999.99::numeric(7,2)  ->  99999.99
select 100000::numeric(7,2)    ->  ERROR: numeric field overflow
                                   DETAIL: A field with precision 7, scale 2 must round
                                           to an absolute value less than 10^5.
SQLSTATE                       ->  22003
```

The CHECK's upper bound is therefore unreachable, and the boundary value the wire schema **accepts** produces `22003`, which is not `23505`, not `23503` and not `23514`. `src/server/sync/service.ts:887-894` maps only the first two; `23514` is what §12.2 proposes to add. `22003` propagates, and by the design of the batch loop (`service.ts:36-42`) an unexpected error **fails the whole request**. `flush.ts` retains every op in that batch and backs off — so the op is never dead-lettered, never dropped and never applied: it retries forever, and every set logged behind it in FIFO order is stuck behind it.

This is precisely the R-2 poison-batch failure the design says I-8 prevents, arriving through a door I-8 does not cover. `weight_kg` shows the house convention the design departed from here: `numeric(6,2)` with a wire max of exactly `9999.99`.

**Required corrections**

1. Either widen to `numeric(8,2)` (if 100 km is genuinely wanted) or set the bound to `99999.99` in both the CHECK and the Zod schema. The second is the smaller change and still allows a 99.99 km carry.
2. `22003` must be mapped alongside `23514` to `invalid_measurement`. Any numeric column whose Zod ceiling is not *provably* below the column's storage ceiling can raise it, and rounding matters too: `99999.995` also overflows `numeric(7,2)`.
3. NC-4 must include a **boundary** row per numeric column — exact ceiling accepted, ceiling + 0.01 rejected as `invalid_measurement`, never as a request failure. As written, NC-4 tests only null/non-null combinations and would not have caught this.

### BLOCKER-2 — Release 1's seed reconcile makes two seeded exercises unloggable, and it runs before the app that could log them

*Class: product-design / release-sequencing defect.*

§21.1 puts "seed reconcile" in Release 1 while locking the profile selector to `load_reps` and offering no new scheme variant, and claims "no athlete-visible behaviour changes". §14.3's reconcile converts, when unreferenced:

- `bodyweight-plank` → `duration`
- `dumbbell-farmers-carry` → `load_distance` / `per_hand`

Three consequences, none acknowledged.

**(a) The exercises become unusable in Release 1.** A `duration` exercise accepts only the `durationRounds` scheme (§9.2), which the Release-1 prescription editor does not offer — so no prescription can be created for it at all. Ad-hoc adding it renders the `kg · reps · RIR` row, and the resulting op is rejected `invalid_measurement`. On a **clean database** — the path §14.4 explicitly covers — this is not an edge case: the catalog does not carry explicit `measurementProfile` values until Release 3 (§16), so every fresh seed inserts Plank as `load_reps` and the reconcile immediately flips it. §14.4's claim that both reconciles "find nothing to do" is false for Release 1 and contradicts §16 and §21.3.

**(b) The deploy window creates exactly the mixed-profile history §10.3 exists to prevent.** `.github/workflows/deploy.yml` runs `db:migrate` → **`db:seed`** → App Service deploy. The reconcile therefore lands in production while the **previous build is still serving**. That build knows nothing about profiles: it inserts `session_exercises` rows that take the column default `load_reps`, and `set_logs` rows that also default `load_reps`. The composite FK is satisfied (slot and set agree), so everything succeeds — and the account ends up with a `load_reps` session slot for an exercise whose profile is `duration`. §10.3's lock cannot prevent it: the lock's predicate was true at reconcile time, and the divergent slot is created afterwards by code that cannot see the column.

**(c) The design proves set↔slot agreement in the database but leaves slot↔exercise agreement to service code alone.** That asymmetry is what makes (b) possible. `session_exercises.exercise_id` is a plain `RESTRICT` FK (`src/db/schema/sessionExercises.ts:34-36`); nothing ties the slot's frozen profile to the exercise's.

**Required corrections**

1. **Remove the profile-changing reconcile from Release 1.** Keep only the `machine-assisted-pull-up` → `load_basis = 'assistance'` step, which is a label and is safe. Move the Plank and Farmer's Carry conversions to the release that ships their logging UI, and gate them on that release's own acceptance.
2. Add the mirror constraint: `exercises` gains `UNIQUE (id, measurement_profile)` and `session_exercises` gains `FOREIGN KEY (exercise_id, measurement_profile) REFERENCES exercises (id, measurement_profile)`. This closes (b) and (c), makes an old build's mis-frozen slot fail loudly instead of silently, and — as §2.3 showed for the set-level FK — turns §10.3's lock into a database guarantee for the `session_exercises` half rather than a service rule. The `exercise_prescriptions` half stays a service rule.
3. Fix §14.4: state what the reconcile does on a clean database in **each** release, and reconcile that statement with §16's Release-3 catalog change.
4. Re-pose O-5. As written it offers "leave silently" versus "archive"; the decision that actually matters is *whether the profile reconcile runs in Release 1 at all*.

### BLOCKER-3 — §14.5's rollback analysis is wrong: the mandated emission rule dead-letters every set op against the previous build

*Class: product-design / compatibility defect.*

§14.5 says a code rollback yields "degraded display, no crash path identified, no write path that could corrupt (old code cannot address the new columns)". Two mechanisms contradict this, and the first affects **all** set logging, not just athletic rows.

**(a) Always-emit versus `.strict()`.** §12.3 rule 1 requires `setLogFullRowOp`, the renumber upserts and `SetLogRowFields` to "always emit all eleven fields, writing `null` for fields the profile forbids. Never conditional." The previous build's `setLogUpsertPayloadSchema` (`src/domain/sync/schema.ts:99-112`) is `.strict()`. An op carrying `distanceM: null` therefore fails `safeParse` → `rejected(opId, "setLog", "invalid_payload")` → `flush.ts:112` `markDeadLetter` → **never retried**. Because `completeSession` destroys the local aggregate, the set is gone from history entirely.

This is reachable without any athletic data existing. After Release 1, *every* set op carries the two new keys. Any window in which a Release-1 client talks to a pre-Release-1 server loses every set logged in it. `skipWaiting: false` (`sw.ts:339`) means the updated client persists across a server rollback; the client is not downgraded when the server is.

**(b) An old build editing a new-profile row raises an unmapped `23514`.** Probe N8: `UPDATE set_logs SET weight_kg = 50, reps = 8` on a `duration` row → `ck_set_logs_profile_shape` violation. The previous build maps only `23505`/`23503`, so this propagates and fails the whole `/api/sync` request — the same permanently-retrying wedge as BLOCKER-1. This is reachable through the old history-correction UI, which renders such a row as `null kg × null` and invites exactly that correction.

**Required corrections**

1. Rewrite §14.5. "No crash path identified" and "no write path that could corrupt" are both false; the honest statement is that a rollback after the client has updated loses set logs and can wedge the outbox.
2. Decide the emission rule explicitly — this is a genuine architectural fork and belongs in §22, not in a rule paragraph. Emitting `distanceM`/`durationS` **only on profiles that use them** keeps every `load_reps` op byte-compatible with the previous build and costs nothing that matters (see MEDIUM-1: the W-1 rationale offered for always-emit does not apply to `setLog` in the first place). If always-emit is kept anyway, say plainly that rollback-after-client-update is unsupported and that the cost is silent set loss.
3. Add a negative control for it: a fixture batch of new-shaped `load_reps` ops parsed against the **previous** `setLogUpsertPayloadSchema`, asserting whichever outcome the owner chooses.

### HIGH-1 — The volume default fails open for exactly the movements PI-005 says must default closed

*Class: product-design defect.*

PI-005 is explicit: "Volume participation gets a conservative profile default. Athletic profiles should initially be **excluded** from the existing muscle-set model … recording an attempt must not automatically make it comparable to a hypertrophy-oriented working set." And: "Profile defaults should fail closed."

§11.2 sets the structural volume rule to `profile ∈ {load_reps, reps}` with `volume_counting` defaulting to `'auto'`, and §16 recommends `volumeCounting: 'off'` for the med-ball slam only. The result, on the design's own Release-3 catalog:

- `bodyweight-broad-jump` (`reps`) — counts as a work set toward quads and glutes;
- `bodyweight-box-jump` (`reps`) — counts;
- the legacy referenced `dumbbell-farmers-carry`, which §14.3 deliberately leaves at `load_reps` with its **fabricated** reps, keeps counting toward forearms and traps forever, and the reconcile never sets `volume_counting = 'off'` for it.

The root cause is real and the evaluation half-identifies it: because intent is deliberately not modelled (§5.1, correctly, per PI-005), the profile alone cannot separate an athletic `reps` attempt from a legitimate bodyweight `reps` set. That is an argument for making the counting decision **explicit**, not for defaulting it to on.

Note this is not blocked by PI-005's override rule. "User overrides may disable compatible behavior but must not enable an incompatible engine" — a `reps` exercise *is* structurally compatible with set counting, so an athlete turning it back on is an allowed override, not an incompatible enable. Defaulting closed costs nothing.

**Required corrections**

1. Split O-4 into two decisions: (i) does the `volume_counting` switch exist in v1 (recommend yes, as posed); (ii) **what is the default for the `reps` profile** — currently unasked and currently answered `auto` by omission.
2. Make `volumeCounting` a required field on every `reps` and `load_reps` catalog entry added in Release 3 (§16 currently makes it optional and "only for entries that should not count"), and set it `'off'` for every athletic entry, not only the med-ball slam.
3. Add `volume_counting = 'off'` to the §14.3 reconcile for a **referenced** legacy `dumbbell-farmers-carry` — it is a current-convention change (H-3), the same class as a contribution-weight edit, and it is the only way the fabricated reps stop being counted as hypertrophy sets.
4. Add the missing control: A-14 tests that `load_distance` is excluded and that an explicit `'off'` excludes; nothing tests what a seeded jump does by default. That is the contested case.

### HIGH-2 — The fail-closed progression path cannot be stored by the schemas I-6 calls unchanged

*Class: product-design defect plus an internal contradiction.*

§11.2 and NC-9 specify that `evaluateSession` returns an `UNSUPPORTED_MEASUREMENT_PROFILE` **draft** when a snapshot carries a non-`load_reps` profile with a non-manual strategy. I-6 and §11.3 simultaneously assert that `recommendations`, its Zod schemas, `InputsSummary` and `performedSetSchema` are unchanged. Both cannot hold.

- A `RecommendationDraft` becomes a persisted row. The existing analogue, `unsupportedSchemeDraft` (`src/domain/progression/evaluateSession.ts:69-93`), embeds `inputs.workSets` and `derived.workingLoadKg` from `modalWorkingLoad(input.workSets)`. `inputsSummarySchema` (`src/domain/schemas/recommendation.ts:45-78`) is `.strict()` with `performedSetSchema.weightKg: z.number().min(0)` and `reps: z.number().int().min(1)` — **neither nullable**. A non-`load_reps` session's sets carry nulls. The draft is unwritable.
- The reason code itself must join `REASON_CODES` (`src/domain/progression/reasonCodes.ts:6-26`), which `reasonCodeSchema = z.enum(REASON_CODES)` closes. That is a change to `recommendations`' Zod schemas, which I-6 forbids.

There is also an **ordering error in the justification**. §11.3 says `PerformedSet` stays `{weightKg, reps, rir}` "because `evaluateSession` refuses earlier". It does not refuse earlier. `getWorkSetsByExercise` (`src/server/progression/service.ts:117-131`) executes first and maps `row.weightKg`/`row.reps` — soon `number | null` — straight into `PerformedSet`, for both the evaluated session and the cross-session `getEngineHistory` window. The same pattern recurs at every SQL→domain boundary: the strength query's `StrengthSetInput`, `queryWorkSetContributionRows`, `HistorySetDto`, `HistorySetDetail`, and `toCarryForwardCandidate`'s `firstWorkSet.weightKg`. A `?? 0` at any of them would fabricate a bodyweight-only set (H-12) and feed `classifySet`'s `zeroLoad` bucket.

**Required corrections**

1. Decide: refuse by `continue` (no recommendation row at all — matching how `manual` and an unparseable config already behave, `evaluateSession.ts:110` and `:122`), or emit a draft and **amend I-6 explicitly** to admit the reason-code and `performedSetSchema` changes it requires. `continue` is the smaller and more honest option: there is nothing to explain to the athlete about an exercise the engine was never allowed to evaluate.
2. State the mapping rule as an invariant: at every SQL→domain boundary, rows whose **frozen slot profile** is not consumable by that consumer are excluded *before* mapping, and a null load or rep count is never coerced to `0` or `1`. Name the five call sites.
3. NC-9 must assert the chosen outcome (no row written, or a row that round-trips `inputsSummarySchema`), not merely that no strategy was called.

### HIGH-3 — Adding `.multipleOf(0.01)` to `weightKg` silently converts accepted payloads into permanent dead letters

*Class: product-design defect, presented as a no-op.*

§6.1 describes the load field's wire contract as "`min(0).max(9999.99)`, two decimals — **unchanged**", and §12.2's code block writes `weightKg: z.number().min(0).max(9999.99).multipleOf(0.01).nullable().optional()`.

The current schema has **no** `multipleOf` on `weightKg` (`src/domain/sync/schema.ts:104`), and the workout card does not enforce two decimals either: `validateSetInput` (`ExerciseCard.tsx:30-40`) checks range only, and `parseDecimalInput` (`src/ui/decimalInput.ts:18-23`) accepts any finite float. An athlete who types `62.505` today logs a set that the column rounds to `62.51`. After this change the same keystrokes produce `invalid_payload` → dead letter → the set is gone.

The precedent the evaluation cites cuts the other way: `loadStepKg`'s `multipleOf(0.01)` (`exercises/schema.ts:150-154`) was added together with a UI guard, because review L-7 found the column would otherwise truncate silently. Here the Zod tightening is proposed **without** the matching guard.

**Required corrections**

Either drop `multipleOf` from `weightKg` (keep it on `distanceM`/`durationS`, whose inputs are new and can be guarded from the start), or add a `decimalPlaceCount` check to `validateSetInput` **and** to the history-correction form in the same release, with a control that a three-decimal entry is refused at the input rather than at the wire. Whichever is chosen, §6.1 must stop calling it "unchanged".

### HIGH-4 — Release 1 is not the smallest safe vertical slice, and its central claim is false

*Class: release-planning defect.*

§21.1 claims Release 1 changes nothing an athlete can see. Three things it ships do:

1. the seed reconcile (BLOCKER-2);
2. the e1RM refusal reordering. §11.3 puts profile → basis → equipment → switch. The seeded `machine-assisted-pull-up` gains `load_basis = 'assistance'` in Release 1 and its rendered refusal changes from `EXERCISE_ESTIMATE_DISABLED` ("estimates are turned off for this exercise") to a `LOAD_BASIS_UNSUPPORTED` line. A-15's "existing strength fixtures unchanged" is directly contradicted by §14.3;
3. the sync widening, which delivers **zero** value in Release 1 — nothing can produce a non-null `distanceM` — while opening BLOCKER-3's whole window.

A genuinely smaller and safer Release 1: migration `0013` (columns, CHECKs, both composite FKs, all defaulted) + `src/domain/measurement/*` + the definition-world fields locked to `load_reps` + the read-side gates + boundary tests. The **sync contract change, the DTO widening and the reconcile move to Release 2**, where the UI that produces the values ships with them. That preserves the soak the evaluation wants for the migration — the risky, irreversible part — while removing the contract change that has no consumer.

The counter-argument in O-7 ("soak the migration and sync change") is only half right: a wire contract that nothing exercises is not soaked by shipping it early; it is merely exposed.

**Required correction:** re-pose O-7 as a three-way decision (columns-only dark / columns + sync dark / combined) and state BLOCKER-3's cost against each.

### MEDIUM-1 — W-1 is misattributed, and NC-1 does not discharge it

*Class: analysis error with a test-plan consequence.*

R-1 and §12.3 rest on the claim that adding keys to the set payload "is exactly the hazard W-1 names", and NC-1 is offered as "the W-1 negative control the verification asked for".

`applySetLogUpsert` **never calls `canExcuseViaSupersession`**. It is called at `sync/service.ts:397` (workoutSession) and `:582` (sessionExercise) only. W-1 (`mvp-v1-remediation-verification-2.md` §6.1) is a statement about those two entities' create-anchored excuse gate; its reproductions T3d and T3e are a `workoutSession` partial completion and a `sessionExercise` op missing `prescription`. The `setLog` path uses `writable` (V-2) and `laterDelete` (V-1) instead, and a key-short `setLog` op does not produce a rejection there — it produces the ordinary "absent means do not write" behaviour.

The rule §12.3 states is still worth keeping, but for different reasons: D-03 presence semantics, and giving the effective-row validation a complete row to check. What must not stand is the claim that a `setLog`-builder key-set test closes W-1. W-1's builders are `workoutSessionFullRowOp` (`activeSession.ts:145-172`) and `sessionExerciseFullRowOp` (`:175-190`).

**Required corrections:** restate §12.3's rationale and R-1's mechanism; either extend NC-1 to cover all three entities' full-row builders (which *would* be a real W-1 control and is cheap) or stop claiming W-1 is closed by this work.

### MEDIUM-2 — A required `measurementProfile` on create breaks stale clients

§12.1 makes `measurementProfile` required in `createExerciseSchema`. A cached pre-upgrade client posting to `/api/exercises` then gets a blanket 400 — the definition world is missing entirely from §13.2's rollout table, which covers only bundles, sessions and sync.

**Required correction:** make it `.optional()` with `.default('load_reps')`, matching both `laterality.default("bilateral")` two lines above it and the column default. `loadBasis` should default the same way under the presence rule. Add a §13.2 row for old-client REST writes.

### MEDIUM-3 — Two binding declarations are amended without saying so

The e1RM revision's owner-accepted addendum makes "the §9.6 refusal list … and the §15.4 reason-code enum" binding, and I-14 states that "no code outside that enum is emitted anywhere". This design adds `MEASUREMENT_PROFILE_UNSUPPORTED` and `LOAD_BASIS_UNSUPPORTED` and **reorders** the refusal list so the profile code precedes `EXERCISE_CATEGORY_UNSUPPORTED` — reversing the "category code wins" rule stated both in §9.6 and in the comment above `evaluateExerciseEligibility` (`eligibility.ts:26-28`).

Both changes look right to me on the merits: a `duration` Plank refused for its *shape* is a better explanation than refusal for its equipment category. But the evaluation lists ADR-011 under "settled decisions this report does not reopen" and then reopens two of its binding clauses silently. The house precedent exists — ADR-011 amended OD-06 explicitly.

There is also a placement question: both new codes land in `SUGGESTION_REFUSAL_REASON_CODES`, a group whose comment says "Suggestion level, refusal", while they are exercise-level structural refusals consumed by the tracker, the detail page and `isSelectionEligible`.

**Required corrections:** add an explicit amendment note naming §15.4, I-14, A-19 and the §9.6 ordering; decide the grouping; and reconcile A-15's "existing strength fixtures unchanged" with the assisted-pull-up copy change (HIGH-4).

### MEDIUM-4 — The documentation obligations are under-specified

The evaluation notes that `data-model.md` §2.4 never gained `strength_estimate` and tells the implementer to fix it. It does not list the amendments its **own** change requires, and one of them is normative:

- **`volume-model.md` §1** defines a Work set as "a logged `SetLog` with `isWarmup = false`, in a session that is not `discarded`". §11.2 makes it profile-conditional and `volume_counting`-conditional. §2's aggregation pseudocode needs the same edit. This is the definition ADR-007's current-convention rule is written against; changing it in code without changing it here is exactly the drift `deviations.md` exists to record.
- `data-model.md` §2.4, §2.9 and §2.14 (three tables, five columns, two dropped NOT NULLs, one composite FK).
- `domain-model.md` §7/§9 (the mutable-metadata policy now has one field it does not apply to) and §10 (a new invariant).
- `prescription-model.md` §2/§6 (two scheme variants, the compatibility table).
- `progression-engine.md` §2/§5 (the profile precondition on evaluation).

### MEDIUM-5 — The ad-hoc path has no profile-agreement check, and §10.1's "not a path" reasoning does not cover it

§10.1 adds `measurement_profile_mismatch` for template slots and argues the rejection is unreachable because a disagreement needs an exercise that had no history and no prescription when the bundle was cached, which means it was not in the bundle. That argument is sound **for template slots** — such an exercise is referenced by an `exercise_prescriptions` row and therefore locked.

It does not hold for §10.2. An ad-hoc slot carries `prescription: null`, so there is no snapshot to compare and **no check runs at all**. An exercise stays unlocked until its first slot or prescription row actually lands, so the sequence *create exercise → ad-hoc add (op queued) → go offline → edit the profile → reconnect* produces a slot whose derived profile differs from the one the client froze, with sets already logged locally against the old shape. Those sets then dead-letter.

**Required corrections:** either reverse X-8 for the ad-hoc case (carry the client's frozen profile on the `sessionExercise` payload so the server can reject the disagreement) or lock the exercise's profile the moment it is first ad-hoc added. Fix the §10.1 argument either way — as written it asserts unreachability for a case it does not analyse. The mirror FK proposed in BLOCKER-2 does not close this one, since both rows would be consistent with the *new* exercise profile.

### MEDIUM-6 — A rejected set is not surfaced to the athlete, so "fail closed" is not "fail closed with clear UI guidance"

PI-005 requires that "unsupported profile/strategy combinations fail closed with clear UI guidance". §13.2 repeatedly settles for "dead letters with payload intact".

`refreshSessionBlocked` (`src/sync/activeSessionStore.ts:141-152`) raises `sessionBlocked` **only** for dead letters whose entity is `workoutSession`. A `setLog` dead letter does not block, does not warn, and does not survive: the athlete sees the set in the local aggregate for the rest of the workout, and `completeSession` then discards the aggregate. The set exists only as a row on the sync-issues screen.

**Required corrections:** extend the blocked/banner rule to `setLog` dead letters belonging to the active session (a small, additive change to an existing mechanism), or state the accepted loss explicitly in §13.2 and add an acceptance criterion for what the athlete sees. A-22 currently asserts only that the dead letter *happens*.

### MEDIUM-7 — The slot-profile derivation has no specified failure mode

§10.1/§10.2 say the server derives `measurement_profile` from "the live exercise row" at `sessionExercise` insert. `applySessionExerciseUpsert` today never reads the `exercises` table and never checks that `payload.exerciseId` belongs to the caller — only the FK constrains it. Since the new column is `NOT NULL`, an unspecified derivation has an implicit fallback, and the wrong fallback (`'load_reps'`) is silently corrupting.

**Required correction:** state that the derivation SELECT is user-scoped and that a missing or foreign exercise rejects the op as `invalid_reference` — never defaults.

### LOW findings

- **LOW-1 (editorial).** `EQUIPMENT_TRANSLATION_NOISIER` (§7.1) does not exist; the constant at `src/domain/strength/constants.ts:143` is `SUGGESTION_NOISIER_EQUIPMENT`, and its comment scopes it to **Release B suggestion confidence**, explicitly stating "the tracker takes no penalty". The substantive point — that dumbbell loads are already treated "as logged" by the tracker — survives; the name and the framing do not.
- **LOW-2 (editorial).** `machine-assisted-pull-up` is at `exerciseCatalog.ts:878-886`, not `:877-885`. `EditSetPatch` (§2.4) is not an emitter: `editSet` mutates the local set and then emits a full row through `setLogFullRowOp` (`activeSession.ts:570-579`).
- **LOW-3 (test plan).** NC-2 asks for a row "byte-identical to today's fixture". It cannot be — the row gains `measurement_profile = 'load_reps'` and two nulls. Reword to "identical in every pre-existing column".
- **LOW-4 (specification gap).** `set_logs` deliberately gets no profile-enum CHECK; membership is enforced transitively by `ck_set_logs_profile_shape` (probe N9) and by the composite FK. Correct, but state it, or a later reader will "fix" the omission.
- **LOW-5 (specification gap).** Deload semantics for the new variants are unstated. `setMultiplier` reduces `sets`, `loadMultiplier` reduces `prefill.loadKg`, and **nothing** reduces distance or duration — so a deload week on a sled push is a sets-and-load deload while `appliedModifiers` records a full deload. Defensible; say it.
- **LOW-6 (specification gap).** `schemeDefaultReps` (`src/domain/progression/workingTargets.ts:28-30`) is `scheme.type === "fixed" ? scheme.reps : scheme.minReps` and will not compile against a four-member union. §9.4 states the outcome (`prefill.reps` null for load-less profiles) but not the site.
- **LOW-7 (coverage gap).** PI-005 names **exports** among the affected surfaces. No export surface exists in the repository (no route under `src/app/api`, no serializer). The evaluation should say so; an unaddressed item in the brief reads as an oversight rather than a no-op.
- **LOW-8 (analysis gap).** W-2's `laterDelete` short-circuit runs before validation, so a shape-invalid create trailed by a delete of its own id will report `applied`, not `invalid_measurement`. Consistent with shipped behaviour and harmless, but §13.2 should carry the row since NC-3 asserts the opposite classification for the un-trailed case.
- **LOW-9 (vocabulary completeness).** Two shapes have no profile and are not listed as excluded: reps-within-a-fixed-time (max push-ups in 60 s) and a loaded sprint (weighted-vest shuttle). Also unstated: how a shuttle run records distance — total metres covered, or one shuttle per round. §5.3 says "no other profile exists in v1" without enumerating what that excludes.
- **LOW-10 (control gap).** NC-3's expected rejection is wrong in one case: probe N1 shows that a genuine pre-upgrade nine-key op landing on a `load_distance` slot fails the **composite FK** (`23503` → `invalid_reference`) before any shape CHECK, because the row carries the default profile. The service-layer check should catch it first and return `invalid_measurement`; the control must assert *which* layer rejected it, or it will pass vacuously.

---

## 6. Cross-cutting checks that came back clean

Recorded so a later reader knows these were tested, not assumed.

| Question | Result |
|---|---|
| Can `writable` field exclusion produce a shape-invalid intermediate row? | **No.** Shape validity is a function of the profile alone, so any field-wise merge of two rows valid under one frozen profile is valid. Verified across all four orderings of a full-row-plus-partial batch |
| Is the effective-row validation deterministic under replay? | **Yes.** First application and replay converge; the create path writes the whole payload, the update path writes `writable`, and neither depends on wall-clock or client version |
| Does the `missing_required_fields` gate (`service.ts:766-775`) break for load-less profiles? | **No** — but only because rule 1 sends explicit `null`s, and `null !== undefined`. This dependency is load-bearing and unstated; it is a second reason not to weaken rule 1 casually while fixing BLOCKER-3 |
| Do duplicate replay and lost-response paths still converge with two more columns? | **Yes.** `onConflictDoNothing` then the update path with `writable = ∅` is a no-op, unchanged |
| Can renumbering after a mid-list delete lose distance or duration? | **No**, provided the renumber upserts carry them; absent keys would leave the stored values intact anyway (D-03 presence semantics) |
| Does a `duration` Plank shipping in Release 2 retroactively change historical volume? | **No.** Volume reads the frozen slot profile, so pre-change sessions keep counting. Correctly designed |
| Does `volume_counting = 'off'` retroactively change historical volume? | **Yes**, by design — current-convention, H-3, same class as a contribution-weight edit. Correctly flagged |
| Is the new domain directory blocked by `boundaries/no-unknown`? | **No.** `src/domain/measurement` is matched by the existing `domain` element |
| Does the migration ordering (columns, then CHECK) validate against existing rows? | **Yes.** Every existing row satisfies the `load_reps` branch by construction |
| Is a stale service-worker copy of history detail a hazard? | **No.** `/api/history` is `NetworkOnly` (`sw.ts:270-285`) |

---

## 7. Owner-decision readiness

**Not ready.** Five of the twelve need work, and four decisions the design actually requires are missing.

| Id | Ready? | Note |
|---|---|---|
| O-1 `load_duration` in v1 | **Ready** — recommendation (include) is well-argued; one CHECK branch now versus a second migration later |
| O-2 `load_basis` in Release 1 | **Ready** — the frozen slot column is the expensive half; deferring means widening twice |
| O-3 Lock the profile once referenced | **Ready** — and stronger than stated: BLOCKER-2's mirror FK would make half the lock a database guarantee |
| O-4 `volume_counting` switch | **Not ready** — must be split. The switch itself is fine; the unasked half is the **default for the `reps` profile**, which the design answers `auto` by omission and PI-005 answers "excluded". See HIGH-1 |
| O-5 Referenced seeded carry / plank | **Mis-posed** — the live question is whether the profile reconcile runs in Release 1 at all (BLOCKER-2), not whether the leftovers are archived |
| O-6 Training card counts every profile | **Not ready** — the recommendation is defensible, but the replacement caption is undefined and the decision silently touches `volume-model.md` §1's normative "work set" wording (MEDIUM-4). Bring the exact caption text |
| O-7 Dark Release 1 then Release 2 | **Re-pose** — as a three-way choice (columns-only / columns + sync / combined) with BLOCKER-3's cost stated per option. See HIGH-4 |
| O-8 Seconds entry, `m:ss` display | **Ready** |
| O-9 Derived speed in history | **Ready** — "no in v1" is consistent with H-13 and X-14 |
| O-10 The ten catalog entries | **Not answerable as posed** — ADR-010 requires authored, reviewed muscle contributions per entry and §16 supplies none, so the owner would be approving a list whose main cost is invisible. Split into "adopt the ten slugs and shapes" (answerable now) and "approve their contributions" (a Release-3 gate) |
| O-11 Optional RIR on `reps` | **Ready** |
| O-12 One row per set for unilateral work | **Ready** — zero schema, and N-11 records the reopening trigger |

**Missing decisions the design cannot be built without**

- **O-13.** Emission rule for the two new set-payload keys: always, or only on profiles that use them. This is the fork behind BLOCKER-3 and it is currently settled inside a rule paragraph.
- **O-14.** Does `session_exercises` gain the mirror composite FK to `exercises (id, measurement_profile)`? (BLOCKER-2.)
- **O-15.** Is `weightKg` tightened to two decimals on the wire, and if so does the input guard ship in the same release? (HIGH-3.)
- **O-16.** What does the athlete see when a set is refused — a blocking banner, or silence plus a sync-issues row? (MEDIUM-6.)

---

## 8. Acceptance criteria and negative controls

The plan is strong in structure — NC-4's "with the service check stubbed out" and NC-5's dropped-constraint control are genuine anti-vacuity witnesses, and A-8's boundary-test extension follows the established template. The gaps are specific:

| Gap | Where it belongs |
|---|---|
| Numeric **boundary** rows per new column (ceiling accepted, ceiling + 0.01 refused as `invalid_measurement`, never as a request failure) | NC-4 — would have caught BLOCKER-1 |
| Which layer rejected a pre-upgrade op on a new-profile slot (service vs composite FK vs shape CHECK) | NC-3 — currently passes vacuously (probe N1) |
| New-shaped `load_reps` ops parsed against the **previous** `setLogUpsertPayloadSchema` | new control — BLOCKER-3 |
| A seeded `reps` exercise's default volume participation | A-14 — the contested case is untested |
| Reason-code output for the assisted pull-up before and after the reconcile | A-15 — currently claims "unchanged", which is false |
| Three-decimal weight entry refused at the input, not at the wire | A-2 / e2e — HIGH-3 |
| `prefill.reps` is null for the two new scheme variants | A-12 |
| What the athlete sees when a set op is refused | A-22 / A-24 — MEDIUM-6 |
| Full-row key-set equality for `workoutSessionFullRowOp` and `sessionExerciseFullRowOp` | NC-1 — the actual W-1 control (MEDIUM-1) |
| Clean-database seed outcome **per release**, not in general | A-17 — §14.4 is wrong for Release 1 |

Two wording fixes: NC-2's "byte-identical" (LOW-3), and NC-12's `count(*) … violating the new shape predicate is 0` should run **before** the constraint is added *and* be asserted non-vacuous (a deliberately broken control row in a scratch database), or it proves only that the table was empty.

---

## 9. Product-design defects versus editorial and test-plan gaps

For the implementer's triage.

**Product-design defects (the design is wrong, not just described wrong):** BLOCKER-1 (DDL bound), BLOCKER-2 (release sequencing and the missing mirror constraint), BLOCKER-3 (emission rule versus old-server strictness), HIGH-1 (volume default), HIGH-2 (unwritable refusal draft and the mapping-boundary ordering), HIGH-3 (wire tightening without a guard), HIGH-4 (release scope), MEDIUM-2, MEDIUM-5, MEDIUM-6, MEDIUM-7, LOW-9.

**Editorial and documentation:** MEDIUM-3 (amendment notes), MEDIUM-4 (document updates), LOW-1, LOW-2, LOW-4, LOW-5, LOW-6, LOW-7, LOW-8.

**Test-plan only:** MEDIUM-1's second half, LOW-3, LOW-10, and the table in §8.

---

## 10. What a revision must contain

1. `distance_m` bound and column type reconciled; `22003` mapped; boundary controls added.
2. The profile-changing seed reconcile removed from Release 1; §14.4's clean-database claim corrected per release; the `exercises`-side composite FK adopted or explicitly rejected with a reason.
3. §14.5 rewritten against the real rollback behaviour; the emission rule promoted to an owner decision.
4. The `reps`-profile volume default decided and defaulted closed for athletic catalog entries; the legacy carry's `volume_counting` handled in the reconcile.
5. The progression refusal path settled (`continue` or draft), with I-6 amended if a draft; the five SQL→domain mapping sites named with a no-coercion rule.
6. `weightKg`'s `multipleOf` decision made, with a matching input guard if adopted.
7. §12.3 and R-1 restated without the W-1 misattribution; NC-1 extended or the W-1 claim withdrawn.
8. `measurementProfile` made optional-with-default on create; a definition-world row added to §13.2.
9. Amendment notes for the e1RM revision's §15.4, I-14 and §9.6, and the `volume-model.md` §1 amendment listed alongside the other document updates.
10. O-4, O-5, O-6, O-7 and O-10 re-posed; O-13…O-16 added.

Items 1, 2, 3, 5 and 7 are the ones that change what gets built. The rest are precision.

---

## 11. Verdict

The model is sound and the integrity work is better than the brief required: the closed profile enum, the frozen slot columns, the shape CHECK and the composite foreign key together give the database — not the service layer — the last word on what a set row may contain and on the immutability of a slot's shape. That is the correct answer to PI-005, and it should survive this review unchanged.

What must not ship as written is the release plan, the exact DDL, the rollback analysis, the volume default and the fail-closed progression path. Each has a local fix; none requires a different design.

**REVISION REQUIRED**
