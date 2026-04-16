import { Effect } from 'effect';

import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { ModeState } from 'pi-harness-kit/mode/ModeState.ts';
import type { EffectVersion } from '../services/EffectVersion.ts';
import type { ReferenceClone } from '../services/ReferenceClone.ts';

const noDecisions = [] as const;

const ensureIfEnabled = (
	deps: {
		readonly effectVersion: EffectVersion.Interface;
		readonly modeState: ModeState.Interface;
		readonly referenceClone: ReferenceClone.Interface;
	},
	cwd: string
) => Effect.gen(function*() {
	const enabled = yield* deps.modeState.isEnabled;
	if (!enabled) {
		return noDecisions;
	}
	const version = yield* deps.effectVersion.get;
	yield* deps.referenceClone.ensure(cwd, version);
	return noDecisions;
});

export const ensureReferenceCloneHooks = (deps: {
	readonly effectVersion: EffectVersion.Interface;
	readonly modeState: ModeState.Interface;
	readonly referenceClone: ReferenceClone.Interface;
}): ReadonlyArray<HarnessHook.Any> => [
	{
		id: 'effect.ensure-reference-clone.session-start',
		phase: 'sessionStart',
		run: (input) => ensureIfEnabled(deps, input.cwd)
	},
	{
		id: 'effect.ensure-reference-clone.before-agent-start',
		phase: 'beforeAgentStart',
		run: (input) => ensureIfEnabled(deps, input.cwd)
	}
];
