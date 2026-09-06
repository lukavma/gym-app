# Estimated 1RM — Release A (Tracker): Independent Adversarial Review

Date: 2026-09-06
Role: independent, adversarial review of the implemented Release A (tracker) against the binding specification. The implementation report (`docs/reviews/estimated-1rm-release-a-implementation.md`, below **the handoff**) was read but not trusted: every number was re-derived, every suite was re-run on a fresh database and a fresh production build, and every invariant and Release-A acceptance criterion was mapped to evidence produced here. No finding was remediated; no specification, report, source, test, migration, or seed file was edited. Nothing was committed, pushed, tagged, or deployed. Production was never contacted.

Repository state reviewed: `main` @ `c52b016` (`docs: record warm-up set device acceptance`) plus the uncommitted working tree exactly as found — the Release A change set and the pre-existing, unrelated documentation changes. A SHA-256 listing of all 576 tracked and untracked files was taken before any action and re-checked at the end (§11).

Binding authority consumed, in full: `docs/reviews/estimated-1rm-load-translation-architecture-revision.md` (below **the revision**, including its owner-decision addendum of 2026-09-05), `docs/architecture/adr/ADR-011-strength-estimation-and-load-translation.md`, `docs/architecture/evidence-to-design.md` row 20, `docs/reviews/estimated-1rm-owner-decision-integration.md` and `…-verification-2.md`.

---

## 1. Verdict

# `READY FOR DEVICE ACCEPTANCE`

No blocking finding. The pure pipeline is behaviourally equivalent to an independent, from-the-text reference implementation over 230,000 randomised reports, except for two knife-edge roundings (F-1) that move a label or a confidence word, never a number. All 22 injected defects in the mutation campaign were caught by the shipped suites. The migration, the seed reconcile, the endpoint's ownership and error semantics, the opt-out, account-timezone calendar days, archived exercises, the copy rules, and phone-width geometry were verified on a fresh PostgreSQL 16 database and a production build. Nothing from Release B is present; nothing is persisted or cached; strength and progression do not import each other.

Seven **Low** findings are recorded (§3). F-1 is a specification deviation of the same class the implementer already fixed once (R-1) and is a two-line change; it is recommended before the commit that ships Release A. F-2 is a disclosed judgment call (JC-2) that needs an explicit owner decision rather than a code change. The rest are copy, cosmetic, or device-acceptance items. None changes a computed value.

---

## 2. Method and evidence

Everything ran against the working tree as found. **Fresh disposable database:** `gymapp_e1rm_review`, created on the local Docker `gym-app-db-1` (PostgreSQL 16.14), migrated, seeded, used for the production build's e2e run and every HTTP probe, then **dropped**. The development database `gymapp` was read once, read-only, with explicit column selects (it has not been migrated to 0011 and was left that way); its row counts (users 1, exercises 106, sessions 649, set_logs 841, migrations 11) are identical before and after. The handoff's own `gymapp_e1rm_verify` database was not touched.

| # | Check | Result |
| --- | --- | --- |
| 1 | `pnpm test:unit` | **756 passed** (53 files), 0 failed |
| 2 | `pnpm test:integration` (PGlite) | **322 passed, 15 skipped** (337; the four `*_CONCURRENCY_DATABASE_URL`-gated files), 0 failed |
| 3 | `pnpm build` | `Compiled successfully`; `/api/exercises/[id]/strength` (242 B) and `/exercises/[id]/strength` (5.16 kB) in the manifest |
| 4 | `pnpm test:e2e` against `next start` on the fresh database (server started once, reused) | **98 passed** (2.0 min), 0 failed — includes the reconnect-idempotence, lost-response, warm-up classification, taxonomy and strength-page specs |
| 5 | `pnpm typecheck`, `pnpm typecheck:sw`, `pnpm lint` | clean |
| 6 | `pnpm format:check` | one pre-existing failure, `src/server/sync/service.ts` (`git ls-files --eol`: `i/lf w/crlf`, `git status` empty for it) — not touched by this change; every changed file passes |
| 7 | Schema drift: `drizzle-kit generate` against a **copy** of `drizzle/` | `No schema changes, nothing to migrate`; copy identical to the repository folder; repository folder byte-identical before/after |
| 8 | `pnpm db:migrate` on the fresh database | 12 ledger rows; `strength_estimate text DEFAULT 'auto' NOT NULL`; `ck_exercises_strength_estimate CHECK (strength_estimate = ANY (ARRAY['auto','off']))` |
| 9 | `pnpm db:seed` ×2 (before and after the account existed) | 93 exercises: **91 `auto`, 2 `off`** — `Assisted Pull-Up` (machine), `Dumbbell Farmer's Carry` (dumbbell) |
| 10 | Independent reference + differential fuzz (§6.1) | 230,000 reports: **0 mismatches** once the reference mirrors the implementation's two pre-comparison roundings; 215 mismatches without, all in those two classes |
| 11 | Hand-built edge fixtures (§6.2) | 18 groups; every hand-computed expectation met except the two rounding cases of F-1 |
| 12 | Mutation campaign (§6.3) | **22 of 22** injected defects caught; 10 mutated files restored with identical SHA-256 |
| 13 | HTTP probes on the production server (§7) | ownership, archived, `asOf`, what-if inputs, opt-out, strict create, CHECK/NOT NULL, methods, timezone extremes, duplicate slot, reconcile-through-seed — all as specified; two informational deviations (F-5, O-C) |
| 14 | Browser probe, Chromium mobile emulation at 390×844, 375×667, 320×568 (§7.6) | horizontal overflow 0 px before and after the what-if; 26/26 rendered estimate lines carry `≈`, a band and `est.`; 0 banned-vocabulary hits; library-row, edit-form and workout-card links present; no suggestion text on the card |
| 15 | Real-history pass over the dev database, read-only (revision §18 step 5) | reproduces the handoff's §18 4(b) figures exactly: 283 completed sessions on 91 eligible exercises → 280 observations, 3 without eligible sets; codes `RIR_MISSING_LOWER_BOUND` 227, `SINGLE_SET_GROUP` 214, `SUB_MODAL_SETS_EXCLUDED` 78, `DELOAD_SESSION` 13, `EXTENDED_REP_RANGE` 2; `TOP_SET_GOVERNS` and `IMPLAUSIBLE_SETS_EXCLUDED` 0 |

