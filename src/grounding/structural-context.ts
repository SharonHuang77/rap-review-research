/**
 * Structural-retrieval context (doc-16, Phase B). Given a CRAB PR's repo,
 * review-base commit, and changed-file paths, assemble a token-budgeted block of
 * REAL review-time source: the whole changed files plus their 1-hop local
 * Python-import dependencies. This is the "grounding done right" content the
 * reviewer never sees from a diff alone — and it is built ONLY from the diff's
 * touched files and their imports (never from the ground-truth review comments),
 * so it is non-circular.
 */
import { fileAtCommit } from "./crab-repo-cache.ts";

export interface StructuralOptions {
  /** Total character budget (~4 chars/token). Default 32000 ≈ 8K tokens. */
  readonly budgetChars?: number;
  /** Per changed-file cap before truncation. */
  readonly fileMaxChars?: number;
  /** Per dependency cap before truncation. */
  readonly depMaxChars?: number;
  /** Max 1-hop dependency modules to include. */
  readonly maxDeps?: number;
}

export interface StructuralContext {
  readonly text: string;
  readonly chars: number;
  readonly tokensApprox: number;
  readonly files: number;
  readonly deps: number;
}

const DEFAULTS = { budgetChars: 32_000, fileMaxChars: 16_000, depMaxChars: 6_000, maxDeps: 5 };

/** Resolve a module path referenced by `import`/`from ... import` to repo-relative candidates. */
function importCandidates(line: string, fromFile: string): string[] {
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const rel = /^\s*from\s+(\.+)([\w.]*)\s+import\s+/.exec(line);
  if (rel) {
    const ups = rel[1]!.length - 1; // one dot = current package
    let base = dir;
    for (let i = 0; i < ups; i += 1) base = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
    const sub = rel[2] ? rel[2]!.replace(/\./g, "/") : "";
    const stem = [base, sub].filter(Boolean).join("/");
    return stem ? [`${stem}.py`, `${stem}/__init__.py`] : [];
  }
  const abs = /^\s*(?:from\s+([\w.]+)\s+import\s+|import\s+([\w.]+))/.exec(line);
  if (abs) {
    const mod = (abs[1] ?? abs[2])!.split(",")[0]!.trim().replace(/\s+as\s+\w+$/, "");
    const stem = mod.replace(/\./g, "/");
    return [`${stem}.py`, `${stem}/__init__.py`];
  }
  return [];
}

const lang = (path: string): string => (path.endsWith(".py") ? "python" : "");
const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n)}\n# … [truncated ${s.length - n} chars]`);

export function buildStructuralContext(
  repo: string,
  baseCommit: string,
  changedPaths: readonly string[],
  options: StructuralOptions = {},
): StructuralContext {
  const opt = { ...DEFAULTS, ...options };
  const changed = [...new Set(changedPaths)];
  const changedSet = new Set(changed);

  // 1. whole changed files at the review base
  const fileBlocks: string[] = [];
  const fileSources = new Map<string, string>();
  let used = 0;
  for (const path of changed) {
    const src = fileAtCommit(repo, baseCommit, path);
    if (src === null) continue; // added-at-PR file (absent at base) or binary — diff carries it
    fileSources.set(path, src);
    const body = clip(src, opt.fileMaxChars);
    const block = `### ${path}\n\`\`\`${lang(path)}\n${body}\n\`\`\``;
    if (used + block.length > opt.budgetChars) break;
    fileBlocks.push(block);
    used += block.length;
  }

  // 2. 1-hop local import dependencies of the changed files
  const depPaths: string[] = [];
  const seen = new Set<string>(changedSet);
  for (const [path, src] of fileSources) {
    for (const line of src.split("\n")) {
      if (!/^\s*(from|import)\s/.test(line)) continue;
      for (const cand of importCandidates(line, path)) {
        if (seen.has(cand) || depPaths.length >= opt.maxDeps) continue;
        if (fileAtCommit(repo, baseCommit, cand) !== null) { depPaths.push(cand); seen.add(cand); }
      }
      if (depPaths.length >= opt.maxDeps) break;
    }
    if (depPaths.length >= opt.maxDeps) break;
  }
  const depBlocks: string[] = [];
  for (const path of depPaths) {
    const src = fileAtCommit(repo, baseCommit, path)!;
    const block = `### ${path}\n\`\`\`${lang(path)}\n${clip(src, opt.depMaxChars)}\n\`\`\``;
    if (used + block.length > opt.budgetChars) break;
    depBlocks.push(block);
    used += block.length;
  }

  const parts: string[] = [];
  if (fileBlocks.length) parts.push(`## Full source of changed files (at review base commit)\n${fileBlocks.join("\n\n")}`);
  if (depBlocks.length) parts.push(`## Referenced local modules (1-hop imports)\n${depBlocks.join("\n\n")}`);
  const text = parts.join("\n\n");
  return { text, chars: text.length, tokensApprox: Math.round(text.length / 4), files: fileBlocks.length, deps: depBlocks.length };
}
