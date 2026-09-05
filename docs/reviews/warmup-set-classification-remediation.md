# Warm-up Set Classification — Remediation Report

Date: 2026-09-05
Authoritative finding: `docs/reviews/estimated-1rm-load-translation-architecture-review.md` §9 / F-1 ("Assessment of F-1 (warm-up-set prerequisite)" and §3.3's verified-support table).
Scope: a focused correctness remediation. No redesign of any already-built layer.

---

## 1. Verdict

**READY FOR TARGETED VERIFICATION**

Every layer the review's F-1 finding identified as already supporting `isWarmup` (schema, sync wire contract, server write path, client store log/edit, display) was inspected and confirmed unchanged and already correct. The only real gap — no UI control ever set `isWarmup` — is closed with two small, additive UI changes. One genuine cross-feature regression was found during verification (not anticipated by the review) and fixed under the task's "unless an actual integration defect is demonstrated" clause; the fix was to a pre-existing **test's** overly-broad locator, not to any Warm-up Routines production code.

---

## 2. Exact changed files

Production code (2 files):

| File | Change |
| --- | --- |
| `src/ui/workout/ExerciseCard.tsx` | Added `isWarmup` component state (defaults `false`), a "Warm-up set" checkbox above the kg/reps/RIR/Log row, and threaded `isWarmup` into the existing `logSet({...})` call. No reset of the toggle after a successful log. |
| `src/ui/history/HistoryDetail.tsx` | Added `isWarmup` edit-state to `HistorySetRow` (seeded from `set.isWarmup`), a "Warm-up set" checkbox in the row's existing edit-mode form, and threaded `isWarmup` into the existing `onSave({...})` call (which flows straight through `correctHistorySet`/`HistorySetCorrectionPatch`, already `isWarmup`-aware). |

Test-only change, discovered necessary during full-suite verification (1 file):

| File | Change | Why |
| --- | --- | --- |
| `tests/e2e/warmupWorkout.spec.ts` | Added a `warmupChecklistCheckboxes(page)` helper scoped to the warm-up-routines checklist's own `<ul>` (`ul.flex.flex-col:not(.gap-3)`, which never matches the exercises list's `ul.flex.flex-col.gap-3`), and used it in place of `page.getByRole("checkbox")` for the three **absolute-count** assertions (`.toHaveCount(0)` ×2, `.toHaveCount(3)` ×1) that this spec makes. All `.nth(index)` usages in the same file were left untouched — they remain correct because the routines checklist always renders before the exercises list in DOM order. | See §5. |

New test files (3 files):

| File | Layer |
| --- | --- |
| `tests/unit/warmupSetClassification.test.ts` | Vitest unit, real `activeSession.ts` mutators + fake-indexeddb |
| `tests/integration/warmupSetClassification.integration.test.ts` | Vitest integration, real SQL via PGlite, through `applySyncBatch` |
| `tests/e2e/warmupSetClassification.spec.ts` | Playwright, real browser + real Postgres + production build |

Nothing else was touched. No database schema, migration, sync schema, entity type, server sync semantics, progression algorithm, volume algorithm, recommendation-decision semantics, Warm-up Routines *feature* code, e1RM evaluation document, or product backlog file was modified.

---

## 3. Confirmed existing support at every untouched layer

Re-verified in the actual repository (not assumed from the review) before any code was changed:

