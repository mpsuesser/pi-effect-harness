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

	export class AstDetector extends Schema.TaggedClass<AstDetector>()(
		'AstDetector',
		{
			pattern: Schema.String,
			inside: Schema.optionalKey(Schema.String)
		}
	) {}

	export const Detector = Schema.Union([RegexDetector, AstDetector]);

	export class Value extends Schema.Class<Value>('Pattern')({
		name: Schema.String,
		description: Schema.String,
		event: Event,
		toolRegex: Schema.String,
		level: Rule.Severity,
		glob: Schema.optionalKey(Schema.String),
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
