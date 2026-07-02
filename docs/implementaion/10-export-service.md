# 10 — Export Service

**Module:** Research Export Service
**Status:** Ready for Implementation
**Dependencies:** RFC-06 Storage Engine, RFC-07 Research Evaluation Engine, RFC-09 Consensus Review Architecture

---

## 1. Purpose

The Export Service converts evaluated experiment results into research-ready datasets.

Its purpose is to produce files that can be used for:

* thesis tables
* statistical analysis
* charts
* reproducibility checks
* future research reuse

The Export Service is not a dashboard. It is a dataset generation layer.

---

## 2. Research Motivation

The platform now supports all three review architectures:

* Agentless
* Hierarchical
* Consensus

Each architecture produces validated findings and evaluation metrics.

To compare architectures in the paper, the research team needs consistent export files.

The Export Service transforms internal evaluation objects into stable external formats such as CSV and JSON.

---

## 3. Responsibilities

The Export Service is responsible for:

* exporting evaluation metrics
* exporting experiment comparisons
* exporting findings
* exporting architecture-level summaries
* producing CSV-ready datasets
* producing JSON research artifacts
* preserving stable column names

The Export Service is not responsible for:

* running experiments
* validating LLM output
* computing metrics
* rendering dashboard pages
* performing statistical tests
* generating graphs

---

## 4. Architecture

```text
StoredExperimentResult[]
        ↓
Evaluation Engine
        ↓
ExperimentComparison[]
        ↓
Export Service
        ↓
IExperimentExporter
        ↓
CSV / JSON
```

The Export Service should not compute metrics itself.

It consumes outputs produced by the Evaluation Engine.

---

## 5. Exporter Interface

Export formats should be pluggable.

```ts
export interface IExperimentExporter {
  readonly format: ExportFormat;

  export(
    input: ExperimentExportInput
  ): Promise<ExperimentExportResult>;
}
```

```ts
export type ExportFormat =
  | "csv"
  | "json";
```

The Export Service depends on `IExperimentExporter`, not concrete CSV or JSON implementations.

---

## 6. Export Input

```ts
export interface ExperimentExportInput {
  generatedAt: string;
  comparisons: ExperimentComparison[];
}
```

Optional future fields may include:

* promptVersion
* modelVersion
* datasetName
* runId
* gitCommit
* experimentBatchId

---

## 7. Export Result

```ts
export interface ExperimentExportResult {
  format: ExportFormat;
  fileName: string;
  content: string;
  rowCount: number;
  generatedAt: string;
}
```

The initial implementation should return the exported content as a string.

Writing to disk or S3 belongs to a later persistence/export artifact RFC.

---

## 8. Export Service Interface

```ts
export interface IExportService {
  exportComparisons(
    input: ExperimentExportInput,
    format: ExportFormat
  ): Promise<ExperimentExportResult>;
}
```

The service selects the correct exporter by format.

---

## 9. CSV Exporter

Implement:

```ts
export class CsvExperimentExporter implements IExperimentExporter {
  readonly format = "csv";

  async export(
    input: ExperimentExportInput
  ): Promise<ExperimentExportResult> {
    // implementation
  }
}
```

The CSV exporter should produce one row per architecture per comparison.

Example:

```text
snapshotId,architecture,findingCount,highSeverityCount,criticalSeverityCount,averageConfidence,latencyMs,inputTokens,outputTokens,estimatedCostUsd,llmCalls,messageCount,evidenceScore
snap_001,agentless,2,1,0,0.81,12000,5000,700,0.12,1,1,0.68
snap_001,hierarchical,3,2,0,0.84,26000,13000,1800,0.32,3,8,0.74
snap_001,consensus,2,1,0,0.88,41000,25000,3000,0.56,9,22,0.79
```

---

## 10. JSON Exporter

Implement:

```ts
export class JsonExperimentExporter implements IExperimentExporter {
  readonly format = "json";

  async export(
    input: ExperimentExportInput
  ): Promise<ExperimentExportResult> {
    // implementation
  }
}
```

The JSON exporter should preserve the full `ExperimentComparison[]` structure.

---

## 11. Stable Column Names

CSV column names must be stable because they will be used in paper scripts.

Recommended columns:

