import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from 'pi-harness-kit/ActiveBranch.ts';
import { SKILL_LOADED_ENTRY } from '../../constants.ts';

type ActiveBranchEntry = ActiveBranch.Value['entries'][number];

const latestCompactionIndex = (
	entries: ReadonlyArray<ActiveBranchEntry>
): number => {
	for (let index = entries.length - 1; index >= 0; index--) {
		if (entries[index] instanceof ActiveBranch.CompactionEntry) {
			return index;
		}
	}
	return -1;
};

const entriesSinceLatestCompaction = (
	branch: ActiveBranch.Value
): ReadonlyArray<ActiveBranchEntry> =>
	branch.entries.slice(latestCompactionIndex(branch.entries) + 1);

const loadedSkillName = (
	entry: ActiveBranchEntry
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

export const activeBranchLoadedEffectSkills = (
	branch: ActiveBranch.Value
): ReadonlySet<string> =>
	new Set(
		entriesSinceLatestCompaction(branch).flatMap((entry) => {
			const skillName = loadedSkillName(entry);
			return skillName === undefined ? [] : [skillName];
		})
	);

export const activeBranchLoadedEffectSkillsAtom = (
	branch: ActiveBranch.Value
) => make(activeBranchLoadedEffectSkills(branch));
