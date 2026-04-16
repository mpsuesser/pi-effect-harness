import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from '../../ActiveBranch.ts';

export const activeBranchCustomEntriesByType = (branch: ActiveBranch.Value) =>
	branch.entries
		.filter(
			(entry): entry is ActiveBranch.CustomEntry =>
				entry instanceof ActiveBranch.CustomEntry
		)
		.reduce<ReadonlyMap<string, ReadonlyArray<ActiveBranch.CustomEntry>>>(
			(grouped, entry) =>
				new Map(grouped).set(entry.customType, [
					...(grouped.get(entry.customType) ?? []),
					entry
				]),
			new Map<string, ReadonlyArray<ActiveBranch.CustomEntry>>()
		);

export const activeBranchCustomEntriesByTypeAtom = (
	branch: ActiveBranch.Value
) => make(activeBranchCustomEntriesByType(branch));
