# Phase 5.5 Light — Exercise Catalog Expansion & loadStepKg Decimal Polish: Implementation Report

Date: 2026-08-23
Scope: a bounded content/polish pass on top of the accepted Phase 5 gate
(block lifecycle: deloads, overrides, transitions — independently verified,
deployed, manually accepted on the real iPhone). Not a new phase, not a
taxonomy redesign, not Phase 6 work. Local work only — no commit, no push,
no deploy, no production access. Verification ran against the local Docker
PostgreSQL 16 (`gym-app-db-1`, localhost:5432).

Preserved untouched, per instruction: `CLAUDE.md`, deleted `HANDOFF.md`,
`HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`.
A concurrent read-only taxonomy evaluation produced
`docs/reviews/pre-phase-6-muscle-taxonomy-evaluation.md` during this session
— not read, not depended on, not altered.

---

## 1. Catalog expansion — before/after and coverage

| | Before | After |
|---|---|---|
| Total entries | 40 (doc comment said "~40") | 92 |
| Barbell | 10 | 19 |
| Dumbbell | 12 | 20 |
| Cable | 8 | 18 |
| Machine | 6 | 22 |
| Bodyweight | 4 | 11 |
| Other | 0 | 2 |

**Gaps found in the 40-entry catalog** (via a read-only research pass,
independently spot-checked): traps had **zero primary** coverage anywhere;
calves had exactly one entry; machine was the thinnest equipment category
(only 2 of 6 entries were isolation movements); no sumo deadlift,
close-grip bench, T-bar/Pendlay row, hack squat, Smith machine, push press,
Arnold press, chin-up, walking lunge, or loaded-carry movement existed;
"other" equipment was unused.

**Approach:** appended 52 new entries to the end of `EXERCISE_CATALOG` in
`src/db/seed/exerciseCatalog.ts`. Zero changes to the existing 40 — the
seed ledger means editing an already-shipped slug wouldn't reach existing
users' rows anyway, so touching them would be both pointless and unsafe.
Every new entry: unique slug/name (checked against all 40 existing plus
each other), ≥1 primary contribution, no duplicate muscle group within an
entry, only the 15 canonical `MUSCLE_GROUP_SLUGS` (chest, back, front_delts,
side_delts, rear_delts, traps, biceps, triceps, forearms, abs, quads,
hamstrings, glutes, calves, lower_back — unchanged, no additions, no
hierarchy, no aliases). Muscle groups, equipment/mechanics/laterality
vocabulary, and the primary 1.0 / secondary 0.5 contribution-weight
defaults are all unchanged.

**`loadStepKg` overrides — considered and declined.** The catalog audit
flagged 3 candidates (machine-lateral-raise, machine-triceps-extension,
machine-reverse-pec-deck) for a finer default than the 5.0 kg machine
fallback. This was judged a plausible opinion, not implementation evidence
of a real problem — the task's own guidance was to leave the override path
unused absent evidence, and every seeded value stays user-editable after
creation regardless. **All 52 new entries use the existing equipment-default
fallback; no `SeedCatalogExercise.loadStepKg` field was added.**

## 2. Seed behavior for existing and new users

Verified directly against the real local Postgres (not just PGlite unit
fixtures), against the actual `e2e-smoke@example.com` account that already
had 40 seeded exercises from prior sessions:

1. Ran `pnpm db:seed` — the account went from 40 to 92 exercises. All 52
   additions reached the existing user in one pass.
2. Manually renamed one seeded exercise (`Barbell Back Squat` →
   `PROTECTED EDIT Barbell Back Squat`) directly in Postgres to simulate a
   protected user edit.
3. Ran `pnpm db:seed` a second time.
4. Verified directly via SQL:
   - Exercise count unchanged at 92 (no duplicates inserted).
   - The renamed exercise's name was **unchanged** by the reseed.
   - Zero duplicate `(exercise_id, muscle_group_id)` contribution rows.
   - `exercise_catalog_seed_log` had exactly 92 rows, 92 distinct slugs (no
     duplicate ledger entries).
5. Reverted the manual rename to leave the shared local dev DB clean.

