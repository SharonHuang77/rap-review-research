import { test } from "node:test";
import assert from "node:assert/strict";

import { rawAgreement, cohenKappa, gwetAC1, pabak } from "../../src/analysis/stats.ts";

const near = (actual: number, expected: number, tol: number, msg?: string): void =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ""} expected ${expected}±${tol}, got ${actual}`);

// Build boolean vectors from a 2x2 confusion count (bothYes, bothNo, aYesbNo, aNobYes).
function fromCounts(bothYes: number, bothNo: number, aOnly: number, bOnly: number): {
  a: boolean[];
  b: boolean[];
} {
  const a: boolean[] = [];
  const b: boolean[] = [];
  const push = (av: boolean, bv: boolean, k: number): void => {
    for (let i = 0; i < k; i += 1) { a.push(av); b.push(bv); }
  };
  push(true, true, bothYes);
  push(false, false, bothNo);
  push(true, false, aOnly);
  push(false, true, bOnly);
  return { a, b };
}

test("rawAgreement / cohenKappa / gwetAC1 / pabak: textbook 4-item example", () => {
  const a = [true, true, false, false];
  const b = [true, false, false, false];
  near(rawAgreement(a, b), 0.75, 1e-9, "raw");
  near(cohenKappa(a, b), 0.5, 1e-9, "kappa");
  near(gwetAC1(a, b), 0.28125 / 0.53125, 1e-9, "AC1");
  near(pabak(a, b), 0.5, 1e-9, "pabak = 2*po-1");
});

test("kappa paradox: high raw agreement but low κ, while AC1 stays high", () => {
  // 100 items: bothYes=80, bothNo=5, A-only=10, B-only=5 → prevalence is high.
  const { a, b } = fromCounts(80, 5, 10, 5);
  near(rawAgreement(a, b), 0.85, 1e-9, "raw");
  near(cohenKappa(a, b), 0.07 / 0.22, 1e-6, "κ collapses under high prevalence");
  near(gwetAC1(a, b), 0.63125 / 0.78125, 1e-6, "AC1 resists the paradox");
  near(pabak(a, b), 0.7, 1e-9, "pabak");
  assert.ok(cohenKappa(a, b) < 0.4, "κ is misleadingly low");
  assert.ok(gwetAC1(a, b) > 0.75, "AC1 reflects the true high agreement");
});

test("perfect and adversarial edges", () => {
  const yes = [true, true, true];
  assert.equal(rawAgreement(yes, yes), 1);
  assert.equal(cohenKappa(yes, yes), 1);
  assert.equal(gwetAC1(yes, yes), 1);
  assert.equal(pabak(yes, yes), 1);
  // total disagreement → raw 0, pabak −1
  near(pabak([true, false], [false, true]), -1, 1e-9);
});

test("length mismatch throws", () => {
  assert.throws(() => rawAgreement([true], [true, false]));
  assert.throws(() => cohenKappa([true], []));
});
