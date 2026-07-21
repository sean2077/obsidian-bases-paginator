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

/** Owns page state, bounds, counting, and group-preserving slices. */
export class Paginator {
	private currentPage = 1;
	private pageSize = DEFAULT_PAGE_SIZE;

	paginate<T, K>(groups: EntryGroup<T, K>[], request: PaginationRequest = {}): PaginatedPage<T, K> {
		if (isValidPageSize(request.pageSize)) this.pageSize = request.pageSize;

		const totalItems = groups.reduce((total, group) => total + group.entries.length, 0);
		const totalPages = calculateTotalPages(totalItems, this.pageSize);
		if (typeof request.page === "number" && Number.isInteger(request.page)) this.currentPage = request.page;
		this.currentPage = clamp(this.currentPage, 1, totalPages);

		return {
			groups: sliceGroups(groups, this.currentPage, this.pageSize),
			state: {
				currentPage: this.currentPage,
				pageSize: this.pageSize,
				totalItems,
				totalPages,
			},
		};
	}
}

function sliceGroups<T, K>(groups: EntryGroup<T, K>[], page: number, pageSize: number): EntryGroup<T, K>[] {
	const start = (page - 1) * pageSize;
	const end = start + pageSize;
	const result: EntryGroup<T, K>[] = [];
	let offset = 0;

	for (const group of groups) {
		const sliceStart = Math.max(0, start - offset);
		const sliceEnd = Math.min(group.entries.length, end - offset);
		if (sliceStart < sliceEnd) {
			result.push({ ...group, entries: group.entries.slice(sliceStart, sliceEnd) });
		}
		offset += group.entries.length;
		if (offset >= end) break;
	}

	return result;
}
