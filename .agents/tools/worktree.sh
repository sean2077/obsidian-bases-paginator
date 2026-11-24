#!/usr/bin/env bash
# worktree.sh — one-command worktree-per-change lifecycle, the mechanical half
# of trunk_edit_guard.sh. Installed into a project by the agent-scaffold skill.
#
# Discipline (why this exists): never edit the primary worktree directly. Its
# checked-out branch is the active trunk, regardless of branch name. Every change
# starts in its own .worktrees/<name> branch cut from that trunk, is merged back
# into the recorded trunk, and is cleaned up — with a fast-forward-only push and
# no history rewrites.
#
# Subcommands:
#   new <name> [--type feat|fix|docs|chore] [--trunk <branch>]
#       Branch <type>/<name> + worktree .worktrees/<name> cut from the trunk tip.
#   done --dir <wt> [--trunk <branch>] [--message <msg>] [--no-push] [--keep-branch]
#       From outside the target, merge its feature branch back into local trunk
#       (--no-ff), ff-only push trunk, then remove the worktree + branch and prune.
#       A clean detached release worktree is removed through the same guarded path.
#       A rejected push keeps retry state; --no-push explicitly cleans up locally.
#       A branch with zero new commits skips the merge.
#   cleanup --dir <absolute-wt>
#       Remove only an empty, unregistered direct child of .worktrees. Idempotent;
#       never merges, pushes, prunes registrations, or deletes a branch.
#   release <ref>
#       Detached ref/tag-pinned worktree with a portable ref + commit basename.
#   list
#       git worktree list (verbatim).
#
# Optional heavy-dir sharing: set WORKTREE_SHARE to a space-separated list of
# repo-relative *gitignored/untracked* dirs (e.g. "node_modules") to hardlink-share
# into a new/release worktree — zero extra disk, kept out of `git status`.
#
# Removal retries are bounded by WORKTREE_REMOVE_RETRIES (default 8; 0 disables)
# and WORKTREE_REMOVE_RETRY_DELAY_SECONDS (default 1). Retries never use --force
# or recursive deletion; an unregistered residue is removed only when empty.
# Exit 2 means refused/failed; exit 3 means unregistered cleanup is still pending.
# A pending done keeps the local branch; use cleanup after releasing the owner.
# Removal checks require Python 3.8+ (the scaffold's existing prerequisite).
#
# Trunk resolution: --trunk, then $WORKTREE_TRUNK, then the primary worktree
# branch. `new` records the result so `done` returns to the same trunk.
# Push is fast-forward-only; it never force-pushes — that stays the user's call.
# ---8<--- help ends here
set -euo pipefail

usage() { sed -n '2,/^# ---8<---/p' "$0" | sed '/^# ---8<---/d; s/^# \?//'; exit "${1:-0}"; }
log()  { printf '\033[1;34m[worktree]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[worktree] ABORT:\033[0m %s\n' "$*" >&2; exit 2; }

