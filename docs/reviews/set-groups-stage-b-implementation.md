# Set Groups (PI-012) Stage B — implementation manifest and report

**Status: F-1…F-9 remediated and verified (§12); V-1…V-3 remediated (§13); W-1…W-3, found by the
release-residual verification of the V-1 fix itself, remediated (§14, dated 2026-09-13, fourth pass).
READY FOR TARGETED SET GROUPS SUPERSESSION VERIFICATION.**
**Date:** 2026-09-13 (original pass); F-1…F-9 remediation same day, per
[set-groups-stage-b-review.md](set-groups-stage-b-review.md); V-1…V-3 remediation same day, per
[set-groups-stage-b-remediation-verification.md](set-groups-stage-b-remediation-verification.md) §7,
owner-authorised; W-1…W-3 remediation same day, per
[set-groups-release-residual-verification.md](set-groups-release-residual-verification.md) §7.
**Tree:** dirty, based on `583a9ab` + Stage A (uncommitted) + concurrent, unrelated PI-017
(repository-agent-workflow) documentation/tooling changes — see §0.2.
**Prerequisite gate:** [set-groups-stage-a-documentary-closeout-verification.md](set-groups-stage-a-documentary-closeout-verification.md)
§5 verdict — **VERIFIED — READY FOR SET GROUPS STAGE B IMPLEMENTATION** — confirmed before any
source change in this task.
**Binding inputs:** [set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md)
§19 (owner decisions D-1…D-6), §6 (linked-load semantics), §11 (authoring/execution examples), §16
(documentation requirements); [set-groups-stage-a-implementation.md](set-groups-stage-a-implementation.md)
§7 (Stage A limitations/extension point) and §1 (file manifest).
**Scope:** Stage B only — percentage-linked group loads on the verified Stage A foundation. Stage A
and Stage B ship together (one release); Stage A's own code/tests are not touched except where this
document says so.

---

## 0. Prerequisite and re-baseline

### 0.1 Gate

The closeout verification's own verdict line is quoted verbatim in the header above. This task does
not re-verify Stage A's code or tests — it inherits them as verified and builds on top.

### 0.2 Dirty-tree triage — Stage A vs. concurrent PI-017 work

`git status` shows far more than Stage A's own files modified/untracked. Distinguishing them (as
instructed) before touching anything:

**Stage A's own changes (confirmed by cross-referencing `set-groups-stage-a-implementation.md` §1/§10
and `git diff --stat`):**
- Modified: `src/db/schema/{setLogs,recommendations}.ts`, `drizzle/meta/_journal.json`,
  `src/domain/{schemes/setScheme,prescriptions/schema,prescriptions/applyWeekModifiers,
  prescriptions/buildSnapshot,progression/{engine,evaluateSession,evaluationTarget,loadProgression,
  registry,repProgression,workingTargets},schemas/{prescriptionSnapshot,recommendation},
  sync/{schema,setDeletionOps}}.ts`, `src/server/{history,prescriptions,progression,sync,today}/
  service.ts`, `src/sync/{activeSession,activeSessionStore,corrections,types}.ts`,
  `src/ui/{history/HistoryDetail.tsx,history/correctionSubmit.ts,history/types.ts,
  prescriptions/PrescriptionForm.tsx,today/TodaySection.tsx,workout/ExerciseCard.tsx,
  workout/RecommendationCard.tsx}`, `tests/e2e/{dead-letter.spec.ts,helpers.ts,seed.ts}`,
  `tests/integration/measurementSync.integration.test.ts`, ten pre-existing unit test files fixed
  for the additive schema change.
- Untracked (new): `drizzle/0014_third_scream.sql` + `drizzle/meta/0014_snapshot.json`,
  `src/domain/progression/groupEvaluation.ts`, `src/ui/workout/groupSelection.ts`,
  `tests/e2e/setGroups{,Offline}.spec.ts`, `tests/integration/setGroups.integration.test.ts`,
  `tests/unit/setGroups/**`, and the whole `docs/reviews/set-groups-*` lineage.
- The six architecture docs `git diff --stat` shows changed (`prescription-model.md`,
  `domain-model.md`, `data-model.md`, `progression-engine.md`, `pwa-offline-strategy.md`,
  `evidence-to-design.md`) are Stage A's own §16-mapped additions per the implementation report's
  §10 — confirmed by reading each diff's actual content (the `groups`/`GroupsScheme`/`groupPrefills`
  passages match the implementation report's descriptions exactly). These are **kept as-is**; this
  task only adds to them (§7 below), never reverts them.

**Concurrent, unrelated PI-017 (repository-agent-workflow) work — left untouched by this task:**
`CLAUDE.md`, `README.md`, `HANDOFF.md` (deleted) / `HANDOFF(depracted).md`, `docs/BACKLOG.md`,
`docs/ROADMAP.md`, `docs/STATUS.md`, `package.json`, `playwright.config.ts`, `docs/process/`,
`.claude/skills/`, `docs/reviews/repository-agent-workflow-*`,
`docs/reviews/exercise-catalog-expansion-closeout.md`,
`docs/reviews/workout-prescription-context-device-acceptance.md`,
`docs/reviews/{warmup-routines-evidence-research,set-groups-strength-evidence-research}.md`,
`gpt-handoff.md`, `gpt-memory.md`, `docs/research/*.pdf`. None of these are read or written by this
task. `docs/BACKLOG.md`/`ROADMAP.md`/`STATUS.md` stay the owner/closeout editor's step, unchanged
from Stage A's own posture (§10 of the Stage A report).

---

## 1. Reconciling the proposed load shape with the actual Stage A implementation

The evaluation's §6.5 proposal generalised `baselineLoadKg` into a `GroupLoad` union
(`{mode: "carryForward", baselineKg?}` | `{mode: "percentOfGroup", ref, percent, basis}`) living on a
new `load` field. **Stage A did not adopt that union** — it shipped `baselineLoadKg?: number` as a
plain, flat, additive field directly on `SetGroup` (confirmed in `setScheme.ts`, read for this task).
Introducing the union now would mean migrating every existing `baselineLoadKg` reader
(`buildSnapshot.ts`, the editor, `checkPrescriptionCompatibility`) onto a mode-tagged wrapper for no
behavioural gain — exactly the kind of unrelated refactor this task's scope excludes.

