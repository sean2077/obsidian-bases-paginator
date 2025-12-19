import { Plugin } from 'obsidian';
import type { BasesPaginatorSettings } from './types';
import { VIEW_TYPE, VIEW_NAME, VIEW_ICON, DEFAULT_SETTINGS } from './utils/constants';
import { PaginatedTableView } from './views/PaginatedTableView';
import { BasesPaginatorSettingTab } from './settings';

/**
 * Bases Paginator Plugin
 *
 * Adds a paginated table view with quick filtering to Bases.
 */
export default class BasesPaginatorPlugin extends Plugin {
	settings: BasesPaginatorSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register the paginated table view for Bases
		const registered = this.registerBasesView(VIEW_TYPE, {
			name: VIEW_NAME,
			icon: VIEW_ICON,
			factory: (controller, containerEl) => {
				return new PaginatedTableView(this.app, controller, containerEl);
			},
			options: () => PaginatedTableView.getViewOptions(),
		});

		if (!registered) {
			console.warn(
				'Bases Paginator: Could not register view. Make sure Bases core plugin is enabled.'
			);
		}

		// Add settings tab
		this.addSettingTab(new BasesPaginatorSettingTab(this.app, this));

		console.debug('Bases Paginator plugin loaded');
	}

	onunload(): void {
		console.debug('Bases Paginator plugin unloaded');
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData() as Partial<BasesPaginatorSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
