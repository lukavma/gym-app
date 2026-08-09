import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to the Argon2id variant (ADR-004).
const ARGON2_OPTIONS = {
  memoryCost: 19456, // ~19 MiB — OWASP password storage cheat sheet minimum
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2Verify(hash, password);
}

// A hash of an arbitrary fixed password, verified against whenever a login
// attempt's email doesn't match any account — so a failed attempt costs the
// same wall-clock time whether or not the account exists, and account
// existence can't be inferred from response timing.
let dummyHashPromise: Promise<string> | undefined;

export async function verifyDummyPassword(): Promise<void> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2Hash("dummy-password-for-timing-parity", ARGON2_OPTIONS);
  }
  const dummyHash = await dummyHashPromise;
  await argon2Verify(dummyHash, "irrelevant-input-never-matches");
}
