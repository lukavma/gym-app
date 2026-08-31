# Gym App MVP v1 — MEDIUM-1 Remediation: Independent Targeted Verification

Verifier: independent pass. No involvement in the implementation, the review, or the remediation.
Date: 2026-08-30.

## 0. Baseline, scope and method

- **Base revision:** `HEAD` = `137bd0932184ee479b2ac25670d6d7509a5ba5ac` ("feat: harden offline PWA
  synchronization"), plus the uncommitted MEDIUM-1 remediation in the working tree:
  `src/server/sync/service.ts` (modified), `tests/integration/sync.integration.test.ts` and
  `tests/integration/progression.integration.test.ts` (modified),
  `tests/e2e/reconnect-batch-idempotence.spec.ts` (new).
- **Scope:** MEDIUM-1 and its remediation only. No LOW finding was touched or re-litigated. Neither
  `docs/reviews/mvp-v1-independent-review.md` nor `docs/reviews/mvp-v1-remediation.md` was modified.
  No implementation file was modified (see §8 for the one negative-control revert and its byte-exact
  restoration). Nothing was committed, pushed, deployed or tagged; production was never contacted.
- **Documents read:** MEDIUM-1 in the independent review (§4), the remediation report in full, and the
  actual remediation diff (`git diff src/server/sync/service.ts` plus the three test files). The
  shipped remediation tests were read to determine what they cover — **none of their results were
  accepted as evidence**; every claim below rests on fixtures written for this pass.
- **Method.** Two independent harnesses, both living entirely outside the repository in
  `C:\tmp\medium1-verify`:
  1. **Service-layer probe** (`probe.ts` + `harness.ts`, 65 checks over 9 scenarios) driving
     `applySyncBatch` directly against **real PostgreSQL 16.14** in the local Docker instance
     (`gym-app-db-1`), not PGlite — so `uq_set_number` / `uq_session_exercise_position` behave with
     their real `DEFERRABLE INITIALLY DEFERRED` semantics. Assertions read rows back over a separate
     `pg` connection as `row_to_json(t)::text`.
  2. **Real-client probe** (`e2e/lost-reply.spec.ts`, own Playwright config, own testDir) against a
     **production standalone build** assembled exactly per `.github/workflows/deploy.yml`
     (`cp -r .next/static .next/standalone/.next/static`, `cp -r public .next/standalone/public`) and
     run as `node .next/standalone/server.js`.
- **Write audit.** Because the whole question is whether stale ops *write* anything, the probe database
  carries `AFTER INSERT OR UPDATE OR DELETE` row triggers on `workout_sessions`, `session_exercises`,
  `set_logs` and `recommendations` feeding an `m1v_audit` table. Every op runs in its own committed
  transaction, so this instrument sees **transient** writes — ones a later op in the same batch undoes —
  which neither a before/after row snapshot nor any shipped test can detect.
- **Disposable databases** (all created for this pass, all dropped at the end — §8):
  `m1v_probe` (post-fix probe), `m1v_neg` (pre-fix negative control), `m1v_e2e` (production-build
  E2E), `m1v_conc_rec` / `m1v_conc_vol` / `m1v_conc_rc` (the three real-Postgres-gated concurrency
  files). The developer's own `gymapp` database was never written to; every command carried an
  explicit `DATABASE_URL`.
- **Toolchain:** Node 24.15.0, pnpm 11.21.0, Next.js 15.5.23, Playwright 1.62.1, PostgreSQL 16.14.

## 1. Verdict

**REMEDIATION INCOMPLETE** — see the last line of this document.

The remediation genuinely fixes the scenario the review reproduced, and fixes the second
(`applySetLogUpsert`) instance it discovered on its own. Both were confirmed to fail before the fix and
pass after it, under fixtures written here, including the transient stale write and the spurious
recommendation churn. Every preserved-rejection case holds. There are no regressions in any shipped
suite.

But **MEDIUM-1 itself is not closed.** The same defect — a lost reply to a reconnect flush permanently
dead-lettering an already-applied op, with a false "couldn't sync" banner and a Retry that can never
succeed — still reproduces through the real client on a production build whenever the offline batch
also contains a **set deletion** of a set created in that same batch (delete a mis-logged set while
offline, then reconnect and lose the reply). Observed: `{pending: 0, dead: 1}`,
`setLog/upsert: session_locked`, banner shown, manual Retry re-dead-letters, server data correct.
This fails identically with and without the fix, so it is a **residual instance the remediation missed,
not a regression it introduced**. It is the same F6 reconnect path and the same device-checklist step
the review asked to have closed "so that the device pass measures the product, not this artefact".

Separately, the fix's `computeSupersededBySameBatch` carve-out is keyed purely on structural lookahead
and introduces two behaviours that did not exist before it (§6.3–§6.5): one latent data-merge hazard
and one surfacing regression against F6's "unsyncable ops surfaced, never dropped". Neither writes bad
data; both are recorded with honest reachability analysis.

## 2. What was executed

| Check | Result |
|---|---|
| Independent service-layer probe, post-fix, real PostgreSQL 16.14 (`m1v_probe`) | **60 / 65** checks pass — 5 substantive failures (§6.2, §6.3, §6.4, §6.5) |
| Same probe, pre-fix negative control (`m1v_neg`, `src/server/sync/service.ts` reverted to `HEAD`) | **49 / 65** — 14 checks fixed by the remediation, 3 broken by it, 2 failing in both |
| Independent real-client spec 1 — the review's own lost-reply reconnect path, production standalone build | **PASS** (§5) |
| Independent real-client spec 2 — same path, batch also deletes one of its own sets | **FAIL** — reproduces MEDIUM-1 (§6.2) |
| `pnpm typecheck` / `pnpm typecheck:sw` / `pnpm lint` | clean (0 errors, 0 warnings) |
| `pnpm format:check` | 1 warning, `src/server/sync/service.ts` — line-ending artefact, not a style deviation (§10, V-5) |
| `pnpm test:unit` | **479 / 479**, 38 files |
| `pnpm test:integration` (PGlite) | **250 passed, 9 skipped**; 19 files passed, 3 skipped |
| Real-Postgres-gated concurrency files, each on its own empty disposable database | **9 / 9** |
| Full `pnpm playwright test` against the production standalone build | **67 / 67** — 64 in one pass, plus the 3 DB-reading specs (`muscleTaxonomyV2` ×2, `volume`) re-run with `DATABASE_URL` set, which my first invocation had omitted; zero product failures |
| `pnpm build` | clean; standalone output assembled per `deploy.yml` and used for every E2E run above |

## 3. The remediation, restated from the diff

`applySyncBatch` precomputes, for each op, whether a **later** op in the same request targets the same
`entity:id` (`computeSupersededBySameBatch`: one backward scan building a `Set`, keyed on
`op.entity` + `op.payload.id`, **ignoring `op.operation`**). The flag is then consulted at three sites:

| Site | Guard the flag bypasses | Branch it sits in |
|---|---|---|
| `applyWorkoutSessionUpsert` | `invalid_lifecycle_transition`, then `session_locked` | row exists; terminal-row / illegal-transition only |
| `applySessionExerciseUpsert` | `session_locked` (skip/notes mismatch) | row exists **and** `sessionStatus !== "in_progress"` |
| `applySetLogUpsert` | the entire patch + the evaluation trigger | row exists — **unconditionally**, including `in_progress` sessions |

The flag is computed for every entity but passed only to these three; `recommendation`,
`recommendationDecision`, `bodyweightEntry`, `recoveryEntry` and `applySetLogDelete` are unaffected.
Two structural properties follow, and both are load-bearing for everything below:

- **The last op of a same-id group is never flagged**, so it always takes the unmodified path.
- **The flag is only reachable when the row already exists.** All three sites sit past the
  `if (!existingRow)` insert branch. This is the gap in §6.2.

## 4. Task item 1 — a complete multi-op batch, submitted three times

Independent fixture (probe scenario S1, `m1v_probe`), composed for this pass and deliberately different
from the shipped test's: session create → `sessionExercise` create (template, with a real
load-progression prescription snapshot) → `sessionExercise` create (ad-hoc) → three `setLog` creates →
skip change on the ad-hoc exercise → notes change on the template exercise → `setLog` correction of set
2 (100 → 102.5) → session completion. Ten ops, submitted through `applySyncBatch` three times.

