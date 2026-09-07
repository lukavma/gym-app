# Metrics Dashboard — Targeted Verification of the Evaluation Revision

Date: 2026-09-06
Role: targeted verification that the revised `docs/reviews/metrics-dashboard-architecture-evaluation.md` (now 726 lines, revision log in its Appendix D) closes every finding of `docs/reviews/metrics-dashboard-architecture-review.md` (385 lines, unmodified), without regression, scope creep, or a silently-made owner decision.
Repository state: `main` @ `1282795`, plus the pre-existing uncommitted working-tree changes, untouched.
Scope: verification only. This is **not** a second architecture review — no new architectural ground was covered, no finding was remediated, and no file other than this one was created or modified. Two focused probes were run (Appendix A).

---

## 1. Verdict

# `VERIFIED — READY FOR OWNER DECISIONS (O-1 … O-11)`

All **27** findings of the review are closed: **RH-1, RH-2** (High), **RM-1 … RM-8** (Medium), and **RL-1 … RL-17** (Low) — which includes all six Lows the review's §7 required (RL-3, RL-4, RL-5, RL-6, RL-12, RL-14) and the eleven further Lows the revision log claims. **No Low is retained open**, and the revision log's claim to that effect is accurate: every one of the seventeen is either implemented as the review specified or resolved by a stated, defensible equivalent. Nothing was closed by assertion alone — the two closures whose truth is checkable against the repository (I-2's pattern list, RL-16's contribution ratio) were **probed and confirmed**, and the recomputed statement arithmetic was reproduced branch by branch.

The two High findings were closed by taking the review's own offered options and documenting them where the contradiction used to be: **RH-1 → option (b)** (the future guard kept as tracker parity, the Volume divergence named in §4, §8, R-1, R-2, I-6 and asserted by three A-2 fixtures), **RH-2 → option (a)** (step 3 projects `{ session_id, is_warmup }` rows; the domain filters and counts). Both are now internally consistent everywhere they are mentioned; no residue of either contradiction survives anywhere in the file.

Everything the review confirmed correct is intact — the five-card / read-only / one-endpoint / computed-on-read design, all seventeen Appendix B repository findings, the §2 repository-fact base, §10's misleading-analytics line, and the boundary set. **No implementation, migration, cache, IndexedDB, sync, or Today-bundle scope was introduced.** O-2 and O-10 carry the revised recommendations with their alternatives preserved; **O-11 is added** for the partial-Phase-9/OD-04 question; the "nothing is binding until an Owner decision addendum" clause is unchanged and every owner decision remains open.

Three **non-blocking observations** are recorded in §6. None blocks owner decisions or implementation; each is a small, optional tightening of something the revision itself introduced.

---

## 2. High findings — closure

### RH-1 — future-session guard vs Volume parity → **CLOSED (option b)**

The review offered (a) parity or (b) deliberate, disclosed divergence, and recommended (b). The revision takes (b) and states it in every place the contradiction used to live:

| Where | What it now says | Status |
| --- | --- | --- |
| §4 M-1 | The guard is "**tracker parity** … and a **deliberate divergence from Volume**, which has no such guard — disclosed in §8 and R-1, asserted by A-2" | ✔ |
| §4 closing rule | "Future-dated rows are ignored by Training, Strength, Bodyweight and Recovery … **Volume is the exception by design:** `getWeeklyVolumeReport` is reused unchanged and has no upper bound relative to today" | ✔ |
| §8 | Names it as the third of three divergence cases | ✔ |
| §16 **I-6** | Retitled "**Convention parity, with one named divergence**" and rewritten: the dashboard's own sections follow the tracker's rule, the Volume card follows the Volume screen's, "the dashboard puts them on one screen and says so" | ✔ |
| §18 R-2 | Retitled "Session-set asymmetry between Training/Strength and Volume — **intentional**", covering both the in-progress and the future-dated case | ✔ |
| **A-1** | "counts in neither `training` nor `strength` (**it still counts in `volume` — A-2**)" | ✔ |
| **A-2** (iii) | "a completed session with `started_at` two days after `D` **inside `W0`** → present in `volume.weeks[0]`, absent from `training.weeks[0]` and from `strength`. Each of the three is asserted as a divergence, not denied." | ✔ |

