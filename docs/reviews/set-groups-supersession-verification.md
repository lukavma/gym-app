# Set Groups (PI-012) — supersession (W-1…W-3) verification

**Date:** 2026-09-13
**Role:** targeted verification (fresh session; confirms the listed finding IDs only, does not re-review)
**Session:** `O-Max | P10 | Verification — PI-012 Set Groups Supersession`
**Model:** claude-opus-5 (1M context)
**Tree:** `583a9ab` (dirty) — Stage A + Stage B + the F-1…F-9, V-1…V-3 and W-1…W-3 remediations, all
uncommitted, alongside the concurrent, unrelated PI-017 work (untouched here).
**Inputs read:** [set-groups-release-residual-verification.md](set-groups-release-residual-verification.md)
§7 (W-1…W-3) and [set-groups-stage-b-implementation.md](set-groups-stage-b-implementation.md) §14 plus
the corrected §13.2, then `assembleAndEvaluate` and the three new integration tests.
**Scope:** frozen to these corrections and regressions they introduce. No unrelated accepted limitation
and no part of the A+B architecture was reopened.
**Verdict:** see §8.

---

## 0. Summary

All three are fixed, and the fix is coherent rather than three patches: one session-level gate pair
(`mode === "initial" && !session.isDeload`) and one per-group condition pair (`group.link` + a logged
non-warm-up set), iterating the base candidate list instead of the progression-filtered one. Every claim
in §14.1's behaviour matrix that I could construct a case for, I constructed and ran.

- **W-1** — I rebuilt the P6 journey from scratch and it now passes: the re-evaluation gate genuinely
  opens on the older linked session (`gate open: true`), and session 3's newer record survives the
  historical correction. NC-W1 re-executed: dropping the mode gate fails both the pass's own W-1 test
  and my independent journey, which prints the original symptom verbatim (`0 — KILLED`).
- **W-2** — an all-manual grouped slot now supersedes its linked, performed group and the record no
  longer resurfaces after unlink. Ordinary progression candidate filtering is genuinely unchanged: M-2's
  manual-slot-plus-non-manual-group case still progresses exactly the one group it should.
- **W-3** — a deload session changes **zero** recommendation rows (compared by id, status and
  `updated_at`), and the documented consequence is real: after a later unlink the stale record is
  reachable again, exactly as before V-1's fix existed.

