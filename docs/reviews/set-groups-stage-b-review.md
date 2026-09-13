# Set Groups (PI-012) Stage B — independent review

**Date:** 2026-09-13
**Role:** independent review (fresh session; no fixes implemented, no source or test file changed)
**Session:** `O5 | PI-012-B | Review — Set Groups Stage B`
**Model:** claude-opus-5 (1M context)
**Tree:** `583a9ab` (dirty) — Stage A + Stage B uncommitted, alongside the concurrent, unrelated
PI-017 (repository-agent-workflow) documents and tooling, which this review did not read or write.
**Under review:** [set-groups-stage-b-implementation.md](set-groups-stage-b-implementation.md)
**Binding inputs:** [set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md)
§19 (D-1…D-6), §6 (linked-load semantics), §11.1/§11.2/§11.4 (authoring, execution, input-state
transitions); [set-groups-stage-a-documentary-closeout-verification.md](set-groups-stage-a-documentary-closeout-verification.md)
§5 (the Stage A gate this task builds on).
**Verdict:** see §12.

---

## 0. Summary

Stage B's representation is sound and its persistence path is correct. The flat
`link: {ref, percent}` field, the `refIndex` one-save authoring alternative, the schema-boundary
invariants (no self / forward / chained / unknown reference), the performed-basis highest-load rule,
the nearest-step rounding, and the write-time L-1 gate are all implemented as decided and hold up
under independent reproduction. I verified end to end — including with my own browser probes — that
the nested `link` survives authoring → server parse → snapshot freeze → IndexedDB → the wire →
cross-device adoption, and that the authoring-only `refIndex` never reaches a stored scheme or a
frozen snapshot. The full suite is genuinely green on an isolated pairing: 1408 unit, 505+17-skipped
integration, 165 E2E, all seven gates exit 0.

Two things do not hold, and both are in the feature's own primary surface rather than its edges.

**F-1 (HIGH).** The linked group's *explanation* is re-derived on every render; the *weight input the
athlete logs from* is re-derived only when the selected group changes. Editing or deleting the
reference set therefore leaves the card contradicting itself: my probe observed the note reading
`80% of Top (140 kg) → 112.5 kg proposed` while the box still held `105`, and — after the Top set was
deleted outright — the note reading `no Top set logged yet this session; using this group's own
carry-forward` while the box still held `105`, a number derived from a set that no longer exists. The
report's §7 row for this requirement asserts "no caching, no invalidation logic needed" on the
strength of a pure-function test; that test is correct and the rendered UI still does not follow.

**F-2 (HIGH).** A group that already holds a pending recommendation and is *then* linked keeps that
recommendation. Nothing supersedes it on a prescription edit and neither bundle assembly nor the card
filters on `link`. My probe observed the Today bundle surfacing both group keys, the card rendering
**two** `Accept` buttons, the link explanation suppressed entirely (the card's per-group branch is
`rec ? RecommendationCard : GroupLinkNote`), and tapping the linked group's stale `Accept 82.5 kg`
overwriting the link-derived `72.5` in the input. §6.3 and D-2 say a linked group produces "no
recommendation and no decision … ever"; converting an existing back-off group is the most natural way
an owner would adopt Stage B at all.

Both are reproducible, both are in scope, and both are UI/service-level rather than representational —
the stored shape does not change to fix either. Everything else I found is MEDIUM or below, including
one editor dead-end (F-3) and one live documentary contradiction in `prescription-model.md` (F-4).

The report's evidence arithmetic is wrong but its conclusion is not: the listed unit additions total
48 against a reported suite delta of 43. I reconciled this to the test files themselves — the real
additions are 43 and **no Stage A test was removed or changed**; two per-file baselines in the report
are simply miscounted (§8.2).

---

## 1. Scope and independence

I read the implementation report, the evaluation's §19 → §6 → §11 in that order, and the Stage A
closeout verification. Historical Stage A sections were read only to settle two specific questions
(the per-file unit baselines in §8.2, and the dead-letter boundary in §10). I did not re-open any
closed Stage A finding, did not re-run the Stage A review, and found no evidence of Stage A
regression that would warrant it — the Stage A E2E, integration and unit coverage all pass unchanged
on my own isolated run.

I did not implement, fix, commit, push, deploy, touch production or staging, or migrate any shared
database. I changed no product source file and no product test file; the two files I mutated for
negative controls were restored byte-for-byte and verified by hash (§7).

---

## 2. Environment, task-owned resources and pairing

The environment was clean when I started: no listener on port 3000, no `node` process, and no
`gymapp_t_*` database left over from Stage A or Stage B.

| Resource | What I created | Pairing proof |
|---|---|---|
| Database | `gymapp_t_sgbrev` (created, migrated, seeded, dropped) | — |
| App server | one production server (`pnpm build && pnpm start`) started by me on :3000 with `DATABASE_URL` pointed at `gymapp_t_sgbrev`; Playwright reused it (`reuseExistingServer: true`) and never spawned its own | see below |

`playwright.config.ts` hard-codes `baseURL`/`webServer.url` to `http://localhost:3000`, so a
task-owned server means owning that port rather than choosing another one. Nothing else was running,
so no other task's server was touched.

