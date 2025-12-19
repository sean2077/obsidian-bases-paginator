import type { BasesEntry, BasesPropertyId } from 'obsidian';
import type { FilterState, QuickFilter, FilterPreset } from '../types';
import { generateId, containsIgnoreCase, safeJsonParse, valueToString } from '../utils/helpers';

/**
 * Service for managing filter state and applying filters to data
 */
export class FilterService {
	private state: FilterState;
	private presets: FilterPreset[];
	private visibleProperties: BasesPropertyId[];
	private onChange: () => void;

	constructor(onChange: () => void) {
		this.onChange = onChange;
		this.state = {
			searchQuery: '',
			quickFilters: [],
			activePresetId: null,
		};
		this.presets = [];
		this.visibleProperties = [];
	}

	/**
	 * Set visible properties (for search filtering)
	 */
	setVisibleProperties(properties: BasesPropertyId[]): void {
		this.visibleProperties = properties;
	}

	/**
	 * Get current filter state
	 */
	getState(): FilterState {
		return { ...this.state };
	}

	/**
	 * Get search query
	 */
	getSearchQuery(): string {
		return this.state.searchQuery;
	}

	/**
	 * Set search query
	 */
	setSearchQuery(query: string): void {
		this.state.searchQuery = query;
		this.state.activePresetId = null; // Clear preset when manually searching
		this.onChange();
	}

	/**
	 * Get all quick filters
	 */
	getQuickFilters(): QuickFilter[] {
		return [...this.state.quickFilters];
	}

	/**
	 * Add a quick filter
	 */
	addQuickFilter(filter: QuickFilter): void {
		// Check if filter already exists
		const exists = this.state.quickFilters.some(
			(f) => f.propertyId === filter.propertyId && f.value === filter.value
		);
		if (!exists) {
			this.state.quickFilters.push(filter);
			this.state.activePresetId = null; // Clear preset when manually filtering
			this.onChange();
		}
	}

	/**
	 * Remove a quick filter
	 */
	removeQuickFilter(propertyId: BasesPropertyId, value: string): void {
		this.state.quickFilters = this.state.quickFilters.filter(
			(f) => !(f.propertyId === propertyId && f.value === value)
		);
		this.state.activePresetId = null;
		this.onChange();
	}

	/**
	 * Clear all quick filters
	 */
	clearQuickFilters(): void {
		this.state.quickFilters = [];
		this.state.activePresetId = null;
		this.onChange();
	}

	/**
	 * Clear all filters (search + quick filters)
	 */
	clearAllFilters(): void {
		this.state.searchQuery = '';
		this.state.quickFilters = [];
		this.state.activePresetId = null;
		this.onChange();
	}

	/**
	 * Check if any filters are active
	 */
	hasActiveFilters(): boolean {
		return this.state.searchQuery.length > 0 || this.state.quickFilters.length > 0;
	}

	// --- Preset Management ---

	/**
	 * Get all presets
	 */
	getPresets(): FilterPreset[] {
		return [...this.presets];
	}

	/**
	 * Get active preset ID
	 */
	getActivePresetId(): string | null {
		return this.state.activePresetId;
	}

	/**
	 * Load presets from JSON string
	 */
	loadPresets(json: string): void {
		this.presets = safeJsonParse<FilterPreset[]>(json, []);
	}

	/**
	 * Save presets to JSON string
	 */
	savePresetsToJson(): string {
		return JSON.stringify(this.presets);
	}

	/**
	 * Activate a preset
	 */
	activatePreset(presetId: string | null): void {
		if (presetId === null) {
			this.state.activePresetId = null;
			return;
		}

		const preset = this.presets.find((p) => p.id === presetId);
		if (preset) {
			this.state.activePresetId = presetId;
			this.state.quickFilters = [...preset.filters];
			this.state.searchQuery = preset.searchQuery ?? '';
			this.onChange();
		}
	}

	/**
	 * Save current filters as a new preset
	 */
	saveCurrentAsPreset(name: string): FilterPreset {
		const preset: FilterPreset = {
			id: generateId(),
			name,
			filters: [...this.state.quickFilters],
			searchQuery: this.state.searchQuery || undefined,
		};
		this.presets.push(preset);
		this.state.activePresetId = preset.id;
		return preset;
	}

	/**
	 * Delete a preset
	 */
	deletePreset(presetId: string): void {
		this.presets = this.presets.filter((p) => p.id !== presetId);
		if (this.state.activePresetId === presetId) {
			this.state.activePresetId = null;
		}
	}

	// --- Filtering Logic ---

	/**
	 * Apply all active filters to entries
	 */
	filterEntries(entries: BasesEntry[]): BasesEntry[] {
		let result = entries;

		// Apply search query filter
		if (this.state.searchQuery) {
			result = this.applySearchFilter(result, this.state.searchQuery);
		}

		// Apply quick filters
		for (const filter of this.state.quickFilters) {
			result = this.applyQuickFilter(result, filter);
		}

		return result;
	}

	/**
	 * Apply search filter across all visible properties
	 */
	private applySearchFilter(entries: BasesEntry[], query: string): BasesEntry[] {
		const lowerQuery = query.toLowerCase();

		return entries.filter((entry) => {
			for (const propId of this.visibleProperties) {
				const value = entry.getValue(propId);
				if (value !== null && value !== undefined) {
					const strValue = this.valueToSearchString(value);
					if (containsIgnoreCase(strValue, lowerQuery)) {
						return true;
					}
				}
			}
			return false;
		});
	}

	/**
	 * Apply a single quick filter
	 */
	private applyQuickFilter(entries: BasesEntry[], filter: QuickFilter): BasesEntry[] {
		return entries.filter((entry) => {
			const value = entry.getValue(filter.propertyId);
			const strValue = this.valueToSearchString(value);

			switch (filter.operator) {
				case 'equals':
					return strValue === filter.value;
				case 'contains':
					return containsIgnoreCase(strValue, filter.value);
				case 'not_equals':
					return strValue !== filter.value;
				default:
					return true;
			}
		});
	}

	/**
	 * Convert a value to a searchable string
	 */
	private valueToSearchString(value: unknown): string {
		if (value === null || value === undefined) {
			return '';
		}
		if (Array.isArray(value)) {
			return value.map((item) => valueToString(item)).join(' ');
		}
		return valueToString(value);
	}
}
