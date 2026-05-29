import * as NodeChildProcessSpawner from '@effect/platform-node/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer, Path } from 'effect';
import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { HarnessRule } from 'pi-harness-kit/kernel/HarnessRule.ts';
import { KernelLayer } from 'pi-harness-kit/kernel/layers/KernelLayer.ts';
import { HarnessController } from 'pi-harness-kit/kernel/services/HarnessController.ts';
import { HookSet } from 'pi-harness-kit/kernel/services/HookSet.ts';
import { PatternCatalog } from 'pi-harness-kit/kernel/services/PatternCatalog.ts';
import { PatternMatcher } from 'pi-harness-kit/kernel/services/PatternMatcher.ts';
import { RuleEngine } from 'pi-harness-kit/kernel/services/RuleEngine.ts';
import { RuleSet } from 'pi-harness-kit/kernel/services/RuleSet.ts';
import { WriteProjection } from 'pi-harness-kit/kernel/services/WriteProjection.ts';
import { GitBranch } from 'pi-harness-kit/mode/GitBranch.ts';
import { ModePersistence } from 'pi-harness-kit/mode/ModePersistence.ts';
import { ModeState } from 'pi-harness-kit/mode/ModeState.ts';

import { clearPendingSkillReadsHooks } from '../hooks/ClearPendingSkillReads.ts';
import { emitSkillLoadedEntryHook } from '../hooks/EmitSkillLoadedEntry.ts';
import { ensureReferenceCloneHooks } from '../hooks/EnsureReferenceClone.ts';
import { rebuildSkillCatalogHooks } from '../hooks/RebuildSkillCatalog.ts';
import { trackSkillReadHook } from '../hooks/TrackSkillRead.ts';
import { injectEffectPolicyHeaderRule } from '../rules/InjectEffectPolicyHeader.ts';
import { requireLoadedSkillsForEffectWritesRule } from '../rules/RequireLoadedSkillsForEffectWrites.ts';
import { sendPatternFeedbackAfterWriteRule } from '../rules/SendPatternFeedbackAfterWrite.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';
import { PendingSkillReads } from '../services/PendingSkillReads.ts';
import { ReferenceClone } from '../services/ReferenceClone.ts';
import { SkillCatalog } from '../services/SkillCatalog.ts';
import { SkillReadTelemetry } from '../services/SkillReadTelemetry.ts';

export namespace EffectHarnessLayer {
	export interface Options {
		readonly agentDir: string;
	}

	const nodePlatformLayer = NodeChildProcessSpawner.layer.pipe(
		Layer.provideMerge(
			Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
		)
	);

	const packageRootSegments = [import.meta.dirname ?? '.', '..', '..'];

	const kernelLayer = Layer.unwrap(
		Effect.gen(function*() {
			const path = yield* Path.Path;
			const patternsDir = path.resolve(
				...packageRootSegments,
				'patterns'
			);
			return KernelLayer.layer(patternsDir);
		})
	).pipe(Layer.provide(nodePlatformLayer));

	const guidanceCatalogLayer = Layer.unwrap(
		Effect.gen(function*() {
			const path = yield* Path.Path;
			const guidanceDir = path.resolve(
				...packageRootSegments,
				'guidance'
			);
			return GuidanceCatalog.layer(guidanceDir);
		})
	).pipe(Layer.provide(nodePlatformLayer));

	const gitBranchLayer = GitBranch.layer.pipe(
		Layer.provide(nodePlatformLayer)
	);

	const modePersistenceLayer = ModePersistence.layer.pipe(
		Layer.provide(Layer.mergeAll(nodePlatformLayer, gitBranchLayer))
	);

	const skillCatalogLayer = SkillCatalog.layer.pipe(
		Layer.provide(nodePlatformLayer)
	);

	const skillReadTelemetryLayer = (options: Options) =>
		Layer.unwrap(
			Effect.gen(function*() {
				const path = yield* Path.Path;
				return SkillReadTelemetry.layer(
					path.join(
						options.agentDir,
						'pi-effect-harness',
						'skill-reads.jsonl'
					)
				);
			})
		).pipe(Layer.provide(nodePlatformLayer));

	export const layer = (options: Options) => {
		const baseLayer = Layer.mergeAll(
			kernelLayer,
			PendingSkillReads.layer,
			gitBranchLayer,
			guidanceCatalogLayer,
			modePersistenceLayer,
			ModeState.layer,
			ReferenceClone.layer,
			skillCatalogLayer,
			skillReadTelemetryLayer(options)
		);

		const effectRuleSetLayer = Layer.effect(
			RuleSet.Service,
			Effect.gen(function*() {
				const guidanceCatalog = yield* GuidanceCatalog.Service;
				const modeState = yield* ModeState.Service;
				const patternCatalog = yield* PatternCatalog.Service;
				const patternMatcher = yield* PatternMatcher.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const writeProjection = yield* WriteProjection.Service;

				const rules: ReadonlyArray<HarnessRule.Any> = [
					injectEffectPolicyHeaderRule({ guidanceCatalog }),
					requireLoadedSkillsForEffectWritesRule({
						guidanceCatalog,
						pendingSkillReads,
						writeProjection
					}),
					sendPatternFeedbackAfterWriteRule({
						guidanceCatalog,
						patternCatalog,
						patternMatcher,
						writeProjection
					})
				];

				return RuleSet.Service.of({
					all: Effect.gen(function*() {
						const enabled = yield* modeState.isEnabled;
						return enabled ? rules : [];
					})
				});
			})
		).pipe(Layer.provide(baseLayer));

		const effectHookSetLayer = HookSet.fromEffect(
			Effect.gen(function*() {
				const modeState = yield* ModeState.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const referenceClone = yield* ReferenceClone.Service;
				const skillCatalog = yield* SkillCatalog.Service;
				const skillReadTelemetry = yield* SkillReadTelemetry.Service;

				const hooks: ReadonlyArray<HarnessHook.Any> = [
					...clearPendingSkillReadsHooks({ pendingSkillReads }),
					...rebuildSkillCatalogHooks({ skillCatalog }),
					...ensureReferenceCloneHooks({
						modeState,
						referenceClone
					}),
					trackSkillReadHook({ pendingSkillReads, skillCatalog }),
					emitSkillLoadedEntryHook({
						pendingSkillReads,
						skillCatalog,
						skillReadTelemetry
					})
				];
				return hooks;
			})
		).pipe(Layer.provide(baseLayer));

		const ruleEngineLayer = RuleEngine.layer.pipe(
			Layer.provideMerge(Layer.mergeAll(baseLayer, effectRuleSetLayer))
		);

		const harnessControllerLayer = HarnessController.layer.pipe(
			Layer.provideMerge(
				Layer.mergeAll(baseLayer, effectHookSetLayer, ruleEngineLayer)
			)
		);

		return Layer.mergeAll(
			baseLayer,
			effectRuleSetLayer,
			effectHookSetLayer,
			ruleEngineLayer,
			harnessControllerLayer
		);
	};
}
