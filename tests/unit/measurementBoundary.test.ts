import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC_ROOT, extractModuleSpecifiers, traceTo, walkImportGraph } from "./importGraphWalker";
import type { SyntheticEdge } from "./importGraphWalker";

// Binding source: docs/reviews/athletic-measurement-profiles-architecture-
// evaluation.md I-10 — "`src/domain/measurement/**` imports nothing outside
// itself; `domain/strength`, `domain/progression`, `domain/volume`,
// `domain/metrics` may import it; it may not import any of them. The three
// boundary tests are extended accordingly." Follows the established
// template (`strengthBoundary.test.ts`, `metricsBoundary.test.ts`): a
// discovered inventory, a completeness guard, anti-vacuity witnesses, and a
// synthetic-edge negative control proving the check is load-bearing.

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

function codeOnly(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const DOMAIN_MEASUREMENT = path.join(SRC_ROOT, "domain", "measurement");
const PROFILE_FILE = path.join(DOMAIN_MEASUREMENT, "profile.ts");
const COMPATIBILITY_FILE = path.join(DOMAIN_MEASUREMENT, "compatibility.ts");
const CAPABILITIES_FILE = path.join(DOMAIN_MEASUREMENT, "capabilities.ts");
const FORMAT_FILE = path.join(DOMAIN_MEASUREMENT, "format.ts");

const DOMAIN_STRENGTH = path.join(SRC_ROOT, "domain", "strength");
const DOMAIN_PROGRESSION = path.join(SRC_ROOT, "domain", "progression");
const DOMAIN_VOLUME = path.join(SRC_ROOT, "domain", "volume");
const DOMAIN_METRICS = path.join(SRC_ROOT, "domain", "metrics");

// Discovered inventory — a new measurement file cannot land outside these
// four and silently escape every claim below (the warm-up template's
// MEDIUM-2 guard, `strengthBoundary.test.ts`'s "accounts for every
// discovered ... file").
const ALL_MEASUREMENT_FILES = listSourceFiles(DOMAIN_MEASUREMENT).sort();

describe("the scan itself runs (anti-vacuity)", () => {
  it("found this stage's four files", () => {
    expect(ALL_MEASUREMENT_FILES.length).toBe(4);
    for (const file of [PROFILE_FILE, COMPATIBILITY_FILE, CAPABILITIES_FILE, FORMAT_FILE]) {
      expect(existsSync(file), path.relative(SRC_ROOT, file)).toBe(true);
    }
  });

  it("accounts for every discovered measurement file", () => {
    const accounted = new Set([PROFILE_FILE, COMPATIBILITY_FILE, CAPABILITIES_FILE, FORMAT_FILE]);
    const unaccounted = ALL_MEASUREMENT_FILES.filter((file) => !accounted.has(file));
    expect(
      unaccounted.map((file) => path.relative(SRC_ROOT, file)),
      "a measurement file exists outside this suite's known inventory — add it to a claim above",
    ).toEqual([]);
  });
});

describe("(a) profile.ts imports nothing at all (I-10's strictest leaf)", () => {
  it("has zero module specifiers of any kind", () => {
    expect(extractModuleSpecifiers(readFileSync(PROFILE_FILE, "utf8"))).toEqual([]);
  });

  it("is not vacuously empty — it actually declares the vocabulary", () => {
    // NEGATIVE CONTROL for the check above: a file that could never pass it.
    expect(
      extractModuleSpecifiers(`import { z } from "zod";\nexport const x = z.string();\n`),
    ).not.toEqual([]);
    expect(codeOnly(PROFILE_FILE)).toContain("MEASUREMENT_PROFILES");
  });
});

describe("(b) compatibility.ts and capabilities.ts reach only within src/domain/measurement/**", () => {
  it("the whole module's transitive closure never leaves its own directory", () => {
    const { visited, reachedFrom, allParents } = walkImportGraph(ALL_MEASUREMENT_FILES);
    // Witness real transitivity: capabilities.ts -> compatibility.ts -> profile.ts.
    expect(visited.has(COMPATIBILITY_FILE)).toBe(true);
    expect(visited.has(PROFILE_FILE)).toBe(true);
    expect(allParents.get(COMPATIBILITY_FILE)?.has(CAPABILITIES_FILE)).toBe(true);
    expect(allParents.get(PROFILE_FILE)?.has(COMPATIBILITY_FILE)).toBe(true);

    const offenders = [...visited].filter((file) => !under(file, DOMAIN_MEASUREMENT));
    if (offenders.length > 0) {
      throw new Error(
        `src/domain/measurement reaches outside itself:\n${offenders
          .map((file) => traceTo(reachedFrom, file))
          .join("\n")}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("never reaches domain/strength, domain/progression, domain/volume or domain/metrics (I-10's stated direction)", () => {
    const { visited } = walkImportGraph(ALL_MEASUREMENT_FILES);
    const offenders = [...visited].filter(
      (file) =>
        under(file, DOMAIN_STRENGTH) ||
        under(file, DOMAIN_PROGRESSION) ||
        under(file, DOMAIN_VOLUME) ||
        under(file, DOMAIN_METRICS),
    );
    expect(offenders.map((file) => path.relative(SRC_ROOT, file))).toEqual([]);
  });
});

describe("(c) negative control — the walker catches a forbidden edge if one existed", () => {
  it("a synthetic edge from capabilities.ts into domain/strength is detected as leaving the module", () => {
    const to = path.join(DOMAIN_STRENGTH, "estimateMode.ts");
    expect(existsSync(to)).toBe(true);
    const extraEdges: SyntheticEdge[] = [{ from: CAPABILITIES_FILE, to }];
    const { visited } = walkImportGraph(ALL_MEASUREMENT_FILES, { extraEdges });
    const offenders = [...visited].filter((file) => !under(file, DOMAIN_MEASUREMENT));
    expect(offenders).toContain(to);
  });

  it("a synthetic edge from profile.ts into compatibility.ts (a real sibling) does NOT trip the self-containment check", () => {
    // Sanity that (b)'s check is about leaving src/domain/measurement, not
    // about which file imports which sibling — profile.ts importing a
    // sibling would violate I-10's "profile.ts imports nothing outside
    // itself" separately (test (a) above), but would not itself be an
    // outside reach.
    const extraEdges: SyntheticEdge[] = [{ from: PROFILE_FILE, to: COMPATIBILITY_FILE }];
    const { visited } = walkImportGraph(ALL_MEASUREMENT_FILES, { extraEdges });
    const offenders = [...visited].filter((file) => !under(file, DOMAIN_MEASUREMENT));
    expect(offenders).toEqual([]);
  });

  it("would notice if profile.ts itself started importing something (closing (a) the same way)", () => {
    // Injected as source text rather than a real file, since profile.ts must
    // never legitimately import anything (I-10).
    const specs = extractModuleSpecifiers(
      `import { z } from "zod";\n${readFileSync(PROFILE_FILE, "utf8")}`,
    );
    expect(specs.map((s) => s.text)).toContain("zod");
  });
});
