# Phase 6 — Volume Tracking: Independent Review

Reviewer: fresh session, independent of the implementation session. Date: 2026-08-24.
Subject: the local, uncommitted Phase 6 working tree as it exists **now** — not as `docs/reviews/phase-6-implementation.md` describes it (see M-1).

Constraints honoured: no implementation file modified; no finding fixed; `docs/reviews/phase-6-implementation.md` untouched; nothing committed, pushed, or deployed; no production access. User-owned files (`CLAUDE.md`, `HANDOFF.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`) untouched. All destructive and adversarial probing ran against two dedicated disposable PostgreSQL 16 databases (`gymapp_p6rev`, `gymapp_p6e2e`), both dropped afterwards. The shared dev database `gymapp` was never written to. `git status` before and after this review is byte-identical apart from this file (§10).

Neither the implementation report nor the shipped test suites were treated as behavioural proof. Every claim below rests on a probe I wrote and executed, or on direct inspection of source, live schema, or rendered DOM.

---

## 1. Executive summary

**0 BLOCKER · 0 HIGH · 3 MEDIUM · 11 LOW.**

The engineering core of this phase is correct, and I established that against my own numbers rather than by re-running the shipped fixtures.

- A hand-computed five-week fixture I derived independently — different exercises, different contribution weights, a different timezone (`Australia/Lord_Howe`, a fractional-offset zone with 30-minute DST), a different week start (Sunday) — reproduced the implementation's output **exactly, on every one of ~45 compared values, on the first run**, end to end through real PostgreSQL 16, the real SQL join, the real timezone conversion and the real domain aggregator.
- The ADR-010 sum-preservation invariant holds under my own partition-faithful pre-v2/post-v2 pair: `effective 9.4 → 9.4`, `raw 7 → 7`.
- Live schema, migration order, both D-02 foreign keys, RP seed fidelity (all 52 rows transcribed against source), seed idempotence including landmark IDs, builtin immutability, ownership isolation, copy-on-edit, rollback, and **real** concurrency safety on real PostgreSQL all verified correct.
- Every gate is green: typecheck, typecheck:sw, lint, format:check, 408/408 unit, 208 passed / 4 skipped integration, build, `db:generate` no-drift, and 22/22 Playwright on a freshly migrated and seeded disposable database.
- The phone UI at 390×844 renders all 18 rows, five week cards, correct M-3-qualified reconciliation copy, the conditional Unclassified Back term, exactly the five intentionally bandless groups, and **all 65 rendered RP bands carry their "Coaching heuristic" label** — including the lowest one at y≈8,487 on a 9,357 px page. No horizontal overflow, no console errors, no forbidden copy, no Phase 7–9 leakage.

**Nothing I found is a production correctness defect.** The three MEDIUM findings are a stale handoff document that omits the phase's most safety-relevant change (M-1), one binding-document passage the M-3 correction missed (M-2), and a shipped concurrency test that provably cannot detect the race it is named after (M-3). All three are small and mechanical, and the third has an established in-repo precedent to copy. On this project's own gate discipline they warrant a short remediation pass rather than proceeding straight to device acceptance.

### Important framing: the tree has moved since the implementation report

`git status` and file timestamps establish that five files were modified **after** the implementation report was written:

| File | mtime | In the report's "Files changed"? |
|---|---|---|
| `docs/reviews/phase-6-implementation.md` | 14:38 | — |
| `src/server/auth/service.ts` | **17:19** | **no** |
| `tests/integration/auth.integration.test.ts` | **17:19** | **no** |
| `src/ui/volume/MuscleRow.tsx` | **17:20** | yes (but not this change) |
| `tests/e2e/volume.spec.ts` | **17:20** | yes (but not this change) |
| `tests/integration/volumeLandmarks.integration.test.ts` | **17:21** | yes (but not this change) |
| `src/server/volume/service.ts` | **17:19** | yes (but not this change) |

Those edits introduce three behaviours the report never mentions: a `pg_advisory_xact_lock` serialising landmark edits, RP General attachment inside `setupAccount`, and per-row provenance + note rendering in `MuscleRow`. **I reviewed the tree, not the report.** All three additions are correct and I verified each independently (§5.4, §5.5, §7.3). See M-1.

---

## 2. Aggregation correctness — my own fixture

### 2.1 Design

Deliberately unlike the shipped fixture: six exercises, twelve sessions, five weeks, non-default weights (0.25/0.30/0.35/0.40/0.45/0.50/0.60/0.75/0.85), user timezone `Australia/Lord_Howe` (UTC+10:30 / +11:00, 30-minute DST), `week_starts_on = 0` (Sunday). `now = 2026-04-15T00:00:00Z`.

Week windows were derived by hand and confirmed against an independent `Intl` oracle (binary search for the earliest instant whose local date equals the target) before any fixture row was inserted:

| Local week start | UTC instant | Offset |
|---|---|---|
| 2026-03-15 | `2026-03-14T13:00:00Z` | +11:00 |
| 2026-03-22 | `2026-03-21T13:00:00Z` | +11:00 |
| 2026-03-29 | `2026-03-28T13:00:00Z` | +11:00 |
| 2026-04-05 | `2026-04-04T13:00:00Z` | +11:00 |
| 2026-04-12 | `2026-04-11T13:30:00Z` | +10:30 (DST ended 2026-04-05) |
| 2026-04-19 | `2026-04-18T13:30:00Z` | +10:30 |

Note the week beginning 2026-04-05 is 7 days **and 30 minutes** long in real time — the fixture deliberately straddles a non-hour DST transition.

Exercises:

| | Contributions |
|---|---|
| E1 Incline Press | chest primary 1.00, front_delts secondary **0.35**, triceps secondary **0.25** |
| E2 Chest Supported Row | upper_back primary 1.00, lats secondary **0.40**, biceps secondary **0.30** |
| E3 Straight Arm Pullover | **lats primary 1.00 AND upper_back primary 1.00** (dual primary on both Back leaves) |
| E4 Legacy Yates Row | **`back` primary 0.75** (legacy direct rollup row) |
| E5 Legacy Shrug Row | **`back` secondary 0.60** (legacy direct rollup, non-primary) |
| E6 Romanian Deadlift | hamstrings primary 1.00, glutes secondary 0.50, lower_back secondary 0.45 |

Sessions (all inserted as real `exercises` / `exercise_muscle_contributions` / `workout_sessions` / `session_exercises` / `set_logs` rows):

| | Local start | Status | Contents | Property exercised |
|---|---|---|---|---|
| S6 | Sun 2026-04-12 00:05 | completed | E1 ×2 | 5 min after a week boundary |
| S1 | Mon 2026-04-13 18:00 | completed | E1 ×3 work **+1 warmup**, E2 ×3 | warmup exclusion, mixed roles, fractional weights, templated |
| S2 | Wed 2026-04-15 19:00 | **in_progress** | E4 ×2, E5 ×2 | in-progress counted; legacy direct `back`, both roles |
| S3 | Thu 2026-04-16 18:00 | **discarded** | E1 ×5 | discarded exclusion |
| S4 | Fri 2026-04-17 20:00 | completed, **deload** | E3 ×3 | deload without reduction; raw dedup |
| S5 | Sat 2026-04-18 23:45 | completed, **ad-hoc** | E6 ×2, sets logged 00:25 next day | session spanning midnight; ad-hoc parity |
| S7 | Sat 2026-04-11 23:50 | completed | E2 ×2 | 10 min before a week boundary (`13:20Z < 13:30Z`) |
| S8 | Sun 2026-04-05 **00:00:00** | completed | E1 ×1 | **exactly** on the window start (`gte` inclusive) |
| S9 | Sat 2026-04-04 23:59 | completed | E3 ×1 | 1 min before the same boundary (`lt` exclusive) |
| S10 | Wed 2026-03-25 18:00 | completed, **deload** | E6 ×2 | second deload week |
| S11 | Mon 2026-03-16 18:00 | completed | E4 ×3 | unclassified-only week |
| S12 | Sat 2026-03-14 18:00 | completed | E1 ×4 | **outside** the 5-week window |

### 2.2 Hand-computed expectations vs. observed

Every value below was derived by hand *before* execution. Command:

```
DATABASE_URL='postgres://gymapp:gymapp@localhost:5432/gymapp_p6rev' npx tsx <probe>   # getWeeklyVolumeReport(db, userId, now)
```

**Week 0 — 2026-04-12 → 2026-04-19** (`isDeload: true`)