Scratch artefacts (the reference implementation, fuzz, fixtures, mutation script, probe scripts, logs, screenshots) live in the session scratchpad outside the repository.

---

## 3. Findings — severity-ranked

No High or Medium finding.

### F-1 (Low) — Two thresholds are compared after rounding; the revision defines no rounding there

**Where.** `src/domain/strength/estimate.ts:160` rounds the "unconfirmed" threshold: `round2(winner.e1rmKg * (1 - BEST_UNCONFIRMED_PCT / 100))`. `src/domain/strength/primitives.ts:57` returns `spreadPct` already rounded to two decimals, and `estimate.ts:190–194` and `:207–208` compare that rounded value against 20 % and 30 %.

**Binding text.** §8.3: "Unconfirmed when no other non-deload past observation has `e1rmKg ≥ best × (1 − BEST_UNCONFIRMED_PCT / 100)`". §11: "Spread is `(max − min) / lowerMedian`" and the caps fire at "> `SPREAD_MEDIUM_PCT`" / "> `SPREAD_LOW_PCT`". Neither defines a rounding step. This is the same class as the handoff's own R-1 (the plausibility ceiling rounded before comparison), which the implementer fixed and pinned with a fixture — the two remaining instances were not treated the same way.

**Reproduction (pure module, `asOfLocalDate = 2026-09-06`).**

| Fixture | Exact rule | Implementation |
| --- | --- | --- |
| `139.36 × 1 @ RIR 0` (day −5) and `125.42 × 1 @ RIR 0` (day −10) | threshold 125.424; 125.42 < 125.424 → **unconfirmed**, `BEST_UNCONFIRMED` | threshold rounded to 125.42 → **confirmed**, no code |
| `3 × 100×10 @ RIR 0` (days −9, −6) and `3 × 120×10 @ RIR 0` (day −3): pool `[133.33, 133.33, 160.00]` | spread 20.003 % > 20 → `ESTIMATE_SPREAD_WIDE`, confidence **medium** | `poolSpreadPct` 20.00 → no spread code, confidence **high** |
| fuzz report #8067 (seed 20260906): pool `[173.33, 133.33]` | spread 30.00075 % → `ESTIMATE_SPREAD_VERY_WIDE`, **low** | 30.00 → `ESTIMATE_SPREAD_WIDE`, **medium** |

In 200,000 seeded random reports the first class fired 150 times and the second 43 times (§6.1). Both move in the **non-conservative** direction: a best looks confirmed when it is not, and a spread reads one level calmer with a higher confidence word.

**Impact.** A label (`BEST_UNCONFIRMED`) and the confidence word / spread code, at a knife-edge of 0.005 kg or 0.005 percentage points. No number changes; no invariant is broken. Reachable in practice because e1RMs sit on a 0.01 kg grid and `×0.9` of a value ending in `.x7` lands exactly on `.003`.

**Remediation (not applied).** Compare the unrounded product and the unrounded ratio; keep `poolSpreadPct` rounded for the DTO only. Add the two fixtures above as negative controls. Release A has not shipped, so the `algorithm.version` need not bump for the fix.

### F-2 (Low, owner decision) — The what-if calculator omits the §9.5 step-4 global cap (handoff JC-2)

§15.1 (binding) specifies the calculator as "reps + RIR → load from the current estimate **with the same rules and codes**"; §9.5 step 4 says the 1.10 × heaviest-admitted-load cap "applies to **every** tier (evaluation O-3 accepted)". The calculator applies §9.4's target bounds, the finite guard, the floor and the band (verified, §6.2 E13) but not step 4. Consequence (E14): after `5 × 110×5 @ RIR 3,3,2,2,1` (current 139.33) the calculator answers **125 kg** (band 112.5–140) for `1 rep @ RIR 2`, while 1.10 × the heaviest load the athlete has handled in the window is **121**. The handoff's argument — I-8 and §9.6 scope the caps to a *suggestion*, and the calculator has no basis, tier, or firing condition — is defensible, and the number is labelled, banded and never invited as an attempt (`TARGET_RTF_MIN = 3` holds). But the binding text reads the other way, and the disclosure lives only in the handoff. **The owner should either record JC-2 as an accepted deviation in the revision/ADR or have step 4 applied to the calculator** (step 3 is inapplicable — there is no basis load; step 2 is an identity). Not blocking.

