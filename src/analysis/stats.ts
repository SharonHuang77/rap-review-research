/**
 * Paired nonparametric statistics for the confirmatory analysis
 * (pre-registration §5.2): paired Wilcoxon signed-rank, Cliff's delta, a seeded
 * percentile bootstrap CI, and Holm–Bonferroni step-down correction.
 *
 * Pure and deterministic — the bootstrap uses a seeded PRNG so the confirmatory
 * verdicts replay byte-for-byte. No external dependencies.
 */

/** Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation (|err| < 1.5e-7). */
export function normalCdf(x: number): number {
  const z = x / Math.SQRT2;
  const az = Math.abs(z);
  const t = 1 / (1 + 0.3275911 * az);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-az * az);
  const erf = z >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

export interface WilcoxonResult {
  /** Number of nonzero differences actually used (zeros are dropped). */
  readonly n: number;
  /** Sum of ranks of the positive differences. */
  readonly wPlus: number;
  readonly z: number;
  /** Two-sided p-value (normal approximation; suitable for n ≳ 20, here n=99). */
  readonly p: number;
}

/**
 * Paired Wilcoxon signed-rank test (two-sided), normal approximation with
 * zero-difference dropping, average ranks for ties, tie-corrected variance, and
 * a continuity correction.
 */
export function wilcoxonSignedRank(differences: readonly number[]): WilcoxonResult {
  const nonzero = differences.filter((d) => d !== 0);
  const n = nonzero.length;
  if (n === 0) return { n: 0, wPlus: 0, z: 0, p: 1 };

  const abs = nonzero
    .map((d) => ({ a: Math.abs(d), sign: Math.sign(d) }))
    .sort((x, y) => x.a - y.a);

  const ranks = new Array<number>(n);
  const tieGroups: number[] = [];
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && abs[j + 1]!.a === abs[k]!.a) j += 1;
    const avgRank = (k + 1 + (j + 1)) / 2; // 1-based ranks
    for (let m = k; m <= j; m += 1) ranks[m] = avgRank;
    if (j > k) tieGroups.push(j - k + 1);
    k = j + 1;
  }

  let wPlus = 0;
  for (let m = 0; m < n; m += 1) if (abs[m]!.sign > 0) wPlus += ranks[m]!;

  const meanW = (n * (n + 1)) / 4;
  let variance = (n * (n + 1) * (2 * n + 1)) / 24;
  for (const t of tieGroups) variance -= (t ** 3 - t) / 48;
  if (variance <= 0) return { n, wPlus, z: 0, p: 1 };

  const dev = wPlus - meanW;
  const corrected = dev > 0 ? dev - 0.5 : dev < 0 ? dev + 0.5 : 0; // continuity correction
  const z = corrected / Math.sqrt(variance);
  const p = Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z)))));
  return { n, wPlus, z, p };
}

/** Cliff's delta: (#(a>b) − #(a<b)) / (|a|·|b|). Range [−1, 1]; dominance of a over b. */
export function cliffsDelta(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let gt = 0;
  let lt = 0;
  for (const x of a) {
    for (const y of b) {
      if (x > y) gt += 1;
      else if (x < y) lt += 1;
    }
  }
  return (gt - lt) / (a.length * b.length);
}

/** Deterministic PRNG (mulberry32) for a reproducible bootstrap. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CI {
  readonly point: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * Percentile bootstrap CI for a paired statistic. Resamples PR indices (keeping
 * `a[i]`,`b[i]` together), seeded for reproducibility.
 */
export function bootstrapPairedCI(
  a: readonly number[],
  b: readonly number[],
  stat: (a: readonly number[], b: readonly number[]) => number,
  opts: { iters?: number; seed?: number; alpha?: number } = {},
): CI {
  const iters = opts.iters ?? 2000;
  const alpha = opts.alpha ?? 0.05;
  const rng = mulberry32(opts.seed ?? 12345);
  const n = a.length;
  const point = stat(a, b);
  if (n === 0) return { point, lo: point, hi: point };

  const samples = new Array<number>(iters);
  for (let it = 0; it < iters; it += 1) {
    const ra = new Array<number>(n);
    const rb = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(rng() * n);
      ra[i] = a[idx]!;
      rb[i] = b[idx]!;
    }
    samples[it] = stat(ra, rb);
  }
  samples.sort((x, y) => x - y);
  const lo = samples[Math.floor((alpha / 2) * iters)] ?? point;
  const hi = samples[Math.min(iters - 1, Math.ceil((1 - alpha / 2) * iters) - 1)] ?? point;
  return { point, lo, hi };
}

