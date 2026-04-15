/**
 * Regression tests for blocking pattern policy.
 *
 * High-signal patterns should stop a write immediately so the agent can
 * revise the change before it lands on disk.
 */

import { describe, expect, it } from 'vitest';

import { getPatterns } from '../src/patterns.ts';
import { selectBlockingPatterns } from '../src/policy.ts';

const patterns = getPatterns();

const findPattern = (name: string) => {
	const pattern = patterns.find((candidate) => candidate.name === name);
	if (!pattern) {
		throw new Error(`Pattern not found: ${name}`);
	}
	return pattern;
};

describe('pattern action policy', () => {
	it('has at least one ask pattern and one deny pattern', () => {
		expect(patterns.some((pattern) => pattern.action === 'ask')).toBe(true);
		expect(patterns.some((pattern) => pattern.action === 'deny')).toBe(
			true
		);
	});

	it('treats critical patterns as deny patterns', () => {
		const criticalPatterns = patterns.filter(
			(pattern) => pattern.level === 'critical'
		);
		expect(criticalPatterns.length).toBeGreaterThan(0);
		expect(
			criticalPatterns.every((pattern) => pattern.action === 'deny')
		).toBe(true);
	});

	it('treats high-severity patterns as blocking ask/deny patterns', () => {
		const highPatterns = patterns.filter((pattern) =>
			pattern.level === 'high'
		);
		expect(highPatterns.length).toBeGreaterThan(0);
		expect(
			highPatterns.every(
				(pattern) =>
					pattern.action === 'ask' || pattern.action === 'deny'
			)
		).toBe(true);
	});

	it('treats warning patterns as ask patterns, not hidden context', () => {
		const warningPatterns = patterns.filter(
			(pattern) => pattern.level === 'warning'
		);
		expect(warningPatterns.length).toBeGreaterThan(0);
		expect(
			warningPatterns.every((pattern) => pattern.action === 'ask')
		).toBe(true);
	});

	it('treats info patterns as ask patterns too', () => {
		const infoPatterns = patterns.filter((pattern) =>
			pattern.level === 'info'
		);
		expect(infoPatterns.length).toBeGreaterThan(0);
		expect(infoPatterns.every((pattern) => pattern.action === 'ask')).toBe(
			true
		);
	});

	it('has no remaining context-only patterns', () => {
		expect(patterns.some((pattern) => pattern.action === 'context')).toBe(
			false
		);
	});

	it('has no after-only patterns', () => {
		expect(patterns.some((pattern) => pattern.event === 'after')).toBe(
			false
		);
	});
});

describe('selectBlockingPatterns', () => {
	it('prioritizes deny patterns over ask/context patterns', () => {
		const result = selectBlockingPatterns([
			findPattern('avoid-any'),
			findPattern('avoid-react-hooks'),
			findPattern('throw-in-effect-gen')
		]);
		expect(result?.action).toBe('deny');
		expect(result?.patterns.map((pattern) => pattern.name)).toEqual([
			'throw-in-effect-gen'
		]);
	});

	it('returns all ask patterns when no deny patterns match', () => {
		const result = selectBlockingPatterns([
			findPattern('avoid-any'),
			findPattern('avoid-sync-fs')
		]);
		expect(result?.action).toBe('ask');
		expect(result?.patterns.map((pattern) => pattern.name)).toEqual([
			'avoid-sync-fs',
			'avoid-any'
		]);
	});

	it('returns null when no patterns match', () => {
		const result = selectBlockingPatterns([]);
		expect(result).toBeNull();
	});
});
