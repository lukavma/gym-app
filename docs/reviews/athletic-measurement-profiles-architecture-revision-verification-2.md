# Athletic Exercise Measurement Profiles — second targeted architecture verification (PI-005)

**Date:** 2026-09-07
**Verified:** `docs/reviews/athletic-measurement-profiles-architecture-evaluation.md`, second revision (947 lines; second correction log in its §26)
**Finding authority:** `docs/reviews/athletic-measurement-profiles-architecture-revision-verification.md` (V-1 HIGH, V-2…V-4 MEDIUM, V-5…V-9 LOW)
**Earlier lineage:** `…-architecture-review.md` (BLOCKER-1…3, HIGH-1…4, MEDIUM-1…7, LOW-1…10) → first revision → first verification
**Baseline:** working tree at `05982f6`, migrations `0000`–`0012`
**Scope discipline:** the evaluation, the original review and the first verification were **not** modified; no production code, migration, test, seed or architecture document was touched; no owner question was decided. Nothing was committed, pushed or deployed; production was not contacted.

---

## 0. Verdict

**VERIFIED — READY FOR OWNER DECISIONS.**

V-1 through V-9 are closed exactly, and V-1 — the one that mattered — is closed better than the correction required. The comparison is now profile-only, the stale basis applies and freezes the derived value, the stale profile still rejects, and **NC-14 carries a mutation witness that fails the moment anyone re-adds `loadBasis` to the comparison**. §10.1, §10.2, §12.2, §12.3, §13.2, I-14 and A-18 all say the same thing in the same terms; the three-way contradiction the first verification found is gone.

Every earlier finding remains closed — I re-checked BLOCKER-1's bounds in all five sites, the Release-2-only reconcile, the mirror FK, the rollback matrix, the `continue` refusal path and the I-13 boundary rule — and the validated core model is untouched. No owner decision was silently made: O-17 was added as an undecided three-option decision, all seventeen entries still carry only a *Recommendation*, and the document contains no acceptance language.

Four residuals remain, none of which can change an owner answer:

- **W-1 (MEDIUM, pre-implementation).** V-2's fix moved the shared-schema widening into Release 1, and two acceptance criteria did not follow it: A-6 (`formatScheme`) and A-11 (the prescription write-side gate) are still assigned to Release 2 although the code they cover must ship in Release 1. `formatScheme`'s current body **will not type-check** against the widened union — verified against the file.
- **W-2, W-3, W-4 (LOW).** I-3 claims database enforcement for the slot *basis* freeze that no constraint provides; §9.4 still names only the profile as the authoritative typed column; and O-17's conditionality markers are thinner than those of the comparable decisions.

These are release-annotation and wording precision. They belong in the Release-1 implementation gate, not in the owner-decision gate: the seventeen decisions are complete, mutually consistent and answerable as posed.

---

## 1. Method

Each of V-1…V-9 was re-derived from the evaluation body, never from its §26 correction log. Every newly added or changed cross-reference was resolved; `NC-1…NC-14`, `O-1…O-17` and `A-1…A-25` (with the new `a`/`b` splits) were audited for definition and dangling references; the earlier corrections were re-read to confirm this round did not reverse them; and every repository claim the new text makes was opened and checked, including the one that decides W-1 (`src/domain/schemes/setScheme.ts:69-72`).

The first verification's live-PostgreSQL probes are not repeated: §6.1, §8.3, §9.1, §12.2 and NC-4 are byte-identical on the numbers those probes established, which I confirmed by locating every `99999.99` and `100000` occurrence in the document.

---

## 2. Disposition of V-1 … V-9

### V-1 (HIGH) — stale `loadBasis` applies, stale `measurementProfile` rejects — **CLOSED, exactly**

The prompt's first question is the one this finding turned on. Every site now says the same thing:

| Site | What it says |
|---|---|
| §10.1 step 2 | "**compares only `measurementProfile`** … **The payload's `loadBasis` is ignored on insert**: the slot's `load_basis` is always the value derived from the live exercise row." |
| §10.1 rationale | "`load_basis` is deliberately **not** locked (§10.3 …), so a basis that changed between an offline session start and the outbox flush is an ordinary, permitted event that **must apply**, not a disagreement" |
| §10.1 closing | "A **basis** change after the bundle was cached is permitted for both slot kinds and simply results in the slot freezing the newer basis." |
| §10.2 | "Same derivation and the same **profile-only** comparison." |
| §12.2 | "`loadBasis` is **validated for shape but never read** — it exists only to keep the full-row builder's key set fixed (§12.3)" |
| §12.3 | "must **always** emit them — `loadBasis` included, even though the server ignores its value on insert (§10.1) — so its key set stays fixed" |
| §13.2 | new row: the permitted basis edit → "the slot op **applies** … every set op applies; history shows the newer basis label for that session (NC-14)"; marked "n/a — not a failure" |
| I-14 | "the payload `loadBasis` is **never compared and never written**" |
| A-18 | "with a disagreeing `loadBasis` only → **applies**, and the stored slot basis equals the live exercise row's (NC-14)" |

Two things make this a genuinely exact closure rather than a wording patch:

1. **The key is kept for the right reason.** Dropping `loadBasis` from the payload would have varied `sessionExerciseFullRowOp`'s key set, which is precisely the W-1 subsumption hazard H-7 governs. Keeping it, always emitting it, and stripping it of authority preserves the fixed key set while removing the rejection. That is the correct trade, and §12.3 states it explicitly.
2. **NC-14 is load-bearing.** It asserts all three cases (basis-changed applies with the derived value stored and its set ops applying; profile-changed rejects `measurement_profile_mismatch` with its set ops rejecting `not_found` and nothing written; neither key present derives silently) and adds: *"Mutation witness: making the comparison include `loadBasis` turns the first case into a rejection and fails the test."* That is a regression guard on the exact defect, not a restatement of it.

Feasibility re-checked: the fixture NC-14 needs is constructible in PGlite — the basis case uses a `load_reps` exercise edited `unspecified` → `per_hand` (permitted with history, §10.3), and the profile case correctly notes it is "only possible on an unreferenced exercise", which is what the mirror FK and the §10.3 lock jointly guarantee.

### V-2 (MEDIUM) — Release 1 widens the shared schemas without exposing editor support — **CLOSED**

The technical reason is now stated correctly rather than assumed. §8.7: *"`src/domain/schemes/setScheme.ts` and `src/domain/schemas/prescriptionSnapshot.ts` are imported by server, sync and UI alike, so 'server-side only' is not available for them — the editor simply does not offer the variants until Release 2."* §21.1 ships "**acceptance-side widening of every shared contract** … the two scheme variants in `setSchemeSchema`; the snapshot `measurement` key … all of these live in `src/domain/**`, which server, sync and UI import alike, so they reach the client bundle too, while the client's emitters, DTO types, IndexedDB shapes and the editor's offered options are unchanged." The Does-not-ship list now reads "scheme variants **in the editor**", and §21.2 ships "the scheme variants **offered in the editor** (the schema already knows them from R1)". §0 carries the same framing.

Crucially, §14.5's Release 2 → Release 1 row is rewritten and now traces the real path: *"Because the Release-1 `setSchemeSchema` already knows `distanceRounds` / `durationRounds`, a template holding such a prescription still **starts** (`buildSessionExerciseUpsertPayload` → `prescriptionSnapshotSchema.parse` succeeds; `buildTodayBundle` never validated the stored scheme anyway, `today/service.ts:519`)"* — and it states the dependency out loud: *"**This row is only true because R1 ships the widened scheme schema** — with the schema held back, the R2 → R1 case would be §13.2's 'old client, new bundle with a `distanceRounds` prescription': the builder throws and the workout cannot start."* Both halves match what I traced in the repository in the first verification.

**Editor exposure is structurally impossible in R1, not merely omitted.** The R1 editor keeps today's two hard-coded options (the §15.2 compatibility-driven select ships in R2), and even if it were driven by `profileSupportsScheme`, every R1 exercise is `load_reps`, for which §9.2 forbids both new variants. Two independent reasons, either sufficient.

Residual: see W-1 — two criteria did not follow the code into R1.

### V-3 (MEDIUM) — release mapping — **CLOSED** for all four items named

