# Warm-up Set Classification — Physical Device Acceptance

Date: 2026-09-05
Subject: the warm-up set classification feature as shipped in `d9b9760` (`feat: add warm-up set classification`).
Performed by: the repository owner, on a physical iPhone, against the real application.
Recorded by: Claude, from the owner's report. **The checks below were not observed or measured by the recorder** — this document is the owner's acceptance, written down, not an independent verification. The three independent verifications are separate documents (see §4).

---

## 1. Verdict

# `DEVICE ACCEPTED`

The on-device pass covered the seven checks listed in §2 and the feature was accepted on all of them.

This closes the one item left open by every prior round of verification: no physical-device pass had been run. All automated coverage to date ran on Chromium — including at a 390×844 viewport — which models phone layout but not real hardware behaviour, and specifically not how a backgrounded iOS PWA resumes.

---

## 2. Checks performed

Each row records a check the owner actually carried out on the device. No result detail beyond acceptance was reported, and none is invented here.

| # | Check | Behaviour it exercises |
| --- | --- | --- |
| 1 | **Warm-up and work-set logging** | The "Warm-up set" checkbox on the set-entry form sets `set_logs.is_warmup`; leaving it untouched logs an ordinary work set |
| 2 | **`W ·` markers** | Logged warm-up sets render with the `W · ` prefix in the workout screen's set list; work sets render without it |
| 3 | **App reload / reopen continuity** | The toggle survives a remount — the V-1 fix, where the default derives from the last logged set's own `isWarmup` rather than resetting to off |
| 4 | **Per-exercise isolation** | The toggle state of one exercise does not leak into another; each `ExerciseCard` is keyed by exercise and carries its own state |
| 5 | **In-session reclassification** | `SetRow`'s own edit form flips `isWarmup` on an already-logged set during the workout — the V-2 fix, without needing to complete the session first |
| 6 | **Field preservation** | Reclassifying a set leaves its weight, reps and RIR unchanged |
| 7 | **History editing** | The History screen's set editor exposes the stored classification and can change it after the session is complete |

Checks 3 and 5 are the ones that most needed real hardware: both concern behaviour (PWA resume, in-place editing on a touch target) that desktop Chromium emulation approximates rather than reproduces.

---

## 3. Device and OS details

**Not recorded.** The specific iPhone model, iOS version, browser or PWA installation mode were not captured at the time of the pass, and are deliberately left blank rather than guessed. If a future regression needs to be tied to a particular OS build, this pass cannot supply that.

---

## 4. What this closes

The recommendation to run an on-device pass appears in four documents; this acceptance discharges it in all of them:

- `estimated-1rm-load-translation-architecture-review.md` §9 — the original F-1 finding, whose coverage list ends with the UI affordances this pass exercised.
- `warmup-set-classification-remediation.md` §9 — "Unexecuted physical-device checks", which recorded that Chromium at 390×844 confirms layout and visibility but not real-hardware behaviour.
- `warmup-set-classification-remediation-verification.md` §10 and `-verification-2.md` §9 — both left the device pass as the single outstanding item.
- `warmup-set-classification-remediation-verification-3.md` §6 — the closure, which named the device pass as "the highest-value remaining check before this ships", specifically because the V-1 fix concerns relaunch behaviour.

With this acceptance, no item from the F-1 remediation or its three verification rounds remains open.

---

## 5. Not covered by this pass

Recorded so the boundary of this acceptance is explicit, not as findings:

- **VoiceOver / accessibility behaviour** of the two new checkboxes was not part of this pass.
- **Tap-target ergonomics** were not measured or reported beyond the checks in §2 succeeding.
- **Offline and sync behaviour on the device** (logging or reclassifying while disconnected, then reconnecting) was not part of this pass. That path is covered by the automated offline suite on Chromium.
- **Browsers other than the one used** were not exercised; the repository's Playwright configuration is Chromium-only by existing convention.

None of these was reported as failing — they were simply outside what was checked.

---

`DEVICE ACCEPTED` — seven checks performed on a physical iPhone; device and OS details not recorded; no open items remain.
