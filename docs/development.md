# Development guide

This is the canonical contributor guide for Bases Paginator. Executable configuration and source code win if this page drifts; repair the page in the same change.

## Environment and commands

CI verifies current Node.js 20 and 22 releases. The development toolchain requires Node 20.19+, 22.13+, or 24+. Use npm and the checked-in lockfile.

| Task | Command | Notes |
|---|---|---|
| Clean dependency install | `npm ci` | Required before final verification. |
| Intentional dependency change | `npm install` | Review the matching lockfile diff and audit output. |
| Automated tests | `npm test` | Runs service, compatibility, rendering, DOM interaction, and release-contract tests. |
| Prepare host fixture | `npm run test:host:setup -- --target <absolute-test-vault> [--adopt]` | Idempotently writes only the tracked scenario fixture to an explicitly named disposable vault. |
| Obsidian host gate | `npm run test:host -- --vault <test-vault> --scenarios tests/fixtures/host-vault/scenarios.json` | Builds, deploys, and verifies the tracked matrix in a running Obsidian app through CLI/CDP. |
| Test watch mode | `npm run test:watch` | Local iteration only. |
| Preview/synchronize a release version | `npm run release:bump -- <version> [--dry-run]` | Requires a clean worktree; updates only the five version mirrors and never commits, tags, or pushes. |
| Verify a release snapshot | `npm run release:verify -- <version>` | Requires aligned version mirrors and a non-empty newest Changelog section; prints the exact release notes. |
| Formatting check | `npm run fmt:check` | Covers source, tests, host fixture/tooling, Dependabot, and root JSON/config files. |
| Lint | `npm run lint` | Applies Obsidian and TypeScript rules. |
| Production build | `npm run build` | Type-checks, then creates the minified local `main.js`. |
| Development watch | `npm run dev` | Rebuilds the ignored local bundle. |

`main.js` is generated and attached to releases but never committed. `manifest.json` and `styles.css` remain at the repository root because releases attach them directly.

## Product and compatibility boundary

The plugin contributes one missing capability: page navigation over the result set supplied to a custom Bases view. It is local, offline, read-only, and browser-compatible.

| Native Bases owns | This plugin owns |
|---|---|
| Search, typed filters, named views, sort, grouping configuration, property visibility/order/display names, result limit, copy/export | Page state, page size, group-preserving page slices, a bounded read-only table, accessible page controls |

Cell editing, selection, column resizing, summaries, and group collapsing belong to native Table's renderer and are not inherited by this custom view.

The compatibility decision was reviewed on 2026-11-24 against official channels. See the [dated review](./compatibility-review-2026-11-24.md) for evidence and verification limits:

- The public stable release was [Obsidian 1.15.1](https://obsidian.md/changelog/2026-11-12-desktop-v1.15.1/). Native Bases search is available in the 1.12 line, so `manifest.json:minAppVersion` remains 1.12.0.
- The project compiles against the published Obsidian 1.14.4 API types as a forward check. The runtime implementation continues to use 1.12-compatible public APIs.
- The settings tab returns declarative definitions for search and rendering on 1.13+, while retaining `display()` as the 1.12 fallback. This dual path adds settings search without raising the minimum app version.
- `BasesQueryResult.data` and `groupedData` already have native filters, sort, and result limit applied. Pagination cannot expose entries removed by that limit.
- Since 1.14.3, `groupOrder` controls manual ordering and visibility. Consume `groupedData` exactly as supplied, including an empty array for Hide all. Do not rebuild hidden groups from ungrouped `data`. Empty placeholder groups are omitted because this view paginates rows.

Recheck the [Obsidian changelog](https://obsidian.md/changelog/), [Bases view help](https://help.obsidian.md/bases/views), [table help](https://help.obsidian.md/bases/views/table), and [custom Bases view guide](https://docs.obsidian.md/plugins/guides/bases-view) before changing this boundary.

## Architecture

| Path | Responsibility |
|---|---|
| `src/main.ts` | Plugin lifecycle, Bases registration, settings persistence, and settings-tab registration. |
| `src/settings.ts` | Searchable 1.13+ setting definitions and the equivalent 1.12 imperative fallback. |
| `src/views/PaginatedTableView.ts` | Refreshes the native grouped-result snapshot and visible property order on each data update, owns its DOM container, and coordinates layout and rendering. |
| `src/views/viewOptions.ts` | Exposes only pagination-specific per-view options. |
| `src/services/Paginator.ts` | Rebuilds group offsets with `setGroups()` on data updates, then returns bounded group-preserving pages with `paginate()`. |
| `src/services/SettingsService.ts` | Validates plugin `data.json`, including the legacy shape. |
| `src/services/ViewSettingsService.ts` | Validates current view values and harmlessly ignores legacy keys. |
| `src/components/TableRenderer.ts` | Reuses current-page rows and unchanged headers, refreshes display names, delegates file-link events, and renders each non-file value with `Value.renderTo`. |
| `src/components/PaginationBar.ts` | Owns accessible page, direct-jump, and page-size controls. |
| `src/utils/` and `src/types.ts` | Stable identifiers, CSS names, small value/page helpers, and shared contracts. |

Keep the two rendering roles distinct: pass `app.renderContext` to `Value.renderTo`, because native values call its link/tag renderers at runtime; use the current `PaginatedTableView` as the `hoverParent` for custom file-link previews.

Call `Paginator.setGroups()` on every `onDataUpdated()`, even if an array has the same identity. Bases replaces result objects and entries across updates. Only page navigation may reuse the current snapshot. Indexing costs O(G) time and space for G groups without copying every row. Page selection costs O(log G + P), where P is the current page size. Rendering still costs O(P × C) for C visible columns, plus native value-rendering costs. Tests enforce bounded group access rather than timing thresholds.

Do not reuse cells or cache native `Value` output across data updates: `Value.renderTo()` has no public disposal contract for event handlers attached to a cell. Reuse table rows, but replace their cell contents. Use event delegation only for file links owned by this renderer, leaving native value links alone. Respect an empty `getOrder()` as Hide all instead of repopulating columns.

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

Tests use Vitest and jsdom with a narrow Obsidian API double. They cover the paginator interface, malformed and legacy settings, declarative setting definitions and persistence adapters, false/zero value handling, native value-render delegation, modifier-aware file links, bounded reusable DOM rows, header renaming, hidden properties/groups, snapshot refresh and disposal, direct-jump validation, page-size reading-position preservation, and 10,000-entry/10,000-group bounded-navigation cases.

The test double does not prove Obsidian lifecycle behavior, CSS layout, native rendering implementations, hover popovers, or mobile WebView behavior. Use the CLI-first host gate below for the real renderer, then perform only its named residual manual checks.

After dependency changes, also run:

```bash
npm audit
npm outdated
```

Major-version differences in `npm outdated` are not automatic upgrade instructions. Keep the toolchain on versions supported together by the current Obsidian sample/plugin guidance and CI Node matrix.

The scoped npm override for `@microsoft/eslint-plugin-sdl@1.1.0` selects `eslint-plugin-n` 17.24.0 within the same major. SDL 1.1.0 pins 17.10.3, which retains the vulnerable minimatch dependency. The maintained 17.x plugin removes that dependency and supports the existing ESLint 9/Node 20 and 22 toolchain. Reassess and remove the override when SDL releases an updated dependency declaration. Do not use `npm audit fix --force` to accept unrelated major changes or the audit resolver's obsolete-plugin downgrade.

## Obsidian CLI test-vault gate

Never develop or run these checks in a primary vault. Use an independent disposable test vault whose name contains `test`, `qa`, `sandbox`, or `disposable`, with Bases enabled and a fixture that renders at least two pages. The current full matrix requires Obsidian 1.14.3 or newer with its CLI enabled because it covers manual group order and visibility. The legacy single-fixture smoke form can still run on 1.12.7+.

Prepare the tracked fixture once, or whenever its specification changes. The target directory name must contain `test`, `qa`, `sandbox`, or `disposable`. A non-empty unmarked directory is rejected unless `--adopt` is explicit; adoption preserves unrelated files and later setup runs replace only marker-owned fixture files.

```bash
npm run test:host:setup -- --target "/absolute/path/to/obsidian-test-vault" --adopt
```

Open or register that vault in Obsidian, enable the CLI, and run the authoritative gate:

```bash
npm run test:host -- --vault obsidian-test-vault --scenarios tests/fixtures/host-vault/scenarios.json
```

The gate resolves only the explicit vault, asks Obsidian to ingest the prepared fixture, builds and deploys the current package below the vault's resolved config directory, and then remains read-only with respect to vault content. It uses `base:query` as the native data oracle and the real custom view for rendering evidence. For manual grouping, the fixture separately defines full query paths and visible ordered paths because the CLI may expose ungrouped query rows. The 16-scenario matrix covers empty, single, exact-boundary, limited, grouped multi-page, manual/hidden/null groups, hidden properties, malformed legacy, native-value, custom page-size, and 1,200-row cases. It also verifies disable/re-enable and repeated reloads, direct and embedded views, all-page path coverage, CDP mouse and keyboard navigation, direct page entry, invalid input, named accessibility roles, 390×844 mobile layout, advisory heap/timing evidence, and empty error buffers. Screenshots are written under `.oma/obsidian-host-test/`; every vault file outside the Obsidian config directory is hashed before and after.

The legacy single-fixture form remains available for quick compatibility smoke tests:

```bash
npm run test:host -- --vault obsidian-test-vault --base "Paginator QA.base" --embed "Dashboard.md"
```

The host gate intentionally stays out of GitHub Actions because it requires a running desktop Obsidian instance.

Prefer `dev:dom`, `eval`, `dev:cdp`, `dev:errors`, `dev:console`, and `dev:screenshot` for diagnosis and additional host evidence. Computer Use is a fallback only for OS-level dialogs or window chrome. Real screen-reader speech, OS focus behavior, hover timing outside the renderer, and physical iOS/Android behavior remain manual.

Vitest remains authoritative for isolated invalid values (`0`, negative, fractional, non-numeric, and over 1,000), modifier/middle-click routing, hover event payloads, settings persistence, and 10,000-entry/10,000-group paginator bounds. It also verifies that valid page-size changes retain the original first item, because exercising `config.set()` in the host would change `.base` content and violate the gate's byte-for-byte read-only rule. Add a tracked host scenario when a new behavior depends on real Bases data, lifecycle, rendering, CSS, or accessibility semantics.

Residual manual checks are limited to real screen-reader speech, OS-level window focus, hover timing outside the renderer, theme-specific visual judgment, and physical iOS/Android behavior. Use Computer Use only when one of those checks depends on OS dialogs or window chrome. Record the Obsidian version/channel, platform, fixture ID, JSON summary, screenshots, performance observations, and any residual checks relevant to the change.

## Release flow

Releases use a committed-snapshot boundary: the local release operation selects and prepares the exact version, while a pushed annotated tag triggers publication. `CHANGELOG.md` is the sole release-note authority. Tags are the bare version (`2.1.0`, not `v2.1.0`), so SemVer planning must enumerate reachable unprefixed tags instead of treating the repository as a first release.

Only run this flow after the user explicitly requests a release:

1. Fetch remote tags, require a clean attached `master`, and select the exact next version from Conventional Commit subjects and bodies. Apply the repository's unprefixed-tag rule when using a generic SemVer release procedure.
2. Create a `chore/release-<version>` worktree from `master` with `.agents/tools/worktree.sh new ... --trunk master`.
3. Preview and apply `npm run release:bump -- <version> --dry-run`, then `npm run release:bump -- <version>`. The command uses `npm version --no-git-tag-version --ignore-scripts` for `package.json` and `package-lock.json`, then synchronizes `manifest.json`, `src/version.ts`, and `versions.json`. It rolls those files back if synchronization fails.
4. Prepend exactly one dated `## [<exact-tag>]... (YYYY-MM-DD)` section to `CHANGELOG.md`. The complete unprefixed tag must match exactly and the date must be calendar-valid. Missing, malformed, duplicate, tag-mismatched, or empty sections are rejected; heading-like examples inside fenced code blocks are ignored.
5. Run `npm run release:verify -- <version>` and the full CI gate. Stage only `CHANGELOG.md` and the five version files, run `git diff --cached --check`, and create `release: <version>` plus an annotated `<version>` tag. Never move an existing tag.
6. Run the worktree helper's `done --trunk master` path so the release commit is merged and `master` is pushed first. Then push the tag without force.
7. Observe the tag-triggered Release workflow through completion. It requires an annotated tag whose commit is reachable from `origin/master`, revalidates the version mirrors and newest Changelog section, runs formatting/lint/tests/build, publishes or repairs the GitHub Release, uploads `main.js`, `manifest.json`, and `styles.css`, and attests all three assets. The workflow verifies the published body and asset names before reporting success.

The workflow is retry-safe for a partially created Release: after complete validation it atomically writes notes from the tagged Changelog, then rewrites the Release and uploads the three assets with replacement. It never calculates a version, edits repository files, commits, or creates a tag. Do not commit the generated bundle. If release automation changes, update the workflow, scripts, release tests, this section, and the root Agent contract together.

## Troubleshooting

- Missing `main.js`: run `npm run build` and confirm it exists at the plugin root.
- Missing view: check `manifest.json:minAppVersion` and enable the Bases core plugin.
- Fewer pageable rows than expected: inspect the native filters and result limit first.
- Stale page size: distinguish the plugin-wide default from the per-view `pageSize` value.
