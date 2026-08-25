# Deviations

Records genuine contradictions between binding spec documents (not ordinary scope choices — those belong in `open-decisions.md`). Per `implementation-plan.md` §0 ground rule 5: halt the affected task, record the conflict here, and proceed only with the smallest reversible workaround if it's safe to continue.

---

## D-01: `baselineLoadKg` placement — Exercise (Phase 1) vs. ExercisePrescription (Phase 2)

**Status:** Resolved — proceeding without an Exercise-level field.

**Conflict:** `mvp-scope.md` F2's one-line summary and `implementation-plan.md`'s Phase 1 "Builds" bullet both list "optional `baselineLoadKg`" as part of the Exercise library feature. But the column-level-authority schema (`data-model.md` §1 ground rule: "`data-model.md` ... schema — column-level authority") defines `baseline_load_kg` only on `exercise_prescriptions` (§2.8, Phase 2's Program/Template/Prescription cluster), not on `exercises` (§2.4). `domain-model.md` agrees: `baselineLoadKg` is listed under `ExercisePrescription` (§4, "starting load only; working load is thereafter carried forward from history/decisions"), and is absent from the `Exercise` entity's property list (§3).

**Resolution:** Treat `data-model.md` §2.4 and `domain-model.md` §3 as authoritative for what an `Exercise` is. Phase 1's `exercises` table and CRUD UI do **not** get a `baselineLoadKg` field. The user-facing instruction to implement Phase 1 also explicitly excludes "prescriptions" from this phase's scope guardrails, and `baselineLoadKg` is unambiguously a prescription concept (§4) — implementing it on `Exercise` now would itself be a Phase 2 scope leak, not just a doc-drift fix. `baselineLoadKg` will be built in Phase 2 as a column on `exercise_prescriptions`, per its existing correct specification.

**Follow-up:** `mvp-scope.md` F2's summary text and `implementation-plan.md`'s Phase 1 "Builds" bullet should eventually be corrected to drop the misplaced `baselineLoadKg` mention (or reword it to point at Phase 2). Not done as part of this change since the user's cleanup-gate scope for this session was a fixed, bounded list of 6 findings (M1/L1/L2/L3/L5/L6) and this doc-wording fix wasn't among them; flagging here so it isn't lost.

---

## D-02: `blocks.volume_preset_id` FK target (`volume_presets`) doesn't exist yet in Phase 2

**Status:** Fully closed — Phase 6 (docs/reviews/phase-6-implementation.md) added `volume_presets`, then generated `blocks_volume_preset_id_volume_presets_id_fk FOREIGN KEY (volume_preset_id) REFERENCES volume_presets(id) ON DELETE SET NULL` via ordinary `drizzle-kit generate` (migration `0008`) — no manual constraint patch was needed, since the two tables land in the same generated migration file in dependency order. Verified live against local PostgreSQL 16.

**Conflict:** `data-model.md` §2.9 specifies `blocks.volume_preset_id uuid FK → volume_presets ON DELETE SET NULL, null` as part of the `blocks` table, which `implementation-plan.md`'s Phase 2 section builds. But `volume_presets` (data-model.md §2.16) is not created until Phase 6 (`implementation-plan.md` §Phase 6). A real `REFERENCES volume_presets(id)` constraint in Phase 2's migration is impossible — the target table doesn't exist yet, so the migration would fail outright.

**Resolution:** `blocks.volume_preset_id` is added now, in Phase 2, as a plain nullable `uuid` column with **no FK constraint**. This matches the column's own semantics — the ER diagram (data-model.md §3) already draws `blocks }o..|| volume_presets : "views with"` as a dotted, context-only relationship, and §5's derived-data note treats block "current week"/context views as pure display, not integrity-critical. No Phase 2 code reads or writes this column (nothing in Phase 2's scope produces a volume preset id to store); it exists purely so Phase 6 doesn't need `ADD COLUMN` on a live table. Phase 6 will add `ALTER TABLE blocks ADD CONSTRAINT blocks_volume_preset_id_volume_presets_id_fk FOREIGN KEY (volume_preset_id) REFERENCES volume_presets(id) ON DELETE SET NULL` once `volume_presets` exists, per data-model.md §2.9.

**Follow-up:** None needed — Phase 6 closes this by adding the constraint per the existing spec; no doc wording is wrong here, it's purely a build-order artifact of a linear phase sequence referencing a not-yet-built table.

---

## D-03: Phase 3 sync applies conditional field patches in arrival order, not timestamp-compared full-row LWW

**Status:** Accepted by the user on 2026-08-17 for Phase 3 / the MVP. Not resolved — deliberately carried, with revisit triggers below.

**Conflict:** `implementation-plan.md`'s Phase 3 section specifies "idempotent **full-row** upserts keyed by client UUIDv7; **LWW on `updated_at`**", and `pwa-offline-strategy.md` §5 states "ops are full-row upserts/deletes keyed by entity UUID, so replays converge". The delivered Phase 3 sync does not match the second half of that contract:

- The **client** half does match: after the Phase 3 remediation, every mutator in `src/sync/activeSession.ts` emits full-row payloads through `src/domain/sync/payloadBuilders.ts` (independently verified on the wire — see `docs/reviews/phase-3-remediation-verification.md`).
- The **server** half does not. The three update paths in `src/server/sync/service.ts` (`workoutSessions`, `sessionExercises`, `setLogs`) build a conditional field patch — `if (payload.field !== undefined) patch.field = …` — seeded with a *server*-stamped `updatedAt`, and apply it in the order ops arrive.
- Critically, the sync op schemas in `src/domain/sync/schema.ts` carry **no client write timestamp at all**: `updatedAt` appears nowhere in the transmitted payloads. So the server has nothing to compare, and last-write-wins is arrival-order-only *by construction*, not because a comparison was forgotten. Ordering is compliant with `pwa-offline-strategy.md` §6 ("by arrival order"); the granularity and the timestamp comparison are not.

**Resolution (accepted risk):** Ship Phase 3 as built. The risk is accepted for the personal, single-account, single-active-session MVP: ADR-004 fixes the product at one account, the `uq_sessions_one_in_progress` partial unique index plus the takeover flow prevent two devices from concurrently owning one in-progress session, and no Phase 3 code path produces the divergence this contract exists to prevent.

**Residual risk being carried:** concurrent multi-device editing — most plausibly **post-completion history corrections**, which are not protected by the in-progress-session lock. Two devices editing different fields of the same completed row, or the same field in an order that does not match wall-clock intent, can produce a stored row that reflects arrival order or a field-level merge rather than the logically newest complete row. That row would be internally consistent and would not be silently dropped, but it need not equal what either device last displayed.

**Explicitly out of bounds:** this acceptance is **not** permission to introduce CRDTs, vector clocks, operational transforms, or any general merge machinery. Nothing in the current or planned MVP justifies that complexity.

**Revisit triggers — any one of these reopens this deviation:**

- regular concurrent use from more than one device;
- an observed sync conflict or an unexpected field merge in real data;
- planned expansion beyond the single-user / single-active-device posture;
- a dedicated sync-contract redesign during later hardening.

**Follow-up (what a correct future change requires):** not a one-line fix. It needs an explicit design covering (1) a client-generated write timestamp added to the sync op contract and to the payload builders; (2) server-side full-row conditional updates gated on that timestamp (`… WHERE updated_at <= :clientUpdatedAt`, or an equivalent guarded upsert) instead of unconditional field patches; (3) conflict tests that actually exercise divergent concurrent edits, including the history-correction path; and (4) compatibility with operations already queued in the offline outbox at upgrade time — old ops without a timestamp must still apply deterministically. Until that design exists, do not partially implement it.
