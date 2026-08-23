import { describe, expect, it } from "vitest";
import { decimalPlaceCount, parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";

describe("parseDecimalInput", () => {
  it("parses a plain dot-decimal value", () => {
    expect(parseDecimalInput("2.5")).toBe(2.5);
    expect(parseDecimalInput("1.25")).toBe(1.25);
  });

  it("normalizes a comma decimal separator (German/EU locale input)", () => {
    expect(parseDecimalInput("2,5")).toBe(2.5);
    expect(parseDecimalInput("1,25")).toBe(1.25);
    expect(parseDecimalInput("82,5")).toBe(82.5);
  });

  it("treats an explicitly typed 0 as valid, not empty", () => {
    expect(parseDecimalInput("0")).toBe(0);
  });

  it("returns null for an empty or whitespace-only string", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("   ")).toBeNull();
  });

  it("returns null for unparseable text rather than coercing to 0", () => {
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("1.2.5")).toBeNull();
    expect(parseDecimalInput(",")).toBeNull();
    expect(parseDecimalInput(".")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseDecimalInput("  1.25  ")).toBe(1.25);
  });
});

describe("sanitizeDecimalDraft", () => {
  it("passes digits and separators through unchanged", () => {
    expect(sanitizeDecimalDraft("1.25")).toBe("1.25");
    expect(sanitizeDecimalDraft("1,25")).toBe("1,25");
  });

  it("strips characters that can never be part of a decimal number", () => {
    expect(sanitizeDecimalDraft("1a2.5")).toBe("12.5");
    expect(sanitizeDecimalDraft("-5")).toBe("5");
    expect(sanitizeDecimalDraft("kg1.5")).toBe("1.5");
  });
});

describe("decimalPlaceCount", () => {
  it("counts digits after a dot separator", () => {
    expect(decimalPlaceCount("1.25")).toBe(2);
    expect(decimalPlaceCount("99.99")).toBe(2);
  });

  it("counts digits after a comma separator", () => {
    expect(decimalPlaceCount("1,234")).toBe(3);
  });

  it("returns 0 for an integer with no separator", () => {
    expect(decimalPlaceCount("5")).toBe(0);
  });

  it("is not fooled by binary floating-point representation error", () => {
    // 1.005 * 100 !== 100.5 in IEEE 754 — a check on the parsed float would
    // misjudge this. Counting on the raw string avoids that entirely.
    expect(decimalPlaceCount("1.005")).toBe(3);
  });
});
