# Exercise catalog expansion — independent catalog review (Catalog Expansion 1)

Date: 2026-09-09
Reviewer: independent; did not author `docs/reviews/exercise-catalog-expansion-evaluation.md`.
Repository state reviewed: branch `main`, `HEAD = 56ec000`, working tree carrying the pre-existing uncommitted changes listed in the evaluation's §1.2 — all preserved, none modified. This document is the only file this pass creates.
Method: every claim below was checked against the source at `HEAD`, not against the evaluation's own citations. No implementation, no seeding, no commit, no push, no deploy. No database was contacted at all — the reproduction work needed only static evidence (see §6.4), so no disposable database was created.

**Verdict: REVISION REQUIRED.** The catalog itself is in good shape — the 24-entry manifest, the literals, the deduplication, the measurement conventions and the migration analysis all survive independent checking, in most cases exactly. What does not survive is §12.6 / RR-10: the rollout hazard is understated, its failure mode is described incorrectly in both directions, and it is recorded as "accepted" when no owner has decided it. That needs correction and one new owner decision before implementation.

---

## 1. Scope of this review

The following are **owner-accepted and are not reopened here**: all 24 additions in one delivery (103 → 127); Kettlebell Swing as `other` equipment with `volumeCounting` `auto`; Cable Pallof Press as `load_reps`; Rack Pull generic with a documented constant-pin-height convention; Power Clean keeping `strengthEstimate` `auto`; and the addition of the `tibialis` leaf together with Tibialis Raise. Nothing below argues against any of these. Where a finding touches one of them (M-3 touches O-4's stated consequence; H-1 and H-2 touch O-5's rollout), it corrects a factual claim *about* the decision, not the decision.

Findings are severity-ranked. §7 records the new owner decision this review raises, kept separate from the accepted list. §6 records what was verified as correct, because a review that lists only defects misrepresents the document.

---

## 2. HIGH findings

### H-1 — §12.6 / RR-10 analyse the wrong window, and describe the failure mode incorrectly in both branches

**What the document says.** §12.6 frames the exposure as "between the seed step and the completed app deploy — and, on the phone, until the service-worker update is applied", concludes it is "cosmetic, read-only and self-correcting", and RR-10 disposes of it as lasting "the length of one deploy". On writes it offers a disjunction: "the save either 400s or silently substitutes whatever muscle the unmatched select reports."

**Independent trace.** Both halves of the window were traced separately through rendering, validation, editing, offline persistence and replay.

*Old server + new data — the half §12.6 actually analyses.* Real, and genuinely short: `.github/workflows/deploy.yml:105-123` runs `db:migrate → db:seed → Deploy to Azure App Service` inside one job, so this window is the App Service deployment duration.

*Stale client + new server — the half §12.6 names in one clause and never analyses.* This is the operative case, and it is **unbounded by design**:

- `src/app/sw.ts:337-340` sets `skipWaiting: false` and `clientsClaim: false`, with the comment "Never auto-activate a new SW mid-session — activation is user-triggered via the SKIP_WAITING message below (pwa-offline-strategy.md §8)". `src/ui/ServiceWorkerUpdater.tsx:50-59` shows the only trigger: the athlete tapping "Update available — tap to refresh".
- The stale bundle therefore persists across sessions, indefinitely, at the athlete's discretion. "For the length of one deploy" is false for the client, and "self-correcting" is false for anything but the read path.

**Rendering.** `src/ui/exercises/ExerciseLibrary.tsx:98-101` maps `contributionMuscleLabel` over the primary contributions and `.join(", ")`s them. `src/ui/exercises/muscleGroupDisplay.ts:11-14` returns `MUSCLE_GROUP_DISPLAY_NAMES[muscleGroupId]`, which on the stale build is `undefined` for `tibialis` — despite the function's declared `: string` return type. `Array.prototype.join` renders `undefined` as `""`, so the library row's muscle line is **blank**. The literal-`undefined` branch §12.6 offers is not reachable anywhere. (See L-3.)

**Editing — the load-bearing part.** `src/ui/exercises/ExerciseForm.tsx:158-165` seeds React state straight from the DTO, so the row's `muscleGroupId` is `"tibialis"`. `src/ui/exercises/ContributionEditor.tsx:64-69` builds the option list from `LEAF_MUSCLE_GROUPS` and special-cases only `isRollupMuscleGroupSlug`, so on the stale build no option matches. What happens next is decided by React, and was read from React's own source rather than assumed:

```
node_modules/react-dom/cjs/react-dom-client.development.js:1775-1797  (function updateOptions)
  ...
  for (i = 0; i < node.length; i++) {
    if (node[i].value === propValue) { node[i].selected = !0; ...; return; }
    null !== multiple || node[i].disabled || (multiple = node[i]);
  }
  null !== multiple && (multiple.selected = !0);
```

When no option matches the controlled value, React 19 selects **the first non-disabled option**. In this editor that is `<option value="">Select muscle…</option>` (`ContributionEditor.tsx:79`). So:

- The DOM shows **"Select muscle…"**. The picker does not merely lack a label — it presents itself as *unset*.
- No `change` event fires; React state still holds `"tibialis"`.
- `ExerciseForm.tsx:184-186` skips only `""`, so an untouched save PATCHes `contributions: [{ muscleGroupId: "tibialis", … }]`.

**Answering the question this review was asked.** A stale client **cannot silently substitute** a muscle on its own: the submitted payload preserves `tibialis`, because the payload is built from React state, not from the DOM. §12.6's "silently substitutes whatever muscle the unmatched select reports" is wrong — the select reports `""` in the DOM, and `""` never reaches the payload.

But a stale client **can silently persist a wrong muscle**, and the path is worse than the one §12.6 describes:

