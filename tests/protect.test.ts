import { test } from "node:test";
import assert from "node:assert/strict";
import { protect, restore, droppedPlaceholders } from "../src/util/protect.ts";

test("round-trips a fenced code block unchanged", () => {
	const text = "Intro\n\n```js\nconst x = 1;\n```\n\nOutro";
	const { masked, map } = protect(text);
	assert.ok(!masked.includes("const x = 1;"), "code should be masked out");
	assert.equal(restore(masked, map), text);
});

test("masks and restores inline code, block and inline math", () => {
	const text = "Use `code` and $x^2$ and $$\\int f$$ here.";
	const { masked, map } = protect(text);
	assert.ok(!masked.includes("code"));
	assert.ok(!masked.includes("x^2"));
	assert.ok(!masked.includes("\\int"));
	assert.equal(restore(masked, map), text);
});

test("masks frontmatter and embeds", () => {
	const text = "---\ntitle: Hi\ntags: [a]\n---\nBody ![[image.png]] end";
	const { masked, map } = protect(text);
	assert.ok(!masked.includes("title: Hi"));
	assert.ok(!masked.includes("image.png"));
	assert.equal(restore(masked, map), text);
});

test("detects dropped placeholders when the model omits a protected region", () => {
	const text = "before\n\n```\nsecret\n```\n\nafter";
	const { masked, map } = protect(text);
	// Simulate the model returning prose but dropping the code placeholder entirely.
	const mangled = masked.replace(/⁣BURNISH_PROTECT_\d+⁣/g, "");
	const dropped = droppedPlaceholders(mangled, map);
	assert.equal(dropped.length, 1);
	assert.ok(dropped[0].includes("secret"));
});

test("does not mask plain prose", () => {
	const text = "Just a normal sentence with $5 and no code.";
	const { masked } = protect(text);
	assert.equal(masked, text);
});
