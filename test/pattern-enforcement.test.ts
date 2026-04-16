/**
 * Regression tests for post-write pattern feedback policy.
 *
 * Pattern matches should never block writes directly. Instead they are
 * emitted as immediate review feedback after the write completes.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { projectToolOutputInput } from '../src/inspectors.ts';
import { getPatterns, matches } from '../src/patterns.ts';
import {
	buildPatternFeedbackMessage,
	selectPatternFeedback
} from '../src/policy.ts';

const patterns = getPatterns();

const findPattern = (name: string) => {
	const pattern = patterns.find((candidate) => candidate.name === name);
	if (!pattern) {
		throw new Error(`Pattern not found: ${name}`);
	}
	return pattern;
};

const withTempFile = <A>(
	content: string,
	run: (fixture: { readonly cwd: string; readonly filePath: string; }) => A
): A => {
	const cwd = fs.mkdtempSync(
		path.join(os.tmpdir(), 'pi-effect-enforcer-patterns-')
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

const projectEdit = (
	cwd: string,
	filePath: string,
	edits: ReadonlyArray<
		{ readonly oldText: string; readonly newText: string; }
	>
) => projectToolOutputInput('edit', { path: filePath, edits }, cwd) as Record<
	string,
	unknown
>;

const matchesNamedPattern = (
	name: string,
	input: Record<string, unknown>
): boolean => {
	const pattern = findPattern(name);
	return matches('edit', input, pattern.event, pattern);
};

describe('pattern feedback policy', () => {
	it('has at least one pattern', () => {
		expect(patterns.length).toBeGreaterThan(0);
	});

	it('treats all patterns as post-write context feedback', () => {
		expect(patterns.every((pattern) => pattern.action === 'context')).toBe(
			true
		);
		expect(patterns.every((pattern) => pattern.event === 'after')).toBe(
			true
		);
	});

	it('has no remaining blocking ask/deny patterns', () => {
		expect(
			patterns.some(
				(pattern) =>
					pattern.action === 'ask' || pattern.action === 'deny'
			)
		).toBe(false);
	});
});

describe('selectPatternFeedback', () => {
	it('returns matched patterns sorted by severity', () => {
		const result = selectPatternFeedback([
			findPattern('avoid-any'),
			findPattern('avoid-react-hooks'),
			findPattern('throw-in-effect-gen')
		]);
		expect(result.map((pattern) => pattern.name)).toEqual([
			'throw-in-effect-gen',
			'avoid-react-hooks',
			'avoid-any'
		]);
	});

	it('returns an empty array when nothing matched', () => {
		expect(selectPatternFeedback([])).toEqual([]);
	});
});

describe('buildPatternFeedbackMessage', () => {
	it('builds a review-oriented message that permits intentional exceptions', () => {
		const message = buildPatternFeedbackMessage(
			[findPattern('avoid-any'), findPattern('throw-in-effect-gen')],
			'src/example.ts'
		);

		expect(message).toContain('pi-effect-enforcer review request:');
		expect(message).toContain('File: `src/example.ts`');
		expect(message).toContain(
			'If you believe it is a false positive or an intentional exception, briefly say so and continue with your work.'
		);
		expect(message.indexOf('throw-in-effect-gen')).toBeLessThan(
			message.indexOf('avoid-any')
		);
	});
});

describe('prospective output pattern matching', () => {
	it('does not match avoid-node-imports when node imports are being removed', () => {
		withTempFile(
			"import * as fs from 'node:fs';\nexport const value = 1;\n",
			({ cwd, filePath }) => {
				const projected = projectEdit(cwd, filePath, [
					{
						oldText: "import * as fs from 'node:fs';",
						newText: "import { FileSystem } from 'effect';"
					}
				]);
				expect(matchesNamedPattern('avoid-node-imports', projected))
					.toBe(
						false
					);
			}
		);
	});

	it('does not match avoid-react-hooks when hooks are being removed', () => {
		withTempFile(
			[
				"import { useState } from 'react';",
				'const Component = () => {',
				'\tconst [count, setCount] = useState(0);',
				'\treturn count;',
				'};'
			].join('\n'),
			({ cwd, filePath }) => {
				const projected = projectEdit(cwd, filePath, [
					{
						oldText: '\tconst [count, setCount] = useState(0);',
						newText: '\tconst count = vm.count;'
					}
				]);
				expect(matchesNamedPattern('avoid-react-hooks', projected))
					.toBe(
						false
					);
			}
		);
	});

	it('does not match avoid-direct-json when JSON.parse is being removed', () => {
		withTempFile(
			'const parsed = JSON.parse(raw);\n',
			({ cwd, filePath }) => {
				const projected = projectEdit(cwd, filePath, [
					{
						oldText: 'const parsed = JSON.parse(raw);',
						newText: 'const parsed = raw;'
					}
				]);
				expect(matchesNamedPattern('avoid-direct-json', projected))
					.toBe(
						false
					);
			}
		);
	});

	it('matches avoid-node-imports when node imports are added', () => {
		withTempFile('export const value = 1;\n', ({ cwd, filePath }) => {
			const projected = projectEdit(cwd, filePath, [
				{
					oldText: 'export const value = 1;',
					newText:
						"import * as fs from 'node:fs';\nexport const value = fs.readFileSync('value.txt', 'utf8');"
				}
			]);
			expect(matchesNamedPattern('avoid-node-imports', projected)).toBe(
				true
			);
		});
	});

	it('matches avoid-react-hooks when hooks are added', () => {
		withTempFile('const Component = () => 1;\n', ({ cwd, filePath }) => {
			const projected = projectEdit(cwd, filePath, [
				{
					oldText: 'const Component = () => 1;',
					newText:
						'const Component = () => {\n\tconst [count, setCount] = useState(0);\n\treturn count;\n};'
				}
			]);
			expect(matchesNamedPattern('avoid-react-hooks', projected)).toBe(
				true
			);
		});
	});

	it('matches avoid-direct-json when JSON.parse is added', () => {
		withTempFile('const parsed = raw;\n', ({ cwd, filePath }) => {
			const projected = projectEdit(cwd, filePath, [
				{
					oldText: 'const parsed = raw;',
					newText: 'const parsed = JSON.parse(raw);'
				}
			]);
			expect(matchesNamedPattern('avoid-direct-json', projected)).toBe(
				true
			);
		});
	});
});
