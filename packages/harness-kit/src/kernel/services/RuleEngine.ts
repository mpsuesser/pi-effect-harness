import { Context, Effect, Layer, Schema } from 'effect';

import { Decision } from '../../Decision.ts';
import type { HarnessRule } from '../HarnessRule.ts';
import { RuleSet } from './RuleSet.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;

const beforeAgentStartRules = (
	rules: ReadonlyArray<HarnessRule.Any>
): ReadonlyArray<HarnessRule.BeforeAgentStart> =>
	rules.flatMap((rule) => rule.phase === 'beforeAgentStart' ? [rule] : []);

const toolCallRules = (
	rules: ReadonlyArray<HarnessRule.Any>
): ReadonlyArray<HarnessRule.ToolCall> =>
	rules.flatMap((rule) => (rule.phase === 'toolCall' ? [rule] : []));

const toolResultRules = (
	rules: ReadonlyArray<HarnessRule.Any>
): ReadonlyArray<HarnessRule.ToolResult> =>
	rules.flatMap((rule) => (rule.phase === 'toolResult' ? [rule] : []));

const runRules = <Input>(
	rules: ReadonlyArray<{
		readonly id: string;
		readonly evaluate: (
			input: Input
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}>,
	input: Input
): Effect.Effect<ReadonlyArray<DecisionValue>> =>
	Effect.forEach(rules, (rule) => rule.evaluate(input)).pipe(
		Effect.map((decisionsPerRule) =>
			decisionsPerRule.flatMap((decisions) => decisions)
		)
	);

export namespace RuleEngine {
	export interface Interface {
		readonly evaluateBeforeAgentStart: (
			input: HarnessRule.BeforeAgentStartInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly evaluateToolCall: (
			input: HarnessRule.ToolCallInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly evaluateToolResult: (
			input: HarnessRule.ToolResultInput
		) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/kernel/RuleEngine'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const ruleSet = yield* RuleSet.Service;

			return Service.of({
				evaluateBeforeAgentStart: (input) =>
					Effect.flatMap(
						ruleSet.all,
						(rules) => runRules(beforeAgentStartRules(rules), input)
					),
				evaluateToolCall: (input) =>
					Effect.flatMap(
						ruleSet.all,
						(rules) => runRules(toolCallRules(rules), input)
					),
				evaluateToolResult: (input) =>
					Effect.flatMap(
						ruleSet.all,
						(rules) => runRules(toolResultRules(rules), input)
					)
			});
		})
	);
}
