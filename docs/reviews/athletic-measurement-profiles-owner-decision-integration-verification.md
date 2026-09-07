# Athletic Exercise Measurement Profiles — owner-decision integration verification (PI-005)

**Date:** 2026-09-07
**Verified:** `docs/reviews/athletic-measurement-profiles-owner-decision-integration.md` and the specification it records, `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md` (1013 lines; §0.1 addendum, §22 retitled, §24 rewritten, §27 integration log)
**Finding history:** `…-architecture-review.md` (BLOCKER-1…3, HIGH-1…4, MEDIUM-1…7, LOW-1…10) → `…-architecture-revision-verification.md` (V-1…V-9) → `…-architecture-revision-verification-2.md` (`VERIFIED — READY FOR OWNER DECISIONS`; W-1…W-4)
**Baseline:** working tree at `05982f6`, migrations `0000`–`0012`
**Scope discipline:** neither input document, nor either verification report, nor the original review was modified. No production code, migration, seed, test or architecture document was touched; no owner decision was made or reinterpreted. Nothing was committed, pushed or deployed; production was not contacted.

---

## 0. Verdict

**VERIFIED — READY FOR RELEASE 1 IMPLEMENTATION.**

All seventeen decisions are recorded exactly as accepted and are now binding in three mutually consistent places — the integration record's §1, the evaluation's §0.1 and §22's recommendation column. I compared them row by row: **no decision was altered, weakened or silently expanded**. Conditional language is gone from the design body; the only residual "recommended"/"proposed" occurrences are the header's description of the acceptance, §1's own definition of the word, the structural section titles it governs, and the historical logs §25–§27.

The four pre-Release-1 corrections the second verification named (W-1…W-4) are closed, and W-1 is closed more completely than it was written: §21.1 now names the prescription write-side gate *and states what it is for* — "which is what keeps a new variant out of every prescription and every `recommendations.inputs.prescribed` while the schema already accepts it" — which also closes W-1(c), the `inputsSummarySchema` language-widening consequence.

§24 is the strongest part of this pass. Its preamble states that no production-state document is touched today, each amendment lands **in the same commit as the code it describes**, and every forward reference is release-labelled ("schema-accepted in R1, editor-offered in R2"; "server acceptance in R1, client emission in R2"; "unobservable to the athlete until Release 2"). I confirmed against `git status` that no file under `docs/architecture/`, `src/` or `drizzle/` was modified.

Five LOW findings remain, four of which do not touch Release 1 at all:

- **X-1** — A-2 sits in Release 1's criterion list but its third clause asserts `validateSetInput`'s decimal guard, which ships in Release 2. This is the W-1 class recurring in a criterion that was not split; it was present when the second verification ran and I did not catch it then.
- **X-2** — §0.1's O-9 row cites the wrong non-goal (N-4 instead of X-14).
- **X-3** — §22's O-7 option (b) is still labelled "**server-side** contract acceptance" although V-2 established that server-side-only is impossible for the shared schemas, and every binding site now says "acceptance-side".
- **X-4** — O-12 is the one accepted decision with a stored-meaning consequence and no §24 documentation row.
- **X-5** — two small overstatements (§11.6's "no non-`load_reps` exercise … exists until Release 2"; §18.1's "proposed as binding" heading).

None of these blocks starting Release 1: X-1 costs the implementer one deferred clause, and the rest are a cross-reference, a historical label, an R2 documentation obligation and two words.

---

## 1. Method

Each of the seventeen decisions was checked three ways — the integration record's §1 table, the evaluation's §0.1 binding column, and §22's recommendation column — and then at each site §0.1 names, to confirm the outcome is stated unconditionally there rather than merely asserted centrally. Conditional language was swept mechanically across the whole document and every hit classified. §24 was checked row by row for release placement, for premature description of unimplemented behaviour, and for completeness against the seventeen decisions. The four W-items were re-derived from the evaluation body. Repository claims introduced by this pass were opened and verified. The earlier corrections (BLOCKER-1…3, HIGH-1…4, V-1…V-9) were re-checked at their sites to confirm the integration pass did not disturb them.

The first verification's live-PostgreSQL probes are not repeated: §6.1, §8.1–§8.3, §9.1, §12.2 and NC-4 are unchanged on every number those probes established, which I confirmed by locating each occurrence.

---

## 2. O-1 … O-17: recorded exactly, and binding

