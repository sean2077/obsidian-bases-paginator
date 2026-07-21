/** Pagination state for the current view instance. */
export interface PaginationState {
	currentPage: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;
}

export interface PaginationBarOptions {
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
}

export interface PageSizeOption {
	value: number | "custom";
	label: string;
}

/**
 * Plugin settings stored in data.json.
 *
 * The two deprecated fields are retained so loading and saving settings remains
 * non-destructive for users upgrading from versions that provided local search.
 */
export interface BasesPaginatorSettings {
	defaultPageSize: number;
	stickyHeader: boolean;
	/** Legacy field retained while native Bases owns search. */
	showSearchBox: boolean;
	/** Legacy field retained while native Bases owns filters and named views. */
	showFilterBar: boolean;
}

export interface ViewSettings {
	pageSize: number;
	paginationPosition: "top" | "bottom";
	stickyHeader: boolean;
}
