import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { TableRenderer } from "../src/components/TableRenderer";

describe("TableRenderer native value rendering", () => {
	it("exposes the paginated result table with an accessible name", () => {
		const container = document.body.createDiv();
		new TableRenderer(createApp(), container, (property) => property, {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: true,
		});

		expect(container.querySelector('table[aria-label="Paginated results"]')).not.toBeNull();
	});

	it("delegates list values with commas to renderTo without parsing", () => {
		const container = document.body.createDiv();
		const renderTo = vi.fn((element: HTMLElement) => element.setText("Alpha, beta · note, one"));
		const renderer = new TableRenderer(createApp(), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: true,
		});
		renderer.update(
			[
				{
					showHeader: false,
					entries: [
						{
							file: { name: "Entry", path: "Entry.md" },
							getValue: () => ({ renderTo, toString: () => "Alpha, beta, Note, one" }),
						},
					],
				},
			] as never,
			["note.tags"]
		);

		expect(renderTo).toHaveBeenCalledOnce();
		expect(container.textContent).toContain("Alpha, beta · note, one");
	});

	it("refreshes renamed columns without recreating unchanged headers", () => {
		const container = document.body.createDiv();
		let displayName = "Original name";
		const renderer = new TableRenderer(createApp(), container, () => displayName, {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: true,
		});
		renderer.update([], ["note.title"]);
		const header = container.querySelector("th");
		expect(header?.textContent).toBe("Original name");

		displayName = "Renamed column";
		renderer.update([], ["note.title"]);
		expect(container.querySelector("th")).toBe(header);
		expect(header?.textContent).toBe("Renamed column");
	});

	it("renders the literal text null instead of replacing it with an empty-value marker", () => {
		const container = document.body.createDiv();
		const renderer = new TableRenderer(createApp(), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		const renderTo = vi.fn((element: HTMLElement) => element.setText("null"));
		renderer.update(
			[
				{
					entries: [
						{
							file: { name: "Entry", path: "Entry.md" },
							getValue: () => ({ toString: () => "null", renderTo }),
						},
					],
					showHeader: false,
				},
			] as never,
			["note.label"]
		);
		expect(renderTo).toHaveBeenCalledOnce();
		expect(container.querySelector("td")?.textContent).toBe("null");
		expect(container.querySelector(".bp-table-cell-empty")).toBeNull();
	});

	it("shows an empty column selection without rendering blank rows and recovers when columns return", () => {
		const container = document.body.createDiv();
		const renderer = new TableRenderer(createApp(), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		const entry = {
			file: { name: "Entry", path: "Entry.md" },
			getValue: () => ({ renderTo: vi.fn(), toString: () => "Entry" }),
		};
		const groups = [{ entries: [entry], showHeader: false }] as never;
		renderer.update(groups, ["file.name"]);
		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);

		renderer.update(groups, []);
		expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
		expect(container.querySelector("table")?.style.display).toBe("none");
		expect(container.querySelector(".bp-empty-state")?.textContent).toBe("No properties selected");

		renderer.update(groups, ["file.name"]);
		expect(container.querySelector("a")?.textContent).toBe("Entry");
		expect(container.querySelector<HTMLElement>(".bp-empty-state")?.style.display).toBe("none");
		renderer.update([], []);
		expect(container.querySelector(".bp-empty-state")?.textContent).toBe("No results");
	});

	it("opens file links through the workspace click event", () => {
		const container = document.body.createDiv();
		const openLinkText = vi.fn();
		const app = createApp(openLinkText);
		const renderer = new TableRenderer(app, container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		renderer.update(
			[
				{
					showHeader: false,
					entries: [
						{
							file: { name: "Entry", path: "Folder/Entry.md" },
							getValue: () => ({ renderTo: vi.fn(), toString: () => "Entry" }),
						},
					],
				},
			] as never,
			["file.name"]
		);

		container.querySelector<HTMLAnchorElement>("a")?.click();
		expect(openLinkText).toHaveBeenCalledWith("Folder/Entry.md", "", false);
	});

	it("opens a middle-click through the workspace without browser navigation", () => {
		const container = document.body.createDiv();
		const openLinkText = vi.fn();
		const renderer = new TableRenderer(createApp(openLinkText), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		renderer.update(
			[
				{
					showHeader: false,
					entries: [
						{
							file: { name: "Entry", path: "Entry.md" },
							getValue: () => ({ renderTo: vi.fn(), toString: () => "Entry" }),
						},
					],
				},
			] as never,
			["file.name"]
		);

		const event = new MouseEvent("auxclick", { bubbles: true, button: 1, cancelable: true });
		container.querySelector("a")?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(openLinkText).toHaveBeenCalledWith("Entry.md", "", false);
	});

	it("ignores right-click and reports modifier clicks and hover through the workspace", () => {
		const container = document.body.createDiv();
		const openLinkText = vi.fn();
		const trigger = vi.fn();
		const hoverParent = { hoverPopover: null };
		const renderer = new TableRenderer(createApp(openLinkText, trigger), container, createDisplayName(), {
			hoverParent,
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		renderer.update(
			[
				{
					showHeader: false,
					entries: [
						{
							file: { name: "Entry", path: "Entry.md" },
							getValue: () => ({ renderTo: vi.fn(), toString: () => "Entry" }),
						},
					],
				},
			] as never,
			["file.name"]
		);
		const link = container.querySelector("a");
		link?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2, cancelable: true }));
		expect(openLinkText).not.toHaveBeenCalled();

		link?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, cancelable: true, ctrlKey: true }));
		expect(openLinkText).toHaveBeenCalledWith("Entry.md", "", true);
		link?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		expect(trigger).toHaveBeenCalledWith(
			"hover-link",
			expect.objectContaining({ hoverParent, linktext: "Entry.md" })
		);
	});

	it("routes nested file-link targets to the current entry and ignores detached page links", () => {
		const container = document.body.createDiv();
		const openLinkText = vi.fn();
		const trigger = vi.fn();
		const renderer = new TableRenderer(createApp(openLinkText, trigger), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		const update = (path: string) => {
			renderer.update(
				[
					{
						showHeader: false,
						entries: [
							{
								file: { name: path, path },
								getValue: () => ({ renderTo: vi.fn(), toString: () => path }),
							},
						],
					},
				] as never,
				["file.name"]
			);
		};
		update("Previous.md");
		const previousLink = container.querySelector("a");
		update("Current.md");
		previousLink?.removeAttribute("href");
		previousLink?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(openLinkText).not.toHaveBeenCalled();

		const link = container.querySelector("a");
		const child = link?.createSpan({ text: "Nested target" });
		child?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
		expect(openLinkText).toHaveBeenCalledExactlyOnceWith("Current.md", "", true);
		child?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		expect(trigger).toHaveBeenCalledWith(
			"hover-link",
			expect.objectContaining({ linktext: "Current.md", targetEl: link })
		);
	});

	it("leaves links rendered by native values to their own handlers", () => {
		const container = document.body.createDiv();
		const openLinkText = vi.fn();
		const nativeClick = vi.fn((event: MouseEvent) => event.preventDefault());
		const renderer = new TableRenderer(createApp(openLinkText), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		renderer.update(
			[
				{
					showHeader: false,
					entries: [
						{
							file: { name: "Entry", path: "Entry.md" },
							getValue: () => ({
								toString: () => "Related",
								renderTo: (cell: HTMLElement) => {
									const link = cell.createEl("a", {
										cls: "internal-link",
										text: "Related",
										attr: { "data-href": "Related.md", href: "Related.md" },
									});
									link.addEventListener("click", nativeClick);
								},
							}),
						},
					],
				},
			] as never,
			["note.related"]
		);
		container.querySelector<HTMLAnchorElement>("a")?.click();
		expect(nativeClick).toHaveBeenCalledOnce();
		expect(openLinkText).not.toHaveBeenCalled();
	});

	it("degrades a throwing native renderer without aborting the row", () => {
		const container = document.body.createDiv();
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const renderer = new TableRenderer(createApp(), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		const values = {
			"note.bad": {
				renderTo: () => {
					throw new Error("hostile renderer");
				},
				toString: () => "Fallback value",
			},
			"note.good": {
				renderTo: (element: HTMLElement) => element.setText("Still rendered"),
				toString: () => "Still rendered",
			},
		};

		expect(() =>
			renderer.update(
				[
					{
						showHeader: false,
						entries: [
							{
								file: { name: "Entry", path: "Entry.md" },
								getValue: (key: keyof typeof values) => values[key],
							},
						],
					},
				] as never,
				["note.bad", "note.good"]
			)
		).not.toThrow();
		expect(container.textContent).toContain("Fallback value");
		expect(container.textContent).toContain("Still rendered");
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
	});

	it("reuses DOM rows across page updates", () => {
		const container = document.body.createDiv();
		const renderer = new TableRenderer(createApp(), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		const entry = {
			file: { name: "Entry", path: "Entry.md" },
			getValue: () => ({ renderTo: vi.fn(), toString: () => "Value" }),
		};
		renderer.update([{ entries: [entry, entry], showHeader: false }] as never, ["note.value"]);
		const [firstRow, secondRow] = [...container.querySelectorAll("tbody tr")];

		renderer.update([{ entries: [entry], showHeader: false }] as never, ["note.value"]);
		expect(container.querySelector("tbody tr")).toBe(firstRow);
		expect(secondRow?.isConnected).toBe(false);

		renderer.update([], ["note.value"]);
		expect(firstRow?.isConnected).toBe(false);
		renderer.update([{ entries: [entry], showHeader: false }] as never, ["note.value"]);
		expect(container.querySelector("tbody tr")).not.toBe(firstRow);
	});

	it("releases peak-only rows and links when a large page shrinks", () => {
		const container = document.body.createDiv();
		const renderer = new TableRenderer(createApp(), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		const entries = Array.from({ length: 1_000 }, (_, index) => ({
			file: { name: `Entry ${index}`, path: `Entry ${index}.md` },
			getValue: () => ({ renderTo: vi.fn(), toString: () => `Entry ${index}` }),
		}));

		renderer.update([{ entries, showHeader: false }] as never, ["file.name"]);
		const firstRow = container.querySelector("tbody tr");
		expect(container.querySelectorAll("tbody tr")).toHaveLength(1_000);
		expect(container.querySelectorAll("tbody a")).toHaveLength(1_000);

		renderer.update([{ entries: entries.slice(0, 10), showHeader: false }] as never, ["file.name"]);

		expect(container.querySelector("tbody tr")).toBe(firstRow);
		expect(container.querySelectorAll("tbody tr")).toHaveLength(10);
		expect(container.querySelectorAll("tbody a")).toHaveLength(10);
	});

	it("does not retain stale rows or links across repeated peak cycles", () => {
		const container = document.body.createDiv();
		const renderer = new TableRenderer(createApp(), container, createDisplayName(), {
			hoverParent: { hoverPopover: null },
			renderContext: { hoverPopover: null },
			stickyHeader: false,
		});
		const entries = Array.from({ length: 1_000 }, (_, index) => ({
			file: { name: `Entry ${index}`, path: `Entry ${index}.md` },
			getValue: () => ({ renderTo: vi.fn(), toString: () => `Entry ${index}` }),
		}));

		for (const size of [1_000, 10, 500, 1, 1_000, 10]) {
			renderer.update([{ entries: entries.slice(0, size), showHeader: false }] as never, ["file.name"]);
			const links = [...container.querySelectorAll("tbody a")];
			expect(container.querySelectorAll("tbody tr")).toHaveLength(size);
			expect(links).toHaveLength(size);
			expect(links.at(-1)?.getAttribute("data-href")).toBe(`Entry ${size - 1}.md`);
		}
	});
});

function createApp(openLinkText = vi.fn(), trigger = vi.fn()) {
	const workspace = {
		openLinkText,
		trigger,
	};
	return { workspace } as unknown as App & { workspace: typeof workspace };
}

function createDisplayName() {
	return (propertyId: string) => propertyId.replace(/^\w+\./, "");
}
