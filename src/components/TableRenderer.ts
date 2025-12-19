import { setIcon, type App, type BasesEntry, type BasesPropertyId, type BasesViewConfig, type TFile } from 'obsidian';
import type { SortDirection, SortState, TableRendererOptions } from '../types';
import { CSS_CLASSES } from '../utils/constants';

/**
 * Table rendering component
 */
export class TableRenderer {
	private app: App;
	private containerEl: HTMLElement;
	private tableEl: HTMLTableElement | null = null;

	private entries: BasesEntry[] = [];
	private properties: BasesPropertyId[] = [];
	private config: BasesViewConfig;
	private options: TableRendererOptions;

	private sortState: SortState = {
		propertyId: null,
		direction: 'ASC',
	};

	constructor(
		app: App,
		containerEl: HTMLElement,
		config: BasesViewConfig,
		options: TableRendererOptions
	) {
		this.app = app;
		this.containerEl = containerEl;
		this.config = config;
		this.options = options;

		this.containerEl.addClass(CSS_CLASSES.tableContainer);
	}

	/**
	 * Update data and re-render
	 */
	update(entries: BasesEntry[], properties: BasesPropertyId[]): void {
		this.entries = entries;
		this.properties = properties;
		this.render();
	}

	/**
	 * Render the table
	 */
	private render(): void {
		this.containerEl.empty();

		if (this.entries.length === 0) {
			this.renderEmptyState();
			return;
		}

		this.tableEl = this.containerEl.createEl('table', {
			cls: CSS_CLASSES.table,
		});

		this.renderHeader();
		this.renderBody();
	}

	/**
	 * Render empty state
	 */
	private renderEmptyState(): void {
		const emptyEl = this.containerEl.createDiv(CSS_CLASSES.emptyState);
		emptyEl.setText('No results found');
	}

	/**
	 * Render table header
	 */
	private renderHeader(): void {
		if (!this.tableEl) return;

		const thead = this.tableEl.createEl('thead');
		const headerRow = thead.createEl('tr');

		// Add header class for sticky option
		if (this.options.stickyHeader) {
			thead.addClass(CSS_CLASSES.tableHeaderSticky);
		}

		for (const propId of this.properties) {
			const th = headerRow.createEl('th', {
				cls: `${CSS_CLASSES.tableHeader} ${CSS_CLASSES.tableHeaderSortable}`,
			});

			// Header content container
			const headerContent = th.createDiv({ cls: CSS_CLASSES.tableHeaderContent });
			headerContent.createSpan({ text: this.config.getDisplayName(propId) });

			// Sort indicator
			const sortIndicator = headerContent.createSpan({ cls: CSS_CLASSES.sortIndicator });
			if (this.sortState.propertyId === propId) {
				th.addClass(CSS_CLASSES.tableHeaderSorted);
				setIcon(sortIndicator, this.sortState.direction === 'ASC' ? 'chevron-up' : 'chevron-down');
			} else {
				// Show subtle indicator for sortable columns
				setIcon(sortIndicator, 'chevrons-up-down');
			}

			// Click to sort
			th.addEventListener('click', () => this.handleHeaderClick(propId));
		}
	}

	/**
	 * Handle header click for sorting
	 */
	private handleHeaderClick(propId: BasesPropertyId): void {
		let newDirection: SortDirection = 'ASC';

		// If clicking the same column, toggle direction
		if (this.sortState.propertyId === propId) {
			newDirection = this.sortState.direction === 'ASC' ? 'DESC' : 'ASC';
		}

		// Update local state
		this.sortState = {
			propertyId: propId,
			direction: newDirection,
		};

		// Notify parent to apply sort
		this.options.onSort(propId, newDirection);
	}

	/**
	 * Update sort state (called when sort changes externally)
	 */
	setSortState(propertyId: BasesPropertyId | null, direction: SortDirection): void {
		this.sortState = { propertyId, direction };
	}

	/**
	 * Render table body
	 */
	private renderBody(): void {
		if (!this.tableEl) return;

		const tbody = this.tableEl.createEl('tbody');

		for (const entry of this.entries) {
			const row = tbody.createEl('tr', {
				cls: CSS_CLASSES.tableRow,
			});

			// Set file path as data attribute
			row.dataset.filePath = entry.file.path;

			// Click to open file
			row.addEventListener('click', (e) => {
				const target = e.target as HTMLElement;
				// Don't open file if clicking on a filterable cell
				if (!target.hasClass(CSS_CLASSES.tableCellFilterable)) {
					this.options.onRowClick(entry.file);
				}
			});

			for (const propId of this.properties) {
				const td = row.createEl('td', {
					cls: CSS_CLASSES.tableCell,
				});

				const value = entry.getValue(propId);
				this.renderCellValue(td, propId, value, entry.file);
			}
		}
	}

