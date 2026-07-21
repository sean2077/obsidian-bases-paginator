import { describe, expect, it } from "vitest";
import { countGroupedEntries, getGroupedPage, type EntryGroup } from "../src/services/GroupedPaginationService";

describe("grouped pagination boundaries", () => {
	const groups: EntryGroup<number, string>[] = [
		{ entries: [1, 2, 3], key: "A", showHeader: true },
		{ entries: [4, 5, 6], key: "B", showHeader: true },
	];

	it("preserves a group boundary when a page spans two groups", () => {
		expect(getGroupedPage(groups, 1, 4)).toEqual([
			{ entries: [1, 2, 3], key: "A", showHeader: true },
			{ entries: [4], key: "B", showHeader: true },
		]);
		expect(getGroupedPage(groups, 2, 4)).toEqual([{ entries: [5, 6], key: "B", showHeader: true }]);
	});

	it("counts entries rather than group headers", () => {
		expect(countGroupedEntries(groups)).toBe(6);
		expect(getGroupedPage(groups, 99, 4)).toEqual([]);
	});

	it("bounds a large dataset to one page of rendered entries", () => {
		const entries = Array.from({ length: 10_000 }, (_, index) => index);
		const page = getGroupedPage([{ entries, showHeader: false }], 200, 25);
		expect(page).toHaveLength(1);
		expect(page[0]?.entries).toEqual(entries.slice(4_975, 5_000));
	});

	it("handles empty groups and non-finite pagination input safely", () => {
		const withEmptyGroups: EntryGroup<number, string>[] = [
			{ entries: [], key: "empty", showHeader: true },
			...groups,
			{ entries: [], key: "tail", showHeader: true },
		];
		expect(getGroupedPage(withEmptyGroups, Number.NaN, Number.NaN)).toEqual([
			{ entries: [1], key: "A", showHeader: true },
		]);
		expect(getGroupedPage([], 1, 25)).toEqual([]);
	});
});