### F-3 (Low) — `NO_RECENT_EVIDENCE` copy is false when the only in-window sessions are deloads

`src/domain/strength/estimate.ts:177` emits `NO_RECENT_EVIDENCE` whenever no *non-deload* observation is in the window; `src/ui/strength/copy.ts:51` renders it as "No sessions in the last 90 days". With one deload session three days old (E6) the page prints that sentence directly above a trend list that shows the deload row. The code is right (§15.4: "observations exist, none in the window" — counted ones); the sentence is not. Suggest "No counted sessions in the last 90 days" or similar.

### F-4 (Low) — The band note presents a convention as a measured statistic

`src/ui/strength/copy.ts:144`: "The range spans one standard deviation of estimation error either side." K-03 tags the noise magnitude **[E*]** (provisional EVIDENCE-032/034/035/036) and the value 10 **[P]**; §2 says nothing tagged [E*] may reach copy as evidence, and row 20's not-justified column forbids presenting any band as "calibrated to anything beyond one noise unit". The sentence does not say "research shows", and the band is exactly one noise unit, so it sits at the edge of the rule rather than over it — but "one standard deviation of estimation error" reads as a measurement. Suggested wording: "The range is a ±10 % convention, not a measured error."

### F-5 (Low) — A malformed exercise id returns HTTP 500

`GET /api/exercises/not-a-uuid/strength` → 500 (`invalid input syntax for type uuid` from Postgres). The pre-existing `GET /api/exercises/not-a-uuid` behaves identically, so this is an inherited repository pattern, not a regression; the page's client renders "Failed to load the strength estimate." and a bad id can only arrive by hand-editing the URL. Optional hardening: validate the segment and answer 404 (§14.4's "404 otherwise" reading).

### F-6 (Low, device acceptance) — The calculator's controls are small touch targets

At 390 px the two what-if inputs measure 111×26 px and the "Show the load" button 94×24 px (the shared `Button` is `py-3 text-base`, ≈ 44 px). The three "Strength estimate" entry links are 20 px `text-xs` links. Below the 44 pt iOS guideline the rest of the workout surface follows. The handoff's §8 already lists the calculator's iOS keyboard as an un-run device check; the target size belongs on the same list, and is best judged on the device.

### F-7 (Low, cosmetic) — Estimate-level reasons after the first render below the "Best" card

`StrengthScreen.tsx:179–187` renders `reasonCodes[1..]` between the Best card and the calculator, so "Based on a single set" (a pool flag) appears directly under "Best … 4. Sept. 2026" in the 390 px screenshot and reads as a qualification of `best`. Moving the list under the Current card (or into it) removes the ambiguity.

### Observations (not findings)

- **O-A** Future-only observations (all after `asOf`) yield `NO_ELIGIBLE_SETS`; §15.4's "no observation exists" vs "observations exist, none in the window" does not say which applies. Reasonable, deterministic, consistent with I-6.
- **O-B** V-9 is silent on an e1RM tie between the modal group and an admitted heavier group; the implementation lets the heavier load govern and flags `TOP_SET_GOVERNS` (and `SINGLE_SET_GROUP` when it has one set) — the conservative-disclosure direction (E9).
- **O-C** Unknown query parameters are ignored, not rejected: `parseStrengthQuery` copies only the three known keys, so `strengthQuerySchema`'s `.strict()` is never reached by an unknown key (`?foo=1` → 200). Harmless; the unit test "rejects unknown parameters" exercises the schema, not the endpoint.
- **O-D** No API GET in this app sets `Cache-Control` (`/api/exercises`, `/api/history`, `/api/today-bundle` behave the same); the service worker serves `/api/*` `NetworkOnly` and no validator header exists, so nothing caches the estimate. Repository-wide convention, recorded for completeness.
- **O-E** JC-3 (trend list window-scoped, with the older-session count) and JC-4 (spread and freshness pairs emitted as disjoint levels) are literal deviations from §15.1/§15.4 that change no number and no confidence; both are disclosed in the handoff and are acceptable. The owner may wish to note them in the revision so the document and the code agree.
- **O-F** I-2 names four fact tables; the service additionally reads `users.timezone` — required by V-10 and the same read `volume/service.ts` performs. Not a boundary concern.
- **O-G** The same exercise in two slots of one session merges into one observation (H10: `3 × 100×5 @ RIR 2` in slot 0 + `120×3 @ RIR 1` in slot 1 → groups 100 (3, admitted) and 120 (1, admitted), value 136.00, `TOP_SET_GOVERNS`). The "first three" of a load group can interleave slots because set numbers restart per slot; deterministic (rows ordered by position then set number) and consistent with "one observation per session".
- **O-H** The plausibility band excludes a real top set when back-off sets are far below it: `2 × 80×8 @ RIR 2`, `100×5 @ RIR 2`, `120×3 @ RIR 2` → the 120 kg group (140.00) is `IMPLAUSIBLE` against the modal 80 kg group (106.67 × 1.20 = 128.00) and the session reads 123.33 (E8). This is V-7 working as bound (D-12 revisits the factor after one block of data), recorded so it is a known consequence.

