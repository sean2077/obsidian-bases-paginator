import { Keymap } from "obsidian";
import type { App, BasesEntry, BasesPropertyId, HoverParent, RenderContext, Value } from "obsidian";
import type { EntryGroup } from "../services/Paginator";
import { CSS_CLASSES } from "../utils/constants";
import { isEmptyValue } from "../utils/values";

interface TableRendererOptions {
	hoverParent: HoverParent;
	stickyHeader: boolean;
	renderContext: RenderContext;
}

/** Renders only the current page and delegates property values to Obsidian. */
export class TableRenderer {
	private readonly tableEl: HTMLTableElement;
	private readonly headerEl: HTMLTableSectionElement;
	private readonly bodyEl: HTMLTableSectionElement;
	private readonly emptyEl: HTMLElement;
	private properties: BasesPropertyId[] = [];
	private rows: HTMLTableRowElement[] = [];
	private nextRowIndex = 0;

	constructor(
		private readonly app: App,
		containerEl: HTMLElement,
		private readonly resolveDisplayName: (propertyId: BasesPropertyId) => string,
		private options: TableRendererOptions
	) {
		containerEl.addClass(CSS_CLASSES.tableContainer);
		this.tableEl = containerEl.createEl("table", {
			cls: CSS_CLASSES.table,
			attr: { "aria-label": "Paginated results" },
		});
		this.headerEl = this.tableEl.createEl("thead");
		this.bodyEl = this.tableEl.createEl("tbody");
		// Delegate only links owned by this renderer. Native value links keep their
		// own handlers, and replacing a page cannot leave entry-capturing closures.
		this.bodyEl.addEventListener("click", (event) => this.openFileLink(event));
		this.bodyEl.addEventListener("auxclick", (event) => this.openFileLink(event));
		this.bodyEl.addEventListener("mouseover", (event) => this.previewFileLink(event));
		this.emptyEl = containerEl.createDiv({ cls: CSS_CLASSES.emptyState, text: "No results" });
		this.emptyEl.hide();
	}

	updateOptions(options: Partial<TableRendererOptions>): void {
		this.options = { ...this.options, ...options };
		this.headerEl.toggleClass(CSS_CLASSES.tableHeaderSticky, this.options.stickyHeader);
	}

	update(groups: EntryGroup<BasesEntry, Value>[], properties: BasesPropertyId[]): void {
		this.updateHeader(properties);
		this.nextRowIndex = 0;
		const entryCount = groups.reduce((total, group) => total + group.entries.length, 0);

		if (entryCount === 0 || properties.length === 0) {
			this.tableEl.hide();
			this.emptyEl.setText(entryCount === 0 ? "No results" : "No properties selected");
			this.emptyEl.show();
			this.trimUnusedRows();
			return;
		}

		this.emptyEl.hide();
		this.tableEl.show();
		for (const group of groups) {
			if (group.showHeader) this.renderGroupHeader(group.key, properties.length);
			for (const entry of group.entries) this.renderEntry(entry, properties);
		}
		this.trimUnusedRows();
	}

	private updateHeader(properties: BasesPropertyId[]): void {
		if (sameProperties(this.properties, properties)) {
			// The host can rename a property without changing its ID or position.
			for (const [index, propertyId] of properties.entries()) {
				const cell = this.headerEl.rows[0]?.cells[index];
				const name = this.resolveDisplayName(propertyId);
				if (cell && cell.textContent !== name) cell.setText(name);
			}
			return;
		}
		this.properties = [...properties];
		this.headerEl.empty();
		const row = this.headerEl.createEl("tr");
		for (const propertyId of properties) {
			row.createEl("th", {
				cls: CSS_CLASSES.tableHeader,
				text: this.resolveDisplayName(propertyId),
				attr: { scope: "col" },
			});
		}
		this.headerEl.toggleClass(CSS_CLASSES.tableHeaderSticky, this.options.stickyHeader);
	}

	private renderEntry(entry: BasesEntry, properties: BasesPropertyId[]): void {
		const row = this.nextRow(CSS_CLASSES.tableRow);
		for (const propertyId of properties) {
			const cell = row.createEl("td", { cls: CSS_CLASSES.tableCell });
			const value = entry.getValue(propertyId);
			if (value === null || isEmptyValue(value)) {
				cell.addClass(CSS_CLASSES.tableCellEmpty);
				cell.setText("—");
			} else if (propertyId === "file.name") {
				this.renderFileLink(cell, entry);
			} else {
				this.renderValue(cell, value);
			}
		}
	}

	private renderGroupHeader(key: Value | undefined, columnCount: number): void {
		const cell = this.nextRow(CSS_CLASSES.groupRow).createEl("th", {
			cls: CSS_CLASSES.groupCell,
			attr: { colspan: String(Math.max(1, columnCount)), scope: "rowgroup" },
		});
		if (key === undefined || isEmptyValue(key)) {
			cell.setText("No value");
		} else {
			this.renderValue(cell, key);
		}
	}

	private renderValue(cell: HTMLElement, value: Value): void {
		try {
			value.renderTo(cell, this.options.renderContext);
		} catch (error) {
			console.error("Bases Paginator: Obsidian could not render a value", error);
			try {
				cell.setText(value.toString() || "Unable to render");
			} catch {
				cell.setText("Unable to render");
			}
		}
	}

	private nextRow(className: string): HTMLTableRowElement {
		let row = this.rows[this.nextRowIndex];
		if (!row) {
			row = this.bodyEl.createEl("tr");
			this.rows.push(row);
		}
		this.nextRowIndex++;
		row.className = className;
		row.empty();
		row.show();
		return row;
	}

	private trimUnusedRows(): void {
		const unusedRows = this.rows.splice(this.nextRowIndex);
		for (const row of unusedRows) row.remove();
	}

	private renderFileLink(cell: HTMLElement, entry: BasesEntry): void {
		cell.createEl("a", {
			cls: "internal-link",
			text: entry.file.name,
			attr: { "data-bp-file-link": "", "data-href": entry.file.path, href: entry.file.path },
		});
	}

	private getFileLink(event: MouseEvent): HTMLAnchorElement | null {
		// Avoid instanceof Element, which does not work across pop-out windows.
		const target = event.target as Element | null;
		if (!target || typeof target.closest !== "function") return null;
		const link = target.closest<HTMLAnchorElement>("a[data-bp-file-link]");
		return link && this.bodyEl.contains(link) ? link : null;
	}

	private openFileLink(event: MouseEvent): void {
		if (event.button !== 0 && event.button !== 1) return;
		const path = this.getFileLink(event)?.getAttribute("data-href");
		if (!path) return;
		event.preventDefault();
		void this.app.workspace.openLinkText(path, "", Keymap.isModEvent(event));
	}

	private previewFileLink(event: MouseEvent): void {
		const link = this.getFileLink(event);
		const path = link?.getAttribute("data-href");
		if (!link || !path) return;
		this.app.workspace.trigger("hover-link", {
			event,
			hoverParent: this.options.hoverParent,
			linktext: path,
			source: "bases",
			targetEl: link,
		});
	}
}

function sameProperties(left: BasesPropertyId[], right: BasesPropertyId[]): boolean {
	return left.length === right.length && left.every((property, index) => property === right[index]);
}
