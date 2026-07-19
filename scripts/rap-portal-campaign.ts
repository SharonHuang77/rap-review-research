/**
 * E3 live campaign — runs the 4-architecture ladder (Haiku) + cross-family
 * agentless (Haiku/Kimi/GLM), 3 runs each, over ~30 RAP-portal PRs, judges every
 * finding (Nova + DeepSeek), builds the Nova finding↔finding pair-judge cache,
 * and PERSISTS runs + judge cache + pair cache for zero-LLM replay.
 *
 * Preconditions: `gh auth status` (read access to logisticPM/portal), `aws sso login`
 * + Bedrock access to all reviewer + judge models, and s3:PutObject on the research
 * bucket (for the per-PR auto-upload). Run: `npm run rap-portal:run`
 * Env: RAP_PRS=12,13,14 (explicit) or RAP_PR_LIMIT=30 (auto-pick merged PRs);
 *      RUNS_PER_ARM=3; RAP_PORTAL_DIR=rap-portal-results;
 *      RAP_PORTAL_S3=s3://…/confirmatory/rap-portal/ (auto-upload dest; set empty
 *      or RAP_PORTAL_NO_UPLOAD=1 to disable)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { createPRImportService } from "../src/services/snapshot/index.ts";
import { createExperimentService } from "../src/services/experiment/index.ts";
import { InMemorySnapshotRepository } from "../src/repositories/in-memory/in-memory-snapshot-repository.ts";
import { InMemoryRawDiffStorage } from "../src/storage/in-memory/in-memory-raw-diff-storage.ts";
import { InMemoryArchitectureRegistry } from "../src/architectures/in-memory-architecture-registry.ts";
import { AgentlessArchitecture } from "../src/architectures/agentless/agentless-architecture.ts";
import { createGeneralistsArchitecture } from "../src/architectures/generalists/index.ts";
import { createHierarchicalArchitecture } from "../src/architectures/hierarchical/index.ts";
import { createConsensusArchitecture } from "../src/architectures/consensus/index.ts";
import { PromptBuilder } from "../src/llm/prompts/prompt-builder.ts";
import { PromptLoader } from "../src/llm/prompts/prompt-loader.ts";
import { ContextBuilder } from "../src/llm/prompts/context-builder.ts";
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import {
  buildFindingPairPrompt,
  DEFAULT_PAIR_JUDGE_CONFIG,
  FindingPairScoreCache,
  listCandidatePairs,
  type MemberFinding,
} from "../src/benchmark/matching/finding-pair-judge.ts";
import { parseJudgeScore } from "../src/benchmark/matching/judge-prompt.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import type { ReviewArchitecture } from "../src/models/experiment.ts";
import type { FindingVerdict } from "../src/evaluation/industrial/models.ts";
import { ARCHITECTURE_ARMS, FAMILY_ARMS, JUDGE_MODELS, judgeKey, type IndustrialRun, type JudgeCache } from "../src/industrial/models.ts";

const REPO = process.env.RAP_REPO ?? "logisticPM/portal";
const RUNS = Math.max(1, Number(process.env.RUNS_PER_ARM ?? 3));
const DIR = resolve(process.env.RAP_PORTAL_DIR ?? "rap-portal-results");
mkdirSync(DIR, { recursive: true });

// --- S3 auto-upload (best-effort; local disk stays the source of truth) ---
const S3_DEST = process.env.RAP_PORTAL_S3 ?? "s3://rap-review-research-data-106189426706/confirmatory/rap-portal/";
const S3_UPLOAD = S3_DEST !== "" && process.env.RAP_PORTAL_NO_UPLOAD !== "1";
function uploadToS3(): void {
  if (!S3_UPLOAD) return;
  try {
    // sync mirrors the whole results dir → runs/judge/pair-judge/static/laterfix .json
    execFileSync("aws", ["s3", "sync", DIR, S3_DEST, "--only-show-errors"], { stdio: "inherit" });
    console.log(`  ↑ synced ${DIR} → ${S3_DEST}`);
  } catch (e) {
    console.warn(`  ⚠ S3 upload failed (local copy kept, run stays resumable): ${String(e)}`);
  }
}

const gh = (args: string[]): string => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
function selectPRs(): string[] {
  if (process.env.RAP_PRS) return process.env.RAP_PRS.split(",").map((s) => s.trim());
  const limit = Number(process.env.RAP_PR_LIMIT ?? 30);
  const json = gh(["pr", "list", "-R", REPO, "--state", "merged", "--limit", String(limit * 2), "--json", "number,files"]);
  const prs = JSON.parse(json) as Array<{ number: number; files?: Array<{ path: string }> }>;
  const substantive = prs.filter((p) => (p.files ?? []).some((f) => /\.(ts|tsx|js|jsx|py|go|java|rb)$/.test(f.path)));
  return substantive.slice(0, limit).map((p) => String(p.number));
}
function fetchDiff(pr: string): { title: string; diff: string } {
  const title = gh(["pr", "view", pr, "-R", REPO, "--json", "title", "-q", ".title"]).trim();
  const diff = gh(["pr", "diff", pr, "-R", REPO]);
  return { title, diff };
}

// --- provider + architectures ---
const provider = new BedrockProvider();
const promptBuilder = new PromptBuilder({ loader: new PromptLoader(), contextBuilder: new ContextBuilder() });
const rawDiffStorage = new InMemoryRawDiffStorage();
const registry = new InMemoryArchitectureRegistry();
registry.register(new AgentlessArchitecture({ provider, promptBuilder, rawDiffStorage }));
registry.register(createGeneralistsArchitecture({ provider, promptBuilder, rawDiffStorage }));
registry.register(createHierarchicalArchitecture({ provider, promptBuilder, rawDiffStorage }));
registry.register(createConsensusArchitecture({ provider, promptBuilder, rawDiffStorage }));
const snapshots = new InMemorySnapshotRepository();
const importCtx = createPRImportService({ snapshots, rawDiffStorage });
const experimentCtx = createExperimentService({ snapshots, registry });

const VERDICTS: readonly FindingVerdict[] = ["valid", "invalid", "uncertain"];

async function judge(model: string, diff: string, findings: ReviewFinding[]): Promise<Record<string, FindingVerdict>> {
  if (findings.length === 0) return {};
  // E1's completeness instrument: "is this a genuine problem, given the diff?"
  const list = findings.map((f) => `- ${f.id}: [${f.severity}] ${f.file}:${f.line} — ${f.title}: ${f.description}`).join("\n");
  try {
    const res = await provider.review({
      modelId: model,
      temperature: 0,
      maxTokens: 1024,
      systemPrompt:
        "You are an impartial senior engineer acting as a JUDGE. You did not write these findings. " +
        "For each finding, decide — based only on the diff — whether it is a genuine issue. " +
        'Respond with a single JSON object mapping each finding id to "valid", "invalid", or "uncertain". No prose.',
      userPrompt: `## Diff\n\n${diff}\n\n## Findings\n\n${list}\n\n## Respond JSON only\n{ "<id>": "valid | invalid | uncertain" }`,
    });
    const start = res.text.indexOf("{");
    const end = res.text.lastIndexOf("}");
    if (start === -1 || end < start) return {};
    const parsed = JSON.parse(res.text.slice(start, end + 1)) as Record<string, unknown>;
    const ids = new Set(findings.map((f) => f.id));
    const out: Record<string, FindingVerdict> = {};
    for (const [id, raw] of Object.entries(parsed)) {
      const v = typeof raw === "string" ? (raw.toLowerCase() as FindingVerdict) : undefined;
      if (v && ids.has(id) && VERDICTS.includes(v)) out[id] = v;
    }
    return out;
  } catch { return {}; }
}

async function runArm(pr: string, snapshotId: string, axis: "architecture" | "family", arm: string, modelVersion: string, runIndex: number): Promise<IndustrialRun | null> {
  // In the family axis every arm is agentless run under a different model id; in the
  // architecture axis `arm` is one of ARCHITECTURE_ARMS (⊆ ReviewArchitecture).
  const architecture: ReviewArchitecture = axis === "family" ? "agentless" : (arm as ReviewArchitecture);
  const run = await experimentCtx.service.runExperiment({ snapshotId, architecture, modelVersion, promptVersion: "v1", workflowVersion: "workflow-v1", evaluationVersion: "eval-v1" });
  const stored = await experimentCtx.storage.getExperimentResult(run.experimentId);
  const v = stored?.validatedResult;
  if (!v) return null;
  return { pr, snapshotId, axis, arm, runIndex, findings: v.findings, cost: { llmCalls: v.llmCalls, messageCount: v.messageCount, latencyMs: v.latencyMs, estimatedCostUsd: v.estimatedCostUsd, inputTokens: v.inputTokens, outputTokens: v.outputTokens } };
}

/**
 * Build the Nova finding↔finding pair-judge cache over the family ∪ architecture-arm
 * union for one PR: every distinct SOURCE (each family and each architecture arm)
 * is a member, so listCandidatePairs yields cross-source same-file pairs. New pairs
 * are judged once and cached (τ_pair=0.7 applied later at cluster time), so the pool
 * (Task 2) and depth (Task 4) clustering match E1's instrument exactly.
 */
