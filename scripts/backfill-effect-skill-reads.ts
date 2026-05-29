#!/usr/bin/env bun
/**
 * Backfill pi-effect-harness skill-read metrics from historical Pi session logs.
 *
 * This is one-time local meta-tooling, so it intentionally uses Node/Bun file
 * APIs for fast corpus scanning. It does not mutate session files; it appends
 * deterministic backfill records to the global skill metrics JSONL log.
 */

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
	type BackfillSkillEntry,
	extractBackfillRecordsFromSessionLines
} from '../harnesses/effect/src/services/SkillReadBackfill.ts';
import type { SkillReadRecord } from '../harnesses/effect/src/services/SkillReadTelemetry.ts';

const WORKSPACE_ROOT = new URL('..', import.meta.url).pathname;
const DEFAULT_SESSIONS_DIR = join(homedir(), '.pi', 'agent', 'sessions');
const DEFAULT_LOG_FILE = join(
	homedir(),
	'.pi',
	'agent',
	'pi-effect-harness',
	'skill-reads.jsonl'
);
const DEFAULT_SKILLS_DIR = join(
	WORKSPACE_ROOT,
	'harnesses',
	'effect',
	'skills'
);

interface Options {
	readonly sessionsDir: string;
	readonly logFile: string;
	readonly skillsDir: string;
	readonly dryRun: boolean;
	readonly includeLegacyLoadedEntries: boolean;
	readonly json: boolean;
	readonly limit?: number;
}

interface ExistingLogIndex {
	readonly ids: Set<string>;
	readonly toolKeys: Set<string>;
	readonly lines: number;
	readonly invalidLines: number;
}

interface BackfillSummary {
	readonly sessionsDir: string;
	readonly logFile: string;
	readonly skillsDir: string;
	readonly dryRun: boolean;
	readonly includeLegacyLoadedEntries: boolean;
	readonly skillCount: number;
	readonly sessionFilesScanned: number;
	readonly existingLogRecords: number;
	readonly existingLogInvalidLines: number;
	readonly candidateRecords: number;
	readonly newRecords: number;
	readonly duplicateRecords: number;
	readonly parsedLines: number;
	readonly skippedLines: number;
	readonly invalidJsonLines: number;
	readonly readToolCalls: number;
	readonly matchedSkillToolCalls: number;
	readonly successfulSkillReadResults: number;
	readonly failedSkillReadResults: number;
	readonly unmatchedSkillReadResults: number;
	readonly legacyLoadedEntriesSeen: number;
	readonly legacyLoadedEntriesImported: number;
	readonly existingSkillReadEntriesSeen: number;
	readonly recordsBySkill: ReadonlyArray<readonly [string, number]>;
}

const help = `Usage: bun run scripts/backfill-effect-skill-reads.ts [options]

Options:
  --write                         Append new backfill records. Default is dry-run.
  --dry-run                       Scan and report without writing.
  --sessions-dir <path>           Pi sessions directory. Default: ~/.pi/agent/sessions
  --log-file <path>               Metrics JSONL file. Default: ~/.pi/agent/pi-effect-harness/skill-reads.jsonl
  --skills-dir <path>             effect-* skills directory. Default: harnesses/effect/skills
  --include-legacy-loaded-entries Also import legacy skill-loaded custom entries. Off by default to avoid double-counting read-tool backfills.
  --limit <count>                 Scan only the first N session files, after deterministic path sort.
  --json                          Print machine-readable summary.
  --help                          Show this help.
`;

const expandHome = (value: string): string =>
	value === '~'
		? homedir()
		: value.startsWith('~/')
		? join(homedir(), value.slice(2))
		: value;

const resolvePath = (value: string): string => resolve(expandHome(value));

const valueAfter = (
	args: ReadonlyArray<string>,
	index: number,
	flag: string
): string => {
	const value = args[index + 1];
	if (value === undefined) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
};

const parseOptions = (args: ReadonlyArray<string>): Options => {
	let sessionsDir = DEFAULT_SESSIONS_DIR;
	let logFile = DEFAULT_LOG_FILE;
	let skillsDir = DEFAULT_SKILLS_DIR;
	let dryRun = true;
	let includeLegacyLoadedEntries = false;
	let json = false;
	let limit: number | undefined;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		switch (arg) {
			case '--':
				break;
			case '--help':
				console.log(help);
				process.exit(0);
			case '--write':
				dryRun = false;
				break;
			case '--dry-run':
				dryRun = true;
				break;
			case '--sessions-dir':
				sessionsDir = valueAfter(args, index, arg);
				index++;
				break;
			case '--log-file':
				logFile = valueAfter(args, index, arg);
				index++;
				break;
			case '--skills-dir':
				skillsDir = valueAfter(args, index, arg);
				index++;
				break;
			case '--include-legacy-loaded-entries':
				includeLegacyLoadedEntries = true;
				break;
			case '--json':
				json = true;
				break;
			case '--limit': {
				const parsed = Number(valueAfter(args, index, arg));
				if (!Number.isInteger(parsed) || parsed <= 0) {
					throw new Error('--limit requires a positive integer');
				}
				limit = parsed;
				index++;
				break;
			}
			default:
				if (arg?.startsWith('--sessions-dir=')) {
					sessionsDir = arg.slice('--sessions-dir='.length);
					break;
				}
				if (arg?.startsWith('--log-file=')) {
					logFile = arg.slice('--log-file='.length);
					break;
				}
				if (arg?.startsWith('--skills-dir=')) {
					skillsDir = arg.slice('--skills-dir='.length);
					break;
				}
				if (arg?.startsWith('--limit=')) {
					const parsed = Number(arg.slice('--limit='.length));
					if (!Number.isInteger(parsed) || parsed <= 0) {
						throw new Error('--limit requires a positive integer');
					}
					limit = parsed;
					break;
				}
				throw new Error(`unknown option: ${arg}`);
		}
	}

	return {
		sessionsDir: resolvePath(sessionsDir),
		logFile: resolvePath(logFile),
		skillsDir: resolvePath(skillsDir),
		dryRun,
		includeLegacyLoadedEntries,
		json,
		...(limit === undefined ? undefined : { limit })
	};
};

