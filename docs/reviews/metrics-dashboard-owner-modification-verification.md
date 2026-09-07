# Metrics Dashboard — Targeted Verification of the Owner-Modified Evaluation

Date: 2026-09-06
Role: targeted verification that the owner-decision addendum and Revision 2 of `docs/reviews/metrics-dashboard-architecture-evaluation.md` (now 849 lines) integrate O-1 … O-11 coherently — with particular attention to the owner-modified O-3 / O-7 / O-8 selection design — without reopening any finding closed by `docs/reviews/metrics-dashboard-architecture-review.md` or by `docs/reviews/metrics-dashboard-architecture-revision-verification.md`, and without expanding Phase 9a.
Baseline: those two documents, both byte-unchanged (`72f73e90…` / `b8db84aa…`).
Repository state: `main` @ `1282795`, plus the pre-existing uncommitted working-tree changes, untouched.
Scope: verification only. No code was written, no source document altered, no settled decision revisited, no unrelated file touched. Two focused probes were run (Appendix A).

---

## 1. Verdict

# `REVISION REQUIRED`

**The owner-modified design itself is verified and needs no change.** The athlete-curated selection is the right shape and is specified to a genuinely implementable level of detail: a single additive, user-scoped relational table holding *configuration and nothing derived*; a three-layer five-item limit that is impossible to exceed at the database level; ownership in the `WHERE` clause on both tables; eligibility decided once, by the existing domain gate, never copied into SQL; idempotent full-replacement writes under a per-user advisory lock with last-list-wins semantics; a per-row state machine that keeps a selected row visible and stable through archiving, switching off, equipment changes and evidence ageing; and a complete exclusion from the outbox, IndexedDB, the service worker, the Today bundle and the active-session aggregate. Every repository fact it leans on was checked and holds — including the `exercise_muscle_contributions` precedent it cites for the composite key and the cascade, and the `DELETE /api/exercises/[id]` + FK-`RESTRICT` pair that makes its "hard-deleted (no history)" row true. **Twenty-six of the review's twenty-seven findings remain closed**, the statement arithmetic re-derives exactly, and no scope leaked into charting, coaching, offline sync or e1RM Release B.

It is `REVISION REQUIRED` for one reason, plus housekeeping:

**OM-1 — invariant I-2's own pattern list fires on the table O-3 requires, which reopens RL-11.** I-2 is binding and states its own enforcement: seven named patterns over `src/db/schema/**` and `drizzle/*.sql`, "with an anti-vacuity witness … and a negative control **proving it does not fire on the existing schema**". One of those patterns is `/dashboard/i`, and the owner-mandated table is `dashboard_estimate_selections`. Probed: the pattern matches both the new schema file and migration `0012`. An implementer who writes `metricsBoundary.test.ts` exactly as I-2 specifies produces a test that fails on their own migration. RL-11 was closed in the previous round precisely by giving I-2 named patterns and a real negative control; the owner modification silently invalidates it.

