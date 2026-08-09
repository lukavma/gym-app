import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Integration tests: exercise server/auth logic against a real (WASM)
// Postgres via PGlite (ADR-003) instead of the Docker Postgres used for
// manual local dev, so these run in CI/anywhere without Docker.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 20000,
    // PGlite (WASM) + argon2id hashing per test don't parallelize well;
    // run integration files serially for stability.
    fileParallelism: false,
  },
});
