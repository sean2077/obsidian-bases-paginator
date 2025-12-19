import type { PageSizeOption, BasesPaginatorSettings } from '../types';

/**
 * View type identifier for registration
 */
export const VIEW_TYPE = 'paginated-table';

/**
 * View display name shown in Bases UI
 */
export const VIEW_NAME = 'Paginated Table';

/**
 * View icon (Lucide icon name)
 */
export const VIEW_ICON = 'table-2';

/**
 * Default page size options
 */
export const PAGE_SIZE_OPTIONS: PageSizeOption[] = [
	{ value: 10, label: '10' },
	{ value: 25, label: '25' },
	{ value: 50, label: '50' },
	{ value: 100, label: '100' },
	{ value: 'custom', label: 'Custom...' },
];

/**
 * Default page size
 */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Search debounce delay in milliseconds
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: BasesPaginatorSettings = {
	defaultPageSize: DEFAULT_PAGE_SIZE,
	showSearchBox: true,
	showFilterBar: true,
	stickyHeader: true,
};

/**
 * CSS class prefix for all plugin elements
 */
export const CSS_PREFIX = 'bp';

/**
 * CSS classes used throughout the plugin
 */
export const CSS_CLASSES = {
	// Container
	container: `${CSS_PREFIX}-container`,

	// Filter bar
	filterBar: `${CSS_PREFIX}-filter-bar`,
	searchSection: `${CSS_PREFIX}-search-section`,
	searchInput: `${CSS_PREFIX}-search-input`,
	activeFilters: `${CSS_PREFIX}-active-filters`,
	presetSection: `${CSS_PREFIX}-preset-section`,
	clearFiltersBtn: `${CSS_PREFIX}-clear-filters-btn`,

	// Table
	tableContainer: `${CSS_PREFIX}-table-container`,
	table: `${CSS_PREFIX}-table`,
	tableHeader: `${CSS_PREFIX}-table-header`,
	tableHeaderSticky: `${CSS_PREFIX}-table-header-sticky`,
	tableHeaderSortable: `${CSS_PREFIX}-table-header-sortable`,
	tableHeaderSorted: `${CSS_PREFIX}-table-header-sorted`,
	tableHeaderContent: `${CSS_PREFIX}-table-header-content`,
	sortIndicator: `${CSS_PREFIX}-sort-indicator`,
	tableRow: `${CSS_PREFIX}-table-row`,
	tableCell: `${CSS_PREFIX}-table-cell`,
	tableCellEmpty: `${CSS_PREFIX}-table-cell-empty`,

	// Pagination bar
	paginationBar: `${CSS_PREFIX}-pagination-bar`,
	navContainer: `${CSS_PREFIX}-nav-container`,
	paginationBtn: `${CSS_PREFIX}-pagination-btn`,
	paginationBtnDisabled: `${CSS_PREFIX}-pagination-btn-disabled`,
	pageInfo: `${CSS_PREFIX}-page-info`,
	itemInfo: `${CSS_PREFIX}-item-info`,
	pageSizeSelector: `${CSS_PREFIX}-page-size-selector`,

	// Empty state
	emptyState: `${CSS_PREFIX}-empty-state`,

	// Preset selector
	presetSelector: `${CSS_PREFIX}-preset-selector`,
	savePresetBtn: `${CSS_PREFIX}-save-preset-btn`,
	presetNameInput: `${CSS_PREFIX}-preset-name-input`,

	// Layout
	layoutOrder1: `${CSS_PREFIX}-order-1`,
	layoutOrder2: `${CSS_PREFIX}-order-2`,
	layoutOrder3: `${CSS_PREFIX}-order-3`,

	// Utility
	hidden: `${CSS_PREFIX}-hidden`,
	customPageSizeInput: `${CSS_PREFIX}-custom-page-size-input`,
} as const;
