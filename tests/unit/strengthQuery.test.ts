import { describe, expect, it } from "vitest";
import { parseStrengthQuery, strengthQuerySchema } from "@/domain/strength/query";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §14.4 — `?asOf=` parsed as ISO, invalid -> 400, future CLAMPED (by the
// server, not rejected here); §15.1 — the what-if inputs. Acceptance
// criterion A-25's "rejects an unparsable asOf" half.

function query(search: string) {
  return parseStrengthQuery(new URLSearchParams(search));
}

describe("parseStrengthQuery (A-25, §14.4)", () => {
  it("accepts an empty query string", () => {
    expect(query("")).toEqual({ ok: true, value: {} });
  });

  it("accepts a well-formed ISO instant", () => {
    const parsed = query("asOf=2026-09-06T12:00:00.000Z");
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.asOf).toBe("2026-09-06T12:00:00.000Z");
  });

  it("accepts a FUTURE instant — clamping is the server's job, not a 400", () => {
    // review RM-2: `?asOf=` must never be usable to produce a `best` no
    // session supports, but rejecting it outright would be a worse answer
    // than clamping and echoing the effective value.
    expect(query("asOf=2099-01-01T00:00:00.000Z").ok).toBe(true);
  });

  it("rejects an unparsable asOf", () => {
    expect(query("asOf=yesterday").ok).toBe(false);
    expect(query("asOf=2026-13-45T00:00:00.000Z").ok).toBe(false);
    expect(query("asOf=").ok).toBe(false);
    // A bare date has no instant; the field is documented as an ISO instant.
    expect(query("asOf=2026-09-06").ok).toBe(false);
  });

  it("takes the two what-if inputs together or not at all", () => {
    expect(query("whatIfReps=5&whatIfRir=2").ok).toBe(true);
    expect(query("whatIfReps=5").ok).toBe(false);
    expect(query("whatIfRir=2").ok).toBe(false);
  });

  it("rejects non-numeric, fractional and out-of-range what-if inputs", () => {
    expect(query("whatIfReps=abc&whatIfRir=2").ok).toBe(false);
    expect(query("whatIfReps=5.5&whatIfRir=2").ok).toBe(false);
    expect(query("whatIfReps=0&whatIfRir=2").ok).toBe(false);
    expect(query("whatIfReps=101&whatIfRir=2").ok).toBe(false);
    expect(query("whatIfReps=5&whatIfRir=-1").ok).toBe(false);
    expect(query("whatIfReps=5&whatIfRir=11").ok).toBe(false);
    expect(query("whatIfReps=&whatIfRir=2").ok).toBe(false);
  });

  it("mirrors the set_logs CHECK bounds at the edges", () => {
    // `reps between 1 and 100`, `rir between 0 and 10` — the calculator can
    // only be asked about a set the athlete could actually log.
    expect(query("whatIfReps=1&whatIfRir=0").ok).toBe(true);
    expect(query("whatIfReps=100&whatIfRir=10").ok).toBe(true);
  });

  it("rejects unknown parameters rather than ignoring them", () => {
    expect(strengthQuerySchema.safeParse({ asOfDate: "2026-09-06" }).success).toBe(false);
  });

  it("does not accept a target outside the formula's range at the parse layer", () => {
    // Values inside the log-able bounds but outside the usable TARGET range
    // must reach the domain, so the athlete gets an honest refusal code
    // instead of a bare 400 (§9.4).
    expect(query("whatIfReps=1&whatIfRir=0").ok).toBe(true);
    expect(query("whatIfReps=20&whatIfRir=0").ok).toBe(true);
  });
});
