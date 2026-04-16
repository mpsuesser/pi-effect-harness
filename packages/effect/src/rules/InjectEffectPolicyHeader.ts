import { Effect } from 'effect';

import { Decision } from 'pi-harness-kit/Decision.ts';
import type { HarnessRule } from 'pi-harness-kit/kernel/HarnessRule.ts';
import { activeBranchLoadedEffectSkills } from '../atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';

export const injectEffectPolicyHeaderRule = (deps: {
	readonly guidanceCatalog: GuidanceCatalog.Interface;
}): HarnessRule.BeforeAgentStart => ({
	id: 'effect.inject-policy-header',
	phase: 'beforeAgentStart',
	evaluate: Effect.fn('InjectEffectPolicyHeader.evaluate')(function*(input) {
		const content = yield* deps.guidanceCatalog.policyHeader(
			activeBranchLoadedEffectSkills(input.activeBranch)
		);
		return [new Decision.InjectSystemPrompt({ content })];
	})
});
