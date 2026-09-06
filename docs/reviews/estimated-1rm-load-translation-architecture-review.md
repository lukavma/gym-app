# Estimated 1RM Tracker & Load Translation — Independent Adversarial Review

Date: 2026-09-04
Role: independent, adversarial review of `docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md` (referred to below as **the evaluation**). The evaluation was treated as a proposal to falsify, not as an authority. No feature was implemented.
Reviewed repository state: `main` @ `7d6bc6c` (`feat: add reusable warm-up routines`), with the pre-existing uncommitted working tree untouched.
Scope of change: this file only. Nothing else was created, modified, or deleted. The local Docker PostgreSQL was not started; every repository fact below was verified in source, schema, tests, and documents. Production was not accessed.

Identifier conventions: **RH-n** high findings, **RM-n** medium, **RL-n** low, **RI-n** informational. The evaluation's own identifiers (`B-n`, `I-n`, `O-n`, `F-n`, `R-n`, `A-n`, `RG-n`, `D-n`, `X-n`) are referenced with that prefix and always mean *the evaluation's*, never this review's.

---

## 1. Verdict

# `REVISION REQUIRED`

The **architecture is sound and should survive**: a pure derivation over immutable `set_logs`, computed on read, with no new fact, no sync entity, no persisted aggregate, and no progression-engine change is the right shape, is consistent with `architecture-plan.md` §7 / `data-model.md` §5 / ADR-007, and is worth building. The verdict is not a rejection of the design.

It is `REVISION REQUIRED` because four defects break claims the evaluation itself makes load-bearing, and because a substantial number of the document's own numbers, invariants, and acceptance criteria do not survive independent reproduction:

