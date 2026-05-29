import { DateTime, Option, Predicate, Schema } from 'effect';

import { SkillReadRecord } from './SkillReadTelemetry.ts';

export const LEGACY_SKILL_LOADED_ENTRY_TYPES = new Set([
	'pi-effect-enforcer:skill-loaded',
	'pi-effect-harness:skill-loaded'
]);

export interface BackfillSkillEntry {
	readonly name: string;
	readonly skillFilePath: string;
	readonly skillDir: string;
}

export interface ExtractBackfillRecordsInput {
	readonly lines: ReadonlyArray<string>;
	readonly sessionFile: string;
	readonly skills: ReadonlyArray<BackfillSkillEntry>;
	readonly includeLegacyLoadedEntries?: boolean;
}

export interface ExtractBackfillRecordsResult {
	readonly records: ReadonlyArray<SkillReadRecord>;
	readonly stats: BackfillSessionStats;
}

export interface BackfillSessionStats {
	readonly sessionFile: string;
	readonly parsedLines: number;
	readonly skippedLines: number;
	readonly invalidJsonLines: number;
	readonly readToolCalls: number;
	readonly matchedSkillToolCalls: number;
	readonly successfulSkillReadResults: number;
	readonly failedSkillReadResults: number;
	readonly unmatchedSkillReadResults: number;
	readonly legacyLoadedEntries: number;
	readonly legacyLoadedEntriesImported: number;
	readonly existingSkillReadEntries: number;
}

interface SessionHeaderState {
	readonly cwd: string;
	readonly sessionId: string;
	readonly timestamp: string;
}

interface PendingSkillRead {
	readonly skill: BackfillSkillEntry;
	readonly readPath: string;
	readonly toolCallId: string;
}

interface MutableSessionStats {
	parsedLines: number;
	skippedLines: number;
	invalidJsonLines: number;
	readToolCalls: number;
	matchedSkillToolCalls: number;
	successfulSkillReadResults: number;
	failedSkillReadResults: number;
	unmatchedSkillReadResults: number;
	legacyLoadedEntries: number;
	legacyLoadedEntriesImported: number;
	existingSkillReadEntries: number;
}

const emptyStats = (): MutableSessionStats => ({
	parsedLines: 0,
	skippedLines: 0,
	invalidJsonLines: 0,
	readToolCalls: 0,
	matchedSkillToolCalls: 0,
	successfulSkillReadResults: 0,
	failedSkillReadResults: 0,
	unmatchedSkillReadResults: 0,
	legacyLoadedEntries: 0,
	legacyLoadedEntriesImported: 0,
	existingSkillReadEntries: 0
});

const jsonLineSchema = Schema.UnknownFromJsonString;

const parseJsonLine = (line: string): Option.Option<unknown> =>
	Schema.decodeUnknownOption(jsonLineSchema)(line);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	Predicate.isReadonlyObject(value)
		? value as Record<string, unknown>
		: undefined;

const fieldRecord = (
	value: Record<string, unknown>,
	field: string
): Record<string, unknown> | undefined => asRecord(value[field]);

const fieldArray = (
	value: Record<string, unknown>,
	field: string
): ReadonlyArray<unknown> | undefined =>
	Array.isArray(value[field]) ? value[field] : undefined;

const fieldString = (
	value: Record<string, unknown>,
	field: string
): string | undefined => {
	const fieldValue = value[field];
	return typeof fieldValue === 'string' ? fieldValue : undefined;
};

const fieldBoolean = (
	value: Record<string, unknown>,
	field: string
): boolean | undefined => {
	const fieldValue = value[field];
	return typeof fieldValue === 'boolean' ? fieldValue : undefined;
};

const fallbackTimestamp = '1970-01-01T00:00:00.000Z';

