import { Context, Effect, Layer, Match, Option, Order } from 'effect';
import { sort } from 'effect/Array';

import { Pattern } from '../../Pattern.ts';
import { MIN_EFFECT_SKILLS } from '../constants.ts';

const EFFECT_REFERENCE_HINTS = [
	'.references/effect-v4/LLMS.md',
	'.references/effect-v4/MIGRATION.md',
	'.references/effect-v4/packages/effect/SCHEMA.md',
	'.references/effect-v4/packages/effect/HTTPAPI.md',
	'.references/effect-v4/packages/effect/src/'
] as const;

const patternOrder = Order.mapInput(
	Order.Number,
	(pattern: Pattern.Value) =>
		Match.value(pattern.level).pipe(
			Match.when('critical', () => 0),
			Match.when('high', () => 1),
			Match.when('medium', () => 2),
			Match.when('warning', () => 3),
			Match.when('info', () => 4),
			Match.exhaustive
		)
);

const guidanceWithSkillHints = (pattern: Pattern.Value): string => {
	if (
		pattern.suggestedSkills === undefined ||
		pattern.suggestedSkills.length === 0
	) {
		return pattern.guidance;
	}

	const hints = pattern.suggestedSkills
		.map(
			(skill) =>
				`If you have not loaded the \`${skill}\` skill, you should load it before continuing.`
		)
		.join('\n');
	return `${pattern.guidance}\n\n${hints}`;
};

export const buildPolicyHeader = (
	loadedSkills: ReadonlySet<string>
): string => {
	const loadedCount = loadedSkills.size;
	const preview = sort([...loadedSkills], Order.String).slice(
		0,
		MIN_EFFECT_SKILLS
	);
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

export const selectPatternFeedback = (
	patterns: ReadonlyArray<Pattern.Value>
): ReadonlyArray<Pattern.Value> => sort([...patterns], patternOrder);

export const buildPatternFeedbackMessage = (
	patterns: ReadonlyArray<Pattern.Value>,
	filePath: Option.Option<string>
): string => {
	const selectedPatterns = selectPatternFeedback(patterns);
	const matchedPatterns = selectedPatterns.map(
		(pattern) =>
			`- ${pattern.name} [${pattern.level}]: ${pattern.description}`
	);
	const guidance = selectedPatterns.map(
		(pattern) => `## ${pattern.name}\n${guidanceWithSkillHints(pattern)}`
	);
	const pathLine = Option.match(filePath, {
		onNone: () => 'File: (path unavailable)',
		onSome: (value) => `File: \`${value}\``
	});
	return [
		'pi-effect-enforcer review request:',
		pathLine,
		'',
		'I noticed potential Effect-pattern issues in the write you just completed.',
		'Please inspect this change now.',
		'If the warning is valid, revise the code before continuing.',
		'If you believe it is a false positive or an intentional exception, briefly say so and continue with your work.',
		'',
		'Matched patterns:',
		...matchedPatterns,
		'',
		'Relevant guidance:',
		...guidance
	].join('\n');
};

export namespace GuidanceCatalog {
	export interface Interface {
		readonly policyHeader: (
			loadedSkills: ReadonlySet<string>
		) => Effect.Effect<string>;
		readonly skillGateReason: (
			loadedCount: number
		) => Effect.Effect<string>;
		readonly selectPatternFeedback: (
			patterns: ReadonlyArray<Pattern.Value>
		) => Effect.Effect<ReadonlyArray<Pattern.Value>>;
		readonly patternFeedbackMessage: (
			patterns: ReadonlyArray<Pattern.Value>,
			filePath: Option.Option<string>
		) => Effect.Effect<string>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-enforcer/effect/GuidanceCatalog'
	) {}

	export const layer = Layer.succeed(
		Service,
		Service.of({
			policyHeader: (loadedSkills: ReadonlySet<string>) =>
				Effect.succeed(buildPolicyHeader(loadedSkills)),
			skillGateReason: (loadedCount: number) =>
				Effect.succeed(buildSkillGateReason(loadedCount)),
			selectPatternFeedback: (patterns: ReadonlyArray<Pattern.Value>) =>
				Effect.succeed(selectPatternFeedback(patterns)),
			patternFeedbackMessage: (
				patterns: ReadonlyArray<Pattern.Value>,
				filePath: Option.Option<string>
			) => Effect.succeed(buildPatternFeedbackMessage(patterns, filePath))
		})
	);
}
