import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Path } from 'effect';

import { SkillIndexEntry } from 'pi-harness-kit/SkillIndexEntry.ts';
import {
	formatSkillReadSummary,
	SkillReadTelemetry
} from '../src/services/SkillReadTelemetry.ts';
import { nodePlatformLayer } from './helpers/kernel.ts';

const withTelemetry = <A, E, R>(
	run: (fixture: {
		readonly logFile: string;
		readonly skill: SkillIndexEntry.Value;
	}) => Effect.Effect<A, E, R>
) => Effect.gen(function*() {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const cwd = yield* fs.makeTempDirectoryScoped({
		prefix: 'pi-effect-harness-skill-reads-'
	});
	const skillDir = path.join(cwd, 'skills', 'effect-config');
	const skillFilePath = path.join(skillDir, 'SKILL.md');
	const logFile = path.join(cwd, 'metrics', 'skill-reads.jsonl');
	const skill = new SkillIndexEntry.Value({
		name: 'effect-config',
		skillFilePath,
		skillDir
	});
	return yield* run({ logFile, skill }).pipe(
		Effect.provide(
			SkillReadTelemetry.layer(logFile).pipe(
				Layer.provide(nodePlatformLayer)
			)
		)
	);
}).pipe(Effect.provide(nodePlatformLayer));

describe('SkillReadTelemetry', () => {
	it.live('records every skill read and summarizes usage', () =>
		withTelemetry(({ skill }) =>
			Effect.gen(function*() {
				const telemetry = yield* SkillReadTelemetry.Service;
				yield* telemetry.recordRead({
					source: 'read-tool',
					skill,
					readPath: skill.skillFilePath,
					cwd: '/repo',
					sessionId: 'session-1',
					sessionFile: '/sessions/session-1.jsonl',
					toolCallId: 'call-1'
				});
				yield* telemetry.recordRead({
					source: 'read-tool',
					skill,
					readPath: `${skill.skillDir}/references/api.md`,
					cwd: '/repo',
					sessionId: 'session-2',
					toolCallId: 'call-2'
				});

				const records = yield* telemetry.records;
				expect(records).toHaveLength(2);
				expect(records.map((record) => record.id)).toEqual([
					'read-tool:session-1:call-1',
					'read-tool:session-2:call-2'
				]);

				const summary = yield* telemetry.summarize({
					knownSkillNames: ['effect-config', 'effect-stream']
				});
				expect(summary.totalReads).toBe(2);
				expect(summary.readSkillCount).toBe(1);
				expect(summary.neglectedSkillNames).toEqual(['effect-stream']);
				expect(summary.rows[0]).toMatchObject({
					skillName: 'effect-config',
					totalReads: 2,
					skillFileReads: 1,
					skillAssetReads: 1,
					uniqueSessions: 2
				});
				const formatted = formatSkillReadSummary(summary);
				expect(formatted).toContain('effect-config');
				expect(formatted).toContain('## Least-read skills');
			})
		));
});
