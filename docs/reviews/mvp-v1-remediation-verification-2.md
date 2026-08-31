# Gym App MVP v1 — MEDIUM-1 Second Remediation: Independent Targeted Verification

Verifier: independent pass. No involvement in the implementation, the review, or either remediation.
Date: 2026-08-31.

## 0. Baseline, scope and method

- **Base revision:** `HEAD` = `137bd0932184ee479b2ac25670d6d7509a5ba5ac`, plus both uncommitted
  MEDIUM-1 remediations in the working tree. Files under verification:
  `src/server/sync/service.ts` (SHA-256 `fa294970…b2b3a0`),
  `tests/integration/sync.integration.test.ts`, `tests/integration/progression.integration.test.ts`,
  `tests/e2e/reconnect-batch-idempotence.spec.ts`.
- **Scope:** the follow-up remediation (`docs/reviews/mvp-v1-remediation.md` §9–§16) addressing
  **V-1 / V-2 / V-3** from `docs/reviews/mvp-v1-remediation-verification.md`. No LOW finding was
  touched. The independent review, the first verification report, and the remediation report were read
  only — all three carry the same SHA-256 after this pass as before it.
- **Documents read:** MEDIUM-1 (review §4); verification-1 §6.2 (V-1), §6.5 (V-2), §6.3/§6.4 (V-3),
  §10; remediation §9–§16; and the actual follow-up diff, taken against a **byte-exact copy of the
  first-remediation `src/server/sync/service.ts` retained from verification pass 1**
  (SHA-256 `9f9f0014…7cdaf5`) rather than against the remediation's own reconstruction of that state.
  The shipped tests were read to establish coverage; **none of their results were accepted as proof**.
- **Method.** Two harnesses, both outside the repository:
  1. **Service-layer probe** (`C:\tmp\medium1-verify2\probe2.ts`, **91 checks** over 7 scenario
     groups) driving `applySyncBatch` against **real PostgreSQL 16.14** in the local Docker instance,
     with the row-level write audit from pass 1 reinstalled on `workout_sessions`,
     `session_exercises`, `set_logs` and `recommendations` so **transient** intra-batch writes are
     observable.
  2. **Real-client probe** (`C:\tmp\medium1-verify2\e2e\deletion-lost-reply.spec.ts`, own Playwright
     config and testDir) against a **production standalone build** assembled per
     `.github/workflows/deploy.yml` and run as `node .next/standalone/server.js`. The **pass-1**
     specs — written before this remediation existed, one of which reproduced V-1 — were re-run
     unmodified against the same build.
- **Four-way control.** Every one of the 91 checks was run against four implementations of
  `src/server/sync/service.ts`, each on its own empty disposable database: **HEAD** (pre-remediation),
  **FIRST** (first remediation, from the pass-1 byte-exact copy), **CURRENT** (the follow-up under
  verification), and a deliberately **mutated** build reintroducing the shared-`Set` bug (§5).
- **Disposable databases**, all created for this pass and dropped at the end (§8): `m2v_probe`,
  `m2v_neg`, `m2v_head`, `m2v_sharedref`, `m2v_e2e`, `m2v_c_rec`, `m2v_c_vol`, `m2v_c_rc`,
  `m2v_freshmig`.
- **Toolchain:** Node 24.15.0, Next.js 15.5.23, Playwright 1.62.1, PostgreSQL 16.14.

## 1. Verdict

**VERIFIED — READY FOR DEVICE ACCEPTANCE** (last line of this document).

**V-1, V-2 and V-3 are all genuinely fixed**, each proven against the first-remediation implementation
as a negative control and each confirmed through the real client on a production build. The V-1
reproduction from pass 1 — which converged at `{pending:0, dead:1}` with a false "couldn't sync"
banner — now converges at `{pending:0, dead:0}` with no banner, exactly the contiguous surviving sets,
and a single correct recommendation. Nineteen probe checks move from failing to passing; **none of the
91 checks fails under both remediations.** No regression in any shipped suite.

Three findings are recorded, none device-blocking:

- **W-1 (latent regression, should be closed).** The new `canExcuseViaSupersession` full-subsumption
  gate re-opens MEDIUM-1's exact rejections (`invalid_lifecycle_transition`, `session_locked`) for any
  same-id group in which a later op omits **even one field** the earlier op set. This coverage was won
  by the first remediation and given back by the second. It is **not reachable by the current client**
  — every `workoutSession`/`sessionExercise` op it emits comes from one of two fixed-shape full-row
  builders (verified by exhaustive call-site enumeration and by the real-client runs) — but it is
  brittle: one new payload field, or one op builder that omits a field, silently re-opens MEDIUM-1.
