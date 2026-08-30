# Phase 8 — Second Targeted Remediation Verification (B-3 upgrade path)

Independent verification limited strictly to the one outstanding item: the B-3 upgrade-path defect
recorded in `docs/reviews/phase-8-remediation-verification.md` §4 and §12 item 1, and the
`2026-08-29` B-3 follow-up appended to `docs/reviews/phase-8-remediation.md`.

Nothing was committed, pushed, deployed, or tagged. No production access. All work ran against a
disposable PostgreSQL 16 database (`gymapp_b3v2`) created and dropped inside the local Docker
instance; the developer's own `gymapp` database was never written to. One implementation file was
temporarily edited as a negative control and restored byte-identically (SHA-256 verified, §8). No
report, test, or unrelated file was modified. `git status --porcelain` at the end of this pass is
identical to its state at the start, with `docs/reviews/phase-8-remediation-verification-2.md` as the
only addition.

No shipped test or report claim was accepted as proof. Every check below runs against fixtures
written from scratch for this pass — a 25-case unit probe and a 9-case Playwright fixture, neither
importing nor reusing `tests/unit/dailyLogs.test.ts` or
`tests/e2e/offline-bodyweight-recovery.spec.ts`.

---

## Verdict

**VERIFIED — READY FOR DEVICE ACCEPTANCE**

The guard is correct, minimal, and applied to both branches `getAccountTimezone()` can return from.
Every required scenario passes against my own fixtures, and the negative control reproduces the exact
original adjacent-day data destruction the moment the guard is removed — including the overwrite of a
real stored recovery entry, which is the failure this item exists to prevent. No device-timezone
fallback survives anywhere, confirmed at source level and in the built client bundle.

---

## 1. The fix

`src/sync/accountTimezone.ts` gained `readValidTimezone(bundle)`, which reads `bundle.timezone` as
`unknown` — not the declared-but-unenforced `string` — and accepts only a non-empty string:

```ts
function readValidTimezone(bundle: TodayBundleDto): string | null {
  const timezone: unknown = bundle.timezone;
  return typeof timezone === "string" && timezone.length > 0 ? timezone : null;
}
```

Applied to both branches: an invalid **cached** record now falls through to the live fetch instead of
being returned, and an invalid **live** response resolves to `null` rather than being handed back.
`resolveTodayDate()`'s existing `=== null` check and the `unknown-timezone` phase then do the rest,
unchanged. The typing choice is the right one — `unknown` is genuinely what the value is at a
boundary that crosses IndexedDB and `fetch().json()`, and it is what makes the guard load-bearing
rather than dead code the compiler would flag.

This matches what §12 item 1 asked for, in the one place that reads the value.

---

## 2. A pre-remediation bundle never reaches `Intl` as `undefined`

My unit probe pins the process zone to `Pacific/Kiritimati` and freezes the clock at
`2026-06-15T21:50:00Z`, where the account zone (`Europe/Ljubljana`) reads `2026-06-15` and the device
reads `2026-06-16`. A sanity assertion first proves the control is valid — the process really does
resolve "today" as the **device** day, so any leak would be observable:

```
  Intl.DateTimeFormat().resolvedOptions().timeZone === "Pacific/Kiritimati"
  default-formatted today === "2026-06-16"   (the DEVICE day)
```

Nine cached-bundle shapes were then driven through the real `getAccountTimezone()` against real
IndexedDB (`fake-indexeddb`), offline:

| cached `timezone` | result |
|---|---|
| **field absent** (the exact pre-remediation shape) | `null` ✓ |
| `""` | `null` ✓ |
| `null` | `null` ✓ |
| `undefined` (explicit) | `null` ✓ |
| `0` (number) | `null` ✓ |
| `false` (boolean) | `null` ✓ |
| `{}` (object) | `null` ✓ |
| `[]` (array) | `null` ✓ |
| `"   "` (whitespace) | returned as-is — see §7 |

Every case returns `null`, never `undefined`, so nothing but a validated non-empty string can reach
`userLocalDateString` → `Intl.DateTimeFormat`.

---

## 3. Empty and invalid values are rejected on the live branch too

The same guard on the live-fetch response, with the cache empty:

```
  live { }                 -> null
  live { timezone: "" }    -> null
  live { timezone: null }  -> null
  live { timezone: 7 }     -> null
  non-ok response          -> null
```

And a **legacy cached bundle falls through to a valid live response when online**:

```
  cached { }  +  live { timezone: "Europe/Ljubljana" }
    -> fetch("/api/today-bundle") called, resolves "Europe/Ljubljana"
    -> the poisoned cache is healed for next time
```

Driving the whole chain rather than the resolver alone, a legacy cached bundle plus a valid live
response writes the **account** day (`2026-06-15`), and with a valid cached zone both mutators
day-key to the account day with the outbox carrying `["2026-06-15","2026-06-15"]` — never
`2026-06-16`.

**25/25** of my unit cases pass. The project's own `tests/unit/dailyLogs.test.ts` passes **13/13**,
three consecutive runs.

---

## 4. Direct navigation, real browser, production build

The critical methodological point the follow-up itself calls out: a `/today` visit re-caches a
fresh, valid bundle through `TodaySection`'s own code path, independent of `getAccountTimezone()`, so
routing through Today silently self-heals the poisoned cache and can never exercise the fix. My
fixture therefore poisons the cached record and then arrives **directly** at `/bodyweight` and
`/recovery`, with no `/today` visit in between, device pinned to `Pacific/Kiritimati`, clock frozen at
the divergent instant. Three poison shapes each:

```
  [missing] /bodyweight rows at 81.2 = ["2026-06-15"]      <- ACCOUNT day
  [empty]   /bodyweight rows at 81.2 = ["2026-06-15"]
  [null]    /bodyweight rows at 81.2 = ["2026-06-15"]
```

and for recovery, with a real, deliberate entry pre-seeded on the **device** day:

```
  [missing] device-day row  = {"date":"2026-06-16","sleepHours":7.5,"sleepQuality":5,"readiness":5,
                               "soreness":5,"note":"real entry","createdAt":…,"updatedAt":<same>}
  [missing] account-day row = {"date":"2026-06-15","sleepQuality":3,"readiness":3,"soreness":3,…}
```

The device-day row is asserted **byte-identical** to its pre-write snapshot via deep equality over
the full record — including `updatedAt`, so any touch at all would fail — and the check-in correctly
became a new row on the account day. Identical for `empty` and `null`.

**9/9 tests pass, three consecutive runs** against the restored production build.

---

## 5. Offline with only legacy/invalid timezone data

For all three poison shapes, offline, with the clock frozen at the divergent instant:

- the check-in card renders the explicit unknown-timezone state
  ("…hasn't learned the account's timezone…");
- **no** "Save check-in" button and **no** "Set …" slider affordances are offered at all;
- the bodyweight quick-log refuses with the same specific message rather than the generic
  save-failure text;
- and nothing is written anywhere:

```
  [missing] outboxOps=0  dailyLogCache={"date":"2026-08-30","entry":null,…} (byte-equal to before)
  [missing] db before={"bw":0,"rc":0} after={"bw":0,"rc":0}
  [empty]   outboxOps=0  dailyLogCache unchanged   db before/after identical
  [null]    outboxOps=0  dailyLogCache unchanged   db before/after identical
```

The `dailyLogCache` comparison is a deep equality including `fetchedAt`, so even a rewrite with
identical content would fail. The database counts were re-read after reconnecting, so a
queued-but-unflushed write could not hide.

---

## 6. Negative control — the original corruption, reproduced

`src/sync/accountTimezone.ts` was temporarily reverted to the unguarded body
(`return bundle.timezone as unknown as string | null`), the app **rebuilt and restarted** so the
browser genuinely ran the unguarded code, and my own fixtures rerun.

**Unit:** 14 of my 19 guard cases failed, including the decisive one —
`expected '2026-06-16' to be '2026-06-15'`, a quick-log resolving to the **device** day. The
project's own new cases failed 5/13, matching the follow-up's "5/5 new cases failed" claim.

**E2E, the `missing` shape (the real upgrade path):**

```
  [missing] /bodyweight rows at 81.2 = ["2026-06-16"]        <- the DEVICE day
  [missing] device-day row  = {"date":"2026-06-16","sleepHours":7.5,"sleepQuality":3,"readiness":3,
                               "soreness":3,"note":null, updatedAt > createdAt}
  [missing] account-day row = undefined
```

