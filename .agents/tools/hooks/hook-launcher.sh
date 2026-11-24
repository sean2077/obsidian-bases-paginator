#!/bin/sh
# Cross-platform hook dispatcher. Host configs enter through a temporary Git
# alias so Git for Windows supplies its own sh; this script then selects that
# installation's Bash explicitly instead of trusting a bare Windows PATH lookup.
set -u

hook_argument="${1:-}"
case "$hook_argument" in
    .agents/tools/hooks/trunk_edit_guard.sh)
        hook_name="trunk_edit_guard.sh"
        failure_status=2
        ;;
    .agents/tools/hooks/authority_doc_budget.sh)
        hook_name="authority_doc_budget.sh"
        failure_status=0
        ;;
    *)
        printf 'hook-launcher: unsupported managed hook: %s\n' "${hook_argument:-<empty>}" >&2
        exit 2
        ;;
esac

launcher_dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)" || {
    printf 'hook-launcher: cannot resolve the managed hook directory\n' >&2
    exit "$failure_status"
}
hook_script="$launcher_dir/$hook_name"
[ -f "$hook_script" ] || {
    printf 'hook-launcher: managed hook is missing: %s\n' "$hook_script" >&2
    exit "$failure_status"
}

if [ -n "${AGENT_SCAFFOLD_BASH:-}" ]; then
    bash_bin="$AGENT_SCAFFOLD_BASH"
else
    case "$(uname -s 2>/dev/null || printf unknown)" in
        MINGW* | MSYS*) bash_bin=/usr/bin/bash ;;
        *) bash_bin="$(command -v bash 2>/dev/null || true)" ;;
    esac
fi

if [ -z "$bash_bin" ] || [ ! -x "$bash_bin" ]; then
    printf 'hook-launcher: supported Bash is unavailable; install Git for Windows or set AGENT_SCAFFOLD_BASH\n' >&2
    exit "$failure_status"
fi

# A !-alias exports repository-local Git discovery variables. They are correct
# for locating the launcher, but would pin every nested git -C probe to the
# launcher's worktree and misclassify paths from another worktree.
unset GIT_DIR GIT_WORK_TREE GIT_PREFIX GIT_COMMON_DIR
exec "$bash_bin" "$hook_script"
