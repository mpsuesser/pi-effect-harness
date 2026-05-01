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
import { MatcherInput } from '../MatcherInput.ts';
import { normalizePath } from '../path/normalizePath.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

type ReplacementSpan = {
	readonly newText: string;
	readonly span: EditReplacement.Span;
};

type ProjectedContent = {
	readonly content: string;
	readonly changedSpans: ReadonlyArray<EditReplacement.Span>;
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

const fullChangedSpan = (
	content: string
): ReadonlyArray<EditReplacement.Span> => [
	new EditReplacement.Span({
		start: 0,
		end: content.length
	})
];

const projectedContentOption = (
	content: Option.Option<string>,
	changedSpans: Option.Option<ReadonlyArray<EditReplacement.Span>> = none()
): Option.Option<ProjectedContent> =>
	Option.match(content, {
		onNone: () => none<ProjectedContent>(),
		onSome: (value) =>
			Option.some({
				content: value,
				changedSpans: Option.getOrElse(
					changedSpans,
					() => fullChangedSpan(value)
				)
			})
	});

const buildProjection = (input: {
	readonly filePath: Option.Option<string>;
	readonly command: Option.Option<string>;
	readonly content: Option.Option<string>;
	readonly changedSpans: Option.Option<ReadonlyArray<EditReplacement.Span>>;
	readonly pattern: Option.Option<string>;
	readonly prompt: Option.Option<string>;
	readonly query: Option.Option<string>;
	readonly url: Option.Option<string>;
}) =>
	new MatcherInput.Value({
		filePath: input.filePath,
		content: input.content,
		changedSpans: input.changedSpans,
		command: input.command,
		pattern: input.pattern,
		query: input.query,
		url: input.url,
		prompt: input.prompt
	});

const withFilePath = (
	filePath: Option.Option<string>,
	content: Option.Option<string>,
	changedSpans: Option.Option<ReadonlyArray<EditReplacement.Span>> = none()
): MatcherInput.Value =>
	buildProjection({
		filePath,
		command: none(),
		content,
		changedSpans,
		pattern: none(),
		prompt: none(),
		query: none(),
		url: none()
	});

const withProjectedContent = (
	filePath: Option.Option<string>,
	projected: Option.Option<ProjectedContent>
): MatcherInput.Value =>
	Option.match(projected, {
		onNone: () => withFilePath(filePath, none()),
		onSome: (value) =>
			withFilePath(
				filePath,
				Option.some(value.content),
				Option.some(value.changedSpans)
			)
	});

const rawProjection = (input: unknown): MatcherInput.Value => {
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
		changedSpans: none(),
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
): Option.Option<ProjectedContent> => {
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

	const initialState: {
		readonly cursor: number;
		readonly output: string;
		readonly changedSpans: ReadonlyArray<EditReplacement.Span>;
	} = {
		cursor: 0,
		output: '',
		changedSpans: []
	};
	const rebuilt = sorted.reduce(
		(state, replacement) => {
			const unchanged = source.slice(
				state.cursor,
				replacement.span.start
			);
			const start = state.output.length + unchanged.length;
			const end = start + replacement.newText.length;
			return {
				cursor: replacement.span.end,
				output: state.output + unchanged + replacement.newText,
				changedSpans: replacement.newText.length === 0
					? state.changedSpans
					: [
						...state.changedSpans,
						new EditReplacement.Span({ start, end })
					]
			};
		},
		initialState
	);
	return Option.some({
		content: `${rebuilt.output}${source.slice(rebuilt.cursor)}`,
		changedSpans: rebuilt.changedSpans
	});
};

const fallbackEditContent = (
	replacements: ReadonlyArray<EditReplacement.Value>
): Option.Option<ProjectedContent> =>
	projectedContentOption(
		contentOption(
			replacements.flatMap((replacement) =>
				replacement.newText.length > 0 ? [replacement.newText] : []
			)
		)
	);

const resolvedNewSpan = (
	replacement: EditReplacement.Value,
	output: string
): Option.Option<EditReplacement.Span> => {
	if (replacement.newText.length === 0) {
		return none();
	}

	const first = output.indexOf(replacement.newText);
	if (first === -1) {
		return none();
	}
	if (output.indexOf(replacement.newText, first + 1) !== -1) {
		return none();
	}

	return Option.some(
		new EditReplacement.Span({
			start: first,
			end: first + replacement.newText.length
		})
	);
};

const changedSpansFromFinalOutput = (
	output: string,
	replacements: ReadonlyArray<EditReplacement.Value>
): Option.Option<ReadonlyArray<EditReplacement.Span>> => {
	const replacementsWithText = replacements.filter(
		(replacement) => replacement.newText.length > 0
	);
	const spans = replacementsWithText.flatMap((replacement) =>
		Option.match(resolvedNewSpan(replacement, output), {
			onNone: () => [],
			onSome: (span) => [span]
		})
	);
	return spans.length === replacementsWithText.length
		? Option.some(spans)
		: none();
};

export namespace WriteProjection {
	export interface Interface {
		readonly raw: (
			input: unknown
		) => Effect.Effect<MatcherInput.Value>;
		readonly prospective: (
			cwd: string,
			intent: WriteIntentValue
		) => Effect.Effect<MatcherInput.Value>;
		readonly actual: (
			cwd: string,
			intent: WriteIntentValue
		) => Effect.Effect<MatcherInput.Value>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/kernel/WriteProjection'
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
						withProjectedContent(
							filePath,
							projectedContentOption(Option.some(intent.content))
						)
					);
				}

				return readTargetFile(cwd, filePath).pipe(
					Effect.map((source) => {
						const projected = Option.isSome(source)
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
						return withProjectedContent(filePath, projected);
					})
				);
			};

			const actual: Interface['actual'] = (cwd, intent) => {
				const filePath = stringOption(intent.filePath);
				return readTargetFile(cwd, filePath).pipe(
					Effect.flatMap((content) => {
						if (Option.isNone(content)) {
							return prospective(cwd, intent);
						}
						if (intent instanceof WriteIntent.WriteFile) {
							return Effect.succeed(
								withProjectedContent(
									filePath,
									projectedContentOption(content)
								)
							);
						}
						return Effect.succeed(
							withFilePath(
								filePath,
								content,
								changedSpansFromFinalOutput(
									content.value,
									intent.replacements
								)
							)
						);
					})
				);
			};

			return Service.of({ raw, prospective, actual });
		})
	);
}
