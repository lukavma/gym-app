# Exercise catalog expansion — pre-deployment check (Catalog Expansion 1)

Date: 2026-09-10
Performed against: the pending gates left open by `docs/reviews/exercise-catalog-expansion-implementation-review.md` (verdict **VERIFIED — READY FOR CATALOG EXPANSION DEPLOYMENT**) — specifically §12's production name-collision gate, and findings F-1, F-2 and F-3 from that review's §10 report-accuracy audit. F-4 (non-blocking) is explicitly deferred, per this task's own scope.
Repository state: branch `main`, `HEAD = 56ec000`, implementation still uncommitted. `git status` before and after this task is identical except for one line changed in `docs/reviews/exercise-catalog-expansion-implementation.md` (the F-2/F-3 corrections) and this new file. No source or test file was touched; the independent review document was not modified.

**This task's scope, explicitly:** read-only inspection of the owner's live (production) `exercises` table for the sole purpose of checking the 24 Catalog Expansion 1 names against existing active exercise names; identifying and, if confirmed as this session's own leftover, stopping a local process; and correcting wording in this implementation's own report. Nothing was seeded, migrated, renamed, deleted, or otherwise written to production application data. The only production-side mutation performed was a temporary network-firewall rule (Azure infrastructure config, not application data), added with the owner's explicit approval and removed immediately after the check — detailed in §1.3.

---

## 1. Production name-collision check

### 1.1 The 24 names, re-derived from the actual catalog

Independently re-derived from `src/db/seed/exerciseCatalog.ts` at its current (uncommitted) state — not copied from the evaluation, implementation, or review reports — by locating the 24 Catalog Expansion 1 entries appended after the existing 103 and reading their `slug`/`name` fields directly:

| # | Slug | Name |
| --- | --- | --- |
| 1 | `barbell-rack-pull` | Barbell Rack Pull |
| 2 | `barbell-power-clean` | Barbell Power Clean |
| 3 | `barbell-hang-clean` | Barbell Hang Clean |
| 4 | `dumbbell-lateral-lunge` | Dumbbell Lateral Lunge |
| 5 | `dumbbell-reverse-lunge` | Dumbbell Reverse Lunge |
| 6 | `dumbbell-single-leg-romanian-deadlift` | Dumbbell Single-Leg Romanian Deadlift |
| 7 | `dumbbell-chest-supported-row` | Dumbbell Chest-Supported Row |
| 8 | `dumbbell-pullover` | Dumbbell Pullover |
| 9 | `dumbbell-thruster` | Dumbbell Thruster |
| 10 | `dumbbell-farmers-hold` | Dumbbell Farmer's Hold |
| 11 | `cable-pallof-press` | Cable Pallof Press |
| 12 | `machine-hip-abduction` | Hip Abduction Machine |
| 13 | `machine-assisted-dip` | Assisted Dip |
| 14 | `bodyweight-dead-hang` | Dead Hang |
| 15 | `bodyweight-ab-wheel-rollout` | Ab Wheel Rollout |
| 16 | `bodyweight-wall-sit` | Wall Sit |
| 17 | `bodyweight-nordic-curl` | Nordic Hamstring Curl |
| 18 | `bodyweight-lateral-bound` | Lateral Bound |
| 19 | `bodyweight-copenhagen-adduction-plank` | Copenhagen Adduction Plank |
| 20 | `bodyweight-tibialis-raise` | Tibialis Raise |
| 21 | `other-kettlebell-swing` | Kettlebell Swing |
| 22 | `other-forward-sled-drag` | Forward Sled Drag |
| 23 | `other-sled-pull` | Hand-Over-Hand Sled Pull |
| 24 | `other-med-ball-rotational-scoop-throw` | Medicine Ball Rotational Scoop Throw |

Confirmed programmatically inside the check script itself (not just by eye): **24 rows, 24 case-insensitively distinct names** (`new Set(names.map(n => n.toLowerCase())).size === 24`). This matches §6's manifest in the evaluation document and the implementation report's own manifest — cross-checked against the source of truth (the catalog file), not against any report's prose.

### 1.2 The constraint this check reproduces

Same partial unique index as the Release-3 check (`src/db/schema/exercises.ts:66-70`, unchanged by this release):

```ts
uniqueIndex("uq_exercises_active_name")
  .on(table.userId, sql`lower(${table.name})`)
  .where(sql`${table.archivedAt} is null`),
```

