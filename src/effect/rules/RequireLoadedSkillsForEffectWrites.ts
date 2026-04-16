import { Effect, Option } from 'effect';

import { Decision } from '../../Decision.ts';
import type { HarnessRule } from '../../kernel/HarnessRule.ts';
import { WriteProjection } from '../../kernel/services/WriteProjection.ts';
import { activeBranchLoadedEffectSkills } from '../atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { EFFECT_CODE_RE, MIN_EFFECT_SKILLS } from '../constants.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';
import { PendingSkillReads } from '../services/PendingSkillReads.ts';

export const requireLoadedSkillsForEffectWritesRule = (deps: {
	readonly guidanceCatalog: GuidanceCatalog.Interface;
	readonly pendingSkillReads: PendingSkillReads.Interface;
	readonly writeProjection: WriteProjection.Interface;
}): HarnessRule.ToolCall => ({
	id: 'effect.require-loaded-skills-for-effect-writes',
	phase: 'toolCall',
	evaluate: Effect.fn('RequireLoadedSkillsForEffectWrites.evaluate')(
		function*(input) {
			const projection = yield* deps.writeProjection.prospective(
				input.cwd,
				input.writeIntent
			);
			const projectedContent = Option.getOrElse(
				projection.content,
				() => ''
			);
			if (!EFFECT_CODE_RE.test(projectedContent)) {
				return [];
			}

			const loaded = activeBranchLoadedEffectSkills(input.activeBranch);
			const pending = yield* deps.pendingSkillReads.names;
			const loadedCount = new Set([...loaded, ...pending]).size;

			return loadedCount < MIN_EFFECT_SKILLS
				? [
					new Decision.BlockToolCall({
						reason: yield* deps.guidanceCatalog.skillGateReason(
							loadedCount
						)
					})
				]
				: [];
		}
	)
});
