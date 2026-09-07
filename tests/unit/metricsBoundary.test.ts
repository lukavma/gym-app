import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SRC_ROOT, extractModuleSpecifiers, traceTo, walkImportGraph } from "./importGraphWalker";
import type { SyntheticEdge } from "./importGraphWalker";

// Binding source: docs/reviews/metrics-dashboard-architecture-evaluation.md
// §16 I-2, I-8, I-12, acceptance criterion A-21 — following the
// `strengthBoundary.test.ts` template: a discovered inventory rather than
// hand-listed directories, a completeness guard, anti-vacuity witnesses, a
// negative control, and synthetic-edge regression controls.

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [full] : [];
  });
}

function under(file: string, dir: string): boolean {
  return file === dir || file.startsWith(dir + path.sep);
}

const DOMAIN_METRICS = path.join(SRC_ROOT, "domain", "metrics");
const SERVER_METRICS = path.join(SRC_ROOT, "server", "metrics");
const UI_METRICS = path.join(SRC_ROOT, "ui", "metrics");
const API_METRICS = path.join(SRC_ROOT, "app", "api", "metrics");
const PAGE_METRICS = path.join(SRC_ROOT, "app", "(app)", "metrics");
const DOMAIN_PROGRESSION = path.join(SRC_ROOT, "domain", "progression");
const SERVER_PROGRESSION = path.join(SRC_ROOT, "server", "progression");
const SERVER_SYNC = path.join(SRC_ROOT, "server", "sync");
const SERVER_TODAY = path.join(SRC_ROOT, "server", "today");

const DOMAIN_METRICS_FILES = listSourceFiles(DOMAIN_METRICS);
const SERVER_METRICS_FILES = listSourceFiles(SERVER_METRICS);
const UI_METRICS_FILES = listSourceFiles(UI_METRICS);
const API_METRICS_FILES = listSourceFiles(API_METRICS);
const PAGE_METRICS_FILES = listSourceFiles(PAGE_METRICS);