const timestampInfo = (
	value: string | undefined
): { readonly timestamp: string; readonly timestampMillis: number; } => {
	const input = value ?? fallbackTimestamp;
	return Option.match(DateTime.make(input), {
		onNone: () => ({ timestamp: input, timestampMillis: 0 }),
		onSome: (dateTime) => ({
			timestamp: DateTime.formatIso(dateTime),
			timestampMillis: DateTime.toEpochMillis(dateTime)
		})
	});
};

const normalizePosixPath = (value: string): string => {
	const absolute = value.startsWith('/');
	const segments: Array<string> = [];
	for (const segment of value.split('/')) {
		if (segment.length === 0 || segment === '.') {
			continue;
		}
		if (segment === '..') {
			if (segments.length > 0 && segments[segments.length - 1] !== '..') {
				segments.pop();
			} else if (!absolute) {
				segments.push(segment);
			}
			continue;
		}
		segments.push(segment);
	}
	const normalized = segments.join('/');
	return absolute ? `/${normalized}` : normalized;
};

export const normalizeBackfillReadPath = (
	readPath: string,
	cwd: string | undefined
): string => {
	const slashPath = readPath.replaceAll('\\', '/');
	if (slashPath.startsWith('/') || cwd === undefined || cwd.length === 0) {
		return normalizePosixPath(slashPath);
	}
	return normalizePosixPath(`${cwd.replace(/\/+$/u, '')}/${slashPath}`);
};

const skillPathRegex =
	/(?:^|\/)(?:harnesses\/effect\/)?skills\/(effect-[a-z0-9-]+)(?:\/|$)/u;

const skillNameFromReadPath = (
	readPath: string,
	skillsByName: ReadonlyMap<string, BackfillSkillEntry>
): string | undefined => {
	const match = skillPathRegex.exec(readPath);
	const skillName = match?.[1];
	return skillName !== undefined && skillsByName.has(skillName)
		? skillName
		: undefined;
};

const readKindFromPath = (
	skillName: string,
	readPath: string
): SkillReadRecord['readKind'] =>
	readPath.endsWith(`/skills/${skillName}/SKILL.md`) ||
		readPath.endsWith(`/harnesses/effect/skills/${skillName}/SKILL.md`)
		? 'skill-file'
		: 'skill-asset';

const recordForSkill = ({
	cwd,
	id,
	readPath,
	sessionFile,
	sessionId,
	skill,
	timestamp,
	toolCallId
}: {
	readonly cwd: string;
	readonly id: string;
	readonly readPath: string;
	readonly sessionFile: string;
	readonly sessionId: string;
	readonly skill: BackfillSkillEntry;
	readonly timestamp: string | undefined;
	readonly toolCallId?: string;
}): SkillReadRecord => {
	const info = timestampInfo(timestamp);
	return new SkillReadRecord({
		id,
		skillName: skill.name,
		skillFilePath: skill.skillFilePath,
		skillDir: skill.skillDir,
		readPath,
		readKind: readKindFromPath(skill.name, readPath),
		source: 'backfill',
		cwd,
		sessionId,
		timestamp: info.timestamp,
		timestampMillis: info.timestampMillis,
		sessionFile,
		...(toolCallId === undefined ? undefined : { toolCallId })
	});
};

const shouldParseLine = (line: string, lineIndex: number): boolean =>
	lineIndex === 0 ||
	line.includes('"name":"read"') ||
	line.includes('"toolName":"read"') ||
	line.includes('skill-loaded') ||
	line.includes('pi-effect-harness:skill-read');

const sessionHeaderFromEntry = (
	entry: Record<string, unknown>,
	sessionFile: string
): SessionHeaderState | undefined => {
	if (fieldString(entry, 'type') !== 'session') {
		return undefined;
	}
	const sessionId = fieldString(entry, 'id') ?? `session-file:${sessionFile}`;
	return {
		cwd: fieldString(entry, 'cwd') ?? '',
		sessionId,
		timestamp: fieldString(entry, 'timestamp') ?? fallbackTimestamp
	};
};

