/**
 * Meta-test: ensures every loaded pattern definition has a
 * corresponding test file in test/ and vice-versa.
 */

import * as fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getPatterns } from '../src/patterns.ts';

const testDir = import.meta.dirname ?? '.';

const patternNames = getPatterns().map((pattern) => pattern.name);

/** Test files that are not pattern-specific (infra/meta tests). */
const nonPatternTests = new Set([
	'all-patterns-covered.test.ts',
	'comment-string-false-positives.test.ts',
	'pattern-enforcement.test.ts',
	'prospective-tool-input.test.ts',
	'skill-gate-projection.test.ts'
]);

const testNames = fs
	.readdirSync(testDir)
	.filter((f) => f.endsWith('.test.ts') && !nonPatternTests.has(f))
	.map((f) => f.replace(/\.test\.ts$/, ''));

describe('pattern-to-test coverage', () => {
	it('every loaded pattern has a corresponding .test.ts', () => {
		const missing = patternNames.filter((p) => !testNames.includes(p));
		expect(
			missing,
			`patterns missing tests: ${missing.join(', ')}`
		).toEqual([]);
	});

	it('every pattern .test.ts has a corresponding loaded pattern', () => {
		const orphaned = testNames.filter((t) => !patternNames.includes(t));
		expect(
			orphaned,
			`test files without patterns: ${orphaned.join(', ')}`
		).toEqual([]);
	});

	it('has at least one pattern', () => {
		expect(patternNames.length).toBeGreaterThan(0);
	});
});
