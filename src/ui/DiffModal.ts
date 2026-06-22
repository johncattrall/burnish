import { Modal, Notice, Setting, type App } from "obsidian";
import { computeDiff, reconstruct, type DiffResult } from "../core/diff";

/**
 * The trust feature: stream the model output, then show a per-hunk diff the user accepts or
 * rejects before anything is written. On apply, the caller writes the reconstructed text as a
 * single editor transaction (single undo).
 */

export interface DiffModalConfig {
	app: App;
	title: string;
	original: string;
	/** Streams the raw model output. */
	run: (signal: AbortSignal) => AsyncIterable<string>;
	/** Transform the full raw output before diffing (e.g. restore protected regions). */
	transform?: (raw: string) => string;
	/** Called with the reconstructed text when the user applies. */
	onApply: (result: string) => void;
	/** Optional: re-run with a tweaked instruction. */
	onReRun?: () => void;
	/** Warnings to surface (e.g. dropped protected regions, cost). */
	warnings?: string[];
}

export class DiffModal extends Modal {
	private cfg: DiffModalConfig;
	private controller = new AbortController();
	private raw = "";
	private diff?: DiffResult;
	private accepted = new Set<number>();
	private streaming = true;

	private bodyEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private warningsEl!: HTMLElement;

	constructor(cfg: DiffModalConfig) {
		super(cfg.app);
		this.cfg = cfg;
	}

	onOpen() {
		this.modalEl.addClass("burnish-diff-modal");
		this.titleEl.setText(this.cfg.title);

		this.statusEl = this.contentEl.createDiv({ cls: "burnish-status" });
		this.warningsEl = this.contentEl.createDiv({ cls: "burnish-warnings" });
		this.renderWarnings();
		this.bodyEl = this.contentEl.createDiv({ cls: "burnish-diff-body" });
		this.footerEl = this.contentEl.createDiv({ cls: "burnish-diff-footer" });

		void this.stream();
	}

	onClose() {
		this.controller.abort();
		this.contentEl.empty();
	}

	private async stream() {
		this.statusEl.setText("Burnishing…");
		const live = this.bodyEl.createEl("pre", { cls: "burnish-stream" });
		try {
			for await (const chunk of this.cfg.run(this.controller.signal)) {
				this.raw += chunk;
				live.setText(this.raw);
				live.scrollTop = live.scrollHeight;
			}
		} catch (e) {
			this.streaming = false;
			this.statusEl.setText("");
			this.bodyEl.empty();
			this.bodyEl.createDiv({
				cls: "burnish-error",
				text: `Failed: ${e instanceof Error ? e.message : String(e)}`,
			});
			this.renderFooter();
			return;
		}
		this.streaming = false;
		this.buildDiff();
		this.renderWarnings();
	}

	private renderWarnings() {
		if (!this.warningsEl) return;
		this.warningsEl.empty();
		for (const warn of this.cfg.warnings ?? []) {
			this.warningsEl.createDiv({ cls: "burnish-warning", text: `⚠️ ${warn}` });
		}
	}

	private buildDiff() {
		const modified = (this.cfg.transform ? this.cfg.transform(this.raw) : this.raw).trimEnd() + "\n";
		const original = this.cfg.original.trimEnd() + "\n";
		this.diff = computeDiff(original, modified);
		// Default: accept everything.
		this.accepted = new Set(this.diff.hunks.map((h) => h.index));

		this.statusEl.setText(
			this.diff.hunks.length === 0
				? "No changes proposed."
				: `${this.diff.hunks.length} change${this.diff.hunks.length === 1 ? "" : "s"} proposed.`,
		);
		this.renderHunks();
		this.renderFooter();
	}

	private renderHunks() {
		this.bodyEl.empty();
		if (!this.diff || this.diff.hunks.length === 0) {
			this.bodyEl.createDiv({ cls: "burnish-nochange", text: this.cfg.original ? "" : "" });
			return;
		}
		const list = this.bodyEl.createDiv({ cls: "burnish-hunks" });
		for (const hunk of this.diff.hunks) {
			const row = list.createDiv({ cls: "burnish-hunk" });
			const head = row.createDiv({ cls: "burnish-hunk-head" });
			const cb = head.createEl("input", { type: "checkbox" });
			cb.checked = this.accepted.has(hunk.index);
			cb.onchange = () => {
				if (cb.checked) this.accepted.add(hunk.index);
				else this.accepted.delete(hunk.index);
			};
			head.createSpan({ text: ` Change at line ${hunk.originalStartLine}` });

			const cols = row.createDiv({ cls: "burnish-hunk-cols" });
			if (hunk.before) {
				const before = cols.createDiv({ cls: "burnish-col burnish-before" });
				before.createEl("pre", { text: hunk.before.replace(/\n$/, "") });
			}
			if (hunk.after) {
				const after = cols.createDiv({ cls: "burnish-col burnish-after" });
				after.createEl("pre", { text: hunk.after.replace(/\n$/, "") });
			}
		}
	}

	private renderFooter() {
		this.footerEl.empty();
		const s = new Setting(this.footerEl);

		if (this.streaming) {
			s.addButton((b) =>
				b.setButtonText("Stop").onClick(() => {
					this.controller.abort();
				}),
			);
			return;
		}

		const hasChanges = !!this.diff && this.diff.hunks.length > 0;

		if (hasChanges) {
			s.addExtraButton((b) =>
				b
					.setIcon("check-check")
					.setTooltip("Accept all")
					.onClick(() => {
						this.accepted = new Set(this.diff!.hunks.map((h) => h.index));
						this.renderHunks();
					}),
			);
			s.addExtraButton((b) =>
				b
					.setIcon("x")
					.setTooltip("Reject all")
					.onClick(() => {
						this.accepted.clear();
						this.renderHunks();
					}),
			);
		}

		if (this.cfg.onReRun) {
			s.addButton((b) => b.setButtonText("Re-run…").onClick(() => {
				this.close();
				this.cfg.onReRun!();
			}));
		}

		s.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

		if (hasChanges) {
			s.addButton((b) =>
				b
					.setButtonText("Apply")
					.setCta()
					.onClick(() => {
						const result = reconstruct(this.diff!, this.accepted).replace(/\n$/, "");
						this.cfg.onApply(result);
						const n = this.accepted.size;
						new Notice(`Burnish: applied ${n} change${n === 1 ? "" : "s"}.`);
						this.close();
					}),
			);
		}
	}
}
