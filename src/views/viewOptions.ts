import type { ViewOption } from 'obsidian';
import { DEFAULT_PAGE_SIZE } from '../utils/constants';

/**
 * Get ViewOptions configuration for the paginated table view
 */
export function getViewOptions(): ViewOption[] {
	return [
		// Page size dropdown
		{
			type: 'dropdown',
			key: 'pageSize',
			displayName: 'Items per page',
			options: {
				'10': '10',
				'25': '25',
				'50': '50',
				'100': '100',
			},
		} as ViewOption,

		// Show search box toggle
		{
			type: 'toggle',
			key: 'showSearchBox',
			displayName: 'Show search box',
		} as ViewOption,

		// Filterable columns (multi-text input)
		{
			type: 'multitext',
			key: 'filterableColumns',
			displayName: 'Filterable columns',
			default: [],
		} as ViewOption,

		// Show filter bar toggle
		{
			type: 'toggle',
			key: 'showFilterBar',
			displayName: 'Show filter bar',
		} as ViewOption,

		// Sticky header toggle
		{
			type: 'toggle',
			key: 'stickyHeader',
			displayName: 'Sticky header',
		} as ViewOption,

		// Pagination position
		{
			type: 'dropdown',
			key: 'paginationPosition',
			displayName: 'Pagination position',
			options: {
				'top': 'Top',
				'bottom': 'Bottom',
			},
		} as ViewOption,
	];
}

/**
 * Default values for view options
 */
export const VIEW_OPTION_DEFAULTS = {
	pageSize: String(DEFAULT_PAGE_SIZE),
	showSearchBox: true,
	filterableColumns: [] as string[],
	showFilterBar: true,
	stickyHeader: true,
	filterPresets: '[]',
	paginationPosition: 'top',
};
