import { Context, Layer, Option, Schema } from 'effect';
import { runtime } from 'effect/unstable/reactivity/Atom';

export namespace MatcherInput {
	export class Value extends Schema.Class<Value>('MatcherInput')({
		filePath: Schema.Option(Schema.String),
		content: Schema.Option(Schema.String),
		command: Schema.Option(Schema.String),
		pattern: Schema.Option(Schema.String),
		query: Schema.Option(Schema.String),
		url: Schema.Option(Schema.String),
		prompt: Schema.Option(Schema.String)
	}) {}

	export class Current extends Context.Service<Current, Value>()(
		'pi-effect-enforcer/kernel/MatcherInput/Current'
	) {}

	export const empty = () =>
		new Value({
			filePath: Option.none(),
			content: Option.none(),
			command: Option.none(),
			pattern: Option.none(),
			query: Option.none(),
			url: Option.none(),
			prompt: Option.none()
		});

	export const layer = (value: Value) =>
		Layer.succeed(Current, Current.of(value));

	export const atomRuntime = (value: Value) => runtime(layer(value));
}
