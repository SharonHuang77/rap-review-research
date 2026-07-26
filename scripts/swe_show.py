"""Dump problem_statement + FAIL_TO_PASS for chosen instance IDs (crash-vs-assert triage)."""
import json
import re
import sys
import datasets

IDS = sys.argv[1:] or [
    "sympy__sympy-21627", "sympy__sympy-12481", "sympy__sympy-24066", "sympy__sympy-21379",
    "pytest-dev__pytest-7220", "pytest-dev__pytest-5413", "pytest-dev__pytest-11148",
    "scikit-learn__scikit-learn-11040",
]
ds = datasets.load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
rows = {r["instance_id"]: r for r in ds if r["instance_id"] in IDS}
for iid in IDS:
    r = rows[iid]
    gold = sorted(set(re.findall(r"^\+\+\+ b/(.+)$", r["patch"], re.M)))
    ps = re.sub(r"\s+", " ", r["problem_statement"] or "").strip()
    print(f"\n===== {iid}  gold={gold}")
    print("F2P:", json.loads(r["FAIL_TO_PASS"])[:2])
    print(ps[:700])