| Item | Fix | Verified |
|---|---|---|
| A-5 contained R2's NC-13 | split into **A-5a** (NC-1 W-1 builders + server key lists, NC-9, NC-10, NC-11 unit halves) *(R1)* and **A-5b** (NC-1 client emission, NC-13) *(R2)* | ✓ §21.1 lists A-5a, §21.2 lists A-5b |
| A-9 contained R2's NC-6/NC-7 | split into **A-9a** (NC-2, NC-3, NC-4 service half, NC-14) *(R1)* and **A-9b** (NC-6, NC-7) *(R2)* | ✓ |
| A-3 needed the new scheme variants | annotated *(R1)* with the reason: "executable in Release 1 because R1 ships the widened `setSchemeSchema`, §21.1" | ✓ |
| A-12 needed the variants | annotated *(R1)*: "the fixture inserts such a prescription row directly, since the R1 editor does not offer it" | ✓ |
| A-14 named an R3 seeded slug | rewritten as "a **hand-built `reps` exercise** (created through `createExercise` without `volumeCounting`…) — no seeded slug, since no athletic catalog entry exists before R3", with the seeded assertion moved to A-17's R3 row | ✓ |

§21.1's and §21.2's criterion lists were re-pointed and now partition A-1…A-25 with no item in both and none missing.

### V-4 (MEDIUM) — the ADR-011 amendment is an undecided owner decision — **CLOSED**

§11.6 is retitled "**Proposed** amendment … (explicit; owner decision O-17)" and opens: *"**The amendment is not settled by this document**: it is posed as O-17 with the recommendation below and two alternatives, and nothing in Release 1 may reorder the refusal list or extend the enum until O-17 is decided."* O-17 offers three real options — (a) accept as written, (b) add the codes but keep "category code wins", (c) add no codes and refuse under the existing `EXERCISE_CATEGORY_UNSUPPORTED` — each with an honest trade-off, including the observation that (c) would tell the athlete "not available for this equipment type" about a barbell-equipment carry, which is false. The header now reads "ADR-011 is **amended in two named clauses**" only as a proposal routed through O-17; §21.1 ships "the eligibility gate with **whichever code placement O-17 selects**"; §24's e1RM-revision row reads "as decided by O-17 (under option (c) only D-11 is recorded)".

The structural gate is identical under all three options, so O-17 changes only which code and which copy line the athlete sees — correctly stated, and it is why deferring the decision costs the design nothing.

### V-5 (LOW) — stale cross-references — **CLOSED**

§13.4 now reads "either way **A-23 and A-25** assert what the athlete sees"; R-5's mitigation now cites **A-25**. Both re-checked in place.

### V-6 (LOW) — NC-10 — **CLOSED, and improved**

The ill-posed clause is gone and replaced by two assertions plus an explicit non-vacuity requirement:

> (a) output for the full mixed fixture **equals** the output for the same fixture with every non-`load_reps` slot removed — the load-bearing detector, since a `duration` set mapped as `0 kg` would change `modalWorkingLoad`, `classifySet` and the volume count; (b) the number of mapped domain rows (`PerformedSet`, `StrengthSetInput`, `WorkSetContributionRow`) **equals** the count of non-warm-up rows on `load_reps` slots in the fixture; the fixture's `load_reps` rows include a legitimate single and a legitimate `0 kg` bodyweight set so (a) and (b) are not vacuous on realistic data.

(a) detects a fabricated value, (b) detects a leaked row that happens not to change an aggregate, and the fixture requirement forbids the escape route of choosing data that cannot collide. This is a stronger control than the one it replaces.

### V-7 (LOW) — the `?? 0` coalesce — **CLOSED**

§11.3 site 3 now reads: *"**replace** the `weightKg ?? 0` coalesce with an explicit null skip beside the existing `if (row.setNumber === null) continue;` (`:190`) — `row.weightKg` becomes `number | null` while `StrengthSetInput.weightKg` stays `number` (`types.ts:26-32`), and a `WHERE` clause or `.filter()` does not narrow the type, so the skip is what makes it compile without a cast."* The type reason is exactly right and forecloses the cast an implementer might otherwise reach for.

### V-8 (LOW) — `volumeCounting` catalog scope — **CLOSED**

§16 gains a dedicated paragraph: the `SeedCatalogExercise` type keeps `volumeCounting?` **optional** on the `strengthEstimate?` precedent; the requirement is "by authoring rule, not by type" for new Release-3 athletic entries and the three legacy Release-2 entries; the ~90 existing entries are untouched; and a Release-3 unit test asserts the authoring rule. Unambiguous.

### V-9 (LOW) — `SyncRejectReason` — **CLOSED**

