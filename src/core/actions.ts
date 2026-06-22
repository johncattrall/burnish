import type { PromptAction } from "../settings/settings";

/**
 * Built-in cleanup presets. Each is a {@link PromptAction} so it shares the prompt-library
 * machinery. Prompts are written to be Obsidian-native: preserve wikilinks, tags, frontmatter,
 * code and math. Protected regions are additionally masked before sending (see util/protect.ts),
 * but we still instruct the model as a second line of defence.
 */

const OBSIDIAN_RULES = `You are editing a Markdown note inside Obsidian. Rules:
- Preserve [[wikilinks]], #tags, ^block-refs and ![[embeds]] exactly.
- Never alter fenced code blocks, inline code, or math ($...$, $$...$$).
- Do not touch YAML frontmatter.
- Return ONLY the edited Markdown, with no commentary, preamble, or code fences around the whole note.`;

function preset(
	id: string,
	name: string,
	prompt: string,
	output: PromptAction["output"] = "replace",
): PromptAction {
	return { id, name, prompt: `${OBSIDIAN_RULES}\n\n${prompt}`, output, enabled: true, builtin: true };
}

export const DEFAULT_ACTIONS: PromptAction[] = [
	preset(
		"tidy",
		"Tidy",
		"Fix grammar, spelling, punctuation and capitalization. Preserve the author's voice, meaning and structure. Make no stylistic rewrites beyond correctness.",
	),
	preset(
		"restructure",
		"Restructure",
		"Improve structure: add or normalize headings, break walls of text into sections and paragraphs, and fix list nesting and ordering. Keep all information; do not summarize away content.",
	),
	preset(
		"summarize-top",
		"Summarize at top",
		"Write a concise TL;DR of the note and insert it at the very top as a `> [!summary]` callout. Leave the rest of the note completely unchanged below the callout.",
	),
	preset(
		"distill",
		"Distill",
		"Aggressively condense this rambling note down to its essential points as a tight bullet list. Drop filler and repetition but keep every distinct fact, decision and action.",
	),
	preset(
		"expand",
		"Expand",
		"Flesh out these terse notes / bullet points into clear, well-organized prose. Do not invent facts; only expand on what is present.",
	),
	preset(
		"action-items",
		"Action items",
		"Extract every task or todo into a Markdown checklist using `- [ ]`. Include assignees and due dates in the item text where present. Output only the checklist.",
	),
	preset(
		"format-normalize",
		"Format normalize",
		"Normalize Markdown formatting only: consistent heading levels, list markers and indentation, fenced code, table alignment, and straight vs. smart quotes. Do not change wording.",
	),
];