async function* walkJsonlFiles(dir: string): AsyncGenerator<string> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkJsonlFiles(fullPath);
		} else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
			yield fullPath;
		}
	}
}

const listSessionFiles = async (
	sessionsDir: string
): Promise<Array<string>> => {
	const files: Array<string> = [];
	for await (const file of walkJsonlFiles(sessionsDir)) {
		files.push(file);
	}
	return files.sort((left, right) => left.localeCompare(right));
};

const loadSkillEntries = async (
	skillsDir: string
): Promise<Array<BackfillSkillEntry>> => {
	const entries = await readdir(skillsDir, { withFileTypes: true });
	return entries
		.filter((entry) =>
			entry.isDirectory() && entry.name.startsWith('effect-')
		)
		.map((entry) => {
			const skillDir = join(skillsDir, entry.name);
			return {
				name: entry.name,
				skillDir,
				skillFilePath: join(skillDir, 'SKILL.md')
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;

const stringField = (
	value: Record<string, unknown>,
	field: string
): string | undefined => {
	const fieldValue = value[field];
	return typeof fieldValue === 'string' ? fieldValue : undefined;
};

const parseRecordLine = (line: string): Record<string, unknown> | undefined => {
	try {
		return asRecord(JSON.parse(line));
	} catch {
		return undefined;
	}
};

const toolKey = (
	record: Pick<SkillReadRecord, 'sessionId'> & {
		readonly toolCallId?: string;
	}
): string | undefined =>
	record.toolCallId === undefined
		? undefined
		: `${record.sessionId}\u0000${record.toolCallId}`;

const toolKeyFromUnknownRecord = (
	record: Record<string, unknown>
): string | undefined => {
	const sessionId = stringField(record, 'sessionId');
	const toolCallId = stringField(record, 'toolCallId');
	return sessionId === undefined || toolCallId === undefined
		? undefined
		: `${sessionId}\u0000${toolCallId}`;
};

const loadExistingLogIndex = async (
	logFile: string
): Promise<ExistingLogIndex> => {
	const ids = new Set<string>();
	const toolKeys = new Set<string>();
	if (!existsSync(logFile)) {
		return { ids, toolKeys, lines: 0, invalidLines: 0 };
	}
	const content = await readFile(logFile, 'utf8');
	let lines = 0;
	let invalidLines = 0;
	for (const line of content.split('\n')) {
		if (line.trim().length === 0) {
			continue;
		}
		lines++;
		const record = parseRecordLine(line);
		if (record === undefined) {
			invalidLines++;
			continue;
		}
		const id = stringField(record, 'id');
		if (id !== undefined) {
			ids.add(id);
		}
		const existingToolKey = toolKeyFromUnknownRecord(record);
		if (existingToolKey !== undefined) {
			toolKeys.add(existingToolKey);
		}
	}
	return { ids, toolKeys, lines, invalidLines };
};

const incrementSkillCount = (
	counts: Map<string, number>,
	record: SkillReadRecord
): void => {
	counts.set(record.skillName, (counts.get(record.skillName) ?? 0) + 1);
};

const sortedSkillCounts = (
	counts: ReadonlyMap<string, number>
): ReadonlyArray<readonly [string, number]> =>
	[...counts.entries()].sort(
		([leftName, leftCount], [rightName, rightCount]) =>
			rightCount - leftCount || leftName.localeCompare(rightName)
	);

const recordLine = (record: SkillReadRecord): string =>
	`${JSON.stringify(record)}\n`;

const printTextSummary = (summary: BackfillSummary): void => {
	const mode = summary.dryRun ? 'dry run' : 'write';
	console.log(`[effect-skill-backfill] mode: ${mode}`);
	console.log(
		`[effect-skill-backfill] scanned ${summary.sessionFilesScanned} session file(s), ${summary.parsedLines} relevant line(s)`
	);
	console.log(
		`[effect-skill-backfill] candidate records: ${summary.candidateRecords}; new: ${summary.newRecords}; duplicates skipped: ${summary.duplicateRecords}`
	);
	console.log(
		`[effect-skill-backfill] successful skill read results: ${summary.successfulSkillReadResults}; failed: ${summary.failedSkillReadResults}`
	);
	console.log(
		`[effect-skill-backfill] legacy skill-loaded entries seen: ${summary.legacyLoadedEntriesSeen}; imported: ${summary.legacyLoadedEntriesImported}`
	);
	console.log(`[effect-skill-backfill] log: ${summary.logFile}`);
	console.log('[effect-skill-backfill] top skills:');
	for (const [skillName, count] of summary.recordsBySkill.slice(0, 12)) {
		console.log(`  ${skillName}: ${count}`);
	}
};

const main = async (): Promise<void> => {
	const options = parseOptions(process.argv.slice(2));
	const skills = await loadSkillEntries(options.skillsDir);
	const allSessionFiles = await listSessionFiles(options.sessionsDir);
	const sessionFiles = options.limit === undefined
		? allSessionFiles
		: allSessionFiles.slice(0, options.limit);
	const existing = await loadExistingLogIndex(options.logFile);
	const seenIds = new Set(existing.ids);
	const seenToolKeys = new Set(existing.toolKeys);
	const recordsBySkill = new Map<string, number>();
	const newRecords: Array<SkillReadRecord> = [];
	let candidateRecords = 0;
	let duplicateRecords = 0;
	let parsedLines = 0;
	let skippedLines = 0;
	let invalidJsonLines = 0;
	let readToolCalls = 0;
	let matchedSkillToolCalls = 0;
	let successfulSkillReadResults = 0;
	let failedSkillReadResults = 0;
	let unmatchedSkillReadResults = 0;
	let legacyLoadedEntriesSeen = 0;
	let legacyLoadedEntriesImported = 0;
	let existingSkillReadEntriesSeen = 0;

	for (const sessionFile of sessionFiles) {
		const content = await readFile(sessionFile, 'utf8');
		const result = extractBackfillRecordsFromSessionLines({
			lines: content.split('\n'),
			sessionFile,
			skills,
			includeLegacyLoadedEntries: options.includeLegacyLoadedEntries
		});
		parsedLines += result.stats.parsedLines;
		skippedLines += result.stats.skippedLines;
		invalidJsonLines += result.stats.invalidJsonLines;
		readToolCalls += result.stats.readToolCalls;
		matchedSkillToolCalls += result.stats.matchedSkillToolCalls;
		successfulSkillReadResults += result.stats.successfulSkillReadResults;
		failedSkillReadResults += result.stats.failedSkillReadResults;
		unmatchedSkillReadResults += result.stats.unmatchedSkillReadResults;
		legacyLoadedEntriesSeen += result.stats.legacyLoadedEntries;
		legacyLoadedEntriesImported += result.stats.legacyLoadedEntriesImported;
		existingSkillReadEntriesSeen += result.stats.existingSkillReadEntries;

		for (const record of result.records) {
			candidateRecords++;
			const key = toolKey(record);
			if (
				seenIds.has(record.id) ||
				(key !== undefined && seenToolKeys.has(key))
			) {
				duplicateRecords++;
				continue;
			}
			seenIds.add(record.id);
			if (key !== undefined) {
				seenToolKeys.add(key);
			}
			newRecords.push(record);
			incrementSkillCount(recordsBySkill, record);
		}
	}

	newRecords.sort(
		(left, right) =>
			left.timestampMillis - right.timestampMillis ||
			(left.sessionFile ?? '').localeCompare(right.sessionFile ?? '') ||
			left.id.localeCompare(right.id)
	);

	if (!options.dryRun && newRecords.length > 0) {
		await mkdir(dirname(options.logFile), { recursive: true });
		await appendFile(options.logFile, newRecords.map(recordLine).join(''));
	}

	const summary: BackfillSummary = {
		sessionsDir: options.sessionsDir,
		logFile: options.logFile,
		skillsDir: options.skillsDir,
		dryRun: options.dryRun,
		includeLegacyLoadedEntries: options.includeLegacyLoadedEntries,
		skillCount: skills.length,
		sessionFilesScanned: sessionFiles.length,
		existingLogRecords: existing.lines,
		existingLogInvalidLines: existing.invalidLines,
		candidateRecords,
		newRecords: newRecords.length,
		duplicateRecords,
		parsedLines,
		skippedLines,
		invalidJsonLines,
		readToolCalls,
		matchedSkillToolCalls,
		successfulSkillReadResults,
		failedSkillReadResults,
		unmatchedSkillReadResults,
		legacyLoadedEntriesSeen,
		legacyLoadedEntriesImported,
		existingSkillReadEntriesSeen,
		recordsBySkill: sortedSkillCounts(recordsBySkill)
	};

	if (options.json) {
		console.log(JSON.stringify(summary, null, 2));
	} else {
		printTextSummary(summary);
	}
};

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[effect-skill-backfill] ${message}`);
	process.exitCode = 1;
});
