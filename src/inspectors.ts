export interface PatternInputProjection {
	readonly filePath?: string;
	readonly content?: string;
	readonly command?: string;
	readonly pattern?: string;
	readonly query?: string;
	readonly url?: string;
	readonly prompt?: string;
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

const collectEditContent = (
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

export const projectToolInput = (input: unknown): PatternInputProjection => {
	const record = getRecord(input);
	const parts: string[] = [];

	pushString(parts, record.content);
	pushString(parts, record.oldText);
	pushString(parts, record.newText);
	pushString(parts, record.oldString);
	pushString(parts, record.newString);
	pushString(parts, record.command);
	pushString(parts, record.pattern);
	pushString(parts, record.query);
	pushString(parts, record.url);
	pushString(parts, record.prompt);
	collectEditContent(record, parts);

	const filePath = getFilePath(record);
	return {
		...(filePath ? { filePath } : {}),
		...(parts.length > 0 ? { content: parts.join('\n') } : {}),
		...(typeof record.command === 'string'
			? { command: record.command }
			: {}),
		...(typeof record.pattern === 'string'
			? { pattern: record.pattern }
			: {}),
		...(typeof record.query === 'string' ? { query: record.query } : {}),
		...(typeof record.url === 'string' ? { url: record.url } : {}),
		...(typeof record.prompt === 'string' ? { prompt: record.prompt } : {})
	};
};

export const extractToolResultText = (content: unknown): string => {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';

	const parts: string[] = [];
	for (const block of content) {
		const record = getRecord(block);
		if (record.type === 'text' && typeof record.text === 'string') {
			parts.push(record.text);
		}
	}
	return parts.join('\n');
};

export const projectToolResult = (
	input: unknown,
	content: unknown
): PatternInputProjection => {
	const projected = projectToolInput(input);
	const resultText = extractToolResultText(content);
	if (!resultText) return projected;

	return {
		...projected,
		content: projected.content
			? `${projected.content}\n${resultText}`
			: resultText
	};
};
