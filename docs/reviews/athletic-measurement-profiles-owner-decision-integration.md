# Athletic Exercise Measurement Profiles — owner-decision integration record (PI-005)

**Date:** 2026-09-07
**Authoritative specification:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` (updated in place; §0.1 addendum, §22, §24, §27)
**Preceding gate:** `docs/reviews/athletic-measurement-profiles-architecture-revision-verification-2.md` — `VERIFIED — READY FOR OWNER DECISIONS`
**Scope:** records the owner's acceptance of O-1 … O-17 and how it was integrated. No code, migration, seed, test or production-state architecture document was changed; neither review report nor either verification report was modified; no new owner question was introduced; the working tree is otherwise untouched.

---

## 1. Decisions accepted

All seventeen decisions were accepted **exactly as recommended** in the evaluation's §22. The accepted outcomes are now binding and are listed in the evaluation's §0.1; in summary:

| Id | Accepted outcome |
| --- | --- |
| O-1 | `load_duration` included; six profiles |
| O-2 | `load_basis` in Release 1 |
| O-3 | `measurement_profile` locked once referenced |
| O-4(i) | `volume_counting` switch added |
| O-4(ii) | `reps` profile defaults `volume_counting = 'off'` |
| O-5 | Seeded-exercise reconcile runs in the Release-2 seed step (deploy window disclosed) |
| O-6 | Metrics Training card counts every non-warm-up attempt; caption `Completed workouts only. Warm-up sets not counted. Every exercise type counts as a set.` |
| O-7 | Release 1 = option (b): columns + acceptance-side contract widening, no client emission, no new UI |
| O-8 | Seconds input; secondary `m:ss` display at ≥ 60 s |
| O-9 | No derived speed in v1 |
| O-10(i) | The ten Release-3 slugs and shapes adopted |
| O-10(ii) | Their muscle contributions deferred to a Release-3 authored-list gate |
| O-11 | Optional RIR allowed on `reps` |
| O-12 | One row per set, bilateral and unilateral; no per-side field |
| O-13 | Profile-scoped full-row set payloads |
| O-14 | Mirror composite FK `session_exercises (exercise_id, measurement_profile) → exercises (id, measurement_profile)` |
| O-15 | `weightKg` wire precision unchanged in v1 |
| O-16 | Blocked/banner/completion-confirm extended to refused `setLog` and `sessionExercise` operations |
| O-17 | Option (a): `MEASUREMENT_PROFILE_UNSUPPORTED` and `LOAD_BASIS_UNSUPPORTED` added; refusal order profile → load basis → equipment → switch |

## 2. How the acceptance was integrated

- **Addendum.** §0.1 lists every accepted outcome with the sections it binds; the header states the acceptance and that ADR-011 is amended under O-17.
- **Conditional language removed.** Every "recommended", "proposed", "if O-nn" and "unless O-nn" clause now states the accepted outcome; rejected alternatives are kept as rationale in §22 and inline where they explain a rule (X-list, §11.6, §13.4, §14.3, §14.5).
- **Release tables.** §21.1 (Release 1) is titled with O-7 option (b) and its ships / does-not-ship lists are definite; §21.2 carries O-6's caption, O-16's surfacing and O-5's reconcile; §21.3 carries O-10(i) with the O-10(ii) gate.
- **Invariants, controls, criteria.** I-3, I-7, I-13, I-14, NC-1, NC-5, NC-11, NC-13, NC-14, A-2, A-4, A-6a/b, A-11a/b, A-14, A-15, A-16, A-23, A-25 read against the accepted outcomes.
- **Documentation checklist.** §24 is now release-specific: which production-state document changes in which release commit, and which decision each amendment records. The ADR-011 / e1RM-revision amendment (O-17) becomes effective in the Release-1 commit that changes `src/domain/strength/eligibility.ts` and `reasonCodes.ts`, and is unobservable to the athlete until Release 2. None of those documents was touched by this integration.

## 3. Pre-implementation corrections carried in

The second verification listed four corrections due "before Release 1 implementation, not before owner decisions" (its §7). Because the evaluation must be implementable as written, they were applied in the same pass and logged in §27:

| Finding | Applied as |
| --- | --- |
| W-1 | A-6 split into A-6a (R1: `formatScheme`, `formatSetLine`) and A-6b (R2 renderers); A-11 split into A-11a (R1: API write-side gate) and A-11b (R2 editor); the prescription write-side gate, `formatScheme` extension and `schemeDefaultReps` widening named in §21.1's ships list |
| W-2 | I-3 attributes the slot **profile** freeze to the composite FK and the **basis** freeze to the service rule |
| W-3 | §9.4 states the typed columns are authoritative for profile **and** basis; the snapshot's `loadBasis` carries no authority |
| W-4 | "(O-17, accepted)" markers at §11.3 and §23 |

No settled technical finding was reopened; none of these changes the core model.

## 4. Verification requested

Confirm that: every accepted outcome in §0.1 is stated unconditionally at each site §0.1 names; no "recommended" / "proposed" / "if O-nn" language remains outside §22's rationale columns and the historical logs (§25–§27); §24 assigns every production-state amendment to a release commit and none was applied prematurely; the four W-items are closed as described; and the evaluation remains internally consistent with the second verification's confirmations.

**READY FOR TARGETED OWNER-DECISION INTEGRATION VERIFICATION**
