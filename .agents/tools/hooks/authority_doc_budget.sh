#!/usr/bin/env bash
# authority_doc_budget.sh — shared PostToolUse hook for Claude Code and Codex.
#
# Watches the size of the AUTHORITATIVE agent contracts — root /AGENTS.md and
# every nested subdirectory AGENTS.md (plus the CLAUDE.md symlink) — so they
# stay lean ENTRY POINTS, not detail dumps. When an edit pushes a contract past
# its line or character budget, it surfaces an advisory nudge: move the detail
# into docs/ and keep only important, frequently-needed points inline.
#
# Never blocks (growth is a judgment call; the commit-time gates remain the hard
# enforcement). It only informs the agent so it can choose to trim or relocate.
#
# Budgets — override via env (e.g. in .claude/settings.local.json env, or shell):
#   AUTHORITY_DOC_MAX_ROOT          root /AGENTS.md       (default 320 lines)
#   AUTHORITY_DOC_MAX_NESTED        any subdir AGENTS.md  (default 120 lines)
#   AUTHORITY_DOC_MAX_ROOT_CHARS    root /AGENTS.md       (default 25600 characters)
#   AUTHORITY_DOC_MAX_NESTED_CHARS  any subdir AGENTS.md  (default 9600 characters)
# Character defaults preserve the old line budgets' approximate 80-column
# capacity without requiring source prose to be hard-wrapped.
#
# Wired for BOTH runtimes at the same shared impl:
#   - Claude Code: .claude/settings.json PostToolUse → this script ($CLAUDE_PROJECT_DIR set)
#   - Codex:       .codex/hooks.json     PostToolUse → this script (proj resolved via git)
# Reads the tool-call JSON on stdin; always exits 0 (advisory). Python emits the
# nudge as PostToolUse additionalContext without jq or a second interpreter.
set -uo pipefail

hook_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
common="$hook_dir/hook-common.sh"
[[ -f "$common" ]] || exit 0
# shellcheck source=hook-common.sh
# shellcheck disable=SC1091
source "$common"
if [[ -z "${CLAUDE_PROJECT_DIR:-}" ]]; then
    proj="$(hook_project_root 2>/dev/null || true)"
    [[ -n "$proj" ]] || exit 0
fi

hook_python_run "$hook_dir/hook-paths.py" --budget
exit 0
