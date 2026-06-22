/**
 * Build the prompt for "Merge & dedupe meeting notes". Pure string assembly so it can be tested
 * and reused for both single-file (multiple pasted sections) and multi-file modes.
 *
 * The prompt is engineered for loss-safety: the model must never drop unique information, must
 * flag conflicts rather than silently choosing, and must dump anything unmergeable verbatim into
 * an appendix. Output is a brand new note (the diff preview is applied to that draft).
 */

export interface MergeSource {
	/** Display label, e.g. a filename or a person's name. */
	label: string;
	content: string;
}

export interface MergeOptions {
	sources: MergeSource[];
	/** Keep "(Ian)" / "(Dave)" attribution tags on differing/conflicting points. */
	attribution: boolean;
}

export const MERGE_SYSTEM = `You merge several sets of meeting notes into ONE clean, deduplicated note.

Hard rules:
- NEVER drop unique information. Every distinct fact, decision, action item, name, number and date from any source must survive somewhere in the output.
- Deduplicate points that say the same thing.
- When two sources DISAGREE on a fact or decision, do NOT silently pick one. Record both under a "## ⚠️ Needs reconciliation" section, noting who said what.
- Anything you cannot cleanly place goes verbatim into an "## Unsorted / verbatim" appendix. Losing information is worse than an untidy appendix.
- Preserve [[wikilinks]], #tags and dates. Output only Markdown, no commentary.

Output these sections in order, omitting any that would be empty:
1. A short "## Summary" (2-4 sentences).
2. "## Decisions"
3. "## Action items" as a "- [ ]" checklist with owners and due dates where known.
4. "## Discussion" (grouped by topic).
5. "## Open questions"
6. "## ⚠️ Needs reconciliation" (conflicts between sources)
7. "## Unsorted / verbatim" (anything not cleanly merged)`;

export function buildMergeUser(opts: MergeOptions): string {
	const attribution = opts.attribution
		? "Where points differ between people, keep a short attribution tag like (Ian) or (Dave) on them."
		: "Do not add attribution tags unless a conflict requires identifying who said what.";

	const blocks = opts.sources
		.map((s, i) => `### Source ${i + 1}: ${s.label}\n\n${s.content.trim()}`)
		.join("\n\n---\n\n");

	return `${attribution}\n\nMerge the following ${opts.sources.length} source(s):\n\n${blocks}`;
}
