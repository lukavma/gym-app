# Exercise catalog expansion — targeted revision verification (Catalog Expansion 1)

Date: 2026-09-09
Verifier: the author of `docs/reviews/exercise-catalog-expansion-review.md` (2026-09-09, REVISION REQUIRED), verifying the revised `docs/reviews/exercise-catalog-expansion-evaluation.md` against those findings.
Repository state: branch `main`, `HEAD = 56ec000`. `git status` inspected first and re-checked at the end — unchanged apart from this new file. The evaluation grew 1115 → 1254 lines; the review (326 lines) is untouched, as the revision claims.
Scope: the §19 re-review scope only, plus an integrity check that the approved catalog did not move. The manifest, literals, deduplication, placement and migration analysis were **not** re-derived — they were found sound and are re-confirmed only for *identity* (§2 below). Accepted preferences (O-1…O-5, the 24 additions) are not reopened.
Owner input applied: D-CE1-1 accepted as option (a). Verified as recorded, not re-litigated.
Method: every citation the revision added or changed was checked against the source at `HEAD`. No implementation, no database, no commit, no push, no deploy.

**Verdict: REVISION REQUIRED — narrowly.** Sixteen of the seventeen required revisions are closed, several beyond what the review asked for, and the approved catalog is provably untouched. One fragment of H-1(2) survives in §16.2, where the exposure is still described as "cosmetic and read-only" — the exact characterisation the review required withdrawn and that D-CE1-1 was raised to displace. §18 and §19 both assert that removal is complete document-wide; it is not. Three one-line corrections close it. Nothing else needs re-derivation, and no re-review of the catalog is required.

---

## 1. Summary of disposition

| Finding | Disposition |
| --- | --- |
| **H-1** — wrong window analysed; failure mode wrong in both branches | **Closed on substance; one stale instance survives** (R-1) |
| **H-2** — RR-10 recorded as accepted with no owner decision | **Closed** |
| **M-1** — remedy is operational; blocker unstated | **Closed, and extended beyond the review's framing** |
| **M-2** — unknown-slug degradation | **Closed** |
| **M-3** — eligibility tally wrong | **Closed** |
| **M-4** — documentation footprint incomplete | **Closed, and better handled than proposed** |
| **L-1** … **L-10** | **All closed** (L-8 carries one incorrect sub-instruction — R-3) |
| **Integrity** — manifest, literals, order, measurement shapes | **Confirmed unchanged** |
| **Revision log** vs actual changes | **Accurate for what it lists; incomplete on H-1(2)** (R-1) |

Residuals: **R-1** (§16.2, the surviving "cosmetic and read-only"), **R-2** (§0's stale verdict row), **R-3** (§12.3's incorrect `:52` count instruction). R-1 is the reason for the verdict.

---

## 2. Integrity check — the approved catalog did not move

This was checked mechanically before anything else, because a revision that silently perturbed an approved literal would matter more than any prose finding.

All 24 `SeedCatalogExercise` literals were re-parsed out of §10 and compared field by field against what the original review verified:

- **24 entries**, in the §6 manifest order, positions 104–127, block order unchanged.
- **Slugs and names**: identical, all 24.
- **Equipment / mechanics**: identical — 15 compound / 9 isolation; barbell 3, dumbbell 7, cable 1, machine 2, bodyweight 7, other 4.
- **Laterality**: `unilateral` on exactly six — `dumbbell-lateral-lunge`, `dumbbell-reverse-lunge`, `dumbbell-single-leg-romanian-deadlift`, `cable-pallof-press`, `bodyweight-copenhagen-adduction-plank`, `other-med-ball-rotational-scoop-throw`. Unchanged.
- **Measurement shapes**: `load_duration` ×1, `duration` ×3, `reps` ×1, `load_distance` ×2, explicit `load_reps` ×1; `loadBasis` on exactly five (`per_hand`, `assistance`, `total` ×3); `volumeCounting` explicit on exactly eight; `strengthEstimate` omitted on all 24. Unchanged.
- **Contribution lists**: identical for all 24, including `bodyweight-tibialis-raise` = `tibialis` primary only, with no `calves` row in either role.

