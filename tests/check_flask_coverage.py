"""Gate the Python branch percentage independently of statement coverage."""

import json
import sys
from pathlib import Path

totals = json.loads(Path("coverage-flask.json").read_text(encoding="utf-8"))["totals"]
covered = totals["covered_branches"]
branches = totals["num_branches"]
if not branches:
    sys.exit("No Python branches were measured")
print(f"Python branch coverage: {covered}/{branches} = {100 * covered / branches:.2f}%")
if covered * 100 < 80 * branches:
    sys.exit("Python branch coverage must be at least 80%")
