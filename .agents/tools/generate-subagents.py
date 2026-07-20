#!/usr/bin/env python
# Generate Claude Code (.claude/agents/*.md) and Codex (.codex/agents/*.toml)
# subagent files from the authoritative source in .agents/subagents/.
#
#   python .agents/tools/generate-subagents.py           # write projections
#   python .agents/tools/generate-subagents.py --check   # exit 1 on drift (CI / pre-commit)
#   python .agents/tools/generate-subagents.py --import  # adopt hand-authored host agents into sources
#
# Source per subagent: .agents/subagents/<name>/{metadata.json, instructions.md}.
# Generated files are marked "do not edit by hand" — edit the source and re-run.
#
# Standard-library Python 3 only (no pip installs). The bash harness already assumes
# python, so subagents work anywhere the rest of the harness does — no Node / package.json.
import json
import os
import re
import stat
import sys
import tempfile

ROOT = os.path.abspath(
    (os.environ.get("AGENT_SCAFFOLD_PREFLIGHT_REPO") if "--preflight-import" in sys.argv[1:] else None)
    or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
)
SOURCE_DIR = os.path.join(ROOT, ".agents", "subagents")
CLAUDE_DIR = os.path.join(ROOT, ".claude", "agents")
CODEX_DIR = os.path.join(ROOT, ".codex", "agents")
DO_NOT_EDIT = (
    "Generated from .agents/subagents/%s; do not edit by hand. "
    "Run: python .agents/tools/generate-subagents.py"
)
DUAL_HOST_NAME = re.compile(r"^[a-z]+(?:-[a-z]+)*$")
WINDOWS_RESERVED_NAMES = {"con", "prn", "aux", "nul"}
NICKNAME_CANDIDATE = re.compile(r"^[A-Za-z0-9 _-]+$")
SOURCE_FIELDS = {"name", "description", "claude", "codex"}
CLAUDE_FIELDS = {"tools", "model"}
CODEX_FIELDS = {"model", "model_reasoning_effort", "sandbox_mode", "nickname_candidates"}
SOURCE_SUPPORT_FILES = {".gitkeep", "README.md"}


def is_dir(p):
    return os.path.isdir(p)


def read_text(p):
    with open(p, "r", encoding="utf-8") as f:
        # Normalize CRLF/CR -> LF: Windows/Git-Bash-authored agent files must still
        # match the LF-based frontmatter regexes (--import), and projections must not
        # false-drift on line endings alone (--check / write_if_changed).
        return f.read().replace("\r\n", "\n").replace("\r", "\n")


def write_text(p, content):
    # newline="\n": never let text mode translate to CRLF on Windows. The repo is
    # LF-only (.gitattributes + CI CRLF check) and read_text() normalizes CRLF->LF
    # before --check compares, so a CRLF write would be a silent false-green.
    # A unique sibling + os.replace makes the write atomic without claiming a
    # deterministic project-owned temp path.
    mode = stat.S_IMODE(os.stat(p).st_mode) if os.path.isfile(p) else 0o644
    descriptor, tmp = tempfile.mkstemp(
        prefix=".%s.agent-scaffold-" % os.path.basename(p),
        dir=os.path.dirname(p),
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, p)
    finally:
        try:
            os.remove(tmp)
        except FileNotFoundError:
            pass


def rel(p):
    return p[len(ROOT) + 1:].replace(os.sep, "/")


def is_generated_projection(path, text):
    """Recognize the current position-bound ownership marker."""
    name, ext = os.path.splitext(os.path.basename(path))
    marker = DO_NOT_EDIT.replace("%s", name)
    if ext == ".toml":
        return text.startswith("# %s\n" % marker)
    if ext == ".md":
        return (
            re.match(r"\A---\n[\s\S]*?\n---\n\n<!-- %s -->\n" % re.escape(marker), text)
            is not None
        )
    return False


def normalize_instructions(instructions):
    return instructions if instructions.endswith("\n") else instructions + "\n"


def validate_agent_name(name, where):
    if not isinstance(name, str) or not DUAL_HOST_NAME.fullmatch(name):
        raise SystemExit(
            "%s: agent name '%s' is not dual-host compatible; use lowercase letters separated by hyphens"
            % (where, name)
        )
    if name in WINDOWS_RESERVED_NAMES:
        raise SystemExit("%s: agent name '%s' is reserved on Windows" % (where, name))


def has_invalid_unicode_scalar(value):
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        return True
    return False


