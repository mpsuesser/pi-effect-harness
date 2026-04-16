import { Effect, Option, Predicate } from 'effect';

import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { PendingSkillReads } from '../services/PendingSkillReads.ts';
import type { SkillCatalog } from '../services/SkillCatalog.ts';

const noDecisions = [] as const;

const readPathFromInput = (input: unknown): string | undefined => {
	if (!Predicate.isReadonlyObject(input)) {
		return undefined;
	}
	const value = input.path;
	return typeof value === 'string' ? value : undefined;
};

export const trackSkillReadHook = (deps: {
	readonly pendingSkillReads: PendingSkillReads.Interface;
	readonly skillCatalog: SkillCatalog.Interface;
}): HarnessHook.OnToolCall => ({
	id: 'effect.track-skill-read.tool-call',
	phase: 'toolCall',
	run: (input) =>
		Effect.gen(function*() {
			const readPath = readPathFromInput(input.input);
			if (readPath === undefined) {
				return noDecisions;
			}
			const normalizedPath = yield* deps.skillCatalog.normalizePath(
				readPath,
				input.cwd
			);
			const matchedSkill = yield* deps.skillCatalog.matchPath(
				normalizedPath
			);
			if (Option.isSome(matchedSkill)) {
				yield* deps.pendingSkillReads.remember(
					input.toolCallId,
					matchedSkill.value.name
				);
			}
			return noDecisions;
		})
});
