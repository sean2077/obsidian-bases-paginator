export interface EntryGroup<T, K = unknown> {
	entries: T[];
	key?: K;
	showHeader: boolean;
}

const MAX_PAGE_SIZE = 1000;

export function countGroupedEntries<T>(groups: EntryGroup<T>[]): number {
	return groups.reduce((total, group) => total + group.entries.length, 0);
}

/** Slice a global page while preserving every group boundary represented on it. */
export function getGroupedPage<T, K>(groups: EntryGroup<T, K>[], page: number, pageSize: number): EntryGroup<T, K>[] {
	const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
	const safePageSize = Number.isInteger(pageSize) && pageSize >= 1 ? Math.min(pageSize, MAX_PAGE_SIZE) : 1;
	const start = (safePage - 1) * safePageSize;
	const end = start + safePageSize;
	const result: EntryGroup<T, K>[] = [];
	let offset = 0;

	for (const group of groups) {
		const groupEnd = offset + group.entries.length;
		const sliceStart = Math.max(0, start - offset);
		const sliceEnd = Math.min(group.entries.length, end - offset);
		if (sliceStart < sliceEnd) {
			result.push({ ...group, entries: group.entries.slice(sliceStart, sliceEnd) });
		}
		offset = groupEnd;
		if (offset >= end) break;
	}

	return result;
}
