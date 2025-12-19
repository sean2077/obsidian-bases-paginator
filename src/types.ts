import type { BasesPropertyId, TFile } from 'obsidian';

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
 * Table renderer options
 */
export interface TableRendererOptions {
	enableQuickFilters: boolean;
	stickyHeader: boolean;
	onCellClick: (propertyId: BasesPropertyId, value: string) => void;
	onRowClick: (file: TFile) => void;
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
	enableQuickFilters: boolean;
	showFilterBar: boolean;
	stickyHeader: boolean;
}
