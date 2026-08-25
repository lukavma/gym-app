# Phase 6 — Targeted Remediation Verification: M-1, M-2, M-3

Verifier: the same reviewer that produced `docs/reviews/phase-6-review.md`. Date: 2026-08-25.
Scope: **only** M-1, M-2 and M-3 from that review. The eleven LOW findings were neither reopened nor re-examined.

Constraints honoured: verification only — no fix implemented, no existing implementation file, test, architecture document or report modified in the final tree. `docs/input/product-ideas.md` untouched. No production access, no shared development data written, nothing committed, pushed, deployed, reset or cleaned. One disposable PostgreSQL 16 database (`gymapp_p6verify`) was created, migrated from empty, used for every probe, and dropped. `git status --porcelain` before and after is byte-identical apart from this file.

The remediation report's claims were treated as claims. Every verdict below rests on a probe I ran.

---

## 1. Verdicts at a glance

| Finding | Verdict |
|---|---|
| **M-1** — implementation report does not describe the shipped tree | **VERIFIED — resolved** |
| **M-2** — `volume-model.md` §5 rule 6 uncorrected | **VERIFIED — resolved** |
| **M-3** — concurrency test cannot detect the race it names | **VERIFIED — resolved**, and the new test is stronger than the report claims |

No new finding at MEDIUM or above. Two minor observations are recorded in §6; neither affects any required property and neither is a regression.

**Final verdict: VERIFIED — READY FOR DEVICE ACCEPTANCE.**

---

## 2. Establishing what actually changed

Before assessing any claim, I enumerated every file whose mtime moved after my review was written (2026-08-24 20:32:09):

```
$ find src tests docs -newermt "2026-08-24 20:32:09" -type f -printf "%T+ %p\n" | sort
2026-08-24+23:41:46  docs/architecture/volume-model.md
2026-08-24+23:42:28  docs/input/product-ideas.md          <- unrelated backlog note, out of scope
2026-08-24+23:43:19  tests/integration/volumeLandmarks.integration.test.ts
2026-08-24+23:50:57  tests/integration/volumeLandmarksConcurrency.integration.test.ts
2026-08-24+23:53:40  docs/reviews/phase-6-implementation.md
2026-08-24+23:55:13  docs/reviews/phase-6-remediation.md
2026-08-25+02:05:34  src/server/volume/service.ts          <- MY OWN restore, see §5.5
```

This matches the remediation report's declared file list exactly. **No `src/` file was changed by the remediation.**

`src/server/volume/service.ts` carried a bumped mtime (23:47:11) when I started, consistent with the report's account of a temporary negative-control edit followed by restoration. I proved the content is unchanged rather than trusting that account: I reconstructed the exact file I reviewed yesterday from my own archived lock-removed copy (substituting the one line back) and diffed it.

```
$ diff <reconstructed-from-my-own-review-artifacts> src/server/volume/service.ts
$ md5sum src/server/volume/service.ts
263b05d8818f3d02a668db7531547e89
```

**Byte-identical to the version I reviewed.** The advisory lock, `setupAccount` attachment and `MuscleRow` rendering are exactly as reviewed; the remediation changed documentation and tests only, as claimed.

`docs/reviews/phase-6-review.md` was not modified: mtime still 2026-08-24 20:32:08 (the moment I wrote it), size 44,590 bytes, final line still `**READY FOR REMEDIATION**`.

---

## 3. M-1 — implementation report brought up to date

**Verdict: VERIFIED — resolved.**

The report now carries a dated `## Post-review remediation (2026-08-24)` section (line 232) plus a superseding notice at line 5 that explicitly demotes the original body to history. I checked every load-bearing factual claim in it against the source:

