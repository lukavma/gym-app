# Set Groups (PI-012) — revision 3 residual verification

**Date:** 2026-09-12
**Tree:** `583a9ab` (dirty — pre-existing concurrent work, untouched by this task: `CLAUDE.md`,
`HANDOFF.md` (deleted), `README.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/STATUS.md`,
`docs/evidence/*`, `docs/research-notes/*`, `playwright.config.ts`, `tests/e2e/seed.ts`, and the
untracked `.claude/skills/`, `docs/process/`, `docs/reviews/*.md`, `gpt-*.md`,
`HANDOFF(depracted).md`, the Tuchscherer PDF)
**Role:** targeted residual verification (V-1…V-6 only; no architecture review, no literature search)
**Session:** `O-Max | PI-012 | Verify — Architecture Revision 3 Residuals`
**Model:** claude-opus-5 (1M context)
**Task/gate:** [PI-012](../BACKLOG.md#pi-012) — verify revision 3 of
[set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) against V-1…V-6 in
[set-groups-architecture-revision-verification.md](set-groups-architecture-revision-verification.md) §5,
using §18.2 as the correction map.
**Authorization boundary:** none of commit / push / staging / deploy / production / database. No
implementation. One disposable unit-test file was created inside `tests/unit/`, run, and deleted (§8.1).
**Files touched:** this file only
**Verdict:** APPROVED — READY FOR SET GROUPS OWNER DECISIONS
**Cites:** [set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) rev. 3
§5.4, §5.5, §7, §8, §9.1, §9.2, §10, §11.4, §12.1–§12.3, §13, §18.2;
[set-groups-architecture-revision-verification.md](set-groups-architecture-revision-verification.md) §5;
[BACKLOG.md PI-012](../BACKLOG.md#pi-012).

---

## 0. Summary

All six residuals are closed. Each correction landed in every location §18.2 names, no correction
contradicts another, and no stale cross-reference to the pre-correction wording survives anywhere in the
document. The two behavioural claims that could only be settled by execution — NC-4a's and NC-4b's
discrimination across all eight A-6 rows, including the newly added rows 4 and 8 — were reproduced
against the real strategy modules and match the evaluation exactly, row for row.

| Residual | Severity | Disposition |
|---|---|---|
| V-1 — `extraWorkSets` had no emission rule for ungrouped records | MEDIUM | **CLOSED** (§2) |
| V-2 — D-1 misclassified as settled owner intent | MEDIUM | **CLOSED** (§3) |
| V-3 — NC-4's expected observations wrong in two rows | LOW | **CLOSED, reproduced** (§4) |
| V-4 — two threshold percentages misrounded | LOW | **CLOSED** (§5) |
| V-5 — skipped-top reload behaviour unpinned | LOW | **CLOSED** (§6) |
| V-6 — D-3 read as a packaging decision | LOW | **CLOSED** (§7) |

One non-blocking presentational note (§5) and one non-blocking observation carried forward from
rev. 2's framing (§9). Neither changes the design, the acceptance matrix or any recommendation.

The core architecture and the H-1/H-2/M-1…M-4/L-1…L-8 closures were verified in the prior report and
were not reopened here.

---

## 1. Scope and method

Only V-1…V-6 and contradictions introduced by their corrections. I did not re-verify the architecture,
re-run the prior reproductions except where a new claim extended them, or touch the literature.

For each residual: read every location §18.2 names; check the correction says what the residual asked
for; grep the whole document for the pre-correction wording to catch stale references; and execute only
where a new *behavioural* claim was made (V-3's rows 4 and 8, and NC-4b's "every other row unchanged").
V-4 was verified arithmetically against the stated formula and rounding rule.

---

## 2. V-1 — grouped-only metadata omitted from ungrouped records → **CLOSED**

The rule is now stated once, unambiguously, and propagated to all eight locations.

**The rule** (§5.4): *"`prescribed.group` and `extraWorkSets` (§5.5) are **omitted entirely — not
`undefined`, not `[]` — from every ungrouped record**, so the client-computed `recommendation` op for an
ungrouped slot stays byte-identical to today's (A-10, NC-9), and a rolled-back server's `.strict()`
schema keeps accepting it (§8)."*

That is exactly what the residual asked for, including the `[]` case that was the actual hazard. §5.5's
audit paragraph carries the complementary half — `extraWorkSets` is *"present on every **per-group**
record (`[]` when there were none) and **omitted entirely from ungrouped records**"* — so the two states
are distinguished rather than conflated, and the matrix footer repeats it for the A-6 rows.

**Coverage across the eight locations:**

| Location | Verified |
|---|---|
| §5.4 emission rule | ✓ the rule, with the "not `undefined`, not `[]`" wording |
| §5.5 audit paragraph + matrix footer | ✓ per-group `[]` vs ungrouped omitted; footer states an ungrouped record carries neither key |
| §8 rolled-back-server row | ✓ the proviso now names **all four** grouped-only keys — `groupKey` on set-log and recommendation ops, `inputs.prescribed.group` and `inputs.extraWorkSets` on client-computed recommendation ops — "omitting them entirely otherwise". The rev. 2 gap (proviso named `groupKey` alone) is gone |
| §9.1 sync-contract row | ✓ all four listed together with "all four emitted only for grouped slots / per-group records and **omitted entirely** otherwise" |
| §10 item 11 (`recommendation.ts`) | ✓ "both **required on per-group records and omitted entirely on ungrouped ones**", pinned by A-10 / NC-9 |
| §10 item 12 (sync schema / builders) | ✓ set-log emitters carry `groupKey` only for grouped slots **and** `buildClientRecommendationOps` emits `prescribed.group` / `extraWorkSets` only for per-group records |
| §12.1 A-10 | ✓ both ops named; "an ungrouped set-log op **and** an ungrouped client-computed recommendation op are each byte-identical to today" |
| §12.3 NC-9 | ✓ both ops; "key set included (no `groupKey`, no `prescribed.group`, no `extraWorkSets`)" |

**Consistency, both directions.** §12.2's wire-drift risk row was widened to "for existing sets **and
for ungrouped client-computed recommendations**", guarded by "frozen literal comparison of both ops
(NC-9)". Grepping every `extraWorkSets` occurrence in the document (eleven, including §18) finds no
statement that contradicts the rule; A-6's "every record carries … `extraWorkSets` = the rest" is scoped
to the grouped matrix and is immediately followed by the ungrouped footer.

The design keeps the requirement at the builder/test level rather than forcing a conditional Zod shape,
which is the right altitude — `inputsSummarySchema` stays a plain strict object with two optional
additions, and A-10/NC-9 carry the emission contract. No correction needed.

---

## 3. V-2 — D-1 explicitly open before Stage A → **CLOSED**

- **Moved.** §13.1 now holds **D-2 and D-3 only**, with an explicit note: *"(D-1 moved to §13.3 in
  revision 3 — V-2: the backlog explicitly declines to preselect the schema and logging-contract change
  it entails.)"*
- **Placed correctly.** D-1 is the first row of §13.3 "Genuinely open product choices — required before
  the stage that needs them", stage **A**.
- **Full constraint quoted.** The row quotes the backlog bullet in full, including the sentence rev. 2
  omitted. I checked it verbatim against [docs/BACKLOG.md PI-012](../BACKLOG.md#pi-012): *"Preserve
  snapshots, legacy prescriptions, offline/replay behavior and historical training facts; assess profile
  compatibility, recommendation/carry-forward identity and existing block modifiers. **No physical
  schema or logging-contract change is preselected; surface any conflict with the unchanged-logging
  constraint before implementation.**"* — exact, with the reserving sentence emphasised rather than
  buried.
- **Advice is not approval.** The recommendation reads *"**Accept** — an engineering recommendation,
  **not** owner approval"*, followed by the concrete impact of accepting (one migration, two nullable
  columns, the `uq_recs_one_pending` rebuild, two sync payload keys, two per-group `inputs` keys, all
  grouped-only) and one worked example per branch — accept vs decline-to-ordinal. That is a decision
  surface, not a formality.
- **No stale framing.** Grepped every `D-1` occurrence: §4.3's pointer ("a consciously degraded choice
  (D-1, §13)"), the §13 preamble ("None is approved by this document … only the third kind needs the
  owner's deliberation" — now true of D-1), §13.1's move note, §13.3's row, §17 ("Not decided: D-1…D-8"),
  and §18's restructured row ("open product choices (D-1, D-6, D-4, D-5) … (D-1 reclassified in
  rev. 3)"). All consistent; nothing still presents D-1 as settled.

