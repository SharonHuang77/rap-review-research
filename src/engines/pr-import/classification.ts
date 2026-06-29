import type {
  ChangedFile,
  PRCategory,
  PRComplexity,
} from "../../models/snapshot.ts";

/** A per-file category; the major "layers" plus documentation and unknown. */
type FileCategory = Exclude<PRCategory, "cross-component">;

/**
 * Classify a single file path into one implementation area.
 *
 * Checks the most specific layers first (database, infrastructure, docs) before
 * the broader backend / frontend heuristics.
 */
export function classifyFile(path: string): FileCategory {
  const p = path.toLowerCase();

  if (
    p.endsWith(".sql") ||
    p.includes("migration") ||
    p.includes("prisma") ||
    p.includes("drizzle") ||
    p.includes("/schema") ||
    p.includes("schema.")
  ) {
    return "database";
  }

  if (
    p.includes(".github/") ||
    p.includes("terraform") ||
    p.includes("cloudformation") ||
    p.includes("sst.config") ||
    p.includes("serverless") ||
    p.includes("/infra")
  ) {
    return "infrastructure";
  }

  if (p.endsWith(".md") || p.startsWith("docs/") || p.includes("/docs/")) {
    return "documentation";
  }

  if (
    p.includes("/api/") ||
    p.includes("/server/") ||
    p.includes("controller") ||
    p.includes("/route") ||
    p.includes("/service/") ||
    p.includes("/services/")
  ) {
    return "backend";
  }

  if (
    p.endsWith(".tsx") ||
    p.endsWith(".jsx") ||
    p.endsWith(".css") ||
    p.endsWith(".scss") ||
    p.includes("/components/") ||
    p.startsWith("app/") ||
    p.includes("/app/")
  ) {
    return "frontend";
  }

  return "unknown";
}

/**
 * Classify a pull request's overall category from its changed files.
 *
 * If exactly one major area is touched, that area is returned. If more than one
 * is touched, the PR is `cross-component`. If nothing recognisable is touched,
 * the category is `unknown`. A manual override may bypass this entirely.
 */
export function classifyCategory(files: ChangedFile[]): PRCategory {
  const categories = new Set<FileCategory>();
  for (const file of files) {
    const category = classifyFile(file.path);
    if (category !== "unknown") {
      categories.add(category);
    }
  }

  if (categories.size === 0) {
    return "unknown";
  }
  if (categories.size === 1) {
    return [...categories][0] as PRCategory;
  }
  return "cross-component";
}

/**
 * Classify complexity from the total number of changed lines (RFC-02):
 * `< 100` small, `100–500` medium, `> 500` large.
 */
export function classifyComplexity(totalChangedLines: number): PRComplexity {
  if (totalChangedLines < 100) {
    return "small";
  }
  if (totalChangedLines <= 500) {
    return "medium";
  }
  return "large";
}
