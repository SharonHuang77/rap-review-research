// E3 analysis — replays persisted runs + judge cache into rap-portal-report.json.
// ZERO LLM. Run: node scripts/phase3-industrial-stats.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { IndustrialRun, JudgeCache } from "../src/industrial/models.ts";
import { buildIndustrialReport } from "../src/industrial/report.ts";
import { FindingPairScoreCache } from "../src/benchmark/matching/finding-pair-judge.ts";
import type { StaticAnalysisFinding, ChangedRange } from "../src/evaluation/industrial/models.ts";

const DIR = resolve(process.env.RAP_PORTAL_DIR ?? join(import.meta.dirname, "..", "rap-portal-results"));
const runs = JSON.parse(readFileSync(join(DIR, "runs.json"), "utf8")) as IndustrialRun[];
const judge = JSON.parse(readFileSync(join(DIR, "judge-cache.json"), "utf8")) as JudgeCache;
const pairCache = FindingPairScoreCache.fromJSON(
  JSON.parse(readFileSync(join(DIR, "pair-judge-cache.json"), "utf8")) as Record<string, number>,
);

// optional triangulation inputs (Task 7); absent → the report leaves those tables empty
const loadOptional = <T>(name: string): T | undefined => {
  const p = join(DIR, name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : undefined;
};
const staticByPr = loadOptional<Record<string, StaticAnalysisFinding[]>>("static.json");
const laterFixByPr = loadOptional<Record<string, ChangedRange[]>>("laterfix.json");

const report = buildIndustrialReport(runs, judge, pairCache, { staticByPr, laterFixByPr });
const out = join(import.meta.dirname, "..", "apps", "research-workbench", "rap-portal-report.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`wrote ${out}`);
for (const a of report.perArm) console.log(`  ${a.arm.padEnd(14)} P=${a.precision} R=${a.recall} F1=${a.f1} (n=${a.n})`);
