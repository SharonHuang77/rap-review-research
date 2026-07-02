import { test } from "node:test";
import assert from "node:assert/strict";

import { ProgressReporter } from "../../src/campaign/index.ts";
import { FixedClock } from "../../src/shared/clock.ts";

test("emits sequenced, reproducible log lines to the sink and buffer", () => {
  const sink: string[] = [];
  const reporter = new ProgressReporter({ sink: (l) => sink.push(l) });
  reporter.campaignStarted("c1", 3);
  reporter.runStarted("i1#agentless#1", 1);
  reporter.runCompleted("i1#agentless#1", "exp-1");

  const logs = reporter.getLogs();
  assert.deepEqual(logs, sink); // sink and buffer agree
  assert.match(logs[0]!, /^#0001 campaign-started campaignId=c1 totalRuns=3$/);
  assert.match(logs[1]!, /^#0002 run-started key=i1#agentless#1 attempt=1$/);
  assert.match(logs[2]!, /^#0003 run-completed key=i1#agentless#1 experimentId=exp-1$/);
});

test("stamps a fixed clock time for byte-identical reproducibility", () => {
  const make = () => {
    const r = new ProgressReporter({ clock: new FixedClock() });
    r.campaignStarted("c1", 1);
    r.runFailed("i1#consensus#1", "boom");
    return r.getLogs();
  };
  assert.deepEqual(make(), make()); // identical across runs
  assert.match(make()[0]!, /^#0001 2026-01-01T00:00:00\.000Z campaign-started /);
});

test("retry events carry the attempt number", () => {
  const reporter = new ProgressReporter();
  reporter.runRetry("i1#agentless#1", 2, "throttled");
  assert.match(reporter.getLogs()[0]!, /run-retry key=i1#agentless#1 attempt=2 error=throttled/);
});
