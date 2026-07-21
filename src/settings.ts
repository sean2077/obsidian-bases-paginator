import { App, PluginSettingTab, Setting } from "obsidian";
import type BasesPaginatorPlugin from "./main";
import { PAGE_SIZE_OPTIONS } from "./utils/constants";
import { VERSION } from "./version";

/**
 * Settings tab for the Bases Paginator plugin
 */
export class BasesPaginatorSettingTab extends PluginSettingTab {
	plugin: BasesPaginatorPlugin;

	constructor(app: App, plugin: BasesPaginatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