I also ran two negative controls the pass did not (W-2 and W-3, both LOW and exempt under
agent-workflow §6's inspection-only class): both discriminate, so all three fixes are load-bearing.

On the two things the task flagged as not-to-be-taken-on-trust:

**The initial-only rule holds, but not for the reason given.** §14.1/§14.2 and the production code
comment justify it with *"a linked group … can never have a recommendation row sourced from its own
slot."* That premise is false — I sent a client-computed `recommendation` op for a linked group's own key
and the server accepted it (`rejected=[]`, one pending `computedBy=client` row). The conclusion survives
for a stronger reason I verified instead: `toPersist` is derived from `results`, and `evaluateSession`
never yields a linked group in either mode, so the guard could never permit a supersede for a linked key
whatever rows exist. Call-site provenance independently confirms initial-only loses nothing (§4.2).
Documentary (X-1); the code comment is carried forward.

**The E2E reuse argument does not cover W-2, so I ran E2E rather than argue about it.** W-2 removed
`hasEvaluableStrategy` from `candidates`, which changes the execution path of every completion whose slot
has no evaluable strategy — including an ordinary ungrouped manual slot, previously an early return.
That is an ordinary user path and §13.7's run predates it. Full suite on this tree: **172 passed, 0
failed**, first run on a fresh disposable database (X-3).

Three LOW documentary findings, all corrected in place (§6). Nothing blocking.

---

## 1. What changed, confirmed against the code

| Gate | Code | Verified |
|---|---|---|
| W-1 | loop wrapped in `if (mode === "initial" && …)` | §4.1 W1, §5.1 NC-W1 |
| W-3 | same condition's `&& !session.isDeload` | §4.1 W3, §5.1 NC-W3 |
| W-2 | `candidates` is now the base `!skipped && parseable` list; `toEvaluate = candidates.filter(hasEvaluableStrategy)`; the loop iterates `candidates`; `workSets` widened to `candidates` | §4.1 W2a/W2b/W2c, §5.1 NC-W2 |

§13.2's rule statement is genuinely corrected in place with an explicit marker, and its four-part
statement — (a) `initial`, (b) not deload, (c) frozen `link`, (d) a logged non-warm-up set, regardless of
slot evaluability — matches the code exactly. The `firstGroupKeyOf(snapshot) === group.key` branch
remains structurally dead for links (a link must reference an *earlier* group, so group 0 can never be
linked); harmless, unchanged by this pass, noted only so a later reader does not mistake it for live
behaviour.

---

## 2. Environment and task-owned resources

Clean at the start: nothing on :3000, no `node` process, no `gymapp_t_*` database.

| Resource | Created | Pairing proof |
|---|---|---|
| Database | `gymapp_t_sgsup` — created, migrated to `0014`, `drizzle-kit check` clean, seeded twice, dropped at the end | before `smoke.spec.ts`: 0 users in `gymapp_t_sgsup`, shared `gymapp` at 1 user / 1859 sessions. After the account was created **through the running server**: `gymapp_t_sgsup` 1 user, shared `gymapp` unchanged |
| App server | one production server on :3000 bound to it, built with `DATABASE_URL` pointed at it; started once, stopped at the end | port free before the start and after the stop |

Shared `gymapp` reads `1 | 1859 | 433` before and after. Every negative control ran at integration level
(PGlite, fresh database per test, no Playwright, no shared fixture), so no intentionally-failing run
could contaminate anything — the same discipline §14.6 adopted, which I confirm was sound.

---

## 3. Use of PGlite versus real Postgres

PGlite is the right level for everything here and I used it deliberately, not for convenience. The change
is a single `UPDATE … WHERE decision_status = 'pending'` inside the existing completion transaction, plus
a candidate-list widening; it introduces no new index, no new lock, no new ordering requirement, and no
concurrency surface. `uq_recs_one_pending` and the `blockScope`/`groupKeyScope` predicates are untouched.
PGlite is real Postgres semantics, so an empty-`IN` or constraint problem would surface identically —
which matters for W-2, whose widened path now issues `inArray(exercises.id, [])` whenever `toEvaluate` is
empty (drizzle-orm 0.44.7 renders that as `false`; W2b exercises it end to end).

I found no uncovered database or concurrency concern that would warrant a real-Postgres or gated
concurrency run, and did not perform one. The one thing PGlite cannot speak to — the real route wiring and
a real server — is covered by the full E2E run in §5.

---

## 4. Independent reproductions

A temporary task-owned integration spec, since deleted. No product source or test file was modified.

### 4.1 W-1, W-2, W-3 and the V-1 boundaries

| Probe | Question | Result |
|---|---|---|
| **W1** | Rebuild the P6 journey independently: link → linked session with real work → unlink with Top moved to a manual override → a third unlinked session → correct an existing set in the older linked session. | **Fixed.** `gate open on the older linked session: true` (so the fix is actually being exercised, not bypassed), then `back-off pending after the historical correction: 1 (session 3 — SURVIVED)`. |
| **W2a** | All-manual grouped slot with a linked, performed group. | **Fixed.** `back-off pending after completion=0`; after unlink the bundle surfaces only Top's key. |
| **W2b** | The broad path W-2 changed: an ordinary **ungrouped manual** slot completing (previously an early return, now runs on with an empty `toEvaluate`). | **Clean.** `rejected=[] status=completed recs=0`. No empty-`IN` breakage, no failed completion. |
| **W2c** | Is ordinary candidate filtering unchanged? M-2's manual slot default + non-manual group override. | **Unchanged.** `recs=["back:pending"]` — the overriding group progresses, the manual sibling produces nothing, exactly as before. |
| **W3** | Does a deload change recommendation state? | **No.** `deload changed zero rows: true` (id + status + `updated_at` compared). Then the documented consequence: after unlink, `post-unlink surfaced: [both keys]` — the stale record legitimately reachable again. |
| **R1** | Warm-up-only linked group. | Still does not supersede. |
| **R2** | Skipped slot. | Still does not supersede. |
| **R3** | Block scope — a completion under block B. | Block A's record still `pending`. |
| **R4** | An already-`accepted` record. | Still `accepted`. |
| **R5** | Replay of the identical linked completion batch. | Converges identically. |

R1–R5 matter because W-2 widened the list the loop iterates; they confirm the widening did not weaken any
V-1 boundary that the earlier verification established.

### 4.2 The initial-only rule — call sites and provenance

Validated against the code, not the equivalence argument:

- `assembleAndEvaluate` has exactly two callers. `evaluateCompletedSession` passes `"initial"` and is
  called from one place — `applyWorkoutSessionUpsert`, only when `payload.status === "completed"`,
  **inside the completion transaction**, and only on a real in-progress → completed transition (a
  replayed completion is a no-op before reaching it). `reevaluateForSourceSessionExercise` passes
  `"reevaluate"` from two set-log paths, each gated on a pending record sourced from that slot.
- A session's "frozen as linked, and work was logged into that group" state is therefore a **new fact
  exactly once**, at the initial evaluation, and that path is guaranteed to run once per completion.
  Anything pending at that moment is superseded then; anything created afterwards is by definition newer
  and must not be touched. Initial-only loses nothing — independent of any claim about rows.

**Record provenance (PR1).** The stated premise is false. I built a valid client-computed
`recommendation` op for the **linked** group's own key, sourced from that group's own slot:

```text
PR1 client rec for a LINKED group: rejected=[]; self-sourced rows=1 status=pending computedBy=client
```

`applyRecommendationUpsert` validates the key with `isValidGroupKeyForSnapshot` (is it a group of the
frozen snapshot) and never consults `link`, so such a row is accepted. The current client cannot produce
one — its own `evaluateSession` skips linked groups — so this is latent, not live. It changes nothing
about the fix's correctness: the loop is skipped in `reevaluate` regardless, and in `initial` it would
simply supersede that row like any other pending one. What it does invalidate is the premise, in §14.1,
§14.2 and the code comment. See X-1.

---

## 5. Evidence executed here

| # | Command | Result | Exit |
|---|---|---|---|
| 1 | `pnpm lint` | clean | 0 |
| 2 | `pnpm typecheck` | clean | 0 |
| 3 | `pnpm typecheck:sw` | clean | 0 |
| 4 | `pnpm format:check` | `All matched files use Prettier code style!` | 0 |
| 5 | `pnpm test:unit` | `Tests 1419 passed (1419)` / 97 files | 0 |
| 6 | `pnpm test:integration` | `Test Files 29 passed \| 6 skipped (35)` / `Tests 511 passed \| 17 skipped (528)` | 0 |
| 7 | `CREATE DATABASE gymapp_t_sgsup` → `db:migrate` → `drizzle-kit check` → `db:seed` ×2 | `migrations applied successfully!`, `Everything's fine`, `Seed complete.` | 0 |
| 8 | `pnpm build` (with `DATABASE_URL` on the disposable database) | production build completed | 0 |
| 9 | `pnpm exec playwright test tests/e2e/smoke.spec.ts` | `1 passed` + the §2 pairing proof | 0 |
| 10 | `pnpm tsx tests/e2e/seed.ts` | `E2E seed ready: …` | 0 |
| 11 | `pnpm test:e2e` | **`172 passed (3.5m)`** — 0 failed, 0 flaky, first run on a fresh database; all 14 `setGroups.spec.ts` tests and `setGroupsOffline.spec.ts` among them | 0 |
| 12 | `pnpm test:unit`, `pnpm format:check` (after the controls' restores) | 1419 passed; prettier clean | 0 |

Unit and integration figures match §14.5 exactly (1419 / 511 + 17). E2E was **not** inherited — see X-3.

### 5.1 Negative controls

Exact-byte backup, mutation, run, restore, SHA-256 verification; all integration-level.

| Control | Mutation | Expected | Observed | Restored |
|---|---|---|---|---|
| **NC-W1** (re-executed) | `if (mode === "initial" && !session.isDeload)` → `if (!session.isDeload)` | the pass's W-1 test fails | **Failed as expected**, and so did my independent W1 journey, printing `back-off pending after the historical correction: 0 — KILLED` — the original W-1 symptom verbatim | `identical` |
| **NC-W2** (mine, not required) | loop iterates `toEvaluate` instead of `candidates` | the all-manual case regresses | **Failed as expected** — `back-off pending after completion=1; surfaced after unlink=[both keys]` | `identical` |
| **NC-W3** (mine, not required) | drop `&& !session.isDeload` | the deload case regresses | **Failed as expected** — `deload changed zero rows: false` | `identical` |

All restores verified against SHA-256 `E3169FA2B3C8DAF6B848B229383BB102BBB9C726C1D18B815913C5B483CC4850`,
which is also the hash §14.4 quotes and the hash of the backup that pass left in its own scratchpad —
three independent agreements that the W-pass's own restore was byte-perfect and its quoted hash genuine.

---

## 6. Documentary corrections I made

Three, all in `docs/reviews/set-groups-stage-b-implementation.md`, each with an inline HTML comment
naming this report, the finding, and the fact that it is my own unreviewed edit:

1. **§14.1** — a premise-correction marker for X-1: the "can never have a recommendation row sourced from
   its own slot" justification is false; the conclusion holds via `results`/`toPersist` instead.
2. **§14.6** — "Every gate and the negative control ran against PGlite" narrowed to "the integration suite
   and the negative control", since lint/typecheck/typecheck:sw/format:check/test:unit touch no database
   and the same paragraph then concedes `pnpm build` resolved the shell's own `DATABASE_URL` (X-2).
3. **§14.5.1** — the E2E-reuse paragraph marked as accurate for W-1/W-3 only, with a pointer to the full
   suite I ran instead (X-3).

`docs/` is `.prettierignore`d, so no `format:check` applies to them; the tree-wide gate is green anyway.

---

## 7. Findings of my own — all LOW, all documentary

### X-1 — LOW — the stated premise for initial-only is false; the conclusion is not

Demonstrated in §4.2 (PR1). The rule is correct and independently justified by call-site provenance and by
`results` never containing a linked group; only the "can never have a row sourced from its own slot"
sentence is wrong. Corrected in the report. **The same sentence is in the production code comment**
(`src/server/progression/service.ts`, the W-1 paragraph), which is outside this review's authorisation to
change — carried forward in §8.

### X-2 — LOW — "every gate ran against PGlite" was inaccurate and self-contradicting

§14.6 claimed every gate ran against PGlite, then stated in the same paragraph that `pnpm build` resolved
whatever `DATABASE_URL` the shell held — in this repo `.env.local`, i.e. the shared `gymapp`. Five of the
gates touch no database at all. No harm resulted: the shared database reads `1 | 1859 | 433` before and
after both passes, and `next build` performs no write. Narrowed in place.

### X-3 — LOW — the E2E reuse justification did not cover W-2

The matrix argument ("service change, no route contract changed ⇒ full E2E not required") stands on its
own. The supporting claim that the fixes "only ADD conditions narrowing exactly when the loop fires" is
true of W-1 and W-3 but not of W-2, which changed the execution path of every completion whose slot has no
evaluable strategy — an ordinary user path that §13.7's run predates. I did not rely on the reuse: §5 gate
11 is a full suite on this tree, and W2b covers the same path at the service level. Marked in place.

---

## 8. Verdict

W-1, W-2 and W-3 are fixed, and I verified each against the code and against reproductions I built rather
than against the report's reasoning. The W-1 journey that previously destroyed a newer recommendation now
preserves it, with the re-evaluation gate demonstrably open; the all-manual slot is covered without
disturbing ordinary progression candidate filtering; a deload changes zero rows, with its post-unlink
consequence reproduced and therefore genuinely documented rather than merely asserted. All three gates are
load-bearing under executed negative controls, the V-1 boundaries survive the candidate widening, and the
full browser suite passes on this tree — run, not inherited.

What remains is three LOW documentary inaccuracies, all corrected in place, none of which changes any
disposition, count or behaviour. The engineering is sound.

**VERIFIED — READY FOR SET GROUPS A+B RELEASE CLOSEOUT**

### Carried forward — nonblocking improvements, explicitly unclaimed

1. **The code comment's false premise (X-1).** `src/server/progression/service.ts`'s W-1 paragraph still
   says a linked group "can never have a recommendation row sourced from its own slot." Outside this
   review's authorisation; worth a one-line correction to the `results`/`toPersist` formulation whenever
   that file is next touched.
2. **Sync-boundary hardening for L-1.** `applyRecommendationUpsert` accepts a client-computed
   recommendation for a linked group's key (PR1). Latent today — no shipped client emits one — but
   mirroring `checkPrescriptionCompatibility`'s L-1 rule at the sync boundary would make the record space
   match the rule the rest of the system enforces. A genuine improvement, not a defect; deliberately not
   opened here.
3. **The dead `firstGroupKeyOf(snapshot) === group.key` branch** inside the loop (§1) — unreachable for
   links by the schema's own "reference an earlier group" invariant.

### Inherited limitations — unchanged, still open

**L-7** (reverse-conversion pending-record asymmetry), **L-8** (`assignGroupKeys` trusting a
client-supplied key, widened slightly by `link.ref`), the general Stage A group add/remove/reorder
browser-coverage gap, the **Stage A `manual`-strategy analogue** to V-1 (a manual group's stale card shows
continuously — deliberately out of scope and correctly so), and the historical
`setGroupsOffline.spec.ts` dead letter, which passed again in my 172-test run: one more non-reproduction,
cause still unresolved, instrumentation still live.

A+B remain one release. This verdict authorises no commit, push or deployment, and none was made or
attempted. **Physical iPhone device acceptance remains outstanding** and has no substitute.

---

## 9. Drop what you created, list what you did not

**Created and dropped:**

- Database `gymapp_t_sgsup` — created, migrated, seeded twice, used for the build/E2E pairing, dropped.
  `SELECT datname … LIKE 'gymapp_t_%'` returns no rows.
- One production app server on :3000 bound to it — started once, stopped. Port confirmed free.
- `tests/integration/zzSupersessionVerify.integration.test.ts` — temporary task-owned probe; deleted,
  `git status` shows no trace.
- `test-results/` — Playwright artefacts; removed.
- Three negative-control mutations in `src/server/progression/service.ts` — each restored byte-for-byte
  and SHA-256 verified; the restored tree re-verified green (§5 gate 12).

**Created and left in place (outside the repository):**

- My own backup `ncw-verify.bak` and the suite logs, in this session's scratchpad directory.

**Created and deliberately left behind:**

- This report, and the three attributed documentary corrections in
  `docs/reviews/set-groups-stage-b-implementation.md` (§6) — uncommitted, like the rest of the lineage.

**Not created, not dropped, deliberately untouched:**

- The shared `gymapp` database — never written to; `1 | 1859 | 433` before and after; its `0014`
  migration left as-is.
- The W-pass's `nc-w1-service-backup.ts` in its own scratchpad — not mine to delete; hashed for the §5.1
  corroboration and left as found.
- The five pre-existing `gymapp_*` disposable databases from earlier tasks, the `gym-app-db-1` container,
  every earlier report in the Set Groups lineage, and all concurrent PI-017 work.
