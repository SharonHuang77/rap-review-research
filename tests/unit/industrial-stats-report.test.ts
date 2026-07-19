import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndustrialReport } from "../../src/industrial/report.ts";
import type { IndustrialRun, JudgeCache } from "../../src/industrial/models.ts";
import { judgeKey } from "../../src/industrial/models.ts";
import { FindingPairScoreCache } from "../../src/benchmark/matching/finding-pair-judge.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";

const f = (id: string, file: string, line: number, t: string): ReviewFinding => ({
  id, title: t, category: "correctness", severity: "medium", file, line,
  description: t, recommendation: "fix", confidence: 0.7,
});
const cost = { llmCalls: 1, messageCount: 1, latencyMs: 100, estimatedCostUsd: 0.01, inputTokens: 10, outputTokens: 5 };
const run = (over: Partial<IndustrialRun>): IndustrialRun => ({
  pr: "1", snapshotId: "s1", axis: "architecture", arm: "agentless", runIndex: 0, findings: [], cost, ...over,
});

test("buildIndustrialReport yields per-arm proxy metrics and a depth table", () => {
  const fa = f("a", "x.ts", 10, "null deref"); // agentless arm + Haiku family
  const fb = f("b", "x.ts", 10, "null deref"); // Kimi family — same issue as fa
  const runs: IndustrialRun[] = [
    run({ axis: "architecture", arm: "agentless", findings: [fa] }),
    run({ axis: "family", arm: "us.anthropic.claude-haiku-4-5-20251001-v1:0", findings: [fa] }),
    run({ axis: "family", arm: "moonshotai.kimi-k2.5", findings: [fb] }),
  ];
  const judge: JudgeCache = {
    [judgeKey("a", "us.amazon.nova-pro-v1:0")]: "valid",
    [judgeKey("b", "us.amazon.nova-pro-v1:0")]: "valid",
  };
  const pairCache = new FindingPairScoreCache();
  pairCache.set(fa, fb, 0.9);                       // Haiku≈Kimi → a depth-2 cross-family cluster
  const report = buildIndustrialReport(runs, judge, pairCache, { primaryJudge: "us.amazon.nova-pro-v1:0" });
  const agentless = report.perArm.find((a) => a.arm === "agentless")!;
  assert.equal(agentless.precision, 1);            // its one finding judged valid
  assert.ok(report.depth.hetero.length >= 1);       // a cross-family depth table exists
  assert.equal(report.meta.prs.length, 1);
});

test("buildIndustrialReport buckets static triangulation by depth when provided", () => {
  const fa = f("a", "x.ts", 10, "null deref");
  const fb = f("b", "x.ts", 10, "null deref");
  const runs: IndustrialRun[] = [
    run({ axis: "family", arm: "us.anthropic.claude-haiku-4-5-20251001-v1:0", findings: [fa] }),
    run({ axis: "family", arm: "moonshotai.kimi-k2.5", findings: [fb] }),
  ];
  const judge: JudgeCache = {};
  const pairCache = new FindingPairScoreCache();
  pairCache.set(fa, fb, 0.9);
  const report = buildIndustrialReport(runs, judge, pairCache, {
    staticByPr: { "1": [{ file: "x.ts", line: 10, rule: "TS2345", category: "type" }] },
  });
  assert.ok(report.triangulation.staticByDepth.length >= 1);
});
