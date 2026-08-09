import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { middleware } from "@/middleware";
import { getSessionOptions } from "@/server/auth/sessionConfig";

async function sealedSessionCookie(userId: string): Promise<string> {
  const options = getSessionOptions();
  const sealed = await sealData({ userId }, { password: options.password, ttl: options.ttl });
  return `${options.cookieName}=${sealed}`;
}

describe("middleware", () => {
  it("allows public paths through without a session", async () => {
    const request = new NextRequest(new URL("http://localhost/login"));
    const response = await middleware(request);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects unauthenticated requests on protected paths to /login", async () => {
    const request = new NextRequest(new URL("http://localhost/today"));
    const response = await middleware(request);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("redirects requests with a garbage session cookie to /login", async () => {
    const request = new NextRequest(new URL("http://localhost/today"), {
      headers: { cookie: "gym_app_session=not-a-real-sealed-value" },
    });
    const response = await middleware(request);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("allows authenticated requests through and refreshes the rolling session cookie", async () => {
    const cookie = await sealedSessionCookie("11111111-1111-1111-1111-111111111111");
    const request = new NextRequest(new URL("http://localhost/today"), {
      headers: { cookie },
    });
    const response = await middleware(request);
    expect(response.headers.get("location")).toBeNull();
    // Rolling session (ADR-004): every authenticated pass re-seals and
    // re-issues the cookie so its expiry is refreshed from activity.
    expect(response.headers.get("set-cookie")).toContain("gym_app_session=");
  });
});