**Decision:** Stage B adds one more flat, additive, optional field — `link?: { ref: string; percent:
number }` — alongside `baselineLoadKg`, not a `load.mode` wrapper. `basis` is omitted entirely rather
than shipping a single-valued enum: §19 D-4 narrows V1 to performed-only, so a `basis` field with one
legal value is dead configuration surface, not a real choice. `baselineLoadKg` keeps its existing
"own carry-forward baseline" meaning unchanged and continues to serve as the **fallback** target when
a link has no reference load yet (§6.2's "no sets yet" row), exactly as the evaluation intended,
just addressed through the existing field rather than a `carryForward` union member. `prescription-
model.md` §2/§4 are updated to describe the shape actually shipped (§7 below), retiring the "reserved,
not implemented" language for the flat field this task adds while explicitly recording the deviation
from the originally-sketched union.

---

## 2. Binding behaviour (restated compactly from the prompt / §19 / §6)

1. Performed basis only: reference load = highest actually-logged non-warm-up load attributed to the
   reference group, this session.
2. One backward hop: `ref` names an earlier, itself-unlinked group in the same slot. No self/forward
   references, no chains, no cycles, no cross-slot references.
3. `percent`: integer 10–100, user-entered, no default.
4. Rounding: `roundToStepKg` (existing nearest-step, half-up), reused verbatim from
   `domain/progression/loadHelpers.ts` — no new rounding logic.
5. A linked group's effective progression strategy must be `manual` (L-1) — enforced in
   `checkPrescriptionCompatibility`, mirroring the existing message text from §6.3.
6. The link supplies only the **first-set** proposal; later sets in the group copy the athlete's own
   previous logged load in that group (the existing `groupPrefill` "last set logged in this group"
   rule already does this — no separate mechanism needed).
7. No reference work set yet → fall back to the linked group's own carry-forward → baseline → empty,
   with a visible explanation in the UI.
8. Reference edits/deletions affect only not-yet-logged proposals (derived live from current session
   sets on every render); already-logged sets are facts and are never recomputed.
9. The link is frozen by virtue of living inside `scheme.groups[]`, which Stage A's existing snapshot
   freeze (ADR-007) already covers — no separate freezing mechanism needed.
10. Resolution is 100% client-side and pure: `(frozen snapshot, current session sets, loadStepKg) →
    derived load`. No server round-trip, no new sync op, works offline/reload/adoption identically to
    every other Stage A group-derivation rule.
11. No deload double-multiplication: the reference figure is the actually-logged weight (already
    reflects whatever was lifted); no multiplier is applied to it a second time.

---

## 3. Planned file manifest

**Domain (schema + validation + pure resolution):**
- `src/domain/schemes/setScheme.ts` — `GroupLink` type/schema on `SetGroup`; authoring-only
  `ref`/`refIndex` alternative (mirroring `groupOverridesByIndex`'s established pattern) so a link to
  a brand-new group can be authored in the same save that creates it; cross-group invariant checks
  (unknown ref, forward/self reference, chain) added to both `setSchemeSchema`'s and
  `setSchemeAuthoringSchema`'s existing top-level `superRefine`; `assignGroupKeys` resolves
  `refIndex` → the newly-assigned real key once every group in the array has one.
- `src/domain/prescriptions/schema.ts` — `checkPrescriptionCompatibility` rule L-1 (a linked group's
  effective strategy must be `manual`).
- `src/ui/workout/groupSelection.ts` — pure link-resolution functions (reference-load lookup,
  rounding, fallback), extending `groupPrefill`'s existing derivation chain rather than replacing it.
- `src/domain/progression/evaluateSession.ts` — one defensive line: `evaluateGroupedExercise` skips a
  linked group unconditionally, even if a non-`manual` strategy somehow reached it (belt-and-braces;
  the write-time gate above is the real enforcement, matching §6.3's "returns UNSUPPORTED_SCHEME
  defensively" framing without fabricating an unused draft shape for a structurally-prevented case).

**No changes needed (verified by inspection, recorded so the reviewer doesn't have to re-derive it):**
`src/server/today/service.ts`, `src/server/progression/service.ts`, `src/sync/activeSession.ts`,
`src/ui/today/TodaySection.tsx`, `src/domain/prescriptions/buildSnapshot.ts`, any DB schema/migration.
A linked group is, from every one of these modules' point of view, exactly the "manual per-group
strategy" case Stage A already fully supports end to end (carry-forward computed for every group
regardless of strategy; a manual group never gets a recommendation, never competes, never migrates).
The link field rides through the existing JSONB `scheme` column and existing snapshot-freeze
mechanism with zero new plumbing.

**UI (editor + execution):**
- `src/ui/prescriptions/PrescriptionForm.tsx` — per-group link controls (enable, reference-group
  select restricted to valid earlier/unlinked candidates, percent input), forced `manual` override
  and hidden strategy/repCap controls for a linked group, explicit reorder/remove sanitisation that
  clears (never silently retargets) a link invalidated by an edit, with a visible notice.
- `src/ui/workout/ExerciseCard.tsx` — renders the resolved link proposal/explanatory subtitle for a
  linked group's first-set prefill; no recommendation card for a linked group (falls out of the
  existing `groupRecommendations.find` returning nothing for a manual group).

**Documentation (§16-style, Stage B's own additions on top of Stage A's, per §1 above):**
- `docs/architecture/prescription-model.md` §2/§4 — replace "reserved, not implemented" with the
  shipped flat `link` field; record the union-vs-flat-field deviation.
- `docs/architecture/adr/ADR-008-prescription-representation.md` — the bounded amendment for the one
  fenced back-reference exception (D-5), citing the `perSet.loadOffset` precedent per §6.5.
- `docs/architecture/progression-engine.md` §5 — one short paragraph documenting the defensive skip.
- `docs/architecture/domain-model.md`, `data-model.md`, `pwa-offline-strategy.md`,
  `evidence-to-design.md` — reviewed; **no change needed** (confirmed by reading each — the snapshot
  shape, DB shape and evidence-boundary row already generically cover an additive `scheme` field / a
  user-entered, never-defaulted percentage; row 22 of `evidence-to-design.md` already states the
  Stage B boundary verbatim).

**Tests:** additive unit coverage in `tests/unit/setGroups/` (schema/validation, pure resolution,
compatibility), additive integration coverage in `tests/integration/setGroups.integration.test.ts`
(one-save authoring with index-addressed links, highest-attributed-set selection, reverse bridge
untouched), a new or extended Playwright spec for authoring + execution of a linked group. Existing
Stage A tests are not modified except where a shared fixture needs a byte-identical no-link case
added alongside (never replacing) the existing one.

---

## 4. Acceptance checklist (traced to the prompt's "Binding behavior" list) — all verified, §7

- [x] V1 performed-basis only; no prescribed-basis field, path or test exists.
- [x] Schema rejects: self-reference, forward reference, reference to a linked group (chain), unknown
      key, non-integer/out-of-range percent, cross-slot reference (structurally impossible — a scheme
      only ever contains its own slot's groups).
- [x] `checkPrescriptionCompatibility` rejects a linked group whose effective strategy isn't `manual`.
- [x] Reference load = highest logged non-warm-up load attributed to the reference group this session
      (not the modal load, not an average, not prescribed).
- [x] Rounding matches the worked example: 130 kg × 80 % = 104 → 105 kg at a 2.5 kg step.
- [x] Linked group never produces a recommendation/decision card; independent groups' recommendations
      are unaffected.
- [x] First-set proposal comes from the link; second/third sets copy the athlete's own previous
      logged load in that group (existing copy-forward, unmodified).
- [x] A manual override on a linked group's proposed first-set load logs as typed and never rewrites
      the saved percentage.
- [x] No reference work set yet → own carry-forward → baseline → empty, with a visible explanation.
- [x] Editing/deleting a reference set changes only not-yet-logged proposals; already-logged sets are
      untouched.
- [x] One-save authoring: creating a reference group and a group linked to it in the same save
      resolves correctly to real server-assigned keys.
- [x] Removing or reordering a reference group is handled explicitly (a visible, explicit clear —
      never a silent retarget to a different group).
- [x] Offline completion, reload and cross-device adoption resolve the same derived load from the
      frozen snapshot + current sets + load step.
- [x] Existing ungrouped and Stage A independent-group behaviour is unchanged (regression-tested).
- [x] Full quality gates + full E2E pass on the final tree; new browser specs included in the E2E run.

---

## 5. Explicitly out of scope for this task

No e1RM/volume/RIR-policy/mesocycle/exercise-specific logic changes. No Stage A reimplementation. No
unrelated fixes to Stage A's recorded open items (§7.1/§7.2 of the Stage A report — two-save
progression-override authoring, missing add/remove/reorder browser coverage predating this task,
reverse-conversion pending-record asymmetry, `assignGroupKeys` trusting a client-supplied key
verbatim). No production access, staging, commit, push, migration against production, or deployment.

---

## 6. Exact manifest — files touched in this task

**Domain:**
- `src/domain/schemes/setScheme.ts` — `groupLinkSchema`/`GroupLink` (stored), `groupLinkAuthoringSchema`/
  `GroupLinkAuthoringInput` (authoring, `ref`-xor-`refIndex`), `link?: GroupLink` added to `setGroupSchema`
  and (relaxed) to `setGroupAuthoringSchema`; cross-group invariant checks added to both
  `setSchemeSchema`'s and `setSchemeAuthoringSchema`'s existing top-level `superRefine` (unknown ref,
  forward/self reference, chained reference); `assignGroupKeys` extended with a second pass resolving
  `link.refIndex`/`link.ref` onto the final assigned key.
- `src/domain/prescriptions/schema.ts` — `checkPrescriptionCompatibility`'s per-group loop gained rule
  L-1 (`group.link && effectiveStrategyId !== "manual"` → issue, exact wording from §6.3).
- `src/domain/progression/evaluateSession.ts` — `evaluateGroupedExercise`'s loop gained one defensive
  line (`if (group.link) continue;`) after the existing manual-skip, structurally unreachable given the
  write-time gate above.

**UI:**
- `src/ui/workout/groupSelection.ts` — added `resolveLinkedLoad` (reference-load lookup + rounding),
  `describeGroupLink` (UI-facing description incl. missing-reference fallback and the
  superseded-by-own-log state), and extended `groupPrefill`'s existing chain with the link step
  (optional 5th `loadStepKg` parameter, backward-compatible with every existing call site/test).
- `src/ui/workout/ExerciseCard.tsx` — imports `describeGroupLink`/`GroupLinkDescription`; passes
  `exercise.loadStepKg` into `groupPrefill`; the per-group recommendation-card loop now renders a new
  `GroupLinkNote` component (descriptive only, no decision buttons) for a linked group with no
  recommendation, instead of nothing.
- `src/ui/prescriptions/PrescriptionForm.tsx` — `GroupDraft` gained `draftId` (stable client-only
  identity spanning reorder), `linkEnabled`/`linkRefDraftId`/`linkPercent`; `randomDraftId`,
  `sanitizeGroupLinks` (explicit-clear-on-invalidation, never silent retarget), `updateGroups` (routes
  every mutation through sanitize + notice state), `setGroupLinkEnabled` (forces `strategyOverride` to
  `"manual"`); the load effect populates link fields for a retained group from `g.link`; submit-time
  validation (percent 10–100 integer, reference required) and scheme-building resolve each linked
  group's `link` to `{ref}` or `{refIndex}` depending on whether the target already has a real key; the
  per-group JSX gained the link checkbox/reference-select/percent-input block and replaces the
  progression-strategy select with a fixed "Manual progression…" note when linked; a `linkNotice`
  banner surfaces any explicit clear.

**Documentation:**
- `docs/architecture/prescription-model.md` — §2 (shipped `link` shape, reconciliation with the §6.5
  sketch, retired "reserved" wording), §4 (Stage B's prefill-chain splice, no double deload multiplier).
- `docs/architecture/adr/ADR-008-prescription-representation.md` — Amendment 1 (the one fenced
  back-reference exception, its fence, and the `perSet.loadOffset` precedent).
- `docs/architecture/progression-engine.md` — §5 addition documenting the defensive skip and that
  resolution is entirely client-side.
- `docs/reviews/set-groups-stage-b-implementation.md` — this document (new).

**Tests (all additive; no existing test's assertions were changed):**
**Corrected by remediation F-5** (§12) — the two Stage-A baselines below were miscounted; the actual
Stage B additions and file totals were always correct (the review reconciled this against every `it()`
title in both files and confirmed nothing was removed or altered — see F-5 in §12).
- `tests/unit/setGroups/setSchemeGroups.test.ts` — **+18** tests, not +19 (Stage A's own actual baseline
  was **25**, not 24 — [set-groups-stage-a-implementation.md](set-groups-stage-a-implementation.md)
  §12.2's own "+4 M-6 tests (25 total)"), across three new Stage B `describe` blocks (stored-shape link
  invariants, authoring `ref`/`refIndex` invariants, `assignGroupKeys` link resolution). File total
  25 → 43.
- `tests/unit/setGroups/prescriptionCompatibility.test.ts` — +5 tests (rule L-1). File total 8 → 13.
- `tests/unit/setGroups/groupSelection.test.ts` — **+16** tests, not +20 (Stage A's own actual baseline
  was **13**, not 9 — same §12.2 citation, its own "+1 L-3 test (13 total)"), across three new Stage B
  `describe` blocks (`resolveLinkedLoad`, linked-group `groupPrefill`, `describeGroupLink`). File total
  13 → 29. **Remediation pass adds a further +3** (§12, F-7): `fallbackLoadKg` coverage. File total
  29 → 32.
- `tests/unit/setGroups/evaluateSessionGroups.test.ts` — +4 tests (defensive skip, sibling unaffected).
  File total 13 → 17.
- `tests/integration/setGroups.integration.test.ts` — +4 tests (one-save authoring via `refIndex`, L-1
  rejection through the real service, dangling-ref-after-removal caught by the authoring schema, a real
  completion never persisting a recommendation for the linked group while its sibling still does).
  File total 29 → 33.
- `tests/e2e/setGroups.spec.ts` — +3 tests (browser authoring incl. round-trip; browser reorder-clears-
  link with visible notice; browser execution covering missing-reference fallback, the rounded worked
  example, manual override, copy-forward, and the two-session no-recommendation proof). File total
  4 → 7. **Remediation pass adds a further +6** (§12): F-1 (reference edit/delete/dirty-draft, in one
  test), F-2 (ordinary adoption removes the competing decision surface), F-3 (slot-strategy change
  after linking), two F-8 tests (reference removal; reference becoming linked), F-9 (offline
  completion/reload/cross-device adoption for a linked group). File total 7 → 13.
- `tests/unit/setGroups/prescriptionFormLinkSanitize.test.ts` (new, remediation pass) — +8 tests
  (F-8's unit-level companion: `sanitizeGroupLinks` exported and exercised directly for every
  invalidation cause the notice enumerates — removed reference, reference-becomes-linked, reorder,
  self-reference, plus the "not yet chosen, don't clear" and "one clear never disturbs another link"
  cases).
- `tests/integration/setGroups.integration.test.ts` — **remediation pass adds a further +1** (§12):
  F-2's own service-level "ordinary adoption" reproduction (real `updatePrescription`, real
  `buildTodayBundle`, real `getActiveSession`). File total 33 → 34.

---

## 7. Acceptance mapping (detail)

| Requirement | Evidence |
|---|---|
| Performed-basis only, no `basis` field | `setScheme.ts` `groupLinkSchema`/`groupLinkAuthoringSchema` have no `basis` field at all; §1 above records the deliberate omission. |
| One hop, no chains/cycles/forward/self/cross-slot | `setSchemeGroups.test.ts` — 7 dedicated rejection tests + 2 acceptance tests (adjacent and non-adjacent valid links); cross-slot is structurally impossible (a scheme's `groups` array is that slot's own). |
| Percent integer 10–100, no default | Schema `.int().min(10).max(100)`, no `.default()`; editor's percent `<input>` has no prefilled value; `prescriptionCompatibility`/`setSchemeGroups` tests cover the boundaries. |
| L-1 (linked ⇒ manual) | `prescriptions/schema.ts` + 5 unit tests + 1 integration test (`PrescriptionCompatibilityError` through the real service) + the E2E authoring test (editor forces/hides the control) + defensive engine skip with 3 unit tests. |
| Reference load = highest logged, this session, performed only | `groupSelection.ts`'s `referenceLoadKg`; unit tests cover "highest not last/modal", warm-up exclusion, sibling-group exclusion; E2E test logs 130 kg on Top and confirms the derived figure. |
| Rounding (worked example) | `resolveLinkedLoad` reuses `roundToStepKg` verbatim; unit test asserts 130×80%→105 at 2.5 kg exactly; E2E test asserts the same through the real UI. |
| No competing recommendation | **Corrected by remediation F-2** (§12). Unit (defensive skip against a linked group somehow reaching a non-manual strategy — covers only *new* records). Integration + E2E now additionally cover the case the original claim missed: a group that already held a pending recommendation *before* being linked — `resolveGroupRecommendation`'s new `isLinked` bail-out (the shared choke point for bundle assembly and cross-device resume) plus the card's render-order fix, proven by a real completion → real link-via-editor → real second-session check (integration test; E2E: two-session proof, Top gets a real Accept button, Back-off never does, and the bundle independently confirms only Top's key is offered). |
| First-set proposal only; later sets copy own log | `groupPrefill`'s existing "last set logged in this group" check is unconditionally first, before the link step; unit test logs a first back-off set then asserts the SECOND set's prefill copies it, not the link; E2E test does the same through the real UI (manual 100 kg override, then a second set copying 100). |
| Manual override never rewrites percentage | The link is read-only input to derivation, never written back to by a log op; no code path exists that would persist an in-session override into `scheme.groups[].link`. |
| Missing-reference fallback, visible | `groupPrefill` falls back to `base` (own carry-forward/baseline/empty) exactly like an independent group; `describeGroupLink`/`GroupLinkNote` render the explicit "no `<ref>` set logged yet… using this group's own carry-forward" text; unit + E2E tests assert both the value and the visible text. |
| Reference edits/deletions affect only future proposals | **Corrected by remediation F-1** (§12). The original claim was true of the pure *derivation function* but not of the *rendered input* — `groupPrefill`/`describeGroupLink` were already correct and re-run on every render, but nothing re-applied a fresh CLEAN result to the `weight` input state outside a selection change, so the box itself did not follow (the review's exact reproduction). Fixed with a second, narrowly-scoped effect in `ExerciseCard.tsx` keyed on the derived clean proposal, gated on `!dirty` and "no own log yet"; the explanatory note now also distinguishes a live proposal from a manual draft (F-1's second half). E2E test drives a real edit, a real deletion, and a real dirty draft through the browser; unit tests remain as pure-function coverage of the derivation itself, which was never the defect. |
| One-save authoring | `assignGroupKeys`'s two-pass resolution + `groupOverridesByIndex`-style `refIndex`; unit test (`assignGroupKeys`), integration test (real `createPrescription`), E2E test (real form, brand-new Top + brand-new linked Back-off in one submit). |
| Reference removal/reorder handled explicitly | `sanitizeGroupLinks` (editor) + schema `superRefine` (backstop); integration test proves a naively-reconstructed dangling scheme is rejected by the authoring schema; E2E test drives an actual ↑ reorder in the browser and asserts the visible "Link cleared for Back-off…" notice, the checkbox unchecking, and a clean save with no `link` anywhere. |
| Frozen snapshot, offline/reload/adoption | **Corrected by remediation F-9** (§12). The original claim — coverage "by inheritance" from Stage A's offline machinery — was accurate about the *mechanism* (the link rides the existing ADR-007 freeze, no new sync op, no new IndexedDB shape) but overstated as *evidence*: no Stage A artefact ever contained a `link`, so no inherited run had actually exercised it. The independent review executed this coverage directly (its own PROBE C, since deleted per its task-owned-probe convention) and found it correct; this task adds a durable, permanent regression (`tests/e2e/setGroups.spec.ts`, F-9) reproducing the same offline-completion → offline-reload → cross-device-adoption journey for a linked group, so the claim now rests on a repo-resident test rather than a one-off reviewer probe. |
| No double deload multiplication | The reference figure is `ActiveSessionSetDto.weightKg` — the actually-logged value, already deload-adjusted if a deload applied — and no multiplier is applied to it anywhere in `resolveLinkedLoad`. |

---

## 8. Test evidence (final tree, this session)

- **Unit** (`pnpm test:unit`): **1408 passed**, 0 failed, 96 files. (Prior baseline before this task's
  additions: 1365 per the Stage A closeout lineage; +43 new/changed-count across the four files listed
  in §6, net +43 in the suite total consistent with the additions above once accounting for the files'
  own prior counts.)
- **Integration** (`pnpm test:integration`, PGlite, disposable per-test): final whole-suite run —
  **505 passed, 17 skipped (pre-existing concurrency tests requiring real Postgres, unchanged from the
  Stage A baseline), 0 failed**, 35 files. `tests/integration/setGroups.integration.test.ts` alone:
  **33 passed** (29 inherited Stage A + 4 new Stage B).
- **E2E** (`pnpm test:e2e`, real Chromium, the local disposable dev Postgres, real dev server built
  fresh): **final clean run — 165 passed, 0 failed**, run in isolation with no other process touching
  the shared dev server/database. `tests/e2e/setGroups.spec.ts` alone: 7 passed (4 inherited Stage A +
  3 new Stage B); `tests/e2e/setGroupsOffline.spec.ts` (Stage A, untouched): 1 passed.
- **Quality gates:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all clean on the final tree.

### 8.1 Local dev-database migration applied during this task

The local Docker Postgres (`gym-app-db-1`) had **not** been migrated to Stage A's own `0014` migration
(`set_logs.group_key`, `recommendations.group_key`, the rebuilt partial unique index) — the first E2E
attempt failed outright with `column "group_key" does not exist`. Per CLAUDE.md's explicit local-dev
authorization ("migration verification" is a named use of the local database) and since this is purely
additive, already-reviewed, non-production DDL, `pnpm db:migrate` (with `DATABASE_URL` set) was run
against the local database to bring it current. No production, staging, or any other environment was
touched. This is now the current, correct state for local development going forward.

### 8.2 A contamination this task caused and fixed, disclosed for transparency

While iterating, a foreground `npx playwright test tests/e2e/setGroups.spec.ts` invocation was run
**while a background full-suite `pnpm test:e2e` run was still executing** — both processes share the
same running dev server (`reuseExistingServer: true`) and the same local Postgres. The two runs raced
on the single shared program's active-block schedule (`applyScheduleOverride`/`restoreSchedule`),
producing two symptoms, both since fully diagnosed and resolved:

1. A `session_locked` dead-letter (once) in a concurrent run of `setGroups.spec.ts`'s own execution
   test — traced to the outbox-drain/complete-workout race window, not reproduced on any subsequent
   isolated run (3 clean full-file runs since).
2. A stray scheduled reference to one of this task's own scratch templates
   (`E2E SG Link Exec <timestamp> Template`) briefly appeared in the shared account's active-block
   schedule, which caused `offline-set-edit-delete.spec.ts` (an unrelated, untouched spec) to start its
   workout against that template instead of the seed's own exercise, and — separately, in the same
   contaminated window — `dead-letter.spec.ts:280` observed `session_locked` in place of its expected
   `invalid_measurement` reason.

Diagnosed directly (not "explained away"): a temporary diagnostic Playwright spec confirmed (a) the
account's only active block's schedule now contains exactly its original single entry, no scratch
template; (b) `offline-recommendation.spec.ts`, `offline-set-edit-delete.spec.ts`, and
`dead-letter.spec.ts:280` all pass cleanly and individually in true isolation (no concurrent process);
(c) the immediately following full-suite run — the ONLY one in this task run start-to-finish with
nothing else touching the shared server/database — passed all 165 tests with zero failures, confirming
the contamination was transient and fully self-resolved by the time of the final evidence run. The
temporary diagnostic spec file was deleted; no production code, test file, or documentation was altered
to route around this — the fix was procedural (stop running concurrent Playwright invocations against
the shared dev server), and it is recorded here as a process lesson, not a product defect.

---

## 9. Deviations from the original sketch (restated compactly)

1. **Flat `link` field, not a `load.mode` union** — §1 above; matches Stage A's own precedent for
   `baselineLoadKg`.
2. **No `basis` field** — V1 is performed-only (§19 D-4); a single-valued enum is dead surface.
3. **Index-addressed authoring (`refIndex`)** is new relative to the evaluation's own sketch, which
   didn't consider the one-save-authoring case explicitly; it mirrors `groupOverridesByIndex`'s already-
   accepted pattern rather than inventing a new one.
4. **The editor's link controls hide, rather than merely disable,** the progression-strategy select for
   a linked group (a static "Manual progression…" note instead) — a UX choice, not a requirement; it
   was made to avoid ever rendering a control whose only legal value is fixed.

None of these were flagged as risks requiring owner sign-off; all are routine engineering choices
within the approved scope, per the task's own authorization for such choices.

---

## 10. Remaining risks / open items

- **Inherited from Stage A, not addressed here (correctly out of scope), corrected per review §8.3:**
  ~~the two-save progression-override authoring flow~~ — **stale, this was closed in Stage A**: M-3
  introduced `groupOverridesByIndex`, Stage A's own E2E and two integration tests prove one-save
  authoring, and Stage B's own `refIndex` relies on the identical pattern; listing it here understated
  Stage A rather than overstated it, but it was still wrong and is struck through rather than repeated.
  Still genuinely open: missing browser coverage for plain group add/remove/reorder (Stage B added
  browser coverage for the *link-clearing* reorder/removal case specifically — now three tests, F-1's
  reorder plus F-8's removal and reference-becomes-linked — not the general Stage A controls), the
  reverse-conversion pending-record asymmetry (L-7), and `assignGroupKeys` trusting an already-keyed
  group's client-submitted key verbatim (L-8) — **carried forward with a review-noted widening**: Stage
  B's `link.ref` is now also matched against those same client-supplied keys, though the authoring
  schema's own `superRefine` still requires the reference to resolve within the submitted array, so no
  new defect follows from it.
- **The historical Set Groups dead-letter** (`setGroupsOffline.spec.ts`, observed once, cause
  unresolved per the Stage A closeout) was **not** observed again in this task's E2E runs (that spec
  passed cleanly, including in the final 165/165 run). Its cause remains unresolved as before; nothing
  in this task narrows or reopens it.
- **Device (iPhone) acceptance** not performed, not claimed.
- **No commit, push, or deployment** — this report and every file it lists exist only in this local,
  uncommitted working tree, per this task's explicit constraints.

---

## 11. Cleanup

- The temporary diagnostic Playwright spec used to investigate §8.2 was deleted; `git status` shows no
  trace of it.
- No stray active workout session, no stray scheduled template, no stray archived-vs-active state left
  in the local dev database beyond the two ordinary scratch prescriptions this task's own E2E specs
  create and archive per their existing `afterEach` convention (unchanged from Stage A's own pattern).
- The local dev database now carries Stage A's `0014` migration (§8.1) — an intentional, disclosed,
  non-production change that future local sessions should treat as the new baseline, not a regression
  to investigate.
- No other resource (Docker container, dev server process, port) was started or stopped by this task
  outside of Playwright's own managed `webServer` lifecycle.

---

## 12. F-1…F-9 remediation (dated 2026-09-13, second pass)

Addressing [set-groups-stage-b-review.md](set-groups-stage-b-review.md) §3 (findings), §6.3 (executed
evidence), and §8 (evidence/process reconciliation). Per agent-workflow §2 ("bounded remediation...
fixes only the listed finding IDs; appends to the report rather than rewriting it"), this section is
additive; §§0–11 above are the original pass, corrected in place only where a specific finding required
it (cross-referenced from each correction back to this section). The Stage B representation itself —
the flat `link` field, the schema invariants, the performed-basis rule, the rounding, the L-1 write-time
gate — is unchanged and was not reopened; the review's own §0 confirms it is sound.

### 12.1 Disposition table

| ID | Severity | Disposition | Fix | Verification |
|---|---|---|---|---|
| F-1 | HIGH | **Fixed** | `src/ui/workout/ExerciseCard.tsx` — a second, narrowly-scoped effect re-derives the selected linked group's CLEAN weight when the derived proposal changes (reference edit or deletion), gated on "not dirty" and "no own log yet"; `GroupLinkNote`'s text now distinguishes a live proposal from a manual draft | E2E (real edit, real deletion, real dirty draft) + executed negative control (§12.4) |
| F-2 | HIGH | **Fixed** | `src/server/progression/service.ts`'s `resolveGroupRecommendation` gained an `isLinked` bail-out (the one shared choke point for bundle assembly AND cross-device resume — both call sites in `src/server/today/service.ts` updated); `src/ui/workout/ExerciseCard.tsx`'s per-group render branch now checks `group.link` before ever consulting a `rec`, so a linked group is never offered a decision surface regardless of what the bundle/resume paths return | Integration (real completion → real link-via-editor → real second-session check, both bundle and resume) + E2E (two-session proof) + executed negative control (§12.4) |
| F-3 | MEDIUM | **Fixed** | `src/ui/prescriptions/PrescriptionForm.tsx` — the load effect now sets a linked group's `strategyOverride` to an explicit `"manual"` (never the ambiguous `""`); independently, the submit-time override loop now forces `effectiveGroupStrategyId = "manual"` and always emits an override for a linked group, regardless of `strategyOverride`'s stored value — no untick/re-tick required | E2E (load → change slot strategy → save succeeds, effective strategy still manual) + executed negative control (§12.4) |
| F-4 | MEDIUM | **Fixed** | `docs/architecture/prescription-model.md` §2 — the actual contradictory sentence (not merely a later summary) rewritten to state both stages are implemented and to describe the shipped flat `link` field instead of the rejected `load.mode`/`GroupLoad` union | Inspection (documentation-only, agent-workflow §5's doc row) |
| F-5 | LOW | **Fixed** | This document, §6 — corrected the two miscounted Stage A baselines (`setSchemeGroups.test.ts` 24→25, `groupSelection.test.ts` 9→13) and the resulting per-file addition counts, per the review's own reconciliation (its §8.2, which enumerated every `it()` title in both files and confirmed nothing was removed or altered) | Inspection |
| F-6 | LOW | **Fixed** | `src/ui/prescriptions/PrescriptionForm.tsx` — `linkNotice`'s message now states the progression-strategy consequence explicitly ("Progression strategy reset to \"Same as exercise\" for the affected group(s) — review before saving"), not only that the link was cleared | E2E (F-8's removal test asserts the fuller message) |
| F-7 | LOW | **Fixed** | `src/ui/workout/groupSelection.ts`'s `describeGroupLink` gained a `groupPrefills` parameter and a `fallbackLoadKg` field reporting the ACTUAL resolved fallback value (or `null`); `GroupLinkNote` now shows that concrete number ("using this group's own prefill (X kg)") when one exists, and an honest "no carry-forward or baseline yet" sentence when it doesn't — accurate in both the carry-forward and baseline cases without needing to distinguish which produced the number | Unit (3 new tests) |
| F-8 | LOW | **Fixed** | `src/ui/prescriptions/PrescriptionForm.tsx` — `sanitizeGroupLinks` (+ `emptyGroupDraft`/`randomDraftId`/the `GroupDraft` type) exported for direct unit testing | Unit (new file, 8 tests covering all three invalidation causes plus the "not yet chosen" and "isolated clearing" edge cases) + E2E (2 new browser tests: reference removal, reference becoming linked — in addition to the existing reorder test) |
| F-9 | LOW | **Fixed** | This document, §7 — the frozen/offline/adoption row now attributes the original executed coverage to the independent review (its own PROBE C, since deleted per that report's task-owned-probe convention), not to inherited Stage A evidence that never actually contained a `link`; `tests/e2e/setGroups.spec.ts` gained a durable, permanent regression reproducing the same offline-completion → offline-reload → cross-device-adoption journey for a linked group | E2E (new durable regression, §12.3) |

### 12.2 F-1 and F-2 — why these fixes, not the alternatives considered

**F-1.** §11.4's "no re-derivation happens on a render... only the two selection-change events above
re-derive" was written for Stage A, where every prefill source is static while a group stays selected.
Stage B's link is the first prefill source that changes mid-session without a selection change — the
review correctly identified that neither §11.4 nor §6.2 alone resolves the conflict Stage B introduced.
The fix keeps §11.4's rule for everything it actually governs (a dirty draft, an independent group's
prefill, a recommendation decision) and adds exactly the one case §6.2 requires: a CLEAN, not-yet-logged
linked group's proposal follows its reference. Scoping the new effect to `!dirty && !selectedGroupHasOwnLog`
is what keeps every existing Stage A guarantee intact — a dirty draft is never touched by ANY change
to the reference (proven by the negative control passing with the fix disabled and the real test passing
with it present), and once the linked group has its own logged set, `groupPrefill`'s pre-existing "last
set logged in this group" rule already takes priority, so this effect's own guard against
`selectedGroupHasOwnLog` is what keeps "later sets copy own log" (§6.2's other row) unaffected.

**F-2.** Two remediation shapes were available: a write-time supersede-on-link (superseding any pending
recommendation for a group the moment it becomes linked) or a read-time filter at the shared resolution
point. Write-time supersession was rejected: a prescription update has no single reliable `blockId` to
scope a `supersedePending` call against (a template can be scheduled by more than one block, and
`supersedePending`'s existing signature is deliberately block-scoped, matching every other supersession
in the codebase), so a correct write-time fix would need new plumbing beyond this finding's scope. The
read-time filter needs no such plumbing and is provably sufficient: `resolveGroupRecommendation` is
already the ONE shared function both bundle assembly and cross-device resume call through (its own
existing doc comment says so), so bailing out there when `isLinked` closes the surface everywhere at
once; a recommendation that can never be surfaced can never be decided through the UI, and
`getLatestDecisionChosenByExercise` (which feeds `groupPrefills`' fallback for a later session) only
ever reads ALREADY-decided (`accepted`/`modified`) rows — never `pending` ones — so a merely-pending
record that becomes permanently unreachable can never reach that path either.
<!-- WITHDRAWN 2026-09-13 by the targeted remediation verification
     (set-groups-stage-b-remediation-verification.md §5, finding V-1), pointer added under its bounded
     documentary-closeout authorisation; the sentence above is left in place for provenance and must NOT
     be read as a current description. "Permanently unreachable" is false: the bail-out is keyed on the
     group's CURRENT link status, so UNLINKING the group makes the same never-superseded pending record
     live again — reproduced there in the browser, where it returned to the bundle, rendered an
     "Accept 102.5 kg" card and became the group's prefill two sessions after it was computed. The FIX
     itself is verified sound and is not reopened; only this justification for it is withdrawn. Not
     independently reviewed by anyone else. --> The render-order fix in
`ExerciseCard.tsx` is added as defence in depth (a cached bundle from before this fix, or any future
regression in the server-side filter, still cannot render a decision surface for a linked group), not
because the server-side fix alone was judged insufficient — the negative control (§12.4) demonstrates
the server-side fix alone already closes the reproduced defect.
**Frozen-session semantics, checked and unaffected:** `getActiveSession`'s `isLinked` input for an
IN-PROGRESS session comes from that session's own FROZEN `scheme.groups[].link` (`session_exercises
.prescription`, ADR-007), never the live `exercise_prescriptions` row — a template edit made while a
session is running cannot retroactively change what that session's own resume path considers linked,
exactly preserving the existing frozen-snapshot guarantee. Bundle assembly's own `isLinked` input is the
live scheme, which is correct there since no session (and no snapshot) exists yet.

### 12.3 Exact manifest — files touched in this remediation pass

**Source:**
- `src/ui/workout/ExerciseCard.tsx` — F-1 (second re-derivation effect, `GroupLinkNote`'s dirty/fallback-
  aware text, `groupPrefills` threaded into `describeGroupLink`), F-2 (render-branch reorders to check
  `group.link` before any `rec`).
- `src/ui/workout/groupSelection.ts` — F-7 (`describeGroupLink` gains `groupPrefills` param and
  `fallbackLoadKg` field).
- `src/server/progression/service.ts` — F-2 (`resolveGroupRecommendation` gains the `isLinked`
  parameter and bail-out).
- `src/server/today/service.ts` — F-2 (both `resolveGroupRecommendation` call sites pass
  `group.link !== undefined`).
- `src/ui/prescriptions/PrescriptionForm.tsx` — F-3 (load-effect + submit-time forced-manual for a
  linked group), F-6 (`linkNotice` wording), F-8 (`sanitizeGroupLinks`/`emptyGroupDraft`/
  `randomDraftId`/`GroupDraft` exported).

**Documentation:**
- `docs/architecture/prescription-model.md` §2 — F-4 (the actual stale sentence corrected).
- `docs/reviews/set-groups-stage-b-implementation.md` — this document: F-5 (arithmetic), F-9
  (attribution), plus the §7 row corrections for F-1/F-2, and this §12.

**Tests (all additive):**
- `tests/unit/setGroups/groupSelection.test.ts` — +3 (F-7, `fallbackLoadKg`). 29 → 32.
- `tests/unit/setGroups/prescriptionFormLinkSanitize.test.ts` (new) — +8 (F-8).
- `tests/integration/setGroups.integration.test.ts` — +1 (F-2's service-level reproduction). 33 → 34.
- `tests/e2e/setGroups.spec.ts` — +6 in one new `test.describe` block (F-1, F-2, F-3, two F-8 tests,
  F-9). 7 → 13.

### 12.4 Negative controls executed (agent-workflow §6 — required for HIGH/MEDIUM findings)

Mechanics followed exactly: exact-byte backup via `Get-FileHash`/`Copy-Item` to the Windows temp
directory (never a probe copy inside the repo) before each mutation, production rebuild + server
restart on the task-owned database/port to make each mutation observable, then byte-identical restore
verified by SHA-256 before rebuilding the real fix back in.

| Control | Command | Expected | Observed | Restored |
|---|---|---|---|---|
| NC-F1 — the re-derivation effect is load-bearing | `src/ui/workout/ExerciseCard.tsx`: replace the effect's guard with an unconditional `return`; rebuild; run `setGroups.spec.ts -g "F-1 — the linked group"` | the "follows a reference edit" assertion fails (box stays stale) | **Failed exactly as expected** — `expect(weightInput).toHaveValue("112.5")` received `"105"` (the pre-edit clean value, never re-derived) | `identical` (SHA-256 `0A5C141F…`) |
| NC-F2 — the `isLinked` bail-out is load-bearing | `src/server/progression/service.ts`: change `if (isLinked) return undefined;` to `if (false && isLinked) return undefined;`; run `tests/integration/setGroups.integration.test.ts -t "linking a group that already holds a pending recommendation"` | the bundle/resume assertions fail (Back-off's key reappears) | **Failed exactly as expected** — `expected ['36qg29hg'] but got ['36qg29hg','umd4nyda']` (Back-off's own key back in the bundle) | `identical` (SHA-256 `924081DA…`) |
| NC-F3 — the forced-manual fix (both halves) is load-bearing | `src/ui/prescriptions/PrescriptionForm.tsx`: revert both the load-effect's `g.link ? "manual" : …` and the submit-time `g.linkEnabled ? "manual" : …`; rebuild; run `setGroups.spec.ts -g "F-3 — changing the slot strategy"` | the save fails (HTTP 400 `incompatible_prescription`, reproducing the review's PROBE D) | **Failed exactly as expected** — `page.waitForURL` timed out because the edit page never redirected (the save was rejected) | `identical` (SHA-256 `D460C45A…`) |

F-4 through F-9 are LOW and are documentation/test-coverage corrections respectively — per
agent-workflow §6's "inspection only" class (documentation corrections; pure-function/UI-copy tests
whose expected values visibly differ from the pre-fix output), none required an executed negative
control, and none received one.

### 12.5 Environment, task-owned resources and pairing

Followed the same isolated-resource discipline the review itself modeled (its §2), correcting the
ORIGINAL pass's own disclosed deviation (§8.1/§8.2 above) rather than repeating it.

| Resource | What was created | Pairing proof |
|---|---|---|
| Database | `gymapp_t_sgbrem` (created, migrated to `0014`, `drizzle-kit check` clean, seeded twice, used for every gate/negative-control run in this pass) | user `e2e-smoke@example.com` created at `2026-09-13 13:34:35+00` in `gymapp_t_sgbrem` versus the shared `gymapp`'s own same-email row at `2026-08-29 14:30:40+00` — different databases, confirmed by timestamp, not assumed |
| App server | One production server (`pnpm build && pnpm start`) on port 3000, `DATABASE_URL` pointed at `gymapp_t_sgbrem`; rebuilt and restarted three times (once per negative control, once for the final clean run) — each restart confirmed the prior listener was this task's own before stopping it | port 3000 was free before the first start; each subsequent restart confirmed nothing else was listening before starting |

The shared `gymapp` database was not migrated, seeded, or otherwise modified by this remediation pass.
No suite ran against it. No suite overlapped another (each Playwright/build invocation was run to
completion before the next).

#### 12.5.1 Self-inflicted schedule-contamination incident (diagnosed and resolved)

The first two full `pnpm test:e2e` runs against `gymapp_t_sgbrem` each showed roughly twenty failures
outside Set Groups entirely — `sync-auth-expiry`, `takeover`, `warmupSetClassification` (six cases),
`offline-sync` (two), `progression`, `reconnect-batch-idempotence` (two), `set-deletion`, `deload`,
`offline-recommendation`, `offline-set-edit-delete`, `offline-bodyweight-recovery`, `network-flap`,
`duplicate-replay`, `lost-response-retry`, `warmupRoutines`, `transient-failure-fifo`. The failures
reproduced identically across both runs, ruling out ordinary flakiness, and none of these files were
touched by this remediation pass.

Per the task instruction not to explain failures through passing retries alone, the cause was
root-caused with a direct, read-only SQL query against `gymapp_t_sgbrem` — no suite was re-run to
"see if it passed this time." That query found `block_schedule_entries` for the active seed block
pointed at `"E2E DIAG Dirty 1789307012813 Template"`, an unarchived scratch template, instead of the
seed's own `"E2E Phase 3 Day"` template. The cause was this remediation pass's own tooling: while
debugging F-1's dirty-draft interaction, a throwaway, un-hooked diagnostic script
(`tests/e2e/zzdiag-dirty.spec.ts`, never part of the delivered suite and deleted once its diagnosis was
extracted — see §12.7) called `applyScheduleOverride` with no `afterEach` cleanup, permanently
repointing the task-owned database's schedule row.

Fix applied directly against `gymapp_t_sgbrem` (never the shared `gymapp` database):

```sql
DELETE FROM block_schedule_entries WHERE block_id = '01a09afa-a9c7-7ad6-bc46-75bc82d98849';
INSERT INTO block_schedule_entries (id, block_id, template_id, position, weekdays)
VALUES (gen_random_uuid(), '01a09afa-a9c7-7ad6-bc46-75bc82d98849',
        '01a09afa-a9b5-75c9-8d37-08a0c7354aad', 0, NULL);
UPDATE workout_templates SET archived_at = now()
  WHERE name LIKE 'E2E DIAG Dirty%';
```

followed by a `SELECT` confirming the schedule entry once again pointed at the seed template. The
third full run, on the corrected data with no code changes, produced the clean **171 passed, 0
failed** cited in §12.6 — fully confirming the schedule row was the sole cause and that the affected
suites were never actually broken by this pass's source changes. This is a self-inflicted environment
issue from this remediation pass's own diagnostic tooling, not one of F-1–F-9, and not a defect in the
delivered fix; it is disclosed here in full rather than silently absorbed, per the task's evidence-honesty
instruction.

### 12.6 Test evidence (remediation pass, final tree)

- **Unit** (`pnpm test:unit`): **1419 passed**, 0 failed, 97 files (was 1408/96 before this pass; +11 =
  +3 F-7 + +8 F-8 new file).
- **Integration** (`pnpm test:integration`, PGlite): **506 passed, 17 skipped, 0 failed**, 35 files
  (was 505 before this pass; +1 = F-2's service-level test). `setGroups.integration.test.ts` alone: 34
  passed.
- **Quality gates:** `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:sw`, `pnpm format:check` — all clean
  on the final tree, on the task-owned pairing.
- **E2E** (`pnpm test:e2e`, real Chromium, `gymapp_t_sgbrem`, a production server built fresh and
  restarted after the negative controls): **171 passed, 0 failed** (third and final run — see §12.5.1
  for why the first two full-suite runs are not being cited as evidence). `tests/e2e/setGroups.spec.ts`
  alone: 13 passed (4 Stage A + 3 original Stage B + 6 new remediation tests); `tests/e2e/setGroupsOffline.spec.ts`
  (untouched): 1 passed.

### 12.7 Limitations and residual notes (not new findings; recorded for completeness)

- ~~**`linkNotice` is transient and overwritten by ANY subsequent group-list mutation**, even an
  unrelated one on a different field of the SAME group that triggered it — discovered while writing
  F-8's "reference becomes linked" test (the notice had to be asserted immediately after the
  invalidating checkbox toggle, before the same group's own reference/percent were filled in, or a
  later, unrelated `sanitizeGroupLinks` call would silently clear it back to `null`). This is
  pre-existing behaviour of `updateGroups` (unconditionally calling `setLinkNotice` on every mutation),
  not something this pass introduced, and is not one of F-1…F-9 — recorded here rather than silently
  worked around, since a real user editing multiple fields in sequence could similarly lose sight of an
  earlier warning. Not fixed in this pass (out of the review's named scope); worth a future LOW finding
  if device acceptance surfaces it as a real confusion.~~ **FIXED by V-2 (§13) — see
  set-groups-stage-b-remediation-verification.md §7.** The independent verification judged this on
  consequence rather than scope and ranked it LOW; the owner subsequently authorised it for correction
  alongside V-1/V-3. `updateGroups` no longer clears the notice on an unrelated mutation; it now clears
  only on a fresh invalidation (with an accurate, fully-replaced message), an explicit "Dismiss"
  control, or a successful save.
- L-8's review-noted widening (§10 above) and L-7's reverse-conversion asymmetry remain open,
  unchanged, carried forward per the review's own §8.3.
- The historical Set Groups dead-letter (`setGroupsOffline.spec.ts`) was not observed in this pass's
  runs. Cause remains unresolved, unchanged from both prior reports.
- Device (iPhone) acceptance not performed, not claimed. A+B remain one release.
- No production access, staging, commit, push, or deployment — this pass, like the original.

### 12.8 Drop what was created, list what was not

**Created and left in place (outside the repository):**
<!-- Corrected 2026-09-13 by the targeted remediation verification (set-groups-stage-b-remediation-verification.md
     §7, V-4) under its bounded documentary-closeout authorisation. The heading previously read "Created
     and dropped", which contradicted this bullet's own "left in `%TEMP%`"; the three files were still
     present when the verification checked. Not independently reviewed by anyone else. -->
- Three Windows-temp backup files (`nc-f1-exercisecard-backup.tsx`, `nc-f2-service-backup.ts`,
  `nc-f3-prescriptionform-backup.tsx`) — outside the repo, session-scratchpad-equivalent; superseded by
  each restore and **left in `%TEMP%`**, not deleted (not repo-visible, no cleanup action needed beyond
  the restores already verified).

**Created and dropped:**
- Two throwaway diagnostic Playwright specs (`tests/e2e/zzdiag-inspect.spec.ts`,
  `tests/e2e/zzdiag-dirty.spec.ts`) used to isolate the F-1 test's own selector bug from the real
  ExerciseCard fix — both deleted; `git status` shows no trace.

**Created and since dropped:**
- Database `gymapp_t_sgbrem` — used for every gate and negative control in this pass (§12.5), dropped
  after the final E2E run confirmed above; `SELECT datname FROM pg_database WHERE datname LIKE
  'gymapp_t_%'` returns no rows afterward, and the shared `gymapp` database is confirmed still present
  and untouched.
- The one production app server bound to it (`pnpm start` on port 3000, `next start`, PID confirmed via
  its command line before being stopped) — stopped once the final E2E run completed; port 3000
  confirmed free afterward.

**Created and deliberately left behind:**
- This document and its edits, plus every source, test and documentation file §12.3 lists — all
  uncommitted, like the rest of the Set Groups lineage.
<!-- Corrected 2026-09-13 by the targeted remediation verification (set-groups-stage-b-remediation-verification.md
     §7, V-4). This bullet previously called the report "the only file this task is authorised to modify",
     which contradicts §12.3's own source/test manifest: a bounded remediation of F-1…F-9 necessarily
     changes product code and tests. The original pass's report-only wording (§11) was correct for THAT
     pass and was carried over here in error. Not independently reviewed by anyone else. -->

READY FOR TARGETED SET GROUPS STAGE B REMEDIATION VERIFICATION

## 13. V-1…V-3 remediation (dated 2026-09-13, third pass)

The independent targeted verification of §12
([set-groups-stage-b-remediation-verification.md](set-groups-stage-b-remediation-verification.md))
closed **VERIFIED — READY FOR SET GROUPS A+B RELEASE CLOSEOUT**, carrying V-1 (MEDIUM), V-2 (LOW) and
V-3 (LOW) forward as accepted, undirected limitations (§9 of that report). The owner has since
explicitly selected all three for correction before the A+B release, so they are authorised scope here
— not a reopening of the verification's own verdict, which stands. V-4 was already corrected directly
by that verification under its own bounded documentary-closeout authorisation (§12.8 above) and needs
no further action.

### 13.1 Disposition table

| Finding | Severity | Status | What changed | Evidence |
|---|---|---|---|---|
| V-1 | MEDIUM | **Fixed** | `assembleAndEvaluate` (`src/server/progression/service.ts`) now supersedes a linked group's own pending record at session-COMPLETION time whenever a real set was actually logged into that group this session, closing the gap `evaluateGroupedExercise`'s `if (group.link) continue` left: no session completed while linked ever superseded the record, so unlinking made a pre-link target reachable again, unchanged | Integration (2 new tests), E2E (1 new browser test), NC-V1 (executed, §13.4) |
| V-2 | LOW | **Fixed** | `updateGroups` (`PrescriptionForm.tsx`) no longer clears `linkNotice` on an unrelated group-list mutation; it clears only on a fresh invalidation (fully replacing the message with the current, accurate one), an explicit "Dismiss" control, or a successful save | E2E (existing F-8 "reference becomes linked" test extended to assert persistence + dismissal) |
| V-3 | LOW | **Fixed** | The F-1 delete-guard assertion (`tests/e2e/setGroups.spec.ts`) now targets a non-exact `"160 kg"` match (asserted 1 before, 0 after) instead of an exact match on `"160 kg × 2"`, which was zero before the delete too (an always-vacuous guard, since `formatSetLine` appends the logged RIR) | E2E (existing test corrected), demonstrated failing when deletion is skipped (§13.5) |
| V-4 | LOW | Already fixed by the verifier, under its own authorisation | Two documentary corrections in §12.8 | n/a — no action taken here |

### 13.2 V-1 — the chosen rule, why it differs from the shape F-2 already rejected, and the coherence checks

The review's own §7 reasoning is exactly right that the underlying defect class predates Stage B (a
Stage A group switched to `manual` behaves identically — its pending record is never superseded either
— it simply never gets HIDDEN first, so it never appears to "resurface"). The fix therefore targets the
resurfacing mechanism precisely, not the broader class: it fires only when a group's own frozen
snapshot shows `link` truthy AND that group actually has a logged set in the session being completed.
<!-- CORRECTED IN PLACE 2026-09-13 by the W-1…W-3 remediation (§14; set-groups-release-residual-verification.md
     §7). The rule as originally stated here omitted three conditions the release-residual verification
     found missing: it must additionally hold only for `mode === "initial"` (never `reevaluate` — W-1),
     never for a deload session (W-3), and its candidate enumeration must not depend on
     `hasEvaluableStrategy` (W-2). See §14.1 for the full behaviour matrix and §14.2 for the dispositions. -->
The full, corrected statement of the rule is: it fires only when (a) `mode === "initial"`, (b) the
session is not a deload, (c) a group's own frozen snapshot shows `link` truthy, and (d) that group
actually has a logged, non-warm-up set in the session being completed — regardless of whether the
group's own slot has any other evaluable (non-manual) strategy.

**Why this is not the write-time supersede-on-link shape §12.2 already rejected.** That shape would run
at a prescription-EDIT moment, where no single reliable `blockId` exists to scope a `supersedePending`
call against (a template can be scheduled by more than one block) — a genuine scope expansion, correctly
left alone. This fix instead runs inside `assembleAndEvaluate`, at SESSION-COMPLETION time, where
`session.blockId` is already well-defined and is the exact value every other `supersedePending` call in
this function already uses. Scoping to it is the existing convention, not a new limitation — and it is
also why a stale record filed under a *different* block that happens to schedule the same template is
deliberately left untouched: "preserve other blocks" (a stated constraint) falls out of using the same
scoping every other caller already relies on, not from any special-casing.

**Coherence checks (both covered by dedicated tests, §13.3):**
- **Link → unlink with NO intervening workout.** Nothing became stale (no session ever ran the
  "linked-and-performed" branch), so the fix never fires, and the pre-existing pending record correctly
  reappears unchanged after unlink — proving the fix supersedes on real, logged work only, never on the
  link/unlink transition itself. (`V-1 coherence` integration test.)
- **The analogous manual-strategy transition.** A group whose effective strategy is `manual` (Stage A,
  unrelated to `link`) hits the same "no evaluation, no supersession" gap, but was deliberately left
  untouched: the fix's guard is `group.link`, never `strategyId === "manual"`. Widening it to cover the
  manual case would be exactly the "broader recommendation redesign" the task keeps out of scope, and
  the manual case doesn't exhibit the SAME symptom anyway (F-2 never hides a manual group's card, so
  there is no hide/reveal oscillation to fix — the review's own §7 calls this "the stale card simply
  shows continuously," a distinct, unfixed, pre-existing limitation, carried forward unchanged below).

**Preservation, verified, not merely asserted:**
<!-- NARROWED 2026-09-13 by the release-residual verification
     (set-groups-release-residual-verification.md §7, finding W-1), pointer added under its bounded
     documentary authorisation; the list below is left in place for provenance. It is INCOMPLETE, not
     wrong: every bullet it makes was independently confirmed, but the list does not consider
     `assembleAndEvaluate`'s OTHER mode. The new loop runs in `reevaluate` mode too, without the
     per-(slot, groupKey) still-pending guard that `toPersist` gives the neighbouring supersede call, so
     correcting a set in an older session frozen as LINKED supersedes a NEWER, legitimate pending record
     for that group. Reproduced there with an attribution control (same journey, loop toggled: record
     survives with the loop off, is destroyed with it on). Read "Preservation, verified" as covering the
     `initial` path only. My own edit; not independently reviewed by anyone else. -->
- *Frozen semantics for an already-running session* — the new logic reads/writes only completed
  sessions' own data; it never touches `getActiveSession`'s frozen-snapshot resolution, and the V-1
  integration test explicitly polls `getActiveSession` mid-session (started, not yet completed, while
  linked) and confirms Back-off still shows nothing and Top still shows its own real pending record,
  before the fix's supersede ever runs.
- *Independent sibling groups and other blocks/slots* — `supersedePending`'s existing `groupKeyScope`
  and `blockScope` do this by construction; the V-1 integration test confirms Top's own pending
  lineage is completely unaffected by Back-off's supersession.
- *Historical logged facts and already-decided records* — `supersedePending`'s `WHERE decisionStatus =
  'pending'` clause is unchanged; an accepted/modified row is never touched, matching every other
  caller in this file.
- *Existing linked-group filtering and offline/replay guarantees* — `resolveGroupRecommendation` and
  its `isLinked` bail-out are untouched by this fix; the new call is an ordinary `UPDATE … WHERE
  decisionStatus = 'pending'`, idempotent under replay like every other supersede call here.
- *New recommendations from subsequent eligible sessions* — the V-1 integration test completes a THIRD
  session, post-unlink, evaluated normally, and confirms a FRESH pending record appears, sourced from
  that session.

### 13.3 Exact manifest — files touched in this remediation pass

**Source:**
- `src/server/progression/service.ts` — V-1 (`assembleAndEvaluate` gains the supersede-if-
  linked-and-performed loop, documented inline).
- `src/ui/prescriptions/PrescriptionForm.tsx` — V-2 (`updateGroups` only sets `linkNotice` on a fresh
  invalidation, never clears it on an unrelated mutation; new "Dismiss" control; cleared on a
  successful save).

**Tests:**
- `tests/integration/setGroups.integration.test.ts` — +2 (V-1's real-service reproduction — mid-session
  preservation, supersession on real logged work, no resurfacing after unlink, fresh subsequent
  progression — and V-1's own link→unlink-with-no-workout coherence check).
- `tests/e2e/setGroups.spec.ts` — +1 new browser test (V-1's full link → linked-session-with-real-work →
  unlink journey through the real editor, asserting no competing "Accept" card and no stale
  `groupKey` in the bundle); the existing "F-8 — a reference group itself becoming linked" test extended
  to assert the notice survives an unrelated field edit and clears on explicit "Dismiss" (V-2); the
  existing F-1 test's delete-guard assertion corrected to a discriminating, non-exact match (V-3).

**Documentation:**
- `docs/reviews/set-groups-stage-b-implementation.md` — this document: header status line; §12.7's
  `linkNotice` limitation struck through and marked fixed by V-2; this §13.

No other file was touched. The concurrent, unrelated PI-017 (repository-agent-workflow) work was not
inspected or modified.

### 13.4 Negative control executed (agent-workflow §6 — required for a MEDIUM finding)

Same mechanics as §12.4: exact-byte backup via `Get-FileHash`/`Copy-Item` to the Windows temp directory
before the mutation, then byte-identical restore verified by SHA-256 before rebuilding the real fix back
in.

| Control | Command | Expected | Observed | Restored |
|---|---|---|---|---|
| NC-V1 — the session-completion supersede loop is load-bearing | `src/server/progression/service.ts`: wrap the new loop body in `if (false) { … }`; run `tests/integration/setGroups.integration.test.ts -t "V-1"` | the "does not resurface after unlink" assertion fails (the stale record stays `pending` instead of becoming `superseded`) | **Failed exactly as expected** — `expect(session1BackoffAfter?.decisionStatus).toBe("superseded")` received `"pending"`; the coherence test (which asserts the OPPOSITE — that nothing is superseded with no intervening workout) still passed, confirming the control isolated the right code path | `identical` (SHA-256 `2F848D16F9EF796AAC5DCDA68C92E93279A194A4AA8D7A5862087B2BF471BDC0`, matching the pre-mutation hash) |

V-2 and V-3 are LOW and fall under agent-workflow §6's "inspection only" class (a UI-copy/lifecycle fix
covered by an E2E assertion whose selector/expected-value visibly changed); neither required an executed
negative control under that policy. V-3's own task text additionally required demonstrating the guard
fails when deletion is skipped — done directly (§13.5) rather than relying on the general LOW exemption.

### 13.5 V-3 demonstration — the guard fails when deletion is skipped

`tests/e2e/setGroups.spec.ts` backed up byte-exact (SHA-256 `E0D3820BF2BC7C0DBDC684E3E79802560A5EC92F5F832DC72565DBFC132A522E`); the F-1 test's delete-click line was commented out and
`setGroups.spec.ts -g "F-1 — the linked group"` run against the task-owned server:

```
Error: expect(locator).toHaveCount(expected) failed
Locator:  locator('li:not(:has(li))').filter({ hasText: '160 kg' })
Expected: 0
Received: 1
```

**Failed exactly as expected** — a skipped delete is caught, unlike the pre-fix exact-match guard, which
could never fail regardless of whether the delete happened. Restored byte-identical (SHA-256 matched the
pre-mutation hash); the F-1 test re-run clean afterward.

### 13.6 A second self-inflicted environment incident — root-caused and disclosed, not silently absorbed

Executing §13.5's demonstration left one Playwright `page.once("dialog", …)` handler armed (registered
immediately before the now-commented-out delete click, which never fired to consume it). The shared
`test.afterEach` hook's own "Discard workout" confirmation later triggered the SAME single dialog event,
which both the dangling handler and the hook's own handler tried to accept — `afterEach` threw
`Error: dialog.accept: Cannot accept dialog which is already handled!` before reaching either
`restoreSchedule` or `archiveTemplate`, leaving the task-owned database's `block_schedule_entries`
pointed at that test's own scratch template ("E2E SG F1 …", left unarchived).

This reproduced the exact same failure signature as the PRIOR remediation pass's schedule-contamination
incident (§12.5.1) — `deload`, `duplicate-replay`, `lost-response-retry`, `network-flap`,
`offline-bodyweight-recovery`, `offline-recommendation`, `offline-set-edit-delete`, `offline-sync` (×2),
`progression`, `reconnect-batch-idempotence` (×2), `set-deletion` — in the first full `pnpm test:e2e`
run against the corrected code. The FIRST full run was aborted (not counted as evidence) once a direct,
read-only SQL query against `gymapp_t_sgres` confirmed the same class of cause, root-caused this time to
a distinct mechanism (a dangling demonstration-only dialog handler, not a leftover diagnostic script).
Fixed directly against the task-owned database only:

```sql
UPDATE block_schedule_entries SET template_id = '01a09b6b-4f17-71f2-90c6-180ae5748969'
  WHERE block_id = '01a09b6b-4f28-745a-b3ec-790b94af84a7';
UPDATE workout_templates SET archived_at = now()
  WHERE name LIKE 'E2E SG F1%' AND archived_at IS NULL;
```

followed by a `SELECT` confirming the schedule again pointed at the seed template with no unarchived
scratch templates remaining. The SECOND full run, on the corrected data with no further code or test
changes, produced the clean **172 passed, 0 failed** cited in §13.7. Recorded here in full, per the same
evidence-honesty standard §12.5.1 set, rather than silently re-run past.

### 13.7 Test evidence (this pass, final tree)

- **Unit** (`pnpm test:unit`): **1419 passed**, 0 failed, 97 files — unchanged from §12.6 (this pass
  added no unit tests; V-1 is inherently a DB-interacting fix, covered at the integration level, and
  V-2/V-3 are UI-lifecycle/E2E-only).
- **Integration** (`pnpm test:integration`, PGlite): **508 passed, 17 skipped, 0 failed**, 35 files (was
  506 before this pass; +2 = V-1's two new tests). `setGroups.integration.test.ts` alone: 36 passed.
- **Quality gates:** `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:sw`, `pnpm format:check` — all clean
  on the final tree, on the task-owned pairing (re-run after the negative controls and the schedule fix,
  not merely carried over from an earlier pass).
- **E2E** (`pnpm test:e2e`, real Chromium, `gymapp_t_sgres`, a production server built fresh): **172
  passed, 0 failed** (second, clean run — see §13.6 for why the first is not cited as evidence).
  `tests/e2e/setGroups.spec.ts` alone: 14 passed (13 from §12.6 + V-1's new browser test);
  `tests/e2e/setGroupsOffline.spec.ts` (untouched): 1 passed.

### 13.8 Limitations and residual notes (not new findings; recorded for completeness)

- The Stage A `manual`-strategy analogue to V-1 (§13.2) remains open and unfixed, as it was before this
  pass and before the review that first named it — a group whose effective strategy is `manual` still
  shows its stale pending card continuously (never hidden, so never "resurfacing"), which is a distinct
  mechanism from V-1 and out of this task's scope.
- L-7, L-8, and the general Stage A group add/remove/reorder browser-coverage gap remain open, unchanged,
  carried forward per the review's own §8.3 and the targeted verification's §9.
- The historical Set Groups dead-letter (`setGroupsOffline.spec.ts`) was not observed in this pass's
  runs. Cause remains unresolved, unchanged from all three prior reports.
- Device (iPhone) acceptance not performed, not claimed. A+B remain one release.
- No production access, staging, commit, push, or deployment — this pass, like both before it.

### 13.9 Environment, task-owned resources and pairing

| Resource | What was created | Pairing proof |
|---|---|---|
| Database | `gymapp_t_sgres` (created, migrated to `0014`, seeded twice, used for every gate/negative-control/demonstration run in this pass, dropped at the end) | user `e2e-smoke@example.com` created at `2026-09-13 15:38:07+00` in `gymapp_t_sgres` versus the shared `gymapp`'s own same-email row at `2026-08-29 14:30:40+00` — different databases, confirmed by timestamp |
| App server | One production server (`pnpm build && pnpm start`) on port 3000, `DATABASE_URL` pointed at `gymapp_t_sgres`; built once, started once, stopped once at the end | port 3000 was free before the first start (confirmed) and free again after the stop (confirmed); PID's own command line confirmed as this task's `next start` before being stopped |

The shared `gymapp` database was not migrated, seeded, or otherwise modified by this pass. No suite ran
against it. No suite overlapped another.

### 13.10 Drop what was created, list what was not

**Created and dropped:**
- Database `gymapp_t_sgres` — `SELECT datname FROM pg_database WHERE datname LIKE 'gymapp_t_%'` returns
  no rows afterward; the shared `gymapp` database confirmed still present and untouched.
- The one production app server bound to it — stopped; port 3000 confirmed free (no `LISTEN`/`ABHÖREN`
  entry) afterward.
- Playwright's `test-results/` artefacts from the aborted first E2E run and the demonstration — removed.
- The one orphaned scratch template created by §13.6's incident — archived directly (SQL above), not
  deleted, matching the app's own soft-delete convention for templates.

**Created and left in place (outside the repository):**
<!-- Corrected 2026-09-13 by the release-residual verification
     (set-groups-release-residual-verification.md §7, W-4) under its bounded documentary authorisation.
     The two backup files were listed under "Created and dropped" while the same bullet said they were
     "left in place" — the identical category error V-4 corrected in §12.8, repeated here. Both were
     still on disk when the verification checked, and it used them (its §5) to corroborate the restores.
     My own edit; not independently reviewed by anyone else. -->
- Two negative-control/demonstration backup files (`nc-v1-service-backup.ts`, `nc-v3-spec-backup.ts`) in
  this session's scratchpad directory — outside the repo, session-scoped, **left in place**, not
  deleted, like §12.8's equivalents.

**Created and deliberately left behind:**
- This document and its edits, plus the two source and two test files §13.3 lists — all uncommitted,
  like the rest of the Set Groups lineage.

READY FOR TARGETED SET GROUPS RELEASE-RESIDUAL VERIFICATION

## 14. W-1…W-3 remediation (dated 2026-09-13, fourth pass)

The targeted release-residual verification of §13
([set-groups-release-residual-verification.md](set-groups-release-residual-verification.md)) confirmed
V-1, V-2 and V-3 genuinely fixed, but found that the V-1 fix itself introduced three gaps in
`assembleAndEvaluate`'s new supersession loop — verdict **REVISION REQUIRED**. W-4 (two documentary
corrections) was already applied by that verification under its own bounded authorisation (§13.2's
narrowing pointer, §13.10's heading split) and needs no further action here.

### 14.1 Behavior matrix — what the supersession loop must do in each context

<!-- PREMISE CORRECTED 2026-09-13 by the supersession verification
     (set-groups-supersession-verification.md §7, X-1) under its bounded documentary authorisation. The
     `reevaluate` row below, §14.2's W-1 cell, and the matching comment in
     `src/server/progression/service.ts` all justify the rule with: "a linked group … can never have a
     recommendation row sourced from its own slot." That premise is FALSE — the sync `recommendation`
     op validates a client-computed record's group key against the frozen snapshot but never checks
     `link`, and the verification demonstrated the server accepting exactly such a row (rejected=[], one
     pending `computedBy=client` row for the linked group's own key). The CONCLUSION is unaffected and
     was independently verified: `toPersist` is derived from `results`, i.e. `evaluateSession`'s output,
     which never contains a linked group in EITHER mode — so the guard can never permit a supersede for
     a linked key regardless of what rows exist. Read the justification as being about `results`, not
     about rows. The code comment carries the same wrong premise and is left for the owner (outside this
     verification's authorisation); see that report's carried-forward improvements. My own edit; not
     independently reviewed by anyone else. -->

Written before touching code, per task instruction, to resolve W-1/W-2/W-3 as one coherent rule rather
than three patches. The loop's behaviour is governed by two independent SESSION-level gates (does it run
at all this call) and, when it runs, two independent PER-GROUP conditions (does this particular group
trigger a supersede).

**Session-level gates — does the loop run at all:**

| Mode | Session type | Loop runs? | Why |
|---|---|---|---|
| `initial` (first evaluation of a just-completed session) | normal | **Yes** | The only context in which a session's own frozen link/performed state is a NEW fact — the rule exists for exactly this. |
| `initial` | deload | **No (W-3)** | A-15/`recommendationForDeload`: a deload session changes no recommendation state, full stop. Superseding a pending record is a state change; the loop must not run before `evaluateSession`'s own `isDeload` short-circuit does. |
| `reevaluate` (correcting an already-completed, already-evaluated session) | normal | **No (W-1)** | A linked group's OWN evaluation is always skipped (`evaluateGroupedExercise`'s `if (group.link) continue`, unconditional on mode), so it can never have a self-sourced recommendation row. The neighbouring `toPersist` guard's condition for `reevaluate` — "the record sourced from THIS slot is still pending" — is therefore never satisfiable for a linked group's key, in EITHER mode. Applying that exact guard to the loop is mathematically equivalent to never running it in `reevaluate` mode at all: there is no case where the guard would permit a supersede that skipping the mode outright would forbid. Implemented as the simpler, equally-correct form: skip the loop entirely when `mode !== "initial"`. |
| `reevaluate` | deload | **No** | Both exclusions apply independently; the deload exclusion is moot here since `reevaluate` already skips it. |

**Per-group conditions — when the loop runs, does THIS group trigger a supersede:**

| Slot eligibility (`hasEvaluableStrategy`) | Group's work this session | Supersede? | Why |
|---|---|---|---|
| Evaluable (≥1 non-manual group/slot strategy) | Linked, ≥1 non-warm-up set logged in this group | **Yes** | V-1's original, verified case. |
| **All-manual** (every group's effective strategy is `manual`, including the linked one) | Linked, ≥1 non-warm-up set logged | **Yes (W-2)** | `hasEvaluableStrategy` answers "does this SLOT have progression to run," an orthogonal question to "does this LINKED group's stale record need invalidating." The loop's own candidate enumeration no longer depends on it (see §14.2); it depends only on `!row.skipped` and a parseable `groups` snapshot, exactly like V-1's original P2 (skipped-slot) exclusion, which is unchanged. |
| Evaluable or all-manual | Linked, **zero** non-warm-up sets logged (warm-up-only) | No | P1, unchanged — `getWorkSetsByExercise` filters `isWarmup = false` before the loop ever sees a set. |
| n/a | Slot **skipped** | No | P2, unchanged — excluded from the candidate list before the loop. |
| Evaluable or all-manual | Group **not** linked (Stage A `manual`-strategy analogue, or an ordinary independent group) | No | Unchanged, deliberately out of scope — see §13.2's coherence discussion; the guard is `group.link`, never `strategyId`. |

### 14.2 Disposition table

| Finding | Severity | Status | What changed | Evidence |
|---|---|---|---|---|
| W-1 | MEDIUM | **Fixed** | The supersession loop in `assembleAndEvaluate` now runs only for `mode === "initial"`. Proven equivalent (§14.1) to applying the neighbouring `toPersist` guard's own condition, since a linked group can never have a self-sourced recommendation row in either mode — the simpler form was implemented. | Integration (new P6-journey test), NC-W1 (executed, §14.4) |
| W-2 | LOW | **Fixed** | The loop's candidate enumeration no longer depends on `hasEvaluableStrategy`; it now runs over the same base non-skipped/parseable candidate list the rest of the function derives `toEvaluate` from, so an all-manual slot's linked, performed group is still covered. `workSets` widened to match. | Integration (new all-manual test) |
| W-3 | LOW | **Fixed** | The loop is now also gated on `!session.isDeload`, checked directly (it still runs ahead of `evaluateSession`'s own deload short-circuit, so it cannot inherit that check). Documented as an explicit, accepted exception: a deload with a linked, performed group leaves the stale record exactly as reachable after a later unlink as it always would have been. | Integration (new deload test) |
| W-4 | LOW | Already fixed by the verifier, under its own authorisation | Two documentary corrections: the §13.2 narrowing pointer and the §13.10 heading split | n/a — no action taken here |

### 14.3 Exact manifest — files touched in this remediation pass

**Source:**
- `src/server/progression/service.ts` — W-1 (loop gated on `mode === "initial"`), W-2 (candidate
  enumeration and `workSets` no longer scoped by `hasEvaluableStrategy`), W-3 (loop additionally gated on
  `!session.isDeload`). All three changes are inside `assembleAndEvaluate`; no other function touched.

**Tests:**
- `tests/integration/setGroups.integration.test.ts` — +3: W-1's real-service P6 journey (link → linked
  session with real work → unlink with Top moved to a per-group manual override → a third, unlinked
  session evaluates Back-off fresh → a historical correction to the older linked session through the
  real sync path (`reevaluateForSourceSessionExercise`) must not touch the newer record), W-2's
  all-manual-slot completion-and-unlink journey, and W-3's deload-session journey (asserting the deload
  changes zero rows, then that the stale record legitimately resurfaces after unlink).

**Documentation:**
- `docs/reviews/set-groups-stage-b-implementation.md` — this document: §13.2's rule statement corrected
  in place (with an inline correction marker, not a silent rewrite); this §14.

No other file was touched. No `tests/e2e/*` file was touched this pass. The concurrent, unrelated PI-017
(repository-agent-workflow) work was not inspected or modified.

### 14.4 Negative control executed (agent-workflow §6 — required for a MEDIUM finding)

Same backup/restore/hash mechanics as §12.4/§13.4 (exact-byte backup via `Get-FileHash`/`Copy-Item` to the
Windows temp directory before the mutation, byte-identical restore verified by SHA-256 before rebuilding
the real fix back in), but a different RUN environment: entirely against PGlite (via each test file's own
`createTestDb()`), never a real Postgres server or a rebuilt/restarted app server. No task-owned database
or server was created for this control, so there was no shared, stateful fixture for an
intentionally-failing probe to contaminate (§14.6).

| Control | Command | Expected | Observed | Restored |
|---|---|---|---|---|
| NC-W1 — the `mode === "initial"` gate is load-bearing | `src/server/progression/service.ts`: `if (mode === "initial" && !session.isDeload)` → `if (!session.isDeload)` (isolating the mode condition specifically, leaving the deload gate intact); run `setGroups.integration.test.ts -t "W-1"` | the W-1 test fails: the correction to the older linked session kills the newer legitimate record | **Failed exactly as expected** — `expect(session3BackoffAfter?.decisionStatus).toBe("pending")` received `"superseded"` | `identical` (SHA-256 `E3169FA2B3C8DAF6B848B229383BB102BBB9C726C1D18B815913C5B483CC4850`) |

W-2 and W-3 are LOW and fall under agent-workflow §6's "inspection only" class (pure-function/candidate-
enumeration changes whose expected values visibly differ from the pre-fix output, covered by tests that
assert the corrected behaviour directly); neither required an executed negative control under that
policy, and neither received one.

### 14.5 Test evidence (this pass, final tree)

- **Unit** (`pnpm test:unit`): **1419 passed**, 0 failed, 97 files — unchanged (this pass added no unit
  tests; the fix and its regressions are inherently DB-interacting, covered at the integration level).
- **Integration** (`pnpm test:integration`, PGlite): **511 passed, 17 skipped, 0 failed**, 35 files (was
  508 before this pass; +3 = W-1/W-2/W-3's new tests). `setGroups.integration.test.ts` alone: 39 passed.
- **Quality gates:** `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:sw`, `pnpm format:check`, `pnpm
  build` — all clean on the final tree.
- **E2E:** not re-run this pass — see §14.5.1 for why.

#### 14.5.1 Why E2E is reused, not re-run

Per agent-workflow §5's change-class matrix, this change is a **Service change (`src/server`,
non-sync)**: E-level evidence is "full quality gates (E2E only for user-visible flows)," and full E2E is
explicitly listed as **not required "when no route contract changed."** No route's request/response
shape changed here — only which `recommendations` rows end up `superseded` in three specific edge-case
configurations (a historical correction to an older linked session; an all-manual slot; a deload week)
that the existing browser suite does not exercise at all, because they were found by this pass's own
integration-level review, not by any user-visible flow. `tests/e2e/*` files: zero touched (§14.3).

<!-- CORRECTED 2026-09-13 by the supersession verification (set-groups-supersession-verification.md §7,
     X-3). The matrix argument above stands on its own; the paragraph below over-claimed. "The W-1…W-3
     fixes only ADD conditions narrowing exactly when the loop fires" is true of W-1 and W-3 but NOT of
     W-2, which removed `hasEvaluableStrategy` from `candidates` and so changed the execution path of
     EVERY completion whose slot has no evaluable strategy — including an ordinary UNGROUPED MANUAL slot,
     which previously returned early and now runs on with an empty `toEvaluate`. That is an ordinary
     user path, and §13.7's run predates it. The verification therefore did not rely on the reuse: it ran
     the full suite itself against this tree — **172 passed, 0 failed**, first run on a fresh disposable
     database — and separately covered the ungrouped-manual completion at the service level. Read the
     paragraph below as accurate for W-1/W-3 only. My own edit; not independently reviewed by anyone
     else. -->
§13.7's **172 passed, 0 failed** E2E run (on `gymapp_t_sgres`, since dropped) already covers every
*ordinary* linked-completion and unlink path this fix builds on (F-1…F-9, V-1's own browser journey, the
offline/adoption journey) and remains valid evidence for those paths, since nothing about them changed —
the W-1…W-3 fixes only ADD conditions narrowing exactly when the loop fires (`initial` mode, non-deload),
they do not alter its behaviour in the case that E2E suite already covered. Reused here rather than
re-run, per the task's own instruction to reuse unaffected browser evidence where repository rules
permit it.

### 14.6 Environment and task-owned resources

**No task-owned database or server was created for this pass.**
<!-- CORRECTED 2026-09-13 by the supersession verification (set-groups-supersession-verification.md §7,
     X-2) under its bounded documentary authorisation. "Every gate … ran against PGlite" was inaccurate
     and self-contradicting: `lint`, `typecheck`, `typecheck:sw`, `format:check` and `test:unit` touch no
     database at all, and this paragraph then says `pnpm build` resolved whatever `DATABASE_URL` the
     shell held — in this repo `.env.local`, i.e. the SHARED `gymapp`. Narrowed below to what is true.
     No harm resulted: the shared database reads 1 user / 1859 sessions / 433 templates before and after
     both that pass and this verification. My own edit; not independently reviewed by anyone else. -->
The integration suite and the negative control ran
against PGlite (`tests/integration/testDb.ts`'s `createTestDb()`), a fresh in-memory instance created and
torn down per test file run — never shared across tests, never persisted, and never the target of any
other suite. This was a deliberate choice, not an oversight: it is also why NC-W1's intentionally-failing
probe could not leave any fixture state contaminated (§2's "ensure intentional failing probes cannot leave
fixture state contaminated" requirement is satisfied by construction, not by post-hoc cleanup) — unlike
the two prior passes, whose environment incidents (§12.5.1, §13.6) both arose specifically from mutating
state on a real, shared, stateful task-owned Postgres/server pairing. `pnpm build` ran against whatever
`DATABASE_URL` the shell's own environment resolved to (the standard convention for this gate, matching
§5 gate 11 of the prior verification's own evidence table); it performed no migration, seed, or write
against the shared `gymapp` database, and Next.js's production build does not query the database during
the build step for any route in this codebase.

### 14.7 Limitations and residual notes (not new findings; recorded for completeness)

- The Stage A `manual`-strategy analogue to V-1 (§13.2, §13.8) remains open and unfixed, unchanged by this
  pass.
- L-7, L-8, and the general Stage A group add/remove/reorder browser-coverage gap remain open, unchanged.
- The historical Set Groups dead-letter (`setGroupsOffline.spec.ts`) is unaffected by this pass (no E2E
  run occurred to observe it either way); cause remains unresolved, unchanged from all prior reports.
- Device (iPhone) acceptance not performed, not claimed. A+B remain one release.
- No production access, staging, commit, push, or deployment — this pass, like all three before it.

### 14.8 Drop what was created, list what was not

**Created and left in place (outside the repository):**
- One negative-control backup file (`nc-w1-service-backup.ts`) in this session's scratchpad directory —
  outside the repo, session-scoped, left in place, like every prior pass's equivalents.

**Nothing else was created.** No database, no server, no Playwright artefacts, no scratch scripts — see
§14.6.

**Created and deliberately left behind:**
- This document and its edits, plus the one source and one test file §14.3 lists — all uncommitted, like
  the rest of the Set Groups lineage.

READY FOR TARGETED SET GROUPS SUPERSESSION VERIFICATION
