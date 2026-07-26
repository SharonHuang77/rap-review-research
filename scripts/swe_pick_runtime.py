"""Mine SWE-bench-Lite for the reviewer-on-top *positive* test bed (doc-19 §6).

We want instances where the EXECUTION signal can add localization the issue lacks:
  - runtime-error bug (issue uses exception language) so the failing test may crash INSIDE
    the library source (crash site = fix site), not just assert a wrong value;
  - issue does NOT already paste a `Traceback (most recent call last)` — else the read-only
    arm A sees it too and there is no headroom (the ceiling that killed the flask batch);
  - network-free, exception-prone repos (sympy/pytest/pylint/sphinx/astropy);
  - single gold file (clean ground truth).
Sort so issues that do NOT name the gold file stem come first (higher read-only miss chance).

Prints candidates only; pick a batch, then feed IDS to swe_runtime_data.py to build predictions.
"""
import json
import re
import datasets

TARGET = {
    "sympy/sympy", "pytest-dev/pytest", "pylint-dev/pylint",
    "sphinx-doc/sphinx", "astropy/astropy", "scikit-learn/scikit-learn",
}
ERR = re.compile(r"\b(TypeError|ValueError|AttributeError|KeyError|IndexError|"
                 r"RuntimeError|NameError|ZeroDivisionError|RecursionError|raises?\b|crash|exception)\b", re.I)
HAS_TB = re.compile(r"Traceback \(most recent call last\)")

ds = datasets.load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
cands = []
for r in ds:
    if r["repo"] not in TARGET:
        continue
    gold = sorted(set(re.findall(r"^\+\+\+ b/(.+)$", r["patch"], re.M)))
    if len(gold) != 1:
        continue
    ps = r["problem_statement"] or ""
    if not ERR.search(ps) or HAS_TB.search(ps):
        continue
    stem = gold[0].split("/")[-1].replace(".py", "")
    names_file = 1 if re.search(rf"\b{re.escape(stem)}\b", ps) else 0  # issue mentions gold stem?
    f2p = json.loads(r["FAIL_TO_PASS"])
    cands.append((names_file, len(ps), r["instance_id"], r["repo"].split("/")[-1], gold[0], len(f2p)))

cands.sort(key=lambda c: (c[0], c[1]))  # not-naming-file first, then shorter issue
print(f"{'names?':6} {'len':5} {'instance_id':32} {'repo':7} {'gold_file':40} f2p")
for names_file, plen, iid, repo, gold, nf2p in cands[:24]:
    print(f"{names_file:<6} {plen:<5} {iid:32} {repo:7} {gold:40} {nf2p}")
print(f"\ntotal candidates: {len(cands)}  (names?=0 means issue does NOT mention the gold file stem)")
