import {
	BasesView,
	type App,
	type BasesEntry,
	type BasesPropertyId,
	type QueryController,
	type TFile,
	type ViewOption,
} from 'obsidian';

import type { QuickFilter, SortDirection, SortState } from '../types';
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

	private initialized = false;

	constructor(app: App, controller: QueryController, containerEl: HTMLElement) {
		super(controller);
		this._app = app;
		this._containerEl = containerEl;

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

		// Use CSS order to control layout
		// Filter bar always first
		this.filterBarEl.style.order = '1';

		if (position === 'top') {
			// Pagination -> Table
			this.paginationBarEl.style.order = '2';
			this.tableContainerEl.style.order = '3';
		} else {
			// Table -> Pagination
			this.tableContainerEl.style.order = '2';
			this.paginationBarEl.style.order = '3';
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
					this.filterService.activatePreset(presetId);
				},
				onPresetSave: (name) => {
					const preset = this.filterService.saveCurrentAsPreset(name);
					this.savePresets();
					this.filterBar?.updatePresets(
						this.filterService.getPresets(),
						preset.id
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
				enableQuickFilters: this.getConfigBool('enableQuickFilters', VIEW_OPTION_DEFAULTS.enableQuickFilters),
				stickyHeader: this.getConfigBool('stickyHeader', VIEW_OPTION_DEFAULTS.stickyHeader),
				onCellClick: (propId, value) => {
					this.addQuickFilter(propId, value);
				},
				onRowClick: (file) => {
					this.openFile(file);
				},
				onSort: (propId, direction) => {
					this.handleSort(propId, direction);
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
	 * Get visible properties from config
	 */
	private getVisibleProperties(): BasesPropertyId[] {
		// Use the properties from data result, which respects column visibility
		return this.data.properties;
	}

	/**
	 * Add a quick filter
	 */
	private addQuickFilter(propertyId: BasesPropertyId, value: string): void {
		const filter: QuickFilter = {
			propertyId,
			value,
			operator: 'equals',
		};
		this.filterService.addQuickFilter(filter);
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

			const comparison = this.compareValues(valueA, valueB);
			return direction === 'ASC' ? comparison : -comparison;
		});
	}

	/**
	 * Compare two values for sorting
	 */
	private compareValues(a: unknown, b: unknown): number {
		// Handle null/undefined values
		if (a == null && b == null) return 0;
		if (a == null) return -1;
		if (b == null) return 1;

		// Compare based on type
		if (typeof a === 'string' && typeof b === 'string') {
			return a.localeCompare(b);
		}
		if (typeof a === 'number' && typeof b === 'number') {
			return a - b;
		}
		if (a instanceof Date && b instanceof Date) {
			return a.getTime() - b.getTime();
		}
		if (typeof a === 'boolean' && typeof b === 'boolean') {
			return (a ? 1 : 0) - (b ? 1 : 0);
		}

		// Fallback to string comparison
		return String(a).localeCompare(String(b));
	}

	/**
	 * Open a file in a new leaf
	 */
	private openFile(file: TFile): void {
		this._app.workspace.getLeaf().openFile(file);
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
		return value !== undefined ? String(value) : defaultValue;
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
		const num = parseInt(String(value), 10);
		return isNaN(num) ? defaultValue : num;
	}

	/**
	 * Static method to get view options for Bases UI
	 */
	static getViewOptions(): ViewOption[] {
		return getViewOptions();
	}
}