**Pairing verified, not assumed.** Before bootstrapping: `gymapp_t_sgbrev` had 0 users; the shared
`gymapp` had 1 user and 1859 sessions. After `smoke.spec.ts` created the one allowed account
(ADR-004) *through the running server*: `gymapp_t_sgbrev` had 1 user; shared `gymapp` was still
1 user / 1859 sessions. The server was therefore demonstrably writing to my disposable database. At
the end of the review the shared database still reads `1 | 1859 | 433` (users | sessions | templates)
— unchanged by anything I ran.

Every suite ran sequentially. No build or test run overlapped another, and nothing ran against the
shared `gymapp` database at any point.

Bootstrap followed agent-workflow §7's fresh-database order exactly: `db:migrate` → `db:seed` →
`smoke.spec.ts` (account creation needs the real request context) → `db:seed` again (idempotence) →
`tsx tests/e2e/seed.ts` → suites.

---

## 3. Findings, severity-ranked

### F-1 — HIGH — the logging input does not follow a reference-set edit or deletion, while its own explanation does

**Where.** [ExerciseCard.tsx](../../src/ui/workout/ExerciseCard.tsx) — the re-derivation effect is
keyed on `[selectedGroupKey]` alone, with `react-hooks/exhaustive-deps` disabled; `prefill` and
`describeGroupLink(...)` are both recomputed on every render, but only `describeGroupLink`'s result
reaches the screen directly. The `weight`/`reps` inputs are React state that the effect writes only
when the selection changes.

**Spec.** §6.2, two rows:

> Top set edited after back-offs are logged | Logged back-off sets are facts and are **never**
> recomputed. Only the prefill of not-yet-logged sets follows the edit, because prefill is derived on
> render from local sets.

> Reference set deleted | Same as "no sets yet" from that moment on.

**Observed** (task-owned browser probe, isolated server/DB, real Chromium):

| Step | On-screen explanation | Weight input |
|---|---|---|
| Top logged at 130 kg, auto-advance to Back-off | `80% of Top (130 kg) → 105 kg proposed` | `105` ✔ |
| Top set **edited** 130 → 140 kg | `80% of Top (140 kg) → 112.5 kg proposed` | `105` ✘ |
| Top set **deleted** | `no Top set logged yet this session; using this group's own carry-forward.` | `105` ✘ |

Both explanation assertions are hard assertions that passed; the input values are the probe's own
observations (`PROBE A1 … "105"`, `PROBE A2 … "105"`).

**Why this is a defect and not merely a spec preference.** §11.4's transition table does say "no
re-derivation happens on a render, a recommendation decision, or a sync event — only the two
selection-change events above re-derive", and the implementation follows that sentence literally. But
that rule was written for Stage A, where every prefill source is effectively static while a group is
selected (the frozen `groupPrefills`, a recommendation that cannot change mid-session, and the group's
own last set, which only changes by logging — which either keeps the value by copy-forward or advances
and re-derives). Stage B introduces the first prefill source that changes mid-session *without* a
selection change, which is exactly what §6.2's two rows are about. Stage B inherited the conflict and
did not resolve it. Whichever section wins, the shipped result — an explanation and an input that
disagree on the same screen, one tap away from logging the stale number — is sanctioned by neither.

The delete case is the worse half: the card states it is falling back to the group's own carry-forward
while the box holds a percentage of a set that has been removed.

**Report accuracy.** §7's row claims: *"Derivation is a pure function of CURRENT `sets` on every render
— no caching, no invalidation logic needed; unit test explicitly re-derives before/after adding a later,
heavier Top set."* The pure function is correct; the claim about the rendered input is not supported by
that test, and no browser test covers it.

**Constraint on any fix.** A dirty draft must still survive — §11.4's "type into weight/reps" rule and
the Stage A E2E that pins draft-discard on a chip tap both stand. The narrow behaviour that is missing
is re-derivation of a *clean* input for the *currently selected linked* group when the reference set
list changes.

---

### F-2 — HIGH — linking a group that already holds a pending recommendation leaves a competing decision surface, and suppresses the link explanation

**Where.** Three places, none of which consider `link`:

