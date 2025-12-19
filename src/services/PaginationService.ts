import type { PaginationState } from '../types';
import { DEFAULT_PAGE_SIZE } from '../utils/constants';
import { calculateTotalPages, clamp, getPageIndices } from '../utils/helpers';

/**
 * Service for managing pagination state and logic
 */
export class PaginationService {
	private state: PaginationState;
	private onChange: () => void;

	constructor(onChange: () => void) {
		this.onChange = onChange;
		this.state = {
			currentPage: 1,
			pageSize: DEFAULT_PAGE_SIZE,
			totalItems: 0,
			totalPages: 1,
		};
	}

	/**
	 * Get current pagination state
	 */
	getState(): PaginationState {
		return { ...this.state };
	}

	/**
	 * Set the page size
	 */
	setPageSize(size: number): void {
		if (size <= 0) return;

		this.state.pageSize = size;
		this.state.totalPages = calculateTotalPages(this.state.totalItems, size);
		// Reset to page 1 when page size changes, or adjust if current page is now out of range
		this.state.currentPage = clamp(this.state.currentPage, 1, this.state.totalPages);
		this.onChange();
	}

	/**
	 * Update total items count (called when data changes)
	 */
	setTotalItems(total: number): void {
		this.state.totalItems = total;
		this.state.totalPages = calculateTotalPages(total, this.state.pageSize);
		// Adjust current page if it's now out of range
		this.state.currentPage = clamp(this.state.currentPage, 1, this.state.totalPages);
	}

	/**
	 * Go to a specific page
	 */
	goToPage(page: number): void {
		const newPage = clamp(page, 1, this.state.totalPages);
		if (newPage !== this.state.currentPage) {
			this.state.currentPage = newPage;
			this.onChange();
		}
	}

	/**
	 * Reset to first page (used when filters change)
	 */
	resetToFirst(): void {
		this.state.currentPage = 1;
	}

	/**
	 * Get the slice of data for the current page
	 */
	getPageData<T>(data: T[]): T[] {
		const { start, end } = getPageIndices(
			this.state.currentPage,
			this.state.pageSize,
			data.length
		);
		return data.slice(start, end);
	}
}