1. The athlete opens Tibialis Raise's edit page on the stale bundle, for any reason.
2. The muscle picker reads "Select muscle…" — indistinguishable from a genuinely unset row.
3. The only remotely plausible option in the visible list is **Calves** — the exact muscle §9/C-24 and the §12.4 amendment exist to keep off this entry, "the whole reason O-5 exists".
4. Against the **new** server the PATCH is well-formed and valid. It is accepted. There is no 400, no warning, and nothing in the system can distinguish it from a deliberate edit.
5. Nothing corrects it later. §11.2 is right that no reconcile touches a new slug: `STRENGTH_ESTIMATE_OFF_SLUGS` and `MEASUREMENT_PROFILE_RECONCILE_SLUGS` are fixed legacy lists, and the ledger has already recorded the slug as applied. The weekly volume screen then reports the spurious calf sets the amendment forbids, permanently, until the athlete notices and re-edits.

Against the **old** server the same submit 400s (`updateContributionsListSchema` is built from `muscleGroupSlugSchema` — `src/domain/exercises/schema.ts:177-180`) — and `ExerciseForm.tsx:295` renders it as "Please check the muscle contributions: at least one primary is required", which is not what went wrong. In that window the athlete also cannot save *any* edit to that exercise — name, notes, load step — because the whole contribution array round-trips.

So §12.6's disjunction is wrong on both branches: the 400 branch is real but confined to the short server window and reported misleadingly; the "silent substitution" branch is not how the select behaves, while a *different* and more consequential silent write exists in the window §12.6 does not analyse.

**Offline persistence and replay — a genuine limit on the blast radius, which the document does not claim either way.** This was traced, and it is good news:

- `SYNC_ENTITIES` (`src/domain/sync/schema.ts:33-41`) is `workoutSession, sessionExercise, setLog, recommendation, recommendationDecision, bodyweightEntry, recoveryEntry`. There is no `exercise` entity.
- A grep across `src/sync/**` returns no reference to muscle groups or contributions at all.
- The exercise edit path is a direct `fetch` PATCH (`ExerciseForm.tsx:265-275`), never enqueued.

A wrong muscle therefore **cannot** be queued offline or replayed. It requires an online save. That is worth stating explicitly in §12.6, because it bounds the hazard meaningfully.

**Everything else on the read path is safe, which confirms the document's instinct even where its reasoning is loose.** `src/domain/volume/aggregate.ts:108-118` drops an unrecognised slug through both the leaf and the rollup branches — no crash, no key creation, only an undercount. `src/server/exercises/service.ts:151` casts (`row.muscleGroupId as MuscleGroupSlug`) rather than parsing, so an old server serving a `tibialis` row cannot 500. `src/ui/metrics/VolumeCard.tsx:18-22` uses `?.leaves[slug]?.effective ?? 0`, so the reverse pairing (new client, row not yet seeded) is also safe.

**Required revisions.**

1. Rewrite §12.6 to separate the two windows, and to state that the stale-client half is unbounded by the deliberate `skipWaiting: false` policy rather than by deploy duration.
2. Remove "read-only", "self-correcting" and "for the length of one deploy" from RR-10, from §12.6's conclusion and from the §12.4 amendment's **Rollout** paragraph, or scope each to the read path explicitly.
3. Correct the write-path description per the trace above: untouched saves preserve `tibialis`; the hazard is an apparently-empty picker inviting a `calves` substitution that the post-deploy server accepts.
4. Add the offline/replay finding — no sync entity, no outbox path — as a positive bound.
5. Replace "Mitigation: do not edit Tibialis Raise until the app update is applied" with the controls in M-1, and state plainly why no code shipped in this commit can protect this particular window.

### H-2 — RR-10 is recorded as "accepted"; O-5 does not cover it, and no owner has decided it

**Evidence of the claim.** §0: "Nothing in §6–§12 is pending; the decisions are recorded as accepted in §13 and are not reopened below." §12.6: "It is disclosed as RR-10 and accepted, in the same spirit as the residual race ADR-010 itself accepted." RR-10's disposition column: "§12.6, disclosed and accepted". §13's O-5 row folds "Full design, footprint, amendment draft and migration analysis in §12" under the accepted decision. §18: "the one genuine deploy-window exposure is disclosed as RR-10 rather than papered over." The §12.4 amendment draft asserts the same in its Rollout paragraph, which would carry the claim into ADR-010 itself.

**Why it does not hold.** The owner's O-5, as recorded in the accepted scope, is: *add the tibialis leaf and Tibialis Raise*. That is a vocabulary decision and an inclusion decision. The rollout exposure is something this document derived afterwards, in a section written after the decision was taken; it has never been put to the owner as a question. Acceptance of a scope item is not acceptance of a hazard subsequently discovered inside it.

The comparison to ADR-010 makes this sharper rather than softer. ADR-010's own **Rejected alternatives** section records: "**Single deploy** — disproved against the live build's editor paths; replaced by two ordinary releases rather than pipeline changes or flags." This release proposes a single deploy over the same editor path. The evaluation is right that the *magnitude* differs — ADR-010 faced write-back over reconciled data on 14 pre-existing exercises, this faces one brand-new row — and that argument is sound. But an argument that a previously-rejected shape is now acceptable is precisely a decision that belongs to the owner, not a residual to be absorbed by an earlier one.

**Required revision.** Strike "accepted" from §12.6, RR-10, §18 and the §12.4 amendment's Rollout paragraph. Raise the question as **D-CE1-1** (§7 below). Make the amendment's Rollout paragraph cite that decision rather than assert acceptance, so ADR-010 does not inherit an unowned claim.

---

## 3. MEDIUM findings

### M-1 — the bounded remedy is operational, not technical; the genuine blocker should be stated

The review brief asked for a bounded remedy compatible with one delivery, and for any genuine blocker to be explained. Here it is: **the vulnerable artefact is the bundle that is already on the phone.** Nothing shipped in this commit can protect this window, because the code that misbehaves is the code that predates the commit. That is a real constraint, not an excuse, and §12.6 should say it rather than leave "apply the update first" standing as though it were a design.

What *is* bounded and compatible with one delivery, one commit and an unchanged pipeline:

