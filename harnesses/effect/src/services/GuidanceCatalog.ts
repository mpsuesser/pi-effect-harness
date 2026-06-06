import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Match,
	Option,
	Order,
	Path
} from 'effect';
import { sort } from 'effect/Array';
import { Pattern } from 'pi-harness-kit/Pattern.ts';

import { MIN_EFFECT_SKILLS } from '../constants.ts';

const EFFECT_REFERENCE_HINTS = [
	{
		path: '~/.cache/effect-v4/LLMS.md',
		description: 'generated task-oriented guide and example index'
	},
	{
		path: '~/.cache/effect-v4/ai-docs/src/',
		description: 'source examples behind LLMS.md, organized by topic'
	},
	{
		path: '~/.cache/effect-v4/packages/effect/SCHEMA.md',
		description: 'Schema reference'
	},
	{
		path: '~/.cache/effect-v4/packages/effect/HTTPAPI.md',
		description: 'HttpApi, HttpApiClient, and HttpApiBuilder reference'
	},
	{
		path: '~/.cache/effect-v4/packages/effect/CONFIG.md',
		description: 'Config and ConfigProvider reference'
	},
	{
		path: '~/.cache/effect-v4/packages/effect/MCP.md',
		description: 'MCP server reference'
	},
	{
		path: '~/.cache/effect-v4/packages/effect/OPTIC.md',
		description: 'Optic reference'
	},
	{
		path: '~/.cache/effect-v4/packages/vitest/README.md',
		description: '@effect/vitest testing reference'
	},
	{
		path: '~/.cache/effect-v4/cookbooks/schedule.md',
		description: 'Schedule recipes and traps'
	},
	{
		path: '~/.cache/effect-v4/packages/effect/src/',
		description: 'source of truth for every exported module'
	}
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
	loadedSkills: ReadonlySet<string>,
	skillsDir?: string
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
		'pi-effect-harness policy:',
		`- Before planning or writing Effect code, read at least ${
			String(MIN_EFFECT_SKILLS)
		} relevant effect-* skills. Loaded on this branch: ${
			String(loadedCount)
		}/${String(MIN_EFFECT_SKILLS)} (${loadedPreview}).`,
		...(skillsDir === undefined ? [] : [
			`- The effect-* skill files live in ${skillsDir} (read e.g. ${skillsDir}/effect-error-handling/SKILL.md). Do not go looking for them elsewhere.`
		]),
		'- If any Effect v4 API is unclear, read from the local Effect reference clone instead of guessing.',
		'- Key reference paths:',
		...EFFECT_REFERENCE_HINTS.map(
			(reference) => `  - ${reference.path} — ${reference.description}`
		)
	].join('\n');
};

export const buildSkillGateReason = (
	loadedCount: number,
	skillsDir?: string
): string => {
	const missing = Math.max(0, MIN_EFFECT_SKILLS - loadedCount);
	return [
		`pi-effect-harness blocked this write because it looks like Effect code and only ${
			String(loadedCount)
		}/${
			String(MIN_EFFECT_SKILLS)
		} required effect-* skills have been read on this branch.`,
		`Read at least ${
			String(missing)
		} more relevant effect-* skill files before writing Effect code.`,
		...(skillsDir === undefined ? [] : [
			`The effect-* skill files live in ${skillsDir} (e.g. ${skillsDir}/effect-schema-v4/SKILL.md) — read them there directly.`
		]),
		'If an API is unclear, read from ~/.cache/effect-v4/ before continuing.'
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
		'pi-effect-harness review request:',
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

const emptyEntries: ReadonlyArray<string> = [];

const loadGuidanceDocs = (guidanceDir: string) =>
	Effect.gen(function*() {
		const fileSystem = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const entries = yield* fileSystem.readDirectory(guidanceDir).pipe(
			Effect.catchTag('PlatformError', () => Effect.succeed(emptyEntries))
		);
		const sortedMarkdownFiles = sort(
			entries.filter((entry) => entry.endsWith('.md')),
			Order.String
		);

		const docs = yield* Effect.forEach(
			sortedMarkdownFiles,
			(entry) =>
				fileSystem.readFileString(path.join(guidanceDir, entry)).pipe(
					Effect.map((content) => content.trim()),
					Effect.catchTag(
						'PlatformError',
						() => Effect.succeed('')
					)
				)
		);
		return docs.filter((doc) => doc.length > 0);
	});

export const buildPolicyHeaderWithDocs = (
	docs: ReadonlyArray<string>,
	loadedSkills: ReadonlySet<string>,
	skillsDir?: string
): string =>
	docs.length === 0
		? buildPolicyHeader(loadedSkills, skillsDir)
		: [...docs, buildPolicyHeader(loadedSkills, skillsDir)].join(
			'\n\n---\n\n'
		);

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
		'pi-effect-harness/effect/GuidanceCatalog'
	) {}

	export const layer = (guidanceDir: string, skillsDir?: string) =>
		Layer.effect(
			Service,
			Effect.gen(function*() {
				const docs = yield* loadGuidanceDocs(guidanceDir);
				return Service.of({
					policyHeader: (loadedSkills) =>
						Effect.succeed(
							buildPolicyHeaderWithDocs(
								docs,
								loadedSkills,
								skillsDir
							)
						),
					skillGateReason: (loadedCount: number) =>
						Effect.succeed(
							buildSkillGateReason(loadedCount, skillsDir)
						),
					selectPatternFeedback: (
						patterns: ReadonlyArray<Pattern.Value>
					) => Effect.succeed(selectPatternFeedback(patterns)),
					patternFeedbackMessage: (
						patterns: ReadonlyArray<Pattern.Value>,
						filePath: Option.Option<string>
					) => Effect.succeed(
						buildPatternFeedbackMessage(patterns, filePath)
					)
				});
			})
		);
}
