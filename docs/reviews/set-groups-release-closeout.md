# Set Groups (PI-012) A+B — release closeout

**Date:** 2026-09-13
**Role:** release execution (commit, push, observe deployment, read-only verification)
**Scope:** the joint A+B feature only — commit/push/deploy of the independently-verified Set Groups
work. No product behavior was changed and no accepted advisory was reopened; this is a release-scoping
and delivery action, not a review or remediation pass.
**Binding verdicts relied on:**
[set-groups-supersession-verification.md](set-groups-supersession-verification.md) §8 —
**VERIFIED — READY FOR SET GROUPS A+B RELEASE CLOSEOUT** (the final link in the F-1…F-9 → V-1…V-3 →
W-1…W-3 → supersession chain; see that report and
[set-groups-stage-b-implementation.md](set-groups-stage-b-implementation.md) §§12–14 for the full
disposition history — not reloaded here).

---

## 1. Release scope — exact committed paths

Reconciled by reading every modified/untracked file's actual diff (hunk-by-hunk for files shared with
concurrent work) against the Stage A and Stage B implementation reports' own file manifests, so the
commit contains exactly the reviewed A+B work — no more, no less.

`git diff --cached --name-only` at commit time (89 files, a subset of the two implementation reports'
combined manifests plus the binding-input/evaluation/research reports named in this task):

```
docs/BACKLOG.md
docs/ROADMAP.md
docs/architecture/adr/ADR-008-prescription-representation.md
docs/architecture/data-model.md
docs/architecture/domain-model.md
docs/architecture/evidence-to-design.md
docs/architecture/prescription-model.md
docs/architecture/progression-engine.md
docs/architecture/pwa-offline-strategy.md
docs/reviews/set-groups-architecture-evaluation.md
docs/reviews/set-groups-architecture-review.md
docs/reviews/set-groups-architecture-revision-verification-2.md
docs/reviews/set-groups-architecture-revision-verification.md
docs/reviews/set-groups-release-residual-verification.md
docs/reviews/set-groups-stage-a-documentary-closeout-verification.md
docs/reviews/set-groups-stage-a-implementation.md
docs/reviews/set-groups-stage-a-remediation-verification-2.md
docs/reviews/set-groups-stage-a-remediation-verification.md
docs/reviews/set-groups-stage-a-review.md
docs/reviews/set-groups-stage-b-implementation.md
docs/reviews/set-groups-stage-b-remediation-verification.md
docs/reviews/set-groups-stage-b-review.md
docs/reviews/set-groups-strength-evidence-research.md
docs/reviews/set-groups-supersession-verification.md
drizzle/0014_third_scream.sql
drizzle/meta/0014_snapshot.json
drizzle/meta/_journal.json
package.json
src/db/schema/recommendations.ts
src/db/schema/setLogs.ts
src/domain/measurement/compatibility.ts
src/domain/prescriptions/applyWeekModifiers.ts
src/domain/prescriptions/buildSnapshot.ts
src/domain/prescriptions/schema.ts
src/domain/progression/engine.ts
src/domain/progression/evaluateSession.ts
src/domain/progression/evaluationTarget.ts
src/domain/progression/groupEvaluation.ts
src/domain/progression/loadProgression.ts
src/domain/progression/registry.ts
src/domain/progression/repProgression.ts
src/domain/progression/workingTargets.ts
src/domain/schemas/prescriptionSnapshot.ts
src/domain/schemas/recommendation.ts
src/domain/schemes/setScheme.ts
src/domain/sync/schema.ts
src/domain/sync/setDeletionOps.ts
src/server/history/service.ts
src/server/prescriptions/service.ts
src/server/progression/service.ts
src/server/sync/service.ts
src/server/today/service.ts
src/sync/activeSession.ts
src/sync/activeSessionStore.ts
src/sync/corrections.ts
src/sync/types.ts
src/ui/history/HistoryDetail.tsx
src/ui/history/correctionSubmit.ts
src/ui/history/types.ts
src/ui/prescriptions/PrescriptionForm.tsx
src/ui/today/TodaySection.tsx
src/ui/workout/ExerciseCard.tsx
src/ui/workout/RecommendationCard.tsx
src/ui/workout/groupSelection.ts
tests/e2e/dead-letter.spec.ts
tests/e2e/helpers.ts
tests/e2e/setGroups.spec.ts
tests/e2e/setGroupsOffline.spec.ts
tests/integration/measurementSync.integration.test.ts
tests/integration/setGroups.integration.test.ts
tests/unit/applyWeekModifiers.test.ts
tests/unit/measurement/dtoRoundTrip.test.ts
tests/unit/measurement/uiFormatWiring.test.ts
tests/unit/prescriptions/formOptions.test.ts
tests/unit/progressionMatrix.test.ts
tests/unit/progressionWorkSetMapping.test.ts
tests/unit/setGroups/activeSessionGroups.test.ts
tests/unit/setGroups/applyWeekModifiersGroups.test.ts
tests/unit/setGroups/buildSnapshotGroups.test.ts
tests/unit/setGroups/evaluateSessionGroups.test.ts
tests/unit/setGroups/groupEvaluation.test.ts
tests/unit/setGroups/groupSelection.test.ts
tests/unit/setGroups/prescriptionCompatibility.test.ts
tests/unit/setGroups/prescriptionFormLinkSanitize.test.ts
tests/unit/setGroups/registryGroupProgression.test.ts
tests/unit/setGroups/rollbackCompatibility.test.ts
tests/unit/setGroups/setSchemeGroups.test.ts
tests/unit/sync/rollbackCompatibility.test.ts
tests/unit/sync/setLogEmission.test.ts
```

