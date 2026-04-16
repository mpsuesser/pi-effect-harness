import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Order,
	Path,
	Schema
} from 'effect';
import { sort } from 'effect/Array';

import { SKIPPED_FILES } from '../../constants.ts';
import { extractBody, parseFrontmatter } from '../../frontmatter.ts';
import { Pattern } from '../../Pattern.ts';
import { Rule } from '../../Rule.ts';

type PatternLevel = Schema.Schema.Type<typeof Rule.Severity>;

const regexOption = Option.liftThrowable((pattern: string) =>
	new RegExp(pattern)
);
const emptyEntries: ReadonlyArray<string> = [];
const emptyPatterns: ReadonlyArray<Pattern.Value> = [];

const readStringArray = (
	value: unknown
): Option.Option<ReadonlyArray<string>> => {
	if (!Array.isArray(value)) {
		return Option.none();
	}

	const strings = value.flatMap((entry) =>
		typeof entry === 'string' ? [entry] : []
	);
	return strings.length === value.length
		? Option.some(strings)
		: Option.none();
};

const stringOption = (value: unknown): Option.Option<string> =>
	typeof value === 'string' ? Option.some(value) : Option.none();

const isSkippedFile = (name: string): boolean =>
	SKIPPED_FILES.some(
		(prefix) =>
			name.startsWith(prefix) ||
			name.toLowerCase() === `${prefix.toLowerCase()}.md`
	);

const patternLevel = (value: Option.Option<string>): PatternLevel =>
	Option.match(value, {
		onNone: () => 'info',
		onSome: (current) =>
			current === 'critical' ||
				current === 'high' ||
				current === 'medium' ||
				current === 'warning' ||
				current === 'info'
				? current
				: 'info'
	});

const patternEvent = (value: Option.Option<string>): 'before' | 'after' =>
	Option.match(value, {
		onNone: () => 'before',
		onSome: (current) =>
			current.toLowerCase() === 'after' ? 'after' : 'before'
	});

const toDetector = (
	raw: Record<string, unknown>
): Option.Option<Pattern.RegexDetector | Pattern.AstDetector> => {
	const pattern = stringOption(raw.pattern);
	if (Option.isNone(pattern)) {
		return Option.none();
	}

	const detector = Option.match(stringOption(raw.detector), {
		onNone: () => 'regex',
		onSome: (value) => (value === 'ast' ? 'ast' : 'regex')
	});
	if (detector === 'ast') {
		const inside = stringOption(raw.inside);
		return Option.some(
			new Pattern.AstDetector({
				pattern: pattern.value,
				...(Option.isSome(inside)
					? { inside: inside.value }
					: undefined)
			})
		);
	}

	return Option.isSome(regexOption(pattern.value))
		? Option.some(
			new Pattern.RegexDetector({
				pattern: pattern.value,
				matchInComments: raw.matchInComments === true ||
					raw.matchInComments === 'true'
			})
		)
		: Option.none();
};

const toPattern = (
	filePath: string,
	content: string
): Option.Option<Pattern.Value> => {
	const raw = parseFrontmatter(content);
	const name = stringOption(raw.name);
	const detector = toDetector(raw);
	const toolRegex = Option.match(stringOption(raw.tool), {
		onNone: () => '.*',
		onSome: (value) => value
	});
	if (
		Option.isNone(name) ||
		Option.isNone(detector) ||
		Option.isNone(regexOption(toolRegex))
	) {
		return Option.none();
	}

	const description = Option.match(stringOption(raw.description), {
		onNone: () => '',
		onSome: (value) => value
	});
	const glob = stringOption(raw.glob);
	const suggestedSkills = readStringArray(raw.suggestSkills);
	return Option.some(
		new Pattern.Value({
			name: name.value,
			description,
			event: patternEvent(stringOption(raw.event)),
			toolRegex,
			level: patternLevel(stringOption(raw.level)),
			...(Option.isSome(glob) ? { glob: glob.value } : undefined),
			detector: detector.value,
			guidance: extractBody(content),
			...(Option.isSome(suggestedSkills)
				? { suggestedSkills: [...suggestedSkills.value] }
				: undefined),
			sourcePath: filePath
		})
	);
};

const patternOrder = Order.mapInput(
	Order.String,
	(pattern: Pattern.Value) => pattern.sourcePath
);

export const toRuleDefinition = (pattern: Pattern.Value) =>
	new Rule.Definition({
		id: `legacy-pattern:${pattern.name}`,
		description: pattern.description,
		action: 'injectUserMessage',
		severity: pattern.level,
		patternName: pattern.name,
		sourcePath: pattern.sourcePath
	});

export const loadPatterns = (patternsDir: string) =>
	Effect.gen(function*() {
		const fileSystem = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const readDirectory = (directory: string) =>
			fileSystem.readDirectory(directory).pipe(
				Effect.catchTag(
					'PlatformError',
					() => Effect.succeed(emptyEntries)
				)
			);

		const stat = (target: string) =>
			fileSystem.stat(target).pipe(
				Effect.map(Option.some),
				Effect.catchTag(
					'PlatformError',
					() => Effect.succeed(Option.none<FileSystem.File.Info>())
				)
			);

		const readPatternFile = (target: string) =>
			fileSystem.readFileString(target).pipe(
				Effect.map((content) => toPattern(target, content)),
				Effect.catchTag(
					'PlatformError',
					() => Effect.succeed(Option.none<Pattern.Value>())
				)
			);

		const walkPatterns = (
			directory: string
		): Effect.Effect<ReadonlyArray<Pattern.Value>> =>
			Effect.gen(function*() {
				const entries = yield* readDirectory(directory);
				const nested: ReadonlyArray<ReadonlyArray<Pattern.Value>> =
					yield* Effect.forEach(
						entries,
						(entry) =>
							Effect.gen(function*() {
								const fullPath = path.join(directory, entry);
								const info = yield* stat(fullPath);
								if (Option.isNone(info)) {
									return emptyPatterns;
								}
								if (info.value.type === 'Directory') {
									return yield* walkPatterns(fullPath);
								}
								if (
									info.value.type !== 'File' ||
									!entry.endsWith('.md') ||
									isSkippedFile(entry)
								) {
									return emptyPatterns;
								}

								const loaded = yield* readPatternFile(fullPath);
								return Option.match(loaded, {
									onNone: () => emptyPatterns,
									onSome: (pattern) => [pattern]
								});
							})
					);
				return nested.flatMap((patterns) => patterns);
			});

		return sort(yield* walkPatterns(patternsDir), patternOrder);
	});

export namespace PatternCatalog {
	export interface Interface {
		readonly getPatterns: Effect.Effect<ReadonlyArray<Pattern.Value>>;
		readonly getRules: Effect.Effect<ReadonlyArray<Rule.Definition>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/kernel/PatternCatalog'
	) {}

	export const layer = (patternsDir: string) =>
		Layer.effect(
			Service,
			Effect.gen(function*() {
				const patterns = yield* loadPatterns(patternsDir);
				return Service.of({
					getPatterns: Effect.succeed(patterns),
					getRules: Effect.succeed(patterns.map(toRuleDefinition))
				});
			})
		);
}
