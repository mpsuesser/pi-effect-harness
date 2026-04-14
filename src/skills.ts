import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
	ExtensionAPI,
	ExtensionContext
} from '@mariozechner/pi-coding-agent';

import { SKILL_LOADED_ENTRY } from './constants.ts';

export interface SkillIndexEntry {
	readonly name: string;
	readonly skillFilePath: string;
	readonly skillDir: string;
}

export interface SkillLoadedEntryData {
	readonly name: string;
	readonly path: string;
}

interface CommandSourceInfo {
	readonly path?: string;
}

interface PiCommand {
	readonly source: string;
	readonly sourceInfo?: CommandSourceInfo;
}

const stripAtPrefix = (value: string): string =>
	value.startsWith('@') ? value.slice(1) : value;

const expandHome = (value: string): string => {
	if (value === '~') return os.homedir();
	if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
	return value;
};

const canonicalizePath = (value: string): string => {
	try {
		return fs.realpathSync.native(value);
	} catch {
		return value;
	}
};

export const normalizePath = (value: string, cwd: string): string => {
	const normalized = expandHome(stripAtPrefix(value.trim()));
	const resolved = path.isAbsolute(normalized)
		? path.normalize(normalized)
		: path.resolve(cwd, normalized);
	return canonicalizePath(resolved);
};

export const buildEffectSkillIndex = (
	pi: ExtensionAPI,
	cwd: string
): SkillIndexEntry[] => {
	const commands = pi.getCommands() as ReadonlyArray<PiCommand>;
	const byName = new Map<string, SkillIndexEntry>();

	for (const command of commands) {
		if (command.source !== 'skill') continue;
		const sourcePath = command.sourceInfo?.path;
		if (typeof sourcePath !== 'string' || sourcePath.length === 0) continue;

		const skillFilePath = normalizePath(sourcePath, cwd);
		const skillDir = path.dirname(skillFilePath);
		const name = path.basename(skillDir);
		if (!name.startsWith('effect-')) continue;

		const existing = byName.get(name);
		if (!existing || skillDir.length > existing.skillDir.length) {
			byName.set(name, { name, skillFilePath, skillDir });
		}
	}

	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const matchEffectSkillForPath = (
	absPath: string,
	skillIndex: ReadonlyArray<SkillIndexEntry>
): SkillIndexEntry | null => {
	let best: SkillIndexEntry | null = null;

	for (const entry of skillIndex) {
		if (
			absPath !== entry.skillFilePath &&
			!absPath.startsWith(`${entry.skillDir}${path.sep}`)
		) {
			continue;
		}

		if (!best || entry.skillDir.length > best.skillDir.length) {
			best = entry;
		}
	}

	return best;
};

export const getLoadedEffectSkillsFromSession = (
	ctx: ExtensionContext
): Set<string> => {
	const loaded = new Set<string>();

	for (const entry of ctx.sessionManager.getBranch()) {
		if (
			entry.type !== 'custom' ||
			entry.customType !== SKILL_LOADED_ENTRY
		) {
			continue;
		}

		const data = entry.data as SkillLoadedEntryData | undefined;
		if (data?.name?.startsWith('effect-')) {
			loaded.add(data.name);
		}
	}

	return loaded;
};
