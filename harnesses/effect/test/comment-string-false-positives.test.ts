/**
 * Tests that regex patterns do NOT match when the triggering code
 * appears only inside comments.
 *
 * String literals are intentionally NOT stripped because many patterns
 * match import specifiers, tag comparisons, and other string content.
 *
 * These tests exercise the full matcher pipeline, not just the regex.
 */

import { describe, expect, it } from '@effect/vitest';
import { Effect, Option, Schema } from 'effect';

import { MatcherInput } from 'pi-harness-kit/kernel/MatcherInput.ts';
import {
	matchesPattern,
	stripComments
} from 'pi-harness-kit/kernel/services/PatternMatcher.ts';
import { Pattern } from 'pi-harness-kit/Pattern.ts';
import { loadPatternsEffect } from './helpers/kernel.ts';

class MissingPattern extends Schema.TaggedErrorClass<MissingPattern>()(
	'MissingPattern',
	{
		name: Schema.String
	}
) {}

class RegexDetectorExpected
	extends Schema.TaggedErrorClass<RegexDetectorExpected>()(
		'RegexDetectorExpected',
		{
			name: Schema.String
		}
	) {}

const requirePatternEffect = (name: string) =>
	Effect.gen(function*() {
		const pattern = (yield* loadPatternsEffect).find(
			(candidate) => candidate.name === name
		);
		if (pattern === undefined) {
			return yield* new MissingPattern({ name });
		}
		return pattern;
	});

const writeProjection = (content: string, filePath = 'src/app.ts') =>
	new MatcherInput.Value({
		filePath: Option.some(filePath),
		content: Option.some(content),
		command: Option.none(),
		pattern: Option.none(),
		query: Option.none(),
		url: Option.none(),
		prompt: Option.none()
	});

const expectPatternMatch = (
	name: string,
	content: string,
	expected: boolean,
	filePath?: string
) => Effect.gen(function*() {
	const pattern = yield* requirePatternEffect(name);
	expect(
		matchesPattern(
			'write',
			writeProjection(content, filePath),
			pattern.event,
			pattern
		)
	).toBe(expected);
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
	it.live('casting-awareness: "as" in comment should not match', () =>
		expectPatternMatch(
			'casting-awareness',
			'// used as a standalone binary\nconst x = 5;',
			false
		));

	it.live('avoid-mutable-state: "let" in comment should not match', () =>
		expectPatternMatch(
			'avoid-mutable-state',
			"// Don't let errors go unhandled\nconst x = 5;",
			false
		));

	it.live('avoid-try-catch: "try {" in comment should not match', () =>
		expectPatternMatch(
			'avoid-try-catch',
			'// use try { Effect.tryPromise } instead\nconst x = 5;',
			false
		));

	it.live('imperative-loops: "for (" in comment should not match', () =>
		expectPatternMatch(
			'imperative-loops',
			'// Wait for (approximately) 5 seconds\nconst x = 5;',
			false
		));

	it.live('prefer-match-over-switch: "switch (" in comment should not match', () =>
		expectPatternMatch(
			'prefer-match-over-switch',
			'// We should switch (to Match) instead\nconst x = 5;',
			false
		));

	it.live('avoid-any: "as any" in comment should not match', () =>
		expectPatternMatch(
			'avoid-any',
			'// This works just as any other service\nconst x = 5;',
			false
		));

	it.live('use-console-service: "console.log(" in comment should not match', () =>
		expectPatternMatch(
			'use-console-service',
			'// Replace console.log( with Effect.log\nconst x = 5;',
			false
		));

	it.live('avoid-untagged-errors: "new Error(" in comment should not match', () =>
		expectPatternMatch(
			'avoid-untagged-errors',
			"// Don't use new Error( directly\nconst x = 5;",
			false
		));
});

// ─── Multi-line comment false positives ───────────────────────

