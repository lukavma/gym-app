import { beforeEach, describe, expect, it } from "vitest";
import {
  isSetupAvailable,
  setupAccount,
  login,
  SetupUnavailableError,
  InvalidCredentialsError,
  ThrottledError,
} from "@/server/auth/service";
import type { AppDb } from "@/db/client";
import { createTestDb } from "./testDb";
import { fakeCookieMap } from "./fakeCookieStore";

const CREDENTIALS = { email: "athlete@example.com", password: "correct-horse-battery" };

describe("auth service (PGlite integration)", () => {
  let db: AppDb;

  beforeEach(async () => {
    db = await createTestDb();
    fakeCookieMap.clear();
  });

  it("reports setup as available on an empty database", async () => {
    await expect(isSetupAvailable(db)).resolves.toBe(true);
  });

  it("creates the account and starts a session on first-run setup", async () => {
    const { id } = await setupAccount(db, CREDENTIALS);
    expect(id).toBeTruthy();
    expect(fakeCookieMap.has("gym_app_session")).toBe(true);
  });

  it("reports setup as unavailable once an account exists", async () => {
    await setupAccount(db, CREDENTIALS);
    await expect(isSetupAvailable(db)).resolves.toBe(false);
  });

  it("refuses to create a second account", async () => {
    await setupAccount(db, CREDENTIALS);
    await expect(setupAccount(db, { ...CREDENTIALS, email: "second@example.com" })).rejects.toThrow(
      SetupUnavailableError,
    );
  });

  it("logs in with correct credentials and starts a session", async () => {
    await setupAccount(db, CREDENTIALS);
    fakeCookieMap.clear();

    await login(db, CREDENTIALS, { ip: "203.0.113.1" });
    expect(fakeCookieMap.has("gym_app_session")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    await setupAccount(db, CREDENTIALS);
    await expect(
      login(db, { email: CREDENTIALS.email, password: "wrong-password" }, { ip: "203.0.113.1" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects an unknown email without revealing that it doesn't exist", async () => {
    await setupAccount(db, CREDENTIALS);
    await expect(
      login(db, { email: "nobody@example.com", password: "whatever1" }, { ip: "203.0.113.1" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("locks out after repeated failures and reports a retry-after", async () => {
    await setupAccount(db, CREDENTIALS);
    const ip = "203.0.113.2";
    const wrongAttempt = () =>
      login(db, { email: CREDENTIALS.email, password: "wrong-password" }, { ip });

    for (let i = 0; i < 5; i++) {
      await expect(wrongAttempt()).rejects.toThrow(InvalidCredentialsError);
    }

    // 6th attempt, even with a fresh IP, is throttled by the email identifier.
    let thrown: unknown;
    try {
      await login(db, CREDENTIALS, { ip: "203.0.113.3" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ThrottledError);
    expect((thrown as InstanceType<typeof ThrottledError>).retryAfterMs).toBeGreaterThan(0);
  });
});
