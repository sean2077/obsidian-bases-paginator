#!/usr/bin/env python
"""Build a read-only semantic-release plan from local Git state.

The script never fetches, edits, commits, tags, or pushes. Fetch tags before invoking it.
Exit 0 means local analysis completed, 1 means attention is required, and 2 means analysis failed.
Analysis does not verify repository release policy or authorize publication.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from functools import cmp_to_key
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence


SEMVER_RE = re.compile(
    r"^(0|[1-9][0-9]*)\."
    r"(0|[1-9][0-9]*)\."
    r"(0|[1-9][0-9]*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)
CREATED_PRERELEASE_RE = re.compile(r"^[a-z][a-z0-9-]*\.[1-9][0-9]*$")
CONVENTIONAL_RE = re.compile(r"^([A-Za-z]+)(?:\([^)]+\))?(!)?:\s+\S")
BREAKING_FOOTER_RE = re.compile(r"(?m)^BREAKING(?: CHANGE|-CHANGE):")
PATCH_TYPES = {
    "fix",
    "perf",
    "refactor",
    "docs",
    "chore",
    "test",
    "build",
    "style",
    "ci",
}
GIT_OPERATION_MARKERS = {
    "merge": ("MERGE_HEAD",),
    # REBASE_HEAD can outlive a completed rebase; the state directories are active-operation markers.
    "rebase/am": ("rebase-merge", "rebase-apply"),
    "cherry-pick": ("CHERRY_PICK_HEAD",),
    "revert": ("REVERT_HEAD",),
    "bisect": ("BISECT_HEAD", "BISECT_LOG", "BISECT_START"),
    "sequencer": ("sequencer",),
}


class GitError(RuntimeError):
    """A Git command failed unexpectedly."""


@dataclass(frozen=True)
class SemVer:
    major: int
    minor: int
    patch: int
    prerelease: tuple[str, ...]
    build: tuple[str, ...]

    @property
    def core(self) -> tuple[int, int, int]:
        return (self.major, self.minor, self.patch)


def run_git(
    repo: Path,
    *args: str,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if check and completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "unknown Git error"
        raise GitError(f"git {' '.join(args)}: {detail}")
    return completed


def parse_semver(tag: str) -> Optional[SemVer]:
    if not tag.startswith("v"):
        return None
    match = SEMVER_RE.fullmatch(tag[1:])
    if not match:
        return None
    prerelease = tuple(match.group(4).split(".")) if match.group(4) else ()
    if any(part.isdigit() and len(part) > 1 and part.startswith("0") for part in prerelease):
        return None
    build = tuple(match.group(5).split(".")) if match.group(5) else ()
    return SemVer(
        major=int(match.group(1)),
        minor=int(match.group(2)),
        patch=int(match.group(3)),
        prerelease=prerelease,
        build=build,
    )


def parse_created_tag(tag: str) -> Optional[SemVer]:
    version = parse_semver(tag)
    if version is None or version.build:
        return None
    if version.prerelease and not CREATED_PRERELEASE_RE.fullmatch(".".join(version.prerelease)):
        return None
    return version


def compare_prerelease(left: tuple[str, ...], right: tuple[str, ...]) -> int:
    if not left and not right:
        return 0
    if not left:
        return 1
    if not right:
        return -1
    for left_part, right_part in zip(left, right):
        if left_part == right_part:
            continue
        left_numeric = left_part.isdigit()
        right_numeric = right_part.isdigit()
        if left_numeric and right_numeric:
            return -1 if int(left_part) < int(right_part) else 1
        if left_numeric != right_numeric:
            return -1 if left_numeric else 1
        return -1 if left_part < right_part else 1
    if len(left) == len(right):
        return 0
    return -1 if len(left) < len(right) else 1


def compare_semver(left: SemVer, right: SemVer) -> int:
    if left.core != right.core:
        return -1 if left.core < right.core else 1
    return compare_prerelease(left.prerelease, right.prerelease)


def increment(version: SemVer, bump: str) -> str:
    if bump == "major":
        core = (version.major + 1, 0, 0)
    elif bump == "minor":
        core = (version.major, version.minor + 1, 0)
    elif bump == "patch":
        core = (version.major, version.minor, version.patch + 1)
    else:
        raise ValueError(f"unsupported bump: {bump}")
    return f"v{core[0]}.{core[1]}.{core[2]}"


def tag_exists(repo: Path, tag: str) -> bool:
    return run_git(repo, "show-ref", "--verify", "--quiet", f"refs/tags/{tag}", check=False).returncode == 0


def peel_tag(repo: Path, tag: str) -> str:
    return run_git(repo, "rev-parse", f"{tag}^{{commit}}").stdout.strip()


def read_commit(repo: Path, commit: str) -> dict[str, str]:
    output = run_git(repo, "show", "-s", "--format=%h%x00%P%x00%s%x00%b", commit).stdout
    short_hash, parents, subject, body = output.split("\x00", 3)
    return {
        "hash": commit,
        "short_hash": short_hash.strip(),
        "parents": parents.strip(),
        "subject": subject.strip(),
        "body": body.strip(),
    }


def classify_commits(commits: Iterable[dict[str, str]]) -> tuple[list[dict[str, str]], dict[str, list[str]]]:
    classified: list[dict[str, str]] = []
    groups: dict[str, list[str]] = {
        "breaking": [],
        "feature": [],
        "patch": [],
        "merge": [],
        "unclassified": [],
    }
    for commit in commits:
        subject = commit["subject"]
        body = commit["body"]
        match = CONVENTIONAL_RE.match(subject)
        if (match and match.group(2)) or BREAKING_FOOTER_RE.search(body):
            kind = "breaking"
        elif match and match.group(1).lower() == "feat":
            kind = "feature"
        elif match and match.group(1).lower() in PATCH_TYPES:
            kind = "patch"
        elif len(commit["parents"].split()) > 1:
            kind = "merge"
        else:
            kind = "unclassified"
        item = {"hash": commit["hash"], "short_hash": commit["short_hash"], "subject": subject, "kind": kind}
        classified.append(item)
        groups[kind].append(commit["short_hash"])
    return classified, groups


def infer_bump(groups: dict[str, list[str]]) -> Optional[str]:
    if groups["breaking"]:
        return "major"
    if groups["feature"]:
        return "minor"
    if groups["patch"]:
        return "patch"
    return None


def resolve_repo(path: str) -> Path:
    candidate = Path(path).resolve()
    top = run_git(candidate, "rev-parse", "--show-toplevel").stdout.strip()
    return Path(top).resolve()


def git_path(repo: Path, name: str) -> Path:
    """Resolve a worktree-aware Git administrative path without assuming `.git/`."""
    value = run_git(repo, "rev-parse", "--git-path", name).stdout.strip()
    path = Path(value)
    return path if path.is_absolute() else repo / path


def active_git_operations(repo: Path) -> list[str]:
    """Return active operation families represented by Git's administrative state."""
    return [
        operation
        for operation, markers in GIT_OPERATION_MARKERS.items()
        if any(git_path(repo, marker).exists() for marker in markers)
    ]


