"""Build no-op predictions + reviewer meta for the runtime-error POSITIVE batch (doc-19 §6).

Runtime-error instances chosen so the FAIL_TO_PASS test may crash INSIDE the library source
(crash site == fix site), with a VAGUE issue that does not paste the traceback — the headroom
the flask feature-add batch lacked. The no-op patch leaves the bug in place so the harness
harvests the real failing-test traceback. Separate filenames (*_rt) keep the flask artifacts.
"""
import json
import re
from pathlib import Path
import datasets

IDS = [
    # A: clean crash — exception raised inside the gold file (expect B to help)
    "sympy__sympy-21627",   # complexes.py  RecursionError on is_zero
    "sympy__sympy-12481",   # permutations.py  ValueError in constructor
    "sympy__sympy-24066",   # unitsystem.py  ValueError in _collect_factor_and_dimension
    # B: mixed — crash may land elsewhere / wrong-value assert (tests the mislead caveat)
    "sympy__sympy-21379",   # mod.py  PolynomialError (may raise in polytools)
    "pytest-dev__pytest-7220",  # nodes.py  wrong displayed path (value bug)
    "pytest-dev__pytest-5413",  # code.py   str() behavior (value bug)
]

NOOP = (
    "diff --git a/noop_swebench.txt b/noop_swebench.txt\n"
    "new file mode 100644\n"
    "--- /dev/null\n"
    "+++ b/noop_swebench.txt\n"
    "@@ -0,0 +1 @@\n"
    "+noop\n"
)

ds = datasets.load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
rows = {r["instance_id"]: r for r in ds if r["instance_id"] in IDS}

out = Path(r"C:\Users\chntw\swe-run")
out.mkdir(exist_ok=True)
preds, meta = [], []
for iid in IDS:
    r = rows[iid]
    gold_files = sorted(set(re.findall(r"^\+\+\+ b/(.+)$", r["patch"], re.M)))
    meta.append({
        "instance_id": iid,
        "repo": r["repo"],
        "problem_statement": r["problem_statement"],
        "gold_files": gold_files,
        "fail_to_pass": json.loads(r["FAIL_TO_PASS"]),
    })
    preds.append({"instance_id": iid, "model_name_or_path": "noop", "model_patch": NOOP})

(out / "noop_preds_rt.jsonl").write_text("\n".join(json.dumps(p) for p in preds) + "\n", newline="\n")
(out / "reviewer_meta_rt.json").write_text(json.dumps(meta, indent=2), newline="\n")
print(f"wrote {len(preds)} preds + {len(meta)} meta -> {out}")
for m in meta:
    print(" ", m["instance_id"], "gold:", m["gold_files"])
