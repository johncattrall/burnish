import type { Grit } from "../settings/settings";

export interface VariableContext {
	title: string;
	path: string;
	selection: string;
	/** Parsed YAML frontmatter, if any. */
	frontmatter: Record<string, unknown>;
	/** ISO date (YYYY-MM-DD). Injected by the caller so the module stays pure/testable. */
	date: string;
	grit?: Grit;
}

const GRIT_GUIDANCE: Record<Grit, string> = {
	light: "Make the lightest possible touch: only clearly necessary changes.",
	medium: "Make moderate improvements while staying faithful to the original.",
	deep: "Rewrite thoroughly for clarity and structure, while preserving all meaning.",
};

/** Resolve a dotted path like "frontmatter.aliases.0" against the context. */
function resolve(key: string, ctx: VariableContext): string | undefined {
	const parts = key.trim().split(".");
	let cur: unknown;
	switch (parts[0]) {
		case "title":
			return ctx.title;
		case "path":
			return ctx.path;
		case "selection":
			return ctx.selection;
		case "date":
			return ctx.date;
		case "frontmatter":
			cur = ctx.frontmatter;
			for (const p of parts.slice(1)) {
				if (cur == null || typeof cur !== "object") return undefined;
				cur = (cur as Record<string, unknown>)[p];
			}
			break;
		default:
			return undefined;
	}
	if (cur == null) return undefined;
	if (typeof cur === "object") return JSON.stringify(cur);
	return String(cur);
}

/**
 * Substitute {{variables}} in a prompt. Unknown variables are left intact so the user can
 * see what failed to resolve rather than silently dropping it. Supports {{grit}} which expands
 * to guidance text for the active grit level.
 */
export function substitute(template: string, ctx: VariableContext): string {
	return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) => {
		if (key === "grit") return ctx.grit ? GRIT_GUIDANCE[ctx.grit] : "";
		const v = resolve(key, ctx);
		return v === undefined ? whole : v;
	});
}

export function gritGuidance(grit: Grit): string {
	return GRIT_GUIDANCE[grit];
}

/** List the variable names referenced by a template (for the settings hints). */
export function referencedVariables(template: string): string[] {
	const out = new Set<string>();
	for (const m of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) out.add(m[1]);
	return [...out];
}
