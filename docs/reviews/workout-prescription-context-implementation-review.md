# Workout prescription context (PI-018): independent review of the implementation

**Date:** 2026-09-12
**Tree:** `cb33264` (dirty — the working tree the implementation report describes, byte-identical to
it; see §8. One further untracked file, `docs/reviews/set-groups-architecture-review.md`, appeared
**during** this review from concurrent Set Groups work and was left alone.)
**Role:** independent review (reads the spec and the report, not the implementer's reasoning; no
implementation, no remediation)
**Session:** `O5-1M | PI-018 | Review — Workout Prescription Context Implementation`
**Model:** claude-opus-5 (1M context) — see §2, independence caveat
**Task/gate:** the gate raised by
[workout-prescription-context-implementation.md](workout-prescription-context-implementation.md)
(`READY FOR INDEPENDENT PI-018 IMPLEMENTATION REVIEW`)
**Spec:** [workout-prescription-context-architecture-evaluation.md](workout-prescription-context-architecture-evaluation.md)
(cited as "the evaluation"; §10 is the acceptance matrix) as adjusted by
[workout-prescription-context-architecture-review.md](workout-prescription-context-architecture-review.md)
(cited as "the architecture review"; L-1…L-5)
**Authorization boundary:** review only — local disposable database, local production build, local
Playwright. **No production access of any kind. No staging. No commit, no push, no tag, no
deployment.** No code was fixed, and no author report, architecture document, `STATUS.md`,
`ROADMAP.md`, `BACKLOG.md` or concurrent workflow/Set Groups file was edited. The only file written
by this task is this one.
**Cites:** [agent-workflow.md](../process/agent-workflow.md) §2/§4/§5/§6/§7/§9/§10/§11; the
evaluation §3/§5/§6/§7/§8/§9/§10; the architecture review §4/§5; the implementation report
(cited as "the report") §2/§3/§4/§5/§6/§7/§8/§9/§11/§12

**Verdict: VERIFIED — READY FOR PI-018 DEPLOYMENT.**

