import { vi } from "vitest";
import { fakeCookieStore } from "./fakeCookieStore";

process.env.SESSION_SECRET = "test-session-secret-value-32-bytes-min";

// setupAccount/login/logout call into session.ts, which reads `next/headers`
// cookies() — unavailable outside a real Next.js request. Redirect it to an
// in-memory store for these tests.
vi.mock("next/headers", () => ({
  cookies: async () => fakeCookieStore,
}));
