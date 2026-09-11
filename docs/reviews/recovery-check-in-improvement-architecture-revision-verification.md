# PI-007 — Recovery check-in: revision verification

**Date:** 2026-09-10
**Verified document:** [recovery-check-in-improvement-architecture-evaluation.md](recovery-check-in-improvement-architecture-evaluation.md) — revision 2
**Against:** [recovery-check-in-improvement-architecture-review.md](recovery-check-in-improvement-architecture-review.md) — B-1…B-5 blocking, A-1…A-6 advisory
**Tree:** `HEAD` = `a122855`, working tree unchanged before and after (§7)

Targeted revision verification, not a new architecture review. No established decision is reopened.
Every disposition below was checked against current source rather than against the revision's own
account of it. No implementation, database access, commit, push or deployment was performed. The
only file written by this task is this one.

---

## 1. Disposition summary

| Finding | Severity | Disposition |
|---|---|---|
| B-1 — contradictory unparseable-draft rules | HIGH | **CLOSED** |
| B-2 — validation ownership / History behaviour | MEDIUM | **CLOSED** — resolved more strongly than required |
| B-3 — incomplete test inventory | MEDIUM | **CLOSED** — inventory independently re-derived and confirmed complete |
| B-4 — A-3 could not detect its own rule | MEDIUM | **CLOSED** |
| B-5 — Metrics rename vs "where space permits" | MEDIUM | **CLOSED** |
| A-1 — set-then-clear undefined | advisory | **CLOSED** |
| A-2 — `useId()` above the early return | advisory | **CLOSED** |
| A-3 — anchors invisible while unset | advisory | **CLOSED** |
| A-4 — unknown-offline "Saved" notice | advisory | **CLOSED** |
| A-5 — citation drift | advisory | **PARTIALLY CLOSED; two of my corrections were wrong and are correctly rejected** (§4) |
| A-6 — "silently dead-letter" overstated | advisory | **CLOSED** |
| D-6 rationale error | advisory | **CLOSED** |

No contradiction was introduced by the revision. Three non-blocking residuals are recorded in §6;
none needs to be resolved before implementation starts.

---

## 2. Blocking findings — verification detail

### B-1 — CLOSED. Optional sleep-hours draft / reset / validation semantics are now single-valued

§4.1 now states **one** rule for draft resolution — an emptied or unparseable draft resolves to
`null` = "not set", *"This is a clear, not an error."* — and the pre-enqueue guard is scoped to a
value that is actually set:

```ts
if (sleepHours !== null && (sleepHours > 24 || decimalPlaceCount(sleepHoursDraft) > 2))
```

Both exclusions are correct and correctly justified. I re-derived the guard's equivalence to
`sleepHoursSchema` over every draft an athlete can produce:

| Draft | Resolves to | Guard | Would zod accept? | Agree |
|---|---|---|---|---|
| `25`, `24.01`, `999` | the number | fires (`> 24`) | no (`too_big`) | ✓ |
| `7.333`, `0.005`, `7.001` | the number | fires (`decimalPlaceCount > 2`) | no (`not_multiple_of`) | ✓ |
| `7.5`, `0`, `24`, `6.75`, `7.10`, `24.00`, `,5` | the number | passes | yes | ✓ |
| `abc` → `""`, `.`, `1.2.3`, `7,5.5` → `7.5.5` | `null` | not a guard case — a clear | n/a | ✓ |
| `-5` → sanitized `5` | `5` | passes | yes | ✓ |

