# Athletic measurement profiles — Release 3 catalog revision: targeted verification

Date: 2026-09-08
Scope: targeted verification of the revision, not a re-review. Verifies the disposition of B-1, M-1, M-2 and L-1…L-8 from `docs/reviews/athletic-measurement-profiles-release-3-catalog-review.md`, plus confirmation that the ten previously reviewed entry literals are unchanged and still conform to the binding architecture. The architecture review was **not** restarted.

Subject: `docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md` (revised, 672 lines, up from 606).
Reference: `docs/reviews/athletic-measurement-profiles-release-3-catalog-review.md` (213 lines, verdict REVISION REQUIRED) — verified unmodified: same length, same eleven finding headings, still ending `REVISION REQUIRED`.
Owner input applied: **D-R3-1 accepted, option (a) — "Backward Sled Drag"**, with the originally authored movement definition and contributions.

## 0. Repository state

`git status --short` at the start of this pass:

```
 M CLAUDE.md
 D HANDOFF.md
 M docs/input/product-ideas.md
?? .claude/skills/
?? HANDOFF(depracted).md
?? docs/reviews/athletic-measurement-profiles-release-3-catalog-authoring.md
?? docs/reviews/athletic-measurement-profiles-release-3-catalog-review.md
?? docs/reviews/repository-agent-workflow-evaluation.md
?? docs/reviews/repository-agent-workflow-review.md
?? docs/reviews/warmup-routines-evidence-research.md
?? gpt-handoff.md
?? gpt-memory.md
```

`HEAD = 4865a02`, branch `main` — unchanged. Every pre-existing modification is preserved. This pass added exactly one untracked file, this document. **Nothing else was modified: not the authoring document, not the original review, not source, not tests, not configuration. No database was contacted; nothing implemented, committed, pushed or deployed.**

---

## 1. The ten entry literals are unchanged

The §5 `SeedCatalogExercise` block was extracted from the revised document and diffed against the block extracted from the pre-revision document in the original review pass. **One difference, in a comment, containing no data:**

```
-    // authored against. A forward harness drag assigns differently; see the
-    // authoring document §7.
+    // authored against, accepted by the owner as D-R3-1 (a). A forward
+    // harness drag is a different exercise and assigns differently; see the
+    // authoring document §4.2 and §7.
```

No `slug`, `name`, `equipment`, `mechanics`, `laterality`, `measurementProfile`, `loadBasis`, `volumeCounting` or contribution row changed on any of the ten. Re-running the original mechanical validation against the revised block:

| Check | Result |
| --- | --- |
| Entry count | 10 |
| `volumeCounting: "off"` at entry level | 10/10 |
| `strengthEstimate` at entry level | 0 |
| `loadStepKg` / contribution `weight` | 0 / 0 |
| `loadBasis` present | 5 — `total` ×3 (`other-sled-push`, `other-sled-drag`, `other-med-ball-slam`), `per_hand` ×2 (`other-farmers-carry`, `dumbbell-suitcase-carry`) |
| `laterality: "unilateral"` | 2 — `dumbbell-suitcase-carry`, `bodyweight-side-plank` |
| ≥ 1 primary per entry | 10/10 |
| Duplicate muscle within an entry | none |
| Leaf-only contributions | 10/10, no `back` |
| Contribution rows per entry | 3–5 |
| §4.11 summary table vs §5 literals | identical, row for row |

Conformance to the binding architecture is therefore carried forward intact: the ten O-10(i) slugs with their shapes verbatim, ADR-010 leaf-only contributions, §16's explicit-`volumeCounting` rule and `strengthEstimate` omission, R-4's default weights. Nothing here needed re-deriving.

---

## 2. Finding-by-finding disposition

### B-1 — D-R3-1 unresolved → **RESOLVED**

The decision is recorded as accepted, consistently, in every place it appears, with no pending choice left anywhere in the document:

- Header (`:10`): "**D-R3-1 is closed.** The owner accepted option **(a)** on 2026-09-08… It is no longer pending, and B-1 is discharged."
- §4.2 heading: "**direction accepted: backward (D-R3-1 (a), owner-accepted 2026-09-08)**"; the name row is the flat `Backward Sled Drag`, with the conditional "(recommended; see §7)" qualifier removed; the movement definition is relabelled "accepted, binding for the entry".
- §5 literal comment records the acceptance (the sole literal change, §1 above).
- §7 retitled "**ACCEPTED, option (a)**", "Status: closed", with (b) and (c) marked declined and their contribution sets replaced by *(not authored)* — the right call, since retaining live alternative row-sets is exactly what would keep the decision looking open. §7 closes: "**No decision remains open in this document.** All ten entries are settled."
- CR-1 struck through and marked Closed; §10 states the same; §11 logs it.

