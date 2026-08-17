# Phase 3 Remediation — Independent Verification

Scope: verify whether the findings raised in [`phase-3-review.md`](phase-3-review.md) were
actually closed by the work described in [`phase-3-remediation.md`](phase-3-remediation.md).
This is **not** a second full Phase 3 review. The remediation report was treated as a set of
claims, not as evidence: every closure below rests on the code as it stands in the working
tree plus independently reproduced runtime behaviour.

Nothing was implemented, committed, pushed, or deployed. Production (Azure PostgreSQL) was
never contacted; all runtime work ran against a local `pnpm build && pnpm start` server and
the local Docker PostgreSQL 16 instance (`gym-app-db-1`). The only repository change from this
pass is this file. `HANDOFF.md` (deleted), `HANDOFF(depracted).md`, `gpt-handoff.md`, and
`gpt-memory.md` were never read, opened, or modified.

---

## 1. Executive verdict

**READY FOR MANUAL IPHONE ACCEPTANCE / PHASE 3 CLOSURE.**

Both BLOCKERs and all five HIGHs are genuinely closed — verified by independent runtime
reproduction, not by test counts. Ten of the eleven MEDIUMs are closed. MEDIUM-1's server half
is openly not fixed and is correctly labelled as such by the remediation report; whether that
is *accepted* is a user decision, presented in §6.

Verification found **no BLOCKER and no HIGH regressions or gaps**, and one **new MEDIUM** that
the original review did not raise (the history-correction path bypasses both the typed payload
builders and all bounds validation, and never reverts its optimistic UI when the server rejects
the op — §5 R1). Nine LOW-severity residuals are listed in §5.

Confidence in the closures is high where it matters most: every claim about "values reach
PostgreSQL" was checked by reading PostgreSQL directly, and every claim about a visible banner,
strip, or disabled control was checked by driving the real UI in a browser.

---

## 2. Finding-by-finding verification

Verdict key — **CLOSED**: independently verified fixed. **CLOSED (nuance)**: fixed, with a
non-blocking behavioural detail worth knowing. **OPEN (by design)**: not fixed, disclosed as
such by the remediation. **DEFERRED**: intentionally out of remediation scope, confirmed still
present.

