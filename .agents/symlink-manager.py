#!/usr/bin/env python
"""Create and verify agent-scaffold's real symlink projections.

This installed helper is intentionally the only code path that creates Claude
projections.  It never copies when symlinks are unavailable: capability errors
exit 2 before the requested mutation starts.
"""

from __future__ import annotations

import argparse
import os
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path


class ContractError(RuntimeError):
    """A host preflight or projection contract failed."""


def native_symlink_target(target: str) -> str:
    """Materialize Git's POSIX link text in the host-native form."""
    return target.replace("/", "\\") if os.name == "nt" else target


def read_symlink_target(link: Path) -> str:
    """Return the portable target text Git records in a mode-120000 blob."""
    target = os.readlink(link)
    return target.replace("\\", "/") if os.name == "nt" else target


def git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def effective_symlink_config(repo: Path) -> tuple[str, str]:
    value = git(repo, "config", "--bool", "--get", "core.symlinks")
    origin = git(repo, "config", "--show-origin", "--get", "core.symlinks")
    return value.stdout.strip().lower(), origin.stdout.strip()


def doctor(repo: Path) -> None:
    repo = repo.resolve()
    if os.environ.get("AGENT_SCAFFOLD_TEST_DENY_SYMLINKS") == "1":
        raise ContractError("symlink capability denied by the test fixture")

    if os.name == "nt":
        value, origin = effective_symlink_config(repo)
        if value != "true":
            source = f" ({origin})" if origin else ""
            raise ContractError(
                "effective git core.symlinks is not true"
                f"{source}; remove a local false override and enable it before installing"
            )

    probe_root = Path(tempfile.mkdtemp(prefix=".agent-scaffold-symlink-", dir=repo.parent))
    file_link = probe_root / "file-link"
    dir_link = probe_root / "dir-link"
    try:
        (probe_root / "target.txt").write_text("ok\n", encoding="utf-8")
        (probe_root / "target-dir").mkdir()
        os.symlink("target.txt", file_link)
        os.symlink("target-dir", dir_link, target_is_directory=True)
        if not file_link.is_symlink() or read_symlink_target(file_link) != "target.txt":
            raise ContractError("file symlink probe did not produce a real relative symlink")
        if not dir_link.is_symlink() or read_symlink_target(dir_link) != "target-dir":
            raise ContractError("directory symlink probe did not produce a real relative symlink")
    except OSError as exc:
        hint = ""
        if os.name == "nt":
            hint = (
                "; enable Windows Developer Mode (or run with symlink privilege), "
                "ensure effective core.symlinks=true, then restart Git Bash"
            )
        raise ContractError(f"cannot create real symlinks: {exc}{hint}") from exc
    finally:
        for link in (file_link, dir_link):
            try:
                link.unlink()
            except FileNotFoundError:
                pass
        shutil.rmtree(probe_root, ignore_errors=True)


def within_repo(repo: Path, relative: str) -> Path:
    candidate = repo / relative
    try:
        candidate.absolute().relative_to(repo.absolute())
    except ValueError as exc:
        raise ContractError(f"projection escapes the repository: {relative}") from exc
    try:
        candidate.parent.resolve().relative_to(repo.resolve())
    except ValueError as exc:
        raise ContractError(
            f"projection parent redirects outside the repository: {relative}"
        ) from exc
    return candidate


def require_real_directory(path: Path) -> None:
    if not os.path.lexists(path):
        return
    if path.is_symlink():
        raise ContractError(f"managed directory must not be a symlink: {path}")
    if not path.is_dir():
        raise ContractError(f"{path} exists but is not a directory")


INSTALL_DIRECTORIES = (
    ".agents",
    ".agents/skills",
    ".agents/subagents",
    ".claude",
    ".claude/skills",
    ".claude/agents",
    ".codex",
    ".codex/agents",
)
SKILL_DIRECTORIES = (
    ".agents",
    ".agents/skills",
    ".claude",
    ".claude/skills",
)


def preflight_managed_directories(repo: Path, relatives) -> None:
    for relative in relatives:
        require_real_directory(within_repo(repo, relative))


def is_target_text_placeholder(link: Path, target: str) -> bool:
    if link.is_file() and not link.is_symlink():
        try:
            return link.read_text(encoding="utf-8").strip() == target
        except (OSError, UnicodeError):
            return False
    return False


def managed_skill_target(value: str) -> bool:
    normalized = value.replace("\\", "/")
    return normalized.startswith("../../.agents/skills/")


