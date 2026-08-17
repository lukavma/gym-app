import { createHash } from "node:crypto";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Keep in sync with OFFLINE_SHELL_PATH in src/domain/pwa/offlineShell.ts —
// repeated as a literal because the Next config loader does not resolve the
// `@/…` path alias. tests/e2e/offline-cold-launch.spec.ts asserts the built
// precache manifest contains exactly this URL, so drift fails a test.
const OFFLINE_SHELL_PATH = "/~offline";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Precache the offline app shell (Finding A). `manifestTransforms` rather
  // than `additionalPrecacheEntries`, because @serwist/next already uses the
  // latter for the `public/` glob and passing our own would REPLACE it,
  // silently dropping the precached icons. User transforms run before
  // @serwist/next's built-in URL rewriter, which leaves this URL untouched.
  manifestTransforms: [
    (entries) => ({
      manifest: [
        ...entries,
        {
          url: OFFLINE_SHELL_PATH,
          // A route, not a build asset, so it has no on-disk size; the field
          // only feeds serwist's own precache-size logging.
          size: 0,
          // A route, not a file on disk, so there is no file hash to use.
          // Derived from the hashes of everything else in this build: stable
          // for an unchanged build, different whenever any asset changed —
          // which is exactly when the shell's script tags may have changed
          // too, and the precached HTML must be re-fetched.
          revision: createHash("sha256")
            .update(entries.map((entry) => `${entry.url}:${entry.revision ?? ""}`).join("|"))
            .digest("hex")
            .slice(0, 16),
        },
      ],
      warnings: [],
    }),
  ],
});

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withSerwist(nextConfig);
