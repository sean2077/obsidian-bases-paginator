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
	 * Get current page number
	 */
	getCurrentPage(): number {
		return this.state.currentPage;
	}

	/**
	 * Get page size
	 */
	getPageSize(): number {
		return this.state.pageSize;
	}

	/**
	 * Get total number of pages
	 */
	getTotalPages(): number {
		return this.state.totalPages;
	}

	/**
	 * Get total number of items
	 */
	getTotalItems(): number {
		return this.state.totalItems;
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
	 * Go to the first page
	 */
	goToFirst(): void {
		this.goToPage(1);
	}

	/**
	 * Go to the last page
	 */
	goToLast(): void {
		this.goToPage(this.state.totalPages);
	}

	/**
	 * Go to the previous page
	 */
	goToPrevious(): void {
		this.goToPage(this.state.currentPage - 1);
	}

	/**
	 * Go to the next page
	 */
	goToNext(): void {
		this.goToPage(this.state.currentPage + 1);
	}

	/**
	 * Check if can go to previous page
	 */
	canGoPrevious(): boolean {
		return this.state.currentPage > 1;
	}

	/**
	 * Check if can go to next page
	 */
	canGoNext(): boolean {
		return this.state.currentPage < this.state.totalPages;
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

	/**
	 * Get display info for current page
	 */
	getDisplayInfo(): { start: number; end: number; total: number } {
		const { start, end } = getPageIndices(
			this.state.currentPage,
			this.state.pageSize,
			this.state.totalItems
		);
		return {
			start: this.state.totalItems > 0 ? start + 1 : 0,
			end,
			total: this.state.totalItems,
		};
	}
}