function codeOnly(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

// F-16 — no metrics file path may contain `strength` or `warmup`
// (case-insensitive): both suites discover their own feature inventories by
// path regex over `src/`, so a misnamed metrics file would be silently
// treated as belonging to one of those features instead.
const METRICS_PATH_PATTERN = /metrics/i;
const ALL_METRICS_FILES = listSourceFiles(SRC_ROOT)
  .filter((file) => METRICS_PATH_PATTERN.test(path.relative(SRC_ROOT, file)))
  .sort();

describe("the scan itself runs (anti-vacuity)", () => {
  it("found the feature's five directories", () => {
    expect(DOMAIN_METRICS_FILES.length).toBeGreaterThan(5);
    expect(SERVER_METRICS_FILES.length).toBeGreaterThan(0);
    expect(UI_METRICS_FILES.length).toBeGreaterThan(3);
    expect(API_METRICS_FILES.length).toBe(2);
    expect(PAGE_METRICS_FILES.length).toBeGreaterThan(0);
  });

  it("accounts for every discovered metrics file", () => {
    const accounted = new Set([
      ...DOMAIN_METRICS_FILES,
      ...SERVER_METRICS_FILES,
      ...UI_METRICS_FILES,
      ...API_METRICS_FILES,
      ...PAGE_METRICS_FILES,
    ]);
    const unaccounted = ALL_METRICS_FILES.filter((file) => !accounted.has(file));
    expect(
      unaccounted.map((file) => path.relative(SRC_ROOT, file)),
      "a metrics file lives outside the five directories this suite walks — add it to a claim or record why it is exempt",
    ).toEqual([]);
  });

  it("F-16: no metrics file path contains 'strength' or 'warmup'", () => {
    for (const file of ALL_METRICS_FILES) {
      const relative = path.relative(SRC_ROOT, file);
      expect(/strength/i.test(relative), relative).toBe(false);
      expect(/warmup/i.test(relative), relative).toBe(false);
    }
  });
});

describe("the pure module is self-contained (§16 I-12)", () => {
  // The one deliberate widening: `selection.ts` may import the eligibility
  // gate from `@/domain/strength/**` (the one rule, never copied). Every
  // OTHER metrics domain file's only permitted outside reach is
  // `@/domain/volume/aggregate` (types), `@/domain/volume/weekBuckets`,
  // and `@/domain/strength/report` / `@/domain/strength/types`.
  const SELECTION_FILE = path.join(DOMAIN_METRICS, "selection.ts");
  // L-8 — `@/domain/strength/estimateMode` was on this list but is unused:
  // I-12 does not name it and no metrics file imports it (the
  // `StrengthEstimateMode` type is reached via `@/domain/strength/types`'s
  // own re-export instead). A permitted-but-unused entry would let a real
  // future import slip in unnoticed by this allowlist's own intent.
  const ALLOWED_OUTSIDE_SPECIFIERS = new Set([
    "@/domain/volume/aggregate",
    "@/domain/volume/weekBuckets",
    "@/domain/strength/report",
    "@/domain/strength/types",
    "@/domain/strength/primitives",
  ]);
  const SELECTION_ALLOWED_OUTSIDE_SPECIFIERS = new Set([
    ...ALLOWED_OUTSIDE_SPECIFIERS,
    "@/domain/strength/eligibility",
    "@/domain/strength/types",
  ]);

  // Unlike `strengthBoundary.test.ts`'s equivalent check — where the pure
  // module has ZERO legitimate outside reach — §11's own text names four
  // specific allowed modules for domain/metrics, so "reaches nothing
  // outside itself" is the wrong shape of claim here. The specifier-level
  // allowlist below (every `@/` specifier domain/metrics's OWN source text
  // uses) is the real boundary; this test only re-asserts that the walk
  // still reaches the allowed modules' own transitive closure (never a
  // forbidden one), so a stray import doesn't silently smuggle in a
  // forbidden edge two hops deep.
  it("only ever transitively reaches progression, server/sync or server/today through nothing (never smuggled in two hops deep)", () => {
    const { visited, reachedFrom } = walkImportGraph(DOMAIN_METRICS_FILES);
    expect(visited.has(path.join(DOMAIN_METRICS, "training.ts"))).toBe(true);
    expect(visited.size).toBeGreaterThan(DOMAIN_METRICS_FILES.length - 1);

    const offenders = [...visited].filter(
      (file) =>
        under(file, DOMAIN_PROGRESSION) ||
        under(file, path.join(SRC_ROOT, "server")) ||
        under(file, path.join(SRC_ROOT, "domain", "sync")),
    );
    if (offenders.length > 0) {
      throw new Error(offenders.map((file) => traceTo(reachedFrom, file)).join("\n"));
    }
    expect(offenders).toEqual([]);
  });

  it("every outside module specifier used by domain/metrics is on the declared allowlist", () => {
    for (const file of DOMAIN_METRICS_FILES) {
      const source = readFileSync(file, "utf8");
      const specifiers = extractModuleSpecifiers(source, file)
        .map((s) => s.text)
        .filter((text) => text.startsWith("@/") && !text.startsWith("@/domain/metrics"));
      const allowed =
        file === SELECTION_FILE ? SELECTION_ALLOWED_OUTSIDE_SPECIFIERS : ALLOWED_OUTSIDE_SPECIFIERS;
      for (const specifier of specifiers) {
        expect(
          allowed.has(specifier),
          `${path.relative(SRC_ROOT, file)} imports ${specifier}`,
        ).toBe(true);
      }
    }
    // NEGATIVE CONTROL: only selection.ts may import the eligibility gate.
    for (const file of DOMAIN_METRICS_FILES) {
      if (file === SELECTION_FILE) continue;
      const specifiers = extractModuleSpecifiers(readFileSync(file, "utf8"), file).map(
        (s) => s.text,
      );
      expect(specifiers).not.toContain("@/domain/strength/eligibility");
    }
  });
});

describe("progression is untouched in both directions (I-8)", () => {
  it("src/domain/progression never reaches src/domain/metrics", () => {
    const roots = listSourceFiles(DOMAIN_PROGRESSION);
    expect(roots.length).toBeGreaterThan(0);
    const { visited, reachedFrom } = walkImportGraph(roots);
    const offenders = [...visited].filter((file) => under(file, DOMAIN_METRICS));
    if (offenders.length > 0)
      throw new Error(offenders.map((file) => traceTo(reachedFrom, file)).join("\n"));
    expect(offenders).toEqual([]);
  });

  it("src/server/metrics never reaches the progression engine, sync, or today", () => {
    const { visited, reachedFrom } = walkImportGraph(SERVER_METRICS_FILES);
    expect(visited.has(path.join(SRC_ROOT, "db", "schema", "index.ts"))).toBe(true);

    const offenders = [...visited].filter(
      (file) =>
        under(file, DOMAIN_PROGRESSION) ||
        under(file, SERVER_PROGRESSION) ||
        under(file, SERVER_SYNC) ||
        under(file, SERVER_TODAY),
    );
    if (offenders.length > 0)
      throw new Error(offenders.map((file) => traceTo(reachedFrom, file)).join("\n"));
    expect(offenders).toEqual([]);
  });

  it("names the forbidden engine entry points explicitly", () => {
    const sources = [...SERVER_METRICS_FILES, ...API_METRICS_FILES].map(codeOnly);
    expect(sources.length).toBeGreaterThan(1);
    for (const symbol of ["evaluateSession", "loadProgression", "repProgression"]) {
      for (const source of sources) {
        expect(source.includes(symbol), `${symbol} appears in metrics server code`).toBe(false);
      }
    }
    // NEGATIVE CONTROL: `codeOnly` must strip comments, not code.
    expect(codeOnly(path.join(SERVER_METRICS, "service.ts"))).toContain("getMetricsDashboard");
    expect(codeOnly(path.join(SERVER_METRICS, "service.ts"))).not.toContain("evaluateSession");
  });
});

// L-8 — A-21 also requires that metrics "never reaches ... the
// `recommendations` schema symbol"; the strength suite's equivalent claim
// (`strengthBoundary.test.ts`'s "the feature reads recommendations for
// nothing") was not mirrored here originally.
describe("the feature reads recommendations for nothing (A-21)", () => {
  it("no metrics file's code (comments stripped) mentions the recommendations table/schema symbol", () => {
    const allFiles = [
      ...DOMAIN_METRICS_FILES,
      ...SERVER_METRICS_FILES,
      ...UI_METRICS_FILES,
      ...API_METRICS_FILES,
      ...PAGE_METRICS_FILES,
    ];
    expect(allFiles.length).toBeGreaterThan(10);
    for (const file of allFiles) {
      expect(codeOnly(file).includes("recommendations"), path.relative(SRC_ROOT, file)).toBe(false);
    }
    // NEGATIVE CONTROL: the same check over a file that genuinely does read
    // the table must fire, proving the assertion above is not vacuous.
    expect(
      codeOnly(path.join(SRC_ROOT, "server", "progression", "service.ts")).includes(
        "recommendations",
      ),
    ).toBe(true);
  });
});

describe("server/metrics imports only the declared surface (§16 I-12)", () => {
  // `@/db/client` (type-only `AppDb`) is the same infrastructure import
  // every server service in this codebase uses for its function
  // signatures (`server/strength/service.ts`, `server/volume/service.ts`)
  // — not a meaningful boundary reach.
  const ALLOWED_SERVER_PREFIXES = [
    "@/server/volume/service",
    "@/server/time/userLocalDate",
    "@/db/schema",
    "@/db/client",
    "@/domain/",
  ];

  it("every @/ specifier used by src/server/metrics starts with an allowed prefix", () => {
    for (const file of SERVER_METRICS_FILES) {
      const specifiers = extractModuleSpecifiers(readFileSync(file, "utf8"), file)
        .map((s) => s.text)
        .filter((text) => text.startsWith("@/"));
      for (const specifier of specifiers) {
        expect(
          ALLOWED_SERVER_PREFIXES.some(
            (prefix) => specifier === prefix || specifier.startsWith(prefix),
          ),
          `${path.relative(SRC_ROOT, file)} imports ${specifier}, outside the declared server/metrics surface`,
        ).toBe(true);
      }
    }
  });

  it("imports getWeeklyVolumeReport only from @/server/volume/service, never a wider surface", () => {
    for (const file of SERVER_METRICS_FILES) {
      const source = codeOnly(file);
      if (source.includes("@/server/volume/service")) {
        expect(source).toContain("getWeeklyVolumeReport");
      }
    }
  });
});

describe("no metrics file reaches bodyweight/recovery service logic (I-7, the six-directory rule)", () => {
  const FORBIDDEN_DIRS = [
    path.join(SRC_ROOT, "domain", "bodyweight"),
    path.join(SRC_ROOT, "domain", "recovery"),
    path.join(SRC_ROOT, "server", "bodyweight"),
    path.join(SRC_ROOT, "server", "recovery"),
    path.join(SRC_ROOT, "ui", "bodyweight"),
    path.join(SRC_ROOT, "ui", "recovery"),
  ];

  it("reads bodyweight/recovery rows through the @/db/schema barrel only — no service import anywhere in the feature", () => {
    const { visited, reachedFrom } = walkImportGraph([
      ...DOMAIN_METRICS_FILES,
      ...SERVER_METRICS_FILES,
      ...UI_METRICS_FILES,
      ...API_METRICS_FILES,
      ...PAGE_METRICS_FILES,
    ]);
    const offenders = [...visited].filter((file) => FORBIDDEN_DIRS.some((dir) => under(file, dir)));
    if (offenders.length > 0)
      throw new Error(offenders.map((file) => traceTo(reachedFrom, file)).join("\n"));
    expect(offenders).toEqual([]);
  });

  it("a synthetic edge from server/metrics/service.ts into server/recovery/service.ts is detected as forbidden", () => {
    const { visited } = walkImportGraph(SERVER_METRICS_FILES, {
      extraEdges: [
        {
          from: path.join(SERVER_METRICS, "service.ts"),
          to: path.join(SRC_ROOT, "server", "recovery", "service.ts"),
        },
      ],
    });
    expect([...visited]).toContain(path.join(SRC_ROOT, "server", "recovery", "service.ts"));
  });
});

describe("nothing about the FIVE dashboard metrics is persisted (I-2, A-21)", () => {
  // Scoped to declared column names only (schema builders and migration
  // DDL) — never table names, per OM-1: a table-name pattern such as
  // `/dashboard/i` would fire on the very table O-3 requires.
  const COLUMN_PATTERNS = [
    /tonnage/i,
    /work_?sets?/i,
    /sessions?_(per|count)/i,
    /(rolling|seven_day|thirty_day|avg|average|mean)_/i,
    /e1rm_?(kg|value)/i,
    /snapshot_(kg|count)/i,
  ];

  function schemaColumnDeclarations(): string {
    const schemaFiles = listSourceFiles(path.join(SRC_ROOT, "db", "schema"));
    return schemaFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  }

  function migrationDdl(): string {
    const migrationDir = path.join(SRC_ROOT, "..", "drizzle");
    const migrationFiles = readdirSync(migrationDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => path.join(migrationDir, name));
    expect(migrationFiles.length).toBeGreaterThan(10);
    return migrationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  }

  it("declares no column matching any derived-aggregate pattern, on the schema AFTER migration 0012", () => {
    const combined = `${schemaColumnDeclarations()}\n${migrationDdl()}`;
    for (const pattern of COLUMN_PATTERNS) {
      expect(pattern.test(combined), `schema/migrations match ${pattern}`).toBe(false);
    }
  });

  it("the pattern set is capable of firing (anti-vacuity witness)", () => {
    expect(COLUMN_PATTERNS.some((pattern) => pattern.test('numeric("tonnage_kg")'))).toBe(true);
    expect(COLUMN_PATTERNS.some((pattern) => pattern.test('numeric("seven_day_avg_kg")'))).toBe(
      true,
    );
    expect(COLUMN_PATTERNS.some((pattern) => pattern.test('numeric("e1rm_kg")'))).toBe(true);
  });

  it("adds exactly one new table, holding only (user_id, exercise_id, position, created_at, updated_at)", () => {
    const schema = readFileSync(
      path.join(SRC_ROOT, "db", "schema", "dashboardEstimateSelections.ts"),
      "utf8",
    );
    expect(schema).toContain('pgTable(\n  "dashboard_estimate_selections"');
    for (const column of [
      '"user_id"',
      '"exercise_id"',
      '"position"',
      '"created_at"',
      '"updated_at"',
    ]) {
      expect(schema).toContain(column);
    }
    // NEGATIVE CONTROL: no estimate, name, or eligibility flag column.
    expect(schema).not.toContain('"name"');
    expect(schema).not.toContain('"equipment"');
    expect(schema).not.toContain('"e1rm');
  });
});

describe("synthetic-edge regression controls", () => {
  it("catches a forbidden edge from the pure module into progression", () => {
    const from = path.join(DOMAIN_METRICS, "training.ts");
    const to = path.join(DOMAIN_PROGRESSION, "loadHelpers.ts");
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(true);
    const extraEdges: SyntheticEdge[] = [{ from, to }];
    const { visited } = walkImportGraph(DOMAIN_METRICS_FILES, { extraEdges });
    const offenders = [...visited].filter((file) => !under(file, DOMAIN_METRICS));
    expect(offenders).toContain(to);
  });

  it("catches a forbidden edge from the server service into the progression engine", () => {
    const from = path.join(SERVER_METRICS, "service.ts");
    const to = path.join(DOMAIN_PROGRESSION, "evaluateSession.ts");
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(true);
    const { visited } = walkImportGraph(SERVER_METRICS_FILES, { extraEdges: [{ from, to }] });
    expect([...visited]).toContain(to);
  });

  it("catches a forbidden edge from progression back into the pure module", () => {
    const from = path.join(DOMAIN_PROGRESSION, "carryForward.ts");
    const to = path.join(DOMAIN_METRICS, "estimateIndex.ts");
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(true);
    const { visited } = walkImportGraph(listSourceFiles(DOMAIN_PROGRESSION), {
      extraEdges: [{ from, to }],
    });
    expect([...visited].filter((file) => under(file, DOMAIN_METRICS))).toContain(to);
  });
});

describe("negative control — the walker detects real edges elsewhere", () => {
  it("sees the API route's real edge into the server service", () => {
    const { visited } = walkImportGraph(API_METRICS_FILES);
    expect([...visited].filter((file) => under(file, SERVER_METRICS)).length).toBeGreaterThan(0);
    expect([...visited].filter((file) => under(file, DOMAIN_METRICS)).length).toBeGreaterThan(0);
  });
});

describe("copy scanner naming rule (§20 step 1)", () => {
  it("no identifier, component name, prop or JSX attribute in src/ui/metrics/** contains a source-scoped banned substring", () => {
    const BANNED_IN_IDENTIFIERS = [
      "recommend",
      "research",
      "predict",
      "improv",
      "declin",
      "streak",
      "adherence",
      "compliance",
      "correlat",
    ];
    for (const file of UI_METRICS_FILES) {
      const sourceFile = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const identifiers: string[] = [];
      function visit(node: ts.Node) {
        if (ts.isIdentifier(node)) identifiers.push(node.text);
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
      for (const identifier of identifiers) {
        for (const banned of BANNED_IN_IDENTIFIERS) {
          expect(
            identifier.toLowerCase().includes(banned),
            `${path.relative(SRC_ROOT, file)}: identifier "${identifier}" contains banned substring "${banned}"`,
          ).toBe(false);
        }
      }
    }
  });
});
