/**
 * Prompt builder for "Generate Map of Content (MOC)". Given a set of notes, produce a single
 * MOC note that groups and links them with [[wikilinks]] and short descriptions. Output goes to
 * a new note (originals untouched).
 */

export interface MocEntry {
	/** Note basename, used to build the [[wikilink]]. */
	title: string;
	path: string;
	/** Optional one-line hint (e.g. first heading) to help grouping. */
	hint?: string;
}

export const MOC_SYSTEM = `You create a "Map of Content" (MOC) note for Obsidian: a curated index that organizes a set of notes.
- Group the notes under thematic "## " headings you infer from their titles/hints.
- Link every note using its Obsidian wikilink exactly as given (e.g. [[Note Title]]). Do NOT invent links to notes not in the list, and do not drop any note.
- Add a short (<= 12 word) description after each link where useful.
- Start with a single "# " title and a one-sentence purpose line. Output only Markdown.`;

/** Format the note list as wikilinks with optional hints, one per line. */
export function formatEntries(entries: MocEntry[]): string {
	return entries
		.map((e) => (e.hint ? `- [[${e.title}]] - ${e.hint}` : `- [[${e.title}]]`))
		.join("\n");
}

export function buildMocUser(mocTitle: string, entries: MocEntry[]): string {
	return `Create a MOC titled "${mocTitle}" from these ${entries.length} notes:\n\n${formatEntries(entries)}`;
}
