import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from '../../ActiveBranch.ts';

export const latestUserMessage = (branch: ActiveBranch.Value) =>
	branch.entries.findLast(
		(entry): entry is ActiveBranch.UserMessageEntry =>
			entry instanceof ActiveBranch.UserMessageEntry
	);

export const atom = (branch: ActiveBranch.Value) =>
	make(latestUserMessage(branch));