def build_plan(repo_arg: str, target: Optional[str], release_branch: Optional[str] = None) -> dict[str, Any]:
    repo = resolve_repo(repo_arg)
    checks: list[dict[str, Any]] = []
    attention: list[dict[str, str]] = []
    warnings: list[str] = []

    def add_check(check_id: str, status: str, summary: str, **details: Any) -> None:
        item: dict[str, Any] = {"id": check_id, "status": status, "summary": summary}
        item.update(details)
        checks.append(item)

    def require_attention(item_id: str, message: str) -> None:
        attention.append({"id": item_id, "message": message})

    branch_result = run_git(repo, "symbolic-ref", "--quiet", "--short", "HEAD", check=False)
    branch = branch_result.stdout.strip() if branch_result.returncode == 0 else None
    if branch:
        add_check("attached-head", "ok", f"HEAD is attached to {branch}")
    else:
        add_check("attached-head", "attention", "HEAD is detached")
        require_attention("attached-head", "Release work requires an attached branch before mutation.")

    if branch:
        expected_branch = (release_branch or "").strip()
        if expected_branch:
            if branch == expected_branch:
                add_check("release-line", "ok", f"HEAD matches the supplied release branch {branch}")
            else:
                add_check("release-line", "attention", "HEAD differs from the supplied release branch")
                require_attention("release-line", f"Expected {expected_branch}, found {branch}.")
        else:
            add_check("release-line", "not_checked", "No repository release branch was supplied")
            warnings.append("Release branch policy was not checked; supply --release-branch from repository policy when known.")

    operations = active_git_operations(repo)
    if operations:
        add_check(
            "operation-state",
            "attention",
            "A Git operation is in progress",
            operations=operations,
        )
        require_attention(
            "operation-state",
            "Finish or abort the active Git operation before release planning.",
        )
    else:
        add_check("operation-state", "ok", "No Git operation is in progress")

    porcelain = run_git(repo, "status", "--porcelain").stdout
    dirty_paths = [line for line in porcelain.splitlines() if line]
    if dirty_paths:
        add_check("clean-worktree", "attention", "Working tree is not clean", paths=dirty_paths)
        require_attention("clean-worktree", "Commit, move, or discard in-scope changes before release planning.")
    else:
        add_check("clean-worktree", "ok", "Working tree is clean")

    shallow = run_git(repo, "rev-parse", "--is-shallow-repository").stdout.strip() == "true"
    incomplete_roots: list[str] = []
    if shallow:
        roots = run_git(repo, "rev-list", "--max-parents=0", "HEAD").stdout.splitlines()
        for root in roots:
            raw = run_git(repo, "cat-file", "-p", root).stdout
            headers = raw.split("\n\n", 1)[0].splitlines()
            if any(line.startswith("parent ") for line in headers):
                incomplete_roots.append(root)
    history_complete = not incomplete_roots
    if history_complete:
        add_check(
            "complete-head-history",
            "ok",
            "HEAD history is complete for base selection" if shallow else "Repository is not shallow",
        )
    else:
        add_check(
            "complete-head-history",
            "attention",
            "HEAD reaches a shallow boundary",
            roots=incomplete_roots,
        )
        require_attention("complete-head-history", "Deepen or unshallow HEAD history before selecting a release base.")

    result: dict[str, Any] = {
        "schema_version": 2,
        "status": "attention",
        "analysis_scope": "local-v-prefixed-semver",
        "release_policy": "not_verified",
        "repo": str(repo),
        "branch": branch,
        "requested_tag": target,
        "selected_tag": None,
        "inferred_bump": None,
        "inferred_tag": None,
        "base": None,
        "release_notes_base": None,
        "ignored_invalid_tags": [],
        "other_format_tags": [],
        "commits": [],
        "checks": checks,
        "attention": attention,
        "warnings": warnings,
    }

    if not history_complete:
        return result

    candidates: list[tuple[str, SemVer]] = []
    invalid_tags: list[str] = []
    other_format_tags: list[str] = []
    for tag in run_git(repo, "tag", "--merged", "HEAD").stdout.splitlines():
        # Keep the modeled format as `v` plus a leading digit, so `v01.2.3` still
        # reports as an ignored invalid tag rather than as an unrelated tag.
        if tag.startswith("v") and len(tag) > 1 and tag[1].isdigit():
            version = parse_semver(tag)
            if version is None:
                invalid_tags.append(tag)
            else:
                candidates.append((tag, version))
        else:
            other_format_tags.append(tag)
    result["ignored_invalid_tags"] = sorted(invalid_tags)
    result["other_format_tags"] = sorted(other_format_tags)
    if other_format_tags:
        warnings.append("Tags outside the v-prefixed SemVer model are listed in other_format_tags; their meaning was not inferred. Confirm the repository tag policy before using this calculation.")
        if not candidates:
            add_check("tag-format", "attention", "Other tags exist but no modeled release base is reachable")
            require_attention("tag-format", "Use repository policy to resolve the release model; this analyzer cannot establish a first release from these tags.")
            return result

    base_tag: Optional[str] = None
    base_version: Optional[SemVer] = None
    base_commit: Optional[str] = None
    if candidates:
        ordered = sorted(candidates, key=cmp_to_key(lambda left, right: compare_semver(left[1], right[1])))
        highest_version = ordered[-1][1]
        highest = [item for item in ordered if compare_semver(item[1], highest_version) == 0]
        peeled = {tag: peel_tag(repo, tag) for tag, _ in highest}
        commits = sorted(set(peeled.values()))
        if len(commits) != 1:
            add_check(
                "reachable-semver-base",
                "attention",
                "Highest-precedence tags resolve to different commits",
                tags=peeled,
            )
            require_attention(
                "reachable-semver-base",
                "Resolve equal-precedence build-metadata tag ambiguity before releasing.",
            )
            return result
        base_tag = sorted(peeled)[0]
        base_version = highest_version
        base_commit = commits[0]
        ancestor = run_git(repo, "merge-base", "--is-ancestor", base_commit, "HEAD", check=False)
        if ancestor.returncode != 0:
            add_check("reachable-semver-base", "attention", "Selected base is not an ancestor of HEAD")
            require_attention("reachable-semver-base", "Repair the local history or tag set before releasing.")
            return result
        add_check(
            "reachable-semver-base",
            "ok",
            f"Selected {base_tag}",
            tags=sorted(peeled),
            commit=base_commit,
        )
        result["base"] = {"tag": base_tag, "tags": sorted(peeled), "commit": base_commit}
    else:
        add_check("reachable-semver-base", "ok", "No reachable modeled tag; calculating an initial v-prefixed version")

    revision = f"{base_commit}..HEAD" if base_commit else "HEAD"
    commit_hashes = [line for line in run_git(repo, "rev-list", revision).stdout.splitlines() if line]
    commit_details = [read_commit(repo, commit) for commit in commit_hashes]
    classified, groups = classify_commits(commit_details)
    bump = infer_bump(groups)
    result["commits"] = classified
    result["inferred_bump"] = bump

    inferred_tag: Optional[str] = None
    if base_version is None and commit_hashes:
        inferred_tag = "v0.1.0"
    elif base_version is not None and not base_version.prerelease and bump:
        inferred_tag = increment(base_version, bump)
    result["inferred_tag"] = inferred_tag

    target_version: Optional[SemVer] = None
    if target is not None:
        target_version = parse_created_tag(target)
        if target_version is None:
            add_check("target-tag", "attention", "Requested tag is not a supported new release tag", tag=target)
            require_attention(
                "target-tag",
                "Use vX.Y.Z or vX.Y.Z-<lowercase-label>.N without build metadata.",
            )
        elif tag_exists(repo, target):
            add_check("target-tag", "attention", "Requested tag already exists", tag=target)
            require_attention("target-tag", "Choose a new tag; never move or replace an existing tag.")
        elif base_version is not None and compare_semver(target_version, base_version) <= 0:
            add_check("target-tag", "attention", "Requested tag is not newer than the reachable base", tag=target)
            require_attention("target-tag", "Choose a version with greater SemVer precedence than the base.")
        else:
            add_check("target-tag", "ok", f"Requested tag {target} is available")
            result["selected_tag"] = target
            if inferred_tag and target != inferred_tag:
                warnings.append(f"Requested {target} differs from inferred {inferred_tag}; explicit target retained.")
    elif base_version is not None and base_version.prerelease:
        add_check("target-tag", "attention", "Prerelease history requires an explicit next target")
        require_attention("target-tag", "Choose the next numbered prerelease or the stable promotion target.")
    elif inferred_tag is None:
        add_check("target-tag", "attention", "No release bump can be inferred")
        require_attention("target-tag", "Choose an exact target or add classifiable release commits.")
    elif tag_exists(repo, inferred_tag):
        add_check("target-tag", "attention", "Inferred tag already exists", tag=inferred_tag)
        require_attention("target-tag", "Choose a new target; never move or replace an existing tag.")
    else:
        add_check("target-tag", "ok", f"Inferred tag {inferred_tag} is available")
        result["selected_tag"] = inferred_tag

    if not commit_hashes:
        require_attention("release-commits", "No commits exist after the selected base.")
    if groups["unclassified"]:
        message = "Unclassified commit subjects: " + ", ".join(groups["unclassified"])
        if target is None and not groups["breaking"]:
            require_attention("unclassified-commits", message + "; confirm the bump or choose an exact target.")
        else:
            warnings.append(message)
    if target is None and bump == "major" and base_version is not None and base_version.major == 0:
        require_attention("pre-1-breaking", "Confirm whether the project promotes this breaking change to 1.0.0.")

    selected_version = parse_created_tag(result["selected_tag"]) if result["selected_tag"] else None
    if selected_version and not selected_version.prerelease and candidates:
        same_core_prereleases = [
            (tag, version)
            for tag, version in candidates
            if version.core == selected_version.core and version.prerelease
        ]
        if same_core_prereleases:
            stable_candidates = [
                (tag, version)
                for tag, version in candidates
                if not version.prerelease and compare_semver(version, selected_version) < 0
            ]
            if stable_candidates:
                previous = sorted(
                    stable_candidates,
                    key=cmp_to_key(lambda left, right: compare_semver(left[1], right[1])),
                )[-1][1]
                # Build metadata has no SemVer precedence. Apply the same ambiguity
                # check as the release base before choosing a promotion notes range.
                peeled = {tag: peel_tag(repo, tag) for tag, version in stable_candidates
                          if compare_semver(version, previous) == 0}
                if len(set(peeled.values())) != 1:
                    add_check("release-notes-base", "attention",
                              "Previous stable tags resolve to different commits", tags=peeled)
                    require_attention("release-notes-base",
                                      "Resolve equal-precedence stable tag ambiguity before selecting promotion notes.")
                else:
                    tag = sorted(peeled)[0]
                    result["release_notes_base"] = {"tag": tag, "commit": peeled[tag]}
            else:
                result["release_notes_base"] = {"tag": None, "commit": None}
        else:
            result["release_notes_base"] = result["base"]
    else:
        result["release_notes_base"] = result["base"]

    result["status"] = "analyzed" if not attention else "attention"
    return result


