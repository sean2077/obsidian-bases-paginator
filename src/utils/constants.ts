import type { BasesPaginatorSettings, PageSizeOption } from "../types";
import { DEFAULT_PAGE_SIZE } from "./pageSize";

/** Stable external identifier used in .base files. */
export const VIEW_TYPE = "paginated-table";

export const VIEW_NAME = "Paginated table";
export const VIEW_ICON = "table-2";
export const PAGE_SIZE_OPTIONS: PageSizeOption[] = [
	{ value: 10, label: "10" },
	{ value: 25, label: "25" },
	{ value: 50, label: "50" },
	{ value: 100, label: "100" },
	{ value: "custom", label: "Custom" },
];

export const DEFAULT_SETTINGS: BasesPaginatorSettings = {
	defaultPageSize: DEFAULT_PAGE_SIZE,
	stickyHeader: true,
	showSearchBox: true,
	showFilterBar: true,
};

const CSS_PREFIX = "bp";

export const CSS_CLASSES = {
	container: `${CSS_PREFIX}-container`,
	tableContainer: `${CSS_PREFIX}-table-container`,
	table: `${CSS_PREFIX}-table`,
	tableHeader: `${CSS_PREFIX}-table-header`,
	tableHeaderSticky: `${CSS_PREFIX}-table-header-sticky`,
	tableRow: `${CSS_PREFIX}-table-row`,
	tableCell: `${CSS_PREFIX}-table-cell`,
	tableCellEmpty: `${CSS_PREFIX}-table-cell-empty`,
	groupRow: `${CSS_PREFIX}-group-row`,
	groupCell: `${CSS_PREFIX}-group-cell`,
	paginationBar: `${CSS_PREFIX}-pagination-bar`,
	navContainer: `${CSS_PREFIX}-nav-container`,
	paginationBtn: `${CSS_PREFIX}-pagination-btn`,
	pageInfo: `${CSS_PREFIX}-page-info`,
	itemInfo: `${CSS_PREFIX}-item-info`,
	pageSizeSelector: `${CSS_PREFIX}-page-size-selector`,
	customPageSizeInput: `${CSS_PREFIX}-custom-page-size-input`,
	customPageSizeError: `${CSS_PREFIX}-custom-page-size-error`,
	emptyState: `${CSS_PREFIX}-empty-state`,
	layoutOrder1: `${CSS_PREFIX}-order-1`,
	layoutOrder3: `${CSS_PREFIX}-order-3`,
} as const;
