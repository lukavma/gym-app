# Metrics Dashboard — Independent Adversarial Review of the Architecture Evaluation

Date: 2026-09-06
Role: independent, adversarial review of `docs/reviews/metrics-dashboard-architecture-evaluation.md` (677 lines, dated 2026-09-06) against the repository it claims to describe.
Reviewed repository state: `main` @ `1282795` (`feat: add estimated 1rm tracker`), plus the pre-existing uncommitted working-tree changes, which were **not** touched.
Scope of this document: review only. No source, schema, test, architecture-document, backlog, or evaluation file was modified. No production system was contacted. Two read-only probes were run (Appendix B) and left no artifact in the repository.

---

## 1. Verdict

# `REVISION REQUIRED`

**The architecture is right and should be built as proposed.** One read-only screen, one composed read-only endpoint, everything computed on read from tables and pure modules that already exist, no migration, no persisted aggregate, no cache, no sync or Today-bundle change, no charting library, no readiness score and no correlation — every one of those boundaries survived checking, and several are better supported by the repository than the evaluation itself claims. The five-card set, the metric definitions, the account-timezone handling, the archived-exercise posture, the recovery-card restraint and the online-only posture are all correct. **Nothing in this review asks for a different design.**

It is `REVISION REQUIRED`, not `READY FOR OWNER DECISIONS`, because the document's own binding sections contradict each other in ways an implementer would hit immediately:

1. **RH-1 — two binding acceptance criteria are jointly unsatisfiable.** M-1 adds a future-session guard (`started_at < instant(D + 1)`) that `getWeeklyVolumeReport` does not have. A-1 therefore asserts a future-dated completed session "counts nowhere", while A-11 requires that same session to be counted in `metrics.volume.weeks`. One fixture cannot satisfy both, and invariant **I-6** ("The dashboard introduces no date, week, or eligibility rule of its own") is false as written.
2. **RH-2 — the query plan contradicts the metric definitions and empties a negative control.** §4 states that warm-up exclusion for M-2 is "a pure-domain decision, provable by fixture (the volume … precedent)"; §11.2 step 3 puts `is_warmup = false` *and* `count(*) … grouped` in SQL. Under that plan the domain never sees a set row, so A-2's `(Domain)` warm-up clause proves nothing, and the cited precedent is inverted rather than followed.

Alongside those, eight further defects (RM-1…RM-8) weaken claims the document marks binding — an ambiguous DTO shape, a statement bound whose protective power is misattributed, a determinism invariant stronger than the code it reuses, two differently-defined "Deload" badges on one screen, an `I-10` violation on the rendered Recovery card, a dropped ownership predicate, a copy rule that collides with the design's own vocabulary, and a latency budget attributed to hardware it is not measured on.

Every fix is editorial or a one-line query change. None touches the design, the boundaries, the endpoint count, or the intent of the invariant set. Expect roughly ten edits confined to §4, §8, §11, §13, §14, §15, §16, §19 and §20.

**The O-1…O-10 answers do not depend on the fixes** and can be given in parallel (§5). This review agrees with the evaluation on eight of ten and differs on two (O-2's presentation and O-10's card order), for measured reasons.

---

## 2. Severity-ranked findings

### High

| ID | Finding | Where |
| --- | --- | --- |
| **RH-1** | M-1's future-session guard has no counterpart in Volume; **A-1** and **A-11** are jointly unsatisfiable and **I-6** is false | §3.1 |
| **RH-2** | §11.2 step 3 decides warm-up exclusion and the count in SQL, contradicting §4's "pure-domain decision" rule and emptying **A-2** | §3.2 |

### Medium

