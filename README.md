# gym-app

A personal, single-user, mobile-first workout-tracking PWA. See
[`docs/architecture/`](docs/architecture/) for the accepted architecture,
data model, and ADRs — this README only covers running and deploying what's
built so far.

**Phase status:** Phase 0 (project foundation / walking skeleton) — see
[`docs/architecture/implementation-plan.md`](docs/architecture/implementation-plan.md).
Auth and an empty authenticated "Today" shell exist; no exercises, programs,
or workout logging yet.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
Drizzle ORM · PostgreSQL 16 · iron-session · Argon2id · Serwist (PWA) ·
Azure App Service + Azure Database for PostgreSQL Flexible Server ·
GitHub Actions.

## Prerequisites

- Node 24.x
- pnpm (see `packageManager` in `package.json`)
- Docker (for local Postgres via `docker-compose.yml`)

## Local development

```bash
pnpm install

cp .env.example .env.local
# edit .env.local: DATABASE_URL and SESSION_SECRET at minimum.
# leave APPLICATIONINSIGHTS_CONNECTION_STRING unset — telemetry is inert
# without it (ADR-009).

docker compose up -d db
pnpm db:migrate

pnpm dev
# http://localhost:3000 — redirects to /setup on first run (empty DB),
# /login afterward.
```

## Commands

| Command                             | What it does                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`                          | Start the dev server                                                                 |
| `pnpm build`                        | Production build (standalone output)                                                 |
| `pnpm start:standalone`             | Run the built standalone server (`.next/standalone/server.js`)                       |
| `pnpm lint`                         | ESLint, including the architecture import-boundary rules                             |
| `pnpm format:check` / `pnpm format` | Prettier check / write                                                               |
| `pnpm typecheck`                    | `tsc --noEmit` for the app                                                           |
| `pnpm typecheck:sw`                 | `tsc --noEmit` for the service worker (separate `webworker` lib — see below)         |
| `pnpm test:unit`                    | Vitest unit tests                                                                    |
| `pnpm test:integration`             | Vitest integration tests against PGlite (in-memory WASM Postgres — no Docker needed) |
| `pnpm test`                         | Unit + integration                                                                   |
| `pnpm test:e2e`                     | Playwright smoke test — **local only, never runs in CI** (needs a real Postgres)     |
| `pnpm db:generate`                  | Generate a Drizzle migration from schema changes                                     |
| `pnpm db:migrate`                   | Apply pending migrations                                                             |

Playwright needs a running local Postgres with migrations applied
(`docker compose up -d db && pnpm db:migrate`); it starts its own dev
server automatically (see `playwright.config.ts`).

## Architecture boundary

`src/domain → src/db → src/server → src/app/api → app/ui`, one-way only,
enforced by `eslint-plugin-boundaries` (`eslint.config.mjs`). Violations
fail `pnpm lint` and therefore CI.

## Auth

Single account only (ADR-004): first-run setup while `users` is empty,
email + Argon2id password, no registration path afterward, no
password-reset/email/passkeys/multi-user. Sessions are iron-session
cookies with a rolling TTL, refreshed on every authenticated request by
`src/middleware.ts`. Login is throttled per email and per IP (DB-backed,
survives restarts).

## PWA

Manifest + icons + a Serwist service worker (`injectManifest` mode)
precache the app shell and the `/today` route. The service worker never
calls `skipWaiting()` on its own — updates apply only when the user
confirms (no silently yanking the UI out from under an in-progress
workout in later phases).

## Testing strategy

- **Unit** (`tests/unit/`): pure logic (throttle math, Argon2 hashing) and
  the Edge-runtime middleware (tested directly with real `NextRequest`
  objects — no server needed).
- **Integration** (`tests/integration/`): the auth service against a real
  (PGlite, in-memory) Postgres — schema, `citext` email uniqueness, and the
  advisory-lock-guarded first-run setup race are all exercised for real.
- **E2E smoke** (`tests/e2e/`): one Playwright spec driving a browser
  through setup-or-login to the authenticated Today shell. Local only.

## Deployment

Azure App Service (Linux, Node 24, Basic B1) + Azure Database for
PostgreSQL Flexible Server (Postgres 16), both in West Europe —
see [ADR-009](docs/architecture/adr/ADR-009-azure-platform.md) for why.

- One-time Azure resource + GitHub OIDC setup:
  [`docs/deployment/azure-provisioning.md`](docs/deployment/azure-provisioning.md)
- CI quality gates: `.github/workflows/ci.yml` (lint, boundaries, typecheck,
  unit + integration tests, production build — no Playwright)
- Deploy on push to `main`: `.github/workflows/deploy.yml` (quality gates →
  build → migrate → OIDC login → deploy to App Service)

No long-lived Azure credentials are stored in GitHub; deploys authenticate
via short-lived OIDC federation.
