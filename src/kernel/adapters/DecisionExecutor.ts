import type {
	ExtensionAPI,
	ExtensionContext
} from '@mariozechner/pi-coding-agent';
import { Schema } from 'effect';

import { Decision } from '../../Decision.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;

type ToolCallResult = {
	readonly block?: boolean;
	readonly reason?: string;
};

type BeforeAgentStartResult = {
	readonly message?: {
		readonly customType: string;
		readonly content: string | ReadonlyArray<unknown>;
		readonly display: boolean;
		readonly details?: unknown;
	};
	readonly systemPrompt?: string;
};

const mergeSystemPrompt = (
	baseSystemPrompt: string | undefined,
	decisions: ReadonlyArray<DecisionValue>
): string | undefined => {
	const additions = decisions
		.filter(
			(decision): decision is Decision.InjectSystemPrompt =>
				decision instanceof Decision.InjectSystemPrompt
		)
		.map((decision) => decision.content);

	return additions.length === 0
		? baseSystemPrompt
		: [baseSystemPrompt, ...additions]
			.filter((content) =>
				typeof content === 'string' && content.length > 0
			)
			.join('\n\n');
};

const deliverUserMessage = (
	pi: ExtensionAPI,
	ctx: Pick<ExtensionContext, 'isIdle'>,
	decision: Decision.InjectUserMessage
): void => {
	const deliverAs = decision.message.deliverAs;
	if (ctx.isIdle()) {
		pi.sendUserMessage(decision.message.content);
		return;
	}

	pi.sendUserMessage(decision.message.content, {
		deliverAs: deliverAs === 'followUp' || deliverAs === 'steer'
			? deliverAs
			: 'steer'
	});
};

export const executeSideEffects = (
	pi: ExtensionAPI,
	ctx: Pick<ExtensionContext, 'isIdle'>,
	decisions: ReadonlyArray<DecisionValue>
): void => {
	decisions
		.filter(
			(decision): decision is Decision.AppendCustomEntry =>
				decision instanceof Decision.AppendCustomEntry
		)
		.forEach((decision) => {
			pi.appendEntry(decision.customType, decision.data);
		});

	decisions
		.filter(
			(decision): decision is Decision.InjectUserMessage =>
				decision instanceof Decision.InjectUserMessage
		)
		.forEach((decision) => {
			deliverUserMessage(pi, ctx, decision);
		});
};

export const toToolCallResult = (
	decisions: ReadonlyArray<DecisionValue>
): ToolCallResult | undefined => {
	const blockDecision = decisions.find(
		(decision): decision is Decision.BlockToolCall =>
			decision instanceof Decision.BlockToolCall
	);
	return blockDecision === undefined
		? undefined
		: { block: true, reason: blockDecision.reason };
};

export const toBeforeAgentStartResult = ({
	base,
	decisions
}: {
	readonly base: BeforeAgentStartResult | undefined;
	readonly decisions: ReadonlyArray<DecisionValue>;
}): BeforeAgentStartResult | undefined => {
	const systemPrompt = mergeSystemPrompt(base?.systemPrompt, decisions);
	return base === undefined && systemPrompt === undefined
		? undefined
		: {
			...(base?.message !== undefined
				? { message: base.message }
				: undefined),
			...(systemPrompt !== undefined ? { systemPrompt } : undefined)
		};
};