| Addendum claim | Verification |
|---|---|
| Advisory lock at `src/server/volume/service.ts:271-276` | ✔ `271: return db.transaction(...)`, `275: const [lockKeyA, lockKeyB] = userVolumeLockKeys(userId)`, `276: await tx.execute(sql\`select pg_advisory_xact_lock(...)\`)` |
| Lock is the **first** statement in the transaction; resolution happens **after** it | ✔ line 276 precedes `resolveActivePreset(tx, userId)` at line 278 — and this ordering is exactly what makes the second caller observe the first caller's committed copy |
| Key derivation: hyphens stripped, **final 16 hex chars (64 bits)** split into two 32-bit signed ints | ✔ `service.ts:136-142` uses `hex.slice(16,24)` and `hex.slice(24,32)` of a 32-char hex string — the final 64 bits, `\| 0` folded |
| Two-int namespace is separate from `setupAccount`'s bigint `SETUP_LOCK_KEY` | ✔ correct: `pg_advisory_xact_lock(int,int)` and `pg_advisory_xact_lock(bigint)` occupy distinct namespaces |
| Load-bearing, not defensive; failure mode is read-then-write across two statements | ✔ independently reproduced in §5.3 below — 8 orphan presets, 3/3 runs |
| RP General attachment at `src/server/auth/service.ts:56-77`, three lifecycle cases | ✔ line range correct; all three cases match the code and my own §5.3 lifecycle probing from the original review |
| `MuscleRow.tsx` lines ~34-38 (note dedup via `Set`) and ~49-60 (`Coaching heuristic ·` prefix + note lines) | ✔ exact: 34-38 is the `new Set(...)` note dedup, 51 is the `Coaching heuristic · {summary}` span, 52-56 renders the notes |
| "all 65 rendered bands, none unlabelled, 9,357px page" | ✔ these are my own measured figures, correctly attributed |
| Associated test coverage (`auth.integration.test.ts` case, `volume.spec.ts` assertions) | ✔ both present in the tree |
| Files-changed list updated | ✔ new `### Files changed by this remediation pass` section (line 270) |
| Judgment calls updated | ✔ new item 7 (negative control deliberately not shipped) at line 274 |
| Chronology 17:19–17:21, original body preserved as history | ✔ matches the mtime evidence I recorded in my own review |

**Test counts.** The addendum states 408 unit; 208 passed / 5 skipped integration (16 passed files, 2 skipped, 18 total); 1/1 for the opt-in run. Measured on this tree:

```
pnpm test:unit            ->  Test Files  32 passed (32)   Tests  408 passed (408)
pnpm test:integration     ->  Test Files  16 passed | 2 skipped (18)
                              Tests      208 passed | 5 skipped (213)
                              ↓ tests/integration/volumeLandmarksConcurrency.integration.test.ts (1 test | 1 skipped)
                              ↓ tests/integration/reconcileContributionsConcurrency.integration.test.ts (4 tests | 4 skipped)
```

Exact match, including the 4→5 skip movement and its attribution. The stale "206/206, 4 skipped" figure remains only inside the preserved 14:38 history block, which the superseding notice explicitly scopes as history.

The one wording slip I found is cosmetic: the addendum's "No file under `src/` other than the test file changed" is loose — the new test lives under `tests/`, not `src/`. The substance (no `src/` file changed) is correct and independently confirmed in §2.

---

## 4. M-2 — `volume-model.md` §5 rule 6

**Verdict: VERIFIED — resolved.**

`docs/architecture/volume-model.md:111`, current text:

> 6. …Copy may never claim per-leaf landmarks, per-leaf "optimal" volumes, or present the `Back = Lats + Upper Back` relation as physiology; the Unclassified Back term is shown whenever it is non-zero so the *effective* Back total is always explained by its parts (effective Back = effective Lats + effective Upper Back + Unclassified Back — architecture-review M-3). **Raw Back is a separately deduplicated per-set count and is not additive over raw Lats + raw Upper Back; the identity above holds for the effective series only.**

Both halves of what M-2 required are present: the identity is qualified as effective-only, **and** raw Back is separately described as deduplicated and non-additive. The previously unqualified clause "so the Back total is always explained by its parts" no longer appears anywhere in `docs/architecture/` without its `effective` qualifier (grep-verified).

**Cross-check against the other four corrected passages and the UI.** All five now carry the same qualifier, cite `architecture-review M-3`, and state the raw-series exception:

| Passage | Effective-only qualifier | Raw dedup / non-additive |
|---|---|---|
| `volume-model.md:48` (§2) | "for the **effective series only**" | "raw Back is not additive over its members and may be lower than raw Lats + raw Upper Back" |
| `volume-model.md:111` (§5 rule 6) — **new** | "the *effective* Back total" / "holds for the effective series only" | "separately deduplicated per-set count and is not additive over raw Lats + raw Upper Back" |
| `ADR-010:40` ("Aggregation") | "for the *effective* series only" | "separately deduplicated per-set count … not additive … may be lower" |
| `domain-model.md:270` (§8) | "renders the reconciliation for the *effective* series" | "raw Back is the separately deduplicated count above and is not additive" |
| `implementation-plan.md:189` (Phase 6) | "reconciliation line for the effective series" | "raw Back is a separately deduplicated per-set count, not additive" |