A-1 and A-11 are now jointly satisfiable, and A-2 (iii) asserts exactly the behaviour A-1 no longer denies. The `inside W0` qualifier in A-2 (iii) is a necessary precision the review did not spell out — a future date outside `W0` falls beyond the volume report's newest window entirely — and the revision supplies it unprompted. The phrase "counts nowhere" no longer appears in the file.

### RH-2 — warm-up filter and count in SQL → **CLOSED (option a)**

The review offered (a) follow the `aggregateVolume` precedent or (b) retract the §4 rule; it recommended (a). The revision takes (a):

- **§11.2 step 3**: "`session_id, is_warmup` **rows** (no `is_warmup` predicate, no `count`) — the domain drops warm-ups and counts (M-2, the `aggregateVolume` precedent)"; row estimate raised from "≈ 40 groups" to "≈ 1,600 rows", consistent with the projection.
- **§4 M-2**: "delivered to the domain as `{ sessionId, isWarmup }` rows; the domain drops `isWarmup = true` and counts".
- **§4 rule**: now "Only `user_id`, `status` and the time bounds are decided in SQL … **§11.2 step 3 therefore projects rows, never a predicate on `is_warmup` and never a `count(*)`**."
- **A-2** is retagged `(Domain + Integration)` and now has a subject: "the domain receives `{ sessionId, isWarmup }` rows and excludes `isWarmup = true` from `workSets` (a fixture with warm-up rows proves it — **the query hands them over unfiltered**)."

`count(*)` now appears exactly once in the file — in the §4 rule that forbids it. The quoted `aggregateVolume` precedent is now followed rather than inverted.

---

## 3. Medium findings — closure

