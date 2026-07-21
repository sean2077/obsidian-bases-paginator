import { describe, expect, it } from "vitest";
import { Paginator, type EntryGroup } from "../src/services/Paginator";

describe("Paginator interface", () => {
	const groups: EntryGroup<number, string>[] = [
		{ entries: [1, 2, 3], key: "A", showHeader: true },
		{ entries: [4, 5, 6], key: "B", showHeader: true },
	];

	it("returns state and a group-preserving page in one call", () => {
		const paginator = new Paginator();

		expect(paginator.paginate(groups, { page: 1, pageSize: 4 })).toEqual({
			groups: [
				{ entries: [1, 2, 3], key: "A", showHeader: true },
				{ entries: [4], key: "B", showHeader: true },
			],
			state: { currentPage: 1, pageSize: 4, totalItems: 6, totalPages: 2 },
		});
		expect(paginator.paginate(groups, { page: 2 }).groups).toEqual([
			{ entries: [5, 6], key: "B", showHeader: true },
		]);
	});

	it("clamps page state after page-size and data changes", () => {
		const paginator = new Paginator();
		const entries = Array.from({ length: 51 }, (_, index) => index + 1);

		expect(paginator.paginate([{ entries, showHeader: false }], { page: 3 }).state.currentPage).toBe(3);
		const resized = paginator.paginate([{ entries, showHeader: false }], { pageSize: 50 });
		expect(resized.state).toMatchObject({ currentPage: 2, totalPages: 2 });
		expect(resized.groups[0]?.entries).toEqual([51]);

		const shrunk = paginator.paginate([{ entries: entries.slice(0, 10), showHeader: false }]);
		expect(shrunk.state).toMatchObject({ currentPage: 1, totalItems: 10, totalPages: 1 });
	});

	it("ignores invalid requests and safely clamps hostile page numbers", () => {
		const paginator = new Paginator();
		const entries = Array.from({ length: 100 }, (_, index) => index);
		paginator.paginate([{ entries, showHeader: false }], { page: 2, pageSize: 37 });

		for (const page of [Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(paginator.paginate([{ entries, showHeader: false }], { page }).state.currentPage).toBe(2);
		}
		for (const pageSize of [0, -1, 1.5, 1001, Number.NaN]) {
			expect(paginator.paginate([{ entries, showHeader: false }], { pageSize }).state.pageSize).toBe(37);
		}
		expect(paginator.paginate([{ entries, showHeader: false }], { page: -10 }).state.currentPage).toBe(1);
		expect(paginator.paginate([{ entries, showHeader: false }], { page: 99 }).state.currentPage).toBe(3);
	});

	it("bounds a 10,000-entry result to the requested page", () => {
		const entries = Array.from({ length: 10_000 }, (_, index) => index);
		const page = new Paginator().paginate([{ entries, showHeader: false }], { page: 200, pageSize: 25 });

		expect(page.state).toEqual({ currentPage: 200, pageSize: 25, totalItems: 10_000, totalPages: 400 });
		expect(page.groups).toHaveLength(1);
		expect(page.groups[0]?.entries).toEqual(entries.slice(4_975, 5_000));
	});

	it("ignores empty groups and returns a stable empty state", () => {
		const paginator = new Paginator();
		const withEmptyGroups: EntryGroup<number, string>[] = [
			{ entries: [], key: "empty", showHeader: true },
			...groups,
			{ entries: [], key: "tail", showHeader: true },
		];

		expect(paginator.paginate(withEmptyGroups, { pageSize: 1 }).groups).toEqual([
			{ entries: [1], key: "A", showHeader: true },
		]);
		expect(paginator.paginate([]).state).toEqual({
			currentPage: 1,
			pageSize: 1,
			totalItems: 0,
			totalPages: 1,
		});
	});
});
