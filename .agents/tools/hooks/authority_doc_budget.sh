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
# Reads the tool-call JSON on stdin; always exits 0 (advisory). When jq is
# available it emits the nudge as PostToolUse additionalContext (fed to the
# agent); otherwise it falls back to stderr (shown to the user).
set -uo pipefail

max_root_lines="${AUTHORITY_DOC_MAX_ROOT:-320}"
max_nested_lines="${AUTHORITY_DOC_MAX_NESTED:-120}"
max_root_chars="${AUTHORITY_DOC_MAX_ROOT_CHARS:-25600}"
max_nested_chars="${AUTHORITY_DOC_MAX_NESTED_CHARS:-9600}"

hook_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
common="$hook_dir/hook-common.sh"
[[ -f "$common" ]] || exit 0
# shellcheck source=hook-common.sh
# shellcheck disable=SC1091
source "$common"
proj="$(hook_project_root 2>/dev/null || true)"
[[ -n "$proj" ]] || exit 0
input="$(cat || true)"

# Pull every file path the tool call touched out of the hook JSON on stdin.
# Handles Edit/Write (file_path/path) and apply_patch payloads through the shared
# parser + Git Bash path normalizer. Missing prerequisites stay fail-open.
extract_paths() {
    hook_extract_paths "$input"
}

warnings=()
while IFS= read -r file_path; do
    [[ -n "${file_path:-}" && "$file_path" == /* && -e "$file_path" ]] || continue
    case "$(basename -- "$file_path")" in
        AGENTS.md | CLAUDE.md) ;;
        *) continue ;;
    esac

    # Only the project repo's contracts (not nested/sibling repos).
    dir="$(dirname -- "$file_path")"
    file_common="$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || continue
    proj_common="$(git -C "$proj" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || continue
    [[ "$file_common" == "$proj_common" ]] || continue
    toplevel="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || continue
    toplevel="$(hook_posix_path "$toplevel" 2>/dev/null || true)"
    [[ -n "$toplevel" ]] || continue
    toplevel="$(cd "$toplevel" 2>/dev/null && pwd -P)" || continue

    # Resolve the CLAUDE.md → AGENTS.md symlink so each contract is measured once.
    real="$file_path"
    if [[ -L "$file_path" ]]; then
        link_target="$(readlink "$file_path" 2>/dev/null || true)"
        case "$link_target" in
            /*) real="$link_target" ;;
            *)
                target_dir="$(cd "$(dirname "$file_path")/$(dirname "$link_target")" 2>/dev/null && pwd -P)" || continue
                real="$target_dir/$(basename "$link_target")"
                ;;
        esac
    fi
    real_dir="$(cd "$(dirname "$real")" 2>/dev/null && pwd -P)" || continue
    real="$real_dir/$(basename "$real")"
    [[ -f "$real" ]] || continue
    lines="$(wc -l <"$real" 2>/dev/null | tr -d ' ')" || continue
    chars=""
    if hook_resolve_python; then
        chars="$(hook_python - "$real" 2>/dev/null <<'PY'
from pathlib import Path
import sys

print(len(Path(sys.argv[1]).read_text(encoding="utf-8")))
PY
        )" || chars=""
    fi
    [[ "$lines" =~ ^[0-9]+$ ]] || continue
    [[ -z "$chars" || "$chars" =~ ^[0-9]+$ ]] || chars=""

    rel="${real#"$toplevel"/}"
    if [[ "$rel" == "AGENTS.md" ]]; then
        line_budget="$max_root_lines"
        char_budget="$max_root_chars"
    else
        line_budget="$max_nested_lines"
        char_budget="$max_nested_chars"
    fi
    detail=""
    if ((lines > line_budget)); then
        detail="$lines lines (budget $line_budget, +$((lines - line_budget)) over)"
    fi
    if [[ -n "$chars" ]] && ((chars > char_budget)); then
        [[ -z "$detail" ]] || detail="$detail; "
        detail="${detail}${chars} characters (budget $char_budget, +$((chars - char_budget)) over)"
    fi
    [[ -z "$detail" ]] || warnings+=("$rel — $detail")
done < <(extract_paths)

((${#warnings[@]} > 0)) || exit 0

msg="Authoritative-doc budget exceeded — AGENTS.md is an ENTRY POINT, not a detail dump:
$(printf '  - %s\n' "${warnings[@]}")
Keep the contract lean: move detail into docs/ and link to it; leave inline only important, frequently-needed points. Trim back under the relevant budget, or raise the matching AUTHORITY_DOC_MAX_* override if the budget is genuinely too low."

if command -v jq >/dev/null 2>&1; then
    jq -cn --arg m "$msg" \
        '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$m}}'
else
    echo "authority_doc_budget: $msg" >&2
fi
exit 0
