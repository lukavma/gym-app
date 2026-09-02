import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC_ROOT, traceTo, walkImportGraph } from "./importGraphWalker";
import type { SyntheticEdge } from "./importGraphWalker";

// Warm-up Routines v1 — the structural half of I-3/I-6/I-2.
//
// Reuses the same real, transitive, AST-based import-graph walker as
// tests/unit/progressionBoundary.test.ts (phase-7-review.md HIGH-3), so a
// forbidden module reached through several levels of re-exporting barrels is
// exactly as detectable as a direct import.
//
// Two claims, in both directions:
//
//   1. Progression and volume cannot reach any warm-up module. If they
//      could, a warm-up routine could — even accidentally — become an engine
//      or volume input.
//   2. The warm-up modules cannot reach progression, volume, or the sync
//      contract. This is the claim that keeps warm-ups incapable of
//      producing an execution fact or an outbox op in the first place, and
//      it is the one that would break first if someone "just added" warm-up
//      state to a sync payload (R-5).
//
// Deliberately NOT roots for claim 1: `app/api/today-bundle/route.ts` and
// `app/api/active-session/route.ts`. Those legitimately reach the warm-up
// service — the bundle carries the resolved template's linked routine
// DEFINITIONS (O-2), which is the feature working as designed. Including
// them would make claim 1 assert something false, so the roots are exactly
// the progression/volume code itself plus the places that assemble or
// trigger an evaluation.

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

// warmup-routines-review.md MEDIUM-2 — ONE canonical, DISCOVERED inventory.
//
// The previous version of this file hand-listed four directories, and three
// real warm-up files fell outside them: the template-association API route
// and both management pages. The review proved the consequence with an
// executable control — a `@/domain/sync/schema` import written into
// `app/api/templates/[id]/warmup-routines/route.ts` still PASSED, i.e. the
// guard against the evaluation's own named scope-creep risk (R-5) had a
// false negative on a warm-up write-path route.
//
// The fix is to stop enumerating locations by hand. Every `.ts`/`.tsx` file
// under `src/` whose path names it a warm-up file IS a warm-up module, and
// the completeness test below fails the moment a discovered file is neither
// a root nor an explicitly listed carve-out. A future warm-up file therefore
// cannot be silently uncovered: it either gets walked, or the suite fails
// until someone documents why not.
const WARMUP_PATH_PATTERN = /warmup/i;

const WARMUP_INVENTORY = listSourceFiles(SRC_ROOT)
  .filter((file) => WARMUP_PATH_PATTERN.test(path.relative(SRC_ROOT, file)))
  .sort();

// ---- Carve-outs, explicit and individually justified -------------------
//
// Each entry below is excluded from exactly one direction, for a stated
// reason, and every one is re-asserted by a negative control further down.

// (a) The three warm-up TABLE DECLARATIONS. Excluded from claim 1's offender
// set only. `src/db/schema/index.ts` is a shared table registry that every
// service — progression and volume included — imports wholesale, so these
// three files are trivially "reachable" from the engines the same way
// `bodyweightEntries`/`recoveryEntries` already are (the carve-out
// `progressionBoundary.test.ts` documents). Reaching a table's Drizzle
// declaration through the barrel is not a read path into warm-up logic.
//
// This is NOT a blanket exemption: `isSchemaRegistryOnly` below keeps it
// edge-specific, so a direct engine → `@/db/schema/warmupRoutines` import
// still fails (proven by a negative control).
const WARMUP_SCHEMA_DECLARATIONS = [
  path.join(SRC_ROOT, "db", "schema", "warmupRoutineItems.ts"),
  path.join(SRC_ROOT, "db", "schema", "warmupRoutines.ts"),
  path.join(SRC_ROOT, "db", "schema", "workoutTemplateWarmupRoutines.ts"),
];

// (b) The in-workout card. Excluded from claim 2's ROOT set only (it is
// still a full offender target for claim 1). It imports the active-session
// store, which legitimately reaches progression because the store is the
// whole workout's state, not a warm-up module. Including it as a root would
// make claim 2 assert something false. Its own inability to write an
// execution fact is proven behaviourally instead, by
// tests/unit/warmupActiveSession.test.ts's "zero outbox ops, zero flushes"
// assertions. The review recorded this carve-out's extent (its control E);
// it is restated here so the boundary of the static guard stays on record.
const WARMUP_CARD = path.join(SRC_ROOT, "ui", "workout", "WarmupCard.tsx");