This exercised the existing idempotent-seed mechanism (deterministic
`slugToUuid`, ledger-gated `newItems` filter, arbiter-less
`onConflictDoNothing` for name collisions in `src/db/seed/exercises.ts`)
completely unchanged — no code in the seeding path was touched, only the
data array it reads from. The existing test suite in
`tests/integration/seed.integration.test.ts` already asserts against
`EXERCISE_CATALOG.length` generically (never hardcoded to 40) and already
has a dedicated case for "a new catalog slug colliding with an active
custom name is skipped without blocking the other new slugs" — it required
no changes and passed unmodified against the expanded catalog, closing the
"reaches existing users exactly once" / "reseed is a no-op for prior slugs"
/ "name collision doesn't block unrelated additions" requirements.

A fresh (never-seeded) user seeding for the first time gets all 92 entries
in one pass — same code path, verified by the unchanged
`seeds the full exercise catalog for a user, each with >=1 primary
contribution` integration test.

## 3. loadStepKg defect — root cause and fix

**Confirmed already correct, no fix needed** (verified by direct source
reading, not just the research pass): Zod validation
(`src/domain/exercises/schema.ts`, plain `z.number()`, no `.int()`), the API
routes (`safeParse` → service, no coercion), the Drizzle/Postgres
`numeric(4,2)`/`numeric(6,2)` round-trip (Drizzle's own `PgNumericNumber`
column class does lossless `Number(value)`/`String(value)` regardless of
the raw `pg` driver's string return — no custom type parser needed or
present), deload rounding (`applyLoadMultiplier` uses `roundToStepKg`, not
`Math.round` to a whole kg), the Today bundle/snapshot pass-through
(`buildPrescriptionSnapshotData`, `today/service.ts`), the progression
engine and implicit-decision comparison (`loadHelpers.ts`'s
`roundToStepKg`/`round2` used consistently; 0.25/0.5/1.25/2.5 are all exact
binary fractions, so the `implicitDecision.ts` naive `===` float comparison
cannot false-negative for these four practical steps), and display
formatting (no `.toFixed`/`Intl.NumberFormat` truncation anywhere near
weight/load rendering).

**The real, confirmed defect:** the client-side `<input type="number">`
pattern. Per the HTML number-input value-sanitization algorithm, a value
the browser can't parse as a period-decimal float — e.g. a comma typed
under a German/European iPhone locale — silently collapses `e.target.value`
to `""`, with no error surfaced anywhere. This hit two places directly in
the traced pipeline:

1. `src/ui/exercises/ExerciseForm.tsx` — the loadStepKg field. A collapsed
   value became `undefined` on submit, and `createExerciseSchema`'s
   transform silently substituted the equipment default
   (`DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT`). A user believing they'd set 1.25
   would silently get 2.5.
2. `src/ui/workout/ExerciseCard.tsx` — worse failure mode: `Number("")`
   evaluates to `0`, and the existing `validateSetInput` accepted `0` as a
   legitimate weight (it's the valid domain value for bodyweight-only
   sets), so a comma-collapsed weight entry **silently logged a 0 kg set**
   with no error — corrupting the training log and feeding a wrong value
   into the next session's progression evaluation.

This exact `type="number"` pattern exists identically in 6 files across the
app. Fixed the 3 inside the named trace scope (create/edit exercise UI,
workout controls): `ExerciseForm.tsx`, `ExerciseCard.tsx` (both the
log-set input and the inline set-edit input), and
`RecommendationCard.tsx`'s custom-load override field (a workout control on
the same rounding pipeline, previously only partially guarded).

**Fix:** a new shared helper, `src/ui/decimalInput.ts`:
`sanitizeDecimalDraft` (onChange filter, keeps only digits/comma/dot so the
field still feels numeric while typing) and `parseDecimalInput` (trims,
normalizes `,`→`.`, returns `null` — distinct from a legitimately typed
`0` — for empty/unparseable input). Each of the 3 sites switched
`type="number"` → `type="text" inputMode="decimal"` (keeps the phone's
decimal keypad) and replaced the submit-time `Number(...)` call with
`parseDecimalInput(...)`:

- `ExerciseForm.tsx`: non-empty-but-unparseable loadStepKg → visible inline
  error, submit blocked; empty still means "use equipment default"
  (unchanged behavior); added a client-side bounds check (`0 < x ≤
  MAX_LOAD_STEP_KG`) for snappier feedback than round-tripping to the API.
