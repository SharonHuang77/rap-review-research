# doc-19 — Execution arm POC (③): minimal repro + lightweight execution

Status: **POC done — both paths.** Exploratory. (1) *Light* path (self-contained repro, no
sandbox): ~15% reachable (§1–4). (2) *Heavy* path (real SWE-bench Docker execution): proven
end-to-end on Windows — gold patch on a network-free instance **resolves** (§5). Reviewer-on-top
experiment is the remaining step.

## 0. Idea

②/doc-18 showed read-only agency can't reach the ~15% functional hard-core (§10); reading isn't
enough, you have to *run* code. But full repo execution is heavy (per-repo env + tests + sandbox).
The light path: for a candidate finding, ask the model to write a **fully self-contained** repro
(stdlib only, no project/3rd-party imports) that prints `BUG_REPRODUCED`+exit≠0 if the defect is
real, `OK`+exit 0 otherwise, or `SKIP` if it can't be self-contained. Run it in a **timed
subprocess** (8s), classify. `scripts/exec-repro-poc.ts`; live generation (Haiku), local exec.

## 1. Result — n=20 functional-defect findings (Qodo, 10 TP / 10 FP)

| outcome | TP | FP |
|---|---|---|
| SKIP (not self-containable) | 8 | 9 |
| REPRO (bug demonstrated, exit≠0) | 2 | 1 |
| NOREPRO / ERROR / TIMEOUT | 0 | 0 |

- **Reachability ≈ 15% (3/20).** The overwhelming majority **SKIP** — the model itself judges the
  defect can't be reproduced without the repo/framework. This is the headline: the light path
  **skims only the extractable-logic slice**; the bulk of the functional hard-core is genuinely
  repo/framework/runtime-integrated.
- **On the reachable slice, execution is a valid precision signal:** of the 3 that produced a
  runnable repro, 2/3 REPRO were true defects (2 TP vs 1 FP). When a self-contained repro *can* be
  built and it fails, it's usually a real bug — a hard signal the LLM verifiers (§9, max P~0.37)
  don't get. (n tiny — directional.)

## 2. Interpretation

This **confirms why the functional hard-core is hard** and closes the "can we shortcut the
sandbox?" question: the light path is elegant and cheap but **~85% SKIP** — exactly the cross-
file / dynamic-import / framework / runtime defects that make the hard-core hard are the ones you
*cannot* extract into a stdlib snippet. So the minimal-repro trick is a **cheap complement for the
~15% extractable-logic slice**, not a replacement for repo execution on the rest.

It also sharpens the §10/§11 three-tools map: the "execution" tool itself **splits** —
- **light execution** (self-contained repro, no sandbox) → the extractable-logic minority, cheap;
- **heavy execution** (real repo build + tests, sandbox) → the repo-integrated majority of the
  hard-core — unavoidable for that slice.

Consistent with the whole thesis: no shortcut collapses the hard-core; it needs the actual tool
(here, real execution), and most of it needs the *heavy* form.

## 3. Caveats

- n=20, functional-only, single sample — reachability ~15% is directional, not precise.
- **Security:** runs LLM-generated code in a subprocess with an 8s timeout on a trusted research
  machine — acceptable for a POC; production needs real isolation (container/VM).
- SKIP is self-reported by the model (it declines when it can't self-contain); a stronger model
  might repro a few more, but the cross-file/framework wall is structural.

## 4. Next

- **Light path is worth keeping** as a cheap precision verifier for the extractable-logic slice
  (pairs with §9's finding that agreement/aspect verifiers cap at ~0.37 — a *failing test* is a
  stronger signal where it applies).
- **Heavy path** for the rest: build the real-execution arm on a benchmark with **pre-dockerized
  per-instance environments + tests (SWE-bench-style)** rather than c-CRAB, to skip ~90% of the
  env-setup cost. That is the conclusive form of ③.

## 5. Heavy path — real SWE-bench execution works end-to-end (RESOLVED)

Rather than leave the heavy path as a design note, we stood it up. The SWE-bench-Lite Docker
harness, gold patch, one **network-free** instance (`pallets__flask-5063`):

> **`resolved: 1`** — gold patch applied cleanly, `FAIL_TO_PASS`+`PASS_TO_PASS` all green *inside
> the container*. The ground-truth execution loop is proven: a real container builds the repo
> environment, applies a patch, runs the actual test suite, and returns a hard pass/fail.

(An earlier `psf__requests-863` run also executed for real — `69 passed, 7 failed` in 65 s — but
that 2012-era instance's tests make **external HTTP calls** absent in the sandbox, so it reports
"unresolved" for a *network* reason, not the patch. Prefer network-free repos.)

### Running the Linux SWE-bench harness on Windows — the 4 fixes (reproducibility)
The harness is Linux-designed; on this Windows box (Docker Desktop running, linux/amd64 engine)
it took four fixes:
1. **Python**: uv's managed interpreter is blocked by Application Control → use a stdlib venv from
   the *system* Python (`python -m venv`), which is policy-allowed. (swebench 4.1.0 installs on
   3.14.)
2. **`import resource`** (Unix-only; breaks harness import) → drop a stub `resource.py` on the
   venv path with no-op `getrlimit`/`setrlimit`.
3. **`cp1252` UnicodeEncodeError** writing pytest output on Windows → run with `PYTHONUTF8=1`.
4. **CRLF**: `eval.sh`+patch written with Windows line endings break bash/git inside the Linux
   container (`$'…\r'`, `pytest: command not found`, `patch does not apply`) → patch swebench's two
   `Path.write_text(...)` calls (`run_evaluation.py`: patch.diff, eval.sh) to `newline="\n"`.

Run: `python -m swebench.harness.run_evaluation --dataset_name princeton-nlp/SWE-bench_Lite
--predictions_path gold --run_id X --instance_ids <id> --max_workers 1 --cache_level instance`.
Pick network-free repos (flask/sympy/pytest/pylint); avoid old requests/network suites.

### What this unlocks (the conclusive ③)
The infra is proven on this machine. The reviewer experiment on top: feed the **failing-test
output** (the ground-truth signal) to the reviewer and measure whether it recovers defects
diff-only misses — the recall lever for the repo-integrated majority of the functional hard-core
that the light path (§1–4) could not reach. That is the conclusive test of the execution lever.
