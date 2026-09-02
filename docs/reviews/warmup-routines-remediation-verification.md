# Warm-up Routines v1 — Targeted Remediation Verification

Date: 2026-09-02
Verified tree: `main` @ `f4ee4e1` plus the uncommitted Warm-up Routines v1 working tree, after the remediation.
Inputs: `docs/reviews/warmup-routines-review.md` (the findings), `docs/reviews/warmup-routines-remediation.md` (audited as evidence, not accepted as truth).
Method: every claim was re-established with **my own probes and my own negative controls**, written from the review's findings rather than derived from the shipped remediation suite. All temporary edits were restored byte-identically (§7).

**Verdict: `REMEDIATION INCOMPLETE`** — narrowly, and **not because any of the four verification objectives failed**. All four pass, and no product defect remains. The single blocking item is a defect in a test file the remediation itself added: its delete-race assertion is over-strict, fails **1 run in 6** on a fresh database, and reports the false message *"MEDIUM-1 has regressed"* when it does. §5 has the one-line fix.

---

## 1. Objective results

| # | Objective | Result |
|---|---|---|
| 1 | MEDIUM-1 + LOW-1 closed under genuine multi-connection concurrency | **VERIFIED** — §2 |
| 2 | MEDIUM-2 closed; every warm-up module covered or carved out; my original controls now fail correctly | **VERIFIED** — §3 |
| 3 | LOW-2's dated correction is accurate | **VERIFIED** — §4 |
| 4 | No unrelated product, schema, sync, progression, volume or migration behaviour changed | **VERIFIED** — §6 |
| — | *(new)* the remediation's own gated regression suite | **DEFECTIVE** — §5 |

---

## 2. Objective 1 — MEDIUM-1 and LOW-1 are closed

### 2.1 The change, as read from the tree

`setTemplateWarmupRoutines` now opens its transaction with the ownership read upgraded to a lock — `.for("update", { of: workoutTemplates })` — so the ownership check *is* the serialising statement, and residual `23505`/`23503` map to a typed `WarmupRoutineAssociationConflictError` → HTTP **409 `association_conflict`**. `FOR UPDATE OF workout_templates` locks only the template row, not the joined `programs` row.

### 2.2 My own probes — real PostgreSQL 16, independent connection pools

Written independently of the shipped suite (different fixtures, different trial counts, different assertions), driving the real service on a freshly migrated database:

| Probe | Trials | Result | Review measured (pre-fix) |
|---|---|---|---|
| **P1** replacement / replacement | 30 | **`ok\|ok` 30/30**, error kinds `[]`, persisted always one coherent submitted set | 40/40 one side failed `23505` |
| **P2** replacement / clear, alternating issue order | 30 | `ok\|ok` 30/30, **clearedWins = 15/30**, populatedWins 15/30 | clear won **0/40** |
| **P3** different templates in the **same program** | 20 | **20/20 both apply in full** — the lock is not over-broad, no blocking failure | n/a |
| **P4** replacement / routine hard-delete | 25 | every rejection **typed** (13 × `WarmupRoutineAssociationConflictError`, 12 × `WarmupRoutineLinkTargetNotFoundError`), **0 orphan links** | 15/15 unmapped `23503` |
| **P5** invariants across all trials | — | ≤ 1 default per template, positions unique | — |
| **P6** ownership + rollback under the lock | — | foreign template → `null` with no write; unknown id → `null`; malformed id → `null`; both invalid-input rollbacks left the set byte-identical | — |

No raw SQLSTATE escaped as an error name in any trial.

### 2.3 My own bypass negative control

I removed the lock myself — deleting only the `.for("update", { of: workoutTemplates })` clause, nothing else — and re-ran **my** probes:

```
P1 census (lock OFF): {"ok|err:WarmupRoutineAssociationConflictError -> P@0* COHERENT": 18,
                       "err:WarmupRoutineAssociationConflictError|ok -> Q@0*,R@1 COHERENT": 12}
P1 error kinds:       ["err:WarmupRoutineAssociationConflictError"]      (was [] with the lock)

P2 clearedWins = 0 / 30                                                  (was 15/30 with the lock)
  × P2 ... → LOW-1 regression: a clear never won any trial: expected 0 to be greater than 0
```

Both findings reproduce exactly as the review described them. Two things follow:

