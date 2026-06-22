/**
 * Cheap token estimation and long-note chunking for the cost guard. We deliberately avoid a
 * real tokenizer dependency (heavy, model-specific); a chars/4 heuristic is good enough to
 * decide whether to warn the user, and is fully deterministic for tests.
 */

/** Rough token estimate. ~4 chars/token is a reasonable average for English Markdown. */
export function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / 4);
}

/** Rough USD cost estimate given per-million-token input/output prices. */
export function estimateCostUsd(
	inputTokens: number,
	outputTokens: number,
	inPricePerM: number,
	outPricePerM: number,
): number {
	return (inputTokens / 1_000_000) * inPricePerM + (outputTokens / 1_000_000) * outPricePerM;
}

/**
 * Split text into chunks under `maxTokens`, preferring to break on blank lines (paragraph /
 * section boundaries) so each chunk stays coherent. Falls back to hard splits for pathological
 * single paragraphs longer than the limit.
 */
export function chunkText(text: string, maxTokens: number): string[] {
	if (estimateTokens(text) <= maxTokens) return [text];

	const maxChars = maxTokens * 4;
	const blocks = text.split(/\n{2,}/);
	const chunks: string[] = [];
	let cur = "";

	const flush = () => {
		if (cur.length) {
			chunks.push(cur);
			cur = "";
		}
	};

	for (const block of blocks) {
		if (block.length > maxChars) {
			// Single block too big: flush current, then hard-split the oversized block.
			flush();
			for (let i = 0; i < block.length; i += maxChars) {
				chunks.push(block.slice(i, i + maxChars));
			}
			continue;
		}
		if (cur.length + block.length + 2 > maxChars) flush();
		cur = cur.length ? `${cur}\n\n${block}` : block;
	}
	flush();
	return chunks;
}
