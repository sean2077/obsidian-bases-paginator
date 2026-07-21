export function setIcon(element: HTMLElement, icon: string): void {
	element.dataset.icon = icon;
}

export class Keymap {
	static isModEvent(event: MouseEvent): boolean {
		return event.ctrlKey || event.metaKey;
	}
}

export class BasesView {
	readonly app: unknown;

	constructor(controller: { app: unknown }) {
		this.app = controller.app;
	}
}

export class PluginSettingTab {
	readonly app: unknown;
	readonly containerEl = document.createElement("div");

	constructor(app: unknown, _plugin: unknown) {
		this.app = app;
	}
}

export class Setting {}
