import { ListValue, Menu, setIcon, TFile, Value, type App, type BasesEntry, type BasesPropertyId, type BasesViewConfig } from 'obsidian';
import type { SortDirection, SortState, TableRendererOptions } from '../types';
import { CSS_CLASSES, WIKILINK_PATTERN, COLUMN_INDEX_ATTR } from '../utils/constants';
import { valueToString, isEmptyValue, extractValueItems } from '../utils/helpers';
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

	private dragState: {
		draggingIndex: number | null;
		dragOverIndex: number | null;
	} = { draggingIndex: null, dragOverIndex: null };

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

		this.properties.forEach((propId, i) => {
			const th = headerRow.createEl('th', {
				cls: `${CSS_CLASSES.tableHeader} ${CSS_CLASSES.tableHeaderSortable} ${CSS_CLASSES.tableHeaderDraggable}`,
			});

			// Make header draggable
			th.setAttribute('draggable', 'true');
			th.dataset[COLUMN_INDEX_ATTR.datasetKey] = String(i);

			// Setup drag handlers
			this.setupDragHandlers(th, i);

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
				// Don't sort if clicking on filter icon or during drag
				if (this.dragState.draggingIndex !== null) return;
				const target = e.target as HTMLElement;
				if (!target.closest(`.${CSS_CLASSES.columnFilterBtn}`)) {
					this.handleHeaderClick(propId);
				}
			});

			// Right-click context menu
			th.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				this.showHeaderContextMenu(e, propId);
			});
		});
	}

	/**
	 * Setup drag handlers for column reordering
	 */
	private setupDragHandlers(th: HTMLElement, index: number): void {
		th.addEventListener('dragstart', (e) => {
			this.dragState.draggingIndex = index;
			th.addClass(CSS_CLASSES.tableHeaderDragging);

			// Set drag data
			e.dataTransfer?.setData('text/plain', String(index));
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
			}
		});

		th.addEventListener('dragend', () => {
			th.removeClass(CSS_CLASSES.tableHeaderDragging);
			this.clearDragOverStates();
			this.dragState.draggingIndex = null;
			this.dragState.dragOverIndex = null;
		});

		th.addEventListener('dragover', (e) => {
			e.preventDefault();
			if (this.dragState.draggingIndex === null) return;
			if (this.dragState.draggingIndex === index) return;

			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}

			// Update drag over state
			if (this.dragState.dragOverIndex !== index) {
				this.clearDragOverStates();
				th.addClass(CSS_CLASSES.tableHeaderDragOver);
				this.dragState.dragOverIndex = index;
			}
		});

		th.addEventListener('dragleave', (e) => {
			// Only clear if actually leaving this element
			const relatedTarget = e.relatedTarget as HTMLElement;
			if (!th.contains(relatedTarget)) {
				th.removeClass(CSS_CLASSES.tableHeaderDragOver);
			}
		});

		th.addEventListener('drop', (e) => {
			e.preventDefault();
			const fromIndex = this.dragState.draggingIndex;
			const toIndex = index;

			if (fromIndex !== null && fromIndex !== toIndex && this.options.onColumnReorder) {
				this.options.onColumnReorder(fromIndex, toIndex);
			}

			this.clearDragOverStates();
		});
	}

	/**
	 * Clear drag-over state from the currently tracked header (optimized single-element query)
	 */
	private clearDragOverStates(): void {
		if (this.dragState.dragOverIndex !== null && this.tableEl) {
			const th = this.tableEl.querySelector(
				`th[${COLUMN_INDEX_ATTR.selector}="${this.dragState.dragOverIndex}"]`
			);
			th?.removeClass(CSS_CLASSES.tableHeaderDragOver);
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

		const filterBtn = container.createSpan({ cls: CSS_CLASSES.columnFilterBtn });
		setIcon(filterBtn, 'filter');

		if (hasActiveFilter) {
			filterBtn.addClass(CSS_CLASSES.columnFilterActive);
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
	 * Render a cell value using Bases' native Value.renderTo() method
	 */
	private renderCellValue(
		td: HTMLElement,
		propId: BasesPropertyId,
		value: unknown,
		file?: TFile
	): void {
		// Handle empty values
		if (isEmptyValue(value)) {
			td.addClass(CSS_CLASSES.tableCellEmpty);
			td.setText('-');
			return;
		}

		// Special handling for file.name property - make it a clickable link
		if (propId === 'file.name' && file) {
			const link = td.createEl('a', {
				text: valueToString(value),
				cls: 'internal-link',
				attr: { 'data-href': file.path },
			});
			this.setupLinkHandlers(link, td, file.path, () => {
				void this.app.workspace.getLeaf().openFile(file);
			});
			return;
		}

		// Check for list rendering mode (both bullet and comma)
		if (this.isListValue(value)) {
			if (this.options.listRenderMode === 'bullet') {
				this.renderListValue(td, value);
				return;
			} else if (this.options.listRenderMode === 'comma') {
				this.renderCommaValue(td, value);
				return;
			}
		}

		// Use Bases' native Value.renderTo() for rendering
		if (value instanceof Value) {
			value.renderTo(td, this.app.renderContext);
		} else {
			// Fallback for non-Value types
			td.setText(valueToString(value));
		}
	}

	/**
	 * Check if a value should be rendered as a list.
	 * Uses Obsidian's ListValue type for accurate detection.
	 */
	private isListValue(value: unknown): boolean {
		return value instanceof ListValue;
	}

	/**
	 * Extract items from a list value for rendering.
	 * Uses the shared extractValueItems helper which handles Bases Value objects.
	 */
	private getListItems(value: unknown): string[] {
		return extractValueItems(value);
	}

	/**
	 * Render a value as a bullet list
	 */
	private renderListValue(td: HTMLElement, value: unknown): void {
		const listContainer = td.createDiv({ cls: CSS_CLASSES.tableCellList });
		const items = this.getListItems(value);

		for (const item of items) {
			const itemEl = listContainer.createDiv({ cls: CSS_CLASSES.tableCellListItem });

			// Add bullet prefix
			const bulletEl = itemEl.createSpan({ cls: CSS_CLASSES.tableCellListBullet });
			bulletEl.setText('\u2022'); // Unicode bullet

			// Render the item content
			if (item.startsWith('[[')) {
				this.renderWikiLink(itemEl, item);
			} else {
				itemEl.createSpan({ text: item });
			}
		}
	}

	/**
	 * Render a value as comma-separated inline text
	 */
	private renderCommaValue(td: HTMLElement, value: unknown): void {
		const items = this.getListItems(value);

		items.forEach((item, index) => {
			if (index > 0) {
				td.createSpan({ text: ', ' });
			}

			if (item.startsWith('[[')) {
				this.renderWikiLink(td, item);
			} else {
				td.createSpan({ text: item });
			}
		});
	}

	/**
	 * Setup click and hover handlers for internal links.
	 * Centralizes the common link interaction pattern.
	 */
	private setupLinkHandlers(
		link: HTMLElement,
		container: HTMLElement,
		linkPath: string,
		onClick: () => void
	): void {
		link.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			onClick();
		});

		link.addEventListener('mouseover', (e) => {
			this.app.workspace.trigger('hover-link', {
				event: e,
				source: 'bases-paginator',
				hoverParent: container,
				targetEl: link,
				linktext: linkPath,
			});
		});
	}

	/**
	 * Render a wikilink string as a clickable internal link
	 */
	private renderWikiLink(container: HTMLElement, wikilink: string): void {
		// Extract link text from [[link]] or [[link|display]]
		const match = wikilink.match(WIKILINK_PATTERN);
		if (!match || !match[1]) {
			container.createSpan({ text: wikilink });
			return;
		}

		const linkPath = match[1];
		const displayText = match[2] ?? linkPath;

		const link = container.createEl('a', {
			text: displayText,
			cls: 'internal-link',
			attr: { 'data-href': linkPath },
		});

		this.setupLinkHandlers(link, container, linkPath, () => {
			void this.app.workspace.openLinkText(linkPath, '', false);
		});
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
