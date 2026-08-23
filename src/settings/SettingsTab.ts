import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	type SettingDefinition,
	type SettingDefinitionItem,
} from "obsidian";
import type BurnishPlugin from "../main";
import type { Grit, PromptAction, ProviderId } from "./settings";
import { countSnapshots, clearHistory } from "../core/history";
import { confirm } from "../ui/ConfirmModal";
import { signup, fetchStatus } from "../providers/hostedClient";

/**
 * Settings UI. Implemented with Obsidian 1.13's declarative settings API
 * (`getSettingDefinitions`): section groups plus `render` rows that build the actual controls.
 * Structural changes (provider switch, add/delete/edit prompt, folder rules) call `this.update()`
 * to re-run `getSettingDefinitions`.
 */
export class BurnishSettingTab extends PluginSettingTab {
	/** When set, the tab shows the edit sub-view for this action instead of the main list. */
	private editingActionId: string | null = null;

	/** Epoch ms of the last automatic hosted-status refresh, to throttle it. */
	private lastAutoRefreshAt = 0;

	constructor(
		app: App,
		private plugin: BurnishPlugin,
	) {
		super(app, plugin);
	}

	private get s() {
		return this.plugin.settings;
	}

	private async save(refreshCommands = false) {
		await this.plugin.saveSettings();
		if (refreshCommands) this.plugin.refreshCommands();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		if (this.editingActionId) {
			const action = this.s.actions.find((a) => a.id === this.editingActionId);
			if (action) return this.editActionDefs(action);
			this.editingActionId = null;
		}
		// Opening the tab renders through here; refresh hosted credits in the background so the
		// user sees a current count without pressing Refresh. Throttled so the refresh's own
		// re-render (and rapid re-renders) don't loop or hammer the gateway.
		this.maybeAutoRefreshHosted();
		return [
			this.providerGroup(),
			this.defaultsGroup(),
			this.promptLibraryGroup(),
			this.folderDefaultsGroup(),
			this.mergeGroup(),
			this.historyGroup(),
			this.scheduleGroup(),
		];
	}

	// ---- small builders ---------------------------------------------------------------

	/**
	 * A row that builds its controls imperatively via the given callback. The callback's return
	 * value is discarded (control builders return the component/Setting for chaining), so `build`
	 * is typed to return `unknown` and `render` voids the result.
	 */
	private row(name: string, desc: string | undefined, build: (s: Setting) => unknown): SettingDefinition {
		return { name, desc, render: (s: Setting) => void build(s) };
	}

	/** A description-only row (no control), excluded from settings search. */
	private note(desc: string): SettingDefinition {
		return { name: "", desc, searchable: false };
	}

	private group(heading: string, items: SettingDefinition[]): SettingDefinitionItem {
		return { type: "group", heading, items };
	}

