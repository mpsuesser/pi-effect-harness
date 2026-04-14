import { MIN_EFFECT_SKILLS } from './constants.ts';
import type { PatternDefinition } from './patterns.ts';
import { bodyWithSkillHints } from './patterns.ts';

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
	const loadedPreview =
		loadedCount === 0
			? 'none'
			: remaining > 0
				? `${preview.join(', ')} (+${String(remaining)} more)`
				: preview.join(', ');

	return [
		'pi-effect-enforcer policy:',
		`- Before planning or writing Effect code, read at least ${String(MIN_EFFECT_SKILLS)} relevant effect-* skills. Loaded on this branch: ${String(loadedCount)}/${String(MIN_EFFECT_SKILLS)} (${loadedPreview}).`,
		'- If any Effect v4 API is unclear, read from the local Effect reference clone instead of guessing.',
		`- Key reference paths: ${EFFECT_REFERENCE_HINTS.join(', ')}.`
	].join('\n');
};

export const buildSkillGateReason = (loadedCount: number): string => {
	const missing = Math.max(0, MIN_EFFECT_SKILLS - loadedCount);
	return [
		`pi-effect-enforcer blocked this write because it looks like Effect code and only ${String(loadedCount)}/${String(MIN_EFFECT_SKILLS)} required effect-* skills have been read on this branch.`,
		`Read at least ${String(missing)} more relevant effect-* skill files before writing Effect code.`,
		'If an API is unclear, read from .references/effect-v4/ before continuing.'
	].join(' ');
};

export const buildPatternBlock = (
	tag: 'pattern-warning' | 'code-smell',
	pattern: PatternDefinition
): string => {
	return `<${tag} name="${pattern.name}" level="${pattern.level}">\n${bodyWithSkillHints(pattern)}\n</${tag}>`;
};

export const buildDenyReason = (pattern: PatternDefinition): string => {
	return `[DENIED] ${pattern.name}: ${pattern.description}\n\n${bodyWithSkillHints(pattern)}`;
};
