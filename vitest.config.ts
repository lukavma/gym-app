import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests: pure logic + Edge-safe modules only. No DB, no next/headers
// mocking — see vitest.integration.config.ts for PGlite-backed tests.
export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig.json's `jsx: "preserve"` is what Next's own SWC compiler wants
  // (untouched by this) — esbuild has no "preserve" mode, so left alone it
  // falls back to the classic pragma and every `.tsx` import errors with
  // "React is not defined". This scopes the automatic runtime to the
  // Vitest/esbuild pipeline only (Athletic Measurement Profiles Release 2 —
  // tests/unit/measurement/uiFormatWiring.test.ts renders real `.tsx`
  // components via `react-dom/server` to prove the shared formatter wiring).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
  },
});
