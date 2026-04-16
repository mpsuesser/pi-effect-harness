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

import { EditReplacement } from '../../EditReplacement.ts';
import { WriteIntent } from '../../WriteIntent.ts';
import { normalizePath } from '../path/normalizePath.ts';
import { PatternInputProjection } from '../PatternInputProjection.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

type ReplacementSpan = {
	readonly newText: string;
	readonly span: EditReplacement.Span;
};

const none = <A>() => Option.none<A>();

const stringOption = (value: string | undefined): Option.Option<string> =>
	value === undefined ? none() : Option.some(value);

const nonEmptyStringOption = (value: unknown): Option.Option<string> =>
	typeof value === 'string' && value.length > 0
		? Option.some(value)
		: none();

const anyStringOption = (value: unknown): Option.Option<string> =>
	typeof value === 'string' ? Option.some(value) : none();

const property = (value: unknown, key: PropertyKey): unknown =>
	value !== null && typeof value === 'object'
		? Reflect.get(value, key)
		: undefined;

const getFilePath = (input: unknown): Option.Option<string> => {
	const path = anyStringOption(property(input, 'path'));
	return Option.isSome(path)
		? path
		: anyStringOption(property(input, 'filePath'));
};

const contentOption = (
	parts: ReadonlyArray<string>
): Option.Option<string> =>
	parts.length === 0 ? none() : Option.some(parts.join('\n'));

const buildProjection = (input: {
	readonly filePath: Option.Option<string>;
	readonly command: Option.Option<string>;
	readonly content: Option.Option<string>;
	readonly pattern: Option.Option<string>;
	readonly prompt: Option.Option<string>;
	readonly query: Option.Option<string>;
	readonly url: Option.Option<string>;
}) =>
	new PatternInputProjection.Value({
		filePath: input.filePath,
		content: input.content,
		command: input.command,
		pattern: input.pattern,
		query: input.query,
		url: input.url,
		prompt: input.prompt
	});

const withFilePath = (
	filePath: Option.Option<string>,
	content: Option.Option<string>
): PatternInputProjection.Value =>
	buildProjection({
		filePath,
		command: none(),
		content,
		pattern: none(),
		prompt: none(),
		query: none(),
		url: none()
	});

const rawProjection = (input: unknown): PatternInputProjection.Value => {
	const edits = property(input, 'edits');
	const editContent = Array.isArray(edits)
		? edits.reduce<ReadonlyArray<string>>((parts, edit) => {
			const oldText = nonEmptyStringOption(property(edit, 'oldText'));
			const newText = nonEmptyStringOption(property(edit, 'newText'));
			return [
				...parts,
				...(Option.isSome(oldText) ? [oldText.value] : []),
				...(Option.isSome(newText) ? [newText.value] : [])
			];
		}, [])
		: [];
	const parts = [
		property(input, 'content'),
		property(input, 'oldText'),
		property(input, 'oldString'),
		property(input, 'newText'),
		property(input, 'newString'),
		property(input, 'command'),
		property(input, 'pattern'),
		property(input, 'query'),
		property(input, 'url'),
		property(input, 'prompt')
	].reduce<ReadonlyArray<string>>((accumulator, value) => {
		const current = nonEmptyStringOption(value);
		return Option.isSome(current)
			? [...accumulator, current.value]
			: accumulator;
	}, editContent);

	return buildProjection({
		filePath: getFilePath(input),
		command: anyStringOption(property(input, 'command')),
		content: contentOption(parts),
		pattern: anyStringOption(property(input, 'pattern')),
		prompt: anyStringOption(property(input, 'prompt')),
		query: anyStringOption(property(input, 'query')),
		url: anyStringOption(property(input, 'url'))
	});
};

const replacementSpanOrder = Order.mapInput(
	Order.Number,
	(replacement: ReplacementSpan) => replacement.span.start
);

