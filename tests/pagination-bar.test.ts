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
});
