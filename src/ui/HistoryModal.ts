import { Modal, Setting, type App } from "obsidian";
import type { Snapshot } from "../core/history";

/** Lists saved snapshots for a note and lets the user restore one or delete history. */
export class HistoryModal extends Modal {
	constructor(
		app: App,
		private notePath: string,
		private snapshots: Snapshot[],
		private onRestore: (snapshot: Snapshot) => void,
		private onClear: () => void,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText("Burnish: history");
		this.contentEl.createEl("p", { cls: "burnish-muted", text: this.notePath });

		if (this.snapshots.length === 0) {
			this.contentEl.createEl("p", { text: "No saved versions for this note yet." });
			return;
		}

		const list = this.contentEl.createDiv({ cls: "burnish-file-list" });
		this.snapshots.forEach((snap, i) => {
			const preview = snap.content.replace(/\s+/g, " ").slice(0, 80);
			new Setting(list)
				.setName(`${i === 0 ? "Most recent" : `#${i + 1}`} - ${snap.at}`)
				.setDesc(`${snap.label} · ${preview}${snap.content.length > 80 ? "…" : ""}`)
				.addButton((b) =>
					b
						.setButtonText("Restore")
						.setCta()
						.onClick(() => {
							this.onRestore(snap);
							this.close();
						}),
				);
		});

		new Setting(this.contentEl)
			.addButton((b) =>
				b
					.setButtonText("Clear history for this note")
					.setDestructive()
					.onClick(() => {
						this.onClear();
						this.close();
					}),
			)
			.addButton((b) => b.setButtonText("Close").onClick(() => this.close()));
	}

	onClose() {
		this.contentEl.empty();
	}
}
