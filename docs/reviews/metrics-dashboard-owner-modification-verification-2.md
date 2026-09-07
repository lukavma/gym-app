# Metrics Dashboard — Second Targeted Owner-Modification Verification

Date: 2026-09-06
Role: closure check on the corrections applied to `docs/reviews/metrics-dashboard-architecture-evaluation.md` (now 864 lines; correction log at the end of its Appendix D) against the findings of `docs/reviews/metrics-dashboard-owner-modification-verification.md` (OM-1 Medium, OM-2 … OM-8 Low, plus non-blocking observations 5.1–5.3).
Baseline reports, all byte-unchanged: `metrics-dashboard-architecture-review.md` (`72f73e90…`), `metrics-dashboard-architecture-revision-verification.md` (`b8db84aa…`), `metrics-dashboard-owner-modification-verification.md` (`dee7630e…`).
Repository state: `main` @ `1282795`, plus the pre-existing uncommitted working-tree changes, untouched.
Scope: the previously reported findings and their interactions only. No settled decision revisited, no code written, no existing report modified, no unrelated file touched. One focused probe was run (Appendix A).

---

## 1. Verdict

# `VERIFIED — READY FOR IMPLEMENTATION`

**All eight findings are closed**, and both non-blocking observations were addressed rather than merely acknowledged. The one that mattered — OM-1, the invariant whose own enforcement recipe fired on the table O-3 requires — is closed in the strongest available way and **confirmed by probe**: I-2 is now scoped to *declared column names* rather than file text, the table-name pattern is gone with the reason recorded in the invariant itself, and the negative control it asserts against the post-`0012` schema holds — 103 distinct column names across `src/db/schema/**`, every `drizzle/*.sql`, and the five columns migration `0012` adds, with **zero hits**. RL-11, which OM-1 had reopened, is closed again on better ground than before: the previous list was a whole-file grep that happened to pass; this one tests the thing the invariant is actually about.

Two of the seven Low corrections are better than what was asked for. **OM-3** was not resolved by deleting the duplicated step 5 but by giving it a reason to exist — it now holds exactly one edit, PI-004's trigger note, "which records the nav geometry actually measured on the device in step 4 / A-24 and therefore cannot be written earlier", with step 0 stating that it holds "the **only** documentation edits before device acceptance". **OM-4**'s R-8 was not deleted but replaced with the risk that actually remains for a table anything with database access can write, pointed at the two criteria that defend it (A-28's constraint witness, A-26's foreign-row read test). Non-blocking **5.1** corrects the earlier report's own loose phrasing: `userVolumeLockKeys` derives *both* integers from the UUID, so the metrics lock takes a fixed namespace integer plus a per-user key instead — stated explicitly, with the reason the helper cannot simply be reused.

**Nothing regressed.** O-1 … O-11 are unchanged; the owner-modified selection design is untouched; all 27 findings of the original review remain closed; the statement counts, invariant set, acceptance suite and ledger counts are identical to the previously verified state.

Three residual items are recorded in §4. All are cosmetic or belt-and-braces, none blocks implementation, and none is a finding.

---

## 2. Closure of each finding

