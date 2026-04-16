import { Context, Layer, Schema } from 'effect';
import { runtime } from 'effect/unstable/reactivity/Atom';

export namespace ActiveBranch {
	export class UserMessageEntry
		extends Schema.TaggedClass<UserMessageEntry>()(
			'UserMessageEntry',
			{
				id: Schema.String,
				content: Schema.String
			}
		) {}

	export class AssistantMessageEntry
		extends Schema.TaggedClass<AssistantMessageEntry>()(
			'AssistantMessageEntry',
			{
				id: Schema.String,
				content: Schema.String
			}
		) {}

	export class CustomEntry extends Schema.TaggedClass<CustomEntry>()(
		'CustomEntry',
		{
			id: Schema.String,
			customType: Schema.String,
			data: Schema.optionalKey(Schema.Unknown)
		}
	) {}

	export class CustomMessageEntry
		extends Schema.TaggedClass<CustomMessageEntry>()(
			'CustomMessageEntry',
			{
				id: Schema.String,
				customType: Schema.String,
				content: Schema.String,
				display: Schema.Boolean,
				details: Schema.optionalKey(Schema.Unknown)
			}
		) {}

	export class CompactionEntry extends Schema.TaggedClass<CompactionEntry>()(
		'CompactionEntry',
		{
			id: Schema.String,
			summary: Schema.String,
			firstKeptEntryId: Schema.String,
			tokensBefore: Schema.Number
		}
	) {}

	export class BranchSummaryEntry
		extends Schema.TaggedClass<BranchSummaryEntry>()(
			'BranchSummaryEntry',
			{
				id: Schema.String,
				fromId: Schema.String,
				summary: Schema.String,
				details: Schema.optionalKey(Schema.Unknown)
			}
		) {}

	export class ThinkingLevelChangeEntry
		extends Schema.TaggedClass<ThinkingLevelChangeEntry>()(
			'ThinkingLevelChangeEntry',
			{
				id: Schema.String,
				thinkingLevel: Schema.String
			}
		) {}

	export class ModelChangeEntry
		extends Schema.TaggedClass<ModelChangeEntry>()(
			'ModelChangeEntry',
			{
				id: Schema.String,
				provider: Schema.String,
				modelId: Schema.String
			}
		) {}

	export const Entry = Schema.Union([
		UserMessageEntry,
		AssistantMessageEntry,
		CustomEntry,
		CustomMessageEntry,
		CompactionEntry,
		BranchSummaryEntry,
		ThinkingLevelChangeEntry,
		ModelChangeEntry
	]);

	export class Value extends Schema.Class<Value>('ActiveBranch')({
		entries: Schema.Array(Entry)
	}) {}

	export class Current extends Context.Service<Current, Value>()(
		'pi-effect-enforcer/ActiveBranch/Current'
	) {}

	export const layer = (value: Value) =>
		Layer.succeed(Current, Current.of(value));

	export const atomRuntime = (value: Value) => runtime(layer(value));
}
