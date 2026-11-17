#!/usr/bin/env python3
"""Build and validate dashboard data without publishing it."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PYTHON = Path("/Users/petersargent/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--result-json", type=Path)
    args = parser.parse_args()
    command = [str(PYTHON), "scripts/refresh_data.py"]
    if args.source:
        command.extend(["--source", str(args.source)])
    subprocess.run(command, cwd=REPO, check=True, timeout=240)

    dashboard_path = REPO / "data" / "dashboard-data.json"
    csv_path = REPO / "data" / "crews.csv"
    dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))
    rows = dashboard.get("crews", [])
    meta = dashboard.get("meta", {})
    if meta.get("rowCount") != len(rows):
        raise RuntimeError("Dashboard row count does not match the generated crew records")
    if meta.get("metricJoinMatched", 0) + meta.get("metricJoinMissing", 0) != len(rows):
        raise RuntimeError("UnitMetric join counts do not reconcile")
    if not csv_path.is_file() or csv_path.stat().st_size == 0:
        raise RuntimeError("Generated CSV is missing or empty")

    forbidden = {"beascoutcontact", "beascoutemail", "beascoutphone", "beascoutaddress", "crewwebsite", "charterorg"}
    exposed = forbidden.intersection({key.casefold() for row in rows for key in row})
    if exposed:
        raise RuntimeError(f"Private workbook columns were exposed: {', '.join(sorted(exposed))}")

    result = {
        "status": "built",
        "sourceCaptureName": meta.get("sourceCaptureName"),
        "asOf": meta.get("asOf"),
        "rowCount": len(rows),
        "metricJoinMatched": meta.get("metricJoinMatched"),
        "metricJoinMissing": meta.get("metricJoinMissing"),
        "generatedFiles": ["data/crews.csv", "data/dashboard-data.json"],
    }
    if args.result_json:
        args.result_json.parent.mkdir(parents=True, exist_ok=True)
        args.result_json.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
