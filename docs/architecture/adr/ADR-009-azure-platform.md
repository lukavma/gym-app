# ADR-009: Platform — Azure App Service, Azure Database for PostgreSQL, GitHub Actions OIDC

## Status
Accepted (2026-08-09). Supersedes the Vercel + Neon hosting selections previously recorded in `architecture-plan.md` §3/§8 and ADR-003 (ADR-003 amended same date for the database portion). **Amended 2026-08-10:** region changed from Germany West Central to West Europe, and Node version changed from 22 LTS to 24 LTS (see Amendments below); no other part of the decision changed.

## Context
A platform mandate requires the application to run entirely on Azure-managed services. This replaces hosting/persistence vendors only — Next.js/React/TypeScript, Drizzle, PostgreSQL, the PWA/offline architecture, auth model, and the modular monolith are unaffected. The selection criteria stay what they were: smallest, lowest-operations setup for a single-user app, no enterprise machinery.

## Decision

**Compute: Azure App Service (Linux), Basic B1, Node 24 LTS**, region West Europe, running the Next.js **standalone output** (`node server.js` startup command), Always On enabled, HTTPS-only (platform-managed TLS on `*.azurewebsites.net`; custom domain optional later).

**Database: Azure Database for PostgreSQL Flexible Server**, PostgreSQL 16, Burstable B1ms (1 vCPU / 2 GiB), 32 GiB storage, same region. Automated backups with 7-day point-in-time restore (built in). Public access with firewall rules (developer IP + "allow Azure services" for CI migrations), TLS required. No HA, no read replicas, no VNet integration. Access from the app via the plain `pg` (node-postgres) driver + Drizzle — the app is now a long-lived server, so no serverless driver or external pooler is needed (a small in-process `pg.Pool` suffices).

**Secrets/config: App Service App Settings** (encrypted at rest, injected as env vars) hold `DATABASE_URL`, `SESSION_SECRET`, and the Application Insights connection string. **Key Vault is deliberately not used in MVP** — two secrets and one operator don't justify the identity + reference indirection; the upgrade path (Key Vault references + managed identity, no code change) is noted for when secret count or rotation requirements grow.

**Telemetry: Application Insights** (workspace-based) via the Node SDK connection string, default sampling, 30-day retention — server-side failure visibility for the sync endpoint is worth this one add-on. App Service log stream covers ad-hoc debugging. No dashboards, no alerts in MVP beyond the default smart detection.

**CI/CD: GitHub Actions** (unchanged quality gates) with a deploy job on `main`: build standalone → run `drizzle-kit migrate` against production (GitHub environment secret; reaches the DB via the Azure-services firewall allowance, with a dynamic runner-IP firewall rule as documented fallback) → `azure/webapps-deploy`. Azure login uses **OIDC federated credentials** (no long-lived cloud secrets in GitHub); the publish-profile secret is the acceptable fallback if OIDC setup is unavailable.

## Alternatives considered
- **Azure Container Apps** — scale-to-zero pricing is attractive, but it demands a Dockerfile, a registry, a Container Apps environment, and a mandatory Log Analytics workspace — strictly more moving parts — and cold starts would delay gym-floor sync flushes for zero benefit at one user. Becomes interesting only if the app ever needs containers for another reason.
- **Azure Static Web Apps** — its hybrid Next.js support (SSR/route handlers) remains too limited/preview-grade for an app whose API surface is the product; wrong tool despite the attractive free tier.
- **Azure Functions (split API)** — reintroduces the SPA+API split rejected in ADR-001/002 and adds cold starts to the sync path.
- **AKS / VMs / Front Door / API Management / Service Bus** — enterprise machinery with no requirement behind it; explicitly refused by the same "no speculative complexity" rule as always (brief §34).
- **Key Vault from day one** — evaluated per the mandate; rejected for MVP as pure indirection at this secret count (upgrade path documented above).
- **Vercel + Neon (previous selection)** — remains the better pure-economics fit (≈ €0/month, preview deploys, DB branching) but is excluded by the platform mandate; recorded here so the reasoning isn't lost.

## Consequences
- **Fixed monthly cost replaces free tiers:** ≈ €25–30/month (B1 App Service + B1ms Flexible Server + pennies of App Insights). Accepted as the price of the mandate.
- **Simplifications:** long-lived Node process → plain `pg` pool, no serverless connection ceremony, no cold starts; DB-backed auth throttling stays for durability across restarts (its "works on serverless" rationale is retired).
- **Losses:** no PR preview deployments; no database branching — dev/e2e now use local Docker Postgres 16 (`docker compose up db`), keeping Azure to exactly one server.
- Azure resources (resource group, server, App Service, OIDC federated credential) are **human-provisioned prerequisites**; the repo carries their configuration as documentation + workflow YAML, not IaC — Bicep/Terraform would be over-engineering for four resources (revisit only if environments multiply).
- Exit path unchanged in kind: plain Postgres (`pg_dump` restores anywhere) + a standard Node server (runs on any host).

## Amendments (2026-08-10)

### Node version changed to 24 LTS
Node 22 was picked as "the current LTS" when this ADR was written, with no dependency- or platform-specific reason recorded. By provisioning time, Node 22 had entered Maintenance LTS (security fixes only, EOL April 2027) while Node 24 is Active LTS (EOL April 2028) and is fully supported by Azure App Service Linux (`NODE:24-lts`). With no code yet depending on 22-specific behavior (Phase 0 just landed), switching now avoids a forced runtime migration later. `package.json` engines, CI workflows, and this document's App Service runtime all use Node 24.

### Region changed to West Europe
During provisioning, `az postgres flexible-server list-skus --location germanywestcentral` returned `"reason": "Provisioning is restricted in this region"` for this subscription — Postgres Flexible Server cannot currently be created there at all (not a SKU/quota issue, a regional restriction; lifting it would require an Azure support request). Both App Service and the Postgres server were provisioned in **West Europe** instead, keeping app and database co-located and staying within the EU. Resource naming (`-weu` suffix) and all region references throughout the docs reflect this. No other part of ADR-009 changes; revisit the region choice only if Germany-specific data residency later becomes an actual requirement, not just a preference.
