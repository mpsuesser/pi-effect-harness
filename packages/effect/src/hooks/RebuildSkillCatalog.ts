import { Effect } from 'effect';

import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { SkillCatalog } from '../services/SkillCatalog.ts';

const noDecisions = [] as const;

const rebuild = (
	skillCatalog: SkillCatalog.Interface,
	input: { readonly commands: ReadonlyArray<unknown>; readonly cwd: string; }
) => Effect.as(skillCatalog.rebuild(input.commands, input.cwd), noDecisions);

export const rebuildSkillCatalogHooks = (deps: {
	readonly skillCatalog: SkillCatalog.Interface;
}): ReadonlyArray<HarnessHook.Any> => [
	{
		id: 'effect.rebuild-skill-catalog.session-start',
		phase: 'sessionStart',
		run: (input) => rebuild(deps.skillCatalog, input)
	},
	{
		id: 'effect.rebuild-skill-catalog.session-tree',
		phase: 'sessionTree',
		run: (input) => rebuild(deps.skillCatalog, input)
	}
];
