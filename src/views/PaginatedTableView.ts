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
import { PaginationService } from "../services/PaginationService";
import { countGroupedEntries, getGroupedPage, type EntryGroup } from "../services/GroupedPaginationService";
import { readViewSettings } from "../services/ViewSettingsService";
import type { BasesPaginatorSettings, ViewSettings } from "../types";
import { CSS_CLASSES, VIEW_TYPE } from "../utils/constants";
import { getViewOptions } from "./viewOptions";

export class PaginatedTableView extends BasesView implements HoverParent {
	readonly type = VIEW_TYPE;
	hoverPopover: HoverPopover | null = null;

	private readonly tableRenderer: TableRenderer;
	private readonly paginationBar: PaginationBar;
	private readonly paginationService: PaginationService;
	private readonly paginationEl: HTMLElement;
	private settings: ViewSettings | null = null;

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		private readonly getPluginSettings: () => BasesPaginatorSettings
	) {
		super(controller);
		containerEl.addClass(CSS_CLASSES.container);
		this.paginationEl = containerEl.createDiv();
		const tableEl = containerEl.createDiv();

		this.paginationService = new PaginationService();
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
			onPageChange: (page) => {
				if (this.paginationService.goToPage(page)) this.renderData();
			},
			onPageSizeChange: (size) => {
				this.config.set("pageSize", String(size));
				if (this.paginationService.setPageSize(size)) this.renderData();
			},
		});
	}

	onDataUpdated(): void {
		const previousPageSize = this.settings?.pageSize;
		this.settings = readViewSettings(this.config, this.getPluginSettings());
		this.updateLayout(this.settings.paginationPosition);
		this.tableRenderer.updateOptions({ stickyHeader: this.settings.stickyHeader });
		if (previousPageSize !== this.settings.pageSize) {
			this.paginationService.setPageSize(this.settings.pageSize);
		}
		this.renderData();
	}

	private renderData(): void {
		if (!this.settings || !this.data) return;
		const groups = this.getGroups();
		const properties = this.getVisibleProperties();
		this.paginationService.setTotalItems(countGroupedEntries(groups));
		const state = this.paginationService.getState();
		this.tableRenderer.update(getGroupedPage(groups, state.currentPage, state.pageSize), properties);

		this.paginationBar.update(state.currentPage, state.totalPages, state.totalItems, state.pageSize);
	}

	private getGroups(): EntryGroup<BasesEntry, Value>[] {
		const groups = this.data.groupedData;
		const showHeaders = groups.length > 1 || groups.some((group) => group.hasKey());
		return groups.map((group) => ({
			entries: group.entries,
			key: group.key,
			showHeader: showHeaders,
		}));
	}

	private getVisibleProperties(): BasesPropertyId[] {
		const order = this.config.getOrder();
		return order.length > 0 ? order : this.data.properties;
	}

	private updateLayout(position: "top" | "bottom"): void {
		this.paginationEl.removeClass(CSS_CLASSES.layoutOrder1, CSS_CLASSES.layoutOrder3);
		this.paginationEl.addClass(position === "top" ? CSS_CLASSES.layoutOrder1 : CSS_CLASSES.layoutOrder3);
	}

	static getViewOptions(defaults: BasesPaginatorSettings): BasesAllOptions[] {
		return getViewOptions(defaults);
	}
}
