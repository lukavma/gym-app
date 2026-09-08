# Athletic measurement profiles — Release 3: production exercise-name collision check

Check performed: **2026-09-09 00:20 CEST (+02:00)**
Performed against: the pending gate recorded in `docs/reviews/athletic-measurement-profiles-release-3-implementation.md` §8 (as corrected) and confirmed open by `docs/reviews/athletic-measurement-profiles-release-3-review.md` §7 item 1 — both read in full before this check.
Repository state: branch `main`, working tree unchanged by this task — `git status` before and after is identical to the state left by the implementation/review passes; only this new file was added. No source, test, authoring, implementation or review document was modified.

**This task's scope, explicitly:** read-only inspection of the owner's live (production) `exercises` table for the sole purpose of checking the ten Release-3 catalog names against existing active exercise names. Nothing was seeded, migrated, renamed, deleted, or otherwise written to production application data. The only production-side mutation performed was a temporary network-firewall rule (Azure infrastructure config, not application data), added with the owner's explicit approval and removed immediately after the check completed — detailed in §3.

---

## 1. The ten names, re-derived from the actual catalog

Independently re-derived from `src/db/seed/exerciseCatalog.ts` (not copied from either report), by locating the ten Release-3 entries appended after the existing 93 and reading their `name` fields directly:

| # | Slug | Name |
| --- | --- | --- |
| 1 | `other-sled-push` | Sled Push |
| 2 | `other-sled-drag` | Backward Sled Drag |
| 3 | `other-farmers-carry` | Farmer's Carry |
| 4 | `dumbbell-suitcase-carry` | Dumbbell Suitcase Carry |
| 5 | `bodyweight-sprint` | Sprint |
| 6 | `bodyweight-shuttle-run` | Shuttle Run |
| 7 | `other-med-ball-slam` | Medicine Ball Slam |
| 8 | `bodyweight-broad-jump` | Broad Jump |
| 9 | `bodyweight-box-jump` | Box Jump |
| 10 | `bodyweight-side-plank` | Side Plank |

Confirmed: **ten rows, ten case-insensitively distinct names** (verified programmatically: `new Set(names.map(n => n.toLowerCase())).size === 10`). This matches the corrected list in both the implementation report (post M-1 correction) and the independent review's M-1 finding — cross-checked against the source of truth (the catalog itself), not against either report's prose.

---

## 2. The constraint this check must reproduce

`src/db/schema/exercises.ts:66-70`:

```ts
uniqueIndex("uq_exercises_active_name")
  .on(table.userId, sql`lower(${table.name})`)
  .where(sql`${table.archivedAt} is null`),
```

`uq_exercises_active_name` is a **partial** unique index on `(user_id, lower(name))`, scoped to rows where `archived_at IS NULL`. Consequences for this check, taken directly from the constraint (not assumed):

- **Case-insensitive**: comparison must be on `lower(name)`, exactly as the query below does — a differently-cased existing name (e.g. "sled push") would still collide.
- **Active-only**: an **archived** exercise sharing a Release-3 name would **not** block the seed insert — the comment above the index states this is deliberate ("Allows re-using a name after archiving"). So this check inspects both active and archived matches, but only an **active** match is a real collision.
- **Per-user**: scoped to `user_id`. The app is single-account (ADR-004), confirmed live below (§4) — one user row in production — so this is not a meaningful additional dimension here, but the query still only needs to consider that one account's rows.

Seeder behavior on a collision, from `src/db/seed/exercises.ts:125-144` (unchanged by Release 3, confirmed in the prior implementation/review passes): the insert is **arbiter-less** `onConflictDoNothing()`. A name collision makes Postgres skip that one row silently — the seed script does not fail — and the slug is still recorded in `exercise_catalog_seed_log` as applied, so no later deploy reconsiders it. This is why the check matters and why any real collision would need a name change, not a retry.

---

## 3. Method

### 3.1 Account and infrastructure access

