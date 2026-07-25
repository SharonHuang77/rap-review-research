/**
 * Aspect-verifier back-end (doc-17 §9, item ①) — MAV / BoN-MAV applied to review.
 *
 * §6/§7.1 showed AGREEMENT filters (self-consistency, cross-family) are precision-
 * only and never raise F1 over the raw union — they ask "do N samples agree?".
 * Multi-Agent Verification (Lifshitz et al., arXiv:2502.20379) argues the lever is
 * ASPECT verification — "is dimension X satisfied?" — and that diverse aspect
 * verifiers improve the P-R frontier beyond consensus. This tests that claim on the
 * high-coverage bases from §7.1: run K cheap aspect verifiers over each candidate
 * finding, keep findings passing a threshold, and ask whether ANY operating point
 * clears the plain independent-union F1 frontier (≈0.37) that no agreement filter could.
 *
 * Each verifier is ONE LLM call per finding that sees the diff + the finding and
 * returns four INDEPENDENT boolean aspects (a different failure mode each):
 *   real       — the defect genuinely exists in the changed code (not hallucinated)
 *   localized  — the cited file:line is actually where the issue is
 *   actionable — a maintainer would want it fixed (not a trivial nitpick)
 *   supported  — a concrete, diff-grounded failure mechanism (not vague)
 * Verdicts are cached to disk keyed by (verifier-model, finding) so re-runs and
 * threshold sweeps are ZERO-LLM and the paid verify pass is resumable. The kept
 * subset is evaluated against the base's EXISTING GT judge cache (§7.1), so the only
 * NEW LLM calls are the aspect verifications. EXPLORATORY. Live (paid) unless DRYRUN.
 *
 * Env: BASE (=conditioned | independent), LIMIT (=60 PRs; 0=all), PILOT_IDS,
 *      VERIFIER_MODELS (=comma list; default a single non-Claude verifier to avoid
 *      self-preference), OUT_DIR (=module-arm), DIFF_CAP (=20000), SEMANTIC_THRESHOLD
 *      (=0.7), VERIFIER_DRYRUN=1 (stub provider, validates the pipeline free).
 * Run: AWS_PROFILE=bedrock BASE=conditioned LIMIT=60 node scripts/aspect-verifier-eval.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { BedrockProvider } from "../src/llm/provider/bedrock-provider.ts";
import type { ILLMProvider } from "../src/llm/provider/llm-provider.ts";
import type { LLMReviewRequest } from "../src/llm/models/llm-review-request.ts";
import { LLM_CONFIG } from "../src/config/llm.ts";
import { BenchmarkLoader } from "../src/campaign/index.ts";
import type { BenchmarkRun } from "../src/benchmark/models/benchmark-run.ts";
import type { ReviewFinding } from "../src/models/finding.ts";
import { SemanticScoreCache } from "../src/benchmark/matching/semantic-score-cache.ts";
import { CachedSemanticMatcher } from "../src/benchmark/matching/cached-semantic-matcher.ts";
import { IssueMatcher } from "../src/benchmark/matching/issue-matcher.ts";
import { GroundTruthEvaluator } from "../src/benchmark/ground-truth-evaluator.ts";
import { areDuplicateFindings } from "../src/architectures/shared/finding-dedup.ts";

const rr = join(import.meta.dirname, "..");
const DRYRUN = process.env.VERIFIER_DRYRUN === "1";
if (!DRYRUN && LLM_CONFIG.provider !== "bedrock") { console.error("aspect-verifier needs the Bedrock provider (live). Set VERIFIER_DRYRUN=1 to validate free."); process.exit(1); }

const BASE = (process.env.BASE ?? "conditioned").trim();
const BASES: Record<string, { runs: string; cache: string }> = {
  conditioned: { runs: join(rr, "module-arm", "conditioned-union-runs.json"), cache: join(rr, "module-arm", "conditioned-cache.json") },
  independent: { runs: join(rr, "hetero-confirmatory", "ladder-haiku07-runs.json"), cache: join(rr, "hetero-confirmatory", "ladder-haiku07-cache.json") },
};
if (!BASES[BASE]) { console.error(`BASE must be one of ${Object.keys(BASES).join(" | ")}`); process.exit(1); }
const LIMIT = Number(process.env.LIMIT ?? 60);
const DIFF_CAP = Number(process.env.DIFF_CAP ?? 20000);
const TAU = Number(process.env.SEMANTIC_THRESHOLD ?? 0.7);
const OUT = process.env.OUT_DIR ?? join(rr, "module-arm");
const VERIFIERS = (process.env.VERIFIER_MODELS ?? "us.meta.llama3-3-70b-instruct-v1:0").split(",").map((s) => s.trim()).filter(Boolean);
const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? join(rr, "data", "benchmark"));
const PILOT = process.env.PILOT_IDS ? new Set(process.env.PILOT_IDS.split(",").map((s) => s.trim()).filter(Boolean)) : undefined;
const VCACHE = join(OUT, `aspect-verdicts-${BASE}.json`);

function load<T>(p: string): T { return JSON.parse(readFileSync(p, "utf8")) as T; }
const dedup = (fs: ReviewFinding[]): ReviewFinding[] => { const o: ReviewFinding[] = []; for (const f of fs) if (!o.some((k) => areDuplicateFindings(k, f))) o.push(f); return o; };

// ── base: one union run per instance (conditioned is already a union; ladder is multi-run) ──
const rawRuns = load<BenchmarkRun[]>(BASES[BASE]!.runs).filter((r) => r.architecture === "agentless");
const grouped = new Map<string, BenchmarkRun>();
const acc = new Map<string, ReviewFinding[]>();
for (const r of rawRuns) { acc.set(r.instanceId, [...(acc.get(r.instanceId) ?? []), ...r.producedFindings]); if (!grouped.has(r.instanceId)) grouped.set(r.instanceId, r); }
let baseRuns = [...grouped.values()].map((r) => ({ ...r, producedFindings: dedup(acc.get(r.instanceId)!) }));
// universal diff source (ladder runs carry no rawDiff)
const qodo = new BenchmarkLoader().loadQodo(load(join(DATA_DIR, "qodo.json")));
const diffOf = new Map<string, string>(qodo.instances.map((i) => [i.instanceId, i.rawDiff]));
baseRuns = baseRuns.filter((r) => (PILOT ? PILOT.has(r.instanceId) : true));
baseRuns.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
if (LIMIT > 0) baseRuns = baseRuns.slice(0, LIMIT);
const gtCache = SemanticScoreCache.fromJSON(load<Record<string, number>>(BASES[BASE]!.cache));
const nFind = baseRuns.reduce((a, r) => a + r.producedFindings.length, 0);
console.log(`Aspect-verifier back-end — base=${BASE}, ${baseRuns.length} PRs, ${nFind} findings, verifiers=[${VERIFIERS.join(", ")}]${DRYRUN ? " (DRYRUN)" : ""}`);

// ── aspect prompt + tolerant parse ──
interface Verdict { real: boolean; localized: boolean; actionable: boolean; supported: boolean }
const ASPECT_SYSTEM =
  "You are a strict, skeptical code-review auditor. You are given a unified diff and ONE finding an " +
  "automated reviewer produced about it. Automated reviewers frequently hallucinate issues that are not " +
  "there, cite the wrong location, raise trivial nitpicks, and make vague claims. Judge FOUR independent " +
  "aspects of the finding, each strictly. Respond with ONLY a JSON object " +
  '{"real":bool,"localized":bool,"actionable":bool,"supported":bool} and NOTHING else.';
function buildAspectPrompt(diff: string, f: ReviewFinding, modelId: string): LLMReviewRequest {
  const finding = `file: ${f.file}\nline: ${f.line}\ntitle: ${f.title}\nseverity: ${f.severity}\ncategory: ${f.category}\ndescription: ${f.description}\nrecommendation: ${f.recommendation ?? "(none)"}`;
  const userPrompt =
    `## Unified diff (the ONLY code that changed)\n${diff.slice(0, DIFF_CAP)}\n\n` +
    `## Finding to audit\n${finding}\n\n` +
    `## Aspects (judge each true/false, independently and strictly)\n` +
    `- real: the described defect genuinely EXISTS in the changed code above (not hallucinated, not already handled/guarded elsewhere in the diff).\n` +
    `- localized: the cited file and line actually correspond to the code the finding describes.\n` +
    `- actionable: a maintainer would plausibly want this fixed — a real bug or risk, NOT a trivial style nitpick or a speculative "might".\n` +
    `- supported: the finding names a concrete, diff-grounded failure mechanism, NOT a vague or generic concern.\n` +
    `Respond ONLY with {"real":bool,"localized":bool,"actionable":bool,"supported":bool}.`;
  return { systemPrompt: ASPECT_SYSTEM, userPrompt, modelId, temperature: 0, maxTokens: 60 };
}
function parseVerdict(text: string): Verdict | undefined {
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s === -1 || e < s) return undefined;
    const o = JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
    const b = (v: unknown): boolean => v === true || v === 1 || (typeof v === "string" && /^(true|yes|1)$/i.test(v.trim()));
    if (!("real" in o) || !("localized" in o) || !("actionable" in o) || !("supported" in o)) return undefined;
    return { real: b(o.real), localized: b(o.localized), actionable: b(o.actionable), supported: b(o.supported) };
  } catch { return undefined; }
}
// deterministic stub for DRYRUN: pseudo-verdict from a hash of the key (exercises parse + sweep, free)
function stubVerdict(key: string): Verdict {
  let h = 2166136261; for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const bit = (n: number): boolean => ((h >>> n) & 1) === 1 || ((h >>> (n + 4)) & 3) !== 0; // biased toward true
  return { real: bit(0), localized: bit(1), actionable: bit(2), supported: bit(3) };
}

const provider: ILLMProvider = DRYRUN ? ({ review: async () => { throw new Error("dryrun"); } } as unknown as ILLMProvider) : new BedrockProvider();
const fkey = (model: string, inst: string, f: ReviewFinding): string => `${model}||${inst}||${f.file}||${f.line}||${f.title}`;

async function verifyOne(model: string, diff: string, f: ReviewFinding): Promise<Verdict | undefined> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await provider.review(buildAspectPrompt(diff, f, model));
      const v = parseVerdict(res.text);
      if (v) return v;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, Math.min(15_000, 1_000 * 2 ** (attempt - 1))));
  }
  return undefined;
}

// ── VERIFY (resumable) ──
const verdicts: Record<string, Verdict> = existsSync(VCACHE) ? load<Record<string, Verdict>>(VCACHE) : {};
let called = 0, parseFail = 0, done = 0;
mkdirSync(OUT, { recursive: true });
for (const run of baseRuns) {
  const diff = diffOf.get(run.instanceId) ?? run.rawDiff ?? "";
  for (const f of run.producedFindings) {
    for (const model of VERIFIERS) {
      const k = fkey(model, run.instanceId, f);
      if (k in verdicts) continue;
      const v = DRYRUN ? stubVerdict(k) : await verifyOne(model, diff, f);
      called += 1;
      if (v) verdicts[k] = v; else parseFail += 1;
      if (called % 25 === 0) writeFileSync(VCACHE, JSON.stringify(verdicts));
    }
  }
  done += 1;
  if (done % 20 === 0) console.log(`  verified ${done}/${baseRuns.length} PRs (${called} calls, ${parseFail} unparsed)`);
}
writeFileSync(VCACHE, JSON.stringify(verdicts, null, 2));
console.log(`Verify done: ${called} new calls, ${parseFail} unparsed, cache=${VCACHE}\n`);

// ── ANALYZE (zero-LLM sweep) ──
const evaluator = new GroundTruthEvaluator({ matcher: new IssueMatcher({ semanticMatcher: new CachedSemanticMatcher(gtCache), semanticThreshold: TAU }) });
interface RPF { R: number; P: number; F1: number; fpp: number }
function macro(runs: BenchmarkRun[]): RPF {
  const rs = runs.map((r) => evaluator.evaluate(r)); const n = rs.length || 1;
  return { R: rs.reduce((a, x) => a + x.recall, 0) / n, P: rs.reduce((a, x) => a + x.precision, 0) / n, F1: rs.reduce((a, x) => a + x.f1, 0) / n, fpp: runs.reduce((a, r) => a + r.producedFindings.length, 0) / n };
}
/** verdicts available for a finding across verifier models. */
function verdictsFor(inst: string, f: ReviewFinding): Verdict[] {
  return VERIFIERS.map((m) => verdicts[fkey(m, inst, f)]).filter((v): v is Verdict => v !== undefined);
}
const aspectsPassed = (v: Verdict): number => Number(v.real) + Number(v.localized) + Number(v.actionable) + Number(v.supported);
/** keep predicate factory; findings with NO verdict are conservatively kept (unverifiable ≠ rejected). */
function filteredBy(pred: (vs: Verdict[]) => boolean): BenchmarkRun[] {
  return baseRuns.map((r) => ({ ...r, producedFindings: r.producedFindings.filter((f) => { const vs = verdictsFor(r.instanceId, f); return vs.length === 0 ? true : pred(vs); }) }));
}
const meanAspects = (vs: Verdict[]): number => vs.reduce((a, v) => a + aspectsPassed(v), 0) / vs.length;
const majAspect = (vs: Verdict[], key: keyof Verdict): boolean => vs.filter((v) => v[key]).length * 2 >= vs.length;
const fmt = (name: string, x: RPF): string => `${name.padEnd(22)} R ${(x.R * 100).toFixed(0)}%  P ${(x.P * 100).toFixed(0)}%  F1 ${x.F1.toFixed(2)}  f/PR ${x.fpp.toFixed(1)}`;

