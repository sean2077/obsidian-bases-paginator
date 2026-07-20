#!/usr/bin/env bash
# worktree.sh — one-command worktree-per-change lifecycle, the mechanical half
# of trunk_edit_guard.sh. Installed into a project by the agent-scaffold skill.
#
# Discipline (why this exists): never edit a trunk worktree (main / release/*)
# directly. Every change starts in its own .worktrees/<name> branch cut from the
# local trunk tip, is merged back into the local trunk, and is cleaned up — with
# a fast-forward-only push and no history rewrites.
#
# Subcommands:
#   new <name> [--type feat|fix|docs|chore] [--trunk <branch>]
#       Branch <type>/<name> + worktree .worktrees/<name> cut from the trunk tip.
#   done [--dir <wt>] [--trunk <branch>] [--message <msg>] [--no-push] [--keep-branch]
#       Merge the current (or --dir) feature branch back into its local trunk
#       (--no-ff), ff-only push trunk, then remove the worktree + branch and prune.
#       A clean detached release worktree is removed through the same guarded path.
#       A rejected push keeps retry state; --no-push explicitly cleans up locally.
#       A branch with zero new commits skips the merge.
#   release <ref>
#       Detached ref/tag-pinned worktree with a portable ref + commit basename.
#   list
#       git worktree list (verbatim).
#
# Optional heavy-dir sharing: set WORKTREE_SHARE to a space-separated list of
# repo-relative *gitignored/untracked* dirs (e.g. "node_modules") to hardlink-share
# into a new/release worktree — zero extra disk, kept out of `git status`.
#
# Trunk defaults to $WORKTREE_TRUNK or "main"; override per-call with --trunk.
# Push is fast-forward-only; it never force-pushes — that stays the user's call.
# ---8<--- help ends here
set -euo pipefail

usage() { sed -n '2,/^# ---8<---/p' "$0" | sed '/^# ---8<---/d; s/^# \?//'; exit "${1:-0}"; }
log()  { printf '\033[1;34m[worktree]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[worktree] ABORT:\033[0m %s\n' "$*" >&2; exit 2; }

