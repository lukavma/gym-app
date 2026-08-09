# ADR-004: Authentication — single-account credentials, argon2id, sealed cookie sessions

## Status
Accepted (2026-08-09)

## Context
Internet-accessible but strictly single-user. Personal data (bodyweight, sleep, training) deserves real protection; anything resembling RBAC, OAuth federation, or user management is waste. The gym UX constraint: essentially never be asked to log in on the phone.

## Decision
- One account, created by a **first-run setup screen** active only while the `users` table is empty; registration is otherwise hard-disabled (no signup route).
- **Email + password**, hashed with **argon2id** (`@node-rs/argon2`, Node runtime route).
- Session = **iron-session** sealed, HTTP-only, `Secure`, `SameSite=Lax` cookie; **30-day rolling expiry** (refreshed on activity). No session table — stateless sealed cookie; "log out everywhere" = rotate the session secret (documented, acceptable for one user).
- **Rate limiting** on `/api/login` via the `auth_throttle` table (per-email and per-IP fixed windows + lockout with exponential backoff) — DB-backed so state survives restarts/redeploys and never depends on process memory.
- All other routes behind an auth middleware; APIs return 401, the client preserves any queued offline ops across re-login (`pwa-offline-strategy.md` §7).

## Alternatives considered
- **Auth.js (NextAuth)** — provider framework solving multi-user/multi-provider problems we don't have; more config surface than our entire auth code.
- **Clerk/Auth0/Supabase Auth** — external SaaS dependency + account for one user; over-engineering and a privacy widening.
- **Passkeys/WebAuthn** — attractive UX and phishing resistance, but adds ceremony (credential mgmt, recovery flows) for v1; noted in `open-decisions.md` as a clean later upgrade.
- **Basic auth / IP allowlist / VPN-only** — breaks PWA installability/UX or ties access to networks; rejected.

## Consequences
- Entire auth surface is ~200 lines + two tables' worth of concepts; no RBAC, no roles, no tenancy.
- Compromise blast radius = one user's data; mitigations: argon2id, throttling, HSTS, secret in env only.
- Multi-user is a future project (invite system, per-user scoping already present via `user_id` columns), not a latent switch.
