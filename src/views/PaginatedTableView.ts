import {
	BasesView,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type QueryController,
	type ViewOption,
} from 'obsidian';

import type { SortDirection, SortState, BasesPaginatorSettings, ListRenderMode } from '../types';
import { valueToString, isArrayLike, toArray, naturalCompare, splitMultiValues } from '../utils/helpers';
import { VIEW_TYPE, CSS_CLASSES, DEFAULT_PAGE_SIZE } from '../utils/constants';
import { PaginationService } from '../services/PaginationService';
import { FilterService } from '../services/FilterService';
import { FilterBar } from '../components/FilterBar';
import { PaginationBar } from '../components/PaginationBar';
import { TableRenderer } from '../components/TableRenderer';
import { getViewOptions, VIEW_OPTION_DEFAULTS } from './viewOptions';

/**
 * Paginated table view for Obsidian Bases
 */
export class PaginatedTableView extends BasesView {
	type = VIEW_TYPE;

	private _app: App;
	private _containerEl: HTMLElement;
	private _getSettings: () => BasesPaginatorSettings;
	private filterBarEl!: HTMLElement;
	private tableContainerEl!: HTMLElement;
	private paginationBarEl!: HTMLElement;

	private filterBar: FilterBar | null = null;
	private tableRenderer: TableRenderer | null = null;
	private paginationBar: PaginationBar | null = null;

	private paginationService: PaginationService;
	private filterService: FilterService;

	private sortState: SortState = {
		propertyId: null,
		direction: 'ASC',
	};

	private customColumnOrder: BasesPropertyId[] = [];

	private initialized = false;

	constructor(app: App, controller: QueryController, containerEl: HTMLElement, getSettings: () => BasesPaginatorSettings) {
		super(controller);
		this._app = app;
		this._containerEl = containerEl;
		this._getSettings = getSettings;

		// Initialize services
		this.paginationService = new PaginationService(() => this.onStateChange());
		this.filterService = new FilterService(() => this.onFilterChange());

		// Build UI structure (containers only, components initialized later)
		this.buildUI();
	}

	/**
	 * Build the UI structure (containers only)
	 */
	private buildUI(): void {
		this._containerEl.addClass(CSS_CLASSES.container);

		// Create all containers - order will be set in initializeComponents
		this.filterBarEl = this._containerEl.createDiv();
		this.paginationBarEl = this._containerEl.createDiv();
		this.tableContainerEl = this._containerEl.createDiv();
	}

	/**
	 * Update layout based on pagination position setting
	 */
	private updateLayout(): void {
		const position = this.getConfigValue('paginationPosition', VIEW_OPTION_DEFAULTS.paginationPosition);

		// Use CSS classes for order to control layout
		// Filter bar always first
		this.filterBarEl.removeClass(CSS_CLASSES.layoutOrder2, CSS_CLASSES.layoutOrder3);
		this.filterBarEl.addClass(CSS_CLASSES.layoutOrder1);

		if (position === 'top') {
			// Pagination -> Table
			this.paginationBarEl.removeClass(CSS_CLASSES.layoutOrder1, CSS_CLASSES.layoutOrder3);
			this.paginationBarEl.addClass(CSS_CLASSES.layoutOrder2);
			this.tableContainerEl.removeClass(CSS_CLASSES.layoutOrder1, CSS_CLASSES.layoutOrder2);
			this.tableContainerEl.addClass(CSS_CLASSES.layoutOrder3);
		} else {
			// Table -> Pagination
			this.tableContainerEl.removeClass(CSS_CLASSES.layoutOrder1, CSS_CLASSES.layoutOrder3);
			this.tableContainerEl.addClass(CSS_CLASSES.layoutOrder2);
			this.paginationBarEl.removeClass(CSS_CLASSES.layoutOrder1, CSS_CLASSES.layoutOrder2);
			this.paginationBarEl.addClass(CSS_CLASSES.layoutOrder3);
		}
	}

