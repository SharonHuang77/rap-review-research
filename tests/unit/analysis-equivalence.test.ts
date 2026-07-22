import { test } from "node:test";
import assert from "node:assert/strict";

import { normalQuantile, normalCdf, mdePaired, tostPaired } from "../../src/analysis/stats.ts";

const near = (actual: number, expected: number, tol: number, msg?: string): void =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ""} expected ${expected}±${tol}, got ${actual}`);

test("normalQuantile: matches standard-normal critical values", () => {
  near(normalQuantile(0.975), 1.959964, 1e-4, "z_.975");
  near(normalQuantile(0.95), 1.644854, 1e-4, "z_.95");
  near(normalQuantile(0.8), 0.841621, 1e-4, "z_.8");
  near(normalQuantile(0.5), 0, 1e-6, "median"); // bounded by normalCdf's ~1e-7 erf approx
  near(normalQuantile(0.025), -1.959964, 1e-4, "symmetry");
});

test("normalQuantile: round-trips through normalCdf", () => {
  for (const p of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
    near(normalCdf(normalQuantile(p)), p, 1e-6, `roundtrip p=${p}`);
  }
});

test("mdePaired: reproduces the pre-registered power calc (N=100, SD=0.13 → ~3.6pp, dz~0.28)", () => {
  const { mde, dz } = mdePaired({ n: 100, sdDiff: 0.13, alpha: 0.05, power: 0.8 });
  near(mde, 0.03642, 5e-4, "MDE in recall points");
  near(dz, 0.2802, 3e-3, "standardized effect");
});

test("mdePaired: smaller N and higher power both raise the detectable effect", () => {
  const base = mdePaired({ n: 100, sdDiff: 0.13 }).mde;
  assert.ok(mdePaired({ n: 40, sdDiff: 0.13 }).mde > base, "smaller N → larger MDE");
  assert.ok(mdePaired({ n: 100, sdDiff: 0.13, power: 0.9 }).mde > base, "more power → larger MDE");
});

test("tostPaired: tightly-clustered zero differences are equivalent within ±0.06", () => {
  // twenty ±0.01 values: mean 0, tiny SE → the 90% CI sits well inside ±eps
  const diffs = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));
  const r = tostPaired(diffs, 0.06, { alpha: 0.05 });
  assert.equal(r.equivalent, true, "should conclude equivalence");
  assert.ok(r.pTost < 0.05, `pTost should clear α: ${r.pTost}`);
  assert.ok(r.ci.lo > -0.06 && r.ci.hi < 0.06, "90% CI inside the equivalence band");
  near(r.mean, 0, 1e-9);
});

test("tostPaired: a wide, underpowered spread cannot conclude equivalence", () => {
  // mean 0 but large SD → 90% CI overruns ±0.06: honest "not shown equivalent"
  const diffs = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 0.2 : -0.2));
  const r = tostPaired(diffs, 0.06, { alpha: 0.05 });
  assert.equal(r.equivalent, false, "wide CI → equivalence not established");
  assert.ok(r.pTost >= 0.05, "pTost fails to clear α");
  assert.ok(r.ci.lo < -0.06 || r.ci.hi > 0.06, "90% CI escapes the band");
});

test("tostPaired: a mean beyond the bound is not equivalent even if precise", () => {
  const diffs = Array.from({ length: 50 }, () => 0.1); // mean 0.1 > eps 0.06
  const r = tostPaired(diffs, 0.06, { alpha: 0.05 });
  assert.equal(r.equivalent, false);
});
