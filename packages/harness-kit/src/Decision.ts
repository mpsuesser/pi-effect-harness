import { Schema } from 'effect';

import { UserMessage } from './UserMessage.ts';

export namespace Decision {
	export class BlockToolCall extends Schema.TaggedClass<BlockToolCall>()(
		'BlockToolCall',
		{
			reason: Schema.String
		}
	) {}

	export class InjectUserMessage
		extends Schema.TaggedClass<InjectUserMessage>()(
			'InjectUserMessage',
			{
				message: UserMessage.Value
			}
		) {}

	export class InjectSystemPrompt
		extends Schema.TaggedClass<InjectSystemPrompt>()(
			'InjectSystemPrompt',
			{
				content: Schema.String
			}
		) {}

	export class AppendCustomEntry
		extends Schema.TaggedClass<AppendCustomEntry>()(
			'AppendCustomEntry',
			{
				customType: Schema.String,
				data: Schema.optionalKey(Schema.Unknown)
			}
		) {}

	export const Value = Schema.Union([
		BlockToolCall,
		InjectUserMessage,
		InjectSystemPrompt,
		AppendCustomEntry
	]);
}
