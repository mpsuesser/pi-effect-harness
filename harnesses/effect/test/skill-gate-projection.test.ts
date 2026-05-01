/**
 * Regression tests for the Effect skill gate's prospective-output matching.
 */

import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';

import { EditReplacement } from 'pi-harness-kit/EditReplacement.ts';
import { WriteIntent } from 'pi-harness-kit/WriteIntent.ts';
import { EFFECT_CODE_RE } from '../src/constants.ts';
import { projectProspectiveEffect, withTempFile } from './helpers/kernel.ts';

const contentMatchesEffectCode = (content: Option.Option<string>): boolean =>
	Option.match(content, {
		onNone: () => false,
		onSome: (value) => EFFECT_CODE_RE.test(value)
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

describe('prospective Effect skill-gate projection', () => {
	it.live('does not trigger when Effect code is being removed', () =>
		withTempFile(
			'pi-effect-harness-skill-gate-',
			'src/program.ts',
			"import { Effect } from 'effect';\nexport const program = Effect.succeed(1);\n",
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projection = yield* projectProspectiveEffect(
						cwd,
						editIntent(filePath, [
							{
								oldText:
									"import { Effect } from 'effect';\nexport const program = Effect.succeed(1);",
								newText: 'export const program = 1;'
							}
						])
					);

					expect(contentMatchesEffectCode(projection.content)).toBe(
						false
					);
				})
		));

	it.live('does trigger when Effect code is being added', () =>
		withTempFile(
			'pi-effect-harness-skill-gate-',
			'src/program.ts',
			'export const program = 1;\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projection = yield* projectProspectiveEffect(
						cwd,
						editIntent(filePath, [
							{
								oldText: 'export const program = 1;',
								newText:
									"import { Effect } from 'effect';\nexport const program = Effect.succeed(1);"
							}
						])
					);

					expect(contentMatchesEffectCode(projection.content)).toBe(
						true
					);
				})
		));

	it.live('still triggers when the reconstructed result still contains Effect code', () =>
		withTempFile(
			'pi-effect-harness-skill-gate-',
			'src/program.ts',
			"import { Effect } from 'effect';\nexport const program = Effect.succeed(1);\n",
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projection = yield* projectProspectiveEffect(
						cwd,
						editIntent(filePath, [
							{
								oldText: 'Effect.succeed(1)',
								newText: 'Effect.succeed(2)'
							}
						])
					);

					expect(contentMatchesEffectCode(projection.content)).toBe(
						true
					);
				})
		));
});