[[ $# -ge 1 ]] || usage 2
CMD="$1"; shift
case "$CMD" in
    new|release|done|cleanup|list) ;;
    -h|--help) [[ $# -eq 0 ]] || usage 2; usage 0 ;;
    *) die "unknown subcommand: $CMD (new/done/cleanup/release/list)" ;;
esac
if [[ $# -eq 1 && ( "$1" == -h || "$1" == --help ) ]]; then
    usage 0
fi

# Repo anchors come from the installed helper, not the caller's current directory.
# COMMON_GIT = shared git dir; ROOT = primary worktree (share source).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)" \
    || die "could not resolve the installed helper directory"
HELPER_REPO="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" \
    || die "worktree helper is not installed inside a git repository"
COMMON_GIT="$(git -C "$HELPER_REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
    || die "could not resolve the repository common git directory"
COMMON_GIT_CANON="$(cd "$COMMON_GIT" 2>/dev/null && pwd -P)" \
    || die "could not canonicalize the repository common git directory"
ROOT="$(dirname "$COMMON_GIT")"
WT_BASE="$ROOT/.worktrees"

resolve_path_python() {
    PATH_PYTHON=()
    local candidate
    for candidate in "${PYTHON_BIN:-python}" python python3; do
        if PYTHONUTF8=1 "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 8))' >/dev/null 2>&1; then
            PATH_PYTHON=("$candidate")
            return 0
        fi
    done
    if PYTHONUTF8=1 py -3 -c 'import sys; sys.exit(sys.version_info < (3, 8))' >/dev/null 2>&1; then
        PATH_PYTHON=(py -3)
        return 0
    fi
    die "Python 3.8+ is required for removal safety checks (set PYTHON_BIN, or install python/python3/py -3)"
}

# Inspect the original path before resolving it: junctions are directories to
# Bash, and resolving first would discard the evidence that it was a link.
# The Python child starts in ROOT; a parent shell/harness CWD is not changed.
inspect_removal_path() {
    local MODE="$1" TARGET="$2" CALLER
    CALLER="$(pwd -P)" || die "cannot resolve the caller directory; leave the removed directory first"
    (
        cd "$ROOT" || exit 2
        PYTHONUTF8=1 "${PATH_PYTHON[@]}" - "$MODE" "$TARGET" "$ROOT" "$CALLER" <<'PY'
import os
import stat
import sys

mode, raw_target, root, caller = sys.argv[1:]


def fail(message):
    print("[worktree] ABORT: " + message, file=sys.stderr)
    raise SystemExit(2)


def identity(path):
    return os.path.normcase(os.path.realpath(path))


def plain_directory(path, missing_ok=False):
    try:
        entry = os.lstat(path)
    except FileNotFoundError:
        if missing_ok:
            return False
        raise
    if stat.S_ISLNK(entry.st_mode) or getattr(entry, "st_file_attributes", 0) & 0x400:
        fail("refusing a symlink, junction, or reparse point: " + path)
    if not stat.S_ISDIR(entry.st_mode):
        fail("target is not a plain directory: " + path)
    return True


try:
    if mode == "cleanup":
        # Bash command substitution strips terminal newlines; never let it
        # change the requested target into the name of a different sibling.
        if "\n" in raw_target or "\r" in raw_target:
            fail("cleanup --dir does not accept newline characters")
        if not os.path.isabs(raw_target):
            fail("cleanup --dir requires an absolute path")
        components = raw_target.replace("\\", "/").split("/") if os.name == "nt" else raw_target.split("/")
        if any(part in (".", "..") for part in components):
            fail("cleanup --dir must name an exact directory without . or .. components")
        parent = os.path.dirname(os.path.normpath(raw_target))
        base = os.path.join(os.path.realpath(root), ".worktrees")
        # Do not resolve base before this comparison: a redirected .worktrees
        # directory must not expand this command's deletion scope.
        if identity(parent) != os.path.normcase(base):
            fail("cleanup only accepts a direct child of " + base)
        plain_directory(parent, missing_ok=True)

    # lstat('link/') follows the link on POSIX. Strip separators before testing
    # the final component, never by resolving the component itself.
    raw_target = os.path.normpath(raw_target)
    exists = plain_directory(raw_target, missing_ok=mode != "done")
    target = os.path.realpath(raw_target)
    try:
        inside = os.path.commonpath((identity(caller), identity(target))) == identity(target)
    except ValueError:  # Different Windows drives.
        inside = False
    if inside:
        fail("caller is inside the target worktree. Change the owning shell/session to a stable directory before cleanup; a child cd or git -C cannot release its parent: " + target)

    if mode == "residue" and exists:
        with os.scandir(raw_target) as entries:
            if next(entries, None) is not None:
                fail("unregistered residual directory is non-empty; left untouched: " + target)

    if mode == "done" and os.name == "nt":
        # Test delete access without renaming/deleting anything. A root CWD
        # handle in another process can deny this even with our cwd in ROOT.
        # This cannot rule out descendant locks or a lock acquired afterward.
        import ctypes
        from ctypes import wintypes

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        create = kernel.CreateFileW
        create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                           wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD,
                           wintypes.HANDLE]
        create.restype = wintypes.HANDLE
        close = kernel.CloseHandle
        close.argtypes = [wintypes.HANDLE]
        close.restype = wintypes.BOOL
        handle = create(target, 0x10000, 7, None, 3, 0x02200000, None)
        if handle == ctypes.c_void_p(-1).value:
            error = ctypes.get_last_error()
            reason = "a process still holds the directory" if error == 32 else "delete access is unavailable"
            fail("Windows removal preflight failed (winerror %s: %s): %s. Release the owning shell/Agent or resolve access, then retry from outside; no merge, push, or removal was started." % (error, reason, target))
        if not close(handle):
            raise ctypes.WinError(ctypes.get_last_error())

    if mode == "cleanup":
        sys.stdout.write(target.replace("\\", "/") if os.name == "nt" else target)
except OSError as error:
    fail("cannot inspect removal target: %s" % error)
PY
    )
}

default_trunk() {
    local branch
    if [[ -n "${WORKTREE_TRUNK:-}" ]]; then
        printf '%s\n' "$WORKTREE_TRUNK"
        return 0
    fi
    branch="$(git -C "$ROOT" symbolic-ref --short -q HEAD 2>/dev/null)" \
        || die "primary worktree is detached; check out the intended trunk or pass --trunk <branch>"
    printf '%s\n' "$branch"
}

recorded_trunk_for() {
    git -C "$ROOT" config --get "branch.$1.agentScaffoldTrunk" 2>/dev/null || true
}

ensure_worktrees_ignored() {
    git -C "$ROOT" check-ignore -q .worktrees 2>/dev/null && return 0
    local excl="$COMMON_GIT/info/exclude"
    mkdir -p "$COMMON_GIT/info"
    grep -qE '^/?\.worktrees/?$' "$excl" 2>/dev/null && return 0
    printf '.worktrees/\n' >> "$excl"
    log "excluded '.worktrees/' via .git/info/exclude (add it to tracked .gitignore for a shared rule)"
}

repoint_submodules() {
    local wt="$1" sub
    [[ -f "$ROOT/.gitmodules" ]] || return 0
    while read -r _ sub; do
        [[ -e "$wt/$sub/.git" ]] || continue
        [[ -d "$COMMON_GIT/modules/$sub" ]] || continue
        echo "gitdir: $COMMON_GIT/modules/$sub" > "$wt/$sub/.git"
    done < <(git config -f "$ROOT/.gitmodules" --get-regexp '\.path$' 2>/dev/null || true)
}

share_dirs() {
    local wt="$1" d
    [[ -n "${WORKTREE_SHARE:-}" ]] || return 0
    for d in $WORKTREE_SHARE; do
        [[ -d "$ROOT/$d" ]] || { log "WARN: share dir '$d' not found, skipping"; continue; }
        [[ -e "$wt/$d" ]] && { log "WARN: '$d' already present in worktree, skipping share"; continue; }
        mkdir -p "$wt/$(dirname "$d")"
        if cp -al "$ROOT/$d" "$wt/$d" 2>/dev/null; then
            log "shared $d ← primary worktree (hardlinked, zero new disk)"
        else
            cp -a "$ROOT/$d" "$wt/$d"
            log "WARN: hardlink unsupported here - copied $d (uses disk; not a zero-cost share)"
        fi
    done
    repoint_submodules "$wt"
}

primary_dir_for_trunk() {
    git -C "$ROOT" worktree list --porcelain | awk -v want="refs/heads/$1" '
        /^worktree /{dir=substr($0,10)} /^branch /{if (substr($0,8)==want) {print dir; exit}}'
}

cmd_new() {
    local NAME="" TYPE="feat" TRUNK=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --type)  [[ $# -ge 2 ]] || die "--type requires feat|fix|docs|chore"; TYPE="$2"; shift ;;
            --trunk) [[ $# -ge 2 ]] || die "--trunk requires a branch"; TRUNK="$2"; shift ;;
            -*) die "unknown flag: $1" ;;
            *)  [[ -z "$NAME" ]] || die "only one <name> accepted"; NAME="$1" ;;
        esac
        shift
    done
    [[ "$NAME" =~ ^[a-z][a-z0-9-]{1,46}[a-z0-9]$ ]] \
        || die "name must be lowercase kebab-case, 3-48 chars (got: ${NAME:-<empty>})"
    case "$TYPE" in feat|fix|docs|chore) ;; *) die "--type feat|fix|docs|chore" ;; esac
    [[ -n "$TRUNK" ]] || TRUNK="$(default_trunk)"
    git -C "$ROOT" show-ref --verify -q "refs/heads/$TRUNK" || die "no local trunk branch '$TRUNK'"
    local BRANCH="$TYPE/$NAME" WTDIR="$WT_BASE/$NAME"
    [[ ! -e "$WTDIR" ]] || die "already exists: $WTDIR"
    ensure_worktrees_ignored
    git -C "$ROOT" worktree add "$WTDIR" -b "$BRANCH" "$TRUNK"
    git -C "$ROOT" config "branch.$BRANCH.agentScaffoldTrunk" "$TRUNK" \
        || die "created $WTDIR but could not record its trunk; rerun done with --trunk \"$TRUNK\""
    share_dirs "$WTDIR"
    log "ready: $WTDIR  (branch $BRANCH ← $TRUNK tip)"
    log "when done, leave it before cleanup:"
    log "  cd \"$ROOT\" && bash \"$ROOT/.agents/tools/worktree.sh\" done --dir \"$WTDIR\" --trunk \"$TRUNK\""
}

