// phase-7-review.md HIGH-3 — a real, transitive import-graph walker built
// on the TypeScript compiler's own AST (not a line-based regex), used by
// tests/unit/progressionBoundary.test.ts. Parsing with `ts.createSourceFile`
// means formatting is irrelevant: a multi-line import, a dynamic `import()`,
// a `require(...)`, and a named re-export all resolve to the same handful
// of AST node shapes tsc itself recognizes, regardless of how Prettier
// wrapped them.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const SRC_ROOT = path.resolve(__dirname, "../../src");

export interface ExtractedSpecifier {
  text: string;
  kind: "import" | "export" | "dynamic-import" | "require";
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

// Walks the full AST of one file's source text and returns every module
// specifier it references, however it's spelled: static `import ... from`
// (single- or multi-line — the parser doesn't see line breaks as
// significant), `export ... from` / `export * from` (named re-exports and
// barrels), dynamic `import(...)`, and `require(...)`.
export function extractModuleSpecifiers(
  source: string,
  fileName = "virtual.ts",
): ExtractedSpecifier[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(fileName),
  );
  const found: ExtractedSpecifier[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ text: node.moduleSpecifier.text, kind: "import" });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      // Covers both `export * from "..."` and `export { x } from "..."`.
      found.push({ text: node.moduleSpecifier.text, kind: "export" });
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          found.push({ text: arg.text, kind: "dynamic-import" });
        }
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          found.push({ text: arg.text, kind: "require" });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

const CANDIDATE_SUFFIXES = [".ts", ".tsx"] as const;

// Resolves a module specifier the same two ways this codebase's own source
// actually spells them: the `@/` -> `src/` path alias (tsconfig.json) and
// relative paths. A bare package specifier (`react`, `zod`, `drizzle-orm`,
// ...) resolves to `null` — it's outside our own module graph and, being a
// third-party package, cannot itself contain `src/{domain,server,ui}/
// {bodyweight,recovery}`.
export function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = path.join(SRC_ROOT, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const suffix of CANDIDATE_SUFFIXES) {
    const withSuffix = base + suffix;
    if (existsSync(withSuffix) && statSync(withSuffix).isFile()) return withSuffix;
  }
  for (const suffix of CANDIDATE_SUFFIXES) {
    const indexFile = path.join(base, `index${suffix}`);
    if (existsSync(indexFile) && statSync(indexFile).isFile()) return indexFile;
  }
  return null;
}

export interface WalkResult {
  // Every file reached, including the roots themselves.
  visited: Set<string>;
  // file -> the first file that imported it (or "(root)"), for readable
  // failure messages (a path trace back to a root).
  reachedFrom: Map<string, string>;
}

// Transitive closure over the real import graph (BFS), starting from
// `roots` (absolute file paths). This is what makes "the progression engine
// cannot reach bodyweight/recovery" a genuinely transitive claim rather
// than a one-hop grep — a forbidden module reached through several levels
// of re-exporting barrels is exactly as detectable as a direct import.
export function walkImportGraph(roots: string[]): WalkResult {
  const visited = new Set<string>();
  const reachedFrom = new Map<string, string>();
  const queue: string[] = [];

  for (const root of roots) {
    if (!reachedFrom.has(root)) {
      reachedFrom.set(root, "(root)");
      queue.push(root);
    }
  }

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const { text } of extractModuleSpecifiers(source, file)) {
      const resolved = resolveSpecifier(file, text);
      if (!resolved || visited.has(resolved)) continue;
      if (!reachedFrom.has(resolved)) reachedFrom.set(resolved, file);
      queue.push(resolved);
    }
  }

  return { visited, reachedFrom };
}

// Human-readable root -> ... -> target trace, for failure messages.
export function traceTo(reachedFrom: Map<string, string>, target: string): string {
  const chain: string[] = [target];
  let current = target;
  while (reachedFrom.has(current) && reachedFrom.get(current) !== "(root)") {
    current = reachedFrom.get(current) as string;
    chain.unshift(current);
  }
  return chain.map((f) => path.relative(SRC_ROOT, f)).join(" -> ");
}
