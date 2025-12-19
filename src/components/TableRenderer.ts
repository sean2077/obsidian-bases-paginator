import type { App, BasesEntry, BasesPropertyId, BasesViewConfig, TFile } from 'obsidian';
import type { TableRendererOptions } from '../types';
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
				cls: CSS_CLASSES.tableHeader,
			});
			th.setText(this.config.getDisplayName(propId));
		}
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
				this.renderCellValue(td, propId, value);
			}
		}
	}

	/**
	 * Render a cell value
	 */
	private renderCellValue(
		td: HTMLElement,
		propId: BasesPropertyId,
		value: unknown
	): void {
		if (value === null || value === undefined) {
			td.addClass(CSS_CLASSES.tableCellEmpty);
			td.setText('-');
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
			const span = td.createEl('span', {
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
			const file = value as { path: string; display?: string };
			const link = td.createEl('a', {
				text: file.display ?? file.path,
				cls: 'internal-link',
			});
			link.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const targetFile = this.app.vault.getAbstractFileByPath(file.path);
				if (targetFile && 'path' in targetFile) {
					this.app.workspace.getLeaf().openFile(targetFile as TFile);
				}
			});
		} else {
			td.setText(String(value));
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
