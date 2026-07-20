#!/usr/bin/env bash
# Shared hook runtime: locate the project, resolve python, parse hook JSON, and
# normalize native Windows/MSYS/Unix paths into the Git Bash path namespace.

hook_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

hook_python_compatible() {
    PYTHONUTF8=1 "$@" -c \
        'import sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 8) else 1)' \
        >/dev/null 2>&1
}

hook_resolve_python() {
    HOOK_PYTHON=()
    if [[ -n "${PYTHON_BIN:-}" ]] && hook_python_compatible "$PYTHON_BIN"; then
        HOOK_PYTHON=("$PYTHON_BIN")
    elif hook_python_compatible python; then
        HOOK_PYTHON=(python)
    elif hook_python_compatible python3; then
        HOOK_PYTHON=(python3)
    elif hook_python_compatible py -3; then
        HOOK_PYTHON=(py -3)
    else
        return 1
    fi
}

hook_python() {
    [[ ${#HOOK_PYTHON[@]} -gt 0 ]] || hook_resolve_python || return 127
    PYTHONUTF8=1 "${HOOK_PYTHON[@]}" "$@"
}

hook_posix_path() {
    local path="${1%$'\r'}"
    [[ -n "$path" ]] || return 1
    case "$path" in
        \\\\*)
            path="${path#\\\\}"
            printf '//%s\n' "${path//\\//}"
            return 0
            ;;
    esac
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -u -- "$path" 2>/dev/null || return 1
    else
        printf '%s\n' "$path"
    fi
}

hook_project_root() {
    local raw="${CLAUDE_PROJECT_DIR:-}"
    if [[ -z "$raw" ]]; then
        raw="$(git -C "$hook_dir" rev-parse --show-toplevel 2>/dev/null || true)"
    fi
    if [[ -z "$raw" ]]; then
        raw="$(cd "$hook_dir/../../.." 2>/dev/null && pwd)" || return 1
    fi
    hook_posix_path "$raw"
}

hook_extract_paths() { # <hook-json>
    local input="$1" cwd raw path
    if hook_resolve_python; then
        cwd="$(HOOK_INPUT="$input" hook_python "$hook_dir/hook-paths.py" --cwd 2>/dev/null || true)"
        [[ -n "$cwd" ]] || cwd="${PWD:-.}"
        cwd="$(hook_posix_path "$cwd" 2>/dev/null || true)"
        while IFS= read -r raw; do
            [[ -n "$raw" ]] || continue
            path="$(hook_posix_path "$raw" 2>/dev/null || true)"
            [[ -n "$path" ]] || continue
            case "$path" in
                /*) printf '%s\n' "$path" ;;
                *)  printf '%s/%s\n' "${cwd%/}" "$path" ;;
            esac
        done < <(HOOK_INPUT="$input" hook_python "$hook_dir/hook-paths.py" 2>/dev/null || true)
    elif command -v jq >/dev/null 2>&1; then
        jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // empty' \
            <<<"$input" 2>/dev/null | while IFS= read -r raw; do
                path="$(hook_posix_path "$raw" 2>/dev/null || true)"
                [[ -n "$path" ]] && printf '%s\n' "$path"
            done
    else
        return 0
    fi
}
