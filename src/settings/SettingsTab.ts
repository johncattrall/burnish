import { App, PluginSettingTab, Setting } from "obsidian";
import type BurnishPlugin from "../main";
import type { Grit, PromptAction, ProviderId } from "./settings";

/** Settings UI: provider + keys, defaults, prompt library, folder defaults, merge, hosted tier. */
export class BurnishSettingTab extends PluginSettingTab {
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

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.providerSection(containerEl);
		this.defaultsSection(containerEl);
		this.promptLibrarySection(containerEl);
		this.folderDefaultsSection(containerEl);
		this.mergeSection(containerEl);
	}

	// ---- provider ---------------------------------------------------------------------

	private providerSection(c: HTMLElement) {
		new Setting(c).setName("Provider").setHeading();

		new Setting(c)
			.setName("Active provider")
			.setDesc("Anthropic, any OpenAI-compatible endpoint, or Burnish Plus (hosted).")
			.addDropdown((d) =>
				d
					.addOptions({ anthropic: "Anthropic", openai: "OpenAI-compatible", hosted: "Burnish Plus (hosted)" })
					.setValue(this.s.provider)
					.onChange(async (v) => {
						this.s.provider = v as ProviderId;
						await this.save();
						this.display();
					}),
			);

		new Setting(c).setDesc(
			"⚠️ Obsidian stores plugin settings unencrypted in your vault. Treat API keys accordingly.",
		);

		if (this.s.provider === "anthropic") {
			new Setting(c).setName("Anthropic API key").addText((t) =>
				t
					.setPlaceholder("sk-ant-…")
					.setValue(this.s.anthropic.apiKey)
					.onChange(async (v) => {
						this.s.anthropic.apiKey = v.trim();
						await this.save();
					}),
			);
			new Setting(c).setName("Model").addText((t) =>
				t
					.setValue(this.s.anthropic.model)
					.onChange(async (v) => {
						this.s.anthropic.model = v.trim();
						await this.save();
					}),
			);
		} else if (this.s.provider === "openai") {
			new Setting(c)
				.setName("Base URL")
				.setDesc("OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM…")
				.addText((t) =>
					t
						.setValue(this.s.openai.baseUrl)
						.onChange(async (v) => {
							this.s.openai.baseUrl = v.trim();
							await this.save();
						}),
				);
			new Setting(c).setName("API key").setDesc("Leave blank for local servers that need none.").addText((t) =>
				t
					.setValue(this.s.openai.apiKey)
					.onChange(async (v) => {
						this.s.openai.apiKey = v.trim();
						await this.save();
					}),
			);
			new Setting(c).setName("Model").addText((t) =>
				t
					.setValue(this.s.openai.model)
					.onChange(async (v) => {
						this.s.openai.model = v.trim();
						await this.save();
					}),
			);
		} else {
			new Setting(c)
				.setName("Burnish Plus license key")
				.setDesc("Paste your license key; no LLM API key needed. We proxy to a managed model.")
				.addText((t) =>
					t
						.setPlaceholder("BURNISH-…")
						.setValue(this.s.hosted.licenseKey)
						.onChange(async (v) => {
							this.s.hosted.licenseKey = v.trim();
							await this.save();
						}),
				);
			new Setting(c).setName("Endpoint").addText((t) =>
				t
					.setValue(this.s.hosted.baseUrl)
					.onChange(async (v) => {
						this.s.hosted.baseUrl = v.trim();
						await this.save();
					}),
			);
		}
	}

	// ---- defaults ---------------------------------------------------------------------

	private defaultsSection(c: HTMLElement) {
		new Setting(c).setName("Defaults").setHeading();

		new Setting(c)
			.setName("Grit level")
			.setDesc("How aggressively actions rewrite. Light buff → deep polish.")
			.addDropdown((d) =>
				d
					.addOptions({ light: "Light", medium: "Medium", deep: "Deep" })
					.setValue(this.s.defaultGrit)
					.onChange(async (v) => {
						this.s.defaultGrit = v as Grit;
						await this.save();
					}),
			);

		new Setting(c).setName("Temperature").addSlider((sl) =>
			sl
				.setLimits(0, 1, 0.1)
				.setValue(this.s.temperature)
				.setDynamicTooltip()
				.onChange(async (v) => {
					this.s.temperature = v;
					await this.save();
				}),
		);

		new Setting(c)
			.setName("Cost guard (input tokens)")
			.setDesc("Warn before sending notes larger than this estimate.")
			.addText((t) =>
				t
					.setValue(String(this.s.costGuardTokens))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!Number.isNaN(n) && n > 0) {
							this.s.costGuardTokens = n;
							await this.save();
						}
					}),
			);

		new Setting(c)
			.setName("Stream responses")
			.setDesc("Stream output as it arrives. Falls back to a single response if streaming fails.")
			.addToggle((t) =>
				t.setValue(this.s.streaming).onChange(async (v) => {
					this.s.streaming = v;
					await this.save();
				}),
			);

		new Setting(c)
			.setName("New-note folder")
			.setDesc("Where merged / generated notes are created. Blank = vault root.")
			.addText((t) =>
				t
					.setPlaceholder("e.g. Merged")
					.setValue(this.s.newNoteFolder)
					.onChange(async (v) => {
						this.s.newNoteFolder = v.trim();
						await this.save();
					}),
			);
	}

	// ---- prompt library ---------------------------------------------------------------

	private promptLibrarySection(c: HTMLElement) {
		new Setting(c)
			.setName("Prompt library")
			.setHeading()
			.setDesc("Presets and your own prompts share the same mechanism. Each becomes a command.");

		for (const action of this.s.actions) {
			const row = new Setting(c)
				.setName(action.name)
				.setDesc(action.builtin ? "Built-in preset" : "Custom prompt");

			row.addToggle((t) =>
				t
					.setValue(action.enabled)
					.setTooltip("Enabled")
					.onChange(async (v) => {
						action.enabled = v;
						await this.save(true);
					}),
			);
			row.addExtraButton((b) =>
				b
					.setIcon("pencil")
					.setTooltip("Edit")
					.onClick(() => this.editAction(action)),
			);
			if (!action.builtin) {
				row.addExtraButton((b) =>
					b
						.setIcon("trash")
						.setTooltip("Delete")
						.onClick(async () => {
							this.s.actions = this.s.actions.filter((a) => a.id !== action.id);
							await this.save(true);
							this.display();
						}),
				);
			}
		}

		new Setting(c).addButton((b) =>
			b
				.setButtonText("Add prompt")
				.setCta()
				.onClick(async () => {
					const id = `custom-${Date.now().toString(36)}`;
					const action: PromptAction = {
						id,
						name: "New prompt",
						prompt: "Instruction…",
						output: "replace",
						enabled: true,
					};
					this.s.actions.push(action);
					await this.save(true);
					this.editAction(action);
				}),
		);
	}

	/** Inline expand of an action's editable fields. */
	private editAction(action: PromptAction) {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName(`Edit: ${action.name}`).setHeading();

		new Setting(containerEl).setName("Name").addText((t) =>
			t.setValue(action.name).onChange(async (v) => {
				action.name = v;
				await this.save(true);
			}),
		);

		new Setting(containerEl)
			.setName("Prompt")
			.setDesc("Variables: {{title}} {{date}} {{selection}} {{path}} {{frontmatter.key}} {{grit}}")
			.addTextArea((t) => {
				t.setValue(action.prompt).onChange(async (v) => {
					action.prompt = v;
					await this.save();
				});
				t.inputEl.rows = 8;
				t.inputEl.style.width = "100%";
			});

		new Setting(containerEl).setName("Output").addDropdown((d) =>
			d
				.addOptions({ replace: "Replace target", insert: "Insert at cursor", newNote: "New note" })
				.setValue(action.output)
				.onChange(async (v) => {
					action.output = v as PromptAction["output"];
					await this.save();
				}),
		);

		new Setting(containerEl).setName("Model override").setDesc("Blank = provider default.").addText((t) =>
			t
				.setPlaceholder("e.g. claude-haiku-4-5")
				.setValue(action.model ?? "")
				.onChange(async (v) => {
					action.model = v.trim() || undefined;
					await this.save();
				}),
		);

		new Setting(containerEl).setName("Default grit").addDropdown((d) =>
			d
				.addOptions({ "": "Use global", light: "Light", medium: "Medium", deep: "Deep" })
				.setValue(action.grit ?? "")
				.onChange(async (v) => {
					action.grit = (v || undefined) as Grit | undefined;
					await this.save();
				}),
		);

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Done")
				.setCta()
				.onClick(() => this.display()),
		);
	}

	// ---- folder defaults --------------------------------------------------------------

	private folderDefaultsSection(c: HTMLElement) {
		new Setting(c)
			.setName("Per-folder defaults")
			.setHeading()
			.setDesc("Match file paths by glob (e.g. Meetings/, Journal/*). First match wins.");

		this.s.folderDefaults.forEach((fd, i) => {
			const row = new Setting(c);
			row.addText((t) =>
				t
					.setPlaceholder("glob, e.g. Meetings/")
					.setValue(fd.glob)
					.onChange(async (v) => {
						fd.glob = v.trim();
						await this.save();
					}),
			);
			row.addDropdown((d) => {
				d.addOption("", "(no default action)");
				for (const a of this.s.actions) d.addOption(a.id, a.name);
				d.setValue(fd.actionId ?? "").onChange(async (v) => {
					fd.actionId = v || undefined;
					await this.save();
				});
			});
			row.addText((t) =>
				t
					.setPlaceholder("model override")
					.setValue(fd.model ?? "")
					.onChange(async (v) => {
						fd.model = v.trim() || undefined;
						await this.save();
					}),
			);
			row.addExtraButton((b) =>
				b
					.setIcon("trash")
					.onClick(async () => {
						this.s.folderDefaults.splice(i, 1);
						await this.save();
						this.display();
					}),
			);
		});

		new Setting(c).addButton((b) =>
			b.setButtonText("Add folder default").onClick(async () => {
				this.s.folderDefaults.push({ glob: "" });
				await this.save();
				this.display();
			}),
		);
	}

	// ---- merge ------------------------------------------------------------------------

	private mergeSection(c: HTMLElement) {
		new Setting(c).setName("Merge meeting notes").setHeading();
		new Setting(c)
			.setName("Keep attribution")
			.setDesc("Tag differing/conflicting points with who said them, e.g. (Ian).")
			.addToggle((t) =>
				t.setValue(this.s.mergeAttribution).onChange(async (v) => {
					this.s.mergeAttribution = v;
					await this.save();
				}),
			);
	}
}
