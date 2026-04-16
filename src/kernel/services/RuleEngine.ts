import { Context, Effect, Layer, Schema } from 'effect';

import { ActiveBranch } from '../../ActiveBranch.ts';
import { Decision } from '../../Decision.ts';
import * as InjectEffectPolicyHeader from '../../effect/rules/InjectEffectPolicyHeader.ts';
import * as RequireLoadedSkillsForEffectWrites from '../../effect/rules/RequireLoadedSkillsForEffectWrites.ts';
import * as SendPatternFeedbackAfterWrite from '../../effect/rules/SendPatternFeedbackAfterWrite.ts';
import { GuidanceCatalog } from '../../effect/services/GuidanceCatalog.ts';
import { ModeState } from '../../effect/services/ModeState.ts';
import { PendingSkillReads } from '../../effect/services/PendingSkillReads.ts';
import { WriteIntent } from '../../WriteIntent.ts';
import { PatternCatalog } from './PatternCatalog.ts';
import { PatternMatcher } from './PatternMatcher.ts';
import { WriteProjection } from './WriteProjection.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;
type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

const emptyDecisions: ReadonlyArray<DecisionValue> = [];

export namespace RuleEngine {
	export interface Interface {
		readonly evaluateBeforeAgentStart: (input: {
			readonly activeBranch: ActiveBranch.Value;
			readonly cwd: string;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly evaluateToolCall: (input: {
			readonly activeBranch: ActiveBranch.Value;
			readonly cwd: string;
			readonly writeIntent: WriteIntentValue;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly evaluateToolResult: (input: {
			readonly activeBranch: ActiveBranch.Value;
			readonly cwd: string;
			readonly toolName: 'write' | 'edit';
			readonly writeIntent: WriteIntentValue;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-effect-enforcer/kernel/RuleEngine'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const modeState = yield* ModeState.Service;
			const guidanceCatalog = yield* GuidanceCatalog.Service;
			const patternCatalog = yield* PatternCatalog.Service;
			const patternMatcher = yield* PatternMatcher.Service;
			const pendingSkillReads = yield* PendingSkillReads.Service;
			const writeProjection = yield* WriteProjection.Service;

			const evaluateBeforeAgentStart:
				Interface['evaluateBeforeAgentStart'] = (
					input
				) => modeState.isEnabled.pipe(
					Effect.flatMap((enabled) =>
						enabled
							? InjectEffectPolicyHeader.evaluate({
								activeBranch: input.activeBranch,
								guidanceCatalog
							})
							: Effect.succeed(emptyDecisions)
					)
				);

			const evaluateToolCall: Interface['evaluateToolCall'] = (input) =>
				modeState.isEnabled.pipe(
					Effect.flatMap((enabled) =>
						enabled
							? RequireLoadedSkillsForEffectWrites.evaluate({
								activeBranch: input.activeBranch,
								cwd: input.cwd,
								guidanceCatalog,
								pendingSkillReads,
								writeIntent: input.writeIntent,
								writeProjection
							})
							: Effect.succeed(emptyDecisions)
					)
				);

			const evaluateToolResult: Interface['evaluateToolResult'] = (
				input
			) => modeState.isEnabled.pipe(
				Effect.flatMap((enabled) =>
					enabled
						? SendPatternFeedbackAfterWrite.evaluate({
							cwd: input.cwd,
							guidanceCatalog,
							patternCatalog,
							patternMatcher,
							toolName: input.toolName,
							writeIntent: input.writeIntent,
							writeProjection
						})
						: Effect.succeed(emptyDecisions)
				)
			);

			return Service.of({
				evaluateBeforeAgentStart,
				evaluateToolCall,
				evaluateToolResult
			});
		})
	);
}
