# Gym App MVP v1 — MEDIUM-1 Targeted Remediation

Scope: **MEDIUM-1 only**, from `docs/reviews/mvp-v1-independent-review.md` (reviewed revision
`origin/main` = `137bd0932184ee479b2ac25670d6d7509a5ba5ac`). Every LOW finding in that report is
untouched. The review itself was not modified. No production access; nothing committed, pushed,
deployed, or tagged.

All verification ran against disposable PostgreSQL 16 databases created inside the local Docker
instance (compose project `gym-app`, container `gym-app-db-1`, `localhost:5432`) and a `pnpm build`
production standalone server. The developer's own `gymapp` database and `.env.local`-configured dev
workflow were never touched. Every disposable database (`gymapp_medium1`, `gymapp_medium1_recovery`,
`gymapp_medium1_volume`, `gymapp_medium1_reconcile`, `gymapp_medium1_freshmig`) and the disposable
server process were created after this pass started and torn down at the end (§6).

## 1. Verdict

**FIXED.** All four required behaviors hold; regression coverage was added at both the sync-service
layer (two PGlite integration tests, one submitting the batch three times directly) and through the
real client (one Playwright test reproducing the review's own lost-reply reconnect scenario). Each new
test was proven to fail against the pre-fix code and pass after the fix (§4). Full unit, integration
(including the three real-Postgres-gated concurrency files), and end-to-end suites pass with zero
regressions; typecheck, lint, format, fresh-migration, and schema-drift gates are clean; a production
build was used for the e2e run.

## 2. The fix

**Mechanism (from the review):** `applyWorkoutSessionUpsert` and `applySessionExerciseUpsert` compare
each replayed op's payload against the row's *current* state. A lost-reply retry resends the client's
whole pending outbox unchanged (`src/sync/flush.ts` never removes an op it didn't get a classified
response for), so an *earlier* op in that batch (e.g. the session's own create, still carrying
`status:"in_progress"`) can find the row already moved past it by a *later* op in that same array (the
completion, applied moments later in the same replayed request). The row is correct; the earlier op's
now-stale snapshot trips the terminal-row lifecycle/lock checks and dead-letters permanently.

**The fix** (`src/server/sync/service.ts`) stays inside the existing natural-idempotency design — no
applied-op ledger, no opId-keyed replay tracking, per the task's constraint. `applySyncBatch` now
precomputes, for every op in the incoming array, whether a *later* op in that same array targets the
same `entity:id` (`computeSupersededBySameBatch`, a single backward scan building a `Set`). An op
flagged this way is provably a stale replay of a batch that already fully applied once — the row
already reflects whatever that later op established (or is about to, moments later in this same
replay) — so its own mismatch against the current row is reported `applied` **without writing
anything**, instead of being rejected:

- `applyWorkoutSessionUpsert`: both the lifecycle-transition check and the terminal-row lock check now
  tolerate a superseded op (`invalid_lifecycle_transition` → `applied`, `session_locked` → `applied`).
- `applySessionExerciseUpsert`: the terminal-row lock check (skip/notes mismatch) does the same.
- `applySetLogUpsert`: see §3 — a third site, not called out by the review's own mechanism section,
  found while building the regression coverage below.

A batch with **no** later same-id op — a lone stale mutation attempt, e.g. the existing
`sync.integration.test.ts` completed→in_progress "revert" case — gets no tolerance and is still
rejected exactly as before, because the tolerance is keyed purely on structural lookahead within the
current request, not on which specific field mismatched.

## 3. An additional instance found while building the regression coverage

Building the required "session create; exercise creates; skip/notes updates; set creates/edits;
session completion" batch (task requirement) surfaced a **second, related defect** the review's own
mechanism section didn't describe, because its own reproduction never combined a set *create* with a
set *edit* of the same set inside one batch: replaying a batch containing both — e.g. `setLog` create
`{weightKg:100}` followed later in the same array by a correction `{weightKg:101}` — hits
`applySetLogUpsert`'s "already exists" branch on the **earlier, stale** op. Unlike the workoutSession/
sessionExercise functions, `applySetLogUpsert` has no noop-comparison at all (`setLog` corrections are
legitimately allowed at any time, including post-completion, so nothing there previously needed one):
it unconditionally re-patches whatever fields the payload carries. Replaying the stale create
**regressed `weightKg` back to 100**, and because that regression counted as a "relevant edit" against
a completed session's already-evaluated source set, it **spuriously re-triggered
`reevaluateForSourceSessionExercise`**, superseding the real pending recommendation and creating a
second one — a real, if transient (self-corrected a few array indices later by the replayed correction
op), instance of exactly what the task's "must never regress ... other later values" and "no
duplicated evaluation/recommendation" requirements rule out.

**Independently reproduced (isolated to this file, no other patch applied):**
`tests/integration/progression.integration.test.ts`'s new test, run with only this fix reverted (the
other two call sites still patched — see §4's per-test isolation), produced a second `recommendations`
row (`mixedLoads:true`, evaluated against the transiently-regressed set) after a single replay.

**The fix:** `applySetLogUpsert` now takes the same `supersededBySameBatch` flag and, when set, returns
`applied` immediately after the ownership/discarded checks — before building the patch, and before the
evaluation-trigger comparison — leaving the row and any pending recommendation completely untouched.
Applied unconditionally (not only for terminal sessions): even for a still in-progress session, letting
a stale earlier op's patch land — even momentarily, in its own transaction, before the batch's later
correction op restores it — is a real (if narrow) window in which a concurrent reader could observe the
wrong value; the fix removes that window rather than tolerating it as self-healing.

A standalone correction with no later op on the same id in its own batch — the existing
`sync.integration.test.ts` "correcting the value of an *existing* set post-completion is allowed" case
— is unaffected: `supersededBySameBatch` is false for it, so it patches exactly as before.

## 4. Regression coverage added, and proven to fail before / pass after

Per the task, each new test was run against the code with `src/server/sync/service.ts` reverted
(`git stash push -- src/server/sync/service.ts`), confirmed to fail with the exact rejection reasons
the review describes, then re-run with the fix restored to confirm it passes.

### 4.1 `tests/integration/sync.integration.test.ts` — direct 3× replay

New test: *"submitting a complete multi-op reconnect batch three times converges with zero rejections
and byte-identical rows every time."* Builds one batch covering every required op category — session
create; two `sessionExercise` creates (a template exercise and an ad-hoc "Bicep Curl", mirroring the
review's own "curl slot" reproduction); a skip→unskip round-trip on the first and a stray skip left set
on the second; three `setLog` creates; a `setLog` correction of the first set; a notes update; session
completion — and submits it via `applySyncBatch` three times directly (no HTTP layer). Asserts
`rejected: []` and `applied.length === ops.length` on **every** submission, then that the final rows
(session status, both exercises' skipped/notes, all three sets' weights, with `setLogs.updatedAt`
excluded — see the code comment for why) are exactly as expected.

- **Pre-fix:** first submission applies cleanly (`applied: 10, rejected: []`); second submission
  reproduces the review's mechanism exactly — `{entity:"sessionExercise", reason:"session_locked"}`.
- **Post-fix:** all three submissions report `rejected: []`.

### 4.2 `tests/integration/progression.integration.test.ts` — with a real recommendation

New test: *"a lost-reply replay of a full reconnect batch (create, skip toggle, notes, set
create+edit, second exercise, completion) converges with zero rejections and an unchanged,
non-duplicated recommendation."* Same op shape as §4.1, but built against this file's
`load-progression` prescription fixture (the other file's exercises use `manual`, which never produces
a recommendation, so it can't prove "no duplicated evaluation" on its own). Captures a full snapshot
(session row, both exercise rows, set rows minus `updatedAt`, every `recommendations` row) after the
first application, then asserts that snapshot is **exactly** reproduced (`toEqual`) after two further
replays.

- **Pre-fix:** second submission rejects two `sessionExercise` ops with `session_locked`.
- **Post-fix:** all three submissions report `rejected: []`, and the recommendation snapshot is
  byte-identical across all three (confirms §3's fix independently — this test would still fail on the
  `applySetLogUpsert` mismatch alone, since it includes a same-set create+correction pair).

### 4.3 `tests/e2e/reconnect-batch-idempotence.spec.ts` — through the real client

New Playwright spec, modeled directly on the review's own real-client reproduction and on the existing
`lost-response-retry.spec.ts` route-sabotage pattern. Goes offline (after letting the service worker
take control, so an offline reload can be served from precache), then — all still offline, so nothing
flushes prematurely and every op accumulates in one pending outbox batch — starts a workout, does a
skip→unskip round-trip, logs two sets, edits the first set's weight (a genuine UI "Edit"/"Save", not a
scripted payload), adds exercise notes, and completes the workout. Installs a `page.route("**/api/sync"
...)` handler that lets the *first* request reach the server for real (`route.fetch()`, so it commits)
and only then discards the reply (`route.abort()`) — the review's exact "reply lost after the server
already applied it" scenario — then reconnects, letting the client's own automatic backoff retry resend
the identical batch with no manual "Retry" click anywhere in the test.

Asserts: `waitForOutboxDrained` converges to `{pending:0, dead:0}`; no "couldn't sync" banner; and
`GET /api/history/{id}` shows the session exactly once, completed, unskipped, with the correct notes,
and both sets at their exact (one corrected) values.

- **Pre-fix** (pre-fix build, disposable DB): `waitForOutboxDrained` times out at `{pending:0, dead:4}`
  — four ops permanently dead-lettered, reproducing the false "couldn't sync" banner on the exact F6
  scenario the review flagged.
- **Post-fix:** passes in 3.9s, zero dead letters, exactly the corrected/final data.

## 5. Preserved rejections — re-verified, not re-litigated

The task requires every genuine-conflict and lifecycle-rejection case to keep rejecting. These are
already covered by existing tests in the same files (unmodified) and were re-run green alongside the
new coverage, not merely assumed:

- `sync.integration.test.ts` "only allows forward lifecycle transitions and locks structure on
  completion" — the completed→in_progress "revert" (a standalone op, no later same-id op in its own
  batch) still rejects `invalid_lifecycle_transition`; a brand-new `sessionExercise`/`setLog` on an
  already-locked session still rejects `session_locked`.