def has_forbidden_yaml_raw_character(value):
    for character in value:
        codepoint = ord(character)
        if (codepoint < 0x20 and character not in "\t\n\r") or (
            0x7F <= codepoint <= 0x84 or 0x86 <= codepoint <= 0x9F
        ) or codepoint in (0xFFFE, 0xFFFF):
            return True
    return False


def has_forbidden_toml_raw_character(value, multiline=False):
    allowed = "\t\n\r" if multiline else "\t"
    return any(
        (ord(character) < 0x20 and character not in allowed) or ord(character) == 0x7F
        for character in value
    )


def reject_unknown_source_fields(name, value, allowed, label):
    unsupported = sorted(set(value) - allowed)
    if unsupported:
        raise SystemExit(
            "subagent '%s': %s has unsupported field '%s'"
            % (name, label, unsupported[0])
        )


def validate_source_string(name, value, label):
    if not isinstance(value, str) or not value.strip():
        raise SystemExit("subagent '%s': %s must be a non-empty string" % (name, label))
    if has_invalid_unicode_scalar(value):
        raise SystemExit(
            "subagent '%s': %s contains an invalid Unicode scalar value" % (name, label)
        )


def nickname_candidates_error(nicks):
    if not isinstance(nicks, list) or not nicks or any(not isinstance(nick, str) for nick in nicks):
        return "nickname_candidates must be a non-empty list of strings"
    if len(set(nicks)) != len(nicks):
        return "nickname_candidates must contain unique names"
    if any(not nick.strip() or NICKNAME_CANDIDATE.fullmatch(nick) is None for nick in nicks):
        return "nickname_candidates use only ASCII letters, digits, spaces, hyphens, and underscores"
    return None


def validate_source(name, meta, instructions):
    if not isinstance(meta, dict):
        raise SystemExit("subagent '%s': metadata.json must contain an object" % name)
    reject_unknown_source_fields(name, meta, SOURCE_FIELDS, "metadata.json")
    validate_agent_name(name, "subagent '%s'" % name)
    if meta.get("name") != name:
        raise SystemExit(
            "subagent '%s': metadata.name='%s' must match directory name" % (name, meta.get("name"))
        )
    description = meta.get("description")
    if not isinstance(description, str):
        raise SystemExit(
            "subagent '%s': metadata.description must be a non-empty string" % name
        )
    if not description.strip():
        raise SystemExit("subagent '%s': metadata.json needs a non-empty description" % name)
    if has_invalid_unicode_scalar(description):
        raise SystemExit(
            "subagent '%s': metadata.description contains an invalid Unicode scalar value" % name
        )
    if not isinstance(instructions, str):
        raise SystemExit("subagent '%s': instructions.md must contain text" % name)
    if has_invalid_unicode_scalar(instructions):
        raise SystemExit(
            "subagent '%s': instructions.md contains an invalid Unicode scalar value" % name
        )

    if "claude" in meta:
        claude = meta["claude"]
        if not isinstance(claude, dict):
            raise SystemExit("subagent '%s': metadata.claude must be an object" % name)
        reject_unknown_source_fields(name, claude, CLAUDE_FIELDS, "metadata.claude")
        if "tools" in claude:
            tools = claude["tools"]
            if (
                not isinstance(tools, list)
                or not tools
                or any(not isinstance(tool, str) or not tool.strip() for tool in tools)
            ):
                raise SystemExit(
                    "subagent '%s': metadata.claude.tools must be a non-empty list of strings"
                    % name
                )
            for tool in tools:
                if has_invalid_unicode_scalar(tool):
                    raise SystemExit(
                        "subagent '%s': metadata.claude.tools contains an invalid Unicode scalar value"
                        % name
                    )
            if any(tool != tool.strip() or "," in tool for tool in tools):
                raise SystemExit(
                    "subagent '%s': metadata.claude.tools entries must not contain commas or "
                    "surrounding whitespace" % name
                )
        if "model" in claude:
            validate_source_string(name, claude["model"], "metadata.claude.model")

    if "codex" in meta:
        codex = meta["codex"]
        if not isinstance(codex, dict):
            raise SystemExit("subagent '%s': metadata.codex must be an object" % name)
        reject_unknown_source_fields(name, codex, CODEX_FIELDS, "metadata.codex")
        for field in ("model", "model_reasoning_effort", "sandbox_mode"):
            if field in codex:
                validate_source_string(name, codex[field], "metadata.codex.%s" % field)
        if "nickname_candidates" in codex:
            error = nickname_candidates_error(codex["nickname_candidates"])
            if error:
                raise SystemExit("subagent '%s': %s" % (name, error))
    return normalize_instructions(instructions)


