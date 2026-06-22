import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDiff, reconstruct } from "../src/core/diff.ts";

test("all hunks accepted reconstructs the modified text", () => {
	const original = "line one\nline two\nline three\n";
	const modified = "line one\nLINE TWO\nline three\nline four\n";
	const diff = computeDiff(original, modified);
	const all = diff.hunks.map((h) => h.index);
	assert.equal(reconstruct(diff, all), modified);
});

test("no hunks accepted reconstructs the original text", () => {
	const original = "alpha\nbeta\ngamma\n";
	const modified = "alpha\nBETA\ndelta\n";
	const diff = computeDiff(original, modified);
	assert.equal(reconstruct(diff, []), original);
});

test("partial accept takes only chosen hunks", () => {
	const original = "a\nb\nc\nd\n";
	const modified = "A\nb\nc\nD\n";
	const diff = computeDiff(original, modified);
	assert.equal(diff.hunks.length, 2, "expected two separate hunks");
	// Accept only the first hunk: a->A applied, d unchanged.
	const result = reconstruct(diff, [diff.hunks[0].index]);
	assert.equal(result, "A\nb\nc\nd\n");
	// Accept only the second hunk: d->D applied, a unchanged.
	const result2 = reconstruct(diff, [diff.hunks[1].index]);
	assert.equal(result2, "a\nb\nc\nD\n");
});

test("identical input produces no hunks", () => {
	const text = "same\ntext\n";
	const diff = computeDiff(text, text);
	assert.equal(diff.hunks.length, 0);
	assert.equal(reconstruct(diff, []), text);
});

test("hunk line numbers point into the original", () => {
	const original = "keep1\nkeep2\nremoveme\nkeep3\n";
	const modified = "keep1\nkeep2\nkeep3\n";
	const diff = computeDiff(original, modified);
	assert.equal(diff.hunks.length, 1);
	assert.equal(diff.hunks[0].originalStartLine, 3);
});
