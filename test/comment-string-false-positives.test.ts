/**
 * Tests that regex patterns do NOT match when the triggering code
 * appears only inside comments.
 *
 * String literals are intentionally NOT stripped because many patterns
 * match import specifiers, tag comparisons, and other string content.
 *
 * These tests exercise the full matches() pipeline, not just the regex.
 */

import { describe, expect, it } from 'vitest';

import { getPatterns, matches, stripComments } from '../src/patterns.ts';

// ─── Helpers ──────────────────────────────────────────────────

const patterns = getPatterns();

const findPattern = (name: string) => {
	const p = patterns.find((p) => p.name === name);
	if (!p) throw new Error(`Pattern not found: ${name}`);
	return p;
};

/** Simulate a write tool call with the given content. */
const writeArgs = (content: string, filePath = 'src/app.ts') => ({
	content,
	filePath
});

// ─── stripComments unit tests ─────────────────────────────────

describe('stripComments', () => {
	it('strips single-line comments', () => {
		expect(stripComments('code // comment\nmore')).toBe(
			'code           \nmore'
		);
	});

	it('strips block comments', () => {
		expect(stripComments('a /* block */ b')).toBe('a             b');
	});

	it('strips multi-line block comments preserving newlines', () => {
		expect(stripComments('a /* line1\nline2 */ b')).toBe(
			'a         \n         b'
		);
	});

	it('preserves single-quoted strings', () => {
		expect(stripComments("import fs from 'node:fs';")).toBe(
			"import fs from 'node:fs';"
		);
	});

	it('preserves double-quoted strings', () => {
		expect(stripComments('import fs from "node:fs";')).toBe(
			'import fs from "node:fs";'
		);
	});

	it('preserves template literals', () => {
		expect(stripComments('const x = `hello`;')).toBe('const x = `hello`;');
	});

	it('does not treat // inside single-quoted string as comment', () => {
		const input = "const url = 'https://example.com'; code";
		expect(stripComments(input)).toBe(input);
	});

	it('does not treat // inside double-quoted string as comment', () => {
		const input = 'const url = "https://example.com"; code';
		expect(stripComments(input)).toBe(input);
	});

	it('does not treat /* inside string as block comment', () => {
		const input = "const re = '/* not a comment */'; code";
		expect(stripComments(input)).toBe(input);
	});

	it('handles escaped quotes in strings', () => {
		const input = "const s = 'it\\'s fine'; code";
		expect(stripComments(input)).toBe(input);
	});

	it('handles JSDoc comments', () => {
		expect(stripComments('/** docs */\ncode')).toBe('           \ncode');
	});

	it('handles empty input', () => {
		expect(stripComments('')).toBe('');
	});

	it('handles code with no comments or strings', () => {
		const input = 'const x = 5;';
		expect(stripComments(input)).toBe(input);
	});
});

// ─── Single-line comment false positives ──────────────────────

