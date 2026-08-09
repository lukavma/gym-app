# ADR-005: PWA/offline strategy — online-first app, local-first active workout

## Status
Accepted (2026-08-09)

## Context
Primary device is an iPhone PWA in a gym with unreliable connectivity. The non-negotiable: a logged set must survive network loss, refresh, backgrounding, and browser restart. Full offline capability for the whole app is *not* a requirement. iOS constraints: no Background Sync, aggressive tab killing, storage eviction rules for non-installed usage.

## Decision
Three-tier posture (full mechanics in `pwa-offline-strategy.md`):

1. **App shell**: Serwist service worker precaches shell + workout routes → app opens offline.
2. **Active workout is local-first**: the in-progress session aggregate lives in IndexedDB and is the UI's source of truth; every mutation commits locally before the UI confirms. A `WorkoutContextBundle` (template snapshot, previous performance, pending recommendations, engine history) is cached at Today load so a workout can *start* offline.
3. **Sync via idempotent outbox**: append-only op queue, batched FIFO flush on foreground triggers, full-row upserts keyed by client UUIDv7 → replays converge; LWW conflict policy; DB-enforced single in-progress session with explicit takeover UX.

Definitions (programs, templates, exercises, presets) are **editable online only** — this single scope cut removes definition-merge conflicts from existence.

## Alternatives considered
- **Pure online-first (no local store)** — a dropped connection or tab kill loses sets; fails the core requirement outright.
- **Fully offline-capable app** (all reads/writes offline) — forces caching and conflict semantics onto every feature for zero gym-floor value.
- **Local-first sync engine (Replicache, PowerSync, ElectricSQL, CRDTs)** — solves multi-writer replication a single-user app doesn't have; adds a vendor/protocol/runtime; violates "boring". The outbox is ~300 lines we fully own and can unit-test.
- **Native wrapper (Capacitor) for reliable storage** — abandons the PWA requirement to fix a problem IndexedDB + prompt flushing already handles.

## Consequences
- Gym logging works with airplane mode on; sync is invisible bookkeeping.
- Two data stores exist (Postgres + IndexedDB) with a narrow, append-mostly contract between them; the sync tests in `pwa-offline-strategy.md` §12 are mandatory MVP acceptance.
- History/analytics require connectivity — accepted and documented in the capability matrix.
- If multi-device active use ever becomes real, LWW would need revisiting (parked in `open-decisions.md`).