	private async hostedSignup(): Promise<void> {
		const h = this.s.hosted;
		if (!h.email.trim()) {
			new Notice("Enter an email first.");
			return;
		}
		try {
			const acct = await signup(h.baseUrl, h.email.trim());
			h.hostedKey = acct.hostedKey;
			h.tier = acct.tier;
			h.creditsRemaining = acct.creditsRemaining;
			h.resetsAt = acct.resetsAt;
			h.upgradeUrl = acct.upgradeUrl ?? "";
			await this.plugin.saveSettings();
			new Notice("Burnish Pro: signed up. Free credits are ready.");
			this.update();
		} catch (e) {
			new Notice(`Burnish: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	private async hostedRefresh(silent = false): Promise<void> {
		const h = this.s.hosted;
		if (!h.hostedKey) return;
		try {
			const st = await fetchStatus(h.baseUrl, h.hostedKey);
			h.tier = st.tier;
			h.creditsRemaining = st.creditsRemaining;
			h.resetsAt = st.resetsAt;
			if (st.upgradeUrl) h.upgradeUrl = st.upgradeUrl;
			await this.plugin.saveSettings();
			this.update();
		} catch (e) {
			// The automatic refresh stays quiet (e.g. offline); manual Refresh still reports.
			if (!silent) new Notice(`Burnish: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/** Refresh hosted credits in the background when the tab is shown, at most once per window. */
	private maybeAutoRefreshHosted(): void {
		if (this.s.provider !== "hosted" || !this.s.hosted.hostedKey) return;
		const now = Date.now();
		if (now - this.lastAutoRefreshAt < 8000) return;
		this.lastAutoRefreshAt = now;
		void this.hostedRefresh(true);
	}

	private async hostedSignOut(): Promise<void> {
		const h = this.s.hosted;
		h.hostedKey = "";
		h.tier = "";
		h.creditsRemaining = null;
		h.resetsAt = "";
		h.upgradeUrl = "";
		await this.plugin.saveSettings();
		this.update();
	}

	private openUpgrade(): void {
		const url = this.s.hosted.upgradeUrl;
		if (url) window.open(url, "_blank");
		else new Notice("Upgrade link unavailable - try Refresh.");
	}

	private async clearAllHistory(): Promise<void> {
		const ok = await confirm(this.app, {
			title: "Clear history",
			body: "Delete all saved Burnish versions for every note?",
			cta: "Delete all",
			destructive: true,
		});
		if (!ok) return;
		clearHistory(this.s.historyStore);
		await this.plugin.saveSettings();
		this.update();
	}

	// ---- provider ---------------------------------------------------------------------

	private providerGroup(): SettingDefinitionItem {
		const items: SettingDefinition[] = [];

		items.push(
			this.note(
				"Two ways to use Burnish. Burnish Pro: no API key needed - sign up with your email for free credits, and upgrade for all features. Bring your own key: use your own Anthropic, OpenAI-compatible, or local model - unlimited and free.",
			),
		);

		items.push(
			this.row(
				"Active provider",
				"Burnish Pro (hosted, no key), or bring your own key for any Anthropic / OpenAI-compatible / local model.",
				(s) =>
					s.addDropdown((d) =>
						d
							.addOptions({
								hosted: "Burnish Pro",
								anthropic: "Bring your own key: Anthropic",
								openai: "Bring your own key: OpenAI-compatible / local",
							})
							.setValue(this.s.provider)
							.onChange((v) => {
								this.s.provider = v as ProviderId;
								void this.save();
								this.update();
							}),
					),
			),
		);

		items.push(
			this.note("Obsidian stores plugin settings unencrypted in your vault. Treat API keys accordingly."),
		);

		if (this.s.provider === "anthropic") {
			items.push(
				this.row("Anthropic API key", undefined, (s) =>
					s.addText((t) =>
						t
							.setPlaceholder("sk-ant-…")
							.setValue(this.s.anthropic.apiKey)
							.onChange((v) => {
								this.s.anthropic.apiKey = v.trim();
								void this.save();
							}),
					),
				),
			);
			items.push(
				this.row("Model", undefined, (s) =>
					s.addText((t) =>
						t.setValue(this.s.anthropic.model).onChange((v) => {
							this.s.anthropic.model = v.trim();
							void this.save();
						}),
					),
				),
			);
		} else if (this.s.provider === "openai") {
			items.push(
				this.row("Base URL", "OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM…", (s) =>
					s.addText((t) =>
						t.setValue(this.s.openai.baseUrl).onChange((v) => {
							this.s.openai.baseUrl = v.trim();
							void this.save();
						}),
					),
				),
			);
			items.push(
				this.row("API key", "Leave blank for local servers that need none.", (s) =>
					s.addText((t) =>
						t.setValue(this.s.openai.apiKey).onChange((v) => {
							this.s.openai.apiKey = v.trim();
							void this.save();
						}),
					),
				),
			);
			items.push(
				this.row("Model", undefined, (s) =>
					s.addText((t) =>
						t.setValue(this.s.openai.model).onChange((v) => {
							this.s.openai.model = v.trim();
							void this.save();
						}),
					),
				),
			);
		} else {
			const h = this.s.hosted;
			// What each tier includes. Shown whether or not the user is signed in.
			items.push(
				this.note(
					"Free: Tidy and Format cleanup, 20 actions/month. Plus 3 one-time previews of Pro features so you can try them. " +
						"Pro ($5/mo or $25/yr): every action - Restructure, Distill, Merge, diagrams, tables, MOC, custom prompts - on stronger models, 500 actions/month.",
				),
			);
			if (!h.hostedKey) {
				// Not signed in: email + Start free.
				items.push(
					this.note(
						"Burnish Pro: no API key needed. Sign up with your email to start on the free tier, then upgrade any time. Your notes are processed transiently and not stored.",
					),
				);
				items.push(
					this.row("Email", undefined, (s) =>
						s.addText((t) =>
							t
								.setPlaceholder("you@example.com")
								.setValue(h.email)
								.onChange((v) => {
									h.email = v.trim();
									void this.save();
								}),
						),
					),
				);
				items.push(
					this.row("Start free", undefined, (s) =>
						s.addButton((b) =>
							b
								.setButtonText("Start free")
								.setCta()
								.onClick(() => void this.hostedSignup()),
						),
					),
				);
			} else {
				// Signed in: show tier + credits, refresh, upgrade, sign out.
				const credits =
					h.tier === "pro"
						? "Pro"
						: h.creditsRemaining === null
							? "Free"
							: `Free · ${h.creditsRemaining} actions left this month`;
				items.push(
					this.row(
						h.email,
						h.resetsAt ? `${credits} · resets ${h.resetsAt.slice(0, 10)}` : credits,
						(s) => {
							s.addButton((b) => b.setButtonText("Refresh").onClick(() => void this.hostedRefresh()));
							if (h.tier !== "pro") {
								s.addButton((b) =>
									b
										.setButtonText("Upgrade to Pro")
										.setCta()
										.onClick(() => this.openUpgrade()),
								);
							}
							s.addExtraButton((b) =>
								b
									.setIcon("log-out")
									.setTooltip("Sign out")
									.onClick(() => void this.hostedSignOut()),
							);
						},
					),
				);
			}
		}

		return this.group("Provider", items);
	}

	// ---- defaults ---------------------------------------------------------------------

	private defaultsGroup(): SettingDefinitionItem {
		return this.group("Defaults", [
			this.row("Grit level", "How aggressively actions rewrite. Light buff to deep polish.", (s) =>
				s.addDropdown((d) =>
					d
						.addOptions({ light: "Light", medium: "Medium", deep: "Deep" })
						.setValue(this.s.defaultGrit)
						.onChange((v) => {
							this.s.defaultGrit = v as Grit;
							void this.save();
						}),
				),
			),
			this.row("Temperature", undefined, (s) =>
				s.addSlider((sl) =>
					sl
						.setLimits(0, 1, 0.1)
						.setValue(this.s.temperature)
						.onChange((v) => {
							this.s.temperature = v;
							void this.save();
						}),
				),
			),
			this.row("Cost guard (input tokens)", "Warn before sending notes larger than this estimate.", (s) =>
				s.addText((t) =>
					t.setValue(String(this.s.costGuardTokens)).onChange((v) => {
						const n = parseInt(v, 10);
						if (!Number.isNaN(n) && n > 0) {
							this.s.costGuardTokens = n;
							void this.save();
						}
					}),
				),
			),
			this.row("New-note folder", "Where merged / generated notes are created. Blank = vault root.", (s) =>
				s.addText((t) =>
					t
						.setPlaceholder("e.g. Merged")
						.setValue(this.s.newNoteFolder)
						.onChange((v) => {
							this.s.newNoteFolder = v.trim();
							void this.save();
						}),
				),
			),
		]);
	}

	// ---- prompt library ---------------------------------------------------------------

	private promptLibraryGroup(): SettingDefinitionItem {
		const items: SettingDefinition[] = [
			this.note("Presets and your own prompts share the same mechanism. Each becomes a command."),
		];

		for (const action of this.s.actions) {
			items.push(
				this.row(action.name, action.builtin ? "Built-in preset" : "Custom prompt", (s) => {
					s.addToggle((t) =>
						t
							.setValue(action.enabled)
							.setTooltip("Enabled")
							.onChange((v) => {
								action.enabled = v;
								void this.save(true);
							}),
					);
					s.addExtraButton((b) =>
						b
							.setIcon("pencil")
							.setTooltip("Edit")
							.onClick(() => {
								this.editingActionId = action.id;
								this.update();
							}),
					);
					if (!action.builtin) {
						s.addExtraButton((b) =>
							b
								.setIcon("trash")
								.setTooltip("Delete")
								.onClick(() => {
									this.s.actions = this.s.actions.filter((a) => a.id !== action.id);
									void this.save(true);
									this.update();
								}),
						);
					}
				}),
			);
		}

		items.push(
			this.row("Add a prompt", undefined, (s) =>
				s.addButton((b) =>
					b
						.setButtonText("Add prompt")
						.setCta()
						.onClick(() => {
							const id = `custom-${Date.now().toString(36)}`;
							const action: PromptAction = {
								id,
								name: "New prompt",
								prompt: "Instruction…",
								output: "replace",
								enabled: true,
							};
							this.s.actions.push(action);
							void this.save(true);
							this.editingActionId = id;
							this.update();
						}),
				),
			),
		);

		return this.group("Prompt library", items);
	}

	/** The edit sub-view for one action, returned in place of the main list. */
	private editActionDefs(action: PromptAction): SettingDefinitionItem[] {
		return [
			this.group(`Edit: ${action.name}`, [
				this.row("Name", undefined, (s) =>
					s.addText((t) =>
						t.setValue(action.name).onChange((v) => {
							action.name = v;
							void this.save(true);
						}),
					),
				),
				this.row(
					"Prompt",
					"Variables: {{title}} {{date}} {{selection}} {{path}} {{frontmatter.key}} {{grit}}",
					(s) =>
						s.addTextArea((t) => {
							t.setValue(action.prompt).onChange((v) => {
								action.prompt = v;
								void this.save();
							});
							t.inputEl.rows = 8;
							t.inputEl.addClass("burnish-prompt-edit");
						}),
				),
				this.row("Output", undefined, (s) =>
					s.addDropdown((d) =>
						d
							.addOptions({ replace: "Replace target", insert: "Insert at cursor", newNote: "New note" })
							.setValue(action.output)
							.onChange((v) => {
								action.output = v as PromptAction["output"];
								void this.save();
							}),
					),
				),
				this.row("Model override", "Blank = provider default.", (s) =>
					s.addText((t) =>
						t
							.setPlaceholder("e.g. claude-haiku-4-5")
							.setValue(action.model ?? "")
							.onChange((v) => {
								action.model = v.trim() || undefined;
								void this.save();
							}),
					),
				),
				this.row("Default grit", undefined, (s) =>
					s.addDropdown((d) =>
						d
							.addOptions({ "": "Use global", light: "Light", medium: "Medium", deep: "Deep" })
							.setValue(action.grit ?? "")
							.onChange((v) => {
								action.grit = (v || undefined) as Grit | undefined;
								void this.save();
							}),
					),
				),
				this.row("Done", undefined, (s) =>
					s.addButton((b) =>
						b
							.setButtonText("Done")
							.setCta()
							.onClick(() => {
								this.editingActionId = null;
								this.update();
							}),
					),
				),
			]),
		];
	}

	// ---- folder defaults --------------------------------------------------------------

	private folderDefaultsGroup(): SettingDefinitionItem {
		const items: SettingDefinition[] = [
			this.note("Match file paths by glob (e.g. Meetings/, Journal/*). First match wins."),
		];

		this.s.folderDefaults.forEach((fd, i) => {
			items.push(
				this.row(fd.glob || `Rule ${i + 1}`, undefined, (s) => {
					s.addText((t) =>
						t
							.setPlaceholder("glob, e.g. Meetings/")
							.setValue(fd.glob)
							.onChange((v) => {
								fd.glob = v.trim();
								void this.save();
							}),
					);
					s.addDropdown((d) => {
						d.addOption("", "(no default action)");
						for (const a of this.s.actions) d.addOption(a.id, a.name);
						d.setValue(fd.actionId ?? "").onChange((v) => {
							fd.actionId = v || undefined;
							void this.save();
						});
					});
					s.addText((t) =>
						t
							.setPlaceholder("model override")
							.setValue(fd.model ?? "")
							.onChange((v) => {
								fd.model = v.trim() || undefined;
								void this.save();
							}),
					);
					s.addExtraButton((b) =>
						b
							.setIcon("trash")
							.setTooltip("Delete rule")
							.onClick(() => {
								this.s.folderDefaults.splice(i, 1);
								void this.save();
								this.update();
							}),
					);
				}),
			);
		});

		items.push(
			this.row("Add rule", undefined, (s) =>
				s.addButton((b) =>
					b.setButtonText("Add folder default").onClick(() => {
						this.s.folderDefaults.push({ glob: "" });
						void this.save();
						this.update();
					}),
				),
			),
		);

		return this.group("Per-folder defaults", items);
	}

	// ---- merge ------------------------------------------------------------------------

	private mergeGroup(): SettingDefinitionItem {
		return this.group("Merge meeting notes", [
			this.row("Keep attribution", "Tag differing/conflicting points with who said them, e.g. (Ian).", (s) =>
				s.addToggle((t) =>
					t.setValue(this.s.mergeAttribution).onChange((v) => {
						this.s.mergeAttribution = v;
						void this.save();
					}),
				),
			),
		]);
	}

	// ---- history ----------------------------------------------------------------------

	private historyGroup(): SettingDefinitionItem {
		const total = countSnapshots(this.s.historyStore);
		return this.group("History & rollback", [
			this.row(
				"Save versions",
				"Snapshot a note before Burnish rewrites it, so edits can be rolled back.",
				(s) =>
					s.addToggle((t) =>
						t.setValue(this.s.history.enabled).onChange((v) => {
							this.s.history.enabled = v;
							void this.save();
						}),
					),
			),
			this.row("Versions kept per note", undefined, (s) =>
				s.addText((t) =>
					t.setValue(String(this.s.history.maxPerNote)).onChange((v) => {
						const n = parseInt(v, 10);
						if (!Number.isNaN(n) && n > 0) {
							this.s.history.maxPerNote = n;
							void this.save();
						}
					}),
				),
			),
			this.row("Stored snapshots", `${total} across all notes.`, (s) =>
				s.addButton((b) =>
					b
						.setButtonText("Clear all history")
						.setDestructive()
						.onClick(() => void this.clearAllHistory()),
				),
			),
		]);
	}

	// ---- schedule ---------------------------------------------------------------------

	private scheduleGroup(): SettingDefinitionItem {
		return this.group("Scheduled cleanup", [
			this.row(
				"Enable",
				"Run an action across a folder once a day (in place, snapshotted to history).",
				(s) =>
					s.addToggle((t) =>
						t.setValue(this.s.schedule.enabled).onChange((v) => {
							this.s.schedule.enabled = v;
							void this.save();
						}),
					),
			),
			this.row("Folder glob", "e.g. Daily/ or Journal/*", (s) =>
				s.addText((t) =>
					t.setValue(this.s.schedule.folderGlob).onChange((v) => {
						this.s.schedule.folderGlob = v.trim();
						void this.save();
					}),
				),
			),
			this.row("Action", undefined, (s) =>
				s.addDropdown((d) => {
					for (const a of this.s.actions) d.addOption(a.id, a.name);
					d.setValue(this.s.schedule.actionId).onChange((v) => {
						this.s.schedule.actionId = v;
						void this.save();
					});
				}),
			),
			this.row(
				"Run after (24h local time)",
				"Fires once per day, the first time Obsidian is open after this time.",
				(s) =>
					s.addText((t) =>
						t
							.setPlaceholder("03:00")
							.setValue(this.s.schedule.time)
							.onChange((v) => {
								if (/^\d{1,2}:\d{2}$/.test(v.trim())) {
									this.s.schedule.time = v.trim();
									void this.save();
								}
							}),
					),
			),
		]);
	}
}
