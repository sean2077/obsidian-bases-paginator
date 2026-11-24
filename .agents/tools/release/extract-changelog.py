#!/usr/bin/env python
"""Extract one fail-closed release-notes body from the preferred changelog format.

Fails closed and never falls back to generated notes when the exact tag heading
is missing, duplicated, malformed, mismatched against --tag, carries an invalid
calendar date, or yields an empty body.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import tempfile
from datetime import date
from pathlib import Path
from typing import List, Optional, Sequence, Tuple


CANONICAL_HEADING_RE = re.compile(
    r"^ — (?P<date>\d{4}-\d{2}-\d{2})[ \t]*$"
)
H2_RE = re.compile(r"^[ ]{0,3}##(?:[ \t]+|$)")
H1_RE = re.compile(r"^[ ]{0,3}#(?:[ \t]+|$)")
FENCE_OPEN_RE = re.compile(r"^[ ]{0,3}(?P<fence>`{3,}|~{3,})(?P<info>.*)$")


class ExtractionError(ValueError):
    """The changelog does not satisfy the preferred-flow extraction contract."""


LineRecord = Tuple[int, int, str, bool]


def scan_lines(text: str) -> List[LineRecord]:
    """Return offsets and whether each line is outside a fenced code block."""

    records: List[LineRecord] = []
    offset = 0
    fence_char: Optional[str] = None
    fence_size = 0

    for raw_line in text.splitlines(keepends=True):
        line = raw_line.rstrip("\r\n")
        outside_fence = fence_char is None
        records.append((offset, offset + len(raw_line), line, outside_fence))

        if fence_char is None:
            match = FENCE_OPEN_RE.match(line)
            if match:
                marker = match.group("fence")
                info = match.group("info")
                if marker[0] == "`" and "`" in info:
                    offset += len(raw_line)
                    continue
                fence_char = marker[0]
                fence_size = len(marker)
        else:
            closing_fence = re.fullmatch(
                rf"^[ ]{{0,3}}{re.escape(fence_char)}{{{fence_size},}}[ \t]*$", line
            )
            if closing_fence:
                fence_char = None
                fence_size = 0
        offset += len(raw_line)

    return records


def extract_notes(text: str, exact_tag: str) -> str:
    """Return the target heading's trimmed body, excluding the heading itself."""

    if not exact_tag or any(character in exact_tag for character in ("\x00", "\r", "\n")):
        raise ExtractionError("the exact tag must be one non-empty line without NUL")

    records = scan_lines(text)
    matches: List[Tuple[int, LineRecord]] = []
    target_prefix = f"## [{exact_tag}]"
    for index, record in enumerate(records):
        _, _, line, outside_fence = record
        if not outside_fence:
            continue
        if H2_RE.match(line) and line.lstrip(" ").startswith(target_prefix):
            matches.append((index, record))

    if not matches:
        raise ExtractionError(f"no level-two changelog heading matches exact tag {exact_tag!r}")
    if len(matches) != 1:
        raise ExtractionError(f"multiple changelog headings match exact tag {exact_tag!r}")

    target_index, (_, body_start, heading_line, _) = matches[0]
    canonical = CANONICAL_HEADING_RE.fullmatch(heading_line.lstrip(" ")[len(target_prefix) :])
    if canonical is None:
        raise ExtractionError(
            f"heading for {exact_tag!r} must be '## [{exact_tag}] — YYYY-MM-DD'"
        )
    try:
        date.fromisoformat(canonical.group("date"))
    except ValueError as error:
        raise ExtractionError(f"heading for {exact_tag!r} has an invalid calendar date") from error

    body_end = len(text)
    for start, _, line, outside_fence in records[target_index + 1 :]:
        # Stop at any top-level heading: a level-one separator between sections would
        # otherwise be pulled into the notes along with the next section's content.
        if outside_fence and (H1_RE.match(line) or H2_RE.match(line)):
            body_end = start
            break

    body = text[body_start:body_end].strip()
    if not body:
        raise ExtractionError(f"changelog section for exact tag {exact_tag!r} is empty")
    return body + "\n"


def write_notes(changelog: Path, exact_tag: str, output: Path) -> None:
    """Validate completely, then atomically replace the requested notes output."""

    if changelog.resolve() == output.resolve():
        raise ExtractionError("the notes output must not overwrite the changelog")
    if not output.parent.is_dir():
        raise ExtractionError(f"notes output directory does not exist: {output.parent}")

    try:
        text = changelog.read_text(encoding="utf-8-sig")
    except OSError as error:
        raise ExtractionError(f"cannot read changelog {changelog}: {error}") from error

    notes = extract_notes(text, exact_tag)
    temporary_name: Optional[str] = None
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            dir=str(output.parent), prefix=f".{output.name}.", suffix=".tmp", text=True
        )
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(notes)
        os.replace(temporary_name, output)
        temporary_name = None
    except OSError as error:
        raise ExtractionError(f"cannot write release notes {output}: {error}") from error
    finally:
        if temporary_name is not None:
            try:
                Path(temporary_name).unlink()
            except FileNotFoundError:
                pass


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--changelog", required=True, type=Path, help="committed changelog path")
    parser.add_argument("--tag", required=True, help="complete repository tag, matched exactly")
    parser.add_argument("--output", required=True, type=Path, help="release-notes output path")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        write_notes(args.changelog, args.tag, args.output)
    except ExtractionError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"release notes: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
