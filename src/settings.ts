import { PluginSettingTab, Setting } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type BasesPaginatorPlugin from "./main";
import { PAGE_SIZE_OPTIONS } from "./utils/constants";
import { VERSION } from "./version";

const PAGE_SIZE_DROPDOWN_OPTIONS = Object.fromEntries(
	PAGE_SIZE_OPTIONS.flatMap((option) =>
		option.value === "custom" ? [] : [[String(option.value), option.label] as const]
	)
);
const STANDARD_PAGE_SIZES = new Set(
	PAGE_SIZE_OPTIONS.flatMap((option) => (option.value === "custom" ? [] : [option.value]))
);

/**
 * Settings tab for the Bases Paginator plugin
 */
export class BasesPaginatorSettingTab extends PluginSettingTab {
	plugin: BasesPaginatorPlugin;

	constructor(app: App, plugin: BasesPaginatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
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
							options: PAGE_SIZE_DROPDOWN_OPTIONS,
						},
					},
					{
						name: "Sticky header",
						desc: "Keep the table header visible when scrolling",
						control: {
							type: "toggle",
							key: "stickyHeader",
						},
					},
				],
			},
			{
				type: "group",
				heading: "About",
				items: [{ name: "Version", desc: `Bases Paginator v${VERSION}` }],
			},
		];
	}

	getControlValue(key: string): unknown {
		switch (key) {
			case "defaultPageSize":
				return String(this.plugin.settings.defaultPageSize);
			case "stickyHeader":
				return this.plugin.settings.stickyHeader;
			default:
				return undefined;
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case "defaultPageSize": {
				const pageSize = typeof value === "string" ? Number(value) : value;
				if (typeof pageSize !== "number" || !STANDARD_PAGE_SIZES.has(pageSize)) return;
				this.plugin.settings.defaultPageSize = pageSize;
				break;
			}
			case "stickyHeader":
				if (typeof value !== "boolean") return;
				this.plugin.settings.stickyHeader = value;
				break;
			default:
				return;
		}

		await this.plugin.saveSettings();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Pagination defaults").setHeading();

		new Setting(containerEl)
			.setName("Default page size")
			.setDesc("Default number of items to show per page")
			.addDropdown((dropdown) => {
				for (const option of PAGE_SIZE_OPTIONS) {
					if (option.value !== "custom") {
						dropdown.addOption(String(option.value), option.label);
					}
				}
				dropdown.setValue(String(this.plugin.settings.defaultPageSize));
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultPageSize = parseInt(value, 10);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Sticky header")
			.setDesc("Keep the table header visible when scrolling")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.stickyHeader);
				toggle.onChange(async (value) => {
					this.plugin.settings.stickyHeader = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName("About").setHeading();

		new Setting(containerEl).setName("Version").setDesc(`Bases Paginator v${VERSION}`);
	}
}
