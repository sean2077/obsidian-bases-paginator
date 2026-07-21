import { describe, expect, it } from "vitest";
import { readViewSettings } from "../src/services/ViewSettingsService";
import { DEFAULT_SETTINGS } from "../src/utils/constants";

describe("legacy option compatibility", () => {
	it("ignores retired native-duplicate keys without mutating persisted config", () => {
		const values: Record<string, unknown> = {
			filterPresets: "malformed persisted preset data",
			filterableColumns: ["note.status"],
			listRenderMode: "bullet",
			pageSize: "50",
			showFilterBar: true,
			showSearchBox: true,
		};
		const snapshot = structuredClone(values);

		expect(readViewSettings({ get: (key) => values[key] }, DEFAULT_SETTINGS)).toEqual({
			pageSize: 50,
			paginationPosition: "top",
			stickyHeader: true,
		});
		expect(values).toEqual(snapshot);
	});

	it("falls back for malformed current view settings", () => {
		const values = { pageSize: "12.5", paginationPosition: 42, stickyHeader: "maybe" };
		expect(readViewSettings({ get: (key) => values[key as keyof typeof values] }, DEFAULT_SETTINGS)).toEqual({
			pageSize: DEFAULT_SETTINGS.defaultPageSize,
			paginationPosition: "top",
			stickyHeader: DEFAULT_SETTINGS.stickyHeader,
		});

		values.pageSize = "25items";
		expect(readViewSettings({ get: (key) => values[key as keyof typeof values] }, DEFAULT_SETTINGS).pageSize).toBe(
			DEFAULT_SETTINGS.defaultPageSize
		);
	});
});
