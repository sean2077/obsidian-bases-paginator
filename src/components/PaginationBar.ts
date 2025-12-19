import { setIcon } from 'obsidian';
import type { PaginationBarOptions, PageSizeOption } from '../types';
import { CSS_CLASSES, PAGE_SIZE_OPTIONS } from '../utils/constants';

/**
 * Pagination controls component
 */
export class PaginationBar {
	private containerEl: HTMLElement;

	private firstBtn: HTMLButtonElement;
	private prev10Btn: HTMLButtonElement;
	private prevBtn: HTMLButtonElement;
	private pageInfo: HTMLSpanElement;
	private nextBtn: HTMLButtonElement;
	private next10Btn: HTMLButtonElement;
	private lastBtn: HTMLButtonElement;
	private itemInfo: HTMLSpanElement;
	private pageSizeSelect: HTMLSelectElement;
	private customPageSizeInput: HTMLInputElement | null = null;

	private currentPage: number = 1;
	private totalPages: number = 1;
	private totalItems: number = 0;
	private pageSize: number = 25;

	private onPageChange: (page: number) => void;
	private onPageSizeChange: (size: number) => void;

	constructor(containerEl: HTMLElement, options: PaginationBarOptions) {
		this.containerEl = containerEl;
		this.onPageChange = options.onPageChange;
		this.onPageSizeChange = options.onPageSizeChange;

		this.containerEl.addClass(CSS_CLASSES.paginationBar);

		// Page size selector
		const pageSizeContainer = this.containerEl.createDiv(CSS_CLASSES.pageSizeSelector);
		pageSizeContainer.createEl('span', { text: 'Show: ' });

		this.pageSizeSelect = pageSizeContainer.createEl('select');
		for (const option of PAGE_SIZE_OPTIONS) {
			this.pageSizeSelect.createEl('option', {
				value: String(option.value),
				text: option.label,
			});
		}
		this.pageSizeSelect.value = String(this.pageSize);
		this.pageSizeSelect.addEventListener('change', () => {
			this.handlePageSizeChange();
		});

		// Navigation buttons
		const navContainer = this.containerEl.createDiv({ cls: CSS_CLASSES.navContainer });

		// First page button
		this.firstBtn = navContainer.createEl('button', {
			cls: CSS_CLASSES.paginationBtn,
			attr: { title: 'First page' },
		});
		setIcon(this.firstBtn, 'chevrons-left');
		this.firstBtn.addEventListener('click', () => this.goToPage(1));

		// Previous 10 pages button
		this.prev10Btn = navContainer.createEl('button', {
			cls: CSS_CLASSES.paginationBtn,
			attr: { title: 'Previous 10 pages' },
		});
		this.prev10Btn.setText('-10');
		this.prev10Btn.addEventListener('click', () => this.goToPage(this.currentPage - 10));

		// Previous page button
		this.prevBtn = navContainer.createEl('button', {
			cls: CSS_CLASSES.paginationBtn,
			attr: { title: 'Previous page' },
		});
		setIcon(this.prevBtn, 'chevron-left');
		this.prevBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));

		// Page indicator
		this.pageInfo = navContainer.createEl('span', {
			cls: CSS_CLASSES.pageInfo,
		});

		// Next page button
		this.nextBtn = navContainer.createEl('button', {
			cls: CSS_CLASSES.paginationBtn,
			attr: { title: 'Next page' },
		});
		setIcon(this.nextBtn, 'chevron-right');
		this.nextBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));

		// Next 10 pages button
		this.next10Btn = navContainer.createEl('button', {
			cls: CSS_CLASSES.paginationBtn,
			attr: { title: 'Next 10 pages' },
		});
		this.next10Btn.setText('+10');
		this.next10Btn.addEventListener('click', () => this.goToPage(this.currentPage + 10));

		// Last page button
		this.lastBtn = navContainer.createEl('button', {
			cls: CSS_CLASSES.paginationBtn,
			attr: { title: 'Last page' },
		});
		setIcon(this.lastBtn, 'chevrons-right');
		this.lastBtn.addEventListener('click', () => this.goToPage(this.totalPages));

		// Item count info
		this.itemInfo = this.containerEl.createEl('span', {
			cls: CSS_CLASSES.itemInfo,
		});

		this.render();
	}

	/**
	 * Handle page size dropdown change
	 */
	private handlePageSizeChange(): void {
		const value = this.pageSizeSelect.value;

		if (value === 'custom') {
			this.showCustomPageSizeInput();
		} else {
			this.hideCustomPageSizeInput();
			const size = parseInt(value, 10);
			if (!isNaN(size) && size > 0) {
				this.onPageSizeChange(size);
			}
		}
	}

	/**
	 * Show custom page size input
	 */
	private showCustomPageSizeInput(): void {
		if (this.customPageSizeInput) return;

		const container = this.pageSizeSelect.parentElement!;
		this.customPageSizeInput = container.createEl('input', {
			type: 'number',
			placeholder: 'Enter number',
			attr: { min: '1', max: '1000' },
		});
		this.customPageSizeInput.style.width = '80px';
		this.customPageSizeInput.style.marginLeft = '8px';

		this.customPageSizeInput.addEventListener('change', () => {
			const size = parseInt(this.customPageSizeInput!.value, 10);
			if (!isNaN(size) && size > 0) {
				this.onPageSizeChange(size);
			}
		});

		this.customPageSizeInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const size = parseInt(this.customPageSizeInput!.value, 10);
				if (!isNaN(size) && size > 0) {
					this.onPageSizeChange(size);
				}
			}
		});

		this.customPageSizeInput.focus();
	}

	/**
	 * Hide custom page size input
	 */
	private hideCustomPageSizeInput(): void {
		if (this.customPageSizeInput) {
			this.customPageSizeInput.remove();
			this.customPageSizeInput = null;
		}
	}

	/**
	 * Go to a specific page (clamped to valid range)
	 */
	private goToPage(page: number): void {
		// Clamp to valid range
		const targetPage = Math.max(1, Math.min(page, this.totalPages));
		if (targetPage !== this.currentPage) {
			this.onPageChange(targetPage);
		}
	}

	/**
	 * Render pagination state
	 */
	private render(): void {
		// Update page info
		this.pageInfo.setText(`Page ${this.currentPage} of ${this.totalPages}`);

		// Update item info
		const start = this.totalItems > 0 ? (this.currentPage - 1) * this.pageSize + 1 : 0;
		const end = Math.min(this.currentPage * this.pageSize, this.totalItems);
		this.itemInfo.setText(`Showing ${start}-${end} of ${this.totalItems}`);

		// Update button states
		const canGoPrev = this.currentPage > 1;
		const canGoPrev10 = this.currentPage > 10;
		const canGoNext = this.currentPage < this.totalPages;
		const canGoNext10 = this.currentPage + 10 <= this.totalPages;

		this.firstBtn.disabled = !canGoPrev;
		this.prev10Btn.disabled = !canGoPrev10;
		this.prevBtn.disabled = !canGoPrev;
		this.nextBtn.disabled = !canGoNext;
		this.next10Btn.disabled = !canGoNext10;
		this.lastBtn.disabled = !canGoNext;

		// Update disabled class
		this.firstBtn.toggleClass(CSS_CLASSES.paginationBtnDisabled, !canGoPrev);
		this.prev10Btn.toggleClass(CSS_CLASSES.paginationBtnDisabled, !canGoPrev10);
		this.prevBtn.toggleClass(CSS_CLASSES.paginationBtnDisabled, !canGoPrev);
		this.nextBtn.toggleClass(CSS_CLASSES.paginationBtnDisabled, !canGoNext);
		this.next10Btn.toggleClass(CSS_CLASSES.paginationBtnDisabled, !canGoNext10);
		this.lastBtn.toggleClass(CSS_CLASSES.paginationBtnDisabled, !canGoNext);
	}

	/**
	 * Update pagination state
	 */
	update(currentPage: number, totalPages: number, totalItems: number, pageSize: number): void {
		this.currentPage = currentPage;
		this.totalPages = totalPages;
		this.totalItems = totalItems;
		this.pageSize = pageSize;

		// Update page size selector if not custom
		if (!this.customPageSizeInput) {
			const matchingOption = PAGE_SIZE_OPTIONS.find(
				(opt) => typeof opt.value === 'number' && opt.value === pageSize
			);
			if (matchingOption) {
				this.pageSizeSelect.value = String(pageSize);
			} else {
				this.pageSizeSelect.value = 'custom';
				this.showCustomPageSizeInput();
				// Use non-null assertion since showCustomPageSizeInput creates it
				this.customPageSizeInput!.value = String(pageSize);
			}
		}

		this.render();
	}
}