	/**
	 * Check if a value is empty
	 */
	private isEmptyValue(value: unknown): boolean {
		if (value === null || value === undefined) return true;
		if (value === '' || value === 'null') return true;
		if (Array.isArray(value) && value.length === 0) return true;
		// Check for Bases NullValue objects (toString() returns "null")
		if (typeof value === 'object' && value !== null) {
			// Check if it's a Value object with isTruthy method
			if ('isTruthy' in value && typeof (value as { isTruthy: () => boolean }).isTruthy === 'function') {
				if (!(value as { isTruthy: () => boolean }).isTruthy()) {
					return true;
				}
			}
			// Also check string representation
			const str = String(value);
			if (str === 'null' || str === '') return true;
		}
		return false;
	}

	/**
	 * Render a cell value
	 */
	private renderCellValue(
		td: HTMLElement,
		propId: BasesPropertyId,
		value: unknown,
		file?: TFile
	): void {
		// Handle empty values (null, undefined, empty string, literal "null", empty array)
		if (this.isEmptyValue(value)) {
			td.addClass(CSS_CLASSES.tableCellEmpty);
			td.setText('-');
			return;
		}

		// Special handling for file.name property - make it a clickable link
		if (propId === 'file.name' && file) {
			const link = td.createEl('a', {
				text: String(value),
				cls: `internal-link ${CSS_CLASSES.fileNameLink}`,
				attr: { 'data-href': file.path },
			});
			link.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.app.workspace.getLeaf().openFile(file);
			});
			// Add hover preview
			link.addEventListener('mouseover', (e) => {
				this.app.workspace.trigger('hover-link', {
					event: e,
					source: 'bases-paginator',
					hoverParent: td,
					targetEl: link,
					linktext: file.path,
				});
			});
			return;
		}

		// Make cell filterable if enabled
		if (this.options.enableQuickFilters) {
			td.addClass(CSS_CLASSES.tableCellFilterable);
			td.addEventListener('click', (e) => {
				e.stopPropagation();
				this.options.onCellClick(propId, this.valueToString(value));
			});
		}

		// Render based on type
		if (typeof value === 'boolean') {
			td.createEl('span', {
				text: value ? '✓' : '✗',
				cls: value ? CSS_CLASSES.boolTrue : CSS_CLASSES.boolFalse,
			});
		} else if (value instanceof Date) {
			td.setText(value.toLocaleDateString());
		} else if (Array.isArray(value)) {
			for (const item of value) {
				td.createEl('span', {
					text: String(item),
					cls: CSS_CLASSES.tag,
				});
			}
		} else if (typeof value === 'object' && value !== null && 'path' in value) {
			// Handle file links
			const fileLink = value as { path: string; display?: string };
			const link = td.createEl('a', {
				text: fileLink.display ?? fileLink.path,
				cls: 'internal-link',
			});
			link.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const targetFile = this.app.vault.getAbstractFileByPath(fileLink.path);
				if (targetFile && 'path' in targetFile) {
					this.app.workspace.getLeaf().openFile(targetFile as TFile);
				}
			});
			// Add hover preview for file links
			link.addEventListener('mouseover', (e) => {
				this.app.workspace.trigger('hover-link', {
					event: e,
					source: 'bases-paginator',
					hoverParent: td,
					targetEl: link,
					linktext: fileLink.path,
				});
			});
		} else {
			// Check if it's a string with wikilinks
			const strValue = String(value);
			if (strValue.includes('[[')) {
				this.renderTextWithLinks(td, strValue);
			} else {
				td.setText(strValue);
			}
		}
	}

	/**
	 * Render text that may contain wikilinks [[link]] or [[link|display]]
	 */
	private renderTextWithLinks(container: HTMLElement, text: string): void {
		// Regex to match wikilinks: [[path]] or [[path|display]]
		const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

		let lastIndex = 0;
		let match;

		while ((match = wikiLinkRegex.exec(text)) !== null) {
			// Add text before the link
			if (match.index > lastIndex) {
				container.appendText(text.slice(lastIndex, match.index));
			}

			const linkPath = match[1]?.trim() ?? '';
			const displayText = match[2]?.trim() ?? linkPath;

			// Create the link
			const link = container.createEl('a', {
				text: displayText,
				cls: 'internal-link',
				attr: { 'data-href': linkPath },
			});

			link.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				// Try to find and open the file
				const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, '');
				if (file) {
					this.app.workspace.getLeaf().openFile(file);
				}
			});

			// Add hover preview
			link.addEventListener('mouseover', (e) => {
				this.app.workspace.trigger('hover-link', {
					event: e,
					source: 'bases-paginator',
					hoverParent: container,
					targetEl: link,
					linktext: linkPath,
				});
			});

			lastIndex = match.index + match[0].length;
		}

		// Add remaining text after the last link
		if (lastIndex < text.length) {
			container.appendText(text.slice(lastIndex));
		}
	}

	/**
	 * Convert value to string for filtering
	 */
	private valueToString(value: unknown): string {
		if (value === null || value === undefined) {
			return '';
		}
		if (Array.isArray(value)) {
			return value.map(String).join(', ');
		}
		if (typeof value === 'object' && value !== null && 'path' in value) {
			return (value as { path: string }).path;
		}
		return String(value);
	}

	/**
	 * Get the table element
	 */
	getTableElement(): HTMLTableElement | null {
		return this.tableEl;
	}
}
