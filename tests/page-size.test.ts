import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE, isValidPageSize } from "../src/utils/pageSize";

describe("page-size invariant", () => {
	it("has one inclusive integer range and a valid default", () => {
		expect(isValidPageSize(MIN_PAGE_SIZE)).toBe(true);
		expect(isValidPageSize(MAX_PAGE_SIZE)).toBe(true);
		expect(isValidPageSize(DEFAULT_PAGE_SIZE)).toBe(true);
	});

	it.each([0, -1, 1.5, 1001, Number.NaN, Number.POSITIVE_INFINITY, "25", null, undefined])(
		"rejects hostile value %s",
		(value) => {
			expect(isValidPageSize(value)).toBe(false);
		}
	);
});
