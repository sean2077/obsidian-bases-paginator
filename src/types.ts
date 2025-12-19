import type { BasesPropertyId } from 'obsidian';

/**
 * Quick filter applied by clicking a cell value
 */
export interface QuickFilter {
	propertyId: BasesPropertyId;
	value: string;
	operator: 'equals' | 'contains' | 'not_equals';
}

/**
 * Preset filter configuration
 */
export interface FilterPreset {
	id: string;
	name: string;
	filters: QuickFilter[];
	searchQuery?: string;
}

/**
 * Active filter state
 */
export interface FilterState {
	searchQuery: string;
	quickFilters: QuickFilter[];
	activePresetId: string | null;
}

/**
 * Pagination state
 */
export interface PaginationState {
	currentPage: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;
}

/**
 * Complete view state
 */
export interface ViewState {
	pagination: PaginationState;
	filter: FilterState;
}

/**
 * Pagination bar options
 */
export interface PaginationBarOptions {
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
}

/**
 * Filter bar options
 */
export interface FilterBarOptions {
	onSearchChange: (query: string) => void;
	onFilterRemove: (filter: QuickFilter) => void;
	onFiltersClear: () => void;
	onPresetSelect: (presetId: string | null) => void;
	onPresetSave: (name: string) => void;
}

/**
 * Sort direction (matches Bases API)
 */
export type SortDirection = 'ASC' | 'DESC';

/**
 * Current sort state
 */
export interface SortState {
	propertyId: BasesPropertyId | null;
	direction: SortDirection;
}

/**
 * Table renderer options
 */
export interface TableRendererOptions {
	stickyHeader: boolean;
	filterableColumns: BasesPropertyId[];
	columnFilterData: Map<BasesPropertyId, string[]>;
	selectedColumnFilters: Map<BasesPropertyId, string[]>;
	onSort: (propertyId: BasesPropertyId, direction: SortDirection) => void;
	onColumnFilterChange: (propertyId: BasesPropertyId, values: string[]) => void;
	onToggleFilterable?: (propertyId: BasesPropertyId, enable: boolean) => void;
}

/**
 * Column filter state (multi-select)
 */
export interface ColumnFilter {
	propertyId: BasesPropertyId;
	values: string[];
}

/**
 * Search box options
 */
export interface SearchBoxOptions {
	placeholder?: string;
	debounceMs?: number;
	onSearch: (query: string) => void;
}

/**
 * Quick filter chip options
 */
export interface QuickFilterChipOptions {
	filter: QuickFilter;
	propertyDisplayName: string;
	onRemove: () => void;
}

/**
 * Preset selector options
 */
export interface PresetSelectorOptions {
	presets: FilterPreset[];
	activePresetId: string | null;
	onPresetSelect: (presetId: string | null) => void;
	onSavePreset: () => void;
}

/**
 * Page size option for dropdown
 */
export interface PageSizeOption {
	value: number | 'custom';
	label: string;
}

/**
 * Plugin settings stored in data.json
 */
export interface BasesPaginatorSettings {
	defaultPageSize: number;
	showSearchBox: boolean;
	showFilterBar: boolean;
	stickyHeader: boolean;
}
