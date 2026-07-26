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

const OP_TIMEOUT_MS = Number(process.env.CRAB_OP_TIMEOUT_MS ?? 45_000);
function git(args: string[], opts: { timeout?: number } = {}): { ok: boolean; out: string } {
  try {
    const out = execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
      // ALL ops get a cap: an on-demand blob fetch during `show`/`grep`/`ls-tree` on a huge
      // repo (e.g. ansible) can otherwise stall a review unbounded. clone/fetch pass their own.
      timeout: opts.timeout ?? OP_TIMEOUT_MS,
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

const commitOk = new Map<string, boolean>();
/** Ensure `commit` (often a PR base off the default branch) is present, fetching once. Memoized. */
function ensureCommit(repo: string, commit: string): boolean {
  if (!ensureClone(repo)) return false;
  const k = `${repo}@${commit}`;
  const cached = commitOk.get(k);
  if (cached !== undefined) return cached;
  const dir = repoDir(repo);
  let ok = git(["-C", dir, "cat-file", "-e", `${commit}^{commit}`]).ok;
  if (!ok) {
    git(["-C", dir, "fetch", "--filter=blob:none", "origin", commit], { timeout: CLONE_TIMEOUT_MS });
    ok = git(["-C", dir, "cat-file", "-e", `${commit}^{commit}`]).ok;
  }
  commitOk.set(k, ok);
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
  if (ensureCommit(repo, commit)) {
    const r = git(["-C", repoDir(repo), "show", `${commit}:${path}`]);
    value = r.ok ? r.out : null;
  }
  fileCache.set(key, value);
  return value;
}

const dirCache = new Map<string, string[] | null>();
/** Entry names under `path` (repo root when path is "" / "." / "/") at `commit`, or null. Memoized. */
export function listDir(repo: string, commit: string, path: string): string[] | null {
  const clean = path.replace(/^[./]+|\/+$/g, "");
  const key = `${repo}@${commit}:${clean}/`;
  const hit = dirCache.get(key);
  if (hit !== undefined) return hit;
  let value: string[] | null = null;
  if (ensureCommit(repo, commit)) {
    const r = git(["-C", repoDir(repo), "ls-tree", "--name-only", clean ? `${commit}:${clean}` : `${commit}:`]);
    value = r.ok ? r.out.split("\n").filter(Boolean) : null;
  }
  dirCache.set(key, value);
  return value;
}

const grepCache = new Map<string, string[]>();
/**
 * `git grep` at a commit, scoped to `pathspec` (an unscoped grep over a blobless
 * clone would lazily fetch every blob in the tree). Returns up to `maxLines`
 * "path:line:text" hits (empty = no match / unavailable). Fixed-string,
 * case-insensitive, ≤3 hits per file. Runs once (no fetch-retry — git grep exits
 * non-zero on legitimate no-match). Memoized.
 */
export function grepRepo(repo: string, commit: string, pattern: string, pathspec: string, maxLines = 50): string[] {
  const scope = pathspec.replace(/^[./]+|\/+$/g, "") || ".";
  const key = `${repo}@${commit}:grep:${pattern}::${scope}`;
  const hit = grepCache.get(key);
  if (hit !== undefined) return hit;
  let value: string[] = [];
  if (ensureCommit(repo, commit)) {
    const r = git(["-C", repoDir(repo), "grep", "-n", "-F", "-i", "--max-count=3", pattern, commit, "--", scope]);
    value = (r.out ? r.out.split("\n").filter(Boolean) : []).slice(0, maxLines);
  }
  grepCache.set(key, value);
  return value;
}