The three records agree on all seventeen. Sampling the ones where drift would matter most:

| Id | §22 recommendation | Integration §1 | §0.1 binding statement | Verdict |
|---|---|---|---|---|
| O-3 | "Lock" | "locked once referenced" | "locked once any slot or prescription references the exercise; create a new exercise to change it" | exact; §10.3 and I-3 state it unconditionally |
| O-4(ii) | "`'off'`" | "`reps` defaults `volume_counting = 'off'`" | "`'off'` for the `reps` profile and `'auto'` for `load_reps`" | exact; §11.4, NC-11, A-14 |
| O-5 | "Release 2, seed step" | "Release-2 seed step (deploy window disclosed)" | enumerates all four reconcile actions plus the window | exact and **more specific**, not expanded — the four actions are §14.3's existing table |
| O-6 | caption text | same caption | same caption | byte-identical in §0.1, §11.2, §21.2, §24.2 and O-6 itself |
| O-13 | "Profile-scoped" | "Profile-scoped full-row set payloads" | "profile-independent keys plus every key the frozen profile permits; forbidden keys omitted" | exact; §12.3 now headed "**Binding rule (O-13, accepted)**" |
| O-15 | "Leave unchanged in v1" | "unchanged in v1" | "unchanged in v1 (no `multipleOf`); the two new fields carry `multipleOf(0.01)` with input guards" | exact — the second clause restates §6.1, which never depended on O-15 |
| O-17 | "(a)" | "(a): both codes added; order profile → load basis → equipment → switch" | same, plus the release the amendment takes effect in | exact; see §5 |

**No expansion.** The one place where §0.1's description is broader than §22's is O-7, whose §0.1 row lists "read-side **and write-side** gates". The write-side gate arrived through W-1, is attributed to W-1 in both the integration record's §3 and the evaluation's §27, and sits inside the "dark" shape O-7 chose — it does not change what O-7 decided. The related wording drift is X-3.

**No weakening.** Every decision that constrains implementation is restated as a rule at its site, not merely as a pointer: §7.2 ends "**O-12 accepted:** one row per set …"; §14.3 ends "**O-5 accepted:** the reconcile runs in the Release-2 seed step as described"; §13.4 is headed "**Binding (O-16, accepted)**"; §14.5's matrix is "binding"; §16's ten slugs are "**adopted under O-10(i)** (binding for Release 3)". Rejected alternatives survive only as rationale, and each says so.

---

## 3. Conditional language

A full-document sweep for `recommended`, `proposed`, `if O-`, `unless O-`, `whichever`, `would be amended`, `not settled` returns, outside §22 and §25–§27:

| Hit | Classification |
|---|---|
| Header line 8; §0.1's opening paragraph | describe the acceptance itself — required |
| §1: "'Proposed' means this report's design" | the document's own definition of the word |
| Section titles §5, §6, §7, §8, §9, §10, §11, §12, §15 "(proposed)" | structural, governed by §1's definition — they separate "current repository" from "this report's design", not decided from undecided |
| §18.1 "Invariants (proposed as binding for implementation)" | same structural sense, but now reads oddly under a parent headed "Binding invariants" — X-5 |

No `if O-nn` / `unless O-nn` / `whichever option` construction survives anywhere. The three sites the second verification singled out are all converted: §11.6 is now "Amendment … (owner decision O-17 accepted, option (a))"; §21.1's eligibility gate reads "with O-17's accepted codes and ordering"; §24's ADR-011 row states the amendment as effective rather than conditional.

---

## 4. §24 — documentation obligations

**Release placement is correct and nothing was applied early.** The preamble is unambiguous: *"The production-state architecture documents are **not** updated by this evaluation or by the owner-decision integration. Each amendment below lands **in the same commit as the code it describes**, in the release named, and is a review-gate item for that release. Nothing in this table is done today."* Verified: `git status --porcelain -- docs/architecture src drizzle` is empty.

Row-by-row placement against the release that ships the code:

