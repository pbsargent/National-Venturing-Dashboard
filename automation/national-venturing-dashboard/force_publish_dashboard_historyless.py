#!/usr/bin/env python3
"""Publish selected files as one parentless commit after verifying the GitHub remote."""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
TOKEN_FILE = Path.home() / ".config/national-venturing-dashboard/github-token"
BRANCH = "main"
DEFAULT_PATHS = ("data/crews.csv", "data/dashboard-data.json")


def run(args, *, env=None):
    shown = ["[AUTH REDACTED]" if "AUTHORIZATION:" in arg else arg for arg in args]
    print("$", " ".join(shown), flush=True)
    result = subprocess.run(args, cwd=REPO, env=env, text=True, capture_output=True, check=False)
    if result.stdout:
        print(result.stdout, end="", flush=True)
    if result.stderr:
        print(result.stderr, end="", flush=True)
    if result.returncode:
        raise RuntimeError(f"Command failed with exit {result.returncode}: {' '.join(shown)}")
    return result.stdout.strip()


def git(args, *, env=None):
    return run(["git", *args], env=env)


def load_token():
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    if not token and TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    return "" if token == "PASTE_GITHUB_TOKEN_HERE" else token


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", default=list(DEFAULT_PATHS))
    parser.add_argument(
        "--expected-remote",
        default=os.environ.get("VENTURING_DASHBOARD_REMOTE_URL"),
        help="Exact origin URL. May also be supplied with VENTURING_DASHBOARD_REMOTE_URL.",
    )
    parser.add_argument("--message")
    parser.add_argument("--result-json", type=Path)
    args = parser.parse_args()
    if not args.expected_remote:
        raise RuntimeError("Set --expected-remote or VENTURING_DASHBOARD_REMOTE_URL before publishing")
    if git(["remote", "get-url", "origin"]) != args.expected_remote:
        raise RuntimeError(f"Refusing to publish: origin does not match {args.expected_remote}")
    if git(["branch", "--show-current"]) != BRANCH:
        raise RuntimeError(f"Refusing to publish: checked-out branch is not {BRANCH}")

    paths = list(dict.fromkeys(args.paths))
    missing = [path for path in paths if not (REPO / path).is_file()]
    if missing:
        raise RuntimeError("Selected files do not exist: " + ", ".join(missing))

    git(["fetch", "--no-write-fetch-head", "origin", BRANCH])
    expected_remote_commit = git(["rev-parse", f"origin/{BRANCH}"])
    with tempfile.NamedTemporaryFile(prefix="venturing-dashboard-index-", delete=False) as handle:
        index_path = Path(handle.name)
    index_path.unlink(missing_ok=True)
    index_env = os.environ.copy()
    index_env["GIT_INDEX_FILE"] = str(index_path)
    try:
        git(["read-tree", f"origin/{BRANCH}"], env=index_env)
        git(["add", "--", *paths], env=index_env)
        tree = git(["write-tree"], env=index_env)
    finally:
        index_path.unlink(missing_ok=True)

    if tree == git(["rev-parse", f"origin/{BRANCH}^{{tree}}"]):
        result = {"status": "not needed", "commit": expected_remote_commit, "historyless": True, "paths": paths}
    else:
        message = args.message or f"Refresh Venturing dashboard data for {datetime.now().date().isoformat()}"
        commit = git(["commit-tree", tree, "-m", message])
        token = load_token()
        push_args = ["push", f"--force-with-lease=refs/heads/{BRANCH}:{expected_remote_commit}", "origin", f"{commit}:refs/heads/{BRANCH}"]
        push_env = os.environ.copy()
        if token:
            auth = base64.b64encode(f"x-access-token:{token}".encode()).decode("ascii")
            push_args = ["-c", f"http.https://github.com/.extraheader=AUTHORIZATION: basic {auth}", *push_args]
            push_env["GH_TOKEN"] = token
            push_env["GITHUB_TOKEN"] = token
        git(push_args, env=push_env)
        result = {"status": "pushed", "commit": commit, "historyless": True, "paths": paths}

    if args.result_json:
        args.result_json.parent.mkdir(parents=True, exist_ok=True)
        args.result_json.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