No blockers. Five LOW findings (§5), none affecting the shipped behaviour: one documentation typo
introduced by this change, one new integration case that does not discriminate one of the claims the
report maps to it (the property itself is correct and is independently guarded — proved by NC-R2),
and three report-accuracy items. Per [agent-workflow.md §4](../process/agent-workflow.md#4-severity-convention)
LOW "may be deferred if consciously accepted"; F-1 and F-2 are cheap enough to fold into a bounded
remediation before commit.

Physical iPhone acceptance remains a post-deployment owner step and is neither claimed nor
substituted for here — Chromium E2E is not real iOS Safari.

---

## 1. What was reviewed, and how

The report was read as a set of claims to verify, not as evidence. Every acceptance row, every
compatibility rule and every LOW disposition was re-derived from the source, the diffs and executed
commands. The review ran the full R-level gate set for a **sync-contract change**
([agent-workflow.md §5](../process/agent-workflow.md#5-evidence-levels-and-the-change-class-matrix):
full quality gates, sync integration files, `pnpm test:e2e:offline` on a clean database, plus a
replay/idempotence negative control), re-executed the two declared source-mutating negative controls
(NC-1, NC-2), added two controls of its own (NC-R1, NC-R2), and — because the report's own §6 invites
it — re-ran the whole E-level E2E gate on a freshly created, freshly bootstrapped disposable
database.

§3 records the eight focus properties re-derived from source, §4 the controls, §5 the findings, §7
what was executed here versus inherited, §8 the scope check.

## 2. Independence caveat — recorded, not waived

[agent-workflow.md §2](../process/agent-workflow.md#2-roles-and-independence) and the evaluation §13
step 8 require an independent review to run in "a fresh session, a different model tier from the
implementer." This is a fresh session with no access to the implementation session's reasoning, and
it worked from the spec, the architecture review, the report and the tree. It is **not** a different
model tier: the evaluation, the architecture review, the implementation and this review all ran on
`claude-opus-5` (1M context). The session-independence half of the rule is satisfied; the tier half
is not, for the third consecutive gate on this item. Stated so the owner can weigh it. Nothing below
depends on it — every load-bearing claim in §3 and §4 is backed by an executed command rather than by
reading agreement.

## 3. The eight focus properties — re-derived from the tree

### 3.1 `prescriptionNotes` survives the whole path

**Confirmed, end to end, against real PostgreSQL — not only by inspection.**

| Hop | Where | What was checked |
|---|---|---|
| program row → bundle entry | `today/service.ts:625` | `prescriptionNotes: p.notes`, inside the `for (const p of prescriptionRows)` loop. `prescriptionRows` is a bare `db.select()` (`:546-550`), so `p.notes` is the real column. Carried, not derived: it does **not** pass through `buildPrescriptionSnapshotData` (architecture review L-1 — see §3.7). |
| bundle → wire/cache | `sync/types.ts:131` | `prescriptionNotes?: string \| null` on `TodayBundleExerciseEntryDto`. Neither cache reshapes: `bundleCache.withoutActiveSession` (`:19-22`) and the SW's `cacheWillUpdate` (`sw.ts:65`) are spreads, and no client-side Zod parse of the bundle exists. |
| start (online or offline) | `activeSession.ts:349` → `:207` | `startSession` maps `input.exercises.map((entry, index) => …)` — positional, one session-exercise row per bundle entry — and `buildSnapshotFromBundleEntry` is defined at `:186` and called **once**, at `:349` (grep-verified). `wrapPrescriptionSnapshot` only wraps (`prescriptionSnapshot.ts:94-96`); it does not parse, so nothing is stripped at the freeze. |
| frozen snapshot | `prescriptionSnapshot.ts:82` | `prescriptionNotes: z.string().max(2000).nullable().optional()`, no `.trim()`. |
| Zod/payload serialization | `activeSessionPayloads.test.ts` | Executed. Declaring the key is what stops Zod 3's silent strip — reproduced independently (`z.object({a}).parse({a,b})` → `{"a":"x"}` on the **installed** `zod@3.25.76`) and proved load-bearing by NC-1 (§4). |
| server persistence | real PostgreSQL | Not inferred. After the E2E suite ran on my disposable database I read the rows directly: `SELECT prescription->'snapshot'->>'prescriptionNotes' FROM session_exercises` returned the fixture's multiline note **with its line breaks and its long unbroken token intact**, alongside the second slot's different note. That is the outbox → `applySyncBatch` → JSONB round trip, observed. |
| reload / adoption | `activeSession.ts:119-124`, `:159`; `remoteActiveSession.ts:62`; `today/service.ts:436` | `getLocalActiveSession` → `normalizeActiveSession` spreads (`prescription` untouched); `hydrateFromServer` adopts through the same spread; the client's remote read is a cast, not a parse; the server's `getActiveSession` is `e.prescription as PrescriptionSnapshot \| null`. No strip on any read path. |

### 3.2 Immutable after program edits and later session-exercise updates/replay

**Confirmed** — and the client half, the server half and the "nothing re-reads a bundle" half were
checked separately.

- **Client:** the only writes of `exercise.prescription` in `src/sync/activeSession.ts` are the
  freeze (`:349`) and `addAdhocExercise`'s `prescription: null` (`:483`). `:843`
  (`applyInSessionDecisionToPrefill`) returns a spread **copy** consumed as an input to
  `evaluateSession`; it is never written back (`evaluationTarget.ts:22-32`).
- **Server:** `prescription` appears in the INSERT values only (`server/sync/service.ts:699`); the
  update path's `patch` (`:735-739`) never sets it, and `isNoopSessionExerciseUpdate` (`:570-580`)
  never consults it. `SESSION_EXERCISE_FIELDS` (`:189-199`) is byte-unchanged.
- **Executed:** NC-R2 (§4) breaks exactly this and the suite catches it.
- **Caveat, and finding F-2:** the *new* I-2 case does not discriminate the smuggled-snapshot step
  the report maps to it. The property is nonetheless verified — by the pre-existing test at
  `sync.integration.test.ts:167-222`, which NC-R2 proved discriminating.

### 3.3 Duplicate slots keep their own notes and rest; nothing keys by `exerciseId`

**Confirmed at three layers, and proved discriminating by a control of this review's own design.**

`exercise_prescriptions` is unique on `(template_id, position)` only, so two slots of one exercise
are a supported shape. The bundle reads `p.notes` per row; `startSession` maps positionally;
`WorkoutExecution` renders with `key={exercise.id}` (the session-exercise id, not `exerciseId`), and
`exerciseId` appears exactly once in `src/ui/workout/**` — as the Strength-estimate link's href.
`decisionChosenByExercise` / `pendingByExercise` remain keyed by `exerciseId`, pre-existing and
correctly out of scope.

**NC-R1 (executed, this review's own):** replacing `prescriptionNotes: p.notes` with
`prescriptionRows.find((r) => r.exerciseId === p.exerciseId)!.notes` — "matching by `exerciseId`
alone" made concrete — fails `today.integration.test.ts`'s C-6 case with
`expected 'Top set: leave 1 in the tank.' to be 'Back-off: same bar speed, no grinders.'`. The
duplicate-slot assertion is real, not vacuous.

### 3.4 Old bundles, old snapshots and ad-hoc slots; nothing is reconstructed

**Confirmed.** There is **no** read of `exercisePrescriptions` anywhere under `src/ui/**` or
`src/sync/**` (grep-verified — the execution path cannot reach the live program row). The card reads
`exercise.prescription?.snapshot.*` and nothing else. `normalizeActiveSession` is unchanged and
spreads, so a stored aggregate with the key genuinely absent stays absent. Ad-hoc slots are
`prescription: null` and take the optional chain. `?? null` at the single freeze site is what makes a
pre-upgrade cached bundle start without throwing (the Phase 5 L-4 failure mode) — NC-2 proves the
assertion guarding it is strict.

The "rest but no note" asymmetry for a session straddling the deploy is pinned three ways:
`U-6(c)` (card), `U-7`'s C-2 case (freeze), and the I-2 C-1 case (storage — a snapshot frozen without
the key persists with the key still absent while `restSeconds` survives).

### 3.5 Read-only program note, separate from the editable session note

**Confirmed.** `ExerciseCard.tsx:404-409` renders a `<p class="text-xs break-words
whitespace-pre-wrap text-slate-400">` with a muted `<span>Program note: </span>` prefix — a sibling
of the header flex row (`:321-380`), before the recommendation card, outside **both**
`!exercise.skipped` guards. It is a flex child of the card's `flex flex-col` `<li>`, so it stretches
to the card width and `break-words` can act on a long token.

| Case | Checked by | Result |
|---|---|---|
| multiline | `prescriptionContextCard.test.ts` + E2E fixture | breaks reach the DOM verbatim; `whitespace-pre-wrap` present |
| long unbroken token | E2E `document.documentElement.scrollWidth <= 390` at a 390×844 viewport | no horizontal page scroll |
| skipped slot | unit (f) + E2E Skip re-check | both still render |
| safe rendering | unit | `<b>bold</b>` arrives escaped; it is a `<span>`/text node, never a control |
| `null` / key absent / whitespace-only | unit (b)(c), guard at `ExerciseCard.tsx:234-238` | nothing rendered — no `—`, no "Rest", **no stray `·`**, asserted scoped to the subtitle element per the architecture review's §5 caution |
| independence | unit (e) + E2E E-5 | textarea value is `"session text"` only; program note unchanged; both survive reload |
| rest formatting | `format.test.ts` | 1→`1 s`, 45→`45 s`, 59→`59 s`, 60→`1:00`, 61→`1:01`, 90→`1:30`, 150→`2:30`, 3599→`59:59`, 3600→`60:00`, and never the dual `150 s · 2:30` form |

`formatRestSeconds` (`measurement/format.ts:72-74`) is `minutesSecondsLabel(n) ?? \`${n} s\``, and
`minutesSecondsLabel` returns `null` below 60 (`:52-58`), so the boundary behaviour follows from the
implementation rather than from the test's expectations. Riding inside the `{scheme && …}` guard
creates no dead branch: `scheme` is required in `prescriptionSnapshotDataSchema`.

### 3.6 No migration, no version bump, no top-level sync key, no collateral behaviour change

**Confirmed by diff, not by assertion.** `git status --porcelain -- src` lists exactly six files, all
in the manifest. Zero changes under `src/db/**`, `drizzle/**`, `src/domain/sync/**`,
`src/server/sync/**`, `src/sync/db.ts`, `src/domain/prescriptions/**`, `src/domain/progression/**`,
`src/domain/strength/**`, `src/server/progression/**`, `src/server/blocks/**`, `src/ui/history/**`,
`src/server/history/**`. So: no migration exists for `drizzle-kit` to diff, `PRESCRIPTION_SNAPSHOT_VERSION`
is still 1 (pinned by the extended `:99` envelope test), `SESSION_EXERCISE_FIELDS` cannot have moved,
`DB_VERSION` is untouched, and no progression, e1RM or Set Groups code was touched. The full
1241-test unit suite and 472-test integration suite pass unchanged (§7), which is where a collateral
regression in those subsystems would surface.

### 3.7 The five architecture LOW findings

| ID | Disposition claimed | Verified |
|---|---|---|
| L-1 | Applied — builder bypassed | **Yes.** `git diff --stat -- src/domain/prescriptions/buildSnapshot.ts` is empty; the entry is populated `prescriptionNotes: p.notes` at `today/service.ts:625` beside the pre-existing `restSeconds: snapshotData.restSeconds` at `:601`, with the `measurement` precedent recorded in the comment. `buildSnapshot.test.ts` is untouched and green, so the builder's modifier behaviour is unchanged. Dropping U-2's notes half is correct: the note never enters the builder, so there is no pass-through left to test. |
| L-2 | Applied — H-10's actual scope | **Yes.** `today/service.ts:107-124` states H-10 constrains the client mirror only, and the "dominant shape" claim checks out: `restSeconds` (`:85`), `prefill` (`:89`) and `appliedModifiers` (`:95`) are all required. The defaults argument is not repeated. The asymmetry is real in both mirrors and `pnpm typecheck` passing is what proves "a forgotten population site is a compile error" is live. |
| L-3 | Applied — three `safeParse` sites named | **Substantively yes**, with a citation drift — see F-3. All three exist and all three are read-only projections: `blocks/service.ts:633-637` and `progression/service.ts:111-115` (verified verbatim), and `parseHistoryPrescribed` (verified verbatim, but now at `:258-262`, not `:244`). |
| L-4 | Applied, both keys | **Yes.** `domain-model.md` §6's sketch now carries `measurement?` **and** `prescriptionNotes?`, with a following paragraph stating both are additive-optional on `v: 1`. |
| L-5 | Applied — three drifts corrected | **Two of three exact, one still off** — see F-3. `ExerciseCard.tsx:222-223` is exact at `HEAD`; `zod` installed at `3.25.76` is exact (re-probed). The "Add notes" range is not. |

### 3.8 Documentation and ROADMAP scope

**In scope and evidence-accurate, with one authorization overshoot (F-4) and one typo (F-1).**

- Evaluation §9 items 1, 2 and 5 (`domain-model.md`, `pwa-offline-strategy.md`,
  `prescription-model.md`) are implemented as specified and no further. `data-model.md`, the ADRs and
  `docs/STATUS.md` are untouched, as §9 requires — `git log` confirms `STATUS.md` is still at
  `a122855`.
- Item 3 (BACKLOG PI-018) records the accepted scope, the binding compatibility rules, the explicit
  exclusions, the PI-015/PI-016 relationship ("no competing prescribed rest field", does not select
  PI-015, does not discharge OD-05), the owner-awareness note, and that duplicate-slot support is not
  a PI-012 deliverable. Every link target resolves (`open-decisions.md` OD-05 exists at `:16`; all
  four `reviews/*.md` links in ROADMAP resolve; both `#pi-017` and `#pi-018` anchors exist).
- **PI-012 and PI-017 are preserved.** The architecture review recorded that at `cb33264` PI-017 was
  already the highest identifier and ROADMAP rows 3/4 were PI-007/PI-009; the PI-017 BACKLOG section,
  the PI-017 ROADMAP paragraph and the PI-012 Set Groups rewrite therefore all pre-date this task and
  are concurrent work, left intact. The untracked `set-groups-*.md` files are unmodified.
- **Delivery state is correctly distinguished.** Nothing in the delivered documentation asserts
  deployment or device acceptance for PI-018; the BACKLOG index row reads "implementation in flight"
  and the ROADMAP row describes scope only. The PI-007 row explicitly states that deployment and
  owner device acceptance "are separate gates and are not asserted here". The rows 1–2 closure claims
  were checked against `STATUS.md:22` and `:24` and match them (including the retained D-CE1-1(i)
  boundary); the PI-007 commits `c2d98c8` and `cb33264` exist in `git log` and `cb33264` is indeed the
  device-remediation follow-up.

---

## 4. Negative controls — executed

Per [agent-workflow.md §6](../process/agent-workflow.md#6-negative-control-policy). Exact original
bytes were saved before each mutation and restored afterwards with a buffer compare **and** a
SHA-256 — never `git checkout`. All four source mutations were restored `identical`.

| Control | Command | Expected | Observed | Restored |
|---|---|---|---|---|
| **NC-1** (report's) — delete only the Zod key from `prescriptionSnapshotDataSchema` | `pnpm exec vitest run --config vitest.config.ts tests/unit/activeSessionPayloads.test.ts` | U-3 fails | **fails** — `2 failed / 18 passed`, the second on `toHaveProperty("prescriptionNotes")`. Reproduces the report's observation exactly | `identical`, sha256 `0d0b0908…f099b0d0`, 5267 bytes — **the same hash the report recorded**, which independently establishes the tree is byte-identical to the one it describes |
| **NC-2** (report's) — revert `?? null` to bare `entry.prescriptionNotes` | `pnpm exec vitest run --config vitest.config.ts tests/unit/prescriptionContextActiveSession.test.ts` | U-7 fails on `toBeNull()` | **fails** — `1 failed / 5 passed`, `Expected null / Received undefined` at `prescriptionContextActiveSession.test.ts:132`. A `toBeFalsy()` there would have passed, so the strict form is what makes this control non-vacuous | `identical`, sha256 `36b99513…e408fd3e`, 38222 bytes — again matching the report |
| **NC-R1** (this review's) — populate the bundle entry by `exerciseId` lookup instead of per row | `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/today.integration.test.ts` | the C-6 case fails | **fails** — `1 failed / 16 passed`, `expected 'Top set: leave 1 in the tank.' to be 'Back-off: same bar speed, no grinders.'`. Per-slot independence is genuinely asserted | `identical`, sha256 `751bdbe5…6893e257`, 26660 bytes |
| **NC-R2** (this review's) — break server-side write-once: add `patch.prescription = payload.prescription` to the sessionExercise **update** path | `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sync.integration.test.ts` | the immutability cases fail | **fails** — `1 failed / 19 passed`, but the failure is the **pre-existing** case (`keeps a session_exercise's frozen prescription snapshot immutable across replays and later prescription-definition changes`, `:167-222`). **The new PI-018 case passed.** See F-2 | `identical`, sha256 `d289ce05…8639b7ce`, 63683 bytes |
| **Zod strip probe** | `node -e "…"` | undeclared key silently dropped | `{"a":"x"}` on `zod 3.25.76` — the R-B hazard reproduced on the installed version | n/a |
| **NC-3** (report's, replay idempotence) | inside the I-2 case, run as part of `pnpm test:integration` | note identical after every step | **passes.** Steps 1–3 are asserted immediately and are real; step 4's claim is not (F-2) | n/a |
| **NC-4** (report's, E2E freeze) | not re-executed here | E-4 fails | Inherited. Targeting confirmed by inspection — see §7 | n/a |
| **NC-5** (report's) | inspection only, as specified | n/a | `formatRestSeconds` did not exist before this change, so every U-5 expected value is new by construction | n/a |

`pnpm exec vitest run` over the six touched unit specs after all restores: **6 files, 75 tests
passed**, exit 0.

---

## 5. Findings

All **LOW**. None blocks deployment. F-1 and F-2 carry required corrections cheap enough to fold into
a bounded remediation; F-3 and F-5 are report-only; F-4 is an owner ratification, not a defect.

| ID | Severity | Where | Finding |
|---|---|---|---|
| F-1 | LOW | `docs/BACKLOG.md:32-33` | Duplicated word introduced by this change |
| F-2 | LOW | `tests/integration/sync.integration.test.ts` (new I-2 case); report §5 | The new case does not discriminate the smuggled-snapshot claim mapped to it |
| F-3 | LOW | report §4, §8, §13 | Citation drift in the report that corrects citation drift |
| F-4 | LOW | `docs/ROADMAP.md` rows 1–3 | Delivery-state reconciliation beyond evaluation §9 item 4's authorization |
| F-5 | LOW | report §2, §11 | Test-file miscount; E2E residue declaration incomplete |

### F-1 — `docs/BACKLOG.md` now reads "the selected / selected order is unchanged"

Report §7 records a "six-step order/sequence" → "selected order/sequence" substitution "in ROADMAP and
in two BACKLOG places". One of the two BACKLOG lines already ended in the word "selected", so the
substitution produced a duplicated word:

```text
32: PI-016 optional short-rest hint. These are unselected implementation candidates; the selected
33: selected order is unchanged. Platform feasibility and a possible later prototype are evaluated in
```

The second BACKLOG substitution (`PI-013`'s "Not in the selected six-step sequence." → "Not in the
selected sequence.") and the ROADMAP one are both clean.

**Required correction.** Delete one `selected` on `docs/BACKLOG.md:33`. `docs/` is in
`.prettierignore`, so no formatter would ever have caught this.

### F-2 — the new I-2 case cannot fail when server-side write-once for `prescription` is broken

Report §5 maps this claim to the new case: *"a later update op smuggling a **different** snapshot is
ignored while `skipped:true` applies; the create op replayed once more after that still changes
nothing."*

The case's step 4 applies the smuggling update op and asserts only `updated.applied`. It then
immediately runs **step 5**, a replay of the original create op carrying `originalSnapshot`, and only
*after* that reads the row and asserts `toEqual(originalSnapshot)`. If the update path did write
`prescription`, step 5's replay would write the original snapshot straight back and the final
assertion would still pass.

**Executed (NC-R2).** Adding `if (payload.prescription !== undefined) patch.prescription =
payload.prescription;` to the update path in `src/server/sync/service.ts`:

- the **pre-existing** case (`sync.integration.test.ts:167-222`) **fails** — it reads the row
  *between* the update op and any replay, which is exactly what makes it discriminate;
- the **new PI-018 case passes**, unchanged.

So the property is correct and is properly guarded — but by the older test, not by the one the
acceptance matrix credits. Two of the row's sub-claims (the smuggle, and "the create op replayed once
more still changes nothing") are currently untested.

**Required correction.** One read-back between step 4 and step 5 — e.g.
`expect((await readSnapshot())?.snapshot.prescriptionNotes).toBe(frozenNote)` plus a whole-snapshot
`toEqual` immediately after `applySyncBatch([updateOp])` — and re-run NC-R2 to confirm it then fails.
Alternatively, drop those two sub-claims from §5's I-2 row and cite `:167-222` for them. Not
blocking: nothing ships unguarded either way.

### F-3 — citation drift, in the report that corrects citation drift

§8 presents its L-5 table as "verified against the tree", so exactness matters here more than usual.

- **§4 and §13 item 2** cite `src/server/today/service.ts:244` for `parseHistoryPrescribed`. That is
  the **pre-change** line. This change inserts 18 lines above it, so on the delivered tree the
  function is at `:258` and its `safeParse` at `:262`. A reviewer following the pointer lands 18
  lines short. (`blocks/service.ts:635` and `progression/service.ts:113` are in untouched files and
  are correct.)
- **§8's L-5 table** repeats the architecture review's corrected range for the "Add notes" block as
  `:485-503` (button `:486-493`, textarea `:496-503`). At `cb33264` the block is `:486-506`
  (`<div>` `:486`, `</div>` `:506`), the button `:487-494` and the textarea `:496-504`. Each bound is
  off by one and the block's end by three.
- The other two L-5 corrections are **exact** and were re-derived here: `ExerciseCard.tsx:222-223`
  for the pre-change snapshot reads, and `zod` installed at `3.25.76` against a declared `^3.24.1`.

**Required correction (report only).** Update §4/§13 to `:258`/`:262`, and §8 to `:486-506` (button
`:487-494`, textarea `:496-504`).

### F-4 — the ROADMAP edit is wider than evaluation §9 item 4 authorized

§9 item 4 authorizes exactly: *"insert PI-018 between order 3 (PI-007 Recovery) and order 4 (PI-009
export) … and renumber the rows below it."* The delivered diff also reclassifies row 1 and row 2 from
"Now" to **"Closed"** with deployment/acceptance evidence, row 3 from "Next" to **"In flight"** with
two commit SHAs, and rewrites the paragraph beneath the table. `ROADMAP.md:5-6` says
"[STATUS](STATUS.md) owns actual delivery/gates" and "This file owns priorities and dependencies, not
detailed specifications or implementation authorization", so this is delivery-state text landing in
the file that disclaims it.

Three mitigations, all verified: the report discloses it plainly as "Reconciliation performed before
inserting PI-018"; every claim is accurate (rows 1–2 against `STATUS.md:22`/`:24`, including the
retained D-CE1-1(i) client-coverage boundary; row 3's commits against `git log`); and rows 1–2 are
attributed to STATUS rather than re-certified, with the closing paragraph saying so explicitly. The
alternative — leaving two rows marked "Now" while inserting a new row 4 — would have been actively
misleading.

**No correction required for correctness.** Flagged so the owner ratifies it rather than inheriting
it silently, and so the next agent knows ROADMAP now carries state claims that STATUS does not yet
mirror for PI-007.

### F-5 — report §2 miscount, and an incomplete residue declaration

- §2 says "Eight source/config files and **eight** test files." Its own table lists **nine** test
  files (six extended, three new).
- §11 declares the archived E2E fixture templates as residue but not the **catalog exercises**. The
  spec calls `createMeasurementExercise` twice per test, so a suite run creates four; `teardown`
  archives the template but there is no exercise disposal. I observed exactly this in my own
  disposable database after two suite runs: 8 rows named `PI018%` plus 4 archived templates. The
  behaviour matches the `measurementProfiles.spec.ts` precedent and is harmless (they live only in a
  disposable or CI-fresh database), so this is a declaration gap, not a defect —
  [agent-workflow.md §10](../process/agent-workflow.md#10-report-rules) asks for "the exact
  disposable resources created and dropped, and any left behind with a reason."

**Required correction (report only).** "nine test files"; add the fixture exercises to §11's
"left behind" list with the same reasoning already given for the templates.

---

## 6. Optional advice — no correction required, nothing blocking

- **`.max(2000)` is the snapshot's first length-bounded string.** Both prescription routes cap
  `notes` at `z.string().trim().max(2000)` (`domain/prescriptions/schema.ts:37`, `:52`), and the
  column is bare `text`, so the constraint matches the write path exactly today and the case is
  unreachable. If that cap ever diverges, a stored note longer than 2000 would make
  `buildSessionExerciseUpsertPayload`'s `.parse()` **throw** at `startSession` rather than degrade.
  One comment line beside the schema key would carry that forward.
- **NC-4's landing point, for the record.** The report's re-run failed at
  `workoutPrescriptionContext.spec.ts:283`, which §5 does file under E-4 (the Skip re-check), and the
  observed subtitle `3 × 5 · Rest 30 s` is unmistakably the rewritten program value — so the control
  did exercise the freeze, not an earlier unrelated assertion, and the first attempt's line 217 is
  confirmed to be the C-6 independence assertion it is described as. Worth noting that the *primary*
  E-4 assertions at `:269-272` apparently did **not** fail under the same mutation, most plausibly
  because Playwright's auto-retrying assertions raced an asynchronous live fetch. The control is not
  vacuous, but its discriminating power sits on `:283`. Not re-executed here (inherited — §7).
- **`progression/service.ts:113`** remains the one site that hands a *parsed* `PrescriptionSnapshotData`
  to its caller, and would therefore drop `prescriptionNotes` the day anything persists a parsed
  snapshot. The report already flags this; re-stating it so the flag survives the report's archival.

---

## 7. Evidence

**Change class: sync-contract change** (`src/sync/types.ts` and `src/sync/activeSession.ts` are both
in the manifest; the [matrix](../process/agent-workflow.md#5-evidence-levels-and-the-change-class-matrix)
keys on path, so the class is not arguable). R-level for that class is: full quality gates, the sync
integration files, `pnpm test:e2e:offline` on a clean database, and a replay-idempotence negative
control. All were executed. The E-level full `pnpm test:e2e` was additionally re-executed here on a
fresh bootstrap, because the report's §6 explicitly invites a reviewer to do so rather than trust its
diagnosis.

### Executed by this review

| Command | Exit | Result |
|---|---|---|
| `git status --porcelain` (before) | 0 | 26 modified + 1 deleted + 21 untracked = 48 paths |
| `pnpm lint` | **0** | `eslint .` — no errors, no warnings |
| `pnpm typecheck` | **0** | `tsc --noEmit` |
| `pnpm typecheck:sw` | **0** | `tsc -p tsconfig.worker.json --noEmit` |
| `pnpm format:check` | **0** | `prettier --check .` — clean on the whole repository; no pre-existing CRLF failure on this tree |
| `pnpm test:unit` | **0** | **86 files, 1241 tests passed** |
| `pnpm test:integration` | **0** | **28 files passed / 6 skipped (gated concurrency); 472 passed / 17 skipped** |
| `pnpm build` | **0** | production Next.js build |
| `docker exec gym-app-db-1 psql -U gymapp -d postgres -c "CREATE DATABASE gymapp_t_pi018review;"` | 0 | `CREATE DATABASE` |
| `pnpm db:migrate` / `pnpm db:seed` / start / `/api/health` | 0 / 0 / 0 | health **200** |
| `pnpm exec playwright test tests/e2e/smoke.spec.ts` | **0** | 1 passed (account bootstrapped through the real app) |
| `pnpm db:seed` (2nd) / `pnpm tsx tests/e2e/seed.ts` | **0** / **0** | catalog import + Phase 3 fixture |
| `pnpm test:e2e:offline` | **0** | **34 passed (1.4 m)** — including both new PI-018 tests, on a clean disposable database |
| `pnpm exec playwright test tests/e2e/workoutPrescriptionContext.spec.ts` | **0** | 2 passed (4.2 s) in isolation |
| direct `psql` inspection of `session_exercises.prescription` | 0 | the frozen multiline note and the second slot's different note, persisted verbatim in real PostgreSQL |
| **clean re-bootstrap** (DROP + CREATE + migrate + seed + restart + smoke + seed + fixture) | 0 each | per [agent-workflow.md §7](../process/agent-workflow.md#7-ci-and-local-e2e-bootstrap-order), re-derived from `ci.yml:97-153` |
| `pnpm test:e2e` | **0** | **156 passed (3.0 m)** on the freshly bootstrapped database |
| NC-1 / NC-2 / NC-R1 / NC-R2 / zod probe | see §4 | four source mutations, all restored `identical` by SHA-256 |
| re-run of the six touched unit specs after restores | **0** | 6 files, 75 tests passed |
| `git status --porcelain` (after) | 0 | §8 |

**The report's §6 failed-run history is resolved, proportionately.** The specific unresolved concern
was whether `offline-bodyweight-recovery.spec.ts:282` (PI-007's C-5 no-metric dead-letter case) had
regressed. It passed in my `test:e2e:offline` run on a clean database, and again inside the full
suite — corroborating the report's diagnosis that the earlier failure was same-day recovery state
written by the mis-configured first attempt. My independent **`156 passed`** on a clean bootstrap
matches the report's `156 passed` exactly. No pre-change full-suite comparison was performed, and
none was required: the earlier failure's cause is reproducible-by-pollution and the clean run is
green with the change applied.

### Inherited, not re-executed here

- **NC-4** (the E2E freeze control). It requires mutating `ExerciseCard` to read a live bundle,
  rebuilding, restarting and re-running the spec. The freeze property it targets is independently
  covered here by executed evidence at three other layers — U-7's program-edit case (client), the
  pre-existing immutability case plus NC-R2 (server), and the E2E E-4 assertions running green — so
  re-executing it would have added no coverage. Its targeting is confirmed by inspection (§6).
- **The report's own E-level gate runs.** Re-executed independently rather than inherited; the counts
  above are this review's, and they match the report's for every gate.
- **The architecture evaluation and review are unmodified.** They are untracked, so no `git diff`
  baseline exists; the strongest available check is mtime, and both (22:55 and 23:10 on 2026-09-11)
  predate every implementation edit (23:28–23:37) and the report itself (23:55). Nothing was written
  back to either.

---

## 8. Scope check

`git status --porcelain` after this review differs from before it by **exactly one line that is not
mine**: `?? docs/reviews/set-groups-architecture-review.md`, which appeared **during** this session
from the concurrent Set Groups effort and was left untouched. This review's own file is written last
and is the only path it adds.

Specifically re-verified:

- **No source, test, config, schema or migration file differs from its pre-review state.** All four
  negative-control mutations were restored byte-for-byte with a SHA-256 compare; `git diff --stat`
  over each mutated file returns to its pre-control shape. (`src/domain/schemas/prescriptionSnapshot.ts`
  carries a newer *mtime* than its siblings purely because of NC-1's restore write; its bytes are
  identical, sha256 `0d0b0908…f099b0d0`.)
- **No author report was edited.** `workout-prescription-context-implementation.md`,
  `-architecture-evaluation.md` and `-architecture-review.md` are unchanged.
- **`docs/STATUS.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md` and all architecture documents are
  unchanged by this review.** F-1…F-5 are reported here, not fixed.
- **The concurrent Set Groups and repository-workflow files are unchanged.**
- **No production resource was created, connected to, inspected or modified** — local or Azure. The
  dev `gymapp` database was never connected to, written to, migrated or seeded by this task.

---

## 9. Disposable resources — drop what you created, list what you did not

**Created and dropped:**

- PostgreSQL database **`gymapp_t_pi018review`** on the local Docker instance `gym-app-db-1` —
  created, migrated, seeded, used for the offline E2E gate, then dropped, recreated clean for the
  full-suite run, and **dropped at the end** (`DROP DATABASE`, exit 0). Verified absent: the
  post-drop `pg_database` listing shows `gymapp` plus the five other tasks' databases and nothing
  else.
- Two backgrounded local `pnpm start` production servers on `:3000` — both **stopped**;
  `Get-NetTCPConnection -LocalPort 3000 -State Listen` returns nothing. Neither displaced a
  concurrent server: port 3000 was verified free before the first start.
- Four byte-backup files in the session scratchpad (`nc1.orig`, `nc2.orig`, `ncr1.orig`,
  `ncr2.orig`) and one helper script — the backups deleted after restoration was verified.
- Playwright `test-results/` artifacts from the deliberately-failing controls — removed
  (`test-results/` is gitignored).
- The E2E fixture rows (8 exercises named `PI018%`, 4 archived templates, their prescriptions and
  session rows) lived only inside the dropped disposable database. Nothing survives.

**Left behind, deliberately:**

- **Five pre-existing disposable databases owned by other tasks** — `gymapp_e1rm_remediation`,
  `gymapp_e1rm_verify`, `gymapp_warmup_e2e`, `gymapp_wu_rem_e2e`, `gymapp_wuconc`. Not task-owned;
  deliberately not dropped. (`gymapp_t_prescriptioncontext`, the implementation's own disposable
  database, was already **absent** when this review started — corroborating the report's §12 cleanup
  claim.)
- **`.next/`** — the production build output, gitignored, left as any local build would be.
- **`docs/reviews/set-groups-architecture-review.md`** — concurrent work that appeared during this
  session; untouched and not this task's to manage.
- No production resource was created, connected to, inspected or modified.

---

## 10. What the owner still has to do

Deployment authorization is a human decision and is not implied by this review. After it:

1. **Bounded remediation for F-1 and F-2** (optional before commit, cheap): one word in
   `docs/BACKLOG.md:33`, one read-back in the new I-2 case. F-3 and F-5 are report-only; F-4 is a
   ratification.
2. **Commit by explicit path** per [agent-workflow.md §11](../process/agent-workflow.md#11-manual-ship-checklist)
   — the manifest is six source files, one config file, four documentation files, nine test files and
   the two reports. `docs/BACKLOG.md` and `docs/ROADMAP.md` carry concurrent edits from the Set
   Groups / PI-017 work in the same file; stage them knowingly.
3. **Deploy**, then **physical iPhone acceptance** — the one gate with no agent substitute. Worth
   pairing with the owner-awareness note the BACKLOG entry records: every prescription note already in
   the program becomes visible on the next workout started after deploy, with no per-note opt-out.

---

VERIFIED — READY FOR PI-018 DEPLOYMENT
