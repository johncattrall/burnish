/**
 * Mask regions that the model must never touch (code, math, embeds, frontmatter) with opaque
 * placeholders before sending, then restore them in the model's output. This is belt-and-braces
 * with the prompt instructions: even if the model rewrites prose around them, the protected
 * bytes are restored verbatim.
 *
 * Placeholders are chosen to be unlikely to appear in notes and to survive minor model
 * reformatting. Restoration tolerates surrounding whitespace the model may add.
 */

export interface ProtectResult {
	/** Text with protected regions replaced by placeholders. */
	masked: string;
	/** Placeholder -> original text. */
	map: Map<string, string>;
}

// Order matters: frontmatter first (anchored to start), then fenced code, then math, then embeds.
//
// The placeholder is plain uppercase ASCII with a distinct terminator. Models echo opaque
// alphanumeric tokens reliably; earlier we wrapped tokens in an invisible Unicode separator
// (U+2063), which models routinely strip, causing spurious "region dropped" warnings. The
// terminator ("ENDBURNISH") stops token 1 from matching inside token 10 during restore.
const PLACEHOLDER_PREFIX = "BURNISHPROTECT";
const PLACEHOLDER_SUFFIX = "ENDBURNISH";
export const PLACEHOLDER_RE = /BURNISHPROTECT\d+ENDBURNISH/g;

function placeholder(n: number): string {
	return `${PLACEHOLDER_PREFIX}${n}${PLACEHOLDER_SUFFIX}`;
}

interface Rule {
	name: string;
	re: RegExp;
}

const RULES: Rule[] = [
	// YAML frontmatter: --- ... --- at the very start of the document.
	{ name: "frontmatter", re: /^---\n[\s\S]*?\n---\n?/ },
	// Fenced code blocks ``` or ~~~ (with optional language).
	{ name: "fence", re: /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g },
	// Block math $$ ... $$
	{ name: "mathblock", re: /\$\$[\s\S]*?\$\$/g },
	// Embeds ![[...]]
	{ name: "embed", re: /!\[\[[^\]]*\]\]/g },
	// Inline code `...`
	{ name: "inlinecode", re: /`[^`\n]+`/g },
	// Inline math $...$ (avoid matching currency: require non-space adjacent to delimiters).
	{ name: "mathinline", re: /\$(?!\s)(?:\\\$|[^$\n])+?(?<!\s)\$/g },
];

export function protect(text: string): ProtectResult {
	const map = new Map<string, string>();
	let n = 0;
	let masked = text;

	for (const rule of RULES) {
		masked = masked.replace(rule.re, (match: string, ...args: unknown[]) => {
			// For the fenced-code rule the first capture group is the leading newline.
			const lead = rule.name === "fence" ? (args[0] as string) ?? "" : "";
			const body = rule.name === "fence" ? match.slice(lead.length) : match;
			const ph = placeholder(n++);
			map.set(ph, body);
			return lead + ph;
		});
	}

	return { masked, map };
}

/**
 * Restore placeholders. Tolerates the model wrapping a placeholder in extra whitespace or
 * stray code fences. Any placeholder the model dropped is simply absent (the protected region
 * is then lost from the output, which the diff preview will surface to the user).
 */
export function restore(masked: string, map: Map<string, string>): string {
	let out = masked;
	for (const [ph, original] of map) {
		// Escape regex special chars in the placeholder.
		const esc = ph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		out = out.replace(new RegExp(esc, "g"), () => original);
	}
	return out;
}

/** True if any placeholder went missing in the model output (protected content dropped). */
export function droppedPlaceholders(output: string, map: Map<string, string>): string[] {
	const dropped: string[] = [];
	for (const [ph, original] of map) {
		if (!output.includes(ph)) dropped.push(original);
	}
	return dropped;
}