| ID | Review's requested remedy | What the revision does | Verified | Status |
| --- | --- | --- | --- | --- |
| **RM-1** | Fix §4 M-5 to say two weeks | §4 M-5 Range now reads "the DTO carries **exactly these two weeks** (`weeks.slice(0, 2)`, the one authoritative shape; §11.1, A-11)"; "the full 5 weeks travel in the DTO" is gone from the file | §4/§11.1/§11.2/A-11 now agree; A-11 also gains "has length 2" | **CLOSED** |
| **RM-2** | Exact count per fixture, ≥ 5 in-window exercises, correct the "no headroom" sentence | §11.2 header now "11 minimum, 13 typical, 15 worst case"; §11.3 replaces the ceiling with exact counts and states that the **boundedness clause is the load-bearing half against an N+1**; A-12 pins **exactly 11** (fixture A) and **exactly 13** (fixture B), both with **≥ 5 distinct eligible exercises**, plus a third 2-exercise fixture that must also yield 13 (exercise-count independence) | Arithmetic reproduced branch by branch (§5.1 below): 11 / 12 / 13 / 13 / 14 / 15, non-volume = 7. "no headroom" no longer appears; the `12 + N` N+1 figure is correct | **CLOSED** |
| **RM-3** | Restate I-11 around step 8's `ORDER BY`; split A-6 | §11.2 step 8 carries "**`ORDER BY exercise_id, started_at, position, set_number`** — the order is part of the contract (I-11), not an implementation note"; I-11 now separates the order-independent sections from the index and names the ambiguous case (`uq_session_exercise_position (session_id, position)`); A-6 split into (a) shuffle-free sections, (b) equal-key re-ordering, (c) **a same-exercise-at-two-positions fixture proving why the order is binding** | I-11's account of the stable sort and the permitted duplicate matches `observation.ts:100-101` and `sessionExercises.ts:108` | **CLOSED** |
| **RM-4** | Disclose both deload divergences; make A-11's fixture a deload session | §8 rewritten as "**Two meanings of one badge, both disclosed**", enumerating **three** cases (no-work-set deload → Training only; in-progress deload, "arbitrarily old, since `uq_sessions_one_in_progress` permits one long-lived row" → Volume only; future-dated completed deload → Volume only); the shared word is kept with a stated rationale and the Volume caption gains "Includes the workout in progress."; A-11's fixture is an in-progress deload; A-2 adds fixtures (i)–(iii) | All three cases check out against `aggregate.ts:157` and `volume/service.ts:200-211`; the new caption is in the wireframe and in §15's must-appear list | **CLOSED** |
| **RM-5** | Print the mean's own count; add to §15 and A-5 | M-12 now "DTO carries **its own** count, which the display prints (`mean sleep 7.1 h (2 of 7 days)`) — this count differs from M-11 whenever a check-in logs only ratings"; wireframe line updated; §15 must-appear adds "the mean-sleep line's own count in the form `(n of 7 days)`"; A-5 adds the concrete fixture (5 check-ins, 2 with `sleepHours` → `daysLogged = 5`, `meanSleepHours.count = 2`) | I-10 ("every average carries its entry count") is now true of the rendered page | **CLOSED** |
| **RM-6** | Add `eq(exercises.userId, userId)` to step 9 | Step 9 now "**and `user_id = :userId`**", with the tracker's rationale quoted (ADR-011 review RL-10) and the reason spelled out ("the sync path never verifies that an ad-hoc `exerciseId` belongs to the caller"); index column updated to `pk, ix_exercises_user_id`; A-12 adds "Step 9's text contains `user_id` (RM-6)" | `ix_exercises_user_id` exists (`src/db/schema/exercises.ts:59`) | **CLOSED** |
| **RM-7** | Add the identifier naming constraint to §20 step 1; state the re-export requirement in §15 | §15 splits the bans into *source **and** copy scope* (`PR`, `1RM`, `personal record`, `recommend`, `research`, `predict`, `improv`, `declin`, `streak`, `adherence`, `compliance`, `correlat`, `sleep debt`, `ready to train`, glyphs) and *copy scope only* (`badge`, `target`, `score`, `trend`, `goal`, `fatigue`, `affect`, `impact`, `because`, `caused`, `recovered`, `optimal`), with the reason (`readableSource` strips only comments and SCREAMING_SNAKE). The re-export requirement is explicit: `allCopyStrings()` "must include, **by value**, every sentence imported from `@/ui/strength/copy`". §20 step 1 now carries **two** numbered naming rules, the second listing the source-scoped words verbatim | The `readableSource` description matches `strengthCopy.test.ts:68-73` exactly | **CLOSED** (see observation §6.1) |
| **RM-8** | Restate the budget for the machine measured; note the first remedy is a migration | §11.3: "the machine it is actually measured on — the local Docker PostgreSQL 16 … The budget is stated **for that machine**: p95 ≤ 100 ms server time locally, taken as a proxy for the 300 ms p95 that would be acceptable on the production B1/B1ms pair; **no claim about production hardware is made from a local run**"; "**The first remedy is a migration**, so the 'no migration' boundary (B-3, I-2) is unconditional only while the budget is met". A-25 reworded to match and adds the `pnpm db:migrate` prerequisite (F-17) | "B1/B1ms-class hardware" as a budget attribution no longer appears | **CLOSED** |

---

## 4. Low findings — closure

### 4.1 The six the review's §7 required

| ID | Requested | Revision | Status |
| --- | --- | --- | --- |
| **RL-3** | A-16 should decode the service's return value, not the route's | A-16: "round-trips **the service's return value** through `JSON.parse(JSON.stringify(...))` and checks it against the same type with a `satisfies` assertion (the route cannot be executed on PGlite — A-10; its envelope `{ metrics }` is checked by e2e)" | **CLOSED** |
| **RL-4** | Split A-19's cold / warm cases | A-19 now has three named cases: (i) cold navigation → the offline shell's `/metrics needs a connection. …`; (ii) warm page, no data → `Offline — metrics need a connection.`; (iii) warm page with data → `Offline — showing metrics as of …`. It also records that the SW is active under e2e ("disabled only in development and Playwright runs the production build") | **CLOSED** — the e2e-SW claim is correct (`next.config.ts:14`, `playwright.config.ts:6-30`) |
| **RL-5** | Make `exact: true` the stated rule | §12.2: "because Playwright matches accessible names by **substring** … 'History' still matches 'Full history' — so **the binding locator rule for every metrics spec is `getByRole("link", { name, exact: true })`**, and the distinct names are what make `exact: true` unambiguous" | **CLOSED** |
| **RL-6** | Describe `phase7Remediation.spec.ts` as it is | §12.1 now: "its bounding-box loop over the seven link names runs on `/today` only, across four viewports (375×667, 390×664, 390×844, 430×844); its per-route loop visits six routes and asserts only `scrollWidth` and the visibility of the 'Recovery' link. Adding 'Metrics' … is one edit … `/metrics` is **not** covered by that spec — A-17 covers it" | **CLOSED** — matches the spec's `VIEWPORTS` and both loops exactly |
| **RL-12** | Withdraw A-23 in favour of A-22 | A-23 marked "*Withdrawn*" with the reason and "Numbering is kept so the review's references stay valid" | **CLOSED** |
| **RL-14** | Record the partial-Phase-9/OD-04 ordering as an owner decision | **O-11 added** (§21) with three options and the closing sentence "This is a sequencing decision the plan reserves for the owner; **the evaluation does not make it**"; §20 step 5 names the concrete `implementation-plan.md` "Phase 9a" edit, the `open-decisions.md` OD-04 trigger note and F-7's `mvp-scope.md` edit; Appendix A updated to "O-1…O-11" | **CLOSED** |

