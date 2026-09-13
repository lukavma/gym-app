# Set Groups (PI-012) — Stage A independent review

**Date:** 2026-09-12
**Tree:** `583a9ab` (dirty) — the uncommitted Stage A implementation plus the concurrent work listed in
§1.2. Working tree confirmed byte-identical before and after this review (§1.2).
**Role:** independent review (no implementation, no fixes, no staging, no commit, no push, no deployment,
no production access — none attempted)
**Session:** `S6 | PI-012-A | Review — Set Groups Stage A`
**Model:** claude-opus-5 (1M context)
**Scope:** Stage A only. Stage B's performed-based percentage links are deliberately absent and their
absence is verified, not treated as a gap. Approving Stage A claims no deployment readiness and no device
acceptance.
**Baseline:** [evaluation](set-groups-architecture-evaluation.md) revision 3 + the
[§19 owner decisions](set-groups-architecture-evaluation.md#19-owner-decisions--accepted-2026-09-12);
[independent review](set-groups-architecture-review.md);
[revision verification](set-groups-architecture-revision-verification.md) and
[revision verification 2](set-groups-architecture-revision-verification-2.md); acceptance and
negative-control baseline = evaluation §12.
**Under review:** [set-groups-stage-a-implementation.md](set-groups-stage-a-implementation.md)
(initial + remediation + verification-completion passes).
**Verdict:** see §10.

---

## 0. Summary

Stage A is **architecturally sound and substantially correct**. The hard parts are right: stored per-set
attribution rather than ordinal partitioning, the first-`min`-by-order evaluation window, per-group
recommendation identity on a correctly rebuilt partial unique index, the C-1/D-6(a) bridge as a read-time
fallback plus a write-time supersede, re-evaluation restricted to still-pending keys, and unmodified
strategy functions fed projected/windowed contexts. The four reported remediation bugs (B-1…B-4) are all
real, all genuinely fixed in source, and all pinned by regression tests that fail on the root cause rather
than a downstream symptom. I re-derived every central mechanism from source rather than from the report.

Six MEDIUM findings stand in the way of approval. Three are product/correctness defects in surfaces the
athlete can reach today; three are evidence- or process-accuracy defects in the implementation report
itself:

- **M-1** Per-group history is re-judged against **today's** group definition instead of each historical
  session's own frozen group. Raising a group's `sets.min` — by a template edit or by a `setMultiplier`
  week override — retroactively converts completed past sessions into failures and can emit
  `decrease_load` where the faithful reading holds. Demonstrated numerically (§3.1). The ungrouped path
  does not behave this way, and the reverse bridge in the same module does it correctly, so this is an
  asymmetry, not a design choice.
- **M-2** A slot-level `manual` strategy with a per-group override is accepted by the editor, documented
  in `progression-engine.md` §5.1 as working, handled deliberately in `evaluateSession`, and then
  discarded by **both** of its callers' pre-filters. Nothing progresses; no error, no card, no record.
- **M-3** Creating a grouped prescription whose slot strategy is rep-progression and which contains any
  fixed-rep group is a **dead end**: the server rejects it demanding a per-group `repCap`, and the form's
  only control for that `repCap` is gated on a key the server assigns on the save being rejected.
- **M-4** Neither new E2E spec was added to `test:e2e:offline`, contradicting A-17's explicit wording and
  leaving all Set Groups browser coverage outside CI. Undisclosed; §3's A-17 row says "Met".
- **M-5** `pnpm format:check` **fails** on six task-owned files. §6.2 quotes it as green with exit 0.
- **M-6** A per-group `targetRir` override is authorable and is used in persisted records, but is never
  displayed: the card and Today render one slot-level band after the whole multi-group line.

Nine LOW findings follow, each with an actionable disposition. None is silently dropped.

Stage A is a sound foundation for Stage B — the seams Stage B needs (`projectGroup`, the per-group context
builder, `resolveGroupRecommendation` as a single resolution point, the per-group `manual` skip that R-12
requires) are all in place and correctly shaped. M-2 in particular should be closed before Stage B, because
Stage B's R-12 ("linked groups are `manual`") makes mixed manual/non-manual group configurations the norm
rather than an edge case.

---

## 1. What I inspected, and tree integrity

### 1.1 Method

Source-first. For every claim in the implementation report that mattered I read the diff and the
surrounding code, and for the three findings where reading alone could be disputed I wrote a throwaway
probe that executes the shipped functions and prints the actual values (§3.1, §3.2, §3.3). The report's
own prose is treated as a claim throughout; where I quote a number as verified, I ran the command myself
(§8).

Read in full: the five required documents; `drizzle/0014_third_scream.sql` and its snapshot/journal; the
complete diffs of all 45 changed `src/` + `drizzle/` + pre-existing-test files; the three new source
modules (`groupEvaluation.ts`, `groupSelection.ts`, and the new regions of `evaluateSession.ts`,
`today/service.ts`, `progression/service.ts`, `activeSession.ts`, `ExerciseCard.tsx`,
`PrescriptionForm.tsx`); the ten `tests/unit/setGroups/` files' test names plus the full text of the
decisive ones; `tests/integration/setGroups.integration.test.ts`'s 18 tests; both new E2E specs; the six
architecture-doc diffs; `package.json`'s E2E scripts and `.github/workflows/ci.yml`'s `offline-e2e` job.

### 1.2 Working tree, before and after

`git status --porcelain` captured before any action and again at the end: **identical**, 90 entries. No
stash existed or was created. Nothing in the implementation's own "concurrent, untouched" list was
touched, and neither were the implementation files, the four architecture reports, the research report, the
Tuchscherer PDF, `gpt-handoff.md`/`gpt-memory.md`/`HANDOFF(depracted).md`, `.claude/skills/`, or
`docs/process/`. The only repository file this review creates is this one.

One clarification to the implementation report's header: it lists `tests/e2e/seed.ts` and
`playwright.config.ts` as concurrent/untouched, which I verified — both diffs are comment-only corrections
about `webServer` running `build && start` and about the offline subset running in CI, unrelated to Stage A.
But the header does **not** list `docs/architecture/*`, and those six files are task-owned (§7). That is
the correct attribution; noting it only because the header's list reads as exhaustive.

---

## 2. What is correct — verified, not inherited

Recorded because an approval-blocking report should still make clear how much of this is solid.

| Area | Verified how |
|---|---|
| **Migration and index** | `0014_third_scream.sql` drops and recreates `uq_recs_one_pending` over `(exercise_id, coalesce(block_id, zero-uuid), coalesce(group_key, ''))` and adds both nullable `text` columns. Applied to a fresh disposable Postgres 16; `pg_indexes` confirms the exact expression; `drizzle-kit check` clean. The rebuild cannot fail on existing data: `group_key` is all-`NULL` at migration time, so `coalesce(group_key,'')` is constant and the new index is set-equivalent to the old one. |
| **Partial-index semantics (NC-3, must-execute)** | Executed directly against the migrated real Postgres (§8.3): distinct keys coexist; a `NULL`-key pending coexists with keyed ones; a duplicate in the keyed slot **and** in the `NULL` slot are both rejected with the expected `DETAIL`; superseding frees the slot. Both halves of NC-3 — including "the null-key slot still works", which the in-repo test does not assert — now hold on real Postgres. |
| **Attribution identity** | `partitionGroupSets` filters by stored `groupKey`; `logSet` stamps the selected key and forces `null` for warm-ups ([activeSession.ts:640](../../src/sync/activeSession.ts#L640)); renumbering carries keys through (`setDeletionOps.ts`, `isGrouped`-scoped); deletion/renumber identity is pinned by a real round-trip integration test asserting exact post-renumber `(setNumber, groupKey)` pairs. |
| **Key validation against the frozen parent snapshot** | `isValidGroupKeyForSnapshot` + `parseParentSnapshot` on both set-log create and update (the update path queries only when the op actually writes the field) and on the recommendation upsert; `null` permitted (§4.4 rule 3), any key on an ungrouped slot rejected `invalid_payload`. Matches §4.4 rule 2 exactly. |
| **First-`min` window, both strategies** | `buildGroupEvaluationUnits` passes `partition.window` as `ctx.performance.workSets`; the A-6 matrix exists as eight real tests for both strategies, plus the "first `min`, not best `min`" row. |
| **NC-4a / NC-4b** | Implemented as permanent **counterfactual** tests that execute the alternative logic and assert the different outcome, not as assertions of the shipped behaviour. Their expectations match revision 3's corrected split exactly (row 2 flips for both strategies; row 3 for rep-progression only; row 5 unaffected by NC-4a and flipped by NC-4b). Stronger than the edit-restore style and permanently pinned. |
| **NC-7 safety property** | `buildGroupHistory` and `bridgeUngroupedHistoryEntry` both emit a projected scheme; the new `isCompleted` guard `if (scheme.type === "groups") return false` **preserves** the documented hazard (a raw scheme still reads as not-completed) rather than masking it, so NC-7 still discriminates. |
| **NC-9 / rollback window (A-10, A-11)** | `setLogFullRowOp(…, isGrouped)` and `buildClientRecommendationOps` both emit the grouped-only keys conditionally; `recommendationUpsertPayloadSchema.groupKey` is deliberately non-nullable; `rollbackCompatibility.test.ts` asserts both directions against a frozen pre-feature schema, and `activeSessionGroups.test.ts` asserts `"groupKey" in payload === false` and `"extraWorkSets" in inputs === false` for an ungrouped offline completion. |
| **Replay idempotence (NC-1)** | A real integration test resends the identical grouped batch (same opIds, same entity ids) and asserts the same row ids, statuses and `updatedAt` — genuine convergence, not just a count. |
| **M-3 / A-13b re-evaluation scope (NC-6)** | One `statusByKey` map keyed `(sourceSessionExerciseId, groupKey)` serves both modes; `reevaluate` persists only where the existing record is still `pending`. The gate in `reevaluateForSourceSessionExercise` is correctly left unchanged. Pinned by two integration tests from different angles. |
| **§4.5 removed-group filter (R-7)** | Server-side filter at bundle assembly plus the client's `?? []` defence; integration test asserts the removed key's row stays `pending` in the database and never appears in `pendingRecommendations`. |
| **Strategy preservation** | `STRATEGY_VERSIONS` is `{1,1,1}` unchanged. `loadProgression.ts`/`repProgression.ts` gained only unreachable exhaustiveness arms and narrowing guards (see L-4 for the report's understatement of this). `progressionMatrix.test.ts`/`progressionWorkSetMapping.test.ts` pass. |
| **e1RM / volume / metrics untouched** | No file under `src/domain/strength`, `src/domain/volume`, `src/domain/metrics` or `src/server/strength` appears in `git status`. The A-16 equivalence claim is pinned by a dedicated integration test that logs identical facts grouped and ungrouped in the **same** session and compares the full report object — a well-constructed test, and it passed in my own run. |
| **PI-018 preserved** | `restSeconds`/`prescriptionNotes` stay slot-level; the card subtitle keeps `… · Rest m:ss` after the scheme clause ([ExerciseCard.tsx:438-440](../../src/ui/workout/ExerciseCard.tsx#L438-L440)); the PI-018 E2E spec passed in my own offline-subset run. |
| **No Stage B leakage** | `grep` for `percentOfGroup`, `loadOffset`, `percentOfTop`, `load.mode` across `src/` returns nothing. ADR-008 untouched. `perSet` still reserved and explicitly un-superseded in `prescription-model.md`. |
| **B-1 … B-4** | All four independently confirmed in source, with discriminating tests: B-1/B-2 by `activeSessionGroups.test.ts` asserting per-group `inputs.workSets` **lengths** and per-op `payload.groupKey` (both fail on the root cause); B-4 by two integration tests that assert a **non-null** `.recommendation` / per-group `.recommendations` from `getActiveSession`, which is precisely the positive case no prior test made; B-3 by the E2E legacy-conversion spec, which I re-ran myself (see L-5 for its CI exposure). Persisted identities as well as presentation were checked: the bridged row's stored `groupKey` is correctly left `null` while only the returned copy is remapped, so D-6's "no rewrite of historical rows" holds. |
| **Documentation** | All six architecture files required by evaluation §16 items 1, 3, 4, 5, 6, 7 are genuinely and substantively updated — not stubs. `progression-engine.md` §5.1 is a complete, accurate restatement of the per-group pipeline. ADR-008 (item 2) correctly deferred to Stage B. `docs/BACKLOG.md` (item 8) correctly left to the owner/closeout editor and disclosed. |

---

## 3. Findings

Severity per [agent-workflow.md §4](../process/agent-workflow.md#4-severity-convention).

### MEDIUM

#### M-1 — Per-group history is re-judged against today's group definition, not each session's own frozen group; a raised `sets.min` can manufacture a `decrease_load`

**Where.** [`groupEvaluation.ts:84-103`](../../src/domain/progression/groupEvaluation.ts#L84-L103)
(`buildGroupHistory`).

**What.** For every historical entry, `buildGroupHistory` replaces `prescribed.scheme` with
`projectGroup(currentGroup)` and windows `workSets` with `currentGroup.sets.min` — the group as the
**current session's** frozen snapshot has it. `entryQualifiesForStreak`
([`loadProgression.ts:83-91`](../../src/domain/progression/loadProgression.ts#L83-L91)) then judges each
entry's completion from that substituted scheme. The ungrouped path does the opposite: `getEngineHistory`
([`progression/service.ts:276-288`](../../src/server/progression/service.ts#L276-L288)) hands each entry
its **own** frozen `snapshot.scheme`, and `bridgeUngroupedHistoryEntry` — in the same module, 40 lines
below — correctly resolves the first group from *that entry's own* snapshot. So the forward bridge is the
only place in the codebase that re-judges a frozen historical fact against a current definition.

**Failure scenario, executed.** Group `Top`, frozen in two earlier sessions as `2 × 5`, each completed at
100 kg × 5 × 2. The athlete (or a week override's `setMultiplier 1.5`) raises it to `3 × 5`. This session
only two sets land, so the current session is incomplete. With `failureAction: "decrease"` and
`decreaseAfterConsecutiveFailures: 2`:

```text
bridged[0].prescribed.scheme = {"type":"fixed","sets":3,"reps":5}
  (entry's OWN frozen group projected would be: {"type":"fixed","sets":2,"reps":5})
bridged[0].workSets.length = 2

SHIPPED   (history re-judged against TODAY's group):  decrease_load ['REPEATED_INCOMPLETE_AT_LOAD','DECREASE_APPLIED'] {"loadKg":90}
FAITHFUL  (each entry judged against its OWN frozen group):  hold ['PRESCRIBED_REPS_NOT_COMPLETED'] {"loadKg":100}
```

Two genuinely completed sessions are counted as failures and the athlete is told to drop 10 %. Lowering
`min` has the mirror effect, silently erasing a real failure streak. A `setMultiplier` week override makes
this reachable **without any template edit**, because `buildGroupEvaluationUnits` receives the
post-modifier snapshot and windows all history with the post-modifier `min`.

**Why it is a defect and not an unspecified choice.** Evaluation §5.4's safety property requires a
*projected* scheme; it does not license substituting a *different group's* projection. ADR-007's
snapshot-on-use discipline, §4.3's "historical attribution is frozen by each session's own snapshot order"
and §4.5's "a later rename/removal never changes what a past session shows" all point the other way, and
the reverse bridge already implements the correct pattern.

**Required correction.** In `buildGroupHistory`, for a historical entry whose own frozen scheme is
`groups`, resolve that entry's group **by key** from `entry.prescribed.scheme.groups` and use *that*
group's `projectGroup(...)` and `sets.min` for the window and `targetRir`. Keep the current group's
projection only for an ungrouped (legacy-bridged) entry, where no frozen group exists. Add a test that
fails on the current behaviour — the probe above is a ready-made shape for it.

#### M-2 — A slot-level `manual` strategy with a per-group override is authorable, documented as working, and silently never evaluated

**Where.** [`progression/service.ts:418`](../../src/server/progression/service.ts#L418) (the
`assembleAndEvaluate` candidate pre-filter) and
[`activeSession.ts:963`](../../src/sync/activeSession.ts#L963) (`buildClientRecommendationOps`).

**What.** Both callers drop any slot whose snapshot `progression.strategyId === "manual"`, regardless of
per-group overrides. `evaluateSession` deliberately handles the opposite: its `groups` branch is placed
**before** the manual skip, with the comment *"a slot default of `manual` with an overriding group must
still progress that group"*, and `progression-engine.md` §5.1 — written by this task — documents a grouped
slot as "evaluated **per group**, independent of the slot-level `strategyId` (which is only the default
for a group that doesn't override it)". The domain honours that; neither caller ever gives it the chance.

**Reachability.** `strategyIdsForProfile("load_reps")` returns all three strategies, so both the slot
select and the per-group select offer "Manual". `checkPrescriptionCompatibility` raises no issue — executed:

```text
PROBE 2 slot strategyId: manual
PROBE 2 group strategies: {"k1":"load-progression","k2":"manual"}
PROBE 2 issues (accepted by the editor?): []
```

Two ordinary saves through the form produce it (create with any non-manual slot strategy so keys are
assigned, then set the slot to Manual and one group to Load progression).

**Failure scenario.** The athlete sets the exercise to Manual and turns progression on for the Top group
only. Neither an online nor an offline completion produces any record for Top: no recommendation card, no
carry-forward change, no error, no reason code. The configuration simply does nothing, and the
architecture documentation claims it does something.

**Required correction.** Pick one and make code, editor and docs agree: (a) make both pre-filters
group-aware — keep the slot when the frozen scheme is `groups` and any group's effective strategy is
non-manual; or (b) reject the combination in `checkPrescriptionCompatibility` and suppress it in the
editor, and correct `progression-engine.md` §5.1. (a) is the behaviour the domain and the docs already
describe and is the smaller change. Either way add a test: currently nothing exercises a grouped slot
whose slot-level strategy is `manual`.

#### M-3 — Creating a grouped prescription with slot strategy rep-progression and a fixed-rep group is a dead end

**Where.** [`PrescriptionForm.tsx:784`](../../src/ui/prescriptions/PrescriptionForm.tsx#L784) (the
per-group override block gated on `g.key`) against
[`prescriptions/schema.ts`](../../src/domain/prescriptions/schema.ts)'s per-group `repCap` rule.

**What.** On a `groups` scheme, slot-level `repCap` is forbidden (correctly — §5.3 L-3) and a fixed-rep
group under rep-progression **requires** its own per-group `repCap` (correctly — F-23). The form's only
per-group `repCap` control is rendered solely when `g.key` exists, and the server assigns a brand-new
group's key on the very save that is being validated. So on create there is no way to supply the required
value. Executed:

```text
PROBE 1 issues: ["repCap is required for rep-progression on a fixed-rep group (\"Top\")"]
PROBE 1b issues: []        # same scheme, with a per-group repCap — which create cannot send
```

`createPrescription` throws `PrescriptionCompatibilityError`, surfaced as a 400 whose message is the joined
issue list and rendered by the form's own error line. The draft is not lost (no navigation), but the error
names a field the screen does not offer, and the placeholder the user *can* see says only "Save this group
once to set a custom progression strategy for it" — which does not hint that this particular save will be
refused.

**This is distinct from what §7.1 discloses.** §7.1 describes "two ordinary saves". The E2E authoring test
([`setGroups.spec.ts:114`](../../tests/e2e/setGroups.spec.ts#L114)) makes the first save with **Load
progression** at slot level and only then overrides one group to rep-progression. That path works and is
genuinely tested. The path §7.1's own sentence describes — *"authoring a new grouped prescription whose
fixed-rep group needs rep-progression's required repCap takes two ordinary saves"* — fails on save one if
the athlete reaches for rep-progression at slot level, which is the obvious thing to do when every group
is meant to use it.

**Required correction.** One of: (a) render the per-group strategy/`repCap` controls on create too,
addressing groups by array index and mapping overrides onto the server-assigned keys after
`assignGroupKeys` (the honest fix, and it also removes the two-save cost §7.1 flags); (b) block the
submission client-side with a message that names the actual remedy; or (c) let the server default a
fixed-rep group's `repCap` from `reps.min` when the slot strategy is rep-progression — a product decision
the owner should make, not an implementation default. Minimum acceptable: the form must not submit a
configuration it can already tell will be refused with an unactionable error. Correct §7.1's wording either
way.

#### M-4 — The new E2E specs are absent from `test:e2e:offline`, contrary to A-17, so no Set Groups browser coverage runs in CI

**Where.** [`package.json:24`](../../package.json#L24); `.github/workflows/ci.yml`'s `offline-e2e` job.

**What.** A-17 reads, verbatim: *"E2E (`setGroups.spec.ts`, **added to `test:e2e:offline`**)"*. The script's
explicit file list contains neither `tests/e2e/setGroups.spec.ts` nor `tests/e2e/setGroupsOffline.spec.ts`.
CI's only E2E job runs exactly that script (I re-derived the job's step order from `ci.yml` per
[agent-workflow §7](../process/agent-workflow.md#7-ci-and-local-e2e-bootstrap-order)), so every Set Groups
browser assertion — including the one that caught B-3 and the two that caught B-1/B-2 — runs only in a
full local `pnpm test:e2e`. I confirmed this by running the subset myself: **34 tests, 15 files, zero Set
Groups tests among them** (§8.4).

PI-018 established the pattern: `workoutPrescriptionContext.spec.ts` *is* in the list. The omission reads
as an oversight, not a decision — and §3's A-17 row reports "Met", disclosing only the add/remove/reorder
gap. Per the change-class matrix, `test:e2e:offline` is load-bearing for a sync-contract change; leaving
the feature's own specs out of it removes the standing regression guard this class of change depends on.

**Required correction.** Add both spec files to `test:e2e:offline` and confirm they pass inside that run
(they are deterministic and headless; both passed standalone in my run, §8.5). If any spec is genuinely
unsuitable for CI, say which and why and get an explicit owner waiver. Correct the A-17 disposition.

#### M-5 — `pnpm format:check` fails on six task-owned files; §6.2 reports it green

**Where.** Implementation report §6.2.

**What.** §6.2 quotes `pnpm format:check` as `All matched files use Prettier code style! (exit 0)`. Executed
on the unmodified tree:

```text
$ prettier --check .
[warn] src/ui/prescriptions/PrescriptionForm.tsx
[warn] tests/e2e/setGroups.spec.ts
[warn] tests/e2e/setGroupsOffline.spec.ts
[warn] tests/integration/setGroups.integration.test.ts
[warn] tests/unit/setGroups/activeSessionGroups.test.ts
[warn] tests/unit/setGroups/groupEvaluation.test.ts
[warn] Code style issues found in 6 files.        (exit 1)
```

All six are task-owned (one edited file, five created). This is **not** the repository's known CRLF case —
`src/server/sync/service.ts` is absent from the list, and `file(1)` reports all six as plain LF UTF-8. The
drift is ordinary over-width: e.g.
`let groupsProgressionOverride: Record<string, { strategyId: StrategyId; config?: ... }> | undefined;` and
`const effectiveGroupStrategyId: StrategyId = g.strategyOverride || effectiveStrategyId;`, both of which
Prettier wraps. `format:check` is a named member of "full quality gates" for every class in the matrix, so
a gate reported green while red is a report-accuracy defect on top of the mechanical one.

**Required correction.** `pnpm exec prettier --write` the six files, re-run the gate to exit 0, and replace
§6.2's quoted output with the real run. The parenthetical "(checked via `pnpm exec prettier` during the
edit pass — no drift on final re-check)" should go: there was drift on final re-check.

#### M-6 — A per-group `targetRir` override is authorable and recorded but never displayed; one slot band is shown for the whole multi-group line

**Where.** [`ExerciseCard.tsx:285`](../../src/ui/workout/ExerciseCard.tsx#L285) and
[`:438-440`](../../src/ui/workout/ExerciseCard.tsx#L438-L440); `formatScheme`'s `groups` case.

**What.** The editor offers "Override target RIR band for this group" per group; the value is stored in the
scheme, honoured by `buildGroupEvaluationUnits` (`group.targetRir ?? snapshot.targetRir`) and written into
each record's `inputs.prescribed.targetRir`. But `formatScheme` emits no band for the `groups` case, and
the card appends a single `@ RIR min-max` from the **slot** after the entire joined group line. Today's
preview and History do the same. Evaluation §11.2's own worked example shows the opposite:
`Top 1 × 2 @ RIR 2 · Back-off 2–3 × 6–8 @ RIR 2–3 · Rest 3:00`.

**Failure scenario.** The athlete prescribes Top @ RIR 2–2 and Back-off @ RIR 3–4 with a slot band of 1–3.
The card reads `Top 1 × 2 · Back-off 2–3 × 6–8 @ RIR 1-3` — a band that is wrong for both groups, and the
only RIR guidance on screen while they lift. No recommendation is computed wrongly (the strategies gate on
`cfg.progressRirGate`, not the band), so this is presentational; but the athlete trains to the displayed
number, and the stored record disagrees with what they were shown.

**Required correction.** Render the effective band per group — either inside `formatScheme`'s group clause
(then the slot suffix must be suppressed when every group carries its own) or at minimum for the selected
chip's group beside the input row. Alternatively remove the per-group RIR control from the Stage A editor
and say so. Do not leave an authorable field that the execution screen contradicts.

### LOW

Each carries a disposition; none is left as a bare observation.

**L-1 — The offline client never applies per-group in-session decisions to `groupPrefills`.**
`buildClientRecommendationOps` calls `applyInSessionDecisionToPrefill(snapshot, exercise.recommendation?.decision ?? null)`
([`activeSession.ts:985`](../../src/sync/activeSession.ts#L985)) and never the per-group sibling
`applyInSessionDecisionsToGroupPrefills` that manifest item 9 / §5.3 L-3 required and that the server path
uses via `overlayInSessionDecisions`. For a grouped slot the per-group decisions live in
`exercise.recommendations`, so nothing overlays `groupPrefills[key].reps`. `repProgression` reads
`ctx.prescription.prefill.reps` as `currentTarget`, so an offline completion of a grouped slot under
rep-progression, after an accept/modify whose chosen reps differ from the frozen prefill, computes a
different rep target than the server would — and because the client op is enqueued ahead of the completion
op and the server then dedupes on `(slot, key)`, the divergent value is the one that persists. Narrow
trigger (grouped + rep-progression + an in-session decision + offline), and load-progression is unaffected
(it never reads `prefill.reps`), but it is an asymmetry against the ungrouped client path, which *does*
apply the overlay. *Disposition:* thread the per-group overlay through `buildClientRecommendationOps` — the
function already exists and is exported — or, if deferred, disclose it explicitly in §7 as a known offline
divergence rather than leaving manifest item 9 reported as delivered.

**L-2 — `targetRirShift` is not applied to a group's own band.**
[`applyWeekModifiers.ts:87-96`](../../src/domain/prescriptions/applyWeekModifiers.ts#L87-L96) shifts only
the slot-level band; a group's `targetRir` override passes through unchanged, and
`buildGroupEvaluationUnits` prefers it. A-7 requires "`targetRirShift` +2 per group";
`applyWeekModifiersGroups.test.ts` tests only `setMultiplier` and field preservation — there is no
`targetRirShift` assertion for groups at all. Effect is confined to `inputs.prescribed.targetRir` audit
metadata and (via M-6) nothing displayed, so no recommendation changes. *Disposition:* apply the shift to
each group's override band inside `applyWeekModifiersToPrescription` and add the A-7 assertion; or record
the limitation explicitly against A-7 in the evaluation rather than reporting A-7 as met.

**L-3 — An edit can leave a warm-up set carrying a `groupKey`, violating §4.4 rule 1.** `logSet` forces
`null` for warm-ups, but `SetRow`'s edit form sends the select's current value alongside `isWarmup: true`
(`...(groupsScheme ? { groupKey } : {})`), and the server patches the two independently
([`sync/service.ts:1160`](../../src/server/sync/service.ts#L1160)). The stored row then contradicts the
stated invariant "warm-up sets carry `null` (they belong to no group)". No evaluation consequence — every
evaluation path filters warm-ups before partitioning — but
[`groupSelection.ts:47`](../../src/ui/workout/groupSelection.ts#L47) does *not* filter them, so the input
row can be derived from a warm-up load. *Disposition:* clear `groupKey` whenever `isWarmup` becomes true
(client patch and server patch, so the stored invariant holds), and add `!s.isWarmup` to `groupPrefill`'s
filter as defence in depth.

**L-4 — §4 understates the strategy-file change, and §10's manifest does not list it as a deviation.**
Evaluation §10 names `loadProgression.ts` and `repProgression.ts` under "Not changed, deliberately". Both
are changed. §4 of the implementation report describes this as "only the one early-return guard + one
exhaustiveness arm each"; `loadProgression.ts` actually received **two** guards — one in `isCompleted`
(line 68) and one at the top of `evaluateLoadProgression` — plus the arm. I verified the changes are inert:
both guards narrow a variant that `evaluateSession`'s dispatch makes structurally unreachable, the
`isCompleted` guard's `return false` preserves rather than masks the NC-7 hazard, and `STRATEGY_VERSIONS`
is unchanged. *Disposition:* correct §4's count and list the deviation from §10's "not changed" line in §7
or §8 so a later reader does not have to rediscover that two "untouched" files were touched.

**L-5 — B-3's regression coverage exists only outside CI.** The bridged-recommendation `groupKey` remap is
pinned solely by `setGroups.spec.ts`'s legacy-conversion test, which M-4 leaves out of CI. The C-1/D-6(a)
integration test stops at `groupPrefills` and never asserts `pendingRecommendations[0].groupKey`. So until
M-4 is fixed, the highest-impact of the four bugs has no guard in any automated CI run. *Disposition:* add
two lines to the existing C-1/D-6(a) integration test asserting `entry.pendingRecommendations` has one
entry whose `groupKey === firstKey` for a bridged legacy record — cheap, and it survives M-4's outcome
either way.

**L-6 — The history half of B-1's fix is untested.** `toPerformedSets` threads `groupKey` for both the
current exercise's sets and every bundle history entry's sets, but
`activeSessionGroups.test.ts`'s offline test uses `history: []`, so only the current-session half is
exercised. *Disposition:* add one grouped history entry (with `groupKey` on its sets) to that test and
assert the resulting per-group `historyDepthUsed`/streak behaviour; it is the same mapper, so the cost is a
fixture line.

**L-7 — Reverse-conversion orphaned pending records: disclosure confirmed accurate, invariant unpinned.**
I traced every current read path and confirm the report's claim that these rows are inert: an ungrouped
slot's bundle, `getActiveSession`, `getLatestDecisionChosenByExercise` and `getInSessionDecisionChosen` are
all null-key scoped; the editor cannot re-adopt an old key (a reconversion submits keyless group drafts, so
`assignGroupKeys` mints fresh ones); and if the historical grouped session is later edited,
`reevaluateForSourceSessionExercise` + the `statusByKey` check supersede the stale row with a fresh one
against that session's own frozen grouped snapshot — consistent, not resurfaced. So **no, old records
cannot resurface** under the current code. The residual risk is forward-looking only: nothing *pins* the
invariant. *Disposition:* accept for Stage A as disclosed, and add one integration assertion that an
ungrouped slot's bundle and active session never surface a non-null-key record, so any future un-scoped
recommendation query fails loudly. Revisit the symmetric write-time supersede only if such a query is ever
added.

**L-8 — `assignGroupKeys` trusts client-supplied keys.** A submitted key is echoed back verbatim with no
check that it belongs to the stored scheme, so a hand-crafted PATCH could swap two groups' keys (swapping
their histories) or adopt an arbitrary token. Unreachable through the editor, and this is a single-user
application. *Disposition:* note only; optionally validate submitted keys against the stored scheme on
update, at which point the `defaultGroupKey()` collision question disappears too.

**L-9 — The disclosed §6.5 test contamination is fixed, but the cleanup pattern remains timeout-fragile.**
The disclosure is honest and complete, the root cause (`test.setTimeout`) is fixed in the spec, and
§6.3's full run used a separate database. But `cleanupSchedule`/`archiveTemplate` still run inside the
test body's `finally`, which a Playwright **test-level** timeout kills before it executes — exactly what
happened. *Disposition:* move the schedule restore and template archive into an `afterEach`/`afterAll`
hook, which gets its own timeout budget, so a future timeout cannot leave a shared fixture pointing at a
temporary grouped template.

---

## 4. Acceptance coverage against evaluation §12.1

Disposition is mine, independently assessed; it supersedes §3 of the implementation report where they
differ.

| ID | Report | This review | Basis |
|---|---|---|---|
| A-1 | Met | **Met** | `setSchemeGroups.test.ts` covers 1–4 groups, duplicate keys, `min > max`, Σ max > 20 (and exactly 20), empty label, span > 30, `v` = 1. |
| A-2 | Met | **Met** | Exact-string test plus a genuine exhaustive `switch` with the "sixth variant fails to compile" comment honoured. |
| A-3 | Met | **Met** | Projection, per-group `repCap` derivation, slot-level `repCap` rejection and the F-23 fixed-rep rule all tested; I re-derived the last two by probe. |
| A-4 | Met | **Met** | Integration "evaluates each group independently"; figures match §12.1. |
| A-5 | Met | **Met** | Integration `NO_WORK_SETS_LOGGED` per group; unattributed-key exclusion pinned in `groupEvaluation.test.ts`. |
| A-6 | Met | **Met** | All eight rows, both strategies, plus `workSets`/`extraWorkSets`/`prescribed.group`. |
| A-7 | Met | **Partially met — L-2** | `setMultiplier` per group (incl. the `{1,1}` case and the Σ clamp) met; **`targetRirShift` per group is neither implemented nor tested**. |
| A-8 | Met | **Met** | Group baseline before slot baseline verified in `buildSnapshot.ts`; C-1 and the D-6 default pinned by unit and integration tests. |
| A-9 | Met | **Met** | `groupSelection.test.ts` covers the mount rule, advance-at-`max`, warm-up exclusion, tap-back re-derivation, the full `groupPrefill` chain, **and the V-5 skipped-top reload**; `activeSessionGroups.test.ts` covers `logSet` stamping and per-key implicit decisions against real mutators and a real IndexedDB. |
| A-10 | Met | **Met** | Both ops' ungrouped shapes asserted key-set-exact; grouped emission conditional on the slot's frozen shape, not on `set.groupKey`. |
| A-11 | Met | **Met** | Frozen pre-feature schema, both directions, with the L-5 consequence recorded in the test's comment. |
| A-12 | Met (not re-run) | **Met — executed by this review** | Fresh migrate + `drizzle-kit check` + `db:seed` twice on a disposable Postgres; real-Postgres partial-index control covering **both** halves of NC-3; gated `SET_RENUMBER_CONCURRENCY_DATABASE_URL` suite green on the migrated schema (§8). |
| A-13 | Met | **Met** | Key validation, grouped replay idempotence, inter-group reassignment and renumber key preservation all covered by real-DB round trips. |
| A-13b | Met | **Met** | The M-3 scenario and the superseded-by-a-later-session half are both pinned. |
| A-14 | Met | **Met** | `groupPrefills` per key with the §5.6 bridge; `pendingRecommendations` filtered to current-scheme keys with the null key mapped to the first group; `prefill` = the first group's (`firstGroupPrefill ?? slotPrefill`). |
| A-15 | Met | **Met** | Two records with `group_key`; per-`(slot, key)` dedupe; deload → none. |
| A-16 | Met | **Met** | The same-session grouped-vs-ungrouped full-report comparison is a well-built test and passed in my run; no strength/volume/metrics file is touched. |
| A-16b | N/A | **N/A, correctly** | `src/domain/strength/**` untouched; `strengthBoundary.test.ts` green in my run. |
| A-17 | Met | **Partially met — M-4, plus the two disclosed gaps** | All four browser tests are real and passed in my own isolated run, and they cover the auto-advance **input-value** change, dirty-draft discard, warm-up exclusion, optional sets, reload, in-session and History reassignment, the legacy bridge and a fully-offline grouped completion. But the spec's clause *"added to `test:e2e:offline`"* is unmet (M-4), and the reload case covered is "every group at max → last group", not the skipped-top variant (covered at unit level only). Group add/remove/reorder remains unverified in a browser (§5). |

### Negative controls (evaluation §12.3)

| ID | Disposition |
|---|---|
| NC-1 | **Executed** (integration, in my run) — identical batch twice, same row ids/statuses/`updatedAt`. |
| NC-2 | **Executed** (integration) — supersede is per key; the NC-3 test's second session proves both keys supersede independently. |
| NC-3 | **Executed by this review on real Postgres 16** — both halves, including the null-key slot the in-repo test omits. §8.3. |
| NC-4a | **Executed** — permanent counterfactual test; expectations match revision 3's corrected split exactly. |
| NC-4b | **Executed** — permanent counterfactual test; row 5 progresses under best-`min`, holds under the shipped rule. |
| NC-5 | **Satisfied by construction** — the positive form (`excludes sets attributed to a different group`, `excludes unattributed sets`) is tested, so removing a key filter fails those tests. Not run as a counterfactual; acceptable. |
| NC-6 | **Executed** (integration M-3/A-13b test). |
| NC-7 | **Executed** — `groupEvaluation.test.ts` asserts the projected scheme on every bridged entry, forward and reverse, and names the streak-inflation consequence. |
| NC-8 | **Executed** — `setGroups.spec.ts` asserts the weight input's **value** immediately after auto-advance and again after a tap back to Top; re-run by me (§8.5). |
| NC-9 | **Executed** — both ungrouped op shapes asserted key-set-exact at unit level and again at integration level for the stored record. |

No negative control required me to modify a tracked file, so no byte-level backup/restore was needed; the
working tree is confirmed unchanged (§1.2). The two throwaway probes in §3 live entirely in the session
scratchpad and import the repository's modules read-only.

---

## 5. Deviation dispositions

| Deviation (as disclosed) | Disposition |
|---|---|
| **Two-save authoring for a new per-group progression override** (§7.1) | **Accepted as a UX cost, but the disclosure is incomplete — see M-3.** Server-generated keys do not by themselves prove two user saves are necessary: the client could provision index-addressed overrides and map them onto the assigned keys in one save, which is what (a) in M-3 proposes. More importantly, the path §7.1's own sentence describes fails outright rather than costing a second save. Fix M-3 or restate §7.1 to describe the path that actually works. |
| **Missing browser coverage of group add/remove/reorder** (§7.1) | **Accepted for Stage A, with one addition.** Assessed against the agreed criteria: these are local `useState` list operations (`addGroup`/`removeGroup`/`moveGroup`) with no server round trip of their own; key preservation across reorder and removal — the part that can corrupt data — *is* covered where it matters (`assignGroupKeys` unit tests for preservation; the §4.5 integration test for removal through `updatePrescription`; the authoring E2E drives the form end to end including the `key`-echo round trip). The residual untested surface is DOM wiring. That is a reasonable Stage A boundary **provided** it is not stated as verified, which the report correctly avoids. Addition: the reorder case is the one with a real data consequence (swapping two groups' histories if keys ever followed position), so one browser assertion that a reorder-then-save leaves each group's key attached to its own label would close the meaningful half cheaply. |
| **Reverse-conversion pending-record asymmetry** (§7.1) | **Accepted. Disclosure verified accurate, and the open question is narrower than stated — see L-7.** I established positively that old records cannot resurface under any current read path, and that a later edit to the historical grouped session supersedes them correctly. Pin the invariant with a test; do not build the symmetric supersede for Stage A. |
| **No grouped-specific warm-up-then-reload E2E** (§7.2) | **Accepted.** Warm-up exclusion from both the recorded count and auto-advance is covered in the browser; the reload-after-warm-up-only case exercises `nextGroupSelection` with zero work sets, which is covered at unit level, and the ungrouped equivalent is covered by `warmupSetClassification.spec.ts`. Low marginal value. |
| **Stage B wholly unimplemented** (§7.2) | **Correct and verified** — no `percentOfGroup`, no link resolver, no `ref`, no ADR-008 amendment, no editor control, no usage gate. |
| **`docs/BACKLOG.md`/`STATUS.md`/`ROADMAP.md` untouched** (§10) | **Accepted** — §16 item 8 is explicitly the owner/closeout editor's step, and those files are concurrent work. |
| **Migration evidence reused rather than re-run** (§6.1) | **Accepted and moot** — the reasoning (no schema file changed) is sound, and I executed the migration evidence independently anyway (§8.2). |
| **Two `loadProgression.ts`/`repProgression.ts` changes against §10's "not changed" list** | **Undisclosed deviation — L-4.** Inert, but it should be listed. |
| **`format:check` reported green** | **Not a deviation but a false claim — M-5.** |
| **`test:e2e:offline` membership** | **Undisclosed unmet acceptance clause — M-4.** |

---

## 6. Scope and downstream effects

- **e1RM / volume / metrics:** no file under `src/domain/strength`, `src/domain/volume`,
  `src/domain/metrics` or `src/server/strength` is modified. The A-16 equivalence test compares the full
  `getExerciseStrengthReport` output for identical facts logged grouped and ungrouped **in the same
  session**, which is the right construction (it eliminates `sessionId`/`startedAt` as confounds). Passed
  in my own integration run. `strengthBoundary.test.ts` green. No estimation-policy change.
- **PI-018:** `restSeconds` and `prescriptionNotes` remain slot-level and untouched; the card's subtitle
  keeps the `· Rest m:ss` clause after the scheme clause and the program-note block is unchanged; the
  PI-018 E2E spec passed inside my offline-subset run.
- **Unrelated workflows:** the `assembleAndEvaluate` restructure moves the `initial`-mode dedupe from a
  pre-evaluation candidate filter to a post-evaluation result filter. For an ungrouped slot the two are
  semantically identical (same `sourceSessionExerciseId` test, `groupKey` always `null`); the only cost is
  one extra `getEngineHistory` query for an already-evaluated slot. Not a behaviour change. Every other
  lookup degenerates to the pre-Stage-A behaviour at `groupKey = null`, which the 490-test integration
  suite and the 34-test offline E2E subset both confirm.
- **Stage B leakage:** none, verified by grep and by reading the scheme/editor surfaces.
- **Documentation vs owner scope:** the six architecture files match §16 items 1/3/4/5/6/7 and are
  accurate, with the single exception that `progression-engine.md` §5.1's slot-level-independence sentence
  describes behaviour the callers do not deliver (M-2). The `evidence-to-design.md` row correctly claims no
  evidence tier for the structure and no defaulted percentage, consistent with §14 and the §19 addendum.
  No owner-scope boundary is exceeded: no commit, push, production access or deployment occurred or was
  attempted, and none is claimed.

---

## 7. Executed versus inherited verification

### 7.1 Executed by this review

| # | Command / control | Result |
|---|---|---|
| 1 | `pnpm typecheck` | exit 0 |
| 2 | `pnpm typecheck:sw` | exit 0 |
| 3 | `pnpm lint` | exit 0 |
| 4 | `pnpm format:check` | **exit 1 — 6 task-owned files (M-5)** |
| 5 | `pnpm test:unit` | **96 files, 1348 tests, 0 failed** — matches §6.2 exactly |
| 6 | `pnpm test:integration` | **29 passed + 6 skipped files; 490 passed + 17 skipped tests, 0 failed** — matches §6.2 exactly (skips are the gated `*_CONCURRENCY_DATABASE_URL` suites) |
| 7 | `pnpm build` | exit 0, `✓ Compiled successfully`, `✓ Generating static pages (40/40)` |
| 8 | Fresh migrate on `gymapp_rev_sga` (disposable Postgres 16) | `[✓] migrations applied successfully!` |
| 9 | `pnpm exec drizzle-kit check` | `Everything's fine 🐶🔥` |
| 10 | Real schema introspection | `set_logs.group_key` and `recommendations.group_key` both nullable `text`; `uq_recs_one_pending` = `UNIQUE btree (exercise_id, COALESCE(block_id,'000…0'::uuid), COALESCE(group_key,''::text)) WHERE decision_status = 'pending'` |
| 11 | **NC-3 on real Postgres** (§8.3) | distinct keys coexist ✔; null-key pending coexists ✔; duplicate keyed pending rejected ✔; duplicate null-key pending rejected ✔; supersede frees the slot ✔ |
| 12 | Gated `SET_RENUMBER_CONCURRENCY_DATABASE_URL` suite on `gymapp_rev_sga_conc` (freshly migrated) | 1 file, 1 test, passed |
| 13 | `pnpm db:seed` ×2 pre-account on `gymapp_rev_sga_e2e`, then CI bootstrap (`smoke.spec.ts` → `db:seed` → `tsx tests/e2e/seed.ts`) | all green; seed idempotent |
| 14 | `pnpm test:e2e:offline` on that fresh DB | **34 passed** — and confirms zero Set Groups coverage in the subset (M-4) |
| 15 | `pnpm exec playwright test tests/e2e/setGroups.spec.ts tests/e2e/setGroupsOffline.spec.ts` on that fresh DB | **4 passed** — A-17's browser claims independently reproduced, not inherited |
| 16 | Probe 1/1b/2 — `resolvePrescriptionProgression` + `checkPrescriptionCompatibility` | M-3 and M-2 confirmed at the domain level |
| 17 | Probe — `buildGroupHistory` + `evaluateLoadProgression` | M-1 confirmed numerically (`decrease_load` 90 vs `hold` 100) |
| 18 | `git status --porcelain` before and after | identical, 90 entries |

### 7.2 Inherited, not re-run

- **The full `pnpm test:e2e` run (39 spec files / 160 tests, §6.3).** I verified the file count
  independently (`ls tests/e2e/*.spec.ts` → 39) and re-ran the 15-file offline subset plus both Set Groups
  files (38 of the 160 tests) on my own fresh database. The remaining coverage is inherited per the task's
  instruction not to duplicate broad E-level runs. §6.3's accounting — 39 files vs 160 tests stated
  separately — is accurate.
- **The initial pass's `gymapp_t_setgroups` / `gymapp_renumconc` evidence.** Superseded by my own items
  8–12 above, which re-establish the same facts on databases I created and dropped.

### 7.3 Resources created and cleaned up

Created by this review and **dropped**: `gymapp_rev_sga`, `gymapp_rev_sga_conc`, `gymapp_rev_sga_e2e`.
Post-review `pg_database` listing confirms all three gone. Five databases from earlier, unrelated tasks
(`gymapp_warmup_e2e`, `gymapp_e1rm_verify`, `gymapp_e1rm_remediation`, `gymapp_wuconc`,
`gymapp_wu_rem_e2e`) plus `gymapp` itself were present before and after and are **deliberately left alone**
— not created by this review, not mine to clean. The `gym-app-db-1` container was used only as the host for
`CREATE`/`DROP DATABASE`. No Playwright server or node process is left listening. Scratch probes and the
two `git status` snapshots live in the session scratchpad, outside the repository. The only repository file
created is this report.

---

## 8. Evidence detail

### 8.1 Tree integrity

```text
$ git status --porcelain | wc -l        → 90   (before)
$ git status --porcelain | wc -l        → 90   (after)
$ diff git-status-before.txt git-status-after.txt   → no differences
$ git stash list                       → empty, before and after
```

### 8.2 Migration and drift

```text
$ docker exec gym-app-db-1 psql -U gymapp -d gymapp -c "CREATE DATABASE gymapp_rev_sga;"   → CREATE DATABASE
$ DATABASE_URL=…/gymapp_rev_sga pnpm db:migrate                → [✓] migrations applied successfully!
$ pnpm exec drizzle-kit check                                  → Everything's fine 🐶🔥
$ psql -c "SELECT indexdef FROM pg_indexes WHERE indexname='uq_recs_one_pending';"
CREATE UNIQUE INDEX uq_recs_one_pending ON public.recommendations USING btree
  (exercise_id, COALESCE(block_id, '00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(group_key, ''::text)) WHERE (decision_status = 'pending'::text)
```

### 8.3 NC-3 — partial unique index, executed on real Postgres 16

Minimal rows inserted with `session_replication_role = replica` (FK triggers off, disposable database
only) so the index itself is the only thing under test.

```text
NC3a  first pending, key=g7k2                      → OK
NC3b  second pending, DIFFERENT key=q9m4           → OK   (independent per-group slots)
NC3c  pending with NULL key alongside both          → OK   (the null-key slot still works)
NC3d  DUPLICATE pending, key=g7k2                  → ERROR 23505 uq_recs_one_pending
        DETAIL: Key (exercise_id, COALESCE(block_id,…), COALESCE(group_key,''))=(…, g7k2) already exists.
NC3e  DUPLICATE pending, NULL key                  → ERROR 23505 uq_recs_one_pending
        DETAIL: Key (…, )=… already exists.
state  3 pending rows: g7k2 | q9m4 | <NULL>        → as expected
NC3f  supersede g7k2, then insert a pending g7k2   → OK   (supersede frees the slot)
```

### 8.4 Gated concurrency suite and the offline subset

```text
$ DATABASE_URL=…/gymapp_rev_sga_conc pnpm db:migrate           → [✓] migrations applied successfully!
$ SET_RENUMBER_CONCURRENCY_DATABASE_URL=…/gymapp_rev_sga_conc \
    pnpm exec vitest run --config vitest.integration.config.ts \
    tests/integration/setRenumberConcurrency.integration.test.ts
  ✓ tests/integration/setRenumberConcurrency.integration.test.ts (1 test) 125ms
  Test Files  1 passed (1)      Tests  1 passed (1)

$ # CI bootstrap order per agent-workflow §7, re-derived from ci.yml
$ DATABASE_URL=…/gymapp_rev_sga_e2e pnpm db:migrate            → applied
$ pnpm db:seed ; pnpm db:seed                                  → Seed complete. ×2 (idempotent)
$ pnpm exec playwright test tests/e2e/smoke.spec.ts            → 1 passed (38.3s)
$ pnpm db:seed ; pnpm exec tsx tests/e2e/seed.ts               → Seed complete. / E2E seed ready
$ pnpm test:e2e:offline                                        → 34 passed (1.9m)
```

The 34 tests span 15 spec files — `offline-cold-launch`, `offline-sync`, `offline-set-edit-delete`,
`offline-recommendation`, `network-flap`, `duplicate-replay`, `sync-auth-expiry`, `takeover`,
`dead-letter`, `stale-completed-session`, `storage-persist-status`, `transient-failure-fifo`,
`lost-response-retry`, `offline-bodyweight-recovery`, `workoutPrescriptionContext` — and **no Set Groups
spec**, which is M-4.

### 8.5 Set Groups E2E, reproduced independently

```text
$ pnpm exec playwright test tests/e2e/setGroups.spec.ts tests/e2e/setGroupsOffline.spec.ts
  ok 1  authoring — a fixed-rep group's rep-progression strategy and required repCap are authorable … (1.1s)
  ok 2  full workout lifecycle — chip row, auto-advance, dirty drafts, warm-ups, optional sets,
        reload resume, in-session/History correction, and independent recommendations               (2.0s)
  ok 3  legacy conversion bridge (C-1/D-6(a)) — bridges its prior pending recommendation onto the
        first group's card                                                                          (983ms)
  ok 4  completing a GROUPED workout fully offline evaluates each group independently once reconnected (1.2s)
  4 passed (43.0s)
```

---

## 9. Is Stage A a sound foundation for Stage B?

**Yes, on architecture; with M-2 closed first.**

What Stage B needs is present and correctly shaped:

- `SetGroup` is designed for an additive `load` field, exactly as §4.2 promised; adding
  `load.mode: "percentOfGroup"` touches no existing key.
- `projectGroup` and `buildGroupEvaluationUnits` are the single seam where a group's effective load would
  be resolved, and `groupPrefill`'s documented chain already names the slot Stage B takes ("under B, a
  linked group's derived link value takes the recommendation's place").
- `resolveGroupRecommendation` is one shared resolution point for the bundle and cross-device resume — the
  property that made B-3 a one-line fix instead of two divergent ones. Stage B should keep using it.
- `evaluateGroupedExercise`'s per-group `manual` skip is precisely the mechanism R-12 ("linked groups are
  `manual`") needs: a linked group produces no competing independent load recommendation while its
  siblings progress normally.
- Group ordering is explicit and frozen in the snapshot, which is what makes D-5's "one backward hop to an
  earlier group" checkable at the schema boundary.

Two cautions for the Stage B stage:

1. **M-2 must be closed first.** Stage B makes mixed manual/non-manual group configurations routine rather
   than exotic. The current pre-filters are keyed on the slot-level strategy alone, so the first athlete
   who sets an exercise to Manual and links a back-off will get a slot that progresses nothing. Fixing it
   as part of Stage A keeps the fix in the layer that owns it.
2. **M-1 should be closed first as well**, because Stage B's reference resolution ("heaviest logged work
   set of the reference group") will read the same per-group history path. A history builder that
   substitutes today's group definition for each session's own would carry that error into the link basis.

Neither caution is an architectural objection. The representation, the identity model, the wire contract,
the migration and the negative-control discipline are all of a quality that Stage B can build on directly.

---

## 10. Verdict

Six MEDIUM findings: one that can emit a wrong `decrease_load` from a template or week-modifier edit (M-1);
one user-reachable configuration that is documented as working and silently does nothing (M-2); one
authoring dead end whose error names a control the screen does not offer (M-3); one unmet acceptance clause
that removes the feature's browser coverage from CI while being reported as met (M-4); one named quality
gate that fails while being reported green (M-5); and one authorable prescription field the execution
screen contradicts (M-6). Nine LOW findings follow, each with a disposition.

The substance of Stage A is strong — the identity model, the window, the per-group progression, the bridge,
the migration and index, the wire contract, the four bug fixes and the negative-control discipline all hold
up under independent source inspection and under verification I executed myself. None of the six MEDIUM
findings requires rearchitecting anything; all are bounded fixes within existing modules. But M-5 and M-4
mean the quoted evidence does not match the tree, and M-1/M-2/M-3/M-6 are defects an athlete can reach.

REVISION REQUIRED