---

## 4. Invariants (§21.1) → evidence

| Invariant | Evidence produced here | Status |
| --- | --- | --- |
| I-1 nothing persisted / nothing enters the outbox | `git status` and `git diff 7d6bc6c HEAD` empty for `src/domain/sync`, `src/server/sync`, `src/sync`, `src/domain/progression`; boundary suite's column grep over `src/db/schema` and `drizzle/*.sql` (only `strength_estimate` added); service issues two `select`s and one joined `select`, no write; the one write path (`reconcileStrengthEstimates`) touches the opt-out column only | ✅ |
| I-2 reads the four fact tables, never `recommendations` | service source; boundary test (`recommendations` absent from `src/server/strength/**`, with a positive control on the progression service); mutation M15 proves the import walk fires | ✅ (plus `users.timezone`, O-F) |
| I-3 progression behaviour-identical | `src/domain/progression/**` byte-identical to `c52b016` and to `7d6bc6c`; `progressionMatrix`, `workingTargets`, `carryForward`, three `warmupSetClassification` suites unmodified and green (A-29) | ✅ |
| I-4 algorithm stamp on every DTO | `estimate.algorithm` and `report.algorithm` = `{e1rm-epley-rir, 1, epley}` in the unit fixture, the integration test and the live HTTP response | ✅ |
| I-5 determinism | fuzz shuffles every session's set order and the session order in all 230,000 reports and compares whole reports; `(performedOn, startedAt ms, sessionId)` tiebreak pinned by E12; server query ordered by `(started_at, position, set_number)` | ✅ |
| I-6 `current ≤ best`; deloads count nowhere; nothing after `asOf` | reference derives both from the same population (0 mismatches); E11 (window edges, future, stale); mutations M8, M9, M22 caught | ✅ |
| I-7, I-8 (`suggestStartingLoad`) | not implemented — Release B; the what-if honours the floor (M21) but not the caps (F-2) | n/a (B) |
| I-9 no reported RIR altered | `rir` passes through untouched; `medianRir` is the lower median of integers; RTF = `reps + (rir ?? 0)`; E1, E16; fuzz equivalence | ✅ |
| I-10 every displayed value labelled and banded | `formatEstimate`/`formatTranslatedLoad` tests; M17 caught; 26/26 rendered lines on the live page carry `≈`, a band and `est.` at three widths | ✅ |
| I-11 prefill chain / snapshot / implicit decision untouched | `src/sync/activeSession.ts`, `src/server/today/service.ts`, `src/domain/progression/**` unmodified; no **Use** control (browser probe) | ✅ |
| I-12 value invariant to sets 4+ | E10 (sets 4–5 at RIR 0 do not move 126.67); A-3 fixtures; M6 caught | ✅ |
| I-13 excluded groups never contribute | E7, E8, E18; A-4 fixtures; M11 caught; fuzz (102k sub-modal, 22.7k implausible cases) | ✅ (suggestion half n/a) |
| I-14 enum exactly §15.4's 48; nothing outside it emitted | completeness test both ways; reachability of all 29 Release-A codes with the 19 Release-B codes declared as unreachable; M14 and M20 caught | ✅ |

---

## 5. Acceptance criteria (§21.2) → evidence