	/**
	 * Initialize UI components (called on first onDataUpdated when config is available)
	 */
	private initializeComponents(): void {
		if (this.initialized) return;
		this.initialized = true;

		// Set layout based on config
		this.updateLayout();

		const presetsJson = this.getConfigValue('filterPresets', VIEW_OPTION_DEFAULTS.filterPresets);
		this.filterService.loadPresets(presetsJson);

		// Load saved column order
		const savedOrder = this.config.get('columnOrder');
		if (Array.isArray(savedOrder)) {
			this.customColumnOrder = savedOrder.filter((s): s is string => typeof s === 'string' && s.length > 0) as BasesPropertyId[];
		}

		// Filter bar
		this.filterBar = new FilterBar(
			this.filterBarEl,
			this.config,
			{
				onSearchChange: (query) => {
					this.filterService.setSearchQuery(query);
				},
				onFilterRemove: (filter) => {
					this.filterService.removeQuickFilter(filter.propertyId, filter.value);
				},
				onFiltersClear: () => {
					this.filterService.clearAllFilters();
				},
				onPresetSelect: (presetId) => {
					const pagination = this.filterService.activatePreset(presetId);
					if (pagination) {
						this.paginationService.setPageSize(pagination.pageSize);
						this.paginationService.goToPage(pagination.currentPage);
					}
				},
				onPresetSave: (name) => {
					const state = this.paginationService.getState();
					const preset = this.filterService.saveCurrentAsPreset(name, {
						pageSize: state.pageSize,
						currentPage: state.currentPage,
					});
					this.savePresets();
					this.filterBar?.updatePresets(
						this.filterService.getPresets(),
						preset.id
					);
				},
				onPresetUpdate: (presetId) => {
					const state = this.paginationService.getState();
					this.filterService.updatePreset(presetId, {
						pageSize: state.pageSize,
						currentPage: state.currentPage,
					});
					this.savePresets();
				},
				onPresetDelete: (presetId) => {
					this.filterService.deletePreset(presetId);
					this.savePresets();
					this.filterBar?.updatePresets(
						this.filterService.getPresets(),
						null
					);
				},
			},
			this.filterService.getPresets(),
			this.filterService.getActivePresetId()
		);

		// Table renderer
		this.tableRenderer = new TableRenderer(
			this._app,
			this.tableContainerEl,
			this.config,
			{
				stickyHeader: this.getConfigBool('stickyHeader', VIEW_OPTION_DEFAULTS.stickyHeader),
				filterableColumns: this.getFilterableColumns(),
				columnFilterData: new Map(),
				selectedColumnFilters: new Map(),
				listRenderMode: this.getConfigValue('listRenderMode', VIEW_OPTION_DEFAULTS.listRenderMode) as ListRenderMode,
				onSort: (propId, direction) => {
					this.handleSort(propId, direction);
				},
				onColumnFilterChange: (propId, values) => {
					this.filterService.setColumnFilter(propId, values);
				},
				onToggleFilterable: (propId, enable) => {
					this.toggleFilterableColumn(propId, enable);
				},
				onColumnReorder: (fromIndex, toIndex) => {
					this.handleColumnReorder(fromIndex, toIndex);
				},
			}
		);

		// Pagination bar
		this.paginationBar = new PaginationBar(this.paginationBarEl, {
			onPageChange: (page) => {
				this.paginationService.goToPage(page);
			},
			onPageSizeChange: (size) => {
				this.paginationService.setPageSize(size);
				this.savePageSize(size);
			},
		});

		// Set initial page size from config
		const pageSize = this.getConfigNumber('pageSize', DEFAULT_PAGE_SIZE);
		this.paginationService.setPageSize(pageSize);
	}

	/**
	 * Called when data is updated from Bases
	 */
	onDataUpdated(): void {
		// Initialize components on first call (when config is available)
		if (!this.initialized) {
			this.initializeComponents();
		}

		// Update layout (in case config changed)
		this.updateLayout();

		// Update visible properties for search filtering
		const properties = this.getVisibleProperties();
		this.filterService.setVisibleProperties(properties);

		// Apply filters and pagination
		this.renderData();

		// Update filter bar visibility
		const showFilterBar = this.getConfigBool('showFilterBar', VIEW_OPTION_DEFAULTS.showFilterBar);
		this.filterBar?.setVisible(showFilterBar);
	}

	/**
	 * Handle filter state changes
	 */
	private onFilterChange(): void {
		// Reset to first page when filters change
		this.paginationService.resetToFirst();
		this.renderData();
	}

	/**
	 * Handle pagination state changes
	 */
	private onStateChange(): void {
		this.renderData();
	}

