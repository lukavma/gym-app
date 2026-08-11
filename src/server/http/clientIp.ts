const BRACKETED_IPV6 = /^\[(.+)\](?::\d+)?$/;

/**
 * Extracts the trusted client IP from an `X-Forwarded-For` header value.
 *
 * Azure App Service (the only reverse-proxy hop in front of this app per
 * ADR-009) appends the address it actually observed as the LAST entry in
 * the list — unlike the first entry, which is client-supplied and trivially
 * spoofable. The appended entry may carry a `:port` suffix (IPv4) or be a
 * bracketed `[ipv6]:port`; both are stripped down to the bare address.
 */
export function extractClientIp(xForwardedFor: string | null | undefined): string | null {
  if (!xForwardedFor) return null;

  const entries = xForwardedFor
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const last = entries.at(-1);
  return last ? stripPort(last) : null;
}

function stripPort(value: string): string {
  const bracketed = value.match(BRACKETED_IPV6);
  if (bracketed) {
    return bracketed[1] ?? value;
  }

  // Raw (unbracketed) IPv6 addresses contain 2+ colons and never carry a
  // port (there's no unambiguous way to append one without brackets) — must
  // be returned untouched, never truncated at a colon.
  const colonCount = (value.match(/:/g) ?? []).length;
  if (colonCount === 1) {
    // Exactly one colon => IPv4:port.
    return value.slice(0, value.indexOf(":"));
  }

  return value;
}