The fix is one line — narrow the list to derived-value names (drop `/dashboard/i`; tighten or drop `/metrics?_/i`), or scan column declarations rather than whole files and record a named carve-out for the selection table with its reason ("configuration, not derivation", already stated in I-2's own second sentence). Nothing about the owner's decision needs to change.

Alongside it, **seven Low items (OM-2 … OM-8)** are stale text left behind by the rewrite: one of them (OM-2) is a sentence in §4 — a section labelled "binding for implementation" — that still states the removed automatic-index rule and directly contradicts both M-4's new text and acceptance criterion A-8. The remaining six are cross-reference and numbering drift.

None of the eight touches the design. Expect one substantive edit (I-2) and seven text corrections.

---

## 2. Findings

| ID | Severity | Finding | Where |
| --- | --- | --- | --- |
| **OM-1** | **Medium** | I-2's `/dashboard/i` pattern matches `dashboard_estimate_selections`; its stated negative control cannot hold once migration `0012` exists. **Reopens RL-11.** | §16 I-2 |
| **OM-2** | Low | §4's archived-exercise rule still says archived exercises "appear in M-4 when they have a current estimate" — the automatic-index rule, contradicting M-4, §7 and A-8 | §4 rules |
| **OM-3** | Low | §20 schedules the same eight documentation edits twice, at two different times (step 0 "before code" and step 5 "after acceptance"); O-11's ledger entry still points at step 5 | §20, §21 O-11 |
| **OM-4** | Low | R-8 describes the removed automatic index ("100+ distinct exercises in 90 days"); the card is now bounded to ≤ 5 stored rows | §18 R-8 |
| **OM-5** | Low | R-10 and §11.3 carry pre-renumbering row counts: "step 8 … ≈ 2,500 rows" (step 8 is now the ≤ 5-row selection join); "the widest step touches ≈ 2,500 rows" | §18 R-10, §11.3 |
| **OM-6** | Low | §11.3 still calls it "the 'no migration' boundary (B-3, I-2)" although B-3 now names migration `0012` | §11.3 |
| **OM-7** | Low | §13's card-link list still names "All exercises"; §9, §12.2 and A-18 replaced it with "Choose exercises" | §13 |
| **OM-8** | Low | A-20's "(the A-28 pattern)" now collides with this document's own A-28 (limits); A-25 is listed after A-34 | §19 |

### 2.1 OM-1 — I-2 fires on its own new table (reopens RL-11)

I-2, verbatim: *"Enforced the way `strengthBoundary.test.ts` enforces its column claim: a named pattern list over `src/db/schema/**` and `drizzle/*.sql` — `/tonnage/i`, `/work_?sets?/i`, `/sessions?_(per|count)/i`, `/(rolling|seven_day|thirty_day|avg|average)_/i`, `/metrics?_/i`, `/dashboard/i`, `/snapshot_(kg|count)/i` — with an anti-vacuity witness … and a negative control proving it does not fire on the existing schema."*

The template it names reads whole files, not column declarations (`tests/unit/strengthBoundary.test.ts:453-460` applies each pattern to `readFileSync(file, "utf8")`). §11.5 mandates `src/db/schema/dashboardEstimateSelections.ts` and migration `0012` creating `dashboard_estimate_selections`. Probe (Appendix A, probe 1): `/dashboard/i` matches **both** artefacts; the other six patterns do not fire. So exactly one pattern, on exactly the table the owner decision requires, turns I-2's negative control false.

This is not a hypothetical: RL-11 was closed in the previous round by replacing an unspecified grep with this named list plus a negative control, and the previous verification confirmed the list by probe (0 hits over 36 files). The owner modification adds the one file name the list happens to match.

The invariant's *substance* is unaffected and remains true — I-2's own second sentence already draws the right distinction ("The selection table holds `(user_id, exercise_id, position)` and nothing derived — no estimate, name, eligibility flag or snapshot"). Only the enforcement recipe needs narrowing. Three workable forms, any one of which closes it:

1. Drop `/dashboard/i` and tighten `/metrics?_/i`; the remaining five patterns still name derived quantities and still fire on the `numeric("tonnage_kg")` witness.
2. Apply the patterns to declared **column names** only (the thing the invariant is actually about), which `dashboard_estimate_selections`' columns — `user_id`, `exercise_id`, `position`, `created_at`, `updated_at` — pass cleanly.
3. Keep the list and add an explicit, reasoned carve-out for this one table, in the style of `strengthBoundary.test.ts`'s own edge-specific exceptions.

Form 1 or 2 is preferable: a carve-out for the very table a reader would most suspect weakens the control that RL-11 exists to provide.

*Checked and clear:* `strengthBoundary.test.ts`'s own `COLUMN_PATTERNS` (`/e1rm/i`, `/estimated_?1rm/i`, `/strength_?estimate_?(value|kg)/i`, `/starting_?suggestion/i`, `/suggested_?load/i`, `/strength_?confidence/i`) do **not** fire on the new table or migration (probe 1), so A-22's "`strengthBoundary.test.ts` passes without modification" holds.

### 2.2 OM-2 … OM-8 — stale text

- **OM-2.** §4's rules block still reads: *"**Archived exercises count** in M-1/M-2/M-5 exactly as today …, **and appear in M-4 when they have a current estimate**, badged `Archived` (§7)."* Under O-3 an archived exercise appears in M-4 only if it is *selected*. M-4's own rewritten cell says "Every selected exercise is a row, always"; §7 says an *already-selected* archived exercise stays; A-8 says "an unselected exercise, archived or not, with any history → **no row**". The addendum's blanket "where an earlier passage describes the automatic index, this addendum and the revised sections control" covers it in principle, but §4 is headed "binding for implementation" and this sentence is the direct opposite of A-8. Replace the clause with "and appear in M-4 only when selected (O-3/O-7)".
- **OM-3.** §20 step 0 lists eight pre-code documentation tasks (implementation-plan Phase 9a, open-decisions OD-04, mvp-scope §2 tonnage, data-model §2.20, pwa-offline-strategy §2, evidence-to-design row, README route list, PI-002 audit list). §20 step 5, "Docs after acceptance", re-lists seven of the same eight; only PI-004's trigger is unique to it. An implementer cannot tell when these edits happen. Fold step 5 into step 0, leaving step 5 with PI-004 only (or delete it). §21's O-11 entry likewise still says "the plan/OD-04/`mvp-scope.md` edits of **§20 step 5**", which step 0 now owns.
- **OM-4.** R-8 ("Strength index growth. Bounded by exercises with completed sessions in 90 days (tens, not hundreds); no pagination needed. If a user ever trains 100+ distinct exercises in 90 days the list is long but still one bounded query") describes a card that no longer exists. The bound is now five stored rows, enforced three ways. Either delete R-8 or replace it with the risk that actually remains — a selection that goes stale, which R-14 already covers.
- **OM-5.** R-10 says "Steps 4–7's fact join and **step 8** are the widest statements (≈ 2,400 and ≈ 2,500 rows)". After the renumbering, step 8 is the selection join (0–5 rows) and the fact query is step 9 at ≈ 300–800; ≈ 2,500 appears nowhere in §11.2 any more, where the widest are steps 4–7 (≈ 2,400) and step 3 (≈ 1,600). §11.3's "the widest step touches ≈ 2,500 rows" is stale for the same reason. (§11.3's remedy list *was* renumbered correctly — "splitting steps 3 and 9".)
- **OM-6.** §11.3 closes with "**The first remedy is a migration**, so the 'no migration' boundary (B-3, I-2) is unconditional only while the budget is met". B-3 now reads "exactly one additive migration, `0012`". The sentence's point survives — no *further* migration — but it should say so.
- **OM-7.** §13's Links bullet still lists card-level names as "Full history, **All exercises**, Volume screen, Bodyweight log, Recovery log". §9, §12.2's layout rules and A-18 all use "Choose exercises"; the "All exercises" link was deliberately dropped (§9: "the library keeps its per-row strength links … and the nav keeps its Exercises link, so nothing selectable is unreachable"). The list matters because it is the basis for the `exact: true` locator rule.
- **OM-8.** A-20's "(the A-28 pattern)" was a reference to `strengthCopy.test.ts`'s A-28 in ADR-011's numbering; this document now has its own A-28 ("Integration, limits"). One qualifying word ("the tracker's A-28 pattern") removes the ambiguity. Separately, A-26 … A-34 are listed between A-24 and A-25, leaving A-25 last — cosmetic.

