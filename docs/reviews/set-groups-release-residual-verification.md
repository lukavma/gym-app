# Set Groups (PI-012) — release-residual (V-1…V-3) verification

**Date:** 2026-09-13
**Role:** targeted verification (fresh session; confirms the listed finding IDs only, does not re-review)
**Session:** `O-Max | P10 | Verification — PI-012 Set Groups Release Residuals`
**Model:** claude-opus-5 (1M context)
**Tree:** `583a9ab` (dirty) — Stage A + Stage B + the F-1…F-9 and V-1…V-3 remediations, all uncommitted,
alongside the concurrent, unrelated PI-017 work (untouched here).
**Inputs read:** [set-groups-stage-b-remediation-verification.md](set-groups-stage-b-remediation-verification.md)
§7 (V-1…V-3) and [set-groups-stage-b-implementation.md](set-groups-stage-b-implementation.md) §13.
Older evidence consulted only for specific questions.
**Verdict:** see §9.

---

## 0. Summary

All three owner-selected findings are fixed, and I confirmed each of the sub-conditions the task named.
V-1's supersession rule behaves correctly on every boundary I could construct through the real
`applySyncBatch` / `updatePrescription` / `buildTodayBundle` / `getActiveSession` paths: warm-up-only
groups and skipped slots do not trigger it, it is scoped to the completing session's own block and group,
decided records are untouched, replay converges, link→unlink with no intervening work correctly preserves
the prior record, and subsequent eligible progression still works. I also supplied the guarantee the
report's own evidence did not: a session started while **unlinked** keeps both decision surfaces after
the template is linked mid-session, and on completion the loop correctly does not fire, so that group is
evaluated normally. V-2 is fixed across all four lifecycle conditions and V-3's guard is now genuinely
discriminating. Full suites are green on a first-run disposable database: 1419 unit, 508 + 17-skipped
integration, **172 E2E, 0 failed**.

One finding blocks.

**W-1 (MEDIUM, new regression introduced by this pass).** The new supersede loop runs inside
`assembleAndEvaluate` for **both** modes. In `reevaluate` mode it has none of the per-(slot, groupKey)
still-pending guard that `toPersist` gives the supersede call fifty lines below it. So correcting a set
in an older session whose frozen snapshot is linked supersedes a **newer, legitimate** pending record for
that group. Reproduced, with a clean attribution control — same journey, only the loop toggled:

```text
loop OFF : after the linked session, back-off pending = 1 (the original V-1 defect)
           after correcting a set in that older session → 1  (session 3's record SURVIVED)
loop ON  : after the linked session, back-off pending = 0 (V-1's fix working)
           after correcting a set in that older session → 0  (the newer record was KILLED)
```

The configuration needed is ordinary, not contrived — a `manual` per-group override on the sibling, which
is exactly the pairing Stage A's own M-2 test exists to support. The consequence is silent loss of correct
state triggered by an unrelated action (fixing a historical typo). It is one guard away from correct, in
the same function, with the shape already used beside it.

Two LOWs follow from the same root — the loop's contexts were not fully enumerated: it is skipped entirely
when every group in the slot is manual (W-2), and it now fires on a deload week (W-3), a departure from
"a deload changes no recommendation state". Both reproduced.

---

## 1. Scope

Confirms V-1, V-2 and V-3 only. The A+B review, the F-1…F-9 remediation and its verification are
inherited as verified and were not re-run beyond what these three findings touch; V-4 was already closed
by the previous verification under its own authorisation and needed no action. I changed no product
source and no product test file. The repository files I wrote are this report and three
clearly-attributed documentary corrections to the implementation report (§8).

---

## 2. Environment, task-owned resources and contamination discipline

Clean at the start: nothing on :3000, no `node` process, no `gymapp_t_*` database (so `gymapp_t_sgres`
had genuinely been dropped).

| Resource | Created | Pairing proof |
|---|---|---|
| Database | `gymapp_t_sgresv` — created, migrated to `0014`, `drizzle-kit check` clean, seeded twice, dropped at the end | before `smoke.spec.ts`: 0 users in `gymapp_t_sgresv`, shared `gymapp` at 1 user / 1859 sessions. After the account was created **through the running server**: `gymapp_t_sgresv` 1 user, shared `gymapp` unchanged |
| App server | one production server on :3000 bound to it; started once, stopped at the end | port free before the start and after the stop; the listener stopped was confirmed to be this task's own |

The shared `gymapp` database was never written to and reads `1 | 1859 | 433` before and after. No two
suites overlapped.

