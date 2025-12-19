import { App, PluginSettingTab, Setting } from 'obsidian';
import type BasesPaginatorPlugin from './main';
import type { BasesPaginatorSettings } from './types';
import { DEFAULT_SETTINGS, PAGE_SIZE_OPTIONS } from './utils/constants';
import { VERSION } from './version';

export { DEFAULT_SETTINGS };
export type { BasesPaginatorSettings };

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

		new Setting(containerEl)
			.setName('Pagination defaults')
			.setHeading();

		// Default page size
		new Setting(containerEl)
			.setName('Default page size')
			.setDesc('Default number of items to show per page')
			.addDropdown((dropdown) => {
				for (const option of PAGE_SIZE_OPTIONS) {
					if (option.value !== 'custom') {
						dropdown.addOption(String(option.value), option.label);
					}
				}
				dropdown.setValue(String(this.plugin.settings.defaultPageSize));
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultPageSize = parseInt(value, 10);
					await this.plugin.saveSettings();
				});
			});

		// Show search box
		new Setting(containerEl)
			.setName('Show search box')
			.setDesc('Display the search box in the filter bar by default')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showSearchBox);
				toggle.onChange(async (value) => {
					this.plugin.settings.showSearchBox = value;
					await this.plugin.saveSettings();
				});
			});

		// Show filter bar
		new Setting(containerEl)
			.setName('Show filter bar')
			.setDesc('Display the filter bar with search and presets by default')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showFilterBar);
				toggle.onChange(async (value) => {
					this.plugin.settings.showFilterBar = value;
					await this.plugin.saveSettings();
				});
			});

		// Sticky header
		new Setting(containerEl)
			.setName('Sticky header')
			.setDesc('Keep the table header visible when scrolling')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.stickyHeader);
				toggle.onChange(async (value) => {
					this.plugin.settings.stickyHeader = value;
					await this.plugin.saveSettings();
				});
			});

		// Version info
		new Setting(containerEl)
			.setName('About')
			.setHeading();

		new Setting(containerEl)
			.setName('Version')
			.setDesc(`Bases Paginator v${VERSION}`);
	}
}