---

## 3. The owner-modified O-3 / O-7 / O-8 design — verified

Each row below was checked against the repository or re-derived, not read past.

| Requirement (addendum) | How the document meets it | Verified against |
| --- | --- | --- |
| **Persisted account-side, works across devices** | `dashboard_estimate_selections` (§11.5), migration `0012`, read by `GET /api/metrics` step 8 and `GET /api/metrics/selection`. Not `localStorage`, not IndexedDB, not a JSON column, not a third `strength_estimate` value (X-14 … X-17, each with a stated reason) | A-32's cross-device read-back has no client state to differ — correct, the editor holds nothing across mounts |
| **Stable, user-defined order; never auto-reordered** | `position smallint`, `ORDER BY position` in step 8; I-9 "rows render in the athlete's stored order, never by value or recency"; A-7 "rows are emitted in stored `position` order for every permutation of the input"; A-27 asserts `[c, a, b]` stays `c, a, b` | Consistent across §4 M-4, §9, §11.1, §11.2, I-9, I-11, A-7, A-27 |
| **Five-item limit** | Three independent layers: Zod `max(5)`, `ck_dashboard_estimate_selections_position between 1 and 5`, and `unique (user_id, position)`. The reasoning that check + unique makes a sixth row impossible at the database level is sound; A-28 asserts all three, including a direct-SQL constraint witness | The claim "no deferrable constraint is needed because the write replaces the whole list in one transaction (delete, then insert)" is correct, and is the reason this table avoids the hand-patched `DEFERRABLE INITIALLY DEFERRED` that `uq_session_exercise_position` and `uq_set_number` need |
| **Eligibility rules; the selection never affects e1RM** | Candidates = `evaluateExerciseEligibility` ∧ not archived ∧ not already selected; the write re-validates server-side with ownership in the `WHERE` clause; the rule is never copied into SQL. I-13 states the invariant, A-34 proves it by re-running A-9 through the selection path | `evaluateExerciseEligibility` requires `equipment ∈ STRENGTH_ELIGIBLE_EQUIPMENT` and `strengthEstimate !== 'off'` (`src/domain/strength/eligibility.ts:29-37`) — exactly what §11.5 says |
| **Empty / no-estimate / archived / ineligible states** | Four row states (`estimate`, `no_current_estimate`, `not_available`, `turned_off`) plus the `Archived` badge, defined in M-4, enumerated in §11.5's change table, rendered in §12.2, required by §15, asserted by A-7/A-8/A-29 | The two refusal lines are the tracker's own copy, verbatim: `EXERCISE_CATEGORY_UNSUPPORTED` → "Not available for this equipment type", `EXERCISE_ESTIMATE_DISABLED` → "Strength estimate turned off for this exercise" (`src/ui/strength/copy.ts:70-71`) |
| **An already-selected archived exercise stays; a new one cannot be added** | §7 and §11.5's validation split ("if it is **not** already in the caller's stored selection, it must not be archived"); the candidate list never offers an archived exercise; A-29 asserts both directions | Consistent with the F2 archive-as-picker-visibility rule and with ADR-011 O-15 (the detail page serves archived exercises and already says "This exercise is archived. Its history is still shown here." — `src/ui/strength/StrengthScreen.tsx:131-134`) |
| **Concurrency** | One transaction: `pg_advisory_xact_lock` on a per-user key → validate → delete → insert. Two PUTs serialise; the later list wins **whole**; no interleaving is representable because the unique index would reject it. A-31 uses the repository's own `recoveryConcurrency` test pattern | `userVolumeLockKeys` + `pg_advisory_xact_lock` is a real in-repo pattern (`src/server/volume/service.ts:136-142`, `:275-276`), and `tests/integration/recoveryConcurrency.integration.test.ts` exists |
| **API / schema boundaries** | `GET`/`PUT /api/metrics/selection` only; `PUT` is full replacement, no PATCH, no per-row "move" (X-18: order would otherwise depend on request arrival). Both `NetworkOnly` by the existing catch-all. I-1 scopes the one write; I-12 permits `src/domain/metrics/selection.ts` → `@/domain/strength/**` for the eligibility rule and confines `selectionService.ts` to the one table; A-13 asserts the write log touches that table only | ESLint layers permit every named edge (`eslint.config.mjs:40-49`); the schema barrel export is called out explicitly in the must-not-change note |
| **The former global footer/count design is gone** | `trainedWithoutEstimateCount` is absent from the DTO, the query plan, §6, §9, §12.2, §15 and every criterion; O-8's ledger entry records the removal; §6 states "There is no global count of unlisted exercises (O-8)" | Grep: the identifier survives only in Appendix D's change log — the correct place |
| **Cascade behaviour** | `exercise_id` FK `ON DELETE CASCADE`, "gaps are fine on read", A-32 asserts the surviving rows keep their positions | The cited precedent is exact: `exercise_muscle_contributions` has a composite PK, no `id`, and the same cascade, with the comment "exercises with history are archive-only (RESTRICT FKs from history tables enforce that) — an exercise with no history can be hard-deleted, which is the only path that reaches this cascade" (`src/db/schema/exerciseMuscleContributions.ts:14-31`). `DELETE /api/exercises/[id]` and `deleteExercise` exist, with `ExerciseNotFoundError`/referenced-by-history guards (`src/app/api/exercises/[id]/route.ts:71`, `src/server/exercises/service.ts:43-50,317`) |
| **Empty initial state, no backfill** | "Rows are never created by the seed, by account setup, or by any migration backfill" — so the existing account sees the selection flow on first visit; §3.3 step 3 and A-17 render it | Consistent with §20 step 0b ("No seed, no backfill") |
| **No drag-and-drop; simplest accessible ordering** | Move up / Move down / Remove buttons (≥ 44 px, disabled not hidden at the ends, explicit accessible names, `role="status"` position announcement), native `<select>` + Add, one Save = one replacement, Cancel writes nothing. A-33 measures it at 390×844 and 320×568 | §13's editor bullet is the most detailed accessibility passage in the document and is internally consistent with §9 and §12.2 |

