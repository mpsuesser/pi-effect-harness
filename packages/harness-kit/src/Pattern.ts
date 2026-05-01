import type { Rule as AstGrepRuleDefinition } from '@ast-grep/napi';

import { Context, Layer, Schema } from 'effect';
import { runtime } from 'effect/unstable/reactivity/Atom';

import { Rule } from './Rule.ts';

export namespace Pattern {
	export const Event = Schema.Literals(['before', 'after'] as const);

	export class RegexDetector extends Schema.TaggedClass<RegexDetector>()(
		'RegexDetector',
		{
			pattern: Schema.String,
			matchInComments: Schema.Boolean
		}
	) {}

	const AstGrepRuleDefinition = Schema.declare<AstGrepRuleDefinition>(
		(input): input is AstGrepRuleDefinition =>
			typeof input === 'object' && input !== null &&
			!Array.isArray(input),
		{ expected: 'ast-grep rule object' }
	);

	export class AstDetector extends Schema.TaggedClass<AstDetector>()(
		'AstDetector',
		{
			// An AST detector matches if ANY of these ast-grep patterns or rule
			// objects matches. YAML frontmatter may spell legacy `pattern` as a
			// single string or a list; the catalog normalizes both forms to this
			// array. Full ast-grep rule objects are read from `rule` / `rules`.
			patterns: Schema.Array(Schema.String),
			inside: Schema.optionalKey(Schema.String),
			rules: Schema.optionalKey(Schema.Array(AstGrepRuleDefinition)),
			constraints: Schema.optionalKey(
				Schema.Record(Schema.String, AstGrepRuleDefinition)
			)
		}
	) {}

	export const Detector = Schema.Union([RegexDetector, AstDetector]);

	export class MatchLocation extends Schema.Class<MatchLocation>(
		'PatternMatchLocation'
	)({
		start: Schema.Number,
		end: Schema.Number,
		line: Schema.Number,
		column: Schema.Number,
		snippet: Schema.String
	}) {}

	export class Value extends Schema.Class<Value>('Pattern')({
		name: Schema.String,
		description: Schema.String,
		event: Event,
		toolRegex: Schema.String,
		level: Rule.Severity,
		glob: Schema.optionalKey(Schema.String),
		ignoreGlob: Schema.optionalKey(Schema.Array(Schema.String)),
		detector: Detector,
		guidance: Schema.String,
		suggestedSkills: Schema.optionalKey(Schema.Array(Schema.String)),
		sourcePath: Schema.String
	}) {}

	export class Current extends Context.Service<Current, Value>()(
		'pi-effect-enforcer/Pattern/Current'
	) {}

	export const layer = (value: Value) =>
		Layer.succeed(Current, Current.of(value));

	export const atomRuntime = (value: Value) => runtime(layer(value));
}