§12.2 gains a "Reject-reason vocabulary" paragraph naming both additions, their triggers, and that both surface as `deadReason` on the sync-issues screen and — under O-16 — on the card and banner. I-6 records that "the only change to the reject vocabulary is the two added `SyncRejectReason` members"; A-18 asserts they appear as `deadReason`.

---

## 3. Earlier findings and the core model

### 3.1 Nothing from the earlier rounds regressed

Re-checked directly, not inferred:

| Earlier correction | Still in place |
|---|---|
| BLOCKER-1 bounds | `99999.99` in §6.1 (twice), §8.3's DDL, §9.1's scheme variant, §12.2's wire, NC-4's boundary row, X-22. Every remaining `100000` occurrence is explanatory ("a `100000` bound would be unreachable") ✓ |
| BLOCKER-1 mapping | `23514` **and** `22003` → `invalid_measurement` in §12.2 and I-8 ✓ |
| BLOCKER-2 reconcile | §14.3 still headed "Seed reconcile — **Release 2 only**"; I-11 still binds "ships in Release 2, never in Release 1" ✓ |
| BLOCKER-2 mirror FK | §8.1's `uq_exercises_id_profile`, §8.2's `fk_session_exercises_exercise_profile`, §10.3's database-guarantee sentence, NC-5's both-FK control ✓ |
| BLOCKER-3 | §14.5's four-row matrix intact, R2 → pre-`0013` still "**unsupported**", the always-emit cost still its own row, O-13 unchanged ✓ |
| HIGH-1 | O-4 split, `'off'` creation default for `reps`, §16's `volumeCounting: off` on all three athletic `load_reps`/`reps` slugs, the legacy carry's `volume_counting = 'off'` in §14.3, A-14 + NC-11 ✓ |
| HIGH-2 | `continue` refusal, X-19/X-20, I-13's five sites, I-6's frozen list ✓ |
| HIGH-3 | `weightKg` still without `multipleOf`; O-15 unchanged ✓ |
| HIGH-4 | §21.1's observable-nothing paragraph intact and now stronger ("no prescription can be created with a new variant") ✓ |
| MEDIUM-1 | §12.3's "This rule is not a W-1 control" paragraph and H-7's disclaimer intact ✓ |
| MEDIUM-2…7, LOW-1…10 | spot-checked; §12.1's defaults, §11.6's code placement, §24's eight rows, §10.1's user-scoped select, §13.4, §5.3's excluded shapes, §8.3's "no separate enum CHECK" note all present ✓ |

### 3.2 The validated core model is intact

Untouched by this round: the six-profile vocabulary and its §5.3 conventions; §5.2's representation comparison; `load_basis` as a label and a gate with no arithmetic (I-4); §7.2's unilateral convention; §8.3's shape CHECK and set-level composite FK; §8.6; `PrescriptionSnapshot` at `v = 1` and `SCHEME_ENVELOPE_VERSION` at 1; §11.4's placement argument; the rejected-alternatives list X-1…X-22. The only §8.7 change is additive and explanatory. H-1…H-17 and N-1…N-15 are unchanged.

### 3.3 Cross-reference integrity

`NC-1…NC-14` are each defined once in §13.5 and every reference resolves. `O-1…O-17` are each defined once in §22. `A-1…A-25` resolve, with `A-5`/`A-9` appearing bare only inside §26's description of the split. The two `A-19` uses remain contextually disambiguated (this document's criterion versus the e1RM revision's, the latter always introduced as "the e1RM revision's … A-19").

---

## 4. Residual findings

### W-1 (MEDIUM) — two acceptance criteria did not follow their code into Release 1

V-2's fix moved shared-schema widening into Release 1. Two criteria stayed behind.

**(a) `formatScheme` — certain, and verified against the file.** `src/domain/schemes/setScheme.ts:69-72` is:

```ts
export function formatScheme(scheme: SetScheme): string {
  if (scheme.type === "fixed") return `${scheme.sets} × ${scheme.reps}`;
  return `${scheme.sets} × ${scheme.minReps}–${scheme.maxReps}`;
}
```