/**
 * Holm–Bonferroni step-down adjusted p-values, returned in the INPUT order.
 * Monotonicity across the sorted sequence is enforced.
 */
export function holmBonferroni(pvalues: readonly number[]): number[] {
  const m = pvalues.length;
  const order = pvalues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const adj = new Array<number>(m);
  let running = 0;
  for (let rank = 0; rank < m; rank += 1) {
    const entry = order[rank]!;
    running = Math.max(running, Math.min(1, (m - rank) * entry.p));
    adj[entry.i] = running;
  }
  return adj;
}

/**
 * Paired per-unit rate data (one unit = one PR). Each unit contributes two rates
 * as hits/N: `x` (e.g. the hetero all-3-family stratum) and `y` (e.g. the same
 * model's 3-run stratum). Used for corroboration-depth golden-match rates, where
 * many units contribute 0 clusters and a per-unit ratio would be undefined.
 */
export interface RatePair {
  readonly xHits: number;
  readonly xN: number;
  readonly yHits: number;
  readonly yN: number;
}

/**
 * Pooled (micro-averaged) rate gap x−y over units: (Σ xHits / Σ xN) − (Σ yHits /
 * Σ yN). Empty denominators yield a 0 rate rather than NaN. Micro-averaging is
 * the right pooling when per-unit counts are small/sparse (a unit with 1 cluster
 * should not weigh as much as one with 20).
 */
export function pooledRateGap(units: readonly RatePair[]): {
  xRate: number;
  yRate: number;
  gap: number;
} {
  let sx = 0;
  let nx = 0;
  let sy = 0;
  let ny = 0;
  for (const u of units) {
    sx += u.xHits;
    nx += u.xN;
    sy += u.yHits;
    ny += u.yN;
  }
  const xRate = nx > 0 ? sx / nx : 0;
  const yRate = ny > 0 ? sy / ny : 0;
  return { xRate, yRate, gap: xRate - yRate };
}

/**
 * Percentile bootstrap CI for the pooled rate gap, resampling whole UNITS (PRs)
 * with replacement — the correct scheme when the stratum is sparse per unit
 * (each PR keeps its counts together). Seeded for reproducibility.
 */
export function bootstrapRateGapCI(
  units: readonly RatePair[],
  opts: { iters?: number; seed?: number; alpha?: number } = {},
): CI {
  const iters = opts.iters ?? 2000;
  const alpha = opts.alpha ?? 0.05;
  const rng = mulberry32(opts.seed ?? 12345);
  const n = units.length;
  const point = pooledRateGap(units).gap;
  if (n === 0) return { point, lo: point, hi: point };

  const samples = new Array<number>(iters);
  for (let it = 0; it < iters; it += 1) {
    const resample = new Array<RatePair>(n);
    for (let i = 0; i < n; i += 1) resample[i] = units[Math.floor(rng() * n)]!;
    samples[it] = pooledRateGap(resample).gap;
  }
  samples.sort((x, y) => x - y);
  const lo = samples[Math.floor((alpha / 2) * iters)] ?? point;
  const hi = samples[Math.min(iters - 1, Math.ceil((1 - alpha / 2) * iters) - 1)] ?? point;
  return { point, lo, hi };
}

export function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// --- Equivalence / power (for the primary null, pre-registration §3.2) --------

/**
 * Inverse standard-normal CDF (probit). Acklam's rational approximation refined
 * by one Halley step against `normalCdf`; absolute accuracy is bounded by
 * `normalCdf`'s erf approximation (~1e-7), ample for power/CI use here. Domain
 * (0, 1); returns ∓∞ at the boundaries.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const e = normalCdf(x) - p; // Halley refinement
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/**
 * Minimum detectable effect for a two-sided paired test at the given N, paired
 * SD of the differences, α, and power (defaults α=0.05, power=0.80). Returns the
 * MDE in the metric's own units and its standardized form dz = MDE / SD.
 */
export function mdePaired(opts: {
  n: number;
  sdDiff: number;
  alpha?: number;
  power?: number;
  sided?: number;
}): { mde: number; dz: number } {
  const alpha = opts.alpha ?? 0.05;
  const power = opts.power ?? 0.8;
  const sided = opts.sided ?? 2;
  const dz = (normalQuantile(1 - alpha / sided) + normalQuantile(power)) / Math.sqrt(opts.n);
  return { mde: dz * opts.sdDiff, dz };
}

