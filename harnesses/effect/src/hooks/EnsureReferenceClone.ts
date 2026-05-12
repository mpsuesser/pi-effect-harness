import { Effect } from 'effect';

import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { ModeState } from 'pi-harness-kit/mode/ModeState.ts';
import type { ReferenceClone } from '../services/ReferenceClone.ts';

const noDecisions = [] as const;

const ensureIfEnabled = (deps: {
	readonly modeState: ModeState.Interface;
	readonly referenceClone: ReferenceClone.Interface;
}) =>
	Effect.gen(function*() {
		const enabled = yield* deps.modeState.isEnabled;
		if (!enabled) {
			return noDecisions;
		}
		yield* deps.referenceClone.ensure();
		return noDecisions;
	});

export const ensureReferenceCloneHooks = (deps: {
	readonly modeState: ModeState.Interface;
	readonly referenceClone: ReferenceClone.Interface;
}): ReadonlyArray<HarnessHook.Any> => [
	{
		id: 'effect.ensure-reference-clone.session-start',
		phase: 'sessionStart',
		run: () => ensureIfEnabled(deps)
	},
	{
		id: 'effect.ensure-reference-clone.before-agent-start',
		phase: 'beforeAgentStart',
		run: () => ensureIfEnabled(deps)
	}
];
