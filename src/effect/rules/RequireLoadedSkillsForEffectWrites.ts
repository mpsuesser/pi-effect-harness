import { Effect, Option, Schema } from 'effect';

import { ActiveBranch } from '../../ActiveBranch.ts';
import { EFFECT_CODE_RE, MIN_EFFECT_SKILLS } from '../../constants.ts';
import { Decision } from '../../Decision.ts';
import { WriteProjection } from '../../kernel/services/WriteProjection.ts';
import { WriteIntent } from '../../WriteIntent.ts';
import { activeBranchLoadedEffectSkills } from '../atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';
import { PendingSkillReads } from '../services/PendingSkillReads.ts';

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;
type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

export const evaluate = Effect.fn(
	'RequireLoadedSkillsForEffectWrites.evaluate'
)(function*({
	activeBranch,
	cwd,
	guidanceCatalog,
	pendingSkillReads,
	writeIntent,
	writeProjection
}: {
	readonly activeBranch: ActiveBranch.Value;
	readonly cwd: string;
	readonly guidanceCatalog: GuidanceCatalog.Interface;
	readonly pendingSkillReads: PendingSkillReads.Interface;
	readonly writeIntent: WriteIntentValue;
	readonly writeProjection: WriteProjection.Interface;
}): Effect.fn.Return<ReadonlyArray<DecisionValue>> {
	const projection = yield* writeProjection.prospective(cwd, writeIntent);
	const projectedContent = Option.getOrElse(projection.content, () => '');
	if (!EFFECT_CODE_RE.test(projectedContent)) {
		return [];
	}

	const loaded = activeBranchLoadedEffectSkills(activeBranch);
	const pending = yield* pendingSkillReads.names;
	const loadedCount = new Set([...loaded, ...pending]).size;

	return loadedCount < MIN_EFFECT_SKILLS
		? [
			new Decision.BlockToolCall({
				reason: yield* guidanceCatalog.skillGateReason(loadedCount)
			})
		]
		: [];
});
