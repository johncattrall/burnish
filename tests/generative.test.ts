import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../src/core/tables.ts";
import { formatEntries, buildMocUser } from "../src/core/moc.ts";
import { normalizeMermaid } from "../src/core/mermaid.ts";

test("normalizeTable strips a wrapping code fence", () => {
	const fenced = "```markdown\n| A | B |\n|---|---|\n| 1 | 2 |\n```";
	assert.equal(normalizeTable(fenced), "| A | B |\n|---|---|\n| 1 | 2 |");
});

test("normalizeTable leaves a bare table untouched", () => {
	const bare = "| A | B |\n|---|---|\n| 1 | 2 |";
	assert.equal(normalizeTable(bare), bare);
});

test("normalizeMermaid wraps a bare diagram in a mermaid fence", () => {
	const out = normalizeMermaid("graph TD\nA-->B");
	assert.equal(out, "```mermaid\ngraph TD\nA-->B\n```");
});

test("normalizeMermaid retags a generic fence as mermaid", () => {
	const out = normalizeMermaid("```\ngraph TD\nA-->B\n```");
	assert.equal(out, "```mermaid\ngraph TD\nA-->B\n```");
});

test("formatEntries renders wikilinks with optional hints", () => {
	const out = formatEntries([
		{ title: "Alpha", path: "Alpha.md" },
		{ title: "Beta", path: "x/Beta.md", hint: "the second one" },
	]);
	assert.equal(out, "- [[Alpha]]\n- [[Beta]] - the second one");
});

test("buildMocUser includes every note as a wikilink", () => {
	const user = buildMocUser("My MOC", [
		{ title: "One", path: "One.md" },
		{ title: "Two", path: "Two.md" },
	]);
	assert.ok(user.includes("[[One]]"));
	assert.ok(user.includes("[[Two]]"));
	assert.ok(user.includes("My MOC"));
});
