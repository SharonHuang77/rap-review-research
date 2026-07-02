import type { AgentRole } from "../messages.ts";
import type { ReviewExecutionInput } from "../../../models/review-result.ts";
import type { ReviewFinding, SeverityLevel } from "../../../models/finding.ts";
import type { SpecialistReviewResult } from "../models/specialist-review-result.ts";
import type { ILLMProvider } from "../../../llm/provider/llm-provider.ts";
import type { PromptBuilder } from "../../../llm/prompts/prompt-builder.ts";
import type { RawDiffStorage } from "../../../storage/raw-diff-storage.ts";
import type { LLMConfig } from "../../../config/llm.ts";

import { LLM_CONFIG } from "../../../config/llm.ts";

/**
 * The specialist plugin contract. The Manager depends only on
 * `IReviewSpecialist[]` — never on concrete reviewer classes — so new
 * specialists (security, performance, …) can be added without changing it.
 * Mirrors `IReviewArchitecture` / `ILLMProvider` / `IEvidenceScorer`.
 */
export interface IReviewSpecialist {
  readonly role: AgentRole;
  review(input: ReviewExecutionInput): Promise<SpecialistReviewResult>;
}

export interface ReviewSpecialistDependencies {
  readonly provider: ILLMProvider;
  readonly promptBuilder: PromptBuilder;
  readonly rawDiffStorage: RawDiffStorage;
  readonly config?: LLMConfig;
}

/**
 * Shared base for LLM-backed specialists.
 *
 * Each specialist independently builds a role-specific prompt (common
 * instructions + `hierarchical/<role>` template) via the shared PromptBuilder,
 * makes exactly one `ILLMProvider` call, and surfaces its findings. It never
 * calls Bedrock directly and never touches domain repositories (only the
 * RawDiffStorage port, as Agentless does).
 */
export class LlmReviewSpecialist implements IReviewSpecialist {
  public readonly role: AgentRole;
  private readonly provider: ILLMProvider;
  private readonly promptBuilder: PromptBuilder;
  private readonly rawDiffStorage: RawDiffStorage;
  private readonly config: LLMConfig;

  public constructor(role: AgentRole, deps: ReviewSpecialistDependencies) {
    this.role = role;
    this.provider = deps.provider;
    this.promptBuilder = deps.promptBuilder;
    this.rawDiffStorage = deps.rawDiffStorage;
    this.config = deps.config ?? LLM_CONFIG;
  }

  public async review(
    input: ReviewExecutionInput,
  ): Promise<SpecialistReviewResult> {
    const rawDiff = await this.rawDiffStorage.getRawDiff(
      input.snapshot.rawDiffS3Key,
    );
    const request = this.promptBuilder.build({
      promptVersion: input.promptVersion,
      role: { category: "hierarchical", name: this.role },
      snapshot: input.snapshot,
      rawDiff,
      modelId: input.modelVersion,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    const response = await this.provider.review(request);
    const parsed = parseSpecialistReview(response.text, this.role);

    return {
      role: this.role,
      summary: parsed.summary,
      findings: parsed.findings,
      latencyMs: response.latencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      estimatedCostUsd: response.estimatedCostUsd,
    };
  }
}

const SEVERITIES: readonly SeverityLevel[] = ["low", "medium", "high", "critical"];

/**
 * Tolerant, best-effort surfacing of a specialist's JSON output into typed
 * findings. NOT validation: it never throws and never invents data — findings
 * missing required fields are skipped. Authoritative schema validation still
 * happens downstream on the merged RawReviewResult (RFC-05).
 */
export function parseSpecialistReview(
  text: string,
  role: AgentRole,
): { summary: string; findings: ReviewFinding[] } {
  try {
    const cleaned = text.replace(/```[a-zA-Z0-9]*/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end < start) {
      return { summary: "", findings: [] };
    }
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

    const findings: ReviewFinding[] = [];
    rawFindings.forEach((raw, index) => {
      const finding = toReviewFinding(raw, role, index);
      if (finding) {
        findings.push(finding);
      }
    });
    return { summary, findings };
  } catch {
    return { summary: "", findings: [] };
  }
}

/** Map a raw finding object to a ReviewFinding, or null if it is incomplete. */
function toReviewFinding(
  raw: unknown,
  role: AgentRole,
  index: number,
): ReviewFinding | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const f = raw as Record<string, unknown>;
  const severity =
    typeof f.severity === "string" ? f.severity.toLowerCase() : "";
  if (!SEVERITIES.includes(severity as SeverityLevel)) {
    return null;
  }
  if (
    typeof f.title !== "string" ||
    typeof f.category !== "string" ||
    typeof f.file !== "string" ||
    typeof f.line !== "number" ||
    typeof f.description !== "string" ||
    typeof f.recommendation !== "string" ||
    typeof f.confidence !== "number"
  ) {
    return null;
  }
  return {
    id: `${role}-${index + 1}`,
    title: f.title,
    severity: severity as SeverityLevel,
    category: f.category.toLowerCase(),
    file: f.file,
    line: f.line,
    description: f.description,
    recommendation: f.recommendation,
    confidence: Math.max(0, Math.min(1, f.confidence)),
  };
}