describe('multi-line comment false positives', () => {
	it.live('casting-awareness: "as" in block comment should not match', () =>
		expectPatternMatch(
			'casting-awareness',
			'/* used as a fallback */\nconst x = 5;',
			false
		));

	it.live('casting-awareness: "as" in JSDoc should not match', () =>
		expectPatternMatch(
			'casting-awareness',
			'/** Not exported — used as a standalone binary. */\nconst x = 5;',
			false
		));

	it.live('avoid-try-catch: "try {" in multi-line comment should not match', () =>
		expectPatternMatch(
			'avoid-try-catch',
			'/**\n * Example:\n * try {\n *   something()\n * }\n */\nconst x = 5;',
			false
		));

	it.live('avoid-direct-json: "JSON.parse(" in block comment should not match', () =>
		expectPatternMatch(
			'avoid-direct-json',
			'/* Replace JSON.parse( with Schema.parseJson */\nconst x = 5;',
			false
		));
});

// ─── matchInComments opt-in ───────────────────────────────────

describe('matchInComments opt-in', () => {
	it.live('avoid-ts-ignore: @ts-ignore in comment SHOULD match (matchInComments: true)', () =>
		Effect.gen(function*() {
			const pattern = yield* requirePatternEffect('avoid-ts-ignore');
			const detector = pattern.detector;
			expect(detector instanceof Pattern.RegexDetector).toBe(true);
			if (!(detector instanceof Pattern.RegexDetector)) {
				return yield* new RegexDetectorExpected({ name: pattern.name });
			}
			expect(detector.matchInComments).toBe(true);
			expect(
				matchesPattern(
					'write',
					writeProjection('// @ts-ignore\nconst x: any = 5;'),
					pattern.event,
					pattern
				)
			).toBe(true);
		}));

	it.live('avoid-ts-ignore: @ts-expect-error in block comment SHOULD match', () =>
		expectPatternMatch(
			'avoid-ts-ignore',
			'/* @ts-expect-error */\nconst x: any = 5;',
			true
		));
});

// ─── Real code should still match ─────────────────────────────

describe('real code still matches (no regressions)', () => {
	it.live('casting-awareness: actual "as Type" in code should match', () =>
		expectPatternMatch(
			'casting-awareness',
			'const x = value as string;',
			true
		));

	it.live('avoid-mutable-state: actual "let x =" in code should match', () =>
		expectPatternMatch('avoid-mutable-state', 'let count = 0;', true));

	it.live('avoid-try-catch: actual "try {" in code should match', () =>
		expectPatternMatch(
			'avoid-try-catch',
			'try {\n  something();\n}',
			true
		));

	it.live('imperative-loops: actual "for (" in code should match', () =>
		expectPatternMatch(
			'imperative-loops',
			'for (const item of items) {}',
			true
		));

	it.live('use-console-service: actual console.log in code should match', () =>
		expectPatternMatch(
			'use-console-service',
			'console.log("hello");',
			true
		));

	it.live('casting-awareness: "as const" should NOT match (existing exclusion)', () =>
		expectPatternMatch(
			'casting-awareness',
			"const x = 'openai' as const;",
			false
		));

	it.live('avoid-node-imports: import with string specifier should match', () =>
		expectPatternMatch(
			'avoid-node-imports',
			"import * as fs from 'node:fs';",
			true
		));

	it.live('avoid-direct-tag-checks: tag check with string should match', () =>
		expectPatternMatch(
			'avoid-direct-tag-checks',
			"if (event._tag === 'FactRecorded') {}",
			true
		));
});

// ─── Mixed content: code + comments ───────────────────────────

describe('mixed content: real code with comments', () => {
	it.live('should match real code even when comments also present', () =>
		expectPatternMatch(
			'avoid-try-catch',
			'// this is fine\ntry {\n  something();\n}\n// another comment',
			true
		));

	it.live('should NOT match when trigger only in comment, real code is clean', () =>
		expectPatternMatch(
			'avoid-try-catch',
			'// Instead of try { use Effect.try\nconst result = Effect.try({ try: () => something() });',
			false
		));
});

// ─── Edge cases ───────────────────────────────────────────────

describe('edge cases', () => {
	it.live('// inside a string should not start a comment', () =>
		expectPatternMatch(
			'casting-awareness',
			"const url = 'https://example.com'; const x = value as string;",
			true
		));

	it.live('quote inside comment should not start a string', () =>
		expectPatternMatch(
			'avoid-mutable-state',
			"// don't let x = 5\nconst y = 10;",
			false
		));
});