**(i) Gate the seed's visibility on the client update, as a numbered mandatory step — not a caveat.** After the deploy completes: open the app on the phone, tap "Update available — tap to refresh", and confirm the contribution picker offers "Tibialis (Shin)" *before* opening the Exercise Library or the Tibialis Raise entry. For a single-user app this is a complete control over the only stale client that exists. It belongs in §16.7 as a step, ahead of §16.8's acceptance list.

**(ii) A post-deployment read-only verification.** Confirm `bodyweight-tibialis-raise` holds exactly one contribution — `tibialis`, primary, weight 1.0 — and no `calves` row in either role. §16.4 already specifies this on the local database; the point is to repeat it in §16.7 *after* production acceptance, because that is the only thing that would detect the substitution if it happened. It converts an otherwise invisible failure into a detected one at negligible cost.

**(iii) Forward hardening in the same commit** — see M-2.

**Pipeline reordering is available but is not recommended.** Moving to `db:migrate → deploy → db:seed` would close the old-server half. It is genuinely safe *for this release specifically*: there is no migration (§6.4), and nothing in the new build requires the `tibialis` row to exist — `src/domain/volume/aggregate.ts:88` seeds the leaf from the domain constant, `VolumeScreen.tsx:38-39`'s `landmarksFor` returns `[]`, and `VolumeCard.tsx:18-22` tolerates an absent key. The only new exposure would be a loud, unmapped `23503` (`src/server/exercises/service.ts:427-431`) if the athlete created a tibialis-crediting exercise in the gap — nothing written, and strictly better than a silent wrong muscle. It is nonetheless a change to a shared pipeline for a one-off, and it closes only the short half while leaving the unbounded half to (i). Offered to the owner as option (b) in §7, not recommended.

**Two releases are disproportionate and are not recommended.** Splitting the vocabulary from the exercise would close the window fully, but it contradicts the accepted one-delivery scope and would cost a second deploy cycle to protect one brand-new row with no history. The evaluation's §16.2 argument that the vocabulary-before-catalog dependency is an intra-`runSeed` ordering is **correct and independently confirmed** (`src/db/seed/index.ts` — `seedMuscleGroups` is step 1, `seedExerciseCatalogForAllUsers` is step 4 of the same run); that argument is not what H-1 disputes.

### M-2 — `ContributionEditor` and `contributionMuscleLabel` degrade badly on an unknown slug; the fix is ~10 lines and belongs in this commit

`ContributionEditor.tsx:64-69` special-cases exactly one kind of value the option list cannot show — a rollup slug — and renders it as a *self-only* option so that "it stays visible/editable without ever being offered to a different row". That is the right mechanism. It is simply not general: any slug that is neither a known leaf nor a known rollup falls through to an option list that cannot represent it, and React then displays "Select muscle…".

`muscleGroupDisplay.ts:11-14` compounds it. The function declares `: string` but returns `MUSCLE_GROUP_DISPLAY_NAMES[muscleGroupId]`, which is `undefined` for any slug outside the compiled record. The compiler cannot catch it, because the parameter is typed `MuscleGroupSlug` while the runtime value arrives through a cast at `src/server/exercises/service.ts:151`.

Generalising costs about ten lines in one file plus a fallback in the helper: treat *any* non-empty unrecognised slug the way `back` is already treated, and fall back to the raw slug as its label. A stale client would then show `tibialis` in the picker instead of "Select muscle…" — visibly *set*, visibly unfamiliar, and unambiguous to leave alone.

This does **not** protect the current window, and the revision should say so. It retires the class for the next vocabulary addition, which ADR-010's add-only mutation rule makes a matter of when rather than if — and which O-5 itself now precedents. Shipping it alongside the amendment that creates the precedent is the proportionate response.

Scope consequence: this adds `src/ui/exercises/ContributionEditor.tsx` and `src/ui/exercises/muscleGroupDisplay.ts` to §16.3's file list, and the **Scope boundary**'s "no UI change beyond what existing components render from the domain constant" needs a one-line amendment naming it.

### M-3 — §7's eligibility tally contradicts §7's own table: 13 refused / 11 eligible, not "ten … fourteen"

§7's third note reads: "**`strengthEstimate` is omitted on all 24.** Ten are refused structurally; the other fourteen are genuinely eligible, which is intended and accepted under O-4."

Counting the table immediately above it, and cross-checking each row against `src/domain/strength/eligibility.ts:48-62` and `STRENGTH_ELIGIBLE_EQUIPMENT` (`src/domain/strength/constants.ts:137` — `barbell, dumbbell, cable, machine`):

- **Refused (13):** C-18 (profile `load_duration`), C-5 (basis `assistance`), C-7 and C-19 (`duration`), C-8, C-21, C-24 (equipment `bodyweight`), C-22 (`reps`), C-23 (`duration`), C-10 (equipment `other`), C-15 and C-16 (`load_distance`), C-17 (equipment `other`).
- **Eligible (11):** C-11, C-12, C-14, C-1, C-13, C-2, C-9, C-4, C-20, C-6, C-3.

The prose overstates the eligible set by three. This matters because that sentence carries O-4's accepted consequence — how many new entries will start producing e1RM series unprompted. §7 explicitly invites the reviewer to hold the batch to these three notes; two of the three check out exactly (§6.3), this one does not.

**Required revision:** correct to "Thirteen are refused structurally; the other eleven are genuinely eligible."

### M-4 — §12.3's "Documentation — four files" is not the complete set it claims to be

§12.3 states its sweep is "the complete set" and lists four documents. ADR-010's own **Consequences** section records what the vocabulary pass had to touch: "domain-model §2, data-model §2.3/§2.5/§2.17/§4/§5, volume-model §1–6, **implementation-plan (§1.4, Pre-Phase 6, Phase 6, §3)**, evidence-to-design #19 were amended in the same pass". So implementation-plan.md and evidence-to-design.md are maintained alongside the vocabulary, not frozen.

Statements that go stale and are not on the list:

