# Bases Paginator review — 2026-11-24

## Decision

Keep the plugin as a small, read-only pagination view. Its useful distinction is predictable page navigation, including direct jumps, over the rows supplied by Bases. Native Bases already covers the query and editing features that would make a second general-purpose table expensive to maintain.

This review starts from `master` commit `c301407` and plugin version 2.0.5. The earlier 2.0 refactor had already removed local search and filters, adopted native value rendering, and separated lifecycle, view, renderer, and state responsibilities. Those are existing strengths, not features introduced by this change.

## Current Obsidian capability

The latest public desktop release checked was [Obsidian 1.15.1, published November 12, 2026](https://obsidian.md/changelog/2026-11-12-desktop-v1.15.1/). The [official Bases view documentation](https://help.obsidian.md/bases/views) describes a result limit, but does not document next/previous-page navigation. Limiting results and paging through all results remain different operations.

| Capability | Assessment for this plugin |
|---|---|
| Search, filters, sort, named views, property order and display names | Use the native toolbar and API. Reimplementing them would duplicate native behavior and lag behind host improvements. |
| Manual group order, hidden groups, empty groups | Added to native Bases in [1.14.3](https://obsidian.md/changelog/2026-09-29-desktop-v1.14.3/). Respect the supplied visible group sequence. Empty placeholders contain no pageable rows and remain intentionally omitted. |
| Filter reordering and search feedback about limited matches | Improved in [1.15](https://obsidian.md/changelog/2026-11-02-desktop-v1.15.0/). Retaining native query controls inherits these improvements. |
| Editing, multi-cell selection, summaries, column resizing | Native [Table](https://help.obsidian.md/bases/views/table) features. They are not inherited by a custom renderer and are outside this plugin's read-only boundary. |
| Real page navigation and direct jumps | The focused capability worth retaining here. |

The public [`BasesQueryResult` and `BasesView` contracts](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) are important constraints:

- Query results have already had native sorting and the result limit applied. The plugin cannot recover rows omitted upstream.
- `groupedData` is the display source, including the host's group visibility and order. Do not fall back to ungrouped results when it is empty.
- Bases replaces its result and entries on data/configuration updates. Cached entries are valid only until the next `onDataUpdated()`.
- The public `QueryController` does not expose an offset/query-pagination hook. Replacing the native Table's data flow would require a different, more fragile integration strategy.

The application version and API package version are different: this change compiles against the current published `obsidian` types, 1.14.4. It does not raise the plugin's minimum application version from 1.12.0. The existing 1.12 settings fallback and 1.13+ searchable settings definitions remain in place.

### Alternative: native-view enhancements

[Bases Utilities](https://community.obsidian.md/plugins/bases-utilities) is an existing alternative that adds pagination to native Table, Cards, and List views while preserving editing. Its [implementation at the reviewed commit](https://github.com/BagOfTips/Bases-Utilities/blob/a637b95c0a6d67d66cc55b2dfd66e191f5b0e16c/main.js) locates internal query controllers through component trees and replaces the result prototype's `applyLimit` method. It restores that method during cleanup.

That offers a real functional advantage for users who need editable pagination. It also introduces coupling to private controller methods and native DOM classes, which can require extra work when Obsidian changes. This is an architectural risk assessment, not evidence that the alternative is currently unstable or slower. No host performance comparison was possible here. Bases Paginator's defensible distinction is its public custom-view API, explicit read-only scope, and limited integration surface, rather than being the only pagination option.

## Implemented improvements

| Area | Previous behavior | Change |
|---|---|---|
| Grouped navigation | Every page request read/mapped all native groups, recounted them, and scanned earlier groups. | Snapshot groups once per host update, index cumulative row offsets, and use binary search to reach the requested page. |
| Page-size changes | Retained the old page number, moving the reader to a different part of the result. | Keep the original first item within the newly sized page. Explicit page requests still take precedence. |
| Navigation | Four directional buttons only. | Add a named numeric jump control with Enter/change submission, validation, cancellation, and empty-result disabling. |
| Input stability | An unrelated data refresh could hide or overwrite unfinished custom-size input. | Preserve focused drafts when the effective value/bounds have not changed. |
| Property visibility | An empty native order fell back to result properties. | Respect Hide all and show `No properties selected`. The host supplies its own default order when no order was configured. |
| Property names | Header refresh compared only property IDs. | Refresh changed display names without replacing unchanged header cells. |
| Empty group values | A single null-valued group could lose its group heading. | Distinguish the public undefined ungrouped key from a `NullValue` group. Do not attempt to retrieve native `groupBy` through custom option accessors. |
| Literal text | The string `"null"` was treated as an absent value. | Use the public `NullValue` type for null detection and preserve literal text, zero, and false. |
| File links | Each rendered file link allocated its own click, auxiliary-click, and hover closures. | Delegate these three event types from the table body, only for links created by the plugin. Native property links keep their own handlers. |
| View lifetime | Applied the plugin container class to a host-owned element. | Own and remove a dedicated child container, and release indexed data on unload. |
| Narrow layouts | Phone-specific rules depended only on the window width. | Add flex minimum-size constraints and container queries so narrow desktop splits also adapt, with visible focus and larger touch targets. |

No note editing, vault scan, network client, telemetry, background timer, framework, or runtime dependency was added. Stable plugin/view identifiers, persisted option keys, legacy settings, and the release version remain unchanged.

Development dependencies were also audited. Compatible lockfile updates, the current Obsidian ESLint plugin, and one narrowly scoped same-major dependency override remove the findings detected in the old toolchain. The [development guide](./development.md) records the override's upstream cause and removal condition. ESLint, TypeScript, jsdom, and Vitest keep their existing major lines.

## Performance interpretation

Let G be the number of groups, P the number of rows on one page, and C the number of visible columns.

| Work | Before | After |
|---|---|---|
| A native data/configuration update | O(G), plus page rendering | O(G) index refresh, plus page rendering |
| Selecting another page | O(G + P) selection, plus rendering | O(log G + P) selection, plus rendering |
| Native value rendering | O(P × C), plus each value's own work | O(P × C), plus each value's own work |
| Extra long-lived pagination storage | Page state | O(G) offsets/references, without copying every row |

The benefit is most relevant when many small groups precede the requested page. A single large group was already inexpensive to slice. Tests check 10,000 groups and verify that navigation accesses only the current page's entries. They also check 10,000 rows, cross-group boundaries, same-array mutation followed by refresh, and page-size changes.

This is an improvement to this plugin's own work, not a claim that it beats the native renderer or speeds up Bases query evaluation. Native filters, sorting, and formulas still execute upstream. Images and wide tables can still make a 1,000-row page expensive. The [official custom-view guide](https://docs.obsidian.md/plugins/guides/bases-view) recommends reusing DOM and avoiding unnecessary off-screen work.

The renderer continues to reuse rows and discard excess rows after shrinking a page. It intentionally recreates native value cells because `Value.renderTo()` does not expose a cleanup contract for listeners attached to reused cells. Native value output is not cached across host data updates.

## Verification and remaining host gate

The final local run used Node 24.22.3 and a clean `npm ci`. Formatting, ESLint, all **83 tests across 13 files**, and the production build passed. `npm audit` reported **0 vulnerabilities**. The minified local JavaScript bundle was 17,274 bytes, excluding the separately distributed stylesheet and manifest. The generated bundle is not committed.

The automated suite covers state, renderer behavior, compatibility adapters, keyboard interactions, settings/release contracts, and fixture generation. Run the repository's complete gate with:

```bash
npm ci
npm run fmt:check
npm run lint
npm test
npm run build
```

The tracked host matrix now contains 16 scenarios. New cases cover manual group order with hidden records, Hide all groups, a single null-value group, and Hide all properties. The runner also checks direct page entry, invalid input, keyboard focus, and its accessible name. It distinguishes full query rows from visible group rows instead of equating the CLI result count with the paginated count.

The full matrix requires Obsidian 1.14.3+ because manual group visibility is a host feature introduced then. The plugin minimum remains 1.12.0. A legacy smoke run remains available for older compatible hosts.

Real Obsidian 1.15.1 validation was attempted in this environment. The official Linux distribution matched its published SHA-256, and `test:host:setup` generated the disposable fixture. However, the environment rejects Unix-domain socket creation with `EPERM`. Both a display-server attempt and Electron startup failed, the latter at `process_singleton_posix.cc` with `socket() failed: Operation not permitted`. Consequently, the official CLI cannot find a running host and the required real-host gate has **not passed**.

Keep the PR in draft until the real-host gate passes. On a machine running Obsidian, prepare and register a separate disposable vault, enable its CLI, and run:

```bash
npm run test:host:setup -- --target /absolute/path/obsidian-paginator-test-vault
npm run test:host -- --vault obsidian-paginator-test-vault --scenarios tests/fixtures/host-vault/scenarios.json
```

The host verification must keep vault content byte-for-byte unchanged. Valid page-size changes persist through `config.set()` and are covered by integration tests rather than weakening that hash boundary. Native rendering, themes, real screen-reader speech, pop-out focus/hover behavior, and physical iOS/Android checks still need their relevant host/manual evidence. Unit tests and source inspection do not replace it.

## Maintenance direction

Keep incremental improvements centered on browsing, accessibility, and correct native semantics. Do not rebuild editing, queries, or a second cache of all note metadata. Reassess retirement if native Bases adds true page navigation, or reassess the integration approach if preserving native editing becomes the primary product requirement.
