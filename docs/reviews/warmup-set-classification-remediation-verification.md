# Warm-up Set Classification — Independent Remediation Verification

Date: 2026-09-05
Role: independent verification of `docs/reviews/warmup-set-classification-remediation.md` against the finding it claims to discharge — F-1 / §9 and §3.3 of `docs/reviews/estimated-1rm-load-translation-architecture-review.md` (referred to below as **the original review**, which this verifier authored).
Reviewed state: `main` @ `7d6bc6c` with the remediation's uncommitted working tree.
Method: the remediation report was treated as a claim to falsify, not as evidence. Every assertion was re-derived from the diff, from source, from live DOM measurement, from raw PostgreSQL rows, and from **mutation testing** of the production diff. Nothing was remediated. Every temporary modification was restored byte-identically (§9).

Identifier conventions: **V-n** are this verification's findings. `RH-n`/`F-1`/`§9` refer to the original review.

---

## 1. Verdict

# `VERIFIED`

The F-1 remediation is **correct, complete for its stated scope, and genuinely load-bearing**. Reproduced independently:

- `isWarmup` can be set through the real set-entry UI and edited through the real History UI, and it reaches PostgreSQL correctly — proved by reading `set_logs.is_warmup` directly out of the database after driving the real browser UI (§4.1). Neither the remediation's own e2e (which discards its workouts) nor its integration test (which bypasses the UI) closes that particular link on the workout screen; this verification closes it.
- Warm-up sets are excluded from carry-forward, progression completion/shortfall, and volume, and normal work sets are unaffected (§4.2–§4.4).
- The new test coverage is not decorative: **reverting either half of the production pass-through makes the new e2e suite fail** (§5.2). The suite has teeth.
- The adjusted Warm-up Routines assertions are still properly scoped in behaviour: the report's §5 root-cause diagnosis reproduces exactly, and the replacement locator still detects a genuinely broken checklist collapse (§6).

All suites re-run green on the restored tree: unit 557/557, integration 301/301 (15 pre-existing env-gated skips), Playwright 94/94, typecheck, typecheck:sw, lint clean; `format:check` flags only the pre-existing CRLF file the remediation never touched (§8).

Four findings are recorded. **None blocks acceptance.** Two (V-1, V-2) are residual *silent-misclassification paths the remediation leaves open* rather than defects it introduced; one (V-3) is a latent test-scoping trap that V-2's natural fix would spring; one (V-4) is documentation accuracy in the remediation report itself. §7 also corrects an overstatement in **this verifier's own original review**.

| ID | Severity | Finding |
| --- | --- | --- |
| **V-1** | Medium | The toggle silently resets to off on any remount (reload, PWA relaunch) mid-ramp; the next set becomes a work set — and can implicitly author a write-once Decision that later reclassification cannot undo |
| **V-2** | Medium | No in-session reclassification: `ExerciseCard`'s own `SetRow` edit form cannot flip `isWarmup`, though `EditSetPatch` already accepts it. A set mislogged during the workout is only fixable after completion, via History |
| **V-3** | Low | The Warm-up Routines locator does not select what its comment says. Measured live, `ul.flex.flex-col:not(.gap-3)` selects `ExerciseCard`'s **logged-sets** list. It counts correctly only because that list holds no checkboxes today — which fixing V-2 would change |
| **V-4** | Low | The remediation report's headline "negative control", and two of its §4/§6 claims, are not supported by the evidence cited (the conclusions still hold on other evidence) |

---

## 2. What the original finding required, and whether it is discharged

The original review §9 named the gap as **UI-only** and listed the coverage it needed. Point-by-point:

| §9 requirement | Status | Independent evidence |
| --- | --- | --- |
| UI toggle on the set-entry row | **DISCHARGED** | `ExerciseCard.tsx:198-207`; live DOM, `getByLabel("Warm-up set")` resolves |
| …persists across logs within an exercise until cleared | **DISCHARGED** | Probe: toggle still checked after a log (§4.1). Caveat V-1 |
| …does not survive into the next exercise | **DISCHARGED** | `key={exercise.id}` at `WorkoutExecution.tsx:111` verified; e2e asserts a second card's toggle is off |
| History edit: `onSave` must carry `isWarmup` | **DISCHARGED** | `HistoryDetail.tsx:227-232`; mutation test §5.2 |
| Offline: none needed | **CONFIRMED unchanged** | `LogSetInput.isWarmup?` at `activeSession.ts:436`, `EditSetPatch` at `:551-553`, `setLogFullRowOp` full-row upsert |
| Sync: none needed | **CONFIRMED unchanged** | `SET_LOG_FIELDS` includes `isWarmup` (`sync/service.ts:171`), insert `:803`, patch `:858` |
| Regression (a) flip counts as `relevantEdit`, re-evaluates a pending rec | **DISCHARGED** | `sync/service.ts:708` verified verbatim; integration test reproduces supersede + re-evaluate |
| Regression (b) `carryForward` picks the first **work** set after the flip | **DISCHARGED** | Raw SQL §4.2 + integration test with negative control |
| Regression (c) `repShortfall` counts work sets only | **DISCHARGED** | Integration test with negative control reproducing the review's exact "hold instead of increase" |
| Regression (d) volume drops flagged sets | **DISCHARGED (pre-existing test)** | `volume/aggregate.ts:174`; `volume.integration.test.ts:138` genuinely asserts a `{weightKg: 40, isWarmup: true}` set is excluded — verified by reading the test, not by trusting the report |
| Regression (e) `progressionMatrix` suite still passes | **DISCHARGED** | `tests/unit/progressionMatrix.test.ts` green in the 557/557 run |
| Regression (f) all-warm-up session → `NO_WORK_SETS_LOGGED`, not a crash | **DISCHARGED** | Integration test; `action: "none"`, `decisionStatus: "pending"` |
| Backfill: none; do not retro-classify | **RESPECTED** | No migration, no data touch anywhere in the diff |

The diff is exactly what §9 predicted it would need to be: **two UI files, one control each, one pass-through each.** No schema, sync, server, progression, volume, or Warm-up Routines production code was modified (`git diff --stat` = 3 files, 61 insertions, 5 deletions, one of which is a test).

---

## 3. Structural re-verification of the untouched layers

Re-read in source rather than accepted from the remediation report. Every row confirmed:

| Layer | Verified at | Behaviour |
| --- | --- | --- |
| Progression work-set filter | `server/progression/service.ts:125` | `and(inArray(...), eq(setLogs.isWarmup, false))` — filtered **in SQL**, and `PerformedSet` (`:129`) carries no `isWarmup` field at all, so the boundary is structural, not conventional |
| Volume | `domain/volume/aggregate.ts:174` | `rows.filter((row) => !row.isWarmup)`, filtered in the domain layer by deliberate design comment |
| Carry-forward | `server/today/service.ts:276` | `h.sets.find((s) => !s.isWarmup)` over sets ordered `asc(setNumber)` |
| Implicit decision gate | `sync/activeSession.ts:469-470` | `if (!set.isWarmup && rec && pending)` then `filter((s) => !s.isWarmup).length === 1` |
| Store default | `activeSession.ts:449` | `isWarmup: input.isWarmup ?? false` |
| Edit patch | `activeSession.ts:551-553` | `EditSetPatch` = `Partial<Pick<..., "weightKg" \| "reps" \| "rir" \| "isWarmup" \| "notes">>`; `Object.assign(set, patch)` never touches omitted fields |
| History correction | `sync/corrections.ts:6-12` | `HistorySetCorrectionPatch` already includes `isWarmup` |
| History DTO | `ui/history/types.ts`, `server/history/service.ts:37,185` | `isWarmup` served to the client, so `useState(set.isWarmup)` seeds from a real stored value |

The remediation's §4 correction — that `HistoryDetail` uses `correctHistorySet`/`HistorySetCorrectionPatch`, not the active-session `EditSetPatch` the task brief named — is **accurate**, and the mechanism it wired into is the right one for a completed session.

---

## 4. Independent proof of the required properties