const resolvedSpan = (
	replacement: EditReplacement.Value,
	source: string
): Option.Option<EditReplacement.Span> => {
	if (replacement.oldText.length === 0) {
		return none();
	}

	const first = source.indexOf(replacement.oldText);
	if (first === -1) {
		return none();
	}
	if (source.indexOf(replacement.oldText, first + 1) !== -1) {
		return none();
	}

	return Option.some(
		new EditReplacement.Span({
			start: first,
			end: first + replacement.oldText.length
		})
	);
};

const reconstructEditOutput = (
	source: string,
	replacements: ReadonlyArray<EditReplacement.Value>
): Option.Option<string> => {
	const resolved = replacements.flatMap((replacement) =>
		Option.match(resolvedSpan(replacement, source), {
			onNone: () => [],
			onSome: (span) => [
				{ newText: replacement.newText, span } satisfies ReplacementSpan
			]
		})
	);
	if (resolved.length !== replacements.length) {
		return none();
	}

	const sorted = sort(resolved, replacementSpanOrder);
	const hasOverlap = sorted.some((replacement, index) => {
		if (index === 0) {
			return false;
		}

		const previous = sorted[index - 1];
		return previous !== undefined &&
			replacement.span.start < previous.span.end;
	});
	if (hasOverlap) {
		return none();
	}

	const rebuilt = sorted.reduce(
		(state, replacement) => ({
			cursor: replacement.span.end,
			output: state.output +
				source.slice(state.cursor, replacement.span.start) +
				replacement.newText
		}),
		{ cursor: 0, output: '' }
	);
	return Option.some(`${rebuilt.output}${source.slice(rebuilt.cursor)}`);
};

const fallbackEditContent = (
	replacements: ReadonlyArray<EditReplacement.Value>
): Option.Option<string> =>
	contentOption(
		replacements.flatMap((replacement) =>
			replacement.newText.length > 0 ? [replacement.newText] : []
		)
	);

export namespace WriteProjection {
	export interface Interface {
		readonly raw: (
			input: unknown
		) => Effect.Effect<PatternInputProjection.Value>;
		readonly prospective: (
			cwd: string,
			intent: WriteIntentValue
		) => Effect.Effect<PatternInputProjection.Value>;
		readonly actual: (
			cwd: string,
			intent: WriteIntentValue
		) => Effect.Effect<PatternInputProjection.Value>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-enforcer/kernel/WriteProjection'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const fileSystem = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;

			const readTargetFile = (
				cwd: string,
				filePath: Option.Option<string>
			): Effect.Effect<Option.Option<string>> =>
				Option.isNone(filePath)
					? Effect.succeed(none<string>())
					: normalizePath({
						cwd,
						fileSystem,
						path,
						value: filePath.value
					}).pipe(
						Effect.flatMap((normalizedPath) =>
							fileSystem.readFileString(normalizedPath).pipe(
								Effect.map(Option.some),
								Effect.catchTag(
									'PlatformError',
									() => Effect.succeed(none<string>())
								)
							)
						)
					);

			const raw = (input: unknown) =>
				Effect.succeed(rawProjection(input));

			const prospective: Interface['prospective'] = (cwd, intent) => {
				const filePath = stringOption(intent.filePath);
				if (intent instanceof WriteIntent.WriteFile) {
					return Effect.succeed(
						withFilePath(filePath, Option.some(intent.content))
					);
				}

				return readTargetFile(cwd, filePath).pipe(
					Effect.map((source) => {
						const content = Option.isSome(source)
							? (() => {
								const reconstructed = reconstructEditOutput(
									source.value,
									intent.replacements
								);
								return Option.isSome(reconstructed)
									? reconstructed
									: fallbackEditContent(intent.replacements);
							})()
							: fallbackEditContent(intent.replacements);
						return withFilePath(filePath, content);
					})
				);
			};

			const actual: Interface['actual'] = (cwd, intent) => {
				const filePath = stringOption(intent.filePath);
				return readTargetFile(cwd, filePath).pipe(
					Effect.flatMap((content) =>
						Option.isSome(content)
							? Effect.succeed(withFilePath(filePath, content))
							: prospective(cwd, intent)
					)
				);
			};

			return Service.of({ raw, prospective, actual });
		})
	);
}
