import * as NodeChildProcessSpawner from '@effect/platform-node/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';

import type { HarnessHook } from '../../kernel/HarnessHook.ts';
import type { HarnessRule } from '../../kernel/HarnessRule.ts';
import { KernelLayer } from '../../kernel/layers/KernelLayer.ts';
import { HarnessController } from '../../kernel/services/HarnessController.ts';
import { HookSet } from '../../kernel/services/HookSet.ts';
import { PatternCatalog } from '../../kernel/services/PatternCatalog.ts';
import { PatternMatcher } from '../../kernel/services/PatternMatcher.ts';
import { RuleEngine } from '../../kernel/services/RuleEngine.ts';
import { RuleSet } from '../../kernel/services/RuleSet.ts';
import { WriteProjection } from '../../kernel/services/WriteProjection.ts';
import { clearPendingSkillReadsHooks } from '../hooks/ClearPendingSkillReads.ts';
import { emitSkillLoadedEntryHook } from '../hooks/EmitSkillLoadedEntry.ts';
import { ensureReferenceCloneHooks } from '../hooks/EnsureReferenceClone.ts';
import { rebuildSkillCatalogHooks } from '../hooks/RebuildSkillCatalog.ts';
import { refreshEffectVersionHooks } from '../hooks/RefreshEffectVersion.ts';
import { trackSkillReadHook } from '../hooks/TrackSkillRead.ts';
import { injectEffectPolicyHeaderRule } from '../rules/InjectEffectPolicyHeader.ts';
import { requireLoadedSkillsForEffectWritesRule } from '../rules/RequireLoadedSkillsForEffectWrites.ts';
import { sendPatternFeedbackAfterWriteRule } from '../rules/SendPatternFeedbackAfterWrite.ts';
import { EffectVersion } from '../services/EffectVersion.ts';
import { GitBranch } from '../services/GitBranch.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';
import { ModePersistence } from '../services/ModePersistence.ts';
import { ModeState } from '../services/ModeState.ts';
import { PendingSkillReads } from '../services/PendingSkillReads.ts';
import { ReferenceClone } from '../services/ReferenceClone.ts';
import { SkillCatalog } from '../services/SkillCatalog.ts';

export namespace EffectHarnessLayer {
	const nodePlatformLayer = NodeChildProcessSpawner.layer.pipe(
		Layer.provideMerge(
			Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
		)
	);

	const kernelLayer = KernelLayer.layer.pipe(
		Layer.provide(nodePlatformLayer)
	);

	const gitBranchLayer = GitBranch.layer.pipe(
		Layer.provide(nodePlatformLayer)
	);

	const modePersistenceLayer = ModePersistence.layer.pipe(
		Layer.provide(Layer.mergeAll(nodePlatformLayer, gitBranchLayer))
	);

	const skillCatalogLayer = SkillCatalog.layer.pipe(
		Layer.provide(nodePlatformLayer)
	);

	const baseLayer = Layer.mergeAll(
		kernelLayer,
		PendingSkillReads.layer,
		EffectVersion.layer,
		gitBranchLayer,
		GuidanceCatalog.layer,
		modePersistenceLayer,
		ModeState.layer,
		ReferenceClone.layer,
		skillCatalogLayer
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
			const effectVersion = yield* EffectVersion.Service;
			const modeState = yield* ModeState.Service;
			const pendingSkillReads = yield* PendingSkillReads.Service;
			const referenceClone = yield* ReferenceClone.Service;
			const skillCatalog = yield* SkillCatalog.Service;

			const hooks: ReadonlyArray<HarnessHook.Any> = [
				...clearPendingSkillReadsHooks({ pendingSkillReads }),
				...rebuildSkillCatalogHooks({ skillCatalog }),
				...refreshEffectVersionHooks({ effectVersion }),
				...ensureReferenceCloneHooks({
					effectVersion,
					modeState,
					referenceClone
				}),
				trackSkillReadHook({ pendingSkillReads, skillCatalog }),
				emitSkillLoadedEntryHook({ pendingSkillReads, skillCatalog })
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

	export const layer = Layer.mergeAll(
		baseLayer,
		effectRuleSetLayer,
		effectHookSetLayer,
		ruleEngineLayer,
		harnessControllerLayer
	);
}
