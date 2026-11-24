import {
	BasesView,
	type BasesAllOptions,
	type BasesPropertyId,
	type BasesEntry,
	type HoverParent,
	type HoverPopover,
	type QueryController,
	type Value,
} from "obsidian";
import { PaginationBar } from "../components/PaginationBar";
import { TableRenderer } from "../components/TableRenderer";
import { Paginator, type EntryGroup, type PaginationRequest } from "../services/Paginator";
import { readViewSettings } from "../services/ViewSettingsService";
import type { BasesPaginatorSettings, ViewSettings } from "../types";
import { CSS_CLASSES, VIEW_TYPE } from "../utils/constants";
import { getViewOptions } from "./viewOptions";

export class PaginatedTableView extends BasesView implements HoverParent {
	readonly type = VIEW_TYPE;
	hoverPopover: HoverPopover | null = null;

	private readonly tableRenderer: TableRenderer;
	private readonly paginationBar: PaginationBar;
	private readonly paginator = new Paginator<BasesEntry, Value>();
	private readonly containerEl: HTMLElement;
	private readonly paginationEl: HTMLElement;
	private settings: ViewSettings | null = null;
	private properties: BasesPropertyId[] = [];

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		private readonly getPluginSettings: () => BasesPaginatorSettings
	) {
		super(controller);
		this.containerEl = containerEl.createDiv(CSS_CLASSES.container);
		this.paginationEl = this.containerEl.createDiv();
		const tableEl = this.containerEl.createDiv();

		this.tableRenderer = new TableRenderer(
			this.app,
			tableEl,
			(propertyId) => this.config.getDisplayName(propertyId),
			{
				hoverParent: this,
				renderContext: this.app.renderContext,
				stickyHeader: true,
			}
		);
		this.paginationBar = new PaginationBar(this.paginationEl, {
			onPageChange: (page) => this.renderData({ page }),
			onPageSizeChange: (size) => {
				this.config.set("pageSize", String(size));
				this.renderData({ pageSize: size });
			},
		});
	}

	onDataUpdated(): void {
		this.settings = readViewSettings(this.config, this.getPluginSettings());
		this.updateLayout(this.settings.paginationPosition);
		this.tableRenderer.updateOptions({ stickyHeader: this.settings.stickyHeader });
		// Bases replaces its result and entries on every update. Index only this
		// snapshot, then keep ordinary page navigation independent of query getters.
		this.paginator.setGroups(this.getGroups());
		this.properties = this.config.getOrder();
		this.renderData({ pageSize: this.settings.pageSize });
	}

	onunload(): void {
		this.settings = null;
		this.properties = [];
		this.paginator.setGroups([]);
		this.containerEl.remove();
	}

	private renderData(request: PaginationRequest = {}): void {
		if (!this.settings || !this.data) return;
		const page = this.paginator.paginate(request);
		this.tableRenderer.update(page.groups, this.properties);
		this.paginationBar.update(page.state);
	}

	private getGroups(): EntryGroup<BasesEntry, Value>[] {
		const groups = this.data.groupedData;
		// Ungrouped results have an undefined key. A configured group whose rows
		// lack a value has a NullValue key, even though hasKey() returns false.
		const showHeaders = groups.length > 1 || groups.some((group) => group.key !== undefined);
		return groups.map((group) => ({
			entries: group.entries,
			key: group.key,
			showHeader: showHeaders,
		}));
	}

	private updateLayout(position: "top" | "bottom"): void {
		this.paginationEl.removeClass(CSS_CLASSES.layoutOrder1, CSS_CLASSES.layoutOrder3);
		this.paginationEl.addClass(position === "top" ? CSS_CLASSES.layoutOrder1 : CSS_CLASSES.layoutOrder3);
	}

	static getViewOptions(defaults: BasesPaginatorSettings): BasesAllOptions[] {
		return getViewOptions(defaults);
	}
}
