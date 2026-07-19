// E3 analysis — replays persisted runs + judge cache into rap-portal-report.json.
// ZERO LLM. Run: node scripts/phase3-industrial-stats.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { IndustrialRun, JudgeCache } from "../src/industrial/models.ts";
import { buildIndustrialReport } from "../src/industrial/report.ts";
import { FindingPairScoreCache } from "../src/benchmark/matching/finding-pair-judge.ts";

const DIR = resolve(process.env.RAP_PORTAL_DIR ?? join(import.meta.dirname, "..", "rap-portal-results"));
const runs = JSON.parse(readFileSync(join(DIR, "runs.json"), "utf8")) as IndustrialRun[];
const judge = JSON.parse(readFileSync(join(DIR, "judge-cache.json"), "utf8")) as JudgeCache;
const pairCache = FindingPairScoreCache.fromJSON(
  JSON.parse(readFileSync(join(DIR, "pair-judge-cache.json"), "utf8")) as Record<string, number>,
);

const report = buildIndustrialReport(runs, judge, pairCache);
const out = join(import.meta.dirname, "..", "apps", "research-workbench", "rap-portal-report.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`wrote ${out}`);
for (const a of report.perArm) console.log(`  ${a.arm.padEnd(14)} P=${a.precision} R=${a.recall} F1=${a.f1} (n=${a.n})`);
