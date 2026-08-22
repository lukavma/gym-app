# Phase 4 — Progression Engine v1: Independent Review

Date: 2026-08-22
Reviewed commit: `f50be14` (`feat: implement progression engine v1`)
Scope: `implementation-plan.md` Phase 4 / `mvp-scope.md` F7, verified against
`progression-engine.md` (all sections, §9 literally), ADR-006, and the
binding sections of `data-model.md` §2.15, `domain-model.md` §7/§10,
`prescription-model.md` §4, `pwa-offline-strategy.md` §2/§4/§5/§6/§10, and
`deviations.md`.

Method: the implementation report (`docs/reviews/phase-4-implementation.md`)
and its shipped tests were treated as claims, not evidence. Every claim that
mattered was re-derived by reading the code and then exercised with
reviewer-written adversarial tests kept outside the repository
(scratchpad `engine.review.test.ts`, 32 pure-engine cases; `server.review.test.ts`,
20 PGlite cases through the real sync write path — **52/52 green**), plus direct
inspection of the local Docker PostgreSQL 16 (`gym-app-db-1`). The shipped
suites were also reproduced (`pnpm test:unit` 247/247, `pnpm test:integration`
125/125). No implementation file was modified, nothing was committed, pushed,
deployed, or run against production. The human iPhone pass is out of scope
here and is neither repeated nor claimed.

---

## 1. Verdict summary

| Area | Result |
|---|---|
| §9 cases 1–14, literal | ✅ all pass with independent fixtures (§2.1) |
| Determinism / versioned registry / config & classification | ✅ (§2.2) |
| Recommendation persistence + `uq_recs_one_pending` | ✅ schema and live index match `data-model.md` §2.15 (§2.3) |
| Server completion evaluation: transaction + op order | ✅ atomic, exactly-once, decision-before-completion honoured (§2.4) |
| Offline client evaluation, ordering, reconciliation, dedupe | ✅ with two LOW gaps (§3 L-1, L-4) |
| Supersede-on-relevant-edit | ✅ gated on evaluation inputs; record churn on warmup/renumber edits (LOW, §3 L-3) |
| Immutable record + one-time decision | ✅ (§2.6) |
| Explicit + rounded implicit accept/modify/reject | ✅ (§2.7) |
| Carry-forward after every decision type | ✅ with one documented interpretation (§3 L-2) |
| Reject leaves prescriptions/templates/next targets unchanged | ✅ proven byte-identical (§2.8) |
| No automatic planning mutations | ✅ grep + test (§2.9) |

**No BLOCKER or HIGH findings. One MEDIUM (pre-existing Phase 3 behaviour
surfaced by the Phase 4 offline batch), five LOW.**

---

## 2. Verified behaviour (evidence)

### 2.1 §9 matrix — literal correctness of all 14 cases

Reviewer fixtures were written from the §4 pseudocode, not from the shipped
`tests/unit/progressionMatrix.test.ts`, and assert the full draft (action,
target, ordered reason codes, confidence, derived inputs) where §9 specifies it.

| # | Case | Observed (`src/domain/progression/loadProgression.ts`, `repProgression.ts`) |
|---|---|---|
| 1 | 5×5 @100, final RIR 2 | `increase_load {102.5}`, `[ALL_PRESCRIBED_REPS_COMPLETED, FINAL_SET_RIR_IN_PROGRESS_ZONE]`, high |
| 2 | final RIR 0, `holdAtRirZero` | `hold {100}`, `[…COMPLETED, FINAL_SET_RIR_AT_LIMIT]`, high (shipped test omits the confidence assertion; verified here) |
| 3 | 4×5 + 1×4 | `hold {100}`, `[PRESCRIBED_REPS_NOT_COMPLETED]`, high |
| 4 | RIR null, `reps_only` | `increase_load {102.5}`, `[…COMPLETED, RIR_MISSING_REPS_ONLY_EVALUATION]`, medium |
| 5 | RIR null, `hold` | `hold {100}`, `[…COMPLETED, RIR_MISSING_HOLD_POLICY]`, medium |
| 6 | two incomplete at same load, `decrease` | `decrease_load {97.5}` for 107.5 (96.75 → step 2.5), `[REPEATED_INCOMPLETE_AT_LOAD, DECREASE_APPLIED]`, medium; a prior failure at a *different* load correctly breaks the streak → hold |
| 7 | 3×8–12 at 10s | `increase_reps {reps 11, loadKg 60}` with `currentRepTarget: 10`; with no prefill the target is `minReps` (8 → 9); `repCap` omitted on `repRange` falls back to `maxReps` |
| 8 | at cap, `hold` | `hold {60, 12}`, `[REP_CAP_REACHED, HOLD_POLICY]` |
| 9 | at cap, `suggest_load_increase` | `increase_load {62, reps 8}` (step 2.0); explicit `loadIncrementOnRollover`/numeric `resetRepsOnRollover` honoured |
| 10 | deload session | `evaluateSession` returns `[]` for both strategies (`evaluateSession.ts:100`) |
| 11 | RIR 8 vs gate 1–3 | `hold`, `[FINAL_SET_RIR_ABOVE_PROGRESS_ZONE_SUSPECT]`, low — both strategies |
| 12 | dumbbell 2.0 | 22.5+2 → 24; stored `incrementKg 2.5` on a 2.0 step → 24; decrease 31×0.9 → 28; `roundToStepKg` is float-safe at 2 decimals |
| 13 | determinism | `JSON.stringify` byte-equality across two builds, both strategies, with history |
| 14 | exhaustiveness | **every** strategy × **every** `SCHEME_TYPES` entry run through `evaluateSession` (the shipped test only checks `supportsScheme`, which ignores `strategyId`): `manual` → no record; others → a record with ≥1 code and never `UNSUPPORTED_SCHEME`; a fake future scheme → clean `none`/`UNSUPPORTED_SCHEME` |