- `docs/architecture/implementation-plan.md:166` — "domain constant → 17 leaves + `back` rollup (…); `muscle_groups` becomes 18 rows"; `:177` — "the editor offers 17 leaves"; `:179` — "unit — vocabulary constants (18 rows, exactly one rollup, membership, leaf set)"; `:185` — "built once against taxonomy v2 (17 leaves + `back` rollup — ADR-010)". Note `:95` already carries a "superseded by taxonomy v2's 17 leaves + `back` rollup in the Pre-Phase 6 pass" annotation — the precedent for how this file is kept current rather than left to drift.
- `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md:140` — "The volume screen shows 17 leaf rows plus the Back reconciliation line; **five leaves display without reference bands** (two already did)." §12.4's amendment supersedes the "17 leaf rows" clause but not the "five leaves" clause, which becomes six.
- `docs/architecture/evidence-to-design.md:45` (row 19) carries the "`adductors` added" record and the "leaf boundaries and the partition are coaching vocabulary, not corpus findings" framing that §2 of the evaluation leans on for `tibialis`.

**Required revision:** either extend §12.3's documentation list and widen §12.4's supersession clause, or state explicitly which of these are deliberately-frozen historical phase records and why. As written the "complete set" claim is inaccurate either way, and it is the kind of claim a later reader will trust.

---

## 4. LOW findings

**L-1 — §9/C-11's "`lower_back` promoted" is false.** `barbell-deadlift` (`src/db/seed/exerciseCatalog.ts:85`) already carries `lower_back` as **primary**: `hamstrings` P, `glutes` P, `lower_back` P, `upper_back` S, `traps` S, `forearms` S. C-11's list is that list with `hamstrings` removed and nothing else changed. The literal is fine; the rationale is not. Correct the sentence, and add C-11 to §15's "press hardest" list, since it now rests on a single dropped row exactly as C-14 does.

**L-2 — §8/C-17's "a disjoint muscle map apart from `abs`" is wrong.** `other-med-ball-slam` is `abs` P, `lats` P, `front_delts` S, `triceps` S; C-17 is `abs` P, `glutes` S, `front_delts` S. They share `abs` **and** `front_delts`. The criterion-2 case survives on the remaining rows and on the plane of motion; only the word "disjoint" needs to go.

**L-3 — §12.6's "empty or literal-`undefined` muscle label": only the empty branch is reachable.** `ExerciseLibrary.tsx:100-101` uses `Array.prototype.join`, which renders `undefined` as `""`. The literal string can never appear. (Detail of H-1; listed separately because it is a standalone correction.)

**L-4 — §16.4's "touches no existing exercise, contribution, landmark or ledger row" is loose about what "touches" means.** `seedMuscleGroups` (`src/db/seed/muscleGroups.ts:18-25`) re-upserts every existing row on each run, and `seedVolumePresets` (`src/db/seed/volumePresets.ts:158-179`) re-upserts all 52 landmark rows and sets `volume_presets.updated_at` on every deploy. The intended assertion is *value* equality, not statement counts — say so, or the implementation report will either over-claim idempotence or fail a check that was never the point. The same applies to "A second immediate `db:seed` inserts and updates nothing", which is already correctly scoped to the vocabulary and catalog and should stay scoped.

**L-5 — C-17 and C-22 apply R-10a's "alternates within the attempt" test in opposite directions.** C-22 is bilateral because "a bounding set alternates sides *within* the attempt"; C-17 is unilateral even though "an alternating execution is logged as one row per side". Both are defensible — the bound's alternation is intrinsic to the movement, whereas alternating throws are two interleaved rounds — but as written a later author could derive either rule from the pair. Add one sentence distinguishing them.

**L-6 — §11.6's `adductorSlugs` `toEqual` doubles a semantic assertion as a block-order guard.** The note "The array order follows from §6's manifest, making it an incidental guard on block order" is the same positional coupling §11.5 argues against when it replaces `slice(-10)`. Prefer an order-insensitive comparison plus the length here, and let the dedicated `CATALOG_EXPANSION_1_ENTRIES` contiguity assertion carry order. (Verified: the proposed array **is** in correct catalog order — `machine-hip-adduction`, `bodyweight-shuttle-run` at position 99, then 107, 121, 122 — so this is about brittleness, not correctness.)

**L-7 — the e2e edit in §12.3 is under-specified.** `tests/e2e/muscleTaxonomyV2.spec.ts:36` (the test title) and `:88-90` encode the cap three times: "the add-row cap is 17 not 18" and "the cap holds at exactly 17 leaves, not 16 (off-by-one) or 18 (the pre-fix full-vocabulary count)". All three numbers move (17→18, 16→17, 18→19); §12.3 names only the first pair. Also confirm `:66`'s `expect(optionTexts).not.toContain("Back")` is retained — it still passes with "Tibialis (Shin)" appended, and it is the guard that O-5 added a leaf rather than a rollup.

**L-8 — §12.3 omits four title/comment sites in `tests/unit/muscleGroups.test.ts`.** `:15` (header comment "vocabulary v2: 17 leaves + 1 rollup"), `:37` (title "has exactly 17 leaves and exactly 1 rollup, totaling 18 slugs"), `:52` (title "the other 14 pre-existing leaves keep their names") and `:69` (title "has display names for the 3 new leaves and the back rollup"). Mechanical, but §12.3 claims a complete footprint and this is the file it is most exact about elsewhere.

**L-9 — §12.1's append-last position is consistent with the code, and should say so.** ADR-010's Decision section states "Display sections (Back, Legs, Arms & Shoulders, Torso) are UI ordering only", which reads as a constraint the append-last choice ignores. It is not: nothing implements sections — `src/ui/volume/VolumeScreen.tsx:113` and `src/ui/metrics/VolumeCard.tsx:18` both iterate `LEAF_MUSCLE_GROUPS` in array order. One sentence in §12.1 noting that the ADR's sentence is unimplemented would close the gap. The choice itself (append last, `back` 18 → 19, all 17 existing leaves unmoved) is confirmed correct against `src/domain/exercises/muscleGroups.ts:89-97`.

**L-10 — "Hip Abduction Machine" and "Hip Adduction Machine" differ by one letter in a scrolling phone list.** Not a unique-index collision, and the owner already owns the adduction entry, so this is not a naming objection. Worth one line in §16.8 so device acceptance confirms the right one was picked.