A grep for `recommend|pending|escalat|open decision|not settled` across the document returns only correct historical or unrelated uses (§7's "the review's B-1 recommended exactly this outcome", CR-7's "shared-exclusion-constant recommendation", §11's "moving from recommended to accepted"). **No stale conditional language survives.**

§7 additionally records that (b) and (c), if ever wanted, are new slugs under their own gate rather than an edit to this one, and grounds that in the ledger (`exercises.ts:49-57`) — correct, and a useful thing to have written down before the first seed.

### M-1 — `loadBasis` counted 4/6; §8.1 would seed `'unspecified'` on the slam → **RESOLVED, with one stale count remaining (R-1)**

The accounting is corrected where it governs:

- **R-6** rewritten as "a five/five split, not four/six", citing `LOAD_BASIS_REQUIRED` / `loadBasisRequired` (`profile.ts:113-126` — verified: `load_reps: true`, `load_distance: true`, `load_duration: true`), naming `other-med-ball-slam (load_reps, loadBasis: "total")` as the fifth loaded entry, and enumerating the five load-less entries individually. It also states the silent-failure mechanism the original finding rested on: omitting it resolves `'unspecified'` via `resolveLoadBasis` (`schema.ts:72-77`), satisfying the CHECK while contradicting O-10(i), made permanent by the ledger.
- **R-5**'s "six/three" corrected to "the **nine** non-`load_reps` entries — the four `load_distance` and the five with no load field" (4 + 5 = 9 ✓), with the slam separated out as the one entry where `'off'` is load-bearing.
- **§8.1** — the binding checklist item now reads "**`loadBasis` present on all five entries whose profile has a load field** — the four `load_distance` entries **and `other-med-ball-slam`, which carries `loadBasis: "total"`**", names the five load-less entries explicitly, and repeats the silent-failure warning.
- **§8.1 gains a new per-column verification item** against the seeded rows, not just the literal: `'total'` for the slam, sled push and sled drag; `'per_hand'` for the two carries; `NULL` for the other five. This is stronger than what the original finding asked for and closes the failure mode at the point it would actually be observed.

**Residual R-1 (LOW, non-blocking).** §8.4's fresh-database item (`:579`) still reads "`load_basis IS NULL` for the **six** load-less entries". There are five. This is the last surviving instance of the miscount M-1 named; a document-wide grep for "six" confirms it is the only one (the other two hits are R-6's own "not four/six" and §11's log entry).

Why it does not block: it cannot change what gets seeded. The governing instruction, §8.1, now states the rule correctly twice — once as the rule, once as a per-slug seeded-value enumeration listing exactly five NULLs — and no instruction attaches to §8.4's count. A verifier counting NULL rows on a fresh database finds five and is corrected by §8.1 two subsections above. Fix at implementation time: one word, `six` → `five`, at `:579`.

### M-2 — missed adductor-exclusivity assertion → **RESOLVED**

§8.2 gains a dedicated item that is more precise than the finding required, and — as the verification brief asks — updates the exclusivity clause without weakening anything else:

- Names the test exactly: `tests/unit/exerciseCatalog.test.ts:131-140`, quoting its title. Verified against the file: line 131 is that `it(...)`, line 139 is `expect(adductorSlugs).toEqual(["machine-hip-adduction"])`.
- Explains why it breaks (`bodyweight-shuttle-run` adds `adductors` secondary) and why the clause is a Release-2 artefact rather than an invariant.
- Gives the exact replacement, `["machine-hip-adduction", "bodyweight-shuttle-run"]`, and justifies the **order** from the §8.1 append-last rule. Verified: `machine-hip-adduction` is catalog entry #78 of 93, so with the athletic block appended it precedes `bodyweight-shuttle-run`, and `adductorSlugs` is built by filtering `EXERCISE_CATALOG` in order. The order is correct, and the doc's observation that this makes the assertion an incidental second guard on placement is right.
- **Explicitly protects the unrelated assertions**: `expect(entry?.name).toBe("Hip Adduction Machine")` and `expect(entry?.contributions).toEqual([{ muscleGroupId: "adductors", role: "primary" }])` at `:132-134` "still hold and must not be weakened or deleted". Verified line-exact — `:132` is the `find`, `:133` the name, `:134` the contributions.
- Requires a test rename so the title matches what it proves.

§4.6 now cross-references the item, closing the gap where the rationale celebrated the second adductor home without connecting it to the test.

### L-1 — trailing placement is a hard constraint → **RESOLVED**

§5's placement paragraph is rewritten as a constraint ("Placement is a constraint, not a preference: the block must be appended after the entire existing catalog"), citing `reconcileContributions.integration.test.ts:28` (`ORIGINAL_40_SLUGS = EXERCISE_CATALOG.slice(0, 40)`) and the assertions it feeds at `:194-195`. Verified: `:194` is `expect(summary.updated).toBe(7)`, `:195` `expect(summary.noop).toBe(7)`. The supporting claim that the "Phase 5.5 Light — 52 additions" marker "sits after exactly 40 entries" was checked by counting `slug:` keys — the marker falls after entry #40 exactly.

Promoted to a §8.1 checklist item requiring the ten to be the last ten elements, in §5 order, with no existing entry moved. Readability is now presented as the incidental benefit rather than the reason, which is the right ordering.

### L-2 — full-92 pre-v2 fixtures drift → **RESOLVED**

New §8.5 item requiring the ten R3 slugs be excluded from the pre-v2 slug set at `:161-163` and `:496-498`, "ideally from one shared exported constant so a Release-4 addition cannot reintroduce the drift". Verified: both sites build the set as every catalog slug except `machine-hip-adduction`, and `insertPreV2CatalogEntry` is at `:48-70` as cited. The item states honestly that nothing breaks today and gives the three reasons (column defaults, catalog-relative length assertions, reconcile counters unchanged) — matching what I traced in the original pass. Correctly framed as fixture honesty rather than a failure.

### L-3 — §8.7 overstated per-entry coverage → **RESOLVED**

The preamble now separates mechanism coverage from per-entry coverage explicitly ("The existing tests establish the mechanism, not per-entry coverage of the ten"), and — the part that makes the claim checkable — **names the actual exercise each cited test uses**. All five attributions verified against `tests/integration/seed.integration.test.ts`:

| Cited | Claimed subject | Verified |
| --- | --- | --- |
| `:154` | `EXERCISE_CATALOG[0]` | ✔ `:160` `const firstSlug = EXERCISE_CATALOG[0]` |
| `:172` | `barbell-back-squat` | ✔ `:178` |
| `:206` | `barbell-back-squat` | ✔ `:212` |
| `:241` | `bodyweight-plank` | ✔ `:247` |
| `:259` | `bodyweight-plank` | ✔ `:266` |

The slug-agnostic argument is stated as a mechanism argument and pinned to the decisive line (`exercises.ts:93`, the `!applied.has(item.slug)` filter — verified), with the honest qualifier "it is not evidence about these ten entries specifically". One athletic witness (`bodyweight-box-jump`, reusing the A-14/A-17 fixture) is added as its own checklist item, with a correct justification for why one is enough. This is a better disposition than the finding asked for — it does both halves rather than choosing.

### L-4 — the "as specified" caveat covered the wrong entry → **RESOLVED**

§6 now carries both disclosures. The added one is accurate on every element I checked:

- §10.3 locks `measurement_profile` only once the exercise is referenced by a `session_exercises` or `exercise_prescriptions` row — verified against the evaluation.
- The gate order for a `load_reps` / `per_hand` / `dumbbell` exercise: profile passes, basis passes (`per_hand` is not `assistance`), equipment passes (`dumbbell` ∈ `STRENGTH_ELIGIBLE_EQUIPMENT`, `constants.ts:137`) — verified against `eligibility.ts:48-62`.
- `strengthEstimate` omitted → `'auto'` default (`exercises.ts:117`) — verified.
- The twin's explicit `strengthEstimate: "off"` at `exerciseCatalog.ts:666` — verified line-exact.
- The read-time-gate framing quotes `eligibility.ts:26-30` ("editing it makes a whole series appear or vanish on the next read… flipping it back restores the series") — verified, near-verbatim.

The section keeps §16's omission mandate ("`strengthEstimate` stays omitted on all ten regardless") and correctly draws the boundary: adding `strengthEstimate: "off"` would contradict §16 and needs its own owner decision, so it is **not** proposed. That is the right disposition — it discloses without quietly reopening an accepted rule. CR-6 added to §9.

### L-5 — trunk bracing credited asymmetrically → **RESOLVED**

New bounded-assignment note under §4.1, scoped to §4.1, §4.2 and §4.4. It states the asymmetry plainly (the squat credits `abs` **and** `lower_back`; the sled entries take `abs` alone; the suitcase carry takes both), and gives a principled line: the erector row is carried only where resisting spinal or lateral flexion is a defining demand, not where the trunk merely stays rigid while the legs work. The supporting argument — that extending the squat's pair to most of the ten would inflate a leaf the volume screen renders without an RP reference band (ADR-010) — is correct and is a genuine reason rather than a rationalisation.

Critically, the note ends "**No contribution row is added or removed by this note**", and §1's diff confirms it: `other-sled-push` and `other-sled-drag` still carry `abs` alone. §4.1's rationale also drops its former "mirroring the squat and overhead-press convention for trunk bracing" clause, which was the half-application the finding pointed at; §4.2 now references the note instead of repeating it.

### L-6 — backward-drag rationale stated as mechanical fact → **RESOLVED**

The flat assertion is gone. §4.2 now reads "The catalog's convention for the backward drag credits it as knee-extension led, with the hip taking less of the work than in a forward drive", and adds the explicit hedge in bold: "**This is the catalog's convention for the movement, adopted so the drag and the push read differently in the library — not a measured claim about how the two variants distribute load**", pointing at §3 and matching the hedges §4.5 and §4.6 already carried. §7's grounds for (a) are reframed the same way ("under the catalog's conventions"). Consistent with `evidence-to-design.md` row 19's prohibition on reading a leaf assignment as an anatomical-stimulus claim.

### L-7 — bilateral laterality unargued against the L-9 precedent → **RESOLVED**

New rule **R-10a**. It does the three things the finding asked for: acknowledges the L-9 precedent by citation (`tests/unit/exerciseCatalog.test.ts:56-66` — verified, the walking-lunge `it.each` with the "load one leg at a time" comment), concedes the four alternating-gait entries share that property, and then justifies `bilateral` through O-12's *recording* consequence rather than through gait — a sprint has no left round and no right round, so a per-side reading of its distance or time would be meaningless.

**O-12 integrity — checked directly, since it was called out for verification.** No per-side rule is invented anywhere in the revision. R-10a closes with "**No per-side rule is introduced for any of the ten**: O-12's whole-set/round semantics are used exactly as written, and the two `unilateral` entries follow it unchanged." The two unilateral entries' own text is unchanged from the reviewed version and still matches §7.2 verbatim in substance: §4.4 "one set row records one side's distance with both sides performed — the entry does not model sides separately"; §4.10 "one set row records one side's hold time with both sides performed". No new column, no per-side row, no set-count doubling, nothing that touches N-11. **Passes.**

One wording nit, recorded as residual R-2 below.

### L-8 — citation drift → **RESOLVED**

Every corrected and newly added citation was re-checked against the source:

| Citation | Verified |
| --- | --- |
| `eligibility.ts:48-62` (`evaluateExerciseEligibility`) | ✔ function opens `:48`, returns eligible `:61` |
| `exercises.ts:49-57` (ledger-skip rule) / `:58` (`seedExerciseCatalogForUser`) / `:93` (the filter) | ✔ all three |
| `exercises.ts:110` (inline `slugToUuid`) and `:180-182` (`seededExerciseId`) | ✔ both, and the distinction is now drawn correctly |
| `muscleGroups.ts:13-31` (leaves), `:33` (rollup) | ✔ |
| `profile.ts:113-126` (`LOAD_BASIS_REQUIRED` / `loadBasisRequired`) — newly added for R-6 | ✔ |
| `eligibility.ts:26-30` (read-time-gate quote) — newly added | ✔ quote accurate |
| `exerciseCatalog.ts:666` (`strengthEstimate: "off"`) — newly added | ✔ line-exact |
| `exercises.ts:117` (`strengthEstimate` default) — newly added | ✔ |
| `exercises.ts:105-122`, `:140-161`, `:107-108`, `:115`, `:155` | ✔ (carried forward) |
| `exerciseCatalog.ts:15-51`, `:475-478`, `:480-483`, `:672-676` | ✔ |
| `reconcileContributions.integration.test.ts:28`, `:48-70`, `:161-163`, `:194-195`, `:496-498` | ✔ |
| `tests/unit/exerciseCatalog.test.ts:20`, `:43`, `:49`, `:56-66`, `:71`, `:131-140`, `:132-134`, `:142`, `:174` | ✔ |
| `tests/integration/seed.integration.test.ts:143`, `:154`, `:172`, `:206`, `:241`, `:259`, `:353`, `:438` | ✔ |

**No citation drift remains.** §1.1's source table was also updated to add the `profile.ts` and ledger/id rows, so the inputs list matches the argument the document now makes.

---

## 3. Cross-cutting consistency

| Check | Result |
| --- | --- |
| Prose, §4 tables, §4.11 summary and §5 literals agree on all ten | ✔ — re-derived from the literals and compared cell by cell |
| Header status, §0, §7, §9 CR-1, §10 and §11 agree that nothing is pending | ✔ |
| Checklist §8.1–§8.9 internally consistent | ✔ except R-1 (§8.4's "six") |
| §11 revision log matches what actually changed | ✔ — each row spot-checked against the diff; no change is claimed that was not made, and no change was made that is unlogged |
| §1.2 working-tree statement matches reality | ✔ — the added paragraph correctly records that the tree now also carries this document and the review, and that the revision edits only the authoring file |
| Accepted architecture reopened? | No. O-10(i)'s shapes, O-4(i)/(ii), O-12, §16's omission and explicit-`volumeCounting` rules, ADR-010 all applied as written; §6 explicitly declines to propose the one change that would contradict §16 |
| Unrelated checks weakened anywhere? | No. The only test change instructed is the adductor expected-set, with the surrounding assertions explicitly protected; every other checklist item extends coverage rather than relaxing it |

---

## 4. Residuals

| Id | Severity | Item |
| --- | --- | --- |
| **R-1** | LOW | §8.4 (`:579`) still says "`load_basis IS NULL` for the **six** load-less entries"; there are five. Last surviving instance of M-1's miscount. Cannot affect what is seeded — §8.1 states the rule correctly and enumerates the five by name, plus a per-column seeded-value check. Fix at implementation: `six` → `five`. |
| **R-2** | Informational | R-10a's clause "one set row holds one side's work, with both sides performed, and the athlete repeats the set for the other side" is loose in isolation — "repeats the set" could be misread as implying a second row. The surrounding sentences, the rule's own closing statement, and §4.4/§4.10's unchanged O-12 wording leave no actual ambiguity. No change required; worth a lighter phrasing if the section is touched again. |
| **R-3** | Informational | CR-7 correctly discloses that neither the append-last constraint (L-1) nor the pre-v2 fixture exclusion (L-2) is enforced by a test today. The adductor expected-set (M-2) does give the placement rule an incidental guard, as §8.2 notes. Carrying both as checklist items is the proportionate response for a single-user app; no further mechanism is warranted at this scale. |

No residual is blocking. No owner decision is open.

---

## 5. Conclusion

B-1, M-1, M-2 and L-1 through L-8 are all addressed. B-1 is closed by an owner acceptance that is recorded consistently in every location, with no conditional language surviving. M-1 and M-2 are corrected where they govern the implementation, and in both cases the revision does more than the finding required — a per-column seeded-value verification for the `loadBasis` split, and an exact expected set with explicit protection of the unrelated assertions for the adductor test. The eight LOWs are folded in with accurate, individually verified evidence; L-3 and L-5 in particular are answered with checkable facts rather than assurances.

The ten entry literals are unchanged apart from one comment carrying the owner's decision, and still conform to O-10(i), §16, O-4(i)/(ii), O-12 and ADR-010. One LOW residual remains — a single stale word in §8.4 — which cannot reach the seeded data and is contradicted by the binding checklist item two subsections above it.

O-10(ii)'s authored-list gate is satisfied: the list is complete, leaf-only, reviewed, and every entry is settled.

---

APPROVED — READY FOR RELEASE 3 IMPLEMENTATION
