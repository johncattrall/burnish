/**
 * Prompt builder for Mermaid diagram generation. Output is inserted at the cursor / appended,
 * never used to overwrite the note (generative, not a cleanup).
 */

export type MermaidKind = "auto" | "flowchart" | "sequence" | "mindmap" | "class" | "gantt";

export interface MermaidOptions {
	kind: MermaidKind;
	/** The prose / selection to turn into a diagram. */
	source: string;
}

export const MERMAID_SYSTEM = `You generate a single Mermaid diagram from the user's text.
- Output ONLY a Markdown fenced code block tagged \`mermaid\`, nothing before or after.
- Use valid Mermaid syntax. Keep node labels short; quote labels that contain spaces or punctuation.
- Do not invent content beyond what the text supports.`;

export function buildMermaidUser(opts: MermaidOptions): string {
	const kind =
		opts.kind === "auto"
			? "Choose the most appropriate diagram type (flowchart, sequence, mindmap, class, gantt)."
			: `Use a Mermaid ${opts.kind} diagram.`;
	return `${kind}\n\nText to diagram:\n\n${opts.source.trim()}`;
}

/**
 * Ensure model output is a single ```mermaid fenced block. If the model returned a bare diagram
 * (no fence), wrap it; if it wrapped in a generic fence, retag it mermaid.
 */
export function normalizeMermaid(output: string): string {
	const trimmed = output.trim();
	const fenceMatch = trimmed.match(/^```[\w]*\n([\s\S]*?)\n```$/);
	const inner = fenceMatch ? fenceMatch[1] : trimmed;
	return "```mermaid\n" + inner.trim() + "\n```";
}