| ID | Required | Applied | Status |
| --- | --- | --- | --- |
| **OM-1** | Narrow I-2's pattern list, or scope it to column names, keeping a real witness and a control that passes with `0012` in the tree | I-2 rewritten: "scoped to what the invariant is actually about — **declared column names**, not file text: the test extracts every column name from `src/db/schema/**` (the first string argument of each Drizzle column builder) and every column of a `CREATE TABLE` / `ADD COLUMN` statement in `drizzle/*.sql`". `/dashboard/i` dropped; `/metrics?_/i` replaced by `/e1rm_?(kg\|value)/i`; `mean` added to the averaging pattern; the negative control restated "against the schema **as it stands after migration `0012`**"; the selection table's five columns are named as passing; and the reason for dropping the table-name pattern is written into the invariant ("would fire on the very table O-3 requires … dropped for that reason (OM-1)") | **CLOSED — probe-confirmed** (Appendix A) |
| **OM-2** | §4's archived-exercise clause must not restate the automatic-index rule | Now: "appear in M-4 **only when selected** (O-3/O-7), badged `Archived`, in whichever row state their facts give (§7, A-8)" — agreeing with M-4's own cell, §7 and A-8 | **CLOSED** |
| **OM-3** | Merge §20 step 5 into step 0; repoint O-11 | Step 0 carries all eight edits (including the evidence-to-design row's description) and states "These are the **only** documentation edits before device acceptance; step 5 holds the one edit that must wait." Step 5 is now "**Docs after device acceptance** (one edit …): PI-004's trigger note … which records the nav geometry actually measured on the device in step 4 / A-24 and therefore cannot be written earlier. Everything else is step 0." O-11's ledger entry now reads "the plan/OD-04/`mvp-scope.md` edits of **§20 step 0**" | **CLOSED** |
| **OM-4** | Delete or restate R-8 | Restated as "**R-8 Selection-table integrity drift.** The three-layer five-row limit and the ownership predicates are the whole defence of a table that anything with database access could write. Mitigation: A-28's direct-SQL constraint witness and A-26's foreign-row read test … the card is bounded to ≤ 5 rows regardless of how many exercises are trained, so there is no growth risk to manage." Both cited criteria exist and say what R-8 claims | **CLOSED** |
| **OM-5** | Correct the pre-renumbering row counts | R-10 now: "Steps 4–7's fact join and **step 3** are the widest statements (≈ 2,400 and ≈ 1,600 rows); the selection-bounded fact query (step 9) is ≈ 300–800." `2,500` no longer appears anywhere in the document | **CLOSED** |
| **OM-6** | Reword §11.3's "no migration boundary" against B-3 | Now: "**The first remedy is a migration**, so B-3's 'exactly one additive migration, `0012`' holds unconditionally only while the budget is met … a covering index would be a second, performance-only migration, still storing nothing derived (I-2)." The remedy, B-3 and I-2 are reconciled in one sentence | **CLOSED** |
| **OM-7** | Replace "All exercises" in §13 | §13's Links bullet now lists "Choose exercises", "Full history", "Volume screen", "Bodyweight log", "Recovery log", and adds "and every metrics spec locates them with `exact: true`". `All exercises` occurs nowhere in the document | **CLOSED** |
| **OM-8** | Qualify A-20's A-28 reference; restore A-25's place | A-20 now reads "(the tracker's own A-28 pattern in ADR-011's numbering — **not this document's A-28**)". Criterion order is A-23, A-24, **A-25**, A-26 … A-34, with A-25's text unchanged | **CLOSED** |

### Non-blocking observations

| ID | Applied | Status |
| --- | --- | --- |
| **5.1** | §11.5 now specifies "the two-int form `pg_advisory_xact_lock(namespace, userKey)` — a fixed metrics namespace integer, and a per-user 32-bit key derived from the user id the way `userVolumeLockKeys` … derives its second key. (That helper derives *both* ints from the UUID, so it cannot simply be reused with 'a different constant'; the metrics variant takes a constant first key so the two features can never contend on the same lock pair.)" This matches `src/server/volume/service.ts:136-142` exactly and is more precise than the observation that prompted it | **Addressed** |
| **5.2** | §11.5: validation reads "the submitted exercises and the caller's currently-stored selection (for the already-stored exemption) — one statement as a single left join, or two; no criterion asserts the write-path statement count, so either is acceptable (§11.3)". §11.3's bullet agrees: "1 lock statement + **1 or 2 validation reads** + 1 delete + 1 insert … its statement count is not an acceptance criterion" | **Addressed** |
| **5.3** | Carried forward unchanged by explicit choice, as recorded | **Accepted** |

---

## 3. No regression

### 3.1 The corrections did not disturb what they touched

Each edited section was re-read around the edit:

- **§4** — the other four rules in the block (SQL-scope, discarded sessions, no-metric-combines-two-sources, future-dated rows with the Volume exception) are unchanged; the eight `[P]` labels survive.
- **§11.3** — the exact-statement-count paragraph, the boundedness clause, the local latency budget and the "new client behaviour" note are unchanged; only the migration sentence and the write-path bullet moved.
- **§11.5** — the schema table, the three-layer limit argument, the delete-then-insert rationale for needing no deferrable constraint, "the later one wins as a whole list", the change-behaviour table and "What the selection is not" are all intact; only the lock derivation and the validation-read count were rewritten.
- **§13** — the RL-1 accepted-summary passage and the editor accessibility bullet are unchanged.
- **§16** — I-1, I-3 … I-13 are untouched; I-11's `ORDER BY exercise_id, started_at, position, set_number` is still contractual, and I-13 still states the selection is presentation only.
- **§18** — R-1 … R-7, R-9, R-11 … R-14 are unchanged.
- **§19** — A-12's four pinned counts and its boundedness clause, A-13's `dashboard_estimate_selections`-only write log, and A-26 … A-34 are unchanged; A-20 and A-25 changed only as OM-8 required.
- **§20** — steps 0b, 1, 2, 3, 4, the must-not-change list and the two naming rules are unchanged.

### 3.2 O-1 … O-11 intact

The addendum's eleven decisions are word-for-word as verified, including the O-3/O-7/O-8 modifications and O-11's Phase 9a approval; §21's parallel record still flags the three modified entries and points at the addendum as binding. Only O-11's `§20 step 5` → `§20 step 0` pointer changed, as OM-3 required.

### 3.3 Structural counts unchanged

11 owner decisions (× 2, addendum and ledger), 13 invariants, 34 acceptance criteria (A-23 withdrawn, numbering kept), 10 binding recommendations, 18 deferred items, 18 rejected alternatives, 13 non-goals, 14 risks, 17 Appendix B findings. Statement counts unchanged: "11 statements minimum, 13 typical, 15 worst case" with a selection, and A-12's pinned **11** / **13** / **10** / **12** plus selection-size independence.

### 3.4 All 27 review findings still closed

Re-checked by marker: RH-1 ("deliberate divergence from Volume"), RH-2 ("no `is_warmup` predicate, no `count`"), RM-1 ("exactly these two weeks"), RM-2 ("never as an inequality"), RM-3 ("part of the binding contract"), RM-4 ("Two meanings of one badge"), RM-5 (the mean's own count), RM-6 (step 8's `and exercises.user_id = :userId`, ownership "on **both** tables"), RM-7 (§15's two ban scopes), RM-8 ("no claim about production hardware"), RL-1 ("RL-1, accepted"), RL-2 ("circles only, no `polyline`"), RL-3 ("the service's return value"), RL-4 (three offline cases), RL-5 (`exact: true`), RL-6 ("runs on `/today` only"), RL-7 ("`raw` travels"), RL-8 (one bodyweight statement), RL-9 ("Deload sessions are not counted."), RL-10 (`[P]` labels), **RL-11 (re-closed by OM-1's fix)**, RL-12 (A-23 withdrawn), RL-13 ("new client behaviour"), RL-14 (O-11 + step 0), RL-15 ("one of the two always runs"), RL-16 ("≈ 2.2 contributions"), RL-17 ("0 occurrences today").

### 3.5 Removed design stays removed

`trainedWithoutEstimateCount` occurs twice, both times as a *record of its removal* — the addendum's O-8 entry and Appendix D's Revision-2 change log. It appears in no DTO, query, invariant, copy rule or criterion. The two remaining `§20 step 5` mentions are likewise historical: Appendix D's Revision-1 row for RL-14 and the correction log's own OM-3 row. Both classes are correct as change records and should stay.

---

## 4. Residual, non-blocking

1. **I-2's named witnesses cover two of six patterns.** The requirement is stated correctly — "an anti-vacuity witness proving **each pattern** fires on a synthetic column" — but the two examples given, `numeric("tonnage_kg")` and `numeric("seven_day_avg_kg")`, exercise only `/tonnage/i` and `/(rolling|seven_day|thirty_day|avg|average|mean)_/i`. `/work_?sets?/i`, `/sessions?_(per|count)/i`, `/e1rm_?(kg|value)/i` and `/snapshot_(kg|count)/i` have no named witness. The requirement governs, so an implementer following it writes six; naming one per pattern (or marking the two as examples) would remove the ambiguity.
2. **Scope note on the OM-1 fix, for the record.** Testing column names rather than file text means a future *table* named for a metric would no longer trip I-2 on its name alone. The trade is right — the alternative fires on the owner's own table — and the residual is small: an aggregate table has to store something, and the derived-value column patterns catch what it would have to be called, while A-22's `drizzle/` gate independently confines this feature to `0012`. Worth one sentence in I-2 only if the owner wants it said out loud.
3. **R-11 is listed after R-14**, a leftover of Revision 2's insertions — the same cosmetic class as the A-25 ordering OM-8 fixed, and never flagged. Move it for symmetry, or leave it.

---

## Appendix A — Probe

Read-only; nothing was left in the repository.

**Probe — I-2's corrected enforcement, against the schema as it will stand after `0012`.** A standalone Node script extracted every declared column name from `src/db/schema/**` (the first string argument of each Drizzle column builder) and from every `drizzle/*.sql` DDL statement, added the five columns §11.5 specifies for `dashboard_estimate_selections` (`user_id`, `exercise_id`, `position`, `created_at`, `updated_at`), and applied I-2's six corrected patterns:

- **103 distinct column names scanned; 0 hits.** The negative control I-2 now asserts holds against the post-`0012` schema, so the test as specified is implementable and passes.
- Witness coverage of the two named examples: `/tonnage/i` ← `tonnage_kg`; `/(rolling|seven_day|thirty_day|avg|average|mean)_/i` ← `seven_day_avg_kg`; the other four patterns have no named witness (§4 item 1).

Previously established and unaffected: `strengthBoundary.test.ts`'s own `COLUMN_PATTERNS` do not fire on the new table, so A-22's "`strengthBoundary.test.ts` passes without modification" continues to hold; the `/strength/i` and `/warmup/i` path inventories match none of the files the modification adds.

No production system was contacted.

## Appendix B — What was and was not checked

**Checked:** the correction log; the corrected text of §4's rules block, §11.3 (latency and selection-write bullets), §11.5 (concurrency and validation), §13 (Links), §16 I-2, §18 R-8 and R-10, §19 A-20 and the A-23…A-34 ordering, §20 steps 0 and 5, §21 O-11; the surrounding text of every edited section for collateral drift; the addendum's O-1…O-11; structural counts; the 27 review-finding markers; the selection-design markers; and a document-wide sweep for the specific stale strings each finding named.

**Deliberately not repeated** (settled by the three baseline reports): the architecture review; the selection design's substance; the metric algorithms; the timezone probe; the statement-count derivation; the boundary-suite analysis; the evidence-corpus checks. No test suite, build, lint or typecheck was run — no source file changed.

## Appendix C — Working-tree impact

Created: `docs/reviews/metrics-dashboard-owner-modification-verification-2.md` (this file). Nothing else was created, modified, or deleted; the evaluation and all three prior reports are untouched, and every unrelated working-tree change — `CLAUDE.md`, the `HANDOFF.md` deletion and `HANDOFF(depracted).md`, `docs/input/product-ideas.md`, `.claude/skills/`, the two `repository-agent-workflow-*` documents, `warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md` — is intact. No commit, push, deployment, migration, seed, or production access was performed. The probe script lives only in the session scratchpad, outside the repository.

---

# `VERIFIED — READY FOR IMPLEMENTATION`
