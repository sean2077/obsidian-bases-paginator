# Bases Paginator — agent work contract

## Product boundary

- This is a local, offline Obsidian community plugin that adds true page navigation to Bases and delegates query controls to native Bases.
- Preserve the read-only product boundary: view and plugin settings may be persisted, but the plugin must not modify vault entries.
- Keep desktop and mobile compatibility. Use Obsidian/browser APIs; do not add Node.js, Electron, network, telemetry, or external-service dependencies without explicit approval and disclosure.
- Treat `manifest.json:id` and `src/utils/constants.ts:VIEW_TYPE` as stable external identifiers. Do not rename them without an explicit migration and release decision.

## Authority and navigation

- [`README.md`](README.md) owns user-facing behavior, limitations, installation, and usage.
- [`docs/development.md`](docs/development.md) owns contributor setup, architecture, implementation guidance, manual verification, and release details.
- `package.json`, `manifest.json`, `.releaserc.yml`, workflows, and source code remain authoritative for executable behavior and current values; do not duplicate volatile versions or option lists here.
- The repository trunk is `master`; pass `--trunk master` to the scaffold worktree helper where its managed generic default says `main`.
- Update `README.md` when user-visible behavior changes, update the development guide when contributor workflows or architecture change, and edit this contract only when future Agent behavior must change.

## Required workflow

- Use npm and the checked-in lockfile. Use `npm ci` for a clean dependency install; use `npm install` only when intentionally changing dependencies.
- Before handoff, run `npm run fmt:check`, `npm run lint`, `npm test`, and `npm run build`; these match the repository's CI gate.
- UI or data-flow changes also require the tracked CLI scenario gate in the development guide and any relevant residual manual checks. Prepare its fixture only through `test:host:setup` in an explicitly named disposable vault; the verification job must leave vault content unchanged.
- Never commit `node_modules/`, generated `main.js`, or sourcemaps. Keep `manifest.json` and `styles.css` at the repository root because releases attach them directly.

## Engineering invariants

- Keep `src/main.ts` limited to plugin lifecycle, Bases view registration, settings loading/saving, and settings-tab registration.
- Keep view orchestration in `src/views/`, DOM rendering and interaction in `src/components/`, state transformations in `src/services/`, and reusable value logic in `src/utils/`.
- Preserve existing view-option keys and persisted-setting shapes, or provide backward-compatible migration handling.
- Keep startup light, avoid vault-wide scans, handle missing Bases capability gracefully, and clean up lifecycle-owned listeners or intervals with Obsidian registration helpers.
- Keep in-app copy short and sentence case. Follow the existing TypeScript, ESLint, and Prettier configuration rather than introducing parallel style rules.

## Release boundary

- Semantic Release owns version calculation, synchronized version files, tags without a leading `v`, release commits, and GitHub release assets.
- Do not manually bump versions, create tags, or publish a release unless the user explicitly requests that release workflow.

<!-- agent-scaffold:start — managed by the agent-scaffold skill. Edit project prose OUTSIDE these markers; `agent-scaffold upgrade` refreshes this block. -->
## Agent Harness (Claude Code + Codex)

This repo carries a vendored, dual-host agent harness. `.agents/` is the single source of truth (SSOT); `.claude/` and `.codex/` are wired to the **same** implementations under `.agents/tools/`.

### Worktree-per-change (hard rule)

**Never edit trunk (`main`) directly** — every change, however small ("just docs" is NOT an exception), starts in its own worktree cut from the trunk tip:

```bash
bash .agents/tools/worktree.sh new <name>   # edit inside .worktrees/<name>/  (branch feat|fix|docs|chore/<name>)
bash .agents/tools/worktree.sh done         # merge back to local trunk (--no-ff) + clean up + ff-only push
```

`.agents/tools/hooks/trunk_edit_guard.sh` (PreToolUse) mechanically blocks edits to tracked files while on trunk. Escape hatch — only when the user explicitly authorizes a trunk edit: `touch .claude/allow-trunk-edit` (auto-expires in 2 h) or `WORKTREE_ALLOW_TRUNK_EDIT=1`.

### Authority documents (hard rules)

`AGENTS.md` is the canonical repository-level contract for Agent work. Read and follow the root contract and its applicable nested contract chain before acting; higher-priority instructions still govern.

- **Keep it current.** When a durable change affects an Agent-relevant command, invariant, ownership boundary, risk boundary, or navigation path, update or remove the affected contract guidance in the same change. If the detail lives in linked project docs, update it there and keep the contract summary and link accurate.
- **Keep it lean.** Keep only concise, actionable guidance that changes Agent behavior and is frequently needed or costly to miss. Move explanations, rationale, history, long procedures, examples, and low-frequency detail to project docs and link to it.
- **Keep scopes honest.** Root rules are project-wide. Create a nested `AGENTS.md` only for a concrete local difference from the nearest ancestor; directory structure alone never justifies one.
- **Resolve conflicts explicitly.** If applicable instructions conflict, or contract guidance disagrees with verified repository facts, do not guess or silently ignore either. Surface the conflict, follow higher-priority instructions, request owner direction when authority is unclear, and repair stale guidance in the same change when authorized.

The authority-document budget hook remains advisory; projects may override its default line and character limits when justified.

### SSOT layout

| Path | Role | Commit? |
|---|---|---|
| `.agents/skills/<name>/SKILL.md` | project skill source | ✅ |
| `.agents/subagents/<name>/{metadata.json,instructions.md}` | subagent source | ✅ |
| `.claude/skills/<name>` | symlink → `.agents/skills/<name>` (CC discovery; Codex reads `.agents/` directly) | ✅ |
| `.claude/agents/*.md`, `.codex/agents/*.toml` | **generated** subagent projections — do NOT hand-edit | ✅ |
| `.agents/tools/hooks/` | scaffold-managed hook runtime (doc budget + optional trunk guard) | ✅ |
| `.agents/tools/worktree.sh` | worktree lifecycle | ✅ |
| `.claude/allow-trunk-edit` | worktree escape hatch | ❌ ignored |
| `.claude/settings.local.json` | personal overrides | ❌ ignored |

- **Add a skill**: edit `.agents/skills/` → run `bash .agents/relink-skills.sh` → commit source + symlink.
- **Add a subagent** (needs python): edit `.agents/subagents/` → run `python .agents/tools/generate-subagents.py` → commit source + generated. Wire `--check` into the project's own CI or hook manager when desired.
- **Third-party skills** follow project-owned placement and installation policy. The relinker manages only names sourced from `.agents/skills/`, preserves unrelated entries, and fails on same-name ownership conflicts.

**Codex trust**: project-level `.codex/` (config + hooks + agents) only loads for a **trusted** project; until trusted it is silently skipped. Trust once: run `codex` here and accept, or add `[projects."<repo abs path>"] trust_level = "trusted"` to `~/.codex/config.toml`.
<!-- agent-scaffold:end -->
