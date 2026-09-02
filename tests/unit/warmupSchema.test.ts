import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import {
  createWarmupRoutineSchema,
  isUuid,
  replaceWarmupRoutineSchema,
  setTemplateWarmupRoutinesSchema,
  warmupRoutineItemInputSchema,
  TEMPLATE_WARMUP_ROUTINES_MAX,
  WARMUP_ITEM_INSTRUCTION_MAX,
  WARMUP_ITEM_LABEL_MAX,
  WARMUP_ROUTINE_ITEMS_MAX,
  WARMUP_ROUTINE_NAME_MAX,
} from "@/domain/warmup/schema";

// Warm-up Routines v1 — validation bounds (evaluation §4.1, R-8) and the
// association invariants owner decision O-1 requires.

function items(count: number) {
  return Array.from({ length: count }, (_, i) => ({ label: `Item ${i + 1}` }));
}

describe("warmupRoutineItemInputSchema", () => {
  it("accepts label plus an optional instruction", () => {
    const parsed = warmupRoutineItemInputSchema.parse({
      label: "Band external rotation",
      instruction: "2x15 light",
    });
    expect(parsed).toEqual({ label: "Band external rotation", instruction: "2x15 light" });
  });

  it("normalizes an omitted, null, or whitespace-only instruction to null (one representation for 'no dose')", () => {
    expect(warmupRoutineItemInputSchema.parse({ label: "Bike" }).instruction).toBeNull();
    expect(
      warmupRoutineItemInputSchema.parse({ label: "Bike", instruction: null }).instruction,
    ).toBeNull();
    expect(
      warmupRoutineItemInputSchema.parse({ label: "Bike", instruction: "   " }).instruction,
    ).toBeNull();
  });

  it("trims and requires a non-empty label", () => {
    expect(warmupRoutineItemInputSchema.parse({ label: "  Bike  " }).label).toBe("Bike");
    expect(warmupRoutineItemInputSchema.safeParse({ label: "   " }).success).toBe(false);
    expect(warmupRoutineItemInputSchema.safeParse({}).success).toBe(false);
  });

  it("enforces the label and instruction length caps", () => {
    expect(
      warmupRoutineItemInputSchema.safeParse({ label: "a".repeat(WARMUP_ITEM_LABEL_MAX) }).success,
    ).toBe(true);
    expect(
      warmupRoutineItemInputSchema.safeParse({ label: "a".repeat(WARMUP_ITEM_LABEL_MAX + 1) })
        .success,
    ).toBe(false);
    expect(
      warmupRoutineItemInputSchema.safeParse({
        label: "Bike",
        instruction: "a".repeat(WARMUP_ITEM_INSTRUCTION_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects an exercise reference — items are pure text, not even optionally linked (X-4/M-8)", () => {
    expect(
      warmupRoutineItemInputSchema.safeParse({ label: "Bench", exerciseId: newId() }).success,
    ).toBe(false);
  });
});

describe("createWarmupRoutineSchema / replaceWarmupRoutineSchema", () => {
  it("is the same schema for create and replace — routine + items are one unit (B-3)", () => {
    expect(replaceWarmupRoutineSchema).toBe(createWarmupRoutineSchema);
  });

  it("accepts 1..MAX items and rejects 0 or MAX+1", () => {
    expect(createWarmupRoutineSchema.safeParse({ name: "Upper", items: items(1) }).success).toBe(
      true,
    );
    expect(
      createWarmupRoutineSchema.safeParse({ name: "Upper", items: items(WARMUP_ROUTINE_ITEMS_MAX) })
        .success,
    ).toBe(true);
    expect(createWarmupRoutineSchema.safeParse({ name: "Upper", items: [] }).success).toBe(false);
    expect(
      createWarmupRoutineSchema.safeParse({
        name: "Upper",
        items: items(WARMUP_ROUTINE_ITEMS_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("enforces the routine name bounds and trims", () => {
    expect(createWarmupRoutineSchema.parse({ name: "  Upper  ", items: items(1) }).name).toBe(
      "Upper",
    );
    expect(createWarmupRoutineSchema.safeParse({ name: "   ", items: items(1) }).success).toBe(
      false,
    );
    expect(
      createWarmupRoutineSchema.safeParse({
        name: "a".repeat(WARMUP_ROUTINE_NAME_MAX + 1),
        items: items(1),
      }).success,
    ).toBe(false);
  });

  it("is strict — unknown fields are rejected rather than silently dropped", () => {
    expect(
      createWarmupRoutineSchema.safeParse({ name: "Upper", items: items(1), archived: true })
        .success,
    ).toBe(false);
  });
});

describe("setTemplateWarmupRoutinesSchema (owner decision O-1)", () => {
  const a = newId();
  const b = newId();

  it("accepts an empty set (clearing every association) with a null default", () => {
    const parsed = setTemplateWarmupRoutinesSchema.parse({ routineIds: [] });
    expect(parsed).toEqual({ routineIds: [], defaultRoutineId: null });
  });

  it("accepts several routines with at most one of them marked default", () => {
    const parsed = setTemplateWarmupRoutinesSchema.parse({
      routineIds: [a, b],
      defaultRoutineId: b,
    });
    expect(parsed.routineIds).toEqual([a, b]);
    expect(parsed.defaultRoutineId).toBe(b);
  });

  it("rejects a default that is not one of the linked routines", () => {
    const result = setTemplateWarmupRoutinesSchema.safeParse({
      routineIds: [a],
      defaultRoutineId: b,
    });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(["defaultRoutineId"]);
  });

  it("rejects a default when nothing is linked at all", () => {
    expect(
      setTemplateWarmupRoutinesSchema.safeParse({ routineIds: [], defaultRoutineId: a }).success,
    ).toBe(false);
  });

  it("rejects duplicate routine ids (a routine may be linked to a template at most once)", () => {
    expect(setTemplateWarmupRoutinesSchema.safeParse({ routineIds: [a, a] }).success).toBe(false);
  });

  it("rejects a malformed routine id before it can ever reach PostgreSQL", () => {
    expect(setTemplateWarmupRoutinesSchema.safeParse({ routineIds: ["not-a-uuid"] }).success).toBe(
      false,
    );
  });

  it("caps the association list", () => {
    const ids = Array.from({ length: TEMPLATE_WARMUP_ROUTINES_MAX + 1 }, () => newId());
    expect(setTemplateWarmupRoutinesSchema.safeParse({ routineIds: ids }).success).toBe(false);
  });
});

describe("isUuid — the guard that keeps a malformed path param from becoming a 500", () => {
  it("accepts a generated UUIDv7 and a plain v4", () => {
    expect(isUuid(newId())).toBe(true);
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
  });

  it("rejects the shapes a URL can actually carry", () => {
    for (const value of ["", "abc", "123", "../../etc/passwd", "0190-not-a-uuid", "null"]) {
      expect(isUuid(value), value).toBe(false);
    }
  });
});
