import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions, type SessionData } from "./sessionConfig";

// Node-runtime session helpers for route handlers / server components.
// Argon2 lives in ./argon2.ts, never here — this file only seals/unseals the
// session cookie (iron-session, Web Crypto based).

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

export async function createUserSession(userId: string): Promise<void> {
  const session = await getSession();
  session.userId = userId;
  await session.save();
}

export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
