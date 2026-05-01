import { Lang, parse } from '@ast-grep/napi';
import type { NapiConfig, Rule as AstGrepRuleDefinition } from '@ast-grep/napi';
import picomatch from 'picomatch';

import { Context, Effect, Layer, Option } from 'effect';

import { Pattern } from '../../Pattern.ts';
import { MatcherInput } from '../MatcherInput.ts';

const regexOption = Option.liftThrowable((pattern: string) =>
	new RegExp(pattern)
);
const globOption = Option.liftThrowable((glob: string) => picomatch(glob));
const astRoot = Option.liftThrowable((lang: Lang, source: string) =>
	parse(lang, source).root()
);

const values = (projection: MatcherInput.Value) =>
	[
		projection.command,
		projection.content,
		projection.pattern,
		projection.query,
		projection.url,
		projection.prompt
	].flatMap((value) =>
		Option.match(value, {
			onNone: () => [],
			onSome: (current) => [current]
		})
	);

const filePath = (projection: MatcherInput.Value) => projection.filePath;

const matchableContent = (projection: MatcherInput.Value): string => {
	const parts = values(projection);
	return parts.length === 0 ? '' : parts.join('\n');
};

export const stripComments = (source: string): string => {
	const out: Array<string> = [];
	let index = 0;

	const at = (current: number) => source.charAt(current);
	const keep = () => {
		out.push(at(index));
		index += 1;
	};
	const blank = () => {
		out.push(at(index) === '\n' ? '\n' : ' ');
		index += 1;
	};

	while (index < source.length) {
		const current = at(index);
		const next = index + 1 < source.length ? at(index + 1) : '';

		if (current === "'" || current === '"') {
			const quote = current;
			keep();
			while (index < source.length && at(index) !== quote) {
				if (at(index) === '\\' && index + 1 < source.length) {
					keep();
					keep();
					continue;
				}
				keep();
			}
			if (index < source.length) {
				keep();
			}
			continue;
		}

		if (current === '`') {
			keep();
			while (index < source.length && at(index) !== '`') {
				if (at(index) === '\\' && index + 1 < source.length) {
					keep();
					keep();
					continue;
				}
				keep();
			}
			if (index < source.length) {
				keep();
			}
			continue;
		}

		if (current === '/' && next === '/') {
			blank();
			blank();
			while (index < source.length && at(index) !== '\n') {
				blank();
			}
			continue;
		}

		if (current === '/' && next === '*') {
			blank();
			blank();
			while (index < source.length) {
				if (
					at(index) === '*' &&
					index + 1 < source.length &&
					at(index + 1) === '/'
				) {
					blank();
					blank();
					break;
				}
				blank();
			}
			continue;
		}

		keep();
	}

	return out.join('');
};

const toolMatches = (pattern: Pattern.Value, toolName: string): boolean =>
	Option.match(regexOption(pattern.toolRegex), {
		onNone: () => false,
		onSome: (regex) => regex.test(toolName)
	});

const pathMatchesGlob = (glob: string, value: string): boolean =>
	Option.match(globOption(glob), {
		onNone: () => false,
		onSome: (matcher) => matcher(value)
	});

const globMatches = (
	pattern: Pattern.Value,
	projection: MatcherInput.Value
): boolean => {
	const glob = pattern.glob;
	if (glob === undefined) {
		return true;
	}

	return Option.match(filePath(projection), {
		onNone: () => false,
		onSome: (value) => pathMatchesGlob(glob, value)
	});
};

const ignoreGlobMatches = (
	pattern: Pattern.Value,
	projection: MatcherInput.Value
): boolean =>
	pattern.ignoreGlob === undefined
		? false
		: Option.match(filePath(projection), {
			onNone: () => false,
			onSome: (value) =>
				pattern.ignoreGlob?.some((glob) =>
					pathMatchesGlob(glob, value)
				) ?? false
		});

const globalRegex = (regex: RegExp): RegExp =>
	new RegExp(
		regex.source,
		regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
	);

const locationFromSpan = (
	source: string,
	start: number,
	end: number
): Pattern.MatchLocation => {
	const before = source.slice(0, start);
	const line = before.split('\n').length;
	const previousLineBreak = before.lastIndexOf('\n');
	const lineStart = previousLineBreak === -1 ? 0 : previousLineBreak + 1;
	const snippet = source.slice(start, end).split('\n')[0] ?? '';
	return new Pattern.MatchLocation({
		start,
		end,
		line,
		column: start - lineStart + 1,
		snippet: snippet.trim()
	});
};

const regexMatchLocations = (
	pattern: Pattern.RegexDetector,
	source: string,
	originalSource: string
): ReadonlyArray<Pattern.MatchLocation> =>
	Option.match(regexOption(pattern.pattern), {
		onNone: () => [],
		onSome: (regex) =>
			[...source.matchAll(globalRegex(regex))].flatMap((match) => {
				if (typeof match.index !== 'number' || match[0].length === 0) {
					return [];
				}
				return [
					locationFromSpan(
						originalSource,
						match.index,
						match.index + match[0].length
					)
				];
			})
	});

const langFromPath = (value: string): Option.Option<Lang> =>
	value.endsWith('.tsx')
		? Option.some(Lang.Tsx)
		: value.endsWith('.ts')
		? Option.some(Lang.TypeScript)
		: value.endsWith('.jsx')
		? Option.some(Lang.Tsx)
		: value.endsWith('.js')
		? Option.some(Lang.JavaScript)
		: Option.none();

