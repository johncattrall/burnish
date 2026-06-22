import type { Grit, PromptAction } from "../settings/settings";
import type { CompletionRequest } from "../providers/Provider";
import { substitute, type VariableContext } from "./variables";
import { protect } from "../util/protect";

/**
 * Build the model input for an action. Pure: callers pass already-extracted note text,
 * selection and frontmatter (gathered from the editor in main.ts), so this is unit-testable.
 *
 * The action prompt becomes the system message (with {{variables}} and {{grit}} resolved). The
 * target text becomes the user message, with protected regions masked unless disabled.
 */

export interface BuildOptions {
	action: PromptAction;
	/** The text the action operates on: a selection, or the whole note (frontmatter handled below). */
	targetText: string;
	vars: VariableContext;
	grit: Grit;
	/** Mask code/math/embeds/frontmatter before sending. */
	protectRegions?: boolean;
	model?: string;
	temperature?: number;
	signal?: AbortSignal;
}

export interface BuiltRequest {
	request: CompletionRequest;
	/** Original target text, for diffing against the (restored) model output. */
	original: string;
	/** Placeholder map to restore protected regions in the output. */
	protectMap: Map<string, string>;
}

export function buildRequest(opts: BuildOptions): BuiltRequest {
	const vars: VariableContext = { ...opts.vars, grit: opts.grit };
	const system = substitute(opts.action.prompt, vars);

	let userText = opts.targetText;
	let protectMap = new Map<string, string>();
	if (opts.protectRegions !== false) {
		const p = protect(opts.targetText);
		userText = p.masked;
		protectMap = p.map;
	}

	return {
		request: {
			system,
			user: userText,
			model: opts.model,
			temperature: opts.temperature,
			signal: opts.signal,
		},
		original: opts.targetText,
		protectMap,
	};
}

/**
 * Split a note into its YAML frontmatter block and the body. Whole-note actions operate on the
 * body so frontmatter is never edited (it is also masked by protect() as a second guard).
 */
export function splitFrontmatter(note: string): { frontmatter: string; body: string } {
	const m = note.match(/^(---\n[\s\S]*?\n---\n?)/);
	if (m) return { frontmatter: m[1], body: note.slice(m[1].length) };
	return { frontmatter: "", body: note };
}