| Layer | File : lines | Confirmed behavior |
| --- | --- | --- |
| Column | `src/db/schema/setLogs.ts:35` | `is_warmup boolean not null default false` |
| Wire payload | `src/domain/sync/schema.ts:104` | `isWarmup: z.boolean().optional()` on `setLogUpsertPayloadSchema`, and on `HistorySetCorrectionPatch` (`src/sync/corrections.ts:6-12`) |
| Server write | `src/server/sync/service.ts:171,708,803,858` | `isWarmup` is in `SET_LOG_FIELDS` (writable), the insert path, the patch-building path, and the "relevant edit" predicate that gates recommendation reevaluation |
| Client store — log | `src/sync/activeSession.ts:431-499` | `LogSetInput.isWarmup?: boolean`; `logSet` already defaults it (`input.isWarmup ?? false`) and already gates the implicit-decision block on `!set.isWarmup` |
| Client store — edit | `src/sync/activeSession.ts:551-580` | `EditSetPatch` already includes `isWarmup`; `editSet` is `Object.assign(set, patch)` — omitted fields are never touched |
| History correction | `src/sync/corrections.ts:6-33` | `HistorySetCorrectionPatch`/`correctHistorySet` already include/accept `isWarmup`, as a genuinely partial payload |
| Read/display | `ExerciseCard.tsx` (`SetRow`), `HistoryDetail.tsx` (`HistorySetRow`) | Both already render the `"W · "` prefix from `set.isWarmup` |
| Progression — work-set filtering | `src/server/progression/service.ts:125` | `getWorkSetsByExercise` already filters `eq(setLogs.isWarmup, false)` in SQL, for both the current session and every history entry |
| Progression — completion/shortfall | `src/domain/progression/loadProgression.ts:28-41,67,88-90`, `repProgression.ts` | Already operate on `ctx.performance.workSets`, which is pre-filtered upstream; `PerformedSet` carries no `isWarmup` field at all, structurally enforcing the boundary |
| Progression — zero-work-sets | `reasonCodes.ts:9`, `loadProgression.ts:88-90`, `repProgression.ts:66-68` | `NO_WORK_SETS_LOGGED` already declared and already emitted whenever `workSets.length === 0`; already survives `evaluateSession`'s persist filter |
| Volume | `src/domain/volume/aggregate.ts:174` | `aggregateVolume` already does `rows.filter((row) => !row.isWarmup)` — already covered by an **existing** integration test (`tests/integration/volume.integration.test.ts`, "counts templated and ad-hoc work sets identically, excludes warmups...") that this remediation did not need to touch or duplicate |
| Carry-forward | `src/server/today/service.ts:276`, `src/domain/progression/carryForward.ts:20-33` | `toCarryForwardCandidate` already takes `h.sets.find((s) => !s.isWarmup)`; `resolveCarryForwardLoadKg` is a pure function over pre-resolved candidates |
| Reevaluation on reclassification | `src/server/sync/service.ts:702-713,892-896` | `setLogUpdateChangesEvaluationInputs` already treats `isWarmup` as a relevant-edit field; `reevaluateForSourceSessionExercise` already gates strictly on an existing **pending** rec sourced from that exact session-exercise |

None of the above required a code change. This remediation's production diff is exactly the two UI files in §2.

---

## 4. UI state semantics

**Set entry (`ExerciseCard.tsx`):**
- `const [isWarmup, setIsWarmup] = useState(false)` — a plain component-local boolean, no new persisted or sync field.
- `ExerciseCard` is rendered `key={exercise.id}` by its parent (`WorkoutExecution.tsx:111`), so a different exercise is a different mounted instance with fresh `useState` — the toggle cannot leak across exercises without any extra reset logic.
- The toggle is **not** cleared after a successful log (unlike `rir`, which is) — a warm-up ramp is consecutive sets, so it stays on until the athlete explicitly turns it off.
- No inference from weight, set order, prescription, or history — it is a pure user-driven checkbox.

**History editing (`HistoryDetail.tsx`):**
- `const [isWarmup, setIsWarmup] = useState(set.isWarmup)` inside `HistorySetRow`, which itself is `key={set.id}` — edit mode always seeds from the actual stored value, never a default or a fabricated guess.
- The Save handler always sends `isWarmup` alongside `weightKg`/`reps`/`rir` in one object, matching this row's pre-existing all-fields-together Save convention (it was never a true partial patch from the UI's perspective, even though the underlying type is `Partial<...>`).
- Flipping it in either direction is a single checkbox toggle; nothing else about the row's editing behavior changed.

