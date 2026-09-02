# Warm-up Routines v1 — Remediation Report

Date: 2026-09-02
Base: `main` @ `f4ee4e1` plus the uncommitted Warm-up Routines v1 working tree.
Inputs: `docs/reviews/warmup-routines-review.md` (findings; **not modified by this work**), `docs/reviews/warmup-routines-implementation.md` (corrected by appendix only — §4).
Scope: **MEDIUM-1 + LOW-1**, **MEDIUM-2**, **LOW-2**. LOW-3 and LOW-4 left untouched by instruction (§7).
Status: complete. Verified against real PostgreSQL 16 over independent connections, real HTTP against a production build, and the full suites on a clean disposable PostgreSQL 16 database. Not committed, not pushed, not deployed. No production access.

---

## 0. Summary

| Finding | Fix | Load-bearing proof |
|---|---|---|
| **MEDIUM-1** unhandled HTTP 500 on concurrent association replacement | `FOR UPDATE OF workout_templates` anchor lock inside the existing transaction + typed `23505`/`23503` → HTTP 409 mapping | Bypass the lock → new suite fails (2 tests); restore → passes. Real HTTP: **12/12 `200|200`** (was 8/8 `200|500`); routine-delete race **40/40 `409 association_conflict`** (was 15/15 `500`) |
| **LOW-1** a later-committing clear silently discarded | same anchor lock | Bypass → `clearedCount = 0` (the review's 40/40 loss reproduced); restore → clear wins 6/12 at the service layer and 6/12 over HTTP |
| **MEDIUM-2** boundary test's roots omit 3 real warm-up modules | one canonical **discovered** inventory + 2 explicit documented carve-outs + a completeness guard | Revert to the old hand-listed inventory → **6 tests fail**, including all 5 new controls; restore → 17/17 pass |
| **LOW-2** unreproducible prettier evidence | dated appendix appended to the implementation report; historical text untouched | Mechanism independently reproduced (§4) |

No schema, migration, product behaviour, sync, outbox, progression, volume or backlog file was changed (§6).

---

## 1. MEDIUM-1 + LOW-1 — serialise on the template anchor row

### 1.1 The change

`src/server/warmupRoutines/service.ts`, `setTemplateWarmupRoutines`:

- The transaction now **opens** with the ownership read, upgraded to a lock:

  ```sql
  select "workout_templates"."id" from "workout_templates"
    inner join "programs" on "workout_templates"."program_id" = "programs"."id"
   where ("workout_templates"."id" = $1 and "programs"."user_id" = $2)
     for update of "workout_templates"
  ```

  (SQL captured from the actual query builder, not hand-written.)

- The ownership check **moved inside** the transaction — it *is* the locking statement, so the template is proven to be this user's under the same lock that serialises the write, rather than in an earlier unlocked read. `null` is signalled out of the transaction body by a module-private `TemplateNotOwnedSignal`; the public contract is still `Promise<TemplateWarmupRoutineLink[] | null>`, unchanged.
- A new exported `WarmupRoutineAssociationConflictError`, raised when a residual `23505`/`23503` escapes the transaction.
- `src/app/api/templates/[id]/warmup-routines/route.ts` maps it to **409 `association_conflict`**.

### 1.2 Why the lock fixes both findings

Under READ COMMITTED each statement takes its own snapshot. Without a shared anchor, two replacements can both snapshot before either commits, so the second one's `DELETE` cannot see the first's rows, removes nothing, and collides at `position 0` — MEDIUM-1. The mirror case is a "clear all" that deletes nothing and inserts nothing, committing a no-op while reporting success — LOW-1.

With the lock, the second transaction blocks on the anchor row until the first commits; when it resumes, its later statements take **fresh** snapshots, so its `DELETE` now sees and removes the winner's rows. The outcome is honest last-writer-wins, and a clear that commits second really clears.

`FOR UPDATE **OF workout_templates**` is deliberate: the joined `programs` row is *not* locked, so replacements on two different templates of the same program never block each other (asserted — probe 3).

### 1.3 Why the SQLSTATE mapping is still there

One race is genuinely outside the lock's reach: hard-deleting a routine never touches the template row, so the two transactions do not contend and the `INSERT` can still hit the FK (`23503`). That path is now a typed 409 rather than an unmapped 500 — and it is the case the real-HTTP probe below exercises 40/40. The `23505` branch is defence in depth, matching every peer service (`blocks`, `exercises`, `programs`, `recovery`, `sync`, and this file's own create/replace paths).