**UI copy** (`src/ui/volume/VolumeScreen.tsx:102-108`, unchanged — md5 `8f9f9eec…`) still reads:

> Back {e} = Lats {e} + Upper Back {e} [+ Unclassified Back {n}] **(effective sets)**. Raw Back ({raw}) is a deduplicated per-set count and may be lower than the sum of raw Lats + Upper Back.

Consistent with all five documents. No aggregation behaviour changed; nothing user-facing changed. §5 rule 6's phrasing omits the "may be lower" illustration the other four carry, but "not additive" is the stronger and correct general statement, so this is a stylistic difference, not a gap.

---

## 5. M-3 — the new real-PostgreSQL concurrency test

**Verdict: VERIFIED — resolved.** All eight required properties confirmed, several by direct measurement rather than code reading.

Setup for everything in this section:

```
psql -c "CREATE DATABASE gymapp_p6verify OWNER gymapp;"
DATABASE_URL=...gymapp_p6verify pnpm db:migrate      # [✓] migrations applied successfully (from empty)
```

### 5.1 Gating, isolation and skip behaviour

| Requirement | Evidence |
|---|---|
| Uses its own `VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL` | ✔ `volumeLandmarksConcurrency.integration.test.ts:29`, `describe.skipIf(!CONCURRENCY_DATABASE_URL)` at line 52. `DATABASE_URL` is never read by this file. |
| Remains skipped in the ordinary suite | ✔ `pnpm test:integration` with the variable unset reports `↓ tests/integration/volumeLandmarksConcurrency.integration.test.ts (1 test | 1 skipped)` and the suite is green (208 passed / 5 skipped) |
| Requires a dedicated disposable database | ✔ **guard proven to fire**, not just read. I inserted one unrelated user into the disposable database and re-ran:<br>`Error: volumeLandmarksConcurrency expects VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL to point at an empty-of-users database, found 1. Run this file against a dedicated disposable database, not a shared dev database.`<br>exit 1, test skipped, nothing destructive attempted. A second guard covers pre-existing non-builtin presets. |

### 5.2 Genuinely separate sessions and genuinely overlapping edits

This is the property the whole finding turns on, so I measured it live rather than inferring it from `Pool({max: 16})`. While the test ran, a **separate** psql session sampled `pg_locks` every ~4 ms (`pg_locks` reads live lock-manager state; note `pg_stat_activity` is stats-cached inside a single transaction and is useless for this):

```
NOTICE:  MAX distinct backends holding/waiting on an advisory lock = 8
NOTICE:  peak snapshot: 53556:held 53557:WAITING 53558:WAITING 53559:WAITING
                        53560:WAITING 53561:WAITING 53562:WAITING 53563:WAITING
NOTICE:  MAX granted=1 MAX waiting=7
```

Eight **distinct PostgreSQL backend PIDs** were simultaneously registered against the same advisory lock — one holding it, seven queued behind it. A single session cannot both hold and wait on the same advisory lock, so this is direct proof of:

1. **eight genuinely separate PostgreSQL sessions** — not one connection multiplexing;
2. **genuinely overlapping first edits** — all eight requests were in flight at the same instant, contending, not "concurrent-looking serialized promises";
3. **the advisory lock is actually engaged** and is what orders them.

Contrast with the PGlite path I measured during the original review: one `pg_backend_pid()` (42), one `pg_stat_activity` row, zero contention. The gap M-3 identified is now genuinely closed.

An independent run of the same instrumentation reported `MAX advisory locks held=8 | MAX advisory waiters=7`, reproducing the result.

### 5.3 Negative control — repeated independently, not accepted from the report

I did **not** rely on the remediation report's single failing run. I repeated my own original approach: back up the production service, bypass **only** the lock acquisition (line 276), leave every other line — including preset resolution, the duplicate-insert path and the repointing logic — untouched, then run the **shipped** test file unmodified.

```
$ md5sum src/server/volume/service.ts   # backed up first
263b05d8818f3d02a668db7531547e89
$ sed -i '276s|.*|    // NEGATIVE CONTROL — lock bypassed …|' src/server/volume/service.ts
$ md5sum src/server/volume/service.ts
675fccb0d5328ce5ebad1253e1367d47
```

Three runs, all against the freshly migrated disposable database:

```
=== NEGATIVE CONTROL run 1: exit=1 ===
AssertionError: expected [ { …(11) }, { …(11) }, …(6) ] to have a length of 1 but got 8
 Test Files  1 failed (1)      Tests  1 failed (1)
=== NEGATIVE CONTROL run 2: exit=1 ===  (identical assertion, got 8)
=== NEGATIVE CONTROL run 3: exit=1 ===  (identical assertion, got 8)
```

