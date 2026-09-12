# Workout prescription context (PI-018): independent review of the architecture evaluation

**Date:** 2026-09-11
**Tree:** `cb33264` (dirty — the same concurrent, untouched set the evaluation's header lists;
`git status` at the start of this review matched it exactly, with the evaluation file as the only
addition attributable to it)
**Role:** independent review (design review of an architecture evaluation; no implementation)
**Session:** `O5-1M | PI-018 | Review — Workout Prescription Context`
**Model:** claude-opus-5 (1M context) — see §2, independence caveat
**Task/gate:** the gate raised by
[workout-prescription-context-architecture-evaluation.md](workout-prescription-context-architecture-evaluation.md)
("READY FOR INDEPENDENT WORKOUT PRESCRIPTION CONTEXT REVIEW")
**Authorization boundary:** none granted and none used — no implementation, no database access (local
or production), no staging, no commit, no push, no deployment. The only file written by this task is
this one.
**Files touched:** this file only
**Cites:** [agent-workflow.md](../process/agent-workflow.md) §2/§4/§5/§10;
[workout-prescription-context-architecture-evaluation.md](workout-prescription-context-architecture-evaluation.md)
(the document under review, cited below as "the evaluation");
[athletic-measurement-profiles-architecture-evaluation.md](athletic-measurement-profiles-architecture-evaluation.md)
§13.5/§14.5 and its H-10 row (line 142)

