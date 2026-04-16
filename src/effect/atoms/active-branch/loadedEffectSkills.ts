import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from '../../../ActiveBranch.ts';
import { SKILL_LOADED_ENTRY } from '../../../constants.ts';

const loadedSkillName = (
	entry: ActiveBranch.Value['entries'][number]
): string | undefined => {
	if (
		!(entry instanceof ActiveBranch.CustomEntry) ||
		entry.customType !== SKILL_LOADED_ENTRY
	) {
		return undefined;
	}

	const data = entry.data;
	return data !== undefined &&
			typeof data === 'object' &&
			data !== null &&
			'name' in data &&
			typeof data.name === 'string' &&
			data.name.startsWith('effect-')
		? data.name
		: undefined;
};

export const loadedEffectSkills = (
	branch: ActiveBranch.Value
): ReadonlySet<string> =>
	new Set(
		branch.entries.flatMap((entry) => {
			const skillName = loadedSkillName(entry);
			return skillName === undefined ? [] : [skillName];
		})
	);

export const atom = (branch: ActiveBranch.Value) =>
	make(loadedEffectSkills(branch));
