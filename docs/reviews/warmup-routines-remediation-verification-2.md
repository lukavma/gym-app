# Warm-up Routines v1 — Second Targeted Remediation Verification

Date: 2026-09-02
Verified tree: `main` @ `f4ee4e1` plus the uncommitted Warm-up Routines v1 working tree, after Appendix B of `docs/reviews/warmup-routines-remediation.md`.
Scope: **only** the five points below. Everything already verified in `warmup-routines-remediation-verification.md` was not re-litigated.
Method: my own executable negative controls against the real service and the real files; the remediation report was audited, not trusted.

**Verdict: `VERIFIED — READY FOR DEVICE ACCEPTANCE`**

Objectives 1, 2, 3 and 5 are cleanly met. Objective 4 is met in substance but carries a residual factual slip in one descriptive clause — one that **originated in my own previous verification report** and that Appendix B adopted in good faith. It errs conservatively (the guard is *stronger* than documented), involves no code, and cannot create a false sense of safety. §5 gives the corrected wording.

---

## 1. Objective results

| # | Objective | Result |
|---|---|---|
| 1 | The delete-race test accepts exactly the two legitimate typed outcomes and still rejects raw/untyped database errors | **VERIFIED** — §2 |
| 2 | The corrected message cannot falsely claim MEDIUM-1 regressed | **VERIFIED** — §3 |
| 3 | The opt-in real-PostgreSQL suite is stable across repeated fresh-database runs | **VERIFIED** — §4 |
| 4 | The boundary-control statement in the remediation report is now accurate | **SUBSTANCE VERIFIED; one clause still wrong (LOW)** — §5 |
| 5 | No production source, schema, migration, UI or unrelated file changed | **VERIFIED** — §6 |

---

## 2. Objective 1 — the acceptance boundary is exactly right

Probe 4 now asserts two things in sequence: `sqlStateOf(reason)` must be `null` (walking the `cause` chain for a 5-character SQLSTATE), and the rejection must be an instance of one of `TYPED_REPLACEMENT_FAILURES = [WarmupRoutineAssociationConflictError, WarmupRoutineLinkTargetNotFoundError]`.

I tested that boundary from both sides by mutating the **real service** and running probe 4 against a freshly created + migrated PostgreSQL 16 database each time:

| Control | Mutation to `setTemplateWarmupRoutines`'s catch | Required | Observed |
|---|---|---|---|
| **NC1** | SQLSTATE mapping removed entirely — a raw driver error escapes (a genuine MEDIUM-1 regression) | **REJECT** | **REJECTED** ✓ |
| **NC2** | conflict branch throws `WarmupRoutineNotFoundError` (typed, but *not* in the list) | **REJECT** | **REJECTED** ✓ |
| **NC3** | conflict branch throws a plain `new Error("boom")` (untyped, no SQLSTATE) | **REJECT** | **REJECTED** ✓ |
| **NC4** | conflict branch throws `WarmupRoutineLinkTargetNotFoundError` — the branch that used to make the suite flaky, forced onto the dominant path | **ACCEPT** | **ACCEPTED** ✓ (1 passed) |

Exact failure text, which also shows each message is accurate rather than boilerplate:

```
NC1: trial 0: a raw PostgreSQL error escaped the association path (SQLSTATE 23503)
     — it must be mapped to a typed domain error: expected '23503' to be null

NC2: trial 0: the replacement failed with an unexpected error type (WarmupRoutineNotFoundError);
     expected one of WarmupRoutineAssociationConflictError | WarmupRoutineLinkTargetNotFoundError

NC3: trial 0: the replacement failed with an unexpected error type (Error);
     expected one of WarmupRoutineAssociationConflictError | WarmupRoutineLinkTargetNotFoundError
```

So the gate is **exactly** the two legitimate typed outcomes: widening it to accept the second branch did not weaken it. NC1 is the important one — it proves the suite still catches the original MEDIUM-1 defect, and that `sqlStateOf` really does find a SQLSTATE nested on the `cause` chain rather than only on the top-level error. The `WarmupRoutineAssociationConflictError` branch is accepted implicitly by every passing run (NC1 shows the underlying driver error on that path is `23503`, which the service maps to exactly that class).

`src/server/warmupRoutines/service.ts` was restored byte-identically after every control (`720f6483…963`).

**A supporting observation on why the old assertion was unstable.** Appendix B measured the `LinkTargetNotFound` branch at 7/200 ≈ 3.5 % using the suite's own shared pool (`max: 16`). My previous verification measured it at **12/25 ≈ 48 %** driving the same race from two *separate* single-connection pools. Both branches are real; the rate is a pool-topology and timing artifact, which is precisely why a single-class assertion could not be stable — and why NC4's deterministic proof of acceptance is better evidence than any observed frequency.

