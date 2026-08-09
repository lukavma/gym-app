// Minimal stand-in for the `next/headers` `cookies()` store (only `get`/
// `set`, matching iron-session's `CookieStore` interface) so session.ts's
// Node-runtime helpers can run outside of a real Next.js request scope.
export const fakeCookieMap = new Map<string, string>();

export const fakeCookieStore = {
  get(name: string): { name: string; value: string } | undefined {
    const value = fakeCookieMap.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set(name: string, value: string): void {
    fakeCookieMap.set(name, value);
  },
};
