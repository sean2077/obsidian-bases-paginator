## [2.0.5](https://github.com/sean2077/obsidian-bases-paginator/compare/2.0.4...2.0.5) (2026-07-21)

### Fixes

* **settings:** expose plugin settings to Obsidian 1.13+ search while preserving the 1.12 settings tab

## [2.0.4](https://github.com/sean2077/obsidian-bases-paginator/compare/2.0.3...2.0.4) (2026-07-21)

### Fixes

* **release:** compare published notes from structured JSON so GitHub CLI display newlines cannot fail release verification

## [2.0.3](https://github.com/sean2077/obsidian-bases-paginator/compare/2.0.2...2.0.3) (2026-07-21)

### Fixes

* remove the redundant product name from the plugin manifest description so community-plugin validation passes

### Release workflow

* replace Semantic Release with a local, Changelog-backed version bump and annotated-tag flow
* validate the committed release snapshot before CI builds, attests, and publishes its assets

## [2.0.2](https://github.com/sean2077/obsidian-bases-paginator/compare/2.0.1...2.0.2) (2026-07-21)

### Fixes

* **release:** restore generated release notes ([e74dfbe](https://github.com/sean2077/obsidian-bases-paginator/commit/e74dfbe0e8dda615fe67a5607bca4e24eb582a1a))

## [2.0.1](https://github.com/sean2077/obsidian-bases-paginator/compare/2.0.0...2.0.1) (2026-07-21)

### Fixes

* **release:** keep generated metadata formatted ([6468589](https://github.com/sean2077/obsidian-bases-paginator/commit/6468589180b3b67ad84c328d01203577510751b4))

## [2.0.0](https://github.com/sean2077/obsidian-bases-paginator/compare/1.5.0...2.0.0) (2026-07-21)

### ⚠ BREAKING CHANGES

* **release:** Bases Paginator now focuses on group-aware pagination and delegates search, filters, sorting, property order, summaries, copy/export, and selection to native Bases. Legacy view-option keys remain loadable but no longer affect rendering.

### Build System

* **release:** harden v2 publication ([9585c0e](https://github.com/sean2077/obsidian-bases-paginator/commit/9585c0ebe2166ba7448c92612a21d348a7e39911))

## [1.5.0](https://github.com/sean2077/obsidian-bases-paginator/compare/1.4.3...1.5.0) (2026-03-20)

### Features

* bug fixes and perf improvements ([6fb1211](https://github.com/sean2077/obsidian-bases-paginator/commit/6fb1211cc828413358000f2ae6eedb59e44ef247))

## [1.4.3](https://github.com/sean2077/obsidian-bases-paginator/compare/1.4.2...1.4.3) (2025-12-24)

### Fixes

* use native Bases order API for column ordering ([9068fe0](https://github.com/sean2077/obsidian-bases-paginator/commit/9068fe0e80ba076e456ddcaa73dd774cd648efb8))

## [1.4.2](https://github.com/sean2077/obsidian-bases-paginator/compare/1.4.1...1.4.2) (2025-12-22)

### Fixes

* line-by-line list rendering table layout bug ([d4ae2e4](https://github.com/sean2077/obsidian-bases-paginator/commit/d4ae2e48352e54775fd031ba4e49fa73b8eb8bad))

## [1.4.1](https://github.com/sean2077/obsidian-bases-paginator/compare/1.4.0...1.4.1) (2025-12-21)

### Fixes

* list rendering and code optimization ([d1e86de](https://github.com/sean2077/obsidian-bases-paginator/commit/d1e86de1555846b89749d959cb8a3a062b9cee09))

## [1.4.0](https://github.com/sean2077/obsidian-bases-paginator/compare/1.3.0...1.4.0) (2025-12-21)

### Features

* add list rendering modes and column drag-to-reorder ([2a02b3a](https://github.com/sean2077/obsidian-bases-paginator/commit/2a02b3ab31a39590b4f62009df1d175d768ea09a))

## [1.3.0](https://github.com/sean2077/obsidian-bases-paginator/compare/1.2.1...1.3.0) (2025-12-20)

### Features

* add full preset CRUD and save pagination state ([7993ce7](https://github.com/sean2077/obsidian-bases-paginator/commit/7993ce7c506aebd09f5f44e6425407a8b571ef8d))
* add natural sorting, fix sticky header, and optimize code ([2c89f84](https://github.com/sean2077/obsidian-bases-paginator/commit/2c89f848dfa6a723df3914ffcf2e1fe8e207d6aa))

## [1.2.1](https://github.com/sean2077/obsidian-bases-paginator/compare/1.2.0...1.2.1) (2025-12-19)

### Fixes

* lint errors and add build/lint steps to release workflow ([9616c8b](https://github.com/sean2077/obsidian-bases-paginator/commit/9616c8b119a98ece40c3ebb1605451df60b6b154))

## [1.2.0](https://github.com/sean2077/obsidian-bases-paginator/compare/1.1.0...1.2.0) (2025-12-19)

### Features

* replace cell click-to-filter with column header filter dropdowns ([89f8e96](https://github.com/sean2077/obsidian-bases-paginator/commit/89f8e960ae274d66627beb114a7cc4d71b208ed5))

## [1.1.0](https://github.com/sean2077/obsidian-bases-paginator/compare/1.0.0...1.1.0) (2025-12-19)

### Features

* render list value in better way ([2401df3](https://github.com/sean2077/obsidian-bases-paginator/commit/2401df3f50c85455947ea740cecab83a8c0cdb21))

## 1.0.0 (2025-12-19)

### Features

* add column sorting, file preview, and fix null display ([1e0b2e3](https://github.com/sean2077/obsidian-bases-paginator/commit/1e0b2e3c8cc31ef64e4fe429bf71b5f29cc064a4))
* add configurable pagination position and ±10 page navigation ([4692044](https://github.com/sean2077/obsidian-bases-paginator/commit/46920448031a4f612e0a01c9b10225bf1a060855))
* add semantic-release auto-publish workflow and display version in settings ([5bc4cb0](https://github.com/sean2077/obsidian-bases-paginator/commit/5bc4cb0d2bab094a642b9efb97a0b7aad985d778))
* implement Bases Paginator plugin with pagination and filtering ([ab2ce33](https://github.com/sean2077/obsidian-bases-paginator/commit/ab2ce33756ca7fd570f3fa630d943c0f9e2ab197))
* render wikilinks as clickable links with hover preview ([efe0ca8](https://github.com/sean2077/obsidian-bases-paginator/commit/efe0ca877ded3d0f51ec457905856919b46eb3f6))