**On the previous pass's dangling-dialog-handler incident (§13.6).** I structured my own controls so the
failure mode cannot recur rather than relying on care: **every negative control and every intentionally
failing run in this verification is integration-level** (PGlite, in-process, a fresh database per test,
no Playwright, no dialogs, no shared block schedule). I ran no intentionally-failing E2E at all. My one
browser probe creates only its own template and never calls `applyScheduleOverride`. I verified the
fixture directly either side of it:

```text
schedule BEFORE probe: E2E Phase 3 Day
schedule AFTER  probe: E2E Phase 3 Day
```

---

## 3. Finding dispositions

| ID | Sev | Disposition | How I verified it |
|---|---|---|---|
| **V-1** | MEDIUM | **Fixed for the reported defect — confirmed; but the fix introduces W-1** | NC-V1 **re-executed by me**: disabling the loop makes the remediation's own V-1 test fail while its coherence test still passes, exactly as §13.4 reports. All seven named boundary conditions independently reproduced (§4). The unlink resurfacing the review found is genuinely closed. |
| **V-2** | LOW | **Fixed — confirmed, all four conditions** | Persistence through unrelated edits and explicit dismissal are covered by the extended F-8 test and re-observed in my probe; the two conditions it does **not** cover — a subsequent invalidation replacing the message, and the save paths — I covered myself (§4, W2a/W2b). |
| **V-3** | LOW | **Fixed — confirmed** | The guard now asserts `toHaveCount(1)` on the real row **before** the delete and `0` after, using a non-exact `"160 kg"` match. It is discriminating by construction: a skipped delete leaves the row matching and fails the second assertion. The original `weightInput` = `110` and fallback-note assertions are preserved verbatim (§6). |
| V-4 | LOW | Already closed by the previous verification | No action; confirmed the §12.8 corrections are still in place. |

---

## 4. Independent reproductions

A temporary task-owned integration spec plus one browser probe, both deleted afterwards. No product
source or test file was modified to run them.

### 4.1 V-1 boundary conditions — all correct

| Probe | Question | Result |
|---|---|---|
| **P1** | Does a linked group with **only warm-up sets** trigger supersession? | **No.** `getWorkSetsByExercise` filters `isWarmup = false`, so the `sets.some(...)` guard never matches. Record stays `pending`. |
| **P2** | Does a **skipped slot** trigger it, even with linked-group sets present? | **No.** The `!c.row.skipped` pre-filter excludes the slot before the loop. Record stays `pending`. |
| **P3** | **Block scope** — does a completion under block B touch a record filed under block A? | **No.** Block A's record is still `pending` after a linked, performed completion under block B. `blockScope` does this by construction, as §13.2 claims. |
| **P4** | Are **already-decided** records touched? | **No.** An `accepted` record is still `accepted` afterwards (`WHERE decisionStatus = 'pending'` is unchanged). |
| **P5** | **Replay** — does re-applying the identical completion batch converge? | **Yes.** Record set identical across both applications; `rejected` empty both times. |
| **P7** | Does a session started while **UNLINKED** keep its frozen behaviour after the template is linked mid-session? | **Yes** — and this is the guarantee §13.2's own evidence did not supply. `getActiveSession` still returns **both** groups' recommendations after the template is linked. On completion the loop correctly does not fire (the frozen snapshot has no `link`), and Back-off is evaluated normally, producing a fresh record sourced from that very session. |

Also re-run and confirmed from the remediation's own suite: link→unlink **with no intervening workout**
leaves the prior record intact and reachable (its coherence test), sibling Top's lineage unaffected, and
a subsequent eligible session produces a fresh record.

### 4.2 The re-evaluation path — W-1

**P6.** Built the configuration that keeps `reevaluateForSourceSessionExercise`'s gate open while a newer
record exists: session 1 unlinked (both groups earn records) → link Back-off → session 2 linked and
performed (the loop supersedes session 1's record; Top's record from session 2 stays pending) → unlink
Back-off **and put Top on a `manual` per-group override** → session 3 evaluates Back-off only, so a fresh
record appears and session 2's Top record is never superseded → correct an existing set in session 2
through the real sync path.

```text
P6 back-off pending after the LINKED session 2: 0
P6 session-2 slot still holds a pending record: true      <- the re-evaluate gate is open
P6 back-off pending after correcting a set in the older LINKED session: 0
   — the newer legitimate record was KILLED
```

With the loop disabled, the identical journey ends `1 (source=session3 — SURVIVED)`. See §5 for the
control and §7 for the finding.

### 4.3 V-2's two uncovered lifecycle conditions