§6's manifest table, §7's shape table, §8's deduplication and §11.5's placement plan are unchanged in substance. §19's claim — "**No entry's slug, name, equipment, mechanics, laterality, profile, basis, counting or contribution list changed in this revision**" — is **confirmed true**.

---

## 3. Finding-by-finding verification

### H-1 — the two windows, rendering, unchanged-save and substitution behaviour

**Closed on substance.** §12.6 is rewritten as "Rollout exposure — two separate windows" and is accurate throughout. Every citation it added was checked:

| Claim in §12.6 | Verified against |
| --- | --- |
| Pipeline `db:migrate → db:seed → Deploy to Azure App Service`, one job | `.github/workflows/deploy.yml:105-123` ✓ |
| Window B unbounded by `skipWaiting: false` / `clientsClaim: false` | `src/app/sw.ts:339-340` ✓ — the citation is *more* precise than the review's own `:337-340` |
| Update is a deliberate tap only | `src/ui/ServiceWorkerUpdater.tsx:50-59` ✓ |
| Reads safe: cast not parse | `src/server/exercises/service.ts:151` ✓ |
| Reads safe: unknown slug matches neither branch and is dropped | `src/domain/volume/aggregate.ts:107-118` ✓ (loop at 108-119) |
| Rendering **blank, never the literal string**, via `join` | `ExerciseLibrary.tsx:98-101`, `muscleGroupDisplay.ts:11-14` ✓ |
| Two existing e2e assertions pin this symptom class | `muscleTaxonomyV2.spec.ts:156` and `:222` — both are `expect(await row.innerText()).not.toContain("undefined")` ✓ exact |
| Untouched save **preserves** `tibialis`; payload built from state, not DOM | `ExerciseForm.tsx:158-165`, `ContributionEditor.tsx:64-69`, `:79`, `ExerciseForm.tsx:184-186` ✓ |
| 400 path and its misleading message | `src/domain/exercises/schema.ts:177-180`, `ExerciseForm.tsx:295` ✓ |
| No offline/replay path — no `exercise` entity | `src/domain/sync/schema.ts:33-41`, `ExerciseForm.tsx:265-275` ✓ |

The three specific behaviours the brief asks about are all stated correctly and in the right direction:

- **Rendering** — blank, with the `Array.prototype.join` reason; the literal-`undefined` alternative is explicitly withdrawn.
- **Unchanged save** — round-trips `tibialis` correctly, because the payload comes from React state; the earlier "silent substitution" claim is explicitly named as wrong and withdrawn.
- **User substitution** — correctly identified as *the* hazard, with the picker reading "Select muscle…", `Calves` as the nearest plausible option, silent acceptance by the post-deploy server, and no reconcile to correct it.

**Explicit acknowledgement that new code cannot protect old bundles: present and unambiguous.** §12.6 carries a dedicated subsection, "Why no code in this commit can close Window B" — "The vulnerable artefact is the bundle already installed on the device. The code that misbehaves predates this commit, so nothing shipped in it can reach that code — this is a real constraint, not a preference". Repeated in §12.8's fourth non-goal, in §16.7's preamble, in RR-12 and in §18.

The withdrawn mitigation is explicitly withdrawn, with its reasoning: "'Do not edit Tibialis Raise until the app update is applied' is withdrawn as a mitigation. It relied on the athlete knowing which exercise was risky and why, at a moment when nothing on screen says so, and it left the failure undetected if ignored."

**Not closed:** one instance of the withdrawn language survives — see R-1.

### H-2 — the unowned acceptance

**Closed.** "Accepted" no longer attaches to the exposure anywhere:

- The header records **D-CE1-1 as a separate decision**, with the reason it exists ("O-5 decided that the leaf and the exercise ship, and the hazard was derived afterwards, inside a section written after that decision").
- §13 lists it apart from O-1…O-5 with the same explanation, and **narrows O-5's own row**: "This decision covers the vocabulary and the inclusion only — the rollout control is D-CE1-1."
- §12.6 opens by stating the removal: "what is accepted is D-CE1-1 option (a), the owner's decision on how to control the exposure, not the exposure itself".
- The §12.4 amendment's Rollout paragraph now **cites** the decision — "per owner decision D-CE1-1 option (a) — recorded in §13 of the expansion specification, **not asserted here**" — so ADR-010 cannot inherit an unowned claim. Confirmed: no "accepted" characterisation of the hazard remains in the amendment draft.
- Options (b) and (c) are recorded as declined, each with a reason.

