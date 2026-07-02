/**
 * Sample Workbench data for the dashboard demo.
 *
 * The HTTP APIs that would feed a real deployment are not wired yet, so this
 * seeds the existing Workbench (RFC-11) with representative artifacts for one
 * snapshot reviewed by all three architectures — Agentless, Hierarchical, and
 * Consensus — plus recorded conversations and export history.
 *
 * This is presentation-layer composition: it reuses the real Storage,
 * Evaluation, Export, and Workbench services and adds no new business logic and
 * no metric calculation.
 */
import type { Experiment, ReviewArchitecture } from "../../src/models/experiment.ts";
import type { PRSnapshot } from "../../src/models/snapshot.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";
import type {
  IStorageEngine,
  StoreRawResultInput,
  StoreValidatedResultInput,
} from "../../src/storage/storage-engine.ts";
import type {
  StoredExperimentResult,
  StoredValidatedReviewResult,
} from "../../src/storage/stored-models.ts";
import type { ExperimentComparison } from "../../src/evaluation/index.ts";
import type {
  IResearchWorkbench,
  SnapshotReadPort,
} from "../../src/workbench/index.ts";

import { ConversationHistory } from "../../src/architectures/shared/conversation-history.ts";
import { EvaluationEngine } from "../../src/evaluation/index.ts";
import { createExportService } from "../../src/export/index.ts";
import { createResearchWorkbench } from "../../src/workbench/index.ts";

const SNAPSHOT_ID = "snap_demo";
const MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const GENERATED_AT = "2026-07-02T12:00:00.000Z";

function experimentId(architecture: ReviewArchitecture): string {
  return `${SNAPSHOT_ID}#${architecture}#${MODEL}#v1#w1#e1`;
}

interface Cost {
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly llmCalls: number;
  readonly messageCount: number;
}

function finding(overrides: Partial<ReviewFinding>): ReviewFinding {
  return {
    id: "f",
    title: "Issue",
    category: "correctness",
    severity: "medium",
    file: "src/app.ts",
    line: 1,
    description: "An issue.",
    recommendation: "Fix it.",
    confidence: 0.7,
    ...overrides,
  };
}

function buildStored(
  architecture: ReviewArchitecture,
  summary: string,
  findings: ReviewFinding[],
  cost: Cost,
): StoredExperimentResult {
  const id = experimentId(architecture);
  const validatedResult: StoredValidatedReviewResult = {
    experimentId: id,
    architecture,
    summary,
    findings,
    validation: {
      schemaVersion: "review-result-v1",
      promptVersion: "v1",
      validationPassed: true,
      repaired: false,
      repairActions: [],
    },
    latencyMs: cost.latencyMs,
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    estimatedCostUsd: cost.estimatedCostUsd,
    llmCalls: cost.llmCalls,
    messageCount: cost.messageCount,
    storedAt: GENERATED_AT,
  };
  return {
    experimentId: id,
    rawResult: null,
    validatedResult,
    findings: findings.map((f) => ({
      ...f,
      experimentId: id,
      architecture,
      storedAt: GENERATED_AT,
    })),
  };
}

/** In-memory storage seeded with the sample stored results. */
class SampleStorage implements IStorageEngine {
  private readonly byId = new Map<string, StoredExperimentResult>();
  public seed(result: StoredExperimentResult): void {
    this.byId.set(result.experimentId, result);
  }
  public async storeRawResult(_input: StoreRawResultInput): Promise<void> {}
  public async storeValidatedResult(
    _input: StoreValidatedResultInput,
  ): Promise<void> {}
  public async getExperimentResult(
    id: string,
  ): Promise<StoredExperimentResult | null> {
    return this.byId.get(id) ?? null;
  }
}

function buildExperiment(
  architecture: ReviewArchitecture,
  cost: Cost,
  createdAt: string,
): Experiment {
  return {
    experimentId: experimentId(architecture),
    snapshotId: SNAPSHOT_ID,
    architecture,
    modelVersion: MODEL,
    promptVersion: "v1",
    workflowVersion: "w1",
    evaluationVersion: "e1",
    status: "completed",
    createdAt,
    startedAt: createdAt,
    completedAt: createdAt,
    totalLatencyMs: cost.latencyMs,
    totalInputTokens: cost.inputTokens,
    totalOutputTokens: cost.outputTokens,
    estimatedCostUsd: cost.estimatedCostUsd,
  };
}

const SNAPSHOT: PRSnapshot = {
  snapshotId: SNAPSHOT_ID,
  source: "manual",
  title: "Add user filtering + list component",
  description: "Adds a filter API and a UserList component.",
  rawDiffS3Key: "raw/snap_demo.diff",
  changedFiles: [
    {
      path: "src/api/users.ts",
      changeType: "modified",
      additions: 12,
      deletions: 2,
      changedLineRanges: [],
    },
    {
      path: "src/components/UserList.tsx",
      changeType: "added",
      additions: 20,
      deletions: 0,
      changedLineRanges: [],
    },
  ],
  totalChangedLines: 34,
  category: "cross-component",
  complexity: "medium",
  importedAt: GENERATED_AT,
};

const snapshotPort: SnapshotReadPort = {
  async getById(id: string) {
    return id === SNAPSHOT_ID ? SNAPSHOT : null;
  },
};

/** The demo-ready sample Workbench and the comparisons used for exports. */
export interface SampleWorkbench {
  readonly workbench: IResearchWorkbench;
  readonly snapshotId: string;
  readonly comparisons: ExperimentComparison[];
}