**Verdict: APPROVED — READY FOR WORKOUT PRESCRIPTION CONTEXT IMPLEMENTATION.**
Five LOW findings (§4), none blocking. Per [agent-workflow.md §4](../process/agent-workflow.md#4-severity-convention)
LOW "may be deferred if consciously accepted"; all five are cheap enough to fold into the
implementation pass rather than defer, and L-1 is the only one that changes a line of source.

---

## 1. What was reviewed, and how

The evaluation was read as a specification, not as an argument: every claim the design rests on was
re-derived from the tree rather than accepted from the document. The review spent most of its effort
on the two places a design like this fails — a field that silently disappears somewhere on the wire,
and a cached or legacy shape that throws — and on hunting for a reshaping step the evaluation had
missed. §3 records what was confirmed, §4 what was not, §5 the gap hunt that came back empty.

Nothing in the working tree was modified. The only shell work was read-only (`git status`, `grep`,
`sed -n`, file reads) plus one `node -e` probe of `zod`'s behaviour, §3 row R-B.

## 2. Independence caveat — recorded, not waived

[agent-workflow.md §2](../process/agent-workflow.md#2-roles-and-independence) requires an independent
review to run in "a fresh session, a different model tier from the implementer." This is a fresh
session with no access to the evaluation session's reasoning, and it worked from the evaluation
document and the source only. It is **not** a different model tier: the evaluation and this review
both ran on `claude-opus-5` (1M context). The session-independence half of the rule is satisfied; the
tier half is not. Stated so the owner can decide whether that matters for a design-only gate with no
code to mis-read. It is the owner's call, and nothing below depends on it.

## 3. Load-bearing claims — re-derived from the tree

Every row was checked against source at `cb33264`, not against the evaluation's own citation.

| Claim (evaluation §) | Verdict | What was checked |
|---|---|---|
| F-1 `restSeconds` already reaches the frozen snapshot (§2) | **Confirmed** | `exercisePrescriptions.ts:46` (`smallint`, `ck_…_rest_seconds_positive` at `:57`) → `today/service.ts:85` / `:568` / `:583` → `prescriptionSnapshot.ts:42` → `buildSnapshot.ts:58` → `activeSession.ts:192`. The whole chain exists today. |
| F-2 `ExerciseCard` renders neither (§2) | **Confirmed** | The card's only snapshot reads at render are `scheme`/`targetRir` (`ExerciseCard.tsx:222-223`), rendered at `:307-311`. `restSeconds` appears nowhere in the file. A second `snapshot.scheme` read at `:118` is inside the prefill-resolution helper, not a render site — checked, because two render sites would have widened the change. |
| F-3 notes never leave the program world (§2) | **Confirmed** | `exercise_prescriptions.notes` exists (`exercisePrescriptions.ts:48`; `z.string().trim().max(2000)` at `prescriptions/schema.ts:37`; editable via `PATCH /api/prescriptions/[id]`, whose `updatePrescriptionSchema` types it `.nullable().optional()`), and `buildTodayBundle` never reads `p.notes` (`today/service.ts:560-602`). |
| F-4 `exercise.notes` is a different lifecycle (§2) | **Confirmed** | `sessionExercises.ts:59` ← `activeSession.ts:514` `setExerciseNotes` ← the card's textarea at `ExerciseCard.tsx:496`. |
| **R-B: Zod 3 strips, so omitting the schema key diverges silently** (§2) | **Confirmed — and the right hazard to have centred the design on** | `domain/sync/schema.ts:100` carries the snapshot inside the payload; `payloadBuilders.ts:31-35` `.parse()`s it; the probe reproduced the behaviour independently on the installed version — `z.object({a:z.string()}).parse({a:'x',b:'y'})` → `{"a":"x"}`, `zod@3.25.76`. The local aggregate is never parsed (`activeSessionStore.ts:88-91` → `getLocalActiveSession` → a raw IndexedDB read), so the divergence would be exactly as described: present locally, absent on the wire, no error anywhere. |
| §3.2/§3.6 no migration, no `DB_VERSION` bump | **Confirmed** | Nothing under `src/db/schema/**` changes, so `drizzle-kit check` has nothing to diff; IndexedDB object stores are schemaless, and `bundleCache.ts:19-38` is a spread, not a projection. |
| §3.3 `v` stays 1, `measurement` is the governing precedent | **Confirmed, quotation exact** | `prescriptionSnapshot.ts:55-60` is the additive-optional precedent; `tests/unit/prescriptionSnapshot.test.ts:99` reads verbatim *"keeps v at 1 — additive change, no version bump (ADR-008)"*. |
| §3.4 `SESSION_EXERCISE_FIELDS` untouched | **Confirmed** | `server/sync/service.ts:189-199` lists `prescription` as one key; `measurementSync.integration.test.ts:129-130` sorts and compares that list exactly. A key added *inside* the snapshot cannot move it. |
| §3.5 write-once is already server-side | **Confirmed** | `server/sync/service.ts:699` writes `prescription` in the INSERT values only; `:582-586` states and implements the deliberate ignore on update, and `isNoopSessionExerciseUpdate` (`:570-580`) never consults it. |
| §4 the client mirror must tolerate absence (R-1) | **Confirmed** | `sync/types.ts:255-266` is the `warmupRoutines` asymmetry verbatim ("that asymmetry is the point"); `:111-119` is the `measurement` symmetric-optional counter-case. Both precedents are real and do point opposite ways. See L-2 — on the rationale, not the decision. |
| §5.1 `minutesSecondsLabel` reuse, and the U-5 boundaries | **Confirmed** | `measurement/format.ts:52-58` returns `null` under 60 s, so the `"45 s"` fallback is required and `formatRestSeconds(3600)` → `"60:00"` follows from the implementation as specified. `formatDurationS` (`:60-64`) is module-private, so its dual form was never reusable anyway. |
| §5.1 riding inside the `{scheme && …}` guard creates no dead branch | **Confirmed** | `scheme: setSchemeSchema` is required in `prescriptionSnapshotDataSchema` (`:40`); a snapshot with rest and no scheme cannot parse. |
| §5.2/§5.3 placement, and instructions surviving a skipped slot | **Confirmed as placeable** | The header flex row is `ExerciseCard.tsx:304-356`; the first `!exercise.skipped` guard is at `:357` (recommendation) and the body guard at `:383`. A sibling inserted between `:356` and `:357` is outside both guards and full-width, exactly as §5.2 describes. |
| §6 single freeze site | **Confirmed** | `buildSnapshotFromBundleEntry` is defined at `activeSession.ts:186` and called once, at `:340`. |
| §6 `normalizeActiveSession` must NOT be extended | **Confirmed, and for the stated reason** | `activeSession.ts:106-117` defaults `measurement` because `exercise.measurement.profile` is dereferenced unconditionally; it spreads everything else, so `prescription` already passes through untouched, absent key and all. |
| §7 C-4 stored snapshots are never rewritten | **Confirmed** (see L-3 on how it is stated) | `today/service.ts:418` and `history/service.ts:217` are casts. The three `safeParse` sites are projections that discard their parsed object — none writes back. |
| §7 C-5 rollback degrades, does not dead-letter | **Confirmed** | `sessionExerciseUpsertPayloadSchema` is `.strict()` (`domain/sync/schema.ts:88-112`) but `prescriptionSnapshotSchema` is not, so a nested unknown key is stripped, not rejected — structurally unlike the `measurementProfile` top-level-key limit `tests/unit/sync/rollbackCompatibility.test.ts` records. That file's own header does state the frozen-literal rule U-4 is written to follow. |
| §7 C-6 duplicate slots are independent | **Confirmed** | `today/service.ts:560` iterates `prescriptionRows` and reads `p.*` per row; `exercise_prescriptions` is unique on `(template_id, position)` only. The `decisionChosenByExercise` / `pendingByExercise` maps are keyed by `exerciseId` as the evaluation says — correctly flagged as pre-existing and out of scope. |
| §8 the manifest is complete and correctly typed | **Confirmed** | `ActiveSessionExerciseDto.prescription` is `PrescriptionSnapshot \| null` (`sync/types.ts:150`), so it widens from the Zod infer with no edit — consistent with its absence from the manifest. Every listed import direction holds. |
| §9 the documentation targets exist where claimed | **Confirmed** | `domain-model.md:189` (§6) holds the sketch; `prescription-model.md:190-194` is the §6 matrix with `restSeconds` as its last row; `data-model.md` §2.8 at `:127` and §2.13 at `:214` are as described. `PI-017` is the highest existing identifier, so PI-018 is free; `ROADMAP.md` rows 3 and 4 are PI-007 and PI-009, so the insert renumbers 4→5, 5→6, 6→7. `.prettierignore` does contain `docs/`, so §9's "format:check is not evidence for these files" is right. |
| §10 every cited test file and E2E helper exists | **Confirmed** | All ten cited test files exist. All eight cited helpers (`getActiveProgramInfo`, `createTemplateWithScheme`, `applyScheduleOverride`, `restoreSchedule`, `ensureNoActiveSession`, `OFFLINE_RESOLVER_ARG`, `waitForServiceWorkerControl`, `waitForOutboxDrained`) are exported from `tests/e2e/helpers.ts`. `package.json:24` is the `test:e2e:offline` list §8 file 8 extends. |
| §10 change class is a sync-contract change | **Confirmed, by a simpler route than the one given** | The evaluation argues it from schema-widening. The matrix defines the class by path, and the manifest changes `src/sync/types.ts` and `src/sync/activeSession.ts` — both inside `src/sync`. The class is therefore not arguable at all, which is a stronger position than the evaluation takes for itself. |

**E-4 feasibility, checked because the design depends on it.** E-4 edits a prescription while a
session is running. There is no server-side guard blocking `PATCH /api/prescriptions/[id]` during an
active session (`src/server/prescriptions`, `src/app/api/prescriptions/[id]/route.ts` — searched),
and `updatePrescriptionSchema` accepts both `restSeconds` and `notes` as `.nullable().optional()`.
E-4 is executable as written.

## 4. Findings

All LOW. None changes the storage decision, the data flow, the compatibility rules or the evidence
level.

| ID | Severity | Where | Finding |
|---|---|---|---|
| L-1 | LOW | §8 file 2, §13 step 1, U-2 | Unnecessary builder detour, against the nearest precedent |
| L-2 | LOW | §4 | The right decision, defended with the wrong reason |
| L-3 | LOW | §7 C-4 | "Reads cast rather than parse" is true of two sites, not of the read path |
| L-4 | LOW | §9 item 1 | The document being fixed is already stale in the same way, for `measurement` |
| L-5 | LOW | §2 | Three citation drifts |

### L-1 — `notes` does not need to pass through `buildPrescriptionSnapshotData`

§8 file 2 widens `SnapshotPrescription` with `notes: string | null` and has the builder return
`prescriptionNotes: prescription.notes`; §8 file 4 then reads it back out as
`snapshotData.prescriptionNotes ?? null`. The value is not transformed anywhere in between.

The nearest precedent points the other way, and the evaluation does not mention it. `measurement` —
the field §3.3 correctly nominates as governing for versioning — is **not** produced by
`buildPrescriptionSnapshotData` at all (`buildSnapshot.ts:53-70` returns no `measurement` key); the
server sets it directly on the bundle entry from the exercise row (`today/service.ts:598-601`). The
builder's job is the week-modifier and working-target derivation (`scheme`, `targetRir`, `prefill`,
`appliedModifiers`); fields that are carried rather than derived already bypass it.

Worth naming because it is easy to miss: no snapshot is ever written server-side.
`buildPrescriptionSnapshotData`'s output only populates the bundle entry, and the actual freeze
happens client-side from that entry (`activeSession.ts:186-201`). The builder therefore contributes
nothing at all to the new field's path.

A consequence: U-2's "week modifiers leave it untouched" would be testing a pass-through the design
itself introduced, not a property of the system.

**Recommendation.** Set `prescriptionNotes: p.notes` directly on the bundle entry, drop §8 file 2
entirely, and drop the notes half of U-2. If the builder route is kept instead, record why the
`measurement` precedent is rejected, the way §4 does for its own naming decision. Either way this is
not a correctness defect, and the blast radius is identical — the builder has exactly two callers
(`today/service.ts:563` and `tests/unit/buildSnapshot.test.ts`).

### L-2 — §4's required/optional asymmetry is correct; its stated reason is not the strongest one

The decision (required on `TodayBundleExerciseEntry`, optional on `TodayBundleExerciseEntryDto`) is
right and should stand. The justification should change.

§4 rejects the `measurement` shape on the grounds that "an absent `measurement` had a meaningful
default to fall back to … whereas an absent note means *unknown*". That is a true statement about
defaults, but it is not why `measurement` is optional on the **server** type. The recorded reason is
H-10, and H-10's actual wording is narrower than §4 implies:

> `H-10 | src/sync/types.ts:218-227; warm-up evaluation R-1 | New bundle fields must be optional on
> the client; cached pre-upgrade bundles keep being served (Phase 5 L-4 precedent)`
> — athletic-measurement-profiles-architecture-evaluation.md:142

H-10 constrains the **client mirror only**. The existing code extends it to the server type as well
(`sync/types.ts:111-119` — "Optional here for the same H-10 reason the server's own mirror … types it
optional"), which goes beyond what the finding required and buys nothing, since a server type's
optionality cannot help a cached client. Every other field on that interface — `restSeconds`,
`appliedModifiers`, `pendingRecommendation`, `prefill` — is required.

**Recommendation.** Replace §4's rationale with: H-10 requires optionality on the client mirror and
says nothing about the server type, so required-on-server is both H-10-compliant and the dominant
shape on `TodayBundleExerciseEntry`, and it makes a forgotten population site a compile error. That
reasoning survives someone later re-reading H-10; the defaults argument does not.

### L-3 — §7 C-4's "reads cast rather than parse" understates the read path

C-4 says reads "cast rather than parse (`getActiveSession`, `history/service.ts`)". Both are indeed
casts (`today/service.ts:418`, `history/service.ts:217`). But three other server read paths **do**
`prescriptionSnapshotSchema.safeParse` a stored snapshot:

- `server/today/service.ts:244` `parseHistoryPrescribed` → projects `{scheme, targetRir}`
- `server/blocks/service.ts:635` `extractSnapshotExerciseName` → projects `exerciseName`
- `server/progression/service.ts:113` `parseSnapshot` → returns `parsed.data.snapshot`

C-4's conclusion survives: all three discard the parsed object rather than persisting it, so nothing
rewrites a stored snapshot, and all three keep working after the change because the schema is
non-strict and the new key is optional. But the document should name them, for two reasons — a
reviewer checking C-4 by grep finds them and has to re-derive the answer, and
`progression/service.ts:113` hands a *parsed* `PrescriptionSnapshotData` to its caller, which is
precisely the shape that would drop `prescriptionNotes` the day anything writes one back.

**Recommendation.** One sentence in C-4 listing the three `safeParse` sites and stating that each is
a read-only projection.

### L-4 — §9 item 1's target is already stale in exactly the way item 1 objects to

`domain-model.md:189` reads:

```text
PrescriptionSnapshot = { exerciseId, exerciseName, scheme, targetRir?, restSeconds?,
                         progression: {strategyId, strategyVersion, config, classification},
                         appliedModifiers?: WeekModifiers, prefill: {loadKg?, reps?} }
```

There is no `measurement` key — the release that added it never updated this sketch. §9 item 1's own
argument ("leaving it stale is how the next agent concludes the field doesn't exist") applies to
`measurement` verbatim, and adding only `prescriptionNotes?` leaves the sketch wrong in the same way,
now with a review having noticed.

**Recommendation.** Add both keys in the one-line edit item 1 already authorizes, or state explicitly
that `measurement` is knowingly left for another pass. The former is the same edit and costs nothing.

### L-5 — citation drift

Minor, but the workflow's value depends on citations being checkable:

- §2 F-2 cites `ExerciseCard.tsx:221-222` for the `scheme`/`targetRir` reads; they are at `:222-223`.
- §2 F-4 cites `ExerciseCard.tsx:489-501` for the "Add notes" control; the block is `:485-503`
  (button `:486-493`, textarea `:496-503`), so the cited range starts and ends mid-statement.
- §2 R-B cites `zod@^3.24.1`, which is the declared range in `package.json:44`; the installed version
  is `3.25.76`. The strip behaviour is identical and was reproduced on the installed version (§3), so
  the finding is unaffected — but a rollback-compatibility argument should quote the version it was
  actually observed on.

Every other line-level citation checked in §3 was exact, including the two that carry the most weight
(`tests/unit/prescriptionSnapshot.test.ts:99`'s quoted text and `server/sync/service.ts:699`).

## 5. What this review tried to break, and could not

Recorded so a later reader knows these were checked rather than assumed, and does not re-run them.

- **A reshaping step that drops an unknown bundle key.** The two places the today bundle is rewritten
  before storage both spread: the service worker's `cacheWillUpdate` (`src/app/sw.ts:65` —
  `{...bundle, activeSession: null}`) and `bundleCache.withoutActiveSession`
  (`src/sync/bundleCache.ts:19-22`). Neither enumerates keys. There is also **no** client-side Zod
  parse of the bundle: `TodaySection.tsx:124` and `accountTimezone.ts:51` both cast `res.json()`. So
  `prescriptionNotes` survives every cached representation, and R-B's hazard really is confined to
  the single outbox-payload parse the design already closes.
- **An existing exact-equality assertion the new key would break.** The snapshot-level ones compare
  against a snapshot the test itself built (`sync.integration.test.ts:160`, `:221`); the
  `buildSnapshot` ones are field-level (`:30-47`). Nothing asserts a whole-snapshot key set, so the
  manifest's silence about test churn is accurate rather than an omission.
- **A guard that would make E-4 untestable.** None exists — see the note closing §3.
- **A second render site reading the snapshot.** `ExerciseCard.tsx:118` is prefill resolution, not
  render. §12's "two render sites inside one existing card" holds.
- **U-6(e)'s independence case being unreachable.** It is reachable: `notesOpen` initialises to
  `Boolean(exercise.notes)` (`ExerciseCard.tsx:218`), so a fixture with `exercise.notes` set renders
  the textarea with no interaction, and `renderToStaticMarkup` suffices — the precedent
  `tests/unit/measurement/uiFormatWiring.test.ts:69` already renders `ExerciseCard` exactly this way.
  One test-design caution for the implementer: U-6(b)'s "no stray `·`" assertion should be scoped to
  the subtitle element rather than the whole rendered HTML, because `·` is also emitted by
  `formatSetLine` and by the duration `m:ss` label.
- **NC-2 being vacuous.** It is not, provided U-7 asserts `toBeNull()` as §10 mandates: reverting the
  `?? null` freezes `undefined`, which `toBeNull()` rejects and `toBeFalsy()` would not. The
  evaluation already states this; it was re-derived rather than taken on trust.

## 6. Evidence

**Change class: documentation only** — this review writes one file under `docs/`, which is
`.prettierignore`d. Per the
[change-class matrix](../process/agent-workflow.md#5-evidence-levels-and-the-change-class-matrix),
R-level evidence for a documentation-only change is **"scope check only"**: no suite, no build, and
`format:check` explicitly not applicable. No test suite, migration, seed or concurrency run was
executed by this review, and none was required.

| Command | Exit | Result |
|---|---|---|
| `git status --porcelain` (before) | 0 | 11 modified/deleted plus 12 untracked paths; matched the evaluation's header set exactly, with `docs/reviews/workout-prescription-context-architecture-evaluation.md` the only addition attributable to it |
| `node -e "…zod strip probe…"` | 0 | `{"a":"x"}` on `zod@3.25.76` — R-B reproduced independently |
| `git status --porcelain` (after) | 0 | identical to the "before" run plus exactly one line, this file |

Scope check: the evaluation's claim that it touched one file is **confirmed**. No source file, test,
migration, schema, config or concurrent-work file differs from its pre-evaluation state.

## 7. Disposable resources

**Created:** nothing. No database was created, connected to, or queried — local or production. No
process was started, no server run, no scratchpad file written. All shell work was read-only
(`git status`, `grep`, `sed -n`, file reads) plus the single `node -e` probe recorded in §6, which
wrote nothing.

**Left behind:** nothing. `git status` after this review differs from `git status` before it by
exactly one line — this file.

**Still named for the implementer to create and drop** (unchanged from the evaluation §14): the
integration database `gymapp_t_prescriptioncontext`, and the temporary E2E template, which can only
be archived and must be declared as residue.

---

READY FOR PI-018 IMPLEMENTATION — L-1..L-5 to be applied or consciously accepted by the implementer
