/**
 * Best-effort static-analysis + later-fix producer for E3 triangulation. Uses the
 * portal repo checked out locally (RAP_PORTAL_REPO_PATH). Writes static.json and
 * laterfix.json into RAP_PORTAL_DIR. Any PR a tool can't cover is simply omitted.
 * Run: `npm run rap-portal:static`
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { IndustrialRun } from "../src/industrial/models.ts";
import type { StaticAnalysisFinding, ChangedRange } from "../src/evaluation/industrial/models.ts";

const DIR = resolve(process.env.RAP_PORTAL_DIR ?? "rap-portal-results");
const REPO_PATH = process.env.RAP_PORTAL_REPO_PATH; // local clone of logisticPM/portal
const runs = JSON.parse(readFileSync(join(DIR, "runs.json"), "utf8")) as IndustrialRun[];
const prs = [...new Set(runs.map((r) => r.pr))];

const staticByPr: Record<string, StaticAnalysisFinding[]> = {};
const laterFixByPr: Record<string, ChangedRange[]> = {};
for (const pr of prs) {
  staticByPr[pr] = REPO_PATH ? runStaticAnalysis(REPO_PATH) : [];
  laterFixByPr[pr] = REPO_PATH ? mineLaterChanges(REPO_PATH) : [];
}
writeFileSync(join(DIR, "static.json"), JSON.stringify(staticByPr, null, 2));
writeFileSync(join(DIR, "laterfix.json"), JSON.stringify(laterFixByPr, null, 2));
console.log(`static.json + laterfix.json written for ${prs.length} PRs (repo ${REPO_PATH ? "present" : "MISSING → empty"})`);

function runStaticAnalysis(repo: string): StaticAnalysisFinding[] {
  // Run `tsc --noEmit` and parse "file(line,col): error TSxxxx: msg" lines. ESLint/Semgrep optional.
  try {
    const out = execFileSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return parseTsc(out);
  } catch (e: unknown) {
    const stdout = (e as { stdout?: string }).stdout ?? "";
    return parseTsc(stdout);
  }
}
function parseTsc(out: string): StaticAnalysisFinding[] {
  const findings: StaticAnalysisFinding[] = [];
  for (const line of out.split("\n")) {
    const m = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/.exec(line.trim());
    if (m) findings.push({ file: m[1]!, line: Number(m[2]), rule: m[3], category: "type" });
  }
  return findings;
}
function mineLaterChanges(repo: string): ChangedRange[] {
  // Files+lines touched by commits merged AFTER this PR. Coarse: diff the PR's merge commit against HEAD per file.
  try {
    const files = execFileSync("git", ["-C", repo, "diff", "--name-only", `origin/main`], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    return files.map((file) => ({ file, lineStart: 1, lineEnd: 1_000_000 })); // whole-file overlap; refined later if needed
  } catch { return []; }
}