A grep for the old formulations (`disclosed and accepted`, `and accepted, in the same spirit`) returns nothing.

### M-1 — operational controls, and they exceed the review's framing

**Closed.** §16.7 is now "Deployment checklist (D-CE1-1 controls, mandatory and ordered)", five numbered steps, prefaced with "The steps below are not advisory".

The brief asks for "concrete update controls for every client used with the account". Step 3 delivers exactly that, and it is **better than what the review asked for** — the review framed the control around the phone; the revision generalises it correctly:

> "Force the client update on *every* client used with this account, before opening the Exercise Library or Tibialis Raise. … **Enumerate the clients rather than assuming there is one** — a single-account app does not imply a single installed client, and each installed PWA or browser profile holds its own service worker and its own cached bundle. At minimum: the installed iPhone PWA, plus any desktop or laptop browser, any second browser profile, and any tablet the account has been signed into."

That is technically correct: a service worker registration is per origin *per browser profile*, so an unupdated second client stays in Window B regardless of what the phone shows. The per-client confirmation is observable ("open the exercise-create form and confirm the contribution picker offers **'Tibialis (Shin)'**"), and §16.8 adds the complementary check on the entry itself — that its picker shows Tibialis (Shin) as *selected*, not "Select muscle…". The new **RR-11** covers partial performance of step 3.

The brief also asks for "a post-deployment check of tibialis primary/1.0 with no calves contribution". Step 5 is exactly that, and is properly bounded:

> "confirm against production that `bodyweight-tibialis-raise` holds **exactly one contribution — `tibialis`, primary, weight 1.0 — and no `calves` row in either role**. Read-only, by the method and boundaries of the Release-3 pre-deployment check (`BEGIN TRANSACTION READ ONLY`, no writes, temporary firewall rule removed afterwards)."

It is correctly placed *after* acceptance, correctly justified ("the only step that would detect a substitution if one happened"), and carries a remediation note if it fires. The same check exists at §16.4 for the local database and at §16.5 for display.

Pipeline unchanged ✓; §16.3's "Not in this commit" now explicitly includes "any deployment-workflow change".

### M-2 — unknown-slug hardening

**Closed.** New §12.8 specifies both edits, and every constraint the brief lists is met:

- **Preserves existing values** — item 1 prepends the row's current unrecognised value as a **self-only** option; NC-B pins round-trip preservation "asserted on the payload, not the DOM", which is the correct place to assert it given the state/DOM divergence H-1 established.
- **Does not offer unknown slugs to new rows** — stated as the first explicit non-goal, with NC-C as the control, correctly anchored to the existing coexistence proof at `muscleTaxonomyV2.spec.ts:209` (verified: `expect(newRowOptions).not.toContain("Back")`).
- **Does not weaken server validation** — second non-goal, spelled out for both schemas, with NC-F as an integration-level negative control ("create with an unknown slug → 400; update introducing an unknown slug → 400; update carrying through an existing rollup row → accepted").
- **Does not change existing rollup rules** — third non-goal; NC-D pins both existing rollup e2e specs as must-pass-unchanged, NC-E pins the "Unclassified " prefix to rollups only so the fallback cannot turn an unknown slug into a pseudo-rollup.
- **Is not mistaken for a fix** — fourth non-goal, plus RR-12.

The fallback is correctly specified as `MUSCLE_GROUP_DISPLAY_NAMES[slug] ?? slug`, which also closes the `: string`-returning-`undefined` type-lie the review identified.

