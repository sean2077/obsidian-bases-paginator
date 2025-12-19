# Bases Paginator

A plugin for [Obsidian](https://obsidian.md) that adds a paginated table view with column filtering capabilities to Obsidian Bases.

> **Note:** Requires Obsidian v1.10.0+ with the Bases core plugin enabled.

![](./assets/paginated-table.png)

## Features

### Pagination
- Navigate through large datasets with ease
- Preset page sizes: 10, 25, 50, 100 items per page
- Custom page size input support
- First/Previous/Next/Last page navigation with ±10 page jumps
- Display current page and total item count

### Column Filtering
- **Global Search**: Real-time search across all visible columns
- **Column Filters**: Multi-select dropdown filters on column headers
- **Right-click Menu**: Right-click any column header to enable/disable filtering or sort
- **Filter Chips**: Visual tags showing active filters with one-click removal
- **Clear All**: Remove all filters with a single click

### Filter Presets
- Save frequently used filter combinations
- Quick preset selector dropdown
- Presets are stored per-view in your `.base` file

### Sorting
- Click column headers to sort (ascending/descending)
- Right-click column headers for sort options
- Visual indicators show current sort state

### Display Options
- Configurable pagination position (top or bottom)
- Sticky header support
- Show/hide filter bar and search box
- Native Bases rendering for cell values (links, tags, etc.)

## Limitations

> **Important:** This is a custom view implementation, not an extension of the native Bases table.

Due to Bases API limitations, the following features are **not available**:

- **Cell Editing**: Cannot edit cell values directly in the table. To edit data, use the native Bases Table view or edit the source file directly.
- **Inline Add/Delete**: Cannot add or delete list items by clicking cells.
- **Row Creation**: Cannot create new rows from within this view (use `createFileForView` API or native views).

These limitations exist because:
1. `BasesView` is an abstract class that only provides read-only data access (`getValue()`)
2. The `Value.renderTo()` method only renders display, without edit capabilities
3. Native table editing is implemented internally and not exposed through public APIs

## Usage

### In `.base` Files

1. Open any `.base` file in Obsidian
2. Click the view switcher in the toolbar
3. Select **"Paginated Table"** from the view options
4. Configure view options:
   - Items per page
   - Filterable columns (or right-click column headers to enable)
   - Toggle search box
   - Show/hide filter bar
   - Sticky header
   - Pagination position (top/bottom)

### In Markdown (Base Code Block)

You can embed a paginated table directly in any Markdown note using a base code block:

````markdown
```base
filters:
  and:
    - file.hasTag("task")
views:
  - type: paginated-table
    name: "My Tasks"
    pageSize: "25"
    showSearchBox: true
    showFilterBar: true
    stickyHeader: true
    paginationPosition: "top"
```
````

### View Options Reference

| Option               | Type     | Default    | Description                                      |
| -------------------- | -------- | ---------- | ------------------------------------------------ |
| `pageSize`           | string   | `"25"`     | Items per page (`"10"`, `"25"`, `"50"`, `"100"`) |
| `showSearchBox`      | boolean  | `true`     | Show global search input                         |
| `filterableColumns`  | string[] | `[]`       | Columns with filter dropdowns (property IDs)     |
| `showFilterBar`      | boolean  | `true`     | Show filter bar with search and presets          |
| `stickyHeader`       | boolean  | `true`     | Keep table header visible when scrolling         |
| `paginationPosition` | string   | `"top"`    | Position of pagination bar (`"top"` or `"bottom"`) |

### Embedding Base Views

You can also embed a specific view from a `.base` file into another note:

```markdown
![[MyDatabase.base#My Tasks]]
```

This will render the "My Tasks" view (if it's a paginated-table type) inline in your note

## Installation

### From Community Plugins (Coming Soon)
1. Open Obsidian Settings
2. Go to Community Plugins
3. Search for "Bases Paginator"
4. Click Install, then Enable

### Using BRAT
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. Open BRAT settings and click "Add Beta plugin"
3. Enter repository URL: `https://github.com/sean2077/obsidian-bases-paginator`
4. Click "Add Plugin" and enable it in Community Plugins

### Manual Installation
1. Download `main.js`, `styles.css`, and `manifest.json` from the latest release
2. Create folder: `VaultFolder/.obsidian/plugins/bases-paginator/`
3. Copy the downloaded files into the folder
4. Reload Obsidian
5. Enable the plugin in Settings > Community Plugins

## Development

```bash
# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Production build
npm run build

# Lint code
npm run lint
```

## Requirements

- Obsidian v1.10.0 or higher
- Bases core plugin enabled

## License

See [LICENSE](./LICENSE).
