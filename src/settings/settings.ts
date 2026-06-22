import { DEFAULT_ACTIONS } from "../core/actions";

export type ProviderId = "anthropic" | "openai" | "hosted";

/** Rewrite aggressiveness, injected into prompts. */
export type Grit = "light" | "medium" | "deep";

/**
 * A stored, named instruction. Built-in presets and user prompts share this shape so the
 * settings editor, command palette, hotkeys and context menu treat them uniformly.
 */
export interface PromptAction {
	id: string;
	name: string;
	/** The instruction sent as the user/system message. May contain {{variables}}. */
	prompt: string;
	/** Optional per-action model override (cheap model for Tidy, stronger for Restructure). */
	model?: string;
	/** Whether output replaces the target range or is inserted at the cursor / appended. */
	output: "replace" | "insert" | "newNote";
	/** Default grit for this action; the picker can still override. */
	grit?: Grit;
	/** Show in the command palette / context menu. */
	enabled: boolean;
	/** True for shipped presets (shown read-only-ish but still editable). */
	builtin?: boolean;
}

/** Map a folder glob to a default action + model. First match wins. */
export interface FolderDefault {
	glob: string;
	actionId?: string;
	model?: string;
}

export interface BurnishSettings {
	provider: ProviderId;

	anthropic: { apiKey: string; model: string };
	openai: { baseUrl: string; apiKey: string; model: string };
	hosted: { baseUrl: string; licenseKey: string; model: string };

	defaultGrit: Grit;
	temperature: number;
	/** Warn / offer chunking above this estimated input token count. */
	costGuardTokens: number;
	streaming: boolean;

	actions: PromptAction[];
	folderDefaults: FolderDefault[];

	/** Keep attribution tags ("(Ian)") on conflicting points when merging. */
	mergeAttribution: boolean;
	/** Where merged / new notes are written. Empty = vault root. */
	newNoteFolder: string;
}

export const DEFAULT_SETTINGS: BurnishSettings = {
	provider: "anthropic",

	anthropic: { apiKey: "", model: "claude-sonnet-4-6" },
	openai: { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" },
	hosted: { baseUrl: "https://api.burnish.app", licenseKey: "", model: "default" },

	defaultGrit: "medium",
	temperature: 0.3,
	costGuardTokens: 12000,
	streaming: true,

	actions: DEFAULT_ACTIONS,
	folderDefaults: [],

	mergeAttribution: true,
	newNoteFolder: "",
};

/**
 * Merge loaded data over defaults. We re-seed any built-in actions the user is missing
 * (e.g. presets added in a later version) without clobbering their edits or custom prompts.
 */
export function normalizeSettings(loaded: Partial<BurnishSettings> | null): BurnishSettings {
	const s: BurnishSettings = {
		...DEFAULT_SETTINGS,
		...(loaded ?? {}),
		anthropic: { ...DEFAULT_SETTINGS.anthropic, ...(loaded?.anthropic ?? {}) },
		openai: { ...DEFAULT_SETTINGS.openai, ...(loaded?.openai ?? {}) },
		hosted: { ...DEFAULT_SETTINGS.hosted, ...(loaded?.hosted ?? {}) },
	};

	const have = new Set((s.actions ?? []).map((a) => a.id));
	if (!s.actions || s.actions.length === 0) {
		s.actions = DEFAULT_ACTIONS;
	} else {
		for (const preset of DEFAULT_ACTIONS) {
			if (!have.has(preset.id)) s.actions.push(preset);
		}
	}
	return s;
}
