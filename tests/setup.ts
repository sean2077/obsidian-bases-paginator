import { afterEach } from "vitest";

type CreateOptions = {
	attr?: Record<string, string>;
	cls?: string;
	text?: string;
	type?: string;
	value?: string;
};

function applyOptions(element: HTMLElement, options?: string | CreateOptions): void {
	if (typeof options === "string") {
		element.className = options;
		return;
	}
	if (!options) return;
	if (options.cls) element.className = options.cls;
	if (options.text) element.textContent = options.text;
	if (options.type) element.setAttribute("type", options.type);
	if (options.value) element.setAttribute("value", options.value);
	for (const [name, value] of Object.entries(options.attr ?? {})) {
		element.setAttribute(name, value);
	}
}

HTMLElement.prototype.addClass = function (...classes: string[]): void {
	this.classList.add(...classes);
};
HTMLElement.prototype.removeClass = function (...classes: string[]): void {
	this.classList.remove(...classes);
};
HTMLElement.prototype.toggleClass = function (className: string, value: boolean): void {
	this.classList.toggle(className, value);
};
HTMLElement.prototype.createDiv = function (options?: string | CreateOptions): HTMLDivElement {
	return this.createEl("div", options);
};
HTMLElement.prototype.createSpan = function (options?: string | CreateOptions): HTMLSpanElement {
	return this.createEl("span", options);
};
HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options?: string | CreateOptions
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	applyOptions(element, options);
	this.append(element);
	return element;
};
HTMLElement.prototype.setText = function (text: string): void {
	this.textContent = text;
};
HTMLElement.prototype.empty = function (): void {
	this.replaceChildren();
};
HTMLElement.prototype.show = function (): void {
	this.style.display = "";
};
HTMLElement.prototype.hide = function (): void {
	this.style.display = "none";
};

afterEach(() => {
	document.body.replaceChildren();
});
