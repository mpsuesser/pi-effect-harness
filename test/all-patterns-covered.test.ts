/**
 * Meta-test: ensures every pattern definition in patterns/ has a
 * corresponding test file in test/ and vice-versa.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const testDir = import.meta.dirname ?? '.';
const patternsDir = path.join(testDir, '..', 'patterns');

const patternNames = fs
	.readdirSync(patternsDir)
	.filter((f) => f.endsWith('.md'))
	.map((f) => f.replace(/\.md$/, ''));

/** Test files that are not pattern-specific (infra/meta tests). */
const nonPatternTests = new Set([
	'all-patterns-covered.test.ts',
	'comment-string-false-positives.test.ts'
]);

const testNames = fs
	.readdirSync(testDir)
	.filter((f) => f.endsWith('.test.ts') && !nonPatternTests.has(f))
	.map((f) => f.replace(/\.test\.ts$/, ''));

describe('pattern-to-test coverage', () => {
	it('every pattern .md has a corresponding .test.ts', () => {
		const missing = patternNames.filter((p) => !testNames.includes(p));
		expect(
			missing,
			`patterns missing tests: ${missing.join(', ')}`
		).toEqual([]);
	});

	it('every pattern .test.ts has a corresponding .md', () => {
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