cmd_release() {
    [[ $# -eq 1 ]] || die "usage: release <ref>"
    local REF="$1" RESOLVED COMMIT COMMIT_SHORT SAFE_REF WTDIR
    RESOLVED="$(git -C "$ROOT" rev-parse -q --verify "$REF" 2>/dev/null)" \
        || die "no such ref: $REF"
    COMMIT="$(git -C "$ROOT" rev-parse -q --verify "$RESOLVED^{commit}" 2>/dev/null)" \
        || die "ref does not resolve to a commit: $REF"
    COMMIT_SHORT="$(git -C "$ROOT" rev-parse --short=12 "$COMMIT")" \
        || die "could not abbreviate commit for ref: $REF"
    SAFE_REF="$(printf '%s' "$REF" \
        | sed 's/[^A-Za-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//' \
        | cut -c1-40)"
    [[ -n "$SAFE_REF" ]] || SAFE_REF=ref
    WTDIR="$WT_BASE/release-$SAFE_REF-$COMMIT_SHORT"
    [[ ! -e "$WTDIR" ]] || die "already exists: $WTDIR"
    ensure_worktrees_ignored
    git -C "$ROOT" worktree add --detach "$WTDIR" "$COMMIT"
    share_dirs "$WTDIR"
    log "ready: $WTDIR  (detached @ $REF) — when packaging is done: cd \"$ROOT\" && bash \"$ROOT/.agents/tools/worktree.sh\" done --dir \"$WTDIR\""
}

worktree_is_registered() {
    local TARGET="$1" REGISTRY FOUND=0 temp_parent temp_prefix temp_suffix
    temp_parent="$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)" \
        || die "temporary-directory parent is unavailable: ${TMPDIR:-/tmp}"
    temp_prefix="${temp_parent%/}/agent-scaffold-worktrees."
    REGISTRY="$(mktemp "${temp_prefix}XXXXXX")" \
        || die "could not create temporary worktree registry file"
    temp_suffix="${REGISTRY#"$temp_prefix"}"
    [[ "$REGISTRY" == "$temp_prefix"* && -n "$temp_suffix" && -f "$REGISTRY" ]] \
        || die "mktemp returned an unsafe worktree registry path: ${REGISTRY:-<empty>}"
    if ! git -C "$ROOT" worktree list --porcelain -z >"$REGISTRY"; then
        rm -f "$REGISTRY"
        die "could not inspect the worktree registry"
    fi
    # Git for Windows prints native paths. Normalize drive casing, separators,
    # and aliases for both sides; plain string matching can miss a registration.
    PYTHONUTF8=1 "${PATH_PYTHON[@]}" - "$TARGET" "$REGISTRY" <<'PY' || FOUND=$?
import os
import sys

try:
    target = os.path.normcase(os.path.realpath(sys.argv[1]))
    with open(sys.argv[2], "rb") as stream:
        fields = stream.read().split(b"\0")
    for field in fields:
        if field.startswith(b"worktree "):
            path = os.fsdecode(field[len(b"worktree "):])
            if os.path.normcase(os.path.realpath(path)) == target:
                raise SystemExit(0)
    raise SystemExit(1)
except OSError as error:
    print("[worktree] cannot read worktree registry: %s" % error, file=sys.stderr)
    raise SystemExit(2)
PY
    rm -f "$REGISTRY"
    (( FOUND <= 1 )) || die "could not compare the worktree registry safely"
    return "$FOUND"
}

validate_remove_retry_config() {
    local RETRIES_RAW="${WORKTREE_REMOVE_RETRIES:-8}"
    local DELAY_RAW="${WORKTREE_REMOVE_RETRY_DELAY_SECONDS:-1}"

    [[ "$RETRIES_RAW" =~ ^[0-9]{1,2}$ ]] \
        || die "WORKTREE_REMOVE_RETRIES must be an integer from 0 to 60 (got: $RETRIES_RAW)"
    [[ "$DELAY_RAW" =~ ^[0-9]{1,2}$ ]] \
        || die "WORKTREE_REMOVE_RETRY_DELAY_SECONDS must be an integer from 0 to 30 (got: $DELAY_RAW)"
    WORKTREE_REMOVE_RETRIES_VALUE=$((10#$RETRIES_RAW))
    WORKTREE_REMOVE_RETRY_DELAY_SECONDS_VALUE=$((10#$DELAY_RAW))
    (( WORKTREE_REMOVE_RETRIES_VALUE <= 60 )) \
        || die "WORKTREE_REMOVE_RETRIES must be an integer from 0 to 60 (got: $RETRIES_RAW)"
    (( WORKTREE_REMOVE_RETRY_DELAY_SECONDS_VALUE <= 30 )) \
        || die "WORKTREE_REMOVE_RETRY_DELAY_SECONDS must be an integer from 0 to 30 (got: $DELAY_RAW)"
}

remove_done_worktree() {
    local WT="$1"
    local RETRIES="$WORKTREE_REMOVE_RETRIES_VALUE"
    local DELAY="$WORKTREE_REMOVE_RETRY_DELAY_SECONDS_VALUE"
    local RETRY=0 STATUS ATTEMPTS

    # Keep Git's process cwd in the stable primary worktree. On Windows, using
    # the worktree that is being removed as `git -C` can lock or invalidate the
    # command context midway through cleanup.
    while true; do
        # Git's Windows retry prompt is independent of GIT_TERMINAL_PROMPT.
        # Disable an inherited ask-yes/no hook and tty input; this helper owns
        # bounded retries and must not hang waiting for an interactive answer.
        GIT_ASK_YESNO=false git -C "$ROOT" worktree remove "$WT" </dev/null || true

        if ! worktree_is_registered "$WT"; then
            break
        fi

        STATUS="$(git -C "$WT" status --porcelain 2>/dev/null)" \
            || die "worktree removal failed and '$WT' remains registered but its status cannot be inspected; refusing force removal. Worktree and branch kept"
        [[ -z "$STATUS" ]] \
            || die "worktree removal failed and '$WT' is no longer clean after the removal attempt; refusing force removal. Worktree and branch kept"

        if (( RETRY >= RETRIES )); then
            ATTEMPTS=$((RETRY + 1))
            die "worktree removal failed after $ATTEMPTS attempts and '$WT' remains registered; refusing force removal.
Close processes whose current directory or open files are under it, then rerun done from a stable worktree. Worktree and branch kept"
        fi

        RETRY=$((RETRY + 1))
        log "worktree removal is blocked; retrying $RETRY/$RETRIES in ${DELAY}s: $WT"
        (( DELAY == 0 )) || sleep "$DELAY"
    done

    # Git unregisters even when directory deletion fails. Check both states,
    # including when Git returned zero, before reporting completion.
    (( RETRY == 0 )) || log "unregistered worktree after $RETRY cleanup retries: $WT"
    if [[ -e "$WT" || -L "$WT" ]]; then
        log "worktree is already unregistered; checking residual directory: $WT"
    fi
    if remove_unregistered_directory "$WT"; then
        return 0
    fi
    log "CLEANUP PENDING: worktree is unregistered but its directory remains; any local branch is kept. Any completed merge/push is unchanged."
    log "release the owning shell/Agent, then retry from a stable checkout (do not rerun done):"
    if inspect_removal_path cleanup "$WT" >/dev/null 2>&1; then
        log "  bash \"$ROOT/.agents/tools/worktree.sh\" cleanup --dir \"$WT\""
    else
        log "residue is outside cleanup's plain .worktrees child scope; leave it to its lifecycle owner to inspect and remove only when empty: $WT"
    fi
    return 3
}

remove_unregistered_directory() {
    local WT="$1" RETRY=0 ATTEMPTS
    local RETRIES="$WORKTREE_REMOVE_RETRIES_VALUE"
    local DELAY="$WORKTREE_REMOVE_RETRY_DELAY_SECONDS_VALUE"
    while true; do
        # Recheck before every attempt. rmdir is intentionally nonrecursive and
        # cannot remove content written after the inspection.
        if worktree_is_registered "$WT"; then
            log "refusing residual cleanup: target is a registered worktree: $WT"
            return 2
        fi
        inspect_removal_path residue "$WT" || return 2
        [[ -e "$WT" || -L "$WT" ]] || return 0
        if rmdir "$WT" 2>/dev/null; then
            if (( RETRY == 0 )); then
                log "removed empty residual worktree directory: $WT"
            else
                log "removed empty residual worktree directory after $RETRY retries: $WT"
            fi
            return 0
        fi
        [[ -e "$WT" || -L "$WT" ]] || return 0

        if (( RETRY >= RETRIES )); then
            ATTEMPTS=$((RETRY + 1))
            log "CLEANUP PENDING: empty unregistered residual directory could not be removed after $ATTEMPTS attempts: $WT"
            log "release the owning shell/Agent or resolve directory access, then rerun cleanup from outside it"
            return 3
        fi

        RETRY=$((RETRY + 1))
        log "empty residual directory is still in use; retrying rmdir $RETRY/$RETRIES in ${DELAY}s: $WT"
        (( DELAY == 0 )) || sleep "$DELAY"
    done
}

cmd_cleanup() {
    local WT=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dir) [[ $# -ge 2 && -z "$WT" ]] || die "cleanup requires one --dir <absolute-wt>"; WT="$2"; shift ;;
            *) die "unknown cleanup argument: $1" ;;
        esac
        shift
    done
    [[ -n "$WT" ]] || die "cleanup requires --dir <absolute-wt>"
    validate_remove_retry_config
    resolve_path_python
    WT="$(inspect_removal_path cleanup "$WT")" || return 2
    cd "$ROOT"
    remove_unregistered_directory "$WT" || return $?
    log "cleanup complete: unregistered directory is absent: $WT (branches unchanged)"
}

cmd_done() {
    local WT="$PWD" TRUNK="" MSG="" PUSH=1 KEEP=0
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dir)         [[ $# -ge 2 ]] || die "--dir requires a worktree path"; WT="$2"; shift ;;
            --trunk)       [[ $# -ge 2 ]] || die "--trunk requires a branch"; TRUNK="$2"; shift ;;
            --message)     [[ $# -ge 2 ]] || die "--message requires text"; MSG="$2"; shift ;;
            --no-push)     PUSH=0 ;;
            --keep-branch) KEEP=1 ;;
            *) die "unknown flag: $1" ;;
        esac
        shift
    done
    validate_remove_retry_config
    resolve_path_python
    WT="$(git -C "$WT" rev-parse --show-toplevel)" || die "--dir is not inside a git repository"
    local WT_COMMON WT_COMMON_CANON WT_GIT_DIR WT_GIT_DIR_CANON
    WT_COMMON="$(git -C "$WT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
        || die "could not resolve --dir's repository identity"
    WT_COMMON_CANON="$(cd "$WT_COMMON" 2>/dev/null && pwd -P)" \
        || die "could not canonicalize --dir's repository identity"
    [[ "$WT_COMMON_CANON" == "$COMMON_GIT_CANON" ]] \
        || die "--dir belongs to a different repository than this worktree helper: $WT"
    worktree_is_registered "$WT" \
        || die "--dir is not an exact registered worktree of this repository: $WT"
    WT_GIT_DIR="$(git -C "$WT" rev-parse --path-format=absolute --git-dir 2>/dev/null)" \
        || die "could not resolve --dir's worktree git directory"
    WT_GIT_DIR_CANON="$(cd "$WT_GIT_DIR" 2>/dev/null && pwd -P)" \
        || die "could not canonicalize --dir's worktree git directory"
    [[ "$WT_GIT_DIR_CANON" != "$COMMON_GIT_CANON" ]] \
        || die "--dir is the primary worktree; done only finishes linked change or release worktrees"
    # Refuse before merge/push/unregistration, not after Git has removed the
    # metadata. On Windows also probe native root delete access from ROOT.
    inspect_removal_path "done" "$WT" || return 2
    [[ -z "$(git -C "$WT" status --porcelain)" ]] || die "worktree is dirty, commit/stash first:
$(git -C "$WT" status --short | head -10)"
    local BRANCH RECORDED_TRUNK="" branch_rc=0
    if BRANCH="$(git -C "$WT" symbolic-ref --short -q HEAD)"; then
        :
    else
        branch_rc=$?
        [[ $branch_rc -eq 1 ]] || die "could not resolve the worktree branch"
        cd "$ROOT"
        remove_done_worktree "$WT" || return $?
        git -C "$ROOT" worktree prune
        log "done. removed clean detached release worktree: $WT"
        return 0
    fi
    RECORDED_TRUNK="$(recorded_trunk_for "$BRANCH")"
    if [[ -z "$TRUNK" ]]; then
        if [[ -n "$RECORDED_TRUNK" ]]; then
            TRUNK="$RECORDED_TRUNK"
        else
            TRUNK="$(default_trunk)"
        fi
    fi
    [[ "$BRANCH" != "$TRUNK" ]] \
        || die "target worktree checks out trunk '$TRUNK' — done only finishes change worktrees"
    git -C "$ROOT" show-ref --verify -q "refs/heads/$TRUNK" || die "trunk '$TRUNK' does not exist, pass --trunk"
    local PD; PD="$(primary_dir_for_trunk "$TRUNK")"
    [[ -n "$PD" ]] || die "no worktree has '$TRUNK' checked out (git worktree list); check it out somewhere first"
    [[ -z "$(git -C "$PD" status --porcelain)" ]] || die "trunk worktree $PD is dirty, tidy it first"
    cd "$PD"   # $WT is about to disappear; step out of it
    if git merge-base --is-ancestor "$BRANCH" "$TRUNK"; then
        log "$BRANCH has zero new commits over $TRUNK — skipping merge, just cleaning up"
    else
        # git-native message so commitlint's defaultIgnores skips this merge commit
        # shellcheck disable=SC2016  # single quotes are literal: git's default "Merge branch 'x'" wording
        git merge --no-ff "$BRANCH" -m "${MSG:-Merge branch '$BRANCH'}"
        log "merged → $TRUNK @ $(git rev-parse --short HEAD)"
    fi
    local RETRY_KEEP=""
    [[ $KEEP -eq 1 ]] && RETRY_KEEP=" --keep-branch"
    if [[ $PUSH -eq 1 ]]; then
        git push origin "$TRUNK" || die "push rejected (remote moved?); worktree and branch kept.
Resolve origin/$TRUNK in the trunk worktree, then retry:
  git -C \"$PD\" fetch origin
  git -C \"$PD\" merge origin/$TRUNK
  bash \"$PD/.agents/tools/worktree.sh\" done --dir \"$WT\" --trunk \"$TRUNK\"$RETRY_KEEP
Never force-push from here — that is the user's call."
        log "pushed $TRUNK → origin"
    else
        log "not pushed (--no-push); remember to push $TRUNK later"
    fi
    remove_done_worktree "$WT" || return $?
    [[ $KEEP -eq 1 ]] || git branch -d "$BRANCH" 2>/dev/null \
        || log "WARN: branch $BRANCH not fully merged into $TRUNK - kept; delete: git branch -D $BRANCH"
    git -C "$ROOT" worktree prune
    log "done. worktree registration and directory removed: $WT"
}

case "$CMD" in
    new)       cmd_new "$@" ;;
    release)   cmd_release "$@" ;;
    done)      cmd_done "$@" ;;
    cleanup)   cmd_cleanup "$@" ;;
    list)      [[ $# -eq 0 ]] || die "list accepts no arguments"; git worktree list ;;
esac
