import type { BenchmarkDataset } from "../benchmark/index.ts";
import type { BenchmarkInstance } from "../benchmark/index.ts";
import type { QodoRawDataset } from "../benchmark/adapters/qodo-pr-review-bench-adapter.ts";
import type { SWEPRBenchDataset } from "../benchmark/adapters/swe-prbench-adapter.ts";

import {
  QodoPRReviewBenchAdapter,
  SWEPRBenchAdapter,
} from "../benchmark/index.ts";

/** One benchmark instance flattened with its dataset context, in campaign order. */
export interface LoadedInstance {
  readonly datasetId: string;
  readonly dataset: BenchmarkDataset;
  readonly instance: BenchmarkInstance;
}

/**
 * Loads benchmark instances for a campaign. It wraps the RFC-13 dataset adapters
 * (turning raw Qodo / SWE payloads into {@link BenchmarkDataset}s) and flattens
 * datasets into an ordered instance list. It performs no I/O — the caller reads
 * the raw payload — keeping full datasets out of the module and out of tests.
 */
export class BenchmarkLoader {
  private readonly qodo = new QodoPRReviewBenchAdapter();
  private readonly swe = new SWEPRBenchAdapter();

  public loadQodo(raw: QodoRawDataset): BenchmarkDataset {
    return this.qodo.toDataset(raw);
  }

  public loadSwe(raw: SWEPRBenchDataset): BenchmarkDataset {
    return this.swe.toDataset(raw);
  }

  /**
   * Flatten datasets into a single ordered list of instances. Order is stable:
   * datasets in the given order, instances in dataset order — so campaign
   * execution and manifests are reproducible.
   */
  public flatten(datasets: BenchmarkDataset[]): LoadedInstance[] {
    const loaded: LoadedInstance[] = [];
    for (const dataset of datasets) {
      for (const instance of dataset.instances) {
        loaded.push({ datasetId: dataset.datasetId, dataset, instance });
      }
    }
    return loaded;
  }
}
