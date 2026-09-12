# Workout prescription context (PI-018): implementation

**Date:** 2026-09-11
**Tree:** `cb33264` (dirty — concurrent, untouched: `CLAUDE.md`, `HANDOFF.md` (deleted), `README.md`,
`docs/evidence/*`, `docs/research-notes/*`, `playwright.config.ts`, `tests/e2e/seed.ts`, and the
untracked `.claude/skills/`, `docs/process/`, `docs/reviews/repository-agent-workflow-*.md`,
`docs/reviews/exercise-catalog-expansion-closeout.md`,
`docs/reviews/warmup-routines-evidence-research.md`, `gpt-*.md`, `HANDOFF(depracted).md`).
Three further untracked files appeared **during** this session from concurrent work and were left
alone: `docs/research/The Reactive Training Manual…pdf`,
`docs/reviews/set-groups-architecture-evaluation.md` and
`docs/reviews/set-groups-strength-evidence-research.md`.)
**Role:** implementation (builds from the spec; writes this report)
**Session:** `O5-1M | PI-018 | Implementation — Workout Prescription Context`
**Model:** claude-opus-5 (1M context)
**Task/gate:** the gate raised by
[workout-prescription-context-architecture-review.md](workout-prescription-context-architecture-review.md)
(`APPROVED — READY FOR PI-018 IMPLEMENTATION`, five LOW findings to apply or consciously accept)
**Spec:** [workout-prescription-context-architecture-evaluation.md](workout-prescription-context-architecture-evaluation.md)
(cited below as "the evaluation"); its §10 acceptance matrix is the verification pointer
**Authorization boundary:** implementation, local disposable database, local production build and
local Playwright only. **No production access. No staging. No commit, no push, no deployment, no
tag.** No claim of deployment or owner device acceptance is made anywhere in this report.
**Cites:** [agent-workflow.md](../process/agent-workflow.md) §2/§5/§6/§7/§9/§10; the evaluation
§3/§4/§5/§6/§7/§8/§9/§10/§13/§14; the review §4 (L-1…L-5) and §5

**Verdict: implemented and locally verified. `READY FOR INDEPENDENT PI-018 IMPLEMENTATION REVIEW`.**

