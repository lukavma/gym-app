# Handoff — 2026-08-10 session

For whoever picks this up next (human or agent). Phase 0 is done, deployed,
and verified end-to-end in production. This doc is the fast-context path so
you don't have to re-derive any of it.

## TL;DR

- **Production is live and working.** `https://app-gymapp-prod-weu-martis01.azurewebsites.net`
- The single user account has already been created via `/setup` (confirmed
  by the human user). **Do not call `POST /api/auth/setup` or otherwise try
  to create/reset the account** — ADR-004 makes this a single-account app,
  and account creation is a one-time, human-owned action.
- Phase 0 (walking skeleton) is complete per `docs/architecture/implementation-plan.md`.
  **Next up is Phase 1 — Exercise library** (same doc, "Phase 1" section).
- Three real deploy bugs were found and fixed this session (details below).
  All three are now permanently fixed in committed config, not workarounds —
  nothing further to do about them unless something regresses.
- `pnpm build` now also works locally on Windows (previously failed with an
  EPERM on symlink creation) — a side effect of one of the fixes.

## Verifying production right now

```bash
curl -s https://app-gymapp-prod-weu-martis01.azurewebsites.net/api/health
# -> {"status":"ok"}

curl -s -o /dev/null -w '%{http_code}\n' https://app-gymapp-prod-weu-martis01.azurewebsites.net/login
# -> 200
```

Application Insights (`appi-gymapp-prod-weu`, in resource group
`rg-gymapp-prod-weu`) is receiving live telemetry — check Live Metrics or
the standard `requests`/`exceptions` tables if you need to investigate
something.

## Key resource identifiers

| Resource | Name |
|---|---|
| Resource group | `rg-gymapp-prod-weu` |
| App Service plan | `asp-gymapp-prod-weu` |
| App Service (web app) | `app-gymapp-prod-weu-martis01` |
| Postgres Flexible Server | `psql-gymapp-prod-weu-martis01` (db: `gymapp`) |
| Log Analytics workspace | `log-gymapp-prod-weu` |
| Application Insights | `appi-gymapp-prod-weu` |
| GitHub OIDC Entra app | `gha-gymapp-prod` |
| Repo | `lukavma/gym-app` on GitHub |

Full provisioning narrative (including the `az` commands that built all of
this): `docs/deployment/azure-provisioning.md`.

## This session's work: three layered deploy bugs

Production was crash-looping (`503`, `ContainerStartupFailure`) after the
Phase 0 code was otherwise complete. Root cause was **pnpm's default
symlinked `node_modules` layout**, which broke in three distinct,
sequentially-discovered ways. All three fixes are committed; read this if
similar symlink/module-resolution weirdness ever resurfaces.

1. **Symlinks flattened by zip deploy.**
   `azure/webapps-deploy@v3` zips the deploy package for Kudu zip-deploy.
   Zipping doesn't preserve real symlinks — pnpm's `node_modules/<pkg>` is
   normally a symlink into `node_modules/.pnpm/<pkg>@ver/node_modules/<pkg>`,
   and after zipping, each symlink became a plain text file containing the
   link-target string instead of a working module. Runtime error:
   `SyntaxError: Unexpected token '.'` at `server.js:22` (Node trying to
   parse that text file as JS).
   **Fix:** `.github/workflows/deploy.yml` now does `cp -rL` to dereference
   symlinks into real file copies before zipping (commit `cb0d0d9`).

2. **`styled-jsx` missing from the trace (red herring fix first).**
   Fixing #1 revealed a second error underneath:
   `Error: Cannot find module 'styled-jsx/package.json'`. This is a
   commonly-cited Next.js+pnpm issue, normally fixed by adding `styled-jsx`
   as a direct `package.json` dependency — I did that (commit `a2cc771`),
   confirmed via CI logs it installed correctly, but **the exact same error
   persisted** in the next deploy. This ruled out "just add the dep" as the
   real fix and pointed at something structural in how Next's standalone
   file tracer walks pnpm's symlinked store.

