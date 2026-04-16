import { make } from 'effect/unstable/reactivity/Atom';

import { UserMessage } from '../../UserMessage.ts';

export const userMessageContentNormalized = (
	message: UserMessage.Value
): string => message.content.trim().replace(/\s+/g, ' ');

export const userMessageContentNormalizedAtom = (message: UserMessage.Value) =>
	make(userMessageContentNormalized(message));
