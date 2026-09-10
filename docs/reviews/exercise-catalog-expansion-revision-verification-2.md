# Exercise catalog expansion — second targeted revision verification (R-1, R-2, R-3)

Date: 2026-09-09
Verifier: author of `docs/reviews/exercise-catalog-expansion-review.md` and `…-revision-verification.md`, verifying the second revision of `docs/reviews/exercise-catalog-expansion-evaluation.md`.
Scope: **R-1, R-2 and R-3 only**, plus a non-regression check that the approved manifest and literals, the D-CE1-1 rollout controls and the ADR-010 amendment draft are unchanged. No previously closed finding is reopened and no part of the catalog review is repeated.
Repository state: branch `main`, `HEAD = 56ec000`. `git status` inspected first and re-checked after writing — unchanged apart from this new file. The evaluation grew 1254 → 1266 lines; both earlier reports (326 and 233 lines) are byte-unmodified.
Method: each residual re-checked in the document and, where it makes a claim about the code, against the source at `HEAD`. No implementation, no database, no commit, no push, no deploy.

**Verdict: APPROVED.** All three residuals are closed. The manifest, the 24 literals, the rollout controls and the ADR amendment are provably unchanged.

---

## 1. R-1 — §16.2's justification

**Closed.** The paragraph at `evaluation.md:1126` is rewritten. Its conclusion is preserved and its justification is replaced:

> "The only cross-release concern is the rollout exposure of §12.6 — which does **not** warrant a second release, but **not because it is minor**. Its Window B is unbounded and its worst case is a silent, permanent wrong write; what makes one release the right answer is magnitude against ADR-010's two-stage case (one brand-new row, nothing reconciled, no exercise with history touched), plus the D-CE1-1 controls that remove the window operationally and make an escape detectable. That is an owner decision, recorded in §13 — not a property of the exposure. **Any characterisation of it as cosmetic or read-only is withdrawn** (§12.6). This is the distinction the reviewer should check: the vocabulary-before-catalog dependency is an ordering constraint inside one seed run, and it is *separately* true that the rollout hazard between two builds is real and is controlled rather than absent."

