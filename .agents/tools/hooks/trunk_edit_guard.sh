#!/usr/bin/env bash
# trunk_edit_guard.sh — shared PreToolUse guard for the worktree-per-change flow.
#
# Installed by the agent-scaffold skill. Enforces the hard invariant: never edit
# non-ignored project files in the primary worktree. Its checked-out branch is the
# active trunk regardless of branch name; linked worktrees pass.
# Blocks the wrong move and points at `.agents/tools/worktree.sh new <name>`.
#
# Wired for BOTH runtimes at the same shared impl:
#   - Claude Code: .claude/settings.json PreToolUse → this script ($CLAUDE_PROJECT_DIR set)
#   - Codex:       .codex/hooks.json     PreToolUse → this script (proj resolved via git)
# Reads the tool-call JSON on stdin and exits:
#   0  allow
#   2  block — the message on stderr tells the agent what to run instead
# Invalid or unparseable hook input exits 2 so a transport failure cannot turn a
# protected edit into an allow decision. Other host/runtime failures stay visible.
#
# Only guards files in the project repo (same git-common-dir); nested/sibling
# repos pass through, and gitignored paths (build output, caches) are never blocked.
#
# Escape hatches — use ONLY when the user explicitly authorizes a trunk edit:
#   WORKTREE_ALLOW_TRUNK_EDIT=1              one-shot env bypass
#   touch <repo>/.claude/allow-trunk-edit   flag file, auto-expires in 2 h
set -uo pipefail

[[ "${WORKTREE_ALLOW_TRUNK_EDIT:-0}" == "1" ]] && exit 0

hook_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
common="$hook_dir/hook-common.sh"
[[ -f "$common" ]] || { echo "trunk_edit_guard: missing hook-common.sh, allowing" >&2; exit 0; }
# shellcheck source=hook-common.sh
# shellcheck disable=SC1091
source "$common"
if [[ -z "${CLAUDE_PROJECT_DIR:-}" ]]; then
    proj="$(hook_project_root 2>/dev/null || true)"
    [[ -n "$proj" ]] || { echo "trunk_edit_guard: cannot resolve project root, allowing" >&2; exit 0; }
fi

# Path parsing, worktree classification, and ignore checks run in one Python
# process. Linked worktrees are decided from the `.git` file without spawning git.
hook_python_run "$hook_dir/hook-paths.py" --guard
rc=$?
case "$rc" in
    0|2) exit "$rc" ;;
esac
echo "trunk_edit_guard: cannot parse hook input safely; blocking the edit" >&2
exit 2
