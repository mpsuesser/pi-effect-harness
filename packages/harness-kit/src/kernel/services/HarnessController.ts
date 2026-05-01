import { Context, Effect, Layer, Schema } from 'effect';

import type { ActiveBranch } from '../../ActiveBranch.ts';
import { Decision } from '../../Decision.ts';
import { WriteIntent } from '../../WriteIntent.ts';
import type { HarnessHook } from '../HarnessHook.ts';
import { HookSet } from './HookSet.ts';
import { RuleEngine } from './RuleEngine.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;
type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

const emptyDecisions: ReadonlyArray<DecisionValue> = [];

const sessionStartHooks = (
	hooks: ReadonlyArray<HarnessHook.Any>
): ReadonlyArray<HarnessHook.OnSessionStart> =>
	hooks.flatMap((hook) => hook.phase === 'sessionStart' ? [hook] : []);

const sessionTreeHooks = (
	hooks: ReadonlyArray<HarnessHook.Any>
): ReadonlyArray<HarnessHook.OnSessionTree> =>
	hooks.flatMap((hook) => (hook.phase === 'sessionTree' ? [hook] : []));

const beforeAgentStartHooks = (
	hooks: ReadonlyArray<HarnessHook.Any>
): ReadonlyArray<HarnessHook.OnBeforeAgentStart> =>
	hooks.flatMap((hook) => hook.phase === 'beforeAgentStart' ? [hook] : []);

const toolCallHooks = (
	hooks: ReadonlyArray<HarnessHook.Any>
): ReadonlyArray<HarnessHook.OnToolCall> =>
	hooks.flatMap((hook) => (hook.phase === 'toolCall' ? [hook] : []));

const toolResultHooks = (
	hooks: ReadonlyArray<HarnessHook.Any>
): ReadonlyArray<HarnessHook.OnToolResult> =>
	hooks.flatMap((hook) => (hook.phase === 'toolResult' ? [hook] : []));

const runHooks = <Input>(
	hooks: ReadonlyArray<{
		readonly id: string;
		readonly run: (
			input: Input
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}>,
	input: Input
): Effect.Effect<ReadonlyArray<DecisionValue>> =>
	Effect.forEach(hooks, (hook) => hook.run(input)).pipe(
		Effect.map((decisionsPerHook) =>
			decisionsPerHook.flatMap((decisions) => decisions)
		)
	);

export namespace HarnessController {
	export interface Interface {
		readonly onSessionStart: (input: {
			readonly commands: ReadonlyArray<unknown>;
			readonly cwd: string;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly onSessionTree: (input: {
			readonly commands: ReadonlyArray<unknown>;
			readonly cwd: string;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly onBeforeAgentStart: (input: {
			readonly activeBranch: ActiveBranch.Value;
			readonly cwd: string;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly onToolCall: (input: {
			readonly activeBranch: ActiveBranch.Value;
			readonly cwd: string;
			readonly input: unknown;
			readonly toolCallId: string;
			readonly toolName: string;
			readonly writeIntent: WriteIntentValue | undefined;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly onToolResult: (input: {
			readonly activeBranch: ActiveBranch.Value;
			readonly cwd: string;
			readonly input: unknown;
			readonly isError: boolean;
			readonly toolCallId: string;
			readonly toolName: string;
			readonly writeIntent: WriteIntentValue | undefined;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-harness/kernel/HarnessController'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const hookSet = yield* HookSet.Service;
			const ruleEngine = yield* RuleEngine.Service;

			const onSessionStart: Interface['onSessionStart'] = (input) =>
				Effect.flatMap(
					hookSet.all,
					(hooks) => runHooks(sessionStartHooks(hooks), input)
				);

			const onSessionTree: Interface['onSessionTree'] = (input) =>
				Effect.flatMap(
					hookSet.all,
					(hooks) => runHooks(sessionTreeHooks(hooks), input)
				);

			const onBeforeAgentStart: Interface['onBeforeAgentStart'] = (
				input
			) => Effect.gen(function*() {
				const hooks = yield* hookSet.all;
				const hookDecisions = yield* runHooks(
					beforeAgentStartHooks(hooks),
					input
				);
				const ruleDecisions = yield* ruleEngine
					.evaluateBeforeAgentStart({
						activeBranch: input.activeBranch,
						cwd: input.cwd
					});
				return [...hookDecisions, ...ruleDecisions];
			});

			const onToolCall: Interface['onToolCall'] = (input) =>
				Effect.gen(function*() {
					const hooks = yield* hookSet.all;
					const hookDecisions = yield* runHooks(
						toolCallHooks(hooks),
						input
					);
					const ruleDecisions = input.writeIntent === undefined
						? emptyDecisions
						: yield* ruleEngine.evaluateToolCall({
							activeBranch: input.activeBranch,
							cwd: input.cwd,
							writeIntent: input.writeIntent
						});
					return [...hookDecisions, ...ruleDecisions];
				});

			const onToolResult: Interface['onToolResult'] = (input) =>
				Effect.gen(function*() {
					const hooks = yield* hookSet.all;
					const hookDecisions = yield* runHooks(
						toolResultHooks(hooks),
						input
					);
					const ruleDecisions =
						input.writeIntent === undefined || input.isError
							? emptyDecisions
							: yield* ruleEngine.evaluateToolResult({
								activeBranch: input.activeBranch,
								cwd: input.cwd,
								toolName: input.toolName === 'edit'
									? 'edit'
									: 'write',
								writeIntent: input.writeIntent
							});
					return [...hookDecisions, ...ruleDecisions];
				});

			return Service.of({
				onSessionStart,
				onSessionTree,
				onBeforeAgentStart,
				onToolCall,
				onToolResult
			});
		})
	);
}