### 3.1 Statement arithmetic — re-derived

Non-volume statements are **7** with a non-empty selection (steps 1, 2, 3, 8, 9, 10, 11) and **6** with an empty one (step 9 skipped). Re-reading every `db.select()` in `getWeeklyVolumeReport` / `resolveActivePreset` (`src/server/volume/service.ts:148-257`) gives the same six branches as before:

| Volume branch | Volume | Non-empty | Empty |
| --- | --- | --- | --- |
| no active program, no default preset | 4 | **11** | **10** |
| active program, block without preset, no default | 5 | 12 | 11 |
| no active program, default preset resolves (common) | 6 | **13** | **12** |
| active program, active block whose preset resolves | 6 | 13 | 12 |
| active program, block without preset, default resolves | 7 | 14 | 13 |
| block preset id that fails to resolve, then the default | 8 | 15 | 14 |

A-12's pinned values (11 / 13 non-empty, 10 / 12 empty, plus selection-size independence on a one-exercise fixture) are exactly right, and the `12 + N` figure for a per-exercise loop is unchanged and still correct. The boundedness clause remains the load-bearing guard.

**Step 9's index claim is a correct reversal, not a contradiction.** The pre-modification plan said `ix_session_exercises_exercise` "cannot serve" the join, because the join was on `session_id`. With the selection adding `session_exercises.exercise_id ∈ (≤ 5 ids)`, that index — `(exercise_id, created_at desc)`, `src/db/schema/sessionExercises.ts:109` — genuinely can serve the new predicate. The updated sentence is accurate.

