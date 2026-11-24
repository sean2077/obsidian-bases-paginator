<!-- agent-scaffold:convention=tools -->
# Command and tool conventions

Generic guide installed and refreshed by agent-scaffold; do not edit it here. The project's
documented commands, build files, and CI win where they are more specific; record
project-specific entries and effects there, not in this file.

- Use the project's existing entry points (Make/Just/Task targets, package scripts,
  documented commands) with their documented working directory and environment. Do not add
  wrappers or directories to standardize names.
- Before running an unfamiliar command, including a wrapper's `--help` or `--dry-run`, check
  its effects in source or documentation. Installing dependencies, starting or stopping
  services, publishing, touching devices or production, and changing global configuration
  need explicit authorization; discovering a command does not grant it.
- Keep established command-line, installed, CI, and service-bound interfaces stable. Moving
  or renaming a tool updates every caller (CI, docs, other scripts) in the same change or
  keeps a compatibility path.
- Keep internal helpers private to the targets that call them. Put a new standalone tool
  where the project already keeps standalone tools, and document its purpose, working
  directory, and effects next to the existing entries.
- Do not put project tools in `.agents/tools/`; that directory holds scaffold runtime.
- Change generated files through their generator, rerun its drift check, and review the
  diff. Never patch generated output as a durable fix.
- A configured command is not evidence that it ran. Report what you executed and its
  result separately from what you only inspected.