| Probe | Result |
|---|---|
| **W2a** — a **subsequent invalidation** replaces the message | **Correct.** After a second, different invalidation the notice reads *"Link cleared for **Mid**: …"* and no longer names Back-off — replaced with the fresh, accurate list rather than merged or appended, as §13.2 intends. |
| **W2b** — the **save** paths | **Correct.** A save forced to fail (intercepted, 400 `incompatible_prescription`) leaves the notice visible — the user still has an unsaved consequence to review. A successful save leaves none behind on reopening the editor. Matches the code: `setLinkNotice(null)` sits inside the `res.ok` branch only. |

### 4.4 Two observations from the same root

| Probe | Result |
|---|---|
| **P8** | A **deload** session with a linked, performed group **does** supersede (`back-off pending = 0`), while Top's own record stays pending because a deload produces no evaluation. Pre-fix, a deload superseded nothing at all — the loop runs before `evaluateSession`'s `results.length === 0` early return. → **W-3**. |
| **P9** | When **every** group in the slot is manual, `hasEvaluableStrategy` filters the slot out before the loop, so a linked-and-performed group is never superseded and the stale record **still resurfaces after unlink** (bundle returned both group keys). → **W-2**. |

---

## 5. Evidence executed here

All sequential, on the §2 pairing.

