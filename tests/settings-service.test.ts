import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../src/services/SettingsService";
import { DEFAULT_SETTINGS } from "../src/utils/constants";

describe("settings compatibility", () => {
	it("falls back safely for malformed persisted settings", () => {
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ defaultPageSize: -3, stickyHeader: "yes" })).toEqual(DEFAULT_SETTINGS);
	});

	it("accepts the legacy settings shape without sharing mutable state", () => {
		const normalized = normalizeSettings({
			defaultPageSize: 50,
			showSearchBox: false,
			showFilterBar: false,
			stickyHeader: false,
		});

		expect(normalized).toEqual({
			defaultPageSize: 50,
			showSearchBox: false,
			showFilterBar: false,
			stickyHeader: false,
		});
		expect(normalized).not.toBe(DEFAULT_SETTINGS);
	});
});
