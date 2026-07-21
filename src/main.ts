import { Plugin } from "obsidian";
import type { BasesPaginatorSettings } from "./types";
import { VIEW_TYPE, VIEW_NAME, VIEW_ICON, DEFAULT_SETTINGS } from "./utils/constants";
import { PaginatedTableView } from "./views/PaginatedTableView";
import { BasesPaginatorSettingTab } from "./settings";
import { normalizeSettings } from "./services/SettingsService";

export default class BasesPaginatorPlugin extends Plugin {
	settings: BasesPaginatorSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		const registered = this.registerBasesView(VIEW_TYPE, {
			name: VIEW_NAME,
			icon: VIEW_ICON,
			factory: (controller, containerEl) => new PaginatedTableView(controller, containerEl, () => this.settings),
			options: () => PaginatedTableView.getViewOptions(this.settings),
		});

		if (!registered) {
			console.warn("Bases Paginator: Could not register view. Make sure Bases core plugin is enabled.");
		}

		this.addSettingTab(new BasesPaginatorSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