- `ExerciseCard.tsx`: a `null` parse result now surfaces "Weight is
  required." instead of silently becoming `0`; an explicitly typed `0`
  still parses and remains valid.
- `RecommendationCard.tsx`: same swap in `submitCustom`, tightening the
  existing partial empty-check.

Because normalization happens entirely in the UI layer before the value is
ever serialized, only canonical numbers reach `fetch`/JSON — no
locale-formatted strings enter the domain or persistence layers.

**Deferred (documented, not fixed):** `ContributionEditor.tsx`
(contribution weight 0–1, not a load field), `BlockForm.tsx`/
`WeekOverrides.tsx` (deload multiplier decimals), `PrescriptionForm.tsx`
(`baselineLoadKg`, Phase 2 territory), `HistoryDetail.tsx` (post-hoc set
corrections) — all share the identical `type="number"` pattern and the
same latent defect class, but sit outside the named create/edit-UI +
workout-controls trace scope. Flagged here as a real follow-up, not
silently dropped.

> **Correction (Phase 5.5 Light remediation, 2026-08-23):** the independent
> review (`docs/reviews/phase-5.5-light-review.md`, M-1) escalated
> `HistoryDetail.tsx` ahead of the other four — it is the only one of the
> five that silently persists a wrong value with zero validation, the same
> defect class this pass was chartered to close. All five listed here were
> subsequently closed in `docs/reviews/phase-5.5-light-remediation.md`,
> reusing this same `src/ui/decimalInput.ts` helper.

## 4. Files changed

- `src/db/seed/exerciseCatalog.ts` — 52 new entries appended; doc comment
  count corrected.
- `src/ui/decimalInput.ts` (new) — `sanitizeDecimalDraft`,
  `parseDecimalInput`.
- `src/ui/exercises/ExerciseForm.tsx`, `src/ui/workout/ExerciseCard.tsx`,
  `src/ui/workout/RecommendationCard.tsx` — decimal-input fix.
- `README.md` — stale "Phase 0" status line corrected to reflect Phases
  0–5 deployed/accepted + this pass; no broader rewrite.
- Tests (see §5): `tests/unit/exerciseCatalog.test.ts`,
  `tests/unit/decimalInput.test.ts`, `tests/unit/loadHelpers.test.ts`
  (new); `tests/integration/exercises.integration.test.ts`,
  `tests/unit/applyWeekModifiers.test.ts`,
  `tests/unit/progressionMatrix.test.ts` (extended);
  `tests/e2e/exerciseDecimalInput.spec.ts` (new).

## 5. Test and verification results

**Unit** (`pnpm test:unit`): **322 passed, 0 failed**, 27 files. New/changed
files: `exerciseCatalog.test.ts` (7 — unique slugs/names, valid enums,
valid muscle groups, ≥1 primary, no duplicate contributions, ≥80-entry
floor), `decimalInput.test.ts` (8 — comma/dot normalization, empty→null,
garbage→null, explicit `0` stays valid), `loadHelpers.test.ts` (6 —
`roundToStepKg` across 0.25/0.5/1.25/2.5 plus a half-step boundary),
`applyWeekModifiers.test.ts` (+1 fractional-step case), `progressionMatrix.test.ts`
(+1 supplementary fractional-`loadStepKg` case, existing 14-case matrix
untouched/unrenumbered).

**Integration** (`pnpm test:integration`, PGlite): **155 passed, 0
failed**, 12 files, including the full unmodified
`seed.integration.test.ts` suite (16 tests) run against the expanded
92-entry catalog, and a new decimal-round-trip test in
`exercises.integration.test.ts` (create at 1.25, update to 0.25, verified
on every subsequent read).

**Build** (`pnpm build`): clean, all 25 static/dynamic routes compiled, no
type or lint errors surfaced during build.

**Lint / format / typecheck** (`pnpm lint`, `pnpm format:check`, `pnpm
typecheck`, `pnpm typecheck:sw`): all clean.