Additional engine probes (all pass): `repShortfallTolerance`, `decreaseAfterConsecutiveFailures: 1`, `holdAtRirZero: false`, `skipDeloadSessions: false` (deload entry then participates in and breaks a streak), history entries judged against **their own** snapshot scheme (`loadProgression.ts:48-56`), mixed-load modal/flag/medium cap with earliest-set tie-break, not-completed confidence medium/high by RIR presence, rep-progression at-limit RIR always holds, corrupt snapshot config skipped without throwing (`evaluateSession.ts:125`), `user_defined` classification carried verbatim from the snapshot.

Two spec interpretations worth recording (neither contradicts binding text):

- `load-progression` sums shortfall over the **first S** work sets (`loadProgression.ts:28-34`) — a bonus 6th set with fewer reps does not break completion, but its RIR **is** the final-set RIR (spec: "finalRir = last work set rir"), so a bonus set at RIR 0 turns an otherwise-earned increase into `hold/AT_LIMIT`. Spec-literal; users doing back-off sets should log them as RIR-honest or expect a hold.
- `rep-progression` requires **every** logged work set ≥ target (`repProgression.ts:72`) — a bonus 4th set below target blocks progression. Also spec-literal ("every work set reps ≥ currentTarget").

### 2.2 Determinism, versioned registry, config/classification

- `evaluate*` functions contain no clock, randomness, or IO; `performedAt` is data. `src/domain/progression/` imports nothing outside `domain` (import boundary lint passes).
- Strategy code version = `STRATEGY_VERSIONS` (`src/domain/schemas/prescriptionSnapshot.ts:60`); `strategy_version` on the record is the registry version that ran (`evaluateSession.ts:156`). All v1.
- Config is Zod-parsed from the frozen snapshot before evaluation and the **materialized** (defaults-filled) object is what is persisted (`evaluateSession.ts:120-126`). Verified in PGlite: a prescription tuned to `incrementKg: 5` produces `classification: user_defined`, `config` containing both `incrementKg: 5` and defaults, target 105; retuning the prescription afterwards changes neither the record nor the session snapshot and applies only from the next snapshot (`server.review.test.ts` "config freeze & classification").
- `resolveProgression` classification: defaults (including materialized `incrementKg = loadStepKg`) → `heuristic`; any tuned knob → `user_defined`; `evidence_supported` is unwritable through the schemas (`src/domain/schemas/recommendation.ts:83`).
- Client/server context equivalence: the client omits `block.goal`; drafts are byte-identical with and without it for v1 strategies (probe passes).

### 2.3 Recommendation persistence and pending uniqueness

- `src/db/schema/recommendations.ts` and `drizzle/0005_sloppy_tigra.sql` are column-for-column `data-model.md` §2.15, including FK actions and all six check constraints.
- Live Docker PG16 (`psql -U gymapp -d gymapp`, `\d recommendations`): `uq_recs_one_pending UNIQUE btree (exercise_id, COALESCE(block_id, '00000000-…'::uuid)) WHERE decision_status = 'pending'`, `ix_recs_exercise`, `ix_recs_pending` all present; `drizzle.__drizzle_migrations` shows 6 applied entries (0000–0005). Local dev rows: 2 (one `accepted`, one `modified`, both `server`) — consistent with local manual use; nothing pending.
- PGlite: block-less sessions share the null slot and supersede each other; a block-scoped rec is a separate slot (probe "block-less sessions share the null-block slot").
- Supersede-before-insert runs in the same transaction in both the server path (`src/server/progression/service.ts:355-375`) and the client-rec path (`src/server/sync/service.ts:613-633`).