---

## 4. Regression checks

### 4.1 The review's twenty-seven findings

Each was re-checked in the modified text. **Twenty-six remain closed**; RL-11 is reopened by OM-1.

| Still closed | Evidence in the modified document |
| --- | --- |
| RH-1 | §4 M-1's "tracker parity … deliberate divergence from Volume", §4's future-rows rule with "Volume is the exception by design", §8's third case, I-6's named divergence, A-1's "(it still counts in `volume` — A-2)", A-2 (iii) |
| RH-2 | §11.2 step 3 projects `{ session_id, is_warmup }` rows, "no `is_warmup` predicate, no `count`"; §4's rule; A-2's domain clause |
| RM-1 | §4 M-5 and §11.1/§11.2/A-11 all say two weeks |
| RM-2 | §11.3's exact-count paragraph, A-12's four pinned numbers + independence fixture (re-derived above) |
| RM-3 | ORDER BY moved to step 9 and still contractual; I-11 restated with the duplicate-exercise case; A-6 (a)/(b)/(c), with (b) extended to say shuffling selection rows changes nothing because they re-order by stored position |
| RM-4 | §8's three divergence cases; A-11's in-progress deload fixture |
| RM-5 | M-12, the wireframe's `(2 of 7 days)`, §15's must-appear, A-5's fixture |
| RM-6 | **Strengthened** — step 8 now carries ownership on *both* tables; §11.5's validation repeats the RL-10 rule; A-26 and A-12 assert it |
| RM-7 | §15's two ban scopes and re-export-by-value rule; §20 step 1's two naming rules |
| RM-8 | §11.3's local budget and "no claim about production hardware"; A-25 |
| RL-1 | §13's accepted summary-line alternative |
| RL-2 | M-9 "points only"; §20 step 3's "circles only, no `polyline`" |
| RL-3 | A-16 decodes the service's return value |
| RL-4 | A-19's three cases |
| RL-5 | §12.2's `exact: true` binding locator rule |
| RL-6 | §12.1 verbatim, viewports and both loops still described correctly |
| RL-7 | R-1's `raw` omission |
| RL-8 | Step 10 is one statement; `olderEntryCount` gone |
| RL-9 | "Deload sessions are not counted." only |
| RL-10 | Eight `[P]` labels in §4 |
| **RL-11** | **REOPENED — OM-1** |
| RL-12 | A-23 withdrawn, numbering kept |
| RL-13 | §11.3's "new client behaviour" paragraph |
| RL-14 | O-11 + §20 step 0 (see OM-3 for the step-5 duplication) |
| RL-15 | "one of the two always runs" |
| RL-16 | "≈ 2.2 contributions per exercise" |
| RL-17 | "`tabular-nums` … 0 occurrences today" |

