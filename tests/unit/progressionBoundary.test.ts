import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC_ROOT, extractModuleSpecifiers, traceTo, walkImportGraph } from "./importGraphWalker";
import type { SyntheticEdge } from "./importGraphWalker";

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

const FORBIDDEN_DIRS = [
  path.join(SRC_ROOT, "domain", "bodyweight"),
  path.join(SRC_ROOT, "domain", "recovery"),
  path.join(SRC_ROOT, "server", "bodyweight"),
  path.join(SRC_ROOT, "server", "recovery"),
  path.join(SRC_ROOT, "ui", "bodyweight"),
  path.join(SRC_ROOT, "ui", "recovery"),
];

function isForbidden(file: string): boolean {
  return FORBIDDEN_DIRS.some((dir) => file === dir || file.startsWith(dir + path.sep));
}

// Phase 8 — bodyweight/recovery quick-logs joined the offline outbox
// (pwa-offline-strategy.md §2 capability matrix), so `app/api/sync/route.ts`
// (a root above, as a place progression evaluation gets triggered) now also
// legitimately reaches these four files as plain sync-transport
// co-location — the same "shared registry, not a read path" shape already
// carved out for `db/schema/index.ts` above, just one layer further in.
// `server/bodyweight/service.ts`/`server/recovery/service.ts` have no
// import of anything progression-related (verified directly: they import
// only `@/db/schema`, `@/domain/ids/uuidv7`, their own domain schema, and
// `@/server/time/userLocalDate`), and the two domain schema files are pure
// leaf Zod schemas. This is not a blind allowlist: the check below still
// requires EVERY edge into one of these four files — not just the first one
// the BFS happened to record — to come from the sync transport
// (`domain/sync/schema.ts` or `server/sync/service.ts`). A forbidden edge
// arriving by any OTHER path (progression code itself, volume, history, a
// barrel, or a future new file), whether discovered before or after the
// legitimate transport edge, still fails.
//
// phase-8-review.md HIGH-2 — this used to check only `reachedFrom`'s single
// first-recorded parent, so once any of these four files was first reached
// via the sync transport (an accident of BFS queue order — which root gets
// walked first, which of a file's several imports gets visited first), a
// second, genuinely forbidden edge into the SAME file from anywhere else
// was invisible: the check never looked past that first parent. Checking
// every recorded parent (`allParents`, tests/unit/importGraphWalker.ts)
// makes this edge-specific and immune to traversal order — see the
// "closes HIGH-2's exact bypasses" describe block below for the reviewer's
// two concrete cases this now catches.
const SYNC_TRANSPORT_EXCEPTIONS = [
  path.join(SRC_ROOT, "domain", "bodyweight", "schema.ts"),
  path.join(SRC_ROOT, "domain", "recovery", "schema.ts"),
  path.join(SRC_ROOT, "server", "bodyweight", "service.ts"),
  path.join(SRC_ROOT, "server", "recovery", "service.ts"),
];
const SYNC_TRANSPORT_FILES = [
  path.join(SRC_ROOT, "domain", "sync", "schema.ts"),
  path.join(SRC_ROOT, "server", "sync", "service.ts"),
];

// The two real transport files, plus the four exception files themselves —
// `domain/recovery/schema.ts` genuinely (and harmlessly) imports a shared
// `dateOnlySchema` straight from `domain/bodyweight/schema.ts`, and
// `server/bodyweight/service.ts` imports its own domain schema types, so
// intra-cluster edges between these six co-located files are expected, not
// a bypass. A parent from ANYWHERE else — progression, volume, history, a
// barrel, or a future new file — is still rejected.
const APPROVED_SYNC_TRANSPORT_PARENTS = new Set([
  ...SYNC_TRANSPORT_FILES,
  ...SYNC_TRANSPORT_EXCEPTIONS,
]);

function isSyncTransportException(file: string, allParents: Map<string, Set<string>>): boolean {
  if (!SYNC_TRANSPORT_EXCEPTIONS.includes(file)) return false;
  const parents = allParents.get(file);
  if (!parents || parents.size === 0) return false;
  return [...parents].every((parent) => APPROVED_SYNC_TRANSPORT_PARENTS.has(parent));
}

