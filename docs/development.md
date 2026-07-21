# Development guide

This is the canonical contributor guide for Bases Paginator. Executable configuration and source code win if this page drifts; repair the page in the same change.

## Environment and commands

CI verifies current Node.js 20 and 22 releases. Use npm and the checked-in lockfile.

| Task | Command | Notes |
|---|---|---|
| Clean dependency install | `npm ci` | Required before final verification. |
| Intentional dependency change | `npm install` | Review the matching lockfile diff and audit output. |
| Automated tests | `npm test` | Runs service, compatibility, rendering, and DOM interaction tests. |
| Prepare host fixture | `npm run test:host:setup -- --target <absolute-test-vault> [--adopt]` | Idempotently writes only the tracked scenario fixture to an explicitly named disposable vault. |
| Obsidian host gate | `npm run test:host -- --vault <test-vault> --scenarios tests/fixtures/host-vault/scenarios.json` | Builds, deploys, and verifies the tracked matrix in a running Obsidian app through CLI/CDP. |
| Test watch mode | `npm run test:watch` | Local iteration only. |
| Formatting check | `npm run fmt:check` | Covers source, tests, host fixture/tooling, Dependabot, and root JSON/config files. |
| Lint | `npm run lint` | Applies Obsidian and TypeScript rules. |
| Production build | `npm run build` | Type-checks, then creates the minified local `main.js`. |
| Development watch | `npm run dev` | Rebuilds the ignored local bundle. |

`main.js` is generated and attached to releases but never committed. `manifest.json` and `styles.css` remain at the repository root because releases attach them directly.

## Product and compatibility boundary

The plugin contributes one missing capability: page navigation over the result set supplied to a custom Bases view. It is local, offline, read-only, and browser-compatible.

| Native Bases owns | This plugin owns |
|---|---|
| Search, typed filters, named views, sort, grouping configuration, property order/width, result limit, summaries, selection, copy/export | Page state, page size, group-preserving page slices, a bounded read-only table, accessible page controls |

The compatibility decision was reviewed on 2026-07-21 against official channels:

- The public changelog listed Obsidian 1.12.7 as public stable. Native Bases search is available in the 1.12 line, so `manifest.json:minAppVersion` is 1.12.0.
- Obsidian 1.13.2 was Catalyst. The project compiles against current API types as a forward check but does not require 1.13-only behavior.
- Declarative settings remain deferred while 1.13 is not the public baseline. The targeted lint rule is disabled only for `src/settings.ts`; revisit it after the minimum app version reaches a public release that supports the API.
- `BasesQueryResult.data` and `groupedData` already have native filters, sort, and result limit applied. Pagination cannot expose entries removed by that limit.