| # | Command | Result | Exit |
|---|---|---|---|
| 1 | `CREATE DATABASE gymapp_t_sgresv` | created | 0 |
| 2 | `pnpm db:migrate` | `migrations applied successfully!` (through `0014`) | 0 |
| 3 | `pnpm exec drizzle-kit check` | `Everything's fine` | 0 |
| 4 | `pnpm db:seed` ×2 | `Seed complete.` | 0 |
| 5 | `pnpm lint` | clean | 0 |
| 6 | `pnpm typecheck` | clean | 0 |
| 7 | `pnpm typecheck:sw` | clean | 0 |
| 8 | `pnpm format:check` | `All matched files use Prettier code style!` | 0 |
| 9 | `pnpm test:unit` | `Test Files 97 passed (97)` / `Tests 1419 passed (1419)` | 0 |
| 10 | `pnpm test:integration` | `Test Files 29 passed \| 6 skipped (35)` / `Tests 508 passed \| 17 skipped (525)` | 0 |
| 11 | `pnpm build` | production build completed | 0 |
| 12 | `pnpm exec playwright test tests/e2e/smoke.spec.ts` | `1 passed` + the §2 pairing proof | 0 |
| 13 | `pnpm tsx tests/e2e/seed.ts` | `E2E seed ready: …` | 0 |
| 14 | `pnpm test:e2e` | **`172 passed (3.5m)`** — 0 failed, 0 flaky, **first run on a fresh database** | 0 |
| 15 | `pnpm exec vitest run … setGroups.integration.test.ts` (after the control's restore) | `36 passed` | 0 |

All three suite figures match §13.7 exactly (1419 / 508 + 17 / 172).

### 5.1 Negative control — re-executed, and extended into an attribution control

Exact-byte backup, mutation, run, restore, SHA-256 verification. Integration-level throughout, so no
fixture could be contaminated (§2).

| Control | Mutation | Expected | Observed | Restored |
|---|---|---|---|---|
| **NC-V1** (re-executed) | `if (!group.link) continue;` → `if (true \|\| …) continue;` in `assembleAndEvaluate`; run `setGroups.integration.test.ts -t "V-1"` | the V-1 test fails; the coherence test (which asserts the opposite) still passes | **Both exactly as expected** — `× V-1 — a stale pending record … does not resurface after unlink`, `✓ V-1 coherence — link then unlink with no intervening workout` | `identical` (sha `2F848D16F9EF796A…`) |
| **W-1 attribution** | same mutation; run P6 with its intermediate state logged rather than asserted, so the test is state-agnostic | if the loop causes the kill, the newer record survives with it off and dies with it on | **Exactly that** — loop off: `1 (source=session3 — SURVIVED)`; loop on: `0 — the newer legitimate record was KILLED` | same restore |

**Independent corroboration of the pass's own controls.** Both backups it left in `%TEMP%` are still on
disk. `nc-v1-service-backup.ts` hashes `2F848D16F9EF796A…`, identical to the current `service.ts` and to
the hash §13.4 quotes. `nc-v3-spec-backup.ts` hashes `E0D3820BF2BC7C0D…`, matching §13.5's quoted hash;
it differs from the current spec by exactly one addition — the 153-line V-1 browser test appended
afterwards, with **zero** deleted lines — so the V-3 demonstration ran on a tree that already carried the
corrected guard, and its restore was byte-perfect at the time.

---

## 6. V-3 — the guard, assessed

The corrected assertion is discriminating **by construction**, independent of the demonstration:
`toHaveCount(1)` on `li:not(:has(li))` filtered by `"160 kg"` can only pass if the locator resolves to the
real set row, and `toHaveCount(0)` after can only pass if that row is gone. A skipped or failed delete
leaves the row matching and fails the second assertion — which is precisely what the old exact-match
`"160 kg × 2"` could never do, since `formatSetLine` appends the logged RIR and the count was zero either
way. §13.5's executed demonstration (the quoted `Expected: 0 / Received: 1`) is consistent with that and
corroborates it; the hash evidence in §5.1 shows it ran against the corrected tree. The original
assertions the guard sits between — `weightInput` `110` and the missing-reference fallback note — are
preserved verbatim, so the test's original purpose is intact and only the guard's discrimination changed.

---

## 7. Findings of my own

### W-1 — MEDIUM — the new loop, in `reevaluate` mode, supersedes a NEWER legitimate record

**Mechanism.** `assembleAndEvaluate` serves both `initial` and `reevaluate`. The supersede call fifty
lines below the new loop is driven by `toPersist`, which in `reevaluate` mode requires
`statusByKey.get(key) === "pending"` for that exact `(sourceSessionExerciseId, groupKey)` — the guard that
makes it safe to re-run against an old session, because a key superseded by a later session is skipped.
The new loop has no equivalent condition and no mode check; it fires whenever the frozen snapshot shows
`link` and the group has sets, then supersedes **every** pending record for that `(exercise, block,
groupKey)` — including ones sourced from later sessions.

**Reproduced** (§4.2), with the attribution control in §5.1. Reachability needs: a completed session
frozen as linked with sets in that group; that session's slot still holding a pending record (which opens
`reevaluateForSourceSessionExercise`'s gate); a newer pending record for the same group and block; and a
History correction to a set in the older session. The configuration that produces it — the sibling group
on a `manual` per-group override while this group progresses — is exactly the pairing Stage A's M-2 test
("a manual SLOT strategy with a non-manual GROUP override still progresses that group") exists to
support, so it is ordinary rather than contrived.

**Consequence.** A current, correct pending recommendation disappears silently, triggered by an unrelated
action. No logged fact is lost and the prefill falls back to carry-forward; it self-heals on the next
completed session. But it is the same class of harm V-1 itself was raised for — wrong recommendation
state presented to the athlete — now in the other direction.

**Not fixed here** (no product-code authorisation under this review). The shape of the fix is small and
already present beside it: gate the loop the way `toPersist` gates its neighbour, or skip it when
`mode === "reevaluate"`, plus a test. I marked §13.2's "Preservation, verified" list as narrowed rather
than wrong (§8) — every bullet it makes is true; it simply never considered the other mode.

### W-2 — LOW — the loop is skipped entirely when every group in the slot is manual

`candidates` filters on `hasEvaluableStrategy`, which is false when no group has a non-manual effective
strategy. A linked group is always manual, so a slot whose sibling is *also* manual is filtered out before
the loop, and V-1's own stated rule ("fires when the group is linked in this session's frozen snapshot and
has a logged set this session") does not hold there. Reproduced: the stale record survived a
linked-and-performed completion and **resurfaced after unlink**, with the bundle returning both group
keys.

This is **not** the manual-strategy analogue §13.2 deliberately excludes. That exclusion is about a group
that is manual *without* a link, whose card simply shows continuously; here the group **is** linked and
the fix is meant to cover it. A narrower gap in the fix's own scope, not a refusal to broaden it — worth
recording so the boundary is honest either way.

### W-3 — LOW — a deload session now supersedes a linked group's pending record

The loop runs before `evaluateSession` and therefore before the `results.length === 0` early return, and
it has no `isDeload` condition. Reproduced: after a deload session with the linked group performed, its
pending record is `superseded` while Top's stays `pending` (a deload produces no evaluation). Pre-fix a
deload session changed no recommendation state at all, which is the convention A-15 and
`recommendationForDeload` both express. The new behaviour is arguably defensible — real work was logged —
but it is a change, it is undocumented, and the same guard placement W-1 needs would naturally settle it.

### W-4 — LOW — two documentary corrections, applied by me

Both are **my own edits**, marked as such in the implementation report, **not independently reviewed by
anyone else**:

1. **§13.10 repeats the exact category error V-4 corrected in §12.8** — the two negative-control backups
   are listed under "Created and dropped" while the same bullet says they are "left in place". Both were
   still on disk when I checked, and I used them for the corroboration in §5.1. Moved under a new
   "Created and left in place (outside the repository)" heading.
2. **§13.2's "Preservation, verified, not merely asserted" list is incomplete** — narrowed with a pointer
   to W-1, stating that every bullet it makes was independently confirmed and that the list covers the
   `initial` path only.

---

## 8. Documentary edits I made

Three, all in `docs/reviews/set-groups-stage-b-implementation.md`, each carrying an inline HTML comment
naming this report, the finding, and the fact that it is my own unreviewed edit: the §13.2 narrowing
pointer, and the §13.10 heading split (moving the two backup bullets out of "Created and dropped").
`docs/` is `.prettierignore`d, so no `format:check` applies to them; the tree-wide gate is green anyway
(§5, gate 8).

---

## 9. Verdict

V-1, V-2 and V-3 are all genuinely fixed, and I confirmed every sub-condition the task listed — including
the two the remediation's own evidence did not establish (a running **unlinked** session's frozen
behaviour after a mid-session template link, and V-2's subsequent-invalidation and save paths). The
negative control re-executes as reported, the suites are green on a first-run database, and the
deliberate exclusion of the manual-strategy analogue is a sound boundary that I have not tried to widen.

But the V-1 fix introduces W-1: a silent loss of a correct, current recommendation whenever a set is
corrected in an older session frozen as linked, reproduced with a clean attribution control that isolates
the new loop as the cause. It is a MEDIUM, which agent-workflow §4 would allow the owner to defer — but it
is a regression *created by this pass*, in the exact mechanism under review, undetected by it because the
preservation analysis never considered `assembleAndEvaluate`'s second mode, and it is one guard away from
correct in the same function. Releasing it silently would repeat, in the opposite direction, precisely the
wrong-recommendation-state problem the owner selected V-1 to eliminate. W-2 shows the same enumeration gap
leaves a linked group uncovered in a second configuration, and W-3 a third.

**REVISION REQUIRED**

Bounded remediation scope, in priority order: **W-1** (add the still-pending-from-this-slot condition the
neighbouring supersede call already uses, or skip the loop in `reevaluate` mode; cover it with an
integration test built on the P6 journey). **W-2** and **W-3** should be either fixed in the same pass —
both fall out of enumerating the loop's contexts once — or consciously accepted and recorded in §13.8.
**W-4** is already applied. Nothing else in V-1…V-3 needs rework: the rule itself, its scoping, its
guards and its read-path effects are all correct.

Inherited limitations, explicitly unchanged and still open: **L-7** (reverse-conversion pending-record
asymmetry), **L-8** (`assignGroupKeys` trusting a client-supplied key, widened slightly by `link.ref`),
the general Stage A group add/remove/reorder browser-coverage gap, the **Stage A `manual`-strategy
analogue** to V-1 (a manual group's stale card shows continuously — deliberately out of scope, correctly
so), and the historical `setGroupsOffline.spec.ts` dead letter, which passed again in my 172-test run:
one more non-reproduction, cause still unresolved, instrumentation still live.

A+B remain one release. This verdict authorises no commit, push or deployment, and none was made or
attempted. **Physical iPhone device acceptance remains outstanding** and has no substitute.

---

## 10. Drop what you created, list what you did not

**Created and dropped:**

- Database `gymapp_t_sgresv` — created, migrated, seeded twice, used for every gate, probe and control
  here, then dropped. `SELECT datname … LIKE 'gymapp_t_%'` returns no rows.
- One production app server on :3000 bound to it — started once, stopped. Port confirmed free.
- `tests/integration/zzResidualVerify.integration.test.ts` and `tests/e2e/zzV2Probe.spec.ts` — temporary
  task-owned probes; both deleted, `git status` shows no trace.
- `test-results/` — Playwright artefacts; removed.
- One negative-control mutation in `src/server/progression/service.ts` — restored byte-for-byte,
  SHA-256 verified (`2F848D16F9EF796A…`), and the restored tree re-verified green (§5, gates 9/15).

**Created and left in place (outside the repository):**

- My own backup `ncv1-verify.bak` and the suite logs, in this session's scratchpad directory.

**Created and deliberately left behind:**

- This report, and the three attributed documentary corrections in
  `docs/reviews/set-groups-stage-b-implementation.md` (§8) — uncommitted, like the rest of the lineage.

**Not created, not dropped, deliberately untouched:**

- The shared `gymapp` database — never written to; `1 | 1859 | 433` before and after; its `0014`
  migration left as-is.
- The V-1…V-3 pass's two `%TEMP%` backup files — not mine to delete; read for the §5.1 corroboration and
  left exactly as found.
- The five pre-existing `gymapp_*` disposable databases from earlier tasks, the `gym-app-db-1` container
  (already running, left running), every earlier report in the Set Groups lineage, and all concurrent
  PI-017 work.