3. **Root cause: pnpm's symlinked `node_modules` itself.**
   Both #1 and #2 were symptoms of the same underlying thing. Fix: switch
   pnpm to a flat, non-symlinked layout via `nodeLinker: hoisted` in
   `pnpm-workspace.yaml` (commit `600a080`). Note this setting **must** live
   in `pnpm-workspace.yaml`, not `.npmrc` — pnpm 10+ moved workspace-level
   config there, and `.npmrc`'s `node-linker` key is silently ignored (I
   tried this first, wasted some time, `pnpm config get node-linker`
   returning `undefined` was the tell). This fix resolved production for
   good and, as a bonus, fixed a previously-shrugged-off local Windows
   `pnpm build` EPERM failure (the file tracer no longer needs to create
   symlinks on a symlink-free source tree).

If you ever touch `pnpm-workspace.yaml`'s `nodeLinker` or the deploy
packaging step in `deploy.yml`, know why they're there before "simplifying"
them — both are load-bearing for production, not incidental.

## Other gotchas surfaced this session (not blocking, just FYI)

- **Kudu SCM basic-auth publishing looks disabled** on this App Service —
  a Kudu VFS request with credentials from
  `az webapp deployment list-publishing-credentials` returned `401`. Not
  investigated further since GitHub Actions job logs were sufficient for
  debugging. If you need direct Kudu/VFS access later, expect to have to
  either re-enable basic-auth publishing in App Service config or use an
  AAD-token-based Kudu call instead.
- **`deploy.yml`'s reusable `quality:` job also triggers `ci.yml`'s own
  independent `on: push`** as a second, separate top-level workflow run.
  If you're polling the GitHub Actions API for "the latest run on main,"
  filter by workflow file (`/actions/workflows/deploy.yml/runs`) or by
  `head_sha`, not just "most recent run" — it can grab the wrong workflow.

## What's next: Phase 1 — Exercise library

Per `docs/architecture/implementation-plan.md` (§"Phase 1"):

- Tables: `muscle_groups` (seed all 15 slugs per `domain-model.md` §2),
  `exercises`, `exercise_muscle_contributions`.
- Seed catalog: ~40 common movements, primary 1.0 / secondary 0.5
  contribution defaults (`domain-model.md` §3), sensible `loadStepKg`
  (default 2.5, dumbbell 2.0, machine 5.0).
- CRUD UI: list, create/edit with a contribution editor, archive/unarchive,
  optional `baselineLoadKg`.
- REST routes: `/api/exercises[...]`.
- Tests: archive hides from default listing but historical records still
  render; hard delete with history returns 409 (FK RESTRICT, seeded
  fixture); contribution weight validation (`0 < w ≤ 1`).
- Acceptance: `mvp-scope.md` F2; seeds rerun idempotently.
- **Not yet in this phase:** merge tool (OD-11), per-exercise efficacy copy.

Before starting, skim `implementation-plan.md` §0 (ground rules) again —
particularly the import-boundary rule (`domain` → `db` → `server` →
`app/api`, one-way, ESLint-enforced) and the "spec document wins over this
plan" rule.

## Local dev quick-start (confirmed working)

```bash
pnpm install
cp .env.example .env.local   # set DATABASE_URL + SESSION_SECRET
docker compose up -d db
pnpm db:migrate
pnpm dev                      # http://localhost:3000
```

`pnpm build` (standalone) now also succeeds locally on Windows — useful for
reproducing deploy issues without waiting on CI. Full command reference is
in `README.md`.

## Doc map (read these, in roughly this order, if you're new here)

1. `README.md` — stack, commands, architecture boundary, auth, deployment overview.
2. `docs/architecture/mvp-scope.md` — what's in/out of the MVP, feature acceptance criteria (F1–F11).
3. `docs/architecture/implementation-plan.md` — the phase-by-phase execution roadmap (this is the one to follow for "what do I build next").
4. `docs/architecture/adr/` — locked architectural decisions (ADR-001…009); binding, don't relitigate without cause.
5. `docs/deployment/azure-provisioning.md` — full one-time Azure/GitHub OIDC provisioning narrative, plus a verification checklist (§16) and expected resource layout (§17).

Everything else under `docs/` (domain-model, prescription-model,
progression-engine, volume-model, pwa-offline-strategy, open-decisions,
evidence-to-design) is binding spec material referenced per-phase by
`implementation-plan.md` §0 — read the relevant one when the phase you're
building calls for it, not all at once up front.