### 1.4 The new concurrency suite

`tests/integration/warmupAssociationConcurrency.integration.test.ts` (new, 6 tests, 12 trials each where applicable). Follows the established shape of the three existing real-PG concurrency files exactly: env-var-gated (`WARMUP_CONCURRENCY_DATABASE_URL`), real `pg` pool (`max: 16`), empty-of-users guard, `describe.skipIf`, invocation documented in the header. It **skips** in an ordinary `pnpm test:integration` run, exactly like its three peers.

| Probe | Covers | Asserts |
|---|---|---|
| 1 | replacement / replacement | both calls succeed; persisted state is exactly one submitted set — never a union, mixture or partial |
| 2 | replacement / clear (**LOW-1**) | both succeed; **a later-committing clear really clears** (`clearedCount > 0`); when populate wins, its set is complete |
| 3 | different templates, same program | both apply in full — the lock is not over-broad |
| 4 | replacement / routine hard-delete | outcome is either clean or a **typed** `WarmupRoutineAssociationConflictError`; **never** an untyped error; **zero orphan links**, asserted by join rather than trusting the FK |
| 5 | sequential replacements | the lock does not disturb the ordinary path |
| 6 | ownership under the lock | foreign template → `null` and no write; unknown id → `null`; malformed id → `null` |

Run against a freshly created, migrated PostgreSQL 16 database (`gymapp_wuconc`):

```
✓ tests/integration/warmupAssociationConcurrency.integration.test.ts (6 tests) 1450ms
  Test Files  1 passed (1)
       Tests  6 passed (6)
```

### 1.5 Proof the suite is load-bearing

The lock was removed — the single `.for("update", { of: workoutTemplates })` clause deleted, nothing else — and the suite re-run against the same database:

```
 × two concurrent replacements both succeed and leave exactly one submitted set, across repeated trials
   → trial 0: a concurrent replacement failed: expected [ Array(1) ] to deeply equal []
     + [ "WarmupRoutineAssociationConflictError: The template's warm-up routines changed
          concurrently — please retry" ]

 × a concurrent clear resolves as honest last-writer-wins — when the clear commits second it really clears
   → a later-committing clear never actually cleared — LOW-1 has regressed: expected 0 to be greater than 0

 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```

Both findings reproduce exactly as the review described them: the 23505 race returns (now caught as a typed conflict, which is itself evidence the defensive mapping works), and `clearedCount` is **0** — the review's 40/40 silent-discard.

The file was then restored and verified byte-identical:

```
expected: 720F6483EC2619B2D7A8252EEA4767D6EC08441E5F3FAA8988DA930A4352C963
actual:   720F6483EC2619B2D7A8252EEA4767D6EC08441E5F3FAA8988DA930A4352C963
RESTORED BYTE-IDENTICALLY: True     line diff: (none)
```

and the suite re-run: **6/6 pass**.

### 1.6 Real HTTP, production build — the review's own measurements repeated

Against `pnpm build` + `pnpm start` on the clean disposable database, using the real login cookie and the real endpoints (ad-hoc probes, not committed specs — see §5.3):

**Replacement vs replacement**, 12 trials (the review measured 8/8 `200|500` pre-fix):

```
REPLACE/REPLACE statuses:  ["200|200" x12]
REPLACE/REPLACE persisted: ["HTTP Race C@0,HTTP Race D@1*"]      <- always exactly one submitted set
any 5xx: false
```

**Replacement vs clear**, 12 trials, alternating issue order (the review measured 40/40 clears silently discarded):

```
REPLACE/CLEAR statuses:  ["200|200" x12]
cleared-wins count: 6 / 12                                        <- a clear can now win
```