- [today/service.ts](../../src/server/today/service.ts) — `pendingRecommendations` is filtered only to
  "keys present in the CURRENT scheme" (§4.5's removed-group filter); the same is true of the
  `getActiveSession` resume path's `recommendations`.
- [prescriptions/service.ts](../../src/server/prescriptions/service.ts) — `updatePrescription` never
  supersedes recommendations. Supersession happens only on evaluation and on a relevant set edit.
- [ExerciseCard.tsx](../../src/ui/workout/ExerciseCard.tsx) — the per-group branch is
  `rec ? <RecommendationCard/> : <GroupLinkNote/>`, so a surviving `rec` both renders a decision card
  **and** suppresses the link note.

**Spec.** §6.3 rule L-1's stated visible consequence: *"a linked back-off group produces **no
recommendation and no decision** — no `Accept / Keep / Custom` card for the back-offs, ever"*; D-2:
*"Linked back-offs derive load from the reference group without competing independent load
recommendations."*

**Observed** (probe, real browser, real completion): a two-group slot on `load-progression` completes a
session, earning one pending recommendation per group. The prescription is then patched exactly as the
editor patches it — Back-off gains `link: {ref: topKey, percent: 70}` and a forced `manual` override;
the save is accepted (L-1 is satisfied, because it checks the *new* effective strategy). Then:

```text
PROBE B bundle pendingRecommendations after linking: ["l684nm2v","p5k8py1m"]   (both group keys)
PROBE B Accept buttons rendered on the grouped card: 2
PROBE B link note visible: false
PROBE B on Back-off: input="72.5" (link = 70% of 102.5 = 71.75 => 72.5);
        Accept buttons still offered: ["Accept 82.5 kg"]
PROBE B input after tapping the linked group's Accept: "82.5"
```

So on the linked group the athlete is offered a stale load-progression decision, is shown no
explanation of the link at all, and one tap replaces the link's proposal with the progression target.
The decision is then persisted, and feeds `groupPrefills` through `buildSnapshot`'s `decisionChosen`
on the following session — where it surfaces whenever the link falls back (no reference set logged).

**Reachability.** This is the ordinary adoption path for Stage B: take an existing top-set/back-off
slot that has been progressing independently and convert the back-off to a percentage. It needs no
unusual state, no offline path and no race.

**Note on what is safe.** The first group can never carry a `link` (a reference must be *earlier*), so
`resolveGroupRecommendation`'s pre-conversion null-key bridge (C-1/D-6(a)) is not implicated. The
defensive engine skip (`if (group.link) continue;` in `evaluateGroupedExercise`) correctly prevents
*new* records; it does nothing about ones written before the link existed.

---

### F-3 — MEDIUM — the editor can build a payload the server rejects, with the fixing control hidden

**Where.** [PrescriptionForm.tsx](../../src/ui/prescriptions/PrescriptionForm.tsx): the linked group's
`strategyOverride` is forced to `"manual"` only at the moment the link checkbox is ticked
(`setGroupLinkEnabled`); the submit path never re-forces it. The load effect sets `strategyOverride`
to `""` whenever the stored per-group strategy equals the slot strategy.

**Sequence.** Author a slot with `strategyId: "manual"` and a linked group (stored per-group override:
`manual`). Re-open the edit page: the linked group's `strategyOverride` loads as `""` ("same as
exercise") because the two agree. Now change the **slot** strategy to load-progression. The linked
group's own strategy control is not merely disabled — it is replaced by the static text "Manual
progression (required for a percentage-linked group)" — so the user cannot correct it, and the payload
omits `progression.groups` entirely.

**Observed:**

```text
PROBE D loaded progression: slot=manual groups={"a1kk7llb":{"strategyId":"manual",...},...}
PROBE D slot-strategy switch => HTTP 400
  {"error":"incompatible_prescription",
   "issues":["a percent-linked group cannot use load-progression or rep-progression (\"Back-off\")"]}
```

The server behaves correctly and the message is accurate and names the group; the form surfaces it. But
the code comment at that control asserts the editor is "never offering an incompatible pairing the
server would reject anyway", and the only recovery is to untick and re-tick the link (or revert the slot
strategy) — non-obvious, and a save-blocking dead end until the user finds it.

---

### F-4 — MEDIUM — `prescription-model.md` §2 still states Stage B is unimplemented, in the shape that was deliberately rejected