---

## 4. V-3 — NC-4a / NC-4b discriminate their respective rules → **CLOSED, reproduced**

§12.3 now carries two controls with fully specified expected observations, and NC-4b defines its window
selector precisely ("the `sets.min` recorded sets with the highest reps (ties → highest RIR)"), which is
what makes it executable rather than a description.

**Reproduced** against the real `evaluateLoadProgression` / `evaluateRepProgression` with the projection
`{repRange, sets 2, 6–8}` and stock configs — all eight A-6 rows under all three window selectors
(21 assertions, all passing):

| A-6 row (recorded sets) | Shipped first-`min` | NC-4a (no window) | NC-4b (best-`min`) |
|---|---|---|---|
| 1 `7@3, 7@2` | `increase_load` / `increase_reps` | unchanged | unchanged |
| 2 `+ 6@0` | `increase_load` / `increase_reps` | **`hold` / `hold`** (both flip) | unchanged |
| 3 `+ 5@1` | `increase_load` / `increase_reps` | `increase_load` / **`hold`** (rep only) | unchanged |
| **4 `+ 1@3`** | `increase_load` / `increase_reps` | `increase_load` / **`hold`** (rep only) | unchanged |
| 5 `5@1, 7@2, 7@2` | `hold` / `hold` | unchanged — **not exercised** | **`increase_load` / `increase_reps`** |
| 6 `7@3` | `hold` / `hold` | unchanged | unchanged |
| 7 none | `none` / `none` | unchanged | unchanged |
| **8 `7@3, 7@2, 6@0, 6@0`** | `increase_load` / `increase_reps` | **`hold` / `hold`** (both flip) | unchanged |