---

## 5. Findings by review question

| Brief item | Outcome |
| --- | --- |
| 1. 24-entry manifest / literal agreement, uniqueness, definitions, dedup, conventions | **Passes**, with L-1 and L-2 as rationale corrections. §6.1. |
| 2. Contributions, laterality, whole-set/round semantics vs ADR-010 and O-12; rationale assessed independently | **Passes.** L-5 is the one internal tension. §6.2. |
| 3. Defaults and capability claims vs actual code; current behaviour vs over-broad inference | **Passes** — every default and capability claim checked against source. M-3 is the one arithmetic error. §6.3. |
| 4. Tibialis footprint; 18 leaves + one unchanged Back rollup; no invented landmarks; no migration | **Code and test footprint passes** (L-7, L-8 are omitted title/comment sites). **Documentation footprint fails** — M-4. **No migration confirmed independently, five ways** — §6.4. |
| 5. Existing-user preservation and repeat-seed guarantees, incl. Back-position and preset-description updates | **Passes** — §6.5. L-4 is a precision fix. |
| 6. Placement and historical fixture changes retain meaningful coverage | **Passes** — §6.6. L-6 is a brittleness recommendation. |
| 7. Validation and deployment instructions concrete and sufficient | **Insufficient** — M-1: the deployment section lacks the one control that addresses H-1, and lacks a post-deploy verification of the entry it is riskiest for. Validation (§16.4/§16.5) is otherwise concrete and sufficient. |
| §12.6 / RR-10 special attention | **Fails** — H-1 and H-2. |

---

## 6. What was verified as correct

Recorded because the document's accuracy elsewhere is high, and the implementation should not have to re-derive it.

### 6.1 Manifest, names, slugs, deduplication

- **The catalog is exactly 103 entries** at `HEAD`. Parsed independently: 56 compound / 47 isolation; 95 bilateral / 8 unilateral; equipment `machine 23, dumbbell 21, barbell 19, cable 18, bodyweight 16, other 6`; profiles `load_reps 92, load_distance 5, duration 2, distance_time 2, reps 2`. **Every figure in §4.1, §4.2 and §4.5 matches exactly.**
- **§4.3's muscle-leaf table matches exactly**, all seventeen rows: `glutes 20/9, quads 17/3, chest 12/2, hamstrings 9/18, abs 9/10, front_delts 8/14, upper_back 7/2, triceps 7/15, forearms 6/13, lats 6/0, biceps 5/13, side_delts 4/6, rear_delts 4/10, calves 4/6, lower_back 3/7, traps 2/9, adductors 1/1`. `lats` really does have zero secondaries; `adductors` really is used only by `machine-hip-adduction` and `bodyweight-shuttle-run`.
- **§11.7's local collision check reproduces exactly.** All 24 slugs are new; all 24 names are distinct from the 103 existing names case-insensitively and from each other; the 103 existing names are 103 distinct lower-cased strings. Zero collisions. Both named near-misses ("Assisted Dip" ⊃ "Dip", "Copenhagen Adduction Plank" ⊃ "Plank") are substring-only and cannot violate `uq_exercises_active_name`.
- **The historical-fixture scan reproduces.** "Ab Wheel Rollout" appears at `tests/integration/metricsSelection.integration.test.ts:108`, created via a local `makeExercise` helper; that file calls neither `runSeed` nor `seedExerciseCatalogForUser` (grep count: 0). Not a hazard, exactly as claimed. The hazard being guarded against is real in principle, and the reasoning is sound.
- **Post-release arithmetic checks out**: 15 compound / 9 isolation and 18 bilateral / 6 unilateral in the block; totals 71/56 and 113/14; equipment 22/28/19/25/23/10; profiles `load_reps 109, load_distance 7, duration 5, distance_time 2, reps 3, load_duration 1`. `adductors` ends 3/2, `tibialis` 1/0, and `lats` still has zero secondaries after C-4 and C-16 (both primary), consistent with C-8's declined secondary.
- **Deduplication is sound.** `other-med-ball-slam` (position 100) and `bodyweight-broad-jump` (position 101) are seeded with the definitions and shapes §8 quotes; neither is touched. Broad Jump's contributions really are `glutes` P, `quads` P, `hamstrings` S, `calves` S, so C-22's "one row replaced" derivation is exact. C-17's re-slug is genuinely free — `slugToUuid` (`src/db/seed/exercises.ts:23-29`) derives the id from the slug alone and nothing is seeded yet.
- **Naming precedents hold**: "Assisted Pull-Up" → "Assisted Dip"; "Dumbbell Farmer's Carry" → "Dumbbell Farmer's Hold"; "Hip Adduction Machine" → "Hip Abduction Machine". No parentheses in any of the 24 names (K-8).

### 6.2 Contributions and laterality

Every "identical to" and "mirroring" claim in §9 was checked against the seeded entry and is exact:

| Claim | Seeded reference | Verdict |
| --- | --- | --- |
| C-9 ≡ `dumbbell-row` / `machine-seated-row` | `upper_back` P, `biceps` S, `rear_delts` S | exact |
| C-13 ≡ `dumbbell-step-up` / `dumbbell-bulgarian-split-squat` | `quads` P, `glutes` P, `hamstrings` S | exact |
| C-2 ≡ `dumbbell-romanian-deadlift` | `hamstrings` P, `glutes` P, `lower_back` S | exact |
| C-18 mirrors `dumbbell-farmers-carry` | `forearms` P, `traps` S, `abs` S | exact |
| C-5 mirrors `bodyweight-dip` | `triceps` P, `chest` P, `front_delts` S | exact |
| C-8 matches `bodyweight-hanging-leg-raise` density | `abs` P, single row | exact |
| C-6 matches `cable-woodchopper` density | `abs` P, single row | exact |
| C-3 mirrors `machine-hip-adduction` density | single primary row | exact |
| C-23 vs `bodyweight-side-plank` | `abs` P, `lower_back` S, `glutes` S | quoted correctly |
| C-11 vs `barbell-deadlift` | see L-1 | list correct, rationale wrong |