[prescription-model.md:134-136](../../docs/architecture/prescription-model.md#L134-L136), roughly
fifty lines below the new Stage B subsection in the same §2:

> only Stage A (independent groups) is implemented — a future percentage-linked back-off (Stage B) is
> a reserved, additive extension of the group entry's `load` field, not yet built.

Both halves are now wrong, and the second re-asserts the `GroupLoad`/`load.mode` union that §1 of the
implementation report explicitly declined in favour of the flat `link` field. The report's §6 claims
this section was updated to retire the "reserved, not implemented" language; the new text was added but
the old sentence was left standing, so the binding architecture document contradicts itself and the
code.

---

### F-5 — LOW — the report's unit-count and file-manifest arithmetic is wrong (the conclusion is not)

Fully reconciled in §8.2. In short: the listed per-file additions total 48 against a reported suite
delta of 43; the true additions are 43, the discrepancy is two miscounted Stage A baselines, and **no
Stage A test was removed or altered** — I verified every Stage A test title still present in the two
affected files.

---

### F-6 — LOW — clearing an invalidated link silently changes the group's progression strategy

`sanitizeGroupLinks` resets the cleared group's `strategyOverride` to `""` ("same as exercise"). If the
slot strategy is load-progression, a group that was manual-because-linked silently becomes
load-progressing. The `linkNotice` says only that the link was cleared, not that the progression
strategy changed with it. The behaviour is defensible (leaving a stale forced `manual` is also wrong);
the silence about it is the finding.

---

### F-7 — LOW — the missing-reference note claims a carry-forward that may not exist

`GroupLinkNote` renders `…no <ref> set logged yet this session; using this group's own carry-forward.`
unconditionally whenever `referenceLoadKg === null`. When the group also has no carry-forward and no
`baselineLoadKg`, the input is left empty while the text asserts a fallback that produced nothing.
§6.2's requirement is to "say so in the subtitle" and "never fabricate a load" — the load is not
fabricated, but the sentence is inaccurate in that state.

---

### F-8 — LOW — editor link-clearing has one browser test and no unit test

`sanitizeGroupLinks` is not exported, so it has no unit coverage. Its only test is the E2E that drives
an actual `↑` reorder. Two of the three invalidation causes the notice itself enumerates — the
reference group being **removed**, and the reference group itself **becoming linked** — are untested at
every level in the editor. (Both are covered as *schema* rejections by the integration test, which is a
different guarantee: that a dangling scheme is refused, not that the editor never builds one.)

---

### F-9 — LOW — §7's frozen/offline/adoption row cites no executed evidence

The row reads *"not re-tested here beyond what Stage A's own offline machinery already proves, since
Stage B adds no new sync op, no new IndexedDB shape, and no new freeze point."* "No new sync op" is
true and is not the relevant risk — the risk is a `z.object` stripping an additive nested key on one of
the several parses between the editor and an adopting device. I executed that coverage instead (§6.3,
PROBE C, plus direct row inspection): the behaviour is correct. The finding is that the report claimed
coverage by inheritance that its own inherited runs could not supply, since no Stage A artefact
contains a `link`.

---

## 4. Acceptance coverage against the prompt's binding list

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Flat `link:{ref,percent}` vs the §6.5 `load` union — engineering deviation | **Accepted** (§5, D-1) | Consistent with Stage A's own flat `baselineLoadKg`; ADR-008 Amendment 1 fences the reference properly |
| 1 | Performed-only; no `basis` field, path or test | **Met** | `groupLinkSchema` has no `basis`; grep finds no prescribed-basis path |
| 1 | Integer 10–100, no default | **Met** | `.int().min(10).max(100)`, no `.default()`; percent input has no prefilled value; boundary tests + submit-time re-validation |
| 1 | Stable one-save reference assignment | **Met** | `assignGroupKeys` second pass; unit + integration + E2E; my DB inspection found `{"ref":"<realkey>","percent":80}` in every stored scheme |
| 1 | `ref`/`refIndex` validation (xor) | **Met** | authoring schema `.refine` + 2 rejection tests |
| 1 | Reorder / removal | **Met with a coverage gap** | reorder: browser-tested; removal: schema-tested only — **F-8** |
| 1 | No self / forward / chained / cross-slot reference | **Met** | both `superRefine`s; 7 rejection tests; cross-slot structurally impossible; **negative control NC-2 executed** |
| 1 | Transient authoring fields cannot enter stored snapshots | **Met — independently verified** | `assignGroupKeys` rebuilds `link` as `{ref,percent}`; DB: `refIndex` count = **0** in both `exercise_prescriptions` and `session_exercises.prescription` |
| 2 | Highest attributed non-warm-up reference load | **Met** | `Math.max` over non-warm-up sets of `ref`; **negative control NC-1 executed** |
| 2 | Nearest-step rounding | **Met** | `roundToStepKg` reused verbatim; 130 × 80% → 105 at 2.5 kg confirmed in unit, E2E and my own probe |
| 2 | No double deload multiplier | **Met (by inspection)** | the reference is a logged `weightKg`; `resolveLinkedLoad` applies no multiplier; on a deload the card's rec list is empty and only the `groupPrefills` fallback is multiplied, once |
| 2 | Missing-reference fallback + accurate text | **Met, with F-7** | fallback value correct; wording inaccurate when there is no carry-forward either |
| 2 | First-set proposal only; later sets copy the athlete's load | **Met** | "last set logged in this group" short-circuits first; unit + E2E + probe (`100` copied, not re-derived) |
| 2 | **Input updates after reference edits/deletions** | **NOT MET** | **F-1** — reproduced in the browser |
| 2 | Input updates on selection change and reload | **Met** | Stage A E2E (auto-advance, chip tap, reload); my PROBE C confirmed it again after an offline reload |
| 2 | Dirty drafts preserved / logged facts preserved | **Met** | draft survives a reference edit (the same mechanism as F-1); logged sets never recomputed |
| 3 | Linked groups resolve to manual | **Met at write time** | `checkPrescriptionCompatibility` L-1 + 5 unit + 1 integration + editor forcing + defensive engine skip |
| 3 | No competing recommendation/decision | **NOT MET** | **F-2** — reproduced in the browser |
| 3 | Existing pending recommendations when linking an existing group | **NOT MET** | **F-2** |
| 3 | Prefills when linking/unlinking | **Met, with a secondary effect of F-2** | linking does not perturb `groupPrefills`; a decision taken on the stale card does feed them |
| 3 | Independent progression + Stage A replay invariants preserved | **Met** | 505 integration (incl. grouped replay/idempotence), 165 E2E, 1408 unit — all green on my isolated run |
| 4 | `link` traced through authoring → parse → freeze → sync → persistence → adoption | **Met — independently verified** | §6.3; PROBE C passed; 9 frozen snapshots carry `link`, 0 carry `refIndex` |
| 4 | No stripping of additive keys | **Met** | `link` is declared on `setGroupSchema`, which `prescriptionSnapshotDataSchema` and thence `sessionExerciseUpsertPayloadSchema` reuse; `applyWeekModifiers` is spread-based and preserves it |
| 4 | Later template edits | **Met, with F-3** | edit round-trip browser-tested; the slot-strategy dead end is F-3 |
| 5 | Manifest and unit-count reconciliation | **Reconciled** | §8.1, §8.2 — **F-5** |
| 5 | Inherited Stage A limitations checked against final state | **Done** | §8.3 |
| 5 | Shared-resource deviation assessed | **Done** | §9 |

---

## 5. Deviation dispositions

| # | Deviation | Disposition |
|---|---|---|
| D-1 | Flat `link` field instead of the §6.5 `GroupLoad` union | **Accepted.** Stage A never adopted the union for `baselineLoadKg`; introducing it for `link` alone would leave two shapes for "how this group's load is determined". Behaviourally identical, and `baselineLoadKg` genuinely serves as §6.2's "no sets yet" fallback. ADR-008 Amendment 1 fences the reference itself, which is the part that mattered. |
| D-2 | No `basis` field | **Accepted.** §19 D-4 narrows V1 to performed-only; a single-valued enum is dead configuration surface. Adding it later is additive and optional. |
| D-3 | `refIndex` index-addressed authoring | **Accepted.** Mirrors the already-accepted `groupOverridesByIndex` pattern rather than inventing one, is authoring-only, and is provably stripped before storage (verified at the database, not just in code). |
| D-4 | Editor hides rather than disables the strategy select for a linked group | **Accepted as a UX choice, with F-3 attached.** Hiding is reasonable; hiding it in a state where it is the only control that can unblock a save is not. F-3 is the defect, not the choice. |
| D-5 | §7 treats offline/reload/adoption as inherited rather than executed | **Rejected as an evidence claim (F-9); the behaviour itself is correct** and is now covered by executed evidence in this report. |

---

## 6. Evidence — executed here

All commands run sequentially, against the task-owned server/`gymapp_t_sgbrev` pairing proved in §2.

### 6.1 Quality gates (R level, agent-workflow §5 — "full quality gates")

| # | Command | Result | Exit |
|---|---|---|---|
| 1 | `pnpm lint` | clean | 0 |
| 2 | `pnpm typecheck` | clean | 0 |
| 3 | `pnpm typecheck:sw` | clean | 0 |
| 4 | `pnpm format:check` | `All matched files use Prettier code style!` | 0 |
| 5 | `pnpm test:unit` | `Test Files 96 passed (96)` / `Tests 1408 passed (1408)` | 0 |
| 6 | `pnpm test:integration` | `Test Files 29 passed \| 6 skipped (35)` / `Tests 505 passed \| 17 skipped (522)` | 0 |
| 7 | `pnpm build` | production build completed | 0 |

All three suite figures match the implementation report's §8 exactly (1408 / 505 + 17 skipped). The 17
skips are the pre-existing real-Postgres concurrency tests, unchanged.

### 6.2 Database bootstrap and E2E

| # | Command | Result | Exit |
|---|---|---|---|
| 8 | `CREATE DATABASE gymapp_t_sgbrev` | created | 0 |
| 9 | `pnpm db:migrate` | `migrations applied successfully!` (through 0014) | 0 |
| 10 | `pnpm exec drizzle-kit check` | `Everything's fine` | 0 |
| 11 | `pnpm db:seed` (1st) | `Seed complete.` | 0 |
| 12 | `pnpm exec playwright test tests/e2e/smoke.spec.ts` | `1 passed` — account bootstrap, and the pairing proof in §2 | 0 |
| 13 | `pnpm db:seed` (2nd — idempotence) | `Seed complete.`, `noop=14 conflicts=0` | 0 |
| 14 | `pnpm tsx tests/e2e/seed.ts` | `E2E seed ready: user=… program=… template=… block=…` | 0 |
| 15 | `pnpm test:e2e` | **`165 passed (3.4m)`** — 39 spec files, 0 failed, 0 flaky | 0 |

`tests/e2e/setGroups.spec.ts` contributed 7 passes (4 Stage A + 3 Stage B) and
`tests/e2e/setGroupsOffline.spec.ts` 1 — matching the report. `dead-letter.spec.ts` (all 3),
`offline-set-edit-delete.spec.ts`, `offline-recommendation.spec.ts` and
`offline-bodyweight-recovery.spec.ts` (all 10) also passed; see §10.

### 6.3 Task-owned probes (temporary spec, since deleted)

A single throwaway Playwright spec, `tests/e2e/reviewProbeStageB.spec.ts`, written for this review and
removed afterwards. No product source or test file was modified to run it.

| Probe | What it exercised | Outcome |
|---|---|---|
| A | reference-set **edit** and **delete** versus the rendered weight input | **Defect reproduced — F-1.** Explanation assertions passed; input stayed `105` in both cases |
| B | linking a group that already holds a pending recommendation | **Defect reproduced — F-2.** 2 group keys in the bundle, 2 `Accept` buttons, link note suppressed, `Accept` overwrote `72.5` with `82.5` |
| C | linked load **offline**, **offline reload**, and **cross-device adoption** into a cold browser context | **Passed.** `80% of Top (130 kg) → 105 kg proposed` and input `105` held while offline, across an SW-served offline reload, and in a fresh context resuming via "Resume here" |
| D | slot-strategy change on a prescription whose linked group inherits `manual` | **Defect reproduced — F-3.** `HTTP 400 incompatible_prescription` |

Direct persistence inspection on the disposable database, after the probes:

```text
exercise_prescriptions : link entries store {"ref":"<real key>","percent":80}   refIndex count = 0
session_exercises      : 9 frozen snapshots carry `link`                        refIndex count = 0
```

This is the executed evidence for the "no stripping of additive keys" and "transient authoring fields
cannot enter stored snapshots" requirements — the wire and persistence path is genuinely correct.

---

## 7. Negative controls (agent-workflow §6)

Executed, restored, and verified byte-for-byte by SHA-256 rather than `git checkout` (both files are
uncommitted, so `git checkout` could not restore them).

| Control | Command | Expected | Observed | Restored |
|---|---|---|---|---|
| NC-1 — highest reference load is load-bearing | mutate `referenceLoadKg` from `Math.max(...loads)` to `loads.at(-1)`; `pnpm exec vitest run tests/unit/setGroups/groupSelection.test.ts` | the "uses the HIGHEST logged non-warm-up load, not the modal or last one" test fails | `1 failed \| 28 passed (29)`, failing at `groupSelection.test.ts:186` | `identical` (len 7890, sha `168fb7319dd50a59`) |
| NC-2 — the chained-link rejection is load-bearing | disable the stored-shape `data.groups[refIndex]!.link` guard; `pnpm exec vitest run tests/unit/setGroups/setSchemeGroups.test.ts` | the "rejects a chain — linking to a group that is itself linked" test fails | `1 failed \| 42 passed (43)`, failing at `setSchemeGroups.test.ts:274` | `identical` (len 19894, sha `c791637361a9e7e7`) |

Both new-test families discriminate. Per §6, the remaining Stage B additions are pure-function and
UI-copy tests in the "inspection only" class; I inspected them and their expected values visibly differ
from the pre-Stage-B output (there was no `link` code path at all before this task).

---

## 8. Evidence and process reconciliation

### 8.1 The manifest — six source files, and where a count of five comes from

§3 and §6 of the implementation report both list **six** source files, and all six genuinely carry
Stage B changes:

| File | Stage B change |
|---|---|
| `src/domain/schemes/setScheme.ts` | `groupLinkSchema` / `groupLinkAuthoringSchema`, `link` on both group shapes, cross-group invariants in both `superRefine`s, `assignGroupKeys` second pass |
| `src/domain/prescriptions/schema.ts` | rule L-1 in `checkPrescriptionCompatibility` |
| `src/domain/progression/evaluateSession.ts` | `if (group.link) continue;` defensive skip |
| `src/ui/workout/groupSelection.ts` | `resolveLinkedLoad`, `describeGroupLink`, the link step in `groupPrefill`, the 5th `loadStepKg` parameter |
| `src/ui/workout/ExerciseCard.tsx` | `GroupLinkNote`, `describeGroupLink` wiring, `loadStepKg` pass-through |
| `src/ui/prescriptions/PrescriptionForm.tsx` | `draftId`, link draft fields, `sanitizeGroupLinks`, `updateGroups`, `setGroupLinkEnabled`, submit validation and `link` construction, the link JSX block |

A grep for the literal marker `Stage B` across `src/` returns **five** of these — `prescriptions/schema.ts`
cites its rule as "§6.3 rule L-1" without the stage name. That is the only five/six divergence I can
find, and it is a comment-wording artefact, not a missing or extra file. The manifest is correct and
complete as written.

### 8.2 The unit counts — 48 listed, 43 actual; no Stage A coverage removed

| File | Report's claim | Stage A's actual final count | Stage B additions (verified by describe block) | Now |
|---|---|---|---|---|
| `setSchemeGroups.test.ts` | 24 → 43 (+19) | **25** ([stage-a-implementation](set-groups-stage-a-implementation.md) §12.2: "+4 M-6 tests (25 total)") | **18** (9 + 6 + 3, three Stage B describes) | 43 ✔ |
| `prescriptionCompatibility.test.ts` | 8 → 13 (+5) | 8 | 5 | 13 ✔ |
| `groupSelection.test.ts` | 9 → 29 (+20) | **13** (same §12.2: "+1 L-3 test (13 total)") | **16** (6 + 6 + 4, three Stage B describes) | 29 ✔ |
| `evaluateSessionGroups.test.ts` | 13 → 17 (+4) | 13 | 4 | 17 ✔ |
| **Total** | **48** | — | **43** | — |

43 additions on a Stage A baseline of 1365 (the closeout lineage's figure, `+1` over the
implementation report's own 1364) gives exactly the 1408 I measured. **The report is stale on two
baselines, not on its outcome**: 25 − 24 = 1 and 13 − 9 = 4 account for the whole 5-test gap.

To rule out the alternative explanation — that Stage A coverage was removed or rewritten — I
enumerated every `it()` title in both affected files. All 25 Stage A titles in `setSchemeGroups` and
all 13 in `groupSelection` are still present and unmodified; the Stage B additions sit in three new
`describe` blocks per file, appended rather than interleaved. **Nothing was removed or changed.** The
report's own "all additive; no existing test's assertions were changed" claim is correct — its
arithmetic is not (F-5).

### 8.3 Inherited Stage A limitations, checked against Stage A's actual final state

The report's §10 lists four inherited items as out of scope. Checked against the closed Stage A
lineage rather than against the initial pass:

| Inherited item as stated in §10 | Actual state |
|---|---|
| "the two-save progression-override authoring flow" | **Stale — this was closed in Stage A.** M-3 introduced `groupOverridesByIndex`, and Stage A's own E2E ("…authorable in ONE save, each group's required repCap set before either group has a persistent key") plus two integration tests prove it. Stage B in fact *relies* on the same pattern for `refIndex`. Listing it as an open limitation is incorrect, though harmless — it under-claims. |
| "missing browser coverage for plain group add/remove/reorder" | **Still open, correctly stated.** Stage B added browser coverage for the link-clearing reorder specifically; the general Stage A controls remain uncovered. Related to F-8. |
| "the reverse-conversion pending-record asymmetry" (L-7) | **Still open, correctly stated;** the L-7 integration test pins the current inert behaviour. |
| "`assignGroupKeys` trusting a client-submitted key verbatim" (L-8) | **Still open, correctly stated.** Note Stage B widens the blast radius slightly: `link.ref` is matched against those same client-supplied keys. No new defect — the `superRefine` still requires the reference to resolve within the submitted array — but worth carrying forward with L-8 rather than leaving implicit. |

---

## 9. Shared-resource deviation — assessment

### 9.1 What was done

The implementer's §8.1/§8.2 disclose, and I take at face value as disclosures: (a) `pnpm db:migrate`
was run against the **shared** local dev database `gymapp` to apply Stage A's `0014`; (b) E2E ran
against that shared database and the default shared server; (c) a foreground
`npx playwright test tests/e2e/setGroups.spec.ts` was run **while a background full-suite
`pnpm test:e2e` was still executing**, both sharing one server (`reuseExistingServer: true`) and one
database.

### 9.2 Authorisation

Partially authorised, and partially not.

- **The migration itself is authorised.** `CLAUDE.md` names "migration verification" as a use of the
  local Docker database and distinguishes it sharply from production. The DDL is additive, already
  reviewed, and non-production. Per instruction I have **not** undone it, and future local sessions
  should treat `gymapp` at `0014` as the new baseline.
- **Using the shared database as the E2E target is a deviation.** agent-workflow §10 requires any
  disposable database to use the `gymapp_t_<task>` prefix, and §7 warns explicitly about server/database
  pairing when more than one task is in play. Stage A's own report used an isolated disposable Postgres
  for exactly this reason. Stage B did not, and left its scratch data in the shared database.
- **The overlapping Playwright runs are a clear deviation** and the implementer says so plainly. §7's
  guidance ("stop only your server… or the suite runs green against the old one") exists for precisely
  this failure mode, and Playwright is pinned to `workers: 1` because the suite is not concurrency-safe
  against one account and one active block.

Credit where due: the contamination was disclosed rather than buried, diagnosed rather than retried
away, no product source or test was altered to route around it, and the temporary diagnostic spec was
deleted.

### 9.3 Evidence for restored state — what I could and could not corroborate

Independently checked against the shared `gymapp` database:

| Claim | My finding |
|---|---|
| "the account's only active block's schedule now contains exactly its original single entry, no scratch template" | **Corroborated.** The one active block's schedule holds exactly one entry, the seed's own unarchived `E2E Phase 3 Day`. No `E2E SG *` template appears in any schedule. |
| "no stray … archived-vs-active state … beyond the two ordinary scratch prescriptions" | **Partially corroborated, and understated.** Every `E2E SG *` template (all 8 names × 3 runs on 2026-09-13, 02:51–03:04 UTC) is archived; 16 link-bearing prescriptions remain, all on archived templates. Only 3 of 433 templates are unarchived. This is ordinary accumulated scratch residue — the shared database already holds 1859 sessions and hundreds of archived scratch templates from many earlier sessions — but it is residue in a *shared* resource that an isolated database would not have produced. |
| The local dev database now carries `0014` | **Corroborated.** `set_logs.group_key` and `recommendations.group_key` both exist and `drizzle.__drizzle_migrations` has the `0014` row. |
| *When* the migration was applied | **Not recoverable.** `__drizzle_migrations.created_at` records the migration's **authoring** timestamp from `drizzle/meta/_journal.json` (`1789221003759` for `0014_third_scream`), not the apply time. The disclosure in §8.1 is therefore the only record of when and by whom, and I can corroborate the end state only. I note this so no later reader mistakes that column for an audit trail. |

### 9.4 Observed contamination versus causal inference

The report's §8.2 is, on this point, better disciplined than most — but its framing still slides in one
place. Holding the line explicitly:

- **Observed facts.** One `session_locked` dead-letter in a concurrent run of `setGroups.spec.ts`; a
  scratch template appearing briefly in the shared account's active-block schedule; an
  `offline-set-edit-delete.spec.ts` failure and a `dead-letter.spec.ts:280` `session_locked` in the same
  window. These are observations.
- **Inference.** That the concurrent runs *caused* all four is a hypothesis. It is a strong and
  well-motivated one — two Playwright processes racing on one account's single active block and one
  running server is a sufficient mechanism, and the schedule mutation is directly attributable — but it
  is not established by the evidence given.
- **What the clean runs do and do not prove.** §8.2 says the contamination was "transient and fully
  self-resolved". Passing isolated runs — the report's three, and my own 165/165 — establish that the
  symptoms do not reproduce under isolation. They do **not** establish that no product defect exists:
  a genuine race in the outbox-drain/complete-workout window would be expected to pass under isolation
  too. The honest statement is *not reproduced under isolation, cause not established*, which is
  materially weaker than "self-resolved", and the `session_locked` observation should be carried
  forward as unexplained rather than closed. It is not a Stage B blocker on the current evidence.

---

## 10. The historical Stage A dead letter — held separate

The unresolved `tests/e2e/setGroupsOffline.spec.ts` dead-letter observed once during Stage A (cause
unresolved per the Stage A closeout §5, now instrumented via `waitForOutboxDrained`'s capture of
`entity` + `deadReason`) is a **distinct** matter from the Stage B incidents in §9.4, and I have kept
it that way.

In my own isolated full run, `setGroupsOffline.spec.ts` passed and `waitForOutboxDrained` threw
nothing anywhere in the suite. That is one more non-reproduction on top of the existing tally. It
narrows nothing and reopens nothing: the cause remains unresolved, the instrumentation remains live,
and Stage B writes to the same per-group sync field, so the next occurrence should still be treated as
diagnostic gold rather than a flake.

---

## 11. What I did not do

- Did not re-verify Stage A's code, tests or closed findings; the closeout gate is inherited as
  verified. No Stage A regression evidence emerged.
- Did not re-run or re-litigate the Stage A review.
- Did not implement, fix, refactor, commit, push, tag or deploy anything.
- Did not access production or staging; did not migrate, seed or modify the shared `gymapp` database
  (and did not undo its `0014` migration).
- Did not modify any product source file or test file. The two negative-control mutations were
  reverted and hash-verified (§7).
- Did not touch the concurrent PI-017 work (`CLAUDE.md`, `README.md`, `docs/process/`,
  `docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/STATUS.md`, `package.json`, `playwright.config.ts`,
  `.claude/skills/`, `docs/reviews/repository-agent-workflow-*`) or any earlier report.
- Did not edit `docs/STATUS.md`, `docs/ROADMAP.md` or `docs/BACKLOG.md` — those remain the owner's or
  the designated closeout editor's step.
- `pnpm format:check` on this file is not applicable: `docs/` is `.prettierignore`d (agent-workflow §5's
  documentation row excludes ignored files).

---

## 12. Verdict

F-1 and F-2 are both HIGH, both reproduced in a real browser against a real server and database, and
both land on Stage B's own headline behaviour rather than an edge: the percentage-linked load either
disagrees with its own on-screen explanation (F-1), or is overridden by a decision surface the design
says can never exist on a linked group (F-2). Neither requires a representational change — the stored
shape, the schema invariants, the freeze and the sync path are all correct and independently verified —
so remediation should be bounded to the card's re-derivation trigger, the recommendation filter for
linked groups (bundle, resume, and the card's render branch), and the handling of pre-existing pending
records at link time.

Per agent-workflow §4, HIGH prevents the gate.

**REVISION REQUIRED**

Suggested remediation scope, in priority order: F-1, F-2 (both HIGH, blocking); F-3, F-4 (MEDIUM);
F-5…F-9 (LOW — may be consciously accepted, though F-4's one-sentence fix and F-5's count correction
are cheap enough that deferring them costs more than doing them). A+B remain one release; physical
iPhone acceptance is still outstanding and is not substituted by anything in this report.

---

## 13. Drop what you created, list what you did not

**Created and dropped:**

- Database `gymapp_t_sgbrev` — created, migrated to `0014`, seeded twice, used for every E2E and probe
  run in this review, then `DROP DATABASE`d. Confirmed absent from `pg_database`.
- One production app server on port 3000 bound to `gymapp_t_sgbrev` — started by me, stopped by me
  (pid 62764). Port 3000 confirmed free afterwards; no other server was started or stopped.
- `tests/e2e/reviewProbeStageB.spec.ts` — temporary task-owned probe spec; deleted. `git status` shows
  no trace.
- `test-results/` — Playwright failure artefacts from the probes; removed.
- Two negative-control mutations (`src/ui/workout/groupSelection.ts`,
  `src/domain/schemes/setScheme.ts`) — restored byte-for-byte, SHA-256 verified (§7).
- Scratchpad files (server log, suite logs, backups, mutation script) — outside the repository, in the
  session scratchpad.

**Created and deliberately left behind:**

- This report, `docs/reviews/set-groups-stage-b-review.md` — the only file this task was authorised to
  write, uncommitted like the rest of the Set Groups lineage.

**Not created, not dropped, and deliberately untouched:**

- The shared local dev database `gymapp`, including its Stage B scratch residue (16 link-bearing
  prescriptions on archived templates, the archived `E2E SG *` templates) and its `0014` migration.
  Per this task's explicit instruction the migration is **not** undone; the residue is left as found
  because removing another task's data from a shared resource is not this review's call. Its counts are
  identical before and after this review (1 user / 1859 sessions / 433 templates).
- The five pre-existing `gymapp_*` disposable databases from earlier tasks
  (`gymapp_e1rm_remediation`, `gymapp_e1rm_verify`, `gymapp_warmup_e2e`, `gymapp_wu_rem_e2e`,
  `gymapp_wuconc`) — not mine, not dropped.
- The `gym-app-db-1` container (already running, left running).
