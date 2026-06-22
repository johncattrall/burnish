/**
 * Prompt builder for "Generate table from prose". Generative output: previewed then inserted at
 * the cursor, never used to overwrite the source.
 */

export const TABLE_SYSTEM = `You convert prose into a single Markdown table.
- Output ONLY a valid GitHub-flavored Markdown table (header row, separator row, data rows), with nothing before or after.
- Infer sensible column headers from the comparison in the text.
- Keep cell text concise. Do not invent rows or facts not supported by the text.
- Escape any literal pipe characters inside cells as \\|.`;

export function buildTableUser(source: string): string {
	return `Turn the following text into a comparison table:\n\n${source.trim()}`;
}

/**
 * Light cleanup of the model's table output: strip a wrapping code fence if present and trim.
 * (Models occasionally wrap tables in ``` despite instructions.)
 */
export function normalizeTable(output: string): string {
	const trimmed = output.trim();
	const fence = trimmed.match(/^```[\w]*\n([\s\S]*?)\n```$/);
	return (fence ? fence[1] : trimmed).trim();
}
