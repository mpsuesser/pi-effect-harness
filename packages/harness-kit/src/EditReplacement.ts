import { Context, Layer, Schema } from 'effect';
import { runtime } from 'effect/unstable/reactivity/Atom';

export namespace EditReplacement {
	export class Span extends Schema.Class<Span>('EditReplacementSpan')({
		start: Schema.Number,
		end: Schema.Number
	}) {}

	export class Value extends Schema.Class<Value>('EditReplacement')({
		oldText: Schema.String,
		newText: Schema.String
	}) {}

	export class UniqueMatch extends Schema.TaggedClass<UniqueMatch>()(
		'UniqueMatch',
		{
			span: Span
		}
	) {}

	export class MissingMatch extends Schema.TaggedClass<MissingMatch>()(
		'MissingMatch',
		{}
	) {}

	export class AmbiguousMatch extends Schema.TaggedClass<AmbiguousMatch>()(
		'AmbiguousMatch',
		{
			occurrenceCount: Schema.Number
		}
	) {}

	export class OverlappingMatch
		extends Schema.TaggedClass<OverlappingMatch>()(
			'OverlappingMatch',
			{}
		) {}

	export class EmptyOldText extends Schema.TaggedClass<EmptyOldText>()(
		'EmptyOldText',
		{}
	) {}

	export const Resolution = Schema.Union([
		UniqueMatch,
		MissingMatch,
		AmbiguousMatch,
		OverlappingMatch,
		EmptyOldText
	]);

	export class Current extends Context.Service<Current, Value>()(
		'pi-harness-kit/EditReplacement/Current'
	) {}

	export const layer = (value: Value) =>
		Layer.succeed(Current, Current.of(value));

	export const atomRuntime = (value: Value) => runtime(layer(value));
}
