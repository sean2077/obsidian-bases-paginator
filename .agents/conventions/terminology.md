<!-- agent-scaffold:convention=terminology -->
# Terminology conventions

Generic guide installed and refreshed by agent-scaffold; do not edit it here. The glossary
the project declares (otherwise root `CONTEXT-MAP.md`, then `CONTEXT.md`) owns the
definitions; this guide covers maintaining it. Adapted in part from MIT-licensed material;
see [NOTICE](NOTICE.md).

- Read only the contexts relevant to the task before using project terms. A canonical term
  and each recorded language equivalent are equally valid names; use avoided names only for
  history, search, or compatibility.
- Add a definition when a durable project concept is resolved from code, schemas, recurring
  scenarios, or an owner decision, not for a local variable name. Do not create an empty
  glossary or force a context map on a small project.
- Keep each definition with its language equivalents under one owner, in the glossary's
  existing entry format. One possible format:

  ```markdown
  **Worktree**:
  A checked-out Git working tree used for an isolated change.
  _Equivalent (zh-CN)_: 工作树
  _Avoid (en)_: workspace clone
  ```

- When meanings conflict, test them against concrete examples and keep the disagreement
  visible until the owner resolves it; do not silently pick a definition.
- For a rename, split, merge, or deprecation, update the owning definition, its equivalents,
  and active reader routes together, and keep historical and compatibility identifiers. A
  concept change does not authorize an API, wire, or database migration.
- Preserve exact code, protocol, vendor, and API identifiers at their owning boundaries.
- Use a `CONTEXT-MAP.md` with local glossaries only when distinct meanings or owners need
  separate contexts, and migrate definitions together with their equivalents and routes.