---

## 3. Objective 2 — the false message is gone and cannot return

- `"MEDIUM-1 has regressed"` **no longer appears anywhere in `tests/`.**
- Probe 4's title is now *"a concurrent routine hard-delete always fails with a TYPED domain error (never a raw PostgreSQL error) and never orphans a link"* — which is the property it actually checks.
- Its three remaining messages (raw-SQLSTATE escape, unexpected error type, orphaned link row) each name the real condition, verified verbatim by NC1–NC3 above.

The only surviving `"has regressed"` string in the suite is probe 2's `"a later-committing clear never actually cleared — LOW-1 has regressed"`. That one is **accurate**: it fires only when `clearedCount === 0`, which is LOW-1's exact signature — I reproduced precisely that by bypassing the anchor lock in the previous verification (clear won 0/30). Probe 2 also alternates the issue order across its 12 trials so both commit orders occur, and it did not fire once in the 30 runs below.

---

## 4. Objective 3 — the opt-in suite is stable

**30 runs, each on its own freshly created and migrated database** (created → `db:migrate` `0000→0010` → suite → dropped):

```
run 1..30: PASS
=== STABILITY: pass=30  assertion-failures=0  other=0  of 30 ===
```

**30/30, zero assertion failures, zero worker crashes.** Against the pre-fix behaviour this is decisive: my previous verification measured 1 failure in 6 runs (~17 %) and Appendix B computes ~35 % from the branch rate. Thirty consecutive clean runs has probability ≈ 0.4 % at 17 % and ≈ 1 × 10⁻⁶ at 35 %.

I did **not** observe the `ERR_IPC_CHANNEL_CLOSED` tinypool crash Appendix B reported once in 72 runs. At ~1.4 % the chance of seeing none in 30 runs is ~65 %, so my result neither reproduces nor contradicts it. I agree with Appendix B's characterisation on its merits: a worker-pool crash before any test executes produces no summary and no assertion, so it cannot pass while broken and cannot tell a maintainer that a closed finding has reopened. It is categorically unlike the defect that was fixed.

The suite remains correctly opt-in — with `WARMUP_CONCURRENCY_DATABASE_URL` unset it reports `↓ … (6 tests | 6 skipped)`, and the ordinary `pnpm test:integration` run shows 4 skipped files / 15 skipped tests (the three pre-existing peers' 9, plus this suite's 6).

---

## 5. Objective 4 — substance correct, one clause still wrong (LOW)

### What B.2 gets right, verified

Appendix B corrects §2.4's original claim that a direct `server/volume/service.ts → db/schema/warmupRoutines.ts` import is "**DETECTED**". Its mechanism explanation is **accurate**, and I confirmed each part:

- `isWarmupModule` returns `false` for the three `WARMUP_SCHEMA_DECLARATIONS` unconditionally — read directly from the source.
- `isSchemaRegistryOnly` is wired into claim 2's filter and the carve-out control, never into claim 1's offender check — confirmed at every call site (lines 264, 309, 323, 326, 356, 434, 436).
- With the import really present, **claim 1 itself passes**: `pnpm exec vitest -t "progression and volume never transitively reach"` → `1 passed | 16 skipped`.
- The precedent holds: `progressionBoundary.test.ts` likewise scopes its offender set to `domain/`, `server/` and `ui/` and does not treat `db/schema/bodyweightEntries.ts` as an offender.

### The clause that is still wrong

B.2's corrected row ends *"…so the boundary test itself does **not** fail on this edge"*, and its prose says *"With that import really present, the boundary test passes."*

**Both are false.** With the real import in `src/server/volume/service.ts`:

```
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)

 FAIL … > MEDIUM-2 regression controls … >
   carve-out (a) is edge-specific: a DIRECT engine import of a warm-up table declaration is DETECTED
 AssertionError: expected false to be true
 ❯ tests/unit/warmupBoundary.test.ts:434:63
     433|  const { allParents: cleanParents } = walkImportGraph(ENGINE_ROOTS);
     434|  expect(isSchemaRegistryOnly(warmupTable, cleanParents)).toBe(true);
```

The carve-out control's own *baseline* assertion breaks: once a non-registry parent really exists, the clean walk no longer sees the table declaration as registry-only. So the suite **does** fail on this edge — through a different assertion than §2.4 originally claimed, but it fails.

### Accurate wording for that row

