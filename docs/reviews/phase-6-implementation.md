# Phase 6 — Volume Tracking Implementation Report

Status: implementation complete, locally verified against PGlite, real local PostgreSQL 16, and a fresh disposable PostgreSQL 16 database for E2E. Not committed, not pushed, not deployed, per instruction. This session implemented directly (no Plan Mode, no implementation subagents) — the slice is sequentially coupled (schema → seed → pure aggregation → service/API → UI) and the user's instruction was explicit that subagent decomposition would be counter-productive here.

**Superseded by `docs/reviews/phase-6-review.md` (independent review, 2026-08-24) and the "Post-review remediation" section below.** The body of this report below the addendum describes the tree as it stood at 14:38 on 2026-08-24 — read it as history, not as a description of what currently ships. The addendum is the accurate, current record.

## Gate

Confirmed by the user before starting: Muscle Taxonomy v2 Release 2 is committed, deployed, idempotence-verified in production (`docs/reviews/pre-phase-6-muscle-taxonomy-release-2-implementation.md`'s "Production deployment closeout"), and manually accepted on the real iPhone.

## Scope delivered

Everything in `implementation-plan.md`'s Phase 6 section and `mvp-scope.md` F8, built once against the final 17-leaf + 1-rollup vocabulary (ADR-010):

- `volume_presets` and `volume_landmarks` tables (data-model.md §2.16–2.17), plus the two deferred FKs from D-02 (`users.default_volume_preset_id`, `blocks.volume_preset_id`).
- Builtin RP General preset, seeded per `docs/input/rp-volume-landmarks.md`, with the required caveats and no rows for `lats`/`upper_back`/`adductors`/`forearms`/`lower_back`.
- Pure aggregation in `src/domain/volume/` implementing volume-model.md §2's pseudocode exactly, including raw-rollup deduplication.
- An ownership-scoped online read service + REST API joining live execution facts to *current* contribution weights.
- Builtin-immutable, duplicate-on-edit landmark editing.
- A phone-first Volume screen: 5-week view, Back reconciliation line, bandless leaves, deload badges, inline landmark editing, RP provenance caption, "reference range" copy only.
- The M-3 architecture-review correction, in both UI copy and the affected spec documents.

Out of scope, not built (per the user's explicit exclusion list): Phase 7/8/9 work, multiple named presets or preset switching, volume-based recommendations/alerts/scores, MEV/MRV calculation, frequency scoring, persisted aggregates, per-session pacing, per-leaf landmarks, new muscle groups/rollups, as-of contribution history, unrelated E2E harness remediation.

## Aggregation contract (`src/domain/volume/aggregate.ts`)

`aggregateVolume(rows: WorkSetContributionRow[], windows: InstantWeekWindow[]): WeekVolumeReport[]` — pure, deterministic, no DB/framework/network/clock. One input row per (set, muscle contribution of its exercise); the caller (server) is responsible for querying qualifying rows and converting local date windows into instant windows.

- **Work set filter is inside the domain function**, not the caller: `isWarmup` rows are excluded by `aggregateVolume` itself (volume-model.md §1's Work Set definition is a domain concept), provable directly against a fixture without needing a SQL-level proof. Session-level `discarded` exclusion is a query-level concern (filtered in `src/server/volume/service.ts`, matching every other service's status-filtering convention in this codebase).
- **Effective**: every contribution row (primary or secondary) adds its `weight` to that leaf's effective total, or to `unclassified[rollup]` if the row targets a rollup slug directly (legacy data).
- **Raw (leaf)**: only `role === 'primary'` rows increment a leaf's raw count.
- **Raw (rollup)**: deduplicated per set — a `Set<string>` of `setId`s is built from every *primary* row whose muscle group is a member leaf of the rollup or the rollup itself; the rollup's raw count is that set's size, "once per set, never per contribution" (ADR-010).
- **Rollup effective** is derived after the leaf pass: `effective(back) = effective(lats) + effective(upper_back) + unclassified(back)`.
- **Deload flag**: `isDeload` is true for a week if any counted work-set row's session was flagged deload. Data is never excluded or reduced.
- Numeric sums are rounded to 2 decimal places (`Math.round((n + Number.EPSILON) * 100) / 100`) to absorb IEEE-754 fractional-weight drift (e.g. repeated 0.5 additions) without ever affecting a hand-computed integer/half-integer expectation.

`src/domain/volume/weekBuckets.ts` is a separate, purely string-based module (`addDays`, `calendarWeekStart`, `calendarWeekWindow(s)`, `blockWeekWindow(s)`) — deliberately timezone-agnostic, matching `weekIndex.ts`'s existing discipline. Converting a local date-string boundary into an actual UTC instant (the DST-sensitive step) lives at the server boundary: `src/server/time/userLocalDate.ts` gained `localDateToUtcInstant(date, timeZone)`, a two-pass `Intl.DateTimeFormat`-based offset resolver (same mechanism `userLocalDateString` already depends on, run in reverse).

## Active-preset resolution and edit semantics (`src/server/volume/service.ts`)

`resolveActivePreset(db, userId)` mirrors `today/service.ts`'s active-program → active-block resolution exactly: active program → its active block's `volume_preset_id` if set, else the user's `default_volume_preset_id`, else `null`. A resolved preset is always re-fetched through an ownership-scoped query (`user_id IS NULL OR user_id = :userId`), so a stale or maliciously-supplied id can never leak another user's preset — it simply resolves to "not found," identical to "doesn't exist" (no existence leakage; proven in `volumeLandmarks.integration.test.ts`).

`upsertVolumeLandmark`:
- If the resolved preset is builtin: creates a new `user_defined` preset (`"{name} (edited)"`, all builtin landmark rows copied over unedited), then re-points **whichever slot supplied it** — the active block's `volume_preset_id` if the preset came from there, otherwise the user's `default_volume_preset_id` — to the new preset. The builtin row is never mutated (asserted directly in the integration suite: before/after byte-equality on every RP General landmark row).
- If already user-owned: the specific `(presetId, muscleGroupId, key)` row is upserted in place (`onConflictDoUpdate`) — no further duplication on repeated edits to an already-owned preset.
- If no preset resolves at all: `NoActivePresetError` (409 via the API) — no preset-creation-from-scratch flow, matching the explicit "no general preset creation" exclusion. `GET /api/volume` still renders fully (all numbers, no bands) with `activePreset: null`.

`GET /api/volume` and `PATCH /api/volume/landmarks` are the entire API surface — both fully server-resolve the active preset from session + block/default state, so there is no id-parameterized endpoint for a client to probe another user's preset through in the first place.

## Schema, migration, seed

- `volume_presets` / `volume_landmarks` match data-model.md §2.16–2.17 column-for-column, including the deliberate absence of `created_at`/`updated_at` on `volume_landmarks` (the same documented exception already established for `block_schedule_entries` and `exercise_muscle_contributions` — the specific table's own column list is authoritative over the §1 global convention).
- `users.default_volume_preset_id` and `volume_presets.user_id` are mutually referencing (`users` → `volume_presets` for the default pointer, `volume_presets` → `users` for ownership). Drizzle resolves this the same way it resolves self-referencing FKs: a lazily-invoked `.references(() => ...)` callback, with an explicit `AnyPgColumn` return type on the closing reference to defeat TypeScript's circular-inference error. Verified: `pnpm typecheck` clean, `pnpm db:generate` produced the expected `ALTER TABLE` statements with no manual intervention, migration applied cleanly to local PostgreSQL 16.
- `blocks.volume_preset_id` — added as a plain column without an FK in Phase 2 (D-02) — now gets its `REFERENCES volume_presets(id) ON DELETE SET NULL` constraint via the same ordinary `drizzle-kit generate` run (migration `0008_great_metal_master.sql`). **No manual constraint patch was needed** — the two new tables and both deferred FKs landed in one generated migration, in correct dependency order (tables created, then both `ALTER TABLE ... ADD CONSTRAINT` statements). D-02 is now marked fully closed in `docs/architecture/deviations.md`.
- Seed (`src/db/seed/volumePresets.ts`, wired into `runSeed` immediately after `seedMuscleGroups`): upserts the builtin RP General preset (deterministic id via the same SHA-1-derived-UUID technique as `seededExerciseId`, since it's a single global row) and its 52 landmark rows (13 muscles × 4 keys: `mv`/`mev`/`mav`/`mrv`), then runs one state-predicated `UPDATE users SET default_volume_preset_id = <rp-general-id> WHERE default_volume_preset_id IS NULL` — the same idiom ADR-010's reconciliation established (predicate consumed by the update itself, no ledger, safe to rerun on every deploy).

### RP seed data, exactly as sourced

| Muscle group(s) | MV | MEV | MAV | MRV |
|---|---|---|---|---|
| `abs` | 0 | 0 | 16–20 | 25+ |
| `back` (rollup only) | 8 | 10 | 14–22 | 25+ |
| `biceps` | 5 | 8 | 14–20 | 26+ |
| `triceps` | 4 | 6 | 10–14 | 18+ |
| `calves` | 6 | 8 | 12–16 | 20+ |
| `chest` | 8 | 10 | 12–20 | 22+ |
| `front_delts` | 0 | 0 | 6–8 | 12+ |
| `glutes` | 0 | 0 | 4–12 | 16+ |
| `hamstrings` | 4 | 6 | 10–16 | 20+ |
| `quads` | 6 | 8 | 12–18 | 20+ |
| `rear_delts` **and** `side_delts` (duplicated, combined-row caveat) | 0 | 8 | 16–22 | 26+ |
| `traps` | 0 | 0 | 12–20 | 26+ |

No rows for `lats`, `upper_back`, `adductors`, `forearms`, `lower_back`. Single values (MV, MEV) store `valueMin = valueMax`; MAV stores a true range; MRV stores `valueMin = N, openEnded = true, valueMax = null` for its "N+" ceiling. The combined-row caveat is stored **twice**: once in the preset's own `description` (per volume-model.md §4's "documented in the preset description itself") and once as a per-row `note` on all 8 Rear/Side Delts landmark rows (the instruction's explicit "with the required combined-row caveat" attached to the duplicated rows themselves) — defense in depth, not redundant noise.

## M-3 disposition (architecture-review finding)

Corrected exactly as scoped — the equation is an *effective*-series identity; raw Back is a per-set deduplicated count that may be lower than the sum of raw Lats + raw Upper Back. No reinterpretation of the accounting identity as anatomy or physiology was introduced.

- **Architecture text** (narrow, targeted edits, matching the style of ADR-010's own M-1/M-2/M-4 corrections): `volume-model.md` §2, `ADR-010`'s "Aggregation" section, `domain-model.md` §8, and `implementation-plan.md`'s Phase 6 build bullet — each now states the reconciliation line is for the effective series and that raw Back is separately deduplicated, not additive over its members.
- **UI copy**: the Back reconciliation line on the Volume screen reads `Back {effective} = Lats {effective} + Upper Back {effective} [+ Unclassified Back {n}] (effective sets). Raw Back ({raw}) is a deduplicated per-set count and may be lower than the sum of raw Lats + Upper Back.` — both figures shown (raw is always the sanity anchor per volume-model.md §1), with the qualifying sentence directly adjacent, never presented as a physiological claim.
- **Domain proof**: `tests/unit/volumeAggregate.test.ts` asserts the effective equation holds exactly and separately proves `rollups.back.raw < naiveAdditiveSum` (4 vs. 6 in the hand-computed fixture) — the concrete counterexample M-3 was about.

## Hand-computed fixture (`tests/unit/volumeAggregate.test.ts`)

One calendar week. All required properties present in a single fixture:

| Exercise | Contributions | Sets | Notes |
|---|---|---|---|
| Bench Press | chest primary 1.0, triceps secondary 0.5, front_delts secondary 0.5 | 3 work + 1 warmup | mixed primary/secondary, 0.5 fractional weights, warmup exclusion |
| Custom Row (legacy back) | `back` primary 1.0 (direct rollup row) | 2 work | legacy direct-`back` custom contribution |
| Pullover Machine | `lats` primary 1.0, `upper_back` primary 1.0 | 2 work, deload session | exercise primary on both member leaves; raw-dedup case; deload week |

Expected vs. actual (all 9 assertions passed on first run):

| Metric | Expected | Actual |
|---|---|---|
| `leaves.chest` | `{effective: 3, raw: 3}` | ✓ |
| `leaves.triceps` | `{effective: 1.5, raw: 0}` | ✓ |
| `leaves.front_delts` | `{effective: 1.5, raw: 0}` | ✓ |
| `leaves.lats` | `{effective: 2, raw: 2}` | ✓ |
| `leaves.upper_back` | `{effective: 2, raw: 2}` | ✓ |
| every other leaf | `{effective: 0, raw: 0}` | ✓ |
| `rollups.back.unclassified` | `2` | ✓ |
| `rollups.back.effective` | `6` (= 2 + 2 + 2, reconciliation equation) | ✓ |
| `rollups.back.raw` | `4` (naive additive sum would be `6`) | ✓, and `4 < 6` asserted |
| `isDeload` | `true`, with Pullover's full 2 sets still counted (not reduced) | ✓ |

**Ad-hoc exercise**: the domain aggregator has no `source` field at all — templated vs. ad-hoc is invisible to it by construction, so "counted identically" is proven at the service/integration level instead (`volume.integration.test.ts`: one templated session, one ad-hoc session of the same exercise, same set counts, and the resulting `chest` totals are the exact sum of both — 5 sets from 2+2+1 across templated/ad-hoc/in-progress sources).

**Pre-v2 equivalence / sum-preservation** (separate fixture, matching the *actual* reconciliation partition — one leaf per row, never both): "Lat Pulldown" (`back` primary 1.0 → `lats` primary 1.0) and "Barbell Row" (`back` secondary 0.5 → `upper_back` secondary 0.5), 3 sets each, role and weight preserved exactly as ADR-010 specifies. Pre-v2 merged: `{effective: 4.5, raw: 3, unclassified: 4.5}`. Post-v2 split: `lats = {effective: 3, raw: 3}`, `upper_back = {effective: 1.5, raw: 0}`, rollup `{effective: 4.5, raw: 3, unclassified: 0}`. **Effective and raw both match exactly** — the sum-preservation invariant, proven, not assumed.

## Verification — exact results

- `pnpm lint` — clean.
- `pnpm format:check` — clean.
- `pnpm typecheck` — clean.
- `pnpm typecheck:sw` — clean.
- `pnpm test:unit` — **408/408 passed** (32 files; 367 pre-existing + 41 new across `volumeAggregate.test.ts` (9), `volumeWeekBuckets.test.ts` (15), `userLocalDate.test.ts` (6, including an empirically-discovered-not-hardcoded DST transition day for Europe/Ljubljana), `volumePresetsSeed.test.ts` (11)).
- `pnpm test:integration` — **206/206 passed, 4 skipped** (17 files; 182 pre-existing + 24 new across `volume.integration.test.ts` (5), `volumeLandmarks.integration.test.ts` (9), `volumePresetsSeed.integration.test.ts` (10); the 4 skips are the pre-existing concurrency suite gated on its own opt-in `DATABASE_URL`, unrelated to this phase).
- `pnpm test:e2e` against a **fresh disposable PostgreSQL 16 database** (`gymapp_phase6_e2e`, migrated from scratch through all 8 migrations, dropped after use) — **22/22 passed** on the clean final run, including `tests/e2e/volume.spec.ts` (5-week view, Back reconciliation line, bandless "No reference range" rendering for `lats`, a Deload badge, and a full landmark edit with immediate reflection — all against real HTTP requests on a 390×844 phone viewport). One transient, pre-existing, unrelated `offline-sync.spec.ts` failure (a service-worker outbox-drain timing flake, dead-lettered op) occurred once in a full-suite run and reproduced 2/2 green in isolation immediately after — a known class of flakiness already documented in the Muscle Taxonomy v2 Release 1 review, not a Phase 6 defect. Bootstrapping the disposable database required working around a pre-existing (out-of-scope) issue: `tests/e2e/seed.ts` calls `setupAccount` directly, which fails outside a real Next.js request context (`cookies()` unavailable) on a genuinely empty database; worked around by creating the account through one real Playwright-driven HTTP flow (`smoke.spec.ts`) before running `tests/e2e/seed.ts` and `pnpm db:seed` — not fixed, since "unrelated E2E harness remediation" is explicitly out of scope.
- `pnpm build` — succeeds; `/api/volume`, `/api/volume/landmarks`, and `/volume` all present in the route manifest.
- `pnpm db:migrate` against local PostgreSQL 16 — migration `0008_great_metal_master.sql` applied cleanly.
- `pnpm db:generate` drift check — **"No schema changes, nothing to migrate"**, confirmed both immediately after generating `0008` and again after the live seed runs below.
- `pnpm db:seed` run twice against local PostgreSQL 16 (`gymapp`) — first run: 1 `volume_presets` row, 52 `volume_landmarks` rows, the existing dev user's `default_volume_preset_id` initialized to RP General's id. Second run: identical counts (1 preset, 52 landmarks), identical default-preset id — proven idempotent live, not just in PGlite.

## Live PostgreSQL inspection (verbatim, local dev database `gymapp`)

```
                       Table "public.volume_presets"
     Column     |           Type           | Nullable | Default
----------------+--------------------------+----------+---------
 id             | uuid                     | not null |
 user_id        | uuid                     |          |
 name           | text                     | not null |
 description    | text                     |          |
 classification | text                     | not null |
 source_ref     | text                     |          |
 evidence_refs  | text[]                   |          |
 is_builtin     | boolean                  | not null | false
 archived_at    | timestamp with time zone |          |
 created_at     | timestamp with time zone | not null | now()
 updated_at     | timestamp with time zone | not null | now()
Indexes:
    "volume_presets_pkey" PRIMARY KEY, btree (id)
    "ix_volume_presets_user_id" btree (user_id)
Check constraints:
    "ck_volume_presets_classification" CHECK (classification = ANY (ARRAY['evidence_supported'::text, 'heuristic'::text, 'user_defined'::text]))
Foreign-key constraints:
    "volume_presets_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id)
Referenced by:
    TABLE "blocks" CONSTRAINT "blocks_volume_preset_id_volume_presets_id_fk" FOREIGN KEY (volume_preset_id) REFERENCES volume_presets(id) ON DELETE SET NULL
    TABLE "users" CONSTRAINT "users_default_volume_preset_id_volume_presets_id_fk" FOREIGN KEY (default_volume_preset_id) REFERENCES volume_presets(id) ON DELETE SET NULL
    TABLE "volume_landmarks" CONSTRAINT "volume_landmarks_preset_id_volume_presets_id_fk" FOREIGN KEY (preset_id) REFERENCES volume_presets(id) ON DELETE CASCADE

                 Table "public.volume_landmarks"
     Column      |     Type     | Nullable | Default
-----------------+--------------+----------+---------
 id              | uuid         | not null |
 preset_id       | uuid         | not null |
 muscle_group_id | text         | not null |
 key             | text         | not null |
 value_min       | numeric(5,1) |          |
 value_max       | numeric(5,1) |          |
 open_ended      | boolean      | not null | false
 note            | text         |          |
Indexes:
    "volume_landmarks_pkey" PRIMARY KEY, btree (id)
    "uq_landmark" UNIQUE CONSTRAINT, btree (preset_id, muscle_group_id, key)
Check constraints:
    "ck_volume_landmarks_value_max_gte_min" CHECK (value_max IS NULL OR value_min IS NULL OR value_max >= value_min)
    "ck_volume_landmarks_value_min_nonneg" CHECK (value_min >= 0::numeric)
    "ck_volume_landmarks_value_present" CHECK (value_min IS NOT NULL OR value_max IS NOT NULL)
Foreign-key constraints:
    "volume_landmarks_muscle_group_id_muscle_groups_id_fk" FOREIGN KEY (muscle_group_id) REFERENCES muscle_groups(id) ON DELETE RESTRICT
    "volume_landmarks_preset_id_volume_presets_id_fk" FOREIGN KEY (preset_id) REFERENCES volume_presets(id) ON DELETE CASCADE
```

`users.default_volume_preset_id` FK confirmed present (`users_default_volume_preset_id_volume_presets_id_fk ... ON DELETE SET NULL`); `blocks` FK confirmed present via `pg_constraint` (`blocks_volume_preset_id_volume_presets_id_fk` → `volume_presets`, alongside the pre-existing `blocks_program_id_programs_id_fk`).

Seed idempotence, live:

```
-- first run
volume_presets: 1 row (RP General, is_builtin=t, user_id=null)
volume_landmarks: 52 rows
users.default_volume_preset_id: c008da8a-...-238c (RP General's id)

-- second run (immediately after)
volume_presets: 1 row (unchanged)
volume_landmarks: 52 rows (unchanged)
users.default_volume_preset_id: c008da8a-...-238c (unchanged)
```

## Files changed

**Schema/migration**: `src/db/schema/volumePresets.ts` (new), `src/db/schema/volumeLandmarks.ts` (new), `src/db/schema/users.ts` (+`defaultVolumePresetId`), `src/db/schema/blocks.ts` (+FK on `volumePresetId`), `src/db/schema/index.ts` (exports), `drizzle/0008_great_metal_master.sql` (new), `drizzle/meta/0008_snapshot.json` + `_journal.json` (generated).

**Seed**: `src/db/seed/volumePresets.ts` (new), `src/db/seed/index.ts` (wired into `runSeed`).

**Domain**: `src/domain/volume/aggregate.ts`, `src/domain/volume/weekBuckets.ts`, `src/domain/volume/schema.ts` (all new).

**Server**: `src/server/volume/service.ts` (new), `src/server/time/userLocalDate.ts` (+`localDateToUtcInstant`).

**API**: `src/app/api/volume/route.ts` (new, GET), `src/app/api/volume/landmarks/route.ts` (new, PATCH).

**UI**: `src/ui/volume/{VolumeScreen,MuscleRow,LandmarkKeyEditor,volumeDisplay,types}.{ts,tsx}` (all new), `src/app/(app)/volume/page.tsx` (new), `src/app/(app)/layout.tsx` (+nav link).

**Tests**: `tests/unit/{volumeAggregate,volumeWeekBuckets,userLocalDate,volumePresetsSeed}.test.ts` (new), `tests/integration/{volume,volumeLandmarks,volumePresetsSeed}.integration.test.ts` (new), `tests/e2e/volume.spec.ts` (new).

**Docs**: `docs/architecture/volume-model.md`, `docs/architecture/adr/ADR-010-muscle-taxonomy-v2.md`, `docs/architecture/domain-model.md`, `docs/architecture/implementation-plan.md` (M-3 correction, narrow), `docs/architecture/deviations.md` (D-02 marked fully closed).

User-owned files confirmed untouched throughout (`git status` identical before/after for these): `CLAUDE.md`* , `HANDOFF.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`, `tsconfig.tsbuildinfo`. (*`CLAUDE.md`'s pre-existing modification and `HANDOFF.md`'s pre-existing deletion were already present in `git status` before this session started, per the task's own instructions — neither was touched by this implementation.)

## Judgment calls

1. **Default-preset initialization** (explicitly requested as a documented judgment call): a single state-predicated `UPDATE users SET default_volume_preset_id = <rp-general> WHERE default_volume_preset_id IS NULL`, run unconditionally on every `runSeed`. Mirrors ADR-010's own reconciliation idiom (predicate consumed by the update, no ledger). It does not distinguish "never set" from "user explicitly cleared it" — but the MVP has no UI action that clears a default, so post-seed `NULL` can only mean "never set." Proven to leave an explicitly-chosen non-RP-General default untouched (`volumePresetsSeed.integration.test.ts`).
2. **Active-preset resolution** reuses `today/service.ts`'s exact active-program → active-block pattern rather than inventing a new one, for consistency and because it's already the accepted precedent for "the one relevant X for this user right now."
3. **Duplicate-on-edit naming**: `"{name} (edited)"` (e.g. "RP General (edited)") rather than reusing the bare name — makes it visually unambiguous in the UI that the user is now viewing their own copy, satisfying "the user always wins" transparency without adding a rename UI.
4. **Landmark editor scope**: exposes exactly the 4 standard RP keys (`mv`/`mev`/`mav`/`mrv`) per muscle group, letting the user fill in a previously-absent one (e.g. adding a landmark to `lats`). The `note` field exists in the schema/API (and is populated by the seed) but is not exposed in the phone editor — a deliberate, minor trim to keep the form to the fields a user actually needs to tune, consistent with "smallest spec-consistent" scope discipline elsewhere in this task.
5. **Block-week bucketing** (`blockWeekWindow(s)` in the domain layer, `localDateToUtcInstant` at the server boundary) is implemented and tested end-to-end against real PGlite-queried rows (`volume.integration.test.ts`'s midnight-spanning-session test), but **no UI route currently invokes it** — the MVP Volume screen is calendar-week only, matching volume-model.md §2's explicit "Calendar week (dashboard)" framing. Domain support exists and is proven; no block-scoped volume view was built, avoiding scope creep beyond what mvp-scope F8 and the Phase 6 build bullet actually ask for.
6. **Circular schema reference** (`users.ts` ↔ `volumePresets.ts`) resolved with Drizzle's documented lazy-callback + explicit `AnyPgColumn` return-type pattern rather than a manual migration patch — verified end-to-end (typecheck, `db:generate`, live migration, live `\d` inspection) before relying on it.

## Limitations / deferred work (explicitly out of scope, confirmed absent)

Multiple named preset management, preset switching UI, volume-based recommendations/alerts/scores, MEV/MRV auto-calculation, frequency scoring, persisted volume aggregates or caches (grep/schema-checked — no aggregate-shaped table or column exists), per-session volume pacing, per-leaf RP landmarks, new muscle groups/rollups/hierarchy, automatic contribution inference, as-of contribution history, any Phase 7/8/9 scope, unrelated E2E harness remediation (the pre-existing `setupAccount`/`cookies()` bootstrap issue and the one flaky offline-sync timing test were worked around/reproduced-and-explained, not fixed).

No production access was used; nothing was committed, pushed, or deployed; no manual iPhone acceptance is claimed.

---

## Post-review remediation (2026-08-24)

Everything above this line describes the tree as it stood at **14:38** on 2026-08-24, when this report was originally written. It is preserved as history, not edited in place, per `docs/reviews/phase-6-review.md` M-1's own preference for a dated addendum over silently rewriting the original numbers. Two things happened after 14:38, in this order:

### A. Undocumented changes already in the tree at review time (17:19–17:21), never previously reported

An independent review (`docs/reviews/phase-6-review.md`) ran against the tree *after* this report was written and found it had moved: three behaviors were added between 14:38 and the review, all correct, none mentioned in the report's "Files changed," "Judgment calls," or verification block. Recorded here for the first time:

1. **A per-user PostgreSQL advisory lock in `upsertVolumeLandmark`** (`src/server/volume/service.ts:271-276`, `userVolumeLockKeys`). **Load-bearing, not defensive:** the "first edit of a builtin" path is read-then-write across two statements (resolve the active preset, then insert a duplicate if it's still builtin) inside one transaction — without serialization, two concurrent first edits for the same user both observe "still builtin," both insert their own duplicate preset, and only one of the two `default_volume_preset_id` repoints wins, silently discarding the other request's edit. The review reproduced this directly against real PostgreSQL with the lock removed (8 concurrent edits → 8 orphan presets, 7 of 8 values lost) and confirmed the lock fixes it completely (8/8 correct). This remediation pass reproduced the same failure mode independently — see §B.3 below.
   - **Key derivation:** PostgreSQL's `pg_advisory_xact_lock` takes either one bigint or two ints. `userVolumeLockKeys(userId)` strips the UUID's hyphens and splits its final 16 hex characters (64 bits) into two 32-bit signed ints (`| 0` to fold into range), giving each user a stable, collision-resistant lock key pair derived from their own id — no separate lock-key table, no coordination with the unrelated `SETUP_LOCK_KEY` bigint namespace `src/server/auth/service.ts` uses for first-run setup.
   - **Scope:** `select pg_advisory_xact_lock($1, $2)` is the *first* statement inside `upsertVolumeLandmark`'s `db.transaction()` block — transaction-scoped, so PostgreSQL releases it automatically on commit or rollback, and every subsequent statement in the same call (including **active-preset resolution**, which runs *after* the lock, not before) executes while holding it. Resolving after acquiring the lock is what makes the second of two concurrent callers see the *first* caller's already-created duplicate instead of stale pre-lock state — resolving before the lock would defeat the guard entirely.
2. **RP General attachment during `setupAccount`** (`src/server/auth/service.ts:56-77`). Inside the same transaction that creates the account, a lookup for `name = 'RP General' AND is_builtin = true AND user_id IS NULL` supplies `defaultVolumePresetId` on the `INSERT INTO users` itself. Three cases, all now covered:
   - **Account created after deploy-time seeding** (the real production order: `db:migrate → db:seed → app deploy`, so `db:seed` has already run at least once by the time anyone can sign up) — the new account gets RP General attached immediately, at creation, with reference bands visible from the first Volume screen load. This is the case that matters in production and was previously unhandled: without it, a fresh account saw no reference bands until the *next* deploy's seed step ran.
   - **Account created before any seed has ever run** (e.g. a test bootstrap that calls `setupAccount` against an unseeded database) — the lookup finds nothing, `defaultVolumePresetId` is left `undefined`/null, and `src/db/seed/volumePresets.ts`'s existing null-only `UPDATE users SET default_volume_preset_id = ... WHERE default_volume_preset_id IS NULL` remains the fallback the next time seeding runs.
   - **An account with an already-set, possibly-explicit default** — unreachable for `setupAccount` specifically (it only ever runs once, at row-creation time, before any default could have been explicitly chosen), but the general invariant — never overwrite a non-null default — is enforced by the seed's own `IS NULL` guard and is what the pre-existing `volumePresetsSeed.integration.test.ts` suite already asserts.
3. **Per-row provenance and note rendering in `MuscleRow.tsx`** (lines ~34-38, ~49-60). Every rendered reference-band summary is now prefixed `Coaching heuristic · MV … MEV … MAV … MRV …`, not just the page-level caption — the review found this on **all 65** rendered bands across a full 9,357px page, none unlabelled. Distinct, non-null landmark `note`s for a muscle group (deduplicated via a `Set`) render as their own lines beneath the summary — this is the mechanism by which the seeded Rear/Side-Delts combined-row caveat (`RP lists Rear Delts and Side Delts as one combined row…`) actually reaches the user, not just the database.
4. **Associated test coverage added in the same window:**
   - `tests/integration/auth.integration.test.ts` — new case `"assigns RP General when setup runs after the deploy-time seed"`: seeds muscle groups + RP General, then calls `setupAccount`, then asserts `defaultVolumePresetId === RP_GENERAL_PRESET_ID`.
   - `tests/e2e/volume.spec.ts` — extended to assert `/^Coaching heuristic · MV/` is visible on the current week's card, and that the Rear/Side-Delts caveat note text is rendered alongside the duplicated rows.
   - `tests/integration/volumeLandmarks.integration.test.ts` — the pre-existing `"serializes concurrent first edits…"` case (this is the test that motivated adding the lock in the first place, hence its presence at 17:21) — its framing is corrected in §B.3 below.

### B. This remediation pass — response to `docs/reviews/phase-6-review.md`'s three MEDIUM findings

The reviewer's own conclusion: *"Nothing I found is a production correctness defect."* Accordingly, nothing below changes production behavior. M-1 is a documentation fix (this addendum). M-2 is a one-clause doc correction. M-3 adds test coverage for an already-correct mechanism; no code in `src/server/volume/service.ts` changed as a result.

1. **M-1 (this section).** The report now describes the shipped tree, not just the 14:38 snapshot.
2. **M-2 — `volume-model.md` §5 rule 6.** The architecture review's original M-3 (`docs/reviews/pre-phase-6-muscle-taxonomy-architecture-review.md:76`) named five passages needing the "effective series only" qualifier; four were corrected in the original Phase 6 pass and one — §5 rule 6, the document's own "**binding on UI copy and future features**" section — was missed. One clause added, narrowly, matching the style already used for the other four corrections: *"...so the **effective** Back total is always explained by its parts (effective Back = effective Lats + effective Upper Back + Unclassified Back). Raw Back is a separately deduplicated per-set count and is not additive over raw Lats + raw Upper Back; the identity above holds for the effective series only."* No aggregation behavior changed — the shipped UI copy already stated this correctly; only the binding document's rule 6 was stale.
3. **M-3 — real-PostgreSQL concurrency coverage.**
   - **New file:** `tests/integration/volumeLandmarksConcurrency.integration.test.ts`, gated on its own `VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL` (never `DATABASE_URL` — CI sets that to an unreachable placeholder), following the exact precedent `tests/integration/reconcileContributionsConcurrency.integration.test.ts` established for the same PGlite limitation in the Muscle Taxonomy v2 Release 2 pass. `beforeAll` fails loudly (not flakily) if the target database already has users or user-owned presets. Fires **8 concurrent `upsertVolumeLandmark` calls, each editing a distinct muscle-group/key pair, over a real multi-connection `pg.Pool`** (genuinely separate PostgreSQL connections, not a single-connection simulation), and asserts every property the remediation task required: all 8 resolve without rejection; exactly 1 user-owned preset exists afterward (no orphans); the copy carries the builtin's full 52 rows plus all 8 edits; every edited value is present with its submitted value; the builtin RP General row and its 52 landmarks are byte-identical before/after; the user's `default_volume_preset_id` points at the one copy; and a subsequent `getWeeklyVolumeReport` read exposes every edit. `afterAll` deletes only the test's own preset/user rows and closes the pool. Full detail, including the negative-control proof that this test can actually detect the regression it's named after, is in `docs/reviews/phase-6-remediation.md`.
   - **Existing PGlite test reframed, not removed** (`tests/integration/volumeLandmarks.integration.test.ts`): renamed to `"converges sequential first-edit calls on one copy (not a concurrency/lock proof — see volumeLandmarksConcurrency.integration.test.ts)"`, with a comment explaining PGlite is a single in-process backend (one `pg_backend_pid()` for every query) so there is no interleaving for an advisory lock to prevent there — the reviewer confirmed this test still passes with the lock removed. What it legitimately still proves (idempotent convergence under sequential retries) is kept; the concurrency claim its old name made is not.

### Current test counts (final tree, after this remediation)

- `pnpm test:unit` — **408 passed** (32 files) — unchanged; no unit test touched by this pass.
- `pnpm test:integration` (ordinary run, no opt-in concurrency variables set) — **208 passed, 5 skipped** (16 passed files, 2 skipped files, 18 total). The skip count is 5, not the review's 4: `reconcileContributionsConcurrency.integration.test.ts` (4 tests) plus the new `volumeLandmarksConcurrency.integration.test.ts` (1 test), both correctly skipped without their dedicated opt-in variables.
- `VOLUME_LANDMARK_CONCURRENCY_DATABASE_URL` set, against a freshly migrated disposable database — **1/1 passed**.
- `pnpm typecheck`, `pnpm typecheck:sw`, `pnpm lint`, `pnpm format:check`, `pnpm build` — all clean, re-run after this remediation.

### Files changed by this remediation pass

`tests/integration/volumeLandmarksConcurrency.integration.test.ts` (new), `tests/integration/volumeLandmarks.integration.test.ts` (one test renamed + reframed, no behavioral change), `docs/architecture/volume-model.md` (§5 rule 6, one clause), `docs/reviews/phase-6-implementation.md` (this addendum), `docs/reviews/phase-6-remediation.md` (new, full handoff). No file under `src/` other than the test file changed — the lock, the `setupAccount` attachment, and the `MuscleRow` provenance/note rendering (§A above) were already correct and were not touched.

### Updated judgment call

7. **Concurrency-test negative control kept out of the shipped tree.** Per the remediation task's own instruction, the proof that the new test can detect the regression (temporarily bypassing the lock, confirming the test fails with orphan presets, then restoring the lock) was performed once, live, against a disposable database, and is recorded in `docs/reviews/phase-6-remediation.md` — it is not a permanent test in the repository (a test that disables production code to fail on purpose would itself be a footgun left in the tree).

## Verdict

**READY FOR TARGETED REMEDIATION VERIFICATION.**

Recommended next session title: `O-Max | P06 | Remediation Verification — Volume Tracking`