| A | Tag | Evidence | Status |
| --- | --- | --- | --- |
| A-1 | Domain, A | `strengthPrimitives.test.ts` values plus six independent hand values; E1 table; reference `f(1)=1` | ✅ |
| A-2 | Domain, A | E1: RTF 12 in / 13 out at both 12@1 and 11@2, RIR 5 → `highRir` (checked before RTF), 0 kg → `zeroLoad`, warm-up first, 12@null in; M2, M12, M16 | ✅ |
| A-3 | Domain, A | E10; shipped fixture; M6 | ✅ |
| A-4 | Domain, A | shipped fixtures (158.67 / 135.67 / 135.67 / 160.00) plus E4 (exact-equality admission), E7, M1, M7, M11 | ✅ |
| A-5 | Domain, A | shipped test; fuzz shuffles with 20 % identical instants | ✅ |
| A-6 | Domain, A | E11 (future row moves nothing, never stale); M9 | ✅ |
| A-7 | Domain, A | E11 (−89 in, −90 out); M3; real-Postgres timezone matrix (§7.4) | ✅ |
| A-8 | Domain, A | shipped fixtures reproduce; reference equivalence on lower-median pools | ✅ |
| A-9…A-18 | B | absent by design (§8) | n/a |
| A-19 | A+B | completeness ✅ both directions; reachability: 29 emitted + 19 declared deferred = 48; M14/M20 | ✅ (A half) |
| A-20 | Integration, A | shipped test reclassifies (`isWarmup`), re-weights and deletes through `applySyncBatch` / `buildSetDeletionOps`, snapshotting `exercises`, `workout_sessions`, `session_exercises`; green in the full run and in every campaign run | ✅ |
| A-21 | Integration, A | asserted structurally (import graph from the sync/active-session/today-bundle roots reaches no strength code; synthetic edge fires) rather than by a query log — a stronger claim than the criterion asks for | ✅ (form differs) |
| A-22…A-24 | B | absent | n/a |
| A-25 | Integration, A | integration test plus live HTTP: foreign/missing → 404, archived → 200 with `archivedAt`, `asOf=abc` and date-only → 400, future clamped and echoed, past honoured, offset form accepted | ✅ |
| A-26 | Wire, A+B | sync schema, sync service, client sync, progression: byte-identical to `7d6bc6c` (`git diff --stat` empty); reconnect-idempotence and lost-response e2e suites in the 98 | ✅ |
| A-27 | Boundary, A | boundary suite; M15; grep finds no e1RM/suggestion/confidence column | ✅ |
| A-28 | UI, A | copy suite (M13, M17 caught); live-page scan at three widths: 0 hits for `1RM`, `PR`, `personal record`, `recommend`, `research shows`, `declin`, `accurate`, `precise`, `scientifically`, `predicted`, `will lift`, `you can lift` | ✅ |
| A-29 | Negative control | the named suites are unmodified (`git status`) and green | ✅ |
| A-30 | Negative control, A | shipped tests; live HTTP: `off` → `EXERCISE_ESTIMATE_DISABLED` everywhere (estimate, what-if, empty trend), `bodyweight/auto` → `EXERCISE_CATEGORY_UNSUPPORTED` | ✅ |
| A-31, A-32 | B | absent | n/a |

---

## 6. Estimator stress test

### 6.1 Independent reference and differential fuzz

A reference implementation of §5–§8, §9.4/§9.5 (what-if), §11 and the §15.4 observation/estimate tables was written from the revision's text alone, sharing no primitive with the repository, and driven against `deriveStrengthReport` with a seeded generator: loads from {0, 11, 20, 60, 80, 100, 100.01, 105, 110, 110.01, 115, 120, 130, 132.02, 140, 1100} clustered so multi-set groups arise, reps 1–15 with 5 % at 90, RIR from {null, 0–6, 10}, 15 % warm-ups, 15 % deloads, dates clustered on the window and freshness edges (−95…+3 days) with 20 % identical instants, shuffled set and session order, equipment including `bodyweight`/`other`, 10 % `off`, load steps {0.5, 1, 2, 2.5, 5}, a what-if in half the reports.

| Run | Reports | Mismatches | Classes |
| --- | --- | --- | --- |
| seed 20260906 | 30,000 | 22 | unconfirmed-threshold rounding, spread-threshold rounding |
| seed 1 | 100,000 | 87 | 68 unconfirmed, 19 spread |
| seed 77 | 100,000 | 106 | 82 unconfirmed, 24 spread |
| seed 1, reference mirrors the two roundings | 100,000 | **0** | — |
| seed 77, reference mirrors the two roundings | 100,000 | **0** | — |

Coverage in the 200,000-report pair: 300,753 observations; `TOP_SET_GOVERNS` 6,024; `IMPLAUSIBLE_SETS_EXCLUDED` 22,703; `SUB_MODAL_SETS_EXCLUDED` 102,445; `MIXED_LOADS_IN_SESSION` 7,826; deload observations 45,094; `HIGH_REP` 164,796; `HIGH_RIR` 156,880; sessions with warm-ups 135,541; zero-load 33,688; ineligible exercises 65,300; what-if ok 39,476 / refused 60,487; full three-session pools 44,641; spread codes 56,699; aging 14,635; old 18,415; unconfirmed 83,028. Whole reports were compared: current, best (value, date, session, unconfirmed), confidence, code set, pool ids, spread, age, stale and deload counts, trend order, every observation's value, governing load/reps/RIR, flags, counts and every group's load, count, modal reps, median RIR, completeness, e1RM, status and roles, `sessionsWithoutEligibleSets`, and the what-if.

### 6.2 Hand-built edge fixtures (expectations computed before running)

| Group | Fixture | Result |
| --- | --- | --- |
| E1 | set-classification boundary table (16 rows) | as §6.2 in every row, including RIR 5 checked before RTF and warm-up before zero load |
| E2 | unconfirmed threshold at 125.424 | **F-1** |
| E3 | spread exactly 20.003 % | **F-1** |
| E4 | supra group e1RM exactly on the 1.20 ceiling (`3 × 110×1` + `132×1`) | admitted and governs; 132.01 → implausible ("at most" is inclusive) |
| E5 | future-only observations | `NO_ELIGIBLE_SETS`, nothing counted (O-A) |
| E6 | deload-only window | `NO_RECENT_EVIDENCE` + `DELOAD_SESSIONS_EXCLUDED`, deload row on the trend (**F-3** copy) |
| E7 | two supra-modal groups, one plausible, one not | 120 kg group governs (136.00), `TOP_SET_GOVERNS`, implausible count 1 |
| E8 | top set 31 % above back-offs | excluded as implausible (O-H) |
| E9 | modal / supra e1RM tie | heavier governs, flagged (O-B) |
| E10 | sets 4–5 at RIR 0 after RIR 3,3,3 | value 126.67 unchanged, `medianRir` 3, positions 3 |
| E11 | −89 / −90 / +1 / today | pool {in89, today}; best = the −90 row (all-time); stale 1; trend excludes future and −90 |
| E12 | four same-day sessions | pool drops the earliest instant; order `(performedOn, startedAt, sessionId)` both ways |
| E13 | what-if RTF 2/3/13/15/16 | refuse / ok / extended / extended / refuse; band brackets the raw value |
| E14 | what-if 1 rep @ RIR 2 vs 1.10 × heaviest load | 125 vs 121 (**F-2**) |
| E15 | equal best on one day | earliest wins |
| E16 | reps {8, 5, 5}, RIR {2, null, 4} | modal reps 5, median RIR 2, `rirComplete` false, both RIR flags |
| E17 | warm-ups interleaved at the working load | positions are the first three *eligible* sets (2, 4, 5); value 120.00; no moderate flag |
| E18 | three sub-modal groups | `subModal` counts every excluded set (3) |

