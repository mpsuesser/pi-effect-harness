/**
 * Test harness for pattern definitions.
 *
 * `testPattern` exercises detector logic only, matching the historical test
 * semantics. `testFilePathPattern` exercises the full live matcher including
 * glob constraints.
 */

import { Lang, parse } from '@ast-grep/napi';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Option, Schema } from 'effect';

import { MatcherInput } from 'pi-harness-kit/kernel/MatcherInput.ts';
import {
	matchesPattern,
	stripComments
} from 'pi-harness-kit/kernel/services/PatternMatcher.ts';
import { Pattern } from 'pi-harness-kit/Pattern.ts';
import { loadPatternsEffect } from './kernel.ts';

class MissingPattern extends Schema.TaggedErrorClass<MissingPattern>()(
	'MissingPattern',
	{
		name: Schema.String
	}
) {}

const preview = (value: string): string =>
	value.replaceAll('\n', '\\n').slice(0, 80);

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

const projection = (content: string, filePath = 'src/app.ts') =>
	new MatcherInput.Value({
		filePath: Option.some(filePath),
		content: Option.some(content),
		command: Option.none(),
		pattern: Option.none(),
		query: Option.none(),
		url: Option.none(),
		prompt: Option.none()
	});

const matchesDetector = (pattern: Pattern.Value, input: string): boolean => {
	if (pattern.detector instanceof Pattern.AstDetector) {
		const detector = pattern.detector;
		const root = parse(Lang.TypeScript, input).root();
		return detector.patterns.some((candidate) => {
			const nodes = detector.inside === undefined
				? root.findAll(candidate)
				: root.findAll({
					rule: {
						pattern: candidate,
						inside: {
							pattern: detector.inside,
							stopBy: 'end'
						}
					}
				});
			return nodes.length > 0;
		});
	}

	const source = pattern.detector.matchInComments
		? input
		: stripComments(input);
	return new RegExp(pattern.detector.pattern).test(source);
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
		it.live('should load pattern definition', () =>
			Effect.gen(function*() {
				const pattern = yield* requirePatternEffect(opts.name);
				expect(pattern.name).toBe(opts.name);
			}));

		describe('shouldMatch', () => {
			opts.shouldMatch.forEach((input) => {
				it.live(`should match: ${preview(input)}`, () =>
					Effect.gen(function*() {
						const pattern = yield* requirePatternEffect(opts.name);
						expect(matchesDetector(pattern, input)).toBe(true);
					}));
			});
		});

		describe('shouldNotMatch', () => {
			opts.shouldNotMatch.forEach((input) => {
				it.live(`should NOT match: ${preview(input)}`, () =>
					Effect.gen(function*() {
						const pattern = yield* requirePatternEffect(opts.name);
						expect(matchesDetector(pattern, input)).toBe(false);
					}));
			});
		});
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
		it.live('should load pattern definition', () =>
			Effect.gen(function*() {
				const pattern = yield* requirePatternEffect(opts.name);
				expect(pattern.name).toBe(opts.name);
			}));

		describe('shouldMatch', () => {
			opts.shouldMatch.forEach(({ code, filePath }) => {
				it.live(`should match code=${preview(code)} in file=${filePath}`, () =>
					Effect.gen(function*() {
						const pattern = yield* requirePatternEffect(opts.name);
						expect(
							matchesPattern(
								'write',
								projection(code, filePath),
								pattern.event,
								pattern
							)
						).toBe(true);
					}));
			});
		});

		describe('shouldNotMatch', () => {
			opts.shouldNotMatch.forEach(({ code, filePath }) => {
				it.live(
					`should NOT match code=${
						preview(code)
					} in file=${filePath}`,
					() =>
						Effect.gen(function*() {
							const pattern = yield* requirePatternEffect(
								opts.name
							);
							expect(
								matchesPattern(
									'write',
									projection(code, filePath),
									pattern.event,
									pattern
								)
							).toBe(false);
						})
				);
			});
		});
	});
};

export { stripComments };
