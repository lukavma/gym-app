# Warm-up Routines — Independent Architecture & Product Evaluation

Date: 2026-09-01
Role: independent evaluation of the proposed post-MVP feature "reusable Warm-up Routines" against the actual repository. Evaluation only — no source, schema, architecture-document, or backlog changes were made.
Evaluated repository state: `main` @ `f4ee4e1` (MVP v1 device-accepted 2026-09-01, `docs/reviews/mvp-v1-device-acceptance.md`), plus the pre-existing uncommitted working-tree changes (untouched).
Related backlog input: PI-003 in `docs/input/product-ideas.md` (contextual warm-up block suggestions).

---

## Owner decision addendum — 2026-09-01

The owner reviewed this evaluation and accepted its overall conceptual model and boundaries. The following decisions are **binding for the v1 implementation**. They preserve the independent evaluation as written while explicitly superseding its recommendation for O-1/O-2.

- **O-1 — Curated M:N associations:** v1 will include the evaluated `workout_template_warmup_routines` association. A workout template may link zero or more reusable warm-up routines, with at most one linked routine marked as its default. This intentionally rejects the single nullable default-FK recommendation in §4.2 because curated alternatives are part of the desired product behavior, not merely a future scalability optimization.
- **O-2 — Linked choices only:** the in-workout switcher offers only routines linked to the resolved workout template. It must not fall back to the user's complete routine library.
- **O-3 — Cross-device limitation accepted:** warm-up checklist state remains local to the existing active-session aggregate. Cross-device adoption may therefore lose that transient state in v1; no server sync or persisted execution fact is added to solve it.
- **O-4 — Management location:** routine management belongs under the Programs area, not in a new top-level navigation destination.
- **O-5 — User creation, no seeded content:** users can create, name, edit, delete, and reorder their own warm-up routines and their ordered text items, then link those routines to workout templates. v1 ships no seeded routines, prescribed examples, or evidence claims. The research gate applies to future app-supplied content, not to user-authored routines.
- **O-6 — Today preview included:** when the resolved template has a default routine, Today shows a compact `Warm-up: <name>` preview. This remains informational and must not add a gate before the existing one-tap workout start.
- **O-7 — PI-003 follow-up approved:** after v1 ships, PI-003 should be narrowed to the deferred auto-composition/suggestion layer, retaining its research gate. The backlog edit is a separate follow-up and is not part of this evaluation document.

All other recommendations remain accepted: execution is integrated as an inline, optional, dismissible workout section; session duration includes the warm-up; items are pure `label` plus optional `instruction`; checklist state is transient and deleted with the active aggregate; CRUD is online-only while execution is available from cached Today data; and warm-ups create no set logs, progression input, recommendations, volume, recovery interpretation, permanent history, or outbox operations.

Where later sections describe the single-FK/all-routines design as the recommended v1, this addendum controls. The implementation should use the report's documented M:N extension shape, including deterministic association ordering and a database-enforced maximum of one default association per workout template.

---

## 1. Verdict

**The concept is sound and worth building, and "separately managed, reusable definition + execution integrated into the workout session" is the right conceptual model for this codebase.** The proposal's boundaries (no progression, no volume, no set logs, no performance history, no recovery interpretation) are not just acceptable — they can be made *structural* rather than policed, which is the strongest form of guarantee this architecture offers.

However, the proposal as written is larger than the smallest coherent v1 in four places, and this evaluation recommends modifying it:

1. **Link target:** "training day" does not exist as an entity in this repository. The canonical schedulable unit is the **WorkoutTemplate** (`workout_templates`); routines must link there (§3.2).
2. **Association shape:** the proposed many-to-many link with per-day alternates and a default marker is over-built for a single-user app with a handful of routines. v1 should be **one nullable default-routine FK on the template**, with the workout-time switcher offering all routines; the M:N curated-link table is a documented, additive extension (§4.2). *This is the largest deviation from the proposal and needs owner sign-off (O-1).*
3. **Flow:** the proposed pre-start "select or skip" step adds a decision gate to every workout start. v1 should keep the one-tap **Start workout** exactly as it is and render the warm-up as an **inline, dismissible card** at the top of the workout screen (§5).
4. **Checklist state:** must live only in the existing client-side active-session aggregate (IndexedDB), never in the sync contract or PostgreSQL. This satisfies reload/resume durability, makes "no accidental analytics facts" structural, and — critically — avoids reopening the known-brittle sync supersession surface (W-1, `docs/reviews/mvp-v1-remediation-verification-2.md` §6.1) that any new session-payload field would re-expose (§6, §10).

With those modifications, the feature is a small, low-risk vertical slice (size S–M) that touches no execution-fact table, no sync schema, and no engine/volume code.

---

## 2. What the repository actually is (evaluation base)

Facts below were verified in source, not taken from the proposal or the handoff docs.

### 2.1 Canonical model

