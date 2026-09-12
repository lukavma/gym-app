# Backlog

Updated: 2026-09-10. **The only editable backlog authority.**
[STATUS](STATUS.md) owns delivery state and the current gate;
[ROADMAP](ROADMAP.md) owns owner-selected order and dependencies.
Architecture/ADRs own accepted behavior; independent reports remain historical evidence.
A backlog entry or selected priority does **not** authorize implementation, production access or release.

## Authority and migration

PI-001…PI-008 were migrated from the **current, owner-modified working copy** of
`docs/input/product-ideas.md`, not from its committed version. Each original heading and body is
preserved below; the current status/remaining-scope note above it controls what is still open.
Preserved input is rationale and candidate criteria within this authority, not a second queue.
Historical statements about unimplemented foundations do not override accepted releases or ADRs.

Owner direction, recorded in the [consolidation report](reviews/post-p10-documentation-consolidation.md):
continue the personal app; defer multiuser/Easy Auth implementation; select Recovery improvement,
account export, a **separate** backup/recovery engineering task, then Dashboard v2 design and implementation.
Real training runs alongside that sequence. Other ideas remain demand-driven.
The earlier [roadmap evaluation](reviews/post-p10-roadmap-evaluation.md) is a proposal/evidence source;
its optional-Recovery/use-pause/deferred-dashboard recommendations do not override this decision.

New identifiers allocated here: PI-009 account export; PI-010 backup/recovery verification;
PI-011 Dashboard v2; PI-012 linked top-set/back-off; PI-013 the existing gated e1RM Release B.
These allocations organize known work and discussion; they do not add accepted behavior.

Follow-up accepted **backlog ideas**: PI-014 daily check-in reminder, PI-015 set-rest timer,
PI-016 optional short-rest hint. These are unselected implementation candidates; the selected
order is unchanged. Platform feasibility and a possible later prototype are evaluated in
the [pending iOS evaluation](reviews/ios-beta-distribution-evaluation.md), not decided by these entries.

