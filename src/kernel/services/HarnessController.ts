import { Context, Effect, Layer, Option, Predicate, Schema } from 'effect';

import { ActiveBranch } from '../../ActiveBranch.ts';
import { SKILL_LOADED_ENTRY } from '../../constants.ts';
import { Decision } from '../../Decision.ts';
import { activeBranchLoadedEffectSkills } from '../../effect/atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { EffectVersion } from '../../effect/services/EffectVersion.ts';
import { ModeState } from '../../effect/services/ModeState.ts';
import { PendingSkillReads } from '../../effect/services/PendingSkillReads.ts';
import { ReferenceClone } from '../../effect/services/ReferenceClone.ts';
import { SkillCatalog } from '../../effect/services/SkillCatalog.ts';
import { WriteIntent } from '../../WriteIntent.ts';
import { RuleEngine } from './RuleEngine.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;
type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

const emptyDecisions: ReadonlyArray<DecisionValue> = [];

const readPathFromInput = (input: unknown): string | undefined => {
	if (!Predicate.isReadonlyObject(input)) {
		return undefined;
	}

	const value = input.path;
	return typeof value === 'string' ? value : undefined;
};

export namespace HarnessController {
	export interface Interface {
		readonly onSessionStart: (input: {
			readonly commands: ReadonlyArray<SkillCatalog.CommandInfo>;
			readonly cwd: string;
		}) => Effect.Effect<ReadonlyArray<DecisionValue>>;
		readonly onSessionTree: (input: {
			readonly commands: ReadonlyArray<SkillCatalog.CommandInfo>;
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
		'pi-effect-enforcer/kernel/HarnessController'
	) {}

	export const layer = Layer.effect(
		Service,
		Effect.gen(function*() {
			const effectVersion = yield* EffectVersion.Service;
			const modeState = yield* ModeState.Service;
			const pendingSkillReads = yield* PendingSkillReads.Service;
			const referenceClone = yield* ReferenceClone.Service;
			const ruleEngine = yield* RuleEngine.Service;
			const skillCatalog = yield* SkillCatalog.Service;

			const ensureReferenceIfEnabled = (cwd: string) =>
				Effect.gen(function*() {
					const enabled = yield* modeState.isEnabled;
					if (!enabled) {
						return;
					}

					yield* referenceClone.ensure(cwd, yield* effectVersion.get);
				});

			const onSessionStart: Interface['onSessionStart'] = (input) =>
				Effect.gen(function*() {
					yield* pendingSkillReads.clear;
					yield* skillCatalog.rebuild(input.commands, input.cwd);
					yield* effectVersion.refresh(input.cwd);
					yield* ensureReferenceIfEnabled(input.cwd);
					return emptyDecisions;
				});

			const onSessionTree: Interface['onSessionTree'] = (input) =>
				Effect.gen(function*() {
					yield* pendingSkillReads.clear;
					yield* skillCatalog.rebuild(input.commands, input.cwd);
					return emptyDecisions;
				});

			const onBeforeAgentStart: Interface['onBeforeAgentStart'] = (
				input
			) => Effect.gen(function*() {
				yield* ensureReferenceIfEnabled(input.cwd);
				return yield* ruleEngine.evaluateBeforeAgentStart({
					activeBranch: input.activeBranch,
					cwd: input.cwd
				});
			});

			const onToolCall: Interface['onToolCall'] = (input) =>
				Effect.gen(function*() {
					const readPath = readPathFromInput(input.input);
					if (readPath !== undefined) {
						const normalizedPath = yield* skillCatalog
							.normalizePath(
								readPath,
								input.cwd
							);
						const matchedSkill = yield* skillCatalog.matchPath(
							normalizedPath
						);
						if (Option.isSome(matchedSkill)) {
							yield* pendingSkillReads.remember(
								input.toolCallId,
								matchedSkill.value.name
							);
						}
					}

					return input.writeIntent === undefined
						? emptyDecisions
						: yield* ruleEngine.evaluateToolCall({
							activeBranch: input.activeBranch,
							cwd: input.cwd,
							writeIntent: input.writeIntent
						});
				});

			const onToolResult: Interface['onToolResult'] = (input) =>
				Effect.gen(function*() {
					const pendingSkill = yield* pendingSkillReads.take(
						input.toolCallId
					);
					const readPath = readPathFromInput(input.input);
					const appendSkillDecision = !input.isError &&
							pendingSkill !== undefined &&
							readPath !== undefined &&
							!activeBranchLoadedEffectSkills(input.activeBranch)
								.has(
									pendingSkill
								)
						? [
							new Decision.AppendCustomEntry({
								customType: SKILL_LOADED_ENTRY,
								data: {
									name: pendingSkill,
									path: yield* skillCatalog.normalizePath(
										readPath,
										input.cwd
									)
								}
							})
						]
						: emptyDecisions;

					const patternDecisions =
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

					return [...appendSkillDecision, ...patternDecisions];
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
