/**
 * Regression tests for post-write pattern feedback policy.
 *
 * Pattern matches should never block writes directly. Instead they are
 * emitted as immediate review feedback after the write completes.
 */

import { describe, expect, it } from '@effect/vitest';
import { Effect, Option, Schema } from 'effect';

import { EditReplacement } from 'pi-harness-kit/EditReplacement.ts';
import { matchesPattern } from 'pi-harness-kit/kernel/services/PatternMatcher.ts';
import { WriteIntent } from 'pi-harness-kit/WriteIntent.ts';
import {
	buildPatternFeedbackMessage,
	selectPatternFeedback
} from '../src/services/GuidanceCatalog.ts';
import {
	loadPatternRulesEffect,
	loadPatternsEffect,
	projectProspectiveEffect,
	withTempFile
} from './helpers/kernel.ts';

class MissingPattern extends Schema.TaggedErrorClass<MissingPattern>()(
	'MissingPattern',
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

const editIntent = (
	filePath: string,
	edits: ReadonlyArray<
		{ readonly oldText: string; readonly newText: string; }
	>
) => new WriteIntent.EditFile({
	phase: 'tool_call',
	filePath,
	replacements: edits.map(
		(edit) => new EditReplacement.Value(edit)
	)
});

const projectEditEffect = (
	cwd: string,
	filePath: string,
	edits: ReadonlyArray<
		{ readonly oldText: string; readonly newText: string; }
	>
) => projectProspectiveEffect(cwd, editIntent(filePath, edits));

const matchesNamedPatternEffect = (
	name: string,
	projection: Parameters<typeof matchesPattern>[1]
) => Effect.gen(function*() {
	const pattern = yield* requirePatternEffect(name);
	return matchesPattern('edit', projection, pattern.event, pattern);
});

describe('pattern feedback policy', () => {
	it.live('has at least one pattern', () =>
		Effect.gen(function*() {
			expect((yield* loadPatternsEffect).length).toBeGreaterThan(0);
		}));

	it.live('treats all pattern rules as post-write feedback', () =>
		Effect.gen(function*() {
			const patterns = yield* loadPatternsEffect;
			const rules = yield* loadPatternRulesEffect;
			expect(patterns.every((pattern) => pattern.event === 'after')).toBe(
				true
			);
			expect(
				rules.every((rule) => rule.action === 'injectUserMessage')
			).toBe(true);
		}));

	it.live('has no remaining non-feedback rule actions', () =>
		Effect.gen(function*() {
			const rules = yield* loadPatternRulesEffect;
			expect(
				rules.some((rule) => rule.action !== 'injectUserMessage')
			).toBe(false);
		}));
});

describe('selectPatternFeedback', () => {
	it.live('returns matched patterns sorted by severity', () =>
		Effect.gen(function*() {
			const result = selectPatternFeedback([
				yield* requirePatternEffect('avoid-any'),
				yield* requirePatternEffect('avoid-react-hooks'),
				yield* requirePatternEffect('throw-in-effect-gen')
			]);
			expect(result.map((pattern) => pattern.name)).toEqual([
				'throw-in-effect-gen',
				'avoid-react-hooks',
				'avoid-any'
			]);
		}));

	it('returns an empty array when nothing matched', () => {
		expect(selectPatternFeedback([])).toEqual([]);
	});
});

describe('buildPatternFeedbackMessage', () => {
	it.live('builds a review-oriented message that permits intentional exceptions', () =>
		Effect.gen(function*() {
			const message = buildPatternFeedbackMessage(
				[
					yield* requirePatternEffect('avoid-any'),
					yield* requirePatternEffect('throw-in-effect-gen')
				],
				Option.some('src/example.ts')
			);

			expect(message).toContain('pi-effect-enforcer review request:');
			expect(message).toContain('File: `src/example.ts`');
			expect(message).toContain(
				'If you believe it is a false positive or an intentional exception, briefly say so and continue with your work.'
			);
			expect(message.indexOf('throw-in-effect-gen')).toBeLessThan(
				message.indexOf('avoid-any')
			);
		}));
});

describe('prospective output pattern matching', () => {
	it.live('does not match avoid-node-imports when node imports are being removed', () =>
		withTempFile(
			'pi-effect-enforcer-patterns-',
			'src/app.ts',
			"import * as fs from 'node:fs';\nexport const value = 1;\n",
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projected = yield* projectEditEffect(cwd, filePath, [
						{
							oldText: "import * as fs from 'node:fs';",
							newText: "import { FileSystem } from 'effect';"
						}
					]);
					expect(
						yield* matchesNamedPatternEffect(
							'avoid-node-imports',
							projected
						)
					).toBe(false);
				})
		));

	it.live('does not match avoid-react-hooks when hooks are being removed', () =>
		withTempFile(
			'pi-effect-enforcer-patterns-',
			'src/app.ts',
			[
				"import { useState } from 'react';",
				'const Component = () => {',
				'\tconst [count, setCount] = useState(0);',
				'\treturn count;',
				'};'
			].join('\n'),
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projected = yield* projectEditEffect(cwd, filePath, [
						{
							oldText: '\tconst [count, setCount] = useState(0);',
							newText: '\tconst count = vm.count;'
						}
					]);
					expect(
						yield* matchesNamedPatternEffect(
							'avoid-react-hooks',
							projected
						)
					).toBe(false);
				})
		));

	it.live('does not match avoid-direct-json when JSON.parse is being removed', () =>
		withTempFile(
			'pi-effect-enforcer-patterns-',
			'src/app.ts',
			'const parsed = JSON.parse(raw);\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projected = yield* projectEditEffect(cwd, filePath, [
						{
							oldText: 'const parsed = JSON.parse(raw);',
							newText: 'const parsed = raw;'
						}
					]);
					expect(
						yield* matchesNamedPatternEffect(
							'avoid-direct-json',
							projected
						)
					).toBe(false);
				})
		));

	it.live('matches avoid-node-imports when node imports are added', () =>
		withTempFile(
			'pi-effect-enforcer-patterns-',
			'src/app.ts',
			'export const value = 1;\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projected = yield* projectEditEffect(cwd, filePath, [
						{
							oldText: 'export const value = 1;',
							newText:
								"import * as fs from 'node:fs';\nexport const value = fs.readFileSync('value.txt', 'utf8');"
						}
					]);
					expect(
						yield* matchesNamedPatternEffect(
							'avoid-node-imports',
							projected
						)
					).toBe(true);
				})
		));

	it.live('matches avoid-react-hooks when hooks are added', () =>
		withTempFile(
			'pi-effect-enforcer-patterns-',
			'src/app.ts',
			'const Component = () => 1;\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projected = yield* projectEditEffect(cwd, filePath, [
						{
							oldText: 'const Component = () => 1;',
							newText:
								'const Component = () => {\n\tconst [count, setCount] = useState(0);\n\treturn count;\n};'
						}
					]);
					expect(
						yield* matchesNamedPatternEffect(
							'avoid-react-hooks',
							projected
						)
					).toBe(true);
				})
		));

	it.live('matches avoid-direct-json when JSON.parse is added', () =>
		withTempFile(
			'pi-effect-enforcer-patterns-',
			'src/app.ts',
			'const parsed = raw;\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projected = yield* projectEditEffect(cwd, filePath, [
						{
							oldText: 'const parsed = raw;',
							newText: 'const parsed = JSON.parse(raw);'
						}
					]);
					expect(
						yield* matchesNamedPatternEffect(
							'avoid-direct-json',
							projected
						)
					).toBe(true);
				})
		));
});
