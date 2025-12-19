import { setIcon } from 'obsidian';
import type { PresetSelectorOptions, FilterPreset } from '../types';
import { CSS_CLASSES } from '../utils/constants';

/**
 * Dropdown component for selecting filter presets
 */
export class PresetSelector {
	private containerEl: HTMLElement;
	private dropdownEl: HTMLSelectElement;
	private saveBtn: HTMLButtonElement;
	private presets: FilterPreset[];
	private activePresetId: string | null;
	private onPresetSelect: (presetId: string | null) => void;
	private onSavePreset: () => void;

	constructor(containerEl: HTMLElement, options: PresetSelectorOptions) {
		this.containerEl = containerEl;
		this.presets = options.presets;
		this.activePresetId = options.activePresetId;
		this.onPresetSelect = options.onPresetSelect;
		this.onSavePreset = options.onSavePreset;

		this.containerEl.addClass(CSS_CLASSES.presetSection);

		// Create dropdown
		this.dropdownEl = this.containerEl.createEl('select', {
			cls: CSS_CLASSES.presetSelector,
		});

		this.dropdownEl.addEventListener('change', () => {
			const value = this.dropdownEl.value;
			this.onPresetSelect(value === '' ? null : value);
		});

		// Create save button
		this.saveBtn = this.containerEl.createEl('button', {
			cls: CSS_CLASSES.savePresetBtn,
			attr: { title: 'Save current filters as preset' },
		});
		setIcon(this.saveBtn, 'save');
		this.saveBtn.addEventListener('click', () => {
			this.onSavePreset();
		});

		this.render();
	}

	/**
	 * Render dropdown options
	 */
	private render(): void {
		this.dropdownEl.empty();

		// Default option
		const defaultOpt = this.dropdownEl.createEl('option', {
			value: '',
			text: 'Select preset...',
		});
		defaultOpt.selected = this.activePresetId === null;

		// Preset options
		for (const preset of this.presets) {
			const opt = this.dropdownEl.createEl('option', {
				value: preset.id,
				text: preset.name,
			});
			opt.selected = preset.id === this.activePresetId;
		}
	}

	/**
	 * Update presets list
	 */
	updatePresets(presets: FilterPreset[], activePresetId: string | null): void {
		this.presets = presets;
		this.activePresetId = activePresetId;
		this.render();
	}

	/**
	 * Set active preset
	 */
	setActivePreset(presetId: string | null): void {
		this.activePresetId = presetId;
		this.dropdownEl.value = presetId ?? '';
	}
}
