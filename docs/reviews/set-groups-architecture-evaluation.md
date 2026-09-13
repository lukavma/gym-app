# Set Groups (ordered top-set / back-off groups): architecture evaluation

**Date:** 2026-09-11; **revision 2** 2026-09-12 (applies the independent review — see §18); **revision 3**
2026-09-12 (applies the residual corrections V-1…V-6 of the revision verification — see §18.2)
**Tree:** `583a9ab` (dirty — concurrent, untouched: `CLAUDE.md`, `HANDOFF.md` (deleted), `README.md`,
`docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/STATUS.md`, `docs/evidence/*`, `docs/research-notes/*`,
`playwright.config.ts`, `tests/e2e/seed.ts`, and the untracked `.claude/skills/`, `docs/process/`,
`docs/reviews/repository-agent-workflow-*.md`, `docs/reviews/exercise-catalog-expansion-closeout.md`,
`docs/reviews/warmup-routines-evidence-research.md`,
`docs/reviews/workout-prescription-context-device-acceptance.md`, `gpt-*.md`, `HANDOFF(depracted).md`,
the Tuchscherer PDF under `docs/research/`, and the three Set Groups reports themselves). The first
revision was written at `cb33264` with PI-018 in flight; PI-018 is now committed (`7fb7c0b`), deployed
and owner-accepted on the iPhone (§8, §10).
**Role:** evaluation (architecture design, no implementation); revision 2 is a bounded correction pass
**Session:** `F5-1 | PI-012 | Evaluation — Set Groups` (rev. 2: `F5-1 | PI-012 | Revision — Set Groups`)
**Model:** claude-fable-5-1
**Task/gate:** [PI-012](../BACKLOG.md#pi-012) Set Groups — owner-defined V1 scope; this document is the
architecture evaluation the entry says is pending. Percentage-linked back-offs are evaluated here at the
owner's request; nothing in this document selects, schedules or authorizes implementation.
**Authorization boundary:** none granted and none used — no implementation, no database access (local or
production), no installation, no staging, no commit, no push, no deployment. The supplied PDF is unchanged
and unstaged. The only file written by this task is this one; the parallel research sub-agent writes only
[set-groups-strength-evidence-research.md](set-groups-strength-evidence-research.md) (revision 2: a
bounded correction pass on that file for review findings L-6/L-7/L-8, nothing else).
**Files touched:** this file only
**Verdict:** n/a (evaluation) — closes with `READY FOR TARGETED SET GROUPS RESIDUAL VERIFICATION`
**Cites:** [set-groups-architecture-revision-verification.md](set-groups-architecture-revision-verification.md)
§5 V-1…V-6 (correction baseline for revision 3; the architecture itself is verified there and is not reopened);
[set-groups-architecture-review.md](set-groups-architecture-review.md) §2 H-1/H-2/M-1…M-4/L-1…L-8,
§3–§8, §9.1 (the reproductions), §10 (correction baseline for revision 2);
[agent-workflow.md](../process/agent-workflow.md) §2/§5/§6/§8/§10;
[prescription-model.md](../architecture/prescription-model.md) §1/§2/§4/§5/§7;
[progression-engine.md](../architecture/progression-engine.md) §2–§8;
[ADR-006](../architecture/adr/ADR-006-progression-engine.md), [ADR-007](../architecture/adr/ADR-007-historical-integrity.md),
[ADR-008](../architecture/adr/ADR-008-prescription-representation.md), [ADR-011](../architecture/adr/ADR-011-strength-estimation-and-load-translation.md);
[estimated-1rm-load-translation-architecture-revision.md](estimated-1rm-load-translation-architecture-revision.md) §7 (V-6…V-9, V-11, I-13);
[athletic-measurement-profiles-architecture-evaluation.md](athletic-measurement-profiles-architecture-evaluation.md) §9.2/§12.3/§13.5/§14.5;
[workout-prescription-context-architecture-evaluation.md](workout-prescription-context-architecture-evaluation.md) §2 R-B, §3, §7 C-1/C-6;
[workout-prescription-context-device-acceptance.md](workout-prescription-context-device-acceptance.md) (PI-018 accepted 2026-09-12);
[post-p10-roadmap-evaluation.md](post-p10-roadmap-evaluation.md) §Architectural constraints ("Progression scoped by exercise and block");
[set-groups-strength-evidence-research.md](set-groups-strength-evidence-research.md) (research companion, §14 below).

Sections marked **(rev. 2)** were rewritten or extended for the review; passages marked **(rev. 3)** carry
the residual corrections; everything else is unchanged from 2026-09-11. §18 maps every review finding
and every residual to its resolution.

---

## 0. Summary (rev. 2)

1. **The current model has no group concept at any layer.** Every scheme variant carries one fixed
   integer `sets`; a set row carries only `set_number` and `is_warmup`; progression, decisions, carry-forward
   and pending-recommendation uniqueness are keyed by `(exercise_id, block_id)`, not by slot and not by
   group (§2). The one structure that already handles a top set plus back-offs is the e1RM tracker, and it
   does so from load alone, independent of any prescription (§7).
2. **Two prescription slots of the same exercise is a supported *storage* shape but a broken
   *progression* shape today** (§5.2, reproduced by the review): duplicate slots share one pending
   recommendation, one decision, one carry-forward load, and their history rows interleave. This rules out
   "just author two slots" as the representation.
3. **Recommended representation (supported by the review):** one additive scheme variant `groups` inside
   one slot, each group with a stable key, a label, a set-count range, a rep range, an optional RIR band
   and optional load fields, and each group evaluated by an existing strategy through a *projection* to
   today's `fixed`/`repRange` shapes (§4, §5.4). The reserved `perSet` shape was compared explicitly and
   stays reserved (§4.1, M-4).
4. **Conflict surfaced, as instructed:** the athlete's *interaction* stays as it is, but attributing sets to
   groups cleanly requires a **stored per-set group key** — a nullable `set_logs` column, a nullable
   `recommendations` column, and two additive sync payload keys. Ordinal set-number partitioning cannot
   represent a skipped top set and re-classifies sets on deletion (§4.3).
5. **Revision 2 closes the review's two design defects.** A set-count range now has an explicit
   **evaluation window** — the first `sets.min` recorded sets, in set-number order, never the best
   ones — so the optional set of a `2–3` group can never hold or veto the group (§5.5, H-1). Every group
   selection change on the card **re-derives the input row** from that group's own chain, and auto-advance
   moves at `sets.max`, not `sets.min`, so a top-set load can never be carried silently into a back-off
   (§11.4, H-2). Four medium findings are closed: the e1RM reasoning is corrected (the back-off group is the
   modal anchor and the top set is admitted only within the plausibility band, §7); conversion continuity
   is specified and the multi-group case raised as a decision (§5.6); re-evaluation is scoped to
   still-pending group records (§5.3); `perSet` is compared and kept reserved (§4.1).
6. **Options and stages:** A (independent per-group progression with existing strategies) is the
   prerequisite for B (percentage-linked back-offs). A and B are **build stages**; whether they ship
   together or separately is the owner's packaging choice, and no usage waiting period is imposed; B
   follows A once D-5 (the fenced ADR-008 amendment) is decided (§9.2). The percentage is always
   user-entered with no shipped default.
7. **Honesty about size:** "smallest clean" is not small. Stage A is a schema/migration change **and** a
   sync-contract change, with the gated set-renumber concurrency suite required at release evidence (§10).
   PI-018 has landed, so the earlier file collision is resolved; the design is now read against `583a9ab`.

---

## 1. Scope, inputs and boundaries (rev. 2)

**Owner intent (verbatim in substance).** A generic builder for ordered groups within one exercise
prescription: e.g. *Top group: 1 heavy double @ RIR 2; Back-off group: 2×6–8 @ RIR 2–3, optionally at
80 % of the top-set load.* Each group can specify a set count or range, a rep target or range, a target
RIR band, and its load/progression behaviour. Compare **A** (ordered groups using existing
load/progression logic independently) against **B** (the smallest useful extension supporting
percentage-linked back-offs). RIR stays the canonical effort metric. No exercise-specific special cases,
no new mesocycle engine, no separate RPE system, no arbitrary dependency graph. Familiar set logging;
recorded training facts preserved. A `2–3`-set group must make performing the third set straightforward.

**Read.** [PI-012](../BACKLOG.md#pi-012) and [PI-013](../BACKLOG.md#pi-013); the prescription,
progression, snapshot, measurement and e1RM architecture documents; the implementation under
`src/domain/{schemes,prescriptions,schemas,progression,sync,strength,volume,measurement}`,
`src/server/{progression,today,sync,history,strength,prescriptions,templates}`,
`src/sync/{activeSession,outbox,flush,types}.ts`, `src/ui/{workout,prescriptions,history,syncIssues}`;
the unit/integration test inventories that pin the behaviours cited below; the PI-018 evaluation, its
committed implementation (`7fb7c0b`) and its device-acceptance receipt.

**Not done.** No database was opened, no migration drafted, no code changed, no test run by this task.
Every "verified" below means "read in the source at `583a9ab`", with the file and line cited; the
review's reproductions (its §9.1, a disposable vitest file, run and deleted) are cited as its evidence,
not re-run here. Line numbers are those of the working tree at the time of reading.

**Terminology.** *Slot* = one `exercise_prescriptions` row / one `session_exercises` row. *Group* = one
ordered entry inside a slot's scheme. *Attribution* = which group a logged set belongs to. *Projection* =
the mapping of one group to an existing single-group scheme (§5.4). *Recorded sets* = every attributed
non-warm-up set of a group. *Evaluation window* = the first `sets.min` recorded sets of a group, in
set-number order (§5.5).

---

## 2. Current-model findings, with source evidence (rev. 2: F-16 corrected; F-21…F-24 added)

| # | Finding | Evidence |
|---|---|---|
| F-1 | Every scheme variant carries a **fixed integer `sets`** (1–20); there is no set-count range anywhere. The union is a Zod `discriminatedUnion` on `type`; `perSet`/`fixedPlusAmrap` are reserved on paper only. | [`setScheme.ts:7,14,52`](../../src/domain/schemes/setScheme.ts#L52); [prescription-model.md §2](../architecture/prescription-model.md) "Reserved (post-MVP) variants — designed, not implemented" |
| F-2 | A set row is `{set_number, is_warmup, weight_kg, reps, rir, distance_m, duration_s, measurement_profile, logged_at, notes}`. **No other classifier exists.** `set_number` is user-visible ordering, renumbered to a contiguous `1..n` after a deletion; it is explicitly "not an identity". | [`setLogs.ts:46-47`](../../src/db/schema/setLogs.ts#L46); [`setNumbering.ts`](../../src/domain/sync/setNumbering.ts) header comment |
| F-3 | The engine's notion of "the prescribed sets" is ordinal: `completed = workSets.length ≥ scheme.sets AND shortfall over the FIRST scheme.sets work sets ≤ tolerance`; extra sets never add shortfall; the RIR gate reads the **last** work set. Rep progression: `every(reps ≥ currentTarget)` over **all** work sets. | [`loadProgression.ts:45-60,123`](../../src/domain/progression/loadProgression.ts#L53); [`repProgression.ts:95,110`](../../src/domain/progression/repProgression.ts#L110) |
| F-4 | Working load is the **modal** load over all work sets (ties → earliest). A top set plus back-offs at one slot would therefore evaluate against the back-off load, and the top set would be "mixed loads" (confidence capped medium). | [`loadHelpers.ts` `modalWorkingLoad`](../../src/domain/progression/loadHelpers.ts); progression-engine.md §8 |
| F-5 | **Pending-recommendation uniqueness, decisions, in-session decisions, supersession and bundle lookups are all keyed by `(exercise_id, coalesce(block_id))`** — never by slot, never by prescription id. | [`recommendations.ts:71-74`](../../src/db/schema/recommendations.ts#L71); [`progression/service.ts:237,280,417,444`](../../src/server/progression/service.ts#L444); [`today/service.ts:591,609`](../../src/server/today/service.ts#L591) |
| F-6 | Engine history is "same exercise, completed sessions strictly before this one, newest first, limit 5" — selected over `session_exercises` rows by `exercise_id`. Two slots of the same exercise in one past session yield **two history entries with the same `startedAt`**, in unspecified relative order, and both count against the cap. | [`progression/service.ts:176-202`](../../src/server/progression/service.ts#L176) |
| F-7 | Carry-forward takes the **first non-warm-up set** of the newest completed non-deload `session_exercises` row for the exercise; the bundle calls it **per prescription row with the same `exerciseId`**, so two slots of one exercise prefill the same load. | [`today/service.ts:267,330-331,580`](../../src/server/today/service.ts#L330); [`carryForward.ts`](../../src/domain/progression/carryForward.ts) |
| F-8 | Within one completion, results are persisted in a loop that calls `supersedePending(exercise, block)` **before each insert**; with two slots of one exercise the second slot's record supersedes the first's in the same transaction. Initial-evaluation dedupe is by `sourceSessionExerciseId`. | [`progression/service.ts:326-333,392`](../../src/server/progression/service.ts#L392) |
| F-9 | The implicit decision fires on the **first non-warm-up set of the slot**, comparing its load to `target.loadKg`; a target without `loadKg` never resolves implicitly. Each slot of the same exercise receives its own copy of the same pending recommendation at session start. | [`activeSession.ts:362,606`](../../src/sync/activeSession.ts#L606); [`implicitDecision.ts:33`](../../src/domain/progression/implicitDecision.ts#L33) |
| F-10 | The offline evaluator maps the cached bundle **by `exerciseId`** (`bundleEntries.set(entry.exerciseId, entry)`), so duplicate slots collapse to the last entry's history. | [`activeSession.ts:813`](../../src/sync/activeSession.ts#L813) |
| F-11 | The snapshot is `v: 1` with **one** `scheme`, **one** `targetRir`, **one** `prefill {loadKg, reps}`, **one** `progression {strategyId, strategyVersion, config, classification}`; `measurement` and `prescriptionNotes` are the two additive-optional precedents (no version bump, no upgrader). PI-018's `prescriptionNotes` key is now committed. | [`prescriptionSnapshot.ts:22,55,84`](../../src/domain/schemas/prescriptionSnapshot.ts#L22); [prescriptionSnapshot.test.ts "keeps v at 1"](../../tests/unit/prescriptionSnapshot.test.ts) |
| F-12 | Week modifiers act on the single `scheme.sets` (floor, min 1, max 20), the single band, and the single resolved prefill. `applySetMultiplier` reads `scheme.sets` directly, so a `groups` member without a top-level `sets` is a **compile error** — the desired failure mode. | [`applyWeekModifiers.ts:17,27,41`](../../src/domain/prescriptions/applyWeekModifiers.ts#L17) |
| F-13 | `inputsSummarySchema`, `recommendationTargetSchema` and the `derived`/`prescribed` blocks are **`.strict()`**; a new field on a recommendation's inputs or target is a schema change on the client-computed recommendation wire contract, not a free addition. | [`recommendation.ts:37-42,56-77`](../../src/domain/schemas/recommendation.ts#L56) |
| F-14 | Sync payloads for `setLog` and `recommendation` are **`.strict()`** with fixed field lists (`SET_LOG_FIELDS`); the sessionExercise payload is strict but parses `prescription` through the **non-strict** snapshot schema — an unknown key is stripped, but an **unknown scheme `type` fails the discriminated union** and rejects the op. | [`sync/schema.ts:93-100,115,147`](../../src/domain/sync/schema.ts#L115); [`sync/service.ts:200`](../../src/server/sync/service.ts#L200); PI-018 evaluation §2 R-B, §7 C-5 |
| F-15 | Scheme/profile compatibility is one table: `load_reps: ["fixed","repRange"]` etc.; the editor offers only compatible pairs and the engine returns `UNSUPPORTED_SCHEME` otherwise. | [`compatibility.ts:14-24`](../../src/domain/measurement/compatibility.ts#L14); [`formOptions.ts`](../../src/ui/prescriptions/formOptions.ts) |
| F-16 **(rev. 2)** | The e1RM tracker groups a session's eligible sets **by load**. The **modal group is the one with the most sets** (ties → heaviest load). Groups **lighter** than the modal one are excluded (`SUB_MODAL_SETS_EXCLUDED`, a load comparison). A **heavier** group is admitted only if its **e1RM** is at most `1.20 × e1RM(modal group)` — the plausibility ceiling is an e1RM ratio, not a load ratio — and is excluded as `IMPLAUSIBLE_SETS_EXCLUDED` otherwise. Among admitted groups the maximum e1RM governs (`TOP_SET_GOVERNS` when it is not the modal group); a one-set governing group flags `SINGLE_SET_GROUP`; more than one admitted group flags `MIXED_LOADS_IN_SESSION`. All three flags cap estimate confidence at medium. Two slots of one exercise in a session are merged into one observation, ordered by slot position then set number. | [`observation.ts:148,172-177,208-209`](../../src/domain/strength/observation.ts#L148); [`estimate.ts:38-45`](../../src/domain/strength/estimate.ts#L38); [`strength/service.ts:119-123`](../../src/server/strength/service.ts#L119); [strengthObservation.test.ts "admits a plausible top set and lets it govern"](../../tests/unit/strengthObservation.test.ts) |
| F-17 | Volume and the metrics dashboard count every non-warm-up set once per contribution / per session; neither reads the scheme. | [`volume/aggregate.ts`](../../src/domain/volume/aggregate.ts) `aggregateVolume`; [`metrics/training.ts:42`](../../src/domain/metrics/training.ts#L42) |
| F-18 | History renders `formatScheme(snapshot.scheme)`, the applied modifiers, and set rows with a `W ·` prefix for warm-ups. The card renders one prescription subtitle (now with PI-018's rest clause and program note), one recommendation card, one input row with a warm-up checkbox, and copy-forward prefill from the last logged set. | [`HistoryDetail.tsx:162,438`](../../src/ui/history/HistoryDetail.tsx#L162); [`ExerciseCard.tsx:87-89,333,405,421,446`](../../src/ui/workout/ExerciseCard.tsx#L87) |
| F-19 | ADR-008's anti-DSL line: schemes are "data, not language: no expressions, no conditionals, **no references between fields**"; percentage loading is declared "a load prescription mode, orthogonal to set/rep structure"; cross-exercise references are out of scope entirely. The reserved `perSet` shape nonetheless carries a `loadOffset: {type:'percentOfTop'}` **inside** the scheme. | [prescription-model.md:15,75-81,89,206](../architecture/prescription-model.md) |
| F-20 | The roadmap evaluation already recorded "Progression scoped by exercise and block — heavy/light slots using the same exercise can share carry-forward; conditional on program; design separate tracks only for a concrete affected program." | [post-p10-roadmap-evaluation.md](post-p10-roadmap-evaluation.md) §Architectural constraints |
| F-21 **(new)** | Re-evaluation on edit gates on **any** pending record sourced from the slot, then evaluates the **whole slot** in `reevaluate` mode, which deliberately does not dedupe. With one record per slot the "only while pending" invariant is exact; with several records per slot it is not (M-3). | [`progression/service.ts:299-333,530-537`](../../src/server/progression/service.ts#L530) |
| F-22 **(new)** | After a set is logged the card **clears only RIR**; weight and reps stay exactly as typed ("which IS the carry-forward"). The warm-up toggle's initial value is the last logged set's `isWarmup`. `handleDecide` prefills the inputs only while no set is logged. | [`ExerciseCard.tsx:281-287,303-313,572-574`](../../src/ui/workout/ExerciseCard.tsx#L281) |
| F-23 **(new)** | `defaultConfigFor` is `scheme.type === "repRange" ? { repCap: scheme.maxReps } : {}` — not an exhaustive switch; and the compatibility rule "repCap required for rep-progression" fires only when `scheme.type === "fixed"`. Neither would fire for a new scheme type on its own (L-3). | [`registry.ts:107`](../../src/domain/progression/registry.ts#L107); [`prescriptions/schema.ts:100`](../../src/domain/prescriptions/schema.ts#L100) |
| F-24 **(new)** | A rejected op is **kept locally**: `markDeadLetter` flips its status and stores the reason, the payload is never rewritten, the Sync issues screen lists it, and `retryDeadLetterOp` re-queues it at its original FIFO position without altering the payload; `discardDeadLetter` is the only deletion and is manual. Completion with refused sets asks the athlete to confirm the drop and names the Sync issues screen. The completed session's local aggregate is deleted at completion, so the outbox is the only local copy of its sets. No template copy operation exists (`templates/service.ts` exports list/get/create/update/archive/reorder only). | [`outbox.ts:52-118`](../../src/sync/outbox.ts#L77); [`flush.ts:112-121`](../../src/sync/flush.ts#L113); [`WorkoutExecution.tsx:64-69`](../../src/ui/workout/WorkoutExecution.tsx#L64); [`activeSession.ts:895-911`](../../src/sync/activeSession.ts#L895); [`templates/service.ts:97-233`](../../src/server/templates/service.ts#L97) |

---

## 3. Vocabulary boundary: what a "group" is and is not

- A **group** is an ordered run of ordinary, separately logged sets that share a prescription
  (count or range, rep target or range, RIR band, load behaviour). *"Cluster heavy double"* in the owner's
  wording is read as **a named top group of one set of two repetitions** — nothing more.
- A **true intra-set cluster** (e.g. 2 × 1 with 15–20 s intra-set rest, reported as one set), **rest-pause**
  and **myo-reps** are *not* representable and are *not* introduced implicitly by this design. A set row is
  one continuous set with one RIR; the app has no intra-set rest field, and the RIR literature the
  registry holds does not cover an RIR reported over a clustered set. If the athlete performs a cluster,
  they either log one set of 2 (RIR then describes the cluster as a whole — a convention, not a measured
  quantity) or two sets of 1 (which the engine reads as two sets). prescription-model.md §2 already
  states that clusters "each get one more variant with its own small shape when a concrete need
  exists"; this evaluation does not create that need and does not pre-empt that shape.
- **Groups are not drop sets.** A drop set is a within-set load reduction; a back-off group is separate
  sets at a separately prescribed load.
- **Groups are not "tracks".** F-20's heavy/light *slots* problem is adjacent but distinct: groups live
  inside one slot, and the recommended design leaves the duplicate-slot behaviour exactly as it is (still
  latent, still out of scope). §4.5 states how group keys change that scope for grouped slots.

---

## 4. Representation and stable group identity (investigation 1)

### 4.1 Three candidate representations (rev. 2: `perSet` added — M-4)

| | R1 — one slot per group (two prescription rows for the same exercise) | R2 — one slot, additive `groups` scheme variant (recommended) | R3 — the reserved `perSet` variant (prescription-model.md §2) |
|---|---|---|---|
| Schema / scheme change | None | New union member | New union member (already designed on paper, "also covers top set + backoffs") |
| Set-count **range** | Per slot only — a second slot is all-or-nothing | Native (`sets: {min, max}`) | **Not representable** — every set is enumerated |
| Attribution / per-set identity | Free: the set belongs to the card it was logged in; but `session_exercises` carries no `prescription_id` and `position` is not stable | Stable generated key, stored per set (§4.3) | **Positional index** into `sets[]` — the ordinal failure table of §4.3 applies again (skipped/deleted sets re-index) unless a stored key is added anyway |
| Progression identity | **Broken today**: F-5…F-10 key by exercise/block, so both slots share one pending record, one decision, one carry-forward load, and interleaved history (reproduced by the review §4.1) | Per `(exercise, block, key)` inside one slot (§5.3) | Would need the same stored key; per-set targets would multiply records |
| Anti-DSL line | Cross-slot references forbidden (F-19) | Untouched in A; one fenced one-hop exception in B (§6.5) | `loadOffset: {percentOfTop}` is **already reserved inside the scheme** — repository precedent for B's placement of `load` on the group entry |
| Ordering | Slot order | Explicit array order, frozen in the snapshot | Explicit array order |
| Card | Two cards for one exercise | One card | One card |
| Cost | Larger than R2 (needs a slot identity sessions do not carry) | One variant + two nullable columns + two payload keys | Same as R2 plus a shape that cannot express the owner's V1 |

R1 is rejected: it converts F-20's latent constraint into a live defect the day the owner authors the
Trap Bar example, and the fix for that is larger than R2. R3 is rejected **for this purpose** on two
decisive grounds: it cannot express a set-count range, and its identity is positional. `groups` and
`perSet` are complements, not rivals — `groups` covers runs of like sets with a range; `perSet` covers
genuinely per-set variation — so **`perSet` stays reserved, unimplemented and unsuperseded** (§16 item 1
is worded accordingly). R3's `loadOffset` matters for B: it shows the repository already anticipated a
percentage-of-top load offset living inside a scheme, which makes the ADR-008 amendment in §6.5 a smaller
step than "policy cost" suggests — smaller, not absent, because `percentOfGroup` is a *reference to a key*
where `percentOfTop` is a positional convention.

### 4.2 The `groups` scheme variant (shape)

```ts
interface SetGroup {
  key: string;            // stable identity — generated once at authoring (short token), never derived
                          // from position or label, preserved across edits/reorders; unique within the scheme
  label: string;          // display only, 1–24 chars trimmed ("Top", "Back-off", "Work")
  sets: { min: number; max: number };   // ints, 1 ≤ min ≤ max ≤ 20   (fixed count ⇔ min === max)
  reps: { min: number; max: number };   // ints, 1 ≤ min ≤ max ≤ 100, max − min ≤ 30 (existing span cap)
  targetRir?: RirBand;    // overrides the slot band for this group; absent ⇒ slot band applies
  baselineLoadKg?: number;// overrides the slot baseline for this group (Option A); Option B folds this
                          // into `load` (§6.5) — the group entry is designed so that adding `load` is additive
}
interface GroupsScheme { type: "groups"; groups: SetGroup[]; }   // 1–4 groups; Σ sets.max ≤ SETS_MAX (20)
```

Invariants (Zod `superRefine`, same idiom as `repRange`): unique keys; ordered array is the order; total
`max` sets ≤ 20 so a snapshot stays PrescriptionSnapshot-valid under any `setMultiplier`; labels
non-empty after trim. `SCHEME_ENVELOPE_VERSION` stays 1 (additive variant, ADR-008).

A single-group `groups` scheme is allowed: it is how "2–3 × 5" (a set-count *range* on an ordinary
slot) becomes representable without a fifth ranged variant. `fixed`/`repRange` remain and are never
migrated; the engine treats them as one implicit group with key `null` (§5.3, §5.6).

Slot-level fields keep their meaning as **defaults**: `targetRir`, `baselineLoadKg` and `progression`
apply to every group that does not override them; `restSeconds` and `notes` stay slot-level (PI-018's
subtitle and "Program note" are unchanged).

Why the key is generated and not the label: the label is the athlete's word and may be edited; progression
identity (§5.3) must survive a rename and a reorder, so it hangs on the key. Why not the index: reordering
"Top" behind "Back-off" must not swap their histories.

**`sets.max` has no evaluation meaning** (rev. 2). It is an editor bound, the chip's displayed count, and
the auto-advance trigger (§11.4). Nothing in either strategy reads a maximum: a fourth set on a `2–3`
group is accepted, stamped, and recorded as an extra set (§5.5). A reader must not assume a range refuses
a set beyond `max`.

### 4.3 Attribution — ordinal partition versus a stored per-set key (rev. 2: one row added)

The owner asked not to assume flat set-number partitioning is sufficient. It is not. The table below is
the actual behaviour of an ordinal rule ("non-warm-up sets in `set_number` order fill the groups in order,
each up to its `max`") against the events that happen in real training.

| Event | Ordinal partition (no storage change) | Stored per-set `groupKey` (recommended) |
|---|---|---|
| Straight execution, fixed counts | Correct | Correct |
| Set-count **range on a non-final group** ("Top 1–2, then back-offs") | **Ambiguous**: the second set is either the optional top set or the first back-off; no signal distinguishes them. Would force the rule "ranges only on the last group". | Unambiguous; ranges allowed on any group |
| **Skipped top set** (bad day, athlete goes straight to back-offs — exactly what an RIR-autoregulated lifter does) | **Mis-attributed**: the first back-off becomes "the top set"; the top group evaluates as completed at the back-off load and proposes e.g. 112.5 kg for a group whose working load was 140; the back-off group is one set short and holds. Two wrong outputs from one common event. Not representable at all without a stored "no top today". | The chip is on "Back-off"; the top group has no sets → `NO_WORK_SETS_LOGGED` for that group; the back-off group evaluates on its own sets |
| Extra set beyond a group's `max` | Falls into the next group (category error) | Stays in the chosen group as an extra set (§5.5) |
| **Delete** a set mid-list (contiguous renumbering) | Every later set shifts one group boundary earlier: a deleted mistaken top set turns the first back-off into a top set. Today the same deletion only changes *which set is first*, not *what kind of set it is*. | Renumbering never touches the key; attribution is stable |
| Warm-ups interleaved (e.g. a warm-up before the back-offs) | Excluded by `is_warmup`, harmless | Excluded by `is_warmup`, `groupKey` null |
| **A set the athlete forgot to flag as a warm-up** (rev. 2, review §3) | Shifts every later group boundary — a second silent failure of the same kind | Mis-classified only as a work set of the selected group; correctable in place; no other set moves |
| Reorder groups in the template after sessions exist | Historical attribution is frozen by each session's own snapshot order; future sessions use the new order | Same; keys unchanged so per-group history follows the group, not the position |
| Edit a logged set's load/reps | No attribution change | No attribution change; changing the *group* of a set is an evaluation-relevant edit (§5.3) |
| Cross-device adopt / offline replay | Deterministic (pure function of `set_number`) | Deterministic (the key is a stored fact) |

Two facts decide it. First, the skipped-top-set row: an ordinal rule cannot express "no top set today",
and the consequence is a wrong recommendation for the group the athlete most cares about. Second, the
repository's own precedent: the e1RM revision demoted load-based inference of warm-ups to "defence in
depth" and made the stored `is_warmup` flag the primary classifier, after finding that inference "remains
wrong on unflagged single-top-set days" (revision §3). A group is the same kind of fact as a warm-up —
the athlete's own classification of a set — and deserves the same primitive.

**Consequence stated plainly (the conflict the owner asked to be surfaced):**

- **Unchanged logging UX — achievable.** One input row, one Log tap, the warm-up checkbox, copy-forward
  prefill, the set list. The only addition is a small group selector on the input row for grouped slots,
  pre-selected by an auto-advance rule (§11.4), analogous to the warm-up checkbox. The one place the
  first revision claimed more continuity than the code delivers — the input row keeping the previous
  group's load across a selection change — is corrected in §11.4 (H-2).
- **Unchanged storage / wire contract — not achievable cleanly.** A nullable `set_logs.group_key` column,
  a nullable `recommendations.group_key` column (per-group progression, §5.3), one additive optional key
  on the `setLog` payload and one on the `recommendation` payload. That is a schema/migration change and a
  sync-contract change under the [change-class matrix](../process/agent-workflow.md#5-evidence-levels-and-the-change-class-matrix).
- The ordinal-only design remains available as a consciously degraded choice (D-1, §13), with the failure
  table above as its acceptance criteria. It is not recommended.

### 4.4 Attribution rules (recommended design)

1. A work set on a grouped slot carries `groupKey ∈ keys(snapshot.scheme.groups)`; the card always
   supplies one. Warm-up sets carry `null` (they belong to no group).
2. `groupKey` on an ungrouped slot must be `null`/absent; on a grouped slot it must be one of the frozen
   snapshot's keys — validated by the sync service against the **parent slot's frozen snapshot** (the
   analogue of `dimensionsOf(parentProfile)` for measured fields), rejected as `invalid_payload`.
3. A work set with `null` key on a grouped slot ("unattributed" — reachable only from an old client or a
   History correction that cleared it) belongs to **no** group: it is excluded from every group's
   evaluation and carry-forward, never pooled, and still counts for volume and e1RM. History shows it
   without a label. (The bridge rule of §5.6 applies to sets of *ungrouped* sessions, not to null-key
   sets inside a grouped session.)
4. Deletion renumbers as today and never touches keys. A set's group is editable in the set row's edit
   form and in History; the change is evaluation-relevant.
5. Group order, labels and keys are frozen in the snapshot at start (ADR-007). A template edit never
   changes a running or historical session.

### 4.5 Key scope: editing, copying, removing groups, historical sessions (rev. 2 — L-2)

| Situation | Rule | Consequence to be aware of |
|---|---|---|
| The same exercise appears in **two templates of one block**, both grouped | Each prescription row generates its own keys, so the two slots' groups progress on **independent tracks** — `(exercise, block, key)` differs even for groups the athlete names identically. | This is a behaviour change relative to ungrouped slots, which keep **sharing** one track per exercise/block (F-5…F-7, F-20). Grouped and ungrouped slots therefore behave differently for the same authoring act. Stated as a rule, not hidden in a key generator; it is what F-20 says a concrete affected program would want, and it is the only behaviour a stored key can have. |
| The same exercise in two templates, one grouped and one not | The ungrouped slot uses the null-key track; the grouped slot uses its keys (with §5.6's first-group bridge reading null-key history). | The two slots can read the same historical null-key facts once each; new facts diverge from the first grouped session on. |
| **Template copy / duplicate** | No such operation exists today (F-24). Forward constraint, recorded now: **any future copy must regenerate group keys**, or copied slots collide in the `(exercise, block, key)` space exactly as duplicate slots collide today. | Add to the template service's design notes when copy is ever built. |
| **Removing a group** from the template | Keys of the remaining groups are unchanged. The removed key's pending record, if any, stays in the database (R-7) but is **filtered out at bundle assembly**: `buildTodayBundle` includes in `pendingRecommendations` only records whose key is present in the entry's current scheme (or the null key, mapped per §5.6); the client additionally ignores any unknown key defensively. | Never surfaced, never decided, never superseded; harmless because every pending-record query is exercise/block-scoped (nothing lists them user-wide). |
| **Adding a group** later | New key, no history, its own baseline; `INSUFFICIENT_HISTORY` semantics until it has sessions. | Expected. |
| **Renaming / reordering** | Keys unchanged; history and pending records follow the key. | Expected. |
| **Historical sessions** | Each session's snapshot freezes its own group list; History renders labels from that snapshot, so a later rename/removal never changes what a past session shows. | ADR-007. |

---

## 5. Existing progression integration (investigation 2)

### 5.1 Trace of the current pipeline

```text
completion op ─► evaluateCompletedSession ─► assembleAndEvaluate(mode 'initial')
   candidates: non-skipped, snapshot present, strategy ≠ manual
   dedupe: sourceSessionExerciseId already has a record → skip          (F-8)
   history: getEngineHistory(exerciseId, before startedAt, limit 5)    (F-6)
   workSets: non-warm-up sets of the slot, by set_number
   in-session decision: getInSessionDecisionChosen keyed by exerciseId  (F-5)
   ─► evaluateSession (pure) ─► per slot: profile gate → supportsScheme → strategy.evaluate
   ─► for each result: supersedePending(exercise, block) → INSERT       (F-8)
set edit/delete on a completed session ─► reevaluateForSourceSessionExercise
   gate: ANY pending record sourced from the slot → assembleAndEvaluate(mode 'reevaluate', whole slot, no dedupe)  (F-21)
next Today bundle ─► getLatestDecisionChosenByExercise(block)          (F-5)
                 ─► getExerciseHistory(exerciseId) → first work set of newest non-deload session (F-7)
                 ─► resolveWorkingTargets → prefill {loadKg, reps}
                 ─► getPendingRecommendationsByExercise(block)          (F-5)
session start   ─► entry.pendingRecommendation copied onto the slot; first work set → implicit decision (F-9)
```

### 5.2 Do exercise/block keys currently mix duplicate slots? Yes — with bounds (rev. 2: L-1)

Verified against the tree, and reproduced by the review (its §4.1, against the real `startSession` /
`logSet` mutators on a fake IndexedDB): every lookup in the trace above is `Map<exerciseId, …>` or a
`WHERE exercise_id = … AND coalesce(block_id) = …`. With two slots of one exercise in a template:

- the bundle gives both slots the same `pendingRecommendation` and the same carry-forward load
  ([`today/service.ts:580-609`](../../src/server/today/service.ts#L580));
- the first work set on *either* card implicitly decides the shared record; the other card's copy still
  reads `pending` and enqueues a second decision on the same record, which dead-letters as
  `decision_conflict` **even at the same load**, because "identical replay" requires an equal `decidedAt`
  ([`sync/service.ts:1339-1347`](../../src/server/sync/service.ts#L1339));
- at completion, both slots are evaluated and the second insert supersedes the first
  ([`progression/service.ts:392`](../../src/server/progression/service.ts#L392));
- the failure-streak scan walks history entries newest-first and **breaks** on the first entry whose modal
  load differs ([`loadProgression.ts:74`](../../src/domain/progression/loadProgression.ts#L74)); an
  interleaved back-off entry therefore terminates a top-set streak.

**Bounds of the decision conflict.** It requires **all** of: (a) two slots of one exercise in one
session; (b) a pending recommendation that carries `target.loadKg` at session start (an `action: 'none'`
record never resolves implicitly, F-9); (c) a first **non-warm-up** set logged on **both** slots; (d) two
`decidedAt` stamps that differ — which they always do, since each is its own set's `loggedAt`. It does not
occur on a deload session (gated at [`activeSession.ts:597`](../../src/sync/activeSession.ts#L597)) or when
only one slot receives a work set. **Effect:** one dead-lettered `recommendationDecision` op on the Sync
issues screen (F-24), **not** head-of-line blocking — the sets themselves sync normally and the first
decision stands. Bounded, it still disposes of R1: the athlete would meet this on the first grouped
workout of the owner's own example.

This confirms F-20's constraint is real. The recommended design does not fix duplicate-slot progression;
it avoids depending on it (§4.5 states what changes for grouped slots).

### 5.3 What independent per-group progression actually requires (rev. 2: M-2, M-3, L-3 rows)

| Concern | Today | Required for per-group |
|---|---|---|
| Recommendation identity | one pending per `(exercise, block)` | one pending per `(exercise, block, groupKey)`: nullable `recommendations.group_key`; `uq_recs_one_pending` rebuilt over `(exercise_id, coalesce(block_id, zero-uuid), coalesce(group_key, ''))`; `supersedePending` gains the key |
| Dedupe on initial evaluation | by `sourceSessionExerciseId` | by `(sourceSessionExerciseId, groupKey)` |
| **Re-evaluation on edit (M-3)** | gate on any pending record from the slot; re-evaluate the whole slot (F-21) | `reevaluate` mode evaluates **only the groups whose record sourced from this slot is still `pending`**. A group whose record is `accepted`/`modified`/`rejected` (decided this session, implicitly or explicitly) or `superseded` (a later session already evaluated it) is **never** re-evaluated from an older slot: doing so would insert a fresh pending record beside the decided one (the partial index constrains pending rows only) and surface a decision card for a group the athlete already decided. Acceptance A-13b; negative control NC-6. |
| Decisions | latest accepted/modified per exercise | per `(exercise, groupKey)`; the decision payload is unchanged (keyed by `recommendationId`) |
| In-session decision overlay (L-3) | `applyInSessionDecisionToPrefill` overlays the chosen reps onto the slot's single `prefill.reps` ([`progression/service.ts:373`](../../src/server/progression/service.ts#L373)) | per group: the chosen reps of the in-session decision for `(exercise, key)` overlay `groupPrefills[key].reps` before that group's projected context is built; the slot-level `prefill` is untouched. `evaluationTarget.ts` gains a per-key variant (manifest item 9). |
| History for the engine | slot rows by exercise | slot rows by exercise, each **split by key** into per-group `PerformedExercise` entries carrying the *projected* scheme and the *windowed* work sets (§5.4, §5.5); ungrouped past sessions map per §5.6 |
| Carry-forward | first work set of the slot | first work set **with that key** in the newest completed non-deload session; then the group's own `baselineLoadKg`; then the slot baseline; then empty. Ungrouped history is read by the **first group** per §5.6 (single-group schemes always; multi-group schemes under D-6's recommended default). |
| Prefill | one `prefill` | `groupPrefills: Record<key, Prefill>` (additive optional snapshot key); `prefill` keeps the **first group's** values so every existing reader stays correct |
| Implicit decision | first work set of the slot | first work set **with that key** |
| Client (offline) evaluation | per slot | per group, same projection and window; recommendation op carries `groupKey`. **Degradation stated (L-3):** a bundle cached before the release has no `groupKey` on its history sets, so every group's history is empty for an offline completion until the next successful bundle fetch — self-healing, and the same "cached bundle lacks a new field" class every additive bundle key has had. |
| Card | one `RecommendationCard` | one per group with a pending/decided record, labelled |
| Strategy per group | slot `progression` | slot `progression` as default; optional per-group override `progression.groups?: Record<key, {strategyId, config}>` on the prescription row; snapshot mirrors it as `progression.groups?: Record<key, {strategyId, strategyVersion, config, classification}>` (additive optional) |
| **Per-group config resolution (L-3)** | one `progression.config` per slot, defaults derived from the slot scheme, `classification` by comparison with `defaultConfigFor` | For every group: `resolveProgression(strategyId, rawSlotConfig ⊕ rawGroupOverride, projectGroup(g), exercise)` — defaults are **re-derived per group from the projected scheme** (so a ranged group's `repCap` defaults to its own `reps.max`), and `classification` is computed **per group**. Rule: on a `groups` scheme, `repCap` is **forbidden at slot level** and allowed only in `progression.groups[key].config` — a slot-level cap cannot be right for two groups with different `reps.max`; `checkPrescriptionCompatibility` rejects it with an issue naming the rule. A fixed-rep group under `rep-progression` **requires** its own per-group `repCap` (the existing `fixed` rule, applied to the projected group — F-23 shows neither existing check would fire on its own). `defaultConfigFor` becomes an exhaustive `switch` over scheme types. |

A cheaper variant ("A-lite": only the first group progresses, other groups carry forward manually) was
considered. It removes the `recommendations` column and index change and the per-group cards, but it does
not deliver the owner's stated V1 ("existing load/progression behaviour independently per group"), and
the difference is one column, one index and one loop — not a different architecture. The review endorses
per group; it stays D-2 in §13 only for confirmation.

### 5.4 The projection: existing strategies run unchanged (rev. 2: window and safety property added)

Each group projects to a scheme the existing strategies already understand:

```ts
function projectGroup(g: SetGroup): SetScheme {
  return g.reps.min === g.reps.max
    ? { type: "fixed",    sets: g.sets.min, reps: g.reps.min }
    : { type: "repRange", sets: g.sets.min, minReps: g.reps.min, maxReps: g.reps.max };
}
```

`evaluateSession` gains a per-group loop that builds one `EvaluationContext` per group: projected scheme,
the group's effective band, the group's prefill, the group's **evaluation window** as `performance.workSets`
(§5.5), and the group's per-key history — each history entry likewise projected and windowed.
`evaluateLoadProgression` and `evaluateRepProgression` are **not modified**, so `STRATEGY_VERSIONS` stays
`{1, 1, 1}`: running an unchanged function on a projected, windowed context is not a behaviour change
*to the function*. The review's caution is accepted and restated here: it **is** a change to what the
athlete experiences, which is exactly why §5.5 specifies the effective semantics explicitly and pins them
in the acceptance matrix rather than resting on "strategies unchanged".

**Safety property (rev. 2, review §4.2).** A per-group history entry must always carry the **projected**
scheme, never the raw `groups` scheme. If a raw `groups` scheme ever reached `targetRepsPerSet` it would
return `null`, `isCompleted` would return `false`, and `entryQualifiesForStreak` (which is
`!isCompleted(...)`) would count that session as a **failure**, inflating the streak toward
`decrease_load`. This is a required invariant with a negative control (NC-7), not merely a mechanism.

The persisted record stays self-describing: `inputs.prescribed.scheme` is the projected scheme and
`inputs.prescribed` gains `group: { key, label, setsMin, setsMax }` — **required whenever the record is
per-group** (absent means "ungrouped slot"), because without it a stored record is not self-describing.
**Emission rule (rev. 3, V-1):** `prescribed.group` and `extraWorkSets` (§5.5) are **omitted entirely —
not `undefined`, not `[]` — from every ungrouped record**, so the client-computed `recommendation` op for
an ungrouped slot stays byte-identical to today's (A-10, NC-9), and a rolled-back server's `.strict()`
schema keeps accepting it (§8). `inputsSummarySchema.prescribed` is `.strict()` (F-13), so both keys are
a wire-contract change on the client-computed recommendation path, not a free addition.
`derived.prescribedSets` = `sets.min`.

### 5.5 Completion and progression eligibility for a set-count range (rev. 2 — H-1)

**The defect being closed.** The first revision let the last *recorded* set gate the group. The review
reproduced the consequence with the projection `{repRange, sets 2, 6–8}` and stock configs: `110×7 @3,
110×7 @2` progresses; add a hard optional third set `110×6 @0` and load-progression **holds**
(`FINAL_SET_RIR_AT_LIMIT`, because `holdAtRirZero` reads the last set); add a short third set `110×5 @1` and
rep-progression **holds** (`TARGET_REPS_NOT_REACHED_ALL_SETS`, because `every()` runs over all sets). Doing
the minimum could only help; doing the invited maximum could only hurt. The two strategies also disagreed
with each other (extra reps never add shortfall in one, an extra set is a full veto in the other). That
inverts the meaning of a range and fails the owner's requirement that the third set be straightforward.

**Definitions.**

- **Recorded sets** of a group: every non-warm-up set stamped with its key, in set-number order. All of
  them are persisted facts and all of them appear in the recommendation record.
- **Evaluation window**: the **first `sets.min` recorded sets, in set-number order**. Chosen by *order*,
  never by *performance*. "First `min`" is not "best `min`": if the first set falls short and the second
  and third are good, the group did not complete — the window is the first two sets, and no set is
  cherry-picked into it. (Pinned by A-6 row 5.)
- **Extra sets**: recorded sets after the window, whether inside `sets.max` or beyond it. They are facts,
  they count for volume and e1RM, they are shown on the card and in History — and they **never gate**.

**Rules, identical for both strategies.**

1. `evaluateSession` passes the window — not all recorded sets — as `ctx.performance.workSets` of the
   projected context, and does the same for every per-group history entry. Both strategies are then
   already correct without modification: load-progression's `isCompleted` is `window.length ≥ sets.min`
   and shortfall over the window ≤ tolerance; its final-set RIR is the **last set of the window** = the
   last *mandatory* set; `modalWorkingLoad` is over the window. Rep-progression's `every()` is over the
   window. No strategy code changes; `STRATEGY_VERSIONS` does not bump.
2. **Completed** ⇔ the window is full (`sets.min` sets) and meets the strategy's rep criterion.
   **Eligible to progress** ⇔ completed and the RIR gate on the last window set passes (or the strategy's
   missing-RIR policy applies). Doing only `min` completes the range by definition; doing more is
   **strictly neutral** for progression.
3. **Not performed** ⇔ zero recorded sets → `NO_WORK_SETS_LOGGED` for that group; no target invented;
   other groups unaffected.
4. **History streaks** are per key and are computed on windowed history entries, so a past session's extra
   sets are as neutral as today's. An ungrouped past session maps per §5.6.
5. **Deload sessions** are not evaluated, for every group (unchanged).

**Audit evidence, kept honest.** The record's `inputs.workSets` holds the **window** — the sets the
strategy actually saw — so the existing reading `derived.setsCompleted === inputs.workSets.length` stays
true for every record ever written. The extra sets go into an additive `inputs.extraWorkSets:
PerformedSet[]` — present on every **per-group** record (`[]` when there were none) and **omitted
entirely from ungrouped records**, exactly like `prescribed.group` (rev. 3, V-1) — and
`inputs.prescribed.group.setsMin/setsMax` says why the split is where it is. A reviewer years later sees "these two sets gated; this third one was also done".
The alternative — `workSets` = everything plus a `derived.evaluatedSetCount` — was considered and rejected
because it silently changes what `workSets` has meant in every record written so far. Both keys are
strict-schema additions on the client-computed recommendation wire (F-13).

**The trade-off of excluding optional sets, stated.** *For:* the app never punishes the set it invited;
a collapse on an optional set never feeds a decrease streak; "doing more" is safe to do. *Against:* the
optional set's own signal is invisible to the recommendation — an RIR 0 on the optional third set does
not hold the group, even though the athlete might want it to; for a `1–2` top group the gate reads the
first top set even when the optional second was the harder one. That signal is not lost: it is in the
record, on the card and in History. A per-strategy knob ("optional sets gate: yes/no") is deliberately
**not** proposed for the first stage — it would be a config-schema change with a behaviour change inside
the strategies and hence a version bump — and is recorded as a possible later addition if real use wants
the strict reading (§15).

**Acceptance matrix (A-6), including the review's reproductions.** Group `Back-off 2–3 × 6–8 @ RIR 2–3`,
projection `{repRange, sets 2, 6–8}`, stock configs, `loadStepKg` 2.5:

| Recorded sets (key `q9m4`) | load-progression | rep-progression (target 6) | Note |
|---|---|---|---|
| `110×7 @3`, `110×7 @2` | `increase_load` 112.5 | `increase_reps` 7 | minimum completes (R-1) |
| … + `110×6 @0` | `increase_load` 112.5 | `increase_reps` 7 | review reproduction 1: the hard optional set no longer holds |
| … + `110×5 @1` | `increase_load` 112.5 | `increase_reps` 7 | review reproduction 2: the short optional set no longer vetoes |
| … + `110×1 @3` | `increase_load` 112.5 | `increase_reps` 7 | a collapse on the optional set is recorded in `extraWorkSets`, not gated on |
| `110×5 @1`, `110×7 @2`, `110×7 @2` | `hold` (`PRESCRIBED_REPS_NOT_COMPLETED`) | `hold` (`TARGET_REPS_NOT_REACHED_ALL_SETS`) | **first `min`, not best `min`**: the window is sets 1–2 |
| `110×7 @3` only | `hold` (`PRESCRIBED_REPS_NOT_COMPLETED`) | `hold` | below minimum |
| none | `NO_WORK_SETS_LOGGED` | `NO_WORK_SETS_LOGGED` | group not performed |
| `110×7 @3`, `110×7 @2`, `110×6 @0`, `110×6 @0` | `increase_load` 112.5 | `increase_reps` 7 | a fourth set beyond `max` is an extra set; `max` has no evaluation meaning |

Every row's record carries `workSets` = the first two sets and `extraWorkSets` = the rest; an ungrouped
record carries neither `extraWorkSets` nor `prescribed.group` (rev. 3, V-1).

### 5.6 Continuity when an existing slot is converted (rev. 2 — M-2)

**The defect being closed.** With per-key lookups and no bridge, converting an existing exercise to a
`groups` scheme found no candidates in any earlier session, fell to the (often stale or null)
`baselineLoadKg`, and emptied the per-key history — resetting the working load and the streaks of the
owner's own example, and of every ordinary slot converted to a one-group range. The slot's existing
null-key pending record was orphaned as well.

**C-1 (rule, not a decision) — single-group scheme.** The sole group *is* the slot. Its history,
carry-forward and decision lookups read **both** its own key and the **null key**; the slot's existing
null-key pending record is surfaced as that group's card, decided normally, and superseded by the group's
next record. Nothing resets. Converting `5 × 5` into `2–3 × 5` changes what is prescribed and nothing
about what the athlete last lifted.

**D-6 (decision) — multi-group scheme.** The mapping is genuinely ambiguous: an undifferentiated `5 × 5`
history could belong to "Top" or to "Back-off". Options, with concrete consequences:

| Option | First grouped session of a converted `5 × 5 @ 100 kg` slot | Pending null-key record |
|---|---|---|
| **(a) Bridge to the first group** (recommended) | Top prefills 100 kg (light for a double; the athlete types 140 once and the logged top load carries forward from then on); Back-off starts from its own baseline or empty. Top's streak history continues; Back-off's starts fresh. One rule, the same one `prefill` already uses (first group's values), applied symmetrically. | Treated as the first group's: surfaced, decidable, superseded by Top's next record. No conversion hook. |
| (b) No bridge — every group starts empty | Both groups prefill from their baselines or blank; every streak resets; the review's M-2 symptom for the most common path. | Orphaned unless a **supersede-at-conversion** hook is added to the prescription PATCH path (one server line); the hook is then mandatory. |
| (c) Ask at conversion time | The editor asks which group inherits the slot's history. Precise, but extra UI in the first stage, and the answer is almost always "the first". | As (a) or (b) per the answer. |

The recommended default is **(a)**, applied **symmetrically**: an ungrouped slot converted *back* from a
grouped scheme reads, from each historical grouped session, the sets of that session's **first group** (each
history row carries its own frozen snapshot, so this is computable per row without knowing the removed
keys). "Ungrouped ≡ first group" in both directions is one rule for the whole continuity question. It is
raised as a decision because it is visible to the athlete on the first converted session and because (c)
is a legitimate product preference.

---

## 6. Linked-load semantics (investigation 3)

### 6.1 The reference: prescribed versus performed top-set load

| Basis | Definition | Available when | Behaviour when the athlete deviates on the top set |
|---|---|---|---|
| `prescribed` | the reference group's **resolved prefill** (decision → carry-forward → baseline) at session start | at bundle/snapshot time, offline included, frozen | back-off does not follow the deviation — **including an in-session implicit `modified` decision on the top group's first set**, the most common way a deviation happens (rev. 2, review §7) |
| `performed` | the **heaviest** non-warm-up set actually logged **with the reference group's key** in this session | only once a reference set exists; a pure function of the **current** local set list, re-run on every render (add, edit, delete of reference sets all move it) | back-off follows what was lifted — the coaching meaning of "80 % of today's top" |

Both are legitimate; they are different products. The owner's wording ("optionally at 80 % of the top-set
load") does not choose; decision D-4 (§13) does. The design supports both with one field so the choice
is data, not code.

### 6.2 Edge cases (decided, routine defaults R-8…R-12 unless overridden; rev. 2: two rows clarified)

| Case | Rule |
|---|---|
| Multiple reference sets at different loads | `performed`: the **heaviest** attributed work set of the reference group (a "top" is by definition the heaviest; the engine's modal/earliest tie rule is not used here). `prescribed`: n/a (one prefill). |
| Reference group has no sets yet / was skipped | `performed`: fall back to the linked group's **own** prefill chain (its last session's own group load, else its baseline, else empty) and say so in the subtitle ("80 % of top set — top set not logged yet"). `prescribed`: fall back the same way when the reference prefill is `null`. Never fabricate a load. |
| Override | The athlete types any load; it is logged as a fact. The link only ever proposes; it never rewrites. |
| **Which sets the link proposes for** (rev. 2) | The derived value is the **first-set proposal** for the linked group. The second and third back-off sets prefill from the previous back-off set by the existing copy-forward (F-22), exactly as any group's later sets do (§11.4). It is not a per-set derivation and it is not enforced. |
| Rounding | `roundToStepKg(reference × percent / 100, loadStepKg)` — nearest multiple, half up, the engine's existing convention. Nearest rounding can round a back-off **up** (80 % of 102.5 kg at a 2.5 kg step is 82.5, not 80); a **floor** variant is a genuine preference, recorded as an option under D-4's decision rather than dismissed. |
| Top set edited after back-offs are logged | Logged back-off sets are facts and are **never** recomputed. Only the prefill of not-yet-logged sets follows the edit, because prefill is derived on render from local sets. |
| Reference set deleted | Same as "no sets yet" from that moment on. |
| Offline / cross-device | The link definition is frozen inside the snapshot scheme; resolution is a pure client function of `(snapshot, sets, loadStepKg)`. No server involvement at logging time; a cross-device adopt sees the same sets and derives the same prefill. |
| Deload `loadMultiplier` | `prescribed`: the reference prefill is already multiplied, so the derived load inherits it once — never applied twice. `performed`: what was lifted already reflects the deload. |
| Percent bounds | integer 10–100; no default value; empty until the user enters one. |

### 6.3 One load authority per group (rev. 2: consequences made explicit)

A linked group has two possible authorities for "what load next time": the link, and a load-progressing
strategy's recommendation. The design forbids the conflict structurally rather than arbitrating it:

- **Rule L-1.** A group whose `load.mode` is `percentOfGroup` must use `progression.strategyId === "manual"`
  in Option B's first cut. `checkPrescriptionCompatibility` rejects any other pairing
  (`"a percent-linked group cannot use load-progression or rep-progression"`), the editor never offers it,
  and the engine's `supportsScheme`-style gate returns `UNSUPPORTED_SCHEME` defensively. The review
  verified each enforcement point exists.
- **Visible consequence for the owner:** a linked back-off group produces **no recommendation and no
  decision** — no `Accept / Keep / Custom` card for the back-offs, ever, while A-only back-offs do get one.
  That is a real product difference between A and B for the same exercise and it is the honest scope of
  "the link is the load rule". It is recorded under D-4's examples in §13.
- Later relaxation (recorded, not designed): allow `rep-progression` on a linked group by emitting
  rep-only targets (`target.reps`, no `loadKg`). That reopens the implicit-decision rule (F-9: a target
  without `loadKg` never resolves implicitly) and is deferred with that trigger.

### 6.4 User-configured percentage versus evidence-derived default

The percentage is **always user-entered**. No number is shipped as a default, pre-filled or labelled
"recommended". Whether *any* default could be justified is a research question, answered in §14 from the
companion research report; the engineering position is that a configurable field with no default is
correct regardless of that answer, and that a default, if ever adopted, is a labelled convention under
the existing `heuristic` classification, never "evidence_supported" (evidence-to-design.md rows 1–2, B9).

### 6.5 Where the link lives, and the anti-DSL exception (rev. 2: `perSet` precedent cited)

Option B adds a per-group load mode:

```ts
type GroupLoad =
  | { mode: "carryForward"; baselineKg?: number }                       // Option A's baselineLoadKg, generalised
  | { mode: "percentOfGroup"; ref: string; percent: number; basis: "performed" | "prescribed" };
// invariants: ref ∈ keys of groups that precede this group in order (one hop, no chains, no cycles);
//             percent is an integer in 10..100; a linked group's strategy is manual (L-1)
```

`ref` is a reference between fields inside one scheme, which ADR-008 / prescription-model.md §1 forbid.
Option B therefore needs an explicit, bounded amendment: **exactly one kind of reference — a back-reference
from a group to an earlier group of the same slot — validated at the schema boundary, non-transitive, and
resolved by one pure domain function.** No cross-slot, no cross-exercise, no chain (a group linked to a
linked group is rejected), no expression. This is the "no arbitrary dependency graph" line drawn in code.
Placing `load` on the group entry follows the reserved `perSet.sets[].loadOffset` shape in
prescription-model.md §2 (F-19), which is repository precedent for a percentage-of-top load offset living
inside a scheme; the amendment should cite it so the precedent is on record. The step is smaller than
"policy cost" implied in the first revision, and still a step: `percentOfGroup` names a key, where
`percentOfTop` is a positional convention. The §4 "load prescription mode" note is amended rather than
contradicted.

---

## 7. e1RM, volume and History (investigation 4) — verified, no change required (rev. 2 — M-1)

**e1RM does not consume every set.** The query bounds by user, exercise and `status = 'completed'`; the
domain then excludes warm-ups, zero loads, `rir ≥ 5` and `RTF > 12`, groups eligible sets **by load**,
and classifies the load groups by the rules in F-16. The first revision's statement that "a back-off
group at 80 % is sub-modal → excluded" was **wrong**, and the review reproduced why. Correct account:

- **The back-off group is the modal anchor.** The modal group is the one with the most sets (ties →
  heaviest). In a one-top-set + two-or-three-back-off session the back-off group has more sets, so **it**
  is modal and admitted. The top set is the *supra-modal* group and is admitted only if
  `e1RM(top) ≤ 1.20 × e1RM(back-off group)`; when admitted it governs (`TOP_SET_GOVERNS`), when not it is
  excluded as `IMPLAUSIBLE_SETS_EXCLUDED` and the session's value is the back-off group's. Sub-modal
  exclusion would apply only to a group *lighter* than the back-offs (a third, lighter group).
- **Worked figures** (Epley with `f(1) = 1`, RTF = reps + RIR, group e1RM = lower median of the first
  three sets, as implemented):
  - `140×2 @2` + `110×7 @3` + `110×7 @2` → top 158.67; back-off group 143.00 (sets 146.67, 143.00);
    ceiling 171.60 → top **admitted, governs**; session **158.67**; flags `TOP_SET_GOVERNS`,
    `SINGLE_SET_GROUP`, `MIXED_LOADS_IN_SESSION`.
  - `160×2 @2` + `3 × 120×3 @3` → top 181.33; back-off group 144.00; ceiling 172.80 → top
    **implausible**; session **144.00** — the heaviest, most informative set is dropped.
- **The interaction with the back-off percentage, as arithmetic** (not a policy claim): with the top set
  at RTF *t* and every back-off set at RTF *b*, the top set stays admitted iff
  `p ≥ (1 + t/30) / (1.20 × (1 + b/30))`, where *p* is the back-off load as a fraction of the top load.
  For a double @ RIR 2 (*t* = 4), to one decimal, rounded half up (rev. 3, V-4): with 7-rep back-offs
  @ RIR 2 (*b* = 9) the threshold is **72.6 %** (1.1333 / 1.5600 = 0.7265); with 6–8 reps @ RIR 2–3
  (*b* = 8…11) it lies between **74.6 %** (1.1333 / 1.5200 = 0.7456) and **69.1 %** (1.1333 / 1.6400 =
  0.6911); with triples @ RIR 3 (*b* = 6) it is **78.7 %** (1.1333 / 1.4400 = 0.7870). These remain
  arithmetic on the tracker's formula, not a policy claim. The owner's 80 % example therefore keeps the top set in the trend for the
  stated back-off band; deeper drops, or lower-rep / lower-RIR back-offs, push it out silently — nothing
  warns the athlete; the number simply stops tracking the heavy work. Under Option B the user-chosen
  percentage is exactly the number that decides this.
- **Permanent medium confidence.** `TOP_SET_GOVERNS`, `SINGLE_SET_GROUP` and `MIXED_LOADS_IN_SESSION` are
  all in `CONFIDENCE_CAPPING_FLAGS` (F-16). A session with one admitted top set carries all three, so an
  exercise programmed this way has its e1RM confidence capped at **medium on every session**, not
  occasionally. Any future gate on confidence (PI-013 inherits this) will see medium for such exercises.

**Status of these consequences.** They are **existing consequences of the tracker's accepted rules**
(ADR-011; revision V-6/V-7/V-9/V-11), recorded here for owner awareness because Set Groups makes this
session shape routine. They are **not** a decision made by this document and are **not** presented as
owner-accepted; nothing here changes e1RM policy. The bottom line stands: `src/domain/strength/**` needs
no change for Set Groups, the tracker must not read `groupKey` (load groups and prescription groups are
different things and stay so; the §14.5 boundary test keeps holding), and any change to plausibility,
the top-set rule or confidence belongs to the e1RM design lineage (revision D-12 recalibration, PI-013),
not to this feature.

**Regression criteria (A-16, A-16b).** The grouped and ungrouped report for the identical sets are equal;
the two worked sessions above are pinned **as current behaviour** (top admitted / top implausible, with
their figures and flags) so that any later change is deliberate; the strength module's import boundary
is unchanged.

**PI-013 dependency note.** Release B refuses a suggestion "on any pending recommendation" and targets
"the first work set". With per-group pending records, "the first work set of which group?" must be
reconciled when PI-013 is designed.

**Volume and metrics** count every non-warm-up set once (F-17); a set in a group is a set. Neither
reads `groupKey`. No change.

**History** renders from the frozen snapshot; the scheme line becomes the group line
(`Top 1 × 2 · Back-off 2–3 × 6–8`) and each set row gains a label prefix (`Top ·`, alongside the existing
`W ·`). The correction form gains the group chip. Nothing is duplicated (one row per set), nothing is
omitted (unattributed sets still render), nothing is silently re-attributed (the key is the athlete's own
fact, frozen order from the snapshot).

**Preserved facts.** No backfill, no rewrite of any `set_logs` row, no rewrite of any snapshot. Existing
rows read as `group_key = null` = "ungrouped", which is exactly what they were.

---

## 8. Compatibility (investigation 5) (rev. 2: rollback and PI-018 rows)

| Surface | Rule | Basis |
|---|---|---|
| Snapshot version | `v` stays 1. `groups` is an additive union member; `groupPrefills` and `progression.groups` are additive optional keys. Old snapshots parse unchanged; no upgrader. | ADR-008; `measurement`/`prescriptionNotes` precedents (F-11) |
| Old prescriptions | Untouched; `fixed`/`repRange` = one implicit group with key `null`. No migration of `scheme` JSON (neither `exercise_prescriptions.scheme` nor `session_exercises.prescription` carries a shape CHECK). | §5.3, §5.6 |
| Existing set rows | `group_key` nullable, default null; no backfill. | ADR-007, §7 |
| Cached bundles (SW + IndexedDB) | An old bundle can only carry old schemes; absence of `groupPrefills` means ungrouped; history sets without `groupKey` degrade offline evaluation as stated in §5.3. Client mirrors type the new keys optional (R-1 rule). | pwa-offline-strategy.md §4; PI-018 §4 |
| **Old client, new bundle** | An old build's `prescriptionSnapshotSchema` **fails** on `type: "groups"` inside `buildSessionExerciseUpsertPayload`, so "Start workout" throws on that client. It throws **before** `commitSessionMutation` (every op is built first, [`activeSession.ts:338-408`](../../src/sync/activeSession.ts#L338)), so no orphaned local session is left behind — a clean failure, not a corruption. Same exposure the `distanceRounds` release accepted. Mitigation is operational: update every used client (the catalog release's D-CE1-1(i) check) **before** authoring the first grouped prescription. | F-14; PI-018 §2 R-B |
| **New client, rolled-back server (L-5)** | The old server rejects the grouped slot's `sessionExercise` op as `invalid_payload` (unknown scheme type fails the union). Because that row then never exists server-side, **every `setLog` op for the slot is rejected as `not_found`** ([`sync/service.ts:974`](../../src/server/sync/service.ts#L974)), and the strict payload schemas reject the new keys anyway. Server-side, the **whole grouped slot including its sets is absent**, not just the grouping. **Locally nothing is deleted:** each rejected op is kept in the outbox with its payload intact and its reason, listed on the Sync issues screen, and can be **retried without alteration** once the server is rolled forward (F-24) — the slot op first, then its set ops (retry re-queues at the original FIFO position, so retrying in creation order preserves the parent-before-children order). The completed session's local aggregate is gone at completion, so the outbox **is** the only local copy; the Complete flow's confirmation names unsaved sets and points at Sync issues. Ungrouped sessions are unaffected **provided the client emits `groupKey` (set-log and recommendation ops) and `inputs.prescribed.group` / `inputs.extraWorkSets` (client-computed recommendation ops) only for grouped slots and per-group records, omitting them entirely otherwise** (the O-13 profile-scoped emission pattern — byte-identical ops for everything that exists today; rev. 3, V-1). Operational rule: do not roll back while a grouped session may be in flight; if a rollback happens, roll forward before anyone discards dead letters. Recorded in the rollback test with a frozen pre-feature schema copy (A-11). | [rollbackCompatibility.test.ts](../../tests/unit/sync/rollbackCompatibility.test.ts) pattern; profiles evaluation §13.5/§14.5 |
| Offline start / replay | Set ops are idempotent by id; `groupKey` is just another field; renumber ops re-send it (full-row emitters share one key set). Client-computed recommendation ops carry `groupKey`; server dedupe by `(sourceSessionExerciseId, groupKey)`. | §5.3; `setDeletionOps.ts` |
| Block modifiers | `setMultiplier` applies to each group's `min` and `max` (floor, min 1, keep `min ≤ max`; Σ max clamp to 20); `targetRirShift` to each effective band; `loadMultiplier` to each group prefill. `appliedModifiers` shape unchanged. | F-12 |
| Measurement profiles | `groups` is offered for **`load_reps` only** in the first stage (`SUPPORTED_SCHEMES.load_reps` gains `"groups"`). Generic across *exercises*, not across *profiles*: `reps`-profile groups would be `manual`-only anyway and are deferred; distance/duration profiles have no rep dimension to group. Option B is `load_reps` only. | F-15; profiles evaluation §9.2 |
| IndexedDB | No `DB_VERSION` bump (object stores are schemaless); `normalizeActiveSession` fills `groupKey: null` on read, as it does for `distanceM`/`durationS`. | `activeSession.ts` normalisers |
| **PI-018 (rev. 2)** | Committed at `7fb7c0b`, deployed, and owner-accepted on the iPhone on 2026-09-12 ([device acceptance](workout-prescription-context-device-acceptance.md); STATUS). The five files the first revision flagged as a collision now carry PI-018's changes in `583a9ab`; Set Groups is designed against that tree. `restSeconds` and `prescriptionNotes` stay slot-level; the subtitle keeps the `· Rest m:ss` clause after the group line and the "Program note" block is unchanged. | F-11, F-18; PI-018 §8 |

---

## 9. Options A and B, the recommended stages, and the real complexity difference (rev. 2: §9.2)

### 9.1 Side by side

| Dimension | A — ordered groups, existing progression per group | B — A plus percentage-linked back-offs |
|---|---|---|
| Scheme | `groups` variant, per-group `baselineLoadKg?` | + per-group `load` mode with `percentOfGroup` |
| Anti-DSL boundary | Untouched | One bounded exception (§6.5), ADR-008 amendment, with the `perSet.loadOffset` precedent cited |
| Storage / migration | `set_logs.group_key`, `recommendations.group_key`, index rebuild | Nothing further |
| Sync contract | `setLog.groupKey`, `recommendation.groupKey`, `inputs.prescribed.group`, `inputs.extraWorkSets` — all four emitted only for grouped slots / per-group records and **omitted entirely** otherwise (rev. 3, V-1) | Nothing further |
| Snapshot | `groupPrefills`, `progression.groups` | Nothing further (the link rides inside `scheme`) |
| Engine | per-group projection + window loop; re-evaluation scoped to pending keys; strategies unchanged | + compatibility rule L-1; linked groups are `manual` (no card for them) |
| Prefill | per group via decision → carry-forward (with the §5.6 bridge) → baseline | + `prescribed` resolution in `buildPrescriptionSnapshotData`; `performed` resolution in `derivePrefill` (pure, client) |
| Card | group chip with re-derivation on every selection change, per-group subtitle, per-group recommendation cards, labelled set rows | + "80 % of top set → 112.5 kg" line and the fallback copy |
| Editor | group list with ranges/band/baseline; per-group strategy (collapsed) | + load-mode select, reference group select, percent field, basis toggle |
| History | labelled rows, group line, group chip in correction | Nothing further |
| e1RM / volume | No change (§7 records the existing consequences) | No change; the chosen percentage interacts with the tracker's plausibility band (§7) |
| Tests | new fixtures across unit/integration/E2E (§12) | + link-resolution unit table, one E2E |
| Change class | schema/migration **and** sync-contract | same class, no new class |

**The actual complexity difference.** B is not "double A". It adds one schema shape, one validation
rule, two pure resolution functions, one compatibility rule and a handful of UI strings — and one
*policy* cost: the fenced ADR-008 exception (one hop, backwards, no chains). Everything expensive —
stable identity, stored attribution, per-group evaluation, per-group records, sync keys, migration,
editor — is A, and B cannot exist without it: a link needs to know which sets are the top set, and that
is attribution.

### 9.2 Recommended stages (rev. 2)

**Stage A = Option A**, in full (per-group progression, D-2 confirmed by the review), `load_reps` only,
single-group schemes included, no link. It is the owner's stated V1 and delivers the Trap Bar example
end to end.

**Stage B = Option B**, built against the reviewed and verified Stage A tree: `percentOfGroup` with both
bases available (D-4), percent user-entered, linked groups `manual`, no default.

A and B are **build stages** (rev. 3, V-6): B follows A as soon as D-5 (the fenced
ADR-008 amendment) is decided — on the decision, not on elapsed time or accumulated use. The research is
explicit that nothing distinguishes the two designs empirically, so a real-use waiting period would buy
no evidence and none is imposed. Whether A and B ship together or apart is the owner's packaging choice
and is not pre-committed here. Whatever the packaging, the Stage A group entry is shaped so that adding
`load` later is purely additive (`baselineLoadKg` folds into `load.mode: "carryForward"`).

No "representation-only" stage is proposed: showing groups while pooling their evidence would produce
wrong recommendations with a correct-looking label, which is worse than today.

---

## 10. Contracts, affected subsystems and file manifest (Stage A) (rev. 2: L-3, L-4, PI-018)

Paths are exact; the change column is what a reviewer should diff against. Nothing here is implemented.

| # | File | Change |
|---|---|---|
| 1 | `src/domain/schemes/setScheme.ts` | `groups` union member + `superRefine` invariants; `SCHEME_TYPES` gains `"groups"`; `formatScheme` case (`"Top 1 × 2 · Back-off 2–3 × 6–8"`); `projectGroup` helper (or in `progression/`). |
| 2 | `src/domain/measurement/compatibility.ts` | `load_reps` gains `"groups"`. |
| 3 | `src/domain/prescriptions/schema.ts` | `progression.groups?` per-key `{strategyId, config}`; `checkPrescriptionCompatibility` runs the `repCap` rule **per projected group**, rejects slot-level `repCap` on a `groups` scheme, and rejects `groups` for non-`load_reps` (§5.3). |
| 4 | `src/domain/progression/registry.ts` | `resolveProgression` per group (projected scheme); `defaultConfigFor` becomes an exhaustive `switch`; `supportsScheme` accepts `groups` for the two strategies via projection. |
| 5 | `src/domain/schemas/prescriptionSnapshot.ts` | additive optional `groupPrefills`, `progression.groups`; `v` stays 1. |
| 6 | `src/domain/prescriptions/buildSnapshot.ts`, `applyWeekModifiers.ts` | per-group prefill resolution; per-group modifier application. |
| 7 | `src/domain/progression/workingTargets.ts`, `carryForward.ts` | per-key candidate selection including the §5.6 bridge (candidates carry `groupKey`; the caller pre-filters by key, with null-key candidates admitted for the first group per C-1/D-6). |
| 8 | `src/domain/progression/evaluateSession.ts`, `engine.ts` | per-group loop; evaluation window (§5.5); `EvaluatedRecommendation.groupKey`; `InputsSummary.prescribed.group`, `InputsSummary.extraWorkSets`; re-evaluation restricted to still-pending keys (M-3). Strategies untouched. |
| 9 | `src/domain/progression/evaluationTarget.ts` | per-key overlay of an in-session decision's chosen reps onto `groupPrefills[key].reps` (L-3). |
| 10 | `src/domain/progression/implicitDecision.ts` (caller) | unchanged function; `logSet` resolves per key. |
| 11 | `src/domain/schemas/recommendation.ts` | `inputsSummarySchema.prescribed.group` and `inputsSummarySchema.extraWorkSets` — both **required on per-group records and omitted entirely on ungrouped ones** (strict-schema additions, F-13; pinned by A-10 / NC-9). |
| 12 | `src/domain/sync/schema.ts`, `payloadBuilders.ts`, `setDeletionOps.ts` | `setLog.groupKey?`, `recommendation.groupKey?`; full-row set-log emitters carry `groupKey` only for grouped slots, and `buildClientRecommendationOps` emits `prescribed.group` / `extraWorkSets` only for per-group records (V-1). |
| 13 | `src/db/schema/setLogs.ts`, `recommendations.ts` + `drizzle/0014_*.sql` | nullable `group_key` on both; rebuild `uq_recs_one_pending` with `coalesce(group_key, '')`. |
| 14 | `src/server/sync/service.ts` | `SET_LOG_FIELDS` + `groupKey`; parent-snapshot key validation on create/update; `setLogUpdateChangesEvaluationInputs` + `groupKey`; recommendation upsert carries the key and supersedes per key. |
| 15 | `src/server/progression/service.ts` | key-scoped supersede/decision/pending/in-session lookups; per-key history split with the §5.6 bridge; dedupe by `(slot, key)`; `reevaluate` mode restricted to still-pending keys. |
| 16 | `src/server/today/service.ts` | `groupPrefills`, `pendingRecommendations` (array, filtered to keys present in the current scheme plus the null key mapped per §5.6; `pendingRecommendation` kept for the null key), `HistorySetDto.groupKey`. |
| 17 | `src/server/history/service.ts` | `HistorySetDetail.groupKey`. |
| 18 | `src/server/prescriptions/service.ts` | key generation on create/update (never re-derived), per-group compatibility issues; if D-6 = (b), the supersede-at-conversion hook. |
| 19 | `src/sync/types.ts`, `activeSession.ts`, `corrections.ts` | mirrors (optional keys); `logSet` stamps the key, per-key implicit decision; per-group offline evaluation with the window; normaliser; unknown-key filter on `pendingRecommendations`. |
| 20 | `src/ui/workout/ExerciseCard.tsx`, `RecommendationCard.tsx`, plus a pure `groupSelection.ts` helper | group chip row; selection-change re-derivation and advance-at-`max` (§11.4); per-group subtitle; per-group cards; labelled set rows; edit-form chip. |
| 21 | `src/ui/history/HistoryDetail.tsx` | group line, labelled rows, chip in correction. |
| 22 | `src/ui/prescriptions/PrescriptionForm.tsx`, `formOptions.ts`, `types.ts` | group builder; per-group `repCap` field where the strategy requires it. |
| 23 | `src/ui/today/TodaySection.tsx` | group line on Today. |
| 24 | `tests/**` | §12. |
| 25 | `docs/**` | §16. |

**Not changed, deliberately:** `src/domain/strength/**` (§7), `src/domain/volume/**`, `src/domain/metrics/**`,
`STRATEGY_VERSIONS`, `loadProgression.ts`, `repProgression.ts`, `reasonCodes.ts` (no new code is needed:
`NO_WORK_SETS_LOGGED` already says "this group was not performed"), `src/sync/db.ts` (`DB_VERSION`),
`src/server/templates/service.ts` (no copy operation exists to constrain; §4.5 records the forward rule).

**Sequencing (rev. 2).** PI-018 is committed, deployed and accepted; the earlier file collision no longer
exists. Stage A is designed against `583a9ab` or later.

**Change class (rev. 2 — L-4).** Schema/migration **and** sync-contract. Because Stage A adds a column to
`set_logs`, and `set_logs` has a gated concurrency suite
(`SET_RENUMBER_CONCURRENCY_DATABASE_URL`, [`setRenumberConcurrency.integration.test.ts`](../../tests/integration/setRenumberConcurrency.integration.test.ts)),
that suite is **required** at R and at E per the matrix's "if any touched table has one" clause — not
optional and not waived by "no new concurrency path". The `uq_recs_one_pending` rebuild is a partial unique
index and therefore a **must-execute** negative control under §6. Summary: D = targeted unit/integration +
`drizzle-kit check` + `pnpm test:e2e:offline`; R = full quality gates, fresh migrate on
`gymapp_t_setgroups`, `drizzle-kit check`, seed twice, sync integration files, offline E2E on a clean DB,
the set-renumber gated suite, replay-idempotence and partial-index negative controls; E = full quality
gates + fresh migrate + seed twice + the set-renumber gated suite + full `pnpm test:e2e` (load-bearing).
Real iPhone device acceptance afterwards, by the owner.

---

## 11. Authoring, execution and editing — compact examples (investigation 6)

### 11.1 Authoring (program exercise editor)

```text
Exercise      Trap Bar Deadlift          (load_reps)
Scheme        Set groups            ▾
  ┌ 1  Top        sets 1 – 1   reps 2 – 2   RIR 2 – 2   baseline 140 kg     [↑↓] [×]
  └ 2  Back-off   sets 2 – 3   reps 6 – 8   RIR 2 – 3   baseline 110 kg     [↑↓] [×]
  [+ Add group]
Rest (seconds, optional)   180
Progression   Load progression      ▾      ▸ Progression per group (optional)
Notes         Brace hard on the double; back-offs smooth, no grinding.
```

Stored (abridged):

```json
{ "v": 1, "scheme": { "type": "groups", "groups": [
  { "key": "g7k2", "label": "Top",      "sets": {"min":1,"max":1}, "reps": {"min":2,"max":2}, "targetRir": {"min":2,"max":2}, "baselineLoadKg": 140 },
  { "key": "q9m4", "label": "Back-off", "sets": {"min":2,"max":3}, "reps": {"min":6,"max":8}, "targetRir": {"min":2,"max":3}, "baselineLoadKg": 110 } ] } }
```

`progression` on the row stays `{ "strategyId": "load-progression", "config": {…} }` and applies to both
groups unless "Progression per group" sets, say, `rep-progression` for `q9m4` (with its own `repCap`,
§5.3).

Immediate requirements: add/remove/reorder groups, per-group ranges, band, baseline, per-group strategy
(collapsed), validation messages naming the group. Later conveniences (not in Stage A): a "Top + back-off"
preset, duplicate-group, converting an existing `fixed`/`repRange` slot into a one-group scheme in place.

### 11.2 Execution (workout card) (rev. 2)

```text
Trap Bar Deadlift                                                    [Skip]
Top 1 × 2 @ RIR 2 · Back-off 2–3 × 6–8 @ RIR 2–3 · Rest 3:00
Program note: Brace hard on the double; back-offs smooth, no grinding.

┌ Top — Recommended: 142.5 kg (+2.5)                    [Accept] [Keep 140] [Custom…]
└ Back-off — Recommended: 112.5 kg (+2.5)               [Accept] [Keep 110] [Custom…]

  Top ·  142.5 kg × 2 @ RIR 2
  Back-off ·  112.5 kg × 7 @ RIR 3

[ Top 1/1 ✓ ]  [ Back-off 1/2–3 ]      ← selected: Back-off (auto-advanced when Top reached its max)
☐ Warm-up set
kg [112.5]   reps [7]   RIR [ ]                                       [Log set]
Add notes
```

Where the `112.5` in the box came from is now a rule, not a picture: at the moment Top reached its `max`
the selection moved to Back-off and the input row was **re-derived** from Back-off's own chain — its
last set this session (none yet) → its recommendation target (112.5) → `groupPrefills.q9m4` → empty. After
the first back-off is logged, the second prefills from it by the ordinary copy-forward. Nothing about keys,
projection or strategy versions appears in copy. Two recommendation cards on one phone card is a density
cost to be judged at device acceptance, not a design defect.

### 11.3 Editing

- **In-session set edit**: the set row's edit form gains the same chip; moving a set between groups is
  an evaluation-relevant edit (re-evaluate + supersede while pending, scoped per §5.3).
- **History correction**: same chip; same rule.
- **Template edit after sessions**: rename/reorder/add/remove groups freely; keys persist through
  rename and reorder; a removed group's pending record is filtered at bundle assembly (§4.5); an added
  group starts with no history and its own baseline; conversion continuity per §5.6.

### 11.4 Input-state transitions on the card (rev. 2 — H-2)

**The defect being closed.** The first revision advanced the selection at `sets.min` and said nothing
about the input row. The card keeps weight and reps exactly as typed after a log (F-22), so immediately
after the top set the box still held the top load; the next tap would have logged **140 kg attributed to
Back-off** — correctly attributed, wrong, and it would then have anchored that group's carry-forward,
e1RM load group and next recommendation. That is precisely the silent mis-attribution the stored key
exists to prevent, arriving through the UI instead of the storage.

**State.** `selectedGroupKey` (UI state, not persisted, derived on mount), `weight`, `reps`, `rir`,
`isWarmup`, and `dirty` (true once the athlete has typed since the last derivation). The derivation for a
group is one pure function — `groupPrefill(group, sets, recommendations, groupPrefills)`: the last set
logged **in that group** this session → that group's recommendation target (pending/accepted) or chosen
values (modified) → `groupPrefills[key]` → empty; under B, a linked group's derived link value takes the
recommendation's place (§6.2). Selection is another pure function — `nextGroupSelection(scheme, sets)`.
Both live beside the card and are unit-tested without React.

| Event | Selection | Weight / reps | RIR | Warm-up toggle | `dirty` |
|---|---|---|---|---|---|
| Mount / reload / cross-device resume | derived: the first group in order whose recorded count is below its `max`, else the last group. **After a deliberately skipped top group** (Top has no sets, Back-off has some) a reload therefore re-selects **Top** — it is still unperformed — with the inputs derived from Top's own chain, never from Back-off's last set; no mis-attribution is possible and no skip fact is persisted. This is the chosen behaviour, pinned by A-9 (rev. 3, V-5). | derived for that group | empty | last logged set's `isWarmup` (unchanged rule) | false |
| Log a **work** set (no advance) | unchanged | unchanged (copy-forward, as today) | cleared (as today) | unchanged | false |
| Log a **work** set that brings the selected group to its `max`, and a later group exists (**auto-advance**) | next group in order | **re-derived** for the new group — the value in the box visibly changes | cleared | unchanged | false — no draft can exist, the log just consumed it |
| Log a **warm-up** set | unchanged — warm-ups never count toward `min`/`max` and never advance | unchanged (copy-forward, as today) | cleared | unchanged | false |
| Tap a chip (any group, including one already at `max` or a **prior** group) | tapped group | **re-derived** for that group — returning to Top after back-offs brings the top load back, so "one more top set" is one tap plus Log | cleared | unchanged | false; a dirty draft is replaced — the athlete initiated the switch, the draft is one row of numbers, and preserving it across a group change *is* the hazard |
| Type into weight / reps | unchanged | as typed | as typed | — | true; **no re-derivation happens on a render, a recommendation decision, or a sync event** — only the two selection-change events above re-derive |
| Explicit recommendation decision (Accept / Custom / Keep) on a group's card | unchanged | prefilled only if that group is the selected one and no set of that group is logged and not `dirty` (extends the existing "only while nothing is logged" rule per group) | — | — | — |
| Skip the top group today | tap Back-off before logging | re-derived for Back-off | — | — | — → Top ends with no sets: `NO_WORK_SETS_LOGGED`. This absence **is** the first-class "no top set today"; there is no separate skip fact and none is needed. |

**Advance-at-`max` versus the alternatives.**

| Rule | Fixed-count groups | Range groups (`2–3`) | Silent-carry risk | Taps per boundary |
|---|---|---|---|---|
| Advance at `min` (first revision) | zero taps | the optional set needs a tap **back**, at the moment the athlete is least likely to be reading the screen | present without re-derivation | 0 |
| **Advance at `max` + re-derive** (recommended) | zero taps | the optional set stays on the current chip with no ceremony: the chip reads `Back-off 2/2–3 · optional set`, Log adds it; moving on early is one tap on the next chip, which is hinted once `min` is reached | none — re-derivation is unconditional on selection change | 0 (fixed) / 1 to leave a range early |
| Tap-only (never auto-advance) | one tap per group | same as above | none | 1 |

Advance at `max` keeps the zero-tap ideal for the common fixed-count case, keeps optional sets easy,
and, with unconditional re-derivation, cannot carry a load across groups. Tap-only remains a one-line
change if device acceptance prefers it (D-8 in §13, engineering recommendation).

**Guards.** A-9 asserts the pure functions; A-17 asserts in the browser that **the weight input's value
changes at the instant of auto-advance** and again on a tap back to Top; NC-8 removes the re-derivation
and watches A-17 fail.

---

## 12. Acceptance criteria, regression risks and negative controls (rev. 2)

### 12.1 Acceptance (Stage A)

| ID | Level | Assertion |
|---|---|---|
| A-1 | Unit (`setScheme`) | `groups` parses with 1–4 groups; rejects duplicate keys, `min > max`, Σ max > 20, empty label, span > 30; `v` stays 1. |
| A-2 | Unit (`formatScheme`) | `"Top 1 × 2 · Back-off 2–3 × 6–8"`; exhaustive switch (compile) — the existing "fifth variant fails to compile" comment is honoured. |
| A-3 | Unit (projection, config) | fixed reps → `fixed`; ranged → `repRange`; `sets = min`. `defaultConfigFor` on a `groups` scheme derives `repCap` per ranged group; slot-level `repCap` on a `groups` scheme is rejected; a fixed-rep group under `rep-progression` without its own `repCap` is rejected (F-23 closed). |
| A-4 | Unit (engine) | Top `1×2 @ RIR 2` + Back-off `2–3×6–8`: sets `[140×2 @2 (g7k2), 110×7 @3 (q9m4), 110×7 @2 (q9m4)]` → two drafts: `g7k2 increase_load 142.5`, `q9m4 increase_load 112.5` (load-progression); with `rep-progression` on `q9m4`: `increase_reps 7`. The strategies' own §9 matrix passes byte-identically (`STRATEGY_VERSIONS` unchanged). |
| A-5 | Unit (engine) | Skipped top set: sets `[110×7 (q9m4) ×2]` → `g7k2` = `NO_WORK_SETS_LOGGED`, `q9m4` evaluates normally. Unattributed set (`null` key inside a grouped session) contributes to neither. |
| **A-6** | Unit (engine) | **The §5.5 matrix, all eight rows**, for both strategies, including the review's reproductions and the "first `min`, not best `min`" row; every record carries `workSets` = the window and `extraWorkSets` = the rest, with `prescribed.group` present. |
| A-7 | Unit (modifiers) | `setMultiplier 0.5` on `{min 2, max 3}` → `{1, 1}`; `targetRirShift +2` per group; Σ clamp. |
| **A-8** | Unit (carry-forward / working targets) | per-key candidate selection; **C-1**: a single-group scheme reads null-key history and its null-key pending record; **D-6 default**: a multi-group scheme's first group reads null-key history, other groups do not; group baseline before slot baseline. |
| **A-9** | Unit (pure card helpers + activeSession, fake-indexeddb) | `nextGroupSelection` and `groupPrefill` per the §11.4 table (mount derivation, advance at `max` only, warm-ups never advance, tap re-derives, return-to-prior-group restores that group's last load); **reload after a deliberately skipped top group** — Top has no sets, Back-off has two — selects Top and derives the inputs from Top's chain, never from Back-off's last set (pins the proposed mount behaviour; no persisted skip mechanism; rev. 3, V-5); `logSet` stamps the selected key; warm-up → `null`; per-key implicit decision (first `g7k2` work set decides only `g7k2`'s record); a pre-upgrade aggregate normalises `groupKey: null`. |
| A-10 | Unit (payloads) | `setLogFullRowOp` carries `groupKey` **only** for grouped slots, and `buildClientRecommendationOps`' `inputs` carries `prescribed.group` / `extraWorkSets` **only** for per-group records — an ungrouped set-log op **and** an ungrouped client-computed recommendation op are each byte-identical to today (negative control NC-9: diff each against its frozen pre-feature literal; rev. 3, V-1). |
| **A-11** | Unit (rollback) | new-build grouped `sessionExercise`, `setLog` and `recommendation` ops fail a frozen pre-feature schema (documented window); ungrouped ops pass; the test's comment records the L-5 consequence (whole slot absent server-side, ops retained locally for retry). |
| **A-12** | Integration (`gymapp_t_setgroups`) | fresh migrate + `drizzle-kit check` + seed twice; `uq_recs_one_pending` allows one pending per `(exercise, block, key)` and rejects a second (**must-execute** partial-index negative control); supersede is per key; the `SET_RENUMBER_CONCURRENCY_DATABASE_URL` gated suite passes on the migrated schema. |
| A-13 | Integration (sync) | key validated against the parent snapshot (`invalid_payload` otherwise); replay idempotent; a set moved between groups re-evaluates + supersedes **that group's** pending record; deletion renumbering preserves keys. |
| **A-13b** | Integration (sync + progression) | **M-3**: group A pending, group B decided implicitly this session; editing a set of group B (and separately of group A) on the completed source session re-evaluates only A; B's decided record stays the only record for B (no resurrected pending). A key whose record was superseded by a later session is never re-evaluated from the older slot. |
| A-14 | Integration (today) | bundle carries `groupPrefills` per key from per-key decisions/history (with the §5.6 bridge); `pendingRecommendations` per key, **filtered to keys in the current scheme** plus the null key mapped to the first group; `prefill` equals the first group's. |
| A-15 | Integration (progression) | two groups → two records with `group_key`; client-computed rec ops ahead of completion dedupe per `(slot, key)`; deload session → none. |
| A-16 | Integration (strength) | the e1RM report for a grouped session equals the report for the identical sets logged ungrouped (the tracker does not read keys). |
| **A-16b** | Unit (strength, current-behaviour pin) | `140×2 @2 + 110×7 @3 + 110×7 @2` → 158.67 with `TOP_SET_GOVERNS`, `SINGLE_SET_GROUP`, `MIXED_LOADS_IN_SESSION`, back-off group `isModal`; `160×2 @2 + 3 × 120×3 @3` → 144.00 with the top group `implausible`. Pinned so any change to §7's consequences is deliberate; the strength boundary test stays green. |
| **A-17** | E2E (`setGroups.spec.ts`, added to `test:e2e:offline`) | online start; the selection auto-advances only when Top reaches its `max`; **the weight input's value changes at that instant** and again on a tap back to Top; the optional third back-off logs without a chip change; two recommendation cards; per-group implicit acceptance; offline start from a cached bundle; reload/resume (including after a skipped Top: Top is re-selected with its own prefill, per A-9); cross-device adopt shows labelled sets; History shows labels and allows a group change. |

### 12.2 Regression risks (rev. 2)

| Risk | Where | Guard |
|---|---|---|
| Pooling regressions: a group's sets leaking into another group's evaluation or carry-forward | §5.3 keyed lookups | A-4/A-5/A-8, plus NC-5 (remove one key filter, watch A-5 fail) |
| Range semantics regress to "last recorded set gates" or to a cherry-picked window | §5.5 window | A-6 rows 2–4 and 5; NC-4a (window removed → row 2 holds for both strategies, row 3 for rep-progression only); NC-4b (best-`min` instead of first-`min` → row 5 progresses) — rev. 3, V-3 |
| Load carried across a group change | §11.4 | A-9, A-17; NC-8 |
| Raw `groups` scheme reaching a history entry (streak inflation) | §5.4 safety property | NC-7 (hand the raw scheme to one history entry → a completed session counts as a failure → the test's `decrease_load` expectation flips) |
| A decided group's recommendation resurrected on edit | §5.3 M-3 | A-13b; NC-6 |
| Conversion resets a slot's working load | §5.6 | A-8 |
| Old client starting a grouped session throws | §8 | operational: update clients first; the throw precedes the local commit; U-test that an *ungrouped* bundle still starts on the new build |
| Wire-shape drift for existing sets and for ungrouped client-computed recommendations | A-10 | frozen literal comparison of both ops (NC-9) |
| `uq_recs_one_pending` rebuild mis-coalesces; `set_logs` column change disturbs renumbering | migration | A-12 on a fresh DB **plus the gated set-renumber concurrency suite** (L-4) |
| Duplicate-slot behaviour (F-20) unchanged and still wrong: **one dead-lettered `recommendationDecision` op (`decision_conflict`) on the Sync issues screen after two slots of one exercise each log a first work set against a load-targeted pending recommendation** | out of scope | recorded with its symptom so a reader who hits it recognises it; not fixed |
| PI-013 "first work set" ambiguity | §7 | dependency note in PI-013 |
| `formatScheme` consumers (Today, History, card, unit-format wiring test) | UI | compile-time exhaustiveness + A-2 |

### 12.3 Negative controls (per agent-workflow §6) (rev. 2)

Must execute and report one line each (`control | command | expected | observed | restored=identical`),
with original bytes saved and restored, never `git checkout`:

| ID | Control | Must |
|---|---|---|
| NC-1 | Sync replay / idempotence (A-13, A-13b) | identical DB after two submissions |
| NC-2 | Supersession per key (A-12, A-15) | one pending per key |
| NC-3 | Partial unique index (`uq_recs_one_pending` rebuild) | a second pending row per `(exercise, block, key)` is rejected; the null-key slot still works |
| NC-4a | Window removal: pass **all** recorded sets to the projected context (rev. 3, V-3) | A-6 **row 2 flips to `hold` for both strategies** (`FINAL_SET_RIR_AT_LIMIT`); **row 3 flips to `hold` for rep-progression only** (`every()` sees the short set) — load-progression is unchanged because `repShortfall` still slices to the projected `sets.min`; rows 4 and 8 flip by the same two mechanisms (row 4 rep-progression only, row 8 both); rows 1, 5, 6 and 7 are unchanged — row 5 in particular is **not** exercised by this control |
| NC-4b | Best-`min` instead of first-`min`: select as the window the `sets.min` recorded sets with the highest reps (ties → highest RIR) rather than the first `sets.min` by set number (rev. 3, V-3) | A-6 **row 5 flips from `hold` to `increase_load` / `increase_reps`** — proves the "first `min`, not best `min`" rule discriminates; every other row is unchanged |
| NC-5 | Key-filter removal in one lookup | A-5 fails |
| NC-6 | `reevaluate` scope: evaluate all keys instead of pending ones | A-13b fails (a second record for B appears) |
| NC-7 | Projection safety: hand a raw `groups` scheme to one history entry | the streak test flips toward `decrease_load` |
| NC-8 | Remove the selection-change re-derivation | A-17's "weight changes at auto-advance" fails |
| NC-9 | Ungrouped-op byte identity for **both** the set-log op and the client-computed recommendation op (A-10), and the rollback window (A-11) (rev. 3, V-1) | each ungrouped payload equals its frozen pre-feature literal, key set included (no `groupKey`, no `prescribed.group`, no `extraWorkSets`); grouped payloads fail the frozen pre-feature schema |

Inspection-only: A-2, A-3's projection cases, A-7.

---

## 13. Decisions: owner intent, engineering recommendations, open product choices (rev. 2)

The review's numbering D-1…D-8 is kept. None is approved by this document. They fall into three kinds;
only the third kind needs the owner's deliberation. Routine details stay routine (§13.4) and are not
permission gates.

### 13.1 Follows from owner intent already stated — confirmation, not deliberation

| ID | What | Basis in the owner's own words | Position |
|---|---|---|---|
| D-2 | Per-group recommendation records (not A-lite) | "existing load/progression behavior independently per group" | **Per group.** A-lite does not deliver the sentence. |
| D-3 | Build order A then B | "compare A and B; recommend a first slice" | **A, then B, as build stages.** Whether they ship together or separately remains the owner's choice (§9.2); no usage waiting period is imposed (rev. 3, V-6). |

(D-1 moved to §13.3 in revision 3 — V-2: the backlog explicitly declines to preselect the schema and
logging-contract change it entails.)

### 13.2 Engineering recommendations — decided here unless the owner overrules

| ID | Question | Recommendation | What the athlete sees |
|---|---|---|---|
| D-7 | Range evaluation rule | **First-`min` window** (§5.5): the first `sets.min` sets gate; later sets are recorded, never gate; no strategy change, no version bump. Alternatives: "last recorded set gates" (the reproduced defect), or a per-strategy knob (config-schema and version cost, deferred). | Back-off 2–3: two good sets → "Recommended 112.5"; a hard or short third set changes nothing; a short *first* set → "Hold". |
| D-8 | Auto-advance rule | **Advance at `max`, re-derive the input row on every selection change** (§11.4). Alternatives: advance at `min` (rejected: silent load carry, tap-back for the optional set); tap-only (safe, one tap per boundary; one-line change if device acceptance prefers it). | After the top double the chip moves to Back-off **and the box now reads 112.5**; the optional third back-off is just Log; one more top set is one tap on Top. |
| C-1 | Single-group conversion | Rule, not a decision: the sole group is the slot; nothing resets (§5.6). | `5 × 5` → `2–3 × 5`: next workout prefills the same 100 kg and shows the same pending card. |

### 13.3 Genuinely open product choices — required before the stage that needs them

| ID | Stage | Question | Recommended default | Concrete examples of each choice |
|---|---|---|---|---|
| D-1 (rev. 3, V-2) | A | The backlog constrains this architecture in full as: *"Preserve snapshots, legacy prescriptions, offline/replay behavior and historical training facts; assess profile compatibility, recommendation/carry-forward identity and existing block modifiers. **No physical schema or logging-contract change is preselected; surface any conflict with the unchanged-logging constraint before implementation.**"* ([PI-012](../BACKLOG.md#pi-012)). The conflict is surfaced in §4.3: accept the physical schema and logging-contract change for explicit per-set attribution, or take ordinal set-number partitioning with §4.3's failure table as accepted behaviour? | **Accept** — an engineering recommendation, **not** owner approval: unchanged *logging* is achievable, unchanged *storage* is not (§4.3, reproduced by the review). Concrete impact of accepting: one migration (`drizzle/0014_*`), a nullable `set_logs.group_key` column, a nullable `recommendations.group_key` column, the `uq_recs_one_pending` rebuild, two additive sync payload keys (`setLog.groupKey`, `recommendation.groupKey`) and two per-group `inputs` keys, all emitted only for grouped slots (§5.4, §8). | Accept: on a bad day the athlete taps Back-off, logs, and Top shows "No work sets logged" — no wrong recommendation. Decline (ordinal): the first back-off is read as the top set and the app proposes 112.5 kg for a group whose working load was 140; a deleted top set turns the first back-off into a top set. |
| D-6 | A | When an existing slot becomes a **multi-group** scheme, does its ungrouped history go to the first group, to nobody, or does the editor ask? | **(a) First group**, symmetric in both directions (§5.6). | (a) Converted `5 × 5 @ 100 kg`: Top prefills 100 (the athlete types 140 once), Back-off starts from its baseline, the old pending card appears on Top. (b) Both groups blank or at baseline; all streaks restart; a conversion-time supersede hook becomes mandatory. (c) One extra question in the editor: "Which group continues this exercise's history?" |
| D-4 | B | Which link basis is offered: `performed`, `prescribed`, or both — and nearest or floor rounding? | **Both, editor pre-selects nothing; nearest rounding** (floor recorded as a legitimate preference). | `performed`: top set done at 145 → back-off proposes 116 → 115 (nearest 2.5) / 115 (floor). `prescribed`: top prefill 142.5 → back-off proposes 114 → 115 (nearest) / 112.5 (floor), and does **not** move if the athlete lifts 145. Either way the back-off group shows **no** Accept/Keep/Custom card (§6.3). |
| D-5 | B | Accept the fenced ADR-008 amendment: one backward hop to an earlier group of the same slot, no chains, no cross-slot, citing `perSet.loadOffset` as precedent. | **Accept, fenced as §6.5.** | Allowed: "Back-off = 80 % of Top". Rejected by the editor: "Back-off 2 = 90 % of Back-off 1 which is 80 % of Top", "= 80 % of the Squat's top". |

### 13.4 Routine defaults — applied without a gate (rev. 2: R-1/R-2/R-4/R-7 restated)

| ID | Default |
|---|---|
| R-1 | A set-count range is **completed at `min`** over the first-`min` window; extra sets never gate (§5.5). |
| R-2 | The **last window set's** RIR gates progression (the last mandatory set). |
| R-3 | `NO_WORK_SETS_LOGGED` per group; no new reason code. |
| R-4 | Auto-advance at `max`; every selection change re-derives the input row (§11.4). |
| R-5 | Warm-ups are never attributed; unattributed work sets inside a grouped session are excluded from every group. |
| R-6 | Per-group carry-forward chain: own key → (first group only) null-key history per §5.6 → group baseline → slot baseline → empty. |
| R-7 | A removed group's pending record is left in place and filtered at bundle assembly (§4.5). |
| R-8 | (B) `performed` reference = heaviest attributed work set of the reference group. |
| R-9 | (B) Missing reference → the linked group's own chain, with explanatory copy. |
| R-10 | (B) Nearest-step rounding via `roundToStepKg` unless D-4 selects floor. |
| R-11 | (B) Percent integer 10–100, no default, required when the mode is chosen. |
| R-12 | (B) Linked groups are `manual` (rule L-1). |
| R-13 | `groups` for `load_reps` only; 1–4 groups; labels ≤ 24 chars. |
| R-14 | Keys are generated tokens; labels are display only; a future template copy regenerates keys. |
| R-15 | `reevaluate` mode touches only still-pending group records (§5.3). |
| R-16 | Grouped slots of one exercise in two templates of a block progress on independent tracks (§4.5). |

---

## 14. Research implications — distinguished from engineering decisions (rev. 2: L-6, L-7 wording)

*This section summarises the companion research report
[set-groups-strength-evidence-research.md](set-groups-strength-evidence-research.md) and translates it
into representation, default and user-defined boundaries. Nothing in it changes an engineering decision
in §4–§13, which stand on the code and on the repository's existing evidence-honesty rules
(evidence-to-design.md rows 1–2, boundaries B9). See that report's own search date, scope and
classifications for the underlying claims; its revision 2 applies the review's L-6/L-7/L-8 corrections.*

### 14.1 What the evidence says (research report §1, §8, §9)

- **Direct evidence: none found by the bounded search** (research §3, §5.3 Ø-1/Ø-6). No controlled
  trial comparing a top-set + back-off structure against straight sets, against fixed percentage-of-1RM
  back-offs, or against any other set structure with 1RM outcomes in trained lifters was found. The
  nearest study (SG-E-01, Androulakis-Korakakis 2021, Study 3: 8 vs 8 male powerlifters,
  quasi-randomised, 6 weeks) shows that *adding* two triples at 80 % of a near-maximal single to that
  single alone produced a larger total gain, with volume and structure confounded (about seven times the
  repetitions per session, by the report's own count) and no straight-set arm. SG-E-04 (Helms 2018, 12
  national-level powerlifters) *uses* the owner's exact structure — a top set, an optional second top set,
  back-offs a few per cent below the performed top set with an RPE stop — but measures volume only. SG-E-09
  (Larsen 2021 systematic review) states that no RPE-stop-versus-fixed-volume study exists; nothing
  2021–2026 was found to change that.
- **Indirect evidence is real but does not converge on a design** (research §8 Q2): heavier loads favour
  1RM (registry EVIDENCE-009/010, unchanged); RIR-based load selection is at least as effective as
  percentage-of-1RM and possibly slightly better (SG-E-05 non-significant lean; SG-E-06 significant but
  unsupervised; SG-E-10 pooled MD 2.07 kg, p = 0.09; SG-E-11 ranking without credible squat pairwise
  effects); APRE (SG-E-07) — the only trial-tested "an earlier set's performance sets a later set's
  load" rule — is non-randomised with volume unmatched; mixing rep ranges across days equals a constant
  range (SG-E-12).
- **Practitioner rationale (the Tuchscherer manual, research §7).** Every inspected page was legible;
  the year is not printed anywhere and 2008 rests on one independent citation. Its RPE scale is
  RIR-anchored at 10 and 9 and a *band* ("2–4 reps left") at 8, with no half points (RTM p.15, PDF 9;
  the chart is RTM p.16, PDF 9). Its post-top-set work is a **fatigue stop** (stop when RPE drifts up at
  constant load, p.18–21) or a **fatigue percent** (a 3–10 % drop from the day's heaviest "initial" set,
  reached by working down or by one drop then repeats, stopping when the reduced load hits RPE 10 for
  the same reps, inside a time cap, p.55–58, PDF 29–30). **It is not a fixed "N sets at 80 %" rule**; its
  only fixed-drop pattern (wave loading, p.37) the author himself calls hit-or-miss. The manual's
  comparative claim that RPE beats percentages is governed by the mixed research above; its substantive
  stop rules have no outcome evidence for or against them (research §9).
- **Unresolved** (research §5.3): performed-top-set versus fixed-%1RM back-offs (Ø-1); any particular
  percentage (Ø-2); group or back-off counts (Ø-3); a cross-group progression rule (Ø-4); stop rules
  versus fixed set counts for 1RM (Ø-5).

### 14.2 Translation into this design

| Research conclusion | Engineering consequence here |
|---|---|
| Ordered RIR-banded groups with set-count ranges, independent or user-percentage-derived load on a *planned or performed* basis, and per-group progression are all legitimate to **represent** (research §11.1) | Confirms §4.2, §5.3 and §6.1 as representation; adds nothing the design lacked, removes nothing |
| A top group with a set-count range of 1–2 exists in practice (SG-E-04's "second top set if the RPE was too low") | Supports allowing ranges on **any** group (§4.3), which only explicit attribution makes unambiguous; the §5.5 window then gates on the first top set, with the optional second recorded |
| **No evidence-derived default** for the percentage, the basis, group counts, or a linking progression rule (research §11.2) | §6.4 stands: percent is user-entered, no default, no "recommended" copy; the one tested value (80 % of a near-max single, for triples at RPE ≈ 6–7) may appear only as a labelled example, and not in Stage A |
| A percentage-of-top-set rule and a RIR band are **two different prescriptions** that agree only under one of three published tables; individual scatter exceeds the gap between tables (research §10) | In Option B a linked group's derived load is a **first-set proposal**; the group's RIR band remains the athlete's target; when they disagree the athlete's typed load is the fact and nothing is "corrected" from the other (§6.2). Copy must not imply the two are equivalent. The same conclusion the e1RM research reached for load translation |
| RPE/fatigue **stop rules** are practised and volume-predictable but have no 1RM outcome evidence (Ø-5); RIR noise of ±1 rep means a stop keyed to "RPE hits 10" fires a rep early or late | A per-group stop rule is a legitimate *later* representation (user-defined threshold, off by default). **Not in Stage A or B**: it is a volume-autoregulation feature, not a set-group structure, and would be a strategy-adjacent module per OD-09's pattern (advisory, never auto-applied). A set-count *range* is the structural half of the same idea and is what Stage A delivers |
| The manual's RPE 8 is a 2–4-rep band, not a scalar | Reinforces the existing doctrine (progression-engine.md §3): per-group `targetRir` is a band; nothing maps an RPE value to one RIR |
| RIR-based load selection may be described as "at least as effective, possibly slightly better", never as proven superior (research §9 row 1) | Copy boundary for the builder and card (research §11.4): no text may claim that top-set/back-off structure, percentage-derived back-offs, or RIR-based selection improve outcomes; "a common way to structure heavy work" is the ceiling |
| PI-012's V1 (independent groups, no percentage derivation) is evidence-consistent; linked derivation is neither made necessary nor made wrong by anything found (research §1) | Confirms the A-then-B stage order (§9.2) on evidence grounds as well as engineering grounds, and confirms that no waiting period between the stages buys evidence |

### 14.3 Boundaries carried into the design

- **Represent, do not endorse.** Configurability is not superiority; the classification of every shipped
  behaviour stays `heuristic` / `user_defined` (evidence-to-design.md rows 1–2).
- **Nothing here enters the registry.** The research report adds no `EVIDENCE-` row; SG-E-01…17 are
  candidates only; several figures are marked "fetch-summary" and must be re-read at page locations before
  any promotion (research §12). This evaluation cites them only through that report.
- **The manual is not a specification.** Fatigue percents and fatigue stops are recorded as what the
  author's method actually is, so that no later design equates "fatigue percent" with "80 % back-offs".

---

## 15. Explicit exclusions (rev. 2: one line added)

- No true intra-set clusters, rest-pause, myo-reps or drop sets (§3); no implicit mini-set semantics.
- No exercise-specific logic anywhere; no new strategy; no strategy behaviour change; no version bump.
- No per-strategy "optional sets gate" knob in the first stages (§5.5); recorded as a possible later
  addition with its version cost.
- No mesocycle engine, no planned-progression content, no separate RPE system; RIR bands only.
- No cross-slot or cross-exercise references; no chains of links; no expression language.
- No default percentage; no "recommended" number in copy.
- No backfill of historical sets; no snapshot rewrite; no `v` bump.
- No change to the e1RM tracker, its gates, windows, plausibility band or reason codes (§7 records the
  existing consequences); no change to volume/metrics.
- No fix for duplicate-slot progression (F-20) — recorded as unchanged, with its symptom.
- No `reps`-profile or athletic-profile groups in the first stage.
- No implementation, scheduling or priority change; PI-012 stays outside the selected sequence until the owner moves it.

---

## 16. Required documentation changes at implementation time (not made here) (rev. 2: item 1)

1. `docs/architecture/prescription-model.md` §2 — add the `groups` variant; keep `perSet` **reserved**
   and reword its comment so that "top set + backoffs" is covered by `groups` while per-set variation
   remains `perSet`'s purpose (complements, not supersession; §4.1); §4 — per-group load fields and, for
   B, the `percentOfGroup` mode and its fence; §7 — the per-group RIR band relaxes "no per-set target
   RIR" to "per-group".
2. `docs/architecture/adr/ADR-008` — amendment for B's one-hop back-reference (D-5), with the fence and
   the `perSet.loadOffset` precedent cited.
3. `docs/architecture/domain-model.md` §7 — `SetLog` gains `groupKey`; §6 — snapshot gains
   `groupPrefills?` and `progression.groups?`.
4. `docs/architecture/data-model.md` §2.14/§2.15 — the two columns and the rebuilt index.
5. `docs/architecture/progression-engine.md` §2/§5/§6/§8 — per-group context, projection, the evaluation
   window, keyed uniqueness, re-evaluation scope, `inputs.prescribed.group` and `inputs.extraWorkSets`.
6. `docs/architecture/pwa-offline-strategy.md` §4/§5 — optional client keys; profile-scoped-style
   emission; the rollback consequence and retry path.
7. `docs/architecture/evidence-to-design.md` — a new row for Set Groups (representation is a product
   rule; any percentage is user-defined; no evidence tier claimed) citing §14.
8. `docs/BACKLOG.md` PI-012 — by the owner/closeout editor: link this evaluation, its review and the
   revision verification.

---

## 17. Not done, not claimed — and what was created (rev. 2)

- Not executed: any test, build, lint, migration, database query, or the app — in either revision. Every
  line reference is a read of the tree (`cb33264` for the first revision, `583a9ab` for this one); the
  review's reproductions are cited as its evidence, not re-run. The change-class evidence in §10 is what
  an *implementation* must produce.
- Not claimed: any measured performance, any training superiority of groups or of any percentage, any
  migration sufficiency beyond what §8 states as rules to be proven by A-11/A-12, and — for §7 — any
  owner acceptance of the recorded e1RM consequences.
- Not decided: D-1…D-8 (§13); PI-012's place in the roadmap.
- Created: this file only (rewritten in place for revision 2). The research companion received a bounded
  correction pass by a research agent limited to that file. Scratch: `git-status-*.txt` snapshots in the
  session scratchpad (outside the repository), used to confirm the working tree was unchanged apart from
  the Set Groups reports. Nothing to drop in the repository; no disposable database was created.

---

## 18. Revision 2 — finding-to-resolution mapping

Correction baseline: [set-groups-architecture-review.md](set-groups-architecture-review.md) §2 and §10.1.
Every finding is listed; "closed" means the design text now states the rule and the acceptance matrix
pins it; "disposed" means the documentation correction is made.

| Finding | Severity | Resolution | Where |
|---|---|---|---|
| H-1 range punishes the optional set | HIGH | **Closed.** Recorded sets vs evaluation window defined; first-`min` (by order, never best-`min`) stated with a pinning row; identical rule for both strategies via context slicing, no version bump; audit split into `workSets` (window) + `extraWorkSets`; trade-off of excluding optional sets stated; `sets.max` declared evaluation-free; the review's reproductions are rows 2–4 of the A-6 matrix; NC-4a/NC-4b (split in rev. 3). | §1 terminology, §4.2, §5.4, §5.5, §12.1 A-6, §12.3 NC-4a/NC-4b, §13.2 D-7, §15 |
| H-2 auto-advance moves the group, not the load | HIGH | **Closed.** Full input-state transition table (mount, work log, warm-up log, auto-advance, chip tap incl. prior group, typing/dirty, decisions, skipped top); unconditional re-derivation on every selection change from the group's own chain; advance at `max` compared with `min` and tap-only; optional sets stay one tap; A-9/A-17 and NC-8. | §11.2, §11.4, §12.1 A-9/A-17, §12.3 NC-8, §13.2 D-8 |
| M-1 e1RM premise wrong | MEDIUM | **Closed.** Back-off group is the modal anchor; top set admitted iff within the e1RM plausibility band, else implausible; both worked sessions with figures; the percentage threshold as labelled arithmetic; the permanent medium cap named; recorded as existing consequences of accepted rules, explicitly not owner-accepted, no policy change; A-16b pins current behaviour. F-16 corrected (e1RM ratio, not load ratio — also L-8). | §2 F-16, §7, §9.1, §12.1 A-16b, §15, §17 |
| M-2 conversion resets load/history | MEDIUM | **Closed.** C-1 rule for the single-group case (unambiguous, no reset, null-key pending surfaced); D-6 raised for multi-group with three options, concrete consequences, recommended default (a) applied symmetrically; pending-record handling for each option; A-8. | §5.3, §5.6, §12.1 A-8, §13.1–13.3 |
| M-3 re-evaluation reopens decisions | MEDIUM | **Closed.** `reevaluate` mode restricted to still-pending group records; decided and superseded keys never re-evaluated from an older slot; F-21 records the mechanism; A-13b; NC-6; R-15. | §2 F-21, §5.1, §5.3, §12.1 A-13b, §12.3 NC-6, §13.4 R-15 |
| M-4 `perSet` omitted | MEDIUM | **Closed.** Three-column comparison (R1/R2/R3); `perSet` cannot express a range and is positional; `groups` and `perSet` are complements; `perSet` stays reserved and unsuperseded; its `loadOffset` cited as precedent for B's placement; §16 item 1 reworded. | §2 F-19, §4.1, §6.5, §9.1, §16 |
| L-1 duplicate-slot claim bounds | LOW | **Disposed.** Conditions (a)–(d), the non-blocking dead-letter effect, and "sets sync normally" stated. | §5.2, §12.2 |
| L-2 key scope | LOW | **Disposed.** Two-template split rule and its asymmetry; no copy operation exists, forward regenerate-keys constraint; removed-group filter at bundle assembly (server) with client defence; R-14/R-16. | §4.5, §10 item 16/19, §13.4 |
| L-3 manifest / config / degradation | LOW | **Disposed.** `evaluationTarget.ts` per-key overlay; `defaultConfigFor` exhaustive; per-group config resolution and classification; slot-level `repCap` forbidden on `groups`, per-group `repCap` required for fixed-rep rep-progression groups (F-23); cached-bundle offline degradation stated; A-3 extended. | §2 F-23, §5.3, §10 items 3/4/9/11, §12.1 A-3 |
| L-4 E-level gate | LOW | **Disposed.** Set-renumber gated concurrency suite required at R and E; partial-index rebuild is a must-execute negative control; §12.2 row corrected. | §10 change class, §12.1 A-12, §12.2, §12.3 NC-3 |
| L-5 rollback loses the slot | LOW | **Disposed.** Whole grouped slot absent server-side (`invalid_payload` then `not_found`); local ops retained with payloads, listed on Sync issues, retryable unaltered in FIFO order after roll-forward; local aggregate gone at completion; completion drop-confirmation named; operational rule; A-11 records it. | §2 F-24, §8, §12.1 A-11, §16 item 6 |
| L-6 research framing | LOW | **Disposed.** Bounded wording here ("none found by the bounded search"); the research report's own two sentences corrected by the delegated research agent. | §14.1; research §1/§8, §15 |
| L-7 scan page citations | LOW | **Disposed.** PDF 9 for printed 15–16 here; corrected in the research report by the delegated agent after re-checking pages 8–9. | §14.1; research §7.3/§7.4, §15 |
| L-8 precision | LOW | **Disposed.** F-16/§7 wording carries the e1RM-ratio distinction; "≈ 600 %" relabelled as report arithmetic (here as "about seven times the repetitions … by the report's own count"; in the research report by the agent); the duplicate-slot risk names its symptom. | §2 F-16, §7, §12.2, §14.1 |
| Delivery baseline (PI-018) | — | **Applied.** Tree `583a9ab`; PI-018 committed `7fb7c0b`, deployed and iPhone-accepted 2026-09-12; collision resolved; sequencing text replaced. | header, §0, §1, §2 F-11/F-18, §8, §10 |
| A/B as stages, no waiting period | — | **Applied.** Build stages, decided on D-5, no use-gating, packaging left to the owner. | §0, §9.2, §13.1 D-3 |
| Owner decisions restructured | — | **Applied.** Owner intent (D-2, D-3) / engineering recommendations (D-7, D-8, C-1) / open product choices (D-1, D-6, D-4, D-5) with concrete examples; routine defaults kept routine. (D-1 reclassified in rev. 3.) | §13 |

### 18.2 Revision 3 — residual corrections from the revision verification

Correction baseline: [set-groups-architecture-revision-verification.md](set-groups-architecture-revision-verification.md)
§5. The architecture is verified there; nothing below reopens H-1/H-2 or M-1…M-4, and no scope is added.

| Residual | Severity | Resolution | Where |
|---|---|---|---|
| V-1 `extraWorkSets` had no emission rule for ungrouped records | MEDIUM | **Closed.** Both `prescribed.group` and `extraWorkSets` are omitted entirely (not `undefined`, not `[]`) from ungrouped records; the §8 rollback proviso names all four grouped-only keys; §9.1's sync row and manifest items 11/12 reconciled; A-10 and NC-9 now cover the ungrouped client-computed recommendation op as well as the set-log op; §12.2 wire-drift row widened. | §5.4 (emission rule), §5.5 (audit paragraph and matrix footer), §8 (rolled-back server row), §9.1 (sync contract row), §10 items 11–12, §12.1 A-10, §12.2, §12.3 NC-9 |
| V-2 D-1 misclassified as settled owner intent | MEDIUM | **Closed.** D-1 moved from §13.1 to §13.3 as a genuinely open choice required before Stage A; the backlog constraint quoted in full, including "No physical schema or logging-contract change is preselected"; "Accept" kept as an engineering recommendation with the concrete storage/wire impact and one example per choice; no owner approval implied; §13.1 holds D-2 and D-3 only. | §13.1 (D-1 removed, note), §13.3 (D-1 row), §18 "Owner decisions restructured" row |
| V-3 NC-4 expected observations wrong in two rows | LOW | **Closed.** NC-4 split into NC-4a (window removed → row 2 holds for both strategies, row 3 for rep-progression only; rows 4/8 by the same mechanisms; rows 1/5/6/7 unchanged) and NC-4b (best-`min` instead of first-`min` → row 5 progresses); §12.2 and §18 references reconciled. | §12.3 NC-4a/NC-4b, §12.2 range row, §18 H-1 row |
| V-4 two threshold percentages misrounded | LOW | **Closed.** Recomputed from the stated formula with the intermediate quotients shown, one decimal, rounded half up: 72.6 %, 74.6 %, 69.1 %, 78.7 %; arithmetic-only status retained. | §7 (interaction bullet) |
| V-5 mount derivation after a skipped top group unpinned | LOW | **Closed.** §11.4's mount row states that a reload after a deliberately skipped Top re-selects Top with Top's own prefill, no mis-attribution, no persisted skip mechanism; A-9 gains the assertion; A-17's reload clause references it. | §11.4 (mount row), §12.1 A-9, A-17 |
| V-6 D-3 wording read as a packaging decision | LOW | **Closed.** D-3 restated as build stages with packaging the owner's choice and no usage waiting period; §0 item 6 and §9.2's opening sentence aligned ("build stages", packaging the owner's choice). | §0 item 6, §9.2, §13.1 D-3, §18 "A/B as stages" row |

READY FOR TARGETED SET GROUPS RESIDUAL VERIFICATION

## 19. Owner decisions — accepted 2026-09-12

After [revision 3 verification](set-groups-architecture-revision-verification-2.md),
the owner explicitly accepted D-1…D-6 as below. This addendum governs wherever
the earlier proposal leaves these choices open or recommends both link bases.

| Decision | Accepted choice |
|---|---|
| D-1 | Accept explicit stored per-set attribution: nullable group keys on set logs and recommendations, the pending-recommendation index rebuild, and the reviewed grouped-only sync/input fields. Keep the familiar logging interaction. |
| D-2 | Independent groups use their own progression/recommendations. Linked back-offs derive load from the reference group without competing independent load recommendations. |
| D-3 | Implement and verify A (groups) first, then B (links); publish A+B together. No intervening usage waiting period. |
| D-4 | V1 offers **performed only**, not prescribed: use the highest logged work-set load of the reference group. The percentage is user-entered with no default; round to the nearest available load step. Manual deviations are allowed. |
| D-5 | Permit one backward reference to an earlier, itself unlinked group in the same exercise slot; no chains or cycles. Adopt the bounded ADR-008 amendment during implementation. |
| D-6 | On multi-group conversion, bridge prior ungrouped history/carry-forward to the first group using the reviewed symmetric rule; other groups receive no automatic legacy-history attribution. Historical rows are not rewritten. |

D-4 narrows the reviewed two-basis proposal: omit the prescribed-basis editor
choice, resolution path and its tests from V1. Retain the performed-basis edge
cases and meaningful acceptance coverage; reconcile the Stage B manifest with
this decision before implementing it. This narrowing does not affect Stage A.

An in-session load override does not change the saved percentage. Subsequent
back-off sets retain the athlete's last entered load through copy-forward;
logged facts are never retroactively rewritten by reference-set edits.
The percentage links weight only, not an RIR-adjusted estimate.

The reviewed D-7/D-8/C-1 rules remain: first-min evaluation window, advance at
max with group-specific input derivation, and continuity for single-group
conversion. Approval here settles product/schema choices and release packaging;
it does not authorize production migration, commit, push or deployment.

OWNER DECISIONS RECORDED — READY FOR STAGE A IMPLEMENTATION HANDOFF
