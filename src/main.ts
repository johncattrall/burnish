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
import { enabledActions, resolveForPath, globToRegExp, getAction } from "./core/promptLibrary";
import { restore, droppedPlaceholders } from "./util/protect";
import { estimateTokens } from "./util/chunk";
import { buildMergeUser, MERGE_SYSTEM, type MergeSource } from "./core/merge";
import { buildMermaidUser, MERMAID_SYSTEM, normalizeMermaid } from "./core/mermaid";
import { buildTableUser, TABLE_SYSTEM, normalizeTable } from "./core/tables";
import { buildMocUser, MOC_SYSTEM, type MocEntry } from "./core/moc";
import {
	addSnapshot,
	getSnapshots,
	clearHistory,
	renameHistory,
	type Snapshot,
} from "./core/history";
import type { VariableContext } from "./core/variables";
import { collect } from "./providers/Provider";
import { DiffModal } from "./ui/DiffModal";
import { PromptInputModal } from "./ui/PromptInputModal";
import { ActionPicker } from "./ui/ActionPicker";
import { FilePickerModal } from "./ui/FilePickerModal";
import { HistoryModal } from "./ui/HistoryModal";
import { replaceRange, insertAtCursor, wholeDocRange, type TargetRange } from "./util/apply";

export default class BurnishPlugin extends Plugin {
	settings: BurnishSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BurnishSettingTab(this.app, this));
		this.registerCommands();
		this.registerMenus();
		this.registerHistorySync();
		this.addRibbonIcon("sparkles", "Burnish", () => this.openPicker());

		// Scheduled burnish: check shortly after load, then every 10 minutes while open.
		this.app.workspace.onLayoutReady(() => void this.maybeRunSchedule());
		this.registerInterval(window.setInterval(() => void this.maybeRunSchedule(), 10 * 60 * 1000));
	}

	/** Keep the history store keyed correctly as notes are renamed or deleted. */
	private registerHistorySync() {
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile) {
					renameHistory(this.settings.historyStore, oldPath, file.path);
					void this.saveSettings();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile) {
					clearHistory(this.settings.historyStore, file.path);
					void this.saveSettings();
				}
			}),
		);
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

		this.addCommand({
			id: "table",
			name: "Generate table from prose",
			editorCallback: (editor, view) => this.runTable(editor, view),
		});

		this.addCommand({
			id: "moc",
			name: "Generate Map of Content (MOC)…",
			callback: () => this.runMoc(),
		});

		this.addCommand({
			id: "batch",
			name: "Batch burnish across files…",
			callback: () => this.runBatch(),
		});

		this.addCommand({
			id: "history",
			name: "Version history for current note…",
			editorCallback: (_editor, view) => this.openHistory(view.file ?? null),
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
						`${dropped.length} protected region(s) (code/math/embed) were not returned by the model, so they are missing from the proposal below. Reject the affected change (or re-run) if you need to keep them.`,
					);
				}
				return restored;
			},
			warnings,
			onReRun: () => this.runAction(editor, view, action),
			onApply: (result) => {
				if (action.output === "insert") {
					insertAtCursor(editor, result);
				} else if (action.output === "newNote") {
					void this.writeNewNote(file, action.name, result);
				} else {
					// Snapshot the whole note before a replace so it can be rolled back.
					if (file) this.snapshot(file.path, editor.getValue(), action.name);
					replaceRange(editor, result, range);
				}
			},
		}).open();
	}

	/** Record a pre-edit snapshot if history is enabled. */
	private snapshot(path: string, content: string, label: string) {
		if (!this.settings.history.enabled) return;
		const snap: Snapshot = { at: nowStamp(), label, content };
		addSnapshot(this.settings.historyStore, path, snap, this.settings.history.maxPerNote);
		void this.saveSettings();
	}

	private openHistory(file: TFile | null) {
		if (!file) {
			new Notice("Burnish: open a note first.");
			return;
		}
		const snaps = getSnapshots(this.settings.historyStore, file.path);
		new HistoryModal(
			this.app,
			file.path,
			snaps,
			(snap) => void this.restoreSnapshot(file, snap),
			() => {
				clearHistory(this.settings.historyStore, file.path);
				void this.saveSettings();
				new Notice("Burnish: history cleared for this note.");
			},
		).open();
	}

	private async restoreSnapshot(file: TFile, snap: Snapshot) {
		// Snapshot the current content first so a restore is itself reversible.
		const current = await this.app.vault.read(file);
		this.snapshot(file.path, current, "before restore");
		await this.app.vault.modify(file, snap.content);
		new Notice(`Burnish: restored version from ${snap.at}.`);
	}

	// ---- batch & scheduled ------------------------------------------------------------

	/** Run an action on one note's body (no diff preview) and return the restored output. */
	private async burnishText(action: PromptAction, file: TFile, body: string): Promise<string> {
		const vars = this.buildVarContext(file);
		const built = buildRequest({
			action,
			targetText: body,
			vars,
			grit: action.grit ?? this.grit(),
			protectRegions: true,
			model: this.modelFor(action, file.path),
			temperature: this.settings.temperature,
		});
		const provider = makeProvider(this.settings);
		const raw = await collect(provider.complete(built.request));
		return restore(raw.trim(), built.protectMap);
	}

	/**
	 * Apply an action in place across many notes. Each note's body is rewritten and the original
	 * is snapshotted to history first (so the whole batch is reversible). Returns a summary.
	 */
	private async processFiles(
		action: PromptAction,
		files: TFile[],
		notify: boolean,
	): Promise<{ done: number; failed: number }> {
		let done = 0;
		let failed = 0;
		const notice = notify ? new Notice(`Burnish: 0/${files.length}…`, 0) : null;
		for (const file of files) {
			try {
				const whole = await this.app.vault.read(file);
				const { frontmatter, body } = splitFrontmatter(whole);
				if (!body.trim()) continue;
				const newBody = await this.burnishText(action, file, body);
				if (newBody.trim() && newBody.trim() !== body.trim()) {
					this.snapshot(file.path, whole, `batch: ${action.name}`);
					await this.app.vault.modify(file, frontmatter + newBody);
				}
				done++;
			} catch (e) {
				failed++;
				console.error(`Burnish batch failed on ${file.path}:`, e);
			}
			notice?.setMessage(`Burnish: ${done + failed}/${files.length}…`);
		}
		notice?.hide();
		return { done, failed };
	}

	private runBatch() {
		new ActionPicker(this.app, enabledActions(this.settings), (action, isCustom) => {
			if (isCustom) {
				new Notice("Burnish: batch needs a saved action, not a custom one-off.");
				return;
			}
			const files = this.app.vault.getMarkdownFiles();
			const active = this.app.workspace.getActiveFile();
			const folder = active?.parent?.path ?? "";
			const preselect = files.filter((f) => (f.parent?.path ?? "") === folder).map((f) => f.path);
			new FilePickerModal(
				this.app,
				files,
				preselect,
				{
					title: `Burnish: batch "${action.name}"`,
					description:
						"Pick notes to rewrite in place. Originals are snapshotted to history first, so this is reversible.",
					submitLabel: "Run batch",
					minCount: 1,
				},
				async (chosen) => {
					if (!chosen || chosen.length === 0) return;
					if (
						!window.confirm(
							`Run "${action.name}" on ${chosen.length} note(s) in place?\n\nOriginals are saved to Burnish history first.`,
						)
					) {
						return;
					}
					const { done, failed } = await this.processFiles(action, chosen, true);
					new Notice(`Burnish: batch done. ${done} updated${failed ? `, ${failed} failed` : ""}.`);
				},
			).open();
		}).open();
	}

	/** Fire the scheduled batch once per day, after the configured local time. */
	private async maybeRunSchedule() {
		const sch = this.settings.schedule;
		if (!sch.enabled) return;
		const today = isoDate();
		if (sch.lastRunDate === today) return;
		if (nowHHmm() < sch.time) return; // not time yet today

		const action = getAction(this.settings, sch.actionId);
		if (!action) return;
		let re: RegExp;
		try {
			re = globToRegExp(sch.folderGlob);
		} catch {
			return;
		}
		const files = this.app.vault.getMarkdownFiles().filter((f) => re.test(f.path));

		// Mark the run before starting so a crash mid-run doesn't loop all day.
		sch.lastRunDate = today;
		await this.saveSettings();
		if (files.length === 0) return;

		new Notice(`Burnish: scheduled "${action.name}" on ${files.length} note(s)…`);
		const { done, failed } = await this.processFiles(action, files, false);
		new Notice(`Burnish: scheduled run done. ${done} updated${failed ? `, ${failed} failed` : ""}.`);
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
		new FilePickerModal(
			this.app,
			files,
			active ? [active.path] : [],
			{
				title: "Burnish: merge & dedupe meeting notes",
				description: "Pick the notes to merge into one new, deduplicated note.",
				submitLabel: "Merge",
				minCount: 2,
			},
			async (chosen) => {
				if (!chosen || chosen.length < 2) return;
				const sources: MergeSource[] = [];
				for (const f of chosen) {
					sources.push({ label: f.basename, content: await this.app.vault.read(f) });
				}
				this.runMerge(sources, active ?? chosen[0]);
			},
		).open();
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

	private runTable(editor: Editor, view: MarkdownView | MarkdownFileInfo) {
		const sel = editor.getSelection();
		const source = sel.trim() ? sel : editor.getValue();
		if (!source.trim()) {
			new Notice("Burnish: nothing to tabulate.");
			return;
		}
		const provider = makeProvider(this.settings);
		new DiffModal({
			app: this.app,
			title: "Burnish: table from prose",
			original: "",
			run: (signal) =>
				provider.complete({
					system: TABLE_SYSTEM,
					user: buildTableUser(source),
					temperature: this.settings.temperature,
					signal,
				}),
			transform: (raw) => normalizeTable(raw),
			onApply: (result) => insertAtCursor(editor, "\n" + result + "\n"),
		}).open();
		void view;
	}

	private async runMoc() {
		const files = this.app.vault.getMarkdownFiles();
		const active = this.app.workspace.getActiveFile();
		// Preselect siblings in the active file's folder to make folder MOCs one click.
		const folder = active?.parent?.path ?? "";
		const preselect = files.filter((f) => (f.parent?.path ?? "") === folder).map((f) => f.path);
		new FilePickerModal(
			this.app,
			files,
			preselect,
			{
				title: "Burnish: Map of Content",
				description: "Pick the notes to index. A new MOC note will link them, grouped by theme.",
				submitLabel: "Generate MOC",
				minCount: 2,
			},
			(chosen) => {
				if (!chosen || chosen.length < 2) return;
				const entries: MocEntry[] = chosen.map((f) => ({ title: f.basename, path: f.path }));
				const mocTitle = folder ? `${folder.split("/").pop()} MOC` : "Map of Content";
				const provider = makeProvider(this.settings);
				new DiffModal({
					app: this.app,
					title: "Burnish: Map of Content",
					original: "",
					run: (signal) =>
						provider.complete({
							system: MOC_SYSTEM,
							user: buildMocUser(mocTitle, entries),
							temperature: this.settings.temperature,
							maxTokens: 4096,
							signal,
						}),
					onApply: (result) => void this.writeNewNote(active ?? chosen[0], "MOC", result),
				}).open();
			},
		).open();
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

function nowHHmm(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowStamp(): string {
	return `${isoDate()} ${nowHHmm()}`;
}
