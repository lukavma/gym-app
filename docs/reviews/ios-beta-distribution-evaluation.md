# iOS beta distribution evaluation

Date: 2026-09-10. Repository observation: `main` at
`57868e2a8955dc72d4a0122cffecbb46c38456be`, with pre-existing working-copy documentation changes.
Status: **documentation approved; iOS recommendation pending owner selection; no platform,
prototype, implementation or distribution selected**. The [independent review](post-p10-documentation-ios-review.md)
approved documentation closeout; bounded R-4…R-6 clarifications were checked against official sources
on 2026-09-10 and recorded in the [closeout report](post-p10-documentation-consolidation.md#approved-documentation-closeout).
Scope: read-only source/document inspection and current official Apple/framework research.
No builds, device experiments, installs, account/platform access or production inspection were performed.
Catalog deployment/device closeout belongs to Sonnet; this evaluation does not change [STATUS](../STATUS.md).

## Recommendation and decision boundary

**Retain the PWA now; consider a bounded native feasibility prototype later if offline alerts while
the phone is locked become a demonstrated priority.** The existing personal-app sequence remains
catalog closeout → documentation → Recovery → account export → backup/recovery verification →
Dashboard v2 scope and implementation. Training continues alongside it. This recommendation neither
inserts a prototype into that sequence nor authorizes implementation of the new ideas.

[PI-014 reminders](../BACKLOG.md#pi-014), [PI-015 rest timer](../BACKLOG.md#pi-015) and
[PI-016 short-rest hint](../BACKLOG.md#pi-016) are accepted backlog ideas. BACKLOG owns their candidate
behavior; [ROADMAP](../ROADMAP.md) owns priorities. A foreground rest display and a factual,
optional hint do not themselves require an iOS app. Native local notification delivery is the
strongest reason to investigate one. That benefit must justify a second client container, a Mac
build/signing route, device verification and release maintenance.

An early owner-only **device prototype** is a smaller decision than a TestFlight beta. TestFlight's
public-distribution intent and expiring builds also make it a poor default permanent delivery route
for an indefinitely personal app; the distribution details below matter before choosing it.

## What this repository can actually reuse

The app is Next.js 15 / React 19 with a Node server, PostgreSQL/Drizzle, cookie authentication and a
Serwist PWA. No Capacitor dependency, native iOS project, push-subscription implementation or rest
notification scheduler was found in the inspected source/package configuration. These are repository
observations, not a device compatibility verdict or a statement about production resource settings.

| Area and evidence | Reuse and constraint |
| --- | --- |
| [package.json](../../package.json), [Next config](../../next.config.ts), [application ADR](../architecture/adr/ADR-001-application-architecture.md) | `output: "standalone"` packages a Node deployment. It does not create a static client. Current server routes, database access and authentication must remain hosted if the UI runs inside an iOS shell. |
| [Middleware](../../src/middleware.ts), [session options](../../src/server/auth/sessionConfig.ts), [auth service](../../src/server/auth/service.ts) | Protected routes use a sealed `gym_app_session` cookie, HttpOnly, Secure in production, SameSite=Lax. Setup is allowed only while the users table is empty; login is existing email/password. A same-origin HTTPS WebView may preserve the current request model, but must establish its own login and prove cookie persistence/expiry behavior. |
| [Service worker](../../src/app/sw.ts), [offline page](<../../src/app/(app)/~offline/page.tsx>), [offline strategy](../architecture/pwa-offline-strategy.md) | Serwist precaches `/~offline`; document fallback, Next/RSC caches and cached Today data support offline use. The cached Today response strips `activeSession`; other API GETs and auth stay NetworkOnly. These are deliberate contracts, not a generic cache-everything wrapper. SW activation is user-triggered. |
| [IndexedDB](../../src/sync/db.ts), [active session](../../src/sync/activeSession.ts) | Database `gym-app` v2 holds the current session, outbox, bundle and daily-log cache. Keys such as `current` and outbox records are not account-partitioned. The reusable local-first logic depends on a working durable browser database in its actual origin/container. |
| [Flush](../../src/sync/flush.ts), [bootstrap](../../src/ui/SyncBootstrap.tsx), [server sync](../../src/server/sync/service.ts) | FIFO batches use relative `/api/sync`; network failure/401 preserves queued operations. Foreground, reconnect and active-page timers trigger replay. Server processing uses authenticated `userId`, ownership checks and idempotent operation identities. A native shell does not add background replay automatically. |
| [Daily logs](../../src/sync/dailyLogs.ts), [account timezone](../../src/sync/accountTimezone.ts) | Recovery/bodyweight quick logs use the outbox; unknown offline state differs from confirmed absence. The account zone, not an unverified device guess, determines the log date. Reminder scheduling must respect these semantics. |
| [Prescription snapshot](../../src/domain/schemas/prescriptionSnapshot.ts), [Today service](../../src/server/today/service.ts), [ExerciseCard](../../src/ui/workout/ExerciseCard.tsx) | Positive nullable `restSeconds` is already carried into the frozen workout snapshot. The logging UI does not implement a timer. `logSet` records the time of entry, not measured exercise end or next-set start; short-rest inference from timestamps would be unsound. |
| [LogoutButton](../../src/ui/LogoutButton.tsx), [authentication ADR](../architecture/adr/ADR-004-authentication.md) | Logout destroys the server cookie and redirects; the client does not clear/partition IndexedDB or caches. Current preservation across re-login fits the single-account design. A reminder schedule or a second-account login needs an explicit lifecycle contract. |

The current [open decisions](../architecture/open-decisions.md) are narrower than the new ideas:
OD-05 says ship without a timer and describes a later elapsed display, without countdown/notification
promises; OD-08 concerns training-day reminders, not daily check-in completion. The new entries
record an accepted inquiry. A selected design must reconcile those decisions; this report does not
silently amend them. [ADR-005](../architecture/adr/ADR-005-pwa-offline.md)'s offline workout durability
remains an acceptance boundary for any client.

### Three possible packaging approaches

| Approach | What stays reusable | Missing work / assessment |
| --- | --- | --- |
| Continue installed PWA | Existing server, routes, UI, SW, IndexedDB and deployed origin | Smallest additional client surface. Foreground countdown can be a bounded later feature; notifications require new delivery work. Recommended current direction. |
| Bounded native WKWebView shell loading the owned HTTPS app | Potentially most of the web UI, same-origin API/cookie behavior and domain/sync logic; existing server stays | Add native lifecycle/notification bridge, navigation confinement, persistent website store and signing. Prove actual SW/IndexedDB/cold-launch behavior. Remote shell is a feasibility hypothesis, not a verified drop-in distribution design. |
| Bundled local web client, for example Capacitor | Pure TypeScript domain logic and some React UI; hosted backend remains | Extract an independently deliverable client, resolve navigation/data fetching, API origin and credential policy, then rebuild offline integration. Substantially broader than pointing a wrapper at this repository. Stop the small prototype if it requires this conversion. |

Next.js explicitly excludes runtime cookies and request-dependent route handling from static export.
The current server requirements therefore cannot be solved by changing `standalone` to `export` and
copying the output into an app. This is an inference from the inspected code and the
[official static-export constraints](https://nextjs.org/docs/app/guides/static-exports).

Capacitor's current iOS runtime uses WKWebView. Its normal local origin uses the `capacitor` scheme;
relative `/api/*` requests would no longer mean the Azure HTTPS server. `server.url` is documented
for live reload and explicitly not intended for production. It is not evidence that a remotely hosted
Next.js app is a supported production Capacitor shortcut. A bundled client needs deliberate API URL,
cookie/credentials, CORS and request-protection design; do not weaken SameSite or embed a session
secret to make the experiment work. [Capacitor iOS](https://capacitorjs.com/docs/ios),
[configuration](https://capacitorjs.com/docs/config).

### WebView storage and offline acceptance are unresolved

WKWebView has a configurable website data store; Apple's default is persistent and a nonpersistent
store is an explicit alternative. That does not demonstrate access to the owner's Safari/Home Screen
PWA state. Treat the native install as a fresh container with a new login, cache and local database,
unless an explicit migration is designed and proven. [Apple website data stores](https://developer.apple.com/documentation/webkit/wkwebsitedatastore).

Do not claim either universal SW support or universal absence in WKWebView. The evidence for its
app-bound-domain service-worker path is specifically **WebKit bug 210451, RESOLVED FIXED**; that
implementation history does not certify this app's current device compatibility.
[WebKit service-worker implementation history](https://bugs.webkit.org/show_bug.cgi?id=210451).

The separate app-bound-domains blog documents up to 10 declared domains and the restrictions on
injected JavaScript, message handlers and cookie APIs after opting in through `WKAppBoundDomains`.
Setting `limitsNavigationsToAppBoundDomains` restores those APIs for permitted content and confines
top-level navigation. The blog does not establish service-worker support. Prototype package 3 must
evaluate the domain configuration, bridge and SW path together. An owned HTTPS origin and persistent
store remain a candidate to test; a custom local scheme is a different environment. Registration alone
is insufficient: verify SW control after restart, `/~offline`, cached assets/RSC, update activation
and offline API failure behavior on the selected iOS version.
[WebKit app-bound-domain restrictions](https://webkit.org/blog/10882/app-bound-domains/).

Native packaging also does not turn IndexedDB into a backup. WebKit's policy for Safari 17 / iOS 17
and later gives browser apps ceilings of **up to 60% of total disk per origin / 80% across origins**;
other apps, including an ordinary WKWebView shell, get **up to 15% / 20%**. A standalone Home Screen
web app keeps the browser tier. These are quota ceilings, **not reserved or guaranteed available
storage**; writes may fail earlier and storage pressure can cause eviction. The lower documented
shell tier is a constraint, not evidence this app has exhausted storage on any device. Measure actual
usage/quota and persistence in a selected prototype and handle failed writes. The app already requests
persistence and surfaces its outcome; preserve that contract and keep
[PI-010 recovery verification](../BACKLOG.md#pi-010) separate.
[WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).

Existing local data must be handled conservatively. Before any eventual owner switch, finish/sync
the PWA's active workout, inspect its pending/dead-letter operations and verify server acknowledgement.
Seed the new container from authenticated server reads. Unsynced sets, cached daily state and
device-local preferences do not transfer just because the URL or Apple Account is the same.
Keep the PWA intact until reconciliation succeeds; block migration if data cannot be accounted for.
The selected account export feature is not automatically an IndexedDB transfer/import tool.
Simultaneously using both clients adds same-account multi-device races even with no invited users;
preserve active-session takeover and replay semantics rather than assuming synchronization is instant.

## Reminder, countdown and alert capabilities

| Candidate | Installed iPhone PWA | Bounded native shell | Product consequence |
| --- | --- | --- | --- |
| PI-014 daily check-in reminder | Opt-in Web Push can reach a locked device; needs a remote sender, schedule, subscriptions and connectivity for timely receipt | Local calendar/time notifications can be scheduled on-device; remote push remains possible but adds its own infrastructure | Neither delivery method knows all disconnected devices' check-ins. Choose suppression/duplicate policy before a channel. |
| PI-015 foreground countdown | Save target timestamp; recompute on resume instead of relying on background interval ticks | Same display logic can be reused if the web client is compatible | A native conversion is unnecessary for this portion. |
| PI-015 locked-screen/offline alert | Page timers/service workers provide no demonstrated local future-alarm contract here; a server push cannot promise an offline alert at the deadline | Schedule a local OS notification before suspension; native code must replace/cancel it when timer state changes | Native delivery is the material capability to prototype. An accurate resumed display alone is not an alert-delivery test. |
| PI-016 optional hint | Foreground comparison against configured target/timer is sufficient | Same logic; no intrinsic native advantage | Preserve factual wording and opt-out; no physiological judgment or progression changes. |

Home Screen web apps on iOS/iPadOS 16.4+ can request Web Push permission in response to user
interaction, with notifications appearing in system surfaces including the Lock Screen. The app's
current standalone manifest fits the installation model. This is not permission granted already,
nor a feature implemented here. Web Push does not require Apple Developer Program membership.
[WebKit's iOS Web Push documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

For PWA reminders, a selected slice would need authenticated subscription registration, a durable
schedule/sender, zone/DST rules, last-moment completion checks, retry deduplication, endpoint cleanup
and observable failures. An offline Recovery save can be unknown to the sender, so a reminder may
arrive despite completion. WebKit requires user-visible push: a silent push that wakes a worker only
to poll state or silently suppress delivery is not a valid background-sync plan. Suppress before
dispatch when known and disclose the remaining race. [WebKit Web Push contract](https://webkit.org/blog/12945/meet-web-push/).

Declarative Web Push, available from **iOS/iPadOS 18.4**, can present a notification without running service-worker JavaScript;
it remains remote push and does not supply local future-alarm scheduling or solve the check-in
knowledge gap. It is a later compatibility choice, not a required modernization project for this
app. [WebKit declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/).

Native UserNotifications supports scheduling a time-based local request whose delivery is handled
by the OS while the app is backgrounded or not running. After scheduling, that mechanism does not
need a push server. Capacitor exposes local scheduling/cancellation if its client architecture is
eventually chosen; a custom Swift shell can call the native API directly. A suspended JavaScript
countdown still cannot be the scheduler. [Apple local notifications](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app),
[Capacitor local notifications](https://capacitorjs.com/docs/apis/local-notifications).

Request authorization only after opt-in, check current settings and handle denial/revocation.
Presentation/sound depends on user settings, Focus and scheduled delivery; ordinary notifications
must not be promised as unconditional, exact, audible alarms. Verify permitted and restricted cases
separately. [Apple notification authorization](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications),
[notification design guidance](https://developer.apple.com/design/human-interface-guidelines/managing-notifications).

A notification at expiry is also distinct from a continuously visible locked-screen countdown.
ActivityKit supplies Live Activities for that kind of glanceable state. Apple additionally offers
AlarmKit on **iOS/iPadOS 26+** for alarms/timers, with separate opt-in and alarm behavior that can override silent/Focus
modes. Neither is included in the proposed ordinary-notification prototype: select supported OS
versions, user intent and extra native scope first if these capabilities become requirements.
[ActivityKit](https://developer.apple.com/documentation/ActivityKit),
[Apple AlarmKit framework and availability](https://developer.apple.com/documentation/alarmkit),
[Apple alarm presentation and authorization](https://developer.apple.com/videos/play/wwdc2025/230/).

A native daily reminder is not automatically simpler than push suppression. A saved check-in can
cancel this device's pending local reminder, but another offline device cannot cancel it immediately.
Blindly repeating a calendar notification forever would ignore the completion rule. Any selected
design needs finite/reconciled scheduling, account/device identities and explicit behavior when the
app has not reopened. PWA and native channels must not both alert by accident. For a rest timer,
keep one authoritative target and stable notification identity across start/reset/extend/skip,
session closure and logout; reconcile native pending requests with durable timer state on resume.

## Build, signing and distribution from this Windows workspace

Windows can remain the source-editing workspace, but an iOS binary requires a compatible Mac/macOS
and Xcode build route, locally or through an explicitly chosen hosted Mac service. This repository
has no demonstrated route today. Current Capacitor v8 documentation requires Xcode 26+ and supports
iOS 15+; no framework installation or version choice is made here.
[Capacitor requirements](https://capacitorjs.com/docs/ios),
[Apple Xcode/macOS compatibility matrix](https://developer.apple.com/xcode/system-requirements).

Since April 28, 2026, App Store Connect uploads of iOS/iPadOS apps must use the iOS/iPadOS 26 SDK
or later. That build-SDK floor does not mean every tester must run iOS 26; deployment target and
feature availability are separate choices. Pin a compatible supported toolchain and target-device
matrix before a prototype, then recheck upload requirements before distribution.
[Apple SDK upload requirement](https://developer.apple.com/news/?id=ueeok6yw).

TestFlight requires an Apple Developer Program team, a matching App Store Connect app record/bundle
identifier and signed/provisioned builds, with version/build identity and required app assets.
Xcode can manage signing assets; credential custody and any hosted build access still need an owner.
Membership currently lists USD 99 per year, with regional pricing. No membership, Mac, signing team,
app record or budget was inspected or purchased in this task.
[Apple distribution preparation](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution),
[program enrollment](https://developer.apple.com/programs/enroll/).

Personal on-device development testing through Xcode's Personal Team has a short maintenance cycle:
**provisioning profiles expire seven days after issuance, requiring rebuild/reinstall**. Apple's
current limits are up to **3 registered devices, 3 installed apps per device and 10 App IDs**; the
device registrations and App IDs also expire after seven days. This can support a brief feasibility
experiment, but repeated provisioning is part of its cost, compared with TestFlight's 90-day build
window. Plan any longer observation accordingly. A simulator result is insufficient for locked-screen/
offline alert acceptance. [Apple Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account).

| Route | Distribution/review distinction | Fit for this project |
| --- | --- | --- |
| Owner-only internal TestFlight beta | The owner can test as an eligible App Store Connect team member after build processing/compliance; external Beta App Review is a separate gate. Builds expire after 90 days. | Technically a useful beta channel, but adds renewal/build maintenance and does not settle permanent personal distribution. |
| Invited external TestFlight beta | The first external build needs TestFlight App Review; later builds may also require review. Test information, feedback contact and review access must be prepared. | Invitations control binary distribution, not application authorization. Do not grant friends App Store Connect roles merely to avoid external review. |
| Public App Store | Submit a production-ready app/version and its store metadata for App Review and choose release/distribution settings separately. | A further product/support/privacy commitment. A TestFlight verdict is not public App Store approval. |

Apple distinguishes internal team testers from external testers and documents the 90-day build
window and external review flow. Uploads also require encryption/export-compliance assessment.
[TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview),
[TestFlight review](https://developer.apple.com/help/glossary/testflight-app-review/).

Apple's review rules affect feasibility: §2.2 says TestFlight betas should be intended for public
distribution; §4.2 requires value beyond a repackaged website. A wrapper is neither automatically
accepted nor automatically rejected. Native rest notifications may add useful app behavior, but
approval remains unproven. §2.1 requires working review access; use a dedicated review account or
an appropriately approved fully featured demo mode, not the owner's credentials. A hosted UI also
does not exempt changing behavior from review obligations. These are reasons to establish the
distribution intent before submission. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

Public release additionally needs accurate store presentation/support information and privacy
disclosures covering the actual training/recovery data and included SDKs. WebView traffic is included
in Apple's disclosure guidance; a wrapper does not make server collection disappear. A publicly
accessible privacy-policy URL is required. Inventory collection and dependencies before filling
labels or making privacy claims. No new telemetry SDK or privacy implementation is selected here.
[Apple app privacy details](https://developer.apple.com/app-store/app-privacy-details/).

## Owner-only use versus other app users

The smallest proposed experiment uses one synthetic account on a separately authorized test backend,
operated by the owner. The scope does not include friends or real account migration. Even an eventual
owner beta would need safe logout/re-login, local notification cancellation and cross-client
reconciliation before daily training moves to it.

Inviting others requires the deferred multiuser project: account creation/invitation and initial data,
identity mapping/migration if authentication changes, authorization isolation, account-bound cache
and outbox replay, safe account switching/logout, subscription ownership and operational/support
readiness. Existing user-scoped queries are a foundation, not proof of end-to-end multiuser safety.
The current first-run-only setup and unpartitioned local stores are concrete missing pieces.
See the [earlier pilot analysis](post-p10-roadmap-evaluation.md) and the code evidence above.

TestFlight's Apple Account is not the gym app's `userId`. Neither installation nor removal of a tester
creates/revokes an application account or clears its local data. An Entra tenant choice, if revisited,
would be another separate decision: multiple app users do not by themselves require Entra multitenancy.
Multiuser/Easy Auth implementation remains deferred. A reviewer/tester can instead use synthetic data
in a deliberately isolated test environment, but that does not validate shared live use.

## Bounded proof of concept, only if later selected

Suggested scope: **one owned HTTPS origin, one native shell approach, one physical iPhone/recorded OS,
one synthetic account, one rest timer and one locally scheduled reminder**. Keep existing training
logic and backend contracts. Test notification primitives and container compatibility, not full
feature delivery. No public listing, other users, reminder service, HealthKit, UI rewrite,
Live Activities or AlarmKit is included. Additional supported OS versions would be a later gate.

Relative sizes are work-package comparisons, not calendar estimates. Each package ends in evidence
and a stop/go decision; completing one does not authorize the next.

| Package | Size / dependencies | Acceptance / evidence |
| --- | --- | --- |
| 1. Define the experiment | S; owner selects the capability to prove and permits the environment | Record ordinary expiry alert versus persistent locked display/alarm needs, device/OS, Mac/Xcode route, test backend, signing ownership and permitted distribution. Resolve OD-05's candidate behavior for this experiment. No real-data migration. |
| 2. Notification primitive | S; package 1 and an authorized device build | Schedule one target; extend/reset replaces it, skip/disable/logout cancels it. Verify delivery after lock, background termination and offline operation following scheduling; record time, sound/presentation and permission/Focus settings. Reopening restores the target display without firing a stale alert. Demonstrate same-device check-in cancellation and disclose cross-device/offline limits. |
| 3. Existing web client containment | M, highest uncertainty; package 2 merits continuation | Prove persistent cookie login, SW control/cold offline launch, IndexedDB survival, local set/check-in commit, 401 preservation, same-account re-login and idempotent replay. Check user-triggered SW update, compatible web/native bridge versions, active-session takeover and no duplicated timer/notification after reload. Reject untrusted navigation/bridge calls. |
| 4. Owner beta decision | S–M; evidence from 1–3, separate distribution authorization | Summarize losses versus PWA, build/release maintenance, storage/migration plan and unresolved OS cases. Choose whether a signed device experiment is enough or a legitimate TestFlight beta is justified. If selected, prepare processing/compliance/review inputs and establish build-renewal ownership before daily use. |

The bridge should accept only a small validated schedule/cancel message from the owned page, bound
to the current timer/session; do not expose generic native execution, credentials or arbitrary URL
navigation. Native/browser suspension and web deployments require version compatibility and
reconciliation, not two independent timer authorities. These are proposed containment criteria,
not a selected framework specification.

Stop and return to the owner if any of these occurs:

- The required experience is an always-visible locked countdown or alarm behavior beyond ordinary
  notifications; that needs a separately scoped native capability instead of broadening this probe.
- SW/IndexedDB/cookie behavior cannot preserve the existing offline contract without splitting the
  Next.js client, bypassing authentication protections or building a new storage/sync system.
- Any pending operation is lost, applied under the wrong identity or silently duplicated; a target
  is inconsistent across web/native state; or cancellation/permission changes leave misleading alerts.
- There is no acceptable Mac/signing route, TestFlight intent does not fit the owner's personal-only
  goal, or ongoing native release upkeep outweighs the demonstrated benefit.

If PWA timer work is selected instead, its foreground-only slice is relatively S after behavior design;
PI-016 is a separate small optional slice once the timer semantics are established. PI-014 is more
likely M because scheduling, lifecycle and offline suppression need several cooperating parts.
These comparisons are not estimates for a reviewed implementation and do not change priority.

## Recommended sequence and unresolved decisions

Keep the accepted six-step roadmap and training use. Observe whether a visible timer solves the actual
friction; scope any chosen candidate explicitly. Revisit the native probe only when locked-screen/offline
delivery has enough value to justify it, then prove notification behavior and offline reuse before
deciding distribution. The PWA remains available throughout any future experiment.

Material decisions, when the owner wants to proceed:

1. Is the desired rest experience a foreground display, an expiry notification while locked/offline,
   or a continuously visible countdown/alarm? This determines the capability to scope.
2. Should any of PI-014…PI-016 or the bounded probe enter the selected order, and where? The current
   proposal leaves that order unchanged.
3. If native feasibility is worthwhile, is the intended use personal device testing or a beta toward
   public distribution, with a chosen Mac/signing route? Inviting live users remains a separate project.

Unverified facts: owner's device/OS and notification settings, Mac access, developer membership,
signing assets, WebView runtime compatibility, real notification delivery and release acceptance.
No source inspection or official capability page resolves those device/account facts. Independent
reports and the catalog observation boundary are preserved; this is not deployment closeout evidence.

DOCUMENTATION APPROVED — IOS OWNER SELECTION PENDING
