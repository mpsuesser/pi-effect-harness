/**
 * Regression tests for prospective tool output projection.
 *
 * Policy decisions should be based on the would-be file contents, not a
 * mixed blob of deleted and inserted edit text.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	projectToolOutputInput,
	projectToolResultInput
} from '../src/inspectors.ts';

const withTempFile = <A>(
	content: string,
	run: (fixture: { readonly cwd: string; readonly filePath: string; }) => A
): A => {
	const cwd = fs.mkdtempSync(
		path.join(os.tmpdir(), 'pi-effect-enforcer-inspectors-')
	);
	const filePath = 'src/app.ts';
	const absolutePath = path.join(cwd, filePath);
	fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
	fs.writeFileSync(absolutePath, content, 'utf8');

	try {
		return run({ cwd, filePath });
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
};

const getContent = (projection: { readonly content?: string; }): string =>
	projection.content ?? '';

describe('projectToolOutputInput', () => {
	it('projects write content exactly as the prospective output', () => {
		const projection = projectToolOutputInput(
			'write',
			{
				path: 'src/new-file.ts',
				content: 'export const value = 1;\n'
			},
			process.cwd()
		);

		expect(projection.filePath).toBe('src/new-file.ts');
		expect(projection.content).toBe('export const value = 1;\n');
	});

	it('reconstructs single-edit output from the current file contents', () => {
		withTempFile('const value = 1;\n', ({ cwd, filePath }) => {
			const projection = projectToolOutputInput(
				'edit',
				{
					path: filePath,
					edits: [{
						oldText: 'const value = 1;',
						newText: 'const value = 2;'
					}]
				},
				cwd
			);

			expect(projection.filePath).toBe(filePath);
			expect(projection.content).toBe('const value = 2;\n');
		});
	});

	it('reconstructs multiple edits against the original file, not incrementally', () => {
		withTempFile('const a = 1;\nconst b = 2;\n', ({ cwd, filePath }) => {
			const projection = projectToolOutputInput(
				'edit',
				{
					path: filePath,
					edits: [
						{ oldText: 'const a = 1;', newText: 'const a = 10;' },
						{ oldText: 'const b = 2;', newText: 'const b = 20;' }
					]
				},
				cwd
			);

			expect(projection.content).toBe('const a = 10;\nconst b = 20;\n');
		});
	});

	it('does not include deleted text when removing a violating construct', () => {
		withTempFile(
			'const parsed = JSON.parse(raw);\n',
			({ cwd, filePath }) => {
				const projection = projectToolOutputInput(
					'edit',
					{
						path: filePath,
						edits: [
							{
								oldText: 'const parsed = JSON.parse(raw);',
								newText: 'const parsed = raw;'
							}
						]
					},
					cwd
				);

				expect(getContent(projection)).toContain('const parsed = raw;');
				expect(getContent(projection)).not.toContain('JSON.parse');
			}
		);
	});

	it('falls back to new text only when the target file cannot be read', () => {
		const projection = projectToolOutputInput(
			'edit',
			{
				path: 'src/missing.ts',
				edits: [{
					oldText: 'const value = 1;',
					newText: 'const value = 2;'
				}]
			},
			path.join(process.cwd(), 'definitely-missing-directory')
		);

		expect(projection.filePath).toBe('src/missing.ts');
		expect(projection.content).toBe('const value = 2;');
	});

	it('falls back to new text only when oldText is ambiguous', () => {
		withTempFile(
			'const value = 1;\nconst value = 1;\n',
			({ cwd, filePath }) => {
				const projection = projectToolOutputInput(
					'edit',
					{
						path: filePath,
						edits: [{
							oldText: 'const value = 1;',
							newText: 'const value = 2;'
						}]
					},
					cwd
				);

				expect(projection.content).toBe('const value = 2;');
				expect(getContent(projection)).not.toContain(
					'const value = 1;'
				);
			}
		);
	});

	it('falls back to new text only when edit spans would overlap', () => {
		withTempFile('const abc = 1;\n', ({ cwd, filePath }) => {
			const projection = projectToolOutputInput(
				'edit',
				{
					path: filePath,
					edits: [
						{ oldText: 'abc', newText: 'xyz' },
						{ oldText: 'const abc', newText: 'const def' }
					]
				},
				cwd
			);

			expect(projection.content).toBe('xyz\nconst def');
			expect(getContent(projection)).not.toContain('const abc = 1;');
		});
	});
});

describe('projectToolResultInput', () => {
	it('reads the actual file contents after a successful edit result', () => {
		withTempFile(
			"import { Effect } from 'effect';\nexport const program = Effect.succeed(2);\n",
			({ cwd, filePath }) => {
				const projection = projectToolResultInput(
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

				expect(projection.content).toBe(
					"import { Effect } from 'effect';\nexport const program = Effect.succeed(2);\n"
				);
			}
		);
	});
});
