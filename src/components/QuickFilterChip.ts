import { setIcon } from 'obsidian';
import type { QuickFilterChipOptions } from '../types';

/**
 * A chip/tag component displaying an active quick filter
 * Uses Obsidian's native multi-select-pill styles
 */
export class QuickFilterChip {
	private containerEl: HTMLElement;
	private chipEl: HTMLElement;

	constructor(containerEl: HTMLElement, options: QuickFilterChipOptions) {
		this.containerEl = containerEl;

		// Use Bases' native multi-select-pill structure
		this.chipEl = this.containerEl.createEl('div', {
			cls: 'multi-select-pill',
		});

		// Content
		const content = this.chipEl.createEl('div', {
			cls: 'multi-select-pill-content',
		});
		content.createEl('span', {
			text: `${options.propertyDisplayName} = ${options.filter.value}`,
		});

		// Remove button (using Bases' native structure)
		const removeBtn = this.chipEl.createEl('div', {
			cls: 'multi-select-pill-remove-button',
		});
		setIcon(removeBtn, 'x');
		removeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			options.onRemove();
		});
	}

	/**
	 * Remove the chip from DOM
	 */
	destroy(): void {
		this.chipEl.remove();
	}
}