- **The lock is load-bearing.** With it, 30/30 concurrent replacements both succeed; without it, 30/30 produce a conflict on one side, and a clear can never win.
- **The SQLSTATE mapping is separately load-bearing.** Even with the lock removed, no raw driver error escaped — the residual `23505` surfaced as the typed conflict. The fix is genuine defence in depth, not one mechanism dressed as two.

`src/server/warmupRoutines/service.ts` was then restored and verified byte-identical (`720f6483…963`), and my probes re-run: **6/6 pass, error kinds `[]`, clearedWins 14/30**.

### 2.4 Deterministic mechanism proof

Replaying the remediated statement order over two raw connections:

```
### B replaces {R2}   (lock ON)   after 300ms, B's anchor read completed? false   <- B is blocked
                                  B DELETE removed 1 row(s)                       <- B sees A's committed rows
### B clears (LOW-1)  (lock ON)   after 300ms, B's anchor read completed? false
                                  FINAL: (empty)                                  <- the clear really cleared
### B replaces {R2}   (lock OFF)  after 300ms, B's anchor read completed? true    <- no serialisation
```

The lock demonstrably blocks the second transaction at its anchor read, which is exactly why its later `DELETE` takes a post-commit snapshot and sees the winner's rows. (A second scratch script that tried to force the lock-OFF LOW-1 interleaving deadlocked *my own harness* — both sides racing the same row with no ordering — so the service-layer census in §2.2/§2.3 is the evidence for that direction. No stuck backends were left; verified `pg_stat_activity` empty afterwards.)

### 2.5 Real HTTP, production build, disposable PostgreSQL 16

Repeating the review's own measurements at the same layer:

| Probe | Trials | Result | Review measured |
|---|---|---|---|
| replacement / replacement | 16 | `{"200\|200": 16}`, persisted always one coherent set, non-2xx bodies `[]` | 8/8 `200\|500` |
| replacement / clear | 16 | `{"200\|200": 16}`, **clearedWins 8/16** | clear won 0/40 |
| replacement / routine hard-delete | 20 | `{"409/204": 20}`, body `{"error":"association_conflict"}` | 15/15 unmapped → **500** |
| different templates, same program | 12 | `{"200\|200": 12}` | n/a |

**No 5xx in any probe.** The production server log contained **zero** driver errors — the review's log was full of `duplicate key value violates unique constraint "uq_template_warmup_routine_position" … code: '23505'`.

**MEDIUM-1 and LOW-1 are closed.**

---

## 3. Objective 2 — MEDIUM-2 is closed

### 3.1 My original negative controls, repeated as real file edits

Not the shipped in-process synthetic edges — the same real-file method the review used. Each import was written into the real file, `warmupBoundary.test.ts` was run, and the file was restored:

| Control | Edge written into the real file | Review (pre-fix) | Now |
|---|---|---|---|
| **A** | `server/warmupRoutines/service.ts` → `@/domain/sync/schema` | FAIL ✓ | **FAIL** ✓ |
| **B** | `domain/volume/aggregate.ts` → `@/domain/warmup/session` | FAIL ✓ | **FAIL** ✓ |
| **C** | `app/api/templates/[id]/warmup-routines/route.ts` → `@/domain/sync/schema` | **PASS ✗ false negative** | **FAIL** ✓ **closed** |
| **D** | `app/(app)/warmup-routines/new/page.tsx` → `@/domain/sync/schema` | **PASS ✗ false negative** | **FAIL** ✓ **closed** |
| **D′** | `app/(app)/warmup-routines/[id]/page.tsx` → `@/sync/outbox` | not controlled | **FAIL** ✓ |
| **E** | `ui/workout/WarmupCard.tsx` → `@/sync/outbox` | PASS (documented carve-out) | **PASS** — carve-out (b), unchanged and still documented |

Baseline (unedited): **17/17 pass**.

C and D fail for the right reason, with a trace rooted at the previously-invisible file:

```
A warm-up module reaches engine/sync code:
app\api\templates\[id]\warmup-routines\route.ts -> domain\sync\schema.ts
app\api\templates\[id]\warmup-routines\route.ts -> domain\sync\schema.ts -> domain\progression\registry.ts
```

### 3.2 Inventory completeness, recomputed independently

My own filesystem scan finds **16** warm-up files under `src/`; the test's discovered `WARMUP_INVENTORY` is the same 16, including all three the review found uncovered. Every one is either a claim-2 root or carve-out (b), and either a claim-1 offender target or carve-out (a) — asserted by two standing guard tests plus one that names the three previously-omitted files explicitly, so a regression is unmistakable in the diff.