Recheck the [Obsidian changelog](https://obsidian.md/changelog/), [Bases view help](https://help.obsidian.md/bases/views), [table help](https://help.obsidian.md/bases/views/table), and [custom Bases view guide](https://docs.obsidian.md/plugins/guides/bases-view) before changing this boundary.

## Architecture

| Path | Responsibility |
|---|---|
| `src/main.ts` | Plugin lifecycle, Bases registration, settings persistence, and settings-tab registration. |
| `src/views/PaginatedTableView.ts` | Adapts native grouped results and coordinates layout and rendering. |
| `src/views/viewOptions.ts` | Exposes only pagination-specific per-view options. |
| `src/services/Paginator.ts` | Returns page state and a bounded group-preserving slice through one interface. |
| `src/services/SettingsService.ts` | Validates plugin `data.json`, including the legacy shape. |
| `src/services/ViewSettingsService.ts` | Validates current view values and harmlessly ignores legacy keys. |
| `src/components/TableRenderer.ts` | Reuses current-page DOM, trims peak-only rows, and delegates each non-file value to `Value.renderTo`. |
| `src/components/PaginationBar.ts` | Owns accessible page and page-size controls. |
| `src/utils/` and `src/types.ts` | Stable identifiers, CSS names, small value/page helpers, and shared contracts. |

Keep the two rendering roles distinct: pass `app.renderContext` to `Value.renderTo`, because native values call its link/tag renderers at runtime; use the current `PaginatedTableView` as the `hoverParent` for custom file-link previews.

There are two allowed write boundaries:

- Plugin defaults use `loadData()` and `saveData()`.
- Current per-view pagination options use `BasesViewConfig.set()`.

The plugin must not modify note content, frontmatter, `.base` filters, native sort/group settings, or other vault entries. Legacy custom-view keys are read as unknown extra data and left untouched.

## Automated verification

Run the full CI gate before handoff:

```bash
npm run fmt:check
npm run lint
npm test
npm run build
```

Tests use Vitest and jsdom with a narrow Obsidian API double. They cover the paginator interface, malformed and legacy settings, false/zero value handling, native value-render delegation, modifier-aware file links, bounded reusable DOM rows, accessible control names, keyboard page-size input, and a 10,000-entry bounded-page case.

The test double does not prove Obsidian lifecycle behavior, CSS layout, native rendering implementations, hover popovers, or mobile WebView behavior. Use the CLI-first host gate below for the real renderer, then perform only its named residual manual checks.

After dependency changes, also run:

```bash
npm audit
npm outdated
```

Major-version differences in `npm outdated` are not automatic upgrade instructions. Keep the toolchain on versions supported together by the current Obsidian sample/plugin guidance and CI Node matrix.

## Obsidian CLI test-vault gate

Never develop or run these checks in a primary vault. Use an independent disposable test vault whose name contains `test`, `qa`, `sandbox`, or `disposable`, with Bases enabled and a fixture that renders at least two pages. Obsidian 1.12.7 or newer must be running with its CLI enabled.

Prepare the tracked fixture once, or whenever its specification changes. The target directory name must contain `test`, `qa`, `sandbox`, or `disposable`. A non-empty unmarked directory is rejected unless `--adopt` is explicit; adoption preserves unrelated files and later setup runs replace only marker-owned fixture files.

```bash
npm run test:host:setup -- --target "/absolute/path/to/obsidian-test-vault" --adopt
```

Open or register that vault in Obsidian, enable the CLI, and run the authoritative gate:

```bash
npm run test:host -- --vault obsidian-test-vault --scenarios tests/fixtures/host-vault/scenarios.json
```

The gate resolves only the explicit vault, asks Obsidian to ingest the prepared fixture, builds and deploys the current package below the vault's resolved config directory, and then remains read-only with respect to vault content. It uses `base:query` as the native data oracle and the real custom view for rendering evidence. The tracked matrix covers empty, single, exact-boundary, limited, grouped multi-page, malformed legacy, native-value, custom page-size, and 1,200-row cases. It also verifies disable/re-enable and repeated reloads, direct and embedded views, all-page path coverage, CDP mouse and keyboard navigation, invalid custom input, named accessibility roles, 390×844 mobile layout, advisory heap/timing evidence, and empty error buffers. Screenshots are written under `.oma/obsidian-host-test/`; every vault file outside the Obsidian config directory is hashed before and after.

The legacy single-fixture form remains available for quick compatibility smoke tests:

```bash
npm run test:host -- --vault obsidian-test-vault --base "Paginator QA.base" --embed "Dashboard.md"
```

The host gate intentionally stays out of GitHub Actions because it requires a running desktop Obsidian instance.

Prefer `dev:dom`, `eval`, `dev:cdp`, `dev:errors`, `dev:console`, and `dev:screenshot` for diagnosis and additional host evidence. Computer Use is a fallback only for OS-level dialogs or window chrome. Real screen-reader speech, OS focus behavior, hover timing outside the renderer, and physical iOS/Android behavior remain manual.

Vitest remains authoritative for isolated invalid values (`0`, negative, fractional, non-numeric, and over 1,000), modifier/middle-click routing, hover event payloads, settings persistence, and 10,000-entry paginator bounds. Add a tracked host scenario when a new behavior depends on real Bases data, lifecycle, rendering, CSS, or accessibility semantics.

Residual manual checks are limited to real screen-reader speech, OS-level window focus, hover timing outside the renderer, theme-specific visual judgment, and physical iOS/Android behavior. Use Computer Use only when one of those checks depends on OS dialogs or window chrome. Record the Obsidian version/channel, platform, fixture ID, JSON summary, screenshots, performance observations, and any residual checks relevant to the change.

## Release flow

Semantic Release runs after the Node.js build workflow succeeds on `main` or `master`.

- Conventional commits determine the version and release notes.
- `.releaserc.yml` synchronizes `manifest.json`, `package.json`, `package-lock.json`, `src/version.ts`, and `versions.json`.
- Tags have no leading `v`.
- GitHub release assets are `main.js`, `manifest.json`, and `styles.css`.
- Never commit the generated bundle or manually change published identifiers.

Do not manually reproduce only part of the release flow. If release automation changes, update the workflow, `.releaserc.yml`, and this section together.

## Troubleshooting

- Missing `main.js`: run `npm run build` and confirm it exists at the plugin root.
- Missing view: check `manifest.json:minAppVersion` and enable the Bases core plugin.
- Fewer pageable rows than expected: inspect the native filters and result limit first.
- Stale page size: distinguish the plugin-wide default from the per-view `pageSize` value.