### 4.2 The eleven further Lows

| ID | Revision | Verified | Status |
| --- | --- | --- | --- |
| **RL-1** | §13 now: "unlike the strength page, whose observation list renders every plotted point as text, the metrics card has no list, so its text alternative is a **summary line** — entry count, first, latest, lowest and highest value — and the individual daily points exist only as pixels (RL-1, **accepted**: the 90 values are one tap away on `/bodyweight`)". "every number is text" softened to "every number that drives a reading is text"; M-9 and the wireframe carry the summary | The residual gap is now stated and accepted rather than denied — the honest resolution the review asked for | **CLOSED (accepted, disclosed)** |
| **RL-2** | M-9: "Sparkline draws **points only** … no connecting line, so a gap is empty space rather than a segment that reads as interpolation"; §20 step 3 lists it as the second of two deliberate differences from the strength component; wireframe shows discrete points | `polyline` now appears only as the thing *not* drawn | **CLOSED** |
| **RL-7** | R-1 now names it: "The Volume card omits the `raw` ('N direct') figure `/volume` prints beside every group (RL-7)", alongside the 90-day bodyweight difference | Matches `MuscleRow.tsx:44-47` | **CLOSED** |
| **RL-8** | The second bodyweight statement is gone: step 10 is "one statement; the former older-entry count is dropped"; `olderEntryCount` removed from the DTO; M-6's empty state simplified to the sentence plus the "Bodyweight log" link | `olderEntryCount` survives only in the Appendix D log line; statement totals recomputed accordingly | **CLOSED** |
| **RL-9** | §8: the card "carries the metrics-owned sentence `Deload sessions are not counted.` **and nothing more**; the evidence-backed dip sentence stays on the detail page, where the trend actually is"; §9 and the wireframe updated | | **CLOSED** |
| **RL-10** | Every window and threshold carries `[P]` in §4 (8 weeks, 90 / 7 / 30 days, `≥ 3` entries — "a coverage floor, **calibrated to nothing**"), closed by a summarising sentence in ADR-011's labelling vocabulary | | **CLOSED** |
| **RL-11** | I-2 rewritten "the way `strengthBoundary.test.ts` enforces its column claim": a named seven-pattern list, an anti-vacuity witness (`numeric("tonnage_kg")`) and a negative control | **Probed** (Appendix A, probe 1): **0 hits** across all 36 schema + migration files; the witness fires. The negative control is real, not assumed | **CLOSED — probe-confirmed** |
| **RL-13** | §11.3: "The visibility refetch is a **new** client behaviour, not an inherited one — `visibilitychange` occurs once in `src/`, in the outbox flusher — and an unthrottled listener issues one full request per foregrounding, including rapid app-switching; accepted because the request is bounded" | Matches `src/sync/flush.ts:160` | **CLOSED** |
| **RL-14** | (see §4.1) | | **CLOSED** |
| **RL-15** | §11.2 steps 4–7: "4 statements minimum (the `users` read, the fact join, the `programs` read, and then **either** the `users.default_volume_preset_id` read **or** a `blocks` read — one of the two always runs)" | Correct: `resolveActivePreset` branches to exactly one of the two after `programs` (`volume/service.ts:148-175`) | **CLOSED** |
| **RL-16** | "≈ 2.2 contributions per exercise on the local catalogue" | **Probed** (Appendix A, probe 2): 106 exercises / 234 contribution rows = **2.21**. `2.4` no longer appears | **CLOSED — probe-confirmed** |
| **RL-17** | §12.2: "`tabular-nums` (a **new** utility in this codebase — 0 occurrences today — introduced here for numeric columns)" | | **CLOSED** |