# JSON string encoding doubles as a valid YAML double-quoted scalar / TOML basic
# string for our text. JSON can emit raw C1 controls that YAML excludes, so keep
# ordinary Unicode readable while escaping the shared non-printable range.
def jstr(s):
    if not isinstance(s, str) or has_invalid_unicode_scalar(s):
        raise SystemExit("cannot render a non-string or invalid Unicode value")
    encoded = json.dumps(s, ensure_ascii=False)
    return "".join(
        "\\u%04x" % ord(character)
        if 0x7F <= ord(character) <= 0x9F or ord(character) in (0xFFFE, 0xFFFF)
        else character
        for character in encoded
    )


def load_subagents():
    preflight_directory(SOURCE_DIR)
    if os.path.lexists(SOURCE_DIR) and not is_dir(SOURCE_DIR):
        raise SystemExit("%s: expected a directory" % rel(SOURCE_DIR))
    if not is_dir(SOURCE_DIR):
        return []
    out = []
    for name in sorted(os.listdir(SOURCE_DIR)):
        d = os.path.join(SOURCE_DIR, name)
        if name in SOURCE_SUPPORT_FILES:
            if not os.path.isfile(d):
                raise SystemExit("%s: expected a regular file" % rel(d))
            continue
        if name.startswith("_"):
            continue
        if os.path.islink(d):
            raise SystemExit("%s: managed source directory must not be a symlink" % rel(d))
        if not is_dir(d):
            raise SystemExit("%s: expected a directory" % rel(d))
        meta_path = os.path.join(d, "metadata.json")
        instr_path = os.path.join(d, "instructions.md")
        if not os.path.exists(meta_path) or not os.path.exists(instr_path):
            raise SystemExit("subagent '%s' is missing metadata.json or instructions.md" % name)
        for source_path in (meta_path, instr_path):
            if os.path.islink(source_path) or not os.path.isfile(source_path):
                raise SystemExit("%s: expected a regular non-symlink file" % rel(source_path))
        try:
            meta = json.loads(read_text(meta_path))
        except ValueError as e:
            raise SystemExit("subagent '%s': metadata.json is not valid JSON: %s" % (name, e))
        instructions = validate_source(name, meta, read_text(instr_path))
        out.append({"name": name, "meta": meta, "instructions": instructions})
    return out


# JSON strings are valid YAML double-quoted scalars. Always quote host-schema
# strings so values such as "false" or "null" cannot change YAML type.
def yaml_string(s):
    return jstr(s)


def render_claude(sa):
    name, meta, instructions = sa["name"], sa["meta"], sa["instructions"]
    fm = ["name: %s" % yaml_string(name), "description: %s" % yaml_string(meta.get("description"))]
    claude = meta.get("claude") or {}
    tools = claude.get("tools")
    if isinstance(tools, list) and tools:
        fm.append("tools: %s" % yaml_string(", ".join(tools)))
    if claude.get("model"):
        fm.append("model: %s" % yaml_string(claude["model"]))
    banner = DO_NOT_EDIT.replace("%s", name)
    return "---\n%s\n---\n\n<!-- %s -->\n\n%s" % ("\n".join(fm), banner, instructions)


def toml_multiline(s):
    if "'''" in s:
        raise SystemExit("instructions cannot contain ''' (TOML multiline literal delimiter)")
    if has_forbidden_toml_raw_character(s, multiline=True):
        raise SystemExit("instructions contain a character forbidden by TOML multiline literal strings")
    return "'''\n%s'''" % s


def render_codex(sa):
    name, meta, instructions = sa["name"], sa["meta"], sa["instructions"]
    c = meta.get("codex") or {}
    lines = [
        "# %s" % DO_NOT_EDIT.replace("%s", name),
        "name = %s" % jstr(name),
        "description = %s" % jstr(meta.get("description")),
    ]
    if c.get("model"):
        lines.append("model = %s" % jstr(c["model"]))
    if c.get("model_reasoning_effort"):
        lines.append("model_reasoning_effort = %s" % jstr(c["model_reasoning_effort"]))
    if c.get("sandbox_mode"):
        lines.append("sandbox_mode = %s" % jstr(c["sandbox_mode"]))
    nicks = c.get("nickname_candidates")
    if isinstance(nicks, list) and nicks:
        lines.append("nickname_candidates = [%s]" % ", ".join(jstr(n) for n in nicks))
    lines.append("developer_instructions = %s" % toml_multiline(instructions))
    return "\n".join(lines) + "\n"