- **W-2 (introduced, bounded).** `laterDelete` short-circuits *before* the required-fields check,
  parent lookup, ownership predicate, lock check and insert, so a malformed, unknown-parent,
  foreign-owned, locked-session or set-number-conflicting `setLog` create is reported `applied` when a
  later op in the same batch deletes its id. No write occurs in any case, no cross-user row is touched,
  and the paired delete makes the final state identical either way — the cost is classification
  honesty, not integrity.
- **W-3 (matches the shipped baseline).** The per-field `writable` split reintroduces a transient
  intermediate row state and a double `reevaluateForSourceSessionExercise` on the first application of
  a full-row-plus-partial batch. This is `HEAD`'s own behaviour, which the first remediation had
  suppressed with its blanket skip; replay idempotence and single-pending-recommendation both hold.

## 2. What was executed

| Check | Result |
|---|---|
| Independent 91-check probe, **CURRENT**, real PostgreSQL 16.14 | **81 / 91** — 10 substantive failures, all classified in §6 |
| Same probe, **FIRST remediation** (pass-1 byte-exact copy) | **72 / 91** |
| Same probe, **HEAD** (pre-remediation) | **71 / 91** |
| Same probe, **shared-`Set` mutation** (deliberate reintroduction of §11's bug) | **77 / 91** (§5) |
| Pass-1 real-client specs re-run unmodified against the new build | **2 / 2 pass** — the V-1 reproduction now clean |
| New real-client specs (deletion + lost reply; deletion + recommendation) | **2 / 2 pass** |
| `pnpm typecheck` / `pnpm typecheck:sw` / `pnpm lint` | clean |
| `pnpm format:check` | 1 warning on `src/server/sync/service.ts` — CRLF working copy, clean with `--end-of-line auto` (carried V-5, unchanged) |
| `pnpm test:unit` | **479 / 479**, 38 files |
| `pnpm test:integration` (PGlite) | **255 passed, 9 skipped**; 19 files passed, 3 skipped |
| Real-Postgres concurrency files, each on its own empty disposable database | **9 / 9** |
| Full `pnpm playwright test` against the production standalone build | **68 / 68** |
| Fresh migration chain on an empty PostgreSQL 16 database | clean apply; second `db:migrate` a no-op |
| `drizzle-kit check` | "Everything's fine" — zero drift |
| `pnpm build` | clean; standalone assembled per `deploy.yml` and used for every E2E run |

## 3. Task item 1 — set create → delete replay

### 3.1 Direct submission, three times, both session states

**T1 — completed session.** Client-faithful full-row ops throughout: session create → exercise create →
three set creates (the third a mis-logged 60 kg × 12) → `setLog` delete of that third set → completion.
Submitted three times.

| Check | Result |
|---|---|
| Submissions 1, 2, 3 each `rejected: []`, all 7 ops applied | **PASS** |
| Exactly the two survivors remain, contiguous (`1:100.00`, `2:100.00`) | **PASS** |
| Rows + recommendation byte-identical across all three (updated_at excluded) | **PASS** |
| The recommendation row byte-identical across all three **including `updated_at`** | **PASS** |
| Exactly one recommendation | **PASS** |
| Replay never re-INSERTs the deleted set (write audit) | **PASS** — pass-3 writes are two `set_logs:UPDATE` only |
| The deleted set never counted toward the recommendation (`setsCompleted: 2`, 2 work sets) | **PASS** |

**T2 — in-progress session.** Same shape mid-workout, deleting the **first** set so the survivor is
renumbered into the deleted set's own slot (the `set_number_conflict` variant). Submitted three times:
all `rejected: []`; the survivor sits at set 1; the session stays `in_progress`; rows byte-identical;
no re-INSERT on replay. **PASS.**

Under **both** HEAD and the first remediation, T1's and T2's second and third submissions fail. This is
the V-1 defect, and it is closed.

### 3.2 The real offline-client lost-response path

Production standalone build, disposable `m2v_e2e` seeded through the documented two-pass order.
Everything happens offline so all ops accumulate in one pending FIFO batch; a `page.route` handler
forwards the first `/api/sync` for real (`route.fetch()`, so it commits) and discards the reply
(`route.abort()`); the client's **own automatic backoff retry** resends it. No manual Retry anywhere.

**Spec 1** — log 70 / 72.5 / 75 kg offline, delete the **middle** set, complete:

- `waitForOutboxDrained` converges; a direct IndexedDB read gives **`{pending: 0, dead: 0}`**, and the
  dead-letter list is empty.
- No "couldn't sync" banner.
- `/api/history` → status `completed`, sets exactly `["70x5", "75x5"]`.
- Straight from PostgreSQL: exactly two rows, contiguously renumbered `["1:70.00", "2:75.00"]` — the
  deleted set is gone, not resurrected.

**Spec 2** — the same, plus a real `load-progression` recommendation, a skip/unskip round-trip, exercise
notes, a set correction through the real Edit/Save UI, and a deleted **failed** set (60 kg × 2 @ RIR 0)
whose survival would visibly change the outcome:

- `{pending: 0, dead: 0}`, no banner.
- Sets exactly `["60x6@2", "60x5@2", "60x5@2"]`; `skipped: false`; notes `"second verification run"`.
- Exactly **one** recommendation: `pending`, `increase_load`, `derived.setsCompleted: 3`,
  `derived.finalSetRir: 2` — the deleted failed set never entered evaluation — and byte-identical when
  re-read after the retry settled.

**Pass-1 specs, re-run unmodified.** The spec that reproduced V-1 in pass 1 (`{pending:0, dead:1}`,
`setLog/upsert: session_locked`, banner present, manual Retry re-dead-lettering) now logs:

```
[create->delete replay] outbox after automatic retry: {"pending":0,"dead":0}
[create->delete replay] dead letters: []
[create->delete replay] "couldn't sync" banner present: false
```

Both pass-1 specs pass. **Task item 1 holds.**

## 4. Task item 2 — operation-aware supersession

Each sequence was run twice — first application and replay — with the write audit active.

| Sequence | First application | Replay |
|---|---|---|
| create → edit (full-row) | applies; row lands at 107.5 | `rejected: []`; value not regressed; the only write is the trailing edit's own `updated_at` touch; **the row never holds the stale create's value at any instant** |
| create → delete | `rejected: []`; **the set is never even transiently inserted** (audit empty) | `rejected: []`; **writes nothing at all** |
| delete → recreate (same id) | `rejected: []`; the recreated row wins (95 kg) | `rejected: []`; converges to the same row |
| delete → partial upsert | `setLog:missing_required_fields` — the partial cannot resurrect the row and is **not** silently applied; no row remains | — |
| full-row → 1 partial correction | `105 / 6 reps / RIR 1` — **every omitted field survives** | identical |
| full-row → **2** partial corrections | `105 / 7 reps / RIR 1` — the field union reproduces sequential semantics exactly | identical |
| 2 disjoint partials | `110 / 3 reps / RIR 2` — both land | identical |

**Field-union semantics.** For `[A: full-row {weight 100, reps 6, rir 1, …}, B: {weightKg 105},
C: {reps 7}]`, the correct sequential result is weight 105 (B), reps 7 (C), RIR 1 (A) — which is what
`writable = ownFields − laterUpsertFields` produces, at every position. A carries RIR because no later
op sets it; B carries weight because only C's `reps` is excluded from it; C carries reps.

**Transient state, stale writes, recommendation churn (audited).**

- No superseded op writes anything on replay; the create → delete pair writes nothing even on **first**
  application.
- **T5:** a batch containing a deleted *failed* set (3 reps, RIR 0) plus three good sets produces
  exactly one recommendation, `increase_load`, `setsCompleted: 3`, `finalSetRir: 1`; the replay leaves
  that row byte-identical and **touches no recommendation row at all**.
- **T7:** on a completed session holding a pending recommendation, a `[full-row edit, partial
  correction]` batch merges correctly and the **replay** adds no recommendation row, changes no value,
  leaves every recommendation row byte-identical, and touches no recommendation row. Its **first**
  application, however, writes twice and evaluates twice — see W-3 (§6.3).

**Task item 2 holds**, with W-3 recorded.

## 5. Task item 4 — implementation details

### 5.1 `laterUpsertFields` is snapshotted, not shared

Confirmed two ways.

**By code:** `src/server/sync/service.ts:222` reads `laterUpsertFields: laterFields ? new Set(laterFields) : null`,
captured *before* the current op folds its own fields into the same map entry.

**By a discriminating negative control.** Line 222 was mutated to `laterFields ?? null` — the exact bug
the remediation reports catching during development (§11) — and the same 91-check probe was re-run on a
dedicated database. The result is not merely "some tests fail"; it fails with precisely the values the
leak predicts:

| Check | Snapshot (current) | Shared reference (mutated) |
|---|---|---|
| full-row + 1 partial | `1:105.00:6:1` | `1:105.00:5:2` — the full-row op's reps/RIR dropped |
| full-row + 2 partials | `1:105.00:7:1` | `1:100.00:7:2` — **the middle op writes nothing**, weight stuck at 100 |
| 2 disjoint partials | `1:110.00:3:2` | `1:100.00:3:2` — the first partial lost entirely |
| completed-session correction batch | `1:105.00:6:1` | `1:105.00:5:2` |

The mutated build also makes **T3b / T3d / T3e pass**, because a leaked self-inclusion renders
`ownFields ⊆ laterUpsertFields` trivially true — independently confirming that the subsumption gate,
not the snapshot, is what drives W-1. Line 222 was restored from a copy taken before the mutation and
verified byte-identical (SHA-256 `fa294970…b2b3a0`).

### 5.2 First application and replay both behave correctly

Every sequence in §4 was asserted on both the first application and the replay, separately. The one
asymmetry found is W-3 (§6.3): the first application of a full-row-plus-partial batch writes twice and
evaluates twice; the replay writes only the trailing op's `updated_at` and evaluates not at all.

### 5.3 The new tests fail against the first-remediation implementation

Rather than relying on the remediation's own reconstruction of the first-remediation state, this pass
used the **byte-exact `src/server/sync/service.ts` retained from verification pass 1**
(SHA-256 `9f9f0014…7cdaf5`). Against it the probe scores **72 / 91**; against `HEAD`, **71 / 91**;
against the follow-up, **81 / 91**. Nineteen checks move from failing to passing, and **no check fails
under both remediations**:

| Class | Count | Checks |
|---|---|---|
| Fixed by the second remediation | 19 | V-1: `T1.2`, `T1.3`, `T2.2`, `T2.3` (×2 assertions each), `T4b.audit1/2`, `T5.replay`. V-2: `T4e`, `T4f`, `T4g` (first + replay each), `T7.apply`, `T7.replay`. V-3: `T6a.trailed`, `T6c.trailed` |
| Regressed by the second remediation | 10 | W-1: `T3b.replay`, `T3d.partialCompletion`, `T3e.oneFieldShort`. W-2: `T6d.unknownParent/malformed/foreign/locked/discarded.delete`, `T6e.setNumber.delete`. W-3: `T7.transient` |
| Failing under **both** remediations | **0** | — |

The shipped regression tests were also re-run and all pass, inside the 255-test integration run and the
68-test E2E run: the five new integration tests (§12.1, §12.2, §12.4, §12.5, §12.6) and the new
deletion spec (§12.3), alongside the three from the first remediation.

## 6. Findings

### 6.1 W-1 — the subsumption gate re-opens MEDIUM-1 for non-uniform same-id groups

`canExcuseViaSupersession` requires that **every** field an op sets is also set by some later same-id
op. Any later op that omits one field breaks the gate and restores MEDIUM-1's original rejections.
Isolated cleanly:

| Batch shape | Replay result | HEAD | FIRST | CURRENT |
|---|---|---|---|---|
| **T3a** — full-row create + full-row completion (**what the client emits**) | `rejected: []` | F | P | **P** |
| **T3d** — full-row create + **partial completion** `{id, status, completedAt}` | `workoutSession:invalid_lifecycle_transition` | F | P | **F** |
| **T3e** — full-row exercise create + later op missing **one** field (`prescription`) | `sessionExercise:session_locked` | F | P | **F** |
| **T3b** — both together (the review's own documented API reproduction) | both of the above | F | P | **F** |
| **T3c** — statusless create + partial completion (shipped fixture shape) | `rejected: []` (noop path, gate not involved) | P | P | **P** |

These are MEDIUM-1's own symptoms, verbatim, and the pattern F → P → F shows the second remediation
returned coverage the first had won. Data is unaffected (`T3b.data`: rows unchanged by the replay) and
the rejection is permanent (`T3b.permanent`), so a client that produced such a batch would see the
original false "couldn't sync" with an unusable Retry.

**Reachability — not reachable today.** Every `workoutSession` and `sessionExercise` op the client can
emit was enumerated: `src/sync/activeSession.ts:152` (`workoutSessionFullRowOp`), `:173`
(`sessionExerciseFullRowOp`), and `:701` (the takeover discard). The two full-row builders always emit
a fixed field set — `completedAt` is the only variation, and it is only ever *added* by the completion
op, never dropped from a later one — so every same-id group the client produces is trivially subsumed.
The takeover discard is a bare `{id, status:"discarded"}` for a *foreign* session id with no later
same-id op; it converges through `isNoopWorkoutSessionUpdate`, not the gate. Confirmed empirically:
T3a passes, and all four real-client specs pass.

**Why it still matters.** `pwa-offline-strategy.md` §5 states "ops are full-row upserts … replays
converge", so the gate is consistent with the documented contract — but nothing enforces that contract,
and `src/sync/corrections.ts` already breaks it for `setLog` (which is why V-2's `writable` path
exists). The gate makes replay convergence for the other two entities depend on an unenforced
invariant: adding a field to `workoutSessionUpsertPayloadSchema`, or introducing one builder that omits
a field, silently re-opens MEDIUM-1 with no test in the repository covering the difference.

### 6.2 W-2 — `laterDelete` excuses validation, ownership and conflict rejections

In `applySetLogUpsert`'s `!existingRow` branch, `if (supersession.laterDelete) return applied(...)` runs
before the required-fields check, the parent lookup (which carries the ownership predicate), the
parent-lock check and the insert. Measured, each against its standalone control:

| Case | Standalone | Trailed by a delete of its own id | HEAD/FIRST |
|---|---|---|---|
| Unknown parent | `not_found` | **`applied`** | rejected |
| Missing required fields | `missing_required_fields` | **`applied`** | rejected |
| Foreign-owned parent (new row) | `not_found` | **`applied`** | rejected |
| Brand-new set on a locked session | `session_locked` | **`applied`** | rejected |
| Different-id `set_number` conflict | `set_number_conflict` | **`applied`** | rejected |
| Existing set on a **discarded** session | `session_locked` | upsert **`applied`**, delete still `session_locked` | both rejected |

**Guardrails that hold, and were verified:**

- `invalid_payload` still rejects — schema parsing precedes the check.
- Ownership on an **existing** row still rejects `not_found`; that check sits *before* `laterDelete` in
  the existing-row branch. Another user's set is untouched (`1:100.00:5:2` unchanged).
- **No write occurs in any of these cases** (write audit empty for the foreign, locked and discarded
  probes); the locked session still holds exactly its original set.
- The paired delete guarantees the row is absent once the batch settles, so the final state is identical
  whether the op is applied or rejected — no user intent is lost, and nothing is disclosed (`applied` is
  returned regardless of whether the id or parent exists).

Bounded, and not reachable in a harmful form by the client: `buildSetDeletionOps` only pairs a delete
with renumbering upserts of *other* ids, and a client only deletes a set the user deleted. Recorded
because it is a deliberate widening the second remediation introduced, and because the task asked
specifically whether `laterDelete` can bypass validation or ownership. It can — without effect.

### 6.3 W-3 — transient intermediate state and double evaluation on first application

Splitting the write per field means an earlier op now writes the fields no later op covers. On a
completed session with a pending recommendation, `[full-row edit (reps 5→6, RIR 2→1), partial
{weightKg: 105}]` produces, on **first** application:

```
set_logs:UPDATE, recommendations:UPDATE, recommendations:INSERT,
set_logs:UPDATE, recommendations:UPDATE, recommendations:INSERT
```

The row transiently holds `{100.00, 6 reps, RIR 1}` — weight not yet corrected but reps/RIR already
were, a state the user never had — and `reevaluateForSourceSessionExercise` fires twice, leaving
2 superseded + 1 pending recommendation rows.

**This is `HEAD`'s own behaviour** (`T7.transient` fails at HEAD too); the first remediation's blanket
skip had suppressed it, at the cost of V-2's silent field loss. It is also consistent with
`progression-engine.md` §8 ("Set edited while rec pending → re-evaluate + supersede") — each write is a
genuine edit. What matters holds: exactly one **pending** recommendation survives, computed from the
correct final row; the **replay** adds nothing, changes nothing, and touches no recommendation row.

### 6.4 Carried, unchanged from verification 1

- **V-4** — replayed upserts bump `updated_at` on the row whose last same-id op takes the ordinary
  update path. Pre-existing; no data column affected.
- **V-5** — `pnpm format:check` fails on `src/server/sync/service.ts` alone; `git ls-files --eol`
  reports `i/lf w/crlf`, and `prettier --check --end-of-line auto` passes. `core.autocrlf=true`
  normalises on commit, so CI is unaffected. Cosmetic.

## 7. Task item 3 — rejection preservation

| Case | Standalone | Trailed by a later same-id op |
|---|---|---|
| **Bare** `{status:"in_progress"}` on a completed session | `invalid_lifecycle_transition` | **still rejects**, nothing written |
| **Bare** `{skipped:true, notes:"…"}` on a locked exercise | `session_locked` | **still rejects**, nothing written |
| **Full-row** create-shaped op with `status:"in_progress"` trailed by a full-row completion | — | excused, nothing written, row unchanged |
| Different-id session create against a live in-progress session | `session_conflict` | — |
| Different-id `session_exercise` on an occupied position | `position_conflict` | — |
| Different-id `setLog` on an occupied set number | `set_number_conflict` | excused only when trailed by a delete of **its own** id (W-2); the incumbent set is untouched |
| Another user's existing `setLog` | `not_found` | `not_found` even when trailed by a delete |
| `invalid_payload` | `invalid_payload` | `invalid_payload` even when trailed by a delete |

The bare-payload cases are exactly V-3, and they are fixed: both fail under the first remediation and
pass now. The full-row create-shaped revert is inherently indistinguishable from the legitimate
MEDIUM-1 create replay — the two batches are byte-identical, so no server-side rule can separate them.
What must hold does: the row is confirmed unchanged and the write audit is empty.

**Task item 3 holds**, with W-2 recorded as the one place `laterDelete` relaxes classification.

## 8. Restoration and hygiene

- **Negative controls.** Three implementations were installed into `src/server/sync/service.ts` during
  this pass — the pass-1 first-remediation copy, `HEAD`, and the one-line shared-`Set` mutation. After
  each, the file was restored from a copy taken before any change and verified **byte-identical**:
  SHA-256 `fa294970…b2b3a0`, matching the hash recorded before this pass began.
- **Files.** All four remediation files and all three prior reports carry the same SHA-256 after this
  pass as before it. `git status --porcelain` lists exactly what it listed at the start, plus this
  report. The pre-existing user-owned entries (`CLAUDE.md`, `HANDOFF.md`,
  `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`,
  `gpt-memory.md`) were neither read for content nor modified; their mtimes are unchanged.
- **Isolation.** All fixtures live outside the repository. The E2E run used a config with its own
  `testDir` and **no** `webServer` block, so it could never rebuild or restart anything on its own.
- **Databases and processes.** All nine disposable databases were created after this pass began and
  dropped at the end; the developer's `gymapp` database is the only one left on the instance, and it
  was never written to (every command carried an explicit `DATABASE_URL`). The standalone server
  process was stopped.
- Nothing was committed, pushed, deployed or tagged; production was never contacted; no LOW finding,
  no other implementation file and no existing report was modified.

## 9. What holds

1. **V-1 closed.** Set create → delete replays converge on completed and in-progress sessions, over
   three direct submissions and through the real client on a production build: zero rejections, zero
   dead letters, no false banner, exact contiguous surviving sets, byte-identical rows, and one
   unchanged recommendation from which the deleted set is absent.
2. **V-2 closed.** A full-row op trailed by one or more partial corrections preserves every omitted
   field, on first application and on replay, with the field union reproducing sequential semantics at
   every position.
3. **V-3 closed.** Bare invalid-lifecycle and locked-session mutations reject again, standalone and
   trailed, without writing.
4. **`laterUpsertFields` is genuinely snapshotted**, proven by a mutation control that fails with
   exactly the values a leaked reference predicts.
5. **No regressions.** unit 479/479, integration 255 passed / 9 skipped, PG concurrency 9/9, full E2E
   68/68 on a production standalone build, typecheck / typecheck:sw / lint clean, fresh migration chain
   clean and idempotent, zero schema drift.

W-1 should be closed before the code changes again — it is one omitted payload field away from
re-opening MEDIUM-1, and no shipped test covers the difference. It does not affect the device pass:
every path the iPhone checklist exercises runs through the client's fixed-shape full-row builders, and
all four real-client specs converge cleanly.

## 10. Verdict

**VERIFIED — READY FOR DEVICE ACCEPTANCE**