Every cell matches §12.3's text, including the two claims the brief singled out:

- **Rows 4 and 8 "flip by the same two mechanisms (row 4 rep-progression only, row 8 both)"** — confirmed.
  Row 4 flips only rep-progression because `every()` sees the 1-rep collapse while load-progression's
  `repShortfall` still slices to the projected `sets.min`; row 8 flips both because the trailing RIR-0
  set becomes the final set for the gate.
- **NC-4a "rows 1, 5, 6 and 7 are unchanged — row 5 in particular is not exercised by this control"** —
  confirmed; a set-difference check shows the control flips exactly rows 2, 3, 4 and 8.
- **NC-4b "row 5 flips … every other row is unchanged"** — confirmed; best-`min` and first-`min` select
  the same two sets in every other row.

Two supporting claims also verified: row 2's load-progression flip carries `FINAL_SET_RIR_AT_LIMIT`, and
row 3's load-progression is unchanged with `derived.prescribedSets = 2`, which is the mechanism §12.3
gives for why it does not flip. §12.2's range-semantics risk row now references both controls, and
§18's H-1 row says "NC-4a/NC-4b (split in rev. 3)". The only surviving bare `NC-4` string is inside
§18.2's own description of the split.

---

## 5. V-4 — thresholds recomputed → **CLOSED**

Verified directly from the stated formula `p ≥ (1 + t/30) / (1.20 × (1 + b/30))` at `t = 4`, to one
decimal, rounded half up:

| `b` | True quotient | One decimal, half up | §7 states | |
|---|---|---|---|---|
| 9 | 0.7264957… | **72.6 %** | 72.6 % | ✓ (was 72.7 %) |
| 8 | 0.7456140… | **74.6 %** | 74.6 % | ✓ (was 74.9 %) |
| 11 | 0.6910569… | **69.1 %** | 69.1 % | ✓ |
| 6 | 0.7870370… | **78.7 %** | 78.7 % | ✓ |

