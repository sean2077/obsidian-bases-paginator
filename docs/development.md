# Development guide

This is the canonical contributor guide for Bases Paginator. Executable configuration and source code win if this page drifts; repair the page in the same change.

## Environment and commands

CI verifies current Node.js 20 and 22 releases. Use npm and the checked-in lockfile.

| Task | Command | Notes |
|---|---|---|
| Clean dependency install | `npm ci` | Required before final verification. |
| Intentional dependency change | `npm install` | Review the matching lockfile diff and audit output. |
| Automated tests | `npm test` | Runs service, compatibility, rendering, and DOM interaction tests. |
| Obsidian host smoke | `npm run test:host -- --vault <test-vault> --base <fixture.base> --embed <fixture.md>` | Builds, deploys, and verifies the plugin in a running disposable vault through Obsidian CLI/CDP. |
| Test watch mode | `npm run test:watch` | Local iteration only. |
| Formatting check | `npm run fmt:check` | Covers source, tests, and root JSON/config files. |
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

Run the repeatable host smoke first:

```bash
npm run test:host -- --vault obsidian-test-vault --base "Paginator QA.base" --embed "Dashboard.md"
```

The command builds and copies `main.js`, `manifest.json`, and `styles.css` into the named vault's plugin directory, reloads the plugin twice, opens the direct and embedded fixtures, navigates through CDP mouse input, checks the accessibility tree and error buffers, captures desktop and 390×844 mobile screenshots under `.oma/obsidian-host-test/`, and verifies that `.md`, `.base`, and `.canvas` hashes did not change. It intentionally stays out of GitHub Actions because it requires a running desktop Obsidian instance.

Prefer `dev:dom`, `eval`, `dev:cdp`, `dev:errors`, `dev:console`, and `dev:screenshot` for the remaining matrix. Computer Use is a fallback only for OS-level dialogs or window chrome. Real screen-reader speech, OS focus behavior, hover timing outside the renderer, and physical iOS/Android behavior remain manual.

Required matrix for user-visible or data-flow changes:

1. Enable, disable, reload, and re-enable the plugin; confirm there is one view registration and no duplicated controls or console errors.
2. Open both a `.base` file and an embedded named view. Confirm empty, one-row, one-page, exact-boundary, and multi-page data.
3. Test page sizes 10/25/50/100 and custom values 1, 37, 1,000; reject 0, negative, non-numeric, and values over 1,000.
4. Apply native search, typed filters, multi-sort, property order, and grouping. Confirm the paginated result keeps native order and repeats the correct group heading when a group spans pages.
5. Set a restrictive native result limit, confirm the documented truncated total, then remove/raise it and confirm all filtered entries become pageable.
6. Include null, empty, `0`, `false`, number, date, formula, tag, link, alias, list-with-commas, image, and error values. Confirm native rendering and no uncaught exception.
7. Activate links with plain click, modifier-click, middle-click, and hover preview. Confirm the expected workspace target and no vault writes.
8. Change plugin defaults and per-view options, reload, and confirm scope/persistence. Open a legacy `.base` containing retired keys and malformed legacy preset text; confirm it renders and the file is not rewritten.
9. Test keyboard-only navigation, focus visibility, screen-reader names/status, light/dark themes, a narrow desktop pane, and an iOS or Android device/emulator.
10. Compare test-vault note/frontmatter contents before and after the run; only plugin settings or explicitly changed view pagination options may differ.

Record the Obsidian version/channel, platform, vault fixture, host-smoke JSON summary, residual observations, and any console warning. Do not claim the full gate from Vitest or the host smoke alone when the change touches a residual manual boundary.

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
