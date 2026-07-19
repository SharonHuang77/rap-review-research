/**
 * Phase 2 unattended driver — runs the confirmatory campaign chunk-by-chunk,
 * skipping chunks that already completed cleanly and riding through chunk
 * failures so a long unattended run survives transient trouble. Resume by
 * simply re-running: a chunk with a `.done` marker (written only when its
 * `campaign-finished` line reports failed=0) is skipped.
 *
 * Run with: `node scripts/phase2-driver.ts`
 *
 * Credentials come from the environment / AWS default provider chain. For a
 * genuine unattended run use an auto-refreshing SSO profile (AWS_PROFILE=...),
 * NOT a static STS token that expires mid-run — see docs/experiment/07-*.md.
 *
 * Env:
 *   PHASE2_OUT_DIR         where run/cache/marker/log files live (=phase2-results)
 *   RUNS_PER_INSTANCE      registered protocol is 3 (=3)
 *   PHASE2_CHUNK_PAUSE_MS  pause between chunks to let per-minute windows breathe (=30000)
 *   PHASE2_DRY_RUN=1       print the chunk plan + skip/run decisions, spawn nothing
 *   PHASE2_SELFTEST=1      spawn a trivial child emitting a fake campaign-finished
 *                          line to verify parse + marker logic for free (isolated dir)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

interface Chunk {
  readonly id: string;
  readonly script: "judge:eval" | "swe:eval";
  readonly offset: number;
  readonly limit: number;
}

interface ChunkResult {
  readonly completed: number;
  readonly failed: number;
  readonly total: number;
}

const DRY_RUN = process.env.PHASE2_DRY_RUN === "1";
const SELFTEST = process.env.PHASE2_SELFTEST === "1";
const OUT_DIR = resolve(
  process.env.PHASE2_OUT_DIR ?? (SELFTEST ? "phase2-results-selftest" : "phase2-results"),
);
const RUNS_PER_INSTANCE = process.env.RUNS_PER_INSTANCE ?? "3";
const CHUNK_PAUSE_MS = Math.max(0, Number(process.env.PHASE2_CHUNK_PAUSE_MS ?? 30_000));

const CHUNKS: readonly Chunk[] = [
  // Qodo 100 PRs → five 20-PR chunks. (judge:eval also folds in the small legacy
  // swe.json sample per the frozen tool; that is accounted for by parsing the
  // campaign-finished line rather than a hard-coded expected count.)
  ...[0, 20, 40, 60, 80].map(
    (offset): Chunk => ({ id: `qodo-off${offset}`, script: "judge:eval", offset, limit: 20 }),
  ),
  // SWE-PRBench 50 PRs (semantic coverage) → five 10-PR chunks.
  ...[0, 10, 20, 30, 40].map(
    (offset): Chunk => ({ id: `swe-off${offset}`, script: "swe:eval", offset, limit: 10 }),
  ),
];

const FINISH_RE = /campaign-finished completed=(\d+) failed=(\d+) total=(\d+)/;

function markerPath(chunk: Chunk): string {
  return join(OUT_DIR, `${chunk.id}.done`);
}

function isComplete(chunk: Chunk): boolean {
  return existsSync(markerPath(chunk));
}

function chunkEnv(chunk: Chunk): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BENCHMARK_OFFSET: String(chunk.offset),
    BENCHMARK_LIMIT: String(chunk.limit),
    RUNS_PER_INSTANCE,
    RUNS_OUT: join(OUT_DIR, `${chunk.id}-runs.json`),
    CACHE_OUT: join(OUT_DIR, `${chunk.id}-cache.json`),
  };
}

function runChunk(chunk: Chunk): Promise<ChunkResult | null> {
  const logPath = join(OUT_DIR, `${chunk.id}.log`);
  // SELFTEST spawns node with a canned finish line so the parse/marker path can
  // be exercised without a live (paid) Bedrock run.
  const command = SELFTEST ? process.execPath : "npm";
  const args = SELFTEST
    ? ["-e", "console.log('#0001 campaign-finished completed=252 failed=0 total=252')"]
    : ["run", chunk.script];

  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      env: chunkEnv(chunk),
      // `npm` on Windows resolves to npm.cmd only through a shell. The SELFTEST
      // path spawns node.exe directly, whose path contains a space, so it must
      // NOT go through the shell (array args are passed literally without it).
      shell: !SELFTEST && process.platform === "win32",
    });
    let captured = "";
    const onData = (buf: Buffer): void => {
      const text = buf.toString();
      captured += text;
      process.stdout.write(text);
      appendFileSync(logPath, text);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("close", () => {
      const match = FINISH_RE.exec(captured);
      if (!match) {
        resolvePromise(null);
        return;
      }
      resolvePromise({
        completed: Number(match[1] ?? "0"),
        failed: Number(match[2] ?? "0"),
        total: Number(match[3] ?? "0"),
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- main --------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const mode = DRY_RUN ? " [DRY RUN]" : SELFTEST ? " [SELFTEST]" : "";
console.log(
  `Phase 2 driver — ${CHUNKS.length} chunks, out=${OUT_DIR}, runs/instance=${RUNS_PER_INSTANCE}${mode}`,
);

const summary: string[] = [];
for (const chunk of CHUNKS) {
  if (isComplete(chunk)) {
    console.log(`SKIP  ${chunk.id} (already complete)`);
    summary.push(`${chunk.id}: skipped (done)`);
    continue;
  }
  if (DRY_RUN) {
    console.log(`RUN   ${chunk.id}  npm run ${chunk.script}  offset=${chunk.offset} limit=${chunk.limit}`);
    summary.push(`${chunk.id}: would run`);
    continue;
  }

  console.log(`\n=== ${chunk.id}: npm run ${chunk.script} (offset=${chunk.offset} limit=${chunk.limit}) ===`);
  const result = await runChunk(chunk);
  if (result && result.failed === 0 && result.total > 0) {
    writeFileSync(
      markerPath(chunk),
      `completed=${result.completed} total=${result.total} at ${new Date().toISOString()}\n`,
    );
    console.log(`DONE  ${chunk.id}: ${result.completed}/${result.total} (marker written)`);
    summary.push(`${chunk.id}: DONE ${result.completed}/${result.total}`);
  } else if (result) {
    console.log(
      `INCOMPLETE ${chunk.id}: ${result.completed}/${result.total}, failed=${result.failed} — will retry on next run`,
    );
    summary.push(`${chunk.id}: incomplete ${result.completed}/${result.total} failed=${result.failed}`);
  } else {
    console.log(`INCOMPLETE ${chunk.id}: no campaign-finished line — will retry on next run`);
    summary.push(`${chunk.id}: incomplete (no finish line)`);
  }
  if (CHUNK_PAUSE_MS > 0) await sleep(CHUNK_PAUSE_MS);
}

console.log(`\n=== Phase 2 driver summary ===`);
for (const line of summary) console.log(`  ${line}`);
const remaining = CHUNKS.filter((chunk) => !isComplete(chunk)).length;
console.log(
  remaining === 0
    ? "All chunks complete."
    : `${remaining} chunk(s) still incomplete — re-run this driver to resume.`,
);