This is what the brief asks for. One delivery is now justified through **scope** (magnitude against ADR-010's two-stage case, stated in its own terms) and the **accepted D-CE1-1 controls**, with the decision correctly attributed to the owner rather than presented as a property of the hazard. The withdrawn characterisation is retired *in place*, so a reader who lands only on §16.2 cannot pick up the pre-review answer. The paragraph also now separates the two claims it previously ran together — the intra-`runSeed` ordering constraint and the inter-build rollout hazard — which is the distinction §16.2 exists to draw.

**The withdrawn language no longer appears as a claim anywhere.** A full sweep of the document for `cosmetic`, `read-only`, `self-correcting` and `length of one deploy` returns eleven hits, every one legitimate:

| Where | Sense |
| --- | --- |
| `:967` (§12.4), `:1006` (§12.6), `:1126` (§16.2), `:1204` (RR-10), `:1220` (§18), `:1235` and `:1260` (§19, §19.1) | the withdrawals themselves, or descriptions of them |
| `:1055` (NC-B) | "safe rather than merely cosmetic" — about the §12.8 control, unrelated sense |
| `:17`, `:972`, `:1076`, `:1162`, `:1172` | "read-only **verification**" / "read-only" collision check — the D-CE1-1(ii) and §16.6 *methods*, an entirely different sense |

**§18's completeness claim is now true**, and it records its own history rather than quietly correcting itself:

> "… no longer appear as claims anywhere in this document — only in §12.6, §16.2, RR-10 and §19 as the withdrawals themselves. (§16.2 was the one site the first revision's sweep missed; it was found by the targeted verification as R-1 and corrected in the second pass — §19.1.)"

**§19 records the correction accurately.** The H-1(2) row now reads "removed from §12.6, RR-10, §18, the §12.4 amendment's Rollout paragraph **and §16.2** (the last of these missed on the first pass and corrected in the second — see §19.1 R-1)", and its "Where" column lists §16.2. A new **§19.1** maps all three residuals to their changes and states plainly that the earlier sweep's boundary is now recorded rather than implied. The point that a false self-audit is worse than none is accepted in writing rather than argued.

## 2. R-2 — §0's verdict row

**Closed.** `:41` now reads `| Verdict | READY FOR TARGETED CATALOG REVISION VERIFICATION |`, matching the document's closing marker at `:1266` verbatim, and consistent with §16.1's record that the independent catalog review is done. §19.1 logs it as "Aligned with §19's closing marker".

## 3. R-3 — the historical fourteen-leaf test

**Closed, and correctly reasoned.** The `tests/unit/muscleGroups.test.ts` row in §12.3 now pins `:52` instead of renumbering it:

> "`:52` (**leave this title verbatim** — its test asserts the fourteen display names that pre-date ADR-010, and `tibialis` is not one of them; the count of pre-existing leaves does not change and this row must not be renumbered), `:69` (title "has display names for the 3 new leaves and the back rollup" — **this is where the new `tibialis` assertion belongs**: either keep the title scoped to ADR-010's three and add a separate assertion beside it, or retitle to name the amendment's leaf too)."

Both halves re-verified against the source at `HEAD`:

- `tests/unit/muscleGroups.test.ts:52-67` asserts exactly **fourteen** `MUSCLE_GROUP_DISPLAY_NAMES` entries — `lower_back, chest, front_delts, side_delts, rear_delts, traps, biceps, triceps, forearms, abs, quads, hamstrings, glutes, calves` — which is precisely the pre-ADR-010 set (v1's fifteen slugs minus `back`, which became the rollup). `tibialis` is not among them, so the count is unaffected. ✓
- `:69-74` asserts `lats, upper_back, adductors, back` — ADR-010's three new leaves plus the rollup. That is the right home for the amendment's leaf, and the row now says so explicitly with two acceptable framings. ✓

The conflict between the two sub-instructions in the same cell is gone; the surviving instruction is unambiguous and matches the code.

## 4. Non-regression check

Confined to confirming that the second pass touched only what R-1/R-2/R-3 required.

**The 24 literals are byte-identical.** §10 was re-parsed field by field and mechanically diffed against the extraction verified in the previous pass — slug, name, equipment, mechanics, laterality, measurement profile, load basis, volume counting, strength estimate and full contribution list for all 24 entries. `diff` reports no difference. §10 still occupies lines 419–798, unmoved.

**The manifest is unchanged.** §6 still carries 24 rows at positions 104–127, six marked `unilateral`, closing with "**24 entries** — 15 compound / 9 isolation, 18 bilateral / 6 unilateral" (`:252`).

**The rollout controls are unchanged.** §16.7's five ordered steps are verbatim what the previous pass verified, including step 3's per-client enumeration ("**Enumerate the clients rather than assuming there is one** … each installed PWA or browser profile holds its own service worker and its own cached bundle") and step 5's post-deployment read-only check of `bodyweight-tibialis-raise` for "exactly one contribution — `tibialis`, primary, weight 1.0 — and no `calves` row in either role", under `BEGIN TRANSACTION READ ONLY`.

**The ADR-010 amendment is unchanged.** §12.4 still occupies lines 941–975, with all three supersession items intact (including `:140`'s "five leaves" → six), the Rejected-alternatives "single deploy" entry still treated as *not* superseded but decided around, and the Rollout paragraph still citing D-CE1-1 rather than asserting acceptance.

**Section structure is unchanged.** Every heading from §1 to §19 sits at the same line number as in the previous pass; the only structural addition is §19.1 at `:1254`. Combined with the +12 line delta, the edit set is exactly: `:41`, `:923`, `:1126`, `:1220`, `:1235`, plus the appended §19.1 — five in-place lines and one new subsection. Nothing else in the document moved.

**Previously closed findings** (H-1's analysis, H-2, M-1…M-4, L-1…L-10) were not re-derived and are not reopened; they remain closed as certified in §7 of the first targeted verification.

## 5. Nit — not blocking, no action needed

The §12.3 cell still opens with "**Four title/comment sites also move**" before listing `:52` as one that explicitly must not. Only three move. The `:52` instruction that follows is bold and emphatic ("leave this title verbatim … must not be renumbered"), so it cannot be misread, and the count in the lead-in changes nothing an implementer does. Recorded for completeness only.

The three observations from §6 of the first targeted verification — the ±1 line-range citation drift, §12.8 item 1's "replace the rollup-only special case" wording, and §12.1's stale "the reviewer should confirm" sentence — were correctly dispositioned as read-and-no-change in §19.1. That disposition stands: none affects an instruction, and NC-D/NC-E already guard the one with a behavioural edge.

---

## 6. Disposition

| Residual | Disposition |
| --- | --- |
| **R-1** — §16.2's withdrawn justification | **Closed.** Justification replaced with scope and the accepted D-CE1-1 controls; characterisation withdrawn in place; §18's completeness claim now true; §19 and §19.1 record the correction and the missed sweep boundary |
| **R-2** — §0's stale verdict row | **Closed.** `:41` matches `:1266` |
| **R-3** — the `:52` "→ 15" instruction | **Closed.** `:52` pinned verbatim with the correct reason; the `tibialis` assertion routed to `:69`. Both halves confirmed against `tests/unit/muscleGroups.test.ts:52-67` and `:69-74` |
| Manifest, literals, rollout controls, ADR amendment | **Unchanged**, verified mechanically |

No residuals remain. The specification is internally consistent, its self-audit is accurate, and its implementation instructions match the code they describe.

---

APPROVED — READY FOR CATALOG EXPANSION IMPLEMENTATION
