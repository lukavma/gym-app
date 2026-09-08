# Athletic Exercise Measurement Profiles — Release 2 remediation verification (PI-005)

**Date:** 2026-09-08
**Verifier:** the same independent reviewer who wrote `athletic-measurement-profiles-release-2-review.md`; no involvement in the remediation
**Tree under verification:** the working tree at `main` `1c5a782` + the uncommitted Release-2 change set **as remediated** — 62 tracked files modified, 1 deleted, 24 new untracked source/test files (4,863 lines)
**Verifies:** `docs/reviews/athletic-measurement-profiles-release-2-remediation.md` against `docs/reviews/athletic-measurement-profiles-release-2-review.md` §1 (H-1, H-2, M-1, M-2, M-3, M-4, L-1…L-8)
**Binding specification:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` (§21.2; O-1…O-17 accepted 2026-09-07; §14.3/§18.1/§29 amended 2026-09-08 by the L-5/L-6 owner decisions) and `docs/reviews/athletic-measurement-profiles-owner-decision-integration.md`

**Method.** Every claim in the remediation report was treated as a claim to verify, not as evidence. Live verification ran against a **disposable PostgreSQL 16 container** (`gymapp-r2-verify2`, `postgres:16`, host port **55433**) holding eleven throwaway databases, every command carrying an explicit `DATABASE_URL` override; the persistent `gym-app-db-1` was **never connected to, migrated, seeded, read or written**, and production was never contacted. All gates were re-run from scratch. Beyond re-running the shipped suites I wrote **twelve independent probes** — seven of them driving the real browser against a production build — deliberately not reusing the remediation's own regression tests, plus **four discriminating negative controls** executed against scratch copies or pre-fix call paths so that no tracked implementation file was ever modified.

**Repository hygiene.** No file in the repository was created, modified or deleted by this verification except this document. Scratch code lived in a repo-local `.tmp-verify/` directory (needed for `node_modules` resolution), since removed. All pre-existing changes are preserved untouched: `CLAUDE.md` (+15/−0), `HANDOFF.md` (−183, deleted), `docs/input/product-ideas.md` (+354/−0) are byte-for-byte identical to the review's own baseline snapshot.

---

## 0. Verdict

**Every one of the fourteen findings is genuinely closed, and I proved the four that mattered load-bearing myself.**

The two HIGH defects are fixed at the root, not papered over. A second device — and, separately, the same device after its IndexedDB is destroyed — now resumes a `load_distance` session and renders `32.5 kg/hand · 20 m · 95 s · 1:35`: the frozen profile, the frozen `per_hand` basis label, the `m:ss` form, the right three inputs, no RIR column, the "Round" noun, no dead-end Strength link, and a further round logged from that device syncs with zero dead letters. Strip `measurement` back out of the server DTO and the review's exact defect returns (`null kg × null`, then `invalid_measurement`), so the fix is load-bearing. Ad-hoc adding every one of the five new profiles through the real picker now logs and drains cleanly; call the same production function without the new argument — precisely the pre-fix call site — and all five come back `measurement_profile_mismatch`.

M-2 is closed more convincingly than the remediation claimed. I measured the O-16 marker appearing **1 ms** after a `setLog` rejection was recorded and **2 ms** after a `sessionExercise` rejection, in the real browser; the same marker arriving by the poll alone takes **4,898 ms**. The completion confirmation fires deterministically from a store I left deliberately stale, with no poll tick in between. M-1's populated `load_distance` edit row now measures exactly 320 px in both the workout card and History detail, with a real optional duration and the `m:ss` label present. The seed reconcile converges correctly across all six states on real PostgreSQL, idempotently, including both new owner decisions.

Every gate count in the remediation report reconciles **exactly** with what I measured: 1129/1129 unit (82 files), 455 passed / 17 skipped / 472 total (28 + 6 files), 129/129 e2e first attempt, clean `format:check`, clean production build, A-20 6/6 on real PostgreSQL. Every protected boundary holds, and the formatting fix-up touched nothing outside the release's own file set — no tracked file carries a whitespace-only diff.

Six LOW residuals remain, all non-blocking and all matters of record or of an inert asymmetry the remediation itself disclosed. **None of them is a product defect.** In particular I independently assessed the one gap the remediation deliberately left open — seam 2, `load_basis` re-derivation on an `exerciseId` swap — on reachability rather than on the protected-file boundary, and it is unreachable from any client path: no mutator anywhere changes a slot's `exerciseId`.

**VERIFIED — READY FOR DEVICE ACCEPTANCE**

Automated verification has passed. Owner-authorized commit, push and deployment must precede the physical iPhone acceptance pass (A-25), which remains unexecuted.

---

## 1. Finding-by-finding verdicts

| Id | Original severity | Verdict | Independently proven by |
| --- | --- | --- | --- |
| **H-1** | HIGH product | **CLOSED** | V-H1a (cross-device, browser), V-H1b (post-eviction, browser), service-layer probe, CTRL H-1 negative control (§2.1) |
| **H-2** | HIGH product | **CLOSED** | V-H2 (all five profiles via the real picker, browser), CTRL H-2 negative control across all five profiles (§2.2) |
| **M-1** | MEDIUM product | **CLOSED** | V-M1 (populated rows at 320 px in Workout **and** History, with optional duration and `m:ss`) (§2.3) |
| **M-2** | MEDIUM product | **CLOSED** | V-M2a (1 ms), V-M2b (2 ms), V-M2c (deterministic completion confirm), V-M2d (4,898 ms poll-only counterfactual), CTRL M-2 scratch-copy control (§2.4) |
| **M-3** | MEDIUM test coverage / report | **CLOSED** | 6 new browser tests verified to drive the real routes; A-11b row re-read and confirmed accurate and self-limiting (§2.5) |
| **M-4** | MEDIUM documentation | **CLOSED** | Both seams re-read; seam 1's discharge independently verified on both halves; seam 2's deferral independently assessed on reachability (§2.6) |
| **L-1** | LOW report | **CLOSED** | Claim removed (0 occurrences); branch re-confirmed unreachable from the form (§3.1) |
| **L-2** | LOW test quality | **CLOSED** | Assertion present; `deadReason: "invalid_measurement"` independently measured twice, once through the browser (§3.2) |
| **L-3** | LOW test quality | **CLOSED** | Relabelled to "negative control"; key-order assertion present and matches the order I measured; `JSON.stringify` byte-identity independently reproduced (§3.3) |
| **L-4** | LOW report | **CLOSED** for the heading; see residual **R-3** | Heading re-read (§3.4) |
| **L-5** | LOW product / owner decision | **CLOSED** | Six-state reconcile matrix on real PostgreSQL (§2.7) |
| **L-6** | LOW product / owner decision | **CLOSED** | Same matrix; see residual **R-1** for the plank's unreferenced case (§2.7) |
| **L-7** | LOW specification deviation | **CLOSED** | Disclosure re-confirmed present in the implementation report §11 (§3.5) |
| **L-8** | LOW product hardening | **CLOSED** | Both real call sites re-read; CTRL L-8 scratch-copy control against the real `correctHistorySet`/`deleteHistorySet` (§2.8) |

No finding is reopened. No new product defect was found.

---

## 2. Product fixes — independently reproduced evidence

### 2.1 H-1 — cross-device and post-eviction resume

**Service layer.** Driving the real `applySyncBatch` and `getActiveSession` against real PostgreSQL, with a `duration` slot carrying one 90 s round:

```
[H-1] server DTO has `measurement`: true
[H-1] server DTO measurement: {"profile":"duration","loadBasis":null}
[H-1] server DTO set: {…,"weightKg":null,"reps":null,"rir":null,"distanceM":null,"durationS":90,…}
[H-1] after normalizeActiveSession: {"profile":"duration","loadBasis":null}
[H-1] adopting device renders: "90 s · 1:30"
[H-1] adopting device emits: {…,"setNumber":2,"isWarmup":false,"durationS":45,"loggedAt":…,"notes":null}
[H-1] server verdict on that write: applied=1 rejected=[]
```

The set-level pair (`distanceM`/`durationS`) is present too, so the parallel gap the review noted alongside is closed.

**Cross-device, in the browser (V-H1a).** Device A logs a `load_distance` / `per_hand` round of `32.5 kg × 20 m × 95 s`; device B is a **fresh browser context** with no local aggregate, resuming through the real "Resume here" button:

- the previous round renders as **`32.5 kg/hand · 20 m · 95 s · 1:35`** — frozen profile, frozen `per_hand` basis label, and the O-8 `m:ss` secondary form;
- the word `null` appears **nowhere** in the page;
- the controls are `Weight in kilograms` + `Distance in metres` + `Time in seconds`, with `Reps in reserve` and `Repetitions` both at count 0;
- the noun is **`Warm-up round`**, not "set";
- no `Strength estimate` link is offered on a `load_distance` slot;
- a further round logged from device B renders `35 kg/hand · 20 m`, the outbox drains, and neither "Not saved" nor "couldn't sync" appears.

**Post-eviction, same device (V-H1b).** After logging a 75 s `duration` round I deleted the entire `gym-app` IndexedDB database, reloaded, and resumed. `75 s · 1:15` renders intact, only the `s` input is present (`kg`/`reps`/`RIR` all count 0), no `null`, and a further 60 s round logs and drains cleanly.

**Discriminating control (CTRL H-1).** Taking the *same* live `getActiveSession` response and deleting only the `measurement` key — the exact pre-fix DTO shape — through the identical client code:

```
[CTRL H-1] FIXED    measurement={"profile":"duration","loadBasis":null} render="90 s · 1:30"
[CTRL H-1] PRE-FIX  measurement={"profile":"load_reps","loadBasis":"unspecified"} render="null kg × null"
[CTRL H-1] PRE-FIX  subsequent write -> ["invalid_measurement"]
```

The review's reported defect returns exactly, and only, when the fix is removed.

### 2.2 H-2 — ad-hoc add for all five new profiles

**Through the real picker, in the browser (V-H2).** Five exercises (`reps`, `load_distance`, `distance_time`, `duration`, `load_duration`) were ad-hoc-added mid-workout via `+ Add exercise` → search → tap, each then logged a round:

```
[V-H2] reps:          line "12 reps" logged
[V-H2] load_distance: line "60 kg · 20 m" logged
[V-H2] distance_time: line "40 m · 5.62 s" logged
[V-H2] duration:      line "45 s" logged
[V-H2] load_duration: line "20 kg · 45 s" logged
[V-H2] dead letters after all five ad-hoc adds: []
```

Each card rendered its own profile's fields (the fills succeed only because the right labelled inputs exist), the outbox drained, and neither "Not saved" nor "couldn't sync" appeared anywhere.

**Discriminating control (CTRL H-2).** The **real production** `addAdhocExercise` was called twice per profile — once with the new `measurement` argument (the fixed call site) and once with two arguments only (byte-for-byte the pre-fix call site, reachable because the parameter is optional) — each against its own clean session on real PostgreSQL, with the emitted op fed to the real `applySyncBatch`:

```
[H2] reps           FIXED   emitted=reps           slotVerdict=APPLIED
[H2] reps           PRE-FIX emitted=load_reps      slotVerdict=measurement_profile_mismatch
[H2] load_distance  FIXED   emitted=load_distance  slotVerdict=APPLIED
[H2] load_distance  PRE-FIX emitted=load_reps      slotVerdict=measurement_profile_mismatch
[H2] distance_time  FIXED   emitted=distance_time  slotVerdict=APPLIED
[H2] distance_time  PRE-FIX emitted=load_reps      slotVerdict=measurement_profile_mismatch
[H2] duration       FIXED   emitted=duration       slotVerdict=APPLIED
[H2] duration       PRE-FIX emitted=load_reps      slotVerdict=measurement_profile_mismatch
[H2] load_duration  FIXED   emitted=load_duration  slotVerdict=APPLIED
[H2] load_duration  PRE-FIX emitted=load_reps      slotVerdict=measurement_profile_mismatch
```

Perfect discrimination on all five, with the real emitted `measurementProfile` shown alongside the real server verdict.

### 2.3 M-1 — populated `load_distance` edit rows at 320 px

Measured on a production build at 320×568, with deliberately long values on every column and the **optional** duration present and ≥ 60 s so the `m:ss` label renders (`142.75 kg/hand · 1250.5 m · 125.25 s · 2:05`):

| Surface | Entry row | Read row | Edit row |
| --- | --- | --- | --- |
| Workout card (`ExerciseCard`) | **320** | **320** | **320** |
| History detail (`HistoryDetail`) | — | **320** | **320** |

The `2:05` label is asserted visible in **both** edit rows, so the fix relocated it rather than dropping it. The review's pre-fix measurement on this same row was `329`. Both surfaces are now at the budget, not over it — and the History edit row, which the review flagged as untested and which shares the element set, is now covered.

### 2.4 M-2 — immediate refusal surfacing, for sets *and* slots

Rather than trusting the two helper unit tests (which, as the brief notes, cannot prove UI wiring), I measured the real browser end to end. A rejection was forced by injecting a genuinely invalid op into the outbox and dispatching `online` (which `installFlushTriggers` listens for), then polling both the outbox record's status and the rendered DOM at 50 ms:

```
[V-M2a] setLog refusal:          {"deadAtMs":86,"markerAtMs":87,"lagMs":1,"deadReason":"invalid_measurement"}
[V-M2b] sessionExercise refusal: {"deadAtMs":88,"markerAtMs":90,"lagMs":2,"deadReason":"invalid_reference"}
```

- **Set refusal:** marker visible **1 ms** after the rejection was durably recorded. The marker is on the refused set's **own** row (asserted to contain `60 kg`), and the app-wide "changes couldn't sync" banner is visible.
- **Slot refusal:** marker visible **2 ms** after the rejection, on the exercise card header, banner visible.

**Counterfactual (V-M2d).** The same marker, for a dead letter that arrives *without* a flush (injected already-dead, so only the poll can surface it):

```
[V-M2d] poll-only marker latency: 4898 ms (flush path measured 1-2 ms)
```

A ~2,500× gap. A 1–2 ms lag is not attainable from a 5-second poll under any timing coincidence; the `flush.ts` wiring is demonstrably live for both entity kinds.

**Completion confirmation, deterministically (V-M2c).** After a reload (so the mount refresh had already run) I injected an **already-dead** record and pressed Complete before any poll tick. The card marker had **not** yet rendered — confirming the store was genuinely stale at that instant — and both dialogs still fired:

```
[V-M2c] marker rendered before pressing Complete: false
[V-M2c] dialogs seen: ["Complete this workout?",
  "1 unsaved set couldn't sync and will be dropped from this workout's totals if you complete it now.
   They stay visible on Sync issues so you can retry or discard them there. Complete anyway?"]
```

**Discriminating control (CTRL M-2).** The real `getRefusedCountAfterRefresh` versus a scratch copy with the awaited refresh removed, both reading from a store deliberately left stale with a real dead letter in a real outbox:

```
[CTRL M-2] FIXED      refusedCount from a stale store = 1
[CTRL M-2] NO-REFRESH refusedCount from a stale store = 0
[CTRL M-2] discriminating: YES — the awaited refresh is load-bearing
```

### 2.5 M-3 — genuine browser coverage, and an accurate claim

Both new spec files were read and confirmed to navigate to the real routes and drive the real components, not to shortcut through the API:

- `exerciseFormMeasurementProfile.spec.ts` — `page.goto("/exercises/new")` (×2) and `page.goto("/exercises/:id")` (×2). Its assertions cover the exact six-profile option set and order, the create-mode Load-basis option set (`total, per_hand, assistance` — `unspecified` correctly withheld) and its disappearance/reappearance across `duration`/`load_duration`, the `409` revert-and-disable with the locked copy asserted **twice** (inline hint plus a `role="alert"`), and the two static "Not available for this measurement profile." lines with `select[aria-label="Strength estimate"]` and `select[aria-label="Volume counting"]` both at count 0.
- `prescriptionFormMeasurementProfile.spec.ts` — `page.goto("/templates/:id/prescriptions/new")` (×2), asserting exact option arrays (`["distanceRounds"]`/`["manual"]` and `["fixed","repRange"]`/`["manual"]`) plus field visibility for the RIR band and Baseline load.

All six pass (tests #16–19 and #81–82 of my own 129/129 run). Independently, my own review-pass probes had reached the same conclusions about this behaviour, so the new tests encode behaviour that is genuinely correct rather than merely self-consistent.

The corrected A-11b row in the implementation report is accurate **and self-limiting** — it names the two spec files, names the three routes they drive, and explicitly states that `measurementProfiles.spec.ts` "creates its fixtures via `page.request.post` and never opens either form, so it is not evidence for this row." That is the opposite of an overbroad coverage claim.

### 2.6 M-4 — both seams, and an independent judgement on the deferral

**Seam 1 (discharged) — verified on both halves.** The doc now states the client mirror carries the widened set shape and that the exercise-level `measurement` gap was closed by the H-1 fix. Both are true in the tree: `src/sync/types.ts`'s `ActiveSessionSetDto` carries `weightKg`/`reps: number | null` plus `distanceM`/`durationS`, `ActiveSessionExerciseDto` carries `measurement`, and §2.1 above proves the server actually populates it end to end.

**Seam 2 (re-targeted, still open) — assessed on reachability, not on the file boundary.** The brief is explicit that a protected-file boundary alone does not make a gap non-blocking, so I assessed it independently:

1. **Unreachable from any client path.** A slot's `exerciseId` is *written* in exactly two places (`startSession`'s bundle mapping and `addAdhocExercise`) and *read* in exactly one (`sessionExerciseFullRowOp`, which emits `exercise.exerciseId` verbatim). No mutator anywhere in `src/sync/activeSession.ts` ever changes it, and there is no "replace this exercise in the session" feature. The client therefore cannot emit an `exerciseId` swap at all.
2. **Cross-profile swaps fail closed** at the mirror composite FK (`invalid_reference`), as the doc itself states and as Release 1's NC-5 already proved.
3. **The residual impact of a same-profile swap is a display label only.** §7.1 is binding: "no arithmetic is ever applied to `weight_kg` because of `load_basis` … It is a label and a gate," and §9.4 already establishes that the snapshot's basis copy "carries no authority."
4. **It is in tension with I-3, not merely unimplemented.** I-3 makes the slot's basis freeze deliberate ("no update path writes `session_exercises.load_basis`"). Re-deriving it on an `exerciseId` swap is therefore a *design decision* about what a swap means, not a defect fix — which is exactly why re-targeting it to a release permitted to touch `src/server/sync/service.ts` is the right disposition rather than patching it under Release 2's boundaries.
5. **No Release-2 acceptance criterion depends on it.** A-13, A-15, A-16, A-18, A-20…A-24, NC-6…NC-8, NC-13, NC-14 and O-16 neither exercise nor rely on the update-path derivation.

**Assessment: the deferral is compatible with Release-2 acceptance.** The doc's own wording ("Release 2 unlocked the basis selector, making this reachable") slightly overstates the exposure — unlocking the *exercise's* basis selector does not create a slot `exerciseId` swap, and a basis edit between session start and flush is the NC-14 case, which §10.1 designs to apply correctly on insert. That is a wording nit, not a substantive error; the seam is honestly recorded as open either way.

### 2.7 L-5 / L-6 — the reconcile matrix on real PostgreSQL

Six states, each on its own freshly-migrated disposable database, driving the real `runSeed` / `reconcileMeasurementProfiles`. Shape is `profile/loadBasis/volumeCounting`.

| State | Plank | Farmer's Carry | Assisted Pull-up | Summary | Rerun |
| --- | --- | --- | --- | --- | --- |
| Clean DB (fresh seed) | `duration/null/off` | `load_distance/per_hand/off` | `load_reps/assistance/auto` | `{updated: 0, noop: 5}` | `{updated: 0}` |
| Unreferenced | `duration/null/auto` | **`load_distance/per_hand/off`** ← **L-6** | `load_reps/assistance/auto` | `{updated: 3, noop: 2}` | `{updated: 0}` |
| Carry referenced by a session | `duration/null/auto` | `load_reps/unspecified/off` | `load_reps/assistance/auto` | `{updated: 3, noop: 2}` | `{updated: 0}` |
| Carry referenced by a prescription only | `duration/null/auto` | `load_reps/unspecified/auto` — untouched | `load_reps/assistance/auto` | `{updated: 2, noop: 3}` | `{updated: 0}` |
| **Plank referenced by a session** | **`load_reps/unspecified/off`** ← **L-5** | `load_distance/per_hand/off` | `load_reps/assistance/auto` | `{updated: 3, noop: 2}` | `{updated: 0}` |
| Already reconciled | `duration/null/off` | `load_distance/per_hand/off` | `load_reps/assistance/auto` | `{updated: 0, noop: 5}` | `{updated: 0}` |

Both accepted decisions land exactly as the amended §14.3 specifies: a **session-referenced legacy Plank retains its `load_reps` profile and gets `volume_counting = 'off'`** (L-5), and an **unreferenced Farmer's Carry converts to `load_distance`/`per_hand`/`off`** (L-6). Every state is idempotent on rerun, the `noop` count moved 4 → 5 exactly as the new sixth predicate requires, no historical measurement fact is reinterpreted anywhere (the only field ever changed on a referenced row is `volume_counting`), and the prescription-only carry remains entirely untouched. The remediation report's own §6 matrix matches my measurements row for row.

**The disclosed asymmetry (residual R-1).** In the *unreferenced* state the Plank ends `duration/null/**auto**` while a fresh seed of the same catalog entry produces `duration/null/**off**` — the identical mismatch L-6 resolved for the carry, under a rationale ("matching a fresh seed") that applies to the plank word for word. I assessed it on its own merits rather than treating it as owner-approved: **it is structurally inert** — `isProfileEligibleForVolume("duration")` returns `false`, so the switch cannot affect any aggregation regardless of its value — and it is **not blocking**. It is, however, a *new* inconsistency: before this remediation neither unreferenced conversion touched `volume_counting`; now one does and the other does not. I record it as a residual rather than a finding, and note that §14.3's unreferenced-plank row still reads "same unreferenced predicate as the carry" even though the carry row's **target** now differs, which will mislead a future reader.

### 2.8 L-8 — History correction/deletion rollback through the real call sites

**Wiring, read directly.** `HistoryDetail.tsx`'s `onSave` builds a `previous` snapshot from this render's pre-edit row and calls `submitHistorySetCorrection` with `applyOptimistic: updateLocalSet(…, patch)`, `revertOptimistic: updateLocalSet(…, previous)` and `onError: setSyncError(set.id, …)`. `onDelete` captures `previousSets` and calls `submitHistorySetDeletion` with `applyOptimistic: removeLocalSet`, `revertOptimistic: restoreLocalSets(…, previousSets)` and the same `onError`. The message renders under the read-mode row (`{syncError && <p className="text-xs text-red-400">{syncError}</p>}`), keyed per `setId`. Both bare `void correctHistorySet(...)` / `void deleteHistorySet(...)` call sites are gone.

**Discriminating control (CTRL L-8),** against the **real** `correctHistorySet`/`deleteHistorySet` with a real (fake-)IndexedDB outbox, versus a scratch copy of `correctionSubmit.ts` with both `catch` blocks removed:

```
[CTRL L-8] FIXED    correction: events=["apply","revert","error:Couldn't save this chang…"] threw=false
[CTRL L-8] FIXED    deletion:   events=["apply","revert","error:Couldn't delete this set…"] threw=false
[CTRL L-8] NO-CATCH correction: events=["apply"] threw=true
[CTRL L-8] NO-CATCH deletion:   events=["apply"] threw=true
```

The fixed wrappers apply, revert and surface a visible message with no escaping rejection; the control applies and then throws, leaving the phantom edit the review described. Both wrappers are load-bearing.

The rejection remains genuinely unreachable through the UI — `validateSetInput` mirrors every wire bound exactly (`9999.99`, `1..100`, `0..10`, `>0..99999.99`, `>0..86400`, ≤ 2 decimals) — which is why the control forces it below that guard. That was the finding's premise and it still holds; the point of L-8 was that the *ordering* became load-bearing, and it is now handled.

---

## 3. Record and documentation dispositions

### 3.1 L-1
`load_basis_not_supported` now appears **0 times** in `athletic-measurement-profiles-release-2-implementation.md`. Re-reading `ExerciseForm.tsx`'s `handleSubmit`, the branch order is `409 measurement_profile_locked` → generic `409` → `422` → generic `400`, with no `load_basis_not_supported` check — and the form still sends `loadBasis: isLoadBearing ? loadBasis : undefined`, derived from the same `measurementProfile` it submits, so the server cannot return that code to it. Removing the claim rather than adding dead-code handling is the correct disposition.

### 3.2 L-2
`tests/e2e/dead-letter.spec.ts` now carries `expect(deadRecord?.deadReason).toBe("invalid_measurement")`. I independently confirmed the string twice: once through `applySyncBatch` at the service layer, and once through the browser in V-M2a, where the injected nine-key op's own outbox record came back with `deadReason: "invalid_measurement"`.

### 3.3 L-3
The final test is relabelled "negative control" with an inline note distinguishing it from a genuine mutation witness. The byte-identity test gained a real key-**order** assertion listing `id, sessionExerciseId, setNumber, isWarmup, weightKg, reps, rir, loggedAt, notes`. That is exactly the order I measured independently, and the whole claim reproduces at the serialisation level:

```
[L-3] keys: id,sessionExerciseId,setNumber,isWarmup,weightKg,reps,rir,loggedAt,notes
[L-3] JSON.stringify byte-identical: true
```

### 3.4 L-4
§1.9's heading now reads "Tests — new test files: 13; all new files (incl. 3 non-test source modules): 16, 3,338 lines", which distinguishes the two counts correctly **for the implementation stage**. See residual **R-3**: those totals are now stale relative to the remediated tree.

### 3.5 L-7
The disclosure is present in the implementation report §11 ("Kept Measurement profile / Load basis … in their existing trailing position … rather than moving per the architecture doc's literal prose"). No change was needed and none was made — correct.

---

## 4. Gate reconciliation

Every number below is mine, measured on this tree, on disposable infrastructure.

| Gate | Remediation report claims | My measurement | Match |
| --- | --- | --- | --- |
| `pnpm test:unit` | 1129/1129, 82 files | **1129 passed (1129), 82 files**, 5.6 s | ✅ exact |
| `pnpm test:integration` | 455 passed / 17 skipped / 472, 28 run + 6 skipped | **455 passed \| 17 skipped (472), 28 passed \| 6 skipped (34)** | ✅ exact |
| `pnpm test:e2e` | 129/129 | **129 passed**, 3.1 min, **first attempt**, no flake, disposable DB, production build | ✅ exact |
| `pnpm format:check` | clean | **"All matched files use Prettier code style!"**, exit 0 | ✅ |
| `pnpm build` | succeeds, 40 routes, typecheck + lint clean | **Compiled successfully, 40/40 static pages**, exit 0 | ✅ |
| A-20 real-PG concurrency | 1/1 then 5/5, zero flakes | **6/6 consecutive clean runs**, zero flakes | ✅ (one better) |
| `drizzle-kit generate` drift | no drift | **"No schema changes, nothing to migrate"**; `git status`/`git diff` on `drizzle/` empty | ✅ |
| Migration count | 14 files, no `0014` | **14 `.sql` files, `0000`…`0013`; zero `0014`** | ✅ |

**Deltas against the review's own pre-remediation baseline:** unit +15 (1114 → 1129, +3 files), integration +7 (448 → 455, +1 file), e2e +8 (121 → 129). Every increment is accounted for by a named regression test: H-1 (1 unit + 1 integration + 1 e2e), H-2 (5 unit + 5 integration + 1 e2e), M-2 (4 unit), L-8 (4 unit), L-5 (1 integration), M-3 (6 e2e). Nothing went down; no test was weakened, skipped or deleted.

**Targeted re-runs** (named evidence, not just totals):

- `metrics.integration.test.ts` — O-6/A-16 block: "Training counts a non-`load_reps` attempt as a work set while Strength selection refuses the same exercise" ✓, "a retained row shows `not_available`, not `turned_off`" ✓.
- `today.integration.test.ts` — "H-1 — `getActiveSession`'s own exercise DTO carries the slot's frozen non-`load_reps` measurement" ✓.
- `reconcileMeasurementProfiles.integration.test.ts` — 11/11, including "bodyweight-plank — referenced (by a session) … (L-5)", the prescription-only untouched case, double-seed idempotence, and the interrupted/rolled-back retry ✓.
- `adhocExerciseMeasurement.integration.test.ts` — 5/5, one per new profile ✓.
- `pnpm test:e2e:offline` — **28/28** by name, including A-24 ("a pre-Release-2 cached bundle with `measurement` stripped … still starts and logs a `load_reps` session identically"), A-23 ("a `load_distance` round logged fully offline … syncs exactly once on reconnect"), plus duplicate-replay, lost-response-retry, network-flap, sync-auth-expiry, takeover, transient-failure-FIFO, stale-completed-session, offline cold launch, offline set edit/delete and offline recommendation ✓.

**Real-PostgreSQL evidence of the six-profile lifecycle.** After my e2e run the disposable database held set rows and correctly-shaped slots for every profile:

```
set_logs:          distance_time 3 | duration 13 | load_distance 15 | load_duration 3 | load_reps 119 | reps 3
session_exercises: distance_time(–) 2 | duration(–) 10 | load_distance/total 9 | load_distance/per_hand 2
                   | load_duration/total 2 | load_reps/unspecified 87 | reps(–) 2
```

---

## 5. Protected boundaries and scope

All re-derived by me against the working tree:

- **No migration `0014`** — `drizzle/` holds exactly 14 `.sql` files; `git status`/`git diff` on `drizzle/` are empty; `drizzle-kit generate` reports no drift.
- **Sync contract untouched** — `git diff --stat -- src/server/sync/service.ts` is empty.
- **Progression / e1RM arithmetic untouched** — `git diff --stat` across `src/domain/progression/`, `src/server/progression/`, `src/domain/strength/`, `src/server/strength/`, `src/ui/strength/`, `src/domain/sync/schema.ts` is empty; `git status --porcelain --untracked-files=all` across those directories plus `src/server/sync/` is empty.
- **No Release-3 catalog entries or contributions** — `exerciseCatalog.ts` holds 94 `slug:` occurrences before and after (1 interface field at line 19 + 93 catalog entries, matching `EXERCISE_CATALOG`'s 93 object literals); the diff adds **zero** new `slug:` or `muscleGroupId:` lines.
- **No derived speed or pace** — `grep -rniE "speed|pace|m/s|km/h"` across `src/domain/measurement/`, `src/ui/workout/`, `src/ui/history/` returns nothing outside the "not displayed in v1" commentary.

**Scope of the change set.** Exactly three source/doc files are touched beyond the review's baseline, each expected and each accounted for: `src/sync/flush.ts` (M-2), `src/ui/workout/AddAdhocExercise.tsx` (H-2), and `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` (the L-5/L-6 owner decisions, §14.3 / §18.1 / new §29). I read that specification diff in full: it is +15/−3, records both decisions verbatim with dates, splits §14.3's table into unreferenced/referenced rows, and adds an I-11 parenthetical explaining why two `volume_counting`-only branches need no invariant amendment. It weakens nothing, reopens no accepted decision, and does not touch any other clause.

**Formatting scope.** The remediation's §4 fix-up ran a scoped `prettier --write` over 53 files. I checked for collateral damage the direct way: **no tracked file in the tree has a whitespace-only diff** (every modified file's `git diff -w --ignore-blank-lines` is non-empty), and the three pre-existing unrelated changes (`CLAUDE.md` +15/−0, `HANDOFF.md` −183, `docs/input/product-ideas.md` +354/−0) are byte-identical to the review's baseline. `format:check` is clean repo-wide. See residual **R-4** on how those 53 files came to fail in the first place.

---

## 6. Residuals

All LOW. None blocks device acceptance; none is a product defect.

| Id | Kind | Residual |
| --- | --- | --- |
| **R-1** | product / specification (inert) | An **unreferenced** Plank still ends `volume_counting = 'auto'` after conversion while a fresh seed gives `'off'` — the exact asymmetry L-6 resolved for the carry, under a rationale that applies identically. Structurally inert (`isProfileEligibleForVolume("duration")` is `false`), disclosed by the remediation, and independently confirmed inert here. §14.3's unreferenced-plank row now reads "same unreferenced predicate as the carry" while the carry row's **target** differs, which will mislead a later reader; one sentence would fix it. (§2.7) |
| **R-2** | report accuracy | The remediation report's §0 and §3 prose say "**thirteen** findings"; the review's §1 table has **fourteen** rows (H-1, H-2, M-1, M-2, M-3, M-4, L-1…L-8), and the remediation's own §5 map correctly lists all fourteen. Prose count only. |
| **R-3** | report accuracy | `release-2-implementation.md` §1.9's totals — "all new files … 16, 3,338 lines" — are now **stale**: the remediated tree holds **24** new source/test files totalling **4,863** lines. The heading was corrected for L-4 but the numbers were not refreshed after the remediation added eight more files. |
| **R-4** | report accuracy | §4 attributes the 53 `format:check` failures to "pre-existing formatting debt on this Windows checkout, not a defect any remediation stage introduced". My review measured `pnpm format:check` **clean repo-wide** at the close of the review pass, hours earlier, so the CRLF drift was introduced during the remediation (consistent with PowerShell's default CRLF writes — a gotcha this repo already documents). Net effect nil: clean now, no whitespace-only diffs, no collateral files. |
| **R-5** | code comment accuracy | `src/ui/workout/refusedSetCount.ts` cites `tests/unit/sync/handleCompleteRefusedCount.test.ts` (the file is under `tests/unit/workout/`), and states the refused sets "are only ever refreshed by `hydrate()`, `adoptRemote()`, and `SyncStatusBanner`'s 5-second poll" — no longer true after its own sibling fix added the `flush.ts` call. |
| **R-6** | test coverage (pre-existing) | A-11b's "server `issues` render as today" sub-clause still has no browser coverage. Not a new gap: the new option gating makes an incompatible submission unreachable through the editor, and the issues-rendering path is unchanged by Release 2. Noted so it is not mistaken for something this remediation dropped. |

---

## 7. What this verification did **not** do

- **A-25 (physical iPhone acceptance)** was not performed and is out of scope for an automated pass: keyboard type per input, ≥ 44 px tap targets, VoiceOver announcement of each accessible name, the stale-service-worker update prompt, and on-device rendering of the `m:ss` label all remain unexecuted on real hardware. Both blockers the review flagged as prerequisites (H-1, H-2) are now fixed, so the two checklist items that previously could not be exercised at all are now reachable.
- **Touch-target measurement** was not attempted; the edit-row control sizing is pre-existing and unchanged by this release, and A-25 owns it.
- **Production** was not contacted in any way. Nothing was committed, pushed, tagged or deployed.
- **The persistent development database** (`gym-app-db-1`) was not connected to, migrated, seeded, read or written at any point; every database command in this pass carried an explicit `DATABASE_URL` override pointing at port 55433.
- **No implementation file, test file or existing report was modified.** The two negative controls that required altered code ran against scratch copies in `.tmp-verify/`, and file-hash comparison confirmed the production originals were never touched.

---

## 8. Cleanup

- Disposable container `gymapp-r2-verify2` (`postgres:16`, port 55433) and all eleven throwaway databases within it (`e2echeck`, `renumconc`, `reconcilecheck`, `probecheck`, `ctrlcheck`, `h2check`, and the six `rc_*` reconcile-state databases): **removed**.
- Repo-local scratch directory `.tmp-verify/` (12 probes, one Playwright config, two scratch module copies, two helpers) and the Playwright `test-results/` output: **deleted**.
- No Playwright, Next or PostgreSQL process left running; ports 3000 and 55433 released.
- `docker ps -a` shows only `gym-app-db-1`, Up and healthy, untouched throughout.
- `git status --porcelain` after this verification is the same 92 entries as before, plus this one new document.

---

## 9. Verdict

Every finding the independent review raised is closed, and the four that carried product risk are closed at the root with evidence I generated myself rather than inherited. H-1 and H-2 — the two paths the binding specification designs and Release 2 had broken — now work end to end in a real browser against real PostgreSQL, for cross-device resume, post-eviction resume, and ad-hoc entry across all five new profiles; remove either fix and the review's exact defect returns. M-2's refusal surfacing is not merely faster but categorically different: 1–2 ms against a 4,898 ms counterfactual, with a completion confirmation that fires deterministically from a stale store. M-1's widest row now measures at budget on both surfaces with the optional duration and `m:ss` present. The seed reconcile converges correctly and idempotently across all six states on real PostgreSQL, including both newly recorded owner decisions. Every previously verified behaviour — the six-profile lifecycle, offline replay, legacy `load_reps` compatibility, O-6, the seed deploy window, and the real-PG renumber race — remains intact, and every protected boundary holds.

The record is now accurate where it was not: the false A-11b coverage claim is replaced by real coverage and a self-limiting description, the false PWA seam statement is replaced by a verified discharge plus an honestly re-targeted open seam, and the remaining record nits are six LOW residuals that change no behaviour and block nothing. The one asymmetry the remediation left open — an unreferenced Plank's `volume_counting` — I assessed on its own terms rather than as owner-approved, and confirmed it structurally inert.

**VERIFIED — READY FOR DEVICE ACCEPTANCE**

Owner-authorized commit, push and deployment must precede the physical iPhone acceptance pass (A-25).
