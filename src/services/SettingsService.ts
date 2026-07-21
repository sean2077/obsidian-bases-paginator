import type { BasesPaginatorSettings } from "../types";
import { DEFAULT_SETTINGS } from "../utils/constants";

const MAX_PAGE_SIZE = 1000;

export function normalizeSettings(value: unknown): BasesPaginatorSettings {
	if (!isRecord(value)) return { ...DEFAULT_SETTINGS };

	return {
		defaultPageSize: readPageSize(value.defaultPageSize),
		showSearchBox: readBoolean(value.showSearchBox, DEFAULT_SETTINGS.showSearchBox),
		showFilterBar: readBoolean(value.showFilterBar, DEFAULT_SETTINGS.showFilterBar),
		stickyHeader: readBoolean(value.stickyHeader, DEFAULT_SETTINGS.stickyHeader),
	};
}

function readPageSize(value: unknown): number {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		return DEFAULT_SETTINGS.defaultPageSize;
	}
	return value >= 1 && value <= MAX_PAGE_SIZE ? value : DEFAULT_SETTINGS.defaultPageSize;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
