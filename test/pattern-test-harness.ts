/**
 * Test harness for pattern definitions.
 *
 * Provides utilities to test that pattern regex matches expected inputs
 * without requiring the full plugin infrastructure.
 */

import { Lang, parse } from '@ast-grep/napi';
import { describe, expect, it } from '@effect/vitest';
// @ts-expect-error - no type declarations available
import picomatch from 'picomatch';

import {
	getPatterns,
	type PatternDefinition,
	stripComments
} from '../src/patterns.ts';

const allPatterns = getPatterns();

const findPatternByName = (name: string): PatternDefinition | null => {
	return allPatterns.find((pattern) => pattern.name === name) ?? null;
};

const testGlob = (filePath: string, glob: string): boolean => {
	try {
		return picomatch(glob)(filePath);
	} catch {
		return false;
	}
};

const testAstMatch = (input: string, pattern: PatternDefinition): boolean => {
	try {
		const root = parse(Lang.TypeScript, input).root();
		const nodes = pattern.inside
			? root.findAll({
				rule: {
					pattern: pattern.pattern,
					inside: {
						pattern: pattern.inside,
						stopBy: 'end'
					}
				}
			})
			: root.findAll(pattern.pattern);
		return nodes.length > 0;
	} catch {
		return false;
	}
};

interface TestPatternOptions {
	name: string;
	tag?: string;
	glob?: string;
	shouldMatch: string[];
	shouldNotMatch: string[];
}

export const testPattern = (opts: TestPatternOptions) => {
	describe(`Pattern: ${opts.name}`, () => {
		const pattern = findPatternByName(opts.name);

		it('should load pattern definition', () => {
			expect(pattern).not.toBeNull();
			if (pattern === null) {
				throw new Error(`Missing pattern: ${opts.name}`);
			}
			expect(pattern.name).toBe(opts.name);
		});

		if (pattern) {
			const testMatch = pattern.detector === 'ast'
				? (input: string) => testAstMatch(input, pattern)
				: (input: string) =>
					new RegExp(pattern.pattern).test(
						pattern.matchInComments
							? input
							: stripComments(input)
					);

			describe('shouldMatch', () => {
				for (const input of opts.shouldMatch) {
					it(`should match: ${JSON.stringify(input).slice(0, 80)}`, () => {
						expect(testMatch(input)).toBe(true);
					});
				}
			});

			describe('shouldNotMatch', () => {
				for (const input of opts.shouldNotMatch) {
					it(`should NOT match: ${JSON.stringify(input).slice(0, 80)}`, () => {
						expect(testMatch(input)).toBe(false);
					});
				}
			});
		}
	});
};

interface TestFilePathPatternOptions {
	name: string;
	tag?: string;
	shouldMatch: Array<{
		code: string;
		filePath: string;
	}>;
	shouldNotMatch: Array<{
		code: string;
		filePath: string;
	}>;
}

export const testFilePathPattern = (opts: TestFilePathPatternOptions) => {
	describe(`File+Code Pattern: ${opts.name}`, () => {
		const pattern = findPatternByName(opts.name);

		it('should load pattern definition', () => {
			expect(pattern).not.toBeNull();
		});

		if (pattern) {
			const regex = new RegExp(pattern.pattern);

			describe('shouldMatch', () => {
				for (const { code, filePath } of opts.shouldMatch) {
					it(`should match code=${JSON.stringify(code)} in file=${filePath}`, () => {
						const codeMatches = regex.test(stripComments(code));
						const globMatches = pattern.glob
							? testGlob(filePath, pattern.glob)
							: true;
						expect(codeMatches && globMatches).toBe(true);
					});
				}
			});

			describe('shouldNotMatch', () => {
				for (const { code, filePath } of opts.shouldNotMatch) {
					it(`should NOT match code=${JSON.stringify(code)} in file=${filePath}`, () => {
						const codeMatches = regex.test(stripComments(code));
						const globMatches = pattern.glob
							? testGlob(filePath, pattern.glob)
							: true;
						expect(codeMatches && globMatches).toBe(false);
					});
				}
			});
		}
	});
};
