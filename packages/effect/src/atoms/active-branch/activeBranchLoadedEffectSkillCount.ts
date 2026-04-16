import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from 'pi-harness-kit/ActiveBranch.ts';
import { activeBranchLoadedEffectSkills } from './activeBranchLoadedEffectSkills.ts';

export const activeBranchLoadedEffectSkillCount = (
	branch: ActiveBranch.Value
): number => activeBranchLoadedEffectSkills(branch).size;

export const activeBranchLoadedEffectSkillCountAtom = (
	branch: ActiveBranch.Value
) => make(activeBranchLoadedEffectSkillCount(branch));