### 2.4 Server completion evaluation — transaction and order

- Evaluation runs inside the completion op's own transaction and only on a real `in_progress → completed` transition (`src/server/sync/service.ts:251-265`). Replaying the completion op is a no-op (`isNoopWorkoutSessionUpdate`) and never re-evaluates — verified.
- **Atomicity probe:** forcing a `uq_recs_one_pending` violation inside the evaluation (foreign-user pending row for the same exercise/block, which the user-scoped `supersedePending` cannot see) rolls the whole op back: session stays `in_progress`, `completed_at` null, no record inserted. The op is reported as `session_conflict` (see L-5).
- **Order:** a decision op followed by set ops and the completion op in one batch is applied in order, so `getInSessionDecisionChosen` (`service.ts:201-239`) sees the decision; verified end-to-end with rep-progression (8 → accept 9 → evaluated at 9 → next target 10, `currentRepTarget: 9`, session snapshot still `prefill.reps = 8`).
- History assembly (`getEngineHistory`, `service.ts:140-188`): completed, same exercise, strictly before by `started_at`, capped at 5, sets ordered by `set_number`, warmups excluded, each entry carrying its own snapshot scheme. Verified with real sessions: failure streak → decrease, `historyDepthUsed` 1/5 as expected, and a re-evaluation after an edit reconstructs the identical history frame.

### 2.5 Offline client evaluation, ordering, reconciliation, dedupe

- `src/sync/activeSession.ts:503-611`: client evaluation runs only when `navigator.onLine === false`; rec ops are enqueued **ahead of** the completion op in one IndexedDB commit; inputs mirror the server's (snapshot with in-session decision overlay, sets sorted by `setNumber`, warmups excluded, bundle history with `prescribed`).
- Server dedupe in "initial" mode skips exercises that already have a record for that `source_session_exercise_id` (`progression/service.ts:290-298`); verified: `[…, clientRec, completion]` → exactly one record, `computed_by = client`, `created_at` = client evaluation time, pending; the next server evaluation supersedes it normally.
- The rec-op and completion-op pair replay as no-ops; the creation op does not (see M-1).

### 2.6 Immutable recommendation, one-time decision

- Only two writers touch `recommendations` after insert: `supersedePending` (pending → superseded, `progression/service.ts:244-261`) and the decision append (pending → accepted/modified/rejected, `sync/service.ts:662-704`). Verified: an accepted record is deep-equal before/after a later supersede pass and after an edit of its source session; a decision on a **superseded** record dead-letters as `decision_conflict` and writes nothing (this case is asserted in the report but not in the shipped tests); a conflicting second decision dead-letters; an identical replay converges.
- No automatic recomputation after a decision: set edits on a decided source session leave the record untouched (verified).

### 2.7 Explicit and rounded implicit decisions

- `resolveImplicitDecision` (`src/domain/progression/implicitDecision.ts`): compares the first work set's logged load with `roundToStepKg(target.loadKg, step)`; equal → `accepted` with `chosen = full target` (reps included for `increase_reps`); different → `modified` with `chosen = {loadKg: actual}` only; no load target (`none`) → stays pending. Off-step target 101.3 on a 2.5 step accepts 102.5; step 0 degrades to exact equality. Matches §7 and the plan's "matching rounded target".
- Client wiring (`activeSession.ts:344-373`): fires only on the **first non-warmup** set and only while `decision.status === 'pending'`, `decidedAt = loggedAt`, committed in the same IDB transaction as the set. Explicit path (`decideRecommendation`, `:389-422`): accept → chosen = target, custom → chosen = user values, reject → chosen null; throws if already decided.
- UI: `RecommendationCard.tsx` hides the buttons once decided and for `none`/target-less records; `ExerciseCard.tsx` prefill = last set → pending/accepted target → modified chosen → snapshot prefill (post-reject fallback). Every persisted record has ≥1 reason code by the §5 persist rule and `REASON_CODE_COPY` is `Record<ReasonCode, string>` (compile-complete) → F7's "at least one plain-language reason" holds.

### 2.8 Carry-forward after every decision type; reject leaves everything unchanged

PGlite, through bundle prefill **and** the subsequent evaluation:

| Decision | Next bundle prefill | Next evaluation target |
|---|---|---|
| accepted 102.5 | 102.5 | 105 |
| modified 97.5 | 97.5 | 100 |
| rejected | unchanged (97.5, the pre-decision prefill) | 100 |

Reject test: `exercise_prescriptions`, `workout_templates`, `blocks`, `programs` rows deep-equal before and after a full accept → modify → reject sequence; every session snapshot retains its frozen prefill; the rejected record keeps its output and `decision_chosen = null`.

### 2.9 No automatic planning mutations

`grep` over `src/` for `.update(|.insert(|.delete(` on planning tables: `exercise_prescriptions` is written only by `src/server/prescriptions/service.ts`, `workout_templates` only by `templates/service.ts`, `blocks` only by `blocks/service.ts`. `src/server/progression/service.ts` and `src/server/sync/service.ts` write only `recommendations`/session tables. `set_logs` has no write path outside the sync service (the history API is GET-only), so supersede-on-edit cannot be bypassed.

---

## 3. Findings

Severity scale: BLOCKER / HIGH / MEDIUM / LOW. Each is labelled as a
correctness defect (D), a spec-interpretation or documentation gap (G), or a
test gap (T).

### M-1 (MEDIUM, D — pre-existing Phase 3 behaviour, surfaced by the Phase 4 offline batch): replaying a completed-session batch dead-letters the session-creation op

`src/server/sync/service.ts:216-231`: the lifecycle check (`payload.status !== existing.status` → `ALLOWED_SESSION_TRANSITIONS`) runs **before** the terminal-state no-op tolerance (`isNoopWorkoutSessionUpdate`). The real client creation op carries `status: "in_progress"` (`src/sync/activeSession.ts:129`), so when a batch `[create, exercises, sets, recs, completion]` is applied and the response is lost (network drop after the server commits, or iOS kills the app between the response and `removeApplied` in `src/sync/flush.ts:84-85`), the resend rejects the creation op as `invalid_lifecycle_transition` and `flushOutbox` dead-letters it (`flush.ts:85`). Database state is correct (all other ops converge as no-ops — verified: rec op + completion op replay clean), but the user sees a spurious "sync issue" for a workout that synced fine, contradicting pwa-offline-strategy §5 "replays converge".

Evidence: `server.review.test.ts` "client-computed rec + completion, whole batch replayed twice" and "decision then completion in one batch" — both assert exactly one rejection, `opId` of the creation op, reason `invalid_lifecycle_transition`; `ops.slice(1)` replays with zero rejections.

Why MEDIUM, not HIGH: no data loss or rewrite; requires a lost response; the offline-completion batch makes the creation and completion ops co-resident in one batch, which is exactly the Phase 4 path. Not a Phase 4 regression — the same rejection exists in Phase 3 for any create-then-complete replay.

Test gap (T): the shipped replay test (`tests/integration/progression.integration.test.ts:249-258`) passes only because its fixture creation payload omits `status`, unlike the real client payload builder.

Suggested fix (for whoever picks it up; not required to pass this gate): in `applyWorkoutSessionUpsert`, treat a terminal-state row whose incoming payload matches the stored row on every field **except** a `status`/`completedAt` that equals the original creation values as a replay no-op — or simply stop sending `status` on creation payloads (the server already defaults it). Either way, add a replay test that uses `buildWorkoutSessionUpsertPayload` with the real client shape.

### L-1 (LOW, D): a client-computed recommendation for a session discarded server-side lands as pending

`src/server/sync/service.ts:571-604` validates ownership and referential consistency but not the source session's lifecycle. Sequence: device A completes offline (rec ops + completion queued); device B takes over and discards A's session; A's queue drains → rec op accepted (supersedes the prior pending for that exercise), completion op rejected `invalid_lifecycle_transition`. Result: a pending recommendation sourced from a **discarded** session rides the next bundle (`progression-engine.md` §8: discarded sessions are "never evaluated"). Verified by probe "GAP PROBE: client rec for a session discarded server-side".

Reachable only through the cross-device takeover race that `deviations.md` D-03 already scopes out of the MVP's single-device posture. Fix is a one-line lifecycle check (`status !== 'discarded'`) in the rec handler.

### L-2 (LOW, G): after an explicit reject, an older accepted decision outranks the most recent undecided lift