**Regression and negative controls are meaningful**, which is what the brief asks. NC-A…NC-F are six named controls with test levels assigned (NC-A/B/E unit, NC-C/D e2e, NC-F integration), and they cover the fallback's own claim, the property that makes it safe, the scoping guarantee, the untouched-behaviour guarantee and the two "does not" claims. NC-D naming the pre-existing specs as the regression surface is the right instinct — it pins the mechanism the generalisation was derived from. **RR-14** covers the risk the generalisation silently changes rollup behaviour.

Scope boundary amended to name the exception, and bounded correctly ("display-and-preservation only"); §12.7 gains a matching paragraph; both files added to §12.3 and §16.3; §16.4 requires the six controls to run.

### M-3 — eligibility tally

**Closed and independently re-counted.** §7's third note now reads "Thirteen are refused structurally; the other eleven are genuinely eligible", with both lists enumerated. Each refusal reason was re-checked against `src/domain/strength/eligibility.ts:48-62` and `STRENGTH_ELIGIBLE_EQUIPMENT` (`constants.ts:137`):

- Refused (13): C-18 `load_duration`; C-5 `assistance`; C-7, C-19, C-23 `duration`; C-22 `reps`; C-15, C-16 `load_distance`; C-8, C-21, C-24 bodyweight; C-10, C-17 other. ✓
- Eligible (11): C-11, C-12, C-14, C-1, C-13, C-2, C-9, C-4, C-20, C-6, C-3. ✓

Matches the review's count exactly, and is consistent with §7's own table. The other two notes in that bullet list were already correct and are unchanged.

### M-4 — documentation footprint

**Closed, and handled better than the review proposed.** The unqualified "complete set" claim is withdrawn with an accurate account of why it was wrong ("accurate for `src/` and `tests/` and inaccurate for documentation"). The list is now six documents, derived from ADR-010's own Consequences section rather than from the reviewer's grep — which is the right authority.

Two choices are better than what the review suggested:

- `implementation-plan.md:166/:177/:179/:185` are **annotated, not rewritten**, following the file's own `:95` precedent, with the reason stated: "Rewriting them would falsify the record of what those phases shipped." The review offered "extend or explain"; the revision found the third and correct option.
- `evidence-to-design.md:45` gains one clause and **no new evidence row**, with the reason: "Adding an evidence row would claim support this leaf does not have and does not need." That is consistent with §2's own framing and with the ADR amendment's discipline.

§12.4's supersession clause now enumerates all three ADR-010 sentences, including `:140`'s "five leaves display without reference bands" → **six**, which the review flagged as uncovered. It also does something the review did not ask for and should have: it addresses the **Rejected-alternatives "single deploy" entry** explicitly — not superseded, still correct for the case it decided, and decided around by D-CE1-1 rather than overruled. That is the right treatment of a prior decision record.

### L-1 … L-10

| Id | Verification |
| --- | --- |
| **L-1** | Closed. §9/C-11 now reads "exactly `barbell-deadlift`'s list with the `hamstrings` primary removed, and nothing else changed. `lower_back` is already primary on the deadlift (`exerciseCatalog.ts:85-97`), so no row is promoted here". Re-confirmed against source: the deadlift is `hamstrings` P, `glutes` P, `lower_back` P, `upper_back` S, `traps` S, `forearms` S. C-11 added to §15 with its criterion-5 basis stated. ✓ |
| **L-2** | Closed. §9/C-17 now states the two share `abs` P **and `front_delts` S**, and differ on the remaining rows (slam: `lats` P, `triceps` S; C-17: `glutes` S), resting criterion 2 on that difference and the plane of motion "not on disjointness". Matches the source exactly. ✓ |
| **L-3** | Closed. §12.6 states blank only, with the `join` reason; the literal-`undefined` branch is named as unreachable and withdrawn. ✓ |
| **L-4** | Closed. §16.4 rescoped to **value equality**, naming both legitimate upserts (`muscleGroups.ts:18-25`, `volumePresets.ts:158-179`) and stating why "touches no row" was the wrong assertion. The second-seed assertion is explicitly scoped to the vocabulary row set and catalog. ✓ |
| **L-5** | Closed, and the rule offered is principled rather than ad hoc: intrinsic alternation (C-22 — "the landing leg of one repetition is the take-off leg of the next, so a single-side bounding set is a different exercise") versus interleaved rounds of a one-sided movement (C-17 — "complete on one side"). Explicitly written "so a later author derives the same rule from the pair rather than either of two". ✓ |
| **L-6** | Closed. §11.6 makes the `adductors` assertion **order-insensitive** (Set or sorted comparison plus length), with the reasoning, and hands block order to the dedicated `CATALOG_EXPANSION_1_ENTRIES` contiguity assertion. ✓ |
| **L-7** | Closed. All three cap sites named — `:36` title, `:88-90` comment, with 17→18, 16→17 and 18→19 moving together — and `:66`'s `not.toContain("Back")` marked retain-verbatim. Verified: `:66` is exactly that assertion. The two rollup specs are additionally pinned as must-pass-unchanged. ✓ |
| **L-8** | Closed on coverage — all four sites named (`:15`, `:37`, `:52`, `:69`) — but one sub-instruction is wrong. See **R-3**. |
| **L-9** | Closed. §12.1 gains a paragraph confirming nothing implements display sections (both consumers iterate `LEAF_MUSCLE_GROUPS` in array order, no grouping component exists), so append-last is consistent with the code, plus a forward note that `tibialis` would belong to Legs if sections were built. ✓ |
| **L-10** | Closed, and strengthened. §16.8 requires confirming "the **muscle** shown, not just the name", noting the two entries credit opposite muscles (`glutes` vs `adductors`). ✓ |

