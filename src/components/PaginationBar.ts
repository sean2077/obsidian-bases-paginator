import { setIcon } from "obsidian";
import type { PaginationBarOptions } from "../types";
import { CSS_CLASSES, PAGE_SIZE_OPTIONS } from "../utils/constants";

const MAX_PAGE_SIZE = 1000;

export class PaginationBar {
	private readonly firstButton: HTMLButtonElement;
	private readonly previousButton: HTMLButtonElement;
	private readonly nextButton: HTMLButtonElement;
	private readonly lastButton: HTMLButtonElement;
	private readonly pageInfo: HTMLSpanElement;
	private readonly itemInfo: HTMLSpanElement;
	private readonly pageSizeSelect: HTMLSelectElement;
	private readonly customPageSizeInput: HTMLInputElement;
	private readonly customPageSizeError: HTMLSpanElement;
	private currentPage = 1;
	private totalPages = 1;
	private totalItems = 0;
	private pageSize = 25;

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
				min: "1",
				step: "1",
			},
		});
		this.customPageSizeInput.hidden = true;
		this.customPageSizeError = sizeLabel.createSpan({
			cls: CSS_CLASSES.customPageSizeError,
			text: "Enter 1–1,000.",
			attr: { role: "alert" },
		});
		this.customPageSizeError.hidden = true;
		this.customPageSizeInput.addEventListener("change", () => this.applyCustomPageSize());
		this.customPageSizeInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") this.applyCustomPageSize();
			if (event.key === "Escape") this.customPageSizeInput.blur();
		});

		const navigation = containerEl.createDiv({ cls: CSS_CLASSES.navContainer });
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
		this.itemInfo = containerEl.createSpan({ cls: CSS_CLASSES.itemInfo });
		this.render();
	}

	update(currentPage: number, totalPages: number, totalItems: number, pageSize: number): void {
		this.currentPage = currentPage;
		this.totalPages = totalPages;
		this.totalItems = totalItems;
		this.pageSize = pageSize;
		this.syncPageSizeControls();
		this.render();
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
		const valid = Number.isInteger(size) && size >= 1 && size <= MAX_PAGE_SIZE;
		if (!valid) {
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