async function judgePairCache(prRuns: IndustrialRun[], cache: FindingPairScoreCache): Promise<void> {
  const members: MemberFinding[] = [];
  let member = 0;
  const bySource = new Map<string, ReviewFinding[]>();
  for (const r of prRuns) {
    const key = `${r.axis}:${r.arm}`;
    bySource.set(key, [...(bySource.get(key) ?? []), ...r.findings]);
  }
  for (const [, findings] of bySource) {
    for (const finding of findings) members.push({ finding, member });
    member += 1;
  }
  for (const [a, b] of listCandidatePairs(members)) {
    if (cache.has(a, b)) continue;
    try {
      const res = await provider.review(buildFindingPairPrompt(a, b, DEFAULT_PAIR_JUDGE_CONFIG));
      const score = parseJudgeScore(res.text);
      if (score !== undefined) cache.set(a, b, score);
    } catch { /* leave unjudged; a later resume retries */ }
  }
}

// --- main (resumable: skip PRs already in runs.json) ---
const RUNS_PATH = join(DIR, "runs.json");
const JUDGE_PATH = join(DIR, "judge-cache.json");
const PAIR_PATH = join(DIR, "pair-judge-cache.json");
const runs: IndustrialRun[] = existsSync(RUNS_PATH) ? JSON.parse(readFileSync(RUNS_PATH, "utf8")) : [];
const judgeCache: JudgeCache = existsSync(JUDGE_PATH) ? JSON.parse(readFileSync(JUDGE_PATH, "utf8")) : {};
const pairCache: FindingPairScoreCache = existsSync(PAIR_PATH)
  ? FindingPairScoreCache.fromJSON(JSON.parse(readFileSync(PAIR_PATH, "utf8")) as Record<string, number>)
  : new FindingPairScoreCache();
