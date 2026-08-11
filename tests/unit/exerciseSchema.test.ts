import { describe, expect, it } from "vitest";
import {
  archiveActionSchema,
  createExerciseSchema,
  DEFAULT_CONTRIBUTION_WEIGHT,
  DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT,
  updateExerciseSchema,
} from "@/domain/exercises/schema";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Back Squat",
    equipment: "barbell",
    mechanics: "compound",
    contributions: [{ muscleGroupId: "quads", role: "primary" }],
    ...overrides,
  };
}

describe("createExerciseSchema", () => {
  it("accepts a minimal valid input and fills in defaults", () => {
    const result = createExerciseSchema.parse(baseInput());
    expect(result.laterality).toBe("bilateral");
    expect(result.loadStepKg).toBe(DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT.barbell);
    expect(result.contributions).toEqual([
      { muscleGroupId: "quads", role: "primary", weight: DEFAULT_CONTRIBUTION_WEIGHT.primary },
    ]);
  });

  it("applies the default secondary weight when omitted", () => {
    const result = createExerciseSchema.parse(
      baseInput({
        contributions: [
          { muscleGroupId: "quads", role: "primary" },
          { muscleGroupId: "glutes", role: "secondary" },
        ],
      }),
    );
    expect(result.contributions[1]).toEqual({
      muscleGroupId: "glutes",
      role: "secondary",
      weight: DEFAULT_CONTRIBUTION_WEIGHT.secondary,
    });
  });

  it("preserves an explicit weight instead of the role default", () => {
    const result = createExerciseSchema.parse(
      baseInput({ contributions: [{ muscleGroupId: "quads", role: "primary", weight: 0.75 }] }),
    );
    expect(result.contributions[0]?.weight).toBe(0.75);
  });

  it("derives loadStepKg from equipment when omitted", () => {
    const result = createExerciseSchema.parse(baseInput({ equipment: "machine" }));
    expect(result.loadStepKg).toBe(DEFAULT_LOAD_STEP_KG_BY_EQUIPMENT.machine);
  });

  it("keeps an explicit loadStepKg instead of the equipment default", () => {
    const result = createExerciseSchema.parse(baseInput({ loadStepKg: 1.25 }));
    expect(result.loadStepKg).toBe(1.25);
  });

  it("rejects a contribution list with no primary", () => {
    const result = createExerciseSchema.safeParse(
      baseInput({ contributions: [{ muscleGroupId: "quads", role: "secondary" }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an empty contribution list", () => {
    const result = createExerciseSchema.safeParse(baseInput({ contributions: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate muscle group across contributions", () => {
    const result = createExerciseSchema.safeParse(
      baseInput({
        contributions: [
          { muscleGroupId: "quads", role: "primary" },
          { muscleGroupId: "quads", role: "secondary" },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a contribution weight of 0", () => {
    const result = createExerciseSchema.safeParse(
      baseInput({ contributions: [{ muscleGroupId: "quads", role: "primary", weight: 0 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a contribution weight above 1", () => {
    const result = createExerciseSchema.safeParse(
      baseInput({ contributions: [{ muscleGroupId: "quads", role: "primary", weight: 1.01 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unknown muscle group slug", () => {
    const result = createExerciseSchema.safeParse(
      baseInput({ contributions: [{ muscleGroupId: "biceps femoris", role: "primary" }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive loadStepKg", () => {
    const result = createExerciseSchema.safeParse(baseInput({ loadStepKg: 0 }));
    expect(result.success).toBe(false);
  });

  it("rejects a loadStepKg above the 1000 ceiling", () => {
    const result = createExerciseSchema.safeParse(baseInput({ loadStepKg: 1001 }));
    expect(result.success).toBe(false);
  });

  it("rejects an unknown equipment value", () => {
    const result = createExerciseSchema.safeParse(baseInput({ equipment: "resistance-band" }));
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = createExerciseSchema.safeParse(baseInput({ name: "  " }));
    expect(result.success).toBe(false);
  });
});

describe("updateExerciseSchema", () => {
  it("accepts a partial patch with just a name change", () => {
    const result = updateExerciseSchema.parse({ name: "Front Squat" });
    expect(result).toEqual({ name: "Front Squat" });
  });

  it("accepts an empty patch", () => {
    expect(updateExerciseSchema.parse({})).toEqual({});
  });

  it("resolves default weights when contributions are replaced", () => {
    const result = updateExerciseSchema.parse({
      contributions: [{ muscleGroupId: "chest", role: "primary" }],
    });
    expect(result.contributions).toEqual([
      { muscleGroupId: "chest", role: "primary", weight: DEFAULT_CONTRIBUTION_WEIGHT.primary },
    ]);
  });

  it("rejects a replacement contribution list with no primary", () => {
    const result = updateExerciseSchema.safeParse({
      contributions: [{ muscleGroupId: "chest", role: "secondary" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    const result = updateExerciseSchema.safeParse({ baselineLoadKg: 100 });
    expect(result.success).toBe(false);
  });

  it("allows clearing nullable fields explicitly", () => {
    const result = updateExerciseSchema.parse({ notes: null, movementPattern: null });
    expect(result).toEqual({ notes: null, movementPattern: null });
  });
});

describe("archiveActionSchema", () => {
  it("accepts archive and unarchive", () => {
    expect(archiveActionSchema.parse("archive")).toBe("archive");
    expect(archiveActionSchema.parse("unarchive")).toBe("unarchive");
  });

  it("rejects any other value", () => {
    expect(archiveActionSchema.safeParse("delete").success).toBe(false);
  });
});
