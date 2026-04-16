/**
 * Meta-test: ensures every loaded pattern definition has a
 * corresponding test file in test/ and vice-versa.
 */

import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem } from 'effect';

import { loadPatternsEffect, nodePlatformLayer } from './helpers/kernel.ts';

const testDir = import.meta.dirname ?? '.';

/** Test files that are not pattern-specific (infra/meta tests). */
const nonPatternTests = new Set([
	'all-patterns-covered.test.ts',
	'comment-string-false-positives.test.ts',
	'mode-persistence.test.ts',
	'pattern-enforcement.test.ts',
	'prospective-tool-input.test.ts',
	'skill-gate-projection.test.ts'
]);

const testNamesEffect = Effect.gen(function*() {
	const fs = yield* FileSystem.FileSystem;
	const entries = yield* fs.readDirectory(testDir);
	return entries
		.filter((fileName) =>
			fileName.endsWith('.test.ts') && !nonPatternTests.has(fileName)
		)
		.map((fileName) => fileName.replace(/\.test\.ts$/, ''));
}).pipe(Effect.provide(nodePlatformLayer));

describe('pattern-to-test coverage', () => {
	it.live('every loaded pattern has a corresponding .test.ts', () =>
		Effect.gen(function*() {
			const patternNames = (yield* loadPatternsEffect).map(
				(pattern) => pattern.name
			);
			const testNames = yield* testNamesEffect;
			const missing = patternNames.filter((name) =>
				!testNames.includes(name)
			);
			expect(
				missing,
				`patterns missing tests: ${missing.join(', ')}`
			).toEqual([]);
		}));

	it.live('every pattern .test.ts has a corresponding loaded pattern', () =>
		Effect.gen(function*() {
			const patternNames = (yield* loadPatternsEffect).map(
				(pattern) => pattern.name
			);
			const testNames = yield* testNamesEffect;
			const orphaned = testNames.filter((name) =>
				!patternNames.includes(name)
			);
			expect(
				orphaned,
				`test files without patterns: ${orphaned.join(', ')}`
			).toEqual([]);
		}));

	it.live('has at least one pattern', () =>
		Effect.gen(function*() {
			expect((yield* loadPatternsEffect).length).toBeGreaterThan(0);
		}));
});
