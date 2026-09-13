# Set Groups (PI-012) — independent architecture review

**Date:** 2026-09-12
**Tree:** `cb33264` (dirty — the pre-existing concurrent work listed in the two author reports'
headers, unchanged by this task: `CLAUDE.md`, `HANDOFF.md` (deleted), `README.md`,
`docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/architecture/{domain-model,prescription-model,pwa-offline-strategy}.md`,
`docs/evidence/*`, `docs/research-notes/*`, `package.json`, `playwright.config.ts`, the in-flight
PI-018 source/test edits (`src/domain/measurement/format.ts`, `src/domain/schemas/prescriptionSnapshot.ts`,
`src/server/today/service.ts`, `src/sync/activeSession.ts`, `src/sync/types.ts`,
`src/ui/workout/ExerciseCard.tsx`, `tests/e2e/seed.ts`, `tests/integration/*`, `tests/unit/*`), and the
untracked `.claude/skills/`, `docs/process/`, `docs/reviews/*.md`, `gpt-*.md`, `HANDOFF(depracted).md`,
the Tuchscherer PDF, and the three new PI-018 test files)
**Role:** independent review (architecture evaluation + research companion; no implementation)
**Session:** `O5 | PI-012 | Independent review — Set Groups architecture`
**Model:** claude-opus-5 (1M context)
**Task/gate:** [PI-012](../BACKLOG.md#pi-012) — independent review of
[set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) and
[set-groups-strength-evidence-research.md](set-groups-strength-evidence-research.md).
No D-1…D-5 decision is approved by this review.
**Authorization boundary:** none of commit / push / deploy / staging / production / production
database. No implementation. Local disposable unit-test resources were authorized and used
(§9.1); they were created inside `tests/unit/`, run, and deleted. No database was opened.
**Files touched:** this file only
**Verdict:** REVISION REQUIRED (see §10)
**Cites:** [set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) §2–§16;
[set-groups-strength-evidence-research.md](set-groups-strength-evidence-research.md) §1–§14;
[agent-workflow.md](../process/agent-workflow.md) §5/§6/§8;
[prescription-model.md](../architecture/prescription-model.md) §1/§2/§4;
[ADR-008](../architecture/adr/ADR-008-prescription-representation.md);
[estimated-1rm-load-translation-architecture-revision.md](estimated-1rm-load-translation-architecture-revision.md) §6.2/§7;
[workout-prescription-context-implementation.md](workout-prescription-context-implementation.md) (in-flight PI-018);
[post-p10-roadmap-evaluation.md](post-p10-roadmap-evaluation.md) §Architectural constraints.

---

## 0. Summary

The evaluation is a strong piece of work. Its central architectural judgement — **one slot, an
additive `groups` scheme variant, with a stored per-set group key** — is correct, and I verified
every load-bearing current-model finding (F-1…F-20) against the tree; all twenty hold. The
research companion is honest, well-bounded, and its one design-relevant table (§10, percentage
vs RIR band) is arithmetically sound and was verified against the primary source page by page.

It is not yet implementable as written. Six defects need correction, of which two are genuine
design defects rather than documentation gaps:

- **H-1** — the proposed set-count-range semantics make performing the optional extra set of a
  `2–3` group *strictly punishing*. Reproduced: the same two sets that progress, plus a third,
  hold. This contradicts the owner's explicit requirement that a 2–3-set group "must make
  performing the third set straightforward".
- **H-2** — the proposed auto-advance (R-4) moves the group selection without moving the load in
  the input box, and the card's copy-forward rule guarantees the box still holds the *top-set*
  load. One tap then logs a back-off at the top-set weight, correctly attributed and wrong.
- **M-1** — §7's e1RM analysis rests on a false premise. In the exact structure PI-012 targets,
  the back-off group is the **modal anchor**, not a sub-modal exclusion. The conclusion ("no
  e1RM change required") survives; the reasoning does not, and the real interaction —
  a deep enough back-off silently *excludes the top set* from the estimate — is unexamined.
  Reproduced.
- **M-2** — R-6 (no legacy carry-forward bridge) silently resets load and history for any
  existing exercise converted to a groups scheme. For the single-group case the mapping is
  unambiguous and the reset is a defect, not a default.
- **M-3** — per-group re-evaluation can re-open a decision the athlete already made this
  session, because `reevaluateForSourceSessionExercise` gates on "any pending record from this
  slot" and `assembleAndEvaluate` then evaluates the whole slot.
- **M-4** — the minimality case omits the one candidate the architecture already reserves for
  this exact purpose: `perSet`, whose reserved shape is documented as "also covers top set +
  backoffs" and already carries `percentOfTop`.

The duplicate-slot decision conflict the evaluation uses to reject R1 (two slots) is **real and
reproduced**, with tighter bounds than the evaluation states (§4). Its use as the reason to
reject R1 stands.

Recommended first delivery scope is in §8: **Option A only, single-group schemes included, with
H-1/H-2/M-2 corrected first**, and B recommended *for the same release only if* the ADR-008
amendment is taken up front — not because B needs a waiting period, but because B's fence is a
policy decision that is cheaper to write once than to retrofit (§8.2).

---

## 1. What I verified, and how

Every claim below marked **VERIFIED** was read in the working tree at `cb33264` plus the
uncommitted PI-018 edits, at the file and line cited. Claims marked **REPRODUCED** were executed
against the real production modules in a disposable unit-test file (§9.1).

### 1.1 The evaluation's current-model findings (F-1…F-20)

| # | Verdict | Note |
|---|---|---|
| F-1 | **VERIFIED** | [`setScheme.ts:21,27,51-57`](../../src/domain/schemes/setScheme.ts#L51) — four members, `sets` an int 1–20 on every one, `z.discriminatedUnion("type", …)`. `perSet`/`fixedPlusAmrap` are absent from `SCHEME_TYPES`. |
| F-2 | **VERIFIED** | [`setLogs.ts:42-57`](../../src/db/schema/setLogs.ts#L42) — exactly the ten columns claimed, no other classifier. [`setNumbering.ts:3`](../../src/domain/sync/setNumbering.ts#L3): "`set_number` is user-visible ordering …, not an identity." |
| F-3 | **VERIFIED** | [`loadProgression.ts:53-60`](../../src/domain/progression/loadProgression.ts#L53) `sets.length >= scheme.sets && repShortfall(sets, scheme.sets, …) <= tolerance`; `repShortfall` slices to the first `prescribedSets`. [`repProgression.ts:111`](../../src/domain/progression/repProgression.ts#L111) `sets.length >= scheme.sets && sets.every(s => s.reps >= currentTarget)`. Final-set RIR at `loadProgression.ts:123`. |
| F-4 | **VERIFIED** | `modalWorkingLoad` in [`loadHelpers.ts`](../../src/domain/progression/loadHelpers.ts); `capForMixedLoads` caps high→medium. |
| F-5 | **VERIFIED** | [`recommendations.ts:71-76`](../../src/db/schema/recommendations.ts#L71) — `uq_recs_one_pending` on `(exercise_id, coalesce(block_id, zero-uuid))` WHERE pending. Bundle lookups keyed by `exerciseId` at [`today/service.ts:589,592,606`](../../src/server/today/service.ts#L589). |
| F-6 | **VERIFIED** | [`progression/service.ts:176-202`](../../src/server/progression/service.ts#L176) — selects `session_exercises` by `exercise_id`, `order by started_at desc limit ENGINE_HISTORY_CAP`. Two slots in one past session ⇒ two entries, equal `startedAt`, both against the cap. |
| F-7 | **VERIFIED** | [`today/service.ts:330-338`](../../src/server/today/service.ts#L330) `toCarryForwardCandidate` takes `sets.find(s => !s.isWarmup)`; [`carryForward.ts:24-32`](../../src/domain/progression/carryForward.ts#L24). Called per prescription row with the same `exerciseId`. |
| F-8 | **VERIFIED** | [`progression/service.ts:326-333`](../../src/server/progression/service.ts#L326) dedupe by `sourceSessionExerciseId`, `initial` mode only; [`:391-392`](../../src/server/progression/service.ts#L391) `supersedePending(...)` inside the per-result loop, before each insert. |
| F-9 | **VERIFIED** | [`activeSession.ts:362`](../../src/sync/activeSession.ts#L362) each slot takes its own copy of `entry.pendingRecommendation`; [`:606-626`](../../src/sync/activeSession.ts#L606) first work set → `resolveImplicitDecision`; [`implicitDecision.ts:33`](../../src/domain/progression/implicitDecision.ts#L33) returns `null` without `target.loadKg`. |
| F-10 | **VERIFIED** | [`activeSession.ts:813`](../../src/sync/activeSession.ts#L813) `bundleEntries.set(entry.exerciseId, entry)`. |
| F-11 | **VERIFIED** | [`prescriptionSnapshot.ts:22,55,84`](../../src/domain/schemas/prescriptionSnapshot.ts#L22) — `v = 1`; `measurement` and `prescriptionNotes` are both additive-optional with no upgrader. |
| F-12 | **VERIFIED** | [`applyWeekModifiers.ts:17-21,27-34,41-48`](../../src/domain/prescriptions/applyWeekModifiers.ts#L17). Note `applySetMultiplier` reads `scheme.sets` directly — a `groups` member without a top-level `sets` makes this a **compile error**, which is the desired failure mode (§3.3). |
| F-13 | **VERIFIED** | [`recommendation.ts:37-42,56-77`](../../src/domain/schemas/recommendation.ts#L37) — `recommendationTargetSchema`, `performedSetSchema`, `inputsSummarySchema` and its `prescribed`/`derived` objects are all `.strict()`. |
| F-14 | **VERIFIED** | [`sync/schema.ts:93-112,115-134,147+`](../../src/domain/sync/schema.ts#L93) — `sessionExercise`, `setLog`, `recommendation` payloads all `.strict()`; `prescription` parses through the non-strict `prescriptionSnapshotSchema`, whose `scheme` is a discriminated union (unknown `type` ⇒ parse failure, not key-stripping). |
| F-15 | **VERIFIED** | [`compatibility.ts:14-21`](../../src/domain/measurement/compatibility.ts#L14). |
| F-16 | **VERIFIED, with one imprecision** | [`observation.ts:186-196`](../../src/domain/strength/observation.ts#L186) — sub-modal exclusion is by **load**; the 1.20× plausibility ceiling is on **e1RM**, not load (`ceiling = modal.e1rmKg * PLAUSIBILITY_FACTOR`). F-16's "admitted within 1.20×" reads as a load ratio; it is not. Merge order verified at [`strength/service.ts:119-124`](../../src/server/strength/service.ts#L119). See M-1. |
| F-17 | **VERIFIED** | [`volume/aggregate.ts`](../../src/domain/volume/aggregate.ts) — one row per (set, contribution); no scheme read anywhere. |
| F-18 | **VERIFIED** | [`HistoryDetail.tsx:162,438`](../../src/ui/history/HistoryDetail.tsx#L162); [`ExerciseCard.tsx:333,411,423,446`](../../src/ui/workout/ExerciseCard.tsx#L333). |
| F-19 | **VERIFIED verbatim** | [prescription-model.md:15](../architecture/prescription-model.md) "no expressions, no conditionals, no references between fields … This is the anti-DSL boundary"; [:89](../architecture/prescription-model.md) "Percentage-based loading is **not** a scheme variant — it is a load prescription mode (§4)"; [ADR-008:14](../architecture/adr/ADR-008-prescription-representation.md) same line. |
| F-20 | **VERIFIED verbatim** | [post-p10-roadmap-evaluation.md:89](post-p10-roadmap-evaluation.md). |

### 1.2 Architectural claims that hold

1. **No group concept exists at any layer.** Confirmed at schema, domain, server, sync and UI.
2. **Duplicate slots are a supported storage shape and a broken progression shape.** Confirmed,
   and reproduced (§4). The code itself records the storage half:
   [`today/service.ts:618-624`](../../src/server/today/service.ts#L618) documents "two slots of
   the same exercise in one template" as a deliberate PI-018 behaviour (C-6).
3. **An ordinal set-number partition is insufficient.** The skipped-top-set row of §4.3 is the
   decisive one and it is correct: with no stored classifier, "no top set today" is
   unrepresentable, and the consequence is a wrong recommendation for the group that matters
   most. The deletion row is also correct — [`setNumbering.ts`](../../src/domain/sync/setNumbering.ts)
   renumbers survivors to a contiguous `1..n`, so an ordinal rule re-classifies sets on delete.
4. **A stored per-set classifier is the repository's own precedent.** `is_warmup` is exactly
   that, and the e1RM revision demoted load-based warm-up inference to defence-in-depth. Sound.
5. **The `groups` variant needs no migration of existing scheme JSONB.** Verified: neither
   `exercise_prescriptions.scheme` nor `session_exercises.prescription` carries a DB CHECK on
   shape ([`exercisePrescriptions.ts:43,56-57`](../../src/db/schema/exercisePrescriptions.ts#L43),
   [`sessionExercises.ts:55,67-76`](../../src/db/schema/sessionExercises.ts#L55)).
6. **Volume and the metrics dashboard need no change.** Verified (F-17). A set in a group is a set.
7. **Strategies need no modification and `STRATEGY_VERSIONS` need not bump.** The projection is
   sound *as a mechanism*: both strategies consume only `scheme.sets`, the reps accessor, the
   band, `prefill.reps` and the work-set array. Running an unchanged function on a projected
   context is not a behaviour change to the function. What the evaluation gets wrong is not the
   mechanism but the *effective semantics* it produces for ranges (H-1) — see §5.
8. **Old client × new bundle fails cleanly.** Better than the evaluation claims: `startSession`
   builds every op *before* `commitSessionMutation`
   ([`activeSession.ts:404-408`](../../src/sync/activeSession.ts#L404)), so the throw leaves no
   orphaned local session. Worth stating, because "Start workout throws" otherwise reads as a
   possible corruption.
9. **The change class is schema/migration *and* sync-contract.** Verified against the matrix at
   [agent-workflow.md §5](../process/agent-workflow.md#5-evidence-levels-and-the-change-class-matrix).
   One correction, L-4 below.
10. **PI-018 must land first.** Verified: PI-018 currently edits
    `prescriptionSnapshot.ts`, `today/service.ts`, `activeSession.ts`, `types.ts` and
    `ExerciseCard.tsx` — five of the evaluation's manifest files — and is at
    `READY FOR INDEPENDENT PI-018 IMPLEMENTATION REVIEW`.

---

## 2. Severity-ranked findings

Severity: **HIGH** = would ship wrong behaviour or make the feature unusable as specified;
**MEDIUM** = wrong reasoning, missing rule, or a gap that will surface during implementation;
**LOW** = accuracy or completeness. "Design defect" vs "optional preference" is stated on each.

### H-1 — A set-count range punishes the optional set (design defect)

**Where:** evaluation §5.5, routine defaults R-1/R-2; owner requirement in the review brief
("A 2–3-set group must make performing the third set straightforward").

**Claim under review:** "Completed: at least `sets.min` attributed work sets … **Extra sets**
(beyond `sets.min` …): never add shortfall; they *do* supply the final-set RIR … Doing only the
minimum completes the range by definition."

**What actually happens** (REPRODUCED against `evaluateLoadProgression` / `evaluateRepProgression`
with the evaluation's own projection `{type:"repRange", sets:2, minReps:6, maxReps:8}` and
stock configs):

| Performed | load-progression | rep-progression |
|---|---|---|
| `110×7 @3`, `110×7 @2` | `increase_load` | `increase_reps` |
| …plus `110×6 @0` (a hard third set) | **`hold`** (`FINAL_SET_RIR_AT_LIMIT`) | — |
| …plus `110×5 @1` (a third set short of target) | — | **`hold`** (`TARGET_REPS_NOT_REACHED_ALL_SETS`) |
| …plus `110×1 @3` (a collapse, reps only) | `increase_load` (extra reps never add shortfall) | — |

Two independent mechanisms produce this:

- **R-2 + `holdAtRirZero`.** The RIR gate reads `sets[sets.length - 1]`
  ([`loadProgression.ts:123`](../../src/domain/progression/loadProgression.ts#L123)). The
  optional third set *is* the last set, and it is the one most likely to be at RIR 0 — that is
  why it was optional. Default config is `progressRirGate {min:1,max:10}`, `holdAtRirZero: true`
  ([`registry.ts:22,29`](../../src/domain/progression/registry.ts#L22)).
- **rep-progression's `every()`.** `sets.every(s => s.reps >= currentTarget)`
  ([`repProgression.ts:111`](../../src/domain/progression/repProgression.ts#L111)) is over **all**
  attributed sets, not the first `sets.min`. The evaluation's §5.5 bullet "Extra sets … never add
  shortfall" is true only for load-progression; for rep-progression an extra set is a full veto.

This is not a pre-existing behaviour carried forward. Today an extra set is an *unprescribed*
act. Under Set Groups, `2–3` is the prescription — the app invites the third set and then
penalises it. Doing the minimum can only help; doing the maximum can only hurt or tie. That
inverts the meaning of the range and is the opposite of the owner's stated requirement.

**Required correction.** Decide and specify the range's evaluation window explicitly, and state
it for *both* strategies. The defensible rules, in my order of preference:

1. **Best-`min` window.** Evaluate completion and the RIR gate over the athlete's *first*
   `sets.min` attributed sets only; sets beyond `min` are recorded facts that never gate.
   Simple, symmetric across both strategies, and makes "doing more" strictly neutral. Costs a
   change to which set supplies `finalSetRir` — which is a strategy behaviour change and
   therefore **does** bump `STRATEGY_VERSIONS`, unless implemented by passing only the first
   `min` sets into the projected context and carrying the rest in
   `inputs.workSets` (which keeps the strategies byte-identical; this is the version-preserving
   route and should be preferred).
2. **Gate on the last set within `min`, veto never.** Same as (1) for load-progression; for
   rep-progression, restrict `every()` to the first `min` sets by the same context-slicing trick.
3. **Owner-visible knob** (`rangeExtraSetsGate: "ignore" | "gate"`), defaulting to `ignore`.
   Only if the owner wants the strict reading available.

Whichever is chosen, the acceptance criteria must include the three rows of the table above as
a pinned matrix. §12.1's A-6 currently asserts only that four sets "complete and the 4th set's
RIR gates" — i.e. it pins the defect.

**Not an optional preference.** The owner stated the requirement; the current specification fails it.

### H-2 — Auto-advance changes the group but not the load (design defect)

**Where:** evaluation §11.2 and routine default R-4 ("advances to the next group when the
current one reaches its `min`").

**What the card actually does.** `ExerciseCard` holds one `weight`/`reps` pair of React state.
After `handleLogSet`, **only RIR clears**
([`ExerciseCard.tsx:281-287`](../../src/ui/workout/ExerciseCard.tsx#L281)):

> "Every other field is left exactly as typed, which IS the carry-forward — the athlete's own
> last entry stays in the box for the next round/set."

So immediately after the top set at 140 kg, the box still reads `140`. R-4 then silently moves
the chip to "Back-off". The very next `[Log set]` writes **140 kg, attributed to the back-off
group** — a correctly attributed wrong fact, which then anchors that group's carry-forward, its
e1RM load group, and its next recommendation. The mock in §11.2 hides this by showing `112.5`
already in the box with no rule that put it there.

**Required correction.** Specify that changing the selected group — by auto-advance *or* by tap —
re-derives the input row from that group's own resolution chain (group prefill → derived link
value under B → last set logged *in that group* this session), and that it must not re-derive
once the athlete has typed into the box for the newly selected group. Add an E2E assertion to
A-17 that the weight input changes value at the moment of auto-advance. Consider making the
first advance require the tap (R-4 becomes "highlight the next group, do not select it"),
which removes the class of error entirely at the cost of one tap per group boundary.

**Not an optional preference.** Silent mis-attribution of load is the failure mode the whole
stored-key design exists to prevent.

### M-1 — §7's e1RM analysis has a false premise (design reasoning defect; conclusion survives)

**Where:** evaluation §7, first bullet: "A back-off group at 80 % is sub-modal → excluded from
the session value by V-7 (`SUB_MODAL_SETS_EXCLUDED`). That is the tracker's deliberate rule."

**Why it is wrong.** The modal group is the one with the **most sets**, ties to the heaviest
([`observation.ts:190-196`](../../src/domain/strength/observation.ts#L190)). In a top set + 2–3
back-offs, the back-off group has more sets. **The back-off group is the modal anchor**, and it
is `admitted`; the top set is the *supra-modal* group, admitted only if its e1RM is within
`PLAUSIBILITY_FACTOR` (1.20) of the **back-off group's** e1RM.

REPRODUCED against `buildObservation`:

| Session | Modal | Top-set status | Session e1RM |
|---|---|---|---|
| `140×2 @2`, `110×7 @3`, `110×7 @2` | **110** (back-off) | `admitted`, governing | top set's; flags `TOP_SET_GOVERNS` + `SINGLE_SET_GROUP` + `MIXED_LOADS_IN_SESSION` |
| `160×2 @2`, `120×3 @3` ×3 | **120** (back-off) | **`implausible`** | **144.00 — the back-off's.** The heaviest, most informative set is dropped. |

**The real, unexamined interaction.** Because the back-off group sets the ceiling, the back-off
*percentage* — precisely the number Option B lets the user choose — decides whether the top set
enters the strength trend at all. A deeper drop, or a back-off at a tighter rep/RIR combination,
pushes the top set past `1.20 × e1RM(back-off)` and silently excludes it. Nothing warns the
athlete; the number simply stops tracking the heavy work.

A second consequence, understated rather than wrong: every grouped session carries
`MIXED_LOADS_IN_SESSION` **and** `TOP_SET_GOVERNS` **and** (for a single top set)
`SINGLE_SET_GROUP`, all three of which are in `CONFIDENCE_CAPPING_FLAGS`
([`estimate.ts:38-45`](../../src/domain/strength/estimate.ts#L38)). Adopting Set Groups as the
normal way to program therefore means **the e1RM confidence is permanently capped at medium**
for that exercise, not occasionally. PI-013 is deferred, but any future gate on confidence
inherits this.

**Required correction.** Rewrite §7's first two bullets to state the actual classification;
record the exclusion interaction as a named, accepted consequence (with the worked figures
above); and state the permanent medium-confidence cap explicitly. The bottom line —
`src/domain/strength/**` needs no change, and the tracker must not read `groupKey` — is correct
and I endorse it. Do **not** "fix" the tracker for this; the fix, if ever wanted, belongs to
PI-013's design, not here.

### M-2 — R-6 silently resets an existing exercise's load and history on conversion (design defect for the unambiguous case)

**Where:** evaluation §5.3 (carry-forward row) and routine default R-6: "**No legacy bridge**
from ungrouped history; per-group baseline → slot baseline → empty."

**Consequence.** `resolveCarryForwardLoadKg` filtered to a group key finds no candidates in any
pre-conversion session, so the chain falls to `baselineLoadKg`
([`carryForward.ts:29-32`](../../src/domain/progression/carryForward.ts#L29)) — an authoring-time
field that on a long-lived slot is stale or null — and otherwise to *empty*. Likewise the
per-key history is empty, so `failStreak` logic and `INSUFFICIENT_HISTORY` reset. The owner's own
example, Trap Bar Deadlift, is an existing exercise with history. And the evaluation explicitly
promotes single-group schemes as the way to express "2–3 × 5" on an *ordinary* slot (§4.2) —
which means the most common path into this feature is precisely the path that wipes the slot's
working load.

The pending recommendation is orphaned too: the slot's existing `group_key IS NULL` pending
record is never matched by a keyed lookup and never superseded (same class as R-7).

**Required correction.**

- For a **single-group** scheme the mapping is unambiguous: the sole group *is* the slot.
  Ungrouped history and the null-key pending record must bridge to it. Not bridging here is a
  defect, not a default.
- For a **multi-group** scheme the mapping is genuinely ambiguous and is an owner decision
  (add as **D-6**, §7). My recommendation: bridge ungrouped history to the **first** group, for
  the same reason the evaluation already keeps `prefill` = the first group's values — one rule,
  applied consistently, and it matches what the athlete was actually doing (one undifferentiated
  block of work). Every other group starts empty, as R-6 says.
- Either way, state what happens to the orphaned null-key pending record on conversion
  (supersede it at conversion time is the clean answer, and it is a one-line server change).

### M-3 — Per-group re-evaluation can re-open an already-decided recommendation

**Where:** evaluation §5.3, "Re-evaluate on edit" row.

**Mechanism.** [`reevaluateForSourceSessionExercise`](../../src/server/progression/service.ts#L530)
does `const [pending] = …where(sourceSessionExerciseId = …, decisionStatus = 'pending')` and
returns early only if there is *none*. It then calls `assembleAndEvaluate(mode: 'reevaluate')`,
which evaluates **the whole slot** and deliberately does not dedupe
([`progression/service.ts:320-333`](../../src/server/progression/service.ts#L320)). With one
record per slot the invariant "re-evaluation happens only while pending" is exact. With one
record **per group** it is not: if group A is pending and group B was already decided (implicitly,
on B's first work set), an edit anywhere in the slot re-evaluates both, and
`supersedePending(exercise, block, B)` finds nothing to supersede, so a **new pending record for
B is inserted alongside B's accepted one**. The partial unique index permits it (it constrains
pending rows only), and the next bundle surfaces a decision card for a group the athlete already
decided.

**Required correction.** State that the per-group evaluation loop in `reevaluate` mode is
restricted to keys whose record is still pending, and add it to §12.1 (an A-13 sibling:
"editing a set of a decided group does not resurrect that group's recommendation"). This is the
kind of rule that must be in the design, not discovered in implementation.

### M-4 — The minimality case omits the reserved `perSet` shape

**Where:** evaluation §4.1's two-candidate table (R1 = two slots, R2 = `groups`), and §16 item 1,
which disposes of `perSet` in a documentation note ("superseded by `groups` for that purpose").

**What the architecture already reserves** ([prescription-model.md:75-81](../architecture/prescription-model.md)):

```ts
interface PerSetScheme {        // different prescription per set; also covers top set + backoffs
  type: 'perSet';
  sets: Array<{
    tag?: 'top' | 'backoff' | 'work';
    reps: …;
    loadOffset?: { type: 'percentOfTop'; percent: number } | { type: 'absoluteKg'; deltaKg: number };
  }>;
}
```

A reserved variant designed for this exact feature, already carrying a `percentOfTop` load
offset and a `top`/`backoff` tag, cannot be superseded in a footnote when the review question is
"is a groups scheme the smallest clean model?". The comparison must be made explicitly.

**My own answer, for the record** (the evaluation should make it, not inherit it): `groups` wins,
for two reasons that are decisive and easy to state — (i) `perSet` enumerates each set, so a
**set-count range** is not representable at all, and ranges are the owner's stated V1 scope;
(ii) `perSet` entries are positional, so per-set identity is index-based, which reintroduces the
skipped/deleted-set ambiguity §4.3 correctly rejects. A useful third point: `groups` is
strictly *more* general for this purpose and strictly *less* general than `perSet` for
genuinely per-set variation, so the two are complements, and `perSet` should be left reserved
rather than declared superseded.

**Also note in B's favour:** the reserved shape puts `loadOffset` *inside the scheme*. That is
real repository precedent for Option B's placement of `load` on the group entry, and it
materially softens the ADR-008 objection the evaluation raises against itself in §6.5. The
amendment (D-5) is still needed — `percentOfGroup` is a *reference*, where `percentOfTop` is a
positional convention — but it is a smaller step than §9.1's "policy cost" framing implies.

### L-1 — The duplicate-slot conflict is stated more loosely than it is

**Where:** evaluation §5.2, "enqueues a second decision on the same record, which dead-letters as
`decision_conflict` **even at the same load**".

Correct, and reproduced (§4). But the precise bounds matter, because the claim is doing the work
of rejecting R1. The conflict requires **all** of: (a) two slots of one exercise in one session;
(b) a pending recommendation carrying a `target.loadKg` at session start (an `action: 'none'`
recommendation never resolves implicitly — [`implicitDecision.ts:33`](../../src/domain/progression/implicitDecision.ts#L33));
(c) a first **non-warm-up** set on **both** slots; (d) the two `decidedAt` stamps differing,
which they always do, since each is the set's own `loggedAt` at millisecond precision. Not a
deload week (gated at [`activeSession.ts:592`](../../src/sync/activeSession.ts#L592)). Effect: a
dead-lettered op on the sync-issues screen
([`flush.ts:113`](../../src/sync/flush.ts#L113) → `markDeadLetter`), **not** head-of-line
blocking; the sets themselves sync fine. The evaluation should state (b), (c) and the
non-blocking consequence.

### L-2 — Group keys silently change the scope of progression, and nothing states the rule

**Where:** review brief priority 2 ("correctly scoped through editing, copying templates,
removing groups and historical sessions"); evaluation §4.2 and §5.3.

Three sub-points, none addressed:

1. **Same exercise in two templates of one block.** Today they share one pending record, one
   carry-forward and one history (F-5/F-6/F-7) — the documented F-20 constraint. Convert both to
   `groups` and each gets independently generated keys, so their progression **silently splits
   into two tracks**. That may well be desirable (it is what F-20 says a concrete program would
   want), but it is a behaviour change chosen by a key generator, and it makes grouped and
   ungrouped slots behave differently for the same authoring act. State the rule and its
   consequence.
2. **Template copy.** There is no copy/duplicate operation today (verified:
   `src/server/templates/service.ts` exposes create/update/archive/reorder only), so this is not
   a live defect. Record the forward constraint anyway: **any future copy must regenerate group
   keys**, or copied slots will collide in the `(exercise, block, group_key)` space exactly as
   duplicate slots collide today.
3. **Removed groups (R-7).** "Left in place, harmless" is *nearly* right — pending records are
   only ever queried scoped by exercise/block
   ([`progression/service.ts:294,433,542`](../../src/server/progression/service.ts#L294)), so
   nothing lists them user-wide. But the bundle's per-key pending array will contain records
   whose key is not in the current scheme. Add the explicit rule: **the bundle (or the client)
   drops pending records whose key is absent from the frozen snapshot's groups**, and say which
   layer does it.

### L-3 — File manifest and acceptance gaps

- `src/domain/progression/evaluationTarget.ts` (`applyInSessionDecisionToPrefill`) is **absent
  from §10's manifest**. It overlays an in-session decision's chosen reps onto the snapshot
  prefill and is called per slot at [`progression/service.ts:375`](../../src/server/progression/service.ts#L375);
  with per-group decisions it must overlay per group.
- `defaultConfigFor` ([`registry.ts:107`](../../src/domain/progression/registry.ts#L107)) is
  `scheme.type === "repRange" ? { repCap: scheme.maxReps } : {}` — **not** an exhaustive switch,
  so a `groups` scheme falls silently into `{}`. Combined with
  `checkPrescriptionCompatibility`'s repCap rule firing only on `scheme.type === "fixed"`
  ([`prescriptions/schema.ts:100`](../../src/domain/prescriptions/schema.ts#L100)), a `groups`
  scheme with fixed-rep groups plus `rep-progression` would be **accepted with no repCap at all**,
  where the equivalent `fixed` scheme is rejected. §10 item 3 gestures at this; it needs to be
  named as a rule with a test.
- **Per-group config resolution is under-specified.** `progression.config` is one object per
  slot. Two ranged groups with different `reps.max` need different `repCap`s; and
  `classification` (heuristic vs user_defined) is computed by comparing the stored config against
  `defaultConfigFor`, so one stored config can classify differently per group. State whether the
  slot config is re-derived per group (and what a *tuned* slot config then means for a group
  whose derived default differs) or whether a per-group override is mandatory the moment two
  groups differ in shape.
- **Cached-bundle offline degradation.** `buildClientRecommendationOps` builds per-group history
  from `entry.history` ([`activeSession.ts:806-836`](../../src/sync/activeSession.ts#L806)); a
  bundle cached before the release has no `groupKey` on history sets, so every group's history is
  empty until the next successful bundle fetch. Self-healing and acceptable — but it should be
  stated, not discovered.

### L-4 — The verification plan understates the E-level gate

**Where:** evaluation §12.2, "`uq_recs_one_pending` rebuild locks or mis-coalesces … then the
gated concurrency suite is *not* required (no new concurrency path) — state it".

The matrix does not key that requirement to new concurrency paths. Schema/migration, column E:
"full quality gates + fresh migrate + seed twice + **the gated concurrency suite if any touched
table has one**". Slice 1 adds a column to **`set_logs`**, and `set_logs` has one:
`SET_RENUMBER_CONCURRENCY_DATABASE_URL`
([agent-workflow.md §8](../process/agent-workflow.md#8-gated-concurrency-environment-variables),
[`tests/integration/setRenumberConcurrency.integration.test.ts`](../../tests/integration/setRenumberConcurrency.integration.test.ts)).
Separately, §6's negative-control policy names "partial unique indexes" as must-execute, which
the `uq_recs_one_pending` rebuild is. Correct §12.2 and §10's change-class paragraph accordingly.

### L-5 — Rollback loses more than the group attribution

**Where:** evaluation §8, "New client, rolled-back server".

Correct in direction and correctly distinguished from PI-018's own rollback profile — I verified
that contrast against the in-flight
[`rollbackCompatibility.test.ts`](../../tests/unit/sync/rollbackCompatibility.test.ts), where
`prescriptionNotes` is a *nested unknown key* on a non-strict schema and is therefore silently
stripped (degrade), whereas `scheme.type: "groups"` is an *unknown discriminator value* and
fails the union (reject). The missing consequence: when the `sessionExercise` op is rejected, the
slot row never exists server-side, so every `setLog` op for it is rejected as `not_found`
([`sync/service.ts` `applySetLogUpsert` parent check](../../src/server/sync/service.ts#L367)).
A rollback mid-session therefore loses **the entire grouped slot including its sets**, not just
the grouping. Say so; it changes how the operational mitigation should be worded.

### L-6 — Research framing: two absolute statements that the search itself bounds

**Where:** research §1 ("**Direct evidence.** No randomised or otherwise controlled trial
compares…") and evaluation §14.1 ("**Direct evidence: none.**").

The report's own `Ø` table is scrupulous ("**None found.**", with date, engines, seventeen verbatim
strings and named access failures), and §9's closing line is properly bounded. The two top-line
sentences are not, and they are the ones a later reader quotes. Change both to the bounded form
("no such trial was found by this search"). This is the one place the research documents drift
from the standard the brief sets; everything downstream of it is correctly hedged.

### L-7 — Research citation defect on the two pages that matter most

**Where:** research §7.3 ("RTM p.14–15 (PDF 8)") and §7.4 ("RTM p.16 (PDF 8)").

The report derives and verifies the mapping "PDF page k holds printed pages 2k−3 and 2k−2", which
puts printed 15–16 on **PDF 9**, not PDF 8. I opened the PDF to check, because these are the two
pages the design-relevant material sits on:

- **PDF 8 = printed 13–14.** Chapter 2 "Rates of Perceived Exertion (RPEs)" opens on printed 14.
  Mapping formula ✓; the §7.1 contents-target note ("RPEs p.14 → PDF 8") ✓.
- **PDF 9 = printed 15–16.** This is where the RPE scale and the chart actually are.

Everything the report *says about* those pages is **exactly right**, which is why this is LOW and
not higher. Verified verbatim from the scan:

- Scale (p.15): "10- Maximal. No reps left in the tank. / 9- Last rep is tough, but still 1 rep
  left in the tank. / 8- Weight is too heavy to maintain fast bar speed, but is not a struggle.
  2-4 reps left. / 7- Weight moves quickly when maximal force is applied to the weight." —
  confirming the report's key point that the scale is RIR-anchored only at 10 and 9, is a *band*
  at 8, and is bar-speed-defined at 7. Integer only; "RPEs below 4 are not important."
- Chart (p.16): all forty cells match the report's transcription exactly (RPE 10 row:
  62/66/71/74/77 | 80/85/90/95/100; RPE 9: 60/64/68/71/74 | 77/80/85/90/95; RPE 8:
  58/62/66/68/71 | 74/77/80/85/90; RPE 7: 56/60/64/66/68 | 71/74/77/80/85).
- Author's framing (p.16), verbatim: "There is also a chart that I developed that <u>roughly</u>
  correlates an RPE and rep range to a percentage. It should only be used as a guide, not to
  attempt to derive a max." and "80% is where peak force is produced. Be careful with how much
  time you spend in the 90%+ area. The closer you are to the upper right corner, the more
  accurate the chart is."

Correct the two PDF-page numbers. The §10 arithmetic that rests on this chart (2 reps @ RPE 8 =
85 %; 6 @ RPE 8 = 71; 8 @ RPE 7 = 64) is confirmed against the source, and the Epley conversions
(4RM = 88.2 %, 8RM = 78.9 %, 11RM = 73.2 %) are arithmetically correct.

### L-8 — Minor precision

- **F-16 / §7:** "admits supra-modal groups within 1.20×" reads as a load ratio. The comparison
  is `group.e1rmKg > modal.e1rmKg * 1.20`; the *load* comparison is the separate sub-modal test.
  The distinction is the whole of M-1, so the wording should carry it.
- **Research §6 SG-E-01:** "the back-off arm did ≈ 600 % more volume" is the report's own
  arithmetic on rep counts (1 rep vs 7), presented in the study's voice. Label it as arithmetic,
  consistent with §10's own discipline.
- **Evaluation §12.2** lists "Duplicate-slot behaviour (F-20) unchanged and still wrong" as a
  risk with the guard "recorded, not fixed". Given §4's reproduction, it is worth upgrading that
  line to name the dead-letter symptom, so a future reader who hits it recognises it.

---

## 3. Review priority 1 — minimality and representation

**Is `groups` + stable per-set attribution the smallest clean model?** Yes, with M-4's comparison
added. Three candidates exist, not two:

| | R1 — two slots | R2 — `groups` variant | R3 — the reserved `perSet` |
|---|---|---|---|
| Set-count **range** | per-slot only (a second slot is all-or-nothing) | native (`{min,max}`) | **not representable** — each set is enumerated |
| Per-set identity | slot-level; `session_exercises` has no `prescription_id` | stable generated key, stored per set | **positional index** — the §4.3 failure table applies again |
| Progression identity | **broken today** (F-5…F-10, reproduced §4) | per `(exercise, block, key)` | would need the same stored key anyway |
| Anti-DSL | cross-slot references forbidden | untouched in A | `loadOffset` already reserved *inside* the scheme |
| Cost | larger than R2 (needs slot identity that sessions do not carry) | one variant + two nullable columns | same as R2 plus a shape that cannot express V1 |

R3's existence strengthens rather than weakens the recommendation, and it supplies the precedent
for B's placement of `load`. R1's rejection is sound and now empirically grounded (§4).

**Why ordinal partitioning fails — verified.** The decisive rows of §4.3 are the skipped top set
and deletion, and both check out against the code: `set_number` is explicitly not an identity
([`setNumbering.ts:3`](../../src/domain/sync/setNumbering.ts#L3)) and survivors are renumbered to
a contiguous `1..n` on every delete, so an ordinal rule re-*classifies* sets that were never
touched. Add one row the table is missing: **a warm-up logged between groups**. It is excluded by
`is_warmup` in both designs, but under an ordinal rule a set the athlete *forgot* to flag as a
warm-up shifts every later group boundary — a second, silent failure mode of the same kind.

**Unchanged logging UX vs storage/wire change — the distinction is correctly drawn.** The
evaluation is right that the interaction can stay one row, one tap, one checkbox, and right that
this cannot be had without `set_logs.group_key` on the wire. H-2 is the one place it claims more
UX continuity than the code delivers.

---

## 4. Review priority 2 — progression correctness, and the reproduction

### 4.1 Reproduction of the duplicate-slot decision conflict

Run against the real `startSession`/`logSet` mutators and a real (fake) IndexedDB, with two bundle
entries for one `exerciseId` carrying the same `pendingRecommendation` — the exact shape
`buildTodayBundle` produces, since `pendingByExercise` is keyed by `exerciseId` and read once per
prescription row ([`today/service.ts:606`](../../src/server/today/service.ts#L606)).

```
✓ emits TWO implicit decision ops for the SAME recommendation id, differing only in decidedAt
✓ does NOT conflict when only one slot receives a work set
```

Both slots carry `recommendation.id === R`. Logging the first work set on each **at the
recommended load** produces two `recommendationDecision` ops, both `accepted`, with identical
`chosen` and different `decidedAt`. Replaying the server predicate
([`sync/service.ts:1339-1345`](../../src/server/sync/service.ts#L1339)): op 1 applies
(`pending → accepted`); op 2 finds a non-pending record, and `identicalReplay` is false because it
requires `rec.decidedAt.getTime() === new Date(payload.decidedAt).getTime()`. Result:
`rejected(opId, "recommendationDecision", "decision_conflict")` → `markDeadLetter`.

**Bound.** Exactly the four conditions in L-1. The conflict does *not* occur when only one slot
gets a work set (reproduced), when the recommendation has no load target, on a deload week, or
if both decisions somehow landed in the same millisecond. Everything else about the session
syncs normally.

**Verdict on the claim:** upheld, and it disposes of R1.

### 4.2 The rest of the trace

`§5.1`'s pipeline trace is accurate line for line. The `§5.3` requirements table is correct and
complete except for M-3 (re-evaluation scope), L-3 (`evaluationTarget.ts`, per-group config
resolution) and M-2 (the carry-forward bridge).

One additional trap worth writing into the design, because it is silent rather than loud: the
engine's fail-streak scan calls `isCompleted(entry.workSets, entry.prescribed.scheme, …)` on each
**history** entry ([`loadProgression.ts:70-76`](../../src/domain/progression/loadProgression.ts#L70)),
and history `prescribed` comes straight from that session's stored snapshot
([`progression/service.ts:207`](../../src/server/progression/service.ts#L207)). If a per-group
history entry were ever handed the raw `groups` scheme instead of the projected one,
`targetRepsPerSet` would return `null`, `isCompleted` would return `false`, and
`entryQualifiesForStreak` — which is `!isCompleted(...)` — would count that session as a
**failure**, inflating the streak toward `decrease_load`. The projection requirement in §5.4 is
what prevents this; it deserves to be stated as a safety property with a negative control, not
just as a mechanism.

**Group-key stability** through rename, reorder and historical sessions: correct as specified
(keys generated, never derived from label or index; snapshot freezes order). **Scoping** is where
the gaps are — see L-2.

---

## 5. Review priority 3 — strategy reuse

**Does the projection preserve intended semantics?** For fixed counts, yes — `projectGroup` maps
cleanly and the strategies see exactly what they see today. For **ranges, no**: see H-1. The
evaluation's own framing invites the error — "`evaluateLoadProgression` and
`evaluateRepProgression` are **not modified**, so `STRATEGY_VERSIONS` stays `{1,1,1}`" is true
about the *functions* and misleading about the *system*, because the projection changes which
sets those unchanged functions see and therefore changes what the athlete experiences. The brief
asked me not to accept "strategies unchanged" as proof that effective behaviour needs no further
consideration, and that caution is exactly right here.

Specifically:

- **`sets.min` as the completion threshold** is defensible and I endorse it, but it must be
  paired with a rule for what the extra sets do (H-1). The evaluation states one rule for
  load-progression and, one clause earlier, the opposite rule for rep-progression, without
  noticing they disagree.
- **Final-set RIR (R-2)** is the specific mechanism that makes ranges punishing. Keeping "the
  last attributed set gates" is coherent for a *fixed* count; for a range it means the gate is
  applied to a set the prescription called optional.
- **Extra sets beyond `sets.max`** are described as behaving like today's extra sets. Verified —
  nothing in either strategy reads a maximum. But then `sets.max` has **no evaluation meaning at
  all**; it is purely an editor/UX bound. That should be stated plainly, because a reader will
  assume a `2–3` range refuses a fourth set.
- **History selection** is correct as designed (per-key split, projected scheme), subject to the
  §4.2 safety property and M-2's bridge.
- **Persisted evidence and versioning.** `inputs.prescribed.scheme` will hold the *projected*
  scheme, which is a different thing from what the user authored. The additive
  `inputs.prescribed.group` is the right fix and must be treated as **required, not optional** —
  without it a persisted record is not self-describing, which is the whole point of §6 of
  progression-engine.md. Note that `inputsSummarySchema.prescribed` is `.strict()`
  ([`recommendation.ts:56-62`](../../src/domain/schemas/recommendation.ts#L56)), so this is a
  wire-contract change on the client-computed recommendation path, not a free addition — the
  evaluation's F-13 says this and then §5.4 describes it as "additive"; both are true and the
  second should cite the first.
- **Version bump:** not required *if* H-1 is fixed by slicing the context (feeding the strategies
  only the sets that gate) rather than by editing the strategies. If the owner prefers a rule
  that changes what `evaluateLoadProgression` itself does with a final set, that **is** a
  behaviour change and `STRATEGY_VERSIONS["load-progression"]` must bump. State the choice.

---

## 6. Review priority 4 — workout UX

**Auto-advance at the minimum: assessed, and rejected as specified.** H-2 is the blocking defect.
Beyond it:

- **The third set must be reachable without ceremony.** With auto-advance at `min`, performing
  the optional third set of a 2–3 group requires the athlete to notice the chip has moved and tap
  back — which is exactly the moment they are least likely to be reading the screen. Two better
  shapes: (a) advance only when the current group reaches its **`max`**, and show the next group
  as a hint, so a range's optional sets stay on the current chip by default; or (b) do not
  auto-advance at all — highlight the next group and require the tap. (a) preserves the
  evaluation's zero-tap ideal for fixed counts, which are the common case, while making ranges
  behave correctly. I recommend (a), with the input row re-derived on every selection change.
- **Attribution correction** is well-specified (edit form chip in-session, same chip in History,
  treated as evaluation-relevant). Verified feasible: `HistorySetCorrectionPatch` already carries
  `isWarmup` ([`corrections.ts:16-22`](../../src/sync/corrections.ts#L16)) and
  `setLogUpdateChangesEvaluationInputs` is a flat field comparison
  ([`sync/service.ts:784-797`](../../src/server/sync/service.ts#L784)) that takes one more line.
- **Warm-ups** are handled correctly (never attributed, `groupKey` null, unchanged checkbox).
- **Group skipping** is handled by the absence of sets (`NO_WORK_SETS_LOGGED` per group) with no
  new reason code. Verified that the code exists and reads correctly for this case. But the
  *card* has no way to say "I am not doing the top group today" other than by not logging it —
  which is fine, and should be stated as the deliberate answer, because §4.3's whole argument
  rests on that scenario being first-class.
- **Recommendation presentation.** Two cards for one exercise is a real density cost on a phone,
  and §11.2's mock does not show what happens when both have long reason-code explanations. Not a
  defect; flag it for device acceptance, where it will be judged properly.
- **One thing the mock gets right and should be kept:** nothing about keys, projection or
  strategy versions appears in copy.

---

## 7. Review priority 5 — linked back-offs (Option B)

**Reference basis.** Both `performed` and `prescribed` are legitimate and genuinely different
products; making it data rather than code is the right call. Two refinements:

- Under `prescribed`, the back-off does not follow an **in-session** deviation on the top set
  either — the prefill was resolved at bundle/snapshot time, before the athlete touched the bar.
  §6.1's table says this for "the athlete deviates", but the implicit-decision path
  (`modified` on the first work set) is the common way it happens and deserves naming.
- Under `performed`, the derived value must be recomputed as the reference group's sets change
  within the session (add, edit, delete). §6.2 covers edit and delete; say explicitly that
  resolution is a pure function of the *current* local set list, re-run on render.

**Multiple top sets.** R-8 (heaviest attributed set of the reference group) is right and is the
only rule that behaves sanely for a `1–2` top range — which the research shows is real practice
(SG-E-04's "a second top set was performed if the RPE score was too low").

**Missing reference.** R-9's fallback to the linked group's own chain, with explanatory copy, is
correct, and "never fabricate a load" is the right invariant.

**Rounding.** `roundToStepKg` is `round2(Math.round(loadKg / stepKg) * stepKg)`
([`loadHelpers.ts`](../../src/domain/progression/loadHelpers.ts)) — nearest, half-up for positive
values. R-10 is accurate. Worth one sentence in the design that nearest-rounding can round a
back-off *up*, which reads oddly at 80 % of a light top set; a floor variant is a real preference
and should be recorded as such rather than dismissed.

**Overrides and edits after dependent sets are logged.** Correct and consistent with ADR-007:
logged sets are facts, only unlogged prefill follows. Endorsed without change.

**Can linked load and group progression compete as authorities?** Not under rule L-1
(`percentOfGroup` ⇒ `manual`), which I verified is enforceable at exactly the points claimed:
`checkPrescriptionCompatibility` ([`prescriptions/schema.ts:88-119`](../../src/domain/prescriptions/schema.ts#L88)),
the editor's option list, and `supportsScheme` as a defensive backstop
([`registry.ts:78-83`](../../src/domain/progression/registry.ts#L78)). Two consequences to state
plainly in the design rather than leave implicit:

1. A linked group produces **no recommendation and no decision** — so the athlete gets no
   `Accept/Keep/Custom` card for their back-offs, ever, while A-only back-offs do get one. That
   is a visible product difference between A and B for the same exercise, and it is the honest
   scope of "the link is the load rule", but it should be surfaced to the owner as such.
2. The percentage is a **first-set proposal**, not a rule the app enforces on subsequent back-off
   sets. Say what the second and third back-off sets prefill from (the previous back-off set, per
   the existing copy-forward) so it is not mistaken for per-set derivation.

**Delivery scope, A vs A+B.** See §8.2. I do not accept the "once Slice 1 has had real use"
gating as necessary — the research is explicit that nothing distinguishes the two designs
empirically, so waiting buys no evidence — and the brief rules it out as an assumption. The
argument for sequencing is about the ADR-008 amendment and review surface, not about waiting.

---

## 8. Recommended first delivery scope

### 8.1 What to build first

**Option A, in full, `load_reps` only, single-group schemes included**, with H-1, H-2 and M-2
corrected in the design *before* implementation starts, and M-3, L-2 and L-3 written in as
rules. That is the owner's stated V1, it delivers the Trap Bar example end to end, and it is the
prerequisite for everything else.

I endorse the evaluation's refusal to ship a "representation-only" slice. Showing groups while
pooling their evidence would produce confidently wrong recommendations — worse than today.

I also endorse **D-2 as "per group"** over A-lite. The delta really is one column, one index and
one loop, and A-lite does not deliver "independently per group".

**Sequencing:** after PI-018 is committed. Verified as a genuine collision (five shared files),
not a precaution.

### 8.2 A first, or A+B in one release?

The honest position is that this is a **review-surface** decision, not an evidence or maturity
decision:

- **B adds little code.** One schema shape, one validation rule, two pure resolution functions,
  one compatibility rule, some copy. The expensive machinery is all in A.
- **B adds one policy decision** — the ADR-008 amendment (D-5) — and the reserved
  `perSet.loadOffset` shape shows the repository already anticipated a percentage-of-top load
  offset living inside a scheme (M-4). The amendment is smaller than §9.1 implies.
- **B's own risk is concentrated in the fence**, not the feature: one backward hop, no chains, no
  cycles, validated at the schema boundary. That fence is cheaper to write once, with the variant
  it constrains, than to retrofit onto a shipped `groups` schema.

**Recommendation: implement in two stages, release as the owner prefers.** Build A, get it
reviewed and verified, then build B against the verified tree. If the owner takes D-5 up front,
shipping both in one release is reasonable and I would not object; if D-5 is deferred, A ships
alone and B waits on the decision, not on elapsed time or accumulated use.

What I would **not** do is let B's deferral leave A's schema unable to accommodate it. Whatever
the release choice, design the group entry now so that adding `load` later is additive (the
evaluation's shape already does this — keep `baselineLoadKg` where a future `load.mode:
"carryForward"` can absorb it).

### 8.3 Not in either slice

The evaluation's exclusions (§15) are well drawn and I endorse all of them, in particular: no
intra-set clusters/rest-pause/myo-reps, no per-group stop rule, no default percentage, no
duplicate-slot fix, no e1RM change. The research supports each: a stop rule is practised and
volume-predictable but has no 1RM outcome evidence (Ø-5), and RIR's ±1-rep noise means a stop
keyed to "RPE hits 10" fires a rep early or late.

---

## 9. Verification performed

### 9.1 Disposable reproductions (created, run, deleted)

One file, `tests/unit/zzReviewScratchDuplicateSlot.test.ts`, created inside the repository
because `vitest.config.ts` scopes `include` to `tests/unit/**/*.test.ts`; deleted after the run.
`git status --porcelain` before and after this task is **byte-identical** (§9.3).

```
pnpm vitest run --config vitest.config.ts tests/unit/zzReviewScratchDuplicateSlot.test.ts
✓ tests/unit/zzReviewScratchDuplicateSlot.test.ts (8 tests) 220ms
Test Files  1 passed (1)     Tests  8 passed (8)
```

| Group | Assertion | Result |
|---|---|---|
| (1) duplicate slots | two implicit decision ops, same `recommendationId`, different `decidedAt`; server `identicalReplay` predicate false | confirms §5.2 |
| (1) duplicate slots | one work set on one slot only ⇒ exactly one decision op | bounds the conflict |
| (2) range semantics | 2 sets → `increase_load`; +hard 3rd set → `hold` (`FINAL_SET_RIR_AT_LIMIT`) | **H-1** |
| (2) range semantics | 2 sets → `increase_reps`; +short 3rd set → `hold` (`TARGET_REPS_NOT_REACHED_ALL_SETS`) | **H-1** |
| (2) range semantics | extra set's *reps* never add shortfall (even `reps: 1`) | confirms §5.5's load-progression half |
| (2) range semantics | minimum-only counts as `ALL_PRESCRIBED_REPS_COMPLETED` | confirms R-1 |
| (3) e1RM | back-off group is `isModal`; top set `admitted`, governing; three capping flags | **M-1** |
| (3) e1RM | deeper drop ⇒ top set `implausible`, session e1RM = back-off's 144.00 | **M-1** |

No database was opened; no disposable Postgres was created; no migration, build, lint, E2E or
full suite was run. None was needed for an architecture review, and the brief limits verification
to what a finding requires.

### 9.2 Source verification of research material

`docs/research/The Reactive Training Manual…pdf` pages 8 and 9 were opened read-only to check the
page mapping and the two passages the design arithmetic depends on (L-7). The file is unchanged,
untracked and unstaged.

### 9.3 Working-tree integrity

`git status --porcelain=v1` captured before and after and diffed: 48 entries before, 49 after,
with **exactly one added line** — `?? docs/reviews/set-groups-architecture-review.md`. Every
concurrent PI-018 / workflow / Recovery / research path is untouched by this task, and the only
file this task adds is this report.

**One observation worth recording.** At 00:37 during this review,
`src/domain/schemas/prescriptionSnapshot.ts` was modified outside this session: the
`prescriptionNotes: z.string().max(2000).nullable().optional()` declaration disappeared and was
restored within the minute. That is the signature of a concurrent PI-018 reviewer running the
negative control [agent-workflow.md §6](../process/agent-workflow.md#6-negative-control-policy)
requires for that finding (PI-018 §2 R-B: the key must be *declared* or Zod strips it from the
wire). I did not touch the file; it is intact now. Noted only so that a later reader of this
report's "tree unchanged" claim knows the transient was observed and accounted for.

---

## 10. Verdict, required corrections, and owner decisions

### 10.1 Required corrections before implementation

| # | Severity | Correction | Kind |
|---|---|---|---|
| H-1 | HIGH | Specify the set-count range's evaluation window so extra sets never penalise; state it for **both** strategies; pin the matrix in §12.1. Prefer the context-slicing route so `STRATEGY_VERSIONS` need not bump. | design defect |
| H-2 | HIGH | Re-derive the input row on every group-selection change; reconsider auto-advance at `min` in favour of `max` (or tap-to-advance); assert it in E2E. | design defect |
| M-1 | MEDIUM | Rewrite §7's e1RM bullets: the back-off group is the modal anchor; record the top-set-exclusion interaction and the permanent medium-confidence cap as accepted consequences. | design reasoning |
| M-2 | MEDIUM | Bridge ungrouped history/carry-forward for single-group conversions (defect); raise the multi-group mapping as **D-6** (decision); supersede the orphaned null-key pending record. | design defect + decision |
| M-3 | MEDIUM | Restrict `reevaluate`-mode per-group evaluation to keys whose record is still pending; add the acceptance test. | design gap |
| M-4 | MEDIUM | Compare `groups` against the reserved `perSet` explicitly; leave `perSet` reserved rather than "superseded"; cite `perSet.loadOffset` as precedent for B's placement. | design reasoning |
| L-1…L-8 | LOW | Bounds on the duplicate-slot claim; group-key scoping rules (two-template split, future template copy, removed-group filter); manifest additions (`evaluationTarget.ts`, `defaultConfigFor`, per-group config resolution, cached-bundle degradation); the gated concurrency suite at E; rollback loses the whole slot; two research framing/citation fixes; wording precision. | accuracy / completeness |

### 10.2 What is *not* a defect (optional preferences, recorded so they are not confused with the above)

- Two recommendation cards per exercise (density) — a device-acceptance judgement.
- Nearest-step vs floor rounding for linked loads (B) — a genuine preference; record it.
- 1–4 groups, 24-char labels, `load_reps`-only in the first slice — reasonable bounds, not
  architecture.
- A/B release packaging — see §8.2; either is defensible once D-5 is decided.
- Keeping `perSet` reserved and unimplemented.
- R-7's "leave a removed group's pending record in place" — correct as long as L-2(3)'s filter is
  specified.

### 10.3 Owner decisions

**Follows from owner intent already stated — needs confirmation, not deliberation:**

- **D-1 (accept the storage/wire change for per-set attribution): accept.** The owner asked for
  variable set counts, skipped/extra/deleted sets handled, and no silent pooling. §4.3's failure
  table plus §4's reproduction show an ordinal partition cannot deliver that. The conflict the
  owner asked to have surfaced is real, and the answer is that unchanged *logging* is achievable
  while unchanged *storage* is not.
- **D-2 (per-group progression records vs A-lite): per group.** "V1 reuses existing
  load/progression behavior independently per group" is the backlog text; A-lite does not do it.
- **D-3 (slice order): A first, B second**, as two build stages — with release packaging left
  open per §8.2 rather than pre-committed to two releases.

**Genuinely open, required for the first implementation:**

- **D-6 (new, from M-2)** — for a multi-group conversion of an existing slot, does ungrouped
  history bridge to the first group, or does every group start empty? *Recommendation: bridge to
  the first group*, matching the `prefill` rule the evaluation already adopts. (The single-group
  case is not a decision — not bridging there is a defect.)
- **D-7 (new, from H-1)** — which range rule: best-`min` window (recommended), gate-on-last-
  within-`min`, or a knob? This decides whether a version bump is needed.
- **D-8 (new, from H-2)** — auto-advance at `min`, at `max` (recommended), or tap-only?

**Required only when B is scheduled:**

- **D-4 (link basis)** — `performed`, `prescribed`, or both. *Recommendation: both, editor
  pre-selects nothing*, as the evaluation says; the research is explicit that nothing
  distinguishes them empirically (Ø-1) and that they are different prescriptions (§10).
- **D-5 (ADR-008 amendment for one backward hop)** — *recommendation: accept, fenced exactly as
  §6.5 writes it*, and cite the reserved `perSet.loadOffset` shape in the amendment so the
  precedent is on the record.

None of the above is approved by this review.

### 10.4 Research interpretation — assessment

The research companion meets the brief's standard, with L-6 and L-7 to fix:

- **Practitioner material is properly separated.** §4's inclusion criteria admit the Tuchscherer
  manual and the RTS article "as practitioner rationale, never as evidence", §9 adjudicates the
  seven manual-vs-research conflicts by naming which governs, and §12 promotes nothing to the
  registry. The manual's substantive method (fatigue stops, fatigue percents) is correctly
  reported as having *no* outcome evidence either way, and correctly distinguished from "N sets
  at 80 %" — which matters, because that distinction is the one that stops a later design from
  inventing a default.
- **"No direct trial found" is treated as a bounded result** in the `Ø` table, the search-string
  list and the access-limitation notes — but not in the two top-line sentences (L-6).
- **Material sources were verified where they affect design.** I independently confirmed the RPE
  scale, the full forty-cell chart and the author's "guide, not a max" caveat against the scan
  (L-7), and checked the §10 Epley arithmetic. The one substantive number a design could be
  tempted to adopt — SG-E-01's 80 % — is explicitly flagged as fetch-summary, single-study,
  volume-confounded, and not a default.
- **No evidence-derived percentage or "optimal" default is invented** anywhere in either
  document. R-11 ("integer 10–100, no default, required when the mode is chosen") and §6.4 are
  consistent with §11.2's "no evidence-derived default". The copy boundary (§11.4) is right and
  should be carried verbatim into implementation.

---

## 11. Not done, not claimed

- **Not executed:** any build, lint, typecheck, migration, integration or E2E suite; any database
  command; the app. The only commands run were the single disposable vitest file in §9.1.
- **Not claimed:** that the corrections in §10.1 are the complete set an implementation will
  need — an implementation review will find more; that any performance, migration or device
  behaviour was measured; that any training superiority exists for any structure or percentage.
- **Not decided:** D-1…D-8. Recommendations in §10.3 are recommendations.
- **Not modified:** the two author reports, the evidence registry, the research notes, the PDF,
  `docs/BACKLOG.md`, and every concurrent PI-018 / workflow / Recovery path.
- **Created:** this file only. Created and deleted:
  `tests/unit/zzReviewScratchDuplicateSlot.test.ts` (§9.1). No disposable database, no scratch
  script, no registry row.

REVISION REQUIRED
