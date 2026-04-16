import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from '../../../ActiveBranch.ts';
import { loadedEffectSkills } from './loadedEffectSkills.ts';

export const loadedEffectSkillCount = (branch: ActiveBranch.Value): number =>
	loadedEffectSkills(branch).size;

export const atom = (branch: ActiveBranch.Value) =>
	make(loadedEffectSkillCount(branch));