---

## 4. Revision log accuracy

§19 maps all seventeen findings to changes and to sections. Every row was checked against the document body. **Sixteen rows are accurate.** The revision log is also honest in a way worth recording: it states that the reviewer's traces were re-verified before adoption "including the two that contradicted this document" (L-1 and M-3), and both were in fact corrected rather than argued.

**One row overstates.** The H-1(2) row says the withdrawn language was "removed from §12.6, RR-10, §18 and the §12.4 amendment's Rollout paragraph". That is true of those four sites — and the sweep stopped there. §16.2 was not in the re-review scope list at the end of §19, and its closing paragraph still carries the language. See R-1.

§19's own closing scope statement — "§6's manifest, §10's literals, §8's deduplication, §11.5's placement plan and §12.5's migration analysis are unchanged" — is confirmed true by §2 above.

---

## 5. Residuals

### R-1 (the reason for the verdict) — §16.2 still calls the exposure "cosmetic and read-only"

`docs/reviews/exercise-catalog-expansion-evaluation.md:1126`, the closing paragraph of §16.2:

> "The only cross-release concern is the deploy-window exposure of §12.6, which is **cosmetic and read-only** and does **not** warrant a second release."

This is the single surviving instance of the characterisation H-1(2) required withdrawn. It contradicts three places in the same document:

- §12.6, which withdraws exactly those words;
- RR-10, which says the exposure is "**Not** described as read-only or self-correcting";
- §18, which claims — verifiably falsely — that "'Read-only', 'self-correcting' and 'the length of one deploy' no longer appear as claims anywhere in this document — only in §12.6, RR-10 and §19 as the withdrawals themselves."

A grep confirms line 1126 is the only survivor, and that §18's statement is the only false claim it produces.

Why this matters rather than being cosmetic: §16.2 is the section a reader consults to answer "how serious is this, and why is one release enough?", and it sits inside the implementation-and-acceptance chapter an implementer reads end to end. Its *conclusion* (no second release) remains correct and owner-decided; only its *justification* is the withdrawn one. But a reader who lands there gets the pre-review answer to the exact question D-CE1-1 was raised to settle, which undercuts §16.7's insistence that steps 3 and 5 are "not advisory". A self-audit in §18 that asserts completeness incorrectly is worse than none, because the next pass will trust it.

**Required:** rewrite the paragraph's justification to match §12.6 — the cross-release question is settled by magnitude and by D-CE1-1, not by the exposure being cosmetic or read-only — and add §16.2 to §19's H-1(2) row and re-review scope.

### R-2 — §0's Verdict row is stale