### 6.3 Mutation campaign — are the shipped tests load-bearing?

Each mutation was applied by exact-string replacement that aborts unless the text occurs exactly the expected number of times, the ten strength unit files (or the strength integration file) were run, and the file was restored from saved bytes and hash-checked.

| Mutation | Caught by |
| --- | --- |
| M1 modal tie → earliest | `strengthObservation` ×2 |
| M2 `RTF_MAX` 12 → 15 | constants, observation, estimate headline, reason-code reachability |
| M3 window −89 → −90 | `strengthEstimate` window test |
| M4 `performedOn` resolved in UTC | integration "ACCOUNT timezone, not UTC" |
| M6 `GROUP_SET_POSITIONS` 3 → 100 | constants, three observation tests, estimate headline |
| M7 plausibility ceiling rounded (R-1 regression) | "compares against the UNROUNDED plausibility ceiling" |
| M8 deloads admitted to the pool | "keeps a deload observation out of the pool, current and best" |
| M9 `asOf` bound removed | "ignores an observation dated after asOf" |
| M10 ownership predicate dropped | integration "another user's exercise" |
| M11 sub-modal exclusion removed | four observation tests, reason-code reachability |
| M12 `RIR_ELIGIBLE_MAX` 4 → 5 | constants, `classifySet`, reachability ×3 |
| M13 "PR" enters a copy string | both copy scans |
| M14 `SINGLE_SET_GROUP` emitter removed | observation ×2, estimate headline, reachability ×3 |
| M15 strength service imports `evaluateSession` | boundary ×2 |
| M16 `is_warmup` no longer excludes | three observation tests |
| M17 `est.` dropped from the formatter | four formatter tests |
| M18 single-session confidence low → medium | confidence test |
| M19 `asOf` accepts any string | query test |
| M20 a Release-B code reclassified as Release-A | reachability ×2 (JC-5 guard is real) |
| M21 what-if floors → nearest | five what-if tests |
| M22 `best` no longer excludes deloads | deload test |
| M23 pool flags not propagated | confidence-flag test, estimate headline |

22 applied, 22 caught, 0 survived. (M5 was folded into M21.) The handoff's own mutation (`PLAUSIBILITY_FACTOR` 1.20 → 1.50) is covered by M7's neighbour fixtures and the constants table and was not repeated.

---

## 7. Migration, data, endpoint, opt-out, UI

### 7.1 Migration, schema, default, reconcile (O-2, §14.4)

- `drizzle/0011_happy_celestials.sql` is DDL only (column + CHECK); the journal and `0011_snapshot.json` are consistent (drift check clean).
- On the fresh database the column carries `DEFAULT 'auto' NOT NULL` and the CHECK; a direct `UPDATE … SET strength_estimate = 'on'` fails with `23514`, `NULL` fails the NOT NULL constraint.
- **Reconcile location (handoff JC-1).** The revision §14.4 words the reconcile as "in the same migration … via their deterministic `slugToUuid` ids"; ADR-011 words it as "an additive column … with a one-shot reconcile" without placing it. The two halves of §14.4 cannot both be met in SQL (the id is SHA-1 of `exercise:<user>:<slug>`; core PostgreSQL has no `sha1`), and ADR-010 ruled on exactly this: name matching and `pgcrypto` are both rejected, the accepted mechanism is a `runSeed` step keyed by `seededExerciseId`. The implementation follows that precedent. Verified end to end on Docker PostgreSQL 16: the seeded `Assisted Pull-Up` was set back to `'auto'` **and renamed** to "Renamed Helper" by SQL, `pnpm db:seed` was run, and the row came back `'off'` with the new name intact; a user-authored exercise named exactly `Assisted Pull-Up` created through the real API stayed `'auto'`. `deploy.yml` runs `db:migrate` then `db:seed` (lines 106, 109), so the reconcile runs wherever the migration does. Consequence to state: the reconcile re-asserts `'off'` on every deploy for those two rows, overriding a deliberate `'auto'` — which is the §6.1 rule ("Must be `'off'`"), not a fight with the user. **Accepted deviation; the owner may want §14.4's wording aligned with ADR-011's.**
- Catalog: `strengthEstimate: "off"` on exactly the two slugs; every other entry takes the column default (unit test plus the 91/2 count on the fresh database).

