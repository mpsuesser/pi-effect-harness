import { Effect, Schema } from 'effect';

import { ActiveBranch } from '../ActiveBranch.ts';
import { Decision } from '../Decision.ts';
import { WriteIntent } from '../WriteIntent.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;
type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export namespace HarnessHook {
	export interface SessionStartInput {
		readonly cwd: string;
		readonly commands: ReadonlyArray<unknown>;
	}

	export interface SessionTreeInput {
		readonly cwd: string;
		readonly commands: ReadonlyArray<unknown>;
	}

	export interface BeforeAgentStartInput {
		readonly activeBranch: ActiveBranch.Value;
		readonly cwd: string;
	}

	export interface ToolCallInput {
		readonly activeBranch: ActiveBranch.Value;
		readonly cwd: string;
		readonly input: unknown;
		readonly toolCallId: string;
		readonly toolName: string;
		readonly writeIntent: WriteIntentValue | undefined;
	}

	export interface ToolResultInput {
		readonly activeBranch: ActiveBranch.Value;
		readonly cwd: string;
		readonly input: unknown;
		readonly isError: boolean;
		readonly toolCallId: string;
		readonly toolName: string;
		readonly writeIntent: WriteIntentValue | undefined;
	}

	export interface OnSessionStart {
		readonly id: string;
		readonly phase: 'sessionStart';
		readonly run: (
			input: SessionStartInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export interface OnSessionTree {
		readonly id: string;
		readonly phase: 'sessionTree';
		readonly run: (
			input: SessionTreeInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export interface OnBeforeAgentStart {
		readonly id: string;
		readonly phase: 'beforeAgentStart';
		readonly run: (
			input: BeforeAgentStartInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export interface OnToolCall {
		readonly id: string;
		readonly phase: 'toolCall';
		readonly run: (
			input: ToolCallInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export interface OnToolResult {
		readonly id: string;
		readonly phase: 'toolResult';
		readonly run: (
			input: ToolResultInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export type Any =
		| OnSessionStart
		| OnSessionTree
		| OnBeforeAgentStart
		| OnToolCall
		| OnToolResult;
}
