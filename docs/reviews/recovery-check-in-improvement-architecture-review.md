# PI-007 — Recovery check-in completeness and scale clarity: independent architecture review

**Date:** 2026-09-10
**Reviewed document:** [recovery-check-in-improvement-architecture-evaluation.md](recovery-check-in-improvement-architecture-evaluation.md)
**Backlog item:** [PI-007](../BACKLOG.md#pi-007)
**Tree reviewed:** `HEAD` = `a122855` (working tree as listed in §9 below)
**Reviewer scope:** independent review only. No implementation, no edit to the evaluation, no
database access, no production access, no commit, push or deployment. The only file written by this
task is this one.

Every claim below was checked against the source, tests and schema in the tree, not against the
evaluation's own summary of them. Where the evaluation is right, it is recorded as verified (§7) so
the verdict is not a bare list of complaints.

---

## 1. Verdict summary

The **core design is sound and the central engineering claim is true**: `sleepHours` already exists
end to end — table, domain schema, outbox wire schema, sync-apply, service, DTO and cache — so the
change needs no migration, no server edit and no API edit, and the only wire-level gap really is the
one line in `src/sync/dailyLogs.ts`. The A/B/C/D state table, the touched-fields-only rule, the
replay/idempotency argument and the `no_metric` rejection path all reproduce exactly as described
when traced through the code.

What does not hold is the document's claim to be **implementation-ready**. §4.1 specifies two
mutually exclusive rules for the same input state; §6 asserts a rename blast radius that is
demonstrably incomplete and that will fail the existing suite in a way that is not a rename; §7's
negative control for the design's own headline safety rule cannot detect that rule; and §4.3
overrides an explicit qualifier in PI-007 without acknowledging it or measuring the result.

Five corrections are required. None needs a redesign, an owner gate, or any widening of scope — all
five are edits to the evaluation document, and four of them are edits to §4.1/§6/§7 alone.

---

## 2. Blocking findings

### B-1 — HIGH — §4.1 gives two contradictory rules for an unparseable, non-empty sleep-hours draft

§4.1 states both of the following about the same field:

> **Set:** … An emptied or unparseable draft resolves to `null`, identical to tapping Clear — the
> rule already fixed and tested at [RecoveryHistoryList.tsx:187-195].

> **Validation before enqueue.** If the draft is non-empty and
> `parseDecimalInput(draft) === null || value < 0 || value > 24 || decimalPlaceCount(draft) > 2`,
> show an inline error and enqueue nothing.

The first rule says an unparseable draft *is a clear* and the save proceeds. The second says an
unparseable non-empty draft *blocks the save*. An implementer cannot satisfy both.

Worse, the second rule is not merely redundant — it is incoherent on screen. The control being
reused renders the text input only while a value is set:

- [RecoveryHistoryList.tsx:159](../../src/ui/recovery/RecoveryHistoryList.tsx#L159) —
  `{sleepHours === null ? <UnsetField label="Sleep hours" …/> : <input …/>}`
- [RecoveryHistoryList.tsx:184-196](../../src/ui/recovery/RecoveryHistoryList.tsx#L184-L196) —
  `onChange` sets `sleepHoursDraft` **and** `setSleepHours(parseDecimalInput(draft))`

So the instant a draft stops parsing, `sleepHours` becomes `null`, the input unmounts, the control
reads `Sleep hours: not set`, and `sleepHoursDraft` silently retains the stale text. Under the
second rule the athlete then taps Save and receives *"Enter sleep hours between 0 and 24, to at most
2 decimals."* pointing at a field that visibly says **not set**, with no way to clear the error
except tapping Set and clearing again.

The model cited for the guard does not transfer. `BodyweightQuickLog`'s
[save()](../../src/ui/bodyweight/BodyweightQuickLog.tsx#L28-L34) treats
`parseDecimalInput(draft) === null` as an error because bodyweight is a **mandatory** value with no
"unset" state. Sleep hours is optional and has one, which is precisely the difference §4.1's own
"Set/Clear" bullet is built on.

**Required correction.** Keep exactly one rule, and make it the delivered, already-tested one:

1. An emptied or unparseable draft resolves to `null` = "not set" (unchanged from
   `RecoveryHistoryList.tsx:187-195`).
2. Scope the pre-enqueue guard to a value that is actually set:
   `if (sleepHours !== null && (sleepHours > 24 || decimalPlaceCount(sleepHoursDraft) > 2)) { … }`.
3. Drop `parseDecimalInput(draft) === null` from the guard, and drop `value < 0` — it is
   unreachable, because `sanitizeDecimalDraft` strips `-`
   ([decimalInput.ts:85-91](../../src/ui/decimalInput.ts#L85-L91)), so no negative draft can exist.
4. Specify that the shared field resets `sleepHoursDraft` to `""` whenever the value resolves to
   `null`, so retained text can never desynchronise from the visible "not set" state.

Reachability of what remains, checked against the render rule: `25` → parses to `25` → the input is
still rendered showing `25` → guard fires. `7.333` → parses → input rendered → `decimalPlaceCount`
is 3 → guard fires. Both of §7's E-3 cases survive this correction unchanged; only the unreachable
and incoherent branch is removed.

### B-2 — MEDIUM — §6 and §8 disagree about where the new validation lives, and one answer silently changes Recovery History

§6 gives `RecoveryHistoryList.tsx` the change "use `SleepHoursField`". §8 step 2 requires that
extraction to be inert:

> **Extract `SleepHoursField`** from `RecoveryHistoryList`'s `EditRow` with *no* behaviour change;
> re-run `phase7Remediation.spec.ts` to prove the extraction is inert before building on it.

But §4.1's validation is a behaviour History does not have. Today an out-of-range History edit is
sent to the server, rejected by `PATCH /api/recovery/{id}` with `400 invalid_input`
(`src/app/api/recovery/[id]/route.ts:25-31`), and surfaced by
[RecoveryHistoryList.tsx:138-145](../../src/ui/recovery/RecoveryHistoryList.tsx#L138-L145) as the
generic **"Save failed."** — not an inline range message.

- If the guard lives **inside** `SleepHoursField`, step 2 is not inert and History's error copy
  changes without being listed in §6 or covered by any acceptance criterion.
- If the guard lives in each parent's `save()`, History keeps "Save failed." and the two surfaces
  diverge on identical input, which §4.1's "so the three call sites cannot drift" rationale exists
  to prevent.

**Required correction.** State which, explicitly, in §6. If History is deliberately left on
"Save failed.", add it to §1's *"Deliberately not changed although adjacent"* list with the reason.
If History gains the inline guard, say so in §6, drop the "inert" wording from §8 step 2, and add
one acceptance criterion for it.

### B-3 — MEDIUM — the rename blast radius is asserted to be itemised, and is not; two existing assertions outside the list will fail

§2 states the Playwright breakage is *"expected, mechanical updates, itemised in §6"*. §6 lists
`phase7Remediation.spec.ts` lines `137, 148, 156, 201, 225, 258, 276-277, 285, 292` plus a re-aim of
the `:307` test. At least two further assertions break, and one of them is not a rename:

**(a) Error-copy assertion, not listed.**
[phase7Remediation.spec.ts:209-212](../../tests/e2e/phase7Remediation.spec.ts#L209-L212) asserts
`/At least one of sleep hours, sleep quality, readiness, or soreness is required/`. §4.3 renames
that exact string at `RecoveryHistoryList.tsx:121,142` to *"… or muscle soreness …"*, so the regex
stops matching. Mechanical, but omitted.

**(b) Newly ambiguous locator — a strict-mode failure, not a rename.**
[phase7Remediation.spec.ts:368](../../tests/e2e/phase7Remediation.spec.ts#L368) is
`await expect(page.getByText("Sleep hours: not set")).toBeVisible();`. That test navigates to
`/recovery` (`page.goto` at `:356`) after `deleteAllRecoveryEntries` at `:350`, so
[RecoveryScreen.tsx:18-19](../../src/ui/recovery/RecoveryScreen.tsx#L18-L19) has **both**
`RecoveryCheckIn` — in the new-entry `form` phase, because today has no entry — and the history row
under edit mounted at once. Once G-2 puts the sleep-hours control on the new-entry form,
`UnsetField label="Sleep hours"` renders in both components, the unscoped locator resolves to two
nodes, and Playwright fails on strict mode. Fixing it requires container scoping, not a string
change.

§4.1 already concedes the collision (*"The Set/Clear button names still collide across the two
cards … tests scope by container"*) — but it presents that as a pre-existing convention, when in
fact adding the control to Today is what makes these specific locators ambiguous for the first time.

**Required correction.** Add (a) and (b) to §6, and record the rule explicitly: on `/recovery`,
every assertion touching `Sleep hours: not set`, `Set Sleep hours` or `Clear Sleep hours` must be
container-scoped. Also name `:320-322` in the `:307` re-aim entry, so the re-aim is not read as
covering only the two lines the entry currently mentions.

### B-4 — MEDIUM — A-3 cannot detect the safety rule it is labelled as proving

§5's most consequential decision is that state A **omits** `sleepHours` rather than sending `null`,
justified by a stale-read/queued-op race. §7 marks A-3 as the negative control for it:

> **A-3** **[NC]** (Unit) `logRecoveryToday({ sleepQuality: 3, readiness: 3, soreness: 3 })` enqueues
> a payload with **no `sleepHours` key** — proving "unset" is omission, not a null write.

That test passes **today, unmodified**, because
[dailyLogs.ts:82-85](../../src/sync/dailyLogs.ts#L82-L85) already omits every `undefined` key. It
exercises the transport helper, not `RecoveryCheckInForm`, and so cannot fail if the card sends an
explicit `null`. The companion A-1 cannot distinguish them either: on a genuine insert
[service.ts:148](../../src/server/recovery/service.ts#L148) coerces `undefined` → `null`, which is
§5's own argument for why the two are observationally identical there.

As specified, the design's headline safety property is untested at the only layer that can violate
it.

**Required correction.** Add a criterion that exercises the exact race §5 invokes. Concretely:
reach state A on Today; write `sleepHours: 6` for the same day out of band
(`page.request.post("/api/recovery", { data: { sleepHours: 6 } })`); save the card untouched; drain
the outbox; assert `sleepHours` is still `6` and the three 1–5 metrics are `3`. That fails if the
card sends an explicit `null` and passes if it omits the key. (Keep A-3 as well — it is a cheap pin
on the helper — but relabel what it proves.)

### B-5 — MEDIUM — §4.3 renames the Metrics column unconditionally, against PI-007's explicit "where space permits"

PI-007's own criterion is qualified:

> Rename the visible metric to **Muscle soreness** *where space permits* and show clear anchors…
> ([BACKLOG.md, PI-007 preserved input](../BACKLOG.md#pi-007))

§4.3 renames `metrics/copy.ts:90` outright and defends it with the delivered header rule:

> The metrics table keeps five columns and lets the header **wrap**, which is the delivered design
> rule for that table.

That rule was written for the *current* headers, and the cited source shows they are already at the
limit — the reference render breaks them mid-word to fit five columns at 320 px
(`Day  Sleep h  Quality  Readi-  Sore-`,
[metrics-dashboard-architecture-evaluation.md:463](metrics-dashboard-architecture-evaluation.md);
the no-abbreviation rule is at `:504`). "Muscle soreness" is roughly 2.3× the header it replaces, in
a right-aligned column of ~50 px in a five-column `w-full` table
([RecoveryCard.tsx:30-48](../../src/ui/metrics/RecoveryCard.tsx#L30-L48)). E-1 only asserts
`document.documentElement.scrollWidth <= innerWidth`, which a four-line wrapped header passes while
looking broken — the existing metrics overflow checks
([metrics.spec.ts:115-120](../../tests/e2e/metrics.spec.ts#L115-L120)) measure exactly that and
nothing else.

This is the one place the evaluation overrides owner-stated language, and it does so silently.

**Required correction.** Settle it in the document with evidence, one of:

- **(a)** Keep `recoveryColumnSoreness: "Soreness"` and carry the interpretation in the caption
  clause alone. This satisfies PI-007's "same terminology and interpretation across … Metrics" under
  the "where space permits" carve-out, and D-4's stated concern ("leaves Metrics without the anchor
  meaning") is already answered by the caption, which §4.3 adds either way.
- **(b)** Keep the rename and add an acceptance criterion that measures the *rendered header* at
  320 px — column width and header line count, or a bounded header `getBoundingClientRect().height`
  — not just page overflow.

Either is in scope and needs no owner input; what is not acceptable is leaving the qualifier
unaddressed. If (b) is chosen, note in §4.3 that PI-007's qualifier was evaluated and the
measurement is the evidence for it.

---

## 3. Advisory findings (non-blocking)

- **A-1 — §5 state A does not define "set, then cleared."** The rule is *"never set → omit the key;
  set → send the number"*; a value that was set and then cleared before Save satisfies neither
  branch. Recommend: any interaction (Set, Clear, or an edit) makes the field explicit for that
  save, or state that clearing returns it to omitted. On a genuine insert the stored outcome is
  identical either way; it matters only in the stale-read case §5 itself raises.

- **A-2 — `useId()` and the early return.**
  [NullableSliderField.tsx:49-51](../../src/ui/recovery/NullableSliderField.tsx#L49-L51) returns
  `<UnsetField/>` before any hook runs. §4.2's `useId()` must be called above that return or
  `react-hooks/rules-of-hooks` fails `pnpm lint`. One line in §4.2 avoids the round trip.

- **A-3 — where anchors are actually visible.** §4.2 says anchors appear "wherever a soreness value
  is **entered**", but `NullableSliderField` renders `UnsetField` (no track, no legend) while the
  value is `null`. On Today's edit form and the unknown-offline form the legend is therefore absent
  until Set is tapped. D-2 should name the surface it asserts against — the new-entry form, where
  `SliderField` always renders — or add the Set tap to its steps.

- **A-4 — the unknown-offline "Saved" notice.** That form clears its saved state on every input
  change ([RecoveryCheckIn.tsx:404](../../src/ui/recovery/RecoveryCheckIn.tsx#L404),
  [:466-469](../../src/ui/recovery/RecoveryCheckIn.tsx#L466-L469)). §5's touched-only rule should
  say the sleep-hours field does the same, or the card can display *"Saved — will finish syncing"*
  next to an edit that has not been enqueued.

- **A-5 — evidence-citation drift** (all checked at `a122855`; none changes a conclusion):
  - `sync/schema.ts:218` → the `sleepHours` line is **:219**.
  - `recoveryEntries.ts:29,39,45` → `:29` is correct; the sleep-hours range check is **:37** (`:39`
    is the readiness check) and `ck_recovery_entries_has_metric` is **:41-43** (`:45` is the closing
    paren).
  - G-8's *"'Soreness' appears at seven visible sites"* counts labels and summaries only. Four
    further user-visible strings contain it — `RecoveryCheckIn.tsx:231`, `:413`,
    `RecoveryHistoryList.tsx:121`, `:142`. §4.3's rename map does cover all four, so the count is
    wrong, not the plan.
  - §1's working-tree snapshot (`HEAD = 355e381`, `docs/input/product-ideas.md` modified) is two
    commits stale; `HEAD` is `a122855` and the modified docs are `docs/BACKLOG.md` and
    `docs/ROADMAP.md`. It is a dated record — no edit needed, but do not re-assert it at
    implementation time.

- **A-6 — "silently dead-letter" overstates it, though the conclusion holds.** The mechanism is as
  described: the op envelope keeps `payload` loose
  ([sync/schema.ts:51-56](../../src/domain/sync/schema.ts#L51-L56)), so one bad payload does **not**
  `400` the whole batch and poison the queue; `applyRecoveryEntryUpsert`
  ([server/sync/service.ts:1401-1402](../../src/server/sync/service.ts#L1401-L1402)) returns
  `rejected(… "invalid_payload")` and `flush.ts` dead-letters it. `SyncStatusBanner` does surface
  the count, so it is not silent — but there is still no synchronous response to show inline at
  entry time, which is the actual reason the client guard is required. The requirement stands; only
  the word is loose.

---

## 4. Assessment of the recommended defaults (§9)

| # | Default | Assessment |
|---|---|---|
| D-1 | Decimal text field | **Endorsed.** `type="number"` is genuinely unusable here for the documented reason ([decimalInput.ts:79-83](../../src/ui/decimalInput.ts#L79-L83)); reuse introduces no new input convention. |
| D-2 | Label "Sleep hours" | **Endorsed.** Matches History's shipped label and the summary's `Sleep {n}h` at [RecoveryCheckIn.tsx:153](../../src/ui/recovery/RecoveryCheckIn.tsx#L153). Renaming to "Sleep duration" would widen the change for no user gain, as stated. |
| D-3 | Seed `7` on Set | **Endorsed.** It is a fabricated starting value a distracted user could commit — but identically so for every `NullableSliderField` Set (→ `3`, [NullableSliderField.tsx:50](../../src/ui/recovery/NullableSliderField.tsx#L50)). Consistent with delivered behaviour, not a new hazard, and PI-007's "do not fabricate a default" is about the unset state, which is preserved. |
| D-4 | Metrics rename + caption clause | **Qualified — see B-5.** The caption clause itself is fine and clears the forbidden-token scan; the unconditional column rename is what needs settling. |
| D-5 | Shared `src/ui/recovery/copy.ts` | **Endorsed.** Eleven user-visible strings across three files; the `src/ui/metrics/copy.ts` precedent is real. |
| D-6 | `aria-describedby` on a visible legend | **Endorsed**, with the rationale corrected: `aria-valuetext` replaces the announced **value**, not the accessible name, so `getByLabel` would survive either choice. The decision is still right, for the reason §4.2 gives second — `aria-valuetext` forces invented announcements for 2 and 4. |

§9's closing claim — *"No material owner choice blocks the design"* — is **correct**. None of the
six needs owner input. B-5 is the only finding that touches owner-stated language, and it is
resolvable with a measurement or a one-word choice inside the accepted scope, not an owner gate. No
new gate is warranted by this review.

---

## 5. Scope discipline

The proposal stays inside PI-007 and adds nothing extraneous. Specifically confirmed:

- No migration, no `src/db/**`, no `drizzle/**`, no `src/server/**`, no `src/app/api/**` change is
  needed — §3's table is accurate at every layer (§7 below).
- No readiness/recovery score, no progression input, no recovery-model change. The
  `domain/progression` → `ui/recovery` boundary is unaffected: `progressionBoundary`'s negative
  control asserts on the `src/ui/recovery` **prefix**
  ([progressionBoundary.test.ts:221-231](../../tests/unit/progressionBoundary.test.ts#L221-L231)),
  so the two new files under it neither break nor weaken it. E-4 is sound.
- Sleep-quality and readiness correctly get **no** anchors — the owner-named anchors are soreness
  semantics. Good restraint.
- Recovery History's arbitrary-past-date path correctly stays on plain online REST
  ([dailyLogs.ts:31-38](../../src/sync/dailyLogs.ts#L31-L38)).
- No workflow-optimization document or tooling is touched by this proposal, and none was touched by
  this review. PI-017 is correctly treated as parallel, not a dependency.

---

## 6. Test-plan assessment

The acceptance set is meaningful rather than vacuous — the **[NC]** discipline is real, and B-1/B-3
in §7 genuinely fail if preservation regresses. Beyond B-3 and B-4 above:

- **C-2 is the most valuable criterion in the set** and is correctly specified. Traced through the
  code: an offline `{id, date, sleepHours: 7.25}` op against a day already holding `sleepQuality 4`
  builds `updateSet = { updatedAt, sleepHours }` only
  ([service.ts:155-160](../../src/server/recovery/service.ts#L155-L160)), so `sleepQuality` cannot
  be touched. It mirrors the existing readiness-only test at
  [offline-bodyweight-recovery.spec.ts:140-188](../../tests/e2e/offline-bodyweight-recovery.spec.ts#L140-L188)
  correctly — note that test starts from `deleteAllRecoveryEntries`, so C-2 must seed its
  server-side `sleepQuality 4` **after** that call.
- **C-5 is correctly derived.** `{sleepHours: null}` on a metric-less day → all-null proposed insert
  tuple → `CHECK_VIOLATION` → retry as a plain `UPDATE` with the same presence-aware `updateSet`
  → zero rows or a second violation → `RecoveryEntryHasNoMetricError` → `rejected(… "no_metric")` →
  dead-letter ([service.ts:161-212](../../src/server/recovery/service.ts#L161-L212),
  [server/sync/service.ts:1420-1425](../../src/server/sync/service.ts#L1420-L1425)). The decision
  not to add a client-side pre-block is right and consistent with the three sliders.
- **`tests/unit/metricsCopy.test.ts` is correctly flagged** as needing adjustment: `:148-150` pins
  `recoveryCaption` by exact value, so appending the clause breaks it. The proposed clause
  *"Muscle soreness is 1 = none to 5 = very high."* clears every list in that file —
  `CASE_SENSITIVE_FORBIDDEN`, `SOURCE_SCOPED_FORBIDDEN` and `COPY_SCOPED_FORBIDDEN`
  ([:20-58](../../tests/unit/metricsCopy.test.ts#L20-L58)) — verified token by token.
- **D-1's wording is loose.** *"no standalone `Soreness` label remains in the rendered DOM"* — the
  replacement string contains the substring `soreness`, so the assertion must be an exact-text or
  exact-label match, not a substring scan. Worth pinning in the criterion.
- `tests/e2e/bodyweightRecovery.spec.ts:82, 92, 101` is complete and correct as listed; nothing else
  in that spec is affected by the new control.

---

## 7. What was independently verified as correct

Recorded so the verdict is not read as doubt about the whole document.

**§3's "no migration" table — verified at every layer.**

| Claim | Verified at |
|---|---|
| `sleep_hours numeric(4,2)`, nullable, range check, counts toward `ck_recovery_entries_has_metric` | [recoveryEntries.ts:29,37,41-43](../../src/db/schema/recoveryEntries.ts#L29) |
| `sleepHoursSchema`, `.nullable().optional()` in both domain schemas | [recovery/schema.ts:12,47,64](../../src/domain/recovery/schema.ts#L12) |
| The `.strict()` outbox payload schema **already declares the key** | [sync/schema.ts:219](../../src/domain/sync/schema.ts#L219) |
| Sync-apply already forwards it | [server/sync/service.ts:1411](../../src/server/sync/service.ts#L1411) |
| Presence-aware upsert already handles it in both `insertValues` and `updateSet` | [server/recovery/service.ts:148,156](../../src/server/recovery/service.ts#L148) |
| DTO and cache snapshot already carry it | [ui/recovery/types.ts:4](../../src/ui/recovery/types.ts#L4), [sync/types.ts:227](../../src/sync/types.ts#L227) |

The consequence §3 draws — a client that starts sending `sleepHours` needs no server-side or
schema-side coordination — is correct, and no IndexedDB `DB_VERSION` bump is needed
(`dailyLogCache` is schemaless and already stores the field).

**§3's measured zod table — reproduced exactly** (zod `3.25.76`, evaluating the repository's own
`z.number().gte(0).lte(24).multipleOf(0.01)`): `7 · 7.5 · 7.25 · 7.33 · 0 · 24` accepted;
`7.333` and `7.9999` rejected `not_multiple_of`; `24.5` `too_big`; `-1` `too_small`. Also confirmed
accepted: `0.01`, `0.1`, `6.75`, `7.05`, `23.99`. The derived rule — every emptiness check must test
`=== null`, never falsiness, because `0` is a legal stored value — is right and matters.

**G-1 through G-8 all reproduce** at the cited locations (with the two slips in A-5). In particular
G-1 is confirmed as the single wire-level gap:
[dailyLogs.ts:61-66](../../src/sync/dailyLogs.ts#L61-L66) has no `sleepHours` key and
[:81-85](../../src/sync/dailyLogs.ts#L81-L85) never copies one. G-4
([:254](../../src/ui/recovery/RecoveryCheckIn.tsx#L254)) and G-5
([:224-231](../../src/ui/recovery/RecoveryCheckIn.tsx#L224-L231)) are real latent defects that
*become* live defects the moment the field is editable — correctly identified as part of this change
rather than deferred.

**§5's state machine matches the component.** The five phases resolve as described
([RecoveryCheckIn.tsx:25-44](../../src/ui/recovery/RecoveryCheckIn.tsx#L25-L44)); state B's
"always send explicitly" really is the rule the card already applies to the other three metrics, for
the reason recorded in place ([:237-243](../../src/ui/recovery/RecoveryCheckIn.tsx#L237-L243)); the
unknown-offline path really does write nothing to `dailyLogCache` and show no confirmed summary
([:425-430](../../src/ui/recovery/RecoveryCheckIn.tsx#L425-L430)). Extending `TouchedMetric` to a
fourth field is a change of degree, not of kind, exactly as claimed. §5's "known, unchanged
limitation" about state B overwriting a concurrent other-device write is stated honestly rather than
buried — it does widen to a fourth field, and saying so plainly is the right call.

**The rename's accessibility blast radius is correctly analysed.** The `label` prop really is the
slider's `aria-label` and really does drive `Set ${label}` / `Clear ${label}`
([NullableSliderField.tsx:11-38](../../src/ui/recovery/NullableSliderField.tsx#L11-L38),
[:71](../../src/ui/recovery/NullableSliderField.tsx#L71)), so the Playwright churn is unavoidable
rather than avoidable sloppiness. Choosing `aria-describedby` over `aria-valuetext` to keep every
`getByLabel` selector intact is the right trade.

---

## 8. Required corrections — checklist

1. **B-1** — Remove the contradiction in §4.1. Keep "unparseable/empty draft = clear"; scope the
   pre-enqueue guard to `sleepHours !== null` and to range + `decimalPlaceCount` only; drop the
   unreachable `value < 0`; specify the draft reset to `""` on resolve-to-null.
2. **B-2** — State in §6 whether the guard lives in `SleepHoursField` or in each parent's `save()`,
   and reconcile §8 step 2's "inert extraction" claim with the answer.
3. **B-3** — Add `phase7Remediation.spec.ts:209-212` (error copy) and `:368` (container scoping, not
   a rename) to §6; name `:320-322` in the `:307` re-aim; record the `/recovery` container-scoping
   rule for all `Sleep hours` locators.
4. **B-4** — Replace or supplement A-3 with a criterion that can actually fail if state A sends an
   explicit `null` (concurrent out-of-band `sleepHours: 6`, untouched save, assert `6` survives).
5. **B-5** — Settle the Metrics column against PI-007's "where space permits": either keep
   `"Soreness"` with the caption clause, or keep the rename and add a 320 px rendered-header
   measurement to E-1.

Advisories A-1 through A-6 are optional and can be folded in at the same time or left to
implementation judgement.

---

## 9. Working-tree preservation

`git status` inspected before and after this review — **identical**, and the only new file is this
one (created after the second inspection):

```
 M CLAUDE.md
 D HANDOFF.md
 M docs/BACKLOG.md
 M docs/ROADMAP.md
?? .claude/skills/
?? HANDOFF(depracted).md
?? docs/reviews/exercise-catalog-expansion-closeout.md
?? docs/reviews/recovery-check-in-improvement-architecture-evaluation.md
?? docs/reviews/repository-agent-workflow-evaluation.md
?? docs/reviews/repository-agent-workflow-review.md
?? docs/reviews/warmup-routines-evidence-research.md
?? gpt-handoff.md
?? gpt-memory.md
```

No concurrent work was modified. `docs/STATUS.md`, `docs/ROADMAP.md` and `docs/BACKLOG.md` remain
with the closeout editor; the evaluation under review was not edited; no
repository-agent-workflow document or tooling was touched. No database, migration, commit, push or
deployment action was taken; all verification was static reading plus one isolated `zod` evaluation
in a scratch process.

---

REVISION REQUIRED
