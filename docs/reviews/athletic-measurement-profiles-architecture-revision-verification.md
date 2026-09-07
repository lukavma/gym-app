# Athletic Exercise Measurement Profiles — targeted architecture verification of the revision (PI-005)

**Date:** 2026-09-07
**Verified:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md`, revised (920 lines, correction log in its §25)
**Finding authority:** `docs/reviews/athletic-measurement-profiles-architecture-review.md` (verdict `REVISION REQUIRED`; BLOCKER-1…3, HIGH-1…4, MEDIUM-1…7, LOW-1…10, plus the §8 test-plan table)
**Baseline:** working tree at `05982f6`, migrations `0000`–`0012`
**Scope discipline:** the evaluation, the original review, production code, migrations, tests, seeds and architecture documents were **not** modified. No owner question was decided. Nothing was committed, pushed or deployed; production was not contacted. Two scratch schemas were created on the **local Docker PostgreSQL 16** instance and dropped again.

---

## 0. Verdict

**REVISION REQUIRED** — narrowly, and not because any of the required corrections failed.

All five build-changing corrections the review demanded (its §10 items 1, 2, 3, 5 and 7 — BLOCKER-1, BLOCKER-2, BLOCKER-3, HIGH-2, MEDIUM-1) are **fully closed and correctly propagated**, and so are the remaining nineteen findings. The previously validated core model is intact and was not disturbed. The revision is materially better than the document it replaces: it found one real repository site my review had only described generically (`weightKg ?? 0` at `src/server/strength/service.ts:194-195`), and its `22003` mapping incidentally closes a **pre-existing** latent poison-batch path I had not identified (`setNumber` has no wire ceiling; `999999::smallint` raises `22003`, unmapped today).

What blocks the owner gate is that the revision **introduced one new HIGH defect and three consistency gaps**:

- **V-1 (HIGH).** §10.1 folds `loadBasis` into the `measurement_profile_mismatch` comparison. `load_basis` is explicitly editable with history (§10.3), so an ordinary permitted edit made while a session-start or ad-hoc-add op sits in the outbox now rejects the whole slot op — the exercise never reaches the server and its sets orphan. §10.1 also contradicts I-14 and A-18, which both scope the comparison to the profile alone.
- **V-2 (MEDIUM).** Whether Release 1 ships the widened `setSchemeSchema` is ambiguous, and the answer decides whether §14.5's "Release 2 → Release 1 is data-safe and feature-degraded" is true. `src/domain/schemes/setScheme.ts` is shared `domain` code, so "server-side only" acceptance of the two new variants is not possible.
- **V-3 (MEDIUM), V-4 (MEDIUM).** Release-mapping inconsistencies between §13.5 and §21, and the ADR-011 amendment is not posed as an owner decision even though it changes owner-accepted binding clauses.

Each fix is a clause or a table cell. This is a short propagation pass, not a redesign — but V-1 is a data-loss path on a permitted operation and the document contradicts itself about it, so it should not go to the owner as it stands.

---

## 1. Method and interpretation

The review's §10 states: *"Items 1, 2, 3, 5 and 7 are the ones that change what gets built."* I read "all five required findings" as those five, and treat them as the primary gate; the remaining nineteen findings are verified in §3's disposition table so that nothing is left unchecked.

Nothing was taken from the revision's own correction log. Each claim was re-derived: every newly added file/line citation was opened, the DDL bounds were re-probed against live PostgreSQL, and the affected repository sites were re-read to test feasibility. Two scratch schemas (`pi005_verify`, `pi005_verify2`) were created and dropped; `select nspname from pg_namespace where nspname like 'pi005%'` returns empty.

---

## 2. The five required corrections

### 2.1 BLOCKER-1 — numeric ceiling and the unmapped overflow — **CLOSED**

The bound moved to the column's exact storage ceiling everywhere it appears, and the overflow class is now mapped.

| Where | Before | After | Checked |
|---|---|---|---|
| §6.1 field table | `numeric(7,2)`, wire `.max(100000)` | `numeric(7,2)`, wire `.gt(0).max(99999.99)`, "the column's exact storage ceiling" | ✓ |
| §8.3 DDL | `distance_m <= 100000` | `distance_m <= 99999.99` | ✓ |
| §9.1 scheme variant | `distanceM … <= 100000` | `<= 99999.99` | ✓ |
| §12.2 wire | `.max(100000)` | `.max(99999.99)` | ✓ |
| §12.2 mapping | `23514` only | `23514` **and `22003`** → `invalid_measurement` | ✓ |
| I-8 | CHECK only | "every wire ceiling is at or below its column's storage ceiling; no op can fail a whole batch by CHECK violation **or numeric overflow**" | ✓ |
| NC-4 / A-2 | null/non-null combinations only | **boundary row per numeric column** — exact ceiling accepted, ceiling + 0.01 refused, round-into-overflow refused via `22003` | ✓ |
| X-22 | — | `numeric(8,2)` for 100 km explicitly rejected with a reason | ✓ |
| H-17, R-2 | — | the unmapped-SQLSTATE poison batch named as a standing hazard with its two code sites | ✓ |

Re-probed on the local instance against the **revised** numbers:

```
99999.99::numeric(7,2)   -> OK          (the new ceiling is reachable — the old one was not)
99999.995::numeric(7,2)  -> 22003       (§6.1's round-up claim is correct)
9999.995::numeric(6,2)   -> 22003       (NC-4's weight_kg example is correct)
86400::numeric(7,2)      -> OK          (duration ceiling fits, as §6.1 states)
999999::smallint         -> 22003
```

The last line is worth calling out as a **credit**: `setLogUpsertPayloadSchema.setNumber` is `z.number().int().min(1)` with **no maximum** (`src/domain/sync/schema.ts:102`), so a large `setNumber` reaches `smallint` and raises `22003` — today unmapped, therefore a whole-request failure and an outbox that retries forever. The revision's `22003` mapping closes that pre-existing path as a side effect. Neither document claims this; it is a real bonus.

H-17's citations verify: `src/server/sync/service.ts:36-42` ("an unexpected error … fails the whole request") and `src/sync/flush.ts:115-123` (unclassified ops → `markTried` → `backOffQueue`).

### 2.2 BLOCKER-2 — Release-1 reconcile and the missing slot↔exercise constraint — **CLOSED**

Both halves are done, and the second half is done more thoroughly than the review asked.

**Reconcile moved.** §14.3 is retitled "Release 2 only" and opens with the reason in the review's own terms — the Release-1 client can neither prescribe (no `durationRounds` in the editor) nor log (`kg · reps · RIR` card) a converted exercise, and `db:seed` runs before the app swap. I-11 now binds it: "the seed reconcile … ships in Release 2, never in Release 1." §21.1's "Does not ship" list names it. §14.4 is now a per-release table whose R1 row states the catalog is unchanged and every entry inserts as `load_reps` — the false "reconciles find nothing to do" claim is gone, and the R2 row explains that the three legacy catalog entries gain explicit values so a fresh R2 seed is correct by construction. The Release-2 deploy window is disclosed rather than hidden, with a post-deploy one-shot offered as an option inside O-5.

**Mirror FK adopted (O-14).** §8.1 adds `uq_exercises_id_profile UNIQUE (id, measurement_profile)`; §8.2 adds `fk_session_exercises_exercise_profile FOREIGN KEY (exercise_id, measurement_profile) REFERENCES exercises (id, measurement_profile) ON DELETE RESTRICT`. Propagated to §8.5 (both FKs RESTRICT), §10.3 ("the `session_exercises` half is a **database guarantee**"), §13.2 (the deploy-window row: an old build's default-`load_reps` slot insert now fails `23503` instead of freezing a wrong shape), I-3, NC-5, A-10, A-19/A-20, R-9, §23 and O-14.

Feasibility re-checked against the repository:

- `session_exercises.exercise_id` is today a plain `RESTRICT` FK (`src/db/schema/sessionExercises.ts:34-36`); a second composite FK on the same column is legal and consistent with §8.5.
- No `foreignKey(` currently exists anywhere in `src/db/schema/` — both composite FKs are firsts, which is why NC-12's generated-SQL check is load-bearing. Correctly flagged.
- The migration is satisfiable at `0013` time: every existing exercise and slot defaults to `load_reps`, and no slot can reference a deleted exercise (RESTRICT), so the mirror FK validates against current data.
- The Release-2 reconcile never collides with it: the two profile conversions are predicated on `NOT EXISTS session_exercises`, and the two rows it changes on referenced exercises (`load_basis`, `volume_counting`) are not in the FK.

One correctness note in the design's favour: `load_basis` is deliberately **not** in the mirror FK, which is right — it must stay editable with history. That makes V-1 (§4.1) the more surprising.

### 2.3 BLOCKER-3 — rollback analysis and the emission rule — **CLOSED**

§14.5 is rewritten as a four-row matrix and is now accurate about the mechanisms. It states plainly that the client is not downgraded when the server is (`skipWaiting: false`), that a Release 2 → pre-`0013` rollback dead-letters every op carrying a new key — **including every session-exercise op**, so a session cannot sync its slots at all — and that the old build's history-correction UI on a `duration` row raises an unmapped `23514` and wedges the batch. It is labelled **unsupported**, with roll-forward as the only recovery. The always-emit alternative and its cost occupy their own row.

The emission rule is promoted to **O-13** with profile-scoped full rows recommended, and the reason is correct: a `load_reps` op stays byte-identical to today's nine keys, so it remains parseable by any build. I-7 restates the rule per profile; §12.3 gives the concrete builder checklist; NC-13 asserts the rollback matrix by parsing new-build ops against frozen copies of the previous build's schemas.

Two consequences were checked and hold:

- **The R1 "server-side acceptance" shape (O-7 option b) is what makes R2 → R1 safe.** O-7's option (a) row states the converse correctly: without R1 accepting the widened schemas, an R2 → R1 rollback dead-letters every session-exercise op. That reasoning is sound.
- **`sessionExerciseFullRowOp` must always emit the two new keys**, which the review's W-1 lineage requires. Verified that it is the single `sessionExercise` builder, used at four call sites (`src/sync/activeSession.ts:309, 388, 406, 424`) — so the key set stays fixed and subsumption is preserved. `isCreateAnchoredSessionExercise` (`:560-566`) tests `exerciseId`/`position`/`source` only and is correctly described as unchanged; `isNoopSessionExerciseUpdate` (`:536-546`) compares five fields and is unaffected by keys the update path ignores.

### 2.4 HIGH-2 — the fail-closed progression path — **CLOSED**

The unwritable draft is gone. §11.3 and X-19 settle on `continue`: no row, no draft, no new reason code, matching how `manual` (`evaluateSession.ts:110`) and an unparseable config (`:122`) already behave. I-6 now enumerates exactly what stays frozen (`performedSetSchema`, `inputsSummarySchema`, `recommendationTargetSchema`, `REASON_CODES`) and names the two payload schemas that do change — the earlier contradiction is resolved in the direction that requires no schema widening.

The ordering error is fixed and inverted correctly: §2.3 and §11.3 now state that `getWorkSetsByExercise` maps rows **before** `evaluateSession` runs. I-13 is a new binding invariant naming the boundary rule, and §11.3 tabulates five sites. All five were re-read:

| Site | Claim | Verified |
|---|---|---|
| `src/server/progression/service.ts:117-131` + `:141-188` | maps to `PerformedSet` first, for the session and the history window | ✓ |
| `src/sync/activeSession.ts:633-724` (`:663,678`) | client mapping shares `evaluateSession` | ✓ |
| `src/server/strength/service.ts:190-194` | **`weightKg: row.weightKg ?? 0, reps: row.reps ?? 0` really exists** at `:194-195` | ✓ |
| `src/server/volume/service.ts:177-215` | row type carries no load or rep numbers | ✓ |
| `src/server/today/service.ts:51-57,275-283`; `src/server/history/service.ts:172-193` | display DTOs, `number \| null`, never `0` | ✓ |

The strength site is the notable one: that coalesce exists **today** only because the `LEFT JOIN` makes the columns nullable in the query type, and it is guarded by `if (row.setNumber === null) continue;` at `:190`. After the migration it becomes genuinely reachable, and it would fabricate a bodyweight-only set straight into `classifySet`'s `zeroLoad` bucket. The revision found this independently; my review had only described the class.

X-20 additionally restricts `rep-progression` to `load_reps` in v1, with the reason given in schema terms (`performedSetSchema.weightKg` is non-nullable, so a `reps` set cannot be evaluated without an I-6 amendment). §9.2, §11.2, A-3 and N-13 all carry it. This is a genuine narrowing, correctly derived, and it costs nothing already shipped — existing bodyweight work is `load_reps` and is unaffected.

### 2.5 MEDIUM-1 — the W-1 misattribution — **CLOSED**

H-7 now ends "W-1 does **not** govern `setLog`, which never reaches `canExcuseViaSupersession`." §2.4 records that the gate is called for `workoutSession` (`:397`) and `sessionExercise` (`:582`) only. §12.3 has an explicit paragraph headed "This rule is not a W-1 control", gives the correct rationale for the fixed per-profile key set (D-03 presence semantics and validation completeness), and states that NC-1 "does not by itself close W-1, which remains open in its own lineage." R-1 is reworded around both mechanisms. NC-1 now covers all three full-row builders with a mutation witness on each.

Re-verified in the repository: `canExcuseViaSupersession` is defined at `:250-261` and called only at `:397` and `:582`; `applySetLogUpsert` uses `laterDelete` and `writable` only.

---

## 3. Disposition of the remaining findings

Each was checked in the document body, not in the correction log.

| Finding | Disposition | Evidence checked |
|---|---|---|
| HIGH-1 volume default | **Closed** | O-4 split into (i) switch / (ii) `reps` default; §11.4 gives a profile-dependent creation default (`'auto'` for `load_reps`, `'off'` for `reps`) with the column default left `'auto'` for old-build inserts; §11.1 and I-5 restate the override rule as PI-005 words it (a compatible enable is permitted); §16 makes `volumeCounting` required on `load_reps`/`reps` entries and `'off'` for all ten athletic slugs — broad jump and box jump included; §14.3 adds `volume_counting = 'off'` for the **referenced** legacy carry; A-14 and NC-11 test the default and both switch positions |
| HIGH-3 `weightKg` `multipleOf` | **Closed** | §6.1 no longer says "unchanged"; §12.2 leaves `weightKg` without `multipleOf`; O-15 poses the tightening with the guard as its condition; §15.2/§15.3 add a `decimalPlaceCount <= 2` guard on the two new inputs; A-2 asserts refusal at the input. `src/ui/decimalInput.ts:30-34` confirmed as the cited helper |
| HIGH-4 Release-1 scope | **Closed** (see V-2 for a residual ambiguity) | §21.1 re-scoped to server-side acceptance with an explicit "Does not ship" list and "What an athlete can observe in Release 1: nothing"; the assisted-pull-up refusal change moved to R2 with the reconcile, so the claim is now true; O-7 re-posed three ways with the rollback cost per option |
| MEDIUM-2 required create field | **Closed** | §12.1 `measurementProfile … .default('load_reps')`, `loadBasis` resolved in the existing `.transform()`; §13.2 gains an old-client `POST /api/exercises` row; I-9 extended to REST. Feasible: `createExerciseSchema` already ends in `.transform()` that derives `loadStepKg` (`src/domain/exercises/schema.ts:143-162`) |
| MEDIUM-3 binding-clause amendment | **Closed** as an amendment note (see V-4 on the decision surface) | New §11.6 tabulates both amended clauses; header changed to "ADR-011 is **amended in two named clauses**"; H-16 added; code placement decided — `SUGGESTION_REFUSAL_REASON_CODES` (`src/domain/strength/reasonCodes.ts:57-59`, verified: the two exercise-level codes are at `:58-59`) with both new codes excluded from `RELEASE_B_ONLY_REASON_CODES` (`:118`, verified: that list starts at `DELOAD_SESSION_NO_SUGGESTION`, so the exclusion is the correct and necessary detail); A-4 asserts membership; A-15 asserts the assisted pull-up's before/after codes |
| MEDIUM-4 documentation obligations | **Closed** | New §24, eight rows, including the normative `volume-model.md` §1 change (verified: the Work-set definition is at `volume-model.md:13`) and §2's pseudocode |
| MEDIUM-5 ad-hoc profile agreement | **Closed in mechanism** (but see V-1) | X-8 withdrawn; §12.2 adds two optional keys to `sessionExerciseUpsertPayloadSchema`; §10.1 splits derivation and comparison; §10.2 explains why locking at first ad-hoc add would not cover the case (X-21); A-18 added |
| MEDIUM-6 refusal surfacing | **Closed** | New §13.4 with the mechanism (`refreshSessionBlocked`, `src/sync/activeSessionStore.ts:141-152`, verified) and O-16 posing extend-vs-accept; §15.3 adds the card mark |
| MEDIUM-7 derivation failure mode | **Closed** | §10.1 step 1 specifies a user-scoped select and `invalid_reference`; "the column's `NOT NULL DEFAULT` is never used as a fallback"; I-14 and A-18 carry it. §2.4 records the current gap correctly (`applySessionExerciseUpsert` never reads `exercises` and never checks ownership) |
| LOW-1 constant name | **Closed** | §7.1 names `SUGGESTION_NOISIER_EQUIPMENT` and scopes it to Release B suggestion confidence, quoting "the tracker takes no penalty". Verified at `src/domain/strength/constants.ts:143` |
| LOW-2 citations | **Closed** | `:878-886` corrected; §2.4 now describes `EditSetPatch` as a local mutation feeding `setLogFullRowOp` (`:570-579`) |
| LOW-3 NC-2 wording | **Closed** | "identical in every pre-existing column" |
| LOW-4 no enum CHECK on `set_logs` | **Closed** | §8.3 states it as deliberate with both enforcing mechanisms |
| LOW-5 deload semantics | **Closed** | §9.4 states `setMultiplier` is generic, `loadMultiplier` applies where a load exists, and **nothing** reduces distance or duration; N-13 records the deferral |
| LOW-6 `schemeDefaultReps` | **Closed** | §2.3 and §9.4 name the site. Verified at `src/domain/progression/workingTargets.ts:29-31`; `WorkingTargets.reps` is already `number \| null` (`:23`), so the widening is type-compatible |
| LOW-7 exports | **Closed** | §2.5 and N-15 state no export surface exists. Independently confirmed: no route under `src/app/api` serialises history |
| LOW-8 `laterDelete` | **Closed** | §13.2 gains the row and scopes NC-3's expectation to the un-trailed case |
| LOW-9 excluded shapes | **Closed** | §5.3 adds the recording convention (total metres per round) and enumerates the four shapes deliberately without a profile; N-12 extended |
| LOW-10 NC-3 layer | **Closed** | NC-3 now asserts *which* layer rejected, with the stubbed-service control landing on `23503`/`invalid_reference` — matching the probe result in the review's fixture N1 |
| Review §8 table | **Closed** | NC-12 gains a non-vacuity witness; A-12 covers null prefill; A-17 is per release; O-6 supplies the exact caption; O-10 split into (i) slugs/shapes and (ii) contributions |

---

## 4. New findings introduced by the revision

### V-1 (HIGH) — `loadBasis` must not be part of the mismatch comparison

§10.1 step 2: *"**compares** the derived pair with the payload's `measurementProfile` / `loadBasis` when present and rejects a disagreement as `measurement_profile_mismatch`"*.

`load_basis` is not locked. §10.3 states the opposite of the profile rule for it: *"`load_basis` edits stay allowed with history, exactly like `equipment` today … with a UI notice that future sessions and estimates are affected while past sessions keep their frozen label."* It is deliberately excluded from the mirror FK for that reason.

So the comparison rejects a slot op whenever a **permitted** edit lands between the client freezing the value and the op reaching the server:

> Athlete starts a workout offline at 09:00 (ops queued, `loadBasis: 'unspecified'`). At 09:30, on the exercise edit form, they set Load basis = *Per hand* — explicitly allowed, even with history. At 10:00 the outbox flushes. The derived basis is `per_hand`, the payload says `unspecified` → `measurement_profile_mismatch` → the `sessionExercise` op dead-letters → every set logged against that slot rejects `not_found` → the exercise and its sets never reach history.

This is not the ad-hoc-only path MEDIUM-5 was about. It hits the ordinary offline template-start path, and §10.1's own justification for template slots — *"a disagreement needs an exercise whose profile changed after the bundle was cached, which §10.3 forbids once a prescription references it"* — is true of the profile and **false of the basis**, which §10.3 permits changing at any time.

The document also contradicts itself on the scope, and the two safe readings outnumber the unsafe one:

| Location | Scope of the comparison |
|---|---|
| §10.1 step 2 | `measurementProfile` **and** `loadBasis` |
| I-14 | "a payload profile that disagrees rejects `measurement_profile_mismatch`" |
| A-18 | "with a disagreeing `measurementProfile` → `measurement_profile_mismatch`" |

**Required correction.** Compare `measurementProfile` only. Derive `load_basis` from the live exercise row without comparison (or keep the payload key and ignore it on insert, which preserves the fixed key set that §12.3 needs for W-1 subsumption — say which). Nothing in MEDIUM-5's motivation requires the basis: only the profile determines the row shape, and only the profile is locked. Align §10.1 with I-14 and A-18, and add the negative control — a queued slot op whose `loadBasis` is stale applies, while one whose `measurementProfile` is stale rejects.

### V-2 (MEDIUM) — Release-1's treatment of `setSchemeSchema` is ambiguous, and it decides whether §14.5's rollback promise is true

§21.1 says Release 1 ships "no new scheme variant" and lists "scheme variants" under **Does not ship**, while §21.2 lists "scheme variants in the editor" under Release 2's ships. Two Release-1 acceptance criteria need the variants to exist: **A-3** ("reproduce §9.2 completely" — the table's `distanceRounds`/`durationRounds` columns) and **A-12** (`schemeDefaultReps` returns null "for `distanceRounds` / `durationRounds`"), and §21.1's own parenthetical concedes "no new variants yet" for A-12.

The ambiguity is not editorial, for two reasons.

**(a) "Server-side only" is not available here.** `src/domain/schemes/setScheme.ts` lives under `domain`, which both `server` and `sync`/`ui` import (`eslint.config.mjs:40-46`). Whatever Release 1 ships in that module ships to the client too. So the R1 scope decision is binary: either both sides know the two variants, or neither does.

**(b) It changes §14.5's Release 2 → Release 1 row.** That row promises "Display degradation only". If R1's `setSchemeSchema` lacks the variants, then after a rollback a template holding a `distanceRounds` prescription behaves as follows, traced through the repository:

- `buildTodayBundle` does **not** validate the stored scheme — `src/server/today/service.ts:519` casts: `scheme: (p.scheme as SetSchemeEnvelope).scheme`. The bundle is served, carrying an unknown variant.
- `parseHistoryPrescribed` (`:205-211`) uses `safeParse` and returns `null`, so history degrades gracefully. ✓
- `startSession` → `sessionExerciseFullRowOp` → `buildSessionExerciseUpsertPayload` → `prescriptionSnapshotSchema.parse` → `setSchemeSchema` **rejects** → the builder throws. The athlete cannot start that workout at all.

That is the failure §13.2 already documents for "Old client, new bundle with a `distanceRounds` prescription" (with its "Update the app to start this workout" mitigation), but it is not carried into §14.5's rollback row, which reads as though only rendering is affected.

**Required correction.** State explicitly that Release 1 ships the widened `setSchemeSchema` (and the `prescriptionSnapshotDataSchema` `measurement` key) as part of its server-side acceptance, with the editor simply not offering the variants — which is what makes O-7 option (b)'s rollback promise true. Then remove "no new scheme variant" from §21.1's prose and from its Does-not-ship list, keeping only "scheme variants **in the editor**". If instead the owner wants the schema held back, §14.5's R2 → R1 row must say that templates holding a new variant cannot start a session, cross-referencing §13.2.

### V-3 (MEDIUM) — release mapping between §13.5 and §21 is inconsistent

Four cases where a Release-1 line depends on a Release-2 or Release-3 mechanism:

| Item | §21 places it in | Depends on |
|---|---|---|
| **A-5** | R1 | contains **NC-13**, which §13.5 assigns to R2 |
| **A-9** | R1 | contains **NC-6** and **NC-7**, both assigned R2 in §13.5 |
| **A-3** | R1 | the two new scheme variants (V-2) |
| **A-14** | R1 ("default rule") | names a *seeded* `bodyweight-box-jump` fixture; that catalog entry does not exist until **R3** (§14.4's R1 row says the catalog is unchanged) |

None changes the design; all four make the Release-1 review gate unexecutable exactly as listed. **Required correction:** either split the composite criteria per release (A-5a/A-5b, A-9a/A-9b) or annotate each with the release its parts belong to, and reword A-14's fixture as a hand-built `reps` exercise rather than a seeded slug.

### V-4 (MEDIUM) — the ADR-011 amendment is not on the owner-decision surface

§11.6 amends two clauses the owner accepted as binding (the e1RM revision's §9.6 ordered refusal list and its §15.4 reason-code enum with I-14/A-19). The amendment note itself is exactly what MEDIUM-3 asked for and is well argued. But every other cross-cutting change in this design got an `O-nn` entry — including the two that arose from this same review round (O-13, O-14) — while the amendment appears only in §11.6 and in §24's documentation table.

As a result the owner can approve O-1…O-16 in full without ever being asked whether the tracker's refusal ordering and closed enum may change. That is a hole in the decision surface for a document whose gate is "ready for owner decisions".

**Required correction:** add an owner decision (accept the §11.6 amendment as written / keep "category code wins" and place the new codes after equipment / defer the codes and refuse profile-ineligible exercises under the existing `EXERCISE_CATEGORY_UNSUPPORTED`), and cross-reference it from §11.6.

### V-5 (LOW) — stale acceptance-criterion cross-references

Inserting A-18 shifted the tail of §20, and two references were not updated:

- **§13.4** ends "either way **A-22 and A-24** assert what the athlete sees" — should be **A-23 and A-25**. The correction log's own MEDIUM-6 row says A-23/A-25. As written it points at the sprint/plank e2e and the legacy-bundle e2e.
- **R-5**'s mitigation cites **A-24** for the service-worker update prompt; that requirement is in **A-25**.

Both point at real but wrong criteria, so a reader following them lands on the wrong test.

### V-6 (LOW) — NC-10's anti-vacuity clause is ill-posed

NC-10 asserts "no `0` load or `1` rep appears in any mapped domain input (I-13)". A legitimate single (`reps: 1`) and a legitimate bodyweight-only set (`weightKg: 0`, `data-model.md:230`) are both valid `load_reps` data, so the clause is either false on realistic fixtures or vacuous on fixtures chosen to avoid them.

The **equality** half of NC-10 is sound and is the real detector: if a `duration` set were mapped as `0 kg`, the `load_reps`-subset output would differ from the output with the other profiles removed, because `modalWorkingLoad` and `classifySet` would both see the extra row. **Required correction:** keep the equality assertion, and replace the clause with something checkable — e.g. assert the mapped input **row count** equals the count of `load_reps` non-warm-up rows, or build the mixed-profile fixture from values (loads ≥ 5 kg, reps ≥ 2) that a fabricated `0`/`1` cannot collide with.

### V-7 (LOW) — "delete the coalesce" will not compile on its own

§11.3 site 3 says to "delete the `weightKg ?? 0` coalesce". After the migration, `row.weightKg` is `number | null` and `StrengthSetInput.weightKg` is `number` (`src/domain/strength/types.ts:26-32`); a profile filter expressed as a `WHERE` clause or a `.filter()` does not narrow the type. The site needs an explicit skip beside the existing `if (row.setNumber === null) continue;` at `:190`. **Required correction:** word it as "replace with an explicit null skip", not "delete", so the implementer does not reach for a cast.

### V-8 (LOW) — `volumeCounting`'s "required" scope in the catalog is ambiguous

§16 says `volumeCounting` is "**required on every `load_reps` and `reps` entry**". Read as a `SeedCatalogExercise` type change, that touches all ~90 existing catalog entries; read as §14.4's R2 row implies, only the three legacy entries gain explicit values and the rest keep the column default. **Required correction:** state which — the R2/R3 reading is almost certainly intended, and `strengthEstimate?` already sets the optional-field precedent (`src/db/seed/exerciseCatalog.ts:14-32`).

### V-9 (LOW, observation) — `SyncRejectReason` gains two members

`invalid_measurement` and `measurement_profile_mismatch` must join the `SyncRejectReason` union (`src/server/sync/service.ts:44-58`), and both surface as `deadReason` on the sync-issues screen. Neither §12.2 nor I-6 says so; I-6's "unchanged" list does not contradict it, so this is a completeness note rather than an error. Worth one line in §12.2 alongside the O-16 copy.

---

## 5. Confirmations the prompt asked for

### 5.1 The previously validated core model remains sound

Re-read against the original review's §2 "what the evaluation gets right". Unchanged: the six-profile vocabulary and its mapping to PI-005's classes (§5.3); the representation comparison and its rejections (§5.2); `load_basis` as a label and a gate with no arithmetic (§7.1, I-4); the unilateral convention (§7.2); `set_logs` keeping its name and numbering (§8.6); `PrescriptionSnapshot` at `v = 1` and `SCHEME_ENVELOPE_VERSION` at 1 (§8.7, X-7); the frozen-slot reading that protects historical volume and e1RM; `weight_kg = 0` semantics (H-12, now strengthened with "a null load is never coerced to 0"); the set-level composite FK and its three proven properties (§2.3 of the review, now cited in §8.3 and I-3); the ESLint boundary conclusion; H-13's column-pattern check. Rejected alternatives X-1…X-7 and X-9…X-18 are untouched; X-8 is withdrawn for the reason MEDIUM-5 gave, and X-19…X-22 are new and each records a decision the review forced.

### 5.2 No unenforceable guarantee was introduced

Each new or strengthened invariant was tested for enforceability:

| Invariant | Enforceable? |
|---|---|
| I-3 (slot freeze + exercise lock as database guarantees) | **Yes** — both follow from composite FKs; the parent-update refusal was probed in the original review and the mirror FK behaves identically by construction (NC-5 asserts both, with drop-the-constraint controls) |
| I-8 (no batch failure by CHECK violation or numeric overflow) | **Yes**, and correctly scoped — it claims those two classes, not all SQLSTATEs |
| I-13 (no coercion at SQL→domain boundaries) | **Yes** as a code rule; detected by NC-10's equality half (see V-6 for the clause that is not) |
| I-14 (user-scoped derivation, no default fallback) | **Yes** — but its scope disagrees with §10.1 (V-1) |
| I-7 (fixed key set per profile) | **Yes** — NC-1 with mutation witnesses across all three builders |
| I-11 (reconcile never in Release 1) | **Yes** — a release-scope rule, checkable by inspection |

### 5.3 Would the tests and negative controls actually detect the failures?

| Failure the review found | Control | Detects? |
|---|---|---|
| Unreachable numeric ceiling / `22003` wedge | NC-4 boundary rows + A-2 | **Yes** — the ceiling+0.01 and round-into-overflow rows are exactly the two cases that were invisible before |
| Release-1 reconcile making an exercise unloggable | A-17 per release + I-11 | **Yes** — the R1 row asserts the catalog seeds as `load_reps` and no reconcile runs |
| Old build freezing a wrong slot shape | NC-5 mirror-FK half, with a drop-the-constraint control | **Yes** |
| Rollback dead-lettering ops | NC-13 (parse against frozen previous-build schemas) | **Yes** — and it is the right shape of control, since the failure is a schema-parse outcome, not a runtime behaviour |
| Fabricated `0 kg` from a null | NC-10 equality half | **Yes**; its second clause is ill-posed (V-6) |
| `reps`-profile volume default | A-14 (default excluded, `'auto'` counts) + NC-11 | **Yes** |
| Assisted pull-up refusal-code change | A-15 before/after assertion | **Yes** |
| W-1 builder drift | NC-1 across all three builders with mutation witnesses | **Yes** for the two entities W-1 governs; correctly no longer claimed to close W-1 |
| Stale `loadBasis` on a queued slot op | **none** | **No** — the V-1 path has no control, because the document does not recognise it as a path |

### 5.4 Owner decisions remain undecided

Confirmed. §22 carries sixteen entries (O-1, O-2, O-3, O-4(i), O-4(ii), O-5, O-6, O-7, O-8, O-9, O-10(i), O-10(ii), O-11, O-12, O-13, O-14, O-15, O-16), each with a *Recommendation* column and a *Trade-off* column, none marked accepted. No "ACCEPTED"/"binding" language appears outside the description of prior, already-owner-accepted documents. The document ends `READY FOR TARGETED ARCHITECTURE VERIFICATION`, not a decision claim. All four decisions the review said were missing exist (O-13 emission rule, O-14 mirror FK, O-15 `weightKg` precision, O-16 refusal surfacing), and the five it said were mis-posed are re-posed (O-4 split, O-5 three-way with the deploy-window option, O-6 with exact caption text, O-7 three-way with per-option rollback cost, O-10 split). The one decision still missing is the ADR-011 amendment (V-4).

Cross-reference integrity: `NC-1…NC-13` and `O-1…O-16` are each defined once and every reference resolves; no dangling ids. Only the two acceptance-criterion references in V-5 are stale.

### 5.5 Nothing confirmed-correct was unnecessarily reopened

No section the original review credited was altered except to add precision the review itself requested. H-1…H-15 are unchanged apart from clarifying additions to H-7, H-9, H-12 and H-13; H-16/H-17 are new and both were demanded. N-1…N-11 are unchanged; N-12/N-13/N-15 are extensions. The two substantive narrowings — `rep-progression` restricted to `load_reps` (X-20) and X-8's withdrawal — are consequences of HIGH-2 and MEDIUM-5 respectively, not independent redesign. Citation accuracy remains high: of roughly twenty newly added references I opened, all twenty resolve to what the text claims, including the four that carry the most weight (`strength/service.ts:194-195`, `reasonCodes.ts:57-59` and `:118`, `flush.ts:115-123`, `volume-model.md:13`).

---

## 6. Required corrections

1. **V-1** — restrict the `sessionExercise` insert comparison to `measurementProfile`; align §10.1 with I-14 and A-18; state what happens to a payload `loadBasis` (ignored on insert, or dropped); add the negative control for a stale basis versus a stale profile.
2. **V-2** — state that Release 1 ships the widened `setSchemeSchema` and the snapshot `measurement` key; correct §21.1's "no new scheme variant" to "no new scheme variant *in the editor*"; if the schema is instead held back, correct §14.5's R2 → R1 row to say templates holding a new variant cannot start a session.
3. **V-3** — split or annotate A-3, A-5, A-9 and A-14 so every Release-1 line is executable at Release 1.
4. **V-4** — add an owner decision for the §11.6 ADR-011 amendment.
5. **V-5** — fix the two stale references (§13.4 → A-23/A-25; R-5 → A-25).
6. **V-6** — replace NC-10's "no `0` load or `1` rep" clause with a checkable assertion.
7. **V-7** — reword §11.3 site 3 as "replace with an explicit null skip".
8. **V-8** — say whether `volumeCounting` becomes a required `SeedCatalogExercise` field or is required only for new athletic entries.
9. **V-9** — note the two new `SyncRejectReason` members in §12.2.

Items 1 and 2 change behaviour. Items 3–9 are consistency and test-plan precision.

---

## 7. Verdict

Every finding the review raised is closed, the five build-changing corrections are closed and correctly propagated through the schema rules, constraints, migration path, snapshot and historical behaviour, the sync contract, the offline and rollout analysis, the UI flows, the invariants, the negative controls, the acceptance criteria, the release plan and the owner-decision table. The core model is unchanged and still sound, no confirmed-correct area was reopened, the owner decisions remain open, and the revision independently improved on the review in two places.

It is held back by one new HIGH defect — a data-loss path created by the fix for MEDIUM-5, on which the document contradicts itself three ways — and by three consistency gaps in the Release-1 gate and the decision surface. These are clause-level edits; the design does not need to change.

**REVISION REQUIRED**