def emit(plan: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True))
        return
    print(f"status: {plan['status']}")
    print(f"scope: {plan.get('analysis_scope', 'local-v-prefixed-semver')}; repository release policy not verified")
    print(f"repo: {plan.get('repo', '-')}")
    print(f"branch: {plan.get('branch') or '(detached)'}")
    base = plan.get("base") or {}
    print(f"base: {base.get('tag') or '(no modeled base)'}")
    print(f"bump: {plan.get('inferred_bump') or '(undetermined)'}")
    print(f"target: {plan.get('selected_tag') or '(attention required)'}")
    for item in plan.get("attention", []):
        print(f"attention[{item['id']}]: {item['message']}")
    for warning in plan.get("warnings", []):
        print(f"warning: {warning}")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", help="repository path (default: current directory)")
    parser.add_argument("--target", help="exact target tag, e.g. v1.2.0 or v2.0.0-rc.1")
    parser.add_argument(
        "--release-branch",
        help="expected release branch from repository policy; default branch is not assumed to be a release line",
    )
    parser.add_argument("--json", action="store_true", help="emit the stable JSON report")
    raw = list(sys.argv[1:] if argv is None else argv)
    if any(value in ("-h", "--help") for value in raw) and raw not in (["-h"], ["--help"]):
        parser.error("-h/--help cannot be combined with other arguments")
    return parser.parse_args(raw)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        plan = build_plan(args.repo, args.target, args.release_branch)
    except (GitError, OSError, ValueError) as exc:
        plan = {
            "schema_version": 2,
            "status": "error",
            "analysis_scope": "local-v-prefixed-semver",
            "release_policy": "not_verified",
            "error": str(exc),
            "repo": str(Path(args.repo).resolve()),
            "checks": [],
            "attention": [],
            "warnings": [],
        }
        emit(plan, args.json)
        return 2
    emit(plan, args.json)
    return 0 if plan["status"] == "analyzed" else 1


if __name__ == "__main__":
    sys.exit(main())
