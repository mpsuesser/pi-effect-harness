import { MIN_EFFECT_SKILLS } from './constants.ts';
import type { PatternDefinition } from './patterns.ts';
import { bodyWithSkillHints, sortByLevel } from './patterns.ts';

const EFFECT_REFERENCE_HINTS = [
	'.references/effect-v4/LLMS.md',
	'.references/effect-v4/MIGRATION.md',
	'.references/effect-v4/packages/effect/SCHEMA.md',
	'.references/effect-v4/packages/effect/HTTPAPI.md',
	'.references/effect-v4/packages/effect/src/'
] as const;

export const buildPolicyHeader = (
	loadedSkills: ReadonlySet<string>
): string => {
	const loadedCount = loadedSkills.size;
	const preview = [...loadedSkills].sort().slice(0, MIN_EFFECT_SKILLS);
	const remaining = Math.max(0, loadedCount - preview.length);
	const loadedPreview = loadedCount === 0
		? 'none'
		: remaining > 0
		? `${preview.join(', ')} (+${String(remaining)} more)`
		: preview.join(', ');

	return [
		'pi-effect-enforcer policy:',
		`- Before planning or writing Effect code, read at least ${
			String(MIN_EFFECT_SKILLS)
		} relevant effect-* skills. Loaded on this branch: ${
			String(loadedCount)
		}/${String(MIN_EFFECT_SKILLS)} (${loadedPreview}).`,
		'- If any Effect v4 API is unclear, read from the local Effect reference clone instead of guessing.',
		`- Key reference paths: ${EFFECT_REFERENCE_HINTS.join(', ')}.`
	].join('\n');
};

export const buildSkillGateReason = (loadedCount: number): string => {
	const missing = Math.max(0, MIN_EFFECT_SKILLS - loadedCount);
	return [
		`pi-effect-enforcer blocked this write because it looks like Effect code and only ${
			String(loadedCount)
		}/${
			String(MIN_EFFECT_SKILLS)
		} required effect-* skills have been read on this branch.`,
		`Read at least ${
			String(missing)
		} more relevant effect-* skill files before writing Effect code.`,
		'If an API is unclear, read from .references/effect-v4/ before continuing.'
	].join(' ');
};

export interface BlockingPatternDecision {
	readonly action: 'ask' | 'deny';
	readonly patterns: ReadonlyArray<PatternDefinition>;
}

export const selectBlockingPatterns = (
	patterns: ReadonlyArray<PatternDefinition>
): BlockingPatternDecision | null => {
	const denyPatterns = sortByLevel(
		patterns.filter((pattern) => pattern.action === 'deny')
	);
	if (denyPatterns.length > 0) {
		return {
			action: 'deny',
			patterns: denyPatterns
		};
	}

	const askPatterns = sortByLevel(
		patterns.filter((pattern) => pattern.action === 'ask')
	);
	if (askPatterns.length > 0) {
		return {
			action: 'ask',
			patterns: askPatterns
		};
	}

	return null;
};

const buildBlockingReason = (
	action: 'ask' | 'deny',
	patterns: ReadonlyArray<PatternDefinition>
): string => {
	const matchedPatterns = patterns.map(
		(pattern) =>
			`- ${pattern.name} [${pattern.level}]: ${pattern.description}`
	);
	const guidance = patterns.map(
		(pattern) => `## ${pattern.name}\n${bodyWithSkillHints(pattern)}`
	);

	const intro = action === 'deny'
		? 'pi-effect-enforcer denied this write because it matched prohibited patterns. Rewrite the change to comply before retrying.'
		: 'pi-effect-enforcer blocked this write so you can revise it before writing. Update the change to address the matched patterns, then retry.';

	return [
		intro,
		'',
		'Matched patterns:',
		...matchedPatterns,
		'',
		'Relevant guidance:',
		...guidance
	].join('\n');
};

export const buildAskReason = (
	patterns: ReadonlyArray<PatternDefinition>
): string => buildBlockingReason('ask', patterns);

export const buildDenyReason = (
	patterns: ReadonlyArray<PatternDefinition>
): string => buildBlockingReason('deny', patterns);
