import type { BasesEntry, BasesPropertyId } from 'obsidian';
import type { FilterState, QuickFilter, FilterPreset, PresetPagination } from '../types';
import { generateId, containsIgnoreCase, safeJsonParse, valueToString, isArrayLike, toArray, splitMultiValues } from '../utils/helpers';

/**
 * Service for managing filter state and applying filters to data
 */
export class FilterService {
	private state: FilterState;
	private presets: FilterPreset[];
	private visibleProperties: BasesPropertyId[];
	private columnFilters: Map<BasesPropertyId, string[]>;
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
		this.columnFilters = new Map();
	}

	/**
	 * Set visible properties (for search filtering)
	 */
	setVisibleProperties(properties: BasesPropertyId[]): void {
		this.visibleProperties = properties;
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
	 * Clear all filters (search + quick filters + column filters)
	 */
	clearAllFilters(): void {
		this.state.searchQuery = '';
		this.state.quickFilters = [];
		this.state.activePresetId = null;
		this.columnFilters.clear();
		this.onChange();
	}

	// --- Column Filter Management ---

	/**
	 * Set column filter values (multi-select)
	 */
	setColumnFilter(propertyId: BasesPropertyId, values: string[]): void {
		if (values.length === 0) {
			this.columnFilters.delete(propertyId);
		} else {
			this.columnFilters.set(propertyId, values);
		}
		this.state.activePresetId = null; // Clear preset when manually filtering
		this.onChange();
	}

	/**
	 * Get column filter values for a property
	 */
	getColumnFilterValues(propertyId: BasesPropertyId): string[] {
		return this.columnFilters.get(propertyId) || [];
	}

	/**
	 * Get all column filters as a Map
	 */
	getColumnFilters(): Map<BasesPropertyId, string[]> {
		return new Map(this.columnFilters);
	}

	/**
	 * Clear all column filters
	 */
	clearColumnFilters(): void {
		this.columnFilters.clear();
		this.onChange();
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
	 * Activate a preset (or clear all filters if null)
	 * Returns the preset's pagination settings if available
	 */
	activatePreset(presetId: string | null): PresetPagination | undefined {
		if (presetId === null) {
			// Clear all filters when switching to default
			this.state.activePresetId = null;
			this.state.searchQuery = '';
			this.state.quickFilters = [];
			this.columnFilters.clear();
			this.onChange();
			return undefined;
		}

		const preset = this.presets.find((p) => p.id === presetId);
		if (preset) {
			this.state.activePresetId = presetId;
			this.state.quickFilters = [...preset.filters];
			this.state.searchQuery = preset.searchQuery ?? '';

			// Restore column filters
			this.columnFilters.clear();
			if (preset.columnFilters) {
				for (const [propId, values] of Object.entries(preset.columnFilters)) {
					this.columnFilters.set(propId as BasesPropertyId, [...values]);
				}
			}

			this.onChange();

			// Return pagination settings if available
			if (preset.pageSize !== undefined && preset.currentPage !== undefined) {
				return { pageSize: preset.pageSize, currentPage: preset.currentPage };
			}
		}
		return undefined;
	}

	/**
	 * Convert columnFilters Map to plain object for serialization
	 */
	private serializeColumnFilters(): Record<string, string[]> | undefined {
		if (this.columnFilters.size === 0) return undefined;
		const obj: Record<string, string[]> = {};
		for (const [propId, values] of this.columnFilters) {
			obj[propId] = [...values];
		}
		return obj;
	}

	/**
	 * Update an existing preset with current filter state
	 */
	updatePreset(presetId: string, pagination: PresetPagination): void {
		const preset = this.presets.find((p) => p.id === presetId);
		if (!preset) return;

		preset.filters = [...this.state.quickFilters];
		preset.searchQuery = this.state.searchQuery || undefined;
		preset.columnFilters = this.serializeColumnFilters();
		preset.pageSize = pagination.pageSize;
		preset.currentPage = pagination.currentPage;
	}

	/**
	 * Save current filters as a new preset
	 */
	saveCurrentAsPreset(name: string, pagination: PresetPagination): FilterPreset {
		const preset: FilterPreset = {
			id: generateId(),
			name,
			filters: [...this.state.quickFilters],
			searchQuery: this.state.searchQuery || undefined,
			columnFilters: this.serializeColumnFilters(),
			pageSize: pagination.pageSize,
			currentPage: pagination.currentPage,
		};
		this.presets.push(preset);
		this.state.activePresetId = preset.id;
		return preset;
	}

	/**
	 * Delete a preset by ID
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

		// Apply column filters
		result = this.applyColumnFilters(result);

		return result;
	}

	/**
	 * Apply column filters (multi-select OR logic within column)
	 */
	private applyColumnFilters(entries: BasesEntry[]): BasesEntry[] {
		if (this.columnFilters.size === 0) {
			return entries;
		}

		return entries.filter((entry) => {
			// All column filters must match (AND between columns)
			for (const [propId, selectedValues] of this.columnFilters) {
				if (selectedValues.length === 0) continue;

				const value = entry.getValue(propId);
				const entryValues = this.extractAllValues(value);

				// At least one selected value must match (OR within column)
				const hasMatch = selectedValues.some((selectedVal) =>
					entryValues.some((entryVal) => entryVal === selectedVal)
				);

				if (!hasMatch) {
					return false;
				}
			}
			return true;
		});
	}

	/**
	 * Extract all values from a cell (handles arrays/lists and multi-value strings)
	 */
	private extractAllValues(value: unknown): string[] {
		if (value === null || value === undefined) {
			return [''];
		}
		if (isArrayLike(value)) {
			return toArray(value).map((item) => valueToString(item));
		}
		// Handle multi-value strings like "[[a]], [[b]]" from Bases Value objects
		const strVal = valueToString(value);
		return splitMultiValues(strVal);
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
		if (isArrayLike(value)) {
			return toArray(value).map((item) => valueToString(item)).join(' ');
		}
		return valueToString(value);
	}
}