// Claim 1's offender set: the whole inventory except the table declarations.
function isWarmupModule(file: string): boolean {
  if (WARMUP_SCHEMA_DECLARATIONS.includes(file)) return false;
  return WARMUP_INVENTORY.includes(file);
}

// The engine/metric code, plus the single write path for execution facts.
// `src/sync/outbox.ts` and `src/sync/flush.ts` are included because the
// strongest statement of I-2 is not "no warm-up sync entity exists" but "no
// warm-up module can even see the queue".
const FORBIDDEN_FROM_WARMUP = [
  path.join(SRC_ROOT, "domain", "progression"),
  path.join(SRC_ROOT, "domain", "volume"),
  path.join(SRC_ROOT, "domain", "sync"),
  path.join(SRC_ROOT, "server", "progression"),
  path.join(SRC_ROOT, "server", "volume"),
  path.join(SRC_ROOT, "server", "sync"),
  path.join(SRC_ROOT, "sync", "outbox.ts"),
  path.join(SRC_ROOT, "sync", "flush.ts"),
];

function isForbiddenFromWarmup(file: string): boolean {
  return FORBIDDEN_FROM_WARMUP.some((dir) => file === dir || file.startsWith(dir + path.sep));
}

// The shared table registry, not a read path — the same carve-out
// tests/unit/progressionBoundary.test.ts already documents for
// bodyweight/recovery, one layer out. `src/server/warmupRoutines/service.ts`
// imports the `@/db/schema` barrel (the house convention for every service),
// and that barrel re-exports `volumePresets`/`volumeLandmarks`, whose table
// DEFINITIONS import enum constants from `domain/volume/schema.ts` to build
// CHECK constraints. That is a schema-declaration edge, not the warm-up code
// reading anything volume-related.
//
// Kept edge-specific and immune to BFS order, exactly as phase-8-review.md
// HIGH-2 required of the older test: the exception applies only while EVERY
// recorded parent of the file is a table-definition file under
// `src/db/schema/`. A parent from anywhere else — the warm-up service
// itself, a route, the UI, a future new file — still fails.
const DB_SCHEMA_DIR = path.join(SRC_ROOT, "db", "schema");

function isSchemaRegistryOnly(file: string, allParents: Map<string, Set<string>>): boolean {
  const parents = allParents.get(file);
  if (!parents || parents.size === 0) return false;
  return [...parents].every((parent) => parent.startsWith(DB_SCHEMA_DIR + path.sep));
}

const PROGRESSION_DOMAIN_ROOTS = listSourceFiles(path.join(SRC_ROOT, "domain", "progression"));
const VOLUME_DOMAIN_ROOTS = listSourceFiles(path.join(SRC_ROOT, "domain", "volume"));
const ENGINE_ASSEMBLY_ROOTS = [
  path.join(SRC_ROOT, "server", "progression", "service.ts"),
  path.join(SRC_ROOT, "server", "volume", "service.ts"),
  path.join(SRC_ROOT, "server", "sync", "service.ts"),
  path.join(SRC_ROOT, "app", "api", "sync", "route.ts"),
  path.join(SRC_ROOT, "app", "api", "volume", "route.ts"),
  path.join(SRC_ROOT, "app", "api", "history", "route.ts"),
];
const ENGINE_ROOTS = [
  ...PROGRESSION_DOMAIN_ROOTS,
  ...VOLUME_DOMAIN_ROOTS,
  ...ENGINE_ASSEMBLY_ROOTS,
];

// Claim 2's roots: the whole discovered inventory except the one carve-out
// documented at (b) above. The table declarations ARE roots here — they are
// leaf Drizzle declarations that reach nothing forbidden, so walking them
// costs nothing and strengthens the claim.
const WARMUP_ROOTS = WARMUP_INVENTORY.filter((file) => file !== WARMUP_CARD);