| ID | Finding | Where |
| --- | --- | --- |
| **RM-1** | The volume section of the DTO is specified as 5 weeks in §4 and 2 weeks in §11.1/§11.2/A-11 | §3.3 |
| **RM-2** | **A-12**'s "≤ 16" carries almost none of the load it is credited with; the boundedness clause does, and only on a fixture with enough in-window exercises. "The bound has no headroom" is false on every reachable branch | §3.4 |
| **RM-3** | **I-11**/**A-6** claim order-independence the reused strength pipeline does not provide; determinism rests on step 8's `ORDER BY`, which the invariant omits | §3.5 |
| **RM-4** | Two different definitions of "Deload" render under one word on one screen; §8 discloses only one of the two divergences | §3.6 |
| **RM-5** | **I-10** ("every average carries its entry count") is violated by the Recovery card's own wireframe line | §3.7 |
| **RM-6** | §11.2 step 9 drops the `exercises.user_id` predicate that the sibling endpoint treats as load-bearing (ADR-011 review RL-10) | §3.8 |
| **RM-7** | §15's lexical bans are applied to *source*, and three of them collide with the design's own vocabulary; the "must appear" assertions cover sentences §15 says are imported, not typed | §3.9 |
| **RM-8** | **A-25** measures on the dev machine and reports pass/fail against a budget stated for B1/B1ms hardware | §3.10 |

### Low

| ID | Finding |
| --- | --- |
| **RL-1** | The 90-day bodyweight series has no text equivalent; §13's "every number is text … (the existing component's rule)" does not transfer, because the strength page satisfies that rule via its observation list |
| **RL-2** | "a gap is visible spacing, never interpolated" (M-9) is not what the sibling component draws — a `polyline` across a 10-day gap *is* a visual interpolation |
| **RL-3** | **A-10** and **A-16** disagree on whether the route's JSON can be decoded in an integration test; A-10 is right |
| **RL-4** | **A-19**'s "a first load offline" conflates the cold-navigation case (offline shell, `/metrics needs a connection.`) with the warm-page case (`Offline — metrics need a connection.`) |
| **RL-5** | "`getByRole("link", { name })` lookups on `/metrics` never hit two links" is true only with `exact: true` — Playwright matches accessible names by substring, as the repository documents at `ExerciseLibrary.tsx:105-110` |
| **RL-6** | §12.1 mis-describes `phase7Remediation.spec.ts`: bounding boxes are checked on `/today` only; the per-route loop asserts `scrollWidth` and the visibility of `Recovery` alone |
| **RL-7** | The Volume card drops `raw` ("N direct"), which `/volume` shows beside every group; a presentation divergence R-1 does not list |
| **RL-8** | `olderEntryCount` spends a whole statement — inside a bound the document calls headroom-free — on one clause of one empty state |
| **RL-9** | The metrics-owned deload sentence's second clause ("A dip after one is expected") has no referent on a card that shows no series, no delta and no arrow |
| **RL-10** | M-6…M-12's windows and the `≥ 3` entry threshold are unlabelled conventions on a screen whose sibling feature labels every number `[P]`/`[A]`/`[E*]` |
| **RL-11** | **I-2** is stated as a grep with no patterns and no negative control, unlike the `strengthBoundary.test.ts` template it invokes |
| **RL-12** | **A-23** needs a "before" snapshot that cannot be captured after the fact and is subsumed by A-22's `git diff --stat … src/server/today` gate |
| **RL-13** | Refetch on `visibilitychange` has no precedent in this app — the event appears exactly once in `src/`, in the outbox flusher — and is presented as house behaviour |
| **RL-14** | Building this before OD-04 contradicts `implementation-plan.md` Phase 9's opening sentence and OD-04's recorded trigger; it needs recording as an owner-approved partial phase, not left silent |
| **RL-15** | §11.2's "the `users.default_volume_preset_id` read … always run[s]" is wrong: `resolveActivePreset` returns early when a block preset resolves |
| **RL-16** | "the seeded catalogue averages 2.4 contributions per exercise" measures **2.21** on the local development database (106 exercises / 234 contribution rows) |
| **RL-17** | `tabular-nums` is a new convention (0 occurrences in `src/`) presented as an existing one, and A-17 does not assert it |

---

## 3. The findings in full

### 3.1 RH-1 — M-1's future-session guard makes A-1 and A-11 jointly unsatisfiable, and falsifies I-6

**What the document says.** §4 M-1 bounds sessions by `started_at ∈ [Wk.start, Wk.end)` **and** `started_at < instant(D + 1)`, with the rationale "a clock-skewed session dated tomorrow must not count". §4's closing rules generalise it: "**Future-dated rows are ignored**: sessions after `D` are excluded by the M-4 upper bound and by the M-1 window". §16 I-6 then claims the dashboard buckets "exactly as History/Volume/Strength do today. The dashboard introduces no date, week, or eligibility rule of its own."

**What the repository does.** `queryWorkSetContributionRows` (`src/server/volume/service.ts:200-211`) filters on exactly three things: `user_id`, `ne(status, 'discarded')`, and the 5-week instant window. There is no upper bound relative to "today" — week `W0`'s window runs to `instant(W0.endDateExclusive)`, which is up to six days after `D`. `listHistorySessions` has no upper bound either (`src/server/history/service.ts:76-89`). Only the tracker excludes future rows, and it does so in the pure domain (`src/domain/strength/estimate.ts:221`: `past = sorted.filter(o => calendarDaysBetween(o.performedOn, asOfLocalDate) >= 0)`).

So M-4 is genuine parity with the tracker; **M-1/M-2 are a new rule with no counterpart anywhere else in the app**, and specifically not in the very report the same response carries.

**The contradiction.** Take a completed, non-deload session with `started_at` two days after `D`, inside `W0`:

- A-1's last clause: "with `D` held at `2026-09-06` it is a future session and **counts nowhere** (§4)."
- A-11: "`metrics.volume.weeks` deep-equals `getWeeklyVolumeReport(db, userId, now).weeks.slice(0, 2)` for the same `now`."

The second requires that session's work sets to appear in `metrics.volume.weeks[0]`, because the volume service counts them. On the same response the Training card would read `0 sessions · 0 work sets` for the current week while the Volume card shows that session's effective sets — and A-1 and A-11 cannot both pass on a fixture containing it. Whichever way an implementer resolves it, one binding criterion is wrong.

**Reachability.** `src/domain/sync/schema.ts:75` declares `startedAt: z.string().datetime({ offset: true }).optional()` — an ISO instant with no upper bound. `applyWorkoutSessionUpsert` validates ownership and status, never the clock. The evaluation's own §4 says such rows "can exist". PI-002 (`docs/input/product-ideas.md:40-70`) would make a user-chosen training date routine and explicitly lists "weekly volume" among the consumers to audit, so this divergence would widen, not close.

**Required revision — pick one, explicitly.**

- **(a) Parity.** Drop the `< instant(D + 1)` clause from M-1/M-2 so Training and Volume agree, and record future-dated sessions as a disclosed artefact of the client clock (they already are, on `/volume` and `/history`). I-6 then holds verbatim.
- **(b) Deliberate divergence.** Keep the guard, restate I-6 as parity *with the tracker's* I-6 rather than with Volume, reword A-1's "counts nowhere" to "counts in neither `training` nor `strength`", add the case to R-1's convention-drift list with a caption, and add a criterion that asserts the divergence rather than one that denies it.

(b) is the better product answer — a session dated tomorrow really should not be counted as done — but it must be *said*, because as written the document simultaneously claims the divergence does not exist (I-6) and depends on it (M-1).

### 3.2 RH-2 — the query plan decides in SQL what §4 says is a domain decision, and A-2 loses its subject

**What the document says.** §4, "Rules that apply to every row above": "**Only the `status` filter is decided in SQL** for M-1/M-2/M-4; warm-up exclusion (M-2), eligibility and admissibility (M-4) and week/day bucketing are pure-domain decisions, provable by fixture (the volume and strength precedents: *'filtered here (not by the caller) so the Work Set definition is a domain behavior'*)." A-2 is tagged `(Domain)` and asserts "warm-up sets are excluded from `workSets`".

**What §11.2 specifies.** Step 3: "`set_logs ⋈ session_exercises` where `session_id ∈ (step 2)` **and `is_warmup = false`** → `session_id, count(*)` **grouped**".

Both the predicate and the aggregation are in SQL. The pure module named in §20 step 1, `aggregateTrainingWeeks(sessions, windows)`, would receive per-session integers. There is then no set row for a fixture to mark as a warm-up, so A-2's warm-up clause cannot be a `(Domain)` test at all, and I-11/A-6's "shuffling the input rows" has nothing to shuffle for this section.

The quoted precedent says the opposite of what the plan does. `aggregateVolume` filters `rows.filter(row => !row.isWarmup)` *in the domain* (`src/domain/volume/aggregate.ts:170-175`), with the comment the evaluation quotes; `queryWorkSetContributionRows` deliberately does not. The strength service makes the same choice explicitly (`src/server/strength/service.ts:70-75`): "the query bounds by user, exercise and `status = 'completed'` ONLY … Everything else — warm-up, zero load, RIR … — is decided in the pure domain, so it stays fixture-provable rather than becoming a query-level side effect."

**Required revision — pick one.**

- **(a) Follow the precedent.** Step 3 projects `session_id, is_warmup` rows (no predicate, no `count`), and `aggregateTrainingWeeks` filters and counts. Cost: ~1,600 rows instead of ~40 groups on the heavy-user fixture — the same order as step 8's ~2,500 and well inside §11.3's own sizing argument (`data-model.md:392`, ≈ 10k set rows/year).
- **(b) Keep the SQL.** Then delete the "only the `status` filter is decided in SQL" sentence for M-2, delete the precedent quotation, retag A-2's warm-up clause `(Integration)`, and narrow I-11 to the sections that are genuinely pure.

(a) is recommended: it keeps one rule about what a work set is, in the one place two other features already put it, and the row count is not a real cost at this scale.

### 3.3 RM-1 — the volume DTO is specified twice, differently

- §4 M-5, Range column: "`W0`, `W1` … (**the full 5 weeks travel in the DTO for the invariant test**; only two are rendered)".
- §11.1 DTO: `weeks: WeekVolumeReport[];  // exactly weeks[0..1] of the existing report, verbatim`.
- §11.2: "The service returns five weeks; the metrics service forwards `weeks.slice(0, 2)`."
- A-11: "`metrics.volume.weeks` deep-equals `getWeeklyVolumeReport(db, userId, now).weeks.slice(0, 2)`".

Three against one, so the intent is clearly two weeks — but §4 is labelled "binding for implementation" and A-11 is the invariant test §4 refers to. Fix §4's Range cell. (Two is also the better answer: five weeks of 17 leaves plus a rollup is roughly 3 KB of unrendered payload, and A-11 proves the identity just as well on the slice.)

### 3.4 RM-2 — A-12's "≤ 16" is credited with protection it does not provide

The count itself is right. Reproduced by reading every `db.select()` on the path:

| Branch of `resolveActivePreset` (`src/server/volume/service.ts:148-175`) | Volume statements | Endpoint total |
| --- | --- | --- |
| no active program, no default preset | 4 | **12** |
| active program, no active block / block without preset, no default | 5 | 13 |
| no active program, default preset resolves | 6 | **14** |
| active program, active block whose preset resolves | 6 | 14 |
| active program, block without preset, default resolves | 7 | **15** |
| block `volume_preset_id` that does not resolve, then default resolves | 8 | 16 |

(Non-volume statements: `users` 1, sessions 1, set counts 1, strength batch 1, `exercises`-by-id 1, bodyweight 2, recovery 1 = 8.)

Two problems follow.

- **"The bound has no headroom" is false on every reachable branch.** 16 is only reached when a block carries a `volume_preset_id` that `getPresetWithLandmarks` cannot resolve — a preset that is neither builtin nor the user's own. Nothing in the application can produce that. The realistic maximum is 15 and the common case is 14, so the asserted bound silently tolerates one to two extra statements. The sentence that follows it ("so the metrics service must not add a second `users` read of its own beyond step 1") is a real rule resting on a false justification.
- **The count clause does not catch the failure mode it exists to catch.** The N+1 the document rejects (X-2/X-12) is "call the per-exercise tracker in a loop". A per-exercise fact scan that still shares one metadata lookup lands at `13 + N` statements, so it passes `≤ 16` for up to **three** in-window exercises; the full `getExerciseStrengthReport` loop (three statements each — exercise, user, facts) lands at `12 + 3N` and passes for **one**. The A-12 fixture's exercise count is not specified anywhere. What actually catches the loop is A-12's **second** clause — "every statement that reads `workout_sessions`, `set_logs`, `bodyweight_entries` or `recovery_entries` is bounded either by a `started_at`/`date` predicate in its own text or by an id list produced by such a bounded statement" — because `queryFactRows` has no time bound at all by design (`src/server/strength/service.ts:82-85`).

**Required revision.** Say that the boundedness clause is the load-bearing half; pin the *exact* expected statement count for a stated fixture shape rather than an inequality; require the A-12 fixture to contain at least five distinct exercises with in-window completed sessions; and add a second fixture with a different exercise count asserting the count is unchanged. Correct the "no headroom" sentence to name the branch it is true on.

*(Implementation note, not a defect: `createTestDb`'s `drizzle(client, { schema })` at `tests/integration/testDb.ts:18` does accept a `logger`, so the ten-line variant is real — but `migrate()` runs through the same instance, so the recorder must be reset after migration or scoped to the call under test.)*

### 3.5 RM-3 — I-11 claims order-independence the reused pipeline does not have

**I-11:** "Same fact rows + same `now` + same user settings ⇒ byte-identical DTO, **for any input row order**." **A-6** operationalises it: "shuffling the input rows of every section yields a byte-identical DTO".

The strength pipeline does not provide that, and says so. `buildObservation` sorts by set number (`src/domain/strength/observation.ts:100-101`: "I-5 — set order comes from `setNumber`, never from input order") — but `Array.prototype.sort` is stable, so equal `setNumber`s retain input order. The server layer's own comment names the case this leaves open (`src/server/strength/service.ts:108-115`): "A deterministic row order so the domain's stable sort by `setNumber` resolves the one ambiguous case — **the same exercise appearing twice in one session** — the same way on every request (I-5)."

That case is reachable: `uq_session_exercise_position` is on `(session_id, position)`, not on `(session_id, exercise_id)` (`src/db/schema/sessionExercises.ts:108`), so one session may hold the same exercise at two positions; and the grouping key in both the tracker and the proposed step 8 is `sessionId`, which merges their sets into one array with colliding set numbers. Shuffle those rows and the load groups — and therefore the observation's e1RM — can change.

A-6 would pass today only because the fixture it specifies ("an archived and an active exercise of the same name") does not exercise the case. That makes it a criterion that looks like a control and is not one.

**Required revision.** Restate I-11 as "same fact rows **delivered in step 8's stated `ORDER BY`** ⇒ byte-identical DTO", make that `ORDER BY` (`exercise_id, started_at, position, set_number`) part of the binding contract rather than an implementation note, and split A-6: shuffle freely for training/bodyweight/recovery/volume (all genuinely order-independent — `aggregateVolume` is a fold and `isDeload` is a `some()`), and for the estimate index assert stability under re-ordering *within* the stated sort key only. Add the duplicate-exercise-in-one-session fixture as the case that shows why.

### 3.6 RM-4 — two "Deload" definitions, one word, one screen

§8 discloses one divergence: a deload session that logged no work sets flags the Training week but not the Volume column. That is correct — `aggregateWeek` computes `isDeload: inWindow.some(row => row.isDeload)` over *work-set contribution rows* (`src/domain/volume/aggregate.ts:157`), and `aggregateVolume` has already dropped warm-ups.

The reverse divergence is not disclosed and is at least as likely: `queryWorkSetContributionRows` counts **non-discarded** sessions, so an **in-progress** deload session badges the Volume column while M-1/M-3 (completed only) leave the Training row unbadged, with the same asymmetry in the numbers that R-2 already documents. And it is not confined to the current week — the repository has a whole spec about long-lived in-progress sessions (`tests/e2e/stale-completed-session.spec.ts`), and `uq_sessions_one_in_progress` permits exactly one that can be arbitrarily old, so `W1`'s Volume column header can carry `[Deload]` while `W1`'s Training row does not.

**Required revision.** State both directions in §8; add the in-progress deload case to the A-2/A-11 fixtures (A-11 already promises a fixture "with an in-progress session" — make it a deload one); and either accept the shared word with the disclosure, or give the Training badge and the Volume badge visibly different labels.

### 3.7 RM-5 — I-10 is violated by the Recovery card's own wireframe

**I-10:** "every average carries its entry count". M-12's DTO honours it (`meanSleepHours: { hours, count } | null`). §12.2's rendered line does not:

```
│ Logged 5 of the last 7 days · mean     │
│ sleep 7.1 h                            │
```

`5` is M-11 (`daysLogged` — days with *any* entry). The mean's denominator is M-12's count (days with a non-null `sleep_hours`), and the two differ whenever a check-in logs only a 1–5 rating — which is the app's most common check-in shape: `RecoveryCheckIn` writes `sleepQuality`/`readiness`/`soreness` and never `sleepHours`, and `ck_recovery_entries_has_metric` requires only one metric of the four (`src/db/schema/recoveryEntries.ts:236-239`). A week with five check-ins and two sleep-hour entries would read "Logged 5 of the last 7 days · mean sleep 7.1 h" with the mean computed over two.

**Required revision.** Print the mean's own count — e.g. `mean sleep 7.1 h (2 of 7 days)` — and add it to §15's "must appear" list and to A-5.

### 3.8 RM-6 — step 9 drops an ownership predicate the sibling endpoint treats as load-bearing

§11.2 step 9: "`exercises` where `id ∈ (distinct exercise ids of step 8)` → `id, name, equipment, load_step_kg, strength_estimate, archived_at`". No `user_id`.

The tracker scopes the same lookup and explains why (`src/server/strength/service.ts:132-148`): "Ownership is enforced in the WHERE clause, never by a post-fetch check, so a foreign-owned id is indistinguishable from a missing one -> 404 (`server/exercises/service.ts`'s pattern, review RL-10)."

Step 8 is scoped by `workout_sessions.user_id`, so the ids are *the user's sessions'* exercise ids — which is not the same as *the user's* exercise ids. The sync write path validates the parent session's owner (`src/server/sync/service.ts:610-618`, `:651-652`) but never checks that `payload.exerciseId` belongs to the caller; the only constraint on that column is the FK to `exercises.id` (`ON DELETE restrict`). This is a single-account application (ADR-004), so there is no live exposure — but the dashboard would be the one screen that renders such a name, and the fix costs one `and(...)` clause.

**Required revision.** Add `eq(exercises.userId, userId)` to step 9 and say why, matching the sibling endpoint's comment.

### 3.9 RM-7 — the copy scanner's ban list collides with the design's own vocabulary

§15 specifies the strength template, which is `readableSource` in `tests/unit/strengthCopy.test.ts:68-73`:

```ts
return readFileSync(file, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")        // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")     // line comments
  .replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, " ");  // SCREAMING_SNAKE identifiers
```

Comments and constant names are stripped; **camelCase identifiers, component names, props and JSX attributes are not.** §15 then adds case-insensitive `badge`, `target`, `score`, `trend`, `goal` and `fatigue` to the ban list, while §8/§12.2/§13 require a `Deload` badge and an `Archived` badge on the same screen, and ordinary React code reaches for `event.target`.

The rule is satisfiable — the existing badges are inline markup with no identifier carrying the word (`src/ui/volume/VolumeScreen.tsx:78-82`, `src/ui/exercises/ExerciseLibrary.tsx:91-95`) — but it is an undocumented naming constraint of exactly the class the evaluation itself identifies as F-16, and it belongs beside the `estimateIndex` / `EstimatesCard` rule in §20 step 1 rather than being discovered during implementation.

A second, smaller problem in the same section: §15 says reused sentences "are imported, never re-typed", and also that the test asserts the reused `freshness`, `estimateDisclaimer`, `bandNote` and `footer` "must appear". A substring scan over `src/ui/metrics/copy.ts`'s *strings* sees an imported constant only if that module re-exports it **by value** into its own `allCopyStrings()`-style surface. Say so, or A-20's "every required sentence occurs" is unimplementable as described.

**Required revision.** Add the identifier-level naming constraint to §20 step 1; state the re-export requirement in §15.

### 3.10 RM-8 — A-25 measures on one machine and reports against another's budget

§11.3 sets "p95 ≤ 300 ms server time on B1/B1ms-class hardware". A-25 records "the measured server time … on **local PostgreSQL 16**" and "states pass/fail against the 300 ms p95 budget". The local database is a Docker container on the developer's Windows machine (verified running: `gym-app-db-1`, up 41 h), which is not B1ms-class; a pass there is not evidence of a pass on B1ms, and a fail would be alarming rather than informative.

**Required revision.** Either state the budget as a *local* baseline with an explicit headroom factor ("p95 ≤ 100 ms locally, as a proxy for 300 ms on B1ms"), or drop the hardware attribution and call it a regression baseline. Either way keep the ordered remedy list, and note that its first remedy — a covering index on `set_logs (session_exercise_id, is_warmup)` — **is a migration**, so the "no migration" boundary is unconditional only while the budget is met.

### 3.11 The Low findings, briefly

- **RL-1.** §13: "every number is text; the sparkline is `aria-hidden="true"` with a text alternative line beneath it (**the existing component's rule**)". On the strength page that rule holds because the observation list below renders each point as text. On the metrics card the alternative is "90 days · 41 entries", so up to 90 bodyweight values exist only as pixels. Either say the alternative is a summary (and drop "every number is text"), or render first/last/min/max as text.
- **RL-2.** M-9 says a gap is "visible spacing, never interpolated". The sibling component draws a `polyline` through consecutive points (`src/ui/strength/Sparkline.tsx:50,62-70`); with day-indexed `x` a 10-day gap becomes a long straight segment, which reads as interpolation. Draw points only, or reword.
- **RL-3.** A-10 correctly notes route handlers get their pool from `getDb()` (`src/db/client.ts:34-49`) and cannot be pointed at PGlite. A-16 then says "the integration test decodes **the route's** JSON shape". Decode the service's return value instead; the route shape stays e2e.
- **RL-4.** §14 gets the cold case right — a document navigation resolves to the precached shell, and `OfflineShell`'s route notice prints `` `{pathname}` needs a connection. `` (`src/ui/OfflineShell.tsx:60-67`), i.e. "/metrics needs a connection." A-19 then asks for "a first load offline shows `Offline — metrics need a connection.`", which is the *warm-page* string. Split the criterion. (The service worker does exist under e2e: `next.config.ts:14` disables it in development, and `playwright.config.ts:6-30` runs `pnpm build && pnpm start` for exactly that reason.)
- **RL-5.** §12.2/§13 argue that distinct card-link names stop `getByRole("link", { name })` from matching twice. Playwright matches accessible names by substring — the repository says so itself, at length, at `src/ui/exercises/ExerciseLibrary.tsx:105-110` — so "History" matches "Full history", "Volume" matches "Volume screen" and "Bodyweight" matches "Bodyweight log". The distinct names work *because* `exact: true` then disambiguates them. Make `exact: true` the stated rule.
- **RL-6.** `tests/e2e/phase7Remediation.spec.ts:21-77`: the bounding-box loop over the seven link names runs on `/today` after `login(page)`, across four viewports; the second loop visits six routes and asserts only `scrollWidth` and the visibility of `Recovery`. Adding "Metrics" to the name list is still exactly one edit, as claimed — but `/metrics` will not be covered by that spec, and §12.1's description of what it measures is wrong.
- **RL-7.** `MuscleRow` renders `{effective}` prominently and `{raw} direct` beside it (`src/ui/volume/MuscleRow.tsx:44-47`). The dashboard card renders effective only. Defensible on space, but it belongs in R-1's list of disclosed differences between the two screens.
- **RL-8.** §11.2 step 10 spends a second statement on `count(*) where date < D − 89`, whose only consumer is the trailing clause of one empty state ("` N older entries are on the Bodyweight screen.`"). Fold it into step 10 (a `count(*) filter (...)` in the same statement, or a `min(date)`), or drop the clause. It is one of the two statements of slack RM-2 discusses.
- **RL-9.** §8's metrics-owned sentence keeps `deloadNote`'s evidence-backed second clause, "A dip after one is expected." The Current estimates card shows a single current value with no series, no delta, no arrow and no ordering (N-3, I-9), so there is no dip on the card for the sentence to explain — and inviting the reader to look for one runs against the card's whole design. "Deload sessions are not counted." alone is enough; keep the full sentence on the detail page, where the trend actually is.
- **RL-10.** `src/domain/strength/constants.ts` labels every number `[E*]`/`[A]`/`[R]`/`[P]` with a K-nn id, and ADR-011 requires it. §4's `≥ 3` entries, the 7- and 30-day bodyweight windows, the 90-day bodyweight window, the 7-day recovery window and O-2's 8 weeks carry no such labels. Add them (all `[P]`), so nobody later reads "3 entries" as calibrated to anything.
- **RL-11.** I-2's evidence is "A grep of `src/` and `drizzle/` finds no column named for a metric, average, tonnage, or snapshot" — no patterns, no negative control. The template it invokes names six `COLUMN_PATTERNS` and proves the list can fire (`tests/unit/strengthBoundary.test.ts:435-470`, `expect(COLUMN_PATTERNS.some(p => p.test('numeric("e1rm_kg")'))).toBe(true)`). Either follow it, or drop I-2's grep and lean on A-22.
- **RL-12.** A-23 compares the Today bundle "before and after the feature", which needs a snapshot taken before implementation starts. A-22 already asserts `git diff --stat 1282795 -- …` is empty for `src/server/today`, which is the stronger and cheaper form. Keep A-22.
- **RL-13.** `visibilitychange` occurs exactly once in `src/`, in `installFlushTriggers` (`src/sync/flush.ts:160`). No read screen refetches on it. §14's "refetch on … `visibilitychange` → `visible`" is a *new* client behaviour, not an inherited one — worth saying, together with the consequence that an unthrottled listener issues a full request on every foreground, including rapid app-switching.
- **RL-14.** `implementation-plan.md:223` opens Phase 9 with "Resolve OD-04 (default Recharts) first", and `open-decisions.md:15` records OD-04's decision point as "Start of Phase 9". This evaluation defers OD-04 and defers four of Phase 9's five named deliverables (tonnage → D-1, volume trend chart → D-4, recommendation stats → D-2, history search/filters → M-5). That is a good scope call, but it leaves the plan's own ordering unmet in silence. Record it as an owner-approved partial phase (a "Phase 9a" line in `implementation-plan.md`) together with F-7's `mvp-scope.md` edit. `deviations.md` is for spec-vs-spec contradictions, so this belongs in the plan and in `open-decisions.md`, not there.
- **RL-15.** §11.2 says four volume statements "always run", naming the `users.default_volume_preset_id` read among them. `resolveActivePreset` returns before that read whenever an active block's preset resolves (`src/server/volume/service.ts:159-162`). The floor of 4 is right; the reason given is not.
- **RL-16.** Measured on the local development database: 106 exercises, 234 `exercise_muscle_contributions` rows → **2.21** per exercise, not 2.4. The ≈ 2,400-row estimate for steps 4–7 stands.
- **RL-17.** `tabular-nums` appears 0 times in `src/`. §13 introduces it as though inherited; A-17 does not assert it. Harmless — just label it new.

---

## 4. Confirmed correct

Everything below was checked in source or by probe and is accurate as the evaluation states it. This is the larger part of the document.

### 4.1 The five cards and their metric definitions

- **M-1/M-3** bucket by the account-local day of `started_at`, matching `aggregateVolume`'s stated convention ("a session spanning midnight stays in its start week", `src/domain/volume/aggregate.ts:26-29`) and the tracker's `performedOn` (`src/server/strength/service.ts:180-181`). Correct.
- **M-2**'s "work set = `is_warmup = false`" matches `volume-model.md` §1 as implemented, and `is_warmup` is a user-owned toggle, not a derived value (`src/ui/workout/ExerciseCard.tsx:105,236`) — so the count is a fact, not an inference. Correct (the *placement* of the filter is RH-2; the definition is right).
- **M-4**'s projection choice is the single best-argued decision in the document, and it is right. `currentE1rmKg`, `confidence` and `latestPoolAgeDays` depend **only** on `inWindow` — `pool = inWindow.slice(-CURRENT_SESSION_COUNT)`, and every confidence cap derives from `pool.length`, `latestPoolAgeDays`, `poolSpreadExactPct` and the pool observations' flags (`src/domain/strength/estimate.ts:229-328`). A window-bounded session set yields exactly the same `inWindow`, hence byte-identical values to the all-time detail page. Conversely `best` (all-time, over `nonDeloadPast`, `:255-286`), `staleObservationCount` (`:235`) and the `BEST_UNCONFIRMED` / `DELOAD_SESSIONS_EXCLUDED` codes *do* depend on out-of-window rows, so excluding them from the index is not conservatism — it is required. **A-9 is a sound and non-vacuous criterion.**
- **M-5** reuses `getWeeklyVolumeReport` unchanged, which is what makes I-3's "by construction rather than by test" claim true; the `back` rollup really is the only rollup (`ROLLUP_MUSCLE_GROUP_SLUGS = ["back"]`), over 17 leaves.
- **M-6…M-9.** `bodyweight_entries` is day-keyed and unique per day (`unique("uq_bodyweight_day")`), so "latest = max date" is unambiguous; `weight_kg` is `numeric(5,2)` with a 20–400 check. The 30-day change compares two 7-day means whose end-points are exactly 30 days apart (`[D−36, D−30]` vs `[D−6, D]`) — internally consistent, and honestly labelled "change of 7-day averages, 30 days apart", never "trend".
- **M-10…M-12.** Rendering entries as entered matches `RecoveryHistoryList.tsx:57-62` exactly ("Sleep 7h · Sleep quality 4/5 · Readiness 3/5 · Soreness 2/5", nulls omitted). `sleep_hours` is `numeric(4,2)`, 0–24 — a ratio quantity, so a mean is defensible where a mean of the 1–5 ordinals would not be.

### 4.2 Account timezone and calendar windows — verified by probe

The equivalence §11.2 asserts for step 8's bound ("every session with `performedOn ∈ [D − 89, D]` has `started_at ∈ [instant(D − 89), instant(D + 1))` and vice versa") was independently reproduced against verbatim copies of `userLocalDateString` and `localDateToUtcInstant` (Appendix B, probe 1):

- **Europe/Ljubljana, 400 consecutive local-midnight boundaries (2026-01-01 → 2027-02-04): 0 failures**, including both 2026 DST transitions (`2026-03-29` → `2026-03-28T23:00:00Z`, `2026-10-25` → `2026-10-24T22:00:00Z`). The instant one millisecond earlier formats to the previous day in every case.
- **Pacific/Kiritimati** (A-1's fixture zone, UTC+14, no DST): exact.
- The evaluation's own scoping caveat is also correct and worth keeping: in zones whose DST transition happens **at** midnight the helper is off by an hour into the previous day — reproduced for `America/Santiago` `2026-09-06` and `America/Havana` `2026-03-08`, where `localDateToUtcInstant(D)` formats back to `D − 1`. This is a pre-existing limitation of `localDateToUtcInstant` (its own comment scopes itself the same way, `src/server/time/userLocalDate.ts:43-52`), inherited rather than introduced, and unreachable while `users.timezone` has no writer (F-15 — confirmed: zero writers in `src/`).

The rest of §5 also checks out: one `asOf` per response is the decisive argument for server composition (§11.4); `getWeeklyVolumeReport(db, userId, now)` accepts the shared clock (`src/server/volume/service.ts:224-238`); week windows come from `calendarWeekWindows` anchored on `users.week_starts_on` (0–6, `ck_users_week_starts_on`); and `formatLocalDate` / `formatWeekRangeLabel` both use the no-`Z` parse that keeps the day from shifting (`src/ui/strength/format.ts:82-88`, `src/ui/volume/volumeDisplay.ts:169-175`).

### 4.3 Sparse, null, deload and archived behaviour

- Empty states, zero-week rows, "(so far)", and "never a default value (the phase-7 MEDIUM-2 lesson: fabricated `3`s)" are all right, and the lesson is real — `phase7Remediation.spec.ts:169-231` is the regression suite for exactly that.
- The deload signal is `workout_sessions.is_deload`, frozen at session start (`src/db/schema/workoutSessions.ts:26-30`), and no reader re-derives it. Correct, and the instruction not to start doing so is well placed.
- Archived exercises: history and volume genuinely do not filter `archived_at`; the strength detail page genuinely serves them and already renders "This exercise is archived. Its history is still shown here." (`src/ui/strength/StrengthScreen.tsx:131-134`); the library's badge markup is exactly as quoted (`ExerciseLibrary.tsx:91-95`); and names are unique only among non-archived rows (`uniqueIndex("uq_exercises_active_name") … where archived_at is null`), which is precisely why the `exerciseId` tiebreak in M-4 is needed. All correct.

### 4.4 Recovery, evidence posture, and the misleading-analytics line

- EVIDENCE-027 and OD-09 are quoted accurately (`open-decisions.md:19,26`; `evidence-to-design.md` row 14). `mvp-scope.md` F10's "not consumed by the engine" is real, and `progressionBoundary.test.ts` enforces it over the six directories the evaluation names (`tests/unit/progressionBoundary.test.ts:15-22`).
- I-7's restraint is correct and well grounded, including the F-13 observation: the 1–5 sliders carry no labelled direction anywhere (`src/ui/recovery/NullableSliderField.tsx:54-76`), so bare numbers with no colour, icon, sort or threshold is the only honest rendering.
- §10's excluded-analytics table is sound throughout. Cross-exercise aggregation is forbidden by `evidence-to-design.md` row 20's not-justified column ("any … cross-exercise inference"); "compliance scoring" appears verbatim in row 15's not-justified column; `volume-model.md:96` is "reference range", never "target"; `mvp-scope.md:58` refuses gamification/streaks/badges and `:50` nutrition. The provisional status of EVIDENCE-032…037 is characterised correctly — the registry note at `evidence-to-design.md:54` records the open temporary exception, and the evaluation never lifts an `[E*]` tag.

### 4.5 One endpoint, the query plan, and the computed-on-read boundary

- **One endpoint is sufficient**, and the two justifications given are both true: no existing endpoint returns weekly session/work-set counts (`listHistorySessions` pages 20–100 and counts warm-up rows as `setCount`, `src/server/history/service.ts:105-119`), and the tracker is strictly per-exercise with a deliberately unbounded scan (`queryFactRows`, `:82-86`).
- **No N+1 exists in the proposed plan.** Step 8 is one query for every exercise; step 9 is one `IN` lookup; `deriveStrengthReport` runs per exercise in memory. The guard against a future N+1 is A-12's boundedness clause (see RM-2).
- **No existing metric is altered.** `getWeeklyVolumeReport` is called, not modified; `src/server/volume/service.ts` is on the must-not-change list and A-22 gates it with a `git diff`. Adding `{ includePreset: false }` is correctly deferred (D-15).
- **Every index named in §11.2 exists with the name given**: `ix_sessions_user_started` on `(user_id, started_at desc)`, `ix_session_exercises_session_id`, `ix_session_exercises_exercise` on `(exercise_id, created_at desc)` (correctly noted as unable to serve step 8's `session_id` join), `ix_set_logs_session_exercise` on `(session_exercise_id, set_number)`, `uq_bodyweight_day`, `uq_recovery_day`.
- **Computed on read is the right and the documented choice**: `architecture-plan.md:118` ("dashboard highlights | Derived | **no — computed on read**"), `data-model.md:388` (persisting them "would create consistency liabilities with zero read-performance need at single-user scale") and `data-model.md:392` (≈ 10k set rows/year) all say what the evaluation says they say. **No migration is required** (subject to RM-8's caveat about the first performance remedy).

### 4.6 Online-only, staleness, boundaries and layout

- `/api/metrics` is `NetworkOnly` by the existing catch-all with no `sw.ts` change — the entry matches `sameOrigin && pathname.startsWith("/api/") && !"/api/auth/" && !== "/api/today-bundle"` (`src/app/sw.ts:278-286`) — and the document fallback is guarded by `request.destination === "document"`, so an offline fetch genuinely rejects rather than resolving with HTML (`:353-364`). Correct.
- `pwa-offline-strategy.md:26` classifies "Browse full history, analytics, volume charts" as online only. Correct.
- The Today staleness precedent is quoted correctly (`src/ui/today/TodaySection.tsx:267-268`), and the flush race is real: `installFlushTriggers` wires `visibilitychange` → `flushOutbox` (`src/sync/flush.ts:156-161`), and `SyncStatusBanner` reports dead letters and auth state, not a pending count. Refusing to order the dashboard after the flusher — and putting a Refresh button there instead — is the right call.
- ESLint layers are as stated (`eslint.config.mjs:40-49`), so `ui → domain|ui|sync` permits importing the DTO type and `@/ui/strength/copy`, and `server → domain|db|server` permits calling `getWeeklyVolumeReport` and `deriveStrengthReport`. Correct.
- **F-16 is exactly right and is the document's best catch.** `strengthBoundary.test.ts:90-118` discovers every `/strength/i` path under `src/` and fails on any file outside its five accounted directories; `warmupBoundary.test.ts:57-118` auto-roots every `/warmup/i` file and forbids it from reaching `domain/volume` / `server/volume`. A metrics file named `strengthIndex.ts` or `warmupWeeks.ts` would break one suite or the other. The `estimateIndex` / `EstimatesCard` naming rule is necessary, not stylistic.
- Adding metrics does not disturb `progressionBoundary.test.ts`: its roots are the progression tree plus five named API routes (`today-bundle`, `active-session`, `sync`, `history`, `volume`) — `/api/metrics` is neither among them nor reachable from them. A-22's "passes without modification" holds.
- Every visual-system claim in §2.2 was checked and is verbatim correct: card classes, the deload badge (`bg-amber-900/60 … text-amber-300` with `opacity-60`), the archived badge (`bg-slate-800 … text-slate-400`), `min-h-11` (6 uses), `active:scale-[0.98]` on the shared `Button`, safe areas handled once in `globals.css`, and the `Loading…` / `Failed to load …` copy pattern.
- **F-11 is real and the instruction not to copy it is correct**: `HistoryList.tsx:22-23`, `VolumeScreen.tsx:17-18`, `BodyweightHistoryList.tsx:20-21` and `RecoveryHistoryList.tsx:17-18` all call `res.json()` with no `res.ok` check. `StrengthScreen.tsx:65-77` does check, and is the right model.

### 4.7 Appendix B findings

F-1 through F-17 were spot-checked; all seventeen are accurate. Two were confirmed by probe or direct query:

- **F-17 confirmed exactly.** The local development database (`gym-app-db-1`, compose project `gym-app`) has **11 rows** in `drizzle.__drizzle_migrations` (0000–0010, latest applied 2026-09-01) and `information_schema.columns` returns **0** rows for `exercises.strength_estimate`. Migration `0011_happy_celestials.sql` is unapplied; `pnpm db:migrate` is a prerequisite for any metrics work, and for A-25.
- **F-3 confirmed**: `@tanstack/react-query@^5.101.4` is a declared dependency and `QueryClientProvider` appears **0** times in `src/`.

### 4.8 The backlog boundary

PI-005's own preferred sequencing is "ship the read-only e1RM tracker first, **add a read-only metrics dashboard from existing data**, complete this dedicated architecture evaluation, implement the measurement/logging foundation" (`docs/input/product-ideas.md:259-262`). The decision to defer tonnage until load semantics exist (O-4/D-1) is therefore not merely defensible — it is the sequencing the backlog already records, and it keeps Athletic Measurement Profiles out of dashboard v1 exactly as the brief asks. Likewise F-9's addition of "metrics dashboard" to PI-002's consumer audit list is correct: PI-002 names "history, weekly volume, scheduling, progression, exports, and offline sync" (`:69-70`), and both new `started_at` consumers are missing from it.

---

## 5. O-1 … O-10 — independent recommendations

| # | Decision | Evaluation's recommendation | This review | Reason |
| --- | --- | --- | --- | --- |
| **O-1** | Nav placement | **Metrics** after History; Volume/Bodyweight/Recovery stay top-level | **Agree** — with the measurement made *before* the UI is finished, not after | The consolidation variant puts two daily quick-log screens behind an extra tap to save one nav item. Seven links already wrap to two rows at 375 px; an eighth `text-sm` link plausibly fits the second row, but that is a measurement, and `phase7Remediation.spec.ts`'s HIGH-2 (Start workout inside the initial 375×667 / 390×664 viewport with the recovery card visible) is the correct gate. Run it first; if it fails, take the consolidation variant rather than restyling the nav. |
| **O-2** | Training range | 8 calendar weeks | **8 weeks, one line per week** | 8 is right (two mesocycle halves). But §12.2's two-line row × 8 plus the caption is roughly 330 px of the first viewport, which is what pushes the estimates card down (see O-10). `Aug 31 – Sep 6 · 4 sessions · 71 work sets` fits 264 px at `text-xs`; keep the second line only for the current week's "(so far)" and the deload badge. |
| **O-3** | Index ordering | Alphabetical | **Agree** | Recency ordering reshuffles the list after every session, and the recency information is already on every row as `formatSessionAge(latestPoolAgeDays)`. Case-folded code-point order with an `exerciseId` tiebreak is also the only deterministic choice — `localeCompare` depends on host ICU, and `uq_exercises_active_name` leaves archived duplicates possible. |
| **O-4** | Tonnage excluded | Exclude | **Agree, strongly** | `weight_kg` carries no load semantics (0 kg = bodyweight-only per `data-model.md`; per-hand dumbbell and machine-stack conventions are unrecorded), and PI-005's own sequencing puts the measurement-profile pass *after* this dashboard. Record the consequent `mvp-scope.md` §2 / `implementation-plan.md` Phase 9 edit as part of RL-14's partial-phase note. |
| **O-5** | No 1–5 averages | Exclude; mean sleep hours only | **Agree — plus RM-5** | An average of an unlabelled ordinal scale (F-13) reads as a score, which OD-09 / EVIDENCE-027 forbid. Sleep hours is a ratio quantity and a mean is honest — provided it prints **its own** count, which the current wireframe does not. |
| **O-6** | No landmarks on the dashboard | Exclude | **Agree** | Landmarks require their provenance caption ("coaching heuristic", `volume-model.md:96` and `MuscleRow.tsx:59`) and the "reference range, never target" framing; repeating both per group on a 3-column card is not possible without the card becoming the Volume screen. The link is one tap. |
| **O-7** | Archived exercises in the index | List + badge | **Agree** | Consistent with ADR-011 O-15 (the detail page serves them and says so), with archive-as-picker-visibility, and with history/volume being archive-agnostic. The row drops out naturally once its last counted session ages past 90 days — no extra rule. |
| **O-8** | Footer count scope | Eligible exercises only | **Agree** | Counting permanently ineligible exercises produces a standing prompt the athlete cannot resolve, and makes "yet" false. The word "yet" is the tell: keep the count where the word is true. |
| **O-9** | 30-day bodyweight change | Difference of two 7-day means | **Agree** | Latest-minus-latest is dominated by day-to-day variation; the mean-difference form is the only one of the three that compares like with like, and it already prints both entry counts. Add RL-10's `[P]` labels to the `3`, the `7` and the `30`. |
| **O-10** | Card order | Training, **Strength**, Volume, Bodyweight, Recovery | **Differ: Current estimates first, Training second** | The evaluation's own §1 makes discoverability of the tracker the feature's primary justification ("today the tracker is reachable only from a per-row link … i.e. the athlete must already know which exercise to look at"). Current estimates is the only card whose content is *not* one nav tap away — Training ≈ History, and Volume/Bodyweight/Recovery are their own screens. Putting the one novel card first is the smallest change that makes the justification true. Rough layout arithmetic at the repository's own tight measurement viewport (390×664: nav two rows + `mb-6` ≈ 80 px, header block ≈ 160 px, Training card ≈ 330 px) puts the estimates card's first row at or below the fold. **If the owner prefers Training first**, take O-2's one-line variant *and* add a measured assertion to A-17 in HIGH-2's style — the first estimate row's `boundingBox().y + height ≤ viewport.height` at 390×664 — rather than leaving it to judgement. |

---

## 6. Boundaries: all preserved

| Boundary the brief asked to preserve | Verdict | Note |
| --- | --- | --- |
| Read-only dashboard | **Preserved** | No POST/PATCH/DELETE, no outbox op, no IDB store; A-13's no-write log assertion is the right control |
| Computed on read | **Preserved** | Every value is a pure function of current facts; A-15 is a genuine test of it |
| No persisted aggregate or cache | **Preserved** | Argued from `architecture-plan.md` §7 and `data-model.md` §5/§6, not from taste |
| No migration | **Preserved, conditionally** | Unconditional only while A-25's budget is met — §11.3's first remedy is a covering index (RM-8) |
| No sync or Today-bundle change | **Preserved** | `SYNC_ENTITIES`, op schemas and `sw.ts` untouched; the deliberate refusal to reorder against the flusher (§14) is the right call |
| No readiness score / causal correlation / automated coaching / progression consumption | **Preserved** | I-7 and I-8 are correctly scoped; the six-directory non-consumption story matches `progressionBoundary.test.ts` |
| No charting library | **Preserved** | OD-04 untouched; the inline-SVG sparkline follows Release A's precedent (see RL-1/RL-2 for two claims about it that need softening, and RL-14 for the ordering question) |

---

## 7. Required changes, in one list

1. **RH-1** — resolve M-1's future-session guard against Volume's absence of one; fix I-6 and A-1 accordingly (§3.1).
2. **RH-2** — move step 3's warm-up filter and count into the domain, or retract §4's "pure-domain decision" rule and retag A-2 (§3.2).
3. **RM-1** — make §4 M-5 say two weeks (§3.3).
4. **RM-2** — pin an exact statement count per fixture shape, require ≥ 5 in-window exercises, and correct the "no headroom" sentence (§3.4).
5. **RM-3** — restate I-11 around step 8's `ORDER BY`; split A-6 (§3.5).
6. **RM-4** — disclose both deload divergences; make A-11's in-progress fixture a deload session (§3.6).
7. **RM-5** — print the sleep mean's own count; add it to §15's must-appear list and A-5 (§3.7).
8. **RM-6** — add `eq(exercises.userId, userId)` to step 9 (§3.8).
9. **RM-7** — record the identifier-level naming constraint in §20 step 1; state the copy re-export requirement in §15 (§3.9).
10. **RM-8** — restate A-25's budget for the machine it is measured on, and note that the first remedy is a migration (§3.10).
11. **RL-3, RL-4, RL-5, RL-6, RL-12** — correct four criteria and one spec description.
12. **RL-14** — record the partial-Phase-9 / OD-04 ordering as an owner decision alongside O-1…O-10.

The remaining Low items are wording and labelling; they can travel with the same revision or be accepted as-is at the owner's discretion.

---

## Appendix A — What was and was not checked

**Checked in source:** `src/db/schema/{workoutSessions,sessionExercises,setLogs,bodyweightEntries,recoveryEntries,users,exercises}.ts`; `src/domain/volume/{aggregate,weekBuckets}.ts`; `src/server/volume/service.ts`; `src/domain/strength/{report,estimate,primitives,eligibility,constants,observation}.ts`; `src/server/strength/service.ts`; `src/server/{history,bodyweight,recovery}/service.ts`; `src/server/time/userLocalDate.ts`; `src/db/client.ts`, `src/server/db.ts`; `src/app/sw.ts`; `src/app/(app)/layout.tsx`; `src/app/api/{volume,exercises/[id]/strength}/route.ts`; `src/ui/OfflineShell.tsx`; `src/ui/strength/{copy,format,Sparkline,StrengthScreen}.tsx|ts`; `src/ui/volume/{VolumeScreen,MuscleRow,volumeDisplay}.tsx|ts`; `src/ui/{history/HistoryList,recovery/{RecoveryHistoryList,NullableSliderField},exercises/ExerciseLibrary,today/TodaySection,SyncStatusBanner,Button}.tsx`; `src/sync/{flush,accountTimezone}.ts`; the session-exercise and set-log paths of `src/server/sync/service.ts`; `src/domain/sync/schema.ts`; `src/domain/exercises/muscleGroups.ts`; `eslint.config.mjs`; `next.config.ts`; `playwright.config.ts`; `package.json`; `tests/unit/{importGraphWalker,strengthBoundary,warmupBoundary,progressionBoundary,strengthCopy}.ts`; `tests/integration/testDb.ts`; `tests/e2e/{phase7Remediation,strengthPage,bodyweightRecovery,seed}.ts`; `docs/architecture/{architecture-plan,data-model,implementation-plan,open-decisions,mvp-scope,volume-model,pwa-offline-strategy,evidence-to-design,deviations}.md`; `docs/evidence/evidence-registry-reviewed.md` (EVIDENCE-027); `docs/input/product-ideas.md`; `README.md`.

**Not run** (out of proportion for this review, and not required by any finding): the unit, integration or e2e suites; a build; `pnpm lint` / `typecheck`; any statement-count measurement against PGlite. Every quantitative claim above is either a static reading of the code (the statement-count table in §3.4 identifies each `db.select()` individually) or a probe recorded in Appendix B.

**Not checked:** production. No production system was contacted at any point.

## Appendix B — Probes

Both probes were read-only and left nothing behind in the repository.

**Probe 1 — timezone window boundaries.** A standalone script in the session scratchpad, containing verbatim copies of `userLocalDateString` and `localDateToUtcInstant` from `src/server/time/userLocalDate.ts` (no repository file was imported, modified or created), asserted for each date `D` that `userLocalDateString(tz, localDateToUtcInstant(D, tz)) === D` and that the instant one millisecond earlier formats to `D − 1`.

- `Europe/Ljubljana`, 400 consecutive dates from 2026-01-01: **0 failures**.
- Both 2026 European DST transitions: pass (`2026-03-29` → `2026-03-28T23:00:00Z`; `2026-10-25` → `2026-10-24T22:00:00Z`).
- `Pacific/Kiritimati` `2026-09-07`: pass (`2026-09-06T10:00:00Z`).
- `America/Santiago` `2026-09-06` and `America/Havana` `2026-03-08` (DST transitions at midnight): **fail** — `localDateToUtcInstant(D)` formats back to `D − 1`. Pre-existing helper limitation, correctly scoped out by the evaluation and by the helper's own comment; unreachable while `users.timezone` has no writer.

**Probe 2 — local development database** (`gym-app-db-1`, read-only `psql` queries):

- `select count(*) from drizzle.__drizzle_migrations` → **11** (0000–0010; latest 2026-09-01).
- `information_schema.columns` for `exercises.strength_estimate` → **0** rows. Migration `0011` unapplied (confirms F-17).
- `exercises` → 106 rows; `exercise_muscle_contributions` → 234 rows; **2.21** contributions per exercise (RL-16).

## Appendix C — Working-tree impact

Created: `docs/reviews/metrics-dashboard-architecture-review.md` (this file). Nothing else was created, modified or deleted. `docs/reviews/metrics-dashboard-architecture-evaluation.md` is byte-identical to the state it was reviewed in. The pre-existing uncommitted changes — `CLAUDE.md` (modified), `HANDOFF.md` (deleted) with `HANDOFF(depracted).md` (untracked), `docs/input/product-ideas.md` (modified), `.claude/skills/`, `docs/reviews/repository-agent-workflow-evaluation.md`, `docs/reviews/repository-agent-workflow-review.md`, `docs/reviews/warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md` (untracked) — are untouched. No commit, push, deployment, migration, seed, or production access was performed. The temporary probe script lives only in the session scratchpad, outside the repository.
