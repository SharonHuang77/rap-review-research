/**
 * Module partitioning for the module-agent review scheme (doc-17). Splits a PR's
 * unified diff into per-module sub-diffs so each module can be reviewed by its own
 * agent. A "module" is the first two path segments of a changed file (fallback:
 * one) — a coarse but language-agnostic proxy for a functional unit. Each sub-diff
 * keeps its file blocks verbatim, so hunk `@@` new-file line numbers are preserved
 * (ground-truth localization stays valid on the slice). Pure; no LLM.
 */

/** First two path segments as the module key (e.g. `src/Components`, `apps/shade`). */
export function moduleOf(path: string): string {
  const s = path.replace(/^\.\//, "").split("/").filter(Boolean);
  return s.length >= 2 ? `${s[0]}/${s[1]}` : (s[0] ?? "");
}

/** The new-file path a `diff --git` block touches (deleted → old path). */
function filePathOfBlock(block: string): string | null {
  const lines = block.split("\n");
  for (const l of lines) if (l.startsWith("+++ ")) { const p = l.slice(4).replace(/^b\//, "").trim(); if (p && p !== "/dev/null") return p; }
  for (const l of lines) if (l.startsWith("--- ")) { const p = l.slice(4).replace(/^a\//, "").trim(); if (p && p !== "/dev/null") return p; }
  const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(block);
  return m ? (m[2] ?? m[1] ?? null) : null;
}

/**
 * Partition a unified diff into `module → sub-diff`. File blocks (each starting at
 * a `diff --git` line) are grouped by their file's module and re-joined verbatim.
 */
export function partitionDiffByModule(rawDiff: string): Map<string, string> {
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of rawDiff.split("\n")) {
    if (line.startsWith("diff --git ")) { if (cur.length) blocks.push(cur.join("\n")); cur = [line]; }
    else cur.push(line);
  }
  if (cur.length) blocks.push(cur.join("\n"));

  const byModule = new Map<string, string[]>();
  for (const block of blocks) {
    const path = filePathOfBlock(block);
    if (!path) continue;
    const m = moduleOf(path);
    byModule.set(m, [...(byModule.get(m) ?? []), block]);
  }
  const out = new Map<string, string>();
  for (const [m, bs] of byModule) out.set(m, bs.join("\n"));
  return out;
}
