import { Modal, Setting, type App } from "obsidian";

export interface ConfirmOptions {
	title: string;
	body: string;
	/** Confirm button label. */
	cta: string;
	/** Style the confirm button as destructive. */
	destructive?: boolean;
}

/**
 * A small yes/no modal, used instead of `window.confirm` (which Obsidian discourages and which
 * does not match the app's look). Resolve via {@link confirm}.
 */
class ConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private opts: ConfirmOptions,
		private onResult: (ok: boolean) => void,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.opts.title);
		this.contentEl.createEl("p", { text: this.opts.body });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => {
				b.setButtonText(this.opts.cta).setCta();
				if (this.opts.destructive) b.setDestructive();
				b.onClick(() => {
					this.resolved = true;
					this.onResult(true);
					this.close();
				});
			});
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) this.onResult(false);
	}
}

/** Open a confirm dialog and resolve true if the user confirms, false otherwise. */
export function confirm(app: App, opts: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => new ConfirmModal(app, opts, resolve).open());
}