| # | Remediation claim | Verdict | Independent evidence |
| --- | --- | --- | --- |
| **BLOCKER-1** | All nine active-session mutators route through full-row payload builders | **CLOSED** | Every UI-exposed mutation was driven through the real workout UI with `/api/sync` request bodies captured (probe 1+2): `startSession` (workoutSession + sessionExercise incl. `sessionId`), `logSet` (incl. `sessionExerciseId`, `setNumber`, `isWarmup`, `loggedAt`), `editSet`, `deleteSet`, `setExerciseNotes`, `setSessionNotes`, `setExerciseSkipped`, `addAdhocExercise`, `completeSession`, `discardSession`. All returned 200 with the op in `applied` and **zero** `rejected`; outbox reached 0 pending / 0 dead after each. PostgreSQL then read directly: `status=completed`, session `notes='great session, felt strong'`, exercise `notes='left knee twinge'`, edited set `101.50 / 6 / rir 1`, deleted set absent; second session `status=discarded`, position 0 `skipped=t` with template snapshot, position 1 `source=adhoc` / `prescription IS NULL` with set `60.00 × 12`. |
| **BLOCKER-2** | `SyncStatusBanner` surfaces dead letters and the 401 state | **CLOSED** | A *real* rejection was forced through the history-correction UI (`reps=500`, probe 3): banner rendered `1 change couldn't sync (invalid_payload).` with a Discard button. The dead op kept `tries: 0`, `deadReason: "invalid_payload"`, and its **full payload**; it survived 16s / 3+ flush cycles untouched; PostgreSQL was never modified. Discard removed only the dead letter and left an unrelated pending op intact, which then synced. Separately (probes 4/5/7) a genuine 401 was forced by clearing cookies mid-session: amber `Sign in to sync your changes.` rendered on both `/today` and `/history/[id]` while staying on the authenticated route, with the queued op still `pending` / `tries: 0`; re-authenticating flushed it and cleared the banner. Zero-dead-letter e2e runs were **not** treated as evidence here. |
| **HIGH-1** | Single multi-store `readwrite` transaction per mutator | **CLOSED** | Static: `commitSessionMutation` in [db.ts](src/sync/db.ts) is the only write path; all mutators in [activeSession.ts](src/sync/activeSession.ts) use it, including start and complete/discard. Runtime commit-together: with `/api/sync` aborted, the local `activeSession` and **both** implied ops (`workoutSession:upsert` + `sessionExercise:upsert`) coexist in IndexedDB (probe 1). Runtime **abort semantics** (probe 10): a transaction over the exact `["activeSession","outbox"]` pair that writes the session and then fails on the op write (`ConstraintError`) fired `onabort` and rolled the session write back — `activeSession.current.id` was byte-identical before and after (`01a00f9f-dc2f-…-abe2397`, never `ABORT-PROBE`). Offline convergence was not accepted as atomicity proof. |
| **HIGH-2** | Both helpers assert real state via `expect.poll` | **CLOSED** | [helpers.ts](tests/e2e/helpers.ts): `waitForOutboxDrained` polls `readOutboxStatusCounts` and requires `{pending: 0, dead: 0}` — drained means zero pending **and** zero dead, so a dead-lettered op can no longer satisfy it. `waitForServiceWorkerReady` polls `Boolean(reg.active)` on the registration, i.e. an active controlling worker, not a bare `navigator.serviceWorker.ready`. Neither can resolve while its predicate is false. Observed run durations (7.8s / 3.9s) are consistent with real polling. |
| **HIGH-3** | Real process-relaunch acceptance scenario | **CLOSED** | [offline-sync.spec.ts](tests/e2e/offline-sync.spec.ts) uses `chromium.launchPersistentContext` against one on-disk profile three times with `context.close()` between launches — genuine process teardown, not `page.reload()`. Verified independently by reading PostgreSQL after the clean-harness suite: 6 new sessions, of which 2 completed with **exactly two sets each** (`110×5` + `112.5×3`; `100×8` + `102.5×6`) and 4 discarded — exactly-once convergence with no duplicates and no warm in-memory reuse. |
| **HIGH-4** | Session-notes UI wired to `setSessionNotes` | **CLOSED** | Verified through the actual workout UI, not the server test: the "Add workout notes" toggle + textarea in [WorkoutExecution.tsx](src/ui/workout/WorkoutExecution.tsx) fired a `workoutSession:upsert` op on blur, which was `applied`, and PostgreSQL then held `workout_sessions.notes = 'great session, felt strong'` (probe 1). |
| **HIGH-5** | Only `/api/today-bundle` is cached; truthful staleness UI | **CLOSED (nuance)** | [sw.ts](src/app/sw.ts): the catch-all "apis" entry is replaced in-position by `/api/today-bundle` → `NetworkFirst`, `networkTimeoutSeconds: 3`, own `today-bundle` cache; every other same-origin `/api/` GET → `NetworkOnly`. Runtime (probes 8+9): live cache names were `serwist-precache-v2`, `others`, `pages-rsc-prefetch`, `today-bundle`, and after visiting both `/today` and `/history` the **only** `/api/` URL in any cache was `/api/today-bundle`. Offline `/history` rendered `Failed to load history.` — never stale data. Online-fresh: no banner. Stale-but-connected (intercepted `generatedAt` aged 60s): `Showing cached data as of 17.8.2026, 14:02:32.` Offline with an aged SW cache entry: `Showing cached data as of 17.8.2026, 14:05:00.` Offline after `caches.delete("today-bundle")`: `Offline — showing cached data as of 17.8.2026, 14:05:00.` via the IndexedDB `bundleCache` fallback, with the workout still fully rendered — timestamps coherent across both paths. Nuances → §5 R4. |
| **MEDIUM-1** | Client half fixed; server granularity/LWW "accepted deviation" | **client CLOSED / server OPEN (by design)** | Client half independently confirmed by the captured payloads under BLOCKER-1 (full rows, all required ids present). Server half independently confirmed **not** fixed, and stronger than the report states: `updatedAt`/`updated_at` appears **nowhere** in [schema.ts](src/domain/sync/schema.ts), so no client timestamp is transmitted and the server has nothing to compare — the three update paths in [service.ts](src/server/sync/service.ts) (lines 211, 326, 425) build field-by-field patches seeded with a *server*-stamped `updatedAt`. LWW is arrival-order-only by construction, not by omission of a comparison. The "accepted deviation" label is **not** ratified here — see §6. |
| **MEDIUM-2** | `listPendingOps` filters `nextAttemptAt <= now`; backoff enforced | **CLOSED** | Static: [outbox.ts:29-34](src/sync/outbox.ts#L29-L34) filters on both `status` and `nextAttemptAt`; `markTried` persists `nextBackoffDelayMs(tries)` (1s base, ×2, 20% jitter, 60s cap). Runtime (probe 11, `/api/sync` failed at the network layer so the real UI could still be driven): at t+2.5s `tries` was **1** — the review measured 0→3 in ~1.5s — and after 25s of continuous failure it had reached only **4** (2s/4s/8s/16s spacing). Zero retries occurred before the op's own recorded `nextAttemptAt`. |
| **MEDIUM-3** | Upper-bound validation in `ExerciseCard` | **CLOSED (in-session)** | [ExerciseCard.tsx](src/ui/workout/ExerciseCard.tsx) `validateSetInput` (`MAX_WEIGHT_KG 9999.99`, `MAX_REPS 100`, `MAX_RIR 10`) is used by both `handleLogSet` **and** the `SetRow` edit path. Runtime: all four out-of-range inputs produced the exact inline error and enqueued **zero** ops (probe 1). The equivalent history-correction path is still unvalidated → §5 R1. |
| **MEDIUM-4** | `navigator.storage.persist()` on app start | **CLOSED** | [SyncBootstrap.tsx](src/ui/SyncBootstrap.tsx) calls it feature-detected in a mount effect, and the component is mounted in [(app)/layout.tsx](src/app/(app)/layout.tsx) so it runs on every authenticated page. Runtime: the API is present and the call path executes; `navigator.storage.persisted()` returned `false` in headless Chromium, which is the expected headless outcome and not evidence of a defect (grant/deny is the browser's decision — the requirement is that the request is made). |
| **MEDIUM-5** | Bundle carries `loadStepKg`, `generatedAt`, distinct `previousPerformance` | **CLOSED** | Verified on the wire, not in a test: `GET /api/today-bundle` → 200 with top-level keys `["today","activeSession","generatedAt"]`, `generatedAt: "2026-08-17T12:11:59.455Z"`, and per-exercise keys `[prescriptionId, exerciseId, exerciseName, scheme, targetRir, restSeconds, progression, baselineLoadKg, loadStepKg, prefill, previousPerformance, history]` with `loadStepKg: 2.5`, `previousPerformance.length: 3`, `history.length: 5` (probe 11). |
| **MEDIUM-6** | `before=` validated, returns 400 | **CLOSED** | [api/history/route.ts](src/app/api/history/route.ts) rejects a non-parsable `before` with 400 `invalid_input`. Also checked: `limit=-5` is clamped to 1 in [history/service.ts:74](src/server/history/service.ts#L74) — correct, not a defect. The *path* param remains unvalidated (review L8, deferred) → §5 R2. |
| **MEDIUM-7** | Amber "sign in to sync" pill | **CLOSED** | Same independent 401 reproduction as BLOCKER-2 (probes 4/5/7): pill rendered, queued ops untouched, cleared on re-auth. |
| **MEDIUM-8** | Confirmation before in-session set delete | **CLOSED** | `window.confirm("Delete this set?")` gates `onDelete` in `SetRow`; the delete only enqueued its op after the dialog was accepted in the driven UI (probe 2), and PostgreSQL showed the set absent afterwards. |
| **MEDIUM-9** | `sessionBlocked` stops writes and says so | **CLOSED (nuance)** | Runtime (probe 10): with a dead-lettered `workoutSession` op whose `payload.id` matched the live session, the red strip appeared within the 5s poll reading *"This workout can't sync anymore (it conflicts with a session on another device). Further changes are disabled — discard it to start fresh."* Measured control states: Complete `disabled`, `+ Add exercise` `disabled`, workout-notes toggle `disabled`, Skip `disabled`, **Discard enabled** as the escape hatch. One gap → §5 R3. |
| **MEDIUM-10** | `webServer.command` builds and starts | **CLOSED (nuance)** | Verified from a genuinely clean harness: port 3000 confirmed free, no server pre-started, `pnpm test:e2e` invoked directly → Playwright ran `pnpm build && pnpm start` itself and the suite passed **6/6 in 50.2s**. It can no longer silently run against `pnpm dev`, and `waitForServiceWorkerReady` (HIGH-2) would now fail fast if no worker activated. Harness still does not seed the DB → §5 R6. |
| **MEDIUM-11** | Implementation-report claims corrected | **CLOSED (nuance)** | The suite counts asserted by the remediation were reproduced exactly and independently: unit **184/184** (15 files), integration **107/107** (9 files), e2e **6/6**. `activeSessionPayloads.test.ts` is 233 lines / 14 tests (claimed "234 lines" — immaterial). The one substantive gap: MEDIUM-1's deviation is documented **only inside the remediation report**; [docs/architecture/deviations.md](docs/architecture/deviations.md) still contains only D-01 and D-02 → §5 R5, §6. |
| **L1–L8** | Deferred | **DEFERRED (confirmed)** | Consistent with the review's own framing; not reopened. L8 specifically confirmed still reproducible → §5 R2. |
| **L9** | README deferrable table updated | **CLOSED** | [README.md:99-103](README.md#L99-L103) now cites `data-model.md` §2.13/§2.14 for both constraints and states the hand-patch is delivered in `drizzle/0004_zippy_wolfsbane.sql` and confirmed live via `pg_constraint`. |

---

## 3. Independent runtime probes

Eleven browser probes were run against a local production server (`pnpm build && pnpm start`,
`output: standalone`) with the local Docker PostgreSQL. Probes drove the real UI (Playwright,
including `launchPersistentContext` where process identity mattered), captured every
`/api/sync` request body, read IndexedDB (`activeSession`, `outbox`, `bundleCache`) directly,
enumerated the Cache Storage API, and read PostgreSQL out-of-band via
`docker exec gym-app-db-1 psql`.

| Probe | Target | Exact result |
| --- | --- | --- |
| 1 | B1 payload audit, H1 commit-together, H4 notes, M3 create-path bounds | 10 mutation kinds captured, all full-row, all `applied`, 0 `rejected`; 4/4 out-of-range inputs blocked with 0 ops enqueued; with `/api/sync` aborted, session + both ops coexist in IndexedDB |
| 2 | Skip, ad-hoc exercise, delete-set confirm, discard | Position 0 `skipped=t` (template, snapshot intact); position 1 `source=adhoc`, `prescription IS NULL`, set `60.00 × 12`; deleted set absent; session `status=discarded` |
| 3 | B2 real rejection | `1 change couldn't sync (invalid_payload).` + Discard; dead op `tries: 0`, payload intact, untouched across 16s / 3+ flush cycles; Discard removed only the dead letter; PostgreSQL unchanged |
| 4, 5, 7 | B2/M7 forced 401 | `Sign in to sync your changes.` on `/today` and `/history/[id]`, still on the authenticated route; queued op `pending`, `tries: 0`; re-auth flushed it and cleared the pill |
| 6 | `/api/history/<non-uuid>` | HTTP **500** with an unhandled PG `22P02`; server stayed up 12s in the targeted repro (see R2) |
| 8 | H5 cache inventory + banner states | Caches `serwist-precache-v2`, `others`, `pages-rsc-prefetch`, `today-bundle`; only `/api/today-bundle` cached among APIs; offline `/history` → `Failed to load history.`; online-fresh → no banner; stale-but-connected → `Showing cached data as of 17.8.2026, 14:02:32.` |
| 9 | H5 offline provenance | Offline + aged SW entry → `Showing cached data as of 17.8.2026, 14:05:00.`; offline + emptied SW cache → `Offline — showing cached data as of 17.8.2026, 14:05:00.` via IndexedDB fallback, workout still rendered |
| 10 | M9 blocked session, H1 abort semantics | Strip text verbatim; `{complete: true, addExercise: true, notesToggle: true, skip: true, discard: false, openEditorSave: false}`; abort probe `{keyPath: "opId", aborted: true, sessionIdBefore === sessionIdAfter}` |
| 11 | M2 backoff, M4 persistence, M5 DTO | `tries` = 1 at t+2.5s, 4 at t+25s, zero early retries; storage API present and exercised; bundle DTO as quoted in §2 |

Every probe cleaned up after itself; the final check showed an empty outbox and no
in-progress session.

---

## 4. Regression and migration verification

All commands run locally, independently of the remediation pass.

| Command | Result |
| --- | --- |
| `pnpm lint` | clean (0 problems) |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm test:unit` | **184 passed** / 15 files |
| `pnpm test:integration` | **107 passed** / 9 files |
| `pnpm test:e2e` | **6 passed in 50.2s**, from a clean harness with no pre-started server (Playwright ran `pnpm build && pnpm start`) |
| `pnpm build` | succeeds (covered by the e2e harness build; `next start` emits the standalone warning in R7) |
| `pnpm db:migrate` | applied cleanly against `gym-app-db-1` |
| `pnpm db:generate` (drift) | "No schema changes, nothing to migrate", generated into an out-of-repo directory; `git status --porcelain` unchanged afterwards |

Live constraint inspection (`docker exec gym-app-db-1 psql`, `pg_constraint`):

- `uq_session_exercise_position` — `condeferrable = t`, `condeferred = t`
- `uq_set_number` — `condeferrable = t`, `condeferred = t`
- `uq_sessions_one_in_progress` — a partial unique **index**, therefore not deferrable; this is
  correct and matches the review's expectation.

`drizzle/0004_zippy_wolfsbane.sql` and `drizzle/meta/0004_snapshot.json` remain the only new
migration artifacts. No previously verified schema, migration, snapshot, ownership, lifecycle,
or carry-forward behaviour was reopened — no regression evidence pointed at any of it.

---

## 5. Remaining findings

**R1 — MEDIUM (new). The history-correction path bypasses the typed payload builders and all
bounds validation, and its optimistic UI is never reverted on rejection.**
[corrections.ts](src/sync/corrections.ts) hand-builds `payload: { id, sessionExerciseId, ...patch }`
via `enqueueOp`, bypassing `buildSetLogUpsertPayload` and every bound that MEDIUM-3 added, and
`HistorySetRow`'s Save in [HistoryDetail.tsx](src/ui/history/HistoryDetail.tsx) validates
nothing. Worse, `onSave` applies `updateLocalSet(...)` optimistically and never reverts: after
the rejection I forced in probe 3, the screen displayed `500` reps that PostgreSQL never
accepted, and re-editing that row re-sends the invalid field. BLOCKER-2's banner makes the
failure *visible* (which is why this is a MEDIUM, not a BLOCKER), but the displayed value is
untrue until reload. Suggested fix: route corrections through the same builder + `validateSetInput`,
and revert local state when an op dead-letters.

**R2 — MEDIUM (confirmed L8 + one unexplained event). `/api/history/<non-uuid>` → 500, and a
one-off server process exit was observed after one such request.**
The 500 with an unhandled PG `22P02` is reproducible ([api/history/[id]/route.ts](src/app/api/history/[id]/route.ts)
passes the path param straight through) and was explicitly deferred as review L8 — a
project-wide convention gap, also present in Phase 2 routes. The new information: during probe 4
the production server process died with exit code `3221226505` (`0xC0000409`) shortly after that
error was logged. A targeted single-request repro (probe 6) returned 500 and the server stayed
alive for 12s, and [db/client.ts](src/db/client.ts) does have a `pool.on("error")` handler, so
the classic idle-client crash is ruled out. **This is a correlation I could not reproduce — not
a demonstrated cause.** Recommend adding UUID validation to the path params regardless (cheap,
removes the only observed trigger).

**R3 — LOW. A set editor already open when a session becomes blocked stays savable.**
[ExerciseCard.tsx:219-277](src/ui/workout/ExerciseCard.tsx#L219-L277): `SetRow`'s `editing`
branch ignores the `disabled` prop, so Save was measurably enabled while `sessionBlocked` was
true (probe 10). Impact is small — the extra op simply dead-letters alongside the others — but
it contradicts the strip's "Further changes are disabled".

**R4 — LOW. Two HIGH-5 labelling nuances.** (a) Offline **within** the 10s staleness window
shows no banner at all, because `stale` is false and `status` is not `offline` while the SW
answers 200 from cache. (b) Offline with a *populated* SW cache says "Showing cached data",
not "Offline — …", because the page cannot tell a cache hit from a network hit; only the
IndexedDB fallback path reports "Offline". Both are truthful about the timestamp; neither is
untruthful about connectivity, just less informative than it could be.

**R5 — LOW. MEDIUM-1's deviation is not in the deviation register.**
`docs/architecture/deviations.md` still lists only D-01 and D-02. A deviation documented solely
in a remediation report is not discoverable from the architecture corpus. See §6.

**R6 — LOW. The clean e2e harness still does not seed the database.**
`pnpm test:e2e` now builds and starts a real server, but the fixtures still require a manual
`pnpm tsx tests/e2e/seed.ts` with `DATABASE_URL` set. [tests/e2e/seed.ts](tests/e2e/seed.ts)'s
header comment is now stale — it still says Playwright's webServer "only starts `pnpm dev`, no
DB seeding".

**R7 — LOW. `next start` warns against `output: "standalone"`.** The harness build logs
`"next start" does not work with "output: standalone" configuration`. Tests pass, but the local
e2e server is not exercising the same entrypoint production uses.

**R8 — LOW. Reconnecting does not reset the backoff clock.** Measured: 14.9s from reconnect to
drain while 11.8s of backoff remained (probe 11). Worst case is the 60s cap plus the 5s poll
before a reconnected device syncs. Correct per spec, and it never loses data; it is a latency
surprise worth knowing on a gym Wi-Fi handoff.

**R9 — LOW. `authRequired` can only be cleared by a successful `/api/sync` response**, since
`flushOutbox` returns early when nothing is pending. Empirically it cleared on re-auth, and the
stuck-pill scenario requires emptying the outbox without a successful flush, so this is
theoretical — noted for completeness.

**R10 — LOW. `hasPendingOps()` is now unused, and post-MEDIUM-2 it would lie.** It delegates to
the `nextAttemptAt`-filtered `listPendingOps`, so an op that is queued but backing off reports
"no pending work". Harmless today (no callers); a trap if it is ever reused as a "drained"
signal.

---

## 6. MEDIUM-1 — decision required from you

The remediation labels MEDIUM-1's server half an "accepted deviation". That label is the
implementer's; the decision is yours. What I verified, precisely:

- **Client half: genuinely fixed.** Every op the client sends is a full row with all required
  ids — captured on the wire, not inferred.
- **Server half: not fixed, and structurally so.** No `updatedAt` field exists anywhere in the
  sync op schema, so the client never transmits a client-side write time. The server's three
  update paths apply field-by-field patches and stamp their own `updatedAt`. Last-write-wins is
  therefore arrival-order-only and cannot be made timestamp-based without a schema change; it
  is not a missing `if` comparison.
- **Actual current risk: none for you today.** ADR-004 fixes the product at a single account and
  a single active session, and `uq_sessions_one_in_progress` plus the takeover flow prevent two
  devices from concurrently editing one session's rows. Field-merge divergence needs two devices
  editing *different fields of the same row* while both are offline — not reachable in the
  Phase 3 product.

**Recommendation: accept it for Phase 3, but record it properly and put a trigger on it.**
Concretely: add a `D-03` entry to `docs/architecture/deviations.md` stating that sync applies
partial-field patches with arrival-order LWW rather than the full-row upserts with
`updated_at`-based LWW that `implementation-plan.md` Phase 3 and `pwa-offline-strategy.md` §5
specify, that the accepted scope is single-account/single-device, and that the deviation must be
revisited before either a second device is used concurrently or Phase 4's decision engine starts
writing derived fields to the same rows. That is a documentation change, not a redesign, and it
keeps the corpus honest — which is what the review actually objected to ("Architecture
deviations: None").

The alternative — implementing true full-row upserts with a client `updatedAt` and timestamp
LWW now — is a server + schema + payload-builder change across all three entities. I do **not**
recommend doing it inside a remediation pass; it is Phase 4-adjacent work that deserves its own
plan and its own review.

If you would rather not accept it, say so and it becomes a HIGH for a further remediation pass;
the gate below assumes acceptance-with-documentation.

---

## 7. Final gate

**READY FOR MANUAL IPHONE ACCEPTANCE / PHASE 3 CLOSURE.**

No BLOCKER and no HIGH finding remains open. Both BLOCKERs and all five HIGHs were verified
closed by independent runtime reproduction, and the full regression, build, migration, and live
constraint checks are green from a clean harness.

Phase 3's remaining risk is not in the code paths this verification could exercise — it is in
the things only a real device can show: iOS Safari's storage-eviction behaviour under
`navigator.storage.persist()`, service-worker lifecycle on a home-screen-installed PWA, a real
process kill in the middle of a set, and gym-Wi-Fi reconnect timing (R8). **Recommend the real
installed-iPhone / in-gym acceptance pass next, not Phase 4.**

Before or alongside that pass, three cheap items are worth clearing: **R1** (the history
correction path — it is the one place where the UI can still show a value the database rejected),
**R2**'s UUID path validation (removes the only observed trigger for the unexplained server
exit), and the **§6 D-03** register entry.

---

## 8. User disposition (2026-08-17)

Recorded after the user reviewed §§1–7. This section is the disposition only; nothing above it
was rewritten, and the historical implementation, review, and remediation reports were left
untouched.

- **MEDIUM-1 — accepted for Phase 3 / the MVP**, and recorded as **D-03** in
  [docs/architecture/deviations.md](../architecture/deviations.md). The client emits full-row
  payloads; the server applies conditional field patches in arrival order, and the sync op
  contract transmits no client write timestamp, so timestamp-compared whole-row LWW is not
  provided as `implementation-plan.md` Phase 3 describes it. Risk accepted for the personal
  single-account / single-active-session posture; the carried residual is concurrent
  multi-device editing, especially post-completion history corrections. D-03 records the revisit
  triggers and states that this is not permission to add CRDTs, vector clocks, or general merge
  machinery.
- **R1 — deferred to the MVP hardening backlog.** The defect is *misleading optimistic UI*, not
  database corruption or silent loss: the server rejects the invalid value, PostgreSQL is never
  written, and the BLOCKER-2 sync banner surfaces the failure with its reason. The displayed
  value is untrue until reload, which is a correctness-of-display problem to fix during
  hardening, not a data-integrity problem gating Phase 3.
- **R2 — deferred to general API-validation hardening**, alongside the same missing path-param
  UUID validation in the Phase 2 routes (review L8). The reviewer's caveat is retained verbatim
  in scope and force: the server process exit (`0xC0000409`) was **observed once but could not be
  reproduced**, `pool.on("error")` is present so the classic idle-client crash is ruled out, and
  this remains documented as **correlation only — not a demonstrated cause**.
- **R3–R10 (LOW)** and **L1–L8** remain consciously deferred; no new work was authorized on them.
- **Final gate unchanged: READY FOR MANUAL IPHONE ACCEPTANCE / PHASE 3 CLOSURE.** Phase 3 is
  **not** marked fully closed. The remaining gate is the human one: the real
  installed-iPhone / offline in-gym acceptance test.

The verified Phase 3 work was authorized for commit and push to `origin/main` on this basis.