- **The disclosed `cable-woodchopper` inconsistency is real and correctly disclosed**: it is seeded `bilateral` (`src/db/seed/exerciseCatalog.ts:722`) and is ledger-applied, so a catalog edit could not reach the seeded row. Declining to change it is right, and C-6 following the current rule is right.
- **All four existing sagittal single-leg entries are `unilateral`** (`dumbbell-bulgarian-split-squat`, `dumbbell-step-up`, `barbell-walking-lunge`, `bodyweight-walking-lunge`), so C-1/C-13/C-2's markings follow an established convention rather than inventing one. `bodyweight-side-plank` is `unilateral`, so C-23 follows it directly.
- **K-1, K-2 and K-3 hold for all 24**: leaf-only targets, at least one primary each, no repeated muscle within an entry, and no `weight` member anywhere — `SeedContribution` genuinely has none (`exerciseCatalog.ts:10-13`).
- **C-24's `calves` exclusion is the correct call and is correctly reasoned.** `bodyweight-calf-raise` is `calves` P; the vocabulary has no dorsiflexor. This is the strongest criterion-2 case in the batch, and the §2 framing (a labelling convention, not a physiological or injury claim) is applied consistently to it.
- **C-22's bilateral marking is right on its own terms.** `reps` records attempts, no per-side field exists, and marking it `unilateral` would invite a recording convention the movement cannot support.

### 6.3 Defaults and capability claims vs actual code

Every one of these was read from source rather than accepted:

- `DEFAULT_CONTRIBUTION_WEIGHT = { primary: 1, secondary: 0.5 }` (`schema.ts:86-89`) — K-3 ✓.
- `DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT` = barbell 2.5, dumbbell 2.0, machine 5.0, cable 2.5, bodyweight 2.5, other 2.5 (`schema.ts:91-98`) — K-4 and RR-5 ✓; `SeedCatalogExercise` genuinely has no `loadStepKg` member.
- `resolveLoadBasis` (`schema.ts:72-77`) returns `loadBasis ?? "unspecified"` when the profile carries a load field and `null` otherwise — K-5, M-1's silent-`unspecified` trap and RR-9 ✓, and §16.4's expected `NULL` for the four non-load-bearing bodyweight entries ✓. §16.4's "`'unspecified'` for the fifteen ordinary `load_reps` entries" is also exactly right.
- The seeder's `volumeCounting` default is `item.volumeCounting ?? (measurementProfile === "load_reps" ? "auto" : "off")` (`exercises.ts:107-108`) — every "the value equals what the seeder would resolve anyway" claim in §7 ✓.
- `evaluateExerciseEligibility` (`eligibility.ts:48-62`) applies profile → basis → equipment → switch in that order, so C-5's omission of `strengthEstimate: "off"` really is behaviourally identical to the legacy `machine-assisted-pull-up` — which does carry it, verified ✓. R-7 is correctly applied.
- `STRENGTH_ELIGIBLE_EQUIPMENT = ["barbell","dumbbell","cable","machine"]` (`constants.ts:137`) ✓.
- `EQUIPMENT_TYPES` has no kettlebell value (`schema.ts:21-28`) ✓ — O-1's premise, and §14's migration reasoning for it, both hold.
- **`load_duration` is fully wired, so RR-8's framing is right and C-18 is prescribable:** field matrix `weight` required / `duration` required / reps, rir, distance forbidden (`profile.ts:94-100`); `LOAD_BASIS_REQUIRED.load_duration = true` (`:119`); `SUPPORTED_SCHEMES.load_duration = ["durationRounds"]` (`compatibility.ts:20`); `durationRounds` is a real scheme (`setScheme.ts:7,42-56`) reaching progression (`loadProgression.ts:37`, `repProgression.ts:33`, `workingTargets.ts:38`). Nothing is missing; the risk is genuinely "first live exercise", not "unimplemented".
- The ledger filter is genuinely slug-agnostic — `EXERCISE_CATALOG.filter((item) => !applied.has(item.slug))` (`exercises.ts:92`) — and the insert is arbiter-less `onConflictDoNothing()` with `.returning()` gating contributions (`:135-155`), so §11.2 and §11.4 are exact, including the "collision is not retryable, the slug is still recorded" consequence.
- **Two of §7's three "hold the batch to" notes check out exactly**: `volumeCounting: "off"` is load-bearing on precisely C-17 and C-22 (the two volume-capable profiles, per `isProfileEligibleForVolume` — `capabilities.ts:30-32`), and `loadBasis` is stated on precisely the five entries whose profile has a load field. The third is M-3.

### 6.4 Tibialis footprint and the no-migration claim

