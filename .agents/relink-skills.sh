#!/usr/bin/env bash
# Regenerate the real per-skill symlinks that project .agents/skills/ (the
# authoritative source) into .claude/skills/ for Claude Code discovery.
#
# Add a skill: create .agents/skills/<name>/SKILL.md, then run this script.
# Real symlinks are a hard prerequisite. Unsupported hosts fail before mutation;
# this command never creates a copy fallback. Third-party real directories and
# unrelated symlinks under .claude/skills/ remain untouched.
#
# Usage: bash .agents/relink-skills.sh [-h|--help]
# Exit 2 means a missing prerequisite or a projection conflict.
set -euo pipefail

usage() { sed -n '2,10p' "$0" | sed 's/^# \?//'; exit "${1:-0}"; }
case "$#" in
  0) ;;
  1) case "$1" in -h | --help) usage 0 ;; *) usage 2 ;; esac ;;
  *) usage 2 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manager="$repo_root/.agents/symlink-manager.py"
[[ -f "$manager" ]] || { echo "relink: missing helper .agents/symlink-manager.py; run agent-scaffold upgrade" >&2; exit 2; }

python_compatible() {
  PYTHONUTF8=1 "$@" -c \
    'import sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 8) else 1)' \
    >/dev/null 2>&1
}

PYTHON_CMD=()
if [[ -n "${PYTHON_BIN:-}" ]] && python_compatible "$PYTHON_BIN"; then
  PYTHON_CMD=("$PYTHON_BIN")
elif python_compatible python; then
  PYTHON_CMD=(python)
elif python_compatible python3; then
  PYTHON_CMD=(python3)
elif python_compatible py -3; then
  PYTHON_CMD=(py -3)
else
  echo "relink: python 3.8+ is required (set PYTHON_BIN, or install python/python3/py -3)" >&2
  exit 2
fi

exec env PYTHONUTF8=1 "${PYTHON_CMD[@]}" "$manager" sync-skills --repo "$repo_root"
