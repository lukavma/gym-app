# Status

Updated: 2026-09-10. Owner direction: continue the personal app; multiuser/Easy Auth implementation deferred.
This file owns current delivery state/gates; [ROADMAP](ROADMAP.md) owns priorities and [BACKLOG](BACKLOG.md) owns item detail.
Evidence: catalog reports observed at `56ec000` through 2026-09-10 09:38 UTC; final git-only observation at 09:43 UTC shows concurrent catalog commit `57868e2`. Catalog commit `57868e2` deployed (workflow run `34462148858`, succeeded on retry after an unrelated flaky offline test) and its D-CE1-1(ii) postdeployment Tibialis check passed — see [closeout](reviews/exercise-catalog-expansion-closeout.md).
Report statements below are attributed evidence, not a certification of Sonnet's changing task or current production.

## Delivered foundations

| Area | Completion and evidence boundary |
| --- | --- |
| Set Groups (independent + linked back-off) / PI-012 | **Committed and deployed, 2026-09-13; iPhone acceptance outstanding.** Stage A + Stage B, one joint release, commit `9ff7253` ([deploy run](https://github.com/lukavma/gym-app/actions/runs/34776227341), migration `0014` applied to production). Independently reviewed and remediated across four passes (F-1…F-9, V-1…V-3, W-1…W-3), ending [VERIFIED — READY FOR SET GROUPS A+B RELEASE CLOSEOUT](reviews/set-groups-supersession-verification.md); see [release closeout](reviews/set-groups-release-closeout.md) for exact scope, validation and open limitations. No production account was created or workout logged by this deployment — device acceptance has no substitute and is not claimed here. |
| Core MVP / Phases 0–8 | Owner device acceptance at `0caa059`, including real training and offline convergence: [acceptance](reviews/mvp-v1-device-acceptance.md). |
| Warm-up routines / set classification | Routines committed and independently [verified](reviews/warmup-routines-remediation-verification-2.md); classification has explicit [owner device acceptance](reviews/warmup-set-classification-device-acceptance.md). Separate routines device receipt not found in the consolidation evidence. |
| e1RM Release A | Tracker/what-if implemented at `1282795`; [verification](reviews/estimated-1rm-release-a-remediation-verification.md) reaches device-acceptance readiness. Separate deployment/device receipt and a full block of tracker use are not established here. |
| Metrics v1 / Phase 9a | Implemented at `05982f6`, recorded as shipped in repository documentation; [verification](reviews/metrics-dashboard-remediation-verification-2.md), plus [PI-007](BACKLOG.md#pi-007)'s observation during owner device acceptance. Full acceptance receipt not found here. |
| Athletic Measurement Profiles R1–R3 / PI-005 | **Owner-confirmed complete**; commits `1c5a782`, `4865a02`, `56ec000`. Independent [R1](reviews/athletic-measurement-profiles-release-1-remediation-verification.md), [R2](reviews/athletic-measurement-profiles-release-2-remediation-verification.md), [R3](reviews/athletic-measurement-profiles-release-3-review.md) evidence exists. Separate deployment/device receipts are not independently established by this consolidation; do not reopen the completed foundation. |

## Active gates

- **Catalog Expansion 1 release closeout — Sonnet owns it.** [Implementation review](reviews/exercise-catalog-expansion-implementation-review.md): `VERIFIED — READY FOR CATALOG EXPANSION DEPLOYMENT`, four non-blocking Low findings. This is implementation verification, distinct from the earlier specification review.
- **Preflight, report evidence only:** [predeployment check](reviews/exercise-catalog-expansion-predeployment-check.md) now reports `NAME-COLLISION GATE PASSED` for all 24 names, F-1 resolved, F-2/F-3 report corrections, F-4 deferred. It explicitly records no commit, push or deployment.
- **Closeout evidenced:** [closeout report](reviews/exercise-catalog-expansion-closeout.md) records commit `57868e2` deployed to production (workflow run `34462148858`) and the D-CE1-1(ii) postdeployment Tibialis contribution check passed (exactly one `tibialis` primary contribution at weight 1.0, no `calves`). **Owner iPhone device acceptance confirmed on 2026-09-10:** the app looks good, and "Tibialis (Shin)" was selectable for Tibialis Raise after session revocation and re-login.
- **Client coverage:** the visible picker option confirms D-CE1-1(i)'s update check for the tested iPhone. Other used clients have not been enumerated or confirmed; session revocation alone is not update evidence. The owner confirmation does not attest an exhaustive §16.8 checklist run.
- **Documentation consolidation approved (2026-09-10):** [independent review](reviews/post-p10-documentation-ios-review.md) approved closeout; bounded corrections and BACKLOG preservation commit `355e381` are recorded in the [report](reviews/post-p10-documentation-consolidation.md#approved-documentation-closeout). This closes the documentation review gate, without certifying catalog closeout or bypassing roadmap step 1.
- **iOS recommendation pending owner selection:** [evaluation](reviews/ios-beta-distribution-evaluation.md) passed documentation review. Platform/prototype/distribution and PI-014…PI-016 priority/implementation choices remain unselected; the accepted six-step order is unchanged.

## Selected next work

Documentation review is approved; after the remaining catalog closeout gate: **[PI-007 Recovery improvement](BACKLOG.md#pi-007)**.
Then **[PI-009 account data export](BACKLOG.md#pi-009)** → **[PI-010 backup/recovery verification](BACKLOG.md#pi-010)** → **[PI-011 Dashboard v2 scope, then implementation](BACKLOG.md#pi-011)**.
Real training runs alongside the selected sequence; [e1RM Release B](BACKLOG.md#pi-013) retains its full-block usage and design/prototype gates.
These are priorities, not implementation or production authorization; [ROADMAP](ROADMAP.md) records the accepted order.

## Pending operational evidence

- Catalog: released revision (`57868e2`), the specified postdeployment contribution check, and **owner-confirmed iPhone acceptance with the Tibialis picker observation** are recorded in the [closeout report](reviews/exercise-catalog-expansion-closeout.md). D-CE1-1(i) coverage of any other used clients remains unrecorded.
- Account export, actual backup posture and demonstrated recovery are selected but not evidenced as delivered. Export and restore verification have separate acceptance. “Post-P10” is not Phase 10 completion evidence.
- Catalog preflight reports local leftover cleanup; no resource/process/database inventory was independently inspected here. Do not act on historical cleanup lists.
- Update missing older release receipts if available; distinguish owner completion, independent review and deployed revision rather than rerunning completed feature reviews.

One designated closeout editor maintains this index from evidence and owner decisions. Keep independent reports unchanged and link newer records; see the [consolidation report](reviews/post-p10-documentation-consolidation.md) for the observation boundary and conventions.
