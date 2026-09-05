# Warm-up Set Classification — Final-Target Verification (Appendix §13 vs. W-1…W-4)

Date: 2026-09-05
Role: independent final-target verification of **§13 only** — the second follow-up addendum in `docs/reviews/warmup-set-classification-remediation.md` — against **W-1 through W-4** of `docs/reviews/warmup-set-classification-remediation-verification-2.md`, which this verifier authored.
Reviewed state: `main` @ `7d6bc6c` with the round-3 working tree.
Scope: already-verified production behaviour (F-1, V-1, V-2, V-3) was **not reopened**. Nothing was remediated. Both mutation controls were reverted byte-identically (§5).

---

## 1. Verdict

# `CLOSED — VERIFIED`

**W-1 is genuinely fixed, W-2 through W-4 are corrected accurately, and nothing regressed.** No findings remain open. This closes the F-1 warm-up-set-classification remediation across all three rounds.

The decisive result: the mutation that **survived** round 2 now **fails**, at exactly the assertion the added reload was meant to make load-bearing. Independently reproduced, not taken from the report.

| Finding | Status | Basis |
| --- | --- | --- |
| **W-1** — V-2 test vacuous on the seeding path | **FIXED, verified** | M-4 re-run now fails; both directions of a broken seed are caught (§2) |
| **W-2** — "the sentence is now accurate" overstated | **CORRECTED, accurate** | Correction text matches this verifier's measurements verbatim (§3.1) |
| **W-3** — one of three exposed specs named | **CORRECTED, accurate** | All three named with exact line refs; refs and test counts verified (§3.2) |
| **W-4** — "assertions" → "tests" | **CORRECTED, accurate** | §12 now reads "tests"; counts match round 1 (§3.3) |

Every figure §13 claims reproduces: typecheck / typecheck:sw / lint clean, `format:check` clean but for the pre-existing `sync/service.ts` CRLF warning, unit **557/557**, integration **301/301** + 15 pre-existing skips, full Playwright **96/96**, and the four affected specs **10/10**.

---

## 2. W-1 — the added remount makes the broken seed fail

**The change.** One line plus its comment in `tests/e2e/warmupSetClassification.spec.ts`: `await page.reload();` between the first Save (work → warm-up) and the second re-open (weight-only edit) — exactly the point §3.3 of the second verification named. No production file was touched for W-1; confirmed by diffing the round-2 snapshot against the current tree, where the only production change is W-3's comment.

**Why it works.** `SetRow` is keyed `key={set.id}`, so re-opening the editor on the same set does not remount it and the local `isWarmup` state carries over from the prior Save, whatever `useState(...)` was seeded with. A reload forces a genuine remount, so the following assertion can only pass by actually reading `set.isWarmup` from a fresh instance.

### 2.1 The round-2 mutation, re-run

**M-4** — `SetRow`'s seed changed from `useState(set.isWarmup)` to `useState(false)`, rebuilt from source, spec re-run:

```
5 passed, 1 failed
1) warmupSetClassification.spec.ts:173 › in-session reclassification (V-2)
   Error: expect(locator).toBeChecked() failed
   Locator: ...locator('li:not(:has(li))')
            .filter({ has: getByRole('button', { name: 'Save' }) })
            .getByLabel('Warm-up set')
   Expected: checked
   Received: unchecked
```

This is the mutation that passed **6/6** in round 2 while silently rewriting `is_warmup` from `t` to `f` in PostgreSQL on a weight-only edit. It now fails, and it fails at the reload-guarded assertion rather than incidentally elsewhere. §13's claimed result (5/6, that test, that assertion) is exact.

### 2.2 Both directions of a broken seed are covered

A guard that only catches one polarity would leave the mirror defect invisible, so the opposite mutation was also applied — **M-4b**, seed `useState(true)`:

```
5 passed, 1 failed
1) warmupSetClassification.spec.ts:173 › in-session reclassification (V-2)
   Error: expect(locator).not.toBeChecked() failed
   Expected: not checked
   Received: checked
```

