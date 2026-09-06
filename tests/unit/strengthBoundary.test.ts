import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SRC_ROOT, extractModuleSpecifiers, traceTo, walkImportGraph } from "./importGraphWalker";
import type { SyntheticEdge } from "./importGraphWalker";

// Binding source: docs/reviews/estimated-1rm-load-translation-architecture-revision.md
// §14.2, §14.5 and acceptance criterion A-27, plus invariants I-1, I-2, I-3.
//
// Why a test and not ESLint: `eslint-plugin-boundaries` models LAYERS, and its
// rule `{ from: "server", allow: ["domain", "db", "server"] }` happily permits
// `src/server/strength/**` to import `evaluateSession`. The claims below are
// FEATURE-level ("this feature cannot reach that one"), which the layer model
// cannot express — the same reason `progressionBoundary.test.ts` and
// `warmupBoundary.test.ts` exist. This file follows their evolved template:
// a discovered inventory rather than hand-listed directories, a completeness
// guard, anti-vacuity witnesses, a negative control, and synthetic-edge
// regression controls that prove the check fires for an injected edge without
// ever writing that edge to a real file.

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

const DOMAIN_STRENGTH = path.join(SRC_ROOT, "domain", "strength");
const DOMAIN_SCHEMES = path.join(SRC_ROOT, "domain", "schemes");
const DOMAIN_PROGRESSION = path.join(SRC_ROOT, "domain", "progression");
const DOMAIN_VOLUME = path.join(SRC_ROOT, "domain", "volume");
const DOMAIN_SYNC = path.join(SRC_ROOT, "domain", "sync");
const SERVER_STRENGTH = path.join(SRC_ROOT, "server", "strength");
const SERVER_PROGRESSION = path.join(SRC_ROOT, "server", "progression");
const SERVER_VOLUME = path.join(SRC_ROOT, "server", "volume");
const SERVER_SYNC = path.join(SRC_ROOT, "server", "sync");
const UI_STRENGTH = path.join(SRC_ROOT, "ui", "strength");
const API_STRENGTH = path.join(SRC_ROOT, "app", "api", "exercises", "[id]", "strength");

const PAGE_STRENGTH = path.join(SRC_ROOT, "app", "(app)", "exercises", "[id]", "strength");
const DB_SCHEMA = path.join(SRC_ROOT, "db", "schema");

// The ADR-011 seed reconcile (ADR-010's mechanism, applied to
// `exercises.strength_estimate`). It names the feature but is deploy-time
// seed code, not part of the read pipeline, so it gets its own claim below
// rather than joining the five feature directories.
const SEED_RECONCILE = path.join(SRC_ROOT, "db", "seed", "reconcileStrengthEstimates.ts");

const DOMAIN_STRENGTH_FILES = listSourceFiles(DOMAIN_STRENGTH);
const SERVER_STRENGTH_FILES = listSourceFiles(SERVER_STRENGTH);
const UI_STRENGTH_FILES = listSourceFiles(UI_STRENGTH);
const API_STRENGTH_FILES = listSourceFiles(API_STRENGTH);
const PAGE_STRENGTH_FILES = listSourceFiles(PAGE_STRENGTH);

