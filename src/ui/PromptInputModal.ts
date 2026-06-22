import { Modal, Setting, type App } from "obsidian";

/** Ad-hoc one-off instruction input. Resolves with the instruction, or null if cancelled. */
export class PromptInputModal extends Modal {
	private value = "";
	private resolved = false;

	constructor(
		app: App,
		private opts: { title?: string; placeholder?: string; initial?: string },
		private onSubmit: (instruction: string | null) => void,
	) {
		super(app);
		this.value = opts.initial ?? "";
	}

	onOpen() {
		this.titleEl.setText(this.opts.title ?? "Burnish: custom instruction");
		const ta = this.contentEl.createEl("textarea", {
			cls: "burnish-prompt-input",
			attr: { rows: "4", placeholder: this.opts.placeholder ?? "e.g. Rewrite this in my blog voice" },
		});
		ta.value = this.value;
		ta.addEventListener("input", () => (this.value = ta.value));
		ta.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				this.submit();
			}
		});
		window.setTimeout(() => ta.focus(), 0);

		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("Run").setCta().onClick(() => this.submit()));
	}

	private submit() {
		if (!this.value.trim()) return;
		this.resolved = true;
		this.onSubmit(this.value.trim());
		this.close();
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) this.onSubmit(null);
	}
}