All four now correct. The denominators shown (1.5600, 1.5200, 1.6400, 1.4400) and the numerator (1.1333)
are right, the rounding rule is stated inline, and the "arithmetic on the tracker's formula, not a
policy claim" status is retained. The conclusion is unchanged and still correct: every threshold sits
below the owner's 80 % example, so that example keeps the top set in the trend for the stated back-off
band.

**Non-blocking presentational note.** The `b = 9` row prints the intermediate as `0.7265` (a correct
4-decimal rounding of 0.7264957…), but chaining *that* value through the stated half-up rule would give
72.7 %, not the stated — and correct — 72.6 %. Both figures are individually right; only the chain is
inconsistent. Showing `0.72650` as `0.7265` is the culprit. Worth a digit if the table is ever edited;
not a correction, and it does not affect any conclusion.

---

## 6. V-5 — skipped-top reload → **CLOSED**

Consistent across all three places, with no persisted skip mechanism implied:

- **§11.4 mount row:** *"**After a deliberately skipped top group** (Top has no sets, Back-off has some)
  a reload therefore re-selects **Top** — it is still unperformed — with the inputs derived from Top's
  own chain, never from Back-off's last set; no mis-attribution is possible and **no skip fact is
  persisted**. This is the chosen behaviour, pinned by A-9."* States the behaviour, the reason it is
  safe, and that it is deliberate rather than inherited.
- **A-9:** carries the matching assertion — Top has no sets, Back-off has two, selection resolves to Top,
  inputs derive from Top's chain "never from Back-off's last set", explicitly "no persisted skip
  mechanism".
- **A-17:** the reload/resume clause now reads "(including after a skipped Top: Top is re-selected with
  its own prefill, per A-9)", so the browser-level check references the unit-level pin rather than
  restating it differently.

No contradiction with §11.4's pre-existing "Skip the top group today" row, which still says the absence
of sets *is* the first-class "no top set today" and that "there is no separate skip fact and none is
needed". The two rows now say the same thing from opposite ends of the session.

---

## 7. V-6 — build stages, packaging open → **CLOSED**

- **§0 item 6:** *"A and B are **build stages**; whether they ship together or separately is the owner's
  packaging choice, and no usage waiting period is imposed."*
- **§9.2:** *"A and B are **build stages** (rev. 3, V-6): B follows A as soon as D-5 … is decided — on
  the decision, not on elapsed time or accumulated use … Whether A and B ship together or apart is the
  owner's packaging choice and is not pre-committed here."*
- **§13.1 D-3:** *"**A, then B, as build stages.** Whether they ship together or separately remains the
  owner's choice (§9.2); no usage waiting period is imposed."*
- **§18** A/B row: "Build stages, decided on D-5, no use-gating, packaging left to the owner."

The rev. 2 phrasing "not separate releases" — the source of the residual — no longer appears anywhere in
the document. Build ordering and release packaging are now cleanly separated, and the no-usage-gate
statement is repeated in all three places without drifting.

---

## 8. Verification performed

### 8.1 Disposable reproduction (created, run, deleted)

`tests/unit/zzV3ControlCheck.test.ts` (inside `tests/unit/` because `vitest.config.ts` scopes `include`
to `tests/unit/**/*.test.ts`), deleted immediately after the run.

```
pnpm vitest run --config vitest.config.ts tests/unit/zzV3ControlCheck.test.ts
✓ tests/unit/zzV3ControlCheck.test.ts (21 tests)
Test Files  1 passed (1)     Tests  21 passed (21)
```