- **Case-insensitive** — the query matches on `lower(name)`.
- **Active-only blocking** — a collision with an *archived* row would not block seeding (the index's own comment: "Allows re-using a name after archiving"), so this check inspects both active and archived matches but only an active match is a real collision.
- **Owner-scoped** — the app is single-account (ADR-004); confirmed live below (§1.4) that exactly one user row exists in production, so per-user scoping is not a meaningful additional dimension here, but the query still only ever sees that one account's rows.

Seeder behaviour on a collision (`src/db/seed/exercises.ts`, unchanged by this release): the insert is arbiter-less `onConflictDoNothing()`. A name collision makes Postgres silently skip that one row, and the slug is still recorded as applied in `exercise_catalog_seed_log` — no later deploy reconsiders it. This is why the check matters and why a real collision would need a name change, not a retry.

### 1.3 Method

**Authentication.** The cached Azure CLI session (`az account show`) resolved to the correct account and subscription, but the underlying token had expired under the same conditional-access sign-in-frequency policy the Release-3 check hit (`AADSTS70043`) — confirmed by the first resource-level call (`az postgres flexible-server show`) failing while the cached identity check succeeded. **Paused and asked the owner for explicit approval before taking any authentication or network action**, per this task's own instruction. The owner approved both re-authentication and a temporary firewall rule if needed. `az login --tenant 7744b0a2-04f5-43d5-9336-2c0b9c1c0079` was then run interactively (opened the owner's browser for sign-in); the correct subscription (`Visual Studio Enterprise-Abonnement — MPN`) came back as the default afterward, matching the Release-3 precedent.

**Server confirmation.** `psql-gymapp-prod-weu-martis01` (resource group `rg-gymapp-prod-weu`) confirmed `Ready`, PostgreSQL 16, West Europe.

**Firewall.** The server's existing rules (`allow-azure-services`, `allow-my-ip`, `allow-my-ip-temp`) all pointed at `93.208.52.202` — this machine's current public IP is `87.156.163.220`, so none of the existing rules covered it. A temporary rule, `allow-my-ip-ce1check-temp`, was created for that single address, used for the check below, and **deleted immediately afterward** — confirmed via `az postgres flexible-server firewall-rule list`, which shows exactly the same three pre-existing rules both before and after this task, with the temporary one absent from the final listing. No pre-existing firewall rule was modified or removed.

**The query.** The production `DATABASE_URL` (an existing Azure App Service application setting on `app-gymapp-prod-weu-martis01`, not a new credential) was read directly into a shell variable via `az webapp config appsettings list --query "[?name=='DATABASE_URL'].value" -o tsv` and consumed immediately by the same shell session — **the connection string and password were never printed, logged, or written to a file**; only the resolved hostname (`psql-gymapp-prod-weu-martis01.postgres.database.azure.com`) and database name (`gymapp`) were echoed for confirmation.

A short-lived Node script (`pg`, a dependency already in this repo, run from the repo root so its own `node_modules` resolves) opened one connection and ran:

```sql
BEGIN TRANSACTION READ ONLY;

SELECT name, (archived_at IS NULL) AS active
FROM exercises
WHERE lower(name) = ANY($1::text[])   -- the 24 names, lower-cased
ORDER BY name;

COMMIT;
```

`BEGIN TRANSACTION READ ONLY` makes any accidental write fail at the database level rather than relying only on the query being a `SELECT` — no `INSERT`/`UPDATE`/`DELETE`/DDL statement was issued anywhere in the script. The script (`check-collisions-ce1-temp.mjs`, written to the repo root for the duration of the run) was deleted immediately after; `git status` after this task shows no trace of it.

### 1.4 Account scope

- **1** user row in the production `users` table (`SELECT count(*) FROM users`) — the single account the app is designed for (ADR-004). No email, id, or other identifying value from that row is recorded here or was needed for the check.
- **107** rows in that account's `exercises` table (active + archived combined) at check time — consistent with the Release-3 check's own count of 97 plus the ten Release-3 entries seeded since (97 + 10 = 107), which is an internal sanity confirmation that production has in fact already received the Release-3 deploy this catalog expansion appends after.

### 1.5 Result

The query returned **zero rows** against the full set of 24 lower-cased names, across both active and archived exercises.