### 4.3 Retained items

**None retained open.** The revision log's closing line "No Low is retained open" is accurate. One item — **RL-1** — is closed by *acceptance rather than change*: the 90 daily bodyweight values remain visual-only, with a summary text alternative. That is explicitly identified in §13 ("RL-1, accepted"), defended on the ground that the full series is one tap away on `/bodyweight`, and the over-broad claim that motivated the finding ("every number is text") was corrected. This is a defensible retention, properly labelled — which is exactly what the review asked for.

---

## 5. Regression and boundary checks

### 5.1 Recomputed statement arithmetic — reproduced

Non-volume statements are 7 (steps 1, 2, 3, 8, 9, 10, 11) after RL-8 dropped the second bodyweight read. Reading every `db.select()` in `getWeeklyVolumeReport` / `resolveActivePreset` (`src/server/volume/service.ts:148-257`) reproduces the revision's six branches exactly:

| Branch | Volume | Total | Evaluation says |
| --- | --- | --- | --- |
| no active program, no default preset | 4 | **11** | 11 ✔ |
| active program, block without preset, no default | 5 | 12 | 12 ✔ |
| no active program, default preset resolves (common) | 6 | **13** | 13 ✔ |
| active program, active block whose preset resolves | 6 | 13 | 13 ✔ |
| active program, block without preset, default resolves | 7 | 14 | 14 ✔ |
| block preset id that fails to resolve, then the default | 8 | **15** | 15, "unreachable through the application" ✔ |

The N+1 figure is also right: dropping step 8 and scanning per exercise while keeping the step-9 metadata lookup gives `6 + 6 + N = 12 + N`, as §11.3 states. A-12's choice to pin 11 and 13 and to prove exercise-count independence with a third fixture removes the slack the review objected to.

### 5.2 Previously confirmed-correct behaviour — unchanged

Spot-checked against the review's §4 (Confirmed correct). All intact and unaltered:

- **§2 repository-fact base** — `setCount` counts all set rows, `WEEK_COUNT = 5`, `EVIDENCE_WINDOW_DAYS`, the "no react-query" comment, the `NetworkOnly` catch-all, the Today staleness precedent, the visual system, the ESLint layer table, the `uq_bodyweight_day` / `ck_recovery_entries_has_metric` schema facts, "Show archived", `ix_sessions_user_started`.
- **§5** time semantics, **§7** archived-exercise posture (including the verbatim "This exercise is archived. Its history is still shown here."), **§9** discoverability and the reused copy list, **§10** the useful-vs-misleading tables (`compliance scoring`, "reference range", EVIDENCE-027, ADR-011 N-4), **§11.2**'s "why the index projects `current` only", **§11.4** alternatives, **§14** offline/staleness, **§17** non-goals, **§22** modifications.
- **§16** invariants I-1, I-2 (strengthened), I-3, I-4, I-5, I-7 … I-10, I-12 unchanged in substance; only I-6 and I-11 were rewritten, both as the review required.
- **Appendix B** — all **17** findings F-1 … F-17 present and unchanged, all still accurate against the repository.
- Counts: 12 invariants, 25 acceptance criteria (A-23 withdrawn, numbering preserved), 15 deferred items, 13 rejected alternatives, 8 modifications, 11 owner decisions.

### 5.3 Scope intact