**E2E** (`pnpm test:e2e`, against local Postgres): **14 of 15 specs
passed.** The two new specs in `exerciseDecimalInput.spec.ts` pass on a
phone-sized (390×844) viewport: comma-typed `loadStepKg` on exercise
create round-trips to exactly `1.25` (not silently reset to the 2.5
equipment default), and a comma-typed workout set weight logs as exactly
`82.5 kg` (not `0`, not dropped). One failure,
**`offline-cold-launch.spec.ts`**, is unrelated to this work — verified
directly by `git stash`-ing every file this pass touched, rebuilding, and
re-running that spec against the unmodified Phase-5 codebase: it fails
identically (30s timeout) with none of this pass's changes present.

> **Correction (Phase 5.5 Light remediation, 2026-08-23):** the independent
> review traced this failure and found the conclusion above wrong in one
> respect. The suite is not "14 of 15, one pre-existing gap" — it is **15 of
> 15 green** from clean state, in isolation and in the full suite. The
> failure was a state-latched race: `tests/e2e/helpers.ts`'s
> `ensureNoActiveSession` probed the takeover button with a one-shot,
> non-retrying `isVisible()` immediately after `login()` returned, which
> could fire while the page was still on TodaySection's
> `remoteState.kind === "checking"` loading gate (neither button rendered
> yet); combined with a leftover `in_progress` session left behind in the
> shared local dev Postgres by this pass's own prior e2e run, that produced
> the exact same 30s timeout regardless of which files were stashed — which
> is why the `git stash` check above looked like proof of a pre-existing,
> codebase-independent gap rather than what it actually was: a harness race
> that a leftover row happened to trigger deterministically. Closed in
> `docs/reviews/phase-5.5-light-remediation.md` by fixing the helper to wait
> for remote-state resolution and adding regression coverage
> (`tests/e2e/ensureNoActiveSession.spec.ts`); not a real gap in this local
> environment's e2e coverage and not a product defect.

**Database verification** (local Docker Postgres 16, real account, not
PGlite):
- `pnpm db:migrate`: applied cleanly, no pending migrations.
- `pnpm db:generate`: **"No schema changes, nothing to migrate"** — no
  drift, confirming the plan's expectation that no migration was needed.
- `pnpm db:seed` run twice against the same account: exercise count went
  40 → 92 → 92 (stable); a manually-injected protected rename survived
  both the second seed run unchanged; zero duplicate exercises,
  contributions, or ledger entries (verified via direct SQL, not just
  application-level assertions).

## 6. Schema / migration status

**No migration.** Both changes are seed-data and application-layer only.
`drizzle-kit generate` confirmed zero schema drift after the full test/build
cycle.

## 7. Limitations and deferred work

- The 3 `loadStepKg`-override candidates flagged by the catalog audit
  (machine-lateral-raise, machine-triceps-extension, machine-reverse-pec-deck)
  were deliberately **not** given per-entry overrides — considered and
  declined, not silently skipped (§1).
- The decimal-input fix covers exactly the create/edit exercise UI and
  workout controls named in scope. ~~Four~~ **Five** other components share
  the identical `type="number"` defect pattern and were deliberately left
  unfixed as out of scope: `ContributionEditor.tsx`, `BlockForm.tsx`,
  `WeekOverrides.tsx`, `PrescriptionForm.tsx`, `HistoryDetail.tsx` (§3).
  *(Correction: the count was mistyped as "four" while listing all five —
  see the review's L-8. All five were subsequently closed in the Phase 5.5
  Light remediation pass, `docs/reviews/phase-5.5-light-remediation.md`.)*
- ~~`offline-cold-launch.spec.ts` remains failing, pre-existing, unrelated,
  and unfixed (§5) — a real gap in this local environment's e2e coverage
  that predates this work and is outside its scope.~~ *(Correction: this was
  wrong. The suite is 15/15 green from clean state; the failure was a
  state-latched race in `ensureNoActiveSession` triggered by a leftover
  session left behind by this pass's own e2e run, not a persistent gap. See
  the §5 correction above and `docs/reviews/phase-5.5-light-remediation.md`.)*
- No granular muscle taxonomy, hierarchy, rollups, Phase 6 volume work, or
  any of the other items the task explicitly excluded were touched.
- **Manual iPhone acceptance of this pass is still pending** — nothing in
  this report substitutes for the human performing it.

## 8. Verdict

**READY FOR INDEPENDENT REVIEW.**