### 4.2 Previously verified behaviour, untouched

Spot-checked and intact: M-1 … M-3 and M-5 … M-12 (only M-4 was rewritten, as intended); §5's timezone semantics in full; §8's deload treatment; §10's misleading-analytics tables; §14's offline posture, with the editor added as another online-only surface rather than an exception; invariants I-3, I-4, I-6, I-7, I-8, I-10, I-11 unchanged in substance; all seventeen Appendix B findings F-1 … F-17; the §2 repository-fact base; §22's modification list. Counts: 13 invariants (I-13 added), 34 acceptance criteria (A-23 withdrawn, A-26 … A-34 added), 18 deferred items, 18 rejected alternatives, 11 owner decisions.

### 4.3 Existing boundary suites still pass unmodified

- **`strengthBoundary.test.ts`** — its `/strength/i` path inventory does not match any file the modification adds (`dashboardEstimateSelections.ts`, `selection.ts`, `selectionService.ts`, `SelectionEditor.tsx`, `api/metrics/selection/route.ts`, `(app)/metrics/exercises/page.tsx`); its `COLUMN_PATTERNS` do not fire on the new table (probe 1); its outbound claims about `src/domain/strength` are unaffected by a new *inbound* edge from `src/domain/metrics/selection.ts`.
- **`warmupBoundary.test.ts`** — no added path matches `/warmup/i`.
- **`progressionBoundary.test.ts`** — its roots are the progression tree plus five named API routes; neither `/api/metrics` nor `/api/metrics/selection` is among them or reachable from them. The new schema file sits under `src/db/schema/`, outside every `FORBIDDEN_DIRS` entry.

A-22 correctly relaxes only the `drizzle/` clause ("differs … by exactly the new `0012_*.sql` plus its journal/snapshot entries"), and §20's must-not-change list now reads "any applied migration (`0000`–`0011`)" with `src/db/schema/index.ts` gaining "exactly one export".

### 4.4 No expansion of Phase 9a