| Check | Result |
|---|---|
| Submissions 1, 2, 3 each report `rejected: []` | **PASS** |
| Each submission reports all 10 ops applied | **PASS** |
| Session row byte-identical across all three, **including `updated_at`** | **PASS** |
| Both `session_exercises` rows byte-identical across all three, **including `updated_at`** | **PASS** |
| The `recommendations` row byte-identical across all three, **including `updated_at`** | **PASS** |
| All data columns of all three `set_logs` byte-identical | **PASS** |
| Exactly one recommendation after three submissions | **PASS** |
| Replay performs **no** INSERT or DELETE on any audited table | **PASS** |
| Final content: sets `100 / 102.5 / 100`, skip `false / true`, notes `"belt from set 2"`, status `completed` | **PASS** |

Pre-fix, the same fixture reproduces the review's mechanism exactly: submissions 2 and 3 return
`["workoutSession:invalid_lifecycle_transition", "sessionExercise:session_locked",
"sessionExercise:session_locked"]`, and the recommendation count reaches **5** after three submissions
(the audit shows two extra `recommendations:INSERT` on the third pass alone) instead of 1.

**One measured qualification on "byte-identical".** Each `set_log`'s **last** op in the batch is never
flagged, so it takes `applySetLogUpsert`'s ordinary update path, whose patch always carries a fresh
`updatedAt`. On every replay each of the three sets is therefore touched exactly once, in
`updated_at` and nothing else. Probe scenario S8 is the control: a batch with **no** same-id repetition
anywhere (supersession irrelevant) replays into `workout_sessions:UPDATE, session_exercises:UPDATE,
set_logs:UPDATE` — identical pre-fix and post-fix. This churn is pre-existing behaviour of code the
remediation did not touch, it changes no data column, and it cannot trigger re-evaluation
(`setLogUpdateChangesEvaluationInputs` returns false). Recorded as V-4, not a finding against the fix.

