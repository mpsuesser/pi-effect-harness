import { Effect } from 'effect';

import type { HarnessHook } from '../../kernel/HarnessHook.ts';
import type { EffectVersion } from '../services/EffectVersion.ts';

const noDecisions = [] as const;

export const refreshEffectVersionHooks = (deps: {
	readonly effectVersion: EffectVersion.Interface;
}): ReadonlyArray<HarnessHook.Any> => [
	{
		id: 'effect.refresh-effect-version.session-start',
		phase: 'sessionStart',
		run: (input) =>
			Effect.as(deps.effectVersion.refresh(input.cwd), noDecisions)
	}
];
