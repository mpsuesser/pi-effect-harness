import { Effect, Option, Predicate } from 'effect';

import { Decision } from 'pi-harness-kit/Decision.ts';
import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import { activeBranchLoadedEffectSkills } from '../atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { SKILL_LOADED_ENTRY, SKILL_READ_ENTRY } from '../constants.ts';
import type { PendingSkillReads } from '../services/PendingSkillReads.ts';
import type { SkillCatalog } from '../services/SkillCatalog.ts';
import type { SkillReadTelemetry } from '../services/SkillReadTelemetry.ts';

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
	readonly skillReadTelemetry: SkillReadTelemetry.Interface;
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
			const normalizedPath = yield* deps.skillCatalog.normalizePath(
				readPath,
				input.cwd
			);
			const matchedSkill = yield* deps.skillCatalog.matchPath(
				normalizedPath
			);
			if (
				Option.isNone(matchedSkill) ||
				matchedSkill.value.name !== pendingSkill
			) {
				return noDecisions;
			}

			const record = yield* deps.skillReadTelemetry.recordRead({
				source: 'read-tool',
				skill: matchedSkill.value,
				readPath: normalizedPath,
				cwd: input.cwd,
				sessionId: input.sessionId,
				...(input.sessionFile === undefined
					? undefined
					: { sessionFile: input.sessionFile }),
				toolCallId: input.toolCallId
			});
			const decisions = [
				new Decision.AppendCustomEntry({
					customType: SKILL_READ_ENTRY,
					data: record
				})
			];

			return activeBranchLoadedEffectSkills(input.activeBranch).has(
					pendingSkill
				)
				? decisions
				: [
					...decisions,
					new Decision.AppendCustomEntry({
						customType: SKILL_LOADED_ENTRY,
						data: { name: pendingSkill, path: normalizedPath }
					})
				];
		})
});
