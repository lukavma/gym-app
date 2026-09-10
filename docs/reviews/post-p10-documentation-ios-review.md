# Post-P10 documentation and iOS evaluation — independent review

Date: 2026-09-10. Base: `main` at `57868e2a8955dc72d4a0122cffecbb46c38456be`, working tree inspected
before and after; **all pre-existing changes preserved, nothing modified except this report**.

Role: independent documentation review only. Under review:
[STATUS](../STATUS.md), [ROADMAP](../ROADMAP.md), [BACKLOG](../BACKLOG.md),
[product-ideas pointer](../input/product-ideas.md),
[consolidation report](post-p10-documentation-consolidation.md) and
[iOS beta distribution evaluation](ios-beta-distribution-evaluation.md).

References: the [roadmap evaluation](post-p10-roadmap-evaluation.md), the actual repository at
`57868e2`, the accepted architecture/ADR set, and the owner decisions recorded in the consolidation
report.

## 0. What this review did and did not do

Performed: read-only document and source inspection; an independent reconstruction of the migrated
source and its SHA-256; an independent link/anchor/uniqueness pass over the six documents; git
history and commit verification; and first-party retrieval of every external source the iOS
evaluation cites.

Not performed, deliberately: no source, document or configuration fix; no build, install, test run,
database, container, process or platform access; no production or Azure contact; no commit, push,
deployment or publication. **No re-review of Catalog Expansion 1's implementation** — the
[implementation review](exercise-catalog-expansion-implementation-review.md) and
[predeployment check](exercise-catalog-expansion-predeployment-check.md) are consumed as evidence
only. Sonnet retains catalog release closeout and its STATUS update. Apple/WebKit/Next/Capacitor
pages were read as public documentation; no developer account, device or platform state was inspected.

Not another roadmap evaluation: the selected order is checked for faithful transcription, not
re-argued.

---

## 1. Findings, severity-ranked