Caught by the pre-existing first assertion (a work set's editor must open unchecked). So `useState(false)` is caught by the new reload-guarded assertion and `useState(true)` by the original one: **the seeding path is guarded in both directions.** This check was not in §13; it holds.

### 2.3 Scope of the guard, stated precisely

The reload makes the *second* editor open a fresh mount. The third re-open (the flip-back) still reads carried-over state and remains non-load-bearing on its own. That is sufficient — one load-bearing assertion per polarity is what catches the defect class, as §2.1 and §2.2 demonstrate — and worth recording only so a future editor does not mistake the third assertion for independent coverage.

---

## 3. W-2 through W-4 — are the corrections accurate?

§13 corrects these inline at the sentences they concern in §12, while appending the record to §13, and says so explicitly. §12's superseded text is left in place with the correction attached, which preserves the audit trail rather than rewriting history. That is the same convention §12 itself used for V-4, applied consistently.

### 3.1 W-2 — **ACCURATE**

§12's V-4 item 2 now carries: *"the fix derives from the last logged set, so it only survives a remount once the athlete has already logged at least one set at that classification… Measured on the shipped code: toggle checked with zero sets logged → `true` before reload, `false` after; toggle checked after a work set but before the next Log → same."*

Against this verifier's own measurements:

```
case 1 — checked, zero sets logged, before reload: true    after: false
case 2 — checked after a work set,   before reload: true    after: false
case 2 — the set the athlete believed was a warm-up logged as: 40 kg × 12
```

Verbatim match, including the consequence (the next set is silently recorded as work). The replacement statement it lands on — *"it now survives a remount whenever the athlete has already logged at least one set at that classification"* — is the correct general form, and its severity framing (narrower than V-1, no already-logged data at risk, not worth reopening) matches the second verification's own recommendation.

One refinement, offered as an observation rather than a finding: the corrected passage describes only the checked-then-lost direction. Because `deriveWarmupToggleDefault` reads `sets.at(-1)?.isWarmup` unconditionally, the mirror case is equally true — *un*checking after a warm-up set and remounting before logging restores the box to checked. That direction is the safe one (a work set would be marked warm-up, which under-counts rather than corrupts progression inputs), and the general replacement sentence already covers it, so no text change is needed.

### 3.2 W-3 — **ACCURATE**

Corrected in two places, both checked:

- **§12's V-2 section** now names all three specs with their exact locator forms: `offline-set-edit-delete.spec.ts` (`.nth(0)`/`.nth(1)`), `reconnect-batch-idempotence.spec.ts:83`, `transient-failure-fifo.spec.ts:75`.
- **`src/ui/workout/ExerciseCard.tsx`'s placement comment** now names the same three. Diffed against the round-2 snapshot: the change is **comment-only**, no code moved, no JSX altered.

Both line references verified exact in the current tree:

```
reconnect-batch-idempotence.spec.ts:83   await editing.locator("input").nth(0).fill("101");
transient-failure-fifo.spec.ts:75        await row.locator("input").nth(0).fill("65");
```

§13's run counts also match the specs' real sizes — `offline-set-edit-delete` 1 test, `reconnect-batch-idempotence` 2, `transient-failure-fifo` 1 — so its "1/1, 2/2, 1/1" is right, and all four affected specs pass together (§4).

### 3.3 W-4 — **ACCURATE**

§12's V-4 item 1 now reads "fails 2 of 4 e2e **tests**" and "fails 1 of 4 **tests**". Those are the round-1 figures exactly: reverting `ExerciseCard`'s pass-through failed 2 of 4 tests; reverting `HistoryDetail`'s failed 1 of 4. The counts were always right; the noun is now right too.

### 3.4 Both prior verification reports are unmodified

§13 claims neither verification report was modified. Checked: both retain their verdict headings (`VERIFIED`, `VERIFIED WITH ONE COVERAGE GAP`), their complete finding tables (V-1…V-4, W-1…W-4 with unchanged severities and wording), and the §3.3 M-4 evidence including the `SURVIVED` row and the raw `UNCHECKED` transcript. Nothing was softened or removed.

---

## 4. Verification runs

All on the restored, byte-identical tree unless stated.

| Check | Result | §13 claimed |
| --- | --- | --- |
| `pnpm typecheck` / `typecheck:sw` / `lint` | clean | clean ✓ |
| `pnpm format:check` | one pre-existing `src/server/sync/service.ts` CRLF warning | same ✓ |
| `pnpm test:unit` | **557/557**, 43 files | 557/557 ✓ |
| `pnpm test:integration` | **301/301**, 15 skipped | 301/301 + 15 ✓ |
| `warmupSetClassification` + the three positional specs | **10/10** | 10/10 ✓ |
| Full Playwright, all 30 specs | **96/96** | — (unchanged from §12's round) ✓ |
| **M-4** (`useState(false)`) | **5/6 — fails at the reload-guarded assertion** | 5/6 ✓ |
| **M-4b** (`useState(true)`) | **5/6 — fails at the original assertion** | not claimed; verified here |

Environment: the repository's own local Docker PostgreSQL 16 (`gym-app-db-1`, `localhost:5432`) per `CLAUDE.md`, a production build, Chromium. Production was never accessed. `DATABASE_URL` must be exported in the runner's environment for `muscleTaxonomyV2.spec.ts` and `volume.spec.ts` — a harness detail noted in both prior verifications, not a code defect.

---

## 5. Cleanup and working-tree state

Two mutation controls (M-4, M-4b) were applied one at a time to `src/ui/workout/ExerciseCard.tsx`, each with a full rebuild, and reverted from a byte copy. SHA-256 before and after:

| File | Hash (identical before and after) |
| --- | --- |
| `src/ui/workout/ExerciseCard.tsx` | `093D62CF…9EAF` |
| `tests/e2e/warmupSetClassification.spec.ts` | `9FB5F0A4…9C04` |
| `src/ui/workout/WarmupCard.tsx` | `54D85B63…A186` |
| `src/ui/history/HistoryDetail.tsx` | `688E856E…8C76` |
| `tests/e2e/warmupWorkout.spec.ts` | `3D824D38…2BBB` |

`git diff --stat -- src/ tests/` is again exactly `4 files changed, 125 insertions(+), 20 deletions(-)`, and the affected specs are green on the restored tree. Every unrelated and concurrent change was left untouched, including the user-owned `CLAUDE.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`, `gpt-memory.md`, `.claude/skills/`, and the concurrent `docs/reviews/estimated-1rm-load-translation-architecture-revision*.md` and `repository-agent-workflow-review.md` files.

No probe scripts were written to the repository. No background server process remains. Nothing was committed, pushed, or deployed. This round created no completed sessions in the dev database; the three disclosed in the second verification still stand, of which `01a07230-bb34-7eb7-b08a-0899ef043b7b` holds a deliberately corrupted row from round 2's M-4 and should be dropped or ignored.

---

## 6. Closure

The F-1 warm-up-set-classification remediation is **complete and independently verified across three rounds**:

- **Round 1** closed F-1 itself — the UI could not set `isWarmup`; two controls and two pass-throughs fixed it, with exclusion from carry-forward, progression and volume proved against real SQL and raw database rows.
- **Round 2** closed V-1 (toggle lost on remount, which could author a write-once Decision), V-2 (no in-session reclassification) and V-3 (a checklist locator that selected the wrong element).
- **Round 3** closed W-1 (the V-2 guard was vacuous) and corrected W-2…W-4.

Total production footprint across all three rounds: **three UI files, 125 insertions**, no schema, sync, server, progression, volume or Warm-up Routines behaviour change.

Nothing blocks acceptance. The one item still outstanding is unchanged from the first verification and is not a defect in this work: **no physical-device pass has been run.** V-1's fix is specifically about relaunch behaviour, which Chromium emulation models but a backgrounded iOS PWA does not always match. An on-device run — log a warm-up ramp, switch away, return, continue the ramp, then reclassify a set in place — remains the highest-value remaining check before this ships.

---

`CLOSED — VERIFIED`. W-1 fixed and proved with the reviewer's own negative control plus its mirror; W-2, W-3 and W-4 corrected accurately; no findings open.
