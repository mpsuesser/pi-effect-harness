import * as NodeChildProcessSpawner from '@effect/platform-node/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Layer } from 'effect';

import { KernelLayer } from '../../kernel/layers/KernelLayer.ts';
import { HarnessController } from '../../kernel/services/HarnessController.ts';
import { RuleEngine } from '../../kernel/services/RuleEngine.ts';
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

	const ruleEngineLayer = RuleEngine.layer.pipe(
		Layer.provideMerge(baseLayer)
	);

	const harnessControllerLayer = HarnessController.layer.pipe(
		Layer.provideMerge(Layer.mergeAll(baseLayer, ruleEngineLayer))
	);

	export const layer = Layer.mergeAll(
		baseLayer,
		ruleEngineLayer,
		harnessControllerLayer
	);
}