type AstRoot = ReturnType<ReturnType<typeof parse>['root']>;

type AstMatcher = string | NapiConfig;

const astFindAll = Option.liftThrowable((root: AstRoot, matcher: AstMatcher) =>
	root.findAll(matcher)
);

const astMatcherLocations = (
	root: AstRoot,
	matcher: AstMatcher,
	source: string
): ReadonlyArray<Pattern.MatchLocation> =>
	Option.match(astFindAll(root, matcher), {
		onNone: () => [],
		onSome: (nodes) =>
			nodes.map((node) =>
				locationFromSpan(
					source,
					node.range().start.index,
					node.range().end.index
				)
			)
	});

const astRuleMatcher = (
	pattern: Pattern.AstDetector,
	rule: AstGrepRuleDefinition
): NapiConfig =>
	pattern.constraints === undefined
		? { rule }
		: { rule, constraints: pattern.constraints };

// A detector matches if ANY of its patterns matches. This allows a single
// pattern definition to target multiple distinct AST shapes (e.g. `new Date`
// and `Date.$M()`, or `new Error` and `$A instanceof Error`).
const legacyAstMatcher = (
	pattern: Pattern.AstDetector,
	candidate: string
): AstMatcher =>
	pattern.inside === undefined
		? candidate
		: {
			rule: {
				pattern: candidate,
				inside: {
					pattern: pattern.inside,
					stopBy: 'end'
				}
			}
		};

const astMatchLocationsForRoot = (
	root: AstRoot,
	pattern: Pattern.AstDetector,
	source: string
): ReadonlyArray<Pattern.MatchLocation> => [
	...pattern.patterns.flatMap((candidate) =>
		astMatcherLocations(root, legacyAstMatcher(pattern, candidate), source)
	),
	...(pattern.rules ?? []).flatMap((rule) =>
		astMatcherLocations(root, astRuleMatcher(pattern, rule), source)
	)
];

const astMatchLocations = (
	pattern: Pattern.AstDetector,
	source: string,
	projection: MatcherInput.Value
): ReadonlyArray<Pattern.MatchLocation> =>
	Option.match(filePath(projection), {
		onNone: () => [],
		onSome: (value) =>
			Option.match(langFromPath(value), {
				onNone: () => [],
				onSome: (lang) =>
					Option.match(astRoot(lang, source), {
						onNone: () => [],
						onSome: (root) =>
							astMatchLocationsForRoot(root, pattern, source)
					})
			})
	});

const spansIntersect = (
	left: { readonly start: number; readonly end: number; },
	right: { readonly start: number; readonly end: number; }
): boolean => left.start < right.end && right.start < left.end;

const filterToChangedSpans = (
	projection: MatcherInput.Value,
	locations: ReadonlyArray<Pattern.MatchLocation>
): ReadonlyArray<Pattern.MatchLocation> =>
	Option.match(projection.changedSpans, {
		onNone: () => locations,
		onSome: (changedSpans) =>
			locations.filter((location) =>
				changedSpans.some((span) => spansIntersect(location, span))
			)
	});

export const findPatternMatches = (
	toolName: string,
	projection: MatcherInput.Value,
	eventType: 'before' | 'after',
	pattern: Pattern.Value
): ReadonlyArray<Pattern.MatchLocation> => {
	const content = matchableContent(projection);
	if (
		pattern.event !== eventType ||
		!toolMatches(pattern, toolName) ||
		!globMatches(pattern, projection) ||
		ignoreGlobMatches(pattern, projection)
	) {
		return [];
	}

	const locations = pattern.detector instanceof Pattern.AstDetector
		? astMatchLocations(pattern.detector, content, projection)
		: regexMatchLocations(
			pattern.detector,
			pattern.detector.matchInComments ? content : stripComments(content),
			content
		);
	return filterToChangedSpans(projection, locations);
};

export const matchesPattern = (
	toolName: string,
	projection: MatcherInput.Value,
	eventType: 'before' | 'after',
	pattern: Pattern.Value
): boolean =>
	findPatternMatches(toolName, projection, eventType, pattern).length > 0;

export namespace PatternMatcher {
	export interface Interface {
		readonly matches: (
			toolName: string,
			projection: MatcherInput.Value,
			eventType: 'before' | 'after',
			pattern: Pattern.Value
		) => Effect.Effect<boolean>;
		readonly findMatches: (
			toolName: string,
			projection: MatcherInput.Value,
			eventType: 'before' | 'after',
			pattern: Pattern.Value
		) => Effect.Effect<ReadonlyArray<Pattern.MatchLocation>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/kernel/PatternMatcher'
	) {}

	export const layer = Layer.succeed(
		Service,
		Service.of({
			matches: (
				toolName: string,
				projection: MatcherInput.Value,
				eventType: 'before' | 'after',
				pattern: Pattern.Value
			) => Effect.succeed(
				matchesPattern(toolName, projection, eventType, pattern)
			),
			findMatches: (
				toolName: string,
				projection: MatcherInput.Value,
				eventType: 'before' | 'after',
				pattern: Pattern.Value
			) => Effect.succeed(
				findPatternMatches(toolName, projection, eventType, pattern)
			)
		})
	);
}
