import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type BasesPaginatorPlugin from "../src/main";
import { BasesPaginatorSettingTab } from "../src/settings";
import { DEFAULT_SETTINGS } from "../src/utils/constants";
import { VERSION } from "../src/version";

describe("settings tab", () => {
	it("exposes searchable declarative definitions", () => {
		const { tab } = createTab();

		expect(tab.getSettingDefinitions()).toEqual([
			{
				type: "group",
				heading: "Pagination defaults",
				items: [
					{
						name: "Default page size",
						desc: "Default number of items to show per page",
						control: {
							type: "dropdown",
							key: "defaultPageSize",
							options: { "10": "10", "25": "25", "50": "50", "100": "100" },
						},
					},
					{
						name: "Sticky header",
						desc: "Keep the table header visible when scrolling",
						control: { type: "toggle", key: "stickyHeader" },
					},
				],
			},
			{
				type: "group",
				heading: "About",
				items: [{ name: "Version", desc: `Bases Paginator v${VERSION}` }],
			},
		]);
	});

	it("adapts declarative control values to the persisted settings shape", async () => {
		const { plugin, saveSettings, tab } = createTab();

		expect(tab.getControlValue("defaultPageSize")).toBe("25");
		expect(tab.getControlValue("stickyHeader")).toBe(true);
		expect(tab.getControlValue("unknown")).toBeUndefined();

		await tab.setControlValue("defaultPageSize", "50");
		await tab.setControlValue("stickyHeader", false);

		expect(plugin.settings.defaultPageSize).toBe(50);
		expect(plugin.settings.stickyHeader).toBe(false);
		expect(saveSettings).toHaveBeenCalledTimes(2);
	});

	it("ignores invalid or unknown declarative control values", async () => {
		const { plugin, saveSettings, tab } = createTab();

		await tab.setControlValue("defaultPageSize", "custom");
		await tab.setControlValue("defaultPageSize", "12.5");
		await tab.setControlValue("stickyHeader", "false");
		await tab.setControlValue("unknown", true);

		expect(plugin.settings.defaultPageSize).toBe(25);
		expect(plugin.settings.stickyHeader).toBe(true);
		expect(saveSettings).not.toHaveBeenCalled();
	});
});

function createTab() {
	const saveSettings = vi.fn(async () => undefined);
	const plugin = {
		settings: { ...DEFAULT_SETTINGS, defaultPageSize: 25 },
		saveSettings,
	} as unknown as BasesPaginatorPlugin;
	const tab = new BasesPaginatorSettingTab({} as App, plugin);

	return { plugin, saveSettings, tab };
}
