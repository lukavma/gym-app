# Set Groups (PI-012) — Stage A implementation

**Date:** 2026-09-12 (initial pass, remediation pass, and verification-completion pass — all same day,
continued session)
**Tree:** `583a9ab` (dirty). Concurrent, untouched by this task — carried over from the evaluation/review
lineage's own headers and independently re-confirmed by `git status` before and after every session in
this chain: `CLAUDE.md`, `HANDOFF.md` (deleted), `README.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md`,
`docs/STATUS.md`, `docs/evidence/*`, `docs/research-notes/*`, `playwright.config.ts`,
`tests/e2e/seed.ts`, and the untracked `.claude/skills/`, `docs/process/`, `docs/reviews/{exercise-catalog-
expansion-closeout, repository-agent-workflow-*, warmup-routines-evidence-research,
workout-prescription-context-device-acceptance}.md`, the four Set Groups architecture reports themselves
(`set-groups-architecture-evaluation.md`, `-review.md`, `-revision-verification.md`,
`-revision-verification-2.md`), `set-groups-strength-evidence-research.md`, `gpt-handoff.md`,
`gpt-memory.md`, `HANDOFF(depracted).md`, and the Tuchscherer PDF under `docs/research/`.
**Role:** implementation (Stage A only — see DELIVERY BOUNDARY in the original task brief)
**Session:** `S5 | PI-012 | Implementation — Set Groups Stage A` (initial), continued as
`S5b | PI-012 | Implementation — Set Groups Stage A remediation`, continued as
`S-Max | PI-012-A | Verification Completion — Full E2E` (this document reflects all three)
**Model:** claude-sonnet-5
**Task/gate:** [PI-012](../BACKLOG.md#pi-012). Implements Stage A (independent ordered groups) of the
verified architecture — [evaluation](set-groups-architecture-evaluation.md) revision 3 + [§19 owner
addendum](set-groups-architecture-evaluation.md#19-owner-decisions--accepted-2026-09-12), corrected by the
[independent review](set-groups-architecture-review.md) and the two
[revision-verification](set-groups-architecture-revision-verification.md)
[reports](set-groups-architecture-revision-verification-2.md).
**Authorization boundary:** implementation authorized, including the migration, group attribution,
per-group progression and associated sync/UI/test/documentation changes, against **local isolated test
databases only** (`gymapp_t_setgroups`/`gymapp_renumconc` in the initial pass; `gymapp_e2e_setgroups` in
the remediation pass; `gymapp_e2e_full` in this verification-completion pass; PGlite for
`pnpm test:unit`/`pnpm test:integration`). **No production migration, no staging, no commit, no push, no
deployment** — none attempted, none available to attempt (this session has no production credentials).
Stage B (linked back-offs, D-4/D-5) is explicitly out of scope; its extension point is preserved but not
implemented (see §7).
**Files touched:** see §1 (task-owned manifest) and §10 (documentation).
**Verdict:** n/a (implementation) — closes with `READY FOR INDEPENDENT SET GROUPS STAGE A REVIEW`
**Cites:** [set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) §4–§13, §19;
[set-groups-architecture-review.md](set-groups-architecture-review.md);
[set-groups-architecture-revision-verification.md](set-groups-architecture-revision-verification.md);
[set-groups-architecture-revision-verification-2.md](set-groups-architecture-revision-verification-2.md);
[agent-workflow.md](../process/agent-workflow.md) §5/§6/§8/§10; [PI-012](../BACKLOG.md#pi-012).

---

## 0. Summary and chronology

This document supersedes the version this report originally closed with. That first version explicitly
closed while disclosing several gaps as accepted deferrals: no per-group progression override in the
prescription editor, no in-session group-reassignment control, no reverse (grouped→ungrouped) legacy
bridge, and a list of untested mechanisms (A-9/A-13/A-16/A-17). **The owner rejected that framing**: those
gaps were not owner-approved deferrals, and this remediation pass was tasked to close them before
independent review. §§1–10 below describe the tree as it stands **now**, after both passes; §0.1 states
what changed between them; the disposition tables in §3 reflect the final, current state — a reviewer
should not need to read the superseded version to understand what shipped.

**Everything the original pass implemented is unchanged and still correct**: the migration
(`drizzle/0014_third_scream.sql`), the domain evaluation core (`groupEvaluation.ts`'s partitioning/
windowing/forward-bridge, the CRITICAL INVARIANT, the group chip row, the C-1/D-6(a) forward bridge's
read-time-fallback/write-time-supersede mechanism), the sync contract (group-scoped emission, server-side
key validation), and the byte-identity guarantees for ungrouped records (NC-9) all stood without
modification through this pass's full regression suite. What changed is additive completion of explicitly
required scope, plus — critically — **four previously-undiscovered bugs found while building the required
browser-level test coverage**, all now fixed with regression tests:

1. **Prescription editor per-group progression override (Feature 1, required item 1).** Implemented in
   `PrescriptionForm.tsx`: each group gets its own "Progression strategy" select (default "Same as
   exercise") and, when the group's effective strategy is rep-progression on a fixed-rep group, a required
   repCap field. A brand-new group has no key until its first save (§4.2's server-only key generation is
   an architecture invariant, not a UI oversight), so its override control is unavailable until a
   follow-up edit — disclosed precisely, not silently, in §7.
2. **In-session group-reassignment correction (Feature 2, required item 2).** `ExerciseCard.tsx`'s
   `SetRow` edit form now carries the identical group `<select>` `HistoryDetail.tsx` already had, wired to
   the same `EditSetPatch.groupKey` / server-side `setLogUpdateChangesEvaluationInputs` rule the original
   pass already built and left untested at this layer.
3. **Symmetric reverse history bridge (Feature 3, required item 3).** `groupEvaluation.ts` gained
   `bridgeUngroupedHistoryEntry`, used by `evaluateSession.ts`'s ungrouped branch for progression history
   and by a new `firstWorkSetForUngroupedCarryForward` in `server/today/service.ts` for carry-forward — an
   ungrouped slot reading a historical entry that was itself grouped now reads only that entry's own first
   group, resolved from that entry's own frozen snapshot, never pooling every group's sets together and
   never rewriting the stored row.
4. **Closed the explicitly named coverage gaps (required item 4)** — client `logSet` stamping and
   per-group implicit decisions, grouped replay/idempotence, reassignment/pending-recommendation effects,
   deletion/renumbering preserving group identity, numeric e1RM equivalence, and the full Playwright
   surface (authoring, execution, correction, reload, offline) — see §3's per-item disposition and §5/§6
   for the evidence.
5. **Today preview reconciliation (required item 5).** `TodaySection.tsx`'s pre-workout preview now
   renders `entry.pendingRecommendations` (per group, labelled) for a grouped slot instead of only the
   always-empty ungrouped singular.

**Four real, previously-undiscovered bugs were found and fixed while building the required coverage — not
hypothesized, not inspected-only, each caught by an actual failing test before the fix and passing after:**

- **B-1 (`toPerformedSets` dropped `groupKey`, offline evaluation only).** The client's offline completion
  fallback (`buildClientRecommendationOps`) mapped every set — the current exercise's own and every
  history entry's — through a helper that never carried `groupKey`, so `partitionGroupSets`'s
  `s.groupKey === group.key` filter matched nothing for any group, for any session completed offline.
  Found by a new fake-IndexedDB unit test (`tests/unit/setGroups/activeSessionGroups.test.ts`).
- **B-2 (the offline-computed `recommendation` op never carried `groupKey` at all).** Even with B-1 fixed,
  `buildClientRecommendationOps`'s payload builder call never included the per-group result's own
  `groupKey`, so two groups' offline-computed recommendations would both sync as ungrouped
  (`groupKey: null`) and collide on `uq_recs_one_pending`, dead-lettering one of them as
  `recommendation_conflict` on reconnect. Found by the same unit test, immediately after fixing B-1
  exposed it.
- **B-3 (a bridged C-1/D-6(a) recommendation kept its stored `groupKey: null` instead of the bridging
  group's key).** `buildTodayBundle`'s `pendingRecommendations` bridge fetched the legacy null-key row
  correctly but returned it unchanged; every client-side consumer (`ExerciseCard.tsx`'s card lookup,
  `TodaySection.tsx`'s label lookup, `activeSession.ts`'s implicit/explicit decision lookups) keys a
  recommendation to a group by `rec.groupKey === group.key`, so the bridged recommendation was fetched
  correctly but then invisible and undecidable everywhere in the UI — silently defeating the bridge's
  entire purpose. Found by the new legacy-conversion Playwright spec.
- **B-4 (`getActiveSession`'s cross-device-resume recommendation lookup used the wrong key format,
  affecting every exercise, grouped or not).** `getSessionRecommendationsByExercise`'s map has been keyed
  by the composite `exerciseGroupKey` string since the original Stage A pass; `getActiveSession`'s own
  consumption site was never updated to match and kept doing `.get(e.exerciseId)` (a bare id, which never
  equals the composite key's `"<id>:"` format) — cross-device resume of an in-progress session's pending
  or decided recommendation silently returned `null` regardless of what actually existed, for **every**
  exercise, a pre-existing regression from the original pass, not something newly introduced. Also found
  missing in the same function: `groupKey` was never selected onto a resumed session's individual sets,
  and `.recommendations` (the grouped, plural sibling of `.recommendation`) was never populated at all.
  All three fixed together; see §5.4.

Every one of these four was invisible to the full pre-existing 1348-unit/507-integration suite before this
pass and to the original pass's own new tests — none of them asserted the *positive* case these bugs broke
(a real recommendation actually reaching the UI through the affected path). This is the direct, concrete
payoff of the browser-level Playwright coverage the owner insisted on: three of the four (B-2, B-3, B-4)
are UI/wire-contract defects that no unit or integration test targeting the "obvious" surface would have
caught, and the fourth (B-1) needed a real fake-IndexedDB harness driving the actual production mutator
rather than a hand-built fixture.

### 0.1 What changed since the superseded version of this report

The superseded version's own manifest, acceptance mapping and "not done" list are the ones this section
replaces; nothing in that version's evidence for the *already-implemented* Stage A core (migration,
domain evaluation, sync contract, byte-identity) has been found incorrect, and none of it needed to change.
What changed:

- Added: per-group progression override UI (§1.5, new PrescriptionForm.tsx code), in-session
  group-reassignment UI (§1.5, new ExerciseCard.tsx code), the reverse history bridge (§1.2/§1.3, new
  groupEvaluation.ts/today.ts code), the Today preview reconciliation (§1.5, TodaySection.tsx).
- Fixed: B-1/B-2/B-3/B-4 above (§1.4/§1.3).
- Added: 6 new unit tests (reverse bridge, `groupEvaluation.test.ts`), 6 new unit tests (client
  logSet/offline evaluation, new `activeSessionGroups.test.ts`), 8 new integration tests (reverse bridge
  ×2, in-session reassignment, deletion/renumbering, replay/idempotence, e1RM equivalence, cross-device
  resume ×2), 4 new Playwright specs across 2 new files (authoring, full lifecycle, legacy conversion,
  offline completion).
- Corrected: the acceptance mapping (§3) — A-9, A-13, A-13b's residual note, A-16, A-17 all move from
  "partially met"/"not executed" to "met", with the evidence that makes each true.
- The e1RM/A-16 negative-control table and the migration/quality-gate evidence (§5/§6) are re-quoted in
  full from commands actually re-run in this pass — not merely carried forward from the earlier version's
  numbers, since the test suite grew and the exact final counts differ.

### 0.2 Verification-completion pass (`S-Max`) — what changed since the remediation pass's own report

The remediation pass's own report closed having run `pnpm test:e2e:offline` (the CI-defined 14-file
subset) plus a further hand-selected 5 files — 45 individual tests across 12 of the repository's 39 E2E
spec files — and presented that as the pass's E2E evidence. **That did not satisfy the task's requirement
for the full `pnpm test:e2e` suite**, and a curated subset, however reasoned, cannot substitute for it.
This pass:

- Ran the complete `pnpm test:e2e` suite (all 39 spec files, 160 individual tests) against a freshly
  created isolated disposable Postgres, following the same CI bootstrap sequence, on the unmodified final
  tree — §6.3, which is now this report's primary E2E evidence.
- Found **zero failures** — 160 passed, 0 failed, 0 skipped, exit code 0. No Stage-A-attributable fix and
  no external/pre-existing boundary determination were needed, because nothing failed.
- Corrected §6.3's own accounting to distinguish spec **files** (39) from individual **tests** (160) —
  the remediation pass's report had described its smaller run only as "45 tests across 12 spec files"
  without stating file and test counts as two separate, clearly-labelled figures throughout evidence
  sections; this pass's §6.3/§6.4 state both explicitly everywhere a count appears.
- Reworded §7's three flagged deviations (two-save authoring, missing group add/remove/reorder browser
  coverage, reverse-conversion pending-record handling) to state them as the implemented approach for the
  reviewer to assess, rather than as justified or architecturally necessary outcomes — see §7.1.
- No source file changed in this pass. Every fix described in §5 and every file described in §1 was
  already in place before this pass began; this pass is verification-only.

---

## 1. Task-owned manifest

Every file below was created or edited across the two passes that together make up this task. Nothing in
§0's "concurrent, untouched" list was touched, in either pass.

### 1.1 Migration (initial pass, unchanged by remediation)

- `drizzle/0014_third_scream.sql` (new) — nullable `set_logs.group_key`, nullable
  `recommendations.group_key`, and the rebuilt `uq_recs_one_pending` (adds
  `coalesce(group_key, '')` to the partial unique index).
- `drizzle/meta/0014_snapshot.json` (new), `drizzle/meta/_journal.json` (updated) — `drizzle-kit
  generate` bookkeeping.
- `src/db/schema/setLogs.ts`, `src/db/schema/recommendations.ts` — the two Drizzle column
  declarations and the rebuilt index the migration was generated from.

No schema change was needed in the remediation pass — every fix and addition described below works within
the existing schema.

### 1.2 Domain (initial pass + remediation additions)

- `src/domain/schemes/setScheme.ts` — the `groups` scheme variant (`SetGroup`/`GroupsScheme`), its
  `superRefine` invariants (unique keys, Σ `sets.max` ≤ 20), `formatScheme`'s new case, `projectGroup`,
  the authoring-input schema (`setSchemeAuthoringSchema`/`SetSchemeAuthoringInput`, groups may omit
  `key`) and `assignGroupKeys` (server-side key generation, §4.2 manifest item 18). *Unchanged in the
  remediation pass.*
- `src/domain/progression/groupEvaluation.ts` (new in the initial pass) — `stripGroupKey`,
  `partitionGroupSets`, `buildGroupHistory` (forward C-1/D-6(a) bridge), `buildGroupEvaluationUnits`, all
  unchanged. **Remediation addition:** `bridgeUngroupedHistoryEntry` — the reverse (§5.6) bridge. Its
  first implementation filtered `workSets` by the historical entry's first group but left
  `prescribed.scheme` as the raw `groups` scheme; a dedicated unit test (below) proved that leaves
  `isCompleted`'s own groups-scheme guard treating every bridged entry as unconditionally "not completed"
  regardless of actual performance, corrupting fail-streak counting — fixed within this same pass, before
  ever reaching the report, by also projecting the bridged entry's scheme and threading the group's own
  `targetRir` override.
- `src/domain/progression/evaluateSession.ts` — the per-group dispatch (`evaluateGroupedExercise`) and
  the ungrouped path's `stripGroupKey` discipline, both unchanged. **Remediation change:** the ungrouped
  branch's `ctx.history` is now built via `exercise.history.map(bridgeUngroupedHistoryEntry)` instead of
  passed through untouched.
- `src/domain/progression/engine.ts`, `loadProgression.ts`, `repProgression.ts`, `registry.ts`,
  `workingTargets.ts`, `evaluationTarget.ts` — all unchanged since the initial pass; re-verified by the
  full regression suite in §6.
- `src/domain/prescriptions/applyWeekModifiers.ts`, `buildSnapshot.ts`, `schema.ts` — unchanged since
  the initial pass.
- `src/domain/schemas/prescriptionSnapshot.ts`, `recommendation.ts` — unchanged since the initial pass.
- `src/domain/sync/schema.ts`, `setDeletionOps.ts` — unchanged since the initial pass.
- `src/domain/measurement/compatibility.ts` — unchanged since the initial pass.

### 1.3 Server (initial pass + remediation fixes)

- `src/server/sync/service.ts` — unchanged since the initial pass (`SET_LOG_FIELDS`,
  `isValidGroupKeyForSnapshot`, `parseParentSnapshot`, `setLogUpdateChangesEvaluationInputs`'s `groupKey`
  rule, `applyRecommendationUpsert`'s bridge-supersede-key computation — all re-verified, not re-written).
- `src/server/progression/service.ts` — `exerciseGroupKey`, `assembleAndEvaluate`'s unified
  `statusByKey` map, `supersedePending`, `mapWorkSetRows`, `getPendingRecommendationsByExercise`,
  `getLatestDecisionChosenByExercise`, `getSessionRecommendationsByExercise` all unchanged since the
  initial pass. **Remediation addition:** `resolveGroupRecommendation` — the ONE shared helper (fixing
  B-3) that resolves a group's own recommendation with the C-1/D-6(a) fallback and remaps the returned
  copy's `groupKey` to the bridging group's own key, used by both `server/today/service.ts` call sites
  below so the bridge can never be resolved two different ways.
- `src/server/today/service.ts` — `buildTodayBundle`'s scheme/snapshot/carry-forward assembly and the
  forward `historySetsForGroupCarryForward`/`toGroupCarryForwardCandidate` unchanged since the initial
  pass. **Remediation changes:** (a) `toCarryForwardCandidate` (the UNGROUPED slot's own carry-forward
  row builder) now routes through a new `firstWorkSetForUngroupedCarryForward`, the reverse-bridge
  equivalent of the forward-direction helper already beside it; (b) `pendingRecommendations`'s bridge loop
  now calls the shared `resolveGroupRecommendation` (fixing B-3); (c) `getActiveSession` — three fixes
  together (fixing B-4): `ActiveSessionSetDto` gained `groupKey`, populated from `s.groupKey` in the row
  mapping; `ActiveSessionExerciseDto` gained an optional `recommendations` array, populated per group via
  `resolveGroupRecommendation` when the frozen scheme is `groups`; the singular `.recommendation`'s lookup
  was fixed from a bare `recommendationByExercise.get(e.exerciseId)` to
  `recommendationByExercise.get(exerciseGroupKey(e.exerciseId, null))`.
- `src/server/prescriptions/service.ts` — `assignGroupKeys` call site, `resolvePrescriptionProgression`
  wiring, and the `updatePrescription` scheme-change-recomputes-progression bug fix (found and fixed in
  the *initial* pass, re-verified unchanged here) — all unchanged in the remediation pass; the per-group
  progression override this pass exposes through the UI was already fully supported here.
- `src/server/history/service.ts` — unchanged since the initial pass.

### 1.4 Client (sync) (initial pass + remediation fixes)

- `src/sync/types.ts`, `activeSessionStore.ts`, `corrections.ts` — unchanged since the initial pass.
- `src/sync/activeSession.ts` — `normalizeActiveSession*`, `setLogFullRowOp`'s group-scoped emission,
  `logSet`'s per-group implicit decision, `decideRecommendation`'s `groupKey` parameter, `editSet`'s
  `groupKey`-carrying `EditSetPatch` — all unchanged since the initial pass (now exercised end to end by
  new tests rather than left untested). **Remediation fixes (B-1/B-2):** `toPerformedSets` widened to
  accept and carry through an optional `groupKey` (previously silently dropped for every caller, current-
  session and history alike); `buildClientRecommendationOps`'s `recommendation` op payload now includes
  `...(result.groupKey !== null ? { groupKey: result.groupKey } : {})` (previously omitted unconditionally,
  even for a per-group result).

### 1.5 UI (initial pass + remediation additions)

- `src/ui/workout/groupSelection.ts` (new in the initial pass) — `nextGroupSelection`, `groupPrefill`,
  unchanged.
- `src/ui/workout/ExerciseCard.tsx` — the group chip row, the selection-derivation effect, auto-advance,
  the per-group `RecommendationCard`s, all unchanged since the initial pass. **Remediation addition:**
  `SetRow` gained a `groupsScheme` prop and, in its edit branch, the identical group `<select>`
  `HistoryDetail.tsx`'s `HistorySetRow` already had — an "Unattributed" option clears attribution, any
  other option reassigns it, patched through `EditSetPatch.groupKey` (already supported server-side since
  the initial pass, simply never exposed at this layer before).
- `src/ui/workout/RecommendationCard.tsx` — unchanged since the initial pass (`groupLabel` prop already
  existed and renders correctly; B-3's bug was in what `groupKey` the object it receives carries, not in
  this component).
- `src/ui/history/HistoryDetail.tsx`, `types.ts`, `correctionSubmit.ts` — unchanged since the initial
  pass (the group-reassignment control this pass's E2E spec exercises at the History layer already
  existed).
- `src/ui/prescriptions/PrescriptionForm.tsx` — the group-list editor (add/remove/reorder, sets/reps
  ranges, RIR-band/baseline overrides) unchanged since the initial pass. **Remediation addition:** each
  group draft gained `strategyOverride`/`repCap` fields; the load effect populates them from the
  prescription's resolved `progression.groups[key]` (comparing the resolved strategy against the slot's
  own to infer "no override" vs. an explicit one); the submit handler builds a `progression.groups` entry
  per group that either chose an explicit strategy or tuned a repCap; the JSX renders a "Progression
  strategy for this group" select plus a conditional, required repCap field — gated on the group already
  having a key (a brand-new group shows an explanatory placeholder instead, per §4.2's server-only key
  assignment).
- `src/ui/today/TodaySection.tsx` — **remediation addition:** `TodayResolutionView`'s per-exercise
  preview now branches on `isGroupsScheme(entry.scheme)`: a grouped slot renders each entry of
  `entry.pendingRecommendations` (deload-gated the same defensive way the existing singular already was),
  labelled by its own group; an ungrouped slot is byte-identical to before.

### 1.6 Tests (initial pass 105 tests across 10 files; remediation adds 20 unit + 8 integration + 4 E2E)

**Initial pass, unchanged:** `tests/unit/setGroups/{setSchemeGroups,groupEvaluation(base),
groupSelection,evaluateSessionGroups,registryGroupProgression,prescriptionCompatibility,buildSnapshotGroups,
rollbackCompatibility,applyWeekModifiersGroups}.test.ts`; `tests/integration/setGroups.integration.test.ts`
(base 10 tests); the 10 pre-existing test files fixed for the additive schema change
(`applyWeekModifiers.test.ts`, `progressionMatrix.test.ts`, `progressionWorkSetMapping.test.ts`,
`prescriptions/formOptions.test.ts`, `measurement/{dtoRoundTrip,uiFormatWiring}.test.ts`,
`sync/{rollbackCompatibility,setLogEmission}.test.ts`, `tests/integration/measurementSync.integration.test.ts`,
plus the `setLogs.ts` comment reword).

**Remediation pass, new:**

- `tests/unit/setGroups/groupEvaluation.test.ts` — 6 new tests added to the existing file, under
  `bridgeUngroupedHistoryEntry`: the reverse-bridge filter itself, the §5.4 safety-property regression
  case (scheme projection), the group's-own-`targetRir`-override-vs-slot-band case, the
  ordinarily-ungrouped passthrough, the no-prescribed-snapshot passthrough, and the no-leaked-`groupKey`
  discipline check. File total: 15 → 21 tests.
- `tests/unit/setGroups/activeSessionGroups.test.ts` (new file, 6 tests) — fake-IndexedDB-driven,
  against the real `startSession`/`logSet`/`completeSession` mutators: per-group `groupKey` stamping,
  warm-up-forces-null, per-group implicit decision (two variants), and the two B-1/B-2 regression tests
  (offline grouped completion producing correctly-partitioned, correctly-`groupKey`-tagged recommendation
  ops; an ungrouped offline completion staying byte-identical).
- `tests/integration/setGroups.integration.test.ts` — 8 new tests added to the existing file: the
  reverse-bridge carry-forward test (Back-off logged first, Top last — proving "first GROUP" wins over
  "first logged set"), the reverse-bridge progression-history/streak test (the decisive
  hold-vs-decrease scenario described in §5.2), the in-session group-reassignment test (a decided group
  never resurrected, the group a set left re-evaluated), the deletion/renumbering-preserves-group-identity
  test, the grouped-replay/idempotence test, the numeric e1RM-equivalence test, and the two B-4 regression
  tests (`getActiveSession` surfacing per-group and ungrouped pending recommendations correctly remapped;
  `getActiveSession` preserving each resumed set's own `group_key`). File total: 10 → 18 tests.
- `tests/e2e/setGroups.spec.ts` (new, 3 tests) — prescription-form per-group progression authoring
  (including the two-step brand-new-group flow); the full workout lifecycle (chip row, auto-advance,
  dirty drafts, warm-ups, optional sets, mid-flow reload, in-session correction, History correction,
  independent per-group recommendations); the C-1/D-6(a) legacy-conversion bridge (this is the spec that
  found B-3).
- `tests/e2e/setGroupsOffline.spec.ts` (new, 1 test) — completing a grouped workout fully offline
  (`context.setOffline(true)`, the established offline-recommendation.spec.ts pattern), the spec that
  found B-1/B-2 and proves both fixes end to end through a real browser and real service worker.

---

## 2. Design decisions carried from the initial pass (unchanged, restated for completeness)

The initial pass's own analysis of its design choices remains accurate and is restated here rather than
re-derived, since the remediation pass built directly on top of it without revisiting these decisions:

1. **C-1/D-6(a) forward bridge: read-time fallback + write-time supersede, not a conversion-time
   migration hook.** The first group in scheme order additionally falls back to the null-key
   pending/history/carry-forward record when its own key has none yet (read time); the first time that
   group's own key produces a fresh evaluation, the supersede call targets `[group.key, null]` in one
   query (write time). This remediation pass's only change to this mechanism was fixing what the
   **returned object's** `groupKey` field says (B-3) — the underlying supersede/read logic itself was
   already correct and is unchanged.
2. **"First group" is a structural rule** — index 0 of `scheme.groups`, collapsing the single-group (C-1)
   and multi-group (D-6(a)) cases into one rule. The remediation pass's reverse bridge reuses this exact
   convention (`scheme.groups[0]`) for symmetry.
3. **`assembleAndEvaluate`'s dedupe/reevaluate-scope unification via one `statusByKey` map** — unchanged,
   re-verified by the remediation pass's new in-session-reassignment and replay/idempotence tests, both of
   which exercise this exact mechanism from a different angle than the initial pass's own tests did.

**One new design decision this pass made:** the reverse bridge (§5.6) is implemented as a single pure
function (`bridgeUngroupedHistoryEntry`) that returns a *complete*, corrected `PerformedExercise` (both
`workSets` and `prescribed`), rather than a bare `PerformedSet[]` the caller reassembles. The first draft
of this function returned only the filtered `workSets`, mirroring the forward direction's
`historySetsForGroup`'s narrower signature — but the forward direction's caller (`buildGroupHistory`)
*separately* reconstructs the correct `prescribed.scheme` via `projectGroup`, something the narrower
reverse-direction draft omitted, which is exactly what produced the `isCompleted` guard bug described in
§0's B-numbering preamble and §1.2. Returning the whole corrected entry from one function removes the
possibility of a caller forgetting to also fix `prescribed`, which is what actually happened once.

**One deliberate reverse-bridge asymmetry with the forward direction, unchanged from what the initial pass
already disclosed (§2 item 3 of the superseded report) and still true:** the reverse bridge is a **read**
mechanism only — it changes how an already-stored, previously-grouped historical row's sets are
*interpreted* for a now-ungrouped slot's evaluation and carry-forward. It does not attempt to also
retroactively supersede a stale, non-null-keyed pending recommendation left over from before the
conversion back to ungrouped (the mirror image of D-6's forward write-time supersede). This was considered
and deliberately scoped out: (a) the task's required item 3 names carry-forward and progression history
specifically, not pending-recommendation cleanup on a reverse conversion; (b) such an orphaned record is
never surfaced to the UI regardless (the ungrouped bundle's own `pendingRecommendation` lookup is keyed to
the null group only, and a stale non-null-keyed row simply never matches that key) — it is inert, not
misleading; (c) inventing new write-side symmetric-supersede logic for a case the architecture's own §5.6
does not specify a mechanism for would have been scope expansion beyond what was asked. Recorded here,
explicitly, as a residual limitation (§7), not glossed over as done.

---

## 3. Acceptance mapping (evaluation §12.1, corrected by the verification lineage) — final state

| ID | Disposition | Evidence |
|---|---|---|
| A-1 | **Met** (initial pass, unchanged) | `tests/unit/setGroups/setSchemeGroups.test.ts`. |
| A-2 | **Met** (initial pass, unchanged) | Same file — `formatScheme` exact string match, exhaustive switch. |
| A-3 | **Met** (initial pass, unchanged) | `registryGroupProgression.test.ts` + `prescriptionCompatibility.test.ts`. |
| A-4 | **Met** (initial pass, unchanged) | `tests/integration/setGroups.integration.test.ts` "evaluates each group independently". |
| A-5 | **Met** (initial pass, unchanged) | Integration "a group with no recorded sets reports NO_WORK_SETS_LOGGED...". |
| A-6 | **Met** (initial pass, unchanged) | `evaluateSessionGroups.test.ts` — full 8-row matrix, both strategies. |
| A-7 | **Met** (initial pass, unchanged) | `applyWeekModifiersGroups.test.ts`. |
| A-8 | **Met** (initial pass, unchanged) | `buildSnapshotGroups.test.ts` + integration C-1/D-6(a) test. |
| A-9 | **Met** (was "partially met" — closed this pass).** The disclosed gap ("a fake-IndexedDB-level test of `activeSession.ts`'s `logSet` stamping the selected key and resolving the per-group implicit decision") is now covered directly: `tests/unit/setGroups/activeSessionGroups.test.ts`, driven against the real production `startSession`/`logSet` mutators and a real (fake-indexeddb) IndexedDB — 4 tests covering stamping, warm-up exclusion, and per-group implicit decision (including the "second group decides independently" case the pure-function tests alone couldn't reach). |
| A-10 | **Met** (initial pass, unchanged) | `sync/rollbackCompatibility.test.ts` (setGroups variant) + integration NC-9. |
| A-11 | **Met** (initial pass, unchanged) | `setGroups/rollbackCompatibility.test.ts`. |
| A-12 | **Met** (initial pass, unchanged; migration evidence not re-run this pass since the schema didn't change — see §6.1) | §6.1 below. |
| A-13 | **Met** (was "partially met" — closed this pass).** Key validation against the parent snapshot: met (unchanged). Replay idempotence: **now explicitly covered for grouped ops** by the new "grouped replay/idempotence" integration test (identical batch applied twice, zero duplication, zero re-evaluation). "A set moved between groups re-evaluates + supersedes that group's pending record": **now covered** by the new "in-session group reassignment" integration test. "Deletion renumbering preserves keys": **now covered** by the new dedicated "deletion/renumbering preserves group identity" integration test (real DB round trip through `buildSetDeletionOps` + `applySyncBatch`, asserting the exact post-renumber `(setNumber, groupKey)` pairs). |
| A-13b | **Met** (initial pass, unchanged; "superseded by a later session" half re-verified by the new in-session-reassignment test from a different angle) | Integration M-3/A-13b/NC-6 test (unchanged) + the new reassignment test. |
| A-14 | **Met** (initial pass, unchanged) | Integration C-1/D-6(a) test + §4.5 test + `buildSnapshotGroups.test.ts`. |
| A-15 | **Met** (initial pass, unchanged) | Integration tests (main evaluation, NC-3, deload). |
| A-16 | **Met** (was "met by inspection only" — closed this pass with a direct test).** The specific claim "the e1RM report for a grouped session equals the report for the identical sets logged ungrouped" is now proven by a dedicated integration test: two exercises, one plain one grouped, identical facts logged in the SAME shared session (so `sessionId`/`startedAt` are identical too, eliminating every non-grouping-related source of difference), `getExerciseStrengthReport`'s full `{eligible, estimate, observations, sessionsWithoutEligibleSets, whatIf, algorithm}` output compared field-by-field and found byte-identical. `src/domain/strength/**`/`src/server/strength/service.ts` remain untouched by this task (confirmed by `git status`) and `strengthBoundary.test.ts` remains green. |
| A-16b | N/A — unaffected; not re-run (`src/domain/strength/**` untouched). |
| A-17 | **Met** (was "not executed" — the largest gap, closed this pass).** Two new Playwright spec files, 4 tests, all passing against a real browser, a real production build, and an isolated disposable Postgres following the current CI bootstrap: prescription-form authoring of a per-group progression override (including the two-save flow this pass's editor uses for a brand-new group — see §7.1); the full §11.4 transition table (auto-advance changing the actual input immediately, dirty-draft discard on group switch, warm-up exclusion from both the count and the auto-advance, optional-sets-beyond-min staying straightforward, a mid-workout reload correctly re-deriving the "last group" mount rule); in-session and History group-reassignment correction; independent per-group recommendations rendered with their own labels on the next workout; the C-1/D-6(a) legacy-conversion bridge (which found bug B-3); and a fully-offline grouped completion (which found bugs B-1/B-2). These 2 files are also part of the required full `pnpm test:e2e` run (§6.3) — 39 spec files, 160 tests, 160 passed, confirming the new coverage integrates cleanly with the other 37 files' existing coverage. Not covered even now: the group add/remove/reorder controls themselves at the browser level (§7.1). Device (iPhone) acceptance remains out of scope for an implementation pass and is not claimed. |

---

## 4. The context-slicing / strategy-preservation guarantee, re-verified

**Corrected in the 2026-09-13 targeted-remediation pass (independent review L-4; heading year corrected by
independent verification V-6 — this pass is dated 2026-09-13, not 2025).** The paragraph below originally
undercounted `loadProgression.ts`'s changes as "the one early-return guard + one exhaustiveness arm each"
for both strategy files. That is accurate for `repProgression.ts` (one guard at the top of
`evaluateRepProgression`, one exhaustiveness arm in `schemeMinReps`) but not for `loadProgression.ts`,
which carries **two** early-return guards — one inside `isCompleted` (narrowing `scheme.type === "groups"`
to `return false` before reading `scheme.sets`) and a second, separate one at the top of
`evaluateLoadProgression` itself — plus its own exhaustiveness arm in `targetRepsPerSet`. `docs/reviews/
set-groups-architecture-evaluation.md` §10 lists both files under "Not changed, deliberately"; that line is
also inaccurate for the reasons below and is not itself edited here (previous review reports are kept
intact) — see §7.1 (M-3/L-4 disposition) for the corrected deviation record. Both guards remain verified
inert: each narrows a variant `evaluateSession`'s dispatch makes structurally unreachable in practice, the
`isCompleted` guard's `return false` preserves rather than masks the NC-7 hazard, and `STRATEGY_VERSIONS`
is unchanged.

Unchanged from the initial pass and re-confirmed by this pass's full regression suite: no change to either
strategy's own decision logic. The remediation pass's own new logic (`bridgeUngroupedHistoryEntry`) sits
entirely in `groupEvaluation.ts` and `evaluateSession.ts`'s dispatch layer, never inside a strategy
function — the same boundary the initial pass established and this pass did not need to cross.

---

## 5. The four bugs found and fixed in this remediation pass

### 5.1 B-1 — `toPerformedSets` silently dropped `groupKey` (offline evaluation only)

**Where:** `src/sync/activeSession.ts`, the private `toPerformedSets` helper used by
`buildClientRecommendationOps` to build both the current exercise's own `workSets` and every history
entry's `workSets` for the offline completion fallback.

**Symptom:** the helper's parameter type and body only ever read/returned `{weightKg, reps, rir}` — no
`groupKey` at all, for any caller. `partitionGroupSets` (`groupEvaluation.ts`) filters a slot's work sets
by `s.groupKey === group.key`; with the tag stripped before it ever arrived, **every** group's partitioned
window came back empty for a grouped exercise completed offline, regardless of what was actually logged.

**Fix:** widened `toPerformedSets`'s parameter type to accept an optional `groupKey` and thread it through
(`groupKey: s.groupKey ?? null`) — matching the "uniform-attach-then-`stripGroupKey`" discipline
`groupEvaluation.ts`'s own module comment already documents for every other caller in this codebase.

**Found by:** `tests/unit/setGroups/activeSessionGroups.test.ts`'s "evaluates each group independently
from its OWN real logged sets when completing offline" test — asserted `inputs.workSets` length per group
directly (not merely the resulting action), which is what makes this test fail loudly on the root cause
rather than on a downstream symptom.

### 5.2 B-2 — the offline-computed `recommendation` op never emitted `groupKey`

**Where:** the same function, its `results.map(...)` → `buildRecommendationUpsertPayload(...)` call.

**Symptom:** `EvaluatedRecommendation.groupKey` (the per-group result's own group key) was computed
correctly by `evaluateSession`, but the payload object passed to the builder never included it — every
offline-computed recommendation, for a grouped exercise, synced to the server indistinguishable from an
ungrouped one. Two such records for the same (exercise, block) would both target the null-group slot of
`uq_recs_one_pending` and collide; the second one to apply would dead-letter as `recommendation_conflict`,
silently losing one group's offline-computed progression on reconnect.

**Fix:** added `...(result.groupKey !== null ? { groupKey: result.groupKey } : {})`, matching the
`recommendationUpsertPayloadSchema`'s own documented emission rule (present only for a per-group record).

**Found by:** the same unit test, immediately after fixing B-1 exposed it (B-1's fix made the partitioned
windows non-empty, which is what let two real per-group results reach this code path at all).

### 5.3 B-3 — a bridged (C-1/D-6(a)) recommendation kept the legacy row's `groupKey: null`

**Where:** `src/server/today/service.ts`'s `pendingRecommendations` bridge loop inside `buildTodayBundle`.

**Symptom:** the bridge correctly *fetched* the pre-conversion null-key pending record as the first
group's fallback, but returned it **unchanged** — its own `groupKey` field stayed `null`. Every
client-side consumer resolves "which group does this recommendation belong to" by comparing
`rec.groupKey === group.key`:

- `ExerciseCard.tsx`: `groupRecommendations.find((r) => r.groupKey === group.key)` — never matches, so the
  `RecommendationCard` for the bridged group never renders on the workout card at all.
- `TodaySection.tsx`: `groupsScheme.groups.find((g) => g.key === rec.groupKey)` — never matches, so the
  Today preview shows the recommendation with no group label (an early, more localized symptom that
  surfaced first, before this pass traced the root cause).
- `activeSession.ts`'s `logSet`/`decideRecommendation`: both key their implicit/explicit decision lookup
  by `groupKey` the same way — the bridged recommendation could never actually be decided, implicitly or
  explicitly, even though it was sitting in the session's own `recommendations` array.

The net effect: the bridge fetched the right data into the bundle and the session, then made it invisible
and inert everywhere a person would actually see or act on it — silently defeating the entire stated
purpose of C-1/D-6(a) ("surfaced, decided normally, superseded by the group's next record").

**Fix:** added `resolveGroupRecommendation` to `server/progression/service.ts` (§1.3) — the one shared
helper both call sites in `today/service.ts` now use — which returns `{ ...bridged, groupKey: group.key }`
for the bridged case. The underlying stored row (and its `id`, which a decision op still targets) is never
rewritten; only the in-memory copy handed to callers is remapped, preserving D-6's "no rewrite of
historical rows."

**Found by:** `tests/e2e/setGroups.spec.ts`'s legacy-conversion test — the assertion
`page.getByText("Top: Increase load: 142.5 kg")` failed with the recommendation visibly present but
missing its label; tracing why led directly to the `groupKey: null` on the returned object.

### 5.4 B-4 — `getActiveSession`'s cross-device-resume recommendation lookup used the wrong key format

**Where:** `src/server/today/service.ts`'s `getActiveSession` (serves `/api/active-session` and every
`hydrateFromServer`/adopt/resume call on the client).

**Symptom, three related gaps in the same function, all pre-dating this remediation pass:**

1. `recommendation: recommendationForDeload(session.isDeload, recommendationByExercise.get(e.exerciseId)
   ?? null)` — `recommendationByExercise` (from `getSessionRecommendationsByExercise`) has been keyed by
   the composite `exerciseGroupKey(exerciseId, groupKey)` string since the *original* Stage A pass (per
   that pass's own manifest: "`getSessionRecommendationsByExercise` ... now key their returned Map by
   `exerciseGroupKey` instead of bare `exerciseId`"). `exerciseGroupKey(id, null)` produces `"<id>:"` (with
   a trailing colon) — never equal to the bare `e.exerciseId` this lookup used. Cross-device resume of an
   in-progress session's pending or decided recommendation was **silently always `null`**, for every
   exercise, grouped or not — a real regression the original pass introduced and never caught, because no
   test asserted the positive case (a real recommendation actually appearing via this path).
2. `ActiveSessionSetDto` (the server-side type in this file) had no `groupKey` field at all, and the
   per-set mapping never selected `s.groupKey` — a cross-device resume of a grouped session's own logged
   sets lost every set's attribution, which would have broken `nextGroupSelection`'s recorded-count
   derivation on the resuming device (every group would read as 0 recorded, regardless of reality).
3. `ActiveSessionExerciseDto` had no `.recommendations` (plural) field and `getActiveSession` never
   populated one — a cross-device resume of a grouped, still-undecided session lost every group's
   recommendation entirely (not just mislabelled, as in B-3 — absent).

**Fix:** all three together — `groupKey: s.groupKey` added to the set mapping;
`recommendationByExercise.get(exerciseGroupKey(e.exerciseId, null))` for the singular; a new
`.recommendations` array populated per group via `resolveGroupRecommendation` (the same shared helper as
B-3's fix) when the frozen scheme is `groups`. The client-side normalization
(`normalizeActiveSessionExercise`/`normalizeActiveSessionSet` in `sync/activeSession.ts`) already
defaulted these fields defensively since the *initial* pass — the client was always ready to receive this
data; the server simply never sent it.

**Found by:** while investigating why B-3's fix didn't fully explain an intermediate observation during
debugging, tracing `getSessionRecommendationsByExercise`'s actual key format against every consumer;
confirmed as a real, previously-unexercised gap by grepping the existing test suite (`grep -rn
"getSessionRecommendationsByExercise|getActiveSession" tests/`) and finding no test that asserts a
non-null `.recommendation` result from `getActiveSession` for a genuinely pending record — only a
deload-must-be-null negative check existed. Two new dedicated integration tests now cover the positive
case directly (§1.6), and `today.spec.ts`'s pre-existing "a second browser session can resume into an
in-progress workout" E2E test (re-run in §6.4 and again as part of §6.3's full suite) exercises the same
path structurally.

---

## 6. Quality-gate evidence (final state, across all three passes)

### 6.1 Migration/schema evidence — not re-run

No schema or migration file changed in this remediation pass (§1.1) — `drizzle/0014_third_scream.sql` is
byte-identical to what the initial pass generated and verified. Per this task's own instruction ("repeat
migration/concurrency checks only where subsequent changes require it"), the initial pass's own migration
evidence (fresh `db:migrate` + `drizzle-kit check` + double `db:seed` against `gymapp_t_setgroups`, and the
gated `setRenumberConcurrency` suite against `gymapp_renumconc`, both dropped at the end of that pass) is
reused rather than re-run. It remains valid because nothing that evidence covers — the column definitions,
the rebuilt index, concurrent set-renumbering — was touched by anything in §1.2–§1.5 above.

### 6.2 Full quality gates, run at the end of the remediation pass (unchanged by the verification-completion pass — no source file changed in it)

```powershell
pnpm typecheck
# $ tsc --noEmit                                    (no output, exit 0)

pnpm typecheck:sw
# $ tsc -p tsconfig.worker.json --noEmit            (no output, exit 0)

pnpm lint
# $ eslint .                                        (no output, exit 0)

pnpm format:check
# All matched files use Prettier code style!        (exit 0, checked via pnpm exec prettier during
#                                                     the edit pass — no drift on final re-check)

pnpm test:unit
# Test Files  96 passed (96)
# Tests  1348 passed (1348)                          (exit 0; +12 over the initial pass's 1336 — 6 new
#                                                      groupEvaluation.test.ts reverse-bridge tests + 6
#                                                      new activeSessionGroups.test.ts tests)

pnpm test:integration
# Test Files  29 passed | 6 skipped (35)
# Tests  490 passed | 17 skipped (507)                (exit 0; +8 over the initial pass's 482 — the 8
#                                                       new setGroups.integration.test.ts tests; skips are
#                                                       the gated *_CONCURRENCY_DATABASE_URL suites,
#                                                       unset in an ordinary run, per §6.1)

pnpm build
# ✓ Compiled successfully
# ✓ Generating static pages (40/40)                  (exit 0)
```

### 6.3 Required full end-to-end evidence — `pnpm test:e2e`, the complete suite, isolated disposable Postgres, current CI bootstrap

An earlier version of this report ran only a manually-selected subset of E2E specs (the new Set Groups
specs plus a targeted handful of pre-existing ones judged most relevant) and presented that as sufficient
E2E evidence. **It was not** — the task requires the full `pnpm test:e2e` suite, and a curated subset
cannot stand in for it regardless of how the subset was chosen. This section is that full-suite run,
against a second, freshly-created isolated disposable database, on the final code tree (no source file
changed between this run and the tree described everywhere else in this report), following the same CI
bootstrap sequence as `.github/workflows/ci.yml`'s `offline-e2e` job:

```powershell
& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" exec gym-app-db-1 psql -U gymapp -d gymapp -c "CREATE DATABASE gymapp_e2e_full;"
# CREATE DATABASE

$env:DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_e2e_full"
pnpm db:migrate
# [✓] migrations applied successfully!

pnpm db:seed
# Seed complete.                                     (first pass — muscle groups, volume presets only)

pnpm exec playwright test tests/e2e/smoke.spec.ts
# 1 passed (42.0s)                                    (builds + starts a fresh production server via
#                                                       playwright.config.ts's webServer, bootstraps the
#                                                       one allowed account through the real app — ADR-004)

pnpm db:seed
# Seed complete.                                     (second pass — imports the new account's catalog)

pnpm exec tsx tests/e2e/seed.ts
# E2E seed ready: user=... program=... template=... block=...

pnpm test:e2e
# Running 160 tests using 1 worker
# ... (all 160 lines "ok", none "x")
# 160 passed (3.8m)
# [exited with code 0]

& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" exec gym-app-db-1 psql -U gymapp -d gymapp -c "DROP DATABASE gymapp_e2e_full;"
# DROP DATABASE
```

**Exact accounting:** `pnpm test:e2e` (`playwright test` with no arguments, `testDir: "./tests/e2e"`)
discovered and ran **every** `*.spec.ts` file under `tests/e2e/` — **39 spec files** (37 pre-existing +
the 2 this pass added, `setGroups.spec.ts` and `setGroupsOffline.spec.ts`), comprising **160 individual
tests**. Playwright's own summary line reads `160 passed (3.8m)`; **0 failed, 0 skipped, 0 flaky**, exit
code 0. Confirmed by cross-checking the run's own output for distinct spec-file references
(`grep -oE "tests.e2e.[A-Za-z0-9._-]+\.spec\.ts" | sort -u | wc -l` → 39) against every `.spec.ts` file
`Glob` finds on disk (also 39) — no file was silently excluded from discovery, and no test within any
file was skipped or excluded.

**No failures were found, so there was nothing to diagnose as Stage-A-attributable versus external/
pre-existing** — the boundary question the task asked to be established, if a failure occurred, does not
arise here because the full suite is clean on the final tree. This full run supersedes the earlier
partial-subset evidence for the purpose of satisfying the E2E requirement; §6.4 keeps that earlier,
smaller run's own record intact below because it is where bugs B-1–B-4 (§5) were actually found — it is
retained for provenance, not offered as a substitute for this section.

### 6.4 Preliminary, targeted E2E evidence from earlier in this pass (superseded by §6.3; retained for provenance)

Before the full-suite run in §6.3, this pass ran a smaller, hand-selected set of specs while building and
debugging the new Set Groups coverage — this is where bugs B-1 through B-4 (§5) were actually found and
their fixes first validated, so the record is kept rather than deleted, but it does **not** by itself
satisfy the task's full-suite requirement, and is not offered as if it did:

```powershell
& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" exec gym-app-db-1 psql -U gymapp -d gymapp -c "CREATE DATABASE gymapp_e2e_setgroups;"
$env:DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp_e2e_setgroups"
pnpm db:migrate
pnpm db:seed
pnpm exec playwright test tests/e2e/smoke.spec.ts        # 1 passed — bootstraps the account
pnpm db:seed
pnpm exec tsx tests/e2e/seed.ts

pnpm test:e2e:offline
# 34 passed (2.0m)                                    (the CI-defined deterministic offline/PWA subset —
#                                                       see §6.5 for the contamination this first
#                                                       surfaced, and the re-run that produced this
#                                                       clean result)

pnpm exec playwright test tests/e2e/setGroups.spec.ts tests/e2e/setGroupsOffline.spec.ts tests/e2e/progression.spec.ts
# 5 passed (47.0s)

pnpm exec playwright test tests/e2e/today.spec.ts tests/e2e/set-deletion.spec.ts tests/e2e/deload.spec.ts
# 6 passed (45.6s)

& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" exec gym-app-db-1 psql -U gymapp -d gymapp -c "DROP DATABASE gymapp_e2e_setgroups;"
```

This totals 45 individual tests across 12 of the 39 spec files (the `test:e2e:offline` CI subset's own
14 files, plus 5 more chosen because they most directly exercise the functions this pass modified —
`getActiveSession`, `buildClientRecommendationOps`, `buildTodayBundle`, `buildSetDeletionOps` — with the
2 new Set Groups files counted once, not twice, across the two commands). The remaining 27 spec files
(volume, metrics, warm-up routines, muscle taxonomy, the strength page, exercise/measurement-profile
forms, recovery check-in, and others) were not run at this stage — they are the ones §6.3's full run
covers for the first time in this pass.

### 6.5 A contamination this pass caused and fixed, disclosed for transparency

While iterating on `tests/e2e/setGroups.spec.ts` during the preliminary work in §6.4 (fixing the
locator/page-navigation bugs described in §8), an early run of the "full workout lifecycle" test hit
Playwright's default 30-second test timeout mid-flow (before `test.setTimeout(120_000)` was added) and was
killed by Playwright before its own `finally` block's `restoreSchedule`/`archiveTemplate` calls had time
to complete. This left the shared E2E account's block schedule pointing at one of this pass's own
temporary grouped templates instead of `tests/e2e/seed.ts`'s own `"E2E Phase 3 Day"` template. The
**first** `pnpm test:e2e:offline` run in §6.4 (12 of 34 specs failing, all with the identical shape — "log
a set, the expected text never appears" — because every one of those specs assumes the seed's plain
`fixed` scheme and got a `groups` scheme instead) was this contamination surfacing in specs this task's
own code changes never touched.

Diagnosed by querying the disposable database directly (`block_schedule_entries.template_id` pointed at a
non-archived `"E2E SG Lifecycle ..."` template, not the seed template), fixed with one `UPDATE` restoring
the correct `template_id`, and the four orphaned non-archived templates from that same failed-run chain
were archived directly for hygiene. The **second** `pnpm test:e2e:offline` run (§6.4, quoted above) is the
clean result, with the contamination's root cause (the missing `test.setTimeout`) already fixed in the
spec file before that second run — and before §6.3's full-suite run, which used an entirely separate,
freshly-created database (`gymapp_e2e_full`, never touched by this contamination) and encountered it not
at all. This is disclosed here in full because the §6.4 failure output would otherwise read as if this
pass's production changes broke 12 unrelated specs, which they did not — the contamination was entirely
this pass's own test-development process acting on a disposable fixture, never a product defect.

---

## 7. Deviations, limitations, and Stage B extension point (final state)

### 7.1 Remaining deviations flagged for independent review

**Superseded in part by the targeted Stage A remediation pass — see the dated M-1…M-6/L-1…L-9 disposition
section near the end of this report.** The independent review (`docs/reviews/set-groups-stage-a-review.md`)
assessed the three items below and, among other findings, required M-3 to close the first one outright.
The text immediately below is kept exactly as originally written, for chronology — it describes the state
this pass's own report first disclosed, before that review. Current status: the two-save authoring item is
**closed** (M-3 — per-group overrides are now addressable by array index before a group has a server-
assigned key); the missing add/remove/reorder browser coverage is **partially closed** (the new M-3 E2E
test adds a group to an existing prescription through the real form; remove/reorder still have no browser-
level coverage); the reverse-conversion pending-record asymmetry is **retained, now with an invariant
pinned by a test** (L-7 — an integration assertion that neither the bundle nor `getActiveSession` ever
surfaces a non-null-key record for a reverse-converted, now-ungrouped slot), not a symmetric write-time
supersede, which the review explicitly did not require for Stage A.

The three items below are recorded as **the implemented approach**, not as justified or inevitable
outcomes — each is a real design/coverage choice this pass made under time and scope constraints, and
whether it is acceptable is for the reviewer to assess, not something this report should pre-decide by
framing it as unavoidable.

**Two-save authoring for a new per-group progression override.** As implemented, a brand-new group's
per-group progression override cannot be set in the same save that creates the group: the server assigns
the group's key only on that first save (§4.2), and this pass's client never addresses an override by
anything other than that server-assigned key — so the override control is hidden (with an explanatory
placeholder, "Save this group once to set a custom progression strategy for it.") until a follow-up edit,
at which point the group has a key and the control appears. This means authoring a new grouped
prescription whose fixed-rep group needs rep-progression's required repCap takes two ordinary saves
through the form rather than one. `tests/e2e/setGroups.spec.ts`'s authoring test exercises exactly this
two-save flow and passes doing so — it is a working, tested path, not a broken one — but it is a real
UX cost this pass chose to accept rather than solve (e.g., by having the client provision a local
placeholder key and remap it after the server assigns the real one, or by restructuring the create flow
into an atomic two-phase save) within the time available. Recorded here for the reviewer to judge whether
the trade-off is acceptable for Stage A or should be revisited before wider use.

**Missing browser-level coverage of group add/remove/reorder.** Only the per-group progression-override
authoring flow was driven through a real browser in this pass's new Playwright coverage. Adding a group
past the default two, removing one, and reordering them are covered at the unit level (`assignGroupKeys`,
the schema's group-count/key-uniqueness invariants) and the integration level (group removal, via §4.5's
existing test) but not through the actual form UI in a browser. This is an honest gap in the required
Playwright surface for authoring, not a claim that the controls are broken — no evidence either way beyond
the lower-level tests exists for their in-browser behavior. The reviewer should treat this as unverified at
the browser level, not as verified-by-inference from the unit/integration coverage.

**Reverse-conversion pending-record handling is asymmetric with the forward direction, by choice, not by
architectural necessity.** The forward (ungrouped→grouped) direction actively supersedes a stale
pre-conversion pending recommendation once a group's own key produces a fresh evaluation (D-6's
write-time-supersede, unchanged from the initial pass). The reverse (grouped→ungrouped) direction this
pass added does **not** implement an equivalent write-time supersede for a stale, non-null-keyed pending
record left over from before a reverse conversion — that record is simply left in the database, orphaned.
It is not surfaced to any current UI (the ungrouped bundle's own pending-recommendation lookup only ever
reads the null-group key, so the orphaned row is invisible under today's read paths), but it is also not
cleaned up, and no test proves it stays invisible under every future code path that might read
recommendations more broadly. This was a scope decision — the task's required item 3 named carry-forward
and progression history specifically, and the architecture's own §5.6 does not specify a reverse
write-time mechanism — not a demonstration that a reverse supersede is unnecessary or that the current
asymmetry is safe indefinitely. The reviewer should treat this as an open design question, not a closed
one.

### 7.2 Other disclosed scope boundaries

**Explicit Stage B non-implementation (unchanged from the initial pass — confirmed still absent):** no
`load.mode: "percentOfGroup"` field, no link resolver, no `ref` field, no ADR-008 fenced-exception
validation, no editor controls for a load mode or reference group, no usage-gate between stages.

**No E2E coverage of a duration/reload-persisted mid-session `isWarmup` toggle for a grouped slot
specifically** — the pure warm-up-exclusion behavior is covered (§1.6's lifecycle test logs a warm-up set
and asserts it doesn't count or advance), but a reload immediately after a warm-up-only log, before any
work set, was not separately exercised for the grouped case. The general (ungrouped) equivalent is covered
by the pre-existing `warmupSetClassification.spec.ts`, re-run as part of the full suite in §6.3.

**No production migration, no staging, no commit, no push, no deployment** — none attempted, none
available. This report and every file it lists exist only in this local, uncommitted working tree.

**`assignGroupKeys` trusts a client-supplied group key verbatim (independent review L-8, noted, not
fixed).** A submitted key on an update is echoed back with no check that it belongs to the stored scheme,
so a hand-crafted PATCH could swap two groups' keys (and thereby their histories) or adopt an arbitrary
token. The review's own disposition for this finding is "note only" — it is unreachable through the
editor and this is a single-user application — and this report records it on exactly that basis. The
targeted remediation pass's M-3 fix (`groupOverridesByIndex`, resolved server-side after `assignGroupKeys`
runs) maps DRAFT groups with no key yet to their server-assigned key by array position; it does not
validate an ALREADY-KEYED group's client-submitted key against the stored scheme, so it does not close
this gap and is not claimed to. Optionally validating submitted keys against the stored scheme on update
remains open, per the review, as future hardening only.

---

## 8. Deviations from the plan encountered while executing this pass

Two locator/timing mistakes in the new Playwright specs themselves were found and fixed while iterating
(not product bugs — recorded for completeness since the task asked for actual deviations, not merely
production-code ones):

1. **Duplicate/split-text locators.** `SetRow`'s group-label prefix renders in a nested `<span>`, sibling
   to the rest of the line's text — `page.getByText("Back-off · 110 kg × 7", { exact: true })` never
   matches an exact string spanning that boundary, and two Back-off sets legitimately share the same
   rendered line. Fixed by switching to `page.locator("li:not(:has(li))").filter({ hasText: ... })`
   (substring, leaf-row scoped) — the same convention `offline-set-edit-delete.spec.ts` and
   `measurementProfiles.spec.ts` already use for their own edit-row addressing — and asserting on row
   **counts** per group rather than exact reconstructed strings.
2. **A `page.reload()` on the wrong page.** After the History-screen correction step, the test called
   `page.reload()` (intending to return to a fresh Today) while `page` was still on `/history/:id` —
   reloading the History page itself, which has neither a "Start workout" nor a "Discard it & start
   fresh" button, so `ensureNoActiveSession`'s `Promise.race([...waitFor()])` hung indefinitely. Fixed by
   `page.goto("/today")` instead of a bare reload.

Both were caught by the test genuinely hanging/failing against the real running server, not merely
inferred — exactly the debugging loop real browser-level testing is supposed to force.

---

## 9. Resource cleanup

**Created by the initial pass, already dropped (unchanged from the superseded report):** `gymapp_t_setgroups`,
`gymapp_renumconc`.

**Created by the remediation pass, dropped:**
- `gymapp_e2e_setgroups` (Postgres, real Docker instance) — dropped at the end of §6.4's run.
- Four orphaned, non-archived `"E2E SG Lifecycle ..."` templates left behind by a timed-out early test
  iteration (§6.5) — archived directly before that database was dropped, for hygiene (though moot once the
  database itself was dropped).

**Created by this verification-completion pass, dropped:**
- `gymapp_e2e_full` (Postgres, real Docker instance, §6.3) — dropped after the full `pnpm test:e2e` run
  completed and its 160/160 result was recorded.
- A scratch log file (`e2e-full-run.log`, this session's own `tee` capture of the full run's console
  output, used only to cross-check the spec-file count in §6.3) — removed after that count was confirmed.

**Created by either pass, intentionally kept:** none — every PGlite instance is in-process and disposed
automatically; both isolated Postgres databases and every fixture inside them are gone.

**Not touched:** the `gym-app-db-1` Docker container itself (the repository's own persistent local dev
database, never used for this task's own database operations — only as the host for disposable
CREATE/DROP DATABASE calls), and every file/directory listed as "concurrent, untouched" in this report's
own header.

---

## 10. Documentation

No architecture documentation was changed in this remediation pass beyond what the initial pass already
wrote (`prescription-model.md`, `domain-model.md`, `data-model.md`, `progression-engine.md`,
`pwa-offline-strategy.md`, `evidence-to-design.md` — see the initial pass's own §16-mapped additions,
unchanged and still accurate, since none of this pass's fixes changed a documented contract: the reverse
bridge is the stated symmetric behavior of the same §5.6 rule the initial docs already describe; the
per-group progression override was already documented as domain/server-supported, only its UI exposure
was added; the four bug fixes correct implementation defects against an already-correctly-specified
contract, not the contract itself). ADR-008 remains untouched (Stage B scope). `docs/BACKLOG.md`/
`docs/STATUS.md`/`docs/ROADMAP.md` remain untouched (owner/closeout editor's step, per the initial pass's
own §16 item 8 reasoning, unchanged).

---

## 11. Not done, not claimed

- **Not implemented:** Stage B in full (§7.2) — no `percentOfGroup` load mode, no link resolver, no
  editor controls for it, no ADR-008 amendment.
- **Implemented as a two-save flow, flagged for review (§7.1):** a brand-new group's progression override
  cannot be set in the same save that creates the group — it requires a follow-up edit, once the server
  has assigned the group's key. This is the approach taken, not a claim that it is the only possible one.
- **Not implemented, flagged for review (§7.1):** a reverse-direction (grouped→ungrouped) write-time
  supersede of a stale pending recommendation orphaned by a conversion. The record is left in place,
  invisible under today's read paths, but not proven safe under every future one.
- **Not executed at the browser level, flagged for review (§7.1):** the prescription editor's group add/
  remove/reorder controls (covered at the unit/integration level only).
- **Not executed:** a grouped-slot-specific mid-session warm-up-then-reload E2E case specifically (the
  general, ungrouped equivalent is covered by the pre-existing `warmupSetClassification.spec.ts`, run as
  part of the full suite in §6.3).
- **Not authorized and not attempted:** any production database access, any staging deployment, any
  commit, any push. This report and every file it lists exist only in this local, uncommitted working
  tree.
- **Not claimed:** that this report's acceptance mapping (§3) or the four bug fixes (§5) are the last
  defects a further independent review will find — this pass closed every gap and fixed every bug it
  found while doing so, in good faith and with direct evidence for each, but does not claim exhaustive
  certainty beyond what the quoted commands and their exit codes actually demonstrate.
- **Not claimed:** device (iPhone) acceptance, or that the combined feature is "delivered" beyond what
  this local, uncommitted implementation and its quoted test evidence support.

READY FOR INDEPENDENT SET GROUPS STAGE A REVIEW

---

## 12. Targeted Stage A remediation pass — independent review M-1…M-6/L-1…L-9 (dated 2026-09-13)

**Session:** `Address: docs/reviews/set-groups-stage-a-review.md` (this document's continuation).
**Binding baseline:** the verified architecture and its own §19 ("Owner decisions — accepted 2026-09-12",
`docs/reviews/set-groups-architecture-evaluation.md`), per the task's explicit instruction. **Corrected —
independent verification V-6:** §19 belongs to the architecture evaluation document, not to any review
document; the citation below and everywhere else in this report is to that document specifically, not "the
review." Stage B remains excluded. `docs/reviews/set-groups-stage-a-review.md` and the four
architecture-lineage review documents are unmodified by this pass — verified by `git status` before and
after (only this report and the task-owned source/test files listed in §12.2 changed).

### 12.1 M-1…M-6 / L-1…L-9 disposition table

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| M-1 | Historical group definitions judged against today's group, not the frozen one | **Closed.** `buildGroupHistory` (`groupEvaluation.ts`) now resolves a grouped historical entry's group by KEY from that entry's own frozen `prescribed.scheme`, using its own `sets.min` window and its own `targetRir` (falling back to the entry's own slot `targetRir`, never today's). The specified legacy (ungrouped-history) fallback is unchanged. | `groupEvaluation.test.ts` — 5 new tests (raised min, lowered min, week-modifier-raised min via a real snapshot, targetRir override, targetRir slot-fallback). `setGroups.integration.test.ts` — "M-1 — a week-modifier-raised group min never retroactively fails an earlier session frozen at the original min" (real `applySyncBatch` completion, `decrease_load`/`hold` boundary). |
| M-2 | A manual slot default suppressed a non-manual group override in both candidate filters | **Closed.** New shared `hasEvaluableStrategy(snapshot)` (`groupEvaluation.ts`) replaces the bare `strategyId !== "manual"` check in both `server/progression/service.ts`'s `assembleAndEvaluate` and `sync/activeSession.ts`'s `buildClientRecommendationOps` — a `groups` scheme is evaluable if ANY group's effective strategy is non-manual. | `activeSessionGroups.test.ts` — "M-2 — a manual SLOT strategy with a non-manual GROUP override still evaluates that group when completing offline" (real `startSession`/`logSet`/`completeSession`, not `evaluateSession` in isolation). `setGroups.integration.test.ts` — "M-2 — a manual SLOT strategy with a non-manual GROUP override still progresses that group, through a real completion". |
| M-3 | Per-group progression override unreachable in one save for a brand-new group | **Closed.** New `groupOverridesByIndex` field on `progressionInputSchema` (`domain/prescriptions/schema.ts`) addresses a draft group with no key yet by its array POSITION; `server/prescriptions/service.ts`'s `toRawProgressionInput` resolves it onto the server-assigned key AFTER `assignGroupKeys` runs and merges it into the by-key `groups` map (a key-addressed override always wins for the same key — the two are never expected to collide). Persistent key generation stays entirely server-owned. `PrescriptionForm.tsx` submits both maps and no longer gates the per-group progression controls on the group having a key — they render unconditionally. No invented repCap default, no temporary-strategy requirement, no two-save workaround left for a supported configuration. | `setGroups.integration.test.ts` (`describe("M-3 …")`) — CREATE (a fixed-rep group's required repCap authored in the same save that creates it, via index), UPDATE-add (adding a group to an existing prescription, index-addressed override alongside an existing key-addressed one), UPDATE-reorder (a key-addressed override stays attached to its group after reordering, never to its array position) — 3 tests, real `createPrescription`/`updatePrescription`. `tests/e2e/setGroups.spec.ts` — the "prescription authoring" describe block rewritten: create-mode (two fixed-rep groups, both repCaps set in one save) and add-a-group-to-an-existing-prescription, both against a real browser/server. |
| M-4 | Both Set Groups specs missing from `test:e2e:offline`/CI | **Closed. Evidence wording corrected — independent verification V-4.** `package.json`'s `test:e2e:offline` script now appends `tests/e2e/setGroups.spec.ts tests/e2e/setGroupsOffline.spec.ts` to its existing 15-file list, unchanged otherwise; `.github/workflows/ci.yml`'s `offline-e2e` job runs this same script, so no separate CI edit was needed. **This row previously said "Run directly (`pnpm test:e2e:offline`, 17 files)" while §12.3.3 correctly said the command was not separately executed — a genuine internal contradiction, not a wording nuance.** Corrected here to state plainly: coverage for the 17-file `test:e2e:offline` list is inherited from the full `pnpm test:e2e` run (§12.3.3/§13.4) — the 17 files are a strict subset of that run's 39, on the identical tree and bootstrap, so a separate direct invocation would exercise strictly less than what the full run already covers. A-17's evidence (§3 above) is corrected by this section rather than edited in place, to preserve §3's own chronology; A-17's substantive claim (both specs passing) still holds and is now additionally backed by standing CI-equivalent coverage rather than a one-off local run. | §12.3.3 / §13.4 (full-suite run; 17 of its files are the `test:e2e:offline` list). |
| M-5 | Six task-owned files not `prettier`-formatted; report claimed a green `format:check` inaccurately | **Closed. File list and chronology both corrected — independent verification V-5.** The six files the review actually identified were `src/ui/prescriptions/PrescriptionForm.tsx`, `tests/e2e/setGroups.spec.ts`, `tests/e2e/setGroupsOffline.spec.ts`, `tests/integration/setGroups.integration.test.ts`, `tests/unit/setGroups/activeSessionGroups.test.ts`, and `tests/unit/setGroups/groupEvaluation.test.ts` — **not** the list this row previously named (`groupEvaluation.ts`, `applyWeekModifiersGroups.test.ts`, `setSchemeGroups.test.ts` were never part of the finding; the previous list also omitted `PrescriptionForm.tsx` and both E2E specs, which were the clearest cases — the two over-width lines the review quoted were in `PrescriptionForm.tsx`). All six of the review's actual files, plus every other task-owned file this pass touched or added (full list in §12.2), are formatted with `prettier --write`. `pnpm format:check` on the full tree is green (§12.3.1). **Chronology:** the review ran `format:check` on 2026-09-12, on the tree as it stood *before* this remediation pass existed, and found those six files already failing with genuine drift — §6.2's green claim was simply incorrect when it was written, not correct-then-drifted by this pass's own later edits (this report's prior wording claimed the latter, which cannot be true of a failure measured before this pass began). The substantive outcome — a green gate on the final tree — is unaffected and remains verified. | §12.3.1 (exact command + exit code). |
| M-6 | A grouped prescription showed one misleading slot-wide RIR band, or none | **Closed.** `formatScheme`/`formatGroup` (`domain/schemes/setScheme.ts`) take a new optional `slotTargetRir` parameter, used only by the `groups` case, rendering each group's OWN effective RIR band inline (`group.targetRir ?? slotTargetRir`) — the other four scheme types are byte-for-byte unaffected. `ExerciseCard.tsx`, `TodaySection.tsx`, `HistoryDetail.tsx` all pass `targetRir` through and suppress the old single slot-wide suffix for a `groups` scheme. The existing per-group RIR control (unchanged) is retained. | `setSchemeGroups.test.ts` — 4 new tests (the worked multi-group example, slot-level fallback when a group has no override, no-RIR-available case, non-`groups` schemes byte-identical). |
| L-1 | Offline per-group in-session decision overlay missing (server had it, client didn't) | **Closed.** `sync/activeSession.ts`'s `buildClientRecommendationOps` now branches on `snapshot.scheme.type === "groups"` and applies `applyInSessionDecisionsToGroupPrefills` (the per-group sibling of the existing ungrouped `applyInSessionDecisionToPrefill`, both in `domain/progression/evaluationTarget.ts`) — mirroring `server/progression/service.ts`'s own overlay branch-for-branch. | `activeSessionGroups.test.ts` — "L-1 — a modified in-session decision's chosen reps overlay this group's prefill during an offline completion, matching the server's own overlay": a group's pending rep-progression suggestion (8→10) is explicitly modified to 9 in-session; the offline completion's `inputs.derived.currentRepTarget` is asserted to be 9, not the frozen snapshot prefill of 8 — verified decisive by temporarily reverting the fix and confirming the assertion then fails (`8` instead of `9`). |
| L-2 | `targetRirShift` never reached a group's own `targetRir` override | **Closed.** New `applyTargetRirShiftToGroups` (`applyWeekModifiers.ts`) shifts ONLY a group's own `targetRir` override, exactly once; a group with no override is untouched by this function and picks up the week's shift solely through the slot's already-shifted band it falls back to at resolution time (`group.targetRir ?? snapshot.targetRir`) — no double shift. | `applyWeekModifiersGroups.test.ts` — 3 new tests (a group's own band shifts once, a group with no override is unaffected here and inherits the slot's shift elsewhere, the shift is clamped to [0,10] per group independently) — closing the A-7 gap the review's acceptance table flagged. |
| L-3 | Warm-up → `groupKey: null` not preserved through every edit path; no defence in depth on prefill | **Closed.** `server/sync/service.ts`'s `applySetLogUpsert` update path computes the edit's EFFECTIVE `isWarmup` and forces `patch.groupKey = null` when true, bypassing the ordinary `writable`/subsumption gate for that one field. **The batch-convergence justification originally given here — "safe for batch convergence — ops apply strictly in order in separate transactions, so a later explicit write still wins, and replay is deterministic" — is superseded by independent verification V-2 (§13.1) and must not be read as a current description of the mechanism.** All three of its clauses were disproved: a later op does NOT always win (the pre-V-2 code read a stale pre-batch `isWarmup` exactly when a later op governed it, discarding a legitimately-carried `groupKey`), and replay was consequently non-deterministic in that case (§13.1's V-2 row quotes the reproduction). The verified rule, as corrected by V-2 and now implemented, is: the forcing decision defers whenever a LATER op in the same batch will also touch `isWarmup` or `groupKey`, and is made instead by whichever op is provably the LAST to touch either field — that op's own read is always accurate, by induction over the subsumption chain (full argument and code reference in §13.1's V-2 row). `ExerciseCard.tsx`'s `SetRow` and `HistoryDetail.tsx`'s `HistorySetRow` both force `groupKey: null` client-side on their own edit submit when `isWarmup` is true. `groupSelection.ts`'s `groupPrefill` additionally excludes any warm-up set from the "last set logged in this group" chain regardless of its `groupKey` (defence in depth for a stale/pre-fix row). | `setGroups.integration.test.ts` — "L-3 — the server forces groupKey to null when an edit's effective isWarmup is true, regardless of what the payload's own groupKey says" (single-op case; §13.1's V-2 tests cover the multi-op/subsumption case this row's original justification got wrong). `groupSelection.test.ts` — 1 new test ("excludes a warm-up set even if it somehow still carries this group's key"). |
| L-4 | §4 undercounted `loadProgression.ts`'s changes; evaluation §10's "not changed" claim not flagged as a deviation | **Closed, report-only.** §4 above corrected in place (two guards, not one, for `loadProgression.ts`; `repProgression.ts`'s original one-guard-one-arm count was already accurate) with a note that `set-groups-architecture-evaluation.md` §10's "Not changed, deliberately" line is inaccurate for the same reason — that document itself is not edited (previous review reports kept intact). Both guards re-confirmed inert by inspection (same reasoning as before: each narrows a variant `evaluateSession`'s dispatch makes structurally unreachable; `STRATEGY_VERSIONS` unchanged). | §4 (corrected). No source change — `loadProgression.ts`/`repProgression.ts` remain untouched by this pass, re-confirmed by `git status` and the full regression suite. |
| L-5 | B-3's regression coverage (bridged `groupKey`) existed only outside CI | **Closed** (already fixed earlier in this pass, before the independent review; re-confirmed here). The existing C-1/D-6(a) integration test asserts `entry.pendingRecommendations` has one entry whose `groupKey === firstKey` for a bridged legacy record, in addition to the pre-existing `groupPrefills` assertion — and M-4 (above) now also puts `setGroups.spec.ts` (which exercises this same bridge end-to-end through a browser) into CI's own offline-e2e job. | `setGroups.integration.test.ts`'s C-1/D-6(a) test (3 lines added, re-run in §12.3.2). |
| L-6 | The history half of B-1's fix (`toPerformedSets` threading `groupKey`) untested for grouped history entries | **Closed.** `activeSessionGroups.test.ts` gained a decisive new test: a cached bundle (`setCachedBundle`) with ONE grouped historical session (both groups' sets tagged with real `groupKey`s, both a failing repeat of the current session's own facts) is seeded before `startSession`; the offline completion's per-group `historyDepthUsed` is asserted to be 1 (not 0) for both groups, and the resulting action is `decrease_load` (not `hold`/`INSUFFICIENT_HISTORY`) — reachable only if the cached history is correctly read and attributed per group. Verified decisive by commenting out the `setCachedBundle` call and confirming `historyDepthUsed` reads back 0. | `activeSessionGroups.test.ts`, new test in the offline-completion describe block. |
| L-7 | Reverse-conversion orphaned pending records: accurate disclosure, invariant unpinned | **Accepted for Stage A, invariant now pinned by a test — no symmetric write-time supersede added, per the review's own disposition.** A new integration test runs a grouped session to completion (creating two real pending recommendation rows keyed to each group), converts the prescription back to ungrouped, confirms both orphaned rows still exist untouched in the database (genuinely inert, not silently cleaned up), then starts a NEW ungrouped session and asserts neither `buildTodayBundle` nor `getActiveSession` ever surfaces a non-null-key recommendation for that slot. | `setGroups.integration.test.ts` — "L-7 — reverse conversion leaves old per-group pending records inert: neither the bundle nor getActiveSession ever surface a non-null-key recommendation for the now-ungrouped slot". |
| L-8 | `assignGroupKeys` trusts a client-supplied key verbatim | **Noted, not fixed — exactly the review's own "note only" disposition.** Recorded explicitly in §7.2 above. M-3's `groupOverridesByIndex` mapping addresses DRAFT groups with no key yet; it does not validate an already-keyed group's client-submitted key against the stored scheme, and is not claimed to close this gap. | §7.2 (new paragraph). |
| L-9 | Shared-fixture cleanup ran inside each test body's own `finally`, timeout-fragile | **Closed.** `tests/e2e/setGroups.spec.ts` and `tests/e2e/setGroupsOffline.spec.ts` both replace their per-test `try/finally` cleanup with a shared `test.afterEach` hook (its own timeout budget, separate from the test body's) plus an `owned: {templateId?, programInfo?}` resource-ownership tracker each test populates as it creates resources — the hook only ever touches what that specific test actually owns. | Both spec files re-run clean in **§12.3.3** (corrected citation — independent verification V-6; the E2E re-run evidence lives in §12.3.3, not §12.3.2, which is the unit/integration section) — 5/5 Set Groups E2E tests passing, including after a deliberately induced mid-test failure during this pass's own debugging, which confirmed the hook still archived the owned template. |

### 12.2 Exact manifest — files touched in this remediation pass

**Domain:**
- `src/domain/progression/groupEvaluation.ts` — M-1 (`buildGroupHistory` rewritten to resolve a
  historical group by key from its own frozen snapshot), M-2 (new `hasEvaluableStrategy`).
- `src/domain/progression/evaluationTarget.ts` — read only, not modified this pass (`applyInSessionDecisionsToGroupPrefills`
  already existed from earlier in the same overall session; L-1's fix is entirely in `activeSession.ts`'s
  new call to it).
- `src/domain/prescriptions/schema.ts` — M-3 (`groupOverridesByIndex` field on `progressionInputSchema`).
- `src/domain/prescriptions/applyWeekModifiers.ts` — L-2 (new `applyTargetRirShiftToGroups`, wired into
  `applyWeekModifiersToPrescription`).
- `src/domain/schemes/setScheme.ts` — M-6 (`formatScheme`/`formatGroup` gain an optional `slotTargetRir`
  parameter; the four non-`groups` scheme types are unaffected).

**Server:**
- `src/server/progression/service.ts` — M-2 (`assembleAndEvaluate`'s candidate filter now calls
  `hasEvaluableStrategy`).
- `src/server/prescriptions/service.ts` — M-3 (new `toRawProgressionInput` helper, wired into both
  `createPrescription` and `updatePrescription`).
- `src/server/sync/service.ts` — L-3 (`applySetLogUpsert`'s update path forces `patch.groupKey = null`
  when the edit's effective `isWarmup` is true, bypassing the ordinary field-writable gate for that one
  case).

**Client (sync):**
- `src/sync/activeSession.ts` — M-2 (`buildClientRecommendationOps`'s pre-filter calls
  `hasEvaluableStrategy`), L-1 (the per-group in-session-decision overlay branch). One unused type import
  (`InSessionDecision`) left behind by an earlier edit was removed during this pass's own final lint pass.

**UI:**
- `src/ui/prescriptions/PrescriptionForm.tsx` — M-3 (submits both `groupsProgressionOverride` (by key) and
  `groupOverridesByIndex` (by array index); the per-group progression controls are no longer gated on the
  group having a key).
- `src/ui/workout/ExerciseCard.tsx` — M-6 (passes `targetRir` into `formatScheme`), L-3 (`SetRow`'s edit
  submit forces `groupKey: null` when `isWarmup` is true).
- `src/ui/today/TodaySection.tsx` — M-6 (same pattern as `ExerciseCard.tsx`).
- `src/ui/history/HistoryDetail.tsx` — M-6 (passes `targetRir` into `formatScheme`), L-3 (`HistorySetRow`'s
  edit submit forces `groupKey: null` when `isWarmup` is true).
- `src/ui/workout/groupSelection.ts` — L-3 (`groupPrefill`'s filter additionally excludes any warm-up set,
  defence in depth).

**Tests (unit):**
- `tests/unit/setGroups/groupEvaluation.test.ts` — +5 M-1 tests (26 total).
- `tests/unit/setGroups/activeSessionGroups.test.ts` — +1 M-2 test, +1 L-1 test, +1 L-6 test (9 total,
  up from 6).
- `tests/unit/setGroups/setSchemeGroups.test.ts` — +4 M-6 tests (25 total).
- `tests/unit/setGroups/applyWeekModifiersGroups.test.ts` — +3 L-2 tests (8 total).
- `tests/unit/setGroups/groupSelection.test.ts` — +1 L-3 test (13 total).

**Tests (integration):**
- `tests/integration/setGroups.integration.test.ts` — +1 M-1 test, +1 M-2 test, +3 M-3 tests, +1 L-3 test,
  +3 lines to the existing C-1/D-6(a) test (L-5), +1 L-7 test (25 total, up from 18).

**Tests (E2E):**
- `tests/e2e/setGroups.spec.ts` — the "prescription authoring" describe block's two tests rewritten for
  M-3 (create-mode two-groups-one-save, add-a-group-to-an-existing-prescription); L-9's shared
  `afterEach`/resource-ownership refactor across all four tests in the file; two locator/validation fixes
  found and fixed while getting the rewritten authoring tests green against a real browser (§12.4).
- `tests/e2e/setGroupsOffline.spec.ts` — L-9's same `afterEach`/resource-ownership refactor.

**Build/CI:**
- `package.json` — M-4 (`test:e2e:offline` script gains the two Set Groups spec files, list otherwise
  unchanged).

**This report:**
- `docs/reviews/set-groups-stage-a-implementation.md` — §4 corrected (L-4), §7.1 annotated as superseded
  in part, §7.2 gained the L-8 note, and this §12 added.

### 12.3 Verification — final tree

#### 12.3.1 Quality gates

```
pnpm typecheck            # tsc --noEmit — clean
pnpm typecheck:sw         # tsc -p tsconfig.worker.json --noEmit — clean
pnpm lint                 # eslint . — clean (0 errors, 0 warnings; one unused-import warning found and
                           # fixed during this pass: src/sync/activeSession.ts's leftover `InSessionDecision`
                           # type import)
pnpm exec prettier --write <the six files M-5 identified, plus every other task-owned file this pass
                           # touched — full list in §12.2>
pnpm format:check          # prettier --check . — clean on the full tree
```

#### 12.3.2 Unit and integration tests

```
pnpm test:unit             # 1364 passed, 0 failed, across 96 files (123 of the 1364 are Set Groups tests,
                           # across 10 files under tests/unit/setGroups/ — exact per-file counts in §12.2)
pnpm test:integration      # 497 passed, 17 skipped (pre-existing: concurrency tests that require a real
                           # Postgres, gated off under PGlite — unaffected by this pass), 0 failed, across
                           # 35 files (29 executed + 6 fully skipped); 25 of the 497 are in
                           # setGroups.integration.test.ts
```

Both re-run in full on the final tree, after every code and test change in §12.2, including the M-5
reformat. No regression outside the files this pass touched.

**Migration/schema evidence — inherited, not re-run.** None of this pass's changes touch
`src/db/schema/*`, `drizzle/*`, or any migration file (confirmed by `git status` and by the manifest in
§12.2 above, which lists only domain/server/client/UI/test files). The initial pass's own migration and
concurrency evidence (§6.1 of this report) remains the valid, unaffected basis for that surface; this
distinction — executed this pass vs. inherited from an earlier one — is stated explicitly per the task's
own instruction, not implied.

#### 12.3.3 Full end-to-end suite (satisfies both the updated offline subset and the full-suite requirement)

Isolated disposable Postgres (`gymapp_e2e_remediation`, dropped in §12.5), current CI bootstrap
(`pnpm db:migrate` → `pnpm db:seed` → `pnpm build` → `pnpm exec playwright test tests/e2e/smoke.spec.ts` →
`pnpm db:seed` → `pnpm tsx tests/e2e/seed.ts`), production build (`pnpm build && pnpm start`, the exact
`playwright.config.ts` `webServer` command).

```
pnpm test:e2e               # 161 passed, 0 failed, across 39 files (final, clean run)
```

`tests/e2e/setGroups.spec.ts` (4 tests) and `tests/e2e/setGroupsOffline.spec.ts` (1 test) are both included
in this run and both pass. `test:e2e:offline`'s 17-file list is a strict subset of these same 39 files, so
this one full run is reused to satisfy that required command too, per the task's own "reuse one full run
where it satisfies multiple criteria" instruction — re-running the 17-file subset separately would exercise
strictly less than what the full run already covers with the identical final tree and identical bootstrap.

**Getting to that clean run — diagnosed, not glossed over.** The first full run against this pass's tree
showed 23 failures; each was individually diagnosed and is accounted for below, not weakened or excluded:

- **19 failures — this task's own environment mistake, not a product or Set Groups defect.**
  `tests/e2e/metrics.spec.ts` (12), `muscleTaxonomyV2.spec.ts` (4), and `strengthPage.spec.ts` (3) each
  call a test helper (`getE2eUserId`) that connects to Postgres directly from the Playwright test process
  itself (`src/db/client.ts`'s `getDb()`), not through the running server. `DATABASE_URL` was exported for
  the `db:migrate`/`db:seed`/`tests/e2e/seed.ts` bootstrap commands (each its own shell invocation) but not
  for the `pnpm test:e2e` invocation itself — the running Next.js server still read the correct database
  from `.env.local` (which Next.js loads automatically), but the bare Playwright/Node test process does
  not load `.env.local`, so any test calling `getDb()` directly threw `DATABASE_URL is not set`. Fixed by
  exporting `DATABASE_URL` for the same shell invocation as `pnpm test:e2e` itself (matching how
  `.github/workflows/ci.yml`'s `offline-e2e` job sets it once at the job level, inherited by every step) —
  no source or test file needed a change for these 19.
- **1 failure — `tests/e2e/volume.spec.ts`** — the same `getE2eUserId`/`DATABASE_URL` cause as above,
  folded into the same fix.
- **2 real test bugs in this pass's own M-3 rewrite of `tests/e2e/setGroups.spec.ts`, found and fixed:**
  (1) `getByLabel("Progression strategy")` is a substring match; M-3's fix unconditionally renders each
  group's own "Progression strategy for this group" select (previously gated on the group having a key,
  so absent in these tests before M-3), so the same locator that used to resolve one element now resolves
  two or three. Fixed by scoping to `.last()` — the slot-level field is rendered after every group card in
  the form, so it is reliably the last match regardless of group count. (2) The "adding a group" test
  switches the SLOT strategy to rep-progression, which also makes the pre-existing "Top" group (fixed-rep,
  no override of its own) require its own `repCap` now — its `<input required>` silently blocked the
  native form submit (no navigation, no visible error) because the test never filled it. Fixed by filling
  Top's own repCap alongside the new group's, matching what a real user would actually have to do. Both
  are genuine test gaps this pass's own rewrite introduced, not product defects — the product's "each
  group's repCap is required exactly when its effective strategy needs one" behavior is correct and is
  exactly what M-3 asked for.
- **1 dead-lettered failure in `tests/e2e/setGroupsOffline.spec.ts`, observed once, cause unresolved —
  corrected here per independent verification V-3; the paragraph immediately below is this bullet's
  original wording, quoted verbatim because it was wrong on the substance, not merely imprecise, and is
  retained only so the correction is checkable against what it replaces.**

  > *Superseded, retained for provenance only — do not rely on this paragraph:* "1 apparent failure that
  > did not reproduce — established as pre-existing/environmental, not a Set Groups defect... This pattern
  > ... is consistent with load-sensitive timing margins in a long, fully-sequential (`workers: 1`)
  > 161-test browser suite, not a defect in this pass's own Set Groups code — neither flake ever touched a
  > Set Groups file, and Set Groups' own 5 tests passed in every one of the five full runs executed during
  > this verification." **Both the "environmental/timing-margin" framing and the closing sentence are
  > withdrawn.** A `dead` count is terminal — an op that dead-lettered was rejected by the server, and no
  > amount of additional waiting or elapsed time clears it — so a timing-margin explanation cannot account
  > for it regardless of how the surrounding suite is scheduled; that framing was never supportable for
  > this specific failure and should not have been asserted. The closing sentence is additionally
  > self-contradicting on its own terms: it claims Set Groups' 5 tests passed in every one of five runs in
  > the very bullet that, two sentences earlier, reports `setGroupsOffline.spec.ts` (one of those 5) failing
  > on the second run. That sentence is false and is deleted, not merely re-labelled.

  **Corrected account.** On the second full run (after the two fixes above), `tests/e2e/setGroupsOffline.spec.ts`
  failed once with an unexpected dead-lettered outbox op after reconnecting — **this is the one and only
  observed occurrence; its cause is unresolved.** On the third full run (same tree, no further changes),
  that test passed cleanly, and a different test in a different, unrelated spec —
  `offline-bodyweight-recovery.spec.ts`'s "no live read, no same-day cache: touching only sleep hours saves
  and converges on reconnect without fabricating the other three metrics" test (line 193 of that file; this
  bullet previously misnamed it "C-5", which is a separate test in the same spec, at line 282, that passed
  in the same run — corrected per independent verification V-3(c)) — failed instead, with a 5-second
  visibility timeout, then passed cleanly when re-run in isolation immediately after.

  Separating the observation from the reproduction attempts, precisely: the `setGroupsOffline.spec.ts`
  dead-letter was observed exactly once, on the second full run described above. It was not reproduced on
  the third full run described above, nor on the final, clean run quoted at the top of this section
  (161/161), nor in this report's own residual-remediation full run (§13.4, 162/162). Independently, the
  two verification reports for this pass each attempted further reproduction and report it separately:
  `set-groups-stage-a-remediation-verification.md` (§2, V-3(d), 11 further executions: 5 isolated runs of
  `setGroupsOffline.spec.ts` plus 6 runs of the `test:e2e:offline` subset) and
  `set-groups-stage-a-remediation-verification-2.md` (§4.1 item 10, 1 further run of the 17-file
  `test:e2e:offline` subset) — a combined 12 further
  executions with no reproduction, reported there as their own evidence, not re-executed or independently
  confirmed here. The `offline-bodyweight-recovery.spec.ts` flake is a SEPARATE matter, independently
  corroborated as pre-existing and load-sensitive across both verification reports (three distinct tests in
  that file, each a visibility timeout, each passing in isolation) — that explanation is specific to that
  spec and does not transfer to the still-unresolved Set Groups dead-letter observation.

### 12.4 Remaining limitations (unchanged from or newly established by this pass)

- **Client-supplied group-key trust (L-8)** — noted in §7.2, not fixed. Unreachable through the editor,
  single-user application, per the review's own "note only" disposition.
- **Reverse-conversion asymmetry (L-7)** — accepted for Stage A, now with the read-path invariant pinned
  by an integration test; no symmetric write-time supersede was added, per the review's own instruction not
  to build it for Stage A.
- **Group add/remove/reorder still not covered by browser-level Playwright tests beyond "add"** — M-3's
  new E2E coverage exercises adding a group to an existing prescription through the real form; removing a
  group or reordering existing groups through the browser remains covered only at the unit/integration
  level (unchanged from §7.1's original disclosure, which this section supersedes only for the "add" case
  and the two-save flow it used to require).
- **Stage B** — still fully excluded, per the binding baseline. No `percentOfGroup` load mode, no link
  resolver, no ADR-008 amendment, nothing implemented toward it.
- **No production, staging, commit, or push** — none attempted, none available. Everything in this section
  exists only in the same local, uncommitted working tree as the rest of this report.

### 12.5 Cleanup

- Disposable Postgres database `gymapp_e2e_remediation` (created via `CREATE DATABASE ... OWNER gymapp` on
  the local `gym-app-db-1` container, migrated, seeded, and used exclusively for this pass's own E2E runs)
  — dropped (`DROP DATABASE gymapp_e2e_remediation`) after the final clean run in §12.3.3.
- `.env.local` — its `DATABASE_URL` line was temporarily pointed at the disposable database above for the
  duration of this pass's CI-bootstrap/E2E work. The file's exact original bytes were backed up
  (`sha256sum` recorded) before that edit; restored afterward and re-hashed to confirm an exact,
  byte-for-byte match against the pre-mutation backup before this pass concluded.
- Scratch log files and the backup copy of `.env.local`, both kept only in this session's own temp
  directory outside the repository, removed once no longer needed.
- Every other `gymapp_*` disposable database visible on the same local Postgres container
  (`gymapp_warmup_e2e`, `gymapp_e1rm_verify`, `gymapp_e1rm_remediation`, `gymapp_wuconc`,
  `gymapp_wu_rem_e2e`) predates this task, belongs to unrelated prior sessions, and was left untouched —
  only `gymapp_e2e_remediation`, created by this task, was dropped.
- No production access, no staging, no commit, no push, no deployment — none attempted.

READY FOR TARGETED SET GROUPS STAGE A REMEDIATION VERIFICATION

---

## 13. Targeted residual remediation — independent verification V-1…V-6 (dated 2026-09-13)

**Session:** `Remediate V-1…V-6 from the targeted PI-012 Stage A verification` (this document's continuation).
**Binding baseline:** the verified architecture and its own §19 ("Owner decisions — accepted 2026-09-12",
`docs/reviews/set-groups-architecture-evaluation.md`), consulted only where needed per the task's own
instruction not to reload the full historical review chain. Stage B remains excluded.
`docs/reviews/set-groups-stage-a-review.md`, `docs/reviews/set-groups-stage-a-remediation-verification.md`,
and the four architecture-lineage review documents are unmodified by this pass — confirmed by `git status`
before and after (only this report and the task-owned source/test files listed in §13.3 changed).

### 13.1 V-1…V-6 disposition table

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| V-2 | The L-3 server bypass reads a STALE pre-batch `isWarmup` whenever a later op in the same batch will overwrite it, breaking replay idempotence and able to discard a legitimately-carried `groupKey` | **Closed.** Validated the review's own candidate predicate by structural proof (not applied blindly): by induction over the subsumption chain, the op that is provably the LAST to touch `isWarmup` always has an accurate read — either directly from its own payload (never subsumed on that field) or, if it never touches `isWarmup` itself, from `existingRow`, which by then already reflects every earlier op's write within the same transaction, including whichever earlier op WAS the last toucher's already-committed final value. Deferring the forcing decision whenever a later op governs EITHER field never leaves the invariant unenforced — it only moves the decision to the op that can make it correctly. Implemented exactly as validated: `groupKeyForcedNull = effectiveIsWarmup === true && !laterFields?.has("isWarmup") && !laterFields?.has("groupKey")`. The misleading comment (which asserted "EFFECTIVE (post-patch) isWarmup" and "convergence… unaffected" — both false in the subsumed case) is replaced with one that states the actual mechanism and the inductive argument for its correctness. | `src/server/sync/service.ts:1140-1176`. `tests/integration/setGroups.integration.test.ts`'s new `describe("V-2 …")` block, 4 tests (§13.3). **Negative control executed:** reverted the predicate to the pre-fix single-line `effectiveIsWarmup === true`, re-ran the new suite — the primary reproduction test failed exactly as expected (`groupKey: null` instead of the batch's real key), the other three passed regardless (they exercise scenarios where the old and new logic happen to agree) — then restored the fix and re-confirmed all 4 pass, plus the full `setGroups.integration.test.ts` file (29/29) and `pnpm typecheck`. |
| V-1 | M-1's new "key absent in that session" branch (`groupEvaluation.ts:115`) left a raw, unprojected `groups` scheme on `entry.prescribed.scheme`, violating the §5.4 projected-scheme invariant NC-7 exists to guard — inert today only because `entryQualifiesForStreak` separately short-circuits on an empty `workSets` first | **Closed.** Changed the branch to `return { ...entry, prescribed: null, workSets: [] }` — honest (there is no faithful historical definition to judge that entry against) and it makes `entryQualifiesForStreak`'s own `!entry.prescribed` check the actual, self-documenting reason the entry never counts, rather than relying on the incidental empty-array guard. | `src/domain/progression/groupEvaluation.ts:113-129`. `tests/unit/setGroups/groupEvaluation.test.ts`'s new NC-7 extension test (27 total, up from 26). **Negative control executed:** reverted to the pre-fix `return { ...entry, workSets: [] }`, re-ran the file — the new test failed, asserting `prescribed` was the raw `{type: "groups", …}` scheme instead of `null` — then restored the fix and re-confirmed 27/27 plus `pnpm typecheck`. |
| V-3 | §12.3.3's flake accounting was internally contradictory (claims a `setGroupsOffline.spec.ts` dead-letter failure AND that "Set Groups' own 5 tests passed in every one of the five full runs"), its causal claim ("consistent with load-sensitive timing margins") does not fit a terminal `dead` count, and it mislabelled the separately-reproduced `offline-bodyweight-recovery.spec.ts` flake as its C-5 test when the real symptom was in the test at line 193. **The second independent verification (`set-groups-stage-a-remediation-verification-2.md` §3.1) additionally found: none of this had actually been corrected in §12.3.3 itself — every sentence this row previously claimed to have removed or fixed was still present verbatim, "unresolved" did not appear in §12.3.3 at all, and this row pointed to a correction block that did not exist.** | **Now genuinely closed — §12.3.3 itself is corrected in place, not merely asserted here.** The mechanism (done and verified previously): `waitForOutboxDrained` (`tests/e2e/helpers.ts`) captures the dead-lettered op's `entity` and `deadReason` into its own failure message when the zero-dead-letter assertion fails — the SAME assertion, same timeout, unweakened, un-retried, never cleared — so the next occurrence is diagnosable from the test's own output. No credential or payload field is read; only the entity name and the short, enum-like rejection reason. **The report correction (the part that was missing):** §12.3.3's relevant bullet now quotes its own original wording verbatim, explicitly marked superseded, immediately followed by a corrected account that removes the "environmental/timing-margin" framing, deletes the false "5 tests… every one of the five full runs" sentence outright, and fixes "C-5" to name the actual touching-only-sleep-hours test. The corrected account states the observation and the reproduction attempts as separate facts: observed exactly once; not reproduced on this pass's own subsequent runs (named individually) or in this residual pass's own run (§13.4); a combined 12 further executions across the two independent verification reports, each attributed to its own report rather than presented as this report's own evidence. | `tests/e2e/helpers.ts` (`readOutboxDeadLetters`, `waitForOutboxDrained`'s catch/re-throw). **Browser verification that the diagnostic path actually captures the relevant information:** a new E2E test in `tests/e2e/dead-letter.spec.ts` reuses the file's own deterministic `invalid_measurement` dead-letter mechanism (an injected incompatible `setLog` op on a `load_distance` slot — the exact fixture the file's second test already proves rejects deterministically), calls `waitForOutboxDrained` against that known-dead-lettered outbox, and asserts the thrown error's message contains both `"setLog"` and `"invalid_measurement"`. Passed in the full run (§13.4). **§12.3.3 itself, corrected in place** — see that section directly; this row is a summary of what changed there, not the correction's location. |
| V-4 | M-4's disposition row claimed a direct `pnpm test:e2e:offline` run that §12.3.3 says was never separately executed — an internal contradiction, not a wording nuance | **Closed.** M-4's row (§12.1) corrected to state plainly that the 17-file `test:e2e:offline` list's coverage is inherited from this pass's own full `pnpm test:e2e` run (§13.4) rather than claiming a direct invocation that did not happen — the coverage inference itself was and remains sound (17 files are a strict subset of the 39 run, identical tree, identical bootstrap). | §12.1 (M-4 row, corrected). §13.4 below (the full-suite run whose 17 relevant files ARE the `test:e2e:offline` list). |
| V-5 | M-5's row named the wrong six files (three of six overlap with what the independent review actually found) and its chronology claimed this pass's own edits caused format drift measured BEFORE this pass began | **Closed.** M-5's row (§12.1) corrected to the review's actual six files (`PrescriptionForm.tsx`, both E2E specs, `setGroups.integration.test.ts`, `activeSessionGroups.test.ts`, `groupEvaluation.test.ts` — omitting `groupEvaluation.ts`, `applyWeekModifiersGroups.test.ts`, `setSchemeGroups.test.ts`, which were never part of that finding) and restated to say §6.2's green claim was simply incorrect when written on 2026-09-12, not correct-then-drifted by a pass that began the day after. The substantive outcome (a green `format:check` on the final tree) is unaffected. | §12.1 (M-5 row, corrected). |
| V-6 | Four small cross-reference/attribution errors: §4's correction heading said "2025"; §12.1's L-9 row cited §12.3.2 (unit/integration) instead of §12.3.3 (E2E) for the E2E re-run; §12's header attributed §19 to "the review" when it belongs to the architecture evaluation document; §12.2's `evaluationTarget.ts` qualifier was fine as written (no change needed) | **Closed for the three real errors; the fourth confirmed correct as-is.** §4's heading now reads "2026-09-13" (this pass's actual date). §12.1's L-9 row now cites §12.3.3. §12's header now names `docs/reviews/set-groups-architecture-evaluation.md` explicitly rather than "the review." §12.2's `evaluationTarget.ts` line is unchanged — the review confirmed that qualifier ("read only, not modified this pass") is accurate for that pass and worth keeping. | §4, §12 header, §12.1 (L-9 row) — all corrected in place. |

### 13.2 Remaining limitations — carried forward, one closed

Unchanged by this pass, per the task's own instruction to retain previously accepted limitations unless
these fixes directly affect them:

- **L-8 — client-supplied group-key trust.** Unaffected by V-1…V-6. Still noted, not fixed.
- **L-7 — reverse-conversion asymmetry.** Unaffected. Still accepted for Stage A with the read-path
  invariant pinned.
- **Browser-level group remove/reorder.** Unaffected. Add is browser-covered; reorder identity is
  integration-covered; remove remains unit/integration only.
- **No grouped-specific warm-up-then-reload E2E case.** Unaffected.
- **Stage B** fully excluded. Unaffected — no Stage B surface was touched by V-1…V-6.
- **The `setGroupsOffline.spec.ts` dead-letter failure's cause remains genuinely unresolved** (V-3) — this
  pass instruments for the next occurrence rather than claiming to have found or ruled out a cause it did
  not observe again. Stated precisely, separating the observation from the reproduction attempts:
  **observed exactly once**, on the second full `pnpm test:e2e` run recorded in §12.3.3. **Not reproduced
  since**, in any of the following: the two subsequent full runs recorded in §12.3.3 (the third run and the
  final clean run), this pass's own full run in §13.4, or the combined 12 further executions reported
  separately by the two independent verifications (`set-groups-stage-a-remediation-verification.md`
  §2, V-3(d) and `set-groups-stage-a-remediation-verification-2.md` §4.1 item 10) — see §12.3.3 for the
  full account and
  citations.

**Closed by this pass:** the review's own "New, from this verification" item — *"No automated test
exercises the `writable`/subsumption interaction for `groupKey` at all… that gap should be closed, since
Stage B will add write paths to the same field"* — is closed by V-2's four new integration tests, which
exercise exactly that interaction (§13.1, §13.3).

### 13.3 Exact manifest — files touched in this pass

**Domain:**
- `src/domain/progression/groupEvaluation.ts` — V-1 (`buildGroupHistory`'s "key absent" branch now returns
  `prescribed: null`).

**Server:**
- `src/server/sync/service.ts` — V-2 (`applySetLogUpsert`'s `groupKeyForcedNull` now defers to a later op
  that governs either `isWarmup` or `groupKey`; comment corrected).

**Tests (unit):**
- `tests/unit/setGroups/groupEvaluation.test.ts` — +1 V-1 NC-7 extension test (27 total, up from 26).

**Tests (integration):**
- `tests/integration/setGroups.integration.test.ts` — +4 V-2 tests in a new
  `describe("V-2 — replay idempotence and legitimate groupKey preservation under intra-batch subsumption")`
  block (29 total, up from 25).

**Tests (E2E):**
- `tests/e2e/helpers.ts` — V-3 (`readOutboxDeadLetters`, `waitForOutboxDrained`'s failure-path
  diagnostics).
- `tests/e2e/dead-letter.spec.ts` — +1 V-3 browser verification test (3 total, up from 2).

**This report:**
- `docs/reviews/set-groups-stage-a-implementation.md` — §4 (V-6 heading date), §12's header (V-6
  attribution), §12.1's M-4/M-5/L-9 rows (V-4/V-5/V-6), and this §13.

No migration, `drizzle/*`, or `src/db/schema/*` file is touched by any of V-1…V-6 — confirmed by `git
status`/`git diff --stat` and by the manifest above.

### 13.4 Verification

**Focused regression, run first, in order:**

```
pnpm vitest run tests/unit/setGroups/groupEvaluation.test.ts        # 27 passed (V-1)
pnpm vitest run --config vitest.integration.config.ts \
  tests/integration/setGroups.integration.test.ts -t "V-2"          # 4 passed (V-2)
```

**Negative controls, both executed and both demonstrated the regression tests detect the broken
implementation** (reverted the exact source line, re-ran the relevant focused test, confirmed failure with
the exact defect the review described, then restored the fix and re-confirmed green — detailed per-finding
in §13.1's V-1/V-2 rows).

**Applicable repository-required gates, run on the final tree, after both fixes and all new tests:**

```
pnpm typecheck             # tsc --noEmit — clean
pnpm typecheck:sw          # tsc -p tsconfig.worker.json --noEmit — clean
pnpm lint                  # eslint . — clean, 0 errors, 0 warnings
pnpm format:check          # prettier --check . — clean, full tree
pnpm test:unit             # 1365 passed, 0 failed, 96 files (+1 from §12's 1364 — the V-1 test)
pnpm test:integration      # 501 passed, 17 skipped (same pre-existing concurrency-test skips as §12),
                            # 0 failed, 29 executed + 6 skipped files (+4 from §12's 497 — the V-2 tests)
```

**Full end-to-end suite — browser verification for V-3's changed diagnostics, plus a regression check that
neither fix disturbed the offline/PWA surface; one run, reused for the offline subset per this task's own
instruction. This is NOT the replay/subsumption evidence — see the correction directly under the run output
below.**

Isolated disposable Postgres (`gymapp_v1v6_remediation`, dropped in §13.5), current CI bootstrap identical
to §12.3.3's (`pnpm db:migrate` → `pnpm db:seed` → `pnpm build` →
`pnpm exec playwright test tests/e2e/smoke.spec.ts` → `pnpm db:seed` → `pnpm tsx tests/e2e/seed.ts`),
production build (`pnpm build && pnpm start`, the exact `playwright.config.ts` `webServer` command).
`DATABASE_URL` was exported per shell invocation for every command above, never written into `.env.local` —
adopting the independent verification's own recommendation (§3.4 of
`set-groups-stage-a-remediation-verification.md`) that this avoids mutating repository-adjacent
configuration at all, so there is nothing to back up or restore this time.

```
pnpm test:e2e               # 162 passed, 0 failed, across 39 files
```

**Correction (independent verification V-3, §3.3 of `set-groups-stage-a-remediation-verification-2.md`):**
this run is **not** evidence for V-2's replay/subsumption fix — V-2's defect is not reachable from any
shipped emitter, so no E2E run, this one included, could exercise it. **The replay/subsumption evidence is
the real `applySyncBatch`/SQL integration coverage in §13.1's V-2 row and the four tests in §13.3, together
with the executed negative control described there** — that is what this pass's own "real batch
replay/subsumption coverage" requirement (from the task that opened this section) refers to, and it is
already satisfied there, in full, before this E2E run is even considered. What this run genuinely
contributes is two things: (1) it **is** the required browser verification for V-3's changed diagnostics —
`tests/e2e/dead-letter.spec.ts`'s new test (line 393, 7.7s) passed, confirming `waitForOutboxDrained`'s
augmented failure message actually names `setLog`/`invalid_measurement` in a real browser against a real
server; (2) it **is** a regression check that `applySetLogUpsert`'s V-2 change did not disturb the
offline/PWA surface — `tests/e2e/setGroups.spec.ts` (4 tests) and `tests/e2e/setGroupsOffline.spec.ts`
(1 test) are both included and both pass, unaffected by V-1…V-6 (neither touches Set Groups' own domain
logic), and the other 37 files exercise the broader sync/offline paths `applySetLogUpsert` sits inside.
This run's 39 files include all 17 of `test:e2e:offline`'s list, so per V-4's correction and this task's
own "reuse a full-suite run where it covers the offline subset" instruction, that command's coverage is
inherited from this run rather than separately executed.

**Migration/schema evidence — inherited, not re-run, and correctly so.** None of V-1…V-6 touches
`src/db/schema/*`, `drizzle/*`, or any migration file (confirmed above). §12.3.2's own migration evidence,
and the initial pass's evidence it in turn inherits from, remain the valid, unaffected basis for that
surface — re-running it here would repeat unaffected checks without a reason, which the task explicitly
warned against.

### 13.5 Cleanup

- Disposable Postgres database `gymapp_v1v6_remediation` — dropped after the full E2E run above; confirmed
  gone from `pg_database`, and the five pre-existing databases from unrelated earlier sessions plus
  `gymapp` itself were present before and after and left untouched.
- `.env.local` — **not touched at all** this pass (see §13.4's bootstrap note); nothing to restore or
  re-hash.
- Two source-level negative-control mutations (V-1's and V-2's, both described in §13.1) were each made,
  exercised, and restored to their exact fixed text within the same short window, immediately re-verified
  by `pnpm typecheck` and the relevant test file after each restoration — not merely "restored," but
  restored-and-reconfirmed before moving on.
- Scratch E2E log file, kept only in this session's own temp directory outside the repository, removed.
- No production access, no staging, no commit, no push, no deployment — none attempted.

READY FOR TARGETED SET GROUPS STAGE A RESIDUAL VERIFICATION

---

## 14. Correction record — remaining documentary blockers (dated 2026-09-13)

Independent verification (`set-groups-stage-a-remediation-verification-2.md` §3) found that §13's own V-3
report-accuracy fix had not actually been applied to the section it named, and identified three further
in-place inaccuracies elsewhere in this report. This is a documentation-only pass: no source, test,
configuration, or database change of any kind; nothing built, run, staged, committed, pushed, or deployed.
The corrections below are edits to sections that already existed; this record states what changed and
where, not a new disposition table.

- **§12.3.3** — the bullet describing the `setGroupsOffline.spec.ts` dead-letter failure previously
  asserted it was "established as pre-existing/environmental," explained it as "consistent with
  load-sensitive timing margins," misidentified the co-occurring `offline-bodyweight-recovery.spec.ts`
  flake as its "C-5" test, and closed with a sentence claiming Set Groups' 5 tests passed in every one of
  five runs — which the same bullet's own preceding sentence already contradicts. That original wording is
  now quoted verbatim in place, explicitly marked superseded, immediately followed by a corrected account:
  the environmental/timing-margin framing is withdrawn (a terminal `dead` count cannot be a timing margin),
  the false closing sentence is deleted, "C-5" is corrected to the actual touching-only-sleep-hours test,
  and the observation ("observed exactly once") is stated separately from the reproduction attempts (which
  runs did not reproduce it, and — separately attributed — the two independent verifications' own combined
  12 further executions).
- **§12.1, L-3 row** — the parenthetical justifying the server-side bypass ("safe for batch convergence —
  ops apply strictly in order in separate transactions, so a later explicit write still wins, and replay is
  deterministic") is exactly the claim V-2 disproved and the code no longer relies on. The row now marks
  that original parenthetical superseded by V-2, quotes it for reference, and states the verified rule the
  fix actually implements in its place.
- **§13.4** — the full end-to-end suite subsection was headed and described as the "real batch
  replay/subsumption coverage" for V-2, while conceding in the same paragraph that no E2E run could
  exercise a defect unreachable from any shipped emitter — a run that cannot exercise the behavior is not
  evidence for it. Retitled and corrected in place to describe the E2E run as browser verification for
  V-3's diagnostics plus a regression check on the offline/PWA surface, with the replay/subsumption claim
  now pointed explicitly at §13.1's V-2 row and the integration tests in §13.3.
- **§13.1 (V-3 row) and §13.2** — the V-3 row claimed specific edits to §12.3.3 and pointed to "a
  correction block… immediately below the un-corrected original text" that did not exist; it now describes
  what is actually in §12.3.3 after the correction above, without claiming a structure that isn't there.
  §13.2's limitations bullet stated "not reproduced… in any prior run across this report's history," which
  erased the one real observation the whole item exists to record; it now states the observation and the
  non-reproduction attempts as separate, unambiguous facts, matching §12.3.3's corrected account.

Verified by re-reading each edited section in full after editing and by searching the document for the
retracted phrases (`established as pre-existing`, `load-sensitive timing margins`, `passed in every one of
the five full runs`, `C-5`, `not reproduced in any prior run`, `see immediately below the un-corrected`,
and the old L-3 parenthetical) — each surviving occurrence is either inside a passage explicitly marked
superseded/historical, or is a "Finding" column's own description of the problem being corrected, not a
live, uncorrected assertion. No code, test, or configuration file was touched; no test suite, database, or
build command was run for this pass.

### 14.1 Three citation fixes made by the closeout verifier, not by this pass

Recorded here for transparency: the following three bounded citation corrections were made **by the
documentary closeout verifier** under the explicit authorization in its own task, directly in this
document. They are that verifier's own edits, not changes authored by this remediation pass and not
separately reviewed by anyone else. See
[set-groups-stage-a-documentary-closeout-verification.md](set-groups-stage-a-documentary-closeout-verification.md)
§3 for the reasoning.

1. §12.3.3 and §13.2 cited the first verification's reproduction-attempt count as "§3.3(d)"; that count is
   in its §2, under V-3(d) (§3.3 is that report's "Inherited, not re-run" section). Both citations
   corrected.
2. §12.3.3 described the second verification's further execution as "1 further full run"; it was one run of
   the 17-file `test:e2e:offline` subset, not the full 39-file suite. Corrected, and the citation repointed
   from "§0/§3.4" to "§4.1 item 10", where that run is recorded. The combined total of 12 further
   executions is unchanged and correct.
3. §13.1's V-3 row used the ad-hoc label "Independent verification V-3(2)" for the second verification
   report; replaced with an explicit document and section citation.

READY FOR DOCUMENTARY SET GROUPS STAGE A CLOSEOUT VERIFICATION