### 4.1 `isWarmup` can be set through the real UI and reaches the database

The remediation's e2e proves the flag through the rendered `W ·` marker, then **discards** the workout; its integration test proves the server path but constructs ops by hand. Neither closes UI → PostgreSQL on the workout screen. A verification probe drove the real browser UI only (checkbox, kg, reps, Log — no test hooks), completed the workout, and the rows were then read straight out of the dev PostgreSQL:

```
 set_number | is_warmup | weight_kg | reps
------------+-----------+-----------+------
          1 | t         |     62.50 |    5     <- toggle checked
          2 | t         |     82.50 |    4     <- toggle still checked, no re-click
          3 | f         |    112.50 |    5     <- toggle unchecked
          4 | f         |    112.50 |    5
          5 | f         |    112.50 |    5
```

Session `01a06eef-1893-7192-87e0-1d6a2428a062`. The toggle's persistence across consecutive logs, its release on uncheck, and the full UI → outbox → sync → SQL path are all confirmed on one real artifact.

### 4.2 Exclusion from carry-forward

On that same real session, the exact quantity `toCarryForwardCandidate` reads:

```
first non-warmup set (what carry-forward uses) : 112.50
first set of any kind (the pre-remediation bug):  62.50
```

The ramp is no longer the carry-forward source. At the algorithm level `buildTodayBundle` was re-run under PGlite: correctly flagged ramp → `prefill.loadKg === 110`; identical ramp unflagged → `60`. Both pass.

**Observation (not a defect):** the live bundle for this exercise returned `prefill.loadKg = 100`, from neither ramp nor work set — a stale `modified` decision (`chosen.loadKg = 100`, decided 2026-08-29) in the dev database heads the chain at `workingTargets.ts:41`, ahead of carry-forward. This is a dev-database artifact, and it is also a live confirmation of the original review's RH-1/RM-11. It corrects one word in the original review's own §9 table — see §7.

### 4.3 Exclusion from progression completion and shortfall

Re-run under PGlite through `applySyncBatch`, on a `load-progression` prescription (`fixed 3×5`) with the ramp `60×5, 80×3, 100×2` before `110×5 ×3`:

| Ramp flagged | Recommendation | Reason code |
| --- | --- | --- |
| `isWarmup: true` | `increase_load`, `derived.setsCompleted 3 / workingLoadKg 110` | `ALL_PRESCRIBED_REPS_COMPLETED` |
| `isWarmup: false` (negative control) | **`hold`** | **`PRESCRIBED_REPS_NOT_COMPLETED`** |

This is the original review's §9 row 2 defect — "silently reverses progression decisions" — reproduced and then shown closed, on the same fixture shape, in one test file.

### 4.4 Exclusion from volume, and work sets unaffected

Volume is not covered by a new test; the remediation defers to an existing one. That deferral was checked rather than trusted: `tests/integration/volume.integration.test.ts:138` logs `[{100}, {100}, {40, isWarmup: true}]` and asserts the warm-up set is excluded from the weekly report. The deferral is legitimate and duplicating it would have added nothing.

Work sets unaffected: `logSet` with no `isWarmup` yields `false` and resolves a pending recommendation exactly as before (unit); the e2e negative control logs `100 kg × 5` with the toggle untouched and asserts `W ·` is absent; the full 94-test Playwright suite — including every offline, replay, dead-letter, takeover, recommendation and volume spec — passes on the remediated tree.

---

## 5. Negative controls

### 5.1 The remediation's own

Three of the four are genuine and well-constructed: the unflagged-ramp → `hold` control (§4.3), the unflagged-ramp → `prefill 60` control (§4.2), and the e2e untouched-toggle control. Each reproduces the pre-remediation defect on the identical fixture, which is what a negative control has to do.

The one the report headlines in §6 as "**Negative control** (explicitly required)" — the unit test that calls `logSet` *without* `isWarmup` — is the weakest of the four: it exercises the store's `?? false` default, which predates this remediation, and it would pass unchanged if the entire UI diff were reverted. See V-4.

### 5.2 This verification's own: mutation testing of the production diff