## 5. Task item 2 — the real lost-response path, through the client

Independent Playwright spec, production standalone build (`node .next/standalone/server.js`),
disposable database `m1v_e2e` seeded through the documented two-pass order (migrate → `db:seed` →
`smoke.spec.ts` creates the account → `db:seed` → `tests/e2e/seed.ts`).

The seed's prescription is `manual`, which never produces a recommendation, so the spec flips it to
`load-progression` over the real REST API for the run and restores it in `finally`. It then: takes
service-worker control, goes offline, reloads, starts the workout, does a skip → unskip round-trip,
logs set 1 at the wrong load (55 kg), logs two sets at 60 kg, **corrects set 1 to 60 kg through the real
Edit/Save UI**, adds exercise notes, and completes — all offline, so every op accumulates in one pending
FIFO batch. A `page.route("**/api/sync")` handler forwards the first request for real (`route.fetch()`,
so it commits server-side) and then discards the reply (`route.abort()`). The client reconnects and its
**own automatic backoff retry** resends the identical batch; no manual Retry anywhere.

Asserted and observed:

- `waitForOutboxDrained` converges, and a direct read of the IndexedDB outbox gives **`{pending: 0, dead: 0}`**.
- No "couldn't sync" banner.
- `GET /api/history` → the workout appears exactly once, `status: "completed"`, `skipped: false`,
  notes `"independent verification run"`, sets exactly `["60x5@2", "60x5@2", "60x5@2"]` — the corrected
  value, never the stale 55 kg.
- Queried straight from PostgreSQL: exactly **one** `workout_sessions` row for that id, and exactly
  **one** `recommendations` row sourced from it — `action: "increase_load"`, `target.loadKg: 62.5`,
  `decision_status: "pending"` — re-read after the retry settled and byte-identical.

**PASS.** Task item 2 holds.

## 6. Task item 3 — challenging `computeSupersededBySameBatch`

### 6.1 Set create → edit replay — fixed, including the transient write

Probe scenario S2: `[session create, exercise create, setLog X @100, setLog X @107.5, complete]`,
applied then replayed.

Post-fix: zero rejections; the corrected 107.5 is **not** regressed; rows byte-identical; the
recommendation count unchanged; and the write audit shows the replay's only write is the trailing
correction's own `updated_at` touch. Critically, the audit's per-write value trail confirms the set
**never holds the stale create's values at any instant** during the replay.

Pre-fix the same fixture fails on all of it: rejection
`["workoutSession:invalid_lifecycle_transition"]`, and the audit captures the set transiently reverting
to **`100.00 / rir 2`** before the later correction restores it, with the recommendation count moving
from 2 to 8. The remediation's §3 claim is therefore independently confirmed, and the "no transient
stale write" requirement is met for this shape.