- **The vocabulary sweep is complete for `src/` and `tests/`.** An independent grep for `LEAF_MUSCLE_GROUP_SLUGS`, `LEAF_MUSCLE_GROUPS`, `MUSCLE_GROUP_SLUGS`, `MUSCLE_GROUPS`, `MUSCLE_GROUP_DISPLAY_NAMES` and `ROLLUP_MEMBERS` returns exactly the consumers §12.3 enumerates and no others. The two source edits and five test files are right.
- **`MUSCLE_GROUP_DISPLAY_NAMES` is `Record<MuscleGroupSlug, string>`** (`muscleGroups.ts:57`), so the display-name entry really is typecheck-enforced.
- **Position arithmetic confirmed**: `MUSCLE_GROUPS` maps `[...LEAF, ...ROLLUP]` with `position: index + 1` (`muscleGroups.ts:89-97`). Appending `tibialis` gives it 18 and moves `back` to 19; all 17 existing leaves keep 1–17. `seedMuscleGroups` re-syncs it via `position: sql\`excluded.position\`` (`src/db/seed/muscleGroups.ts:18-25`).
- **No server module reads `muscle_groups` at runtime.** A grep across `src/server/**` and `src/app/api/**` returns only *type* imports (`src/server/exercises/service.ts:26`, `src/server/volume/service.ts:16`). §12.3's claim holds, as does the reason it matters.
- **`aggregateVolume` runs server-side** (`src/server/volume/service.ts:264`), not on the client — which is why a new leaf appears with zeroes, joins no rollup, and cannot break a client that has not been updated.
- **No RP landmark, no invented band**: `RP_ROWS` is an explicit 13-row table (`volumePresets.ts:52-79`) with no shin row, and `landmarksFor` returns `[]` for a group with none (`VolumeScreen.tsx:38-39`). The `RP_GENERAL_DESCRIPTION` consequence is real and correctly identified — the description is re-upserted on every seed (`volumePresets.ts:145-155`), so the fix propagates without a migration. §12.3's claim that `tests/unit/volumePresetsSeed.test.ts` needs no new label branch is correct: the mapping falls through to the slug and `"Tibialis (Shin)".toLowerCase()` contains `"tibialis"` (`volumePresetsSeed.test.ts:45-52`).
- **No migration is required — confirmed four ways independently, plus a fifth the document does not use.** (1) `drizzle/0001_modern_blonde_phantom.sql:1-5` creates `muscle_groups` with a bare `text` primary key. (2) `src/db/schema/muscleGroups.ts:25` builds the only CHECK from `MUSCLE_GROUP_KINDS`; `drizzle/0007_safe_triathlon.sql:2` is its DDL. (3) Both referencing FKs (`exerciseMuscleContributions.ts:22-26`, `volumeLandmarks.ts:24-26`) enumerate no values. (4) `muscle_groups` appears in exactly three migration files — `0001`, `0007`, `0008` — and a grep for `insert.*muscle_groups` across all fourteen `drizzle/*.sql` returns nothing. (5) **Additionally verified from the drizzle snapshot itself**: `drizzle/meta/0013_snapshot.json`'s `public.muscle_groups` has columns `id, display_name, position, kind` and exactly one check constraint, `ck_muscle_groups_kind`, whose value is `"muscle_groups"."kind" in ('muscle', 'rollup')`. There is nothing for `drizzle-kit generate` to diff, so **`pnpm db:generate` is a no-op by construction**, not merely by expectation — §16.4's mechanical check should still be run, but it is confirming a proof rather than testing a hypothesis. §12.5's contrast with equipment is also correct: `src/db/schema/exercises.ts` builds CHECKs from `EQUIPMENT_TYPES` and the other vocabularies via `checkInList`, which is exactly why a kettlebell value would need a migration and a muscle leaf does not.
- **The 18-leaf / one-unchanged-rollup shape is right.** `ROLLUP_MEMBERS.back` stays `["lats", "upper_back"]`; `ROLLUP_MUSCLE_GROUP_SLUGS` stays `["back"]`; `MUSCLE_GROUP_KINDS` is untouched, so `ck_muscle_groups_kind` is untouched. No landmark is invented for the new leaf. §12.7's boundary (no abductor, oblique, rotator-cuff leaf; no second rollup; no equipment value) is respected by every one of the 24 literals — C-3 credits `glutes`, C-6/C-17/C-23 credit `abs`, C-10 stays `other`.

### 6.5 Existing-user preservation and repeat seeding

- The ledger skip is keyed on slug alone and is agnostic to whether the row still exists, was edited or was hard-deleted (`exercises.ts:48-92`). The pre-ledger bootstrap branch (`:67-89`) can only fire for a user with an empty ledger and a surviving `is_seeded` row — unreachable for this account, as claimed.
- Every preservation witness §11.3 cites exists at the cited line and still proves what is claimed: `seed.integration.test.ts:214` (edits survive), `:232` (edited contribution weight not reverted), `:266` (removed contribution not resurrected), `:301` (hard-deleted seeded exercise not resurrected), `:324` and `:344` (the Release-3 athletic witness and the deterministic-id pin), `:362` (custom exercise reusing a hard-deleted seeded name), `:456` (a name-collision skip does not block other new slugs). §16.4's plan to copy `:324`/`:344` onto a new slug is the right pattern.
- Contribution rows are inserted only for slugs the insert actually returned (`exercises.ts:146-155`), so a name-collision skip cannot leave an exercise without contributions or contributions without an exercise.
- Both intended updates to existing rows are correctly identified and correctly mechanised: `back`'s position via the muscle-group upsert, and the RP General description via the preset upsert. Neither needs a migration; neither touches an exercise, a contribution or a landmark *value*.
- Catalog-length assertions are catalog-relative everywhere except `tests/unit/exerciseCatalog.test.ts:317`. Verified: `EXERCISE_CATALOG.length` is used at `reconcileContributions.integration.test.ts:165,196,221,558,564`, `reconcileMeasurementProfiles.integration.test.ts:409`, and `seed.integration.test.ts:154,210,315,337,358,402,404,435,446` — all self-adjusting. The single hardcoded `103` is the one §11.6 already schedules for change.

### 6.6 Placement and fixture coverage

- **The Release-3 block genuinely occupies positions 94–103**, starting at index 93, beginning with `other-sled-push` — which is also `RELEASE_3_ENTRIES[0]` in `tests/unit/exerciseCatalog.test.ts:24-25`. §11.5's proposed `expect(start).toBe(93)` is correct and is strictly stronger than `slice(-10)`, because it detects an insertion *before* the block that the old form would have missed. Combined with the length assertion and the proposed contiguous-block-at-103 test, the end of the catalog stays pinned too, so no coverage is lost.
- The existing catalog comment at `exerciseCatalog.ts:1049-1053` already states that the Release-3 block "must stay appended after the entire catalog above" for the `slice(0, 40)` reason; appending after it satisfies that constraint rather than working around it.
- **`ORIGINAL_40_SLUGS = EXERCISE_CATALOG.slice(0, 40)`** (`reconcileContributions.integration.test.ts:28`) is unaffected by appending and retains its meaning.
- **`NOT_PRE_V2_SLUGS`** (`:51`) already carries the comment "Excluded at both sites that build a 'full-92' pre-v2 slug set from one shared list here so a Release 4 addition cannot reintroduce the same drift" — the fixture was built anticipating exactly this, and §11.6's plan follows the instruction rather than reinterpreting it.
- **The Release-3 scoped assertions genuinely filter by `RELEASE_3_ATHLETIC_SLUGS` before asserting** (`exerciseCatalog.test.ts:395-447`), so they need no change — verified against the current source, as claimed.
- The exemption-set arithmetic is right: 13 → 22, leaving 105 entries proving the default shape where 90 did before; C-24 is correctly *not* exempted; keeping the exemption an explicit slug list rather than "skip anything that declares a field" is the right call.
- No e2e spec asserts a volume-screen leaf count (`tests/e2e/volume.spec.ts` checked), so its absence from §12.3 is correct rather than an oversight.

