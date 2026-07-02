import type { ExportHistoryView } from "./models/export-history-view.ts";
import type { ExportHistoryReadPort } from "./ports.ts";

import { ExportHistoryViewBuilder } from "./builders/export-history-view-builder.ts";

export interface ExportHistoryServiceDependencies {
  readonly history: ExportHistoryReadPort;
  readonly builder?: ExportHistoryViewBuilder;
}

/**
 * Exposes previously generated export metadata as an {@link ExportHistoryView}
 * (RFC-11 §6, Step 8). It reads from the history port and delegates the
 * transform to the {@link ExportHistoryViewBuilder}. It never generates an
 * export; exports are produced by the RFC-10 Export Service and recorded into
 * the history source.
 */
export class ExportHistoryService {
  private readonly history: ExportHistoryReadPort;
  private readonly builder: ExportHistoryViewBuilder;

  public constructor(deps: ExportHistoryServiceDependencies) {
    this.history = deps.history;
    this.builder = deps.builder ?? new ExportHistoryViewBuilder();
  }

  public async getExportHistory(): Promise<ExportHistoryView> {
    const records = await this.history.list();
    return this.builder.build(records);
  }
}
