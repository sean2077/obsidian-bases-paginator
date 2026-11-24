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

# Hot-path runner: execute the real script without a separate version probe.
# Exit 3 means this interpreter is older than 3.8; 126/127 mean it cannot start.
# 70/71 are the catalog's Python-resolver test shims for an unusable candidate.
hook_python_run() {
    local rc=127
    local candidate
    for candidate in ${PYTHON_BIN:+PYTHON_BIN} python python3 py; do
        if [[ "$candidate" == PYTHON_BIN ]]; then
            PYTHONUTF8=1 "$PYTHON_BIN" "$@"
            rc=$?
        elif [[ "$candidate" == py ]]; then
            PYTHONUTF8=1 py -3 "$@"
            rc=$?
        else
            PYTHONUTF8=1 "$candidate" "$@"
            rc=$?
        fi
        case "$rc" in
            0|2) return "$rc" ;;
            3|70|71|126|127) ;;
            *) return "$rc" ;;
        esac
    done
    return "$rc"
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
        /*)
            printf '%s\n' "$path"
            return 0
            ;;
    esac
    if [[ -z "${HOOK_HAS_CYGPATH:-}" ]]; then
        if command -v cygpath >/dev/null 2>&1; then
            HOOK_HAS_CYGPATH=1
        else
            HOOK_HAS_CYGPATH=0
        fi
    fi
    if [[ "$HOOK_HAS_CYGPATH" == 1 ]]; then
        cygpath -u -- "$path" 2>/dev/null || return 1
    else
        printf '%s\n' "$path"
    fi
}

hook_project_root() {
    local raw="${CLAUDE_PROJECT_DIR:-}"
    if [[ -z "$raw" ]]; then
        raw="$(cd "$hook_dir/../../.." 2>/dev/null && pwd)" || raw=""
        if [[ -z "$raw" || ! -e "$raw/.git" ]]; then
            raw="$(git -C "$hook_dir" rev-parse --show-toplevel 2>/dev/null || true)"
        fi
    fi
    [[ -n "$raw" ]] || return 1
    hook_posix_path "$raw"
}

hook_extract_paths() { # hook JSON on stdin
    local records line kind raw cwd="" path
    hook_resolve_python || {
        echo "hook-common: Python 3.8+ is required to parse the hook payload" >&2
        return 1
    }
    records="$(hook_python "$hook_dir/hook-paths.py" --records)" || return $?
    while IFS= read -r line; do
        kind="${line%%$'\t'*}"
        [[ "$line" == *$'\t'* ]] || continue
        raw="${line#*$'\t'}"
        case "$kind" in
            cwd)
                cwd="$(hook_posix_path "$raw" 2>/dev/null || true)"
                ;;
            path)
                [[ -n "$cwd" ]] || {
                    echo "hook-common: hook payload did not provide a usable cwd record" >&2
                    return 1
                }
                path="$(hook_posix_path "$raw" 2>/dev/null || true)"
                [[ -n "$path" ]] || continue
                case "$path" in
                    /*) printf '%s\n' "$path" ;;
                    *)  printf '%s/%s\n' "${cwd%/}" "$path" ;;
                esac
                ;;
        esac
    done <<<"$records"
    [[ -n "$cwd" ]] || {
        echo "hook-common: hook payload did not provide a usable cwd record" >&2
        return 1
    }
}
