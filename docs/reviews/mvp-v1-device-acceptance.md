# Gym App MVP v1 — Device Acceptance

Date: 2026-09-01

Tester: product owner, on a real iPhone using the installed Home Screen PWA

Tested application revision: `0caa05966ad91cc32a9b1a1f4914796da07de429`

## Scope and evidence

This report records the product owner's manual device acceptance after the complete Phases 0–8
implementation, independent MVP release-candidate review, remediation, and targeted verification.
The device model and iOS version were not recorded; no values are inferred here.

The product owner confirmed that every item in the agreed iPhone checklist behaved as expected:

- installed standalone launch from the Home Screen, with correct PWA presentation, safe areas,
  navigation, and no horizontal page overflow;
- Today, Bodyweight, and Recovery mobile flows, including correct day attribution;
- creation and use of the real planning/program flow on the phone;
- a real workout logged successfully end-to-end;
- cold launch in airplane mode from the cached application shell;
- offline set logging and mutation, background/foreground handling, force-kill, relaunch, and exact
  workout resume;
- reconnect and server convergence without duplicate history rows, false Sync Issues, or lost edits
  and deletions;
- offline Bodyweight/Recovery logging and later synchronization;
- storage-persistence status behavior;
- service-worker update availability without an automatic mid-workout reload, followed by explicit
  user-triggered activation;
- no problematic iOS focus zoom observed on the exercised form controls.

No defect was reported during the real workout or the explicit offline/PWA acceptance scenarios.

## Supporting technical gates

- `docs/reviews/mvp-v1-independent-review.md`
- `docs/reviews/mvp-v1-remediation.md`
- `docs/reviews/mvp-v1-remediation-verification.md`
- `docs/reviews/mvp-v1-remediation-verification-2.md`

The final independent verification verdict was **VERIFIED — READY FOR DEVICE ACCEPTANCE**. This
manual pass closes that remaining gate.

## Verdict

**DEVICE ACCEPTED — READY FOR `v1.0.0`**