export interface TostResult {
  readonly n: number;
  readonly mean: number;
  readonly sd: number;
  readonly se: number;
  readonly eps: number;
  readonly zLower: number;
  readonly pLower: number;
  readonly zUpper: number;
  readonly pUpper: number;
  /** TOST p = max of the two one-sided p-values; equivalent ⟺ pTost < α. */
  readonly pTost: number;
  readonly equivalent: boolean;
  /** (1 − 2α) confidence interval on the mean difference. */
  readonly ci: CI;
}

/**
 * Two One-Sided Tests (TOST) for paired equivalence within ±eps, normal
 * approximation (df large — consistent with the Wilcoxon normal approximation
 * used above). Equivalent ⟺ both one-sided tests reject at α ⟺ the (1 − 2α) CI
 * of the mean difference lies strictly inside (−eps, eps). A wide CI that
 * overruns the band yields `equivalent: false` — an honest "not shown
 * equivalent", not "different".
 */
export function tostPaired(
  differences: readonly number[],
  eps: number,
  opts: { alpha?: number } = {},
): TostResult {
  const alpha = opts.alpha ?? 0.05;
  const n = differences.length;
  const m = mean(differences);
  let varSum = 0;
  for (const d of differences) varSum += (d - m) ** 2;
  const sd = n > 1 ? Math.sqrt(varSum / (n - 1)) : 0;
  const se = n > 0 ? sd / Math.sqrt(n) : 0;
  // upper test H0: μ ≥ eps  → reject (μ < eps) when zUpper is very negative
  const zUpper = se > 0 ? (m - eps) / se : m - eps < 0 ? -Infinity : Infinity;
  const pUpper = normalCdf(zUpper);
  // lower test H0: μ ≤ −eps → reject (μ > −eps) when zLower is very positive
  const zLower = se > 0 ? (m + eps) / se : m + eps > 0 ? Infinity : -Infinity;
  const pLower = 1 - normalCdf(zLower);
  const pTost = Math.max(pLower, pUpper);
  const half = normalQuantile(1 - alpha) * se;
  return {
    n, mean: m, sd, se, eps, zLower, pLower, zUpper, pUpper, pTost,
    equivalent: pTost < alpha,
    ci: { point: m, lo: m - half, hi: m + half },
  };
}

// --- Inter-rater agreement (κ + paradox-robust companions, §5.1 / §6) ---------

function assertSameLength(a: readonly boolean[], b: readonly boolean[]): void {
  if (a.length !== b.length) throw new Error(`rater vectors differ in length: ${a.length} vs ${b.length}`);
  if (a.length === 0) throw new Error("empty rater vectors");
}

function marginals(a: readonly boolean[], b: readonly boolean[]): { po: number; pA: number; pB: number } {
  const n = a.length;
  let agree = 0;
  let aYes = 0;
  let bYes = 0;
  for (let i = 0; i < n; i += 1) {
    if (a[i] === b[i]) agree += 1;
    if (a[i]) aYes += 1;
    if (b[i]) bYes += 1;
  }
  return { po: agree / n, pA: aYes / n, pB: bYes / n };
}

/** Observed agreement pₒ: fraction of items both raters label identically. */
export function rawAgreement(a: readonly boolean[], b: readonly boolean[]): number {
  assertSameLength(a, b);
  return marginals(a, b).po;
}

/** Cohen's κ for two binary raters. */
export function cohenKappa(a: readonly boolean[], b: readonly boolean[]): number {
  assertSameLength(a, b);
  const { po, pA, pB } = marginals(a, b);
  const pe = pA * pB + (1 - pA) * (1 - pB);
  return pe < 1 ? (po - pe) / (1 - pe) : 1;
}

/**
 * Gwet's AC1 for two binary raters — chance agreement pe = 2·π·(1−π) with π the
 * mean marginal "positive" rate. Unlike κ it does not collapse toward 0 when one
 * class dominates (the base-rate / "kappa paradox"), so it is the right companion
 * to κ when a rater is near-constant (e.g. a rubber-stamp genuineness judge).
 */
export function gwetAC1(a: readonly boolean[], b: readonly boolean[]): number {
  assertSameLength(a, b);
  const { po, pA, pB } = marginals(a, b);
  const pi = (pA + pB) / 2;
  const pe = 2 * pi * (1 - pi);
  return pe < 1 ? (po - pe) / (1 - pe) : 1;
}

/** Prevalence-adjusted bias-adjusted κ (binary): PABAK = 2·pₒ − 1. */
export function pabak(a: readonly boolean[], b: readonly boolean[]): number {
  assertSameLength(a, b);
  return 2 * rawAgreement(a, b) - 1;
}
