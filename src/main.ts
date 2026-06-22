import {
	Editor,
	MarkdownView,
	Menu,
	Notice,
	Plugin,
	TFile,
	type MarkdownFileInfo,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	type BurnishSettings,
	type Grit,
	type PromptAction,
} from "./settings/settings";
import { BurnishSettingTab } from "./settings/SettingsTab";
import { makeProvider, defaultModel } from "./providers/factory";
import { buildRequest, splitFrontmatter } from "./core/context";
import { enabledActions, resolveForPath } from "./core/promptLibrary";
import { restore, droppedPlaceholders } from "./util/protect";
import { estimateTokens } from "./util/chunk";
import { buildMergeUser, MERGE_SYSTEM, type MergeSource } from "./core/merge";
import { buildMermaidUser, MERMAID_SYSTEM, normalizeMermaid } from "./core/mermaid";
import type { VariableContext } from "./core/variables";
import { DiffModal } from "./ui/DiffModal";
import { PromptInputModal } from "./ui/PromptInputModal";
import { ActionPicker } from "./ui/ActionPicker";
import { FileMergeModal } from "./ui/FileMergeModal";
import { replaceRange, insertAtCursor, wholeDocRange, type TargetRange } from "./util/apply";

export default class BurnishPlugin extends Plugin {
	settings: BurnishSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BurnishSettingTab(this.app, this));
		this.registerCommands();
		this.registerMenus();
		this.addRibbonIcon("sparkles", "Burnish", () => this.openPicker());
	}

	async loadSettings() {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Re-register commands after the user edits actions in settings. */
	refreshCommands() {
		this.registerCommands();
	}

	// ---- command / menu registration -------------------------------------------------

	private registerCommands() {
		// One command per enabled action.
		for (const action of enabledActions(this.settings)) {
			this.addCommand({
				id: `action-${action.id}`,
				name: action.name,
				editorCallback: (editor, view) => this.runAction(editor, view, action),
			});
		}

		this.addCommand({
			id: "pick-action",
			name: "Pick an action…",
			editorCallback: () => this.openPicker(),
		});

		this.addCommand({
			id: "custom-instruction",
			name: "Custom instruction…",
			editorCallback: (editor, view) => this.runCustom(editor, view),
		});

		this.addCommand({
			id: "merge-current-note",
			name: "Merge & dedupe meeting notes (current note)",
			editorCallback: (editor, view) => this.runMergeCurrent(editor, view),
		});

		this.addCommand({
			id: "merge-files",
			name: "Merge & dedupe meeting notes (pick files)…",
			callback: () => this.runMergeFiles(),
		});

		this.addCommand({
			id: "mermaid",
			name: "Generate Mermaid diagram",
			editorCallback: (editor, view) => this.runMermaid(editor, view),
		});
	}

	private registerMenus() {
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view) => {
				menu.addItem((item) => {
					item.setTitle("Burnish").setIcon("sparkles");
					const sub = (item as unknown as { setSubmenu(): Menu }).setSubmenu();
					for (const action of enabledActions(this.settings)) {
						sub.addItem((i) =>
							i.setTitle(action.name).onClick(() => this.runAction(editor, view, action)),
						);
					}
					sub.addSeparator();
					sub.addItem((i) =>
						i.setTitle("Custom instruction…").onClick(() => this.runCustom(editor, view)),
					);
				});
			}),
		);
	}

	// ---- core run flow ----------------------------------------------------------------

	private buildVarContext(file: TFile | null): VariableContext {
		const fm = file ? (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) : {};
		return {
			title: file?.basename ?? "Untitled",
			path: file?.path ?? "",
			selection: "",
			frontmatter: fm as Record<string, unknown>,
			date: isoDate(),
		};
	}

	private grit(): Grit {
		return this.settings.defaultGrit;
	}

	/** Resolve the model for an action on a given path (folder default > action > provider default). */
	private modelFor(action: PromptAction, path: string): string {
		const { modelOverride } = resolveForPath(this.settings, path, action.id);
		return modelOverride ?? defaultModel(this.settings);
	}

	private costGuardOk(text: string): boolean {
		const tokens = estimateTokens(text);
		if (tokens <= this.settings.costGuardTokens) return true;
		return window.confirm(
			`This note is large (~${tokens.toLocaleString()} input tokens, over your ${this.settings.costGuardTokens.toLocaleString()} guard).\n\nSend it anyway?`,
		);
	}

	/** Main entry: run a cleanup/transform action against the selection or whole note. */
	async runAction(editor: Editor, view: MarkdownView | MarkdownFileInfo, action: PromptAction) {
		const file = view.file ?? null;
		const selection = editor.getSelection();
		const usingSelection = selection.trim().length > 0;

		let targetText: string;
		let range: TargetRange;
		if (usingSelection) {
			targetText = selection;
			range = { from: editor.getCursor("from"), to: editor.getCursor("to") };
		} else {
			const whole = editor.getValue();
			const { frontmatter, body } = splitFrontmatter(whole);
			targetText = body;
			// Replace only the body, leaving frontmatter untouched.
			const fmLines = frontmatter ? frontmatter.split("\n").length - 1 : 0;
			range = {
				from: { line: fmLines, ch: 0 },
				to: { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length },
			};
		}

		if (!targetText.trim()) {
			new Notice("Burnish: nothing to burnish (note/selection is empty).");
			return;
		}
		if (!this.costGuardOk(targetText)) return;

		const vars = this.buildVarContext(file);
		vars.selection = usingSelection ? selection : "";

		const built = buildRequest({
			action,
			targetText,
			vars,
			grit: action.grit ?? this.grit(),
			protectRegions: true,
			model: this.modelFor(action, file?.path ?? ""),
			temperature: this.settings.temperature,
		});

		const provider = makeProvider(this.settings);

		const warnings: string[] = [];
		new DiffModal({
			app: this.app,
			title: `Burnish: ${action.name}`,
			original: targetText,
			run: (signal) => provider.complete({ ...built.request, signal }),
			transform: (raw) => {
				const restored = restore(raw.trim(), built.protectMap);
				const dropped = droppedPlaceholders(raw, built.protectMap);
				if (dropped.length) {
					warnings.push(
						`${dropped.length} protected region(s) (code/math/embed) were not returned by the model and have been restored.`,
					);
				}
				return restored;
			},
			warnings,
			onReRun: () => this.runAction(editor, view, action),
			onApply: (result) => {
				if (action.output === "insert") insertAtCursor(editor, result);
				else if (action.output === "newNote") void this.writeNewNote(file, action.name, result);
				else replaceRange(editor, result, range);
			},
		}).open();
	}

	private runCustom(editor: Editor, view: MarkdownView | MarkdownFileInfo) {
		new PromptInputModal(this.app, {}, (instruction) => {
			if (!instruction) return;
			const action: PromptAction = {
				id: "__adhoc__",
				name: "Custom",
				prompt: `You are editing a Markdown note in Obsidian. Preserve [[wikilinks]], #tags, frontmatter, code and math. Return only the edited Markdown.\n\nInstruction: ${instruction}`,
				output: "replace",
				enabled: true,
			};
			this.runAction(editor, view, action);
		}).open();
	}

	private openPicker() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("Burnish: open a note first.");
			return;
		}
		new ActionPicker(this.app, enabledActions(this.settings), (action, isCustom) => {
			if (isCustom) this.runCustom(view.editor, view);
			else this.runAction(view.editor, view, action);
		}).open();
	}

	// ---- merge ------------------------------------------------------------------------

	private runMergeCurrent(editor: Editor, view: MarkdownView | MarkdownFileInfo) {
		const text = editor.getValue();
		if (!text.trim()) {
			new Notice("Burnish: note is empty.");
			return;
		}
		this.runMerge([{ label: view.file?.basename ?? "Note", content: text }], view.file ?? null);
	}

	private async runMergeFiles() {
		const files = this.app.vault.getMarkdownFiles();
		const active = this.app.workspace.getActiveFile();
		new FileMergeModal(this.app, files, active ? [active.path] : [], async (chosen) => {
			if (!chosen || chosen.length < 2) return;
			const sources: MergeSource[] = [];
			for (const f of chosen) {
				sources.push({ label: f.basename, content: await this.app.vault.read(f) });
			}
			this.runMerge(sources, active ?? chosen[0]);
		}).open();
	}

	private runMerge(sources: MergeSource[], near: TFile | null) {
		const user = buildMergeUser({ sources, attribution: this.settings.mergeAttribution });
		const total = sources.reduce((n, s) => n + estimateTokens(s.content), 0);
		if (total > this.settings.costGuardTokens && !this.costGuardOk(sources.map((s) => s.content).join("\n"))) {
			return;
		}
		const provider = makeProvider(this.settings);
		new DiffModal({
			app: this.app,
			title: "Burnish: merge & dedupe meeting notes",
			original: "",
			run: (signal) =>
				provider.complete({
					system: MERGE_SYSTEM,
					user,
					temperature: this.settings.temperature,
					maxTokens: 8192,
					signal,
				}),
			onApply: (result) => void this.writeNewNote(near, "Merged notes", result),
		}).open();
	}

	// ---- mermaid ----------------------------------------------------------------------

	private runMermaid(editor: Editor, view: MarkdownView | MarkdownFileInfo) {
		const sel = editor.getSelection();
		const source = sel.trim() ? sel : editor.getValue();
		if (!source.trim()) {
			new Notice("Burnish: nothing to diagram.");
			return;
		}
		const provider = makeProvider(this.settings);
		new DiffModal({
			app: this.app,
			title: "Burnish: Mermaid diagram",
			original: "",
			run: (signal) =>
				provider.complete({
					system: MERMAID_SYSTEM,
					user: buildMermaidUser({ kind: "auto", source }),
					temperature: this.settings.temperature,
					signal,
				}),
			transform: (raw) => normalizeMermaid(raw),
			onApply: (result) => insertAtCursor(editor, "\n" + result + "\n"),
		}).open();
		void view;
	}

	// ---- output helpers ---------------------------------------------------------------

	private async writeNewNote(near: TFile | null, suffix: string, content: string): Promise<void> {
		const folder = this.settings.newNoteFolder.trim().replace(/\/$/, "");
		const baseName = near ? near.basename : "Untitled";
		const name = `${baseName} (${suffix})`;
		const path = folder ? `${folder}/${name}.md` : `${name}.md`;
		try {
			const file = await this.app.vault.create(path, content);
			await this.app.workspace.getLeaf(true).openFile(file);
			new Notice(`Burnish: created ${file.path}`);
		} catch (e) {
			new Notice(`Burnish: could not create note: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

function isoDate(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
