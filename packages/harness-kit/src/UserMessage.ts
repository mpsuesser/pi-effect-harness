import { Context, Layer, Schema } from 'effect';
import { runtime } from 'effect/unstable/reactivity/Atom';

export namespace UserMessage {
	export const Delivery = Schema.Literals(
		[
			'steer',
			'followUp',
			'nextTurn'
		] as const
	);

	export class Value extends Schema.Class<Value>('UserMessage')({
		content: Schema.String,
		deliverAs: Schema.optionalKey(Delivery)
	}) {}

	export class Current extends Context.Service<Current, Value>()(
		'pi-effect-harness/UserMessage/Current'
	) {}

	export const layer = (value: Value) =>
		Layer.succeed(Current, Current.of(value));

	export const atomRuntime = (value: Value) => runtime(layer(value));
}
