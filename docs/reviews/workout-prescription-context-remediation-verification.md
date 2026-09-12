# Workout prescription context (PI-018): targeted verification of the remediation

**Date:** 2026-09-12
**Tree:** `cb33264` (dirty). Application source is **byte-identical** to the tree the implementation
review gated — four recorded SHA-256s re-confirmed (§4), and all six `src/**` diff stats unchanged.
**Role:** targeted verification (a fresh session; confirms each listed finding only, does not
re-review — [agent-workflow.md §2](../process/agent-workflow.md#2-roles-and-independence))
**Session:** `O5-1M | PI-018 | Verification — Workout Prescription Context Remediation`
**Model:** claude-opus-5 (1M context)
**Task/gate:** the gate raised by
[workout-prescription-context-implementation.md](workout-prescription-context-implementation.md) §14
(`READY FOR TARGETED PI-018 REMEDIATION VERIFICATION`)
**Findings verified against:**
[workout-prescription-context-implementation-review.md](workout-prescription-context-implementation-review.md)
§5 (F-1…F-5)
**Authorization boundary:** verification only — no production access, no staging, no commit, no push,
no tag, no deployment. No code was fixed and no author report, prior independent report, architecture
document, `STATUS.md`, `ROADMAP.md`, `BACKLOG.md` or concurrent workflow/Set Groups file was edited.
The only file written by this task is this one.
**Cites:** [agent-workflow.md](../process/agent-workflow.md) §2/§4/§5/§6/§10; the implementation
report §2/§3/§4/§8/§11/§14; the implementation review §5

**Verdict: VERIFIED — READY FOR PI-018 RELEASE CLOSEOUT.**

All five findings are correctly disposed: **F-1, F-2, F-3 and F-5 are closed**; **F-4's "recorded, no
change" disposition is accurate** and its authorization question remains an open owner item, as the
remediation states. NC-R2 was reproduced against the specific corrected case and it now fails on the
added post-update assertion, which is what F-2 required. One LOW residual (§5, V-1) — a one-line
citation offset inside §14 itself — does not affect any verified behaviour.

No deployment has occurred and none is claimed here. Physical iPhone acceptance remains a
post-deployment owner step with no agent substitute.

---

## 1. Scope of this verification

Targeted, not a new implementation review. The prior review's full evidence (unit 86/1241,
integration 28+6/472+17, `test:e2e:offline` 34, full `pnpm test:e2e` 156 on a clean bootstrap, plus
NC-1/NC-2/NC-R1) is **cited, not restated and not re-run** — it remains valid because the application
source did not move (§4). What was executed here is scoped to the changed test file and the changed
documentation, plus the one negative control the remediation was asked to demonstrate.

Change class of the remediation itself: **test-only correction** for
`tests/integration/sync.integration.test.ts` (one test body) and **documentation only** for the rest.
Per the [change-class matrix](../process/agent-workflow.md#5-evidence-levels-and-the-change-class-matrix)
that makes R-level evidence "the file + a negative control proving it still discriminates" and a scope
check — both done, and the static gates plus the whole integration suite were run on top.

---

## 2. Finding dispositions

| ID | Claimed | Verified | Evidence |
|---|---|---|---|
| **F-1** | Fixed | **Closed** | §3.1 |
| **F-2** | Fixed, NC-R2 | **Closed — reproduced independently** | §3.2 |
| **F-3** | Fixed (report only) | **Closed — every figure re-derived at its stated revision** | §3.3 |
| **F-4** | Recorded, no change | **Accurate; nothing re-opened, no ratification claimed** | §3.4 |
| **F-5** | Fixed (report only) | **Closed — counts and residue match reality** | §3.5 |

---

## 3. Evidence per finding

### 3.1 F-1 — duplicated word removed, concurrent BACKLOG content preserved

**Closed.**

```text
31: Follow-up accepted **backlog ideas**: PI-014 daily check-in reminder, PI-015 set-rest timer,
32: PI-016 optional short-rest hint. These are unselected implementation candidates; the selected
33: order is unchanged. Platform feasibility and a possible later prototype are evaluated in
```

| Check | Command | Exit | Result |
|---|---|---|---|
| the fix | `awk` over `docs/BACKLOG.md:29-35` | 0 | single `selected`; sentence reads "…; the selected order is unchanged." |
| no other doubled word | `grep -nEo '\b([a-zA-Z]+) \1\b' docs/BACKLOG.md docs/ROADMAP.md` | **1** (no match) | none in either file |
| the only changed hunk line | `git diff -- docs/BACKLOG.md` | 0 | `-six-step order is unchanged.` / `+order is unchanged.` — the word was removed from the already-added line |

**Concurrent content preserved.** `git diff --stat -- docs/BACKLOG.md` is still **122** changed lines
— identical to the figure recorded before the remediation — so no line was added or removed, only one
word deleted inside an existing `+` line. Spot-checked intact: the PI-012 Set Groups V1 rewrite
(`## PI-012 — Set Groups; linked top-set/back-offs later` at `:659`, the owner's sentence "keep the
separate workout prescription-notes/rest visibility fix bounded" at `:687`, "Deferred original idea"
at `:689`), the whole PI-017 section (`:857-:882`), the PI-018 section (`:884` onward), and every
`<a id="pi-0NN">` anchor. PI-013's separate `"Not in the selected sequence."` line and the ROADMAP
substitution are both clean and were not disturbed.

### 3.2 F-2 — the corrected I-2 case, and NC-R2 reproduced

**Closed.** All four elements the verification brief asked for are present in
`tests/integration/sync.integration.test.ts`:

| Required | Where | Present |
|---|---|---|
| read the stored row **immediately after** the smuggling update | `:320` `const afterUpdate = await readRow();` — the update op is applied at `:309` | yes |
| **before** the replay | the replay is at `:332` | yes — `:320` precedes it |
| assert the unchanged **whole snapshot** | `:321` `expect(afterUpdate?.prescription).toEqual(originalSnapshot)` | yes |
| assert the **note** specifically | `:322-325` `…?.snapshot.prescriptionNotes).toBe(frozenNote)` | yes |
| assert **`skipped: true`** | `:328` — so the case cannot pass merely because the whole op was ignored | yes |
| the subsequent **replay assertion remains** | `:330-340` — replay, `rejected` empty, `finalRow.skipped`, `finalRow.prescription` `toEqual(originalSnapshot)` | yes, unchanged |

The existing `readSnapshot()` helper now delegates to a new `readRow()` (`:269-280`), so steps 1–3
(`:283`, `:288`, `:295`) are untouched.

**NC-R2, executed by this verification.** Mechanics per
[agent-workflow.md §6](../process/agent-workflow.md#6-negative-control-policy): exact original bytes
saved to a task-owned scratchpad backup before mutating, restored afterwards, restoration verified by
buffer compare **and** SHA-256. `git checkout`/`git reset` were not used.

| Step | Command | Exit | Observed |
|---|---|---|---|
| baseline | `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts -t "PI-018 — persists a frozen prescriptionNotes"` | **0** | 1 passed / 19 skipped |
| targeting check | `grep -n "if (payload.notes !== undefined) patch.notes = payload.notes;" src/server/sync/service.ts` | 0 | **two** occurrences, `:536` (workoutSession) and `:740` (sessionExercise) — confirming §14.3's honestly-reported attempt-1 mis-target, and why a unique multi-line anchor is required |
| **NC-R2** — `patch.prescription = payload.prescription` added to the **sessionExercise** update path (mutation landed at `:741`, immediately above `await tx.update(sessionExercises)` at `:743`) | same command as baseline | **1** | **FAILS** — `AssertionError: expected { v: 1, snapshot: { …(9) } } to deeply equal { v: 1, snapshot: { …(9) } }`, diff `- "prescriptionNotes": "Pause 1 s on the chest.` / `+ "prescriptionNotes": "smuggled instruction",`, stack frame `tests/integration/sync.integration.test.ts:321:39` |
| restore | byte restore from the task-owned backup | 0 | `restored=identical`, sha256 `d289ce0556d3bb68557c49412c4ae14273ae7f2da05ccf562b1a46248639b7ce`, **63683 bytes**; `grep -c "patch.prescription"` → **0**; `git diff --stat -- src/server/sync/service.ts` → empty |
| affected file after restore | `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts` | **0** | **20 passed** |

`control | command | expected | observed | restored=identical`:

```text
NC-R2 | pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts -t "PI-018 — persists a frozen prescriptionNotes" | the corrected I-2 case fails at one of the three added post-update assertions | FAILED at :321 with "smuggled instruction" persisted (exit 1) | restored=identical (sha256 d289ce05…8639b7ce, 63683 bytes)
```

The failure lands on the **added** assertion, in the **new** case — not on the pre-existing
`:167-222` case, which is what distinguished a closed F-2 from the original defect. F-2's substance is
confirmed. The reported *line number* is off by one; see V-1 (§5).

### 3.3 F-3 — corrected citations match their explicitly identified revision

**Closed.** Both §4 and §8 now name the revision their numbers are on, and every figure was
re-derived here with `git show cb33264:<path>` against the working tree.

| Citation | Stated revision | Verified |
|---|---|---|
| `parseHistoryPrescribed` `:258` (function) / `:262` (`safeParse`) | delivered tree | **exact** — `:258 function parseHistoryPrescribed(`, `:262 const parsed = prescriptionSnapshotSchema.safeParse(prescription);` |
| the same, `:240` / `:244` | at `cb33264` | **exact** via `git show cb33264:src/server/today/service.ts` |
| `blocks/service.ts:635` | untouched file, identical at both | **exact** — `safeParse` at `:635` |
| `progression/service.ts:113` | untouched file, identical at both | **exact** — `safeParse` at `:113` |
| "Add notes" block `:486-506`; button `:487-494`; textarea `:496-504` | at `cb33264` | **exact** — `:486 <div>`, `:487 <button`, `:494 </button>`, `:496 <textarea`, `:504 />`, `:506 </div>` |
| `ExerciseCard.tsx:222-223` snapshot reads | at `cb33264` | **exact** — `scheme` at `:222`, `targetRir` at `:223` |
| `zod` declared `^3.24.1`, installed `3.25.76` | n/a | **exact** — `package.json:44`; `require("zod/package.json").version` → `3.25.76` |

§4's new preamble states plainly that its numbers are delivered-tree numbers and gives the `HEAD`
pair for contrast; §8's table header is now "Correct, at `cb33264`" with a preamble explaining why.
§3's L-5 row is corrected and records that the original `:485-503` had been copied from the
architecture review rather than derived. That is the right fix: it removes the drift **and** the
mechanism that produced it.

### 3.4 F-4 — disposition explicit and accurate; no unrelated roadmap rewrite

**Accurate.** F-4 was never a correctness finding, and the remediation does not treat it as one.

| Check | Result |
|---|---|
| `docs/ROADMAP.md` mtime | `2026-09-11T23:28:39` — unchanged since the implementation session; the remediation did not open it |
| `git diff --stat -- docs/ROADMAP.md` | **36** — identical to the pre-remediation figure; no hunk added, removed or altered |
| `docs/STATUS.md` | untouched, mtime `2026-09-10T17:18`, still at `a122855` |
| the quotation of the review | §14.5 quotes *"No correction required for correctness."* — verbatim from the review's F-4 |
| framing | §14.5 separates the **authorization** question from the correctness one, exactly as F-4 framed it, and explains why reverting would leave two rows marked "Now" that STATUS records as closed |
| ratification | §14.5 states **"No owner ratification was given and none is claimed"** — correct; none was given, and none is inferred here either |

The open item therefore stands as the review left it: ROADMAP carries delivery-state text that
evaluation §9 item 4 did not authorize and that STATUS does not yet mirror for PI-007. That is for
the owner to ratify or adjust at closeout; it is not a defect and does not block.

### 3.5 F-5 — manifest count and disposable-fixture accounting match reality

**Closed.**

**Counts.** §2 now reads "Seven source/config files (six under `src/`, plus `package.json`) and nine
test files (six extended, three new)", with the counting rule stated. Re-derived:

```text
git status --porcelain -- src           -> 6
git status --porcelain -- package.json  -> 1
git status --porcelain -- tests         -> 10, minus the concurrent tests/e2e/seed.ts = 9
                                            (6 modified + 3 untracked)
```

The Tests table has exactly nine rows. The Source-and-config table's eight rows are explained in
§2 — the eighth is the `docs/**` pointer to §7, not a source file. Consistent.

**Residue.** §11 now declares the fixture rows in full. Re-derived against the spec:

| §11 claim | Verified |
|---|---|
| two catalog exercises per test, **four per suite run** | `buildFixture` calls `createMeasurementExercise` **twice** (`grep -c` → 2) and is called once per test; the file has **two** `test(` blocks |
| one template with three prescriptions per test, **two per suite run**; template **archived**, not deleted | `createTemplateWithScheme` + two `POST /api/templates/{id}/prescriptions`; `teardown` posts to `/archive` |
| no disposal step for the exercises, matching the `measurementProfiles.spec.ts` precedent | confirmed — `teardown` has no exercise disposal |
| every row lived only inside a disposable database and ceased to exist when it was dropped | consistent with this reviewer's own prior observation of **8 exercises + 4 archived templates** after **two** suite runs in a disposable database, which was then dropped |
| no `gymapp_t_*` database survives | `pg_database` listing now shows `gymapp` plus the five other tasks' databases and nothing else |

The declaration closes the gap without inventing surviving residue, and no unrelated cleanup was
performed: the five other tasks' databases are untouched and the dev `gymapp` database was never
connected to.

---

## 4. Executed checks

| Command | Exit | Result |
|---|---|---|
| `git status --porcelain` (before) | 0 | 26 modified + 1 deleted + 22 untracked = 49 paths |
| `pnpm lint` | **0** | `eslint .` — no errors, no warnings |
| `pnpm typecheck` | **0** | `tsc --noEmit` |
| `pnpm typecheck:sw` | **0** | `tsc -p tsconfig.worker.json --noEmit` |
| `pnpm format:check` | **0** | `prettier --check .` — clean; confirms §14.8's post-format state for the edited test file |
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts -t "PI-018 — persists a frozen prescriptionNotes"` (baseline) | **0** | 1 passed / 19 skipped |
| the same, under **NC-R2** | **1** | FAILS at `:321` with `"smuggled instruction"` persisted — §3.2 |
| byte restore + SHA-256 verify | 0 | `identical`, `d289ce05…8639b7ce`, 63683 bytes |
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts` | **0** | **20 passed** |
| `pnpm test:integration` (whole suite — the suite the changed file belongs to) | **0** | **28 files passed / 6 skipped; 472 passed / 17 skipped** — identical to the implementation review's figures, as expected: the remediation added assertions to an existing test, not new tests |
| source-drift check — SHA-256 of the four files with hashes recorded in the implementation review | 0 | **all four match**: `prescriptionSnapshot.ts` `0d0b0908…f099b0d0` (5267 B), `activeSession.ts` `36b99513…e408fd3e` (38222 B), `today/service.ts` `751bdbe5…6893e257` (26660 B), `sync/service.ts` `d289ce05…8639b7ce` (63683 B) |
| `git diff --stat -- src` | 0 | 16 / 24 / 24 / 9 / 14 / 55 across the six files — **identical** to the reviewed tree |
| `git status --porcelain` (after) | 0 | §6 |

### Deliberately not re-run, with the reason

- **`pnpm build`, `pnpm test:e2e`, `pnpm test:e2e:offline`, `pnpm test:unit`.** The application
  source is byte-identical to the tree the implementation review already gated — four recorded
  hashes re-confirmed and all six `src/**` diff stats unchanged — and the only non-documentation
  change is inside one integration test's body. Re-running a production build or a 156-test Chromium
  suite would re-measure an unchanged artifact. The brief's "no full build/E2E rerun unless new
  evidence justifies it" is satisfied: no new evidence arose.
- **The implementation review's own gate counts.** Cited by path and section, not restated, per
  [agent-workflow.md §10](../process/agent-workflow.md#10-report-rules).
- **§14.7's transcript-metadata claim.** Not independently re-derived, and it does not need to be:
  the owner has stated the implementer was **Opus high**, which agrees with §14.7's conclusion of
  `claude-opus-5`. See §5.

---

## 5. Residual and standing notes

### V-1 — LOW, report-only: §14's NC-R2 line citation is one off on the delivered tree

§14.3, §14.8 and §14.10 all place the NC-R2 failure at `sync.integration.test.ts:322`. On the
delivered (Prettier-formatted) tree the failing assertion is **`:321`**
(`expect(afterUpdate?.prescription).toEqual(originalSnapshot)`); `:322` opens the *second* added
assertion. §14.8's own command ordering shows NC-R2 ran **before** `pnpm exec prettier --write`
reformatted the file, so `:322` was true when observed and became `:321` when the file was formatted
— the exact class of drift §14.4 introduces revision labels to prevent, recurring one section later.

The substance is unaffected and independently confirmed (§3.2): the case fails on one of the three
added post-update assertions, with the expected `"smuggled instruction"` diff. **Required correction
(report only, non-blocking):** `:322` → `:321` in §14.3, §14.8 and §14.10, or a note that `:322` is
the pre-format line.

### Model attribution — closed by the owner, not re-opened

The owner states the implementer was **Opus high**; §14.7 independently concluded `claude-opus-5`
from session metadata. The two agree, and per the owner's explicit instruction no further review
cycle is opened on tier independence. The implementation review's §2 caveat stands as written as a
record of what that session could establish at the time; it is no longer an open item.

### Bounded-remediation form — compliant, with disclosure

[agent-workflow.md §2](../process/agent-workflow.md#2-roles-and-independence) asks a bounded
remediation to append "rather than rewriting" the report. F-3 and F-5 were findings *about* incorrect
text in §2, §3, §4, §8 and §11, so they could only be closed in place; leaving the wrong figures
standing with a correction 400 lines below would have been worse. Every in-place edit is enumerated
in the pointer under the verdict and again in §14, and the anchor that pointer links to resolves.
Sections 1 and 5–13 are unchanged, as claimed. No finding.

---

## 6. Scope check

`git status --porcelain` after this verification differs from before it by **exactly one line — this
file**. No concurrent file appeared or changed during the session.

Specifically re-verified:

- **`src/**` is byte-identical to its pre-verification state.** `src/server/sync/service.ts` was
  mutated only for NC-R2 and restored from a task-owned backup with a SHA-256 compare; the other
  five changed source files were not opened at all.
- **No author report, prior independent report, architecture document, `STATUS.md`, `ROADMAP.md` or
  `BACKLOG.md` was edited by this task.** The implementation review is unchanged (38367 bytes, mtime
  `2026-09-12T00:53:32`, verdict line intact at `:499`); the architecture evaluation (`22:55:42`)
  and architecture review (`23:10:45`) retain their original mtimes.
- **Concurrent work preserved.** `playwright.config.ts` (5), `tests/e2e/seed.ts` (6), `CLAUDE.md`
  (24), `README.md` (21), `docs/evidence/*` (2, 4) and `docs/research-notes/*` (2, 2) all carry
  exactly their pre-existing diff stats. The three `set-groups-*.md` files (latest mtime
  `2026-09-12T00:47`, before the remediation), the five `repository-agent-workflow-*` reports,
  `docs/process/`, `.claude/skills/`, `gpt-*.md`, `HANDOFF(depracted).md` and the `docs/research/…pdf`
  are untouched.
- **No production resource was created, connected to, inspected or modified** — local or Azure.

---

## 7. Disposable resources — drop what you created, list what you did not

**Created and dropped:**

- **No database was created.** None was needed: the integration tier runs on in-memory **PGlite**, a
  fresh migrated instance per test (`tests/integration/testDb.ts`, ADR-003), disposable by
  construction and gone when the process exits. No `gymapp_t_*` database was required because no E2E
  or server run was required.
- **One byte-backup file** in the session scratchpad (`ncr2v.orig`) for NC-R2 — deleted immediately
  after restoration was verified by buffer compare and SHA-256.
- **No server was started, no build produced, no Playwright run executed** — so no `test-results/`
  artifacts and no Chromium profile directories were created.

**Left behind, deliberately:**

- **Five pre-existing disposable databases owned by other tasks** — `gymapp_e1rm_remediation`,
  `gymapp_e1rm_verify`, `gymapp_warmup_e2e`, `gymapp_wu_rem_e2e`, `gymapp_wuconc`. Not task-owned,
  not dropped; no unrelated cleanup was performed. The dev `gymapp` database was never connected to,
  written to, migrated or seeded.
- **`.next/`** — pre-existing build output from the earlier review session, gitignored.
- **A small reusable byte-backup/SHA-256 helper script** in the session scratchpad, outside the
  repository.
- No production resource was created, connected to, inspected or modified.

---

## 8. What remains for the owner

Not verification steps — release decisions, listed so nothing is assumed closed that is not.

1. **V-1** (one line number in §14) — optional, report-only, may be consciously accepted.
2. **F-4's open authorization item** — ratify or adjust the ROADMAP rows 1–3 reclassification, and
   decide whether STATUS should mirror the PI-007 state ROADMAP now asserts.
3. **Commit by explicit path** per [agent-workflow.md §11](../process/agent-workflow.md#11-manual-ship-checklist)
   — six source files, one config file, four documentation files, nine test files and the three
   reports. `docs/BACKLOG.md` and `docs/ROADMAP.md` carry concurrent Set Groups / PI-017 edits in the
   same files; stage them knowingly.
4. **Deploy**, then **physical iPhone acceptance** — the one gate with no agent substitute, and
   neither is claimed anywhere in this document. Worth pairing with the owner-awareness note the
   BACKLOG entry records: every prescription note already in the program becomes visible on the next
   workout started after deploy, with no per-note opt-out.

---

VERIFIED — READY FOR PI-018 RELEASE CLOSEOUT