1. **RH-1 — "never a fact" is false on the path the evaluation designs for.** §14.1 row 2 deliberately shows the starting-suggestion card *alongside* a pending recommendation. Logging the suggested load as the first work set fires the existing implicit-decision path (`src/sync/activeSession.ts:468-493`) and enqueues a `recommendationDecision` op whose `chosen.loadKg` is the advisory number. **I-1** ("nothing … enters the outbox") and **A-18** ("no other op is enqueued") are both false there. The evaluation documents this exact mechanism in its own §2.1 and then asserts the opposite in §18.1/§19.
2. **RH-2 — the suppression gate, which is the whole "self-limiting" safety argument, does not fire for rep-range prescriptions.** `T = schemeDefaultReps(scheme)` is *not* "the same rule the prefill uses": the prefill is `decisionChosen?.reps ?? schemeDefaultReps(scheme)` (`src/domain/progression/workingTargets.ts:43`). Under `rep-progression` on a `repRange`, `T` stays pinned at `minReps` while the athlete trains 2–4 reps higher, so the card is emitted **every session of the block**, translating away from direct evidence the athlete produced yesterday.
3. **RH-3 — the direct tier is non-monotone and can over-prescribe.** Reproduced: on one fixed dataset, target 3 reps → 60 kg and target 4 reps → 120 kg. And because the direct tier returns a modal load with no target-RIR adjustment, a 12-rep-to-failure source translated to a 12-rep @ RIR 3 target over-prescribes by 7.1 % — uncapped, unfloored, unflagged, at "medium" confidence. This is the one tier that can emit a load *heavier* than the evidence justifies, and it is the tier the design trusts most.
4. **RH-4 — F-1 is materially larger than the evaluation states, and the modal-load defence fails on the sessions that matter most.** Unflagged ramps corrupt three *live* behaviours today (carry-forward prefill, `isCompleted`'s rep-shortfall, and modal load on single-work-set days), not only volume. And on a top-set day the modal rule silently understates the session e1RM by 22 % with no distinguishing flag.

Independent reproduction also found **13 failing property probes**, **8 unreachable reason codes**, **two arithmetic errors in worked fixtures**, **four wrong values in the formula-comparison table**, **four internal contradictions**, and **three unsupported or misattributed repository/evidence citations**. Two evidence characterisations do not survive checking against the repository's own corpus (RM-1), and one design constant — the RTF 11–15 extension — runs against both the external literature and a recorded decision, in the non-conservative direction (RM-13).

Conversely, the external literature **strengthens** two of the design's choices more than the evaluation itself claims: exercise identity is the dominant moderator of the reps-%1RM relation, which is precisely why a per-exercise, within-athlete series is the right unit (O-7, N-4).

Everything is fixable inside the existing architecture. §14 lists the modifications; none require a different design.

---

## 2. Severity-ranked findings

### High

| ID | Finding | Where |
| --- | --- | --- |
| **RH-1** | "Use" + a pending recommendation persists a `recommendationDecision`; **I-1** and **A-18** are false | §4.1 |
| **RH-2** | `T` ignores `decision.chosen.reps`; the suppression gate never fires on rep-range + rep-progression | §4.2 |
| **RH-3** | Direct tier is non-monotone in target reps and ignores target RIR — the only over-prescribing path | §4.3 |
| **RH-4** | F-1 understated: unflagged ramps break carry-forward prefill, `isCompleted`, and modal load today; the modal defence fails on top-set days | §4.4, §11 |

### Medium

| ID | Finding | Where |
| --- | --- | --- |
| **RM-1** | Evidence mischaracterisation: RIR ≥ 5 exclusion is presented as B8-backed; `evidence-to-design.md` row 5 lists it as *not justified*. RIR 3–4 degradation cites EVIDENCE-014 against EVIDENCE-030's explicit unsafe-inference clause | §12 |
| **RM-2** | `bestE1RM` ignores `asOf`; future-dated observations leak into an as-of result, and are counted as *stale* | §5, P4 |
| **RM-3** | The 90-day window and the 21/42-day age tiers are rolling **instant** windows, contradicting the repository's account-timezone calendar-date convention; a boundary session flips in/out with the hour of the fetch | §5, P5 |
| **RM-4** | `OBSERVATIONS_DISAGREE` is unreachable from the direct tier and never fires for ≥3 disagreeing observations; §8 emits no reason codes at all, so **A-5** is unsatisfiable as written | §5, P11 |
| **RM-5** | 8 of 35 declared reason codes are unreachable; `DELOAD_SESSION` is emitted but undeclared. This is the same defect (F-5) the evaluation criticises in the existing engine | §5, P16 |
| **RM-6** | Suggestion output is order-dependent when two observations share `performedAt`; `deriveEstimate` has a session-id tiebreak, `suggestStartingLoad` does not. **I-5**/**A-6** fail as stated | §5, P2 |
| **RM-7** | `carryForward.repBasis` does not exist and cannot be produced by the existing chain; the candidate set (8 sessions, no date bound) and the observation window (90 days) are different populations | §6 |
| **RM-8** | Today-bundle cost: the bundle is already N+1 with a 3 s `NetworkFirst` timeout; `strengthEstimate.best` needs an all-time scan per prescribed exercise, contradicting §10's "the server passes the window" | §8 |
| **RM-9** | **I-7**'s deload guard is unenforceable in the pure module — `TranslationInput` carries no flag for *today's* session. Same shape as the H-1 defect `recommendationForDeload` exists to remediate | §6 |
| **RM-10** | **I-8** is false: direct-tier loads are not floored to `loadStepKg` | §5, P8 |
| **RM-11** | Two competing numbers on one card, with no precedence rule; accept-then-Use makes the persisted `chosen.loadKg` diverge from the load actually lifted, and the *decision* heads the next prefill chain | §7 |
| **RM-12** | A mixed basis (some sessions with RIR, some without) uses band-max target RIR against a lower-bound e1RM — the double discount **O-6** exists to prevent | §5, P13 |
| **RM-13** | The RTF 11–15 extension is **non-conservative**: Epley's measured bias rises from +0.5 % (RTF ≤ 10) to +5.3 % (RTF 2–30) because it is linear against a curvilinear truth, and the "mildest high-rep growth" justification excludes exactly the flatter formulas the evidence favours. It also departs from OD-06's recorded reps ≤ 12 ceiling in the less-safe direction | §10.2 |

### Low

| ID | Finding |
| --- | --- |
| **RL-1** | §1.1 row 1 and §12.1 contradict each other on "under every formula"; verified — Lombardi and O'Conner reverse the result at RIR 0–3 (O'Conner by only 0.2 %) |
| **RL-2** | §12.4 states `139.33 / f(7) = 119.4`; the correct value is **112.97** (f(5) was used instead of f(7)). The printed result survives only because the cap binds |
| **RL-3** | §6.1's Wathan column: 4 of 8 values are wrong (r=8, 12, 20 materially; r=3 by rounding) |
| **RL-4** | §12 declares "RIR assumed uniform per session", then §12.5 silently uses §7.5's mixed-RIR sessions; the "other observation 135.67" belongs to a third variant |
| **RL-5** | §7.5 example E lists two set e1RMs where the stated rule produces four |
| **RL-6** | `DELOAD_SESSIONS_EXCLUDED` (§4.1, §11.2) vs `DELOAD_SESSION` (§7.3, A-7) — two names, one concept |
| **RL-7** | "Assisted Pull-Up … with sign-inverted load" is unsupported anywhere in `src/` or `docs/`, and impossible: `ck_set_logs_weight_kg_nonneg` forbids a negative load |
| **RL-8** | `prescription-model.md` §7 does not contain the plate-loaded/selectorized/sled/lever-tare wording §5.1 cites it for; §7's only relevant line is "No plate-math/equipment inventory modeling in MVP (`loadStepKg` is the entire concession)" (`:159`) |
| **RL-9** | Citation drift: `progression/service.ts:494-532` is `reevaluateForSourceSessionExercise`, not decision resolution (that is `:408-437` plus `workingTargets.ts`); the service worker is `src/app/sw.ts` (~`:248-290`), not `src/sw.ts` |
| **RL-10** | No ownership or archived-exercise posture is stated for `GET /api/exercises/[id]/strength`. Archived exercises are *not* filtered from the Today bundle or history today, so the endpoint needs an explicit rule |
| **RL-11** | Non-finite inputs return `status: "ok"` with a non-finite `loadKg`; there is no finite guard before the DTO |
| **RL-12** | `floorToStepKg`'s `1e-9` epsilon can increase a sub-cent raw value (`floor(42.499999999, 2.5) = 42.5`). Immaterial after `round2`, but "rounding never increases" is not literally true |
| **RL-13** | OD-06 records Epley on plain `reps`, "capped at reps ≤ 12 for display". **B-2** changes both the input (reps + RIR) and the ceiling (15). That is a re-opening of a recorded decision and deserves its own owner decision, not a clause inside O-9 |
| **RL-14** | A pre-upgrade active-session aggregate resumed after deploy will lack `startingSuggestion`; **A-19** covers the bundle case but not the aggregate case (the warm-up feature handles this at `activeSession.ts:333`) |
| **RL-15** | `bestSetE1rmKg` is retained as displayable provenance; for the 1100 kg typo fixture it is **1356.67 kg** and can surface next to a correct 135.67 best |

---

## 3. Verified repository integration map

Every claim below was checked in source. **Bold** marks a correction to the evaluation.

### 3.1 What the evaluation got right

| Claim | Status | Verified at |
| --- | --- | --- |
| Set entry passes only `weightKg`/`reps`/`rir`; no warm-up toggle, no AMRAP marker | VERIFIED | `src/ui/workout/ExerciseCard.tsx:111`, inputs `:188-229` |
| `set_logs` has `is_warmup boolean not null default false`; weight `numeric(6,2) >= 0`; reps 1–100; rir 0–10 | VERIFIED | `src/db/schema/setLogs.ts:35-50` |
| `SYNC_ENTITIES` is seven entities; `setLogUpsertPayloadSchema` bounds `0–9999.99 / 1–100 / 0–10 \| null` and carries `isWarmup` | VERIFIED | `src/domain/sync/schema.ts:25-33, 99-112` |
| Evaluation runs inside the completion transaction, only on a real `in_progress → completed` transition | VERIFIED | `src/server/sync/service.ts:507-521` |
| Engine work sets are `is_warmup = false` **in SQL**; history capped at 5, strictly earlier `startedAt`, same exercise, `completed` | VERIFIED | `src/server/progression/service.ts:125`, `:140-188`, `ENGINE_HISTORY_CAP = 5` at `:41` |
| `evaluateSession` returns `[]` for deloads before any draft; manual/skipped/no-prescription skipped | VERIFIED | `src/domain/progression/evaluateSession.ts:97-163` (deload return at `:100`) |
| `modalWorkingLoad` — most frequent load, ties → earliest index, `mixed = counts.size > 1` | VERIFIED | `src/domain/progression/loadHelpers.ts:27-42` |
| Supersede-then-insert; `uq_recs_one_pending` on `(exercise_id, coalesce(block_id, zero-uuid)) where decision_status='pending'` | VERIFIED | `progression/service.ts:355-375`; `src/db/schema/recommendations.ts:71-76` |
| Offline completion runs the identical `evaluateSession` over the cached bundle's history and enqueues recommendation ops **before** the completion op; server dedupes by `sourceSessionExerciseId` | VERIFIED | `src/sync/activeSession.ts:633-743`, `progression/service.ts:281-298` |
| Prefill chain: decision `chosen.loadKg` → last completed non-deload session's **first work-set load** → `baselineLoadKg` → null; a pending rec never enters the prefill | VERIFIED | `workingTargets.ts:33-45`, `carryForward.ts:20-33`, `today/service.ts:275-283` |
| `derivePrefill` prefers last logged set → pending/accepted rec target → modified chosen → snapshot prefill | VERIFIED | `ExerciseCard.tsx:47-71` |
| Decisions are write-once server-side; only `pending` is writable; replay is idempotent, anything else `decision_conflict` | VERIFIED | `src/server/sync/service.ts:1042-1085`; client statuses `accepted\|modified\|rejected` at `domain/sync/schema.ts:154` |
| Set edits re-evaluate **only while a pending rec is sourced from that session exercise** | VERIFIED | `progression/service.ts:499-509`, gate at `sync/service.ts:882` |
| Renumbering after a delete rewrites siblings' `updated_at` (and re-triggers re-evaluation) | VERIFIED | `domain/sync/setDeletionOps.ts:50-92` → `sync/service.ts:873-884` |
| `EQUIPMENT_TYPES`, `DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT` (barbell 2.5 / dumbbell 2.0 / machine 5.0 / cable 2.5), `loadStepKg numeric(4,2) > 0`, mutable, not snapshotted | VERIFIED | `domain/exercises/schema.ts:11-49, 155-173`; `db/schema/exercises.ts:40, 59` |
| `SCHEME_TYPES = ["fixed","repRange"]`; `perSet` / `fixedPlusAmrap` reserved only | VERIFIED | `domain/schemes/setScheme.ts:3-7`; `prescription-model.md:47-65` |
| `RirBand` is `{min,max}` ints 0–10 with `min <= max` | VERIFIED | `domain/schemes/rirBand.ts:3-11` |
| Catalog has **93** entries; Assisted Pull-Up is `equipment: "machine"`; Farmer's Carry is `equipment: "dumbbell"`; seed is skip-by-slug via `exercise_catalog_seed_log` | VERIFIED (F-3 confirmed) | `db/seed/exerciseCatalog.ts:626, 866`; `db/seed/exercises.ts:45-56` |
| `DELOAD_SESSION_NOT_EVALUATED` is declared and phrased but never emitted | VERIFIED (F-5 confirmed) | `progression/reasonCodes.ts:25`, `ui/recommendations/copy.ts:27`, `evaluateSession.ts:100` |
| `previousPerformance` is served but unread by any UI component | VERIFIED (F-4 confirmed) | `sync/types.ts:100` |
| `progression-engine.md` §4's "zero engine/schema changes" for a future `percent-1rm` strategy is aspirational | VERIFIED (F-6 confirmed) | dispatch is a two-member branch |
| The evaluation's three "which sets qualify" postures (history / volume / engine / carry-forward) | VERIFIED | `history/service.ts:78,146`; `volume/service.ts:203-207` + `volume/aggregate.ts:157,170-174`; `progression/service.ts:125`; `carryForward.ts:24-32` |
| eslint boundary `{from:"domain", allow:["domain"]}`; `progressionBoundary.test.ts` is a real transitive import-graph walk with anti-vacuity assertions | VERIFIED | `eslint.config.mjs:44`; `tests/unit/progressionBoundary.test.ts:105-149` |
| `bundleCache` has **no** TTL; the SW caches `/api/today-bundle` `NetworkFirst` with `maxAgeSeconds: 24*60*60`; every other `/api/` GET is `NetworkOnly` | VERIFIED (path corrected) | `src/sync/bundleCache.ts`; `src/app/sw.ts:253-269, 278-286` |
| `sync/types.ts` optional-field tolerance rule (L-4) | VERIFIED | `src/sync/types.ts:216-227` |
| Device-local freeze at `startSession` is an existing precedent | VERIFIED | `activeSession.ts:296` `freezeWarmupState`; warm-up evaluation B-5 / O-3 |
| OD-06, `evidence-to-design.md` row 18, `mvp-scope.md` §2 item 1, `implementation-plan.md:223` (Phase 9, Epley, reps ≤ 12), `architecture-plan.md:118`, `data-model.md:388`, `data-model.md:230` | VERIFIED | as cited |
| PI-001 (`8 kg × 90`), PI-002 (`started_at` doubles as training date) | VERIFIED | `docs/input/product-ideas.md:6-38, 40-70` |

### 3.2 Corrections to the evaluation's map

| Evaluation claim | Reality |
| --- | --- |
| "`progression/service.ts:494-532`" for decision → carry-forward | That range is **`reevaluateForSourceSessionExercise`**. `getLatestDecisionChosenByExercise` is at **`:408-437`** and filters `inArray(decisionStatus, ["accepted","modified"])`; the chain head itself is `workingTargets.ts:39-45` |
| "`sw.ts:278-286`" | The worker is **`src/app/sw.ts`** (`public/sw.js` is build output); the ranges are `:253-269` (today bundle) and `:278-286` (other API GETs) |
| "Plate-loaded vs. selectorized and sled/lever tare are unmodeled (`prescription-model.md` §7)" | **§7 says none of this.** Its only relevant sentence is `:159` — "No plate-math/equipment inventory modeling in MVP (`loadStepKg` is the entire concession)." The rest is the evaluator's inference presented as a citation |
| "Assisted Pull-Up is `equipment: "machine"` with **sign-inverted load** (`exerciseCatalog.ts:865-875`)" | The cited lines contain no such convention, nothing in `src/` or `docs/` states it, and `ck_set_logs_weight_kg_nonneg` makes a negative load **impossible**. The real problem is an *unmodeled* semantic (a bigger number means a weaker effort), which is a stronger argument for O-2, not a weaker one — but the stated fact is wrong |
| "ADR-007 mechanism 3 (current-convention derivation)" as the precedent for reinterpreting `equipment`/`loadStepKg` | Mechanism 3 is specifically about **muscle-contribution weights**, justified by "uniform convention keeps week-to-week trends comparable". The analogy is defensible for `loadStepKg` (rounding only) but weak for `equipment`, which is an **on/off gate** on a whole history series, and does not cover R-7's real case (a dumbbell per-hand→total switch), where the *stored numbers change meaning*. No ADR-007 mechanism addresses that |
| "the bundle already runs one history query per prescribed exercise (`today/service.ts:515`)" | It runs **two** (sessions, then set rows), **inside a sequential `for` loop** (`:512-552`). See RM-8 |
| §2.3 "New `src/server/strength/service.ts` + `GET /api/exercises/[id]/strength`" | No ownership rule, no `archivedAt` posture, and no `asOf` validation is specified. Archived exercises are **not** excluded from the Today bundle or history today (`today/service.ts:316-324`, `history/service.ts:8-12`); only the ad-hoc picker filters them client-side. The new endpoint must state its own rule |

### 3.3 F-1 — verified, and larger than stated

`is_warmup` **is** in the schema, **is** in the sync contract, **is** writable by the server, **is** accepted by the client store, and **is** rendered — but no UI control ever sets it.

| Layer | Supports `isWarmup`? | Evidence |
| --- | --- | --- |
| Column | yes | `db/schema/setLogs.ts:35` |
| Wire payload | yes | `domain/sync/schema.ts:104` |
| Server write | yes | `sync/service.ts:171` (writable), `:803`, `:858` |
| Client store — log | yes (`isWarmup?: boolean`) | `activeSession.ts:436, 449` |
| Client store — edit | yes (`EditSetPatch` includes `isWarmup`) | `activeSession.ts:551-553` |
| Read/display | yes (`W ·` prefix) | `ExerciseCard.tsx:344`, `HistoryDetail.tsx:238` |
| **Set-entry UI** | **no** | `ExerciseCard.tsx:111` passes exactly four fields |
| **History-edit UI** | **no** | `HistoryDetail.tsx:162, 202-211` — `{weightKg, reps, rir}` only |

So the gap is **UI-only**: one checkbox in each of two components, plus a `isWarmup` pass-through. Everything below is already built and tested. That materially changes the O-5 calculus (§13).

---

## 4. Algorithm defects

The proposed algorithm was reimplemented from the document's §3/§4/§7/§8/§10 text alone, in JavaScript, outside the repository. No repository code was imported except a faithful transcription of `modalWorkingLoad` (so the tie rule matches). Every number below is machine-produced.

### 4.1 RH-1 — the suggestion can author a Decision

§14.1 row 2 is explicit:

> Pending rec whose rep basis is ≥ 2 from T … **Recommendation card:** shown, with an added line "for N-rep sets" … **Starting-suggestion card:** shown when the carry-forward source is rep-incompatible.

Both cards visible. The athlete taps **Use** (fills the weight input) and logs the set. `logSet` then runs (`src/sync/activeSession.ts:468-493`):

```ts
const rec = recommendationForDeload(session.isDeload, exercise.recommendation);
if (!set.isWarmup && rec && rec.decision.status === "pending") {
  const isFirstWorkSet = exercise.sets.filter((s) => !s.isWarmup).length === 1;
  if (isFirstWorkSet) {
    const implicit = resolveImplicitDecision(/* … */, { weightKg: set.weightKg }, loadStepKg);
    if (implicit) { /* … */ ops.push(recommendationDecisionOp(rec.id, decision)); }
  }
}
```

`resolveImplicitDecision` (`domain/progression/implicitDecision.ts:35-46`) returns `status: "modified"`, `chosen: { loadKg: <the suggested load> }` whenever the logged load ≠ `roundToStepKg(target.loadKg, loadStepKg)` — which is the normal case, since the whole point is that the recommendation is rep-incompatible.

Consequences:

- **I-1** — "Nothing produced by this feature is persisted server-side or enters the outbox" — **false**.
- **A-18** — "logging that set produces an ordinary `setLog` op; no other op is enqueued" — **false**; two ops are enqueued in one IndexedDB transaction.
- The advisory number becomes `recommendations.decision_chosen.loadKg`, a **write-once, user-owned fact** (`sync/service.ts:1061-1073`) that then **heads the prefill chain** for the next session (`workingTargets.ts:41`). The feature's central claim — "it never writes anything, and it is self-limiting" (§1 item 1) — does not hold.

The evaluation describes this mechanism accurately in its own §2.1 ("first non-warm-up set resolves a pending recommendation implicitly") and then never connects it to **Use**. This is the single most important defect in the document.

### 4.2 RH-2 — `T` is not the prefill's rule; the gate never fires on rep ranges

§3 defines:

> **Target reps (T)** — `schemeDefaultReps(scheme)`: `reps` for `fixed`, `minReps` for `repRange` (`workingTargets.ts:29-31`) — **the same rule the prefill uses**.

The prefill's actual rule is `workingTargets.ts:43`:

```ts
reps: args.decisionChosen?.reps ?? schemeDefaultReps(args.scheme),
```

`decisionChosen.reps` is exactly what `rep-progression` produces (`REP_TARGET_INCREASED`), and `evaluationTarget.ts:22-32` exists precisely because "accepting an `increase_reps` rec to 11 means the session was performed at target 11 even though the snapshot froze the pre-decision prefill of 10."

Reproduced on a `repRange {min: 8, max: 12}` prescription where the athlete has advanced to 11 reps at 60 kg over three sessions:

```
doc's T (schemeDefaultReps) = 8 :  {"status":"ok","tier":"nearby","loadKg":62.5,
                                    "rawLoadKg":64.5,"reasonCodes":[
                                      "SOURCE_NEARBY_REPS_TRANSLATED",
                                      "TARGET_RIR_FROM_BAND_MAX",
                                      "ROUNDED_DOWN_TO_LOAD_STEP"]}
