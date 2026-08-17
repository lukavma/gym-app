import { defineConfig, devices } from "@playwright/test";

// Phase 0: local-only smoke harness (implementation-plan.md). Never run in
// CI — it needs a real Postgres (docker-compose), which CI does not provide.
//
// MEDIUM-10 — `next.config.ts` disables the service worker whenever
// `NODE_ENV === "development"`, and offline-sync.spec.ts (F6) depends on a
// real SW-served offline reload. `pnpm dev` cannot satisfy that under any
// circumstances, so the webServer Playwright itself spawns must build and
// start a production server, not run dev — previously this was only
// documented in the spec's header comment, unenforced, so a clean-checkout
// `pnpm test:e2e` silently ran the offline spec against a server with no
// SW. `reuseExistingServer: true` still lets a manually-started
// `pnpm build && pnpm start` be reused for faster local iteration.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
