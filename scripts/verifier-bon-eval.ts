/**
 * Verifier-Filtered Best-of-N (VF-BoN) — V0/V1/V2 replay evaluation (doc 08).
 *
 * EXPLORATORY follow-up, not part of the registered confirmatory analysis.
 * Pools each arm's persisted repeated runs into a best-of-N candidate set and
 * applies verifiers of increasing strength:
 *
 *   V0      raw union of the N runs (recall ceiling / precision floor)
 *   V1 (k)  self-consistency: keep findings recurring in >= k distinct runs
 *   V2      LLM-judge binary verifier: "is this a real issue in this diff?"
 *           (batched per arch x instance — the diff is sent once per batch)
 *   V1+V2   both: recurrence AND judged real
 *
 * V0/V1 are zero-cost replay (RUNS_IN + judge CACHE_IN). V2 needs a verifier
 * model; verdicts are cached to VERIFIER_CACHE so re-runs are free. With
 * generation = Haiku (frozen SUT) and semantic matching = Llama, a DeepSeek
 * verifier closes a NON-CIRCULAR triangle: no family judges its own output.
 *
 * Run:  RUNS_IN=<runs.json> CACHE_IN=<cache.json> npm run bon:eval
 * Env:  SEMANTIC_THRESHOLD (=0.7), BON_OUT (optional JSON report)
 *       VERIFIER_MODEL (e.g. deepseek.v3.2 — enables V2)
 *       VERIFIER_CACHE (verdict cache JSON, read+write)
 *       BENCHMARK_DATA_DIR (=data/benchmark — diffs for the verifier)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { BenchmarkResult } from "../src/benchmark/models/benchmark-result.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import {
  areDuplicateFindings,
  dedupeFindings,
} from "../src/architectures/shared/finding-dedup.ts";
import { BenchmarkLoader } from "../src/campaign/index.ts";
import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import { ProviderRateLimitError, ProviderTimeoutError } from "../src/llm/errors.ts";

const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const VERIFIER_MODEL = process.env.VERIFIER_MODEL;
const VERIFIER_CACHE = process.env.VERIFIER_CACHE;
const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? "data/benchmark");
const DIFF_BUDGET = 500_000; // chars (~125k tokens) — under DeepSeek V3.2's 164K

const runsIn = process.env.RUNS_IN;
const cacheIn = process.env.CACHE_IN;
if (!runsIn || !existsSync(runsIn)) {
  console.error("Set RUNS_IN to a persisted runs JSON (repeated runs, RUNS_PER_INSTANCE >= 2).");
  process.exit(1);
}
if (!cacheIn || !existsSync(cacheIn)) {
  console.error("Set CACHE_IN to the matching persisted judge cache JSON.");
  process.exit(1);
}

const runs = JSON.parse(readFileSync(runsIn, "utf8")) as BenchmarkRun[];
const cache = SemanticScoreCache.fromJSON(JSON.parse(readFileSync(cacheIn, "utf8")));

// --- pool findings per (architecture, instance), tracking run multiplicity ----
type Finding = BenchmarkRun["producedFindings"][number];
interface Cluster {
  readonly rep: Finding;
  readonly runsWith: Set<number>;
}

const ARCHES = [...new Set(runs.map((r) => r.architecture))];
console.log(`VF-BoN replay — ${runsIn}\narchitectures: ${ARCHES.join(", ")}; ${runs.length} runs total`);

function groupByInstance(archRuns: BenchmarkRun[]): Map<string, BenchmarkRun[]> {
  const byInstance = new Map<string, BenchmarkRun[]>();
  for (const r of archRuns) {
    byInstance.set(r.instanceId, [...(byInstance.get(r.instanceId) ?? []), r]);
  }
  return byInstance;
}

// Within-run A4 dedup first so a run's internal near-duplicates cannot inflate
// cross-run multiplicity; clustering mirrors dedupeFindings semantics.
function clusterInstance(instanceRuns: BenchmarkRun[]): Cluster[] {
  const clusters: Cluster[] = [];
  instanceRuns.forEach((run, runIdx) => {
    for (const finding of dedupeFindings(run.producedFindings)) {
      const hit = clusters.find((c) => areDuplicateFindings(c.rep, finding));
      if (hit) {
        hit.runsWith.add(runIdx);
      } else {
        clusters.push({ rep: finding, runsWith: new Set([runIdx]) });
      }
    }
  });
  return clusters;
}

interface InstancePool {
  readonly template: BenchmarkRun;
  readonly clusters: Cluster[];
}
const pools = new Map<string, Map<string, InstancePool>>(); // arch -> instanceId -> pool
let maxN = 1;
for (const arch of ARCHES) {
  const byInstance = groupByInstance(runs.filter((r) => r.architecture === arch));
  const archPools = new Map<string, InstancePool>();
  for (const [instanceId, instanceRuns] of byInstance) {
    maxN = Math.max(maxN, instanceRuns.length);
    archPools.set(instanceId, { template: instanceRuns[0]!, clusters: clusterInstance(instanceRuns) });
  }
  pools.set(arch, archPools);
}

// --- V2: batched LLM verifier over the union pools (optional) -----------------
type VerdictMap = Record<string, boolean>; // findingKey -> judged real
const findingKey = (instanceId: string, f: Finding): string =>
  `${VERIFIER_MODEL}|${instanceId}|${f.file}|${f.line}|${f.title}`;

async function runVerifier(): Promise<{ verdicts: VerdictMap; calls: number; unparseable: number }> {
  const verdicts: VerdictMap =
    VERIFIER_CACHE && existsSync(VERIFIER_CACHE)
      ? (JSON.parse(readFileSync(VERIFIER_CACHE, "utf8")) as VerdictMap)
      : {};

  // Diffs come from the benchmark data (persisted runs deliberately omit them).
  const loader = new BenchmarkLoader();
  const diffByInstance = new Map<string, string>();
  for (const [file, load] of [
    ["qodo.json", (raw: unknown) => loader.loadQodo(raw as never)],
    ["swe.json", (raw: unknown) => loader.loadSwe(raw as never)],
  ] as const) {
    const p = resolve(DATA_DIR, file);
    if (!existsSync(p)) continue;
    for (const inst of load(JSON.parse(readFileSync(p, "utf8"))).instances) {
      diffByInstance.set(inst.instanceId, inst.rawDiff);
    }
  }

  const provider = new BedrockProvider();
  let calls = 0;
  let unparseable = 0;

  for (const [arch, archPools] of pools) {
    for (const [instanceId, pool] of archPools) {
      const reps = pool.clusters.map((c) => c.rep);
      if (reps.length === 0) continue;
      if (reps.every((f) => findingKey(instanceId, f) in verdicts)) continue; // cache hit
      const diff = diffByInstance.get(instanceId);
      if (!diff) {
        console.warn(`  no diff for ${instanceId} — keeping its findings unverified`);
        continue;
      }
      const list = reps
        .map((f, i) => `${i + 1}. [${f.file}:${f.line}] ${f.title} — ${f.description ?? ""}`.slice(0, 700))
        .join("\n");
      const userPrompt =
        `UNIFIED DIFF:\n${diff.slice(0, DIFF_BUDGET)}\n\n` +
        `CANDIDATE REVIEW FINDINGS (${reps.length}):\n${list}\n\n` +
        `For EACH finding, judge strictly against the diff: is it a real, correct issue actually ` +
        `introduced or evidenced by this diff (not speculation the diff contradicts, not a claim ` +
        `about code the diff does not touch)? Respond ONLY with JSON: ` +
        `{"verdicts":[{"n":1,"real":true|false}, ...]} covering every finding number.`;

      let text = "";
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          const res = await provider.review({
            modelId: VERIFIER_MODEL!,
            systemPrompt:
              "You are a strict code-review verifier. Judge findings only against the provided diff. Output JSON only.",
            userPrompt,
            temperature: 0,
            maxTokens: 2000,
          });
          text = res.text;
          calls += 1;
          break;
        } catch (error) {
          const transient = error instanceof ProviderRateLimitError || error instanceof ProviderTimeoutError;
          if (!transient || attempt === 4) throw error;
          await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
        }
      }

      let parsed: { verdicts?: { n?: number; real?: boolean }[] } | null = null;
      try {
        parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      } catch {
        parsed = null;
      }
      const byN = new Map((parsed?.verdicts ?? []).map((v) => [v.n, v.real === true]));
      reps.forEach((f, i) => {
        const verdict = byN.get(i + 1);
        // Missing/unparseable verdict = verifier abstained -> KEEP (do not filter).
        if (verdict === undefined) unparseable += 1;
        verdicts[findingKey(instanceId, f)] = verdict ?? true;
      });
      if (VERIFIER_CACHE) writeFileSync(VERIFIER_CACHE, JSON.stringify(verdicts, null, 1)); // checkpoint
      console.log(`  V2 ${arch}/${instanceId}: judged ${reps.length} findings`);
    }
  }
  return { verdicts, calls, unparseable };
}

// --- evaluate: strict vs semantic, identical wiring to benchmark-judge-eval ---
const strict = new GroundTruthEvaluator();
const semantic = new GroundTruthEvaluator({
  matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(cache), semanticThreshold: TAU }),
});

function macro(results: BenchmarkResult[]): { p: number; r: number; f1: number } {
  const n = results.length || 1;
  return {
    p: results.reduce((a, x) => a + x.precision, 0) / n,
    r: results.reduce((a, x) => a + x.recall, 0) / n,
    f1: results.reduce((a, x) => a + x.f1, 0) / n,
  };
}

interface Row {
  readonly label: string;
  readonly n: number;
  readonly avgFindings: number;
  readonly strict: { p: number; r: number; f1: number };
  readonly semantic: { p: number; r: number; f1: number };
}

function evaluateRow(label: string, rowRuns: BenchmarkRun[]): Row {
  return {
    label,
    n: rowRuns.length,
    avgFindings: rowRuns.reduce((a, r) => a + r.producedFindings.length, 0) / (rowRuns.length || 1),
    strict: macro(rowRuns.map((r) => strict.evaluate(r))),
    semantic: macro(rowRuns.map((r) => semantic.evaluate(r))),
  };
}

function pooledRuns(
  arch: string,
  label: string,
  keep: (c: Cluster, instanceId: string) => boolean,
): BenchmarkRun[] {
  const archPools = pools.get(arch)!;
  const out: BenchmarkRun[] = [];
  for (const [instanceId, pool] of archPools) {
    const kept = pool.clusters.filter((c) => keep(c, instanceId)).map((c) => c.rep);
    out.push({ ...pool.template, runId: `${instanceId}#bon#${label}`, producedFindings: kept });
  }
  return out;
}

async function main(): Promise<void> {
  let verdicts: VerdictMap | null = null;
  if (VERIFIER_MODEL) {
    console.log(`\nV2 verifier: ${VERIFIER_MODEL} (batched per arch × instance, cached: ${VERIFIER_CACHE ?? "no"})`);
    const res = await runVerifier();
    verdicts = res.verdicts;
    console.log(`V2 done — ${res.calls} model calls, ${res.unparseable} abstained/unparseable (kept)`);
  }

  const judgedReal = (instanceId: string, c: Cluster): boolean =>
    verdicts?.[findingKey(instanceId, c.rep)] ?? true;

  const rows: Row[] = [];
  for (const arch of ARCHES) {
    rows.push(evaluateRow(`${arch} single mean`, runs.filter((r) => r.architecture === arch)));
    rows.push(evaluateRow(`  ${arch} V0 union`, pooledRuns(arch, "v0", () => true)));
    for (let k = 2; k <= maxN; k += 1) {
      rows.push(evaluateRow(`  ${arch} V1 k=${k}`, pooledRuns(arch, `v1k${k}`, (c) => c.runsWith.size >= k)));
    }
    if (verdicts) {
      rows.push(evaluateRow(`  ${arch} V2`, pooledRuns(arch, "v2", (c, id) => judgedReal(id, c))));
      rows.push(
        evaluateRow(
          `  ${arch} V1k2+V2`,
          pooledRuns(arch, "v1k2v2", (c, id) => c.runsWith.size >= 2 && judgedReal(id, c)),
        ),
      );
    }
  }

  console.log(`\n=== VF-BoN vs the ladder — strict (file+line) vs semantic (judge τ=${TAU}) ===`);
  console.log("variant".padEnd(26) + "  n    findings/run   P(s)→P(sem)   R(s)→R(sem)   F1(s)→F1(sem)");
  for (const row of rows) {
    console.log(
      row.label.padEnd(26) +
        `  ${String(row.n).padEnd(3)}  ${row.avgFindings.toFixed(1).padStart(6)}        ` +
        `${row.strict.p.toFixed(2)}→${row.semantic.p.toFixed(2)}     ` +
        `${row.strict.r.toFixed(2)}→${row.semantic.r.toFixed(2)}     ` +
        `${row.strict.f1.toFixed(2)}→${row.semantic.f1.toFixed(2)}`,
    );
  }
  console.log(
    "\nExploratory replay (doc 08): NOT part of the registered confirmatory analysis.\n" +
      "V2 verdicts are per unique pooled finding; abstentions are kept, never filtered.",
  );

  if (process.env.BON_OUT) {
    writeFileSync(process.env.BON_OUT, JSON.stringify({ tau: TAU, runsIn, verifier: VERIFIER_MODEL ?? null, rows }, null, 2));
    console.log(`report → ${process.env.BON_OUT}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
