# Roadmap

Owner-selected direction and order: 2026-09-10, recorded in the [consolidation report](reviews/post-p10-documentation-consolidation.md).
Continue the personal training app. Multiuser/Easy Auth implementation is deferred.
[STATUS](STATUS.md) owns actual delivery/gates; [BACKLOG](BACKLOG.md) is the only editable item-detail authority.
This file owns priorities and dependencies, not detailed specifications or implementation authorization.

## Selected order

| Order | Priority | Outcome and dependency |
| --- | --- | --- |
| 1 — Now | Catalog Expansion 1 closeout | Consume the existing implementation review and Sonnet's preflight/report corrections; close the separately authorized release, per-client update, postdeployment and device gates. [STATUS](STATUS.md) records observed evidence; no duplicate implementation review. |
| 2 — Now | Documentation consolidation | Establish STATUS, ROADMAP and BACKLOG, preserve current PI inputs and historical reports, and review this documentation change. Local preparation overlaps Sonnet's task by owner instruction; it does not certify step 1 complete. |
| 3 — Next | [PI-007 Recovery improvement](BACKLOG.md#pi-007) | The next small product slice after catalog closeout/documentation: ordinary recovery check-in completeness and scale clarity within the existing model. |
| 4 — Next | [PI-009 account data export](BACKLOG.md#pi-009) | Selected user-accessible product feature after Recovery. Settle bounded coverage/format/flow and acceptance before implementation; an operator backup is not this deliverable. |
| 5 — Queued, selected | [PI-010 backup/recovery verification](BACKLOG.md#pi-010) | Separate engineering task after export: establish actual backup posture and demonstrate recovery. Define access and safe verification scope before executing any operational work. |
| 6 — Queued, selected | [PI-011 Dashboard v2](BACKLOG.md#pi-011) | Scope/design first, then implementation against accepted scope, after backup/recovery verification. V2 is explicitly on the roadmap; no chart, metric or redesign bundle is preselected here. |

This order expresses owner priorities. It does not assert technical dependencies where none have
been established, or authorize all six implementations in this documentation task. Catalog release
closure and applicable review/design gates still govern starting dependent work.
The current catalog preflight may advance independently; final release closeout remains Sonnet's task.

## Real use and deferred choices

Real training runs **alongside** the selected tasks. Record concrete friction and data-quality
observations in BACKLOG; do not impose the earlier evaluation's blanket feature pause or require a
full training block before the selected export/Recovery/dashboard work. Change priorities explicitly
if a material real-use defect appears.

- [PI-013 e1RM Release B](BACKLOG.md#pi-013) retains its existing **at least one block of Release A use**,
  binding fire-rate prototype and applicable design/owner-decision gates. Profiles being delivered
  does not discharge them. It is not added to the six-step implementation sequence.
- [PI-001](BACKLOG.md#pi-001) entry-error warnings, [PI-002](BACKLOG.md#pi-002) training-date correction
  and [PI-006](BACKLOG.md#pi-006) History deletion remain demand-driven with their respective
  calibration/design/dependency gates.
- [PI-004 navigation](BACKLOG.md#pi-004) belongs within [PI-008 UI polish](BACKLOG.md#pi-008);
  retain the iPhone prototype gate and reconcile any overlap when Dashboard v2 is scoped.
- [PI-003](BACKLOG.md#pi-003)'s routine foundation is delivered; automatic composition/seeded content
  remains deferred with its research gate. [PI-005](BACKLOG.md#pi-005)'s profile foundation is complete;
  further athletic features/catalog expansion need real demand.
- [PI-012 linked top-set/back-off](BACKLOG.md#pi-012) is recorded for later scoped evaluation,
  not selected implementation. No automatic progression behavior is authorized.
- Multiuser/Easy Auth stays deferred; the [pilot analysis](reviews/post-p10-roadmap-evaluation.md)
  remains reference material. No orchestration platform, new skills or automation framework is selected.

## Additional candidates and pending iOS evaluation

Accepted backlog ideas: [PI-014 daily check-in reminder](BACKLOG.md#pi-014),
[PI-015 set-rest timer](BACKLOG.md#pi-015) and its dependent [PI-016 short-rest hint](BACKLOG.md#pi-016).
Their scope, implementation and placement are unselected; they do not replace or insert work into
the six-step order above. Recovery's check-in semantics inform PI-014; the timer can stand without a hint.
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
