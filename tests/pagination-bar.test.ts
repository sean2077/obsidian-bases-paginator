import { describe, expect, it, vi } from "vitest";
import { PaginationBar } from "../src/components/PaginationBar";

describe("PaginationBar DOM click events", () => {
	it("emits a bounded next-page request and renders item ranges", () => {
		const container = document.body.createDiv();
		const onPageChange = vi.fn();
		const bar = new PaginationBar(container, {
			onPageChange,
			onPageSizeChange: vi.fn(),
		});
		bar.update({ currentPage: 2, totalPages: 3, totalItems: 51, pageSize: 25 });

		const next = container.querySelector<HTMLButtonElement>('[title="Next page"]');
		expect(next).not.toBeNull();
		next?.click();
		expect(onPageChange).toHaveBeenCalledWith(3);
		expect(container.textContent).toContain("Showing 26–50 of 51");
	});

	it("supports keyboard input and gives every control an accessible name", () => {
		const container = document.body.createDiv();
		const onPageSizeChange = vi.fn();
		new PaginationBar(container, { onPageChange: vi.fn(), onPageSizeChange });

		const buttons = [...container.querySelectorAll("button")];
		expect(buttons).not.toHaveLength(0);
		expect(buttons.every((button) => Boolean(button.getAttribute("aria-label")))).toBe(true);
		expect(container.querySelector('nav[aria-label="Pagination"]')).not.toBeNull();
		expect(container.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");

		const select = container.querySelector("select");
		const input = container.querySelector("input");
		const error = container.querySelector<HTMLElement>('[role="alert"]');
		if (!select || !input || !error) throw new Error("Page-size controls were not rendered");
		select.value = "custom";
		select.dispatchEvent(new Event("change"));
		input.value = "37";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(onPageSizeChange).toHaveBeenCalledWith(37);
		expect(input.getAttribute("aria-invalid")).toBeNull();

		input.value = "0";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(error.hidden).toBe(false);
		expect(error.textContent).toBe("Enter 1–1,000.");
		expect(onPageSizeChange).toHaveBeenCalledTimes(1);

		input.value = "12.5";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(error.hidden).toBe(false);
		expect(onPageSizeChange).toHaveBeenCalledTimes(1);

		input.value = "37";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(input.getAttribute("aria-invalid")).toBeNull();
		expect(error.hidden).toBe(true);
		expect(onPageSizeChange).toHaveBeenCalledTimes(2);

		input.focus();
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(document.activeElement).not.toBe(input);
	});

	it("disables navigation at both boundaries", () => {
		const container = document.body.createDiv();
		const bar = new PaginationBar(container, { onPageChange: vi.fn(), onPageSizeChange: vi.fn() });

		bar.update({ currentPage: 1, totalPages: 3, totalItems: 60, pageSize: 25 });
		expect(container.querySelector<HTMLButtonElement>('[title="First page"]')?.disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[title="Previous page"]')?.disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[title="Next page"]')?.disabled).toBe(false);

		bar.update({ currentPage: 3, totalPages: 3, totalItems: 60, pageSize: 25 });
		expect(container.querySelector<HTMLButtonElement>('[title="First page"]')?.disabled).toBe(false);
		expect(container.querySelector<HTMLButtonElement>('[title="Next page"]')?.disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[title="Last page"]')?.disabled).toBe(true);
	});

	it("does not steal focus or emit callbacks during a programmatic custom-size update", () => {
		const sentinel = document.body.createEl("button");
		const container = document.body.createDiv();
		const onPageSizeChange = vi.fn();
		const bar = new PaginationBar(container, { onPageChange: vi.fn(), onPageSizeChange });
		sentinel.focus();

		bar.update({ currentPage: 1, totalPages: 3, totalItems: 100, pageSize: 37 });
		expect(document.activeElement).toBe(sentinel);
		expect(onPageSizeChange).not.toHaveBeenCalled();
		expect(container.querySelector("input")?.hidden).toBe(false);
	});

	it("jumps directly to a valid page with Enter or change and retains focus", () => {
		const container = document.body.createDiv();
		const onPageChange = vi.fn();
		const bar = new PaginationBar(container, { onPageChange, onPageSizeChange: vi.fn() });
		bar.update({ currentPage: 1, totalPages: 400, totalItems: 10_000, pageSize: 25 });
		const input = container.querySelector<HTMLInputElement>('[aria-label="Go to page"]')!;
		expect(input.min).toBe("1");
		expect(input.max).toBe("400");
		input.focus();
		input.value = "250";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(onPageChange).toHaveBeenLastCalledWith(250);
		bar.update({ currentPage: 250, totalPages: 400, totalItems: 10_000, pageSize: 25 });
		expect(document.activeElement).toBe(input);
		expect(input.value).toBe("250");
		input.value = "400";
		input.dispatchEvent(new Event("change"));
		expect(onPageChange).toHaveBeenLastCalledWith(400);
	});

	it("rejects invalid jump input without changing pages and allows Escape to cancel", () => {
		const container = document.body.createDiv();
		const onPageChange = vi.fn();
		const bar = new PaginationBar(container, { onPageChange, onPageSizeChange: vi.fn() });
		bar.update({ currentPage: 2, totalPages: 4, totalItems: 100, pageSize: 25 });
		const input = container.querySelector<HTMLInputElement>('[aria-label="Go to page"]')!;
		const error = container.querySelector<HTMLElement>(".bp-page-jump-error")!;
		for (const value of ["", "0", "-1", "2.5", "5", "1e99"]) {
			input.value = value;
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
			expect(input.getAttribute("aria-invalid")).toBe("true");
			expect(error.hidden).toBe(false);
		}
		expect(onPageChange).not.toHaveBeenCalled();
		expect(error.textContent).toBe("Enter a page from 1 to 4.");
		input.focus();
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(input.value).toBe("2");
		expect(input.hasAttribute("aria-invalid")).toBe(false);
		expect(error.hidden).toBe(true);
		expect(document.activeElement).not.toBe(input);
	});

	it("keeps a draft jump through unrelated data updates but refreshes changed page bounds", () => {
		const container = document.body.createDiv();
		const bar = new PaginationBar(container, { onPageChange: vi.fn(), onPageSizeChange: vi.fn() });
		const state = { currentPage: 2, totalPages: 4, totalItems: 100, pageSize: 25 };
		bar.update(state);
		const input = container.querySelector<HTMLInputElement>('[aria-label="Go to page"]')!;
		input.focus();
		input.value = "4";
		bar.update(state);
		expect(input.value).toBe("4");
		input.value = "";
		bar.update(state);
		expect(input.value).toBe("");
		bar.update({ ...state, totalPages: 2, totalItems: 50 });
		expect(input.value).toBe("2");
		expect(input.max).toBe("2");
		bar.update({ ...state, currentPage: 1, totalPages: 1, totalItems: 0 });
		expect(input.disabled).toBe(true);
		expect(input.value).toBe("1");
	});

	it("does not issue another request for the current page or empty results", () => {
		const container = document.body.createDiv();
		const onPageChange = vi.fn();
		const bar = new PaginationBar(container, { onPageChange, onPageSizeChange: vi.fn() });
		const input = container.querySelector<HTMLInputElement>('[aria-label="Go to page"]')!;
		input.value = "1";
		input.dispatchEvent(new Event("change"));
		bar.update({ currentPage: 1, totalPages: 2, totalItems: 30, pageSize: 25 });
		input.dispatchEvent(new Event("change"));
		expect(onPageChange).not.toHaveBeenCalled();
	});

	it("preserves an unfinished custom size through unrelated updates and accepts the latest value", () => {
		const container = document.body.createDiv();
		const onPageSizeChange = vi.fn();
		const bar = new PaginationBar(container, { onPageChange: vi.fn(), onPageSizeChange });
		const state = { currentPage: 1, totalPages: 4, totalItems: 100, pageSize: 25 };
		bar.update(state);
		const select = container.querySelector("select")!;
		const input = container.querySelector<HTMLInputElement>('[aria-label="Custom items per page"]')!;
		select.value = "custom";
		select.dispatchEvent(new Event("change"));
		input.value = "37";
		bar.update(state);
		expect(select.value).toBe("custom");
		expect(input.hidden).toBe(false);
		expect(input.value).toBe("37");
		expect(document.activeElement).toBe(input);
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(onPageSizeChange).toHaveBeenLastCalledWith(37);
		bar.update({ ...state, totalPages: 3, pageSize: 37 });
		input.value = "42";
		bar.update({ ...state, totalPages: 3, pageSize: 37 });
		expect(input.value).toBe("42");
		input.dispatchEvent(new Event("change"));
		expect(onPageSizeChange).toHaveBeenLastCalledWith(42);
	});
});
