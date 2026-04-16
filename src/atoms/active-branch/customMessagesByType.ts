import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from '../../ActiveBranch.ts';

export const customMessagesByType = (branch: ActiveBranch.Value) =>
	branch.entries
		.filter(
			(entry): entry is ActiveBranch.CustomMessageEntry =>
				entry instanceof ActiveBranch.CustomMessageEntry
		)
		.reduce<
			ReadonlyMap<string, ReadonlyArray<ActiveBranch.CustomMessageEntry>>
		>(
			(grouped, entry) =>
				new Map(grouped).set(entry.customType, [
					...(grouped.get(entry.customType) ?? []),
					entry
				]),
			new Map<string, ReadonlyArray<ActiveBranch.CustomMessageEntry>>()
		);

export const atom = (branch: ActiveBranch.Value) =>
	make(customMessagesByType(branch));
