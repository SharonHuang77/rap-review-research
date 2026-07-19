// E3 (RAP-portal industrial study) persisted types. No I/O here.
import type { ReviewFinding } from "../models/finding.ts";
import type { FindingVerdict } from "../evaluation/industrial/models.ts";

/** The four-rung architecture ladder, run under the SUT family (Haiku). */
export const ARCHITECTURE_ARMS = ["agentless", "generalists-3", "hierarchical", "consensus"] as const;
export type ArchitectureArm = (typeof ARCHITECTURE_ARMS)[number];

/** Cross-family agentless arms (Bedrock model ids). Haiku = SUT / self-recurrence baseline. */
export const FAMILY_ARMS = [
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "moonshotai.kimi-k2.5",
  "zai.glm-5",
] as const;
export type FamilyArm = (typeof FAMILY_ARMS)[number];

/** Judge models (independent families), primary first. */
export const JUDGE_MODELS = ["us.amazon.nova-pro-v1:0", "deepseek.v3.2"] as const;

export interface RunCost {
  llmCalls: number; messageCount: number; latencyMs: number;
  estimatedCostUsd: number; inputTokens: number; outputTokens: number;
}

/** One persisted review run. `axis` says whether `arm` is an architecture or a family model id. */
export interface IndustrialRun {
  pr: string;
  snapshotId: string;
  axis: "architecture" | "family";
  arm: string;
  runIndex: number;
  findings: ReviewFinding[];
  cost: RunCost;
}

/** Judge verdicts keyed `${findingId}::${judgeModel}`. */
export type JudgeCache = Record<string, FindingVerdict>;

export const runKey = (r: { pr: string; axis: string; arm: string; runIndex: number }): string =>
  `${r.pr}|${r.axis}|${r.arm}|${r.runIndex}`;
export const judgeKey = (findingId: string, judgeModel: string): string => `${findingId}::${judgeModel}`;

/** The analysis output rendered by the dashboard. */
export interface IndustrialReport {
  meta: {
    prs: string[];
    runsPerArm: number;
    families: string[];
    judges: string[];
    /** Which analysis is confirmatory-primary (the cross-family depth table). */
    primary: string;
    /** Which analyses are secondary/proxy (per-arm P/R/F1 + ladder). */
    secondary: string;
    note: string;
  };
  perArm: Array<{ arm: ArchitectureArm; n: number; precision: number; recall: number; f1: number }>;
  ladder: unknown[];   // paired contrasts from src/analysis/stats
  depth: { hetero: Array<{ depth: number; genuine: number; total: number }>; homo: Array<{ depth: number; genuine: number; total: number }> };
  triangulation: { staticByDepth: unknown[]; laterFixByDepth: unknown[] };
  judgeKappa: number | null;
  cost: Array<{ arm: string; llmCalls: number; messageCount: number; latencyMs: number; estimatedCostUsd: number }>;
}