| Document | Release | Code that lands with it | Correct? |
|---|---|---|---|
| `data-model.md` §2.4/§2.13/§2.14 | R1 | migration `0013` | ✓ |
| `domain-model.md` §7/§9/§10 | R1 | the §10.3 lock + mirror FK | ✓ |
| `volume-model.md` §1/§2 | R1 | the volume profile filter and `reps` default | ✓ — the Training-card caption is explicitly deferred to R2 in the same row |
| `prescription-model.md` §2/§6 | R1 | `setSchemeSchema` variants + write-side gate | ✓ — labelled "schema-accepted in R1, editor-offered in R2" |
| `progression-engine.md` §2/§5 | R1 | the `continue` precondition, I-13 | ✓ |
| `pwa-offline-strategy.md` §5 | R1 | server acceptance, reject reasons | ✓ — labelled "server acceptance in R1, client emission in R2" |
| e1RM revision + ADR-011 D-11 | R1 | `eligibility.ts`, `reasonCodes.ts` | ✓ — see §5 |
| `pwa-offline-strategy.md` §2/§5; `deviations.md`; `volume-model.md` note + `copy.ts`; `data-model.md` §2.4 note | R2 | client emission, O-16 surfacing, reconcile, caption | ✓ |
| `domain-model.md` §3 / catalog header | R3 | the ten seeded entries | ✓ |

**No premature description of unimplemented behaviour.** Every forward reference carries its release qualifier, so a reader of the R1 commit's documents learns what is true then and what is planned, never the reverse. `src/ui/metrics/copy.ts:37` — cited in §24.2 as the caption's home — was verified: it is exactly `trainingCaption: "Completed workouts only. Warm-up sets not counted.",`, and O-6 appends one sentence to it.

§24.4's "no `open-decisions.md` entry" is correct: that file's twenty-eight lines contain nothing bearing on measurement profiles or ADR-011 D-11, and the one deferral this work carries (O-10(ii)) is a release gate, not an open architectural question.

**One completeness gap:** O-12 has no row — X-4.

---

## 5. O-17 — exact, and in the right release

The amendment is stated as two clauses with before/after text, not as a direction of travel:

- **§15.4 enum, I-14, A-19** — two additions placed in `SUGGESTION_REFUSAL_REASON_CODES` beside the existing exercise-level codes, both excluded from `RELEASE_B_ONLY_REASON_CODES`. Re-verified in the repository: the group begins at `src/domain/strength/reasonCodes.ts:57` with `EXERCISE_CATEGORY_UNSUPPORTED` / `EXERCISE_ESTIMATE_DISABLED` at `:58-59`, and `RELEASE_B_ONLY_REASON_CODES` at `:118` begins with `DELOAD_SESSION_NO_SUGGESTION` — so the two existing exercise-level codes are already excluded and the new ones must be too for Release-A reachability. The citation and the exclusion are both exact.
- **§9.6 order** — "equipment → switch" becomes "profile → basis → equipment → switch", against the "category code wins" comment at `eligibility.ts:26-28`.

**Release placement is correct and self-consistent.** §0.1, §11.6 and §24.1 all say the amendment takes effect with the Release-1 commit that changes `eligibility.ts` and `reasonCodes.ts`, and §21.1 ships exactly that gate. It is unobservable to the athlete in R1 because every exercise is `load_reps` / `unspecified`, so the profile and basis gates pass and the equipment/switch result is today's. I-14's re-scoped form ("every member emitted by at least one fixture") stays satisfiable in R1 because A-4 tests each code with the later gates deliberately failing.

The only imprecision is §11.6's "no non-`load_reps` exercise and no `assistance` basis exists until Release 2" — A-11a deliberately builds one through the API in R1 (X-5).

---

## 6. W-1 … W-4

| Item | Required | Delivered | Verified |
|---|---|---|---|
| **W-1** | split A-6 and A-11; name the write-side gate, `formatScheme` and `schemeDefaultReps` in §21.1 | A-6a (R1: `formatScheme` + `formatSetLine`) / A-6b (R2: renderers); A-11a (R1: API write-side gate) / A-11b (R2: editor); §21.1 names all three items, and A-6a states the compile reason ("the four-member union makes the current fall-through branch (`setScheme.ts:69-72`) fail `pnpm typecheck`") | ✓ — and W-1(c) is closed explicitly: §21.1 says the gate "keeps a new variant out of … every `recommendations.inputs.prescribed` while the schema already accepts it", and A-11a repeats it against I-6 |
| **W-2** | attribute the basis freeze to the service rule | I-3 now separates them: profile freeze "enforced by the database (the set-level composite FK …)"; basis freeze "a service rule (no update path writes `session_exercises.load_basis`; the payload key is never read, §12.2) — `load_basis` is in no constraint because the exercise-level basis must stay editable" | ✓ exactly the distinction §10.3 already draws for the prescription half of the lock |
| **W-3** | §9.4 authority for profile **and** basis | "authoritative for the slot's **profile and basis** — both are the server-derived values at insert (§10.1) … its `measurement.loadBasis` records what the athlete saw at session start and **carries no authority** — after a permitted basis edit that lands between freeze and flush it may differ from the column, and nothing reads it" | ✓ — states the divergence and why it is harmless |
| **W-4** | O-17 markers at §11.3 and §23 | §11.3: "(O-17 option (a), accepted; §11.6)"; §23: "under an explicit ADR-011 amendment (O-17, accepted)" | ✓ |

