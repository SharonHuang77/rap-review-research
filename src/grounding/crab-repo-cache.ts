/**
 * CRAB repo cache (doc-16, Phase B). Retrieves the exact review-time source of a
 * file via a BLOBLESS clone (`--filter=blob:none --no-checkout`) plus
 * `git show <commit>:<path>` — blobs are fetched lazily, so clones stay small and
 * only touched files are materialized. Per-repo clone + per (repo,commit,path)
 * memoization keep repeated lookups cheap. Pure retrieval; no LLM.
 *
 * CRAB_CLONE_DIR defaults to a SHORT path (`C:\crabrepos` style) to dodge the
 * Windows MAX_PATH limit that breaks git pack writes under deep temp dirs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CLONE_DIR = process.env.CRAB_CLONE_DIR ?? "C:\\Users\\chntw\\crabrepos";
const CLONE_TIMEOUT_MS = Number(process.env.CRAB_CLONE_TIMEOUT_MS ?? 180_000);

const repoDir = (repo: string): string => join(CLONE_DIR, repo.replace(/\//g, "__"));

const cloneOk = new Map<string, boolean>();
const fileCache = new Map<string, string | null>();

function git(args: string[], opts: { timeout?: number } = {}): { ok: boolean; out: string } {
  try {
    const out = execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
      timeout: opts.timeout,
    });
    return { ok: true, out };
  } catch {
    return { ok: false, out: "" };
  }
}

/** Ensure a blobless, no-checkout clone of `repo` exists locally. Memoized. */
export function ensureClone(repo: string): boolean {
  const cached = cloneOk.get(repo);
  if (cached !== undefined) return cached;
  const dir = repoDir(repo);
  if (existsSync(join(dir, "HEAD")) || existsSync(join(dir, ".git"))) { cloneOk.set(repo, true); return true; }
  mkdirSync(CLONE_DIR, { recursive: true });
  const { ok } = git(
    ["clone", "--filter=blob:none", "--no-checkout", `https://github.com/${repo}.git`, dir],
    { timeout: CLONE_TIMEOUT_MS },
  );
  cloneOk.set(repo, ok);
  return ok;
}

/**
 * Whole-file source at a specific commit, or null if unavailable (repo won't
 * clone, commit unreachable even after a targeted fetch, or path absent). Result
 * is memoized (including nulls) so callers can probe dependency candidates freely.
 */
export function fileAtCommit(repo: string, commit: string, path: string): string | null {
  const key = `${repo}@${commit}:${path}`;
  const hit = fileCache.get(key);
  if (hit !== undefined) return hit;
  let value: string | null = null;
  if (ensureClone(repo)) {
    const dir = repoDir(repo);
    let r = git(["-C", dir, "show", `${commit}:${path}`]);
    if (!r.ok) {
      // commit may be off the default branch (PR base) — fetch it, then retry.
      git(["-C", dir, "fetch", "--filter=blob:none", "origin", commit], { timeout: CLONE_TIMEOUT_MS });
      r = git(["-C", dir, "show", `${commit}:${path}`]);
    }
    value = r.ok ? r.out : null;
  }
  fileCache.set(key, value);
  return value;
}