const done = new Set(runs.map((r) => r.pr));
const HAIKU = FAMILY_ARMS[0];

for (const pr of selectPRs()) {
  if (done.has(pr)) { console.log(`PR #${pr} — already done, skipping`); continue; }
  let title: string, diff: string;
  try { ({ title, diff } = fetchDiff(pr)); } catch (e) { console.error(`PR #${pr} fetch failed: ${String(e)}`); continue; }
  if (diff.trim().length === 0) { console.log(`PR #${pr} empty diff, skip`); continue; }
  const { snapshotId } = await importCtx.service.importManualDiff({ title: `[RAP] #${pr} ${title}`, source: "manual", rawDiff: diff });
  console.log(`PR #${pr} "${title}"`);

  const prRuns: IndustrialRun[] = [];
  for (let i = 0; i < RUNS; i++) {
    for (const arm of ARCHITECTURE_ARMS) { const r = await runArm(pr, snapshotId, "architecture", arm, HAIKU, i); if (r) prRuns.push(r); }
    for (const fam of FAMILY_ARMS) { const r = await runArm(pr, snapshotId, "family", fam, fam, i); if (r) prRuns.push(r); }
  }
  // judge every distinct finding with every judge model
  const allFindings = new Map<string, ReviewFinding>();
  for (const r of prRuns) for (const f of r.findings) allFindings.set(f.id, f);
  for (const model of JUDGE_MODELS) {
    const verdicts = await judge(model, diff, [...allFindings.values()]);
    for (const [id, v] of Object.entries(verdicts)) judgeCache[judgeKey(id, model)] = v;
  }
  // Nova finding↔finding pair-judge cache (Comparability Contract) over this PR's union
  await judgePairCache(prRuns, pairCache);

  runs.push(...prRuns);
  writeFileSync(RUNS_PATH, JSON.stringify(runs, null, 2));      // persist after each PR (resume-safe)
  writeFileSync(JUDGE_PATH, JSON.stringify(judgeCache, null, 2));
  writeFileSync(PAIR_PATH, JSON.stringify(pairCache.toJSON(), null, 2));
  uploadToS3();                                                 // auto-backup the whole DIR to S3 after each PR
  console.log(`  persisted ${prRuns.length} runs; ${Object.keys(judgeCache).length} judge verdicts; ${pairCache.size} pair scores`);
}
uploadToS3();  // final flush (captures pair-judge-cache.json / static.json / laterfix.json too, if present)
console.log(`done — ${runs.length} runs over ${new Set(runs.map((r) => r.pr)).size} PRs → ${DIR}${S3_UPLOAD ? ` (mirrored to ${S3_DEST})` : ""}`);
