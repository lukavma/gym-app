# Implementation Plan

Status: Accepted (2026-08-09)
Role: the execution roadmap for the coding agent. Eleven phases, each a vertical slice that ends deployed and usable. Phases 0–8 constitute the MVP (`mvp-scope.md` §1); Phases 9–10 are post-MVP. Every phase lists its binding specs — when this plan and a spec document disagree, **the spec document wins**; when implementation reality contradicts both, stop and flag it rather than silently diverging.

---

## 0. Ground rules for the coding agent

1. **Binding documents** per area: `data-model.md` (schema — column-level authority), `domain-model.md` (entities, invariants), `prescription-model.md` + `progression-engine.md` (engine behavior, test matrix), `volume-model.md` (aggregation), `pwa-offline-strategy.md` (sync mechanics, §12 test list), ADR-001…008 (locked decisions), `mvp-scope.md` (cut line), `evidence-to-design.md` (labeling/copy rules), `open-decisions.md` (defaults when ambiguity is real).
2. **Scope discipline:** build only the current phase. Each phase's "Not yet" list is binding — reserved shapes (per-set schemes, recovery consumption, percent1RM) exist in docs to prove extensibility, not as an invitation.
3. **The ten invariants** in `domain-model.md` §10 hold from the moment their entities exist. Three deserve constant paranoia: sessions are interpretable from their snapshots alone; recommendations never mutate plans; execution facts are never lost or silently rewritten.
4. **One write path for execution facts:** session/set/decision writes always go through the outbox sync module — from Phase 3 day one, even when online (online just means immediate flush). Definition CRUD (exercises, programs, templates, blocks, presets) is plain online REST. Never add a second write path for facts.
5. **Deviation protocol:** if a spec turns out unimplementable or contradictory, halt that task, record the conflict in `open-decisions.md` (or a `docs/architecture/deviations.md` if it's a contradiction, not a choice), and surface it to the user. Do not improvise schema or engine behavior.

## 1. Cross-phase conventions

### 1.1 Repository layout

```
src/
  domain/          # Pure TS + Zod only. No React, no DB, no fetch, no Date.now() (clock passed in).
    schemes/       #   SetScheme union, versioned envelopes, upgrade fns
    progression/   #   strategy registry, strategies, reason codes, confidence
    volume/        #   aggregation, contribution math
    scheduling/    #   week derivation, effective prescription assembly
    schemas/       #   shared Zod schemas (DTOs, snapshots, configs)
  db/              # Drizzle schema (one file per table group), migrations/, seed/
  server/          # Services: auth, definitions CRUD, bundle assembly, sync apply, evaluation orchestration
  app/             # Next.js App Router
    (auth)/login, setup
    (app)/today, workout/[sessionId], program, block, history, volume, settings
    api/           #   route handlers — thin: parse (Zod) → service → serialize
  sync/            # Client-side: IndexedDB stores (idb), outbox, flush loop, takeover, dead-letter
  ui/              # Shared components (mobile-first primitives)
tests/
  unit/            # Vitest, domain only, no IO
  integration/     # Vitest + PGlite: services + route handlers against real SQL
  e2e/             # Playwright (incl. offline scenarios)
```

**Import boundaries** (ESLint `boundaries` plugin, CI-enforced): `domain` imports nothing outside itself; `db` imports `domain`; `server` imports `domain`+`db`; `app/api` imports `server`; client code imports `domain`, `sync`, `ui` — never `db`/`server`. The engine must run in both worlds (server evaluation, client offline fallback) — that is why `domain` stays isomorphic.

### 1.2 Stack pins

pnpm; Node 24; TypeScript strict (`noUncheckedIndexedAccess` on); Next.js 15+ App Router; React 19; Tailwind v4; TanStack Query (server state) + Zustand (active-workout UI state); `idb`; Serwist; Drizzle ORM + `drizzle-kit` with the `pg` (node-postgres) driver; Azure Database for PostgreSQL Flexible Server (PostgreSQL 16) in production, local Docker Postgres 16 for dev/e2e; `@electric-sql/pglite` for integration tests; Vitest; Playwright; `iron-session`; `@node-rs/argon2` (Node runtime routes only); `uuidv7` for client-generated IDs.

### 1.3 Environment

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string. Prod: Flexible Server with `sslmode=require` (set in App Service App Settings). Dev/e2e: local Docker Postgres 16 (`docker compose up db`) |
| `SESSION_SECRET` | ≥32 random bytes; rotation = global logout (ADR-004) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Prod only (App Settings); telemetry disabled when unset, so local dev needs nothing (ADR-009) |

Integration tests need no env (PGlite in-memory, migrations applied programmatically). Playwright uses a disposable local Docker database.

### 1.4 Migrations & seeds

- Schema changes only via `drizzle-kit generate` → committed SQL in `src/db/migrations/` → applied by `drizzle-kit migrate` as a CI release step against production (before each App Service deployment; reaches the DB via the Azure-services firewall allowance, dynamic runner-IP rule as fallback — ADR-009) and on dev start. Never edit an applied migration.
- Seeds are idempotent upserts keyed by slug (`muscle_groups`, exercise catalog, RP volume preset) in `src/db/seed/`, safe to rerun on every deploy.

### 1.5 Testing policy (non-negotiable suites in bold)

- Unit: domain functions with plain fixtures — **progression matrix (progression-engine §9, all 14 cases)**, **week/deload derivation**, scheme validation + envelope upgrades, volume aggregation fixture, carry-forward chain.
- Integration (PGlite): route handlers + services — **sync apply idempotence (same batch twice → identical DB)**, **snapshot immutability (edit template after logging → session content unchanged)**, partial unique indexes (second in-progress session / second active block / second pending rec rejected), auth throttle, RESTRICT-vs-archive on exercises.
- E2E (Playwright): **airplane-mode full workout → reconnect → exactly-once persistence**, resume after relaunch, takeover flow, implicit-accept via first set, first-run setup lockout.

### 1.6 Definition of done (every phase)

Typecheck + lint + all tests green in CI; deployed to production; new surface smoke-tested on the actual iPhone (installed PWA, not desktop Safari); any doc drift fixed in the same PR; phase's "Not yet" list still true.

---

## 2. Phases

### Phase 0 — Walking skeleton (size M)

**Goal:** deployed-to-Azure, installable, authenticated, empty app with the full toolchain and guardrails in place.

**Human-provisioned prerequisites (one-time; agent documents the `az` CLI commands but never fabricates completion):** Azure resource group; Azure Database for PostgreSQL Flexible Server (PostgreSQL 16, Burstable B1ms, 32 GiB, West Europe; public access with developer-IP + Azure-services firewall rules; TLS required); App Service plan (Linux B1) + App Service (Node 24, Always On, HTTPS-only, startup command for standalone output); Application Insights resource; GitHub repository + OIDC federated credential for Actions (publish-profile secret as fallback); App Settings (`DATABASE_URL`, `SESSION_SECRET`, `APPLICATIONINSIGHTS_CONNECTION_STRING`) and a GitHub environment secret holding the prod `DATABASE_URL` for the migration step. Anything on this list the agent cannot execute or verify is reported as **pending human verification**, never claimed done.

**Builds (agent-executable):** `git init` (repo is not yet a git repository) + push to GitHub; pnpm/Next/TS-strict/Tailwind scaffold with **standalone output** enabled; ESLint + boundaries config; Vitest, PGlite harness, Playwright; `docker-compose.yml` for the local Postgres 16 dev/e2e database; Drizzle + `pg` driver + migration pipeline; CI (GitHub Actions: typecheck, lint, unit, integration, build) + deploy workflow (build standalone → `drizzle-kit migrate` against prod → `azure/webapps-deploy` via OIDC login); Application Insights SDK wiring (inert when the connection string is unset); PWA manifest + icons + minimal Serwist SW (shell precache, `skipWaiting` on user action only); tables `users`, `auth_throttle`; first-run setup screen, login, logout, `iron-session` middleware protecting everything else; empty Today shell; README with local-dev, migration, and Azure-provisioning instructions.

**Tests:** setup-lockout integration test (second registration attempt 404s once a user exists); throttle lockout; session persistence across requests; CI runs all suites.

**Acceptance:** fresh clone → `docker compose up db` + `pnpm i && pnpm dev` works with only `DATABASE_URL` + `SESSION_SECRET`; the App Service production URL (`*.azurewebsites.net`) installs on the iPhone and cold-opens to login/Today (deploy + install are human-verified); lint fails on a deliberate `domain → server` import.

**Not yet:** any domain table, any offline logic beyond shell precache, Key Vault, VNets/private endpoints, IaC, custom domain.

### Phase 1 — Exercise library (size S)

**Goal:** the exercise vocabulary the rest of the system references.

**Builds:** tables `muscle_groups` (seed all 15 slugs from domain-model §2), `exercises`, `exercise_muscle_contributions`; seed catalog (~40 common movements with primary 1.0 / secondary 0.5 defaults per domain-model §3, each with sensible `loadStepKg` — default 2.5, dumbbell moves 2.0, machines 5.0); CRUD UI (list, create/edit with contribution editor, archive/unarchive, optional `baselineLoadKg`); REST routes `/api/exercises[...]`.

**Tests:** integration — archive hides from default listing but record stays readable; delete with history returns 409 (testable properly from Phase 3; assert FK RESTRICT now via seeded fixture); contribution weight validation (0 < w ≤ 1).

**Acceptance:** mvp-scope F2 criterion; seeds rerun idempotently.

**Not yet:** merge tool (OD-11), per-exercise efficacy copy (evidence-to-design #16).

### Phase 2 — Programs, templates, prescriptions, basic blocks (size L)

**Goal:** the entire planning world, minus deload application.

**Builds:** tables `programs`, `workout_templates`, `exercise_prescriptions`, `blocks`, `block_schedule_entries`; prescription editor: exercise pick, `fixed`/`repRange` scheme (versioned `{v:1, scheme}` envelope from `src/domain/schemes`), target-RIR band (default from block goal per prescription-model, hypertrophy `{min:0,max:2}`), strategy selection + config form (Zod-validated, defaults classified `'heuristic'`); ordered template/prescription reordering (deferrable uniques); block start flow (program, goal, `weeksPlanned` 1–16, weekday schedule, optional scheduled-deload config **stored but not yet applied**); one-active-block enforcement + activate/complete/abandon; derived current-week display (`floor((date−startDate)/7)+1` via `src/domain/scheduling`).

**Tests:** unit — scheme validation bounds (sets 1–20, reps 1–100, range span ≤ 30), week derivation incl. boundaries; integration — reorder transaction, partial unique on active block, strategy-scheme compatibility rejection (`supportsScheme`).

**Acceptance:** mvp-scope F3 + F4 (except deload-modified targets, deferred to Phase 5); full PPL program buildable on the phone.

**Not yet:** deload modifiers in targets, week overrides, any session/execution table.

### Phase 3 — Today + workout execution, outbox-first (size XL — the heart)

**Goal:** gym-usable logging with offline durability from the first set ever logged.

**Builds:**
- Tables `workout_sessions`, `session_exercises`, `set_logs` with all partial uniques (`uq_sessions_one_in_progress`) and FK policies per data-model.
- `GET /api/today-bundle`: WorkoutContextBundle (today's template resolved from active block schedule, effective prescription — **this phase: scheme + RIR band + working targets via carry-forward chain minus decisions** (prescription-model: last non-deload session's first work-set load → `baselineLoadKg` → empty), previous performance per exercise, engine history window).
- `src/sync`: IndexedDB stores (`activeSession`, `outbox`, `bundleCache`); op enqueue → local commit → UI confirm; FIFO batched flush on foreground/visibility/reconnect/interval; `POST /api/sync` applying idempotent full-row upserts keyed by client UUIDv7; LWW on `updated_at`; dead-letter store (surfaced in Phase 8's dedicated screen; minimal banner now).
- Session lifecycle: start (freeze `PrescriptionSnapshot` per domain-model §6 into each `session_exercises` row; snapshot `template_name`, `week_index`), log set (weight/reps/optional-RIR, prefilled, ≤3 taps), edit/delete set, add unplanned exercise, skip exercise, notes, complete/abandon; resume in-progress; takeover UX when server knows a different in-progress session.
- History: list + detail rendered from snapshots; post-completion set corrections.

**Tests:** the §1.5 bold suites for sync + snapshot immutability; e2e airplane-mode workout; unit carry-forward chain.

**Acceptance:** mvp-scope F5, F6 (Playwright offline scenario green), F9; a real gym session logged on the phone end-to-end.

**Not yet:** recommendations (targets come from history/baseline only), deload behavior, volume math.

### Phase 4 — Progression engine v1 (size L)

**Goal:** explainable recommendations with user decisions.

**Builds:** `src/domain/progression` — registry; strategies `load-progression@1`, `rep-progression@1` (incl. `onCapReached: 'suggest_load_increase'` config = double progression, **default off**), `manual@1`; reason-code table + copy; confidence labels; `recommendations` table + partial unique (one pending per exercise+block); server evaluation on session completion + client fallback evaluation offline (`computedBy: 'client'`, reconciled per progression-engine); supersede-on-edit while pending; Today/workout UI: recommendation card (action, target, reason chips, confidence), accept/modify/reject, **implicit accept via first logged work set matching rounded target**; decisions feed the carry-forward chain from Phase 3.

**Tests:** **full §9 matrix (14 cases) as unit tests**; determinism (same ctx+config → identical draft); integration — supersede semantics, pending-unique, decision immutability (one-time append), reject leaves plan untouched (assert prescription row byte-identical).

**Acceptance:** mvp-scope F7.

**Not yet:** recovery inputs (EvaluationContext slot stays empty — EVIDENCE-027), percent1RM/AMRAP-aware strategies, auto-anything.

### Phase 5 — Block lifecycle polish: deloads, overrides, transitions (size M)

**Goal:** blocks behave as periodization containers end-to-end.

**Builds:** table `block_week_overrides`; deload application in effective-prescription assembly (`setMultiplier` floor ≥1 set, `loadMultiplier` rounded to `loadStepKg`, `targetRirShift` per domain-model §5–6); manual week-override CRUD ("make this week a deload"); `is_deload` snapshot on sessions; engine integration — deload sessions are not evaluated and are excluded from the carry-forward chain (progression-engine); volume/history badges consume `is_deload`; block completion summary (sessions done, per-exercise before→after targets) + start-next-block flow (copy program reference, fresh weeks).

**Tests:** unit — modifier math incl. rounding + floors, override precedence over scheduled deload; integration — deload session skips evaluation, post-deload session carries forward from *pre*-deload loads; e2e — scheduled deload week renders modified Today targets.

**Acceptance:** mvp-scope F4 fully (deload-modified targets visible); post-deload dip framing per B6 in block summary copy.

**Not yet:** autoregulated deloads (OD-09).

### Phase 6 — Volume tracking (size M)

**Goal:** weekly per-muscle volume with honest labels.

**Builds:** tables `volume_presets`, `volume_landmarks`; RP preset seeded per `docs/input/rp-volume-landmarks.md` with heuristic labeling and the documented caveats (rear/side-delt duplication, merged back → single `back` group); `src/domain/volume` aggregation (work sets only, warmups excluded, fractional by current contribution weights, calendar-week + block-week bucketing per volume-model); volume screen — current + trailing 4 weeks per muscle vs. active preset landmarks, deload badges, landmark value editing (creates/updates the user's values in place; preset switching is post-MVP).

**Tests:** **hand-computed fixture** (mixed compounds, 0.5 secondaries, a deload week, a warmup to exclude); unit bucketing incl. week edges; integration — landmark edit reflects immediately, no persisted aggregates anywhere (grep-level check: no volume cache table/column exists).

**Acceptance:** mvp-scope F8, incl. the non-coercive display rules (volume-model §5).

**Not yet:** multiple named presets, volume-trend charts (Phase 9), any auto-volume-adjustment (never — GAP-01).

### Phase 7 — Bodyweight & recovery logs (size S)

**Goal:** observation capture, zero coupling.

**Builds:** tables `bodyweight_entries`, `recovery_entries`; quick-entry forms (bodyweight ≤2 interactions from Today; recovery 3 sliders + optional note, dismissible forever); simple lists with edit/delete; explicit non-consumption: no engine import path (assert via boundaries test — `src/domain/progression` has no reference to these modules/types).

**Tests:** daily-grain uniqueness handling (second entry same day = update); the non-consumption assertion.

**Acceptance:** mvp-scope F10.

**Not yet:** trends/charts (Phase 9), readiness-informed anything (OD-09).

### Phase 8 — Offline & PWA hardening (size L, mostly verification)

**Goal:** the offline story proven, not assumed.

**Builds/verifies:** full `pwa-offline-strategy.md` §12 suite as Playwright specs (offline start-from-cold, mid-session network flap, kill-and-relaunch, sync-after-login-expiry with queued ops preserved, duplicate-flush idempotence, takeover, dead-letter path); dead-letter screen (inspect/retry/discard per op, discard double-confirmed); `navigator.storage.persist()` request + status surfacing; bundle staleness policy (serve cached + background refresh, per strategy doc); SW update UX (new-version toast → user-triggered `skipWaiting`); iOS manual checklist executed on the real device (installed standalone, backgrounded mid-set, force-killed, airplane mode, low storage) with results recorded in the PR.

**Tests:** the suite *is* the phase. CI runs Playwright offline specs headless; the iOS manual checklist is a documented gate.

**Acceptance:** mvp-scope F6 + F11 fully; **MVP complete** — tag `v1.0.0`.

**Not yet:** Web Push (OD-08).

### Phase 9 — Analytics dashboard (post-MVP, size M)

Resolve OD-04 (default Recharts) + OD-06 (default Epley) first. Builds: e1RM trends per exercise (computed on read, labeled estimate, reps ≤12), tonnage per session/week, per-muscle volume trend chart, recommendation acceptance/modification stats, history search + filters. All read-only derivations — **no new persisted aggregates** (architecture-plan §7 holds).

### Phase 10 — Ops & durability hardening (post-MVP, size S)

Builds: `GET /api/export` (full-account JSON, versioned envelope, documented shape); weekly `pg_dump` GitHub Action (Flexible Server → encrypted artifact/private storage) + documented restore drill actually performed once (PITR restore to a throwaway server, then delete); security-header pass (CSP, HSTS preload) and Lighthouse PWA/perf budget in CI. Interim durability before this phase: Flexible Server automated backups + 7-day PITR (active from Phase 0).

---

## 3. Phase dependency graph

Strictly linear 0→8 (each phase consumes the previous phase's tables/flows), with one soft edge: Phase 6 (volume) and Phase 7 (logs) are independent of each other and may swap order if convenient. 9 and 10 require 8. No phase may start on speculation from a later phase's spec.