**3/3 failures, deterministic, on exactly the assertion the finding is about** — `ownedPresets` had length **8**, i.e. eight orphan `volume_presets` rows where one is correct. This reproduces the defect class the remediation report described (it observed 7 orphans in its single run) and matches my original review's independently measured 8-orphan result exactly. The test's power to fail is proven, not assumed.

Cleanup held on the failure path too: after each failing run the database was back to `0 users, 1 presets (0 user-owned)`.

### 5.4 Assertion coverage

Every property the task requires is asserted in the shipped file, and I confirmed each is real rather than nominal:

| Required property | Assertion |
|---|---|
| all concurrent edits resolve | `expect(rejected).toHaveLength(0)` (line 152) |
| **one user-owned copy, no orphan presets** | `expect(ownedPresets).toHaveLength(1)` (159) — the assertion the negative control breaks — plus `not.toBe(RP_GENERAL_PRESET_ID)`, `isBuiltin === false`, `classification === "user_defined"` (161-163) |
| **no lost edits** | copy carries all 52 builtin rows (175) **and** every one of the 8 distinct `(muscleGroup, key)` edits with its exact `valueMin`, plus `valueMax`/`openEnded` where submitted (176-183) |
| **builtin immutability** | deep equality on the builtin preset row **and** on all 52 of its landmark rows, before vs. after (192, 197) — not a row count |
| **correct slot repointing** | `refreshedUser.defaultVolumePresetId === copyPresetId` (167) |
| **correct next-read state** | `getWeeklyVolumeReport(...)` returns `activePreset.id === copyPresetId` and exposes every one of the 8 edits (200-211) |

The eight edits deliberately target eight *distinct* rows, so "no lost edits" is a per-value assertion rather than eight writers racing on one cell — a race that dropped a writer's preset would also drop that writer's value. All eight target `(muscleGroup, key)` pairs that already exist in the RP seed, which is why `toHaveLength(52)` is the correct expectation.

### 5.5 Repeatability, cleanup, and restoration

Positive runs with the lock present, all against the freshly migrated disposable database:

```
run 1: exit=0   Test Files 1 passed (1)   Tests 1 passed (1)
run 2: exit=0
run 3: exit=0
run 4: exit=0
run 5: exit=0
```

plus the two instrumented runs in §5.2 and one post-restoration run — **8 passing runs, 0 failures**.

`afterAll` cleanup verified by live inspection after every run:

```
 users | presets | builtin | user_owned | landmarks
-------+---------+---------+------------+-----------
     0 |       1 |       1 |          0 |        52
```

Zero users, exactly one preset — the untouched builtin — and its 52 landmark rows. No orphan preset, no leftover test user, and the builtin is never deleted (the delete is scoped to `volumePresets.userId = testUserId`). This held identically after the three *failing* negative-control runs, and a `beforeAll` guard failure performed no destructive action and did not hang.

**Restoration and checksum:**

```
$ cp <pristine-backup> src/server/volume/service.ts
$ md5sum src/server/volume/service.ts
263b05d8818f3d02a668db7531547e89        <- identical to the pre-bypass checksum
$ cmp <pristine-backup> src/server/volume/service.ts   ->  BYTE-IDENTICAL
$ sed -n '275,276p' src/server/volume/service.ts
    const [lockKeyA, lockKeyB] = userVolumeLockKeys(userId);
    await tx.execute(sql`select pg_advisory_xact_lock(${lockKeyA}, ${lockKeyB})`);
```

Post-restoration: the concurrency test passes again (exit 0), and `pnpm typecheck`, `pnpm lint`, `pnpm format:check` are all clean.

### 5.6 The old PGlite test is now honestly described

**Verified.** `tests/integration/volumeLandmarks.integration.test.ts:141` is now:

> `"converges sequential first-edit calls on one copy (not a concurrency/lock proof — see volumeLandmarksConcurrency.integration.test.ts)"`

with a comment (lines 129-140) stating plainly that PGlite is a single in-process backend, that `db.transaction()` calls against it run strictly in sequence, that **this test still passes with the lock removed**, and that the real coverage lives in the new file behind its own opt-in variable. What it still legitimately claims — convergence of sequential first-edit calls on one copy — is exactly what it proves. The concurrency claim its old name made is gone; the assertions are unchanged.

