import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from '../../ActiveBranch.ts';

export const activeBranchEntries = (branch: ActiveBranch.Value) =>
	branch.entries;

export const activeBranchEntriesAtom = (branch: ActiveBranch.Value) =>
	make(activeBranchEntries(branch));