**Replacement vs routine hard-delete**, 40 trials (the review measured 15/15 unmapped `23503` → HTTP 500):

```
PUT/DELETE status tally: {"409/204": 40}
any 5xx: false
non-200 PUT bodies: ["{\"error\":\"association_conflict\"}"]
```

Honest notes on these numbers: in probe 1 the *same* side won all 12 trials, and in the delete probe *all* 40 trials conflicted — both are artefacts of deterministic loopback timing, not properties of the fix. What the fix guarantees is what is asserted: no 5xx, and a coherent single-set outcome.

### 1.7 UI behaviour deliberately unchanged

`TemplateWarmupRoutinesSection` maps 404 and 400 explicitly and otherwise shows "Failed to save warm-up routines."; a 409 lands on that generic branch, which is accurate and retryable. Adding a 409-specific message would be a product-behaviour change, which this task forbids, and the review explicitly recorded the existing behaviour as acceptable ("On a 500 the UI shows … and a retry succeeds"). Considered and deliberately not done.

---

## 2. MEDIUM-2 — one canonical discovered inventory

### 2.1 The change

`tests/unit/warmupBoundary.test.ts` no longer hand-lists directories. It **discovers** the inventory:

```ts
const WARMUP_PATH_PATTERN = /warmup/i;
const WARMUP_INVENTORY = listSourceFiles(SRC_ROOT)
  .filter((file) => WARMUP_PATH_PATTERN.test(path.relative(SRC_ROOT, file)))
  .sort();
```

16 files are discovered, including the three the review found uncovered:

```
app/(app)/warmup-routines/[id]/page.tsx          <- was omitted (control D')
app/(app)/warmup-routines/new/page.tsx           <- was omitted (control D)
app/api/templates/[id]/warmup-routines/route.ts  <- was omitted (control C, the R-5 case)
app/api/warmup-routines/[id]/route.ts
app/api/warmup-routines/route.ts
db/schema/warmupRoutineItems.ts
db/schema/warmupRoutines.ts
db/schema/workoutTemplateWarmupRoutines.ts
domain/warmup/schema.ts
domain/warmup/session.ts
server/warmupRoutines/service.ts
ui/warmup/TemplateWarmupRoutinesSection.tsx
ui/warmup/WarmupRoutineForm.tsx
ui/warmup/WarmupRoutinesSection.tsx
ui/warmup/types.ts
ui/workout/WarmupCard.tsx
```

### 2.2 The two carve-outs, explicit and individually justified

| # | Files | Excluded from | Why | Kept honest by |
|---|---|---|---|---|
| **(a)** | the three `db/schema/warmup*` / `workoutTemplateWarmupRoutines` table declarations | claim 1's offender set only | `db/schema/index.ts` is a shared table registry every service imports wholesale, so these are trivially "reachable" from the engines exactly as `bodyweightEntries`/`recoveryEntries` already are (the carve-out `progressionBoundary.test.ts` documents). A Drizzle table declaration is not a read path into warm-up logic. | `isSchemaRegistryOnly` (edge-specific, `allParents`-based): a **direct** engine → `@/db/schema/warmupRoutines` import still fails. Asserted. |
| **(b)** | `ui/workout/WarmupCard.tsx` | claim 2's **root** set only (it remains a full claim-1 offender target) | It imports the active-session store, which legitimately reaches progression because the store is the whole workout's state. Rooting it there would assert something false. | Its inability to write an execution fact is proven behaviourally by `warmupActiveSession.test.ts`'s zero-ops/zero-flush assertions; the walker's ability to see the edge is asserted directly. |

Everything else in the inventory is now walked in both directions — the table declarations are claim-2 roots too, since they are leaf declarations that reach nothing forbidden.

### 2.3 The standing completeness guard

Three new tests make the hand-listing mistake unrepeatable:

- the inventory **must** contain the three previously-omitted files, each named explicitly so a regression is unmistakable in the diff;
- every discovered file is either a claim-2 root or carve-out (b);
- every discovered file is either a claim-1 offender target or carve-out (a).

A future warm-up file therefore either gets walked, or the suite fails until someone documents why not.

