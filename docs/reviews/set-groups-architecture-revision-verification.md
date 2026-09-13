# Set Groups (PI-012) — revision verification

**Date:** 2026-09-12
**Tree:** `583a9ab` (dirty — pre-existing concurrent work, untouched by this task: `CLAUDE.md`,
`HANDOFF.md` (deleted), `README.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/STATUS.md`,
`docs/evidence/*`, `docs/research-notes/*`, `playwright.config.ts`, `tests/e2e/seed.ts`, and the
untracked `.claude/skills/`, `docs/process/`, `docs/reviews/*.md`, `gpt-*.md`,
`HANDOFF(depracted).md`, the Tuchscherer PDF)
**Role:** targeted revision verification (no new broad evaluation, no implementation)
**Session:** `O5 | PI-012 | Revision verification — Set Groups`
**Model:** claude-opus-5 (1M context)
**Task/gate:** [PI-012](../BACKLOG.md#pi-012) — verify revision 2 of the architecture evaluation and
the bounded corrections to the research companion against
[set-groups-architecture-review.md](set-groups-architecture-review.md).
**Authorization boundary:** none of commit / push / staging / deploy / production / production
database. No implementation. One disposable unit-test file was created inside `tests/unit/`, run, and
deleted (§7.1). No database was opened.
**Files touched:** this file only
**Verdict:** REVISION REQUIRED — two MEDIUM residuals (§5), both one- to two-sentence textual
corrections; the architecture itself is verified and unchanged by them
**Cites:** [set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) rev. 2
§0–§18; [set-groups-strength-evidence-research.md](set-groups-strength-evidence-research.md) §15;
[set-groups-architecture-review.md](set-groups-architecture-review.md) §2, §10.1;
[agent-workflow.md](../process/agent-workflow.md) §5/§6/§8;
[BACKLOG.md PI-012](../BACKLOG.md#pi-012).

---

## 0. Summary

Revision 2 is a substantial and, in almost every respect, exact response to the review. I re-derived
the load-bearing claims against the current source at `583a9ab` and reproduced the new behavioural
specifications with 20 assertions against the real production modules. **Both HIGH findings are
genuinely closed, all four MEDIUMs are closed, and all eight LOWs are disposed.** The evaluation
window, the input-state transition table, the corrected e1RM account, the conversion rules, the
re-evaluation scope and the `perSet` comparison all hold up under reproduction, and every figure in
§7's two worked e1RM sessions is exact to the cent.

Two residuals block the owner-decision gate, both textual:

- **V-1 (MEDIUM)** — the emission rule for the new `inputs.extraWorkSets` key on **ungrouped** records
  is unspecified, and §5.5's "(empty when there were none)" reads as "always present". If it is
  emitted as `[]` on ungrouped records, §8's explicit promise that "ungrouped sessions are unaffected"
  under a rollback is false, and A-10/NC-9 would not catch it — they pin `setLogFullRowOp` only, not
  the client-computed recommendation op.
- **V-2 (MEDIUM)** — §13.1 files **D-1** under "Follows from owner intent already stated —
  confirmation, not deliberation", citing a half-sentence of the backlog whose other half says
  the opposite: *"No physical schema or logging-contract change is preselected; surface any conflict
  with the unchanged-logging constraint before implementation."* The owner reserved this exact choice
  in writing. The recommendation (Accept) is well-supported and I endorse it; its **classification** is
  the error, and it is precisely the "confirmed intent silently settles an unresolved product choice"
  failure this verification was asked to look for.

Three LOW residuals follow (§5.3–§5.5), one of which (V-3) is a negative control whose stated expected
observation is wrong in two of three rows — verified by reproduction.

Nothing in §5 changes the architecture, the acceptance matrix's substance, or any recommendation.
**Architecture approval is not implementation authorization**, and none is given or implied here.

---

## 1. Method and scope

Targeted verification only, per the brief. What I did:

- Read every section of the evaluation that §18 names as changed, plus §13 in full.
- Re-derived each new or corrected source claim (F-16, F-21…F-24, the §7 mechanics, the §8 rollback
  chain, the §10 change class) against the tree at `583a9ab`.
- Reproduced the new behavioural specifications — the whole A-6 matrix, the §5.4 safety property, both
  §7 worked sessions, the §7 threshold formula, and NC-4's claimed discrimination — in one disposable
  unit-test file (§7.1).
- Verified the research report's three corrections, including opening the scan read-only to re-check
  the L-7 page mapping myself rather than accepting the correction on its word.

What I deliberately did **not** do, per the brief: no new literature search, no re-run of the PI-018
collision gate (PI-018 is committed at `7fb7c0b`, deployed and device-accepted; the five-file collision
no longer exists and the evaluation says so correctly), no broad re-evaluation of findings the review
already accepted, no database, no build or full suite.

---

## 2. HIGH findings

### H-1 — set-count range punishes the optional set → **CLOSED**

The fix is the right one and it is specified precisely. §1 now defines *recorded sets* and *evaluation
window* as terminology; §5.5 states the window as **"the first `sets.min` recorded sets, in set-number
order"** and adds, unprompted, the exact clarification the brief asks for: *"Chosen by order, never by
performance. 'First `min`' is not 'best `min`'"* — pinned by matrix row 5.

**Reproduced.** All eight A-6 rows, both strategies, against the real `evaluateLoadProgression` /
`evaluateRepProgression` with the specified projection `{repRange, sets 2, 6–8}` and stock configs:

| Recorded | load-progression | rep-progression | matches §5.5 |
|---|---|---|---|
| `110×7 @3, 110×7 @2` | `increase_load` 112.5 | `increase_reps` 7 | ✓ |
| `… + 110×6 @0` | `increase_load` 112.5 | `increase_reps` 7 | ✓ (review reproduction 1 fixed) |
| `… + 110×5 @1` | `increase_load` 112.5 | `increase_reps` 7 | ✓ (review reproduction 2 fixed) |
| `… + 110×1 @3` | `increase_load` 112.5 | `increase_reps` 7 | ✓ |
| `110×5 @1, 110×7 @2, 110×7 @2` | `hold` (`PRESCRIBED_REPS_NOT_COMPLETED`) | `hold` (`TARGET_REPS_NOT_REACHED_ALL_SETS`) | ✓ **first-min, not best-min** |
| `110×7 @3` | `hold` | `hold` | ✓ |
| none | `NO_WORK_SETS_LOGGED` | `NO_WORK_SETS_LOGGED` | ✓ |
| four sets (beyond `max`) | `increase_load` 112.5 | `increase_reps` 7 | ✓ `max` is evaluation-free |

Also reproduced: the stated `1–2` top-group trade-off — an optional second top set at RIR 0 no longer
holds the group, and `derived.finalSetRir` is the **window's** last set (2), not the optional one.
Rev. 1's A-4 said `increase_reps 8`; rev. 2 says `7`, which is the correct value
(`currentTarget = prefill.reps ?? minReps = 6`, `+repIncrement 1`).

**Both strategies use consistent semantics.** Verified structurally, not just asserted: the window is
applied once, in `evaluateSession`'s context construction, so load-progression's `isCompleted` /
`repShortfall` / final-set RIR / `modalWorkingLoad` and rep-progression's `every()` all read the same
array. The rev. 1 disagreement (extra reps neutral in one, a full veto in the other) is gone because
neither strategy ever sees an extra set.

**`workSets` / `extraWorkSets` — honest evidence, schemas, consumers, replay.**

- *Honest evidence:* `inputs.workSets` = the window (what the strategy actually saw); the rest go to
  `inputs.extraWorkSets`; `inputs.prescribed.group.setsMin/setsMax` says where the split falls. The
  rejected alternative (`workSets` = everything plus a `derived.evaluatedSetCount`) is rejected for the
  right reason — it would retroactively change what `workSets` has meant in every record written so far.
- *Strict schemas:* both are additive keys on `inputsSummarySchema`, which is `.strict()`
  ([`recommendation.ts:56-77`](../../src/domain/schemas/recommendation.ts#L56)). §5.4 and manifest item
  11 both say so and cite F-13. Correct — and see **V-1**.
- *Consumers:* verified there is **no UI consumer** of `recommendation.inputs` anywhere in `src/ui`;
  the only readers are the DTO passthrough at
  [`progression/service.ts:99`](../../src/server/progression/service.ts#L99) and the write paths. So
  the one meaning change this introduces — `derived.setsCompleted` now reports the **window** size, not
  the recorded count (reproduced: 3 recorded → `setsCompleted` 2) — is audit-only and invisible to the
  athlete. The invariant §5.5 claims, `derived.setsCompleted === inputs.workSets.length`, holds in
  every reproduced row.
- *Replay:* recommendation ops are idempotent by id and the payload is written verbatim
  ([`activeSession.ts:884`](../../src/sync/activeSession.ts#L884) → `sync/service.ts:1270`), so a
  replay reproduces the same row.

**No-strategy-version-bump rationale — verified sound, and for a reason the evaluation only half
states.** `STRATEGY_VERSIONS` exists so that "same inputs + same strategy version ⇒ same output, byte
for byte" ([`engine.ts:5-7`](../../src/domain/progression/engine.ts#L5)). The windowing happens
*outside* the strategy, in context construction, so `evaluateLoadProgression` and
`evaluateRepProgression` are textually unchanged — necessary but not sufficient. The sufficient part is
that the **persisted** `inputs.workSets` is exactly the array the strategy consumed, so re-running v1
against the stored record still reproduces the stored output. That is what makes the split
load-bearing rather than cosmetic, and it is why the rejected alternative would have forced a bump.
The evaluation should say this explicitly; it is implied by §5.5's "audit evidence" paragraph but never
stated as the reproducibility argument. **Optional improvement, not a defect.**

The stated trade-off (an RIR 0 on an optional set cannot hold the group) is honest, both alternatives
are named with their costs, and §15 records the deferred knob with its version cost.

### H-2 — auto-advance moves the group, not the load → **CLOSED**

§11.4 is a complete state machine, and F-22 records the current behaviour I verified in the review
(the card clears only RIR after a log). Every event the brief names is covered:

| Requirement | §11.4 | Verdict |
|---|---|---|
| Every selection change derives the correct group's inputs | Re-derivation is **unconditional** on both selection-change events, from one pure function `groupPrefill(group, sets, recommendations, groupPrefills)` | ✓ |
| Auto-advance at `max` | Chosen, with a three-way comparison against advance-at-`min` and tap-only, each with taps-per-boundary and silent-carry risk | ✓ |
| Warm-ups | "never count toward `min`/`max` and never advance"; selection and inputs unchanged (today's copy-forward) | ✓ |
| Dirty drafts | `dirty` tracked; typing sets it; **no re-derivation on render, decision or sync event**; a chip tap replaces a dirty draft, with the rationale stated (the athlete initiated the switch; preserving a draft across a group change *is* the hazard) | ✓ |
| Returning to a prior group | Explicit row: "returning to Top after back-offs brings the top load back, so 'one more top set' is one tap plus Log" | ✓ |
| Decisions cannot carry the top-set load into back-offs | Prefill on an explicit decision applies "only if that group is the selected one and no set of that group is logged and not `dirty`" — a per-group extension of today's `handleDecide` guard | ✓ |

Guards are real, not nominal: A-9 pins the two pure functions, A-17 asserts **in the browser** that the
weight input's value changes at the instant of auto-advance and again on a tap back to Top, and NC-8
removes the re-derivation and requires A-17 to fail.

One observation, not a defect (**V-5**, §5.5): mount derivation is "the first group in order whose
recorded count is below its `max`". After a deliberately skipped top group and a reload, that
re-selects Top. No mis-attribution follows — the inputs re-derive from *Top's* own chain, so the load
in the box is right for the chip — but it will surprise, and A-9 does not assert it.

---

## 3. MEDIUM findings

### M-1 — e1RM premise → **CLOSED; every figure verified exact**

F-16 is rewritten correctly and now carries the distinction that caused the original error: sub-modal
exclusion is a **load** comparison, the 1.20 plausibility ceiling is an **e1RM** ratio. That matches
[`observation.ts:172-186`](../../src/domain/strength/observation.ts#L172) exactly.

**Reproduced against `buildObservation`:**

| §7 claim | Reproduced |
|---|---|
| `140×2 @2 + 110×7 @3 + 110×7 @2`: back-off group modal, group e1RM **143.00**, ceiling **171.60**, top **158.67** admitted and governing | ✓ exact; flags `TOP_SET_GOVERNS`, `SINGLE_SET_GROUP`, `MIXED_LOADS_IN_SESSION` |
| `160×2 @2 + 3 × 120×3 @3`: top **181.33** implausible, session **144.00** | ✓ exact |
| Group e1RM = "lower median of the first three sets, as implemented" | ✓ `finishGroup` → `lowerMedian(first ≤3 positions)`; for `[146.67, 143.00]` → 143.00 |
| Admission threshold `p ≥ (1 + t/30) / (1.20 × (1 + b/30))` | ✓ algebraically correct; and empirically confirmed — at `t=4, b=6` a back-off just above the threshold load is `admitted` and just below is `implausible` |

The permanent medium-confidence cap is correctly named (all three flags are in
`CONFIDENCE_CAPPING_FLAGS`, [`estimate.ts:38-45`](../../src/domain/strength/estimate.ts#L38)).

**Policy hygiene — verified.** §7's "Status of these consequences" paragraph states they are existing
consequences of ADR-011's accepted rules, "**not** a decision made by this document and … **not**
presented as owner-accepted; nothing here changes e1RM policy". §15 keeps "No change to the e1RM
tracker, its gates, windows, plausibility band or reason codes", and A-16b pins both sessions **as
current behaviour** so any later change is deliberate. No policy is silently changed and no owner
acceptance is claimed. ✓

Residual **V-4** (LOW, §5.4): two of the four quoted threshold percentages are misrounded.

### M-2 — conversion resets load and history → **CLOSED**

- **C-1** is correctly framed as a *rule, not a decision*: a single-group scheme's history,
  carry-forward and decision lookups read **both** its own key and the null key; the existing null-key
  pending record is surfaced as that group's card, decided normally, superseded by the group's next
  record. This is what the review asked for, and the reason is right — the sole group *is* the slot,
  so the mapping is unambiguous and not bridging would be a defect.
- **D-6** is correctly raised as a decision for the multi-group case, with three options, the concrete
  first-session consequence of each, the pending-record handling of each, and recommended default (a)
  applied **symmetrically in both directions** (an ungrouped slot converted back reads each historical
  grouped session's first group, computable per row from that row's own frozen snapshot). Option (b)
  correctly makes the supersede-at-conversion hook mandatory, and manifest item 18 carries it
  conditionally.
- Consistency across sections checks out: §4.5's removed-group filter maps the null key "per §5.6",
  §5.3's carry-forward row states the bridge, R-6 restates the chain, and A-8/A-14 pin both the C-1 and
  D-6-default behaviours. No contradiction found between §4.5, §5.3, §5.6, §13.3 and R-6.

Verified mechanically that the bridge cannot double-count: `resolveCarryForwardLoadKg` sorts candidates
by `startedAt` descending and takes the newest ([`carryForward.ts:24-32`](../../src/domain/progression/carryForward.ts#L24)),
so once a keyed session exists it wins over the older null-key ones.

### M-3 — re-evaluation reopens decided recommendations → **CLOSED**

§5.3's new row is exactly right and states the mechanism, not just the rule: `reevaluate` mode
evaluates **only** groups whose record sourced from this slot is still `pending`; a record that is
`accepted`/`modified`/`rejected` or `superseded` is never re-evaluated from an older slot, "doing so
would insert a fresh pending record beside the decided one (the partial index constrains pending rows
only) and surface a decision card for a group the athlete already decided". F-21 records the current
mechanism, which I re-verified at
[`progression/service.ts:530-537`](../../src/server/progression/service.ts#L530) (`const [pending] = …`
existence gate) and [`:320-333`](../../src/server/progression/service.ts#L320) (dedupe is `initial`-mode
only). A-13b covers both directions plus the superseded case; NC-6 flips it; R-15 restates it.

Checked the adjacent case the rule could have broken: a group with **no work sets** still produces a
draft (`action: "none"`, `NO_WORK_SETS_LOGGED`) which is persisted, so it is pending and remains
re-evaluable if the athlete later corrects a set into that group. The rule does not strand it. ✓

### M-4 — `perSet` omitted → **CLOSED**

§4.1 is now a three-column R1/R2/R3 table. The two decisive grounds are stated and correct — `perSet`
enumerates every set so a set-count range is **not representable**, and its per-set identity is
**positional**, which reinstates the §4.3 ordinal failure table. The conclusion is the right one:
`groups` and `perSet` are **complements, not rivals**; `perSet` stays "reserved, unimplemented and
unsuperseded", and §16 item 1 is reworded to keep it reserved rather than superseded. F-19 now records
that the reserved shape carries `loadOffset: {percentOfTop}` *inside* the scheme, and §4.1/§6.5 use it
as precedent for B's placement of `load` while correctly noting the amendment is still needed because
`percentOfGroup` is a reference to a key where `percentOfTop` is a positional convention. Complete.

---

## 4. LOW dispositions (L-1…L-8)

| # | Disposition | Verified |
|---|---|---|
| L-1 | Conditions (a)–(d), the non-blocking dead-letter effect, "sets sync normally"; §12.2's risk row now names the symptom. | ✓ matches the review's reproduction and bounds |
| L-2 | §4.5 covers all four situations. Two-template split stated as a rule with its asymmetry against ungrouped slots (R-16); template copy — none exists, forward "regenerate keys" constraint recorded (R-14); removed-group pending records **filtered at bundle assembly** (server) with a client defence, pinned by A-14 and manifest items 16/19. | ✓ re-confirmed at `583a9ab` that `templates/service.ts` exports list/get/create/update/archive/reorder only |
| L-3 | F-23 records that neither `defaultConfigFor` nor the `repCap` compatibility rule would fire for a new scheme type. §5.3 specifies per-group config resolution and per-group `classification`, and adds the rule that slot-level `repCap` is **forbidden** on a `groups` scheme (a single cap cannot be right for two groups with different `reps.max`) with a per-group cap **required** for fixed-rep rep-progression groups. `evaluationTarget.ts` per-key overlay is manifest item 9. Cached-bundle offline degradation stated. A-3 extended. | ✓ all three source claims re-checked ([`registry.ts:107`](../../src/domain/progression/registry.ts#L107), [`prescriptions/schema.ts:100`](../../src/domain/prescriptions/schema.ts#L100), [`evaluationTarget.ts`](../../src/domain/progression/evaluationTarget.ts)) |
| L-4 | Change class corrected: the `SET_RENUMBER_CONCURRENCY_DATABASE_URL` suite is **required** because `set_logs` is a touched table, "not optional and not waived by 'no new concurrency path'"; the `uq_recs_one_pending` rebuild is a must-execute negative control (NC-3); §12.2's row fixed; A-12 includes both. | ✓ matches [agent-workflow §5/§6/§8](../process/agent-workflow.md#5-evidence-levels-and-the-change-class-matrix). The evaluation requires the gated suite at **R** as well as **E**, where the matrix names it only at E — stricter, not weaker, and defensible under §6's role-agnostic must-execute list |
| L-5 | Whole grouped slot absent server-side (`invalid_payload` → then every `setLog` `not_found`); **locally nothing is deleted**; retry is manual and unaltered; operational rule stated. | ✓ verified in code — see below |
| L-6 | Bounded wording in evaluation §14.1 and in research §1 and §8 Q1. | ✓ |
| L-7 | §7.3 → "(PDF 8–9)", §7.4 → "(PDF 9)". | ✓ **independently re-verified**: I opened the scan read-only. PDF 8 = printed 13–14 (Chapter 2 opens on p.14); PDF 9 = printed 15–16 (the RPE scale list and the forty-cell chart). The corrections are right and no quoted text or chart cell changed |
| L-8 | F-16 carries the e1RM-ratio distinction; "≈ 600 %" relabelled as the report's own per-session repetition arithmetic in both documents; §12.2 names the duplicate-slot symptom. | ✓ |

**L-5, in detail** — this is the one the brief singled out ("do not assume already dead-lettered
operations retry automatically"), and F-24 gets it right on every point I could check:

- `markDeadLetter` flips status and stores the reason; **the payload is never rewritten**
  ([`outbox.ts:77-81`](../../src/sync/outbox.ts#L77)). ✓
- `retryDeadLetterOp` restores the op to `pending` with `payload`, `createdAt` and `tries` untouched —
  so the original FIFO position survives ([`outbox.ts:96-118`](../../src/sync/outbox.ts#L96)). ✓
- Retry is **manual and per-op**: `SyncIssuesScreen` renders one Retry button per row and calls
  `retryDeadLetterOp(opId)` then `flushOutbox()`; there is no retry-all and no automatic re-queue.
  `listDeadLetterOps` reads the `byCreatedAt` index, so the displayed order **is** the creation order —
  which is what makes the evaluation's "the slot op first, then its set ops" recovery actually
  executable by following the list top to bottom. ✓
- `discardDeadLetter` is the only deletion and is user-initiated. ✓
- The completed session's local aggregate is deleted at completion
  (`commitSessionMutation({ session: null, … })`,
  [`activeSession.ts:895-911`](../../src/sync/activeSession.ts#L895)), so the outbox really is the only
  local copy — and the Complete flow's confirmation names the unsaved sets and points at Sync issues
  ([`WorkoutExecution.tsx:64-72`](../../src/ui/workout/WorkoutExecution.tsx#L64)). ✓
- The parent `not_found` rejection is at [`sync/service.ts:974`](../../src/server/sync/service.ts#L974),
  as cited. ✓
- The operational rule ("do not roll back while a grouped session may be in flight; if a rollback
  happens, roll forward before anyone discards dead letters") is the correct conclusion from all of the
  above. ✓

**Research report corrections** are bounded exactly as claimed: §15 records the three edits, states that
no new search was run, nothing was promoted into `docs/evidence/*`, no research note was edited, and the
PDF was opened read-only and is unchanged. I confirmed all three edits landed and that §5.3's `Ø` table,
§10's arithmetic and the source list are untouched.

---

## 5. Residual corrections

### V-1 (MEDIUM) — `extraWorkSets` has no emission rule for ungrouped records

`inputs.prescribed.group` has one and it is stated clearly: §5.4 says it is "**required whenever the
record is per-group** (absent means 'ungrouped slot')". `extraWorkSets` has none. §5.5 introduces it as
"(empty when there were none)", which reads as *always present, possibly `[]`*, and every other mention
is silent:

- §9.1's sync-contract row: "`setLog.groupKey`, `recommendation.groupKey` (**both** emitted only when
  grouped); `inputs.prescribed.group`, `inputs.extraWorkSets`" — the parenthetical binds to the first
  two only.
- Manifest item 11: "`inputsSummarySchema.prescribed.group` (required-when-grouped) and
  `extraWorkSets` (strict-schema additions, F-13)" — the qualifier is attached to one and not the other.

**Why it matters.** §8 promises "Ungrouped sessions are unaffected **provided the client emits
`groupKey` only for grouped slots** … byte-identical ops for everything that exists today." An
always-present `extraWorkSets: []` breaks that promise for the client-computed `recommendation` op: the
payload changes shape for every ungrouped offline completion, and against a rolled-back server the
`.strict()` `inputsSummarySchema` rejects it, so ordinary ungrouped sessions dead-letter — exactly the
outcome §8 says cannot happen. Nothing would catch it: A-10 and NC-9 pin `setLogFullRowOp` only.

**Required correction.** One sentence in §5.5 and one clause in §9.1 / manifest item 11: `extraWorkSets`
is **omitted entirely** for ungrouped records, exactly like `prescribed.group`; and extend A-10 (and
NC-9's byte-identity control) to cover the client-computed `recommendation` op's `inputs`, not just the
set-log op. §8's proviso should name both keys rather than `groupKey` alone.

### V-2 (MEDIUM) — §13.1 misclassifies D-1 as settled owner intent

PI-012's own text (docs/BACKLOG.md, the "Architecture must establish…" block, final bullet):

> "**No physical schema or logging-contract change is preselected; surface any conflict with the
> unchanged-logging constraint before implementation.**"

D-1 *is* the physical-schema-and-logging-contract change. The owner explicitly declined to preselect it
and asked for the conflict to be surfaced **for a decision**. §13.1 nevertheless files D-1 under
"Follows from owner intent already stated — **confirmation, not deliberation**", and its "Basis in the
owner's own words" column quotes *"surface any conflict with the unchanged-logging constraint"* — the
instruction to bring the choice back — as evidence that the choice is already made. That inverts the
sentence's meaning.

This is not a quibble about tone. §13.1 is the section an owner reads to learn which decisions still
need them, and D-1 is the single largest commitment in Stage A (a migration, two nullable columns, an
index rebuild, and a permanent widening of the sync contract). Filing it as a formality is the exact
failure mode this verification was asked to guard against.

**What is *not* wrong:** the recommendation itself. "Accept — unchanged *logging* is achievable,
unchanged *storage* is not" is correct, is supported by §4.3, and was independently reproduced in the
review. §18 and the §13 preamble both say "None is approved by this document", which is honest. D-2 and
D-3 are correctly classified: "reuses existing load/progression behavior independently per group" and
"supersedes linked load derivation as the first deliverable … the original linked-back-off idea remains
deferred" are direct owner sentences.

**Required correction.** Move D-1 into §13.3 (genuinely open product choices, required before Stage A),
quote the backlog sentence **in full** including "No physical schema or logging-contract change is
preselected", and keep "Accept" as the recommendation with the §4.3 reasoning and the concrete
consequence (one migration, two nullable columns, an index rebuild, two payload keys). §13.1 then holds
D-2 and D-3 only.

### V-3 (LOW) — NC-4's expected observation is wrong in two of three rows

§12.3 NC-4: *"Window removal: pass all recorded sets to the projected context → A-6 rows 2–3 hold and
row 5 progresses — proves A-6 discriminates."* Reproduced against the real strategies:

| A-6 row | With window | Window removed | NC-4 expects | Actual |
|---|---|---|---|---|
| 2 (`+110×6 @0`) | `increase_load` / `increase_reps` | **`hold` / `hold`** | holds | ✓ discriminates (both strategies, not just load) |
| 3 (`+110×5 @1`) | `increase_load` / `increase_reps` | `increase_load` / **`hold`** | holds | ✗ **load-progression is unchanged** — only rep-progression flips |
| 5 (first-min) | `hold` / `hold` | **`hold` / `hold`** | progresses | ✗ **identical with and without the window** — NC-4 does not exercise row 5 at all |

Row 5 is unmoved because `repShortfall` still slices to the projected `scheme.sets = 2` regardless of
how many sets are passed, and rep-progression's `every()` still sees the short first set. The control
that *does* discriminate row 5 is a **best-`min`** window instead of a first-`min` one — reproduced:
selecting the two best sets makes row 5 return `increase_load` / `increase_reps`.

**Required correction.** Split NC-4 into two controls: **NC-4a** window removal → row 2 flips for both
strategies, row 3 flips for rep-progression only; **NC-4b** best-`min` instead of first-`min` → row 5
progresses. As written, the control would be reported as "observed ≠ expected" or, worse, quietly
rewritten to match and lose its discriminating power for the "first-min, not best-min" rule.

### V-4 (LOW) — two of §7's four threshold percentages are misrounded

Computed from the evaluation's own formula (`t = 4`):

| back-off RTF `b` | §7 states | Actual |
|---|---|---|
| 9 (7 reps @ RIR 2) | 72.7 % | **72.65 %** |
| 8 (6 reps @ RIR 2) | 74.9 % | **74.56 %** |
| 11 (8 reps @ RIR 3) | 69.1 % | 69.11 % ✓ |
| 6 (triples @ RIR 3) | 78.7 % | 78.70 % ✓ |

The 74.9 % figure is a genuine slip (0.34 pp), not rounding. The conclusion is unaffected — every
threshold remains below the owner's 80 % example — but the table is explicitly labelled "as arithmetic",
which is the one place a figure has to be right. **Correction:** restate as 72.6 % and 74.6 %.

### V-5 (LOW, observation) — mount derivation after a skipped top group

§11.4's mount rule re-selects Top after a reload when Top has no sets, even if the athlete deliberately
skipped it. No mis-attribution is possible (the inputs re-derive from Top's own chain), and arguably
Top *is* still unperformed, so this may well be the wanted behaviour — but A-9 asserts the mount rule
only in the ordinary case. **Suggested:** one A-9 assertion pinning the skipped-top reload, so the
behaviour is chosen rather than inherited.

### V-6 (LOW, wording) — §13.1 D-3 vs §9.2 on packaging

§13.1's D-3 cell reads "A, then B, as stages — **not separate releases**, not use-gated", while §9.2
correctly says "Whether A and B ship together or apart is the owner's packaging choice and is not
pre-committed here." The two are reconcilable (stages ≠ releases), but the §13.1 phrasing reads as a
packaging decision in the table the owner scans for decisions. **Suggested:** "as build stages;
packaging is the owner's (§9.2)".

---

## 6. §13 decision classification — full assessment

The three-way split (owner intent / engineering recommendation / open product choice) plus a
sixteen-item routine-defaults table is the right structure, and it does **not** over-gate: only one
decision (D-6) is required before Stage A, and routine details stay routine.

| ID | Filed as | Assessment |
|---|---|---|
| D-1 | Owner intent — confirmation | **Wrong (V-2).** The owner explicitly declined to preselect it. Belongs in §13.3. |
| D-2 | Owner intent — confirmation | ✓ "V1 reuses existing load/progression behavior independently per group" is a direct sentence; A-lite does not deliver it. |
| D-3 | Owner intent — confirmation | ✓ on ordering ("supersedes … as the first deliverable"; "remains deferred"). Wording nit V-6 on packaging. |
| D-7 | Engineering recommendation — decided unless overruled | ✓ Appropriate. The alternative is named, the version cost of the knob is stated, and the athlete-visible effect is spelled out concretely enough for the owner to overrule knowingly. |
| D-8 | Engineering recommendation — decided unless overruled | ✓ Appropriate, and explicitly re-openable at device acceptance ("tap-only remains a one-line change"). |
| C-1 | Rule, not a decision | ✓ Correct. Single-group conversion has one unambiguous mapping; not bridging would be a defect. |
| D-6 | Open product choice (Stage A) | ✓ Correctly open — three options, concrete first-session consequences, recommended default. |
| D-4 | Open product choice (Stage B) | ✓ Correctly open; the rounding preference is folded in rather than smuggled into a routine default. |
| D-5 | Open product choice (Stage B) | ✓ Correctly open; allowed/rejected examples make the fence concrete. |

**Routine defaults (§13.4)** — checked all sixteen for smuggled product choices. R-1/R-2/R-4 are now
mechanics of D-7/D-8 rather than choices in their own right; R-6 defers to D-6 for the multi-group case;
R-10 defers to D-4. One labelling nit: **R-16** ("grouped slots of one exercise in two templates of a
block progress on independent tracks") is not a default but a *consequence* — §4.5 correctly explains it
is "the only behaviour a stored key can have". Better labelled as a consequence so a reader does not
look for the alternative. No routine default hides a decision the owner should see.

---

## 7. Verification performed

### 7.1 Disposable reproductions (created, run, deleted)

One file, `tests/unit/zzRevVerifySetGroups.test.ts` (inside `tests/unit/` because `vitest.config.ts`
scopes `include` to `tests/unit/**/*.test.ts`), deleted after the run.

```
pnpm vitest run --config vitest.config.ts tests/unit/zzRevVerifySetGroups.test.ts
✓ tests/unit/zzRevVerifySetGroups.test.ts (20 tests)
Test Files  1 passed (1)     Tests  20 passed (20)
```

Covering: all eight A-6 rows for both strategies; the `workSets`/`extraWorkSets` split and the
`setsCompleted === workSets.length` invariant; the `setsCompleted` meaning change; the `1–2` top-group
trade-off; the §5.4 safety property (a repsless history scheme yields `decrease_load` where the
projected one yields `hold`); both §7 worked e1RM sessions to the cent; the §7 threshold formula
numerically and at its empirical admit/exclude boundary; and NC-4's claimed discrimination (V-3).

No database, migration, build, lint, E2E or full suite was run — none was required for a targeted
architecture-revision verification, and the brief limits verification to what a finding needs.

### 7.2 Source re-verification at `583a9ab`

`observation.ts` (modal selection, sub-modal vs plausibility, `finishGroup`'s lower-median),
`estimate.ts` (`CONFIDENCE_CAPPING_FLAGS`), `loadProgression.ts` / `repProgression.ts` (window
consumption points), `engine.ts` (determinism contract), `evaluateSession.ts`, `registry.ts`,
`prescriptions/schema.ts`, `evaluationTarget.ts`, `carryForward.ts`, `progression/service.ts`,
`sync/service.ts`, `outbox.ts`, `flush.ts`, `SyncIssuesScreen.tsx`, `WorkoutExecution.tsx`,
`ExerciseCard.tsx`, `templates/service.ts`, and `docs/BACKLOG.md` PI-012. Also confirmed no `src/ui`
consumer reads `recommendation.inputs`.

### 7.3 Research material

`docs/research/The Reactive Training Manual…pdf` pages 8 and 9 opened read-only to re-check the L-7
correction independently. Unchanged, untracked, unstaged.

### 7.4 Working-tree integrity

`git status --porcelain=v1` captured before and after and diffed: **identical**, 29 entries. The
disposable test was removed; the only file this task adds is this report (which appears as a new
untracked entry after this write). Both author reports, my original review, the PDF and all concurrent
work are untouched.

---

## 8. Remaining owner decisions

Unchanged in substance from the review; one moves category under V-2.

**Required before Stage A implementation:**

- **D-1** — accept the storage/wire change for per-set attribution (nullable `set_logs.group_key` and
  `recommendations.group_key`, index rebuild, two payload keys) versus ordinal partitioning.
  *Recommendation: accept* (§4.3; reproduced). Reclassified here as an open owner choice because
  PI-012 reserves it in writing.
- **D-6** — for a **multi-group** conversion of an existing slot, does ungrouped history bridge to the
  first group (a), to nobody (b), or does the editor ask (c)? *Recommendation: (a), applied
  symmetrically.* (The single-group case is C-1, a rule, not a decision.)
- **D-2** — per-group recommendation records rather than A-lite. *Follows from the owner's own V1
  sentence; confirmation only.*
- **D-3** — build order A then B as stages; packaging (one release or two) is the owner's.

**Required only when Stage B is scheduled:**

- **D-4** — link basis offered (`performed`, `prescribed`, or both) and nearest vs floor rounding.
  *Recommendation: both, editor pre-selects nothing; nearest.*
- **D-5** — accept the fenced ADR-008 amendment (one backward hop inside a slot). *Recommendation:
  accept as §6.5 writes it.*

**Decided by the evaluation unless the owner overrules** (correctly not gates): D-7 (first-`min`
window), D-8 (advance at `max` with unconditional re-derivation), C-1 (single-group conversion), and
the sixteen routine defaults in §13.4.

None of the above is approved by this document. **Architecture approval is not implementation
authorization**: no schema, code, migration, staging, commit, push or deployment is authorized by this
verification.

---

## 9. Not done, not claimed

- **Not executed:** any build, lint, typecheck, migration, integration or E2E suite; any database
  command; the app. The only command run was the single disposable vitest file in §7.1.
- **Not re-done:** the PI-018 collision gate (PI-018 is committed at `7fb7c0b`, deployed and
  device-accepted; the evaluation's sequencing text is correct and the collision no longer exists); any
  literature search; any re-evaluation of findings the review already settled.
- **Not claimed:** that §5's residuals are the complete set an implementation review will find; that any
  performance, migration or device behaviour was measured; that the acceptance matrix has been executed
  — it is a specification, and A-1…A-17 remain unrun by anyone.
- **Not modified:** both author reports, my original review, `docs/BACKLOG.md`, the PDF, the evidence
  registry, the research notes, and every concurrent path.
- **Created:** this file only. Created and deleted: `tests/unit/zzRevVerifySetGroups.test.ts`.

REVISION REQUIRED
