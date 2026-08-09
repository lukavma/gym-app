import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, verifyDummyPassword } from "@/server/auth/argon2";

describe("argon2", () => {
  it("hashes and verifies a matching password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "correct horse battery staple")).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "wrong password")).resolves.toBe(false);
  });

  it("resolves without throwing for the dummy verification path", async () => {
    await expect(verifyDummyPassword()).resolves.toBeUndefined();
  });
});