// Comments explain the rules and therefore quote the very symbols the rules
// forbid; the claims below are about what the CODE does, so comments are
// stripped before any source-text check.
function codeOnly(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

// An exception is only safe when it is EDGE-specific: the file may be reached
// ONLY through approved parents, checked across the whole graph rather than
// through whichever parent the BFS happened to record first. That distinction
// is `progressionBoundary.test.ts`'s phase-8-review HIGH-2 lesson, and it is
// what stops a genuinely forbidden second edge into the same file from hiding
// behind a legitimate one.
function reachedOnlyVia(
  file: string,
  allParents: Map<string, Set<string>>,
  approved: (parent: string) => boolean,
): boolean {
  const parents = allParents.get(file);
  if (!parents || parents.size === 0) return false;
  return [...parents].every((parent) => approved(parent));
}

// Discovered inventory: every file whose path names this feature, so a new
// strength file cannot land outside the four directories above and escape
// every claim in this file unnoticed (the warm-up template's MEDIUM-2 guard).
const STRENGTH_PATH_PATTERN = /strength/i;
const ALL_STRENGTH_FILES = listSourceFiles(SRC_ROOT)
  .filter((file) => STRENGTH_PATH_PATTERN.test(path.relative(SRC_ROOT, file)))
  .sort();

describe("the scan itself runs (anti-vacuity)", () => {
  it("found the feature's five directories", () => {
    expect(DOMAIN_STRENGTH_FILES.length).toBeGreaterThan(5);
    expect(SERVER_STRENGTH_FILES.length).toBeGreaterThan(0);
    expect(UI_STRENGTH_FILES.length).toBeGreaterThan(3);
    expect(API_STRENGTH_FILES.length).toBe(1);
    expect(PAGE_STRENGTH_FILES.length).toBe(1);
  });

  it("accounts for every discovered strength file", () => {
    const accounted = new Set([
      ...DOMAIN_STRENGTH_FILES,
      ...SERVER_STRENGTH_FILES,
      ...UI_STRENGTH_FILES,
      ...API_STRENGTH_FILES,
      ...PAGE_STRENGTH_FILES,
      SEED_RECONCILE,
    ]);
    const unaccounted = ALL_STRENGTH_FILES.filter((file) => !accounted.has(file));
    expect(
      unaccounted.map((file) => path.relative(SRC_ROOT, file)),
      "a strength file lives outside the four directories this suite walks — add it to a claim or record why it is exempt",
    ).toEqual([]);
  });
});

describe("the seed reconcile is deploy-time only (ADR-011, ADR-010's mechanism)", () => {
  it("exists, and lives under src/db/seed rather than in the feature", () => {
    expect(existsSync(SEED_RECONCILE)).toBe(true);
    expect(under(SEED_RECONCILE, path.join(SRC_ROOT, "db", "seed"))).toBe(true);
  });

  it("keys on the deterministic seeded id and never on a mutable name", () => {
    // ADR-010, verbatim: "A SQL migration cannot safely select renamed seeded
    // exercises: slugs are not stored, names are mutable ... Both name
    // matching and pgcrypto are rejected." This asserts the successor
    // reconcile obeys the same ruling.
    const source = codeOnly(SEED_RECONCILE);
    expect(source).toContain("seededExerciseId");
    expect(source).toContain("exercises.isSeeded");
    // NEGATIVE CONTROL for the ruling: no predicate on `name`, and no
    // catalog display name embedded as a literal.
    expect(source).not.toContain("exercises.name");
    expect(source).not.toContain("Assisted Pull-Up");
    expect(source).not.toContain("Farmer");
  });

  it("touches only the opt-out column, never the estimate pipeline", () => {
    const { visited } = walkImportGraph([SEED_RECONCILE]);
    const reached = [...visited].filter(
      (file) => under(file, DOMAIN_STRENGTH) || under(file, SERVER_STRENGTH),
    );
    // The vocabulary module only — no primitives, no observation, no estimate.
    expect(reached.map((file) => path.relative(SRC_ROOT, file))).toEqual([
      path.join("domain", "strength", "estimateMode.ts"),
    ]);
  });
});

describe("the pure module is self-contained (§14.5)", () => {
  it("reaches nothing outside src/domain/strength, and does not reach progression at all", () => {
    const { visited, reachedFrom } = walkImportGraph(DOMAIN_STRENGTH_FILES);
    // Witness that the walk really traversed edges rather than stopping at
    // the roots: `report.ts` reaches `observation.ts` reaches `primitives.ts`.
    expect(visited.has(path.join(DOMAIN_STRENGTH, "primitives.ts"))).toBe(true);
    expect(visited.size).toBeGreaterThan(DOMAIN_STRENGTH_FILES.length - 1);

    const offenders = [...visited].filter((file) => !under(file, DOMAIN_STRENGTH));
    if (offenders.length > 0) {
      throw new Error(
        `src/domain/strength reaches outside itself:\n${offenders
          .map((file) => traceTo(reachedFrom, file))
          .join("\n")}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("keeps its one permitted outside allowance type-only, if it is ever used", () => {
    // §14.5 permits TYPE-ONLY imports of `src/domain/schemes/**` (`RirBand`,
    // `SetScheme`). Release A needs neither — `targetReps` and `loadStepKg`
    // arrive as plain data — so the allowance is currently unused. This check
    // asserts both facts: none today, and type-only if one appears.
    const schemeImports: string[] = [];
    for (const file of DOMAIN_STRENGTH_FILES) {
      const source = readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      sourceFile.forEachChild((node) => {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
        const specifier = node.moduleSpecifier.text;
        if (!specifier.startsWith("@/domain/schemes")) return;
        schemeImports.push(path.relative(SRC_ROOT, file));
        expect(
          node.importClause?.isTypeOnly,
          `${path.relative(SRC_ROOT, file)} imports ${specifier} at runtime; §14.5 allows type-only`,
        ).toBe(true);
      });
    }
    expect(schemeImports).toEqual([]);
    expect(existsSync(DOMAIN_SCHEMES)).toBe(true);
  });
});

describe("progression is untouched in both directions (I-3, §14.5)", () => {
  it("src/domain/progression never reaches src/domain/strength", () => {
    const roots = listSourceFiles(DOMAIN_PROGRESSION);
    expect(roots.length).toBeGreaterThan(0);
    const { visited, reachedFrom } = walkImportGraph(roots);
    const offenders = [...visited].filter((file) => under(file, DOMAIN_STRENGTH));
    if (offenders.length > 0) {
      throw new Error(offenders.map((file) => traceTo(reachedFrom, file)).join("\n"));
    }
    expect(offenders).toEqual([]);
  });

  it("src/server/strength never reaches the progression engine", () => {
    // Release A imports nothing progression-related at all. §14.5 will later
    // permit exactly one edge — `carryForward.ts`'s
    // `resolveCarryForwardCandidate`, for Release B's rep basis — and that
    // edge must arrive as a deliberate, documented carve-out here, not as a
    // silent widening.
    const { visited, reachedFrom } = walkImportGraph(SERVER_STRENGTH_FILES);
    expect(visited.has(path.join(SRC_ROOT, "db", "schema", "index.ts"))).toBe(true);
    expect(visited.size).toBeGreaterThan(20);

    const offenders = [...visited].filter(
      (file) => under(file, DOMAIN_PROGRESSION) || under(file, SERVER_PROGRESSION),
    );
    if (offenders.length > 0) {
      throw new Error(offenders.map((file) => traceTo(reachedFrom, file)).join("\n"));
    }
    expect(offenders).toEqual([]);
  });

  it("src/server/strength never reaches the sync transport either (I-1)", () => {
    const { visited } = walkImportGraph(SERVER_STRENGTH_FILES);
    const offenders = [...visited].filter(
      (file) => under(file, DOMAIN_SYNC) || under(file, SERVER_SYNC),
    );
    expect(offenders.map((file) => path.relative(SRC_ROOT, file))).toEqual([]);
  });

  it("names the forbidden engine entry points explicitly", () => {
    // A-27 spells out three symbols. Reaching them transitively is already
    // covered above; this is the direct, readable form of the same claim.
    const sources = [...SERVER_STRENGTH_FILES, ...API_STRENGTH_FILES].map(codeOnly);
    expect(sources.length).toBeGreaterThan(1);
    for (const symbol of ["evaluateSession", "loadProgression", "repProgression"]) {
      for (const source of sources) {
        expect(source.includes(symbol), `${symbol} appears in strength server code`).toBe(false);
      }
    }
    // NEGATIVE CONTROL: `codeOnly` must strip comments, not code. If it
    // stripped everything, the loop above would pass vacuously.
    expect(codeOnly(path.join(SERVER_STRENGTH, "service.ts"))).toContain(
      "getExerciseStrengthReport",
    );
    expect(codeOnly(path.join(SERVER_STRENGTH, "service.ts"))).not.toContain("evaluateSession");
  });
});

describe("volume and strength are unrelated in both directions (§14.2)", () => {
  // Two shared-VOCABULARY files sit between the features, both reached only
  // through table declarations and neither carrying any computation:
  //
  //   * `domain/volume/schema.ts` — the strength service imports the
  //     `@/db/schema` barrel for four fact tables; the barrel also declares
  //     `volume_presets`, whose CHECK constraint reads that file's
  //     `VOLUME_PRESET_CLASSIFICATIONS`. This is the "shared registry, not a
  //     read path" shape `progressionBoundary.test.ts` already carves out for
  //     the same barrel.
  //   * `domain/strength/estimateMode.ts` — the `'auto' | 'off'` vocabulary
  //     of the new `exercises.strength_estimate` column. Volume reaches it
  //     because `domain/volume/aggregate.ts` imports `ContributionRole` from
  //     the exercises aggregate schema, which declares the column's Zod enum.
  //     It is a two-line const array with no imports of its own; it lives
  //     under `domain/strength/` only because §14.5 forbids the pure strength
  //     module from importing `domain/exercises/**`.
  //
  // Both carve-outs are EDGE-specific: a second, genuinely forbidden edge
  // into either file still fails, whichever parent the BFS reaches first.
  const VOLUME_VOCABULARY = path.join(DOMAIN_VOLUME, "schema.ts");
  const STRENGTH_VOCABULARY = path.join(DOMAIN_STRENGTH, "estimateMode.ts");
  const STRENGTH_VOCABULARY_PARENTS = new Set([
    path.join(SRC_ROOT, "domain", "exercises", "schema.ts"),
    path.join(DB_SCHEMA, "exercises.ts"),
    path.join(SRC_ROOT, "db", "seed", "exercises.ts"),
    path.join(SRC_ROOT, "db", "seed", "exerciseCatalog.ts"),
  ]);

  it("strength reaches nothing in volume but the preset vocabulary the schema barrel needs", () => {
    const { visited, allParents } = walkImportGraph([
      ...DOMAIN_STRENGTH_FILES,
      ...SERVER_STRENGTH_FILES,
    ]);
    const offenders = [...visited]
      .filter((file) => under(file, DOMAIN_VOLUME) || under(file, SERVER_VOLUME))
      .filter(
        (file) =>
          !(
            file === VOLUME_VOCABULARY &&
            reachedOnlyVia(file, allParents, (parent) => under(parent, DB_SCHEMA))
          ),
      );
    expect(offenders.map((file) => path.relative(SRC_ROOT, file))).toEqual([]);
    expect(visited.has(VOLUME_VOCABULARY)).toBe(true);
  });

  it("volume reaches nothing in strength but the column's value vocabulary", () => {
    const { visited, allParents } = walkImportGraph([
      ...listSourceFiles(DOMAIN_VOLUME),
      ...listSourceFiles(SERVER_VOLUME),
    ]);
    const offenders = [...visited]
      .filter((file) => under(file, DOMAIN_STRENGTH) || under(file, SERVER_STRENGTH))
      .filter(
        (file) =>
          !(
            file === STRENGTH_VOCABULARY &&
            reachedOnlyVia(
              file,
              allParents,
              (parent) => STRENGTH_VOCABULARY_PARENTS.has(parent) || under(parent, DOMAIN_STRENGTH),
            )
          ),
      );
    expect(offenders.map((file) => path.relative(SRC_ROOT, file))).toEqual([]);
  });

  it("the vocabulary carve-out does not hide a real edge", () => {
    // NEGATIVE CONTROL: inject an edge from volume's aggregate into the
    // strength pipeline itself and into the vocabulary file from a
    // non-approved parent. Both must be reported.
    const volumeAggregate = path.join(DOMAIN_VOLUME, "aggregate.ts");
    const { visited, allParents } = walkImportGraph(listSourceFiles(DOMAIN_VOLUME), {
      extraEdges: [
        { from: volumeAggregate, to: path.join(DOMAIN_STRENGTH, "estimate.ts") },
        { from: volumeAggregate, to: STRENGTH_VOCABULARY },
      ],
    });
    expect([...visited]).toContain(path.join(DOMAIN_STRENGTH, "estimate.ts"));
    expect(
      reachedOnlyVia(
        STRENGTH_VOCABULARY,
        allParents,
        (parent) => STRENGTH_VOCABULARY_PARENTS.has(parent) || under(parent, DOMAIN_STRENGTH),
      ),
    ).toBe(false);
  });

  it("the shared vocabulary really is a leaf with no imports of its own", () => {
    expect(extractModuleSpecifiers(readFileSync(STRENGTH_VOCABULARY, "utf8"))).toEqual([]);
    expect(codeOnly(STRENGTH_VOCABULARY)).not.toContain("function");
  });
});

describe("completing a workout never touches this feature (A-21, N-5)", () => {
  // A-21 asks for a query log proving the strength service performs no read
  // or write when a session completes. The stronger, deterministic form of
  // the same claim is that the completion path cannot REACH the service at
  // all: if no code on that path imports it, no query of its can be issued.
  const COMPLETION_ROOTS = [
    path.join(SRC_ROOT, "app", "api", "sync", "route.ts"),
    path.join(SRC_ROOT, "app", "api", "active-session", "route.ts"),
    path.join(SRC_ROOT, "app", "api", "today-bundle", "route.ts"),
    path.join(SERVER_SYNC, "service.ts"),
    path.join(SRC_ROOT, "server", "today", "service.ts"),
  ];

  const STRENGTH_VOCABULARY = path.join(DOMAIN_STRENGTH, "estimateMode.ts");
  const VOCABULARY_PARENTS = new Set([
    path.join(SRC_ROOT, "domain", "exercises", "schema.ts"),
    path.join(DB_SCHEMA, "exercises.ts"),
    path.join(SRC_ROOT, "db", "seed", "exercises.ts"),
    path.join(SRC_ROOT, "db", "seed", "exerciseCatalog.ts"),
  ]);

  it("the whole completion path exists and is walkable", () => {
    for (const root of COMPLETION_ROOTS) {
      expect(existsSync(root), `expected root to exist: ${root}`).toBe(true);
    }
    const { visited } = walkImportGraph(COMPLETION_ROOTS);
    expect(visited.size).toBeGreaterThan(40);
    expect(visited.has(path.join(SERVER_SYNC, "service.ts"))).toBe(true);
  });

  it("reaches no strength code but the column's value vocabulary", () => {
    const { visited, allParents, reachedFrom } = walkImportGraph(COMPLETION_ROOTS);
    const offenders = [...visited]
      .filter(
        (file) =>
          under(file, DOMAIN_STRENGTH) || under(file, SERVER_STRENGTH) || under(file, UI_STRENGTH),
      )
      .filter(
        (file) =>
          !(
            file === STRENGTH_VOCABULARY &&
            reachedOnlyVia(file, allParents, (parent) => VOCABULARY_PARENTS.has(parent))
          ),
      );
    if (offenders.length > 0) {
      throw new Error(offenders.map((file) => traceTo(reachedFrom, file)).join("\n"));
    }
    expect(offenders).toEqual([]);
  });

  it("would notice if the sync service started importing the strength service", () => {
    // NEGATIVE CONTROL, injected rather than written: a real import here
    // would mean a completed workout could trigger an estimate read.
    const { visited } = walkImportGraph(COMPLETION_ROOTS, {
      extraEdges: [
        {
          from: path.join(SERVER_SYNC, "service.ts"),
          to: path.join(SERVER_STRENGTH, "service.ts"),
        },
      ],
    });
    expect([...visited].filter((file) => under(file, SERVER_STRENGTH))).toContain(
      path.join(SERVER_STRENGTH, "service.ts"),
    );
  });
});

describe("the feature reads recommendations for nothing (I-2, V-23)", () => {
  it("src/server/strength never queries the recommendations table", () => {
    // §14.5: the strength service must not determine pendingness from its own
    // query. In Release A it has no reason to read the table at all, and
    // `deriveStrengthReport` has no input that could carry one.
    for (const file of SERVER_STRENGTH_FILES) {
      expect(codeOnly(file).includes("recommendations"), path.relative(SRC_ROOT, file)).toBe(false);
    }
    // NEGATIVE CONTROL: the same check over a file that genuinely does read
    // the table must fire, proving the assertion above is not vacuous.
    expect(codeOnly(path.join(SERVER_PROGRESSION, "service.ts")).includes("recommendations")).toBe(
      true,
    );
  });
});

describe("nothing about this feature is persisted (I-1, A-27)", () => {
  const COLUMN_PATTERNS = [
    /e1rm/i,
    /estimated_?1rm/i,
    /strength_?estimate_?(value|kg)/i,
    /starting_?suggestion/i,
    /suggested_?load/i,
    /strength_?confidence/i,
  ];

  it("declares no column storing an estimate, a suggestion or a confidence", () => {
    const schemaFiles = listSourceFiles(path.join(SRC_ROOT, "db", "schema"));
    const migrationDir = path.join(SRC_ROOT, "..", "drizzle");
    const migrationFiles = readdirSync(migrationDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => path.join(migrationDir, name));
    expect(schemaFiles.length).toBeGreaterThan(20);
    expect(migrationFiles.length).toBeGreaterThan(10);

    for (const file of [...schemaFiles, ...migrationFiles]) {
      const source = readFileSync(file, "utf8");
      for (const pattern of COLUMN_PATTERNS) {
        expect(pattern.test(source), `${path.relative(SRC_ROOT, file)} matches ${pattern}`).toBe(
          false,
        );
      }
    }
  });

  it("adds exactly one exercises column, and it is the opt-out switch", () => {
    const schema = readFileSync(path.join(SRC_ROOT, "db", "schema", "exercises.ts"), "utf8");
    expect(schema).toContain('text("strength_estimate")');
    expect(schema).toContain("ck_exercises_strength_estimate");
    // NEGATIVE CONTROL for the pattern list above: it must be capable of
    // firing. A column literally named `e1rm_kg` would be caught.
    expect(COLUMN_PATTERNS.some((pattern) => pattern.test('numeric("e1rm_kg")'))).toBe(true);
  });
});

describe("synthetic-edge regression controls", () => {
  // These inject an edge that must never exist in real source and assert the
  // corresponding check fires — proving the clean results above are
  // meaningful rather than an accident of what the walker happens to resolve.
  it("catches a forbidden edge from the pure module into progression", () => {
    const from = path.join(DOMAIN_STRENGTH, "report.ts");
    const to = path.join(DOMAIN_PROGRESSION, "loadHelpers.ts");
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(true);
    const extraEdges: SyntheticEdge[] = [{ from, to }];
    const { visited } = walkImportGraph(DOMAIN_STRENGTH_FILES, { extraEdges });
    const offenders = [...visited].filter((file) => !under(file, DOMAIN_STRENGTH));
    expect(offenders).toContain(to);
  });

  it("catches a forbidden edge from the server service into the progression engine", () => {
    const from = path.join(SERVER_STRENGTH, "service.ts");
    const to = path.join(DOMAIN_PROGRESSION, "evaluateSession.ts");
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(true);
    const { visited } = walkImportGraph(SERVER_STRENGTH_FILES, {
      extraEdges: [{ from, to }],
    });
    const offenders = [...visited].filter(
      (file) => under(file, DOMAIN_PROGRESSION) || under(file, SERVER_PROGRESSION),
    );
    expect(offenders).toContain(to);
  });

  it("catches a forbidden edge from progression back into the pure module", () => {
    const from = path.join(DOMAIN_PROGRESSION, "carryForward.ts");
    const to = path.join(DOMAIN_STRENGTH, "estimate.ts");
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(true);
    const { visited } = walkImportGraph(listSourceFiles(DOMAIN_PROGRESSION), {
      extraEdges: [{ from, to }],
    });
    expect([...visited].filter((file) => under(file, DOMAIN_STRENGTH))).toContain(to);
  });

  it("catches a forbidden edge from volume into strength", () => {
    const from = path.join(SERVER_VOLUME, "service.ts");
    const to = path.join(DOMAIN_STRENGTH, "constants.ts");
    const { visited } = walkImportGraph(listSourceFiles(SERVER_VOLUME), {
      extraEdges: [{ from, to }],
    });
    expect([...visited].filter((file) => under(file, DOMAIN_STRENGTH))).toContain(to);
  });
});

describe("negative control — the walker detects real edges elsewhere", () => {
  it("sees the API route's real edge into the server service", () => {
    // A known-positive case with no synthetic edge at all: if the walker were
    // silently failing to resolve anything, this would come back empty.
    const { visited } = walkImportGraph(API_STRENGTH_FILES);
    expect([...visited].filter((file) => under(file, SERVER_STRENGTH)).length).toBeGreaterThan(0);
    expect([...visited].filter((file) => under(file, DOMAIN_STRENGTH)).length).toBeGreaterThan(0);
  });

  it("resolves the specifier spellings this feature actually uses", () => {
    expect(
      extractModuleSpecifiers(
        `import { deriveStrengthReport } from "@/domain/strength/report";`,
      ).map((s) => s.text),
    ).toContain("@/domain/strength/report");
    expect(
      extractModuleSpecifiers(
        `import type {\n  StrengthReport,\n} from "@/domain/strength/types";`,
      ).map((s) => s.text),
    ).toContain("@/domain/strength/types");
  });
});
