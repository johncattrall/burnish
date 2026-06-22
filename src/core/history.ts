/**
 * History store: keep the last N original versions of notes that Burnish has rewritten, so an
 * edit (including non-previewed batch / scheduled runs) can always be rolled back. Pure functions
 * over a plain object so they are testable and serialize straight into plugin data.
 *
 * Note: snapshots hold full note bodies. We cap per-note count (default small) to keep data.json
 * from bloating; revisit with a sidecar store if this grows.
 */

export interface Snapshot {
	/** ISO timestamp string, injected by the caller (keeps this module pure/testable). */
	at: string;
	/** Short label, e.g. the action name that triggered the snapshot. */
	label: string;
	/** The note body as it was before the edit. */
	content: string;
}

export type HistoryStore = Record<string, Snapshot[]>;

/**
 * Record a snapshot for `path`, newest first, capped at `max`. Skips recording when the content
 * is identical to the most recent snapshot (no-op edits don't pollute history). Returns the same
 * store object (mutated) for convenience.
 */
export function addSnapshot(
	store: HistoryStore,
	path: string,
	snapshot: Snapshot,
	max: number,
): HistoryStore {
	const list = store[path] ?? [];
	if (list.length && list[0].content === snapshot.content) return store;
	list.unshift(snapshot);
	if (list.length > max) list.length = max;
	store[path] = list;
	return store;
}

export function getSnapshots(store: HistoryStore, path: string): Snapshot[] {
	return store[path] ?? [];
}

/** Drop history for a path (e.g. after the note is deleted or the user clears it). */
export function clearHistory(store: HistoryStore, path?: string): HistoryStore {
	if (path === undefined) {
		for (const k of Object.keys(store)) delete store[k];
	} else {
		delete store[path];
	}
	return store;
}

/** Move history from one path to another (e.g. on rename). */
export function renameHistory(store: HistoryStore, from: string, to: string): HistoryStore {
	if (store[from]) {
		store[to] = store[from];
		delete store[from];
	}
	return store;
}

/** Total number of snapshots across all notes (for the settings summary). */
export function countSnapshots(store: HistoryStore): number {
	return Object.values(store).reduce((n, list) => n + list.length, 0);
}