| ID | Current disposition |
| --- | --- |
| [PI-001](#pi-001) | Suspicious entry warning — open, demand-driven |
| [PI-002](#pi-002) | Training-date correction — open, design-gated |
| [PI-003](#pi-003) | Routines delivered; composition/seeded suggestions deferred |
| [PI-004](#pi-004) | Persistent navigation — open, coordinated under PI-008 |
| [PI-005](#pi-005) | Profile foundation complete; later athletic ideas demand-driven |
| [PI-006](#pi-006) | Completed History deletion — open, dependency audit first |
| [PI-007](#pi-007) | Recovery check-in — selected next product improvement |
| [PI-008](#pi-008) | UI polish — open, prototype/demand-gated |
| [PI-009](#pi-009) | Account data export — selected product feature |
| [PI-010](#pi-010) | Backup posture and demonstrated recovery — selected engineering task |
| [PI-011](#pi-011) | Dashboard v2 — selected; scope/design before implementation |
| [PI-012](#pi-012) | Linked top-set/back-off — discussed, unselected, design-gated |
| [PI-013](#pi-013) | e1RM Release B — deferred behind existing usage/design gates |
| [PI-014](#pi-014) | Optional daily check-in reminder — accepted idea, scope/platform unselected |
| [PI-015](#pi-015) | Set-rest timer — accepted idea, behavior/platform design-gated |
| [PI-016](#pi-016) | Optional short-rest hint — accepted idea, depends on PI-015 semantics |
| [PI-018](#pi-018) | Workout prescription context — selected, inserted between Recovery and export; architecture accepted, implementation in flight |

<details>
<summary>Preserved source introduction</summary>

<!-- migrated-source:introduction:start -->
# Product ideas

Raw product follow-ups observed during real training. These are backlog inputs, not accepted
architecture or permission to change progression behavior without a scoped design pass.

<!-- migrated-source:introduction:end -->

</details>

<a id="pi-001"></a>

## PI-001 — Suspicious set-entry confirmation

**Status: Open; demand-driven.** Not in the selected delivery sequence.
The reported swapped-entry incident and warning/override behavior below remain the candidate scope.
Existing History corrections and downstream e1RM plausibility filters do not provide this entry-time
protection. Calibrate thresholds against real examples, account for the delivered measurement
profiles/load bases, and preserve deterministic offline behavior without changing progression.
Evidence and reconciliation: [roadmap evaluation §3–4](reviews/post-p10-roadmap-evaluation.md).

<details>
<summary>Preserved original input and candidate criteria — PI-001</summary>

<!-- migrated-source:PI-001:start -->

**Observed case:** a `90 kg × 8 reps` Barbell Row was accidentally entered as `8 kg × 90 reps`.
The stored facts were internally valid, so load progression correctly treated 8 kg as the modal
working load and proposed 10 kg. The arithmetic was correct, but the input mistake was easy to
make and expensive to notice only at the next workout.

Add a lightweight, non-blocking **“Are you sure?”** confirmation before logging a work set whose
weight or reps differs implausibly from the most recent comparable performance for the same
exercise. Also consider a specific “weight and reps may be swapped” signal when swapping the two
draft values would closely match the previous performance or current prescription.

Candidate behavior:

- Compare against the most recent completed, non-deload performance already present in the
  workout context; do not require a new online request.
- Consider both relative change and absolute exercise load steps so small weights do not create
  noisy percentage-only warnings.
- Treat extreme deviation from prescribed reps as a supporting signal, not an invalid value.
- Exclude warmups, intentional recommendation targets, deload-modified targets, bodyweight/0 kg,
  and exercises without a useful comparison.
- Warn rather than reject: offer **Go back** and **Log anyway**; never silently swap or alter facts.
- After **Log anyway**, suppress the same warning for that exercise for the rest of the session so
  legitimate high-rep or load-change work is not nagged repeatedly.
- Keep the check deterministic and offline-capable. It is input-error protection, not a new
  progression heuristic, and must not change recommendation evaluation.

Example copy:

> Unusual entry: 8 kg × 90 is far from your previous 90 kg × 8. Could weight and reps be swapped?

Thresholds and the exact comparison baseline remain to be chosen from real-session examples and
tested for false positives before implementation.

<!-- migrated-source:PI-001:end -->

</details>

<a id="pi-002"></a>

## PI-002 — Editable workout training date

**Status: Open; demand-driven; schema/domain design required.** Not in the selected sequence.
The reported date mismatch, timestamp preservation and consumer audit below remain relevant.
The last-work-set default is a candidate to decide, not an accepted rule. Design migration,
cross-midnight/timezone behavior, old-client/outbox compatibility and downstream attribution together.
Evidence: [roadmap evaluation §3–4](reviews/post-p10-roadmap-evaluation.md) and
[session model](architecture/data-model.md).

<details>
<summary>Preserved original input and candidate criteria — PI-002</summary>

<!-- migrated-source:PI-002:start -->

**Observed case:** a workout performed on 24 August appeared in history and volume tracking under
23 August because the session may have been opened the previous day. Using `started_at` as both an
event timestamp and the workout's calendar date makes an early-opened or resumed session look as if
it was trained on the wrong day.

Give completed workout sessions an explicit, user-local **training date** that can be corrected from
session history. Keep `started_at`, `completed_at`, and set `logged_at` timestamps intact as factual
event times; do not silently rewrite them when the training date changes.

Candidate behavior:

- When completing a session, default its training date to the user-local date of the latest logged
  working set. This reflects when training actually happened even if the workout was opened earlier.
- If the session contains no working set, fall back to the local completion date, then the local
  start date if it has not been completed.
- If start, last-set, and completion dates differ, show the selected training date in the completion
  flow so it can be corrected without hunting through settings.
- Allow the training date to be edited later from session history. Make the downstream effect clear:
  volume/week attribution and history grouping move to the selected date.
- Do not continually recompute the date after completion or after minor historical set corrections;
  once assigned, it remains a user-owned fact until explicitly edited.
- Define cross-midnight behavior and timezone changes explicitly in the design. A workout with its
  final set shortly after midnight is inherently ambiguous, so the default must remain overridable.
- Preserve deterministic progression ordering using actual event timestamps unless a focused design
  pass establishes that the calendar date should affect it.

This requires a scoped schema/domain design pass before implementation, including migration of
existing sessions and an audit of every current `started_at` consumer (history, weekly volume,
scheduling, progression, exports, offline sync, the metrics dashboard, and the estimated 1RM
tracker — both key sessions by `started_at`).

<!-- migrated-source:PI-002:end -->

</details>

<a id="pi-003"></a>

## PI-003 — Contextual warm-up block suggestions

**Status: Delivered routine foundation; automatic composition/content suggestions deferred.**
Reusable user-authored routines, ordered items, template-linked alternatives/default, Today preview
and offline workout display are delivered foundations. The accepted choices are M:N template links,
linked choices only, management under Programs, transient checklist state and no seeded content.
The remaining idea is the exercise-to-item suggestion/composition layer; do not rebuild the routine
foundation. Keep the research/content-approval gate for app-supplied defaults. The existing research
report does not by itself authorize seeded mappings.
Evidence: [owner decisions O-1…O-7](reviews/warmup-routines-architecture-evaluation.md),
[routine verification](reviews/warmup-routines-remediation-verification-2.md),
[warm-up set acceptance](reviews/warmup-set-classification-device-acceptance.md) and
[research input](reviews/warmup-routines-evidence-research.md).

<details>
<summary>Preserved original input and candidate criteria — PI-003</summary>

<!-- migrated-source:PI-003:start -->

Before a workout, offer a short warm-up block assembled from a small, predefined library according
to the movement demands of Today's workout. For example, a press-heavy day could combine one
general cardio option (such as 3–5 minutes on a rower or assault bike) with shoulder external
rotation, horizontal rotation/scapular work, and one or two press-specific preparation movements.

This is a lightweight preparation checklist, not another training log. It must remain optional,
skippable, and separate from the warm-up sets already recorded against loaded exercises.

Candidate behavior:

- Maintain a small library of general, movement-pattern-specific, and optionally lift-specific
  warm-up items. Each item has a short instruction or duration, not performance targets.
- Build a deterministic block from the current workout: one general warm-up option plus a few
  relevant items for dominant patterns such as pressing, pulling, squatting, or hinging.
- Avoid duplicates when several exercises need the same preparation and keep the resulting block
  deliberately short.
- Let the user swap the general cardio option, skip individual items, dismiss the whole block, and
  eventually edit preferred items or defaults.
- Do not persist completion, sets, reps, load, calories, or adherence. Opening or skipping the block
  must never affect session completion, volume, progression, recovery, or recommendations.
- Keep the suggestion available offline from the already-cached workout context and warm-up library.
- Use neutral preparation language; do not claim injury prevention or medical benefit.

Prefer a deliberately simple first version based on explicit **exercise → warm-up item** mappings.
Each exercise may declare zero or more preparation items; composing Today's block takes the union
of those items, removes duplicates, and orders them by a small stable priority. For example,
Barbell Bench Press may map to shoulder external rotation and horizontal/scapular rotation, while
another press can reuse either item without rendering it twice. Seeded exercises can ship with
curated mappings and user-created exercises can initially have none or copy mappings from a similar
exercise.

Muscle-group matching should not be the primary mechanism: exercises involving the same muscles can
have different joint positions and preparation needs. Normalized movement-pattern defaults could be
added later as a fallback, but they are unnecessary for the initial deterministic A→B model. In the
composition rules, an item may be marked as a required ingredient of the suggested block, but it
must never become mandatory for starting or completing the workout.

### Research gate before seeded mappings

Do not turn example drills into shipped defaults solely from coaching convention. Before defining
the initial library and exercise mappings, commission a focused evidence review that answers:

- What general warm-up duration and intensity improves or preserves subsequent resistance-training
  performance without creating meaningful fatigue?
- When does a lift-specific warm-up add value beyond progressive warm-up sets of the lift itself?
- What do dynamic mobility, activation drills, and static stretching acutely do to strength, power,
  range of motion, and perceived preparedness?
- Is there credible support for recurring shoulder-, squat-, hinge-, press-, or pull-specific drills,
  or should those mappings be labeled as user preference/coaching heuristic?
- Which variables materially depend on training temperature, load, age, pain/injury history, or the
  first working exercise, and therefore should not become universal defaults?
- What is the smallest useful protocol, and which commonly suggested elements add time without a
  demonstrated benefit?

The review should prioritize systematic reviews, meta-analyses, relevant position statements, and
the strongest applicable primary studies; record population and outcome limitations rather than
generalizing from athletes or rehabilitation patients. It must distinguish acute performance or
preparedness evidence from injury-prevention claims. Each shipped default should be classified as
evidence-supported, coaching heuristic, or user-authored preference, with appropriately modest UI
copy. If the evidence does not support a drill-level prescription, ship editable examples rather
than presenting them as required or optimal.

<!-- migrated-source:PI-003:end -->

</details>

<a id="pi-004"></a>

## PI-004 — Pinned mobile navigation

**Status: Open; demand-driven; part of PI-008's presentation work.**
Existing wrapping navigation addresses overflow; persistent navigation remains a separate idea.
Keep this ID and the phone-prototype criteria below, but deliver the selected navigation treatment
through [PI-008](#pi-008) rather than create a duplicate redesign workstream.
Evidence: [roadmap evaluation §3–4](reviews/post-p10-roadmap-evaluation.md).

<details>
<summary>Preserved original input and candidate criteria — PI-004</summary>

<!-- migrated-source:PI-004:start -->

Keep the application's primary navigation reachable while scrolling long screens instead of making
the user return to the top of the page. The first design candidate is a compact sticky header that
respects the installed iPhone PWA's top safe area and continues to show the active destination.

Candidate behavior:

- Pin the navigation after its normal position reaches the top; do not let it cover page content.
- Preserve access to every destination without document-level horizontal scrolling at supported
  phone widths. If the current two-row link layout consumes too much vertical space when pinned,
  use a compact menu treatment rather than permanently pinning two full rows.
- Respect `env(safe-area-inset-top)`, standalone-PWA chrome, the software keyboard, update toasts,
  sync warnings, and other fixed or sticky UI layers.
- Keep touch targets usable and show an unambiguous active-route state.
- Avoid crowding the workout's logging controls or creating accidental navigation during rapid set
  entry; the active-workout presentation may use a smaller variant if necessary.
- Add phone-viewport checks for content occlusion, horizontal overflow, focus visibility, and correct
  stacking while scrolling.

Whether this is implemented as a sticky top navigation, a compact menu button, or a small bottom
navigation should be decided with an iPhone prototype. The requirement is persistent, low-friction
navigation—not a particular chrome pattern.

<!-- migrated-source:PI-004:end -->

</details>

<a id="pi-005"></a>

## PI-005 — Athletic exercise measurement profiles

**Status: Foundation complete — Athletic Measurement Profiles Releases 1–3, owner-confirmed.**
Implementation and independent verification exist; [STATUS](STATUS.md) distinguishes those records
from deployment/device receipts. The delivered vocabulary is `load_reps`, `reps`, `load_distance`,
`distance_time`, `duration`, `load_duration`, with load-basis semantics and disable-only consumer
eligibility. The source text below predates that delivery: its “current” strength-only model,
candidate names and foundation architecture gate are historical, not outstanding tasks.
Remaining demand-driven ideas include profile-appropriate descriptive records, pace/distance trends
or separately designed compatible progression. Catalog Expansion 1 is a separate release closeout,
not unfinished profile architecture. e1RM Release B stays under [PI-013](#pi-013).
Evidence: [accepted architecture/decisions](reviews/athletic-measurement-profiles-architecture-evaluation.md),
[R1 verification](reviews/athletic-measurement-profiles-release-1-remediation-verification.md),
[R2 verification](reviews/athletic-measurement-profiles-release-2-remediation-verification.md) and
[R3 review](reviews/athletic-measurement-profiles-release-3-review.md).

<details>
<summary>Preserved original input and candidate criteria — PI-005</summary>

<!-- migrated-source:PI-005:start -->

The current exercise, prescription, snapshot, set-log, progression, and workout UI model assumes
that almost every exercise is recorded as `load + reps + optional RIR`. That works for conventional
resistance exercises but forces athletic movements into misleading or fabricated values.

Introduce an explicit, versioned **measurement profile** on each exercise so the app can render and
validate fields appropriate to what the athlete actually performed. Candidate use cases include:

- Sled Push, Pull, or Drag — load + distance, optionally time.
- Farmer or Suitcase Carry — load + distance, optionally time.
- Sprint or Shuttle Run — distance + time.
- Med Ball Slam or Throw — implement load + repetitions.
- Jumps and plyometrics — repetitions initially; measured height/distance only if modeled later.
- Planks and other isometrics — duration.

Candidate profile vocabulary:

- `strength_reps`
- `loaded_distance`
- `timed_distance`
- `duration`
- `reps_only`

Treat names such as `power_reps` cautiously: power or explosive intent is not itself a recorded
measurement unless velocity, height, distance, or another power-related result is actually logged.
Movement intent and measurement shape may need to remain separate concepts.

Candidate behavior:

- The exercise profile defines the allowed and required log fields from a closed vocabulary such
  as load, repetitions, distance, duration, and RIR. Do not use an unrestricted arbitrary JSON bag.
- The prescription editor exposes compatible targets for the selected profile instead of forcing
  every prescription through the existing fixed/rep-range scheme.
- The session-exercise snapshot freezes the profile and prescription semantics used when the
  workout started so later exercise edits cannot reinterpret historical logs.
- Workout and history forms render only meaningful inputs and labels. Derived values such as pace
  or speed should normally be calculated from recorded distance and time rather than stored twice.
- Existing exercises and historical logs migrate explicitly to the current `strength_reps`
  behavior without changing their meaning.
- A logged set remains an ordered attempt or round, even when its measurement is time or distance
  rather than repetitions.
- Units, precision, bounds, zero-value behavior, assisted-load direction, per-hand versus total
  load, and unilateral conventions must be designed explicitly rather than inferred from equipment.
- Unsupported profile/strategy combinations fail closed with clear UI guidance.

Progression must be profile-aware. Existing load- and rep-progression strategies remain compatible
only with profiles whose facts actually satisfy their inputs. The first version may allow athletic
profiles to be tracked without any automatic progression; future strategies could separately model
pace, time, distance, load-over-distance, or quality, but must not reuse strength logic by analogy.

### Capability defaults and overrides

Do not model e1RM, progression, and volume as three unrelated exercise-level booleans that can be
combined into invalid states. Separate the shape of the recorded facts from the features that may
consume them:

- The exercise's measurement profile defines which values can be logged.
- e1RM eligibility is an exercise-level capability with a disable-only user override. An
  incompatible profile can never be forced into the estimator merely by switching it on.
- Progression belongs primarily to the prescription or program context, because the same exercise
  may be tracked manually in one program and progressed by load, repetitions, distance, or time in
  another. Candidate modes are `none`, `manual`, and a compatible registered strategy.
- Volume participation gets a conservative profile default. Athletic profiles should initially be
  excluded from the existing muscle-set model unless a later design establishes an explicit,
  compatible counting rule; recording an attempt must not automatically make it comparable to a
  hypertrophy-oriented working set.
- Descriptive history and profile-appropriate personal records remain possible even when all three
  automated consumers are disabled.

For example, a Med Ball Slam may record implement load and repetitions while defaulting to e1RM
off, existing muscle-volume tracking off, and manual progression. Useful descriptive records can
still include the heaviest ball or most repetitions, without pretending that a meaningful 1RM or
generic load-progression model exists. A Sled Push may record load, distance, and time while leaving
future progression semantics to a dedicated compatible strategy.

Profile defaults should fail closed, while user overrides may disable compatible behavior but must
not enable an incompatible engine. The architecture pass must decide whether any volume override
belongs to the exercise, the prescription, or both, and how a profile or capability change is
snapshotted so it never reinterprets historical sessions.

This is not merely an additive database column. It crosses `Exercise`, `ExercisePrescription`, the
versioned session snapshot, `SetLog`, history, progression compatibility, Today/workout forms,
offline payload validation, replay/idempotency, exports, and migrations. Any design must preserve
old cached bundles and active sessions and must explicitly re-audit the sync supersession invariant
before adding optional payload fields.

### Architecture gate and e1RM interaction

Commission a dedicated architecture pass before implementation to decide whether profiles are a
closed discriminated union with typed columns, a versioned measurement payload, or another
relational design. The choice must preserve database-level integrity, deterministic offline replay,
editable history, and snapshot-on-use semantics without creating an unqueryable generic event bag.

Coordinate this decision with the Estimated 1RM work. A genuine `strength_reps` measurement profile
may become the structural eligibility gate for e1RM and could supersede or narrow the proposed
per-exercise `strength_estimate` switch. Avoid adding overlapping exercise metadata until their
respective responsibilities and migration path are explicit.

Preferred sequencing: ship the read-only e1RM tracker first, add a read-only metrics dashboard from
existing data, complete this dedicated architecture evaluation, implement the measurement/logging
foundation, then expand the seeded catalog with athletic movements. Build advisory e1RM load
translation only after the capability boundary exists, so it can structurally reject incompatible
profiles instead of accumulating exercise-name or equipment exceptions.

<!-- migrated-source:PI-005:end -->

</details>

<a id="pi-006"></a>

## PI-006 — Delete completed workouts from History

**Status: Open; demand-driven; dependency audit required before implementation.**
Set correction/deletion and active-session abandon are existing foundations; deleting a whole
completed workout is the remaining feature. Retain single-session confirmation, ownership,
transactionality and all criteria below. Resolve recommendation/embedded-decision dependencies,
carry-forward, caches and stale-device resurrection before choosing online-only or outbox deletion.
Online-only would need an explicit decision against the execution-facts write-path invariant.
The original missing-versus-foreign wording needs a non-disclosing response contract; do not reveal
foreign-session existence merely to distinguish cases.
Evidence: [roadmap evaluation §4](reviews/post-p10-roadmap-evaluation.md),
[historical-integrity ADR](architecture/adr/ADR-007-historical-integrity.md) and
[accepted sync deviation D-03](architecture/deviations.md).

<details>
<summary>Preserved original input and candidate criteria — PI-006</summary>

<!-- migrated-source:PI-006:start -->

Allow a completed workout to be permanently deleted from its History detail screen so accidental,
duplicate, and test sessions can be removed without editing every set individually. The first
version should delete one explicitly selected session at a time; do not add a bulk "clear history"
action.

Candidate behavior:

- Place a clearly destructive "Delete workout" action on the completed-session detail screen,
  separated from ordinary editing controls.
- Require an explicit confirmation that identifies the workout date and session. After deletion,
  return to History and confirm that the session is gone.
- Delete the complete execution aggregate transactionally and user-scoped: session exercises, set
  logs, and any other rows whose lifecycle is owned by that workout. Never accept a session id
  without verifying ownership.
- Active or in-progress workouts remain governed by the existing abandon/discard flow and cannot be
  deleted through completed History.
- Volume, e1RM, and other computed-on-read analytics must reflect the deletion immediately. Audit
  persisted progression recommendations and decisions explicitly so a result derived from the
  deleted workout cannot remain silently authoritative.
- Define cache invalidation and offline behavior deliberately. Either implement an idempotent,
  replay-safe session-delete operation in the outbox or make v1 transparently online-only; never
  show a successful local deletion that can later be resurrected by sync.
- A repeated delete request should converge safely. Missing/already-deleted and foreign sessions
  must remain distinguishable without leaking another user's data.
- Add clean-database integration and browser coverage for ownership, cascades, dependent analytics,
  repeated deletion, navigation, and cancellation of the confirmation.

This needs a narrow dependency audit before implementation because deleting the source rows is
simple, while invalidating or superseding persisted progression state derived from them may not be.

<!-- migrated-source:PI-006:end -->

</details>

<a id="pi-007"></a>

## PI-007 — Recovery check-in completeness and scale clarity

**Status: Selected — next small product improvement after catalog closeout and documentation.**
The existing schema, Recovery History editor and Metrics display already support sleep duration.
Remaining scope is the ordinary Today new/edit/clear and unknown-offline entry paths plus consistent
Muscle soreness labels/anchors. Preserve optional/null values, omitted-versus-cleared updates and
touched-fields-only offline behavior; no new recovery score or progression input.
The original criteria below remain the bounded product input for the next implementation task.
Priority source: owner direction recorded in the [consolidation report](reviews/post-p10-documentation-consolidation.md).
Evidence: original owner observation below and [roadmap evaluation §4](reviews/post-p10-roadmap-evaluation.md).
This Recovery UX item is distinct from [PI-010 backup/recovery verification](#pi-010).

<details>
<summary>Preserved original input and candidate criteria — PI-007</summary>

<!-- migrated-source:PI-007:start -->

**Observed during Metrics Dashboard device acceptance:** sleep duration appears as a dashboard
metric, but the ordinary Today recovery check-in does not offer a way to enter it. The value is
already supported by the schema and can be edited from Recovery history, making this primarily a
logging-flow and discoverability gap rather than a new metric.

Add optional sleep-duration entry to the normal recovery check-in and make the meaning of the
1–5 soreness scale explicit. Preserve the existing nullable fields and stored values; this does not
require redefining the recovery model or migrating the scale.

Candidate behavior:

- Let sleep duration be entered, edited, or cleared from both the new-check-in and existing-entry
  paths on Today, not only from History. Use a compact mobile control suitable for fractional hours
  without implying false precision.
- Keep sleep duration optional. Do not fabricate a default value when the athlete leaves it unset.
- Preserve the current presence-aware update semantics: omitted fields remain unchanged and an
  explicit clear writes `null`. Offline logging must retain the same touched-fields-only behavior.
- Rename the visible metric to **Muscle soreness** where space permits and show clear anchors:
  `1 = None`, `3 = Moderate`, `5 = Very high`. A value of 1 therefore means no soreness rather than
  a non-zero amount.
- Apply the same terminology and interpretation across Today, Recovery history, and Metrics while
  keeping the underlying 1–5 values unchanged.
- Verify new, edit, clear, offline/replay, narrow-phone, and accessibility behavior without making
  recovery input mandatory or feeding it into progression.

This can be implemented as a focused Recovery UX follow-up and does not block the accepted Metrics
Dashboard or the next planned feature.

<!-- migrated-source:PI-007:end -->

</details>

<a id="pi-008"></a>

## PI-008 — Application UI polish pass

**Status: Open; demand-driven presentation work; includes PI-004 navigation.**
Keep the real-iPhone prototype and accessibility criteria below. Existing overflow corrections are
delivered; an app-wide polish pass is not selected by this consolidation. The source's five-card
constraint protects polishing Metrics v1; it does not preselect [Dashboard v2](#pi-011)'s design.
Reconcile any overlap when v2 is scoped so one visual change is not tracked twice.
Evidence: [roadmap evaluation §4](reviews/post-p10-roadmap-evaluation.md) and
[dashboard v1 verification](reviews/metrics-dashboard-remediation-verification-2.md).

<details>
<summary>Preserved original input and candidate criteria — PI-008</summary>

<!-- migrated-source:PI-008:start -->

The application is functionally strong and usable on the installed iPhone PWA, but much of the UI
still presents as a collection of utilitarian forms and similarly weighted cards. Run a dedicated
visual-polish pass after the current feature sequence rather than mixing cosmetic redesign into
unrelated domain work.

Candidate goals:

- Establish a clearer visual hierarchy for page titles, primary actions, summary values, supporting
  copy, cards, tables, empty states, warnings, and destructive actions.
- Refine typography, spacing, borders, surface contrast, color use, and numeric alignment through a
  small set of reusable tokens or primitives instead of one-off styling per screen.
- Give the Metrics Dashboard stronger information hierarchy while preserving its five-card order,
  exact metric semantics, mobile density, and lightweight chart boundary.
- Review Today/workout execution, History, Programs, Recovery, Volume, and strength estimates for
  consistent interaction patterns and presentation rather than redesigning only the newest screen.
- Preserve accessible contrast, visible focus, semantic headings, at least 44 px touch targets,
  safe areas, offline/sync states, long-content handling, and zero horizontal overflow at supported
  phone widths.
- Prefer restrained visual distinction and progressive refinement over decorative dashboards,
  animation, dense charting, or a wholesale navigation rewrite.
- Prototype and compare the highest-impact surfaces on a real iPhone before applying an app-wide
  direction, then protect the chosen system with viewport and accessibility checks.

This is presentation work only. It must not change calculations, progression, recovery semantics,
offline behavior, or accepted feature scope merely to produce a cleaner visual result.
<!-- migrated-source:PI-008:end -->

</details>

<a id="pi-009"></a>

## PI-009 — User-accessible account data export

**Status: Selected product feature, after PI-007. Scope/design remains to be settled before implementation.**
Source: accepted owner direction in the [consolidation report](reviews/post-p10-documentation-consolidation.md).

Outcome: the user can obtain their own account data through the app. This is a product capability,
distinct from an operator backup, a database dump or proof that the service can be restored.

The focused scope pass must define the export's coverage, format/version, user-facing access,
consistent-snapshot behavior, and handling of unsynced local data. Cover the current measurement
profiles and decide how definitions, execution facts/snapshots, bodyweight/recovery and
recommendation decisions are represented. Exclude credentials, tokens and secrets.
A versioned account JSON export is a prior proposal, not a format selected by this entry.
Do not infer import/restore UI, scheduled exports or file-format alternatives as accepted scope.

Completion evidence: an owner-usable download, documented included/excluded data and unsynced-data
behavior, appropriate completeness/ownership verification, independent review and device acceptance
for the agreed flow. Plan implementation only after that bounded scope is agreed.
Dependencies: catalog closeout, documentation consolidation and Recovery in the selected order;
coordinate the export contract with PI-010 without combining their acceptance criteria.
Inputs: [roadmap evaluation §2](reviews/post-p10-roadmap-evaluation.md) and
[Phase 10 historical plan](architecture/implementation-plan.md).

<a id="pi-010"></a>

## PI-010 — Backup posture and demonstrated recovery

**Status: Selected engineering task, after PI-009; separate from Recovery UX and account export.**
Source: accepted owner direction in the [consolidation report](reviews/post-p10-documentation-consolidation.md).

Outcome: establish the actual backup posture and demonstrate a recoverable application/database
state. Existing architecture/provisioning descriptions are inputs, not current operational proof.
The scoped task must define the authorized environment/access, backup inventory, isolated restore
target, integrity checks, reconnection procedure and cleanup; record what was demonstrated,
remaining limitations and recovery measurements. It must not risk the live account to prove a drill.

Do not infer authorization for production access, resource creation, secret access, a scheduled
`pg_dump` job or infrastructure changes from this entry. Choose any required backup changes only
after assessing the actual posture. A successful user export does not close the restore task;
successful restore verification does not deliver PI-009's user-facing download.

Completion evidence: a dated posture record and a demonstrated restore with validation and cleanup,
plus explicit unresolved operational steps. No such completion is asserted by this consolidation.
Inputs: [roadmap evaluation §2/6](reviews/post-p10-roadmap-evaluation.md),
[platform ADR](architecture/adr/ADR-009-azure-platform.md) and
[provisioning documentation](deployment/azure-provisioning.md).

<a id="pi-011"></a>

## PI-011 — Dashboard v2

**Status: Selected roadmap feature, after PI-010; scope/design must precede implementation.**
Source: accepted owner direction in the [consolidation report](reviews/post-p10-documentation-consolidation.md).

Foundation: Metrics dashboard v1 / Phase 9a, with its selection editor, is already implemented and
recorded as shipped. V2 is explicitly selected; its content, charts, layout, data windows and
acceptance criteria have not been selected here.

First deliver a bounded scope/design identifying the training questions to answer, data/derivation
semantics, mobile/offline behavior and overlaps with PI-008. Obtain scope acceptance before building.
Historical Phase 9 candidates (tonnage, per-muscle volume trends, decision statistics, History
search/filters) are inputs to that decision, not a promised v2 feature list. Resolve OD-04 only if
the chosen design requires a charting-library decision. Preserve accepted domain/profile/evidence
boundaries unless an explicit architecture change is selected.

Completion is two gates: accepted v2 scope/design, then implemented/reviewed and device-accepted
behavior against that scope. Real training informs the design and continues alongside the work;
it is not a blanket block-completion prerequisite for v2.
Inputs: [v1 verification](reviews/metrics-dashboard-remediation-verification-2.md),
[roadmap evaluation §4](reviews/post-p10-roadmap-evaluation.md) and
[open decisions](architecture/open-decisions.md).

<a id="pi-012"></a>

## PI-012 — Linked top-set/back-off prescriptions

**Status: Discussed idea; unselected, demand-driven and design-gated.**
Source: the owner's request to retain this discussed idea in this consolidation. No detailed
accepted specification was found in the current product-ideas input.

Intent to evaluate: express a top set and linked back-off work for the same exercise rather than
maintaining unrelated targets manually. The link's basis (planned top-set load, actually performed
load or another explicitly chosen basis), reduction rule, rep/set structure, rounding, overrides,
skipped/failed-top-set behavior and progression interaction are all undecided. No percentage,
algorithm or automatic training adjustment is selected here.

Existing [prescription model](architecture/prescription-model.md) reserves `perSet` and
`percentOfTop`/absolute-offset shapes; [ADR-008](architecture/adr/ADR-008-prescription-representation.md)
anticipates richer prescriptions. Reserved shapes do not implement this linked workflow or settle
its behavior. The accepted e1RM revision already handles plausible top-set evidence in estimates;
that is separate from prescribing linked back-offs and must not be reopened from an older review.

Revisit on a concrete training example. A scoped design must address representation and editor UX,
snapshot integrity, profile compatibility, actual logged facts, offline/replay behavior,
carry-forward/progression and e1RM/volume interpretation. Establish whether current structures
suffice before selecting a schema or engine change. No dependency on shipping PI-013 is assumed.
Evidence: [accepted e1RM revision](reviews/estimated-1rm-load-translation-architecture-revision.md)
and [roadmap evaluation's progression-scope constraint](reviews/post-p10-roadmap-evaluation.md).

<a id="pi-013"></a>

## PI-013 — e1RM Release B advisory starting suggestion

**Status: Deferred; existing usage and design gates retained. Not in the selected sequence.**
This entry indexes an already discussed feature; it creates no new scope decision.

Release A tracker/what-if is implemented. Measurement Profiles R1–R3 provide the capability boundary.
Release B remains subject to **at least one block of Release A use**, the binding revision's
**fire-rate prototype (§18 step 4(c))**, and confirmation of the applicable design/owner decisions
against the delivered profile model. The usage/prototype gates are not certified complete here.
Training alongside the selected roadmap can supply this evidence; elapsed time alone cannot.

The accepted ADR describes an advisory starting suggestion, optional bundle data, device-local
freeze and a **Use** action filling the weight input only. Preserve refusal/profile/load-basis
boundaries and the separation from prescription mutation or implicit recommendation acceptance.
The direct-tier-only cut remains an owner-selectable fallback, not the selected scope.
Evidence/authority: [ADR-011](architecture/adr/ADR-011-strength-estimation-and-load-translation.md),
[binding revision](reviews/estimated-1rm-load-translation-architecture-revision.md) and
[Release A verification](reviews/estimated-1rm-release-a-remediation-verification.md).

<a id="pi-014"></a>

## PI-014 — Optional daily check-in reminder

**Status: Accepted backlog idea; implementation, delivery channel and priority insertion unselected.**
Source: owner follow-up, 2026-09-10. Candidate criteria below bound a later design; they are not an
approved implementation specification. Related: [PI-007 Recovery](#pi-007) and the
[iOS/PWA evaluation](reviews/ios-beta-distribution-evaluation.md).

Intent: optionally remind the owner to complete a daily check-in. First define which saved input
counts as completion (Recovery, bodyweight or an explicitly chosen combination), including partial
check-ins. PI-007's field-completeness work informs this definition; selecting PI-007 does not select
notifications. This is distinct from OD-08's historical training-day/session reminder.

Candidate scope and acceptance for a later design:

- Disabled by default. Let the user configure local reminder time and an explicit timezone, opt in
  before requesting notification permission, and turn reminders off. Reconcile the reminder zone
  with the existing account-local check-in date; decide travel, timezone changes and daylight-saving
  missing/repeated times without double reminders. Permission denial/revocation must leave logging usable.
- Suppress a reminder when that day's qualifying check-in is known to be complete. A server sender
  must recheck immediately before dispatch, but an **offline check-in may still be unknown to the
  server**. Disclose that a reminder can arrive despite checking in offline; do not label unknown
  state as a missed check-in. A native local schedule can be cancelled from a same-device save;
  completion on another disconnected device has the same knowledge gap.
- Bind every subscription or local schedule to the authenticated account and its device/installation.
  Define registration, replacement, permission changes, stale endpoint cleanup, unsubscribe, logout,
  re-login and reinstall behavior. Stop/cancel reminders on opt-out/logout; reconcile server state
  when connectivity returns. Never attach an old device subscription to a different login implicitly.
- Decide whether the user chooses one reminder device or several. Use stable account/day/reminder
  and device identities to prevent duplicate dispatch on retries, repeated registration, multiple
  tabs/installs and overlapping PWA/native channels. Record the limits of cancellation after dispatch
  and avoid an exactly-once delivery promise across disconnected devices.
- Verify known-complete/known-incomplete/unknown-offline states, duplicate jobs/subscriptions, local
  date boundaries, permission changes and logout/re-login. Keep notification text minimal on a locked
  screen. Sender health/failures and subscription lifecycle are part of any selected push slice.

Foundation: [daily-log outbox/cache](../src/sync/dailyLogs.ts) and
[account timezone resolution](../src/sync/accountTimezone.ts) already preserve account-local dates
and distinguish unknown offline state. A scheduler, push subscriptions and notification UI are not
implemented in the inspected source. [OD-08](architecture/open-decisions.md) remains historical
scope guidance; reconcile it explicitly if this idea is selected. Web Push versus native local
notifications is a platform decision, not settled here; neither guarantees global suppression while offline.

<a id="pi-015"></a>

## PI-015 — Set-rest timer

**Status: Accepted backlog idea; design and implementation unselected.**
Source: owner follow-up, 2026-09-10. Dependent candidate: [PI-016 short-rest hint](#pi-016).
[iOS/PWA evaluation](reviews/ios-beta-distribution-evaluation.md) separates countdown reuse from
locked-screen/offline delivery. A timer can be useful without implementing the hint or notifications.

Foundation: nullable positive `restSeconds` already exists in the
[prescription snapshot](../src/domain/schemas/prescriptionSnapshot.ts), is supplied by the
[Today service](../src/server/today/service.ts), and is frozen into the
[local active session](../src/sync/activeSession.ts). No set-rest countdown or notification scheduler
was found in the current logging flow. Reuse that target; do not introduce a competing prescribed
rest field or invent a target when it is absent. An explicit user override/default needs scoped design.

Proposed behavior to accept or revise before implementation:

- **Start/reset:** offer manual start; a candidate opt-in automatic start is after successful local
  commitment of a work-set log, without waiting for network sync. Reset replaces the current timer
  with the chosen full target; a repeated tap/replayed sync operation must not create a second timer.
  Define whether logging the next set replaces the timer, including retrospective edits/deletions.
  This is a timing convenience, not proof of when the exercise physically ended.
- **Extend/skip/disable:** extending moves the target end time and replaces any scheduled alert;
  skip cancels the current countdown/alert, while disable prevents subsequent automatic starts and
  alerts until re-enabled. Choose extension increments and preference scope in design. Session
  finish/discard must clear obsolete timer state and pending alerts.
- **Warm-up/superset:** proposed bounded default is no automatic warm-up timer, with manual timing
  available. Decide rest between exercises versus after a superset round explicitly; no supported
  grouping semantics were found in the logging flow. Until a grouping design exists, use manual
  timing/disable automatic starts for that workflow, rather than restart a full rest at each component.
  This entry does not authorize a superset schema or prescription-engine expansion.
- **Persistence:** store an absolute target timestamp plus timer/session/exercise identity and chosen
  duration in durable device state. Render remaining time from `target - now` on foreground/resume;
  never rely on a decremented counter surviving background suspension. Define expiry display, clock
  changes, reload/restart, multiple tabs and account/logout boundaries; do not replay an expired alert
  on re-entry. Do not add timer state to training facts or sync payloads without a separate reason.
- **Delivery:** foreground visual countdown is a distinct deliverable. Locked-screen alerts and
  offline alert delivery require separately selected platform scope and on-device evidence. An end
  timestamp restores the display; it does not wake a suspended PWA. Permission denial or a disabled
  notification channel must not prevent timing or logging. If native alerts are selected, schedule,
  replace and cancel by stable timer identity, and reconcile persisted web/native state on resume.

Candidate acceptance: exercise target/override/missing target, every control, warm-up/manual-superset
cases, double taps, reload, background past expiry, session finish/discard and logout are unambiguous.
Display resumes from the saved timestamp; foreground behavior passes independently of any alert tests.
Alert claims require locked-device/offline verification under the supported permission/Focus settings.

[OD-05](architecture/open-decisions.md) currently says ship without a timer and, if later added,
use an elapsed display rather than a countdown. The owner has now accepted evaluating this broader
idea, **not amended that behavior authority or approved its implementation**. Reconcile OD-05 in a
separately scoped design before implementing a countdown; preserve [ADR-005](architecture/adr/ADR-005-pwa-offline.md)'s
offline durability requirements.

<a id="pi-016"></a>

## PI-016 — Optional short-rest hint

**Status: Accepted backlog idea; optional, non-blocking, design-gated and unselected for implementation.**
Source: owner follow-up, 2026-09-10. Depends on [PI-015](#pi-015)'s configured target, timer state and
agreed interaction semantics; PI-015 does not depend on this hint. No dependency on PI-001's separate
entry-error warning or PI-013's advisory load suggestion is implied.

Intent: if enabled, show that the user's own configured rest target has not elapsed at a meaningful
next-set interaction. Candidate wording describes the timer (for example, “Your rest timer has
30 seconds remaining”), not a measured recovery state. Decide the trigger during PI-015 design;
logging a set afterwards must not be treated as evidence of when that set began.

The existing [logSet implementation](../src/sync/activeSession.ts) timestamps the logging action.
Differences between `loggedAt` values **do not prove actual rest duration**: the interval can include
the next set's execution, late entry, editing and other activity. Do not infer physiological rest
or compare such gaps with a universal threshold. Any actual-rest measurement would need a separately
accepted event/interaction model, not a relabeling of historical logging timestamps.

Candidate criteria: compare only with the configured target and a valid timer; no hint for an absent
target, disabled/skipped timer or unresolved warm-up/superset semantics. Let the user dismiss/disable
it, honor extensions/overrides, and avoid repeated nags. Never claim “not optimal,” block set logging,
change progression, modify prescriptions or alter e1RM evidence. Acceptance must include late logging,
manual timing, background/resume, skip/disable and a user continuing immediately without interruption.
Training use should establish whether this adds value beyond the timer's own display before selection.
Platform reference: [pending iOS evaluation](reviews/ios-beta-distribution-evaluation.md).

<a id="pi-018"></a>

## PI-018 — Workout prescription context (prescribed rest + program notes)

**Status: Selected; owner-inserted between [PI-007](#pi-007) Recovery and [PI-009](#pi-009) export, 2026-09-11.**
Architecture [evaluation](reviews/workout-prescription-context-architecture-evaluation.md) and its
[independent review](reviews/workout-prescription-context-architecture-review.md) are accepted
(`APPROVED — READY FOR PI-018 IMPLEMENTATION`, five non-blocking LOW findings). Source: owner
observation during real training — the workout card shows the scheme and RIR band, but the rest
target and the instructions written in the program exercise editor are invisible exactly when they
are needed.

**Accepted scope.** Display this slot's prescribed rest on the workout card's existing prescription
subtitle (`3 × 5 @ RIR 1-2 · Rest 2:30`), and its prescription notes as a labelled, read-only
`Program note:` block, visually and structurally distinct from the editable session notes already on
the card. Both are **frozen per prescription slot at workout start** (ADR-007 snapshot-on-use), so
they survive offline start, reload/resume, sync and cross-device adoption, and a later program edit
cannot change a running workout. Two slots of the same exercise in one template keep their own
instructions.

**Compatibility rules, binding.** `prescriptionNotes` is an **additive optional** key on the existing
`v: 1` `PrescriptionSnapshot` — no migration, no snapshot-version bump, no new top-level sync payload
key, no IndexedDB `DB_VERSION` bump. Existing snapshots are never rewritten and missing instructions
are **never reconstructed** from current program data: a session already in flight across the deploy
correctly shows rest but no note, and that asymmetry is the rule working, not a defect.

**Explicit exclusions.** No rest timer, countdown or auto-start; no notifications or locked-screen
alerts; no short-rest warning; no progression, prefill or recommendation change; no app-wide
redesign; no History presentation; no editing prescription notes from inside the workout; no backfill.

**Relationship to [PI-015](#pi-015)/[PI-016](#pi-016).** This displays PI-015's existing nullable
`restSeconds` target and introduces **no competing prescribed rest field**, which is PI-015's own
stated requirement. It does not select PI-015, does not amend or discharge [OD-05](architecture/open-decisions.md),
and adds nothing PI-016 depends on. PI-015 and PI-016 remain unselected and design-gated.

**Owner awareness before deploy (not a decision to make).** Every prescription note that already
exists in the program becomes visible during execution on the next workout started after deploy;
there is no per-note opt-out in this design. Any note written as private planning text rather than an
execution cue should be edited or cleared in the program editor beforehand.

Duplicate-slot support here is a property of the existing model (`exercise_prescriptions` is unique
on `(template_id, position)` only) and is not a [PI-012](#pi-012) Set Groups deliverable; PI-012's
scope, architecture and scheduling are unchanged by this entry.

## Deferred direction and operating rule

Multiuser/Easy Auth implementation is deferred by the owner. The [pilot analysis](reviews/post-p10-roadmap-evaluation.md)
remains reference material, not an active implementation queue. Other athletic/dashboard ideas
not selected in PI-011 stay demand-driven. Existing architecture decision gates remain in their
own authority; do not copy every historical memory note into a newly approved feature.

Add new observations and item dispositions here. Change owner-selected order in ROADMAP and
current delivery/gates in STATUS; link evidence rather than duplicate it. Retain IDs and record
why an item was completed, narrowed, deferred or superseded.
