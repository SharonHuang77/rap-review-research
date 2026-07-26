import json
from collections import Counter
import datasets

ds = datasets.load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
counts = Counter(r["repo"] for r in ds)
print("repos in Lite (repo: n):")
for repo, n in counts.most_common():
    print(f"  {repo}: {n}")

# small/fast eval images: requests, flask, sqlfluff, pytest
prefer = ["psf/requests", "pallets/flask", "sqlfluff/sqlfluff", "pytest-dev/pytest"]
pick_repo = next((r for r in prefer if counts.get(r)), None)
print("\npicked repo:", pick_repo)
if pick_repo:
    cands = [r for r in ds if r["repo"] == pick_repo]
    # smallest gold patch = likely simplest bug
    cands.sort(key=lambda r: len(r["patch"]))
    for r in cands[:5]:
        print(r["instance_id"], "| F2P:", json.loads(r["FAIL_TO_PASS"])[:1],
              "| patch_lines:", r["patch"].count("\n"))
