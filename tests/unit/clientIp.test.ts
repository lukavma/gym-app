import { describe, expect, it } from "vitest";
import { extractClientIp } from "@/server/http/clientIp";

describe("extractClientIp", () => {
  it("returns null when the header is missing", () => {
    expect(extractClientIp(undefined)).toBeNull();
    expect(extractClientIp(null)).toBeNull();
    expect(extractClientIp("")).toBeNull();
  });

  it("parses a single IPv4 entry", () => {
    expect(extractClientIp("203.0.113.5")).toBe("203.0.113.5");
  });

  it("takes the last entry from multiple XFF entries (the trusted, proxy-appended one)", () => {
    expect(extractClientIp("203.0.113.5, 198.51.100.20, 10.0.0.4")).toBe("10.0.0.4");
  });

  it("ignores a spoofed leading entry and trusts only the last hop", () => {
    expect(extractClientIp("1.2.3.4, 198.51.100.7")).toBe("198.51.100.7");
  });

  it("strips a port from a trailing IPv4:port entry", () => {
    expect(extractClientIp("203.0.113.5, 198.51.100.20:54321")).toBe("198.51.100.20");
  });

  it("strips brackets and port from a trailing bracketed IPv6:port entry", () => {
    expect(extractClientIp("2001:db8::1, [2001:db8::2]:443")).toBe("2001:db8::2");
  });

  it("does not truncate a raw (unbracketed) IPv6 address at its last colon segment", () => {
    expect(extractClientIp("2001:db8::1")).toBe("2001:db8::1");
    expect(extractClientIp("::1")).toBe("::1");
  });

  it("trims surrounding whitespace", () => {
    expect(extractClientIp("203.0.113.5 ,   198.51.100.20  ")).toBe("198.51.100.20");
  });

  it("degrades safely on a malformed value (trailing comma / empty segments)", () => {
    expect(extractClientIp("203.0.113.5,")).toBe("203.0.113.5");
    expect(extractClientIp(",")).toBeNull();
    expect(extractClientIp("   ")).toBeNull();
  });
});
