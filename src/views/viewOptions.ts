import type { BasesAllOptions } from "obsidian";
import type { BasesPaginatorSettings } from "../types";

/** Options unique to the paginated presentation; native Bases owns query controls. */
export function getViewOptions(defaults: BasesPaginatorSettings): BasesAllOptions[] {
	return [
		{
			type: "dropdown",
			key: "pageSize",
			displayName: "Items per page",
			default: String(defaults.defaultPageSize),
			options: {
				"10": "10",
				"25": "25",
				"50": "50",
				"100": "100",
			},
		},
		{
			type: "toggle",
			key: "stickyHeader",
			displayName: "Sticky header",
			default: defaults.stickyHeader,
		},
		{
			type: "dropdown",
			key: "paginationPosition",
			displayName: "Pagination position",
			default: "top",
			options: {
				top: "Top",
				bottom: "Bottom",
			},
		},
	];
}
