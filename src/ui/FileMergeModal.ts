import { Modal, Setting, TFile, type App } from "obsidian";

/** Multi-select list of Markdown files to merge. Resolves with the chosen files, or null. */
export class FileMergeModal extends Modal {
	private selected = new Set<string>();
	private resolved = false;

	constructor(
		app: App,
		private files: TFile[],
		private preselect: string[],
		private onSubmit: (files: TFile[] | null) => void,
	) {
		super(app);
		for (const p of preselect) this.selected.add(p);
	}

	onOpen() {
		this.titleEl.setText("Burnish: merge & dedupe meeting notes");
		this.contentEl.createEl("p", {
			cls: "burnish-muted",
			text: "Pick the notes to merge into one new, deduplicated note.",
		});

		const list = this.contentEl.createDiv({ cls: "burnish-file-list" });
		for (const f of this.files) {
			const row = new Setting(list).setName(f.basename).setDesc(f.path);
			row.addToggle((t) =>
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
					.setButtonText("Merge")
					.setCta()
					.onClick(() => {
						const chosen = this.files.filter((f) => this.selected.has(f.path));
						if (chosen.length < 2) return;
						this.resolved = true;
						this.onSubmit(chosen);
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) this.onSubmit(null);
	}
}
