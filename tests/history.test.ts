import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addSnapshot,
	getSnapshots,
	clearHistory,
	renameHistory,
	countSnapshots,
} from "../src/core/history.ts";
import type { HistoryStore } from "../src/core/history.ts";

const snap = (at: string, content: string) => ({ at, label: "Tidy", content });

test("adds snapshots newest-first and caps at max", () => {
	const store: HistoryStore = {};
	addSnapshot(store, "a.md", snap("t1", "one"), 2);
	addSnapshot(store, "a.md", snap("t2", "two"), 2);
	addSnapshot(store, "a.md", snap("t3", "three"), 2);
	const list = getSnapshots(store, "a.md");
	assert.equal(list.length, 2);
	assert.deepEqual(
		list.map((s) => s.content),
		["three", "two"],
	);
});

test("skips a snapshot identical to the most recent", () => {
	const store: HistoryStore = {};
	addSnapshot(store, "a.md", snap("t1", "same"), 5);
	addSnapshot(store, "a.md", snap("t2", "same"), 5);
	assert.equal(getSnapshots(store, "a.md").length, 1);
});

test("getSnapshots returns empty for unknown path", () => {
	assert.deepEqual(getSnapshots({}, "missing.md"), []);
});

test("clearHistory removes one path or all", () => {
	const store: HistoryStore = {};
	addSnapshot(store, "a.md", snap("t", "x"), 5);
	addSnapshot(store, "b.md", snap("t", "y"), 5);
	clearHistory(store, "a.md");
	assert.deepEqual(getSnapshots(store, "a.md"), []);
	assert.equal(getSnapshots(store, "b.md").length, 1);
	clearHistory(store);
	assert.equal(countSnapshots(store), 0);
});

test("renameHistory moves snapshots to the new path", () => {
	const store: HistoryStore = {};
	addSnapshot(store, "old.md", snap("t", "x"), 5);
	renameHistory(store, "old.md", "new.md");
	assert.deepEqual(getSnapshots(store, "old.md"), []);
	assert.equal(getSnapshots(store, "new.md").length, 1);
});
