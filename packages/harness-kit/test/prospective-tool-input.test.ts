/**
 * Regression tests for prospective tool output projection.
 *
 * Policy decisions should be based on the would-be file contents, not a
 * mixed blob of deleted and inserted edit text.
 */

import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';

import { EditReplacement } from '../src/EditReplacement.ts';
import { WriteIntent } from '../src/WriteIntent.ts';
import {
	projectActualEffect,
	projectProspectiveEffect,
	withTempFile
} from './helpers/kernel.ts';

const contentOf = (projection: { readonly content: Option.Option<string>; }) =>
	Option.getOrElse(projection.content, () => '');

const filePathOf = (
	projection: { readonly filePath: Option.Option<string>; }
) => Option.getOrElse(projection.filePath, () => '');

const editIntent = (
	filePath: string,
	edits: ReadonlyArray<
		{ readonly oldText: string; readonly newText: string; }
	>,
	phase: 'tool_call' | 'tool_result' = 'tool_call'
) => new WriteIntent.EditFile({
	phase,
	filePath,
	replacements: edits.map(
		(edit) => new EditReplacement.Value(edit)
	)
});

const writeIntent = (
	filePath: string,
	content: string,
	phase: 'tool_call' | 'tool_result' = 'tool_call'
) => new WriteIntent.WriteFile({ phase, filePath, content });

describe('WriteProjection.prospective', () => {
	it.live('projects write content exactly as the prospective output', () =>
		Effect.gen(function*() {
			const projection = yield* projectProspectiveEffect(
				process.cwd(),
				writeIntent('src/new-file.ts', 'export const value = 1;\n')
			);

			expect(filePathOf(projection)).toBe('src/new-file.ts');
			expect(contentOf(projection)).toBe('export const value = 1;\n');
		}));

	it.live('reconstructs single-edit output from the current file contents', () =>
		withTempFile(
			'pi-harness-kit-inspectors-',
			'src/app.ts',
			'const value = 1;\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projection = yield* projectProspectiveEffect(
						cwd,
						editIntent(filePath, [
							{
								oldText: 'const value = 1;',
								newText: 'const value = 2;'
							}
						])
					);

					expect(filePathOf(projection)).toBe(filePath);
					expect(contentOf(projection)).toBe('const value = 2;\n');
				})
		));

	it.live(
		'reconstructs multiple edits against the original file, not incrementally',
		() =>
			withTempFile(
				'pi-harness-kit-inspectors-',
				'src/app.ts',
				'const a = 1;\nconst b = 2;\n',
				({ cwd, filePath }) =>
					Effect.gen(function*() {
						const projection = yield* projectProspectiveEffect(
							cwd,
							editIntent(filePath, [
								{
									oldText: 'const a = 1;',
									newText: 'const a = 10;'
								},
								{
									oldText: 'const b = 2;',
									newText: 'const b = 20;'
								}
							])
						);

						expect(contentOf(projection)).toBe(
							'const a = 10;\nconst b = 20;\n'
						);
					})
			)
	);

	it.live('does not include deleted text when removing a violating construct', () =>
		withTempFile(
			'pi-harness-kit-inspectors-',
			'src/app.ts',
			'const parsed = JSON.parse(raw);\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projection = yield* projectProspectiveEffect(
						cwd,
						editIntent(filePath, [
							{
								oldText: 'const parsed = JSON.parse(raw);',
								newText: 'const parsed = raw;'
							}
						])
					);

					expect(contentOf(projection)).toContain(
						'const parsed = raw;'
					);
					expect(contentOf(projection)).not.toContain('JSON.parse');
				})
		));

	it.live('falls back to new text only when the target file cannot be read', () =>
		Effect.gen(function*() {
			const projection = yield* projectProspectiveEffect(
				`${process.cwd()}/definitely-missing-directory`,
				editIntent('src/missing.ts', [
					{ oldText: 'const value = 1;', newText: 'const value = 2;' }
				])
			);

			expect(filePathOf(projection)).toBe('src/missing.ts');
			expect(contentOf(projection)).toBe('const value = 2;');
		}));

	it.live('falls back to new text only when oldText is ambiguous', () =>
		withTempFile(
			'pi-harness-kit-inspectors-',
			'src/app.ts',
			'const value = 1;\nconst value = 1;\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projection = yield* projectProspectiveEffect(
						cwd,
						editIntent(filePath, [
							{
								oldText: 'const value = 1;',
								newText: 'const value = 2;'
							}
						])
					);

					expect(contentOf(projection)).toBe('const value = 2;');
					expect(contentOf(projection)).not.toContain(
						'const value = 1;'
					);
				})
		));

	it.live('falls back to new text only when edit spans would overlap', () =>
		withTempFile(
			'pi-harness-kit-inspectors-',
			'src/app.ts',
			'const abc = 1;\n',
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projection = yield* projectProspectiveEffect(
						cwd,
						editIntent(filePath, [
							{ oldText: 'abc', newText: 'xyz' },
							{ oldText: 'const abc', newText: 'const def' }
						])
					);

					expect(contentOf(projection)).toBe('xyz\nconst def');
					expect(contentOf(projection)).not.toContain(
						'const abc = 1;'
					);
				})
		));
});

describe('WriteProjection.actual', () => {
	it.live('reads the actual file contents after a successful edit result', () =>
		withTempFile(
			'pi-harness-kit-inspectors-',
			'src/app.ts',
			"import { Effect } from 'effect';\nexport const program = Effect.succeed(2);\n",
			({ cwd, filePath }) =>
				Effect.gen(function*() {
					const projection = yield* projectActualEffect(
						cwd,
						editIntent(
							filePath,
							[
								{
									oldText: 'Effect.succeed(1)',
									newText: 'Effect.succeed(2)'
								}
							],
							'tool_result'
						)
					);

					expect(contentOf(projection)).toBe(
						"import { Effect } from 'effect';\nexport const program = Effect.succeed(2);\n"
					);
				})
		));
});