| Concept | Reality in this repo | Where |
|---|---|---|
| Planning world | `programs → workout_templates` (ordered `exercise_prescriptions`) `→ blocks` (+ `block_schedule_entries`, `block_week_overrides`); mutable, edited **online only** | `src/db/schema/*`, `docs/architecture/domain-model.md` §1/§4/§5 |
| "Training day" | **Not an entity.** Today's workout is a pure resolution: `resolveTodayTemplate(scheduleEntries, latestCompletedTemplateId, weekday)` over the active block's `block_schedule_entries` (fixed-weekday or rotation mode) | `src/server/today/service.ts` (`buildTodayBundle`), `src/domain/scheduling/todayTemplate.ts` |
| Execution world | `workout_sessions → session_exercises` (PrescriptionSnapshot JSONB) `→ set_logs`; snapshot-on-use at start (ADR-007); one in-progress session per user (`uq_sessions_one_in_progress`); statuses `in_progress → completed / discarded` | `src/db/schema/workoutSessions.ts` etc. |
| Existing "warm-up" concept | `set_logs.is_warmup` — per-exercise warm-up **sets** logged against loaded exercises. Excluded from volume ("work set" = `isWarmup = false`, `src/domain/volume/aggregate.ts`) and from the progression engine (work sets filtered at `src/server/progression/service.ts:125` and in the client fallback in `src/sync/activeSession.ts`) | schema + both engines |
| Single write path for execution facts | Client outbox → `POST /api/sync`; entities fixed to `workoutSession / sessionExercise / setLog / recommendation / recommendationDecision / bodyweightEntry / recoveryEntry` (`SYNC_ENTITIES`, `src/domain/sync/schema.ts`); full-row idempotent upserts; operation-aware supersession lookahead in `src/server/sync/service.ts` | ADR-005, implementation-plan §0 rule 4 |
| Offline posture | Online-first app, local-first active workout: today-bundle cached (IndexedDB `bundleCache` + SW `today-bundle` NetworkFirst/3s); the active-session aggregate in IndexedDB is the UI's source of truth, written atomically with its outbox ops (`commitSessionMutation`); definitions are **not** editable offline | `docs/architecture/pwa-offline-strategy.md`, `src/sync/*`, `src/app/sw.ts` |
| Start path today | Today screen → one tap **Start workout** → `startSession` freezes all snapshots client-side → `/today/workout` renders `ExerciseCard`s. F5 acceptance: a prefilled set is confirmed in ≤3 taps | `src/ui/today/TodaySection.tsx`, `src/sync/activeSession.ts`, `mvp-scope.md` F5 |

### 2.2 Load-bearing constraints this feature must respect

