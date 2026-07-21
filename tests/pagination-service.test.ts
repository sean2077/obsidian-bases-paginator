import { describe, expect, it } from "vitest";
import { PaginationService } from "../src/services/PaginationService";

describe("PaginationService page bounds", () => {
	it("clamps pages after item counts and page sizes change", () => {
		const service = new PaginationService();
		service.setTotalItems(51);
		service.goToPage(3);
		expect(service.getState()).toMatchObject({ currentPage: 3, totalPages: 3 });

		service.setPageSize(50);
		expect(service.getState()).toMatchObject({ currentPage: 2, totalPages: 2 });
		service.goToPage(99);
		expect(service.getState().currentPage).toBe(2);
	});

	it("rejects non-finite page navigation and hostile totals", () => {
		const service = new PaginationService();
		service.setTotalItems(100);
		expect(service.goToPage(Number.NaN)).toBe(false);
		expect(service.goToPage(Number.POSITIVE_INFINITY)).toBe(false);
		expect(service.getState().currentPage).toBe(1);

		service.setTotalItems(-20);
		expect(service.getState()).toMatchObject({ currentPage: 1, totalItems: 0, totalPages: 1 });
		service.setTotalItems(Number.NaN);
		expect(service.getState().totalItems).toBe(0);
	});

	it("accepts only integer page sizes from 1 through 1000", () => {
		const service = new PaginationService();
		expect(service.setPageSize(1)).toBe(true);
		expect(service.setPageSize(1000)).toBe(true);
		expect(service.setPageSize(0)).toBe(false);
		expect(service.setPageSize(1001)).toBe(false);
		expect(service.setPageSize(2.5)).toBe(false);
		expect(service.getState().pageSize).toBe(1000);
	});
});
