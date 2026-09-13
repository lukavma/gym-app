# Roadmap

Owner-selected direction and order: 2026-09-10, recorded in the [consolidation report](reviews/post-p10-documentation-consolidation.md).
Continue the personal training app. Multiuser/Easy Auth implementation is deferred.
[STATUS](STATUS.md) owns actual delivery/gates; [BACKLOG](BACKLOG.md) is the only editable item-detail authority.
This file owns priorities and dependencies, not detailed specifications or implementation authorization.

## Selected order

| Order | Priority | Outcome and dependency |
| --- | --- | --- |
| 1 — Closed | Catalog Expansion 1 closeout | Closed per [STATUS](STATUS.md): commit `57868e2` deployed, the D-CE1-1(ii) postdeployment check passed, and owner iPhone acceptance confirmed 2026-09-10. Retained here for order continuity; D-CE1-1(i) coverage of clients other than the tested iPhone remains unrecorded. |
| 2 — Closed | Documentation consolidation | Closed per [STATUS](STATUS.md): the [independent review](reviews/post-p10-documentation-ios-review.md) approved closeout 2026-09-10, and BACKLOG preservation landed as `355e381`. STATUS, ROADMAP and BACKLOG now exist and are the standing authorities. |
| 3 — In flight | [PI-007 Recovery improvement](BACKLOG.md#pi-007) | Recovery check-in completeness and scale clarity within the existing model. Implemented and committed (`c2d98c8`, then the device-remediation follow-up `cb33264`). Deployment and owner device acceptance are separate gates and are not asserted here. |
| 4 — Next | [PI-018 workout prescription context](BACKLOG.md#pi-018) | Owner-inserted between Recovery and export, 2026-09-11: show the prescribed rest and the program's prescription notes on the workout card, frozen per slot at start. Bounded read-path slice; no timer, no progression change. Depends on nothing above it; carries no competing prescribed-rest field ([PI-015](BACKLOG.md#pi-015)'s own rule). |
| 5 — Next | [PI-009 account data export](BACKLOG.md#pi-009) | Selected user-accessible product feature after Recovery. Settle bounded coverage/format/flow and acceptance before implementation; an operator backup is not this deliverable. |
| 6 — Queued, selected | [PI-010 backup/recovery verification](BACKLOG.md#pi-010) | Separate engineering task after export: establish actual backup posture and demonstrate recovery. Define access and safe verification scope before executing any operational work. |
| 7 — Queued, selected | [PI-011 Dashboard v2](BACKLOG.md#pi-011) | Scope/design first, then implementation against accepted scope, after backup/recovery verification. V2 is explicitly on the roadmap; no chart, metric or redesign bundle is preselected here. |

This order expresses owner priorities. It does not assert technical dependencies where none have
been established, and it authorizes no implementation or release by itself. Applicable review/design
gates still govern starting dependent work, and rows 1–2 are recorded as closed from
[STATUS](STATUS.md)'s evidence rather than re-certified here.

## Real use and deferred choices

Real training runs **alongside** the selected tasks. Record concrete friction and data-quality
observations in BACKLOG; do not impose the earlier evaluation's blanket feature pause or require a
full training block before the selected export/Recovery/dashboard work. Change priorities explicitly
if a material real-use defect appears.

- [PI-013 e1RM Release B](BACKLOG.md#pi-013) retains its existing **at least one block of Release A use**,
  binding fire-rate prototype and applicable design/owner-decision gates. Profiles being delivered
  does not discharge them. It is not added to the selected implementation sequence.
- [PI-001](BACKLOG.md#pi-001) entry-error warnings, [PI-002](BACKLOG.md#pi-002) training-date correction
  and [PI-006](BACKLOG.md#pi-006) History deletion remain demand-driven with their respective
  calibration/design/dependency gates.
- [PI-004 navigation](BACKLOG.md#pi-004) belongs within [PI-008 UI polish](BACKLOG.md#pi-008);
  retain the iPhone prototype gate and reconcile any overlap when Dashboard v2 is scoped.
- [PI-003](BACKLOG.md#pi-003)'s routine foundation is delivered; automatic composition/seeded content
  remains deferred with its research gate. [PI-005](BACKLOG.md#pi-005)'s profile foundation is complete;
  further athletic features/catalog expansion need real demand.
- [PI-012 Set Groups](BACKLOG.md#pi-012): architecture verified and D-1…D-6 accepted on 2026-09-12
  ([owner addendum](reviews/set-groups-architecture-evaluation.md#19-owner-decisions--accepted-2026-09-12)).
  Build and verify A (groups), then B (performed-only percentage links), for a joint release.
  This settles feature scope and internal sequencing; it does not claim delivery or reprioritize export.
- Multiuser/Easy Auth stays deferred; the [pilot analysis](reviews/post-p10-roadmap-evaluation.md)
  remains reference material. No orchestration platform, new skills or automation framework is selected.

## Additional candidates and pending iOS evaluation

Accepted backlog ideas: [PI-014 daily check-in reminder](BACKLOG.md#pi-014),
[PI-015 set-rest timer](BACKLOG.md#pi-015) and its dependent [PI-016 short-rest hint](BACKLOG.md#pi-016).
Their scope, implementation and placement are unselected; they do not replace or insert work into
the order above. Recovery's check-in semantics inform PI-014; the timer can stand without a hint.
[PI-018](BACKLOG.md#pi-018) **displays** the `restSeconds` target PI-015 would count down and adds no
competing field, so it neither selects PI-015 nor discharges its OD-05 reconciliation or platform gates.
The [iOS beta distribution evaluation](reviews/ios-beta-distribution-evaluation.md) passed
[documentation review](reviews/post-p10-documentation-ios-review.md); its recommendation remains
pending owner selection. It recommends retaining the PWA now and considering a bounded owner-only native prototype
later if locked-screen/offline alerts justify it. This recommendation is a proposal, not selection
of a platform, TestFlight distribution or reprioritization. Multiuser remains deferred.

## Authority and delivery convention

This accepted owner sequence supersedes the optional-Recovery/use-pause/deferred-dashboard
recommendations of the [roadmap evaluation](reviews/post-p10-roadmap-evaluation.md), which remains
unchanged historical analysis. It does not supersede accepted domain/architecture invariants.

For each selected implementation: agree bounded scope → implement → independent review → necessary
remediation/targeted verification → separately authorized release → applicable owner/device acceptance.
Do not turn non-blocking historical notes into an unbounded feature or remediation chain.
After closeout, update STATUS from the evidence and the relevant BACKLOG disposition; update this
file only when the owner changes priorities/dependencies. No generated workflow machinery is required.
