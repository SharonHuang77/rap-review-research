import { test } from "node:test";
import assert from "node:assert/strict";
import { proxyPrecision, proxyF1 } from "../../src/industrial/proxy-metrics.ts";
import type { ReviewFinding } from "../../src/models/finding.ts";

const f = (id: string): ReviewFinding => ({
  id, title: id, category: "correctness", severity: "low", file: "a.ts", line: 1,
  description: "d", recommendation: "r", confidence: 0.5,
});

test("proxyPrecision = valid verdicts / findings", () => {
  const findings = [f("a"), f("b"), f("c"), f("d")];
  const verdicts = { a: "valid", b: "valid", c: "invalid", d: "uncertain" } as const;
  assert.equal(proxyPrecision(findings, verdicts), 0.5);
});

test("proxyPrecision of an empty finding set is 0", () => {
  assert.equal(proxyPrecision([], {}), 0);
});

test("proxyF1 is the harmonic mean; 0 when either term is 0", () => {
  assert.ok(Math.abs(proxyF1(0.6, 0.4) - 0.48) < 1e-9);
  assert.equal(proxyF1(0, 0.9), 0);
});