| Id | Severity | Finding |
| --- | --- | --- |
| **R-1** | MEDIUM | The migration disclosure omits that the committed `docs/input/product-ideas.md` is an **empty blob**, so the untracked `docs/BACKLOG.md` is now the *only* copy of the 23,250-byte owner input anywhere — including in git history |
| **R-2** | LOW | The consolidation report's original verification table states an "Exact terminal marker" that is no longer the file's terminal marker |
| **R-3** | LOW | STATUS does not name the iOS evaluation among the artifacts pending this review; a dated observation, not a stale instruction |
| **R-4** | LOW | The iOS evaluation offers Xcode's Personal Team as the cheaper alternative to TestFlight without stating its 7-day provisioning expiry, while stating TestFlight's 90-day expiry |
| **R-5** | LOW | The WebKit storage-policy source already cited documents a concrete native-shell disadvantage (15 %/20 % quota versus a browser's 60 %/80 %) that the evaluation's storage paragraph does not surface |
| **R-6** | LOW | Version floors are absent for two capabilities the evaluation names as later options (AlarmKit, declarative Web Push), and the app-bound-domains service-worker claim rests on the bug link rather than the blog link paired with it |

No HIGH findings. No unsupported completion claim, competing authority, lost gate or order
deviation was found. Details in §3; corrections in §4; non-blocking items in §5.

---

## 2. Independent verification

### 2.1 PI-001…PI-008 survived migration — reproduced, not accepted on assertion

The consolidation report claims the source was 23,250 bytes with SHA-256
`cbd7418b972524f4671d5ceb67a58a62d2b134835f0c201d2df3981c82643c29`. That source no longer exists on
disk, so the claim was tested by rebuilding it:

1. Extract the nine `<!-- migrated-source:*:start/end -->` blocks from BACKLOG (introduction plus
   PI-001…PI-008).
2. Re-insert BACKLOG's own eight `## PI-00N — Title` headings, which the markers deliberately exclude.
3. Concatenate in ID order and restore CRLF endings.

| Reconstruction | Bytes | SHA-256 |
| --- | --- | --- |
| Blocks only, LF | 22,503 | `b35e4802…` |
| Blocks only, CRLF | 22,849 | `e775972b…` |
| **Blocks + headings, CRLF** | **23,250** | **`cbd7418b972524f4671d5ceb67a58a62d2b134835f0c201d2df3981c82643c29`** |
| Report's claimed original | 23,250 | `cbd7418b972524f4671d5ceb67a58a62d2b134835f0c201d2df3981c82643c29` |

**Exact match.** Every byte of the original input is recoverable from BACKLOG. Not one heading, body,
sub-heading (PI-003's research gate, PI-005's capability and architecture-gate sections), example or
caveat was dropped, reworded or reordered. The report's "8/8 headings/bodies" and "exact match after
CRLF→LF normalization" claims are true, and stronger than stated — the match holds byte-for-byte at
the original line endings, not only after normalization.

Intent survived as well as text. Each disposition note sits *above* its preserved block and is
scoped to what is still open, so a delivered foundation is never presented as outstanding work:
PI-003 keeps its research gate while marking the routine foundation delivered; PI-005 explicitly
labels its "current" strength-only model and candidate vocabulary (`strength_reps`, `loaded_distance`…)
as historical against the delivered `load_reps`/`reps`/`load_distance`/`distance_time`/`duration`/
`load_duration`; PI-004 keeps its ID and phone-prototype criteria while being coordinated under
PI-008; PI-006 keeps its dependency audit and adds a non-disclosing response contract the original
lacked. PI-002's downstream-consumer list is preserved verbatim, including the e1RM tracker.

The old file is a pointer only: 11 lines, no PI sections, no continuing queue, pointing at BACKLOG
as the sole editable authority and at ROADMAP/STATUS for priorities and state.

### 2.2 IDs, anchors and links

| Check | Independent result |
| --- | --- |
| BACKLOG item IDs | 16 `## PI-0NN` headings, 16 distinct, exactly PI-001…PI-016, no gap, no duplicate |
| Explicit anchors | 16 `<a id="pi-0nn">`, 16 distinct, aligned one-to-one and in order with the headings |
| Index table | 16 rows, covering exactly the 16 headings |
| Duplicate heading text (implicit-anchor collision risk) | none anywhere in BACKLOG |
| Markdown links across the six documents | **182 local links, 0 unresolved** file targets or anchors |
| External URLs | 25 distinct, **all HTTP 200** after redirects |
| Inbound references to the migrated path from other files | 88, **0 of them fragment links** — so the pointer breaks nothing, as the report claims |
| STATUS length | 39 lines, within the ~60-line bound it set itself |

The report's own "121 checked, zero missing" (five files, first pass) and follow-up "zero missing"
are consistent with this wider count; nothing was found that either pass missed.

### 2.3 Scope and concurrency claims

The tree now holds **703** tracked plus untracked non-ignored paths. That reconciles exactly with the
report's arithmetic: 697 baseline + 4 documents created by the first pass + 1 concurrent Sonnet
predeployment report = 702 at follow-up start, + 1 iOS evaluation = 703.

File mtimes corroborate the stated ownership boundary and are internally coherent with the UTC
observation times (local clock = UTC+2): catalog reports last written 01:55/01:56, read at 11:38
local = 09:38 UTC; git-only observation 11:43 local = 09:43 UTC; STATUS written 11:44; ROADMAP and
BACKLOG last touched 11:59 by the follow-up; iOS evaluation 12:03; report 12:07. STATUS's 11:44
mtime independently confirms the follow-up's claim that STATUS and the pointer were not re-edited.

Files the report declares untouched are untouched: `CLAUDE.md` (mtime 2026-09-08, pre-existing
`M`), the deleted `HANDOFF.md`, `HANDOFF(depracted).md` (2026-08-11), `gpt-handoff.md` (2026-08-16),
`gpt-memory.md` (2026-08-30), `README.md` (2026-09-06) and every historical report. Nothing in the
review scope edits code, tests, architecture documents or another agent's report.

### 2.4 Delivery claims and gates

Every commit STATUS cites exists and matches its description: `0caa059` (and the MVP acceptance
document does record `0caa05966ad91cc32a9b1a1f4914796da07de429` as the tested revision), `1282795`,
`05982f6`, `1c5a782`, `4865a02`, `56ec000`, `57868e2` = current HEAD.

Quoted verdicts are exact. The implementation review does end `VERIFIED — READY FOR CATALOG
EXPANSION DEPLOYMENT` and does state "No MEDIUM or HIGH findings" with F-1…F-4 all LOW — STATUS's
"four non-blocking Low findings" is accurate. The predeployment check does end `NAME-COLLISION GATE
PASSED`, does record F-1 resolved, F-2/F-3 corrected, F-4 deferred, and does state "No commit, push,
or deployment was performed or is authorized by this document."

The three gates the implementation review leaves open — D-CE1-1(i) per-client update controls,
D-CE1-1(ii) post-deployment read-only Tibialis check, iPhone device acceptance — appear in STATUS
under "Not recorded complete" together with deployment itself. **No gate was lost in migration.**

STATUS is disciplined about the difference between an author's verdict and an operational receipt:
Profiles R1–R3 are "owner-confirmed complete" while separate deployment/device receipts are marked
not independently established; e1RM Release A "reaches device-acceptance readiness" rather than
being called accepted; Metrics v1 is "recorded as shipped in repository documentation" rather than
certified. I found no completion claim in any of the six documents that the cited evidence does not
support, and none that overstates it.

### 2.5 Authority separation

STATUS, ROADMAP, BACKLOG and the pointer each declare the same three-way split, and each defers to
the other two in the same terms. The consolidation report describes itself as decision provenance
and an evidence boundary, not as current state, and explicitly disclaims certifying catalog closeout.
The iOS evaluation states in its header that it changes nothing in STATUS. **No competing authority.**

### 2.6 Selected order

ROADMAP's table is exactly 1 catalog closeout → 2 documentation consolidation → 3 PI-007 Recovery →
4 PI-009 account export → 5 PI-010 backup/recovery verification → 6 PI-011 Dashboard v2 —
the required order, with no insertion. STATUS's "Selected next work" and BACKLOG's dispositions
state the same sequence in the same terms.

Training runs alongside: ROADMAP states it in bold, refuses the earlier evaluation's blanket feature
pause and full-block precondition, and PI-011 repeats that real training "is not a blanket
block-completion prerequisite for v2."

Multiuser/Easy Auth is deferred in all three authorities, and the iOS evaluation reinforces rather
than reopens it, listing first-run-only setup and unpartitioned local stores as concrete missing
pieces.

e1RM Release B retains its gates verbatim against their source of authority: the binding revision's
O-1 ("only after at least one block of Release A use and after the fire-rate prototype of §18 step
4(c)") and ADR-011's line 54 restate exactly what PI-013 records. PI-013 also correctly keeps the
direct-tier-only cut as a fallback rather than selected scope, and notes that Profiles being
delivered does not discharge the usage gate.

The supersession is honest: ROADMAP says the owner sequence supersedes the evaluation's
optional-Recovery / use-pause / deferred-dashboard recommendations, and the evaluation's §8 does
recommend precisely those three things. It is marked as unchanged historical analysis, and it is
in fact unchanged.

### 2.7 PI-014…PI-016 against the actual code

Every repository claim underpinning the three new entries was checked at `57868e2`:

| Claim | Verified |
| --- | --- |
| `restSeconds` already exists, nullable positive | [`prescriptionSnapshot.ts:42`](../../src/domain/schemas/prescriptionSnapshot.ts#L42) `z.number().int().positive().nullable()`; DB check constraint `ck_exercise_prescriptions_rest_seconds_positive` |
| Supplied by the Today service, frozen into the local session | [`today/service.ts:568,583`](../../src/server/today/service.ts#L568); [`activeSession.ts:192`](../../src/sync/activeSession.ts#L192) |
| No countdown or notification scheduler exists | grep for countdown/rest-timer constructs across `src/` returns nothing; no push subscription or scheduler code |
| `logSet` timestamps the logging action, not exercise end | [`activeSession.ts:557`](../../src/sync/activeSession.ts#L557) sets `loggedAt = new Date().toISOString()` at entry time |
| Account-local dates, unknown-offline state distinguished | `getAccountTimezone()` prefers the cached bundle and returns `null` rather than guessing; `dailyLogs.ts` throws `UnknownAccountTimezoneError` rather than falling back to the device zone |
| Persistence already requested and surfaced | `SyncBootstrap.tsx` calls `navigator.storage.persist()` and `SyncStatusBanner` shows the outcome |
| OD-05 says ship without; if added, elapsed not countdown | Exact: "Ship without. If added: visible elapsed-since-last-set timestamp … no countdown, no notification promises" |
| OD-08 is training-day reminders, not check-in completion | Exact: "Training-day reminders (Web Push) … server-sent Web Push on scheduled training days" |

PI-014 correctly identifies the irreducible problem — an offline check-in is unknown to a server
sender, and a same-device local cancel does not reach another disconnected device — and requires
disclosure rather than mislabelling unknown state as missed. It binds subscriptions to account *and*
device/installation and refuses an exactly-once promise across disconnected devices. That is the
right shape given `dailyLogs.ts`'s outbox semantics.

PI-015 separates the foreground countdown from locked-screen and offline alerts, requires an
absolute target timestamp rendered as `target - now` on resume rather than a decremented counter,
and forbids replaying an expired alert on re-entry. Warm-up and superset behavior is explicitly
parked because **no grouping semantics exist in the logging flow** — verified; the entry declines
to invent a superset schema, which is the correct restraint.

PI-016 is the strongest of the three on epistemics: it states outright that `loggedAt` differences
do not prove rest duration because the interval can contain the next set's execution, late entry or
editing, and that measuring actual rest would need a separately accepted interaction model rather
than a relabeling of existing timestamps. That matches the code exactly.

Neither implementation nor priority is silently selected. All three are marked "accepted backlog
idea"; PI-015's behavior list is headed "Proposed behavior to accept or revise before
implementation"; PI-015 states that the owner accepted evaluating the idea and "**not amended that
behavior authority or approved its implementation**", requiring OD-05 to be reconciled in a separate
design pass and preserving ADR-005's offline durability. ROADMAP places all three under "Additional
candidates", stating they "do not replace or insert work into the six-step order above." The
dependency direction is stated correctly in both files: PI-016 depends on PI-015, PI-015 stands alone.

### 2.8 The iOS evaluation's external claims — checked against first-party sources

Every material claim was retrieved and compared against the cited page. All confirmed:

| Evaluation claim | Source result |
| --- | --- |
| iOS/iPadOS 26 SDK floor for App Store Connect uploads since 28 April 2026 | Apple: "Starting April 28, 2026, apps and games uploaded to App Store Connect need to meet the following minimum requirements" — iOS/iPadOS 26 SDK or later |
| TestFlight builds expire after 90 days | "Your build becomes unavailable for testers after 90 days" |
| Internal versus external testers; first external build reviewed | Internal = up to 100 App Store Connect users with content access; external = up to 10,000; "A review is required only for the first build. Subsequent builds may not require a full review" — the evaluation's more conservative "later builds may also require review" is consistent |
| §2.2 TestFlight betas should be intended for public distribution | "Any app submitted for beta distribution via TestFlight should be intended for public distribution" |
| §4.2 value beyond a repackaged website | "Your app should include features, content, and UI that elevate it beyond a repackaged website" |
| §2.1 working review access; demo mode needs approval | "include demo account info (and turn on your back-end service!) … you may include a built-in demo mode in lieu of a demo account with prior approval by Apple" |
| Membership USD 99/year with regional pricing | "The Apple Developer Program is 99 USD per membership year. Prices may vary by region" |
| TestFlight requires Program membership; Personal Team is a different route | Confirmed by the membership comparison |
| Capacitor v8 requires Xcode 26+, supports iOS 15+, uses WKWebView | "iOS 15+ is supported. Xcode 26.0+ is required … Capacitor uses WKWebView, not the deprecated UIWebView" |
| `server.url` is for live reload, not production | "This is intended for use with live-reload servers. **This is not intended for use in production.**" |
| Static export excludes runtime cookies and request-dependent route handling | Unsupported list includes "Route Handlers that rely on Request", "Cookies", "Proxy", "Headers", "Rewrites", "Redirects" |
| iOS 16.4+ Home Screen Web Push, user-interaction gated, Lock Screen, no membership needed | "as long as that request is in response to direct user interaction"; "They show on the Lock Screen, in Notification Center, and on a paired Apple Watch"; "You do not need to be a member of the Apple Developer Program to use it" |
| WebKit requires user-visible push; silent polling is not a valid plan | "they promise that pushes will always be user visible"; "not an invitation for silent background runtime"; violations "result in a push subscription being revoked" |
| Declarative Web Push shows a notification without service-worker JS, still remote push | "without requiring an installed service worker"; still delivered through a push service |
| App-bound domains restrict injected JS, message handlers, cookies, navigation | "JavaScript injection, custom style sheets, cookie manipulation, and message handler use is denied" unless `limitsNavigationsToAppBoundDomains` is set; navigation away fails; up to 10 domains via `WKAppBoundDomains` |
| WebKit has an app-bound-domain path for service workers | Bug 210451 is titled "Enable service workers for app-bound domains", **RESOLVED FIXED**; registration is validated against the allowed app-bound domain list |
| WebKit documents quotas and eviction; persistence is not automatic | Confirmed, including "By default, all origins use a best-effort mode … their data can be evicted" and eviction "when the site has not been interacted with by the user for some time" |
| AlarmKit exists, separate opt-in, can override silent/Focus | Confirmed: alarms break through silent mode and all Focus modes; requires `requestAuthorization` and `NSAlarmKitUsageDescription` |
| A Mac/Xcode route is required | Confirmed by Apple's compatibility matrix (current Xcode 26.x requires macOS Tahoe 26.2+; Xcode 27 RC requires 26.6+) |

Not independently verifiable from a public page: `WKWebsiteDataStore`'s default-persistent behavior
(Apple's documentation renders client-side and returned no body). The claim is standard, correctly
stated and appropriately hedged; the URL is live.

### 2.9 The evaluation's repository claims

Also checked at `57868e2` and all correct: `output: "standalone"` with no static export; Next 15 /
React 19 / Serwist / `idb` / iron-session and **no Capacitor dependency anywhere, including the
lockfile**; the sealed `gym_app_session` cookie is HttpOnly, `secure` only in production and
SameSite=Lax; setup is gated on an empty users table behind an advisory lock; `/~offline` is
precached through `manifestTransforms`; service-worker activation is user-triggered
(`skipWaiting: false`, `clientsClaim: false`, plus a `SKIP_WAITING` message handler); the cached
Today bundle really is rewritten with `activeSession: null` before it enters the cache while other
API GETs and `/api/auth/*` stay NetworkOnly; IndexedDB `gym-app` v2 uses the fixed key `current` and
is not account-partitioned; `flush.ts` sends FIFO batches of 50 to the relative `/api/sync`; and
`LogoutButton` destroys the server cookie and redirects without clearing IndexedDB or caches.

### 2.10 Demonstrated limitation versus untested feasibility

This was the specific risk in a platform document, and the evaluation handles it correctly
throughout. Statements grounded in a source or in code are asserted (static export excludes cookies;
`server.url` is not for production; TestFlight expiry; §2.2 intent; `logSet` records entry time).
Statements about this app inside a WebView are consistently marked as hypotheses to test: "Remote
shell is a feasibility hypothesis, not a verified drop-in distribution design"; "Do not claim either
universal SW support or universal absence in WKWebView"; "Registration alone is insufficient" with a
concrete list of what must be re-tested after restart. Package 3 is labelled "highest uncertainty",
and the closing section lists device/runtime behavior, notification presentation, Mac/signing
availability and distribution acceptance as still unverified.

**Nowhere does the absence of a device experiment get presented as proof of impossibility.** The one
place a hard negative is asserted — that a suspended JavaScript countdown cannot be the scheduler,
and that page timers and service workers offer no local future-alarm contract here — is a correct
statement about the platform's contract, not an inference from an unperformed test, and it is exactly
what the WebKit user-visible-push rule implies. Conversely, migration constraints are stated as
requirements rather than blockers: treat the native install as a fresh container, seed from
authenticated server reads, finish and reconcile pending outbox operations first, keep the PWA intact
until reconciliation succeeds, and block migration if data cannot be accounted for. The
same-account multi-device race from running both clients is raised rather than assumed away.

### 2.11 Proportionality

The recommendation is "retain the PWA now", with a native probe only if locked-screen/offline alerts
become a demonstrated priority — and the evaluation identifies local notification delivery as the
*only* material native advantage, explicitly conceding that the foreground countdown and the hint
need no native app. That is the correct conclusion from its own evidence and it argues against its
own more expensive option.

The prototype is bounded to one origin, one shell approach, one device, one synthetic account, one
timer and one reminder, on a separately authorized test backend, with HealthKit, Live Activities,
AlarmKit, UI rewrite, other users and public listing all excluded. Four packages each end in a
stop/go decision, with "completing one does not authorize the next" stated explicitly, and four
concrete stop conditions. Sizes are labelled work-package comparisons, not calendar estimates.

"Stay PWA now" is a proposal in all three places it appears: the evaluation's status line ("no
platform, prototype, implementation or distribution selected"), its recommendation section ("neither
inserts a prototype into that sequence nor authorizes implementation"), and ROADMAP ("a proposal, not
selection of a platform, TestFlight distribution or reprioritization"). The consolidation report
repeats it. **No platform decision has been taken.**

---

## 3. Findings in detail

### R-1 (MEDIUM) — the only surviving copy of the owner's product input is untracked

`docs/input/product-ideas.md` at HEAD is the **empty blob** `e69de29` — 0 bytes — and it has been
empty in every commit that touched it (`0762d97`, the only one). The 23,250-byte PI-001…PI-008 input
therefore never existed in git at all; it lived solely in the working copy, and that working copy has
now been replaced by the 11-line pointer.

Consequence: the sole remaining copy of that input is inside `docs/BACKLOG.md`, which `git status`
reports as **untracked** (`?? docs/BACKLOG.md`), alongside ROADMAP, STATUS and both new reports. A
`git clean -fd`, a mistaken directory removal or a lost working tree destroys it with no
`git checkout`, `git show` or reflog recovery path. Restoring the old path with
`git checkout -- docs/input/product-ideas.md` yields an empty file, not the original.

Both the consolidation report and BACKLOG state that the source was "the current, owner-modified
working copy … not from its committed version". That is true but incomplete in the way that matters:
a reader reasonably infers that a committed version exists and is merely older. It does not.

This does not affect migration fidelity — §2.1 proves the content is intact — and it is not a defect
in the documents' reasoning. It is a disclosure gap on a fact that changes what must happen next.

### R-2 (LOW) — a self-describing marker claim that no longer describes the file

The report's original verification table reads: "Report close | Exact terminal marker:
`READY FOR DOCUMENTATION REVIEW`." The file's actual terminal marker is
`READY FOR DOCUMENTATION AND IOS EVALUATION REVIEW`.

This is disclosed twice — the preamble says original-pass counts are historical evidence, and the
follow-up table records the current marker — so it is not misleading in substance. But unlike every
other row in that table, this row asserts something about the file's own present content, so a reader
verifying it by grepping the file gets a mismatch. Rows describing external observations age
gracefully; this one does not.

### R-3 (LOW) — STATUS's pending-review bullet predates the iOS evaluation

STATUS's active-gates section says documentation consolidation is "locally prepared; [report] is
ready for documentation review" and does not name the iOS evaluation, which is also pending this
review and is pending owner review after it.

This is correct behavior, not an error: STATUS was written at 11:44 and the follow-up was explicitly
authorized to extend only BACKLOG, ROADMAP, the report and the new evaluation, leaving STATUS
untouched — and its untouched hash is part of the follow-up's scope evidence. STATUS also owns
delivery state rather than backlog items, so omitting PI-014…PI-016 is right.

It is recorded here only to make the distinction the review scope asks for: this is a **dated status
observation that closeout resolves naturally**, not a stale current instruction. Contrast the
genuinely stale instructions the report already catalogues as later pointer corrections, both of
which I confirmed: `README.md` still says "Volume tracking (Phase 6) is not yet built" (while ten
lines later describing shipped weekly-volume metrics) and "Playwright is currently not part of CI"
(while `.github/workflows/ci.yml` runs an `offline-e2e` Playwright job), and
`.claude/skills/phase-implementation/SKILL.md:32` still instructs `pnpm verify`, which is not a
script in `package.json`. Those require an actual later edit; STATUS does not.

### R-4 (LOW) — Personal Team's 7-day expiry is decision-relevant and unstated

The evaluation states TestFlight's 90-day build expiry as a maintenance cost, then offers Xcode's
Personal Team as a cheaper route "with limitations", linking Apple's membership comparison. That page
gives the limitations: 3 devices, 3 apps per device, and **provisioning profiles that expire 7 days
from issuance**, requiring a rebuild and reinstall.

That is roughly thirteen times shorter than the TestFlight window the evaluation does quantify, and
it bears directly on package 2's acceptance criteria (delivery after lock, after background
termination, and offline — plausibly a multi-day observation) and on package 4's and material
decision 3's question of whether a signed device experiment suffices. Stating one expiry and not the
other makes the free route look cheaper than it is.

### R-5 (LOW) — a documented native-shell storage disadvantage the cited source already provides

The evaluation's storage paragraph cites WebKit's storage-policy post for quotas and eviction and
correctly says persistence needs evidence. That same post also states that browser apps get an origin
quota up to 60 % of disk and an overall quota up to 80 %, other apps 15 % and 20 %, and — directly on
point — that a Home Screen web app running standalone gets **the same quota as in the browser**.

So the documented position is that moving into a WKWebView shell *reduces* the storage headroom this
local-first app has today, while the current PWA already sits in the larger tier. For an app whose
offline contract rests on IndexedDB, that is a concrete, sourced argument for the recommendation the
evaluation is already making, and it is the kind of demonstrated limitation the review scope asks to
be separated from untested feasibility.

### R-6 (LOW) — version floors and citation load-bearing

Three small precision points, none of which makes a claim wrong:

- AlarmKit is iOS 26+ and the evaluation cites only the WWDC25 session; a stable
  `developer.apple.com/documentation/AlarmKit` page now exists and would age better. The evaluation
  says "select supported OS versions … first", which covers the risk, but a floor of iOS 26 is
  concrete where "supported OS versions" is not — and it interacts with the SDK/deployment-target
  discussion the same section already raises.
- Declarative Web Push shipped in iOS/iPadOS 18.4; naming that makes "a later compatibility choice"
  checkable.
- The service-worker-in-WKWebView claim is carried entirely by bug 210451; the app-bound-domains blog
  post paired with it in the same sentence **does not mention service workers at all**. The claim is
  correct — the bug is titled "Enable service workers for app-bound domains" and is RESOLVED FIXED —
  but the pairing implies joint support that only one link provides. The blog post does supply
  something package 3 would benefit from: message handlers and JavaScript injection are denied unless
  `limitsNavigationsToAppBoundDomains` is set, and at most 10 domains may be declared. That is the
  same switch that enables the service worker and confines navigation, so the evaluation's proposed
  bridge, its SW hypothesis and its navigation confinement are one configuration decision, not three.

---

## 4. Required corrections

Both are single-sentence edits at closeout. Neither requires a revision pass before approval, and
neither touches content already verified correct.

1. **R-1 — state the empty-blob fact and its consequence.** In the consolidation report's migration
   section (and, if convenient, BACKLOG's authority note), replace the inference-inviting phrasing
   with the fact: the committed `docs/input/product-ideas.md` is an empty blob, so BACKLOG's
   preserved sections are the only extant copy of the original input and there is no git recovery
   path for it.
2. **R-1 — commit before anything else at closeout.** `docs/BACKLOG.md` must be the first file
   committed in the documentation closeout, ahead of any other cleanup, and no `git clean` or
   working-tree reset may run in this repository until it is. This review is not authorized to
   commit; recording it as the first closeout action is the correction available here.

R-2 is optional and cosmetic in effect but trivially fixable in the same edit: mark that table row as
the original pass's marker, or update it to the current one.

---

## 5. Non-blocking suggestions

- **R-4** — add "provisioning profiles expire after 7 days; 3 devices" to the Personal Team sentence,
  so the two expiry windows are stated symmetrically.
- **R-5** — add one clause to the storage paragraph: WebKit's documented quota tiers put a WKWebView
  shell in the 15 %/20 % band while a standalone Home Screen web app keeps the browser's 60 %/80 %.
- **R-6** — name the iOS 26 floor for AlarmKit (and prefer the framework documentation page over the
  session video), name iOS 18.4 for declarative Web Push, and attribute the service-worker claim to
  bug 210451 while using the blog post for the `limitsNavigationsToAppBoundDomains` / 10-domain /
  message-handler constraints that package 3 will actually hit.
- **STATUS at closeout** — when Sonnet's closeout lands, add the iOS evaluation to the pending-owner
  items in the same edit, so the "pending owner review" state has one home rather than living only in
  ROADMAP's last section.
- **Historical links** — 88 references to `docs/input/product-ideas.md` remain in other documents and
  none uses a fragment, so nothing is broken. Keep the report's opportunistic-update policy; do not
  open a bulk rewrite.

Explicitly *not* suggested: any restructuring, rewording or tightening of documents that this review
found correct. The three files are already at the right level of detail for their stated authorities.

---

## 6. Material owner decisions

1. **Closeout order (R-1).** Confirm that `docs/BACKLOG.md` is committed first at documentation
   closeout, and that no working-tree reset or `git clean` runs in this repository beforehand. This
   is the only finding in this review with an irreversible failure mode.
2. **The iOS evaluation's own three questions remain open and are correctly framed there** — which
   rest experience is actually wanted (foreground display, expiry alert while locked/offline, or a
   continuously visible countdown/alarm); whether any of PI-014…PI-016 or a bounded probe enters the
   selected order and where; and, if a probe happens, whether it is personal device testing or a beta
   toward public distribution with a chosen Mac/signing route. This review does not answer them and
   recommends leaving them open until real training shows whether a visible timer solves the friction.
3. **No platform decision is being requested by this review.** Approving the documentation does not
   approve staying on the PWA, building a shell, enrolling in the Apple Developer Program, or
   changing the six-step order.

---

## 7. Scope statement

This review certifies documentation quality only: migration fidelity, authority separation, order
preservation, claim accuracy against the repository and against first-party external sources, and the
proposal-versus-decision boundary. It certifies **no** native implementation, distribution route,
Apple account state, device behavior, deployment or production state, and it changes no selected
priority.

Catalog Expansion 1 release closeout — deployment, per-client update controls, the post-deployment
Tibialis check and iPhone acceptance — remains Sonnet's task and its evidence, unexamined and
unduplicated here. The catalog observation boundary recorded in STATUS and the consolidation report
stands as those documents state it.

No file in this repository was modified by this review other than the creation of this report. All
pre-existing working-tree changes are preserved.

---

APPROVED — READY FOR DOCUMENTATION CLOSEOUT
