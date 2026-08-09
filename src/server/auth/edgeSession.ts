import type { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { getSessionOptions, type SessionData } from "./sessionConfig";

// Edge-safe (Middleware) session check. This module and its imports must
// never touch argon2 or the database — both are Node-only. It only unseals
// the cookie to test for a valid session and, if present, re-saves it so the
// rolling 30-day expiry is refreshed on activity (ADR-004).
export async function touchSessionInMiddleware(
  request: NextRequest,
  response: NextResponse,
): Promise<boolean> {
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  if (!session.userId) {
    return false;
  }
  await session.save();
  return true;
}