> | carve-out (a) | `server/volume/service.ts` → `db/schema/warmupRoutines.ts` directly | — | Claim 1's offender filter (`isWarmupModule`) excludes the table declarations unconditionally, so **claim 1 does not detect this edge**. The suite nonetheless **fails**, on the carve-out control's own baseline assertion (`isSchemaRegistryOnly(warmupTable, cleanParents)` becomes `false` once a non-registry parent exists). |

### Why this is LOW and not blocking

- **The error originated in my own report.** `warmup-routines-remediation-verification.md` §3.3 stated "My real-file control shows the boundary test **passes** with exactly that import in place." That conclusion came from a control run whose output I filtered for specific patterns without asserting pass/fail — it was an inference, not a measurement, and it was wrong. Appendix B quoted it faithfully. The mistake is mine before it is theirs.
- **It errs conservatively.** The documentation now understates the protection. The dangerous direction — §2.4's original "DETECTED", which could have led someone to rely on claim 1 for an edge it does not cover — is exactly what B.2 fixed.
- **No code is implied.** The test behaves correctly and no change to it is wanted; only one clause of an appendix needs rewording.

---

## 6. Objective 5 — nothing else changed

The complete file-level delta since my previous verification's final snapshot, by sha256 across the whole tree:

```
ADDED    docs/reviews/warmup-routines-remediation-verification.md   (my own prior report)
MODIFIED docs/reviews/warmup-routines-remediation.md                (Appendix B)
MODIFIED tests/integration/warmupAssociationConcurrency.integration.test.ts   (probe 4 + import)
MODIFIED tsconfig.tsbuildinfo                                       (gitignored build artifact)
```

Exactly the two files Appendix B §B.3 claims, plus my own doc and one build artifact. Independently confirmed:

- **Production source:** unchanged. `src/server/warmupRoutines/service.ts` and `src/app/api/templates/[id]/warmup-routines/route.ts` are byte-identical to the previous verification's snapshot.
- **Gated files:** `git diff HEAD` **empty** for `src/domain/sync/schema.ts`, `src/server/sync/service.ts`, `src/domain/sync/payloadBuilders.ts`, `src/sync/outbox.ts`, `src/sync/flush.ts`, and all of `src/domain/progression/`, `src/domain/volume/`, `src/server/progression/`, `src/server/volume/`.
- **Schema / migrations:** the only `git diff HEAD` entries under `src/db/schema` and `drizzle/` are the original implementation's `index.ts` barrel lines and the one appended `_journal.json` entry. `0010` unchanged (`28133f0d…aa`); **no `0011`**.
- **UI:** all eight warm-up-touching UI files byte-identical to the original review baseline — `TemplateWarmupRoutinesSection.tsx`, `WarmupRoutineForm.tsx`, `WarmupRoutinesSection.tsx`, `ui/warmup/types.ts`, `WarmupCard.tsx`, `TodaySection.tsx`, `WorkoutExecution.tsx`, `TemplateForm.tsx`.
- **Other reports:** `warmup-routines-review.md`, `warmup-routines-implementation.md` (including Appendix A) and `warmup-routines-remediation-verification.md` were not modified.

### Gates, re-run by me

| Gate | Result |
|---|---|
| `pnpm lint` | **pass**, 0 errors, 0 warnings |
| `pnpm typecheck` | **pass**, 0 errors |
| `pnpm typecheck:sw` | **pass**, 0 errors |
| `pnpm test:unit` | **42 files, 549 passed / 549** |
| `pnpm test:integration` (ordinary) | **21 passed + 4 skipped files; 294 passed + 15 skipped / 309**, 0 failed |
| `pnpm format:check` | **1 pre-existing failure**, `src/server/sync/service.ts`, CRLF-only (implementation report Appendix A) |
| Gated concurrency suite | **30 fresh-database runs, 30 pass, 0 assertion failures** |

No E2E run: no production code changed since the previous verification, where the full 90-test suite passed on a clean disposable PostgreSQL 16 against a production build.

---

## 7. A mistake I made during this verification, and its resolution

While running the objective-4 control I backed up two files into `.v2-scratch/backup/` using `basename`. Both are named `service.ts` (`src/server/volume/service.ts` and `src/server/warmupRoutines/service.ts`), so the second backup overwrote the first, and my "restore" wrote the warm-up service's contents into **`src/server/volume/service.ts`** — a gated file.

It was caught within the same step, by the boundary test's own output: the failure trace read `server\volume\service.ts -> domain\warmup\schema.ts`, an edge my intended import could not have created. `git checkout` restored the content (`git diff HEAD` empty), and converting CRLF → LF restored the exact working-tree bytes — `66991decbf93421a7614ec3fc8f5c822fc4216bf483323f176cc41f97f364c2a`, matching the snapshot taken at the start of this verification. The boundary test then returned to a clean **17/17**.