### 3.3 One overstated claim in the remediation report

Remediation §2.4 lists a control row: *`server/volume/service.ts` → `db/schema/warmupRoutines.ts` directly → **DETECTED***. My real-file control shows the boundary test **passes** with exactly that import in place.

The reason is that claim 1's offender filter is `isWarmupModule`, which excludes the three table declarations unconditionally; `isSchemaRegistryOnly` is only wired into claim 2. The shipped control at line 425 asserts that the *helper* returns `false` for a non-registry parent — true, and worth having — but it never asserts the claim-1 test itself fails.

This is a **report-accuracy issue, not a regression**: before the remediation, `db/schema/warmup*.ts` were not in `isWarmupModule`'s directories either, so the net behaviour is unchanged, and it matches the pre-existing precedent exactly — `progressionBoundary.test.ts` likewise scopes its offender set to `domain/`, `server/` and `ui/` directories and does not treat `db/schema/bodyweightEntries.ts` as an offender. Recorded as LOW; no action required beyond correcting that one table row.

**MEDIUM-2 is closed.**

---

## 4. Objective 3 — LOW-2's correction is accurate

Every factual claim in Appendix A was re-derived from scratch:

| Appendix A claim | My measurement |
|---|---|
| worktree sha256 `fa294970…` | `fa2949707bc3d615b9a35ed78a22443416fed5e0b5c555a95ad79061bfb2b3a0` ✓ |
| CR-stripped sha256 `f9d9ebe6…` == HEAD blob content | both `f9d9ebe64e94d6cf05dbd9d72d45a9324379133feef2e7eb0e8eaa5fae47f734` ✓ |
| git blob object id `d37a69b5…` | `d37a69b5c8fa9069af51cd0a25e583a9749ca927` ✓ |
| `git diff HEAD` empty | 0 lines ✓ |
| CR=1163 LF=1163 CRLF=1163 | exact ✓ |
| the only tracked `.ts`/`.tsx` file containing CR | `src/server/sync/service.ts`, and only it ✓ |
| `core.autocrlf=true`, `.gitattributes` absent | ✓ |
| an in-repo CR-stripped probe passes prettier | `All matched files use Prettier code style!`, exit 0 — and the CRLF worktree file still fails ✓ |
| prettier finds no config outside the repo | inside → `.prettierrc.json`; outside → `Can not find configure file` ✓ |

Both compounding mistakes the appendix names are real and reproducible. §12's original text is unaltered (line 397 is verbatim as the review quoted it), and the correction is appended below it rather than rewriting history — which is the right shape for a dated correction.

**LOW-2 is accurately corrected.**

---

## 5. New finding — the remediation's own gated suite is defective

**MEDIUM (test-only).** `tests/integration/warmupAssociationConcurrency.integration.test.ts:376`:

```ts
expect(
  replaceResult.reason,
  `trial ${trial}: the replacement failed with an UNTYPED error — MEDIUM-1 has regressed`,
).toBeInstanceOf(WarmupRoutineAssociationConflictError);
```

The delete race has **two** correct typed outcomes, not one:

| Interleaving | Service raises | Route maps to |
|---|---|---|
| the routine delete commits **before** the in-transaction ownership `SELECT` | `WarmupRoutineLinkTargetNotFoundError` | **400** `routine_not_found` |
| it commits **after** the `SELECT` but before the `INSERT` (FK check fails) | `WarmupRoutineAssociationConflictError` | **409** `association_conflict` |

Both are typed, both non-5xx, both correct — a client that asked to link a routine which no longer exists deserves `routine_not_found`. My own P4 accepted both and passed **25/25 with zero orphans**, observing 12 of the first and 13 of the second.

The shipped assertion accepts only the second, so it fails whenever the delete happens to land first:

```
run 1: pass   run 2: pass   run 3: FAIL   run 4: pass   run 5: pass   run 6: pass
=== shipped gated suite: 5 passed / 1 failed of 6 fresh-database runs ===
```

(2 failures in 7 total runs, counting the first one that surfaced it.) The failure text is:

```
AssertionError: trial 5: the replacement failed with an UNTYPED error — MEDIUM-1 has regressed:
  expected WarmupRoutineLinkTargetNotFoundError: One… to be an instance of
  WarmupRoutineAssociationConflictError
```

Three consequences:

