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
	private readonly paginator: Paginator;
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

		this.paginator = new Paginator();
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
		this.renderData({ pageSize: this.settings.pageSize });
	}

	private renderData(request: PaginationRequest = {}): void {
		if (!this.settings || !this.data) return;
		const groups = this.getGroups();
		const properties = this.getVisibleProperties();
		const page = this.paginator.paginate(groups, request);
		this.tableRenderer.update(page.groups, properties);
		this.paginationBar.update(page.state);
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