O-16's mechanism, newly made concrete in §13.4, is feasible: *"`refreshSessionBlocked` therefore matches `setLog` / `sessionExercise` dead letters by `payload.sessionExerciseId` / `payload.sessionId` against the active session in addition to today's `workoutSession` match."* Every `setLog` upsert payload carries `sessionExerciseId` and every `sessionExercise` payload carries `sessionId` (both required in `src/domain/sync/schema.ts`), and the client aggregate holds both the session id and its slot ids — so the match is available without a new field. (A dead-lettered `setLog` **delete** carries only `{id}`, but deletes are idempotent and reject only on `invalid_payload`, so that case is not reachable in practice.)

---

## 7. Release boundaries

**Criteria partition cleanly.** R1 = A-1…A-4, A-5a, A-6a, A-7, A-8, A-9a, A-10, A-11a, A-12, A-14, A-17(R1), A-18, A-19. R2 = A-5b, A-6b, A-9b, A-11b, A-13, A-15, A-16, A-17(R2), A-20…A-25. R3 = A-17(R3). Union covers A-1…A-25 with every split half assigned once and nothing in both — except A-2's third clause (X-1).

**Controls carry releases.** NC-1…NC-14 each name R1 or R2; §21.1 lists NC-1, NC-2…NC-5, NC-9…NC-12, NC-14 and §21.2 lists NC-6, NC-7, NC-8, NC-13 and NC-1's client half — matching §13.5's release column exactly.

**The three releases stay internally consistent.** R1's "Does not ship" list (client emission, client DTO widening, reconcile, catalog edits, editor variants, logging UI) is the complement of R2's ships list. §14.4's per-release seed table matches §14.3 (reconcile in R2 only) and I-11. §14.5's rollback matrix depends only on what §21.1 ships and says so. O-6's caption and O-16's surfacing are both placed in R2 with the same justification — "the first release in which a non-`load_reps` attempt can exist" — which is also why R1 remains athlete-invisible.

---

## 8. Earlier findings and the core model

Re-checked at their sites, not inferred: BLOCKER-1's `99999.99` in §6.1 (twice), §8.3's DDL, §9.1's variant, §12.2's wire and NC-4, with `22003` mapped in §12.2 and I-8; BLOCKER-2's Release-2-only reconcile (§14.3 heading, I-11) and both composite FKs (§8.1's `uq_exercises_id_profile`, §8.2's `fk_session_exercises_exercise_profile`); BLOCKER-3's four-row rollback matrix with R2 → pre-`0013` still "unsupported"; HIGH-1's `'off'` default; HIGH-2's `continue` and I-13's five boundaries; HIGH-3's untightened `weightKg`; MEDIUM-1's "not a W-1 control" paragraph and H-7's disclaimer; V-1's profile-only comparison in all nine sites plus NC-14's mutation witness; V-6's rebuilt NC-10; V-7's explicit null skip; V-8's catalog scope; V-9's reject-reason paragraph.

The validated core model is untouched: the six profiles, §5.2's representation comparison, `load_basis` as label-and-gate (I-4), §8.3's shape CHECK, `PrescriptionSnapshot` at `v = 1`, §11.4's placement argument, and X-1…X-22. H-1…H-17 and N-1…N-15 are unchanged.

No new implementation ambiguity was introduced. Every rule that gained an "accepted" marker also gained or kept a concrete mechanism: O-16 names the matching keys, O-13 names the emitters, O-4(ii) names where the default is applied (the service, not the column), O-17 names the file and line of the enum group, and O-5 names the reconcile's four actions and their predicates.

---

## 9. Findings

