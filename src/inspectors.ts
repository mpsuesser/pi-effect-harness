import * as fs from 'node:fs';

import { normalizePath } from './skills.ts';

export interface PatternInputProjection {
	readonly filePath?: string;
	readonly content?: string;
	readonly command?: string;
	readonly pattern?: string;
	readonly query?: string;
	readonly url?: string;
	readonly prompt?: string;
}

interface EditBlock {
	readonly oldText: string;
	readonly newText: string;
}

interface EditReplacement {
	readonly start: number;
	readonly end: number;
	readonly newText: string;
}

const pushString = (parts: string[], value: unknown): void => {
	if (typeof value === 'string' && value.length > 0) {
		parts.push(value);
	}
};

const getRecord = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {};

const getFilePath = (input: Record<string, unknown>): string | undefined => {
	const value = input.path ?? input.filePath;
	return typeof value === 'string' ? value : undefined;
};

const buildProjection = (
	input: Record<string, unknown>,
	content?: string
): PatternInputProjection => {
	const filePath = getFilePath(input);
	return {
		...(filePath ? { filePath } : {}),
		...(typeof content === 'string' && content.length > 0
			? { content }
			: {}),
		...(typeof input.command === 'string'
			? { command: input.command }
			: {}),
		...(typeof input.pattern === 'string'
			? { pattern: input.pattern }
			: {}),
		...(typeof input.query === 'string' ? { query: input.query } : {}),
		...(typeof input.url === 'string' ? { url: input.url } : {}),
		...(typeof input.prompt === 'string' ? { prompt: input.prompt } : {})
	};
};

const collectRawEditContent = (
	input: Record<string, unknown>,
	parts: string[]
): void => {
	const edits = input.edits;
	if (!Array.isArray(edits)) return;

	for (const edit of edits) {
		const block = getRecord(edit);
		pushString(parts, block.oldText);
		pushString(parts, block.newText);
	}
};

const buildRawProjection = (input: unknown): PatternInputProjection => {
	const record = getRecord(input);
	const parts: string[] = [];

	pushString(parts, record.content);
	pushString(parts, record.oldText);
	pushString(parts, record.oldString);
	pushString(parts, record.newText);
	pushString(parts, record.newString);
	pushString(parts, record.command);
	pushString(parts, record.pattern);
	pushString(parts, record.query);
	pushString(parts, record.url);
	pushString(parts, record.prompt);
	collectRawEditContent(record, parts);

	return buildProjection(
		record,
		parts.length > 0 ? parts.join('\n') : undefined
	);
};

const resolveInputFilePath = (
	input: Record<string, unknown>,
	cwd: string
): string | undefined => {
	const filePath = getFilePath(input);
	return typeof filePath === 'string'
		? normalizePath(filePath, cwd)
		: undefined;
};

const readToolTargetFile = (
	input: Record<string, unknown>,
	cwd: string
): string | null => {
	const filePath = resolveInputFilePath(input, cwd);
	if (!filePath) return null;

	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch {
		return null;
	}
};

const getEditBlocks = (
	input: Record<string, unknown>
): ReadonlyArray<EditBlock> | null => {
	if (Array.isArray(input.edits) && input.edits.length > 0) {
		const blocks: EditBlock[] = [];
		for (const edit of input.edits) {
			const block = getRecord(edit);
			if (
				typeof block.oldText !== 'string' ||
				typeof block.newText !== 'string'
			) {
				return null;
			}
			blocks.push({ oldText: block.oldText, newText: block.newText });
		}
		return blocks;
	}

	if (
		typeof input.oldText !== 'string' || typeof input.newText !== 'string'
	) {
		return Array.isArray(input.edits) ? [] : null;
	}

	return [{ oldText: input.oldText, newText: input.newText }];
};

