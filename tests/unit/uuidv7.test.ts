import { describe, expect, it } from "vitest";
import { newId, isUuidv7 } from "@/domain/ids/uuidv7";

describe("uuidv7", () => {
  it("generates a syntactically valid UUIDv7", () => {
    expect(isUuidv7(newId())).toBe(true);
  });

  it("generates unique ids", () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
  });

  it("generates ids that sort lexicographically in creation order", () => {
    const ids = Array.from({ length: 20 }, () => newId());
    expect(ids).toEqual([...ids].sort());
  });

  it("rejects a UUIDv4 string", () => {
    expect(isUuidv7("11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isUuidv7("not-a-uuid")).toBe(false);
    expect(isUuidv7("")).toBe(false);
  });
});