def projections(subagents):
    out = []
    for sa in subagents:
        out.append({"path": os.path.join(CLAUDE_DIR, sa["name"] + ".md"), "content": render_claude(sa)})
        out.append({"path": os.path.join(CODEX_DIR, sa["name"] + ".toml"), "content": render_codex(sa)})
    return out


# Generated files with no matching source (would be stale).
def orphans(subagents):
    expect = set()
    for sa in subagents:
        expect.add(os.path.join(CLAUDE_DIR, sa["name"] + ".md"))
        expect.add(os.path.join(CODEX_DIR, sa["name"] + ".toml"))
    found = []
    for d, ext in ((CLAUDE_DIR, ".md"), (CODEX_DIR, ".toml")):
        for p in host_agent_paths(d, ext):
            if p not in expect:
                found.append(p)
    return found


def host_agent_paths(directory, extension):
    preflight_directory(directory)
    if not is_dir(directory):
        return []
    paths = []
    for filename in sorted(os.listdir(directory)):
        path = os.path.join(directory, filename)
        if filename.lower().endswith(extension) and not filename.endswith(extension):
            raise SystemExit(
                "%s: host agent extension must be lowercase %s" % (rel(path), extension)
            )
        if filename.endswith(extension):
            name = filename[: -len(extension)]
            validate_agent_name(name, "%s filename" % rel(path))
            if os.path.islink(path):
                raise SystemExit("%s: managed projection must not be a symlink" % rel(path))
            paths.append(path)
    return paths


# --- Adoption (--import): turn hand-authored host agent files into SSOT sources ---

# Parse the losslessly representable Claude subset (simple frontmatter + body).
# Unsupported fields/structures fail closed instead of disappearing on projection.
_YAML_IMPLICIT_NUMBER = re.compile(
    r"""^[-+]?(?:
        0o[0-7_]+ |
        0x[0-9a-f_]+ |
        [0-9][0-9_]* |
        (?:[0-9][0-9_]*\.[0-9_]*|\.[0-9][0-9_]*)(?:[eE][-+]?[0-9]+)? |
        [0-9][0-9_]*[eE][-+]?[0-9]+ |
        \.(?:inf|nan)
    )$""",
    re.IGNORECASE | re.VERBOSE,
)
_YAML_IMPLICIT_DATE = re.compile(
    r"^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[-+]\d{2}(?::?\d{2})?)?)?$"
)


def is_implicit_yaml_non_string(raw):
    return (
        raw.lower() in {"~", "null", "true", "false"}
        or _YAML_IMPLICIT_NUMBER.fullmatch(raw) is not None
        or _YAML_IMPLICIT_DATE.fullmatch(raw) is not None
    )


def is_unsupported_yaml_plain(raw):
    return (
        raw.startswith(("[", "]", "{", "}", ",", "#", "&", "*", "!", "|", ">", "%", "@", "`"))
        or re.match(r"^[-?:](?:\s|$)", raw) is not None
        or re.search(r":(?:\s|$)", raw) is not None
        or re.search(r"\s#", raw) is not None
    )


def parse_claude_agent(text):
    m = re.match(r"^---\n([\s\S]*?)\n---\n?([\s\S]*)$", text)
    if not m:
        return None
    fm, raw_body = m.group(1), m.group(2)
    meta = {}
    allowed = {"name", "description", "tools", "model"}
    for line in fm.split("\n"):
        if not line.strip():
            continue
        if line.lstrip().startswith("#"):
            raise ValueError("unsupported Claude frontmatter comment")
        kv = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if not kv:
            raise ValueError("unsupported Claude YAML structure")
        key, raw = kv.group(1), kv.group(2).strip()
        if key not in allowed:
            raise ValueError("unsupported Claude field '%s'" % key)
        if key in meta:
            raise ValueError("duplicate Claude field '%s'" % key)
        if has_forbidden_yaml_raw_character(raw):
            raise ValueError("unsupported Claude value for field '%s'" % key)
        if raw.startswith('"'):
            if not raw.endswith('"'):
                raise ValueError("unsupported Claude value for field '%s'" % key)
            try:
                value = json.loads(raw)
            except ValueError:
                raise ValueError("unsupported Claude value for field '%s'" % key)
            if not isinstance(value, str):
                raise ValueError("unsupported Claude value for field '%s'" % key)
        elif raw.startswith("'"):
            if not raw.endswith("'"):
                raise ValueError("unsupported Claude value for field '%s'" % key)
            inner = raw[1:-1]
            if "'" in inner.replace("''", ""):
                raise ValueError("unsupported Claude value for field '%s'" % key)
            value = inner.replace("''", "'")
        else:
            if is_unsupported_yaml_plain(raw):
                raise ValueError("unsupported Claude value for field '%s'" % key)
            if (raw == "" and key not in {"name", "description"}) or is_implicit_yaml_non_string(raw):
                raise ValueError("implicit non-string YAML value for field '%s'" % key)
            value = raw
        if has_invalid_unicode_scalar(value):
            raise ValueError("unsupported Claude value for field '%s'" % key)
        meta[key] = value
    tools = []
    if "tools" in meta:
        tools = [s.strip() for s in meta["tools"].split(",")]
        if not tools or any(not tool for tool in tools):
            raise ValueError("Claude field 'tools' must not be empty")
    if "model" in meta and not meta["model"].strip():
        raise ValueError("Claude field 'model' must not be empty")
    return {
        "name": meta.get("name"),
        "description": meta.get("description") or "",
        "tools": tools,
        "model": meta.get("model"),
        "body": raw_body[1:] if raw_body.startswith("\n") else raw_body,
    }