---

## 7. New owner decision

Separate from the five accepted decisions, and raised by this review rather than by the evaluation.

### D-CE1-1 — how to control the stale-client wrong-muscle write window for Tibialis Raise

**Why it is a decision and not a residual.** The evaluation records this exposure as accepted under O-5 (H-2). It is not: O-5 decided that the leaf and the exercise ship, and the hazard was derived afterwards. ADR-010 previously rejected a single deploy over this same editor path, so choosing a single deploy here is a decision in its own right — one this review agrees is the right call on magnitude, but that the owner should make explicitly rather than inherit.

**What is at stake.** For as long as the phone runs the pre-update bundle — unbounded, because `skipWaiting: false` makes activation a deliberate tap — Tibialis Raise's edit form shows "Select muscle…" in place of its muscle, and the nearest plausible option in the list is `Calves`. A save of that resolves cleanly against the post-deploy server and permanently credits the antagonist, which is the single outcome O-5 exists to prevent. Nothing reconciles it and nothing detects it.

| Option | What it does | Cost |
| --- | --- | --- |
| **(a) — recommended** | One delivery, one commit, unchanged pipeline, plus three controls: **(i)** a mandatory post-deploy step to apply the client update and confirm the picker offers "Tibialis (Shin)" *before* opening the Exercise Library; **(ii)** a post-deploy read-only verification that `bodyweight-tibialis-raise` still holds exactly one `tibialis` primary and no `calves` row; **(iii)** the `ContributionEditor` / `contributionMuscleLabel` hardening of M-2 in the same commit, as forward protection for the next amendment. | Two operational steps and ~10 lines of UI code. No pipeline change, no second release, no schedule impact. |
| **(b)** | (a) plus reordering the deploy workflow to `db:migrate → deploy → db:seed`. | Closes only the short old-server half; leaves the unbounded stale-client half to (a)(i) anyway. Changes a shared pipeline for a one-off. Safe *for this release* (no migration; nothing in the new build needs the row), but it buys little. |
| **(c)** | Two releases — vocabulary plus the M-2 hardening first, the exercise second. | Closes the window fully. Contradicts the accepted one-delivery scope and spends a deploy cycle protecting one brand-new row with no history. Disproportionate. |

**Recommendation: (a).** The magnitude argument the evaluation makes against ADR-010's two-stage rollout is correct — this is one new row, not fourteen reconciled ones — and (a) is the smallest set of controls that makes the residual both bounded and *detectable*, which "apply the update first" alone does not.

---

## 8. Required revisions before implementation

| # | Finding | Required change |
| --- | --- | --- |
| 1 | H-1 | Rewrite §12.6: separate the two windows; state that the stale-client half is unbounded by the `skipWaiting: false` policy, not by deploy duration; correct the render claim (blank, never literal `undefined`); correct the write claim (untouched saves preserve `tibialis`; the hazard is an apparently-empty picker inviting a `calves` substitution the post-deploy server accepts); add the offline/replay bound (no sync entity, no outbox path). |
| 2 | H-1 | Remove "read-only", "self-correcting" and "the length of one deploy" from RR-10, §12.6's conclusion, §18 and the §12.4 amendment's Rollout paragraph, or scope each explicitly to the read path. |
| 3 | H-2 | Strike "accepted" wherever RR-10 is so described; raise D-CE1-1; make the §12.4 amendment cite that decision rather than assert acceptance. |
| 4 | M-1 | Add the two operational controls to §16.7 as numbered steps, and state the genuine blocker: no code in this commit can protect a bundle that predates it. |
| 5 | M-2 | Add the `ContributionEditor` / `contributionMuscleLabel` hardening to §16.3's file list, and amend the Scope boundary's UI clause by one line. |
| 6 | M-3 | Correct §7 to "Thirteen are refused structurally; the other eleven are genuinely eligible." |
| 7 | M-4 | Extend §12.3's documentation list and §12.4's supersession clause, or state which files are deliberately-frozen historical records and why; drop the unqualified "complete set" claim. |
| 8 | L-1 | Remove "`lower_back` promoted" from §9/C-11; add C-11 to §15. |
| 9 | L-2 | Remove "disjoint" from §8/C-17. |
| 10 | L-3 | Drop the "literal-`undefined`" alternative from §12.6. |
| 11 | L-4 | Scope §16.4's "touches no … row" to value equality. |
| 12 | L-5 | Add one sentence distinguishing C-17's and C-22's application of R-10a. |
| 13 | L-6 | Make the `adductorSlugs` assertion order-insensitive; leave block order to the dedicated contiguity test. |
| 14 | L-7 | Name all three number sites in `muscleTaxonomyV2.spec.ts`, and confirm `:66`'s `not.toContain("Back")` is retained. |
| 15 | L-8 | Add the four title/comment sites in `tests/unit/muscleGroups.test.ts`. |
| 16 | L-9 | One sentence in §12.1 noting that ADR-010's display sections are unimplemented, so append-last is consistent with the code. |
| 17 | L-10 | Add the abduction/adduction selection check to §16.8. |

Items 1–7 must be resolved before implementation begins, and D-CE1-1 must be answered. Items 8–17 are corrections that can travel in the same revision pass.

Nothing in the 24-entry manifest, the §10 literals, the deduplication, the measurement shapes, the placement plan or the no-migration analysis requires change. The catalog work is sound; the rollout section is not.

---

REVISION REQUIRED
