import type { ReviewArchitecture } from "../models/experiment.ts";

/**
 * Lifecycle of one manifest entry (runbook 03 §Status Definitions).
 */
export type ManifestStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "retry-scheduled";

/**
 * One row of the experiment manifest: a single (instance, architecture, run)
 * cell of the campaign grid, plus the reproducibility metadata recorded as it
 * executes (runbook 03 §11, §20).
 */
export interface ManifestEntry {
  readonly datasetId: string;
  readonly instanceId: string;
  readonly architecture: ReviewArchitecture;
  readonly run: number;
  status: ManifestStatus;
  attempts: number;
  snapshotId?: string;
  experimentId?: string;
  error?: string;
}

/**
 * The campaign manifest — the authoritative record of benchmark execution
 * (experiment plan 01 §17, runbook 03 §20). Carries the controlled variables
 * (model / prompt / workflow / evaluation versions) and reproducibility
 * metadata shared by every entry.
 */
export interface CampaignManifestData {
  readonly campaignId: string;
  readonly createdAt: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly workflowVersion: string;
  readonly evaluationVersion: string;
  readonly platformVersion?: string;
  readonly gitCommit?: string;
  readonly awsRegion?: string;
  entries: ManifestEntry[];
}

/** Progress counts derived from a manifest. */
export interface ManifestProgress {
  readonly total: number;
  readonly pending: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
  readonly retryScheduled: number;
}

/** Stable key identifying an entry across resumes. */
export function manifestEntryKey(entry: {
  readonly instanceId: string;
  readonly architecture: ReviewArchitecture;
  readonly run: number;
}): string {
  return `${entry.instanceId}#${entry.architecture}#${entry.run}`;
}

/**
 * A mutable view over {@link CampaignManifestData} with lookup, status updates,
 * progress, and (de)serialization for resume. Orchestration state only — it
 * holds no review logic.
 */
export class Manifest {
  private readonly manifest: CampaignManifestData;
  private readonly index: Map<string, ManifestEntry>;

  public constructor(data: CampaignManifestData) {
    this.manifest = data;
    this.index = new Map(
      data.entries.map((entry) => [manifestEntryKey(entry), entry]),
    );
  }

  public get campaignId(): string {
    return this.manifest.campaignId;
  }

  public entries(): ManifestEntry[] {
    return this.manifest.entries;
  }

  public get(key: string): ManifestEntry | undefined {
    return this.index.get(key);
  }

  /** Entries not yet completed (pending / running / failed / retry-scheduled). */
  public incomplete(): ManifestEntry[] {
    return this.manifest.entries.filter((e) => e.status !== "completed");
  }

  public update(key: string, patch: Partial<ManifestEntry>): void {
    const entry = this.index.get(key);
    if (!entry) {
      return;
    }
    Object.assign(entry, patch);
  }

  public progress(): ManifestProgress {
    const count = (status: ManifestStatus): number =>
      this.manifest.entries.filter((e) => e.status === status).length;
    return {
      total: this.manifest.entries.length,
      pending: count("pending"),
      running: count("running"),
      completed: count("completed"),
      failed: count("failed"),
      retryScheduled: count("retry-scheduled"),
    };
  }

  /** Plain, JSON-serializable snapshot (safe to persist for resume). */
  public toJSON(): CampaignManifestData {
    return {
      ...this.manifest,
      entries: this.manifest.entries.map((e) => ({ ...e })),
    };
  }

  public static fromJSON(data: CampaignManifestData): Manifest {
    return new Manifest({
      ...data,
      entries: data.entries.map((e) => ({ ...e })),
    });
  }
}

/**
 * Persistence port for resume. A campaign saves its manifest after each entry so
 * an interrupted run can be continued; an implementation may write JSON to disk,
 * a DB, etc. The in-memory default keeps the core deterministic and I/O-free.
 */
export interface ManifestStore {
  load(campaignId: string): Promise<CampaignManifestData | null>;
  save(data: CampaignManifestData): Promise<void>;
}

export class InMemoryManifestStore implements ManifestStore {
  private readonly byCampaign = new Map<string, CampaignManifestData>();

  public async load(campaignId: string): Promise<CampaignManifestData | null> {
    const found = this.byCampaign.get(campaignId);
    return found ? structuredCloneData(found) : null;
  }

  public async save(data: CampaignManifestData): Promise<void> {
    this.byCampaign.set(data.campaignId, structuredCloneData(data));
  }
}

/** Deep-copy a manifest via its JSON projection (no shared references). */
function structuredCloneData(data: CampaignManifestData): CampaignManifestData {
  return {
    ...data,
    entries: data.entries.map((e) => ({ ...e })),
  };
}