# Parse the losslessly representable Codex subset. Both TOML multiline string
# forms are accepted; other session-config fields fail closed before adoption.
def decode_toml_basic_string(raw, key):
    if len(raw) < 2 or not raw.startswith('"') or not raw.endswith('"'):
        raise ValueError("unsupported Codex value for field '%s'" % key)
    inner = raw[1:-1]
    if has_forbidden_toml_raw_character(inner):
        raise ValueError("unsupported Codex value for field '%s'" % key)
    i = 0
    while i < len(inner):
        if inner[i] != "\\":
            i += 1
            continue
        if i + 1 >= len(inner):
            raise ValueError("unsupported Codex value for field '%s'" % key)
        escape = inner[i + 1]
        if escape in {'"', "\\", "b", "t", "n", "f", "r"}:
            i += 2
            continue
        if escape == "u":
            digits = inner[i + 2 : i + 6]
            if len(digits) != 4 or re.fullmatch(r"[0-9A-Fa-f]{4}", digits) is None:
                raise ValueError("unsupported Codex value for field '%s'" % key)
            codepoint = int(digits, 16)
            if 0xD800 <= codepoint <= 0xDFFF:
                raise ValueError("unsupported Codex value for field '%s'" % key)
            i += 6
            continue
        raise ValueError("unsupported Codex value for field '%s'" % key)
    try:
        # TOML permits a raw TAB in a basic string; JSON requires it escaped.
        value = json.loads(raw.replace("\t", "\\t"))
    except ValueError:
        raise ValueError("unsupported Codex value for field '%s'" % key)
    if not isinstance(value, str) or has_invalid_unicode_scalar(value):
        raise ValueError("unsupported Codex value for field '%s'" % key)
    return value


def parse_codex_agent(text):
    multiline = re.search(
        r"(?m)^developer_instructions\s*=\s*(?P<quote>'''|\"\"\")"
        r"(?P<body>[\s\S]*?)(?P=quote)[ \t]*$",
        text,
    )
    instructions = None
    scanned = text
    if multiline:
        instructions = multiline.group("body")
        if multiline.group("quote") in instructions:
            raise ValueError("unsupported Codex value for field 'developer_instructions'")
        if instructions.startswith("\n"):
            instructions = instructions[1:]
        if multiline.group("quote") == '"""' and "\\" in instructions:
            raise ValueError("unsupported Codex escape in basic multiline developer_instructions")
        if has_forbidden_toml_raw_character(instructions, multiline=True):
            raise ValueError("unsupported Codex value for field 'developer_instructions'")
        scanned = text[: multiline.start()] + 'developer_instructions = ""' + text[multiline.end() :]

    allowed = {
        "name",
        "description",
        "model",
        "model_reasoning_effort",
        "sandbox_mode",
        "nickname_candidates",
        "developer_instructions",
    }
    values = {}
    for line in scanned.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            raise ValueError("unsupported Codex comment outside developer_instructions")
        table = re.match(r"^\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$", stripped)
        if table:
            raise ValueError("unsupported Codex field '%s'" % table.group(1))
        kv = re.match(r"^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$", stripped)
        if not kv:
            raise ValueError("unsupported Codex TOML structure")
        key, raw = kv.group(1), kv.group(2)
        if key not in allowed:
            raise ValueError("unsupported Codex field '%s'" % key)
        if key in values:
            raise ValueError("duplicate Codex field '%s'" % key)
        values[key] = raw

    def scalar(key):
        raw = values.get(key)
        if raw is None:
            return None
        if raw.startswith('"'):
            return decode_toml_basic_string(raw, key)
        if len(raw) >= 2 and raw.startswith("'") and raw.endswith("'"):
            inner = raw[1:-1]
            if (
                "'" in inner
                or has_invalid_unicode_scalar(inner)
                or has_forbidden_toml_raw_character(inner)
            ):
                raise ValueError("unsupported Codex value for field '%s'" % key)
            return inner
        raise ValueError("unsupported Codex value for field '%s'" % key)

    nicks = None
    if "nickname_candidates" in values:
        try:
            nicks = json.loads(values["nickname_candidates"])
        except ValueError:
            raise ValueError("unsupported Codex value for field 'nickname_candidates'")
        error = nickname_candidates_error(nicks)
        if error:
            raise ValueError(error)
    if "developer_instructions" not in values:
        raise ValueError("missing required Codex field 'developer_instructions'")
    if instructions is None:
        instructions = scalar("developer_instructions")
    parsed = {
        "name": scalar("name"),
        "description": scalar("description") or "",
        "model": scalar("model"),
        "model_reasoning_effort": scalar("model_reasoning_effort"),
        "sandbox_mode": scalar("sandbox_mode"),
        "nickname_candidates": nicks,
        "instructions": instructions,
    }
    for key in ("model", "model_reasoning_effort", "sandbox_mode"):
        if key in values and not parsed[key].strip():
            raise ValueError("Codex field '%s' must not be empty" % key)
    return parsed


