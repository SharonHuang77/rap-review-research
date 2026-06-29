/**
 * Time source abstraction.
 *
 * Injected rather than calling `Date` directly so that timestamps are
 * deterministic and controllable in tests.
 */
export interface Clock {
  /** Current time as an ISO-8601 string. */
  nowIso(): string;
}

/**
 * Wall-clock implementation backed by the system clock.
 */
export class SystemClock implements Clock {
  public nowIso(): string {
    return new Date().toISOString();
  }
}

/**
 * Deterministic clock for tests.
 *
 * Returns a fixed instant, advancing by a fixed step on each read so that
 * `startedAt` and `completedAt` can be distinguished when desired.
 */
export class FixedClock implements Clock {
  private current: number;
  private readonly stepMs: number;

  public constructor(start = "2026-01-01T00:00:00.000Z", stepMs = 0) {
    this.current = Date.parse(start);
    this.stepMs = stepMs;
  }

  public nowIso(): string {
    const iso = new Date(this.current).toISOString();
    this.current += this.stepMs;
    return iso;
  }
}
