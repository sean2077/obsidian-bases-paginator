import { setIcon } from "obsidian";
import type { PaginationState } from "../services/Paginator";
import type { PaginationBarOptions } from "../types";
import { CSS_CLASSES, PAGE_SIZE_OPTIONS } from "../utils/constants";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE, isValidPageSize } from "../utils/pageSize";

export class PaginationBar {
	private readonly firstButton: HTMLButtonElement;
	private readonly previousButton: HTMLButtonElement;
	private readonly nextButton: HTMLButtonElement;
	private readonly lastButton: HTMLButtonElement;
	private readonly pageInfo: HTMLSpanElement;
	private readonly pageJumpInput: HTMLInputElement;
	private readonly pageJumpError: HTMLSpanElement;
	private readonly itemInfo: HTMLSpanElement;
	private readonly pageSizeSelect: HTMLSelectElement;
	private readonly customPageSizeInput: HTMLInputElement;
	private readonly customPageSizeError: HTMLSpanElement;
	private currentPage = 1;
	private totalPages = 1;
	private totalItems = 0;
	private pageSize = DEFAULT_PAGE_SIZE;

	constructor(
		containerEl: HTMLElement,
		private readonly options: PaginationBarOptions
	) {
		containerEl.addClass(CSS_CLASSES.paginationBar);

		const sizeContainer = containerEl.createDiv(CSS_CLASSES.pageSizeSelector);
		const sizeLabel = sizeContainer.createEl("label", { text: "Items per page " });
		this.pageSizeSelect = sizeLabel.createEl("select", {
			attr: { "aria-label": "Items per page" },
		});
		for (const option of PAGE_SIZE_OPTIONS) {
			this.pageSizeSelect.createEl("option", {
				value: String(option.value),
				text: option.label,
			});
		}
		this.pageSizeSelect.value = String(this.pageSize);
		this.pageSizeSelect.addEventListener("change", () => this.handlePageSizeSelection());

		this.customPageSizeInput = sizeLabel.createEl("input", {
			type: "number",
			cls: CSS_CLASSES.customPageSizeInput,
			attr: {
				"aria-label": "Custom items per page",
				inputmode: "numeric",
				max: String(MAX_PAGE_SIZE),
				min: String(MIN_PAGE_SIZE),
				step: "1",
			},
		});
		this.customPageSizeInput.hidden = true;
		this.customPageSizeError = sizeLabel.createSpan({
			cls: CSS_CLASSES.customPageSizeError,
			text: `Enter ${MIN_PAGE_SIZE}–${MAX_PAGE_SIZE.toLocaleString("en-US")}.`,
			attr: { role: "alert" },
		});
		this.customPageSizeError.hidden = true;
		this.customPageSizeInput.addEventListener("change", () => this.applyCustomPageSize());
		this.customPageSizeInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") this.applyCustomPageSize();
			if (event.key === "Escape") this.customPageSizeInput.blur();
		});

		const navigation = containerEl.createEl("nav", {
			cls: CSS_CLASSES.navContainer,
			attr: { "aria-label": "Pagination" },
		});
		this.firstButton = this.createButton(navigation, "First page", "chevrons-left", () => 1);
		this.previousButton = this.createButton(
			navigation,
			"Previous page",
			"chevron-left",
			() => this.currentPage - 1
		);
		this.pageInfo = navigation.createSpan({
			cls: CSS_CLASSES.pageInfo,
			attr: { "aria-atomic": "true", "aria-live": "polite", role: "status" },
		});
		this.nextButton = this.createButton(navigation, "Next page", "chevron-right", () => this.currentPage + 1);
		this.lastButton = this.createButton(navigation, "Last page", "chevrons-right", () => this.totalPages);
		const pageJumpLabel = containerEl.createEl("label", { cls: CSS_CLASSES.pageJump, text: "Go to page " });
		this.pageJumpInput = pageJumpLabel.createEl("input", {
			type: "number",
			cls: CSS_CLASSES.pageJumpInput,
			attr: { "aria-label": "Go to page", inputmode: "numeric", min: "1", step: "1" },
		});
		this.pageJumpError = pageJumpLabel.createSpan({
			cls: CSS_CLASSES.pageJumpError,
			attr: { role: "alert" },
		});
		this.pageJumpError.hidden = true;
		this.pageJumpInput.addEventListener("change", () => this.applyPageJump());
		this.pageJumpInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				this.applyPageJump();
			} else if (event.key === "Escape") {
				event.preventDefault();
				this.resetPageJump();
				this.pageJumpInput.blur();
			}
		});
		this.itemInfo = containerEl.createSpan({ cls: CSS_CLASSES.itemInfo });
		this.render();
		this.resetPageJump();
	}

	update(state: PaginationState): void {
		const pageChanged = this.currentPage !== state.currentPage || this.totalPages !== state.totalPages;
		const pageSizeChanged = this.pageSize !== state.pageSize;
		this.currentPage = state.currentPage;
		this.totalPages = state.totalPages;
		this.totalItems = state.totalItems;
		this.pageSize = state.pageSize;
		if (pageSizeChanged || this.customPageSizeInput.ownerDocument.activeElement !== this.customPageSizeInput) {
			this.syncPageSizeControls();
		}
		this.render();
		// A metadata update must not erase a page number the user is still typing.
		if (
			pageChanged ||
			this.totalItems === 0 ||
			this.pageJumpInput.ownerDocument.activeElement !== this.pageJumpInput
		) {
			this.resetPageJump();
		}
	}

	private applyPageJump(): void {
		if (this.pageJumpInput.disabled) return;
		const page = Number(this.pageJumpInput.value);
		if (!Number.isSafeInteger(page) || page < 1 || page > this.totalPages) {
			this.pageJumpInput.setAttribute("aria-invalid", "true");
			this.pageJumpError.setText(`Enter a page from 1 to ${this.totalPages}.`);
			this.pageJumpError.hidden = false;
			return;
		}
		this.pageJumpInput.removeAttribute("aria-invalid");
		this.pageJumpError.hidden = true;
		this.goToPage(page);
	}

	private resetPageJump(): void {
		this.pageJumpInput.value = String(this.currentPage);
		this.pageJumpInput.removeAttribute("aria-invalid");
		this.pageJumpError.hidden = true;
	}

	private createButton(
		container: HTMLElement,
		label: string,
		icon: string,
		getPage: () => number
	): HTMLButtonElement {
		const button = container.createEl("button", {
			cls: CSS_CLASSES.paginationBtn,
			attr: { "aria-label": label, title: label, type: "button" },
		});
		setIcon(button, icon);
		button.addEventListener("click", () => this.goToPage(getPage()));
		return button;
	}

	private handlePageSizeSelection(): void {
		if (this.pageSizeSelect.value === "custom") {
			this.customPageSizeInput.hidden = false;
			this.customPageSizeInput.value = String(this.pageSize);
			this.customPageSizeInput.focus();
			return;
		}

		this.customPageSizeInput.hidden = true;
		this.customPageSizeError.hidden = true;
		const size = Number(this.pageSizeSelect.value);
		if (Number.isInteger(size) && size > 0) this.options.onPageSizeChange(size);
	}

	private applyCustomPageSize(): void {
		const size = Number(this.customPageSizeInput.value);
		if (!isValidPageSize(size)) {
			this.customPageSizeInput.setAttribute("aria-invalid", "true");
			this.customPageSizeError.hidden = false;
			return;
		}
		this.customPageSizeInput.removeAttribute("aria-invalid");
		this.customPageSizeError.hidden = true;
		this.options.onPageSizeChange(size);
	}

	private syncPageSizeControls(): void {
		const isStandard = PAGE_SIZE_OPTIONS.some((option) => option.value === this.pageSize);
		this.pageSizeSelect.value = isStandard ? String(this.pageSize) : "custom";
		this.customPageSizeInput.hidden = isStandard;
		if (!isStandard) this.customPageSizeInput.value = String(this.pageSize);
		this.customPageSizeInput.removeAttribute("aria-invalid");
		this.customPageSizeError.hidden = true;
	}

	private goToPage(page: number): void {
		const target = Math.max(1, Math.min(page, this.totalPages));
		if (target !== this.currentPage) this.options.onPageChange(target);
	}

	private render(): void {
		this.pageInfo.setText(`Page ${this.currentPage} of ${this.totalPages}`);
		this.pageJumpInput.max = String(this.totalPages);
		this.pageJumpInput.disabled = this.totalItems === 0;
		if (this.totalItems === 0) {
			this.itemInfo.setText("No items");
		} else {
			const start = (this.currentPage - 1) * this.pageSize + 1;
			const end = Math.min(this.currentPage * this.pageSize, this.totalItems);
			this.itemInfo.setText(`Showing ${start}–${end} of ${this.totalItems}`);
		}

		const canGoPrevious = this.currentPage > 1;
		const canGoNext = this.currentPage < this.totalPages;
		this.firstButton.disabled = !canGoPrevious;
		this.previousButton.disabled = !canGoPrevious;
		this.nextButton.disabled = !canGoNext;
		this.lastButton.disabled = !canGoNext;
	}
}
