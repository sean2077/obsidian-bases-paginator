import type { PaginationState } from "../types";
import { DEFAULT_PAGE_SIZE } from "../utils/constants";
import { calculateTotalPages, clamp } from "../utils/helpers";

const MAX_PAGE_SIZE = 1000;

/**
 * Service for managing pagination state and logic
 */
export class PaginationService {
	private state: PaginationState = {
		currentPage: 1,
		pageSize: DEFAULT_PAGE_SIZE,
		totalItems: 0,
		totalPages: 1,
	};

	/**
	 * Get current pagination state
	 */
	getState(): PaginationState {
		return { ...this.state };
	}

	/**
	 * Set the page size
	 */
	setPageSize(size: number): boolean {
		if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE || size === this.state.pageSize) {
			return false;
		}

		this.state.pageSize = size;
		this.state.totalPages = calculateTotalPages(this.state.totalItems, size);
		// Reset to page 1 when page size changes, or adjust if current page is now out of range
		this.state.currentPage = clamp(this.state.currentPage, 1, this.state.totalPages);
		return true;
	}

	/**
	 * Update total items count (called when data changes)
	 */
	setTotalItems(total: number): void {
		const safeTotal = Number.isInteger(total) && total >= 0 ? total : 0;
		this.state.totalItems = safeTotal;
		this.state.totalPages = calculateTotalPages(safeTotal, this.state.pageSize);
		// Adjust current page if it's now out of range
		this.state.currentPage = clamp(this.state.currentPage, 1, this.state.totalPages);
	}

	/**
	 * Go to a specific page
	 */
	goToPage(page: number): boolean {
		if (!Number.isInteger(page)) return false;
		const newPage = clamp(page, 1, this.state.totalPages);
		if (newPage !== this.state.currentPage) {
			this.state.currentPage = newPage;
			return true;
		}
		return false;
	}
}
