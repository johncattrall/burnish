import { diffLines } from "diff";

/**
 * Line-level diff grouped into hunks for per-hunk accept/reject.
 *
 * We represent the diff as an ordered list of "parts": equal, removed (original-only), or
 * added (modified-only). A hunk is a maximal run of non-equal parts. Reconstruction walks the
 * parts: equal parts always emit; for each changed run we emit either the added lines (accepted)
 * or the removed lines (rejected). This makes apply trivially correct regardless of which subset
 * of hunks the user accepts, and keeps the whole thing pure and testable.
 */

export type PartType = "eq" | "del" | "ins";

export interface Part {
	type: PartType;
	/** Lines including their trailing newline, except possibly the final line. */
	value: string;
}

export interface Hunk {
	index: number;
	/** Indices into the parts array that belong to this hunk (all non-eq). */
	partIndices: number[];
	/** Original text of this hunk (removed lines), for display. */
	before: string;
	/** Proposed text of this hunk (added lines), for display. */
	after: string;
	/** 1-based line number in the original where this hunk starts. */
	originalStartLine: number;
}

export interface DiffResult {
	parts: Part[];
	hunks: Hunk[];
}

export function computeDiff(original: string, modified: string): DiffResult {
	const raw = diffLines(original, modified);
	const parts: Part[] = raw.map((c) => ({
		type: c.added ? "ins" : c.removed ? "del" : "eq",
		value: c.value,
	}));

	const hunks: Hunk[] = [];
	let i = 0;
	let originalLine = 1;

	// Count lines in a chunk value (handles missing trailing newline).
	const lineCount = (v: string): number => {
		if (v === "") return 0;
		const n = v.split("\n").length;
		// A value ending in \n has a trailing empty segment that is not a real line.
		return v.endsWith("\n") ? n - 1 : n;
	};

	while (i < parts.length) {
		if (parts[i].type === "eq") {
			originalLine += lineCount(parts[i].value);
			i++;
			continue;
		}
		// Start of a changed run.
		const start = i;
		const partIndices: number[] = [];
		let before = "";
		let after = "";
		const hunkOriginalStart = originalLine;
		while (i < parts.length && parts[i].type !== "eq") {
			partIndices.push(i);
			if (parts[i].type === "del") {
				before += parts[i].value;
				originalLine += lineCount(parts[i].value);
			} else {
				after += parts[i].value;
			}
			i++;
		}
		hunks.push({
			index: hunks.length,
			partIndices,
			before,
			after,
			originalStartLine: hunkOriginalStart,
		});
		void start;
	}

	return { parts, hunks };
}

/**
 * Reconstruct the document given the set of accepted hunk indices. Accepted hunks contribute
 * their added lines; rejected hunks contribute their original (removed) lines; equal parts
 * always pass through. With all hunks accepted this equals `modified`; with none accepted it
 * equals `original`.
 */
export function reconstruct(diff: DiffResult, acceptedHunkIndices: Iterable<number>): string {
	const accepted = new Set(acceptedHunkIndices);
	// Map each part index to whether its owning hunk is accepted.
	const partAccepted = new Map<number, boolean>();
	for (const h of diff.hunks) {
		const isAccepted = accepted.has(h.index);
		for (const pi of h.partIndices) partAccepted.set(pi, isAccepted);
	}

	let out = "";
	for (let i = 0; i < diff.parts.length; i++) {
		const part = diff.parts[i];
		if (part.type === "eq") {
			out += part.value;
		} else if (part.type === "del") {
			// Original line: keep it only if the hunk was rejected.
			if (partAccepted.get(i) === false) out += part.value;
		} else {
			// Added line: keep it only if the hunk was accepted.
			if (partAccepted.get(i) === true) out += part.value;
		}
	}
	return out;
}

export function hasChanges(diff: DiffResult): boolean {
	return diff.hunks.length > 0;
}
