# ADR-002: Frontend/backend framework — Next.js 15+ (App Router) with React 19 + TypeScript

## Status
Accepted (2026-08-09)

## Context
Need: mobile-web PWA, colocated API, strong TS, mature ecosystem, maximal coding-agent familiarity, cheap hosting. The app is interaction-heavy (logging UI) — server rendering is a minor concern; the API layer, auth, and build/deploy story matter more.

## Decision
Next.js 15+ App Router, React 19, TypeScript strict, Tailwind CSS v4.

- App pages are predominantly **client components** (the app is a logging tool, not a content site); server components used only where trivially beneficial (login, settings shells).
- API = **REST-ish route handlers** under `app/api/*` with Zod-validated JSON bodies and a thin shared typed client. Server Actions are not used for data mutations: the offline outbox needs explicit, serializable, idempotently-replayable HTTP payloads, which plain handlers express directly.
- Serwist for the service worker (ADR-005).

## Alternatives considered
- **SvelteKit / SolidStart** — smaller runtime, but weaker agent familiarity and ecosystem depth; team-of-one + agents favors the most-documented path.
- **Remix / React Router v7** — fine framework; no advantage here that outweighs Next's deployment integration and agent corpus.
- **Vite SPA + separate API** — rejected in ADR-001 (two moving parts).
- **tRPC instead of REST handlers** — end-to-end types are nice, but RPC obscures the replayable-mutation contract the outbox depends on; Zod schemas shared from `src/domain` recover 90% of the type safety with plain fetch.
- **Native/Expo app** — out of scope; PWA is an explicit product requirement.

## Consequences
- Single conventional stack agents know well; huge documentation surface.
- Must consciously avoid Next.js feature sprawl (RSC data fetching everywhere, server actions, edge runtime) — conventions pinned in `implementation-plan.md` Phase 0.
- Auth/argon2 route handlers pinned to the Node runtime (not edge).
- React 19/Next 15 minor-version churn accepted; pinned versions + lockfile.
