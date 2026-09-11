import { describe, expect, it } from "vitest";
import { isUnparseableSleepHoursDraft, sleepHoursError } from "@/ui/recovery/SleepHoursField";

// PI-007 device remediation — pins sleepHoursError's two branches directly:
// the pre-existing range/precision guard, and the new "non-empty but
// unparseable draft is an explicit error, not a silent clear" rule.
describe("sleepHoursError", () => {
  it("is null for an empty draft (unset — no error)", () => {
    expect(sleepHoursError(null, "")).toBeNull();
  });

  it.each([0, 7.5, 7.25, 24])("is null for a valid resolved value (%s)", (value) => {
    expect(sleepHoursError(value, String(value))).toBeNull();
  });

  it("fires for a value above 24", () => {
    expect(sleepHoursError(25, "25")).not.toBeNull();
  });

  it("fires for more than 2 decimal places", () => {
    expect(sleepHoursError(7.333, "7.333")).not.toBeNull();
  });

  it.each([".", ",", "1.2.3"])(
    "fires for a non-empty draft that does not parse (%s) — not a silent clear",
    (draft) => {
      expect(sleepHoursError(null, draft)).not.toBeNull();
    },
  );

  it("does not fire for a genuinely empty draft even after the value resolves to null", () => {
    expect(sleepHoursError(null, "")).toBeNull();
  });
});

// PI-007 device-remediation reverification B-1 — the narrower predicate
// RecoveryHistoryList.EditRow uses on its own, without also enforcing
// range/precision (which stays server-validated for History).
describe("isUnparseableSleepHoursDraft", () => {
  it("is false for a genuinely empty draft (a deliberate clear)", () => {
    expect(isUnparseableSleepHoursDraft(null, "")).toBe(false);
  });

  it.each([".", ",", "1.2.3"])(
    "is true for a non-empty draft that does not parse (%s)",
    (draft) => {
      expect(isUnparseableSleepHoursDraft(null, draft)).toBe(true);
    },
  );

  it("is false once the draft resolves to a real number, including 0", () => {
    expect(isUnparseableSleepHoursDraft(0, "0")).toBe(false);
    expect(isUnparseableSleepHoursDraft(7.5, "7.5")).toBe(false);
  });

  it("is false for an out-of-range number — range stays a separate concern", () => {
    expect(isUnparseableSleepHoursDraft(25, "25")).toBe(false);
  });
});
