# Athletic Exercise Measurement Profiles — Release 2 independent review (PI-005)

**Date:** 2026-09-08
**Reviewer:** independent, adversarial pass — no involvement in the implementation
**Tree under review:** the working tree at `main` `1c5a782` + the uncommitted Release-2 change set (59 tracked files changed, +3,402/−696; 16 new untracked files, 3,338 authored lines)
**Binding specification:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` (§21.2 defines Release 2; O-1…O-17 accepted 2026-09-07)
**Implementation report under review:** `docs/reviews/athletic-measurement-profiles-release-2-implementation.md`
**Release-1 lineage:** used as historical context only; every Release-1 claim relied on below was re-checked against the current tree.

**Method.** Every claim below was re-derived from the tree, not read out of the implementation report. Live verification ran against a **disposable PostgreSQL 16.14 container** (`gymapp-r2-review`, `postgres:16`, host port **55432**) holding eleven throwaway databases; the persistent `gym-app-db-1` was **never connected to, migrated, seeded, read or written** in this pass, and production was never contacted. The full gate set (unit, integration, real-PostgreSQL concurrency, production `pnpm build`, `format:check`, `drizzle-kit generate` drift, full Playwright e2e against a production build on a disposable database) was re-run from scratch. Beyond re-running the shipped suites I wrote **eleven independent probes** — six of them driving the real browser UI — covering paths the shipped suite does not reach. Both mutation witnesses claimed by §9 of the implementation report were **re-executed independently**, against scratch copies of the two modules so that no tracked implementation file was ever modified.

**Repository hygiene.** No file in the repository was created, modified or deleted by this review except this document. Scratch code lived in a repo-local `.tmp-review/` directory (needed for `node_modules` resolution) which has been removed; `git status --porcelain` is byte-identical before and after (80 entries plus this new document). The disposable container and every database in it were removed at the end (§12).

---

## 0. Verdict

**The core of Release 2 is genuinely good, and most of it is independently proven here.** O-13's profile-scoped emission is byte-for-byte identical to the pre-Release-2 `load_reps` shape — I reproduced that at the `JSON.stringify` level, key order included, which is stronger than what the shipped test asserts. The seed reconcile (O-5) is exactly the four predicates §14.3 specifies: I ran all five reachable database states (clean, unreferenced, session-referenced, prescription-only, already-reconciled) on real PostgreSQL and every one converged to the spec'd outcome, idempotently and byte-stably. The R-9 deploy-window exposure is bounded exactly as disclosed. The new A-20 concurrency suite passes 6/6 against real PostgreSQL for me, and both mutation witnesses are genuinely discriminating — the seed-reconcile one even more strongly than reported, since the mirror composite FK raises `23503` when the service guard is removed. All six profiles complete a real create → prescribe → log → edit → delete/renumber → complete → History flow in a real browser against a real production build. Every protected boundary (no migration `0014`, no sync-contract change, no progression/e1RM change, no Release-3 catalog entry or contribution, no derived speed/pace) is untouched. Every gate count in the implementation report reconciles exactly with what I measured.

**Two paths that the specification designs are, however, broken end to end, and neither is disclosed.**

1. **A cross-device (or post-eviction) resume of a non-`load_reps` session silently loses the frozen measurement profile.** The server's `ActiveSessionExerciseDto` never carries `measurement`, so `normalizeActiveSession` defaults every adopted slot to `load_reps` / `unspecified`. I reproduced this in the browser: a synced 90 s plank round renders on the second device as **`null kg × null`**, the card offers `kg` and `RIR` inputs and no `s` input, and anything logged there is rejected `invalid_measurement` and dropped at completion. `pwa-offline-strategy.md`'s own Release-1 seam list told Release 2 to close exactly this gap "before any non-`load_reps` active session can render"; half of it (the set DTO) was closed and this half was not.
2. **Ad-hoc adding any of the five new profiles fails completely.** `addAdhocExercise` hardcodes `load_reps`, so the emitted `sessionExercise` op is rejected `measurement_profile_mismatch` — I reproduced this for all five profiles through `applySyncBatch` and once through the real UI. §10.2 designs this path explicitly, and `ExerciseDto` already carries the profile at the picker's call site. The implementation report records the hardcoding as a "judgment call … deferred to a later stage" without stating that the path it governs does not work.

Both fail closed — nothing is silently miswritten, and the composite FKs plus the effective-row validation hold throughout — so neither is a BLOCKER. Both are HIGH: a named end-to-end behaviour of this release is non-functional, and the record understates it.

Below that: one real 320 px overflow on the widest new row (which the shipped A-22 check does not measure), one O-16 timing gap in which the completion confirmation can be missed, and a documentation section left factually false. The `ExerciseForm` and `PrescriptionForm` Release-2 UI have **no shipped test at all** and the report's A-11b row claims e2e coverage that does not exist — I drove both through the browser myself and both behave correctly, so this is an evidence defect, not a product defect.

I found **no BLOCKER**, **two HIGH product defects**, **two MEDIUM product defects**, **two MEDIUM record defects**, and eight LOW items.

**READY FOR REMEDIATION** (restated in full at §13).

---

## 1. Findings

Product defects are behaviour in the shipped artifact. Report / documentation / test defects are defects of the record or of the evidence.

| Id | Severity | Kind | Finding |
| --- | --- | --- | --- |
| **H-1** | HIGH | product | The server's `ActiveSessionExerciseDto` (`src/server/today/service.ts:131-148`) never carries `measurement`, so **every cross-device adopt / post-eviction resume of a non-`load_reps` session freezes the wrong profile** locally: logged rounds render `null kg × null`, the card shows the wrong inputs, and any set logged there dead-letters `invalid_measurement`. Reproduced in the browser and through the service path. (§5.1) |
| **H-2** | HIGH | product | `addAdhocExercise` hardcodes `{profile: "load_reps", loadBasis: "unspecified"}`, so **ad-hoc adding any of the five new profiles is rejected `measurement_profile_mismatch`** and the slot is unusable. Reproduced for all five profiles on real PostgreSQL and once through the UI. §10.2 designs this path; the data is already at the call site. (§5.2) |
| **M-1** | MEDIUM | product | The `load_distance` **edit row overflows 320 px** (`scrollWidth = 329`). Every other profile measures exactly 320 in entry, read and edit mode. §15.3 claims the widest new row "has today's budget"; A-22's shipped check measures only `distance_time` and `duration`, and only before any row exists. Reproduced. (§5.3) |
| **M-2** | MEDIUM | product | O-16's **card marker and completion confirmation lag a rejection by up to 5 s**. `flushOutbox` refreshes the dead-letter banner immediately (`flush.ts:113`) but never calls `refreshSessionBlocked`, which only runs on `SyncStatusBanner`'s 5 s poll — so an athlete who completes inside that window gets **no** "unsaved sets will be dropped" confirmation. Reproduced (marker absent at 4 s, present at 14 s). (§5.4) |
| **M-3** | MEDIUM | test coverage / report accuracy | The Release-2 **`ExerciseForm` and `PrescriptionForm` UI have no automated coverage at all** — `measurementProfiles.spec.ts` creates exercises and prescriptions through `page.request.post`, never the forms. The report's A-11b row nonetheless claims both are "e2e-covered in `tests/e2e/measurementProfiles.spec.ts`". I verified both manually (they are correct — §4.6); the defect is the missing evidence and the false claim. (§6.1) |
| **M-4** | MEDIUM | documentation accuracy | `pwa-offline-strategy.md`'s "**Two disclosed Release-1 seams Release 2 must close**" block is left untouched: seam 1 now states something **false** about the shipped code ("the client's mirror … is untouched — still `number`-only, with no `distanceM`/`durationS`"), and seam 2 (re-derive `load_basis` on an `exerciseId` swap) is neither done nor mentioned anywhere in the Release-2 report. (§6.2) |
| **L-1** | LOW | report accuracy | §2's A-11b row claims `ExerciseForm` handles "**`400 load_basis_not_supported`**". It does not — the 400 branch renders "Please check the muscle contributions: at least one primary is required." The code is unreachable from this form, so no product impact. (§6.3) |
| **L-2** | LOW | test quality | `dead-letter.spec.ts`'s A-23 test asserts the op reaches `status === "dead"` but **never asserts `deadReason === "invalid_measurement"`**, which is the report's §3 claim. I verified the exact reason independently. (§6.4) |
| **L-3** | LOW | test quality | `setLogEmission.test.ts`'s "mutation witness" is a **negative-control assertion**, not a mutation of production code, and neither it nor any other test asserts **key order** — the actual content of the "byte-identical" claim. I verified byte-identity independently at the `JSON.stringify` level. (§6.5) |
| **L-4** | LOW | report accuracy | §1.9's heading reads "**Tests — new (16 files, 3,338 lines)**" but the table lists **13** test files; 16 is the total new-file count (13 tests + 3 source modules). The 3,338-line total is exact. (§6.6) |
| **L-5** | LOW | product / specification | A **session-referenced seeded Plank** receives no `volume_counting` correction (unlike the referenced Farmer's Carry), so its fabricated reps keep counting toward abs volume forever. Faithful to §14.3, which has no such branch — raised for the owner, not as an implementation error. (§5.5) |
| **L-6** | LOW | product / specification | A **reconciled unreferenced Farmer's Carry keeps `volume_counting = 'auto'`** while a fresh seed gives the same exercise `'off'` — divergent stored state between a migrated and a fresh account. Structurally irrelevant (`load_distance` is excluded from volume either way). Faithful to §14.3. (§5.5) |
| **L-7** | LOW | specification deviation | §15.1 places the Measurement-profile select "directly under Equipment"; it ships **last in the form**, after `ContributionEditor`, to protect `muscleTaxonomyV2.spec.ts`'s positional `<select>` indices. Disclosed in the report's §11; recorded here so it is not re-litigated. (§6.7) |
| **L-8** | LOW | product hardening | `correctHistorySet` now schema-parses its payload and can therefore **throw**; both call sites use `void correctHistorySet(...)` after an optimistic local edit, so a throw would leave the screen showing a change no op carries. Unreachable today because `validateSetInput` mirrors every wire bound exactly. (§6.8) |

---

## 2. What I re-ran, and what it produced

Every number below is mine, measured on this tree, not copied from the report.

| Gate | My result | Report's claim | Match |
| --- | --- | --- | --- |
| `pnpm test:unit` | **1114/1114** passed, 0 failed, 79 files, 5.5 s | 1114/1114, 79 files | ✅ exact |
| `pnpm test:integration` | **448 passed / 17 skipped (465)**, 0 failed, 27 files run + 6 skipped (33) | 448/465, 17 skipped, 27+6 files | ✅ exact |
| `pnpm test:e2e` (production build, disposable DB) | **121/121** passed, 0 failed, **3.1 min**, first attempt, no flake | 121/121, 3.0 min | ✅ exact |
| `pnpm build` | succeeds; typecheck + lint clean; 40 routes emitted | succeeds, 40/40 static pages | ✅ |
| `pnpm format:check` (tracked paths) | clean | clean | ✅ |
| `drizzle-kit generate` drift | "No schema changes, nothing to migrate"; `git status`/`git diff` on `drizzle/` empty | no drift | ✅ |
| Migration count | `drizzle/*.sql` = **14** files, `0000`…`0013`; **no `0014`** | no `0014` | ✅ |
| A-20 real-PostgreSQL concurrency | **1/1**, then **5/5** consecutive clean re-runs, 0 flakes | 1/1 + 5/5 | ✅ exact |
| Reconcile on a clean database | `{users: 1, updated: 0, noop: 4}` | same | ✅ exact |
| File manifest | 59 files changed, **+3,402 / −696**; 16 new untracked files, **3,338** lines | same | ✅ exact |

Protected boundaries, re-derived by me against the working tree:

- `git diff --stat -- src/server/sync/service.ts` → **empty**.
- `git diff --stat -- src/domain/progression/ src/server/progression/ src/domain/strength/ src/server/strength/ src/ui/strength/ src/domain/sync/schema.ts` → **empty**.
- `git status --porcelain --untracked-files=all -- src/domain/strength/ src/server/strength/ src/ui/strength/ src/server/sync/` → **empty**.
- `src/db/seed/exerciseCatalog.ts` slug count: **94 before, 94 after**; the diff adds no `slug:` and no `muscleGroupId:` line — no Release-3 catalog entry, no new muscle contribution.
- `grep` for `speed` / `pace` / `m/s` / `km/h` across `src/domain/measurement/`, `src/ui/workout/`, `src/ui/history/`: **nothing** outside the "not displayed in v1" comments — O-9 holds.

---

## 3. Independently proven correct (credit)

These are behaviours I re-derived myself, with my own fixtures, and which hold.

### 3.1 O-13 profile-scoped emission is byte-identical for `load_reps` — key order included

The shipped `setLogEmission.test.ts` asserts key *sets* (`Object.keys(...).sort()`) and a `toEqual` on the payload, neither of which constrains key **order** — and key order is exactly what "byte-identical on the wire" means. I reconstructed the pre-Release-2 builder body verbatim from `git show HEAD:src/sync/activeSession.ts`, built both payloads through `buildSetLogUpsertPayload`, and compared the serialised strings:

```
old JSON: {"id":…,"sessionExerciseId":…,"setNumber":3,"isWarmup":false,"weightKg":102.5,"reps":4,"rir":1,"loggedAt":…,"notes":"bumped weight"}
new JSON: {"id":…,"sessionExerciseId":…,"setNumber":3,"isWarmup":false,"weightKg":102.5,"reps":4,"rir":1,"loggedAt":…,"notes":"bumped weight"}
BYTE-IDENTICAL (JSON.stringify): true
```

This holds despite `setLogFullRowOp` now spreading `...measuredFieldsForProfile(profile, set)` *after* `loggedAt`/`notes` (a different literal order from the old builder) because `setLogUpsertPayloadSchema.parse` reconstructs the object in the schema's own declaration order. That is a real, load-bearing dependency on Zod's object-parse behaviour that no test pins; L-3 records it.

The renumber upserts are profile-scoped as specified, and the `profile = load_reps` default preserves the legacy nine-key shape for every pre-existing caller:

```
setLog upsert {"id":…,"sessionExerciseId":…,"setNumber":1,"isWarmup":false,"weightKg":42.5,"distanceM":22,"durationS":30,"loggedAt":…,"notes":null}
legacy renumber keys: id,sessionExerciseId,setNumber,isWarmup,weightKg,reps,rir,loggedAt,notes
```

### 3.2 The seed reconcile, on all five reachable states

Run on fresh `postgres:16` databases, through the real `runSeed` / `reconcileMeasurementProfiles`, with each state built from a genuine pre-Release-2 downgrade plus real reference rows. Shape is printed as `profile/loadBasis/volumeCounting`.

| State | Plank | Farmer's Carry | Assisted Pull-up | Summary | Rerun |
| --- | --- | --- | --- | --- | --- |
| Clean DB (fresh seed) | `duration/null/off` | `load_distance/per_hand/off` | `load_reps/assistance/auto` | `{updated: 0, noop: 4}` | no-op |
| Unreferenced | `duration/null/auto` | `load_distance/per_hand/auto` | `load_reps/assistance/auto` | `{updated: 3, noop: 1}` | `{updated: 0}` |
| Carry referenced by a **session** | `duration/null/auto` | **`load_reps/unspecified/off`** — profile untouched, counting corrected | `load_reps/assistance/auto` | 3 updated | `{updated: 0}` |
| Carry referenced by a **prescription only** | `duration/null/auto` | **`load_reps/unspecified/auto`** — entirely untouched | `load_reps/assistance/auto` | 2 updated | `{updated: 0}` |
| Plank referenced by a **session** | **`load_reps/unspecified/auto`** — untouched | `load_distance/per_hand/auto` | `load_reps/assistance/auto` | 2 updated | `{updated: 0}` |
| Already reconciled | unchanged | unchanged | unchanged | `{updated: 0, noop: 4}` | `{updated: 0}` |

Every one matches §14.3's predicates exactly, including the prescription-only case, which the code's own comment reasons about correctly (a template reference is history; X-16 forbids converting it). **No historical fact is reinterpreted anywhere**: the only field ever changed on a referenced row is `volume_counting`, which §11.4/H-3 classes as current convention.

**Byte-stability of repeated seeding**, including `updated_at`: I dumped all three rows before and after a second full `runSeed` on a clean database and the JSON is identical to the millisecond — the state predicates mean a no-op run writes nothing at all, not even a timestamp bump.

### 3.3 The R-9 deploy window is bounded exactly as disclosed

Against a `duration` Plank slot on real PostgreSQL, through the real `applySyncBatch`:

```
[R9] derived slot profile: duration
[R9] OLD-SHAPE (R1 client) payload -> applied=0 rejected=["invalid_measurement"]
[R9] NEW-SHAPE payload            -> applied=1 rejected=[]
```

The old nine-key `{weightKg, reps, rir}` shape a still-serving Release-1 client would emit is refused outright, with the exact reason §12.2 names; the new profile-scoped shape applies. D-04's disclosure is accurate.

### 3.4 A-20, and concurrency beyond it

The new `setRenumberConcurrency.integration.test.ts` passed **1/1** and then **5/5** consecutive clean re-runs against a dedicated disposable database, with zero flakes. Its `beforeAll` guard (refusing a database that already has users) and its `afterAll` cleanup both work — each of the six runs found an empty database, which is itself evidence the cleanup is complete. I confirmed in `pg_constraint` that `uq_set_number` really is `DEFERRABLE INITIALLY DEFERRED` and that both composite FKs plus both unique pairs exist, so the race the suite sets up is the real one.

I then ran a case the shipped suite does not: **append + edit + delete-with-renumber, genuinely concurrent, on one `load_distance` slot**, over separate connections.

```
[CONC] append=[] edit=[] delete=[]
[CONC] final rows: [{n:1,w:31,d:20},{n:2,w:32,d:20},{n:4,w:40,d:25,s:30}]
[CONC] distinct set_numbers=3/3; deleted row present=false; all profiles load_distance=true
```

No duplicate `set_number`, no orphan, no resurrection of the deleted row, no profile drift, no rejection. (The surviving numbering is `1, 2, 4` rather than `1, 2, 3` — the appended round raced the renumber. That gap is inherent to the pre-existing per-op-transaction design and reproduces identically for `load_reps`; it is not a Release-2 regression and no invariant forbids it, since the client aggregate owns contiguity and renumbers from its own view on the next delete.)

### 3.5 Poison-batch containment, delete/renumber and no resurrection

A batch containing one shape-invalid op and one innocent op, on real PostgreSQL:

```
[A23] poison batch: applied=1 rejected=["invalid_measurement"]
[A23] rows after poison batch: [{n:1,w:60,d:20,s:12.4,r:null},{n:2,w:62.5,d:22,s:null,r:null}]
```

The poison op does not fail the batch, the innocent op applies, and the already-stored row is untouched — I-8 holds through the real service path for the new reason code. Deleting round 1 then produced the correct renumbered survivor with `distanceM`/`durationS` preserved, and **replaying the whole delete+renumber op group with fresh op ids converged to the identical state** — no resurrection, no duplicate, no stale overwrite.

### 3.6 Both mutation witnesses re-executed, independently

I did not modify any tracked implementation file. Instead I took byte-for-byte scratch copies of the two modules, applied the stated mutation to the copy, and ran the shipped assertions against production and mutant side by side.

**O-16 session-membership guard** (`sessionExerciseIds.has(op.payload.sessionExerciseId)` → `true`):

```
PRODUCTION   foreign dead letter -> refusedSetLogIds.size=0 has(foreign)=false => shipped assertion (size===0) PASSES
MUTATED      foreign dead letter -> refusedSetLogIds.size=2 has(foreign)=true  => shipped assertion (size===0) FAILS
```

The shipped negative test genuinely detects broken refusal matching, and unrelated dead letters genuinely do **not** mark the active session. The report's "2 of 6 tests failed" is also consistent with the file's shared `fake-indexeddb` accumulation across tests, which I confirmed by reading the suite.

**Seed-reconcile `notExists(session_exercises)` guard** (removed from the copy), against an identical session-referenced fixture:

```
PRODUCTION  referenced carry after reconcile: load_reps/unspecified/off
MUTATED     threw: Failed query: update "exercises" set "measurement_profile" … | cause code: 23503
MUTATED     referenced carry after failed reconcile: load_reps/unspecified/auto
```

Confirmed, and confirmed *more strongly* than the report predicted: with the service guard gone the **mirror composite FK** refuses the reinterpretation outright and aborts the whole reconcile transaction. Defense in depth is real, and the predicate is load-bearing.

### 3.7 All six profiles, end to end, in a real browser

The full 121-test Playwright suite ran green against a **production build** on a **disposable** database, first attempt, with no process incident of any kind. Afterwards the database held real `set_logs` rows for **all six** profiles and correctly shaped slots and exercises:

```
set_logs by profile:  distance_time 2 | duration 2 | load_distance 5 | load_duration 2 | load_reps 95 | reps 2
slots:                distance_time (null) | duration (null) | load_distance total | load_duration total | reps (null) | load_reps unspecified
exercises:            load_distance/per_hand/off (seeded carry) | duration/·/off (seeded plank) | load_reps/assistance/auto (seeded pull-up)
```

This is the strongest single piece of evidence in the release: create → prescription → session snapshot → logging → copy-forward → edit → delete/renumber → completion → History works for every profile against real PostgreSQL and a real service worker, and the seeded rows land in exactly the shape §14.4's R2 row specifies.

### 3.8 Consumer boundaries

- **Metrics Training** — `aggregateTrainingWeeks` filters on `isWarmup` only, with no profile gate: every non-warm-up attempt of every profile counts (O-6). The caption is the exact accepted string.
- **Muscle volume** — `aggregate.ts:192-193` gates on `isProfileEligibleForVolume(profile) && volumeCounting === "auto"`; the structural restriction and the switch both apply.
- **Strength** — `queryFactRows` keeps only `load_reps` slots (`:206`) and then explicitly skips null `weightKg`/`reps` (`:214-215`) rather than coalescing; `isProfileEligibleForE1rm` is `profile === "load_reps" && loadBasis !== "assistance"`. Metrics selection applies the same `!== "load_reps"` skip.
- **Progression / e1RM** — untouched (§2). `evaluateSession` retains its R1 profile skip, and the client evaluator reaches it through the same shared function, so client and server converge.
- **`DB_VERSION` stays 2** (`src/sync/db.ts:19`), matching §12.4.

### 3.9 Things the report claims that I re-checked and confirmed

- The `adoptRemote` normalisation fix is real and is what stops the cross-device resume from throwing (`today.spec.ts:43` passes) — though it fixes the crash, not the profile (H-1).
- The `ExerciseForm` accessible-name regression fix is real: both `aria-label`s are present, and `strengthPage.spec.ts`'s `getByLabel("Strength estimate", { exact: true })` passes.
- All seventeen touched e2e specs contain **selector-only** changes plus the three new tests; I diffed every removed line and found no weakened or deleted assertion.
- The seeded catalog test genuinely asserts that **every other** entry still omits the three new fields.

---

## 4. Independent probes I added, and what each showed

| Probe | What it does | Outcome |
| --- | --- | --- |
| `emissionProbe` | Serialised comparison of old vs. new `load_reps` payloads; profile-scoped renumber upserts; legacy default | byte-identical; §3.1 |
| `seedProbe` | Clean-DB seed, explicit reconcile, second full seed, before/after row dump incl. `updated_at` | no-op, byte-stable; §3.2 |
| `reconcileMatrix` | Five reconcile states on fresh databases with real reference rows | all match §14.3; §3.2 |
| `reconcileWitness` | Scratch-copy mutation of the `notExists` guard | discriminating, plus a `23503` backstop; §3.6 |
| `o16Witness` | Scratch-copy mutation of the session-membership guard, production vs. mutant | discriminating; §3.6 |
| `syncProbe` | A-23 exact reason, poison-batch containment, delete/renumber replay, R-9, 3-way concurrency | all pass; §3.3–3.5 |
| `adoptProbe` | Real `getActiveSession` → `normalizeActiveSession` → `formatSetLine` → emitted op → server verdict | **H-1** |
| `adhocProbe` | The exact `sessionExerciseFullRowOp` payload an ad-hoc add produces, for all five new profiles | **H-2** |
| `reviewProbe` (browser) | 320 px widest row; `ExerciseForm` §15.1; `PrescriptionForm` A-11b; cross-device adopt; ad-hoc add | **M-1**, **H-1**, **H-2**, plus §4.6 credit |
| `widthProbe` (browser) | Entry / read / edit row `scrollWidth` at 320 px for all six profiles | **M-1**; §4.5 |
| `envPrecedence` | Proves a shell `DATABASE_URL` survives Next's `.env.local` loading | safety control for the e2e run |

### 4.5 The 320 px width matrix (mine; no shipped equivalent)

Measured on a real production build at viewport 320×568, after logging one round and opening its edit row:

| Profile | Entry row | Read row | Edit row | Verdict |
| --- | --- | --- | --- | --- |
| `load_reps` | 320 | 320 | 320 | ok |
| `reps` | 320 | 320 | 320 | ok |
| **`load_distance`** | 320 | 320 | **329** | **OVERFLOW** |
| `distance_time` | 320 | 320 | 320 | ok |
| `duration` | 320 | 320 | 320 | ok |
| `load_duration` | 320 | 320 | 320 | ok |

### 4.6 `ExerciseForm` and `PrescriptionForm`, driven through the browser (credit)

No shipped test touches either form's Release-2 behaviour (M-3). I drove both, and both are correct:

- The Measurement-profile select offers exactly `load_reps, reps, load_distance, distance_time, duration, load_duration`, in §5.3's order, and is enabled on create.
- Create-mode Load basis offers exactly `total, per_hand, assistance` — `unspecified` correctly withheld per §15.1 — and the whole control disappears for `duration` and reappears for `load_duration`.
- On an exercise referenced by a prescription, changing the profile returns `409 measurement_profile_locked`; the form reacts exactly as §10.3/§15.1 specify: the select **reverts** to the stored value, becomes **disabled**, and the exact accepted copy ("Used in history or a template — create a new exercise to change how it is measured.") renders both inline and as the error.
- For that `duration` exercise, Strength estimate and Volume counting render as **static lines** ("Not available for this measurement profile.", ×2) with **no `<select>` present** — §11.1's "never show an enabling control for an incompatible engine" holds.
- `PrescriptionForm` for a `distance_time` exercise offers exactly `["distanceRounds"]` and `["manual"]`, shows "Distance per round (m)", and hides both the RIR band and Baseline load. For a `reps` exercise it offers exactly `["fixed","repRange"]` and `["manual"]`, shows the RIR band and hides Baseline load. That reproduces §9.2 and §9.3 exactly, on the UI side.

---

## 5. Product defects, in detail

### 5.1 H-1 — a cross-device or post-eviction resume loses the frozen profile

`src/server/today/service.ts`'s `ActiveSessionExerciseDto` (`:131-148`) has no `measurement` key and `getActiveSession` never populates one. `src/sync/activeSessionStore.ts`'s `adoptRemote` and `src/sync/activeSession.ts`'s `hydrateFromServer` both route the raw remote object through `normalizeActiveSession`, whose sole job for a missing `measurement` is to substitute `{profile: "load_reps", loadBasis: "unspecified"}`. That default is correct for a *pre-upgrade cached aggregate*; it is wrong for a *live server response about a `duration` session*, and the two are indistinguishable to the normaliser.

Through the service path, on real PostgreSQL, for a session with one 90 s plank round already synced:

```
SERVER DTO exercise keys: id,exerciseId,exerciseName,position,source,prescription,skipped,notes,loadStepKg,recommendation,sets
SERVER DTO has `measurement`: false
SERVER DTO set: {…,"weightKg":null,"reps":null,"rir":null,"distanceM":null,"durationS":90,…}
AFTER normalizeActiveSession -> measurement: {"profile":"load_reps","loadBasis":"unspecified"}
read-mode render on the adopting device: "null kg × null"
adopting device would emit: {…,"weightKg":0,"reps":1,"rir":null,…}
server verdict on that op: [{"reason":"invalid_measurement"}] applied: 0
```

And in the real browser, device B resuming device A's in-progress plank workout:

```
REVIEW Adopt …
3 × 45 s
Strength estimate       <- the e1RM link, wrongly offered for a duration slot
Skip
null kg × null          <- the 90 s round
Edit  Delete
Warm-up set             <- "set", not "round"
kg                      <- wrong input column
[P4] device B: nullLine=true rirInputPresent=true durationInputPresent=false
```

Consequences on the adopting device: the frozen profile is wrong in IndexedDB (the normalised object is what `hydrateFromServer` persists), every logged round of the session renders as `null kg × null`, the Set/Round noun is wrong, a dead-end Strength-estimate link appears, and every set logged there is refused and dropped from the aggregate at completion. Nothing is miswritten server-side — the effective-row validation and the composite FKs hold — so this fails closed.

Reachability is not exotic. `TodaySection`'s "Resume here" is the ordinary path after a reinstall, a cleared site data, a second browser, or a storage eviction the app itself warns about (`SyncStatusBanner`'s persistent-storage line). `today.spec.ts:43` exercises exactly this path and passes only because its fixture is `load_reps`.

This is also the *first* of the two seams `pwa-offline-strategy.md` explicitly assigned to Release 2 (M-4): "Release 2's client-DTO widening must add these **before any non-`load_reps` active session can render**." The set half was closed; the exercise half was not, and `activeSession.ts`'s own comment says "Release 2 ships that in a later stage" — a stage that never ran.

**Fix shape:** add `measurement: { profile, loadBasis }` to the server's `ActiveSessionExerciseDto` and populate it from the slot's typed `session_exercises` columns in `getActiveSession`'s mapping (the columns are already selected for other purposes); keep `normalizeActiveSession`'s default as the pre-upgrade tolerance it was designed to be. No schema change, no sync-contract change.

### 5.2 H-2 — ad-hoc adding any new profile is rejected outright

`src/sync/activeSession.ts`'s `addAdhocExercise` freezes `{profile: "load_reps", loadBasis: "unspecified"}` unconditionally. `sessionExerciseFullRowOp` then always emits `measurementProfile: exercise.measurement.profile`, and §10.1's server rule compares that key against the profile derived from the live exercise row. For any exercise that is not `load_reps`, they disagree.

Through the real service path, using the exact payload the client builds:

```
duration       applied=0 rejected=["measurement_profile_mismatch"]
load_distance  applied=0 rejected=["measurement_profile_mismatch"]
distance_time  applied=0 rejected=["measurement_profile_mismatch"]
reps           applied=0 rejected=["measurement_profile_mismatch"]
load_duration  applied=0 rejected=["measurement_profile_mismatch"]
```

And through the UI, adding a `duration` exercise mid-workout:

```
[P5] dead letters: ["sessionExercise:measurement_profile_mismatch"]
[P5] "Not saved - see Sync issues." marker present: true
```

The athlete gets a card rendered with the wrong (`load_reps`) inputs, a permanent dead letter, and — correctly — the O-16 "Not saved" mark. Every set logged against that slot would then reject `not_found` (no parent row) and be dropped at completion. §10.2 designs this path in detail, including the reason the client must carry the real profile ("The search result … carries `measurement`, so the card renders the right inputs immediately and the aggregate stores it for offline use"), and `AddAdhocExercise` already holds a full `ExerciseDto` with `measurementProfile` and `loadBasis` at the call site.

The implementation report records the hardcoding under §11 Judgment calls as "its call site has no access to the real exercise's profile this release … deferred to a later stage". That is not accurate about the call site — the data is there — and it does not state the consequence, which is that a designed path of this release does not work at all.

**Fix shape:** thread `measurement` through `AddAdhocExercise` → `activeSessionStore.addAdhocExercise` → `activeSession.addAdhocExercise`, defaulting to `load_reps`/`unspecified` only when the caller genuinely has nothing (three files, no contract change). Worth an e2e case, since §10.2 also names the ad-hoc mismatch as the one *load-bearing* path for `measurement_profile_mismatch`.

### 5.3 M-1 — the `load_distance` edit row overflows 320 px

Measured on a production build (§4.5): `scrollWidth = 329` against a 320 px viewport, only for `load_distance`, only in edit mode. The edit row for that profile renders weight + distance + duration inputs (`w-16`, `w-16`, `w-16`), the `m:ss` sibling span, and the Save and Cancel buttons — one element more than any other profile's edit row.

§15.3 asserts "the widest new row (`kg · m · s`) has today's budget" and A-22 requires `document.documentElement.scrollWidth <= viewport width`. The shipped A-22 check in `measurementProfiles.spec.ts` runs only for `distance_time` and `duration` (both narrower), and only before any round is logged, so it cannot see this. The consequence for the athlete is a horizontally scrolling workout screen on a 320 px device while correcting a sled-push round — precisely the small-screen case §15.3 sizes for.

**Fix shape:** narrow one of the three inputs (or drop the `m:ss` sibling to a second line) in `ExerciseCard`'s `SetRow` edit branch, and extend the A-22 width assertion to the `load_distance` edit row so the check can no longer miss the widest case. `HistoryDetail`'s edit row has the same element set and should be measured too.

### 5.4 M-2 — O-16's marker and completion confirmation can lag past the moment they matter

`refreshSessionBlocked` is the only writer of `refusedSetLogIds` / `refusedSessionExerciseIds`, and it is called from exactly two places: `adoptRemote`, and `SyncStatusBanner`'s `setInterval(…, 5000)`. `flushOutbox`, which is where a rejection actually becomes a dead letter, refreshes only the sync-status store:

```ts
await Promise.all(result.rejected.map((r) => markDeadLetter(r.opId, r.reason)));
if (result.rejected.length > 0) void useSyncStatusStore.getState().refreshDeadLetters();   // flush.ts:112-113
```

So the app-wide banner updates immediately (good), while the card marker and — more importantly — `handleComplete`'s `refusedCount` do not. I observed exactly this: the O-16 slot marker was **absent** 4 s after a `measurement_profile_mismatch` dead letter and **present** at 14 s. An athlete who taps "Complete workout" inside that window sees only the ordinary "Complete this workout?" prompt, never the "N unsaved sets … will be dropped" confirmation that O-16 exists to provide, and the aggregate is discarded.

The loss is not total — the dead letter survives with its payload intact and stays inspectable and retryable on `/sync-issues`, and the banner was already visible — so this is MEDIUM, not HIGH. But "completion stays possible but **confirms** that unsaved sets will be dropped" is the specific protection O-16 was accepted for, and it is skippable by timing.

**Fix shape:** one line in `flush.ts` beside the existing `refreshDeadLetters()` call, and/or an `await refreshSessionBlocked()` at the top of `handleComplete` before reading the counts. A test that dead-letters an op and completes immediately would pin it.

### 5.5 L-5 / L-6 — two asymmetries in the reconcile the owner should see

Both are faithful to §14.3 as written; neither is an implementation error. I raise them because §14.3's table was written before Release 2 had run against a populated database.

- **L-5.** The referenced Farmer's Carry gets `volume_counting = 'off'` so its fabricated reps stop counting as hypertrophy volume (§11.4's stated rationale). A **referenced Plank** gets no equivalent branch, so a Plank logged as "0 kg × 60 reps" keeps counting toward abs volume forever, under exactly the same "fabricated reps" argument. Confirmed by running the state: plank stays `load_reps/unspecified/auto`.
- **L-6.** After the reconcile an unreferenced carry is `load_distance/per_hand/**auto**`, while a fresh seed produces `load_distance/per_hand/**off**`. Both are excluded from volume structurally, so nothing observable differs — but the same seeded exercise carries different stored state on a migrated account than on a fresh one, which is the kind of divergence a later `volume_counting` change could make visible.

---

## 6. Record, evidence and documentation defects

### 6.1 M-3 — the two Release-2 forms have no coverage, and the report says they do

`tests/e2e/measurementProfiles.spec.ts` builds every fixture through `createMeasurementExercise` (`page.request.post("/api/exercises")`) and `createTemplateWithScheme` (`page.request.post(".../prescriptions")`). It navigates only to `/today`, `/today/workout` and `/history/:id`. It never opens `/exercises/new`, `/exercises/:id` or `/templates/:id/prescriptions/new`. There is no unit or component test for `ExerciseForm` either, and the only `PrescriptionForm` coverage is `formOptions.test.ts`, which tests two pure helpers and not the component that consumes them.

So the whole of §15.1 (unlocked profile select, load-basis gating, the edit-mode notice, the static ineligibility lines, the reactive `409` handling) and the component half of A-11b ship untested. The implementation report's §2 nonetheless states, for A-11b: "`ExerciseForm.tsx`'s reactive `409 measurement_profile_locked` handling … `PrescriptionForm.tsx`'s scheme/field gating via `dimensionsOf`; **e2e-covered in `tests/e2e/measurementProfiles.spec.ts`**." That claim is false.

This matters more than usual because the one real `ExerciseForm` regression this release introduced — the lost accessible name on the Strength-estimate select — was caught only incidentally, by an unrelated `strengthPage.spec.ts` assertion. The helper's own comment justifies the gap by pointing at `muscleTaxonomyV2.spec.ts` as the form's "already-passing acceptance surface", but that spec covers contributions and would not have caught it either.

I verified both forms manually and both are correct (§4.6), so remediation here is evidence, not behaviour: correct the A-11b row, and add an e2e case that drives the profile select, the load-basis gating, the lock, and the scheme/strategy option sets through the real forms.

### 6.2 M-4 — a production architecture doc now states something false

`docs/architecture/pwa-offline-strategy.md` §5 still carries, verbatim and unedited:

> **Two disclosed Release-1 seams Release 2 must close (added 2026-09-07 …).** Neither is reachable today; both become live only once Release 2 unlocks client emission and the profile/basis selectors.
> 1. … the client's mirror (`src/sync/types.ts`) is untouched — still `number`-only, with no `distanceM`/`durationS`. Release 2's client-DTO widening must add these before any non-`load_reps` active session can render.
> 2. `applySessionExerciseUpsert`'s update path does not re-derive `load_basis` on an `exerciseId` swap … Release 2 … should extend the insert-time re-derivation to this update path too.

Seam 1's factual assertion is now **wrong** — `src/sync/types.ts` was widened by this very release — while the obligation it states is only half-discharged (H-1 is the other half). Seam 2 was **not** addressed: `src/server/sync/service.ts` is untouched, correctly so under §21.2's "must-not-change: the server-side sync contract", which puts the two documents in direct tension. Neither seam is mentioned anywhere in the Release-2 implementation report.

The §24.2 checklist makes documentation amendments a review-gate item for this release, and this section is squarely about the mechanism Release 2 ships. It needs one edit: mark seam 1 discharged (or restate what remains, per H-1), and either discharge seam 2 or re-target it to the release that is permitted to touch the sync service.

The four amendments §24.2 *does* name are all present and accurate: `pwa-offline-strategy.md`'s O-13/O-16 paragraphs and the capability-matrix row, `deviations.md`'s new **D-04** (with the exact accepted revisit triggers), `volume-model.md` §1's caption note quoting the shipped string, and `data-model.md` §2.4's reconcile-outcome note — whose description of the referenced/unreferenced split matches what I measured (§3.2) exactly.

### 6.3 L-1 — `400 load_basis_not_supported` is claimed but not handled

`src/app/api/exercises/[id]/route.ts:73-77` really does return `{ error: "load_basis_not_supported" }` with status 400. `ExerciseForm`'s `handleSubmit` branches `409 && body?.error === "measurement_profile_locked"` → `409` → `422` → `400`, and the `400` arm renders "Please check the muscle contributions: at least one primary is required." A `load_basis_not_supported` response would therefore show a message about muscle contributions.

No product impact: the form sends `loadBasis: isLoadBearing ? loadBasis : undefined`, derived from the same `measurementProfile` it submits, so the server error is unreachable from this form. The defect is the report's §2 claim that the handling exists.

### 6.4 L-2 — A-23's shipped test does not assert the reason it is about

`dead-letter.spec.ts`'s new test polls until the injected op's outbox `status === "dead"` and then asserts the payload survived. It never reads `deadReason`. The report's §3 states the op "dead-lettered with reason `invalid_measurement` (exact string)" — true (I confirmed it, §3.5), but nothing in the suite would notice if it became `invalid_payload` or `invalid_reference`, which are precisely the confusions §12.2 warns about. One extra assertion on the record's `deadReason` closes it.

### 6.5 L-3 — the NC-1 client witness is a negative control, and key order is unasserted

Two separate points about `tests/unit/sync/setLogEmission.test.ts`:

- Its final test is labelled "mutation witness" but mutates nothing: it asserts that a deliberately wrong *expectation* throws. That proves the assertion discriminates between profiles — useful — but it is a negative control, not a mutation witness, and the report's §2 lists it as the latter. (The two genuine mutation witnesses in §9 are real; §3.6.)
- The file's byte-identity test uses `toEqual` and `Object.keys(...).sort()`, neither of which constrains key order — and key order is the whole content of "byte for byte" on a JSON wire. The property does hold (§3.1), but it holds because of `ZodObject`'s parse-order behaviour, which nothing in the suite pins. A single `expect(Object.keys(op.payload)).toEqual([...])` in declaration order would make the claim real.

### 6.6 L-4 — §1.9's heading miscounts

"Tests — new (16 files, 3,338 lines)" heads a table of **13** test files. 16 is the correct count of *all* new files (13 tests + `reconcileMeasurementProfiles.ts`, `formOptions.ts`, `validateSetInput.ts`), and 3,338 is the correct line total across all sixteen — I measured both. Only the heading's noun is wrong.

### 6.7 L-7 — the disclosed §15.1 placement deviation

§15.1 puts the profile select "directly under Equipment"; it ships last, after `ContributionEditor`, so that `muscleTaxonomyV2.spec.ts`'s `page.locator("select").nth(3)` / `.nth(5)` keep resolving. The report discloses this. I record it so a future reader does not treat it as an oversight: it is a real, accepted deviation from the spec's prose, and it is the reason the four new/changed selects all sit in a trailing group.

### 6.8 L-8 — `correctHistorySet` can now throw into a `void`

`buildSetLogCorrectionPayload` schema-parses, so an out-of-range patch throws rather than dead-lettering. Both call sites (`HistoryDetail`'s `onSave`) do `updateLocalSet(...)` first and then `void correctHistorySet(...)`, so a throw would leave the screen showing an edit that no op carries, with an unhandled rejection. Unreachable today — `validateSetInput` runs first and mirrors every wire bound (`9999.99`, `1..100`, `0..10`, `>0..99999.99`, `>0..86400`, ≤2 decimals) — but the ordering is now load-bearing in a way it was not before, and nothing pins the two bound tables together.

---

## 7. Priority-by-priority summary against the review brief

| Brief item | Outcome |
| --- | --- |
| **1.** All six profiles end to end | ✅ proven in a real browser against real PostgreSQL and a production build (§3.7), plus the exact §15.4 lines, partial attempts, copy-forward, renumbering and History. **Except** the ad-hoc entry point (H-2) and the cross-device resume (H-1). |
| **2.** Client + offline correctness | ✅ legacy bundle (A-24) and pre-upgrade aggregate hydration; profile-scoped full rows; fixed-key `sessionExercise` payload; `load_reps` byte compatibility (§3.1); absent-vs-null semantics (NC-7, re-run); lost response / duplicate replay / transient failure / auth expiry / network flap all green unmodified; concurrency on real PostgreSQL (§3.4); no resurrection, stale overwrite, orphan or poisoned batch (§3.5). **Except** H-1's hydration default. |
| **3.** Exercise and prescription rules | ✅ profile lock (409, reactive, verified through the UI); `loadBasis` stays editable and snapshots stay frozen; structurally incompatible controls are replaced by static copy, never a disabled control; profile-dependent defaults; §9.2/§9.3 compatibility on **both** server and UI (§4.6); decimal and boundary validation mirrored between `validateSetInput` and the wire schema. |
| **4.** Workout and History UI | ✅ exact required/optional/forbidden fields per profile; Set/Round wording; load-basis formatting; seconds + `m:ss`; partial attempts; warm-up toggle in every profile; accessible names asserted per profile; long values; no derived speed or pace; corrections preserve the frozen profile and are schema-parsed. **Except** M-1 (320 px, `load_distance` edit row). Touch-target sizing is device-checklist work (A-25) and was not assessed here. |
| **5.** O-16 refusal handling | ✅ only the affected card/row is marked (mutation-witnessed, §3.6); unrelated dead letters do not block; the payload stays inspectable and retryable; the tests genuinely detect broken matching. ⚠️ the banner is the pre-existing app-wide one (correct reading of "the existing banner") and updates immediately, but the card mark and completion confirm lag up to 5 s — **M-2**. |
| **6.** Seed reconcile and deploy window | ✅ exact predicates for all three slugs; referenced / prescribed / unreferenced / already-reconciled all verified on real PostgreSQL; no reinterpretation of historical facts; deterministic and byte-stable repeated seeding; R-9 window reproduced and bounded; no Release-3 entries or contributions. Two spec-level asymmetries raised (L-5, L-6). |
| **7.** Consumers and boundaries | ✅ Training counts every non-warm-up attempt; volume stays structurally restricted and honours `volume_counting`; strength follows the profile/basis gates; progression and e1RM arithmetic untouched; no `0014`, no drift, no unauthorised schema or server-contract change; Release 3/4 scope absent. |
| **8.** Evidence quality | ✅ A-20 independently re-run 6×; both mutation witnesses independently reproduced; every reported count, skip, file-scope and manifest number reconciles exactly; the disclosed Playwright process incident did **not** recur — my authoritative run was fully isolated (§8) — and the report's disclosure of it is accurate and appropriately unvarnished. Three evidence defects found: M-3, L-2, L-3. |

---

## 8. The disclosed Playwright process/environment incident

The implementation report's §7 discloses that verification's first `test:e2e` attempt ran without `DATABASE_URL` set, that a log-file mixup then let two Playwright suites race the same shared dev database, that both stray process trees were identified and killed, and that one clean re-run produced the authoritative 121/121. I treated that as a reason to isolate my own run rather than as a reason to distrust the result, and then checked both halves.

**Isolation of my run.** Before starting I confirmed port 3000 was free and that no `node` or `chrome-headless-shell` process existed. Because `.env.local` pins `DATABASE_URL` to the dev database, I first proved with Next's own `loadEnvConfig` that a shell-set `DATABASE_URL` survives `.env.local` loading (`shell value survived: true`), so the server Playwright spawns inherits the disposable URL. I then ran the suite with `DATABASE_URL` pointed at a throwaway `e2echeck` database on port 55432. Afterwards that database held 71 sessions, 108 set-log rows and slots across all six profiles (§3.7) — positive proof the run landed there and not on `gym-app-db-1`, which was never contacted by any command in this pass.

**Was the incident's conclusion sound?** Yes, and my run corroborates it: 121/121 on the first attempt in 3.1 minutes, no retries, no flake, on a clean database and a fresh production build. Nothing in the failure set the report describes reappeared. The report's framing — that the failures reflected its own process mistake and not an application defect — is consistent with what I measured. Its disclosure of the incident, including naming its own mistake and the exact recovery, is a point in the record's favour rather than against it.

---

## 9. Judgment calls in the report that I checked and accept

- **`buildSetDeletionOps`'s `profile` default of `load_reps`** — verified: every production call site passes the frozen profile explicitly (`activeSession.deleteSet`, `corrections.deleteHistorySet`), and the default reproduces the legacy nine-key shape byte-for-byte for pre-existing tests (§3.1).
- **`buildSetLogCorrectionPayload` reusing `setLogUpsertPayloadSchema`** — correct: adding a second schema would have touched the protected sync contract, and the correction shape is exactly that schema's shape. (See L-8 for the one consequence.)
- **No profile-scoped duplicates for `duplicate-replay` / `lost-response-retry` / `sync-auth-expiry` / `network-flap`** — I read `applySyncBatch`'s dedup and retry paths and confirm they branch on op identity and payload shape, never on measurement profile; duplicating those specs would exercise byte-identical code. Non-gap, correctly judged.
- **`vitest.config.ts`'s `esbuild: { jsx: "automatic" }`** — scoped to the Vitest pipeline only; `tsconfig.json` is untouched and Next's own compiler is unaffected. It is what makes the two component-level tests possible, and both are genuinely useful.
- **No shared component between `SetRow` and `HistorySetRow`** — both consume the same `dimensionsOf` and `validateSetInput`, so the rules cannot drift; only the JSX is duplicated, and `SetRow`'s input order is load-bearing for three positional e2e specs. Reasonable.
- **No baseline distance/duration prescription fields** — correct: no column exists and adding one needs a migration, which §21.2 forbids.
- **`ActiveSessionExerciseDto.measurement` typed required, guaranteed by the normaliser** — sound as a type-level decision. H-1 is not a consequence of this choice; it is a consequence of the server never sending the field.

---

## 10. Remediation checklist

Product (in order of severity):

1. **H-1** — add `measurement: { profile, loadBasis }` to the server's `ActiveSessionExerciseDto` and populate it in `getActiveSession` from the slot's typed columns. Add an e2e case: device A logs a `duration` round, device B resumes, and B must render the `m:ss` line and a `s` input (not `null kg × null`).
2. **H-2** — thread the picked exercise's `measurement` through `AddAdhocExercise` → store → `addAdhocExercise`. Add an e2e case: ad-hoc add a `duration` exercise, log a round, and the outbox must drain with zero dead letters.
3. **M-1** — fix the `load_distance` edit row at 320 px (and check `HistoryDetail`'s equivalent). Extend A-22's width assertion to the widest row in edit mode so the check can no longer miss it.
4. **M-2** — refresh the refusal sets when a rejection is recorded (`flush.ts`, beside `refreshDeadLetters()`) and/or before `handleComplete` reads its counts. Test: dead-letter an op and complete immediately.
5. **L-8** (optional) — handle the `correctHistorySet` rejection rather than `void`-ing it, or assert the two bound tables against each other.

Record:

6. **M-3** — correct the A-11b evidence claim, and add real UI coverage for `ExerciseForm` (§15.1) and `PrescriptionForm` (A-11b). §4.6 lists the assertions I used; they can be lifted directly.
7. **M-4** — update `pwa-offline-strategy.md`'s Release-1 seam block: seam 1's statement about `src/sync/types.ts` is now false; seam 2 needs an explicit discharge or re-targeting given §21.2's boundary.
8. **L-1** — drop the `400 load_basis_not_supported` claim, or implement the branch.
9. **L-2** — assert `deadReason === "invalid_measurement"` in the A-23 test.
10. **L-3** — relabel the NC-1 negative control, and add a key-order assertion to the byte-identity test.
11. **L-4** — fix §1.9's heading noun.
12. **L-5 / L-6** — owner decision: whether a referenced Plank should also get `volume_counting = 'off'`, and whether a reconciled unreferenced carry should be brought to `'off'` to match a fresh seed. Either way, §14.3's table should say so explicitly.

Nothing above requires re-deriving any evidence in §3.

---

## 11. What this review did **not** do

- **A-25 (physical iPhone acceptance)** was not performed and is out of scope for an automated pass: keyboard type per input, ≥ 44 px tap targets, VoiceOver announcement of each accessible name, the stale-service-worker update prompt, and the on-device rendering of the `m:ss` label all remain unexecuted. The report's §10 checklist is accurate and complete as far as I can judge it; note that M-1 will affect the 320 px half of it and H-1/H-2 should be fixed before the checklist is run, or two of its items cannot be exercised at all.
- **Touch-target measurement** was not attempted in the browser: the edit-row Save/Cancel/Edit/Delete controls are small (`text-xs`, `px-2 py-1`) but that sizing is pre-existing and unchanged by this release, and A-25 owns it.
- **Production** was not contacted in any way. Nothing was committed, pushed, tagged or deployed.
- **The persistent development database** (`gym-app-db-1`) was not connected to, migrated, seeded, read or written at any point.

---

## 12. Cleanup

- Disposable container `gymapp-r2-review` (`postgres:16`, port 55432) and all eleven throwaway databases in it: **removed** (`docker ps` shows only `gym-app-db-1`, untouched throughout).
- Repo-local scratch directory `.tmp-review/` (11 probe scripts, one Playwright config, two scratch module copies) and the Playwright `test-results/` output from the probe runs: **deleted**.
- No Playwright, Next or Postgres process left running; port 3000 released.
- `git status --porcelain` after this review is the same 80 entries as before, plus this document. No tracked or untracked file of the implementation was created, modified or deleted.

---

## 13. Verdict

Release 2's substance is strong and, for the most part, independently proven here: the emission rule is byte-exact where it matters, the seed reconcile is exactly the four specified predicates across every reachable database state, the deploy window is bounded as disclosed, the concurrency and mutation-witness evidence is genuine and reproduces on my machine, all six profiles complete a real end-to-end workout in a real browser, and every protected boundary and every reported number holds up.

It does not ship as-is, for two reasons that are the same reason twice: the frozen measurement profile is not carried across the two places where the client cannot derive it itself. On a cross-device or post-eviction resume the server never sends it, so a plank renders as `null kg × null` and anything logged there is refused; on an ad-hoc add the client never sends it, so the slot is refused outright for all five new profiles. Both fail closed, neither corrupts data, and both are small, contained fixes with no schema or sync-contract implication — but each breaks a path the binding specification designs, and neither is disclosed in the implementation report. Alongside them sit a genuine 320 px overflow on the one row §15.3 sizes for, an O-16 confirmation that can be outrun by a fast tap, a production architecture document that now asserts something untrue about the shipped code, and an evidence claim for the two Release-2 forms that the test suite does not support.

That is a focused remediation: four small code changes, four documentation or test corrections, and one owner decision — with no re-derivation of the evidence in §3 required.

**READY FOR REMEDIATION**
