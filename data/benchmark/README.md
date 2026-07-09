# Benchmark data (`campaign:live` inputs)

`campaign:live` reads `qodo.json` and `swe.json` from this directory (override
with `BENCHMARK_DATA_DIR`). Each is a **raw dataset** in the shape its adapter
expects (`src/benchmark/adapters/`), loaded via `BenchmarkLoader`.

## `qodo.json` — Qodo PR-Review-Bench (E1, objective correctness)

**Real data**, the full 100-PR benchmark. This is the primary correctness
dataset and what hypothesis **H2 (specialization)** rests on.

- **Source:** [`Qodo/PR-Review-Bench`](https://huggingface.co/datasets/Qodo/PR-Review-Bench),
  file `git_code_review_bench_100_w_open_prs.jsonl` (100 rows: `repo`,
  `pr_url_to_review`, `issues`, `num_of_issues`).
- **Diffs:** the HF rows carry ground-truth `issues` but **no diff**, so each
  PR's diff was fetched from GitHub
  (`github.com/agentic-review-benchmarks/<repo>/pull/<n>.diff`) and stored as the
  instance's `diff`.
- **Ground truth:** `file_path` / `start_line` / `end_line` / `title` /
  `description` map straight onto the adapter; `rule_name` → `category`.
- **Location-less issues dropped:** 37 of the 580 upstream issues (6.4%) have
  `file_path: null, start_line: null` (PR-level findings with no anchor). The
  file+line evaluator — and A2, which also gates on a file match — cannot score
  an unanchored issue, so they are omitted rather than reshaped. Result: **100
  instances, 543 located ground-truth issues, every instance retains ≥1.**

### Regenerating / expanding

1. Download the HF JSONL (link above).
2. For each row, parse `<repo>`/`<pr#>` from `pr_url_to_review` and fetch the
   diff via the authenticated API
   (`gh api repos/agentic-review-benchmarks/<repo>/pulls/<n> -H "Accept: application/vnd.github.v3.diff"`).
3. Emit `{ dataset_id, name, rows: [{ id, pr_title, diff, issues: [{ file_path,
   start_line, end_line, title, description, category }] }] }`, filtering
   issues whose `file_path`/`start_line` is null.

## `swe.json` — SWE-PRBench (E2, human agreement) — ⚠ PLACEHOLDER SAMPLE

Still the **2-instance sample fixture**, not real data. The real source
([withmartian/code-review-benchmark](https://github.com/withmartian/code-review-benchmark),
`offline/golden_comments/`) provides PR-level human comments with a `severity`
but **no file path or line** — incompatible with the current file+line SWE
adapter. Ingesting it needs a **semantic-only matching mode** (drop the file/line
gate, match via the A2 judge). Tracked as follow-up; do not treat `swe.json`
as real yet.