`:41` still reads "| Verdict | READY FOR INDEPENDENT CATALOG REVIEW |", while §16.1 records that review as done and §19 closes with "READY FOR TARGETED CATALOG REVISION VERIFICATION". Cosmetic, but §0 is the summary table a future reader reads first.

**Required:** align §0's verdict row with §19's.

### R-3 — §12.3's `:52` instruction is incorrect

The `tests/unit/muscleGroups.test.ts` row instructs: `:52` (title "the other 14 pre-existing leaves keep their names" → **15**).

That is wrong. Verified against the source: the test at `:52` asserts display names for exactly fourteen leaves — `lower_back, chest, front_delts, side_delts, rear_delts, traps, biceps, triceps, forearms, abs, quads, hamstrings, glutes, calves` — which is precisely the set that pre-dates ADR-010 (v1's fifteen slugs minus `back`, which became the rollup). The three ADR-010 additions are asserted separately at `:69`. **`tibialis` is not a pre-existing leaf**, so the count of pre-existing leaves stays fourteen and that title does not change; the new `MUSCLE_GROUP_DISPLAY_NAMES.tibialis` assertion belongs with the `:69` group, which is exactly what the row's own `:69` note contemplates ("either keep it scoped to ADR-010's three and add a separate `tibialis` assertion, or retitle").

As written the two sub-instructions in the same table cell conflict, and following the `:52` one would misclassify the amendment's leaf as pre-existing. Low impact — it is a test title, caught in minutes — but it is a new error introduced by the L-8 fix, so it should not ship uncorrected.

**Required:** drop the "→ 15" and leave `:52` unchanged; place the `tibialis` display-name assertion with the `:69` group per that note.

---

## 6. Observations (no action required)

- **Line-range citations drift by ±1 in four places** — `muscleTaxonomyV2.spec.ts` `:69-87` for the leaves array (actual `:68-86`), `:88-90` for the cap comment (actual `:89-91`), and `:195-225` for the reclassify spec, whose closing `toHaveValue("lats")` and note-`toBeHidden()` assertions are at `:226-229`. None weakens anything: NC-D requires the *specs* to pass unchanged, and a spec passes or fails as a whole. The anchor assertions the text names by content (`:66`, `:156`, `:209`, `:222`) are all exact.
- **§12.8 item 1 says "replace the rollup-only special case".** Taken literally that could drop `currentRollup`, which also drives the amber "Unclassified Back — pick Lats or Upper Back, or leave as-is" note (`ContributionEditor.tsx`, asserted at `muscleTaxonomyV2.spec.ts:147`, `:160`, `:202` and `:229`). The revision guards this — "A known rollup keeps its existing `MuscleGroupDefinition` and its 'Unclassified …' label" — and NC-D/NC-E pin it from both directions, so the control is adequate. Worth one sentence in the implementation report confirming the note survived.
- **§12.1 still says "the reviewer should confirm the choice rather than assume it"** about append-last. That is now done (L-9); harmless as a historical sentence.

---

## 7. What is certified closed

So the next pass does not re-derive it:

- The 24-entry manifest, all §10 literals, block order, positions 104–127, and every measurement shape — **unchanged and confirmed** (§2).
- H-2, M-1, M-2, M-3, M-4 and L-1…L-10 — **closed**, with every new source citation verified at `HEAD`.
- H-1's analysis — **closed**: the two windows are correctly separated and correctly bounded; rendering, unchanged-save and user-substitution behaviour are all stated correctly; the offline/replay bound is stated; the "no code can protect an old bundle" acknowledgement is explicit in five places.
- D-CE1-1's three controls — **concrete and sufficient**: per-client enumeration and confirmation (§16.7 step 3), the post-deployment read-only tibialis check with the primary/1.0/no-calves shape (§16.7 step 5), and the forward hardening with six named regression and negative controls (§12.8).
- The ADR-010 amendment draft, its supersession clause, the six-document footprint, the fixture and assertion changes, and the acceptance instructions — **correct**.

The three corrections in §5 are confined to two sentences and one table cell. No section other than §0, §16.2 and §12.3's `muscleGroups.test.ts` row needs to be touched, and no part of the catalog, the literals, the controls or the ADR amendment is in question.

---

REVISION REQUIRED
