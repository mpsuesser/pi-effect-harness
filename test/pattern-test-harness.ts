/**
 * Test harness for pattern definitions
 *
 * Provides utilities to test that pattern regex matches expected inputs
 * without requiring the full plugin infrastructure.
 */

import { Lang, parse } from '@ast-grep/napi';
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
// @ts-expect-error - no type declarations available
import picomatch from 'picomatch';

import { extractBody, parseFrontmatter } from '../src/frontmatter.ts';
import { stripComments } from '../src/patterns.ts';

// ─── Types ────────────────────────────────────────────────────

interface PatternDefinition {
	name: string;
	description: string;
	event: string;
	tool: string;
	glob?: string;
	pattern: string;
	detector: 'regex' | 'ast';
	inside?: string;
	action: string;
	level: string;
	matchInComments: boolean;
	body: string;
	filePath: string;
}

// ─── Validation ───────────────────────────────────────────────

const VALID_LEVELS = new Set(['critical', 'high', 'medium', 'warning', 'info']);
const VALID_ACTIONS = new Set(['context', 'ask', 'deny']);
const VALID_DETECTORS = new Set(['regex', 'ast']);
const VALID_EVENTS = new Set(['before', 'after']);

// ─── Pattern Reading (Effect pipeline) ────────────────────────

const readPatternFromFile = (
	filePath: string
): Effect.Effect<PatternDefinition | null, never, FileSystem.FileSystem> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const content = yield* fs
			.readFileString(filePath)
			.pipe(Effect.catch(() => Effect.succeed(null as string | null)));
		if (!content) return null;

		const fm = parseFrontmatter(content);
		if (!fm.name || !fm.pattern) return null;

		const level = ((fm.level as string) || 'info').toLowerCase();
		const action = ((fm.action as string) || 'context').toLowerCase();
		const detector = ((fm.detector as string) || 'regex').toLowerCase();
		const event = ((fm.event as string) || 'after').toLowerCase();

		if (!VALID_LEVELS.has(level)) {
			throw new Error(
				`Pattern "${fm
					.name as string}" has invalid level "${level}". ` +
					`Valid: ${[...VALID_LEVELS].join(', ')}`
			);
		}
		if (!VALID_ACTIONS.has(action)) {
			throw new Error(
				`Pattern "${fm
					.name as string}" has invalid action "${action}". ` +
					`Valid: ${[...VALID_ACTIONS].join(', ')}`
			);
		}
		if (!VALID_DETECTORS.has(detector)) {
			throw new Error(
				`Pattern "${fm
					.name as string}" has invalid detector "${detector}". ` +
					`Valid: ${[...VALID_DETECTORS].join(', ')}`
			);
		}
		if (!VALID_EVENTS.has(event)) {
			throw new Error(
				`Pattern "${fm
					.name as string}" has invalid event "${event}". ` +
					`Valid: ${[...VALID_EVENTS].join(', ')}`
			);
		}

		const result: PatternDefinition = {
			name: fm.name as string,
			description: (fm.description as string) || '',
			event,
			tool: (fm.tool as string) || '.*',
			pattern: fm.pattern as string,
			detector: detector as 'regex' | 'ast',
			action,
			level,
			matchInComments: fm.matchInComments === true,
			body: extractBody(content),
			filePath
		};
		if (typeof fm.glob === 'string') result.glob = fm.glob;
		if (typeof fm.inside === 'string') result.inside = fm.inside;
		return result;
	});

/** Recursively walk a directory and collect PatternDefinitions from .md files. */
const walkAndCollectPatterns = (
	dir: string
): Effect.Effect<
	PatternDefinition[],
	never,
	FileSystem.FileSystem | Path.Path
> => Effect.gen(function*() {
	const fs = yield* FileSystem.FileSystem;
	const p = yield* Path.Path;

	const dirExists = yield* fs
		.exists(dir)
		.pipe(Effect.catch(() => Effect.succeed(false)));
	if (!dirExists) return [];

	const entries = yield* fs
		.readDirectory(dir)
		.pipe(Effect.catch(() => Effect.succeed([] as string[])));

	const results: PatternDefinition[] = [];

	for (const entry of entries) {
		const fullPath = p.join(dir, entry);
		const info = yield* fs
			.stat(fullPath)
			.pipe(
				Effect.catch(() =>
					Effect.succeed(null as { type: string; } | null)
				)
			);
		if (!info) continue;

		if (info.type === 'Directory') {
			const subPatterns = yield* walkAndCollectPatterns(fullPath);
			results.push(...subPatterns);
		} else if (
			entry.endsWith('.md') &&
			!entry.startsWith('CLAUDE') &&
			!entry.startsWith('README')
		) {
			const pattern = yield* readPatternFromFile(fullPath);
			if (pattern) results.push(pattern);
		}
	}

	return results;
});

// ─── Module-level Pattern Loading ─────────────────────────────

// Pre-load all patterns at module level using top-level await.
// Single Effect.runPromise call: resolves services, walks directories,
// reads and parses every pattern file.
const _allPatterns = await Effect.runPromise(
	Effect.gen(function*() {
		const p = yield* Path.Path;
		const patternsDir = p.join(
			import.meta.dirname ?? '.',
			'..',
			'patterns'
		);
		return yield* walkAndCollectPatterns(patternsDir);
	}).pipe(Effect.provide(BunServices.layer))
);

const findPatternByName = (name: string): PatternDefinition | null => {
	return _allPatterns.find((p) => p.name === name) ?? null;
};

// ─── Test Helpers ─────────────────────────────────────────────

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

// ─── Test Builders ────────────────────────────────────────────

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