### 7.2 Ownership and error semantics (§14.4, RL-10, A-25)

Unauthenticated → 401. Another user's or a missing id → 404 (indistinguishable; the predicate is in the WHERE clause, M10 proves the test sees its removal). Archived → served with `archivedAt`. `asOf`: `abc` and `2026-09-01` → 400; `2099-01-01T00:00:00Z` → 200 with `asOf` echoed as server now; a past instant honoured and echoed; `+02:00` offsets accepted and normalised. What-if: one input alone, a non-numeric, a fractional or out-of-range value → 400; a log-able but unusable target (`100 @ 10`) → 200 with `TARGET_OUTSIDE_FORMULA_DOMAIN`. `POST`/`DELETE` → 405. Malformed id → 500 (F-5, inherited).

### 7.3 Exercise opt-out (V-3, O-2, O-4, A-30)

`PATCH {strengthEstimate:"off"}` → 200 and the next GET refuses everywhere with one code; `"on"` → 400 (Zod enum); back to `"auto"` restores the series unchanged (nothing was written). `POST /api/exercises` with the key → 201 and `strengthEstimate: "auto"` — `createExerciseSchema` strips it, so a new exercise never takes the value (O-4: edit form only). The edit form's `<select>` offers exactly "Automatic (where the equipment allows)" / "Off for this exercise" and sits after the contribution editor (the positional-locator reason given in the handoff holds: `muscleTaxonomyV2.spec.ts` passed unmodified).

### 7.4 Account-timezone calendar days on real Postgres (V-10, O-13)

Two sessions on one exercise: `s1` at `2026-09-05T23:00Z` (`3 × 100×5 @ RIR 2` → 123.33) and `s2` at `2026-06-08T22:30Z` (`3 × 90×5 @ RIR 2` → 111.00); `users.timezone` switched between requests; requested `asOf = 2026-09-06T12:00Z` was in the server's future and was clamped to server now (≈ `00:55Z`), which the echoed `asOf` showed.

| Zone | `asOfLocalDate` | `s1` dated | `s2` dated | `s2` in window? |
| --- | --- | --- | --- | --- |
| Europe/Ljubljana (+2) | 2026-09-06 | 2026-09-06 | 2026-06-09 | yes (89 days) |
| UTC | 2026-09-06 | 2026-09-05 | 2026-06-08 | **no** (90 days) — stale 1 |
| Pacific/Pago_Pago (−11) | 2026-09-05 | 2026-09-05 | 2026-06-08 | yes (89 days) |
| Pacific/Kiritimati (+14) | 2026-09-06 | 2026-09-06 | 2026-06-09 | yes |

With `asOf = 2026-09-05T21:30Z` under Ljubljana (local 23:30 on the 5th) every session dated the 6th disappears, `current` falls back to `s2` and its age reads 88 days — the window and the ages move with the account's calendar, not with UTC (M4 proves the integration test guards this).

### 7.5 Read-only recomputation (§14.1, A-20)

Edits, reclassification and deletion through the real sync path change the next read (shipped integration test, green here and under every campaign run); discarding a session removes it; in-progress sessions never enter (N-5). The service has no write; the boundary suite proves the completion path cannot reach it; no cache, `revalidate`, or `unstable_cache` exists in the feature (grep), and the SW treats the endpoint as `NetworkOnly` (`src/app/sw.ts:278–286`).

### 7.6 UI copy, provenance, and mobile geometry (§15, A-28)

Rendered page (Chromium, iPhone-class emulation): heading, exercise name, Current with `≈ 117.5 kg (likely 105–130) est.` + confidence + first reason, disclaimer, Best with date, the remaining reasons (F-7), the calculator with its band note (F-4), the sparkline, the trend rows in the app's own set format (`100 kg × 5`, `120 kg × 3 @ RIR 1`, "Not used: 105 kg × 5 (1)" for excluded groups, deload rows badged and dimmed), the 90-day and older-session counts, and the footer ("Based on the last 90 days of training.", "Most recent counted session today.", the unit-convention line, the deload sentence, `Algorithm e1rm-epley-rir v1`, "Estimates only — not tested maxes."). Horizontal overflow 0 px at 390, 375 and 320 px before and after a what-if round trip; the what-if renders `≈ 87.5 kg (likely 80–100) est.` with "Rounded down to the load step"; a near-maximal target renders its refusal line. Provenance: every trend row exposes its governing group, excluded groups as excluded, and its codes; the DTO carries `groups[]` with positions, statuses and roles for every observation.

---

## 8. Release B did not leak; nothing is persisted; strength stays separate from progression