	/**
	 * Render data with current filters and pagination
	 */
	private renderData(): void {
		if (!this.filterBar || !this.tableRenderer || !this.paginationBar) {
			return;
		}

		// Get data from Bases
		const allEntries = this.data.data;
		const properties = this.getVisibleProperties();

		// Get filterable columns and extract unique values BEFORE filtering
		const filterableColumns = this.getFilterableColumns();
		const columnFilterData = this.extractUniqueValues(allEntries, filterableColumns);

		// Update table renderer options with filter data
		this.tableRenderer.updateOptions({
			filterableColumns,
			columnFilterData,
			selectedColumnFilters: this.filterService.getColumnFilters(),
			listRenderMode: this.getConfigValue('listRenderMode', VIEW_OPTION_DEFAULTS.listRenderMode) as ListRenderMode,
		});

		// Apply filters
		const filteredEntries = this.filterService.filterEntries(allEntries);

		// Apply client-side sorting
		const sortedEntries = this.sortEntries(filteredEntries);

		// Update pagination with filtered count
		this.paginationService.setTotalItems(sortedEntries.length);

		// Get current page data
		const pagedEntries = this.paginationService.getPageData(sortedEntries);

		// Render table
		this.tableRenderer.update(pagedEntries, properties);

		// Update pagination bar
		const state = this.paginationService.getState();
		this.paginationBar.update(
			state.currentPage,
			state.totalPages,
			state.totalItems,
			state.pageSize
		);

		// Update filter bar
		this.filterBar.updateFilters(this.filterService.getQuickFilters());
		this.filterBar.setSearchQuery(this.filterService.getSearchQuery());
	}

	/**
	 * Get visible properties with custom order applied
	 */
	private getVisibleProperties(): BasesPropertyId[] {
		const baseProperties = this.data.properties;

		// If no custom order, return base properties
		if (this.customColumnOrder.length === 0) {
			return baseProperties;
		}

		// Apply custom order, handling added/removed columns
		const ordered: BasesPropertyId[] = [];
		const remaining = new Set(baseProperties);

		// First, add columns in custom order (if they still exist)
		for (const propId of this.customColumnOrder) {
			if (remaining.has(propId)) {
				ordered.push(propId);
				remaining.delete(propId);
			}
		}

		// Then, add any new columns not in custom order
		for (const propId of baseProperties) {
			if (remaining.has(propId)) {
				ordered.push(propId);
			}
		}

		return ordered;
	}

