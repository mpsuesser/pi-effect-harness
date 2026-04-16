import { Effect, Schema } from 'effect';

import { ActiveBranch } from '../../ActiveBranch.ts';
import { Decision } from '../../Decision.ts';
import { activeBranchLoadedEffectSkills } from '../atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;

export const evaluate = Effect.fn('InjectEffectPolicyHeader.evaluate')(
	function*({
		activeBranch,
		guidanceCatalog
	}: {
		readonly activeBranch: ActiveBranch.Value;
		readonly guidanceCatalog: GuidanceCatalog.Interface;
	}): Effect.fn.Return<ReadonlyArray<DecisionValue>> {
		const content = yield* guidanceCatalog.policyHeader(
			activeBranchLoadedEffectSkills(activeBranch)
		);
		return [new Decision.InjectSystemPrompt({ content })];
	}
);