# Collect hand-authored host agent files, keyed by subagent name, merging the
# Claude (.md) and Codex (.toml) sides. A same-name SSOT is an ownership
# conflict, never permission to overwrite the hand-authored projection.
def collect_adoptable():
    by_name = {}

    def consider(d, ext, kind):
        for path in host_agent_paths(d, ext):
            if not os.path.isfile(path):
                raise SystemExit("%s: expected a regular file" % rel(path))
            name = os.path.basename(path)[: -len(ext)]
            text = read_text(path)
            if is_generated_projection(path, text):
                continue  # a generated projection, not hand-authored
            if is_dir(os.path.join(SOURCE_DIR, name)):
                raise SystemExit(
                    "%s: hand-authored projection conflicts with existing .agents/subagents/%s; "
                    "resolve or remove it before projection" % (rel(path), name)
                )
            try:
                parsed = parse_claude_agent(text) if kind == "claude" else parse_codex_agent(text)
            except ValueError as error:
                raise SystemExit("%s: %s" % (rel(path), error))
            if parsed is None:
                label = "Claude" if kind == "claude" else "Codex"
                raise SystemExit("cannot parse %s as a %s agent" % (rel(path), label))
            e = by_name.get(name) or {"name": name}
            e[kind] = parsed
            e[kind + "_path"] = path
            by_name[name] = e

    consider(CLAUDE_DIR, ".md", "claude")
    consider(CODEX_DIR, ".toml", "codex")
    return by_name