Scope deliberately narrow, per the brief: the eight A-6 rows under the shipped first-`min` selector
(baseline, re-confirming rows 4 and 8 which rev. 2's run covered only partially), the same eight under
NC-4a, the same eight under NC-4b, plus the two supporting reason-code / `prescribedSets` claims. Prior
reproductions (the A-6 outcomes themselves, the §5.4 safety property, both §7 e1RM sessions, the
threshold boundary) were reused from
[revision-verification §7.1](set-groups-architecture-revision-verification.md) and not re-run.

### 8.2 Non-executed checks

V-1, V-2, V-5 and V-6 are documentation-consistency residuals and were verified by reading every named
location plus a whole-document grep for the pre-correction wording (`NC-4` unsplit, "not separate
releases", `D-1` framing, `extraWorkSets` mentions). V-4 was verified arithmetically. V-2's quotation was
checked verbatim against `docs/BACKLOG.md`.

No database, migration, build, lint, E2E or full suite was run; none is required for a targeted
residual verification, and the brief limits execution to what a finding needs.

### 8.3 Working-tree integrity

`git status --porcelain=v1` captured before the work and after the scratch file was removed: **identical**,
30 entries. The evaluation (modified 14:12, before this session), the research report (12:58), the
original review (00:47), the first revision verification (13:37) and the Tuchscherer PDF (Sep 11 23:24)
are all untouched by this task. The only file this task adds is this report.

---

## 9. Non-blocking observation

`NC-9` is written as an assertion ("each ungrouped payload equals its frozen pre-feature literal") rather
than as a mutation control that breaks something and requires A-10 to fail — unlike NC-4a/NC-4b/NC-5…NC-8,
which all name the mutation. This framing predates revision 3 (rev. 2's NC-9 read "as stated"), so it was
not introduced by the V-1 correction, and the V-1 widening left it structurally as it was. It is a
reasonable reading of [agent-workflow §6](../process/agent-workflow.md#6-negative-control-policy), whose
must-execute list mixes assertions and controls. Flagged only so the implementer states which byte-level
comparison actually runs. **No correction required.**

---

## 10. Remaining owner decisions

Restated concisely from §13. **None is approved by this verification, and architecture approval is not
implementation authorization** — no schema, code, migration, staging, commit, push or deployment is
authorized here.

**Open, required before Stage A:**

- **D-1** — accept the physical schema and logging-contract change for explicit per-set attribution
  (nullable `set_logs.group_key` and `recommendations.group_key`, `uq_recs_one_pending` rebuild, two
  sync payload keys, two per-group `inputs` keys, all grouped-only), or take ordinal set-number
  partitioning with §4.3's failure table as accepted behaviour. *Engineering recommendation: accept.*
- **D-6** — when an existing slot becomes a **multi-group** scheme, does its ungrouped history go to the
  first group, to nobody, or does the editor ask? *Recommended default: (a) first group, symmetric.*

**Confirmation only (follows from the owner's own V1 wording):**

- **D-2** — per-group recommendation records rather than A-lite.
- **D-3** — build order A then B as build stages; release packaging remains the owner's choice, with no
  usage waiting period.

**Required only when Stage B is scheduled:**

- **D-4** — link basis offered (`performed`, `prescribed`, or both) and nearest vs floor rounding.
  *Recommended: both, editor pre-selects nothing; nearest.*
- **D-5** — accept the fenced ADR-008 amendment (one backward hop inside a slot). *Recommended: accept
  as §6.5 writes it.*

**Decided by the evaluation unless the owner overrules** (correctly not gates): **D-7** first-`min`
window, **D-8** advance at `max` with unconditional re-derivation, **C-1** single-group conversion, and
the sixteen routine defaults in §13.4.

---

## 11. Not done, not claimed

- **Not executed:** any build, lint, typecheck, migration, integration or E2E suite; any database
  command; the app. The only command run was the single disposable vitest file in §8.1.
- **Not re-done:** the architecture review, the H-1/H-2/M-1…M-4/L-1…L-8 closures, any literature search,
  the PI-018 collision gate.
- **Not claimed:** that the acceptance matrix has been executed — A-1…A-17 remain unrun by anyone; that
  an implementation review will find nothing further; any measured performance or device behaviour.
- **Not modified:** the evaluation, the research report, the PDF, the original review, the first
  revision verification, `docs/BACKLOG.md`, and every concurrent path.
- **Created:** this file only. Created and deleted: `tests/unit/zzV3ControlCheck.test.ts`.

APPROVED — READY FOR SET GROUPS OWNER DECISIONS
