import type { SessionOptions } from "iron-session";

export interface SessionData {
  userId: string;
}

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

// No Next.js imports here on purpose: this module is shared by both the
// Node-runtime session helpers (route handlers) and the Edge-runtime
// middleware session check, so it must stay usable in both.
export function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  }
  return {
    cookieName: "gym_app_session",
    password,
    ttl: THIRTY_DAYS_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: THIRTY_DAYS_SECONDS,
    },
  };
}