# Prepare every adoptable host agent in memory. Main preflights the combined
# source/projection layout before write_imported() performs the first source write.
def prepare_hand_authored():
    adoptable = collect_adoptable()
    prepared = []
    for name, e in adoptable.items():
        cc = e.get("claude")
        cx = e.get("codex")
        if not cc and not cx:
            continue
        for kind, parsed, ext in (("Claude", cc, ".md"), ("Codex", cx, ".toml")):
            if not parsed:
                continue
            path = e[kind.lower() + "_path"]
            declared = parsed.get("name")
            if not declared:
                raise SystemExit("%s is missing required %s field 'name'" % (rel(path), kind))
            validate_agent_name(name, "%s filename" % rel(path))
            validate_agent_name(declared, rel(path))
            if declared != name:
                raise SystemExit(
                    "%s declares name '%s'; rename it to %s%s before --import"
                    % (rel(path), declared, name, ext)
                )
            if not str(parsed.get("description") or "").strip():
                raise SystemExit("subagent '%s': metadata.json needs a non-empty description" % name)
        if cc and cx:
            if cc["description"] != cx["description"]:
                raise SystemExit(
                    "subagent '%s': .claude/agents/%s.md and .codex/agents/%s.toml have different "
                    "descriptions; resolve the conflict before --import" % (name, name, name)
                )
            claude_instructions = normalize_instructions(cc.get("body") or "")
            codex_instructions = normalize_instructions(cx.get("instructions") or "")
            if claude_instructions != codex_instructions:
                raise SystemExit(
                    "subagent '%s': .claude/agents/%s.md and .codex/agents/%s.toml have different "
                    "instructions; resolve the conflict before --import" % (name, name, name)
                )
        meta = {"name": name, "description": (cc and cc["description"]) or (cx and cx["description"]) or ""}
        claude = {}
        if cc and cc.get("tools"):
            claude["tools"] = cc["tools"]
        if cc and cc.get("model"):
            claude["model"] = cc["model"]
        if claude:
            meta["claude"] = claude
        codex = {}
        if cx:
            if cx.get("model"):
                codex["model"] = cx["model"]
            if cx.get("model_reasoning_effort"):
                codex["model_reasoning_effort"] = cx["model_reasoning_effort"]
            if cx.get("sandbox_mode"):
                codex["sandbox_mode"] = cx["sandbox_mode"]
            if cx.get("nickname_candidates"):
                codex["nickname_candidates"] = cx["nickname_candidates"]
        if codex:
            meta["codex"] = codex
        instructions = validate_source(
            name,
            meta,
            cc["body"] if cc else (cx["instructions"] if cx else ""),
        )
        candidate = {"name": name, "meta": meta, "instructions": instructions}
        render_claude(candidate)
        render_codex(candidate)
        frm = " + ".join(x for x in [cc and ".claude/agents", cx and ".codex/agents"] if x)
        host_paths = {e[key] for key in ("claude_path", "codex_path") if key in e}
        prepared.append((candidate, frm, host_paths))
    return prepared


def validate_unique_names(subagents):
    seen = {}
    for sa in subagents:
        name = sa["name"]
        folded = name.casefold()
        if folded in seen:
            raise SystemExit(
                "subagent names '%s' and '%s' collide on case-insensitive filesystems"
                % (seen[folded], name)
            )
        seen[folded] = name


def preflight_directory(path):
    root = os.path.abspath(ROOT)
    current = os.path.abspath(path)
    try:
        inside = os.path.commonpath((root, current)) == root
    except ValueError:
        inside = False
    if not inside:
        raise SystemExit("managed path escapes the repository: %s" % path)
    while current != root:
        if os.path.lexists(current):
            if os.path.islink(current):
                raise SystemExit("%s: managed directory must not be a symlink" % rel(current))
            if not is_dir(current):
                raise SystemExit("%s: expected a directory" % rel(current))
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent


def preflight_import_sources(prepared):
    preflight_directory(SOURCE_DIR)
    for candidate, _frm, _host_paths in prepared:
        source_payloads(candidate)
        d = os.path.join(SOURCE_DIR, candidate["name"])
        if os.path.lexists(d):
            raise SystemExit("%s: expected a new source directory" % rel(d))


def canonical_path(path):
    return os.path.normcase(os.path.abspath(path))


def preflight_projection_targets(wanted, adopted_paths):
    for d in (CLAUDE_DIR, CODEX_DIR):
        preflight_directory(d)
    for w in wanted:
        path = w["path"]
        preflight_directory(os.path.dirname(path))
        if os.path.lexists(path):
            if not os.path.isfile(path):
                raise SystemExit("%s: expected a regular file" % rel(path))
            current = read_text(path)
            if current == w["content"]:
                continue
            if not is_generated_projection(path, current) and canonical_path(path) not in adopted_paths:
                name = os.path.splitext(os.path.basename(path))[0]
                raise SystemExit(
                    "%s: hand-authored projection conflicts with existing .agents/subagents/%s; "
                    "resolve or remove it before projection" % (rel(path), name)
                )


def preflight_stale(stale):
    contents = {}
    for path in stale:
        preflight_directory(os.path.dirname(path))
        if not os.path.isfile(path):
            raise SystemExit("%s: expected a regular file" % rel(path))
        try:
            contents[path] = read_text(path)
        except (OSError, UnicodeError) as error:
            raise SystemExit("%s: cannot read stale projection: %s" % (rel(path), error))
    return contents


def source_payloads(candidate):
    metadata = json.dumps(candidate["meta"], indent=2, ensure_ascii=False) + "\n"
    instructions = candidate["instructions"]
    try:
        metadata.encode("utf-8")
        instructions.encode("utf-8")
    except UnicodeEncodeError:
        raise SystemExit(
            "subagent '%s': source payload contains an invalid Unicode scalar value"
            % candidate["name"]
        )
    return metadata, instructions