| # | Name (as it will be seeded) | Case-insensitive match found in production? | Matching row(s) | Active-name collision (blocks seeding) |
| --- | --- | --- | --- | --- |
| 1 | Barbell Rack Pull | No | — | No |
| 2 | Barbell Power Clean | No | — | No |
| 3 | Barbell Hang Clean | No | — | No |
| 4 | Dumbbell Lateral Lunge | No | — | No |
| 5 | Dumbbell Reverse Lunge | No | — | No |
| 6 | Dumbbell Single-Leg Romanian Deadlift | No | — | No |
| 7 | Dumbbell Chest-Supported Row | No | — | No |
| 8 | Dumbbell Pullover | No | — | No |
| 9 | Dumbbell Thruster | No | — | No |
| 10 | Dumbbell Farmer's Hold | No | — | No |
| 11 | Cable Pallof Press | No | — | No |
| 12 | Hip Abduction Machine | No | — | No |
| 13 | Assisted Dip | No | — | No |
| 14 | Dead Hang | No | — | No |
| 15 | Ab Wheel Rollout | No | — | No |
| 16 | Wall Sit | No | — | No |
| 17 | Nordic Hamstring Curl | No | — | No |
| 18 | Lateral Bound | No | — | No |
| 19 | Copenhagen Adduction Plank | No | — | No |
| 20 | Tibialis Raise | No | — | No |
| 21 | Kettlebell Swing | No | — | No |
| 22 | Forward Sled Drag | No | — | No |
| 23 | Hand-Over-Hand Sled Pull | No | — | No |
| 24 | Medicine Ball Rotational Scoop Throw | No | — | No |

**None of the owner's 107 existing production exercises (active or archived) share any of the 24 Catalog Expansion 1 names, case-insensitively.** No slug or name requires a resolution decision. Nothing in the approved catalog (`src/db/seed/exerciseCatalog.ts`) was or needs to be changed.

### 1.6 Cleanup and boundary confirmation

- Temporary firewall rule `allow-my-ip-ce1check-temp`: created, used, deleted — confirmed absent from the final `firewall-rule list`, which shows the same three pre-existing rules as before this task.
- Temporary verification script `check-collisions-ce1-temp.mjs`: written to the repo root for the duration of the run, deleted immediately after; absent from `git status`.
- No `INSERT`, `UPDATE`, `DELETE`, or DDL statement was sent to production at any point; the query ran inside `BEGIN TRANSACTION READ ONLY … COMMIT`.
- No pre-existing Azure resource, firewall rule, or App Service setting was altered.
- The production `DATABASE_URL` value itself was never printed, logged, or written to a file at any point in this task.

---

## 2. F-1 — the port-3000 listener, identified and stopped

The independent review found a Next.js server still listening on port 3000 (PID 39392, since 2026-09-09 22:30) and correctly declined to kill it without confirming ownership. Per this task's instruction, the process was re-identified rather than assumed:

```
Get-NetTCPConnection -LocalPort 3000 -State Listen
  -> OwningProcess 39392

Get-CimInstance Win32_Process -Filter "ProcessId = 39392"
  -> CommandLine:  node "C:\DEV\gym-app\node_modules\.bin\..\next\dist\bin\next" start
  -> CreationDate: 2026-09-09 22:30:25
  -> ParentProcessId: 33524

Get-CimInstance Win32_Process -Filter "ProcessId = 33524"   (the parent)
  -> Name: cmd.exe
  -> CommandLine: C:\WINDOWS\system32\cmd.exe /d /s /c next start
  -> CreationDate: 2026-09-09 22:30:24
```

This is unambiguously this repository's own `pnpm start` invocation from the Catalog Expansion 1 implementation pass (§6.1/§6.2 of the implementation report): the executable path is `C:\DEV\gym-app\node_modules\...`, the command is exactly `next start`, and the creation timestamp (2026-09-09 22:30) falls squarely inside that implementation session's browser-verification window, one second after its `cmd.exe` wrapper — consistent with a `pnpm start` background task whose Bash-tool wrapper was stopped (as the implementation report claims) without the underlying detached `next start`/`cmd.exe` process tree being reaped, which is a known Windows behaviour for a pnpm-spawned child surviving its parent's termination. No other session or process claims this port, and nothing in this task's own work depends on it.

**Confirmed as this session's own leftover — stopped:**

