import { describe, expect, it } from '@effect/vitest';

import {
	type BackfillSkillEntry,
	extractBackfillRecordsFromSessionLines,
	normalizeBackfillReadPath
} from '../src/services/SkillReadBackfill.ts';

const skill = (name: string): BackfillSkillEntry => ({
	name,
	skillDir: `/current/skills/${name}`,
	skillFilePath: `/current/skills/${name}/SKILL.md`
});

const skills = [
	skill('effect-filesystem'),
	skill('effect-path'),
	skill('effect-config')
];

const jsonLine = (value: unknown): string => JSON.stringify(value);

describe('SkillReadBackfill', () => {
	it('extracts successful read-tool skill reads from historical sessions', () => {
		const result = extractBackfillRecordsFromSessionLines({
			lines: [
				jsonLine({
					type: 'session',
					id: 'session-1',
					cwd: '/Users/m/repos/pi-effect-enforcer',
					timestamp: '2026-04-15T13:00:00.000Z'
				}),
				jsonLine({
					type: 'message',
					id: 'assistant-1',
					message: {
						role: 'assistant',
						content: [
							{
								type: 'toolCall',
								id: 'call-filesystem',
								name: 'read',
								arguments: {
									path: 'skills/effect-filesystem/SKILL.md'
								}
							},
							{
								type: 'toolCall',
								id: 'call-readme',
								name: 'read',
								arguments: { path: 'README.md' }
							}
						]
					}
				}),
				jsonLine({
					type: 'message',
					id: 'tool-result-1',
					timestamp: '2026-04-15T13:03:47.337Z',
					message: {
						role: 'toolResult',
						toolCallId: 'call-filesystem',
						toolName: 'read',
						isError: false,
						content: [{
							type: 'text',
							text: '---\nname: effect-filesystem'
						}]
					}
				}),
				jsonLine({
					type: 'message',
					id: 'tool-result-2',
					timestamp: '2026-04-15T13:03:47.338Z',
					message: {
						role: 'toolResult',
						toolCallId: 'call-readme',
						toolName: 'read',
						isError: false,
						content: [{ type: 'text', text: '# README' }]
					}
				})
			],
			sessionFile: '/sessions/session-1.jsonl',
			skills
		});

		expect(result.records).toHaveLength(1);
		expect(result.records[0]).toMatchObject({
			id: 'backfill:read-tool:session-1:call-filesystem',
			skillName: 'effect-filesystem',
			readKind: 'skill-file',
			source: 'backfill',
			sessionId: 'session-1',
			toolCallId: 'call-filesystem',
			readPath:
				'/Users/m/repos/pi-effect-enforcer/skills/effect-filesystem/SKILL.md',
			timestamp: '2026-04-15T13:03:47.337Z'
		});
		expect(result.stats.readToolCalls).toBe(2);
		expect(result.stats.matchedSkillToolCalls).toBe(1);
		expect(result.stats.successfulSkillReadResults).toBe(1);
	});

	it('ignores failed skill reads and can import legacy loaded entries when requested', () => {
		const lines = [
			jsonLine({
				type: 'session',
				id: 'session-2',
				cwd: '/repo',
				timestamp: '2026-04-15T13:00:00.000Z'
			}),
			jsonLine({
				type: 'message',
				message: {
					role: 'assistant',
					content: [
						{
							type: 'toolCall',
							id: 'call-path',
							name: 'read',
							arguments: { path: 'skills/effect-path/SKILL.md' }
						}
					]
				}
			}),
			jsonLine({
				type: 'message',
				timestamp: '2026-04-15T13:03:47.337Z',
				message: {
					role: 'toolResult',
					toolCallId: 'call-path',
					toolName: 'read',
					isError: true,
					content: [{ type: 'text', text: 'not found' }]
				}
			}),
			jsonLine({
				type: 'custom',
				customType: 'pi-effect-enforcer:skill-loaded',
				id: 'legacy-1',
				timestamp: '2026-04-15T13:03:48.000Z',
				data: {
					name: 'effect-config',
					path: '/repo/skills/effect-config/SKILL.md'
				}
			})
		];

		const withoutLegacy = extractBackfillRecordsFromSessionLines({
			lines,
			sessionFile: '/sessions/session-2.jsonl',
			skills
		});
		expect(withoutLegacy.records).toHaveLength(0);
		expect(withoutLegacy.stats.failedSkillReadResults).toBe(1);
		expect(withoutLegacy.stats.legacyLoadedEntries).toBe(1);
		expect(withoutLegacy.stats.legacyLoadedEntriesImported).toBe(0);

		const withLegacy = extractBackfillRecordsFromSessionLines({
			lines,
			sessionFile: '/sessions/session-2.jsonl',
			skills,
			includeLegacyLoadedEntries: true
		});
		expect(withLegacy.records).toHaveLength(1);
		expect(withLegacy.records[0]).toMatchObject({
			id: 'backfill:legacy-skill-loaded:session-2:legacy-1',
			skillName: 'effect-config',
			readKind: 'skill-file',
			source: 'backfill'
		});
		expect(withLegacy.stats.legacyLoadedEntriesImported).toBe(1);
	});

	it('normalizes relative skill paths deterministically', () => {
		expect(
			normalizeBackfillReadPath(
				'./skills/effect-config/../effect-config/SKILL.md',
				'/repo'
			)
		).toBe('/repo/skills/effect-config/SKILL.md');
	});
});