def write_imported(prepared):
    for candidate, frm, _host_paths in prepared:
        name, meta, instructions = candidate["name"], candidate["meta"], candidate["instructions"]
        d = os.path.join(SOURCE_DIR, name)
        os.makedirs(d, exist_ok=True)
        metadata_payload, instructions_payload = source_payloads(candidate)
        write_text(os.path.join(d, "metadata.json"), metadata_payload)
        write_text(os.path.join(d, "instructions.md"), instructions_payload)
        print("adopted %s -> %s (from %s)" % (name, rel(d), frm))
    print(
        "--import: adopted %d hand-authored subagent(s) into %s" % (len(prepared), rel(SOURCE_DIR))
        if prepared
        else "--import: no hand-authored subagents to adopt"
    )


def main(argv):
    known = {"--check", "--import", "--preflight-import", "-h", "--help"}
    unknown = [argument for argument in argv if argument not in known]
    if unknown:
        print(
            "generate-subagents: unknown option(s): %s" % ", ".join(unknown),
            file=sys.stderr,
        )
        print("Run: python .agents/tools/generate-subagents.py --help", file=sys.stderr)
        return 2

    if "-h" in argv or "--help" in argv:
        print(
            "\n".join(
                [
                    "generate-subagents.py -- project .agents/subagents/ into Claude Code + Codex agent files.",
                    "",
                    "Usage:",
                    "  python generate-subagents.py           write .claude/agents/*.md + .codex/agents/*.toml",
                    "  python generate-subagents.py --check   exit 1 on drift (CI / pre-commit); writes nothing",
                    "  python generate-subagents.py --import  adopt hand-authored .claude/agents + .codex/agents into .agents/subagents/, then project",
                    "  python generate-subagents.py -h|--help show this help",
                    "",
                    "Source per subagent: .agents/subagents/<name>/{metadata.json, instructions.md}.",
                ]
            )
        )
        return 0

    check = "--check" in argv
    preflight_import = "--preflight-import" in argv and not check
    importing = ("--import" in argv or preflight_import) and not check
    existing = load_subagents()
    prepared = prepare_hand_authored() if importing else []
    adopted_paths = {
        canonical_path(path)
        for _candidate, _frm, host_paths in prepared
        for path in host_paths
    }
    subagents = sorted(
        existing + [candidate for candidate, _frm, _host_paths in prepared],
        key=lambda sa: sa["name"],
    )
    validate_unique_names(subagents)
    wanted = projections(subagents)
    stale = orphans(subagents)
    stale_contents = preflight_stale(stale)

    if check:
        drift = []
        for w in wanted:
            if not os.path.exists(w["path"]) or read_text(w["path"]) != w["content"]:
                drift.append(rel(w["path"]))
        for p in stale:
            hand = not is_generated_projection(p, stale_contents[p])
            note = "hand-authored; run --import to adopt" if hand else "no source"
            drift.append("%s (orphan -- %s)" % (rel(p), note))
        if drift:
            print("generate-subagents --check: DRIFT in %d file(s):" % len(drift), file=sys.stderr)
            for d in drift:
                print("  - %s" % d, file=sys.stderr)
            print("Run: python .agents/tools/generate-subagents.py", file=sys.stderr)
            return 1
        print(
            "generate-subagents --check: %d file(s) in sync (%d subagent(s))" % (len(wanted), len(subagents))
        )
        return 0

    # No source or projection is written until every candidate, render, parent
    # directory, target type, and ownership decision has passed preflight.
    if importing:
        preflight_import_sources(prepared)
    preflight_projection_targets(wanted, adopted_paths)

    if preflight_import:
        print("--preflight-import: deterministic subagent conflicts checked; no files written")
        return 0

    for d in (CLAUDE_DIR, CODEX_DIR):
        os.makedirs(d, exist_ok=True)
    if importing:
        write_imported(prepared)
    wrote = 0
    for w in wanted:
        if not os.path.exists(w["path"]) or read_text(w["path"]) != w["content"]:
            write_text(w["path"], w["content"])
            wrote += 1
    pruned = 0
    for p in stale:
        if is_generated_projection(p, stale_contents[p]):
            os.remove(p)
            pruned += 1
            print("pruned orphan %s" % rel(p))
        else:
            print(
                "kept %s -- hand-authored (no generated banner). Run --import to adopt it, or delete it by hand."
                % rel(p),
                file=sys.stderr,
            )
    print(
        "generate-subagents: %d subagent(s); %d file(s) written; %d unchanged; %d pruned"
        % (len(subagents), wrote, len(wanted) - wrote, pruned)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