| Boundary | Check | Status |
| --- | --- | --- |
| Five cards | §1, §3.1, §12.2 and B-1 all list exactly five, now in the O-10 order (Current estimates, Training, Weekly volume, Bodyweight, Recovery) | ✔ |
| Read-only | I-1 unchanged; no POST/PATCH/DELETE anywhere; A-13 unchanged | ✔ |
| One endpoint | `GET /api/metrics` only; §11.1 unchanged apart from the DTO's `olderEntryCount` removal and the `meanSleepHours.count` comment | ✔ |
| One route, one nav link, one pure module, one service, one UI folder | §3.1 unchanged | ✔ |
| No implementation performed | Working tree carries only this new file (§5.6); no `src/`, `tests/`, `drizzle/` change | ✔ |
| No migration / cache / IDB / sync / Today-bundle scope | Every occurrence of those words in the file is a negation, a repository fact, a rejected alternative (X-1/X-3), or the **explicitly flagged conditional** first performance remedy (§11.3, RM-8). B-3, I-1, I-2, N-9, N-11 unchanged | ✔ |

### 5.4 O-2 and O-10 carry the revised recommendations

- **O-2** is now "Training range **and row shape**: 8 calendar weeks, **one compact line per week** (recommended; two mesocycle halves in ≈ 200 px, so the card below it stays near the first viewport) **vs** 12 weeks, **or** 8 weeks with the earlier two-line rows." The recommendation changed; the original option survives as an alternative, and a third (12 weeks) is retained. §12.2, §3.1 and §1 all reflect it.
- **O-10** is now "Card order: **Current estimates first, Training second** (recommended — it is the only card whose content is not one nav tap away … at the repository's tight 390×664 measurement viewport a Training card above it would push the first estimate row to or below the fold) **vs Training first**. If the owner prefers Training first, **A-17 gains a measured assertion in HIGH-2's style**: the first estimate row's `boundingBox().y + height ≤ 664` at 390×664." Both the recommendation and the review's requested fallback assertion are present. §1, §3.1, §12.2 and B-1 all reflect the new order.

### 5.5 O-11 recorded; no owner decision silently made

- **O-11** exists in §21 with three options (approve as "Phase 9a" with OD-04 open / resolve OD-04 first / decline the partial phase), the exact document quotations that create the tension, and the sentence "This is a sequencing decision the plan reserves for the owner; **the evaluation does not make it**." §20 step 5 names the concrete edits it would authorise; Appendix A's index is updated to O-1…O-11.
- The binding clause is unchanged: "nothing in this document is binding until an `## Owner decision addendum — <date>` is inserted at the top of this file."
- Every one of O-1 … O-11 still presents at least two options with a labelled recommendation. The two changed defaults (O-2, O-10) are labelled "recommended", not adopted. Nothing moved from the O-list into the binding B-list; B-1's card-order change carries "(O-10)" as its authority.
- The RH-1 and RH-2 resolutions are engineering choices between the two options the review itself offered, and Appendix D records which was taken in each case — not owner decisions removed from the ledger. **Verified: no owner decision was silently made.** (See observation §6.3 for the one nuance.)

### 5.6 Working tree

`git status --short` is identical to before this verification except for the addition of `docs/reviews/metrics-dashboard-architecture-revision-verification.md`. The review file is byte-intact (385 lines, verdict header at line 12, all 27 finding ids present). All unrelated changes — `CLAUDE.md`, the `HANDOFF.md` deletion and `HANDOFF(depracted).md`, `docs/input/product-ideas.md`, `.claude/skills/`, the two `repository-agent-workflow-*` documents, `warmup-routines-evidence-research.md`, `gpt-handoff.md`, `gpt-memory.md` — are untouched.

---

## 6. Non-blocking observations

These concern small claims the **revision itself introduced**. None reopens a finding, none blocks owner decisions, and each is optional.

**6.1 — The copy-ban split is wider than the problem required (RM-7).** The review's objection was that `badge` and `target` collide with unavoidable React/DOM vocabulary (`event.target`, a `Deload` badge component). The revision moves twelve words to copy-scope: `badge`, `target`, `score`, `trend`, `goal`, `fatigue`, `affect`, `impact`, `because`, `caused`, `recovered`, `optimal`. Only the first two are plausibly code vocabulary; the rest are not, and moving them out of the source scan leaves a small hole — a user-facing string written inline in JSX rather than in `copy.ts` (e.g. `<span>Trend</span>`) would escape both scopes. §15's opening rule ("Every user-facing string … lives in `src/ui/metrics/copy.ts`") is the mitigation, but nothing enforces it. *Optional tightening:* keep only `target` and `badge` copy-scoped, or add one assertion that `src/ui/metrics/**` contains no JSX text node outside `copy.ts`.