### 6.2 Set create → **delete** replay — MEDIUM-1 SURVIVES (finding V-1)

The remediation never exercises a `setLog` **delete**: `grep` for `operation: "delete"` across the
whole remediation diff returns nothing, and the new E2E spec contains no deletion. The client, however,
produces exactly this shape unprompted. `deleteSet` (`src/sync/activeSession.ts:517`) calls
`buildSetDeletionOps` (`src/domain/sync/setDeletionOps.ts`), which emits a `setLog` delete followed by
one full-row renumbering upsert per survivor — and nothing ever removes the *original create* of the
deleted set from the outbox (`src/sync/outbox.ts` only removes applied ops and dead-letters rejected
ones). Offline, all of it lands in one pending batch.

**Why the fix does not reach it.** `computeSupersededBySameBatch` *does* flag the stale create — it
keys on `entity:id` and ignores `operation`, so the later delete of the same id marks it superseded.
But all three tolerance sites sit in the **row-exists** branch, and on replay the row is *absent*
(the delete removed it on the first pass). Control reaches `applySetLogUpsert`'s `if (!existingRow)`
insert path, where the flag is never consulted, and is rejected by the checks that live there.

Two variants, both reproduced at the service layer (probe S3, S4) and one through the real client:

| Variant | Replay result | Pre-fix | Post-fix |
|---|---|---|---|
| S3 — batch also completes the session (delete of the last set, no renumbering). Replayed create finds no row → parent lookup sees `completed` | `setLog:session_locked` | FAIL | **FAIL** |
| S4 — mid-workout reconnect, session still `in_progress`, delete of the *first* set so the survivor was renumbered into slot 1. Replayed create re-claims `setNumber 1` | `setLog:set_number_conflict` | FAIL | **FAIL** |

