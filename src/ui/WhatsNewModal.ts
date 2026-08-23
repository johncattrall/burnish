import { App, Modal, Setting } from "obsidian";

/**
 * One-time "what's new" notice, shown once per upgrade (gated on a stored version in settings).
 * No network, no tracking - it just tells existing users what changed. Closing it (any way) marks
 * the version as seen via {@link onSeen}.
 */
export class WhatsNewModal extends Modal {
	constructor(
		app: App,
		private onSeen: () => void,
		private onOpenSettings: () => void,
	) {
		super(app);
	}

	onOpen() {
		this.modalEl.addClass("burnish-whatsnew-modal");
		this.titleEl.setText("What's new in Burnish 1.1");

		const c = this.contentEl;
		c.createEl("p", {
			text: "Burnish now runs without your own API key if you want it to - and there is more it can do.",
		});

		const ul = c.createEl("ul");
		const items = [
			"Burnish (hosted): sign up with just your email for a free tier - no API key needed. Tidy and Format cleanup, 20 actions a month, plus 3 one-time previews of the Pro features.",
			"Upgrade to Pro for every action (Restructure, Distill, Merge, diagrams, tables, Map of Content, custom prompts) on stronger models.",
			"Prefer your own key? Nothing changes - Bring your own key (Anthropic, any OpenAI-compatible endpoint, or a local model) stays free and unlimited.",
			"Your notes are only ever sent to the model you choose, and never written without a diff preview.",
		];
		for (const t of items) ul.createEl("li", { text: t });

		const footer = new Setting(c);
		footer.addButton((b) =>
			b
				.setButtonText("Try Burnish (no key needed)")
				.setCta()
				.onClick(() => {
					this.onOpenSettings();
					this.close();
				}),
		);
		footer.addButton((b) => b.setButtonText("Maybe later").onClick(() => this.close()));
	}

	onClose() {
		// Mark seen however the modal was dismissed (button, Esc, click-away) so it shows only once.
		this.onSeen();
		this.contentEl.empty();
	}
}