Because `git checkout` writes CRLF under this repo's `core.autocrlf=true` and I converted back to LF, the file's cached stat data in the index went stale, so `git status` briefly listed it as modified while `git diff HEAD` stayed empty. The content was never in question — the worktree blob hashes to `9b94fcb05ff9d60863348726d37392ca791ee981`, identical to `HEAD:src/server/volume/service.ts`. A `git update-index --refresh` (a stat-cache refresh only — it rewrites no file and stages nothing) cleared the stale entry, and the file no longer appears in `git status`, exactly its baseline appearance.

Two consequences, both handled:

- The **first** objective-4 measurement was taken against that corrupted file and is void. Every result reported in §5 comes from the redone control on a clean tree, with path-flattened backup names that cannot collide.
- The 30 stability runs overlapped part of the corrupted window, but the gated concurrency suite does not import `src/server/volume/service.ts` (it imports `@/db/schema`, `@/server/warmupRoutines/service` and `@/domain/ids/uuidv7`), so vitest never loaded it and those results are unaffected. The final byte-identical tree sweep in §8 confirms nothing survived.

---

## 8. Cleanup and final working-tree state

**Temporary artifacts, all removed:** `.v2-scratch/` (backups, the 30-run stability script), `test-results/`, `playwright-report/`.

**Files temporarily edited, all restored byte-identically (sha256 verified):**

| File | sha256 before and after |
|---|---|
| `src/server/warmupRoutines/service.ts` (NC1–NC4) | `720f6483ec2619b2d7a8252eea4767d6ec08441e5f3faa8988da930a4352c963` |
| `src/server/volume/service.ts` (objective-4 control; also §7) | `66991decbf93421a7614ec3fc8f5c822fc4216bf483323f176cc41f97f364c2a` |
| `src/domain/volume/aggregate.ts` (backed up, not edited) | `fdceba03e895eefe9b72c5260b85004b9d85ffa9a4af27a65ba660e5caf54eae` |
| `src/domain/progression/engine.ts` (backed up, not edited) | `ed263eab372762e30e1d2207c09c044385b4ed15262023d510ea9c60c3923764` |

**Databases:** `v2s1`–`v2s30` (stability) and `v2nc1`–`v2nc4` (negative controls) were each created, migrated, used once and **dropped**. Remaining, none touched by me: `gymapp` (dev), `gymapp_warmup_e2e`, `gymapp_wuconc`, `gymapp_wu_rem_e2e` — the last three are disposable leftovers from the earlier tasks and safe to drop. **Production was never contacted**; nothing was committed, pushed or deployed.

**Final tree:** a full sha256 sweep of all **524** files (excluding `node_modules`, `.git`, `.next`) is **byte-identical to the state at the start of this verification** — including `public/sw.js` and `tsconfig.tsbuildinfo`, since no rebuild was needed. `git status --porcelain` is unchanged apart from this new file, and every unrelated working-tree change (`CLAUDE.md`, `HANDOFF*`, `docs/input/product-ideas.md`, `gpt-*.md`, `.claude/skills/`) is preserved exactly.

---

## 9. Verdict

**`VERIFIED — READY FOR DEVICE ACCEPTANCE`**

The delete-race assertion now accepts exactly the two legitimate typed outcomes and nothing else: forcing the previously-rejected `WarmupRoutineLinkTargetNotFoundError` onto the dominant branch makes the test pass, while removing the SQLSTATE mapping, substituting an unlisted typed error, or substituting a plain `Error` each make it fail with a message that names the real condition. The false `"MEDIUM-1 has regressed"` text is gone and the one surviving `"has regressed"` message belongs to LOW-1, where it is accurate. The opt-in suite ran **30 times on 30 fresh databases with zero assertion failures**, against a pre-fix rate that makes that outcome essentially impossible by chance. Nothing outside the one test file and the report appendix changed, and every gate reproduces, with only the long-standing CRLF-only `format:check` failure on a file this work must not touch.

The one residual is a single descriptive clause in Appendix B that says the boundary test passes on a direct engine import of a warm-up table declaration; it does not — it fails on the carve-out control's baseline assertion. That statement traces back to an unmeasured inference in my own previous report, it understates rather than overstates the protection, and it needs a wording change and no code. §5 supplies the accurate text.

Real-device acceptance remains the outstanding work, unchanged from the original review's §8 list. Nothing in this verification touches phone behaviour.
