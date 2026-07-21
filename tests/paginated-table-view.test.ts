import { describe, expect, it, vi } from "vitest";
import { PaginatedTableView } from "../src/views/PaginatedTableView";
import { DEFAULT_SETTINGS } from "../src/utils/constants";

describe("PaginatedTableView host lifecycle", () => {
	it("defers Bases config access until the first data update", () => {
		const container = document.body.createDiv();
		const getDisplayName = vi.fn(() => "File");
		const view = new PaginatedTableView(
			{ app: { workspace: { openLinkText: vi.fn(), trigger: vi.fn() } } } as never,
			container,
			() => DEFAULT_SETTINGS
		);

		expect(getDisplayName).not.toHaveBeenCalled();
		Object.assign(view, {
			config: {
				get: () => undefined,
				getDisplayName,
				getOrder: () => ["file.name"],
				set: vi.fn(),
			},
			data: {
				groupedData: [
					{
						entries: [
							{
								file: { name: "Entry.md", path: "Entry.md" },
								getValue: () => ({ renderTo: vi.fn(), toString: () => "Entry" }),
							},
						],
						hasKey: () => false,
					},
				],
				properties: ["file.name"],
			},
		});

		expect(() => view.onDataUpdated()).not.toThrow();
		expect(getDisplayName).toHaveBeenCalledWith("file.name");
		expect(container.textContent).toContain("Showing 1–1 of 1");
		expect(container.querySelector("a")?.textContent).toBe("Entry.md");
	});

	it("uses the app render context for native values", () => {
		const container = document.body.createDiv();
		const renderContext = { hoverPopover: null, renderFileLink: vi.fn() };
		const renderTo = vi.fn();
		const view = new PaginatedTableView(
			{
				app: {
					renderContext,
					workspace: { openLinkText: vi.fn(), trigger: vi.fn() },
				},
			} as never,
			container,
			() => DEFAULT_SETTINGS
		);

		Object.assign(view, {
			config: {
				get: () => undefined,
				getDisplayName: () => "Related",
				getOrder: () => ["note.related"],
				set: vi.fn(),
			},
			data: {
				groupedData: [
					{
						entries: [
							{
								file: { name: "Entry.md", path: "Entry.md" },
								getValue: () => ({ renderTo, toString: () => "[[Related]]" }),
							},
						],
						hasKey: () => false,
					},
				],
				properties: ["note.related"],
			},
		});

		view.onDataUpdated();

		expect(renderTo).toHaveBeenCalledWith(expect.any(HTMLElement), renderContext);
	});

	it("navigates across pages after native data updates", () => {
		const container = document.body.createDiv();
		const configValues = new Map<string, unknown>();
		const entries = Array.from({ length: 30 }, (_, index) => ({
			file: { name: `Entry ${index + 1}.md`, path: `Entry ${index + 1}.md` },
			getValue: () => ({ renderTo: vi.fn(), toString: () => `Entry ${index + 1}` }),
		}));
		const groupedData = [{ entries, hasKey: () => false }];
		const set = vi.fn((key: string, value: unknown) => configValues.set(key, value));
		const view = new PaginatedTableView(
			{
				app: {
					renderContext: { hoverPopover: null },
					workspace: { openLinkText: vi.fn(), trigger: vi.fn() },
				},
			} as never,
			container,
			() => DEFAULT_SETTINGS
		);

		Object.assign(view, {
			config: {
				get: (key: string) => configValues.get(key),
				getDisplayName: () => "File",
				getOrder: () => ["file.name"],
				set,
			},
			data: { groupedData, properties: ["file.name"] },
		});

		view.onDataUpdated();
		expect(container.textContent).toContain("Showing 1–25 of 30");
		expect(container.querySelectorAll("tbody a")).toHaveLength(25);

		container.querySelector<HTMLButtonElement>('[title="Next page"]')?.click();
		expect(container.textContent).toContain("Showing 26–30 of 30");
		expect(container.querySelectorAll("tbody a")).toHaveLength(5);
		expect(container.querySelector("tbody a")?.textContent).toBe("Entry 26.md");
		expect(set).not.toHaveBeenCalled();

		groupedData[0]!.entries = entries.slice(0, 3);
		view.onDataUpdated();
		view.onDataUpdated();
		expect(container.textContent).toContain("Showing 1–3 of 3");
		expect(container.querySelectorAll("tbody a")).toHaveLength(3);
		expect(container.querySelectorAll("button")).toHaveLength(4);
	});

	it("persists a valid page-size change and re-renders at a bounded current page", () => {
		const container = document.body.createDiv();
		const configValues = new Map<string, unknown>();
		const entries = Array.from({ length: 30 }, (_, index) => ({
			file: { name: `Entry ${index + 1}.md`, path: `Entry ${index + 1}.md` },
			getValue: () => ({ renderTo: vi.fn(), toString: () => `Entry ${index + 1}` }),
		}));
		const set = vi.fn((key: string, value: unknown) => configValues.set(key, value));
		const view = new PaginatedTableView(
			{
				app: {
					renderContext: { hoverPopover: null },
					workspace: { openLinkText: vi.fn(), trigger: vi.fn() },
				},
			} as never,
			container,
			() => DEFAULT_SETTINGS
		);

		Object.assign(view, {
			config: {
				get: (key: string) => configValues.get(key),
				getDisplayName: () => "File",
				getOrder: () => ["file.name"],
				set,
			},
			data: { groupedData: [{ entries, hasKey: () => false }], properties: ["file.name"] },
		});

		view.onDataUpdated();
		container.querySelector<HTMLButtonElement>('[title="Next page"]')?.click();
		expect(container.textContent).toContain("Showing 26–30 of 30");

		const select = container.querySelector<HTMLSelectElement>("select");
		if (!select) throw new Error("Page-size selector was not rendered");
		select.value = "10";
		select.dispatchEvent(new Event("change"));

		expect(set).toHaveBeenCalledWith("pageSize", "10");
		expect(configValues.get("pageSize")).toBe("10");
		expect(container.textContent).toContain("Showing 11–20 of 30");
		expect(container.querySelectorAll("tbody a")).toHaveLength(10);

		view.onDataUpdated();
		expect(container.textContent).toContain("Showing 11–20 of 30");
		expect(container.querySelectorAll("button")).toHaveLength(4);
	});
});
