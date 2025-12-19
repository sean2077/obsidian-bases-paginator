import {
	BasesView,
	type App,
	type BasesPropertyId,
	type QueryController,
	type TFile,
	type ViewOption,
} from 'obsidian';

import type { QuickFilter } from '../types';
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

	private filterBar!: FilterBar;
	private tableRenderer!: TableRenderer;
	private paginationBar!: PaginationBar;

	private paginationService: PaginationService;
	private filterService: FilterService;

	constructor(app: App, controller: QueryController, containerEl: HTMLElement) {
		super(controller);
		this._app = app;
		this._containerEl = containerEl;

		// Initialize services
		this.paginationService = new PaginationService(() => this.onStateChange());
		this.filterService = new FilterService(() => this.onFilterChange());

		// Build UI structure
		this.buildUI();
	}

	/**
	 * Build the UI structure
	 */
	private buildUI(): void {
		this._containerEl.addClass(CSS_CLASSES.container);

		// Filter bar container
		this.filterBarEl = this._containerEl.createDiv();

		// Table container
		this.tableContainerEl = this._containerEl.createDiv();

		// Pagination bar container
		this.paginationBarEl = this._containerEl.createDiv();

		// Initialize components (will be configured in onDataUpdated)
		this.initializeComponents();
	}

	/**
	 * Initialize UI components
	 */
	private initializeComponents(): void {
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
					this.filterBar.updatePresets(
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
		// Update visible properties for search filtering
		const properties = this.getVisibleProperties();
		this.filterService.setVisibleProperties(properties);

		// Apply filters and pagination
		this.renderData();

		// Update filter bar visibility
		const showFilterBar = this.getConfigBool('showFilterBar', VIEW_OPTION_DEFAULTS.showFilterBar);
		this.filterBar.setVisible(showFilterBar);
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
		// Get data from Bases
		const allEntries = this.data.data;
		const properties = this.getVisibleProperties();

		// Apply filters
		const filteredEntries = this.filterService.filterEntries(allEntries);

		// Update pagination with filtered count
		this.paginationService.setTotalItems(filteredEntries.length);

		// Get current page data
		const pagedEntries = this.paginationService.getPageData(filteredEntries);

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
		const value = this.config.get(key);
		return value !== undefined ? String(value) : defaultValue;
	}

	/**
	 * Get config value as boolean
	 */
	private getConfigBool(key: string, defaultValue: boolean): boolean {
		const value = this.config.get(key);
		if (value === undefined) return defaultValue;
		return value === true || value === 'true';
	}

	/**
	 * Get config value as number
	 */
	private getConfigNumber(key: string, defaultValue: number): number {
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