`src/server/progression/service.ts:408-437` / `workingTargets.ts` implement prescription-model §4 step 1 as "latest **accepted/modified** decision" (rejections are transparent — report decision #6). Consequence (probe "DOCUMENTED BEHAVIOUR"): accept 102.5 → reject 105 → lift 110 with no decision captured → next prefill is 102.5 (stale accepted value), while the last performance was 110; "Keep previous" on the new 112.5 rec therefore means 102.5, not 110. The implementation's reading is the one that makes F7's "rejecting leaves next targets unchanged" hold literally (a reject-blanks-chain reading would change the target in the accept-then-lift-differently case), and it self-corrects on the next accept/modify. Recommend documenting in `prescription-model.md` §4 that step 1 means the latest decision **with chosen values**, and that "Custom" — not reject-then-type — is how an off-target load becomes the new baseline.

### L-3 (LOW, D — cosmetic record churn): warmup-set edits and delete-renumbering re-evaluate needlessly

`setLogUpdateChangesEvaluationInputs` (`sync/service.ts:393-404`) treats any `setNumber`/`isWarmup`/`weightKg`/`reps`/`rir` change as relevant, including changes to rows that are warmups (excluded from evaluation) and the `setNumber` rewrites the client's `buildSetDeletionOps` emits after a delete; `applySetLogDelete` re-evaluates for any deleted row. Probe "CHURN PROBE": a warmup weight edit produces a superseded + identical new record; deleting a warmup with three renumber ops produces four more. Invariants hold (always exactly one pending), content is identical, history is correct — it is audit noise, not a defect in outcomes.

### L-4 (LOW, G): offline evaluation history is keyed by *today's* bundle template

`src/sync/activeSession.ts:505-521` builds `history` from `cached.bundle.today.exercises`. If the bundle was refreshed on a later day than the session was started (in-progress session carried across a day boundary, then completed offline), exercises not on the new "today" get `history: []`. With default config the draft differs only in `historyDepthUsed`; with `failureAction: 'decrease'` it can add `INSUFFICIENT_HISTORY` / miss a decrease the server would have produced. Within pwa-offline-strategy §4's accepted staleness; worth a line in the report's known limitations.

### L-5 (LOW, G): a unique violation inside the completion evaluation is reported as `session_conflict`

`sync/service.ts:273-275` maps every `23505` from the completion transaction to `session_conflict`, which the client interprets as the takeover situation. Only reachable cross-user or under concurrent evaluation for the same (exercise, block) — neither possible in the single-account, serial-flush MVP. The rollback itself is correct (§2.4).

### Observations (no action)

- `getSessionRecommendationsByExercise` (`progression/service.ts:443-469`) used by cross-device hydrate returns the newest non-superseded record even when it is already decided in an earlier session and nothing is pending; the local start path shows none. UI-only inconsistency; evaluation uses the `decidedAt` window and is unaffected.
- `assembleAndEvaluate`'s initial-mode dedupe query is not user-scoped (`:292-295`). Irrelevant for one account; note for any future multi-user change.
- Report decision #11 (`fixed` + `rep-progression` without `repCap` = uncapped) verified (target 40 → 41).

---

## 4. Documentation / report accuracy

- The implementation report's claims were all verified except where noted above; its "decision on a superseded record → `decision_conflict`" claim is true but was not covered by the shipped tests (now covered by the reviewer probe).
- `docs/architecture/deviations.md` needs no new entry from this phase: M-1 is a Phase 3 sync-contract detail, and every other item is an interpretation within the specs.
- Doc-drift worth fixing in the same PR that touches the area next: `prescription-model.md` §4 wording (L-2), report §5 known limitations (L-4).

---

## 5. Reproduction notes

- Reviewer suites live outside the repo (session scratchpad): `vitest.review.config.ts` (repo as root, `@` → `src`, PGlite + `next/headers` setup), `engine.review.test.ts`, `server.review.test.ts`. Run with `pnpm exec vitest run --config <scratchpad>/vitest.review.config.ts`. Result: 2 files, 52 tests, all passing (the "probe" tests assert the behaviours described in §3).
- Shipped suites: `pnpm test:unit` → 20 files / 247 tests passed; `pnpm test:integration` → 10 files / 125 tests passed (64 s, PGlite).
- Docker: `docker compose ps` → `gym-app-db-1` healthy; `psql -U gymapp -d gymapp -c "\d recommendations"` output recorded in §2.3.

---

## 6. Verdict

**READY FOR PHASE 5.**

No BLOCKER/HIGH findings. The single MEDIUM (M-1) is a pre-existing Phase 3 sync idempotence edge that produces a misleading dead-letter, not incorrect data; it and the LOW items can be folded into Phase 8's offline/PWA hardening or picked up opportunistically, and do not warrant a remediation cycle before Phase 5.
