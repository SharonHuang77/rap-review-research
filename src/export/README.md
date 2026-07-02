# Export Service (RFC-10)

Turns evaluated `ExperimentComparison[]` (the RFC-07 output) into research
dataset **strings** — CSV or JSON — ready to hand to analysis notebooks or paper
scripts.

> Spec: `docs/implementaion/10-export-service.md`

```
ExperimentComparison[] → ExportService.exportComparisons(input, "csv") → ExperimentExportResult
ExperimentComparison[] → ExportService.exportComparisons(input, "json") → ExperimentExportResult
```

**Deterministic and pure**: no repositories, no databases, no LLM/Bedrock calls,
no `Date.now`/randomness, and **nothing written to disk or S3**. It also computes
**no metrics** — it only projects and serializes what the Evaluation Engine
already produced. File writing and object-store persistence are out of scope
(future dashboard/persistence RFCs).

## Files

```
src/export/
├── export-service.ts        # IExportService + ExportService + createExportService()
├── exporter-registry.ts     # ExporterRegistry + InMemoryExporterRegistry
├── export-errors.ts         # ExportError / UnsupportedExportFormatError / ExportSerializationError
├── index.ts                 # public barrel
├── exporters/
│   ├── experiment-exporter.ts       # IExperimentExporter (pluggable per format)
│   ├── csv-experiment-exporter.ts   # CsvExperimentExporter
│   └── json-experiment-exporter.ts  # JsonExperimentExporter
└── models/
    ├── experiment-export-input.ts   # ExportFormat + ExperimentExportInput
    ├── experiment-export-result.ts  # ExperimentExportResult + exportFileName()
    └── research-export-row.ts        # ResearchExportRow + STABLE_COLUMNS + toResearchExportRows()
```

## Formats

- **CSV** — a header row plus **one row per architecture per comparison**, in the
  frozen `STABLE_COLUMNS` order (19 columns). Cells with commas, quotes, or
  newlines are quoted with doubled inner quotes (RFC-4180 style). Undefined
  optional signals render as empty strings; numbers are preserved verbatim.
- **JSON** — the full `ExperimentComparison[]` structure, pretty-printed. Its
  `rowCount` is the total number of architecture entries across all comparisons
  (consistent with CSV row semantics).

The `STABLE_COLUMNS` names are consumed by downstream paper scripts and must not
be renamed once the experiment freeze begins.

## Usage

```ts
import { createExportService } from "./src/export/index.ts";

const service = createExportService();
const result = await service.exportComparisons(
  { generatedAt: "2026-06-28T12:00:00.000Z", comparisons },
  "csv",
);
// result.content is the CSV string; result.fileName is a suggested name.
```

Run the end-to-end demo (mock provider, no Bedrock):

```
npm run demo:export
```

## Adding a format

Implement `IExperimentExporter` for the new `ExportFormat`, then register it in
`createExportService()` (or a custom `InMemoryExporterRegistry`). The service
resolves the exporter by format and throws `UnsupportedExportFormatError` when
none is registered.
