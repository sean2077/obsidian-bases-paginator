import { describe, expect, it, vi } from "vitest";
import { NullValue } from "obsidian";
import { PaginatedTableView } from "../src/views/PaginatedTableView";
import { DEFAULT_SETTINGS } from "../src/utils/constants";

function createViewFixture() {
	const parent = document.body.createDiv();
	const configValues = new Map<string, unknown>();
	const entries = Array.from({ length: 30 }, (_, index) => ({
		file: { name: `Entry ${index + 1}.md`, path: `Entry ${index + 1}.md` },
		getValue: vi.fn(() => ({ renderTo: vi.fn(), toString: () => `Entry ${index + 1}` })),
	}));
	const groupedData: { entries: typeof entries; key?: { toString: () => string }; hasKey: () => boolean }[] = [
		{ entries, hasKey: () => false },
	];
	const getGroupedData = vi.fn(() => groupedData);
	const getOrder = vi.fn(() => ["file.name"]);
	const set = vi.fn((key: string, value: unknown) => configValues.set(key, value));
	const view = new PaginatedTableView(
		{ app: { renderContext: {}, workspace: { openLinkText: vi.fn(), trigger: vi.fn() } } } as never,
		parent,
		() => DEFAULT_SETTINGS
	);
	Object.assign(view, {
		config: { get: (key: string) => configValues.get(key), getOrder, getDisplayName: () => "File", set },
		data: {
			get groupedData() {
				return getGroupedData();
			},
			data: entries,
			properties: ["file.name"],
		},
	});
	return { view, parent, configValues, entries, groupedData, getGroupedData, getOrder, set };
}

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

	it("preserves the first visible item when changing page size", () => {
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
		expect(container.textContent).toContain("Showing 21–30 of 30");
		expect(container.querySelectorAll("tbody a")).toHaveLength(10);

		view.onDataUpdated();
		expect(container.textContent).toContain("Showing 21–30 of 30");
		expect(container.querySelectorAll("button")).toHaveLength(4);
	});

	it("reads native groups and visible properties only once per data update", () => {
		const { view, parent, getGroupedData, getOrder } = createViewFixture();
		view.onDataUpdated();
		parent.querySelector<HTMLButtonElement>('[title="Next page"]')!.click();
		parent.querySelector<HTMLButtonElement>('[title="Previous page"]')!.click();
		expect(getGroupedData).toHaveBeenCalledTimes(1);
		expect(getOrder).toHaveBeenCalledTimes(1);
		view.onDataUpdated();
		expect(getGroupedData).toHaveBeenCalledTimes(2);
		expect(getOrder).toHaveBeenCalledTimes(2);
	});

	it("replaces cached entries after a native data update", () => {
		const { view, parent, entries, groupedData } = createViewFixture();
		view.onDataUpdated();
		for (const entry of entries) entry.getValue.mockClear();
		groupedData[0]!.entries = entries.map((entry) => ({
			file: { name: `Updated ${entry.file.name}`, path: `Updated ${entry.file.path}` },
			getValue: vi.fn(() => ({ renderTo: vi.fn(), toString: () => "Updated" })),
		}));
		view.onDataUpdated();
		parent.querySelector<HTMLButtonElement>('[title="Next page"]')!.click();
		expect(parent.querySelector("tbody a")?.textContent).toBe("Updated Entry 26.md");
		expect(entries.every((entry) => entry.getValue.mock.calls.length === 0)).toBe(true);
	});

	it("preserves native group order and counts only visible groups, including Hide all", () => {
		const { view, parent, entries, getGroupedData } = createViewFixture();
		getGroupedData.mockReturnValue([
			{ entries: entries.slice(20, 23), hasKey: () => true },
			{ entries: entries.slice(0, 2), hasKey: () => true },
		]);
		view.onDataUpdated();
		expect([...parent.querySelectorAll("tbody a")].map((link) => link.textContent)).toEqual([
			"Entry 21.md",
			"Entry 22.md",
			"Entry 23.md",
			"Entry 1.md",
			"Entry 2.md",
		]);
		expect(parent.textContent).toContain("Showing 1–5 of 5");
		getGroupedData.mockReturnValue([]);
		view.onDataUpdated();
		expect(parent.querySelectorAll("tbody a")).toHaveLength(0);
		expect(parent.textContent).toContain("No items");
		expect(parent.textContent).toContain("No results");
	});

	it("shows a No value header when all entries lack the configured group property", () => {
		const { view, parent, groupedData } = createViewFixture();
		// Native groupBy is not a custom config option. The public group's key
		// distinguishes a NullValue group from the undefined ungrouped key.
		groupedData[0]!.key = NullValue.value;
		view.onDataUpdated();
		expect(parent.querySelector(".bp-group-cell")?.textContent).toBe("No value");
	});

	it("respects hidden properties instead of restoring columns from the result", () => {
		const { view, parent, getOrder } = createViewFixture();
		view.onDataUpdated();
		getOrder.mockReturnValue([]);
		view.onDataUpdated();
		expect(parent.querySelectorAll("tbody tr")).toHaveLength(0);
		expect(parent.textContent).toContain("No properties selected");
		expect(parent.textContent).toContain("Showing 1–25 of 30");
		getOrder.mockReturnValue(["file.name"]);
		view.onDataUpdated();
		expect(parent.querySelectorAll("tbody a")).toHaveLength(25);
	});

	it("navigates directly without persisting a page number or changing native config", () => {
		const { view, parent, configValues, set } = createViewFixture();
		configValues.set("pageSize", "1");
		view.onDataUpdated();
		const input = parent.querySelector<HTMLInputElement>('[aria-label="Go to page"]')!;
		input.value = "18";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(parent.querySelector("tbody a")?.textContent).toBe("Entry 18.md");
		expect(parent.textContent).toContain("Page 18 of 30");
		expect(set).not.toHaveBeenCalled();
	});

	it("removes only its own DOM when the view unloads", () => {
		const { view, parent } = createViewFixture();
		const sibling = parent.createDiv({ text: "Host-owned content" });
		view.onDataUpdated();
		view.onunload();
		expect(parent.querySelector(".bp-container")).toBeNull();
		expect(sibling.isConnected).toBe(true);
		expect(parent.classList.contains("bp-container")).toBe(false);
	});
});