```
Stop-Process -Id 39392 -Force   (node: next start)
Stop-Process -Id 33524 -Force   (cmd.exe wrapper)

-> port 3000: no listener
-> PID 39392: no such process
```

Port 3000 is now free. No other process was inspected or touched.

---

## 3. F-2 / F-3 — implementation report corrections

Both corrected in `docs/reviews/exercise-catalog-expansion-implementation.md`; the independent review document itself was **not** modified.

- **F-2.** §5.1 step 1 and §5.2 step 3 previously read "5 migrations applied" / "5 migrations, none new" — an artefact of miscounting `drizzle-kit migrate`'s spinner frames, which the review caught by querying `drizzle.__drizzle_migrations` directly (14 rows). Corrected to state plainly: a fresh database applies **all 14** pre-existing migrations; an already-migrated database applies **zero new** ones. Neither the underlying evidence nor the conclusion changes — the report's own §4.1 already stated the `drizzle/` directory holds 14 files, both before and after this release, and that fact is unchanged. The correction attributes the review's own evidence (the `drizzle.__drizzle_migrations` count) rather than restating it as independently rediscovered here.
- **F-3.** §6.2 previously labelled its live-browser walkthroughs "mutation tests exercising the actual UI and network layer." Corrected to describe them as live browser walkthroughs that write real data — exploratory verification, explicitly distinguished from the testing technique "mutation testing" (deliberately breaking the implementation to confirm a test catches it), which was not performed in that pass. The correction cites `exercise-catalog-expansion-implementation-review.md` §5.1 as the actual mutation-testing work for this release, without restating or duplicating it. §7's "Regression vs. mutation distinction" bullet — which the review noted contradicted §6.2 — was reworded to "Regression vs. exploratory," removing the residual ambiguity.

A one-line provenance note was added near the top of the implementation report recording that this correction pass occurred, dated 2026-09-10, referencing this document and the independent review; the note is explicit that neither correction changes any measured result, file manifest, or verdict.

**F-4 deferred, as instructed.** The review's F-4 (three `CATALOG_EXPANSION_1_ENTRIES` count-assertions filter the test's own fixture rather than `EXERCISE_CATALOG`) is non-blocking, does not lose coverage (the per-entry `it.each` catches everything, confirmed by the review's own mutation testing), and is left for a follow-up pass. No source or test file was changed in this task, and the full suite was not re-run — both correctly out of scope here.

---

## 4. Boundaries, preservation and cleanup

**Unrelated changes preserved untouched:** `CLAUDE.md`, `HANDOFF.md` (deleted), `docs/input/product-ideas.md`, `.claude/skills/`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, the two `repository-agent-workflow-*` reports, `warmup-routines-evidence-research.md`, and `docs/reviews/post-p10-roadmap-evaluation.md` (present in the working tree from outside this task, left alone). The independent implementation review, both revision verifications, the original review, and the evaluation document are all byte-unmodified.

**No source or test file was changed.** `git diff --stat` for this task touches exactly one existing file (`docs/reviews/exercise-catalog-expansion-implementation.md`, wording only) plus this new report.

**Cleanup confirmed:**
- Azure: temporary firewall rule removed (§1.6); no other Azure resource created or altered; Azure CLI session left authenticated (the owner's own re-authentication, not a resource this task should tear down).
- Local: the confirmed-leftover `next start` process and its `cmd.exe` parent stopped (§2); port 3000 free.
- Repository: temporary collision-check script deleted; no `.scratch`, temporary spec, or `test-results` directory created by this task.

**No commit, push, or deployment was performed or is authorized by this document.**

---

## 5. Verdict

All 24 Catalog Expansion 1 catalog names were checked, case-insensitively, against every one of the owner's 107 existing production exercises (active and archived) using the exact semantics of `uq_exercises_active_name`, via `BEGIN TRANSACTION READ ONLY`, with the owner's explicit approval for the authentication and firewall steps required to reach the server. Zero matches. F-1 was resolved (the leftover process identified with certainty and stopped). F-2 and F-3 are corrected in the implementation report, with the independent review left untouched. F-4 is deferred as instructed.

This does not itself authorize commit, push, or deployment. The remaining §12 gates from the independent review — D-CE1-1(i) per-client update controls, D-CE1-1(ii) post-deployment read-only Tibialis check, and device acceptance on the iPhone — are still outstanding and are unaffected by this document.

---

NAME-COLLISION GATE PASSED