const collectNewEditContent = (
	input: Record<string, unknown>,
	parts: string[]
): void => {
	const blocks = getEditBlocks(input);
	if (blocks === null || blocks.length === 0) {
		pushString(parts, input.newText);
		pushString(parts, input.newString);
		return;
	}

	for (const block of blocks) {
		pushString(parts, block.newText);
	}
};

const buildNewTextOnlyProjection = (
	input: Record<string, unknown>
): PatternInputProjection => {
	const parts: string[] = [];
	collectNewEditContent(input, parts);
	return buildProjection(
		input,
		parts.length > 0 ? parts.join('\n') : undefined
	);
};

const findUniqueOccurrence = (
	source: string,
	oldText: string
): { readonly start: number; readonly end: number; } | null => {
	if (oldText.length === 0) return null;

	const start = source.indexOf(oldText);
	if (start === -1) return null;

	const second = source.indexOf(oldText, start + 1);
	if (second !== -1) return null;

	return { start, end: start + oldText.length };
};

const buildEditReplacements = (
	source: string,
	input: Record<string, unknown>
): ReadonlyArray<EditReplacement> | null => {
	const blocks = getEditBlocks(input);
	if (blocks === null || blocks.length === 0) return null;

	const replacements: EditReplacement[] = [];
	for (const block of blocks) {
		const match = findUniqueOccurrence(source, block.oldText);
		if (match === null) return null;
		replacements.push({
			start: match.start,
			end: match.end,
			newText: block.newText
		});
	}

	const sorted = [...replacements].sort((left, right) =>
		left.start - right.start
	);
	for (let index = 1; index < sorted.length; index++) {
		const current = sorted[index];
		const previous = sorted[index - 1];
		if (current === undefined || previous === undefined) {
			return null;
		}
		if (current.start < previous.end) {
			return null;
		}
	}

	return sorted;
};

const applyReplacements = (
	source: string,
	replacements: ReadonlyArray<EditReplacement>
): string | null => {
	let cursor = 0;
	let output = '';

	for (const replacement of replacements) {
		if (replacement.start < cursor) return null;
		output += source.slice(cursor, replacement.start);
		output += replacement.newText;
		cursor = replacement.end;
	}

	return `${output}${source.slice(cursor)}`;
};

const reconstructEditOutput = (
	input: Record<string, unknown>,
	cwd: string
): string | null => {
	const source = readToolTargetFile(input, cwd);
	if (source === null) return null;

	const replacements = buildEditReplacements(source, input);
	if (replacements === null) return null;

	return applyReplacements(source, replacements);
};

const buildWriteOutputProjection = (
	input: Record<string, unknown>
): PatternInputProjection => {
	const parts: string[] = [];
	pushString(parts, input.content);
	if (parts.length === 0) {
		pushString(parts, input.newText);
		pushString(parts, input.newString);
	}
	return buildProjection(
		input,
		parts.length > 0 ? parts.join('\n') : undefined
	);
};

export const projectToolInput = (input: unknown): PatternInputProjection =>
	buildRawProjection(input);

export const projectToolOutputInput = (
	toolName: string,
	input: unknown,
	cwd: string
): PatternInputProjection => {
	const record = getRecord(input);

	switch (toolName) {
		case 'write':
			return buildWriteOutputProjection(record);
		case 'edit': {
			const reconstructed = reconstructEditOutput(record, cwd);
			return reconstructed === null
				? buildNewTextOnlyProjection(record)
				: buildProjection(record, reconstructed);
		}
		default:
			return buildRawProjection(input);
	}
};

export const projectToolResultInput = (
	toolName: string,
	input: unknown,
	cwd: string
): PatternInputProjection => {
	if (toolName !== 'write' && toolName !== 'edit') {
		return projectToolOutputInput(toolName, input, cwd);
	}

	const record = getRecord(input);
	const content = readToolTargetFile(record, cwd);
	return content === null
		? projectToolOutputInput(toolName, input, cwd)
		: buildProjection(record, content);
};