export async function buildSampleWorkbench(): Promise<SampleWorkbench> {
  const agentlessCost: Cost = {
    latencyMs: 820,
    inputTokens: 400,
    outputTokens: 210,
    estimatedCostUsd: 0.006,
    llmCalls: 1,
    messageCount: 1,
  };
  const hierarchicalCost: Cost = {
    latencyMs: 2540,
    inputTokens: 1500,
    outputTokens: 720,
    estimatedCostUsd: 0.031,
    llmCalls: 3,
    messageCount: 8,
  };
  const consensusCost: Cost = {
    latencyMs: 3180,
    inputTokens: 1800,
    outputTokens: 910,
    estimatedCostUsd: 0.041,
    llmCalls: 4,
    messageCount: 10,
  };

  const stored: StoredExperimentResult[] = [
    buildStored(
      "agentless",
      "Baseline review: one stub component and a missing guard.",
      [
        finding({ id: "a1", title: "Stub component", severity: "medium", file: "src/components/UserList.tsx", line: 2 }),
        finding({ id: "a2", title: "Missing null guard", severity: "high", category: "correctness", file: "src/api/users.ts", line: 11, confidence: 0.9 }),
      ],
      agentlessCost,
    ),
    buildStored(
      "hierarchical",
      "Manager-coordinated review across backend/frontend specialists.",
      [
        finding({ id: "h1", title: "Unvalidated query param", severity: "high", category: "security", file: "src/api/users.ts", line: 8, confidence: 0.85 }),
        finding({ id: "h2", title: "Unhandled empty state", severity: "low", file: "src/components/UserList.tsx", line: 14, confidence: 0.6 }),
        finding({ id: "h3", title: "Possible SQL injection", severity: "critical", category: "security", file: "src/api/users.ts", line: 9, confidence: 0.95 }),
      ],
      hierarchicalCost,
    ),
    buildStored(
      "consensus",
      "Peer specialists reviewed independently and voted.",
      [
        finding({ id: "c1", title: "Weak input validation", severity: "medium", category: "security", file: "src/api/users.ts", line: 8, confidence: 0.75 }),
        finding({ id: "c2", title: "Component lacks tests", severity: "medium", category: "maintainability", file: "src/components/UserList.tsx", line: 1, confidence: 0.7 }),
      ],
      consensusCost,
    ),
  ];

  const storage = new SampleStorage();
  for (const result of stored) {
    storage.seed(result);
  }

  const wb = createResearchWorkbench({ storage, snapshots: snapshotPort });

  wb.experiments.add(buildExperiment("agentless", agentlessCost, "2026-07-02T10:00:00.000Z"));
  wb.experiments.add(buildExperiment("hierarchical", hierarchicalCost, "2026-07-02T10:05:00.000Z"));
  wb.experiments.add(buildExperiment("consensus", consensusCost, "2026-07-02T10:10:00.000Z"));

  // Recorded conversations power the replay timelines for the multi-agent runs.
  wb.conversations.record(experimentId("hierarchical"), hierarchicalConversation());
  wb.conversations.record(experimentId("consensus"), consensusConversation());

  // Produce two exports with the real RFC-10 Export Service and record their
  // metadata — the Workbench never generates exports itself.
  const comparisons = new EvaluationEngine().evaluateBatch(stored);
  const exporter = createExportService();
  const input = { generatedAt: GENERATED_AT, comparisons };
  wb.exportHistory.record(await exporter.exportComparisons(input, "csv"));
  wb.exportHistory.record(await exporter.exportComparisons(input, "json"));

  return { workbench: wb.workbench, snapshotId: SNAPSHOT_ID, comparisons };
}

function hierarchicalConversation(): ConversationHistory {
  const h = new ConversationHistory();
  h.record({ from: "manager", to: "backend", type: "review-request", content: { area: "backend" }, timestamp: "2026-07-02T10:05:01.000Z" });
  h.record({ from: "backend", to: "manager", type: "review-response", content: { findings: 2 }, timestamp: "2026-07-02T10:05:02.000Z" });
  h.record({ from: "manager", to: "frontend", type: "review-request", content: { area: "frontend" }, timestamp: "2026-07-02T10:05:03.000Z" });
  h.record({ from: "frontend", to: "manager", type: "review-response", content: { findings: 1 }, timestamp: "2026-07-02T10:05:04.000Z" });
  h.record({ from: "manager", to: "manager", type: "merge-response", content: { merged: 3 }, timestamp: "2026-07-02T10:05:05.000Z" });
  return h;
}

function consensusConversation(): ConversationHistory {
  const h = new ConversationHistory();
  h.record({ from: "coordinator", to: "backend", type: "review-request", content: { round: 1 }, timestamp: "2026-07-02T10:10:01.000Z" });
  h.record({ from: "backend", to: "frontend", type: "exchange", content: { note: "shared findings" }, timestamp: "2026-07-02T10:10:02.000Z" });
  h.record({ from: "coordinator", to: "backend", type: "revision-request", content: { round: 2 }, timestamp: "2026-07-02T10:10:03.000Z" });
  h.record({ from: "backend", to: "coordinator", type: "vote-response", content: { vote: "accept" }, timestamp: "2026-07-02T10:10:04.000Z" });
  h.record({ from: "frontend", to: "coordinator", type: "vote-response", content: { vote: "accept" }, timestamp: "2026-07-02T10:10:05.000Z" });
  h.record({ from: "coordinator", to: "coordinator", type: "synthesis", content: { accepted: 2 }, timestamp: "2026-07-02T10:10:06.000Z" });
  return h;
}