That is the original BLOCKER-3 destruction, reproduced first-hand: the real stored entry
(`7.5h, 5/5/5, note "real entry"`) overwritten in place with neutral defaults and its note cleared,
while the account day got nothing — with the UI reporting success. The offline unknown-timezone tests
also failed unguarded, because the card computed a device day instead of surfacing the safe state.

The `empty` shape failed differently (a `RangeError` from `Intl` leaves the UI hung rather than
writing a wrong day), and the `null` shape passed even unguarded — correctly, since a literal `null`
already satisfied the old `=== null` check and was never the broken case. The control is therefore
specific as well as decisive: it fails exactly where the defect was and nowhere else.

Restored, rebuilt, and rerun: **9/9, three consecutive runs.** `src/sync/accountTimezone.ts` SHA-256
`E7629CC08AF914D78B18EBBFD6BDD0D3E5A55E6084F6A44503DD1B0F8B102D0E` before and after, with no
residue of the control text.

---

## 7. No device-timezone fallback remains

**Source level.** `Intl.DateTimeFormat().resolvedOptions()` appears nowhere in `src/` or `tests/`
except inside two explanatory comments. `deviceLocalDateString` is gone. Both client call sites of
`userLocalDateString` (`src/sync/dailyLogs.ts:28`, `src/ui/recovery/RecoveryCheckIn.tsx:84`) sit
behind an `=== null` check on `getAccountTimezone()`; every other call site is server-side and passes
`users.timezone`.

**Built bundle.** Stronger than a source grep, since it covers whatever actually ships: the built
client chunks contain **no** `resolvedOptions` at all, and every `DateTimeFormat("en-CA", …)`
construction passes an explicit `timeZone`:

```
  .next/static/chunks/6544-….js                     DateTimeFormat("en-CA",{timeZone:e,…})
  .next/static/chunks/app/(app)/bodyweight/page-….js DateTimeFormat("en-CA",{timeZone:e,…})
```

There is no code path left that can omit the zone and inherit the runtime default.

**One residual observation (LOW, not a defect).** The guard accepts any non-empty string, so a
non-empty but *invalid* IANA value (`"   "`, `"not-a-zone"`, `"Europe/Nowhere"`, `"UTC+2"`) passes it
and `Intl` then throws a `RangeError`. I probed all six such shapes: every one produced
`bodyweight=threw RangeError`, `recovery=threw RangeError`, `queuedOps=0` — it **fails safe**, never
the device day and never a write. The only cost is presentation: `BodyweightQuickLog` shows its
generic "Couldn't save — try again." rather than the specific message, and in `RecoveryCheckIn` the
throw escapes an uncaught async IIFE, which would leave the card on "Checking today's entry…".
Reachability is effectively nil — the value originates from `users.timezone`, and a garbage value
there would make the server's own date resolution throw while building the bundle, so no such bundle
could be produced. Recording it for completeness, not as outstanding work.

---

## 8. Suites and repeated runs

All against a from-scratch disposable database (migrate → seed → production build → server → account
bootstrap via `smoke.spec.ts` → re-seed → fixture seed) and a real production build.

| Check | Result |
|---|---|
| `pnpm typecheck` / `typecheck:sw` / `lint` / `format:check` | clean (re-verified after restoring the control) |
| `pnpm test:unit` | **479/479**, 38 files |
| My independent unit probes | **25/25** |
| `tests/unit/dailyLogs.test.ts` | **13/13**, 3 consecutive runs |
| My independent E2E fixture (9 tests) | **9/9**, 3 consecutive runs |
| `tests/e2e/offline-bodyweight-recovery.spec.ts` | **8/8**, 4 consecutive runs |
| `pnpm test:e2e:offline` (CI gate) | **9/10** runs at 25/25 |
| Full `pnpm exec playwright test` | 66/66, 65/66, 66/66 |

