import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { fetchRemoteActiveSession, isAdoptableRemoteSession } from "@/sync/remoteActiveSession";
import type { ActiveSessionDto } from "@/sync/types";

// Finding C regression coverage — the device offered to resume a workout that
// PostgreSQL had already marked `completed`, because the session it displayed
// came from a cached today bundle. Two properties are asserted here:
//
//   1. anything that is not a freshly-confirmed `in_progress` session reads as
//      "no session" (never as an adoptable one);
//   2. "couldn't ask" is `unavailable`, which is distinct from "nothing in
//      progress" — the UI hides remote resume/takeover on the former rather
//      than acting on a stale claim.
//
// These functions are the only client-side source of remote active-session
// state, and they are pure/fetch-only by design so this can be tested in the
// node environment without IndexedDB or a browser.

const sessionId = newId();

function remoteSession(status: string): Record<string, unknown> {
  return {
    id: sessionId,
    blockId: null,
    templateId: null,
    templateName: "Upper A",
    weekIndex: 1,
    isDeload: false,
    status,
    startedAt: new Date().toISOString(),
    clientId: null,
    notes: null,
    exercises: [],
  };
}

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRemoteActiveSession", () => {
  it("returns the session when the server reports it in_progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ activeSession: remoteSession("in_progress") })),
    );

    const result = await fetchRemoteActiveSession();

    expect(result).toEqual({
      status: "fresh",
      activeSession: expect.objectContaining({ id: sessionId, status: "in_progress" }),
    });
  });

  it("requests the endpoint with no-store so no HTTP cache can answer it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ activeSession: null }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRemoteActiveSession();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/active-session",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("reports no active session when the server reports it completed", async () => {
    // The exact production state: one session, status completed, and a stale
    // client representation that still claimed it was resumable.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ activeSession: remoteSession("completed") })),
    );

    expect(await fetchRemoteActiveSession()).toEqual({ status: "fresh", activeSession: null });
  });

  it("reports no active session when the server reports it discarded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ activeSession: remoteSession("discarded") })),
    );

    expect(await fetchRemoteActiveSession()).toEqual({ status: "fresh", activeSession: null });
  });

  it("reports no active session when the server reports none", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ activeSession: null })));

    expect(await fetchRemoteActiveSession()).toEqual({ status: "fresh", activeSession: null });
  });

  it("reports unavailable — not 'none' — when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    expect(await fetchRemoteActiveSession()).toEqual({ status: "unavailable" });
  });

  it("reports unavailable on 401 (expired cookie)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "unauthenticated" }, { status: 401 })),
    );

    expect(await fetchRemoteActiveSession()).toEqual({ status: "unavailable" });
  });

  it("reports unavailable on a 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));

    expect(await fetchRemoteActiveSession()).toEqual({ status: "unavailable" });
  });

  it("reports unavailable when the body isn't JSON", async () => {
    // e.g. an HTML app-shell body — which is exactly what the SW's document
    // fallback would hand back if its destination guard were ever dropped.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("<!doctype html><title>Offline</title>", { status: 200 })),
    );

    expect(await fetchRemoteActiveSession()).toEqual({ status: "unavailable" });
  });
});

describe("isAdoptableRemoteSession", () => {
  const inProgress = { ...remoteSession("in_progress") } as unknown as ActiveSessionDto;

  it("accepts the same session, still in progress", () => {
    expect(isAdoptableRemoteSession(inProgress, sessionId)).toBe(true);
  });

  it("rejects a different session id", () => {
    expect(isAdoptableRemoteSession(inProgress, newId())).toBe(false);
  });

  it("rejects a null session", () => {
    expect(isAdoptableRemoteSession(null, sessionId)).toBe(false);
  });

  it("rejects a session that is no longer in progress", () => {
    const completed = { ...remoteSession("completed") } as unknown as ActiveSessionDto;
    expect(isAdoptableRemoteSession(completed, sessionId)).toBe(false);
  });
});
