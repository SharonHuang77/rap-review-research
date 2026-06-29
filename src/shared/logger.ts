import type { ReviewArchitecture, ExperimentStatus } from "../models/experiment.ts";

/**
 * Structured context attached to every log entry.
 *
 * Per the implementation spec, experiment-related log entries should carry the
 * experiment correlation identifiers (experimentId / snapshotId / architecture)
 * and the current status.
 */
export interface LogContext {
  readonly experimentId?: string;
  readonly snapshotId?: string;
  readonly architecture?: ReviewArchitecture;
  readonly status?: ExperimentStatus;
  readonly [key: string]: unknown;
}

/**
 * Minimal structured-logging port.
 *
 * Business logic depends on this interface, not on a concrete logger, so the
 * logging backend can be swapped without touching the engine.
 */
export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

/**
 * Logger that emits one JSON object per line to the console.
 */
export class ConsoleLogger implements Logger {
  public info(message: string, context: LogContext = {}): void {
    this.write("info", message, context);
  }

  public warn(message: string, context: LogContext = {}): void {
    this.write("warn", message, context);
  }

  public error(message: string, context: LogContext = {}): void {
    this.write("error", message, context);
  }

  private write(level: string, message: string, context: LogContext): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level, message, ...context }));
  }
}

/**
 * Logger that discards all output. Default for tests and library use.
 */
export class NoopLogger implements Logger {
  public info(): void {
    /* intentionally empty */
  }

  public warn(): void {
    /* intentionally empty */
  }

  public error(): void {
    /* intentionally empty */
  }
}
