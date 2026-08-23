# gym-app

A personal, single-user, mobile-first workout-tracking PWA. See
[`docs/architecture/`](docs/architecture/) for the accepted architecture,
data model, and ADRs — this README only covers running and deploying what's
built so far.

**Phase status:** Phases 0–5 (through block lifecycle: deloads, overrides,
transitions) deployed and accepted, plus a bounded Phase 5.5 Light pass
(exercise catalog expansion, decimal `loadStepKg` input polish) — see
[`docs/architecture/implementation-plan.md`](docs/architecture/implementation-plan.md)
and [`docs/reviews/`](docs/reviews/) for phase-by-phase detail. Auth,
exercise library, programs/templates/prescriptions, Today + offline-safe
workout execution, the progression engine, and block lifecycle (deloads,
week overrides, transitions) all exist and are in use. Volume tracking
(Phase 6) is not yet built.

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

| Command                             | What it does                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Start the dev server                                                                   |
| `pnpm build`                        | Production build (standalone output)                                                   |
| `pnpm start:standalone`             | Run the built standalone server (`.next/standalone/server.js`)                         |
| `pnpm lint`                         | ESLint, including the architecture import-boundary rules                               |
| `pnpm format:check` / `pnpm format` | Prettier check / write                                                                 |
| `pnpm typecheck`                    | `tsc --noEmit` for the app                                                             |
| `pnpm typecheck:sw`                 | `tsc --noEmit` for the service worker (separate `webworker` lib — see below)           |
| `pnpm test:unit`                    | Vitest unit tests                                                                      |
| `pnpm test:integration`             | Vitest integration tests against PGlite (in-memory WASM Postgres — no Docker needed)   |
| `pnpm test`                         | Unit + integration                                                                     |
| `pnpm test:e2e`                     | Playwright Chromium E2E suite — **local only, not part of CI** (needs a real Postgres) |
| `pnpm db:generate`                  | Generate a Drizzle migration from schema changes                                       |
| `pnpm db:migrate`                   | Apply pending migrations                                                               |

### Running the E2E suite

`@playwright/test` is a project dependency (`devDependencies`), so `pnpm
install` already provides the runner. The **browser binary** is not
installed by `pnpm install` — do this once per machine:

```bash
pnpm exec playwright install chromium
```

The suite needs the **local Docker Postgres with migrations applied**, and a
seeded account for the specs that log in:

```powershell
docker compose up -d db
pnpm db:migrate
$env:DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp"; pnpm tsx tests/e2e/seed.ts
pnpm test:e2e
```

`pnpm test:e2e` **builds and starts the production server** — its
`webServer` command is `pnpm build && pnpm start`, not `pnpm dev` (see
`playwright.config.ts`). This is deliberate: `next.config.ts` disables the
service worker when `NODE_ENV === "development"`, and the offline specs
depend on a real SW-served offline reload, which `pnpm dev` can never
satisfy. `reuseExistingServer: true` means an already-running `pnpm build &&
pnpm start` is reused, so you can iterate without rebuilding each time.

Notes on what this suite does and does not cover:

- The project currently runs **Chromium only**, locally, at desktop viewport
  unless a spec overrides it. `workers: 1` (serial) — several specs reshape
  shared seed data and restore it in `finally`.
- **Chromium E2E does not replace manual iPhone/Safari acceptance.** Real
  iOS Safari differs on PWA install, service-worker lifecycle, IndexedDB
  eviction, viewport/keyboard behaviour and touch targets — every phase's
  device-acceptance pass is still done by hand on the actual phone. The
  Phase 5 active-schedule defect was found that way, not by this suite.
- **No production database is ever used.** The suite points at the local
  Docker Postgres via `DATABASE_URL`; specs create, mutate and restore their
  own fixtures there.
- **Playwright is currently not part of CI** — `.github/workflows/ci.yml`
  runs lint, boundaries, typecheck, unit + integration tests and the
  production build. CI has no Postgres service and no browser binaries.

### Deferrable unique constraints need a manual migration patch

Some tables use a `UNIQUE (..., position)`-style constraint that must be
`DEFERRABLE INITIALLY DEFERRED` so a same-transaction reorder (swapping two
rows' `position`/`set_number` values) doesn't trip a uniqueness violation
mid-transaction. **`drizzle-kit` cannot express this**: the `unique()`
builder in `drizzle-orm`'s pg-core has no `.deferrable()` API, and the
migration-diffing snapshot (`drizzle/meta/*.json`) has no `deferrable`
field on its unique-constraint entries. Running `pnpm db:generate` for a
table like this produces a plain (non-deferrable) `UNIQUE` constraint in
the generated SQL.

**Workflow:** after `pnpm db:generate` touches one of these tables (new
table, new constraint, or a column rename that regenerates the
`CONSTRAINT` line), open the generated migration file and hand-append
`DEFERRABLE INITIALLY DEFERRED` to the constraint, matching the style
already in `drizzle/0003_chief_miracleman.sql`. This is safe against
future `db:generate` runs because drizzle-kit diffs its own TS-schema
snapshot, not live SQL — the plain `unique()` call in the schema file
stays the accurate source of truth for the snapshot even though it can't
spell "deferrable" itself. Don't try to "fix" this by redesigning the
migration approach (e.g. hand-written SQL migrations, a custom
drizzle-kit plugin); the annotate-after-generate workflow is the accepted
tradeoff — see the comment above each affected table's `pgTable()` call
(`src/db/schema/exercisePrescriptions.ts`,
`src/db/schema/blockScheduleEntries.ts`) for the fully-worked rationale.

Constraints that need this, so far:

| Constraint                     | Table                    | Columns                             | Phase                    |
| ------------------------------ | ------------------------ | ----------------------------------- | ------------------------ |
| `uq_prescriptions_position`    | `exercise_prescriptions` | `(template_id, position)`           | 2                        |
| `uq_schedule_position`         | `block_schedule_entries` | `(block_id, position)`              | 2                        |
| `uq_session_exercise_position` | `session_exercises`      | `(session_id, position)`            | 3, `data-model.md` §2.13 |
| `uq_set_number`                | `set_logs`               | `(session_exercise_id, set_number)` | 3, `data-model.md` §2.14 |

Both are delivered: the hand-patch is already applied in
`drizzle/0004_zippy_wolfsbane.sql`, and live `pg_constraint` inspection
confirms `condeferrable=t, condeferred=t` on both. The next table that
needs this treatment should follow the same workflow — generate the
migration as normal, then apply this same hand-patch before committing —
do not skip review of that migration file just because `db:generate`
"succeeded".

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
- **E2E** (`tests/e2e/`): Playwright specs driving a real Chromium browser
  against the production build and the local Docker Postgres — setup-or-login,
  Today resume/takeover, offline logging and cold-launch, deloads,
  progression, set deletion, and active-block schedule editing. Local only,
  serial, and **not** a substitute for manual iPhone/Safari acceptance. See
  [Running the E2E suite](#running-the-e2e-suite) for the one-time
  `pnpm exec playwright install chromium` step and the prerequisites.

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
