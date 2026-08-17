import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import boundaries from "eslint-plugin-boundaries";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const boundariesElements = [
  { type: "middleware", pattern: "src/middleware.ts" },
  { type: "instrumentation", pattern: "src/instrumentation.ts" },
  { type: "domain", pattern: "src/domain/**" },
  { type: "db", pattern: "src/db/**" },
  { type: "server", pattern: "src/server/**" },
  { type: "sync", pattern: "src/sync/**" },
  { type: "api", pattern: "src/app/api/**" },
  { type: "app", pattern: "src/app/**" },
  { type: "ui", pattern: "src/ui/**" },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": boundariesElements,
      "boundaries/ignore": ["**/*.test.ts", "**/*.test.tsx"],
    },
    rules: {
      "boundaries/no-unknown": "error",
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "domain", allow: ["domain"] },
            { from: "db", allow: ["domain", "db"] },
            { from: "server", allow: ["domain", "db", "server"] },
            { from: "sync", allow: ["domain", "sync"] },
            { from: "api", allow: ["domain", "server", "api"] },
            { from: "app", allow: ["domain", "ui", "sync", "app"] },
            { from: "ui", allow: ["domain", "ui", "sync"] },
            { from: "middleware", allow: ["domain", "server"] },
            { from: "instrumentation", allow: [] },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      "public/sw.js",
      "src/app/sw.ts",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