- `sync.integration.test.ts` "enforces at most one in-progress session per user" and "rejects
  conflicting session_exercise positions and set numbers" — different-id conflicts, untouched code
  path (`!existingRow` / unique-constraint catch blocks), still reject `session_conflict` /
  `position_conflict` / `set_number_conflict`.
- `sync.integration.test.ts` "treats another user's session/session_exercise/set_log rows as
  not_found" — unaffected (ownership check runs before any of the touched branches).
- `lost-response-retry.spec.ts`'s own two specs (single-op lost-response idempotence, and a genuine
  different-id `set_number_conflict` through the real API) — both still pass.
- `dead-letter.spec.ts` (a genuine `session_conflict` from two live devices) — still dead-letters,
  inspects, and retries correctly.

## 6. Full verification

Ran against a disposable PostgreSQL 16 database (`gymapp_medium1`, plus three more dedicated empty ones
for the real-Postgres concurrency files, plus one more for the fresh-migration check) and a `pnpm build`
standalone production server, all torn down at the end of this pass. `tests/e2e/seed.ts`'s account/
program/template/block fixture was seeded following the exact two-pass order the account-creation
chicken-and-egg requires (migrate → seed → `smoke.spec.ts` creates the account → seed again → e2e seed).

| Check | Result |
|---|---|
| `pnpm typecheck` / `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean (0 errors, 0 warnings — two `no-unused-vars` warnings from the new tests' destructuring were fixed) |
| `pnpm format:check` (`--end-of-line auto`, matching the independent review's own CRLF-checkout finding — `service.ts`'s bare `format:check` warning is that same pre-existing environment artifact, not new) | clean |
| `pnpm test:unit` | **479/479**, 38 files |
| `pnpm test:integration` (PGlite) | **250 passed, 9 skipped**, 19 passed + 3 skipped files (+2 tests over the review's 248 baseline) |
| Real-Postgres-gated concurrency files, each against its own empty disposable database | **9/9** (`recoveryConcurrency` 4/4, `volumeLandmarksConcurrency` 1/1, `reconcileContributionsConcurrency` 4/4) |
| Full `pnpm playwright test` (production build) | **67/67** in 1.5 min (66 existing + the new MEDIUM-1 spec), zero regressions |
| Fresh migration chain, empty PostgreSQL 16 database | clean apply; second `db:migrate` a no-op |
| `drizzle-kit check` / `drizzle-kit generate` | "Everything's fine" / "No schema changes, nothing to migrate" — zero drift (expected: this fix touches no schema/migration file) |
| `pnpm build` | clean, standalone output, used for the e2e run above |

## 7. Restoration and hygiene

- Disposable databases `gymapp_medium1`, `gymapp_medium1_recovery`, `gymapp_medium1_volume`,
  `gymapp_medium1_reconcile`, `gymapp_medium1_freshmig` and the disposable standalone server process
  were all created after this pass began and dropped/stopped at the end; `\l` on the Docker instance
  afterward shows only the developer's own pre-existing `gymapp` database.
- The developer's `.env.local`-configured dev database and working tree were never pointed at by any
  command in this pass (every command used an explicit `DATABASE_URL` override).
- `git status --porcelain` shows exactly the intended changes: `src/server/sync/service.ts`,
  `tests/integration/progression.integration.test.ts`, `tests/integration/sync.integration.test.ts`
  (modified), `tests/e2e/reconnect-batch-idempotence.spec.ts` (new), and this report. No LOW finding,
  no other implementation file, and no pre-existing uncommitted user-owned file
  (`CLAUDE.md`, `HANDOFF.md`, `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`,
  `gpt-handoff.md`, `gpt-memory.md`) was touched.
- `docs/reviews/mvp-v1-independent-review.md` was read only, never modified.
- Nothing was committed, pushed, deployed, or tagged; production was never contacted.

## 8. Verdict (§1–§7, original pass)

**READY FOR TARGETED REMEDIATION VERIFICATION**

---

# Follow-up — 2026-08-30: V-1, V-2, V-3

Independent verification (`docs/reviews/mvp-v1-remediation-verification.md`, not modified) found the
§1–§8 remediation above **incomplete**: MEDIUM-1 itself still reproduced through the real client
whenever the offline batch also deleted one of its own sets (**V-1**), and the `computeSupersededBySameBatch`
carve-out had introduced two behaviors that didn't exist before it (**V-2**, a silent field loss; **V-3**,
a rejection wrongly excused). This section covers those three items only. Every LOW finding, the
independent review, and the independent verification report are untouched; nothing was committed,
pushed, deployed, tagged, or run against production.

## 9. Why the coarse boolean was the actual defect

`computeSupersededBySameBatch` asked one question — "does *any* later op in this batch share this
entity+id?" — and that question is too coarse in three distinct ways the verification's own probes
isolated cleanly:

1. **It never fires when the row is absent.** All three tolerance sites sat past `if (!existingRow)`.
   A `setLog` delete makes the row genuinely absent on replay, so the stale create of the deleted set
   never reached the tolerance check at all — it hit the ordinary insert-precheck path and was rejected
   by whatever it found there (`session_locked` if the session had also completed; `set_number_conflict`
   if a renumbered survivor had already reclaimed the slot). **V-1.**
2. **It didn't check what the later op actually covers.** `applySetLogUpsert`'s tolerance blanket-skipped
   the *entire* earlier op the moment *any* later same-id op existed — including when that later op was
   a **partial** correction (`src/sync/corrections.ts`'s `correctHistorySet`) that only restates one
   field. The earlier op's other fields (reps, RIR in the verification's own S9 probe) were never written
   at all, and the partial op never restates them either — a silent field loss the pre-fix code didn't
   have. **V-2.**
3. **It didn't check whether the earlier op looked like a real snapshot.** The tolerance fired for *any*
   payload sharing an id with a later op, including a bare `{status:"in_progress"}` or
   `{skipped:true, notes:"…"}` that shares no other field with a genuine create — payloads the real
   client never sends (`*FullRowOp` in `src/sync/activeSession.ts` always sends every field it knows),
   but which a hand-rolled batch (or a maliciously crafted one) can. **V-3.**

## 10. The fix

`src/server/sync/service.ts`'s `computeSupersededBySameBatch(): boolean[]` is replaced by
`computeSupersession(): Supersession[]`, still a single backward scan over the ops array (no ledger, no
opId tracking — same constraint as before), but each entry now carries:

```ts
interface Supersession {
  laterDelete: boolean;               // a later op, same entity+id, is a `delete`
  laterUpsertFields: Set<string> | null; // union of fields every later same-id upsert explicitly sets
}
```

Three changes at the three original call sites, plus one new one:

- **V-1 — `applySetLogUpsert`'s `!existingRow` branch** now checks `supersession.laterDelete` *first*,
  before the required-fields check, before the parent lookup, before the insert attempt. If a later op
  in this batch deletes this exact id, the row is guaranteed absent once the batch settles regardless of
  what this op does — true whether this is the very first application (the insert would just be undone
  moments later by the delete) or a replay (the row is already gone) — so it is reported `applied`
  without ever touching the parent/insert path. The same check was also added to the (structurally
  unreachable via the review's own reproduction, but consistent) existing-row branch, ahead of the
  `discarded` check.
- **V-3 — `applyWorkoutSessionUpsert` / `applySessionExerciseUpsert`** now gate the tolerance on
  `isCreateAnchoredWorkoutSession`/`isCreateAnchoredSessionExercise`: a payload must carry the field(s)
  only a genuine creation call ever sets (`startedAt` for a session — the one field every real op
  echoes, since it's immutable, but a bare status-only payload omits; `exerciseId`+`position`+`source`
  for a session-exercise) *and* every field it itself sets must be covered by the union of later same-id
  ops' fields (`canExcuseViaSupersession`, full subsumption, not just "a later op exists"). A bare
  `{status:"in_progress"}` or `{skipped:true, notes:"…"}` fails the anchor check and is rejected exactly
  as before, standalone or trailed by any later op.
- **V-2 — `applySetLogUpsert`'s existing-row branch** no longer blanket-skips. It computes `writable =
  ownFields − laterUpsertFields`: fields a later same-id op will also set are excluded from *this* op's
  own write (writing them would be a value the later op immediately overwrites anyway — the same
  transient-write risk the original fix targeted); fields no later op touches are still written
  normally, so they're never silently dropped. When `writable` is empty (full subsumption — the common
  case, since the real client's ops are always full-row), nothing is written at all, degrading to the
  same pure no-op as the other two entities. `setLogUpdateChangesEvaluationInputs`'s evaluation-trigger
  comparison was narrowed to the same `writable` set, so a field this op isn't actually writing can never
  spuriously (or wrongly fail to) trigger re-evaluation.

## 11. A bug found while proving the fix, before it shipped

The first version of `computeSupersession` captured `laterUpsertFields` for an op as a **live reference**
into the running `Map<string, Set<string>>`, not a copy — and the very next step in the same backward
scan folds *that op's own fields* into the same map entry, for the benefit of whichever op precedes it.
Because the reference was live, an op's own fields silently leaked into its own `laterUpsertFields`
once folded in, so the V-2 field-preservation test (§12.4) initially failed in the wrong direction:
`reps`/`RIR` were dropped even though only `weightKg` should have been excluded. Fixed by snapshotting a
copy (`new Set(laterFields)`) at the point of read, before the current op is folded into the map. Caught
by the new regression test itself, before this fix was ever considered complete — recorded here because
the tests that follow are what actually exercises this exact failure mode, not because it shipped.

## 12. Regression coverage added, and proven to fail before / pass after

Per the task, each new test was run against a reconstructed "first-remediation-only" `service.ts` (the
§1–§8 state — `computeSupersededBySameBatch`'s coarse boolean, none of §10/§11's changes), confirmed to
fail with the exact symptom V-1/V-2/V-3 describe, then re-run against the fix in this follow-up to
confirm it passes. The reconstruction was byte-identical to the file this session read before making any
change in this pass; typecheck stayed clean against it, confirming the reconstruction was accurate.

### 12.1 `tests/integration/sync.integration.test.ts` — create→delete→renumber→complete, ×3

*"a create→delete→renumber→complete batch (the deleted set's own create trailing its own delete)
converges with zero rejections, submitted three times"* — the verification's own S3 shape: three sets
logged (70/72.5/75kg), the **last** deleted (no renumbering needed), session completed in the same
batch. Submitted three times directly.

- **Pre-fix:** `{entity:"setLog", reason:"session_locked"}` on the second and third submissions.
- **Post-fix:** `rejected: []` all three times; final rows exactly the two survivors (70kg at set 1,
  72.5kg at set 2), the deleted set never resurrected.

### 12.2 Same shape mid-workout

*"the same create→delete→renumber shape mid-workout (not completed) also converges with zero
rejections, submitted three times"* — the verification's own S4 shape: two sets logged, the **first**
deleted, so the survivor is renumbered *into* the deleted set's own slot — the replayed stale create
collides with the renumbered survivor's set-number, not a locked session.

- **Pre-fix:** `{entity:"setLog", reason:"set_number_conflict"}` on replay.
- **Post-fix:** `rejected: []` all three times; the session stays `in_progress`; final row is the single
  survivor (72.5kg) renumbered to set 1.

### 12.3 The real client, offline, with a deletion — `tests/e2e/reconnect-batch-idempotence.spec.ts`

New spec (added to the existing file from §4.3): offline, log three sets (70/72.5/75kg), delete the
middle one, complete — the deleted set's own create op and the delete both still sit in the pending
outbox together, exactly like every other still-queued op, since nothing removes an op from the outbox
except a classified server response. Same route-sabotage pattern as §4.3 (`route.fetch()` then
`route.abort()`), same "no manual Retry" bar.

- **Pre-fix build** (disposable Postgres, production standalone server): `waitForOutboxDrained` times out
  at `{pending:0, dead:1}`, dead letter `setLog/upsert: session_locked` — reproducing V-1 through the
  real client exactly as the verification's own probe did. The *original* (§4.3) spec in the same run
  still passed, confirming this is additive coverage, not a fix for a shared symptom.
- **Post-fix build:** passes in 3.9s; `GET /api/history` shows exactly the two survivors (70kg at set 1,
  75kg at set 2, contiguously renumbered), the 72.5kg set never resurrected, zero dead letters, no
  "couldn't sync" banner.

### 12.4 Full-row edit trailed by a partial correction — `sync.integration.test.ts`

*"a full-row setLog edit trailed by a partial correction preserves the fields the partial op omits
(reps, RIR)"* — the verification's own S9 shape: a pre-existing set at 100kg/5reps/RIR2, one batch
`[full-row edit → 100kg/6reps/RIR1, partial correction → {weightKg:105}]`, run across a first
application and a replay of the identical two-op batch.

- **Pre-fix:** `reps` and `rir` stay at their pre-batch values (5/2) on *every* run — the full-row op's
  edit is silently dropped by the blanket skip, both on first application and on replay.
- **Post-fix:** `weightKg:105, reps:6, rir:1` — correct on both the first application and the replay
  (this is also the exact test that caught §11's reference-mutation bug during development).

### 12.5 Genuine invalid-lifecycle / locked-session mutations trailed by a same-id op

*"a genuine invalid lifecycle transition or locked-session mutation trailed by a later same-id op still
rejects (never reported applied)"* — the verification's own §6.3/§6.4 probes verbatim: a completed
session's bare `{status:"in_progress"}` followed by a reconfirming `{status:"completed"}`; a locked
session-exercise's bare `{skipped:true, notes:"…"}` followed by a reverting
`{skipped:false, notes:null}`.

- **Pre-fix:** both bare ops are wrongly excused (`rejected: []` instead of the expected single rejection
  in each batch) — the coarse "any later op" rule doesn't distinguish these from a genuine create replay.
- **Post-fix:** both still reject with their original reasons (`invalid_lifecycle_transition`,
  `session_locked`); the row is confirmed unchanged in both cases.

### 12.6 No resurrection, no recommendation churn — `progression.integration.test.ts`

*"a create→delete→renumber→complete batch never resurrects the deleted set into evaluation, and never
churns the recommendation, across three submissions"* — extends §12.1's shape to a real
`load-progression` recommendation: three good sets (5/5/5 reps) plus a **deleted** failed 4th set (3
reps, RIR 0). If the deleted set survived evaluation even once, `derived.setsCompleted` would be 4 and
the final-set RIR would be 0, changing the outcome.

- **Pre-fix:** `{entity:"setLog", reason:"session_locked"}` on replay (same mechanism as §12.1).
- **Post-fix:** `rejected: []` all three submissions; exactly 3 surviving sets, all 5 reps; exactly one
  recommendation, `action:"increase_load"`, `derived.setsCompleted:3` — the deleted set never counted.

## 13. Preserved rejections and the original three tests — re-verified

Every case in §5 (different-id conflicts, ownership, unknown parents, brand-new entities on locked
sessions, the standalone `completed→in_progress` "revert") was re-run green, unmodified. The three §4
tests (the direct 3× replay, the recommendation-safe replay, and the original real-client spec) were
also re-run green in the same passes as the new tests below — none of them needed a single assertion
change from the operation-aware rewrite, because every op in their batches is full-row and every later
op in each same-id group fully subsumes the one before it (the ordinary shape the real client always
produces).

## 14. Full verification

Ran against a disposable PostgreSQL 16 database (`gymapp_v2v1`, plus one more for the fresh-migration
check) and a `pnpm build` standalone production server, all torn down at the end of this pass, following
the same two-pass seed order as §6.

| Check | Result |
|---|---|
| `pnpm typecheck` / `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean (0 errors, 0 warnings) |
| `pnpm format:check` (`--end-of-line auto`) | clean |
| `pnpm test:unit` | **479/479**, 38 files |
| `pnpm test:integration` (PGlite) | **255 passed, 9 skipped**, 19 passed + 3 skipped files (+5 tests over §6's 250) |
| Real-Postgres-gated concurrency files, each against its own empty disposable database | **9/9** |
| Full `pnpm playwright test` (production build) | **68/68** in 1.7 min (67 existing + the new deletion spec), zero regressions |
| Fresh migration chain, empty PostgreSQL 16 database | clean apply; second `db:migrate` a no-op |
| `drizzle-kit check` / `drizzle-kit generate` | "Everything's fine" / "No schema changes, nothing to migrate" — zero drift (this fix touches no schema/migration file) |
| `pnpm build` | clean, standalone output, used for the e2e runs above (once for the pre-fix negative control, once for the post-fix confirmation) |

## 15. Restoration and hygiene

- Disposable databases `gymapp_v2v1` and `gymapp_v2v1_freshmig`, and the disposable standalone server
  process (rebuilt and restarted twice — once for the pre-fix e2e negative control, once for the
  post-fix confirmation), were created after this pass began and dropped/stopped at the end; the Docker
  instance's database list afterward shows only the developer's own pre-existing `gymapp` database.
- The developer's `.env.local`-configured dev database and working tree were never pointed at by any
  command in this pass.
- `git status --porcelain` shows exactly the intended changes on top of §1–§8's: `src/server/sync/
  service.ts`, `tests/integration/sync.integration.test.ts`, `tests/integration/progression.integration
  .test.ts` (further modified), `tests/e2e/reconnect-batch-idempotence.spec.ts` (one more test added to
  the existing file). No LOW finding, no independent report (review or verification), and no unrelated
  user-owned file was touched.
- Nothing was committed, pushed, deployed, or tagged; production was never contacted.

## 16. Verdict

**READY FOR SECOND TARGETED REMEDIATION VERIFICATION**
