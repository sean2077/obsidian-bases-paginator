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
	private updateBtn: HTMLButtonElement;
	private deleteBtn: HTMLButtonElement;
	private presets: FilterPreset[];
	private activePresetId: string | null;
	private onPresetSelect: (presetId: string | null) => void;
	private onSavePreset: () => void;
	private onPresetUpdate: (presetId: string) => void;
	private onPresetDelete: (presetId: string) => void;

	constructor(containerEl: HTMLElement, options: PresetSelectorOptions) {
		this.containerEl = containerEl;
		this.presets = options.presets;
		this.activePresetId = options.activePresetId;
		this.onPresetSelect = options.onPresetSelect;
		this.onSavePreset = options.onSavePreset;
		this.onPresetUpdate = options.onPresetUpdate;
		this.onPresetDelete = options.onPresetDelete;

		this.containerEl.addClass(CSS_CLASSES.presetSection);

		// Create dropdown
		this.dropdownEl = this.containerEl.createEl('select', {
			cls: CSS_CLASSES.presetSelector,
		});

		this.dropdownEl.addEventListener('change', () => {
			const value = this.dropdownEl.value;
			this.activePresetId = value === '' ? null : value;
			this.onPresetSelect(this.activePresetId);
			this.updateButtonVisibility();
		});

		// Create save button (add new preset)
		this.saveBtn = this.containerEl.createEl('button', {
			cls: CSS_CLASSES.savePresetBtn,
			attr: { title: 'Save current filters as new preset' },
		});
		setIcon(this.saveBtn, 'plus');
		this.saveBtn.addEventListener('click', () => {
			this.onSavePreset();
		});

		// Create update button (update selected preset, initially hidden)
		this.updateBtn = this.containerEl.createEl('button', {
			cls: CSS_CLASSES.savePresetBtn,
			attr: { title: 'Update selected preset with current filters' },
		});
		setIcon(this.updateBtn, 'save');
		this.updateBtn.addEventListener('click', () => {
			if (this.activePresetId) {
				this.onPresetUpdate(this.activePresetId);
			}
		});

		// Create delete button (initially hidden)
		this.deleteBtn = this.containerEl.createEl('button', {
			cls: CSS_CLASSES.savePresetBtn,
			attr: { title: 'Delete selected preset' },
		});
		setIcon(this.deleteBtn, 'trash-2');
		this.deleteBtn.addEventListener('click', () => {
			if (this.activePresetId) {
				this.onPresetDelete(this.activePresetId);
			}
		});

		this.render();
		this.updateButtonVisibility();
	}

	/**
	 * Update button visibility based on active preset
	 */
	private updateButtonVisibility(): void {
		if (this.activePresetId) {
			this.updateBtn.removeClass(CSS_CLASSES.hidden);
			this.deleteBtn.removeClass(CSS_CLASSES.hidden);
		} else {
			this.updateBtn.addClass(CSS_CLASSES.hidden);
			this.deleteBtn.addClass(CSS_CLASSES.hidden);
		}
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
		this.updateButtonVisibility();
	}

	/**
	 * Set active preset
	 */
	setActivePreset(presetId: string | null): void {
		this.activePresetId = presetId;
		this.dropdownEl.value = presetId ?? '';
		this.updateButtonVisibility();
	}
}
