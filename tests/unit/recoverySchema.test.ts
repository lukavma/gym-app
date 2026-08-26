import { describe, expect, it } from "vitest";
import { logRecoveryInputSchema, updateRecoveryInputSchema } from "@/domain/recovery/schema";

describe("logRecoveryInputSchema", () => {
  it("accepts all three 1-5 controls plus a note", () => {
    const result = logRecoveryInputSchema.safeParse({
      sleepQuality: 4,
      readiness: 3,
      soreness: 2,
      note: "felt fine",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a single metric with everything else omitted", () => {
    const result = logRecoveryInputSchema.safeParse({ soreness: 5 });
    expect(result.success).toBe(true);
  });

  it("accepts sleepHours as the sole metric", () => {
    const result = logRecoveryInputSchema.safeParse({ sleepHours: 7.5 });
    expect(result.success).toBe(true);
  });

  // data-model.md §2.19 ck_recovery_day — "at least one metric column not
  // null"; a note alone doesn't count as a metric.
  it("rejects an input with only a note and no metrics", () => {
    const result = logRecoveryInputSchema.safeParse({ note: "rough night" });
    expect(result.success).toBe(false);
  });

  it("rejects an entirely empty input", () => {
    const result = logRecoveryInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it.each([0, 6])("rejects a 1-5 control outside its range (%s)", (value) => {
    const result = logRecoveryInputSchema.safeParse({ soreness: value });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer 1-5 control", () => {
    const result = logRecoveryInputSchema.safeParse({ readiness: 3.5 });
    expect(result.success).toBe(false);
  });

  it.each([-0.01, 24.01])("rejects sleepHours outside the 0-24 range (%s)", (sleepHours) => {
    const result = logRecoveryInputSchema.safeParse({ sleepHours });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = logRecoveryInputSchema.safeParse({ soreness: 3, motivation: 5 });
    expect(result.success).toBe(false);
  });

  // phase-7-review.md MEDIUM-1 remediation — metric fields are now
  // `.nullable()` here too, so a day-upsert call can deliberately clear one
  // field while setting another in the same call.
  it("accepts an explicit null on one metric alongside a real value on another", () => {
    const result = logRecoveryInputSchema.safeParse({ soreness: 3, sleepQuality: null });
    expect(result.success).toBe(true);
  });

  // An explicit `null` is "present" but carries no value — clearing a
  // metric that has nothing to clear it from (no prior row exists yet at
  // the schema layer's level of knowledge) doesn't satisfy
  // ck_recovery_entries_has_metric, so this must still be rejected exactly
  // like an entirely empty input.
  it("rejects an input where every metric is explicitly null and none has a real value", () => {
    const result = logRecoveryInputSchema.safeParse({
      sleepHours: null,
      sleepQuality: null,
      readiness: null,
      soreness: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an input with only an explicit-null metric and a note", () => {
    const result = logRecoveryInputSchema.safeParse({ soreness: null, note: "no real value here" });
    expect(result.success).toBe(false);
  });
});

describe("updateRecoveryInputSchema", () => {
  it("accepts a note-only patch (patch semantics — merge validity is a service concern)", () => {
    const result = updateRecoveryInputSchema.safeParse({ note: "updated note" });
    expect(result.success).toBe(true);
  });

  it("accepts explicitly clearing a metric to null", () => {
    const result = updateRecoveryInputSchema.safeParse({ soreness: null });
    expect(result.success).toBe(true);
  });

  it("accepts an empty patch", () => {
    expect(updateRecoveryInputSchema.parse({})).toEqual({});
  });
});
