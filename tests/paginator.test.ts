import { describe, expect, it } from "vitest";
import { Paginator, type EntryGroup } from "../src/services/Paginator";

describe("Paginator interface", () => {
	const groups: EntryGroup<number, string>[] = [
		{ entries: [1, 2, 3], key: "A", showHeader: true },
		{ entries: [4, 5, 6], key: "B", showHeader: true },
	];

	it("returns state and a group-preserving page from the current result", () => {
		const paginator = new Paginator<number, string>();
		paginator.setGroups(groups);

		expect(paginator.paginate({ page: 1, pageSize: 4 })).toEqual({
			groups: [
				{ entries: [1, 2, 3], key: "A", showHeader: true },
				{ entries: [4], key: "B", showHeader: true },
			],
			state: { currentPage: 1, pageSize: 4, totalItems: 6, totalPages: 2 },
		});
		expect(paginator.paginate({ page: 2 }).groups).toEqual([{ entries: [5, 6], key: "B", showHeader: true }]);
	});

	it("keeps the previously visible first item on screen when the page size changes", () => {
		const paginator = new Paginator<number>();
		const entries = Array.from({ length: 100 }, (_, index) => index + 1);
		paginator.setGroups([{ entries, showHeader: false }]);
		paginator.paginate({ page: 3 });

		const smaller = paginator.paginate({ pageSize: 10 });
		expect(smaller.state).toMatchObject({ currentPage: 6, pageSize: 10 });
		expect(smaller.groups[0]?.entries).toEqual(entries.slice(50, 60));

		const larger = paginator.paginate({ pageSize: 37 });
		expect(larger.state).toMatchObject({ currentPage: 2, pageSize: 37 });
		expect(larger.groups[0]?.entries).toContain(51);

		const requested = paginator.paginate({ page: 1, pageSize: 50 });
		expect(requested.state).toMatchObject({ currentPage: 1, pageSize: 50 });
		expect(requested.groups[0]?.entries).toEqual(entries.slice(0, 50));
	});

	it("clamps page state after data changes", () => {
		const paginator = new Paginator<number>();
		const entries = Array.from({ length: 51 }, (_, index) => index + 1);
		paginator.setGroups([{ entries, showHeader: false }]);
		expect(paginator.paginate({ page: 3 }).state.currentPage).toBe(3);

		paginator.setGroups([{ entries: entries.slice(0, 30), showHeader: false }]);
		const shrunk = paginator.paginate();
		expect(shrunk.state).toMatchObject({ currentPage: 2, totalItems: 30, totalPages: 2 });
		expect(shrunk.groups[0]?.entries).toEqual(entries.slice(25, 30));

		paginator.setGroups([]);
		expect(paginator.paginate()).toEqual({
			groups: [],
			state: { currentPage: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
		});
	});

	it("ignores invalid requests and safely clamps hostile page numbers", () => {
		const paginator = new Paginator<number>();
		const entries = Array.from({ length: 100 }, (_, index) => index);
		paginator.setGroups([{ entries, showHeader: false }]);
		paginator.paginate({ page: 2, pageSize: 37 });

		for (const page of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
			expect(paginator.paginate({ page }).state.currentPage).toBe(2);
		}
		for (const pageSize of [0, -1, 1.5, 1001, Number.NaN]) {
			expect(paginator.paginate({ pageSize }).state.pageSize).toBe(37);
		}
		expect(paginator.paginate({ page: -10 }).state.currentPage).toBe(1);
		expect(paginator.paginate({ page: 99 }).state.currentPage).toBe(3);
	});

	it("bounds a 10,000-entry result to the requested page without mutating its entries", () => {
		const entries = Array.from({ length: 10_000 }, (_, index) => ({ index }));
		const paginator = new Paginator<{ index: number }>();
		paginator.setGroups([{ entries, showHeader: false }]);
		const page = paginator.paginate({ page: 200, pageSize: 25 });

		expect(page.state).toEqual({ currentPage: 200, pageSize: 25, totalItems: 10_000, totalPages: 400 });
		expect(page.groups).toHaveLength(1);
		expect(page.groups[0]?.entries).toEqual(entries.slice(4_975, 5_000));
		expect(page.groups[0]?.entries[0]).toBe(entries[4_975]);
		page.groups[0]?.entries.pop();
		expect(entries).toHaveLength(10_000);
		expect(paginator.paginate().groups[0]?.entries).toHaveLength(25);
	});

	it("visits only current-page entries when navigating among 10,000 groups", () => {
		let entryArrayReads = 0;
		let entryReads = 0;
		const manyGroups: EntryGroup<number, number>[] = Array.from({ length: 10_000 }, (_, index) => {
			const entries = [index];
			Object.defineProperty(entries, 0, {
				get() {
					entryReads++;
					return index;
				},
			});
			return {
				get entries() {
					entryArrayReads++;
					return entries;
				},
				key: index,
				showHeader: true,
			};
		});
		const paginator = new Paginator<number, number>();
		paginator.setGroups(manyGroups);
		expect(entryReads).toBe(0);
		entryArrayReads = 0;

		const last = paginator.paginate({ page: 400, pageSize: 25 });
		expect(last.groups.flatMap((group) => group.entries)).toEqual(
			Array.from({ length: 25 }, (_, index) => 9_975 + index)
		);
		expect(entryArrayReads).toBeLessThanOrEqual(75);
		expect(entryReads).toBe(25);

		entryArrayReads = 0;
		entryReads = 0;
		const previous = paginator.paginate({ page: 399 });
		expect(previous.groups[0]?.key).toBe(9_950);
		expect(entryArrayReads).toBeLessThanOrEqual(75);
		expect(entryReads).toBe(25);
	});

	it("refreshes counts and boundaries when the host mutates existing group arrays", () => {
		const paginator = new Paginator<number, string>();
		const liveGroups: EntryGroup<number, string>[] = [
			{ entries: [1, 2, 3], key: "A", showHeader: true },
			{ entries: [4, 5], key: "B", showHeader: true },
		];
		paginator.setGroups(liveGroups);
		paginator.paginate({ page: 3, pageSize: 2 });

		liveGroups[0]?.entries.splice(0, 2);
		liveGroups[1]?.entries.push(6, 7, 8);
		paginator.setGroups(liveGroups);
		const updated = paginator.paginate();
		expect(updated.state).toMatchObject({ currentPage: 3, totalItems: 6 });
		expect(updated.groups).toEqual([{ entries: [7, 8], key: "B", showHeader: true }]);

		liveGroups.splice(1, 1);
		paginator.setGroups(liveGroups);
		expect(paginator.paginate()).toEqual({
			groups: [{ entries: [3], key: "A", showHeader: true }],
			state: { currentPage: 1, pageSize: 2, totalItems: 1, totalPages: 1 },
		});
	});

	it("skips empty groups and includes each entry once across exact group boundaries", () => {
		const paginator = new Paginator<number, string>();
		const withEmptyGroups: EntryGroup<number, string>[] = [
			{ entries: [], key: "empty", showHeader: true },
			groups[0]!,
			{ entries: [], key: "middle", showHeader: true },
			groups[1]!,
			{ entries: [], key: "tail", showHeader: true },
		];
		paginator.setGroups(withEmptyGroups);

		for (const pageSize of [1, 2, 3, 4, 6, 25]) {
			const visited: number[] = [];
			const totalPages = Math.ceil(6 / pageSize);
			for (let page = 1; page <= totalPages; page++) {
				const result = paginator.paginate({ page, pageSize });
				expect(result.state.totalPages).toBe(totalPages);
				const entries = result.groups.flatMap((group) => group.entries);
				expect(entries.length).toBeLessThanOrEqual(pageSize);
				expect(result.groups.every((group) => group.entries.length > 0)).toBe(true);
				visited.push(...entries);
			}
			expect(visited).toEqual([1, 2, 3, 4, 5, 6]);
		}
	});

	it("can render an empty state before the first native data update", () => {
		expect(new Paginator<number>().paginate()).toEqual({
			groups: [],
			state: { currentPage: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
		});
	});
});
