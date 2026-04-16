/**
 * Regression tests for the Effect skill gate's prospective-output matching.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EFFECT_CODE_RE } from '../src/constants.ts';
import { projectToolOutputInput } from '../src/inspectors.ts';

const withTempFile = <A>(
	content: string,
	run: (fixture: { readonly cwd: string; readonly filePath: string; }) => A
): A => {
	const cwd = fs.mkdtempSync(
		path.join(os.tmpdir(), 'pi-effect-enforcer-skill-gate-')
	);
	const filePath = 'src/program.ts';
	const absolutePath = path.join(cwd, filePath);
	fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
	fs.writeFileSync(absolutePath, content, 'utf8');

	try {
		return run({ cwd, filePath });
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
};

const contentMatchesEffectCode = (content?: string): boolean =>
	typeof content === 'string' && EFFECT_CODE_RE.test(content);

describe('prospective Effect skill-gate projection', () => {
	it('does not trigger when Effect code is being removed', () => {
		withTempFile(
			"import { Effect } from 'effect';\nexport const program = Effect.succeed(1);\n",
			({ cwd, filePath }) => {
				const projection = projectToolOutputInput(
					'edit',
					{
						path: filePath,
						edits: [
							{
								oldText:
									"import { Effect } from 'effect';\nexport const program = Effect.succeed(1);",
								newText: 'export const program = 1;'
							}
						]
					},
					cwd
				);

				expect(contentMatchesEffectCode(projection.content)).toBe(
					false
				);
			}
		);
	});

	it('does trigger when Effect code is being added', () => {
		withTempFile('export const program = 1;\n', ({ cwd, filePath }) => {
			const projection = projectToolOutputInput(
				'edit',
				{
					path: filePath,
					edits: [
						{
							oldText: 'export const program = 1;',
							newText:
								"import { Effect } from 'effect';\nexport const program = Effect.succeed(1);"
						}
					]
				},
				cwd
			);

			expect(contentMatchesEffectCode(projection.content)).toBe(true);
		});
	});

	it('still triggers when the reconstructed result still contains Effect code', () => {
		withTempFile(
			"import { Effect } from 'effect';\nexport const program = Effect.succeed(1);\n",
			({ cwd, filePath }) => {
				const projection = projectToolOutputInput(
					'edit',
					{
						path: filePath,
						edits: [
							{
								oldText: 'Effect.succeed(1)',
								newText: 'Effect.succeed(2)'
							}
						]
					},
					cwd
				);

				expect(contentMatchesEffectCode(projection.content)).toBe(true);
			}
		);
	});
});