	/**
	 * Get filterable columns from config
	 */
	private getFilterableColumns(): BasesPropertyId[] {
		if (!this.config) return [];
		const value = this.config.get('filterableColumns');
		if (!value) return [];

		// Handle both string[] (multitext) and string (legacy) formats
		if (Array.isArray(value)) {
			return value.filter((s): s is string => typeof s === 'string' && s.length > 0) as BasesPropertyId[];
		}
		if (typeof value === 'string' && value !== '') {
			return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0) as BasesPropertyId[];
		}
		return [];
	}

	/**
	 * Extract unique values for each filterable column
	 */
	private extractUniqueValues(entries: BasesEntry[], filterableColumns: BasesPropertyId[]): Map<BasesPropertyId, string[]> {
		const result = new Map<BasesPropertyId, string[]>();

		const addValue = (set: Set<string>, strVal: string) => {
			if (strVal && strVal !== 'null') {
				set.add(strVal);
			}
		};

		for (const propId of filterableColumns) {
			const uniqueValues = new Set<string>();

			for (const entry of entries) {
				const value = entry.getValue(propId);
				if (value === null || value === undefined) {
					continue;
				}

				// Handle arrays and array-like objects (like tags, links)
				if (isArrayLike(value)) {
					for (const item of toArray(value)) {
						addValue(uniqueValues, valueToString(item));
					}
				} else {
					// Convert to string and split multi-value wikilinks if present
					const strVal = valueToString(value);
					for (const part of splitMultiValues(strVal)) {
						addValue(uniqueValues, part);
					}
				}
			}

			// Sort values using natural sort
			result.set(propId, Array.from(uniqueValues).sort(naturalCompare));
		}

		return result;
	}

	/**
	 * Handle column sort (client-side sorting)
	 */
	private handleSort(propertyId: BasesPropertyId, direction: SortDirection): void {
		// Update sort state
		this.sortState = { propertyId, direction };

		// Reset to first page and re-render
		this.paginationService.resetToFirst();
		this.renderData();
	}

	/**
	 * Toggle filterable state for a column
	 */
	private toggleFilterableColumn(propertyId: BasesPropertyId, enable: boolean): void {
		const currentColumns = this.getFilterableColumns();
		let newColumns: string[];

		if (enable) {
			// Add column if not already present
			if (!currentColumns.includes(propertyId)) {
				newColumns = [...currentColumns, propertyId];
			} else {
				return; // Already enabled
			}
		} else {
			// Remove column
			newColumns = currentColumns.filter((col) => col !== propertyId);
			// Also clear any active filters for this column
			this.filterService.setColumnFilter(propertyId, []);
		}

		// Save to config
		this.config.set('filterableColumns', newColumns);

		// Re-render to update UI
		this.renderData();
	}

	/**
	 * Handle column reorder from drag-and-drop
	 */
	private handleColumnReorder(fromIndex: number, toIndex: number): void {
		const properties = this.getVisibleProperties();

		// Validate indices
		if (fromIndex < 0 || fromIndex >= properties.length) return;
		if (toIndex < 0 || toIndex >= properties.length) return;

		// Create new order
		const newOrder = [...properties];
		const removed = newOrder.splice(fromIndex, 1);
		const movedItem = removed[0];
		if (!movedItem) return;
		newOrder.splice(toIndex, 0, movedItem);

		// Update state
		this.customColumnOrder = newOrder;

		// Persist to config
		this.config.set('columnOrder', newOrder);

		// Re-render
		this.renderData();
	}

	/**
	 * Sort entries by the current sort state
	 */
	private sortEntries(entries: BasesEntry[]): BasesEntry[] {
		if (!this.sortState.propertyId) {
			return entries;
		}

		const propId = this.sortState.propertyId;
		const direction = this.sortState.direction;

		return [...entries].sort((a, b) => {
			const valueA = a.getValue(propId);
			const valueB = b.getValue(propId);

			// Handle null/undefined/empty values - always sort to the end regardless of direction
			const aIsEmpty = this.isEmptyValue(valueA);
			const bIsEmpty = this.isEmptyValue(valueB);

			if (aIsEmpty && bIsEmpty) return 0;
			if (aIsEmpty) return 1; // Empty values always go to the end
			if (bIsEmpty) return -1;

			const comparison = this.compareValues(valueA, valueB);
			return direction === 'ASC' ? comparison : -comparison;
		});
	}

	/**
	 * Check if a value is empty (null, undefined, empty string, or "null" string)
	 */
	private isEmptyValue(value: unknown): boolean {
		if (value === null || value === undefined) return true;
		const strVal = valueToString(value);
		return strVal === '' || strVal === 'null';
	}

	/**
	 * Compare two values for sorting (uses natural sort)
	 * Values are converted to strings for consistent comparison
	 */
	private compareValues(a: unknown, b: unknown): number {
		// For numbers, compare numerically
		if (typeof a === 'number' && typeof b === 'number') {
			return a - b;
		}

		// For dates, compare by timestamp
		if (a instanceof Date && b instanceof Date) {
			return a.getTime() - b.getTime();
		}

		// For booleans, compare as 0/1
		if (typeof a === 'boolean' && typeof b === 'boolean') {
			return (a ? 1 : 0) - (b ? 1 : 0);
		}

		// For everything else (including Bases Value objects), convert to string and use natural sort
		const strA = valueToString(a);
		const strB = valueToString(b);
		return naturalCompare(strA, strB);
	}

	/**
	 * Save presets to config
	 */
	private savePresets(): void {
		const json = this.filterService.savePresetsToJson();
		this.config.set('filterPresets', json);
	}

	/**
	 * Save page size to config
	 */
	private savePageSize(size: number): void {
		this.config.set('pageSize', String(size));
	}

	/**
	 * Get config value as string
	 */
	private getConfigValue(key: string, defaultValue: string): string {
		if (!this.config) return defaultValue;
		const value = this.config.get(key);
		if (value === undefined) return defaultValue;
		if (typeof value === 'string') return value;
		return valueToString(value) || defaultValue;
	}

	/**
	 * Get config value as boolean
	 */
	private getConfigBool(key: string, defaultValue: boolean): boolean {
		if (!this.config) return defaultValue;
		const value = this.config.get(key);
		if (value === undefined) return defaultValue;
		return value === true || value === 'true';
	}

	/**
	 * Get config value as number
	 */
	private getConfigNumber(key: string, defaultValue: number): number {
		if (!this.config) return defaultValue;
		const value = this.config.get(key);
		if (value === undefined) return defaultValue;
		if (typeof value === 'number') return value;
		const strValue = typeof value === 'string' ? value : valueToString(value);
		const num = parseInt(strValue, 10);
		return isNaN(num) ? defaultValue : num;
	}

	/**
	 * Static method to get view options for Bases UI
	 */
	static getViewOptions(): ViewOption[] {
		return getViewOptions();
	}
}
