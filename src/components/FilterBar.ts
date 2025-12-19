import type { BasesViewConfig, BasesPropertyId } from 'obsidian';
import type { FilterBarOptions, QuickFilter, FilterPreset } from '../types';
import { CSS_CLASSES } from '../utils/constants';
import { SearchBox } from './SearchBox';
import { QuickFilterChip } from './QuickFilterChip';
import { PresetSelector } from './PresetSelector';

/**
 * Filter toolbar component containing search, active filters, and preset selector
 */
export class FilterBar {
	private containerEl: HTMLElement;
	private searchSection: HTMLElement;
	private activeFiltersEl: HTMLElement;
	private presetSection: HTMLElement;

	private searchBox: SearchBox;
	private presetSelector: PresetSelector;
	private chips: QuickFilterChip[] = [];

	private config: BasesViewConfig;
	private options: FilterBarOptions;

	constructor(
		containerEl: HTMLElement,
		config: BasesViewConfig,
		options: FilterBarOptions,
		presets: FilterPreset[],
		activePresetId: string | null
	) {
		this.containerEl = containerEl;
		this.config = config;
		this.options = options;

		this.containerEl.addClass(CSS_CLASSES.filterBar);

		// Search section
		this.searchSection = this.containerEl.createDiv();
		this.searchBox = new SearchBox(this.searchSection, {
			placeholder: 'Search...',
			onSearch: options.onSearchChange,
		});

		// Active filters section
		this.activeFiltersEl = this.containerEl.createDiv(CSS_CLASSES.activeFilters);

		// Preset section
		this.presetSection = this.containerEl.createDiv();
		this.presetSelector = new PresetSelector(this.presetSection, {
			presets,
			activePresetId,
			onPresetSelect: options.onPresetSelect,
			onSavePreset: () => {
				this.promptSavePreset();
			},
		});
	}

	/**
	 * Update the active filters display
	 */
	updateFilters(filters: QuickFilter[]): void {
		// Clear existing chips
		this.activeFiltersEl.empty();
		this.chips = [];

		// Create chips for each filter
		for (const filter of filters) {
			const displayName = this.getPropertyDisplayName(filter.propertyId);
			const chip = new QuickFilterChip(this.activeFiltersEl, {
				filter,
				propertyDisplayName: displayName,
				onRemove: () => {
					this.options.onFilterRemove(filter);
				},
			});
			this.chips.push(chip);
		}

		// Add clear all button if there are filters
		if (filters.length > 0) {
			const clearBtn = this.activeFiltersEl.createEl('button', {
				text: 'Clear all',
				cls: CSS_CLASSES.clearFiltersBtn,
			});
			clearBtn.addEventListener('click', () => {
				this.options.onFiltersClear();
			});
		}
	}

	/**
	 * Update search box value
	 */
	setSearchQuery(query: string): void {
		this.searchBox.setValue(query);
	}

	/**
	 * Update preset selector
	 */
	updatePresets(presets: FilterPreset[], activePresetId: string | null): void {
		this.presetSelector.updatePresets(presets, activePresetId);
	}

	/**
	 * Get property display name from config
	 */
	private getPropertyDisplayName(propertyId: BasesPropertyId): string {
		return this.config.getDisplayName(propertyId);
	}

	/**
	 * Prompt user to save current filters as preset
	 */
	private promptSavePreset(): void {
		const name = prompt('Enter preset name:');
		if (name && name.trim()) {
			this.options.onPresetSave(name.trim());
		}
	}

	/**
	 * Show/hide the filter bar
	 */
	setVisible(visible: boolean): void {
		this.containerEl.style.display = visible ? 'flex' : 'none';
	}
}
