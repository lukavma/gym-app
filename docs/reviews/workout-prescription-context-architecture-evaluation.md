# Workout prescription context (prescribed rest + prescription notes): architecture evaluation

**Date:** 2026-09-11
**Tree:** `cb33264` (dirty — concurrent, untouched: `CLAUDE.md`, `HANDOFF.md` (deleted), `README.md`,
`docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/evidence/*`, `docs/research-notes/*`,
`playwright.config.ts`, `tests/e2e/seed.ts`, and the untracked `docs/process/`,
`docs/reviews/repository-agent-workflow-*.md`, `docs/reviews/exercise-catalog-expansion-closeout.md`,
`docs/reviews/warmup-routines-evidence-research.md`, `gpt-*.md`, `HANDOFF(depracted).md`,
`.claude/skills/`)
**Role:** evaluation (architecture design, no implementation)
**Session:** `O5-1M | PI-018 | Evaluation — Workout Prescription Context`
**Model:** claude-opus-5 (1M context)
**Task/gate:** new backlog item, proposed identifier **PI-018** — owner-inserted between
[PI-007](../BACKLOG.md#pi-007) (Recovery, committed `cb33264`) and
[PI-009](../BACKLOG.md#pi-009) (account data export)
**Authorization boundary:** none granted and none used — no implementation, no database access
(local or production), no staging, no commit, no push, no deployment. The only file written by this
task is this one.
**Files touched:** this file only
**Verdict:** n/a (evaluation)
**Cites:** [agent-workflow.md](../process/agent-workflow.md) §2/§5/§6/§10;
[athletic-measurement-profiles-architecture-evaluation.md](athletic-measurement-profiles-architecture-evaluation.md)
§9.4/§12.2/§12.3/§13.5/§14.5 (the additive-snapshot-key and rollback precedents);
[warmup-routines-architecture-evaluation.md](warmup-routines-architecture-evaluation.md) §8.1 (R-1,
the cached-bundle tolerance rule); [PI-015](../BACKLOG.md#pi-015) (rest timer — excluded, and its
"do not introduce a competing prescribed rest field" rule is honoured here).

This is a small, bounded read-path change. The document records only what an implementer and an
independent reviewer need. §2 confirms the owner's source findings against the tree; §3 records the
schema/versioning/sync inspection that decides the storage approach; §12 lists what is deliberately
excluded.

---

## 1. Scope

**In scope (owner-selected):**

1. Display the **prescribed rest** for a scheduled exercise on its workout card.
2. Display the **prescription notes** authored in the program exercise editor on that same card.
3. Keep those prescription instructions visually and structurally distinct from the **editable
   session notes** already on the card.
4. Freeze the instructions **per prescription slot** at workout start, so they survive offline start,
   reload/resume and sync, and so later program edits cannot change a running workout.
5. Handle pre-existing cached bundles, pre-existing frozen snapshots and ad-hoc exercises safely,
   **without reconstructing missing historical instructions from current program data**.
6. Preserve independent instructions when one exercise occupies two prescription slots in the same
   template.

**Out of scope (owner-stated, restated in §12 with the reasons):** rest timer, notifications,
short-rest warning, any progression change, any app-wide redesign.

**One item requiring owner awareness before deploy (not a blocking decision, see §11):** every
prescription note that already exists in the program becomes visible during execution on the next
workout started after deploy. There is no per-note opt-out in this design. If any existing note was
written as private planning text rather than an execution cue, it should be edited or cleared in the
program editor beforehand.

---

## 2. Confirmation of the source findings

All four stated findings are confirmed. Two need a refinement that changes the design.

| # | Owner's finding | Verdict | Evidence |
|---|---|---|---|
| F-1 | `restSeconds` already reaches the frozen prescription snapshot | **Confirmed** | Column [`exercisePrescriptions.ts:46`](../../src/db/schema/exercisePrescriptions.ts#L46) → bundle entry [`today/service.ts:85,568,583`](../../src/server/today/service.ts#L583) → snapshot field [`prescriptionSnapshot.ts:42`](../../src/domain/schemas/prescriptionSnapshot.ts#L42), written by [`buildSnapshot.ts:58`](../../src/domain/prescriptions/buildSnapshot.ts#L58) and frozen client-side by [`activeSession.ts:192`](../../src/sync/activeSession.ts#L192) |
| F-2 | `ExerciseCard` does not display it | **Confirmed** | The card reads only `scheme` and `targetRir` off the snapshot ([`ExerciseCard.tsx:221-222`](../../src/ui/workout/ExerciseCard.tsx#L221-L222)) and renders only those two ([`:307-311`](../../src/ui/workout/ExerciseCard.tsx#L307-L311)). `restSeconds` appears nowhere in the file. |
| F-3 | Prescription notes are not carried through the Today bundle / start-session snapshot path | **Confirmed** | `exercise_prescriptions.notes` exists ([`exercisePrescriptions.ts:48`](../../src/db/schema/exercisePrescriptions.ts#L48), validated `z.string().trim().max(2000)` at [`prescriptions/schema.ts:37`](../../src/domain/prescriptions/schema.ts#L37)) and is read into `PrescriptionRecord` for the editor, but `TodayBundleExerciseEntry` has no notes field, `buildPrescriptionSnapshotData` takes no notes input, and `prescriptionSnapshotDataSchema` has no notes key. `buildTodayBundle` selects the whole prescription row and simply never reads `p.notes`. |
| F-4 | `exercise.notes` in the active workout is separate session notes | **Confirmed** | `session_exercises.notes` ([`sessionExercises.ts:59`](../../src/db/schema/sessionExercises.ts#L59)) ← `setExerciseNotes` ([`activeSession.ts:514`](../../src/sync/activeSession.ts#L514)) ← the card's "Add notes" textarea ([`ExerciseCard.tsx:489-501`](../../src/ui/workout/ExerciseCard.tsx#L489-L501)). A different table, a different column, a different lifecycle (mutable during the session, synced on every edit). |

**Refinement R-A (changes the design).** F-1 is true of the *snapshot*, and therefore of every
session already in flight — `restSeconds` has been frozen since Phase 3. Displaying it is a pure UI
change with **no** compatibility work: a workout that straddles the deploy will correctly show the
rest its own snapshot already carries. The asymmetry that follows is intended and is the
no-reconstruction rule working: that same straddling session shows **rest but no note**, because its
snapshot was written before notes existed. See §7 C-1.

**Refinement R-B (changes the design).** The snapshot travels to the server inside the existing
`sessionExercise` sync payload — `prescription: prescriptionSnapshotSchema.nullable().optional()`
([`domain/sync/schema.ts:100`](../../src/domain/sync/schema.ts#L100)) — and
`buildSessionExerciseUpsertPayload` runs `sessionExerciseUpsertPayloadSchema.parse(input)`
([`payloadBuilders.ts:32-36`](../../src/domain/sync/payloadBuilders.ts#L32-L36)). `zod@^3.24.1`'s
`z.object` **strips** undeclared keys rather than rejecting them (verified directly:
`z.object({a:z.string()}).parse({a:"x",b:"y"})` → `{"a":"x"}`). So adding a note to the snapshot
without adding it to `prescriptionSnapshotDataSchema` would produce a **silent divergence** — the
local IndexedDB aggregate (never parsed) would hold the note, the outbox op would not, and the note
would vanish on cross-device adopt or post-eviction resume, with no error anywhere. The Zod schema
change is therefore load-bearing, not cosmetic, and §10 U-3 exists specifically to prove it.

---

## 3. Contract sufficiency — inspected, and no migration is required

The instruction was to inspect the actual schema/versioning and sync contracts rather than assume.
Here is what each one already permits.

**3.1 Source data — already exists, no column needed.** `exercise_prescriptions.notes text` and
`rest_seconds smallint ck > 0` are both present and already editable in the program exercise editor
([`PrescriptionForm.tsx:530-539`](../../src/ui/prescriptions/PrescriptionForm.tsx#L530-L539) "Rest
(seconds, optional)"; [`:579-587`](../../src/ui/prescriptions/PrescriptionForm.tsx#L579-L587) "Notes
(optional)"). Nothing is added to `exercise_prescriptions`.

**3.2 Destination — the existing JSONB column absorbs it.** `session_exercises.prescription` is
`jsonb` holding a versioned `PrescriptionSnapshot`. Adding a key to that JSON document changes no
column, no constraint and no index. **No Drizzle migration.** `pnpm exec drizzle-kit check` has
nothing to diff, because drizzle-kit diffs its own TS-schema snapshot and no TS schema file changes.

**3.3 Versioning — additive optional key, `v` stays 1.** `prescriptionSnapshotSchema` pins
`v: z.literal(PRESCRIPTION_SNAPSHOT_VERSION)` with the version at 1, and the file's own header
states the rule: bump only "if the shape ever changes", with existing rows never rewritten. The
governing precedent is the immediately preceding one — Athletic Measurement Profiles added
`measurement` to this exact schema as an optional key with no bump, and
[`tests/unit/prescriptionSnapshot.test.ts:99`](../../tests/unit/prescriptionSnapshot.test.ts#L99)
asserts that in so many words: *"keeps v at 1 — additive change, no version bump (ADR-008)"*. A bump
would be actively wrong here: it would require an upgrade function for a value that is genuinely
absent and must stay absent (§7 C-1). **No version bump, no upgrader.**

**3.4 Sync contract — no payload key, no field-set change.** The note rides *inside* the existing
`prescription` payload field, so `SESSION_EXERCISE_FIELDS`
([`server/sync/service.ts:189-199`](../../src/server/sync/service.ts#L189-L199)) is unchanged, and
`measurementSync.integration.test.ts`'s exact-equality assertion over that list
([`:129-130`](../../tests/integration/measurementSync.integration.test.ts#L129-L130)) keeps passing
untouched. `sessionExerciseUpsertPayloadSchema` gains no key and stays `.strict()`. The W-1
fixed-key-set discipline for `sessionExerciseFullRowOp` is unaffected.

**3.5 Write-once semantics — already guaranteed server-side.** `applySessionExerciseUpsert` writes
`prescription` **only on insert** (`payload.prescription ?? null`,
[`server/sync/service.ts:699`](../../src/server/sync/service.ts#L699)) and deliberately ignores it on
every update path ([`:582-586`](../../src/server/sync/service.ts#L582-L586)). This is what makes
"later program edits must not change a running workout" a property of the system rather than of the
UI: even a hand-crafted replayed op cannot rewrite a frozen snapshot.

**3.6 Conclusion.** The existing contracts are sufficient. The change is: one optional Zod key, one
field threaded through two DTO mirrors and two builders, one formatter, one card render. **No
migration, no version bump, no sync payload change, no IndexedDB `DB_VERSION` bump** (object stores
are schemaless, and the aggregate is read back without validation).

---

## 4. Naming, and keeping prescription instructions distinct from session notes

Two different `notes` already exist one dereference apart, and the card will now render both. The
snapshot key is therefore **`prescriptionNotes`**, not `notes`.

| Concept | Storage | Shape at the card | Mutability |
|---|---|---|---|
| Prescription instruction (new) | `exercise_prescriptions.notes` → frozen into `session_exercises.prescription` JSONB | `exercise.prescription?.snapshot.prescriptionNotes` | **Read-only in the workout.** Frozen at start; a program edit never reaches a running session. |
| Session note (existing, unchanged) | `session_exercises.notes` | `exercise.notes` | Editable in the workout, synced per edit. |

This follows the file's own convention of qualifying a key by its source when ambiguity exists
(`exerciseId`, `exerciseName` sit beside `scheme`, `prefill` in the same object). `snapshot.notes`
would have put `exercise.notes` and `snapshot.notes` side by side in one render function — a misread
that no type checker would catch, since both are `string | null`.

At the boundary the name changes deliberately: `SnapshotPrescription` (the input to
`buildPrescriptionSnapshotData`, which models the *prescription row*) takes `notes`, matching the
column; the emitted snapshot key is `prescriptionNotes`. The implementer should carry a one-line
comment saying so at both ends.

**Required/optional asymmetry across the two bundle mirrors.** Two precedents in this repo point
opposite ways, so this is stated explicitly rather than copied:

- Server type `TodayBundleExerciseEntry.prescriptionNotes: string | null` — **required**. The server
  always has a value to give (`p.notes` is `string | null`, never absent); a required type makes
  forgetting to populate it a compile error.
- Client mirror `TodayBundleExerciseEntryDto.prescriptionNotes?: string | null` — **optional**. This
  is R-1's mandatory tolerance rule: a bundle served from the SW `today-bundle` cache or the
  IndexedDB `bundleCache` after deploy genuinely has no such key, and the Phase 5 L-4 regression (a
  cached bundle lacking `appliedModifiers` made offline start throw) is exactly what assuming
  otherwise costs.

That asymmetry is the shape `warmupRoutines` already uses, and [`sync/types.ts:250-266`](../../src/sync/types.ts#L250-L266)
says the asymmetry "is the point". The symmetric-optional shape used for `measurement` does not
apply here: an absent `measurement` had a meaningful default to fall back to (`load_reps` /
`unspecified` — what every pre-Release-2 row already was), whereas an absent note means *unknown*
and must never be defaulted to anything but "render nothing".

---

## 5. UI placement, copy and empty-value behaviour

### 5.1 Prescribed rest — appended to the existing prescription subtitle

The card header already renders one prescription subtitle line
([`ExerciseCard.tsx:307-311`](../../src/ui/workout/ExerciseCard.tsx#L307-L311)). Rest is the same
class of information and is always short, so it joins that line rather than adding vertical space on
a phone:

```text
Bench Press
3 × 5 @ RIR 1-2 · Rest 2:30
```

The `·` separator is the app's existing duration separator (`formatDurationS`,
[`measurement/format.ts:60-64`](../../src/domain/measurement/format.ts#L60-L64)).

Riding inside the existing `{scheme && (…)}` guard is safe and creates no dead branch: `restSeconds`
can only come from a snapshot, and every snapshot has a `scheme` (`scheme` is required in
`prescriptionSnapshotDataSchema`). A slot with rest and no scheme cannot exist.

**Format.** `formatRestSeconds(150)` → `"2:30"`; `formatRestSeconds(45)` → `"45 s"`. It reuses the
exported `minutesSecondsLabel`, whose own header comment instructs callers to reuse it rather than
re-derive the floor/divide arithmetic. It deliberately does **not** reuse `formatDurationS`'s dual
form (`"150 s · 2:30"`): that form exists so a *logged* set shows the stored figure alongside a clock
reading, whereas a prescribed rest target is only ever read as a clock. A compact subtitle carrying
`3 × 5 @ RIR 1-2 · Rest 150 s · 2:30` would be worse on a phone for no gain.

**Placement of the helper.** `formatRestSeconds` goes in
[`src/domain/measurement/format.ts`](../../src/domain/measurement/format.ts), beside
`minutesSecondsLabel`/`formatDurationS` — the module that already owns seconds→clock rendering and
that documents itself as the reuse point. Card-local was considered (the precedent being
`schemeDistanceM`/`nounForProfile` in `ExerciseCard.tsx`) and rejected: those wrappers exist to keep
athletic logic *out* of a domain module that must not absorb it, whereas this is exactly that
module's subject matter, and the boundary cases (59/60/3600) deserve a direct unit test that a
non-exported card-local function cannot get.

### 5.2 Prescription notes — a labelled, read-only, full-width block under the header

Rendered as a sibling *after* the header flex row and *before* the recommendation card, so a long
note gets the full card width rather than being squeezed against the Skip button:

```text
Bench Press                                             [Skip]
3 × 5 @ RIR 1-2 · Rest 2:30
Program note: Pause 1 s on the chest. Elbows ~45°.
────────────────────────────────────────────────────────────
[ warm-up toggle · kg · reps · RIR · Log ]
Add notes
```

**Copy: `Program note: `** as a muted inline prefix on a `<p>`. It states the origin (the program,
not this session), reads as read-only, and cannot be confused with the "Add notes" control below.
"Prescribed" was rejected — the scheme/RIR/rest line above it is equally prescribed, so the label
would not have distinguished anything.

**Rendering:** `whitespace-pre-wrap break-words` — the athlete's own line breaks are part of the
instruction, and a long unbroken token must not widen the card. `break-words` also protects the
"page body must never scroll horizontally" property.

**Not clamped.** The field allows up to 2000 characters, so a long note can push the Log button below
the fold. A clamp with a "More" control was considered and rejected for this release: the owner is
both the author and the only reader, the whole point of the change is that the instruction is visible
*before* the set, and hiding it behind a tap would partly undo that. This is an accepted trade-off,
not an oversight; a clamp is purely additive later if real training use shows it hurts.

### 5.3 Empty-value behaviour

| Case | Rest | Note |
|---|---|---|
| Value present | `· Rest 2:30` appended | `Program note: …` block renders |
| Value `null` | Nothing rendered — no separator, no `—` | Block not rendered at all |
| Key absent (legacy snapshot / pre-upgrade cached bundle) | n/a (`restSeconds` predates this change) | Block not rendered at all |
| Whitespace-only string | n/a | Block not rendered (guard is `typeof v === "string" && v.trim() !== ""`) |
| Ad-hoc slot (`prescription: null`) | Nothing | Nothing |
| Skipped slot | Still rendered | Still rendered |

Omission — not a placeholder — is the card's established convention for an absent prescription value:
the subtitle already drops the RIR clause entirely when `targetRir` is null. The `—` character is
used in this file only as an *input placeholder* for an optional field, never as a display value.

The whitespace guard is defensive, not load-bearing: the write path already trims
(`z.string().trim()`). It costs nothing and makes the three "nothing to show" cases collapse to one
branch.

Instructions stay visible on a **skipped** slot (outside the `!exercise.skipped` guard, like the
scheme line) — the slot is one tap from being unskipped, and the context is what informs that tap.

---

## 6. Data flow

```text
exercise_prescriptions.notes / .rest_seconds        (mutable program definition)
        │
        │  buildTodayBundle — reads the row it already selects
        ▼
buildPrescriptionSnapshotData({… notes, restSeconds …})
        │                         → PrescriptionSnapshotData.prescriptionNotes / .restSeconds
        ▼
TodayBundleExerciseEntry.prescriptionNotes / .restSeconds     GET /api/today-bundle
        │                                                     ├─ SW "today-bundle" cache (NetworkFirst/3s)
        │                                                     └─ IndexedDB bundleCache
        ▼
  Start workout  ──► startSession() ──► buildSnapshotFromBundleEntry(entry)
        │                                   prescriptionNotes: entry.prescriptionNotes ?? null
        ▼                                   restSeconds:       entry.restSeconds
  PrescriptionSnapshot, frozen ONCE                       (ADR-007 snapshot-on-use)
        │
        ├─► IndexedDB activeSession aggregate ──► reload / iOS relaunch / same-device resume
        │        (read back verbatim, no validation)
        │
        └─► outbox sessionExercise upsert ──► server INSERT ONLY ──► session_exercises.prescription
                 (payload.prescription)         (never on update)            │
                                                                             ▼
                                                            GET /api/active-session ──► cross-device
                                                            adopt / post-eviction resume (verbatim cast)
        ▼
ExerciseCard reads exercise.prescription?.snapshot.{restSeconds, prescriptionNotes}
        (the local aggregate only — WorkoutExecution never re-reads the today bundle)
```

Three properties fall out of the diagram, and none of them is new code:

- **Frozen per slot, once.** `startSession` maps each bundle entry — one per
  `exercise_prescriptions` row, in `position` order — to its own `session_exercises` row with its own
  snapshot. Two slots holding the same `exerciseId` produce two entries and two independent
  snapshots. (`exercise_prescriptions` has no uniqueness constraint on `(template_id, exercise_id)` —
  only `uq_prescriptions_position` on `(template_id, position)` — so duplicate slots are a supported
  shape, and are exactly what [PI-012](../BACKLOG.md#pi-012) linked top-set/back-off would use.)
- **Immune to later program edits.** `WorkoutExecution` hydrates only from the local IndexedDB
  aggregate ([`activeSessionStore.ts:88-91`](../../src/sync/activeSessionStore.ts#L88-L91)) and never
  fetches the today bundle; the server never writes `prescription` on update (§3.5). Both halves of
  the path are already closed.
- **Survives offline, reload and sync.** The value is inside the same JSONB blob as `scheme`, which
  already survives all three. No new persistence mechanism is introduced.

**`normalizeActiveSession` is deliberately NOT extended.** It defaults `measurement` because
downstream code dereferences `exercise.measurement.profile` unconditionally and would throw on a
pre-upgrade aggregate. Every read of the new field is `exercise.prescription?.snapshot.prescriptionNotes`,
where `undefined` is already the correct, safe answer. Adding a normalizer would be dead code that
also erases the absent-vs-null distinction in stored history for no benefit.

---

## 7. Compatibility rules

**C-1 — Never reconstruct.** A workout card renders only what its own frozen snapshot carries. No
code path in this design reads `exercise_prescriptions` during a workout. Concretely:

| Situation | Rest shown | Note shown | Why |
|---|---|---|---|
| Session started after deploy | Yes | Yes | Frozen at start from the bundle |
| Session in flight across the deploy | **Yes** | **No** | Its snapshot has `restSeconds` (frozen since Phase 3) but no `prescriptionNotes` key. Showing rest is not reconstruction — it is the value that session actually froze. |
| Completed historical session | n/a (History is out of scope, §12) | n/a | The snapshot is what it is; nothing is backfilled |
| Ad-hoc slot | No | No | `prescription: null`, structurally |

There is no backfill, no migration writing into existing JSONB, and no "if the snapshot lacks it, ask
the program" fallback anywhere. That fallback is the single thing this design must not contain, and a
reviewer should grep for any read of `exercisePrescriptions` inside the execution path to confirm it.

**C-2 — Old cached bundles.** A bundle served from the SW cache or `bundleCache` after deploy has no
`prescriptionNotes` key. The client DTO types it optional (§4), and the one freeze site coerces:
`prescriptionNotes: entry.prescriptionNotes ?? null`. Starting a workout from such a bundle succeeds
and shows no note — it does not throw (the Phase 5 L-4 failure mode) and does not guess.

**C-3 — Absent vs null, at the freeze site.** A newly frozen snapshot **always** carries the key,
`null` when unknown or genuinely empty. The alternative — omitting the key when the source entry
omits it, preserving "stale cache" as distinguishable from "no note" in stored JSONB — was considered
and rejected: nothing reads the distinction (both render nothing, §5.3), a conditional spread is
harder to read than a `??`, and a fixed key set on freshly written snapshots matches the same
discipline W-1 enforces for payload key sets. Old rows keep their absent key untouched; only newly
written snapshots are uniform.

**C-4 — Existing snapshots are never rewritten.** ADR-007, and mechanically guaranteed by §3.5.
Reads cast rather than parse (`getActiveSession`, `history/service.ts`), so nothing on the read path
can strip or rewrite a stored snapshot either.

**C-5 — Rollback tolerance.** Deployment here is one Next.js app, so "new client + old server" arises
only from a rollback. It degrades gracefully rather than dead-lettering: the top-level
`sessionExerciseUpsertPayloadSchema` is `.strict()`, but `prescription` is parsed by the **non-strict**
`prescriptionSnapshotSchema`, so an old server *strips* `prescriptionNotes` and applies the op. The
row simply stores a snapshot without notes; sets, session and everything else are unaffected. This is
strictly better than the pre-existing `measurementProfile` rollback limit recorded in
[`tests/unit/sync/rollbackCompatibility.test.ts`](../../tests/unit/sync/rollbackCompatibility.test.ts),
and §10 U-4 proves it against a frozen pre-feature copy of the schema.

**C-6 — Duplicate slots.** Independent by construction (§6). The risk worth testing is not the
snapshot — it is that something upstream keys by `exerciseId` and collapses the two. `buildTodayBundle`
does key `decisionChosenByExercise` and `pendingByExercise` by `exerciseId` (pre-existing behaviour,
out of scope), but reads `p.notes` / `p.restSeconds` from each prescription row directly. §10 I-1 and
E-1 assert the independence end to end rather than by inspection.

**C-7 — Ad-hoc exercises.** `addAdhocExercise` sets `prescription: null` and is not touched. The card's
optional chain yields `undefined` for both fields. No branch is added for ad-hoc.

---

## 8. File manifest

Nine source files, none of them a schema/migration file. Paths are exact; the "why" column is what a
reviewer should check the diff against.

| # | File | Change |
|---|---|---|
| 1 | [`src/domain/schemas/prescriptionSnapshot.ts`](../../src/domain/schemas/prescriptionSnapshot.ts) | Add `prescriptionNotes: z.string().max(2000).nullable().optional()` to `prescriptionSnapshotDataSchema`. **No `.trim()`** (a transform would mutate historical values on read). **No `v` bump.** Comment: additive-optional, the `measurement` precedent, and the R-B strip hazard. |
| 2 | [`src/domain/prescriptions/buildSnapshot.ts`](../../src/domain/prescriptions/buildSnapshot.ts) | `SnapshotPrescription` gains `notes: string \| null`; the returned object gains `prescriptionNotes: prescription.notes`. Carried verbatim — week modifiers must not touch it. |
| 3 | [`src/domain/measurement/format.ts`](../../src/domain/measurement/format.ts) | New exported `formatRestSeconds(restSeconds: number): string` reusing `minutesSecondsLabel` (§5.1). |
| 4 | [`src/server/today/service.ts`](../../src/server/today/service.ts) | `TodayBundleExerciseEntry` gains `prescriptionNotes: string \| null` (required, §4); pass `notes: p.notes` into `buildPrescriptionSnapshotData`; set `prescriptionNotes: snapshotData.prescriptionNotes ?? null` on the entry beside the existing `restSeconds:` line. |
| 5 | [`src/sync/types.ts`](../../src/sync/types.ts) | `TodayBundleExerciseEntryDto` gains `prescriptionNotes?: string \| null` (optional, §4) with the R-1 tolerance comment. |
| 6 | [`src/sync/activeSession.ts`](../../src/sync/activeSession.ts) | `buildSnapshotFromBundleEntry` gains `prescriptionNotes: entry.prescriptionNotes ?? null`. Single freeze site. **`normalizeActiveSession` unchanged** (§6). |
| 7 | [`src/ui/workout/ExerciseCard.tsx`](../../src/ui/workout/ExerciseCard.tsx) | Read `restSeconds`/`prescriptionNotes` beside the existing `scheme`/`targetRir` reads (`:221-222`); append the rest clause inside the existing subtitle guard (`:307-311`); add the `Program note:` block after the header row, before the recommendation card. Import `formatRestSeconds`. |
| 8 | `package.json` | Add the new offline-capable E2E spec to the `test:e2e:offline` list (§10 explains why this class needs it). |
| 9 | `docs/**` | §9. |

**Not changed, deliberately:** `src/db/schema/**` and `drizzle/**` (no migration, §3.2);
`src/domain/sync/schema.ts` and `SESSION_EXERCISE_FIELDS` (no payload key, §3.4); `src/sync/db.ts`
(no `DB_VERSION` bump); `src/server/sync/service.ts` (write-once already correct, §3.5);
`src/ui/history/**` and `src/server/history/service.ts` (§12); `src/ui/prescriptions/**` (both fields
are already editable); `tests/e2e/seed.ts` and `playwright.config.ts` (both carry concurrent
uncommitted edits — §10 designs around them).

Layering check: every new import is `domain → domain`, `server → domain`, `sync → domain`,
`ui → domain|sync`. No `boundaries/element-types` rule is crossed.

---

## 9. Required documentation and contract changes

**Required:**

1. [`docs/architecture/domain-model.md`](../architecture/domain-model.md) §6 — the
   `PrescriptionSnapshot = { … }` sketch gains `prescriptionNotes?`. This is the document that
   enumerates the snapshot's fields; leaving it stale is how the next agent concludes the field
   doesn't exist.
2. [`docs/architecture/pwa-offline-strategy.md`](../architecture/pwa-offline-strategy.md) §4 — the
   `WorkoutContextBundle` sketch, whose "todayTemplate + effective prescriptions" line now also
   carries the prescription note. Add one sentence recording the R-1 tolerance (optional on the
   client mirror, absent in a pre-upgrade cached bundle).
3. [`docs/BACKLOG.md`](../BACKLOG.md) — a new **PI-018** entry (next free identifier; PI-017 is the
   current highest) stating the accepted scope, the explicit exclusions, and the relationship to
   PI-015/PI-016. Must record that this displays PI-015's existing `restSeconds` target and
   introduces **no competing prescribed rest field**, satisfying PI-015's own rule.
4. [`docs/ROADMAP.md`](../ROADMAP.md) — insert PI-018 between order 3 (PI-007 Recovery) and order 4
   (PI-009 export), per the owner's instruction, and renumber the rows below it.

**Recommended, specified so the implementer need not decide:**

5. [`docs/architecture/prescription-model.md`](../architecture/prescription-model.md) §6 — add a
   `| notes | O | O | O | O | O | O |` row to the "Other prescription fields by profile" matrix,
   below the existing `restSeconds` row. `notes` is profile-independent and rejected by nothing; the
   row exists so the matrix reads as complete rather than as silence about a field that now reaches
   the snapshot.

**Explicitly NOT required, having been checked:**

- `docs/architecture/data-model.md` §2.8 already lists `notes text | null`; §2.13 describes the
  `prescription` column as "PrescriptionSnapshot (null for free ad-hoc)" without enumerating fields.
  Neither is made stale by this change. **No edit.**
- `docs/architecture/adr/ADR-007` / `ADR-008` — this change is an instance of both, not an amendment
  to either. **No edit, and no new ADR.**
- `docs/STATUS.md` — release state, written by the designated closeout editor from evidence after a
  release, not by the implementer.

**Coordination hazard.** `docs/BACKLOG.md` and `docs/ROADMAP.md` both carry **uncommitted concurrent
edits** in the working tree at `cb33264`. Items 3 and 4 must be applied on top of whatever those
edits become, not against `HEAD`, and must be staged by explicit path per
[agent-workflow.md §11](../process/agent-workflow.md). `docs/` is in `.prettierignore`, so
`pnpm format:check` does not cover these files and is not evidence for them.

---

## 10. Acceptance tests and negative controls

**Change class.** Honestly classified as a **sync-contract change**, not "UI only": although no
payload key is added, `src/domain/schemas/prescriptionSnapshot.ts` is imported by
`src/domain/sync/schema.ts`, so the change widens what the wire accepts and what a rolled-back server
tolerates. Per the [change-class matrix](../process/agent-workflow.md#5-evidence-levels-and-the-change-class-matrix)
that means: **E = full quality gates + full `pnpm test:e2e`** (load-bearing for this class), and
**R = full quality gates, sync integration files, `pnpm test:e2e:offline` on a clean DB, plus a
replay-idempotence negative control**. Arguing this down to "UI only" to skip E2E would be the wrong
call and a reviewer should reject it.

### Unit

| ID | File | Assertion |
|---|---|---|
| U-1 | `tests/unit/prescriptionSnapshot.test.ts` | A v1 snapshot object with **no** `prescriptionNotes` key parses unchanged (legacy tolerance); one carrying a string round-trips; `null` accepted; >2000 chars rejected; **`v` still 1** (extend the existing `:99` assertion rather than duplicating it). |
| U-2 | `tests/unit/buildSnapshot.test.ts` | `buildPrescriptionSnapshotData` carries `notes` → `prescriptionNotes` verbatim, including `null`, and **week modifiers leave it untouched** (run the existing deload case and assert the note is byte-identical). |
| U-3 | `tests/unit/activeSessionPayloads.test.ts` | **The R-B strip hazard.** `buildSessionExerciseUpsertPayload` with a snapshot carrying `prescriptionNotes` returns a payload that still carries it. Without the §8 file 1 change this silently fails — which is the whole reason the test exists. |
| U-4 | `tests/unit/sync/rollbackCompatibility.test.ts` | **C-5.** A new-build snapshot carrying `prescriptionNotes` parses against a *frozen* pre-feature copy of `prescriptionSnapshotDataSchema` (key stripped, no throw) — i.e. a rollback degrades, it does not dead-letter. Frozen literal, deliberately not imported from the live module, per that file's own stated rule. |
| U-5 | `tests/unit/measurement/format.test.ts` | `formatRestSeconds` boundaries: 1 → `"1 s"`, 59 → `"59 s"`, 60 → `"1:00"`, 61 → `"1:01"`, 90 → `"1:30"`, 150 → `"2:30"`, 3599 → `"59:59"`, 3600 → `"60:00"`. |
| U-6 | `tests/unit/workout/prescriptionContextCard.test.ts` (new) | Card rendering, via `renderToStaticMarkup` + `React.createElement` in a `.test.ts` file — the precedent is [`tests/unit/measurement/uiFormatWiring.test.ts`](../../tests/unit/measurement/uiFormatWiring.test.ts), which already renders `ExerciseCard` this way with no test-runner config change. Cases: (a) rest + note both render, with `Program note`; (b) both `null` → neither label nor a stray `·` appears; (c) **legacy snapshot literal with no `prescriptionNotes` key** → no note block, rest still renders (the R-A asymmetry); (d) `prescription: null` ad-hoc → neither; (e) **independence** — `exercise.notes = "session text"` and `prescriptionNotes = "program text"` both appear, and the textarea's `defaultValue` is `"session text"` only; (f) skipped slot still shows both. |
| U-7 | `tests/unit/activeSessionConcurrency.test.ts` (or a sibling using its `fake-indexeddb` setup) | **C-2.** `startSession` given a bundle entry object with **no** `prescriptionNotes` key does not throw and freezes the key as `null` — asserted with `toBeNull()`, strictly, so that NC-2 discriminates (a `toBeFalsy()` or whole-object `toEqual` would pass on `undefined` and prove nothing). The Phase 5 L-4 guard for the new field. |

### Integration (local Docker Postgres, `gymapp_t_prescriptioncontext`)

| ID | File | Assertion |
|---|---|---|
| I-1 | `tests/integration/today.integration.test.ts` | The bundle entry carries `prescriptionNotes` verbatim from `exercise_prescriptions.notes`, `null` when unset; and **two prescriptions for the same `exerciseId` in one template produce two entries with their own distinct `prescriptionNotes`/`restSeconds`** (C-6 at the source). |
| I-2 | `tests/integration/sync.integration.test.ts` | A `sessionExercise` upsert whose `prescription` carries `prescriptionNotes` persists it verbatim into `session_exercises.prescription`; **a later update op for the same row (e.g. `skipped:true`) leaves the frozen note unchanged** (§3.5 / "later program edits must not change a running workout"), and a verbatim **replay** of the original create op is idempotent and still does not rewrite it. |

### E2E (`tests/e2e/workoutPrescriptionContext.spec.ts`, new; added to `test:e2e:offline`)

Setup uses the existing isolation helpers rather than mutating the shared seeded prescription, so no
existing spec's assertions change: `getActiveProgramInfo` → `createTemplateWithScheme` → a **second**
`POST /api/templates/{id}/prescriptions` for the **same `exerciseId`** with different
`restSeconds`/`notes` → `applyScheduleOverride`. Teardown in `finally`: `restoreSchedule`,
`ensureNoActiveSession`, and archive the temporary template (there is no template DELETE route — the
archived template is disposable residue to be declared per agent-workflow §10). Playwright is
`workers: 1, fullyParallel: false`, so the intermediate schedule state is never observed by a sibling
spec — the discipline `applyScheduleOverride`'s own comment already records.

| ID | Case | Assertion |
|---|---|---|
| E-1 | **Online start + duplicate slots** | Start the workout online; card 1 shows its own `Rest …` and `Program note: …`, card 2 shows **its own different** values. |
| E-2 | **Offline start from a cached bundle** | Load Today online (bundle cached), go offline (`OFFLINE_RESOLVER_ARG` + `waitForServiceWorkerControl`), start; both cards render their instructions. Then `waitForOutboxDrained` after reconnect and confirm the ops applied. |
| E-3 | **Reload / resume** | `page.reload()` mid-workout (offline and online) — both cards still render their instructions, from the IndexedDB aggregate. |
| E-4 | **Program edit after start** | With the session running, `PATCH /api/prescriptions/{id}` changing both `restSeconds` and `notes`; reload the workout page — the card still shows the **original** frozen values. |
| E-5 | **Independent session notes** | Type a session note on card 1; the program note is unchanged and the textarea contains only the session note; reload — both persist independently and neither has adopted the other's text. |
| E-6 | **Legacy / absent data** | A slot whose prescription has `notes: null, restSeconds: null` shows neither line and no stray separator. (True legacy — a snapshot frozen by a pre-deploy build — is not reproducible in one E2E run and is covered by U-1/U-6(c)/U-7 instead; this is stated so a reviewer does not read E-6 as the legacy proof.) |

### Negative controls

Per [agent-workflow.md §6](../process/agent-workflow.md#6-negative-control-policy), sync
idempotence/replay controls **must be executed** and reported one line each
(`control | command | expected | observed | restored=identical`), with the exact original bytes saved
and restored — never `git checkout`.

| ID | Control | Must |
|---|---|---|
| NC-1 | Revert §8 file 1 only (the Zod key), keep everything else | **U-3 fails** — proves the strip hazard is real and that U-3 discriminates rather than passing vacuously |
| NC-2 | Revert the `?? null` in `buildSnapshotFromBundleEntry` to bare `entry.prescriptionNotes` | **U-7 fails** — but only if U-7 asserts `toBeNull()` on the frozen value. A `toBeFalsy()`/`toEqual({…})` assertion would pass on `undefined` and make this control vacuous, so the strict form is mandatory. |
| NC-3 | I-2 replay control: apply the create op twice, then an update op, then the create op again | The frozen note is identical after every step |
| NC-4 | E-4 control: remove the freeze (make the card read the live bundle) | E-4 fails — proves E-4 tests the freeze, not the absence of a refetch |
| NC-5 | Inspection only (state, do not execute): U-5's expected values | They visibly differ from any pre-fix output, since `formatRestSeconds` does not exist before the change |

---

## 11. Decisions

**Blocking decisions: none.** Every choice in this design was resolvable from the source, the
existing precedents, or the owner's stated scope, and each is recorded with its rejected alternative:
field name (§4), required/optional asymmetry (§4), no migration and no version bump (§3), rest format
and helper placement (§5.1), label copy (§5.2), no clamp (§5.2), absent-vs-null at the freeze site
(§7 C-3), no `normalizeActiveSession` change (§6), change class and therefore evidence level (§10).

**Owner awareness, not a decision to make (§1):** all existing prescription notes become visible
during execution from the next workout started after deploy, with no per-note opt-out. If any were
written as planning text, clear them in the program editor first. Nothing in this design needs to
change either way — this is a heads-up, not a question.

---

## 12. Explicitly excluded

| Excluded | Why it stays excluded |
|---|---|
| Rest **timer**, countdown, auto-start | Owner-excluded. [PI-015](../BACKLOG.md#pi-015) owns it, is unselected, and is design-gated on reconciling OD-05. This change displays PI-015's existing `restSeconds` target and adds **no competing field**, which is PI-015's own stated requirement. |
| Notifications, locked-screen alerts | Owner-excluded; PI-015's separately-gated platform scope. |
| Short-rest warning/hint | Owner-excluded. [PI-016](../BACKLOG.md#pi-016), which depends on PI-015. |
| Progression / prefill / recommendation changes | Owner-excluded. Neither field touches `workingTargets`, `evaluateSession` or any decision path. |
| App-wide redesign | Owner-excluded. Two render sites inside one existing card. |
| Showing instructions in **History** | Out of scope. The data will be present in snapshots frozen after this ships, so it is additive later — but legacy sessions would show nothing there, and deciding that presentation is its own small design. |
| Editing prescription notes from inside the workout | Would break the freeze and blur the line with session notes, which is the distinction this change exists to draw. |
| Backfilling instructions into existing snapshots | Forbidden by the owner's instruction and by ADR-007. |
| Rich text / markdown in notes | The field is plain text; `whitespace-pre-wrap` is the whole formatting story. |

---

## 13. Implementation order

1. §8 files 1–3 (domain: schema key, builder, formatter) + U-1, U-2, U-5. Domain is self-contained
   and testable before anything downstream compiles against it.
2. §8 file 4 (server bundle entry) + I-1.
3. §8 files 5–6 (client mirror + freeze site) + U-3, U-4, U-7, I-2 + NC-1, NC-2, NC-3.
4. §8 file 7 (card) + U-6.
5. §8 file 8 + the E2E spec E-1…E-6 + NC-4.
6. §9 documentation, items 1–5, rebased on the concurrent `BACKLOG.md`/`ROADMAP.md` edits.
7. E-level gates on the final tree: `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:sw`,
   `pnpm format:check`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, then full
   `pnpm test:e2e` on a clean database following the §7 bootstrap order. Quote every command with its
   exit code; a summary verdict is not evidence.
8. Implementation report, then **independent review by a fresh session at a different model tier**
   (agent-workflow §2). Commit, push and deploy remain owner decisions and are not implied by this
   document or by the owner's selection of this item.

---

## 14. Disposable resources

**Created by this evaluation:** one throwaway markdown table-consistency script in the session
scratchpad (outside the repository), deleted — the scratchpad is now empty. No database was created,
connected to, or queried, local or production. No process was started. No file inside the repository
was created or modified other than this report. Read-only shell work: a `zod` strip-behaviour probe
via `node -e` (§2 R-B), and `git status` / `git diff` over the working tree.

**Left behind:** nothing. Every modified, deleted and untracked path in the working tree is the
concurrent Recovery/workflow/documentation work listed in this report's header, unchanged by this
task; `git status` after this evaluation differs from `git status` before it by exactly one line —
this file.

**Named for the implementer to create and drop:** the integration database
`gymapp_t_prescriptioncontext` (§10), and the temporary E2E template, which can only be archived —
declare it as residue.

---

READY FOR INDEPENDENT WORKOUT PRESCRIPTION CONTEXT REVIEW
