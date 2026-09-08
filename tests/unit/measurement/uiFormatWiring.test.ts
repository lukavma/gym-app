// Athletic Measurement Profiles Release 2 —
// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §15.4: "One shared pure formatter `formatSetLine(profile, loadBasis, set)`
// ... replaces the inline templates (`ExerciseCard.tsx:423-429`,
// `HistoryDetail.tsx:255-261`, bundle-rendered previous sets)."
//
// This proves the two call sites that still exist as inline templates in
// the working tree now render through `formatSetLine` instead — for a
// non-`load_reps` profile, so a lingering `{weightKg} kg × {reps}` template
// would either throw (weightKg is null here) or render "null kg × null"
// rather than the shared formatter's line, making a regression obvious.
//
// No JSX/`.tsx` here on purpose: `vitest.config.ts` only picks up
// `tests/unit/**/*.test.ts`, and `React.createElement` renders identically
// through `react-dom/server`'s `renderToStaticMarkup` — no test-runner
// config change needed for this one file.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { formatSetLine } from "@/domain/measurement/format";
import { ExerciseCard } from "@/ui/workout/ExerciseCard";
import { HistorySetRow } from "@/ui/history/HistoryDetail";
import type { ActiveSessionExerciseDto, ActiveSessionSetDto } from "@/sync/types";
import type { HistorySetDetail } from "@/ui/history/types";

// `distance_time` (a sprint): no load field at all, so `weightKg` is null —
// the surest possible tell that a `{set.weightKg} kg × {set.reps}` inline
// template regressed back in, since that would render "null kg × null"
// where `formatSetLine` renders "40 m · 5.62 s".
function distanceTimeSet(): ActiveSessionSetDto {
  return {
    id: newId(),
    setNumber: 1,
    isWarmup: false,
    weightKg: null,
    reps: null,
    rir: null,
    distanceM: 40,
    durationS: 5.62,
    loggedAt: new Date(0).toISOString(),
    notes: null,
  };
}

function distanceTimeExercise(set: ActiveSessionSetDto): ActiveSessionExerciseDto {
  return {
    id: newId(),
    exerciseId: newId(),
    exerciseName: "Sprint 40m",
    position: 0,
    source: "template",
    prescription: null,
    skipped: false,
    notes: null,
    loadStepKg: null,
    recommendation: null,
    measurement: { profile: "distance_time", loadBasis: null },
    sets: [set],
  };
}

describe("Release 2 UI wiring — the shared formatter, not an inline template", () => {
  it("ExerciseCard's logged-set row (SetRow) renders formatSetLine's output for a non-load_reps profile", () => {
    const set = distanceTimeSet();
    const exercise = distanceTimeExercise(set);
    const expected = formatSetLine("distance_time", null, set);

    const html = renderToStaticMarkup(createElement(ExerciseCard, { exercise, isDeload: false }));

    expect(html).toContain(expected);
    // The old inline template (`{set.weightKg} kg × {set.reps}`) would
    // print this on a load-less profile — its absence is the regression
    // guard, not just the presence of the new line.
    expect(html).not.toMatch(/null\s*kg/);
  });

  it("HistoryDetail's read-mode HistorySetRow renders formatSetLine's output for a non-load_reps profile", () => {
    const set: HistorySetDetail = {
      id: newId(),
      setNumber: 1,
      isWarmup: false,
      weightKg: null,
      reps: null,
      rir: null,
      distanceM: 40,
      durationS: 5.62,
      loggedAt: new Date(0).toISOString(),
      notes: null,
    };
    const expected = formatSetLine("distance_time", null, set);

    const html = renderToStaticMarkup(
      createElement(HistorySetRow, {
        set,
        profile: "distance_time",
        loadBasis: null,
        onSave: () => {},
        onDelete: () => {},
      }),
    );

    expect(html).toContain(expected);
    expect(html).not.toMatch(/null\s*kg/);
  });

  it("a duration ≥ 60s renders its additional m:ss form (O-8) through the same call sites", () => {
    const set = distanceTimeSet();
    set.distanceM = null;
    set.durationS = 90;
    const exercise = distanceTimeExercise(set);
    exercise.measurement = { profile: "duration", loadBasis: null };
    const expected = formatSetLine("duration", null, set);

    const html = renderToStaticMarkup(createElement(ExerciseCard, { exercise, isDeload: false }));

    expect(expected).toContain("1:30");
    expect(html).toContain(expected);
  });
});