| Metric | Hand-computed | Observed |
|---|---|---|
| chest | 5.0 / 5 raw | ✔ (would be 6 without warmup exclusion, 10 with the discarded session) |
| front_delts | 1.75 / 0 | ✔ (0.35 × 5, summed as floats, rounded) |
| triceps | 1.25 / 0 | ✔ |
| lats | 4.2 / 3 | ✔ (0.40×3 secondary + 1.00×3 primary; raw counts primaries only) |
| upper_back | 6.0 / 6 | ✔ (E2 3 + E3 3) |
| biceps | 0.9 / 0 | ✔ |
| hamstrings | 2.0 / 2 | ✔ (ad-hoc, midnight-spanning) |
| glutes | 1.0 / 0 | ✔ |
| lower_back | 0.9 / 0 | ✔ |
| every other leaf | 0 / 0 | ✔ |
| `back.unclassified` | **2.7** | ✔ (0.75×2 primary **+ 0.60×2 secondary** — role-independent, per volume-model §1) |
| `back.effective` | **12.9** = 4.2 + 6.0 + 2.7 | ✔ |
| `back.raw` | **8** | ✔ (E2's 3 + E3's 3 deduped + E4's 2; E5 excluded as secondary) |
| naive raw sum over leaves | 3 + 6 = **9** | dedup demonstrated: 6 unique member-leaf sets, not 9 |
| deload data | E3's 3 sets counted in full | ✔ not reduced |

**Weeks 1–4**

| Week | Hand-computed | Observed |
|---|---|---|
| 2026-04-05 → 04-12 | chest 1/1, front_delts 0.35/0, triceps 0.25/0, lats 0.8/0, upper_back 2/2, biceps 0.6/0; back **2.8 / 2 / 0** | ✔ — S8 at the exact boundary instant lands here, S7 at `13:20Z` lands here, both correct |
| 2026-03-29 → 04-05 | lats 1/1, upper_back 1/1; back **2.0 / 1 / 0** | ✔ — **one set primary on both leaves ⇒ raw Back 1, naive sum 2** |
| 2026-03-22 → 03-29 | hamstrings 2/2, glutes 1/0, lower_back 0.9/0; back 0/0/0; `isDeload: true` | ✔ |
| 2026-03-15 → 03-22 | all leaves 0/0; back **2.25 / 3 / 2.25** | ✔ — unclassified-only week, raw 3 from direct-`back` primaries |
| S12 (2026-03-14 local) | must not appear | ✔ absent |

Five windows returned, contiguous and descending, each `endDateExclusive` equal to the next window's `startDate`. **Zero discrepancies.**

Every property the review scope asks for is covered by the table above: primary and secondary contributions; non-default weights; warmup exclusion; discarded exclusion; in-progress inclusion; templated and ad-hoc; deload without reduction; a session spanning midnight; sessions anchored on both sides of a weekly boundary; a legacy direct `back` contribution (in both roles); an exercise primary on both Back member leaves; effective-set summation; primary-only raw counts; raw Back deduplication; `unclassifiedBack`; five-week bucketing.

### 2.3 ADR-010 sum preservation — partition-faithful

A dual-primary member-leaf fixture is **not** a valid instance of this invariant, and I confirmed why independently: `exercise_muscle_contributions`' primary key is `(exercise_id, muscle_group_id)`, so no exercise could ever have carried two `back` rows pre-v2. The reconciliation maps each `back` row to **exactly one** leaf with role and weight preserved (`src/db/seed/reconcileContributions.ts:15-28`).

My pair: four exercises, one back-family row each, three sessions, one week.

| Era | back.effective | back.raw | back.unclassified | lats | upper_back |
|---|---|---|---|---|---|
| **PRE-v2** (all rows on `back`) | **9.4** | **7** | 9.4 | 0 / 0 | 0 / 0 |
| **POST-v2** (partitioned to leaves) | **9.4** | **7** | 0 | 5.0 / 5 | 4.4 / 2 |

Hand-computed: `3×1.00 + 2×0.45 + 2×0.85 + 2×1.00 + 4×0.45 = 9.4`; primary-bearing sets `3 + 2 + 2 = 7` (the 0.45 secondary contributes effective but no raw). Both series preserved exactly. Invariant proven, not assumed.

For completeness, I also confirmed the plan's *stated* form of this test is impossible — see L-8.

---

## 3. Timezone and bucketing — adversarial sweep

Independent oracle: the earliest instant whose `Intl`-formatted local date equals the target date (binary search to the second). This is the semantically correct start-of-local-day for a half-open `[start, end)` window.

**A — `localDateToUtcInstant` vs. oracle: 41,256 day-boundary conversions, 24 timezones, 2020–2030 → 27 mismatches.**

Zones covered: UTC, Europe/Ljubljana, Europe/London, Europe/Dublin (negative DST), America/New_York, America/Sao_Paulo, Australia/Sydney, Pacific/Auckland (southern DST), Asia/Kathmandu (+5:45), Asia/Kolkata (+5:30), Australia/Eucla (+8:45), Pacific/Chatham (+12:45/+13:45), Australia/Lord_Howe (30-minute DST), Iran, Asia/Tehran, America/Santiago, America/Havana, Asia/Beirut, Africa/Cairo, America/Asuncion, Antarctica/Troll (2-hour DST), Pacific/Apia, Pacific/Kiritimati (+14), America/St_Johns (−3:30).

All 27 mismatches are the same defect in exactly three zones — see L-1. **Europe/Ljubljana and UTC: 0 defective boundaries in 5,376 days each (2020–2035).**

**B — half-open day coverage: 40,728 windows → 54 violations**, all the same three zones, all downstream of the same cause. Everywhere else, `[startOfDay(D), startOfDay(D+1))` contains exactly the instants whose local date is `D` — verified at the start instant, the last second, and the end instant.

**C — `calendarWeekWindows` invariants: 232 cases (`weekStartsOn` ∈ {0,1,3,6}; leap day 2026/2024-02-29, 01-01, 12-31, 03-01, 01-04, 12-28 across 2020–2030) → 0 violations.** Exactly 5 windows; week 0 anchored on the requested weekday; the query date inside week 0; every window exactly 7 days; contiguous with no gap or overlap; strictly descending; `calendarWeekStart` agrees.

**D — block-week helpers: 0 violations.** `blockWeekWindow(start, 1)` starts on the block start date; week *n* starts `7(n−1)` days later; correct across 2024-02-29 and a year rollover; `blockWeekWindows` floors at week 1 and returns newest-first.

Half-open boundaries were additionally proven end to end in §2.2: S8 at exactly `2026-04-04T13:00:00Z` lands in the week starting 2026-04-05, S9 one minute earlier does not.

---

## 4. Live PostgreSQL schema and migration

A fresh database was created and migrated **from empty**:

```
psql -c "CREATE DATABASE gymapp_p6rev OWNER gymapp;"
DATABASE_URL=...gymapp_p6rev pnpm db:migrate      # [✓] migrations applied successfully  (9 ledger rows, 0001..0008)
```

**Both new tables match `data-model.md` §2.16/§2.17 column-for-column**, in order, with correct types, nullability and defaults. Verified from `\d` on the live database, not from the schema file:

- `volume_presets`: `id uuid PK`, `user_id uuid` (FK → users, nullable), `name text NN`, `description text`, `classification text NN` + `ck_volume_presets_classification IN ('evidence_supported','heuristic','user_defined')`, `source_ref text`, `evidence_refs text[]`, `is_builtin boolean NN DEFAULT false`, `archived_at timestamptz`, `created_at`/`updated_at timestamptz NN DEFAULT now()`, `ix_volume_presets_user_id`.
- `volume_landmarks`: `id uuid PK`, `preset_id uuid NN` FK **CASCADE**, `muscle_group_id text NN` FK **RESTRICT**, `key text NN`, `value_min`/`value_max numeric(5,1)`, `open_ended boolean NN DEFAULT false`, `note text`, `uq_landmark UNIQUE (preset_id, muscle_group_id, key)`, plus all three checks (`value_min >= 0`; `value_max >= value_min` when both set; at least one present).
- **No `created_at`/`updated_at` on `volume_landmarks`.** This departs from §1's global convention but matches §2.17's own column list. I verified the claimed precedent is real, in the live schema, not just asserted: `block_schedule_entries` has `(id, block_id, template_id, position, weekdays)` — no timestamps at all; `exercise_muscle_contributions` has only `updated_at`. Accepted.

**Both D-02 foreign keys are present and enforced:**

```
users_default_volume_preset_id_volume_presets_id_fk  FOREIGN KEY (default_volume_preset_id) REFERENCES volume_presets(id) ON DELETE SET NULL
blocks_volume_preset_id_volume_presets_id_fk         FOREIGN KEY (volume_preset_id)         REFERENCES volume_presets(id) ON DELETE SET NULL
```

**Migration ordering** (`drizzle/0008_great_metal_master.sql`) is correct and needed no manual patch: both `CREATE TABLE`s (lines 1–29), then `ALTER TABLE users ADD COLUMN` (31), then all four `ADD CONSTRAINT` statements (32–37) including both D-02 closures. Applying to an empty database succeeded on the first attempt.

**Deferrability — the ambiguity resolved explicitly.** Querying `pg_constraint`, **no Phase 6 constraint is PostgreSQL `DEFERRABLE`**: all ten constraints on the two new tables report `condeferrable = f, condeferred = f`, as do both new foreign keys. The only genuinely deferrable constraints in the database are four pre-existing hand-patched unique constraints from earlier phases (`uq_prescriptions_position`, `uq_schedule_position`, `uq_session_exercise_position`, `uq_set_number`). **"Deferred FK" in D-02 means build-order postponement across phases, not deferred constraint checking** — and the deviations text now says so correctly. The implementation report's phrase "the two deferred FKs" is loose but the binding document is not.

**No persisted volume aggregates or caches.** The migrated database has exactly 18 tables, none aggregate-shaped, and `information_schema.columns` returns zero columns matching `%aggregate%`, `%cache%`, `%weekly%volume%` or `%effective_sets%`.

**`pnpm db:generate` drift:** `No schema changes, nothing to migrate 😴`. No new `.sql` file appeared and `drizzle/meta/0008_snapshot.json` and `_journal.json` are byte-identical afterwards (md5 verified before and after).

---

## 5. RP General seed, lifecycle and edit semantics

### 5.1 Source transcription

I transcribed `docs/input/rp-volume-landmarks.md`'s 12-row table independently and compared it against the 52 rows the seed actually wrote to the live database. **All 52 values match; zero discrepancies.**

| Source row | MV | MEV | MAV | MRV | Seeded as |
|---|---|---|---|---|---|
| Abs | 0 | 0 | 16–20 | 25+ | `abs` ✔ |
| Back | 8 | 10 | 14–22 | 25+ | `back` (**rollup only**) ✔ |
| Biceps | 5 | 8 | 14–20 | 26+ | `biceps` ✔ |
| Triceps | 4 | 6 | 10–14 | 18+ | `triceps` ✔ |
| Calves | 6 | 8 | 12–16 | 20+ | `calves` ✔ |
| Chest | 8 | 10 | 12–20 | 22+ | `chest` ✔ |
| Front Delts | 0 | 0 | 6–8 | 12+ | `front_delts` ✔ |
| Glutes | 0 | 0 | 4–12 | 16+ | `glutes` ✔ |
| Hamstrings | 4 | 6 | 10–16 | 20+ | `hamstrings` ✔ |
| Quads | 6 | 8 | 12–18 | 20+ | `quads` ✔ |
| Rear / Side Delts | 0 | 8 | 16–22 | 26+ | `rear_delts` **and** `side_delts`, both with the caveat note ✔ |
| Traps | 0 | 0 | 12–20 | 26+ | `traps` ✔ |

Counts: **1 preset, 52 landmark rows, 13 muscle groups** (12 source rows + the Rear/Side split). Representation is exactly as specified: single values store `value_min = value_max` (e.g. `abs/mv 0.0|0.0|false`), MAV stores a true range (`abs/mav 16.0|20.0|false`), MRV stores `value_min = N, value_max = NULL, open_ended = true` (`abs/mrv 25.0||true`). **No rows for `lats`, `upper_back`, `adductors`, `forearms`, `lower_back`** — confirmed by enumerating all 13 distinct `muscle_group_id` values. Preset metadata exact: `classification = heuristic`, `source_ref = docs/input/rp-volume-landmarks.md`, `is_builtin = true`, `user_id = NULL`, `archived_at = NULL`. Both required caveats are stored — in the preset `description` and as a per-row `note` on all 8 Rear/Side-Delt rows.

### 5.2 Determinism and idempotence

`RP_GENERAL_PRESET_ID = c008da8a-4485-5629-ac10-5e85fd6d238c`, identical across separate processes and across a fresh database.

Running `runSeed` a second and third time: preset row byte-identical (excluding `updated_at`, see L-6); 52 landmark rows with identical values **and identical IDs**; exactly one builtin preset row. The `onConflictDoUpdate` path preserves row identity rather than reinserting.

### 5.3 Default-preset lifecycle — all four cases

| Case | Result |
|---|---|
| Account exists **before** seeding, `default_volume_preset_id` NULL | seed's `UPDATE … WHERE default_volume_preset_id IS NULL` sets it to RP General ✔ |
| Account with an **explicitly selected** non-RP default | untouched across two further seed runs ✔ |
| Any already-set default (e.g. a user's edited copy) | never overwritten — diffed every user row before/after: 0 changed ✔ |
| Account created **after** deploy-time seeding | **verified through the real HTTP setup flow**, not a unit stub: on `gymapp_p6e2e` (migrate → `db:seed` → account created by Playwright driving `/setup`), the new row came out with `default_volume_preset_id = c008da8a-…-238c → RP General (is_builtin = t)` ✔ |

That last case is the actual production deploy order (`implementation-plan.md` §1.4: migrate + seed as a CI release step, then the user signs up), and it is closed by `src/server/auth/service.ts:56-77`. See L-7 for how it is looked up, and L-11 for an unrelated asymmetry it exposes.

### 5.4 Active-preset resolution and edit semantics

30 assertions against real PostgreSQL and the real service — **all pass**:

| | |
|---|---|
| no default, no block → `activePreset: null`; edit → `NoActivePresetError` | ✔ |
| user default resolves, 52 landmarks attached | ✔ |
| **active block preset wins over the user default** | ✔ |
| active block with `volume_preset_id NULL` → falls back to the user default | ✔ |
| **ownership isolation:** another user's preset id planted in `default_volume_preset_id` resolves to `null` | ✔ |
| **no existence leakage:** the cross-user edit raises the same `NoActivePresetError` as "no preset at all" | ✔ (and there is no id-parameterised endpoint to probe — the API is `GET /api/volume` + `PATCH /api/volume/landmarks`) |
| first edit of the builtin creates a user-owned, non-builtin copy named "RP General (edited)" | ✔ |
| the copy is **complete**: 52 rows, `classification = user_defined`, `source_ref` and `description` carried over, all 8 caveat notes carried over | ✔ |
| the **user default** slot is repointed when resolution came from the default | ✔ |
| the **block** slot is repointed — and the user default left on the builtin — when resolution came from a block | ✔ |
| a second edit reuses the copy (still exactly 1 user-owned preset) | ✔ |
| immediate `GET` after `PATCH` reflects the new value | ✔ |
| a failing edit **rolls back completely**: 0 orphan presets, default slot untouched | ✔ |
| **builtin RP General byte-identical** (all columns + all 52 rows including IDs) after every edit above | ✔ |

### 5.5 Adversarial concurrency — the lock is real and load-bearing

8 concurrent first edits (distinct keys) against real PostgreSQL 16, plus 5 concurrent block-sourced first edits:

| | result |
|---|---|
| all requests succeed | ✔ 8/8 and 5/5 |
| exactly **one** user-owned preset created | ✔ |
| **no value lost** | ✔ 0 of 8, 0 of 5 |
| the copy has exactly 52 rows | ✔ |
| correct slot repointed (block, not default) | ✔ |

To confirm the lock is what produces this rather than luck, I ran the identical scenario against a copy of the service with only `service.ts:276`'s `pg_advisory_xact_lock` removed:

```
REAL PG, lock REMOVED : rejected=0  userOwnedPresets=8  valuesLost=7  ["chest","quads","biceps","calves","abs","traps","glutes"]
REAL PG, lock PRESENT : rejected=0  userOwnedPresets=1  valuesLost=0  []
```

The race is real, severe (7 of 8 edits silently lost, 8 orphan presets), and the lock fixes it completely. This is exactly why M-3 below matters.

---

## 6. API validation

`upsertVolumeLandmarkInputSchema` probed directly (`src/domain/volume/schema.ts:26-44`):

| Input | Result | |
|---|---|---|
| `valueMin: 12.5` | accept | ✔ |
| `valueMin: 12.55` | **reject** `not_multiple_of` | ✔ guards `numeric(5,1)` against silent truncation |
| `valueMin: -1` | reject `too_small` | ✔ |
| neither `valueMin` nor `valueMax` | reject | ✔ |
| `valueMax < valueMin` | reject | ✔ |
| `muscleGroupId: "nope"` | reject `invalid_enum_value` | ✔ |
| `muscleGroupId: "back"` (rollup) | accept | ✔ correct — landmarks may target the rollup |
| `key: ""` | reject | ✔ |
| unrecognised key | reject (`.strict()`) | ✔ |
| `note` > 500 chars | reject | ✔ |
| `NaN` / `Infinity` | reject | ✔ |
| **`valueMin: 10000` / `99999.9`** | **accept** — then fails at the column | ✗ see L-2 |

Route handlers are thin and correct: 401 unauthenticated, 400 + Zod issues on invalid input, 409 `no_active_preset`, rethrow otherwise.

---

## 7. Phone UI — real production build, Chromium, 390×844

Run against the production server (`pnpm build && pnpm start`) on the freshly migrated + seeded `gymapp_p6e2e`, with data inserted to force every conditional branch (a legacy direct-`back` exercise, a dual-primary exercise, a warmup, a deload week).

### 7.1 Structure and values

| | |
|---|---|
| five week cards | ✔ `count=5` |
| all required rows, in vocabulary order | ✔ `Back, Chest, Lats, Upper Back, Front Delts, Side Delts, Rear Delts, Traps, Biceps, Triceps, Forearms, Abs, Quads, Hamstrings, Glutes, Adductors, Calves, Lower Back (Erectors)` |
| effective **and** raw on every row | ✔ 18/18 rows show "N direct" beside the effective figure |
| deload badge without data removal | ✔ badge present; that week still shows `Lats 3 effective / 3 direct` |
| no horizontal overflow | ✔ `scrollWidth 390 = innerWidth 390`; widest element right edge 390 |
| no console errors, no ≥400 responses | ✔ both empty on a clean load-and-scroll pass (the single 400 in an earlier pass was my own deliberate invalid-input probe) |

### 7.2 Back reconciliation, verbatim from the DOM

> Back 9.5 = Lats 5 + Upper Back 3 + Unclassified Back 1.5 **(effective sets)**. Raw Back (7) is a **deduplicated per-set count and may be lower than the sum of raw Lats + Upper Back**.

- qualified as the effective series ✔
- non-additive raw caveat present ✔
- on-screen arithmetic holds (`5 + 3 + 1.5 = 9.5`) ✔
- **Unclassified Back term rendered when non-zero** ✔, and **omitted on all 3 zero-unclassified weeks** ✔
- framed as an accounting identity, never as physiology ✔

### 7.3 Provenance — the critical check

The review scope asks specifically whether heuristic provenance travels with the bands *throughout* the page. It does:

- **65 rendered RP bands on the page; 65 carry the `Coaching heuristic · …` prefix; 0 unlabelled.**
- The page-level caption sits at y≈192. The lowest band sits at **y≈8,487** on a **9,357 px** page (11.1 viewports at this height). Provenance is on the band itself, not only on the caption — mvp-scope F8's acceptance criterion "landmark lines carry their 'coaching heuristic' label" is satisfied literally. Screenshots of the top and bottom of the page both confirm it.
- `RP General is a coaching preset (heuristic), not established science.` ✔ present, exact copy.
- After an edit: `Values below are your edited copy of it.` ✔

### 7.4 Bandless groups and stored caveat text

- **Exactly** `Lats, Upper Back, Forearms, Adductors, Lower Back (Erectors)` render `No reference range` — the five intentionally bandless groups, no invented ranges anywhere ✔
- **The Rear/Side-Delts combined-row note IS rendered**, twice per week card (once on each of the two rows), verbatim from `volume_landmarks.note` ✔ (`src/ui/volume/MuscleRow.tsx:34-38, 52-56`)
- **The stored preset `description` is never rendered** ✗ see L-3

### 7.5 Editing

| | |
|---|---|
| inline landmark editing works | ✔ four keys (MV/MEV/MAV/MRV) per group, open-ended checkbox, per-row Save |
| decimal comma | ✔ `12,5` typed, retained in the field, saved, re-rendered as `MEV 12.5` |
| empty input | ✔ inline `Enter a value ≥ 0.` — no request sent |
| over-precise input `12,55` | rejected, not truncated ✔ — but only as `Save failed.` (L-10) |
| immediate reflection | ✔ no manual reload needed |

### 7.6 Copy discipline

Scanning the full rendered page text: **no** occurrence of *target, requirement, required, optimum, optimal, you should, you must, recommend, compliance, on track, behind, deficit*. **No** Phase 7–9 leakage: no *chart, trend, estimate, predicted, auto-adjust, bodyweight, recovery, fatigue score, frequency*. The historical-consistency note ("Editing a muscle contribution reinterprets every week shown here…") is present, per volume-model §3.

---

## 8. Findings

### MEDIUM

**M-1 — `docs/reviews/phase-6-implementation.md` does not describe the tree it hands over, and omits the phase's most safety-relevant change.**
Five files were modified after the report was written (table in §1). The report's "Files changed" section, "Judgment calls" section and verbatim verification block make no mention of:
1. `src/server/volume/service.ts:131-142, 275-276` — the `pg_advisory_xact_lock(userId)` that serialises landmark edits. §5.5 shows removing it costs 7 of 8 concurrent edits and creates 8 orphan presets. A concurrency guard of this consequence being absent from the handoff is the material part of this finding.
2. `src/server/auth/service.ts:56-77` — RP General attachment during account creation, which is what makes a fresh production account see reference bands at all.
3. `src/ui/volume/MuscleRow.tsx:34-38, 49-60` — per-row `Coaching heuristic ·` provenance and stored-note rendering, i.e. the mechanism by which mvp-scope F8's labelling criterion is met.

The report's own numbers are also stale: it claims "206/206 passed, 4 skipped" for integration; the tree now yields **208 passed, 4 skipped**. Everything the report *does* assert about the pre-17:19 code I verified as accurate, and all three unreported changes are correct — so this is a handoff-integrity defect, not a code defect. But a reviewer or deployer reading the report is not reading a description of what ships.
*Fix:* bring the report up to date (or add a remediation section) so the shipped tree and the record agree.

**M-2 — `volume-model.md` §5 rule 6 was not corrected, though the architecture review's M-3 named it.**
`docs/reviews/pre-phase-6-muscle-taxonomy-architecture-review.md:76` names five passages: "ADR-010 ('Aggregation'), volume-model §2 **and §5 rule 6**, domain-model §8 and implementation-plan Phase 6". Four were corrected. `docs/architecture/volume-model.md:111` still reads:

> …the Unclassified Back term is shown whenever it is non-zero **so the Back total is always explained by its parts**.

Unqualified, and false for the raw series — precisely M-3's complaint. §5 is declared "**Binding on UI copy** and future features", which makes this the more load-bearing of the two volume-model passages, not the lesser one. The shipped UI copy is correct (§7.2), so nothing user-facing is wrong today; the exposure is to future work reading the binding rule and to the phase's own claim that M-3 is closed.
*Fix:* one clause, matching the §2 correction eight lines above.

**M-3 — The shipped concurrency test provably cannot detect the race it is named after.**
`tests/integration/volumeLandmarks.integration.test.ts:128` ("serializes concurrent first edits so one copy retains both values") runs against PGlite. I measured PGlite directly: `pg_backend_pid()` returns the same value (42) for every query, `pg_stat_activity` has exactly 1 row, and two `db.transaction()` calls issued concurrently execute strictly in sequence (`A-begin → A-end → B-begin → B-end`). There is no interleaving for an advisory lock to prevent. I then ran the same assertion against a copy of the service with the lock removed: **it still passes** (1 user-owned preset). The same scenario on real PostgreSQL yields 8 presets and 7 lost values.

This is not a novel discovery for this codebase — `tests/integration/reconcileContributionsConcurrency.integration.test.ts:24-26` says so in its own header ("genuine concurrent commits from two sessions aren't reachable against PGlite's single in-process instance") and establishes the exact remedy: a suite gated on its own opt-in connection variable, skipped by default so CI stays green. Phase 6 introduced a concurrency guard without using the pattern the previous phase built for it, so the guard is invisible to every automated gate and a future refactor could remove it silently.
*Fix:* add a real-PostgreSQL concurrency case behind an opt-in `*_DATABASE_URL`, mirroring the Release 2 precedent. (Note the same limitation applies to `setupAccount`'s pre-existing `SETUP_LOCK_KEY` — out of scope here.)

### LOW

**L-1 — `localDateToUtcInstant` is one hour early in zones whose DST gap opens at local midnight.**
`src/server/time/userLocalDate.ts:53-58`. In `America/Santiago`, `America/Havana` and `America/Asuncion`, spring-forward occurs at 00:00 local, so that day's midnight does not exist. The two-pass resolver returns an instant whose local date is the *previous* day (27 of 41,256 conversions; e.g. `America/Havana 2026-03-08 → 2026-03-08T04:00:00Z`, oracle `05:00:00Z`). The comment at lines 48-52 — "local midnight essentially never falls inside a spring-forward gap or fall-back overlap in practice (those occur at 2-3am local in every zone this app is likely to see)" — is wrong as a general statement, though its hedge holds for this product. Fall-back ambiguity is handled correctly everywhere I tested.
*Impact:* none in the supported configuration. `Europe/Ljubljana` (the default and the only configured zone) and `UTC`: **0 defective boundaries in 5,376 days each**. Even in the three affected zones the transition is always a Sunday, so a *week* boundary only lands in the gap with `week_starts_on = 0`; with the Monday default it never does. Worst case is one hour of sessions attributed to the adjacent week, once per year. Documented-limitation class, not a product defect.

**L-2 — Out-of-range landmark values return 500 instead of 400.**
`src/domain/volume/schema.ts:30-31` bounds `valueMin`/`valueMax` below (`min(0)`) and by precision (`multipleOf(0.1)`) but not above, while the column is `numeric(5,1)` (max 9999.9). `valueMin: 10000` passes validation and fails at the insert: an unhandled driver error propagates out of the route as a 500, and the UI shows only "Save failed." The transaction rolls back cleanly — I verified no orphan preset and an untouched default slot — so there is no data effect. *Fix:* `.max(9999.9)` on both fields.

**L-3 — The seeded preset `description` is written to the database and never rendered.**
`volume-model.md` §4 states the seeding caveats are "documented in the preset description itself". `RP_GENERAL_DESCRIPTION` (`src/db/seed/volumePresets.ts:24-31`) is stored, carried through to user copies, exposed in the API payload as `activePreset.description` — and appears **0 times** in the rendered page. The Rear/Side-Delts caveat survives only because it is *also* stored per row and `MuscleRow` renders notes; the description's two other caveats (RP's Back row attaching to the rollup only; which groups deliberately have no band) reach the user nowhere.

**L-4 — Tap targets below the minimum on a phone-first screen.**
The `Edit reference range` control measures **107 × 16 px** at 390×844 — under the iOS 44 px guideline and the WCAG 2.2 AA 24 px minimum — in a list whose rows sit a few pixels apart.

**L-5 — The landmark list and editor are duplicated in every week card.**
`src/ui/volume/VolumeScreen.tsx:112-128` renders the full 18-row list *and* its 4-key editor inside each of the five week cards, for values that are not week-scoped: **90 "Edit reference range" buttons** and a **9,357 px** page (11.1 viewports). This is also what multiplies the surface M-3's race acts on.

**L-6 — Every deploy rewrites the RP General row.**
`src/db/seed/volumePresets.ts:146-156` sets `updatedAt: new Date()` unconditionally in `onConflictDoUpdate`, so `created_at ≠ updated_at` after any re-seed even when nothing changed (verified live). Row content stays identical; the cost is one dead tuple per deploy. Consistent with `seedMuscleGroups`' existing convention and explicitly excluded from the shipped idempotence assertion, so noted rather than argued.

**L-7 — `setupAccount` resolves the builtin by name, not by its deterministic id.**
`src/server/auth/service.ts:61-70` matches `name = 'RP General' AND is_builtin AND user_id IS NULL`, although `RP_GENERAL_PRESET_ID` is an exported, stable constant in the same codebase (and is what every other consumer uses). Renaming the seeded preset would silently stop attaching it to new accounts, with no error anywhere.

**L-8 — The plan's sum-preservation instruction is self-contradictory and the resolution is not recorded.**
`implementation-plan.md:191` requires one fixture containing "an exercise primary on both `lats` and `upper_back`" **and** requires "**the same fixture** evaluated under the pre-v2 merged `back`" to reproduce the rollup exactly. I confirmed independently that both cannot hold: week 2026-03-29 of my own fixture gives `back.effective = 2.0` for a single dual-primary set, whereas the one `back` row the `(exercise_id, muscle_group_id)` primary key permits could contribute at most 1.0. The implementation correctly used a separate partition-faithful fixture and explains why in its report — I reached the same conclusion independently (§2.3) — but ground rule 5 (`implementation-plan.md` §0.5) asks for a contradiction between binding documents to be recorded in `deviations.md` or `open-decisions.md`, and neither carries a Phase 6 entry.

**L-9 — `null+` is renderable.**
`src/ui/volume/volumeDisplay.ts:10` returns `` `${landmark.valueMin}+` `` whenever `openEnded` is true. `{valueMax: 10, openEnded: true}` passes validation (§6), stores `value_min NULL`, and would render `null+`. Unreachable from the editor, which always sends `valueMin`; API-only.

**L-10 — Over-precision rejection is opaque.**
Typing `12,55` is correctly refused end to end, but the only feedback is `Save failed.` — a round trip to a 400 rather than the client-side precision check the codebase already has (`decimalPlaceCount` in `src/ui/decimalInput.ts`, used by the exercise form for exactly this, per the Phase 5.5 Light remediation).

**L-11 — Fresh-account asymmetry (informational, pre-existing).**
Phase 6 closed the fresh-account gap for the volume preset. The exercise catalogue is still deploy-gated: immediately after account creation on a freshly seeded database I measured **0 rows in `exercises`** for the new user until the next `db:seed`. Pre-existing and out of Phase 6 scope; recorded only because the two now behave differently and a future reader may expect symmetry.

---

## 9. Test adequacy

**Commands and observed results, all on the current tree:**

| Command | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm lint` | clean |
| `pnpm format:check` | `All matched files use Prettier code style!` |
| `pnpm test:unit` | **408 passed** (32 files) |
| `pnpm test:integration` | **208 passed, 4 skipped** (16 passed files, 1 skipped) |
| `pnpm build` | succeeds; `/volume`, `/api/volume`, `/api/volume/landmarks` all in the route manifest |
| `pnpm db:generate` | `No schema changes, nothing to migrate` — no file written, meta files md5-identical |
| `npx playwright test` (full suite, fresh disposable DB) | **22 passed**, 43.6 s, no flakes, no retries |

The Playwright run used the real deployment order on a database created for this review: `CREATE DATABASE` → `db:migrate` from empty → `db:seed` → account created through the real `/setup` HTTP flow → `db:seed` again (catalogue) → `tests/e2e/seed.ts` → full suite. The suite therefore did **not** mask the deploy order the review scope asks about — and I confirmed the fresh account received RP General at creation time, before any second seed (§5.3).

**What the suites genuinely cover.** Coverage is broad and mostly well-aimed: the seed suite asserts row counts, the rollup-only Back attachment, absent member-leaf rows, the duplicated caveat note, open-ended representation, full-row idempotence **including landmark IDs**, explicit-default preservation, and a live-schema check for absent aggregate columns (stronger than the plan's requested grep). The landmark suite covers builtin immutability with before/after row comparison, slot repointing for both block and default sources, reuse on later edits, adding a landmark to a bandless leaf, and cross-user non-leakage. The E2E spec — as edited at 17:20 — now asserts the per-band `Coaching heuristic` label and the Rear/Side-Delts note, which is what makes the F8 labelling criterion regression-protected.

**Where they fall short.**

1. **Concurrency (M-3).** Demonstrated above: the test cannot fail when the lock is removed, because PGlite has one backend and drizzle serialises on it. The repo already contains the correct pattern and the correct explanation for why PGlite is unsuitable here.
2. **Lifecycle.** The new `auth.integration.test.ts` case covers seed-then-setup, which is the right order and closes the gap I checked most carefully. Nothing covers setup-then-seed at integration level (the seed's `IS NULL` fallback) — I verified it holds, but only by probe.
3. **Provenance.** The E2E assertion scopes the `Coaching heuristic` check to `currentWeekCard.…first()`. It would pass if the label were rendered on the first band only. My own check — 65 of 65 bands across the entire 9,357 px page — is what actually establishes the property the M-3 correction is about; the shipped test would not catch a regression to the top-of-page-only behaviour.
4. **Validation bounds.** Nothing asserts the 400-vs-500 boundary (L-2), so an out-of-range value producing a server error is invisible to CI.
5. **Timezone.** `userLocalDate.test.ts` is well-constructed for Europe/Ljubljana (it discovers a DST day empirically rather than hard-coding one, and asserts the 167-hour spring week). It exercises exactly one zone; L-1 is outside its reach by design.

Items 1 and 3 are the ones that matter: both are properties the phase deliberately implemented, and neither is protected by a test that could fail if the implementation regressed.

---

## 10. Cleanup

- Disposable databases `gymapp_p6rev` and `gymapp_p6e2e` **dropped**; `SELECT datname FROM pg_database WHERE datname LIKE 'gymapp%'` now returns `gymapp` only.
- The review's application server **stopped**; port 3000 confirmed free.
- All scratch probe scripts removed from the repository; the Playwright `test-results/` artefact directory removed.
- The shared dev database `gymapp` was never written to by this review.
- `git status --porcelain` is **byte-identical** to the recorded baseline apart from this file (which was already present as an untracked path in the baseline).

---

## 11. Verdict

Finding counts: **0 BLOCKER · 0 HIGH · 3 MEDIUM · 11 LOW.**

The part of this phase that is hardest to get right and most expensive to get wrong — the aggregation — is correct, and I established that against my own hand-derived numbers on a fixture built to be materially different from the shipped one, executed through real PostgreSQL 16 rather than a stub. Sum preservation, raw deduplication, warmup and discarded exclusion, in-progress inclusion, ad-hoc parity, current-convention reinterpretation, half-open bucketing across a fractional-offset non-hour DST transition, schema fidelity, migration order, D-02 closure, RP seed fidelity and idempotence, the complete default-preset lifecycle including the real fresh-deploy order, builtin immutability, ownership isolation, rollback, and genuine multi-connection concurrency safety all hold under adversarial probing. The phone UI meets every copy and framing rule in volume-model §4/§5, including the one the M-3 correction is about, across the whole 11-viewport page rather than only at the top.

What stands between this and device acceptance is not behaviour. It is that the phase's record and its safety net do not match its code: the handoff document omits the concurrency lock, the fresh-account fix and the provenance fix entirely (M-1); one of the five binding passages M-3 named still carries the uncorrected claim (M-2); and the test that names the concurrency race provably cannot detect it, in a repo that already built the right pattern for exactly this one phase earlier (M-3). Each is small, mechanical, and independently verifiable once fixed. None requires redesign, and none would invalidate a device-acceptance session on the behaviour itself — but shipping a guard that no gate can see, with a handoff that does not mention it, is the failure mode this project's review discipline exists to prevent.

**READY FOR REMEDIATION**