describe('single-line comment false positives', () => {
	it('casting-awareness: "as" in comment should not match', () => {
		const p = findPattern('casting-awareness');
		const content = '// used as a standalone binary\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('avoid-mutable-state: "let" in comment should not match', () => {
		const p = findPattern('avoid-mutable-state');
		const content = "// Don't let errors go unhandled\nconst x = 5;";
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('avoid-try-catch: "try {" in comment should not match', () => {
		const p = findPattern('avoid-try-catch');
		const content =
			'// use try { Effect.tryPromise } instead\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('imperative-loops: "for (" in comment should not match', () => {
		const p = findPattern('imperative-loops');
		const content = '// Wait for (approximately) 5 seconds\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('prefer-match-over-switch: "switch (" in comment should not match', () => {
		const p = findPattern('prefer-match-over-switch');
		const content = '// We should switch (to Match) instead\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('avoid-any: "as any" in comment should not match', () => {
		const p = findPattern('avoid-any');
		const content = '// This works just as any other service\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('use-console-service: "console.log(" in comment should not match', () => {
		const p = findPattern('use-console-service');
		const content = '// Replace console.log( with Effect.log\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('avoid-untagged-errors: "new Error(" in comment should not match', () => {
		const p = findPattern('avoid-untagged-errors');
		const content = "// Don't use new Error( directly\nconst x = 5;";
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});
});

// ─── Multi-line comment false positives ───────────────────────

describe('multi-line comment false positives', () => {
	it('casting-awareness: "as" in block comment should not match', () => {
		const p = findPattern('casting-awareness');
		const content = '/* used as a fallback */\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('casting-awareness: "as" in JSDoc should not match', () => {
		const p = findPattern('casting-awareness');
		const content =
			'/** Not exported — used as a standalone binary. */\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('avoid-try-catch: "try {" in multi-line comment should not match', () => {
		const p = findPattern('avoid-try-catch');
		const content =
			'/**\n * Example:\n * try {\n *   something()\n * }\n */\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('avoid-direct-json: "JSON.parse(" in block comment should not match', () => {
		const p = findPattern('avoid-direct-json');
		const content =
			'/* Replace JSON.parse( with Schema.parseJson */\nconst x = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});
});

// ─── matchInComments opt-in ───────────────────────────────────

describe('matchInComments opt-in', () => {
	it('avoid-ts-ignore: @ts-ignore in comment SHOULD match (matchInComments: true)', () => {
		const p = findPattern('avoid-ts-ignore');
		expect(p.matchInComments).toBe(true);
		const content = '// @ts-ignore\nconst x: any = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('avoid-ts-ignore: @ts-expect-error in block comment SHOULD match', () => {
		const p = findPattern('avoid-ts-ignore');
		const content = '/* @ts-expect-error */\nconst x: any = 5;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});
});

// ─── Real code should still match ─────────────────────────────

describe('real code still matches (no regressions)', () => {
	it('casting-awareness: actual "as Type" in code should match', () => {
		const p = findPattern('casting-awareness');
		const content = 'const x = value as string;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('avoid-mutable-state: actual "let x =" in code should match', () => {
		const p = findPattern('avoid-mutable-state');
		const content = 'let count = 0;';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('avoid-try-catch: actual "try {" in code should match', () => {
		const p = findPattern('avoid-try-catch');
		const content = 'try {\n  something();\n}';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('imperative-loops: actual "for (" in code should match', () => {
		const p = findPattern('imperative-loops');
		const content = 'for (const item of items) {}';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('use-console-service: actual console.log in code should match', () => {
		const p = findPattern('use-console-service');
		const content = 'console.log("hello");';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('casting-awareness: "as const" should NOT match (existing exclusion)', () => {
		const p = findPattern('casting-awareness');
		const content = "const x = 'openai' as const;";
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});

	it('avoid-node-imports: import with string specifier should match', () => {
		const p = findPattern('avoid-node-imports');
		const content = "import * as fs from 'node:fs';";
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('avoid-direct-tag-checks: tag check with string should match', () => {
		const p = findPattern('avoid-direct-tag-checks');
		const content = "if (event._tag === 'FactRecorded') {}";
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});
});

// ─── Mixed content: code + comments ───────────────────────────

describe('mixed content: real code with comments', () => {
	it('should match real code even when comments also present', () => {
		const p = findPattern('avoid-try-catch');
		const content =
			'// this is fine\ntry {\n  something();\n}\n// another comment';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('should NOT match when trigger only in comment, real code is clean', () => {
		const p = findPattern('avoid-try-catch');
		const content =
			'// Instead of try { use Effect.try\nconst result = Effect.try({ try: () => something() });';
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});
});

// ─── Edge cases ───────────────────────────────────────────────

describe('edge cases', () => {
	it('// inside a string should not start a comment', () => {
		const p = findPattern('casting-awareness');
		const content =
			"const url = 'https://example.com'; const x = value as string;";
		expect(matches('write', writeArgs(content), p.event, p)).toBe(true);
	});

	it('quote inside comment should not start a string', () => {
		const p = findPattern('avoid-mutable-state');
		const content = "// don't let x = 5\nconst y = 10;";
		expect(matches('write', writeArgs(content), p.event, p)).toBe(false);
	});
});