- **W-1 (open, latent):** the sync supersession tolerance requires FULL field subsumption; the RC verification explicitly warns that *one new payload field or one omitting builder silently re-opens MEDIUM-1's rejections* and that any change to `src/server/sync/service.ts` or `src/domain/sync/schema.ts` must re-check W-1 first (`mvp-v1-remediation-verification-2.md` §6). The strongest way to respect this is to not touch the sync contract at all.
- **PI-002 (backlog):** `started_at` already double-duties as event timestamp and calendar attribution, and a session opened early already lands on the wrong day. Any change to session-start semantics feeds this known issue (§7).
- **Two distinct warm-up concepts already exist in writing:** `is_warmup` sets (schema) and the PI-003 preparation checklist (backlog). PI-003 itself states the checklist "must remain … separate from the warm-up sets already recorded against loaded exercises." `mvp-scope.md` §2 item 6 separately lists post-MVP "warm-up set suggestions" — a third, also distinct idea (suggesting ramp-up sets of the loaded lift). The evaluation and any implementation must keep these vocabulary-separated (§10.3).
- **Evidence discipline:** shipped/default content is research-gated (PI-003's gate; the four-tier evidence classification). User-authored content is not. v1 must therefore ship **zero seeded routines** (§11, I-7).

---

## 3. The conceptual model, evaluated

### 3.1 Q1 — Part of the session, separate from it, or both?

**Part of the workout session. Not a separate session. Not both.**

- A separate warm-up session would collide with `uq_sessions_one_in_progress`, pollute history and volume attribution (sessions are the volume attribution atom via `startedAt`), require its own lifecycle/resume/takeover story, and create exactly the "second training log" PI-003 forbids. Rejected outright (X-1).
- Supporting *both* modes doubles the lifecycle and test surface for zero additional athlete value. Rejected.
- Integrated execution gets everything for free: the in-progress session already survives refresh, iOS process kill, and relaunch (IndexedDB aggregate); one-in-progress and takeover semantics already exist; "workout duration includes warm-up" falls out naturally.

The nuance the proposal gets right, and this evaluation keeps: the **routine definition** is planning-world (separately managed, reusable, online-edited), while **execution** is a transient overlay on the session — not a fact.

### 3.2 Q2 — Which entity do routines link to?

**`workout_templates`.** The proposal's "training day" (Upper A, Upper B) *is* a workout template in this repository — there is no day entity to link to. The alternatives fail:

- `block_schedule_entries` are per-block, `ON DELETE CASCADE` with the block, and recreated for every new block — linking there would silently drop warm-up wiring at each block transition and contradict "reusable across programs/blocks".
- `blocks` or `programs` are the wrong grain (warm-ups differ per workout type, not per mesocycle).
- A new "training day" entity would be invented structure contradicting the accepted schedule model (schedule entries + rotation resolution).

Template linkage also composes correctly with the existing resolution pipeline: `buildTodayBundle` already resolves today → template → effective prescriptions; the routine attachment rides the same resolution with zero new scheduling logic.

---

## 4. Recommended domain model

### 4.1 New definitions (planning world)

```text
warmup_routines
  id            uuid PK (server-generated UUIDv7 — not offline-creatable; CRUD is online-only)
  user_id       uuid FK → users, not null
  name          text not null            — uq (user_id, lower(name)), plain unique (no archive ⇒ no partial index)
  created_at / updated_at timestamptz

warmup_routine_items
  id            uuid PK (server-generated)
  routine_id    uuid FK → warmup_routines ON DELETE CASCADE
  position      smallint not null        — uq (routine_id, position); plain constraint suffices (see below)
  label         text not null            — 1–120 chars ("Band external rotation")
  instruction   text null                — ≤200 chars; the dose/cue ("2×15 light", "3–5 min easy pace")
  created_at / updated_at timestamptz

workout_templates
  + warmup_routine_id uuid null FK → warmup_routines ON DELETE SET NULL   — the template's default routine
```

Validation (Zod, `src/domain/warmup/schema.ts`): routine name 1–100 chars; 1–20 items; item bounds as above. Items are edited **full-replace as one unit with the routine** (the template+prescriptions "one consistency boundary" idea, but simpler — delete-and-reinsert inside one transaction, so no `DEFERRABLE` hand-patching of the generated migration is needed; nothing references item ids, so regenerating them is harmless).

Migration: one new file (`drizzle/0010_*`), verified against the local Docker PostgreSQL 16. This feature deliberately avoids the reorder-swap pattern that forces deferred constraints elsewhere.

### 4.2 Q3 — Association shape, optional default, ordering

**Recommended v1: no link table.** `workout_templates.warmup_routine_id` *is* the default; `NULL` means "no warm-up proposed for this template". The workout-time switcher offers **all** of the user's routines (they are few, and all ride in the bundle — §8.1), so "choose another routine" is strictly more capable than "choose another *linked* routine".

Why this beats the proposed M:N:

- The M:N link's only jobs are (a) marking a default and (b) curating which routines a template *may* show. (a) is one nullable FK. (b) is self-curation of the user's own ~3–8 routines — management UI (per-template multi-select, ordering, default marking) whose build-and-maintain cost exceeds its value at single-user scale.
- Reuse — the actual core requirement ("Upper Standard on both Upper A and Upper B") — is fully satisfied: many templates can point at one routine.
- It is cleanly extensible: if per-template curation ever proves wanted, add `workout_template_warmup_routines (template_id, routine_id, position, is_default)` additively, seed it from the FK, and keep or retire the FK as the default pointer. No rework.

**Default representation:** the FK itself. No `is_default` flag, no "position 0 is the default" convention — one mechanism, no cross-row invariant to enforce.

**Ordering:** not required in v1. The switcher sorts by name. `position` ordering becomes meaningful only with the deferred link table (D-1).

*This deviates from the proposal's explicit example (curated per-day alternates) and is flagged as owner decision O-1. If the owner insists on curated per-template lists in v1, the deferred link-table design above is the correct shape — but it should be a conscious purchase, not a default.*

### 4.3 Q4 — Item representation: text, exercise references, or hybrid?

**Pure text items** (`label` + optional `instruction`). No `exercise_id` column — not even nullable.

- Referencing `exercises` would be semantically wrong and operationally costly: the exercise library is the vocabulary of *loaded, tracked movements* — with muscle contributions, `loadStepKg`, progression compatibility, and volume participation. "3 min bike" and "band pull-apart ×15" belong to none of that. Routine items inside the library would pollute every picker (ad-hoc add, prescriptions), invite muscle-contribution rows (and thereby volume), and tempt set-log semantics — precisely the boundary violations the proposal forbids.
- Text items make Q11's guarantees **structural**: an item that references nothing can never enter any pipeline.
- The hybrid (optional exercise ref for tap-through detail, or "convert item into logged warm-up sets") is a clean additive column later, if ever wanted (D-2). PI-003's exercise→item *mapping* idea likewise layers on top later without changing the item shape (§11).

The proposal's separate "optional note" field is folded into `instruction` — two optional free-text fields on a checklist row is one too many (§17, M-6).

---

## 5. Proposed user flow (Q10)

### 5.1 Flow

```text
Today (unchanged, incl. offline/cached path)
  └─ [Start workout]  ← same single tap; no new modal, no selection gate
       └─ /today/workout
            ┌──────────────────────────────────────────────┐
            │ Warm-up · Upper Standard          [Skip] [▾] │   ← inline card, top of list
            │ ☑ 3–5 min rower — easy pace                  │
            │ ☑ Band external rotation — 2×15              │
            │ ☐ Scap pull-ups — 2×8                        │
            │ (Routine: Upper Standard ▾  — only if >1)    │
            └──────────────────────────────────────────────┘
            ExerciseCard (Bench Press) …                      ← unchanged
            ExerciseCard …                                    ← unchanged
            [Complete workout] / [Discard workout]            ← unchanged
```

- **Template has a default routine** → the card renders expanded with that routine's checklist.
- **No default, but routines exist** → one collapsed row: "Warm-up — choose ▾ / skip". Zero intrusion.
- **No routines at all / adopted session (§6.3) / session without a scheduled template** → nothing renders; the screen is identical to today's.
- **Skip** collapses the card to a single "Warm-up skipped — undo" row (per-session, reversible, never remembered across sessions).
- **Switcher** (rendered only when the user owns more than one routine) swaps the checklist; progress resets on switch.
- The card auto-collapses once all items are checked or the first work set is logged, keeping logging controls high on the screen.

### 5.2 Mobile/UI constraints honored

- **Fast path untouched:** the tap sequence from Today to the first logged set is unchanged; the card never gates anything. `mvp-scope.md` F5's "≤3 taps to a prefilled set" criterion must be re-asserted in acceptance (§14, A-3).
- **No modal friction:** the proposal's "Warm-up auswählen oder überspringen" pre-start step is rejected as a flow gate (§17, M-3); selection is inline and optional.
- The card follows the existing card visual language (`ExerciseCard` idiom); checkbox rows are full-width touch targets; no new route is required for execution.
- **Routine management UI** (CRUD) is a definitions screen. The top nav already wraps to two rows with 7 links (`src/app/(app)/layout.tsx`, phase-7 BLOCKER-1 comment; PI-004 pending). Recommendation: reach routines from the Programs area (e.g. a "Warm-up Routines" section or link on `/programs`), **not** an 8th top-level nav item. Owner decision O-4.
- Optional cosmetic: Today's scheduled card may show one line "Warm-up: Upper Standard" under the template header (O-6). Not load-bearing.

---

## 6. Lifecycle & state model (Q5, Q7)

### 6.1 Where execution state lives

**Only in the existing IndexedDB active-session aggregate** (`activeSession` store, `src/sync/db.ts`), as a new optional client-side field on `ActiveSessionDto`:

```ts
// src/sync/types.ts — client-only; NEVER mirrored into any sync payload
warmup?: {
  routines: Array<{ id: string; name: string;
                    items: Array<{ label: string; instruction: string | null }> }>; // frozen at start
  selectedRoutineId: string | null;   // null until chosen when no default
  done: boolean[];                    // parallel to the selected routine's items; reset on switch
  dismissed: boolean;                 // per-session skip, reversible
} | null;
```

- Frozen **once, at `startSession`**, copied from the bundle (snapshot-on-use in spirit — ADR-007 — but with no persistence obligation, because no historical fact is created). Mid-session edits or deletions of routine definitions therefore never mutate a running workout.
- All mutations (`toggleWarmupItem`, `selectWarmupRoutine`, `dismissWarmup`/`undismissWarmup`) go through the existing `serialize()` queue and `commitSessionMutation({ session, ops: [] })` — a durable local commit with **zero outbox ops**.
- The full-row payload builders (`workoutSessionFullRowOp` etc. in `src/sync/activeSession.ts`) enumerate their fields explicitly, so the new aggregate field cannot leak onto the wire — a compile-level property, not a convention.
- No IndexedDB `DB_VERSION` bump: object stores are schemaless and the field is optional; pre-existing local sessions and server-hydrated DTOs simply lack it and render no card.

### 6.2 Why not the alternatives

- **Sync payload / PostgreSQL column:** creates permanent execution records (violating the proposal's own boundary) and touches `src/domain/sync/schema.ts` + `src/server/sync/service.ts` — re-opening W-1 (§2.2). Rejected (X-5).
- **`localStorage`:** the existing precedent (`src/ui/recovery/dismissedPreference.ts`) is for *permanent per-device UI preferences*. Warm-up state is per-session and must die with the session; the aggregate is the correct scope and already owns the durability story. Rejected.
- **Re-reading the cached bundle at render time:** the bundle can be refreshed/replaced mid-session (SW NetworkFirst + `setCachedBundle` on every Today load), so the checklist could change or vanish under the athlete's thumb. Freezing at start is deterministic. Rejected.

### 6.3 Lifecycle table (Q5)

| Event | Behavior |
|---|---|
| **Start** | **Start workout** (unchanged tap) creates the session; `startSession` copies `{routines, defaultWarmupRoutineId}` from the bundle into `warmup`; `selectedRoutineId = default ?? null`; `done` all false; `dismissed = false`. `startedAt = now` (§7). |
| **Select / switch routine** | Sets `selectedRoutineId`, resets `done`. Local aggregate write only. |
| **Tick / untick item** | Flips `done[i]`. Local aggregate write only. |
| **Skip** | `dismissed = true`; card collapses; reversible within the session. After completion, no record that a skip (or a warm-up) ever happened exists anywhere. |
| **Reload / crash / relaunch (same device)** | The aggregate is the source of truth → card, selection, and ticks restore exactly (the same mechanism that restores sets today). |
| **Cross-device resume (adopt)** | `hydrateFromServer` stores the server DTO, which has no `warmup` → no card on the adopting device. Accepted v1 loss (O-3): warm-up guidance is a start-of-workout affordance; adoption happens mid-workout by definition. |
| **Takeover / foreign discard** | Unaffected — no server-side warm-up state exists to clean up. |
| **Complete** | `completeSession` deletes the aggregate → warm-up state ceases to exist. Nothing is written. This hardens the proposal's "may be discarded when the workout is completed" into **must** (§17, M-5). |
| **Discard / abandon** | Same as complete — aggregate deleted, state gone. A session abandoned mid-warm-up is just a zero-set `in_progress` session; the existing resume/discard/takeover handling covers it, and a zero-set *completed* session is already benign (engine: `NO_WORK_SETS_LOGGED`; volume: nothing). |
| **History** | Completed sessions show nothing about warm-up routines — there is deliberately no data to show (N-1). |

### 6.4 Q7 — transient state without accidental facts

The guarantee is structural: warm-up execution state exists in exactly one place (the device-local aggregate), and that place is deleted on session end. There is no table to query, no op entity to replay, no JSONB column to mine later. "Did the athlete warm up on 2026-09-01?" is deliberately unanswerable — that is the specified v1 behavior, and it is what keeps this feature permanently out of analytics, progression, and recovery conversations.

---

## 7. Session start semantics (Q6 — `started_at`)

**Keep `workout_sessions.started_at` exactly as it is: the moment the athlete taps Start workout.** The warm-up happens inside the session, so duration includes it — which is what the proposal wanted — without any new state. The proposal's "starting the warm-up would *tentatively* start the workout session" is rejected (X-6): there is no tentative status in the session lifecycle (`in_progress → completed | discarded`), and inventing one would ripple through one-in-progress enforcement, takeover, and the sync lifecycle checks for nothing.

Verified `started_at` consumers and the effect of a warm-up-inclusive start (start shifts ~5–10 min earlier than the first work set):

| Consumer | Where | Effect |
|---|---|---|
| History ordering + pagination cursor | `src/server/history/service.ts` (`orderBy desc`, `lt(startedAt, before)`) | None — order-preserving. |
| Weekly volume attribution | `src/server/volume/service.ts` (`gte/lt` on `startedAt`) | A session started just before midnight / a week boundary attributes to the earlier bucket. This failure class **already exists** (PI-002's observed case) and is only marginally widened by warm-up minutes. Accept; PI-002 remains the designated fix, and its "training date defaults to the last work set's local date" absorbs warm-up time cleanly. |
| Carry-forward recency | `src/domain/progression/carryForward.ts` (sort by `startedAt`) | None — relative order between sessions is unchanged at any realistic training cadence. |
| Engine history window | `src/server/progression/service.ts` (`lt(startedAt, evaluatedSession.startedAt)`, `orderBy desc`) | None — order-preserving. |
| Rotation anchor | `src/server/today/service.ts` (latest completed session by `startedAt`) | None. |
| Sync create-anchor | `isCreateAnchoredWorkoutSession` (`src/server/sync/service.ts`) treats `startedAt` presence as the creation anchor | None — untouched, and another reason not to add session-payload fields (W-1). |

**Recommendation:** no `warmup_started_at`, no `training_started_at`, no schema change. If "working duration excluding warm-up" analytics are ever wanted, the first work set's `logged_at` already derives it (D-6).

---

## 8. Offline / PWA behavior (Q8)

### 8.1 Cached definitions

Extend the today bundle (`buildTodayBundle` → `TodayBundleDto`):

- Top-level `warmupRoutines: Array<{ id, name, items: [{ label, instruction }] }>` — **all** of the user's routines, name-sorted, items included. This deliberately exceeds the proposal's "routines needed for Today" so that offline routine *switching* works; the payload cost is a few KB at most for a single user.
- On the `scheduled` variant: `defaultWarmupRoutineId: string | null` for today's template.

No service-worker changes: `/api/today-bundle` is already the one cached API GET (NetworkFirst/3s, `src/app/sw.ts`), and its cache sanitizer strips only `activeSession` — the new fields ride along in both the SW cache and the IndexedDB `bundleCache` automatically.

**Tolerance rule (mandatory):** the client must treat a bundle without these fields as `[]` / `null` — no card, no error. Both the SW cache and `bundleCache` will serve pre-upgrade copies after deploy. The repo has burned on exactly this before: a pre-Phase-5 cached bundle lacking `appliedModifiers` made offline start throw until refreshed (Phase 5 review L-4). Acceptance A-7 covers it.

### 8.2 Active-session persistence

Covered by §6: the frozen copy in the aggregate makes checklist rendering, ticking, switching, and dismissal fully offline-capable and immune to mid-session definition changes. Completion offline behaves exactly as today — the completion op batch is unchanged in shape and content.

### 8.3 Stale or deleted routines; convergence

- A stale cached bundle may offer a routine that was renamed or deleted online. Harmless: items are copied at start; nothing dereferences the routine id afterward; the next successful Today load converges the cache.
- There is **no convergence protocol to design**, because there is no server-side execution state: routines converge like every other definition (bundle refresh), and checklist state never leaves the device.
- Routine CRUD stays online-only (capability-matrix "definitions" row unchanged). The proposal already accepted this.
- Auth expiry / dead-letter / replay: unaffected — this feature enqueues no ops.

---

## 9. Editing, deletion, ownership, referential integrity (Q9)

| Concern | Recommendation |
|---|---|
| Ownership | `warmup_routines.user_id`, every query scoped by it (house convention). Setting a template's default validates both template ownership (program chain, as in `src/server/templates/service.ts`) and routine ownership. |
| Edit semantics | Routine + items are one consistency boundary: `PUT /api/warmup-routines/[id]` replaces name + full item list transactionally. Renames/edits take effect from the next bundle build; in-flight sessions keep their frozen copy (correct and self-explaining). |
| Deletion | **Hard delete**, allowed always. No historical reference to routines exists anywhere (sessions never persist them), so the archive pattern used for exercises/templates/programs is unnecessary weight here (X-8). `workout_templates.warmup_routine_id` clears via `ON DELETE SET NULL`; `warmup_routine_items` cascade. The delete confirmation should state "default for N templates" (one cheap count query). |
| Uniqueness | Plain `uq (user_id, lower(name))` (no partial index needed without archive); conflict maps to a friendly 409, mirroring the exercises name-conflict handling. |
| Template archive | Nothing to do — the FK stays on the archived row; bundles only build from scheduled templates, and archiving is already blocked while scheduled in an active block (`TemplateReferencedError`). |
| Template deletion | The FK column disappears with the row (templates cascade from programs); sessions are unaffected (their template FK is `SET NULL` lineage, and they never reference routines at all). |
| Linked routine changes mid-session | By construction a non-event: the session holds a frozen copy (§6.1). |
| API surface | `GET/POST /api/warmup-routines`, `GET/PUT/DELETE /api/warmup-routines/[id]`; the template default rides the existing template update route as an optional `warmupRoutineId` field. All plain online REST — no new write path. |

---

## 10. Domain boundaries, invariants, and non-goals (Q11)

### 10.1 Invariants (binding for implementation and review)

- **I-1** No warm-up-routine data is ever written to `workout_sessions`, `session_exercises`, `set_logs`, or `recommendations` — no rows, no columns, no JSONB fields.
- **I-2** `SYNC_ENTITIES` is unchanged; no sync op carries warm-up data; `src/domain/sync/schema.ts` and `src/server/sync/service.ts` are not modified by this feature (W-1 guard).
- **I-3** `src/domain/progression` and `src/domain/volume` import nothing from any warm-up module — asserted by a boundaries-style test, following the Phase 7 precedent (engine non-consumption of bodyweight/recovery).
- **I-4** Routine items reference no exercises and no muscle groups.
- **I-5** Checklist state is device-local and session-scoped; it is deleted at completion/discard and never synced.
- **I-6** Warm-up routines never alter effective prescriptions, prefills, targets, recommendation evaluation, or `is_warmup` set semantics.
- **I-7** v1 ships **zero** seeded/default routines or items (research gate applies to any shipped content; user-authored content is exempt — as the proposal itself specifies).
- **I-8** Terminology: "Warm-up Routine" for the definition; "warm-up sets" remains the `is_warmup` concept; the word "block" is never used for routines (TrainingBlock conflict — the proposal's own instinct, confirmed).

### 10.2 Explicit non-goals (v1)

- **N-1** No warm-up completion/adherence history, per-item timing, or any queryable record of warm-up behavior.
- **N-2** No contribution to volume, tonnage, e1RM, or any derived metric.
- **N-3** No progression/recommendation input or output relating to warm-ups.
- **N-4** No recovery/readiness interpretation (no "you skipped warm-ups 3× this week" anywhere, ever, without a new evaluation).
- **N-5** No cross-device checklist continuity.
- **N-6** No auto-composition from the workout's exercises (that is PI-003's deferred layer, §11).

### 10.3 How the boundary is guaranteed

Volume aggregates `set_logs × exercise_muscle_contributions` (`src/domain/volume/aggregate.ts`); the engine consumes work sets from `set_logs` (`src/server/progression/service.ts:125`; client fallback filters identically). Since warm-up routines produce **no** `set_logs`, no `session_exercises`, and no sync ops, they cannot reach either pipeline — there is nothing to filter, gate, or exclude. The only guards worth adding are absence assertions (§14, A-10/A-11), not runtime checks.

---

## 11. Relationship to PI-003 (Q12)

PI-003 describes two separable layers:

1. **An execution surface** — a lightweight, optional, skippable, offline-capable preparation checklist inside the workout, persisting nothing. **This proposal implements that layer**, fully consistent with PI-003's behavioral bullets (optional, dismissible, no completion persistence, no effect on session/progression/volume/recommendations, offline from cached context, neutral language).
2. **A composition mechanism** — a curated item library plus deterministic exercise→warm-up-item mappings, dedup, and seeded curated defaults behind an explicit research gate. **This proposal deliberately does not build that layer**, replacing it for v1 with manual, user-authored routines linked to templates.

**Disposition: narrow and supersede-in-part, do not delete.** Recommended (owner action O-7, after v1 ships — the backlog file was not modified by this evaluation):

- Rewrite PI-003 to record that the execution surface shipped as Warm-up Routines v1 (reference this document).
- Reframe the remainder as "auto-composed warm-up routine *suggestions*": a later layer that can generate a proposed routine (e.g. for templates without a default) rendered on the exact same card, with the research gate intact for any shipped library/mappings.
- Keep PI-003's research-gate questions verbatim — they are the gate for D-3/D-4 and remain valuable.

The deterministic A→B mapping model in PI-003 is rejected *for v1* (X-3-adjacent): it requires a seeded item library and per-exercise mapping data whose useful form is exactly what the research gate blocks, plus dedup/priority logic — far more moving parts than manual routines, with its differentiating value (context sensitivity) unavailable until the gate is passed.

---

## 12. What the proposal overlooked or made unnecessarily complex (Q13)

**Overlooked:**

1. "Training day" is not an entity here — the link target had to be resolved (§3.2).
2. The W-1 sync-contract hazard: "checklist state should survive reload/resume" quietly pushes toward server persistence, which would touch the exact surface the RC verification flagged as brittle. The device-local design sidesteps it entirely (§6).
3. Post-deploy cached bundles lack the new fields (SW + IndexedDB); the client must tolerate absence (Phase 5 L-4 precedent) (§8.1).
4. Cross-device adopt semantics for checklist state (§6.3).
5. `started_at` is also the sync create-anchor and the volume/PI-002 attribution key — "duration includes warm-up" has enumerable downstream consumers (§7).
6. Zero-set abandoned/completed sessions become slightly more common with a warm-up phase; the existing lifecycle already handles them (§6.3).
7. Where routine CRUD lives in an already-crowded 7-link nav (PI-004 pending) (§5.2, O-4).
8. Name uniqueness and item-count/length bounds (§4.1, §9).
9. Vocabulary collision risk with both `is_warmup` sets and mvp-scope's post-MVP "warm-up set suggestions" (§2.2, I-8).

**Unnecessarily complex:**

1. The pre-start "select or skip" gate (M-3) — replaced by the inline card.
2. M:N links + per-template alternates + explicit default marker + ordering (M-2) — replaced by one FK; deferred as D-1.
3. "Tentatively start the workout session" (M-4) — no tentative state exists or is needed.
4. Two optional free-text fields per item (M-6) — folded into one `instruction`.
5. "Checklist state … *may* be discarded when the workout is completed" (M-5) — hedging invites persistence; v1 makes discard-at-completion mandatory, which is what keeps N-1 true.

---

## 13. Risks and edge cases

| # | Risk / edge case | Assessment & mitigation |
|---|---|---|
| R-1 | Stale cached bundle without the new fields (post-deploy) | Mandatory tolerance rule (§8.1); explicit test (A-7). |
| R-2 | Pre-existing local `ActiveSessionDto` without `warmup` (app updated between sessions; SW update is user-triggered) | Optional field; absent ⇒ no card. No IDB version bump needed. |
| R-3 | Cross-device adopt loses checklist state | Accepted v1 limitation, documented in-product-invisible (O-3). |
| R-4 | Routine deleted/renamed while a session is in flight or a bundle is cached | Frozen copy at start; `SET NULL` clears template defaults; next bundle refresh converges. Non-event. |
| R-5 | Scope creep into the sync contract (someone "just adds" warm-up state to session ops) | I-2 + review focus item (§15); W-1 is the documented reason this is not a style preference. |
| R-6 | Week-boundary attribution: warm-up minutes widen the pre-midnight window where `started_at` lands a session on the previous day/week | Pre-existing PI-002 class; magnitude ~minutes; PI-002 remains the fix (§7). |
| R-7 | Card pushes logging controls down the screen | Auto-collapse on all-checked or first work set; collapsed single-row variants for no-default and skipped states; A-3 re-asserts F5's tap budget. |
| R-8 | A zero-item routine or oversized labels | Zod bounds (1–20 items, length caps) at the API boundary; UI mirrors. |
| R-9 | Switcher resets progress and surprises the athlete | Stated behavior (§6.3); progress is seconds of tapping; not worth per-routine progress maps in v1. |
| R-10 | iOS storage eviction of IndexedDB mid-session | Unchanged exposure: warm-up state shares the aggregate's existing durability posture (`storage.persist()`, installed-PWA exemption); losing it loses a transient checklist, not facts. |

---

## 14. Recommended acceptance criteria

Phone = real iPhone installed PWA; automated = Vitest/PGlite/Playwright per house conventions.

- **A-1 (CRUD)** Creating a routine with 5 items takes under a minute on the phone; duplicate name returns a friendly conflict; item bounds enforced.
- **A-2 (Default)** The template editor sets and clears the default routine; the change is visible on the next Today load.
- **A-3 (Fast path preserved)** With a default routine present, the tap count from Today to a logged prefilled first work set is **unchanged** versus current production behavior (F5's ≤3-tap criterion re-demonstrated).
- **A-4 (Durability)** Check 2 of 4 items → reload the page → still checked. Force-kill and relaunch (Playwright kill-and-restore pattern) → still checked, same selection.
- **A-5 (Ephemerality)** Complete the workout → IndexedDB holds no warm-up state; reopening shows no residue; PostgreSQL contains no warm-up execution data anywhere.
- **A-6 (Offline)** Cold offline launch from the cached shell + bundle → card renders, items tick, workout completes offline; on reconnect the outbox drains with **no** new entity kinds on the wire and no dead letters.
- **A-7 (Tolerance)** A cached bundle stripped of the new fields (simulated pre-upgrade copy) still loads Today and starts a workout — no card, no error.
- **A-8 (Skip)** Skipping collapses the card; the completed session is byte-identical in `workout_sessions` / `session_exercises` / `set_logs` to a control session that never had routines (timestamps aside).
- **A-9 (Equivalence)** Integration: two sessions with identical logged sets — one with all warm-up items checked, one with the card skipped — produce identical recommendation rows (modulo ids/timestamps) and identical volume reports.
- **A-10 (Wire)** Assert the sync request bodies during a warm-up-using workout contain only the existing `SYNC_ENTITIES`; `src/domain/sync/schema.ts` and `src/server/sync/service.ts` are diff-clean.
- **A-11 (Boundaries)** Boundaries test: no import path from `src/domain/progression` or `src/domain/volume` into any warm-up module.
- **A-12 (Adopt)** Device B adopting device A's in-progress session shows no warm-up card (documented behavior, not a bug).

---

## 15. Suggested implementation & review sequence

One implementation pass + one focused independent review (per the post-taxonomy lean workflow). Size S–M.

1. **Migration `0010`** — `warmup_routines`, `warmup_routine_items`, `workout_templates.warmup_routine_id` (FK `SET NULL`). No deferrable constraints. Verify against local Docker PostgreSQL 16.
2. **Domain** — `src/domain/warmup/schema.ts` (Zod shapes + bounds); pure helpers for card state transitions if extracted (unit-testable).
3. **Server** — `src/server/warmupRoutines/service.ts` + routes; template update accepts `warmupRoutineId`; `buildTodayBundle` additions (`warmupRoutines`, `defaultWarmupRoutineId`).
4. **Client** — `src/sync/types.ts` DTOs; `startSession` freeze + the three/four warm-up mutators in `src/sync/activeSession.ts` (via `serialize` + `commitSessionMutation`, `ops: []`); store wiring; `WarmupCard` in `src/ui/workout/`; `TodaySection` pass-through; routine management UI under the Programs area.
5. **Tests** — unit (schema bounds, state transitions), integration (CRUD, ownership, bundle shape + tolerance, A-8/A-9 equivalence), e2e (A-3…A-8).
6. **Docs** — README/nav note if a screen is added; PI-003 rewrite is a separate owner-approved edit (O-7).

**Files that must NOT change** (review gate): `src/domain/sync/schema.ts`, `src/server/sync/service.ts`, `src/domain/sync/payloadBuilders.ts`, `src/sync/outbox.ts`, `src/sync/flush.ts`, `src/domain/progression/*`, `src/domain/volume/*`, any applied migration.

**Independent-review focus:** I-1…I-8 hold; A-7 tolerance actually exercised against both cache layers; F5 tap budget unchanged; the `warmup` field provably absent from every outbox payload (not just from the schemas); no IDB upgrade regression; W-1 explicitly re-checked as "not applicable — contract untouched".

Suggested session titles per the established convention: `S5-XH | Post-P08 | Implementation — Warm-up Routines v1` and `O-Max | Post-P08 | Review — Warm-up Routines v1`.

---

## 16. Decision ledger

### Binding recommendations for v1

- **B-1** Warm-up Routine = user-authored, named, ordered checklist of 1–20 pure-text items `{label, instruction?}`; a planning-world definition.
- **B-2** Tables `warmup_routines` + `warmup_routine_items`; default link = `workout_templates.warmup_routine_id` (nullable FK, `ON DELETE SET NULL`).
- **B-3** CRUD online-only REST; routine+items edited full-replace as one unit; plain unique name per user; hard delete (no archive).
- **B-4** Bundle carries all routines + today's default id; clients treat absent fields as none.
- **B-5** Execution inside the workout session: start path unchanged, inline dismissible card, definitions frozen into the local aggregate at `startSession`; tick/switch/skip are local-only aggregate writes; state dies at completion/discard and does not travel to other devices.
- **B-6** `started_at` semantics unchanged; workout duration includes warm-up by construction; no new timestamp columns.
- **B-7** Zero warm-up presence in execution tables, sync contract, history, volume, engine (I-1…I-6); no seeded content (I-7).
- **B-8** Terminology "Warm-up Routine"; the card is visually distinct from `is_warmup` set logging.

### Deferred (with triggers)

- **D-1** M:N curated per-template routine links (+ ordering, explicit default). Trigger: the all-routines switcher demonstrably shows too many irrelevant options in real use.
- **D-2** Optional `exercise_id` on items / tap-through detail / "convert to logged warm-up sets". Trigger: real friction logging ramp-up sets after the checklist.
- **D-3** Auto-composed routine suggestions from Today's exercises (PI-003's mechanism), rendered on the same card. Trigger: owner demand + research gate passed for any shipped mappings.
- **D-4** Seeded example routines / starter library. Research-gated (PI-003 gate applies verbatim).
- **D-5** Server-persisted checklist state for cross-device continuity. Trigger: real multi-device mid-workout usage (also re-opens OD-02/W-1 territory — treat as a sync-contract change, not a feature tweak).
- **D-6** "Working duration excluding warm-up" analytics, derived from first work-set `logged_at`. Trigger: Phase 9 dashboard demand.
- **D-7** Per-context routine variants (deload weeks, goals). No current need.
- **D-8** Today-screen preview of the default routine name, if not taken as O-6 now.

### Rejected alternatives (and why)

- **X-1** Separate warm-up session/workout entity — collides with one-in-progress, pollutes history/volume, second training log (§3.1).
- **X-2** Dual-mode (integrated *and* separate) — double lifecycle for no value (§3.1).
- **X-3** A "training day" link entity — no such concept exists; schedule entries are per-block and disposable (§3.2).
- **X-4** Items referencing exercises in v1 — library pollution, boundary erosion, offline metadata burden (§4.3).
- **X-5** Checklist state in the sync contract / PostgreSQL — permanent facts by accident + W-1 exposure (§6.2).
- **X-6** "Tentative" session start — no such lifecycle state; `started_at` at the Start tap already yields warm-up-inclusive duration (§7).
- **X-7** Any warm-up performance metrics (weights/reps/timing) in v1 — the proposal's own boundary, made structural (§10).
- **X-8** Archive lifecycle for routines — nothing historical references them; hard delete is honest and smaller (§9).
- **X-9** "Warm-up Block" naming — collides with TrainingBlock (`blocks`); proposal's own suggestion confirmed (I-8).

### Genuine product decisions requiring owner input

- **O-1** Accept the single default-FK model (recommended) instead of the proposal's per-template curated M:N lists? This is the visible data-model deviation; D-1 restores curation later if wanted.
- **O-2** Accept that the workout-time switcher offers *all* routines (consequence of O-1)?
- **O-3** Accept cross-device adopt losing checklist state in v1?
- **O-4** Where routine management lives: Programs-area section/link (recommended) vs. a new top-nav destination (interacts with PI-004).
- **O-5** Confirm v1 ships no seeded routines and no "editable examples" (the research gate stays untriggered).
- **O-6** Include the cosmetic Today-screen "Warm-up: <name>" preview line in v1, or defer (D-8)?
- **O-7** Approve the PI-003 rewrite (narrow to auto-composition suggestions, gate intact) as a follow-up backlog edit after v1.

---

## 17. Modifications recommended to the original proposal (summary)

- **M-1** Link routines to **workout templates**, not "training days or workout templates" — the former doesn't exist; the ambiguity resolves to the latter (§3.2).
- **M-2** Replace the many-to-many link + optional-default with a single nullable default FK per template; the switcher offers all routines; M:N becomes a deferred extension (§4.2, O-1).
- **M-3** Drop the pre-start "Warm-up auswählen oder überspringen" step; keep the one-tap start and use an inline, dismissible, auto-collapsing card in the workout screen (§5).
- **M-4** Drop "tentatively start the workout session"; the session starts normally at the Start tap and the warm-up lives inside it — duration inclusion falls out with zero new semantics (§7).
- **M-5** Harden "checklist state … may be discarded when the workout is completed" to **must be discarded** — that mandatory ephemerality is what makes the no-history guarantee structural (§6.4).
- **M-6** Collapse item fields to `label` + optional `instruction` (dose/cue); drop the separate optional note (§4.3).
- **M-7** Keep checklist durability requirements (reload, offline, resume) but satisfy them via the existing device-local active-session aggregate, explicitly **not** via server persistence or the sync contract (§6, W-1).
- **M-8** Constrain v1 items to pure text — no exercise references, not even optionally (§4.3).
- **M-9** All confirmed as proposed: "Warm-up Routine" terminology; ordered-checklist execution; no progression/volume/recommendation/recovery/set-log involvement; no permanent warm-up history; online-only CRUD with offline execution via the cached bundle; the research gate for any shipped content with user-authored routines exempt.

---

## Appendix A — Question-by-question index

| # | Question (abbreviated) | Answered in |
|---|---|---|
| 1 | Execution in-session vs. separate vs. both | §3.1 |
| 2 | Which entity routines link to | §3.2 |
| 3 | M:N vs. simpler; default; ordering | §4.2 |
| 4 | Item representation | §4.3 |
| 5 | Lifecycle: selection…abandonment | §6.3 |
| 6 | `started_at` semantics | §7 |
| 7 | Transient checklist state | §6.1, §6.4 |
| 8 | Offline/PWA consequences | §8 |
| 9 | Editing, deletion, ownership, RI | §9 |
| 10 | Mobile UI, fast start path | §5 |
| 11 | Domain-boundary guarantees | §10 |
| 12 | PI-003 disposition | §11 |
| 13 | Overlooked / over-complex | §12 |
