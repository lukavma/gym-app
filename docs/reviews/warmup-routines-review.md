# Warm-up Routines v1 — Independent Adversarial Review

Date: 2026-09-02
Reviewed tree: `main` @ `f4ee4e1` plus the uncommitted Warm-up Routines v1 working tree (untouched by this review — §11).
Authoritative inputs: `docs/reviews/warmup-routines-architecture-evaluation.md` and its dated **Owner Decision Addendum** (binding, supersedes §4.2/§5.1); `docs/reviews/warmup-routines-implementation.md` (audited as evidence, not accepted as truth).
Method: the working tree was read directly; every load-bearing claim was re-established with **independent fixtures and executable negative controls** on disposable databases. The shipped suites were also run, but never as the sole basis for a conclusion.

**Verdict: `READY FOR REMEDIATION`** — two MEDIUM findings, no BLOCKER and no HIGH. Both are small, isolated, and invisible on a phone; §10 explains why they still block a clean pass.

---

## 1. Summary

The feature is, structurally, what the addendum asked for. The curated M:N model is correct and database-enforced; execution state genuinely never leaves the device; the sync contract, both engines, the outbox and every applied migration are byte-identical to `HEAD`; and identical work sets produce identical progression and volume regardless of warm-up behaviour. I could not construct a case where a warm-up fact reached PostgreSQL, the wire, or either engine.

The two defects are on the **association write path** and in the **boundary test's root set**:

| # | Severity | Finding |
|---|---|---|
| MEDIUM-1 | MEDIUM | Concurrent association replacement returns an **unhandled HTTP 500** (SQLSTATE 23505/23503 unmapped), unlike every peer service in the repo. 8/8 over real HTTP; 40/40 at the service layer. |
| MEDIUM-2 | MEDIUM | `warmupBoundary.test.ts`'s roots omit **three real warm-up modules**, including the template-association API route — a proven false negative on the exact R-5 scope-creep guard the test exists to provide. |
| LOW-1 | LOW | A later-committing "clear all associations" is silently discarded with `200 OK` (40/40). |
| LOW-2 | LOW | The implementation report's prettier evidence is not reproducible (its conclusion still holds). |
| LOW-3 | LOW | The database alone permits a cross-user template↔routine link; only service code prevents it. |
| LOW-4 | LOW | Routine-name uniqueness is not trim-normalised in the database (Zod trims; the index does not). |

---

## 2. MEDIUM-1 — Concurrent association replacement returns HTTP 500

### What happens