| Claim | Evidence |
| --- | --- |
| No `suggestStartingLoad`, no `startingSuggestion` / `strengthEstimate` bundle field, no `resolveCarryForwardCandidate`, no `carryForwardRepBasis` | `grep -rn` over `src/` and `tests/`: the only hits for `strengthEstimate` are the column, catalog, seed, Zod schema, exercise service/DTO and edit form; `TodayBundleExerciseEntry` (`src/server/today/service.ts:71`) and `TodayBundleExerciseEntryDto` (`src/sync/types.ts:68`) unchanged |
| No **Use** action, no card line | workout card shows the prescription, one "Strength estimate" link, warm-up toggle, inputs and Log only; page text contains neither "Starting suggestion" nor "Use" |
| No active-session freeze | `src/sync/activeSession.ts` unmodified |
| No sync / outbox change | `src/domain/sync`, `src/server/sync`, `src/sync` byte-identical to `7d6bc6c`; `SYNC_ENTITIES`, op schemas, `MAX_OPS_PER_BATCH` untouched; the reconnect and lost-response e2e suites pass |
| No recommendation interaction, no progression trigger | `src/domain/progression/**` and `src/server/progression/**` unmodified; strength service never names `recommendations`; import graph has no edge in either direction (boundary suite, M15) |
| No batched bundle query, no bundle latency change | `src/server/today/service.ts` unmodified |
| No aggregate / cache persistence | schema and migrations carry no e1RM, suggestion or confidence column (grep with a positive control); feature code has no cache primitive; estimate recomputed on every GET (edits change the next read) |
| Release-B codes declared but unreachable | 19 codes in `RELEASE_B_ONLY_REASON_CODES`; the reachability test fails if any is emitted early or any Release-A code loses its emitter (M14, M20) |
| Release-B constants declared but unused | K-13…K-17, K-22…K-24, `SUGGESTION_NOISIER_EQUIPMENT` exist per §16 ("the whole table is this module's surface"); nothing in Release A reads them (the constants test says so and the fuzz reference needs none) |

---

## 9. The handoff's judgment calls, assessed

| JC | Assessment |
| --- | --- |
| JC-1 reconcile in the seed | Correct call, ADR-010 precedent, verified on Docker PG16 (§7.1). Record the wording alignment. |
| JC-2 what-if without §9.5 steps 2–4 | Defensible but contrary to §15.1's literal text → **F-2**, owner decision. |
| JC-3 window-scoped trend | Acceptable; `best` outside the window is still shown with its date (O-E). |
| JC-4 disjoint spread / freshness levels | Acceptable; confidence identical either way (O-E). |
| JC-5 reachability as "reached or exactly the declared deferred set" | Stronger than the literal A-19 and genuinely load-bearing (M14, M20). |
| JC-6 link accessible names / select placement | Holds: 98 e2e green, one "Strength estimate" link per row when the library is narrowed; the taxonomy spec's positional locators unaffected. |
| JC-7 "less certain" instead of "less precise" | Correct: §15.2 bans the word in any form. |

Handoff claims re-checked and confirmed: the §18 4(b) prototype figures (§2 row 15); the CRLF explanation of the `format:check` failure; the page-not-`NetworkOnly` deviation (pages are `NetworkFirst`, the endpoint `NetworkOnly` through the generic `/api/` entry); the 91/2 seed count; all eleven verification rows. Not verifiable here and still open, as the handoff says: the physical-iPhone checks (legibility at real pixel density, the numeric keyboard on the calculator, the toggle's touch target, an exercise switched off and a top-set/back-off session viewed on the device) — F-6 adds the calculator's target size to that list.

---

## 10. What this review did not do

- No physical device was used (§18 step 7 items remain for device acceptance).
- The suggestion (Release B) invariants I-7/I-8 and criteria A-9…A-18, A-22…A-24, A-31, A-32 were confirmed absent, not tested.
- The evidence status of EVIDENCE-032…037 (provisional) was not re-examined; the copy check above only confirms no copy presents them as research (F-4 is the one borderline sentence).

---

## 11. Working-tree impact

Created: `docs/reviews/estimated-1rm-release-a-review.md` (this file). **Nothing else in the repository was created, modified, staged, formatted, reverted, or deleted.** The mutation campaign's ten files (`constants.ts`, `eligibility.ts`, `estimate.ts`, `observation.ts`, `query.ts`, `reasonCodes.ts`, `whatIf.ts`, `src/server/strength/service.ts`, `src/ui/strength/copy.ts`, `src/ui/strength/format.ts`) were restored from saved bytes after each mutation with SHA-256 verification, and the 576-file SHA-256 listing of every tracked and untracked file taken at the start matches the listing taken after all work, line for line. Every pre-existing uncommitted change — `CLAUDE.md`, the deleted `HANDOFF.md`, the architecture/evidence/input/research-note documents, the untracked reports of this lineage, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md` — and every Release A file is exactly as found. `.next/` (refreshed by this pass's `pnpm build`) and `test-results/` are gitignored tooling artefacts.

Databases: the disposable `gymapp_e1rm_review` was created, used, and **dropped**; the development database `gymapp` was read once (read-only, explicit columns, not migrated) and its row counts are unchanged; the handoff's `gymapp_e1rm_verify` was not touched; production was never contacted. The production server started for the probes was stopped (port 3000 free). No commit, push, tag, or deployment.

---

# `READY FOR DEVICE ACCEPTANCE` — no blocking finding; seven Low findings recorded (F-1 recommended before the Release A commit; F-2 needs an owner decision)