### X-1 (LOW) — A-2 is assigned to Release 1 but asserts a Release-2 mechanism

§21.1's criterion list includes "A-1…A-4", so A-2 is Release 1. Its third clause reads: *"a three-decimal `m` or `s` entry is refused by `validateSetInput` at the input"*. `validateSetInput` lives in the workout card (`src/ui/workout/ExerciseCard.tsx:30-40`); §15.3 places its profile rules and `decimalPlaceCount <= 2` guard with the card, and §21.2 ships "workout card and history renderers per §15 **with the decimal guards**" while §21.1's Does-not-ship list names "logging UI".

This is the W-1 class in a criterion that was not split. It predates this pass and the second verification did not catch it. **Correction:** split as A-2a (R1: per-profile required/optional/forbidden acceptance and the numeric boundary rows, at the domain and server layers) and A-2b (R2: `validateSetInput`'s input-side guards), or annotate the clause *(R2)*.

### X-2 (LOW) — §0.1's O-9 row cites the wrong non-goal

O-9's "Where it binds" column reads "§6.2, §15.4, **N-4**". N-4 is "Personal records / bests per profile — reopen after one block of athletic logging". The non-goal bearing on derived speed is **X-14** ("Storing derived speed / pace"); O-9's own subject — not *displaying* it — is stated at §6.2 and §15.4, both of which now say "not displayed in v1 (O-9, accepted)". **Correction:** cite X-14, or drop the third site.

### X-3 (LOW) — §22's O-7 label still says "server-side"

§22's O-7 row offers "(b) columns + **server-side** contract acceptance dark". Every binding site now says something different and more accurate — §0 and §0.1 "the *acceptance* side of every contract widening", §21.1 "**acceptance-side widening of every shared contract**", §8.7 "'server-side only' is not available for them" — because V-2 established that `setSchemeSchema` and `prescriptionSnapshot` are shared `src/domain/**` modules that reach the client bundle.

The decision text a reader treats as "what the owner accepted" should not be narrower than the binding outcome. **Correction:** relabel §22's option (b) "acceptance-side contract widening (server validates; the widened shared schemas also reach the client, which still emits today's shapes)". This is a wording alignment, not a change of decision — §22's own trade-off column already explains (b) in the same terms.

### X-4 (LOW) — O-12 has no documentation obligation

O-12 fixes a **stored-meaning** rule: for a unilateral exercise, one set row records one side's reps / distance / duration with both sides performed (§7.2). Every other accepted decision with a persistence consequence is assigned to a document and a release in §24; O-12 appears in no row. Without it, `data-model.md` §2.14 will not say whether a unilateral carry's `distance_m` is one side or both — the same class of statement as its existing "0 = bodyweight-only", which the design elsewhere treats as load-bearing (H-12). **Correction:** add a §24.2 row assigning the convention to `data-model.md` §2.14 (or `domain-model.md` §7) in the release that ships the copy.

### X-5 (LOW) — two overstatements

- §11.6: *"in Release 1 the new codes and ordering exist in code but are unobservable, because no non-`load_reps` exercise and no `assistance` basis exists until Release 2."* A-11a and A-14 both build non-`load_reps` exercises through the API in Release 1 — the R1 selector is locked, so none is **athlete-creatable**, which is the accurate claim and the one §21.1 makes.
- §18.1's heading "Invariants (**proposed as binding** for implementation)" under a parent headed "Binding invariants and non-goals", now that §0.1 makes the accepted outcomes binding.

---

## 10. Verdict

The owner's acceptance is recorded exactly: seventeen decisions, three agreeing records, each restated as a rule at every site it governs, with the rejected alternatives demoted to rationale and clearly marked as such. No decision was altered, weakened or silently expanded. The conditional language is gone. §24 assigns every production-state amendment to the release commit that carries its code, describes nothing as implemented that is not, and — verified against the working tree — touched none of those documents today. O-17's amendment is exact down to the enum group, the exclusion list and the commit it lands in. W-1 through W-4 are closed, W-1 with more than was asked. Every earlier finding remains closed and the validated core model is intact.

The five residuals are one misplaced criterion clause, one wrong cross-reference, one stale label in a historical column, one missing documentation row for Release 2, and two words. They should be folded in, but none of them blocks the first commit.

**VERIFIED — READY FOR RELEASE 1 IMPLEMENTATION**
