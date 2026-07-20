#!/usr/bin/env python
"""Parse edited paths (or the hook cwd) from a Claude/Codex hook payload."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys


def payload() -> dict[object, object]:
    raw = os.environ.get("HOOK_INPUT", "")
    try:
        value = json.loads(raw) if raw.strip() else {}
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def paths(data: dict[object, object]) -> list[str]:
    tool_input = data.get("tool_input") or {}
    if not isinstance(tool_input, dict):
        tool_input = {"input": str(tool_input)}

    result: list[str] = []
    for key in ("file_path", "notebook_path", "path"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            result.append(value)

    patch = tool_input.get("patch") or tool_input.get("input") or data.get("input")
    if isinstance(patch, str):
        for line in patch.splitlines():
            match = re.match(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", line)
            if match:
                result.append(match.group(1).strip())

    seen: set[str] = set()
    return [path for path in result if not (path in seen or seen.add(path))]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cwd", action="store_true", help="print only the payload cwd")
    args = parser.parse_args()
    data = payload()
    if args.cwd:
        value = data.get("cwd")
        if isinstance(value, str):
            print(value)
        return 0
    for path in paths(data):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