**6.2 — O-2's "fits 264 px" is arithmetic, not measured.** `Aug 31 – Sep 6 · 4 sessions · 71 work sets` is 42 characters; at `text-xs` (12 px) in a system sans this is roughly 260–270 px, i.e. comfortably inside the 334 px column at 390 px but at the boundary of the 264 px column at 320 px, and a week with a three-digit set count would cross it. The consequence of being wrong is benign — the row wraps and the card grows back toward its former height, which A-17's no-horizontal-overflow assertion already tolerates — but the ≈ 200 px figure is the whole justification for O-2's new default. *Optional:* have A-17 assert the Training card's rendered height or line count at 390×844, the viewport the O-2 argument is actually about.

**6.3 — RH-1's product half is disclosed but is not itself an O-n.** "Should a completed session dated tomorrow count as done?" is a user-visible convention, and the revision answers it (no, for Training/Strength; yes, for Volume, by reuse). It is documented in six places and asserted by a fixture, and it is the option this review's predecessor explicitly recommended — so it is **not** a silently-made decision, and the owner can still reject it through the addendum. Recording it as a bullet under O-1…O-11 would make that rejection easier to express, but its absence is not a defect.

---

## Appendix A — Probes

Both probes were read-only and left nothing in the repository.

**Probe 1 — I-2's pattern list (RL-11).** A standalone Node script applied I-2's seven declared patterns (`/tonnage/i`, `/work_?sets?/i`, `/sessions?_(per|count)/i`, `/(rolling|seven_day|thirty_day|avg|average)_/i`, `/metrics?_/i`, `/dashboard/i`, `/snapshot_(kg|count)/i`) to every file under `src/db/schema/**` plus every `drizzle/*.sql`:

- **36 files scanned, 0 hits** — the negative control I-2 claims is genuine, not assumed.
- The anti-vacuity witness fires: `numeric("tonnage_kg")` matches. I-2 is therefore a real assertion, unlike the pattern-less grep it replaces.

**Probe 2 — contribution ratio (RL-16).** Read-only `psql` against the local development database (`gym-app-db-1`): 106 exercises, 234 `exercise_muscle_contributions` rows → **2.21** per exercise, matching the revision's "≈ 2.2".

No production system was contacted.

## Appendix B — What was checked

**Read in full or in the changed part:** the revised `docs/reviews/metrics-dashboard-architecture-evaluation.md` §§1, 3, 4, 5, 6, 7, 8, 9, 11.1–11.4, 12.1, 12.2, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, Appendix A, Appendix B, Appendix C, Appendix D; `docs/reviews/metrics-dashboard-architecture-review.md` (integrity check only).

**Re-checked against the repository** for the revision's new or changed claims only: `src/server/volume/service.ts` (branch-by-branch statement count, RL-15's "one of the two always runs"), `src/db/schema/exercises.ts` (`ix_exercises_user_id`, RM-6), `src/db/schema/sessionExercises.ts` (`uq_session_exercise_position`, RM-3), `src/domain/strength/observation.ts` (stable set sort, RM-3), `src/domain/volume/aggregate.ts` (`isDeload` over work rows, RM-4), `tests/unit/strengthCopy.test.ts` (`readableSource` scope, RM-7), `tests/e2e/phase7Remediation.spec.ts` (viewports and both loops, RL-6), `next.config.ts` / `playwright.config.ts` (SW active under e2e, RL-4), `src/sync/flush.ts` (RL-13), `src/ui/volume/MuscleRow.tsx` (RL-7), plus the two probes above.

**Deliberately not repeated:** the general architecture review, the repository-fact survey of §2, the evidence-corpus checks, the Appendix B findings' original verification, and every claim the review already confirmed and the revision did not touch. No test suite, build, lint or typecheck was run — none is required by any closure, and the revision changes no source.

## Appendix C — Working-tree impact

Created: `docs/reviews/metrics-dashboard-architecture-revision-verification.md` (this file). Nothing else was created, modified, or deleted; in particular neither the evaluation nor the review was touched by this verification. No commit, push, deployment, migration, seed, or production access was performed. The probe script lives only in the session scratchpad, outside the repository.
