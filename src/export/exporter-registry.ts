import type { ExportFormat } from "./models/experiment-export-input.ts";
import type { IExperimentExporter } from "./exporters/experiment-exporter.ts";
import { UnsupportedExportFormatError } from "./export-errors.ts";

/**
 * Registers and resolves exporters by format. Mirrors the ArchitectureRegistry
 * pattern used elsewhere.
 */
export interface ExporterRegistry {
  register(exporter: IExperimentExporter): void;
  /** @throws UnsupportedExportFormatError when no exporter is registered. */
  get(format: ExportFormat): IExperimentExporter;
}

export class InMemoryExporterRegistry implements ExporterRegistry {
  private readonly exporters = new Map<ExportFormat, IExperimentExporter>();

  public register(exporter: IExperimentExporter): void {
    this.exporters.set(exporter.format, exporter);
  }

  public get(format: ExportFormat): IExperimentExporter {
    const exporter = this.exporters.get(format);
    if (!exporter) {
      throw new UnsupportedExportFormatError(
        `No exporter registered for format "${format}".`,
      );
    }
    return exporter;
  }
}