`value < 0` really is unreachable: `DECIMAL_DRAFT_PATTERN = /[^0-9.,]/g`
([decimalInput.ts:7](../../src/ui/decimalInput.ts#L7)) strips `-` inside `sanitizeDecimalDraft`
([:11-13](../../src/ui/decimalInput.ts#L11-L13)). Confirmed against the file.

The `sleepHoursDraft` → `""` reset on resolve-to-null is specified, and §4.1's argument that it stays
**unobservable in History** holds under check: `EditRow`'s `save()` reads `sleepHours` only
([RecoveryHistoryList.tsx:120](../../src/ui/recovery/RecoveryHistoryList.tsx#L120),
[:131](../../src/ui/recovery/RecoveryHistoryList.tsx#L131)), never the draft, and the sole route back
to a rendered input is `onSet`, which already overwrites the draft with `"7"`
([:163-164](../../src/ui/recovery/RecoveryHistoryList.tsx#L163-L164)). The reset therefore cannot
change what History displays or sends.

Consistency across the document: §5's state table, §7's B-4 (*"`fill("")` … no validation error is
shown"*) and §7's E-3 (*"Both keep the input rendered … so the error points at a visible field"*) all
express the same single rule. No revision-1 wording survives — the only remaining occurrence of
`parseDecimalInput(draft) === null` is §4.1's explicit statement that it is **absent** from the guard.

### B-2 — CLOSED, and resolved more strongly than the review required

Ownership is now explicit and unambiguous: the guard lives in **each Today `save()`**, via a pure
`sleepHoursError(value, draft)` exported from `SleepHoursField.tsx` but **not applied internally**
(§4.1, restated in §6's manifest row). History does not call it.

Three separate places now agree, which is what the finding asked for:

- **§1** records History's preserved behaviour as an explicit named boundary, with the correct
  mechanism: a `400 invalid_input` from `PATCH /api/recovery/{id}` surfaces as the generic
  `Save failed.` because the handler maps only `no_metric` specially. Verified —
  [route.ts:25-31](../../src/app/api/recovery/[id]/route.ts#L25-L31) and
  [RecoveryHistoryList.tsx:138-145](../../src/ui/recovery/RecoveryHistoryList.tsx#L138-L145).
- **§8 step 2** now makes the inertness claim falsifiable: *"at this step it must pass **with no
  edits at all**, since neither the renames nor the new control exist yet."* That is a real gate, not
  an assertion.
- **§7 E-4 [NC]** is new and pins the boundary from the other side: entering `25` in the History edit
  row must still produce `Save failed.`, not the inline message. Traced: `sleepHours: 25` fails
  `sleepHoursSchema.lte(24)` in `updateRecoveryInputSchema`
  ([recovery/schema.ts:64](../../src/domain/recovery/schema.ts#L64)) → `400 invalid_input` →
  generic branch. The criterion is reachable and discriminating.

The asymmetry is justified on the right ground — Today's outbox write has no synchronous server
response at entry time, History's `PATCH` does.

### B-3 — CLOSED. Inventory independently re-derived and confirmed complete

I re-ran the full `tests/` search rather than accepting §6's table. Every line in the revised
inventory is correct, and nothing is missing.

**Confirmed correct, line by line:**

| §6 entry | Verified |
|---|---|
| `:211` added as a rename | [phase7Remediation.spec.ts:209-212](../../tests/e2e/phase7Remediation.spec.ts#L209-L212) asserts the error regex that §4.3 renames at `RecoveryHistoryList.tsx:121,142`. ✓ |
| `:368` added, classified as **strict-mode ambiguity, not a rename** | `:353` is the `2026-01-06` fixture, `:356` the `/recovery` goto, `:368` the unscoped `getByText("Sleep hours: not set")`. With today un-logged the check-in card renders the new-entry form, which after G-2 also renders `Sleep hours: not set` → two nodes. Classification and fix (scope to the history `li`) are right. ✓ |
| `:207` defensive scoping | `Clear Sleep hours` is unambiguous today because Today's new-entry field starts unset and renders `Set Sleep hours`. The stated reason is exactly right, and scoping it is cheap insurance. ✓ |
| `:202`, `:361` need **no** change | Both are `getByLabel("Edit sleep hours")`; Today's input uses the bare `aria-label="Sleep hours"`, which is not a substring of `"Edit sleep hours"`. ✓ |
| `:307` re-aim, assertion by assertion | `:317`, `:319`, `:320-321`, `:322`, `:324-325`, `:326-327` all match the file exactly. The preservation control at `:326-327` is correctly identified and kept. ✓ |

**Lines the inventory does not list — checked, and correctly omitted.** `:199`, `:200`, `:291`,
`:320-321` assert `Sleep quality: not set` / `Readiness: not set`. These cannot become ambiguous:
Today's new-entry form uses the non-nullable `SliderField`
([RecoveryCheckIn.tsx:291-297](../../src/ui/recovery/RecoveryCheckIn.tsx#L291-L297)), which renders an
always-on track, never `UnsetField`. `:357` and `:331` are already `li`-scoped. In
`bodyweightRecovery.spec.ts` the `/recovery` assertions are already scoped to the history `ul`
([:97-101](../../tests/e2e/bodyweightRecovery.spec.ts#L97-L101)). The three `soreness` hits in
`offline-bodyweight-recovery.spec.ts` are TypeScript property names, not rendered text.

The container-scoping rule is recorded in §6 and sequenced first in §8 step 6, ahead of the renames —
correct, since the two `Sleep hours` breaks are independent of the rename.

### B-4 — CLOSED. The stale-read race is now a criterion that can fail

§7 **A-4 [NC]** is new and is the control §5's state-A rule was missing. I traced it end to end:

1. Card in state A → `save()` sends `{id, date, sleepQuality: 3, readiness: 3, soreness: 3, note: null}`
   with **no** `sleepHours` key.
2. Out-of-band `POST /api/recovery { sleepHours: 6 }` creates today's row (server resolves the same
   account-timezone day via `logRecovery`'s `input.date ?? userLocalDateString(…)`).
3. The queued op hits `ON CONFLICT DO UPDATE` with `updateSet` built only from present keys
   ([server/recovery/service.ts:155-160](../../src/server/recovery/service.ts#L155-L160)) → `sleepHours`
   untouched, still `6`; the three metrics become `3`.
4. Had the card sent `sleepHours: null`, `updateSet.sleepHours = null` and the `6` would be cleared —
   the assertion fails.

The criterion is genuinely discriminating, which A-1 and A-3 are not. A-3 is kept and **relabelled
honestly** — §7 now states in the criterion itself that it "passes today unmodified", "exercises no
component", and is "**not** a control for §5's state-A rule". That is the right disposition: a cheap
regression pin, correctly described.

### B-5 — CLOSED. Compact Metrics terminology with the explanatory caption

The revision takes option (a): `recoveryColumnSoreness` stays `"Soreness"`, and the caption gains
` The Soreness column is muscle soreness: 1 = none, 3 = moderate, 5 = very high.`

Verified consistent across all five places the finding touched:

- **§4.3** — rename map row now reads *"unchanged — see below"*, with PI-007's "where space permits"
  qualifier quoted and the 320 px reference render cited **as a dated observation from the metrics
  evaluation**, not as a measurement taken by this task. That framing is accurate and appropriately
  hedged.
- **§6 source manifest** — `src/ui/metrics/copy.ts`: "caption clause only".
- **§6 test manifest** — `metricsCopy.test.ts` `:148-150` pins `recoveryCaption` by exact value and
  must be updated; `recoveryColumnSoreness` needs no change. Confirmed against
  [metricsCopy.test.ts:148-150](../../tests/unit/metricsCopy.test.ts#L148-L150).
- **§7 D-1** — asserts the `/metrics` header is exactly `Soreness` and the caption contains the
  muscle-soreness sentence; and it now requires **exact text / exact label** matching for the Today
  and History renames, since `"Muscle soreness"` contains the substring `soreness`.
- **§7 E-1** — the rendered-header measurement is correctly dropped as unnecessary, with the reason
  stated.
- **§9 D-4** — restated to match, with the header rename as the recorded alternative.

**Forbidden-token check, re-run token by token** against
[metricsCopy.test.ts:20-58](../../tests/unit/metricsCopy.test.ts#L20-L58): the clause contains none of
`PR`/`1RM`, none of the source-scoped list (`recommend`, `research`, `predict`, `improv`, `declin`,
`streak`, `adherence`, `compliance`, `correlat`, `sleep debt`, `ready to train`, arrows) and none of
the copy-scoped list (`badge`, `target`, `score`, `trend`, `goal`, `fatigue`, `affect`, `impact`,
`because`, `caused`, `recovered`, `optimal`). Clean.

PI-007's cross-surface requirement is met in prose on all three surfaces while the space-constrained
header stays compact — which is precisely what the qualifier licenses.

---

## 3. Advisory findings — verification detail

- **A-1 — CLOSED, and improved.** §5 now defines "touched" **once** across states A and C: Set,
  Clear or editing the draft all make the field explicit; only a never-interacted field is omitted.
  Set-then-cleared therefore sends `null` in both states. Checked for consequences: in state A the
  three sliders are always numbers, so a `{…, sleepHours: null}` insert tuple still satisfies
  `ck_recovery_entries_has_metric`; in state C a sleep-hours-only clear can dead-letter as
  `no_metric`, which §5 and C-5 already document as accepted. Consistent, and one rule is better
  than the two the review would have accepted.
- **A-2 — CLOSED.** `useId()` above `NullableSliderField`'s `UnsetField` early return
  ([:49-51](../../src/ui/recovery/NullableSliderField.tsx#L49-L51)) is specified in §4.2, restated in
  §6's manifest row and in §8 step 3.
- **A-3 — CLOSED.** §4.2 records that the legend is absent while the value is `null`, and D-2 now
  asserts **both** cases: always visible on the new-entry form (`SliderField`), and appearing after
  tapping `Set Muscle soreness` on the edit form.
- **A-4 — CLOSED.** §5 requires `setSaved(false)` on sleep-hours edits, matching `touch()`
  ([:404](../../src/ui/recovery/RecoveryCheckIn.tsx#L404)) and the note field
  ([:466-469](../../src/ui/recovery/RecoveryCheckIn.tsx#L466-L469)); criterion **C-6** added.
- **A-6 — CLOSED.** §5 is reworded correctly: the banner does surface a count, batch-poisoning is
  explicitly ruled out via the loose op envelope
  ([sync/schema.ts:51-56](../../src/domain/sync/schema.ts#L51-L56)), and the decisive reason for the
  guard is narrowed to the absence of a synchronous response at entry time. Accurate.
- **D-6 — CLOSED.** Rationale corrected to the announcement problem for 2 and 4; the note that
  `aria-valuetext` would not have broken `getByLabel` is right, and the decision is unchanged.

---

## 4. Where my review was wrong (A-5) — the rebuttals are correct, and I accept them

The revision declines two of my A-5 citation corrections. **It is right on both, and my review was
wrong.** Re-checked directly against the tree at `a122855`:

- **`recoveryEntries.ts`.** `check("ck_recovery_entries_sleep_hours_range", …)` is at **:39** and the
  readiness check at **:41** — revision 1's citation was correct and my "should be :37" was not.
  `ck_recovery_entries_has_metric` spans **:43-46**; the revision's refinement from `:45` to `:43-46`
  is an improvement on both of us.
- **`decimalInput.ts`.** The file is 34 lines, so my `:79-83` and `:85-91` do not exist. Those were
  offsets from a concatenated multi-file read on my side, not file line numbers. The revision's
  `:7` and `:11-13` are correct, and it correctly kept the *substance* of the point — that
  `sanitizeDecimalDraft` strips `-`, which is what makes `value < 0` unreachable.

My remaining A-5 items were adopted correctly: `sync/schema.ts` corrected to **:219** (verified),
G-8's count corrected to **eleven** with the four error strings enumerated (verified against
`RecoveryCheckIn.tsx:231, 413` and `RecoveryHistoryList.tsx:121, 142`), and both working-tree
snapshots are now dated observations with an explicit instruction not to re-assert them at
implementation time.

---

## 5. Contradictions introduced by the revision

**None found.** Specifically checked, since each was a plausible place for the revision to break
itself:

- §1's History boundary vs §6's `RecoveryHistoryList.tsx` row ("use `SleepHoursField` (no validation
  change)") vs §8 step 2's inertness gate vs E-4 — all four say the same thing.
- §4.1's single draft rule vs §7 B-4 and E-3 — consistent.
- §5's state-A omit rule vs §7 A-1 (untouched save stores `null`) — consistent; on a genuine insert
  `insertValues` coerces `undefined` → `null`
  ([service.ts:148](../../src/server/recovery/service.ts#L148)), which is why A-1 cannot serve as the
  control and A-4 must.
- B-5's kept header vs D-1, E-1, §6's two manifests and §9's D-4 — all reconciled.
- §6's "5 edited, 2 new" count matches the rows listed.
- No revision-1 text survives that contradicts a revision-2 decision (searched for the specific
  superseded phrasings).

---

## 6. Residual corrections — all non-blocking

None of these blocks implementation; each is a note for whoever writes the tests.

- **R-1 (advisory) — `getByLabel` needs `exact: true` for the new field.** §6's container-scoping
  rule covers `getByText` and button names but not labels. Playwright's `getByLabel` defaults to a
  case-insensitive substring match, so `getByLabel("Sleep hours")` would also match History's
  `"Edit sleep hours"` on `/recovery`. New criteria that address Today's input by label (A-2, B-1,
  B-2, E-2, E-3) should use `{ exact: true }`. This is already the repository's convention; worth one
  line in the new spec.
- **R-2 (advisory) — state A's touched flag is implied, not stated in the manifest.** §5 defines the
  rule and §6's `RecoveryCheckIn.tsx` row says "sleep field in all three forms", but the row does not
  mention that the shared `RecoveryCheckInForm` must track sleep-hours touched-ness **only** when
  `isNew` (state B always sends). Derivable from §5; naming it in §6 would remove the last guesswork.
- **R-3 (advisory) — D-2's edit-form step is route-unspecified.** `Set Muscle soreness` collides
  across the card and the history row on `/recovery` exactly as `Set Soreness` does today. Asserting
  D-2 on `/today`, or scoping it, avoids inheriting that pre-existing ambiguity in a new test.

---

## 7. Preservation

`git status` inspected before and after; **identical**, and the only new file is this one:

```
 M CLAUDE.md
 D HANDOFF.md
 M docs/BACKLOG.md
 M docs/ROADMAP.md
?? .claude/skills/
?? HANDOFF(depracted).md
?? docs/reviews/exercise-catalog-expansion-closeout.md
?? docs/reviews/recovery-check-in-improvement-architecture-evaluation.md
?? docs/reviews/recovery-check-in-improvement-architecture-review.md
?? docs/reviews/repository-agent-workflow-evaluation.md
?? docs/reviews/repository-agent-workflow-review.md
?? docs/reviews/warmup-routines-evidence-research.md
?? gpt-handoff.md
?? gpt-memory.md
```

The revised evaluation and the original review were read only, never edited — both verified unchanged
by content hash across this task, along with the workflow-optimization documents and the catalog
closeout. `docs/STATUS.md`, `docs/ROADMAP.md` and `docs/BACKLOG.md` remain with the closeout editor.
No database access, migration, commit, push or deployment; all verification was static reading of the
tree at `a122855`.

---

APPROVED — READY FOR RECOVERY IMPLEMENTATION