Both are **permanent**: a further submission of the identical batch returns byte-identical rejections
(`S3.permanent`, `S4.permanent` — the exact behaviour the client's Retry produces). In both, the stored
data is correct and byte-identical, and the audit shows no INSERT/DELETE churn — this is the review's
"no data loss, but the app says the workout couldn't sync" signature verbatim.

**Reproduced through the real client**, production standalone build, disposable database — offline:
start workout, log 70 / 72.5 / 75 kg, delete the middle set, complete; first `/api/sync` forwarded for
real and its reply discarded; reconnect and let the automatic retry run:

```
[create->delete replay] outbox after automatic retry: {"pending":0,"dead":1}
[create->delete replay] dead letters: ["setLog/upsert: session_locked"]
[create->delete replay] "couldn't sync" banner present: true
[create->delete replay] after a manual Retry tap: {"pending":0,"dead":1}
```

`GET /api/history` for that session returns exactly `["70x5", "75x5"]` — the data is right. The athlete
is told it is not, is offered a Retry that re-dead-letters, and the only way out is the double-confirmed
permanent Discard. That is MEDIUM-1, unchanged, on the F6 reconnect path.

### 6.3 A genuine invalid lifecycle mutation trailed by a same-id op (finding V-3)

Probe scenario S5, against a `completed` session:

| Batch | Pre-fix | Post-fix |
|---|---|---|
| `[ws S {status:"in_progress"}]` alone | `invalid_lifecycle_transition` | `invalid_lifecycle_transition` — **still rejects** |
| `[ws S {status:"in_progress"}, ws S {status:"completed", …}]` | `invalid_lifecycle_transition` | **`[]` — reported applied** |

So the answer to the task's first challenge bullet is: **yes, a later same-id op does automatically
excuse a genuine invalid lifecycle mutation.** The carve-out is keyed purely on structural lookahead,
not on which field mismatched, exactly as the remediation report states — but the report frames that as
harmless because "a lone stale mutation attempt … gets no tolerance", which only covers the standalone
case.

Bounded by measurement: the row is verified still `completed`, and the write audit is **empty** — the
excused op writes nothing. The harm is confined to *reporting*: the client removes the op from its
outbox believing it succeeded, instead of dead-lettering it.

### 6.4 A locked-session mutation followed by a reverting same-id op (finding V-3)

Probe scenario S6, same `completed` session, on its `session_exercise`:

| Batch | Pre-fix | Post-fix |
|---|---|---|
| `[se E {skipped:true, notes:"…"}]` alone | `session_locked` | `session_locked` — **still rejects** |
| `[se E {skipped:true, notes:"…"}, se E {skipped:false, notes:null}]` | `session_locked` | **`[]` — reported applied** |

Again: row unchanged (`false` / `null`), write audit empty, only the classification changes.

**Reachability and severity of V-3.** Because the last op of a same-id group is never flagged, the
batch's *final* intent for a row is always classified correctly, and every earlier op in that group is
an intermediate state the final op supersedes by construction. So this cannot lose a user's *net*
intent for a row. What it can do is under-report: in a genuinely divergent batch — a takeover, where
device B discarded the session while device A was offline and A reconnects with several queued
mutations of the same row — the *earlier* refusals go unreported while the last one still dead-letters.
The Sync Issues banner still appears; the count under-states. This is a real but bounded weakening of
F6's "unsyncable ops surfaced, never dropped", not a data-integrity failure. Pre-fix these rejected.

### 6.5 A full-row op trailed by a **partial** same-id op (finding V-2)

`applySetLogUpsert` is the one site that applies the tolerance **unconditionally**, including to
`in_progress` sessions — a choice the remediation report makes explicitly ("Applied unconditionally
(not only for terminal sessions)"). That is safe only if the later same-id op is a full-row superset of
the earlier one. Every op `src/sync/activeSession.ts` emits is a full row
(`setLogFullRowOp` → `buildSetLogUpsertPayload`), but `src/sync/corrections.ts`'s `correctHistorySet`
emits a **partial** payload — `{ id, sessionExerciseId, ...patch }`.

Probe scenario S9, on an `in_progress` session holding set X at `100 kg / 5 reps / RIR 2`, one batch:

```
[ setLog X {setNumber:1, weightKg:100, reps:6, rir:1, …}   ← full-row edit
  setLog X {weightKg:105}                                   ← partial correction ]
```

| | Result | Rejections |
|---|---|---|
| Pre-fix | `105.00 / 6 reps / RIR 1` — **correct merge** | `[]` |
| Post-fix | `105.00 / 5 reps / RIR 2` — **reps and RIR silently lost** | `[]` |

The full-row op is skipped entirely and reported applied; the partial op restates only the weight, so
the fields it omits fall back to the pre-edit values. Zero rejections, so the client drops both ops as
successful.

**Reachability.** `correctHistorySet` is driven from the History screen, whose data comes from
`/api/history` (NetworkOnly — not available offline), so the partial op can only be enqueued while
online, when the post-mutation flush trigger normally drains the queue first. For both ops to share a
batch, the queue would have to be mid-backoff, and for the loss to bite, the earlier full-row op must
not yet have been applied — which also requires the completion op to be unapplied, which in turn hides
the session from History. I could not construct a reachable client path. **Latent, not currently
exploitable — but it is a live hazard the moment any second partial-payload producer is added**, and it
is a behaviour the code did not have before this fix.

### 6.6 Transient stale writes and recommendation re-evaluation

Across scenarios S1–S4 and S9, with row-level triggers recording every committed write:

- **Post-fix, no superseded op writes anything.** S2's value trail confirms the set never transiently
  holds the stale create's values; S1's replay performs no INSERT or DELETE at all; S3/S4 show no
  INSERT/DELETE churn.
- **No spurious re-evaluation.** S1 holds at exactly one recommendation across three submissions, byte-
  identical including `updated_at`; S2's recommendation count is unchanged by the replay.
- Pre-fix, the same instruments capture both failure modes the remediation describes: the transient
  `100.00 / rir 2` regression and the extra `recommendations:INSERT` pairs.

The only writes observed on any replay are `updated_at` touches on rows whose **last** same-id op takes
the ordinary update path — pre-existing, unchanged by the fix, and proven independent of supersession by
the S8 control (§4).

## 7. Task item 4 — preserved rejections

Every case below was run **twice**: standalone, and again with a later same-id op appended to the batch
(the shape that activates the carve-out). All pass post-fix; the trailed variants additionally assert
that **nothing** in the batch is reported applied.

| Case | Standalone | Trailed by a later same-id op |
|---|---|---|
| Different-id session create against a live in-progress session | `session_conflict` | `session_conflict`, `applied: 0` |
| Different-id `session_exercise` claiming an occupied `(sessionId, position)` | `position_conflict` | `position_conflict`, `applied: 0` |
| Different-id `setLog` claiming an occupied `(sessionExerciseId, setNumber)` | `set_number_conflict` | `set_number_conflict`, `applied: 0` |
| `session_exercise` under an unknown session | `not_found` | — |
| `setLog` under an unknown `session_exercise` | `not_found` | — |
| `session_exercise` referencing an unknown exercise | `invalid_reference` | — |
| Another user's `workout_session` / `session_exercise` / `set_log` | `not_found` ×3 | `not_found`, `not_found` |
| Brand-new `session_exercise` on a locked session | `session_locked` | `session_locked`, `applied: 0` |
| Brand-new `setLog` on a locked session | `session_locked` | `session_locked`, `applied: 0` |
| Standalone `completed → in_progress` | `invalid_lifecycle_transition` | (see §6.3) |
| Standalone `completed → discarded` | `invalid_lifecycle_transition` | — |

All 19 of these checks pass identically pre-fix and post-fix. The unique-violation catch blocks and the
ownership / unknown-parent checks all sit outside the tolerance's reach — ownership is evaluated before
it, and the conflict paths run in the insert branch it never reaches. **Task item 4 holds.**

Two of my initial expectations here were wrong and were corrected after re-verification, not accepted as
product defects: a trailing completion carrying no `startedAt` correctly answers
`missing_required_fields` once its create was rejected; and a trailing op on a row that still does not
exist correctly repeats the *same* rejection rather than degrading to `not_found`.

## 8. Negative controls, isolation and restoration

- **Negative control.** `src/server/sync/service.ts` was reverted to its committed `HEAD` state
  (`git checkout HEAD -- src/server/sync/service.ts`, SHA-256 `eb760d93…6776f9`) and the identical
  65-check probe was run against a separate empty database. It scored **49 / 65** against the fixed
  build's 60 / 65. The file was then restored from a copy taken before the revert and verified
  **byte-identical**: SHA-256 `9f9f0014…7cdaf5`, matching the hash recorded before this pass began. No
  other file was reverted at any point.
- **Flip table**, post-fix vs pre-fix, over all 65 checks:

  | Class | Count | Checks |
  |---|---|---|
  | Fixed by the remediation | 14 | all of S1 (rejections, applied counts, byte-identity, rec count, audit) and S2 (rejections, snapshot, rec count, transient write, audit) |
  | **Broken by the remediation** | 3 | `S5.trailed.reject`, `S6.trailed.reject`, `S9.merge` |
  | **Failing in both — residual** | 2 | `S3.replay`, `S4.replay` |
  | Passing in both | 46 | every preserved-rejection case, the audit controls, the content assertions |

- **Isolation.** All fixtures live in `C:\tmp\medium1-verify`; no test, config or helper was added to
  the repository. The E2E run used my own Playwright config with its own `testDir` outside the repo and
  **no** `webServer` block, so it could never rebuild or restart anything on its own.
- **Working tree.** `git status --porcelain` after this pass lists exactly what it listed before it:
  the remediation's four files, and the pre-existing user-owned entries (`CLAUDE.md`, `HANDOFF.md`,
  `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`,
  `gpt-memory.md`) plus the two review documents — none of which were read for content or modified.
  The only new tracked path is this report.
- **Databases.** All six disposable databases were created after this pass began and dropped at the
  end; the developer's `gymapp` database is the only one remaining on the instance. The standalone
  server process was stopped.

## 9. What the shipped remediation coverage does and does not reach

The three shipped tests were re-run and all pass (they are inside the 250-test integration run and the
67-test E2E run above). Read against the defect class, their coverage boundary is:

- `tests/integration/sync.integration.test.ts` and `tests/integration/progression.integration.test.ts` —
  both new tests build a batch of session / exercise / set **upserts** plus a completion. Neither
  contains a `setLog` `operation: "delete"`.
- `tests/e2e/reconnect-batch-idempotence.spec.ts` — a skip/unskip round-trip, two set creates, one set
  edit, notes, completion. No deletion.

So the shipped coverage pins the two shapes the remediation set out to fix and would catch a regression
in either. It cannot detect §6.2, because no test in the repository combines a lost reply with a set
deletion: `offline-set-edit-delete.spec.ts` does delete a set offline, but it drains the outbox
successfully before completing, so no replay of the create ever happens.

## 10. Findings

**V-1 — MEDIUM-1 still reproduces when the reconnect batch deletes one of its own sets. (Blocking.)**
Class, path and symptom are identical to the original finding: a lost reply to a reconnect flush
permanently dead-letters an already-applied op with `session_locked` (or `set_number_conflict`
mid-workout), showing "couldn't sync" and offering a Retry that can never succeed, while the stored data
is exactly right. Reachable through ordinary use — delete a mis-logged set during an airplane-mode
workout, then reconnect and lose the reply. Reproduced at the service layer (probe S3/S4, both
permanent) and through the real client on a production standalone build. Fails identically pre- and
post-fix: **residual, not a regression.** Mechanism: `computeSupersededBySameBatch` correctly flags the
stale create, but all three tolerance sites sit past `if (!existingRow)`, and on replay the row is gone.

**V-2 — A full-row `setLog` op trailed by a partial same-id op silently drops the omitted fields.
(Introduced; latent.)** `applySetLogUpsert` applies the tolerance unconditionally, which assumes the
last same-id op is a full-row superset. `src/sync/corrections.ts` emits partial payloads. Measured:
`reps 6 / RIR 1` lost, reported applied; pre-fix the merge was correct. No reachable client path found
today (History is NetworkOnly, so the partial producer is online-only); becomes live the moment a
second partial-payload producer exists.

**V-3 — A genuine invalid lifecycle or locked-session mutation trailed by any later same-id op is
reported `applied` instead of rejected. (Introduced; surfacing only.)** Write audit confirms nothing is
written and the row is unchanged, and the batch's *final* intent for the row is still classified
correctly, so no net user intent is lost. It weakens F6's "unsyncable ops surfaced, never dropped" in
multi-mutation divergent batches (takeover being the realistic path), where the banner still appears but
under-counts. Pre-fix both rejected.

**V-4 — Informational: replayed upserts bump `updated_at`.** On any replay, each row whose last same-id
op takes the ordinary update path is touched in `updated_at` alone. Pre-existing on all three entities,
unchanged by the fix (S8 control), no data column affected, no evaluation triggered. Noted only because
it qualifies the literal phrase "byte-identical": every data column, and every column of the session,
exercise and recommendation rows, is byte-identical; `set_logs.updated_at` advances.

**V-5 — Cosmetic: `pnpm format:check` fails on `src/server/sync/service.ts`.** Cause is line endings,
not style: `git ls-files --eol` reports `i/lf w/crlf` for that file, the only file under `src/` with a
CRLF working copy (the rest of the tree is `w/lf`), and `prettier --check … --end-of-line auto` passes.
With `core.autocrlf=true` the committed blob normalises to LF, so CI is unaffected. The remediation
report calls this "that same pre-existing environment artefact"; more precisely, it is specific to the
remediated file in this working tree. Non-blocking.

## 11. What holds

Recorded so the remaining work is scoped to V-1 and not re-opened wholesale. Independently verified in
this pass, post-fix:

1. The review's own MEDIUM-1 scenario converges cleanly under three direct submissions and through the
   real client under a genuine lost reply, with byte-identical data and a single, unchanged
   recommendation (§4, §5).
2. The second (`applySetLogUpsert`) instance the remediation discovered is genuinely fixed, including
   the transient stale write and the duplicated evaluation — both captured pre-fix by the write audit
   and absent post-fix (§6.1, §6.6).
3. Every genuine different-id conflict, unknown parent, invalid reference, ownership violation,
   standalone invalid lifecycle change and locked-session insertion still rejects, standalone and when
   trailed by a same-id op (§7).
4. No regression anywhere: unit 479/479, integration 250 passed / 9 skipped, the three real-Postgres
   concurrency files 9/9 on dedicated disposable databases, the full E2E suite 67/67 against a
   production standalone build, typecheck / typecheck:sw / lint clean.

## 12. Verdict

MEDIUM-1's reported scenario is fixed and well covered; the remediation's own additional finding is
fixed and independently confirmed; nothing that should reject has stopped rejecting; nothing regressed.
But the defect the finding names is still reachable, still permanent, and still shows a false "couldn't
sync" on the exact F6 reconnect step the iPhone checklist exercises — through a set deletion, a shape
the remediation's own coverage does not reach. Two further behaviours (V-2, V-3) were introduced by the
carve-out and should be weighed when V-1 is closed, since a fix for V-1 will touch the same code.

**REMEDIATION INCOMPLETE**
