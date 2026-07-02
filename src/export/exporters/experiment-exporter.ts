import type {
  ExportFormat,
  ExperimentExportInput,
} from "../models/experiment-export-input.ts";
import type { ExperimentExportResult } from "../models/experiment-export-result.ts";

/**
 * Pluggable exporter contract. The Export Service depends only on this
 * interface, not on concrete CSV/JSON implementations.
 */
export interface IExperimentExporter {
  readonly format: ExportFormat;
  export(input: ExperimentExportInput): Promise<ExperimentExportResult>;
}