athlete's real target  = 11  :  {"status":"none","reasonCodes":["CARRY_FORWARD_REP_COMPATIBLE"]}
```

With the document's `T`, `|11 − 8| = 3` so neither suppression gate fires, and the card is shown **every session of the block** — translating a 62.5 kg suggestion away from the 60 kg the athlete lifted yesterday for exactly the prescribed reps. §14.2's "after the first session at the new scheme the carry-forward source is rep-compatible and the suggestion falls silent" is false for the entire `repRange` family, which is one of only two scheme types the app supports.

This also silently disagrees with §3's own **Rep basis** definition, which *does* say `chosen.reps ?? schemeDefaultReps(...)` for a recommendation/decision — the asymmetry between "rep basis of a source" and "target reps" is unexplained and is the bug.

### 4.3 RH-3 — the direct tier is non-monotone and effort-blind

**Non-monotone.** Two real sessions — `heavy` = 3×4 @ 120 kg (day 290), `light` = 3×2 @ 60 kg (day 295, more recent):

```
T=1: 60 kg  (direct, basis light)
T=2: 60 kg  (direct, basis light)
T=3: 60 kg  (direct, basis heavy+light -> most recent = light)
T=4: 120 kg (direct, basis heavy)
T=5: 120 kg (direct, basis heavy)
T=6: 52.5 kg (nearby, basis heavy)
```

Asking for **more** reps doubles the suggested load (T=3 → 60, T=4 → 120), then a further rep collapses it to 52.5. The cause is structural: tier 1 returns *"the most recent observation whose modal reps are within ±1"* with no formula, so a one-rep change in `T` can swap the source session entirely. A ±1 window plus "most recent wins" is not a defensible selection rule when two rep schemes coexist.

**Effort-blind.** §9 tier 1: "Suggested load = the most recent one's `modalLoadKg`, no formula, no RIR adjustment (the engine takes it from there)." Reproduced — athlete did 3×12 @ 95 kg to failure (RIR 0); the new block prescribes 12 reps at RIR 2–3:

```
direct suggestion:            95 kg   (SOURCE_DIRECT_SAME_REPS)
effort-consistent translation: 133 / f(15) = 88.67 kg
-> over-prescribes by 7.14 %, uncapped, unfloored, unflagged, "medium" confidence
```

Every other conservatism mechanism in the design (downward rounding, the 110 % cap, tier degradation, confidence caps) is bypassed on the one path that runs most often. The symmetric case — an RIR-3 source translated to an RIR-0 target — under-prescribes by the same margin, which is harmless; the over-prescribing direction is not. "Conservatism is delivered structurally instead" (§1 item 2) is the document's core safety argument and the direct tier is a hole in it.

**Unfloored.** The direct branch calls `finish({ loadKg: src.modalLoadKg, … })` with no `floorToStepKg`. Reproduced: a 107.5 kg direct source with `loadStepKg = 5` yields **107.5 kg**, off-grid, and `ROUNDED_DOWN_TO_LOAD_STEP` is not emitted. **I-8** ("Suggested loads are floored to `loadStepKg`") is false. (Arguably correct behaviour — the athlete really lifted 107.5 — but then I-8 must be reworded, and the interaction with `roundToStepKg` in the implicit decision must be stated.)

### 4.4 RH-4 — F-1's real blast radius, and the modal defence's failure mode

Reproduced against the real helpers, for a session logged exactly as typed — `60×5, 80×5, 100×3, 110×5, 110×5, 110×5` (a 3×5 prescription with a three-set ramp, no `isWarmup` anywhere, which is the only thing the UI can produce):

| Consumer | Result | Should be |
| --- | --- | --- |
| **Carry-forward prefill** (`toCarryForwardCandidate` takes the *first* non-warm-up set) | **60 kg** | 110 kg |
| Engine modal load | 110 kg (counts `60:1, 80:1, 100:1, 110:3`) | 110 kg ✓ |
| **`isCompleted` / `repShortfall`** — sums over the **first `scheme.sets` sets**, i.e. the ramp (`loadProgression.ts:28-41`) | shortfall **2** → `PRESCRIBED_REPS_NOT_COMPLETED` → **hold** | increase (all three work sets hit 5 reps) |
| Weekly volume | 6 work sets | 3 |
| Single-top-set day `60/80/100/140` | modal load **60 kg** (all counts 1 → earliest wins) | 140 kg |

The evaluation says F-1 affects "the progression engine and volume". It in fact **silently reverses progression decisions** and **prefills the athlete's warm-up weight as their working load**, today, on `main`. That is a live correctness bug, not a prerequisite for a future feature.

And the estimator's own defence is weaker than claimed. §7.5 example F is the *favourable* case (5 work sets outvote a 3-set ramp). Probed across realistic ramp shapes:

```
5 work sets after a 3-set ramp : modal=110  e1rm=135.67  truth=135.67  SUB_MODAL_SETS_EXCLUDED
3 work sets after a 3-set ramp : modal=110  e1rm=135.67  truth=135.67  SUB_MODAL_SETS_EXCLUDED
2 work sets after a 3-set ramp : modal=110  e1rm=135.67  truth=135.67  SUB_MODAL_SETS_EXCLUDED
1 top set after a 4-set ramp   : modal= 60  e1rm=123.33  truth=158.67  MIXED_LOADS_IN_SESSION,
                                                                       SESSION_SETS_INCONSISTENT
