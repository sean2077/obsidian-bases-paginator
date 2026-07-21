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
});
