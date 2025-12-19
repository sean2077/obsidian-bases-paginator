import type { QuickFilterChipOptions } from '../types';
import { CSS_CLASSES } from '../utils/constants';

/**
 * A chip/tag component displaying an active quick filter
 */
export class QuickFilterChip {
	private containerEl: HTMLElement;
	private chipEl: HTMLElement;

	constructor(containerEl: HTMLElement, options: QuickFilterChipOptions) {
		this.containerEl = containerEl;

		this.chipEl = this.containerEl.createEl('span', {
			cls: CSS_CLASSES.filterChip,
		});

		// Label: "Property = Value"
		const labelEl = this.chipEl.createEl('span', {
			cls: CSS_CLASSES.filterChipLabel,
		});
		labelEl.setText(`${options.propertyDisplayName} = ${options.filter.value}`);

		// Remove button
		const removeBtn = this.chipEl.createEl('span', {
			cls: CSS_CLASSES.filterChipRemove,
			text: '×',
		});
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
