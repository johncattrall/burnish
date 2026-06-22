import { test } from "node:test";
import assert from "node:assert/strict";
import { substitute, referencedVariables } from "../src/core/variables.ts";

const ctx = {
	title: "My Note",
	path: "Meetings/My Note.md",
	selection: "selected text",
	frontmatter: { status: "draft", aliases: ["a", "b"] },
	date: "2026-06-22",
};

test("substitutes simple variables", () => {
	assert.equal(substitute("{{title}} on {{date}}", ctx), "My Note on 2026-06-22");
	assert.equal(substitute("path={{path}}", ctx), "path=Meetings/My Note.md");
	assert.equal(substitute("sel={{selection}}", ctx), "sel=selected text");
});

test("resolves dotted frontmatter keys", () => {
	assert.equal(substitute("{{frontmatter.status}}", ctx), "draft");
	assert.equal(substitute("{{frontmatter.aliases.0}}", ctx), "a");
});

test("leaves unknown variables intact", () => {
	assert.equal(substitute("{{nope}}", ctx), "{{nope}}");
	assert.equal(substitute("{{frontmatter.missing}}", ctx), "{{frontmatter.missing}}");
});

test("expands grit guidance only when grit is set", () => {
	assert.equal(substitute("{{grit}}", ctx), "");
	const out = substitute("{{grit}}", { ...ctx, grit: "deep" });
	assert.ok(out.toLowerCase().includes("rewrite"));
});

test("tolerates whitespace inside braces", () => {
	assert.equal(substitute("{{  title  }}", ctx), "My Note");
});

test("lists referenced variables", () => {
	const vars = referencedVariables("{{title}} {{frontmatter.status}} {{title}}");
	assert.deepEqual(vars.sort(), ["frontmatter.status", "title"]);
});