`setTemplateWarmupRoutines` ([service.ts:368-411](src/server/warmupRoutines/service.ts#L368-L411)) replaces a template's whole link set as `DELETE … WHERE template_id = $1` followed by `INSERT … VALUES (…position 0..n-1…)` inside one transaction. Under PostgreSQL's default READ COMMITTED, a `DELETE` whose statement snapshot was taken before a concurrent transaction committed **does not see that transaction's newly inserted rows**. The second writer therefore deletes nothing and inserts at `position 0`, which collides with the first writer's committed `position 0`.

The resulting `23505` is caught by neither the service nor the route — [route.ts:59-67](src/app/api/templates/[id]/warmup-routines/route.ts#L59-L67) maps only `WarmupRoutineLinkTargetNotFoundError` and `WarmupRoutineDefaultNotLinkedError`, then rethrows. Next.js turns the rethrow into a 500.

### Root cause

`replaceWarmupRoutine` is **not** affected by the same pattern, and the contrast is the diagnosis: it issues `UPDATE warmup_routines SET name, updated_at WHERE id = $1` *before* touching items, and that row write serialises the whole transaction. `setTemplateWarmupRoutines` deliberately never writes `workout_templates` (there is no `warmup_routine_id` column — correct per the addendum), so **it has no shared anchor row to serialise on**.

### Evidence — real HTTP, production build, disposable PostgreSQL 16

8 trials of two simultaneous `PUT /api/templates/{id}/warmup-routines`:

```
CONCURRENT PUT statuses: ["200|500","200|500","200|500","200|500",
                          "200|500","200|500","200|500","200|500"]
```

Production server log:

```
Error: Failed query: insert into "workout_template_warmup_routines" (...)
  [cause]: error: duplicate key value violates unique constraint
           "uq_template_warmup_routine_position"
    severity: 'ERROR', code: '23505'
```

### Evidence — real service, real PostgreSQL 16, separate connection pools

PGlite is a single in-process backend and never interleaves (the repo already documents this in `recoveryConcurrency.integration.test.ts`), so the shipped PGlite suite **cannot** have covered this. Driving the real `setTemplateWarmupRoutines` from two independent `pg` pools:

| Probe | Trials | Result |
|---|---|---|
| Two replacements, disjoint sets | 40 | **40/40** one side fails `23505`; winner's set always complete and correct |
| Mixture hunt, 2-elem vs 2-elem, staggered 0–30 ms | 72 | **0 mixtures**, 0 unions, 0 orphans; 38/72 produced `23505` (delays 0–3 ms); ≥3 ms is clean last-writer-wins |
| Association replace vs concurrent routine hard-delete | 15 | **15/15** `23503` foreign-key violation, also unmapped; **0 orphaned links** |
| Routine replace vs routine replace (same routine) | 50 | **50/50 clean**, no errors, items always exactly one submitted set — the anchor-row lock works |

### Direct answers to the questions posed

| Hazard | Reachable? |
|---|---|
| A union or partial mixture of both submitted sets | **No** — 72 targeted trials, none. `uq_template_warmup_routine_position` makes position 0 collide before a mixture can form. |
| Duplicate / default constraint failures | **Yes** — 100 % of raced trials, surfacing as HTTP 500. |
| Orphaned links | **No** — FK integrity held in every probe (0 orphans across the whole database). |
| Lost updates beyond ordinary last-writer-wins | **Yes** — see LOW-1. |
| A result matching neither complete request | **No** — the persisted state was always exactly one submitted set. |

So **data integrity is sound**; the constraints do their job. What is wrong is error handling.

### Why this is a defect and not a style preference

Every peer service in this repo maps its SQLSTATEs into typed errors — `blocks/service.ts:460,545`, `exercises/service.ts:212,285,308,322`, `programs/service.ts:117,159`, `recovery/service.ts:174,203`, `sync/service.ts:529`. `warmupRoutines/service.ts` even defines `isPostgresErrorCode` and uses it in `createWarmupRoutine`/`replaceWarmupRoutine` — the association path is the sole place it is not applied.

### Reachability and mitigation already present

The Save button is `disabled={saving}` ([TemplateWarmupRoutinesSection.tsx:256](src/ui/warmup/TemplateWarmupRoutinesSection.tsx#L256)), so a single-tab double-tap cannot trigger it. It needs two tabs/devices or a client retry. On a 500 the UI shows "Failed to save warm-up routines." and a retry succeeds. That is what keeps this MEDIUM rather than HIGH.

---

## 3. MEDIUM-2 — The boundary test's roots omit three real warm-up modules

`warmupBoundary.test.ts` is otherwise the strongest artifact in the change: a real AST import-graph walker (multi-line imports, `export * from`, `export {} from`, dynamic `import()`, `require()`, `@/` aliases, index resolution all handled), BFS-order-independent `allParents`, and an edge-specific `db/schema` carve-out. I audited the walker itself and found no false-negative in its mechanics.

The gap is in the **root set**. `WARMUP_ROOTS` ([warmupBoundary.test.ts:117-122](tests/unit/warmupBoundary.test.ts#L117-L122)) enumerates `domain/warmup`, `server/warmupRoutines`, `ui/warmup`, `app/api/warmup-routines`. Three warm-up files on disk are outside it:

- `src/app/api/templates/[id]/warmup-routines/route.ts` — **a real warm-up API route**
- `src/app/(app)/warmup-routines/new/page.tsx`
- `src/app/(app)/warmup-routines/[id]/page.tsx`

`isWarmupModule` (used for claim 1's offender detection) has the same three omissions.

### Executable negative controls

Each forbidden import was written into the real file, `warmupBoundary.test.ts` was run, and the file was restored byte-identically:

| Control | Edge inserted | Boundary test |
|---|---|---|
| **A** (must fail) | `server/warmupRoutines/service.ts` → `@/domain/sync/schema` | **FAILED** ✓ correct |
| **B** (must fail) | `domain/volume/aggregate.ts` → `@/domain/warmup/session` | **FAILED** ✓ correct |
| **C** | `app/api/templates/[id]/warmup-routines/route.ts` → `@/domain/sync/schema` | **PASSED** ✗ **false negative** |
| **D** | `app/(app)/warmup-routines/new/page.tsx` → `@/domain/sync/schema` | **PASSED** ✗ **false negative** |
| **E** | `ui/workout/WarmupCard.tsx` → `@/sync/outbox` | **PASSED** — documented carve-out, disclosed in the file |

Control C is precisely evaluation risk **R-5** ("someone 'just adds' warm-up state to the sync contract") on a warm-up write-path route. The code is clean today — I verified it — but the standing guard would not catch the regression it was built to catch.

Control E is honestly documented in the test and the report, and `WarmupCard`'s inability to write an execution fact is proven behaviourally instead. I note it only so the carve-out's extent is on record: the static guard does not cover the card.

All five files were verified byte-identical after restoration (sha256).

---

## 4. LOW findings

**LOW-1 — a later-committing "clear" is silently discarded.** 40/40 trials where request A sets `{r1, r2}` and request B clears the set: both return success (`ok|ok`), and the persisted result is A's set. B's `DELETE` removes nothing (A's rows are invisible to its snapshot) and it has nothing to insert, so it commits a no-op. The endpoint returns the post-transaction `listTemplateWarmupRoutines`, so the response body truthfully reports A's links and the UI re-renders from it — the user sees the real state, but under a "Warm-up routines saved." message. Beyond ordinary last-writer-wins, since the *later* committer loses.

**LOW-2 — the report's prettier evidence is not reproducible.** §12 states that `src/server/sync/service.ts` "is byte-identical to `HEAD` (verified: … the extracted `HEAD` blob hashes identically to the working copy), and running `prettier --check` on the extracted `HEAD` blob reproduces the same warning." Neither holds:

```
HEAD blob sha256:  f9d9ebe64e94d6cf05dbd9d72d45a9324379133feef2e7eb0e8eaa5fae47f734
worktree sha256:   fa2949707bc3d615b9a35ed78a22443416fed5e0b5c555a95ad79061bfb2b3a0
prettier --check on the extracted HEAD blob:  "All matched files use Prettier code style!"
```

The **conclusion is nevertheless correct**, for a reason the report does not state: the file is the *only* tracked `.ts`/`.tsx` file in the worktree with CRLF line endings (`core.autocrlf=true`, no `.gitattributes`), and stripping CR makes it byte-identical to the blob — same `f9d9ebe6…`. Prettier's sole objection is the line endings. So the drift is real, pre-existing, CRLF-only, and untouched by this work; only the cited reproduction is wrong.

**LOW-3 — the database alone permits a cross-user link.** Raw SQL inserted a link between user 1's template and user 2's routine and PostgreSQL accepted it. Only `setTemplateWarmupRoutines`'s in-transaction ownership check prevents it. This matches the rest of the schema (no cross-table user constraint exists anywhere in this repo), and I verified the service guard is airtight — foreign routine ids raise `WarmupRoutineLinkTargetNotFoundError` with the previous set intact and no disclosure; foreign template ids return `null` → 404; foreign routine read/replace/delete all report not-found and leave the owner's data untouched. Recorded as a property of the design, not a live vulnerability.

**LOW-4 — name uniqueness is not trim-normalised in the database.** `uq_warmup_routines_name` is `(user_id, lower(name))`, so `"Upper Standard "` and `"Upper Standard"` can coexist at the SQL level (verified: two rows matched `lower(btrim(name))='upper standard'`). Every write path parses through `warmupRoutineNameSchema`, which trims, so this is unreachable through the API. Noted because the service accepts pre-parsed input and does not re-validate.

---

## 5. What was independently verified correct

### 5.1 Schema and migration (priority 1)

A fresh database (`wu_review`) on the local Docker **PostgreSQL 16.14** was migrated `0000 → 0010` with `pnpm db:migrate` — **no manual repair required**. Independent inspection:

- All three tables' columns, types, nullability, timestamps, indexes and FKs match the report exactly (`\d` output).
- `workout_templates` has **8 columns**, unchanged; **no** `warmup_routine_id` anywhere.
- The only warm-up-named column in the entire database is the pre-existing `set_logs.is_warmup`. The three new tables are the only warm-up-named tables. 23 tables total.
- `pnpm db:generate` → **"No schema changes, nothing to migrate"**; no file was created.
- Migrations `0000`–`0009` and `meta/000*_snapshot.json` are **byte-identical to `HEAD`** (sha256, all 20 files).
- `_journal.json` gained exactly one appended entry (`idx 10`).
- `0010` contains **no** `DEFERRABLE` hand-patch, unlike `0003`/`0004` which do — consistent with "generated, never hand-edited".

**Constraint probes with independently inserted raw-SQL rows** (not Drizzle declarations):

| Probe | Result |
|---|---|
| Duplicate routine name, different case (`uPpEr StAnDaRd`) | `23505 uq_warmup_routines_name` ✓ |
| Same name, different user | accepted ✓ |
| Unicode case folding (`Aufwärmen` / `AUFWÄRMEN`) | `23505` ✓ |
| Duplicate `(routine_id, position)` | `23505 uq_warmup_routine_item_position` ✓ |
| Second default on one template | `23505 uq_template_warmup_routine_default` ✓ |
| Same routine linked twice to one template | `23505 uq_template_warmup_routine` ✓ |
| Duplicate `(template_id, position)` | `23505 uq_template_warmup_routine_position` ✓ |
| A *different* template's own default at position 0 | accepted ✓ (no cross-template collision) |
| Delete routine | items 2→0, its links gone, another routine's link survives ✓ |
| Delete template | its links gone, routine and the other template's link survive ✓ |
| Delete program | all links gone, both routines survive ✓ |
| `position = 32767` | accepted (smallint bound) ✓ |

### 5.2 Association correctness (priority 2)

Add, remove, reorder, clear, replace, empty sets, one routine as default of several templates, and per-template independence all behave correctly. Rollback is complete: `routine_not_found` and `default_not_linked` each left the previous set **byte-identical** (`A@0,B@1*` before and after). Cross-user isolation held on all five probes (§4, LOW-3). Concurrency is covered in §2.

### 5.3 Today resolution (priority 3)

Eleven independent tests using a **fixed-weekday schedule** (the shipped spec uses rotation mode), three templates, a second user, and entirely different fixture names/items. All pass:

- no links → `[]` + `null`, and `freezeWarmupState` → `null` (no card);
- links without default → routines present, `selectedRoutineId` null, `done: []` (compact chooser);
- a default → preview name, `selectedRoutineId` set, `done` sized to that routine's items;
- another template's routines never appear (asserted on the serialised bundle);
- archived and never-scheduled templates' links do not affect Today;
- cross-user data cannot enter even when routine **names collide** — the foreign id, label and instruction are all absent from the bundle;
- association order is bundle order, and reordering flips it, default included;
- **editing or deleting a routine after start does not mutate the frozen copy** — the frozen aggregate compared byte-equal to its pre-edit snapshot, still carried the deleted routine, and switching to it still worked, while a fresh bundle showed the edits (convergence);
- deleting the default leaves no links and no default.

**Defensive DTO probes** (beyond "field absent"): a default id not in the list → ignored, `selectedRoutineId` null; a zero-item routine → `done: []`, never reads as complete; duplicate routine ids → `done` sized to the first match; out-of-range, negative and non-integer toggle indices → no-ops, never throws; unknown routine id on select → previous selection kept. In every representable state `done.length` equals the selected routine's item count.

Hostile content (`<script>alert(1)</script>`, `& < > " ' \` ${x}`, emoji, RTL override, tabs/newlines) round-trips through PostgreSQL unchanged, and no warm-up UI file uses `dangerouslySetInnerHTML`/`innerHTML`/`eval`.

### 5.4 Local lifecycle and offline (priority 4)

Seven independent tests against the **real** mutators and a **real** IndexedDB (`fake-indexeddb`), targeting what the shipped spec does not:

- **six overlapping fire-and-forget toggles** (the way the UI calls them, with no per-row disabling) → all six land; three overlapping un-ticks → exact expected vector; two concurrent toggles of the same index → returns to its starting value. **No lost updates** — `serialize()` + a fresh `requireLocalSession()` read per call does its job.
- a 12-round storm of 5 concurrent mixed mutations (toggle/select/dismiss) → `done` stayed parallel to the selected routine's items in **every** round.
- warm-up mutations interleaved with real `logSet` calls → neither clobbers the other; exactly two `setLog` ops and **zero** warm-up ops; the wire carries `isWarmup` (positive control) but no routine id, name, item or new key.
- a hand-corrupted aggregate (over-long `done`, shrunken items) → no mutator throws, and re-selecting resizes `done` correctly.
- a session with no `warmup`, and a server-hydrated DTO with the key absent → mutators are inert, the key never appears.
- complete **and** discard → aggregate gone, and **every object store in the database** scanned: no routine id, name, item label, or new key survives.
- a pre-upgrade start input with the warm-up keys deleted → exactly `["workoutSession","sessionExercise"]`.
- **zero `flushOutbox` calls** from any warm-up mutator, measured after subtracting `startSession`'s own legitimate flush.

The service worker's cache sanitiser spreads the bundle (`{...bundle, activeSession: null}`) and blanks only `activeSession`, so the new fields ride along in the SW cache and `bundleCache` untouched — no SW change was needed, as the evaluation predicted. The shipped cold-offline spec (test 13, genuinely new process with name resolution severed) and the both-cache-layers legacy-bundle spec (test 12) both passed in my own production-build run.

### 5.5 Workout semantics and UX at 390×844 (priority 5)

Measured on the production build at `390×844`:

| Check | Measurement |
|---|---|
| **Controlled-checkbox flicker** | 43 animation-frame samples over 700 ms: **flips = 0**, first sample already `checked=true` at **8.9 ms**, **no revert observed at any frame**. |
| Rapid clicking | 6 back-to-back clicks (`delay: 0`) → correct final state, no interaction loss. |
| Horizontal overflow | `scrollWidth 390 == clientWidth 390` with a 107-char label and a 95-char instruction. |
| Touch target | checklist row **332 × 62 px**. |
| User-authored markup | 0 `<b>` elements, 0 `<script>` elements injected; text rendered verbatim. |
| Tap budget | **2 taps** from Today to a logged prefilled work set — inside F5's ≤3, unchanged. |
| Today preview | `Warm-up: <name>` line present, informational; exactly one "Start workout" CTA. |
| Navigation | `layout.tsx` still has **7** links — no eighth (O-4). |
| `is_warmup=true` set | card **stays expanded**; a real work set then collapses it; manual reopen works. |

**On the report's controlled-checkbox judgment (§5.7):** the report is right that the checkbox reflects committed state and wrong to worry. I looked for the revert rather than reading the rationale, and there is none at frame resolution — the commit lands inside the first frame. The design costs nothing observable and buys a single source of truth. The `.click()` + committed-counter idiom in the specs is the correct assertion, not a workaround.

One note for the record: **no UI in this app logs an `is_warmup` set.** `ExerciseCard` only renders a `W ·` prefix and always calls `logSet` without the flag. The `hasLoggedWorkSet` logic ([WarmupCard.tsx:216-218](src/ui/workout/WarmupCard.tsx#L216-L218)) is correct — I proved it by injecting an `is_warmup: true` set into the aggregate and confirming the card stayed expanded — but the scenario is only reachable today via a cross-device hydrate or a future UI.

### 5.6 Structural isolation and wire purity (priority 6)

`git diff HEAD` is empty for `src/domain/sync/schema.ts`, `src/server/sync/service.ts`, `src/domain/sync/payloadBuilders.ts`, `src/sync/outbox.ts`, `src/sync/flush.ts`, all of `src/domain/progression/`, all of `src/domain/volume/`, and every applied migration. No untracked file exists inside any of those directories except `drizzle/0010_*.sql` and `meta/0010_snapshot.json`. `SYNC_ENTITIES` is unchanged. W-1 is genuinely not applicable: the contract was never opened.

**Wire capture, independently.** The shipped wire test attaches its `request` listener *after* all warm-up interaction, so it structurally cannot observe a POST issued during one. I attached the listener **before session start** and captured every `POST /api/sync` for the whole session:

```
SYNC POSTs before warm-up interaction = 1   (the session-start flush)
SYNC POSTs during warm-up interaction = 0
```

— across two ticks, a routine switch, another tick, a skip and an undo, plus a 1.5 s settle window. The subsequent bodies carry `"setLog"` and `"isWarmup":false` (positive controls) and none of: either routine name, either routine id, any item label, `"warmup"`, `"selectedRoutineId"`, `"dismissed"`, `"warmupRoutines"`, `"defaultWarmupRoutineId"`.

### 5.7 Outcome equivalence (priority 7)

**Part A — client op streams.** Three arms driven through the real mutators with byte-identical work sets: routine completed (all items ticked), routine skipped (dismiss → undo → switch → tick → skip), and no routine linked. All three produce the **same entity sequence and the same normalised payloads** (ids tokenised positionally, timestamps constanted). Non-vacuous: streams contain `Deadlift` and `completed`; positive control — changing one set's weight makes the streams differ.

**Part B — server engines, three freshly migrated isolated databases.** Arms: default-linked / linked-without-default / no links, each receiving an identical batch through the real `applySyncBatch`. Progression rows compare equal on `action`, targets, `strategyId`, `strategyVersion`, `classification`, `reasonCodes`, `confidence`, `inputs`, `computedBy`, `status`; the weekly volume report compares equal in full. Non-vacuous: the decision really is `increase_load` with `["ALL_PRESCRIBED_REPS_COMPLETED","FINAL_SET_RIR_IN_PROGRESS_ZONE"]`, and volume really contains `quads`. Positive control: different work sets give `increase_load` vs `hold` **and** different volume.

Execution-row dumps in both warm-up arms contain no routine name, item label, or `warmup_routine`, while containing `Back Squat` and `completed`.

### 5.8 Report audit (priority 8)

Every count and claim I could check is accurate:

| Report claim | Verified |
|---|---|
| Unit: 42 files, 540 tests, 540 passed | **42 / 540 / 540** ✓ |
| Integration: 24 files, 303 tests, 294 passed, 9 skipped | **21 passed + 3 skipped files; 294 passed + 9 skipped** ✓ |
| E2E: 90 tests, 90 passed, disposable PG16 + production build | **90 passed, 0 failed** (1.9 min) ✓ |
| New tests 18/17/18/8 unit, 25/14 integration, 8/14 E2E | exact ✓ |
| "No existing test file was modified" | `git diff HEAD -- tests/` empty ✓ |
| `lint` / `typecheck` / `typecheck:sw` clean | 0 errors, 0 warnings ✓ |
| `pnpm build` passes | ✓ |
| `format:check`: one pre-existing warning on `src/server/sync/service.ts` | ✓ (mechanism corrected — LOW-2) |
| Changed-file inventory (§10) | matches `git status` exactly ✓ |
| Migration 0010 generated, not hand-edited | no `DEFERRABLE`, `db:generate` reports no drift ✓ |
| 0010 applied to the dev database `gymapp` | 3 tables present, 0 rows ✓ |
| `gymapp_warmup_e2e` left behind as evidence | still present ✓ |

The report's §5 deviations are all defensible as written. §5.1 (top-level `/warmup-routines/*` URLs with Programs-only navigation) satisfies O-4 as stated — the nav is still seven links. §5.3's association cap of 20 and §5.4's `linkedTemplateCount` are sensible. §5.9's `{ exact: true }` scoping is correct and did not disturb the older specs, which all passed.

---

## 6. Owner-decision conformance

| Decision | Status |
|---|---|
| **O-1** curated M:N, ≤1 default, database-enforced | ✓ `workout_template_warmup_routines` with `uq_template_warmup_routine_default` partial unique on `(template_id) WHERE is_default`, probed directly. No column on `workout_templates`. |
| **O-2** switcher offers only linked routines | ✓ bundle carries only the resolved template's links; `RoutineSelect` renders `warmup.routines` (the frozen linked set) only. |
| **O-3** cross-device adopt loses the checklist | ✓ hydrated DTO has no `warmup`; card absent; asserted, not assumed. |
| **O-4** management under Programs, no 8th nav item | ✓ 7 nav links; section rendered below the program list. |
| **O-5** user-created, zero seeded content | ✓ no seed writes any warm-up row; dev database holds 0 routines. |
| **O-6** Today `Warm-up: <name>` preview, no gate | ✓ informational line; one CTA; 2-tap path preserved. |
| **O-7** PI-003 rewrite deferred | ✓ `docs/input/product-ideas.md` untouched. |
| **I-1…I-8**, **N-1…N-6** | ✓ verified structurally and behaviourally (§5.4–§5.7). |

---

## 7. Discrepancies between the report and the tree

1. **LOW-2** — the prettier evidence in §12 is not reproducible as written (correct conclusion, wrong reproduction).
2. **§8.4's boundary claim is broader than the test** — "no warm-up module reaches progression, volume, the sync contract, the outbox or the flusher" is asserted for four directories; three warm-up files outside them are never walked (MEDIUM-2). The report discloses the `WarmupCard` carve-out but not this one.
3. **§8.4's wire claim** — "the **actual** `POST /api/sync` request bodies" is true for the bodies the listener sees, but the listener is attached after all warm-up interaction. My independent capture from session start closes the gap and confirms the claim.
4. **§8.2's "transactional replace"** coverage is real but, being PGlite-backed, cannot speak to concurrency; the report does not claim otherwise, and no concurrency claim was made. MEDIUM-1 is genuinely new territory rather than a contradicted claim.

Nothing in the report was found to be fabricated. Everything I could re-run reproduced.

---

## 8. Unexecuted real-device checks

Nothing was run on a physical iPhone installed PWA. Still unverified on device, and not substitutable by the 390×844 emulation above:

- real touch ergonomics of the checklist rows and the routine-management form;
- perceived latency of the controlled checkbox on device hardware (measured 8.9 ms to committed in desktop Chromium; iOS Safari + real IndexedDB may differ);
- visual weight of the card above the first `ExerciseCard`, and safe-area behaviour with the card present;
- a genuine iOS process kill and relaunch (the Playwright equivalent — a new browser process against a persisted profile — passed);
- iOS storage-eviction behaviour mid-session.

Also not exercised: the association editor under a genuine two-device concurrent edit on real hardware (reproduced here over loopback HTTP instead).

---

## 9. Recommended remediation

1. **MEDIUM-1** — map the association path's SQLSTATEs the way every peer service does: catch `23505` and `23503` in `setTemplateWarmupRoutines` and raise a typed conflict error, mapped by the route to `409` (retryable) rather than an unhandled 500. Optionally serialise the transaction by locking the template row first (`SELECT … FROM workout_templates WHERE id = $1 FOR UPDATE`), which removes the race outright and also fixes LOW-1.
2. **MEDIUM-2** — add `src/app/api/templates/[id]/warmup-routines/route.ts` and `src/app/(app)/warmup-routines/**` to `WARMUP_ROOTS` and to `isWarmupModule`; better, derive both from a glob so a future warm-up file cannot be silently uncovered. Consider a guard test asserting that every path matching `**/*warmup*` under `src/` is either a root or an explicitly listed carve-out.
3. **LOW-2** — correct §12's reproduction to "the worktree copy is the only CRLF file in the tree; content is identical to `HEAD` after normalising line endings".
4. **LOW-4** — optional: normalise the uniqueness index to `lower(btrim(name))`, or note that the service trusts pre-parsed input.

None of these require schema changes, and none touch the sync contract.

---

## 10. Verdict

**`READY FOR REMEDIATION`**

Every load-bearing guarantee in the addendum holds and was re-established independently: the M:N model with a database-enforced single default, curated-only switching, an unchanged one-tap start, device-local-only execution state that survives reload and process kill and dies at completion, no warm-up fact anywhere in PostgreSQL or on the wire, unchanged progression and volume, legacy-cache tolerance on both cache layers, and byte-identical review-gated files and migrations. The full gates pass on a clean disposable PostgreSQL 16 and a production build.

It is not a clean pass because two reproducible defects remain: an unhandled 500 on a reachable concurrent write path that every peer service in the repo handles, and a proven false negative in the very test that guards against the evaluation's named scope-creep risk. Both are small and neither is device-observable — if the owner prefers, real-device acceptance (§8) can proceed in parallel with the remediation, since nothing in §9 changes phone behaviour.

---

## 11. Cleanup and final working-tree state

**Temporary artifacts created and removed:**

- `tests/unit/zzReviewWarmupLifecycle.test.ts`, `tests/unit/zzReviewWarmupEquivalence.test.ts`, `tests/integration/zzReviewWarmupToday.integration.test.ts`, `tests/integration/zzReviewWarmupEquivalenceB.integration.test.ts`, `tests/integration/zzReviewWarmupConcurrency*.integration.test.ts`, `tests/e2e/zzReviewWarmup.spec.ts` — all **deleted**.
- `.review-scratch/` (raw two-connection probe scripts, file backups) — **deleted**.
- `test-results/`, `playwright-report/` — **deleted**.
- `/tmp/probe.sql`, `/tmp/probe2.sql` inside the `gym-app-db-1` container — **deleted**.

**Negative-control edits, all restored byte-identically (sha256 verified):**

| File | sha256 before and after |
|---|---|
| `src/app/api/templates/[id]/warmup-routines/route.ts` | `a04ce4c78b079556a0c9d612477f7b7b69a9a10aa71ccffa6bf1a67679fc9cba` |
| `src/app/(app)/warmup-routines/new/page.tsx` | `1d93be2ff3a8b33b0aa98370e411228f570a78809bd424f6acb2333f120b2469` |
| `src/server/warmupRoutines/service.ts` | `499bc52b4e3cb6330b72b540dfaaaeb7e75a78a5bfd59265932d9618e2c78d13` |
| `src/ui/workout/WarmupCard.tsx` | `6c7e22aca927e07df76b7e86a29c83129ecbcf266b4cb5d14d6dbfb9fc821554` |
| `src/domain/volume/aggregate.ts` | `fdceba03e895eefe9b72c5260b85004b9d85ffa9a4af27a65ba660e5caf54eae` |

**Databases:** `wu_review`, `wu_conc` and `wu_e2e` were created on the local Docker PostgreSQL 16 and have all been **dropped**. Remaining: `gymapp` (dev, untouched — 0 warm-up rows before and after) and `gymapp_warmup_e2e` (left by the implementation task as its own evidence; not mine to remove). **Production was never contacted.** Nothing was committed, pushed or deployed. The production server started for E2E was stopped.

**Final tree:** a full sha256 sweep of all 520 files (excluding `node_modules`, `.git`, `.next`) against the snapshot taken before this review shows **519 of 520 byte-identical**. The single difference is `public/sw.js`, which is **gitignored build output** (`.gitignore:34`) regenerated by the `pnpm build` this review was required to run; `git status` reports no change for it.

`git status --porcelain` is identical to the state at review start — the same 13 modified/deleted entries and the same untracked set, plus this file. `docs/reviews/warmup-routines-architecture-evaluation.md`, `docs/reviews/warmup-routines-implementation.md`, `docs/input/product-ideas.md`, `CLAUDE.md`, `HANDOFF*`, `gpt-*.md` and `.claude/skills/` were not modified. No source, migration, or backlog file was changed by this review.