Once `setSchemeSchema` is a four-member union, the fall-through branch narrows to `repRange | distanceRounds | durationRounds` and `.minReps` does not exist on the last two — `pnpm typecheck` fails. So Release 1 **must** change `formatScheme`; §9.1 evidently intends this ("`formatScheme` renders `4 × 20 m` and `3 × 60 s`" sits in the same paragraph as the variants). But **A-6**, the only criterion covering it, is assigned to Release 2 by §21.2. The same applies to `formatSetLine`, which §21.1 ships as part of `src/domain/measurement/*` (…, format) while A-6 tests it in R2.

**(b) The prescription write-side gate has no release assignment.** §21.1's ships list covers the exercise-definition schemas, the read-side gates and the acceptance-side contract widening, but never names `checkPrescriptionCompatibility`'s third argument, `createPrescriptionSchema`/`updatePrescriptionSchema` variant acceptance, or §9.3's per-profile field rules. Yet §21.1's own observable-nothing paragraph asserts "**no prescription can be created with a new variant**" — which, since R1's `setSchemeSchema` accepts `distanceRounds` and §9.2 gives `manual` support for it, is true only if the profile-aware gate ships in R1. **A-11**, the criterion that would prove it, is assigned to Release 2.

**(c) A small consequence of (b).** With `setSchemeSchema` widened in R1 and the write-side gate absent, `inputsSummarySchema.prescribed.scheme` — whose *definition* I-6 correctly calls unchanged — transitively accepts a `distanceRounds` value, so a `recommendations` row could store one (reachable only by a direct API call creating an incompatible prescription, then completing a session, and only producing an `unsupportedSchemeDraft`). Shipping the gate in R1 forecloses it and keeps I-6 true of the accepted language as well as the definitions.

None of this is a design defect, a data-safety issue, or an input to any owner decision: §21.1's own text determines the intended answer in both cases. It is the mirror of V-3 — a criterion assigned later than the code it covers rather than earlier — and it should be fixed for the same reason: otherwise the Release-1 review gate cannot assert two properties Release 1 relies on.

**Required correction.** Split A-6 the way A-5 and A-9 were split (A-6a `formatScheme` + `formatSetLine`, R1; A-6b the rendered history/card lines, R2, if any part genuinely needs the renderers); add the prescription write-side gate to §21.1's ships list and move A-11 (or its create/PATCH half) to R1.

### W-2 (LOW) — I-3 claims database enforcement the basis freeze does not have

I-3 reads: *"A slot's profile **and basis** are frozen at session start … and never updated — enforced by the database (the set-level composite FK refuses a parent update with children present)."* The set-level composite FK is `(session_exercise_id, measurement_profile)`; it protects the profile only. `session_exercises.load_basis` is in no constraint — deliberately, since the basis must stay editable at the exercise level and is excluded from the mirror FK for exactly that reason (§8.2, §10.3).

The behaviour is right: nothing writes the column after insert (§12.2 — the payload key is never read; the update path ignores it). Only the claim overreaches, and the document is otherwise scrupulous about this distinction (§10.3: "the `exercise_prescriptions` half of the lock is a service rule"). The wording predates this round; V-1's clarification that the basis is *not* locked makes it conspicuous. **Correction:** attribute the basis freeze to the service rule, the profile freeze to the FK.

### W-3 (LOW) — §9.4's authority sentence names only the profile

§9.4 closes: *"The typed columns on `session_exercises` (§8.2) are authoritative for the slot's **profile**."* After V-1 they are authoritative for the **basis** too — the slot stores the derived value, and both §13.2's new row ("history shows the newer basis label for that session") and §15.4 ("History detail shows the frozen profile and basis labels **from the typed columns**") depend on that. The snapshot's `measurement.loadBasis` can now differ from the column when a permitted edit lands between freeze and flush; nothing reads it (the e1RM gate is exercise-level, and `evaluateSession` reads only `measurement.profile`), so this is wording, not behaviour. **Correction:** say "profile and basis", and note that the snapshot's `loadBasis` records what the athlete saw at start and carries no authority.

### W-4 (LOW, polish) — O-17's conditionality markers are thinner than its peers

O-4(ii), O-13, O-14 and O-16 each carry a "(recommended, O-nn)" marker at their primary in-body site. O-17's recommendation is written into the body at §8.7, §11.3, §12.1 and §23 as two new refusal codes; three of those cite §11.6 (where the conditionality lives) and §23's summary line does not. §11.6's blanket sentence — "A-4 and A-15 are written against whichever option is chosen" — covers the criteria adequately. **Correction:** add the "(O-17)" marker at §11.3 and §23, matching the convention the other four decisions follow.