```text
snapshotId
architecture
findingCount
lowSeverityCount
mediumSeverityCount
highSeverityCount
criticalSeverityCount
averageConfidence
duplicateFindingCount
latencyMs
inputTokens
outputTokens
estimatedCostUsd
llmCalls
messageCount
evidenceScore
architectureAgreement
acceptedFindingRate
laterFixRate
```

Do not rename columns once the experiment freeze begins.

---

## 12. Export Rows

The Export Service may reuse `EvaluationExportRow` from RFC-07.

If needed, define a richer export row:

```ts
export interface ResearchExportRow {
  snapshotId: string;
  architecture: ReviewArchitecture;
  findingCount: number;
  lowSeverityCount: number;
  mediumSeverityCount: number;
  highSeverityCount: number;
  criticalSeverityCount: number;
  averageConfidence: number;
  duplicateFindingCount: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  llmCalls: number;
  messageCount: number;
  evidenceScore: number;
  architectureAgreement?: number;
  acceptedFindingRate?: number;
  laterFixRate?: number;
}
```

---

## 13. CSV Escaping

The CSV exporter must correctly escape:

* commas
* quotes
* newlines
* empty values

Rules:

* wrap fields containing commas, quotes, or newlines in quotes
* escape quotes by doubling them
* represent undefined optional values as empty strings

---

## 14. Export Registry

Use a small registry for exporters.

```ts
export interface ExporterRegistry {
  register(exporter: IExperimentExporter): void;
  get(format: ExportFormat): IExperimentExporter;
}
```

This mirrors the architecture registry and provider patterns used elsewhere in the platform.

---

## 15. Error Handling

Typed errors:

```text
ExportError
UnsupportedExportFormatError
ExportSerializationError
```

Unsupported formats should fail clearly.

Malformed input should fail before producing a partial export.

---

## 16. Folder Structure

```text
src/export/
  export-service.ts
  exporter-registry.ts
  export-errors.ts
  models/
    experiment-export-input.ts
    experiment-export-result.ts
    research-export-row.ts
  exporters/
    experiment-exporter.ts
    csv-experiment-exporter.ts
    json-experiment-exporter.ts
  README.md
```

---

## 17. Testing

Unit tests:

* CSV generation
* CSV escaping
* JSON generation
* exporter registry
* unsupported format error
* empty export
* optional value handling
* stable column order

Integration test:

```text
StoredExperimentResult[]
        ↓
Evaluation Engine
        ↓
ExperimentComparison[]
        ↓
Export Service
        ↓
CSV + JSON
```

No Bedrock calls.

No dashboard.

---

## 18. Acceptance Criteria

* [ ] `IExperimentExporter` implemented
* [ ] `CsvExperimentExporter` implemented
* [ ] `JsonExperimentExporter` implemented
* [ ] `ExporterRegistry` implemented
* [ ] `ExportService` implemented
* [ ] stable CSV columns implemented
* [ ] CSV escaping implemented
* [ ] JSON export implemented
* [ ] unsupported format errors implemented
* [ ] export integration test passes
* [ ] `npm run check` passes

---

## 19. AI Implementation Checklist

Before submitting:

* [ ] Read RFC-07 Evaluation Engine
* [ ] No metric calculation inside Export Service
* [ ] No dashboard code
* [ ] No LLM calls
* [ ] No Bedrock calls
* [ ] No repository access unless explicitly passed data is insufficient
* [ ] CSV columns are stable
* [ ] Tests included
* [ ] README added or updated

---

## 20. Out of Scope

Do not implement:

* dashboard UI
* graph generation
* statistical tests
* S3 export persistence
* scheduled exports
* Google Sheets integration
* dashboard download buttons

This RFC ends with in-memory CSV and JSON export content.

---

## 21. Future Improvements

Future versions may add:

* file writing
* S3 export storage
* dashboard download links
* Parquet export
* Excel export
* experiment batch IDs
* statistical analysis scripts
* figure generation for the paper

---

## Summary

The Export Service turns evaluated experiment comparisons into stable research datasets.

It separates dataset generation from dashboard visualization, preserves stable column names for paper scripts, and uses a pluggable exporter architecture so additional formats can be added without changing the core service.