// implementation-plan.md Phase 7 / mvp-scope.md F10 — "a code-level check
// confirms no engine input path reads these tables"; evidence-to-design.md
// #14 / EVIDENCE-027 — recovery/bodyweight are collection-only, never a
// progression-engine input.
//
// phase-7-review.md HIGH-3 — the previous version of this test filtered
// lines with `/^\s*import\b/` / `/^\s*export\s+\*\s+from/` regexes, which
// misses multi-line imports (this codebase's dominant style under
// Prettier's printWidth), dynamic `import()`, `require(...)`, and named
// `export { x } from` re-exports, and only ever scanned
// `src/domain/progression` itself rather than the actual assembly/
// consumption path. This version walks the *real* transitive import graph
// (tests/unit/importGraphWalker.ts, built on the TypeScript compiler's own
// AST) from every progression domain file plus the named
// assembly/consumption roots the independent review identified
// (`src/server/progression/service.ts` and the API routes that resolve a
// today-bundle, active session, sync batch, history, or volume report —
// each a place an `EvaluationContext` could plausibly be assembled or a
// progression evaluation triggered).
const PROGRESSION_DOMAIN_ROOTS = listSourceFiles(path.join(SRC_ROOT, "domain", "progression"));
const NAMED_ASSEMBLY_ROOTS = [
  path.join(SRC_ROOT, "server", "progression", "service.ts"),
  path.join(SRC_ROOT, "app", "api", "today-bundle", "route.ts"),
  path.join(SRC_ROOT, "app", "api", "active-session", "route.ts"),
  path.join(SRC_ROOT, "app", "api", "sync", "route.ts"),
  path.join(SRC_ROOT, "app", "api", "history", "route.ts"),
  path.join(SRC_ROOT, "app", "api", "volume", "route.ts"),
];
const ROOTS = [...PROGRESSION_DOMAIN_ROOTS, ...NAMED_ASSEMBLY_ROOTS];

