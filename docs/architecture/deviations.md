# Deviations

Records genuine contradictions between binding spec documents (not ordinary scope choices — those belong in `open-decisions.md`). Per `implementation-plan.md` §0 ground rule 5: halt the affected task, record the conflict here, and proceed only with the smallest reversible workaround if it's safe to continue.

---

## D-01: `baselineLoadKg` placement — Exercise (Phase 1) vs. ExercisePrescription (Phase 2)

**Status:** Resolved — proceeding without an Exercise-level field.

**Conflict:** `mvp-scope.md` F2's one-line summary and `implementation-plan.md`'s Phase 1 "Builds" bullet both list "optional `baselineLoadKg`" as part of the Exercise library feature. But the column-level-authority schema (`data-model.md` §1 ground rule: "`data-model.md` ... schema — column-level authority") defines `baseline_load_kg` only on `exercise_prescriptions` (§2.8, Phase 2's Program/Template/Prescription cluster), not on `exercises` (§2.4). `domain-model.md` agrees: `baselineLoadKg` is listed under `ExercisePrescription` (§4, "starting load only; working load is thereafter carried forward from history/decisions"), and is absent from the `Exercise` entity's property list (§3).

**Resolution:** Treat `data-model.md` §2.4 and `domain-model.md` §3 as authoritative for what an `Exercise` is. Phase 1's `exercises` table and CRUD UI do **not** get a `baselineLoadKg` field. The user-facing instruction to implement Phase 1 also explicitly excludes "prescriptions" from this phase's scope guardrails, and `baselineLoadKg` is unambiguously a prescription concept (§4) — implementing it on `Exercise` now would itself be a Phase 2 scope leak, not just a doc-drift fix. `baselineLoadKg` will be built in Phase 2 as a column on `exercise_prescriptions`, per its existing correct specification.

**Follow-up:** `mvp-scope.md` F2's summary text and `implementation-plan.md`'s Phase 1 "Builds" bullet should eventually be corrected to drop the misplaced `baselineLoadKg` mention (or reword it to point at Phase 2). Not done as part of this change since the user's cleanup-gate scope for this session was a fixed, bounded list of 6 findings (M1/L1/L2/L3/L5/L6) and this doc-wording fix wasn't among them; flagging here so it isn't lost.