1. **The message is false.** The error *is* typed and MEDIUM-1 has *not* regressed. A future maintainer hitting this would be told a closed finding has reopened.
2. **The remediation report's load-bearing evidence does not reproduce.** §1.4 and §5.2 both state "6 passed / 6"; on a fresh database that holds about five times in six.
3. **A guard that cries wolf gets ignored.** This is the standing regression protection for MEDIUM-1; at a 1-in-6 false-alarm rate it will be muted rather than trusted.

Mitigating: the suite is `describe.skipIf`-gated on `WARMUP_CONCURRENCY_DATABASE_URL` and skips in an ordinary `pnpm test:integration` run (confirmed — `↓ … (6 tests | 6 skipped)`), so it cannot destabilise the normal gates. `TRIAL_COUNT = 12`.

**Fix:** widen the assertion to accept either typed error and reword the message — e.g. assert the rejection is one of `WarmupRoutineAssociationConflictError | WarmupRoutineLinkTargetNotFoundError` and that it is *not* a raw driver error, which is what the probe's own header comment already says it means to check ("never an untyped driver error"). The implementation is correct as it stands; only the test needs changing.

---

## 6. Objective 4 — nothing unrelated changed

### 6.1 Complete file-level delta since the review

A full sha256 sweep against the snapshot taken at the end of the review gives the **entire** change set:

```
ADDED    docs/reviews/warmup-routines-remediation.md          (the remediation report)
ADDED    docs/reviews/warmup-routines-review.md               (my review — written after that snapshot)
ADDED    tests/integration/warmupAssociationConcurrency.integration.test.ts
MODIFIED docs/reviews/warmup-routines-implementation.md       (Appendix A only)
MODIFIED src/app/api/templates/[id]/warmup-routines/route.ts  (409 mapping)
MODIFIED src/server/warmupRoutines/service.ts                 (anchor lock + typed conflict)
MODIFIED tests/unit/warmupBoundary.test.ts                    (discovered inventory)
MODIFIED public/sw.js, tsconfig.tsbuildinfo                   (gitignored build artifacts)
```

Nothing else. No schema file, no migration, no sync/outbox/flush file, no progression or volume file, no UI file, no backlog file. This matches the remediation report's §6 claim of five changed files exactly, and independently confirms the "no product behaviour change" claim: the only UI-visible difference is that a previously-500 concurrent write is now a 200 or a mapped 409, and `TemplateWarmupRoutinesSection` routes a 409 to its existing generic retryable message.

### 6.2 Gated invariants

- `git diff HEAD` **empty** for `src/domain/sync/schema.ts`, `src/server/sync/service.ts`, `src/domain/sync/payloadBuilders.ts`, `src/sync/outbox.ts`, `src/sync/flush.ts`, all of `src/domain/progression/`, all of `src/domain/volume/`.
- `SYNC_ENTITIES` still the same seven entries.
- Migrations `0000`–`0009` byte-identical to `HEAD`; `0010` unchanged (`28133f0d…aa`); **no `0011`**; 11 `.sql` files total.
- `pnpm db:generate` against a freshly migrated database: **"No schema changes, nothing to migrate"**, no file created.
- `docs/reviews/warmup-routines-review.md` unmodified — its `READY FOR REMEDIATION` verdict stands as written.

### 6.3 Gates, re-run by me