const rememberAssistantReadCalls = ({
	cwd,
	entry,
	pending,
	skillsByName,
	stats
}: {
	readonly cwd: string;
	readonly entry: Record<string, unknown>;
	readonly pending: Map<string, PendingSkillRead>;
	readonly skillsByName: ReadonlyMap<string, BackfillSkillEntry>;
	readonly stats: MutableSessionStats;
}): void => {
	const message = fieldRecord(entry, 'message');
	if (message === undefined || fieldString(message, 'role') !== 'assistant') {
		return;
	}
	const content = fieldArray(message, 'content') ?? [];
	for (const blockUnknown of content) {
		const block = asRecord(blockUnknown);
		if (
			block === undefined ||
			fieldString(block, 'type') !== 'toolCall' ||
			fieldString(block, 'name') !== 'read'
		) {
			continue;
		}
		stats.readToolCalls++;
		const toolCallId = fieldString(block, 'id');
		const args = fieldRecord(block, 'arguments');
		const rawReadPath = args === undefined
			? undefined
			: fieldString(args, 'path');
		if (toolCallId === undefined || rawReadPath === undefined) {
			continue;
		}
		const readPath = normalizeBackfillReadPath(rawReadPath, cwd);
		const skillName = skillNameFromReadPath(readPath, skillsByName);
		if (skillName === undefined) {
			continue;
		}
		const skill = skillsByName.get(skillName);
		if (skill === undefined) {
			continue;
		}
		stats.matchedSkillToolCalls++;
		pending.set(toolCallId, { skill, readPath, toolCallId });
	}
};

const recordSuccessfulReadResult = ({
	cwd,
	entry,
	pending,
	records,
	sessionFile,
	sessionId,
	stats
}: {
	readonly cwd: string;
	readonly entry: Record<string, unknown>;
	readonly pending: Map<string, PendingSkillRead>;
	readonly records: Array<SkillReadRecord>;
	readonly sessionFile: string;
	readonly sessionId: string;
	readonly stats: MutableSessionStats;
}): void => {
	const message = fieldRecord(entry, 'message');
	if (
		message === undefined ||
		fieldString(message, 'role') !== 'toolResult' ||
		fieldString(message, 'toolName') !== 'read'
	) {
		return;
	}
	const toolCallId = fieldString(message, 'toolCallId');
	if (toolCallId === undefined) {
		return;
	}
	const pendingRead = pending.get(toolCallId);
	if (pendingRead === undefined) {
		return;
	}
	if (fieldBoolean(message, 'isError') === true) {
		stats.failedSkillReadResults++;
		pending.delete(toolCallId);
		return;
	}
	if (fieldBoolean(message, 'isError') !== false) {
		stats.unmatchedSkillReadResults++;
		return;
	}
	stats.successfulSkillReadResults++;
	records.push(
		recordForSkill({
			cwd,
			id: `backfill:read-tool:${sessionId}:${toolCallId}`,
			readPath: pendingRead.readPath,
			sessionFile,
			sessionId,
			skill: pendingRead.skill,
			timestamp: fieldString(entry, 'timestamp'),
			toolCallId
		})
	);
	pending.delete(toolCallId);
};

const recordLegacyLoadedEntry = ({
	cwd,
	entry,
	records,
	sessionFile,
	sessionId,
	skillsByName,
	stats
}: {
	readonly cwd: string;
	readonly entry: Record<string, unknown>;
	readonly records: Array<SkillReadRecord>;
	readonly sessionFile: string;
	readonly sessionId: string;
	readonly skillsByName: ReadonlyMap<string, BackfillSkillEntry>;
	readonly stats: MutableSessionStats;
}): void => {
	if (
		fieldString(entry, 'type') !== 'custom' ||
		!LEGACY_SKILL_LOADED_ENTRY_TYPES.has(
			fieldString(entry, 'customType') ?? ''
		)
	) {
		return;
	}
	stats.legacyLoadedEntries++;
	const data = fieldRecord(entry, 'data');
	const skillName = data === undefined
		? undefined
		: fieldString(data, 'name');
	const skill = skillName === undefined
		? undefined
		: skillsByName.get(skillName);
	if (skill === undefined) {
		return;
	}
	const rawReadPath = data === undefined
		? undefined
		: fieldString(data, 'path');
	const readPath = rawReadPath === undefined
		? skill.skillFilePath
		: normalizeBackfillReadPath(rawReadPath, cwd);
	stats.legacyLoadedEntriesImported++;
	records.push(
		recordForSkill({
			cwd,
			id: `backfill:legacy-skill-loaded:${sessionId}:${
				fieldString(entry, 'id') ?? records.length
			}`,
			readPath,
			sessionFile,
			sessionId,
			skill,
			timestamp: fieldString(entry, 'timestamp')
		})
	);
};