- Azure CLI (`az`) was already installed; the cached login (from 2026-08-10) had expired (`AADSTS70043`, conditional-access sign-in-frequency policy) and could not reach any live resource. **Paused and asked the owner how to proceed** rather than substituting any other data source; the owner chose to re-authenticate. `az login --tenant 7744b0a2-04f5-43d5-9336-2c0b9c1c0079` was run interactively (opened the owner's browser for sign-in); confirmed against the owner's own subscription afterward.
- Confirmed the production PostgreSQL Flexible Server (`psql-gymapp-prod-weu-martis01`, resource group `rg-gymapp-prod-weu`) is `Ready`, PostgreSQL 16, West Europe — matching `docs/deployment/azure-provisioning.md`.
- The server's firewall did not permit this machine's current public IP (the pre-existing `allow-my-ip` rule was stale, pointing at a different address than this machine currently has — an artifact of a previous session/location, left untouched). Rather than route around the block, **this was surfaced to the owner directly**, who explicitly approved adding a temporary rule for this check.
- A temporary firewall rule (`allow-my-ip-r3check-temp`, this machine's current IP only) was created, the query in §3.2 was run, and the rule was **deleted immediately afterward**. Confirmed via `az postgres flexible-server firewall-rule show` (returns `ResourceNotFound` for the temp rule) and a full `firewall-rule list` showing exactly the same two pre-existing rules (`allow-azure-services`, `allow-my-ip`) plus the pre-existing stale `allow-my-ip-temp` — both present before this check and untouched by it. **No pre-existing firewall rule was modified or removed.**

### 3.2 The query

The production `DATABASE_URL` (an existing Azure App Service application setting on `app-gymapp-prod-weu-martis01`, configured by the owner during provisioning — not a new credential created for this task) was read directly into a shell environment variable via `az webapp config appsettings list --query "[?name=='DATABASE_URL'].value"` and used immediately in the same command to connect — **the connection string and password were never printed, logged, or written to a file**; only the resolved hostname (`psql-gymapp-prod-weu-martis01.postgres.database.azure.com`) was echoed for confirmation.

A short-lived Node script (`pg` — a dependency already in this repo, run from the repo root so its own `node_modules` resolves) opened one connection, ran:

```sql
BEGIN TRANSACTION READ ONLY;

SELECT name, (archived_at IS NULL) AS active
FROM exercises
WHERE lower(name) = ANY($1::text[])   -- the ten names, lower-cased
ORDER BY name;

COMMIT;
```

`BEGIN TRANSACTION READ ONLY` makes any accidental write fail at the database level rather than relying only on the query being a `SELECT` — no `INSERT`/`UPDATE`/`DELETE`/DDL statement was issued anywhere in the script. The script and its temporary firewall rule were both removed immediately after the run; `git status` after this task is unchanged apart from this new file.

---

## 4. Account scope

- **1** user row in the production `users` table (confirmed by `SELECT count(*) FROM users`) — the single account the app is designed for (ADR-004). No email, id, or other identifying value from that row is recorded here or was needed for the check.
- **97** rows in that account's `exercises` table (active + archived combined) at check time.

---

## 5. Result — ten-row table

| # | Name (as it will be seeded) | Case-insensitive match found in production? | Matching row(s) | Active-name collision (blocks seeding) |
| --- | --- | --- | --- | --- |
| 1 | Sled Push | No | — | No |
| 2 | Backward Sled Drag | No | — | No |
| 3 | Farmer's Carry | No | — | No |
| 4 | Dumbbell Suitcase Carry | No | — | No |
| 5 | Sprint | No | — | No |
| 6 | Shuttle Run | No | — | No |
| 7 | Medicine Ball Slam | No | — | No |
| 8 | Broad Jump | No | — | No |
| 9 | Box Jump | No | — | No |
| 10 | Side Plank | No | — | No |

The query (§3.2) returned **zero rows** against the full set of ten lower-cased names, across **both** active and archived exercises — so there is no match to distinguish by active/archived status: none of the owner's 97 existing exercises (in either state) share any of the ten Release-3 names, case-insensitively.

---

## 6. Collisions found

**None.** No slug or name requires a resolution decision. Nothing in the approved catalog (`src/db/seed/exerciseCatalog.ts`) was or needs to be changed.

---

## 7. Cleanup and boundary confirmation

- Temporary firewall rule `allow-my-ip-r3check-temp`: created, used, deleted — confirmed absent (§3.1).
- Temporary verification script: written to the repo root for the duration of the run, deleted immediately after; absent from `git status`.
- No `INSERT`, `UPDATE`, `DELETE`, or DDL statement was sent to production at any point; the query ran inside `BEGIN TRANSACTION READ ONLY … COMMIT`.
- No pre-existing Azure resource, firewall rule, or App Service setting was altered.
- No file other than this report was added or modified — `docs/reviews/athletic-measurement-profiles-release-3-implementation.md`, its independent review, the authoring document, and all unrelated pre-existing working-tree changes (`CLAUDE.md`, deleted `HANDOFF.md`, `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, the three unrelated `docs/reviews/*` entries) are untouched.
- No commit, push, or deployment was performed or is authorized by this document.

---

## 8. Verdict

All ten Release-3 catalog names were checked, case-insensitively, against every one of the owner's 97 existing production exercises (active and archived) using the exact semantics of `uq_exercises_active_name`. Zero matches. The one production-facing risk both the implementation and independent review reports flagged as open is now discharged by direct, read-only evidence against the live account — not assumed, not substituted with development data.

This does not itself authorize commit, push, or deployment (unchanged from the review's verdict) — it discharges specifically the name-collision gate those documents left open.

NAME-COLLISION GATE PASSED
