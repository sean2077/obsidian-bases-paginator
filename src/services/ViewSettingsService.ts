import type { BasesPaginatorSettings, ViewSettings } from "../types";
import { DEFAULT_PAGE_SIZE, isValidPageSize } from "../utils/pageSize";

export interface ViewConfigSource {
	get(key: string): unknown;
}

/**
 * Read only the current options. Extra legacy keys remain untouched in the
 * .base file and cannot break rendering after an upgrade.
 */
export function readViewSettings(config: ViewConfigSource, pluginSettings: BasesPaginatorSettings): ViewSettings {
	return {
		pageSize: readPageSize(config.get("pageSize"), pluginSettings.defaultPageSize),
		paginationPosition: readPosition(config.get("paginationPosition")),
		stickyHeader: readBoolean(config.get("stickyHeader"), pluginSettings.stickyHeader),
	};
}

function readPageSize(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	if (isValidPageSize(parsed)) return parsed;
	return isValidPageSize(fallback) ? fallback : DEFAULT_PAGE_SIZE;
}

function readPosition(value: unknown): "top" | "bottom" {
	return value === "bottom" ? "bottom" : "top";
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	return fallback;
}
