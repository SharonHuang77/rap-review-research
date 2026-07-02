import type { Clock } from "../shared/clock.ts";
import type { ManifestProgress } from "./manifest.ts";

/** Sink for reproducible log lines. Defaults to collecting them in memory. */
export type LogSink = (line: string) => void;

export interface ProgressReporterOptions {
  /** Where log lines go (in addition to the in-memory buffer). */
  readonly sink?: LogSink;
  /**
   * Optional clock. When provided, each line is stamped with `clock.nowIso()`;
   * pass a FixedClock for byte-identical, reproducible logs. When omitted, lines
   * carry only a monotonic sequence number (still fully reproducible).
   */
  readonly clock?: Clock;
}

/**
 * Emits structured, reproducible progress logs for a campaign and tracks the
 * running tally. Deterministic: no wall-clock or randomness of its own — output
 * depends only on the events it is given (and an injected clock, if any).
 */
export class ProgressReporter {
  private readonly sink?: LogSink;
  private readonly clock?: Clock;
  private readonly buffer: string[] = [];
  private sequence = 0;

  public constructor(options: ProgressReporterOptions = {}) {
    this.sink = options.sink;
    this.clock = options.clock;
  }

  public campaignStarted(campaignId: string, totalRuns: number): void {
    this.emit("campaign-started", { campaignId, totalRuns });
  }

  public instanceImported(instanceId: string, snapshotId: string): void {
    this.emit("instance-imported", { instanceId, snapshotId });
  }

  public runStarted(key: string, attempt: number): void {
    this.emit("run-started", { key, attempt });
  }

  public runCompleted(key: string, experimentId: string): void {
    this.emit("run-completed", { key, experimentId });
  }

  public runRetry(key: string, attempt: number, error: string): void {
    this.emit("run-retry", { key, attempt, error });
  }

  public runFailed(key: string, error: string): void {
    this.emit("run-failed", { key, error });
  }

  public campaignFinished(progress: ManifestProgress): void {
    this.emit("campaign-finished", {
      completed: progress.completed,
      failed: progress.failed,
      total: progress.total,
    });
  }

  /** Immutable copy of the log lines emitted so far. */
  public getLogs(): string[] {
    return [...this.buffer];
  }

  private emit(event: string, fields: Record<string, string | number>): void {
    this.sequence += 1;
    const prefix = `#${String(this.sequence).padStart(4, "0")}`;
    const stamp = this.clock ? ` ${this.clock.nowIso()}` : "";
    const body = Object.entries(fields)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    const line = `${prefix}${stamp} ${event} ${body}`.trimEnd();
    this.buffer.push(line);
    this.sink?.(line);
  }
}
