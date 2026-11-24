# Bases Paginator — agent work contract

## Product boundary

- This is a local, offline Obsidian community plugin that adds true page navigation to Bases and delegates query controls to native Bases.
- Preserve the read-only product boundary: view and plugin settings may be persisted, but the plugin must not modify vault entries.
- Keep desktop and mobile compatibility. Use Obsidian/browser APIs; do not add Node.js, Electron, network, telemetry, or external-service dependencies without explicit approval and disclosure.
- Treat `manifest.json:id` and `src/utils/constants.ts:VIEW_TYPE` as stable external identifiers. Do not rename them without an explicit migration and release decision.

## Authority and navigation

- [`README.md`](README.md) owns user-facing behavior, limitations, installation, and usage.
- [`docs/development.md`](docs/development.md) owns contributor setup, architecture, implementation guidance, manual verification, and release details.
- `package.json`, `manifest.json`, `versions.json`, release scripts, workflows, and source code remain authoritative for executable behavior and current values; `CHANGELOG.md` owns release notes. Do not duplicate volatile versions or option lists here.
- The repository trunk is `master`; the scaffold worktree helper resolves the primary worktree branch, and `--trunk master` remains an explicit override.
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

- A locally prepared release snapshot owns the exact version, newest `CHANGELOG.md` section, synchronized version files, release commit, and annotated tag. The complete unprefixed tag is the shared identity across those files, CI, and GitHub Release; account for it when a generic SemVer analyzer recognizes only `v`-prefixed tags.
- Push the release snapshot to `master` before pushing its tag. The tag workflow validates the committed snapshot, extracts that Changelog section, builds and attests `main.js`, `manifest.json`, and `styles.css`, and creates or repairs the matching GitHub Release.
- Do not bump versions, create or push tags, or publish a release unless the user explicitly requests that release workflow.

<!-- agent-scaffold:start (managed; edit outside) profile=default domains=docs,tools,testing,specs,terminology,git,release,environment -->
## Agent Harness

`.agents/` is the harness source; `.claude/` and `.codex/` hold generated projections. `CLAUDE.md` links to this contract.

### Session and task context

Honor the user's session entry; prefer task-local implementation/review. Resolve the task checkout and revision; use its `AGENTS.md` chain, terminology, skills, and tool working directories. Pass peers its absolute path and review revision. A shell `cd` does not reload host instructions or permissions; resolve access or guidance conflicts explicitly.

### Worktree-per-change (hard rule)

Never edit the primary worktree, including docs. Reuse an assigned linked worktree; otherwise, if the scaffold owns creation, run `bash .agents/tools/worktree.sh new <name>`.

Keep one lifecycle owner. `done --dir <absolute-wt>` merges, ff-only pushes, and removes the worktree; it requires explicit authorization and scaffold ownership, runs outside that worktree, and is not a PR/MR handoff. Leave externally managed worktrees to their owner instead of merging or cleaning them up. Bypass the trunk guard only with explicit user approval.

Release the owning shell/session's directory handle before removal; a child `cd` cannot release its Windows handle. If `done` reports cleanup pending (exit 3), release the handle and use `cleanup --dir <absolute-wt>` for the empty unregistered `.worktrees/<name>` residue.

### Authority documents (hard rules)

`AGENTS.md` is the canonical repository-level Agent contract; read the applicable nested chain before acting. Keep it lean and current; route detail to project docs and nest only for real local differences. Repair durable guidance drift in the same change; follow higher-priority instructions and surface material disagreement instead of guessing. Interpret document status and freshness alongside repository evidence and user intent.

### Project terminology (hard rule)

Every Agent, project skill, and subagent uses the declared glossary, else root `CONTEXT-MAP.md`, then `CONTEXT.md`; read only relevant contexts before using project terms. A term and each language equivalent are equally valid names for one concept — use whichever is clearest and do not force one language. Reserve avoided names for history or compatibility. Resolve durable term changes with evidence and owner intent; update the glossary in the same change. Adopt an existing glossary; add definitions as durable concepts are resolved.

### Convention guides

Before the matching work, read its generic guide; project documentation and nested contracts win where they are more specific.

- Documentation: `.agents/conventions/docs.md`
- Commands and tools: `.agents/conventions/tools.md`
- Tests: `.agents/conventions/testing.md`
- Specifications and design records: `.agents/conventions/specs.md`
- Glossary changes: `.agents/conventions/terminology.md`
- Commits and delivery: `.agents/conventions/git.md`
- Version bumps, tags, and publication: `.agents/tools/release/README.md`
- Setup and shared environments: `.agents/conventions/environment.md`

### Sources and projections

- Edit skills in `.agents/skills/`, then run `bash .agents/relink-skills.sh`; commit source and symlinks.
- Edit subagents in `.agents/subagents/`, then run `python .agents/tools/generate-subagents.py`; commit source and projections.
- Do not hand-edit host projections or scaffold runtime (`.agents/tools/**`, `.agents/conventions/**`, `.agents/relink-skills.sh`, `.agents/symlink-manager.py`); use `agent-scaffold upgrade`, then `agent-scaffold verify`.
- **Third-party skills** follow project-owned placement and installation policy; preserve unrelated entries.

For Codex, confirm project trust, agent discovery, and `/hooks` approval; re-review changed definitions. Restore symlink/hardlink targets with Git, not Claude checkpoints.
<!-- agent-scaffold:end -->
