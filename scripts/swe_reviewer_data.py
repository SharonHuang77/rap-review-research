import json
import re
from pathlib import Path
import datasets

IDS = ["pallets__flask-4045", "pallets__flask-4992", "pallets__flask-5063"]
ds = datasets.load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
rows = {r["instance_id"]: r for r in ds if r["instance_id"] in IDS}

# A valid NO-OP patch (adds a throwaway new file): applies cleanly, changes no code, so the
# real bug remains and FAIL_TO_PASS fails at base -> we harvest the failing-test traceback.
# (An empty prediction is skipped by the harness as "no submission".)
NOOP = (
    "diff --git a/noop_swebench.txt b/noop_swebench.txt\n"
    "new file mode 100644\n"
    "--- /dev/null\n"
    "+++ b/noop_swebench.txt\n"
    "@@ -0,0 +1 @@\n"
    "+noop\n"
)

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

(out / "noop_preds.jsonl").write_text("\n".join(json.dumps(p) for p in preds) + "\n", newline="\n")
(out / "reviewer_meta.json").write_text(json.dumps(meta, indent=2), newline="\n")
print(f"wrote {len(preds)} empty preds + {len(meta)} meta -> {out}")
for m in meta:
    print(" ", m["instance_id"], "gold_files:", m["gold_files"])
