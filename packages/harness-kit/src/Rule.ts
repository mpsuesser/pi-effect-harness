import { Schema } from 'effect';

export namespace Rule {
	export const Action = Schema.Literals(
		[
			'blockToolCall',
			'injectUserMessage',
			'injectSystemPrompt',
			'appendCustomEntry'
		] as const
	);

	export const Severity = Schema.Literals(
		[
			'critical',
			'high',
			'medium',
			'warning',
			'info'
		] as const
	);

	export class Definition extends Schema.Class<Definition>('RuleDefinition')({
		id: Schema.String,
		description: Schema.String,
		action: Action,
		severity: Severity,
		patternName: Schema.optionalKey(Schema.String),
		sourcePath: Schema.optionalKey(Schema.String)
	}) {}
}
