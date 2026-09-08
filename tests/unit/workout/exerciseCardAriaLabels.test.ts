// docs/reviews/athletic-measurement-profiles-architecture-evaluation.md
// §15.3 — "every input gains an aria-label ... the visible short unit label
// stays." Proves both halves per profile: the aria-label is present on
// every field §6.2 permits for that profile, and ABSENT for every field it
// forbids (so a stray input that should have been excluded by the
// column-order filter doesn't silently keep rendering without the guard
// this file checks for).
//
// No JSX/`.tsx` here on purpose, matching uiFormatWiring.test.ts's
// established convention: `vitest.config.ts` only picks up
// `tests/unit/**/*.test.ts`, and `React.createElement` renders identically
// through `react-dom/server`'s `renderToStaticMarkup`.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { ExerciseCard } from "@/ui/workout/ExerciseCard";
import {
  dimensionsOf,
  MEASUREMENT_PROFILES,
  type MeasurementProfile,
  type ProfileDimensions,
} from "@/domain/measurement/profile";
import type { ActiveSessionExerciseDto } from "@/sync/types";

const ARIA_LABEL_BY_DIMENSION: Record<keyof ProfileDimensions, string> = {
  weight: "Weight in kilograms",
  reps: "Repetitions",
  rir: "Reps in reserve",
  distance: "Distance in metres",
  duration: "Time in seconds",
};

const VISIBLE_UNIT_LABEL_BY_DIMENSION: Record<keyof ProfileDimensions, string> = {
  weight: ">kg<",
  reps: ">reps<",
  rir: ">RIR<",
  distance: ">m<",
  duration: ">s<",
};

const ROUND_NOUN_PROFILES: ReadonlySet<MeasurementProfile> = new Set([
  "load_distance",
  "distance_time",
  "duration",
  "load_duration",
]);

function exerciseFixture(profile: MeasurementProfile): ActiveSessionExerciseDto {
  const hasLoad = dimensionsOf(profile).weight !== "forbidden";
  return {
    id: newId(),
    exerciseId: newId(),
    exerciseName: "Fixture Exercise",
    position: 0,
    source: "template",
    prescription: null,
    skipped: false,
    notes: null,
    loadStepKg: null,
    recommendation: null,
    measurement: { profile, loadBasis: hasLoad ? "total" : null },
    sets: [],
  };
}

describe("ExerciseCard — §15.3 aria-labels per profile", () => {
  for (const profile of MEASUREMENT_PROFILES) {
    const dims = dimensionsOf(profile);

    it(`renders exactly the aria-labels ${profile}'s dimensions permit, alongside the existing visible unit label`, () => {
      const html = renderToStaticMarkup(
        createElement(ExerciseCard, { exercise: exerciseFixture(profile), isDeload: false }),
      );

      for (const key of Object.keys(ARIA_LABEL_BY_DIMENSION) as (keyof ProfileDimensions)[]) {
        const expectPresent = dims[key] !== "forbidden";
        const ariaLabel = ARIA_LABEL_BY_DIMENSION[key];
        expect(
          html.includes(`aria-label="${ariaLabel}"`),
          `${profile}.${key}: expected aria-label "${ariaLabel}" present=${expectPresent}`,
        ).toBe(expectPresent);

        // §15.3 — the aria-label is "in addition to, not instead of, the
        // existing visible short unit label": whenever the field itself is
        // rendered, its plain-text unit span must still be there too.
        if (expectPresent) {
          expect(
            html.includes(VISIBLE_UNIT_LABEL_BY_DIMENSION[key]),
            `${profile}.${key}: expected the visible unit label to survive alongside the aria-label`,
          ).toBe(true);
        }
      }
    });

    it(`renders the "${ROUND_NOUN_PROFILES.has(profile) ? "Round" : "Set"}" noun for ${profile}'s warm-up toggle`, () => {
      const html = renderToStaticMarkup(
        createElement(ExerciseCard, { exercise: exerciseFixture(profile), isDeload: false }),
      );
      const expectedNoun = ROUND_NOUN_PROFILES.has(profile) ? "Round" : "Set";
      expect(html).toContain(`Warm-up ${expectedNoun.toLowerCase()}`);
    });
  }

  it("renders the Strength estimate link only for the structurally eligible profile (load_reps, non-assistance basis)", () => {
    for (const profile of MEASUREMENT_PROFILES) {
      const html = renderToStaticMarkup(
        createElement(ExerciseCard, { exercise: exerciseFixture(profile), isDeload: false }),
      );
      expect(html.includes("Strength estimate"), profile).toBe(profile === "load_reps");
    }
  });
});