---

## 5. The specific confirmations requested

| Question | Answer |
|---|---|
| Stale `loadBasis` ignored/derived while stale `measurementProfile` rejects | **Yes**, in nine consistent sites, with NC-14's mutation witness guarding the regression (§2, V-1) |
| Release 1 genuinely widens the shared schemas without exposing editor support | **Yes** — §8.7 gives the correct reason (shared `src/domain/**` modules), §21.1 ships acceptance-side only, and editor exposure is blocked twice over. Residual: two criteria did not follow (W-1) |
| Every acceptance criterion executable in its assigned release | **Almost** — V-3's four are fixed and annotated; A-6 and A-11 are now assigned later than the code they cover (W-1) |
| The ADR-011 amendment is an undecided owner decision | **Yes** — O-17, three options, recommendation only; §11.6 retitled "Proposed" and explicitly not settled; §21.1 and §24 conditioned on it |
| NC-10 and the new negative controls are load-bearing | **Yes** — NC-10 now pairs an output-equality detector with a mapped-row-count check and forbids a vacuous fixture; NC-14 asserts all three cases and fails under the mutation that would reintroduce V-1; NC-4's boundary rows and NC-5's dropped-constraint controls are unchanged and still anti-vacuous |
| Release, sync-reason, catalog, null-handling and cross-reference wording agree everywhere | **Yes for sync reasons** (§12.2 / I-6 / A-18), **catalog** (§16 / §14.4 / A-17), **null handling** (I-13's five sites, §11.3 site 3's type reason, §11.3 site 5's `?? null`) and **cross-references** (no dangling ids; V-5's two fixed). **Release wording** has the two W-1 gaps, and three minor wording items sit in W-2…W-4 |

---

## 6. Owner decisions

**Complete, mutually consistent, and none decided.** §22 holds seventeen entries (O-1, O-2, O-3, O-4(i), O-4(ii), O-5, O-6, O-7, O-8, O-9, O-10(i), O-10(ii), O-11, O-12, O-13, O-14, O-15, O-16, O-17), each with a *Recommendation* and a *Trade-off* column and no acceptance marker anywhere in the document (a search for acceptance language returns nothing). The document ends `READY FOR SECOND TARGETED ARCHITECTURE VERIFICATION`.

Consistency spot-checks across decisions: O-7(b) presupposes exactly the R1 acceptance-side widening §21.1 describes and O-13's profile-scoped emission; O-13's rationale references §14.5's matrix, which in turn is written for O-7(b); O-14's mirror FK is what makes O-3's lock half a database guarantee and what makes §13.2's deploy-window row true; O-4(ii)'s `'off'` default is what A-14 and NC-11 assert; O-17 is independent of all of them because the structural gate does not change under any of its options. No decision's recommendation contradicts another's, and none of W-1…W-4 depends on how any of them is answered.

---

## 7. Required corrections (before Release 1 implementation, not before owner decisions)

1. **W-1** — split A-6 into an R1 half (`formatScheme`, `formatSetLine`) and an R2 half; add the prescription write-side gate (`checkPrescriptionCompatibility`'s profile argument, the prescription schemas' variant acceptance, §9.3's field rules) to §21.1's ships list and move A-11 or its create/PATCH half to R1.
2. **W-2** — attribute the slot *basis* freeze to the service rule in I-3; keep the FK attribution for the profile.
3. **W-3** — §9.4: the typed columns are authoritative for profile **and** basis; the snapshot's `loadBasis` carries no authority.
4. **W-4** — add the "(O-17)" marker at §11.3 and §23.

---

## 8. Verdict

The finding authority's nine items are closed exactly and coherently, and the one that carried real risk is closed with a regression guard rather than a wording change. Every earlier finding remains closed, the validated core model is intact, no unenforceable guarantee was added this round (W-2 corrects one that predates it), the negative controls detect the failures they name, and no owner decision was silently made — the decision surface grew by one and remains entirely open.

The four residuals are release-annotation and wording precision. They must be fixed before Release 1 is implemented so its review gate can assert what Release 1 relies on, but none of them changes the design, affects data safety, or bears on any of the seventeen decisions the owner is being asked to make.

**VERIFIED — READY FOR OWNER DECISIONS**