describe("warm-up routines — structural boundary (I-3/I-6, evaluation A-11)", () => {
  it("found the expected warm-up and engine source files (sanity check the scan itself runs)", () => {
    expect(WARMUP_ROOTS.length).toBeGreaterThan(4);
    expect(PROGRESSION_DOMAIN_ROOTS.length).toBeGreaterThan(0);
    expect(VOLUME_DOMAIN_ROOTS.length).toBeGreaterThan(0);
    for (const root of [...ENGINE_ASSEMBLY_ROOTS, WARMUP_CARD]) {
      expect(existsSync(root), `expected root to exist: ${root}`).toBe(true);
    }
  });

  // MEDIUM-2's standing guard. This is the test that makes the hand-listing
  // mistake unrepeatable: every discovered warm-up file must be accounted
  // for, and the three files the review found uncovered are named explicitly
  // so a regression that drops them is unmistakable in the diff.
  describe("the inventory is canonical and completely accounted for (MEDIUM-2)", () => {
    it("discovers every warm-up file under src/, including the three the previous root set omitted", () => {
      const relative = WARMUP_INVENTORY.map((f) => path.relative(SRC_ROOT, f).replace(/\\/g, "/"));

      // The exact three files the review's controls C and D proved were
      // invisible to this test.
      for (const previouslyOmitted of [
        "app/api/templates/[id]/warmup-routines/route.ts",
        "app/(app)/warmup-routines/new/page.tsx",
        "app/(app)/warmup-routines/[id]/page.tsx",
      ]) {
        expect(
          relative,
          `MEDIUM-2 regression: ${previouslyOmitted} is not in the inventory`,
        ).toContain(previouslyOmitted);
      }

      // ...and the inventory is the whole feature, not a subset of it.
      expect(relative.length).toBeGreaterThanOrEqual(16);
      expect(relative).toContain("domain/warmup/session.ts");
      expect(relative).toContain("server/warmupRoutines/service.ts");
      expect(relative).toContain("ui/workout/WarmupCard.tsx");
      expect(relative).toContain("db/schema/workoutTemplateWarmupRoutines.ts");
    });

    it("every discovered warm-up file is either walked as a root or an explicitly listed carve-out", () => {
      const carveOuts = new Set([WARMUP_CARD]);
      const roots = new Set(WARMUP_ROOTS);

      const unaccounted = WARMUP_INVENTORY.filter(
        (file) => !roots.has(file) && !carveOuts.has(file),
      );
      expect(
        unaccounted.map((f) => path.relative(SRC_ROOT, f)),
        "a warm-up file is neither a claim-2 root nor a documented carve-out — add it to one, " +
          "with a written reason (MEDIUM-2)",
      ).toEqual([]);
    });

    it("every discovered warm-up file is either a claim-1 offender target or an explicitly listed carve-out", () => {
      const carveOuts = new Set(WARMUP_SCHEMA_DECLARATIONS);
      const unaccounted = WARMUP_INVENTORY.filter(
        (file) => !isWarmupModule(file) && !carveOuts.has(file),
      );
      expect(
        unaccounted.map((f) => path.relative(SRC_ROOT, f)),
        "a warm-up file is invisible to claim 1 and is not a documented carve-out (MEDIUM-2)",
      ).toEqual([]);
    });
  });

  it("progression and volume never transitively reach any warm-up module", () => {
    const { visited, reachedFrom } = walkImportGraph(ENGINE_ROOTS);

    // Sanity: the walk must actually traverse beyond the roots, or a
    // resolver bug would make this vacuously true. The shared db/schema
    // barrel now re-exports the three warm-up tables (a shared table
    // registry, not a read path — the same shape the Phase 8 review
    // accepted for bodyweight/recovery), so reaching it proves both real
    // transitivity AND that a barrel re-export alone does not make a
    // warm-up MODULE reachable.
    const schemaBarrel = path.join(SRC_ROOT, "db", "schema", "index.ts");
    expect(visited.has(schemaBarrel), "expected the walk to reach src/db/schema/index.ts").toBe(
      true,
    );
    expect(visited.size).toBeGreaterThan(30);

    const offenders = [...visited].filter(isWarmupModule);
    if (offenders.length > 0) {
      throw new Error(
        `Forbidden import edge(s) into warm-up modules:\n${offenders
          .map((f) => traceTo(reachedFrom, f))
          .join("\n")}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("no warm-up module transitively reaches progression, volume, or the sync contract", () => {
    const { visited, reachedFrom, allParents } = walkImportGraph(WARMUP_ROOTS);

    expect(visited.size).toBeGreaterThan(WARMUP_ROOTS.length);

    const offenders = [...visited]
      .filter(isForbiddenFromWarmup)
      .filter((f) => !isSchemaRegistryOnly(f, allParents));
    if (offenders.length > 0) {
      throw new Error(
        `A warm-up module reaches engine/sync code:\n${offenders
          .map((f) => traceTo(reachedFrom, f))
          .join("\n")}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  // Negative controls. Without these, a clean result above is ambiguous
  // between "the boundary holds" and "the walker doesn't detect anything" —
  // exactly the methodology tests/unit/progressionBoundary.test.ts uses.
  describe("negative controls — the same checks fail when the protection is removed", () => {
    it("a synthetic edge from server/volume/service.ts into the warm-up service IS detected", () => {
      const volumeService = path.join(SRC_ROOT, "server", "volume", "service.ts");
      const warmupService = path.join(SRC_ROOT, "server", "warmupRoutines", "service.ts");
      const extraEdges: SyntheticEdge[] = [{ from: volumeService, to: warmupService }];
      const { visited } = walkImportGraph(ENGINE_ROOTS, { extraEdges });

      expect(
        visited.has(volumeService),
        "expected volume/service.ts to be a real graph member",
      ).toBe(true);
      expect([...visited].filter(isWarmupModule)).toContain(warmupService);
    });

    it("a synthetic edge from progression's engine into the warm-up domain IS detected", () => {
      const engine = path.join(SRC_ROOT, "domain", "progression", "engine.ts");
      const warmupSession = path.join(SRC_ROOT, "domain", "warmup", "session.ts");
      const extraEdges: SyntheticEdge[] = [{ from: engine, to: warmupSession }];
      const { visited } = walkImportGraph(ENGINE_ROOTS, { extraEdges });

      expect([...visited].filter(isWarmupModule)).toContain(warmupSession);
    });

    it("a synthetic edge from the warm-up service into the sync schema IS detected (the R-5 scope-creep case)", () => {
      const warmupService = path.join(SRC_ROOT, "server", "warmupRoutines", "service.ts");
      const syncSchema = path.join(SRC_ROOT, "domain", "sync", "schema.ts");
      const extraEdges: SyntheticEdge[] = [{ from: warmupService, to: syncSchema }];
      const { visited, allParents } = walkImportGraph(WARMUP_ROOTS, { extraEdges });

      const offenders = [...visited]
        .filter(isForbiddenFromWarmup)
        .filter((f) => !isSchemaRegistryOnly(f, allParents));
      expect(offenders).toContain(syncSchema);
    });

    it("the db/schema registry carve-out is edge-specific: a DIRECT warm-up edge into domain/volume/schema.ts still fails", () => {
      // Proves the exception above cannot be used as a back door. The same
      // file that is tolerated when it is reached only through table
      // definitions becomes an offender the moment a warm-up module itself
      // is one of its parents.
      const warmupSession = path.join(SRC_ROOT, "domain", "warmup", "session.ts");
      const volumeSchema = path.join(SRC_ROOT, "domain", "volume", "schema.ts");
      const extraEdges: SyntheticEdge[] = [{ from: warmupSession, to: volumeSchema }];
      const { visited, allParents } = walkImportGraph(WARMUP_ROOTS, { extraEdges });

      expect(isSchemaRegistryOnly(volumeSchema, allParents)).toBe(false);
      const offenders = [...visited]
        .filter(isForbiddenFromWarmup)
        .filter((f) => !isSchemaRegistryOnly(f, allParents));
      expect(offenders).toContain(volumeSchema);
    });

    it("the same walker DOES report a real edge into warm-up code when one exists (WarmupCard -> the store -> progression)", () => {
      // WarmupCard.tsx genuinely imports the active-session store, which
      // genuinely reaches progression. Walking from it must therefore report
      // progression as reachable — proving the clean warm-up-roots result
      // above is a fact about those files, not about the walker.
      const { visited } = walkImportGraph([WARMUP_CARD]);
      const reached = [...visited].filter(isForbiddenFromWarmup);
      expect(reached.length).toBeGreaterThan(0);
      expect(reached.some((f) => f.startsWith(path.join(SRC_ROOT, "domain", "progression")))).toBe(
        true,
      );
    });
  });

  // warmup-routines-review.md MEDIUM-2 — the controls that were PASSING
  // (i.e. failing to detect) before this remediation. Each reproduces one of
  // the review's own executable controls, in-process via a synthetic edge
  // rather than by writing into a real file, so it runs on every suite.
  describe("MEDIUM-2 regression controls — the previously omitted files are now covered", () => {
    const syncSchema = path.join(SRC_ROOT, "domain", "sync", "schema.ts");
    const outbox = path.join(SRC_ROOT, "sync", "outbox.ts");

    function claim2Offenders(extraEdges: SyntheticEdge[]): string[] {
      const { visited, allParents } = walkImportGraph(WARMUP_ROOTS, { extraEdges });
      return [...visited]
        .filter(isForbiddenFromWarmup)
        .filter((f) => !isSchemaRegistryOnly(f, allParents));
    }

    // The review's control C — the exact R-5 scope-creep case, on a warm-up
    // WRITE-PATH route. This PASSED (false negative) before the fix.
    it("control C: a sync-schema import in the template-association route is now DETECTED", () => {
      const associationRoute = path.join(
        SRC_ROOT,
        "app",
        "api",
        "templates",
        "[id]",
        "warmup-routines",
        "route.ts",
      );
      expect(existsSync(associationRoute), "the association route must exist").toBe(true);
      expect(WARMUP_ROOTS, "the association route must be a walked root").toContain(
        associationRoute,
      );
      expect(claim2Offenders([{ from: associationRoute, to: syncSchema }])).toContain(syncSchema);
    });

    // The review's control D.
    it("control D: a sync-schema import in the 'new routine' page is now DETECTED", () => {
      const newPage = path.join(SRC_ROOT, "app", "(app)", "warmup-routines", "new", "page.tsx");
      expect(existsSync(newPage), "the new-routine page must exist").toBe(true);
      expect(WARMUP_ROOTS).toContain(newPage);
      expect(claim2Offenders([{ from: newPage, to: syncSchema }])).toContain(syncSchema);
    });

    // The third omitted file, which the review named but did not separately
    // control for.
    it("control D': an outbox import in the 'edit routine' page is now DETECTED", () => {
      const editPage = path.join(SRC_ROOT, "app", "(app)", "warmup-routines", "[id]", "page.tsx");
      expect(existsSync(editPage), "the edit-routine page must exist").toBe(true);
      expect(WARMUP_ROOTS).toContain(editPage);
      expect(claim2Offenders([{ from: editPage, to: outbox }])).toContain(outbox);
    });

    // Claim 1's direction for the same previously-omitted files: an engine
    // reaching one of them must now be reported as an offender.
    it("claim 1: an engine edge into the association route is now DETECTED", () => {
      const associationRoute = path.join(
        SRC_ROOT,
        "app",
        "api",
        "templates",
        "[id]",
        "warmup-routines",
        "route.ts",
      );
      const volumeAggregate = path.join(SRC_ROOT, "domain", "volume", "aggregate.ts");
      const { visited } = walkImportGraph(ENGINE_ROOTS, {
        extraEdges: [{ from: volumeAggregate, to: associationRoute }],
      });
      expect([...visited].filter(isWarmupModule)).toContain(associationRoute);
    });

    it("claim 1: an engine edge into a management page is now DETECTED", () => {
      const editPage = path.join(SRC_ROOT, "app", "(app)", "warmup-routines", "[id]", "page.tsx");
      const progressionEngine = path.join(SRC_ROOT, "domain", "progression", "engine.ts");
      const { visited } = walkImportGraph(ENGINE_ROOTS, {
        extraEdges: [{ from: progressionEngine, to: editPage }],
      });
      expect([...visited].filter(isWarmupModule)).toContain(editPage);
    });

    // The table-declaration carve-out (a) must be edge-specific too: it
    // tolerates the barrel, never a direct engine import.
    it("carve-out (a) is edge-specific: a DIRECT engine import of a warm-up table declaration is DETECTED", () => {
      const warmupTable = path.join(SRC_ROOT, "db", "schema", "warmupRoutines.ts");
      const volumeService = path.join(SRC_ROOT, "server", "volume", "service.ts");
      const { visited, allParents } = walkImportGraph(ENGINE_ROOTS, {
        extraEdges: [{ from: volumeService, to: warmupTable }],
      });

      // Reached through the barrel alone it is tolerated...
      const { allParents: cleanParents } = walkImportGraph(ENGINE_ROOTS);
      expect(isSchemaRegistryOnly(warmupTable, cleanParents)).toBe(true);
      // ...but a non-registry parent breaks the exemption.
      expect(isSchemaRegistryOnly(warmupTable, allParents)).toBe(false);
      expect(visited.has(warmupTable)).toBe(true);
    });
  });
});
