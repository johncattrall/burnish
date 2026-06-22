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
	const mangled = masked.replace(/BURNISHPROTECT\d+ENDBURNISH/g, "");
	const dropped = droppedPlaceholders(mangled, map);
	assert.equal(dropped.length, 1);
	assert.ok(dropped[0].includes("secret"));
});

test("round-trips many regions without token-prefix collisions (1 vs 10+)", () => {
	// 12 inline-code spans -> placeholders 0..11; restore must not corrupt _1 inside _10/_11.
	const parts = Array.from({ length: 12 }, (_, i) => `\`code${i}\``);
	const text = "prose " + parts.join(" and ") + " end";
	const { masked, map } = protect(text);
	assert.equal(map.size, 12);
	assert.ok(!masked.includes("code0"));
	assert.equal(restore(masked, map), text);
});

test("placeholders are plain ASCII (survive model round-trips)", () => {
	const { masked } = protect("see `x` here");
	// No invisible/zero-width characters in the emitted placeholder.
	assert.ok(/^[\x20-\x7E]*$/.test(masked), "masked text should be printable ASCII");
});

test("does not mask plain prose", () => {
	const text = "Just a normal sentence with $5 and no code.";
	const { masked } = protect(text);
	assert.equal(masked, text);
});