[[ $# -ge 1 ]] || usage 2
CMD="$1"; shift
case "$CMD" in
    new|release|done|list) ;;
    -h|--help) [[ $# -eq 0 ]] || usage 2; usage 0 ;;
    *) die "unknown subcommand: $CMD (new/done/release/list)" ;;
esac
if [[ $# -eq 1 && ( "$1" == -h || "$1" == --help ) ]]; then
    usage 0
fi

# Repo anchors come from the installed helper, not the caller's current directory.
# COMMON_GIT = shared git dir; ROOT = main worktree (share source).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)" \
    || die "could not resolve the installed helper directory"
HELPER_REPO="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" \
    || die "worktree helper is not installed inside a git repository"
COMMON_GIT="$(git -C "$HELPER_REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
    || die "could not resolve the repository common git directory"
ROOT="$(dirname "$COMMON_GIT")"
WT_BASE="$ROOT/.worktrees"
TRUNK_DEFAULT="${WORKTREE_TRUNK:-main}"

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
            log "shared $d ← main worktree (hardlinked, zero new disk)"
        else
            cp -a "$ROOT/$d" "$wt/$d"
            log "WARN: hardlink unsupported here - copied $d (uses disk; not a zero-cost share)"
        fi
    done
    repoint_submodules "$wt"
}

primary_dir_for_trunk() {
    git worktree list --porcelain | awk -v want="refs/heads/$1" '
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
    [[ -n "$TRUNK" ]] || TRUNK="$TRUNK_DEFAULT"
    git -C "$ROOT" show-ref --verify -q "refs/heads/$TRUNK" || die "no local trunk branch '$TRUNK'"
    local BRANCH="$TYPE/$NAME" WTDIR="$WT_BASE/$NAME"
    [[ ! -e "$WTDIR" ]] || die "already exists: $WTDIR"
    ensure_worktrees_ignored
    git -C "$ROOT" worktree add "$WTDIR" -b "$BRANCH" "$TRUNK"
    share_dirs "$WTDIR"
    log "ready: $WTDIR  (branch $BRANCH ← $TRUNK tip)"
    log "when done, run inside it: bash .agents/tools/worktree.sh done   # merge back to $TRUNK + clean up + push"
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
    log "ready: $WTDIR  (detached @ $REF) — when packaging is done: bash \"$ROOT/.agents/tools/worktree.sh\" done --dir \"$WTDIR\""
}

worktree_is_registered() {
    local TARGET="$1" REGISTRY FIELD FOUND=1 temp_parent temp_prefix temp_suffix
    temp_parent="$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)" \
        || die "temporary-directory parent is unavailable: ${TMPDIR:-/tmp}"
    temp_prefix="${temp_parent%/}/agent-scaffold-worktrees."
    REGISTRY="$(mktemp "${temp_prefix}XXXXXX")" \
        || die "could not create temporary worktree registry file"
    temp_suffix="${REGISTRY#"$temp_prefix"}"
    [[ "$REGISTRY" == "$temp_prefix"* && -n "$temp_suffix" && -f "$REGISTRY" ]] \
        || die "mktemp returned an unsafe worktree registry path: ${REGISTRY:-<empty>}"
    if ! git worktree list --porcelain -z >"$REGISTRY"; then
        rm -f "$REGISTRY"
        die "could not inspect the worktree registry after remove failed"
    fi
    while IFS= read -r -d '' FIELD; do
        if [[ "$FIELD" == "worktree $TARGET" ]]; then
            FOUND=0
            break
        fi
    done <"$REGISTRY"
    rm -f "$REGISTRY"
    return "$FOUND"
}

remove_done_worktree() {
    local WT="$1"
    git worktree remove "$WT" && return 0

    worktree_is_registered "$WT" \
        && die "worktree removal failed and '$WT' remains registered; refusing force removal. Worktree and branch kept"

    # Git can unregister a worktree before Windows finishes deleting its
    # directory. Registration is the safety boundary: continue branch cleanup,
    # but never recursively or forcibly delete residue that may contain new data.
    log "worktree removal reported failure after '$WT' was already unregistered; continuing cleanup"
    if [[ -d "$WT" ]]; then
        if rmdir "$WT" 2>/dev/null; then
            log "removed empty residual worktree directory: $WT"
        else
            log "WARNING: unregistered residual directory remains (no recursive delete attempted): $WT"
        fi
    fi
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
    WT="$(git -C "$WT" rev-parse --show-toplevel)" || die "--dir is not inside a git repository"
    [[ -z "$(git -C "$WT" status --porcelain)" ]] || die "worktree is dirty, commit/stash first:
$(git -C "$WT" status --short | head -10)"
    local BRANCH branch_rc=0
    if BRANCH="$(git -C "$WT" symbolic-ref --short -q HEAD)"; then
        :
    else
        branch_rc=$?
        [[ $branch_rc -eq 1 ]] || die "could not resolve the worktree branch"
        cd "$ROOT"
        remove_done_worktree "$WT"
        git worktree prune
        log "done. removed clean detached release worktree: $WT"
        return 0
    fi
    case "$BRANCH" in
        main|master|release/*|maintenance/*)
            die "this is a trunk worktree ($BRANCH) — done only finishes feature/fix worktrees" ;;
    esac
    [[ -n "$TRUNK" ]] || TRUNK="$TRUNK_DEFAULT"
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
    remove_done_worktree "$WT"
    [[ $KEEP -eq 1 ]] || git branch -d "$BRANCH" 2>/dev/null \
        || log "WARN: branch $BRANCH not fully merged into $TRUNK - kept; delete: git branch -D $BRANCH"
    git worktree prune
    log "done. (if your shell is still in the removed dir, run: cd $PD)"
}

case "$CMD" in
    new)       cmd_new "$@" ;;
    release)   cmd_release "$@" ;;
    done)      cmd_done "$@" ;;
    list)      [[ $# -eq 0 ]] || die "list accepts no arguments"; git worktree list ;;
esac
