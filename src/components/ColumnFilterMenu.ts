import { Menu, setIcon } from 'obsidian';
import type { BasesPropertyId } from 'obsidian';

/**
 * Options for the column filter menu
 */
export interface ColumnFilterMenuOptions {
	propertyId: BasesPropertyId;
	displayName: string;
	uniqueValues: string[];
	selectedValues: string[];
	onFilterChange: (values: string[]) => void;
}

/**
 * Column filter menu component - shows a multi-select popover for filtering
 */
export class ColumnFilterMenu {
	private options: ColumnFilterMenuOptions;
	private selectedValues: Set<string>;

	constructor(options: ColumnFilterMenuOptions) {
		this.options = options;
		this.selectedValues = new Set(options.selectedValues);
	}

	/**
	 * Show the filter menu at the specified position
	 */
	show(event: MouseEvent): void {
		const menu = new Menu();

		// Add "All" option to clear filters
		menu.addItem((item) => {
			item.setTitle('All')
				.setIcon(this.selectedValues.size === 0 ? 'check' : '')
				.onClick(() => {
					this.selectedValues.clear();
					this.options.onFilterChange([]);
				});
		});

		menu.addSeparator();

		// Add each unique value as a menu item with checkbox-like behavior
		for (const value of this.options.uniqueValues) {
			const isSelected = this.selectedValues.has(value);
			menu.addItem((item) => {
				item.setTitle(value || '(empty)')
					.setIcon(isSelected ? 'check' : '')
					.onClick(() => {
						if (isSelected) {
							this.selectedValues.delete(value);
						} else {
							this.selectedValues.add(value);
						}
						this.options.onFilterChange(Array.from(this.selectedValues));
					});
			});
		}

		menu.showAtMouseEvent(event);
	}

	/**
	 * Update selected values
	 */
	setSelectedValues(values: string[]): void {
		this.selectedValues = new Set(values);
	}
}

/**
 * Create a filter icon button for column headers
 */
export function createFilterIcon(
	container: HTMLElement,
	hasActiveFilter: boolean,
	onClick: (e: MouseEvent) => void
): HTMLElement {
	const filterBtn = container.createSpan({ cls: 'bp-column-filter-btn' });
	setIcon(filterBtn, 'filter');

	if (hasActiveFilter) {
		filterBtn.addClass('bp-column-filter-active');
	}

	filterBtn.addEventListener('click', (e) => {
		e.stopPropagation(); // Prevent sort from triggering
		onClick(e);
	});

	return filterBtn;
}