> **Remediation appended 2026-09-12 — see [§14](#14-remediation-2026-09-12--implementation-review-findings-f-1f-5).**
> The independent [implementation review](workout-prescription-context-implementation-review.md)
> returned `VERIFIED — READY FOR PI-018 DEPLOYMENT` with five LOW findings. §14 records their
> dispositions, the new NC-R2 evidence, and the corrections made **in place** in §2 (file counts),
> §3 (the L-5 row), §4 (the `today/service.ts` citation and a revision note), §8 (the L-5 table) and
> §11 (the fixture-row residue declaration). Sections 1 and 5–13 are otherwise as originally written.

---

## 1. What was built

The two prescription instructions now travel from the program definition into the frozen session
snapshot and onto the workout card:

- **Prescribed rest** joins the card's existing prescription subtitle —
  `3 × 5 @ RIR 1-2 · Rest 2:30`. `restSeconds` has been in the snapshot since Phase 3, so this half
  is a pure render change.
- **Prescription notes** render as a labelled, read-only `Program note: …` block, a full-width
  sibling of the header row, structurally and visually distinct from the editable session-notes
  textarea below it.
- Both are frozen **per prescription slot** at `startSession`, so they survive offline start,
  reload/resume, sync and adoption, and a later program edit cannot reach a running workout.
- Legacy snapshots keep what they have. Nothing reconstructs an absent note from current program
  data; a session straddling the deploy correctly shows **rest but no note**.
- Duplicate slots of the same exercise keep their own instructions.

The change is classified, and evidenced, as a **sync-contract change** (§5). The review noted this is
not even arguable: `src/sync/types.ts` and `src/sync/activeSession.ts` are both in the manifest, and
the change-class matrix keys on path.

---

## 2. Manifest — what actually changed

**Seven source/config files** (six under `src/`, plus `package.json`) and **nine test files**
(six extended, three new), plus the documentation in §7. No schema file, no migration, no snapshot
version bump, no sync payload key, no `DB_VERSION` bump.

Counted against `git status --porcelain -- src tests package.json`, excluding `tests/e2e/seed.ts`,
which is concurrent work this task did not touch (§8). The §2 tables below enumerate exactly these
files; the table in "Source and config" has eight rows because its last row is the `docs/**` pointer
to §7, which is not a source file.

### Source and config

| # | File | Change | Spec |
|---|---|---|---|
| 1 | [`src/domain/schemas/prescriptionSnapshot.ts`](../../src/domain/schemas/prescriptionSnapshot.ts) | `prescriptionSnapshotDataSchema` gains `prescriptionNotes: z.string().max(2000).nullable().optional()`. No `.trim()` (a transform would rewrite historical values on read). `PRESCRIPTION_SNAPSHOT_VERSION` untouched at 1. Comment records the additive-optional precedent and the R-B strip hazard. | §8 file 1, §3.3 |
| 2 | [`src/domain/measurement/format.ts`](../../src/domain/measurement/format.ts) | New exported `formatRestSeconds(restSeconds: number): string`, `minutesSecondsLabel(…) ?? \`${n} s\``. Clock-only, deliberately not `formatDurationS`'s dual form. | §8 file 3, §5.1 |
| 3 | [`src/server/today/service.ts`](../../src/server/today/service.ts) | `TodayBundleExerciseEntry` gains **required** `prescriptionNotes: string \| null`; the entry is populated `prescriptionNotes: p.notes` — read per prescription row, **not** routed through `buildPrescriptionSnapshotData`. | §8 file 4, **review L-1** |
| 4 | [`src/sync/types.ts`](../../src/sync/types.ts) | `TodayBundleExerciseEntryDto` gains **optional** `prescriptionNotes?: string \| null`, with the R-1 cached-bundle tolerance comment. | §8 file 5, §4 |
| 5 | [`src/sync/activeSession.ts`](../../src/sync/activeSession.ts) | `buildSnapshotFromBundleEntry` gains `prescriptionNotes: entry.prescriptionNotes ?? null` — the single freeze site. `normalizeActiveSession` **unchanged**. | §8 file 6, §6, §7 C-2/C-3 |
| 6 | [`src/ui/workout/ExerciseCard.tsx`](../../src/ui/workout/ExerciseCard.tsx) | Reads `restSeconds`/`prescriptionNotes` beside the existing `scheme`/`targetRir` reads; appends the rest clause inside the existing `{scheme && …}` subtitle guard; adds the `Program note:` block between the header row and the recommendation card (outside both `!exercise.skipped` guards); imports `formatRestSeconds`. | §8 file 7, §5 |
| 7 | `package.json` | `test:e2e:offline` gains `tests/e2e/workoutPrescriptionContext.spec.ts`. | §8 file 8 |
| 8 | `docs/**` | §7 of this report. | §8 file 9, §9 |

**`src/domain/prescriptions/buildSnapshot.ts` was NOT changed** — §8 file 2 was dropped per review
L-1. See §3.

**Not changed, as specified:** `src/db/schema/**`, `drizzle/**`, `src/domain/sync/schema.ts`,
`SESSION_EXERCISE_FIELDS`, `src/sync/db.ts`, `src/server/sync/service.ts`, `src/ui/history/**`,
`src/server/history/service.ts`, `src/ui/prescriptions/**`. `playwright.config.ts` and
`tests/e2e/seed.ts` carry concurrent uncommitted edits and were **not touched** (verified in §8).

### Tests

| File | Status | Covers |
|---|---|---|
| [`tests/unit/prescriptionSnapshot.test.ts`](../../tests/unit/prescriptionSnapshot.test.ts) | extended (+7 cases) | U-1 |
| [`tests/unit/measurement/format.test.ts`](../../tests/unit/measurement/format.test.ts) | extended (+4 cases) | U-5 |
| [`tests/unit/activeSessionPayloads.test.ts`](../../tests/unit/activeSessionPayloads.test.ts) | extended (+2 cases) | U-3 |
| [`tests/unit/sync/rollbackCompatibility.test.ts`](../../tests/unit/sync/rollbackCompatibility.test.ts) | extended (+3 cases) | U-4 |
| `tests/unit/workout/prescriptionContextCard.test.ts` | **new** (10 cases) | U-6 (a)–(f) + 4 more |
| `tests/unit/prescriptionContextActiveSession.test.ts` | **new** (6 cases) | U-7, C-2/C-3/C-6 |
| [`tests/integration/today.integration.test.ts`](../../tests/integration/today.integration.test.ts) | extended (+3 cases) | I-1 |
| [`tests/integration/sync.integration.test.ts`](../../tests/integration/sync.integration.test.ts) | extended (+2 cases) | I-2, NC-3, C-1 |
| `tests/e2e/workoutPrescriptionContext.spec.ts` | **new** (2 tests) | E-1…E-6 |

`git diff --stat` over the implementation paths (excluding the two concurrent files, which appear
only because they were already dirty):

```text
 package.json                                  |   2 +-
 src/domain/measurement/format.ts              |  16 +++
 src/domain/schemas/prescriptionSnapshot.ts    |  24 +++++
 src/server/today/service.ts                   |  24 +++++
 src/sync/activeSession.ts                     |   9 ++
 src/sync/types.ts                             |  14 +++
 src/ui/workout/ExerciseCard.tsx               |  55 +++++++++-
 tests/integration/sync.integration.test.ts    | 140 +++++++++++++++++++++++++
 tests/integration/today.integration.test.ts   | 143 ++++++++++++++++++++++++++
 tests/unit/activeSessionPayloads.test.ts      |  84 +++++++++++++++
 tests/unit/measurement/format.test.ts         |  36 ++++++-
 tests/unit/prescriptionSnapshot.test.ts       |  78 ++++++++++++++
 tests/unit/sync/rollbackCompatibility.test.ts | 117 +++++++++++++++++++++
```

---

## 3. Low-finding dispositions (review §4)

All five **applied**. None deferred.

| ID | Disposition | What was done |
|---|---|---|
| **L-1** | **Applied** (the only one touching source) | `notes` does **not** pass through `buildPrescriptionSnapshotData`. `buildSnapshot.ts` and `SnapshotPrescription` are untouched; the bundle entry is populated `prescriptionNotes: p.notes` directly at [`today/service.ts`](../../src/server/today/service.ts) beside the existing `restSeconds` line, with a comment recording the `measurement` precedent (carried fields bypass the builder). **U-2's notes half was not written** — per L-1 it would have tested a pass-through the design itself introduced, not a property of the system. U-2's existing week-modifier cases are untouched and still pass; no modifier test was removed. Modifier independence is instead covered where it is real: the note never enters the builder at all, and `tests/unit/buildSnapshot.test.ts` still proves the builder's own modifier behaviour unchanged. |
| **L-2** | **Applied** | The required/optional asymmetry stands; the **rationale** in the code comment is H-10's actual scope, not the defaults argument: H-10 constrains the client mirror only and says nothing about the server type, so required-on-server is H-10-compliant, is the dominant shape on `TodayBundleExerciseEntry` (`restSeconds`, `appliedModifiers`, `prefill` are all required), and makes a forgotten population site a compile error. The defaults argument is not repeated. |
| **L-3** | **Applied** | Recorded in §4 of this report: the three `safeParse` read sites (`server/today/service.ts` `parseHistoryPrescribed`, `server/blocks/service.ts` `extractSnapshotExerciseName`, `server/progression/service.ts` `parseSnapshot`) are named, each confirmed a read-only projection, and `progression/service.ts`'s parsed-object return is flagged as the one shape that would drop the key if anything ever wrote it back. |
| **L-4** | **Applied, both keys** | [`domain-model.md`](../architecture/domain-model.md) §6's sketch gained **`measurement?` as well as `prescriptionNotes?`** — the sketch was already stale for `measurement`, and the same one-line edit fixes both. A following paragraph states both are additive-optional on `v: 1`. |
| **L-5** | **Applied** | The three citation drifts are corrected in §8 of this report against `cb33264`: the card's snapshot reads are at `ExerciseCard.tsx:222-223`; the "Add notes" block is `:486-506` (corrected again in remediation §14 F-3 — the figure first recorded here, `:485-503`, had been copied from the architecture review rather than re-derived); `zod` is installed at **3.25.76** (declared `^3.24.1`). The independent review file itself is **unchanged** (§8). |

Nothing in the evaluation was silently overridden: every deviation is in §6.

---

## 4. L-3 — the read paths that `safeParse` a stored snapshot

The evaluation's C-4 named two cast sites. Three other server read paths do parse a stored snapshot,
and a reviewer checking C-4 by grep will find them.

**Line numbers below are on the DELIVERED tree**, not at `cb33264`. `today/service.ts` is one of the
files this change edits: it gains 18 lines above `parseHistoryPrescribed`, which therefore moves from
`:240` (function) / `:244` (`safeParse`) at `HEAD` to `:258` / `:262` as delivered. The other two
sites are in files this change does not touch, so their numbers are identical at both revisions
(verified with `git show cb33264:… | grep -n` against the working tree, not by adding an offset).

| Site | What it does | Effect of the new key |
|---|---|---|
| `src/server/today/service.ts:262` `parseHistoryPrescribed` (function at `:258`) | projects `{scheme, targetRir}` | none — discards the parsed object; schema is non-strict and the key is optional |
| `src/server/blocks/service.ts:635` `extractSnapshotExerciseName` | projects `exerciseName` | none — same |
| `src/server/progression/service.ts:113` `parseSnapshot` | **returns `parsed.data.snapshot`** | none today, because no caller writes it back. This is the one shape that would drop `prescriptionNotes` the day anything persists a parsed snapshot — worth a comment if that ever changes. |

C-4's conclusion holds: nothing on any read path rewrites a stored snapshot. `today/service.ts:418`
and `history/service.ts:217` remain casts. The integration case in §5 (I-2 / C-1) pins the storage
half of this directly rather than by inspection.

---

## 5. Acceptance mapping (evaluation §10)

Every row is mapped to the test that carries it. Counts and exit codes are in §6.

### Unit

| ID | Where it landed | Assertions |
|---|---|---|
| **U-1** | `tests/unit/prescriptionSnapshot.test.ts`, new describe block + the extended `:99` envelope case | no-key snapshot parses and stays `undefined`; a note round-trips **with its own line breaks**; surrounding whitespace survives byte-identical (proves no `.trim()` transform); `null` accepted; 2000 chars accepted, 2001 rejected; non-string rejected; `v` still 1 and a v1 envelope carrying a note parses |
| **U-2** | **notes half intentionally not written (L-1)** | the builder never sees `notes`; its existing modifier cases are untouched and green |
| **U-3** | `tests/unit/activeSessionPayloads.test.ts` | `buildSessionExerciseUpsertPayload` returns a payload still carrying `prescription.snapshot.prescriptionNotes` (and `restSeconds`); the payload's own `.strict()` key set is unchanged (`"prescriptionNotes" in payload === false`); an explicit `null` keeps the key rather than dropping it |
| **U-4** | `tests/unit/sync/rollbackCompatibility.test.ts` | against a **frozen** pre-feature copy of the snapshot schema (not imported from the live module): the op **parses**, the note is **stripped**, `restSeconds` and `skipped` survive — a rollback degrades, it does not dead-letter; and the same payload parses against the live schema with the note intact |
| **U-5** | `tests/unit/measurement/format.test.ts` | 1→`1 s`, 45→`45 s`, 59→`59 s`, 60→`1:00`, 61→`1:01`, 90→`1:30`, 150→`2:30`, 3599→`59:59`, 3600→`60:00`; plus "never the dual form" (no `·`) |
| **U-6** | `tests/unit/workout/prescriptionContextCard.test.ts` (new, `renderToStaticMarkup` + `createElement`, the `uiFormatWiring.test.ts` precedent) | (a) both render, `Program note` present and **not** inside the subtitle; (b) both null → **no stray `·`, no "Rest", no `—`**, scoped to the subtitle element; (c) legacy snapshot literal with the key **deleted** → rest renders, note does not; (d) ad-hoc `prescription: null` → neither; (e) independence — both texts present, the textarea's value is `"session text"` only, and the note renders in a muted `<span>` prefix, not a control; (f) skipped slot shows both. Plus: whitespace-only → nothing; multiline breaks reach the DOM and `whitespace-pre-wrap`/`break-words` are present; note text is **HTML-escaped**; sub-minute rest renders `· Rest 45 s` |
| **U-7** | `tests/unit/prescriptionContextActiveSession.test.ts` (new, real `fake-indexeddb`, real mutators) | live entry freezes verbatim and survives a reload out of IndexedDB; **C-2** — an entry with the key `delete`d starts without throwing and freezes `toBeNull()` **strictly** (this is what makes NC-2 discriminate), while **C-3** the frozen snapshot still *carries* the key; explicit null freezes null; **C-6** two slots of the same `exerciseId` get two rows with their own note and rest; the note reaches the outbox op inside `prescription` with no new top-level key; a later program edit (the source entry mutated in place) cannot change the frozen values, and a session note written meanwhile stays its own field |

### Integration (PGlite — see §6 deviation D-1)

| ID | Where | Assertions |
|---|---|---|
| **I-1** | `tests/integration/today.integration.test.ts`, 3 new cases | the bundle entry carries `exercise_prescriptions.notes` **verbatim** (line breaks intact) with `restSeconds`; a prescription with no notes yields **`null`**; **C-6** two prescriptions of the same `exerciseId` in one template produce two entries with distinct `prescriptionId`, notes and rest |
| **I-2** | `tests/integration/sync.integration.test.ts`, 2 new cases | a `sessionExercise` upsert persists `prescriptionNotes` verbatim into `session_exercises.prescription`; **NC-3** a byte-for-byte replay is idempotent; a later program edit does not touch the stored snapshot; a later update op smuggling a *different* snapshot is ignored while `skipped:true` applies; the create op replayed once more after that still changes nothing. Plus **C-1**: a snapshot frozen *without* the key persists with the key **still absent**, while `restSeconds` is still there |

### E2E (`tests/e2e/workoutPrescriptionContext.spec.ts`, added to `test:e2e:offline`)

Two tests. Isolation: the shared seeded prescription is never mutated — each test creates its own
exercises and template, points the shared block's schedule at it, and restores in `finally`
(Playwright is `workers: 1, fullyParallel: false`). Fixture: slot 0 bench with rest 150 s and a
**multiline note containing a long unbroken token**, slot 1 the **same exercise** with rest 45 s and
a different note, slot 2 a different exercise with **neither**.

| ID | Where | Assertions |
|---|---|---|
| **E-1** | test 1 | card 0 shows `· Rest 2:30` + its own note; card 1 shows `· Rest 45 s` + its own note; neither shows the other's note or rest |
| **E-4** | test 1 | `PATCH /api/prescriptions/{id}` mid-session changes rest and notes; **a positive witness re-reads the route and asserts the program really changed**; after `page.reload()` the card still shows the original frozen values and never the rewritten text. Also: the instructions stay visible after **Skip** |
| **E-5** | test 1 | a session note typed into the textarea persists, the program note is unchanged, the textarea holds only the session note, and both survive the reload independently |
| **E-6** | test 1 | the bare slot's subtitle is **exactly** `3 × 5` (`toHaveText`) — the "no stray separator" assertion, scoped to the subtitle element per the review's §5 caution — and no `Program note` block exists. Plus `document.documentElement.scrollWidth <= 390`, so the long token does not widen the page |
| **E-2** | test 2 | genuine cold offline launch (`chromium.launchPersistentContext` + `OFFLINE_RESOLVER_ARG`) after warming the bundle online under SW control; **an explicit offline proof runs first** — a `fetch("/api/history")` (NetworkOnly) must fail, so the test cannot pass by being served live; then the workout is **started offline** and all three cards render correctly from the cached bundle |
| **E-3** | test 2 | an offline `page.reload()` re-hydrates from IndexedDB with the instructions intact; a third online launch drains the outbox with **no dead letters** and the frozen values still render after the session round-tripped through the server |

True legacy (a snapshot frozen by a pre-deploy build) is not reproducible in one E2E run and is
covered by U-1 / U-6(c) / U-7 / the I-2 C-1 case — stated so E-6 is not read as the legacy proof.

---

## 6. Verification — commands, exit codes, counts

E-level gates, run on the **final tree** (the tree is byte-identical to the one this report
describes; every negative-control mutation was restored and verified before these runs).

### Static gates

| Command | Exit | Result |
|---|---|---|
| `pnpm lint` | **0** | `eslint .` — no errors, no warnings |
| `pnpm typecheck` | **0** | `tsc --noEmit` |
| `pnpm typecheck:sw` | **0** | `tsc -p tsconfig.worker.json --noEmit` |
| `pnpm format:check` | **0** | `prettier --check .` — "All matched files use Prettier code style!" |
| `pnpm build` | **0** | production Next.js build |

`format:check` passed cleanly on the whole repository. Note for the reviewer: the five files this
task created or extended did initially fail `format:check` and were fixed with
`pnpm exec prettier --write` on those five paths only (exit 0); no pre-existing CRLF failure was
observed on this tree. `docs/` is in `.prettierignore`, so `format:check` is **not** evidence for any
documentation file in §7.

### Suites

| Command | Exit | Result |
|---|---|---|
| `pnpm test:unit` | **0** | **86 files, 1241 tests passed** |
| `pnpm test:integration` | **0** | **28 files passed, 6 skipped (gated concurrency); 472 passed, 17 skipped** |
| `pnpm test:e2e` | **0** | **156 passed** (2.9 min), on a freshly created and bootstrapped database |

`pnpm test:e2e` is the load-bearing gate for this change class and is quoted here in full rather
than as a subset. The new spec is also in `test:e2e:offline`, so CI's `offline-e2e` job will run it.

### E2E bootstrap actually executed (agent-workflow §7 order, re-derived from `ci.yml`)

Against the disposable database `gymapp_t_prescriptioncontext` on the local Docker PostgreSQL 16
(`gym-app-db-1`), never the dev `gymapp` database and never production:

| Step | Command | Exit |
|---|---|---|
| create | `docker exec gym-app-db-1 psql -U gymapp -d postgres -c "CREATE DATABASE gymapp_t_prescriptioncontext;"` | 0 |
| migrate | `pnpm db:migrate` (with `DATABASE_URL` pointed at it) | 0 |
| seed 1 | `pnpm db:seed` | 0 |
| build | `pnpm build` | 0 |
| start | `pnpm start`, backgrounded; `/api/health` → **200** | 0 |
| account | `pnpm exec playwright test tests/e2e/smoke.spec.ts` | 0 (1 passed) |
| seed 2 | `pnpm db:seed` (imports this account's exercise catalog) | 0 |
| fixture | `pnpm tsx tests/e2e/seed.ts` | 0 |
| suite | `pnpm test:e2e` | 0 (156 passed) |

### One honest failure and its cause — quoted, not hidden

The **first** full `pnpm test:e2e` attempt failed: **20 failed, 136 passed, exit 1**, every failure
`Error: DATABASE_URL is not set` at `src/db/client.ts:18`. Cause: specs that seed directly through
`getDb()` need `DATABASE_URL` in the **Playwright process** environment, and my backgrounded shell
had set it only for the server. This is an operator error in my invocation, not a defect.

A **second** attempt with the variable set reached **155 passed, 1 failed** — the failure being
`offline-bodyweight-recovery.spec.ts:282` (PI-007's C-5 no-metric dead-letter case), whose
`Offline — can't verify today's check-in yet` banner never appeared. That spec passed **13/13 in
isolation** immediately afterwards (exit 0). Diagnosis: the first, mis-configured run had already
written same-day recovery state into the database, which is exactly the precondition C-5 depends on
not existing. The database was therefore **dropped and recreated**, the whole §7 bootstrap re-run
from clean, and the full suite re-run: **156 passed, exit 0**.

Stated plainly for the reviewer: the quoted E-level `pnpm test:e2e` result is the clean-database run.
The intermediate failure was environmental and is reproducible only by polluting the database first;
nothing in this change touches the recovery check-in path. I did **not** additionally prove this by
running the full suite against a stashed (pre-change) tree — that is the one piece of corroboration
not gathered, and a reviewer wanting it should re-run the clean bootstrap rather than trust the
diagnosis.

### Negative controls (agent-workflow §6)

Exact original bytes saved to the session scratchpad before each mutation, restored afterwards, and
byte-for-byte restoration verified with a buffer compare and a SHA-256 — never `git checkout`, which
cannot reproduce uncommitted work or line-ending state.

| Control | Command | Expected | Observed | Restored |
|---|---|---|---|---|
| **NC-1** — remove only the Zod key from `prescriptionSnapshotDataSchema` | `pnpm exec vitest run --config vitest.config.ts tests/unit/activeSessionPayloads.test.ts` | U-3 fails | **fails, exit 1** — 2 failed / 18 passed; both new cases fail, the second on `toHaveProperty("prescriptionNotes")`. The strip hazard is real and U-3 discriminates | `identical`, sha256 `0d0b0908…f099b0d0`, 5267 bytes |
| **NC-2** — revert `?? null` to bare `entry.prescriptionNotes` at the freeze site | `pnpm exec vitest run --config vitest.config.ts tests/unit/prescriptionContextActiveSession.test.ts` | U-7 fails, and only because it asserts `toBeNull()` | **fails, exit 1** — 1 failed / 5 passed, on the C-2 `toBeNull()` line (`undefined` frozen). A `toBeFalsy()` there would have passed, so the strict form is what makes this control non-vacuous | `identical`, sha256 `36b99513…e408fd3e`, 38222 bytes |
| **NC-3** — replay the create op twice, then an update op, then the create op again | `pnpm test:integration` (executed inside the I-2 case) | the frozen note identical after every step | **passes** — the note and the whole snapshot are `toEqual(originalSnapshot)` after replay, after a real `updatePrescription`, after a snapshot-smuggling update, and after a further replay | n/a (no source mutated) |
| **NC-4** — remove the freeze from the card: make `ExerciseCard` render the two fields from a live `GET /api/today-bundle` | rebuild, restart, `pnpm exec playwright test tests/e2e/workoutPrescriptionContext.spec.ts -g "E-1/E-4"` | E-4 fails | **fails, exit 1.** First attempt matched the live entry by `exerciseId` and failed *earlier*, at the C-6 independence assertion (line 217) — itself proof that reading live data collapses duplicate slots. Re-run matching by `position` so the failure lands on E-4: failed at line 283 with the subtitle rendering **`3 × 5 · Rest 30 s`**, the rewritten program value. E-4 tests the freeze, not the absence of a refetch | `identical`, sha256 `6a755a17…2077fd08`, 36070 bytes; clean tree rebuilt and the suite re-run green afterwards |
| **NC-5** — U-5's expected values | inspection only, **not executed**, as specified | visibly differ from any pre-fix output | `formatRestSeconds` did not exist before this change, so every expected value in U-5 is new by construction | n/a |

`pnpm test:unit` and the touched specs were re-run green after every restore.

---

## 7. Documentation changes (evaluation §9)

All five items, plus the reconciliation the task required before inserting PI-018.

| # | File | Change |
|---|---|---|
| 1 | [`docs/architecture/domain-model.md`](../architecture/domain-model.md) §6 | The `PrescriptionSnapshot` sketch gains **`measurement?` and `prescriptionNotes?`** (L-4 — it was already stale for `measurement`), plus a paragraph stating both are additive-optional on `v: 1`, that `prescriptionNotes` is frozen and read-only, that it is deliberately not named `notes`, and that an absent value is never reconstructed. |
| 2 | [`docs/architecture/pwa-offline-strategy.md`](../architecture/pwa-offline-strategy.md) §4 | The `WorkoutContextBundle` sketch's effective-prescriptions line now names `restSeconds` and `prescriptionNotes`; a new paragraph records the R-1 tolerance rule generally (optional on the client mirror, absent in a pre-upgrade cached bundle, absence means "nothing to show", never backfilled) and names the Phase 5 L-4 precedent. |
| 3 | [`docs/architecture/prescription-model.md`](../architecture/prescription-model.md) §6 | A `\| notes \| O \| O \| O \| O \| O \| O \|` row below `restSeconds`, with one sentence on why the row exists. |
| 4 | [`docs/BACKLOG.md`](../BACKLOG.md) | New **PI-018** entry with an anchor, plus an index row and an allocation note. Records the accepted scope, the compatibility rules as binding, the explicit exclusions, the PI-015/PI-016 relationship (displays the existing `restSeconds`, **no competing field**, does not select PI-015 or discharge OD-05), the owner-awareness note about existing notes becoming visible, and that duplicate-slot support is **not** a PI-012 deliverable. |
| 5 | [`docs/ROADMAP.md`](../ROADMAP.md) | PI-018 inserted between PI-007 and PI-009; rows below renumbered 4→5, 5→6, 6→7. Reconciliation first (see below). |

**Reconciliation performed before inserting PI-018**, from STATUS's own recorded evidence rather
than re-certified here:

- ROADMAP row 1 (Catalog Expansion 1 closeout) and row 2 (Documentation consolidation) were still
  marked "Now" although STATUS records both closed (commit `57868e2` deployed with its
  postdeployment check and owner iPhone acceptance on 2026-09-10; the documentation review approved
  closeout on 2026-09-10 with `355e381`). Both are now **"Closed"**, with the evidence and its
  boundary (D-CE1-1(i) other-client coverage still unrecorded) carried over.
- Row 3 (PI-007) is now **"In flight"**, naming commits `c2d98c8` and `cb33264` and stating
  explicitly that deployment and owner device acceptance are separate gates **not asserted**.
- The stale "six-step order/sequence" phrasing in ROADMAP and in two BACKLOG places is now "selected
  order/sequence", since the order has seven rows.

**PI-012 and PI-017 are preserved.** Neither entry's text was altered; PI-012's ROADMAP bullet and
PI-017's ROADMAP paragraph and BACKLOG section are untouched, and the new PI-018 entry states
explicitly that it does not encroach on PI-012's scope.

**`docs/STATUS.md` was deliberately NOT edited** — release state is written by the designated
closeout editor from evidence after a release (evaluation §9), and this task has no deployment or
device-acceptance evidence to contribute. **The independent review file is unchanged** (§8).

---

## 8. Scope check — nothing else was touched

`git status --porcelain` after this task differs from before it by exactly the implementation
manifest plus this report. Specifically confirmed:

- **`playwright.config.ts` and `tests/e2e/seed.ts`** carry their concurrent uncommitted edits
  **unchanged** — both are comment-only edits about the `webServer` now running `pnpm build && pnpm
  start`, and `git diff` over them is byte-identical to its pre-task state. Neither was opened for
  writing.
- **`docs/reviews/workout-prescription-context-architecture-review.md` is unchanged**, as instructed.
  The evaluation file is also unchanged; L-2…L-5's corrections live in **this** report, not in either
  upstream document.
- **`docs/reviews/workout-prescription-context-architecture-evaluation.md`** — unchanged.
- Every other modified or untracked path (`CLAUDE.md`, `HANDOFF.md` deleted, `README.md`,
  `docs/evidence/*`, `docs/research-notes/*`, `.claude/skills/`, `docs/process/`, the
  `repository-agent-workflow-*` reports, `exercise-catalog-expansion-closeout.md`,
  `warmup-routines-evidence-research.md`, `gpt-*.md`, `HANDOFF(depracted).md`) is pre-existing
  concurrent work and was not modified. Three untracked files appeared **during** this session from
  concurrent work and were **left alone**: `docs/research/The Reactive Training Manual…pdf`,
  `docs/reviews/set-groups-architecture-evaluation.md` and
  `docs/reviews/set-groups-strength-evidence-research.md`. The last two are a separate PI-012 Set
  Groups effort; this task neither read them as input nor changed anything they cover, and PI-012's
  BACKLOG/ROADMAP text is untouched (§7).
- No `src/db/schema/**` or `drizzle/**` file changed, so `drizzle-kit` has nothing to diff — there is
  no migration in this change.

### L-5's citation corrections, verified against the tree

The evaluation was written against `cb33264` **before** any implementation edit, so the "Correct"
column below is that revision — re-derived here with `git show cb33264:<path> | grep -n`, not by
applying an offset to the working tree, and not by copying the architecture review's own figures
(two of which were themselves off by one; see the remediation section §14 F-3).

| Evaluation's citation | Correct, at `cb33264` |
|---|---|
| `ExerciseCard.tsx:221-222` (snapshot reads) | `:222-223` |
| `ExerciseCard.tsx:489-501` ("Add notes") | `:486-506` — `<div>` `:486`, `</div>` `:506`; button `:487-494`, textarea `:496-504` |
| `zod@^3.24.1` (R-B probe) | declared `^3.24.1`, **installed 3.25.76** — the strip behaviour is identical and was reproduced by the review on the installed version |

---

## 9. Deviations from the evaluation

Five, all deliberate and none changing the storage decision, the data flow, the compatibility rules
or the evidence level.

| # | Deviation | Why |
|---|---|---|
| **D-1** | **The integration tests do not use a disposable Docker database.** §10 names `gymapp_t_prescriptioncontext` for the integration tier, but `tests/integration/testDb.ts` creates a fresh, migrated **in-memory PGlite** instance per call (ADR-003, `vitest.integration.config.ts`), so no Postgres database is involved at that tier and none was created for it. The disposable `gymapp_t_prescriptioncontext` **was** created and used — for the **E2E** tier, which genuinely needs a server-backed Postgres. Net effect: the named resource exists and was dropped, just one tier over from where §10 placed it. |
| **D-2** | **§8 file 2 (`buildSnapshot.ts`) not changed, and U-2's notes half not written.** Review L-1, applied as instructed. |
| **D-3** | **E-2's offline mechanism.** §10 names `OFFLINE_RESOLVER_ARG` + `waitForServiceWorkerControl`; both are used. Added beyond the spec: an explicit in-page `fetch("/api/history")`-must-fail assertion before anything else, because the resolver arg is a launch argument and a silently ineffective one would have let E-2 pass while online. `offline: true` is deliberately **not** passed — `helpers.ts` records it as inert. |
| **D-4** | **E-4 gained a positive witness.** The spec asserts only that the card keeps the old values. Added: a read-back of `GET /api/templates/{id}/prescriptions` asserting the program really now holds the new note and rest — otherwise a silently rejected `PATCH` would make E-4 pass for the wrong reason. |
| **D-5** | **NC-4 ran twice.** The first mutation matched the live bundle entry by `exerciseId` and failed at C-6 rather than E-4. Re-run matching by `position` to land the failure on E-4 itself. Both outcomes are reported in §6 because the first is independently informative: it shows that reading live data by `exerciseId` collapses duplicate slots. |

Additional test coverage beyond §10, all additive: U-1's no-`.trim()` and non-string cases; U-5's
"never the dual form"; U-6's whitespace-only, multiline/`break-words`, HTML-escaping and
sub-minute-rest cases; U-7's outbox-op and program-edit cases; I-1's null case; I-2's C-1
absent-key-persists case; E-1's skipped-slot re-check and the `scrollWidth <= 390` check.

---

## 10. Explicitly not done

Per the owner's boundary and evaluation §12: no rest timer, countdown, auto-start, notification or
short-rest hint; no progression, prefill or recommendation change; no History presentation; no
in-workout editing of prescription notes; no backfill of existing snapshots; no app-wide redesign; no
Set Groups work. No `src/domain/prescriptions/buildSnapshot.ts` change (L-1). No
`normalizeActiveSession` change. No `docs/STATUS.md` edit. **No commit, no push, no tag, no
deployment, no staging, no production access of any kind. No owner device acceptance is claimed or
implied** — Chromium E2E is not real iOS Safari, and that gate has no agent substitute.

---

## 11. Disposable resources — drop what you created, list what you did not

**Created and dropped:**

- PostgreSQL database **`gymapp_t_prescriptioncontext`** on the local Docker instance
  `gym-app-db-1` — created, migrated, seeded, dropped and recreated once (to get a clean run), and
  **dropped at the end**. Verified absent; see the drop command and the post-drop listing in §12.
- One backgrounded local `pnpm start` production server on `:3000` — **stopped**; nothing is
  listening on the port.
- Three throwaway byte-backup files in the session scratchpad (`nc1.orig`, `nc2.orig`, `nc4.orig`) —
  each deleted immediately after its restoration was verified.
- Playwright `test-results/` artifacts (traces and error contexts) from the deliberately-failing
  NC-4 runs and the two mis-configured E2E attempts — removed. `test-results/` is gitignored.
- Temporary Chromium profile directories under the OS temp dir, created by the persistent-context
  E2E test — removed by the spec's own `fs.rmSync` in `finally`.

**Left behind, deliberately:**

- **The E2E fixture rows the spec creates, declared in full** per agent-workflow §10. Each suite run
  of `workoutPrescriptionContext.spec.ts` creates, per test (two tests):
  - **two catalog exercises** (`createMeasurementExercise`, named `PI018 Online …` / `PI018 Offline …`)
    — **four per suite run**. There is no disposal step for these: `teardown` does not archive or
    delete them, matching the `measurementProfiles.spec.ts` precedent it was modelled on.
  - **one template with three prescriptions**, plus the session and session-exercise rows the
    workout itself writes — **two templates per suite run**. The template is **archived, not
    deleted**: there is no template DELETE route, so `POST /api/templates/{id}/archive` is the
    available disposal.

  Every one of these rows lived **only inside a disposable test database** — `gymapp_t_prescriptioncontext`
  here, a CI-fresh database in the `offline-e2e` job — and ceased to exist when that database was
  dropped (§12). **Nothing survives anywhere**, and no cleanup of them is outstanding: the dev
  `gymapp` database and production were never touched, so there is no surviving residue to chase.
  The declaration gap this closes was in the report, not in the cleanup.
- **Five pre-existing disposable databases owned by other tasks** — `gymapp_e1rm_remediation`,
  `gymapp_e1rm_verify`, `gymapp_warmup_e2e`, `gymapp_wu_rem_e2e`, `gymapp_wuconc`. These are **not
  task-owned** and were deliberately **not** dropped. The dev `gymapp` database was never connected
  to, written to, or migrated by this task.
- No production resource was created, connected to, inspected or modified — local or Azure.

---

## 12. Cleanup evidence

Quoted in §6's style so a reviewer can re-derive it. See the closing commands of this session:

| Command | Exit | Result |
|---|---|---|
| `docker exec gym-app-db-1 psql -U gymapp -d postgres -c "DROP DATABASE IF EXISTS gymapp_t_prescriptioncontext;"` | 0 | `DROP DATABASE` |
| `docker exec gym-app-db-1 psql -U gymapp -d postgres -At -c "SELECT datname FROM pg_database WHERE datname LIKE 'gymapp%' ORDER BY 1;"` | 0 | the five other tasks' databases plus `gymapp` — `gymapp_t_prescriptioncontext` **absent** |
| `Get-NetTCPConnection -LocalPort 3000 -State Listen` | 0 | nothing listening |

---

## 13. What a reviewer should check first

1. **The strip hazard is really closed** — revert §2 file 1's one Zod line and confirm
   `tests/unit/activeSessionPayloads.test.ts` fails (NC-1's exact result).
2. **No reconstruction anywhere** — grep the execution path for any read of `exercisePrescriptions`.
   There should be none, and `ExerciseCard` should read only `exercise.prescription?.snapshot.*`.
3. **L-1 was applied, not half-applied** — `git diff src/domain/prescriptions/buildSnapshot.ts` must
   be empty, and `today/service.ts` must set `prescriptionNotes: p.notes` directly.
4. **The `?? null` at the single freeze site**, and that U-7 asserts `toBeNull()` rather than
   anything looser (NC-2 is vacuous otherwise).
5. **§6's honest E2E history** — the clean-database run is the evidence; the intermediate failure was
   environmental, and the one corroboration not gathered is a full-suite run on a stashed tree.
6. **Required-on-server / optional-on-client** is intact in both mirrors, with L-2's rationale.

---

## 14. Remediation 2026-09-12 — implementation-review findings F-1…F-5

**Date:** 2026-09-12
**Role:** bounded remediation (implementer's own session, per
[agent-workflow.md §2](../process/agent-workflow.md#2-roles-and-independence) — fixes only the listed
finding IDs and appends to this report rather than rewriting it)
**Session:** `O5-1M | PI-018 | Remediation — Workout Prescription Context Implementation`
**Gate consumed:** [workout-prescription-context-implementation-review.md](workout-prescription-context-implementation-review.md)
— `VERIFIED — READY FOR PI-018 DEPLOYMENT`, five LOW findings, none blocking
**Release state at the time of this remediation:** **no release had occurred.** `git log` still ends
at `cb33264` and the entire PI-018 change set is uncommitted, so this closes the findings *before*
release rather than as a follow-up. Nothing was undone.
**Authorization boundary:** unchanged and unused — no production access, no staging, no commit, no
push, no tag, no deployment.

### 14.1 Finding dispositions

| ID | Disposition | Change |
|---|---|---|
| **F-1** | **Fixed** | `docs/BACKLOG.md` — deleted the duplicated `selected`. |
| **F-2** | **Fixed** | `tests/integration/sync.integration.test.ts` — read-back between step 4 and step 5; proved discriminating by NC-R2 (§14.3). |
| **F-3** | **Fixed (report only)** | Citations re-derived and corrected in §4 and §8, with an explicit historical-vs-delivered note. |
| **F-4** | **Recorded, no change** | The review found the ROADMAP reconciliation **accurate**; no correctness fix required. See §14.5. |
| **F-5** | **Fixed (report only)** | §2 file counts corrected; §11 residue declaration now covers the fixture exercises. |

The review's §6 "optional advice — no correction required" items (a comment beside the `.max(2000)`
schema key; NC-4's landing point; `progression/service.ts:113`) were **consciously not actioned** —
this remediation is bounded to F-1…F-5, and all three are already recorded where a later reader will
meet them.

### 14.2 F-1 — the duplicated word

`docs/BACKLOG.md` read `…; the selected` / `selected order is unchanged.` across lines 32–33, because
the original "six-step order" substitution landed after a line already ending in "selected". One word
deleted; the sentence now reads "…; the selected order is unchanged."

| Check | Command | Exit | Result |
|---|---|---|---|
| the fix | `awk` over `docs/BACKLOG.md:31-34` | 0 | `the selected` / `order is unchanged.` — single `selected` |
| no other doubled word | `grep -nEo '\b([a-zA-Z]+) \1\b' docs/BACKLOG.md docs/ROADMAP.md` | 1 (no match) | none |
| scope | `git diff -- docs/BACKLOG.md` | 0 | the only line this remediation changes is `six-step order is unchanged.` → `order is unchanged.` |

**PI-012 and PI-017 preserved.** Every other PI-012/PI-017 line in `git diff -- docs/BACKLOG.md`
(the Set Groups V1 rewrite, the PI-012 index row, the whole PI-017 section, the PI-013 "selected
sequence" line) is concurrent work that predates this task; none was touched here. `docs/ROADMAP.md`
was not opened — its mtime is still `2026-09-11T23:28`.

### 14.3 F-2 — the new I-2 case now discriminates, proved by NC-R2

**The defect.** Step 4 applied the smuggling update op and asserted only `updated.applied`; the row
was first read *after* step 5 replayed the original create op. On a broken update path that replay
writes `originalSnapshot` straight back, so the final `toEqual` could not fail.

**The fix.** Between step 4 and step 5, the row is now read back and asserted three ways:

```ts
const afterUpdate = await readRow();
expect(afterUpdate?.prescription).toEqual(originalSnapshot);          // whole snapshot unchanged
expect((afterUpdate?.prescription as …)?.snapshot.prescriptionNotes)
  .toBe(frozenNote);                                                  // the note specifically
expect(afterUpdate?.skipped).toBe(true);                              // the update DID apply
```

The `skipped` assertion is what stops the case passing because the op was ignored or rejected
outright — an ignored update would leave the snapshot intact for the wrong reason. Step 5's replay
and its final `toEqual(originalSnapshot)` / `skipped` assertions are **kept unchanged**. The existing
`readSnapshot()` helper now delegates to a new `readRow()` so the three earlier steps are untouched.

**NC-R2 — executed, and it took two attempts.** Reported in full because the first attempt was a
false negative that could have been mistaken for evidence.

| Attempt | Mutation | Result |
|---|---|---|
| 1 | `String.replace` on `if (payload.notes !== undefined) patch.notes = payload.notes;` | **Landed at `src/server/sync/service.ts:537` — the `workoutSession` update path**, because that identical line occurs there first. The mutation was inert for `sessionExercise`, and the I-2 case **passed (exit 0)**. That run proves nothing about the test and is recorded so it is not read as evidence. |
| 2 | anchored on the sessionExercise block's own `await tx.update(sessionExercises)…` call, asserted unique (`count === 1`) before substituting | Landed at **`:741`, inside the `sessionExercise` update path**. |

| Step | Command | Exit | Observed |
|---|---|---|---|
| baseline, before breaking anything | `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts -t "PI-018 — persists a frozen prescriptionNotes"` | **0** | 1 passed / 19 skipped |
| **NC-R2** (attempt 2, `patch.prescription = payload.prescription` added to the sessionExercise update path) | same command | **1** | **FAILS at the new assertion** — `sync.integration.test.ts:321`, `expect(afterUpdate?.prescription).toEqual(originalSnapshot)`, diff showing `+ "prescriptionNotes": "smuggled instruction"` against the frozen multiline note |
| restore | byte restore from the task-owned backup | 0 | `restored=identical`, sha256 `d289ce0556d3bb68557c49412c4ae14273ae7f2da05ccf562b1a46248639b7ce`, **63683 bytes** — matches the `d289ce05…8639b7ce` the review recorded for this file; `grep -n "patch.prescription"` returns nothing |
| re-run after restore | `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts` | **0** | **20 passed** |

The failure is on the **new** assertion, at the new line, not on the pre-existing `:167-222` case —
which is exactly what F-2 asked to be demonstrated. Mechanics per
[agent-workflow.md §6](../process/agent-workflow.md#6-negative-control-policy): exact original bytes
saved to a task-owned scratchpad backup before mutating, restored afterwards, restoration verified by
buffer compare **and** SHA-256, backup deleted. **`git checkout`/`git reset` were never used** —
`src/server/sync/service.ts` is not concurrently modified, but the rule holds regardless and the
surrounding tree is full of uncommitted concurrent work.

`control | command | expected | observed | restored=identical`:

```text
NC-R2 | pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts -t "PI-018 — persists a frozen prescriptionNotes" | the new I-2 case fails at the post-update read-back | FAILED at :321 with "smuggled instruction" persisted (exit 1) | restored=identical (sha256 d289ce05…8639b7ce, 63683 bytes)
```

### 14.4 F-3 — citations re-derived, not offset

Every figure below was re-derived with `git show cb33264:<path> | grep -n` against the working tree,
**not** by adding this change's line delta and **not** by copying the architecture review's numbers —
two of which were themselves off by one, which is how the stale range reached §8 in the first place.

| Location | Was | Now | Basis |
|---|---|---|---|
| §4 table row | `today/service.ts:244` | **`:262`** (`safeParse`), function at **`:258`** | `parseHistoryPrescribed` is at `:240`/`:244` **at `cb33264`** and at `:258`/`:262` **as delivered** — this change inserts 18 lines above it. §4 describes the delivered tree, so the delivered numbers belong there. |
| §4 preamble | — | new paragraph | States explicitly that §4's numbers are delivered-tree numbers, gives the `HEAD` pair for contrast, and notes the other two sites are in untouched files and therefore identical at both revisions. |
| §8 L-5 table | `:485-503` (button `:486-493`, textarea `:496-503`) | **`:486-506`** — `<div>` `:486`, `</div>` `:506`; button **`:487-494`**, textarea **`:496-504`** | Read directly out of `git show cb33264:src/ui/workout/ExerciseCard.tsx`. |
| §8 L-5 table | header "Correct" | "Correct, at `cb33264`" + preamble | The evaluation was written pre-change, so its citations must be judged at `cb33264`, not on the delivered tree. Making the revision explicit is what stops the next reader repeating the drift. |
| §3 L-5 row | repeated `:485-503` | corrected, with a note that the original figure had been copied rather than derived | — |

**Re-verified and left as-is** (all exact): `ExerciseCard.tsx:222-223` for the pre-change snapshot
reads; `blocks/service.ts:635` and `progression/service.ts:113` (both in files this change does not
touch, so identical at both revisions — confirmed by `grep -n`, not assumed); `zod` declared
`^3.24.1`, installed `3.25.76`.

### 14.5 F-4 — disposition recorded, nothing changed

**The independent review found the ROADMAP reconciliation accurate and required no correctness fix.**
Its own words: *"No correction required for correctness."* It verified rows 1–2 against
`STATUS.md:22`/`:24` (including the retained D-CE1-1(i) client-coverage boundary) and row 3's commits
`c2d98c8` / `cb33264` against `git log`, and noted three mitigations already present: the report
discloses the reconciliation plainly, every claim is accurate, and rows 1–2 are attributed to STATUS
rather than re-certified.

What the finding actually raises is an **authorization** question, not a correctness one: evaluation
§9 item 4 authorized inserting PI-018 and renumbering, while the delivered diff also reclassified
rows 1–3 — delivery-state text in a file whose own header says STATUS owns delivery state.

**Disposition: recorded, not changed.** `docs/ROADMAP.md` was not edited by this remediation (mtime
still `2026-09-11T23:28`). Reverting the reclassification would leave two rows marked "Now" that
STATUS records as closed, which the review itself called "actively misleading"; widening it further
would repeat the overshoot. **No owner ratification was given and none is claimed** — this is an open
item for the owner, flagged so it is inherited deliberately rather than silently, together with the
review's note that ROADMAP now carries PI-007 state claims STATUS does not yet mirror.
`docs/STATUS.md` remains untouched by this item, at `a122855`.

### 14.6 F-5 — counts and residue

**Counts (§2).** "Eight source/config files and eight test files" → **"Seven source/config files
(six under `src/`, plus `package.json`) and nine test files (six extended, three new)"**, with the
counting rule stated: `git status --porcelain -- src tests package.json`, excluding the concurrent
`tests/e2e/seed.ts`, and noting that the Source-and-config table has eight rows only because its last
row is the `docs/**` pointer to §7. Verified:

```text
src: 6 files    package.json: 1    tests: 9 (6 modified + 3 untracked, excluding tests/e2e/seed.ts)
```

**Residue (§11).** The declaration now covers the fixture **exercises** as well as the templates.
Per suite run the spec creates **four catalog exercises** (`createMeasurementExercise`, twice per
test, two tests — grep-verified) and **two templates** with three prescriptions each, plus the
session rows the workout writes. `teardown` archives the template (there is no template DELETE route)
and does **not** dispose of the exercises, matching the `measurementProfiles.spec.ts` precedent.

The §11 entry states plainly that **all of these rows lived only inside a disposable test database**
— `gymapp_t_prescriptioncontext` locally, a CI-fresh database in the `offline-e2e` job — and **ceased
to exist when that database was dropped**. No surviving residue is invented, and **no unrelated
cleanup was performed**: the five pre-existing disposable databases owned by other tasks are
untouched, and the dev `gymapp` database and production were never connected to.

### 14.7 Model attribution — established by session metadata

The review records the implementation as `claude-opus-5` (1M context); this task's routing labelled
it Sonnet. Resolved from **session metadata, not from the session title** (which was ignored, as
instructed, and which in any case only ever asserted `O5-1M` by convention):

| Source | Value |
|---|---|
| Harness transcript for the implementation session, `~/.claude/projects/c--DEV-gym-app/d2e5abf0-5ce9-4b54-9424-86e800f4c038.jsonl` | `"model":"claude-opus-5"` on **all 342** assistant records; `"modelId":"claude-opus-5[1m]"`. **No other model value appears anywhere in the file.** |
| That the file is the implementation session | it contains the PI-018 implementation prompt and the writes of this report |

**Recorded value: `claude-opus-5` (1M context), for the implementation session and for this
remediation, which ran in the same session.** This agrees with the review and disagrees with the
Sonnet routing label.

**Stated limitation, so this is not over-claimed.** That metadata is the *client's own per-message
record of the model it requested*. It is strong evidence — structured API metadata rather than prose,
and unanimous across the whole session — but it cannot attest to anything the serving side may have
done beneath it, and the routing layer is not visible from inside the session. If the routing label
is authoritative for billing or policy, the two systems disagree and only the owner can reconcile
them. **The independent review was not edited**, and the tier-independence caveat it records under
its own §2 stands exactly as written.

### 14.8 Verification for this remediation

Scoped to the change, as instructed — no full build or E2E re-run, since nothing outside one
integration test file and three documentation files changed and no gate failed.

| Command | Exit | Result |
|---|---|---|
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts -t "PI-018 — persists a frozen prescriptionNotes"` (before NC-R2) | **0** | 1 passed / 19 skipped |
| same command (**NC-R2**, attempt 1, mis-targeted) | **0** | 1 passed — **inert mutation, not evidence** (§14.3) |
| same command (**NC-R2**, attempt 2, correctly targeted) | **1** | **FAILS at `:321`**, the new assertion |
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts` (after restore) | **0** | **20 passed** |
| `pnpm format:check` (first run, after the test edit) | 1 | `tests/integration/sync.integration.test.ts` flagged |
| `pnpm exec prettier --write tests/integration/sync.integration.test.ts` | **0** | formatted |
| `pnpm format:check` (re-run) | **0** | "All matched files use Prettier code style!" |
| `pnpm lint` | **0** | `eslint .` — no errors, no warnings |
| `pnpm typecheck` | **0** | `tsc --noEmit` |
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts` (final, post-format) | **0** | **20 passed** |

`docs/` is in `.prettierignore`, so `format:check` is not evidence for any documentation change here.

**Documentation diff check.** `docs/BACKLOG.md` is the only documentation file this remediation
edited (one word); `docs/ROADMAP.md`, `docs/STATUS.md` and all three architecture documents retain
their pre-remediation mtimes and content.

### 14.9 Scope and disposable resources for this remediation

**Task-owned file manifest — the complete set this remediation changed:**

| File | Change |
|---|---|
| `docs/BACKLOG.md` | F-1 — one duplicated word deleted |
| `tests/integration/sync.integration.test.ts` | F-2 — `readRow()` helper + three post-update assertions; Prettier-formatted |
| `docs/reviews/workout-prescription-context-implementation.md` | F-3/F-5 in-place corrections (§2, §3, §4, §8, §11), the §14 pointer under the verdict, and this §14 |

Nothing else. Specifically re-verified:

- **`src/server/sync/service.ts` is byte-identical to its pre-remediation state** (sha256
  `d289ce05…8639b7ce`, 63683 bytes) — it was mutated only for NC-R2 and restored from a task-owned
  backup, never with `git checkout`/`git reset`.
- **All three independent reports are unchanged** — the architecture evaluation
  (mtime `2026-09-11T22:55`), the architecture review (`23:10`) and the implementation review
  (`2026-09-12T00:53`) all retain pre-remediation mtimes.
- **`docs/ROADMAP.md`, `docs/STATUS.md`** and the three architecture documents edited by the original
  implementation were **not** touched again.
- **Concurrent work preserved:** `playwright.config.ts` and `tests/e2e/seed.ts` still carry only
  their pre-existing comment-only edits; the `set-groups-*.md` files (now three, including
  `set-groups-architecture-review.md`, which appeared during the independent review), the
  `repository-agent-workflow-*` reports, `docs/process/`, `.claude/skills/`, `gpt-*.md`,
  `HANDOFF(depracted).md`, the `docs/research/…pdf`, `CLAUDE.md`, `README.md`,
  `docs/evidence/*` and `docs/research-notes/*` are all untouched.

**Disposable resources — drop what you created, list what you did not.**

- **No database was created.** None was needed: the integration tier runs on **in-memory PGlite**, a
  fresh migrated instance per test (`tests/integration/testDb.ts`, ADR-003) — isolated and disposable
  by construction, and gone when the process exits. This is deviation **D-1** (§9) again; no
  `gymapp_t_*` database was required because no E2E run was required. The implementation's own
  `gymapp_t_prescriptioncontext` was already dropped (§12) and stayed dropped.
- **One byte-backup file** in the session scratchpad (`ncr2-remediation.orig`) — deleted immediately
  after restoration was verified.
- **No server was started**, no build was produced, no Playwright run occurred, so no
  `test-results/` artifacts and no Chromium profile directories were created.
- **Left behind, deliberately:** the five pre-existing disposable databases owned by other tasks
  (`gymapp_e1rm_remediation`, `gymapp_e1rm_verify`, `gymapp_warmup_e2e`, `gymapp_wu_rem_e2e`,
  `gymapp_wuconc`) — **not task-owned, not dropped**, and no unrelated cleanup was performed. The dev
  `gymapp` database was never connected to. **No production resource was created, connected to,
  inspected or modified.**

### 14.10 What the targeted verification should confirm

1. **F-2 discriminates** — re-run NC-R2 by adding `patch.prescription = payload.prescription` to the
   **`sessionExercise`** update path (the one whose block ends in `tx.update(sessionExercises)`, not
   the `workoutSession` path at `:537`) and confirm the new I-2 case fails at `:321`.
2. **F-1** — `docs/BACKLOG.md:32-33` reads "the selected order is unchanged", and no PI-012/PI-017
   text moved.
3. **F-3** — `parseHistoryPrescribed` is at `:258`/`:262` on the delivered tree and `:240`/`:244` at
   `cb33264`; the "Add notes" block is `:486-506` at `cb33264`.
4. **F-5** — `git status --porcelain -- src tests package.json` yields 6 + 9 + 1, excluding
   `tests/e2e/seed.ts`.
5. **F-4** — `docs/ROADMAP.md` is unchanged by this remediation, and no ratification is claimed.
6. **Restoration** — `src/server/sync/service.ts` hashes to `d289ce05…8639b7ce`.

### 14.11 V-1 applied 2026-09-12 (post-verification, report-only)

The targeted
[remediation verification](workout-prescription-context-remediation-verification.md) returned
**`VERIFIED — READY FOR PI-018 RELEASE CLOSEOUT`**, all five dispositions holding, with one LOW
report-only residual: **V-1** — §14 cited the NC-R2 failure at `sync.integration.test.ts:322`, but on
the delivered tree the failing assertion is **`:321`**. §14.8's own command ordering shows why: NC-R2
ran *before* `pnpm exec prettier --write` reformatted the file, so `:322` was true when observed and
became `:321` once formatted — the same drift class §14.4 introduced revision labels to prevent.

**Applied.** All four occurrences corrected to `:321` in §14.3 (both the table and the
`control | command | …` line), §14.8 and §14.10, re-derived against the delivered file rather than
adjusted by offset: `:320` is `const afterUpdate = await readRow();`, `:321` is
`expect(afterUpdate?.prescription).toEqual(originalSnapshot)` — the assertion NC-R2 failed on — and
`:322` opens the second added assertion. No other content changed, and the substance of F-2 is
unaffected: the verification independently reproduced the failure on one of the three added
post-update assertions with the expected `"smuggled instruction"` diff.

Nothing else from the verification was re-opened. Its other two standing notes are closed by the
owner, not by this report: **model attribution** (the owner states Opus high, agreeing with §14.7)
and the **bounded-remediation form** disclosure (no finding). **F-4's authorization item remains open
for the owner** — see §14.5.

---

READY FOR TARGETED PI-018 REMEDIATION VERIFICATION

---

## 15. Release closeout 2026-09-12 — commit, push and deployment

Recorded after the targeted
[remediation verification](workout-prescription-context-remediation-verification.md) returned
`VERIFIED — READY FOR PI-018 RELEASE CLOSEOUT` and the owner authorized commit, push and the normal
deployment the push triggers.

### 15.1 Release shape — full feature, not a follow-up

Determined before staging anything, not assumed: at the start of this run `git log` ended at
**`cb33264`**, `git diff --cached --name-only` was **empty**, and `git rev-list --left-right --count
origin/main...HEAD` was `0 0`. **The original PI-018 release had never been committed or deployed**,
so this is the **full feature commit** — the `feat:` message, not the remediation-only `test:`
alternative. No history was amended or rewritten; nothing was undone.

### 15.2 Reconciliation against the reviewed manifest — no drift

| Check | Result |
|---|---|
| SHA-256 of the four source files with hashes recorded in the reviews | **all four match**: `prescriptionSnapshot.ts` `0d0b0908…f099b0d0` (5267 B), `activeSession.ts` `36b99513…e408fd3e` (38222 B), `today/service.ts` `751bdbe5…6893e257` (26660 B), `sync/service.ts` `d289ce05…8639b7ce` (63683 B) |
| `git diff --stat -- src` | **16 / 24 / 24 / 9 / 14 / 55** — identical to the verified tree |
| `git diff --cached --check` | **exit 0** — no whitespace or conflict-marker errors |

Application source is byte-identical to the tree the implementation review and the remediation
verification both gated, so their evidence is **reused rather than re-measured**, per the brief. The
only post-verification change is documentation: **V-1** (§14.11) and this section.

### 15.3 What was staged, and what was deliberately left out

Staged by explicit path only. **`git add .`, `git add -A` and `git commit -a` were never used.**
26 paths — the reviewed manifest plus the five PI-018 reports:

| Group | Paths |
|---|---|
| Source (6) | `src/domain/measurement/format.ts`, `src/domain/schemas/prescriptionSnapshot.ts`, `src/server/today/service.ts`, `src/sync/activeSession.ts`, `src/sync/types.ts`, `src/ui/workout/ExerciseCard.tsx` |
| Config (1) | `package.json` |
| Tests (9) | the six extended + `tests/unit/prescriptionContextActiveSession.test.ts`, `tests/unit/workout/prescriptionContextCard.test.ts`, `tests/e2e/workoutPrescriptionContext.spec.ts` |
| Architecture docs (3) | `domain-model.md`, `prescription-model.md`, `pwa-offline-strategy.md` |
| Planning docs (2, **partial** — see below) | `docs/BACKLOG.md`, `docs/ROADMAP.md` |
| Reports (5) | the architecture evaluation, architecture review, this report, the implementation review, the remediation verification |

**`docs/BACKLOG.md` and `docs/ROADMAP.md` were staged partially, by content, not wholesale.** Both
carry concurrent PI-012 Set Groups and PI-017 workflow edits interleaved with the PI-018 edits — and
in BACKLOG the concurrent PI-017 section and the PI-018 section land in the *same* diff hunk, so
hunk-level selection could not separate them. Instead, a PI-018-only version of each file was built
from the `cb33264` blob plus only the PI-018 changes, staged, and the full working-tree copy then
restored. Result, verified: the staged diff contains **no** PI-017 or Set Groups content (the single
"Set Groups" string in it is inside the PI-018 entry's own sentence disclaiming PI-012 overlap), while
the working tree still carries **13** concurrent PI-012/PI-017 lines, unstaged and intact for whoever
owns them. Both files show as `MM` in `git status` after the commit, which is the intended state.

One consequence, stated rather than hidden: the PI-018 entry's "Later allocations: PI-017 … and
PI-018 …" line was **not** staged, because it names PI-017 and would have dangled. PI-018 is still
indexed by its table row and its full section; whoever commits PI-017 can commit that line, which
covers both.

**Deliberately excluded** — every one still present and unmodified in the working tree:
`CLAUDE.md`, `README.md`, the `HANDOFF.md` deletion, `HANDOFF(depracted).md`, `docs/evidence/*`,
`docs/research-notes/*`, `playwright.config.ts`, `tests/e2e/seed.ts`, `.claude/skills/`,
`docs/process/`, `docs/research/The Reactive Training Manual…pdf`, the three `set-groups-*.md`
reports, the five `repository-agent-workflow-*.md` reports,
`docs/reviews/exercise-catalog-expansion-closeout.md`,
`docs/reviews/warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md`.

**Known cross-reference consequence of that exclusion:** all five staged reports link to
`../process/agent-workflow.md`, which is untracked concurrent work (PI-017's). Those links resolve on
disk but **not** in the committed tree until `docs/process/` is committed by its own task. Committing
it here would have violated the exclusion, so this is recorded rather than worked around.

### 15.4 Commit and push

| Item | Value |
|---|---|
| **Commit** | **`7fb7c0b2d1d255f548c4e4be5e916c0859720c45`** (`7fb7c0b`) |
| **Branch** | `main` |
| **Parent** | `cb33264` |
| **Upstream** | `origin/main` (`https://github.com/lukavma/gym-app.git`) — printed before pushing |
| **Message** | `feat: show prescribed rest and program notes during workouts` |
| **Diffstat** | 26 files changed, 4147 insertions(+), 18 deletions(-) |
| **Push** | `git push origin main` → `cb33264..7fb7c0b  main -> main`, **exit 0**, fast-forward |
| **Force push** | none. `git fetch` beforehand showed `0 1` (behind ahead), so no integration was needed |
| **Tag** | none created — none was instructed |

### 15.5 CI and deployment for this exact commit

Both workflows triggered on the push and **both succeeded**.

| Workflow | Run | Conclusion |
|---|---|---|
| **CI** | [run #40, id 34660496623](https://github.com/lukavma/gym-app/actions/runs/34660496623) | **success** |
| **Deploy to Azure** | [run #35, id 34660496792](https://github.com/lukavma/gym-app/actions/runs/34660496792) | **success** |

**The deployment was not skipped.** `deploy.yml` carries `paths-ignore: ["docs/**", "**/*.md"]`, which
skips a run only when *every* changed file matches; this push also changes `src/**`, `tests/**` and
`package.json`, so the deploy ran normally. Its jobs:

| Job | Conclusion |
|---|---|
| `quality / Lint, boundaries, typecheck, tests, build` | **success** |
| `quality / Deterministic offline/PWA Playwright suite (Phase 8)` | **success** — this is the job that runs `test:e2e:offline`, which now includes `workoutPrescriptionContext.spec.ts` (§2 file 7) |
| `Build, migrate, deploy` | **success** — every step: standalone build, package, Azure OIDC login, DB firewall open, **migrations**, **seed**, firewall close, **Deploy to Azure App Service** |

The migration step succeeded and was a **no-op for PI-018** by design — this change adds no migration
(§2). No quality gate was bypassed, skipped or retried; nothing needed diagnosing.

**Not independently probed:** production itself. `AZURE_WEBAPP_NAME` is a repository secret and the
hostname appears nowhere in the repo, so there is no URL to health-check without guessing. The
successful `Deploy to Azure App Service` step is the authoritative signal recorded here; first-hand
confirmation comes with the device acceptance below.

#### The follow-up docs commit, and a pre-existing flaky offline test

This report's own §15 could only be written after the commit it describes, so it landed as a second,
**documentation-only** commit: **`54d283d3f11bbf39a2366b995b869a4218dfe639`** (`54d283d`),
`docs: record PI-018 release closeout evidence`, one file, pushed `7fb7c0b..54d283d`, exit 0.

| Workflow | Run | Outcome |
|---|---|---|
| **Deploy to Azure** | — | **SKIPPED by workflow rules**, exactly as `deploy.yml`'s `paths-ignore` specifies: every file in that push matches `docs/**` / `**/*.md`. **Production therefore still runs `7fb7c0b`**, the feature commit, whose deploy succeeded in full. This is correct behaviour, not a failure. |
| **CI** | [run #41, id 34661592671](https://github.com/lukavma/gym-app/actions/runs/34661592671) | **failure** — see the diagnosis below |

**Diagnosed, not retried blindly, and no gate bypassed.** The failing job is
`Deterministic offline/PWA Playwright suite (Phase 8)`, at the `Offline/PWA Playwright suite` step;
the `Lint, boundaries, typecheck, tests, build` job **passed**. Job logs require authentication
(`GET …/jobs/{id}/logs` → 403, and no token is available here), so the failure was characterised by
re-running the same gate locally instead:

| Run | Source | Result |
|---|---|---|
| CI #40, `7fb7c0b` | the feature commit | offline suite **passed** |
| Deploy #35 nested quality, `7fb7c0b` | same | offline suite **passed** |
| Local full suite during implementation (§6) | same | **156 passed**, including this spec |
| **CI #41, `54d283d`** | **differs from `7fb7c0b` by one markdown file** | offline suite **FAILED** |
| Local `pnpm test:e2e:offline`, attempt 1, clean disposable DB | same source | **FAILED** — `offline-bodyweight-recovery.spec.ts:137`, the `Offline — can't verify today's check-in yet` banner not appearing. **Both PI-018 tests passed** (33 of 34) |
| Local pre-PI-018 offline list (my spec removed), clean DB | same source | **32 passed** |
| Local `pnpm test:e2e:offline`, attempt 2, clean DB | same source | **34 passed** |

**Conclusion: an intermittent, pre-existing flake in PI-007's offline recovery spec, not a PI-018
regression.** Three independent reasons:

1. `54d283d` differs from `7fb7c0b` by **one markdown file**. A documentation-only diff cannot change
   test behaviour, so a suite that passes on one and fails on the other is non-deterministic by
   construction.
2. The failing assertion is in `offline-bodyweight-recovery.spec.ts` — the recovery check-in's
   unknown-offline banner. PI-018 touches the prescription-snapshot schema, the rest formatter, the
   today-bundle entry, the client bundle mirror, the freeze site and the workout card; none is on the
   recovery path, and the same run passed both PI-018 tests.
3. **The new spec cannot be the cause.** Playwright sorts spec files alphabetically (visible in the
   run output: `offline-bodyweight-recovery` executes at positions 7–19, `workoutPrescriptionContext`
   last, at 33–34), so `workoutPrescriptionContext.spec.ts` runs *after* the failing spec and cannot
   pollute it. Removing it from the list did not make the failure reproduce, and keeping it in passed
   on the next attempt.

`docs/STATUS.md` already records this class for a prior release — catalog commit `57868e2` "succeeded
on retry after an unrelated flaky offline test". Observed failure rate across the six runs above is
2 of 6 on identical source.

**Not done, deliberately:** the run was **not** re-triggered from here — `gh` is not installed and the
API needs a token, and nothing was forced, skipped or worked around to get a green. **What the owner
may want to do:** re-run CI #41 from the Actions UI, or simply let the next push re-run it. Either
way it does not gate production, which is already serving `7fb7c0b`. Separately, the flake itself is
worth a bounded PI-007 follow-up — it is now the second recorded occurrence of an unrelated offline
test failing a release run.

### 15.6 Final finding dispositions

| ID | Disposition | Closed by |
|---|---|---|
| **F-1** | **Closed** — duplicated `selected` removed; PI-012/PI-017 text untouched | §14.2, verified §3.1 |
| **F-2** | **Closed** — post-update read-back added; NC-R2 reproduced independently and fails at the new assertion | §14.3, verified §3.2 |
| **F-3** | **Closed** — every citation re-derived at its stated revision | §14.4, verified §3.3 |
| **F-4** | **Recorded, accurate, nothing re-opened; no ratification claimed** — remains an **open owner item** | §14.5, verified §3.4 |
| **F-5** | **Closed** — counts corrected (7 source/config, 9 test files); fixture exercises declared | §14.6, verified §3.5 |
| **V-1** | **Closed** — NC-R2 line citation `:322` → `:321` | §14.11 |

### 15.7 What remains

1. **Physical iPhone device acceptance — outstanding, and NOT claimed anywhere.** The only gate with
   no agent substitute: Chromium E2E is not real iOS Safari, and no automated result in this report or
   any other stands in for it. What to check: start a new workout on a template whose slot has a
   prescribed rest and a program note; confirm the rest shows on the subtitle line and the
   `Program note:` block shows above the inputs; confirm typing a session note leaves the program note
   unchanged and the two stay separate; reload mid-workout and confirm both survive. A workout started
   **before** this deploy correctly shows rest but **no** program note — that is the
   no-reconstruction rule working, not a defect.
2. **Owner awareness, now live:** every prescription note already in the program became visible during
   execution from the first workout started after this deploy, with no per-note opt-out. Any note
   written as private planning text rather than an execution cue should be edited or cleared in the
   program editor.
3. **F-4's open authorization item** — ratify or adjust the ROADMAP rows 1–3 reclassification, and
   decide whether `STATUS.md` should mirror the PI-007 state ROADMAP now asserts.
4. **`docs/STATUS.md` is deliberately still at `a122855`** — release state is the designated closeout
   editor's to write from evidence, not the implementer's. It does not yet record `7fb7c0b`.
5. **The concurrent PI-012/PI-017 work remains uncommitted**, including the `docs/process/` directory
   the reports link to.
6. **CI #41 on the docs commit is red from a pre-existing flaky offline test** (§15.5). Production is
   unaffected. Re-run it from the Actions UI if a green badge on `main` matters, and consider a bounded
   PI-007 follow-up for the flake — this is its second recorded occurrence.

---

READY FOR PI-018 OWNER DEVICE ACCEPTANCE
