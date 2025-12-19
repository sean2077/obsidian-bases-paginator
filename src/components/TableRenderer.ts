import { Menu, setIcon, TFile, Value, type App, type BasesEntry, type BasesPropertyId, type BasesViewConfig } from 'obsidian';
import type { SortDirection, SortState, TableRendererOptions } from '../types';
import { CSS_CLASSES } from '../utils/constants';
import { valueToString as safeValueToString } from '../utils/helpers';
import { ColumnFilterMenu } from './ColumnFilterMenu';

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

			// Add filter icon if this column is filterable
			if (this.options.filterableColumns.includes(propId)) {
				this.addFilterIcon(headerContent, propId);
			}

			// Click to sort (on header, not on filter icon)
			th.addEventListener('click', (e) => {
				// Don't sort if clicking on filter icon
				const target = e.target as HTMLElement;
				if (!target.closest('.bp-column-filter-btn')) {
					this.handleHeaderClick(propId);
				}
			});

			// Right-click context menu
			th.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				this.showHeaderContextMenu(e, propId);
			});
		}
	}

	/**
	 * Show context menu for column header
	 */
	private showHeaderContextMenu(event: MouseEvent, propId: BasesPropertyId): void {
		const menu = new Menu();
		const isFilterable = this.options.filterableColumns.includes(propId);

		// Sort options
		menu.addItem((item) => {
			item.setTitle('Sort ascending')
				.setIcon('chevron-up')
				.onClick(() => {
					this.sortState = { propertyId: propId, direction: 'ASC' };
					this.options.onSort(propId, 'ASC');
				});
		});

		menu.addItem((item) => {
			item.setTitle('Sort descending')
				.setIcon('chevron-down')
				.onClick(() => {
					this.sortState = { propertyId: propId, direction: 'DESC' };
					this.options.onSort(propId, 'DESC');
				});
		});

		menu.addSeparator();

		// Filter toggle option
		if (this.options.onToggleFilterable) {
			menu.addItem((item) => {
				item.setTitle(isFilterable ? 'Disable column filter' : 'Enable column filter')
					.setIcon(isFilterable ? 'filter-x' : 'filter')
					.onClick(() => {
						this.options.onToggleFilterable?.(propId, !isFilterable);
					});
			});
		}

		// If filterable, show filter menu option
		if (isFilterable) {
			menu.addItem((item) => {
				item.setTitle('Filter values...')
					.setIcon('list-filter')
					.onClick(() => {
						this.showFilterMenu(event, propId);
					});
			});
		}

		menu.showAtMouseEvent(event);
	}

	/**
	 * Add filter icon to column header
	 */
	private addFilterIcon(container: HTMLElement, propId: BasesPropertyId): void {
		const selectedFilters = this.options.selectedColumnFilters.get(propId) || [];
		const hasActiveFilter = selectedFilters.length > 0;

		const filterBtn = container.createSpan({ cls: 'bp-column-filter-btn' });
		setIcon(filterBtn, 'filter');

		if (hasActiveFilter) {
			filterBtn.addClass('bp-column-filter-active');
		}

		filterBtn.addEventListener('click', (e) => {
			e.stopPropagation(); // Prevent sort from triggering
			this.showFilterMenu(e, propId);
		});
	}

	/**
	 * Show filter menu for a column
	 */
	private showFilterMenu(event: MouseEvent, propId: BasesPropertyId): void {
		const uniqueValues = this.options.columnFilterData.get(propId) || [];
		const selectedValues = this.options.selectedColumnFilters.get(propId) || [];

		const menu = new ColumnFilterMenu({
			propertyId: propId,
			displayName: this.config.getDisplayName(propId),
			uniqueValues,
			selectedValues,
			onFilterChange: (values) => {
				this.options.onColumnFilterChange(propId, values);
			},
		});

		menu.show(event);
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

			// No row click event - let cell content handle its own interactions

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
			const str = safeValueToString(value);
			if (str === 'null' || str === '') return true;
		}
		return false;
	}

	/**
	 * Render a cell value using Bases' native Value.renderTo() method
	 */
	private renderCellValue(
		td: HTMLElement,
		propId: BasesPropertyId,
		value: unknown,
		file?: TFile
	): void {
		// Handle empty values
		if (this.isEmptyValue(value)) {
			td.addClass(CSS_CLASSES.tableCellEmpty);
			td.setText('-');
			return;
		}

		// Special handling for file.name property - make it a clickable link
		if (propId === 'file.name' && file) {
			const link = td.createEl('a', {
				text: safeValueToString(value),
				cls: 'internal-link',
				attr: { 'data-href': file.path },
			});
			link.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				void this.app.workspace.getLeaf().openFile(file);
			});
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

		// Use Bases' native Value.renderTo() for rendering
		if (value instanceof Value) {
			value.renderTo(td, this.app.renderContext);
		} else {
			// Fallback for non-Value types
			td.setText(safeValueToString(value));
		}
	}

	/**
	 * Update options (for dynamic filter data updates)
	 */
	updateOptions(options: Partial<TableRendererOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Get the table element
	 */
	getTableElement(): HTMLTableElement | null {
		return this.tableEl;
	}
}
