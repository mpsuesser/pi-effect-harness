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
		onSome: (value) =>
			Option.match(globOption(glob), {
				onNone: () => false,
				onSome: (matcher) => matcher(value)
			})
	});
};

const regexMatches = (
	pattern: Pattern.RegexDetector,
	source: string
): boolean =>
	Option.match(regexOption(pattern.pattern), {
		onNone: () => false,
		onSome: (regex) => regex.test(source)
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

const hasAstNodes = (root: AstRoot, matcher: AstMatcher): boolean =>
	Option.match(astFindAll(root, matcher), {
		onNone: () => false,
		onSome: (nodes) => nodes.length > 0
	});

const astRuleMatcher = (rule: AstGrepRuleDefinition): NapiConfig => ({ rule });

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

const astAnyMatches = (
	root: AstRoot,
	pattern: Pattern.AstDetector
): boolean =>
	pattern.patterns.some((candidate) =>
		hasAstNodes(root, legacyAstMatcher(pattern, candidate))
	) ||
	(pattern.rules ?? []).some((rule) =>
		hasAstNodes(root, astRuleMatcher(rule))
	);

const astMatches = (
	pattern: Pattern.AstDetector,
	source: string,
	projection: MatcherInput.Value
): boolean =>
	Option.match(filePath(projection), {
		onNone: () => false,
		onSome: (value) =>
			Option.match(langFromPath(value), {
				onNone: () => false,
				onSome: (lang) =>
					Option.match(astRoot(lang, source), {
						onNone: () => false,
						onSome: (root) => astAnyMatches(root, pattern)
					})
			})
	});

export const matchesPattern = (
	toolName: string,
	projection: MatcherInput.Value,
	eventType: 'before' | 'after',
	pattern: Pattern.Value
): boolean => {
	const content = matchableContent(projection);
	if (
		pattern.event !== eventType ||
		!toolMatches(pattern, toolName) ||
		!globMatches(pattern, projection)
	) {
		return false;
	}

	if (pattern.detector instanceof Pattern.AstDetector) {
		return astMatches(pattern.detector, content, projection);
	}

	const source = pattern.detector.matchInComments
		? content
		: stripComments(content);
	return regexMatches(pattern.detector, source);
};

export namespace PatternMatcher {
	export interface Interface {
		readonly matches: (
			toolName: string,
			projection: MatcherInput.Value,
			eventType: 'before' | 'after',
			pattern: Pattern.Value
		) => Effect.Effect<boolean>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-enforcer/kernel/PatternMatcher'
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
			)
		})
	);
}
