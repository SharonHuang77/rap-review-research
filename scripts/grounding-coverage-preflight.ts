/**
 * Grounding arm (doc 13) — P0 COVERAGE PRE-FLIGHT and GO/NO-GO gate. Before any
 * grounded review runs, verify that the repo-derived `ProjectConventions` actually
 * cover the rule-violation categories Qodo injected into the pilot repos. If they
 * do not, grounding cannot help and a null would be a benchmark artifact, not a
 * grounding result — so we would stop and switch the confirmatory arm to a
 * natural-convention benchmark rather than run a doomed pilot. ZERO LLM calls.
 *
 * Env: RUNS_IN (=phase2-results/qodo-all-runs.json), GO_THRESHOLD (=0.5),
 *      PILOT (comma list; default = the 20 Qodo pilot instances).
 */
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import { coversCategory, repoOfInstance, renderConventions, PROJECT_CONVENTIONS } from "../src/grounding/project-conventions.ts";

const RUNS_IN = resolve(process.env.RUNS_IN ?? join(import.meta.dirname, "..", "phase2-results", "qodo-all-runs.json"));
const GO = Number(process.env.GO_THRESHOLD ?? 0.5);
const PILOT = new Set(
  (process.env.PILOT ??
    "aspnetcore-pr-1,aspnetcore-pr-2,aspnetcore-pr-3,aspnetcore-pr-4,aspnetcore-pr-5,aspnetcore-pr-6,aspnetcore-pr-7," +
      "Ghost-pr-1,Ghost-pr-2,Ghost-pr-3,Ghost-pr-4,Ghost-pr-5,Ghost-pr-6,Ghost-pr-7,Ghost-pr-8,Ghost-pr-9,Ghost-pr-10,Ghost-pr-11,Ghost-pr-12,Ghost-pr-13"
  ).split(",").map((s) => s.trim()).filter(Boolean),
);

const runs = JSON.parse(readFileSync(RUNS_IN, "utf8")) as BenchmarkRun[];
const gtByInst = new Map<string, BenchmarkRun["groundTruth"]>();
for (const r of runs) if (!gtByInst.has(r.instanceId)) gtByInst.set(r.instanceId, r.groundTruth ?? []);

interface Row { covered: number; total: number; }
const perRepo = new Map<string, Row>();
const coveredCats = new Set<string>();
const uncoveredCats = new Map<string, number>();
let covered = 0;
let total = 0;

for (const inst of PILOT) {
  const repo = repoOfInstance(inst);
  const gt = gtByInst.get(inst) ?? [];
  for (const g of gt) {
    const cat = (g.category ?? "").trim();
    if (!cat) continue; // functional bug, not a rule-violation
    total += 1;
    const row = perRepo.get(repo) ?? { covered: 0, total: 0 };
    row.total += 1;
    if (coversCategory(repo, cat)) { covered += 1; row.covered += 1; coveredCats.add(`${repo} :: ${cat}`); }
    else uncoveredCats.set(`${repo} :: ${cat}`, (uncoveredCats.get(`${repo} :: ${cat}`) ?? 0) + 1);
    perRepo.set(repo, row);
  }
}

const rate = total > 0 ? covered / total : 0;
console.log(`=== Grounding P0 coverage pre-flight (${PILOT.size} pilot PRs) ===`);
console.log(`pilot rule-violation GT: ${total}   covered by repo conventions: ${covered}   coverage = ${(rate * 100).toFixed(0)}%\n`);
for (const [repo, row] of perRepo) {
  console.log(`  ${repo.padEnd(12)} ${row.covered}/${row.total} = ${((row.covered / row.total) * 100).toFixed(0)}%   (convention set size: ${PROJECT_CONVENTIONS[repo]?.length ?? 0})`);
}
if (uncoveredCats.size > 0) {
  console.log(`\nUNCOVERED categories (candidate misses — add a convention or accept as out-of-scope):`);
  for (const [c, n] of [...uncoveredCats.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`);
}
console.log(`\nGO/NO-GO (threshold ${GO * 100}%): ${rate >= GO ? "GO — conventions cover the injected rules; grounding is testable." : "NO-GO — injected rules are not this repo's conventions; switch benchmark before the confirmatory arm."}`);
console.log(`\n--- rendered conventions block that the grounded reviewer would receive (Ghost example) ---`);
console.log(renderConventions("Ghost"));