def validate_destination(
    link: Path,
    resolved_target: Path,
    target: str,
    *,
    replace_managed_link: bool,
) -> str:
    if link.is_symlink():
        current = read_symlink_target(link)
        if current == target:
            if not link.exists():
                raise ContractError(f"projection is dangling: {link} -> {current}")
            return "present"
        if replace_managed_link and managed_skill_target(current):
            return "replace-link"
        raise ContractError(f"projection conflict: {link} is a symlink to {current!r}, expected {target!r}")
    if not link.exists():
        return "create"
    if is_target_text_placeholder(link, target):
        return "materialize-placeholder"
    raise ContractError(
        f"projection conflict: {link} exists and differs from the authoritative source; "
        "move or merge it manually"
    )


def remove_existing(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
        return
    raise ContractError(f"refusing to remove unexpected path type: {path}")


def create_unique_temp_link(link: Path, resolved_target: Path, target: str):
    for _attempt in range(32):
        candidate = link.with_name(
            f".{link.name}.agent-scaffold-link-{secrets.token_hex(8)}"
        )
        try:
            os.symlink(
                native_symlink_target(target),
                candidate,
                target_is_directory=resolved_target.is_dir(),
            )
        except FileExistsError:
            continue
        identity = os.lstat(candidate)
        return candidate, (identity.st_dev, identity.st_ino)
    raise ContractError(f"could not allocate a unique temporary symlink for {link}")


def cleanup_created_temp_link(path: Path, identity) -> None:
    try:
        current = os.lstat(path)
    except FileNotFoundError:
        return
    if (
        stat.S_ISLNK(current.st_mode)
        and (current.st_dev, current.st_ino) == identity
    ):
        path.unlink()


def create_relative_link(link: Path, resolved_target: Path, target: str, action: str) -> bool:
    if action == "present":
        return False
    link.parent.mkdir(parents=True, exist_ok=True)
    temp_link, temp_identity = create_unique_temp_link(
        link, resolved_target, target
    )
    try:
        if not temp_link.is_symlink() or read_symlink_target(temp_link) != target:
            raise ContractError(f"failed to materialize a real symlink for {link}")
        if link.exists() or link.is_symlink():
            remove_existing(link)
        os.replace(temp_link, link)
    finally:
        cleanup_created_temp_link(temp_link, temp_identity)
    if not link.is_symlink() or read_symlink_target(link) != target or not link.exists():
        raise ContractError(f"projection verification failed after creating {link} -> {target}")
    return True


def ensure_contract(repo: Path) -> None:
    doctor(repo)
    link = within_repo(repo, "CLAUDE.md")
    resolved_target = within_repo(repo, "AGENTS.md")
    if resolved_target.is_symlink() or not resolved_target.is_file():
        raise ContractError("cannot link CLAUDE.md: AGENTS.md does not exist")
    action = validate_destination(
        link,
        resolved_target,
        "AGENTS.md",
        replace_managed_link=False,
    )
    changed = create_relative_link(link, resolved_target, "AGENTS.md", action)
    print("CLAUDE.md -> AGENTS.md: " + ("linked" if changed else "already correct"))


def skill_sources(repo: Path) -> list[Path]:
    source = within_repo(repo, ".agents/skills")
    require_real_directory(source)
    if not source.is_dir():
        raise ContractError("missing authoritative skill directory: .agents/skills")
    sources = []
    for path in sorted(source.iterdir()):
        if path.name.startswith("_"):
            continue
        if path.is_symlink():
            raise ContractError(f"skill source must not be a symlink: {path}")
        if path.is_dir():
            sources.append(path)
    return sources


def preflight_install(repo: Path) -> None:
    """Reject deterministic contract and skill-projection conflicts without writing."""
    preflight_managed_directories(repo, INSTALL_DIRECTORIES)
    agents = within_repo(repo, "AGENTS.md")
    link = within_repo(repo, "CLAUDE.md")
    if os.path.lexists(agents) and (agents.is_symlink() or not agents.is_file()):
        raise ContractError("AGENTS.md exists but is not a regular non-symlink file")
    if link.is_symlink():
        current = read_symlink_target(link)
        if current != "AGENTS.md":
            raise ContractError(
                f"projection conflict: {link} is a symlink to {current!r}, expected 'AGENTS.md'"
            )
    elif os.path.lexists(link):
        if not link.is_file():
            raise ContractError(f"projection conflict: {link} exists but is not a regular file")
        if os.path.lexists(agents):
            validate_destination(
                link,
                agents,
                "AGENTS.md",
                replace_managed_link=False,
            )

    source_root = within_repo(repo, ".agents/skills")
    if not source_root.is_dir():
        return

    vendor = within_repo(repo, ".claude/skills")
    for source in skill_sources(repo):
        target = f"../../.agents/skills/{source.name}"
        validate_destination(
            vendor / source.name,
            source,
            target,
            replace_managed_link=True,
        )


def sync_skills(repo: Path) -> None:
    preflight_managed_directories(repo, SKILL_DIRECTORIES)
    doctor(repo)
    sources = skill_sources(repo)
    vendor = within_repo(repo, ".claude/skills")
    planned: list[tuple[Path, Path, str, str]] = []

    for source in sources:
        target = f"../../.agents/skills/{source.name}"
        link = vendor / source.name
        action = validate_destination(
            link,
            source,
            target,
            replace_managed_link=True,
        )
        planned.append((link, source, target, action))

    stale: list[Path] = []
    if vendor.is_dir():
        source_names = {source.name for source in sources}
        for link in vendor.iterdir():
            if not link.is_symlink():
                continue
            target = read_symlink_target(link)
            if managed_skill_target(target) and (link.name.startswith("_") or link.name not in source_names):
                stale.append(link)

    made = 0
    materialized = 0
    for link in stale:
        link.unlink()
    for link, source, target, action in planned:
        if create_relative_link(link, source, target, action):
            made += 1
            if action == "materialize-placeholder":
                materialized += 1

    print(
        f"relink: {len(sources)} skills · {made} link(s) (re)created · "
        f"{len(stale)} stale pruned · {materialized} target-text placeholder(s) materialized"
    )


def tracked_mode(repo: Path, relative: str) -> str | None:
    result = git(repo, "ls-files", "--stage", "--", relative)
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return result.stdout.split(None, 1)[0]


def verify_link(repo: Path, relative: str, target: str, failures: list[str]) -> None:
    link = within_repo(repo, relative)
    if not link.is_symlink():
        failures.append(f"{relative} is not a real symlink")
        return
    current = read_symlink_target(link)
    if current != target:
        failures.append(f"{relative} points to {current!r}, expected {target!r}")
    if not link.exists():
        failures.append(f"{relative} is dangling")
    mode = tracked_mode(repo, relative)
    if mode is not None and mode != "120000":
        failures.append(f"tracked {relative} has git mode {mode}, expected 120000")


def verify(repo: Path) -> int:
    preflight_managed_directories(repo, SKILL_DIRECTORIES)
    doctor(repo)
    failures: list[str] = []
    verify_link(repo, "CLAUDE.md", "AGENTS.md", failures)

    sources = skill_sources(repo)
    source_names = {source.name for source in sources}
    for source in sources:
        verify_link(
            repo,
            f".claude/skills/{source.name}",
            f"../../.agents/skills/{source.name}",
            failures,
        )

    vendor = within_repo(repo, ".claude/skills")
    if vendor.is_dir():
        for link in vendor.iterdir():
            if not link.is_symlink():
                continue
            target = read_symlink_target(link)
            if managed_skill_target(target) and (link.name.startswith("_") or link.name not in source_names):
                failures.append(f"stale managed skill projection: .claude/skills/{link.name}")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print(f"OK: real symlink contract verified ({len(sources)} project skill(s))")
    return 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument(
        "command",
        choices=("doctor", "preflight-install", "ensure-contract", "sync-skills", "verify"),
    )
    result.add_argument("--repo", required=True, type=Path)
    return result


def main() -> int:
    args = parser().parse_args()
    repo = args.repo.resolve()
    if not (repo / ".git").exists():
        raise ContractError(f"not a git repository root: {repo}")
    if args.command == "doctor":
        doctor(repo)
        value, origin = effective_symlink_config(repo)
        config = f"; effective core.symlinks={value or 'unset'}"
        if origin:
            config += f" ({origin})"
        print(f"OK: file and directory symlink probes passed{config}")
        return 0
    if args.command == "preflight-install":
        preflight_install(repo)
        print("OK: deterministic contract and skill projection preflight passed")
        return 0
    if args.command == "ensure-contract":
        ensure_contract(repo)
        return 0
    if args.command == "sync-skills":
        sync_skills(repo)
        return 0
    return verify(repo)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractError as exc:
        print(f"symlink-manager: {exc}", file=sys.stderr)
        raise SystemExit(2)