console.log(`── aspect-verifier operating points (base=${BASE}, τ=${TAU}, macro over PRs) ──`);
const raw = macro(baseRuns);
console.log(fmt("raw union (no verify)", raw));
console.log(fmt("real (majority)", macro(filteredBy((vs) => majAspect(vs, "real")))));
console.log(fmt("actionable (majority)", macro(filteredBy((vs) => majAspect(vs, "actionable")))));
console.log(fmt("real ∧ supported", macro(filteredBy((vs) => majAspect(vs, "real") && majAspect(vs, "supported")))));
for (const m of [1, 2, 3, 4]) console.log(fmt(`mean aspects ≥ ${m}`, macro(filteredBy((vs) => meanAspects(vs) >= m))));
console.log(`\nReference — plain independent K=3 union frontier: F1 0.37 (the bar to beat).`);
console.log(`Reference — §7.1 agreement filter on this base (cross-family ≥1): ${BASE === "conditioned" ? "R24/P59/F1 0.31" : "R30/P62/F1 0.37"}.`);
console.log(`\nRead: if any aspect operating point F1 > 0.37, aspect verification beats agreement (the MAV claim holds for review);`);
console.log(`if the whole frontier stays ≤ 0.37, review findings are agreement-hard even for decomposed verifiers. EXPLORATORY.`);
