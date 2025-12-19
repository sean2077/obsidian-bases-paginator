# Bases Paginator

A plugin for [Obsidian](https://obsidian.md) that adds a paginated table view with quick filtering capabilities to Obsidian Bases.

> **Note:** Requires Obsidian v1.10.0+ with the Bases core plugin enabled.

## Features

### Pagination
- Navigate through large datasets with ease
- Preset page sizes: 10, 25, 50, 100 items per page
- Custom page size input support
- First/Previous/Next/Last page navigation
- Display current page and total item count

### Quick Filtering
- **Global Search**: Real-time search across all visible columns
- **Click-to-Filter**: Click any cell value to instantly filter by that value
- **Filter Chips**: Visual tags showing active filters with one-click removal
- **Clear All**: Remove all filters with a single click

### Filter Presets
- Save frequently used filter combinations
- Quick preset selector dropdown
- Presets are stored per-view in your `.base` file

### Full Compatibility
- Inherits native Bases sorting and grouping
- Respects column visibility settings
- Works with all property types (text, number, date, boolean, tags, links)
- Adapts to light and dark themes

## Usage

1. Open any `.base` file in Obsidian
2. Click the view switcher in the toolbar
3. Select **"Paginated Table"** from the view options
4. Configure view options:
   - Items per page
   - Toggle search box
   - Enable/disable click-to-filter
   - Show/hide filter bar
   - Sticky header

## Installation

### From Community Plugins (Coming Soon)
1. Open Obsidian Settings
2. Go to Community Plugins
3. Search for "Bases Paginator"
4. Click Install, then Enable

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

MIT
