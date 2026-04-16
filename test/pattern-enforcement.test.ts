/**
 * Regression tests for post-write pattern feedback policy.
 *
 * Pattern matches should never block writes directly. Instead they are
 * emitted as immediate review feedback after the write completes.
 */

import { describe, expect, it } from 'vitest';

import { getPatterns } from '../src/patterns.ts';
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
