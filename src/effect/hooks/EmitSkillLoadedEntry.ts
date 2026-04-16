import { Effect, Predicate } from 'effect';

import { Decision } from '../../Decision.ts';
import type { HarnessHook } from '../../kernel/HarnessHook.ts';
import { activeBranchLoadedEffectSkills } from '../atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { SKILL_LOADED_ENTRY } from '../constants.ts';
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

export const emitSkillLoadedEntryHook = (deps: {
	readonly pendingSkillReads: PendingSkillReads.Interface;
	readonly skillCatalog: SkillCatalog.Interface;
}): HarnessHook.OnToolResult => ({
	id: 'effect.emit-skill-loaded-entry.tool-result',
	phase: 'toolResult',
	run: (input) =>
		Effect.gen(function*() {
			const pendingSkill = yield* deps.pendingSkillReads.take(
				input.toolCallId
			);
			if (pendingSkill === undefined || input.isError) {
				return noDecisions;
			}
			const readPath = readPathFromInput(input.input);
			if (readPath === undefined) {
				return noDecisions;
			}
			if (
				activeBranchLoadedEffectSkills(input.activeBranch).has(
					pendingSkill
				)
			) {
				return noDecisions;
			}
			const normalizedPath = yield* deps.skillCatalog.normalizePath(
				readPath,
				input.cwd
			);
			return [
				new Decision.AppendCustomEntry({
					customType: SKILL_LOADED_ENTRY,
					data: { name: pendingSkill, path: normalizedPath }
				})
			];
		})
});