ramp with a repeated weight    : modal= 60  e1rm=101.33  truth=135.67  (same flags)
straight sets, no ramp         : modal=110  e1rm=135.67  truth=135.67  (none)
```

On a top-set day the estimate is understated by **22 %**; with a repeated warm-up weight (`60×8, 60×5, 80, 100, 110, 110` — an entirely ordinary ramp) by **25 %**. The flags raised (`MIXED_LOADS_IN_SESSION`, `SESSION_SETS_INCONSISTENT`) are the *same* flags a legitimate top-set-plus-back-off session raises, so they cannot distinguish the failure. §1 item 4's "the estimator defends itself structurally (modal-load working-set rule)" is true only when work sets are the plurality — which is exactly the condition F-1 removes control over.

---

## 5. Independently reproduced calculations and property results

Scratch reimplementation and probes were run outside the repository and deleted afterwards (§16).

### 5.1 Formula table (§6.1) — Wathan is wrong

| r | Epley | Brzycki | Lombardi | O'Conner | Wathan (computed) | Wathan (document) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.033 | 1.000 | 1.000 | 1.025 | 1.013 | 1.013 ✓ |
| 3 | 1.100 | 1.059 | 1.116 | 1.075 | **1.090** | 1.091 |
| 5 | 1.167 | 1.125 | 1.175 | 1.125 | 1.166 | 1.166 ✓ |
| 8 | 1.267 | 1.241 | 1.231 | 1.200 | **1.277** | 1.281 |
| 10 | 1.333 | 1.333 | 1.259 | 1.250 | 1.347 | 1.347 ✓ |
| 12 | 1.400 | 1.440 | 1.282 | 1.300 | **1.415** | 1.412 |
| 15 | 1.500 | 1.636 | 1.311 | 1.375 | 1.508/1.509 | 1.508 ✓ |
| 20 | 1.667 | 2.118 | 1.349 | 1.500 | **1.645** | 1.639 |

Epley, Brzycki, Lombardi, O'Conner columns are **all correct**. The translation claims are correct: 110×5 → 12 reps gives Epley 91.7 / Brzycki 85.9 / Lombardi 100.8 / O'Conner 95.2; 95×12 → 5 reps gives 114.0 / 121.6 / 103.7 / 109.8. The athlete's own ratio 95/110 = 0.8636 does sit between O'Conner (0.8654) and Epley (0.8333). **The "no formula is uniformly conservative" conclusion is arithmetically sound and is the strongest argument in the document.**

RIR error propagation (§6.2) reproduces exactly: +3.03 % at RTF 3, +2.86 % at 5, +2.70 % at 7, +2.50 % at 10, +2.27 % at 14. `f(1) = 1.0333` raw, a 3.3 % inflation ✓.

### 5.2 The §12 contradiction — resolved

§1.1 row 1 states, without qualification: *"In the worked case the 12-rep session implies the **higher** e1RM under every formula (§12)."*
§12.1 states: *"Under every formula in §6.1 the 12-rep session implies the higher e1RM (Epley +3.7 kg at equal RIR; Brzycki +13 to +19 kg; **only the flat Lombardi/O'Conner reverse it**)."*

That sentence contradicts itself in its own parenthesis. Computed, for 110 kg × 5 vs 95 kg × 12 at equal RIR:

| Formula | RIR 0 | RIR 1 | RIR 2 | RIR 3 | 12-rep higher? |
| --- | --- | --- | --- | --- | --- |
| Epley | 128.33 / 133.00 | 132.00 / 136.17 | 135.67 / 139.33 | 139.33 / 142.50 | **yes** (+4.67 … +3.17) |
| Brzycki | 123.75 / 136.80 | 127.74 / 142.50 | 132.00 / 148.70 | 136.55 / 155.45 | **yes** (+13.05 … +18.90) |
| Wathan | 128.24 / 134.42 | 132.36 / 137.50 | 136.43 / 140.48 | 140.44 / 143.36 | **yes** |
| Lombardi | 129.21 / 121.80 | 131.59 / 122.78 | 133.63 / 123.69 | 135.43 / 124.55 | **no** (−7.4 … −10.9) |
| O'Conner | 123.75 / 123.50 | 126.50 / 125.88 | 129.25 / 128.25 | 132.00 / 130.63 | **no** (−0.25 … −1.37) |

**Resolution: the §12.1 parenthesis is right and the headline is wrong.** The 12-rep session is higher under 3 of 5 formulas (Epley, Brzycki, Wathan) and lower under 2 (Lombardi, O'Conner). The correct statement is *"under the chosen formula and the two closest to it"*. Note also that "+3.7 kg at equal RIR" holds only at RIR 2; the Epley gap ranges 3.17–4.67 kg.

**This does not damage the design conclusion.** The intended point — "lower reps plus heavier weight must not automatically win" — is *strengthened* by the correction: O'Conner puts the two sessions within 0.2–1.1 %, i.e. genuinely indistinguishable, which is a better argument for "neither wins, the target's rep distance selects the tier" than a false universal claim. Fix the sentence, keep the principle.

### 5.3 Session fixtures §7.5 — reproduced

| Case | Set e1RMs (computed) | Lower median | Max | Spread | Flags | vs. document |
| --- | --- | --- | --- | --- | --- | --- |
| A | 139.33, 139.33, 135.67, 135.67, 132.00 | **135.67** | 139.33 | 5.4 % | `RIR_MODERATE_RANGE` | ✓ |
| B | 139.33, 136.17, 133.00 | **136.17** | 139.33 | **4.65 %** | `EXTENDED_REP_RANGE` | doc says 4.7 % |
| C | 128.33 ×3, 124.67 ×2 | **128.33** | 128.33 | 2.85 % | `RIR_MISSING_LOWER_BOUND` | doc says 2.9 % |
| D | 158.67, 143.00, 143.00, 139.33 | **143.00** | 158.67 | 13.52 % | `MIXED_LOADS_IN_SESSION` | ✓ |
| E | 135.67 **×4** | **135.67** | 135.67 | 0 % | `SUB_MODAL_SETS_EXCLUDED` | doc lists only **two** values (RL-5) |
| F | 135.67 ×5 | **135.67** | 135.67 | 0 % | `SUB_MODAL_SETS_EXCLUDED` | ✓ |

`modalReps`, `medianRir`, and `bestSetE1rmKg` all reproduce. §12.1's set-level table reproduces exactly (110×5 → 128.33 / 132.00 / 135.67 / 139.33; 95×12 → 133.00 / 136.17 / 139.33 / 142.50).

### 5.4 Target selection §12.2/§12.4 — one arithmetic error

§12.2 reproduces exactly: 5×5 → **110** (direct), 3×12 → **95** (direct), 3×8 → raw 101.75 → **100** (nearby), pooled agrees at 135.67 so `NEARBY_POOLED_DISAGREE` does not fire, cap 121 not binding. The full RIR grid reproduces cell for cell (100/97.5/95 · 102.5/100/97.5 · 105/102.5/100 · 110/105/102.5), and the missing-RIR variant gives 101.31 → **100** with `TARGET_RIR_EFFORT_MATCHED`.

§12.4 row 1 states **`e1RM 139.33 / f(7) = 119.4`**. The correct value is **112.97**; 119.4 is `139.33 / f(5)`, i.e. the target RIR of 2 was dropped from the divisor. The final answer (102.5) is unaffected because the 104.5 cap binds either way — but the stated intermediate is wrong, and it is wrong in the *non-conservative* direction, which matters because this row is the evidence offered for O-3.

§12.4 row 2 (135.67 / f(14) = **92.5**, cap 121 not binding) reproduces exactly.

### 5.5 Estimate fixtures §12.5

`[136,133,139,128]` → **133** ✓ · `[136,180]` → **136**, spread 32.35 % ✓ · `[136,133,180]` → **136**, best 180 unconfirmed ✓ · `[136,133,12.8]` → **133** ✓.

The best/unconfirmed bullet does not reproduce under §12's own stated premise. §12 says "RIR assumed uniform per session for the tables"; under uniform RIR 2 the sessions are A = 135.67 and B = **139.33**, so `best = 139.33`, not 136.17. The document's 136.17 is §7.5's *mixed-RIR* session B. The "with RIR 3 on A, best = 139.33 (A)" clause then mixes a uniform-RIR-3 A with a mixed-RIR B, and the "other observation 135.67" is a third variant again. The conclusion ("confirmed") survives, the arithmetic provenance does not (RL-4).

### 5.6 PI-001 fixtures §11.3 — reproduce, with one omission

| Case | Result |
| --- | --- |
| `8 kg × 90 reps` as the only set | **no observation** (RTF 90 > 15) ✓ exactly as claimed |
| `1100 × 5` among four `110 × 5` sets | modal 110, values `[135.67 ×4, 1356.67]`, lower median **135.67** ✓ |
| `1100 × 5` as the only set | observation **1356.67** ✓ |
| `11 × 5` among `110 × 5` sets | sub-modal, excluded ✓ (§7.5 E) |

Omitted from §11.3: the 1100 kg session also raises **`SESSION_SETS_INCONSISTENT`** (spread 900 %) and retains **`bestSetE1rmKg = 1356.67`** — which §3 says is displayed "as provenance of the best". A 1356.67 kg provenance line beside a correct 135.67 kg best is a visible absurdity the design should suppress explicitly (RL-15).

### 5.7 Property and invariant results

16 probe families, 13 failures. `PASS`/`FAIL` are against the invariant **as the evaluation states it**.

| # | Property | Result |
| --- | --- | --- |
| P1 | Identical inputs + `asOf` → identical output | **PASS** (300 random cases) |
| P2a | Random permutation invariance | **FAIL** — root cause is P2b |
| P2b | Permutation invariance with **equal** `performedAt` — suggestion | **FAIL** — 80 kg vs 100 kg. `suggestStartingLoad` sorts `recent` by `performedAt` only; `deriveEstimate` (§8) sorts by `(performedAt, sessionId)`. `direct[direct.length-1]` then depends on array order. **I-5 / A-6 fail as stated** (RM-6) |
| P2c | Permutation invariance with equal `performedAt` — estimate | **PASS** (the session-id tiebreak saves it) |
| P3 | `currentE1RM ≤ bestE1RM` (I-6) | **PASS** (500 random cases; holds by construction — the basis is a subset of the non-deload population) |
| P4a | Future observations excluded from `current` | **PASS** |
| P4b | Future observations excluded from `best` | **FAIL** — `best = 200` leaked from a session dated 20 days after `asOf`. §8 filters `recent` by `<= asOf` but the `best` loop runs over the whole `nonDeload` array (RM-2) |
| P4c | `staleObservationCount` semantics | **FAIL** — future observations are counted as *stale* (`nonDeload.length − recent.length`) |
| P4d | Future observations excluded from the suggestion | **PASS** |
| P5a | Exactly `asOf − 90d` is included | **PASS** (`>=`, unambiguous) |
| P5b | Same calendar day, 3 h earlier, excluded | **PASS** — but this **is** the defect |
| P5c | Boundary stability across the day | **FAIL** — the same session is *in* at 08:00 and *out* at 12:00 on the same date (RM-3) |
| P6 | Suggested load non-increasing in target reps | **FAIL** — e.g. `T=3 → 60 kg`, `T=4 → 120 kg` (both direct); `T=6 → 25`, `T=7 → 27.5` (remote → nearby). See RH-3 |
| P7a | `floorToStepKg(raw) ≤ raw` for `round2` inputs | **PASS** (3000 cases) |
| P7b | …for sub-cent inputs | **FAIL** (immaterial) — `floor(42.499999999, 2.5) = 42.5` via the `1e-9` epsilon (RL-12) |
| P8a | Load ≤ 110 % of the heaviest recent modal load (I-8) | **PASS** (600 cases; the direct tier can only return a load already in the window) |
| P8b | Every suggested load is on the `loadStepKg` grid (I-8) | **FAIL** — direct tier returns 107.5 with `step = 5` (RM-10) |
| P9 | Direct evidence cannot be displaced by a remote estimate | **PASS** — a newer, 66 %-higher remote observation does not displace tier 1 |
| P10a | One 10× outlier cannot dominate a 3-session current estimate | **PASS** (132 kept) |
| P10b | Two sessions, one outlier → the lower is taken | **PASS** |
| P10c | A **low** outlier **does** move a 3-session estimate | **PASS (by design, worth stating)** — `[130, 132, 13]` → current 130, not 132. The lower median is robust upward, not downward. A mistyped-low set drags the estimate; a mistyped-high one does not. The document only ever claims protection against the high direction |
| P11a | Two **remote** observations > 20 % apart → `OBSERVATIONS_DISAGREE` | **PASS** |
| P11b | Two **direct** observations > 20 % apart → suppressed | **FAIL** — returns 150 kg. The pair check sits *after* the direct-tier early return (RM-4) |
| P11c | Three observations 160 % apart → suppressed | **FAIL** — returns 145 kg at low confidence. `basis.length === 2` is the only gate |
| P12a–d | Deloads affect neither `current`, `best`, nor the suggestion; a 9999 kg deload cannot become `best` | **PASS** (all four) |
| P12e | I-7's "never on a deload session" is enforceable | **FAIL (structural)** — `TranslationInput` has no field for *today's* `isDeload`; the guard lives entirely in callers, which is the shape of the H-1 defect `recommendationForDeload` was created to remediate (RM-9) |
| P13a | `medianRir` is null when no RIR was reported | **PASS** |
| P13b | Missing-RIR basis uses effort-matched RIR 0, not the band | **PASS** |
| P13c | **Mixed** RIR / no-RIR basis does not double-discount | **FAIL** — `basisHasRir = basis.some(…)`, so one RIR-bearing session in three flips the whole basis to band-max (`targetRir = 4`) while the pooled e1RM is still a lower bound (RM-12) |
| P14 | Invalid/boundary inputs terminate safely | **7 of 8 PASS.** `loadStepKg` of 0 and −2.5 degrade gracefully; `99.99` step against a 20 kg estimate correctly returns `BELOW_MINIMUM_LOAD`; empty observations, reps 0, and band max 10 are all handled. **FAIL:** a non-finite `e1rmKg` yields `status: "ok"` with a non-finite `loadKg` (RL-11) |
| P15 | Modal filtering substitutes for warm-up marking | **FAIL** — see RH-4 |
| P16 | Every declared reason code is reachable | **FAIL** — 8 unreachable: `SINGLE_SESSION_EVIDENCE`, `TWO_SESSION_EVIDENCE`, `EVIDENCE_AGING`, `EVIDENCE_OLD`, `HIGH_RIR_SETS_EXCLUDED`, `HIGH_REP_SETS_EXCLUDED`, `ZERO_LOAD_SETS_EXCLUDED`, `DELOAD_SESSIONS_EXCLUDED`. Plus `DELOAD_SESSION` is emitted but **not declared** in §11.2 (RM-5) |

On RM-5: `classifySet` computes exclusion reasons and `buildObservation` discards them (it keeps only `x.c.flags` of *eligible working* sets). The three `*_SETS_EXCLUDED` codes therefore cannot reach a DTO, and `§8 deriveEstimate` returns no `reasonCodes` field at all — so `SINGLE_SESSION_EVIDENCE` / `EVIDENCE_AGING` have no carrier and **A-5**'s "`[136,180]` → 136 with `OBSERVATIONS_DISAGREE`" is unsatisfiable. This is precisely the F-5 defect (`DELOAD_SESSION_NOT_EVALUATED` declared, phrased, never emitted) that the evaluation records as a finding against the existing engine.

---

## 6. Architectural risks

### RM-7 — the firing condition rests on an input that does not exist

`suggestStartingLoad` takes `carryForward: { loadKg, repBasis, origin }`. The repository's carry-forward returns **a load and nothing else**:

- `resolveCarryForwardLoadKg(candidates, baselineLoadKg): number | null` (`carryForward.ts:20-33`).
- `toCarryForwardCandidate` supplies `firstWorkSetLoadKg` = the **first non-warm-up set's** weight (`today/service.ts:275-283`) — not a modal load, and with no reps attached.
- Candidates come from `getExerciseHistory` — the **last 8 completed sessions, with no date bound** (`today/service.ts:47, 237`). Observations come from a **90-day window**. The two populations are different: a source that governs the prefill can be 6 months old and therefore have **no observation**, so `repBasis` is `null`, no suppression fires, and a suggestion is shown against a prefill it cannot see.
- With F-1 unfixed, `firstWorkSetLoadKg` is the *ramp's* first set (RH-4), so the "rep basis" of the carry-forward source would be the ramp's reps.

The design must specify how `repBasis` is produced, from which population, and what happens when it is unavailable. Today it is an undefined input on the feature's only firing condition.

### RM-9 — I-7's deload guard has no home

**I-7** says a suggestion "is never emitted … on a deload session", and §14.3 nominates `recommendationForDeload` as the template. But the pure function has no deload input; the guard would live in `buildTodayBundle`, `startSession`, and the card — three places, exactly the fan-out that produced the H-1 regression (`deloadGuard.ts:1-13` names five call sites and calls itself "defensive against a stale pre-fix shape"). Add `todayIsDeload: boolean` to `TranslationInput` and return `none(["DELOAD_SESSION_NO_SUGGESTION"])`, so the invariant is provable in one unit test rather than asserted across three integration paths.

### RM-8 — Today-bundle cost is understated

`buildTodayBundle` already runs `await getExerciseHistory(...)` **inside a sequential `for` loop over prescriptions** (`today/service.ts:512-515`), and each call is two queries. Today is the hottest path in the app (fetched on every launch) and its SW strategy is `NetworkFirst` with `networkTimeoutSeconds: 3` on an Azure B1 / B1ms pair.

The evaluation says (§10) "the server passes the window; extra rows are harmless", but §15 also puts `strengthEstimate` (current **and best**) in the bundle, and `bestE1RM` is **all-time**. So the bundle needs an unbounded per-exercise scan, doubling an already N+1 shape to 2N+1 sequential round trips. §13's "no measured read-performance need" is asserted, not measured, and the *existing* latency is never stated.

This is cheap to fix and should be a binding constraint, not a footnote: fetch observations for **all** prescribed exercise ids in **one** `inArray` query (the pattern `getWorkSetsByExercise` already uses at `progression/service.ts:122-126`), and bound the all-time `best` scan with an index-friendly predicate or accept a windowed best in the bundle with the all-time best only on the detail endpoint.

### RM-3 — time semantics deviate from an established, hard-won convention

`addDays(asOf, -90)` with a string `>=` comparison is **instant** arithmetic. The repository's convention for every other window is the **account's timezone and calendar dates**: `userLocalDateString` / `localDateToUtcInstant` (`volume/service.ts:230-243`), and `phase-8-review.md` B-3 exists because a device-timezone assumption silently attributed logs to the wrong calendar day *while online*. The bundle already carries `timezone` (`today/service.ts:592`).

Consequences as reproduced: a session on the boundary date is included at 08:00 and excluded at 12:00 on the same day; the 21/42-day confidence tiers flip mid-day the same way. Nothing is non-deterministic given `asOf`, but the number visibly changes between two refreshes on the same date, which is worse than a wrong number for a "conservative, transparent, deterministic" feature.

Two further consequences the document does not draw:

- **String comparison correctness.** `o.performedAt >= windowStart` and `localeCompare` are only valid because every producer happens to emit UTC `Z` (`.toISOString()`). That precondition is never stated and is one non-UTC offset away from silent misordering.
- **PI-002.** When the editable training date lands, the window, the trend x-axis, and `mostRecentAgeDays` must all move from `started_at` to the training date, changing every displayed number at once. §4.3 notes "the trend inherits this" but the design records no forward-compatibility posture. Since PI-002 explicitly says "once assigned, it remains a user-owned fact", the strength feature would then have to read a fact rather than derive from `started_at` — which is a real change to §13's "computed on read from `set_logs` alone".

### Other architectural notes

- **`historyDepthUsed` neutrality (§2.3) is correct** — the new feature runs its own query and does not widen `HISTORY_DISPLAY_LIMIT`, so the offline client's 5-session slice stays byte-identical and W-1 is not re-opened. Verified.
- **The boundary tests (A-15) are the right instrument** and `tests/unit/progressionBoundary.test.ts` is a real transitive import-graph walk with anti-vacuity assertions, so the pattern is proven. Note that eslint alone will **not** enforce I-2: `{ from: "server", allow: ["domain","db","server"] }` permits `src/server/strength/**` to import the `recommendations` schema freely. The custom test is load-bearing, not belt-and-braces.
- **ADR-007 mechanism 3 is the wrong precedent for R-7.** It covers re-deriving volume under current *contribution weights* — a dimensionless multiplier. It does not cover the case where the *logged number changes meaning* (dumbbell per-hand → total). For that, the honest answer is D-3 (`load_semantics`) or the `strength_estimate = 'off'` kill switch; the ADR does not license it.

---

## 7. Product and wiring review

### 7.1 The v1 boundary is correct

Tracker + advisory suggestion, no automatic prefill, no `recommendations` row, no engine change, no persisted estimate, no sync entity, optional bundle fields, device-local frozen suggestion, an explicit **Use** action, one page per exercise — **this is the right boundary and should be kept.** It is consistent with `architecture-plan.md` §7 ("anything recomputable from facts is recomputed"), `data-model.md` §5 (which already names e1RM as explicitly not persisted), and the warm-up feature's B-5/O-3 precedent for device-local frozen state. X-1, X-2, X-5, X-9, X-11 are all correctly rejected with sound reasons.

The one boundary claim that is **false as implemented** is "no recommendation row / never a fact" — see RH-1. The boundary is right; the wiring that would deliver it is not.

### 7.2 Conflicts with existing rules

| Area | Verdict |
| --- | --- |
| **Pending recommendations** | **RH-1** (implicit decision) and **RM-11**. §14.1 row 2 puts two competing loads on one card with no precedence rule. Sequence: athlete taps **Accept** on the rec (`handleDecide` sets the weight input to the rec target, `ExerciseCard.tsx:131-135`), then taps **Use** (overwrites it), then logs. The decision is already `accepted`, so no implicit decision fires — but the persisted `chosen.loadKg` is the *rec's* target while the athlete actually lifted the *suggestion's* load, and `chosen.loadKg` **heads the next prefill chain** (`workingTargets.ts:41`). The next session prefills a weight nobody lifted. This is pre-existing behaviour, but the suggestion card makes the divergence likely rather than exotic |
| **Accepted/modified decisions** | §14.1 row 5 ("Decision heads the chain but its rep basis is ≥ 2 from T → shown") is correct in intent, but see RH-2: `T` must incorporate `chosen.reps` or the row is evaluated against the wrong target |
| **Prescription rep-range changes** | The trigger case is right and the "self-limiting" argument is right *for `fixed` schemes*. It fails for `repRange` (RH-2) |
| **Baseline loads** | No conflict. `baselineLoadKg` sits below carry-forward and produces no rep basis; the design should state that `origin: "baseline"` means `repBasis = null` and therefore no suppression — which is arguably correct (a baseline carries no rep evidence) but is unstated |
| **Offline completion** | Correct. Zero sync surface, client evaluation untouched, `evaluateSession` inputs unchanged. Verified against `activeSession.ts:633-743` |
| **Stale cached bundles** | Partly. The IDB cache has **no TTL at all** (verified) — "as of `<generatedAt>`" copy is necessary but the design never bounds how stale. R-13's "recomputed on every online Today load" is true and does not address the offline case |
| **Historical set edits** | Correct and genuinely free. On-read derivation means an edit is visible on the next read with nothing to invalidate — a real advantage over `recommendations`, which carry a re-evaluation obligation (`sync/service.ts:882-884`, `:938-940`) |
| **Archived exercises** | **Unaddressed (RL-10).** Archived exercises are not filtered from the Today bundle or history; only the ad-hoc picker filters client-side. `GET /api/exercises/[id]/strength` needs an explicit rule (recommendation: serve it — history is archive-agnostic by design — but say so) |
| **User ownership** | **Unaddressed (RL-10).** Every existing exercise read is `and(eq(exercises.id, id), eq(exercises.userId, userId))` (`server/exercises/service.ts:167-171`). The new service must do the same, and there is no acceptance criterion for it |
| **Timezone / `asOf`** | **RM-3.** Also: `asOf` arrives from the query string (`?asOf=`) with no stated validation. A client-supplied `asOf` is a legitimate feature (as-of trend replay) but needs bounds and a non-future clamp — otherwise RM-2 becomes user-triggerable |
| **PI-002** | **RM-3**, third bullet |

### 7.3 Can a suggestion be stale or contradictory by the time **Use** is tapped?

**Yes, in four distinct ways, and the design bounds only the first.**

1. **Bundle age.** Bounded for the SW copy (24 h), **unbounded** for the IDB copy. "As of `<generatedAt>`" copy discloses it; nothing caps it.
2. **Un-synced facts.** The suggestion is computed from the server's facts. A session completed offline yesterday is in the outbox, not in the estimate. §14.1 names this ("the bundle-time suggestion is shown as-of `generatedAt`") but the effect on a *scheme-change* suggestion is the worst case: the one session that would make the carry-forward rep-compatible is exactly the one missing.
3. **Cross-device adopt.** The frozen suggestion dies with the aggregate; the adopting device shows nothing. Correctly identified as the warm-up O-3 limitation.
4. **Within-session contradiction.** RM-11 — the athlete can act on the suggestion *and* on a recommendation in the same card, and the persisted record of what they chose can disagree with what they lifted.

Given (2) and (4), the frozen suggestion should carry its `generatedAt` and be **hidden**, not merely labelled, once the aggregate observes a first work set logged for that exercise this session — the number has served its only purpose by then and can only mislead afterwards.

---

## 8. Design-choice assessment

Separating harmless conservative heuristics from rules that can generate misleading or unsafe output.

| Choice | Verdict | Reasoning |
| --- | --- | --- |
| **Lower median** rather than median/min/other | **Coherent — keep.** | Integer-preserving, no invented decimals, matches `progression-engine.md` §3's "never averages … never interpolates" doctrine (verified at `:98-106`). Robust upward. **State the asymmetry**: it is *not* robust downward (P10c — `[130,132,13]` → 130), so a mistyped-low set moves the estimate while a mistyped-high one does not. §7.4's table does not mention this |
| **Modal-load filtering as a substitute for warm-up marking** | **Not acceptable as a substitute.** | Works when work sets are the plurality; fails silently and by 22–25 % on top-set and repeated-warm-up-weight sessions (RH-4), with no distinguishing flag. Keep it as a *defence in depth* against back-off/drop sets; do not let it stand in for O-5 |
| **Only three sessions** | **Coherent.** | Three is genuinely the minimum where one outlier cannot be the median (verified). D-10 already provides the widening trigger. Labelled heuristic, RG-5 gated. Fine |
| **90-day expiry** | **Coherent in principle, incoherent in implementation.** | A staleness horizon is right and RG-4 correctly flags it as ungrounded. The *instant* window is the problem (RM-3), not the number |
| **10 % / 15 % / 20 % thresholds** | **Arbitrary but harmless — with one exception.** | All are labelled heuristic and RG-5-gated, and all three degrade or suppress rather than assert, so being wrong costs a suppressed card. The exception is that they are computed as `(max − min) / lowerMedian`, a *range* relative to a low centre — systematically larger than a dispersion measure. "Spread ≤ 10 % for high confidence" therefore means "essentially no session-to-session variation", making `high` nearly unreachable for the estimate. The document says this is deliberate; it should say it is deliberate *and* what the measure is |
| **RIR 3–4 eligible (degraded)** | **Coherent as product judgment; the citation is wrong.** | Including RIR 3–4 is correct — EVIDENCE-030 found 1-RIR and 3-RIR statistically equivalent within ±1 rep, which *supports* inclusion. Degrading them by citing EVIDENCE-014 runs directly into EVIDENCE-030's unsafe-inference clause (§12). Keep the rule as a conservative product judgment; drop the evidence claim |
| **RTF up to 15** | **Not coherent — reduce to 12 (RM-13).** | The motive is right (a 12-rep set at RIR 1–3 is real data) but the direction is wrong: Epley is linear against a curvilinear truth, so every RTF 11–15 set enters the pool biased high (+0.5 % → +5.3 % measured, §10.1), and the "mildest among non-flat formulas" hedge excludes exactly the flatter shapes the evidence favours. It also departs from OD-06's reps ≤ 12 in the *less*-safe direction (RL-13). `RTF_MAX = 12` keeps everything the extension was written to save |
| **Direct tier = most recent modal load, no RIR adjustment** | **Unsafe as specified — must change.** | RH-3. Non-monotone, effort-blind, uncapped, unfloored, and the only path that can over-prescribe |
| **110 % cap** | **Coherent — keep.** | §12.4 shows the trade honestly (102.5 vs a true 110), and the asymmetry is right: an under-shot start costs three sessions of `increase_load`; an over-shot 5-rep set is a failed set. Verified to hold in 600 random cases. One caveat: the cap is on *load*, so on an exercise with a coarse `loadStepKg` (machine, 5 kg) the cap plus the floor can under-shoot by two full steps. Acceptable |
| **Excluding deloads from `best`** | **Coherent — keep.** | Verified airtight (P12). A deload observation cannot become `best` even at 9999 kg. Consistent with carry-forward's own posture |
| **Showing a `best` derived from missing-RIR or extended-rep observations** | **Acceptable with labelling; one gap.** | The flags exist and cap confidence. The gap is `bestSetE1rmKg` as displayed provenance (RL-15): a 1356.67 kg typo survives as provenance even when the session `best` is correct |
| **Dumbbell / cable / machine / unilateral without a confidence penalty** | **Coherent — keep (O-7).** | The reasoning is exactly right: comparisons only ever happen *within one exercise identity*, so an unknown but consistent unit cancels. A blanket penalty would be noise, not information. The real exposure is a *change* of convention mid-history (R-7), which a penalty would not catch either — that is what `strength_estimate = 'off'` and the `MIXED_LOADS` flags are for |
| **Computed on read** | **Correct — keep.** | Endorsed by `architecture-plan.md:118`, `data-model.md:388`, and ADR-007. The rejection of a cache table (X-9) is well-argued: it would inherit the re-evaluation obligations `recommendations` carry on set edits |
| **Query size** | **Understated — RM-8.** | The conclusion (no cache) is right; the sizing argument is not, because it ignores the N+1 loop, the all-time `best` scan, and the 3 s `NetworkFirst` timeout |
| **Current mutable equipment/`loadStepKg` semantics reinterpreting history** | **Mostly harmless, one sharp edge.** | `loadStepKg` affects only future rounding — genuinely harmless, and the document says so. `equipment` is different: it is an **eligibility gate**, so editing it makes an entire history series appear or vanish. That is not "reinterpretation", it is presence/absence. State it, and consider deriving eligibility from `strength_estimate` alone (with the equipment default applied at *seed/creation* time), so a later equipment edit cannot silently erase a trend |

---

## 9. Assessment of F-1 (warm-up-set prerequisite)

**Is the missing UI path a real existing correctness gap?** **Yes, and a larger one than either the evaluation or O-5 describes.** Verified impacts on `main` today, for any athlete who types their warm-up ramp into the log (the only thing the UI permits):

| Consumer | Impact | Severity |
| --- | --- | --- |
| **Carry-forward prefill** | Prefills the **lightest ramp set**, always. `toCarryForwardCandidate` takes the *first* non-warm-up set (`today/service.ts:276`) | **High — user-visible every session** |
| **`loadProgression.isCompleted`** | `repShortfall` sums over the **first `scheme.sets` sets** (`loadProgression.ts:28-41`), i.e. the ramp. Reproduced: a session where all three work sets hit 5 reps yields shortfall 2 → `PRESCRIBED_REPS_NOT_COMPLETED` → **hold instead of increase** | **High — silently reverses progression** |
| **Engine modal load** | Correct when work sets are the plurality; falls to the **lightest ramp set** on any single-work-set day (all counts 1 → earliest index wins) | **Medium** |
| **Weekly volume** | Every ramp set counts as a work set — a 3-set ramp on a 3-set exercise **doubles** the reported weekly sets for those muscles, against `volume-model.md` §1's own definition | **Medium — corrupts the MEV/MAV landmark comparison the volume screen exists for** |
| **e1RM (proposed)** | Understates by 22–25 % on top-set and repeated-warm-up-weight days, with no distinguishing flag | Medium |

**Is a warm-up toggle genuinely required before e1RM?** For the *estimate's honesty*, no — the modal rule covers the common straight-sets case and the failure is visible on the trend. For the *repository's correctness*, the question is backwards: the toggle is required **on its own merits, now**, and e1RM is merely the fifth consumer to notice.

**Should it be independent?** **Yes — strongly.** It should ship as its own small remediation, before and separate from any e1RM work:

- Its blast radius (prefill, progression, volume) is entirely outside the e1RM feature.
- Bundling it makes an e1RM review gate on a progression-engine regression suite, which the evaluation elsewhere works hard to avoid touching.
- It is genuinely small: schema, wire, server write, client store (log **and** edit), and display all already support `isWarmup`. Only `ExerciseCard.tsx:111` and `HistoryDetail.tsx:162,202-211` need to pass it, plus one control in each.
- It unblocks PI-001 too, which explicitly says "Exclude warmups" from its comparison baseline — impossible today.

**Coverage it needs** (not implemented here):

- **UI**: a warm-up toggle on the set-entry row that persists across logs within an exercise until cleared (ramps are consecutive), and does not survive into the next exercise. Rendering already exists (`W ·`).
- **History edit**: `HistoryDetail`'s `onSave` must carry `isWarmup`; the sync path already accepts it (`sync/service.ts:171, 858`).
- **Offline**: none needed — `LogSetInput.isWarmup` and `EditSetPatch.isWarmup` already exist and `setLogFullRowOp` sends full rows.
- **Sync**: none — `setLogUpsertPayloadSchema.isWarmup` already exists and is in `writable`.
- **Regression**: (a) an edit that flips `isWarmup` on a completed session's set already counts as a `relevantEdit` and re-evaluates a pending rec — `sync/service.ts:708` is literally `if (writable.has("isWarmup") && payload.isWarmup !== existing.isWarmup) return true;`, so this path is built and only needs a test; (b) `carryForward` picks the first **work** set after the flip; (c) `repShortfall` counts work sets only; (d) volume drops the flagged sets; (e) the `progressionMatrix` suite still passes; (f) a session whose *every* set is flagged warm-up produces `NO_WORK_SETS_LOGGED`, not a crash.
- **Backfill**: none. Existing rows stay `false`, which is what they claim today. Do not retro-classify; a one-off "mark these as warm-up" affordance in history edit is enough.

**Does modal-load filtering remain necessary afterwards?** **Yes, keep it** — but demote it from "the defence" to "defence in depth". After the toggle it still earns its place against back-off sets, drop sets (which appear as descending loads), and rest-pause fragments, and it still removes the `11 kg` typo of §7.5 E. What must change is the *claim*: with the toggle it is a secondary filter; without it, it is not a substitute.

---

## 10. Evidence-status assessment

The evaluation's overall classification — **"Convention (heuristic, no corpus backing)"**, the tier `evidence-to-design.md` row 18 already assigns — is **correct and honestly stated**, and the requirement to add a row 20 (the file currently has 19 rows ✓) before building is right. RG-1…RG-8 are well-chosen and correctly framed as gates on *claims*, not on the build.

Two evidence characterisations do not survive checking.

### RM-1a — the RIR ≥ 5 exclusion is presented as supported when the repository says the opposite

§4.2: "`rir` ≥ 5 — Excluded (B8's own '5+' example)".

B8 (`product-evidence-boundaries.md`, heuristic 8) says: *"**Weighting** low-RIR (e.g. 0–2) user-logged data **more heavily than** high-RIR (e.g. 5+) user-logged data."* Weighting, not discarding.

And `evidence-to-design.md` row 5 lists, in its **"not justified"** column: *"A quantitative accuracy model per RIR value; **discarding high-RIR data entirely**."*

Excluding every RIR ≥ 5 set is exactly the named unsafe inference. It may still be the right *product* call for a 1RM extrapolation specifically (an RIR-6 set is a very long extrapolation), but it must be labelled a conservative product judgment that **departs from** row 5, not one that follows B8.

### RM-1b — the RIR 3–4 degradation cites the source that forbids it

§4.2: "`rir` 3–4 — Eligible, degraded (**EVIDENCE-014**: accuracy worse far from failure; B8)".

EVIDENCE-030 — which the registry itself calls *"the corpus's most methodologically rigorous single source specifically on RIR measurement accuracy"* — records under **Unsafe inference**: *"Do NOT … assume accuracy is uniformly better very close to failure than a few reps out — this specific study found no statistically confirmed difference there."* Its equivalence testing covered exactly 1-RIR vs 3-RIR.

§6.2 does cite EVIDENCE-030 for the noise magnitude, so the document is aware of it; it simply does not notice that the same source blocks the §4.2 rule's stated basis. Degrading RIR 3–4 is a defensible *conservative choice*; citing EVIDENCE-014 for it is not.

### Correctly characterised

- EVIDENCE-030's 0.40–0.90 rep absolute error ✓ (verified verbatim), and the derived ±1–3 % e1RM noise is arithmetically correct.
- B11 ("approximate signal, ±1 rep noise, not an exact input") ✓ — the integer offset alters no reported value and averages nothing, consistent with `progression-engine.md` §3's "never averages RIR into decimals, never interpolates, never corrects" (verified at `:105`).
- B6 / EVIDENCE-025 for post-deload dips ✓ — B6 literally names *"a tracked strength metric (e.g. a 1RM estimate)"*, so the corpus anticipates this feature's framing.
- GAP-07 (RIR moderators contested) and GAP-09 (sex/age) ✓ — correctly used to forbid trust-weighting (N-6) and to gate copy (RG-7).
- "Whether `reps + RIR` predicts true reps-to-failure well enough for a 1RM equation is **not** in the corpus (RG-2)" ✓ — verified, it is not.

### Classification of every load-bearing claim

| Category | Items |
| --- | --- |
| **Arithmetic truths** (independently reproduced) | The §6.1 multiplier table (except Wathan); "no formula is uniformly conservative" and the direction reversal at r ≈ 10; Epley's `f(1) = 1.0333` inflation; RIR error propagation +2.3 %…+3.0 %; `current ≤ best` by construction; the lower median's robustness for n ≥ 3; the closed-form inverse and its determinism |
| **Repository conventions** (verified in source) | Computed-on-read for derived data; kg only (OD-01); `loadStepKg` as the rounding grid; integer RIR bands, never scalars; deloads badged not excluded from display but excluded from decisions; `completed` for history/engine, `!= discarded` for volume; exercise identity = `exercises.id`, never merged by name; snapshot-on-use for prescriptions, current-convention for derivations; reason codes as the API with UI-owned phrasing |
| **Evidence-backed principles** | RIR is a useful but noisy signal, ~±1 rep (EVIDENCE-030); post-deload strength dips are expected (EVIDENCE-025/B6); RIR accuracy moderators are contested, so no demographic weighting (GAP-07/GAP-09) |
| **Conservative product judgments** (defensible, not evidence) | Downward rounding; the 110 % cap; excluding deloads from `best`/`current`; effort-matched translation for missing RIR; "unconfirmed" labelling instead of quarantine; refusing bodyweight/`other`; advisory-only, never auto-applied; the RIR ≥ 5 exclusion and the RIR 3–4 degradation — **once relabelled per RM-1** |
| **Unsupported numerical heuristics** (must be labelled as such, and are, except where noted) | 90 days; three sessions; 21/42-day age tiers; 10 % / 15 % / 20 % / 20 % disagreement thresholds; rep distances 1/3/6/8; RTF ceiling 15 and core ceiling 10; `TARGET_RTF_MIN = 3`; the 110 % factor; the 10 % unconfirmed threshold. All are declared "labelled heuristic" in §7.1 — good. **RTF 15 additionally contradicts a recorded decision (OD-06's reps ≤ 12) and needs an owner decision, not a label** |

### 10.1 Literature status of the four load-bearing empirical questions

Consulted outside the repository corpus, because these are the claims the whole feature rests on. Sources are named for traceability only — per `evidence-to-design.md` §3 rule 4, **none of these may be cited in a design document until they enter the registry**, and this review does not add them.

| Question | Status | What the literature actually supports |
| --- | --- | --- |
| **Epley across rep ranges (RG-1)** | **Well established, and it cuts against RTF 15** | Epley (as Welday) was tested by Mayhew et al. 2008 (n = 103, bench press, RTF 2–30): constant error **+5.3 ± 11.0 %** over the full range, falling to **+0.5 ± 10.2 %** when restricted to RTF ≤ 10. Restricting the domain nearly eliminates *bias* but barely touches between-individual *scatter*, which stays near ±10 % SD (≈ ±20 % for a 95 % interval on one athlete). The underlying reps-%1RM relation is **curvilinear** while Epley is **linear in reps**, so Epley **systematically overestimates as reps grow**. LeSuer et al. 1997 found nearly all equations significantly biased. **No equation is validated above 10–12 RTF**; where a wide range is unavoidable, exponential forms (Mayhew's, Wathen) held up better than Epley/Brzycki — "less bad", not validated |
| **`reps + RIR` as reps-to-failure (RG-2)** | **Unknown — the weakest link in the chain** | No peer-reviewed study validates `(reps performed + self-reported RIR)` substituted into a 1RM equation against a measured 1RM. The two halves are validated separately; the composition is not. RIR self-report itself is well studied (Hackett 2012 r ≥ 0.93; Remmert 2023 MAE ≈ 0.65 ± 0.78 reps in trained lifters, far worse in novices — 4–5 reps of underprediction). Error propagation is forced by the formula at **≈ 3.3 % of e1RM per rep of RIR error**, which matches the evaluation's own §6.2 arithmetic. Novice RIR error is *systematically* under-reported, which biases e1RM **downward** — the conservative direction |
| **Individual variability in reps at %1RM (RG-3)** | **Well established, and it *supports* the design** | Nuzzo et al. 2024 (Sports Medicine; meta-regression of 952 RTF tests, ≈ 7,289 individuals, 269 studies) found **exercise was the only meaningful moderator** — separate tables were warranted for bench press and leg press, but **sex, age, and training status had little influence**, so no sex- or age-specific tables were justified. Between-individual SD **grows as load falls** (tight at 90 % 1RM, wide at 50–60 %). Older work agrees on exercise-dependence: reps at 80 % 1RM range ≈ 6–8 (leg curl) to ≈ 10–15 (leg press, lat pulldown, bench) across exercises |
| **Machines and cables (RG-6)** | **Mixed and thin; "machines behave like free weights" is not supported** | Wood et al. 2002 applied seven equations across ten machine exercises and found chest press, incline chest press, shoulder press and leg extension **lacked similarity across all equations**. Nuzzo's bench-vs-leg-press split is itself partly a machine/free-weight split. **No evidence found for cables specifically.** A single global equation across machines is not defensible; **per-exercise, within-athlete tracking is**, because a stable per-exercise bias cancels out of within-athlete comparisons |

**Three consequences for this design.**

1. **It validates the design's most important structural choices.** Nuzzo 2024 and Wood 2002 both say the same thing: the equation's error is dominated by *exercise identity*, and it largely cancels when comparisons stay within one exercise and one athlete. That is exactly what §5.1's "comparisons only ever happen within one exercise identity" and N-4's ban on cross-exercise inference already do. **O-7's decision to allow dumbbell/cable/machine without a confidence penalty is better supported than the evaluation itself claims** — a per-exercise bias that never leaves its exercise is not an accuracy problem.
2. **It contradicts the RTF-15 extension** — see RM-13 below.
3. **It softens RG-7.** The evaluation gates copy behind sex/age differences (GAP-09). The current best evidence (Nuzzo 2024) found little sex or age influence on reps-at-%1RM and declined to publish separate tables. The caution is harmless but should not be treated as a blocker; RG-7 can be narrowed to "does not generalise beyond your own history" as a *copy* rule, which the design already has.

**Nothing found makes an advisory, labelled, per-exercise, within-athlete, never-auto-applied suggestion unsafe — it makes it imprecise.** The design's refusals (never presented as a measured max, never auto-applied, never a strategy trigger) are the two mitigations the literature actually calls for. The residual hazard is imprecision-driven, not mechanism-driven: error is multiplicative in load, so a 10–20 % overestimate on a heavy compound is a genuine failed-rep event if acted on literally — which is what the 110 % cap, the downward floor, and the **Use**-not-auto-apply boundary exist for, and why RH-3 (the one path that bypasses all three) matters.

### 10.2 RM-13 — the RTF 11–15 extension runs the wrong way

§6.3 justifies the extension with: Epley has *"the mildest high-rep growth among the non-flat formulas — the safest shape for the extended 11–15 band."*

Two problems.

- The qualifier "**among the non-flat formulas**" carves out precisely Lombardi (1.311 at r = 15) and O'Conner (1.375), both of which are milder than Epley (1.500) — and the literature says the true relation is **curvilinear/flattening**, i.e. shaped like the ones excluded. Epley's linearity is not the safest shape at high reps; it is the shape that overestimates most predictably.
- Mayhew's measured bias for Epley goes from **+0.5 %** (RTF ≤ 10) to **+5.3 %** (RTF 2–30). Every set admitted between RTF 11 and 15 therefore enters the pool with a positive, load-multiplicative bias, and the pooled `currentE1RM` — a lower median, which is robust *upward* but not against a whole cohort of biased-high observations — carries it into the remote-tier translation.

This is a **non-conservative** rule inside a design whose central claim (§1 item 2) is that "conservatism is delivered structurally". It is also the one place where the document departs from a recorded decision (OD-06: "capped at reps ≤ 12") in the less-safe direction.

Recommendation: **set `RTF_MAX = 12`, matching OD-06.** That still admits 12 reps @ RIR 0, 11 @ RIR 1, and 10 @ RIR 2 — the whole hypertrophy band the extension was written to save — and only excludes RTF 13–15, which is where the bias is largest and the evidence thinnest. `RTF_CORE_MAX = 10` stays as the full-standing band. The cost is that a 12-rep set at RIR 3 is dropped; the benefit is that the ceiling is both evidence-consistent and decision-consistent.

---

## 11. Recommended modifications

Ordered by how much they change. None require a different architecture.

**Must fix before the design is bindable**

- **RC-1 (RH-1).** Either (a) suppress the starting-suggestion card whenever a pending recommendation exists *at all* — not merely when it is rep-compatible — or (b) accept that **Use** can author an implicit decision and say so explicitly in I-1, A-18, §14.1 and the card copy. (a) is strongly preferred: it is one line in the gate, it removes the two-numbers-one-card problem (RM-11) at the same time, and the rep-incompatible-pending-rec case is rare enough to be handled by the recommendation card's own "for N-rep sets" line.
- **RC-2 (RH-2).** Define `T = decisionChosen?.reps ?? schemeDefaultReps(scheme)`, matching `workingTargets.ts:43` exactly, and add a fixture proving the card falls silent for a `repRange` prescription mid-block.
- **RC-3 (RH-3).** Apply the same effort translation in the direct tier: translate the direct source's session e1RM to the target RTF instead of returning `modalLoadKg` raw, then take `min(translated, mostRecentModalLoad)` so direct evidence still caps the answer downward but a lighter target effort cannot produce a heavier load. Floor the result to `loadStepKg` like every other tier. This also removes the non-monotonicity, because a single formula then governs all three tiers and only the *basis* differs.
- **RC-4 (RH-4 / O-5).** Ship the warm-up toggle first, as an independent remediation (§9), and restate the modal rule as defence in depth.
- **RC-5 (RM-7).** Specify how `carryForward.repBasis` is produced — which query, which population, and the `null` behaviour. Recommendation: derive it from the *same* observation set the estimate uses (`modalReps` of the observation whose session id matches the carry-forward source), and when the source has no observation, treat it as rep-**incompatible** only if an observation exists for a *different* session; otherwise stay silent.

**Should fix**

- **RC-6 (RM-2).** Apply the `asOf` upper bound to `best` as well, and count only *past* observations in `staleObservationCount`. Validate and clamp the `?asOf=` query parameter to non-future.
- **RC-7 (RM-3).** Express the window and the age tiers in the account's timezone as calendar dates, using `userLocalDateString` / `localDateToUtcInstant` as `volume/service.ts:230-243` does. State the UTC precondition on every ISO string comparison. Record a PI-002 forward-compatibility note.
- **RC-8 (RM-4).** Move the disagreement gate ahead of the direct-tier return, and either apply it to any basis (not just `n = 2`) or rename it `PAIR_DISAGREE` and stop claiming §9's general "two observations disagreeing" rule. Give `deriveEstimate` a `reasonCodes` field so A-5 becomes satisfiable.
- **RC-9 (RM-5).** Make every declared code reachable or delete it. `buildObservation` should surface the set-level exclusion counts (`ZERO_LOAD_SETS_EXCLUDED`, `HIGH_RIR_SETS_EXCLUDED`, `HIGH_REP_SETS_EXCLUDED`) rather than discarding them. Pick one spelling of the deload code. Add a unit test that asserts reachability of the whole enum — it would have caught F-5 in the engine too.
- **RC-10 (RM-6).** Sort `recent` by `(performedAt, sessionId)` in `suggestStartingLoad`, matching `deriveEstimate`.
- **RC-11 (RM-8).** Make "one batched observation query per bundle, not one per exercise" a binding constraint, and decide whether the bundle's `best` is windowed (cheap) or all-time (a scan). Measure the current bundle latency before adding to it.
- **RC-12 (RM-9).** Add `todayIsDeload` to `TranslationInput` so I-7 is provable in the pure module.
- **RC-13 (RM-10 / I-8).** Reword I-8 to match whatever RC-3 decides, and state the interaction with `roundToStepKg` in the implicit decision.
- **RC-14 (RM-12).** Require *all* basis observations to report RIR before using the band; a mixed basket should stay effort-matched.
- **RC-15 (RM-1).** Relabel the RIR ≥ 5 and RIR 3–4 rules as conservative product judgments; note the departure from `evidence-to-design.md` row 5 and the tension with EVIDENCE-030 in the new row 20.
- **RC-29 (RM-13).** Set `RTF_MAX = 12` (OD-06's ceiling), keeping `RTF_CORE_MAX = 10`, and drop the "safest shape for the extended band" argument — Epley's linearity is the shape that overestimates most at high reps. Retire the `EXTENDED_REP_RANGE` flag's 11–15 range to 11–12.
- **RC-16 (RM-11 / §7.3).** Hide the suggestion card — not merely label it — once a first work set is logged for that exercise in the session, and state a precedence rule if RC-1(b) is chosen instead of RC-1(a).
- **RC-17 (RL-10).** State ownership (`eq(exercises.userId, userId)`) and archived-exercise posture for the new endpoint, and add acceptance criteria for both.

**Corrections to the document**

- **RC-18.** §1.1 row 1 and §12.1 — "under every formula" → "under Epley, Brzycki and Wathan; Lombardi and O'Conner reverse it, O'Conner by under 1.4 %" (§5.2). Keep the principle.
- **RC-19.** §12.4 — `139.33 / f(7) = 112.97`, not 119.4.
- **RC-20.** §6.1 — recompute the Wathan column (r = 3, 8, 12, 20).
- **RC-21.** §12 — either apply the uniform-RIR premise consistently in §12.5 or state which sessions each bullet uses.
- **RC-22.** §7.5 E — four values, not two.
- **RC-23.** §5.1 — remove "sign-inverted load"; replace with "assistance load is stored as an ordinary non-negative number whose *direction of meaning is inverted and unmodelled*, so a rising number means a weaker effort". Remove the `prescription-model.md` §7 citation or replace it with `:159`.
- **RC-24.** §2.1 — correct `progression/service.ts:494-532` → `:408-437` + `workingTargets.ts:39-45`; §15 — `src/sw.ts` → `src/app/sw.ts`.
- **RC-25.** §5.1 — soften the ADR-007 mechanism-3 precedent to an analogy, and say plainly that `equipment` is an eligibility gate, not a reinterpretation weight.
- **RC-26.** §7.4 — add the lower median's downward asymmetry (P10c).
- **RC-27.** §11.3 — record that the 1100 kg session also raises `SESSION_SETS_INCONSISTENT` and retains a 1356.67 kg `bestSetE1rmKg`; decide whether provenance is suppressed when it is flagged.
- **RC-28.** §10 — add a non-finite guard before the DTO (RL-11).

---

## 12. Owner decisions

### O-1 — v1 scope: tracker + advisory suggestion, or tracker only?

**MODIFY → split into two shipments.** Ship the **tracker alone** first (steps 1–3 of §20), then the suggestion after RC-1…RC-5 and a block of tracker use. Consequence: the tracker is pure read-only derivation with no wiring risk at all — it cannot touch the prefill, the decision flow, or the outbox, so it is reviewable purely on domain fixtures. The suggestion carries every one of this review's High findings. Shipping them together (B-1) means the tracker waits on the suggestion's fixes and the suggestion inherits the tracker's review gate; splitting costs one extra release and removes the coupling. It also gives §20 step 6's "observation period" real data to judge R-2 on *before* any card is shown.

### O-2 — additive `exercises.strength_estimate` column?

**ACCEPT, with two modifications.**
1. **Text enum `'auto' | 'off'` over a boolean — yes, keep the enum.** A boolean names the mechanism; the enum names the intent and leaves room for `'manual'`/`'bodyweight_inclusive'` (D-3) without a second migration. It matches how the repo already models small vocabularies with a `check … in (…)` constraint (`equipment`, `mechanics`, `laterality`). Cost is one CHECK constraint.
2. **Default `'auto'` for existing and new rows.** Correct, and unavoidable: the seed skips any slug already in `exercise_catalog_seed_log` (`db/seed/exercises.ts:45-56`, verified), so a seed-level `'off'` will **never** reach an existing Assisted Pull-Up or Farmer's Carry row. The evaluation states this correctly. Consequence if nothing else is done: both exercises show a meaningless estimate until the owner toggles them. Recommendation: a one-shot reconcile step in the migration setting `'off'` where `is_seeded = true and id in (<the two slug-derived ids>)` — the ids are deterministic (`slugToUuid`), so this is a two-row targeted update, not a reconciliation framework.
3. Ownership and validation: add `strengthEstimate` to `updateExerciseSchema` (`.strict()`, so it is currently *rejected* — this is required, not optional) and route it through the existing user-scoped `updateExercise` path.
4. Bodyweight / `other` / custom exercises: the column is orthogonal to `equipment`. Keep the equipment gate as the primary rule and `'off'` as an override that can only ever *disable*, never enable — otherwise a user flipping an exercise to `'auto'` re-opens the bodyweight problem the category rule exists to close. State this: `'auto'` means "eligible **if** the category allows".

### O-3 — 110 % upward cap?

**ACCEPT.** Verified to hold in 600 random cases. The asymmetry is the right one: §12.4 shows a 7.5 kg under-shoot recovered by the engine in three sessions, versus an over-shot 5-rep set which is a failed set and a wasted session. Consequence of rejecting: uncapped remote translation from a 12-rep source to a 5-rep target produced **112.97 kg** in the corrected fixture — above the athlete's *actual* heaviest recent working load, on the strength of a single high-rep session. Note that the evidence offered for this decision (§12.4 row 1) contains the arithmetic error RC-19; the decision is right, the exhibit needs correcting first.

### O-4 — placement: new `/exercises/[id]/strength` page?

**ACCEPT.** A dedicated route keeps the estimate out of the edit form (which is a definition surface, not an analytics one), matches how history and volume are already separate read-only surfaces, and gives the "Estimates only — not tested maxes" footer somewhere to live. The `strength_estimate` toggle belongs in the edit form, as proposed. No Today change in v1 — correct; D-8 has the trigger. Consequence: one more route and one more `NetworkOnly` GET, both consistent with `pwa-offline-strategy.md` §2.

### O-5 — warm-up toggle as a prerequisite?

**ACCEPT the toggle, REJECT the framing.** It is not an e1RM prerequisite; it is an **independent correctness fix that should ship before and separately** (§9). Consequence of accepting the evaluation's framing (bundled prerequisite): an e1RM release gates on progression-engine and volume regression suites it otherwise never touches. Consequence of the alternative offered ("accept ramps-as-work-sets with the modal-load defence only"): the app continues to prefill warm-up weights, hold progression that should increase, and double-count volume — all verified, all live today.

### O-6 — missing-RIR policy: effort-matched lower bound?

**ACCEPT, with RC-14.** Effort-matching is right: assuming the prescribed band for an unreported RIR invents a report (X-7, B11, and `evidence-to-design.md` row 4's "no correction algorithms"). The modification is that `basisHasRir = basis.some(…)` currently flips a mostly-unreported basis to band-max on the strength of one reported session (P13c), which is the double discount this decision exists to prevent. Require `every`, not `some`.

### O-7 — dumbbell / cable / machine / unilateral eligible "as logged", no confidence penalty?

**ACCEPT — and the reasoning is better supported than the evaluation claims.** The external literature (§10.1) is unusually clear here: the dominant moderator of the reps-%1RM relation is **exercise identity**, not sex, age, or training status, and machine exercises genuinely do *not* behave like free-weight ones for absolute prediction — which is exactly why a **per-exercise, within-athlete** series is the right unit and a global equation is not. A stable per-exercise bias cancels out of within-athlete comparison. The alternative (exclude until D-3) would leave the feature covering barbell only, a small minority of this catalogue. Within one `exercises.id` the unit cancels, and the estimate is explicitly "in the unit you log". A flat penalty would carry no information — it would apply equally to a perfectly consistent dumbbell series and a broken one. The real exposure is a *mid-history convention change*, which a penalty does not detect either; `strength_estimate = 'off'`, the `MIXED_LOADS_IN_SESSION` flag, and the copy rule handle it. **Add** one copy requirement: the page states the unit convention is the athlete's own ("per the numbers you log for this exercise").

### O-8 — `other` equipment excluded?

**ACCEPT.** `other` is a genuine catch-all (bands, landmine leverage, sled) with no load semantics at all, and there is no defensible number to show. The offered alternative ("eligible with low confidence") is worse than exclusion because a wrong number at low confidence is still a number. The re-classification escape hatch is right and costs the user one edit.

### O-9 — resolve OD-06 now with B-2, leave OD-04 open?

**MODIFY.** Resolving OD-06 now is right and inline SVG (leaving OD-04 open, N-7) is right — a sparkline is not a charting requirement. But **B-2 is not a resolution of OD-06, it is an amendment of it**: OD-06 records Epley over plain `reps`, "capped at reps ≤ 12 for display". B-2 changes the *input* (`reps + RIR`) and the *ceiling* (15, core 10). The input change is defensible and should be recorded (it is the whole point of the feature, and it is what makes RG-2 the sharpest research gate). **The ceiling change should be rejected** (O-12, RM-13). Record the amendment explicitly, with date and rationale, per `open-decisions.md`'s own note ("Resolved decisions move out of this file and into an ADR … with the resolution date and trigger noted"), rather than as continuity. Consequence of not doing this: a future reader takes OD-06 at face value and finds display capped at 12 where the code allows 15.

### O-10 — list deload observations on the strength page?

**ACCEPT (yes, badged).** Consistent with volume, which counts and badges deload weeks (`aggregate.ts:157`), and directly supported by B6/EVIDENCE-025 — a visible post-deload dip framed as expected is *more* informative than a gap. Hiding them would make the trend look like missing data. They are already excluded from every decision (P12 verified), so showing them costs nothing.

### Owner decisions the evaluation missed

- **O-11 — Does the suggestion coexist with a pending recommendation at all?** (RH-1, RC-1.) This is the decision that determines whether **I-1** and **A-18** can be true. Suppressing on *any* pending rec is recommended; the alternative is accepting that **Use** can author a Decision.
- **O-12 — Is `RTF ≤ 15` (vs OD-06's 12) an amendment the owner accepts?** Folded invisibly into O-9 today. **Recommendation: reject the extension, keep 12 (RM-13, RC-29).** Consequence of accepting 15: sets at RTF 13–15 enter the pool with Epley's largest positive bias and can raise `currentE1RM`, which the remote tier then translates into a *heavier* suggested load — a non-conservative path in a design that claims structural conservatism. Consequence of keeping 12: a 12-rep set logged at RIR 3 is dropped, which for a 0–2 RIR hypertrophy prescription should be rare.
- **O-13 — Window semantics: account-timezone calendar days or rolling instants?** (RM-3.) It decides whether the number is stable within a day, and whether PI-002 will move it later.
- **O-14 — Is the bundle's `best` windowed or all-time?** (RM-8.) Directly a Today-latency decision on a `NetworkFirst`/3 s path.
- **O-15 — Is the archived-exercise strength page served or 404?** (RL-10.) Recommendation: serve it — history is deliberately archive-agnostic — but the rule must be chosen, not defaulted.
- **O-16 — Does the direct tier translate for target effort?** (RH-3, RC-3.) The owner should see the trade explicitly: the current rule reproduces the athlete's real recent load exactly, which is intuitive; translating is conservative but can suggest a load they have never lifted.

---

## 13. What is safe to bind now

**Safe to bind today** — verified, coherent, and independent of every finding above:

- The persistence decision: computed on read, no cache table, no derived column, no snapshot field, no new fact (**B-8**, §13). Endorsed by `architecture-plan.md:118`, `data-model.md:388`, ADR-007.
- Zero sync-contract change: `SYNC_ENTITIES`, every op schema, `MAX_OPS_PER_BATCH` untouched; W-1 not re-opened (**I-1**'s *sync* half, **A-14**).
- The module layout and the boundary tests: `src/domain/strength/*` importing domain only, plus a custom import-graph test in the `progressionBoundary.test.ts` style (**A-15**, **A-16**) — with the note that eslint alone will not enforce I-2.
- One observation per session, never one per set; **lower median** of working-set e1RMs; set count feeds confidence only (**B-3**) — subject to RC-26's honesty note about downward asymmetry.
- `bestE1RM` = all-time max of non-deload observations with an "unconfirmed" label instead of a persisted quarantine state (**B-4**'s best half, **X-5**) — subject to RC-6's `asOf` fix.
- Deloads: computed, badged on the trend, excluded from current/best/suggestion (**B-11**, **O-10**). Verified airtight.
- Equipment eligibility barbell/dumbbell/cable/machine, with `bodyweight` and `other` excluded and a per-exercise switch (**B-9**, **O-2**, **O-7**, **O-8**).
- The 110 % cap and downward rounding as the conservatism mechanism, with the formula chosen for continuity rather than for conservatism (**B-6**'s rounding/cap half, **X-6**). The "no formula is uniformly conservative" analysis is arithmetically verified and is the document's strongest section.
- Separate reason-code enum, separate copy map, the §16.2 refusal list, and the single-formatter rule (**B-10**) — subject to RC-9's reachability fix.
- Every non-goal: N-1…N-8. All correctly scoped.
- The evidence classification (Convention, row 20 required before build) and RG-1…RG-8 — subject to RC-15's two relabellings.

**Not safe to bind** until revised: **B-1** (split, O-1), **B-2**'s RTF ceiling (O-12), **B-5** and **B-7** (RH-1, RH-2, RH-3, RM-4, RM-7), **B-6**'s target-effort half (RM-12), **I-1**, **I-5**, **I-7**, **I-8**, **A-5**, **A-6**, **A-18**, and every §12 fixture that RC-18…RC-22 correct.

---

## 14. What requires research or prototyping first

**Prototyping (no research needed — measurement or a spike answers it):**

1. **Today-bundle latency** (RM-8). Measure the current bundle against the dev database with a realistic catalogue before adding queries; decide O-14 on the number, not on "single-user scale".
2. **The suggestion against real logged history** (already §20 step 3's review gate, and correctly placed). Run the corrected algorithm over the athlete's actual `set_logs` on the local Docker instance and inspect every session where `SUB_MODAL_SETS_EXCLUDED` or `SESSION_SETS_INCONSISTENT` fires — those are where RH-4 bites.
3. **Fire-rate of the suggestion card** (RH-2). After RC-2, replay a full block and count how often the card would have appeared. If it is more than once per scheme change, the gate is still wrong.
4. **Warm-up toggle UX** (§9). Whether the flag should stick across consecutive logs within an exercise is a device-acceptance question, not a design one.

**Research gates (the evaluation's RG-n, all correctly identified) — none of which block v1 shipping as a labelled convention:**

- **RG-1 / RG-2** are the two that must be discharged before any *wording* stronger than "estimate" and before D-1 or D-5. RG-2 is the sharper one: `reps + RIR` as a substitute for reps-to-failure inside a 1RM equation is the single least-supported step in the whole chain, and it is the step every displayed number depends on.
- **RG-3** decides whether the direct/nearby tier structure is doing real work or is decoration.
- **RG-4 / RG-5** ground the 90-day window and the three-session/10-20 % thresholds. Until then they must stay labelled heuristics — which §7.1 does correctly.
- **RG-6** matters only if machine/cable series start looking systematically different in practice.
- **RG-7** gates any copy that generalises beyond "your own history".
- **RG-8** is the only one that could be answered in-app, and it needs D-2 first.

Sources must meet `docs/reviews/warmup-routines-evidence-research.md` §2.2 and enter the registry before any design document cites them — the evaluation states this correctly.

---

## 15. Working-tree and cleanup state

- **Created:** `docs/reviews/estimated-1rm-load-translation-architecture-review.md` (this file). Nothing else in the repository was created, modified, or deleted.
- **Untouched, as required:** the evaluation under review; all source, schemas, migrations, seeds, tests; `docs/evidence/*`; `docs/architecture/*` (including `open-decisions.md` and `evidence-to-design.md`); `docs/input/product-ideas.md`; every existing report in `docs/reviews/`; `HANDOFF*`, `gpt-handoff.md`, `gpt-memory.md`, `CLAUDE.md`, `.claude/`.
- **Pre-existing uncommitted changes preserved exactly** as found at session start: `CLAUDE.md` modified, `HANDOFF.md` deleted, `docs/input/product-ideas.md` modified; untracked `.claude/skills/`, `HANDOFF(depracted).md`, `docs/reviews/estimated-1rm-load-translation-architecture-evaluation.md`, `docs/reviews/warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md`.
- **Scratch work:** an independent JavaScript reimplementation of the proposed algorithm (`e1rm.mjs`), a fixture-recalculation harness (`fixtures.mjs`), a 16-family property/invariant probe suite (`props.mjs`), and six minimal defect reproductions (`repro.mjs`) were written to the session scratchpad **outside the repository** and **deleted after use**. No repository code was imported into them except a faithful transcription of `modalWorkingLoad` so the tie-breaking rule would match. All numbers in §4 and §5 are machine-produced and reproducible from the algorithm as specified in the evaluation's §3/§4/§7/§8/§10.
- **No database was started or contacted**, local or production. **No commit, push, deployment, or production access** was performed. No production service was started.
