import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { Predicate } from 'effect';

import { ActiveBranch } from '../../ActiveBranch.ts';

type SessionEntry = ReturnType<
	ExtensionContext['sessionManager']['getBranch']
>[number];

const textFromContentPart = (part: unknown): string | undefined => {
	if (part === null || typeof part !== 'object') {
		return undefined;
	}

	return 'text' in part && typeof part.text === 'string'
		? part.text
		: undefined;
};

const textFromMessageContent = (content: unknown): string =>
	typeof content === 'string'
		? content
		: Array.isArray(content)
		? content
			.flatMap((part) => {
				const text = textFromContentPart(part);
				return text === undefined ? [] : [text];
			})
			.join('\n')
		: '';

const fromEntry = (entry: SessionEntry) => {
	if (
		entry.type === 'message'
		&& Predicate.isReadonlyObject(entry.message)
		&& 'role' in entry.message
		&& 'content' in entry.message
		&& typeof entry.message.role === 'string'
	) {
		const content = textFromMessageContent(entry.message.content);
		return entry.message.role === 'user'
			? new ActiveBranch.UserMessageEntry({
				id: entry.id,
				content
			})
			: entry.message.role === 'assistant'
			? new ActiveBranch.AssistantMessageEntry({
				id: entry.id,
				content
			})
			: undefined;
	}

	if (entry.type === 'custom') {
		return new ActiveBranch.CustomEntry({
			id: entry.id,
			customType: entry.customType,
			...(entry.data !== undefined ? { data: entry.data } : undefined)
		});
	}

	if (entry.type === 'custom_message') {
		return new ActiveBranch.CustomMessageEntry({
			id: entry.id,
			customType: entry.customType,
			content: textFromMessageContent(entry.content),
			display: entry.display,
			...(entry.details !== undefined
				? { details: entry.details }
				: undefined)
		});
	}

	if (entry.type === 'compaction') {
		return new ActiveBranch.CompactionEntry({
			id: entry.id,
			summary: entry.summary,
			firstKeptEntryId: entry.firstKeptEntryId,
			tokensBefore: entry.tokensBefore
		});
	}

	if (entry.type === 'branch_summary') {
		return new ActiveBranch.BranchSummaryEntry({
			id: entry.id,
			fromId: entry.fromId,
			summary: entry.summary,
			...(entry.details !== undefined
				? { details: entry.details }
				: undefined)
		});
	}

	if (entry.type === 'thinking_level_change') {
		return new ActiveBranch.ThinkingLevelChangeEntry({
			id: entry.id,
			thinkingLevel: entry.thinkingLevel
		});
	}

	if (entry.type === 'model_change') {
		return new ActiveBranch.ModelChangeEntry({
			id: entry.id,
			provider: entry.provider,
			modelId: entry.modelId
		});
	}

	return undefined;
};

export const fromEntries = (entries: ReadonlyArray<SessionEntry>) =>
	new ActiveBranch.Value({
		entries: entries.flatMap((entry) => {
			const converted = fromEntry(entry);
			return converted === undefined ? [] : [converted];
		})
	});
