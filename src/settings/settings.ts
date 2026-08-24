import { DEFAULT_ACTIONS } from "../core/actions";
import type { HistoryStore } from "../core/history";

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
	/**
	 * Burnish Pro (hosted). `hostedKey` is issued by the gateway at email signup and sent as a
	 * Bearer token; the gateway picks the model and enforces tier limits. tier/creditsRemaining/
	 * resetsAt are cached from the gateway for display only.
	 */
	hosted: {
		baseUrl: string;
		hostedKey: string;
		email: string;
		tier: "free" | "pro" | "";
		creditsRemaining: number | null;
		resetsAt: string;
		upgradeUrl: string;
	};

	defaultGrit: Grit;
	temperature: number;
	/** When false, no temperature is sent and each model uses its own default (needed by Opus 5 etc.). */
	sendTemperature: boolean;
	/**
	 * Reasoning depth for models that reason (Claude 5 family via output_config.effort; OpenAI
	 * reasoning models via reasoning_effort). "low" keeps cleanup faithful - deep reasoning makes
	 * the newest models elaborate/hallucinate on rewrite tasks. Dropped for models that don't reason.
	 */
	reasoningEffort: "low" | "medium" | "high";
	/** Warn / offer chunking above this estimated input token count. */
	costGuardTokens: number;

	actions: PromptAction[];
	folderDefaults: FolderDefault[];

	/** Keep attribution tags ("(Ian)") on conflicting points when merging. */
	mergeAttribution: boolean;
	/** Where merged / new notes are written. Empty = vault root. */
	newNoteFolder: string;

	/** Last plugin version whose "what's new" notice was shown, to show it once per upgrade. */
	lastWhatsNewVersion: string;

	/** Snapshot the pre-edit version of notes so edits can be rolled back. */
	history: { enabled: boolean; maxPerNote: number };
	/** Stored snapshots, keyed by note path. Not shown in the UI directly. */
	historyStore: HistoryStore;

	/** Nightly (or on-load) batch tidy of a folder. Edits are snapshotted to history. */
	schedule: {
		enabled: boolean;
		folderGlob: string;
		actionId: string;
		/** "HH:mm" 24h local time after which today's run may fire. */
		time: string;
		/** ISO date of the last completed run, to avoid re-running the same day. */
		lastRunDate: string;
	};
}

export const DEFAULT_SETTINGS: BurnishSettings = {
	provider: "hosted",

	anthropic: { apiKey: "", model: "claude-sonnet-4-6" },
	openai: { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" },
	hosted: {
		baseUrl: "https://burnish-gateway.johncattrall.workers.dev",
		hostedKey: "",
		email: "",
		tier: "",
		creditsRemaining: null,
		resetsAt: "",
		upgradeUrl: "",
	},

	defaultGrit: "medium",
	temperature: 0.3,
	sendTemperature: true,
	reasoningEffort: "low",
	costGuardTokens: 12000,

	actions: DEFAULT_ACTIONS,
	folderDefaults: [],

	mergeAttribution: true,
	newNoteFolder: "",

	lastWhatsNewVersion: "",

	history: { enabled: true, maxPerNote: 3 },
	historyStore: {},

	schedule: {
		enabled: false,
		folderGlob: "Daily/",
		actionId: "tidy",
		time: "03:00",
		lastRunDate: "",
	},
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
		history: { ...DEFAULT_SETTINGS.history, ...(loaded?.history ?? {}) },
		historyStore: loaded?.historyStore ?? {},
		schedule: { ...DEFAULT_SETTINGS.schedule, ...(loaded?.schedule ?? {}) },
	};

	// The gateway URL is not user-configurable; always use the current canonical value. This also
	// migrates users off any stale baseUrl saved by older versions.
	s.hosted.baseUrl = DEFAULT_SETTINGS.hosted.baseUrl;

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
