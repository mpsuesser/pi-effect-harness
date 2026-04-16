import { make } from 'effect/unstable/reactivity/Atom';

import { UserMessage } from '../../UserMessage.ts';

export const userMessageContent = (message: UserMessage.Value): string =>
	message.content;

export const userMessageContentAtom = (message: UserMessage.Value) =>
	make(userMessageContent(message));