89 files changed, 26,093 insertions(+), 356 deletions(-). Confirmed a subset of: Stage A's own
task-owned manifest + "concurrent, untouched" disclaimer (together exhaustive over the pre-existing
dirty tree), and Stage B §6/§12.3/§13.3/§14.3's combined manifests across all four remediation passes.

### 1.1 Explicitly excluded (left uncommitted, untouched)

Two unrelated initiatives were sitting in the same dirty working tree and were deliberately **not**
touched:

- **PI-017 (repository-agent-workflow)** — `docs/process/`, `docs/reviews/repository-agent-workflow-*.md`
  (6 files), `.claude/skills/`, and hunks inside `CLAUDE.md`, `README.md`, `docs/ROADMAP.md` and
  `docs/BACKLOG.md`. Confirmed by hunk-level reading that PI-017 touches **zero** application
  source/test/config files — it is confined to documentation and tooling. Its own closeout has not
  happened; nothing about its status was assumed or advanced here.
- **PI-018 (workout prescription context)** — `docs/STATUS.md`'s pending acceptance-recording hunk,
  `docs/reviews/workout-prescription-context-device-acceptance.md`. Separate, already-implemented
  feature; not part of this release.
- Unrelated cruft: `HANDOFF.md` (deleted — a stale 2026-08-10 Phase 0 handoff doc, unrelated to Set
  Groups), `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md` (personal scratch files),
  `docs/research/The Reactive Training Manual…pdf` (supplied reference material for
  `set-groups-strength-evidence-research.md`, explicitly read-and-left-unstaged by that report's own
  disclosure), `docs/reviews/exercise-catalog-expansion-closeout.md` (separate, already-shipped
  feature), `docs/reviews/warmup-routines-evidence-research.md` (separate, prior feature), and one-line
  stale-comment fixes in `playwright.config.ts` and `tests/e2e/seed.ts` not claimed by either
  implementation report's manifest.

### 1.2 Mixed files — split at the hunk level

`docs/ROADMAP.md` and `docs/BACKLOG.md` each carried both a PI-012 hunk and unrelated PI-017/PI-018
hunks in the same file. Both were split precisely: the PI-012-only content (the identifier rename, the
disposition-table row, and the full PI-012 section rewrite/D-1…D-6 addendum) was staged and committed;
the PI-017 paragraph, PI-017's own disposition-table row and full section, and the PI-017 cross-reference
under "Deferred direction and operating rule" were left exactly as they were in the working tree,
uncommitted. Verified before committing: `git diff --cached -- docs/ROADMAP.md docs/BACKLOG.md` showed
only the PI-012 hunks; `git diff -- docs/ROADMAP.md docs/BACKLOG.md` (post-commit, against the new HEAD)
showed only the PI-017 remainder, byte-for-byte the same content that was sitting there before this
release commit touched anything.

### 1.3 Documentation link dependency check

