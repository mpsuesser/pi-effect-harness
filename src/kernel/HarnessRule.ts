import { Effect, Schema } from 'effect';

import { ActiveBranch } from '../ActiveBranch.ts';
import { Decision } from '../Decision.ts';
import { WriteIntent } from '../WriteIntent.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;
type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export namespace HarnessRule {
	export interface BeforeAgentStartInput {
		readonly activeBranch: ActiveBranch.Value;
		readonly cwd: string;
	}

	export interface ToolCallInput {
		readonly activeBranch: ActiveBranch.Value;
		readonly cwd: string;
		readonly writeIntent: WriteIntentValue;
	}

	export interface ToolResultInput {
		readonly activeBranch: ActiveBranch.Value;
		readonly cwd: string;
		readonly toolName: 'write' | 'edit';
		readonly writeIntent: WriteIntentValue;
	}

	export interface BeforeAgentStart {
		readonly id: string;
		readonly phase: 'beforeAgentStart';
		readonly evaluate: (
			input: BeforeAgentStartInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export interface ToolCall {
		readonly id: string;
		readonly phase: 'toolCall';
		readonly evaluate: (
			input: ToolCallInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export interface ToolResult {
		readonly id: string;
		readonly phase: 'toolResult';
		readonly evaluate: (
			input: ToolResultInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export type Any = BeforeAgentStart | ToolCall | ToolResult;
}
