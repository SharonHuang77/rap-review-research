/**
 * Demo: Decentralized Consensus review end-to-end with a mock provider (RFC-09).
 *
 * Run with: `npm run demo:consensus`
 *
 *   sample.diff → PR Import → Experiment Engine → Consensus (independent review →
 *   exchange → revision → voting → synthesis) → Validation → Storage → Evaluation
 *
 * No Bedrock. Prints the result, stored metrics (llmCalls = 9), and evaluation.
 */
import { readFileSync } from "node:fs";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { createConsensusArchitecture } from "../src/architectures/consensus/index.ts";
import { PromptBuilder } from "../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { MockProvider } from "../src/llm/provider/mock-provider.ts";
import type { LLMReviewRequest } from "../src/llm/models/llm-review-request.ts";
import { EvaluationEngine } from "../src/evaluation/index.ts";

const REVIEW_JSON = JSON.stringify({
  summary: "Specialist review of the change.",
  riskLevel: "medium",
  findings: [
    {
      title: "Shared concern",
      severity: "medium",
      category: "correctness",
      file: "src/api/users.ts",
      line: 11,
      description: "filter(Boolean) may mask data issues.",
      recommendation: "Validate upstream instead.",
      confidence: 0.7,
    },
  ],
});
const VOTE_JSON = JSON.stringify({
  votes: [{ candidateId: "candidate-1", vote: "accept", reason: "agree", confidence: 0.8 }],
});

const responder = (request: LLMReviewRequest) =>
  request.systemPrompt.includes("voting round") ? { text: VOTE_JSON } : { text: REVIEW_JSON };

const snapshots = new InMemorySnapshotRepository();
const rawDiffStorage = new InMemoryRawDiffStorage();

const registry = new InMemoryArchitectureRegistry();
registry.register(
  createConsensusArchitecture({
    provider: new MockProvider({ responder }),
    promptBuilder: new PromptBuilder({ loader: new PromptLoader(), contextBuilder: new ContextBuilder() }),
    rawDiffStorage,
  }),
);

const importCtx = createPRImportService({ snapshots, rawDiffStorage });
const experimentCtx = createExperimentService({ snapshots, registry });

const rawDiff = readFileSync(new URL("../tests/fixtures/sample.diff", import.meta.url), "utf8");
const { snapshotId } = await importCtx.service.importManualDiff({
  title: "Add user filtering + list component",
  source: "manual",
  rawDiff,
});
const run = await experimentCtx.service.runExperiment({
  snapshotId,
  architecture: "consensus",
  modelVersion: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  promptVersion: "v1",
  workflowVersion: "workflow-v1",
  evaluationVersion: "eval-v1",
});

const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
if (!stored) {
  throw new Error("no stored result");
}
const metrics = new EvaluationEngine().evaluate(stored);

console.log("--- experiment ---");
console.log(JSON.stringify(run, null, 2));
console.log("\n--- stored validated result ---");
console.log(
  JSON.stringify(
    {
      architecture: stored.validatedResult?.architecture,
      llmCalls: stored.validatedResult?.llmCalls,
      messageCount: stored.validatedResult?.messageCount,
      findings: stored.validatedResult?.findings.length,
      summary: stored.validatedResult?.summary,
    },
    null,
    2,
  ),
);
console.log("\n--- evaluation ---");
console.log(JSON.stringify(metrics, null, 2));
