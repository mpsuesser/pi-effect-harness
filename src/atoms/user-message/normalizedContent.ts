import { make } from 'effect/unstable/reactivity/Atom';

import { UserMessage } from '../../UserMessage.ts';

export const normalizedContent = (message: UserMessage.Value): string =>
	message.content.trim().replace(/\s+/g, ' ');

export const atom = (message: UserMessage.Value) =>
	make(normalizedContent(message));