```
$ pnpm exec vitest run --config vitest.integration.config.ts tests/integration/volumeLandmarks.integration.test.ts
 ✓ upsertVolumeLandmark (PGlite integration) > converges sequential first-edit calls on one copy (…) 503ms
 Test Files  1 passed (1)      Tests  10 passed (10)
```

---

## 6. Observations (not findings, no action required)

**O-1 — the dedicated-database guard runs after a write, not before it.** `beforeAll` calls `seedMuscleGroups` and `seedVolumePresets` (lines 60-63) *before* the empty-of-users guard (69-86). I measured the consequence: with one unrelated user present, the guard correctly aborted the run — but that user's `default_volume_preset_id` had already been set by `seedVolumePresets`' null-only `UPDATE`. So the guard protects the test's *assertions*, not the target database's *data*. The residual is benign — the write is idempotent and identical to what deploy-time `db:seed` does anyway, nothing is deleted, and the precedent file (`reconcileContributionsConcurrency`) seeds before its guard too. Worth knowing; not worth changing now, and outside this verification's scope to fix.

**O-2 — cosmetic wording.** The addendum's "No file under `src/` other than the test file changed" is imprecise (the test file is under `tests/`). The substantive claim is correct and independently confirmed.

---

## 7. Full command results, this tree

| Command | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | `All matched files use Prettier code style!` |
| `pnpm test:unit` | **408 passed** (32 files) |
| `pnpm test:integration` (opt-in vars unset) | **208 passed, 5 skipped** (16 passed files, 2 skipped, 18 total) |
| opt-in `VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL=…` concurrency test | **1/1 passed × 8 runs**, 0 failures |
| same test with the advisory lock bypassed (negative control) | **1/1 failed × 3 runs**, `expected … length of 1 but got 8` |
| `pnpm exec vitest run … volumeLandmarks.integration.test.ts` | **10/10 passed** |
| `pnpm build` | `✓ Compiled successfully`; `/volume`, `/api/volume`, `/api/volume/landmarks` all present |

Full Playwright was not rerun. I confirmed the premise rather than assuming it: no file under `src/` changed in this remediation (§2), and `VolumeScreen.tsx` / `MuscleRow.tsx` are byte-for-byte the files whose rendered output I verified in the original review. There is no browser-observable production change in this pass.

---

## 8. Cleanup

- Disposable database `gymapp_p6verify` **dropped**; `SELECT datname FROM pg_database WHERE datname LIKE 'gymapp%'` returns `gymapp` only.
- The shared local development database `gymapp` was never written to by this verification. No production access.
- The negative-control edit to `src/server/volume/service.ts` was restored from a pristine backup and confirmed byte-identical by both `cmp` and md5 (`263b05d8818f3d02a668db7531547e89`).
- All scratch scripts and logs removed; no `test-results/`, `playwright-report/` or scratch directory remains in the repository.
- `git status --porcelain` is **identical** to the baseline recorded at the start of this session, apart from this new file.

---

## 9. Final verdict

All three MEDIUM findings are genuinely closed, and I established each one myself rather than accepting the remediation report.

M-1's addendum is accurate line-for-line against the source, including the lock's exact location, its key derivation, its lock-then-resolve ordering, the `setupAccount` lifecycle cases, the `MuscleRow` rendering, the changed-file list, the new judgment call, the 17:19–17:21 chronology, and the current ordinary and opt-in test counts. M-2's clause makes §5 rule 6 consistent with the other four corrected passages and with the shipped UI copy, and no unqualified statement of the identity survives anywhere in the architecture documents.

M-3 is the substantive one, and it holds up better than the remediation report claims for it. The new test is genuinely gated on its own variable, genuinely skipped in the ordinary suite, and genuinely guarded against being pointed at a shared database — I made that guard fire rather than reading it. Its concurrency is real and I measured it: eight distinct PostgreSQL backend PIDs contending on one advisory lock, one holding and seven queued, captured live from an outside session. Its assertions cover every required property, with builtin immutability checked by deep equality rather than row counts. And it fails, deterministically and on exactly the right assertion, when the lock is bypassed — eight orphan presets, three times out of three, reproduced independently with the production file restored and checksummed afterwards. The old PGlite test now says truthfully what it does and does not prove.

The production code is unchanged and remains the code I verified correct in the original review. Every gate is green. Nothing in this pass is browser-observable, and nothing I found warrants further remediation.

**VERIFIED — READY FOR DEVICE ACCEPTANCE**