| Gate | Result |
|---|---|
| `pnpm lint` | **pass**, 0 errors, 0 warnings |
| `pnpm typecheck` | **pass**, 0 errors |
| `pnpm typecheck:sw` | **pass**, 0 errors |
| `pnpm test:unit` | **42 files, 549 passed / 549** (was 540; +9 from the boundary test's 8 → 17) |
| `pnpm test:integration` | **21 passed + 4 skipped files; 294 passed + 15 skipped / 309**, 0 failed — the new gated file skips exactly like its three peers |
| `pnpm test:e2e` (full, fresh disposable PG16 + production build) | **90 passed / 90**, 0 failed (1.9 min) |
| `pnpm format:check` | **1 pre-existing failure**, `src/server/sync/service.ts`, CRLF-only (§4) |
| Shipped gated concurrency suite | **5 of 6 fresh-database runs pass** — §5 |

The E2E run used a database created, migrated and bootstrapped from scratch in the documented order (`db:seed` → `smoke.spec.ts` → `db:seed` → `tests/e2e/seed.ts`) against a production build. All 22 warm-up specs passed inside it, including the cold-offline and legacy-cached-bundle cases.

---

## 7. Cleanup and final working-tree state

**Temporary artifacts, all removed:** `tests/integration/zzRvWarmupConc.integration.test.ts`, `tests/e2e/zzRvWarmupHttp.spec.ts`, `.rv-scratch/` (backups, two raw-connection probe scripts, one in-repo prettier probe), `test-results/`, `playwright-report/`.

**Negative-control edits, all restored byte-identically (sha256 verified):**

| File | sha256 before and after |
|---|---|
| `src/server/warmupRoutines/service.ts` (lock bypass) | `720f6483ec2619b2d7a8252eea4767d6ec08441e5f3faa8988da930a4352c963` |
| `src/app/api/templates/[id]/warmup-routines/route.ts` | `fdeb5cc46e1046d52f488e669f665bfaac9cd2777a856574cde082d4a10f3ab2` |
| `src/app/(app)/warmup-routines/new/page.tsx` | `1d93be2ff3a8b33b0aa98370e411228f570a78809bd424f6acb2333f120b2469` |
| `src/app/(app)/warmup-routines/[id]/page.tsx` | `0128a984b403ddd74da8d1f42b7a2003d32c12a5825079d8c55ea5fff664778b` |
| `src/ui/workout/WarmupCard.tsx` | `6c7e22aca927e07df76b7e86a29c83129ecbcf266b4cb5d14d6dbfb9fc821554` |
| `src/domain/volume/aggregate.ts` | `fdceba03e895eefe9b72c5260b85004b9d85ffa9a4af27a65ba660e5caf54eae` |
| `src/domain/progression/engine.ts` | `ed263eab372762e30e1d2207c09c044385b4ed15262023d510ea9c60c3923764` |
| `src/server/volume/service.ts` | `66991decbf93421a7614ec3fc8f5c822fc4216bf483323f176cc41f97f364c2a` |
| `tests/unit/warmupBoundary.test.ts` | `3d277cb320be177c8f8a51d5e24b9f19543bd28172e34ef7d85d292b59ed4bf2` |

**Databases:** `rv_conc`, `rv_http`, `rv_e2e`, `rv_shipped` and `rv_sh1`–`rv_sh6` were created on the local Docker PostgreSQL 16 and have all been **dropped**. Left in place and untouched by me: `gymapp` (dev — warm-up row counts `0 / 0 / 0` before and after), `gymapp_warmup_e2e` (implementation task), `gymapp_wuconc` and `gymapp_wu_rem_e2e` (remediation task; both disposable and safe to drop). No leftover backends: `pg_stat_activity` for my databases was verified empty after the harness deadlock in §2.4. **Production was never contacted.** Nothing was committed, pushed or deployed; both production servers I started were stopped.

**Final tree:** a full sha256 sweep of all **523** files (excluding `node_modules`, `.git`, `.next`) is **byte-identical to the state at the start of this verification** — including `public/sw.js` and `tsconfig.tsbuildinfo`, since I reused the existing production build rather than rebuilding. `git status --porcelain` is unchanged apart from this new file, and all pre-existing unrelated working-tree changes (`CLAUDE.md`, `HANDOFF*`, `docs/input/product-ideas.md`, `gpt-*.md`, `.claude/skills/`) are preserved exactly.

---

## 8. Verdict

**`REMEDIATION INCOMPLETE`**

All four verification objectives are independently satisfied, and I want that stated without hedging: **MEDIUM-1, LOW-1 and MEDIUM-2 are genuinely closed at the root, LOW-2 is accurately corrected, and nothing unrelated moved.** I proved each with my own probes and my own negative controls — bypassing the anchor lock reproduced both concurrency findings exactly and restoring it removed them again; the review's original real-file boundary controls C and D now fail where they previously passed. Over real HTTP against a production build, the review's `200|500`, silently-discarded-clear and unmapped-`23503`-500 measurements are all gone, with zero driver errors in the server log.

What blocks a clean pass is narrower and entirely in test code: the regression suite the remediation added to protect MEDIUM-1 fails **1 run in 6** on a correct implementation, because it accepts only one of the delete race's two legitimate typed outcomes — and when it fails it announces *"MEDIUM-1 has regressed"*, which is false. A guard that misreports a non-regression as a regression at that rate is worse than the coverage it adds, and the remediation report's "6 passed / 6" evidence for it does not reproduce. The fix is one assertion (§5).

**No product defect remains, and nothing in §5 affects phone behaviour**, so real-device acceptance — still unrun, per the review's §8 list — can proceed in parallel with that one-line change at the owner's discretion.
