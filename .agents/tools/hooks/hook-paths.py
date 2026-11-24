#!/usr/bin/env python
"""Parse edited paths from a Claude/Codex/Grok hook payload; run guard/budget checks."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time


MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
HOOK_DIR = os.path.dirname(os.path.abspath(__file__))
GITBASH_DRIVE = re.compile(r"^/([A-Za-z])(?:/(.*))?$")
_CYGPATH_WINDOWS: bool | None = None
PATCH_FILE = re.compile(r"^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$")
HEAD_REF = "ref: refs/heads/"


class PayloadError(ValueError):
    """The hook payload cannot be parsed safely."""


def payload() -> dict[object, object]:
    raw = sys.stdin.buffer.read(MAX_PAYLOAD_BYTES + 1)
    if len(raw) > MAX_PAYLOAD_BYTES:
        raise PayloadError("payload exceeds %s bytes" % MAX_PAYLOAD_BYTES)
    try:
        text = raw.decode("utf-8")
        value = json.loads(text)
    except (UnicodeDecodeError, ValueError) as exc:
        raise PayloadError("invalid UTF-8 JSON payload: %s" % exc) from exc
    if not isinstance(value, dict):
        raise PayloadError("payload top level must be a JSON object")
    return value


def tool_input_map(data: dict[object, object]) -> dict[object, object]:
    for key in ("tool_input", "toolInput"):
        value = data.get(key)
        if isinstance(value, dict):
            return value
        if isinstance(value, str) and value:
            return {"input": value}
    return {}


def paths(data: dict[object, object]) -> list[str]:
    tool_input = tool_input_map(data)

    result: list[str] = []
    for key in ("file_path", "notebook_path", "path"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            result.append(value)

    patch = tool_input.get("patch") or tool_input.get("input") or data.get("input")
    if isinstance(patch, str):
        for line in patch.splitlines():
            match = PATCH_FILE.match(line)
            if match:
                result.append(match.group(1).strip())

    seen: set[str] = set()
    return [path for path in result if not (path in seen or seen.add(path))]


def record_value(label: str, value: str) -> str:
    if any(separator in value for separator in ("\0", "\r", "\n", "\t")):
        raise PayloadError("%s contains an unsupported record separator" % label)
    return value


def _cygpath_windows(path: str) -> str:
    global _CYGPATH_WINDOWS
    if _CYGPATH_WINDOWS is False:
        return ""
    try:
        completed = subprocess.run(
            ["cygpath", "-w", "--", path],
            capture_output=True,
            text=True,
            timeout=5,
            **subprocess_kwargs(),
        )
    except (OSError, subprocess.TimeoutExpired):
        _CYGPATH_WINDOWS = False
        return ""
    _CYGPATH_WINDOWS = True
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()


def filesystem_path(path: str) -> str:
    path = path.replace("\r", "")
    if not path or os.name != "nt":
        return path
    if path.startswith("\\\\") or path.startswith("//"):
        return "\\\\" + path.lstrip("\\/").replace("/", "\\")
    unix = path.replace("\\", "/")
    match = GITBASH_DRIVE.match(unix)
    if match:
        rest = (match.group(2) or "").replace("/", "\\")
        return match.group(1).upper() + ":\\" + rest
    if unix.startswith("/"):
        converted = _cygpath_windows(path)
        if converted:
            return converted
    if len(path) >= 2 and path[1] == ":":
        return path.replace("/", "\\")
    return path


def canonical(path: str) -> str:
    return os.path.normcase(os.path.abspath(filesystem_path(path)))


def join_cwd(cwd: str, path: str) -> str:
    converted = filesystem_path(path)
    if os.path.isabs(converted):
        return os.path.abspath(converted)
    return os.path.abspath(os.path.join(filesystem_path(cwd), converted))


def payload_cwd(data: dict[object, object]) -> str:
    cwd = data.get("cwd")
    if not isinstance(cwd, str) or not cwd:
        cwd = data.get("workspaceRoot")
    if not isinstance(cwd, str) or not cwd:
        cwd = os.getcwd()
    return record_value("cwd", cwd)


def edited_paths(data: dict[object, object]) -> list[str]:
    cwd = payload_cwd(data)
    return [join_cwd(cwd, record_value("path", path)) for path in paths(data)]


def existing_dir(path: str) -> str:
    directory = path if os.path.isdir(path) else os.path.dirname(path)
    while directory and not os.path.isdir(directory):
        parent = os.path.dirname(directory)
        if parent == directory:
            break
        directory = parent
    return directory


def read_gitdir_pointer(git_file: str) -> str | None:
    try:
        with open(git_file, encoding="utf-8") as handle:
            line = handle.readline().strip()
    except OSError:
        return None
    if not line.lower().startswith("gitdir:"):
        return None
    target = line.split(":", 1)[1].strip()
    if not target:
        return None
    converted = filesystem_path(target)
    if not os.path.isabs(converted):
        converted = os.path.join(os.path.dirname(git_file), converted)
    return os.path.abspath(converted)


def common_dir_from_git_dir(git_dir: str) -> str:
    commondir_file = os.path.join(git_dir, "commondir")
    try:
        with open(commondir_file, encoding="utf-8") as handle:
            raw = handle.readline().strip()
    except OSError:
        raw = ""
    if not raw:
        return os.path.abspath(git_dir)
    converted = filesystem_path(raw)
    if not os.path.isabs(converted):
        converted = os.path.join(git_dir, converted)
    return os.path.abspath(converted)


def git_identity(path: str) -> tuple[str, str, str] | None:
    directory = existing_dir(path)
    while directory:
        meta = os.path.join(directory, ".git")
        if os.path.isdir(meta):
            git_dir = os.path.abspath(meta)
            return directory, git_dir, common_dir_from_git_dir(git_dir)
        if os.path.isfile(meta):
            git_dir = read_gitdir_pointer(meta)
            if git_dir is None:
                return None
            return directory, git_dir, common_dir_from_git_dir(git_dir)
        parent = os.path.dirname(directory)
        if parent == directory:
            break
        directory = parent
    return None


def is_primary(git_dir: str, common_dir: str) -> bool:
    return canonical(git_dir) == canonical(common_dir)


def subprocess_kwargs() -> dict[str, object]:
    kwargs: dict[str, object] = {}
    if os.name == "nt":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return kwargs


def project_root() -> str | None:
    raw = os.environ.get("CLAUDE_PROJECT_DIR") or ""
    if raw:
        return os.path.abspath(filesystem_path(raw))
    fallback = os.path.abspath(os.path.join(HOOK_DIR, "..", "..", ".."))
    if os.path.lexists(os.path.join(fallback, ".git")):
        return fallback
    try:
        completed = subprocess.run(
            ["git", "-C", HOOK_DIR, "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=5,
            **subprocess_kwargs(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    text = completed.stdout.strip() if completed.returncode == 0 else ""
    if not text:
        return None
    return os.path.abspath(filesystem_path(text))


def is_ignored(root: str, path: str) -> bool:
    try:
        completed = subprocess.run(
            ["git", "-C", root, "check-ignore", "-q", "--", path],
            capture_output=True,
            timeout=5,
            **subprocess_kwargs(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return completed.returncode == 0


def read_branch(git_dir: str) -> str:
    try:
        with open(os.path.join(git_dir, "HEAD"), encoding="utf-8") as handle:
            text = handle.read().strip()
    except OSError:
        return "<detached>"
    if text.startswith(HEAD_REF):
        branch = text[len(HEAD_REF) :].strip()
        return branch or "<detached>"
    return "<detached>"


def allow_trunk_edit(worktree_root: str) -> tuple[bool, str]:
    flag = os.path.join(worktree_root, ".claude", "allow-trunk-edit")
    if not os.path.isfile(flag):
        return False, ""
    try:
        mtime = os.path.getmtime(flag)
    except OSError:
        return False, ""
    if time.time() - mtime <= 7200:
        return True, flag
    return False, flag


def path_is_under(root: str, path: str) -> bool:
    try:
        rel = os.path.relpath(canonical(path), canonical(root))
    except ValueError:
        return False
    normalized = rel.replace("\\", "/")
    return normalized != ".." and not normalized.startswith("../")


def run_guard(data: dict[object, object]) -> int:
    if os.environ.get("WORKTREE_ALLOW_TRUNK_EDIT") == "1":
        return 0
    proj = project_root()
    if proj is None:
        sys.stderr.write("trunk_edit_guard: cannot resolve project root, allowing\n")
        return 0
    proj_ident = git_identity(proj)
    if proj_ident is None:
        sys.stderr.write("trunk_edit_guard: cannot resolve project root, allowing\n")
        return 0
    proj_common = proj_ident[2]
    proj_linked = not is_primary(proj_ident[1], proj_ident[2])
    wt_cmd = os.environ.get("WORKTREE_GUARD_CMD") or "bash .agents/tools/worktree.sh"
    blocked = 0
    for file_path in edited_paths(data):
        if proj_linked and path_is_under(proj, file_path):
            continue
        ident = git_identity(file_path)
        if ident is None:
            continue
        worktree_root, git_dir, common_dir = ident
        if canonical(common_dir) != canonical(proj_common):
            continue
        if not is_primary(git_dir, common_dir):
            continue
        if is_ignored(worktree_root, file_path):
            continue
        allowed, flag = allow_trunk_edit(worktree_root)
        if allowed:
            continue
        stale = ""
        if flag:
            stale = " (a STALE %s exists — touch it again to renew)" % flag
        sys.stderr.write(
            "trunk_edit_guard: BLOCKED — %s\n"
            "This is the primary worktree on active trunk branch '%s'.\n"
            "Edit the assigned linked task worktree instead, including for docs.\n"
            "Reuse user/workbench worktrees wherever located; do not create a second one.\n"
            "Only with no assigned worktree and a scaffold-owned lifecycle:\n"
            "    %s new <name>      # then target the printed worktree path\n"
            "Only if the user explicitly authorized a trunk edit in this conversation:\n"
            "    touch %s    # auto-expires in 2 h%s\n"
            % (
                file_path,
                read_branch(git_dir),
                wt_cmd,
                os.path.join(worktree_root, ".claude", "allow-trunk-edit"),
                stale,
            )
        )
        blocked = 2
    return blocked


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def is_authority_doc(path: str) -> bool:
    return os.path.basename(path.rstrip("\\/")) in ("AGENTS.md", "CLAUDE.md")


def resolve_contract(path: str) -> str | None:
    if os.path.islink(path):
        target = os.readlink(path)
        converted = filesystem_path(target)
        if not os.path.isabs(converted):
            converted = os.path.join(os.path.dirname(path), converted)
        path = os.path.abspath(converted)
    if not os.path.isfile(path):
        return None
    return os.path.abspath(path)


def relative_from(root: str, path: str) -> str:
    try:
        rel = os.path.relpath(path, root)
    except ValueError:
        return os.path.basename(path)
    return rel.replace("\\", "/")


def run_budget(data: dict[object, object]) -> int:
    if not any(is_authority_doc(path) for path in paths(data)):
        return 0
    max_root_lines = env_int("AUTHORITY_DOC_MAX_ROOT", 320)
    max_nested_lines = env_int("AUTHORITY_DOC_MAX_NESTED", 120)
    max_root_chars = env_int("AUTHORITY_DOC_MAX_ROOT_CHARS", 25600)
    max_nested_chars = env_int("AUTHORITY_DOC_MAX_NESTED_CHARS", 9600)
    proj = project_root()
    if proj is None:
        return 0
    proj_ident = git_identity(proj)
    if proj_ident is None:
        return 0
    proj_common = proj_ident[2]
    warnings: list[str] = []
    seen: set[str] = set()
    for file_path in edited_paths(data):
        if not is_authority_doc(file_path) or not os.path.lexists(file_path):
            continue
        ident = git_identity(file_path)
        if ident is None:
            continue
        worktree_root, _, common_dir = ident
        if canonical(common_dir) != canonical(proj_common):
            continue
        real = resolve_contract(file_path)
        if real is None or real in seen:
            continue
        seen.add(real)
        try:
            with open(real, encoding="utf-8") as handle:
                text = handle.read()
        except (OSError, UnicodeDecodeError):
            continue
        lines = text.count("\n")
        chars = len(text)
        rel = relative_from(worktree_root, real)
        if rel == "AGENTS.md":
            line_budget, char_budget = max_root_lines, max_root_chars
        else:
            line_budget, char_budget = max_nested_lines, max_nested_chars
        detail = ""
        if lines > line_budget:
            detail = "%d lines (budget %d, +%d over)" % (
                lines,
                line_budget,
                lines - line_budget,
            )
        if chars > char_budget:
            if detail:
                detail += "; "
            detail += "%d characters (budget %d, +%d over)" % (
                chars,
                char_budget,
                chars - char_budget,
            )
        if detail:
            warnings.append("%s — %s" % (rel, detail))
    if not warnings:
        return 0
    msg = (
        "Authoritative-doc budget exceeded — AGENTS.md is an ENTRY POINT, not a detail dump:\n"
        + "".join("  - %s\n" % item for item in warnings)
        + "Keep the contract lean: move detail into docs/ and link to it; leave inline only "
        "important, frequently-needed points. Trim back under the relevant budget, or raise "
        "the matching AUTHORITY_DOC_MAX_* override if the budget is genuinely too low."
    )
    sys.stdout.write(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": msg,
                }
            },
            separators=(",", ":"),
            ensure_ascii=False,
        )
        + "\n"
    )
    return 0


def main() -> int:
    if sys.version_info < (3, 8):
        return 3
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--cwd", action="store_true", help="print only the payload cwd")
    mode.add_argument(
        "--records",
        action="store_true",
        help="print one typed cwd record followed by typed path records",
    )
    mode.add_argument(
        "--guard",
        action="store_true",
        help="run the primary-worktree PreToolUse guard",
    )
    mode.add_argument(
        "--budget",
        action="store_true",
        help="run the AGENTS.md PostToolUse budget advisor",
    )
    args = parser.parse_args()
    try:
        data = payload()
        if args.guard:
            return run_guard(data)
        if args.budget:
            return run_budget(data)
        cwd = payload_cwd(data)
        listed = [record_value("path", path) for path in paths(data)]
        if args.cwd:
            print(cwd)
            return 0
        if args.records:
            print("cwd\t%s" % cwd)
            for path in listed:
                print("path\t%s" % path)
            return 0
        for path in listed:
            print(path)
    except PayloadError as exc:
        if args.budget:
            sys.stderr.write(
                "authority_doc_budget: could not parse hook input; advisory skipped\n"
            )
            return 0
        if args.guard:
            sys.stderr.write(
                "trunk_edit_guard: cannot parse hook input safely; blocking the edit\n"
            )
            return 2
        sys.stderr.write("hook-paths: %s\n" % exc)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
