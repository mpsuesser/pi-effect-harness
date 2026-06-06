import { describe, expect, it } from '@effect/vitest';

import { ActiveBranch } from 'pi-harness-kit/ActiveBranch.ts';
import { activeBranchLoadedEffectSkills } from '../src/atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { SKILL_LOADED_ENTRY } from '../src/constants.ts';

const loadedSkill = (id: string, name: string) =>
	new ActiveBranch.CustomEntry({
		id,
		customType: SKILL_LOADED_ENTRY,
		data: { name, path: `/skills/${name}/SKILL.md` }
	});

const compaction = (id: string) =>
	new ActiveBranch.CompactionEntry({
		id,
		summary: 'Compacted earlier context.',
		firstKeptEntryId: `${id}-first-kept`,
		tokensBefore: 1234
	});

const names = (branch: ActiveBranch.Value): ReadonlyArray<string> =>
	[...activeBranchLoadedEffectSkills(branch)].sort();

describe('activeBranchLoadedEffectSkills', () => {
	it('counts effect skills loaded on an uncompacted branch', () => {
		const branch = new ActiveBranch.Value({
			entries: [
				loadedSkill('skill-1', 'effect-config'),
				loadedSkill('skill-2', 'effect-http-api')
			]
		});

		expect(names(branch)).toEqual(['effect-config', 'effect-http-api']);
	});

	it('resets loaded skills after a compaction entry', () => {
		const branch = new ActiveBranch.Value({
			entries: [
				loadedSkill('old-skill-1', 'effect-config'),
				loadedSkill('old-skill-2', 'effect-http-api'),
				compaction('compact-1')
			]
		});

		expect(names(branch)).toEqual([]);
	});

	it('counts only skills loaded after the latest compaction', () => {
		const branch = new ActiveBranch.Value({
			entries: [
				loadedSkill('old-skill', 'effect-config'),
				compaction('compact-1'),
				loadedSkill('new-skill', 'effect-stream'),
				compaction('compact-2'),
				loadedSkill('newer-skill', 'effect-testing')
			]
		});

		expect(names(branch)).toEqual(['effect-testing']);
	});
});
