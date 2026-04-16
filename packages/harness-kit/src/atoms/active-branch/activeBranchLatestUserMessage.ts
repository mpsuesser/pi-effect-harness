import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from '../../ActiveBranch.ts';

export const activeBranchLatestUserMessage = (branch: ActiveBranch.Value) =>
	branch.entries.findLast(
		(entry): entry is ActiveBranch.UserMessageEntry =>
			entry instanceof ActiveBranch.UserMessageEntry
	);

export const activeBranchLatestUserMessageAtom = (branch: ActiveBranch.Value) =>
	make(activeBranchLatestUserMessage(branch));
