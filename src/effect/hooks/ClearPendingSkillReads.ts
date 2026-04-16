import { Effect } from 'effect';

import type { HarnessHook } from '../../kernel/HarnessHook.ts';
import type { PendingSkillReads } from '../services/PendingSkillReads.ts';

const noDecisions = [] as const;

export const clearPendingSkillReadsHooks = (deps: {
	readonly pendingSkillReads: PendingSkillReads.Interface;
}): ReadonlyArray<HarnessHook.Any> => [
	{
		id: 'effect.clear-pending-skill-reads.session-start',
		phase: 'sessionStart',
		run: () => Effect.as(deps.pendingSkillReads.clear, noDecisions)
	},
	{
		id: 'effect.clear-pending-skill-reads.session-tree',
		phase: 'sessionTree',
		run: () => Effect.as(deps.pendingSkillReads.clear, noDecisions)
	}
];
