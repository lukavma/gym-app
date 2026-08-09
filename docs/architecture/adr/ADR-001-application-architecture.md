# ADR-001: Application architecture — layered modular monolith in a single Next.js app

## Status
Accepted (2026-08-09)

## Context
Single-user training app; priorities are domain correctness, testable deterministic logic, fast iteration with coding agents, and near-zero ops. The riskiest architectural failure modes are (a) progression logic leaking into UI/persistence and (b) accidental distributed-systems complexity.

## Decision
One deployable Next.js application containing four layers with enforced one-way dependencies:

```text
src/domain   pure TS (zod only): schemes, progression engine, volume, schedule derivation
src/server   services + Drizzle repositories + auth (imports domain)
src/app/api  thin route handlers (imports server)
src/app|components|lib   UI, stores, outbox, api client (imports domain types + api client only)
```

- Boundaries enforced mechanically: ESLint `import/no-restricted-paths` (or `eslint-plugin-boundaries`) + CI failure on violation.
- `src/domain` is isomorphic by construction — the same engine code runs server-side (normal) and client-side (offline fallback).
- No workspace/monorepo split in MVP; the lint wall provides the isolation a package boundary would, without workspace tooling overhead.

## Alternatives considered
- **pnpm monorepo (`packages/domain` + `apps/web`)** — physically enforces purity; rejected for MVP as extra tooling surface (workspace config, build orchestration) for a guarantee lint+CI already gives. Revisit only if a second app appears.
- **Separate SPA (Vite) + API server (Hono/Express)** — cleaner offline shell story, but two dev servers, CORS/session handling, two deploys; worse agent ergonomics.
- **Microservices / separate progression service** — explicitly rejected; nothing here needs independent scaling or deployment.

## Consequences
- One repo, one dev server, one deploy; agents work within a single conventional Next.js layout.
- Engine unit tests run without browser/DB/network by construction.
- Discipline required: route handlers stay thin; any business logic found in `src/app` or repositories is a review-rejectable defect.
- If the lint wall proves leaky in practice, promotion to a workspace package is a mechanical refactor (import paths only).
