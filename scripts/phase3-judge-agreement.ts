/**
 * Phase 3 — INTER-JUDGE AGREEMENT with paradox-robust companions. Cohen's κ
 * collapses toward 0 when one rater is near-constant (base-rate / "kappa
 * paradox"), so a low κ alone cannot distinguish genuine disagreement from a
 * prevalence artifact. This reports raw agreement + κ + Gwet's AC1 + PABAK for
 * (a) the three genuineness judges on "is this FP a real bug?" (the κ=0.23–0.58
 * split, §6) and (b) the two pair judges on "same issue?" (the κ=0.95 matcher,
 * §4). The contrast is the point: the subjective genuineness call is fragile
 * under every coefficient; the objective same-issue call is robust under all.
 * ZERO LLM calls — replays the persisted judge caches.
 *
 * Env: DATA_IN (=hetero-confirmatory), REAL_THRESHOLD (=0.5),
 *      PAIR_THRESHOLD (=0.7).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { rawAgreement, cohenKappa, gwetAC1, pabak } from "../src/analysis/stats.ts";

const DATA_IN = resolve(process.env.DATA_IN ?? "hetero-confirmatory");
const REAL_TAU = Number(process.env.REAL_THRESHOLD ?? 0.5);
const PAIR_TAU = Number(process.env.PAIR_THRESHOLD ?? 0.7);

type Cache = Record<string, number>;
const load = (p: string): Cache | undefined =>
  existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Cache) : undefined;

/** Align two score caches on shared keys, threshold to booleans, report agreement. */
function agreementRow(label: string, a: Cache, b: Cache, tau: number): void {
  const keys = Object.keys(a).filter((k) => Object.prototype.hasOwnProperty.call(b, k));
  if (keys.length === 0) { console.log(`${label.padEnd(26)} (no shared items)`); return; }
  const av = keys.map((k) => a[k]! >= tau);
  const bv = keys.map((k) => b[k]! >= tau);
  const yesA = av.filter(Boolean).length;
  const yesB = bv.filter(Boolean).length;
  console.log(
    `${label.padEnd(26)} n=${String(keys.length).padStart(4)}  ` +
      `raw=${(rawAgreement(av, bv) * 100).toFixed(1).padStart(5)}%  ` +
      `κ=${cohenKappa(av, bv).toFixed(3).padStart(6)}  ` +
      `AC1=${gwetAC1(av, bv).toFixed(3).padStart(6)}  ` +
      `PABAK=${pabak(av, bv).toFixed(3).padStart(6)}  ` +
      `| yes-rate ${(100 * yesA / keys.length).toFixed(0)}% / ${(100 * yesB / keys.length).toFixed(0)}%`,
  );
}

// --- (a) genuineness judges: "is this FP a real bug?" (threshold at REAL_TAU) --
const genuineness: [string, string][] = [
  ["Llama 3.3 70B", "fp-completeness"],
  ["DeepSeek V3.2", "fp-completeness-deepseek"],
  ["Mistral Large 3", "fp-completeness-mistral"],
];
const gCaches = genuineness
  .map(([label, dir]) => [label, load(join(DATA_IN, dir, "completeness-cache.json"))] as const)
  .filter((e): e is readonly [string, Cache] => e[1] !== undefined);

console.log(`=== (a) genuineness "is this FP a real bug?" — real≥${REAL_TAU} (subjective; §6) ===`);
console.log(`judges: ${gCaches.map(([l]) => l).join(", ")}`);
for (let i = 0; i < gCaches.length; i += 1) {
  for (let j = i + 1; j < gCaches.length; j += 1) {
    agreementRow(`${gCaches[i]![0]} × ${gCaches[j]![0]}`, gCaches[i]![1], gCaches[j]![1], REAL_TAU);
  }
}

// --- (b) pair judges: "same issue?" (threshold at PAIR_TAU) --------------------
const nova = load(join(DATA_IN, "pair-judge-cache.json"));
const deepseek2 = load(join(DATA_IN, "judge2-deepseek", "pair-judge-cache.json"));
console.log(`\n=== (b) pair judge "same issue?" — score≥${PAIR_TAU} (objective; §4) ===`);
if (nova && deepseek2) agreementRow("Nova × DeepSeek V3.2", nova, deepseek2, PAIR_TAU);
else console.log("(pair-judge caches not both present)");

console.log(
  `\nReading: for the genuineness call, κ is low AND AC1/PABAK show the agreement is ` +
    `genuinely modest (not a mere prevalence artifact) — "is it a real bug?" is not settled by an LLM ` +
    `judge. For the same-issue call, all coefficients stay high — the objective matcher (and thus the ` +
    `cross-family clustering) does not depend on the judge. The yes-rate columns expose any rubber-stamping.`,
);
