# ADR-003: Persistence — PostgreSQL 16 on Azure Database for PostgreSQL, Drizzle ORM, PGlite for tests

## Status
Accepted (2026-08-09). Revised same date: database hosting moved from Neon to Azure Database for PostgreSQL Flexible Server under the Azure platform mandate (ADR-009). The ORM, testing, and backup-philosophy decisions are unchanged from the original acceptance.

## Context
Durable personal data (years of training history) with strict integrity needs (partial unique indexes, FK policies, check constraints, JSONB snapshots). Constraints: lowest available ops, modest cost, real backups without building them — and, per the platform mandate, Azure-managed services.

## Decision
- **PostgreSQL 16** on **Azure Database for PostgreSQL Flexible Server** (Burstable B1ms, 32 GiB, Germany West Central — SKU/region detail in ADR-009), accessed via the plain **`pg` (node-postgres) driver** with a small in-process pool — the App Service host is a long-lived Node server, so no serverless driver or external pooler is needed.
- **Drizzle ORM** + drizzle-kit migrations (generated SQL committed to the repo).
- **PGlite** (WASM Postgres) for integration tests — real Postgres semantics (partial indexes, deferrable constraints, JSONB) in-process, no Docker.
- **Local Docker Postgres 16** for dev and e2e databases (replaces Neon's branch databases; keeps Azure to exactly one server).
- Backups: Flexible Server automated backups with 7-day point-in-time restore + weekly `pg_dump` GitHub Action artifact + user-facing JSON export endpoint.

## Alternatives considered
- **Neon (original selection)** — serverless Postgres with branching and a free tier; superseded solely by the Azure platform mandate, not on merit. Its two distinguishing features (scale-to-zero pricing, branch databases) are replaced by a fixed-cost small SKU and local Docker databases respectively.
- **SQLite on a VPS** — beautiful simplicity, but shifts TLS/patching/backup ops onto the user; the "cheap" option that costs weekends.
- **Turso/libSQL** — younger platform and dialect subset; fails "boring" (and fails the Azure mandate).
- **Supabase** — fine Postgres, but bundles auth/storage/realtime we don't want (and fails the Azure mandate).
- **Azure Cosmos DB (any API)** — the design leans hard on relational Postgres features (partial/deferrable constraints, FK policies, transactional reorders); a document store is the wrong shape regardless of vendor.
- **Prisma** — heavier abstraction and generate-step; Drizzle's SQL-first model matches a design that leans on Postgres features explicitly.
- **Storing everything client-side (IndexedDB only)** — no durability story across devices/loss of phone; rejected outright for years-long personal data.

## Consequences
- Fixed small monthly cost (≈ €13/month DB portion; see ADR-009 for the platform total) instead of a free tier; no cold starts — the server is provisioned.
- PITR from day one via automated backups; restore drill documented in Phase 10.
- Vendor exit is plain Postgres: `pg_dump` restores anywhere (documented in `open-decisions.md` as the self-host escape hatch). No Azure-specific SQL is permitted in the schema.
- Firewall posture: public access + developer-IP and Azure-services rules, TLS required; no VNet/private endpoints for a single-user MVP (ADR-009).
- Drizzle schema is the single schema source; JSONB shapes live in `src/domain` Zod schemas — two sources by design (relational vs document), reconciled by repository-layer validation.