The decisive question the remediation's report cannot answer about itself is whether its new tests would actually *catch* the change being undone. Each half of the production diff was reverted in isolation, the application rebuilt, and the new e2e suite re-run.

| Mutation | Result |
| --- | --- |
| Drop `isWarmup` from `ExerciseCard`'s `logSet({...})` call, keep the checkbox | **2 of 4 failed** — `W · 60 kg × 5` and `W · 20 kg × 8` not found |
| Restore; set `HistoryDetail`'s `onSave` to send `set.isWarmup` instead of the edited state | **1 of 4 failed** — `W · 100 kg × 5` never appears after Save |

Both halves of the pass-through are load-bearing and both are covered. (A first attempt at this produced a false pass because Playwright's `reuseExistingServer: true` served the previously built bundle; every mutation run reported here rebuilt from source.)

---

## 6. Are the adjusted Warm-up Routines tests still properly scoped?

**Behaviourally, yes.** Two independent checks:

**Root cause is real, not a cover story.** Restoring the three original unscoped `page.getByRole("checkbox")` assertions on the remediated application reproduces the report's §5 failure exactly — same two tests, same message:

```
1) warmupWorkout.spec.ts:345 › skip collapses the card to one reversible row
2) warmupWorkout.spec.ts:370 › the card auto-collapses when every item is checked
   Locator:  getByRole('checkbox')
   Expected: 0
   Received: 1
```

The single extra checkbox is the new unconditional `ExerciseCard` control, exactly as diagnosed. This is a test-specificity defect, not a Warm-up Routines behaviour regression — confirmed, since the feature's own assertions (`"Warm-up skipped"`, the `N/3` counter, `Show`/`Hide warm-up`) pass throughout.

**The replacement still has teeth.** `WarmupCard.tsx`'s `{expanded && (` was temporarily mutated to `{(expanded || true) && (`, breaking auto-collapse while leaving everything else intact. The scoped assertion caught it:

```
warmupWorkout.spec.ts:370 › the card auto-collapses when every item is checked
   Locator:  locator('ul.flex.flex-col:not(.gap-3) input[type=\'checkbox\']')
   Expected: 0
   Received: 3
```

It found exactly 3 — the checklist's own items, excluding the new control. Both required properties hold: it still counts what it must, and it no longer counts what it must not.

The untouched `.nth(index)` usages were also checked rather than accepted. `WorkoutExecution.tsx:106` renders `<WarmupCardForSession>` immediately before the exercises `<ul>` at `:108`, so positional indexing into page-wide checkboxes still lands on checklist items. The claim holds — but it is now an undocumented DOM-order dependency in 9 further assertions, which is the shape of V-3.

**Structurally, the locator is not what its comment says** — see V-3.

---

## 7. Findings

### V-1 — Medium — The toggle silently resets on remount, mid-ramp

`useState(false)` is component-local. `ExerciseCard` is keyed by `exercise.id`, which the report correctly notes prevents leakage *between* exercises — but the same property means any remount of the same exercise resets the toggle to off. Measured on the real UI:

```
after 1st warm-up log, toggle: true
after RELOAD mid-ramp,  toggle: false
rendered set rows: ["W · 50 kg × 5", "70 kg × 5"]
```

The athlete continues the ramp; the next set is silently recorded as a **work set**. On an installed PWA on a phone — the target platform — a relaunch mid-warm-up is ordinary, not exotic.

The consequence is not merely a mistagged row. That 70 kg set is now the *first* non-warm-up set, so `activeSession.ts:469-470` fires `resolveImplicitDecision` and enqueues a `recommendationDecision` with `chosen.loadKg = 70`. Decisions are **write-once server-side** (`sync/service.ts:1042-1085`) — a fact the remediation's own integration test "never rewrites an already-decided recommendation" confirms from the other direction. Reclassifying the set afterwards in History therefore **cannot** undo the decision, and that decision heads the next session's prefill chain (`workingTargets.ts:41`).

This is not a regression — before the remediation *every* ramp set was a work set — and it does not contradict any test that was run. It is a residual instance of exactly the defect class F-1 exists to close, and it is not mentioned in the remediation report; §4's "it stays on until the athlete explicitly turns it off" is true only within one continuous mount.

Cheapest fixes, in increasing order of cost: persist the toggle on the active-session aggregate (there is precedent — `freezeWarmupState` at `activeSession.ts:296`); or derive the default from the last logged set's `isWarmup`; or close V-2 so the mistake is repairable in place. This is an owner decision, not a defect to fix silently.

### V-2 — Medium — A set mislogged in-session cannot be reclassified until after completion

`ExerciseCard`'s own `SetRow` edit form (`ExerciseCard.tsx:281-360`) is untouched, and its `onEdit` prop type is narrowed to `{ weightKg?, reps?, rir? }` at `:289` — even though the store's `EditSetPatch` already accepts `isWarmup`, and the remediation's own unit test proves `editSet(exerciseId, setId, { isWarmup: true })` works correctly today. The gap is one field in a prop type plus one checkbox.

The remediation is right that this is outside the original review's literal wording (§9 named "set-entry" and "history-edit"). But the review's framing — "one checkbox in each of two components" — assumed set entry was the only in-workout affordance needed, which V-1 shows it is not. Recommend deciding V-1 and V-2 together.

### V-3 — Low — The Warm-up Routines locator does not select what its comment claims

`warmupWorkout.spec.ts:179` is documented as "Scoped here to the checklist's own `<ul>` (WarmupCard.tsx: 'flex flex-col', never 'gap-3'…)". Measured in the live DOM of `/today/workout` with one set logged and no routine linked, `ul.flex.flex-col:not(.gap-3)` matched:

```json
{ "matchedUls": [ { "class": "flex flex-col gap-1",
                    "checkboxesInside": 0,
                    "firstChildText": "90 kg × 5EditDelete" } ],
  "totalCheckboxesOnPage": 1 }
```

It selected `ExerciseCard`'s **logged-sets list**, not the checklist. The selector is in fact "every flex-col `ul` on the page except the exercises list", which today also matches `AddAdhocExercise.tsx:75`'s results list. The assertions are correct only because neither of those lists contains a checkbox — an accident of current markup, not a property of the selector.

The trigger is concrete and near: adding a "Warm-up set" checkbox to `SetRow` (the natural fix for V-2) puts a checkbox inside `ul.flex.flex-col.gap-1`, silently re-breaking the same two absolute-count assertions the remediation just repaired. A `data-testid` on the checklist `<ul>`, or `section > ul.flex.flex-col`, would make the scoping match its own comment. The nine surviving `.nth(index)` usages carry the same latent dependency on DOM order and are worth a note in the same place.

### V-4 — Low — Three claims in the remediation report are not supported by the evidence cited

The conclusions survive; the cited evidence does not.

1. **§6's headline "Negative control"** — the unit test that omits `isWarmup` — is described as proving "the new UI pass-through is load-bearing, not decorative". It cannot: it never renders the UI, and it passes unchanged with the entire production diff reverted. The claim is nonetheless **true**, established by mutation testing (§5.2) and by the report's own e2e; the wrong test is cited for it.
2. **§4's** "it stays on until the athlete turns it off themselves" is false across a remount (V-1).
3. **§6's outcome 11**, "Reloaded history/workout UI show the marker correctly", claims reload coverage on both screens. `warmupSetClassification.spec.ts` reloads only on the History screen. The workout-screen half is true — an independent probe confirmed `W · 50 kg × 5` survives a reload — but it is not asserted by any test.

### Correction to this verifier's own original review

The original review's §9 table states carry-forward "**Prefills the lightest ramp set, always**". "Always" is too strong, and §3.1 of the same document contradicts it: the prefill chain is decision `chosen.loadKg` → first work-set load → `baselineLoadKg`, so carry-forward governs only when no `accepted`/`modified` decision exists for that exercise. This was observed live in §4.2. The severity of F-1 is unchanged — the decision layer is itself downstream of first-work-set misclassification via the implicit-decision path — but the row should read "whenever no decision heads the chain", not "always".

---

## 8. Verification runs

All on the restored, byte-identical tree unless stated.

| Check | Result |
| --- | --- |
| `pnpm test:unit` | **557/557 passed**, 43 files |
| `pnpm test:integration` | **301/301 passed**, 15 skipped, 22 run + 4 skipped files |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | one warning, `src/server/sync/service.ts` — **pre-existing**, absent from `git status`, not touched by the remediation (known CRLF-checkout quirk) |
| `npx playwright test` (all 30 specs) | **94/94 passed** — 91 in the first pass, plus `muscleTaxonomyV2.spec.ts` ×2 and `volume.spec.ts` ×1 which need `DATABASE_URL` in the *runner's* environment and pass once it is exported. Not a remediation defect; the remediation's own run exported it for its disposable database |
| Targeted: `warmupSetClassification.spec.ts` + `warmupWorkout.spec.ts` | 18/18 passed |

Every count the remediation report claims in its §7 reproduces exactly.

**Environment:** the repository's own local Docker PostgreSQL 16 (`gym-app-db-1`, `localhost:5432`), a production build (`pnpm build && pnpm start`), Chromium. Production was never accessed. No disposable container was created; the persistent dev database was used per `CLAUDE.md`'s local-verification rule.

---

## 9. Cleanup and working-tree state

Four files were temporarily mutated for §5.2 and §6 and restored from byte copies. SHA-256 before and after:

| File | Hash (identical before and after) |
| --- | --- |
| `src/ui/workout/ExerciseCard.tsx` | `037C2673…44FF` |
| `src/ui/history/HistoryDetail.tsx` | `688E856E…8C76` |
| `src/ui/workout/WarmupCard.tsx` | `6C7E22AC…1554` |
| `tests/e2e/warmupWorkout.spec.ts` | `634A5690…F4FE` |

`git diff --stat -- src/ tests/` is again exactly `3 files changed, 61 insertions(+), 5 deletions(-)`. The three new test files are unmodified (hashes unchanged). Every unrelated and concurrent working-tree change was left untouched, including two files that appeared during this session from concurrent work (`docs/reviews/estimated-1rm-load-translation-architecture-revision.md`, `docs/reviews/repository-agent-workflow-review.md`) and the user-owned `CLAUDE.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`.

All verification scripts were written to the session scratchpad, never to the repository. No background server process remains. Nothing was committed, pushed, or deployed.

**Disclosed side effects on the dev database.** Running the Playwright suite and the UI probes created workout sessions in the local dev PostgreSQL, as every e2e run against it does by design (the specs' own comments note it "accumulates sessions across every spec run"). Probe sessions were discarded where possible; **one was deliberately completed** to read its rows — `01a06eef-1893-7192-87e0-1d6a2428a062`, five `Barbell Back Squat` sets, the §4.1 evidence. It is safe to leave and safe to delete. Production was never touched.

---

## 10. Recommendation

**Accept the remediation.** It closes F-1 as scoped, its production diff is minimal and correct, its tests fail when the diff is undone, and it leaves every neighbouring layer and the Warm-up Routines feature intact.

Before or shortly after ship, resolve **V-1** and **V-2** together as one small follow-up — they are the same silent-misclassification path from two directions — and take **V-3** with them, since V-2's fix is what springs that trap. **V-4** is a documentation edit.

The original review's §9 recommendation that this ship as its own remediation, before and separate from any e1RM work, is confirmed by the result: the change is two UI files, and the defects it closes (carry-forward prefill, progression reversal, volume double-counting) are entirely outside the e1RM feature.

The one item still genuinely open is the original review's §9 note on physical hardware: the remediation report's §9 is candid that no iPhone pass was run, and Playwright's 390×844 Chromium emulation confirms layout and visibility but not tap ergonomics or VoiceOver. Given V-1, an on-device pass is worth more than usual — logging a real ramp with a backgrounded app is exactly the path V-1 describes.

---

`VERIFIED` — with V-1 and V-2 recommended as a follow-up, and no blocking defect.
