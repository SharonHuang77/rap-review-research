import type { ExperimentComparison } from "../../evaluation/models/experiment-comparison.ts";

/** Supported export formats (pluggable). */
export type ExportFormat = "csv" | "json";

/**
 * Input to the Export Service: the evaluated comparisons plus a caller-supplied
 * timestamp (the service performs no time/IO of its own).
 */
export interface ExperimentExportInput {
  readonly generatedAt: string;
  readonly comparisons: ExperimentComparison[];
}
