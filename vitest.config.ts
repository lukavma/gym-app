import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests: pure logic + Edge-safe modules only. No DB, no next/headers
// mocking — see vitest.integration.config.ts for PGlite-backed tests.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
  },
});