**On the two intermittent failures.** Both landed in `tests/e2e/offline-bodyweight-recovery.spec.ts`
on `toBeVisible` assertions — gate run 8 on the pre-existing "true unknown-offline state" test, full-suite
run 2 on the new "offline … missing `timezone`" test. Neither reproduced in isolation: **12/12** and
**14/14** respectively, and my own equivalent offline assertions passed 4/4 sweeps. This file is mildly
load-sensitive in its visibility waits; the behaviour under test is correct. It is the same
one-in-ten class the previous verification pass measured in the same file, and worth a longer
`toBeVisible` timeout or a poll there — **LOW**, unchanged in severity from before, and not a reason
to hold acceptance. The follow-up's single-run figures (gate 25/25, suite 66/66) are accurate as far
as they go; repeated runs show the file flakes about one run in ten.

**Regression checks on the adjacent findings.** MEDIUM-3 re-verified independently: the
`dailyLogCache` key is the account day, `entry: null` after a confirmed read, **not** overwritten by
the unconfirmed local save, and after a reload it holds the real server row with the real server id.
The normal (valid-bundle) offline path still queues and converges on the account day.

**One observation surfaced by my own harness, out of scope.** A control test that froze the browser
clock and then reconnected did not drain: `flush.ts`'s `nextFlushAllowedAt` is an absolute
`Date.now()` deadline, so with a frozen clock a single failed attempt (`tries: 1`) parks the queue
permanently. With a real clock the identical scenario drained in 2.9 s. Real devices don't freeze
their clocks, but a **backwards** clock jump (NTP correction, manual change) after a failed flush
would stall the outbox for the length of the jump; a page reload clears it, since the deadline is
module state. This is B-1 territory, verified fixed in the previous pass and untouched here — noted
only because this pass is where it became visible.

---

## 9. Restoration and scratch hygiene

- `src/sync/accountTimezone.ts` — SHA-256 `E7629CC0…B102D0E` before **and** after the negative
  control; no residue of the control text; the app was rebuilt from the restored source and all
  static gates re-run clean.
- All review fixtures (a Playwright config, a vitest config, two unit probes and two Playwright
  specs) live entirely outside the repository. The temporary `node_modules` junction used to run them
  was removed; the real `node_modules` is intact.
- `test-results/` removed. `.next/` and `public/sw.js` were regenerated by `pnpm build`; both are
  gitignored.
- The disposable database `gymapp_b3v2` was dropped — only `gymapp` remains. Production was never
  contacted.
- The follow-up's "exact changed files" claim checks out: the tracked-file diffstat is byte-for-byte
  what the previous verification pass recorded (`27 files changed, 1666 insertions(+), 672
  deletions(-)`), so no tracked file was touched; the three changed files are all untracked/new, as
  stated. `docs/reviews/phase-8-review.md` and `docs/reviews/phase-8-remediation-verification.md` are
  unmodified (the latter still carries its `REMEDIATION INCOMPLETE` verdict), as are
  `docs/input/product-ideas.md`, `CLAUDE.md`, `HANDOFF(depracted).md`, `gpt-handoff.md`,
  `gpt-memory.md` and `.claude/skills/`.

---

## 10. Outstanding

Nothing blocking. Carried forward from the previous pass, all **LOW** and all unchanged:

| # | Item |
|---|---|
| 1 | `logRecovery`'s CHECK-failure → UPDATE retry would break with SQLSTATE `25P02` if ever called inside an explicit transaction. No caller does today. |
| 2 | `onConflictDoNothing({ target: id })` does not arbitrate `uq_sessions_one_in_progress`; ~1% of fully simultaneous identical create batches dead-letter. Not client-reachable. |
| 3 | `offline-bodyweight-recovery.spec.ts` matches rows by weight without scoping by date in its pre-existing tests, and its `toBeVisible` waits flake roughly one run in ten under load. |
| 4 | The remediation report's changed-files list omits the `fake-indexeddb` devDependency and the `pnpm-lock.yaml` change. |
| 5 | A non-empty but invalid IANA timezone string fails safe with a `RangeError` rather than the friendly unknown-timezone surfacing (§7). |

The B-3 upgrade-path defect that blocked the previous pass is closed. The iPhone manual checklist in
`docs/reviews/phase-8-implementation.md` remains unexecuted and is the remaining gate.

**VERIFIED — READY FOR DEVICE ACCEPTANCE**
