import { make } from 'effect/unstable/reactivity/Atom';

import { ActiveBranch } from '../../ActiveBranch.ts';

export const entries = (branch: ActiveBranch.Value) => branch.entries;

export const atom = (branch: ActiveBranch.Value) => make(entries(branch));