### 2.4 New negative controls

Reproducing the review's own executable controls in-process (synthetic edges, so they run on every suite rather than requiring real files to be edited):

| Control | Edge | Before | After |
|---|---|---|---|
| **C** | `app/api/templates/[id]/warmup-routines/route.ts` → `@/domain/sync/schema` | PASSED (false negative) | **DETECTED** |
| **D** | `app/(app)/warmup-routines/new/page.tsx` → `@/domain/sync/schema` | PASSED (false negative) | **DETECTED** |
| **D′** | `app/(app)/warmup-routines/[id]/page.tsx` → `@/sync/outbox` | not controlled for | **DETECTED** |
| claim 1 | `domain/volume/aggregate.ts` → the association route | invisible | **DETECTED** |
| claim 1 | `domain/progression/engine.ts` → the edit page | invisible | **DETECTED** |
| carve-out (a) | `server/volume/service.ts` → `db/schema/warmupRoutines.ts` directly | — | **DETECTED** (and tolerated via the barrel alone, asserted both ways) |

Each control also asserts the file is actually in `WARMUP_ROOTS`, so the control cannot pass for the wrong reason.

### 2.5 Proof the controls are load-bearing

`WARMUP_INVENTORY` was temporarily reverted to the old hand-listed form (four directories + `WarmupCard`) and the file re-run:

```
 × discovers every warm-up file under src/, including the three the previous root set omitted
   → MEDIUM-2 regression: app/api/templates/[id]/warmup-routines/route.ts is not in the inventory
 × control C: a sync-schema import in the template-association route is now DETECTED
   → the association route must be a walked root
 × control D: a sync-schema import in the 'new routine' page is now DETECTED
 × control D': an outbox import in the 'edit routine' page is now DETECTED
 × claim 1: an engine edge into the association route is now DETECTED
 × claim 1: an engine edge into a management page is now DETECTED

 Test Files  1 failed (1)
      Tests  6 failed | 11 passed (17)
```

All five new controls fail, plus the completeness guard. Restored and verified byte-identical:

```
expected: 3D277CB320BE177C8F8A51D5E24B9F19543BD28172E34EF7D85D292B59ED4BF2
actual:   3D277CB320BE177C8F8A51D5E24B9F19543BD28172E34EF7D85D292B59ED4BF2
RESTORED BYTE-IDENTICALLY: True     line diff: (none)
```

Re-run after restore: **17/17 pass** (was 8 tests before this remediation).

---

## 3. What the two MEDIUMs did *not* require

Neither fix touched the schema, a migration, the sync contract, either engine, the outbox, or any product behaviour. `pnpm db:generate` reports **"No schema changes, nothing to migrate"** and created no `0011` file (§6).

---

## 4. LOW-2 — dated correction appended to the implementation report

`docs/reviews/warmup-routines-implementation.md` gained **Appendix A — Correction, 2026-09-02**. Nothing above it was altered; §12's original text stands and the appendix records what was wrong with it.