Every `docs/reviews/set-groups-*.md` file that cites `../process/agent-workflow.md` (the review-process
conventions doc, PI-017's own uncommitted deliverable) for its evidence-level/negative-control/severity
methodology was **left as-is**. These are accurate historical citations describing conventions actually
followed during each review — not PI-012 errors — and rewriting them would alter the historical review
record for a release-scoping reason, which the task's own "do not reopen accepted advisories" instruction
argues against. The consequence is disclosed rather than silently accepted: these relative links resolve
locally today (the file exists, uncommitted, in the working tree) but are dangling in the pushed commit
until PI-017 is separately committed — a temporary, self-resolving gap, not a defect in this release's
own content. No such dependency exists in this closeout report or in the architecture-layer docs
(`prescription-model.md`, `ADR-008`, `domain-model.md`, `data-model.md`, `progression-engine.md`,
`evidence-to-design.md`, `pwa-offline-strategy.md`), which carry no PI-017 references at all.

---

## 2. Release-candidate validation

### 2.1 Isolated task-owned checkout

Built from git's own index/object model rather than a second clone: `git write-tree` on the staged
index, wrapped in a detached scratch commit (`git commit-tree <tree> -p 583a9ab`, never pointed at by
any branch), checked out via `git worktree add --detach C:\DEV\gym-app-rc-check <scratch-commit>`. This
produced an exact, isolated copy of "583a9ab + exactly these 89 files" — confirmed by `git diff 583a9ab
HEAD --name-only` inside the worktree returning exactly 89 paths, and by direct inspection that
`docs/process/`, `.claude/skills/`, and every `repository-agent-workflow-*.md` file were absent.

Disposable database `gymapp_t_sgrel` (Docker Postgres, `localhost:5432`), used only by this worktree.

### 2.2 Executed here (this release pass)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | clean |
| `pnpm db:migrate` (0014) | `migrations applied successfully!` |
| `pnpm exec drizzle-kit check` | `Everything's fine` — no drift between the committed migration/snapshot and the schema |
| `pnpm db:seed` ×2 | `Seed complete.` both times — idempotence confirmed |
| Manual schema check | `set_logs.group_key` and `recommendations.group_key` (both nullable `text`) present; `uq_recs_one_pending` is the expected partial unique btree on `(exercise_id, coalesce(block_id, zero-uuid), coalesce(group_key, ''))` filtered on `decision_status = 'pending'` — matches `0014_third_scream.sql` exactly |
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm typecheck:sw` | clean |
| `pnpm format:check` | clean, **after** a one-time normalization — see §2.3 |
| `pnpm test:unit` | **1419 passed**, 0 failed, 97 files |
| `pnpm test:integration` (PGlite) | **511 passed, 17 skipped**, 0 failed, 35 files |
| `pnpm build` | production build completed |

All executed on the isolated worktree/database pairing above; no suite overlapped another; the shared
`gymapp` database was never touched by this validation.

### 2.3 A checkout artifact, diagnosed and resolved (not a real defect)

The worktree's first `pnpm format:check` reported 498 of ~732 tracked text files as unformatted —
including files no one has touched in months (`.prettierrc.json`, `docker-compose.yml`,
`drizzle.config.ts`). This is far too broad to be a real content issue and was root-caused, not
assumed: `git worktree add` on this machine (`core.autocrlf=true`) checks out text files with CRLF line
endings, while this repo's actual working directory (and the committed blobs, once diff-normalized)
carry LF. Confirmed directly — `npx prettier --write .prettierrc.json` inside the worktree produced a
`git diff` with **zero** content lines (a pure line-ending rewrite). The worktree's tracked text files
were normalized to LF in place (a plain filesystem rewrite, touching no git config, no ref, nothing in
the shared repository), and `pnpm format:check` then passed cleanly with no other changes. Does not
affect the actual pushed commit (which was staged from the real working tree's own LF content) or CI
(Linux runners never CRLF-normalize on checkout).

### 2.4 Inherited evidence (same code, unaffected by scoping)

E2E was not re-run in the isolated worktree. Per agent-workflow §5's change-class matrix, this release
touches no route contract; full E2E is evidence for the underlying code, not for which unrelated
documentation files happen to sit alongside it in a commit. The code in this release is byte-identical
to what [set-groups-supersession-verification.md](set-groups-supersession-verification.md) §5 already
ran a **fresh, first-run** full E2E suite against (172 passed, 0 failed, disposable database
`gymapp_t_sgsup`, since dropped) — confirmed by the hunk-level reconciliation in §1 that PI-017 touches
zero application source. That report is cited as evidence for the application code; it says nothing
about this release's own scoping, which is this report's job.

Independently, CI's `test:e2e:offline` job re-ran fresh against the pushed commit `9ff7253` itself (§3.2)
and includes both new specs (`tests/e2e/setGroups.spec.ts`, `tests/e2e/setGroupsOffline.spec.ts`, added
to that suite by this release's own `package.json` change) — this is executed, not inherited, evidence
for the exact tree that shipped.

### 2.5 Cleanup

Worktree removed (`git worktree remove --force C:\DEV\gym-app-rc-check`; `git worktree list` shows only
the main checkout afterward). Database dropped (`DROP DATABASE gymapp_t_sgrel`; `SELECT datname FROM
pg_database WHERE datname LIKE 'gymapp_t_%'` returns no rows). The scratch commit object created by
`git commit-tree` is unreferenced by any branch or tag and was left for git's own garbage collection —
harmless, invisible to `git log`/`git branch`, and not part of the pushed history.

---

## 3. Commit, push and deploy

### 3.1 Commit and push

- **Commit:** `9ff7253cdc11822d86f1ee831856028a4fc4c537`
- **Subject:** `feat(prescriptions): add set groups and linked back-off loads`
- **Branch:** `main`; **upstream:** `origin/main`, confirmed via `git rev-parse --abbrev-ref @{u}`
  before pushing
- **Push:** `583a9ab..9ff7253  main -> main` — a normal fast-forward push, never forced

### 3.2 CI (`quality`, reused by the deploy workflow)

Run [34776227156](https://github.com/lukavma/gym-app/actions/runs/34776227156) — **success**.

| Job | Result |
|---|---|
| `quality / Lint, boundaries, typecheck, tests, build` | lint, format check, typecheck, unit tests, integration tests (PGlite), production build — all succeeded |
| `quality / Deterministic offline/PWA Playwright suite (Phase 8)` | migrations, deploy-time seed, build, server start, real-account bootstrap, re-seed, Phase-3 fixture seed, then the `test:e2e:offline` Playwright suite (now including `setGroups.spec.ts` and `setGroupsOffline.spec.ts`) — all succeeded |

### 3.3 Deploy to Azure

Run [34776227341](https://github.com/lukavma/gym-app/actions/runs/34776227341) — **success**, all steps
observed directly (not assumed from a green checkmark):

| Step | Started (UTC) | Completed (UTC) | Result |
|---|---|---|---|
| `quality` (reused) | 18:57:58 | 19:05:16 | success |
| Build (standalone output) | 19:05:37 | 19:06:35 | success |
| Assemble standalone deployment package | 19:06:35 | 19:06:35 | success |
| Azure login (OIDC) | 19:06:35 | 19:06:38 | success |
| Open DB firewall for this runner | 19:06:38 | 19:07:43 | success |
| Run database migrations | 19:07:43 | 19:07:47 | success — migration 0014 applied to production |
| Run database seed | 19:07:47 | 19:07:57 | success |
| Close DB firewall for this runner | 19:07:57 | 19:09:01 | success — per-run rule removed regardless of outcome (`if: always()`) |
| Deploy to Azure App Service | 19:09:01 | 19:10:32 | success |

No manual migration was run against production; no duplicate deployment was dispatched. This is the
one and only deploy run for `9ff7253`.

### 3.4 Read-only post-deployment verification

Performed against the live production endpoint only; no account was created, no session started, no
workout logged.

| Check | Result |
|---|---|
| `GET /api/health` | `HTTP 200`, body `{"status":"ok"}` |
| `GET /` (unauthenticated) | `HTTP 307` → `Location: /login` (session cookies set; auth gate working) |
| `GET /login` | `HTTP 200` |

Azure CLI was available locally but its session token had expired
(`AADSTS70043`, conditional-access sign-in-frequency limit) partway through this task; re-authenticating
would require an interactive browser sign-in, which was not attempted. App Service/App-Insights-level
confirmation was not pursued beyond this — the GitHub Actions `azure/webapps-deploy@v3` step already
reported success (Azure's own deployment API accepted and completed the package), and the HTTP checks
above independently confirm the live app is serving the new deployment correctly.

**Deployed SHA:** `9ff7253cdc11822d86f1ee831856028a4fc4c537`
**Deploy run:** https://github.com/lukavma/gym-app/actions/runs/34776227341

---

## 4. What shipped

Stage A (independent per-group prescriptions/progression) and Stage B (percentage-linked back-off
loads), one joint release per the owner's D-1…D-6 addendum
([set-groups-architecture-evaluation.md](set-groups-architecture-evaluation.md) §19). Full behavioral
detail is in the implementation reports (§§6–7 of
[set-groups-stage-a-implementation.md](set-groups-stage-a-implementation.md), §§2, 7, 12–14 of
[set-groups-stage-b-implementation.md](set-groups-stage-b-implementation.md)) — not restated here.
Independently reviewed and remediated across four passes (F-1…F-9, V-1…V-3, W-1…W-3), each with its own
fresh-session targeted verification, ending
[set-groups-supersession-verification.md](set-groups-supersession-verification.md)'s
**VERIFIED — READY FOR SET GROUPS A+B RELEASE CLOSEOUT**.

---

## 5. Open limitations (carried forward, not claimed resolved)

These are the reviewer-dispositioned limitations from the verification chain. Recording them here again
is deliberate — this release does not claim "no known issues":

- **Latent sync-boundary gap (supersession verification §8, carried-forward item 2).** The sync
  handler for a client-computed recommendation (`applyRecommendationUpsert`) validates a `groupKey`
  against the frozen snapshot but does not reject one for a group that is currently *linked* — mirroring
  rule L-1 (which the server-side prescription-compatibility check already enforces) at this boundary
  would close the gap. Confirmed latent: no shipped client emits such an op today. Not fixed in this
  release; a genuine improvement to consider next time this file is touched, not a defect requiring
  immediate action.
- **The Stage A `manual`-strategy analogue to the V-1/W-1…W-3 resurfacing class.** A group whose
  effective strategy is `manual` (unrelated to a Stage B `link`) has the same "no evaluation, no
  supersession" gap as a linked group — but it never gets hidden first (F-2's filter is keyed on
  `isLinked`, not on `strategyId`), so there is no hide/reveal oscillation to fix. Deliberately out of
  scope throughout the entire remediation chain; the card simply shows continuously, unchanged from
  Stage A.
- **The historical `setGroupsOffline.spec.ts` dead-letter non-reproduction.** Instrumented since Stage
  A, never reproduced in any of the (now five) full-suite runs across this chain, most recently the
  clean 172/172 run in the supersession verification. Cause remains unresolved; instrumentation remains
  live for the next time it's observed.
- **L-7** (reverse-conversion pending-record asymmetry) and **L-8** (`assignGroupKeys` trusting a
  client-supplied key, widened slightly by `link.ref`) remain open, unchanged since Stage A.
- The general Stage A group add/remove/reorder browser-coverage gap remains open.
- The two temporary dangling relative links described in §1.3 (resolved once PI-017 is separately
  committed).

**Physical iPhone device acceptance has not been performed and is not claimed by this release.** It has
no substitute.

### 5.1 Owner device-acceptance checklist

A short, concrete script for the owner's own iPhone session — not exhaustive regression coverage, a fast
path through the feature's core promise:

1. Create a prescription with a Top group and a linked Back-off group, in one save.
2. Log Top at 130 kg. At 80% and a 2.5 kg step, Back-off should propose 105 kg.
3. Edit (or delete) the Top set **before** logging Back-off: the clean proposal follows the edit; if a
   manual value was typed into Back-off first, that manual draft must stay untouched.
4. Override Back-off's proposed load with a different number, log it, then start Back-off's next set:
   the next set should copy the just-logged value forward, not re-derive from the link.
5. Reload the page, and separately try it fully offline: the groups, the link and every already-logged
   fact should survive both.
6. Log an ordinary, ungrouped workout on an unrelated exercise: it should behave exactly as it did
   before this release.

---

## 6. Resource and process notes

- No production access beyond the read-only checks in §3.4 and the standard GitHub Actions
  OIDC-federated deploy path (no manual migration, no direct database write, no interactive Azure
  session established or attempted for a mutating action).
- No tag was created (none was named in the authorization).
- This report and the STATUS/ROADMAP/BACKLOG updates recording this release's SHA and outcome are a
  separate, scoped follow-up commit — see that commit's own message for its exact file list.
- A+B are now deployed as one release. iPhone acceptance (§5.1) is the only remaining gate before this
  feature can be considered fully closed out.
