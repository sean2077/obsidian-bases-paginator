import { debounce } from 'obsidian';
import type { SearchBoxOptions } from '../types';
import { CSS_CLASSES, SEARCH_DEBOUNCE_MS } from '../utils/constants';

/**
 * Search input component with debounced search
 */
export class SearchBox {
	private containerEl: HTMLElement;
	private inputEl: HTMLInputElement;
	private onSearch: (query: string) => void;

	constructor(containerEl: HTMLElement, options: SearchBoxOptions) {
		this.containerEl = containerEl;
		this.onSearch = options.onSearch;

		const debouncedSearch = debounce((query: string) => {
			this.onSearch(query);
		}, options.debounceMs ?? SEARCH_DEBOUNCE_MS);

		this.containerEl.addClass(CSS_CLASSES.searchSection);

		this.inputEl = this.containerEl.createEl('input', {
			type: 'text',
			placeholder: options.placeholder ?? 'Search...',
			cls: CSS_CLASSES.searchInput,
		});

		this.inputEl.addEventListener('input', () => {
			debouncedSearch(this.inputEl.value);
		});

		// Clear on Escape
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				this.clear();
				this.onSearch('');
			}
		});
	}

	/**
	 * Get current search value
	 */
	getValue(): string {
		return this.inputEl.value;
	}

	/**
	 * Set search value
	 */
	setValue(value: string): void {
		this.inputEl.value = value;
	}

	/**
	 * Clear search input
	 */
	clear(): void {
		this.inputEl.value = '';
	}

	/**
	 * Focus the search input
	 */
	focus(): void {
		this.inputEl.focus();
	}
}