Independently reproduced before writing (I did not take the review's word for it):

```
worktree sha256                       fa2949707bc3d615b9a35ed78a22443416fed5e0b5c555a95ad79061bfb2b3a0
worktree sha256 after stripping CR    f9d9ebe64e94d6cf05dbd9d72d45a9324379133feef2e7eb0e8eaa5fae47f734
git blob object id                    d37a69b5c8fa9069af51cd0a25e583a9749ca927
git diff HEAD -- src/server/sync/service.ts   (empty)
line endings                          CR=1163  LF=1163  CRLF=1163   (all CRLF)
tracked .ts/.tsx files containing CR  1  (this file only)
core.autocrlf=true, .gitattributes absent
```

The correction records that the content is identical to `HEAD` **after normalising line endings**, and that a CR-stripped copy passes Prettier:

```
in-repo CR-stripped probe sha256   f9d9ebe6…  (== the HEAD blob content)
prettier --check <probe>           All matched files use Prettier code style!   exit 0
```

**A detail the review did not have, and the appendix now records:** the check must be run **inside the repository**. `prettier --find-config-path` on a scratch-directory copy reports `Can not find configure file`, so prettier silently falls back to its own defaults instead of `.prettierrc.json` — a check run outside the project is not evidence in either direction. That, combined with `Set-Content` re-introducing CRLF on Windows, is exactly why the original §12 reproduction was misleading. Both mistakes are named in the appendix so the same evidence is not produced again.

The file itself was **not** normalised: it is review-gated and must stay diff-clean, so `format:check` still reports exactly this one pre-existing failure (§5.1).

---

## 5. Verification evidence

### 5.1 Gates

| Gate | Result |
|---|---|
| `pnpm lint` | **pass** — 0 errors, 0 warnings |
| `pnpm typecheck` | **pass** — 0 errors |
| `pnpm typecheck:sw` | **pass** — 0 errors |
| `pnpm format:check` | **1 pre-existing failure**, `src/server/sync/service.ts` (CRLF only — §4). Every file this remediation touched passes. |
| `pnpm test:unit` | **42 files, 549 passed / 549** (was 540; +9 from the boundary test's 8 → 17) |
| `pnpm test:integration` (ordinary) | **21 passed + 4 skipped files; 294 passed + 15 skipped / 309**, 0 failed. The +6 skips are the new gated concurrency file, skipping exactly like its three peers. |
| Gated concurrency suite (real PG16) | **6 passed / 6** |
| `pnpm build` | **pass** (production build) |
| `pnpm test:e2e` (full, clean disposable PG16 + production build) | **90 passed / 90**, 0 failed |
| `pnpm db:generate` | **"No schema changes, nothing to migrate"**, no file created |

### 5.2 Targeted runs

| Run | Result |
|---|---|
| `warmupBoundary.test.ts` | 17/17 |
| `warmupRoutines.integration.test.ts` + `warmupTodayBundle.integration.test.ts` (PGlite, after the lock change) | 39/39 — the lock does not disturb the single-connection path |
| `warmupAssociationConcurrency.integration.test.ts` (real PG16) | 6/6 |
| `warmupRoutines.spec.ts` + `warmupWorkout.spec.ts` (inside the full E2E run) | 22/22 |

### 5.3 Ad-hoc real-HTTP probes (not committed)

The three probes in §1.6 were run as throwaway Node scripts against the running production server and deleted afterwards. They are deliberately **not** added to the committed Playwright suite: the required regression coverage is the real-PG concurrency suite (§1.4), which is deterministic and gated, whereas an HTTP-level race spec would add runtime and timing sensitivity for no additional guarantee. Their value here is that they repeat the review's *own* measurements at the same layer the review used, so the before/after numbers are directly comparable.

### 5.4 Clean-database verification

- `gymapp_wuconc` — created fresh, migrated `0000 → 0010`, used only by the gated concurrency suite (which refuses to run against a database that already has users).
- `gymapp_wu_rem_e2e` — created fresh, migrated, then bootstrapped in the documented order (`db:seed` → `smoke.spec.ts` → `db:seed` → `tests/e2e/seed.ts`), production build served against it, full 90-test E2E suite green.
- Unit and integration ran on PGlite; nothing ran against the accumulated dev database.
- Dev database `gymapp` verified untouched: `warmup_routines / warmup_routine_items / workout_template_warmup_routines` = **0 / 0 / 0** rows.

---

## 6. Constraint compliance

| Constraint | Status |
|---|---|
| Schemas unchanged | ✓ `git diff HEAD -- src/db/schema/` shows only the implementation's pre-existing `index.ts` barrel lines; no schema file touched by this remediation |
| Migrations unchanged | ✓ `0000`–`0009` diff-clean; `0010` untouched; no `0011`; `db:generate` reports no drift |
| Product behaviour unchanged | ✓ no UI file modified (§1.7); the only externally visible difference is that a previously-500 concurrent write is now a 409 or a success |
| Sync / outbox untouched | ✓ `src/domain/sync/schema.ts`, `src/server/sync/service.ts`, `src/domain/sync/payloadBuilders.ts`, `src/sync/outbox.ts`, `src/sync/flush.ts` all `git diff HEAD` **empty** |
| Progression / volume untouched | ✓ `src/domain/progression/*` and `src/domain/volume/*` diff-clean, 0 untracked files inside either |
| Backlog untouched | ✓ `docs/input/product-ideas.md` not modified |
| `warmup-routines-review.md` untouched | ✓ not modified |
| LOW-3 / LOW-4 untouched | ✓ no change to the schema's cross-user linkability or to `uq_warmup_routines_name` |
| No commit / push / deploy / production | ✓ none; production never contacted |

### Files changed by this remediation (5)

```
 M src/server/warmupRoutines/service.ts                            MEDIUM-1: anchor lock, typed conflict, SQLSTATE mapping
 M src/app/api/templates/[id]/warmup-routines/route.ts             MEDIUM-1: 409 association_conflict
 M tests/unit/warmupBoundary.test.ts                               MEDIUM-2: discovered inventory, carve-outs, 6 new tests
?? tests/integration/warmupAssociationConcurrency.integration.test.ts   MEDIUM-1/LOW-1: new real-PG suite
 M docs/reviews/warmup-routines-implementation.md                  LOW-2: Appendix A appended (nothing rewritten)
```

Plus this file. Every other entry in `git status` is unchanged from the state the review recorded.

### Temporary artifacts

Two source bypasses (the lock clause; the boundary inventory) were applied, measured, and restored **byte-identically** with SHA256 and line-diff verification (§1.5, §2.5). Three throwaway Node probe scripts and one in-repo prettier probe file were created in scratch/temp and deleted. `test-results/` holds only Playwright's gitignored `.last-run.json`.

### Databases

`gymapp_wuconc` and `gymapp_wu_rem_e2e` were created and are **left in place** as reproducible evidence — the first is the documented target of the gated concurrency suite (named in its header comment), the second holds the E2E run. Both are disposable and safe to drop. `gymapp` (dev) and `gymapp_warmup_e2e` (left by the implementation task) are untouched.

---

## 7. Deliberately not done

- **LOW-3** (the database alone permits a cross-user template↔routine link) — untouched by instruction. It would need a schema change, which this task forbids, and the service guard was re-verified airtight by the review.
- **LOW-4** (`uq_warmup_routines_name` is not trim-normalised) — untouched by instruction; it would need a migration.
- **Real-device acceptance** — still unrun. Nothing in this remediation changes phone behaviour, so the review's §8 list is unchanged and still outstanding.
- **The 409-specific UI message** — considered and rejected as a product-behaviour change (§1.7).

---

## 8. Verdict

Both MEDIUMs and LOW-1 are fixed at the root rather than papered over: the anchor lock removes the race that produced MEDIUM-1's 500 and LOW-1's silent discard, and the SQLSTATE mapping covers the one race a lock cannot reach. Both fixes are backed by a real multi-connection PostgreSQL suite and by real-HTTP repetitions of the review's own measurements, and **both were proven load-bearing by bypassing the fix, observing the exact documented failure, and restoring byte-identically**. MEDIUM-2's root set is now discovered rather than hand-listed, with two explicitly documented carve-outs, a standing completeness guard, and five new controls that all fail against the old root set. LOW-2 is corrected by appendix, with the mechanism independently reproduced and the reason the original evidence misled now on record.

All gates pass, with the single pre-existing CRLF-only `format:check` failure on a file this task must not touch.

**READY FOR TARGETED REMEDIATION VERIFICATION**

---

## Appendix B — Follow-up, 2026-09-02 (verification findings §5 and §3.3)

*Appended after `docs/reviews/warmup-routines-remediation-verification.md` (verdict `REMEDIATION INCOMPLETE`). Everything above this line is preserved as history; §1.4, §2.4 and §5.2 stand as originally written, and this appendix records what was wrong with two of their claims. **Test and report changes only** — no production source, schema, migration or UI was touched.*

### B.1 Verification §5 — the delete-race assertion was too narrow (fixed)

**The defect.** Probe 4 of `tests/integration/warmupAssociationConcurrency.integration.test.ts` accepted only `WarmupRoutineAssociationConflictError` for the replacement-vs-routine-delete race, and announced `"MEDIUM-1 has regressed"` when anything else arrived. That message was false, and the assertion was wrong: the race has **three** legitimate outcomes, not two.

| Interleaving | Service raises | Route maps to |
|---|---|---|
| the delete commits **before** the in-transaction ownership `SELECT` | `WarmupRoutineLinkTargetNotFoundError` | 400 `routine_not_found` |
| it commits **after** the `SELECT` but before the `INSERT` (FK check fails) | `WarmupRoutineAssociationConflictError` | 409 `association_conflict` |
| it commits after the whole transaction | — | 200, links intact |

All three are typed, non-5xx and correct — a client that asked to link a routine which no longer exists genuinely deserves `routine_not_found`.

**The fix.** Probe 4 now asserts the property its title actually claims, and the property MEDIUM-1 was about:

1. **No raw PostgreSQL error escapes.** A new `sqlStateOf()` helper walks the error's `cause` chain looking for a 5-character SQLSTATE and the test asserts it is `null`. This is checked _directly_ rather than inferred from "not one of the typed classes", so a future third typed error cannot silently pass the gate while an untyped one slips through a class list.
2. **The failure is one of the two legitimate typed domain errors**, checked against a named `TYPED_REPLACEMENT_FAILURES` list.
3. The false `"MEDIUM-1 has regressed"` message is gone. The replacements name the actual expectation — a raw-SQLSTATE escape, or an unexpected error type — and the test title is now _"a concurrent routine hard-delete always fails with a TYPED domain error (never a raw PostgreSQL error) and never orphans a link"_.
4. Outcomes are tallied into three counters and `conflicts + linkTargetMissing + clean === TRIAL_COUNT` asserts every trial was classified.

The orphan check, the delete-side assertion and every other probe are unchanged.

**Proof the widened assertion is load-bearing and both branches are real.** A throwaway probe drove the real service against a fresh migrated PostgreSQL 16 database:

_Part 1 — deterministic (delete committed before the ownership `SELECT`):_

```
error class          : WarmupRoutineLinkTargetNotFoundError
raw SQLSTATE escaped : null
OLD assertion (only AssociationConflictError) would PASS: false
NEW assertion (either typed error) passes              : true
```

_Part 2 — 200 racing trials:_

```
clean replacement                        : 0
WarmupRoutineAssociationConflictError    : 193
WarmupRoutineLinkTargetNotFoundError     : 7
RAW PostgreSQL error escaped             : 0   <- required
unexpected error type                    : 0
OLD single-class assertion would have failed 7 of 200 failing trials
```

So the second branch is real at about 3.5 % per trial. With `TRIAL_COUNT = 12` that predicts a per-suite-run false-alarm rate of about 1 − 0.965^12 ≈ **35 %**, consistent with the verification's observed 2 failures in 7 runs. Zero raw driver errors in 200 trials independently re-confirms MEDIUM-1's fix.

**Stability after the fix — repeated runs, each on its own fresh disposable database** (created, migrated `0000 → 0010`, used once, dropped):

```
instrumented runs: total=60   pass=59   assertion-failures=0   vitest-worker-pool crashes=1
```

Plus 12 earlier un-instrumented runs (11 pass, 1 crash of the same signature) — **72 runs, 0 assertion failures**.

**The one non-pass, reported honestly.** It is not an assertion failure and not a defect in the code or in the suite's logic:

```
=== vitest exit=1 ===
 RUN  v3.2.7
⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
Error: Channel closed
 ❯ target.send node:internal/child_process:777:16
 ❯ ProcessWorker.send node_modules/tinypool/dist/index.js:140:41
Serialized Error: { code: 'ERR_IPC_CHANNEL_CLOSED' }
```

Vitest's worker pool (`tinypool`) crashed **before any test executed** — there is no test summary, no assertion, and no possibility of the misleading "MEDIUM-1 has regressed" message the verification objected to. It is categorically different from the defect fixed above: it cannot pass while broken, and it cannot tell a maintainer that a closed finding has reopened.

I could **not** attribute it definitively. It did not reproduce in 60 runs of an unrelated DB-free unit file, nor in 20 runs of the pre-existing peer suite `recoveryConcurrency.integration.test.ts`, which has the same harness shape (integration config, forks pool, real `pg` pool with `max: 16`, `pool.end()` in `afterAll`). At about 1.4 % (1 in 72) those sample sizes are too small to exclude it there. Recorded as an observed environment/runner flake, outside this follow-up's stated scope; no config or production change was made for it.

### B.2 Verification §3.3 — correction to §2.4's control table

The last row of the table in **§2.4** reads:

> | carve-out (a) | `server/volume/service.ts` → `db/schema/warmupRoutines.ts` directly | — | **DETECTED** (and tolerated via the barrel alone, asserted both ways) |

**That row is overstated and is corrected here.** What the shipped test in `warmupBoundary.test.ts` actually asserts is that the _helper_ `isSchemaRegistryOnly` returns `true` when the file is reached only through `src/db/schema/*` and `false` once a non-registry parent exists. It does **not** assert that claim 1's own offender check fails, and it would not: claim 1's filter is `isWarmupModule`, which excludes the three table declarations **unconditionally**; `isSchemaRegistryOnly` is only wired into claim 2. With that import really present, the boundary test passes.

Accurate wording for that row:

> | carve-out (a) | `server/volume/service.ts` → `db/schema/warmupRoutines.ts` directly | — | The **helper** `isSchemaRegistryOnly` correctly flips to `false` for a non-registry parent (asserted both ways). Claim 1's offender filter excludes the table declarations unconditionally, so the boundary test itself does **not** fail on this edge. |

This is a **report-accuracy correction, not a behaviour change**, and nothing was altered in the test to accommodate it:

- Net behaviour is unchanged by the remediation — before it, `db/schema/warmup*.ts` were not in the hand-listed directories either, so this edge was equally undetected.
- It matches the pre-existing precedent exactly: `progressionBoundary.test.ts` likewise scopes its offender set to `domain/`, `server/` and `ui/` directories and does not treat `db/schema/bodyweightEntries.ts` as an offender.
- The verification recorded it as LOW with "no action required beyond correcting that one table row", which is what this appendix does.

The other five rows of §2.4's table were re-checked against the verification's own real-file controls and stand as written.

### B.3 Scope, gates and tree state for this follow-up

**Changed (2 files):**

```
 M tests/integration/warmupAssociationConcurrency.integration.test.ts   B.1 (probe 4 + import)
 M docs/reviews/warmup-routines-remediation.md                          this appendix
```

Nothing else. No production source, schema, migration, UI, sync, outbox, progression or volume file was touched; `docs/reviews/warmup-routines-review.md` and `docs/reviews/warmup-routines-remediation-verification.md` were not modified; `docs/reviews/warmup-routines-implementation.md` (including its Appendix A) is unchanged by this follow-up.

**Gates re-run** (no full E2E — this is test/report-only, and no production code changed):

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | **pass**, 0 errors |
| `pnpm typecheck:sw` | **pass**, 0 errors |
| `pnpm lint` | **pass**, 0 errors, 0 warnings |
| `pnpm format:check` | 1 pre-existing CRLF-only failure on `src/server/sync/service.ts` (Appendix A of the implementation report); the changed test file passes |
| `pnpm test:unit` | **549 passed / 549** |
| `pnpm test:integration` (ordinary) | **294 passed + 15 skipped**, 0 failed — the gated suite still skips without `WARMUP_CONCURRENCY_DATABASE_URL` |
| Gated concurrency suite, 72 fresh-database runs | **0 assertion failures**; 6/6 tests per passing run |

**Databases:** every run created its own database, migrated it, and dropped it. `gymapp_branchproof` (the Part 1 / Part 2 probe) was dropped. Left in place: `gymapp` (dev, untouched), `gymapp_wuconc` and `gymapp_wu_rem_e2e` (evidence from the earlier tasks, safe to drop). Production was never contacted; nothing was committed, pushed or deployed.

**READY FOR SECOND TARGETED REMEDIATION VERIFICATION**