const updateExistingSkillReadEntryStats = (
	entry: Record<string, unknown>,
	stats: MutableSessionStats
): void => {
	if (
		fieldString(entry, 'type') === 'custom' &&
		fieldString(entry, 'customType') === 'pi-effect-harness:skill-read'
	) {
		stats.existingSkillReadEntries++;
	}
};

export const extractBackfillRecordsFromSessionLines = ({
	includeLegacyLoadedEntries = false,
	lines,
	sessionFile,
	skills
}: ExtractBackfillRecordsInput): ExtractBackfillRecordsResult => {
	const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));
	const stats = emptyStats();
	const records: Array<SkillReadRecord> = [];
	const pending = new Map<string, PendingSkillRead>();
	let header: SessionHeaderState = {
		cwd: '',
		sessionId: `session-file:${sessionFile}`,
		timestamp: fallbackTimestamp
	};

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line === undefined || line.trim().length === 0) {
			stats.skippedLines++;
			continue;
		}
		if (!shouldParseLine(line, index)) {
			stats.skippedLines++;
			continue;
		}
		const parsed = parseJsonLine(line);
		if (Option.isNone(parsed)) {
			stats.invalidJsonLines++;
			continue;
		}
		const entry = asRecord(parsed.value);
		if (entry === undefined) {
			stats.invalidJsonLines++;
			continue;
		}
		stats.parsedLines++;
		const parsedHeader = sessionHeaderFromEntry(entry, sessionFile);
		if (parsedHeader !== undefined) {
			header = parsedHeader;
			continue;
		}
		updateExistingSkillReadEntryStats(entry, stats);
		rememberAssistantReadCalls({
			cwd: header.cwd,
			entry,
			pending,
			skillsByName,
			stats
		});
		recordSuccessfulReadResult({
			cwd: header.cwd,
			entry,
			pending,
			records,
			sessionFile,
			sessionId: header.sessionId,
			stats
		});
		if (includeLegacyLoadedEntries) {
			recordLegacyLoadedEntry({
				cwd: header.cwd,
				entry,
				records,
				sessionFile,
				sessionId: header.sessionId,
				skillsByName,
				stats
			});
		} else if (
			fieldString(entry, 'type') === 'custom' &&
			LEGACY_SKILL_LOADED_ENTRY_TYPES.has(
				fieldString(entry, 'customType') ?? ''
			)
		) {
			stats.legacyLoadedEntries++;
		}
	}

	return {
		records,
		stats: {
			sessionFile,
			parsedLines: stats.parsedLines,
			skippedLines: stats.skippedLines,
			invalidJsonLines: stats.invalidJsonLines,
			readToolCalls: stats.readToolCalls,
			matchedSkillToolCalls: stats.matchedSkillToolCalls,
			successfulSkillReadResults: stats.successfulSkillReadResults,
			failedSkillReadResults: stats.failedSkillReadResults,
			unmatchedSkillReadResults: stats.unmatchedSkillReadResults,
			legacyLoadedEntries: stats.legacyLoadedEntries,
			legacyLoadedEntriesImported: stats.legacyLoadedEntriesImported,
			existingSkillReadEntries: stats.existingSkillReadEntries
		}
	};
};
