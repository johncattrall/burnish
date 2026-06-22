import { Modal, Setting, TFile, type App } from "obsidian";

export interface FilePickerOptions {
	title: string;
	description: string;
	submitLabel: string;
	/** Minimum number of files required to enable submit. */
	minCount: number;
}

/** Multi-select list of Markdown files. Resolves with the chosen files, or null if cancelled. */
export class FilePickerModal extends Modal {
	private selected = new Set<string>();
	private resolved = false;

	constructor(
		app: App,
		private files: TFile[],
		private preselect: string[],
		private opts: FilePickerOptions,
		private onSubmit: (files: TFile[] | null) => void | Promise<void>,
	) {
		super(app);
		for (const p of preselect) this.selected.add(p);
	}

	onOpen() {
		this.titleEl.setText(this.opts.title);
		this.contentEl.createEl("p", { cls: "burnish-muted", text: this.opts.description });

		const list = this.contentEl.createDiv({ cls: "burnish-file-list" });
		for (const f of this.files) {
			new Setting(list)
				.setName(f.basename)
				.setDesc(f.path)
				.addToggle((t) =>
					t.setValue(this.selected.has(f.path)).onChange((v) => {
						if (v) this.selected.add(f.path);
						else this.selected.delete(f.path);
					}),
				);
		}

		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(this.opts.submitLabel)
					.setCta()
					.onClick(() => {
						const chosen = this.files.filter((f) => this.selected.has(f.path));
						if (chosen.length < this.opts.minCount) return;
						this.resolved = true;
						void this.onSubmit(chosen);
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) void this.onSubmit(null);
	}
}
