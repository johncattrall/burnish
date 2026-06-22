import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, chunkText, estimateCostUsd } from "../src/util/chunk.ts";

test("estimateTokens is roughly chars/4", () => {
	assert.equal(estimateTokens(""), 0);
	assert.equal(estimateTokens("abcd"), 1);
	assert.equal(estimateTokens("a".repeat(400)), 100);
});

test("short text is a single chunk", () => {
	const text = "one paragraph\n\nsecond paragraph";
	assert.deepEqual(chunkText(text, 1000), [text]);
});

test("long text splits on paragraph boundaries and loses no content", () => {
	const paras = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ` + "x".repeat(40));
	const text = paras.join("\n\n");
	const chunks = chunkText(text, 50); // ~200 chars per chunk
	assert.ok(chunks.length > 1, "should split");
	// Every paragraph survives somewhere.
	for (const p of paras) {
		assert.ok(chunks.some((c) => c.includes(p)), `lost: ${p}`);
	}
});

test("oversized single paragraph is hard-split", () => {
	const huge = "y".repeat(1000);
	const chunks = chunkText(huge, 50); // 200 char limit
	assert.ok(chunks.length >= 5);
	assert.equal(chunks.join(""), huge);
});

test("cost estimate combines input and output pricing", () => {
	// 1M input @ $3, 1M output @ $15 = $18
	assert.equal(estimateCostUsd(1_000_000, 1_000_000, 3, 15), 18);
});
