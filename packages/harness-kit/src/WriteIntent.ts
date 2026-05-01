import { Context, Layer, Schema } from 'effect';
import { runtime } from 'effect/unstable/reactivity/Atom';

import { EditReplacement } from './EditReplacement.ts';

export namespace WriteIntent {
	export const Phase = Schema.Literals(['tool_call', 'tool_result'] as const);

	export class WriteFile extends Schema.TaggedClass<WriteFile>()(
		'WriteFile',
		{
			phase: Phase,
			filePath: Schema.optionalKey(Schema.String),
			content: Schema.String
		}
	) {}

	export class EditFile extends Schema.TaggedClass<EditFile>()(
		'EditFile',
		{
			phase: Phase,
			filePath: Schema.optionalKey(Schema.String),
			replacements: Schema.Array(EditReplacement.Value)
		}
	) {}

	export const Value = Schema.Union([WriteFile, EditFile]);

	export class Current extends Context.Service<
		Current,
		Schema.Schema.Type<typeof Value>
	>()('pi-effect-harness/WriteIntent/Current') {}

	export const layer = (value: Schema.Schema.Type<typeof Value>) =>
		Layer.succeed(Current, Current.of(value));

	export const atomRuntime = (value: Schema.Schema.Type<typeof Value>) =>
		runtime(layer(value));
}