| Direction | Verdict | Evidence |
| --- | --- | --- |
| **Charting** | Not expanded | N-2 unchanged; O-11 binds v1 to "lightweight inline SVG sparklines, tables and text values"; the bodyweight sparkline lost its polyline rather than gaining anything; D-4 and D-7 still trigger on OD-04; §3.2 lists "any chart beyond an inline SVG sparkline (OD-04, O-11, D-4)" |
| **Coaching** | Not expanded | N-6, N-7, I-7 and X-5 … X-10 unchanged; the card gained no suggestion, ranking, or narrative. The nearest neighbour, D-17 (suggested candidates *inside the editor*), is deferred with "never auto-applied to the card" and an owner-request trigger, and N-13 forbids automatic or recency-based population outright |
| **Offline sync** | Not expanded | The one write is plain online REST. I-1, §11.5's "What the selection is not", X-14, X-17, N-9 and §14's "The editor is online-only too" all say the same thing four different ways; a Save while offline fails with `Couldn't save — you're offline.` and queues nothing |
| **e1RM Release B** | Not expanded | I-13 ("the selection is presentation only") and A-34; `best`, reason codes beyond the eligibility refusal, what-if and the starting suggestion all stay off the card (N-4, M-4's projection list); D-8 still defers lifting the batched query into `src/server/strength/` to Release B; `src/ui/strength/**`, `src/server/strength/**` and `src/domain/strength/**` remain on the must-not-change list |

### 4.5 Owner decisions

All eleven are recorded as decided, with the three modified ones flagged `*(as asked)*` / **Owner-modified** and pointed at the addendum as the binding text. Nothing was decided that the owner did not decide: the design changes trace to O-3, O-7 and O-8, and the derived choices they force (the table, the endpoints, the editor, the row states) are presented as consequences with their reasoning, not as new product decisions. The removed `trainedWithoutEstimateCount` is recorded in O-8 and in Appendix D rather than silently dropped.

---

## 5. Non-blocking observations

- **5.1** §11.5's advisory lock says "the `userVolumeLockKeys` pattern …, with a different namespace constant". `userVolumeLockKeys` derives *both* 32-bit keys from the user's UUID (`src/server/volume/service.ts:136-142`), so there is no constant to vary — a metrics lock needs a different derivation (e.g. a fixed namespace int plus a per-user int). Implementable exactly as intended; one clarifying clause would save the implementer a minute.
- **5.2** §11.3 budgets the write path at "1 lock statement + 1 validation read + 1 delete + 1 insert". The validation needs both the submitted exercises' rows and the caller's currently-stored selection (for the already-stored exemption); that is one statement only if written as a single join. Two statements would be equally correct — no criterion asserts the write-path count — so this is a note, not a constraint.
- **5.3** Carried forward from the previous verification and still open by choice: the copy-ban source scope is wider than the collision required, and O-2's "fits 264 px" remains arithmetic rather than measured. Neither was in scope for this modification.

---

## 6. What revision closes this

1. **OM-1** — narrow I-2's pattern list (or scope it to column names), keeping a real anti-vacuity witness and a negative control that passes with `0012` in the tree.
2. **OM-2** — fix §4's archived-exercise clause to "appear in M-4 only when selected (O-3/O-7)".
3. **OM-3** — merge §20 step 5 into step 0; repoint O-11's "§20 step 5".
4. **OM-4 … OM-8** — delete or restate R-8; correct R-10 and §11.3's row counts; reword §11.3's "no migration boundary"; replace "All exercises" in §13; qualify A-20's A-28 reference and move A-25 back into sequence.

Items 2–4 are text corrections. Item 1 is the only one that changes what an implementer would write, and it changes one line of a test that has not been written yet.

---

## Appendix A — Probes

Both probes were read-only and left nothing in the repository.

**Probe 1 — pattern lists against the artefacts migration `0012` will create.** A standalone Node script applied (a) I-2's seven declared patterns and (b) `strengthBoundary.test.ts`'s six `COLUMN_PATTERNS` to representative text for `src/db/schema/dashboardEstimateSelections.ts` and `drizzle/0012_*.sql` as §11.5 specifies them:

- I-2: **`/dashboard/i` fires** on both the schema file and the migration. The other six patterns do not fire.
- `strengthBoundary.test.ts`: **no pattern fires** — A-22's negative control holds.

**Probe 2 — repository facts the new design relies on** (read directly, not inferred): `src/db/schema/exerciseMuscleContributions.ts` (composite PK, no `id`, `ON DELETE CASCADE`, and the comment that states the hard-delete-only-without-history rule); `src/app/api/exercises/[id]/route.ts` (`GET`/`PATCH`/**`DELETE`**); `src/server/exercises/service.ts` (`deleteExercise`, the referenced-by-history guard); `src/db/schema/exercises.ts` (`ix_exercises_user_id`); `src/db/schema/sessionExercises.ts` (`ix_session_exercises_exercise` on `(exercise_id, created_at desc)`); `src/domain/strength/eligibility.ts` (`evaluateExerciseEligibility`); `src/ui/strength/copy.ts` (the two refusal strings, verbatim); `src/server/volume/service.ts` (`userVolumeLockKeys`, `pg_advisory_xact_lock`, and the six preset-resolution branches); `tests/integration/recoveryConcurrency.integration.test.ts` (exists).

No production system was contacted.

## Appendix B — What was and was not checked

**Read in the modified form:** the addendum, §1, §3, §4, §6, §7, §8, §9, §11.1 – §11.5, §12.1, §12.2, §13, §14, §15, §16, §17, §18, §19, §20, §21, Appendix A, Appendix D (Revision 2), Appendix C.

**Re-derived rather than read past:** the statement-count table for both selection states; the step-8/step-9 index claims; the three-layer five-item limit argument; the deferrable-constraint argument; the cascade rationale.

**Deliberately not repeated** (settled by the two baseline documents): the general architecture review; §2's repository-fact survey; the timezone probe; the evidence-corpus checks; the metric algorithms M-1 … M-3 and M-5 … M-12; every finding closure the previous verification confirmed and this modification did not touch. No test suite, build, lint or typecheck was run — none is required by any finding, and no source file changed.

## Appendix C — Working-tree impact

Created: `docs/reviews/metrics-dashboard-owner-modification-verification.md` (this file). Nothing else was created, modified, or deleted; in particular the evaluation, the review and the earlier verification were not touched, and all unrelated working-tree changes — `CLAUDE.md`, the `HANDOFF.md` deletion and `HANDOFF(depracted).md`, `docs/input/product-ideas.md`, `.claude/skills/`, the two `repository-agent-workflow-*` documents, `warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md` — are intact. No commit, push, deployment, migration, seed, or production access was performed. The probe script lives only in the session scratchpad, outside the repository.
