import { DEFAULT_PAGE_SIZE, isValidPageSize } from "../utils/pageSize";
import { calculateTotalPages, clamp } from "../utils/helpers";

export interface EntryGroup<T, K = unknown> {
	entries: T[];
	key?: K;
	showHeader: boolean;
}

export interface PaginationState {
	readonly currentPage: number;
	readonly pageSize: number;
	readonly totalItems: number;
	readonly totalPages: number;
}

export interface PaginationRequest {
	readonly page?: number;
	readonly pageSize?: number;
}

export interface PaginatedPage<T, K = unknown> {
	readonly groups: EntryGroup<T, K>[];
	readonly state: PaginationState;
}

interface IndexedGroup<T, K> {
	readonly group: EntryGroup<T, K>;
	readonly start: number;
	readonly end: number;
}

/** Indexes each native data update once; page navigation only visits the page's groups. */
export class Paginator<T, K = unknown> {
	private currentPage = 1;
	private pageSize = DEFAULT_PAGE_SIZE;
	private totalItems = 0;
	private groups: IndexedGroup<T, K>[] = [];

	/** Call on every data update, including updates that mutate existing arrays in place. */
	setGroups(groups: readonly EntryGroup<T, K>[]): void {
		this.groups = [];
		this.totalItems = 0;
		for (const group of groups) {
			const count = group.entries.length;
			if (count === 0) continue;
			const start = this.totalItems;
			this.totalItems += count;
			this.groups.push({ group, start, end: this.totalItems });
		}
	}

	paginate(request: PaginationRequest = {}): PaginatedPage<T, K> {
		if (isValidPageSize(request.pageSize) && request.pageSize !== this.pageSize) {
			// Keep the previously visible first item on screen when resizing a page.
			const firstItem = (this.currentPage - 1) * this.pageSize;
			this.pageSize = request.pageSize;
			this.currentPage = Math.floor(firstItem / this.pageSize) + 1;
		}

		const totalPages = calculateTotalPages(this.totalItems, this.pageSize);
		if (typeof request.page === "number" && Number.isInteger(request.page)) this.currentPage = request.page;
		this.currentPage = clamp(this.currentPage, 1, totalPages);

		return {
			groups: this.sliceGroups(),
			state: {
				currentPage: this.currentPage,
				pageSize: this.pageSize,
				totalItems: this.totalItems,
				totalPages,
			},
		};
	}

	private sliceGroups(): EntryGroup<T, K>[] {
		const start = (this.currentPage - 1) * this.pageSize;
		const end = Math.min(start + this.pageSize, this.totalItems);
		const result: EntryGroup<T, K>[] = [];

		for (let index = this.findGroup(start); index < this.groups.length; index++) {
			const indexed = this.groups[index];
			if (!indexed || indexed.start >= end) break;
			result.push({
				...indexed.group,
				entries: indexed.group.entries.slice(Math.max(0, start - indexed.start), end - indexed.start),
			});
		}
		return result;
	}

	/** Find the first nonempty group whose exclusive end falls after the page start. */
	private findGroup(offset: number): number {
		let low = 0;
		let high = this.groups.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			const indexed = this.groups[middle];
			if (indexed && indexed.end <= offset) low = middle + 1;
			else high = middle;
		}
		return low;
	}
}
