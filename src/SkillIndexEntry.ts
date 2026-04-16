import { Context, Layer, Schema } from 'effect';
import { runtime } from 'effect/unstable/reactivity/Atom';

export namespace SkillIndexEntry {
	export class Value extends Schema.Class<Value>('SkillIndexEntry')({
		name: Schema.String,
		skillFilePath: Schema.String,
		skillDir: Schema.String
	}) {}

	export class Current extends Context.Service<Current, Value>()(
		'pi-effect-enforcer/SkillIndexEntry/Current'
	) {}

	export const layer = (value: Value) =>
		Layer.succeed(Current, Current.of(value));

	export const atomRuntime = (value: Value) => runtime(layer(value));
}