**Correction on the actual "History editor" mechanism used by `HistoryDetail.tsx`:** the task's brief says "pass it through the existing `EditSetPatch`." Repository inspection (per the "inspect before changing" requirement) found that `EditSetPatch`/`editSet` (`src/sync/activeSession.ts`) is the **active in-progress session's** inline edit mechanism (`ExerciseCard.tsx`'s own `SetRow`, left untouched — it is not part of the review's identified "History-edit UI" gap and is out of this remediation's stated scope), while the History screen (`HistoryDetail.tsx`) uses a separate, structurally identical mechanism: `HistorySetCorrectionPatch`/`correctHistorySet` (`src/sync/corrections.ts`), which already included `isWarmup` and is what `HistoryDetail.tsx`'s edit form was actually wired to. This remediation wires the new checkbox through the sync path that screen actually uses; both mechanisms already supported `isWarmup` before this change, so no sync-layer code needed touching either way.

---

## 5. The one integration defect found, and its fix

Full-suite verification against a disposable database (§8) surfaced two failures in the pre-existing `tests/e2e/warmupWorkout.spec.ts` (Warm-up **Routines** feature — a different, unrelated concept from per-set `isWarmup`, as that file's own comments are careful to say):

```
Locator:  getByRole('checkbox')
Expected: 0
Received: 1
```

Root cause: two assertions in that spec used an unscoped `page.getByRole("checkbox")` across the **whole page** as a proxy for "the warm-up routines checklist is fully collapsed." Before this remediation, the routines checklist's own items were the only checkboxes ExerciseCard's page ever rendered, so the proxy held. This remediation adds a second, legitimate, unrelated checkbox (the new "Warm-up set" toggle) that renders unconditionally in every `ExerciseCard`, on the same `/today/workout` page — so "0 checkboxes anywhere" stopped being true the moment any exercise card was on screen, regardless of the routines card's own state.

This is a test-specificity defect, not a Warm-up Routines behavior regression — the feature's actual behavior (checklist collapses on skip / on completion, is recoverable, etc.) is unaffected and is still verified by the same tests' other assertions (`"Warm-up skipped"` text, the `N/3` counter text, `"Show warm-up"`/`"Hide warm-up"` button state). Per the task's "unless an actual integration defect is demonstrated" clause, the fix was made to the **test file only**: a `warmupChecklistCheckboxes(page)` locator scoped to the checklist's own `<ul>` (`ul.flex.flex-col:not(.gap-3)`, which structurally excludes the exercises list's `ul.flex.flex-col.gap-3`), used in the three absolute-count assertions that broke. No Warm-up Routines production file was touched. Re-run confirmed both tests pass (§8).

---

## 6. Regression and negative-control evidence, mapped to the 12 required outcomes

| # | Required outcome | Proved by |
| --- | --- | --- |
| 1 | 60×5 warm-up, 80×5 warm-up, 110×5 work logs correct flags | Unit: `warmupSetClassification.test.ts` → "60kg/80kg warm-up ramp then a 110kg work set..." (asserts the exact 3-set flag sequence). Integration: same shape through the real server path with real completion. |
| 2 | Toggle persists within an exercise, resets for another exercise | e2e: `warmupSetClassification.spec.ts` → "stays on across consecutive logs within one exercise, and resets for another exercise" (two real `ExerciseCard` instances on one page, via an ad-hoc-added second exercise) |
| 3 | Pending recs stay pending through warm-ups, resolve only from the first work set | Unit: "any number of warm-up sets never counts toward 'first work set'..." (4 warm-up sets logged, rec still pending; first work set resolves it; a second work set does not re-trigger it) |
| 4 | Carry-forward chooses the first work-set load, never the ramp load | Integration: "prefills from the work set once the ramp is correctly flagged" (`buildTodayBundle` → `prefill.loadKg === 110`, not 60), with a negative control proving the pre-remediation defect (unflagged ramp → prefill 60) |
| 5 | Progression completion/shortfall use work sets only | Integration: "a 3-set ramp correctly flagged... is excluded from completion: shortfall 0, increase_load", with a negative control (identical ramp, `isWarmup:false`) reproducing the review's exact "hold instead of increase" defect |
| 6 | Weekly volume excludes warm-up sets | Already covered by the **existing** `tests/integration/volume.integration.test.ts` test (unmodified) — confirmed re-passing; not duplicated |
| 7 | All-warm-up session completes safely, no progression rec (`NO_WORK_SETS_LOGGED`) | Integration: "produces a NO_WORK_SETS_LOGGED / action:none recommendation, no crash" |
| 8 | History editing preserves the existing value, flips either direction | Unit: "flips isWarmup on an already-logged set without touching weightKg/reps/rir" (via `editSet`, the sibling in-session mechanism). e2e: "exposes and can flip the stored value in either direction, persisting across reload" (the actual History screen, both directions, across a real reload) |
| 9 | Reclassification updates carry-forward/volume/pending recs correctly; never rewrites decided ones | Integration: "flipping isWarmup on a source-session set while the rec is pending supersedes and re-evaluates" AND "never rewrites an already-decided recommendation, even when an unrelated set... is reclassified afterward" |
| 10 | Offline logging/editing/replay preserve `isWarmup`, no new entity/field | Unit: "logSet's op payload carries isWarmup..." and "editSet's op payload carries a flipped isWarmup as a full-row upsert..." — both assert the outbox holds exactly one `setLog` op, no new entity kind |
| 11 | Reloaded history/workout UI show the marker correctly | e2e: `"W · 60 kg × 5"` etc. asserted after every log/edit across page reloads, in both the workout screen and the history screen |
| 12 | Normal work-set logging unchanged when the toggle is never used | Unit: "defaults isWarmup to false and behaves exactly as before this remediation". e2e: "negative control: work-set logging is unchanged when the toggle is never touched" |

**Negative control** (explicitly required): Unit test "negative control: omitting isWarmup on a set intended as a warm-up defaults it to a work set and resolves the recommendation early" calls `logSet` **without** `isWarmup`, and asserts the set is misclassified as a work set and the pending recommendation resolves prematurely — i.e., proves the new UI pass-through is load-bearing, not decorative.

---

## 7. Test run results

**Targeted (new files only):**
- `tests/unit/warmupSetClassification.test.ts` — 8/8 passed
- `tests/integration/warmupSetClassification.integration.test.ts` — 7/7 passed (real SQL via PGlite)
- `tests/e2e/warmupSetClassification.spec.ts` — 4/4 passed (real browser, real Postgres, production build)

**Full suites:**
- `pnpm test:unit` — **557/557 passed**, 43 files, no regressions
- `pnpm test:integration` — **301/301 passed**, 15 skipped (pre-existing, env-var-gated concurrency suites — `reconcileContributionsConcurrency`, `recoveryConcurrency`, `volumeLandmarksConcurrency`, `warmupAssociationConcurrency` — unrelated to this change, skipped by design absent `CONCURRENCY_DATABASE_URL`), 26 files (22 run + 4 fully skipped)
- `pnpm typecheck` — clean
- `pnpm typecheck:sw` — clean
- `pnpm lint` (`eslint .`) — clean
- `pnpm format:check` (`prettier --check .`) — clean for every file this remediation touched or added; one pre-existing, unrelated warning on `src/server/sync/service.ts` (a known CRLF-checkout quirk on a file this remediation did not modify — absent from `git status`, confirmed pre-existing)
- **Full Playwright suite against a fresh disposable PostgreSQL 16 database and a production build** — **94/94 passed** (first run: 92/94, 2 failures in `warmupWorkout.spec.ts` diagnosed and fixed per §5; re-run after the fix: 94/94, exit code 0)

---

## 8. Clean-database verification

A disposable PostgreSQL 16 container (`postgres:16`, port 5555, isolated from the persistent dev DB on 5432) was created for this run only:

1. `docker run -d --name gym-app-e2e-disposable -p 5555:5432 ... postgres:16`
2. `pnpm db:migrate` against it (fresh schema)
3. `pnpm db:seed` (muscle groups, volume presets)
4. Production build (`pnpm build`) + `pnpm start` against `DATABASE_URL=postgres://gymapp:gymapp@localhost:5555/gymapp`
5. Account bootstrapped via the real app (`playwright test tests/e2e/smoke.spec.ts`), matching this repo's own CI recipe for a from-scratch database (`.github/workflows/ci.yml`'s `offline-e2e` job) — `tests/e2e/seed.ts` cannot create the account directly (`setupAccount` needs a real Next.js request scope for `cookies()`), a pre-existing, unrelated constraint
6. `pnpm db:seed` again (imports the new account's exercise catalog) + `pnpm tsx tests/e2e/seed.ts` (Phase 3 program/template/block fixture)
7. Full `npx playwright test` (all 30 spec files, 94 tests) — see §7 for the two-pass result

All disposable resources were removed afterward:
- Production server process killed
- `docker stop gym-app-e2e-disposable && docker rm gym-app-e2e-disposable` — confirmed removed (`docker ps -a` shows no such container)
- The stray `.e2e-disposable-server.log` this run wrote to the repo root was deleted
- The persistent dev Postgres on port 5432 (`gym-app-db-1`) was never touched by any step above

---

## 9. Unexecuted physical-device checks

Not run, and explicitly out of scope for this session:

- No physical iPhone (or any physical device) touch-target/ergonomics check of the new "Warm-up set" checkbox. Coverage instead comes from Playwright's Chromium emulation at a 390×844 (iPhone 12-15) viewport (`warmupSetClassification.spec.ts`'s "no horizontal overflow, and rapid set entry stays unobstructed by the added control" test), which confirms layout (no horizontal overflow, both before and after a rapid toggle-on/log×3/toggle-off/log sequence) and element visibility, but cannot confirm real-hardware tap ergonomics, VoiceOver behavior, or on-device rendering quirks.
- No cross-browser check beyond Chromium (this repo's Playwright config runs Chromium only, matching its existing convention — not a gap introduced by this remediation).

Recommend a brief on-device pass (log a real warm-up ramp on an iPhone, edit a historical set's classification from History) before or shortly after this ships, per this repo's established pattern of device acceptance for UI-facing changes.

---

## 10. Final working-tree state

```
 M CLAUDE.md                                                          (pre-existing, untouched by this session)
 D HANDOFF.md                                                         (pre-existing, untouched by this session)
 M docs/input/product-ideas.md                                        (pre-existing, untouched by this session)
 M src/ui/history/HistoryDetail.tsx                                   (this remediation)
 M src/ui/workout/ExerciseCard.tsx                                    (this remediation)
 M tests/e2e/warmupWorkout.spec.ts                                    (this remediation, see §5)
?? .claude/skills/                                                    (pre-existing, untouched)
?? HANDOFF(depracted).md                                              (pre-existing, untouched)
?? docs/reviews/estimated-1rm-evidence-research.md                    (pre-existing/concurrent, untouched — not created by this session)
?? docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md   (pre-existing, untouched)
?? docs/reviews/estimated-1rm-load-translation-architecture-review.md      (pre-existing, untouched — the authoritative finding)
?? docs/reviews/repository-agent-workflow-evaluation.md               (pre-existing/concurrent, untouched — not created by this session)
?? docs/reviews/warmup-routines-evidence-research.md                  (pre-existing, untouched)
?? docs/reviews/warmup-set-classification-remediation.md              (this file)
?? gpt-handoff.md                                                     (pre-existing, untouched)
?? gpt-memory.md                                                      (pre-existing, untouched)
?? tests/e2e/warmupSetClassification.spec.ts                          (this remediation)
?? tests/integration/warmupSetClassification.integration.test.ts      (this remediation)
?? tests/unit/warmupSetClassification.test.ts                         (this remediation)
```

Nothing was committed, pushed, tagged, or deployed. Production was never accessed. All disposable resources (container, background server process, stray log file) were removed. Every unrelated pre-existing working-tree change was left exactly as found.

---

## 11. Boundaries respected

Not changed, per the task's explicit boundaries — confirmed by `git status` and by the diffs in §2:
database schemas/migrations · sync schemas/entity types · server sync semantics · progression algorithms · volume algorithms · recommendation-decision semantics · Warm-up Routines (feature code) · e1RM evaluation documents · product backlog · user-owned handoff/memory/CLAUDE/skill files.

---

**READY FOR TARGETED VERIFICATION**

---

## 12. Follow-up addendum (2026-09-05) — V-1 through V-4

The independent verification (`docs/reviews/warmup-set-classification-remediation-verification.md`, verdict `VERIFIED`) confirmed this remediation's diff was correct, complete for its stated scope, and genuinely load-bearing, and recorded four non-blocking findings. This addendum records what was done about each. It **appends** to this report; nothing above this section was edited, including counts and claims that are superseded below — see the corrections instead of altering them in place.

### V-4 — accuracy corrections to this report (addressed first, since the other three reference it)

The verification's §7 V-4 is accepted in full. Three corrections:

1. **§6's headline "Negative control"** (the unit test that calls `logSet` without `isWarmup`) does not, by itself, prove the UI pass-through is load-bearing — it exercises the store's pre-existing `?? false` default and passes unchanged even with the entire production diff reverted. The claim itself is true, but the citation was wrong. The correct evidence is the verification's own mutation testing (§5.2 there): reverting `ExerciseCard`'s `isWarmup` pass-through fails 2 of 4 e2e **tests**, and reverting `HistoryDetail`'s fails 1 of 4 **tests** — both halves of the diff are independently caught by the new e2e suite. That unit test remains valid coverage of outcome 12 (unchanged default behavior); it was simply cited for the wrong claim.
2. **§4's** "it stays on until the athlete explicitly turns it off themselves" was **false** across a remount (reload, PWA relaunch) — this was V-1, and it is fixed below. **Correction (W-2, second verification):** the fix derives from the *last logged set*, so it only survives a remount once the athlete has already logged at least one set at that classification. A checked-but-unlogged toggle is persisted nowhere: if the athlete checks the box, the app is reloaded before they press Log, the toggle comes back unchecked and the next set is silently recorded as work. Measured on the shipped code: toggle checked with zero sets logged → `true` before reload, `false` after; toggle checked after a work set but before the next Log → same. This window is much narrower than the original V-1 defect (it requires a remount to land in the gap between checking the box and pressing Log, not merely mid-ramp) and no already-logged data is at risk, so it does not warrant reopening the fix — but "the sentence is now accurate" overstated it. The accurate statement is: **it now survives a remount whenever the athlete has already logged at least one set at that classification.**
3. **§6's outcome 11** claimed reload coverage on both the workout screen and the History screen; only History was actually reloaded and asserted by a test. The workout-screen half was true (independently confirmed by the verifier probing the live UI) but unasserted. It is now asserted — see V-1's new test below, which reloads `/today/workout` mid-ramp and checks the `W ·` marker and the toggle state.

### V-1 — the toggle now survives a remount, by deriving from the last logged set

**Change:** `src/ui/workout/ExerciseCard.tsx` — `useState(false)` → `useState(() => deriveWarmupToggleDefault(exercise))`, where `deriveWarmupToggleDefault` reads `exercise.sets.at(-1)?.isWarmup ?? false`. No new persisted field, no sync-contract change — the derivation reads data that was already synced and already rendered (the same `exercise.sets` the "W ·" marker itself reads). A fresh exercise (no sets yet) still starts at `false`; a genuinely different exercise still starts at `false` (unaffected, since `ExerciseCard` is keyed by `exercise.id`).

**Regression coverage:** `tests/e2e/warmupSetClassification.spec.ts`, new `describe` "warm-up set toggle — remount/reload continuity (V-1)": logs a warm-up set, reloads, asserts the toggle is still checked (this assertion fails on the pre-fix code), logs another warm-up set with no re-click, then — as a **negative control** — unchecks, logs a work set, reloads, and asserts the toggle is correctly *unchecked* (ruling out a lazy "always true after reload" fix that would satisfy the first assertion for the wrong reason), then logs another set with no click and confirms it is a work set. Closes with an ad-hoc second exercise to confirm the derivation is still per-exercise, not leaked, after a reload.

### V-2 — in-session reclassification through `SetRow`'s own edit form

**Change:** `src/ui/workout/ExerciseCard.tsx` — `SetRow`'s `onEdit` patch type gained `isWarmup?: boolean`; its edit-mode form gained a "Warm-up set" checkbox, seeded from `set.isWarmup` and included in the `onEdit({...})` call. Placed **after** the weight/reps/RIR inputs and the Save/Cancel buttons in DOM order, not before — this row's inputs carry no aria-labels and are addressed positionally by index in three specs, not the one originally named here (**W-3, second verification**): `tests/e2e/offline-set-edit-delete.spec.ts` (`row.locator("input").nth(0)`/`.nth(1)`), `tests/e2e/reconnect-batch-idempotence.spec.ts:83` (`editing.locator("input").nth(0)`), and `tests/e2e/transient-failure-fifo.spec.ts:75` (`row.locator("input").nth(0)`). Inserting the checkbox earlier would have silently shifted all three. Re-run confirms all three specs are unaffected (§ Verification runs, below).

**Regression coverage:** new `describe` "warm-up set — in-session reclassification (V-2)" in the same e2e file: logs a work set, flips it to warm-up through `SetRow`'s own editor (not History), confirms the marker; then, as a **negative control**, edits *only* the weight on that now-warm-up set and confirms `isWarmup` is not fabricated back to `false`; then flips it back to work and confirms the marker clears. All three edits go through the active-session screen exclusively — History is never visited in this test.

### V-3 — a real semantic locator for the Warm-up Routines checklist

**Change:** `src/ui/workout/WarmupCard.tsx` — added `data-testid="warmup-checklist"` to the checklist `<ul>`. `tests/e2e/warmupWorkout.spec.ts`'s `warmupChecklistCheckboxes(page)` helper now returns `page.getByTestId("warmup-checklist").getByRole("checkbox")` instead of the CSS-coincidence selector this report's §5 introduced (`ul.flex.flex-col:not(.gap-3)`), which the verification's §7 V-3 measured as actually selecting `ExerciseCard`'s own logged-sets list, correct only because that list held no checkbox at the time — a coincidence V-2's own change (above) would have sprung, exactly as V-3 predicted. Every remaining `page.getByRole("checkbox")` occurrence in that spec (the nine `.nth(index)` usages the verification flagged as an undocumented DOM-order dependency, plus the three absolute-count assertions this report already touched) now goes through the same scoped helper.

### New regression files/changes in this follow-up

| File | Change |
| --- | --- |
| `src/ui/workout/ExerciseCard.tsx` | V-1 (derived toggle default) + V-2 (SetRow edit checkbox) |
| `src/ui/workout/WarmupCard.tsx` | V-3 (`data-testid="warmup-checklist"`) |
| `tests/e2e/warmupWorkout.spec.ts` | V-3 (every checkbox locator scoped to the testid, not CSS/DOM-order) |
| `tests/e2e/warmupSetClassification.spec.ts` | Two new `describe` blocks (V-1, V-2), each with a negative control, as above |

No database schema, sync schema, server sync semantics, progression algorithm, volume algorithm, recommendation-decision semantics, or Warm-up Routines *behavior* was changed — `data-testid` is inert markup, not behavior. `docs/reviews/warmup-set-classification-remediation-verification.md` was read but not modified.

### Verification runs (this follow-up)

- `pnpm typecheck`, `pnpm typecheck:sw`, `pnpm lint`, `pnpm format:check` — clean (same pre-existing `sync/service.ts` CRLF warning as before, still untouched by this diff)
- `pnpm test:unit` — 557/557 passed (unaffected; none of this follow-up's logic is unit-testable outside a real browser, per the same no-RTL constraint noted in §7's original targeted-test discussion)
- `pnpm test:integration` — 301/301 passed, 15 pre-existing skips (unaffected)
- Targeted Playwright, disposable PostgreSQL 16 + production build: `warmupSetClassification.spec.ts` (6/6 — the 4 original plus the 2 new V-1/V-2 tests), `warmupWorkout.spec.ts` (14/14, every checkbox locator now testid-scoped), `offline-set-edit-delete.spec.ts` (1/1 — confirms the SetRow checkbox placement did not shift the positionally-addressed weight/reps indices that spec depends on). One iteration failure along the way: the first attempt at the V-2 test failed with "element(s) not found" from a bug in the *test's own* `editingRow` helper (its `has` filter was scoped through `card.getByRole(...)` instead of `card.page().getByRole(...)`, matching the proven idiom in `offline-set-edit-delete.spec.ts`) — a test-helper mistake, not a production defect; fixed and re-run.
- Full Playwright suite, all 30 specs, disposable PostgreSQL 16 + production build: **96/96 passed** (the original 94 plus the 2 new tests)

All disposable resources (container, background server process, stray log file) were removed after the run; the persistent dev database on port 5432 was untouched throughout.

---

**V-1, V-2, and V-3 addressed; V-4 corrected. READY FOR TARGETED VERIFICATION.**

---

## 13. Second follow-up addendum (2026-09-05) — W-1 through W-4

The second-target independent verification (`docs/reviews/warmup-set-classification-remediation-verification-2.md`, verdict `VERIFIED WITH ONE COVERAGE GAP`) audited §12 only, against V-1 through V-4. It confirmed all three code fixes correct and V-4's corrections accurate on two of three items, and recorded W-1 (a required test-coverage gap) and W-2/W-3/W-4 (documentation corrections). This section — again an **append**, not a rewrite — records what was done about each. §12 above is left exactly as it was; corrections are recorded here and, where W-2/W-4 point at specific sentences in §12, inline at the point they occur, matching the same append-with-inline-correction convention §12 itself established for V-4.

### W-1 — required: the V-2 test could not detect a broken seed

**Root cause, as found.** `SetRow` is keyed `key={set.id}`, so opening its editor twice on the *same* set does not remount the component — the local `isWarmup` state survives from the previous Save regardless of what `useState(...)` was seeded with. The V-2 test's three "seeded from the stored value" assertions all read a state that had merely carried over from the test's own prior interaction, never from a fresh mount. A `useState(false)` seed (mutation **M-4** in the second verification) passed all 6 tests in the file while silently rewriting a warm-up set to a work set in the database on a weight-only edit.

**Fix applied.** `tests/e2e/warmupSetClassification.spec.ts`'s V-2 test: `await page.reload();` inserted between the first Save (work → warm-up) and the second re-open (weight-only edit) — exactly the point the second verification's §3.3 named. A reload forces every component, including `SetRow`, to remount, so the following `expect(row2.getByLabel("Warm-up set")).toBeChecked()` can only pass if the checkbox actually reads `set.isWarmup` (now `true`, already persisted locally by the first Save) from a fresh instance.

**Proved, not just asserted.** The exact negative control the second verification specified was reproduced end-to-end against a disposable PostgreSQL 16 database and a production build:

1. With the shipped code (`useState(set.isWarmup)`) and the reload now in place: `warmupSetClassification.spec.ts` **6/6 passed**.
2. `SetRow`'s seed mutated to `useState(false)` (M-4), rebuilt, same spec re-run: **5/6 passed, 1 failed** — the V-2 test failed at exactly the reload-guarded assertion:
   ```
   Error: expect(locator).toBeChecked() failed
   Locator:  ...editingRow(card).getByLabel('Warm-up set')
   Expected: checked
   Received: unchecked
   ```
   This is the identical symptom the second verification measured by hand (checkbox showing unchecked on a set actually stored as warm-up). The mutation is no longer invisible to the suite.
3. The mutation was reverted (`git diff` confirmed byte-identical to the pre-mutation file other than the one line), rebuilt, and the same spec re-run: **6/6 passed** again.

The fix is two lines in the test (a `page.reload()` call plus its explanatory comment); no production file was touched for W-1.

### W-2 — documentation correction: the "now accurate" claim overstated

Corrected inline in §12's V-4 item 2, above: the toggle survives a remount only once the athlete has already logged at least one set at that classification. A checked-but-not-yet-logged toggle is persisted nowhere and does not survive a remount — measured: checked with zero sets logged, or checked after a work set but before the next Log, both read back `false` after a reload, and the next set logged with no further action would be recorded as work. This window is narrower than the original V-1 defect (it requires the athlete to reload *between* checking the box and pressing Log, not merely mid-ramp) and no already-logged data is at risk, so — per the second verification's own recommendation — this is recorded as a documentation correction, not reopened as a defect.

### W-3 — documentation correction: only one of three exposed specs was named

Corrected inline in §12's V-2 section, above, and in the placement comment in `src/ui/workout/ExerciseCard.tsx` (comment-only — no behavior change): three specs, not one, address `SetRow`'s edit-mode inputs positionally by index (`.nth(0)`/`.nth(1)` for weight/reps, since they carry no aria-labels) and were therefore all at risk from the checkbox's placement — `tests/e2e/offline-set-edit-delete.spec.ts`, `tests/e2e/reconnect-batch-idempotence.spec.ts:83`, and `tests/e2e/transient-failure-fifo.spec.ts:75`. The placement decision itself (checkbox after, not before, the positionally-addressed inputs) was already correct for all three; only the recorded rationale under-named its own justification.

### W-4 — documentation correction: "assertions" → "tests"

Corrected inline in §12's V-4 item 1, above: the first verification's mutation testing found 2 of 4 e2e **tests** failing when `ExerciseCard`'s pass-through was reverted, and 1 of 4 **tests** for `HistoryDetail` — not "assertions". The counts were always right; only the noun was wrong.

### Changed files, this round

| File | Change |
| --- | --- |
| `tests/e2e/warmupSetClassification.spec.ts` | W-1: `page.reload()` inserted in the V-2 test, between the first Save and the second re-open |
| `src/ui/workout/ExerciseCard.tsx` | W-3: placement comment now names all three positionally-exposed specs (comment-only, no behavior change) |
| `docs/reviews/warmup-set-classification-remediation.md` | This section, plus inline corrections to §12 per W-2/W-3/W-4 |

No database schema, sync schema, server sync semantics, progression algorithm, volume algorithm, recommendation-decision semantics, or Warm-up Routines behavior was changed. Neither `docs/reviews/warmup-set-classification-remediation-verification.md` nor `docs/reviews/warmup-set-classification-remediation-verification-2.md` was modified.

### Verification runs (this round)

- `pnpm typecheck`, `pnpm typecheck:sw`, `pnpm lint` — clean
- `pnpm format:check` — clean but for the same pre-existing `src/server/sync/service.ts` CRLF warning, still untouched by any round of this remediation
- `pnpm test:unit` — **557/557** passed (unaffected)
- `pnpm test:integration` — **301/301** passed, 15 pre-existing skips (unaffected)
- **The affected warm-up classification spec and all three positionally-exposed `SetRow` specs**, disposable PostgreSQL 16 + production build:
  - Baseline (shipped code, reload in place): `warmupSetClassification.spec.ts` (6/6), `offline-set-edit-delete.spec.ts` (1/1), `reconnect-batch-idempotence.spec.ts` (2/2), `transient-failure-fifo.spec.ts` (1/1) — **10/10 passed**
  - M-4 mutation (`SetRow` seeded `useState(false)`): `warmupSetClassification.spec.ts` — **5/6 passed, 1 failed** (the V-2 test, at the now-load-bearing seeding assertion — see W-1 above)
  - Mutation reverted, rebuilt, re-run: **10/10 passed** again

All disposable resources (container, background server process, stray log/PID files) were removed after the run; the persistent dev database on port 5432 was untouched throughout.

---

**W-1 fixed and proved with the reviewer's own negative control; W-2, W-3, and W-4 corrected. READY FOR FINAL TARGETED VERIFICATION.**
