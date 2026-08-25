import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { users, volumePresets } from "@/db/schema";
import type { AppDb } from "@/db/client";
import { hashPassword, verifyPassword, verifyDummyPassword } from "./argon2";
import { checkThrottle, recordFailure, resetThrottle } from "./throttle";
import { createUserSession, destroySession } from "./session";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(200),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export class SetupUnavailableError extends Error {
  constructor() {
    super("Setup is no longer available");
    this.name = "SetupUnavailableError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class ThrottledError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("Too many attempts");
    this.name = "ThrottledError";
  }
}

// A fixed advisory lock key serializing concurrent setup attempts so two
// simultaneous first requests can't both pass the "table is empty" check.
const SETUP_LOCK_KEY = 72_7001;

export async function isSetupAvailable(db: AppDb): Promise<boolean> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(row?.count ?? 0) === 0;
}

export async function setupAccount(db: AppDb, input: Credentials): Promise<{ id: string }> {
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_KEY})`);

    const [existing] = await tx.select({ count: sql<number>`count(*)` }).from(users);
    if (Number(existing?.count ?? 0) > 0) {
      throw new SetupUnavailableError();
    }

    const passwordHash = await hashPassword(input.password);
    // Deploy-time seeding happens before first-run setup on a fresh install.
    // If RP General is already present, attach it during account creation so
    // the new account has reference bands immediately. If setup runs before
    // seeding (for example in a test bootstrap), the seed's null-only update
    // remains the fallback.
    const [defaultVolumePreset] = await tx
      .select({ id: volumePresets.id })
      .from(volumePresets)
      .where(
        and(
          eq(volumePresets.name, "RP General"),
          eq(volumePresets.isBuiltin, true),
          isNull(volumePresets.userId),
        ),
      );
    const [row] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        defaultVolumePresetId: defaultVolumePreset?.id,
      })
      .returning({ id: users.id });
    if (!row) {
      throw new Error("Failed to create account");
    }
    return row;
  });

  await createUserSession(created.id);
  return created;
}

export interface LoginContext {
  ip: string;
}

export async function login(db: AppDb, input: Credentials, ctx: LoginContext): Promise<void> {
  const emailIdentifier = `email:${input.email}`;
  const ipIdentifier = `ip:${ctx.ip}`;

  const throttleDecision = await checkThrottle(db, [emailIdentifier, ipIdentifier]);
  if (throttleDecision.locked) {
    throw new ThrottledError(throttleDecision.retryAfterMs);
  }

  const [user] = await db.select().from(users).where(eq(users.email, input.email));

  if (!user) {
    // No account matches — still pay the argon2 cost so response timing
    // doesn't reveal whether the email exists.
    await verifyDummyPassword();
    await recordFailure(db, ipIdentifier);
    throw new InvalidCredentialsError();
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    await Promise.all([recordFailure(db, emailIdentifier), recordFailure(db, ipIdentifier)]);
    throw new InvalidCredentialsError();
  }

  await Promise.all([resetThrottle(db, emailIdentifier), resetThrottle(db, ipIdentifier)]);
  await createUserSession(user.id);
}

export async function logout(): Promise<void> {
  await destroySession();
}
