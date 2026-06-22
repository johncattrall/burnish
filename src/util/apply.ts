import type { Editor, EditorPosition } from "obsidian";

/**
 * Write text back into the editor as a single transaction so Obsidian's native Undo reverts the
 * whole change in one step (even when many hunks were accepted).
 */

export interface TargetRange {
	from: EditorPosition;
	to: EditorPosition;
}

/** Replace a range (or the whole document if no range) with new text, as one undo step. */
export function replaceRange(editor: Editor, text: string, range?: TargetRange): void {
	if (range) {
		editor.transaction({
			changes: [{ from: range.from, to: range.to, text }],
		});
	} else {
		const last = editor.lastLine();
		editor.transaction({
			changes: [
				{
					from: { line: 0, ch: 0 },
					to: { line: last, ch: editor.getLine(last).length },
					text,
				},
			],
		});
	}
}

/** Insert text at the cursor (used for Mermaid / generative inserts). */
export function insertAtCursor(editor: Editor, text: string): void {
	const cursor = editor.getCursor();
	editor.transaction({
		changes: [{ from: cursor, text }],
	});
}

/** The full-document range, for whole-note replacement. */
export function wholeDocRange(editor: Editor): TargetRange {
	const last = editor.lastLine();
	return {
		from: { line: 0, ch: 0 },
		to: { line: last, ch: editor.getLine(last).length },
	};
}
