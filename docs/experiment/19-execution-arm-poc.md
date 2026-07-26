# doc-19 — Execution arm POC (③): minimal repro + lightweight execution

Status: **POC done — all three paths.** Exploratory. (1) *Light* path (self-contained repro, no
sandbox): ~15% reachable (§1–4). (2) *Heavy* path (real SWE-bench Docker execution): proven
end-to-end on Windows — gold patch on a network-free instance **resolves** (§5). (3) *Reviewer-on-
top* (§6, the conclusive test): on **runtime-error** instances with vague issues, feeding the
failing-test traceback lifts file-localization recall **17%→83%** (Δ+4 of 6; the traceback-names-
fix-file slice **25%→100%**), while on issue-rich **feature-add** instances it is a ceiling (both
100%, Δ0). Execution is the localization lever *exactly where reading fails*.

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

## 6. Reviewer-on-top — the conclusive execution recall test

**Design.** Same model (Haiku-4.5), same base context, two arms per SWE-bench-Lite instance:
*A (read-only)* = issue text → which source file contains the bug; *B (execution)* = issue text
**+ the FAIL_TO_PASS traceback** harvested by a no-op-patch harness run (the bug is left in place,
so the real failing-test output is produced — **zero extra image builds** beyond the run itself).
Ground truth = the file the gold patch edits; recall = predicted ∩ gold ≠ ∅. The only difference
between arms is the traceback, so Δrecall isolates the execution signal. `scripts/swe_runtime_data.py`
(predictions) + `scripts/swe-reviewer-eval.ts` (the two-arm eval), temperature 0.

### 6.1 First batch (3 flask, feature-add) — a ceiling, and a caught artifact
The flask instances (`4045/4992/5063`) are feature-additions with issues that name the component.
Read-only already localizes **3/3 (100%)** → no headroom, **B = A = 100%, Δ0**. Two lessons:
- **A caught measurement artifact.** At `maxTokens=200` the traceback arm looked *worse* (Δ−2):
  Haiku reasons in prose first and the trailing JSON answer was **truncated away** → parsed empty.
  Raising the cap (→800) and printing the response tail confirmed every answer now ends with a
  complete array. The "execution hurts" reading was a truncation artifact, not a signal. (The eval
  parser accepts **only** the JSON array answer — it never scavenges `.py` paths from reasoning
  prose, which would count files the model merely *mentioned* as localizations and inflate recall.)
- **Crash-site ≠ fix-site.** For feature-add bugs the FAIL_TO_PASS test crashes at the **test call
  site**, not the fix file: `flask-4992` fails at `tests/test_config.py:43: TypeError` while the fix
  is `config.py`; `flask-4045`'s traceback sprawls across `src/flask/*.py` (239 refs). So a raw
  traceback is not a clean file-pointer here — and the model correctly leaned on the issue instead.

The ceiling means this batch **cannot** test the lever: you need instances where *reading fails*.

### 6.2 Second batch (6 runtime-error, vague issue) — the positive result
Selected (`scripts/swe_pick_runtime.py`) for: runtime-error language, **single** gold file, issue
does **not** paste a traceback (else A sees it too), network-free repos. This puts read-only into
its failure regime and lets execution show its value.

| instance | gold file | goldInTb | A read-only | B execution |
|---|---|---|---|---|
| sympy-21627 | `complexes.py` | yes | ✗ hyperbolic/trig/assumptions | ✓ (reads `Abs.eval` frame) |
| sympy-12481 | `permutations.py` | yes | ✓ | ✓ (tie — issue names `Permutation`) |
| sympy-24066 | `unitsystem.py` | yes | ✗ `si.py` | ✓ (execution corrects si→unitsystem) |
| sympy-21379 | `mod.py` | yes | ✗ expr/hyperbolic/operations | ✓ `mod.py` (past the crash frame) |
| pytest-7220 | `nodes.py` | no | ✗ reports/pathlib/python | ✓ reports/pathlib/**nodes** |
| pytest-5413 | `code.py` | no | ✗ `outcomes.py` | ✗ `python_api.py` |

- **Overall: A read-only 1/6 (17%) → B execution 5/6 (83%), Δ +4.**
- **goldInTb sub-slice (n=4, the traceback names the fix file): A 1/4 (25%) → B 4/4 (100%), Δ +3.**

**Interpretation.** On the repo-integrated functional hard-core — vague issue, large repo — reading
the issue localizes almost nothing (17%); the **execution artifact carries the file-level signal
the issue lacks** and lifts recall to 83%. The `goldInTb` split is the mechanism, made explicit and
honest: when crash-site == fix-site (the traceback names the fix file) execution takes localization
**25%→100%**; when the crash lands elsewhere (`goldInTb=no`) it is a toss-up — `pytest-7220` still
wins (the execution context sharpens reasoning even without naming the file), `pytest-5413` misses
(traceback points at `python_api`, fix is `code.py`). The two best cases are qualitative proof, not
just a tally: `sympy-24066`, where the *issue actively misleads* to `si.py` and execution corrects
to `unitsystem.py`; and `sympy-21379`, where B navigates **past** the crash frame (`polytools`) to
the root-cause `mod.py`. The lone tie (`sympy-12481`) is exactly where the issue already names the
component — the flask ceiling in miniature.

**This is the conclusive ③.** Read against §1–4 (light path skims the ~15% extractable slice) and
§5 (heavy execution resolves for real), the reviewer-on-top result closes the loop: **execution is
the localization/recall lever precisely on the slice reading and read-only agency (②/doc-18) cannot
reach.** It is the review-time confirmation of the doc-17 thesis — only a mechanism-changing signal
(here, running the code) moves the recall frontier.

### 6.3 Caveats
- **Exploratory, n=6, single model (Haiku-4.5), file granularity.** Directional, not a benchmark.
- B **receives** the traceback — that is the point (the execution artifact *is* the signal), and the
  `goldInTb` sub-slice isolates when/why it helps rather than treating the raw hit rate as magic.
- Truncation was ruled out (800-token cap, tail-verified complete answers); temperature 0. A real
  scale-up would broaden repos/instances, add function/line granularity, and a stronger reviewer.