describe("progression engine — non-consumption of bodyweight/recovery (Phase 7 boundary)", () => {
  it("found the expected progression source files and named roots (sanity check the scan itself runs)", () => {
    expect(PROGRESSION_DOMAIN_ROOTS.length).toBeGreaterThan(0);
    for (const root of NAMED_ASSEMBLY_ROOTS) {
      expect(existsSync(root), `expected root to exist: ${root}`).toBe(true);
    }
  });

  it("the real progression/server assembly graph never transitively reaches bodyweight or recovery modules", () => {
    const { visited, reachedFrom, allParents } = walkImportGraph(ROOTS);

    // Sanity: the walk must actually traverse beyond the roots themselves —
    // a resolver bug that silently failed to resolve any edge would make
    // this assertion vacuously true otherwise. The shared `src/db/schema`
    // barrel is a good witness: every progression file that touches the DB
    // reaches it, it re-exports `bodyweightEntries`/`recoveryEntries` (a
    // shared table registry, not a read path — see the review's own
    // finding), and it sits outside every FORBIDDEN_DIRS entry, so this
    // both proves real transitivity and pins down the one legitimate place
    // the new tables are reachable from at all.
    const schemaBarrel = path.join(SRC_ROOT, "db", "schema", "index.ts");
    expect(visited.has(schemaBarrel), "expected the walk to reach src/db/schema/index.ts").toBe(
      true,
    );
    expect(visited.size).toBeGreaterThan(30);

    const offenders = [...visited]
      .filter(isForbidden)
      .filter((f) => !isSyncTransportException(f, allParents));
    if (offenders.length > 0) {
      const traces = offenders.map((f) => traceTo(reachedFrom, f)).join("\n");
      throw new Error(`Forbidden import edge(s) detected:\n${traces}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the sync-transport exception is exactly the four known co-location files, reached only via the sync transport", () => {
    const { allParents } = walkImportGraph(ROOTS);
    for (const file of SYNC_TRANSPORT_EXCEPTIONS) {
      expect(
        isSyncTransportException(file, allParents),
        `expected ${path.relative(SRC_ROOT, file)} to be reached via the sync transport`,
      ).toBe(true);
    }
  });

  // phase-8-review.md HIGH-2 — closes the reviewer's exact two bypasses.
  // These inject a SYNTHETIC edge (importGraphWalker.ts's extraEdges — no
  // real file is ever touched, since the edge must never legitimately
  // exist in production source) from a real, already-visited root-graph
  // node straight to a sync-transport-exception file, and assert the
  // boundary check now flags it regardless of which of the file's other,
  // legitimate parents the BFS happened to discover first.
  describe("closes HIGH-2's exact bypasses — a forbidden edge is caught no matter what else reaches the same file first", () => {
    const recoveryService = path.join(SRC_ROOT, "server", "recovery", "service.ts");

    it("a forbidden edge from server/volume/service.ts is detected (previously invisible: recovery was reached via the sync transport FIRST)", () => {
      const volumeService = path.join(SRC_ROOT, "server", "volume", "service.ts");
      const extraEdges: SyntheticEdge[] = [{ from: volumeService, to: recoveryService }];
      const { visited, allParents } = walkImportGraph(ROOTS, { extraEdges });

      expect(
        visited.has(volumeService),
        "expected volume/service.ts to be a real graph member",
      ).toBe(true);
      expect(isSyncTransportException(recoveryService, allParents)).toBe(false);
      const offenders = [...visited]
        .filter(isForbidden)
        .filter((f) => !isSyncTransportException(f, allParents));
      expect(offenders).toContain(recoveryService);
    });

    it("a forbidden edge from server/progression/service.ts is (still) detected", () => {
      const progressionService = path.join(SRC_ROOT, "server", "progression", "service.ts");
      const extraEdges: SyntheticEdge[] = [{ from: progressionService, to: recoveryService }];
      const { visited, allParents } = walkImportGraph(ROOTS, { extraEdges });

      expect(isSyncTransportException(recoveryService, allParents)).toBe(false);
      const offenders = [...visited]
        .filter(isForbidden)
        .filter((f) => !isSyncTransportException(f, allParents));
      expect(offenders).toContain(recoveryService);
    });
  });

  // Negative control (phase-7-review.md's own methodology): if the walker
  // never flagged anything, that could mean either "the boundary holds" or
  // "the walker doesn't actually detect forbidden edges" — indistinguishable
  // without a known-positive case. `TodaySection.tsx` genuinely imports
  // `BodyweightQuickLog`, `RecoveryCheckIn`, and `dismissRecoveryCheckInForever`
  // (all real, intentional UI-layer edges), so running the same walker from
  // it must report those as forbidden — proving the clean result above is
  // meaningful, not vacuous.
  it("negative control: the same walker detects TodaySection.tsx's real edges into bodyweight and recovery UI modules", () => {
    const todaySection = path.join(SRC_ROOT, "ui", "today", "TodaySection.tsx");
    const { visited } = walkImportGraph([todaySection]);
    const offenders = [...visited].filter(isForbidden);

    expect(offenders.length).toBeGreaterThan(0);
    expect(offenders.some((f) => f.startsWith(path.join(SRC_ROOT, "ui", "bodyweight")))).toBe(true);
    expect(offenders.some((f) => f.startsWith(path.join(SRC_ROOT, "ui", "recovery")))).toBe(true);
  });

  it("keeps EvaluationContext's recovery slot reserved-but-unconsumed (typed as always undefined)", () => {
    const engineSource = readFileSync(
      path.join(SRC_ROOT, "domain", "progression", "engine.ts"),
      "utf8",
    );
    expect(engineSource).toMatch(/recovery\?:\s*undefined/);
  });
});

// phase-7-review.md HIGH-3's own table of violation forms the old
// regex-only scan missed. Each fixture below is real source text (not an
// actual file on disk) fed straight into extractModuleSpecifiers, proving
// the AST-based extractor — independent of file resolution — catches every
// form, including the one the old test's own comment named as "the serious
// one" (multi-line).
describe("extractModuleSpecifiers — catches every import form the regex-only scan missed (HIGH-3)", () => {
  it("catches a single-line static import", () => {
    const specs = extractModuleSpecifiers(`import { x } from "@/server/recovery/service";\n`);
    expect(specs.map((s) => s.text)).toContain("@/server/recovery/service");
  });

  it("catches a multi-line static import (this codebase's dominant Prettier style)", () => {
    const specs = extractModuleSpecifiers(
      `import {\n  logRecovery,\n  listRecoveryEntries,\n} from "@/server/recovery/service";\n`,
    );
    expect(specs.map((s) => s.text)).toContain("@/server/recovery/service");
  });

  it("catches a dynamic import()", () => {
    const specs = extractModuleSpecifiers(
      `async function load() {\n  const m = await import("@/server/recovery/service");\n  return m;\n}\n`,
    );
    expect(specs.map((s) => s.text)).toContain("@/server/recovery/service");
  });

  it("catches a require(...) call", () => {
    const specs = extractModuleSpecifiers(`const svc = require("@/server/recovery/service");\n`);
    expect(specs.map((s) => s.text)).toContain("@/server/recovery/service");
  });

  it("catches a named re-export", () => {
    const specs = extractModuleSpecifiers(
      `export { logRecovery } from "@/server/recovery/service";\n`,
    );
    expect(specs.map((s) => s.text)).toContain("@/server/recovery/service");
  });

  it("catches export * from (barrel)", () => {
    const specs = extractModuleSpecifiers(`export * from "@/server/recovery/service";\n`);
    expect(specs.map((s) => s.text)).toContain("@/server/recovery/service");
  });

  it("catches import type (type-only imports still name a real module)", () => {
    const specs = extractModuleSpecifiers(
      `import type { RecoveryEntryRecord } from "@/server/recovery/service";\n`,
    );
    expect(specs.map((s) => s.text)).toContain("@/server/recovery/service");
  });

  it("does not fabricate a specifier from an unrelated string literal", () => {
    const specs = extractModuleSpecifiers(`const label = "@/server/recovery/service";\n`);
    expect(specs).toEqual([]);
  });
});
