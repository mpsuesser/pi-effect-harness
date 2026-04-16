import type {
	ToolCallEvent,
	ToolResultEvent
} from '@mariozechner/pi-coding-agent';
import { Predicate } from 'effect';

import { EditReplacement } from '../../EditReplacement.ts';
import { WriteIntent } from '../../WriteIntent.ts';

const recordFromUnknown = (
	value: unknown
): Readonly<Record<string | symbol, unknown>> | undefined =>
	Predicate.isReadonlyObject(value)
		? value
		: undefined;

const stringField = (
	record: Readonly<Record<string | symbol, unknown>>,
	key: string
): string | undefined => {
	const value = record[key];
	return typeof value === 'string' ? value : undefined;
};

const replacementFromUnknown = (value: unknown) => {
	const record = recordFromUnknown(value);
	if (record === undefined) {
		return undefined;
	}

	const oldText = stringField(record, 'oldText');
	const newText = stringField(record, 'newText');
	return oldText !== undefined && newText !== undefined
		? new EditReplacement.Value({ oldText, newText })
		: undefined;
};

const replacementsFromRecord = (
	record: Readonly<Record<string | symbol, unknown>>
): ReadonlyArray<EditReplacement.Value> | undefined => {
	const edits = record.edits;
	if (!Array.isArray(edits)) {
		return undefined;
	}

	const replacements = edits.flatMap((edit) => {
		const replacement = replacementFromUnknown(edit);
		return replacement === undefined ? [] : [replacement];
	});
	return replacements.length === edits.length ? replacements : undefined;
};

const writeIntentFromUnknown = ({
	input,
	phase,
	toolName
}: {
	readonly input: unknown;
	readonly phase: 'tool_call' | 'tool_result';
	readonly toolName: 'edit' | 'write';
}) => {
	const record = recordFromUnknown(input);
	if (record === undefined) {
		return undefined;
	}

	const filePath = stringField(record, 'path');
	if (toolName === 'write') {
		const content = stringField(record, 'content');
		return content === undefined
			? undefined
			: new WriteIntent.WriteFile({
				phase,
				...(filePath !== undefined ? { filePath } : undefined),
				content
			});
	}

	const replacements = replacementsFromRecord(record);
	return replacements === undefined
		? undefined
		: new WriteIntent.EditFile({
			phase,
			...(filePath !== undefined ? { filePath } : undefined),
			replacements
		});
};

export const writeIntentFromToolCall = (event: ToolCallEvent) =>
	event.toolName === 'write' || event.toolName === 'edit'
		? writeIntentFromUnknown({
			input: event.input,
			phase: 'tool_call',
			toolName: event.toolName
		})
		: undefined;

export const writeIntentFromToolResult = (event: ToolResultEvent) =>
	event.toolName === 'write' || event.toolName === 'edit'
		? writeIntentFromUnknown({
			input: event.input,
			phase: 'tool_result',
			toolName: event.toolName
		})
		: undefined;
