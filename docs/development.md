# Development guide

This page is the canonical contributor guide for Bases Paginator. The executable configuration and source code win if this guide drifts; repair the guide in the same change.

## Environment and commands

Use a current Node.js LTS release and npm. The repository lockfile is required.

| Task | Command | Notes |
|---|---|---|
| Clean dependency install | `npm ci` | Reproduces `package-lock.json`; do not install ESLint globally. |
| Intentional dependency change | `npm install <package>` | Review and commit the matching lockfile change. |
| Development watch build | `npm run dev` | Writes the ignored `main.js` bundle with inline sourcemaps. |
| Formatting check | `npm run fmt:check` | Checks TypeScript under `src/`. |
| Lint | `npm run lint` | Uses the repository ESLint configuration. |
| Production build | `npm run build` | Runs TypeScript checking, then creates the minified release bundle. |

The plugin loads from top-level `main.js`, `manifest.json`, and `styles.css`. `main.js` is generated locally and attached to releases; it is not committed.

## Architecture

The plugin registers one custom Bases view and performs filtering, sorting, pagination, and rendering in the client.

| Path | Responsibility |
|---|---|
| `src/main.ts` | Plugin lifecycle, view registration, and plugin settings persistence. |
| `src/views/PaginatedTableView.ts` | Coordinates Bases data, view configuration, services, components, and render updates. |
| `src/views/viewOptions.ts` | Defines persisted Bases view-option keys and defaults. |
| `src/components/` | Owns DOM rendering and user interaction for the table, filters, presets, search, and pagination. |
| `src/services/` | Owns pagination and filtering state transformations without plugin lifecycle concerns. |
| `src/utils/` and `src/types.ts` | Own shared constants, value conversion, comparison helpers, and types. |
| `src/settings.ts` | Owns plugin-wide defaults and the Obsidian settings tab. |
| `styles.css` | Owns the plugin's shipped styling. |

There are two persistence boundaries:

- Plugin-wide defaults use `loadData()` and `saveData()`.
- Per-view options and filter presets use the Bases view configuration.

The table is intentionally read-only. Configuration writes are allowed; vault entry mutation is not.

## Implementation rules

- Keep `manifest.json:id` and the `VIEW_TYPE` value stable. Treat view-option keys and serialized preset fields as persisted APIs.
- Bundle runtime dependencies into `main.js`; keep Obsidian and its declared externals external as configured in `esbuild.config.mjs`.
- Preserve `isDesktopOnly: false`: use browser-compatible APIs and verify mobile-sensitive changes where feasible.
- Do not add network calls, telemetry, remote code, or transmission of vault content without an explicit feature decision, user opt-in, and README/settings disclosure.
- Defer heavy work until Bases supplies data. Avoid vault-wide scans and repeated work inside render/update paths.
- Register plugin-lifecycle events, DOM events, and intervals through Obsidian cleanup helpers. Component-local handlers must be released when their owning DOM is destroyed.
- Keep UI copy short, sentence case, and aligned with Obsidian terminology.
- Handle malformed persisted data and unavailable Bases capability without preventing the plugin from unloading cleanly.

## Verification

Run the CI-equivalent static gate before handoff:

```bash
npm run lint
npm run build
```

`npm run fmt:check` is available for intentional TypeScript formatting work, but formatting is not part of the current CI gate. If it reports untouched files, do not fold a repository-wide reformat into an unrelated change.

For user-visible or data-flow changes, manually copy `main.js`, `manifest.json`, and `styles.css` to `<Vault>/.obsidian/plugins/bases-paginator/`, reload Obsidian, and verify the affected paths. Select from this matrix according to the change:

- Enable and disable the plugin with the Bases core plugin both available and unavailable.
- Open a `.base` file and an embedded Base view.
- Exercise empty, single-page, and multi-page datasets.
- Exercise global search, quick filters, column filters, sorting, page-size changes, and preset save/update/delete.
- Check null, numeric, date, link, tag, and multi-value cells when filtering or rendering changes.
- Confirm plugin defaults survive reload and per-view options remain scoped to the view.
- Confirm unload/reload does not duplicate UI, listeners, or state.
- Check iOS or Android when changing browser compatibility, layout, touch interaction, or memory behavior.

## Release flow

Releases are automated by Semantic Release after the build workflow succeeds on `main` or `master`.

- Conventional commit types drive version selection and release notes.
- `.releaserc.yml` synchronizes `manifest.json`, `package.json`, `package-lock.json`, `src/version.ts`, and `versions.json`.
- Tags match the semantic version exactly and do not use a leading `v`.
- GitHub release assets are `main.js`, `manifest.json`, and `styles.css`.
- Never change the published plugin ID.
- Do not commit the generated bundle; the release workflow builds and uploads it.

Do not manually reproduce part of this flow. If release automation changes, update `.releaserc.yml`, the workflow, and this section together.

## Troubleshooting and references

- Missing `main.js`: run `npm run build` and confirm the artifact is at the plugin root.
- Missing view: confirm the installed Obsidian version satisfies `manifest.json:minAppVersion` and the Bases core plugin is enabled.
- Stale UI or settings: reload Obsidian, then verify whether the value belongs to plugin data or per-view Bases configuration.

Canonical external requirements:

- [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Obsidian developer policies](https://docs.obsidian.md/Developer+policies)
- [Obsidian style guide](https://help.obsidian.md/style-guide)
